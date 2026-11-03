import React, { useState, useEffect, useMemo } from 'react';
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
  Sparkles,
  UserPlus,
  Trash2,
  RefreshCw,
  X,
  UserCheck,
  UserMinus,
  Edit2,
  UserX
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
import { fetchUsersSafely, getLocalCachedUsers, setLocalCachedUsers, updateCachedUserField, updateCachedUsersBulk, subscribeToUsers } from '../lib/usersCache';
import { subscribeSharedCollection } from '../lib/referenceCache';
import { decryptValue } from '../lib/crypto';
import { WorkSector, WorkFunction, UserProfile } from '../types';

export interface ManualRecipient {
  id: string;
  displayName: string;
  email?: string;
  sectorName?: string;
  cargoName?: string;
  group?: string;
  birthDate?: string;
  tshirtSize?: string;
  notes?: string;
  isManual: true;
  createdAt?: any;
}

export default function Assignments() {
  const { profile, user, isAdmin, isManager, isMaster } = useAuth();
  const isElevated = isAdmin || isManager || isMaster || profile?.role === 'manager' || profile?.role === 'master' || profile?.role === 'admin';

  // Data States
  const [sectors, setSectors] = useState<WorkSector[]>([]);
  const [functions, setFunctions] = useState<WorkFunction[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  
  // Manual Recipients State (Colaboradores que não usam o SecApp)
  const [manualRecipients, setManualRecipients] = useState<ManualRecipient[]>(() => {
    try {
      const raw = localStorage.getItem('secapp_manual_gift_recipients');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // Modal de Adicionar/Editar Colaborador Avulso
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualSector, setManualSector] = useState('');
  const [manualCargo, setManualCargo] = useState('');
  const [manualGroup, setManualGroup] = useState('');
  const [manualBirth, setManualBirth] = useState('');
  const [manualSize, setManualSize] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [editingManualId, setEditingManualId] = useState<string | null>(null);
  const [deleteRecipientTarget, setDeleteRecipientTarget] = useState<{ id: string; name: string } | null>(null);
  const [isDeletingRecipient, setIsDeletingRecipient] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
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
  const [colabFilterGroup, setColabFilterGroup] = useState('all');
  const [colabFilterSize, setColabFilterSize] = useState('all');
  const [colabFilterStatus, setColabFilterStatus] = useState<'active' | 'all' | 'blocked'>('active');
  const [colabSourceTab, setColabSourceTab] = useState<'all' | 'secapp' | 'manual'>('all');

  // PDF Export Customization States (com seleção individual de quem entra no PDF)
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [pdfScope, setPdfScope] = useState<'all' | 'filtered'>('all');
  const [pdfIncludeSummary, setPdfIncludeSummary] = useState(true);
  const [pdfIncludeDateTime, setPdfIncludeDateTime] = useState(true);
  const [pdfSortOrder, setPdfSortOrder] = useState<'name' | 'size' | 'sector'>('name');
  const [pdfSelectedIds, setPdfSelectedIds] = useState<Set<string>>(new Set());
  const [pdfModalSearch, setPdfModalSearch] = useState('');
  const [showQuickAddInPdfModal, setShowQuickAddInPdfModal] = useState(false);
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

  // Apenas o usuário jacksonbjr@gmail.com é invisível nas listagens
  // O colaborador institucional jackson.junior@eldoradobrasil.com.br DEVE FICAR VISÍVEL normalmente!
  const isMasterUser = (u: any) => {
    const email = (u?.email || '').toLowerCase().trim();
    return email === 'jacksonbjr@gmail.com';
  };

  // Helper to verify active users (não bloqueados ou desativados)
  const isActiveUser = (u: UserProfile) => {
    if (isMasterUser(u)) return false;
    if (u.disabled === true) return false;
    if (u.status === 'blocked') return false;
    if (!u.displayName || u.displayName.trim() === '' || u.displayName === 'Sem nome') return false;
    return true;
  };

  // Fetch all assignments data
  const fetchData = async (force = false, silent = false) => {
    try {
      if (!silent) setLoading(true);
      if (force) setIsRefreshing(true);
      
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
      const freshUsers = await fetchUsersSafely(force);
      setAllUsers((freshUsers as any[]).filter(u => !isMasterUser(u)));
      setLastSyncTime(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));

    } catch (err: any) {
      console.error('Error fetching assignments data:', err);
      setError('Falha ao carregar as atribuições e cadastros.');
    } finally {
      if (!silent) setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();

    // 1. Listen in real-time to sectors with shared cache
    const unsubSectors = subscribeSharedCollection('work_sectors', (sectorList) => {
      const combinedSectors = [...(sectorList as WorkSector[])];
      defaultSectors.forEach(ds => {
        if (!combinedSectors.some(s => s.id === ds.id)) combinedSectors.push(ds as any);
      });
      const activeSectors = combinedSectors.filter(s => s.active !== false);
      setSectors(activeSectors);
    }, 'name');

    // 2. Listen in real-time to functions with shared cache
    const unsubFunctions = subscribeSharedCollection('work_functions', (functionList) => {
      const combinedFunctions = [...(functionList as WorkFunction[])];
      defaultFunctions.forEach(df => {
        if (!combinedFunctions.some(f => f.id === df.id)) combinedFunctions.push(df as any);
      });
      const activeFunctions = combinedFunctions.filter(f => f.active !== false);
      setFunctions(activeFunctions);
    }, 'name');

    // 3. Listen in real-time to user updates from shared decrypted cache
    const unsubUsers = subscribeToUsers((cachedUsers) => {
      setAllUsers((cachedUsers as any[]).filter(u => !isMasterUser(u)));
      setLastSyncTime(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    });

    // 4. Listen in real-time to manual recipients (colaboradores avulsos para brindes)
    const unsubManual = onSnapshot(collection(db, 'manual_gift_recipients'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data(), isManual: true } as ManualRecipient));
      list.sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-BR'));
      setManualRecipients(list);
      try {
        localStorage.setItem('secapp_manual_gift_recipients', JSON.stringify(list));
      } catch {}
    }, (err) => {
      console.warn('Manual recipients subscription notice:', err);
    });

    return () => {
      unsubSectors();
      unsubFunctions();
      unsubUsers();
      unsubManual();
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
      const raw = groupLetter ? groupLetter.trim().toUpperCase() : '';
      const normGroup = raw.startsWith('ADM') ? 'ADM' : raw;

      const updateData = {
        sectorId: sId || null,
        sectorName: selectedS?.name || null,
        cargoId: fId || null,
        cargoName: selectedF?.name || null,
        group: normGroup || null,
        birthDate: bDate || null,
        tshirtSize: tshirtSize || null,
        updatedAt: serverTimestamp()
      };

      const userRef = doc(db, 'users', uid);
      try {
        await updateDoc(userRef, updateData);
      } catch (uErr) {
        await setDoc(userRef, updateData, { merge: true });
      }

      updateCachedUserField(uid, {
        sectorId: sId || '',
        sectorName: selectedS?.name || '',
        cargoId: fId || '',
        cargoName: selectedF?.name || '',
        group: normGroup,
        birthDate: bDate || '',
        tshirtSize: tshirtSize || ''
      });

      setAllUsers(prev => prev.map(u => u.uid === uid ? {
        ...u,
        sectorId: sId || undefined,
        sectorName: selectedS?.name || undefined,
        cargoId: fId || undefined,
        cargoName: selectedF?.name || undefined,
        group: normGroup as any,
        birthDate: bDate || undefined,
        tshirtSize: tshirtSize || undefined
      } : u));

      setSuccess('Dados de trabalho do usuário atualizados com sucesso.');
    } catch (err) {
      console.error('Error assigning user role info:', err);
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
      const matchesGroup = colabFilterGroup === 'all' ||
        (colabFilterGroup === 'none' && !u.group) ||
        (u.group === colabFilterGroup) ||
        (colabFilterGroup === 'ADM' && (u.group || '').toUpperCase().startsWith('ADM'));
      const matchesSize = colabFilterSize === 'all' || 
        (colabFilterSize === 'none' && !u.tshirtSize) ||
        (u.tshirtSize === colabFilterSize);
      return matchesSearch && matchesSector && matchesCargo && matchesGroup && matchesSize;
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
      const bulkUpdatesList: { uid: string; fields: Partial<UserProfile> }[] = [];

      for (const u of targetUsers) {
        const updateData: any = {
          updatedAt: serverTimestamp()
        };
        const cachePatch: any = {};

        if (bulkSector !== '') {
          const selectedS = sectors.find(s => s.id === bulkSector);
          updateData.sectorId = bulkSector || null;
          updateData.sectorName = selectedS?.name || null;
          updateData.cargoId = null;
          updateData.cargoName = null;
          cachePatch.sectorId = bulkSector || '';
          cachePatch.sectorName = selectedS?.name || '';
          cachePatch.cargoId = '';
          cachePatch.cargoName = '';
        }
        if (bulkCargo !== '') {
          const selectedF = functions.find(f => f.id === bulkCargo);
          updateData.cargoId = bulkCargo || null;
          updateData.cargoName = selectedF?.name || null;
          cachePatch.cargoId = bulkCargo || '';
          cachePatch.cargoName = selectedF?.name || '';
        }
        if (bulkGroup !== '') {
          if (bulkGroup === 'none') {
            updateData.group = null;
            cachePatch.group = '';
          } else {
            const rawG = bulkGroup.trim().toUpperCase();
            const normG = rawG.startsWith('ADM') ? 'ADM' : rawG;
            updateData.group = normG;
            cachePatch.group = normG;
          }
        }
        if (bulkSize !== '') {
          updateData.tshirtSize = bulkSize || null;
          cachePatch.tshirtSize = bulkSize || '';
        }

        const userDocRef = doc(db, 'users', u.uid);
        try {
          await updateDoc(userDocRef, updateData);
        } catch (uErr) {
          await setDoc(userDocRef, updateData, { merge: true });
        }
        bulkUpdatesList.push({ uid: u.uid, fields: cachePatch });
        updatedCount++;
      }

      if (bulkUpdatesList.length > 0) {
        updateCachedUsersBulk(bulkUpdatesList);
        setAllUsers(prev => {
          const patchMap = new Map(bulkUpdatesList.map(item => [item.uid, item.fields]));
          return prev.map(u => {
            const patch = patchMap.get(u.uid);
            return patch ? { ...u, ...patch } : u;
          });
        });
      }
      
      setSuccess(`Edição geral concluída! ${updatedCount} colaborador(es) atualizado(s) com sucesso.`);
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

  // Manual Recipients CRUD (Funcionários que não usam o SecApp)
  const handleSaveManualRecipient = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!manualName.trim()) {
      alert('Preencha o nome do colaborador.');
      return;
    }
    try {
      setSaving(true);
      const id = editingManualId || `manual_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const payload: ManualRecipient = {
        id,
        displayName: manualName.trim(),
        email: manualEmail.trim() || '',
        sectorName: manualSector.trim() || 'Outro Setor',
        cargoName: manualCargo.trim() || 'Colaborador',
        group: manualGroup || '',
        birthDate: manualBirth || '',
        tshirtSize: manualSize || '',
        notes: manualNotes.trim() || '',
        isManual: true,
        createdAt: serverTimestamp()
      };

      await setDoc(doc(db, 'manual_gift_recipients', id), payload, { merge: true });
      
      setManualRecipients(prev => {
        const without = prev.filter(m => m.id !== id);
        const updated = [...without, payload].sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-BR'));
        try { localStorage.setItem('secapp_manual_gift_recipients', JSON.stringify(updated)); } catch {}
        return updated;
      });

      // Automatically include in PDF selection
      setPdfSelectedIds(prev => new Set(prev).add(id));

      setSuccess(`Colaborador avulso "${payload.displayName}" ${editingManualId ? 'atualizado' : 'adicionado'} com sucesso!`);
      // Reset form
      setManualName('');
      setManualSector('');
      setManualCargo('');
      setManualGroup('');
      setManualBirth('');
      setManualSize('');
      setManualEmail('');
      setManualNotes('');
      setEditingManualId(null);
      setIsManualModalOpen(false);
      setShowQuickAddInPdfModal(false);
    } catch (err: any) {
      console.error('Error saving manual recipient:', err);
      setError('Erro ao salvar colaborador avulso.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteManualRecipient = (id: string, name: string) => {
    setDeleteRecipientTarget({ id, name });
  };

  const confirmDeleteManualRecipient = async () => {
    if (!deleteRecipientTarget) return;
    const { id, name } = deleteRecipientTarget;
    try {
      setIsDeletingRecipient(true);
      // 1. Optimistic removal from local state & cache
      setManualRecipients(prev => {
        const updated = prev.filter(m => m.id !== id);
        try { localStorage.setItem('secapp_manual_gift_recipients', JSON.stringify(updated)); } catch {}
        return updated;
      });
      setPdfSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });

      // 2. Remove from Firestore
      try {
        await deleteDoc(doc(db, 'manual_gift_recipients', id));
      } catch (fErr: any) {
        console.warn('Firestore deletion sync notice:', fErr);
      }

      setSuccess(`Colaborador avulso "${name}" removido com sucesso.`);
      setDeleteRecipientTarget(null);
      if (editingManualId === id) {
        setIsManualModalOpen(false);
        setEditingManualId(null);
      }
    } catch (err: any) {
      console.error(err);
      setError('Erro ao remover colaborador avulso.');
    } finally {
      setIsDeletingRecipient(false);
    }
  };

  const handleEditManualRecipient = (m: ManualRecipient) => {
    setEditingManualId(m.id);
    setManualName(m.displayName);
    setManualSector(m.sectorName || '');
    setManualCargo(m.cargoName || '');
    setManualGroup(m.group || '');
    setManualBirth(m.birthDate || '');
    setManualSize(m.tshirtSize || '');
    setManualEmail(m.email || '');
    setManualNotes(m.notes || '');
    setIsManualModalOpen(true);
  };

  // Filtered SecApp users (com suporte para status ativo/inativo)
  const filteredSecAppUsers = useMemo(() => {
    return allUsers.filter(colab => {
      // O usuário jacksonbjr@gmail.com é master e não aparece em nenhuma lista
      if (isMasterUser(colab)) return false;

      // 1. Status Filter (Ativo / Bloqueado / Todos)
      if (colabFilterStatus === 'active' && !isActiveUser(colab)) return false;
      if (colabFilterStatus === 'blocked' && isActiveUser(colab)) return false;

      // 2. Search Filter
      const matchesSearch = !colabSearch || 
        (colab.displayName && colab.displayName.toLowerCase().includes(colabSearch.toLowerCase())) ||
        (colab.email && colab.email.toLowerCase().includes(colabSearch.toLowerCase()));

      // 3. Sector Filter
      const matchesSector = colabFilterSector === 'all' || 
        (colabFilterSector === 'none' && !colab.sectorId) ||
        (colab.sectorId === colabFilterSector);

      // 4. Cargo Filter
      const matchesCargo = colabFilterCargo === 'all' || 
        (colabFilterCargo === 'none' && !colab.cargoId) ||
        (colab.cargoId === colabFilterCargo);

      // 5. Group Filter
      const matchesGroup = colabFilterGroup === 'all' || 
        (colabFilterGroup === 'none' && !colab.group) ||
        (colab.group === colabFilterGroup) ||
        (colabFilterGroup === 'ADM' && (colab.group || '').toUpperCase().startsWith('ADM'));

      // 6. Size Filter
      const matchesSize = colabFilterSize === 'all' || 
        (colabFilterSize === 'none' && !colab.tshirtSize) ||
        (colab.tshirtSize === colabFilterSize);

      return matchesSearch && matchesSector && matchesCargo && matchesGroup && matchesSize;
    }).sort((a, b) => (a.displayName || '').localeCompare(b.displayName || '', 'pt-BR'));
  }, [allUsers, colabFilterStatus, colabSearch, colabFilterSector, colabFilterCargo, colabFilterGroup, colabFilterSize]);

  // Filtered Manual Recipients
  const filteredManualRecipients = useMemo(() => {
    return manualRecipients.filter(m => {
      const s = colabSearch.toLowerCase();
      const matchesSearch = !colabSearch || 
        m.displayName.toLowerCase().includes(s) ||
        (m.email && m.email.toLowerCase().includes(s)) ||
        (m.sectorName && m.sectorName.toLowerCase().includes(s));
      const matchesSector = colabFilterSector === 'all' || 
        (m.sectorName && m.sectorName.toLowerCase().includes(colabFilterSector.toLowerCase()));
      const matchesCargo = colabFilterCargo === 'all' || 
        (m.cargoName && m.cargoName.toLowerCase().includes(colabFilterCargo.toLowerCase()));
      const matchesGroup = colabFilterGroup === 'all' || 
        (colabFilterGroup === 'none' && !m.group) ||
        (m.group === colabFilterGroup) ||
        (colabFilterGroup === 'ADM' && (m.group || '').toUpperCase().startsWith('ADM'));
      const matchesSize = colabFilterSize === 'all' || 
        (colabFilterSize === 'none' && !m.tshirtSize) ||
        (m.tshirtSize === colabFilterSize);
      return matchesSearch && matchesSector && matchesCargo && matchesGroup && matchesSize;
    }).sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-BR'));
  }, [manualRecipients, colabSearch, colabFilterSector, colabFilterCargo, colabFilterGroup, colabFilterSize]);

  // Combined active list for displays
  const activeSecAppUsersCount = useMemo(() => allUsers.filter(isActiveUser).length, [allUsers]);

  const pdfModalCandidates = useMemo(() => {
    const secAppList = (pdfScope === 'filtered' ? filteredSecAppUsers : allUsers.filter(isActiveUser)).map(u => ({
      id: u.uid,
      displayName: u.displayName || 'Sem Nome',
      sectorName: u.sectorName || 'Sem Setor',
      cargoName: u.cargoName || 'Sem Cargo',
      tshirtSize: u.tshirtSize || 'Sem Camisa',
      group: u.group || '',
      isManual: false
    }));

    const manualList = (pdfScope === 'filtered' ? filteredManualRecipients : manualRecipients).map(m => ({
      id: m.id,
      displayName: m.displayName,
      sectorName: m.sectorName || 'Outro Setor',
      cargoName: m.cargoName || 'Externo / Avulso',
      tshirtSize: m.tshirtSize || 'Sem Camisa',
      group: m.group || '',
      isManual: true
    }));

    const combined = [...secAppList, ...manualList];
    if (!pdfModalSearch.trim()) return combined;
    const s = pdfModalSearch.toLowerCase();
    return combined.filter(c => 
      c.displayName.toLowerCase().includes(s) || 
      c.sectorName.toLowerCase().includes(s) || 
      c.cargoName.toLowerCase().includes(s) ||
      c.tshirtSize.toLowerCase().includes(s)
    );
  }, [pdfScope, filteredSecAppUsers, allUsers, filteredManualRecipients, manualRecipients, pdfModalSearch]);

  const totalGiftCounts = useMemo(() => {
    const list = [
      ...allUsers.filter(isActiveUser),
      ...manualRecipients
    ];
    const counts: Record<string, number> = {
      PP: 0, P: 0, M: 0, G: 0, GG: 0, XG: 0, XXG: 0, XXXG: 0, Nenhum: 0
    };
    list.forEach(item => {
      const sz = item.tshirtSize;
      if (sz && counts[sz] !== undefined) {
        counts[sz]++;
      } else {
        counts['Nenhum']++;
      }
    });
    return counts;
  }, [allUsers, manualRecipients]);

  const handleQuickSaveManualRecipient = async (id: string, group: string, tshirtSize: string) => {
    try {
      await updateDoc(doc(db, 'manual_gift_recipients', id), {
        group: group || null,
        tshirtSize: tshirtSize || null,
        updatedAt: serverTimestamp()
      });
      setManualRecipients(prev => prev.map(m => m.id === id ? { ...m, group, tshirtSize } : m));
      setSuccess('Colaborador avulso atualizado com sucesso.');
    } catch (err) {
      console.error(err);
      setError('Erro ao salvar alterações.');
    }
  };

  // Open PDF Modal initializing selection
  const handleOpenPdfModal = () => {
    const ids = new Set<string>();
    filteredSecAppUsers.forEach(u => ids.add(u.uid));
    filteredManualRecipients.forEach(m => ids.add(m.id));
    setPdfSelectedIds(ids);
    setPdfModalSearch('');
    setShowQuickAddInPdfModal(false);
    setIsPdfModalOpen(true);
  };

  // Toggle selection in PDF
  const togglePdfCollaborator = (id: string) => {
    setPdfSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllPdf = (items: Array<{ id: string }>) => {
    setPdfSelectedIds(prev => {
      const next = new Set(prev);
      items.forEach(item => next.add(item.id));
      return next;
    });
  };

  const handleDeselectAllPdf = () => {
    setPdfSelectedIds(new Set());
  };

  // Generate T-Shirt Sizes Report PDF with Individual Participant Control
  const handleGenerateTshirtPdf = () => {
    // 1. Gather all checked SecApp users
    const selectedSecApp = allUsers
      .filter(u => pdfSelectedIds.has(u.uid))
      .map(u => ({
        id: u.uid,
        displayName: u.displayName || 'Sem Nome',
        email: u.email || '',
        sectorName: u.sectorName || 'Nao Definido',
        cargoName: u.cargoName || 'Nao Definido',
        birthDate: u.birthDate || '',
        tshirtSize: u.tshirtSize || 'Nao Definido',
        group: u.group || '',
        isManual: false
      }));

    // 2. Gather all checked Manual recipients
    const selectedManual = manualRecipients
      .filter(m => pdfSelectedIds.has(m.id))
      .map(m => ({
        id: m.id,
        displayName: `${m.displayName} (Avulso)`,
        email: m.email || m.notes || '-',
        sectorName: m.sectorName || 'Outro Setor',
        cargoName: m.cargoName || 'Externo / Avulso',
        birthDate: m.birthDate || '',
        tshirtSize: m.tshirtSize || 'Nao Definido',
        group: m.group || '',
        isManual: true
      }));

    let targetParticipants = [...selectedSecApp, ...selectedManual];

    if (targetParticipants.length === 0) {
      alert('Nenhum colaborador foi selecionado para o PDF. Marque ao menos um colaborador na lista.');
      return;
    }

    if (pdfSortOrder === 'name') {
      targetParticipants.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || '', 'pt-BR'));
    } else if (pdfSortOrder === 'size') {
      targetParticipants.sort((a, b) => (a.tshirtSize || 'ZZZ').localeCompare(b.tshirtSize || 'ZZZ'));
    } else if (pdfSortOrder === 'sector') {
      targetParticipants.sort((a, b) => (a.sectorName || 'ZZZ').localeCompare(b.sectorName || 'ZZZ'));
    }

    const doc = new jsPDF();
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
    doc.text(sanitizePdfText(`SecAPP - Eldorado Brasil Celulose | Controle Administrativo (${targetParticipants.length} Colaboradores)`), 14, 20);

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
      
      targetParticipants.forEach(u => {
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
      doc.text(sanitizePdfText(`RESUMO TOTAL DE UNIDADES A PRODUZIR (${targetParticipants.length} PEÇAS):`), 18, startY + 6);

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
      { id: 'index', header: '#', getValue: (u: any, idx: number) => String(idx + 1) },
      { id: 'name', header: 'Colaborador', getValue: (u: any) => u.displayName || 'Sem Nome', enabled: pdfCols.name },
      { id: 'email', header: 'E-mail / Obs', getValue: (u: any) => u.email || '', enabled: pdfCols.email },
      { id: 'sector', header: 'Setor', getValue: (u: any) => u.sectorName || 'Nao Definido', enabled: pdfCols.sector },
      { id: 'cargo', header: 'Cargo / Funcao', getValue: (u: any) => u.cargoName || 'Nao Definido', enabled: pdfCols.cargo },
      { id: 'birthDate', header: 'Data Nasc.', getValue: (u: any) => u.birthDate ? u.birthDate.split('-').reverse().join('/') : 'Nao Definido', enabled: pdfCols.birthDate },
      { id: 'size', header: 'Tam. Camisa', getValue: (u: any) => u.tshirtSize || 'Nao Definido', enabled: pdfCols.size }
    ];

    const activeCols = columnsConfig.filter(c => c.id === 'index' || c.enabled);
    const headers = activeCols.map(c => sanitizePdfText(c.header));
    
    const tableBody = targetParticipants.map((u, idx) => {
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

  const filteredUsers = filteredSecAppUsers;

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
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-600" />
                Atribuição Geral de Colaboradores & Brindes
              </h3>
              {lastSyncTime && (
                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-full">
                  Sincronizado: {lastSyncTime}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Lista sempre atualizada com usuários ativos do SecApp e colaboradores avulsos de outros setores (caldeira, manutenção, almoxarifado, etc.).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <button
              type="button"
              onClick={() => fetchData(true)}
              disabled={isRefreshing}
              title="Recarregar usuários ativos e atualizações do servidor"
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-slate-200"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 text-slate-500", isRefreshing && "animate-spin text-emerald-600")} />
              <span>{isRefreshing ? 'Atualizando...' : 'Atualizar Lista'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingManualId(null);
                setManualName('');
                setManualSector('');
                setManualCargo('');
                setManualGroup('');
                setManualBirth('');
                setManualSize('');
                setManualEmail('');
                setManualNotes('');
                setIsManualModalOpen(true);
              }}
              className="px-3.5 py-2 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <UserPlus className="w-3.5 h-3.5 text-sky-600" />
              <span>+ Colaborador Avulso</span>
            </button>

            <button
              type="button"
              onClick={() => setShowBulkEdit(!showBulkEdit)}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer border border-slate-200 shadow-xs"
            >
              <Settings className="w-3.5 h-3.5 text-slate-500" />
              <span>Edição Geral</span>
            </button>

            <button
              type="button"
              onClick={handleOpenPdfModal}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-sm ml-auto lg:ml-0"
            >
              <FileText className="w-4 h-4" />
              <span>Gerar PDF de Camisas</span>
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
                  <option value="none">Remover Letra (Nenhuma)</option>
                  <option value="A">Letra A</option>
                  <option value="B">Letra B</option>
                  <option value="C">Letra C</option>
                  <option value="D">Letra D</option>
                  <option value="E">Letra E</option>
                  <option value="ADM">ADM</option>
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

        {/* Source Switcher Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setColabSourceTab('all')}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5",
                colabSourceTab === 'all'
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-600"
              )}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Todos ({filteredSecAppUsers.length + filteredManualRecipients.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setColabSourceTab('secapp')}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5",
                colabSourceTab === 'secapp'
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-600"
              )}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Usuários SecApp ({filteredSecAppUsers.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setColabSourceTab('manual')}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5",
                colabSourceTab === 'manual'
                  ? "bg-sky-600 text-white shadow-xs"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-600"
              )}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Avulsos / Outros Setores ({filteredManualRecipients.length})</span>
            </button>
          </div>

          <div className="text-[11px] font-bold text-slate-400">
            {colabFilterStatus === 'active' ? (
              <span className="text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1 inline-flex">
                <Check className="w-3 h-3 text-emerald-600" />
                Filtrando apenas colaboradores ativos
              </span>
            ) : colabFilterStatus === 'blocked' ? (
              <span className="text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 inline-flex items-center gap-1">
                <UserX className="w-3 h-3 text-rose-600" />
                Exibindo inativos / bloqueados
              </span>
            ) : (
              <span className="text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg inline-flex items-center gap-1">
                Exibindo todos os registros
              </span>
            )}
          </div>
        </div>

        {/* T-Shirt Size Distribution Dashboard */}
        <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
              <Gift className="w-3.5 h-3.5 text-slate-400" />
              Distribuição de Camisas (Ativos SecApp + Colaboradores Avulsos)
            </p>
            <span className="text-[10px] font-extrabold text-slate-500">
              Total Geral: {Object.values(totalGiftCounts).reduce((a: number, b: number) => a + b, 0)} pessoas
            </span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-2">
            {[
              { label: 'PP', count: totalGiftCounts['PP'] || 0 },
              { label: 'P', count: totalGiftCounts['P'] || 0 },
              { label: 'M', count: totalGiftCounts['M'] || 0 },
              { label: 'G', count: totalGiftCounts['G'] || 0 },
              { label: 'GG', count: totalGiftCounts['GG'] || 0 },
              { label: 'XG', count: totalGiftCounts['XG'] || 0 },
              { label: 'XXG', count: totalGiftCounts['XXG'] || 0 },
              { label: 'XXXG', count: totalGiftCounts['XXXG'] || 0 },
              { label: 'Nenhum', count: totalGiftCounts['Nenhum'] || 0 },
            ].map((size) => (
              <div key={size.label} className="bg-white border border-slate-150 rounded-xl p-2.5 text-center shadow-xs">
                <p className="text-[10px] font-extrabold text-slate-400">{size.label}</p>
                <p className="text-base font-black text-slate-800 mt-0.5">{size.count}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Dynamic Filtering & Search for Quick Editing */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 bg-slate-50/50 border border-slate-150 rounded-2xl p-4">
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
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Status no SecApp</label>
            <select
              value={colabFilterStatus}
              onChange={(e) => setColabFilterStatus(e.target.value as any)}
              className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-700 mt-1 outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
            >
              <option value="active">Apenas Ativos (Padrão)</option>
              <option value="all">Todos os Cadastros</option>
              <option value="blocked">Apenas Inativos/Bloqueados</option>
            </select>
          </div>

          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Filtrar por Setor</label>
            <select
              value={colabFilterSector}
              onChange={(e) => {
                setColabFilterSector(e.target.value);
                setColabFilterCargo('all');
              }}
              className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-700 mt-1 outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
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
              className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-700 mt-1 outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-60 cursor-pointer"
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
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Filtrar por Letra / Escala</label>
            <select
              value={colabFilterGroup}
              onChange={(e) => setColabFilterGroup(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-700 mt-1 outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
            >
              <option value="all">Todas as Letras / Escalas</option>
              <option value="none">Sem Letra Definida</option>
              <option value="A">Letra A</option>
              <option value="B">Letra B</option>
              <option value="C">Letra C</option>
              <option value="D">Letra D</option>
              <option value="E">Letra E</option>
              <option value="ADM">ADM</option>
            </select>
          </div>

          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Filtrar por Camisa</label>
            <select
              value={colabFilterSize}
              onChange={(e) => setColabFilterSize(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-700 mt-1 outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
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
          <span>
            Exibindo{' '}
            <strong>
              {colabSourceTab === 'all'
                ? filteredSecAppUsers.length + filteredManualRecipients.length
                : colabSourceTab === 'secapp'
                ? filteredSecAppUsers.length
                : filteredManualRecipients.length
              }
            </strong>{' '}
            colaborador(es)
            {colabSourceTab === 'all' && (
              <span className="text-slate-400 font-normal ml-1">
                ({filteredSecAppUsers.length} SecApp + {filteredManualRecipients.length} Avulsos)
              </span>
            )}
          </span>

          {(colabSearch || colabFilterStatus !== 'active' || colabFilterSector !== 'all' || colabFilterCargo !== 'all' || colabFilterGroup !== 'all' || colabFilterSize !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setColabSearch('');
                setColabFilterStatus('active');
                setColabFilterSector('all');
                setColabFilterCargo('all');
                setColabFilterGroup('all');
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
                <th className="p-4">E-mail / Contato</th>
                <th className="p-4">Setor</th>
                <th className="p-4">Cargo / Função</th>
                <th className="p-4">Letra (Escala)</th>
                <th className="p-4">Data Nasc.</th>
                <th className="p-4">Tam. Camisa</th>
                <th className="p-4 w-28 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {/* 1. SecApp Users */}
              {colabSourceTab !== 'manual' && filteredSecAppUsers.map((colab) => (
                <UserAssignmentRow 
                  key={colab.uid} 
                  colab={colab} 
                  sectors={sectors} 
                  functions={functions} 
                  onSave={handleAssignUserRoleInfo}
                />
              ))}

              {/* 2. Manual Recipients (Outros setores que não usam SecApp) */}
              {colabSourceTab !== 'secapp' && filteredManualRecipients.map((rec) => (
                <ManualRecipientRow
                  key={rec.id}
                  recipient={rec}
                  onEdit={handleEditManualRecipient}
                  onDelete={handleDeleteManualRecipient}
                  onSaveQuick={handleQuickSaveManualRecipient}
                />
              ))}

              {/* Empty state */}
              {((colabSourceTab === 'all' && filteredSecAppUsers.length === 0 && filteredManualRecipients.length === 0) ||
                (colabSourceTab === 'secapp' && filteredSecAppUsers.length === 0) ||
                (colabSourceTab === 'manual' && filteredManualRecipients.length === 0)) && (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-slate-400 font-medium">
                    <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-bold text-slate-600">Nenhum colaborador encontrado com os filtros selecionados.</p>
                    <p className="text-xs text-slate-400 mt-1">Experimente limpar a busca ou cadastrar um colaborador avulso.</p>
                    <button
                      type="button"
                      onClick={() => setIsManualModalOpen(true)}
                      className="mt-3 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-black inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Cadastrar Colaborador Avulso
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Recipient Modal (Cadastrar / Editar funcionário avulso) */}
      <AnimatePresence>
        {isManualModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white w-full max-w-lg rounded-[2.5rem] border border-slate-200 shadow-2xl p-6 md:p-8 space-y-6 relative max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-sky-600" />
                  {editingManualId ? 'Editar Colaborador Avulso' : 'Novo Colaborador Avulso (Sem SecApp)'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-slate-500 font-medium -mt-2">
                Cadastre funcionários de outros setores (Caldeira, Almoxarifado, Silvicultura, Manutenção) que não utilizam o app mas devem constar no controle de brindes e no relatório em PDF.
              </p>

              <form onSubmit={handleSaveManualRecipient} className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                    Nome Completo *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="E.g., Carlos Eduardo da Silva"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-semibold focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                      Setor de Trabalho
                    </label>
                    <input
                      type="text"
                      list="sectorSuggestions"
                      placeholder="E.g., Caldeira, Almoxarifado"
                      value={manualSector}
                      onChange={(e) => setManualSector(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-semibold focus:ring-2 focus:ring-sky-500 outline-none"
                    />
                    <datalist id="sectorSuggestions">
                      {sectors.map(s => <option key={s.id} value={s.name} />)}
                      <option value="Caldeira" />
                      <option value="Almoxarifado" />
                      <option value="Manutenção Mecânica" />
                      <option value="Manutenção Elétrica" />
                      <option value="Silvicultura" />
                      <option value="Utilidades" />
                    </datalist>
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                      Cargo / Função
                    </label>
                    <input
                      type="text"
                      placeholder="E.g., Operador de Caldeira, Mecânico"
                      value={manualCargo}
                      onChange={(e) => setManualCargo(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-semibold focus:ring-2 focus:ring-sky-500 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                      Letra / Escala
                    </label>
                    <select
                      value={manualGroup}
                      onChange={(e) => setManualGroup(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-sky-500 outline-none cursor-pointer"
                    >
                      <option value="">Nenhuma</option>
                      <option value="A">Letra A</option>
                      <option value="B">Letra B</option>
                      <option value="C">Letra C</option>
                      <option value="D">Letra D</option>
                      <option value="E">Letra E</option>
                      <option value="ADM">ADM</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                      Data Nascimento
                    </label>
                    <input
                      type="date"
                      value={manualBirth}
                      onChange={(e) => setManualBirth(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-medium focus:ring-2 focus:ring-sky-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                      Tamanho Camisa
                    </label>
                    <select
                      value={manualSize}
                      onChange={(e) => setManualSize(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-sky-500 outline-none cursor-pointer"
                    >
                      <option value="">Não Definido</option>
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                      E-mail / Telefone (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="E-mail ou ramal/telefone"
                      value={manualEmail}
                      onChange={(e) => setManualEmail(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-semibold focus:ring-2 focus:ring-sky-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                      Observações (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="E.g., Terceirizado / Caldeira"
                      value={manualNotes}
                      onChange={(e) => setManualNotes(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-semibold focus:ring-2 focus:ring-sky-500 outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-3 border-t border-slate-100">
                  {editingManualId && (
                    <button
                      type="button"
                      onClick={() => {
                        handleDeleteManualRecipient(editingManualId, manualName || 'Colaborador');
                      }}
                      className="px-4 py-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-black rounded-xl transition-all cursor-pointer uppercase flex items-center justify-center gap-1.5"
                    >
                      <Trash2 className="w-4 h-4 text-rose-600" />
                      <span>Excluir</span>
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 py-3 bg-sky-600 hover:bg-sky-700 text-white text-xs font-black rounded-xl transition-all cursor-pointer uppercase tracking-wider text-center flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    {saving ? 'Salvando...' : editingManualId ? 'Salvar Alterações' : 'Adicionar Colaborador'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsManualModalOpen(false)}
                    className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black rounded-xl transition-all cursor-pointer uppercase text-center"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal for Deleting Manual Recipient */}
      <AnimatePresence>
        {deleteRecipientTarget && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white w-full max-w-md rounded-[2rem] border border-slate-200 shadow-2xl p-6 md:p-8 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                  <Trash2 className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-black text-slate-900">Excluir Colaborador Avulso</h4>
                  <p className="text-xs text-slate-500 font-medium">Esta remoção é imediata e não afeta o SecApp.</p>
                </div>
              </div>

              <div className="bg-rose-50/50 border border-rose-100 rounded-2xl p-4 text-xs text-slate-700 space-y-1">
                <p>Tem certeza de que deseja excluir permanentemente:</p>
                <p className="text-sm font-black text-slate-900">{deleteRecipientTarget.name}</p>
                <p className="text-[11px] text-slate-500">O colaborador será removido do cadastro e de futuras listas de brindes.</p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  disabled={isDeletingRecipient}
                  onClick={confirmDeleteManualRecipient}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isDeletingRecipient ? 'Excluindo...' : 'Sim, Excluir Colaborador'}</span>
                </button>
                <button
                  type="button"
                  disabled={isDeletingRecipient}
                  onClick={() => setDeleteRecipientTarget(null)}
                  className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black transition-all cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PDF Export Modal with Individual Inclusion/Exclusion Control & Quick Add */}
      <AnimatePresence>
        {isPdfModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white w-full max-w-2xl rounded-[2.5rem] border border-slate-200 shadow-2xl p-6 md:p-8 space-y-5 relative max-h-[92vh] flex flex-col">
              {/* Modal Header */}
              <div className="flex items-start justify-between border-b border-slate-100 pb-3 shrink-0">
                <div>
                  <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                    <FileText className="w-5 h-5 text-emerald-600" />
                    Personalizar Relatório PDF de Camisas
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Marque ou desmarque individualmente quem vai para o PDF, ou adicione colaboradores de outros setores.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPdfModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Modal Content */}
              <div className="space-y-4 text-xs font-semibold text-slate-700 overflow-y-auto pr-1 flex-1">
                {/* Selection Counter Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-slate-800">
                      Selecionados: <strong className="text-emerald-700 text-sm font-black">{pdfSelectedIds.size}</strong> de {pdfModalCandidates.length}
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold">
                      ({pdfModalCandidates.filter(c => !c.isManual && pdfSelectedIds.has(c.id)).length} SecApp + {pdfModalCandidates.filter(c => c.isManual && pdfSelectedIds.has(c.id)).length} Avulsos)
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleSelectAllPdf(pdfModalCandidates)}
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-black text-slate-700 cursor-pointer transition-all"
                    >
                      Marcar Todos
                    </button>
                    <button
                      type="button"
                      onClick={handleDeselectAllPdf}
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-black text-slate-700 cursor-pointer transition-all"
                    >
                      Desmarcar Todos
                    </button>
                  </div>
                </div>

                {/* Quick Add Inline Collapsible Section */}
                <div className="border border-sky-200 bg-sky-50/40 rounded-2xl p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <UserPlus className="w-4 h-4 text-sky-600" />
                      <span className="text-xs font-black text-sky-900">
                        Faltou alguém de outro setor?
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowQuickAddInPdfModal(!showQuickAddInPdfModal)}
                      className="px-2.5 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-[10px] font-black cursor-pointer transition-all"
                    >
                      {showQuickAddInPdfModal ? 'Fechar Cadastro Rápido' : '+ Adicionar Colaborador Agora'}
                    </button>
                  </div>

                  {showQuickAddInPdfModal && (
                    <div className="pt-2 border-t border-sky-100 space-y-2">
                      <p className="text-[10px] text-sky-800 font-semibold">
                        Cadastre o funcionário abaixo (ex: da Caldeira ou Almoxarifado) e ele será imediatamente salvo e marcado no PDF:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                        <input
                          type="text"
                          placeholder="Nome Completo *"
                          value={manualName}
                          onChange={(e) => setManualName(e.target.value)}
                          className="bg-white border border-sky-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:ring-1 focus:ring-sky-500 sm:col-span-2"
                        />
                        <input
                          type="text"
                          placeholder="Setor (ex: Caldeira)"
                          value={manualSector}
                          onChange={(e) => setManualSector(e.target.value)}
                          className="bg-white border border-sky-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:ring-1 focus:ring-sky-500"
                        />
                        <select
                          value={manualSize}
                          onChange={(e) => setManualSize(e.target.value)}
                          className="bg-white border border-sky-200 rounded-xl px-2 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-1 focus:ring-sky-500"
                        >
                          <option value="">Tam. Camisa</option>
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
                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => handleSaveManualRecipient()}
                          disabled={saving || !manualName.trim()}
                          className="px-4 py-2 bg-sky-700 hover:bg-sky-800 text-white rounded-xl text-xs font-black cursor-pointer transition-all disabled:opacity-40"
                        >
                          {saving ? 'Adicionando...' : 'Adicionar e Marcar no PDF'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Participant Checklist with Search Filter */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Participantes do PDF (Marque quem entra, desmarque quem sai):
                    </label>
                    <input
                      type="text"
                      placeholder="Filtrar colaborador no modal..."
                      value={pdfModalSearch}
                      onChange={(e) => setPdfModalSearch(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-[11px] font-medium outline-none focus:ring-1 focus:ring-emerald-500 w-44"
                    />
                  </div>

                  <div className="border border-slate-200 rounded-2xl max-h-56 overflow-y-auto divide-y divide-slate-100 bg-white">
                    {pdfModalCandidates.map((c) => {
                      const isChecked = pdfSelectedIds.has(c.id);
                      return (
                        <div
                          key={c.id}
                          className={cn(
                            "flex items-center justify-between p-2.5 px-3 transition-colors",
                            isChecked ? "bg-white hover:bg-slate-50" : "bg-slate-50/70 opacity-60 hover:opacity-90"
                          )}
                        >
                          <label className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => togglePdfCollaborator(c.id)}
                              className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={cn("text-xs font-bold truncate", isChecked ? "text-slate-900" : "text-slate-500 line-through")}>
                                  {c.displayName}
                                </span>
                                {c.isManual ? (
                                  <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-sky-100 text-sky-800">
                                    Avulso
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700">
                                    SecApp
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-400 truncate">
                                {c.sectorName} &bull; {c.cargoName} {c.group ? `&bull; Letra ${c.group}` : ''}
                              </p>
                            </div>
                          </label>

                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <span className="inline-block text-[10px] font-black px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                              Tam: {c.tshirtSize || 'N/D'}
                            </span>
                            <button
                              type="button"
                              onClick={() => togglePdfCollaborator(c.id)}
                              title={isChecked ? "Tirar do PDF" : "Incluir no PDF"}
                              className={cn(
                                "text-[10px] font-black px-2 py-0.5 rounded transition-all cursor-pointer",
                                isChecked
                                  ? "text-rose-600 hover:bg-rose-50"
                                  : "text-emerald-700 hover:bg-emerald-50"
                              )}
                            >
                              {isChecked ? 'Tirar' : 'Incluir'}
                            </button>
                            {c.isManual && (
                              <button
                                type="button"
                                onClick={() => handleDeleteManualRecipient(c.id, c.displayName)}
                                title="Excluir colaborador avulso definitivamente"
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-all cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {pdfModalCandidates.length === 0 && (
                      <div className="p-6 text-center text-slate-400 text-xs">
                        Nenhum colaborador encontrado com o termo "{pdfModalSearch}".
                      </div>
                    )}
                  </div>
                </div>

                {/* PDF Configuration (Header & Options) */}
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
                      <span>Incluir Quadro de Resumo de Quantidades (Total Geral a Produzir)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={pdfIncludeDateTime}
                        onChange={(e) => setPdfIncludeDateTime(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Incluir Data e Hora de Geração no Topo</span>
                    </label>
                  </div>
                </div>

                {/* Columns Selection */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Colunas a Exibir no Relatório:</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={pdfCols.name} onChange={(e) => setPdfCols(prev => ({ ...prev, name: e.target.checked }))} className="rounded text-emerald-600 focus:ring-emerald-500" />
                      <span>Nome</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={pdfCols.email} onChange={(e) => setPdfCols(prev => ({ ...prev, email: e.target.checked }))} className="rounded text-emerald-600 focus:ring-emerald-500" />
                      <span>E-mail / Obs</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={pdfCols.sector} onChange={(e) => setPdfCols(prev => ({ ...prev, sector: e.target.checked }))} className="rounded text-emerald-600 focus:ring-emerald-500" />
                      <span>Setor</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={pdfCols.cargo} onChange={(e) => setPdfCols(prev => ({ ...prev, cargo: e.target.checked }))} className="rounded text-emerald-600 focus:ring-emerald-500" />
                      <span>Cargo / Função</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={pdfCols.birthDate} onChange={(e) => setPdfCols(prev => ({ ...prev, birthDate: e.target.checked }))} className="rounded text-emerald-600 focus:ring-emerald-500" />
                      <span>Data Nasc.</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={pdfCols.size} onChange={(e) => setPdfCols(prev => ({ ...prev, size: e.target.checked }))} className="rounded text-emerald-600 focus:ring-emerald-500" />
                      <span>Tamanho Camisa</span>
                    </label>
                  </div>
                </div>

                {/* Sort Order */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ordenação das Linhas:</label>
                  <select
                    value={pdfSortOrder}
                    onChange={(e) => setPdfSortOrder(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold focus:ring-1 focus:ring-emerald-500 outline-none cursor-pointer"
                  >
                    <option value="name">Alfabética (Por Nome do Colaborador)</option>
                    <option value="size">Por Tamanho de Camisa (PP &gt; P &gt; M &gt; G...)</option>
                    <option value="sector">Por Setor de Trabalho</option>
                  </select>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-3 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={handleGenerateTshirtPdf}
                  disabled={pdfSelectedIds.size === 0}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl transition-all cursor-pointer uppercase tracking-wider text-center flex items-center justify-center gap-2 shadow-sm disabled:opacity-40"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar Relatório PDF ({pdfSelectedIds.size} Colaboradores)</span>
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
          value={(group || '').toUpperCase().startsWith('ADM') ? 'ADM' : (group || '')}
          onChange={async (e) => {
            const val = e.target.value;
            setGroup(val);
            await onSave(colab.uid, sector, cargo, val, birth, tshirtSize);
          }}
          className={cn(
            "border rounded px-2 py-1 text-[11px] font-bold outline-none",
            group ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-700 border-slate-200"
          )}
        >
          <option value="">Nenhuma</option>
          <option value="A">Letra A</option>
          <option value="B">Letra B</option>
          <option value="C">Letra C</option>
          <option value="D">Letra D</option>
          <option value="E">Letra E</option>
          <option value="ADM">ADM</option>
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

// ManualRecipientRow component for external collaborators who don't use SecApp
interface ManualRecipientRowProps {
  key?: string;
  recipient: ManualRecipient;
  onEdit: (m: ManualRecipient) => void;
  onDelete: (id: string, name: string) => void;
  onSaveQuick: (id: string, group: string, tshirtSize: string) => Promise<void>;
}

function ManualRecipientRow({ recipient, onEdit, onDelete, onSaveQuick }: ManualRecipientRowProps) {
  const [group, setGroup] = useState(recipient.group || '');
  const [tshirtSize, setTshirtSize] = useState(recipient.tshirtSize || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setGroup(recipient.group || '');
    setTshirtSize(recipient.tshirtSize || '');
  }, [recipient]);

  const handleQuickSave = async () => {
    setSaving(true);
    await onSaveQuick(recipient.id, group, tshirtSize);
    setSaving(false);
  };

  return (
    <tr className="border-b border-sky-100 bg-sky-50/20 hover:bg-sky-50/40 font-semibold text-slate-700 transition-colors">
      <td className="p-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-extrabold text-slate-800">{recipient.displayName}</span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black bg-sky-100 text-sky-800 border border-sky-200">
            Avulso
          </span>
        </div>
      </td>
      <td className="p-3 text-slate-500 font-medium text-[10px] break-all">
        {recipient.email || recipient.notes || <span className="text-slate-400 italic">Sem contato</span>}
      </td>
      <td className="p-3 font-bold text-slate-700 text-[11px]">
        {recipient.sectorName || 'Outro Setor'}
      </td>
      <td className="p-3 font-medium text-slate-600 text-[11px]">
        {recipient.cargoName || 'Colaborador'}
      </td>
      <td className="p-3">
        <select
          value={(group || '').toUpperCase().startsWith('ADM') ? 'ADM' : (group || '')}
          onChange={(e) => setGroup(e.target.value)}
          className={cn(
            "border rounded px-2 py-1 text-[11px] font-bold outline-none",
            group ? "bg-sky-50 text-sky-700 border-sky-200" : "bg-slate-50 text-slate-700 border-slate-200"
          )}
        >
          <option value="">Nenhuma</option>
          <option value="A">Letra A</option>
          <option value="B">Letra B</option>
          <option value="C">Letra C</option>
          <option value="D">Letra D</option>
          <option value="E">Letra E</option>
          <option value="ADM">ADM</option>
        </select>
      </td>
      <td className="p-3 text-slate-600 text-[11px] whitespace-nowrap">
        {recipient.birthDate ? recipient.birthDate.split('-').reverse().join('/') : '-'}
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
        <div className="flex items-center justify-center gap-1.5">
          <button
            onClick={handleQuickSave}
            disabled={saving}
            title="Salvar alterações rápidas"
            className="p-1 px-2.5 bg-slate-900 text-white rounded font-black uppercase text-[10px] hover:bg-slate-800 disabled:opacity-40 transition-all cursor-pointer"
          >
            {saving ? '...' : 'Salvar'}
          </button>
          <button
            onClick={() => onEdit(recipient)}
            title="Editar cadastro completo"
            className="p-1 text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded transition-all cursor-pointer"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(recipient.id, recipient.displayName)}
            title="Excluir da lista"
            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-all cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}
