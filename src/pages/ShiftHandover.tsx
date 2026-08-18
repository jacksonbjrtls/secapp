import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
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
import { decryptValue } from '../lib/crypto';
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
  ShieldCheck,
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
  Edit2,
  Lock,
  PackagePlus,
  Search,
  X,
  Filter
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
  const { profile, user, isManager, isAdmin, isMaster } = useAuth();

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
    shift_handover: true,
    certificates: true,
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
      handleFirestoreError(error, OperationType.GET, 'system_config/modules');
    });
    return () => unsubModules();
  }, []);

  // Compute dynamic count of active indicators to adjust presentation layout cleanly
  const activeIndicatorCount = useMemo(() => {
    return [
      activeModules.forklifts !== false,
      activeModules.quality !== false,
      activeModules.safety_observations !== false || activeModules.operational_routes !== false,
      activeModules.dds !== false,
      activeModules.consumables !== false
    ].filter(Boolean).length;
  }, [activeModules]);

  // Firestore states
  const [forkliftChecklists, setForkliftChecklists] = useState<any[]>([]);
  const [qualitySubmissions, setQualitySubmissions] = useState<any[]>([]);
  const [routeSubmissions, setRouteSubmissions] = useState<any[]>([]);
  const [safetyObservations, setSafetyObservations] = useState<any[]>([]);
  const [ddsSessions, setDdsSessions] = useState<any[]>([]);
  const [allDdsSignatures, setAllDdsSignatures] = useState<any[]>([]);
  const [consumableLogs, setConsumableLogs] = useState<any[]>([]);
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

  // Guidelines popout & history search states
  const [showGuidelines, setShowGuidelines] = useState<boolean>(false);
  const [historySearchQuery, setHistorySearchQuery] = useState<string>('');
  const [historyFilterSector, setHistoryFilterSector] = useState<string>('Todos');

  // Load guidelines check on first mount in this session
  useEffect(() => {
    const hasSeen = sessionStorage.getItem('seen_handover_guidelines');
    if (!hasSeen) {
      setShowGuidelines(true);
    }
  }, []);

  const handleCloseGuidelines = () => {
    sessionStorage.setItem('seen_handover_guidelines', 'true');
    setShowGuidelines(false);
  };

  // Initial filling of operatorIn once profile is loaded
  useEffect(() => {
    if (profile?.displayName) {
      setOperatorIn(profile.displayName);
    }
  }, [profile]);

  // Load real-time data from Firestore
  useEffect(() => {
    setLoadingMetrics(true);

    const unsubForklifts = onSnapshot(collection(db, 'forklift_checklists'), async (snapshot) => {
      const list = await Promise.all(snapshot.docs.map(async (doc) => {
        const data = doc.data() as any;
        const decName = await decryptValue(data.conductorName);
        return { id: doc.id, ...data, conductorName: decName };
      }));
      setForkliftChecklists(list);
    }, (error) => {
      console.warn('Erro ao carregar checklists de empilhadeiras:', error);
    });

    const unsubQuality = onSnapshot(collection(db, 'quality_checklist_submissions'), async (snapshot) => {
      const list = await Promise.all(snapshot.docs.map(async (doc) => {
        const data = doc.data() as any;
        const decName = await decryptValue(data.userName);
        return { id: doc.id, ...data, userName: decName };
      }));
      setQualitySubmissions(list);
    }, (error) => {
      console.warn('Erro ao carregar submissões de qualidade:', error);
    });

    const unsubRoutes = onSnapshot(collection(db, 'route_submissions'), async (snapshot) => {
      const list = await Promise.all(snapshot.docs.map(async (doc) => {
        const data = doc.data() as any;
        const decName = await decryptValue(data.userName);
        return { id: doc.id, ...data, userName: decName };
      }));
      setRouteSubmissions(list);
    }, (error) => {
      console.warn('Erro ao carregar rotas operacionais:', error);
    });

    const unsubSafety = onSnapshot(collection(db, 'safety_observations'), async (snapshot) => {
      const list = await Promise.all(snapshot.docs.map(async (doc) => {
        const data = doc.data() as any;
        const decName = await decryptValue(data.userName);
        return { id: doc.id, ...data, userName: decName };
      }));
      setSafetyObservations(list);
    }, (error) => {
      console.warn('Erro ao carregar observações de segurança:', error);
    });

    const unsubDds = onSnapshot(collection(db, 'dds_sessions'), async (snapshot) => {
      const list = await Promise.all(snapshot.docs.map(async (doc) => {
        const data = doc.data() as any;
        const decName = await decryptValue(data.userName);
        return { id: doc.id, ...data, userName: decName };
      }));
      setDdsSessions(list);
    }, (error) => {
      console.warn('Erro ao carregar sessões dds:', error);
    });

    const unsubSignatures = onSnapshot(collection(db, 'dds_signatures'), async (snapshot) => {
      const list = await Promise.all(snapshot.docs.map(async (doc) => {
        const data = doc.data() as any;
        const decName = await decryptValue(data.userName);
        return { id: doc.id, ...data, userName: decName };
      }));
      setAllDdsSignatures(list);
    }, (error) => {
      console.warn('Erro ao carregar assinaturas dds:', error);
    });

    const unsubHandovers = onSnapshot(collection(db, 'shift_handovers'), async (snapshot) => {
      const list = await Promise.all(snapshot.docs.map(async (doc) => {
        const data = doc.data() as any;
        const decIn = await decryptValue(data.operatorIn);
        const decOut = await decryptValue(data.operatorOut);
        const decCreatedByName = await decryptValue(data.createdByName);
        return { 
          id: doc.id, 
          ...data, 
          operatorIn: decIn, 
          operatorOut: decOut, 
          createdByName: decCreatedByName 
        } as HandoverReport;
      }));
      setHandovers(list);
      setLoadingMetrics(false);
    }, (error) => {
      console.warn('Erro ao carregar passagens de turno:', error);
      setLoadingMetrics(false);
    });

    const unsubConsumables = onSnapshot(collection(db, 'consumable_logs'), async (snapshot) => {
      const list = await Promise.all(snapshot.docs.map(async (doc) => {
        const data = doc.data() as any;
        const decName = await decryptValue(data.userName);
        return { id: doc.id, ...data, userName: decName };
      }));
      setConsumableLogs(list);
    }, (error) => {
      console.warn('Erro ao carregar logs de insumos:', error);
    });

    return () => {
      unsubForklifts();
      unsubQuality();
      unsubRoutes();
      unsubSafety();
      unsubDds();
      unsubSignatures();
      unsubHandovers();
      unsubConsumables();
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

    // 6. Consumables logs (Insumos)
    const relevantConsumables = consumableLogs.filter(log => {
      const itemInfo = parseIncidentTime(log.timestamp);
      const isCorrectShift = log.shift === selectedShift;
      return isCorrectShift && itemInfo && itemInfo.dateStr === selectedDate;
    });
    const consumablesOutCount = relevantConsumables.filter(l => l.type === 'consumption').length;
    const consumablesInCount = relevantConsumables.filter(l => l.type === 'entry').length;

    return {
      forkliftTotal: relevantForklifts.length,
      forkliftConforme: forkliftConformeCount,
      forkliftNok: forkliftNokCount,
      qualityCount: relevantQuality.length,
      routeCount: relevantRoutes.length,
      safetyCount: relevantSafety.length,
      ddsSessionsCount: relevantSessions.length,
      ddsSignaturesCount: relevantDdsSignaturesCount,
      consumablesTotal: relevantConsumables.length,
      consumablesOut: consumablesOutCount,
      consumablesIn: consumablesInCount,
    };
  }, [selectedDate, selectedShift, forkliftChecklists, qualitySubmissions, routeSubmissions, safetyObservations, ddsSessions, allDdsSignatures, consumableLogs]);

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

  // Compute filtered handovers list for the historical sidebar navigation
  const filteredHandovers = useMemo(() => {
    let list = [...handovers];

    // Sort by date descending, then shift descending, then line
    list.sort((a, b) => {
      if (a.date !== b.date) {
        return b.date.localeCompare(a.date);
      }
      if (a.shift !== b.shift) {
        return b.shift.localeCompare(a.shift);
      }
      return (a.line || '').localeCompare(b.line || '');
    });

    if (historyFilterSector && historyFilterSector !== 'Todos') {
      list = list.filter(h => h.sector === historyFilterSector);
    }

    if (historySearchQuery.trim()) {
      const query = historySearchQuery.toLowerCase();
      list = list.filter(h => 
        (h.operatorIn || '').toLowerCase().includes(query) || 
        (h.operatorOut || '').toLowerCase().includes(query) || 
        (h.notes || '').toLowerCase().includes(query) || 
        (h.date || '').includes(query) ||
        (h.shift || '').toLowerCase().includes(query) ||
        (h.line || '').toLowerCase().includes(query) ||
        (h.sector || '').toLowerCase().includes(query)
      );
    }

    return list;
  }, [handovers, historyFilterSector, historySearchQuery]);

  // Check if current user is allowed to edit the selected report
  const canEdit = useMemo(() => {
    if (!user) return false;
    
    const isCtrl = !!(isManager || isAdmin || isMaster);
    if (isCtrl) return true; // Admins, Managers and Masters can always edit any report
    
    // If the report doesn't exist yet, we can create/edit it
    if (!currentHandoverReport) return true;

    // Report exists: Check if it belongs to the current user (owner as creator)
    const isOwner = !currentHandoverReport.createdBy || 
                    currentHandoverReport.createdBy === user.uid || 
                    currentHandoverReport.createdByEmail === user.email ||
                    (currentHandoverReport.operatorIn && profile?.displayName && currentHandoverReport.operatorIn.toLowerCase().trim() === profile.displayName.toLowerCase().trim());
    if (!isOwner) return false;
    
    // Calculate shift starting and closing times to determine valid editing window
    const getShiftClosingTime = (dateStr: string, shiftVal: Shift): Date => {
      const [year, month, day] = dateStr.split('-').map(Number);
      if (shiftVal === 'Turno 1') {
        return new Date(year, month - 1, day, 8, 0, 0, 0);
      } else if (shiftVal === 'Turno 2') {
        return new Date(year, month - 1, day, 16, 0, 0, 0);
      } else {
        // Turno 3 ends at midnight, which is next day at 00:00:00
        return new Date(year, month - 1, day + 1, 0, 0, 0, 0);
      }
    };

    const getShiftStartTime = (dateStr: string, shiftVal: Shift): Date => {
      const [year, month, day] = dateStr.split('-').map(Number);
      if (shiftVal === 'Turno 1') {
        return new Date(year, month - 1, day, 0, 0, 0, 0);
      } else if (shiftVal === 'Turno 2') {
        return new Date(year, month - 1, day, 8, 0, 0, 0);
      } else {
        return new Date(year, month - 1, day, 16, 0, 0, 0);
      }
    };

    const now = new Date();
    const startTime = getShiftStartTime(selectedDate, selectedShift);
    const closingTime = getShiftClosingTime(selectedDate, selectedShift);
    const deadlineTime = new Date(closingTime.getTime() + 2 * 60 * 60 * 1000); // 2 hours after shift closes

    // Allowed to edit during the shift and up to 2 hours after closes
    return now >= startTime && now <= deadlineTime;
  }, [user, isManager, isAdmin, isMaster, currentHandoverReport, selectedDate, selectedShift, profile]);

  // Information about editing grace period to show in UI
  const editGraceTimeInfo = useMemo(() => {
    if (!currentHandoverReport || !user) return null;
    
    const isCtrl = !!(isManager || isAdmin || isMaster);
    const isOwner = !currentHandoverReport.createdBy || 
                    currentHandoverReport.createdBy === user.uid || 
                    currentHandoverReport.createdByEmail === user.email ||
                    (currentHandoverReport.operatorIn && profile?.displayName && currentHandoverReport.operatorIn.toLowerCase().trim() === profile.displayName.toLowerCase().trim());

    const getShiftClosingTime = (dateStr: string, shiftVal: Shift): Date => {
      const [year, month, day] = dateStr.split('-').map(Number);
      if (shiftVal === 'Turno 1') {
        return new Date(year, month - 1, day, 8, 0, 0, 0);
      } else if (shiftVal === 'Turno 2') {
        return new Date(year, month - 1, day, 16, 0, 0, 0);
      } else {
        return new Date(year, month - 1, day + 1, 0, 0, 0, 0);
      }
    };

    const closingTime = getShiftClosingTime(selectedDate, selectedShift);
    const deadlineTime = new Date(closingTime.getTime() + 2 * 60 * 60 * 1000);
    const now = new Date();
    
    const isPastShiftClose = now > closingTime;
    const isWithin2Hours = now <= deadlineTime;
    
    return {
      isCtrl,
      isOwner,
      isPastShiftClose,
      isWithin2Hours,
      deadlineFormat: deadlineTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      deadlineDate: deadlineTime.toLocaleDateString('pt-BR')
    };
  }, [currentHandoverReport, user, isManager, isAdmin, isMaster, selectedDate, selectedShift, profile]);

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

    if (!canEdit) {
      setSubmitError('Você não tem permissão para editar este relatório ou o turno correspondente já foi encerrado.');
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

  if (activeModules.shift_handover === false) {
    return (
      <div className="max-w-md mx-auto my-12 text-center" id="shift-handover-disabled">
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-md flex flex-col items-center">
          <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500 mb-4">
            <ArrowLeftRight className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Módulo Desabilitado</h2>
          <p className="text-sm text-slate-500 mt-2 font-semibold">
            O módulo de Passagem de Turno foi temporariamente desativado pelo administrador do sistema.
          </p>
          <p className="text-xs text-slate-400 mt-4 leading-relaxed font-medium">
            Se você precisar realizar apontamentos de segurança ou inspeções, acesse o módulo de DDS Online.
          </p>
          <Link
            to="/dds"
            className="mt-6 inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md transition-all cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" /> Ir para DDS Online
          </Link>
        </div>
      </div>
    );
  }

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
          <p className="text-slate-500 text-sm leading-relaxed max-w-2xl mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span>
              Visualize as atividades concluídas pelo turno anterior, verifique os indicadores e registre ou analise a passagem oficial do turno atual de forma digital e rápida.
            </span>
            <button
              type="button"
              onClick={() => setShowGuidelines(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-black text-indigo-700 bg-indigo-50 hover:bg-indigo-100/80 border border-indigo-150 rounded-lg transition-all cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" /> Ver Diretrizes &amp; Boas Práticas
            </button>
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
            {(['Turno 1', 'Turno 2', 'Turno 3'] as Shift[]).map((sh, shIdx) => (
              <button
                key={`handover-shift-${sh}-${shIdx}`}
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
            {['Enfardamento', 'Parte Seca', 'Parte Úmida'].map((s, sIdx) => (
              <button
                key={`handover-sector-${s}-${sIdx}`}
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
            {availableLines.map((l, lIdx) => (
              <button
                key={`handover-line-${l}-${lIdx}`}
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
            activeIndicatorCount === 4 ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" :
            "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
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

            {/* Consumables (Insumos) Box */}
            {activeModules.consumables !== false && (
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-150 flex items-start gap-4" id="consumables-handover-box">
                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 shrink-0">
                  <PackagePlus className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Controle de Insumos</p>
                  <h4 className="text-xl font-bold text-slate-900 mt-1">{shiftMetrics.consumablesTotal} Registros</h4>
                  <div className="flex items-center gap-2 mt-1.5 text-[10px] font-bold">
                    <span className="text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                      {shiftMetrics.consumablesOut} Saídas / Consumo
                    </span>
                    {shiftMetrics.consumablesIn > 0 && (
                      <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                        {shiftMetrics.consumablesIn} Entradas
                      </span>
                    )}
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
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider block mb-1">Submetido por: {currentHandoverReport.createdByName || currentHandoverReport.createdByEmail}</p>
                    {editGraceTimeInfo && (
                      <div className="text-[10px] font-extrabold tracking-wide mt-1.5 flex flex-wrap gap-2">
                        {editGraceTimeInfo.isCtrl ? (
                          <span className="text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-lg inline-block shadow-sm">
                            🔧 Administrador: Edição Liberada Sem Restrição de Tempo
                          </span>
                        ) : editGraceTimeInfo.isOwner && editGraceTimeInfo.isPastShiftClose && editGraceTimeInfo.isWithin2Hours ? (
                          <span className="text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg inline-flex items-center gap-1 shadow-xs animate-pulse">
                            ⏳ Tolerância Ativa: Edição liberada até {editGraceTimeInfo.deadlineFormat} do dia {editGraceTimeInfo.deadlineDate} (Limite de 2h pós-encerramento)
                          </span>
                        ) : editGraceTimeInfo.isOwner && !editGraceTimeInfo.isPastShiftClose ? (
                          <span className="text-emerald-700 bg-emerald-50/80 border border-emerald-100 px-2.5 py-1 rounded-lg inline-block shadow-xs">
                            ⏱️ Turno Ativo: Editável até 2h depois de encerrar (Disponível até {editGraceTimeInfo.deadlineFormat})
                          </span>
                        ) : editGraceTimeInfo.isOwner && !editGraceTimeInfo.isWithin2Hours ? (
                          <span className="text-rose-750 bg-rose-50 border border-rose-150 px-2.5 py-1 rounded-lg inline-block shadow-xs text-rose-800">
                            🔒 Expirado: O prazo de 2h pós-encerramento esgotou às {editGraceTimeInfo.deadlineFormat}. Apenas Administradores podem editar agora.
                          </span>
                        ) : (
                          <span className="text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg inline-block shadow-xs">
                            👤 Somente Leitura: Este relatório pertence ao operador "{currentHandoverReport.operatorIn}".
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {canEdit ? (
                    <button
                      onClick={() => setIsEditingExisting(true)}
                      className="flex items-center gap-1.5 px-4.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 hover:shadow-md active:scale-95 text-white text-xs font-black rounded-xl transition-all cursor-pointer border border-indigo-500"
                    >
                      <Edit2 className="w-3.5 h-3.5" /> Editar Relatório
                    </button>
                  ) : (
                    <span className="flex items-center gap-1 px-3.5 py-1.5 text-slate-400 text-xs font-black rounded-xl border border-slate-100 bg-slate-50">
                      <Lock className="w-3.5 h-3.5 text-slate-400" /> Turno Encerrado
                    </span>
                  )}
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
                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-150 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">📝 Ocorrências, Observações e Destaques do Turno</h4>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => setIsEditingExisting(true)}
                            className="text-[10px] font-extrabold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 hover:underline cursor-pointer"
                          >
                            <Edit2 className="w-3 h-3" /> Editar Texto
                          </button>
                        )}
                      </div>
                      <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap font-semibold">
                        {currentHandoverReport.notes || 'Nenhuma ocorrência registrada.'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-5 border-t border-slate-100">
                  <p className="text-[10px] font-bold text-slate-450 uppercase tracking-wider text-center sm:text-left">
                    Relatório gravado digitalmente às {currentHandoverReport.updatedAt ? safeToDate(currentHandoverReport.updatedAt)?.toLocaleTimeString('pt-BR') : safeToDate(currentHandoverReport.createdAt)?.toLocaleTimeString('pt-BR')} no dia {formatDateDisplay(currentHandoverReport.date)}
                  </p>
                  
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setIsEditingExisting(true)}
                      className="w-full sm:w-auto px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-xs hover:shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer border border-indigo-550"
                    >
                      <Edit2 className="w-3.5 h-3.5" /> Editar Conteúdo da Passagem
                    </button>
                  )}
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
                      <Loader2 className="w-4 h-4 animate-spin" /> {currentHandoverReport ? 'Salvando Alterações...' : 'Verificando Registro...'}
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" /> {currentHandoverReport ? 'Salvar Edição da Passagem de Turno' : 'Gravar Passagem de Turno'}
                    </>
                  )}
                </button>
              </form>
            )}

          </div>
        </div>

        {/* Right 1 Col: Histórico de Passagens e Filtro de Datas Anteriores */}
        <div className="space-y-6" id="history-sidebar">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-150 space-y-5">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-emerald-600 animate-pulse" /> Histórico de Passagens
                </h3>
                <span className="text-[10px] font-black bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                  {filteredHandovers.length} registradas
                </span>
              </div>
              <p className="text-slate-400 font-bold text-[10px] uppercase tracking-wider mt-1">Consulte ou edite turnos anteriores</p>
            </div>

            {/* Quick Filters */}
            <div className="space-y-2">
              {/* Search Bar */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar por operador, notas..."
                  value={historySearchQuery}
                  onChange={(e) => setHistorySearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-transparent transition-all"
                />
                {historySearchQuery && (
                  <button
                    type="button"
                    onClick={() => setHistorySearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Sector Filter Dropdown or Buttons */}
              <div className="flex items-center gap-1.5 pt-1">
                <Filter className="w-3 h-3 text-slate-400 shrink-0" />
                <span className="text-[10px] font-bold text-slate-400 uppercase">Setor:</span>
                <select
                  value={historyFilterSector}
                  onChange={(e) => setHistoryFilterSector(e.target.value)}
                  className="bg-transparent border-none outline-none text-[10.5px] font-black text-slate-700 cursor-pointer focus:ring-0 py-0 pl-1 pr-4"
                >
                  <option value="Todos">Todos os Setores</option>
                  <option value="Enfardamento">Enfardamento</option>
                  <option value="Parte Seca">Parte Seca</option>
                  <option value="Parte Úmida">Parte Úmida</option>
                </select>
              </div>
            </div>

            {/* Scrollable List of Handovers */}
            <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1 scrollbar-thin">
              {filteredHandovers.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <p className="text-xs font-bold text-slate-400">Nenhum registro encontrado</p>
                </div>
              ) : (
                filteredHandovers.map((item) => {
                  const isSelected = item.date === selectedDate && 
                                     item.shift === selectedShift && 
                                     item.sector === selectedSector && 
                                     item.line === selectedLine;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSelectedDate(item.date);
                        setSelectedShift(item.shift as any);
                        handleSectorChange(item.sector as any);
                        if (item.line) {
                          setSelectedLine(item.line as any);
                        }
                        setIsEditingExisting(false);
                      }}
                      className={cn(
                        "w-full text-left p-3 rounded-2xl border transition-all cursor-pointer flex flex-col gap-2 relative group",
                        isSelected 
                          ? "bg-emerald-50/80 border-emerald-500 shadow-xs" 
                          : "bg-slate-50 hover:bg-slate-100 border-slate-200/80 hover:border-slate-300"
                      )}
                    >
                      <div className="flex items-start justify-between w-full">
                        <div className="space-y-0.5">
                          <span className="text-[10.5px] font-black text-slate-800">
                            {formatDateDisplay(item.date)}
                          </span>
                          <span className="mx-1 text-slate-350">•</span>
                          <span className="text-[10.5px] font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-100/50 px-1 py-0.2 rounded">
                            {item.shift}
                          </span>
                        </div>
                        <div className={cn(
                          "w-2.5 h-2.5 rounded-full shrink-0",
                          item.status === 'normal' && "bg-emerald-500",
                          item.status === 'attention' && "bg-amber-550 animate-pulse",
                          item.status === 'critical' && "bg-rose-550 animate-ping"
                        )} />
                      </div>

                      <div className="text-[10px] font-bold text-slate-500 leading-tight">
                        <p className="truncate"><strong className="text-slate-600">{item.sector}</strong> • {item.line}</p>
                        <p className="text-slate-400 mt-1 truncate">De: <strong className="text-slate-600">{item.operatorIn}</strong> {item.operatorOut ? `➔ Para: ${item.operatorOut}` : ''}</p>
                      </div>

                      {item.notes && (
                        <p className="text-[10px] font-semibold text-slate-500 truncate border-t border-slate-200/50 pt-1.5 mt-0.5 italic">
                          "{item.notes}"
                        </p>
                      )}

                      {isSelected && (
                        <span className="absolute bottom-1 right-2 text-[8px] font-black text-emerald-700 uppercase tracking-widest bg-emerald-100 px-1.5 py-0.2 rounded">
                          Carregado
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Visual Guidelines (Guidelines Popout / Modal) */}
      <AnimatePresence>
        {showGuidelines && (
          <div key="guidelines-modal-container" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop Blur overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseGuidelines}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />

            {/* Modal Body Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white text-slate-800 rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl border border-slate-100 relative z-10 overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Decorative side shape */}
              <div className="absolute top-0 right-0 w-36 h-36 bg-emerald-100/40 rounded-full blur-2xl pointer-events-none" />

              {/* Close button X */}
              <button 
                type="button"
                onClick={handleCloseGuidelines}
                className="absolute top-5 right-5 w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-all cursor-pointer border border-slate-200/55"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Icon and Title */}
              <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-4">
                <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-950 tracking-tight">Boas Práticas na Passagem</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Metodologia e Verificação Padrão</p>
                </div>
              </div>

              {/* Step instructions */}
              <div className="space-y-5 overflow-y-auto pr-1 flex-1 py-1 scrollbar-thin">
                <div className="flex gap-4">
                  <div className="w-7 h-7 rounded-full bg-emerald-50 flex items-center justify-center text-xs text-emerald-700 shrink-0 font-black">1</div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-wide">Inspeções de Empilhadeiras</h4>
                    <p className="text-xs font-semibold text-slate-500 leading-relaxed">
                      Verifique se todos os checklists de <strong>Empilhadeiras</strong> do seu turno foram preenchidos para atestar que os equipamentos operavam em conformidade.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-7 h-7 rounded-full bg-indigo-50 flex items-center justify-center text-xs text-indigo-700 shrink-0 font-black">2</div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-wide">Tratamento de Ocorrências</h4>
                    <p className="text-xs font-semibold text-slate-500 leading-relaxed">
                      Relate de forma detalhada qualquer incidente técnico, falhas ou paradas prolongadas de máquinas que permaneceram pendentes para manutenção no próximo turno.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-7 h-7 rounded-full bg-amber-500/10 flex items-center justify-center text-xs text-amber-700 shrink-0 font-black">3</div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-wide">Sessão de DDS Completa</h4>
                    <p className="text-xs font-semibold text-slate-500 leading-relaxed">
                      O alinhamento e DDS (Diálogo Diário de Segurança) do turno deve possuir as assinaturas digitais de toda a equipe escalada antes da entrega física de chaves.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-7 h-7 rounded-full bg-rose-50 flex items-center justify-center text-xs text-rose-700 shrink-0 font-black">4</div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-wide">Insumos e Custódia do Próximo Turno</h4>
                    <p className="text-xs font-semibold text-slate-500 leading-relaxed">
                      Verifique se os registros de insumos/consumíveis estão atualizados e informe o nome do operador entrante para o encerramento seguro de sua responsabilidade jurídica.
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Button to close */}
              <div className="mt-8 pt-4 border-t border-slate-100 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={handleCloseGuidelines}
                  className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-black text-sm uppercase tracking-wider rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Check className="w-4 h-4" /> Entendi e Desejo Prosseguir
                </button>
                <p className="text-[9px] text-slate-450 font-semibold text-center uppercase tracking-widest block select-none">
                  Esta mensagem não será exibida automaticamente na próxima vez
                </p>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
