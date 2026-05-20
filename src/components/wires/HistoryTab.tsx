import React, { useState, useEffect } from 'react';
import { 
  collection, 
  updateDoc, 
  doc, 
  deleteDoc,
  query,
  where,
  getDocs,
  orderBy,
  limit
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { WireBatch, WireCoil, WireSupplier, ProductionLine } from '../../types';
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
  Factory
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, safeToDate } from '../../lib/utils';
import { ConfirmationModal } from '../ui/ConfirmationModal';

interface HistoryTabProps {
  batches: WireBatch[];
  suppliers: WireSupplier[];
  lines: ProductionLine[];
  isAdmin: boolean;
  isManager: boolean;
  startDate: string;
  endDate: string;
}

export const HistoryTab: React.FC<HistoryTabProps> = ({ 
  batches, 
  suppliers, 
  lines, 
  isAdmin,
  isManager,
  startDate,
  endDate
}) => {
  const [viewMode, setViewMode] = useState<'batches' | 'consumptions'>('batches');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDiameter, setFilterDiameter] = useState<string>('');
  const [consumptionHistory, setConsumptionHistory] = useState<WireCoil[]>([]);
  const [editingBatch, setEditingBatch] = useState<WireBatch | null>(null);
  const [editingCoil, setEditingCoil] = useState<WireCoil | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedBatchDetails, setSelectedBatchDetails] = useState<WireCoil[] | null>(null);
  const [isViewingDetails, setIsViewingDetails] = useState<string | null>(null);
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
    const matchesSearch = batch.nfNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      batch.supplierName.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!matchesSearch) return false;

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
        supplierName
      });
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
              placeholder={viewMode === 'batches' ? "Filtrar por NF, fornecedor ou material..." : "Filtrar por ID da bobina, operador ou observação..."}
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
                             onClick={() => setEditingBatch(batch)}
                             className="p-3 text-amber-500 hover:bg-white hover:text-amber-600 rounded-lg transition-all"
                           >
                             <Edit2 className="w-5 h-5" />
                           </button>
                           <button
                             onClick={() => handleDeleteBatch(batch)}
                             className="p-3 text-rose-400 hover:bg-white hover:text-rose-600 rounded-lg transition-all"
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

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
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
                      <p className="text-lg font-black text-slate-800">{new Date(batch.date).toLocaleDateString('pt-BR')}</p>
                    </div>

                    <div className="space-y-1.5 p-4 bg-blue-50/30 rounded-2xl border border-blue-100/50">
                      <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest flex items-center gap-2">
                        <Weight className="w-3 h-3" /> Massa Real
                      </p>
                      <p className="text-xl font-black text-blue-600">{batch.totalWeight.toLocaleString()} <span className="text-[10px] font-bold">kg</span></p>
                    </div>
                  </div>

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
                      className="bg-slate-50 border-t-2 border-blue-100 p-8"
                    >
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 2xl:grid-cols-5 gap-3">
                        {selectedBatchDetails.map((coil, idx) => (
                          <div key={`detail-${coil.id}-${idx}`} className={cn(
                            "group bg-white p-4 rounded-2xl border border-slate-200 shadow-sm relative hover:border-blue-400 hover:shadow-md transition-all",
                            coil.status === 'consumed' && "opacity-60 bg-slate-50"
                          )}>
                            {(isAdmin || isManager) && (
                              <button
                                onClick={() => setEditingCoil(coil)}
                                className="absolute -top-2 -right-2 p-2 bg-amber-100 text-amber-600 rounded-xl shadow-lg z-10 transition-all active:scale-95 hover:bg-amber-200"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <div className="flex items-center justify-between mb-3">
                               <span className="text-[9px] font-black text-slate-300 uppercase"># {idx + 1}</span>
                               <span className={cn(
                                 "text-[8px] px-2 py-0.5 rounded-md font-black uppercase",
                                 coil.status === 'consumed' ? "bg-rose-50 text-rose-500" : "bg-emerald-50 text-emerald-600"
                               )}>
                                 {coil.status === 'consumed' ? 'Baixado' : 'Patio'}
                               </span>
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
                        ))}
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

                <div className="p-8 bg-slate-50 flex gap-4">
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
    </div>
  );
};
