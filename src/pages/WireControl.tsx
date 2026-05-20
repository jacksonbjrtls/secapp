import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  orderBy, 
  addDoc, 
  updateDoc, 
  doc, 
  deleteDoc, 
  serverTimestamp,
  where,
  getDocs,
  limit,
  setDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { 
  ProductionLine, 
  WireSupplier, 
  WireBatch, 
  WireCoil 
} from '../types';
import { 
  LayoutDashboard, 
  PackagePlus, 
  Barcode, 
  Settings, 
  Plus, 
  Trash2, 
  Save, 
  X, 
  Loader2, 
  Search, 
  AlertTriangle, 
  CheckCircle2, 
  ShieldAlert,
  Info, 
  ArrowUpRight, 
  ArrowDownRight,
  ChevronDown,
  ChevronRight,
  Calendar,
  Edit2,
  Factory,
  Truck,
  Weight,
  FileInput,
  History
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { parseWireQRCode, ParsedWireCoil } from '../lib/wireUtils';
import { ConsumptionTab } from '../components/wires/ConsumptionTab';
import { DashboardTab } from '../components/wires/DashboardTab';
import { ReceivingTab } from '../components/wires/ReceivingTab';
import { HistoryTab } from '../components/wires/HistoryTab';

const WireControl: React.FC = () => {
  const { user, isApproved, isManager, isAdmin, isMaster } = useAuth();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'receiving' | 'consumption' | 'history' | 'config'>('dashboard');
  const [showTabMenu, setShowTabMenu] = useState(false);
  
  // Filtering State
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const dateShortcuts = [
    { label: 'Hoje', getValue: () => {
      const today = new Date().toISOString().split('T')[0];
      return { start: today, end: today };
    }},
    { label: 'Mês Atual', getValue: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
      return { start, end };
    }},
    { label: 'Mês Anterior', getValue: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
      const end = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
      return { start, end };
    }},
    { label: 'Últimos 30 Dias', getValue: () => {
      const end = new Date().toISOString().split('T')[0];
      const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      return { start, end };
    }}
  ];

  const handleDateShortcut = (shortcut: typeof dateShortcuts[0]) => {
    const { start, end } = shortcut.getValue();
    setStartDate(start);
    setEndDate(end);
  };
  
  // Data State
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [suppliers, setSuppliers] = useState<WireSupplier[]>([]);
  const [batches, setBatches] = useState<WireBatch[]>([]);
  const [coils, setCoils] = useState<WireCoil[]>([]);
  const [loading, setLoading] = useState(true);
  const [productionData, setProductionData] = useState<any[]>([]);

  // Load Base Data
  useEffect(() => {
    if (!isApproved) return;

    const unsubLines = onSnapshot(query(collection(db, 'production_lines'), orderBy('name')), (snap) => {
      setLines(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProductionLine)));
    }, (error) => console.error("Error in production_lines listener:", error));

    const unsubSuppliers = onSnapshot(query(collection(db, 'wire_suppliers'), orderBy('name')), (snap) => {
      setSuppliers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as WireSupplier)));
    }, (error) => console.error("Error in wire_suppliers listener:", error));

    const unsubBatches = onSnapshot(query(collection(db, 'wire_batches'), orderBy('createdAt', 'desc'), limit(50)), (snap) => {
      setBatches(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as WireBatch)));
    }, (error) => console.error("Error in wire_batches listener:", error));

    const unsubCoils = onSnapshot(query(collection(db, 'wire_coils'), orderBy('receivedAt', 'desc'), limit(300)), (snap) => {
      setCoils(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as WireCoil)));
    }, (error) => console.error("Error in wire_coils listener:", error));
    
    const unsubProd = onSnapshot(collection(db, 'monthly_production'), (snap) => {
      setProductionData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => console.error("Error in monthly_production listener:", error));

    setLoading(false);
    return () => {
      unsubLines();
      unsubSuppliers();
      unsubBatches();
      unsubCoils();
      unsubProd();
    };
  }, [isApproved]);

  if (!isApproved) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <ShieldAlert className="w-16 h-16 text-slate-300 mb-4" />
        <h2 className="text-xl font-bold text-slate-800">Acesso Restrito</h2>
        <p className="text-slate-500 max-w-xs">Aguarde a aprovação do seu perfil para acessar o controle de arames.</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
      {/* Header & Navigation Container */}
      <div className="flex flex-col gap-6 mb-8 lg:mb-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl lg:text-5xl font-black text-slate-900 tracking-tight">
                Controle de Arames
              </h1>
              <div className="bg-emerald-100 text-emerald-600 text-[10px] font-black uppercase px-2 py-1 rounded-md tracking-widest shadow-sm shadow-emerald-100">
                Módulo Industrial
              </div>
            </div>
            <p className="text-slate-500 font-medium lg:text-lg">Gestão inteligente de recebimento e consumo de matérias-primas</p>
          </div>

          {/* New Desktop Tabs - Visible on lg screens */}
          <div className="hidden lg:flex items-center p-1.5 bg-slate-100/50 rounded-2xl border border-slate-200/60 backdrop-blur-sm">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                activeTab === 'dashboard' 
                  ? "bg-white text-emerald-600 shadow-md shadow-slate-200/50" 
                  : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
              )}
            >
              <LayoutDashboard className="w-4 h-4" /> Painel
            </button>
            <button
              onClick={() => setActiveTab('receiving')}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                activeTab === 'receiving' 
                  ? "bg-white text-emerald-600 shadow-md shadow-slate-200/50" 
                  : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
              )}
            >
              <PackagePlus className="w-4 h-4" /> Receber
            </button>
            <button
              onClick={() => setActiveTab('consumption')}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                activeTab === 'consumption' 
                  ? "bg-white text-emerald-600 shadow-md shadow-slate-200/50" 
                  : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
              )}
            >
              <Barcode className="w-4 h-4" /> Consumo
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                activeTab === 'history' 
                  ? "bg-white text-emerald-600 shadow-md shadow-slate-200/50" 
                  : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
              )}
            >
              <History className="w-4 h-4" /> Histórico
            </button>
            {(isAdmin || isMaster) && (
              <button
                onClick={() => setActiveTab('config')}
                className={cn(
                  "flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                  activeTab === 'config' 
                    ? "bg-white text-emerald-600 shadow-md shadow-slate-200/50" 
                    : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
                )}
              >
                <Settings className="w-4 h-4" /> Ajustes
              </button>
            )}
          </div>

          {/* Mobile Tab Control - Visible on md and below */}
          <div className="lg:hidden relative">
            <button
              onClick={() => setShowTabMenu(!showTabMenu)}
              className="w-full flex items-center justify-between gap-3 px-5 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-black uppercase tracking-tight text-slate-700 shadow-sm transition-all active:scale-[0.98]"
            >
              <div className="flex items-center gap-3">
                {activeTab === 'dashboard' && <><LayoutDashboard className="w-5 h-5 text-emerald-600" /> Painel</>}
                {activeTab === 'receiving' && <><PackagePlus className="w-5 h-5 text-emerald-600" /> Receber</>}
                {activeTab === 'consumption' && <><Barcode className="w-5 h-5 text-emerald-600" /> Consumo</>}
                {activeTab === 'history' && <><History className="w-5 h-5 text-emerald-600" /> Histórico</>}
                {activeTab === 'config' && <><Settings className="w-5 h-5 text-emerald-600" /> Ajustes</>}
              </div>
              <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", showTabMenu && "rotate-180")} />
            </button>

            <AnimatePresence>
              {showTabMenu && (
                <>
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setShowTabMenu(false)} 
                  />
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-2 w-full min-w-[240px] bg-white border border-slate-100 rounded-3xl shadow-2xl z-20 overflow-hidden p-2"
                  >
                    {[
                      { id: 'dashboard', label: 'Painel Geral', icon: LayoutDashboard },
                      { id: 'receiving', label: 'Recebimento', icon: PackagePlus, roles: [isManager, isAdmin, isMaster] },
                      { id: 'consumption', label: 'Registrar Consumo', icon: Barcode },
                      { id: 'history', label: 'Histórico de Lotes', icon: History, roles: [isManager, isAdmin, isMaster] },
                      { id: 'config', label: 'Ajustes do Sistema', icon: Settings, roles: [isAdmin, isMaster] }
                    ].map((tab: any) => {
                      if (tab.roles && !tab.roles.some(Boolean)) return null;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => { setActiveTab(tab.id); setShowTabMenu(false); }}
                          className={cn(
                            "w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left text-xs font-black uppercase tracking-tight transition-all",
                            activeTab === tab.id ? "bg-emerald-50 text-emerald-700" : "text-slate-500 hover:bg-slate-50"
                          )}
                        >
                          <tab.icon className="w-4 h-4" /> {tab.label}
                        </button>
                      );
                    })}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Global Period Filter - Refined for Desktop */}
      {(activeTab === 'dashboard' || activeTab === 'history') && (
        <div className="mb-8 lg:mb-12">
          <div className="bg-white p-2 rounded-[2rem] border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-stretch md:items-center gap-2">
            <div className="flex flex-wrap items-center gap-1.5 p-2 bg-slate-50 rounded-[1.5rem] flex-1">
              {dateShortcuts.map(s => (
                <button
                  key={s.label}
                  onClick={() => handleDateShortcut(s)}
                  className={cn(
                    "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95",
                    (startDate === s.getValue().start && endDate === s.getValue().end)
                      ? "bg-emerald-600 text-white shadow-md shadow-emerald-100"
                      : "bg-white text-slate-500 border border-slate-100 hover:border-emerald-200 hover:text-emerald-600 shadow-sm"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 px-4 py-3 lg:py-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all w-32"
                />
              </div>
              <span className="text-[10px] font-black text-slate-300 uppercase">a</span>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all w-32"
                />
              </div>
              
              {(startDate || endDate) && (
                <button
                  onClick={() => { setStartDate(''); setEndDate(''); }}
                  className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                  title="Limpar Período"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {activeTab === 'config' && (isAdmin || isMaster) && (
          <motion.div
            key="config"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <ConfigTab lines={lines} suppliers={suppliers} />
          </motion.div>
        )}
        
          {activeTab === 'receiving' && (
           <motion.div
            key="receiving"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <ReceivingTab suppliers={suppliers} isManager={isManager} />
          </motion.div>
        )}

        {activeTab === 'history' && (isManager || isAdmin || isMaster) && (
          <motion.div
            key="history"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <HistoryTab 
                batches={batches} 
                suppliers={suppliers} 
                lines={lines} 
                isAdmin={isAdmin || isMaster}
                isManager={isManager}
                startDate={startDate}
                endDate={endDate}
            />
          </motion.div>
        )}

        {/* Dashboard and Consumption */}
        {activeTab === 'dashboard' && (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <DashboardTab 
                batches={batches} 
                coils={coils} 
                suppliers={suppliers} 
                lines={lines}
                startDate={startDate}
                endDate={endDate} 
                productionData={productionData}
            />
          </motion.div>
        )}
        {activeTab === 'consumption' && (
          <motion.div
            key="consumption"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <ConsumptionTab lines={lines} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Sub-component for Config
const ConfigTab: React.FC<{ lines: ProductionLine[], suppliers: WireSupplier[] }> = ({ lines, suppliers }) => {
  const { profile } = useAuth();
  const [newLine, setNewLine] = useState('');
  const [newSupplier, setNewSupplier] = useState('');
  const [productionHistory, setProductionHistory] = useState<any[]>([]);
  
  // Production Entry Form
  const [prodYear, setProdYear] = useState(new Date().getFullYear());
  const [prodMonth, setProdMonth] = useState(new Date().getMonth() + 1);
  const [prodTons, setProdTons] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'monthly_production'), orderBy('year', 'desc'), orderBy('month', 'desc'), limit(12));
    const unsub = onSnapshot(q, (snap) => {
      setProductionHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => console.error("Error in production history listener:", error));
    return unsub;
  }, []);

  // Check if current selection has data
  useEffect(() => {
    const existing = productionHistory.find(h => h.year === prodYear && h.month === prodMonth);
    if (existing && !isEditing) {
      setProdTons(existing.productionTons.toString());
    } else if (!existing && !isEditing) {
      setProdTons('');
    }
  }, [prodYear, prodMonth, productionHistory, isEditing]);

  const handleSaveProduction = async () => {
    if (!prodTons || isNaN(parseFloat(prodTons))) return;
    
    const id = `${prodYear}-${prodMonth}`;
    await setDoc(doc(db, 'monthly_production', id), {
      year: prodYear,
      month: prodMonth,
      productionTons: parseFloat(prodTons),
      updatedAt: serverTimestamp(),
      updatedBy: profile?.displayName || profile?.email || 'Sistema'
    });
    setProdTons('');
    setIsEditing(false);
  };

  const handleEditClick = (entry: any) => {
    setProdYear(entry.year);
    setProdMonth(entry.month);
    setProdTons(entry.productionTons.toString());
    setIsEditing(true);
    // Scroll to form or just let the user see the change
  };

  const deleteProduction = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir este registro de produção?')) {
      await deleteDoc(doc(db, 'monthly_production', id));
    }
  };

  const handleAddLine = async () => {
    if (!newLine) return;
    await addDoc(collection(db, 'production_lines'), {
      name: newLine,
      active: true,
      order: lines.length + 1
    });
    setNewLine('');
  };

  const handleAddSupplier = async () => {
    if (!newSupplier) return;
    await addDoc(collection(db, 'wire_suppliers'), {
      name: newSupplier,
      active: true
    });
    setNewSupplier('');
  };

  const toggleLine = async (id: string, active: boolean) => {
    await updateDoc(doc(db, 'production_lines', id), { active });
  };

  const deleteLine = async (id: string) => {
    await deleteDoc(doc(db, 'production_lines', id));
  };

  const deleteSupplier = async (id: string) => {
    await deleteDoc(doc(db, 'wire_suppliers', id));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10">
      {/* Monthly Production Input - Main Focus */}
      <div className="lg:col-span-12 xl:col-span-4 space-y-6">
        <div className="bg-white p-6 lg:p-8 rounded-3xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
          <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2">
            <FileInput className="w-5 h-5 text-emerald-600" />
            Produção de Pregos (Tons)
          </h3>

          <div className="space-y-4 mb-6 p-5 bg-slate-50/50 rounded-2xl border border-slate-100">
             <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mês</span>
                  <select 
                    value={prodMonth}
                    onChange={(e) => setProdMonth(parseInt(e.target.value))}
                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm transition-all"
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {new Date(0, i).toLocaleString('pt-BR', { month: 'long' })}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ano</span>
                  <select 
                    value={prodYear}
                    onChange={(e) => setProdYear(parseInt(e.target.value))}
                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm transition-all"
                  >
                    {[2024, 2025, 2026].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
             </div>
             
             <div className="space-y-1">
               <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Produção Total</span>
               <div className="flex gap-2">
                 <div className="relative flex-1">
                   <input
                     type="number"
                     step="0.1"
                     value={prodTons}
                     onChange={(e) => setProdTons(e.target.value)}
                     placeholder="Ex: 1250.5"
                     className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold pr-12 shadow-sm transition-all"
                   />
                   <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 uppercase">Tons</span>
                 </div>
                 <button
                   onClick={handleSaveProduction}
                   className="p-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all font-bold shadow-lg shadow-emerald-100 flex items-center gap-2 active:scale-95"
                 >
                   <Save className="w-5 h-5" />
                   <span className="text-xs uppercase tracking-widest hidden sm:inline">{isEditing ? 'Atualizar' : 'Salvar'}</span>
                 </button>
               </div>
             </div>
          </div>

          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
             {productionHistory.map(entry => (
               <div key={entry.id} className="flex items-center justify-between p-4 bg-slate-50/50 rounded-2xl group border border-transparent hover:border-emerald-100 hover:bg-white transition-all shadow-sm">
                 <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      {new Date(0, entry.month - 1).toLocaleString('pt-BR', { month: 'short' })} / {entry.year}
                    </p>
                    <p className="font-black text-slate-900 tracking-tight">{entry.productionTons.toLocaleString()} toneladas</p>
                 </div>
                 <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                   <button
                      onClick={() => handleEditClick(entry)}
                      className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                      title="Editar"
                   >
                     <Edit2 className="w-4 h-4" />
                   </button>
                   <button
                      onClick={() => deleteProduction(entry.id)}
                      className="p-2 text-rose-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                      title="Excluir"
                   >
                     <Trash2 className="w-4 h-4" />
                   </button>
                 </div>
               </div>
             ))}
             {productionHistory.length === 0 && (
               <div className="py-12 text-center text-slate-400">
                 <p className="text-xs font-bold italic">Nenhum registro de produção encontrado.</p>
               </div>
             )}
          </div>
        </div>
      </div>

      {/* Side-by-side Configuration Lists */}
      <div className="lg:col-span-12 xl:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Production Lines */}
        <div className="bg-white p-6 lg:p-8 rounded-3xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <Factory className="w-5 h-5 text-emerald-600" />
              Linhas de Operação
            </h3>
            <span className="text-[10px] font-black text-slate-400 bg-slate-50 px-3 py-1 rounded-full uppercase tracking-widest">{lines.length} Linhas</span>
          </div>
          
          <div className="flex gap-2 mb-6">
            <input
              type="text"
              value={newLine}
              onChange={(e) => setNewLine(e.target.value)}
              placeholder="Nome da linha (Ex: A, B...)"
              className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold shadow-sm transition-all"
            />
            <button
              onClick={handleAddLine}
              className="p-3.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all font-bold shadow-lg shadow-emerald-100 flex items-center justify-center active:scale-95"
            >
              <Plus className="w-6 h-6" />
            </button>
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
            {lines.map(line => (
              <div key={line.id} className="flex items-center justify-between p-4 bg-slate-50/50 rounded-2xl group border border-transparent hover:border-emerald-100 hover:bg-white transition-all shadow-sm">
                <div className="flex items-center gap-3">
                  <div className={cn("w-2 h-2 rounded-full", line.active ? "bg-emerald-500 animate-pulse" : "bg-slate-300")} />
                  <span className={cn("font-black tracking-tight text-lg", !line.active && "text-slate-400 line-through decoration-2")}>{line.name}</span>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <button
                    onClick={() => toggleLine(line.id, !line.active)}
                    className={cn(
                      "p-2.5 rounded-xl transition-all", 
                      line.active ? "text-amber-500 hover:bg-amber-50" : "text-emerald-500 hover:bg-emerald-50"
                    )}
                    title={line.active ? "Desativar" : "Ativar"}
                  >
                    <Save className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => deleteLine(line.id)}
                    className="p-2.5 text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                    title="Excluir Permanentemente"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Suppliers */}
        <div className="bg-white p-6 lg:p-8 rounded-3xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <Truck className="w-5 h-5 text-emerald-600" />
              Fornecedores
            </h3>
            <span className="text-[10px] font-black text-slate-400 bg-slate-50 px-3 py-1 rounded-full uppercase tracking-widest">{suppliers.length} Ativos</span>
          </div>
          
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={newSupplier}
              onChange={(e) => setNewSupplier(e.target.value)}
              placeholder="Ex: Belgo, Morlan..."
              className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold shadow-sm transition-all"
            />
            <button
              onClick={handleAddSupplier}
              className="p-3.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all font-bold shadow-lg shadow-emerald-100 flex items-center justify-center active:scale-95"
            >
              <Plus className="w-6 h-6" />
            </button>
          </div>
          <div className="px-3 py-2 bg-amber-50 border border-amber-100 rounded-xl mb-6">
            <p className="text-[9px] text-amber-700 font-bold leading-tight uppercase flex items-center gap-2">
              <Info className="w-3 h-3" />
              Use nomes exatos (Belgo/Morlan) para reconhecimento via scanner.
            </p>
          </div>

          <div className="space-y-2 max-h-[440px] overflow-y-auto pr-2 custom-scrollbar">
            {suppliers.map(s => (
              <div key={s.id} className="flex items-center justify-between p-4 bg-slate-50/50 rounded-2xl group border border-transparent hover:border-emerald-100 hover:bg-white transition-all shadow-sm">
                <span className={cn("font-black tracking-tight text-lg", !s.active && "text-slate-400 line-through decoration-2")}>{s.name}</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <button
                    onClick={() => deleteSupplier(s.id)}
                    className="p-2.5 text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                    title="Excluir Permanentemente"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WireControl;
