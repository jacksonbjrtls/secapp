import React, { useState, useEffect } from 'react';
import { 
  collection, 
  updateDoc, 
  doc, 
  deleteDoc,
  query,
  where,
  getDoc,
  getDocs,
  orderBy,
  limit,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { WireBatch, WireCoil, WireSupplier, ProductionLine, WireStorageBay } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { QRCameraScanner } from './QRCameraScanner';
import { parseWireQRCode } from '../../lib/wireUtils';
import { 
  History, 
  Search, 
  Calendar, 
  Truck, 
  FileText, 
  Weight, 
  Edit2, 
  Trash2, 
  X, 
  Check,
  ChevronRight,
  Package,
  Save,
  Loader2,
  User,
  Barcode,
  Clock,
  Factory,
  MapPin,
  Plus,
  Camera,
  AlertTriangle,
  CheckCircle2,
  PackagePlus,
  AlertCircle,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, safeToDate, formatDateBR } from '../../lib/utils';
import { ConfirmationModal } from '../ui/ConfirmationModal';

interface HistoryTabProps {
  batches: WireBatch[];
  suppliers: WireSupplier[];
  lines: ProductionLine[];
  isAdmin: boolean;
  isManager: boolean;
  startDate: string;
  endDate: string;
  storageBays: WireStorageBay[];
  coils?: WireCoil[];
}

export const HistoryTab: React.FC<HistoryTabProps> = ({ 
  batches, 
  suppliers, 
  lines, 
  isAdmin,
  isManager,
  startDate,
  endDate,
  storageBays,
  coils = []
}) => {
  const [viewMode, setViewMode] = useState<'batches' | 'consumptions'>('batches');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDiameter, setFilterDiameter] = useState<string>('');
  const [consumptionHistory, setConsumptionHistory] = useState<WireCoil[]>([]);
  const [editingBatch, setEditingBatch] = useState<WireBatch | null>(null);
  const [editingCoil, setEditingCoil] = useState<WireCoil | null>(null);
  const [loading, setLoading] = useState(false);
  const { profile, user } = useAuth();
  const [selectedBatchDetails, setSelectedBatchDetails] = useState<WireCoil[] | null>(null);
  const [isViewingDetails, setIsViewingDetails] = useState<string | null>(null);
  
  // State for adding coils to an existing batch
  const [addCoilsTargetBatch, setAddCoilsTargetBatch] = useState<WireBatch | null>(null);
  const [pendingNewCoils, setPendingNewCoils] = useState<Array<{
    coilNumber: string;
    diameter: number;
    weight: number;
    isDamaged: boolean;
  }>>([]);
  const [newCoilInput, setNewCoilInput] = useState<{
    coilNumber: string;
    diameter: number;
    weight: string;
    isDamaged: boolean;
  }>({
    coilNumber: '',
    diameter: 2.30,
    weight: '',
    isDamaged: false
  });
  const [showScanner, setShowScanner] = useState(false);
  const [addingCoilsLoading, setAddingCoilsLoading] = useState(false);
  const [addCoilsError, setAddCoilsError] = useState('');

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
    onConfirm?: () => void;
    showConfirmButton?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'success'
  });

  const closeModal = () => setModalConfig(prev => ({ ...prev, isOpen: false }));

  const fetchConsumptions = async () => {
    setLoading(true);
    try {
      let q = query(
        collection(db, 'wire_coils'), 
        where('status', '==', 'consumed'),
        orderBy('consumedAt', 'desc')
      );

      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        q = query(q, where('consumedAt', '>=', start));
      }

      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        q = query(q, where('consumedAt', '<=', end));
      }

      if (!startDate && !endDate) {
        q = query(q, limit(50));
      }

      const snap = await getDocs(q);
      const coils = snap.docs.map(d => ({ id: d.id, ...d.data() } as WireCoil));
      setConsumptionHistory(coils);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (viewMode === 'consumptions') {
      fetchConsumptions();
    }
  }, [viewMode, startDate, endDate]);

  const filteredBatches = batches.filter(batch => {
    const term = searchTerm.trim().toLowerCase();
    const matchesBatch = !term || 
      batch.nfNumber.toLowerCase().includes(term) ||
      batch.supplierName.toLowerCase().includes(term);
    
    const matchesCoil = Boolean(
      term && coils && coils.some(c => c.batchId === batch.id && c.coilNumber.toLowerCase().includes(term))
    );

    if (!matchesBatch && !matchesCoil) return false;

    if (startDate || endDate) {
      const batchDate = new Date(batch.date);
      if (startDate && batchDate < new Date(startDate)) return false;
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (batchDate > end) return false;
      }
    }

    return true;
  });

  const filteredConsumptions = consumptionHistory.filter(coil => {
    const matchesSearch = coil.coilNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (coil.consumedBy || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDiameter = !filterDiameter || coil.diameter.toString() === filterDiameter;
    return matchesSearch && matchesDiameter;
  });

  const handleEditBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBatch) return;

    setLoading(true);
    try {
      const supplierName = suppliers.find(s => s.id === editingBatch.supplierId)?.name || editingBatch.supplierName;
      await updateDoc(doc(db, 'wire_batches', editingBatch.id), {
        nfNumber: editingBatch.nfNumber,
        date: editingBatch.date,
        supplierId: editingBatch.supplierId,
        supplierName,
        storageBayId: editingBatch.storageBayId || '',
        storageBayName: editingBatch.storageBayName || ''
      });

      // Also update storage location in all associated coils
      const q = query(collection(db, 'wire_coils'), where('batchId', '==', editingBatch.id));
      const coilsSnap = await getDocs(q);
      const updatePromises = coilsSnap.docs.map(coilDoc => 
        updateDoc(doc(db, 'wire_coils', coilDoc.id), {
          storageBayId: editingBatch.storageBayId || '',
          storageBayName: editingBatch.storageBayName || ''
        })
      );
      await Promise.all(updatePromises);

      setEditingBatch(null);
      setModalConfig({
        isOpen: true,
        title: 'Sucesso!',
        message: 'Lançamento atualizado com sucesso!',
        type: 'success'
      });
    } catch (err) {
      console.error(err);
      setModalConfig({
        isOpen: true,
        title: 'Erro',
        message: 'Erro ao atualizar lançamento.',
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEditCoil = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCoil) return;

    setLoading(true);
    try {
      const updateData: any = {
        diameter: editingCoil.diameter,
        weight: editingCoil.weight,
        coilNumber: editingCoil.coilNumber
      };

      if (editingCoil.consumedIn) {
        updateData.consumedIn = editingCoil.consumedIn;
      }

      await updateDoc(doc(db, 'wire_coils', editingCoil.id), updateData);
      
      // Update local state for the details view if it's open
      if (selectedBatchDetails) {
        setSelectedBatchDetails(prev => 
          prev ? prev.map(c => c.id === editingCoil.id ? editingCoil : c) : null
        );
      }

      setEditingCoil(null);
      setModalConfig({
        isOpen: true,
        title: 'Sucesso!',
        message: 'Bobina atualizada com sucesso!',
        type: 'success'
      });
    } catch (err) {
      console.error(err);
      setModalConfig({
        isOpen: true,
        title: 'Erro',
        message: 'Erro ao atualizar bobina.',
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchBatchDetails = async (batchId: string) => {
    if (isViewingDetails === batchId) {
      setIsViewingDetails(null);
      setSelectedBatchDetails(null);
      return;
    }

    setLoading(true);
    try {
      const q = query(collection(db, 'wire_coils'), where('batchId', '==', batchId));
      const snap = await getDocs(q);
      const coils = snap.docs.map(d => ({ id: d.id, ...d.data() } as WireCoil));
      setSelectedBatchDetails(coils);
      setIsViewingDetails(batchId);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBatch = async (batch: WireBatch) => {
    setModalConfig({
      isOpen: true,
      title: 'Confirmar Exclusão',
      message: `ATENÇÃO: Isso excluirá a NF ${batch.nfNumber} e TODAS as suas bobinas. Deseja continuar?`,
      type: 'warning',
      showConfirmButton: true,
      onConfirm: () => executeDeleteBatch(batch)
    });
  };

  const executeDeleteBatch = async (batch: WireBatch) => {
    setLoading(true);
    try {
      // 1. Delete all coils associated with this batch
      const q = query(collection(db, 'wire_coils'), where('batchId', '==', batch.id));
      const snap = await getDocs(q);
      const deletePromises = snap.docs.map(d => deleteDoc(doc(db, 'wire_coils', d.id)));
      await Promise.all(deletePromises);

      // 2. Delete the batch document
      await deleteDoc(doc(db, 'wire_batches', batch.id));
      
      setModalConfig({
        isOpen: true,
        title: 'Excluído',
        message: 'Lançamento e bobinas excluídos com sucesso.',
        type: 'success'
      });
    } catch (err) {
      console.error(err);
      setModalConfig({
        isOpen: true,
        title: 'Erro',
        message: 'Erro ao excluir lançamento.',
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCoil = (coil: WireCoil) => {
    const parentBatch = batches.find(b => b.id === coil.batchId);
    const nfInfo = parentBatch?.nfNumber ? ` (NF #${parentBatch.nfNumber})` : '';
    const isConsumed = coil.status === 'consumed';

    setModalConfig({
      isOpen: true,
      title: 'Excluir Bobina do Lote',
      message: isConsumed
        ? `ATENÇÃO: A bobina "${coil.coilNumber}" (${coil.weight} kg) consta como CONSUMIDA na produção. Tem certeza que deseja excluí-la definitivamente do sistema? O lote${nfInfo} terá seus totais recalculados.`
        : `Deseja realmente excluir a bobina "${coil.coilNumber}" (${coil.weight} kg) do lote${nfInfo}? Esta ação é irreversível e os totais do lote (quantidade de bobinas e peso total) serão recalculados automaticamente.`,
      type: 'warning',
      showConfirmButton: true,
      onConfirm: () => executeDeleteCoil(coil, parentBatch)
    });
  };

  const executeDeleteCoil = async (coil: WireCoil, batchInfo?: WireBatch) => {
    setLoading(true);
    try {
      const batchRef = doc(db, 'wire_batches', coil.batchId);
      const batchSnap = await getDoc(batchRef);
      
      const batchData = batchSnap.exists() ? batchSnap.data() : batchInfo;
      const currentCount = Number(batchData?.coilsCount) || 0;
      const currentWeight = Number(batchData?.totalWeight) || 0;
      const coilWeight = Number(coil.weight) || 0;

      const newCoilsCount = Math.max(0, currentCount - 1);
      const newTotalWeight = Math.max(0, Math.round((currentWeight - coilWeight) * 100) / 100);

      const managerName = profile?.name || user?.displayName || user?.email || 'Gestor/Admin';

      // Atomic write batch
      const writeOps = writeBatch(db);

      // 1. Delete coil document
      writeOps.delete(doc(db, 'wire_coils', coil.id));

      // 2. Update parent batch doc
      if (batchSnap.exists()) {
        writeOps.update(batchRef, {
          coilsCount: newCoilsCount,
          totalWeight: newTotalWeight,
          updatedAt: serverTimestamp()
        });
      }

      // 3. Register audit log
      const auditDocRef = doc(collection(db, 'wire_audit_logs'));
      writeOps.set(auditDocRef, {
        action: 'WIRE_COIL_DELETED',
        batchId: coil.batchId,
        nfNumber: batchData?.nfNumber || '',
        supplierName: batchData?.supplierName || '',
        coilId: coil.id,
        coilNumber: coil.coilNumber,
        weight: coilWeight,
        diameter: coil.diameter,
        managerId: user?.uid || 'manager',
        managerName: managerName,
        managerEmail: user?.email || '',
        details: {
          reason: 'Exclusão de bobina cadastrada incorretamente no lote',
          previousCount: currentCount,
          newCount: newCoilsCount,
          previousWeight: currentWeight,
          newWeight: newTotalWeight
        },
        timestamp: serverTimestamp()
      });

      await writeOps.commit();

      // Update local state for expanded view if open
      if (selectedBatchDetails) {
        setSelectedBatchDetails(prev => prev ? prev.filter(c => c.id !== coil.id) : null);
      }

      // Close editing modal if open
      if (editingCoil?.id === coil.id) {
        setEditingCoil(null);
      }

      setModalConfig({
        isOpen: true,
        title: 'Bobina Excluída!',
        message: `A bobina "${coil.coilNumber}" foi excluída com sucesso. O lote agora possui ${newCoilsCount} bobinas (${newTotalWeight.toLocaleString()} kg).`,
        type: 'success'
      });
    } catch (err: any) {
      console.error('Erro ao excluir bobina:', err);
      setModalConfig({
        isOpen: true,
        title: 'Erro ao Excluir',
        message: `Não foi possível excluir a bobina: ${err?.message || 'Erro inesperado.'}`,
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddCoils = async (batch: WireBatch) => {
    setAddCoilsTargetBatch(batch);
    setPendingNewCoils([]);
    setAddCoilsError('');
    setShowScanner(false);

    // Intelligently infer default diameter from existing coils in batch
    let defaultDiameter = 2.30;
    if (selectedBatchDetails && selectedBatchDetails.length > 0 && isViewingDetails === batch.id) {
      defaultDiameter = selectedBatchDetails[0].diameter || 2.30;
    } else {
      try {
        const q = query(collection(db, 'wire_coils'), where('batchId', '==', batch.id), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
          defaultDiameter = snap.docs[0].data().diameter || 2.30;
        }
      } catch (err) {
        console.warn('Could not determine default diameter:', err);
      }
    }

    setNewCoilInput({
      coilNumber: '',
      diameter: defaultDiameter,
      weight: '',
      isDamaged: false
    });
  };

  const handleAddCoilToQueue = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAddCoilsError('');

    const cleanNumber = newCoilInput.coilNumber.trim().toUpperCase();
    if (!cleanNumber) {
      setAddCoilsError('Informe o número ou código de barras da bobina.');
      return;
    }

    const weightNum = parseFloat(newCoilInput.weight);
    if (!weightNum || isNaN(weightNum) || weightNum <= 0) {
      setAddCoilsError('Informe um peso válido em kg (maior que 0).');
      return;
    }

    // Check if duplicate in current pending queue
    if (pendingNewCoils.some(c => c.coilNumber === cleanNumber)) {
      setAddCoilsError(`A bobina "${cleanNumber}" já está na fila.`);
      return;
    }

    // Check if duplicate in currently expanded batch
    if (selectedBatchDetails && selectedBatchDetails.some(c => c.coilNumber.toUpperCase() === cleanNumber)) {
      setAddCoilsError(`A bobina "${cleanNumber}" já está cadastrada neste lote.`);
      return;
    }

    setPendingNewCoils(prev => [
      ...prev,
      {
        coilNumber: cleanNumber,
        diameter: Number(newCoilInput.diameter) || 2.30,
        weight: weightNum,
        isDamaged: Boolean(newCoilInput.isDamaged)
      }
    ]);

    // Reset input fields but keep diameter
    setNewCoilInput(prev => ({
      ...prev,
      coilNumber: '',
      weight: '',
      isDamaged: false
    }));
  };

  const handleRemovePendingCoil = (index: number) => {
    setPendingNewCoils(prev => prev.filter((_, i) => i !== index));
  };

  const handleExecuteSaveAddedCoils = async () => {
    if (!addCoilsTargetBatch) return;

    // Auto-include current inputs if filled
    let coilsToSave = [...pendingNewCoils];
    const cleanNumber = newCoilInput.coilNumber.trim().toUpperCase();
    const weightNum = parseFloat(newCoilInput.weight);

    if (cleanNumber && weightNum > 0 && !coilsToSave.some(c => c.coilNumber === cleanNumber)) {
      coilsToSave.push({
        coilNumber: cleanNumber,
        diameter: Number(newCoilInput.diameter) || 2.30,
        weight: weightNum,
        isDamaged: Boolean(newCoilInput.isDamaged)
      });
    }

    if (coilsToSave.length === 0) {
      setAddCoilsError('Adicione pelo menos uma bobina para gravar no lote.');
      return;
    }

    setAddingCoilsLoading(true);
    setAddCoilsError('');

    try {
      // Check for duplicates in Firestore
      const duplicateChecks = await Promise.all(
        coilsToSave.map(async (coil) => {
          const q = query(
            collection(db, 'wire_coils'),
            where('coilNumber', '==', coil.coilNumber),
            limit(1)
          );
          const snap = await getDocs(q);
          if (!snap.empty) {
            const data = snap.docs[0].data();
            return {
              coilNumber: coil.coilNumber,
              batchId: data.batchId,
              status: data.status
            };
          }
          return null;
        })
      );

      const duplicatesFound = duplicateChecks.filter(Boolean) as Array<{
        coilNumber: string;
        batchId?: string;
        status?: string;
      }>;

      if (duplicatesFound.length > 0) {
        const dupList = duplicatesFound.map(d => `${d.coilNumber} (${d.status === 'consumed' ? 'Baixada' : 'Em estoque'})`).join(', ');
        setAddCoilsError(`Bloqueio de duplicidade: As seguintes bobinas já constam registradas no sistema: ${dupList}.`);
        setAddingCoilsLoading(false);
        return;
      }

      // Prepare atomic writeBatch
      const batch = writeBatch(db);
      const targetBatchRef = doc(db, 'wire_batches', addCoilsTargetBatch.id);
      const auditDocRef = doc(collection(db, 'wire_audit_logs'));

      const totalAddedWeight = coilsToSave.reduce((sum, c) => sum + c.weight, 0);
      const newCoilsCount = (addCoilsTargetBatch.coilsCount || 0) + coilsToSave.length;
      const newTotalWeight = (addCoilsTargetBatch.totalWeight || 0) + totalAddedWeight;
      const managerName = profile?.name || user?.displayName || user?.email || 'Gestor/Admin';

      // Insert all coils
      for (const coil of coilsToSave) {
        const coilDocRef = doc(collection(db, 'wire_coils'));
        batch.set(coilDocRef, {
          coilNumber: coil.coilNumber,
          diameter: Number(coil.diameter) || 2.30,
          weight: Number(coil.weight) || 0,
          supplierId: addCoilsTargetBatch.supplierId || '',
          supplierName: addCoilsTargetBatch.supplierName || '',
          batchId: addCoilsTargetBatch.id,
          storageBayId: addCoilsTargetBatch.storageBayId || '',
          storageBayName: addCoilsTargetBatch.storageBayName || '',
          status: 'received',
          isDamaged: !!coil.isDamaged,
          receivedAt: new Date().toISOString(),
          receivedByManagerName: managerName,
          createdAt: serverTimestamp()
        });
      }

      // Update target batch document
      batch.update(targetBatchRef, {
        coilsCount: newCoilsCount,
        totalWeight: newTotalWeight,
        updatedAt: serverTimestamp()
      });

      // Add audit log
      batch.set(auditDocRef, {
        action: 'WIRE_BATCH_EDITED',
        batchId: addCoilsTargetBatch.id,
        managerId: user?.uid || 'manager',
        managerName: managerName,
        managerEmail: user?.email || '',
        nfNumber: addCoilsTargetBatch.nfNumber,
        supplierName: addCoilsTargetBatch.supplierName,
        coilsCount: newCoilsCount,
        totalWeight: newTotalWeight,
        details: {
          reason: 'Adição de bobinas complementares a lote já existente',
          addedCoilsCount: coilsToSave.length,
          addedWeight: totalAddedWeight,
          addedCoilNumbers: coilsToSave.map(c => c.coilNumber)
        },
        timestamp: serverTimestamp()
      });

      await batch.commit();

      // Refresh expanded batch details if currently active
      if (isViewingDetails === addCoilsTargetBatch.id) {
        const qUpdated = query(collection(db, 'wire_coils'), where('batchId', '==', addCoilsTargetBatch.id));
        const snapUpdated = await getDocs(qUpdated);
        setSelectedBatchDetails(snapUpdated.docs.map(d => ({ id: d.id, ...d.data() } as WireCoil)));
      }

      const savedCount = coilsToSave.length;
      const nfNum = addCoilsTargetBatch.nfNumber;

      setAddCoilsTargetBatch(null);
      setPendingNewCoils([]);
      setNewCoilInput({
        coilNumber: '',
        diameter: 2.30,
        weight: '',
        isDamaged: false
      });

      setModalConfig({
        isOpen: true,
        title: 'Bobinas Gravadas com Sucesso!',
        message: `${savedCount} bobina(s) (${totalAddedWeight.toLocaleString()} kg) foram integradas ao lote da NF #${nfNum}. Os totais foram recalculados e o estoque de fábrica atualizado.`,
        type: 'success'
      });
    } catch (err: any) {
      console.error('Erro ao adicionar bobinas:', err);
      setAddCoilsError(`Erro ao gravar no banco de dados: ${err?.message || 'Falha de comunicação.'}`);
    } finally {
      setAddingCoilsLoading(false);
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto space-y-8">
      {/* Header & Filter Controls - Persistent at top */}
      <div className="bg-white p-6 lg:p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col gap-8">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-8">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center shadow-inner ring-1 ring-blue-100">
              <History className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-2xl lg:text-3xl font-black text-slate-900 leading-none tracking-tight">Registro Maestro</h2>
              <p className="text-slate-500 font-medium lg:text-lg mt-2">Log de auditoria para recebimentos e consumos de planta.</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row bg-slate-100/50 p-1.5 rounded-3xl self-start border border-slate-200/50 backdrop-blur-sm">
            <button
              onClick={() => { setViewMode('batches'); setSearchTerm(''); }}
              className={cn(
                "px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all active:scale-95",
                viewMode === 'batches' ? "bg-white text-blue-600 shadow-xl shadow-blue-50" : "text-slate-400 hover:text-slate-600"
              )}
            >
              Recebimentos (NF)
            </button>
            <button
              onClick={() => { setViewMode('consumptions'); setSearchTerm(''); }}
              className={cn(
                "px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all active:scale-95",
                viewMode === 'consumptions' ? "bg-white text-emerald-600 shadow-xl shadow-emerald-50" : "text-slate-400 hover:text-slate-600"
              )}
            >
              Consumos (Atividade)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-8 relative group">
            <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors">
               <Search className="w-6 h-6" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={viewMode === 'batches' ? "Buscar por NF, fornecedor ou código da bobina..." : "Filtrar por ID da bobina, operador ou observação..."}
              className="w-full pl-14 pr-6 py-5 bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-2xl text-lg font-bold placeholder:text-slate-300 transition-all shadow-inner outline-none"
            />
          </div>
          
          {viewMode === 'consumptions' && (
            <div className="md:col-span-4 relative group">
              <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                 <Weight className="w-6 h-6" />
              </div>
              <select
                value={filterDiameter}
                onChange={(e) => setFilterDiameter(e.target.value)}
                className="w-full pl-14 pr-12 py-5 bg-slate-50 border-2 border-transparent focus:border-emerald-500 focus:bg-white rounded-2xl text-lg font-black appearance-none text-slate-700 outline-none transition-all shadow-sm"
              >
                <option value="">Todas as Bitolas</option>
                {Array.from(new Set(consumptionHistory.map(c => c.diameter))).sort((a,b) => Number(a)-Number(b)).map(d => (
                  <option key={d} value={d.toString()}>{d} mm</option>
                ))}
              </select>
              <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                 <ChevronRight className="w-5 h-5 rotate-90" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ListView Area */}
      <div className="space-y-6">
        {/* Batch List (Recebimento) */}
        {viewMode === 'batches' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredBatches.map(batch => (
              <motion.div
                layout
                key={`batch-${batch.id}`}
                className={cn(
                  "bg-white border-2 rounded-[2.5rem] transition-all overflow-hidden flex flex-col",
                  isViewingDetails === batch.id ? "border-blue-500 shadow-2xl shadow-blue-50" : "border-slate-100 hover:border-blue-100 hover:shadow-md"
                )}
              >
                <div className="p-8 space-y-8 flex-1">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                       <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shadow-sm">
                          <FileText className="w-7 h-7" />
                       </div>
                       <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2">Nota Fiscal</p>
                          <h3 className="text-3xl font-black text-slate-900 tracking-tighter">#{batch.nfNumber}</h3>
                       </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                       {(isAdmin || isManager) && (
                         <div className="flex items-center gap-1.5 p-1 bg-slate-50 rounded-xl mr-2">
                           <button
                             type="button"
                             onClick={() => handleOpenAddCoils(batch)}
                             className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 rounded-lg font-black text-xs transition-all active:scale-95 border border-emerald-200/60 shadow-xs"
                             title="Adicionar bobinas a este lote"
                           >
                             <Plus className="w-4 h-4" />
                             <span className="hidden sm:inline">Add Bobina</span>
                           </button>
                           <button
                             onClick={() => setEditingBatch(batch)}
                             className="p-3 text-amber-500 hover:bg-white hover:text-amber-600 rounded-lg transition-all"
                             title="Editar Lote"
                           >
                             <Edit2 className="w-5 h-5" />
                           </button>
                           <button
                             onClick={() => handleDeleteBatch(batch)}
                             className="p-3 text-rose-400 hover:bg-white hover:text-rose-600 rounded-lg transition-all"
                             title="Excluir Lote e Bobinas"
                           >
                             <Trash2 className="w-5 h-5" />
                           </button>
                         </div>
                       )}
                       <button
                         onClick={() => fetchBatchDetails(batch.id)}
                         className={cn(
                           "flex items-center gap-2 px-6 py-4 rounded-xl font-black text-sm transition-all active:scale-95",
                           isViewingDetails === batch.id ? "bg-blue-600 text-white shadow-lg" : "bg-white border-2 border-slate-100 text-slate-600 hover:bg-blue-50 hover:border-blue-100 hover:text-blue-600"
                         )}
                       >
                         <Package className="w-5 h-5" />
                         {batch.coilsCount} Bobinas
                       </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div className="space-y-1.5 p-4 bg-slate-50/50 rounded-2xl border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Truck className="w-3 h-3" /> Fornecedor
                      </p>
                      <p className="text-lg font-black text-slate-800 tracking-tight leading-snug">{batch.supplierName}</p>
                    </div>

                    <div className="space-y-1.5 p-4 bg-slate-50/50 rounded-2xl border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Calendar className="w-3 h-3" /> Data Carga
                      </p>
                      <p className="text-lg font-black text-slate-800">{formatDateBR(batch.date)}</p>
                    </div>

                    <div className="space-y-1.5 p-4 bg-slate-50/50 rounded-2xl border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <MapPin className="w-3 h-3 text-emerald-600" /> Baia / Local
                      </p>
                      <p className="text-lg font-black text-slate-800">{batch.storageBayName || 'Geral'}</p>
                    </div>

                    <div className="space-y-1.5 p-4 bg-blue-50/30 rounded-2xl border border-blue-100/50">
                      <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest flex items-center gap-2">
                        <Weight className="w-3 h-3" /> Massa Real
                      </p>
                      <p className="text-xl font-black text-blue-600">{batch.totalWeight.toLocaleString()} <span className="text-[10px] font-bold">kg</span></p>
                    </div>
                  </div>

                  {/* Indicator if any coil inside this batch matches searchTerm */}
                  {searchTerm.trim() && coils && (
                    (() => {
                      const term = searchTerm.trim().toLowerCase();
                      const matchingCoils = coils.filter(c => c.batchId === batch.id && c.coilNumber.toLowerCase().includes(term));
                      if (matchingCoils.length > 0) {
                        return (
                          <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                              <span className="text-xs font-bold text-emerald-900">
                                Encontrada{matchingCoils.length > 1 ? 's' : ''} {matchingCoils.length} bobina{matchingCoils.length > 1 ? 's' : ''} correspondente{matchingCoils.length > 1 ? 's' : ''} à busca:
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {matchingCoils.map(mc => (
                                <span key={mc.id} className="px-2.5 py-1 bg-white text-emerald-800 text-[11px] font-black rounded-lg border border-emerald-300 shadow-2xs font-mono">
                                  {mc.coilNumber} ({mc.weight}kg)
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()
                  )}

                  <div className="flex items-center justify-between pt-2">
                     <div className="flex items-center gap-2 text-slate-400">
                        <User className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-black uppercase tracking-widest">{batch.responsibleName || 'Sistema'}</span>
                     </div>
                     <span className="text-[10px] font-bold text-slate-300 italic">Recebido em {batch.createdAt ? new Date(batch.createdAt.seconds * 1000).toLocaleString() : '--'}</span>
                  </div>
                </div>

                {/* Expansible Details - High Density Matrix */}
                <AnimatePresence>
                  {isViewingDetails === batch.id && selectedBatchDetails && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="bg-slate-50 border-t-2 border-blue-100 p-6 lg:p-8 space-y-6"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-100/70 text-blue-700 flex items-center justify-center">
                            <Package className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
                              Bobinas Registradas ({selectedBatchDetails.length})
                            </h4>
                            <p className="text-xs font-semibold text-slate-500">
                              Peso acumulado: <span className="text-slate-800 font-bold">{selectedBatchDetails.reduce((sum, c) => sum + (Number(c.weight) || 0), 0).toLocaleString()} kg</span>
                            </p>
                          </div>
                        </div>

                        {(isAdmin || isManager) && (
                          <button
                            type="button"
                            onClick={() => handleOpenAddCoils(batch)}
                            className="flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-md hover:shadow-lg transition-all active:scale-95 self-start sm:self-auto"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Adicionar Bobina ao Lote</span>
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 2xl:grid-cols-5 gap-3">
                        {selectedBatchDetails.map((coil, idx) => {
                          const isSearchMatch = Boolean(
                            searchTerm.trim() && coil.coilNumber.toLowerCase().includes(searchTerm.trim().toLowerCase())
                          );

                          return (
                            <div 
                              key={`detail-${coil.id}-${idx}`} 
                              className={cn(
                                "group bg-white p-4 rounded-2xl border shadow-sm relative transition-all",
                                isSearchMatch 
                                  ? "border-emerald-500 ring-2 ring-emerald-400 bg-emerald-50/25 shadow-md" 
                                  : "border-slate-200 hover:border-blue-400 hover:shadow-md",
                                coil.status === 'consumed' && "opacity-60 bg-slate-50"
                              )}
                            >
                              {(isAdmin || isManager) && (
                                <div className="absolute -top-2.5 -right-2.5 flex items-center gap-1 z-20">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingCoil(coil);
                                    }}
                                    title="Editar Bobina"
                                    className="p-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg shadow-sm transition-all active:scale-95"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteCoil(coil);
                                    }}
                                    title="Excluir Bobina do Lote"
                                    className="p-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-lg shadow-sm transition-all active:scale-95"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                              <div className="flex items-center justify-between mb-3">
                                 <span className="text-[9px] font-black text-slate-300 uppercase"># {idx + 1}</span>
                                 <div className="flex items-center gap-1">
                                   {isSearchMatch && (
                                     <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-black uppercase">
                                       Encontrada
                                     </span>
                                   )}
                                   <span className={cn(
                                     "text-[8px] px-2 py-0.5 rounded-md font-black uppercase",
                                     coil.status === 'consumed' ? "bg-rose-50 text-rose-500" : "bg-emerald-50 text-emerald-600"
                                   )}>
                                     {coil.status === 'consumed' ? 'Baixado' : 'Patio'}
                                   </span>
                                 </div>
                              </div>
                              <p className="font-black text-slate-900 text-sm tracking-tight truncate mb-4">{coil.coilNumber}</p>
                              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                                 <div className="flex items-center gap-1.5">
                                   <Weight className="w-3 h-3 text-slate-300" />
                                   <span className="text-[10px] font-black text-slate-600">{coil.weight?.toLocaleString()}kg</span>
                                 </div>
                                 <div className="flex items-center gap-1.5">
                                   <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                   <span className="text-[10px] font-black text-slate-600">{coil.diameter?.toFixed(2)}mm</span>
                                 </div>
                              </div>
                            </div>
                          );
                        })}

                        {(isAdmin || isManager) && (
                          <button
                            type="button"
                            onClick={() => handleOpenAddCoils(batch)}
                            className="p-4 rounded-2xl border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-emerald-50/40 hover:bg-emerald-50 text-emerald-700 flex flex-col items-center justify-center text-center transition-all min-h-[135px] group active:scale-95"
                          >
                            <div className="w-10 h-10 rounded-xl bg-emerald-100 group-hover:bg-emerald-200 flex items-center justify-center mb-2 transition-transform group-hover:scale-110">
                              <Plus className="w-5 h-5 text-emerald-700" />
                            </div>
                            <span className="text-xs font-black uppercase tracking-tight">Adicionar Bobina</span>
                            <span className="text-[10px] text-emerald-600 font-semibold mt-0.5">Complementar Lote</span>
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}

            {filteredBatches.length === 0 && (
              <div className="col-span-full py-32 bg-white rounded-[3rem] border-2 border-dashed border-slate-100 text-center">
                 <Search className="w-20 h-20 text-slate-100 mx-auto mb-6" />
                 <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Nenhuma nota fiscal encontrada</p>
              </div>
            )}
          </div>
        )}

        {/* Consumption History View - Matrix High Performance */}
        {viewMode === 'consumptions' && (
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6">
            {filteredConsumptions.map(coil => (
              <motion.div
                layout
                key={`consumption-${coil.id}`}
                className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm hover:border-emerald-200 hover:shadow-xl transition-all group overflow-hidden relative"
              >
                <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity rotate-12 scale-150">
                   <Barcode className="w-32 h-32" />
                </div>

                <div className="relative z-10 space-y-8">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                       <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform">
                          <Barcode className="w-7 h-7" />
                       </div>
                       <div>
                          <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-100 px-2 py-0.5 rounded-full">Consumido</span>
                          <h3 className="text-2xl font-black text-slate-900 tracking-tight mt-1">{coil.coilNumber}</h3>
                       </div>
                    </div>
                    <div className="flex flex-col items-end text-right">
                       <span className="text-[9px] font-black text-slate-300 uppercase mb-1">Massa Consumida</span>
                       <p className="text-2xl font-black text-slate-900">{coil.weight?.toLocaleString()} <span className="text-[10px] text-slate-400 uppercase">kg</span></p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                       <p className="text-[9px] font-black text-slate-400 uppercase mb-1 flex items-center gap-2">
                          <Factory className="w-3 h-3" /> Linha Destino
                       </p>
                       <p className="text-sm font-black text-slate-800 truncate">
                         {lines.find(l => l.id === coil.currentLineId)?.name || 'N/A'}
                       </p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                       <p className="text-[9px] font-black text-slate-400 uppercase mb-1 flex items-center gap-2">
                          <Package className="w-3 h-3" /> Equipamento
                       </p>
                       <p className="text-sm font-black text-slate-800 truncate">
                         {coil.consumedIn || 'N/A'}
                       </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                    <div className="flex flex-col">
                       <span className="text-[9px] font-black text-slate-300 uppercase mb-1">Escala / Turno</span>
                       <div className="flex items-center gap-2">
                         <div className={cn(
                           "w-2 h-2 rounded-full",
                           coil.consumedShift === '1' ? "bg-amber-500" :
                           coil.consumedShift === '2' ? "bg-blue-500" :
                           "bg-indigo-500"
                         )} />
                         <span className="text-xs font-black text-slate-600 truncate uppercase">Turno {coil.consumedShift} • {coil.consumedBy?.split(' ')[0]}</span>
                       </div>
                    </div>
                    <div className="flex flex-col items-end text-right">
                       <span className="text-[10px] font-black text-blue-500 bg-blue-50 px-2 py-0.5 rounded-lg mb-1">{coil.diameter?.toFixed(2)} mm</span>
                       <span className="text-[10px] font-bold text-slate-300">
                         {coil.consumedAt ? safeToDate(coil.consumedAt)?.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '---'}
                       </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}

            {filteredConsumptions.length === 0 && (
              <div className="col-span-full py-32 bg-white rounded-[3rem] border-2 border-dashed border-slate-100 text-center">
                 <History className="w-20 h-20 text-slate-100 mx-auto mb-6" />
                 <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Nenhum registro de consumo encontrado</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <ConfirmationModal
        isOpen={modalConfig.isOpen}
        onClose={closeModal}
        title={modalConfig.title}
        message={modalConfig.message}
        type={modalConfig.type}
        showConfirmButton={modalConfig.showConfirmButton}
        onConfirm={modalConfig.onConfirm}
        confirmText={modalConfig.showConfirmButton ? "Sim, Prosseguir" : "Entendido"}
      />

      <AnimatePresence>
        {editingCoil && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <form onSubmit={handleEditCoil}>
                <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                    <Edit2 className="w-8 h-8 text-amber-500" />
                    Editar Bobina
                  </h3>
                  <button type="button" onClick={() => setEditingCoil(null)} className="p-2 hover:bg-slate-100 rounded-full">
                    <X className="w-7 h-7 text-slate-400" />
                  </button>
                </div>

                <div className="p-8 space-y-6">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">ID da Bobina</label>
                    <input
                      required
                      type="text"
                      value={editingCoil.coilNumber}
                      onChange={(e) => setEditingCoil({...editingCoil, coilNumber: e.target.value})}
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-amber-500 outline-none font-bold text-lg"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Bitola (mm)</label>
                      <select
                        required
                        value={editingCoil.diameter}
                        onChange={(e) => setEditingCoil({...editingCoil, diameter: parseFloat(e.target.value)})}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-amber-500 outline-none font-bold text-lg appearance-none"
                      >
                        <option value="2.18">2.18 mm</option>
                        <option value="2.3">2.30 mm</option>
                        <option value="3.0">3.00 mm</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Peso (kg)</label>
                      <input
                        required
                        type="number"
                        step="0.01"
                        value={editingCoil.weight || ''}
                        onChange={(e) => setEditingCoil({...editingCoil, weight: parseFloat(e.target.value)})}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-amber-500 outline-none font-bold text-lg"
                      />
                    </div>
                  </div>

                  {editingCoil.status === 'consumed' && (
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">3. Equipamento (Consumo)</label>
                      <div className="grid grid-cols-2 gap-3">
                        {(editingCoil.diameter < 3.0 
                          ? ['Amarradeira 1', 'Amarradeira 2'] 
                          : (lines.find(l => l.id === editingCoil.currentLineId)?.name?.toLowerCase().includes('linha a') || lines.find(l => l.id === editingCoil.currentLineId)?.name?.toLowerCase().includes('linha b')
                            ? ['Unitizadora', 'Big Balé']
                            : ['Unitizadora'])
                        ).map(equip => (
                          <button
                            key={equip}
                            type="button"
                            onClick={() => setEditingCoil({...editingCoil, consumedIn: equip})}
                            className={cn(
                              "py-3 rounded-xl font-black text-xs border-2 transition-all active:scale-95",
                              editingCoil.consumedIn === equip 
                                ? "bg-amber-500 border-amber-500 text-white shadow-md shadow-amber-100" 
                                : "bg-white border-slate-200 text-slate-600 hover:border-amber-200"
                            )}
                          >
                            {equip}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-8 bg-slate-50 flex flex-col sm:flex-row gap-3">
                  {(isAdmin || isManager) && (
                    <button
                      type="button"
                      onClick={() => {
                        const target = editingCoil;
                        setEditingCoil(null);
                        handleDeleteCoil(target);
                      }}
                      className="px-5 py-4 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-2xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 active:scale-95"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Excluir Bobina</span>
                    </button>
                  )}
                  <div className="flex-1 flex gap-3">
                    <button
                      type="button"
                      onClick={() => setEditingCoil(null)}
                      className="flex-1 py-4 bg-white text-slate-600 rounded-2xl font-black border border-slate-200 hover:bg-slate-100 transition-all"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl font-black shadow-xl hover:bg-black transition-all flex items-center justify-center gap-3"
                    >
                      {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                        <>
                          <Save className="w-6 h-6" />
                          Salvar Bobina
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {editingBatch && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <form onSubmit={handleEditBatch}>
                <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                    <Edit2 className="w-8 h-8 text-amber-500" />
                    Editar Lançamento
                  </h3>
                  <button type="button" onClick={() => setEditingBatch(null)} className="p-2 hover:bg-slate-100 rounded-full">
                    <X className="w-7 h-7 text-slate-400" />
                  </button>
                </div>

                <div className="p-8 space-y-6">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Número da NF</label>
                    <input
                      required
                      type="text"
                      value={editingBatch.nfNumber}
                      onChange={(e) => setEditingBatch({...editingBatch, nfNumber: e.target.value})}
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-amber-500 outline-none font-bold text-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Fornecedor</label>
                    <select
                      required
                      value={editingBatch.supplierId}
                      onChange={(e) => setEditingBatch({...editingBatch, supplierId: e.target.value})}
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-amber-500 outline-none font-bold text-lg appearance-none"
                    >
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Local de Armazenamento (Baia)</label>
                    <select
                      required
                      value={editingBatch.storageBayId || ''}
                      onChange={(e) => {
                        const bayId = e.target.value;
                        const bayName = storageBays.find(b => b.id === bayId)?.name || '';
                        setEditingBatch({
                          ...editingBatch,
                          storageBayId: bayId,
                          storageBayName: bayName
                        });
                      }}
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-amber-500 outline-none font-bold text-lg appearance-none"
                    >
                      <option value="">Selecione a baia...</option>
                      {storageBays.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Data do Recebimento</label>
                    <input
                      required
                      type="date"
                      value={editingBatch.date}
                      onChange={(e) => setEditingBatch({...editingBatch, date: e.target.value})}
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-amber-500 outline-none font-bold text-lg"
                    />
                  </div>
                </div>

                <div className="p-8 bg-slate-50 flex gap-4">
                  <button
                    type="button"
                    onClick={() => setEditingBatch(null)}
                    className="flex-1 py-4 bg-white text-slate-600 rounded-2xl font-black border border-slate-200 hover:bg-slate-100 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl font-black shadow-xl hover:bg-black transition-all flex items-center justify-center gap-3"
                  >
                    {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                      <>
                        <Save className="w-6 h-6" />
                        Salvar Alterações
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Adicionar Bobinas ao Lote Existente */}
      <AnimatePresence>
        {addCoilsTargetBatch && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-100 my-8 flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-6 lg:p-8 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
                    <PackagePlus className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/20 text-white border border-white/20">
                        NF #{addCoilsTargetBatch.nfNumber}
                      </span>
                      <span className="text-xs text-emerald-100 font-semibold">Complementar Lote</span>
                    </div>
                    <h3 className="text-2xl font-black tracking-tight text-white mt-1">Adicionar Bobinas ao Lote</h3>
                  </div>
                </div>

                <button 
                  type="button"
                  onClick={() => {
                    if (!addingCoilsLoading) {
                      setAddCoilsTargetBatch(null);
                      setShowScanner(false);
                      setPendingNewCoils([]);
                    }
                  }}
                  className="w-10 h-10 rounded-2xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Content Body */}
              <div className="p-6 lg:p-8 overflow-y-auto space-y-6 flex-1">
                {/* Batch Context Card */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200/80">
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Fornecedor</p>
                    <p className="text-sm font-black text-slate-800 truncate">{addCoilsTargetBatch.supplierName}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Baia de Armazenamento</p>
                    <p className="text-sm font-black text-slate-800 truncate">{addCoilsTargetBatch.storageBayName || 'Geral'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Bobinas Atuais</p>
                    <p className="text-sm font-black text-slate-800">{addCoilsTargetBatch.coilsCount} un</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Peso Registrado</p>
                    <p className="text-sm font-black text-slate-800">{addCoilsTargetBatch.totalWeight.toLocaleString()} kg</p>
                  </div>
                </div>

                {/* QR Scanner Drawer if active */}
                {showScanner && (
                  <div className="p-4 bg-slate-900 rounded-3xl text-white space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Camera className="w-5 h-5 text-emerald-400" />
                        <span className="text-xs font-black uppercase tracking-wider text-slate-200">Leitor de Câmera Ativo</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowScanner(false)}
                        className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800"
                      >
                        Fechar Câmera
                      </button>
                    </div>
                    <div className="max-w-sm mx-auto overflow-hidden rounded-2xl">
                      <QRCameraScanner
                        onScan={(raw) => {
                          const parsed = parseWireQRCode(raw);
                          setNewCoilInput(prev => ({
                            ...prev,
                            coilNumber: parsed.coilNumber || raw.trim().toUpperCase(),
                            diameter: parsed.diameter || prev.diameter,
                            weight: parsed.weight ? String(parsed.weight) : prev.weight
                          }));
                          setShowScanner(false);
                        }}
                        onClose={() => setShowScanner(false)}
                      />
                    </div>
                  </div>
                )}

                {/* Fast Input Form */}
                <form onSubmit={handleAddCoilToQueue} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
                      <Barcode className="w-4 h-4 text-emerald-600" />
                      Dados da Nova Bobina
                    </h4>
                    <button
                      type="button"
                      onClick={() => setShowScanner(!showScanner)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black uppercase transition-all",
                        showScanner ? "bg-rose-50 text-rose-600 border border-rose-200" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                      )}
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>{showScanner ? "Fechar Scanner" : "Escanear QR / Barcode"}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                    {/* Coil Identification */}
                    <div className="sm:col-span-5 space-y-1">
                      <label className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                        Código / Etiqueta da Bobina *
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={newCoilInput.coilNumber}
                          onChange={(e) => setNewCoilInput(prev => ({ ...prev, coilNumber: e.target.value.toUpperCase() }))}
                          placeholder="Ex: GD030400000000000001"
                          className="w-full pl-4 pr-10 py-3.5 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl text-sm font-black uppercase outline-none transition-all placeholder:text-slate-300"
                        />
                        {newCoilInput.coilNumber && (
                          <button
                            type="button"
                            onClick={() => setNewCoilInput(prev => ({ ...prev, coilNumber: '' }))}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Diameter */}
                    <div className="sm:col-span-3 space-y-1">
                      <label className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                        Bitola (mm) *
                      </label>
                      <select
                        value={newCoilInput.diameter}
                        onChange={(e) => setNewCoilInput(prev => ({ ...prev, diameter: parseFloat(e.target.value) || 2.30 }))}
                        className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl text-sm font-black outline-none transition-all"
                      >
                        {[2.18, 2.30, 2.50, 2.70, 3.00, 3.20, 3.50, 4.00].map(dia => (
                          <option key={dia} value={dia}>{dia.toFixed(2)} mm</option>
                        ))}
                      </select>
                    </div>

                    {/* Weight */}
                    <div className="sm:col-span-4 space-y-1">
                      <label className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                        Peso Real (kg) *
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="0.01"
                          min="1"
                          value={newCoilInput.weight}
                          onChange={(e) => setNewCoilInput(prev => ({ ...prev, weight: e.target.value }))}
                          placeholder="Ex: 1045.5"
                          className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl text-sm font-black outline-none transition-all placeholder:text-slate-300"
                        />
                        <button
                          type="submit"
                          className="px-4 py-3.5 bg-slate-900 hover:bg-black text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center shrink-0 shadow-sm active:scale-95"
                          title="Inserir bobina na fila"
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          <span>Fila</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Damaged flag */}
                  <div className="flex items-center gap-2 pt-1">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={newCoilInput.isDamaged}
                        onChange={(e) => setNewCoilInput(prev => ({ ...prev, isDamaged: e.target.checked }))}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                      />
                      <span>Bobina com avaria de transporte / deformada</span>
                    </label>
                  </div>
                </form>

                {/* Error Banner */}
                {addCoilsError && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-rose-700"
                  >
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <p className="text-xs font-bold leading-relaxed">{addCoilsError}</p>
                  </motion.div>
                )}

                {/* Pending Coils Queue */}
                {pendingNewCoils.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        Bobinas Prontas para Inclusão ({pendingNewCoils.length})
                      </h4>
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
                        +{pendingNewCoils.reduce((sum, c) => sum + c.weight, 0).toLocaleString()} kg adicionais
                      </span>
                    </div>

                    <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 max-h-56 overflow-y-auto">
                      {pendingNewCoils.map((c, index) => (
                        <div key={`pending-${c.coilNumber}-${index}`} className="p-3.5 bg-white flex items-center justify-between hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-3">
                            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-black flex items-center justify-center">
                              {index + 1}
                            </span>
                            <div>
                              <p className="text-xs font-black text-slate-800 tracking-tight font-mono">{c.coilNumber}</p>
                              <div className="flex items-center gap-3 text-[10px] text-slate-500 font-semibold">
                                <span>Bitola: <b>{c.diameter.toFixed(2)} mm</b></span>
                                <span>Peso: <b>{c.weight.toLocaleString()} kg</b></span>
                                {c.isDamaged && (
                                  <span className="text-rose-600 font-bold bg-rose-50 px-1.5 py-0.2 rounded">Avariada</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemovePendingCoil(index)}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                            title="Remover da fila"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recalculation Impact Box */}
                <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100">
                  <p className="text-[10px] font-black uppercase tracking-wider text-emerald-800 mb-2">
                    Impacto Projetado no Lote #{addCoilsTargetBatch.nfNumber}
                  </p>
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-slate-500">Total de Bobinas:</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-bold text-slate-600">{addCoilsTargetBatch.coilsCount} un</span>
                        <ArrowRight className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="font-black text-emerald-700 text-sm">
                          {addCoilsTargetBatch.coilsCount + pendingNewCoils.length + (newCoilInput.coilNumber && parseFloat(newCoilInput.weight) > 0 ? 1 : 0)} un
                        </span>
                      </div>
                    </div>

                    <div>
                      <span className="text-slate-500">Massa Total do Lote:</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-bold text-slate-600">{addCoilsTargetBatch.totalWeight.toLocaleString()} kg</span>
                        <ArrowRight className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="font-black text-emerald-700 text-sm">
                          {(
                            addCoilsTargetBatch.totalWeight + 
                            pendingNewCoils.reduce((sum, c) => sum + c.weight, 0) + 
                            (parseFloat(newCoilInput.weight) || 0)
                          ).toLocaleString()} kg
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 lg:p-8 bg-slate-50 border-t border-slate-100 flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  disabled={addingCoilsLoading}
                  onClick={() => {
                    setAddCoilsTargetBatch(null);
                    setShowScanner(false);
                    setPendingNewCoils([]);
                  }}
                  className="flex-1 py-4 bg-white text-slate-700 rounded-2xl font-black text-sm border border-slate-200 hover:bg-slate-100 transition-all active:scale-95 disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  disabled={addingCoilsLoading}
                  onClick={handleExecuteSaveAddedCoils}
                  className="flex-[2] py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-sm shadow-xl hover:shadow-emerald-200/50 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                >
                  {addingCoilsLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Salvando no Estoque...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      <span>Gravar Bobinas no Lote</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
