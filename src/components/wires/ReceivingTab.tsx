import React, { useState } from 'react';
import { 
  collection, 
  addDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { WireBatch, WireCoil, WireSupplier } from '../../types';
import { 
  PackagePlus, 
  X, 
  Loader2, 
  Save, 
  Barcode, 
  AlertTriangle, 
  Weight, 
  Factory, 
  Trash2, 
  Plus,
  Camera,
  Keyboard,
  CheckCircle2,
  ShieldAlert,
  ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { parseWireQRCode } from '../../lib/wireUtils';
import { QRCameraScanner } from './QRCameraScanner';
import { ConfirmationModal } from '../ui/ConfirmationModal';

import { useAuth } from '../../hooks/useAuth';

interface ReceivingTabProps {
  suppliers: WireSupplier[];
  isManager: boolean;
}

export const ReceivingTab: React.FC<ReceivingTabProps> = ({ suppliers, isManager }) => {
  const { profile } = useAuth();
  const [currentBatch, setCurrentBatch] = useState<Partial<WireBatch> | null>(null);
  const [scannedCoils, setScannedCoils] = useState<Partial<WireCoil>[]>([]);
  const [qrInput, setQrInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualData, setManualData] = useState({ coilNumber: '', weight: '', diameter: 2.30 });
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const startNewBatch = () => {
    if (!isManager) return;
    setCurrentBatch({
      nfNumber: '',
      supplierId: '',
      supplierName: '',
      date: new Date().toISOString().split('T')[0],
      status: 'open',
      totalWeight: 0,
      coilsCount: 0
    });
    setScannedCoils([]);
  };

  const processScanData = (data: string) => {
    if (!currentBatch?.supplierId) {
      setError('Selecione primeiro o fornecedor da carga no formulário ao lado.');
      return;
    }

    const parsed = parseWireQRCode(data);
    if (!parsed) {
      setError('Formato de código não reconhecido. Verifique se o QR code é de um fornecedor homologado.');
      return;
    }

    // Business Rule: Check if the scanned coil belongs to the selected supplier
    const selectedSupplier = suppliers.find(s => s.id === currentBatch.supplierId);
    if (!selectedSupplier) return;

    const supplierMatch = parsed.supplier.toLowerCase().trim() === selectedSupplier.name.toLowerCase().trim();
    
    if (!supplierMatch) {
      setError(`Erro de Fornecedor: Esta bobina é da ${parsed.supplier}, mas você selecionou ${selectedSupplier.name}. Todas as bobinas de uma carga devem ser do mesmo fornecedor.`);
      return;
    }

    if (scannedCoils.some(c => c.coilNumber === parsed.coilNumber)) {
      setError('Esta bobina já foi bipada nesta carga.');
      return;
    }

    const newCoil: Partial<WireCoil> = {
      coilNumber: parsed.coilNumber,
      diameter: parsed.diameter,
      weight: parsed.weight,
      supplierId: currentBatch.supplierId,
      status: 'received',
      receivedAt: new Date().toISOString(),
      isDamaged: false
    };

    setScannedCoils(prev => [newCoil, ...prev]);
    setQrInput('');
    setError('');
    
    // Auto-focus back to input for next scan if manually typing
    const input = document.querySelector('input[placeholder*="Bipe"]') as HTMLInputElement;
    if (input) input.focus();
  };

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!qrInput) return;
    processScanData(qrInput);
  };

  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualData.coilNumber || !manualData.weight) {
      setError('Preencha o número e o peso da bobina.');
      return;
    }

    const manualCoil: Partial<WireCoil> = {
      coilNumber: manualData.coilNumber,
      diameter: manualData.diameter,
      weight: parseFloat(manualData.weight.toString()),
      status: 'received',
      receivedAt: new Date().toISOString(),
      isDamaged: true
    };
    setScannedCoils(prev => [manualCoil, ...prev]);
    setShowManualModal(false);
    setManualData({ coilNumber: '', weight: '', diameter: 2.30 });
    setError('');
  };

  const updateCoil = (index: number, fields: Partial<WireCoil>) => {
    setScannedCoils(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...fields };
      return copy;
    });
  };

  const removeCoil = (index: number) => {
    setScannedCoils(prev => prev.filter((_, i) => i !== index));
  };

  const saveBatch = async () => {
    if (!currentBatch?.nfNumber || !currentBatch?.supplierId || scannedCoils.length === 0) {
      setError('Preencha os dados da NF, Fornecedor e bipe ao menos uma bobina.');
      return;
    }

    const unweightedCoils = scannedCoils.filter(c => !c.weight || c.weight <= 0);
    if (unweightedCoils.length > 0) {
      setError('Existem bobinas com peso zero. Verifique as bobinas manuais/danificadas.');
      return;
    }

    setLoading(true);
    try {
      const supplierName = suppliers.find(s => s.id === currentBatch.supplierId)?.name || '';
      const totalWeight = scannedCoils.reduce((acc, c) => acc + (c.weight || 0), 0);

      const batchRef = await addDoc(collection(db, 'wire_batches'), {
        ...currentBatch,
        supplierName,
        totalWeight,
        coilsCount: scannedCoils.length,
        createdAt: serverTimestamp(),
        responsibleName: profile?.displayName || profile?.email || 'Sistema',
        status: 'closed'
      });

      for (const coil of scannedCoils) {
        await addDoc(collection(db, 'wire_coils'), {
          ...coil,
          batchId: batchRef.id,
          supplierId: currentBatch.supplierId
        });
      }

      setCurrentBatch(null);
      setScannedCoils([]);
      setShowSuccessModal(true);
    } catch (err) {
      console.error(err);
      setError('Erro ao salvar recebimento.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {isCameraOpen && (
        <QRCameraScanner 
          onScan={processScanData} 
          onClose={() => setIsCameraOpen(false)} 
        />
      )}

      <ConfirmationModal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        title="Sucesso!"
        message="Recebimento finalizado com sucesso!"
        type="success"
      />

      <AnimatePresence>
        {showManualModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <form onSubmit={handleManualAdd}>
                <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                    <Keyboard className="w-8 h-8 text-emerald-500" />
                    Entrada Manual
                  </h3>
                  <button type="button" onClick={() => setShowManualModal(false)} className="p-2 hover:bg-slate-100 rounded-full">
                    <X className="w-7 h-7 text-slate-400" />
                  </button>
                </div>

                <div className="p-8 space-y-5">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">ID / Número da Bobina</label>
                    <input
                      required
                      type="text"
                      value={manualData.coilNumber}
                      onChange={(e) => setManualData({...manualData, coilNumber: e.target.value})}
                      placeholder="Ex: 1060..."
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-lg"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Peso (kg)</label>
                      <input
                        required
                        type="number"
                        step="0.01"
                        value={manualData.weight}
                        onChange={(e) => setManualData({...manualData, weight: e.target.value})}
                        placeholder="0.00"
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Bitola (mm)</label>
                      <select
                        required
                        value={manualData.diameter}
                        onChange={(e) => setManualData({...manualData, diameter: parseFloat(e.target.value)})}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-lg appearance-none"
                      >
                        <option value="2.18">2.18 mm</option>
                        <option value="2.3">2.30 mm</option>
                        <option value="3.0">3.00 mm</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="p-8 bg-slate-50 flex gap-4">
                  <button
                    type="button"
                    onClick={() => setShowManualModal(false)}
                    className="flex-1 py-4 bg-white text-slate-600 rounded-2xl font-black border border-slate-200 hover:bg-slate-100 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-[2] py-4 bg-emerald-600 text-white rounded-2xl font-black shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all"
                  >
                    Adicionar Bobina
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {!currentBatch ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-[3rem] border-2 border-dashed border-slate-200">
          <PackagePlus className="w-16 h-16 text-slate-300 mb-4" />
          <h3 className="text-xl font-bold text-slate-800 mb-2">Iniciar Novo Recebimento</h3>
          <p className="text-slate-500 mb-6 text-center max-w-sm">Use esta função para registrar a chegada de uma nova carga de arames.</p>
          <button
            onClick={startNewBatch}
            className="bg-emerald-600 text-white px-8 py-4 rounded-2xl font-black shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95"
          >
            Começar Recebimento
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10">
          {/* Batch Info Form - Sticky sidebar on desktop */}
          <div className="lg:col-span-12 xl:col-span-4 self-start xl:sticky xl:top-8">
            <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Dados da Carga</h3>
                </div>
                <button 
                  onClick={() => setCurrentBatch(null)} 
                  className="p-3 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all active:scale-95"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest">Número da NF</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={currentBatch.nfNumber}
                    onChange={(e) => setCurrentBatch({...currentBatch, nfNumber: e.target.value})}
                    placeholder="Ex: 123456"
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-lg shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest">Fornecedor</label>
                  <div className="relative">
                    <select
                      disabled={scannedCoils.length > 0}
                      value={currentBatch.supplierId}
                      onChange={(e) => setCurrentBatch({...currentBatch, supplierId: e.target.value})}
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-lg appearance-none disabled:opacity-70 disabled:bg-slate-100 shadow-sm"
                    >
                      <option value="">Selecione...</option>
                      {suppliers.filter(s => s.active).map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none">
                       <ChevronDown className="w-5 h-5 text-slate-400" />
                    </div>
                  </div>
                  {scannedCoils.length > 0 && (
                    <p className="text-[9px] font-bold text-amber-600 mt-2 ml-1 uppercase bg-amber-50 px-2 py-1 rounded inline-block">Fornecedor bloqueado (bobinas já registradas)</p>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest">Data do Recebimento</label>
                  <input
                    type="date"
                    value={currentBatch.date}
                    onChange={(e) => setCurrentBatch({...currentBatch, date: e.target.value})}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-lg shadow-sm"
                  />
                </div>
              </div>

              <div className="mt-10 pt-8 border-t border-slate-100">
                <div className="flex items-center justify-between mb-5">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Resumo Operacional</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-emerald-50/50 p-5 rounded-2xl border border-emerald-100/50 shadow-inner">
                    <p className="text-[10px] font-black text-emerald-600 uppercase mb-1">Bobinas</p>
                    <p className="text-3xl font-black text-emerald-700 tabular-nums">{scannedCoils.length}</p>
                  </div>
                  <div className="bg-blue-50/50 p-5 rounded-2xl border border-blue-100/50 shadow-inner">
                    <p className="text-[10px] font-black text-blue-600 uppercase mb-1">Massa (kg)</p>
                    <p className="text-3xl font-black text-blue-700 tabular-nums">
                      {scannedCoils.reduce((acc, c) => acc + (c.weight || 0), 0).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={saveBatch}
                disabled={loading || scannedCoils.length === 0}
                className="w-full mt-10 bg-slate-900 text-white py-6 rounded-2xl font-black shadow-xl hover:shadow-2xl transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-30 disabled:grayscale"
              >
                {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                  <>
                    <Save className="w-6 h-6" />
                    Finalizar Carregamento
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Scanner and Coil List - Main Content Area */}
          <div className="lg:col-span-12 xl:col-span-8 space-y-8">
            <div className="bg-white p-8 md:p-10 rounded-3xl border-2 border-emerald-500 shadow-2xl shadow-emerald-100/50 relative overflow-hidden group">
               {/* Decorative Scanner Background */}
               <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-50 rounded-full blur-3xl opacity-50 -mr-40 -mt-40 group-hover:opacity-70 transition-opacity" />
               
               <div className="relative z-10">
                 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8">
                   <div>
                     <h3 className="text-2xl font-black text-slate-900 tracking-tight">Captura de Bobinas</h3>
                     <p className="text-sm font-medium text-slate-500 mt-1">Bipe as etiquetas ou use a câmera para acelerar o processo.</p>
                   </div>
                   <div className="flex gap-3">
                     <button 
                        onClick={() => setIsCameraOpen(true)}
                        className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl text-sm font-black shadow-lg shadow-emerald-200 active:scale-95 transition-all hover:bg-emerald-700"
                     >
                       <Camera className="w-5 h-5" />
                       Ligar Câmera
                     </button>
                     <button 
                        onClick={() => {
                          if (!currentBatch?.supplierId) {
                            setError('Selecione primeiro o fornecedor da carga.');
                            return;
                          }
                          setShowManualModal(true);
                        }}
                        className="flex items-center gap-2 px-6 py-3 bg-white border-2 border-emerald-100 text-emerald-700 rounded-xl text-sm font-black active:scale-95 transition-all hover:bg-emerald-50"
                     >
                       <Keyboard className="w-5 h-5" />
                       Manual
                     </button>
                   </div>
                 </div>
                 
                 <form onSubmit={handleScanSubmit} className="relative">
                   <div className="absolute left-6 top-1/2 -translate-y-1/2">
                      <Barcode className="w-8 h-8 text-emerald-600 opacity-40" />
                   </div>
                   <input
                     autoFocus
                     type="text"
                     value={qrInput}
                     onChange={(e) => setQrInput(e.target.value)}
                     placeholder="Aguardando bipe do leitor USB..."
                     className="w-full pl-16 pr-8 py-8 bg-slate-50 border-2 border-transparent focus:border-emerald-500 focus:bg-white rounded-3xl text-3xl font-black font-mono outline-none transition-all placeholder:font-sans placeholder:text-base shadow-inner text-slate-900"
                   />
                 </form>
                 
                 {error && (
                   <motion.div 
                     initial={{ opacity: 0, y: 5 }}
                     animate={{ opacity: 1, y: 0 }}
                     className="mt-6 p-5 bg-rose-50 rounded-2xl text-sm font-bold text-rose-600 flex items-center gap-4 border border-rose-100 shadow-sm"
                   >
                     <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shrink-0 shadow-sm text-rose-600">
                       <AlertTriangle className="w-6 h-6" />
                     </div>
                     <p>{error}</p>
                   </motion.div>
                 )}
               </div>
            </div>

            {/* Scanned List - High Density Grid */}
            <div className="space-y-6">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-3">
                   <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Pátio de Entrada</h4>
                   <div className="w-1 h-1 bg-slate-300 rounded-full" />
                   <span className="text-xs font-black text-slate-900 tabular-nums uppercase">{scannedCoils.length} unidade(s)</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {scannedCoils.map((coil, idx) => (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    key={coil.coilNumber || `manual-${idx}`}
                    className={cn(
                      "group p-6 bg-white rounded-3xl border border-slate-200 shadow-sm hover:border-emerald-200 hover:shadow-md transition-all relative overflow-hidden",
                      coil.isDamaged && "border-amber-200 bg-amber-50/10 shadow-amber-50 ring-1 ring-amber-100"
                    )}
                  >
                    <div className="flex items-start gap-5">
                      <div className={cn(
                        "w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl shrink-0 shadow-sm transition-transform group-hover:scale-105",
                        coil.isDamaged ? "bg-amber-100 text-amber-600" : "bg-emerald-100 text-emerald-600"
                      )}>
                        {scannedCoils.length - idx}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div className="truncate pr-4">
                            {coil.isDamaged ? (
                              <input
                                type="text"
                                value={coil.coilNumber}
                                onChange={(e) => updateCoil(idx, { coilNumber: e.target.value })}
                                className="font-black text-xl text-slate-900 bg-transparent border-b-2 border-amber-300 outline-none w-full focus:border-emerald-500 transition-colors"
                                placeholder="ID Bobina"
                              />
                            ) : (
                              <p className="font-black text-xl text-slate-900 tracking-tight truncate">{coil.coilNumber}</p>
                            )}
                            {coil.isDamaged && (
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[8px] bg-amber-500 text-white px-2 py-0.5 rounded-full uppercase font-black tracking-widest">Manual</span>
                                <span className="text-[8px] text-amber-600 font-bold uppercase italic">Ajuste necessário</span>
                              </div>
                            )}
                          </div>
                          
                          <button
                            onClick={() => removeCoil(idx)}
                            className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all active:scale-90"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 mt-6">
                          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex flex-col group-hover:bg-white transition-colors">
                            <div className="flex items-center gap-2 mb-1">
                               <Weight className="w-3 h-3 text-slate-400" />
                               <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Massa</span>
                            </div>
                            {coil.isDamaged ? (
                              <div className="flex items-baseline gap-1 mt-1">
                                <input
                                  type="number"
                                  value={coil.weight || ''}
                                  onChange={(e) => updateCoil(idx, { weight: parseFloat(e.target.value) })}
                                  placeholder="0.0"
                                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-black font-mono outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                                <span className="text-[10px] text-slate-400 font-bold uppercase">kg</span>
                              </div>
                            ) : (
                              <p className="text-lg font-black text-slate-700 tracking-tight mt-1">{coil.weight?.toLocaleString()} <span className="text-[10px] font-bold text-slate-400 uppercase">kg</span></p>
                            )}
                          </div>

                          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex flex-col group-hover:bg-white transition-colors">
                            <div className="flex items-center gap-2 mb-1">
                               <Factory className="w-3 h-3 text-slate-400" />
                               <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Bitola</span>
                            </div>
                            {coil.isDamaged ? (
                              <select
                                value={coil.diameter}
                                onChange={(e) => updateCoil(idx, { diameter: parseFloat(e.target.value) })}
                                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-black outline-none focus:ring-2 focus:ring-emerald-500 mt-1"
                              >
                                <option value="2.18">2.18 mm</option>
                                <option value="2.3">2.30 mm</option>
                                <option value="3.0">3.00 mm</option>
                              </select>
                            ) : (
                              <p className="text-lg font-black text-slate-700 tracking-tight mt-1">{coil.diameter?.toFixed(2)} <span className="text-[10px] font-bold text-slate-400 uppercase">mm</span></p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}

                {scannedCoils.length === 0 && (
                  <div className="col-span-full flex flex-col items-center justify-center py-24 text-slate-400 bg-slate-50/50 rounded-3xl border-2 border-dashed border-slate-200 transition-all hover:bg-slate-50">
                    <div className="relative">
                       <Barcode className="w-16 h-16 mb-4 opacity-10" />
                       <div className="absolute top-0 right-0 w-3 h-3 bg-emerald-500 rounded-full animate-ping" />
                    </div>
                    <p className="font-black uppercase tracking-widest text-xs opacity-50">Sinal pronto para bipe de material</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
