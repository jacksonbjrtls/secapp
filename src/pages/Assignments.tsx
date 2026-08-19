import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Settings, 
  Plus, 
  FileText, 
  Gift, 
  Check, 
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Download,
  Briefcase,
  Layers,
  Sparkles
} from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp,
  onSnapshot
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '../lib/utils';
import { fetchUsersSafely, getLocalCachedUsers, setLocalCachedUsers } from '../lib/usersCache';
import { decryptValue } from '../lib/crypto';
import { WorkSector, WorkFunction, UserProfile } from '../types';

export default function Assignments() {
  const { profile, user, isAdmin, isManager, isMaster } = useAuth();
  const isElevated = isAdmin || isManager || isMaster || profile?.role === 'manager' || profile?.role === 'master' || profile?.role === 'admin';

  // Data States
  const [sectors, setSectors] = useState<WorkSector[]>([]);
  const [functions, setFunctions] = useState<WorkFunction[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  
  // Loading & Feedback
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form States - Sector & Function creation
  const [newSectorName, setNewSectorName] = useState('');
  const [newFunctionName, setNewFunctionName] = useState('');
  const [newFuncSectorId, setNewFuncSectorId] = useState('');

  // Collaborator search & filters
  const [colabSearch, setColabSearch] = useState('');
  const [colabFilterSector, setColabFilterSector] = useState('all');
  const [colabFilterCargo, setColabFilterCargo] = useState('all');
  const [colabFilterSize, setColabFilterSize] = useState('all');

  // PDF Export Customization States
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [pdfScope, setPdfScope] = useState<'all' | 'filtered'>('all');
  const [pdfIncludeSummary, setPdfIncludeSummary] = useState(true);
  const [pdfIncludeDateTime, setPdfIncludeDateTime] = useState(true);
  const [pdfSortOrder, setPdfSortOrder] = useState<'name' | 'size' | 'sector'>('name');
  const [pdfCols, setPdfCols] = useState({
    name: true,
    email: true,
    sector: true,
    cargo: true,
    birthDate: true,
    size: true
  });

  // Bulk Edit States
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkSector, setBulkSector] = useState('');
  const [bulkCargo, setBulkCargo] = useState('');
  const [bulkGroup, setBulkGroup] = useState('');
  const [bulkSize, setBulkSize] = useState('');
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  // Portuguese character sanitizer for jsPDF
  const sanitizePdfText = (text: string | null | undefined): string => {
    if (!text) return '';
    return String(text)
      .replace(/[áàâãäÁÀÂÃÄ]/g, 'a')
      .replace(/[éèêëÉÈÊË]/g, 'e')
      .replace(/[íìîïÍÌÎÏ]/g, 'i')
      .replace(/[óòôõöÓÒÔÕÖ]/g, 'o')
      .replace(/[úùûüÚÙÛÜ]/g, 'u')
      .replace(/[çÇ]/g, 'c')
      .replace(/[ñÑ]/g, 'n');
  };

  const defaultSectors = [
    { id: 'secagem', name: 'Secagem (Parte Úmida, SDCD, Cortadeira)', active: true },
    { id: 'enfardamento', name: 'Enfardamento', active: true }
  ];

  const defaultFunctions = [
    { id: 'op_area_1', name: 'Operador de Área 1', sectorId: 'secagem', active: true },
    { id: 'op_area_2', name: 'Operador de Área 2', sectorId: 'secagem', active: true },
    { id: 'op_area_3', name: 'Operador de Área 3', sectorId: 'secagem', active: true },
    { id: 'op_painel', name: 'Operador de Painel', sectorId: 'secagem', active: true },
    { id: 'op_assistente', name: 'Operador Assistente', sectorId: 'secagem', active: true },
    { id: 'especialista', name: 'Especialista', sectorId: 'secagem', active: true },
    { id: 'lider_area', name: 'Líder de Área', sectorId: 'secagem', active: true },
    { id: 'op_enfardamento', name: 'Operador de Enfardamento', sectorId: 'enfardamento', active: true },
    { id: 'lider_enfardamento', name: 'Líder de Enfardamento', sectorId: 'enfardamento', active: true },
    { id: 'aux_enfardamento', name: 'Auxiliar de Enfardamento', sectorId: 'enfardamento', active: true }
  ];

  // Fetch all assignments data
  const fetchData = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      
      // 1. Fetch Sectors
      const sectorSnap = await getDocs(collection(db, 'work_sectors'));
      const sectorList = sectorSnap.docs.map(d => ({ id: d.id, ...d.data() } as WorkSector));
      const combinedSectors = [...sectorList];
      defaultSectors.forEach(ds => {
        if (!combinedSectors.some(s => s.id === ds.id)) combinedSectors.push(ds as any);
      });
      const activeSectors = combinedSectors.filter(s => s.active !== false);
      setSectors(activeSectors);

      // 2. Fetch Functions
      const functionSnap = await getDocs(collection(db, 'work_functions'));
      const functionList = functionSnap.docs.map(d => ({ id: d.id, ...d.data() } as WorkFunction));
      const combinedFunctions = [...functionList];
      defaultFunctions.forEach(df => {
        if (!combinedFunctions.some(f => f.id === df.id)) combinedFunctions.push(df as any);
      });
      const activeFunctions = combinedFunctions.filter(f => f.active !== false);
      setFunctions(activeFunctions);

      // 3. Fetch Users safely
      const freshUsers = await fetchUsersSafely();
      const usersList = freshUsers.filter(u => u.email?.toLowerCase().trim() !== 'jacksonbjr@gmail.com');
      setAllUsers(usersList as any[]);

    } catch (err: any) {
      console.error('Error fetching assignments data:', err);
      setError('Falha ao carregar as atribuições e cadastros.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Listen in real-time to user updates (e.g. when user saves profile)
    const unsubUsers = onSnapshot(collection(db, 'users'), async (snapshot) => {
      try {
        const decryptedList = await Promise.all(
          snapshot.docs.map(async (d) => {
            const data = d.data();
            const decName = await decryptValue(data.displayName);
            const decEmail = await decryptValue(data.email);
            return {
              uid: d.id,
              displayName: decName || 'Sem nome',
              email: (decEmail || '').toLowerCase().trim(),
              role: data.role || 'operator',
              status: data.status || 'approved',
              group: data.group || '',
              sectorId: data.sectorId || '',
              sectorName: data.sectorName || '',
              cargoId: data.cargoId || '',
              cargoName: data.cargoName || '',
              birthDate: data.birthDate || '',
              tshirtSize: data.tshirtSize || '',
              registration: data.registration || '',
            };
          })
        );
        const validList = decryptedList.filter(u => u.displayName !== 'Sem nome' && u.email !== 'jacksonbjr@gmail.com');
        setAllUsers(validList as any[]);
        setLocalCachedUsers(validList);
      } catch (err) {
        console.warn('Real-time users update failed in Assignments:', err);
      }
    }, (err) => {
      console.warn('Users listener snapshot error:', err);
    });

    return () => {
      unsubUsers();
    };
  }, [user]);

  // Auto-dismiss alerts
  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess('');
        setError('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success, error]);

  // Manage Sectors (Add / Toggle / Delete)
  const handleAddSector = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSectorName.trim()) return;
    try {
      setSaving(true);
      const id = newSectorName.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
      await setDoc(doc(db, 'work_sectors', id), {
        name: newSectorName,
        active: true,
        createdAt: serverTimestamp()
      });
      setNewSectorName('');
      setSuccess('Setor de trabalho adicionado com sucesso.');
      fetchData(true);
    } catch (err) {
      setError('Erro ao adicionar setor.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddFunction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFunctionName.trim() || !newFuncSectorId) {
      alert('Preencha o nome da função e selecione o setor correspondente.');
      return;
    }
    try {
      setSaving(true);
      const id = newFunctionName.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
      await setDoc(doc(db, 'work_functions', id), {
        name: newFunctionName,
        sectorId: newFuncSectorId,
        active: true,
        createdAt: serverTimestamp()
      });
      setNewFunctionName('');
      setSuccess('Função de trabalho adicionada com sucesso.');
      fetchData(true);
    } catch (err) {
      setError('Erro ao adicionar função.');
    } finally {
      setSaving(false);
    }
  };

  const toggleSectorActive = async (id: string, currentStatus: boolean) => {
    const isDefault = ['secagem', 'enfardamento'].includes(id);
    
    if (!isDefault) {
      if (!confirm('Deseja excluir permanentemente este setor?')) return;
      try {
        setSaving(true);
        await deleteDoc(doc(db, 'work_sectors', id));
        setSuccess('Setor excluído com sucesso.');
        fetchData(true);
      } catch (err) {
        console.error(err);
        setError('Erro ao excluir setor.');
      } finally {
        setSaving(false);
      }
      return;
    }

    try {
      const sector = sectors.find(s => s.id === id) || defaultSectors.find(s => s.id === id);
      if (!sector) return;
      await setDoc(doc(db, 'work_sectors', id), {
        ...sector,
        active: !currentStatus
      }, { merge: true });
      setSuccess(`Setor ${!currentStatus ? 'ativado' : 'desativado'} com sucesso.`);
      fetchData(true);
    } catch (err) {
      console.error(err);
      setError('Erro ao atualizar setor.');
    }
  };

  const toggleFunctionActive = async (id: string, currentStatus: boolean) => {
    const defaultFunctionIds = [
      'op_area_1', 'op_area_2', 'op_area_3', 'op_painel', 'op_assistente', 
      'especialista', 'lider_area', 'op_enfardamento', 'lider_enfardamento', 'aux_enfardamento'
    ];
    const isDefault = defaultFunctionIds.includes(id);

    if (!isDefault) {
      if (!confirm('Deseja excluir permanentemente esta função?')) return;
      try {
        setSaving(true);
        await deleteDoc(doc(db, 'work_functions', id));
        setSuccess('Função excluída com sucesso.');
        fetchData(true);
      } catch (err) {
        console.error(err);
        setError('Erro ao excluir função.');
      } finally {
        setSaving(false);
      }
      return;
    }

    try {
      const func = functions.find(f => f.id === id) || defaultFunctions.find(f => f.id === id);
      if (!func) return;
      await setDoc(doc(db, 'work_functions', id), {
        ...func,
        active: !currentStatus
      }, { merge: true });
      setSuccess(`Função ${!currentStatus ? 'ativada' : 'desativada'} com sucesso.`);
      fetchData(true);
    } catch (err) {
      console.error(err);
      setError('Erro ao atualizar função.');
    }
  };

  // Assign user sector and cargo (Individual save)
  const handleAssignUserRoleInfo = async (uid: string, sId: string, fId: string, groupLetter: string, bDate: string, tshirtSize: string) => {
    try {
      const selectedS = sectors.find(s => s.id === sId);
      const selectedF = functions.find(f => f.id === fId);

      await updateDoc(doc(db, 'users', uid), {
        sectorId: sId || null,
        sectorName: selectedS?.name || null,
        cargoId: fId || null,
        cargoName: selectedF?.name || null,
        group: groupLetter || null,
        birthDate: bDate || null,
        tshirtSize: tshirtSize || null,
        updatedAt: serverTimestamp()
      });

      setSuccess('Dados de trabalho do usuário atualizados com sucesso.');
      fetchData(true);
    } catch (err) {
      setError('Erro ao atualizar informações do colaborador.');
    }
  };

  // Bulk Apply Changes (Edição Geral)
  const handleApplyBulkEdit = async () => {
    if (!bulkSector && !bulkCargo && !bulkGroup && !bulkSize) {
      alert('Selecione pelo menos um campo para alteração geral.');
      return;
    }

    const targetUsers = allUsers.filter(u => {
      const matchesSearch = !colabSearch || 
        (u.displayName && u.displayName.toLowerCase().includes(colabSearch.toLowerCase())) ||
        (u.email && u.email.toLowerCase().includes(colabSearch.toLowerCase()));
      const matchesSector = colabFilterSector === 'all' || 
        (colabFilterSector === 'none' && !u.sectorId) ||
        (u.sectorId === colabFilterSector);
      const matchesCargo = colabFilterCargo === 'all' || 
        (colabFilterCargo === 'none' && !u.cargoId) ||
        (u.cargoId === colabFilterCargo);
      const matchesSize = colabFilterSize === 'all' || 
        (colabFilterSize === 'none' && !u.tshirtSize) ||
        (u.tshirtSize === colabFilterSize);
      return matchesSearch && matchesSector && matchesCargo && matchesSize;
    });

    if (targetUsers.length === 0) {
      alert('Nenhum colaborador encontrado com os filtros atuais.');
      return;
    }

    const confirmMsg = `Deseja realmente aplicar estas alterações gerais a ${targetUsers.length} colaborador(es) exibido(s)?\n\n` +
      `Alterações:\n` +
      (bulkSector ? `- Setor: ${sectors.find(s => s.id === bulkSector)?.name || 'Nenhum'}\n` : '') +
      (bulkCargo ? `- Cargo: ${functions.find(f => f.id === bulkCargo)?.name || 'Nenhum'}\n` : '') +
      (bulkGroup ? `- Letra (Escala): ${bulkGroup || 'Nenhuma'}\n` : '') +
      (bulkSize ? `- Tamanho de Camisa: ${bulkSize || 'Nenhum'}\n` : '');

    if (!confirm(confirmMsg)) {
      return;
    }

    setIsBulkUpdating(true);
    try {
      let updatedCount = 0;
      for (const u of targetUsers) {
        const updateData: any = {
          updatedAt: serverTimestamp()
        };
        if (bulkSector !== '') {
          const selectedS = sectors.find(s => s.id === bulkSector);
          updateData.sectorId = bulkSector || null;
          updateData.sectorName = selectedS?.name || null;
          updateData.cargoId = null;
          updateData.cargoName = null;
        }
        if (bulkCargo !== '') {
          const selectedF = functions.find(f => f.id === bulkCargo);
          updateData.cargoId = bulkCargo || null;
          updateData.cargoName = selectedF?.name || null;
        }
        if (bulkGroup !== '') {
          updateData.group = bulkGroup || null;
        }
        if (bulkSize !== '') {
          updateData.tshirtSize = bulkSize || null;
        }

        const userDocRef = doc(db, 'users', u.uid);
        await updateDoc(userDocRef, updateData);
        updatedCount++;
      }
      
      setSuccess(`Edição geral concluída! ${updatedCount} colaborador(es) atualizado(s) com sucesso.`);
      setBulkSector('');
      setBulkCargo('');
      setBulkGroup('');
      setBulkSize('');
      setShowBulkEdit(false);
      fetchData(true);
    } catch (err: any) {
      console.error(err);
      setError('Erro ao aplicar alteração em massa.');
    } finally {
      setIsBulkUpdating(false);
    }
  };

  // Generate T-Shirt Sizes Report PDF with Custom Settings
  const handleGenerateTshirtPdf = () => {
    const doc = new jsPDF();
    
    let targetUsers = [...allUsers];
    if (pdfScope === 'filtered') {
      targetUsers = allUsers.filter(u => {
        const matchesSearch = !colabSearch || 
          (u.displayName && u.displayName.toLowerCase().includes(colabSearch.toLowerCase())) ||
          (u.email && u.email.toLowerCase().includes(colabSearch.toLowerCase()));
        const matchesSector = colabFilterSector === 'all' || 
          (colabFilterSector === 'none' && !u.sectorId) ||
          (u.sectorId === colabFilterSector);
        const matchesCargo = colabFilterCargo === 'all' || 
          (colabFilterCargo === 'none' && !u.cargoId) ||
          (u.cargoId === colabFilterCargo);
        const matchesSize = colabFilterSize === 'all' || 
          (colabFilterSize === 'none' && !u.tshirtSize) ||
          (u.tshirtSize === colabFilterSize);
        return matchesSearch && matchesSector && matchesCargo && matchesSize;
      });
    }

    if (pdfSortOrder === 'name') {
      targetUsers.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || '', 'pt-BR'));
    } else if (pdfSortOrder === 'size') {
      targetUsers.sort((a, b) => (a.tshirtSize || 'ZZZ').localeCompare(b.tshirtSize || 'ZZZ'));
    } else if (pdfSortOrder === 'sector') {
      targetUsers.sort((a, b) => (a.sectorName || 'ZZZ').localeCompare(b.sectorName || 'ZZZ'));
    }

    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 26, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(sanitizePdfText('RELATORIO DE TAMANHOS DE CAMISAS (BRINDES)'), 14, 13);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(203, 213, 225);
    doc.text(sanitizePdfText('SecAPP - Eldorado Brasil Celulose | Controle Administrativo'), 14, 20);

    let startY = 32;

    if (pdfIncludeDateTime) {
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(sanitizePdfText(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} as ${new Date().toLocaleTimeString('pt-BR')}`), 14, startY);
      startY += 5;
    }

    if (pdfIncludeSummary) {
      const sizeCounts: Record<string, number> = {
        'PP': 0, 'P': 0, 'M': 0, 'G': 0, 'GG': 0, 'XG': 0, 'XXG': 0, 'XXXG': 0, 'Nao Informado': 0
      };
      
      targetUsers.forEach(u => {
        const sz = u.tshirtSize || 'Nao Informado';
        if (sizeCounts[sz] !== undefined) {
          sizeCounts[sz]++;
        } else {
          sizeCounts['Nao Informado']++;
        }
      });

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(14, startY, pageWidth - 28, 16, 2, 2, 'FD');
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(51, 65, 85);
      doc.text(sanitizePdfText('RESUMO TOTAL DE UNIDADES A PRODUZIR:'), 18, startY + 6);

      let summaryX = 18;
      const summaryY = startY + 12;
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');

      Object.entries(sizeCounts).forEach(([sz, count]) => {
        if (count > 0 || sz !== 'Nao Informado') {
          const itemText = `${sz}: ${count}`;
          doc.text(sanitizePdfText(itemText), summaryX, summaryY);
          summaryX += 19;
        }
      });

      startY += 20;
    }

    const columnsConfig = [
      { id: 'index', header: '#', getValue: (u: UserProfile, idx: number) => String(idx + 1) },
      { id: 'name', header: 'Colaborador', getValue: (u: UserProfile) => u.displayName || 'Sem Nome', enabled: pdfCols.name },
      { id: 'email', header: 'E-mail', getValue: (u: UserProfile) => u.email || '', enabled: pdfCols.email },
      { id: 'sector', header: 'Setor', getValue: (u: UserProfile) => u.sectorName || 'Nao Definido', enabled: pdfCols.sector },
      { id: 'cargo', header: 'Cargo / Funcao', getValue: (u: UserProfile) => u.cargoName || 'Nao Definido', enabled: pdfCols.cargo },
      { id: 'birthDate', header: 'Data Nasc.', getValue: (u: UserProfile) => u.birthDate ? u.birthDate.split('-').reverse().join('/') : 'Nao Definido', enabled: pdfCols.birthDate },
      { id: 'size', header: 'Tam. Camisa', getValue: (u: UserProfile) => u.tshirtSize || 'Nao Definido', enabled: pdfCols.size }
    ];

    const activeCols = columnsConfig.filter(c => c.id === 'index' || c.enabled);
    const headers = activeCols.map(c => sanitizePdfText(c.header));
    
    const tableBody = targetUsers.map((u, idx) => {
      return activeCols.map(col => sanitizePdfText(col.getValue(u, idx)));
    });

    const columnStyles: Record<number, any> = {};
    activeCols.forEach((col, idx) => {
      if (col.id === 'index') {
        columnStyles[idx] = { cellWidth: 10 };
      } else if (col.id === 'size') {
        columnStyles[idx] = { cellWidth: 20, fontStyle: 'bold', halign: 'center' };
      } else if (col.id === 'birthDate') {
        columnStyles[idx] = { cellWidth: 25, halign: 'center' };
      }
    });

    autoTable(doc, {
      startY: startY + 4,
      head: [headers],
      body: tableBody,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: columnStyles,
      margin: { left: 14, right: 14 }
    });

    doc.save(`tamanhos_camisas_${new Date().toISOString().slice(0, 10)}.pdf`);
    setIsPdfModalOpen(false);
  };

  const filteredUsers = allUsers.filter(colab => {
    const matchesSearch = !colabSearch || 
      (colab.displayName && colab.displayName.toLowerCase().includes(colabSearch.toLowerCase())) ||
      (colab.email && colab.email.toLowerCase().includes(colabSearch.toLowerCase()));
    const matchesSector = colabFilterSector === 'all' || 
      (colabFilterSector === 'none' && !colab.sectorId) ||
      (colab.sectorId === colabFilterSector);
    const matchesCargo = colabFilterCargo === 'all' || 
      (colabFilterCargo === 'none' && !colab.cargoId) ||
      (colab.cargoId === colabFilterCargo);
    const matchesSize = colabFilterSize === 'all' || 
      (colabFilterSize === 'none' && !colab.tshirtSize) ||
      (colab.tshirtSize === colabFilterSize);
    return matchesSearch && matchesSector && matchesCargo && matchesSize;
  }).sort((a, b) => (a.displayName || '').localeCompare(b.displayName || '', 'pt-BR'));

  if (!isElevated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-12 bg-white border border-red-100 rounded-[2rem] shadow-sm">
        <div className="w-20 h-20 bg-red-50 rounded-2xl flex items-center justify-center mb-6">
          <Briefcase className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Acesso Restrito</h2>
        <p className="text-slate-500 max-w-md">Esta área de atribuição é exclusiva para administradores e gestores do sistema.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Toast Feedback */}
      <AnimatePresence>
        {success && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center gap-3 text-xs font-bold shadow-sm">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            {success}
          </motion.div>
        )}
        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl flex items-center gap-3 text-xs font-bold shadow-sm">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <Briefcase className="w-7 h-7 text-emerald-600" />
            Atribuições de Setores, Cargos & Brindes
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">
            Gerencie setores de trabalho, funções industriais, escalas e tamanhos de camisa dos colaboradores.
          </p>
        </div>
      </div>

      {/* Sector and Function Creators */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
        {/* Sector Creator */}
        <div className="bg-white rounded-[2rem] border border-slate-200 p-6 sm:p-8 shadow-sm space-y-4">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-600" />
            Criar Setores de Trabalho
          </h3>
          <form onSubmit={handleAddSector} className="flex gap-2">
            <input
              type="text"
              required
              placeholder="E.g., Secagem, Enfardamento"
              value={newSectorName}
              onChange={(e) => setNewSectorName(e.target.value)}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-semibold focus:ring-2 focus:ring-emerald-500 outline-none"
            />
            <button type="submit" disabled={saving} className="px-4 py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase hover:bg-slate-800 transition-all cursor-pointer shrink-0">
              Criar Setor
            </button>
          </form>

          <div className="pt-2 space-y-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Setores Ativos:</span>
            <div className="flex flex-wrap gap-2">
              {sectors.map(s => (
                <span key={s.id} className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 px-3 py-1 rounded-lg text-[10px] font-bold text-slate-700">
                  {s.name}
                  <button type="button" onClick={() => toggleSectorActive(s.id, s.active)} className="text-slate-400 hover:text-rose-600 font-bold ml-1 text-xs cursor-pointer">×</button>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Function Creator */}
        <div className="bg-white rounded-[2rem] border border-slate-200 p-6 sm:p-8 shadow-sm space-y-4">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
            <Settings className="w-4 h-4 text-emerald-600" />
            Criar Funções por Setor
          </h3>
          <form onSubmit={handleAddFunction} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                required
                placeholder="E.g., Operador de Área 1"
                value={newFunctionName}
                onChange={(e) => setNewFunctionName(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-semibold focus:ring-2 focus:ring-emerald-500 outline-none"
              />
              <select
                value={newFuncSectorId}
                required
                onChange={(e) => setNewFuncSectorId(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-semibold text-slate-600 focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                <option value="">Selecione o Setor...</option>
                {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <button type="submit" disabled={saving} className="w-full py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase hover:bg-slate-800 transition-all cursor-pointer">
              Adicionar Função
            </button>
          </form>

          <div className="pt-1 space-y-2 max-h-36 overflow-y-auto">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Funções Ativas:</span>
            <div className="flex flex-wrap gap-2">
              {functions.map(f => (
                <span key={f.id} className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 px-3 py-1 rounded-lg text-[10px] font-bold text-slate-700">
                  {f.name} ({sectors.find(s => s.id === f.sectorId)?.name?.split(' ')[0] || 'Setor'})
                  <button type="button" onClick={() => toggleFunctionActive(f.id, f.active)} className="text-slate-400 hover:text-rose-600 font-bold ml-1 text-xs cursor-pointer">×</button>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main Collaborators Table & Brindes (Camisas) Assignment */}
      <div className="bg-white rounded-[2rem] border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-600" />
              Atribuição Geral de Colaboradores
            </h3>
            <p className="text-xs text-slate-400 mt-1">Gerencie setores, escalas, datas de nascimento e tamanhos de camisa para brindes com edição em lote e exportação personalizada.</p>
          </div>
          <div className="flex gap-2 self-stretch md:self-auto w-full md:w-auto">
            <button
              type="button"
              onClick={() => setShowBulkEdit(!showBulkEdit)}
              className="flex-1 md:flex-none px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer border border-slate-200 justify-center shadow-xs"
            >
              <Settings className="w-4 h-4 text-slate-500" />
              Edição Geral
            </button>
            <button
              type="button"
              onClick={() => setIsPdfModalOpen(true)}
              className="flex-1 md:flex-none px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer shadow-sm justify-center"
            >
              <FileText className="w-4 h-4" />
              Gerar PDF de Camisas
            </button>
          </div>
        </div>

        {/* Bulk Edit Panel */}
        {showBulkEdit && (
          <div className="bg-amber-50/40 border border-amber-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-start gap-2 border-b border-amber-100 pb-2">
              <Settings className="w-4 h-4 text-amber-600 mt-0.5" />
              <div>
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">Edição Geral (Alteração em Lote)</h4>
                <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Define novos valores para TODOS os colaboradores que correspondem aos filtros de busca aplicados abaixo na tabela.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Definir Novo Setor</label>
                <select
                  value={bulkSector}
                  onChange={(e) => {
                    setBulkSector(e.target.value);
                    setBulkCargo('');
                  }}
                  className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-700 mt-1 outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="">Manter atual (Sem Alterar)</option>
                  {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Definir Novo Cargo</label>
                <select
                  value={bulkCargo}
                  onChange={(e) => setBulkCargo(e.target.value)}
                  disabled={!bulkSector}
                  className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-700 mt-1 outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-60"
                >
                  <option value="">Manter atual (Sem Alterar)</option>
                  {functions
                    .filter(f => f.sectorId === bulkSector)
                    .map(f => <option key={f.id} value={f.id}>{f.name}</option>)
                  }
                </select>
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Definir Nova Letra</label>
                <select
                  value={bulkGroup}
                  onChange={(e) => setBulkGroup(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-700 mt-1 outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="">Manter atual (Sem Alterar)</option>
                  <option value="A">Letra A</option>
                  <option value="B">Letra B</option>
                  <option value="C">Letra C</option>
                  <option value="D">Letra D</option>
                  <option value="E">Letra E</option>
                </select>
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Definir Tamanho Camisa</label>
                <select
                  value={bulkSize}
                  onChange={(e) => setBulkSize(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-700 mt-1 outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="">Manter atual (Sem Alterar)</option>
                  <option value="PP">PP</option>
                  <option value="P">P</option>
                  <option value="M">M</option>
                  <option value="G">G</option>
                  <option value="GG">GG</option>
                  <option value="XG">XG</option>
                  <option value="XXG">XXG</option>
                  <option value="XXXG">XXXG</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-amber-100">
              <button
                type="button"
                onClick={() => {
                  setBulkSector('');
                  setBulkCargo('');
                  setBulkGroup('');
                  setBulkSize('');
                  setShowBulkEdit(false);
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleApplyBulkEdit}
                disabled={isBulkUpdating}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
              >
                {isBulkUpdating ? 'Aplicando...' : 'Aplicar Alterações em Lote'}
              </button>
            </div>
          </div>
        )}

        {/* T-Shirt Size Distribution Dashboard */}
        <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1">
            <Gift className="w-3.5 h-3.5 text-slate-400" />
            Distribuição de Tamanhos de Camisas (Brindes)
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-2">
            {[
              { label: 'PP', count: allUsers.filter(u => u.tshirtSize === 'PP').length },
              { label: 'P', count: allUsers.filter(u => u.tshirtSize === 'P').length },
              { label: 'M', count: allUsers.filter(u => u.tshirtSize === 'M').length },
              { label: 'G', count: allUsers.filter(u => u.tshirtSize === 'G').length },
              { label: 'GG', count: allUsers.filter(u => u.tshirtSize === 'GG').length },
              { label: 'XG', count: allUsers.filter(u => u.tshirtSize === 'XG').length },
              { label: 'XXG', count: allUsers.filter(u => u.tshirtSize === 'XXG').length },
              { label: 'XXXG', count: allUsers.filter(u => u.tshirtSize === 'XXXG').length },
              { label: 'Nenhum', count: allUsers.filter(u => !u.tshirtSize).length },
            ].map((size) => (
              <div key={size.label} className="bg-white border border-slate-150 rounded-xl p-2.5 text-center shadow-xs">
                <p className="text-[10px] font-extrabold text-slate-400">{size.label}</p>
                <p className="text-base font-black text-slate-800 mt-0.5">{size.count}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Dynamic Filtering & Search for Quick Editing */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50/50 border border-slate-150 rounded-2xl p-4">
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Buscar Colaborador</label>
            <input
              type="text"
              placeholder="Nome ou e-mail..."
              value={colabSearch}
              onChange={(e) => setColabSearch(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-medium focus:ring-1 focus:ring-emerald-500 transition-all outline-none mt-1"
            />
          </div>

          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Filtrar por Setor</label>
            <select
              value={colabFilterSector}
              onChange={(e) => {
                setColabFilterSector(e.target.value);
                setColabFilterCargo('all');
              }}
              className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-700 mt-1 outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">Todos os Setores</option>
              <option value="none">Sem Setor Atribuído</option>
              {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Filtrar por Cargo</label>
            <select
              value={colabFilterCargo}
              onChange={(e) => setColabFilterCargo(e.target.value)}
              disabled={colabFilterSector === 'none'}
              className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-700 mt-1 outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-60"
            >
              <option value="all">Todos os Cargos</option>
              <option value="none">Sem Cargo Atribuído</option>
              {functions
                .filter(f => colabFilterSector === 'all' || f.sectorId === colabFilterSector)
                .map(f => <option key={f.id} value={f.id}>{f.name}</option>)
              }
            </select>
          </div>

          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Filtrar por Camisa</label>
            <select
              value={colabFilterSize}
              onChange={(e) => setColabFilterSize(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-700 mt-1 outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">Todos os Tamanhos</option>
              <option value="none">Sem Camisa Definida</option>
              <option value="PP">PP</option>
              <option value="P">P</option>
              <option value="M">M</option>
              <option value="G">G</option>
              <option value="GG">GG</option>
              <option value="XG">XG</option>
              <option value="XXG">XXG</option>
              <option value="XXXG">XXXG</option>
            </select>
          </div>
        </div>

        {/* Dynamic Count Feedback */}
        <div className="flex justify-between items-center text-xs text-slate-500 font-semibold px-1">
          <span>Exibindo <strong>{filteredUsers.length}</strong> de <strong>{allUsers.length}</strong> colaboradores</span>
          {(colabSearch || colabFilterSector !== 'all' || colabFilterCargo !== 'all' || colabFilterSize !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setColabSearch('');
                setColabFilterSector('all');
                setColabFilterCargo('all');
                setColabFilterSize('all');
              }}
              className="text-emerald-600 hover:text-emerald-700 font-bold transition-all cursor-pointer"
            >
              Limpar Filtros
            </button>
          )}
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-2xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-400 uppercase font-black tracking-widest border-b border-slate-200">
                <th className="p-4">Colaborador</th>
                <th className="p-4">E-mail</th>
                <th className="p-4">Setor</th>
                <th className="p-4">Cargo / Função</th>
                <th className="p-4">Letra (Escala)</th>
                <th className="p-4">Data Nasc.</th>
                <th className="p-4">Tam. Camisa</th>
                <th className="p-4 w-24 text-center">Salvar</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((colab) => (
                <UserAssignmentRow 
                  key={colab.uid} 
                  colab={colab} 
                  sectors={sectors} 
                  functions={functions} 
                  onSave={handleAssignUserRoleInfo}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* PDF Export Modal */}
      <AnimatePresence>
        {isPdfModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white w-full max-w-lg rounded-[2.5rem] border border-slate-200 shadow-2xl p-6 md:p-8 space-y-6 relative max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2 border-b border-slate-100 pb-3">
                <FileText className="w-5 h-5 text-emerald-600" />
                Personalizar Relatório PDF de Camisas
              </h3>

              <div className="space-y-4 text-xs font-semibold text-slate-700">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Escopo da Listagem:</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPdfScope('all')}
                      className={cn(
                        "p-3 rounded-xl border text-center font-bold transition-all cursor-pointer",
                        pdfScope === 'all' ? "bg-emerald-50 border-emerald-300 text-emerald-900" : "bg-slate-50 border-slate-200 text-slate-600"
                      )}
                    >
                      Todos ({allUsers.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPdfScope('filtered')}
                      className={cn(
                        "p-3 rounded-xl border text-center font-bold transition-all cursor-pointer",
                        pdfScope === 'filtered' ? "bg-emerald-50 border-emerald-300 text-emerald-900" : "bg-slate-50 border-slate-200 text-slate-600"
                      )}
                    >
                      Filtro Atual ({filteredUsers.length})
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Opções de Cabeçalho:</label>
                  <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={pdfIncludeSummary}
                        onChange={(e) => setPdfIncludeSummary(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Incluir Quadro de Resumo de Quantidades (Total Geral)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={pdfIncludeDateTime}
                        onChange={(e) => setPdfIncludeDateTime(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Incluir Data e Hora de Geração</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Colunas a Exibir:</label>
                  <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={pdfCols.name} onChange={(e) => setPdfCols(prev => ({ ...prev, name: e.target.checked }))} className="rounded text-emerald-600 focus:ring-emerald-500" />
                      <span>Nome</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={pdfCols.email} onChange={(e) => setPdfCols(prev => ({ ...prev, email: e.target.checked }))} className="rounded text-emerald-600 focus:ring-emerald-500" />
                      <span>E-mail</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={pdfCols.sector} onChange={(e) => setPdfCols(prev => ({ ...prev, sector: e.target.checked }))} className="rounded text-emerald-600 focus:ring-emerald-500" />
                      <span>Setor</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={pdfCols.cargo} onChange={(e) => setPdfCols(prev => ({ ...prev, cargo: e.target.checked }))} className="rounded text-emerald-600 focus:ring-emerald-500" />
                      <span>Cargo</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={pdfCols.birthDate} onChange={(e) => setPdfCols(prev => ({ ...prev, birthDate: e.target.checked }))} className="rounded text-emerald-600 focus:ring-emerald-500" />
                      <span>Data de Nascimento</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={pdfCols.size} onChange={(e) => setPdfCols(prev => ({ ...prev, size: e.target.checked }))} className="rounded text-emerald-600 focus:ring-emerald-500" />
                      <span>Tamanho da Camisa</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ordenação:</label>
                  <select
                    value={pdfSortOrder}
                    onChange={(e) => setPdfSortOrder(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold focus:ring-1 focus:ring-emerald-500 outline-none"
                  >
                    <option value="name">Alfabética (Por Nome do Colaborador)</option>
                    <option value="size">Por Tamanho de Camisa (PP &gt; P &gt; M &gt; G...)</option>
                    <option value="sector">Por Setor de Trabalho</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleGenerateTshirtPdf}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl transition-all cursor-pointer uppercase tracking-wider text-center flex items-center justify-center gap-2 shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  Baixar Relatório PDF
                </button>
                <button
                  type="button"
                  onClick={() => setIsPdfModalOpen(false)}
                  className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black rounded-xl transition-all cursor-pointer uppercase text-center"
                >
                  Voltar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// UserAssignmentRow component for independent row state handling
interface UserAssignmentRowProps {
  key?: string;
  colab: UserProfile;
  sectors: WorkSector[];
  functions: WorkFunction[];
  onSave: (uid: string, sId: string, fId: string, groupLetter: string, bDate: string, tshirtSize: string) => Promise<void>;
}

function UserAssignmentRow({ colab, sectors, functions, onSave }: UserAssignmentRowProps) {
  const [sector, setSector] = useState(colab.sectorId || '');
  const [cargo, setCargo] = useState(colab.cargoId || '');
  const [group, setGroup] = useState(colab.group || '');
  const [birth, setBirth] = useState(colab.birthDate || '');
  const [tshirtSize, setTshirtSize] = useState(colab.tshirtSize || '');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSector(colab.sectorId || '');
    setCargo(colab.cargoId || '');
    setGroup(colab.group || '');
    setBirth(colab.birthDate || '');
    setTshirtSize(colab.tshirtSize || '');
  }, [colab]);

  const handleRowSave = async () => {
    setLoading(true);
    await onSave(colab.uid, sector, cargo, group, birth, tshirtSize);
    setLoading(false);
  };

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50 font-semibold text-slate-700">
      <td className="p-3 font-extrabold text-slate-800">{colab.displayName}</td>
      <td className="p-3 text-slate-500 font-medium text-[10px] break-all">{colab.email}</td>
      
      <td className="p-3">
        <select
          value={sector}
          onChange={(e) => {
            setSector(e.target.value);
            setCargo('');
          }}
          className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[11px] font-bold text-slate-700 w-28"
        >
          <option value="">Nenhum</option>
          {sectors.map(s => <option key={s.id} value={s.id}>{s.name.split(' ')[0]}</option>)}
        </select>
      </td>

      <td className="p-3">
        <select
          value={cargo}
          disabled={!sector}
          onChange={(e) => setCargo(e.target.value)}
          className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[11px] font-bold text-slate-700 w-32"
        >
          <option value="">Nenhum</option>
          {functions.filter(f => f.sectorId === sector).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </td>

      <td className="p-3">
        <select
          value={group}
          onChange={(e) => setGroup(e.target.value as any)}
          className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[11px] font-bold text-slate-700"
        >
          <option value="">Nenhuma</option>
          <option value="A">Letra A</option>
          <option value="B">Letra B</option>
          <option value="C">Letra C</option>
          <option value="D">Letra D</option>
          <option value="E">Letra E</option>
        </select>
      </td>

      <td className="p-3">
        <input
          type="date"
          value={birth}
          onChange={(e) => setBirth(e.target.value)}
          className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[10px] font-medium w-24"
        />
      </td>

      <td className="p-3">
        <select
          value={tshirtSize}
          onChange={(e) => setTshirtSize(e.target.value)}
          className="bg-slate-50 border border-slate-200 rounded px-1.5 py-1 text-[11px] font-bold text-slate-700 w-20"
        >
          <option value="">Nenhum</option>
          <option value="PP">PP</option>
          <option value="P">P</option>
          <option value="M">M</option>
          <option value="G">G</option>
          <option value="GG">GG</option>
          <option value="XG">XG</option>
          <option value="XXG">XXG</option>
          <option value="XXXG">XXXG</option>
        </select>
      </td>

      <td className="p-3 text-center">
        <button
          onClick={handleRowSave}
          disabled={loading}
          className="p-1 px-3 bg-slate-900 text-white rounded font-black uppercase text-[10px] hover:bg-slate-800 disabled:opacity-40 transition-all cursor-pointer"
        >
          {loading ? '...' : 'Salvar'}
        </button>
      </td>
    </tr>
  );
}
