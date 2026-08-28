import React, { useState, useMemo, useEffect } from 'react';
import { 
  Barcode, 
  Search, 
  Loader2, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  Camera, 
  Undo,
  Trash2,
  Filter,
  Weight,
  ClipboardList,
  Check,
  AlertCircle,
  Hash,
  MapPin,
  ChevronDown,
  Trash
} from 'lucide-react';
import { updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../hooks/useAuth';
import { WireCoil, WireSupplier, WireStorageBay } from '../../types';
import { QRCameraScanner } from './QRCameraScanner';
import { isCoilMatch } from '../../lib/wireUtils';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';

interface AuditTabProps {
  coils: WireCoil[];
  suppliers: WireSupplier[];
  storageBays: WireStorageBay[];
}

interface AuditState {
  confirmedIds: string[]; // Coils scanned/marked as present in current session
  writtenOffIds: string[]; // Coils given baixa in this session
}

export const AuditTab: React.FC<AuditTabProps> = ({ coils, suppliers, storageBays }) => {
  const { profile } = useAuth();
  
  // Session audit state (persists in memory as long as user is on this tab)
  const [session, setSession] = useState<AuditState>(() => {
    const saved = localStorage.getItem('wire_audit_confirmed_ids');
    return {
      confirmedIds: saved ? JSON.parse(saved) : [],
      writtenOffIds: []
    };
  });

  // Save session confirmed IDs to localStorage for resistance against page refreshes
  useEffect(() => {
    localStorage.setItem('wire_audit_confirmed_ids', JSON.stringify(session.confirmedIds));
  }, [session.confirmedIds]);

  // Input & scan states
  const [qrInput, setQrInput] = useState('');
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [diameterFilter, setDiameterFilter] = useState('');
  const [bayFilter, setBayFilter] = useState('');
  const [subTab, setSubTab] = useState<'pending' | 'confirmed' | 'written_off'>('pending');
  
  // Autocomplete / real-time suggestion states
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const suggestionContainerRef = React.useRef<HTMLDivElement>(null);

  // Close suggestions dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (suggestionContainerRef.current && !suggestionContainerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Reset active index when search text changes
  useEffect(() => {
    setActiveIndex(-1);
  }, [qrInput]);

  // Write-off modal states
  const [writeOffModal, setWriteOffModal] = useState<{
    isOpen: boolean;
    coilIds: string[]; // support single or multiple selection
    coilsData: WireCoil[];
    motive: string;
    customNote: string;
  }>({
    isOpen: false,
    coilIds: [],
    coilsData: [],
    motive: 'Divergência de Auditoria (Falta de Estoque)',
    customNote: ''
  });

  // Bulk selection state for pending coils
  const [selectedCoilIds, setSelectedCoilIds] = useState<string[]>([]);
  
  // Action status/notifications
  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'info' | null;
    message: string;
    timeoutId?: NodeJS.Timeout;
  }>({ type: null, message: '' });

  const triggerNotification = (type: 'success' | 'error' | 'info', message: string) => {
    if (notification.timeoutId) {
      clearTimeout(notification.timeoutId);
    }
    const id = setTimeout(() => {
      setNotification({ type: null, message: '' });
    }, 4500);

    setNotification({ type, message, timeoutId: id });
  };

  // Precalculated lookups
  const supplierMap = useMemo(() => {
    return new Map(suppliers.map(s => [s.id, s.name]));
  }, [suppliers]);

  const bayMap = useMemo(() => {
    return new Map(storageBays.map(b => [b.id, b.name]));
  }, [storageBays]);

  // Split, format, and enrich our database coils
  // Target: coils that were active (received/in_use) or recently modified
  const enrichedCoils = useMemo(() => {
    return coils.map(c => {
      const isConfirmed = session.confirmedIds.includes(c.id);
      const isSessionWrittenOff = session.writtenOffIds.includes(c.id);
      
      const supplierName = supplierMap.get(c.supplierId) || 'Desconhecido';
      const bayName = c.storageBayId ? (bayMap.get(c.storageBayId) || c.storageBayName || 'Galpão') : 'Sem Baia';
      
      return {
        ...c,
        supplierName,
        bayName,
        isConfirmed,
        isSessionWrittenOff
      };
    });
  }, [coils, session, supplierMap, bayMap]);

  // Real-time suggestions when operator types part of the coil code
  const suggestions = useMemo(() => {
    const term = qrInput.trim().toLowerCase();
    if (!term) return [];
    return enrichedCoils
      .filter(c => 
        c.coilNumber.toLowerCase().includes(term) ||
        c.supplierName.toLowerCase().includes(term) ||
        (c.storageBayName && c.storageBayName.toLowerCase().includes(term))
      )
      .slice(0, 10);
  }, [qrInput, enrichedCoils]);

  // Effective unified search term (auto-filters the whole table as user types)
  const effectiveSearchTerm = useMemo(() => {
    return (qrInput.trim() || searchFilter.trim()).toLowerCase();
  }, [qrInput, searchFilter]);

  // Filter lists based on three primary sub-tabs and real-time typed search
  const filteredList = useMemo(() => {
    return enrichedCoils.filter(c => {
      // Basic core filters with real-time automatic matching
      const matchesSearch = !effectiveSearchTerm || 
        c.coilNumber.toLowerCase().includes(effectiveSearchTerm) ||
        c.supplierName.toLowerCase().includes(effectiveSearchTerm) ||
        (c.bayName && c.bayName.toLowerCase().includes(effectiveSearchTerm));
      const matchesSupplier = !supplierFilter || c.supplierId === supplierFilter;
      const matchesDiameter = !diameterFilter || String(c.diameter) === diameterFilter;
      const matchesBay = !bayFilter || c.storageBayId === bayFilter;

      if (!matchesSearch || !matchesSupplier || !matchesDiameter || !matchesBay) return false;

      // Group classification
      if (subTab === 'pending') {
        // Active coils in stock (status !== consumed) that are NOT yet verified/confirmed in session
        return c.status !== 'consumed' && !c.isConfirmed;
      } else if (subTab === 'confirmed') {
        // Active in stock and verified present
        return c.isConfirmed && c.status !== 'consumed';
      } else {
        // Written off (either priorly or during session) from audit context
        return c.status === 'consumed';
      }
    });
  }, [enrichedCoils, subTab, effectiveSearchTerm, supplierFilter, diameterFilter, bayFilter]);

  // Overall metric stats
  const stats = useMemo(() => {
    const totalActiveStock = enrichedCoils.filter(c => c.status !== 'consumed').length;
    const totalConfirmed = enrichedCoils.filter(c => c.isConfirmed && c.status !== 'consumed').length;
    const totalSessionWrites = session.writtenOffIds.length;
    
    // Remaining is total active minus found
    const totalPending = Math.max(0, totalActiveStock - totalConfirmed);

    return {
      totalActiveStock,
      totalConfirmed,
      totalPending,
      totalSessionWrites
    };
  }, [enrichedCoils, session]);

  // Available unique list properties for quick filter cards
  const uniqueDiameters = useMemo(() => {
    return Array.from(new Set(coils.map(c => c.diameter))).sort((a, b) => Number(a) - Number(b));
  }, [coils]);

  // Quick reset for the session
  const handleResetSession = () => {
    if (window.confirm("Deseja realmente iniciar uma nova auditoria? Isso limpará a lista de bobinas confirmadas localmente.")) {
      setSession({
        confirmedIds: [],
        writtenOffIds: []
      });
      setSelectedCoilIds([]);
      triggerNotification('info', "Sessão de auditoria reiniciada com sucesso.");
    }
  };

  // Keyboard handler for autocomplete suggestions
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirmCoilByCode(qrInput);
      }
      return;
    }
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < suggestions.length) {
        const selected = suggestions[activeIndex];
        handleConfirmCoilByCode(selected.coilNumber);
        setShowSuggestions(false);
      } else {
        handleConfirmCoilByCode(qrInput);
        setShowSuggestions(false);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  // Perform a barcode confirmation check
  const handleConfirmCoilByCode = (code: string) => {
    const trimmedInput = code.trim();
    if (!trimmedInput) return;

    // Find in our list of active (non-consumed) coils
    const matchedCoils = enrichedCoils.filter(c => c.status !== 'consumed');
    const matched = matchedCoils.find(c => isCoilMatch(c.coilNumber, trimmedInput));

    if (matched) {
      if (session.confirmedIds.includes(matched.id)) {
        triggerNotification('info', `Bobina #${matched.coilNumber} já presente e confirmada anteriormente!`);
      } else {
        setSession(prev => ({
          ...prev,
          confirmedIds: [...prev.confirmedIds, matched.id]
        }));
        triggerNotification('success', `Bobina encontrada! #${matched.coilNumber} (${matched.diameter}mm - ${matched.weight}kg) confirmada como presente.`);
      }
      setQrInput('');
      setShowSuggestions(false);
    } else {
      // Check if it belongs to consumed
      const isConsumed = coils.find(c => c.status === 'consumed' && isCoilMatch(c.coilNumber, trimmedInput));
      if (isConsumed) {
        triggerNotification('error', `Atenção: A bobina #${isConsumed.coilNumber} consta no sistema como CONSUMIDA.`);
      } else {
        triggerNotification('error', `Bobina "${trimmedInput}" não localizada na lista de estoque disponível.`);
      }
    }
  };

  // Mark/unmark presence manually for row item
  const handleTogglePresence = (id: string, currentStatus: boolean, label: string) => {
    setSession(prev => {
      let nextConfirmed = [...prev.confirmedIds];
      if (currentStatus) {
        nextConfirmed = nextConfirmed.filter(cid => cid !== id);
        triggerNotification('info', `Presença de #${label} desfeita.`);
      } else {
        if (!nextConfirmed.includes(id)) {
          nextConfirmed.push(id);
        }
        triggerNotification('success', `Bobina #${label} confirmada.`);
      }
      return {
        ...prev,
        confirmedIds: nextConfirmed
      };
    });
  };

  // Open write-off wizard
  const openWriteOffWizard = (idList: string[]) => {
    const selectedCoils = coils.filter(c => idList.includes(c.id));
    setWriteOffModal({
      isOpen: true,
      coilIds: idList,
      coilsData: selectedCoils,
      motive: 'Divergência de Auditoria (Falta de Estoque)',
      customNote: ''
    });
  };

  // Complete Firestore Write-Off action
  const handleExecuteWriteOff = async () => {
    const { coilIds, motive, customNote } = writeOffModal;
    if (coilIds.length === 0) return;

    try {
      const promises = coilIds.map(async (id) => {
        const coilRef = doc(db, 'wire_coils', id);
        const coilData = coils.find(c => c.id === id);
        const notesStr = `Baixa manual via Auditoria. Motivo: ${motive}. Obs: ${customNote || 'Sem notas adicionais'}`;
        
        await updateDoc(coilRef, {
          status: 'consumed',
          consumedAt: serverTimestamp(),
          consumedBy: `Auditoria [${profile?.displayName || 'Operador'}]`,
          consumedShift: 'Auditoria',
          notes: notesStr,
          isAuditWriteOff: true,
          auditReason: motive,
          updatedBy: profile?.displayName || 'Operador',
          updatedAt: serverTimestamp()
        });
      });

      await Promise.all(promises);

      // Successfully processed, update state
      setSession(prev => {
        // Also remove from confirmed if they were somehow in there
        const filteredConfirmed = prev.confirmedIds.filter(id => !coilIds.includes(id));
        return {
          ...prev,
          confirmedIds: filteredConfirmed,
          writtenOffIds: [...prev.writtenOffIds, ...coilIds]
        };
      });

      // Clear selection
      setSelectedCoilIds(prev => prev.filter(id => !coilIds.includes(id)));

      setWriteOffModal(prev => ({ ...prev, isOpen: false }));
      triggerNotification('success', `${coilIds.length} ${coilIds.length === 1 ? 'bobina baixada' : 'bobinas baixadas'} com sucesso e marcadas como fora de estoque.`);

    } catch (err) {
      console.error("Error executing audit write-off:", err);
      triggerNotification('error', "Erro operacional ao dar baixa nos registros do Firestore.");
    }
  };

  // Bulk action for checkboxes selection
  const handleMasterCheckboxToggle = () => {
    const activeCurrentCids = filteredList.map(c => c.id);
    const allSelected = activeCurrentCids.every(id => selectedCoilIds.includes(id));

    if (allSelected) {
      setSelectedCoilIds(prev => prev.filter(id => !activeCurrentCids.includes(id)));
    } else {
      setSelectedCoilIds(prev => {
        const next = [...prev];
        activeCurrentCids.forEach(id => {
          if (!next.includes(id)) {
            next.push(id);
          }
        });
        return next;
      });
    }
  };

  const handleRowCheckboxToggle = (id: string) => {
    setSelectedCoilIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-8">
      {/* Header Panel */}
      <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-950 p-6 md:p-8 rounded-[2.5rem] text-white my-2 border border-emerald-900/40 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <h2 className="text-2xl lg:text-3.5xl font-black tracking-tight flex items-center gap-2.5">
              <ClipboardList className="w-6 h-6 text-emerald-400" />
              Auditoria de Arames no Estoque
            </h2>
            <p className="text-emerald-200/90 max-w-2xl text-xs md:text-sm font-medium leading-relaxed">
              Consolidação física rápida da matéria prima. Faça a varredura das bobinas de forma móvel pela câmera, dê baixa imediata em registros faltantes ou ausentes e garanta a integridade absoluta dos seus relatórios de consumo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleResetSession}
              className="px-5 py-3 bg-white/10 hover:bg-white/15 active:scale-95 text-white border border-white/15 text-xs font-black uppercase tracking-widest rounded-2xl transition-all shadow-sm"
            >
              Reiniciar Auditoria
            </button>
            <button
              onClick={() => setIsCameraOpen(true)}
              className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 text-xs font-black uppercase tracking-widest rounded-2xl transition-all flex items-center gap-2.5 shadow-lg shadow-emerald-500/20"
            >
              <Camera className="w-4 h-4 text-slate-950 stroke-[2.5]" />
              Escanear QR Code
            </button>
          </div>
        </div>
      </div>

      {/* Real-time Status Banner */}
      <AnimatePresence>
        {notification.type && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={cn(
              "p-4 rounded-2xl border flex items-start gap-3 shadow-md max-w-4xl",
              notification.type === 'success' && "bg-emerald-50 border-emerald-200/70 text-emerald-800",
              notification.type === 'info' && "bg-blue-50 border-blue-200/70 text-blue-800",
              notification.type === 'error' && "bg-rose-50 border-rose-200/70 text-rose-800"
            )}
          >
            {notification.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />}
            {notification.type === 'info' && <CheckCircle2 className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />}
            {notification.type === 'error' && <AlertTriangle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />}
            <span className="text-xs md:text-sm font-bold leading-tight">{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* KPI Audit Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-50 border border-slate-205 p-5 rounded-2xl">
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Total no Estoque</p>
          <p className="text-2xl font-black text-slate-900 mt-2">{stats.totalActiveStock} <span className="text-xs text-slate-500 font-normal">bobinas</span></p>
        </div>

        <div className="bg-emerald-50/55 border border-emerald-100 p-5 rounded-2xl relative overflow-hidden">
          <div className="absolute top-1/2 right-2 -translate-y-1/2 w-12 h-12 rounded-full bg-emerald-100/40 flex items-center justify-center">
            <Check className="w-6 h-6 text-emerald-600" />
          </div>
          <p className="text-emerald-600/80 text-[10px] font-black uppercase tracking-widest">Confirmadas Presentes</p>
          <p className="text-2xl font-black text-emerald-700 mt-2">{stats.totalConfirmed} <span className="text-xs font-normal">coincidências</span></p>
        </div>

        <div className="bg-amber-50/55 border border-amber-100 p-5 rounded-2xl relative overflow-hidden">
          <div className="absolute top-1/2 right-2 -translate-y-1/2 w-12 h-12 rounded-full bg-amber-100/40 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-amber-500 animate-pulse" />
          </div>
          <p className="text-amber-600/80 text-[10px] font-black uppercase tracking-widest">Restantes Pendentes</p>
          <p className="text-2xl font-black text-amber-700 mt-2">{stats.totalPending} <span className="text-xs font-normal">bobinas</span></p>
        </div>

        <div className="bg-rose-50/55 border border-rose-100 p-5 rounded-2xl">
          <p className="text-rose-600/80 text-[10px] font-black uppercase tracking-widest">Baixadas nesta Sessão</p>
          <p className="text-2xl font-black text-rose-700 mt-2">{stats.totalSessionWrites} <span className="text-xs font-normal">registros</span></p>
        </div>
      </div>

      {/* Field Scanner Search Bar with Smart Autocomplete for Damaged QR Codes */}
      <div className="bg-white p-5 md:p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4 relative z-30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
            <Barcode className="w-4 h-4 text-emerald-600" />
            Verificação Rápida de Campo (Leitura de QR Code ou Digitação Parcial)
          </h4>
          <span className="text-[11px] font-bold text-slate-400">
            {qrInput.trim() ? `${suggestions.length} resultado(s) filtrado(s)` : 'Filtragem inteligente em tempo real'}
          </span>
        </div>
        
        <div ref={suggestionContainerRef} className="relative">
          <form 
            onSubmit={(e) => { 
              e.preventDefault(); 
              if (activeIndex >= 0 && activeIndex < suggestions.length) {
                handleConfirmCoilByCode(suggestions[activeIndex].coilNumber);
              } else {
                handleConfirmCoilByCode(qrInput);
              }
            }} 
            className="flex flex-col sm:flex-row items-stretch gap-3"
          >
            <div className="flex-grow relative">
              <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={qrInput}
                onChange={(e) => {
                  setQrInput(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={handleKeyDown}
                placeholder="Se o QR estiver danificado, digite parte do código... Ex: GD03 ou 125487"
                className="w-full pl-12 pr-10 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all shadow-inner"
              />
              {qrInput && (
                <button
                  type="button"
                  onClick={() => {
                    setQrInput('');
                    setShowSuggestions(false);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-full transition-all"
                  title="Limpar texto digitado"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            
            <button
              type="submit"
              className="px-6 py-3.5 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all shadow-md shadow-slate-900/10 flex items-center justify-center gap-2 shrink-0 cursor-pointer"
            >
              <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
              Confirmar Presença
            </button>
          </form>

          {/* Real-time Suggestions Dropdown when typing damaged QR / partial code */}
          <AnimatePresence>
            {showSuggestions && qrInput.trim().length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden z-50 max-h-96 flex flex-col"
              >
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[11px] font-black text-slate-500 uppercase tracking-wider">
                  <span>Bobinas encontradas com "{qrInput}" ({suggestions.length})</span>
                  <span className="text-[10px] text-slate-400 font-medium lowercase">Use ↑ ↓ e Enter ou clique</span>
                </div>

                <div className="overflow-y-auto divide-y divide-slate-100 p-1">
                  {suggestions.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 space-y-1">
                      <Barcode className="w-8 h-8 mx-auto text-slate-300 stroke-[1.5]" />
                      <p className="text-xs font-bold text-slate-600">Nenhuma bobina corresponde a "{qrInput}"</p>
                      <p className="text-[11px] text-slate-400">Verifique os dígitos da etiqueta ou tente pesquisar pelo fornecedor.</p>
                    </div>
                  ) : (
                    suggestions.map((coil, idx) => {
                      const isSelected = activeIndex === idx;
                      return (
                        <div
                          key={coil.id}
                          onClick={() => {
                            handleConfirmCoilByCode(coil.coilNumber);
                          }}
                          className={cn(
                            "p-3 rounded-xl transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer group",
                            isSelected ? "bg-emerald-50/80 border border-emerald-200" : "hover:bg-slate-50 border border-transparent"
                          )}
                        >
                          <div className="flex items-start sm:items-center gap-3">
                            <div className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-black",
                              coil.isConfirmed ? "bg-emerald-100 text-emerald-700" : coil.status === 'consumed' ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"
                            )}>
                              {coil.isConfirmed ? "✓" : coil.status === 'consumed' ? "✕" : (idx + 1)}
                            </div>

                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-black text-slate-900 group-hover:text-emerald-700 text-sm">
                                  #{coil.coilNumber}
                                </span>
                                {coil.isConfirmed ? (
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-black uppercase">
                                    Já Confirmada
                                  </span>
                                ) : coil.status === 'consumed' ? (
                                  <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[9px] font-black uppercase">
                                    Baixada
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[9px] font-black uppercase">
                                    Pendente
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 font-bold">
                                <span>{coil.supplierName}</span>
                                <span>•</span>
                                <span>Bitola: {coil.diameter.toFixed(2)} mm</span>
                                <span>•</span>
                                <span className="font-mono">{coil.weight} kg</span>
                                <span>•</span>
                                <span className="flex items-center gap-1 text-slate-600">
                                  <MapPin className="w-3 h-3 text-slate-400" />
                                  {coil.bayName}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                            {coil.status !== 'consumed' && !coil.isConfirmed && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTogglePresence(coil.id, false, coil.coilNumber);
                                  setQrInput('');
                                  setShowSuggestions(false);
                                }}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-[10px] uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center gap-1 cursor-pointer"
                              >
                                <Check className="w-3 h-3 stroke-[2.5]" />
                                Presente
                              </button>
                            )}

                            {coil.isConfirmed && (
                              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg">
                                Confirmada no Local
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="p-2.5 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-400 flex items-center justify-between font-medium">
                  <span>Dica: Clique na bobina para validar ou pressione Enter</span>
                  <button
                    type="button"
                    onClick={() => setShowSuggestions(false)}
                    className="text-slate-500 hover:text-slate-800 font-bold"
                  >
                    Fechar
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Live Filter Indicator when typing */}
        {qrInput.trim() && (
          <div className="flex items-center justify-between bg-emerald-50/70 border border-emerald-200/60 rounded-xl px-3.5 py-2 text-xs text-emerald-900">
            <span className="font-bold flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-emerald-600" />
              Filtrando bobinas automaticamente por <span className="font-mono font-black bg-white px-1.5 py-0.5 rounded border border-emerald-200 text-emerald-950">"{qrInput.trim()}"</span> ({filteredList.length} bobinas na aba atual)
            </span>
            <button
              onClick={() => {
                setQrInput('');
                setShowSuggestions(false);
              }}
              className="text-[10px] font-black uppercase tracking-wider text-emerald-700 hover:text-emerald-950 underline cursor-pointer"
            >
              Limpar Filtro
            </button>
          </div>
        )}
      </div>

      {/* Control Workspace: Multi-Lists / Filter Toolbar */}
      <div className="space-y-6">
        
        {/* Sub-tab Selectors */}
        <div className="flex items-center border-b border-slate-200">
          <button
            onClick={() => { setSubTab('pending'); setSelectedCoilIds([]); }}
            className={cn(
              "px-5 py-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all relative flex items-center gap-2",
              subTab === 'pending' 
                ? "border-amber-500 text-amber-700" 
                : "border-transparent text-slate-400 hover:text-slate-600"
            )}
          >
            📋 Pendentes a Localizar 
            <span className={cn(
              "text-[9px] px-2 py-0.5 rounded-full font-sans font-black",
              subTab === 'pending' ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
            )}>
              {enrichedCoils.filter(c => c.status !== 'consumed' && !c.isConfirmed).length}
            </span>
          </button>

          <button
            onClick={() => { setSubTab('confirmed'); setSelectedCoilIds([]); }}
            className={cn(
              "px-5 py-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all relative flex items-center gap-2",
              subTab === 'confirmed' 
                ? "border-emerald-500 text-emerald-700" 
                : "border-transparent text-slate-400 hover:text-slate-600"
            )}
          >
            ✅ Presente no Estoque
            <span className={cn(
              "text-[9px] px-2 py-0.5 rounded-full font-sans font-black",
              subTab === 'confirmed' ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
            )}>
              {session.confirmedIds.length}
            </span>
          </button>

          <button
            onClick={() => { setSubTab('written_off'); setSelectedCoilIds([]); }}
            className={cn(
              "px-5 py-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all relative flex items-center gap-2",
              subTab === 'written_off' 
                ? "border-rose-500 text-rose-700" 
                : "border-transparent text-slate-400 hover:text-slate-600"
            )}
          >
            ❌ Baixadas / Fora do Estoque
            <span className={cn(
              "text-[9px] px-2 py-0.5 rounded-full font-sans font-black",
              subTab === 'written_off' ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-500"
            )}>
              {enrichedCoils.filter(c => c.status === 'consumed').length}
            </span>
          </button>
        </div>

        {/* Dynamic Filters Bar */}
        <div className="bg-slate-50 border border-slate-205 p-4 rounded-2xl grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="relative md:col-span-1.5Col">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filtro rápido número..."
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 focus:outline-none"
            >
              <option value="">Fornecedor (Todos)</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={diameterFilter}
              onChange={(e) => setDiameterFilter(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 focus:outline-none"
            >
              <option value="">Bitola (Todas mm)</option>
              {uniqueDiameters.map(dia => (
                <option key={dia} value={String(dia)}>{dia} mm</option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={bayFilter}
              onChange={(e) => setBayFilter(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 focus:outline-none"
            >
              <option value="">Baia / Endereço (Todos)</option>
              {storageBays.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-end">
            {(searchFilter || supplierFilter || diameterFilter || bayFilter) && (
              <button
                onClick={() => { setSearchFilter(''); setSupplierFilter(''); setDiameterFilter(''); setBayFilter(''); }}
                className="text-[10px] font-black text-rose-500 hover:bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-100 transition-all uppercase tracking-widest"
              >
                Limpar Filtros
              </button>
            )}
          </div>
        </div>

        {/* Selected / Bulk Actions Panel */}
        {subTab === 'pending' && selectedCoilIds.length > 0 && (
          <div className="bg-amber-50 p-4 border border-amber-200 rounded-2xl flex flex-col md:flex-row md:items-center md:items-stretch justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-amber-100 rounded-xl p-2 font-black text-xs text-amber-700 font-mono">
                {selectedCoilIds.length}
              </div>
              <div>
                <p className="text-xs font-bold text-amber-900 leading-none">Bobinas selecionadas para tratamento</p>
                <p className="text-[10px] text-amber-700 font-bold mt-1">Estes itens não foram encontrados no estoque físico nesta auditoria.</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedCoilIds([])}
                className="px-4 py-2 text-xs font-bold text-amber-700 hover:bg-amber-100/50 rounded-xl transition-all"
              >
                Cancelar Seleção
              </button>
              <button
                onClick={() => openWriteOffWizard(selectedCoilIds)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all flex items-center gap-2"
              >
                <Trash className="w-3.5 h-3.5" />
                Dar Baixa em Lote ({selectedCoilIds.length})
              </button>
            </div>
          </div>
        )}

        {/* Coils Data Work Grid */}
        <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/70">
                  {subTab === 'pending' && (
                    <th className="py-4 pl-6 w-12">
                      <input
                        type="checkbox"
                        checked={filteredList.length > 0 && filteredList.every(c => selectedCoilIds.includes(c.id))}
                        onChange={handleMasterCheckboxToggle}
                        className="w-4.5 h-4.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                    </th>
                  )}
                  <th className="py-4 px-6">Código da Bobina</th>
                  <th className="py-4 px-6">Fornecedor</th>
                  <th className="py-4 px-6 text-center">Bitola (mm)</th>
                  <th className="py-4 px-6 text-center">Peso Original (kg)</th>
                  <th className="py-4 px-6">Endereço / Baia</th>
                  <th className="py-4 px-6">Status / Data</th>
                  <th className="py-4 px-6 text-right">Ações de Auditoria</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredList.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center">
                      <div className="max-w-xs mx-auto space-y-3">
                        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mx-auto">
                          <Barcode className="w-6 h-6" />
                        </div>
                        <p className="text-xs font-black text-slate-800 uppercase tracking-widest">Nenhuma bobina listada</p>
                        <p className="text-xs text-slate-400 font-bold leading-normal">
                          {subTab === 'pending' 
                            ? "Não há nenhuma bobina pendente de verificação nos filtros selecionados."
                            : subTab === 'confirmed'
                            ? "Você ainda não localizou nenhuma bobina nesta sessão."
                            : "Nenhuma baixa recente cadastrada no sistema."
                          }
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredList.map(coil => (
                    <tr key={coil.id} className={cn(
                      "hover:bg-slate-50/50 transition-all text-xs",
                      selectedCoilIds.includes(coil.id) && "bg-amber-50/30 hover:bg-amber-50/45"
                    )}>
                      {subTab === 'pending' && (
                        <td className="py-4 pl-6">
                          <input
                            type="checkbox"
                            checked={selectedCoilIds.includes(coil.id)}
                            onChange={() => handleRowCheckboxToggle(coil.id)}
                            className="w-4.5 h-4.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-slate-900 group-hover:text-emerald-600 transition-colors">
                            {coil.coilNumber}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-6 font-bold text-slate-700">
                        {coil.supplierName}
                      </td>
                      <td className="py-4 px-6 text-center font-black text-slate-900">
                        {coil.diameter.toFixed(2)} mm
                      </td>
                      <td className="py-4 px-6 text-center font-black text-slate-900 font-mono">
                        {coil.weight} kg
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-1.5 font-bold text-slate-500">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          {coil.bayName}
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        {coil.status === 'consumed' ? (
                          <div className="space-y-1">
                            <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[9px] font-black uppercase tracking-wider">
                              Baixado / Fora
                            </span>
                            {coil.notes && (
                              <p className="text-[10px] text-rose-600/80 max-w-[200px] truncate-2-lines font-bold font-sans">
                                {coil.notes}
                              </p>
                            )}
                          </div>
                        ) : coil.isConfirmed ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-black uppercase tracking-wider">
                            Confirmado no Local
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[9px] font-black uppercase tracking-wider">
                            Aguardando Busca
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {subTab === 'pending' && (
                            <>
                              <button
                                onClick={() => handleTogglePresence(coil.id, coil.isConfirmed, coil.coilNumber)}
                                className="px-3 py-1.5 bg-emerald-100/60 hover:bg-emerald-600 hover:text-white text-emerald-700 font-black tracking-widest text-[10px] uppercase rounded-xl transition-all flex items-center gap-1 shadow-sm shadow-emerald-100/10 cursor-pointer"
                                title="Presença Confirmada"
                              >
                                <Check className="w-3 h-3 stroke-[2.5]" />
                                Presente
                              </button>
                              
                              <button
                                onClick={() => openWriteOffWizard([coil.id])}
                                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-600 hover:text-white text-rose-600 font-black tracking-widest text-[10px] uppercase rounded-xl border border-rose-100/60 transition-all flex items-center gap-1 cursor-pointer"
                                title="Dar Baixa por ausência ou extravio"
                              >
                                Dar Baixa
                              </button>
                            </>
                          )}

                          {subTab === 'confirmed' && (
                            <button
                              onClick={() => handleTogglePresence(coil.id, coil.isConfirmed, coil.coilNumber)}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black tracking-widest text-[10px] uppercase rounded-xl transition-all flex items-center gap-1 cursor-pointer"
                              title="Retornar à Pendentes"
                            >
                              <Undo className="w-3 h-3" />
                              Desfazer
                            </button>
                          )}

                          {subTab === 'written_off' && (
                            <span className="text-[10px] text-slate-400 font-black font-sans uppercase">
                              Concluído
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Camera Live Scan Wrapper */}
      {isCameraOpen && (
        <QRCameraScanner
          onClose={() => setIsCameraOpen(false)}
          onScan={(code) => {
            handleConfirmCoilByCode(code);
            setIsCameraOpen(false);
          }}
        />
      )}

      {/* High Polish - Write-off Modal / Confirmation Layer */}
      {writeOffModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[90]">
          <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden w-full max-w-xl shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-slate-950 p-6 text-white border-b border-emerald-950 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black tracking-tight">Efetuar Baixa no Estoque</h3>
                <p className="text-xs text-slate-400 mt-1">Lançamento em massa / individual de auditoria</p>
              </div>
              <button
                onClick={() => setWriteOffModal(prev => ({ ...prev, isOpen: false }))}
                className="p-1 text-slate-400 hover:text-white transition-all rounded-full"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-5">
              <div>
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Bobinas Afetadas ({writeOffModal.coilIds.length})</p>
                <div className="max-h-24 overflow-y-auto mt-2 p-3 bg-slate-50 border border-slate-200/60 rounded-xl space-y-1.5">
                  {writeOffModal.coilsData.map(c => {
                    const sup = supplierMap.get(c.supplierId) || 'Indefinido';
                    return (
                      <div key={c.id} className="flex justify-between text-[11px] font-bold text-slate-700">
                        <span className="font-mono text-slate-900">#{c.coilNumber}</span>
                        <span>{sup} - {c.diameter.toFixed(2)}mm - {c.weight}kg</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Motivo da Baixa</label>
                <select
                  value={writeOffModal.motive}
                  onChange={(e) => setWriteOffModal(prev => ({ ...prev, motive: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="Divergência de Auditoria (Falta de Estoque)">Divergência de Auditoria (Falta de Estoque)</option>
                  <option value="Descarte Físico / Bobina Danificada">Descarte Físico / Bobina Danificada</option>
                  <option value="Consumido sem Registro no Sistema">Consumido sem Registro no Sistema</option>
                  <option value="Ajuste de Estoque">Ajuste de Estoque</option>
                  <option value="Outro Motivo">Outro Motivo (especificar abaixo)</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Observação Técnica</label>
                <textarea
                  value={writeOffModal.customNote}
                  onChange={(e) => setWriteOffModal(prev => ({ ...prev, customNote: e.target.value }))}
                  placeholder="Escreva observações adicionais sobre o descarte/ajuste desta bobina..."
                  rows={3}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="border-t border-slate-100 flex items-center justify-end gap-3 pt-4">
                <button
                  onClick={() => setWriteOffModal(prev => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-all"
                >
                  cancelar
                </button>
                <button
                  onClick={handleExecuteWriteOff}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md shadow-rose-600/10 flex items-center gap-1.5"
                >
                  Confirmar Baixa
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
