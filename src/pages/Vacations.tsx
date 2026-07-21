import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  CalendarDays, 
  Users, 
  Check, 
  X, 
  Settings, 
  AlertTriangle, 
  Plus, 
  Trash2, 
  ChevronUp, 
  ChevronDown, 
  RefreshCw, 
  FileText, 
  Cake, 
  Clock, 
  AlertCircle,
  HelpCircle,
  TrendingUp,
  UserCheck,
  CheckCircle2,
  Gift
} from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  updateDoc, 
  addDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  where, 
  serverTimestamp, 
  getDoc 
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '../lib/utils';
import { decryptValue } from '../lib/crypto';
import { VacationRequest, VacationQueueItem, WorkSector, WorkFunction, UserProfile } from '../types';

export default function Vacations() {
  const { profile, user, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<'my_vacation' | 'admin_panel' | 'queue' | 'limits' | 'reports'>('my_vacation');
  
  // Data States
  const [sectors, setSectors] = useState<WorkSector[]>([]);
  const [functions, setFunctions] = useState<WorkFunction[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [requests, setRequests] = useState<VacationRequest[]>([]);
  const [myRequests, setMyRequests] = useState<VacationRequest[]>([]);
  const [queueItems, setQueueItems] = useState<VacationQueueItem[]>([]);
  const [limitConfig, setLimitConfig] = useState<any>({ byCargo: {}, byGroup: {} });
  
  // Loading & Operations
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form States - Request
  const [startDate, setStartDate] = useState('');
  const [daysToTake, setDaysToTake] = useState<number>(30);
  const [thirteenthAdvance, setThirteenthAdvance] = useState(false);
  const [endDate, setEndDate] = useState('');
  const [reqSectorId, setReqSectorId] = useState('');
  const [reqCargoId, setReqCargoId] = useState('');

  // Admin Edit Request States
  const [editingReq, setEditingReq] = useState<VacationRequest | null>(null);
  const [editStartDate, setEditStartDate] = useState('');
  const [editDays, setEditDays] = useState<number>(30);
  const [editThirteenthAdvance, setEditThirteenthAdvance] = useState(false);
  const [editStatus, setEditStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  
  // Form States - Admin config
  const [newSectorName, setNewSectorName] = useState('');
  const [newFunctionName, setNewFunctionName] = useState('');
  const [newFuncSectorId, setNewFuncSectorId] = useState('');
  
  // Filter for reports and priority queue
  const [reportMonth, setReportMonth] = useState<number>(new Date().getMonth() + 1);
  const [queueSectorId, setQueueSectorId] = useState<'secagem' | 'enfardamento'>('secagem');
  const [queueCargoId, setQueueCargoId] = useState<string>('');
  const [rotationConfig, setRotationConfig] = useState<{ mode: 'sector' | 'sector_function'; counts?: { [key: string]: number } }>({
    mode: 'sector',
    counts: { secagem: 6, enfardamento: 10 }
  });
  const [localCounts, setLocalCounts] = useState<{ [key: string]: number }>({ secagem: 6, enfardamento: 10 });

  // Confirmation/Justification modal for rejection
  const [rejectingReq, setRejectingReq] = useState<VacationRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');

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

  // Bulk Edit States (General/Bulk edit options)
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkSector, setBulkSector] = useState('');
  const [bulkCargo, setBulkCargo] = useState('');
  const [bulkGroup, setBulkGroup] = useState('');
  const [bulkSize, setBulkSize] = useState('');
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  // Portuguese character sanitizer for jsPDF text drawing
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

  // Bulk Apply Changes (Edição Geral)
  const handleApplyBulkEdit = async () => {
    if (!bulkSector && !bulkCargo && !bulkGroup && !bulkSize) {
      alert('Selecione pelo menos um campo para alteração geral.');
      return;
    }

    // Get currently filtered users
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
          // Reset cargo if sector changes and the current cargo is not in that sector
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
      // Clear states
      setBulkSector('');
      setBulkCargo('');
      setBulkGroup('');
      setBulkSize('');
      setShowBulkEdit(false);
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
    
    // Define the list of users to include based on pdfScope
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

    // Sort targetUsers based on pdfSortOrder
    targetUsers.sort((a, b) => {
      if (pdfSortOrder === 'size') {
        const sizeA = a.tshirtSize || 'ZZZ';
        const sizeB = b.tshirtSize || 'ZZZ';
        const sizeOrder: Record<string, number> = { 'PP': 1, 'P': 2, 'M': 3, 'G': 4, 'GG': 5, 'XG': 6, 'XXG': 7, 'XXXG': 8, 'ZZZ': 9 };
        const orderA = sizeOrder[sizeA] || 99;
        const orderB = sizeOrder[sizeB] || 99;
        if (orderA !== orderB) return orderA - orderB;
      } else if (pdfSortOrder === 'sector') {
        const sectorA = a.sectorName || '';
        const sectorB = b.sectorName || '';
        if (sectorA !== sectorB) return sectorA.localeCompare(sectorB, 'pt-BR');
      }
      
      const nameA = a.displayName || '';
      const nameB = b.displayName || '';
      return nameA.localeCompare(nameB, 'pt-BR');
    });

    // Header
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, 210, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(sanitizePdfText('RELATÓRIO PERSONALIZADO - BRINDES'), 14, 18);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    if (pdfIncludeDateTime) {
      doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`, 14, 26);
    } else {
      doc.text('Relatorio Administrativo de Brindes', 14, 26);
    }
    doc.text(sanitizePdfText('Gestão e Controle de Tamanhos de Camisas dos Colaboradores'), 14, 32);

    let startY = 48;

    // Summary of counts
    if (pdfIncludeSummary) {
      const sizeCounts: Record<string, number> = {
        'PP': 0, 'P': 0, 'M': 0, 'G': 0, 'GG': 0, 'XG': 0, 'XXG': 0, 'XXXG': 0, 'Não Definido': 0
      };
      
      targetUsers.forEach(u => {
        const size = u.tshirtSize || 'Não Definido';
        if (sizeCounts[size] !== undefined) {
          sizeCounts[size]++;
        } else {
          sizeCounts['Não Definido']++;
        }
      });

      doc.setTextColor(15, 23, 42);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(sanitizePdfText('Resumo Quantitativo por Tamanho (Escopo Exportado):'), 14, startY);

      const summaryRows = [
        ['PP', String(sizeCounts['PP']), 'GG', String(sizeCounts['GG'])],
        ['P', String(sizeCounts['P']), 'XG', String(sizeCounts['XG'])],
        ['M', String(sizeCounts['M']), 'XXG', String(sizeCounts['XXG'])],
        ['G', String(sizeCounts['G']), 'XXXG', String(sizeCounts['XXXG'])],
        ['Sem Tamanho', String(sizeCounts['Não Definido']), 'Total Geral', String(targetUsers.length)]
      ];

      autoTable(doc, {
        startY: startY + 4,
        head: [[sanitizePdfText('Tamanho'), 'Qtd', sanitizePdfText('Tamanho'), 'Qtd']],
        body: summaryRows,
        theme: 'striped',
        headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: 'bold' }, // emerald-500
        styles: { fontSize: 9, cellPadding: 2 },
        margin: { left: 14, right: 14 }
      });

      startY = (doc as any).lastAutoTable.finalY + 12;
    }

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(sanitizePdfText('Lista Detalhada de Colaboradores:'), 14, startY);

    // Build dynamic columns
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

    // Dynamic Column Styles for jsPDF autoTable
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

  // Default Fallbacks
  const defaultSectors = [
    { id: 'secagem', name: 'Secagem (Parte Úmida, SDCD, Cortadeira)', active: true },
    { id: 'enfardamento', name: 'Enfardamento', active: true }
  ];

  const defaultFunctions = [
    { id: 'op_area_1', name: 'Operador de Área 1', sectorId: 'secagem', active: true },
    { id: 'op_area_2', name: 'Operador de Área 2', sectorId: 'secagem', active: true },
    { id: 'op_area_3', name: 'Operador de Área 3', sectorId: 'secagem', active: true },
    { id: 'op_painel', name: 'Operador de Panel', sectorId: 'secagem', active: true },
    { id: 'op_assistente', name: 'Operador Assistente', sectorId: 'secagem', active: true },
    { id: 'especialista', name: 'Especialista', sectorId: 'secagem', active: true },
    { id: 'lider_area', name: 'Líder de Área', sectorId: 'secagem', active: true },
    { id: 'op_enfardamento', name: 'Operador de Enfardamento', sectorId: 'enfardamento', active: true },
    { id: 'lider_enfardamento', name: 'Líder de Enfardamento', sectorId: 'enfardamento', active: true },
    { id: 'aux_enfardamento', name: 'Auxiliar de Enfardamento', sectorId: 'enfardamento', active: true }
  ];

  // Fetch all core module data
  const fetchData = async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      
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

      // 3. Fetch Users
      const usersSnap = await getDocs(collection(db, 'users'));
      const usersList: any[] = [];
      for (const d of usersSnap.docs) {
        const data = d.data();
        const decryptedDisplayName = await decryptValue(data.displayName);
        const decryptedEmail = await decryptValue(data.email);
        const displayName = decryptedDisplayName || 'Sem Nome';
        const email = decryptedEmail || '';
        
        if (email.toLowerCase().trim() === 'jacksonbjr@gmail.com') {
          continue;
        }
        
        usersList.push({
          uid: d.id,
          ...data,
          displayName,
          email
        } as any);
      }
      setAllUsers(usersList);

      // 4. Fetch Vacation Requests
      const reqSnap = await getDocs(query(collection(db, 'vacation_requests'), orderBy('createdAt', 'desc')));
      const reqList = reqSnap.docs.map(d => ({ id: d.id, ...d.data() } as VacationRequest));
      setRequests(reqList);

      if (user) {
        setMyRequests(reqList.filter(r => r.userId === user.uid));
      }

      // 5. Fetch Priority Queue
      const queueSnap = await getDocs(query(collection(db, 'vacation_queue'), orderBy('position', 'asc')));
      const qList = queueSnap.docs.map(d => ({ id: d.id, ...d.data() } as VacationQueueItem));
      setQueueItems(qList);

      // 6. Fetch Limits Config
      const limitDoc = await getDoc(doc(db, 'system_config', 'vacation_limits'));
      if (limitDoc.exists()) {
        setLimitConfig(limitDoc.data());
      } else {
        setLimitConfig({ byCargo: {}, byGroup: {} });
      }

      // 7. Fetch Rotation Config
      const rotationDoc = await getDoc(doc(db, 'system_config', 'vacation_rotation'));
      if (rotationDoc.exists()) {
        const rData = rotationDoc.data() as { mode: 'sector' | 'sector_function'; counts?: { [key: string]: number } };
        const newCfg = {
          mode: rData.mode || 'sector',
          counts: rData.counts || { secagem: 6, enfardamento: 10 }
        };
        setRotationConfig(newCfg);
        setLocalCounts(newCfg.counts);
      } else {
        const defaultCfg = { mode: 'sector', counts: { secagem: 6, enfardamento: 10 } };
        setRotationConfig(defaultCfg);
        setLocalCounts(defaultCfg.counts);
      }

    } catch (err: any) {
      console.error('Error fetching vacation module data:', err);
      setError('Falha ao carregar as informações de férias.');
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  // Synchronize queueCargoId when sector changes or functions load
  useEffect(() => {
    const sectorFuncs = functions.filter(f => f.sectorId === queueSectorId);
    if (sectorFuncs.length > 0) {
      if (!sectorFuncs.some(f => f.id === queueCargoId)) {
        setQueueCargoId(sectorFuncs[0].id);
      }
    } else {
      setQueueCargoId('');
    }
  }, [queueSectorId, functions, queueCargoId]);

  // Sync profile values for submission default
  useEffect(() => {
    if (profile) {
      setReqSectorId(profile.sectorId || '');
      setReqCargoId(profile.cargoId || '');
    }
  }, [profile]);

  // Show status alerts temporarily
  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess('');
        setError('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success, error]);

  // Check simultaneous vacation limits
  const checkVacationLimits = (monthNum: number, sectorId: string, cargoId: string, groupLetter: string) => {
    const cargoName = functions.find(f => f.id === cargoId)?.name || '';
    const cargoLimit = limitConfig.byCargo?.[cargoName] ?? 99;
    const groupLimit = limitConfig.byGroup?.[groupLetter] ?? 99;

    // Filter approved vacations overlapping this month
    const approvedThisMonth = requests.filter(r => {
      if (r.status !== 'approved') return false;
      
      const start = new Date(r.startDate);
      const end = new Date(r.endDate);
      const year = start.getFullYear(); // check current selection context year
      
      // Calculate overlapping months
      const startMonth = start.getMonth() + 1;
      const endMonth = end.getMonth() + 1;
      
      return monthNum >= startMonth && monthNum <= endMonth;
    });

    const cargoCount = approvedThisMonth.filter(r => r.cargoName === cargoName).length;
    const groupCount = approvedThisMonth.filter(r => r.group === groupLetter).length;

    return {
      cargoLimit,
      cargoCount,
      cargoExceeded: cargoCount >= cargoLimit,
      groupLimit,
      groupCount,
      groupExceeded: groupCount >= groupLimit
    };
  };

  // Helper: calculate end date based on start date and days
  const calculateEndDate = (start: string, days: number) => {
    if (!start || isNaN(days) || days <= 0) return '';
    const date = new Date(start + 'T00:00:00'); // Prevent timezone offset issues
    date.setDate(date.getDate() + days - 1);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // Sync endDate dynamically when startDate or daysToTake changes
  useEffect(() => {
    if (startDate && daysToTake > 0) {
      const calculated = calculateEndDate(startDate, daysToTake);
      setEndDate(calculated);
    } else {
      setEndDate('');
    }
  }, [startDate, daysToTake]);

  // Handle Admin Edit Request Save
  const handleSaveEditRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReq) return;
    if (!editStartDate || editDays <= 0) {
      setError('Por favor, preencha a data de início e quantidade de dias.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const calculatedEndDate = calculateEndDate(editStartDate, editDays);
      const updateData: Partial<VacationRequest> = {
        startDate: editStartDate,
        endDate: calculatedEndDate,
        days: editDays,
        thirteenthAdvance: editThirteenthAdvance,
        status: editStatus,
        updatedAt: serverTimestamp()
      };

      await updateDoc(doc(db, 'vacation_requests', editingReq.id), updateData);
      setSuccess('Solicitação de férias atualizada com sucesso pelo administrador!');
      setEditingReq(null);
      fetchData(true);
    } catch (err: any) {
      console.error(err);
      setError('Falha ao atualizar a solicitação de férias.');
    } finally {
      setSaving(false);
    }
  };

  // Helper: calculate total vacation days between two dates
  const calculateDays = (start: string, end: string) => {
    if (!start || !end) return 0;
    const d1 = new Date(start);
    const d2 = new Date(end);
    const diffTime = Math.abs(d2.getTime() - d1.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  };

  // Create vacation request
  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    if (!startDate || daysToTake <= 0) {
      setError('Por favor, preencha a data de início e a quantidade de dias.');
      return;
    }

    const calculatedEndDate = calculateEndDate(startDate, daysToTake);

    // Capture current sector and function details
    const selectedSector = sectors.find(s => s.id === reqSectorId) || { id: profile.sectorId || 'secagem', name: profile.sectorName || 'Secagem' };
    const selectedFunction = functions.find(f => f.id === reqCargoId) || { id: profile.cargoId || '', name: profile.cargoName || '' };

    if (!selectedSector.id) {
      setError('Selecione um Setor no seu perfil ou no formulário.');
      return;
    }

    // Check limit warnings beforehand
    const reqMonth = new Date(startDate).getMonth() + 1;
    const { cargoExceeded, groupExceeded } = checkVacationLimits(
      reqMonth, 
      selectedSector.id, 
      selectedFunction.id || '', 
      profile.group || ''
    );

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const newReq: Omit<VacationRequest, 'id'> = {
        userId: user.uid,
        userName: profile.displayName || 'Colaborador',
        userEmail: user.email || '',
        group: profile.group || 'A',
        sectorId: selectedSector.id,
        sectorName: selectedSector.name,
        cargoId: selectedFunction.id || '',
        cargoName: selectedFunction.name || '',
        startDate,
        endDate: calculatedEndDate,
        days: daysToTake,
        thirteenthAdvance,
        status: 'pending',
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'vacation_requests'), newReq);
      setSuccess('Solicitação de férias enviada com sucesso! Aguarde aprovação.');
      
      // Clear inputs
      setStartDate('');
      setDaysToTake(30);
      setThirteenthAdvance(false);
      fetchData(true);
    } catch (err: any) {
      console.error(err);
      setError('Falha ao enviar solicitação.');
    } finally {
      setSaving(false);
    }
  };

  // Delete/Cancel pending request
  const handleCancelRequest = async (id: string) => {
    if (!confirm('Tem certeza de que deseja cancelar esta solicitação?')) return;
    try {
      await deleteDoc(doc(db, 'vacation_requests', id));
      setSuccess('Solicitação cancelada com sucesso.');
      fetchData(true);
    } catch (err) {
      setError('Erro ao cancelar solicitação.');
    }
  };

  // Approve Vacation Request
  const handleApproveRequest = async (req: VacationRequest) => {
    try {
      await updateDoc(doc(db, 'vacation_requests', req.id), {
        status: 'approved',
        approvedBy: user?.uid || 'system',
        approvedByName: profile?.displayName || 'Administrador',
        updatedAt: serverTimestamp()
      });
      setSuccess(`Férias de ${req.userName} aprovadas com sucesso.`);
      fetchData(true);
    } catch (err) {
      setError('Erro ao aprovar solicitação.');
    }
  };

  // Reject Vacation Request
  const handleRejectRequest = async () => {
    if (!rejectingReq) return;
    if (!rejectReason.trim()) {
      alert('Por favor, informe a justificativa da recusa.');
      return;
    }

    try {
      await updateDoc(doc(db, 'vacation_requests', rejectingReq.id), {
        status: 'rejected',
        rejectedReason: rejectReason,
        updatedAt: serverTimestamp()
      });
      setSuccess(`Férias de ${rejectingReq.userName} recusadas.`);
      setRejectingReq(null);
      setRejectReason('');
      fetchData(true);
    } catch (err) {
      setError('Erro ao recusar solicitação.');
    }
  };

  // Save Vacation Rotation Mode and Counts
  const handleSaveRotationConfig = async (mode: 'sector' | 'sector_function', customCounts?: { [key: string]: number }, silent = false) => {
    try {
      if (!silent) setSaving(true);
      const updatedCounts = customCounts || rotationConfig.counts || { secagem: 6, enfardamento: 10 };
      await setDoc(doc(db, 'system_config', 'vacation_rotation'), {
        mode,
        counts: updatedCounts
      });
      setRotationConfig({ mode, counts: updatedCounts });
      if (!silent) {
        setSuccess('Configuração de giro de férias salva com sucesso.');
      }
      fetchData(true);
    } catch (err) {
      console.error(err);
      if (!silent) {
        setError('Erro ao salvar configuração de giro.');
      }
    } finally {
      if (!silent) setSaving(false);
    }
  };

  // Initialize Priority Queue if empty or out of sync
  const handleInitializeQueue = async () => {
    const isSectorFunction = rotationConfig.mode === 'sector_function';
    let confirmMsg = 'Deseja iniciar ou sincronizar a fila de prioridade com todos os usuários ativos do setor?';
    if (isSectorFunction) {
      confirmMsg = 'Deseja iniciar ou sincronizar a fila de prioridades por setor e função para todos os usuários ativos?';
    }
    if (!confirm(confirmMsg)) return;

    try {
      setSaving(true);
      
      // Filter users in selected sector, de-duplicating by unique fields (uid, email, displayName)
      const seenUids = new Set<string>();
      const seenEmails = new Set<string>();
      const seenNames = new Set<string>();
      
      const sectorUsers = allUsers.filter(u => {
        if (u.sectorId !== queueSectorId) return false;
        if (u.active === false) return false; // Only include active users

        // Check if UID has been processed
        if (seenUids.has(u.uid)) return false;

        // Check if email has been processed
        if (u.email) {
          const emailLower = u.email.toLowerCase().trim();
          if (emailLower && seenEmails.has(emailLower)) return false;
        }

        // Check if displayName has been processed
        if (u.displayName) {
          const nameNorm = u.displayName.toLowerCase().trim();
          if (nameNorm && seenNames.has(nameNorm)) return false;
        }

        // Mark as seen
        seenUids.add(u.uid);
        if (u.email) seenEmails.add(u.email.toLowerCase().trim());
        if (u.displayName) seenNames.add(u.displayName.toLowerCase().trim());

        return true;
      });
      
      // Clear existing queue items for this sector first by querying Firestore directly
      const existingQueueSnap = await getDocs(
        query(collection(db, 'vacation_queue'), where('sectorId', '==', queueSectorId))
      );
      for (const d of existingQueueSnap.docs) {
        await deleteDoc(doc(db, 'vacation_queue', d.id));
      }

      if (isSectorFunction) {
        // Group by cargoId
        const sectorCargos = Array.from(new Set(sectorUsers.map(u => u.cargoId || 'sem_cargo')));
        for (const cargoId of sectorCargos) {
          const cargoUsers = sectorUsers.filter(u => (u.cargoId || 'sem_cargo') === cargoId);
          const sortedUsers = [...cargoUsers].sort((a, b) => a.displayName.localeCompare(b.displayName));
          for (let i = 0; i < sortedUsers.length; i++) {
            const u = sortedUsers[i];
            const newItem: any = {
              userId: u.uid,
              userName: u.displayName,
              sectorId: queueSectorId,
              cargoId: u.cargoId || 'sem_cargo',
              cargoName: u.cargoName || 'Sem cargo atribuído',
              position: i + 1,
              updatedAt: serverTimestamp()
            };
            await addDoc(collection(db, 'vacation_queue'), newItem);
          }
        }
      } else {
        // Add to queue in order (alphabetical by name initially)
        const sortedUsers = [...sectorUsers].sort((a, b) => a.displayName.localeCompare(b.displayName));
        for (let i = 0; i < sortedUsers.length; i++) {
          const u = sortedUsers[i];
          const newItem: any = {
            userId: u.uid,
            userName: u.displayName,
            sectorId: queueSectorId,
            position: i + 1,
            updatedAt: serverTimestamp()
          };
          await addDoc(collection(db, 'vacation_queue'), newItem);
        }
      }

      setSuccess('Fila de prioridade de férias inicializada com sucesso.');
      fetchData(true);
    } catch (err) {
      console.error(err);
      setError('Erro ao inicializar fila de prioridade.');
    } finally {
      setSaving(false);
    }
  };

  // Cycle Queue Rule:
  // "o que escolheu ferias primeiro este ano no proximo ano passa a ser o ultimo a escolher, e o segundo depois dele é o proximo a escolher primeiro"
  // E configurado uma quantidade de gira junto por setor (ex: secagem gira 6, enfardamento gira 10)
  const handleCycleQueue = async () => {
    const isSectorFunction = rotationConfig.mode === 'sector_function';
    let sectorQ: VacationQueueItem[] = [];
    let confirmMsg = '';

    const configCounts = rotationConfig.counts || { secagem: 6, enfardamento: 10 };
    const rotateCount = configCounts[queueSectorId] !== undefined ? configCounts[queueSectorId] : (queueSectorId === 'secagem' ? 6 : queueSectorId === 'enfardamento' ? 10 : 1);

    const sectorName = queueSectorId === 'secagem' ? 'Secagem' : 'Enfardamento';

    if (isSectorFunction) {
      const currentCargo = functions.find(f => f.id === queueCargoId) || defaultFunctions.find(f => f.id === queueCargoId);
      const cargoName = currentCargo?.name || 'Sem cargo atribuído';
      sectorQ = queueItems
        .filter(qi => qi.sectorId === queueSectorId && (qi as any).cargoId === queueCargoId)
        .sort((a, b) => a.position - b.position);
    } else {
      sectorQ = queueItems
        .filter(qi => qi.sectorId === queueSectorId)
        .sort((a, b) => a.position - b.position);
    }

    if (sectorQ.length < 2) {
      alert('É necessário ter pelo menos 2 pessoas na fila para realizar o rodízio.');
      return;
    }

    const actualRotateCount = Math.min(rotateCount, sectorQ.length - 1);

    if (isSectorFunction) {
      const currentCargo = functions.find(f => f.id === queueCargoId) || defaultFunctions.find(f => f.id === queueCargoId);
      const cargoName = currentCargo?.name || 'Sem cargo atribuído';
      confirmMsg = `Confirmar rotação/ciclo anual da fila para o cargo de ${cargoName} no setor de ${sectorName}? Os primeiros ${actualRotateCount} ${actualRotateCount === 1 ? 'funcionário' : 'funcionários'} serão movidos para o final da fila (giro configurado: ${rotateCount}).`;
    } else {
      confirmMsg = `Confirmar rotação/ciclo anual da fila para o setor de ${sectorName}? Os primeiros ${actualRotateCount} ${actualRotateCount === 1 ? 'funcionário' : 'funcionários'} serão movidos para o final da fila (giro configurado: ${rotateCount}).`;
    }

    if (!confirm(confirmMsg)) return;

    try {
      setSaving(true);

      // Shift remaining elements (indices actualRotateCount to length - 1) up
      for (let i = actualRotateCount; i < sectorQ.length; i++) {
        const item = sectorQ[i];
        await updateDoc(doc(db, 'vacation_queue', item.id), {
          position: i - actualRotateCount + 1,
          updatedAt: serverTimestamp()
        });
      }

      // Put the rotated elements (indices 0 to actualRotateCount - 1) at the back
      for (let i = 0; i < actualRotateCount; i++) {
        const item = sectorQ[i];
        await updateDoc(doc(db, 'vacation_queue', item.id), {
          position: sectorQ.length - actualRotateCount + i + 1,
          lastYearSelectionDate: new Date().toLocaleDateString('pt-BR'),
          updatedAt: serverTimestamp()
        });
      }

      setSuccess(`Fila rotacionada com sucesso! Os primeiros ${actualRotateCount} funcionários foram movidos para o final da fila.`);
      fetchData(true);
    } catch (err) {
      console.error(err);
      setError('Erro ao rotacionar a fila de prioridades.');
    } finally {
      setSaving(false);
    }
  };

  // Reorder queue positions manually (admin override)
  const moveQueueItem = async (index: number, direction: 'up' | 'down') => {
    const isSectorFunction = rotationConfig.mode === 'sector_function';
    let sectorQ: VacationQueueItem[] = [];

    if (isSectorFunction) {
      sectorQ = queueItems
        .filter(qi => qi.sectorId === queueSectorId && (qi as any).cargoId === queueCargoId)
        .sort((a, b) => a.position - b.position);
    } else {
      sectorQ = queueItems
        .filter(qi => qi.sectorId === queueSectorId)
        .sort((a, b) => a.position - b.position);
    }

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sectorQ.length) return;

    try {
      const current = sectorQ[index];
      const target = sectorQ[targetIndex];

      await updateDoc(doc(db, 'vacation_queue', current.id), {
        position: target.position,
        updatedAt: serverTimestamp()
      });
      await updateDoc(doc(db, 'vacation_queue', target.id), {
        position: current.position,
        updatedAt: serverTimestamp()
      });

      fetchData(true);
    } catch (err) {
      setError('Erro ao reordenar fila.');
    }
  };

  // Save Vacation Limits Configuration
  const handleSaveLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await setDoc(doc(db, 'system_config', 'vacation_limits'), limitConfig);
      setSuccess('Configuração de limites de férias salva com sucesso.');
      fetchData(true);
    } catch (err) {
      setError('Erro ao salvar configurações de limite.');
    } finally {
      setSaving(false);
    }
  };

  // Manage Sectors & Functions (Add)
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

  // Toggle sector / function active status or Delete if custom
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

  // Assign user sector and cargo (Admin panel helper)
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

  // Monthly reports list of workers on vacation
  const getVacationersByMonth = (monthNum: number) => {
    return requests.filter(r => {
      if (r.status !== 'approved') return false;
      const start = new Date(r.startDate);
      const end = new Date(r.endDate);
      const startMonth = start.getMonth() + 1;
      const endMonth = end.getMonth() + 1;
      return monthNum >= startMonth && monthNum <= endMonth;
    });
  };

  // Birthday boys/girls of selected month
  const getBirthdaysByMonth = (monthNum: number) => {
    return allUsers.filter(u => {
      if (!u.birthDate) return false;
      const birthMonth = parseInt(u.birthDate.split('-')[1], 10);
      return birthMonth === monthNum;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-3">
        <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin" />
        <span className="text-slate-600 font-bold animate-pulse">Carregando Controle de Férias...</span>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-24">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <CalendarDays className="w-8 h-8 text-emerald-600" />
            Controle de Férias
          </h1>
          <p className="text-slate-500 font-medium">
            Gerenciamento e solicitação de períodos de descanso, fila de prioridade e limites operacionais.
          </p>
        </div>

        {/* Current profile status indicator */}
        <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-150 text-xs">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
          <div>
            <p className="font-bold text-slate-700">Seu Perfil Atual:</p>
            <p className="text-slate-500 font-medium mt-0.5">
              {profile?.sectorName || 'Setor não definido'} • {profile?.cargoName || 'Cargo não definido'}
            </p>
          </div>
        </div>
      </div>

      {/* Operation Alerts */}
      <AnimatePresence>
        {success && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center gap-2.5 text-sm font-semibold">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            {success}
          </motion.div>
        )}
        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl flex items-center gap-2.5 text-sm font-semibold">
            <AlertCircle className="w-5 h-5 text-rose-600" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabs Menu */}
      <div className="flex flex-wrap gap-2 bg-slate-100 p-1.5 rounded-[1.5rem] text-slate-600 border border-slate-200">
        <button
          onClick={() => setActiveTab('my_vacation')}
          className={cn(
            "px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer",
            activeTab === 'my_vacation' ? "bg-white text-emerald-800 shadow-md" : "hover:bg-white/50"
          )}
        >
          <Calendar className="w-4 h-4" />
          Minhas Férias
        </button>

        <button
          onClick={() => setActiveTab('queue')}
          className={cn(
            "px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer",
            activeTab === 'queue' ? "bg-white text-emerald-800 shadow-md" : "hover:bg-white/50"
          )}
        >
          <TrendingUp className="w-4 h-4" />
          Fila de Escolha
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={cn(
            "px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer",
            activeTab === 'reports' ? "bg-white text-emerald-800 shadow-md" : "hover:bg-white/50"
          )}
        >
          <Cake className="w-4 h-4" />
          Relatório / Aniversariantes
        </button>

        {(isAdmin || profile?.role === 'manager') && (
          <>
            <button
              onClick={() => setActiveTab('admin_panel')}
              className={cn(
                "px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer",
                activeTab === 'admin_panel' ? "bg-white text-emerald-800 shadow-md" : "hover:bg-white/50"
              )}
            >
              <Users className="w-4 h-4" />
              Painel Admin ({requests.filter(r => r.status === 'pending').length})
            </button>

            <button
              onClick={() => setActiveTab('limits')}
              className={cn(
                "px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer",
                activeTab === 'limits' ? "bg-white text-emerald-800 shadow-md" : "hover:bg-white/50"
              )}
            >
              <Settings className="w-4 h-4" />
              Limites Simultâneos
            </button>
          </>
        )}
      </div>

      {/* Tab Panels */}
      <div className="space-y-8">
        
        {/* TAB: MY VACATIONS */}
        {activeTab === 'my_vacation' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: Request Form */}
            <div className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm h-fit">
              <h2 className="text-xl font-extrabold text-slate-900 uppercase tracking-tight mb-6 flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-600" />
                Nova Solicitação
              </h2>

              {!profile?.sectorId || !profile?.cargoId ? (
                <div className="p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl text-xs font-bold leading-relaxed mb-6">
                  <AlertTriangle className="w-4 h-4 text-amber-600 mb-1" />
                  Seu perfil está sem Setor ou Função atribuídos. Configure estes dados na página "Meu Perfil" ou use o seletor abaixo.
                </div>
              ) : null}

              <form onSubmit={handleRequestSubmit} className="space-y-5">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data de Início</label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-4 text-sm font-medium focus:ring-2 focus:ring-emerald-500 transition-all outline-none mt-1"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Quantidade de dias</label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    required
                    value={daysToTake}
                    onChange={(e) => setDaysToTake(parseInt(e.target.value, 10) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-4 text-sm font-medium focus:ring-2 focus:ring-emerald-500 transition-all outline-none mt-1"
                  />
                </div>

                <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-150">
                  <input
                    id="thirteenthAdvance"
                    type="checkbox"
                    checked={thirteenthAdvance}
                    onChange={(e) => setThirteenthAdvance(e.target.checked)}
                    className="w-5 h-5 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500 cursor-pointer"
                  />
                  <label htmlFor="thirteenthAdvance" className="text-xs font-bold text-slate-700 cursor-pointer select-none">
                    Desejo antecipação de 13º salário
                  </label>
                </div>

                {(!profile?.sectorId || !profile?.cargoId) && (
                  <>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Selecione o Setor</label>
                      <select
                        value={reqSectorId}
                        onChange={(e) => {
                          setReqSectorId(e.target.value);
                          setReqCargoId('');
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-4 text-sm font-medium focus:ring-2 focus:ring-emerald-500 transition-all mt-1"
                      >
                        <option value="">Selecione...</option>
                        {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Selecione a Função</label>
                      <select
                        value={reqCargoId}
                        disabled={!reqSectorId}
                        onChange={(e) => setReqCargoId(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-4 text-sm font-medium focus:ring-2 focus:ring-emerald-500 transition-all mt-1"
                      >
                        <option value="">Selecione...</option>
                        {functions.filter(f => f.sectorId === reqSectorId).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                    </div>
                  </>
                )}

                {startDate && daysToTake > 0 && (
                  <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100 space-y-1">
                    <p className="text-xs font-bold text-slate-500">Período de Férias Calculado:</p>
                    <p className="text-sm font-black text-slate-800">
                      {new Date(startDate + 'T00:00:00').toLocaleDateString('pt-BR')} até {new Date(calculateEndDate(startDate, daysToTake) + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </p>
                    <p className="text-xs font-semibold text-emerald-700">Total de {daysToTake} dias</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-800 transition-all shadow-xl flex items-center justify-center gap-2"
                >
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                  Solicitar Férias
                </button>
              </form>
            </div>

            {/* Right: History & List */}
            <div className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm lg:col-span-2 space-y-6">
              <h2 className="text-xl font-extrabold text-slate-900 uppercase tracking-tight flex items-center gap-2">
                <Clock className="w-5 h-5 text-emerald-600" />
                Histórico de Solicitações
              </h2>

              {myRequests.length === 0 ? (
                <div className="text-center py-16 px-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-600 font-bold">Nenhuma solicitação encontrada</p>
                  <p className="text-slate-400 text-xs max-w-sm mx-auto mt-1">
                    Você ainda não solicitou nenhum período de férias. Use o painel ao lado para planejar sua primeira parada!
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {myRequests.map((req) => (
                    <div 
                      key={req.id}
                      className="p-5 border border-slate-200 rounded-2xl bg-white hover:border-emerald-200 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn(
                            "text-[10px] font-black uppercase px-2.5 py-1 rounded-md",
                            req.status === 'approved' && "bg-emerald-50 text-emerald-700",
                            req.status === 'pending' && "bg-amber-50 text-amber-700",
                            req.status === 'rejected' && "bg-rose-50 text-rose-700"
                          )}>
                            {req.status === 'approved' ? 'Aprovado' : req.status === 'pending' ? 'Pendente' : 'Recusado'}
                          </span>
                          <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded">
                            {req.days} dias
                          </span>
                          {req.thirteenthAdvance && (
                            <span className="bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                              <Gift className="w-3 h-3" />
                              Antecipação 13º
                            </span>
                          )}
                        </div>

                        <div className="text-sm font-bold text-slate-800">
                          Período: {new Date(req.startDate).toLocaleDateString('pt-BR')} até {new Date(req.endDate).toLocaleDateString('pt-BR')}
                        </div>

                        <p className="text-xs text-slate-500 font-medium">
                          Setor: {req.sectorName || 'Não especificado'} • Cargo: {req.cargoName || 'Não especificado'} • Letra {req.group}
                        </p>

                        {req.rejectedReason && (
                          <div className="text-xs font-semibold text-rose-600 bg-rose-50/50 p-2.5 rounded-xl border border-rose-100 mt-2">
                            Motivo da recusa: {req.rejectedReason}
                          </div>
                        )}
                      </div>

                      {req.status === 'pending' && (
                        <button
                          onClick={() => handleCancelRequest(req.id)}
                          className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl text-xs font-black transition-all flex items-center gap-1 shrink-0 self-start md:self-auto cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Cancelar
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: PRIORITY QUEUE */}
        {activeTab === 'queue' && (
          <div className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="space-y-1">
                <h2 className="text-xl font-extrabold text-slate-900 uppercase tracking-tight flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                  Fila de Prioridade de Escolha
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  Controle da ordem de quem escolhe as férias primeiro. Quem escolheu primeiro este ano, no próximo ano será o último.
                </p>
              </div>

              {/* Sector & Function selector inside queue */}
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
                  <button
                    onClick={() => setQueueSectorId('secagem')}
                    className={cn(
                      "px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer",
                      queueSectorId === 'secagem' ? "bg-white text-emerald-800 shadow-sm" : "hover:text-slate-800 text-slate-500"
                    )}
                  >
                    Secagem
                  </button>
                  <button
                    onClick={() => setQueueSectorId('enfardamento')}
                    className={cn(
                      "px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer",
                      queueSectorId === 'enfardamento' ? "bg-white text-emerald-800 shadow-sm" : "hover:text-slate-800 text-slate-500"
                    )}
                  >
                    Enfardamento
                  </button>
                </div>

                {rotationConfig.mode === 'sector_function' && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-500 uppercase">Função:</span>
                    <select
                      value={queueCargoId}
                      onChange={(e) => setQueueCargoId(e.target.value)}
                      className="px-3 py-2 bg-white border border-slate-250 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all cursor-pointer"
                    >
                      {functions.filter(f => f.sectorId === queueSectorId).map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Configuration for Vacation Rotation (Giro de Férias) */}
            {(isAdmin || profile?.role === 'manager') && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Settings className="w-3.5 h-3.5 text-emerald-600" />
                      Configuração de Regra do Giro de Férias
                    </h3>
                    <p className="text-[11px] text-slate-500 font-medium">
                      Defina como o sistema organizará as prioridades e o ciclo/rodízio anual de escolhas.
                    </p>
                  </div>
                  
                  <div className="flex bg-slate-200/60 p-1 rounded-xl border border-slate-250 self-start sm:self-auto">
                    <button
                      onClick={() => handleSaveRotationConfig('sector')}
                      disabled={saving}
                      className={cn(
                        "px-3.5 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all cursor-pointer",
                        rotationConfig.mode === 'sector' ? "bg-white text-emerald-800 shadow-sm font-black" : "text-slate-500 hover:text-slate-800"
                      )}
                    >
                      Apenas por Setor
                    </button>
                    <button
                      onClick={() => handleSaveRotationConfig('sector_function')}
                      disabled={saving}
                      className={cn(
                        "px-3.5 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all cursor-pointer",
                        rotationConfig.mode === 'sector_function' ? "bg-white text-emerald-800 shadow-sm font-black" : "text-slate-500 hover:text-slate-800"
                      )}
                    >
                      Por Setor e Função
                    </button>
                  </div>
                </div>
                
                <div className="text-[11px] bg-white p-3 rounded-xl border border-slate-150 text-slate-600 font-medium leading-relaxed">
                  {rotationConfig.mode === 'sector' ? (
                    <span>
                      📌 <strong>Modo Atual: Fila por Setor.</strong> Todos os funcionários do setor selecionado disputam a mesma fila de prioridade. Ao ciclar a fila, o primeiro da lista geral do setor passa a ser o último.
                    </span>
                  ) : (
                    <span>
                      📌 <strong>Modo Atual: Fila por Setor e Função.</strong> Cada cargo/função dentro do setor terá sua própria fila independente de rodízio. O primeiro funcionário daquela função específica passará para o final da fila de sua própria função ao final do ano, sem interferir com outras funções.
                    </span>
                  )}
                </div>

                {/* Custom Rotation Counts Configuration */}
                <div className="pt-3 border-t border-slate-200 space-y-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 text-emerald-600 animate-spin-slow" />
                      Quantidade de Funcionários a Girar por Ciclo
                    </span>
                    <p className="text-[10px] text-slate-500 font-medium">
                      Defina quantos funcionários do topo da fila serão movidos para o final juntos ao rotacionar a fila de cada setor.
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {sectors.map(sec => {
                      const currentCount = localCounts?.[sec.id] !== undefined ? localCounts[sec.id] : (sec.id === 'secagem' ? 6 : sec.id === 'enfardamento' ? 10 : 1);
                      return (
                        <div key={sec.id} className="flex items-center justify-between p-3 bg-white border border-slate-150 rounded-xl gap-2 shadow-sm">
                          <div className="flex flex-col">
                            <span className="text-[11px] font-bold text-slate-700">{sec.name}</span>
                            <span className="text-[10px] text-slate-400 font-medium">Giro atual: {rotationConfig.counts?.[sec.id] !== undefined ? rotationConfig.counts[sec.id] : (sec.id === 'secagem' ? 6 : sec.id === 'enfardamento' ? 10 : 1)} {currentCount === 1 ? 'membro' : 'membros'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="1"
                              max="50"
                              value={currentCount}
                              onChange={(e) => {
                                const val = Math.max(1, parseInt(e.target.value) || 1);
                                setLocalCounts(prev => ({
                                  ...prev,
                                  [sec.id]: val
                                }));
                              }}
                              onBlur={async () => {
                                const newCounts = {
                                  ...rotationConfig.counts,
                                  [sec.id]: currentCount
                                };
                                await handleSaveRotationConfig(rotationConfig.mode, newCounts, true);
                              }}
                              onKeyDown={async (e) => {
                                if (e.key === 'Enter') {
                                  const newCounts = {
                                    ...rotationConfig.counts,
                                    [sec.id]: currentCount
                                  };
                                  await handleSaveRotationConfig(rotationConfig.mode, newCounts, true);
                                  (e.target as HTMLInputElement).blur();
                                }
                              }}
                              className="w-16 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-center focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Admin actions for queue */}
            {(isAdmin || profile?.role === 'manager') && (
              <div className="flex flex-wrap gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-150 justify-between items-center">
                <span className="text-xs font-bold text-slate-600">Ações Administrativas:</span>
                <div className="flex gap-3">
                  <button
                    onClick={handleInitializeQueue}
                    disabled={saving}
                    className="px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Sincronizar Fila
                  </button>
                  <button
                    onClick={handleCycleQueue}
                    disabled={saving}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer shadow-md"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Ciclar Fila (Girar Rodízio)
                  </button>
                </div>
              </div>
            )}

            {queueItems.filter(qi => {
              if (qi.sectorId !== queueSectorId) return false;
              if (rotationConfig.mode === 'sector_function') {
                return (qi as any).cargoId === queueCargoId;
              }
              return true;
            }).length === 0 ? (
              <div className="text-center py-16 px-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <TrendingUp className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600 font-bold">Sem fila configurada para este critério</p>
                <p className="text-slate-400 text-xs max-w-sm mx-auto mt-1">
                  Sendo administrador, use o botão "Sincronizar Fila" acima para importar e organizar os membros de {queueSectorId === 'secagem' ? 'Secagem' : 'Enfardamento'}.
                </p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 uppercase font-black tracking-widest border-b border-slate-200">
                      <th className="p-4 w-20 text-center">Posição</th>
                      <th className="p-4">Colaborador</th>
                      <th className="p-4">Data Última Ciclo / Escolha</th>
                      {(isAdmin || profile?.role === 'manager') && <th className="p-4 w-28 text-center">Ordenar</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {queueItems
                      .filter(qi => {
                        if (qi.sectorId !== queueSectorId) return false;
                        if (rotationConfig.mode === 'sector_function') {
                          return (qi as any).cargoId === queueCargoId;
                        }
                        return true;
                      })
                      .sort((a, b) => a.position - b.position)
                      .map((item, index, arr) => (
                        <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50 font-semibold text-slate-700">
                          <td className="p-4 text-center">
                            <span className={cn(
                              "w-7 h-7 rounded-full inline-flex items-center justify-center font-black",
                              index === 0 ? "bg-amber-100 text-amber-700 font-extrabold" : "bg-slate-100 text-slate-600"
                            )}>
                              {item.position}
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="font-extrabold text-slate-800">{item.userName}</div>
                            <div className="text-[10px] text-slate-400 font-medium">
                              {allUsers.find(u => u.uid === item.userId)?.cargoName || 'Sem cargo atribuído'}
                            </div>
                          </td>
                          <td className="p-4 font-bold text-slate-500">
                            {item.lastYearSelectionDate ? item.lastYearSelectionDate : 'Ainda não ciclou'}
                          </td>
                          {(isAdmin || profile?.role === 'manager') && (
                            <td className="p-4 text-center">
                              <div className="inline-flex gap-1.5">
                                <button
                                  disabled={index === 0}
                                  onClick={() => moveQueueItem(index, 'up')}
                                  className="p-1 text-slate-400 hover:text-emerald-600 disabled:opacity-30 cursor-pointer"
                                  title="Subir prioridade"
                                >
                                  <ChevronUp className="w-5 h-5" />
                                </button>
                                <button
                                  disabled={index === arr.length - 1}
                                  onClick={() => moveQueueItem(index, 'down')}
                                  className="p-1 text-slate-400 hover:text-emerald-600 disabled:opacity-30 cursor-pointer"
                                  title="Descer prioridade"
                                >
                                  <ChevronDown className="w-5 h-5" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB: LIMIT CONFIGS (ADMIN-ONLY) */}
        {activeTab === 'limits' && (isAdmin || profile?.role === 'manager') && (
          <div className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm space-y-6">
            <div className="space-y-1 pb-4 border-b border-slate-100">
              <h2 className="text-xl font-extrabold text-slate-900 uppercase tracking-tight flex items-center gap-2">
                <Settings className="w-5 h-5 text-emerald-600" />
                Limite de Férias Simultâneas por Mês
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Configure a quantidade limite de colaboradores do mesmo cargo ou da mesma letra que podem se afastar no mesmo mês do ano.
              </p>
            </div>

            <form onSubmit={handleSaveLimits} className="space-y-8">
              {/* Limit by Cargo */}
              <div className="space-y-4">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Limites por Cargo / Função</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {functions.map(f => (
                    <div key={f.id} className="p-4 border border-slate-250 rounded-2xl bg-slate-50 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">{f.name}</span>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={limitConfig.byCargo?.[f.name] ?? 2}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10) || 1;
                          setLimitConfig((prev: any) => ({
                            ...prev,
                            byCargo: {
                              ...prev.byCargo,
                              [f.name]: val
                            }
                          }));
                        }}
                        className="w-20 px-3 py-2 bg-white border border-slate-200 rounded-xl text-center text-xs font-black text-emerald-600 focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Limit by Letter/Group */}
              <div className="space-y-4">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Limites por Letra de Escala</h3>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
                  {['A', 'B', 'C', 'D', 'E'].map(g => (
                    <div key={g} className="p-4 border border-slate-250 rounded-2xl bg-slate-50 flex items-center justify-between">
                      <span className="text-xs font-black text-slate-700">Letra {g}</span>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={limitConfig.byGroup?.[g] ?? 1}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10) || 1;
                          setLimitConfig((prev: any) => ({
                            ...prev,
                            byGroup: {
                              ...prev.byGroup,
                              [g]: val
                            }
                          }));
                        }}
                        className="w-16 px-3 py-2 bg-white border border-slate-200 rounded-xl text-center text-xs font-black text-emerald-600 focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="px-6 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-800 transition-all shadow-xl flex items-center gap-2"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Salvar Limites
              </button>
            </form>
          </div>
        )}

        {/* TAB: REPORTS & BIRTHDAYS */}
        {activeTab === 'reports' && (
          <div className="space-y-8">
            <div className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="space-y-1">
                  <h2 className="text-xl font-extrabold text-slate-900 uppercase tracking-tight flex items-center gap-2">
                    <FileText className="w-5 h-5 text-emerald-600" />
                    Relatório Mensal de Férias
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    Acompanhamento de quem está afastado e dos aniversariantes do mês selecionado.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-500">Mês do Ano:</span>
                  <select
                    value={reportMonth}
                    onChange={(e) => setReportMonth(parseInt(e.target.value, 10))}
                    className="bg-slate-100 border border-slate-200 rounded-xl px-4 py-2 text-xs font-black text-emerald-600 focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="1">Janeiro</option>
                    <option value="2">Fevereiro</option>
                    <option value="3">Março</option>
                    <option value="4">Abril</option>
                    <option value="5">Maio</option>
                    <option value="6">Junho</option>
                    <option value="7">Julho</option>
                    <option value="8">Agosto</option>
                    <option value="9">Setembro</option>
                    <option value="10">Outubro</option>
                    <option value="11">Novembro</option>
                    <option value="12">Dezembro</option>
                  </select>
                </div>
              </div>

              {/* Vacationers Grid */}
              <div className="space-y-4">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-emerald-600" />
                  Colaboradores Afastados de Férias ({getVacationersByMonth(reportMonth).length})
                </h3>

                {getVacationersByMonth(reportMonth).length === 0 ? (
                  <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-center text-xs text-slate-500 font-semibold">
                    Nenhum colaborador com férias aprovadas para este mês.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {getVacationersByMonth(reportMonth).map(req => {
                      const limits = checkVacationLimits(reportMonth, req.sectorId || '', req.cargoId || '', req.group || '');
                      return (
                        <div key={req.id} className="p-5 border border-slate-200 rounded-2xl bg-white space-y-3 shadow-sm hover:border-emerald-250 transition-all">
                          <div className="flex justify-between items-start gap-2">
                            <div>
                              <h4 className="font-extrabold text-slate-800">{req.userName}</h4>
                              <p className="text-[10px] text-slate-400 font-bold mt-0.5 uppercase tracking-wide">
                                {req.cargoName} • Letra {req.group}
                              </p>
                            </div>
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 shrink-0">
                              {req.days} dias
                            </span>
                          </div>

                          <div className="p-3 bg-slate-50 rounded-xl text-xs font-bold text-slate-600 flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {new Date(req.startDate).toLocaleDateString('pt-BR')} até {new Date(req.endDate).toLocaleDateString('pt-BR')}
                          </div>

                          {/* Simultaneous counter warnings */}
                          <div className="space-y-1 text-[10px] font-semibold text-slate-500 pt-1 border-t border-slate-100">
                            <div>
                              Limite por Cargo ({req.cargoName}): {' '}
                              <span className={cn(
                                "font-bold",
                                limits.cargoExceeded ? "text-rose-600" : "text-emerald-600"
                              )}>
                                {limits.cargoCount} de {limits.cargoLimit}
                              </span>
                            </div>
                            <div>
                              Limite por Letra ({req.group}): {' '}
                              <span className={cn(
                                "font-bold",
                                limits.groupExceeded ? "text-rose-600" : "text-emerald-600"
                              )}>
                                {limits.groupCount} de {limits.groupLimit}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Birthday Boys/Girls Column */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Cake className="w-4 h-4 text-rose-500" />
                  Aniversariantes do Mês ({getBirthdaysByMonth(reportMonth).length})
                </h3>

                {getBirthdaysByMonth(reportMonth).length === 0 ? (
                  <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-center text-xs text-slate-500 font-semibold">
                    Nenhum aniversário cadastrado neste mês.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {getBirthdaysByMonth(reportMonth).map(u => {
                      const day = u.birthDate ? u.birthDate.split('-')[2] : '';
                      return (
                        <div key={u.uid} className="p-4 border border-slate-150 rounded-2xl bg-rose-50/20 flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                            <Cake className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="font-extrabold text-slate-800 text-xs">{u.displayName}</h4>
                            <p className="text-[10px] text-slate-500 font-semibold">
                              Dia {day} de {reportMonth === 1 ? 'Janeiro' : reportMonth === 2 ? 'Fevereiro' : reportMonth === 3 ? 'Março' : reportMonth === 4 ? 'Abril' : reportMonth === 5 ? 'Maio' : reportMonth === 6 ? 'Junho' : reportMonth === 7 ? 'Julho' : reportMonth === 8 ? 'Agosto' : reportMonth === 9 ? 'Setembro' : reportMonth === 10 ? 'Outubro' : reportMonth === 11 ? 'Novembro' : 'Dezembro'}
                            </p>
                            <p className="text-[9px] text-slate-400 mt-0.5">{u.sectorName || 'Setor não definido'}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB: ADMIN PANELS (APPROVALS & USER MANAGEMENT) */}
        {activeTab === 'admin_panel' && (isAdmin || profile?.role === 'manager') && (
          <div className="space-y-8">
            
            {/* Sector/Function Creators */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Sector Creator */}
              <div className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm space-y-4">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                  <Settings className="w-4 h-4 text-emerald-600" />
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
              <div className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm space-y-4">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                  <Settings className="w-4 h-4 text-emerald-600" />
                  Criar Funções por Setor
                </h3>
                <form onSubmit={handleAddFunction} className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
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

            {/* Pending Approvals */}
            <div className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm space-y-6">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2 border-b border-slate-100 pb-3">
                <Clock className="w-4 h-4 text-amber-500" />
                Solicitações Pendentes de Aprovação ({requests.filter(r => r.status === 'pending').length})
              </h3>

              {requests.filter(r => r.status === 'pending').length === 0 ? (
                <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-center text-xs text-slate-500 font-semibold">
                  Tudo em ordem! Nenhuma solicitação aguardando revisão.
                </div>
              ) : (
                <div className="space-y-4">
                  {requests.filter(r => r.status === 'pending').map((req) => {
                    const reqMonth = new Date(req.startDate).getMonth() + 1;
                    const limits = checkVacationLimits(reqMonth, req.sectorId || '', req.cargoId || '', req.group || '');
                    
                    return (
                      <div key={req.id} className="p-5 border border-slate-200 rounded-2xl bg-white hover:border-emerald-150 transition-all flex flex-col lg:flex-row justify-between gap-5 shadow-sm">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="font-extrabold text-slate-800 text-sm">{req.userName}</span>
                            <span className="bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase px-2.5 py-1 rounded-md">
                              {req.days} dias
                            </span>
                            <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded uppercase">
                              Letra {req.group || 'N/D'}
                            </span>
                            {req.thirteenthAdvance && (
                              <span className="bg-amber-50 border border-amber-250 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                                <Gift className="w-3 h-3" />
                                Antecipação 13º
                              </span>
                            )}
                          </div>

                          <div className="text-xs font-bold text-slate-700">
                            Período: {new Date(req.startDate).toLocaleDateString('pt-BR')} até {new Date(req.endDate).toLocaleDateString('pt-BR')}
                          </div>

                          <p className="text-xs text-slate-500 font-medium">
                            Setor: {req.sectorName} • Cargo: {req.cargoName} • E-mail: {req.userEmail}
                          </p>

                          {/* Simultaneous limit counters displayed on request review */}
                          <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-4 text-[10px] font-semibold text-slate-500">
                            <div className="flex items-center gap-1">
                              <span className={cn(
                                "w-2.5 h-2.5 rounded-full inline-block",
                                limits.cargoExceeded ? "bg-rose-500" : "bg-emerald-500"
                              )}></span>
                              Simultâneos de {req.cargoName}: {limits.cargoCount} de {limits.cargoLimit}
                            </div>
                            <div className="flex items-center gap-1">
                              <span className={cn(
                                "w-2.5 h-2.5 rounded-full inline-block",
                                limits.groupExceeded ? "bg-rose-500" : "bg-emerald-500"
                              )}></span>
                              Simultâneos de Letra {req.group}: {limits.groupCount} de {limits.groupLimit}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 lg:self-center shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingReq(req);
                              setEditStartDate(req.startDate);
                              setEditDays(req.days);
                              setEditThirteenthAdvance(!!req.thirteenthAdvance);
                              setEditStatus(req.status);
                            }}
                            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer"
                          >
                            <Settings className="w-4 h-4 text-slate-500" />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApproveRequest(req)}
                            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                          >
                            <Check className="w-4 h-4" />
                            Aprovar
                          </button>
                          <button
                            type="button"
                            onClick={() => setRejectingReq(req)}
                            className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                            Recusar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* General Requests History for Admin */}
            <div className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm space-y-6">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2 border-b border-slate-100 pb-3">
                <Calendar className="w-4 h-4 text-slate-500" />
                Histórico de Todas as Solicitações ({requests.length})
              </h3>

              {requests.length === 0 ? (
                <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-center text-xs text-slate-500 font-semibold">
                  Nenhuma solicitação registrada no sistema.
                </div>
              ) : (
                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                  {requests.map((req) => {
                    return (
                      <div key={req.id} className="p-4 border border-slate-150 rounded-2xl bg-slate-50/50 hover:border-slate-300 transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-xs">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-slate-800">{req.userName}</span>
                            <span className={cn(
                              "text-[9px] font-black uppercase px-2 py-0.5 rounded-md",
                              req.status === 'approved' && "bg-emerald-50 text-emerald-700 border border-emerald-100",
                              req.status === 'pending' && "bg-amber-50 text-amber-700 border border-amber-100",
                              req.status === 'rejected' && "bg-rose-50 text-rose-700 border border-rose-100"
                            )}>
                              {req.status === 'approved' ? 'Aprovado' : req.status === 'pending' ? 'Pendente' : 'Recusado'}
                            </span>
                            <span className="bg-slate-100 text-slate-600 text-[9px] font-bold px-1.5 py-0.5 rounded">
                              {req.days} dias
                            </span>
                            {req.thirteenthAdvance && (
                              <span className="bg-amber-50 border border-amber-250 text-amber-700 text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                                <Gift className="w-2.5 h-2.5" />
                                Antecipação 13º
                              </span>
                            )}
                          </div>
                          <div className="font-semibold text-slate-700">
                            Período: {new Date(req.startDate + 'T00:00:00').toLocaleDateString('pt-BR')} até {new Date(req.endDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                          </div>
                          <div className="text-slate-400 text-[10px] font-medium">
                            Setor: {req.sectorName} • Cargo: {req.cargoName}
                          </div>
                          {req.rejectedReason && (
                            <p className="text-[10px] text-rose-600 font-bold bg-rose-50 p-1.5 rounded-lg mt-1">
                              Motivo da recusa: {req.rejectedReason}
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setEditingReq(req);
                            setEditStartDate(req.startDate);
                            setEditDays(req.days);
                            setEditThirteenthAdvance(!!req.thirteenthAdvance);
                            setEditStatus(req.status);
                          }}
                          className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl font-bold flex items-center gap-1 cursor-pointer transition-all shrink-0 shadow-sm"
                        >
                          <Settings className="w-3.5 h-3.5 text-slate-500" />
                          Editar
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Collaborators list with Sector/Cargo Assignment & T-shirt size controls */}
            <div className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm space-y-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-600" />
                    Atribuição de Setores, Cargos & Brindes (Camisas)
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
                      setColabFilterCargo('all'); // Reset cargo filter
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
                <span>Exibindo <strong>{
                  allUsers.filter(u => {
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
                  }).length
                }</strong> de <strong>{allUsers.length}</strong> colaboradores</span>
                {(colabSearch || colabFilterSector !== 'all' || colabFilterCargo !== 'all' || colabFilterSize !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setColabSearch('');
                      setColabFilterSector('all');
                      setColabFilterCargo('all');
                      setColabFilterSize('all');
                    }}
                    className="text-emerald-600 hover:text-emerald-700 font-bold transition-all"
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
                    {allUsers
                      .filter(colab => {
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
                      })
                      .sort((a, b) => {
                        const nameA = a.displayName || '';
                        const nameB = b.displayName || '';
                        return nameA.localeCompare(nameB, 'pt-BR');
                      })
                      .map((colab) => {
                        // Internal editable states per user row to avoid massive re-renders
                        return <UserRow 
                          key={colab.uid} 
                          colab={colab} 
                          sectors={sectors} 
                          functions={functions} 
                          onSave={handleAssignUserRoleInfo}
                        />;
                      })
                    }
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

      </div>

      {/* Reject Reason justification modal overlay */}
      <AnimatePresence>
        {rejectingReq && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white w-full max-w-md rounded-[2.5rem] border border-slate-200 shadow-2xl p-6 md:p-8 space-y-5 relative">
              <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                Recusar Solicitação de Férias
              </h3>
              
              <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                Você está recusando a solicitação de férias de <strong>{rejectingReq.userName}</strong> de {new Date(rejectingReq.startDate).toLocaleDateString('pt-BR')} até {new Date(rejectingReq.endDate).toLocaleDateString('pt-BR')}. Informe o motivo:
              </p>

              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder="Ex: Excesso de simultâneos da função no mês / Necessidade operacional."
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-semibold focus:ring-2 focus:ring-rose-500 outline-none"
              />

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleRejectRequest}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl transition-all cursor-pointer uppercase tracking-wider text-center"
                >
                  Recusar Solicitação
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRejectingReq(null);
                    setRejectReason('');
                  }}
                  className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black rounded-xl transition-all cursor-pointer uppercase text-center"
                >
                  Voltar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Admin Edit Request modal overlay */}
      <AnimatePresence>
        {editingReq && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.95, opacity: 0 }} 
              className="bg-white w-full max-w-lg rounded-[2.5rem] border border-slate-200 shadow-2xl p-6 md:p-8 space-y-6 relative"
            >
              <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2 border-b border-slate-100 pb-3">
                <Settings className="w-5 h-5 text-emerald-600" />
                Editar Solicitação (Controle Admin)
              </h3>
              
              <div className="text-xs text-slate-500 font-semibold leading-relaxed">
                Você está editando a solicitação de férias de: <strong className="text-slate-800 text-sm block mt-0.5">{editingReq.userName}</strong>
              </div>

              <form onSubmit={handleSaveEditRequest} className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data de Início</label>
                  <input
                    type="date"
                    required
                    value={editStartDate}
                    onChange={(e) => setEditStartDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-medium focus:ring-2 focus:ring-emerald-500 transition-all outline-none mt-1"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Quantidade de dias</label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    required
                    value={editDays}
                    onChange={(e) => setEditDays(parseInt(e.target.value, 10) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-medium focus:ring-2 focus:ring-emerald-500 transition-all outline-none mt-1"
                  />
                </div>

                <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-150">
                  <input
                    id="editThirteenthAdvance"
                    type="checkbox"
                    checked={editThirteenthAdvance}
                    onChange={(e) => setEditThirteenthAdvance(e.target.checked)}
                    className="w-5 h-5 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500 cursor-pointer"
                  />
                  <label htmlFor="editThirteenthAdvance" className="text-xs font-bold text-slate-700 cursor-pointer select-none">
                    Desejo antecipação de 13º salário
                  </label>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Status da Solicitação</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-medium focus:ring-2 focus:ring-emerald-500 transition-all mt-1"
                  >
                    <option value="pending">Pendente</option>
                    <option value="approved">Aprovado</option>
                    <option value="rejected">Recusado</option>
                  </select>
                </div>

                {editStartDate && editDays > 0 && (
                  <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100 space-y-1 text-xs">
                    <p className="font-bold text-slate-500">Período de Férias Calculado:</p>
                    <p className="font-black text-slate-800">
                      {new Date(editStartDate + 'T00:00:00').toLocaleDateString('pt-BR')} até {new Date(calculateEndDate(editStartDate, editDays) + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </p>
                    <p className="font-semibold text-emerald-700">Total de {editDays} dias</p>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black rounded-xl transition-all cursor-pointer uppercase tracking-wider text-center animate-none"
                  >
                    {saving ? 'Salvando...' : 'Salvar Alterações'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingReq(null);
                    }}
                    className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black rounded-xl transition-all cursor-pointer uppercase text-center animate-none"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom PDF Export Options Modal */}
      <AnimatePresence>
        {isPdfModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.95, opacity: 0 }} 
              className="bg-white w-full max-w-lg rounded-[2.5rem] border border-slate-200 shadow-2xl p-6 md:p-8 space-y-6 relative"
            >
              <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2 border-b border-slate-100 pb-3">
                <FileText className="w-5 h-5 text-emerald-600" />
                Configurar Exportação de PDF
              </h3>

              <div className="space-y-4 text-xs font-semibold text-slate-700">
                {/* Scope */}
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Escopo da Exportação</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPdfScope('all')}
                      className={cn(
                        "p-3 rounded-xl border text-center transition-all cursor-pointer font-bold",
                        pdfScope === 'all' 
                          ? "bg-emerald-50 border-emerald-500 text-emerald-700" 
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                      )}
                    >
                      Todos ({allUsers.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPdfScope('filtered')}
                      className={cn(
                        "p-3 rounded-xl border text-center transition-all cursor-pointer font-bold",
                        pdfScope === 'filtered' 
                          ? "bg-emerald-50 border-emerald-500 text-emerald-700" 
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                      )}
                    >
                      Apenas Filtrados
                    </button>
                  </div>
                </div>

                {/* Sort Order */}
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Ordenação no Relatório</label>
                  <select
                    value={pdfSortOrder}
                    onChange={(e) => setPdfSortOrder(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-medium focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
                  >
                    <option value="name">Ordem Alfabética (por Nome)</option>
                    <option value="size">Agrupado por Tamanho de Camisa</option>
                    <option value="sector">Agrupado por Setor</option>
                  </select>
                </div>

                {/* Columns Selection */}
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Colunas para Incluir</label>
                  <div className="grid grid-cols-2 gap-2.5 bg-slate-50 p-4 rounded-2xl border border-slate-150">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={pdfCols.name}
                        onChange={(e) => setPdfCols(prev => ({ ...prev, name: e.target.checked }))}
                        className="w-4.5 h-4.5 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500 cursor-pointer"
                      />
                      <span>Nome</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={pdfCols.email}
                        onChange={(e) => setPdfCols(prev => ({ ...prev, email: e.target.checked }))}
                        className="w-4.5 h-4.5 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500 cursor-pointer"
                      />
                      <span>E-mail</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={pdfCols.sector}
                        onChange={(e) => setPdfCols(prev => ({ ...prev, sector: e.target.checked }))}
                        className="w-4.5 h-4.5 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500 cursor-pointer"
                      />
                      <span>Setor</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={pdfCols.cargo}
                        onChange={(e) => setPdfCols(prev => ({ ...prev, cargo: e.target.checked }))}
                        className="w-4.5 h-4.5 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500 cursor-pointer"
                      />
                      <span>Cargo</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={pdfCols.birthDate}
                        onChange={(e) => setPdfCols(prev => ({ ...prev, birthDate: e.target.checked }))}
                        className="w-4.5 h-4.5 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500 cursor-pointer"
                      />
                      <span>Data de Nasc.</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={pdfCols.size}
                        onChange={(e) => setPdfCols(prev => ({ ...prev, size: e.target.checked }))}
                        className="w-4.5 h-4.5 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500 cursor-pointer"
                      />
                      <span>Tamanho da Camisa</span>
                    </label>
                  </div>
                </div>

                {/* Additional options */}
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Opções do Layout</label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={pdfIncludeSummary}
                        onChange={(e) => setPdfIncludeSummary(e.target.checked)}
                        className="w-4.5 h-4.5 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500 cursor-pointer"
                      />
                      <span>Incluir resumo quantitativo</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={pdfIncludeDateTime}
                        onChange={(e) => setPdfIncludeDateTime(e.target.checked)}
                        className="w-4.5 h-4.5 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500 cursor-pointer"
                      />
                      <span>Incluir data e hora de geração</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleGenerateTshirtPdf}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl transition-all cursor-pointer uppercase tracking-wider text-center shadow-md"
                >
                  Confirmar e Gerar PDF
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

// UserRow sub-component for independent state handling
interface UserRowProps {
  key?: string;
  colab: UserProfile;
  sectors: WorkSector[];
  functions: WorkFunction[];
  onSave: (uid: string, sId: string, fId: string, groupLetter: string, bDate: string, tshirtSize: string) => Promise<void>;
}

function UserRow({ colab, sectors, functions, onSave }: UserRowProps) {
  const [sector, setSector] = useState(colab.sectorId || '');
  const [cargo, setCargo] = useState(colab.cargoId || '');
  const [group, setGroup] = useState(colab.group || '');
  const [birth, setBirth] = useState(colab.birthDate || '');
  const [tshirtSize, setTshirtSize] = useState(colab.tshirtSize || '');
  const [loading, setLoading] = useState(false);

  // Keep in sync with dynamic updates
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
