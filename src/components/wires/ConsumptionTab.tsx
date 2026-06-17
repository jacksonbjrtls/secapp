import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  updateDoc, 
  doc, 
  serverTimestamp,
  orderBy,
  limit,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../hooks/useAuth';
import { ProductionLine, WireCoil } from '../../types';
import { 
  Barcode, 
  Factory, 
  Search, 
  Loader2, 
  CheckCircle2, 
  AlertTriangle, 
  Trash2,
  X,
  History,
  Camera,
  Edit2,
  ChevronRight,
  Clock,
  Save,
  Users,
  Filter,
  Weight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { parseWireQRCode, isCoilMatch } from '../../lib/wireUtils';
import { QRCameraScanner } from './QRCameraScanner';
import { getCurrentShift, getGroupForShift, Shift } from '../../lib/scaleUtils';
import { ConfirmationModal } from '../ui/ConfirmationModal';

interface ConsumptionTabProps {
  lines: ProductionLine[];
}

export const ConsumptionTab: React.FC<ConsumptionTabProps> = ({ lines }) => {
  const { profile, isAdmin, isMaster } = useAuth();
  const [qrInput, setQrInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [foundCoil, setFoundCoil] = useState<WireCoil | null>(null);
  const [selectedLine, setSelectedLine] = useState('');
  const [selectedShift, setSelectedShift] = useState<'1' | '2' | '3' | ''>('');
  const [selectedEquipment, setSelectedEquipment] = useState('');

  const getShiftByTime = () => {
    const hour = new Date().getHours();
    if (hour >= 0 && hour < 8) return '1';
    if (hour >= 8 && hour < 16) return '2';
    return '3';
  };

  useEffect(() => {
    // Auto-set shift based on current time
    setSelectedShift(getShiftByTime());
  }, [foundCoil]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  // Available coils in stock for real-time manual search autocomplete suggestions
  const [availableCoils, setAvailableCoils] = useState<WireCoil[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionContainerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (suggestionContainerRef.current && !suggestionContainerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    // Listen for unconsumed in-stock coils
    const q = query(
      collection(db, 'wire_coils'),
      where('status', '==', 'received')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const coils = snap.docs.map(d => ({ id: d.id, ...d.data() } as WireCoil));
      setAvailableCoils(coils);
    }, (err) => {
      console.error("Error listening to available coils:", err);
    });

    return () => unsubscribe();
  }, []);

  const suggestions = useMemo(() => {
    const term = qrInput.trim().toLowerCase();
    if (!term) return [];
    return availableCoils.filter(coil => 
      coil.coilNumber.toLowerCase().includes(term)
    ).slice(0, 8); // Display up to 8 matching recommendations
  }, [qrInput, availableCoils]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [qrInput]);

  const selectCoil = (coilNum: string) => {
    searchCoil(coilNum);
    setQrInput('');
    setShowSuggestions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length === 0) return;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && activeIndex < suggestions.length) {
        e.preventDefault();
        const selected = suggestions[activeIndex];
        selectCoil(selected.coilNumber);
      }
    } else if (e.key === 'Escape') {
      setActiveIndex(-1);
      setShowSuggestions(false);
    }
  };
  
  // History State
  const [recentConsumptions, setRecentConsumptions] = useState<WireCoil[]>([]);
  const [editingCoil, setEditingCoil] = useState<WireCoil | null>(null);
  const [newSelectedLine, setNewSelectedLine] = useState('');
  const [newSelectedShift, setNewSelectedShift] = useState<'1' | '2' | '3' | ''>('');
  const [newSelectedEquipment, setNewSelectedEquipment] = useState('');
  const [newSelectedGroup, setNewSelectedGroup] = useState<string>('');
  const [showGroupWarning, setShowGroupWarning] = useState(false);
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
    onConfirm?: () => void;
    showConfirmButton?: boolean;
    confirmText?: string;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'success'
  });

  const closeModal = () => setModalConfig(prev => ({ ...prev, isOpen: false }));

  useEffect(() => {
    // Listen for recent consumptions
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const q = query(
      collection(db, 'wire_coils'),
      where('status', '==', 'consumed'),
      where('consumedAt', '>=', today),
      orderBy('consumedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const coils = snap.docs.map(d => ({ id: d.id, ...d.data() } as WireCoil));
      setRecentConsumptions(coils);
    }, (err) => {
      console.error("Error listening to consumptions:", err);
    });

    return () => unsubscribe();
  }, []);

  const dailySummary = useMemo(() => {
    const groups: { [key: string]: { date: Date, items: WireCoil[], totalWeight: number, byDiameter: { [dia: number]: number } } } = {};
    
    recentConsumptions.forEach(coil => {
      const timestamp = coil.consumedAt?.seconds ? coil.consumedAt.seconds * 1000 : coil.consumedAt;
      if (!timestamp) return;
      const date = new Date(timestamp);
      const dateKey = date.toISOString().split('T')[0];
      
      if (!groups[dateKey]) {
        groups[dateKey] = {
          date,
          items: [],
          totalWeight: 0,
          byDiameter: {}
        };
      }
      groups[dateKey].items.push(coil);
      groups[dateKey].totalWeight += coil.weight || 0;
      groups[dateKey].byDiameter[coil.diameter] = (groups[dateKey].byDiameter[coil.diameter] || 0) + (coil.weight || 0);
    });

    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [recentConsumptions]);

  const equipmentOptions = useMemo(() => {
    if (!foundCoil || !selectedLine) return [];
    
    // 2.18mm e 2.30mm -> Amarradeira 1 e 2
    if (foundCoil.diameter < 3.0) {
      return ['Amarradeira 1', 'Amarradeira 2'];
    }
    
    // 3.00mm -> Unitizadora e Big Balé (apenas Linhas A e B)
    if (foundCoil.diameter === 3.0) {
      const lineName = lines.find(l => l.id === selectedLine)?.name || '';
      const isLineAOrB = lineName.toLowerCase().includes('linha a') || lineName.toLowerCase().includes('linha b');
      
      const options = ['Unitizadora'];
      if (isLineAOrB) options.push('Big Balé');
      return options;
    }
    
    return [];
  }, [foundCoil, selectedLine, lines]);

  const searchCoil = async (term: string) => {
    setLoading(true);
    setError('');
    setSuccess('');
    setFoundCoil(null);

    const parsed = parseWireQRCode(term);
    const searchTerm = parsed ? parsed.coilNumber : term;

    // 1. Primariamente, busca local no estado em tempo real de bobinas em estoque (received)
    const localMatch = availableCoils.find(coil => isCoilMatch(coil.coilNumber, term));
    if (localMatch) {
      setFoundCoil(localMatch);
      setSuccess('Bobina localizada em estoque!');
      setLoading(false);
      return;
    }

    try {
      let matchedDoc: WireCoil | null = null;

      // 2. Busca pelas 400 bobinas mais recentes no Firestore para rodar match local flexível
      // Esta busca é 100% segura contra erros de índice no Firestore (usa apenas ordenação simples)
      try {
        const qRecent = query(
          collection(db, 'wire_coils'),
          orderBy('receivedAt', 'desc'),
          limit(400)
        );
        const snapRecent = await getDocs(qRecent);
        const foundRecent = snapRecent.docs
          .map(d => ({ id: d.id, ...d.data() } as WireCoil))
          .find(c => isCoilMatch(c.coilNumber, term));
        if (foundRecent) {
          matchedDoc = foundRecent;
        }
      } catch (errRecent) {
        console.warn("Index warning querying recent by date, trying safe standard query...", errRecent);
        // Fallback para uma busca simples sem limites de ordenação caso o banco esteja limpo ou sem campo recebimento
        const qAll = query(collection(db, 'wire_coils'), limit(150));
        const snapAll = await getDocs(qAll);
        const foundAll = snapAll.docs
          .map(d => ({ id: d.id, ...d.data() } as WireCoil))
          .find(c => isCoilMatch(c.coilNumber, term));
        if (foundAll) {
          matchedDoc = foundAll;
        }
      }

      // 3. Fallback: Busca direta de termos exatos no Firestore para cobrir itens históricos que excederam os limites flexíveis
      if (!matchedDoc) {
        const queryTerms = Array.from(new Set([
          term.trim(),
          searchTerm.trim(),
          term.trim().replace(/\s+/g, ' ')
        ]));

        for (const qTerm of queryTerms) {
          if (!qTerm) continue;
          const q = query(
            collection(db, 'wire_coils'), 
            where('coilNumber', '==', qTerm)
          );
          const snap = await getDocs(q);
          if (!snap.empty) {
            matchedDoc = { id: snap.docs[0].id, ...snap.docs[0].data() } as WireCoil;
            break;
          }
        }
      }

      // 4. Fallback: Busca direta pela primeira parte estruturada (sem espaços adjacentes)
      if (!matchedDoc) {
        const parts = term.trim().split(/\s+/);
        if (parts.length > 1) {
          const firstPart = parts[0];
          const q = query(
            collection(db, 'wire_coils'),
            where('coilNumber', '==', firstPart)
          );
          const snap = await getDocs(q);
          if (!snap.empty) {
            matchedDoc = { id: snap.docs[0].id, ...snap.docs[0].data() } as WireCoil;
          }
        }
      }

      // 5. Fallback para bobinas já consumidas historicamente (caso não estejam entre as 400 mais recentes)
      if (!matchedDoc) {
        try {
          const qConsumed = query(
            collection(db, 'wire_coils'),
            orderBy('consumedAt', 'desc'),
            limit(150)
          );
          const consumedSnap = await getDocs(qConsumed);
          const foundConsumed = consumedSnap.docs
            .map(d => ({ id: d.id, ...d.data() } as WireCoil))
            .find(c => isCoilMatch(c.coilNumber, term));
          if (foundConsumed) {
            matchedDoc = foundConsumed;
          }
        } catch (consumedErr) {
          console.warn("Index warning or empty database query on consumed coils:", consumedErr);
        }
      }

      if (!matchedDoc) {
        setError('Bobina não encontrada no sistema. Verifique o recebimento.');
      } else {
        if (matchedDoc.status === 'consumed') {
          const consumedDate = matchedDoc.consumedAt?.seconds 
            ? new Date(matchedDoc.consumedAt.seconds * 1000).toLocaleString()
            : 'data desconhecida';
          
          if (matchedDoc.isAuditWriteOff) {
            setError(`Esta bobina recebeu BAIXA VIA AUDITORIA em ${consumedDate} (Motivo: ${matchedDoc.auditReason || 'Divergência de Auditoria'}). Não está disponível para consumo.`);
          } else {
            setError(`Esta bobina já foi consumida em ${consumedDate}.`);
          }
        } else {
          setFoundCoil(matchedDoc);
          setSuccess('Bobina localizada!');
        }
      }
    } catch (err) {
      console.error(err);
      setError('Erro ao buscar bobina.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qrInput) return;
    await searchCoil(qrInput);
    setQrInput('');
  };

  const handleConsume = async (bypassWarning = false) => {
    if (!foundCoil || !selectedLine || !selectedShift || !selectedEquipment) return;

    // Validate Group
    const expectedShiftName = `Turno ${selectedShift}` as Shift;
    const expectedGroup = getGroupForShift(new Date(), expectedShiftName);
    
    if (profile?.group && profile.group !== expectedGroup && !showGroupWarning && !bypassWarning) {
      setShowGroupWarning(true);
      return;
    }

    setLoading(true);
    try {
      if (foundCoil.status === 'consumed') {
        setError('Esta bobina consta como consumida ou baixada via Auditoria e não pode ser consumida.');
        setFoundCoil(null);
        setLoading(false);
        return;
      }

      await updateDoc(doc(db, 'wire_coils', foundCoil.id), {
        status: 'consumed',
        currentLineId: selectedLine,
        consumedShift: selectedShift,
        consumedIn: selectedEquipment,
        consumedAt: serverTimestamp(),
        consumedBy: profile?.displayName || profile?.email || 'Sistema',
        consumedByGroup: profile?.group || '-'
      });

      setSuccess(`Bobina ${foundCoil.coilNumber} registrada com sucesso na ${selectedEquipment} (${lines.find(l => l.id === selectedLine)?.name}).`);
      setFoundCoil(null);
      setSelectedLine('');
      setSelectedShift('');
      setSelectedEquipment('');
      setShowGroupWarning(false);
    } catch (err) {
      console.error(err);
      setError('Erro ao registrar consumo.');
    } finally {
      setLoading(false);
    }
  };

  const isEditable = (coil: WireCoil) => {
    if (isAdmin || isMaster) return true;
    
    if (!coil.consumedAt) return false;
    
    const consumedDate = new Date(coil.consumedAt.seconds * 1000);
    const today = new Date();
    
    return consumedDate.getDate() === today.getDate() &&
           consumedDate.getMonth() === today.getMonth() &&
           consumedDate.getFullYear() === today.getFullYear();
  };

  const handleEditCorrection = async () => {
    if (!editingCoil || !newSelectedLine || !newSelectedShift || !newSelectedEquipment) return;

    setLoading(true);
    try {
      await updateDoc(doc(db, 'wire_coils', editingCoil.id), {
        currentLineId: newSelectedLine,
        consumedShift: newSelectedShift,
        consumedIn: newSelectedEquipment,
        consumedByGroup: newSelectedGroup || '-',
        updatedAt: serverTimestamp(),
        updatedBy: profile?.displayName || profile?.email || 'Sistema'
      });
      setEditingCoil(null);
      setNewSelectedLine('');
      setNewSelectedShift('');
      setNewSelectedEquipment('');
      setNewSelectedGroup('');
      setModalConfig({
        isOpen: true,
        title: 'Sucesso!',
        message: 'Consumo atualizado com sucesso!',
        type: 'success'
      });
    } catch (err) {
      console.error(err);
      setModalConfig({
        isOpen: true,
        title: 'Erro',
        message: 'Erro ao atualizar registro.',
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-10">
      <ConfirmationModal
        isOpen={modalConfig.isOpen}
        onClose={closeModal}
        title={modalConfig.title}
        message={modalConfig.message}
        type={modalConfig.type}
        showConfirmButton={modalConfig.showConfirmButton}
        onConfirm={modalConfig.onConfirm}
        confirmText={modalConfig.confirmText}
      />

      {isCameraOpen && (
        <QRCameraScanner 
          onScan={searchCoil} 
          onClose={() => setIsCameraOpen(false)} 
        />
      )}

      {/* Main Action Area - Two columns on large screens */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 lg:gap-10">
        
        {/* Left column: Scanner and Search (The Focus) */}
        <div className="xl:col-span-12">
          <div className="bg-white p-8 md:p-12 rounded-3xl border border-slate-200 shadow-sm relative transition-all hover:shadow-md">
            {/* Background pattern container to safely mask the rotate barcode icon without blocking overflow-visible for autocomplete */}
            <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none z-0">
              <div className="absolute top-0 right-0 p-10 opacity-[0.03] rotate-12 scale-150">
                <Barcode className="w-64 h-64" />
              </div>
            </div>

            <div className="relative z-10 max-w-4xl mx-auto">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                <div>
                  <h2 className="text-3xl font-black text-slate-900 flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shadow-inner ring-1 ring-emerald-100">
                      <Barcode className="w-7 h-7" />
                    </div>
                    Registrar Consumo
                  </h2>
                  <p className="text-slate-500 font-medium lg:text-lg mt-2">Bipe a etiqueta da bobina posicionada para iniciar a produção.</p>
                </div>
                <button
                   onClick={() => setIsCameraOpen(true)}
                   className="w-full md:w-auto flex items-center justify-center gap-3 px-8 py-5 bg-emerald-600 text-white rounded-2xl text-lg font-black hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100 active:scale-95"
                >
                  <Camera className="w-7 h-7" />
                  Abrir Scanner
                </button>
              </div>

              <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4 relative group">
                <div ref={suggestionContainerRef} className="flex-1 relative">
                  <div className="absolute left-4 md:left-6 top-1/2 -translate-y-1/2 opacity-30 group-focus-within:text-emerald-600 group-focus-within:opacity-100 transition-all z-10">
                    <Search className="w-5 h-5 md:w-8 h-8" />
                  </div>
                  <input
                    autoFocus
                    type="text"
                    value={qrInput}
                    onChange={(e) => {
                      setQrInput(e.target.value);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    onKeyDown={handleKeyDown}
                    placeholder="ID da Bobina..."
                    className="w-full pl-12 md:pl-16 pr-6 md:pr-8 py-4 md:py-7 bg-slate-50 border-2 border-transparent focus:border-emerald-500 focus:bg-white rounded-2xl md:rounded-[2rem] text-lg sm:text-2xl md:text-3xl font-black font-mono outline-none transition-all shadow-inner text-slate-900"
                  />
                  
                  {/* Suggestions Dropdown for matching unconsumed coils */}
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-emerald-500 shadow-[0_15px_40px_-10px_rgba(0,0,0,0.2)] rounded-2xl md:rounded-3xl z-50 overflow-hidden py-0 max-h-64 md:max-h-80 overflow-y-auto divide-y divide-slate-100 animate-fade-in ring-4 ring-emerald-50">
                      <div className="sticky top-0 bg-slate-50 px-4 md:px-6 py-2.5 md:py-3 border-b border-slate-100 text-[10px] md:text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center justify-between z-10">
                        <span className="flex items-center gap-1.5 text-emerald-800">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          Bobinas Em Estoque Disponíveis
                        </span>
                        <span>{suggestions.length} encontrada{suggestions.length > 1 ? 's' : ''}</span>
                      </div>
                      
                      {suggestions.map((coil, idx) => {
                        const isSelected = idx === activeIndex;
                        return (
                          <button
                            key={coil.id}
                            type="button"
                            onClick={() => selectCoil(coil.coilNumber)}
                            onMouseEnter={() => setActiveIndex(idx)}
                            className={cn(
                              "w-full text-left px-4 md:px-6 py-3.5 md:py-5 transition-all flex items-center justify-between gap-3 cursor-pointer",
                              isSelected 
                                ? "bg-emerald-50/90 text-slate-900 border-l-4 border-emerald-600 pl-3 md:pl-5" 
                                : "hover:bg-slate-50 text-slate-700"
                            )}
                          >
                            <div className="flex items-center gap-3 md:gap-4 min-w-0">
                              <div className={cn(
                                "w-8 h-8 md:w-11 md:h-11 rounded-lg md:rounded-xl flex items-center justify-center shrink-0 transition-colors",
                                isSelected 
                                  ? "bg-emerald-600 text-white" 
                                  : "bg-slate-100 text-slate-500"
                              )}>
                                <Barcode className="w-4 h-4 md:w-6 h-6" />
                              </div>
                              <div className="min-w-0">
                                <span className={cn(
                                  "font-mono text-base sm:text-xl md:text-2xl font-black block truncate leading-none",
                                  isSelected ? "text-emerald-950" : "text-slate-900"
                                )}>
                                  {coil.coilNumber}
                                </span>
                                <span className="text-[10px] sm:text-xs text-slate-500 font-semibold block mt-1 md:mt-1.5">
                                  Bitola: <span className="text-slate-700 font-extrabold">{coil.diameter?.toFixed(2)}mm</span> • Peso: <span className="text-slate-700 font-extrabold">{coil.weight?.toLocaleString()} kg</span>
                                </span>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2 md:gap-3 shrink-0">
                              {coil.storageBayName && (
                                <span className="text-[8px] sm:text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 md:px-3 py-1 md:py-1.5 rounded-full uppercase tracking-wider">
                                  {coil.storageBayName}
                                </span>
                              )}
                              {isSelected ? (
                                <span className="hidden sm:inline-block text-[10px] font-black text-emerald-600 bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-200 uppercase tracking-widest animate-pulse">
                                  Aperte Enter
                                </span>
                              ) : (
                                <ChevronRight className="w-4 h-4 md:w-5 h-5 text-slate-300" />
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 md:px-10 py-4 sm:py-0 bg-slate-900 text-white rounded-2xl md:rounded-[2rem] font-black text-sm sm:text-lg md:text-xl shadow-xl hover:shadow-2xl transition-all disabled:opacity-50 active:scale-95 flex items-center justify-center gap-2 md:gap-3 shrink-0"
                >
                  {loading ? <Loader2 className="w-5 h-5 md:w-7 h-7 animate-spin" /> : (
                    <>
                      Confirmar
                      <ChevronRight className="w-4 h-4 md:w-6 h-6" />
                    </>
                  )}
                </button>
              </form>

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mt-6 p-6 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-4 text-rose-600 font-bold shadow-sm"
                  >
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shrink-0 shadow-sm">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                    {error}
                  </motion.div>
                )}
                {success && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mt-6 p-6 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-4 text-emerald-600 font-bold shadow-sm"
                  >
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shrink-0 shadow-sm">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    {success}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Found Coil Result and Config - Centered Grid */}
        <div className="xl:col-span-12">
          <AnimatePresence>
            {foundCoil && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-[3rem] border-2 border-emerald-500 shadow-2xl shadow-emerald-100/50 overflow-hidden"
              >
                <div className="grid grid-cols-1 lg:grid-cols-2">
                  {/* Left part: Coil Details */}
                  <div className="p-8 md:p-12 bg-slate-50/50 border-r border-slate-100">
                    <div className="flex items-center gap-6 mb-10">
                      <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center ring-4 ring-white shadow-lg">
                        <Barcode className="w-10 h-10" />
                      </div>
                      <div>
                        <span className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.3em] bg-emerald-100 px-3 py-1 rounded-full">Bobina Validada</span>
                        <h3 className="text-4xl font-black text-slate-900 tracking-tight mt-2">{foundCoil.coilNumber}</h3>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-6">
                        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                            <Filter className="w-3 h-3" /> Diâmetro
                          </p>
                          <p className="text-3xl font-black text-slate-900">{foundCoil.diameter?.toFixed(2)} <span className="text-sm text-slate-400">mm</span></p>
                        </div>
                        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                            <Weight className="w-3 h-3" /> Massa
                          </p>
                          <p className="text-3xl font-black text-slate-900">{foundCoil.weight?.toLocaleString()} <span className="text-sm text-slate-400">kg</span></p>
                        </div>
                      </div>
                      
                      {/* Decorative Rule Illustration */}
                      <div className="p-6 bg-white rounded-2xl border border-emerald-100/50 flex items-center gap-5 italic text-slate-400 text-xs font-medium">
                        <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0">
                           <Save className="w-5 h-5" />
                        </div>
                        Regra: Toda bobina consumida gera um registro permanente no histórico com data, hora e operador responsável.
                      </div>
                    </div>
                  </div>

                  {/* Right part: Production Selection Form */}
                  <div className="p-8 md:p-12 space-y-10">
                    <div>
                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                         <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                         Configuração de Turno
                      </h4>
                      <div className="grid grid-cols-3 gap-4">
                        {['1', '2', '3'].map(shift => (
                          <button
                            key={shift}
                            onClick={() => setSelectedShift(shift as any)}
                            className={cn(
                              "py-6 rounded-2xl font-black font-mono text-3xl border-2 transition-all active:scale-95",
                              selectedShift === shift 
                                ? "bg-slate-900 border-slate-900 text-white shadow-xl shadow-slate-200" 
                                : "bg-slate-50 border-transparent text-slate-400 hover:border-slate-200"
                            )}
                          >
                            T{shift}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                         <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                         Linha de Produção
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {lines.filter(l => l.active).map(line => (
                          <button
                            key={line.id}
                            onClick={() => {
                              setSelectedLine(line.id);
                              setSelectedEquipment('');
                            }}
                            className={cn(
                              "py-6 rounded-2xl font-black text-xl border-2 transition-all active:scale-95 flex flex-col items-center justify-center gap-1",
                              selectedLine === line.id 
                                ? "bg-emerald-600 border-emerald-600 text-white shadow-xl shadow-emerald-100" 
                                : "bg-slate-50 border-transparent text-slate-500 hover:border-emerald-200 hover:text-emerald-700"
                            )}
                          >
                            <Factory className={cn("w-6 h-6 mb-1", selectedLine === line.id ? "text-white" : "text-slate-300")} />
                            {line.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {selectedLine && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                      >
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                           <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                           Equipamento Ativo
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                          {equipmentOptions.length > 0 ? equipmentOptions.map(equipment => (
                            <button
                              key={equipment}
                              onClick={() => setSelectedEquipment(equipment)}
                              className={cn(
                                "py-6 rounded-2xl font-black text-lg border-2 transition-all active:scale-95",
                                selectedEquipment === equipment 
                                  ? "bg-slate-900 border-slate-900 text-white shadow-xl" 
                                  : "bg-slate-50 border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
                              )}
                            >
                              {equipment}
                            </button>
                          )) : (
                            <div className="col-span-2 p-6 bg-rose-50 rounded-2xl border border-rose-100 text-center">
                              <p className="text-sm font-bold text-rose-500 italic flex items-center justify-center gap-2">
                                <AlertTriangle className="w-5 h-5" />
                                Sem equipamentos compatíveis para esta linha/bitola.
                              </p>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}

                    <div className="grid grid-cols-2 gap-4 pt-6">
                      <button
                        onClick={() => {
                          setFoundCoil(null);
                          setSelectedEquipment('');
                        }}
                        className="py-6 bg-slate-50 text-slate-400 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-100 hover:text-slate-600 transition-all active:scale-95"
                      >
                        Trocar Bobina
                      </button>
                      <button
                        onClick={() => handleConsume()}
                        disabled={!selectedLine || !selectedShift || !selectedEquipment || loading}
                        className="py-6 bg-emerald-600 text-white rounded-2xl font-black text-xl shadow-xl shadow-emerald-200 hover:bg-emerald-700 transition-all disabled:opacity-30 disabled:grayscale active:scale-95 flex items-center justify-center gap-4"
                      >
                        {loading ? <Loader2 className="w-8 h-8 animate-spin" /> : (
                          <>
                            <CheckCircle2 className="w-8 h-8" />
                            REGISTRAR CONSUMO
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Recent History Section - Optimized Grid for Full Screen */}
      <div className="space-y-8">
        <div className="flex items-center justify-between px-4">
          <h3 className="text-xs lg:text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-3">
            <History className="w-5 h-5 text-emerald-600" />
            Atividade Recente (Hoje)
          </h3>
          <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-full text-[10px] font-black text-slate-500">
             {recentConsumptions.length} OPERAÇÕES
          </div>
        </div>

        <div className="space-y-12">
          {dailySummary.map(([dateKey, group]) => (
            <div key={dateKey} className="space-y-6">
              {/* Day Header - Floating Style */}
              <div className="flex flex-col md:flex-row md:items-end justify-between p-8 bg-white rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group">
                 <div className="absolute left-0 top-0 w-2 h-full bg-emerald-500" />
                 <div className="relative z-10">
                    <p className="text-xs font-black text-emerald-600 uppercase tracking-[0.4em] mb-2 leading-none">
                      {new Date(dateKey + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long' })}
                    </p>
                    <h4 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tighter">
                      {new Date(dateKey + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
                    </h4>
                 </div>
                 <div className="relative z-10 mt-6 md:mt-0 flex flex-col md:items-end">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Total Consumido Hoje</p>
                    <div className="flex items-baseline gap-2">
                       <p className="text-5xl font-black text-slate-900 leading-none tabular-nums">
                         {group.totalWeight.toLocaleString()}
                       </p>
                       <span className="text-xl font-black text-slate-300 tracking-tighter uppercase">kg</span>
                    </div>
                 </div>
              </div>

              {/* Grid of Consumption Cards for the day */}
              <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6">
                {group.items.map((coil) => (
                  <motion.div
                    layout
                    key={coil.id}
                    className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between gap-6 group hover:border-emerald-300 hover:shadow-lg transition-all relative"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center group-hover:bg-emerald-50 group-hover:text-emerald-500 transition-colors shadow-inner ring-1 ring-slate-100">
                          <Barcode className="w-7 h-7" />
                        </div>
                        <div>
                          <div className="flex items-center gap-3 mb-1">
                            <span className="font-black text-xl text-slate-900 tracking-tight">{coil.coilNumber}</span>
                            <span className="text-[10px] font-black text-white bg-slate-900 px-2 py-0.5 rounded uppercase">{coil.diameter}mm</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className={cn(
                              "w-2 h-2 rounded-full",
                              coil.consumedShift === '1' ? "bg-amber-400" :
                              coil.consumedShift === '2' ? "bg-blue-400" :
                              "bg-indigo-400"
                            )} />
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Turno {coil.consumedShift} • Grupo {coil.consumedByGroup}</span>
                          </div>
                        </div>
                      </div>
                      
                      {isEditable(coil) && (
                        <button
                          onClick={() => {
                            setEditingCoil(coil);
                            setNewSelectedLine(coil.currentLineId || '');
                            setNewSelectedShift(coil.consumedShift as any || '');
                            setNewSelectedEquipment(coil.consumedIn || '');
                            setNewSelectedGroup(coil.consumedByGroup || '');
                          }}
                          className="p-3 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all active:scale-90"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-50">
                       <div className="flex flex-col">
                          <span className="text-[9px] font-black text-slate-300 uppercase mb-1">Equipamento / Linha</span>
                          <p className="text-xs font-black text-slate-600 truncate flex items-center gap-2">
                             <Factory className="w-3.5 h-3.5 text-emerald-500" />
                             {coil.consumedIn} • {lines.find(l => l.id === coil.currentLineId)?.name}
                          </p>
                       </div>
                       <div className="flex flex-col items-end text-right">
                          <span className="text-[9px] font-black text-slate-300 uppercase mb-1">Registrado por</span>
                          <span className="text-xs font-black text-slate-600 truncate max-w-[120px]">{coil.consumedBy?.split(' ')[0]}</span>
                       </div>
                    </div>

                    <div className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-20 transition-opacity">
                       <Clock className="w-12 h-12" />
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}

          {dailySummary.length === 0 && (
            <div className="text-center py-24 bg-white rounded-[3rem] border border-slate-100 shadow-inner">
               <div className="relative inline-block">
                  <History className="w-20 h-20 text-slate-100 mx-auto" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-20">
                     <Barcode className="w-8 h-8 text-slate-300" />
                  </div>
               </div>
               <p className="text-slate-400 font-black uppercase tracking-widest text-xs mt-6">Aguardando novos registros de consumo</p>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showGroupWarning && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden p-8 text-center"
            >
              <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-tight">Aviso de Escala</h3>
              <p className="text-slate-500 font-medium mb-8">
                Sua letra (<span className="font-black text-slate-900">{profile?.group}</span>) não é a letra escalada para o <span className="font-black text-slate-900">Turno {selectedShift}</span> agora.
              </p>
              
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => setShowGroupWarning(false)}
                  className="w-full py-4 bg-slate-100 text-slate-600 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-all"
                >
                  Corrigir perfil/turno
                </button>
                <button
                  onClick={() => {
                    setShowGroupWarning(false);
                    handleConsume(true);
                  }}
                  className="w-full py-4 bg-emerald-600 text-white rounded-xl font-black uppercase tracking-widest text-xs hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                >
                  Confirmar mesmo assim
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {editingCoil && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                    <Edit2 className="w-8 h-8 text-blue-500" />
                    Corrigir Linha
                  </h3>
                  <p className="text-slate-500 font-bold text-sm mt-1">{editingCoil.coilNumber}</p>
                </div>
                <button 
                  onClick={() => setEditingCoil(null)} 
                  className="p-2 hover:bg-slate-100 rounded-full"
                >
                  <X className="w-7 h-7 text-slate-400" />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase mb-4 ml-1 tracking-widest">Turno & Letra</label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid grid-cols-3 gap-2">
                      {['1', '2', '3'].map(shift => (
                        <button
                          key={shift}
                          onClick={() => setNewSelectedShift(shift as any)}
                          className={cn(
                            "py-3 rounded-xl font-black text-lg border-2 transition-all active:scale-95",
                            newSelectedShift === shift 
                              ? "bg-blue-600 border-blue-600 text-white shadow-lg" 
                              : "bg-white border-slate-200 text-slate-600 hover:border-blue-200"
                          )}
                        >
                          T{shift}
                        </button>
                      ))}
                    </div>
                    <div className="relative">
                       <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                       <select
                        value={newSelectedGroup}
                        onChange={(e) => setNewSelectedGroup(e.target.value)}
                        className="w-full pl-9 pr-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-black focus:border-blue-500 outline-none appearance-none transition-all shadow-sm"
                       >
                         <option value="-">Letra -</option>
                         <option value="A">Letra A</option>
                         <option value="B">Letra B</option>
                         <option value="C">Letra C</option>
                         <option value="D">Letra D</option>
                         <option value="E">Letra E</option>
                       </select>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase mb-4 ml-1 tracking-widest">Nova Linha de Produção</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {lines.filter(l => l.active).map(line => (
                      <button
                        key={line.id}
                        onClick={() => setNewSelectedLine(line.id)}
                        className={cn(
                          "py-4 rounded-xl font-black text-base border-2 transition-all active:scale-95",
                          newSelectedLine === line.id 
                            ? "bg-blue-600 border-blue-600 text-white shadow-lg" 
                            : "bg-white border-slate-200 text-slate-600 hover:border-blue-200"
                        )}
                      >
                        {line.name}
                      </button>
                    ))}
                  </div>
                </div>

                {newSelectedLine && editingCoil && (
                  <div className="mt-6">
                  <label className="block text-xs font-black text-slate-400 uppercase mb-4 ml-1 tracking-widest">3. Corrigir Equipamento</label>
                    <div className="grid grid-cols-2 gap-3">
                      {(editingCoil.diameter < 3.0 
                        ? ['Amarradeira 1', 'Amarradeira 2'] 
                        : (lines.find(l => l.id === newSelectedLine)?.name?.toLowerCase().includes('linha a') || lines.find(l => l.id === newSelectedLine)?.name?.toLowerCase().includes('linha b')
                          ? ['Unitizadora', 'Big Balé']
                          : ['Unitizadora'])
                      ).map(equip => (
                        <button
                          key={equip}
                          onClick={() => setNewSelectedEquipment(equip)}
                          className={cn(
                            "py-4 rounded-xl font-black text-sm border-2 transition-all active:scale-95",
                            newSelectedEquipment === equip 
                              ? "bg-blue-600 border-blue-600 text-white shadow-lg" 
                              : "bg-white border-slate-200 text-slate-600 hover:border-blue-200"
                          )}
                        >
                          {equip}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex items-start gap-3">
                   <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                   <p className="text-[11px] font-bold text-amber-700 leading-tight">
                     Dúvida? Verifique fisicamente a linha onde a bobina se encontra antes de salvar a correção.
                   </p>
                </div>
              </div>

              <div className="p-8 bg-slate-50 flex gap-4">
                <button
                  type="button"
                  onClick={() => setEditingCoil(null)}
                  className="flex-1 py-5 bg-white text-slate-600 rounded-2xl font-black border border-slate-200 hover:bg-slate-100 transition-all active:scale-95"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleEditCorrection}
                  disabled={loading || !newSelectedLine || !newSelectedShift}
                  className="flex-[2] py-5 bg-slate-900 text-white rounded-2xl font-black shadow-xl hover:bg-black transition-all flex items-center justify-center gap-3 disabled:opacity-50 active:scale-95"
                >
                   {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                      <>
                        <Save className="w-6 h-6" />
                        Salvar Correção
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
