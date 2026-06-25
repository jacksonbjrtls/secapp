import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  orderBy, 
  doc, 
  updateDoc, 
  serverTimestamp,
  where,
  limit,
  setDoc,
  runTransaction
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { getCurrentShift, getGroupForShift } from '../lib/scaleUtils';
import { 
  ConsumableItem, 
  ConsumableLog, 
  ConsumableUnit,
  ProductionLine 
} from '../types';
import { 
  Package, 
  PackagePlus, 
  Plus, 
  Minus, 
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
  Calendar,
  Edit2,
  TrendingUp,
  Sliders,
  FileText,
  Download,
  User,
  History,
  RefreshCw,
  EyeOff,
  Eye,
  Lock,
  Users
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
  LineChart, 
  Line 
} from 'recharts';

const ConsumablesControl: React.FC = () => {
  const { user, profile, isApproved, isManager, isAdmin, loading: authLoading } = useAuth();
  
  const isCommonUser = !authLoading && !isManager && !isAdmin;
  
  // Custom 5 simpler tabs:
  // 1. Dashboard e Relatórios, 2. Cadastro, 3. Ajuste de Estoque, 4. Consumo do Operador, 5. Auditoria de Insumos
  type AdminTab = 'dashboard' | 'manage_items' | 'adjust_stock' | 'operator_consumption' | 'audit_log';
  const [activeTab, setActiveTab] = useState<AdminTab>(isCommonUser ? 'operator_consumption' : 'dashboard');
  const actualTabToShow: AdminTab = isCommonUser ? 'operator_consumption' : activeTab;
  const [showTabMenu, setShowTabMenu] = useState(false);
  
  // Data State
  const [items, setItems] = useState<ConsumableItem[]>([]);
  const [logs, setLogs] = useState<ConsumableLog[]>([]);
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');

  // Tab 1: Dashboard Search State
  const [dashboardSearch, setDashboardSearch] = useState('');

  // Tab 2: Cadastro Form States
  const [itemName, setItemName] = useState('');
  const [itemUnit, setItemUnit] = useState<ConsumableUnit>('un');
  const [itemMinStock, setItemMinStock] = useState('5');
  const [itemInitialStock, setItemInitialStock] = useState('0');
  const [itemCharacteristics, setItemCharacteristics] = useState('');
  const [editingItem, setEditingItem] = useState<ConsumableItem | null>(null);

  // Tab 3: Entrada e Saída (Ajuste) Form States
  const [adjustItemId, setAdjustItemId] = useState('');
  const [adjustType, setAdjustType] = useState<'entry' | 'consumption'>('entry');
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustUser, setAdjustUser] = useState(user?.displayName || user?.email || '');
  const [adjustNotes, setAdjustNotes] = useState('');

  // Tab 4: Consumo do Operador Form States
  const [consumeItemId, setConsumeItemId] = useState('');
  const [consumeQty, setConsumeQty] = useState('');
  const [consumeLineId, setConsumeLineId] = useState('');
  const [consumeOperator, setConsumeOperator] = useState(profile?.displayName || user?.displayName || '');
  const [consumeShift, setConsumeShift] = useState<'Turno 1' | 'Turno 2' | 'Turno 3' | 'Geral'>(getCurrentShift());
  const [consumeGroup, setConsumeGroup] = useState<string>(getGroupForShift(new Date(), getCurrentShift()));
  const [consumeNotes, setConsumeNotes] = useState('');

  // Tab 5: Audit Filters State
  const [auditQuery, setAuditQuery] = useState('');
  const [auditTypeFilter, setAuditTypeFilter] = useState<'all' | 'entry' | 'consumption' | 'operator_consumption'>('all');
  const [auditDateStart, setAuditDateStart] = useState('');
  const [auditDateEnd, setAuditDateEnd] = useState('');
  const [auditItemFilter, setAuditItemFilter] = useState('all');

  // Load baseline values when current active user is resolved
  useEffect(() => {
    if (user) {
      if (!adjustUser) setAdjustUser(profile?.displayName || user.displayName || user.email || '');
      if (!consumeOperator) setConsumeOperator(profile?.displayName || user.displayName || '');
    }
  }, [user, profile]);

  // Keep Group (Letter) in sync with the selected shift according to the work scale
  useEffect(() => {
    if (consumeShift) {
      if (consumeShift === 'Geral') {
        const defaultShift = getCurrentShift();
        setConsumeGroup(getGroupForShift(new Date(), defaultShift));
      } else {
        setConsumeGroup(getGroupForShift(new Date(), consumeShift as any));
      }
    }
  }, [consumeShift]);

  // Auto-preselect first item and line when loaded (especially for common users)
  useEffect(() => {
    const activeItems = items.filter(i => i.active);
    if (activeItems.length > 0 && !consumeItemId) {
      setConsumeItemId(activeItems[0].id);
    }
  }, [items, consumeItemId]);

  useEffect(() => {
    if (lines.length > 0 && !consumeLineId) {
      setConsumeLineId(lines[0].id);
    }
  }, [lines, consumeLineId]);

  // Redirect standard operators immediately to their primary "Consumo do Operador" view
  useEffect(() => {
    if (isApproved && !isManager && !isAdmin) {
      setActiveTab('operator_consumption');
    }
  }, [isApproved, isManager, isAdmin]);

  // Handle centralized tab changes for correct state setting and redirection
  const handleTabChange = (tabId: AdminTab) => {
    setActiveTab(tabId);
    setSuccessMsg('');
    setErrMsg('');
    if (tabId === 'manage_items') {
      setEditingItem(null);
    } else if (tabId === 'adjust_stock') {
      if (activeItems.length > 0 && !adjustItemId) {
        setAdjustItemId(activeItems[0].id);
      }
    } else if (tabId === 'operator_consumption') {
      if (activeItems.length > 0 && !consumeItemId) {
        setConsumeItemId(activeItems[0].id);
      }
      if (lines.length > 0 && !consumeLineId) {
        setConsumeLineId(lines[0].id);
      }
    }
    setShowTabMenu(false);
  };

  // Firestore Error Handler
  const handleLocalError = (error: any, op: string, path: string) => {
    console.error(`Error in ${op} at path ${path}:`, error);
    setErrMsg(`Erro de comunicação com o Firestore (${op}): ${error?.message || error}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => setErrMsg(''), 5000);
  };

  // Listeners for real-time Firestore synchronization
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
      collection(db, 'production_lines'),
      (snap) => {
        const mapped = snap.docs.map(d => ({ id: d.id, ...d.data() } as ProductionLine));
        const filteredAndSorted = mapped
          .filter(d => d.active === true)
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setLines(filteredAndSorted);
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

  // Point 1: Register and update supply item properties (Characteristics included)
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
        // Update existing supply
        const itemRef = doc(db, 'consumable_items', editingItem.id);
        await updateDoc(itemRef, {
          name: itemName,
          unit: itemUnit,
          minStock: minStockNum,
          characteristics: itemCharacteristics.trim(),
          updatedAt: serverTimestamp()
        });
        setSuccessMsg(`Insumo em estoque "${itemName}" atualizado com sucesso!`);
        setEditingItem(null);
      } else {
        // Create new supply item
        const id = 'cons_' + Math.random().toString(36).substring(2, 9);
        const itemRef = doc(db, 'consumable_items', id);
        await setDoc(itemRef, {
          name: itemName,
          unit: itemUnit,
          currentStock: initialStockNum,
          minStock: minStockNum,
          characteristics: itemCharacteristics.trim(),
          active: true,
          createdAt: serverTimestamp()
        });

        // Initialize with default transactional entry log if initial volume > 0
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
            notes: `Inventário de abertura inicial registrado. Características: ${itemCharacteristics.trim() || 'Sem especificações.'}`,
            timestamp: serverTimestamp()
          });
        }
        setSuccessMsg(`Novo insumo "${itemName}" inserido com sucesso no banco de dados!`);
      }

      // Restore form default state values
      setItemName('');
      setItemInitialStock('0');
      setItemMinStock('5');
      setItemCharacteristics('');
      setItemUnit('un');
    } catch (err) {
      handleLocalError(err, editingItem ? 'update' : 'create', 'consumable_items');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditClick = (item: ConsumableItem) => {
    setEditingItem(item);
    setItemName(item.name);
    setItemUnit(item.unit);
    setItemMinStock(item.minStock.toString());
    setItemInitialStock(item.currentStock.toString());
    setItemCharacteristics(item.characteristics || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleActive = async (item: ConsumableItem) => {
    try {
      const itemRef = doc(db, 'consumable_items', item.id);
      await updateDoc(itemRef, {
        active: !item.active,
        updatedAt: serverTimestamp()
      });
      setSuccessMsg(`Status do item "${item.name}" modificado para ${!item.active ? 'Ativo' : 'Inativo'}!`);
    } catch (err) {
      handleLocalError(err, 'toggle_status', 'consumable_items');
    }
  };

  // Point 2: Register regular warehouse Inflow or Adjustment Outflow
  const handleProcessAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustItemId || !adjustQty || !user) {
      setErrMsg('Por favor, preencha todos os campos obrigatórios.');
      return;
    }
    setSubmitting(true);
    setSuccessMsg('');
    setErrMsg('');

    try {
      const qtyNum = parseFloat(adjustQty);
      if (isNaN(qtyNum) || qtyNum <= 0) {
        throw new Error('A quantidade informada precisa ser maior que zero.');
      }

      const selectedItem = items.find(i => i.id === adjustItemId);
      if (!selectedItem) {
        throw new Error('Insumo selecionado não foi localizado.');
      }

      // Check balance limit for manual warehouse outflow adjustments
      if (adjustType === 'consumption' && selectedItem.currentStock < qtyNum) {
        throw new Error(`Estoque insuficiente! Saldo atual do lote é de apenas ${selectedItem.currentStock} ${selectedItem.unit}.`);
      }

      const itemRef = doc(db, 'consumable_items', adjustItemId);
      const logId = 'log_' + Math.random().toString(36).substring(2, 9);
      const logRef = doc(db, 'consumable_logs', logId);

      await runTransaction(db, async (trans) => {
        const itemSnap = await trans.get(itemRef);
        if (!itemSnap.exists()) {
          throw new Error('Cadastro de insumo inexistente.');
        }

        const data = itemSnap.data() as ConsumableItem;
        const currentStockVal = data.currentStock || 0;
        let newStockVal = currentStockVal;

        if (adjustType === 'entry') {
          newStockVal = currentStockVal + qtyNum;
        } else {
          newStockVal = currentStockVal - qtyNum;
          if (newStockVal < 0) {
            throw new Error('A movimentação resultaria em saldo negativo transacional.');
          }
        }

        // 1. Transactionally write new balance
        trans.update(itemRef, {
          currentStock: newStockVal,
          updatedAt: serverTimestamp()
        });

        // 2. Insert chronological audit receipt
        trans.set(logRef, {
          itemId: adjustItemId,
          itemName: selectedItem.name,
          quantity: qtyNum,
          type: adjustType,
          lineId: '', // Blank represents simple warehouse adjustment, not machine line consumption
          lineName: '',
          usedByUid: '',
          usedByName: adjustUser.trim() || 'Controle de Estoque',
          processedByUid: user.uid,
          processedByName: user.displayName || user.email || 'Almoxarifado',
          shift: 'Geral',
          notes: `Ajuste manual de estoque. ${(adjustNotes.trim() ? `Motivo: ${adjustNotes.trim()}` : 'Sem notas de justificativa fornecidas.')}`,
          timestamp: serverTimestamp()
        });
      });

      setSuccessMsg(`Estoque modificado com sucesso! Saldo atualizado de ${selectedItem.name}.`);
      setAdjustQty('');
      setAdjustNotes('');
    } catch (err: any) {
      setErrMsg(err?.message || 'Erro transacional ao efetuar ajuste de estoque.');
    } finally {
      setSubmitting(false);
    }
  };

  // Point 3: Dedicated and simplistic Operator-Line Consumption Logging
  const handleProcessOperatorConsumption = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consumeItemId || !consumeQty || !consumeLineId || !consumeOperator) {
      setErrMsg('Todos os campos sinalizados são cruciais para o registro de consumo.');
      return;
    }
    setSubmitting(true);
    setSuccessMsg('');
    setErrMsg('');

    try {
      const qtyNum = parseFloat(consumeQty);
      if (isNaN(qtyNum) || qtyNum <= 0) {
        throw new Error('O volume consumido precisa ser superior a 0.');
      }

      const selectedItem = items.find(i => i.id === consumeItemId);
      if (!selectedItem) {
        throw new Error('Insumo selecionado indisponível.');
      }

      // Check current stock limit
      if (selectedItem.currentStock < qtyNum) {
        throw new Error(`Estoque insuficiente de ${selectedItem.name}! Estoque disponível é de apenas ${selectedItem.currentStock} ${selectedItem.unit}.`);
      }

      const lineObj = lines.find(l => l.id === consumeLineId);
      if (!lineObj) {
        throw new Error('Linha fabril de destino inválida.');
      }

      const itemRef = doc(db, 'consumable_items', consumeItemId);
      const logId = 'log_' + Math.random().toString(36).substring(2, 9);
      const logRef = doc(db, 'consumable_logs', logId);

      await runTransaction(db, async (trans) => {
        const itemSnap = await trans.get(itemRef);
        if (!itemSnap.exists()) {
          throw new Error('Dados cadastrais do insumo perdidos.');
        }

        const data = itemSnap.data() as ConsumableItem;
        const currentStockVal = data.currentStock || 0;
        const newStockVal = currentStockVal - qtyNum;

        if (newStockVal < 0) {
          throw new Error('Quantidades insuficientes no atomizador de estoque.');
        }

        // 1. Set new balance
        trans.update(itemRef, {
          currentStock: newStockVal,
          updatedAt: serverTimestamp()
        });

        // 2. Set consumption log
        trans.set(logRef, {
          itemId: consumeItemId,
          itemName: selectedItem.name,
          quantity: qtyNum,
          type: 'consumption',
          lineId: consumeLineId,
          lineName: lineObj.name,
          usedByUid: '',
          usedByName: consumeOperator.trim(),
          processedByUid: user?.uid || 'anonymous',
          processedByName: user?.displayName || user?.email || consumeOperator.trim(),
          shift: consumeShift,
          group: consumeGroup || getGroupForShift(new Date(), getCurrentShift()),
          notes: `Consumido pelo Operador. ${(consumeNotes.trim() ? `Comentário: ${consumeNotes.trim()}` : '')}`,
          timestamp: serverTimestamp()
        });
      });

      setSuccessMsg(`Consumo de ${qtyNum} ${selectedItem.unit} de "${selectedItem.name}" atribuído à ${lineObj.name} com sucesso.`);
      setConsumeQty('');
      setConsumeNotes('');
    } catch (err: any) {
      setErrMsg(err?.message || 'Falha ao processar consumo na linha de produção.');
    } finally {
      setSubmitting(false);
    }
  };

  // Point 4: Clean and Direct Dashboard Reports & CSV export formulation
  const exportCSVReport = () => {
    const csvRows = [
      ['ID', 'Insumo', 'Caracteristicas / Aplicacao', 'Estoque Atual', 'Unidade', 'Estoque Minimo', 'Status']
    ];
    items.forEach(item => {
      csvRows.push([
        item.id,
        item.name,
        item.characteristics || 'Sem especificacoes',
        item.currentStock.toFixed(2),
        item.unit,
        item.minStock.toFixed(2),
        item.active ? 'Ativo' : 'Inativo'
      ]);
    });
    // Add unicode byte order mark (BOM) for Excel parsing in Portuguese
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + csvRows.map(e => e.map(val => `"${val.replace(/"/g, '""')}"`).join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `inventario_completo_insumos_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Compute stats helper arrays
  const activeItems = items.filter(i => i.active);
  const lowStockItems = activeItems.filter(i => i.currentStock < i.minStock);

  // Recharts visualizers formatting
  const chartStockData = activeItems.map(item => ({
    name: item.name.length > 14 ? item.name.substring(0, 12) + '..' : item.name,
    'Estoque Atual': item.currentStock,
    'Limite Mínimo': item.minStock,
    unit: item.unit
  })).slice(0, 12);

  // Line aggregations for consumption metrics
  const lineConsumptionMap: Record<string, number> = {};
  logs.filter(l => l.type === 'consumption' && l.lineName).forEach(log => {
    const lName = log.lineName || 'Sem Linha';
    lineConsumptionMap[lName] = (lineConsumptionMap[lName] || 0) + log.quantity;
  });
  const lineChartData = Object.entries(lineConsumptionMap).map(([name, value]) => ({
    name: name.length > 12 ? name.substring(0, 10) + '..' : name,
    'Quantidade Consumida': value
  }));

  // Timeline aggregations (daily entries vs consumption outflows)
  const timelineMap: Record<string, { entries: number; withdrawals: number }> = {};
  logs.slice(0, 80).forEach(log => {
    if (!log.timestamp) return;
    const dateFormatted = log.timestamp.toLocaleDateString('pt-BR', { month: '2-digit', day: '2-digit' });
    if (!timelineMap[dateFormatted]) {
      timelineMap[dateFormatted] = { entries: 0, withdrawals: 0 };
    }
    if (log.type === 'entry') {
      timelineMap[dateFormatted].entries += log.quantity;
    } else {
      timelineMap[dateFormatted].withdrawals += log.quantity;
    }
  });
  const timelineChartData = Object.entries(timelineMap).map(([day, val]) => ({
    day,
    'Entradas (+)': val.entries,
    'Saídas (-)': val.withdrawals
  })).reverse().slice(-10);

  // Filter dashboard table inline listings
  const filteredDashboardItems = activeItems.filter(item => {
    if (!dashboardSearch) return true;
    const queryStr = dashboardSearch.toLowerCase();
    return item.name.toLowerCase().includes(queryStr) || 
           (item.characteristics || '').toLowerCase().includes(queryStr);
  });

  // Point 5: Supply Audit chronological log computations & filters
  const processedAuditLogs = logs.filter(log => {
    const searchString = auditQuery.toLowerCase();
    
    // Keyword match
    if (auditQuery) {
      const matchName = log.itemName.toLowerCase().includes(searchString);
      const matchLine = (log.lineName || '').toLowerCase().includes(searchString);
      const matchOperator = (log.usedByName || '').toLowerCase().includes(searchString);
      const matchStaff = log.processedByName.toLowerCase().includes(searchString);
      const matchNotes = (log.notes || '').toLowerCase().includes(searchString);
      if (!matchName && !matchLine && !matchOperator && !matchStaff && !matchNotes) {
        return false;
      }
    }

    // Specific transactional items filter
    if (auditItemFilter !== 'all' && log.itemId !== auditItemFilter) {
      return false;
    }

    // Sub-type action category matching
    if (auditTypeFilter !== 'all') {
      if (auditTypeFilter === 'entry' && log.type !== 'entry') return false;
      if (auditTypeFilter === 'operator_consumption' && (log.type !== 'consumption' || !log.lineId)) return false;
      if (auditTypeFilter === 'consumption' && (log.type !== 'consumption' || log.lineId)) return false; // manual adjusting withdrawals
    }

    // Starting Date Constraint 
    if (auditDateStart) {
      const sLimit = new Date(auditDateStart);
      sLimit.setHours(0, 0, 0, 0);
      if (log.timestamp < sLimit) return false;
    }

    // Ending Date Constraint
    if (auditDateEnd) {
      const eLimit = new Date(auditDateEnd);
      eLimit.setHours(23, 59, 59, 999);
      if (log.timestamp > eLimit) return false;
    }

    return true;
  });

  // Authorization layout validation
  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm max-w-xl mx-auto my-12">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
        <p className="text-slate-400 font-bold text-sm uppercase tracking-widest">Sincronizando Perfil...</p>
      </div>
    );
  }

  if (!isApproved) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center bg-white rounded-3xl border border-slate-100 shadow-sm max-w-xl mx-auto my-12">
        <AlertTriangle className="w-16 h-16 text-amber-500 mb-4 animate-bounce" />
        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Modulo Indisponível</h2>
        <p className="text-slate-500 text-sm font-semibold max-w-sm mt-2 leading-relaxed">
          Sua conta está registrada mas seu perfil de aprovação ainda é pendente. Peça para o administrador do sistema liberar seu acesso no painel de gerência.
        </p>
      </div>
    );
  }

  // Purely blocked operator-only interface
  if (isCommonUser) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 md:px-8 space-y-8 font-sans">
        {/* Simplified elegant title block */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-100">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-2xl">
                <Package className="w-8 h-8 font-bold" />
              </div>
              Lançamento de Consumo de Insumos
            </h1>
            <p className="text-slate-500 text-sm font-medium mt-1 leading-relaxed">
              Painel simplificado para registro imediato de insumos consumidos nas linhas de produção.
            </p>
          </div>
        </div>

        {/* Global Toast Success and Error Notifications Banner */}
        <AnimatePresence mode="wait">
          {successMsg && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex items-center gap-3 bg-emerald-50 text-emerald-800 border border-emerald-200 px-5 py-4 rounded-2xl shadow-sm font-bold text-sm"
            >
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
              <button onClick={() => setSuccessMsg('')} className="ml-auto text-emerald-500 hover:text-emerald-700">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {errMsg && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex items-center gap-3 bg-rose-50 text-rose-800 border border-rose-200 px-5 py-4 rounded-2xl shadow-sm font-bold text-sm"
            >
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{errMsg}</span>
              <button onClick={() => setErrMsg('')} className="ml-auto text-rose-500 hover:text-rose-700">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm">
            <Loader2 className="w-12 h-12 text-emerald-600 animate-spin mb-4" />
            <p className="text-slate-400 font-bold text-sm uppercase tracking-widest">Sincronizando Insumos...</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
            <div>
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                <User className="w-5.5 h-5.5 text-blue-600" />
                Consumo Direto do Operador (Linha Fabril)
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                Registre de forma simplificada e imediata os insumos utilizados nas máquinas fabris durante o turno.
              </p>
            </div>

            {activeItems.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 rounded-2xl border border-slate-100">
                <Package className="w-12 h-12 text-slate-350 mx-auto mb-2" />
                <p className="text-slate-500 font-bold text-sm">Ainda sem insumos catalogados e ativos.</p>
              </div>
            ) : (
              <form onSubmit={handleProcessOperatorConsumption} className="space-y-4 p-5 bg-blue-50/20 border border-blue-100/50 rounded-3xl">
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-blue-800 uppercase tracking-widest mb-1.5 ml-1">Insumo Utilizado *</label>
                    <select
                      required
                      value={consumeItemId}
                      onChange={(e) => setConsumeItemId(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-bold text-slate-700"
                    >
                      <option value="">Qual insumo consumiu?</option>
                      {activeItems.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.currentStock.toFixed(1)} {item.unit} em estoque)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-blue-800 uppercase tracking-widest mb-1.5 ml-1">Volume Consumido *</label>
                    <input
                      required
                      type="number"
                      step="any"
                      min="0.01"
                      placeholder="Digite a quantidade exata"
                      value={consumeQty}
                      onChange={(e) => setConsumeQty(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-bold text-slate-700"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-blue-800 uppercase tracking-widest mb-1.5 ml-1">Linha de Destino *</label>
                    <select
                      required
                      value={consumeLineId}
                      onChange={(e) => setConsumeLineId(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-bold text-slate-700"
                    >
                      <option value="">Qual Linha Fabril?</option>
                      {lines.map(line => (
                        <option key={line.id} value={line.id}>{line.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-blue-800 uppercase tracking-widest mb-1.5 ml-1">Turno de Trabalho *</label>
                    <select
                      required
                      value={consumeShift}
                      onChange={(e: any) => setConsumeShift(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-bold text-slate-700"
                    >
                      <option value="Turno 1">Turno 1 (00:00 - 08:00)</option>
                      <option value="Turno 2">Turno 2 (08:00 - 16:00)</option>
                      <option value="Turno 3">Turno 3 (16:00 - 00:00)</option>
                      <option value="Geral">Turno Geral (Comercial)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-blue-800 uppercase tracking-widest mb-1.5 ml-1">Letra / Equipe Atribuída</label>
                    <div className="w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-between text-xs font-black text-slate-700 h-[46px]">
                      <span className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-blue-600" />
                        Escala: {consumeGroup || 'No Scale'}
                      </span>
                      <span className="text-[10px] text-slate-400 font-bold">Auto</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-blue-800 uppercase tracking-widest mb-1.5 ml-1">Nome do Operador *</label>
                  <div className="w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-between text-xs font-black text-slate-700 h-[46px]">
                    <span className="flex items-center gap-2">
                      <User className="w-4 h-4 text-blue-600" />
                      {consumeOperator || profile?.displayName || user?.displayName || 'Operador'}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-slate-500 font-bold">
                      <Lock className="w-3 h-3 text-slate-400" />
                      Bloqueado
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-blue-800 uppercase tracking-widest mb-1.5 ml-1">Observações do Operador</label>
                  <textarea
                    rows={2.5}
                    placeholder="Opcional: Descreva anomalias ou observações se aplicável..."
                    value={consumeNotes}
                    onChange={(e) => setConsumeNotes(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-400"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl transition-all shadow-md shadow-blue-600/10 text-xs uppercase tracking-wider flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Registrar Consumo do Operador
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    );
  }

  // Authorization layout validation
  if (!isApproved) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center bg-white rounded-3xl border border-slate-100 shadow-sm max-w-xl mx-auto my-12">
        <AlertTriangle className="w-16 h-16 text-amber-500 mb-4 animate-bounce" />
        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Modulo Indisponível</h2>
        <p className="text-slate-500 text-sm font-semibold max-w-sm mt-2 leading-relaxed">
          Sua conta está registrada mas seu perfil de aprovação ainda é pendente. Peça para o administrador do sistema liberar seu acesso no painel de gerência.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 md:px-8 space-y-8 font-sans">
      
      {/* Title block with elegant branding typography */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-100">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-2xl">
              <Package className="w-8 h-8" />
            </div>
            Controle Simplificado de Insumos
          </h1>
          <p className="text-slate-500 text-sm font-medium mt-1 leading-relaxed">
            Painel simplificado de insumos consumíveis, cadastro de especificações táticas, entradas locais e auditoria de estoque.
          </p>
        </div>

        {/* Action Indicators displaying low supplies warnings */}
        {lowStockItems.length > 0 && (isManager || isAdmin) && (
          <div className="bg-amber-500/10 border border-amber-500/20 text-amber-900 rounded-2xl px-4 py-3 max-w-md flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="text-xs font-semibold">
              <span className="font-extrabold text-amber-800 uppercase block tracking-wider">Atenção Estoque</span>
              {lowStockItems.length === 1 ? (
                <span>O insumo <strong className="font-extrabold text-amber-900">"{lowStockItems[0].name}"</strong> está abaixo do estoque de segurança!</span>
              ) : (
                <span>Há <strong className="font-extrabold text-amber-900">{lowStockItems.length} insumos</strong> operando abaixo do limite crítico de reposição.</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Unified Menu Selector - Same responsive layout and dropdown format as the rest of the application */}
      {(isManager || isAdmin) && (
        <div className="flex flex-col gap-4">
          {/* Desktop Tabs - Visible on lg screens */}
          <div className="hidden lg:flex items-center p-1.5 bg-slate-100/50 rounded-2xl border border-slate-200/60 backdrop-blur-sm w-fit">
            <button
              onClick={() => handleTabChange('dashboard')}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
                activeTab === 'dashboard'
                  ? "bg-white text-slate-900 shadow-md shadow-slate-200/50"
                  : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
              )}
            >
              <TrendingUp className="w-4 h-4 animate-pulse text-emerald-600" /> Dashboard & Relatório
            </button>

            <button
              onClick={() => handleTabChange('manage_items')}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
                activeTab === 'manage_items'
                  ? "bg-white text-slate-900 shadow-md shadow-slate-200/50"
                  : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
              )}
            >
              <PackagePlus className="w-4 h-4" /> 1. Cadastrar Insumos
            </button>

            <button
              onClick={() => handleTabChange('adjust_stock')}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
                activeTab === 'adjust_stock'
                  ? "bg-white text-emerald-700 shadow-md shadow-slate-200/50"
                  : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
              )}
            >
              <Sliders className="w-4 h-4" /> 2. Entrada/Saída
            </button>

            <button
              onClick={() => handleTabChange('operator_consumption')}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
                activeTab === 'operator_consumption'
                  ? "bg-white text-blue-700 shadow-md shadow-slate-200/50"
                  : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
              )}
            >
              <User className="w-4 h-4" /> 3. Consumo do Operador
            </button>

            <button
              onClick={() => handleTabChange('audit_log')}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
                activeTab === 'audit_log'
                  ? "bg-white text-slate-900 shadow-md shadow-slate-200/50"
                  : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
              )}
            >
              <History className="w-4 h-4" /> 4. Auditoria de Estoque
            </button>
          </div>

          {/* Mobile/Tablet Dropdown Control - Visible below lg screens */}
          <div className="lg:hidden relative inline-block w-full max-w-sm">
            <button
              onClick={() => setShowTabMenu(!showTabMenu)}
              className="w-full flex items-center justify-between gap-3 px-5 py-4 bg-white border border-slate-200 rounded-2xl text-xs font-black uppercase tracking-wider text-slate-700 shadow-sm transition-all active:scale-[0.98] hover:border-emerald-200"
            >
              <div className="flex items-center gap-2.5">
                {activeTab === 'dashboard' && <><TrendingUp className="w-4 h-4 text-emerald-600 animate-pulse" /> Dashboard & Relatório</>}
                {activeTab === 'manage_items' && <><PackagePlus className="w-4 h-4 text-slate-800" /> 1. Cadastrar Insumos</>}
                {activeTab === 'adjust_stock' && <><Sliders className="w-4 h-4 text-emerald-700" /> 2. Entrada/Saída</>}
                {activeTab === 'operator_consumption' && <><User className="w-4 h-4 text-blue-700" /> 3. Consumo do Operador</>}
                {activeTab === 'audit_log' && <><History className="w-4 h-4 text-slate-900" /> 4. Auditoria de Estoque</>}
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
                    className="absolute right-0 mt-2 w-full min-w-[260px] bg-white border border-slate-100 rounded-2xl shadow-2xl z-20 overflow-hidden p-1.5"
                  >
                    {[
                      { id: 'dashboard', label: 'Dashboard & Relatório', icon: TrendingUp },
                      { id: 'manage_items', label: '1. Cadastrar Insumos', icon: PackagePlus, roles: [(isManager || isAdmin)] },
                      { id: 'adjust_stock', label: '2. Entrada/Saída', icon: Sliders, roles: [(isManager || isAdmin)] },
                      { id: 'operator_consumption', label: '3. Consumo do Operador', icon: User },
                      { id: 'audit_log', label: '4. Auditoria de Estoque', icon: History, roles: [(isManager || isAdmin)] }
                    ].map((tab: any) => {
                      if (tab.roles && !tab.roles.every(Boolean)) return null;
                      const Icon = tab.icon;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => handleTabChange(tab.id)}
                          className={cn(
                            "w-full flex items-center gap-2.5 px-4 py-3.5 rounded-xl text-left text-xs font-black uppercase tracking-wider transition-all",
                            activeTab === tab.id ? "bg-emerald-50 text-emerald-700" : "text-slate-500 hover:bg-slate-50"
                          )}
                        >
                          <Icon className="w-4 h-4" />
                          {tab.label}
                        </button>
                      );
                    })}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Global Toast Success and Error Notifications Banner */}
      <AnimatePresence mode="wait">
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-3 bg-emerald-50 text-emerald-800 border border-emerald-200 px-5 py-4 rounded-2xl shadow-sm font-bold text-sm"
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
            <button onClick={() => setSuccessMsg('')} className="ml-auto text-emerald-500 hover:text-emerald-700">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}

        {errMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-3 bg-rose-50 text-rose-800 border border-rose-200 px-5 py-4 rounded-2xl shadow-sm font-bold text-sm"
          >
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{errMsg}</span>
            <button onClick={() => setErrMsg('')} className="ml-auto text-rose-500 hover:text-rose-700">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main tab content workspace container */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm">
          <Loader2 className="w-12 h-12 text-emerald-600 animate-spin mb-4" />
          <p className="text-slate-400 font-bold text-sm uppercase tracking-widest">Sincronizando Firestore...</p>
        </div>
      ) : (
        <div className="transition-all duration-300">
          
          {/* TAB 1: DASHBOARD & CLEAN REPORT VIEWER */}
          {actualTabToShow === 'dashboard' && (isManager || isAdmin) && (
            <div className="space-y-8">
              
              {/* KPIs Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-6 rounded-[2rem] border border-slate-150/40 shadow-sm flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Insumos Ativos</span>
                    <span className="text-3xl font-black text-slate-900 leading-none block mt-2">{activeItems.length}</span>
                    <span className="text-xs font-semibold text-slate-400 mt-1 block">Varietais cadastrados</span>
                  </div>
                  <div className="p-4 bg-emerald-50 text-emerald-600 rounded-3xl">
                    <Package className="w-6 h-6" />
                  </div>
                </div>

                <div className={cn(
                  "p-6 rounded-[2rem] border shadow-sm flex items-center justify-between transition-all",
                  lowStockItems.length > 0 ? "bg-amber-50/60 border-amber-200/50" : "bg-white border-slate-150/40"
                )}>
                  <div>
                    <span className={cn("text-[10px] font-black uppercase tracking-widest block", lowStockItems.length > 0 ? "text-amber-800" : "text-slate-400")}>Abaixo do Mínimo</span>
                    <span className="text-3xl font-black text-slate-900 leading-none block mt-2">{lowStockItems.length}</span>
                    <span className="text-xs font-semibold text-slate-400 mt-1 block">Requerem compra/ajuste</span>
                  </div>
                  <div className={cn("p-4 rounded-3xl", lowStockItems.length > 0 ? "bg-amber-100 text-amber-700 animate-pulse" : "bg-slate-50 text-slate-400")}>
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                </div>

                <div className="bg-white p-6 rounded-[2rem] border border-slate-150/40 shadow-sm flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Entradas Registradas</span>
                    <span className="text-3xl font-black text-slate-900 leading-none block mt-2">
                      {logs.filter(l => l.type === 'entry').length}
                    </span>
                    <span className="text-xs font-semibold text-slate-400 mt-1 block">Movimentações de adição</span>
                  </div>
                  <div className="p-4 bg-blue-50 text-blue-600 rounded-3xl">
                    <ArrowUpRight className="w-6 h-6" />
                  </div>
                </div>

                <div className="bg-white p-6 rounded-[2rem] border border-slate-150/40 shadow-sm flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Consumos Realizados</span>
                    <span className="text-3xl font-black text-slate-900 leading-none block mt-2">
                      {logs.filter(l => l.type === 'consumption').length}
                    </span>
                    <span className="text-xs font-semibold text-slate-400 mt-1 block">Ocorrências de uso</span>
                  </div>
                  <div className="p-4 bg-slate-50 text-slate-600 rounded-3xl">
                    <ArrowDownRight className="w-6 h-6" />
                  </div>
                </div>
              </div>

              {/* Clean charts layouts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Visualizer 1: Inventory volume bar chart */}
                <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                  <div className="mb-4">
                    <h3 className="text-base font-black text-slate-950 uppercase tracking-tight flex items-center gap-2">
                      <Sliders className="w-4.5 h-4.5 text-emerald-600" />
                      Status Comparativo de Estoque
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">Saldo real versus limites de tolerância e reposição de pátio.</p>
                  </div>

                  <div className="h-64 w-full">
                    {chartStockData.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-slate-300 font-bold text-xs uppercase tracking-widest">Aguardando dados de insumos...</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartStockData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} fontStyle="normal" tickLine={false} />
                          <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #f1f5f9', borderRadius: '12px', fontSize: '12px' }}
                            labelStyle={{ fontWeight: 'black', color: '#1e293b' }}
                          />
                          <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                          <Bar dataKey="Estoque Atual" fill="#10b981" barSize={18} radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Limite Mínimo" fill="#f59e0b" barSize={18} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Visualizer 2: Historical Movement Stream */}
                <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                  <div className="mb-4">
                    <h3 className="text-base font-black text-slate-950 uppercase tracking-tight flex items-center gap-2">
                      <Calendar className="w-4.5 h-4.5 text-blue-600" />
                      Histórico Diário de Fluxos
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">Visão do fluxo volumétrico consolidado (Últimos dias ativos).</p>
                  </div>

                  <div className="h-64 w-full">
                    {Object.keys(timelineMap).length === 0 ? (
                      <div className="h-full flex items-center justify-center text-slate-300 font-bold text-xs uppercase tracking-widest">Sem movimentações recentes registradas.</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={timelineChartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="day" stroke="#94a3b8" fontSize={9} tickLine={false} />
                          <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #f1f5f9', borderRadius: '12px', fontSize: '12px' }}
                          />
                          <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                          <Line type="monotone" dataKey="Entradas (+)" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                          <Line type="monotone" dataKey="Saídas (-)" stroke="#ef4444" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>

              {/* Point 4 - Simplified Table of inventories with its Characteristics and Export Button */}
              <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                      <FileText className="w-5 h-5 text-slate-700" />
                      Inventário em Tempo Real & Características
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      Relação completa de almoxarifado incluindo descrição técnica e limite de segurança.
                    </p>
                  </div>

                  <div className="flex items-center gap-3 self-stretch sm:self-auto">
                    <div className="relative flex-1 sm:w-64">
                      <Search className="absolute left-3 w-4 h-4 text-slate-400 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Filtrar por nome ou especificação..."
                        value={dashboardSearch}
                        onChange={(e) => setDashboardSearch(e.target.value)}
                        className="w-full bg-slate-50 pl-9 pr-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-xs font-bold text-slate-700"
                      />
                    </div>
                    <button
                      onClick={exportCSVReport}
                      title="Clique para exportar os dados para arquivo .CSV do excel"
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors shadow-sm"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Exportar CSV
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-600 whitespace-nowrap">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                        <th className="px-5 py-3 rounded-l-2xl">Item de Insumo</th>
                        <th className="px-5 py-3">Características / Especificações</th>
                        <th className="px-5 py-3">Limite Mínimo</th>
                        <th className="px-5 py-3">Estoque Disponível</th>
                        <th className="px-5 py-3 rounded-r-2xl text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredDashboardItems.map((item) => {
                        const isStockLow = item.currentStock < item.minStock;
                        return (
                          <tr key={item.id} className="hover:bg-slate-50/40 transition-colors font-semibold select-none">
                            <td className="px-5 py-3.5 text-slate-900 font-extrabold text-[13px]">{item.name}</td>
                            <td className="px-5 py-3.5 max-w-xs truncate text-[11px] text-slate-500 font-medium" title={item.characteristics || 'Nenhuma especificação cadastrada.'}>
                              {item.characteristics ? (
                                <span className="text-slate-700">{item.characteristics}</span>
                              ) : (
                                <span className="text-slate-400 italic">Não descrita</span>
                              )}
                            </td>
                            <td className="px-5 py-3.5 font-mono text-slate-500">
                              {item.minStock.toFixed(2)} <span className="uppercase text-[9px] font-bold text-slate-400">{item.unit}</span>
                            </td>
                            <td className={`px-5 py-3.5 font-mono text-sm font-black transition-colors ${
                              isStockLow ? 'text-amber-600' : 'text-slate-900'
                            }`}>
                              {item.currentStock.toFixed(2)} <span className="uppercase text-[9px] font-bold text-slate-400">{item.unit}</span>
                            </td>
                            <td className="px-5 py-3.5 text-center">
                              {isStockLow ? (
                                <span className="bg-amber-150 inline-block text-[9px] font-black uppercase tracking-wider text-amber-900 bg-amber-100 border border-amber-200/40 px-2.5 py-1 rounded-lg">
                                  Estoq. Crítico
                                </span>
                              ) : (
                                <span className="bg-emerald-50 inline-block text-[9px] font-black uppercase tracking-wider text-emerald-800 border border-emerald-100 px-2.5 py-1 rounded-lg">
                                  Estoq. Seguro
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}

                      {filteredDashboardItems.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-5 py-12 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">
                            Nenhum insumo localizado para os termos indicados.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: REGISTER INGREDIENTS (Point 1: Cadastro de Insumos & Característica) */}
          {actualTabToShow === 'manage_items' && (isManager || isAdmin) && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Add / Edit Form Column */}
              <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-5">
                <div>
                  <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                    <PackagePlus className="w-5.5 h-5.5 text-emerald-600" />
                    {editingItem ? 'Alterar Cadastro' : 'Novo LogInsumo'}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                    Cadastre cada matéria-prima com suas características específicas de composição ou aplicação.
                  </p>
                </div>

                <form onSubmit={handleSaveItem} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Nome do Insumo *</label>
                    <input
                      required
                      type="text"
                      value={itemName}
                      onChange={(e) => setItemName(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-xs font-bold text-slate-700 transition-all placeholder:font-semibold placeholder:text-slate-400"
                      placeholder="Ex: Tinta Preta de Alta Fixação"
                    />
                  </div>

                  {/* Characteristics definition field (Point 1 requirement) */}
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Características / Aplicação de Uso</label>
                    <textarea
                      rows={3}
                      value={itemCharacteristics}
                      onChange={(e) => setItemCharacteristics(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-xs font-semibold text-slate-700 transition-all placeholder:font-normal placeholder:text-slate-400"
                      placeholder="Identifique características físicas como litragem, peso, lote, cor, se é inflamável ou local de aplicação prioritário."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Unid. Medida</label>
                      <select
                        required
                        value={itemUnit}
                        onChange={(e: any) => setItemUnit(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-xs font-bold text-slate-700 uppercase"
                      >
                        <option value="un">Unidade (un)</option>
                        <option value="kg">Peso (kg)</option>
                        <option value="L">Litro (L)</option>
                        <option value="m">Metro (m)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Estoq. Mínimo</label>
                      <input
                        required
                        type="number"
                        step="0.01"
                        min="0"
                        value={itemMinStock}
                        onChange={(e) => setItemMinStock(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-xs font-bold text-slate-700"
                      />
                    </div>
                  </div>

                  {/* Disable editing initial stock during item modifications */}
                  {!editingItem && (
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Estoque Físico Inicial</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={itemInitialStock}
                        onChange={(e) => setItemInitialStock(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-xs font-bold text-slate-700 placeholder:text-slate-400 placeholder:font-normal"
                        placeholder="Fazer entrada de saldo inicial"
                      />
                    </div>
                  )}

                  <div className="flex gap-2.5 pt-3">
                    {editingItem && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingItem(null);
                          setItemName('');
                          setItemUnit('un');
                          setItemMinStock('5');
                          setItemInitialStock('0');
                          setItemCharacteristics('');
                        }}
                        className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-xl transition-all text-xs uppercase tracking-wider"
                      >
                        Cancelar
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl transition-all shadow-lg text-xs uppercase tracking-wider flex items-center justify-center gap-1.5"
                    >
                      {submitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Save className="w-3.5 h-3.5" />
                          {editingItem ? 'Salvar Edição' : 'Concluir Cadastro'}
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {/* General list on the Right */}
              <div className="lg:col-span-2 bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-4">
                <div>
                  <h3 className="text-base font-black text-slate-900 uppercase">Lista de Insumos Registrados</h3>
                  <p className="text-xs text-slate-400 font-medium">Habilite, desabilite ou altere as características dos materiais catalogados.</p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        <th className="px-4 py-3 rounded-l-2xl">Nome</th>
                        <th className="px-4 py-3">Unid</th>
                        <th className="px-4 py-3">Alerta Mín.</th>
                        <th className="px-4 py-3">Características</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right rounded-r-2xl">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 font-semibold text-slate-600">
                      {items.map(item => (
                        <tr key={item.id} className={cn("hover:bg-slate-50/50 transition-colors font-medium", !item.active && "opacity-50")}>
                          <td className="px-4 py-3 text-slate-900 font-extrabold text-xs">{item.name}</td>
                          <td className="px-4 py-3 uppercase font-bold text-slate-400">{item.unit}</td>
                          <td className="px-4 py-3 font-mono font-bold">{item.minStock}</td>
                          <td className="px-4 py-3 max-w-[150px] truncate leading-tight text-slate-500 font-normal">
                            {item.characteristics || (
                              <span className="text-slate-400 italic font-light">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {item.active ? (
                              <span className="bg-emerald-50 text-emerald-700 text-[9px] font-black border border-emerald-100/50 px-2 py-0.5 rounded uppercase">Ativo</span>
                            ) : (
                              <span className="bg-slate-100 text-slate-500 text-[9px] font-black border border-slate-200/50 px-2 py-0.5 rounded uppercase font-extrabold">Inativo</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right space-x-1.5 whitespace-nowrap">
                            <button
                              onClick={() => handleEditClick(item)}
                              className="text-slate-600 hover:text-slate-900 hover:bg-slate-100 p-1.5 rounded-lg transition-colors"
                              title="Editar Características e Estoque mínimo"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleActive(item)}
                              className={cn(
                                "px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded border transition-colors",
                                item.active ? "bg-amber-50 hover:bg-amber-100/60 text-amber-700 border-amber-200/50" : "bg-emerald-50 hover:bg-emerald-100/60 text-emerald-800 border-emerald-200/50"
                              )}
                            >
                              {item.active ? 'Inativar' : 'Reabilitar'}
                            </button>
                          </td>
                        </tr>
                      ))}

                      {items.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-12 text-center text-slate-400 font-bold uppercase tracking-wider">
                            Nenhum insumo ou material registrado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: LOCAL ENTRY & WITHDRAWALS STOCK ADJUSTMENT (Point 2: Entrada e Saída de Insumos) */}
          {actualTabToShow === 'adjust_stock' && (isManager || isAdmin) && (
            <div className="max-w-2xl mx-auto bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
              <div>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                  <Sliders className="w-5.5 h-5.5 text-emerald-600" />
                  Módulo de Ajuste e Entradas de Estoque
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                  Realize entradas de reposição de almoxarifado ou saídas de ajustes manuais (descartes, correções de pátio ou vencimento).
                </p>
              </div>

              {activeItems.length === 0 ? (
                <div className="text-center py-10 bg-slate-50 rounded-2xl border border-slate-100">
                  <Package className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                  <p className="text-slate-500 font-bold text-sm">Nenhum Insumo Ativo cadastrado para movimentação!</p>
                  <p className="text-slate-400 text-xs mt-1">Por favor, acesse a aba "1. Cadastrar Insumos" primeiro antes do ajuste.</p>
                </div>
              ) : (
                <form onSubmit={handleProcessAdjustment} className="space-y-5 shadow-inner p-2 rounded-2.5xl bg-slate-50/50 border border-slate-100">
                  
                  {/* Select Entry vs Adjusted Exit Withdrawal */}
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Tipo de Operação de Ajuste</label>
                    <div className="grid grid-cols-2 gap-3 text-center">
                      <button
                        type="button"
                        onClick={() => setAdjustType('entry')}
                        className={cn(
                          "py-3.5 rounded-xl font-black uppercase text-xs tracking-wider border transition-all flex items-center justify-center gap-2",
                          adjustType === 'entry'
                            ? "bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-600/10"
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        <Plus className="w-4 h-4" />
                        Entrada (+ Adicionar)
                      </button>

                      <button
                        type="button"
                        onClick={() => setAdjustType('consumption')}
                        className={cn(
                          "py-3.5 rounded-xl font-black uppercase text-xs tracking-wider border transition-all flex items-center justify-center gap-2",
                          adjustType === 'consumption'
                            ? "bg-rose-650 bg-rose-600 border-rose-600 text-white shadow-md shadow-rose-600/10"
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        <Minus className="w-4 h-4" />
                        Ajuste de Saída (- Baixa)
                      </button>
                    </div>
                  </div>

                  {/* Form fields */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Insumo Alvo *</label>
                      <select
                        required
                        value={adjustItemId}
                        onChange={(e) => setAdjustItemId(e.target.value)}
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-xs font-bold text-slate-750"
                      >
                        <option value="">Selecione o Insumo...</option>
                        {activeItems.map(item => (
                          <option key={item.id} value={item.id}>
                            {item.name} (Saldo: {item.currentStock.toFixed(1)} {item.unit})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Quantidade da Transação *</label>
                      <div className="relative">
                        <input
                          required
                          type="number"
                          step="0.01"
                          min="0.01"
                          placeholder="Ex: 10"
                          value={adjustQty}
                          onChange={(e) => setAdjustQty(e.target.value)}
                          className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-xs font-bold text-slate-700 pr-12"
                        />
                        {adjustItemId && (
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 uppercase text-[10px] font-black text-slate-400 tracking-wider">
                            {activeItems.find(i => i.id === adjustItemId)?.unit || ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Responsável pelo Ajuste / Recebimento *</label>
                    <input
                      required
                      type="text"
                      placeholder="Identifique quem recebeu ou retirou o material"
                      value={adjustUser}
                      onChange={(e) => setAdjustUser(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-xs font-bold text-slate-700"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Justificativa de Ajuste / Nota Almoxarifado</label>
                    <textarea
                      required={adjustType === 'consumption'}
                      rows={3}
                      placeholder={adjustType === 'entry' ? "Ex: Entrada de lote de novos galões, nota fiscal nº 4312." : "Justifique a saída manual (Ex: Material descartado por avaria ou término de validade) * OBRIGATÓRIO"}
                      value={adjustNotes}
                      onChange={(e) => setAdjustNotes(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-xs font-semibold text-slate-750 placeholder:font-normal placeholder:text-slate-400"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className={cn(
                      "w-full py-4 text-white font-black rounded-xl transition-all shadow-md text-xs uppercase tracking-wider flex items-center justify-center gap-2",
                      adjustType === 'entry' ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-150" : "bg-rose-600 hover:bg-rose-700 shadow-rose-150"
                    )}
                  >
                    {submitting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Gravar Movimentação no Estoque
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* TAB 4: OPERATOR DIRECT CONSUMPTION LOG (Point 3: Consumo de Insumo Prático pelo Operador) */}
          {actualTabToShow === 'operator_consumption' && (
            <div className="max-w-2xl mx-auto bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
              
              <div>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                  <User className="w-5.5 h-5.5 text-blue-600" />
                  Consumo Direto do Operador (Linha Fabril)
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                  Para os operadores registrarem de forma simplificada e imediata os insumos utilizados nas máquinas fabris durante o turno.
                </p>
              </div>

              {activeItems.length === 0 ? (
                <div className="text-center py-10 bg-slate-50 rounded-2xl border border-slate-100">
                  <Package className="w-12 h-12 text-slate-350 mx-auto mb-2" />
                  <p className="text-slate-500 font-bold text-sm">Ainda sem insumos catalogados e ativos.</p>
                </div>
              ) : (
                <form onSubmit={handleProcessOperatorConsumption} className="space-y-4 p-5 bg-blue-50/20 border border-blue-100/50 rounded-3xl">
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-blue-800 uppercase tracking-widest mb-1.5 ml-1">Insumo Utilizado *</label>
                      <select
                        required
                        value={consumeItemId}
                        onChange={(e) => setConsumeItemId(e.target.value)}
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-bold text-slate-700"
                      >
                        <option value="">Qual insumo consumiu?</option>
                        {activeItems.map(item => (
                          <option key={item.id} value={item.id}>
                            {item.name} ({item.currentStock.toFixed(1)} {item.unit} em estoque)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-blue-800 uppercase tracking-widest mb-1.5 ml-1">Quantidade Utilizada *</label>
                      <div className="relative">
                        <input
                          required
                          type="number"
                          step="0.01"
                          min="0.01"
                          placeholder="Ex: 2.5"
                          value={consumeQty}
                          onChange={(e) => setConsumeQty(e.target.value)}
                          className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-bold text-slate-700 pr-12"
                        />
                        {consumeItemId && (
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 uppercase text-[10px] font-black text-slate-400 tracking-wider">
                            {activeItems.find(i => i.id === consumeItemId)?.unit || ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-blue-800 uppercase tracking-widest mb-1.5 ml-1">Linha de Produção / Máquina *</label>
                      <select
                        required
                        value={consumeLineId}
                        onChange={(e) => setConsumeLineId(e.target.value)}
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-bold text-slate-700"
                      >
                        <option value="">Selecione de onde foi usado...</option>
                        {lines.map(line => (
                          <option key={line.id} value={line.id}>{line.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-blue-800 uppercase tracking-widest mb-1.5 ml-1">Letra da Equipe (Escala) *</label>
                      <div className="w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-between text-xs font-black text-slate-700 h-[46px]">
                        <span className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded bg-blue-600/10 text-blue-700 flex items-center justify-center text-[11px] font-black uppercase">
                            {consumeGroup || '-'}
                          </span>
                          Letra {consumeGroup || 'Sem Letra'}
                        </span>
                        <span className="flex items-center gap-1 text-[10px] text-slate-500">
                          <Lock className="w-3 h-3 text-slate-400" />
                          Escala
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-blue-800 uppercase tracking-widest mb-1.5 ml-1">Nome do Operador *</label>
                    {(!isManager && !isAdmin) ? (
                      <div className="w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-between text-xs font-black text-slate-700 h-[46px]">
                        <span className="flex items-center gap-2">
                          <User className="w-4 h-4 text-blue-600" />
                          {consumeOperator || profile?.displayName || user?.displayName || 'Operador'}
                        </span>
                        <span className="flex items-center gap-1 text-[10px] text-slate-500">
                          <Lock className="w-3 h-3 text-slate-400" />
                          Bloqueado
                        </span>
                      </div>
                    ) : (
                      <input
                        required
                        type="text"
                        placeholder="Identificação do Operador que realizou a troca"
                        value={consumeOperator}
                        onChange={(e) => setConsumeOperator(e.target.value)}
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-bold text-slate-700"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-blue-800 uppercase tracking-widest mb-1.5 ml-1">Observações do Operador</label>
                    <textarea
                      rows={2.5}
                      placeholder="Opcional: Descreva anomalias ou observações se aplicável..."
                      value={consumeNotes}
                      onChange={(e) => setConsumeNotes(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-400"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl transition-all shadow-md shadow-blue-600/10 text-xs uppercase tracking-wider flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Registrar Consumo do Operador
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* TAB 5: COMPREHENSIVE AUDIT TRAIL LOG (Point 5: Aba de Auditoria de Insumo) */}
          {actualTabToShow === 'audit_log' && (isManager || isAdmin) && (
            <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
              
              <div>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                  <History className="w-5.5 h-5.5 text-slate-700" />
                  Livro de Auditoria & Rastreabilidade de Insumos
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  Relatório cronológico auditável de movimentações. Qualquer adição, consumo operacional ou ajuste de almoxarifado fica registrado permanentemente.
                </p>
              </div>

              {/* Filters Block */}
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="lg:col-span-2">
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Palavra-chave</label>
                  <div className="relative">
                    <Search className="absolute left-3 w-4 h-4 text-slate-400 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={auditQuery}
                      onChange={(e) => setAuditQuery(e.target.value)}
                      placeholder="Pesquisar por notas, operador, insumo..."
                      className="w-full bg-white pl-9 pr-3 py-2 border border-slate-200 rounded-xl outline-none text-xs font-bold text-slate-700 focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Tipo de Lançamento</label>
                  <select
                    value={auditTypeFilter}
                    onChange={(e: any) => setAuditTypeFilter(e.target.value)}
                    className="w-full bg-white px-3 py-2 border border-slate-200 rounded-xl outline-none text-xs font-bold text-slate-700"
                  >
                    <option value="all">Todas Operações</option>
                    <option value="entry">Entradas (Reabastecimento)</option>
                    <option value="operator_consumption">Consumos de Linha (Operadores)</option>
                    <option value="consumption">Saídas / Ajustes Independentes</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Filtro por Insumo</label>
                  <select
                    value={auditItemFilter}
                    onChange={(e) => setAuditItemFilter(e.target.value)}
                    className="w-full bg-white px-3 py-2 border border-slate-200 rounded-xl outline-none text-xs font-bold text-slate-700"
                  >
                    <option value="all">Todos Insumos</option>
                    {items.map(i => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Filtro Período</label>
                  <div className="flex gap-1.5 items-center">
                    <input
                      type="date"
                      value={auditDateStart}
                      onChange={(e) => setAuditDateStart(e.target.value)}
                      className="w-full bg-white px-2 py-1 flex-1 border border-slate-200 rounded-lg outline-none text-[10px] font-bold text-slate-750"
                    />
                    <span className="text-[10px] text-slate-400 font-bold">à</span>
                    <input
                      type="date"
                      value={auditDateEnd}
                      onChange={(e) => setAuditDateEnd(e.target.value)}
                      className="w-full bg-white px-2 py-1 flex-1 border border-slate-200 rounded-lg outline-none text-[10px] font-bold text-slate-750"
                    />
                  </div>
                </div>
              </div>

              {/* Table Listings */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-150 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      <th className="px-4 py-3 rounded-l-2xl">Data / Hora</th>
                      <th className="px-4 py-3">Insumo</th>
                      <th className="px-4 py-3">Categoria da Ação</th>
                      <th className="px-4 py-3">Volume Ajuste</th>
                      <th className="px-4 py-3">Operador / Responsável</th>
                      <th className="px-4 py-3">Frente de Uso (Linha)</th>
                      <th className="px-4 py-3 rounded-r-2xl">Auditoria / Observações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 font-semibold text-slate-600">
                    {processedAuditLogs.map(log => {
                      const isEntry = log.type === 'entry';
                      const isOperatorConsumption = log.type === 'consumption' && log.lineId;
                      const isAdjustmentOutflow = log.type === 'consumption' && !log.lineId;
                      
                      const itemDef = items.find(i => i.id === log.itemId);

                      return (
                        <tr key={log.id} className="hover:bg-slate-50/40 transition-colors">
                          <td className="px-4 py-3.5 text-slate-500 font-mono text-[10px]">
                            {log.timestamp ? log.timestamp.toLocaleString('pt-BR', {
                              day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                            }) : 'Sem registro'}
                          </td>
                          <td className="px-4 py-3.5 text-slate-900 font-extrabold">{log.itemName}</td>
                          <td className="px-4 py-3.5">
                            {isEntry && (
                              <span className="bg-emerald-50 border border-emerald-100 text-emerald-800 text-[9px] font-black px-2 py-0.5 rounded-md uppercase flex items-center gap-1 w-max">
                                <ArrowUpRight className="w-2.5 h-2.5" />
                                Entrada de Lote
                              </span>
                            )}
                            {isOperatorConsumption && (
                              <span className="bg-blue-50 border border-blue-100 text-blue-800 text-[9px] font-black px-2 py-0.5 rounded-md uppercase flex items-center gap-1 w-max">
                                <User className="w-2.5 h-2.5" />
                                Consumo Operador
                              </span>
                            )}
                            {isAdjustmentOutflow && (
                              <span className="bg-slate-150 border border-slate-200 bg-slate-100 text-slate-700 text-[9px] font-black px-2 py-0.5 rounded-md uppercase flex items-center gap-1 w-max">
                                <ArrowDownRight className="w-2.5 h-2.5" />
                                Ajuste Almoxar.
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 font-mono text-slate-900 text-xs font-black">
                            {isEntry ? '+' : '-'}{log.quantity.toFixed(1)} <span className="uppercase text-[9px] text-slate-400 font-bold">{itemDef?.unit || ''}</span>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="text-slate-800 text-xs font-bold">{log.usedByName || log.processedByName}</span>
                            <span className="block text-[9px] text-slate-400 font-bold">Por: {log.processedByName}</span>
                            {log.shift && (
                              <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-800 text-[8.5px] font-black px-1.5 py-0.5 rounded uppercase mt-0.5">
                                {log.shift} {log.group ? `• Escala ${log.group}` : ''}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 italic text-slate-700">
                            {isOperatorConsumption ? (
                              <span className="not-italic font-extrabold text-blue-800">{log.lineName}</span>
                            ) : (
                              <span className="text-slate-400 font-light">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 font-normal text-slate-500 max-w-sm truncate text-[11px]" title={log.notes || 'Sem comentários registrados.'}>
                            {log.notes ? (
                              <span className="font-semibold text-slate-600 block leading-tight">{log.notes}</span>
                            ) : (
                              <span className="italic text-slate-300 font-light">Sem justificativas.</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {processedAuditLogs.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center text-slate-400 font-bold uppercase tracking-wider">
                          Nenhum log correspondente aos filtros de auditoria selecionados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
};

export default ConsumablesControl;
