import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  getDocs,
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  query,
  orderBy,
  where
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { decryptValue } from '../lib/crypto';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { getLocalCachedUsers } from '../lib/usersCache';
import { handleFirestoreError, OperationType } from '../lib/errorHandler';
import { 
  Clock, 
  Calendar, 
  Plus, 
  Trash2, 
  Search, 
  FileText, 
  TrendingUp, 
  Download, 
  CheckCircle2, 
  X, 
  FileDown,
  User,
  Users,
  Briefcase,
  MapPin,
  Settings,
  SlidersHorizontal,
  ChevronRight,
  Info,
  CalendarDays,
  PlusCircle,
  Clock3,
  Building
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { OvertimeJustification, OvertimeFunction, OvertimeArea, UserProfile } from '../types';
import { ConfirmationModal } from '../components/ui/ConfirmationModal';

const formatDateToBR = (dateStr: string): string => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};

const calculateTotalHours = (start: string, end: string): number => {
  if (!start || !end) return 0;
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  
  let diffMin = (endH * 60 + endM) - (startH * 60 + startM);
  if (diffMin < 0) {
    // Crossed midnight
    diffMin += 24 * 60;
  }
  return Number((diffMin / 60).toFixed(2));
};

export default function Overtime() {
  const { user, profile, isManager, isAdmin, isMaster } = useAuth();
  
  // Tabs: 'register' | 'history' | 'configs'
  const [activeTab, setActiveTab] = useState<'register' | 'history' | 'configs'>('register');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submittingConfig, setSubmittingConfig] = useState(false);
  
  // Data lists
  const [justifications, setJustifications] = useState<OvertimeJustification[]>([]);
  const [functions, setFunctions] = useState<OvertimeFunction[]>([]);
  const [areas, setAreas] = useState<OvertimeArea[]>([]);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);

  // Search & Filter state for History
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [filterYear, setFilterYear] = useState<string>(new Date().getFullYear().toString());
  const [filterGroup, setFilterGroup] = useState<string>('all');
  const [filterArea, setFilterArea] = useState<string>('all');
  const [filterUser, setFilterUser] = useState<string>('all');

  // Form State
  const [launchForOther, setLaunchForOther] = useState(false);
  const [selectedCollabId, setSelectedCollabId] = useState('');
  
  const [formDate, setFormDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [formStartTime, setFormStartTime] = useState<string>('07:30');
  const [formEndTime, setFormEndTime] = useState<string>('17:18');
  const [formShift, setFormShift] = useState<string>('Geral');
  const [formRoleName, setFormRoleName] = useState<string>('');
  const [formArea, setFormArea] = useState<string>('');
  const [formGroup, setFormGroup] = useState<'A' | 'B' | 'C' | 'D' | 'E' | string>('');
  const [formJustification, setFormJustification] = useState<string>('');

  // Configuration forms
  const [newFunctionName, setNewFunctionName] = useState('');
  const [newAreaName, setNewAreaName] = useState('');

  // Modals / Alerts
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [justSaved, setJustSaved] = useState<any>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirmar',
    onConfirm: () => {}
  });

  // Load baseline data (functions, areas, and users)
  useEffect(() => {
    // 1. Listen for Functions
    const unsubFuncs = onSnapshot(query(collection(db, 'overtime_functions'), orderBy('name', 'asc')), (snap) => {
      const list: OvertimeFunction[] = [];
      snap.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() } as OvertimeFunction);
      });
      setFunctions(list);
      // Auto-select first active function if none selected
      const firstActive = list.find(f => f.active);
      if (firstActive && !formRoleName) {
        setFormRoleName(firstActive.name);
      }
    }, (err) => {
      console.error('Error fetching overtime functions:', err);
    });

    // 2. Listen for Areas
    const unsubAreas = onSnapshot(query(collection(db, 'overtime_areas'), orderBy('name', 'asc')), (snap) => {
      const list: OvertimeArea[] = [];
      snap.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() } as OvertimeArea);
      });
      setAreas(list);
      // Auto-select first active area if none selected
      const firstActive = list.find(a => a.active);
      if (firstActive && !formArea) {
        setFormArea(firstActive.name);
      }
    }, (err) => {
      console.error('Error fetching overtime areas:', err);
    });

    // 3. Listen for users if admin/master/manager
    let unsubUsers = () => {};
    if (isAdmin || isMaster || isManager) {
      // Immediate cached render
      const cached = getLocalCachedUsers();
      if (cached.length > 0) {
        const approvedList = cached
          .filter(u => u.status === 'approved' && u.email?.toLowerCase().trim() !== 'jacksonbjr@gmail.com')
          .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
        setUsersList(approvedList as any[]);
      }

      unsubUsers = onSnapshot(collection(db, 'users'), async (snap) => {
        const listPromises = snap.docs.map(async (docSnap) => {
          const data = docSnap.data();
          const decName = await decryptValue(data.displayName);
          const decEmail = await decryptValue(data.email);
          return {
            uid: docSnap.id,
            ...data,
            displayName: decName,
            email: decEmail,
          } as UserProfile;
        });
        const fullList = await Promise.all(listPromises);
        const approvedList = fullList.filter(u => u.status === 'approved' && u.email?.toLowerCase().trim() !== 'jacksonbjr@gmail.com');
        
        // Sort users alphabetically
        approvedList.sort((a, b) => a.displayName.localeCompare(b.displayName));
        setUsersList(approvedList);
      }, (err) => {
        handleFirestoreError(err, OperationType.LIST, 'users');
      });
    }

    return () => {
      unsubFuncs();
      unsubAreas();
      unsubUsers();
    };
  }, [isAdmin, isMaster, isManager]);

  // Load and listen to Overtime Justifications
  useEffect(() => {
    if (!user) return;

    let q = query(collection(db, 'overtime_justifications'), orderBy('date', 'desc'));
    
    // Non-managers/admins can only see their own justifications
    if (!isManager && !isAdmin && !isMaster) {
      q = query(
        collection(db, 'overtime_justifications'), 
        where('userId', '==', user.uid),
        orderBy('date', 'desc')
      );
    }

    const unsubJusts = onSnapshot(q, async (snap) => {
      const listPromises = snap.docs.map(async (docSnap) => {
        const data = docSnap.data() as any;
        const decUserName = await decryptValue(data.userName);
        const decCreatedByName = await decryptValue(data.createdByName);
        return {
          id: docSnap.id,
          ...data,
          userName: decUserName,
          createdByName: decCreatedByName,
        } as OvertimeJustification;
      });
      const list = await Promise.all(listPromises);
      setJustifications(list);
      setLoading(false);
    }, (err) => {
      console.error('Error listening to overtime justifications:', err);
      handleFirestoreError(err, OperationType.LIST, 'overtime_justifications');
      setLoading(false);
    });

    return () => unsubJusts();
  }, [user, isManager, isAdmin, isMaster]);

  // Prefill default form values from current profile when not launching for other
  useEffect(() => {
    if (!launchForOther && profile) {
      setFormGroup(profile.group || 'A');
    }
  }, [profile, launchForOther]);

  // When launchForOther is toggled or other collaborator is selected, update fields
  const handleCollabChange = (uid: string) => {
    setSelectedCollabId(uid);
    const selectedUser = usersList.find(u => u.uid === uid);
    if (selectedUser) {
      setFormGroup(selectedUser.group || 'A');
    }
  };

  // Submit Overtime Justification
  const handleSubmitJustification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!formRoleName) {
      alert('Por favor, cadastre ou selecione uma Função.');
      return;
    }
    if (!formArea) {
      alert('Por favor, cadastre ou selecione uma Área.');
      return;
    }
    if (!formJustification.trim()) {
      alert('Por favor, descreva o motivo/justificativa para a hora extra.');
      return;
    }

    setSubmitting(true);
    
    let targetUid = user.uid;
    let targetName = profile?.displayName || user.displayName || 'Colaborador';
    let targetGroup = formGroup || profile?.group || 'A';

    // If launching for other collaborator (admin/master only)
    if (launchForOther && (isManager || isAdmin || isMaster)) {
      if (!selectedCollabId) {
        alert('Por favor, selecione o colaborador.');
        setSubmitting(false);
        return;
      }
      const collab = usersList.find(u => u.uid === selectedCollabId);
      if (collab) {
        targetUid = collab.uid;
        targetName = collab.displayName;
        targetGroup = formGroup || collab.group || 'A';
      }
    }

    const hours = calculateTotalHours(formStartTime, formEndTime);

    const justificationPayload = {
      userId: targetUid,
      userName: targetName,
      group: targetGroup,
      roleName: formRoleName,
      shift: formShift,
      date: formDate,
      startTime: formStartTime,
      endTime: formEndTime,
      totalHours: hours,
      area: formArea,
      justification: formJustification,
      createdBy: user.uid,
      createdByName: profile?.displayName || 'Administrador',
      createdAt: serverTimestamp()
    };

    try {
      const docRef = await addDoc(collection(db, 'overtime_justifications'), justificationPayload);
      
      // Save for success dialog
      setJustSaved({
        id: docRef.id,
        ...justificationPayload,
        createdAt: new Date()
      });

      // Reset Form fields (except function and area to preserve operational context)
      setFormJustification('');
      setFormDate(new Date().toISOString().split('T')[0]);
      if (launchForOther) {
        setSelectedCollabId('');
      }

      setShowSuccessModal(true);
    } catch (err) {
      console.error('Error saving overtime justification:', err);
      handleFirestoreError(err, OperationType.CREATE, 'overtime_justifications');
    } finally {
      setSubmitting(false);
    }
  };

  // Add configuration function
  const handleAddFunction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFunctionName.trim()) return;

    setSubmittingConfig(true);
    try {
      await addDoc(collection(db, 'overtime_functions'), {
        name: newFunctionName.trim(),
        active: true,
        createdAt: serverTimestamp()
      });
      setNewFunctionName('');
    } catch (err) {
      console.error('Error creating function:', err);
      alert('Erro ao criar função: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSubmittingConfig(false);
    }
  };

  // Toggle Function Active State
  const handleToggleFunction = async (id: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'overtime_functions', id), {
        active: !currentStatus
      });
    } catch (err) {
      console.error('Error updating function status:', err);
      alert('Erro ao atualizar status da função: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Delete Function
  const handleDeleteFunction = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Função',
      message: 'Deseja realmente excluir esta função operacional?',
      confirmText: 'Excluir',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'overtime_functions', id));
        } catch (err) {
          console.error('Error deleting function:', err);
          alert('Erro ao excluir função: ' + (err instanceof Error ? err.message : String(err)));
        }
      }
    });
  };

  // Add configuration area
  const handleAddArea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAreaName.trim()) return;

    setSubmittingConfig(true);
    try {
      await addDoc(collection(db, 'overtime_areas'), {
        name: newAreaName.trim(),
        active: true,
        createdAt: serverTimestamp()
      });
      setNewAreaName('');
    } catch (err) {
      console.error('Error creating area:', err);
      alert('Erro ao criar área: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSubmittingConfig(false);
    }
  };

  // Toggle Area Active State
  const handleToggleArea = async (id: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'overtime_areas', id), {
        active: !currentStatus
      });
    } catch (err) {
      console.error('Error updating area status:', err);
      alert('Erro ao atualizar status da área: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Delete Area
  const handleDeleteArea = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Área/Setor',
      message: 'Deseja realmente excluir esta área / setor?',
      confirmText: 'Excluir',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'overtime_areas', id));
        } catch (err) {
          console.error('Error deleting area:', err);
          alert('Erro ao excluir área: ' + (err instanceof Error ? err.message : String(err)));
        }
      }
    });
  };

  // Delete justification
  const handleDeleteJustification = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Justificativa',
      message: 'Deseja realmente excluir esta justificativa de hora extra?',
      confirmText: 'Excluir',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'overtime_justifications', id));
        } catch (err) {
          console.error('Error deleting justification:', err);
          handleFirestoreError(err, OperationType.DELETE, 'overtime_justifications');
        }
      }
    });
  };

  // Filter justifications list based on parameters
  const filteredJustifications = useMemo(() => {
    return justifications.filter(item => {
      // 1. Date parsing for month and year filtering
      if (item.date) {
        const [year, month] = item.date.split('-');
        if (filterYear !== 'all' && year !== filterYear) return false;
        if (filterMonth !== 'all' && month !== filterMonth) return false;
      } else {
        return false; // date is required
      }

      // 2. Group/Letra
      if (filterGroup !== 'all' && item.group !== filterGroup) return false;

      // 3. Area
      if (filterArea !== 'all' && item.area !== filterArea) return false;

      // 4. User ID (Admin/Manager filter)
      if (filterUser !== 'all' && item.userId !== filterUser) return false;

      // 5. Search text (name, function, or explanation)
      if (searchTerm.trim() !== '') {
        const queryClean = searchTerm.toLowerCase();
        const matchesName = item.userName?.toLowerCase().includes(queryClean);
        const matchesRole = item.roleName?.toLowerCase().includes(queryClean);
        const matchesJust = item.justification?.toLowerCase().includes(queryClean);
        const matchesArea = item.area?.toLowerCase().includes(queryClean);
        if (!matchesName && !matchesRole && !matchesJust && !matchesArea) return false;
      }

      return true;
    });
  }, [justifications, filterMonth, filterYear, filterGroup, filterArea, filterUser, searchTerm]);

  // Statistics summaries
  const stats = useMemo(() => {
    const totalHours = filteredJustifications.reduce((sum, item) => sum + (item.totalHours || 0), 0);
    const count = filteredJustifications.length;
    const average = count > 0 ? Number((totalHours / count).toFixed(1)) : 0;
    
    // Top users
    const userHoursMap: Record<string, number> = {};
    filteredJustifications.forEach(item => {
      userHoursMap[item.userName] = (userHoursMap[item.userName] || 0) + (item.totalHours || 0);
    });

    const topCollaborators = Object.entries(userHoursMap)
      .map(([name, hrs]) => ({ name, hours: Number(hrs.toFixed(1)) }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 5);

    return {
      totalHours: Number(totalHours.toFixed(1)),
      count,
      average,
      topCollaborators
    };
  }, [filteredJustifications]);

  // PDF Export
  const handleExportPDF = () => {
    const docPdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Header
    docPdf.setFillColor(16, 185, 129); // emerald-500
    docPdf.rect(0, 0, 210, 35, 'F');

    docPdf.setTextColor(255, 255, 255);
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(18);
    docPdf.text('RELATÓRIO DE JUSTIFICATIVAS DE HORA-EXTRA (HE)', 15, 15);
    
    docPdf.setFont('helvetica', 'normal');
    docPdf.setFontSize(10);
    const filterDesc = `Filtros Aplicados: Ano ${filterYear} | Mês ${filterMonth === 'all' ? 'Todos' : filterMonth} | Grupo/Letra: ${filterGroup === 'all' ? 'Todos' : filterGroup} | Área: ${filterArea === 'all' ? 'Todas' : filterArea}`;
    docPdf.text(filterDesc, 15, 22);
    docPdf.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')} por ${profile?.displayName || 'Sistema'}`, 15, 28);

    // Summary block
    docPdf.setFillColor(241, 245, 249); // slate-100
    docPdf.roundedRect(15, 42, 180, 24, 3, 3, 'F');
    
    docPdf.setTextColor(15, 23, 42); // slate-900
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(10);
    docPdf.text('RESUMO GERAL DO PERÍODO', 20, 48);

    docPdf.setFont('helvetica', 'normal');
    docPdf.text(`Total de Horas Lançadas: ${stats.totalHours} hrs`, 20, 54);
    docPdf.text(`Quantidade de Justificativas: ${stats.count}`, 20, 60);
    docPdf.text(`Média de Horas por Lançamento: ${stats.average} hrs`, 110, 54);

    // Table
    const tableData = filteredJustifications.map((item, index) => [
      index + 1,
      formatDateToBR(item.date),
      item.userName || '',
      `Letra ${item.group || ''}`,
      item.roleName || '',
      item.area || '',
      `${item.startTime} - ${item.endTime}`,
      `${item.totalHours} hrs`,
      item.justification || ''
    ]);

    autoTable(docPdf, {
      startY: 73,
      head: [['#', 'Data', 'Nome', 'Letra', 'Função', 'Área', 'Horário', 'Total', 'Justificativa']],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [15, 23, 42], // slate-900
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 2,
        valign: 'middle'
      },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 16 },
        2: { cellWidth: 28 },
        3: { cellWidth: 14 },
        4: { cellWidth: 22 },
        5: { cellWidth: 22 },
        6: { cellWidth: 20 },
        7: { cellWidth: 14, fontStyle: 'bold' },
        8: { cellWidth: 36 }
      }
    });

    docPdf.save(`relatorio_he_${filterYear}_${filterMonth}.pdf`);
  };

  // Generate individual entry PDF receipt
  const handleExportReceiptPDF = (item: OvertimeJustification) => {
    const docPdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a5'
    });

    // Border
    docPdf.setDrawColor(226, 232, 240);
    docPdf.rect(5, 5, 138, 200);

    // Header logo bar
    docPdf.setFillColor(15, 23, 42); // slate-900
    docPdf.rect(5, 5, 138, 20, 'F');
    
    docPdf.setTextColor(255, 255, 255);
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(12);
    docPdf.text('COMPROVANTE DE JUSTIFICATIVA - HE', 12, 17);

    // Metadata
    docPdf.setTextColor(100, 116, 139); // slate-500
    docPdf.setFont('helvetica', 'normal');
    docPdf.setFontSize(8);
    docPdf.text(`ID do Registro: ${item.id}`, 12, 32);
    docPdf.text(`Registrado em: ${item.createdAt?.toDate ? item.createdAt.toDate().toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR')}`, 12, 37);

    // Separator
    docPdf.setDrawColor(241, 245, 249);
    docPdf.line(12, 42, 136, 42);

    // Content fields
    docPdf.setTextColor(15, 23, 42);
    docPdf.setFontSize(10);
    
    // Label and Value pairs helper
    const drawField = (label: string, value: string, y: number) => {
      docPdf.setFont('helvetica', 'bold');
      docPdf.text(label, 12, y);
      docPdf.setFont('helvetica', 'normal');
      docPdf.text(value, 48, y);
    };

    drawField('Colaborador:', item.userName || '', 52);
    drawField('Letra:', item.group || '', 60);
    drawField('Função:', item.roleName || '', 68);
    drawField('Turno:', item.shift || '', 76);
    drawField('Data da HE:', formatDateToBR(item.date), 84);
    drawField('Horário:', `${item.startTime} às ${item.endTime}`, 92);
    
    // Highlight hours
    docPdf.setFillColor(236, 253, 245); // emerald-50
    docPdf.roundedRect(12, 100, 124, 14, 2, 2, 'F');
    docPdf.setTextColor(5, 150, 105); // emerald-600
    docPdf.setFont('helvetica', 'bold');
    docPdf.text(`Carga Horária Total: ${item.totalHours} Horas`, 16, 109);

    // Justification box
    docPdf.setTextColor(15, 23, 42);
    docPdf.text('Justificativa:', 12, 125);
    docPdf.setFont('helvetica', 'normal');
    docPdf.setFontSize(9);
    
    // Multiline split for textarea content
    const splitJust = docPdf.splitTextToSize(item.justification || '', 120);
    docPdf.text(splitJust, 12, 132);

    // Footer signatures placeholder
    docPdf.setDrawColor(203, 213, 225);
    docPdf.line(15, 175, 65, 175);
    docPdf.line(83, 175, 133, 175);
    
    docPdf.setFontSize(7.5);
    docPdf.setTextColor(100, 116, 139);
    docPdf.text('Assinatura do Colaborador', 22, 180);
    docPdf.text('Assinatura da Supervisão', 91, 180);

    docPdf.setFont('helvetica', 'italic');
    docPdf.setFontSize(7);
    docPdf.text('Documento gerado eletronicamente no aplicativo SecApp.', 40, 195);

    docPdf.save(`comprovante_he_${item.date}_${item.userName?.replace(/\s+/g, '_')}.pdf`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
              <Clock className="w-6 h-6" />
            </div>
            Justificativa de Hora-Extra (HE)
          </h1>
          <p className="text-slate-500 font-bold text-sm mt-1">
            Lance, visualize e valide as justificativas de horas extras operacionalizadas.
          </p>
        </div>

        {/* Export Button for Admin/Managers */}
        {(isManager || isAdmin || isMaster) && activeTab === 'history' && (
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-5 py-3 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition-all shadow-md shadow-emerald-200 text-sm cursor-pointer"
          >
            <FileDown className="w-4 h-4" />
            Exportar Relatório PDF
          </button>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 mb-8 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('register')}
          className={cn(
            "px-6 py-3 font-bold text-sm border-b-2 transition-all flex items-center gap-2 shrink-0 cursor-pointer",
            activeTab === 'register'
              ? "border-emerald-500 text-emerald-600"
              : "border-transparent text-slate-400 hover:text-slate-600"
          )}
        >
          <PlusCircle className="w-4 h-4" />
          Lançar Nova Justificativa
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={cn(
            "px-6 py-3 font-bold text-sm border-b-2 transition-all flex items-center gap-2 shrink-0 cursor-pointer",
            activeTab === 'history'
              ? "border-emerald-500 text-emerald-600"
              : "border-transparent text-slate-400 hover:text-slate-600"
          )}
        >
          <CalendarDays className="w-4 h-4" />
          {isManager || isAdmin || isMaster ? "Histórico Geral & Resumo" : "Minhas Justificativas"}
        </button>
        {(isManager || isAdmin || isMaster) && (
          <button
            onClick={() => setActiveTab('configs')}
            className={cn(
              "px-6 py-3 font-bold text-sm border-b-2 transition-all flex items-center gap-2 shrink-0 cursor-pointer",
              activeTab === 'configs'
                ? "border-emerald-500 text-emerald-600"
                : "border-transparent text-slate-400 hover:text-slate-600"
            )}
          >
            <Settings className="w-4 h-4" />
            Parâmetros (Funções & Áreas)
          </button>
        )}
      </div>

      {/* Main Content Areas */}
      <AnimatePresence mode="wait">
        {/* TAB 1: REGISTER */}
        {activeTab === 'register' && (
          <motion.div
            key="register-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
            {/* Left side Form (span 2 on large screens) */}
            <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200/80 shadow-sm p-6 sm:p-8">
              <h2 className="text-xl font-black text-slate-900 mb-6 tracking-tight flex items-center gap-2">
                Preencha os dados do lançamento
              </h2>

              <form onSubmit={handleSubmitJustification} className="space-y-6">
                {/* Admin-only Switch to launch for others */}
                {(isManager || isAdmin || isMaster) && (
                  <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Users className="w-5 h-5 text-slate-500" />
                      <div>
                        <p className="text-sm font-bold text-slate-800">Lançar para outro colaborador</p>
                        <p className="text-xs text-slate-500 font-medium">Permitido para Gestores, Administradores e Masters</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={launchForOther} 
                        onChange={(e) => {
                          setLaunchForOther(e.target.checked);
                          if (!e.target.checked) setSelectedCollabId('');
                        }}
                        className="sr-only peer" 
                      />
                      <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-focus:ring-2 peer-focus:ring-emerald-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                  </div>
                )}

                {/* Grid Inputs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Prefilled or collaborator Select */}
                  {launchForOther && (isManager || isAdmin || isMaster) ? (
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                        Selecionar Colaborador
                      </label>
                      <select
                        required
                        value={selectedCollabId}
                        onChange={(e) => handleCollabChange(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800"
                      >
                        <option value="">Selecione...</option>
                        {usersList.map(u => (
                          <option key={u.uid} value={u.uid}>
                            {u.displayName} ({u.email})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                        Nome do Colaborador
                      </label>
                      <input
                        type="text"
                        disabled
                        value={profile?.displayName || user?.displayName || 'Carregando...'}
                        className="w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded-2xl font-bold text-slate-500 outline-none"
                      />
                    </div>
                  )}

                  {/* Group/Letra Selection */}
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                      Letra / Grupo de Turno
                    </label>
                    <select
                      required
                      value={formGroup}
                      onChange={(e) => setFormGroup(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800"
                    >
                      <option value="">Selecione...</option>
                      {['A', 'B', 'C', 'D', 'E', 'Geral'].map(g => (
                        <option key={g} value={g}>Letra {g}</option>
                      ))}
                    </select>
                  </div>

                  {/* Function Select */}
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                      Função operacional
                    </label>
                    {functions.length > 0 ? (
                      <select
                        required
                        value={formRoleName}
                        onChange={(e) => setFormRoleName(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800"
                      >
                        <option value="">Selecione...</option>
                        {functions.filter(f => f.active).map(f => (
                          <option key={f.id} value={f.name}>{f.name}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="text-xs text-amber-600 bg-amber-50 rounded-xl p-3 border border-amber-100 flex items-start gap-2">
                        <Info className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>Nenhuma função ativa cadastrada no sistema. Cadastre novas funções na aba de "Parâmetros".</span>
                      </div>
                    )}
                  </div>

                  {/* Area Select */}
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                      Área de Trabalho / Setor
                    </label>
                    {areas.length > 0 ? (
                      <select
                        required
                        value={formArea}
                        onChange={(e) => setFormArea(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800"
                      >
                        <option value="">Selecione...</option>
                        {areas.filter(a => a.active).map(a => (
                          <option key={a.id} value={a.name}>{a.name}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="text-xs text-amber-600 bg-amber-50 rounded-xl p-3 border border-amber-100 flex items-start gap-2">
                        <Info className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>Nenhuma área ativa cadastrada no sistema. Cadastre novas áreas na aba de "Parâmetros".</span>
                      </div>
                    )}
                  </div>

                  {/* Date of Overtime */}
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                      Data da Realização da HE
                    </label>
                    <input
                      type="date"
                      required
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  {/* Shift Select */}
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                      Turno Vigente
                    </label>
                    <select
                      required
                      value={formShift}
                      onChange={(e) => setFormShift(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800"
                    >
                      <option value="Turno 1">Turno 1 (00:00 - 08:00)</option>
                      <option value="Turno 2">Turno 2 (08:00 - 16:00)</option>
                      <option value="Turno 3">Turno 3 (16:00 - 00:00)</option>
                      <option value="ADM">ADM / Geral</option>
                    </select>
                  </div>

                  {/* Start time */}
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                      Horário de Início
                    </label>
                    <input
                      type="time"
                      required
                      value={formStartTime}
                      onChange={(e) => setFormStartTime(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  {/* End time */}
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                      Horário de Término
                    </label>
                    <input
                      type="time"
                      required
                      value={formEndTime}
                      onChange={(e) => setFormEndTime(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {/* Display total computed hours */}
                <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4 flex items-center justify-between text-emerald-800">
                  <div className="flex items-center gap-3">
                    <Clock3 className="w-5 h-5 text-emerald-600" />
                    <span className="font-bold text-sm">Carga horária total calculada:</span>
                  </div>
                  <span className="text-xl font-black">{calculateTotalHours(formStartTime, formEndTime)} Horas</span>
                </div>

                {/* Justification Textarea */}
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                    Justificativa da Hora Extra (Atividade Realizada)
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={formJustification}
                    onChange={(e) => setFormJustification(e.target.value)}
                    placeholder="Descreva detalhadamente o motivo da realização das horas extras e as atividades executadas..."
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-4 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 disabled:bg-emerald-300 transition-all shadow-lg shadow-emerald-100 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {submitting ? 'Salvando...' : 'Registrar Justificativa'}
                </button>
              </form>
            </div>

            {/* Right side instruction panel */}
            <div className="space-y-6">
              <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <Clock className="w-24 h-24" />
                </div>
                <h3 className="text-lg font-black tracking-tight mb-3">
                  Como funciona?
                </h3>
                <ul className="space-y-3.5 text-xs text-slate-300 font-bold leading-relaxed">
                  <li className="flex items-start gap-3">
                    <ChevronRight className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>Lançamentos de HE devem ser justificados individualmente e no próprio dia de ocorrência.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <ChevronRight className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>A carga horária é calculada automaticamente com base nos horários de início e término inseridos.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <ChevronRight className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>O sistema suporta cruzamento de meia-noite automaticamente.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <ChevronRight className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>Administradores ou Masters podem registrar horas extras retroativas em nome de qualquer colaborador aprovado.</span>
                  </li>
                </ul>
              </div>

              {/* Quick stats panel for operator */}
              <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-6">
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                  Meu resumo recente
                </h4>
                {loading ? (
                  <div className="h-20 flex items-center justify-center text-slate-400 font-medium text-xs">Carregando dados...</div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center py-2.5 border-b border-slate-100">
                      <span className="text-xs text-slate-500 font-bold">Total de Lançamentos:</span>
                      <span className="text-sm font-black text-slate-800">
                        {justifications.filter(j => j.userId === user?.uid).length} registros
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2.5">
                      <span className="text-xs text-slate-500 font-bold">Total de Horas Extra:</span>
                      <span className="text-sm font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-xl">
                        {justifications.filter(j => j.userId === user?.uid).reduce((sum, item) => sum + (item.totalHours || 0), 0).toFixed(1)} hrs
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* TAB 2: HISTORY */}
        {activeTab === 'history' && (
          <motion.div
            key="history-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* Cards metrics top row for Managers/Admins/Masters */}
            {(isManager || isAdmin || isMaster) && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Horas Extras Totais</p>
                    <h3 className="text-2xl font-black text-emerald-600 tracking-tight">{stats.totalHours} hrs</h3>
                    <p className="text-xs text-slate-500 mt-0.5 font-bold">No período selecionado</p>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                </div>

                <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Justificativas</p>
                    <h3 className="text-2xl font-black text-slate-900 tracking-tight">{stats.count} lançamentos</h3>
                    <p className="text-xs text-slate-500 mt-0.5 font-bold">Registrados no sistema</p>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-600">
                    <FileText className="w-6 h-6" />
                  </div>
                </div>

                <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Média por Colaborador</p>
                    <h3 className="text-2xl font-black text-blue-600 tracking-tight">{stats.average} hrs</h3>
                    <p className="text-xs text-slate-500 mt-0.5 font-bold">Média por registro</p>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                    <Clock3 className="w-6 h-6" />
                  </div>
                </div>
              </div>
            )}

            {/* Filter controls panel */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-slate-500" />
                  Filtros e Pesquisa
                </h3>
                {(isManager || isAdmin || isMaster) && (
                  <span className="text-xs text-slate-500 font-bold">
                    {filteredJustifications.length} de {justifications.length} lançamentos encontrados
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Search query input */}
                <div className="relative md:col-span-2">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Pesquisar por nome, justificativa, função..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Filter Month */}
                <div className="flex gap-2">
                  <select
                    value={filterYear}
                    onChange={(e) => setFilterYear(e.target.value)}
                    className="w-1/2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="all">Ano: Todos</option>
                    {['2024', '2025', '2026', '2027'].map(yr => (
                      <option key={yr} value={yr}>{yr}</option>
                    ))}
                  </select>

                  <select
                    value={filterMonth}
                    onChange={(e) => setFilterMonth(e.target.value)}
                    className="w-1/2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="all">Mês: Todos</option>
                    {[
                      { v: '01', l: 'Jan' },
                      { v: '02', l: 'Fev' },
                      { v: '03', l: 'Mar' },
                      { v: '04', l: 'Abr' },
                      { v: '05', l: 'Mai' },
                      { v: '06', l: 'Jun' },
                      { v: '07', l: 'Jul' },
                      { v: '08', l: 'Ago' },
                      { v: '09', l: 'Set' },
                      { v: '10', l: 'Out' },
                      { v: '11', l: 'Nov' },
                      { v: '12', l: 'Dez' },
                    ].map(m => (
                      <option key={m.v} value={m.v}>{m.l}</option>
                    ))}
                  </select>
                </div>

                {/* Filter Letra/Group */}
                <div>
                  <select
                    value={filterGroup}
                    onChange={(e) => setFilterGroup(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="all">Grupo: Todos</option>
                    {['A', 'B', 'C', 'D', 'E', 'Geral'].map(g => (
                      <option key={g} value={g}>Letra {g}</option>
                    ))}
                  </select>
                </div>

                {/* Filter Area */}
                {(isManager || isAdmin || isMaster) && (
                  <>
                    <div>
                      <select
                        value={filterArea}
                        onChange={(e) => setFilterArea(e.target.value)}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="all">Área: Todas</option>
                        {areas.map(a => (
                          <option key={a.id} value={a.name}>{a.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Filter User */}
                    <div>
                      <select
                        value={filterUser}
                        onChange={(e) => setFilterUser(e.target.value)}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="all">Colaborador: Todos</option>
                        {usersList.map(u => (
                          <option key={u.uid} value={u.uid}>{u.displayName}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* List and Statistics Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              {/* Table of logs (span 3 on large screens) */}
              <div className="lg:col-span-3 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                {loading ? (
                  <div className="p-12 text-center text-slate-400 font-bold text-sm">Carregando histórico...</div>
                ) : filteredJustifications.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 font-bold text-sm flex flex-col items-center justify-center gap-2">
                    <Info className="w-8 h-8 text-slate-300" />
                    <span>Nenhum registro de justificativa de hora extra encontrado para os filtros selecionados.</span>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/75">
                          <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-wider pl-6">Data</th>
                          <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-wider">Colaborador</th>
                          <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-wider">Letra</th>
                          <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-wider">Função / Área</th>
                          <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-wider">Horário</th>
                          <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-wider text-center">Horas</th>
                          <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-wider text-right pr-6">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredJustifications.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50/50 transition-colors text-xs font-bold text-slate-700">
                            {/* Date */}
                            <td className="p-4 pl-6 whitespace-nowrap text-slate-900">{formatDateToBR(item.date)}</td>
                            
                            {/* Collaborator */}
                            <td className="p-4">
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-900">{item.userName}</span>
                                <span className="text-[10px] text-slate-400 font-medium">Cadastrado por: {item.createdByName || 'N/A'}</span>
                              </div>
                            </td>

                            {/* Letra/Group */}
                            <td className="p-4 whitespace-nowrap">
                              <span className="px-2 py-1 rounded bg-slate-100 text-slate-700 text-[10px] uppercase font-black">
                                {item.group}
                              </span>
                            </td>

                            {/* Function / Area */}
                            <td className="p-4">
                              <div className="flex flex-col">
                                <span className="text-slate-800">{item.roleName}</span>
                                <span className="text-[10px] text-slate-400 font-medium">{item.area}</span>
                              </div>
                            </td>

                            {/* Time */}
                            <td className="p-4 whitespace-nowrap font-medium text-slate-500">
                              {item.startTime} - {item.endTime}
                            </td>

                            {/* Hours badge */}
                            <td className="p-4 text-center whitespace-nowrap">
                              <span className="px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-700 font-black">
                                {item.totalHours} hrs
                              </span>
                            </td>

                            {/* Actions */}
                            <td className="p-4 pr-6 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleExportReceiptPDF(item)}
                                  title="Exportar Comprovante PDF"
                                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-900 transition-all cursor-pointer"
                                >
                                  <Download className="w-4 h-4" />
                                </button>
                                {(isMaster || isManager || isAdmin || item.userId === user?.uid) && (
                                  <button
                                    onClick={() => handleDeleteJustification(item.id)}
                                    title="Excluir"
                                    className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-600 transition-all cursor-pointer"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Sidebar top hours table for Managers/Admins/Masters */}
              {(isManager || isAdmin || isMaster) && (
                <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-6">
                  <div>
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-slate-500" />
                      Individual Ranking (Top 5)
                    </h3>
                    <div className="space-y-3">
                      {stats.topCollaborators.length === 0 ? (
                        <div className="text-xs text-slate-400 font-medium py-3">Sem dados disponíveis</div>
                      ) : (
                        stats.topCollaborators.map((collab, idx) => (
                          <div key={idx} className="flex justify-between items-center text-xs">
                            <div className="flex items-center gap-2 font-bold text-slate-700 overflow-hidden shrink">
                              <span className="w-4 text-slate-400">{idx + 1}.</span>
                              <span className="truncate">{collab.name}</span>
                            </div>
                            <span className="font-black text-slate-900 shrink-0 pl-2">{collab.hours} hrs</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <hr className="border-slate-100" />

                  {/* Operational instructions */}
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/40 text-slate-600">
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
                      <Info className="w-3.5 h-3.5" />
                      Exportação e Conferência
                    </h4>
                    <p className="text-[11px] font-medium leading-relaxed">
                      Utilize o botão principal <strong>"Exportar Relatório PDF"</strong> no cabeçalho superior para extrair a lista compilada para controle de folha de pagamento corporativo.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* TAB 3: CONFIGURATIONS (ADMIN & MASTER ONLY) */}
        {activeTab === 'configs' && (isManager || isAdmin || isMaster) && (
          <motion.div
            key="configs-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-8"
          >
            {/* Functions positions section */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-emerald-500" />
                  Gerenciar Funções Operacionais
                </h3>
                <p className="text-xs text-slate-500 font-bold mt-1">
                  Defina quais cargos e funções estão disponíveis para justificativa de HE.
                </p>
              </div>

              {/* Form to add new function */}
              <form onSubmit={handleAddFunction} className="flex gap-2">
                <input
                  type="text"
                  required
                  placeholder="Ex: Operador de Secagem I"
                  value={newFunctionName}
                  onChange={(e) => setNewFunctionName(e.target.value)}
                  className="flex-grow px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="submit"
                  disabled={submittingConfig}
                  className="px-4 py-2.5 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 text-xs transition-all cursor-pointer"
                >
                  Adicionar
                </button>
              </form>

              {/* Functions List */}
              <div className="space-y-2 max-h-80 overflow-y-auto pr-2 scrollbar-thin">
                {functions.length === 0 ? (
                  <div className="text-xs text-slate-400 font-bold py-6 text-center">Nenhuma função cadastrada.</div>
                ) : (
                  functions.map(item => (
                    <div 
                      key={item.id} 
                      className={cn(
                        "flex items-center justify-between p-3.5 rounded-2xl border text-xs font-bold transition-all",
                        item.active ? "bg-white border-slate-200" : "bg-slate-50 border-slate-200 text-slate-400"
                      )}
                    >
                      <span className="truncate">{item.name}</span>
                      <div className="flex items-center gap-3 shrink-0">
                        {/* Toggle Status switch */}
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={item.active} 
                            onChange={() => handleToggleFunction(item.id, item.active)}
                            className="sr-only peer" 
                          />
                          <div className="w-8 h-4.5 bg-slate-200 rounded-full peer peer-focus:ring-1 peer-focus:ring-emerald-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-emerald-500"></div>
                        </label>
                        <button
                          onClick={() => handleDeleteFunction(item.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Areas section */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <Building className="w-5 h-5 text-emerald-500" />
                  Gerenciar Áreas / Setores
                </h3>
                <p className="text-xs text-slate-500 font-bold mt-1">
                  Defina quais setores estão disponíveis no formulário de justificativa de HE.
                </p>
              </div>

              {/* Form to add new area */}
              <form onSubmit={handleAddArea} className="flex gap-2">
                <input
                  type="text"
                  required
                  placeholder="Ex: Secagem / Enfardamento"
                  value={newAreaName}
                  onChange={(e) => setNewAreaName(e.target.value)}
                  className="flex-grow px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="submit"
                  disabled={submittingConfig}
                  className="px-4 py-2.5 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 text-xs transition-all cursor-pointer"
                >
                  Adicionar
                </button>
              </form>

              {/* Areas List */}
              <div className="space-y-2 max-h-80 overflow-y-auto pr-2 scrollbar-thin">
                {areas.length === 0 ? (
                  <div className="text-xs text-slate-400 font-bold py-6 text-center">Nenhuma área cadastrada.</div>
                ) : (
                  areas.map(item => (
                    <div 
                      key={item.id} 
                      className={cn(
                        "flex items-center justify-between p-3.5 rounded-2xl border text-xs font-bold transition-all",
                        item.active ? "bg-white border-slate-200" : "bg-slate-50 border-slate-200 text-slate-400"
                      )}
                    >
                      <span className="truncate">{item.name}</span>
                      <div className="flex items-center gap-3 shrink-0">
                        {/* Toggle Status switch */}
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={item.active} 
                            onChange={() => handleToggleArea(item.id, item.active)}
                            className="sr-only peer" 
                          />
                          <div className="w-8 h-4.5 bg-slate-200 rounded-full peer peer-focus:ring-1 peer-focus:ring-emerald-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-emerald-500"></div>
                        </label>
                        <button
                          onClick={() => handleDeleteArea(item.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SUCCESS POPUP MODAL */}
      <AnimatePresence>
        {showSuccessModal && justSaved && (
          <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2.5rem] border border-slate-200 max-w-md w-full p-8 text-center shadow-2xl relative overflow-hidden"
            >
              <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <h3 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">Justificativa Registrada!</h3>
              <p className="text-slate-500 font-bold text-xs leading-relaxed mb-6">
                A justificativa de hora extra foi salva com sucesso no banco de dados e está compilada no histórico geral.
              </p>

              {/* Simple Details box */}
              <div className="bg-slate-50 rounded-2xl p-4 mb-6 text-left text-xs font-bold text-slate-600 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">Colaborador:</span>
                  <span className="text-slate-900 truncate max-w-[180px]">{justSaved.userName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Data da HE:</span>
                  <span className="text-slate-900">{formatDateToBR(justSaved.date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Horário:</span>
                  <span className="text-slate-900">{justSaved.startTime} - {justSaved.endTime}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200/60 pt-2 mt-2">
                  <span className="text-emerald-600">Total de Horas:</span>
                  <span className="text-emerald-700 font-black">{justSaved.totalHours} Horas</span>
                </div>
              </div>

              {/* Action buttons inside Modal */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => handleExportReceiptPDF(justSaved)}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  Exportar Comprovante PDF
                </button>
                <button
                  onClick={() => {
                    setShowSuccessModal(false);
                    setJustSaved(null);
                  }}
                  className="w-full py-3 hover:bg-slate-50 text-slate-500 font-bold rounded-2xl text-xs transition-all cursor-pointer"
                >
                  Fechar Janela
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        title={confirmModal.title}
        message={confirmModal.message}
        type="warning"
        confirmText={confirmModal.confirmText}
        onConfirm={confirmModal.onConfirm}
        showConfirmButton={true}
      />
    </div>
  );
}
