import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  addDoc, 
  setDoc, 
  doc, 
  getDocs, 
  query, 
  where, 
  serverTimestamp, 
  onSnapshot,
  Timestamp,
  orderBy,
  limit
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { safeToDate, cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/errorHandler';
import { getCurrentShift, getGroupForShift, Shift, Group } from '../lib/scaleUtils';
import { 
  ArrowLeftRight, 
  CalendarDays, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  ClipboardCheck, 
  Truck, 
  ShieldAlert, 
  Users, 
  Loader2, 
  FileText, 
  Save, 
  Activity, 
  RotateCcw,
  Plus,
  AlertCircle,
  TrendingUp,
  LineChart,
  CheckCircle,
  HelpCircle,
  Check,
  Edit2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface HandoverReport {
  id?: string;
  date: string;
  shift: string;
  type?: 'operacional' | 'qualidade';
  line?: 'Linha A' | 'Linha B' | 'Linha C' | 'Linha D' | 'MS1' | 'MS2';
  sector?: 'Enfardamento' | 'Parte Seca' | 'Parte Úmida';
  status: 'normal' | 'attention' | 'critical';
  notes: string;
  pendingTasks?: string;
  stoppedEquipment?: string;
  operatorIn: string;
  operatorOut: string;
  createdBy: string;
  createdByEmail: string;
  createdByName: string;
  createdAt: any;
  updatedAt?: any;
}

export const ShiftHandover: React.FC = () => {
  const { profile, user } = useAuth();

  // Selected parameters
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const [selectedShift, setSelectedShift] = useState<Shift>(() => getCurrentShift());
  const [selectedType, setSelectedType] = useState<'operacional' | 'qualidade'>('operacional');
  const [selectedLine, setSelectedLine] = useState<'Linha A' | 'Linha B' | 'Linha C' | 'Linha D' | 'MS1' | 'MS2'>('Linha A');
  const [selectedSector, setSelectedSector] = useState<'Enfardamento' | 'Parte Seca' | 'Parte Úmida'>('Enfardamento');

  // Filter lines dynamically based on selected sector
  const availableLines = useMemo(() => {
    if (selectedSector === 'Enfardamento') {
      return ['Linha A', 'Linha B', 'Linha C', 'Linha D'] as const;
    } else {
      return ['MS1', 'MS2'] as const;
    }
  }, [selectedSector]);

  const handleSectorChange = (sector: 'Enfardamento' | 'Parte Seca' | 'Parte Úmida') => {
    setSelectedSector(sector);
    if (sector === 'Enfardamento') {
      if (!['Linha A', 'Linha B', 'Linha C', 'Linha D'].includes(selectedLine)) {
        setSelectedLine('Linha A');
      }
    } else {
      if (!['MS1', 'MS2'].includes(selectedLine)) {
        setSelectedLine('MS1');
      }
    }
  };

  // Active modules state
  const [activeModules, setActiveModules] = useState<Record<string, boolean>>({
    dds: true,
    forklifts: true,
    wires: true,
    quality: true,
    schedule: true,
    operational_routes: true,
    safety_observations: true,
    consumables: true,
  });

  // Fetch active modules in real-time
  useEffect(() => {
    const unsubModules = onSnapshot(doc(db, 'system_config', 'modules'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setActiveModules(prev => ({
          ...prev,
          ...data
        }));
      }
    }, (error) => {
      console.error('Error listening to modules configuration in ShiftHandover:', error);
    });
    return () => unsubModules();
  }, []);

  // Compute dynamic count of active indicators to adjust presentation layout cleanly
  const activeIndicatorCount = useMemo(() => {
    return [
      activeModules.forklifts !== false,
      activeModules.quality !== false,
      activeModules.safety_observations !== false || activeModules.operational_routes !== false,
      activeModules.dds !== false
    ].filter(Boolean).length;
  }, [activeModules]);

  // Firestore states
  const [forkliftChecklists, setForkliftChecklists] = useState<any[]>([]);
  const [qualitySubmissions, setQualitySubmissions] = useState<any[]>([]);
  const [routeSubmissions, setRouteSubmissions] = useState<any[]>([]);
  const [safetyObservations, setSafetyObservations] = useState<any[]>([]);
  const [ddsSessions, setDdsSessions] = useState<any[]>([]);
  const [allDdsSignatures, setAllDdsSignatures] = useState<any[]>([]);
  const [handovers, setHandovers] = useState<HandoverReport[]>([]);

  // Loading states
  const [loadingMetrics, setLoadingMetrics] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [isEditingExisting, setIsEditingExisting] = useState<boolean>(false);

  // Form states for creating a handover
  const [handoverStatus, setHandoverStatus] = useState<'normal' | 'attention' | 'critical'>('normal');
  const [operatorIn, setOperatorIn] = useState<string>('');
  const [operatorOut, setOperatorOut] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [submitError, setSubmitError] = useState<string>('');
  const [submitSuccess, setSubmitSuccess] = useState<string>('');

  // Initial filling of operatorIn once profile is loaded
  useEffect(() => {
    if (profile?.displayName) {
      setOperatorIn(profile.displayName);
    }
  }, [profile]);

  // Load real-time data from Firestore
  useEffect(() => {
    setLoadingMetrics(true);

    const unsubForklifts = onSnapshot(collection(db, 'forklift_checklists'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setForkliftChecklists(list);
    }, (error) => {
      console.warn('Erro ao carregar checklists de empilhadeiras:', error);
    });

    const unsubQuality = onSnapshot(collection(db, 'quality_checklist_submissions'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setQualitySubmissions(list);
    }, (error) => {
      console.warn('Erro ao carregar submissões de qualidade:', error);
    });

    const unsubRoutes = onSnapshot(collection(db, 'route_submissions'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setRouteSubmissions(list);
    }, (error) => {
      console.warn('Erro ao carregar rotas operacionais:', error);
    });

    const unsubSafety = onSnapshot(collection(db, 'safety_observations'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setSafetyObservations(list);
    }, (error) => {
      console.warn('Erro ao carregar observações de segurança:', error);
    });

    const unsubDds = onSnapshot(collection(db, 'dds_sessions'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setDdsSessions(list);
    }, (error) => {
      console.warn('Erro ao carregar sessões dds:', error);
    });

    const unsubSignatures = onSnapshot(collection(db, 'dds_signatures'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setAllDdsSignatures(list);
    }, (error) => {
      console.warn('Erro ao carregar assinaturas dds:', error);
    });

    const unsubHandovers = onSnapshot(collection(db, 'shift_handovers'), (snapshot) => {
      const list: HandoverReport[] = [];
      snapshot.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() } as HandoverReport);
      });
      setHandovers(list);
      setLoadingMetrics(false);
    }, (error) => {
      console.warn('Erro ao carregar passagens de turno:', error);
      setLoadingMetrics(false);
    });

    return () => {
      unsubForklifts();
      unsubQuality();
      unsubRoutes();
      unsubSafety();
      unsubDds();
      unsubSignatures();
      unsubHandovers();
    };
  }, []);

  // Helper properties to convert Firestore timestamps to comparable locale YYYY-MM-DD & Shift values
  const parseIncidentTime = (ts: any): { dateStr: string; shiftName: Shift } | null => {
    const d = safeToDate(ts);
    if (!d) return null;
    
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    const hour = d.getHours();
    let shiftName: Shift = 'Turno 1';
    if (hour >= 0 && hour < 8) shiftName = 'Turno 1';
    else if (hour >= 8 && hour < 16) shiftName = 'Turno 2';
    else shiftName = 'Turno 3';
    
    return { dateStr, shiftName };
  };

  // Filtered Activities of Selected Shift
  const shiftMetrics = useMemo(() => {
    // 1. Forklifts
    const relevantForklifts = forkliftChecklists.filter(chk => {
      if (chk.shift === selectedShift) {
        const itemInfo = parseIncidentTime(chk.timestamp);
        return itemInfo && itemInfo.dateStr === selectedDate;
      }
      return false;
    });
    const forkliftConformeCount = relevantForklifts.filter(chk => chk.status === 'liberada' || chk.status === 'conforme').length;
    const forkliftNokCount = relevantForklifts.filter(chk => chk.status === 'bloqueada' || chk.status === 'não_conforme').length;

    // 2. Quality checklist approvals
    const relevantQuality = qualitySubmissions.filter(sub => {
      // In Quality, shift format can be group-prefixed "A - Turno 1". Let's check matching.
      const isCorrectShift = sub.shift && sub.shift.includes(selectedShift);
      const itemInfo = parseIncidentTime(sub.createdAt);
      return isCorrectShift && itemInfo && itemInfo.dateStr === selectedDate;
    });

    // 3. Operational route completions
    const relevantRoutes = routeSubmissions.filter(route => {
      const itemInfo = parseIncidentTime(route.createdAt);
      return itemInfo && itemInfo.dateStr === selectedDate && itemInfo.shiftName === selectedShift;
    });

    // 4. Safety observations
    const relevantSafety = safetyObservations.filter(obs => {
      const itemInfo = parseIncidentTime(obs.createdAt);
      return itemInfo && itemInfo.dateStr === selectedDate && itemInfo.shiftName === selectedShift;
    });

    // 5. DDS online sessions & signatures info
    const relevantSessions = ddsSessions.filter(session => {
      const isCorrectShift = session.shift === selectedShift;
      const itemInfo = parseIncidentTime(session.createdAt);
      return isCorrectShift && itemInfo && itemInfo.dateStr === selectedDate;
    });
    const sessionIds = relevantSessions.map(s => s.id);
    const relevantDdsSignaturesCount = allDdsSignatures.filter(sig => sessionIds.includes(sig.sessionId)).length;

    return {
      forkliftTotal: relevantForklifts.length,
      forkliftConforme: forkliftConformeCount,
      forkliftNok: forkliftNokCount,
      qualityCount: relevantQuality.length,
      routeCount: relevantRoutes.length,
      safetyCount: relevantSafety.length,
      ddsSessionsCount: relevantSessions.length,
      ddsSignaturesCount: relevantDdsSignaturesCount,
    };
  }, [selectedDate, selectedShift, forkliftChecklists, qualitySubmissions, routeSubmissions, safetyObservations, ddsSessions, allDdsSignatures]);

  // Calculations for previous date & shift
  const previousShiftInfo = useMemo(() => {
    let prevShift: Shift = 'Turno 3';
    let prevDateStr = selectedDate;

    if (selectedShift === 'Turno 2') {
      prevShift = 'Turno 1';
    } else if (selectedShift === 'Turno 3') {
      prevShift = 'Turno 2';
    } else {
      // Turno 1 -> Previous day's Turno 3
      prevShift = 'Turno 3';
      const parsedDate = new Date(selectedDate + 'T12:00:00'); // secure local noon
      parsedDate.setDate(parsedDate.getDate() - 1);
      const year = parsedDate.getFullYear();
      const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
      const day = String(parsedDate.getDate()).padStart(2, '0');
      prevDateStr = `${year}-${month}-${day}`;
    }

    // Lookup handover of previous shift
    const foundReport = handovers.find(h => 
      h.date === prevDateStr && 
      h.shift === prevShift &&
      (h.type || 'operacional') === selectedType &&
      (h.line || 'Linha A') === selectedLine &&
      (h.sector || 'Enfardamento') === selectedSector
    );

    return {
      date: prevDateStr,
      shift: prevShift,
      report: foundReport,
      group: getGroupForShift(new Date(prevDateStr + 'T12:00:00'), prevShift)
    };
  }, [selectedDate, selectedShift, handovers, selectedType, selectedLine, selectedSector]);

  // Current selected handover report
  const currentHandoverReport = useMemo(() => {
    return handovers.find(h => 
      h.date === selectedDate && 
      h.shift === selectedShift &&
      (h.type || 'operacional') === selectedType &&
      (h.line || 'Linha A') === selectedLine &&
      (h.sector || 'Enfardamento') === selectedSector
    );
  }, [selectedDate, selectedShift, handovers, selectedType, selectedLine, selectedSector]);

  // Populate form fields if a report exists for the selected shift and user opens editing
  useEffect(() => {
    if (currentHandoverReport) {
      setHandoverStatus(currentHandoverReport.status);
      setOperatorIn(currentHandoverReport.operatorIn);
      setOperatorOut(currentHandoverReport.operatorOut || '');
      setNotes(currentHandoverReport.notes || '');
    } else {
      // Clear form except operatorIn which defaults to profile displayName
      setHandoverStatus('normal');
      setOperatorIn(profile?.displayName || '');
      setOperatorOut('');
      setNotes('');
      setIsEditingExisting(false);
    }
  }, [currentHandoverReport, selectedDate, selectedShift, profile]);

  const handleSaveHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setSubmitError('Você precisa estar autenticado para registrar uma passagem de turno.');
      return;
    }

    if (!operatorIn.trim()) {
      setSubmitError('Informe o nome do operador que está repassando o turno.');
      return;
    }

    setSubmitting(true);
    setSubmitError('');
    setSubmitSuccess('');

    // Alphanumeric clean ID for date, shift, type, line, sector to keep database perfectly split
    const cleanLine = selectedLine.replace(/\s+/g, '');
    const cleanSector = selectedSector.replace(/\s+/g, '');
    const handoverId = `${selectedDate}_${selectedShift}_${selectedType}_${cleanLine}_${cleanSector}`.replace(/[^a-zA-Z0-9_.-]/g, '_');
    
    const payload: HandoverReport = {
      date: selectedDate,
      shift: selectedShift,
      type: selectedType,
      line: selectedLine,
      sector: selectedSector,
      status: handoverStatus,
      notes: notes.trim(),
      operatorIn: operatorIn.trim(),
      operatorOut: operatorOut.trim(),
      createdBy: user.uid,
      createdByEmail: user.email || '',
      createdByName: profile?.displayName || 'Usuário',
      createdAt: currentHandoverReport?.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    try {
      // We write under unique doc key representing date and shift to prevent duplicate entries!
      await setDoc(doc(db, 'shift_handovers', handoverId), payload);
      setSubmitSuccess('Passagem de turno salva e registrada com sucesso!');
      setIsEditingExisting(false);
      
      // Auto-hide success message after 5 seconds
      setTimeout(() => setSubmitSuccess(''), 5000);
    } catch (error) {
      console.error(error);
      try {
        handleFirestoreError(error, OperationType.WRITE, `shift_handovers/${handoverId}`);
      } catch (err: any) {
        setSubmitError(`Erro ao salvar no banco: ${err.message}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const groupOnDuty = useMemo(() => {
    try {
      const parsedDate = new Date(selectedDate + 'T12:00:00');
      return getGroupForShift(parsedDate, selectedShift);
    } catch {
      return '';
    }
  }, [selectedDate, selectedShift]);

  // Friendly formatted date string to display
  const formatDateDisplay = (dateStr: string) => {
    try {
      const [year, month, day] = dateStr.split('-');
      return `${day}/${month}/${year}`;
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12" id="shift-handover-container">
      {/* Title Header with custom spacing and zero tech larp details */}
      <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
              <ArrowLeftRight className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-950 tracking-tight">Passagem de Turno</h1>
              <p className="text-slate-500 font-semibold text-xs uppercase tracking-wider">Acompanhamento e Transferência Operacional entre Equipes</p>
            </div>
          </div>
          <p className="text-slate-500 text-sm leading-relaxed max-w-2xl mt-3">
            Visualize as atividades concluídas pelo turno anterior, verifique os indicadores e registre ou analise a passagem oficial do turno atual de forma digital e rápida.
          </p>
        </div>

        {/* Date & Shift Selectors styled with minimalist off-whites */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-2 flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-slate-400 ml-1.5" />
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent border-none text-sm font-bold text-slate-800 outline-none focus:ring-0 pr-2"
            />
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-1 flex">
            {(['Turno 1', 'Turno 2', 'Turno 3'] as Shift[]).map((sh) => (
              <button
                key={sh}
                onClick={() => setSelectedShift(sh)}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer",
                  selectedShift === sh
                    ? "bg-white text-emerald-800 shadow-sm border border-slate-200/50"
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                {sh}
              </button>
            ))}
          </div>

          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-2 text-center shrink-0">
            <p className="text-[9px] font-black uppercase text-emerald-700 tracking-wider">Escala do Turno</p>
            <p className="text-sm font-black text-emerald-900">Letra {groupOnDuty}</p>
          </div>
        </div>
      </div>

      {/* Dynamic segmentation bar (Sector, Line stacked vertically) */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col gap-6">
        {/* Sector selector */}
        <div className="space-y-2">
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Setor Operacional</label>
          <div className="flex bg-slate-50 border border-slate-150 rounded-2xl p-1 gap-1">
            {['Enfardamento', 'Parte Seca', 'Parte Úmida'].map((s) => (
              <button
                key={s}
                onClick={() => handleSectorChange(s as any)}
                className={cn(
                  "flex-1 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap",
                  selectedSector === s ? "bg-white text-slate-900 shadow-xs border border-slate-200" : "text-slate-500 hover:text-slate-850"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Line selector */}
        <div className="space-y-2">
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Linha de Produção</label>
          <div className="flex bg-slate-50 border border-slate-150 rounded-2xl p-1 gap-1">
            {availableLines.map((l) => (
              <button
                key={l}
                onClick={() => setSelectedLine(l as any)}
                className={cn(
                  "flex-1 py-1 px-1.5 rounded-lg text-[10px] font-black transition-all cursor-pointer whitespace-nowrap",
                  selectedLine === l ? "bg-white text-slate-900 shadow-xs border border-slate-200" : "text-slate-500 hover:text-slate-850"
                )}
              >
                {l.replace('Linha ', '')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Top Warning Banner: Handover report from PREVIOUS SHIFT */}
      <div id="prev-shift-banner">
        {previousShiftInfo.report ? (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "p-6 rounded-3xl border flex flex-col md:flex-row gap-5 items-start justify-between relative overflow-hidden",
              previousShiftInfo.report.status === 'normal' && "bg-emerald-50 border-emerald-100 text-emerald-950",
              previousShiftInfo.report.status === 'attention' && "bg-amber-50 border-amber-200 text-amber-950",
              previousShiftInfo.report.status === 'critical' && "bg-rose-50 border-rose-200 text-rose-950"
            )}
          >
            <div className="flex items-start gap-4 flex-1">
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm",
                previousShiftInfo.report.status === 'normal' && "bg-emerald-100 text-emerald-700",
                previousShiftInfo.report.status === 'attention' && "bg-amber-100 text-amber-700",
                previousShiftInfo.report.status === 'critical' && "bg-rose-100 text-rose-700"
              )}>
                {previousShiftInfo.report.status === 'normal' ? (
                  <CheckCircle2 className="w-6 h-6 animate-pulse" />
                ) : previousShiftInfo.report.status === 'attention' ? (
                  <AlertTriangle className="w-6 h-6 animate-bounce" />
                ) : (
                  <XCircle className="w-6 h-6" />
                )}
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest bg-white/60 text-slate-700 px-2 py-0.5 rounded-full border border-black/5">
                  Recebido do Turno Anterior ({previousShiftInfo.shift} • {formatDateDisplay(previousShiftInfo.date)}) • {previousShiftInfo.report.sector || 'Enfardamento'} • {previousShiftInfo.report.line || 'Linha A'}
                </span>
                <h3 className="text-lg font-black tracking-tight mt-1">
                  Status de Entrada: {
                    previousShiftInfo.report.status === 'normal' ? 'Normal / Sem Anormalidades' :
                    previousShiftInfo.report.status === 'attention' ? 'Atenção Requerida' : 'Ocorrência Crítica Registrada'
                  }
                </h3>
                <div className="text-sm font-semibold opacity-90 space-y-1.5 mt-2 max-w-4xl">
                  {previousShiftInfo.report.notes && (
                    <p><strong>📝 Ocorrências, Observações e Destaques do Turno:</strong> {previousShiftInfo.report.notes}</p>
                  )}
                </div>
                <div className="pt-2 text-[10px] uppercase font-bold tracking-wider opacity-60">
                  Responsável pela Passagem: {previousShiftInfo.report.operatorIn} {previousShiftInfo.report.operatorOut && `➔ Recebido por: ${previousShiftInfo.report.operatorOut}`}
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="bg-slate-100 border border-slate-200/60 p-5 rounded-3xl flex items-center gap-3 text-slate-500">
            <AlertCircle className="w-5 h-5 text-slate-400" />
            <p className="text-xs font-bold leading-relaxed">
              Não encontramos nenhuma Ficha de Passagem gravada para o turno anterior (<strong>{previousShiftInfo.shift}</strong> do dia <strong>{formatDateDisplay(previousShiftInfo.date)}</strong>) para <span className="font-extrabold text-slate-700">{selectedSector} - {selectedLine}</span>. Operação continuada normal.
            </p>
          </div>
        )}
      </div>

      {/* Grid: Selected Shift Dynamic Activity Metrics Overview */}
      {activeIndicatorCount > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Atividades e Indicadores Deste Turno ({selectedShift})</h2>
            {loadingMetrics && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
          </div>

          <div className={cn(
            "grid gap-4",
            activeIndicatorCount === 1 ? "grid-cols-1" :
            activeIndicatorCount === 2 ? "grid-cols-1 sm:grid-cols-2" :
            activeIndicatorCount === 3 ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" :
            "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
          )} id="activity-metrics-grid">
            {/* Forklifts Stat Box */}
            {activeModules.forklifts !== false && (
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-150 flex items-start gap-4">
                <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 shrink-0">
                  <Truck className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Empilhadeiras</p>
                  <h4 className="text-xl font-bold text-slate-900 mt-1">{shiftMetrics.forkliftTotal} Inspeções</h4>
                  <div className="flex items-center gap-2 mt-1.5 text-[10px] font-bold">
                    <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                      {shiftMetrics.forkliftConforme} OK
                    </span>
                    {shiftMetrics.forkliftNok > 0 && (
                      <span className="text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">
                        {shiftMetrics.forkliftNok} Nok / Bloqueadas
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Quality Submissions Box */}
            {activeModules.quality !== false && (
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-150 flex items-start gap-4">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 shrink-0">
                  <ClipboardCheck className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Qualidade</p>
                  <h4 className="text-xl font-bold text-slate-900 mt-1">{shiftMetrics.qualityCount} Checklists</h4>
                  <p className="text-slate-450 mt-1 text-[10px] font-bold">Formulários de inspeção de qualidade processados e auditados no sistema.</p>
                </div>
              </div>
            )}

            {/* Safety & Operational Routes Box */}
            {(activeModules.safety_observations !== false || activeModules.operational_routes !== false) && (
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-150 flex items-start gap-4">
                <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center text-rose-600 shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    {activeModules.safety_observations !== false && activeModules.operational_routes !== false ? "Segurança & Rotas" :
                     activeModules.safety_observations !== false ? "Segurança" : "Rotas Operacionais"}
                  </p>
                  {activeModules.safety_observations !== false ? (
                    <h4 className="text-xl font-bold text-slate-900 mt-1">{shiftMetrics.safetyCount} Desvios</h4>
                  ) : (
                    <h4 className="text-xl font-bold text-slate-900 mt-1">{shiftMetrics.routeCount} Rotas</h4>
                  )}
                  {activeModules.safety_observations !== false && activeModules.operational_routes !== false && (
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] font-bold text-slate-500">
                      <span className="bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded">
                        {shiftMetrics.routeCount} Rotas Ativas
                      </span>
                    </div>
                  )}
                  {activeModules.safety_observations === false && activeModules.operational_routes !== false && (
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] font-bold text-slate-500">
                      <span className="bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded">
                        {shiftMetrics.routeCount} Rotas Ativas neste Turno
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* DDS Safety Sessions Box */}
            {activeModules.dds !== false && (
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-150 flex items-start gap-4">
                <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">DDS Online</p>
                  <h4 className="text-xl font-bold text-slate-900 mt-1">{shiftMetrics.ddsSignaturesCount} Assinaturas</h4>
                  <div className="text-[10px] font-bold text-slate-500 mt-1 flex items-center gap-1.5">
                    <span>{shiftMetrics.ddsSessionsCount} Diálogo(s) Iniciado(s)</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Flow: Official Handover Form (Actionable) or Signed Report Display */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left 2 Cols: Handover Details Panel */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl shadow-sm border border-slate-150 p-6 md:p-8 space-y-6">
            
            {/* If a report already exists for the selected shift and they are NOT editing it */}
            {currentHandoverReport && !isEditingExisting ? (
              <div className="space-y-6" id="view-active-handover">
                <div className="flex items-center justify-between border-b border-slate-100 pb-5">
                  <div className="space-y-1">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-black uppercase tracking-wider rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-100">
                      <CheckCircle className="w-3.5 h-3.5" /> Oficialmente Gravado
                    </span>
                    <h3 className="text-xl font-black text-slate-900 tracking-tight mt-2">Passagem de Turno Concluída</h3>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Submetido por: {currentHandoverReport.createdByName || currentHandoverReport.createdByEmail}</p>
                  </div>

                  <button
                    onClick={() => setIsEditingExisting(true)}
                    className="flex items-center gap-1 px-3.5 py-1.5 border border-slate-200 hover:bg-slate-50 active:scale-95 text-slate-600 text-xs font-black rounded-xl transition-all cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" /> Editar Relatório
                  </button>
                </div>

                {/* Status Indicator */}
                <div className={cn(
                  "p-4 rounded-2xl border flex items-center gap-3",
                  currentHandoverReport.status === 'normal' && "bg-emerald-50 border-emerald-100 text-emerald-850",
                  currentHandoverReport.status === 'attention' && "bg-amber-50 border-amber-200 text-amber-850",
                  currentHandoverReport.status === 'critical' && "bg-rose-50 border-rose-200 text-rose-850"
                )}>
                  <div className={cn(
                    "w-3 h-3 rounded-full shrink-0 animate-ping",
                    currentHandoverReport.status === 'normal' && "bg-emerald-500",
                    currentHandoverReport.status === 'attention' && "bg-amber-500",
                    currentHandoverReport.status === 'critical' && "bg-rose-500"
                  )} />
                  <span className="text-xs font-black uppercase tracking-wider">
                    Status Operacional Definido por {currentHandoverReport.operatorIn}: {
                      currentHandoverReport.status === 'normal' ? 'Normal (Tudo em Ordem)' :
                      currentHandoverReport.status === 'attention' ? 'Observações Pendentes / Atenção' : 'Problema Crítico Identificado'
                    }
                  </span>
                </div>

                {/* Handover Details */}
                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Repassado por (Sainte)</span>
                      <p className="text-sm font-bold text-slate-800">{currentHandoverReport.operatorIn}</p>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Passado para (Entrante)</span>
                      <p className="text-sm font-bold text-slate-800">{currentHandoverReport.operatorOut || 'Não informado / Aberto'}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Setor Operacional</span>
                      <p className="text-sm font-bold text-slate-800">{currentHandoverReport.sector || 'Enfardamento'}</p>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Linha de Produção</span>
                      <p className="text-sm font-bold text-slate-800">{currentHandoverReport.line || 'Linha A'}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">📝 Ocorrências, Observações e Destaques do Turno</h4>
                      <p className="bg-slate-50 p-4 rounded-2xl text-sm leading-relaxed text-slate-700 whitespace-pre-wrap border border-slate-150 min-h-16 font-semibold">
                        {currentHandoverReport.notes || 'Nenhuma ocorrência registrada.'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="text-center pt-4 border-t border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Relatório gravado digitalmente às {currentHandoverReport.updatedAt ? safeToDate(currentHandoverReport.updatedAt)?.toLocaleTimeString('pt-BR') : safeToDate(currentHandoverReport.createdAt)?.toLocaleTimeString('pt-BR')} no dia {formatDateDisplay(currentHandoverReport.date)}
                  </p>
                </div>
              </div>
            ) : (
              // Active Interactive Form (Can Create or Edit)
              <form onSubmit={handleSaveHandover} className="space-y-6" id="handover-f-form">
                <div className="flex items-center justify-between border-b border-slate-100 pb-5">
                  <div>
                    <h3 className="text-xl font-black text-slate-900 tracking-tight">
                      {currentHandoverReport ? 'Editar Passagem de Turno' : 'Registrar Passagem do Turno'}
                    </h3>
                    <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mt-1">
                      Turno Selecionado: {selectedShift} • {formatDateDisplay(selectedDate)}
                    </p>
                    <p className="text-xs text-emerald-800 font-black uppercase tracking-wider mt-0.5">
                      Ficha: {selectedLine} • {selectedSector}
                    </p>
                  </div>

                  {currentHandoverReport && (
                    <button
                      type="button"
                      onClick={() => setIsEditingExisting(false)}
                      className="text-xs font-black text-slate-500 hover:text-slate-800 flex items-center gap-1 border border-slate-200 px-3 py-1 rounded-xl hover:bg-slate-50 cursor-pointer"
                    >
                      Cancelar Edição
                    </button>
                  )}
                </div>

                {/* Status Toggle Box */}
                <div className="space-y-2">
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Status Operacional do Turno</label>
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setHandoverStatus('normal')}
                      className={cn(
                        "p-4 rounded-2xl border text-center transition-all flex flex-col items-center gap-1.5 focus:outline-none cursor-pointer",
                        handoverStatus === 'normal' 
                          ? "bg-emerald-50 border-emerald-500 text-emerald-800 shadow-sm" 
                          : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                      )}
                    >
                      <CheckCircle2 className={cn("w-5 h-5", handoverStatus === 'normal' ? "text-emerald-600 animate-pulse" : "text-slate-400")} />
                      <span className="text-xs font-black uppercase">Normal</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setHandoverStatus('attention')}
                      className={cn(
                        "p-4 rounded-2xl border text-center transition-all flex flex-col items-center gap-1.5 focus:outline-none cursor-pointer",
                        handoverStatus === 'attention' 
                          ? "bg-amber-50 border-amber-500 text-amber-800 shadow-sm" 
                          : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                      )}
                    >
                      <AlertTriangle className={cn("w-5 h-5", handoverStatus === 'attention' ? "text-amber-600 animate-bounce" : "text-slate-400")} />
                      <span className="text-xs font-black uppercase">Atenção</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setHandoverStatus('critical')}
                      className={cn(
                        "p-4 rounded-2xl border text-center transition-all flex flex-col items-center gap-1.5 focus:outline-none cursor-pointer",
                        handoverStatus === 'critical' 
                          ? "bg-rose-50 border-rose-500 text-rose-850 shadow-sm" 
                          : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                      )}
                    >
                      <XCircle className={cn("w-5 h-5", handoverStatus === 'critical' ? "text-rose-600" : "text-slate-400")} />
                      <span className="text-xs font-black uppercase">Crítico</span>
                    </button>
                  </div>
                </div>

                {/* Operator Inputs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Quem entrega o turno (Sainte)</label>
                    <input
                      type="text"
                      required
                      value={operatorIn}
                      onChange={(e) => setOperatorIn(e.target.value)}
                      placeholder="Nome completo do operador"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-550 focus:border-transparent font-semibold text-sm text-slate-800 outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Quem recebe o turno (Entrante)</label>
                    <input
                      type="text"
                      value={operatorOut}
                      onChange={(e) => setOperatorOut(e.target.value)}
                      placeholder="Nome do operador do próximo turno"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-550 focus:border-transparent font-semibold text-sm text-slate-800 outline-none"
                    />
                  </div>
                </div>

                {/* Occurrence text areas */}
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Ocorrências, Observações e Destaques do Turno</label>
                    <textarea
                      rows={5}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Relate os principais acontecimentos, progresso de produção, incidentes, observações de segurança ou destaques do turno..."
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-550 font-semibold text-sm text-slate-700 outline-none resize-y min-h-32 leading-relaxed"
                    />
                  </div>
                </div>

                {/* Error and Success states within form */}
                {submitError && (
                  <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-xs font-bold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{submitError}</span>
                  </div>
                )}

                {submitSuccess && (
                  <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-700 text-xs font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{submitSuccess}</span>
                  </div>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-black text-sm uppercase tracking-wider rounded-2xl shadow-xl transition-all font-sans flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Verificando Registro...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" /> Gravar Passagem de Turno
                    </>
                  )}
                </button>
              </form>
            )}

          </div>
        </div>

        {/* Right 1 Col: Quick Tips / Shift Guidelines */}
        <div className="space-y-6">
          <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-xl relative overflow-hidden border border-slate-800">
            {/* Absolute decorative circle */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl" />
            
            <h3 className="text-base font-black tracking-tight mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-400" /> Boas Práticas na Passagem
            </h3>

            <div className="space-y-4 text-xs font-semibold text-slate-300 leading-relaxed">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] text-emerald-400 shrink-0 font-bold mt-0.5">1</div>
                <p>Verifique se todos os checklists de <strong>Empilhadeiras</strong> do seu turno foram preenchidos.</p>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] text-emerald-400 shrink-0 font-bold mt-0.5">2</div>
                <p>Relate qualquer falha detectada que permaneceu pendente para manutenção ou tratamento pelo próximo turno.</p>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] text-emerald-400 shrink-0 font-bold mt-0.5">3</div>
                <p>O DDS do turno deve possuir as assinaturas digitais de toda a equipe escalada para confirmar o alinhamento de segurança diário.</p>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] text-emerald-400 shrink-0 font-bold mt-0.5">4</div>
                <p>Informe o nome do operador entrante se já souber para formalizar a entrega de custódia da área de atuação.</p>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-slate-550 animate-spin" style={{ animationDuration: '8s' }} />
              <span className="text-[10px] text-slate-450 uppercase tracking-widest font-black font-mono">Próxima Escala Automática</span>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};
