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
  setDoc,
  runTransaction
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { 
  ConsumableItem, 
  ConsumableLog, 
  ConsumableUnit,
  ProductionLine 
} from '../types';
import { 
  Package, 
  PackagePlus, 
  PackageSearch, 
  Plus, 
  Minus, 
  Trash2, 
  Save, 
  X, 
  Loader2, 
  Search, 
  AlertTriangle, 
  CheckCircle2, 
  Info, 
  ArrowUpRight, 
  ArrowDownRight,
  ChevronDown,
  ChevronRight,
  Calendar,
  Edit2,
  Factory,
  History,
  TrendingUp,
  Sliders,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  LineChart, 
  Line 
} from 'recharts';

const ConsumablesControl: React.FC = () => {
  const { user, isApproved, isManager, isAdmin } = useAuth();
  const [activeTab, setActiveTab ] = useState<'dashboard' | 'transactions' | 'add_transaction' | 'manage_items'>('dashboard');
  
  // Data state
  const [items, setItems] = useState<ConsumableItem[]>([]);
  const [logs, setLogs] = useState<ConsumableLog[]>([]);
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');

  // Form states - Register consumable item
  const [itemName, setItemName] = useState('');
  const [itemUnit, setItemUnit] = useState<ConsumableUnit>('un');
  const [itemMinStock, setItemMinStock] = useState('5');
  const [itemInitialStock, setItemInitialStock] = useState('0');
  const [editingItem, setEditingItem] = useState<ConsumableItem | null>(null);

  // Form states - Log entry or consumption
  const [selectedItemId, setSelectedItemId] = useState('');
  const [transactionType, setTransactionType] = useState<'entry' | 'consumption'>('consumption');
  const [qty, setQty] = useState('');
  const [selectedLineId, setSelectedLineId] = useState('');
  const [usedBy, setUsedBy] = useState('');
  const [logShift, setLogShift] = useState<'Turno 1' | 'Turno 2' | 'Turno 3' | 'Geral'>('Geral');
  const [logNotes, setLogNotes] = useState('');

  // Filter states
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterItemId, setFilterItemId] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Firestore Error Handler
  const handleLocalError = (error: any, op: string, path: string) => {
    console.error(`Error in ${op} at path ${path}:`, error);
    setErrMsg(`Erro de permissão ou conexão banco: ${error?.message || error}`);
    setTimeout(() => setErrMsg(''), 6000);
  };

  // Load Base Data
  useEffect(() => {
    if (!isApproved) return;

    setLoading(true);

    const unsubItems = onSnapshot(
      query(collection(db, 'consumable_items'), orderBy('name')),
      (snap) => {
        setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as ConsumableItem)));
      },
      (err) => handleLocalError(err, 'listen', 'consumable_items')
    );

    const unsubLogs = onSnapshot(
      query(collection(db, 'consumable_logs'), orderBy('timestamp', 'desc'), limit(150)),
      (snap) => {
        setLogs(snap.docs.map(d => ({ 
          id: d.id, 
          ...d.data(),
          timestamp: d.data().timestamp?.toDate ? d.data().timestamp.toDate() : new Date(d.data().timestamp)
        } as ConsumableLog)));
      },
      (err) => handleLocalError(err, 'listen', 'consumable_logs')
    );

    const unsubLines = onSnapshot(
      query(collection(db, 'production_lines'), where('active', '==', true), orderBy('name')),
      (snap) => {
        setLines(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProductionLine)));
      },
      (err) => handleLocalError(err, 'listen', 'production_lines')
    );

    setLoading(false);

    return () => {
      unsubItems();
      unsubLogs();
      unsubLines();
    };
  }, [isApproved]);

  // Handle register a new consumable
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName) return;
    setSubmitting(true);
    setSuccessMsg('');
    setErrMsg('');

    try {
      const minStockNum = parseFloat(itemMinStock) || 0;
      const initialStockNum = parseFloat(itemInitialStock) || 0;

      if (editingItem) {
        // Update existing item
        const itemRef = doc(db, 'consumable_items', editingItem.id);
        await updateDoc(itemRef, {
          name: itemName,
          unit: itemUnit,
          minStock: minStockNum,
          updatedAt: serverTimestamp()
        });
        setSuccessMsg('Insumo atualizado com sucesso!');
        setEditingItem(null);
      } else {
        // Create new item
        const id = 'cons_' + Math.random().toString(36).substring(2, 9);
        const itemRef = doc(db, 'consumable_items', id);
        await setDoc(itemRef, {
          name: itemName,
          unit: itemUnit,
          currentStock: initialStockNum,
          minStock: minStockNum,
          active: true,
          createdAt: serverTimestamp()
        });

        // If initial stock is greater than 0, create an entry log
        if (initialStockNum > 0 && user) {
          const logId = 'log_' + Math.random().toString(36).substring(2, 9);
          await setDoc(doc(db, 'consumable_logs', logId), {
            itemId: id,
            itemName: itemName,
            quantity: initialStockNum,
            type: 'entry',
            processedByUid: user.uid,
            processedByName: user.displayName || user.email || 'Usuário',
            shift: 'Geral',
            notes: 'Saldo inicial cadastrado.',
            timestamp: serverTimestamp()
          });
        }
        setSuccessMsg('Insumo cadastrado com sucesso!');
      }

      // Reset form
      setItemName('');
      setItemInitialStock('0');
      setItemMinStock('5');
      setItemUnit('un');
    } catch (err) {
      handleLocalError(err, editingItem ? 'update' : 'create', 'consumable_items');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Edit click
  const handleEditClick = (item: ConsumableItem) => {
    setEditingItem(item);
    setItemName(item.name);
    setItemUnit(item.unit);
    setItemMinStock(item.minStock.toString());
    setItemInitialStock(item.currentStock.toString());
  };

  // Handle toggle active state
  const handleToggleActive = async (item: ConsumableItem) => {
    try {
      const itemRef = doc(db, 'consumable_items', item.id);
      await updateDoc(itemRef, {
        active: !item.active,
        updatedAt: serverTimestamp()
      });
      setSuccessMsg(`Insumo ${!item.active ? 'reativado' : 'desativado'} com sucesso!`);
    } catch (err) {
      handleLocalError(err, 'toggle_active', 'consumable_items');
    }
  };

  // Handle entry or consumption transaction logging with Atomic Transaction
  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemId || !qty || !user) return;
    setSubmitting(true);
    setSuccessMsg('');
    setErrMsg('');

    try {
      const qtyNum = parseFloat(qty);
      if (isNaN(qtyNum) || qtyNum <= 0) {
        throw new Error('A quantidade deve ser um número válido maior que 0.');
      }

      const selectedItem = items.find(i => i.id === selectedItemId);
      if (!selectedItem) {
        throw new Error('Insumo não encontrado.');
      }

      // Validation for consumption
      if (transactionType === 'consumption' && selectedItem.currentStock < qtyNum) {
        throw new Error(`Estoque insuficiente! Estoque atual é de apenas ${selectedItem.currentStock} ${selectedItem.unit}.`);
      }

      if (transactionType === 'consumption' && !selectedLineId) {
        throw new Error('Por favor, selecione onde esse insumo será usado (Linha de Produção).');
      }

      if (transactionType === 'consumption' && !usedBy) {
        throw new Error('Por favor, informe quem está consumindo/utilizando o insumo.');
      }

      const itemRef = doc(db, 'consumable_items', selectedItemId);
      const logId = 'log_' + Math.random().toString(36).substring(2, 9);
      const logRef = doc(db, 'consumable_logs', logId);

      const lineObj = lines.find(l => l.id === selectedLineId);

      // We run a transactional read-modify-write to guarantee strict inventory balances are consistent
      await runTransaction(db, async (transaction) => {
        const itemSnap = await transaction.get(itemRef);
        if (!itemSnap.exists()) {
          throw new Error('Item de estoque não existe.');
        }

        const data = itemSnap.data() as ConsumableItem;
        const currentStockVal = data.currentStock || 0;
        let newStockVal = currentStockVal;

        if (transactionType === 'entry') {
          newStockVal = currentStockVal + qtyNum;
        } else {
          newStockVal = currentStockVal - qtyNum;
          if (newStockVal < 0) {
            throw new Error(`Estoque insuficiente detectado transacionalmente.`);
          }
        }

        // 1. Update item stock
        transaction.update(itemRef, {
          currentStock: newStockVal,
          updatedAt: serverTimestamp()
        });

        // 2. Add log entry
        transaction.set(logRef, {
          itemId: selectedItemId,
          itemName: selectedItem.name,
          quantity: qtyNum,
          type: transactionType,
          lineId: transactionType === 'consumption' ? selectedLineId : '',
          lineName: transactionType === 'consumption' ? (lineObj?.name || 'Linha') : '',
          usedByUid: '',
          usedByName: transactionType === 'consumption' ? usedBy : '',
          processedByUid: user.uid,
          processedByName: user.displayName || user.email || 'Usuário',
          shift: transactionType === 'consumption' ? logShift : 'Geral',
          notes: logNotes.trim(),
          timestamp: serverTimestamp()
        });
      });

      setSuccessMsg(`Transação registrada com sucesso! Estoque atualizado.`);
      
      // Clear fields
      setQty('');
      setLogNotes('');
      // usedBy and line stay for repeated logs if needed
    } catch (err: any) {
      setErrMsg(err?.message || 'Erro ao registrar movimentação.');
    } finally {
      setSubmitting(false);
    }
  };

  // Statistics calculation for the Dashboard
  const activeItems = items.filter(i => i.active);
  const lowStockItems = activeItems.filter(i => i.currentStock < i.minStock);

  // Filtered Logs
  const filteredLogs = logs.filter(log => {
    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = log.itemName.toLowerCase().includes(q);
      const matchLine = log.lineName?.toLowerCase().includes(q);
      const matchUser = log.usedByName?.toLowerCase().includes(q);
      const matchProcessedBy = log.processedByName.toLowerCase().includes(q);
      const matchNotes = log.notes?.toLowerCase().includes(q);
      if (!matchName && !matchLine && !matchUser && !matchProcessedBy && !matchNotes) return false;
    }

    // Item filter
    if (filterItemId && log.itemId !== filterItemId) return false;

    // Type filter
    if (filterType !== 'all' && log.type !== filterType) return false;

    // Date filters
    if (startDate) {
      const sDate = new Date(startDate);
      sDate.setHours(0, 0, 0, 0);
      if (log.timestamp < sDate) return false;
    }

    if (endDate) {
      const eDate = new Date(endDate);
      eDate.setHours(23, 59, 59, 999);
      if (log.timestamp > eDate) return false;
    }

    return true;
  });

  // Recharts: consumable stock volumes for Active items
  const chartStockData = activeItems.map(item => ({
    name: item.name,
    Estoque: item.currentStock,
    Mínimo: item.minStock,
    unit: item.unit
  })).slice(0, 15);

  // Recharts: Consumption by production line (aggregated)
  const lineConsumptionMap: Record<string, number> = {};
  logs.filter(l => l.type === 'consumption').forEach(log => {
    const lName = log.lineName || 'Desconhecido';
    lineConsumptionMap[lName] = (lineConsumptionMap[lName] || 0) + log.quantity;
  });
  const lineChartData = Object.entries(lineConsumptionMap).map(([name, value]) => ({
    name,
    Consumo: value
  }));

  // Recharts: Logs aggregated over the last weeks/days or simple timeline
  // Let's make a beautiful breakdown of consumption timeline
  const timelineMap: Record<string, { entries: number; consumption: number }> = {};
  logs.slice(0, 50).forEach(log => {
    const day = log.timestamp.toLocaleDateString('pt-BR', { month: '2-digit', day: '2-digit' });
    if (!timelineMap[day]) {
      timelineMap[day] = { entries: 0, consumption: 0 };
    }
    if (log.type === 'entry') {
      timelineMap[day].entries += log.quantity;
    } else {
      timelineMap[day].consumption += log.quantity;
    }
  });
  const timelineChartData = Object.entries(timelineMap).map(([day, val]) => ({
    day,
    Entradas: val.entries,
    Saídas: val.consumption
  })).reverse();

  if (!isApproved) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <AlertTriangle className="w-16 h-16 text-amber-500 mb-4" />
        <h2 className="text-2xl font-black text-slate-900 mb-2">Acesso Pendente</h2>
        <p className="text-slate-500 max-w-md">Seu perfil está aguardando aprovação de um gestor ou administrador para acessar estes dados.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Package className="w-8 h-8 text-emerald-600" />
            Controle de Estoque & Insumos
          </h1>
          <p className="text-slate-500 text-sm font-semibold mt-1">
            Gestão local de insumos consumíveis, controle setorial de trocas, e alertas de estoque mínimo.
          </p>
        </div>
        
        {/* Navigation Tabs */}
        <div className="flex overflow-x-auto gap-2 bg-slate-100 p-1.5 rounded-2xl w-full md:w-auto self-start">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={cn(
              "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap",
              activeTab === 'dashboard' 
                ? "bg-white text-slate-900 shadow-sm" 
                : "text-slate-500 hover:text-slate-900"
            )}
          >
            Dashboard & KPIs
          </button>
          
          <button
            onClick={() => {
              setActiveTab('add_transaction');
              setSuccessMsg('');
              setErrMsg('');
            }}
            className={cn(
              "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5",
              activeTab === 'add_transaction' 
                ? "bg-white text-emerald-700 shadow-sm font-extrabold" 
                : "text-slate-500 hover:text-slate-900"
            )}
          >
            <Sliders className="w-3.5 h-3.5" />
            Lançar Entrada/Saída
          </button>

          <button
            onClick={() => setActiveTab('transactions')}
            className={cn(
              "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap",
              activeTab === 'transactions' 
                ? "bg-white text-slate-900 shadow-sm" 
                : "text-slate-500 hover:text-slate-900"
            )}
          >
            Histórico de Movimentações
          </button>

          <button
            onClick={() => {
              setActiveTab('manage_items');
              setEditingItem(null);
              setSuccessMsg('');
              setErrMsg('');
            }}
            className={cn(
              "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap",
              activeTab === 'manage_items' 
                ? "bg-white text-slate-900 shadow-sm" 
                : "text-slate-500 hover:text-slate-900"
            )}
          >
            Cadastrar Insumos
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-12 h-12 text-emerald-600 animate-spin mb-4" />
          <p className="text-slate-500 font-bold text-sm">Carregando dados de insumos...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Global Alert Notification Banner */}
          <AnimatePresence>
            {successMsg && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-2 bg-emerald-50 text-emerald-800 p-4 rounded-2xl border border-emerald-100 font-bold text-sm"
              >
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>{successMsg}</span>
              </motion.div>
            )}
            {errMsg && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-2 bg-rose-50 text-rose-800 p-4 rounded-2xl border border-rose-100 font-bold text-sm"
              >
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                <span>{errMsg}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Low Stock Urgent Global Warning */}
          {lowStockItems.length > 0 && activeTab === 'dashboard' && (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-amber-50 text-amber-950 p-4 rounded-2.5xl border border-amber-200">
              <div className="flex items-start md:items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-xl text-amber-700">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm md:text-base">Insumos Críticos com Estoque Baixo ({lowStockItems.length})</h4>
                  <p className="text-xs text-amber-800">Os seguintes insumos estão abaixo do limite mínimo e precisam de reposição:</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {lowStockItems.map(item => (
                  <span key={item.id} className="bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold px-3 py-1 rounded-lg">
                    {item.name} ({item.currentStock} {item.unit} / mín {item.minStock})
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* TAB 1: DASHBOARD & KPIS */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Metric Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center justify-between">
                  <div>
                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest block">Insumos Ativos</span>
                    <span className="text-3xl font-black text-slate-900 leading-none block mt-1.5">{activeItems.length}</span>
                    <span className="text-[10px] text-slate-500 mt-1 block">Produtos cadastrados</span>
                  </div>
                  <div className="p-4 bg-blue-50 text-blue-600 rounded-3xl">
                    <Package className="w-6 h-6" />
                  </div>
                </div>

                <div className={cn(
                  "p-6 rounded-[2rem] border shadow-sm flex items-center justify-between transition-colors",
                  lowStockItems.length > 0 ? "bg-amber-50/50 border-amber-100" : "bg-white border-slate-100"
                )}>
                  <div>
                    <span className={cn("text-xs font-black uppercase tracking-widest block", lowStockItems.length > 0 ? "text-amber-700" : "text-slate-400")}>Alerta Reposição</span>
                    <span className="text-3xl font-black text-slate-900 leading-none block mt-1.5">{lowStockItems.length}</span>
                    <span className="text-[10px] text-slate-500 mt-1 block">Abaixo do estoque mínimo</span>
                  </div>
                  <div className={cn("p-4 rounded-3xl", lowStockItems.length > 0 ? "bg-amber-100 text-amber-700" : "bg-slate-50 text-slate-400")}>
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                </div>

                <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center justify-between">
                  <div>
                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest block">Entradas cadastradas</span>
                    <span className="text-3xl font-black text-emerald-700 leading-none block mt-1.5">
                      {logs.filter(l => l.type === 'entry').length}
                    </span>
                    <span className="text-[10px] text-slate-500 mt-1 block">Lotes de reabastecimento</span>
                  </div>
                  <div className="p-4 bg-emerald-50 text-emerald-600 rounded-3xl">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                </div>

                <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center justify-between">
                  <div>
                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest block font-extrabold text-rose-700">Consumos Totais</span>
                    <span className="text-3xl font-black text-slate-900 leading-none block mt-1.5">
                      {logs.filter(l => l.type === 'consumption').length}
                    </span>
                    <span className="text-[10px] text-slate-500 mt-1 block">Movimentações de saída</span>
                  </div>
                  <div className="p-4 bg-rose-50 text-rose-600 rounded-3xl">
                    <Minus className="w-6 h-6" />
                  </div>
                </div>
              </div>

              {/* Charts grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1. Bar Chart of Stock Volume */}
                <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm">
                  <div className="mb-4">
                    <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                      <Sliders className="w-5 h-5 text-emerald-600" />
                      Níveis de Estoque por Item (Mínimo vs Atual)
                    </h3>
                    <p className="text-xs text-slate-500 font-semibold mt-0.5">Visão geral quantitativa de volumes em tempo real no setor.</p>
                  </div>
                  <div className="h-72 w-full">
                    {chartStockData.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-slate-400 font-bold text-sm">Nenhum estoque cadastrado.</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartStockData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                          <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '1rem', fontStyle: 'normal' }} 
                            labelClassName="font-extrabold text-slate-900 text-sm"
                          />
                          <Legend wrapperStyle={{ fontSize: '11px' }} />
                          <Bar dataKey="Estoque" fill="#10b981" radius={[4, 4, 0, 0]} barSize={34} />
                          <Bar dataKey="Mínimo" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={34} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* 2. Timeline chart entries vs sorties */}
                <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm">
                  <div className="mb-4">
                    <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                      <History className="w-5 h-5 text-slate-700" />
                      Linha do Tempo de Movimentações
                    </h3>
                    <p className="text-xs text-slate-500 font-semibold mt-0.5">Fluxo de insumos recebidos e consumidos nos últimos registros.</p>
                  </div>
                  <div className="h-72 w-full">
                    {timelineChartData.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-slate-400 font-bold text-sm">Sem movimentações suficientes para gerar o gráfico histórico.</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={timelineChartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="day" stroke="#64748b" fontSize={11} tickLine={false} />
                          <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '1rem' }} 
                            labelClassName="font-extrabold text-slate-900 text-sm"
                          />
                          <Legend wrapperStyle={{ fontSize: '11px' }} />
                          <Line type="monotone" dataKey="Entradas" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                          <Line type="monotone" dataKey="Saídas" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>

              {/* Sub-Section: Consumables Stock Summary Table */}
              <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-lg font-black text-slate-900 tracking-tight">Estoque Atual & Status de Alerta</h3>
                    <p className="text-xs text-slate-500 font-semibold mt-0.5">Balanço detalhado de quantidades em estoque de tintas e materiais.</p>
                  </div>
                  <button
                    onClick={() => setActiveTab('add_transaction')}
                    className="bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-sm flex items-center gap-1.5 self-start"
                  >
                    <Plus className="w-4 h-4" />
                    Lançar Movimentação
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50 font-black text-xs text-slate-400 uppercase tracking-wider">
                        <th className="px-6 py-4 rounded-l-2xl">Nome do Insumo</th>
                        <th className="px-6 py-4">Estoque Atual</th>
                        <th className="px-6 py-4">Mínimo Estipulado</th>
                        <th className="px-6 py-4">Unidade</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4 text-center rounded-r-2xl">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {activeItems.map((item) => {
                        const isLow = item.currentStock < item.minStock;
                        return (
                          <tr key={item.id} className="hover:bg-slate-50/50 transition-colors font-semibold text-slate-700">
                            <td className="px-6 py-4 flex items-center gap-3">
                              <span className={cn(
                                "p-2 rounded-xl shrink-0",
                                isLow ? "bg-amber-100 text-amber-700" : "bg-emerald-50 text-emerald-600"
                              )}>
                                <Package className="w-4 h-4" />
                              </span>
                              <span className="font-extrabold text-slate-900">{item.name}</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className={cn(
                                "font-black text-base px-2.5 py-1 rounded-lg",
                                isLow ? "text-amber-700 bg-amber-50" : "text-emerald-700 bg-emerald-50"
                              )}>
                                {item.currentStock}
                              </span>
                            </td>
                            <td className="px-6 py-4">{item.minStock}</td>
                            <td className="px-6 py-4 uppercase font-bold text-slate-500">{item.unit}</td>
                            <td className="px-6 py-4">
                              {isLow ? (
                                <span className="inline-flex items-center gap-1 text-xs font-black bg-rose-50 border border-rose-100 text-rose-700 px-3 py-1 rounded-full uppercase tracking-wider">
                                  <AlertTriangle className="w-3.5 h-3.5 animate-pulse" />
                                  Repor Estoque
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-black bg-emerald-50 border border-emerald-100 text-emerald-700 px-3 py-1 rounded-full uppercase tracking-wider">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Seguro (OK)
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <button
                                onClick={() => {
                                  setSelectedItemId(item.id);
                                  setTransactionType('consumption');
                                  setActiveTab('add_transaction');
                                }}
                                className="text-emerald-600 hover:text-emerald-700 font-extrabold text-xs bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors border border-emerald-100/30"
                              >
                                Lançar Uso (Dedução)
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {activeItems.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                            Nenhum insumo ativo cadastrado para amostragem no estoque.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ADD TRANSACTION (ENTRY / CONSUMPTION LOG) */}
          {activeTab === 'add_transaction' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Form panel */}
              <div className="lg:col-span-2 bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
                <div>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                    <Sliders className="w-5.5 h-5.5 text-emerald-600" />
                    Registrar Lançamento Operacional
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold mt-1">Insira reabastecimentos de estoque (entrada) ou o uso concreto de itens como tintas de impressora (saída).</p>
                </div>

                <form onSubmit={handleAddTransaction} className="space-y-5">
                  {/* Select item */}
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Insumo / Produto</label>
                    <select
                      required
                      value={selectedItemId}
                      onChange={(e) => setSelectedItemId(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-700"
                    >
                      <option value="">Selecione um insumo...</option>
                      {activeItems.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.name} (Atual: {item.currentStock} {item.unit})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Entry vs Consumption Toggle */}
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Tipo de Operação</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setTransactionType('consumption')}
                        className={cn(
                          "py-3 rounded-xl border font-bold text-sm transition-all focus:scale-95 flex items-center justify-center gap-2",
                          transactionType === 'consumption'
                            ? "bg-rose-50 border-rose-300 text-rose-800 ring-1 ring-rose-300 shadow-sm"
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        <ArrowDownRight className="w-4 h-4 text-rose-600" />
                        Saída / Consumo (Uso)
                      </button>

                      <button
                        type="button"
                        onClick={() => setTransactionType('entry')}
                        className={cn(
                          "py-3 rounded-xl border font-bold text-sm transition-all focus:scale-95 flex items-center justify-center gap-2",
                          transactionType === 'entry'
                            ? "bg-emerald-50 border-emerald-300 text-emerald-800 ring-1 ring-emerald-300 shadow-sm"
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                        Entrada / Reabastecer
                      </button>
                    </div>
                  </div>

                  {/* Qty field */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Quantidade</label>
                      <div className="relative">
                        <input
                          required
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={qty}
                          onChange={(e) => setQty(e.target.value)}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-700"
                          placeholder="Ex: 2.50"
                        />
                        {selectedItemId && (
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400 uppercase">
                            {items.find(i => i.id === selectedItemId)?.unit}
                          </span>
                        )}
                      </div>
                    </div>

                    {transactionType === 'consumption' && (
                      <div>
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Turno</label>
                        <select
                          required
                          value={logShift}
                          onChange={(e: any) => setLogShift(e.target.value)}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-700"
                        >
                          <option value="Geral">Administrativo / Geral</option>
                          <option value="Turno 1">Turno 1</option>
                          <option value="Turno 2">Turno 2</option>
                          <option value="Turno 3">Turno 3</option>
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Fields exclusive of consumption */}
                  <AnimatePresence>
                    {transactionType === 'consumption' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-4 overflow-hidden"
                      >
                        {/* Production Line Selection */}
                        <div>
                          <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Linha de Destino (Local de Uso)</label>
                          <select
                            required={transactionType === 'consumption'}
                            value={selectedLineId}
                            onChange={(e) => setSelectedLineId(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-700"
                          >
                            <option value="">Selecione qual linha do fardo receberá o insumo...</option>
                            {lines.map(line => (
                              <option key={line.id} value={line.id}>
                                {line.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Who consumes check */}
                        <div>
                          <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Servidor / Quem está utilizando?</label>
                          <input
                            required={transactionType === 'consumption'}
                            type="text"
                            value={usedBy}
                            onChange={(e) => setUsedBy(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-700"
                            placeholder="Ex: Operador Silva / Impressora Fardo 2"
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Notes / justification */}
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Observações adicionais (Opcional)</label>
                    <textarea
                      value={logNotes}
                      onChange={(e) => setLogNotes(e.target.value)}
                      rows={2}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-700"
                      placeholder="Identificação do fardo, motivo da troca de tinta, NF, etc."
                    />
                  </div>

                  {/* Action submit */}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-4 bg-emerald-600 text-white font-black rounded-xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200 flex items-center justify-center gap-2 active:scale-98"
                  >
                    {submitting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Save className="w-5 h-5" />
                        Salvar e Atualizar Balanço
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* Informative side panel */}
              <div className="bg-slate-50 p-6 rounded-[2.5rem] border border-slate-100 flex flex-col justify-between">
                <div>
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm mb-4">
                    <Info className="w-6 h-6" />
                  </div>
                  <h4 className="text-base font-black text-slate-900 tracking-tight">Instruções de Balanço</h4>
                  <ul className="text-xs text-slate-500 font-semibold space-y-3 mt-4 leading-relaxed list-disc pl-4">
                    <li>O controle de estoque funciona de forma transacional atômica no Firestore para evitar conflitos de leituras paralelas.</li>
                    <li>Registrar **Saídas** deduzirá instantaneamente do saldo acumulado do produto no banco.</li>
                    <li>Registrar **Entradas** somará as quantidades correspondentes de imediato.</li>
                    <li>Abaixo do limite mínimo configurado do insumo, o sistema enviará avisos na tela principal e notificará no topo.</li>
                  </ul>
                </div>

                {selectedItemId && (
                  <div className="bg-white p-4 rounded-2xl border border-slate-100 mt-6 space-y-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Resumo do Item Selecionado</span>
                    {(() => {
                      const item = items.find(i => i.id === selectedItemId);
                      if (!item) return null;
                      return (
                        <>
                          <div className="font-extrabold text-slate-900 text-sm">{item.name}</div>
                          <div className="flex justify-between text-xs text-slate-500 font-bold">
                            <span>Estoque Atual:</span>
                            <span className="text-slate-900 uppercase">{item.currentStock} {item.unit}</span>
                          </div>
                          <div className="flex justify-between text-xs text-slate-500 font-bold">
                            <span>Limite Mínimo:</span>
                            <span className="text-amber-700 uppercase">{item.minStock} {item.unit}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: HISTORY LOGS */}
          {activeTab === 'transactions' && (
            <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-black text-slate-900 tracking-tight">Registro de Movimentações</h3>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">Auditoria e filtro completo de todas as entradas, pesagens e consumos de tintas e materiais.</p>
                </div>
                {/* Print button style */}
                <button
                  onClick={() => window.print()}
                  className="bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-bold px-4 py-2.5 rounded-xl transition-all flex items-center gap-1.5 self-start"
                >
                  <FileText className="w-4 h-4" />
                  Imprimir Relatório
                </button>
              </div>

              {/* Filters bar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 bg-slate-50 p-4 border border-slate-100 rounded-2xl">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 pl-1">Buscar por logs</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700"
                      placeholder="Pesquisar..."
                    />
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 pl-1">Filtrar Insumo</label>
                  <select
                    value={filterItemId}
                    onChange={(e) => setFilterItemId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700"
                  >
                    <option value="">Todos insumos</option>
                    {items.map(i => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 pl-1">Filtrar Operação</label>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="w-full px-2 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700"
                  >
                    <option value="all">Todas operações</option>
                    <option value="entry">Entradas</option>
                    <option value="consumption">Consumos (Saídas)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 pl-1">Data Início</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 pl-1">Data Fim</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700"
                  />
                </div>
              </div>

              {/* logs list and table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 font-black text-xs text-slate-400 uppercase tracking-wider">
                      <th className="px-6 py-4 rounded-l-2xl">Visualizado em / Data</th>
                      <th className="px-6 py-4">Insumo</th>
                      <th className="px-6 py-4">Movimento</th>
                      <th className="px-6 py-4">Quantidade</th>
                      <th className="px-6 py-4">Utilizado em</th>
                      <th className="px-6 py-4">Quem usou</th>
                      <th className="px-6 py-4 font-normal tracking-wide lowercase rounded-r-2xl">Registrado por / Notas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredLogs.map((log) => {
                      const isEntry = log.type === 'entry';
                      const itemObj = items.find(i => i.id === log.itemId);
                      return (
                        <tr key={log.id} className="hover:bg-slate-50/50 transition-colors font-semibold text-slate-600">
                          <td className="px-6 py-4 text-xs font-bold text-slate-500">
                            {log.timestamp.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="px-6 py-4 font-black text-slate-900">{log.itemName}</td>
                          <td className="px-6 py-4">
                            {isEntry ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-100 px-2.5 py-0.5 rounded-lg">
                                <ArrowUpRight className="w-3 h-3" />
                                Entrada
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider bg-rose-50 text-rose-800 border border-rose-100 px-2.5 py-0.5 rounded-lg">
                                <ArrowDownRight className="w-3 h-3" />
                                Consumo
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-slate-900">
                            <span className="font-extrabold">{log.quantity}</span>{' '}
                            <span className="text-xs uppercase font-bold text-slate-400">{itemObj?.unit || ''}</span>
                          </td>
                          <td className="px-6 py-4 font-black text-slate-800">
                            {isEntry ? '-' : (log.lineName || 'Setor / Linha')}
                          </td>
                          <td className="px-6 py-4 text-slate-800">
                            {isEntry ? '-' : (log.usedByName || 'Não informado')}
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-500">
                            <div className="font-bold text-slate-700">Por: {log.processedByName} {log.shift && `(${log.shift})`}</div>
                            {log.notes && <div className="text-[11px] text-slate-400 italic mt-0.5">"{log.notes}"</div>}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredLogs.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-slate-400 font-bold">
                          Nenhuma movimentação de histórico corresponde aos critérios selecionados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: REGISTER / MANAGE CONSUMABLES */}
          {activeTab === 'manage_items' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Form creation / update */}
              <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-5">
                <div>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                    <PackagePlus className="w-5.5 h-5.5 text-emerald-600" />
                    {editingItem ? 'Editar Insumo' : 'Cadastrar Novo Insumo'}
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold mt-1">
                    Insira as especificidades de peso, litro, unidade e métricas de estoque mínimo para alertar reabastecimentos.
                  </p>
                </div>

                <form onSubmit={handleSaveItem} className="space-y-4">
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Nome do Insumo</label>
                    <input
                      required
                      type="text"
                      value={itemName}
                      onChange={(e) => setItemName(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-700"
                      placeholder="Ex: Tinta Preta de Alta Fixação"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Unidade Medida</label>
                      <select
                        required
                        value={itemUnit}
                        onChange={(e: any) => setItemUnit(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-700 uppercase"
                      >
                        <option value="un">Unidade (un)</option>
                        <option value="kg">Peso (kg)</option>
                        <option value="L">Litro (L)</option>
                        <option value="m">Metros (m)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Estoque Mínimo</label>
                      <input
                        required
                        type="number"
                        step="0.01"
                        min="0"
                        value={itemMinStock}
                        onChange={(e) => setItemMinStock(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-700"
                        placeholder="Ex: 5"
                      />
                    </div>
                  </div>

                  {!editingItem && (
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Estoque Inicial (Opcional)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={itemInitialStock}
                        onChange={(e) => setItemInitialStock(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-700"
                        placeholder="Fazer entrada inicial de estoque"
                      />
                    </div>
                  )}

                  <div className="flex gap-2.5 pt-2">
                    {editingItem && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingItem(null);
                          setItemName('');
                          setItemUnit('un');
                          setItemMinStock('5');
                          setItemInitialStock('0');
                        }}
                        className="flex-1 py-3 bg-slate-100 text-slate-700 font-extrabold rounded-xl hover:bg-slate-200 transition-all font-black"
                      >
                        Cancelar
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 py-3 bg-emerald-600 text-white font-black rounded-xl hover:bg-emerald-700 transition-all shadow-lg flex items-center justify-center gap-1.5"
                    >
                      {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-4 h-4" /> {editingItem ? 'Salvar Edição' : 'Cadastrar'}</>}
                    </button>
                  </div>
                </form>
              </div>

              {/* Master consumables management list */}
              <div className="lg:col-span-2 bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-4">
                <div>
                  <h3 className="text-lg font-black text-slate-900 tracking-tight">Catalogo Completo do Setor</h3>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">Edite limites de alertas ou habilite/desabilite insumos do setor.</p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50 font-black text-xs text-slate-400 uppercase tracking-wider">
                        <th className="px-5 py-3 rounded-l-2xl">Insumo</th>
                        <th className="px-5 py-3">Unidade</th>
                        <th className="px-5 py-3">Alerta Mínimo</th>
                        <th className="px-5 py-3">Status</th>
                        <th className="px-5 py-3 text-right rounded-r-2xl">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {items.map((item) => (
                        <tr key={item.id} className={cn("hover:bg-slate-50/50 transition-colors font-semibold", !item.active && "opacity-60")}>
                          <td className="px-5 py-3.5 font-extrabold text-slate-900">{item.name}</td>
                          <td className="px-5 py-3.5 uppercase font-bold text-slate-500">{item.unit}</td>
                          <td className="px-5 py-3.5">{item.minStock}</td>
                          <td className="px-5 py-3.5">
                            {item.active ? (
                              <span className="bg-emerald-50 text-emerald-800 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border border-emerald-100">Ativo</span>
                            ) : (
                              <span className="bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border border-slate-200">Inativo</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-right space-x-2">
                            <button
                              onClick={() => handleEditClick(item)}
                              className="text-slate-600 hover:text-slate-900 p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                              title="Editar limites"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleToggleActive(item)}
                              className={cn(
                                "p-1.5 rounded-lg transition-colors text-xs font-black uppercase tracking-wider",
                                item.active ? "text-amber-600 hover:bg-amber-50" : "text-emerald-600 hover:bg-emerald-50"
                              )}
                              title={item.active ? "Desativar" : "Reativar"}
                            >
                              {item.active ? 'Inativar' : 'Ativar'}
                            </button>
                          </td>
                        </tr>
                      ))}
                      {items.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-10 text-center text-slate-400 font-bold">
                            Nenhum insumo ou material de estoque cadastrado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ConsumablesControl;
