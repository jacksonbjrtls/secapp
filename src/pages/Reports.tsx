import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { collection, getDocs, orderBy, query, where, doc, updateDoc, serverTimestamp, limit, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { MASTER_EMAILS } from '../constants';
import { fetchUsersSafely, getLocalCachedUsers, subscribeToUsers } from '../lib/usersCache';
import { fetchReferenceCollection } from '../lib/referenceCache';
import { handleFirestoreError, OperationType } from '../lib/errorHandler';
import { decryptValue } from '../lib/crypto';
import { 
  Smile,
  Meh,
  Frown,
  FileDown, 
  FileText, 
  Table as TableIcon,
  ClipboardCheck,
  Download,
  Loader2,
  Calendar,
  Filter,
  Search,
  X,
  ChevronDown,
  Trash2,
  AlertTriangle,
  Truck,
  Printer,
  ListFilter,
  TrendingUp,
  Package,
  Factory,
  ShieldCheck,
  User as UserIcon,
  Edit2,
  CheckCircle2,
  UserCheck,
  LogIn,
  Activity,
  Users,
  Smartphone,
  Laptop,
  MousePointerClick,
  Star,
  UserX,
  ChevronRight,
  PenTool,
  RefreshCw,
  Clock,
  Wrench,
  Camera,
  Eye,
  Layers,
  Tag
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { 
  cn, 
  safeToDate, 
  formatDateBR, 
  formatLocalDateBR, 
  formatLocalTimeBR, 
  formatLocalDateTimeBR, 
  getLocalDateStrBR 
} from '../lib/utils';
import { StopReport } from '../types';

import { ConfirmationModal } from '../components/ui/ConfirmationModal';

const DEFAULT_WORK_FRONTS = [
  'Caldeiraria',
  'Civil',
  'Elétrica',
  'Hidráulica',
  'Instrumentação',
  'Mecânica',
  'Operacional'
].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));

const formatDateToBR = (dateStr: string): string => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};

const getMinutesDiff = (start: string, end: string) => {
  if (!start || !end) return 0;
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  let diff = (endH * 60 + endM) - (startH * 60 + startM);
  if (diff < 0) diff += 24 * 60;
  return diff;
};

const formatDurationString = (minutes: number) => {
  if (isNaN(minutes) || minutes <= 0) return '0 min';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}min`;
  if (hours > 0) return `${hours}h`;
  return `${mins} min`;
};

const getStopTypeLabel = (type: string): string => {
  switch (type) {
    case 'programada': return 'Programada';
    case 'geral': return 'Geral';
    case 'emergencia': return 'Emergência';
    case 'inspecao': return 'Inspeção';
    default: return type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Programada';
  }
};

const getStopTypeBadgeClass = (type: string): string => {
  switch (type) {
    case 'programada': return 'bg-sky-50 border-sky-200 text-sky-800';
    case 'geral': return 'bg-amber-50 border-amber-200 text-amber-800';
    case 'emergencia': return 'bg-rose-50 border-rose-200 text-rose-800';
    case 'inspecao': return 'bg-purple-50 border-purple-200 text-purple-800';
    default: return 'bg-slate-50 border-slate-200 text-slate-700';
  }
};

const Reports: React.FC = () => {

  // Helper to sanitize Portuguese accented characters for jsPDF text drawing
  const sanitizePdfText = (text: string | null | undefined): string => {
    if (!text) return '';
    return String(text)
      .replace(/[áàâãäÁÀÂÃÄ]/g, 'a')
      .replace(/[éèêëÉÈÊË]/g, 'e')
      .replace(/[íìîïÍÌÎÏ]/g, 'i')
      .replace(/[óòôõöÓÒÔÕÖ]/g, 'o')
      .replace(/[úùûüÚÙÛÜ]/g, 'u')
      .replace(/[çÇ]/g, 'c')
      .replace(/[ñÑ]/g, 'n');
  };

  // Helper to format userAgent into user-friendly device/browser description
  const formatUserAgent = (ua: string | undefined): string => {
    if (!ua || ua === 'Unknown') return 'Navegador Web';
    if (/Android/i.test(ua)) return 'Celular Android';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'iPhone / iPad (iOS)';
    if (/Windows/i.test(ua)) return 'Computador (Windows)';
    if (/Macintosh/i.test(ua)) return 'Computador (Mac)';
    if (/Linux/i.test(ua)) return 'Computador (Linux)';
    return 'Navegador Web';
  };

  const { isManager, isAdmin, isMaster } = useAuth();
  const [reportType, setReportType] = useState<'dds' | 'forklift' | 'wire_receiving' | 'wire_consumption' | 'quality' | 'user_ray_x' | 'pending_equipments' | 'stops_control'>('dds');
  const [data, setData] = useState<any[]>([]);
  const [forkliftData, setForkliftData] = useState<any[]>([]);
  const [wireReceivingData, setWireReceivingData] = useState<any[]>([]);
  const [wireConsumptionData, setWireConsumptionData] = useState<any[]>([]);
  const [qualityData, setQualityData] = useState<any[]>([]);
  const [qualityTemplates, setQualityTemplates] = useState<Record<string, any>>({});
  const [qualitySectors, setQualitySectors] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [lines, setLines] = useState<any[]>([]);
  const [checkItems, setCheckItems] = useState<Record<string, string>>({});
  const [checkItemsList, setCheckItemsList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [orphanIds, setOrphanIds] = useState<string[]>([]);
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [expandedReceivingIds, setExpandedReceivingIds] = useState<Record<string, any[]>>({});
  const [loadingBatchCoils, setLoadingBatchCoils] = useState<Record<string, boolean>>({});

  // Ray-X User Performance Report states
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [ddsSessionsData, setDdsSessionsData] = useState<any[]>([]);
  const [routeSubmissionsData, setRouteSubmissionsData] = useState<any[]>([]);
  const [maintenanceIssuesData, setMaintenanceIssuesData] = useState<any[]>([]);
  const [safetyObservationsData, setSafetyObservationsData] = useState<any[]>([]);
  const [userLoginLogsData, setUserLoginLogsData] = useState<any[]>([]);
  const [feedbackSurveysData, setFeedbackSurveysData] = useState<any[]>([]);
  const [selectedRayXUser, setSelectedRayXUser] = useState<string>('');
  const [rayXViewMode, setRayXViewMode] = useState<'individual' | 'team_summary'>('team_summary');
  const [rayXSearchTerm, setRayXSearchTerm] = useState('');
  const [rayXAccessFilter, setRayXAccessFilter] = useState<'all' | 'accessed' | 'never_accessed'>('all');
  const [rayXShiftFilter, setRayXShiftFilter] = useState('all');
  const [rayXDdsTab, setRayXDdsTab] = useState<'signatures' | 'created'>('signatures');
  const [exportingRayXPdf, setExportingRayXPdf] = useState(false);
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'success'
  });

  // DDS Executor editing states
  const [editingExecutorModal, setEditingExecutorModal] = useState<{
    sessionId: string;
    sessionTitle: string;
    currentExecutor: string;
  } | null>(null);
  const [newExecutorValue, setNewExecutorValue] = useState('');
  const [isSavingExecutor, setIsSavingExecutor] = useState(false);
  const [executorUpdateSuccess, setExecutorUpdateSuccess] = useState<string | null>(null);

  // Stops Control (Controle de Paradas) states
  const [stopsData, setStopsData] = useState<StopReport[]>([]);
  const [filterStopFront, setFilterStopFront] = useState<string>('all');
  const [filterStopActivity, setFilterStopActivity] = useState<string>('');
  const [filterStopType, setFilterStopType] = useState<string>('all');
  const [filterStopDuration, setFilterStopDuration] = useState<string>('all');
  const [selectedStopModal, setSelectedStopModal] = useState<StopReport | null>(null);
  const [expandedStopIds, setExpandedStopIds] = useState<Record<string, boolean>>({});
  const [activePhotoModal, setActivePhotoModal] = useState<{ url: string; caption?: string } | null>(null);

  const toggleStopExpand = (id: string) => {
    setExpandedStopIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const closeModal = () => setModalConfig(prev => ({ ...prev, isOpen: false }));

  // Filters State - Initialized to today for ultra-fast load (< 250ms) and Firestore cost reduction
  const todayStr = useMemo(() => getLocalDateStrBR(new Date()), []);
  const [filterUser, setFilterUser] = useState('');
  const [filterEquipment, setFilterEquipment] = useState<string>('all');
  const [filterTheme, setFilterTheme] = useState('');
  const [filterShift, setFilterShift] = useState('all');
  const [filterGroup, setFilterGroup] = useState('all');
  const [filterMood, setFilterMood] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterLine, setFilterLine] = useState('all');
  const [filterDateStart, setFilterDateStart] = useState<string>(todayStr);
  const [filterDateEnd, setFilterDateEnd] = useState<string>(todayStr);
  const [showFilters, setShowFilters] = useState(false);
  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Dynamic work fronts list (defaults + dynamically collected from stops database)
  const availableWorkFronts = useMemo(() => {
    const set = new Set<string>(DEFAULT_WORK_FRONTS);
    stopsData.forEach(rep => {
      if (rep.workFronts && Array.isArray(rep.workFronts)) {
        rep.workFronts.forEach(wf => {
          if (wf.front && wf.front.trim()) set.add(wf.front.trim());
        });
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }, [stopsData]);

  // Dynamic list of equipments with pendency for the dropdown selector
  const availablePendingEquipments = useMemo(() => {
    const map = new Map<string, { tag: string; name: string; line?: string }>();
    
    // 1. Scan routeSubmissionsData
    routeSubmissionsData.forEach(sub => {
      if (sub.responses && Array.isArray(sub.responses)) {
        sub.responses.forEach((resp: any) => {
          if (resp.status === 'not_ok') {
            const rawTag = (resp.equipmentTag || '').trim();
            const rawName = (resp.equipmentName || '').trim();
            // Don't treat random doc IDs as tags
            const isTagValid = rawTag && rawTag !== 'S/T' && rawTag !== 'N/A' && !rawTag.startsWith('rec_') && rawTag.length < 30;
            const tag = isTagValid ? rawTag : '';
            const name = rawName || (tag ? `Equipamento ${tag}` : 'Equipamento');
            const key = (tag || name).toLowerCase().trim();
            if (key) {
              const line = sub.lineName || sub.templateName || '';
              if (!map.has(key)) {
                map.set(key, { tag: tag || 'S/T', name, line });
              } else if (tag && map.get(key)!.tag === 'S/T') {
                map.set(key, { tag, name, line });
              }
            }
          }
        });
      }
    });

    // 2. Scan maintenanceIssuesData
    maintenanceIssuesData.forEach(iss => {
      const rawTag = (iss.equipmentTag || '').trim();
      const rawName = (iss.equipmentName || '').trim();
      const isTagValid = rawTag && rawTag !== 'S/T' && rawTag !== 'N/A' && !rawTag.startsWith('rec_') && rawTag.length < 30;
      const tag = isTagValid ? rawTag : '';
      const name = rawName || (tag ? `Equipamento ${tag}` : 'Equipamento');
      const key = (tag || name).toLowerCase().trim();
      if (key) {
        const line = iss.line || '';
        if (!map.has(key)) {
          map.set(key, { tag: tag || 'S/T', name, line });
        } else if (tag && map.get(key)!.tag === 'S/T') {
          map.set(key, { tag, name, line });
        }
      }
    });

    let list = Array.from(map.values());

    // Contextualize by selected line if active
    if (filterLine !== 'all') {
      const selectedLineObj = lines.find(l => l.id === filterLine || l.name?.toLowerCase() === filterLine.toLowerCase());
      const targetLineName = (selectedLineObj ? selectedLineObj.name : filterLine).toLowerCase().trim();
      const filteredByLine = list.filter(eq => {
        if (!eq.line) return true;
        const eqLine = eq.line.toLowerCase().trim();
        return eqLine.includes(targetLineName) || targetLineName.includes(eqLine);
      });
      if (filteredByLine.length > 0) {
        list = filteredByLine;
      }
    }

    return list.sort((a, b) => {
      if (a.tag !== 'S/T' && b.tag !== 'S/T') {
        return a.tag.localeCompare(b.tag, 'pt-BR', { sensitivity: 'base' });
      }
      return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
    });
  }, [routeSubmissionsData, maintenanceIssuesData, filterLine, lines]);

  // Dynamic lines for pending equipments
  const availablePendingLines = useMemo(() => {
    const set = new Set<string>();
    lines.forEach(l => { if (l.name) set.add(l.name.trim()); });
    routeSubmissionsData.forEach(sub => {
      if (sub.lineName && sub.lineName.trim()) set.add(sub.lineName.trim());
      if (sub.templateName && sub.templateName.trim()) set.add(sub.templateName.trim());
    });
    maintenanceIssuesData.forEach(iss => {
      if (iss.line && iss.line.trim()) set.add(iss.line.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }, [lines, routeSubmissionsData, maintenanceIssuesData]);

  // Quick date presets
  const handleSetDatePreset = (preset: 'today' | 'yesterday' | 'week' | 'month' | 'all') => {
    if (preset === 'today') {
      setFilterDateStart(todayStr);
      setFilterDateEnd(todayStr);
    } else if (preset === 'yesterday') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const yStr = getLocalDateStrBR(y);
      setFilterDateStart(yStr);
      setFilterDateEnd(yStr);
    } else if (preset === 'week') {
      const w = new Date();
      w.setDate(w.getDate() - 6);
      setFilterDateStart(getLocalDateStrBR(w));
      setFilterDateEnd(todayStr);
    } else if (preset === 'month') {
      const m = new Date();
      m.setDate(1);
      setFilterDateStart(getLocalDateStrBR(m));
      setFilterDateEnd(todayStr);
    } else if (preset === 'all') {
      setFilterDateStart('');
      setFilterDateEnd('');
    }
  };

  const resetFilters = (keepDates = true) => {
    setFilterUser('');
    setFilterTheme('');
    setFilterShift('all');
    setFilterGroup('all');
    setFilterMood('all');
    setFilterStatus('all');
    setFilterLine('all');
    setFilterStopFront('all');
    setFilterStopActivity('');
    setFilterStopType('all');
    setFilterStopDuration('all');
    setFilterEquipment('all');
    if (!keepDates) {
      if (reportType === 'pending_equipments') {
        setFilterDateStart('');
        setFilterDateEnd('');
      } else {
        setFilterDateStart(todayStr);
        setFilterDateEnd(todayStr);
      }
    }
  };

  useEffect(() => {
    // When changing tabs, set appropriate date default and reset filters
    if (reportType === 'pending_equipments') {
      // For pending equipments, show all recent pendencies across the plant by default
      setFilterDateStart('');
      setFilterDateEnd('');
    } else {
      setFilterDateStart(todayStr);
      setFilterDateEnd(todayStr);
    }
    resetFilters(true);
  }, [reportType, todayStr]);

  // Populate cached users early for quick selection in modal
  useEffect(() => {
    const cached = getLocalCachedUsers()
      .filter(u => u.displayName && u.displayName !== 'Sem nome')
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
    if (cached.length > 0) {
      setAllUsers(cached.map(u => ({ id: u.uid, ...u })));
    }

    let unsubUsers = () => {};
    if (isAdmin || isMaster || isManager) {
      unsubUsers = subscribeToUsers((liveUsers) => {
        const usersList = liveUsers
          .filter(user => {
            const userEmail = user.email || '';
            if (userEmail === 'jacksonbjr@gmail.com') return false;
            return (!MASTER_EMAILS.includes(userEmail) || isMaster) && user.displayName !== 'Sem nome';
          })
          .sort((a, b) => a.displayName.localeCompare(b.displayName));
        setAllUsers(usersList.map(u => ({ id: u.uid, ...u })));
      });
    }

    return () => {
      unsubUsers();
    };
  }, [isManager, isAdmin, isMaster]);

  // Modular, date-bounded data fetcher for the active report tab
  const fetchReportData = useCallback(async (
    targetType: string,
    startDateStr: string,
    endDateStr: string,
    isManual = false
  ) => {
    if (!isManager) {
      setLoading(false);
      return;
    }

    if (isManual) setIsRefreshing(true);
    else setLoading(true);

    try {
      // Calculate Firestore Timestamps with a safe 4-hour timezone buffer
      let tsStart: Timestamp | null = null;
      let tsEnd: Timestamp | null = null;

      if (startDateStr) {
        const dStart = new Date(startDateStr + 'T00:00:00');
        dStart.setHours(dStart.getHours() - 4);
        tsStart = Timestamp.fromDate(dStart);
      }
      if (endDateStr) {
        const dEnd = new Date(endDateStr + 'T23:59:59.999');
        dEnd.setHours(dEnd.getHours() + 4);
        tsEnd = Timestamp.fromDate(dEnd);
      } else if (startDateStr) {
        const dEnd = new Date(startDateStr + 'T23:59:59.999');
        dEnd.setHours(dEnd.getHours() + 4);
        tsEnd = Timestamp.fromDate(dEnd);
      }

      // Role-based limits to optimize costs and prevent quota overrun
      const isPrivileged = isMaster || isAdmin;
      const ddsSigLimit = isPrivileged ? 500 : 150;
      const forkliftLimit = isPrivileged ? 350 : 100;
      const wireRecLimit = isPrivileged ? 250 : 80;
      const wireConsLimit = isPrivileged ? 350 : 100;
      const qualityLimit = isPrivileged ? 300 : 100;
      const pendingLimit = isPrivileged ? 250 : 80;
      const rayXLimit = isPrivileged ? 300 : 100;

      // Pre-load reference collections safely from local cache only when needed for active tab
      if (targetType === 'dds' || targetType === 'pending_equipments' || targetType === 'wire_consumption' || targetType === 'stops_control') {
        fetchReferenceCollection('production_lines').then(setLines);
      }
      if (targetType === 'wire_receiving' || targetType === 'wire_consumption') {
        fetchReferenceCollection('wire_suppliers').then(setSuppliers);
      }
      if (targetType === 'forklift') {
        fetchReferenceCollection('forklift_check_items', 'order').then((itemsList) => {
          setCheckItemsList(itemsList);
          const map: Record<string, string> = {};
          itemsList.forEach((it: any) => { map[it.id] = it.name; });
          setCheckItems(map);
        });
      }
      if (targetType === 'quality') {
        fetchReferenceCollection('quality_sectors').then(setQualitySectors);
      }

      // 1. DDS ON LINE
      if (targetType === 'dds') {
        const sigConstraints: any[] = [];
        if (tsStart) sigConstraints.push(where('timestamp', '>=', tsStart));
        if (tsEnd) sigConstraints.push(where('timestamp', '<=', tsEnd));
        sigConstraints.push(orderBy('timestamp', 'desc'));
        sigConstraints.push(limit(ddsSigLimit));

        // Get recent DDS sessions (last 3 days or matching range) so all active sessions for today are available in the lookup map
        const sessionConstraints: any[] = [];
        if (tsStart) {
          const dSessions = new Date(tsStart.toDate().getTime() - 72 * 60 * 60 * 1000);
          sessionConstraints.push(where('createdAt', '>=', Timestamp.fromDate(dSessions)));
        }
        if (tsEnd) {
          sessionConstraints.push(where('createdAt', '<=', tsEnd));
        }
        sessionConstraints.push(orderBy('createdAt', 'desc'));
        sessionConstraints.push(limit(isPrivileged ? 150 : 50));

        const [signaturesSnap, sessionsSnap] = await Promise.all([
          getDocs(query(collection(db, 'dds_signatures'), ...sigConstraints)),
          getDocs(query(collection(db, 'dds_sessions'), ...sessionConstraints))
        ]);

        const sessions: Record<string, any> = {};
        const sessionsList = await Promise.all(sessionsSnap.docs.map(async (sDoc) => {
          const sData = sDoc.data();
          const rawExec = sData.executor || sData.executante || sData.responsavel || sData.facilitador || sData.instrutor || '';
          const rawCreatedByName = sData.createdByName || sData.creatorName || '';
          
          const [decTitle, decExec, decCreatedByName] = await Promise.all([
            decryptValue(sData.title),
            rawExec ? decryptValue(rawExec) : Promise.resolve(''),
            rawCreatedByName ? decryptValue(rawCreatedByName) : Promise.resolve('')
          ]);

          const sessionObj = {
            ...sData,
            id: sDoc.id,
            title: decTitle || sData.title,
            executor: decExec || rawExec || '',
            createdByName: decCreatedByName || rawCreatedByName || '',
            createdBy: sData.createdBy || '',
            shift: sData.shift || '-',
            group: sData.group || '-',
            totalPrevisto: Number(sData.totalPrevisto) || 0,
            createdAt: safeToDate(sData.createdAt) || safeToDate(sData.date) || new Date()
          };
          sessions[sDoc.id] = sessionObj;
          return sessionObj;
        }));
        setDdsSessionsData(sessionsList);

        const currentOrphans: string[] = [];
        const ddsResults = await Promise.all(signaturesSnap.docs.map(async (doc) => {
          const sig = doc.data();
          const session = sessions[sig.sessionId];
          if (!session) {
            currentOrphans.push(doc.id);
          }

          const rawSigExec = !session?.executor ? (sig.executor || '') : '';
          const [decName, decSigExec] = await Promise.all([
            decryptValue(sig.userName),
            rawSigExec ? decryptValue(rawSigExec) : Promise.resolve('')
          ]);
          const finalExecutor = session?.executor || decSigExec || sig.executor || '-';

          return {
            id: doc.id,
            sessionId: sig.sessionId,
            userId: sig.userId || '',
            userName: decName || 'Desconhecido',
            registration: sig.registration || '',
            sessionTitle: sig.sessionTitle || session?.title || 'Sessão Removida (Órfão)',
            shift: session?.shift || '-',
            group: session?.group || '-',
            executor: finalExecutor,
            createdByName: session?.createdByName || '-',
            createdBy: session?.createdBy || '',
            mood: sig.mood || '-',
            timestamp: safeToDate(sig.timestamp) || new Date(),
            isOrphan: !session
          };
        }));

        setOrphanIds(currentOrphans);
        setData(ddsResults);
      }

      // 2. FORKLIFT (EMPILHADEIRAS)
      else if (targetType === 'forklift') {
        const constraints: any[] = [];
        if (tsStart) constraints.push(where('timestamp', '>=', tsStart));
        if (tsEnd) constraints.push(where('timestamp', '<=', tsEnd));
        constraints.push(orderBy('timestamp', 'desc'));
        constraints.push(limit(forkliftLimit));

        const forkliftSnap = await getDocs(query(collection(db, 'forklift_checklists'), ...constraints));
        const forkliftResults = await Promise.all(forkliftSnap.docs.map(async (doc) => {
          const check = doc.data();
          const decConductor = await decryptValue(check.conductorName);
          return {
            id: doc.id,
            forkliftNumber: check.forkliftNumber,
            conductorName: decConductor || check.conductorName,
            status: check.status,
            shift: check.shift,
            group: check.group,
            timestamp: safeToDate(check.timestamp) || new Date(),
            itemResults: check.itemResults || {},
            notes: check.notes || '',
            mediaUrl: check.mediaUrl || ''
          };
        }));
        setForkliftData(forkliftResults);
      }

      // 3. WIRE RECEIVING (RECEBIMENTO DE ARAME)
      else if (targetType === 'wire_receiving') {
        const constraints: any[] = [];
        if (tsStart) constraints.push(where('createdAt', '>=', tsStart));
        if (tsEnd) constraints.push(where('createdAt', '<=', tsEnd));
        constraints.push(orderBy('createdAt', 'desc'));
        constraints.push(limit(wireRecLimit));

        const batchesSnap = await getDocs(query(collection(db, 'wire_batches'), ...constraints));
        const batchesResults = batchesSnap.docs.map(doc => {
          const batch = doc.data();
          return {
            id: doc.id,
            nfNumber: batch.nfNumber,
            supplierName: batch.supplierName,
            supplierId: batch.supplierId,
            date: batch.date,
            totalWeight: batch.totalWeight,
            coilsCount: batch.coilsCount,
            responsibleName: batch.responsibleName || 'Sistema',
            timestamp: safeToDate(batch.createdAt) || new Date(batch.date),
          };
        });
        setWireReceivingData(batchesResults);
      }

      // 4. WIRE CONSUMPTION (CONSUMO DE ARAME)
      else if (targetType === 'wire_consumption') {
        const constraints: any[] = [];
        if (tsStart) constraints.push(where('consumedAt', '>=', tsStart));
        if (tsEnd) constraints.push(where('consumedAt', '<=', tsEnd));
        constraints.push(limit(wireConsLimit));

        const coilsSnap = await getDocs(query(collection(db, 'wire_coils'), ...constraints));
        const coilsResults = coilsSnap.docs
          .map(doc => {
            const coil = doc.data();
            return {
              id: doc.id,
              coilNumber: coil.coilNumber,
              diameter: coil.diameter,
              weight: coil.weight,
              currentLineId: coil.currentLineId,
              consumedBy: coil.consumedBy,
              consumedShift: coil.consumedShift,
              timestamp: safeToDate(coil.consumedAt) || new Date(),
              supplierId: coil.supplierId,
              consumedByGroup: coil.consumedByGroup || '-',
              status: coil.status,
              consumedAt: coil.consumedAt
            };
          })
          .filter(coil => coil.status === 'consumed')
          .sort((a, b) => {
            const tA = a.consumedAt?.seconds || (a.consumedAt ? new Date(a.consumedAt).getTime() / 1000 : 0);
            const tB = b.consumedAt?.seconds || (b.consumedAt ? new Date(b.consumedAt).getTime() / 1000 : 0);
            return tB - tA;
          });
        setWireConsumptionData(coilsResults);
      }

      // 5. QUALITY (QUALIDADE)
      else if (targetType === 'quality') {
        const constraints: any[] = [];
        if (tsStart) constraints.push(where('createdAt', '>=', tsStart));
        if (tsEnd) constraints.push(where('createdAt', '<=', tsEnd));
        constraints.push(orderBy('createdAt', 'desc'));
        constraints.push(limit(qualityLimit));

        const [qualitySnap, templatesList] = await Promise.all([
          getDocs(query(collection(db, 'quality_checklist_submissions'), ...constraints)),
          fetchReferenceCollection('quality_checklist_templates')
        ]);
        const templatesMap: Record<string, any> = {};
        templatesList.forEach((it: any) => { templatesMap[it.id] = it; });
        setQualityTemplates(templatesMap);

        const qualityResults = await Promise.all(qualitySnap.docs.map(async (doc) => {
          const sub = doc.data();
          const decName = await decryptValue(sub.userName);
          return {
            id: doc.id,
            templateId: sub.templateId,
            templateName: templatesMap[sub.templateId]?.name || 'Modelo Excluído',
            sectorId: sub.sectorId,
            lineId: sub.lineId,
            userId: sub.userId,
            userName: decName,
            shift: sub.shift,
            responses: sub.responses || [],
            timestamp: safeToDate(sub.createdAt) || new Date()
          };
        }));
        setQualityData(qualityResults);
      }

      // 6. PENDING EQUIPMENTS / ROUTES & MAINTENANCE ISSUES
      else if (targetType === 'pending_equipments') {
        const pendingFetchLimit = isPrivileged ? 500 : 300;
        let routesList: any[] = [];
        try {
          const constraints: any[] = [];
          if (tsStart) constraints.push(where('createdAt', '>=', tsStart));
          if (tsEnd) constraints.push(where('createdAt', '<=', tsEnd));
          constraints.push(orderBy('createdAt', 'desc'));
          constraints.push(limit(pendingFetchLimit));

          const routesSnap = await getDocs(query(collection(db, 'route_submissions'), ...constraints));
          routesList = routesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (rErr) {
          console.warn("Primary route_submissions query failed, using fallback ordered query:", rErr);
          try {
            const fallbackSnap = await getDocs(query(collection(db, 'route_submissions'), orderBy('createdAt', 'desc'), limit(pendingFetchLimit)));
            routesList = fallbackSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          } catch (fErr) {
            console.error("Fallback route_submissions query failed:", fErr);
          }
        }
        setRouteSubmissionsData(routesList);

        // Also fetch issues from maintenance_issues
        let issuesList: any[] = [];
        try {
          const issuesSnap = await getDocs(query(collection(db, 'maintenance_issues'), orderBy('createdAt', 'desc'), limit(pendingFetchLimit)));
          issuesList = issuesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (mErr) {
          try {
            const fallbackSnap = await getDocs(query(collection(db, 'maintenance_issues'), limit(pendingFetchLimit)));
            issuesList = fallbackSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          } catch (mErr2) {
            console.warn("Could not fetch maintenance_issues for pending report:", mErr2);
          }
        }
        setMaintenanceIssuesData(issuesList);
      }

      // 7. USER RAY-X (RAIO-X DO USUÁRIO)
      else if (targetType === 'user_ray_x' && (isAdmin || isMaster || isManager)) {
        const rayLimit = isPrivileged ? 1000 : 500;

        // 1. Force refresh live users to ensure latest accessCount and lastLoginAt
        try {
          const freshUsers = await fetchUsersSafely(true);
          if (freshUsers && freshUsers.length > 0) {
            const usersList = freshUsers
              .filter(u => {
                const uEmail = u.email || '';
                if (uEmail === 'jacksonbjr@gmail.com') return false;
                return (!MASTER_EMAILS.includes(uEmail) || isMaster) && u.displayName !== 'Sem nome';
              })
              .sort((a, b) => a.displayName.localeCompare(b.displayName));
            setAllUsers(usersList.map(u => ({ id: u.uid, ...u })));
          }
        } catch (uErr) {
          console.warn('Error refreshing users list for Ray-X:', uErr);
        }

        // 2. Fetch DDS Signatures and Sessions for participation and creation tracking
        try {
          const [sigSnap, sesSnap] = await Promise.all([
            getDocs(query(collection(db, 'dds_signatures'), orderBy('timestamp', 'desc'), limit(rayLimit))).catch(() => getDocs(query(collection(db, 'dds_signatures'), limit(rayLimit)))),
            getDocs(query(collection(db, 'dds_sessions'), orderBy('createdAt', 'desc'), limit(rayLimit))).catch(() => getDocs(query(collection(db, 'dds_sessions'), limit(rayLimit))))
          ]);

          const sessions: Record<string, any> = {};
          const sessionsList = await Promise.all(sesSnap.docs.map(async (sDoc) => {
            const sData = sDoc.data();
            const rawExec = sData.executor || sData.executante || sData.responsavel || sData.facilitador || sData.instrutor || '';
            const rawCreatedByName = sData.createdByName || sData.creatorName || '';
            const [decTitle, decExec, decCreatedByName] = await Promise.all([
              decryptValue(sData.title),
              rawExec ? decryptValue(rawExec) : Promise.resolve(''),
              rawCreatedByName ? decryptValue(rawCreatedByName) : Promise.resolve('')
            ]);
            const sessionObj = {
              ...sData,
              id: sDoc.id,
              title: decTitle || sData.title,
              executor: decExec || rawExec || '',
              createdByName: decCreatedByName || rawCreatedByName || '',
              createdBy: sData.createdBy || '',
              shift: sData.shift || '-',
              group: sData.group || '-',
              totalPrevisto: Number(sData.totalPrevisto) || 0,
              createdAt: safeToDate(sData.createdAt) || safeToDate(sData.date) || new Date()
            };
            sessions[sDoc.id] = sessionObj;
            return sessionObj;
          }));
          setDdsSessionsData(sessionsList);

          const ddsResults = await Promise.all(sigSnap.docs.map(async (doc) => {
            const sig = doc.data();
            const session = sessions[sig.sessionId];
            const rawSigExec = !session?.executor ? (sig.executor || '') : '';
            const [decName, decSigExec] = await Promise.all([
              decryptValue(sig.userName),
              rawSigExec ? decryptValue(rawSigExec) : Promise.resolve('')
            ]);
            return {
              id: doc.id,
              sessionId: sig.sessionId,
              userId: sig.userId || '',
              userName: decName || 'Desconhecido',
              registration: sig.registration || '',
              sessionTitle: sig.sessionTitle || session?.title || 'Sessão',
              shift: session?.shift || '-',
              group: session?.group || '-',
              executor: session?.executor || decSigExec || sig.executor || '-',
              createdByName: session?.createdByName || '-',
              createdBy: session?.createdBy || '',
              mood: sig.mood || '-',
              timestamp: safeToDate(sig.timestamp) || new Date(),
              isOrphan: !session
            };
          }));
          setData(ddsResults);
        } catch (ddsErr) {
          console.warn('Error loading DDS activities for Ray-X:', ddsErr);
        }

        // 3. Fetch Quality Inspections
        try {
          const qualitySnap = await getDocs(query(collection(db, 'quality_checklist_submissions'), orderBy('createdAt', 'desc'), limit(rayLimit))).catch(() => getDocs(query(collection(db, 'quality_checklist_submissions'), limit(rayLimit))));
          const qualityResults = await Promise.all(qualitySnap.docs.map(async (doc) => {
            const sub = doc.data();
            const decName = await decryptValue(sub.userName);
            return {
              id: doc.id,
              templateId: sub.templateId,
              templateName: sub.templateName || 'Inspeção de Linha',
              sectorId: sub.sectorId,
              lineId: sub.lineId,
              userId: sub.userId,
              userName: decName || sub.userName,
              shift: sub.shift,
              responses: sub.responses || [],
              timestamp: safeToDate(sub.createdAt) || new Date()
            };
          }));
          setQualityData(qualityResults);
        } catch (qErr) {
          console.warn('Error loading quality activities for Ray-X:', qErr);
        }

        // 4. Fetch Operational Routes, Forklift Inspections, Safety Observations, Stops, and Maintenance Issues
        try {
          const [routesSnap, safetySnap, forkliftSnap, stopsSnap, issuesSnap] = await Promise.all([
            getDocs(query(collection(db, 'route_submissions'), orderBy('createdAt', 'desc'), limit(rayLimit))).catch(() => getDocs(query(collection(db, 'route_submissions'), limit(rayLimit)))),
            getDocs(query(collection(db, 'safety_observations'), orderBy('createdAt', 'desc'), limit(rayLimit))).catch(() => getDocs(query(collection(db, 'safety_observations'), limit(rayLimit)))),
            getDocs(query(collection(db, 'forklift_checklists'), orderBy('timestamp', 'desc'), limit(rayLimit))).catch(() => getDocs(query(collection(db, 'forklift_checklists'), limit(rayLimit)))),
            getDocs(query(collection(db, 'stops_reports'), orderBy('date', 'desc'), limit(rayLimit))).catch(() => getDocs(query(collection(db, 'stops_reports'), limit(rayLimit)))),
            getDocs(query(collection(db, 'maintenance_issues'), orderBy('createdAt', 'desc'), limit(rayLimit))).catch(() => getDocs(query(collection(db, 'maintenance_issues'), limit(rayLimit))))
          ]);

          setRouteSubmissionsData(routesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
          setSafetyObservationsData(safetySnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

          const forkliftResults = await Promise.all(forkliftSnap.docs.map(async (doc) => {
            const check = doc.data();
            const decConductor = await decryptValue(check.conductorName);
            return {
              id: doc.id,
              forkliftNumber: check.forkliftNumber,
              conductorName: decConductor || check.conductorName,
              conductorId: check.conductorId || check.userId,
              status: check.status,
              shift: check.shift,
              group: check.group,
              timestamp: safeToDate(check.timestamp) || new Date(),
              itemResults: check.itemResults || {},
              notes: check.notes || '',
              mediaUrl: check.mediaUrl || ''
            };
          }));
          setForkliftData(forkliftResults);
          setStopsData(stopsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
          setMaintenanceIssuesData(issuesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (actErr) {
          console.warn('Error loading operational module activities for Ray-X:', actErr);
        }

        // 5. Fetch Login Logs
        try {
          const logsSnap = await getDocs(query(collection(db, 'user_login_logs'), orderBy('timestamp', 'desc'), limit(rayLimit))).catch(() => getDocs(query(collection(db, 'user_login_logs'), limit(rayLimit))));
          const processedLogs = await Promise.all(
            logsSnap.docs.map(async (docSnap) => {
              const d = docSnap.data();
              let email = d.email || '';
              let displayName = d.displayName || '';
              try {
                if (email && typeof email === 'string' && email.startsWith('enc_')) {
                  email = await decryptValue(email);
                }
                if (displayName && typeof displayName === 'string' && displayName.startsWith('enc_')) {
                  displayName = await decryptValue(displayName);
                }
              } catch (_) {}
              return { id: docSnap.id, ...d, email, displayName };
            })
          );
          setUserLoginLogsData(processedLogs);
        } catch (e) {
          console.warn('Error loading user_login_logs:', e);
        }

        // 6. Fetch Feedback Surveys
        try {
          const surveySnap = await getDocs(collection(db, 'app_feedback_surveys'));
          setFeedbackSurveysData(surveySnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (e) {}
      }

      // 8. STOPS CONTROL (CONTROLE DE PARADA / CONSOLIDADO)
      else if (targetType === 'stops_control') {
        const stopsLimit = isPrivileged ? 450 : 180;
        try {
          const constraints: any[] = [];
          if (startDateStr) constraints.push(where('date', '>=', startDateStr));
          if (endDateStr) constraints.push(where('date', '<=', endDateStr));
          constraints.push(orderBy('date', 'desc'));
          constraints.push(limit(stopsLimit));

          const stopsSnap = await getDocs(query(collection(db, 'stops_reports'), ...constraints));
          const stopsList = stopsSnap.docs.map(docSnap => ({
            id: docSnap.id,
            ...docSnap.data()
          } as StopReport));
          setStopsData(stopsList);
        } catch (queryErr) {
          console.warn('Index or filter error on stops_reports, falling back to basic query:', queryErr);
          const fallbackSnap = await getDocs(query(collection(db, 'stops_reports'), orderBy('date', 'desc'), limit(stopsLimit)));
          const stopsList = fallbackSnap.docs.map(docSnap => ({
            id: docSnap.id,
            ...docSnap.data()
          } as StopReport));
          setStopsData(stopsList);
        }
      }

      setLastRefreshedAt(new Date());
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, targetType === 'dds' ? 'dds_signatures' : (targetType === 'stops_control' ? 'stops_reports' : targetType));
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [isManager, isAdmin, isMaster]);

  useEffect(() => {
    fetchReportData(reportType, filterDateStart, filterDateEnd);
  }, [reportType, filterDateStart, filterDateEnd, fetchReportData]);

  const handleManualRefresh = () => {
    fetchReportData(reportType, filterDateStart, filterDateEnd, true);
  };

  const handleSaveExecutor = async () => {
    if (!editingExecutorModal) return;
    try {
      setIsSavingExecutor(true);
      const sessionRef = doc(db, 'dds_sessions', editingExecutorModal.sessionId);
      await updateDoc(sessionRef, {
        executor: newExecutorValue.trim(),
        updatedAt: serverTimestamp()
      });

      // Update data in local state so report updates immediately
      setData(prev => prev.map(item => {
        if (item.sessionId === editingExecutorModal.sessionId) {
          return { ...item, executor: newExecutorValue.trim() || '-' };
        }
        return item;
      }));

      setExecutorUpdateSuccess(`Executante atualizado para "${newExecutorValue.trim()}" com sucesso!`);
      setTimeout(() => setExecutorUpdateSuccess(null), 4000);
      setEditingExecutorModal(null);
    } catch (err: any) {
      console.error('Erro ao atualizar executante:', err);
      alert('Erro ao atualizar executante: ' + (err.message || 'Falha na gravação.'));
    } finally {
      setIsSavingExecutor(false);
    }
  };

  const handleCleanupOrphans = async (confirmed = false) => {
    if (orphanIds.length === 0) return;

    if (!confirmed) {
      setShowCleanupConfirm(true);
      return;
    }

    setCleaningUp(true);
    try {
      const { deleteDoc, doc } = await import('firebase/firestore');
      for (const id of orphanIds) {
        await deleteDoc(doc(db, 'dds_signatures', id));
      }
      // Refresh data
      window.location.reload();
    } catch (err) {
      console.error("Error during cleanup:", err);
      setModalConfig({
        isOpen: true,
        title: 'Erro na Limpeza',
        message: 'Ocorreu um erro ao realizar a limpeza dos registros órfãos.',
        type: 'error'
      });
    } finally {
      setCleaningUp(false);
      setShowCleanupConfirm(false);
    }
  };

  const filteredData = useMemo(() => {
    let dataSource: any[] = [];
    if (reportType === 'dds') dataSource = data;
    else if (reportType === 'forklift') dataSource = forkliftData;
    else if (reportType === 'wire_receiving') dataSource = wireReceivingData;
    else if (reportType === 'wire_consumption') dataSource = wireConsumptionData;
    else if (reportType === 'quality') dataSource = qualityData;
    else if (reportType === 'stops_control') dataSource = stopsData;
    else if (reportType === 'pending_equipments') {
      const pendingList: any[] = [];
      routeSubmissionsData.forEach(sub => {
        if (sub.responses && Array.isArray(sub.responses)) {
          sub.responses.forEach((resp: any, respIdx: number) => {
            if (resp.status === 'not_ok') {
              const rawTag = (resp.equipmentTag || '').trim();
              const isTagValid = rawTag && rawTag !== 'S/T' && rawTag !== 'N/A' && !rawTag.startsWith('rec_') && rawTag.length < 30;
              const tag = isTagValid ? rawTag : '';
              const name = (resp.equipmentName || (tag ? `Equipamento ${tag}` : 'Equipamento')).trim();
              pendingList.push({
                id: `${sub.id}_${resp.equipmentId || 'noeq'}_${respIdx}`,
                submissionId: sub.id,
                date: safeToDate(sub.createdAt) || new Date(),
                tag: tag || 'S/T',
                name: name,
                equipmentId: resp.equipmentId || '',
                line: sub.lineName || sub.templateName || 'Geral',
                lineId: sub.lineId || '',
                area: sub.areaName || 'Área',
                sector: sub.sectorName || 'Setor',
                operator: sub.operatorName || 'Operador',
                diagnostic: resp.diagnostic || '',
                notes: resp.notes || '',
                reason: resp.diagnostic || resp.notes || 'Anomalia não detalhada',
                schedule: resp.schedule || '',
                sapNote: resp.sapNote || '',
                actionTaken: resp.actionTaken || '',
                responsibleCenter: resp.responsibleCenter || '',
                inspectionType: resp.inspectionType || '',
                photoUrl: resp.photoUrl || '',
                videoUrl: resp.videoUrl || '',
                timestamp: safeToDate(sub.createdAt) || new Date(),
                shift: sub.shift || '-',
                group: sub.team || sub.group || '-',
              });
            }
          });
        }
      });

      // Also merge issues from maintenance_issues collection
      maintenanceIssuesData.forEach(iss => {
        const issSubId = iss.submissionId || '';
        const issDate = safeToDate(iss.createdAt) || safeToDate(iss.date) || new Date();
        const rawTag = (iss.equipmentTag || '').trim();
        const isTagValid = rawTag && rawTag !== 'S/T' && rawTag !== 'N/A' && !rawTag.startsWith('rec_') && rawTag.length < 30;
        const issTag = isTagValid ? rawTag : '';
        const issName = (iss.equipmentName || (issTag ? `Equipamento ${issTag}` : 'Equipamento')).trim();

        // Prevent duplicate if already added from route submissions
        const isDuplicate = pendingList.some(p => 
          (issSubId && p.submissionId === issSubId && (p.tag === issTag || p.name === issName))
        );

        if (!isDuplicate) {
          pendingList.push({
            id: iss.id,
            submissionId: issSubId,
            date: issDate,
            tag: issTag || 'S/T',
            name: issName,
            equipmentId: iss.equipmentId || '',
            line: iss.line || 'Geral',
            lineId: iss.lineId || '',
            area: iss.area || 'Área',
            sector: iss.sector || 'Setor',
            operator: iss.creatorName || iss.createdByName || iss.operatorName || 'Manutenção',
            diagnostic: iss.diagnostic || '',
            notes: iss.description || iss.notes || '',
            reason: iss.diagnostic || iss.description || iss.notes || 'Pendência de Manutenção',
            schedule: iss.schedule || '',
            sapNote: iss.sapNote || '',
            actionTaken: iss.actionTaken || '',
            responsibleCenter: iss.responsibleCenter || '',
            inspectionType: iss.inspectionType || '',
            photoUrl: (iss.attachments && iss.attachments[0]) || iss.photoUrl || '',
            videoUrl: iss.videoUrl || '',
            timestamp: issDate,
            shift: iss.shift || '-',
            group: iss.teamLetter || iss.group || iss.team || '-',
            status: iss.status || 'pending',
          });
        }
      });

      dataSource = pendingList;
    }
    
    return dataSource.filter(item => {
      // Specialized filtering for Stops Control (Controle de Paradas)
      if (reportType === 'stops_control') {
        const stopItem = item as StopReport;
        const durationMinutes = getMinutesDiff(stopItem.startTime, stopItem.endTime);

        // 1. Tipo de Parada
        const matchType = filterStopType === 'all' || stopItem.type === filterStopType;

        // 2. Linha de Produção
        let matchStopLine = true;
        if (filterLine !== 'all') {
          const selectedLineObj = lines.find(l => l.id === filterLine);
          const targetLineName = selectedLineObj ? selectedLineObj.name.toLowerCase() : filterLine.toLowerCase();
          const itemLineName = (stopItem.lineName || stopItem.lineId || '').toLowerCase();
          matchStopLine = itemLineName.includes(targetLineName) || stopItem.lineId === filterLine;
        }

        // 3. Frentes de Trabalho
        let matchFront = true;
        if (filterStopFront !== 'all') {
          matchFront = Array.isArray(stopItem.workFronts) && stopItem.workFronts.some(
            wf => (wf.front || '').toLowerCase().trim() === filterStopFront.toLowerCase().trim()
          );
        }

        // 4. Atividades que foram realizadas
        let matchActivity = true;
        if (filterStopActivity && filterStopActivity.trim()) {
          const actQuery = filterStopActivity.toLowerCase().trim();
          matchActivity = (
            (stopItem.observation || '').toLowerCase().includes(actQuery) ||
            (Array.isArray(stopItem.workFronts) && stopItem.workFronts.some(
              wf => (wf.description || '').toLowerCase().includes(actQuery) || (wf.front || '').toLowerCase().includes(actQuery)
            ))
          );
        }

        // 5. Duração
        let matchDuration = true;
        if (filterStopDuration === 'up_to_30') {
          matchDuration = durationMinutes <= 30;
        } else if (filterStopDuration === '30_to_60') {
          matchDuration = durationMinutes > 30 && durationMinutes <= 60;
        } else if (filterStopDuration === '60_to_120') {
          matchDuration = durationMinutes > 60 && durationMinutes <= 120;
        } else if (filterStopDuration === '120_to_240') {
          matchDuration = durationMinutes > 120 && durationMinutes <= 240;
        } else if (filterStopDuration === 'over_240') {
          matchDuration = durationMinutes > 240;
        }

        // 6. Colaborador / Responsável / Busca Geral
        let matchStopUser = true;
        if (filterUser && filterUser.trim()) {
          const uQuery = filterUser.toLowerCase().trim();
          matchStopUser = (
            (stopItem.userName || '').toLowerCase().includes(uQuery) ||
            (stopItem.lineName || stopItem.lineId || '').toLowerCase().includes(uQuery) ||
            (stopItem.observation || '').toLowerCase().includes(uQuery)
          );
        }

        // 7. Dia da Execução
        let matchDate = true;
        const itemDateStr = stopItem.date || (stopItem.createdAt ? getLocalDateStrBR(safeToDate(stopItem.createdAt)) : '');
        if (filterDateStart && itemDateStr && itemDateStr < filterDateStart) {
          matchDate = false;
        }
        if (filterDateEnd && itemDateStr && itemDateStr > filterDateEnd) {
          matchDate = false;
        }

        return matchType && matchStopLine && matchFront && matchActivity && matchDuration && matchStopUser && matchDate;
      }

      let matchUser = true;
      if (reportType === 'dds') {
        matchUser = (!filterUser || item.userName.toLowerCase().includes(filterUser.toLowerCase()) || item.executor.toLowerCase().includes(filterUser.toLowerCase()));
      } else if (reportType === 'forklift') {
        matchUser = (!filterUser || item.conductorName.toLowerCase().includes(filterUser.toLowerCase()) || item.forkliftNumber.toLowerCase().includes(filterUser.toLowerCase()));
      } else if (reportType === 'quality') {
        matchUser = (!filterUser || item.userName.toLowerCase().includes(filterUser.toLowerCase()) || (item.templateName || '').toLowerCase().includes(filterUser.toLowerCase()));
      } else if (reportType === 'wire_receiving') {
        matchUser = (!filterUser || item.nfNumber.toLowerCase().includes(filterUser.toLowerCase()) || item.supplierName.toLowerCase().includes(filterUser.toLowerCase()));
      } else if (reportType === 'wire_consumption') {
        matchUser = (!filterUser || item.coilNumber.toLowerCase().includes(filterUser.toLowerCase()) || (item.consumedBy || '').toLowerCase().includes(filterUser.toLowerCase()));
      } else if (reportType === 'pending_equipments') {
        if (!filterUser || !filterUser.trim()) {
          matchUser = true;
        } else {
          const q = filterUser.toLowerCase().trim();
          matchUser = (item.name || '').toLowerCase().includes(q) || 
                      (item.tag || '').toLowerCase().includes(q) ||
                      (item.operator || '').toLowerCase().includes(q) ||
                      (item.reason || '').toLowerCase().includes(q) ||
                      (item.notes || '').toLowerCase().includes(q) ||
                      (item.diagnostic || '').toLowerCase().includes(q) ||
                      (item.line || '').toLowerCase().includes(q) ||
                      (item.area || '').toLowerCase().includes(q) ||
                      (item.sector || '').toLowerCase().includes(q) ||
                      (item.sapNote || '').toLowerCase().includes(q) ||
                      (item.responsibleCenter || '').toLowerCase().includes(q) ||
                      (item.inspectionType || '').toLowerCase().includes(q) ||
                      (item.actionTaken || '').toLowerCase().includes(q);
        }
      }

      // Filter by specific equipment with pendency from dropdown
      let matchEquipment = true;
      if (reportType === 'pending_equipments' && filterEquipment && filterEquipment !== 'all') {
        const targetEq = filterEquipment.toLowerCase().trim();
        const itemTag = (item.tag || '').toLowerCase().trim();
        const itemName = (item.name || '').toLowerCase().trim();
        const itemId = (item.equipmentId || '').toLowerCase().trim();
        matchEquipment = (
          itemTag === targetEq || 
          itemName === targetEq || 
          (targetEq !== 's/t' && targetEq !== 'n/a' && itemTag.length > 1 && itemTag.includes(targetEq)) || 
          (targetEq !== 's/t' && targetEq !== 'n/a' && itemName.length > 1 && itemName.includes(targetEq)) || 
          (targetEq !== 's/t' && targetEq !== 'n/a' && targetEq.includes(itemName) && itemName.length > 3) ||
          itemId === targetEq
        );
      }
      
      let matchThemeOrStatus = true;
      if (reportType === 'dds') {
        matchThemeOrStatus = (!filterTheme || item.sessionTitle.toLowerCase().includes(filterTheme.toLowerCase()));
      } else if (reportType === 'forklift') {
        matchThemeOrStatus = (filterStatus === 'all' || item.status === filterStatus);
      }
      
      let matchShift = true;
      if (reportType === 'dds' || reportType === 'forklift' || reportType === 'pending_equipments') {
        matchShift = filterShift === 'all' || item.shift === filterShift;
      } else if (reportType === 'wire_consumption') {
        matchShift = filterShift === 'all' || item.consumedShift === filterShift;
      }

      let matchGroup = true;
      if (reportType === 'dds' || reportType === 'forklift' || reportType === 'pending_equipments') {
        matchGroup = filterGroup === 'all' || item.group === filterGroup;
      } else if (reportType === 'wire_consumption') {
        matchGroup = filterGroup === 'all' || item.consumedByGroup === filterGroup;
      }

      let matchLine = true;
      if (reportType === 'wire_consumption') {
        matchLine = filterLine === 'all' || item.currentLineId === filterLine;
      } else if (reportType === 'pending_equipments') {
        if (filterLine !== 'all') {
          const selectedLineObj = lines.find(l => l.id === filterLine || l.name?.toLowerCase() === filterLine.toLowerCase());
          const targetLineName = (selectedLineObj ? selectedLineObj.name : filterLine).toLowerCase().trim();
          const itemLine = (item.line || '').toLowerCase().trim();
          const itemLineId = (item.lineId || '').toLowerCase().trim();
          matchLine = itemLine === targetLineName || 
                      itemLine.includes(targetLineName) || 
                      targetLineName.includes(itemLine) ||
                      (itemLineId && itemLineId === filterLine.toLowerCase().trim());
        }
      } else if (reportType === 'quality') {
        if (filterLine === 'all') {
          matchLine = true;
        } else if (filterLine === 'all_factory') {
          matchLine = item.sectorId === 'all';
        } else {
          // 1. Direct match (selected filter is the item's line or the item's sector)
          if (item.lineId === filterLine || item.sectorId === filterLine) {
            matchLine = true;
          } else {
            // 2. If the user selected a sector in the filter, check if the item's line is in that sector
            const selectedSector = qualitySectors.find(s => s.id === filterLine);
            if (selectedSector && item.lineId) {
              matchLine = selectedSector.lineIds.includes(item.lineId);
            } else {
              matchLine = false;
            }
          }
        }
      }

      const matchMood = reportType === 'dds' ? (filterMood === 'all' || item.mood === filterMood) : true;
      
      const itemDate = item.timestamp;
      let matchDate = true;
      if (filterDateStart || filterDateEnd) {
        const itemLocalDate = getLocalDateStrBR(itemDate);
        if (filterDateStart && itemLocalDate < filterDateStart) {
          matchDate = false;
        }
        if (filterDateEnd && itemLocalDate > filterDateEnd) {
          matchDate = false;
        }
      }

      return matchUser && matchEquipment && matchThemeOrStatus && matchShift && matchGroup && matchLine && matchMood && matchDate;
    });
  }, [data, forkliftData, wireReceivingData, wireConsumptionData, qualityData, routeSubmissionsData, maintenanceIssuesData, stopsData, lines, reportType, filterUser, filterEquipment, filterTheme, filterShift, filterGroup, filterLine, filterMood, filterStatus, filterStopFront, filterStopActivity, filterStopType, filterStopDuration, filterDateStart, filterDateEnd]);

  const stopsStats = useMemo(() => {
    if (reportType !== 'stops_control') return { total: 0, totalMinutes: 0, totalFronts: 0, predominantType: '-' };
    const total = filteredData.length;
    let totalMinutes = 0;
    let totalFronts = 0;
    const typeCounts: Record<string, number> = {};

    filteredData.forEach((item: StopReport) => {
      const mins = getMinutesDiff(item.startTime, item.endTime);
      totalMinutes += mins;
      if (item.workFronts && Array.isArray(item.workFronts)) {
        totalFronts += item.workFronts.length;
      }
      if (item.type) {
        typeCounts[item.type] = (typeCounts[item.type] || 0) + 1;
      }
    });

    let predominantType = '-';
    let maxCount = 0;
    Object.entries(typeCounts).forEach(([type, count]) => {
      if (count > maxCount) {
        maxCount = count;
        predominantType = getStopTypeLabel(type);
      }
    });

    return { total, totalMinutes, totalFronts, predominantType };
  }, [filteredData, reportType]);

  const selectedUserData = useMemo(() => {
    if (!selectedRayXUser) return null;
    const matchedUser = allUsers.find(u => u.uid === selectedRayXUser || u.id === selectedRayXUser);
    if (!matchedUser) return null;

    const uName = (matchedUser.displayName || matchedUser.name || '').trim().toLowerCase();
    const uEmail = (matchedUser.email || '').trim().toLowerCase();
    const uId = matchedUser.uid || matchedUser.id;
    const uReg = (matchedUser.registration || matchedUser.matricula || '').trim();

    const isMatch = (rId?: string, rName?: string, rEmail?: string, rReg?: string) => {
      if (rId && (rId === uId || (matchedUser.uid && rId === matchedUser.uid))) return true;
      if (rEmail && uEmail && rEmail.trim().toLowerCase() === uEmail) return true;
      if (rName && uName && rName.trim().toLowerCase() === uName) return true;
      if (rReg && uReg && rReg.trim() === uReg) return true;
      return false;
    };

    // 1. DDS Signatures (Presenças em que o colaborador participou e assinou digitalmente)
    const userDdsSignatures = data.filter(sig => 
      isMatch(sig.userId, sig.userName, sig.email, sig.registration)
    ).sort((a, b) => {
      const tA = a.timestamp instanceof Date ? a.timestamp.getTime() : 0;
      const tB = b.timestamp instanceof Date ? b.timestamp.getTime() : 0;
      return tB - tA;
    });

    // 2. DDS Created / Facilitated Sessions (Sessões criadas ou ministradas pelo colaborador)
    const userDdsCreated = ddsSessionsData.filter(s => 
      isMatch(s.createdBy, s.createdByName) || isMatch(undefined, s.executor)
    ).map(s => {
      const signaturesForSession = data.filter(sig => sig.sessionId === s.id);
      return {
        ...s,
        signaturesCount: signaturesForSession.length
      };
    }).sort((a, b) => {
      const tA = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
      const tB = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
      return tB - tA;
    });

    // 3. Quality Inspections
    const userQuality = qualityData.filter(qlt => 
      isMatch(qlt.userId, qlt.userName)
    ).sort((a, b) => {
      const tA = a.timestamp instanceof Date ? a.timestamp.getTime() : 0;
      const tB = b.timestamp instanceof Date ? b.timestamp.getTime() : 0;
      return tB - tA;
    });

    // 4. Operational Routes (Rondas / Rotas Operacionais)
    const userRoutes = routeSubmissionsData.filter(r => 
      isMatch(r.operatorId || r.userId, r.operatorName)
    ).sort((a, b) => {
      const tA = safeToDate(a.createdAt)?.getTime() || 0;
      const tB = safeToDate(b.createdAt)?.getTime() || 0;
      return tB - tA;
    });

    // 5. Forklift Checklists
    const userForklifts = forkliftData.filter(f => 
      isMatch(f.conductorId || f.userId, f.conductorName)
    ).sort((a, b) => {
      const tA = a.timestamp instanceof Date ? a.timestamp.getTime() : 0;
      const tB = b.timestamp instanceof Date ? b.timestamp.getTime() : 0;
      return tB - tA;
    });

    // 6. Safety Observations (Desvios de Segurança)
    const userSafety = safetyObservationsData.filter(so => 
      isMatch(so.userId || so.authorId, so.authorName || so.userName || so.reportedBy)
    ).sort((a, b) => {
      const tA = safeToDate(a.createdAt)?.getTime() || 0;
      const tB = safeToDate(b.createdAt)?.getTime() || 0;
      return tB - tA;
    });

    // 7. Stops Control (Paradas de Linha)
    const userStops = stopsData.filter(st => 
      isMatch(st.responsibleId || st.userId, st.responsibleName || st.registeredBy)
    ).sort((a, b) => {
      const tA = safeToDate(a.date)?.getTime() || 0;
      const tB = safeToDate(b.date)?.getTime() || 0;
      return tB - tA;
    });

    // 8. Maintenance Issues
    const userMaintenance = maintenanceIssuesData.filter(m => 
      isMatch(m.createdBy || m.creatorId, m.creatorName || m.createdByName || m.operatorName)
    ).sort((a, b) => {
      const tA = safeToDate(a.createdAt || a.date)?.getTime() || 0;
      const tB = safeToDate(b.createdAt || b.date)?.getTime() || 0;
      return tB - tA;
    });

    // 9. Wire Consumption (Consumo de Bobinas de Arame)
    const userWire = wireConsumptionData.filter(w => 
      isMatch(w.userId, w.consumedBy)
    ).sort((a, b) => {
      const tA = a.timestamp instanceof Date ? a.timestamp.getTime() : 0;
      const tB = b.timestamp instanceof Date ? b.timestamp.getTime() : 0;
      return tB - tA;
    });

    const ddsSignaturesCount = userDdsSignatures.length;
    const ddsCreatedCount = userDdsCreated.length;
    const ddsTotalSignaturesReceived = userDdsCreated.reduce((acc: number, s: any) => acc + (s.signaturesCount || 0), 0);
    const qualityCount = userQuality.length;
    const routesCount = userRoutes.length;
    const forkliftCount = userForklifts.length;
    const safetyCount = userSafety.length;
    const stopsCount = userStops.length;
    const maintenanceCount = userMaintenance.length;
    const wireCount = userWire.length;

    // Login logs for this user
    const userLogs = userLoginLogsData
      .filter(log => isMatch(log.userId, log.displayName, log.email))
      .sort((a, b) => {
        const timeA = a.timestamp?.seconds ? a.timestamp.seconds * 1000 : (a.timestamp ? new Date(a.timestamp).getTime() : 0);
        const timeB = b.timestamp?.seconds ? b.timestamp.seconds * 1000 : (b.timestamp ? new Date(b.timestamp).getTime() : 0);
        return timeB - timeA;
      });

    // Access counts: check user document accessCount vs logged logins
    const directAccessCount = Number(matchedUser.accessCount) || 0;
    const accessCount = Math.max(directAccessCount, userLogs.length);
    const hasAccessed = accessCount > 0 || userLogs.length > 0;

    // Last login date
    let lastLoginRaw = matchedUser.lastLoginAt;
    if (!lastLoginRaw && userLogs.length > 0) {
      lastLoginRaw = userLogs[0].timestamp || userLogs[0].createdAt;
    }

    // App feedback survey
    const userFeedback = feedbackSurveysData.find(s => 
      isMatch(s.userId, undefined, s.userEmail)
    );

    // Mood distribution in DDS
    const ddsMoods = userDdsSignatures.reduce((acc: any, cur: any) => {
      acc[cur.mood] = (acc[cur.mood] || 0) + 1;
      return acc;
    }, {});

    // Total operations across all operational modules
    const totalActions = ddsSignaturesCount + ddsCreatedCount + qualityCount + routesCount + forkliftCount + safetyCount + stopsCount + maintenanceCount + wireCount;

    return {
      profile: matchedUser,
      hasAccessed,
      accessCount,
      lastLoginRaw,
      userLogs,
      userFeedback,
      ddsSignaturesCount,
      ddsSignaturesList: userDdsSignatures,
      ddsCreatedCount,
      ddsCreatedList: userDdsCreated,
      ddsTotalSignaturesReceived,
      ddsMoods,
      qualityCount,
      qualityList: userQuality,
      routesCount,
      routesList: userRoutes,
      forkliftCount,
      forkliftList: userForklifts,
      safetyCount,
      safetyList: userSafety,
      stopsCount,
      stopsList: userStops,
      maintenanceCount,
      maintenanceList: userMaintenance,
      wireCount,
      wireList: userWire,
      totalActions
    };
  }, [selectedRayXUser, allUsers, data, ddsSessionsData, qualityData, routeSubmissionsData, forkliftData, safetyObservationsData, stopsData, maintenanceIssuesData, wireConsumptionData, userLoginLogsData, feedbackSurveysData]);

  // Aggregated Team Ray-X Summary for All Collaborators
  const teamRayXSummary = useMemo(() => {
    return allUsers.map(u => {
      const uName = (u.displayName || u.name || '').trim().toLowerCase();
      const uEmail = (u.email || '').trim().toLowerCase();
      const uId = u.uid || u.id;
      const uReg = (u.registration || u.matricula || '').trim();

      const isMatch = (rId?: string, rName?: string, rEmail?: string, rReg?: string) => {
        if (rId && (rId === uId || (u.uid && rId === u.uid))) return true;
        if (rEmail && uEmail && rEmail.trim().toLowerCase() === uEmail) return true;
        if (rName && uName && rName.trim().toLowerCase() === uName) return true;
        if (rReg && uReg && rReg.trim() === uReg) return true;
        return false;
      };

      const ddsSignaturesCount = data.filter(sig => 
        isMatch(sig.userId, sig.userName, sig.email, sig.registration)
      ).length;

      const ddsCreatedCount = ddsSessionsData.filter(s => 
        isMatch(s.createdBy, s.createdByName) || isMatch(undefined, s.executor)
      ).length;

      const qualityCount = qualityData.filter(qlt => 
        isMatch(qlt.userId, qlt.userName)
      ).length;

      const routesCount = routeSubmissionsData.filter(r => 
        isMatch(r.operatorId || r.userId, r.operatorName)
      ).length;

      const forkliftCount = forkliftData.filter(f => 
        isMatch(f.conductorId || f.userId, f.conductorName)
      ).length;

      const safetyCount = safetyObservationsData.filter(so => 
        isMatch(so.userId || so.authorId, so.authorName || so.userName || so.reportedBy)
      ).length;

      const stopsCount = stopsData.filter(st => 
        isMatch(st.responsibleId || st.userId, st.responsibleName || st.registeredBy)
      ).length;

      const maintenanceCount = maintenanceIssuesData.filter(m => 
        isMatch(m.createdBy || m.creatorId, m.creatorName || m.createdByName || m.operatorName)
      ).length;

      const wireCount = wireConsumptionData.filter(w => 
        isMatch(w.userId, w.consumedBy)
      ).length;

      const userLogs = userLoginLogsData.filter(log =>
        isMatch(log.userId, log.displayName, log.email)
      );

      const directCount = Number(u.accessCount) || 0;
      const accessCount = Math.max(directCount, userLogs.length);
      const hasAccessed = accessCount > 0;

      let lastLoginRaw = u.lastLoginAt;
      if (!lastLoginRaw && userLogs.length > 0) {
        lastLoginRaw = userLogs[0].timestamp || userLogs[0].createdAt;
      }

      // Total operations across all factory modules
      const totalActions = ddsSignaturesCount + ddsCreatedCount + qualityCount + routesCount + forkliftCount + safetyCount + stopsCount + maintenanceCount + wireCount;

      return {
        user: u,
        uId,
        name: u.displayName || u.name || 'Sem nome',
        email: uEmail,
        cargo: u.cargoName || '-',
        sector: u.sectorName || '-',
        group: u.group || '-',
        role: u.role || 'viewer',
        status: u.status || 'Ativo',
        hasAccessed,
        accessCount,
        lastLoginRaw,
        totalActions,
        ddsSignaturesCount,
        ddsCreatedCount,
        qualityCount,
        routesCount,
        forkliftCount,
        safetyCount,
        stopsCount,
        maintenanceCount,
        wireCount
      };
    });
  }, [allUsers, data, ddsSessionsData, qualityData, routeSubmissionsData, forkliftData, safetyObservationsData, stopsData, maintenanceIssuesData, wireConsumptionData, userLoginLogsData]);

  // Filtered list for Team Ray-X Report table
  const filteredTeamRayX = useMemo(() => {
    return teamRayXSummary.filter(item => {
      if (rayXSearchTerm.trim()) {
        const term = rayXSearchTerm.toLowerCase();
        const matchTerm = 
          item.name.toLowerCase().includes(term) ||
          item.email.toLowerCase().includes(term) ||
          item.cargo.toLowerCase().includes(term) ||
          item.sector.toLowerCase().includes(term) ||
          item.group.toLowerCase().includes(term);
        if (!matchTerm) return false;
      }
      if (rayXAccessFilter === 'accessed' && !item.hasAccessed) return false;
      if (rayXAccessFilter === 'never_accessed' && item.hasAccessed) return false;
      if (rayXShiftFilter !== 'all') {
        const itemGroup = (item.group || '').toUpperCase();
        if (rayXShiftFilter === 'ADM') {
          if (itemGroup !== 'ADM' && !itemGroup.startsWith('ADM') && itemGroup !== 'ADMINISTRATIVO') return false;
        } else if (item.group !== rayXShiftFilter && !itemGroup.includes(rayXShiftFilter.toUpperCase())) {
          return false;
        }
      }
      return true;
    });
  }, [teamRayXSummary, rayXSearchTerm, rayXAccessFilter, rayXShiftFilter]);

  const activeAccessMembers = useMemo(() => teamRayXSummary.filter(t => t.hasAccessed).length, [teamRayXSummary]);
  const neverAccessedMembers = useMemo(() => teamRayXSummary.filter(t => !t.hasAccessed).length, [teamRayXSummary]);
  const accessAdoptionRate = useMemo(() => teamRayXSummary.length > 0 ? Math.round((activeAccessMembers / teamRayXSummary.length) * 100) : 0, [teamRayXSummary, activeAccessMembers]);
  const totalSystemLogins = useMemo(() => teamRayXSummary.reduce((acc, t) => acc + t.accessCount, 0), [teamRayXSummary]);
  const totalSystemActions = useMemo(() => teamRayXSummary.reduce((acc, t) => acc + t.totalActions, 0), [teamRayXSummary]);

  // PDF Export for Individual Ray-X Dossier
  const exportRayXIndividualPDF = () => {
    if (!selectedUserData) return;
    setExportingRayXPdf(true);
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Top Header - Emerald
      doc.setFillColor(5, 150, 105);
      doc.rect(0, 0, pageWidth, 28, 'F');
      doc.setFillColor(4, 120, 87);
      doc.rect(0, 28, pageWidth, 2, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('RAIO-X DO COLABORADOR & AUDITORIA DE USABILIDADE', 14, 13);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(209, 250, 229);
      doc.text('Dossie de Acesso ao Sistema, Aderencia e Desempenho Operacional - SecApp', 14, 20);

      const nowStr = new Date().toLocaleString('pt-BR');
      doc.text(sanitizePdfText(`Gerado em: ${nowStr}`), pageWidth - 14, 13, { align: 'right' });
      doc.setFont('helvetica', 'bold');
      doc.text('Acesso: Admin & Master', pageWidth - 14, 20, { align: 'right' });

      // Collaborator Profile Info Box (Y: 34, H: 24)
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(14, 34, pageWidth - 28, 24, 2, 2, 'FD');

      const uName = selectedUserData.profile.displayName || selectedUserData.profile.name || 'Colaborador';
      const uEmail = selectedUserData.profile.email || '-';
      const uCargo = selectedUserData.profile.cargoName || '-';
      const uSector = selectedUserData.profile.sectorName || '-';
      const uGroup = selectedUserData.profile.group || '-';
      const uRole = selectedUserData.profile.role || 'viewer';
      const uStatus = selectedUserData.profile.status || 'Ativo';

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text(sanitizePdfText(uName), 20, 42);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(sanitizePdfText(`Email: ${uEmail} | Perfil: ${uRole} | Status: ${uStatus}`), 20, 48);
      doc.text(sanitizePdfText(`Cargo: ${uCargo} | Setor: ${uSector} | Turno/Grupo: ${uGroup}`), 20, 53);

      // Section 1: Auditoria de Acessos ao Sistema (Y: 62)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text('1. AUDITORIA DE ACESSO AO SISTEMA', 14, 64);

      // 4 KPI Cards for Access
      const cardY = 67;
      const cardH = 18;
      const cardW = (pageWidth - 28 - 9) / 4;

      // Card 1: Acessa o Sistema?
      doc.setFillColor(selectedUserData.hasAccessed ? 240 : 254, selectedUserData.hasAccessed ? 253 : 242, selectedUserData.hasAccessed ? 244 : 242);
      doc.setDrawColor(selectedUserData.hasAccessed ? 167 : 254, selectedUserData.hasAccessed ? 243 : 202, selectedUserData.hasAccessed ? 208 : 202);
      doc.roundedRect(14, cardY, cardW, cardH, 1.5, 1.5, 'FD');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text('ACESSA O SISTEMA?', 17, cardY + 5.5);
      doc.setFontSize(9.5);
      doc.setTextColor(selectedUserData.hasAccessed ? 5 : 225, selectedUserData.hasAccessed ? 150 : 29, selectedUserData.hasAccessed ? 105 : 72);
      doc.text(selectedUserData.hasAccessed ? 'SIM (ATIVO)' : 'NAO ACESSOU', 17, cardY + 13);

      // Card 2: Total de Acessos
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(14 + cardW + 3, cardY, cardW, cardH, 1.5, 1.5, 'FD');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text('TOTAL DE ACESSOS', 17 + cardW + 3, cardY + 5.5);
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(`${selectedUserData.accessCount} acessos`, 17 + cardW + 3, cardY + 13);

      // Card 3: Ultimo Acesso
      doc.roundedRect(14 + (cardW + 3) * 2, cardY, cardW, cardH, 1.5, 1.5, 'FD');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text('ULTIMO ACESSO', 17 + (cardW + 3) * 2, cardY + 5.5);
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      const lastLoginFormatted = selectedUserData.lastLoginRaw ? formatLocalDateTimeBR(selectedUserData.lastLoginRaw) : 'Nunca acessou';
      doc.text(sanitizePdfText(lastLoginFormatted), 17 + (cardW + 3) * 2, cardY + 13);

      // Card 4: Usabilidade (Acoes)
      doc.roundedRect(14 + (cardW + 3) * 3, cardY, cardW, cardH, 1.5, 1.5, 'FD');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text('OPERACOES REGISTRADAS', 17 + (cardW + 3) * 3, cardY + 5.5);
      doc.setFontSize(10);
      doc.setTextColor(5, 150, 105);
      doc.text(`${selectedUserData.totalActions} operacoes`, 17 + (cardW + 3) * 3, cardY + 13);

      // Section 2: Diagnostico de Usabilidade por Modulo (Table)
      const usabilityRows = [
        ['DDS Assinados (Presencas)', `${selectedUserData.ddsSignaturesCount} presencas`, 'Participacoes confirmadas em Dialogos Diarios de Seguranca'],
        ['DDS Criados (Sessoes Facilitadas)', `${selectedUserData.ddsCreatedCount} sessoes`, `Sessoes de DDS ministradas pelo colaborador (Total de ${selectedUserData.ddsTotalSignaturesReceived} assinaturas coletadas)`],
        ['Inspecoes de Qualidade Realizadas', `${selectedUserData.qualityCount} inspecoes`, 'Checklists tecnicos e auditorias de qualidade concluidas'],
        ['Avaliacao do Aplicativo SecApp', selectedUserData.userFeedback ? `${selectedUserData.userFeedback.rating || 0}/5 estrelas` : 'Pendente', selectedUserData.userFeedback?.observation ? `"${sanitizePdfText(selectedUserData.userFeedback.observation.slice(0, 65))}"` : 'Sem observacoes adicionais']
      ];

      autoTable(doc, {
        startY: 90,
        head: [['Modulo do Sistema', 'Volume de Usabilidade', 'Detalhamento / Indicador']],
        body: usabilityRows,
        theme: 'grid',
        styles: {
          fontSize: 8,
          cellPadding: 2,
          lineColor: [226, 232, 240],
          lineWidth: 0.15
        },
        headStyles: {
          fillColor: [5, 150, 105],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8
        },
        columnStyles: {
          0: { cellWidth: 65, fontStyle: 'bold' },
          1: { cellWidth: 40, halign: 'center', fontStyle: 'bold' },
          2: { cellWidth: 77 }
        }
      });

      let currentY = (doc as any).lastAutoTable.finalY + 8;

      // Section 3: Historico de Sessoes e Logins
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text('2. HISTORICO DE ACESSOS RECENTES AO SISTEMA', 14, currentY);

      const logsData = selectedUserData.userLogs.slice(0, 6).map(log => {
        const dateStr = log.localTimeStr || (log.timestamp ? formatLocalDateTimeBR(log.timestamp) : '-');
        const deviceStr = formatUserAgent(log.userAgent);
        return [
          sanitizePdfText(dateStr),
          sanitizePdfText(deviceStr),
          'Autenticacao Valida'
        ];
      });

      if (logsData.length === 0) {
        logsData.push(['Nenhum registro de login capturado', '-', selectedUserData.hasAccessed ? 'Acesso registrado via contador' : 'Colaborador nunca acessou']);
      }

      autoTable(doc, {
        startY: currentY + 3,
        head: [['Data e Horario do Login', 'Dispositivo / Plataforma', 'Status da Sessao']],
        body: logsData,
        theme: 'grid',
        styles: {
          fontSize: 7.5,
          cellPadding: 1.8,
          lineColor: [226, 232, 240],
          lineWidth: 0.15
        },
        headStyles: {
          fillColor: [51, 65, 85],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 7.5
        },
        columnStyles: {
          0: { cellWidth: 55, fontStyle: 'bold' },
          1: { cellWidth: 75 },
          2: { cellWidth: 52, halign: 'center' }
        }
      });

      currentY = (doc as any).lastAutoTable.finalY + 8;

      // Parecer Administrativo Box
      if (currentY > pageHeight - 35) {
        doc.addPage();
        currentY = 20;
      }

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(14, currentY, pageWidth - 28, 22, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(5, 150, 105);
      doc.text('PARECER GERENCIAL DE ADOCAO E USABILIDADE', 18, currentY + 6);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(51, 65, 85);
      
      let evalText = '';
      if (!selectedUserData.hasAccessed) {
        evalText = 'Atencao: Este colaborador ainda nao acessou o aplicativo SecApp. Recomenda-se alinhamento junto a lideranca de turno para orientacao de primeiro acesso e entrega de credenciais.';
      } else if (selectedUserData.totalActions > 20) {
        evalText = `Excepcional: Colaborador com alto engajamento digital (${selectedUserData.accessCount} acessos e ${selectedUserData.totalActions} operacoes registradas: ${selectedUserData.ddsSignaturesCount} DDS assinados, ${selectedUserData.ddsCreatedCount} DDS criados e ${selectedUserData.qualityCount} inspecoes de qualidade).`;
      } else if (selectedUserData.totalActions >= 5) {
        evalText = `Bom desempenho: Colaborador consistente no sistema (${selectedUserData.accessCount} acessos e ${selectedUserData.totalActions} operacoes: ${selectedUserData.ddsSignaturesCount} DDS assinados, ${selectedUserData.ddsCreatedCount} DDS criados e ${selectedUserData.qualityCount} inspecoes de qualidade).`;
      } else {
        evalText = `Uso inicial: O colaborador ja acessou o sistema ${selectedUserData.accessCount} vez(es) com ${selectedUserData.totalActions} operacao(oes) no sistema. Recomenda-se incentivar a participacao em DDS e inspecoes de qualidade.`;
      }

      doc.text(sanitizePdfText(evalText), 18, currentY + 12, { maxWidth: pageWidth - 36 });

      // Footer
      const totalPages = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(148, 163, 184);
        doc.setDrawColor(226, 232, 240);
        doc.line(14, pageHeight - 8, pageWidth - 14, pageHeight - 8);
        doc.text('SecApp - Gestao Operacional | Raio-X & Auditoria de Acessos', 14, pageHeight - 4.5);
        doc.text(`Pagina ${i} de ${totalPages}`, pageWidth - 14, pageHeight - 4.5, { align: 'right' });
      }

      doc.save(`raio_x_${uName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error('Error generating individual Ray-X PDF:', err);
      alert('Erro ao gerar relatório individual em PDF.');
    } finally {
      setExportingRayXPdf(false);
    }
  };

  // PDF Export for Team Access & Usability Summary
  const exportTeamRayXPDF = () => {
    if (filteredTeamRayX.length === 0) {
      alert('Nenhum colaborador encontrado com os filtros atuais.');
      return;
    }
    setExportingRayXPdf(true);
    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Top Header Bar
      doc.setFillColor(5, 150, 105);
      doc.rect(0, 0, pageWidth, 28, 'F');
      doc.setFillColor(4, 120, 87);
      doc.rect(0, 28, pageWidth, 2, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('RELATORIO GERAL DE ACESSO E USABILIDADE DOS COLABORADORES', 14, 13);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(209, 250, 229);
      doc.text('Auditoria de Acesso ao Sistema, Frequencia de Login e Aderencia Operacional - SecApp', 14, 20);

      const nowStr = new Date().toLocaleString('pt-BR');
      doc.text(sanitizePdfText(`Gerado em: ${nowStr}`), pageWidth - 14, 13, { align: 'right' });
      doc.setFont('helvetica', 'bold');
      doc.text('Acesso: Admin & Master', pageWidth - 14, 20, { align: 'right' });

      // KPIs Banner
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(14, 34, pageWidth - 28, 18, 2, 2, 'FD');

      // Total Colaboradores
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text('TOTAL CADASTRADOS', 20, 39.5);
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text(`${teamRayXSummary.length} pessoas`, 20, 47);

      // Acessam o Sistema
      const countAccessed = teamRayXSummary.filter(t => t.hasAccessed).length;
      const pctAccessed = teamRayXSummary.length > 0 ? Math.round((countAccessed / teamRayXSummary.length) * 100) : 0;
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text('ACESSAM O SISTEMA', 75, 39.5);
      doc.setFontSize(12);
      doc.setTextColor(5, 150, 105);
      doc.text(`${countAccessed} (${pctAccessed}%)`, 75, 47);

      // Nunca Acessaram
      const countNever = teamRayXSummary.filter(t => !t.hasAccessed).length;
      const pctNever = teamRayXSummary.length > 0 ? Math.round((countNever / teamRayXSummary.length) * 100) : 0;
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text('NUNCA ACESSARAM', 135, 39.5);
      doc.setFontSize(12);
      doc.setTextColor(countNever > 0 ? 225 : 100, countNever > 0 ? 29 : 116, countNever > 0 ? 72 : 139);
      doc.text(`${countNever} (${pctNever}%)`, 135, 47);

      // Total Acessos
      const totalAccesses = teamRayXSummary.reduce((acc, t) => acc + t.accessCount, 0);
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text('TOTAL DE LOGINS', 190, 39.5);
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text(`${totalAccesses} acessos`, 190, 47);

      // Total Operações
      const totalOps = teamRayXSummary.reduce((acc, t) => acc + t.totalActions, 0);
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text('TOTAL DE OPERACOES', 242, 39.5);
      doc.setFontSize(12);
      doc.setTextColor(5, 150, 105);
      doc.text(`${totalOps} acoes`, 242, 47);

      const head = [['Colaborador', 'Cargo / Setor', 'Turno', 'Acessa?', 'Logins', 'Ultimo Acesso', 'Total Ops', 'DDS Assin.', 'DDS Criado', 'Inspecoes']];

      const tableData = filteredTeamRayX.map(item => {
        const userCell = `${item.name}\n${item.email}`;
        const cargoSector = `${item.cargo}\n${item.sector}`;
        const accessStatus = item.hasAccessed ? 'SIM (Ativo)' : 'NAO ACESSOU';
        const lastLoginStr = item.lastLoginRaw ? formatLocalDateTimeBR(item.lastLoginRaw) : 'Nunca';

        return [
          sanitizePdfText(userCell),
          sanitizePdfText(cargoSector),
          sanitizePdfText(item.group),
          sanitizePdfText(accessStatus),
          `${item.accessCount}`,
          sanitizePdfText(lastLoginStr),
          `${item.totalActions}`,
          `${item.ddsSignaturesCount}`,
          `${item.ddsCreatedCount}`,
          `${item.qualityCount}`
        ];
      });

      autoTable(doc, {
        startY: 56,
        head: head.map(r => r.map(c => sanitizePdfText(c))),
        body: tableData,
        theme: 'grid',
        styles: {
          fontSize: 7.5,
          cellPadding: 2,
          lineColor: [226, 232, 240],
          lineWidth: 0.15,
          overflow: 'linebreak'
        },
        headStyles: {
          fillColor: [5, 150, 105],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 7.5,
          halign: 'left'
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        },
        columnStyles: {
          0: { cellWidth: 54, fontStyle: 'bold' },
          1: { cellWidth: 44 },
          2: { cellWidth: 18, halign: 'center' },
          3: { cellWidth: 24, halign: 'center', fontStyle: 'bold' },
          4: { cellWidth: 18, halign: 'center' },
          5: { cellWidth: 32, halign: 'center' },
          6: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
          7: { cellWidth: 20, halign: 'center' },
          8: { cellWidth: 20, halign: 'center' },
          9: { cellWidth: 20, halign: 'center' }
        },
        didDrawPage: () => {
          const totalPages = (doc as any).internal.getNumberOfPages();
          const currentPage = (doc as any).internal.getCurrentPageInfo().pageNumber;

          doc.setFontSize(7.5);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(148, 163, 184);

          doc.setDrawColor(226, 232, 240);
          doc.line(14, pageHeight - 8, pageWidth - 14, pageHeight - 8);

          doc.text(
            'SecApp - Gestao Operacional | Relatorio Geral de Acesso e Usabilidade',
            14,
            pageHeight - 4.5
          );
          doc.text(
            `Pagina ${currentPage} de ${totalPages}`,
            pageWidth - 14,
            pageHeight - 4.5,
            { align: 'right' }
          );
        }
      });

      doc.save(`relatorio_acesso_usabilidade_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error('Error generating team Ray-X PDF:', err);
      alert('Erro ao gerar relatório geral em PDF.');
    } finally {
      setExportingRayXPdf(false);
    }
  };

  // CSV Export for Team Access & Usability Summary
  const exportTeamRayXCSV = () => {
    if (filteredTeamRayX.length === 0) {
      alert('Nenhum colaborador encontrado com os filtros atuais.');
      return;
    }
    const headers = ['Nome', 'Email', 'Cargo', 'Setor', 'Turno/Escala', 'Perfil', 'Status Conta', 'Acessa Sistema?', 'Qtd Acessos', 'Ultimo Acesso', 'Total Operacoes', 'DDS Assinados', 'DDS Criados', 'Inspecoes Realizadas'];
    const rows = filteredTeamRayX.map(item => [
      `"${(item.name || '').replace(/"/g, '""')}"`,
      `"${(item.email || '').replace(/"/g, '""')}"`,
      `"${(item.cargo || '').replace(/"/g, '""')}"`,
      `"${(item.sector || '').replace(/"/g, '""')}"`,
      `"${(item.group || '').replace(/"/g, '""')}"`,
      `"${(item.role || '').replace(/"/g, '""')}"`,
      `"${(item.status || '').replace(/"/g, '""')}"`,
      item.hasAccessed ? 'Sim' : 'Nao',
      item.accessCount,
      `"${item.lastLoginRaw ? formatLocalDateTimeBR(item.lastLoginRaw) : 'Nunca'}"`,
      item.totalActions,
      item.ddsSignaturesCount,
      item.ddsCreatedCount,
      item.qualityCount
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `acesso_usabilidade_equipe_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export single Stop Report to PDF
  const handleExportSingleStopPDF = (report: StopReport) => {
    const docPdf = new jsPDF();
    const duration = getMinutesDiff(report.startTime, report.endTime);

    // Header styling - Standardized Emerald Theme
    docPdf.setFillColor(5, 150, 105); // emerald-600
    docPdf.rect(0, 0, 210, 36, 'F');
    
    docPdf.setTextColor(255, 255, 255);
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(16);
    docPdf.text(sanitizePdfText('RELATÓRIO DE CONTROLE DE PARADA'), 14, 20);
    
    docPdf.setFontSize(9);
    docPdf.setFont('helvetica', 'normal');
    docPdf.setTextColor(190, 242, 219);
    docPdf.text(sanitizePdfText(`Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`), 14, 28);
    docPdf.text(sanitizePdfText(`Tipo: ${getStopTypeLabel(report.type).toUpperCase()}`), 196, 28, { align: 'right' });

    // Section 1: Informações Gerais
    docPdf.setTextColor(5, 150, 105);
    docPdf.setFontSize(12);
    docPdf.setFont('helvetica', 'bold');
    docPdf.text(sanitizePdfText('1. Informações Gerais da Parada'), 14, 48);
    
    const generalData = [
      [sanitizePdfText('Data de Execução:'), formatDateToBR(report.date), sanitizePdfText('Tipo de Parada:'), sanitizePdfText(getStopTypeLabel(report.type).toUpperCase())],
      [sanitizePdfText('Local / Linha:'), sanitizePdfText(report.lineName || report.lineId), sanitizePdfText('Tempo de Rejeição:'), `${report.rejectionTime || 0} min`],
      [sanitizePdfText('Hora de Início:'), report.startTime, sanitizePdfText('Hora de Término:'), report.endTime],
      [sanitizePdfText('Duração Total:'), formatDurationString(duration), sanitizePdfText('Registrado por:'), sanitizePdfText(report.userName || 'Sistema')]
    ];

    autoTable(docPdf, {
      startY: 52,
      head: [],
      body: generalData,
      theme: 'plain',
      styles: { cellPadding: 2, fontSize: 9, textColor: [51, 65, 85] },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 35 },
        1: { cellWidth: 60 },
        2: { fontStyle: 'bold', cellWidth: 40 },
        3: { cellWidth: 50 }
      }
    });

    // Section 2: Velocidade das Cortadeiras
    let currentY = (docPdf as any).lastAutoTable.finalY + 6;
    docPdf.setTextColor(5, 150, 105);
    docPdf.setFontSize(12);
    docPdf.setFont('helvetica', 'bold');
    docPdf.text(sanitizePdfText('2. Velocidade das Cortadeiras'), 14, currentY);

    const speedData = [
      [sanitizePdfText('Cortadeira Linha MS1:'), `${report.cutterSpeedMS1 || 0} m/min`],
      [sanitizePdfText('Cortadeira Linha MS2:'), `${report.cutterSpeedMS2 || 0} m/min`]
    ];

    autoTable(docPdf, {
      startY: currentY + 3,
      head: [],
      body: speedData,
      theme: 'plain',
      styles: { cellPadding: 2, fontSize: 9, textColor: [51, 65, 85] },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 60 },
        1: { cellWidth: 125 }
      }
    });

    // Section 3: Frentes de Trabalho e Atividades Realizadas
    currentY = (docPdf as any).lastAutoTable.finalY + 6;
    docPdf.setTextColor(5, 150, 105);
    docPdf.setFontSize(12);
    docPdf.setFont('helvetica', 'bold');
    docPdf.text(sanitizePdfText('3. Frentes de Trabalho & Atividades Realizadas'), 14, currentY);

    if (!report.workFronts || report.workFronts.length === 0) {
      docPdf.setFontSize(9);
      docPdf.setFont('helvetica', 'italic');
      docPdf.setTextColor(100, 116, 139);
      docPdf.text(sanitizePdfText('Nenhuma frente de trabalho foi registrada nesta parada.'), 14, currentY + 7);
      currentY += 12;
    } else {
      const frontsHeaders = [[
        sanitizePdfText('Frente de Trabalho'),
        sanitizePdfText('Descrição das Atividades Realizadas'),
        sanitizePdfText('Início'),
        sanitizePdfText('Fim'),
        sanitizePdfText('Duração')
      ]];
      const frontsBody = report.workFronts.map(wf => {
        const wfDuration = getMinutesDiff(wf.startTime, wf.endTime);
        return [
          sanitizePdfText(wf.front),
          sanitizePdfText(wf.description || 'Sem detalhes informados.'),
          wf.startTime,
          wf.endTime,
          formatDurationString(wfDuration)
        ];
      });

      autoTable(docPdf, {
        startY: currentY + 3,
        head: frontsHeaders,
        body: frontsBody,
        theme: 'striped',
        headStyles: { fillColor: [5, 150, 105], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
        styles: { fontSize: 8, cellPadding: 2.5 },
        columnStyles: {
          0: { cellWidth: 35, fontStyle: 'bold' },
          1: { cellWidth: 95 },
          2: { cellWidth: 18 },
          3: { cellWidth: 18 },
          4: { cellWidth: 20 }
        }
      });
      currentY = (docPdf as any).lastAutoTable.finalY + 6;
    }

    // Section 4: Observações Gerais
    if (report.observation && report.observation.trim()) {
      if (currentY > 240) {
        docPdf.addPage();
        currentY = 20;
      }
      docPdf.setTextColor(5, 150, 105);
      docPdf.setFontSize(12);
      docPdf.setFont('helvetica', 'bold');
      docPdf.text(sanitizePdfText('4. Observações Gerais'), 14, currentY);

      docPdf.setFontSize(9);
      docPdf.setFont('helvetica', 'normal');
      docPdf.setTextColor(51, 65, 85);
      docPdf.text(sanitizePdfText(report.observation), 14, currentY + 6, { maxWidth: 182 });
    }

    // Standard SecApp Footer
    const totalPages = (docPdf as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      docPdf.setPage(i);
      docPdf.setFontSize(7.5);
      docPdf.setFont('helvetica', 'normal');
      docPdf.setTextColor(148, 163, 184);
      docPdf.setDrawColor(226, 232, 240);
      docPdf.line(14, 287, 196, 287);
      docPdf.text('SecApp - Gestão Operacional | Relatório de Controle de Parada', 14, 291);
      docPdf.text(`Página ${i} de ${totalPages}`, 196, 291, { align: 'right' });
    }

    docPdf.save(`relatorio_parada_${report.date}_${(report.lineName || report.lineId).replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
  };

  const exportPDF = () => {
    // Consolidated Stops Report in Landscape
    if (reportType === 'stops_control') {
      const docPdf = new jsPDF('landscape');
      const pageW = docPdf.internal.pageSize.width;
      const pageH = docPdf.internal.pageSize.height;

      // Header styling - Standardized Emerald Theme
      docPdf.setFillColor(5, 150, 105); // emerald-600
      docPdf.rect(0, 0, pageW, 35, 'F');

      docPdf.setTextColor(255, 255, 255);
      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(16);
      docPdf.text(sanitizePdfText('RELATÓRIO CONSOLIDADO DE CONTROLE DE PARADAS'), 14, 20);

      docPdf.setFontSize(9);
      docPdf.setFont('helvetica', 'normal');
      docPdf.setTextColor(190, 242, 219);
      docPdf.text(sanitizePdfText(`Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`), 14, 28);
      
      const filterSummary = `Período: ${filterDateStart ? formatDateToBR(filterDateStart) : 'Início'} a ${filterDateEnd ? formatDateToBR(filterDateEnd) : 'Fim'} | Total: ${filteredData.length} parada(s)`;
      docPdf.text(sanitizePdfText(filterSummary), pageW - 14, 28, { align: 'right' });

      const headers = [[
        sanitizePdfText('Data'),
        sanitizePdfText('Tipo'),
        sanitizePdfText('Local/Linha'),
        sanitizePdfText('Início'),
        sanitizePdfText('Fim'),
        sanitizePdfText('Duração'),
        sanitizePdfText('Rejeição'),
        sanitizePdfText('Cortadeiras'),
        sanitizePdfText('Frentes & Atividades Realizadas'),
        sanitizePdfText('Responsável')
      ]];

      const body = filteredData.map((r: StopReport) => {
        const duration = getMinutesDiff(r.startTime, r.endTime);
        const activitiesText = (r.workFronts || []).map(wf => {
          const wfDur = getMinutesDiff(wf.startTime, wf.endTime);
          const durStr = wfDur > 0 ? ` (${formatDurationString(wfDur)})` : '';
          return `• [${wf.front}]: ${wf.description || 'Sem detalhes'}${durStr}`;
        }).join('\n');

        const cutterSpeed = `MS1: ${r.cutterSpeedMS1 || 0} m/min\nMS2: ${r.cutterSpeedMS2 || 0} m/min`;

        return [
          formatDateToBR(r.date),
          sanitizePdfText(getStopTypeLabel(r.type).toUpperCase()),
          sanitizePdfText(r.lineName || r.lineId),
          r.startTime,
          r.endTime,
          formatDurationString(duration),
          `${r.rejectionTime || 0} min`,
          sanitizePdfText(cutterSpeed),
          sanitizePdfText(activitiesText || 'Nenhuma frente registrada'),
          sanitizePdfText(r.userName || 'Sistema')
        ];
      });

      autoTable(docPdf, {
        startY: 40,
        head: headers,
        body: body,
        theme: 'striped',
        headStyles: {
          fillColor: [5, 150, 105],
          textColor: [255, 255, 255],
          fontSize: 8.5,
          fontStyle: 'bold'
        },
        styles: { fontSize: 7.5, cellPadding: 2.5, valign: 'top' },
        columnStyles: {
          0: { cellWidth: 20 },
          1: { cellWidth: 24, fontStyle: 'bold' },
          2: { cellWidth: 28 },
          3: { cellWidth: 15 },
          4: { cellWidth: 15 },
          5: { cellWidth: 20, fontStyle: 'bold' },
          6: { cellWidth: 18 },
          7: { cellWidth: 28 },
          8: { cellWidth: 75 },
          9: { cellWidth: 26 }
        }
      });

      // Add footer to all pages
      const totalPages = (docPdf as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        docPdf.setPage(i);
        docPdf.setFontSize(7.5);
        docPdf.setFont('helvetica', 'normal');
        docPdf.setTextColor(148, 163, 184);
        docPdf.setDrawColor(226, 232, 240);
        docPdf.line(14, pageH - 8, pageW - 14, pageH - 8);
        docPdf.text('SecApp - Gestão Operacional | Relatório Consolidado de Controle de Parada', 14, pageH - 4.5);
        docPdf.text(`Página ${i} de ${totalPages}`, pageW - 14, pageH - 4.5, { align: 'right' });
      }

      docPdf.save(`relatorio_consolidado_paradas_${new Date().getTime()}.pdf`);
      return;
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    let title = '';
    if (reportType === 'dds') title = 'RELATÓRIO DDS ONLINE';
    else if (reportType === 'forklift') title = 'RELATÓRIO INSPEÇÃO EMPILHADEIRAS';
    else if (reportType === 'wire_receiving') title = 'RELATÓRIO RECEBIMENTO DE ARAME';
    else if (reportType === 'wire_consumption') title = 'RELATÓRIO CONSUMO DE ARAME';
    else if (reportType === 'quality') title = 'RELATÓRIO QUALIDADE DE PROCESSO';
    else if (reportType === 'pending_equipments') title = 'EQUIPAMENTOS COM PENDÊNCIAS';
    
    // Header styling - Standardized Emerald Theme
    doc.setFillColor(5, 150, 105); // emerald-600
    doc.rect(0, 0, pageWidth, 35, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(sanitizePdfText(title), 14, 20);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(190, 242, 219); // emerald-100ish for secondary text on emerald bg
    doc.text(sanitizePdfText(`Gerado em: ${format(new Date(), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR })}`), 14, 28);
    doc.text(sanitizePdfText(`Filtros: ${filterUser || 'Todos'} | Turno: ${filterShift} | Letra: ${filterGroup}`), pageWidth - 14, 28, { align: 'right' });
    
    let head: any[], tableData: any[];
    if (reportType === 'dds') {
      head = [['Colaborador', 'Tema', 'Turno', 'Letra', 'Executante', 'Humor', 'Data/Hora']];
      tableData = filteredData.map(item => [
        item.userName,
        item.sessionTitle,
        item.shift,
        item.group,
        item.executor,
        item.mood === 'happy' ? 'FELIZ' : item.mood === 'neutral' ? 'NEUTRO' : item.mood === 'sad' ? 'TRISTE' : '-',
        formatLocalDateTimeBR(item.timestamp)
      ]);
    } else if (reportType === 'forklift') {
      head = [['Equipamento', 'Condutor', 'Turno', 'Letra', 'Status', 'Data/Hora']];
      tableData = filteredData.map(item => [
        item.forkliftNumber,
        item.conductorName,
        item.shift,
        item.group,
        item.status === 'normal' ? 'CONFORME' : 'NÃO CONFORME',
        formatLocalDateTimeBR(item.timestamp)
      ]);
    } else if (reportType === 'wire_receiving') {
      head = [['NF', 'Fornecedor', 'Bobinas', 'Peso Total (kg)', 'Responsável', 'Data']];
      tableData = filteredData.map(item => [
        item.nfNumber,
        item.supplierName,
        item.coilsCount,
        item.totalWeight.toLocaleString('pt-BR'),
        item.responsibleName,
        formatLocalDateBR(item.timestamp)
      ]);
    } else if (reportType === 'quality') {
      head = [['Colaborador', 'Checklist', 'Setor/Linha', 'Escala', 'Itens', 'Data/Hora']];
      tableData = filteredData.map(item => [
        item.userName,
        item.templateName,
        lines.find(l => l.id === item.lineId)?.name || qualitySectors.find(s => s.id === item.sectorId)?.name || 'Todos',
        item.shift,
        item.responses.length,
        formatLocalDateTimeBR(item.timestamp)
      ]);
    } else if (reportType === 'pending_equipments') {
      head = [['Tag', 'Equipamento', 'Linha', 'Motivo da Pendência', 'Operador', 'Programação', 'Nº SAP', 'Data Identificação']];
      tableData = filteredData.map(item => [
        item.tag,
        item.name,
        item.line,
        item.reason + (item.notes ? `\nObs: ${item.notes}` : ''),
        item.operator,
        item.schedule || '-',
        item.sapNote || '-',
        formatLocalDateTimeBR(item.timestamp)
      ]);
    } else {
      head = [['Bobina (ID)', 'Bitola (mm)', 'Peso (kg)', 'Linha', 'Turno', 'Letra', 'Usuário', 'Data/Hora']];
      tableData = filteredData.map(item => [
        item.coilNumber,
        item.diameter,
        item.weight,
        lines.find(l => l.id === item.currentLineId)?.name || 'N/A',
        item.consumedShift || '-',
        item.consumedByGroup || '-',
        item.consumedBy || 'Sistema',
        formatLocalDateTimeBR(item.timestamp)
      ]);
    }

    autoTable(doc, {
      startY: 40,
      head: head ? head.map((row: any) => row.map((cell: any) => sanitizePdfText(cell))) : [],
      body: tableData ? tableData.map((row: any) => row.map((cell: any) => sanitizePdfText(cell))) : [],
      theme: 'striped',
      headStyles: { 
        fillColor: [241, 245, 249], // slate-100
        textColor: [71, 85, 105],   // slate-600
        fontSize: 8,
        fontStyle: 'bold'
      },
      styles: { fontSize: 8, cellPadding: 3 },
      alternateRowStyles: { fillColor: [248, 250, 252] }, // slate-50
      didParseCell: (data) => {
        if (reportType === 'forklift' && data.section === 'body' && data.column.index === 4) {
          if (data.cell.raw === 'NAO CONFORME') {
            data.cell.styles.textColor = [225, 29, 72]; // rose-600
            data.cell.styles.fontStyle = 'bold';
          } else {
            data.cell.styles.textColor = [5, 150, 105]; // emerald-600
          }
        }
      }
    });

    doc.save(`relatorio_${reportType}_${new Date().getTime()}.pdf`);
  };

  const toggleReceivingExpand = async (batchId: string) => {
    if (expandedReceivingIds[batchId]) {
      const newExpanded = { ...expandedReceivingIds };
      delete newExpanded[batchId];
      setExpandedReceivingIds(newExpanded);
      return;
    }

    setLoadingBatchCoils(prev => ({ ...prev, [batchId]: true }));
    try {
      const q = query(collection(db, 'wire_coils'), where('batchId', '==', batchId));
      const snap = await getDocs(q);
      const coils = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setExpandedReceivingIds(prev => ({ ...prev, [batchId]: coils }));
    } catch (err) {
      console.error("Error fetching batch coils:", err);
    } finally {
      setLoadingBatchCoils(prev => ({ ...prev, [batchId]: false }));
    }
  };

  const exportCSV = () => {
    try {
      let headers, rows;
      if (reportType === 'dds') {
        headers = ['Colaborador', 'Tema', 'Turno', 'Letra', 'Executante', 'Humor', 'Data/Hora'];
        rows = filteredData.map(item => [
          `"${item.userName}"`,
          `"${item.sessionTitle}"`,
          `"${item.shift}"`,
          `"${item.group}"`,
          `"${item.executor}"`,
          `"${item.mood === 'happy' ? 'FELIZ' : item.mood === 'neutral' ? 'NEUTRO' : item.mood === 'sad' ? 'TRISTE' : item.mood || '-'}"`,
          `"${formatLocalDateTimeBR(item.timestamp)}"`
        ]);
      } else if (reportType === 'forklift') {
        headers = ['Equipamento', 'Condutor', 'Turno', 'Letra', 'Status', 'Data/Hora'];
        rows = filteredData.map(item => [
          `"${item.forkliftNumber}"`,
          `"${item.conductorName}"`,
          `"${item.shift}"`,
          `"${item.group}"`,
          `"${item.status}"`,
          `"${formatLocalDateTimeBR(item.timestamp)}"`
        ]);
      } else if (reportType === 'stops_control') {
        headers = ['Data', 'Tipo', 'Linha', 'Início', 'Término', 'Duração (min)', 'Rejeição (min)', 'MS1 (m/min)', 'MS2 (m/min)', 'Frentes de Trabalho', 'Atividades Detalhadas', 'Observação', 'Responsável'];
        rows = filteredData.map((item: StopReport) => {
          const duration = getMinutesDiff(item.startTime, item.endTime);
          const fronts = (item.workFronts || []).map(wf => wf.front).join('; ');
          const activities = (item.workFronts || []).map(wf => `[${wf.front}] ${wf.description || ''} (${wf.startTime}-${wf.endTime})`).join(' | ');
          return [
            `"${formatDateToBR(item.date)}"`,
            `"${getStopTypeLabel(item.type)}"`,
            `"${item.lineName || item.lineId}"`,
            `"${item.startTime}"`,
            `"${item.endTime}"`,
            `"${duration}"`,
            `"${item.rejectionTime || 0}"`,
            `"${item.cutterSpeedMS1 || 0}"`,
            `"${item.cutterSpeedMS2 || 0}"`,
            `"${fronts}"`,
            `"${activities.replace(/"/g, '""')}"`,
            `"${(item.observation || '').replace(/"/g, '""')}"`,
            `"${item.userName || 'Sistema'}"`
          ];
        });
      } else if (reportType === 'wire_receiving') {
        headers = ['NF', 'Fornecedor', 'Bobinas', 'Peso Total (kg)', 'Responsável', 'Data'];
        rows = filteredData.map(item => [
          `"${item.nfNumber}"`,
          `"${item.supplierName}"`,
          `"${item.coilsCount}"`,
          `"${item.totalWeight}"`,
          `"${item.responsibleName}"`,
          `"${formatLocalDateBR(item.timestamp)}"`
        ]);
      } else if (reportType === 'quality') {
        headers = ['Colaborador', 'Checklist', 'Linha', 'Setor', 'Escala', 'Itens', 'Data/Hora'];
        rows = filteredData.map(item => [
          `"${item.userName}"`,
          `"${item.templateName}"`,
          `"${lines.find(l => l.id === item.lineId)?.name || 'N/A'}"`,
          `"${qualitySectors.find(s => s.id === item.sectorId)?.name || 'Todos'}"`,
          `"${item.shift}"`,
          `"${item.responses.length}"`,
          `"${formatLocalDateTimeBR(item.timestamp)}"`
        ]);
      } else if (reportType === 'pending_equipments') {
        headers = ['Tag', 'Equipamento', 'Linha', 'Setor', 'Area', 'Motivo', 'Observacao', 'Operador', 'Programacao', 'Nota SAP', 'Acao Realizada', 'Centro Responsavel', 'Data Identificacao'];
        rows = filteredData.map(item => [
          `"${item.tag}"`,
          `"${item.name}"`,
          `"${item.line}"`,
          `"${item.sector}"`,
          `"${item.area}"`,
          `"${item.reason}"`,
          `"${item.notes || ''}"`,
          `"${item.operator}"`,
          `"${item.schedule || ''}"`,
          `"${item.sapNote || ''}"`,
          `"${item.actionTaken || ''}"`,
          `"${item.responsibleCenter || ''}"`,
          `"${formatLocalDateTimeBR(item.timestamp)}"`
        ]);
      } else {
        headers = ['Bobina (ID)', 'Bitola (mm)', 'Peso (kg)', 'Linha', 'Turno', 'Letra', 'Usuário', 'Data/Hora'];
        rows = filteredData.map(item => [
          `"${item.coilNumber}"`,
          `"${item.diameter}"`,
          `"${item.weight}"`,
          `"${lines.find(l => l.id === item.currentLineId)?.name || 'N/A'}"`,
          `"${item.consumedShift}"`,
          `"${item.consumedByGroup || '-'}"`,
          `"${item.consumedBy}"`,
          `"${formatLocalDateTimeBR(item.timestamp)}"`
        ]);
      }

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', `relatorio_${reportType}_${new Date().getTime()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error(err);
    }
  };

  const exportSingleChecklistPDF = (check: any) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    // Header
    doc.setFillColor(5, 150, 105); // emerald-600
    doc.rect(0, 0, pageWidth, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(sanitizePdfText(`INSPECAO # ${check.forkliftNumber}`), 14, 25);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(sanitizePdfText(`Data: ${format(check.timestamp, "dd/MM/yyyy 'as' HH:mm", { locale: ptBR })}`), 14, 33);

    // Info Table
    const infoData = [
      ['Equipamento:', check.forkliftNumber, 'Status:', check.status === 'normal' ? 'CONFORME' : 'NAO CONFORME'],
      ['Condutor:', check.conductorName, 'Turno:', check.shift],
      ['Grupo (Letra):', check.group, 'ID:', check.id]
    ];
    const sanitizedInfoData = infoData.map((row: any) => row.map((cell: any) => sanitizePdfText(cell)));

    autoTable(doc, {
      startY: 45,
      body: sanitizedInfoData,
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 30 },
        1: { cellWidth: 60 },
        2: { fontStyle: 'bold', cellWidth: 30 },
        3: { fontStyle: 'bold' }
      }
    });

    // Checklist Items
    doc.setTextColor(15, 23, 42); // slate-900
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Itens de Verificacao', 14, (doc as any).lastAutoTable.finalY + 15);

    // Filter checkItemsList to only show active items OR items that have a result in this check
    // Actually, usually we show all items that are assigned to this checklist
    const checkItemsData = checkItemsList.map((item) => {
      const res = check.itemResults[item.id];
      if (!res) return null; // Skip items that don't have results in this specific check
      
      const label = item.name;
      let valueStr = res.value === true ? 'SIM' : res.value === false ? 'NAO' : String(res.value);
      return [label, valueStr, res.status === 'normal' ? 'NORMAL' : 'ANORMAL'];
    }).filter(Boolean);
    const sanitizedCheckItemsData = checkItemsData.map((row: any) => row.map((cell: any) => sanitizePdfText(cell)));

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [['Item da Verificacao', 'Resposta', 'Status']],
      body: sanitizedCheckItemsData,
      headStyles: { 
        fillColor: [241, 245, 249], 
        textColor: [71, 85, 105],
        fontStyle: 'bold'
      }, // slate-50, slate-500
      styles: { fontSize: 9 },
      columnStyles: {
        1: { halign: 'center' },
        2: { halign: 'center', fontStyle: 'bold' }
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 2) {
          if (data.cell.raw === 'ANORMAL') {
            data.cell.styles.textColor = [225, 29, 72]; // rose-600
          } else {
            data.cell.styles.textColor = [5, 150, 105]; // emerald-600
          }
        }
      }
    });

    // Notes
    if (check.notes) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Observacoes', 14, (doc as any).lastAutoTable.finalY + 15);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(100, 116, 139); // slate-500
      const splitNotes = doc.splitTextToSize(sanitizePdfText(check.notes), pageWidth - 28);
      doc.text(splitNotes, 14, (doc as any).lastAutoTable.finalY + 22);
    }

    doc.save(`inspecao_${check.forkliftNumber}_${format(check.timestamp, 'yyyyMMdd_HHmm')}.pdf`);
  };

  const [selectedForkliftCheck, setSelectedForkliftCheck] = useState<any | null>(null);
  const [selectedPendingEquipment, setSelectedPendingEquipment] = useState<any | null>(null);
  const [editingConsumption, setEditingConsumption] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ line: '', shift: '', group: '' });
  const [isSaving, setIsSaving] = useState(false);

  const handleEditConsumption = (item: any) => {
    setEditingConsumption(item);
    setEditForm({
      line: item.currentLineId || '',
      shift: item.consumedShift || '',
      group: item.consumedByGroup || '-'
    });
  };

  const saveConsumptionEdit = async () => {
    if (!editingConsumption) return;
    setIsSaving(true);
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      await updateDoc(doc(db, 'wire_coils', editingConsumption.id), {
        currentLineId: editForm.line,
        consumedShift: editForm.shift,
        consumedByGroup: editForm.group
      });
      
      // Update local state and close
      setWireConsumptionData(prev => prev.map(c => 
        c.id === editingConsumption.id 
          ? { ...c, currentLineId: editForm.line, consumedShift: editForm.shift, consumedByGroup: editForm.group } 
          : c
      ));
      setEditingConsumption(null);
      setModalConfig({
        isOpen: true,
        title: 'Sucesso!',
        message: 'Alterações salvas com sucesso.',
        type: 'success'
      });
    } catch (err) {
      console.error("Error updating consumption record:", err);
      setModalConfig({
        isOpen: true,
        title: 'Erro ao Salvar',
        message: 'Ocorreu um erro ao salvar as alterações do registro.',
        type: 'error'
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isManager) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[2rem] border border-slate-200 shadow-sm border-dashed">
         <FileDown className="w-16 h-16 text-slate-200 mb-4" />
         <h2 className="text-xl font-bold text-slate-900">Acesso Restrito</h2>
         <p className="text-slate-500">Apenas gestores podem visualizar relatórios consolidados.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 no-print">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Painel de Relatórios</h1>
          <p className="text-slate-500 mt-1">Gestão inteligente e exportação de participações.</p>
        </div>

        <div className="relative">
          <button
            onClick={() => setShowTypeMenu(!showTypeMenu)}
            className="flex items-center gap-3 px-5 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-black uppercase tracking-tight text-slate-700 shadow-sm hover:border-emerald-200 transition-all active:scale-95"
          >
            {reportType === 'dds' && <><ShieldCheck className="w-5 h-5 text-emerald-600" /> DDS Online</>}
            {reportType === 'forklift' && <><Truck className="w-5 h-5 text-emerald-600" /> Empilhadeiras</>}
            {reportType === 'stops_control' && <><Clock className="w-5 h-5 text-emerald-600" /> Controle de Parada</>}
            {reportType === 'wire_receiving' && <><FileText className="w-5 h-5 text-emerald-600" /> Recebimento</>}
            {reportType === 'wire_consumption' && <><Factory className="w-5 h-5 text-emerald-600" /> Consumo</>}
            {reportType === 'quality' && <><ClipboardCheck className="w-5 h-5 text-emerald-600" /> Qualidade</>}
            {reportType === 'pending_equipments' && <><AlertTriangle className="w-5 h-5 text-emerald-600" /> Equipamentos c/ Pendência</>}
            {reportType === 'user_ray_x' && <><UserIcon className="w-5 h-5 text-emerald-600" /> Raio-X Colaborador</>}
            <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", showTypeMenu && "rotate-180")} />
          </button>

          <AnimatePresence>
            {showTypeMenu && (
              <React.Fragment key="type-menu-fragment">
                <div 
                  className="fixed inset-0 z-10" 
                  onClick={() => setShowTypeMenu(false)} 
                />
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute left-0 mt-2 w-64 bg-white border border-slate-100 rounded-2xl shadow-2xl z-20 overflow-hidden p-1.5"
                >
                  <button
                    onClick={() => { setReportType('dds'); setShowTypeMenu(false); }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-xs font-black uppercase tracking-tight transition-all",
                      reportType === 'dds' ? "bg-emerald-50 text-emerald-700" : "text-slate-500 hover:bg-slate-50"
                    )}
                  >
                    <ShieldCheck className="w-4 h-4" /> DDS Online
                  </button>
                  <button
                    onClick={() => { setReportType('stops_control'); setShowTypeMenu(false); }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-xs font-black uppercase tracking-tight transition-all",
                      reportType === 'stops_control' ? "bg-emerald-50 text-emerald-700" : "text-slate-500 hover:bg-slate-50"
                    )}
                  >
                    <Clock className="w-4 h-4" /> Controle de Parada
                  </button>
                  <button
                    onClick={() => { setReportType('forklift'); setShowTypeMenu(false); }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-xs font-black uppercase tracking-tight transition-all",
                      reportType === 'forklift' ? "bg-emerald-50 text-emerald-700" : "text-slate-500 hover:bg-slate-50"
                    )}
                  >
                    <Truck className="w-4 h-4" /> Empilhadeiras
                  </button>
                  <button
                    onClick={() => { setReportType('wire_receiving'); setShowTypeMenu(false); }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-xs font-black uppercase tracking-tight transition-all",
                      reportType === 'wire_receiving' ? "bg-emerald-50 text-emerald-700" : "text-slate-500 hover:bg-slate-50"
                    )}
                  >
                    <FileText className="w-4 h-4" /> Recebimento Arame
                  </button>
                  <button
                    onClick={() => { setReportType('wire_consumption'); setShowTypeMenu(false); }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-xs font-black uppercase tracking-tight transition-all",
                      reportType === 'wire_consumption' ? "bg-emerald-50 text-emerald-700" : "text-slate-500 hover:bg-slate-50"
                    )}
                  >
                    <Factory className="w-4 h-4" /> Consumo Arame
                  </button>
                  <button
                    onClick={() => { setReportType('quality'); setShowTypeMenu(false); }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-xs font-black uppercase tracking-tight transition-all",
                      reportType === 'quality' ? "bg-emerald-50 text-emerald-700" : "text-slate-500 hover:bg-slate-50"
                    )}
                  >
                    <ClipboardCheck className="w-4 h-4" /> Qualidade
                  </button>
                  <button
                    onClick={() => { setReportType('pending_equipments'); setShowTypeMenu(false); }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-xs font-black uppercase tracking-tight transition-all border-t border-slate-100 mt-1 pt-2",
                      reportType === 'pending_equipments' ? "bg-emerald-50 text-emerald-700" : "text-slate-500 hover:bg-slate-50"
                    )}
                  >
                    <AlertTriangle className="w-4 h-4 text-rose-500" /> Equipamentos c/ Pendência
                  </button>
                  {(isAdmin || isMaster) && (
                    <button
                      onClick={() => { setReportType('user_ray_x'); setShowTypeMenu(false); }}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-xs font-black uppercase tracking-tight transition-all border-t border-slate-100 mt-1 pt-2",
                        reportType === 'user_ray_x' ? "bg-emerald-50 text-emerald-700" : "text-slate-500 hover:bg-slate-50"
                      )}
                    >
                      <UserIcon className="w-4 h-4 text-emerald-600" /> Raio-X Colaborador
                    </button>
                  )}
                </motion.div>
              </React.Fragment>
            )}
          </AnimatePresence>
        </div>

        {reportType !== 'user_ray_x' ? (
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing || loading}
              title="Recarregar dados do relatório sob demanda (economiza leituras do Firebase)"
              className="flex items-center gap-2 bg-white hover:bg-emerald-50/50 text-slate-700 hover:text-emerald-700 border border-slate-200 px-4 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className={cn("w-4 h-4 text-emerald-600", (isRefreshing || loading) && "animate-spin")} />
              <span>{isRefreshing ? 'Atualizando...' : 'Atualizar'}</span>
            </button>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm border",
                showFilters ? "bg-slate-900 border-slate-900 text-white" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
              )}
            >
              <Filter className="w-4 h-4" />
              {showFilters ? 'Ocultar Filtros' : 'Filtrar Dados'}
            </button>
            <button
              onClick={exportCSV}
              className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
              title="Exportar dados carregados para planilha Excel/CSV"
            >
              <TableIcon className="w-4 h-4 text-emerald-600" />
              CSV
            </button>
            <button
              onClick={exportPDF}
              className="flex items-center gap-2 bg-emerald-600 px-4 py-2.5 rounded-xl text-sm font-bold text-white hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
            >
              <FileText className="w-4 h-4" />
              PDF
            </button>
            <span className="text-[11px] text-slate-400 font-medium hidden lg:inline ml-1">
              Atualizado: {formatLocalTimeBR(lastRefreshedAt)}
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing || loading}
              title="Recarregar auditoria de acessos sob demanda"
              className="flex items-center gap-2 bg-white hover:bg-emerald-50/50 text-slate-700 hover:text-emerald-700 border border-slate-200 px-3.5 py-2.5 rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className={cn("w-4 h-4 text-emerald-600", (isRefreshing || loading) && "animate-spin")} />
              <span>{isRefreshing ? 'Atualizando...' : 'Atualizar'}</span>
            </button>
            {/* View Mode Toggle Pill */}
            <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 border border-slate-200/80">
              <button
                onClick={() => setRayXViewMode('team_summary')}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black uppercase tracking-tight transition-all",
                  rayXViewMode === 'team_summary' 
                    ? "bg-white text-slate-900 shadow-sm" 
                    : "text-slate-500 hover:text-slate-900"
                )}
              >
                <Users className="w-3.5 h-3.5 text-emerald-600" />
                Relatório Geral da Equipe
              </button>
              <button
                onClick={() => setRayXViewMode('individual')}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black uppercase tracking-tight transition-all",
                  rayXViewMode === 'individual' 
                    ? "bg-white text-slate-900 shadow-sm" 
                    : "text-slate-500 hover:text-slate-900"
                )}
              >
                <UserIcon className="w-3.5 h-3.5 text-emerald-600" />
                Dossiê Individual
              </button>
            </div>

            <button
              onClick={exportTeamRayXCSV}
              className="flex items-center gap-2 px-3.5 py-2.5 bg-white border border-slate-200 hover:border-emerald-200 rounded-xl text-xs font-bold text-slate-700 shadow-sm transition-all active:scale-95 cursor-pointer"
              title="Exportar planilha de auditoria de acessos e usabilidade"
            >
              <TableIcon className="w-4 h-4 text-emerald-600" />
              CSV Acessos
            </button>

            <button
              onClick={rayXViewMode === 'individual' ? exportRayXIndividualPDF : exportTeamRayXPDF}
              disabled={exportingRayXPdf || (rayXViewMode === 'individual' && !selectedUserData)}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed"
              title="Exportar relatório em PDF com layout profissional"
            >
              <FileDown className="w-4 h-4" />
              {exportingRayXPdf 
                ? 'Gerando PDF...' 
                : (rayXViewMode === 'individual' ? 'Exportar Dossiê (PDF)' : 'Exportar Relatório Geral (PDF)')}
            </button>
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {reportType === 'stops_control' ? (
          <motion.div
            key="stops-stats"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
          >
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total de Paradas</p>
                <p className="text-2xl font-black text-slate-900">{stopsStats.total}</p>
              </div>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-sky-100 text-sky-600 rounded-2xl flex items-center justify-center">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tempo Total Parado</p>
                <p className="text-2xl font-black text-slate-900">{formatDurationString(stopsStats.totalMinutes)}</p>
              </div>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center">
                <Wrench className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Frentes Acionadas</p>
                <p className="text-2xl font-black text-slate-900">{stopsStats.totalFronts}</p>
              </div>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center">
                <Layers className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo Predominante</p>
                <p className="text-2xl font-black text-slate-900">{stopsStats.predominantType}</p>
              </div>
            </div>
          </motion.div>
        ) : reportType === 'forklift' ? (
          <motion.div
            key="forklift-stats"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"
          >
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total de Inspeções</p>
                <p className="text-2xl font-black text-slate-900">{forkliftData.length}</p>
              </div>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Anormalidades</p>
                <p className="text-2xl font-black text-rose-600">{forkliftData.filter(f => f.status === 'anormal').length}</p>
              </div>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-100 text-slate-600 rounded-2xl flex items-center justify-center">
                <Truck className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Equipamentos Ativos</p>
                <p className="text-2xl font-black text-slate-900">{new Set(forkliftData.map(f => f.forkliftNumber)).size}</p>
              </div>
            </div>
          </motion.div>
        ) : reportType === 'wire_receiving' ? (
          <motion.div
            key="receiving-stats"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"
          >
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Lançamentos de NF</p>
                <p className="text-2xl font-black text-slate-900">{wireReceivingData.length}</p>
              </div>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Peso Total Recebido</p>
                <p className="text-2xl font-black text-slate-900">{wireReceivingData.reduce((acc, b) => acc + b.totalWeight, 0).toLocaleString('pt-BR')} kg</p>
              </div>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-100 text-slate-600 rounded-2xl flex items-center justify-center">
                <Package className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total de Bobinas</p>
                <p className="text-2xl font-black text-slate-900">{wireReceivingData.reduce((acc, b) => acc + b.coilsCount, 0)}</p>
              </div>
            </div>
          </motion.div>
        ) : reportType === 'wire_consumption' ? (
          <motion.div
            key="consumption-stats"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"
          >
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center">
                <Package className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bobinas Consumidas</p>
                <p className="text-2xl font-black text-slate-900">{wireConsumptionData.length}</p>
              </div>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Peso Total Consumido</p>
                <p className="text-2xl font-black text-slate-900">{wireConsumptionData.reduce((acc, c) => acc + c.weight, 0).toLocaleString('pt-BR')} kg</p>
              </div>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-100 text-slate-600 rounded-2xl flex items-center justify-center">
                <Factory className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Linhas Ativas</p>
                <p className="text-2xl font-black text-slate-900">{new Set(wireConsumptionData.map(c => c.currentLineId)).size}</p>
              </div>
            </div>
          </motion.div>
        ) : reportType === 'pending_equipments' ? (
          <motion.div
            key="pending-equipments-stats"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"
          >
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total de Pendências</p>
                <p className="text-2xl font-black text-rose-600">{filteredData.length}</p>
              </div>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center">
                <Wrench className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Equipamentos Afetados</p>
                <p className="text-2xl font-black text-slate-900">{new Set(filteredData.map(p => p.tag || p.name)).size}</p>
              </div>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center">
                <Factory className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Linhas c/ Pendência</p>
                <p className="text-2xl font-black text-slate-900">{new Set(filteredData.map(p => p.line)).size}</p>
              </div>
            </div>
          </motion.div>
        ) : (
          orphanIds.length > 0 && (
            <motion.div
              key="dds-orphans"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center justify-between p-4 bg-rose-50 border border-rose-200 rounded-2xl mb-8"
            >
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                <div>
                  <p className="text-sm font-bold text-rose-900">Registros de participação órfãos detectados</p>
                  <p className="text-xs text-rose-600">Existem {orphanIds.length} assinaturas vinculadas a DDS que foram excluídos incorretamente no passado.</p>
                </div>
              </div>
              <button
                onClick={handleCleanupOrphans}
                disabled={cleaningUp}
                className="flex items-center gap-2 bg-rose-600 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-rose-700 transition-all disabled:opacity-50"
              >
                {cleaningUp ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                Limpar Todos
              </button>
            </motion.div>
          )
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showFilters && (
          <motion.div
            key="filters-panel-container"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative">
              <button 
                onClick={resetFilters}
                className="absolute top-4 right-4 text-slate-400 hover:text-rose-500 transition-colors"
                title="Limpar Filtros"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                  {reportType === 'dds' ? 'Colaborador / Executante' : 
                   reportType === 'forklift' ? 'Condutor / Equipamento' :
                   reportType === 'wire_receiving' ? 'NF / Fornecedor' : 
                   reportType === 'pending_equipments' ? 'Buscar Geral / Operador' :
                   reportType === 'stops_control' ? 'Registrado por / Local' : 'Bobina / Usuário'}
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                  <input 
                    type="text" 
                    value={filterUser}
                    onChange={(e) => setFilterUser(e.target.value)}
                    placeholder={
                      reportType === 'dds' ? "Buscar nome..." : 
                      reportType === 'forklift' ? "Nome ou Nº Equipamento..." :
                      reportType === 'wire_receiving' ? "NF ou Fornecedor..." : 
                      reportType === 'pending_equipments' ? "Buscar por TAG, nome, operador, motivo..." :
                      reportType === 'stops_control' ? "Responsável, local ou obs..." : "ID Bobina ou Usuário..."
                    }
                    className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Dedicated Equipment with Pendency Dropdown Selector */}
              {reportType === 'pending_equipments' && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                    Equipamento c/ Pendência ({availablePendingEquipments.length})
                  </label>
                  <div className="relative">
                    <Wrench className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                    <select 
                      value={filterEquipment}
                      onChange={(e) => setFilterEquipment(e.target.value)}
                      className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none appearance-none transition-all"
                    >
                      <option value="all">Todos os Equipamentos ({availablePendingEquipments.length})</option>
                      {availablePendingEquipments.map((eq, eqIdx) => {
                        const val = eq.tag !== 'S/T' && eq.tag ? eq.tag : eq.name;
                        return (
                          <option key={`pending-eq-${eq.tag}-${eq.name}-${eqIdx}`} value={val}>
                            {eq.tag !== 'S/T' && eq.tag ? `[TAG: ${eq.tag}] ` : ''}{eq.name}{eq.line ? ` • ${eq.line}` : ''}
                          </option>
                        );
                      })}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              )}

              {/* Stops Control Filters: Frentes de Trabalho, Atividade, Tipo de Parada, Duração, Linha */}
              {reportType === 'stops_control' && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Frente de Trabalho</label>
                    <div className="relative">
                      <Wrench className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                      <select 
                        value={filterStopFront}
                        onChange={(e) => setFilterStopFront(e.target.value)}
                        className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none appearance-none transition-all"
                      >
                        <option value="all">Todas as Frentes</option>
                        {availableWorkFronts.map((front) => (
                          <option key={front} value={front}>{front}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Atividade Realizada</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                      <input 
                        type="text" 
                        value={filterStopActivity}
                        onChange={(e) => setFilterStopActivity(e.target.value)}
                        placeholder="Buscar atividade executada..."
                        className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Tipo de Parada</label>
                    <div className="relative">
                      <Layers className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                      <select 
                        value={filterStopType}
                        onChange={(e) => setFilterStopType(e.target.value)}
                        className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none appearance-none transition-all"
                      >
                        <option value="all">Todos os Tipos</option>
                        <option value="programada">Programada</option>
                        <option value="geral">Geral</option>
                        <option value="emergencia">Emergência</option>
                        <option value="inspecao">Inspeção</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Duração da Parada</label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                      <select 
                        value={filterStopDuration}
                        onChange={(e) => setFilterStopDuration(e.target.value)}
                        className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none appearance-none transition-all"
                      >
                        <option value="all">Todas as Durações</option>
                        <option value="up_to_30">Até 30 minutos</option>
                        <option value="30_to_60">30 a 60 minutos</option>
                        <option value="60_to_120">1 a 2 horas</option>
                        <option value="120_to_240">2 a 4 horas</option>
                        <option value="over_240">Mais de 4 horas</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Linha de Produção</label>
                    <div className="relative">
                      <Factory className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                      <select 
                        value={filterLine}
                        onChange={(e) => setFilterLine(e.target.value)}
                        className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none appearance-none transition-all"
                      >
                        <option value="all">Todas as Linhas</option>
                        {lines.map((line, lIdx) => (
                          <option key={`stop-line-${line.id || lIdx}`} value={line.id}>{line.name}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                </>
              )}

              {reportType === 'dds' && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Tema (DDS)</label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                    <input 
                      type="text" 
                      value={filterTheme}
                      onChange={(e) => setFilterTheme(e.target.value)}
                      placeholder="Título do DDS..."
                      className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                </div>
              )}

              {reportType === 'forklift' && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Status da Inspeção</label>
                  <div className="relative">
                    <AlertTriangle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                    <select 
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none appearance-none transition-all"
                    >
                      <option value="all">Todas Inspeções</option>
                      <option value="normal">✅ Normal</option>
                      <option value="anormal">❌ Anormal</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              )}

              {reportType === 'quality' && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Setor / Linha</label>
                  <div className="relative">
                    <ListFilter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                    <select 
                      value={filterLine}
                      onChange={(e) => setFilterLine(e.target.value)}
                      className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none appearance-none transition-all"
                    >
                      <option value="all">Todos Setores/Linhas</option>
                      <option value="all_factory">Fábrica Completa</option>
                      <optgroup label="Setores">
                        {qualitySectors.map((s, sIdx) => (
                          <option key={`sector-opt-${s.id || sIdx}`} value={s.id}>{s.name}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Linhas">
                        {lines.map((l, lIdx) => (
                          <option key={`line-opt-${l.id || lIdx}`} value={l.id}>{l.name}</option>
                        ))}
                      </optgroup>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              )}

              {reportType !== 'wire_receiving' && reportType !== 'stops_control' && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Turno</label>
                  <div className="relative">
                    <select 
                      value={filterShift}
                      onChange={(e) => setFilterShift(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none appearance-none transition-all"
                    >
                      <option value="all">Todos Turnos</option>
                      <option value="Turno 1">Turno 1</option>
                      <option value="Turno 2">Turno 2</option>
                      <option value="Turno 3">Turno 3</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              )}

              {(reportType === 'dds' || reportType === 'forklift' || reportType === 'wire_consumption' || reportType === 'pending_equipments') && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Letra</label>
                  <div className="relative">
                    <select 
                      value={filterGroup}
                      onChange={(e) => setFilterGroup(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none appearance-none transition-all"
                    >
                      <option value="all">Todas Letras</option>
                      <option value="A">Letra A</option>
                      <option value="B">Letra B</option>
                      <option value="C">Letra C</option>
                      <option value="D">Letra D</option>
                      <option value="E">Letra E</option>
                      <option value="ADM">ADM</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              )}

              {(reportType === 'wire_consumption' || reportType === 'pending_equipments') && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Linha de Produção</label>
                  <div className="relative">
                    <Factory className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                    <select 
                      value={filterLine}
                      onChange={(e) => setFilterLine(e.target.value)}
                      className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none appearance-none transition-all"
                    >
                      <option value="all">Todas as Linhas</option>
                      {reportType === 'pending_equipments' && availablePendingLines.length > 0 ? (
                        availablePendingLines.map((lName, lIdx) => (
                          <option key={`pending-line-${lName || lIdx}`} value={lName}>{lName}</option>
                        ))
                      ) : (
                        lines.map((line, lIdx) => (
                          <option key={`line-opt-cons-${line.id || lIdx}`} value={line.id}>{line.name}</option>
                        ))
                      )}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              )}

              {reportType === 'dds' && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Humor</label>
                  <div className="relative">
                    <select 
                      value={filterMood}
                      onChange={(e) => setFilterMood(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none appearance-none transition-all"
                    >
                      <option value="all">Todos Humores</option>
                      <option value="happy">Feliz</option>
                      <option value="neutral">Neutro</option>
                      <option value="sad">Triste</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Início do Período</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                  <input 
                    type="date" 
                    value={filterDateStart}
                    onChange={(e) => setFilterDateStart(e.target.value)}
                    className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Fim do Período</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                  <input 
                    type="date" 
                    value={filterDateEnd}
                    onChange={(e) => setFilterDateEnd(e.target.value)}
                    className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="flex items-end pb-1 ml-1">
                <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-[0.15em]">
                  {filteredData.length} registros encontrados
                </p>
              </div>

              {/* Quick Date Presets Row */}
              <div className="col-span-1 md:col-span-2 lg:col-span-4 flex flex-wrap items-center gap-2 pt-4 border-t border-slate-100">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mr-1">Atalhos de Período:</span>
                <button
                  type="button"
                  onClick={() => handleSetDatePreset('today')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all border cursor-pointer",
                    filterDateStart === todayStr && filterDateEnd === todayStr
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-600/20"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  )}
                >
                  Hoje (Padrão Rápido)
                </button>
                <button
                  type="button"
                  onClick={() => handleSetDatePreset('yesterday')}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 transition-all cursor-pointer"
                >
                  Ontem
                </button>
                <button
                  type="button"
                  onClick={() => handleSetDatePreset('week')}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 transition-all cursor-pointer"
                >
                  Últimos 7 dias
                </button>
                <button
                  type="button"
                  onClick={() => handleSetDatePreset('month')}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 transition-all cursor-pointer"
                >
                  Este Mês
                </button>
                <button
                  type="button"
                  onClick={() => handleSetDatePreset('all')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all border cursor-pointer",
                    !filterDateStart && !filterDateEnd
                      ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  )}
                >
                  Histórico Geral (Todos)
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {reportType === 'user_ray_x' ? (
        <div className="bg-white rounded-[2rem] p-6 lg:p-8 border border-slate-200/80 shadow-sm space-y-8">
          {/* Top Sub-Header & Mode Navigation */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200/50">
                  Acesso: Admin & Master
                </span>
                <span className="text-slate-400 text-xs">•</span>
                <span className="text-slate-500 text-xs font-semibold">Auditoria & Usabilidade</span>
              </div>
              <h2 className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight mt-1">
                {rayXViewMode === 'team_summary' 
                  ? 'Relatório Geral de Acessos e Usabilidade da Equipe' 
                  : 'Dossiê Individual do Colaborador (Raio-X de Trabalho)'}
              </h2>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl">
                {rayXViewMode === 'team_summary'
                  ? 'Acompanhe se os colaboradores estão acessando o aplicativo SecApp, a frequência de logins e o engajamento operacional em cada módulo.'
                  : 'Análise aprofundada de um colaborador específico: frequência de login, sessões recentes, usabilidade e conformidade operacional.'}
              </p>
            </div>

            {/* View Mode Switching Tabs & Individual Selector */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 border border-slate-200/80">
                <button
                  onClick={() => setRayXViewMode('team_summary')}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black uppercase tracking-tight transition-all",
                    rayXViewMode === 'team_summary' 
                      ? "bg-white text-slate-900 shadow-sm" 
                      : "text-slate-500 hover:text-slate-900"
                  )}
                >
                  <Users className="w-3.5 h-3.5 text-emerald-600" />
                  Visão Geral
                </button>
                <button
                  onClick={() => setRayXViewMode('individual')}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black uppercase tracking-tight transition-all",
                    rayXViewMode === 'individual' 
                      ? "bg-white text-slate-900 shadow-sm" 
                      : "text-slate-500 hover:text-slate-900"
                  )}
                >
                  <UserIcon className="w-3.5 h-3.5 text-emerald-600" />
                  Individual
                </button>
              </div>

              {rayXViewMode === 'individual' && (
                <div className="relative min-w-[240px]">
                  <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600" />
                  <select
                    value={selectedRayXUser}
                    onChange={(e) => setSelectedRayXUser(e.target.value)}
                    className="w-full pl-10 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500 appearance-none text-slate-800"
                  >
                    <option value="">-- Selecionar Colaborador ({allUsers.length}) --</option>
                    {allUsers.map((u, uIdx) => {
                      const summary = teamRayXSummary.find(s => s.uId === (u.uid || u.id));
                      const ops = summary ? summary.totalActions : 0;
                      const logins = summary ? summary.accessCount : (Number(u.accessCount) || 0);
                      const usageBadge = logins > 0 ? `${ops} ops • ${logins} logins` : 'Nunca acessou';
                      return (
                        <option key={`usr-ray-${u.uid || u.id || uIdx}`} value={u.uid || u.id}>
                          {u.displayName || u.name || 'Sem nome'} [{usageBadge}] ({u.email || 'sem email'})
                        </option>
                      );
                    })}
                  </select>
                  <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              )}
            </div>
          </div>

          {/* VIEW MODE 1: RELATÓRIO GERAL DA EQUIPE (TEAM SUMMARY) */}
          {rayXViewMode === 'team_summary' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Executive KPI Statistics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
                {/* Total Colaboradores */}
                <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/70 flex flex-col justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Cadastrados</span>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="text-2xl font-black text-slate-900">{teamRayXSummary.length}</span>
                    <span className="text-[11px] font-bold text-slate-400">usuários</span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 mt-1">Base total de contas</span>
                </div>

                {/* Acessam o Sistema */}
                <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-200/60 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800">Acessam o Sistema</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="text-2xl font-black text-emerald-700">{activeAccessMembers}</span>
                    <span className="text-[11px] font-bold text-emerald-600">({accessAdoptionRate}%)</span>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700 mt-1">Colaboradores ativos</span>
                </div>

                {/* Nunca Acessaram */}
                <div className="bg-rose-50/50 p-4 rounded-2xl border border-rose-200/60 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-rose-800">Nunca Acessaram</span>
                    {neverAccessedMembers > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black bg-rose-200/70 text-rose-800">Atenção</span>
                    )}
                  </div>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="text-2xl font-black text-rose-700">{neverAccessedMembers}</span>
                    <span className="text-[11px] font-bold text-rose-600">
                      ({teamRayXSummary.length > 0 ? Math.round((neverAccessedMembers / teamRayXSummary.length) * 100) : 0}%)
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-rose-600 mt-1">Requer orientação</span>
                </div>

                {/* Total de Logins / Acessos */}
                <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/70 flex flex-col justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total de Logins</span>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="text-2xl font-black text-slate-900">{totalSystemLogins}</span>
                    <span className="text-[11px] font-bold text-slate-400">sessões</span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 mt-1">Histórico de acessos</span>
                </div>

                {/* Total de Operações e Usabilidade */}
                <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/70 flex flex-col justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total de Operações</span>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="text-2xl font-black text-emerald-600">{totalSystemActions}</span>
                    <span className="text-[11px] font-bold text-slate-400">operações</span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 mt-1">DDS e Inspeções</span>
                </div>
              </div>

              {/* Filters Toolbar */}
              <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/60 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={rayXSearchTerm}
                    onChange={(e) => setRayXSearchTerm(e.target.value)}
                    placeholder="Filtrar por nome, e-mail, cargo ou setor..."
                    className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 placeholder-slate-400"
                  />
                  {rayXSearchTerm && (
                    <button
                      onClick={() => setRayXSearchTerm('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600"
                    >
                      Limpar
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Access Status Filter */}
                  <select
                    value={rayXAccessFilter}
                    onChange={(e) => setRayXAccessFilter(e.target.value as any)}
                    className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="all">Status: Todos</option>
                    <option value="accessed">Apenas quem já acessou ({activeAccessMembers})</option>
                    <option value="never_accessed">Nunca acessaram ({neverAccessedMembers})</option>
                  </select>

                  {/* Shift Filter */}
                  <select
                    value={rayXShiftFilter}
                    onChange={(e) => setRayXShiftFilter(e.target.value)}
                    className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="all">Turnos: Todos</option>
                    <option value="Grupo A">Grupo A</option>
                    <option value="Grupo B">Grupo B</option>
                    <option value="Grupo C">Grupo C</option>
                    <option value="Grupo D">Grupo D</option>
                    <option value="Grupo E">Grupo E</option>
                    <option value="ADM">ADM</option>
                  </select>

                  <span className="text-[11px] font-bold text-slate-500 ml-1">
                    Exibindo <strong>{filteredTeamRayX.length}</strong> de {teamRayXSummary.length}
                  </span>
                </div>
              </div>

              {/* Collaborators Access & Usability Table */}
              <div className="border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-900 text-white font-bold text-[10px] uppercase tracking-wider">
                        <th className="py-3 px-4">Colaborador</th>
                        <th className="py-3 px-3">Cargo / Setor</th>
                        <th className="py-3 px-3 text-center">Turno</th>
                        <th className="py-3 px-3 text-center">Acessa Sistema?</th>
                        <th className="py-3 px-3 text-center">Qtd Acessos</th>
                        <th className="py-3 px-3">Último Acesso</th>
                        <th className="py-3 px-3">Usabilidade (Operações)</th>
                        <th className="py-3 px-3 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredTeamRayX.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-slate-400">
                            <UserX className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                            <p className="font-bold text-xs text-slate-600">Nenhum colaborador encontrado com os filtros selecionados.</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">Tente ajustar a busca ou limpar os filtros de acesso e turno.</p>
                          </td>
                        </tr>
                      ) : (
                        filteredTeamRayX.map((item, idx) => {
                          const initial = (item.name[0] || '?').toUpperCase();
                          return (
                            <tr key={`colab-ray-${item.uId || idx}`} className="hover:bg-slate-50/70 transition-colors">
                              {/* Colaborador */}
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-3">
                                  <div className={cn(
                                    "w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs shrink-0",
                                    item.hasAccessed 
                                      ? "bg-emerald-100 text-emerald-800" 
                                      : "bg-slate-100 text-slate-500"
                                  )}>
                                    {initial}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-bold text-slate-900 truncate">{item.name}</p>
                                    <p className="text-[10px] text-slate-400 truncate">{item.email}</p>
                                  </div>
                                </div>
                              </td>

                              {/* Cargo / Setor */}
                              <td className="py-3 px-3">
                                <p className="font-semibold text-slate-800 text-xs truncate">{item.cargo}</p>
                                <p className="text-[10px] text-slate-400 truncate">{item.sector}</p>
                              </td>

                              {/* Turno */}
                              <td className="py-3 px-3 text-center">
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600">
                                  {item.group}
                                </span>
                              </td>

                              {/* Acessa Sistema? */}
                              <td className="py-3 px-3 text-center">
                                {item.hasAccessed ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                    Sim (Ativo)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-200/60">
                                    <AlertTriangle className="w-3 h-3 text-rose-500" />
                                    Nunca Acessou
                                  </span>
                                )}
                              </td>

                              {/* Qtd Acessos */}
                              <td className="py-3 px-3 text-center">
                                <span className={cn(
                                  "font-black text-xs px-2.5 py-1 rounded-lg",
                                  item.accessCount >= 10 
                                    ? "bg-emerald-100 text-emerald-900" 
                                    : item.accessCount > 0 
                                      ? "bg-slate-100 text-slate-800" 
                                      : "text-slate-300"
                                )}>
                                  {item.accessCount} {item.accessCount === 1 ? 'acesso' : 'acessos'}
                                </span>
                              </td>

                              {/* Último Acesso */}
                              <td className="py-3 px-3 text-slate-600 text-xs">
                                {item.lastLoginRaw ? (
                                  <div>
                                    <p className="font-semibold text-slate-800 text-[11px]">
                                      {formatLocalDateTimeBR(item.lastLoginRaw)}
                                    </p>
                                    <span className="text-[9px] text-slate-400 font-bold uppercase">Registrado</span>
                                  </div>
                                ) : (
                                  <span className="text-slate-400 italic text-[11px]">Nunca acessou</span>
                                )}
                              </td>

                              {/* Usabilidade (Operações) */}
                              <td className="py-3 px-3">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-black text-slate-900 text-xs">
                                      {item.totalActions} {item.totalActions === 1 ? 'operação' : 'operações'}
                                    </span>
                                    <span className={cn(
                                      "px-1.5 py-0.5 rounded text-[9px] font-black uppercase",
                                      item.totalActions > 25 
                                        ? "bg-emerald-100 text-emerald-800" 
                                        : item.totalActions >= 8 
                                          ? "bg-blue-100 text-blue-800" 
                                          : item.totalActions > 0 
                                            ? "bg-amber-100 text-amber-800" 
                                            : "bg-slate-100 text-slate-400"
                                    )}>
                                      {item.totalActions > 25 ? 'Alta Adoção' : item.totalActions >= 8 ? 'Consistente' : item.totalActions > 0 ? 'Inicial' : 'Sem Uso'}
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap gap-1 mt-1 text-[9px] font-bold text-slate-500">
                                    {item.ddsSignaturesCount > 0 && <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-100">DDS Assinados: {item.ddsSignaturesCount}</span>}
                                    {item.ddsCreatedCount > 0 && <span className="bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded border border-teal-100">DDS Criados: {item.ddsCreatedCount}</span>}
                                    {item.qualityCount > 0 && <span className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded border border-purple-100">Qualidade: {item.qualityCount}</span>}
                                    {item.routesCount > 0 && <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100">Rotas: {item.routesCount}</span>}
                                    {item.forkliftCount > 0 && <span className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-100">Empilhadeiras: {item.forkliftCount}</span>}
                                    {item.safetyCount > 0 && <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-100">Segurança: {item.safetyCount}</span>}
                                    {(item.stopsCount > 0 || item.maintenanceCount > 0) && <span className="bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded border border-rose-100">Paradas/Manut: {item.stopsCount + item.maintenanceCount}</span>}
                                    {item.totalActions === 0 && <span className="text-slate-300">Sem operações</span>}
                                  </div>
                                </div>
                              </td>

                              {/* Ações */}
                              <td className="py-3 px-3 text-center">
                                <button
                                  onClick={() => {
                                    setSelectedRayXUser(item.uId);
                                    setRayXViewMode('individual');
                                  }}
                                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 mx-auto cursor-pointer"
                                  title="Ver Raio-X Detalhado e Auditoria do Colaborador"
                                >
                                  <span>Ver Dossiê</span>
                                  <ChevronRight className="w-3 h-3" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {/* VIEW MODE 2: DOSSIÊ INDIVIDUAL (INDIVIDUAL VIEW) */}
          {rayXViewMode === 'individual' && (
            <div>
              {!selectedUserData ? (
                <div className="text-center py-20 px-6 border border-slate-100 rounded-2xl bg-slate-50/50 flex flex-col items-center justify-center">
                  <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-3">
                    <UserIcon className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800">Selecione um Colaborador</h3>
                  <p className="text-slate-400 text-xs max-w-sm mt-1">
                    Escolha um usuário no menu acima para cruzar todas as informações dele registradas no sistema (Acessos, DDS, Empilhadeiras, Arames, Rondas e Desvios de Segurança) e gerar um dossiê completo.
                  </p>
                  <button
                    onClick={() => setRayXViewMode('team_summary')}
                    className="mt-4 px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition-all"
                  >
                    Ver Relatório Geral da Equipe
                  </button>
                </div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  {/* Top Profile Card */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6 bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
                    <div className="md:col-span-5 space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center font-black text-sm">
                          {(selectedUserData.profile.displayName || selectedUserData.profile.name || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <h4 className="text-sm font-black text-slate-900 leading-tight">{selectedUserData.profile.displayName || selectedUserData.profile.name}</h4>
                          <p className="text-[10px] text-slate-400 font-bold">{selectedUserData.profile.email}</p>
                        </div>
                      </div>
                      <div className="pt-3 grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-slate-400 uppercase font-black tracking-widest text-[8px]">Função</span>
                          <p className="font-bold text-slate-700 capitalize text-xs">{selectedUserData.profile.role || 'viewer'}</p>
                        </div>
                        <div>
                          <span className="text-slate-400 uppercase font-black tracking-widest text-[8px]">Grupo / Escala</span>
                          <p className="font-bold text-slate-700 text-xs">{selectedUserData.profile.group || '-'}</p>
                        </div>
                        <div>
                          <span className="text-slate-400 uppercase font-black tracking-widest text-[8px]">Cargo</span>
                          <p className="font-bold text-slate-700 text-xs">{selectedUserData.profile.cargoName || '-'}</p>
                        </div>
                        <div>
                          <span className="text-slate-400 uppercase font-black tracking-widest text-[8px]">Setor</span>
                          <p className="font-bold text-slate-700 text-xs">{selectedUserData.profile.sectorName || '-'}</p>
                        </div>
                        <div>
                          <span className="text-slate-400 uppercase font-black tracking-widest text-[8px]">Status</span>
                          <p className="font-bold text-emerald-600 capitalize text-xs">{selectedUserData.profile.status || 'Ativo'}</p>
                        </div>
                        <div>
                          <span className="text-slate-400 uppercase font-black tracking-widest text-[8px]">Cadastro</span>
                          <p className="font-bold text-slate-700 text-xs">
                            {selectedUserData.profile.createdAt 
                              ? formatDateBR(selectedUserData.profile.createdAt) 
                              : 'Início'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="md:col-span-7 flex flex-col justify-between p-4 bg-white rounded-xl border border-slate-100 shadow-sm">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 uppercase font-black tracking-widest text-[8px] block">Índice de Usabilidade & Operações</span>
                          <button
                            onClick={exportRayXIndividualPDF}
                            disabled={exportingRayXPdf}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold transition-all border border-emerald-200/50 cursor-pointer"
                          >
                            <FileDown className="w-3.5 h-3.5" />
                            {exportingRayXPdf ? 'Gerando...' : 'Exportar Dossiê (PDF)'}
                          </button>
                        </div>
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className="text-3xl font-black text-emerald-600 tracking-tight">{selectedUserData.totalActions}</span>
                          <span className="text-xs font-bold text-slate-400">operações registradas</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 leading-normal">
                          Métrica consolidada baseada em acessos ao sistema e operações em todos os módulos (DDS, Qualidade, Rotas Operacionais, Empilhadeiras, Segurança, Paradas e Manutenção).
                        </p>
                      </div>

                      <div className="mt-3 pt-3 border-t border-slate-50 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-[11px] font-bold">
                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-100/80">
                          <span className="text-[9px] text-slate-400 uppercase font-black block">Acessos</span>
                          <span className="text-slate-800 text-xs font-black">{selectedUserData.accessCount} logins</span>
                        </div>
                        <div className="bg-emerald-50/60 p-2 rounded-lg border border-emerald-100/60">
                          <span className="text-[9px] text-emerald-700 uppercase font-black block">DDS Assinados</span>
                          <span className="text-emerald-900 text-xs font-black">{selectedUserData.ddsSignaturesCount}</span>
                        </div>
                        <div className="bg-teal-50/60 p-2 rounded-lg border border-teal-100/60">
                          <span className="text-[9px] text-teal-700 uppercase font-black block">DDS Criados</span>
                          <span className="text-teal-900 text-xs font-black">{selectedUserData.ddsCreatedCount}</span>
                        </div>
                        <div className="bg-purple-50/60 p-2 rounded-lg border border-purple-100/60">
                          <span className="text-[9px] text-purple-700 uppercase font-black block">Qualidade</span>
                          <span className="text-purple-900 text-xs font-black">{selectedUserData.qualityCount}</span>
                        </div>
                        <div className="bg-blue-50/60 p-2 rounded-lg border border-blue-100/60">
                          <span className="text-[9px] text-blue-700 uppercase font-black block">Rotas</span>
                          <span className="text-blue-900 text-xs font-black">{selectedUserData.routesCount}</span>
                        </div>
                        <div className="bg-amber-50/60 p-2 rounded-lg border border-amber-100/60">
                          <span className="text-[9px] text-amber-700 uppercase font-black block">Empilhadeiras</span>
                          <span className="text-amber-900 text-xs font-black">{selectedUserData.forkliftCount}</span>
                        </div>
                        <div className="bg-indigo-50/60 p-2 rounded-lg border border-indigo-100/60">
                          <span className="text-[9px] text-indigo-700 uppercase font-black block">Segurança</span>
                          <span className="text-indigo-900 text-xs font-black">{selectedUserData.safetyCount}</span>
                        </div>
                        <div className="bg-rose-50/60 p-2 rounded-lg border border-rose-100/60">
                          <span className="text-[9px] text-rose-700 uppercase font-black block">Paradas/Manut</span>
                          <span className="text-rose-900 text-xs font-black">{selectedUserData.stopsCount + selectedUserData.maintenanceCount}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* AUDITORIA DE ACESSO AO SISTEMA (KEY USER REQUIREMENT) */}
                  <div className="bg-slate-900 text-white rounded-2xl p-6 space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                      <div>
                        <div className="flex items-center gap-2">
                          <LogIn className="w-5 h-5 text-emerald-400" />
                          <h3 className="text-base font-black uppercase tracking-tight">Auditoria de Acesso ao Sistema & Usabilidade</h3>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Verificação de frequência de login, sessões ativas e histórico de acesso deste colaborador no SecApp.
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {selectedUserData.hasAccessed ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            Acessa o Sistema (Ativo)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            <AlertTriangle className="w-4 h-4 text-rose-400" />
                            Nunca Acessou o Sistema
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 4 Access Metric Highlights */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {/* Qtd de Acessos */}
                      <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700/60">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Total de Acessos</span>
                        <div className="mt-1 flex items-baseline gap-1.5">
                          <span className="text-2xl font-black text-emerald-400">{selectedUserData.accessCount}</span>
                          <span className="text-xs text-slate-400 font-bold">{selectedUserData.accessCount === 1 ? 'acesso' : 'acessos'}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          {selectedUserData.accessCount >= 10 ? 'Qualificado p/ pesquisa' : `${Math.max(0, 10 - selectedUserData.accessCount)} p/ 10 acessos`}
                        </span>
                      </div>

                      {/* Último Login */}
                      <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700/60">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Último Acesso</span>
                        <p className="text-xs font-bold text-white mt-2">
                          {selectedUserData.lastLoginRaw 
                            ? formatLocalDateTimeBR(selectedUserData.lastLoginRaw) 
                            : 'Nenhum login registrado'}
                        </p>
                        <span className="text-[10px] text-slate-400 mt-1 block">Horário de autenticação</span>
                      </div>

                      {/* Dispositivo Recente */}
                      <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700/60">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Dispositivo Recente</span>
                        <div className="flex items-center gap-2 mt-2">
                          <Laptop className="w-4 h-4 text-emerald-400 shrink-0" />
                          <p className="text-xs font-bold text-white truncate">
                            {selectedUserData.userLogs.length > 0 
                              ? formatUserAgent(selectedUserData.userLogs[0].userAgent)
                              : 'Navegador Web'}
                          </p>
                        </div>
                        <span className="text-[10px] text-slate-400 mt-1 block">Ambiente de acesso</span>
                      </div>

                      {/* Avaliação do App (Pesquisa Popout) */}
                      <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700/60">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Pesquisa de Avaliação</span>
                        <div className="mt-1 flex items-center gap-1.5">
                          {selectedUserData.userFeedback ? (
                            <>
                              <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                              <span className="text-base font-black text-white">{selectedUserData.userFeedback.rating || 0} / 5</span>
                              <span className="text-[10px] text-emerald-400 font-bold ml-1">Respondido</span>
                            </>
                          ) : (
                            <span className="text-xs font-bold text-slate-400">
                              {selectedUserData.accessCount >= 10 ? 'Pendente de resposta' : 'Aguardando 10 acessos'}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 mt-1 block truncate">
                          {selectedUserData.userFeedback?.observation 
                            ? `"${selectedUserData.userFeedback.observation.slice(0, 30)}..."` 
                            : 'Feedback confidencial Master'}
                        </span>
                      </div>
                    </div>

                    {/* Recent Sessions Table */}
                    {selectedUserData.userLogs.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-300">Histórico de Logins Recentes</span>
                          <span className="text-[10px] text-slate-400 font-bold">Exibindo últimos registros capturados</span>
                        </div>
                        <div className="bg-slate-800/50 rounded-xl overflow-hidden border border-slate-700/60">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="bg-slate-800 text-slate-400 text-[10px] uppercase font-black">
                                <th className="py-2.5 px-4">Data e Horário</th>
                                <th className="py-2.5 px-4">Dispositivo / Plataforma</th>
                                <th className="py-2.5 px-4">Email Informado</th>
                                <th className="py-2.5 px-4 text-center">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/50 text-slate-300 text-xs">
                              {selectedUserData.userLogs.slice(0, 5).map((log, lIdx) => (
                                <tr key={`log-${lIdx}`} className="hover:bg-slate-800/30">
                                  <td className="py-2.5 px-4 font-semibold text-white">
                                    {log.localTimeStr || (log.timestamp ? formatLocalDateTimeBR(log.timestamp) : '-')}
                                  </td>
                                  <td className="py-2.5 px-4 text-slate-300">
                                    {formatUserAgent(log.userAgent)}
                                  </td>
                                  <td className="py-2.5 px-4 text-slate-400">
                                    {log.email || selectedUserData.profile.email}
                                  </td>
                                  <td className="py-2.5 px-4 text-center">
                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-500/20 text-emerald-300">
                                      Autenticado
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Operational Modules Breakdown */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* DDS Card */}
                    <div className="bg-slate-50/30 p-5 rounded-2xl border border-slate-100 space-y-3">
                      <div className="flex items-center justify-between">
                        <h5 className="text-[11px] font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4 text-emerald-600" /> Diálogos Diários (DDS)
                        </h5>
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-black rounded-lg border border-emerald-100 flex items-center gap-1" title="Presenças assinadas pelo colaborador">
                            <PenTool className="w-3 h-3" /> {selectedUserData.ddsSignaturesCount} {selectedUserData.ddsSignaturesCount === 1 ? 'Presença' : 'Presenças'}
                          </span>
                          {selectedUserData.ddsCreatedCount > 0 && (
                            <span className="px-2 py-0.5 bg-teal-50 text-teal-700 text-[10px] font-black rounded-lg border border-teal-100 flex items-center gap-1" title="Sessões criadas ou ministradas">
                              <Users className="w-3 h-3" /> {selectedUserData.ddsCreatedCount} {selectedUserData.ddsCreatedCount === 1 ? 'Criada' : 'Criadas'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Tab Switcher: Assinaturas de Presença vs Sessões Criadas */}
                      <div className="flex bg-slate-100 p-0.5 rounded-xl text-[10px] font-black">
                        <button
                          type="button"
                          onClick={() => setRayXDdsTab('signatures')}
                          className={cn(
                            "flex-1 py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                            rayXDdsTab === 'signatures'
                              ? "bg-white text-emerald-700 shadow-xs"
                              : "text-slate-500 hover:text-slate-800"
                          )}
                        >
                          <PenTool className="w-3 h-3" />
                          <span>Assinaturas / Presença ({selectedUserData.ddsSignaturesCount})</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setRayXDdsTab('created')}
                          className={cn(
                            "flex-1 py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                            rayXDdsTab === 'created'
                              ? "bg-white text-teal-700 shadow-xs"
                              : "text-slate-500 hover:text-slate-800"
                          )}
                        >
                          <Users className="w-3 h-3" />
                          <span>Sessões Ministradas ({selectedUserData.ddsCreatedCount})</span>
                        </button>
                      </div>

                      {/* Tab 1: Assinaturas de Presença (Participação do Colaborador) */}
                      {rayXDdsTab === 'signatures' && (
                        <div className="space-y-2">
                          <div className="bg-emerald-50/60 p-2.5 rounded-xl border border-emerald-100/60 flex flex-wrap items-center justify-between gap-2 text-[10px]">
                            <div className="flex items-center gap-1.5 font-black text-emerald-800">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>{selectedUserData.ddsSignaturesCount} {selectedUserData.ddsSignaturesCount === 1 ? 'participação registrada' : 'participações registradas'}</span>
                            </div>
                            <div className="flex items-center gap-1.5 font-bold text-slate-600">
                              <span className="text-emerald-700">😄 {selectedUserData.ddsMoods.happy || 0}</span>
                              <span className="text-blue-700">😐 {selectedUserData.ddsMoods.neutral || 0}</span>
                              <span className="text-amber-700">😟 {selectedUserData.ddsMoods.sad || 0}</span>
                            </div>
                          </div>

                          {selectedUserData.ddsSignaturesCount === 0 ? (
                            <div className="p-4 bg-white rounded-xl border border-slate-100 text-center text-slate-400 text-xs italic">
                              Nenhuma assinatura de presença em DDS registrada para este colaborador.
                            </div>
                          ) : (
                            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                              {selectedUserData.ddsSignaturesList.map((d: any, idx: number) => (
                                <div key={idx} className="bg-white p-2.5 rounded-xl border border-slate-100 hover:border-slate-200 transition-all flex items-start justify-between gap-2 text-[11px]">
                                  <div className="min-w-0 flex-1">
                                    <p className="font-bold text-slate-800 truncate" title={d.sessionTitle || 'DDS'}>
                                      {d.sessionTitle || 'DDS'}
                                    </p>
                                    <p className="text-[10px] text-slate-400 truncate">
                                      Facilitador: <span className="text-slate-600 font-medium">{d.executor || 'Não especificado'}</span>
                                    </p>
                                    <div className="flex items-center gap-2 mt-1 text-[9px] text-slate-400 font-medium">
                                      <span>📅 {formatLocalDateTimeBR(d.timestamp)}</span>
                                      <span>•</span>
                                      <span>Turno {d.shift} ({d.group})</span>
                                    </div>
                                  </div>
                                  <div className="shrink-0 text-right flex flex-col items-end gap-1">
                                    <span className={cn(
                                      "px-2 py-0.5 rounded-full text-[8px] font-black uppercase text-white tracking-wider flex items-center gap-1 shadow-2xs",
                                      d.mood === 'happy' ? "bg-emerald-500" : d.mood === 'neutral' ? "bg-blue-500" : "bg-amber-500"
                                    )}>
                                      {d.mood === 'happy' ? '😄 FELIZ' : d.mood === 'neutral' ? '😐 NEUTRO' : '😟 PREOCUPADO'}
                                    </span>
                                    <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-100/50">
                                      Assinado
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Tab 2: Sessões Criadas / Facilitadas pelo Usuário */}
                      {rayXDdsTab === 'created' && (
                        <div className="space-y-2">
                          <div className="bg-teal-50/60 p-2.5 rounded-xl border border-teal-100/60 flex flex-wrap items-center justify-between gap-2 text-[10px]">
                            <div className="flex items-center gap-1.5 font-black text-teal-800">
                              <Users className="w-3.5 h-3.5 text-teal-600" />
                              <span>{selectedUserData.ddsCreatedCount} {selectedUserData.ddsCreatedCount === 1 ? 'sessão facilitada' : 'sessões facilitadas'}</span>
                            </div>
                            <div className="font-bold text-teal-700">
                              <span>{selectedUserData.ddsTotalSignaturesReceived} assinaturas coletadas</span>
                            </div>
                          </div>

                          {selectedUserData.ddsCreatedCount === 0 ? (
                            <div className="p-4 bg-white rounded-xl border border-slate-100 text-center text-slate-400 text-xs italic">
                              Este colaborador não possui sessões de DDS criadas ou facilitadas no sistema.
                            </div>
                          ) : (
                            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                              {selectedUserData.ddsCreatedList.map((s: any, idx: number) => (
                                <div key={idx} className="bg-white p-2.5 rounded-xl border border-slate-100 hover:border-slate-200 transition-all flex items-start justify-between gap-2 text-[11px]">
                                  <div className="min-w-0 flex-1">
                                    <p className="font-bold text-slate-800 truncate" title={s.title}>
                                      {s.title}
                                    </p>
                                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400 font-medium">
                                      <span>📅 {formatDateBR(s.createdAt)}</span>
                                      <span>•</span>
                                      <span>Turno {s.shift} ({s.group})</span>
                                    </div>
                                    <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                                      Facilitador: <span className="font-semibold text-slate-700">{s.executor || s.createdByName || 'Não especificado'}</span>
                                    </p>
                                  </div>
                                  <div className="shrink-0 text-right">
                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-teal-50 text-teal-700 border border-teal-200/60 flex items-center gap-1">
                                      <Users className="w-3 h-3" />
                                      <span>{s.signaturesCount} {s.signaturesCount === 1 ? 'presença' : 'presenças'}</span>
                                      {s.totalPrevisto > 0 && <span className="text-teal-400 font-normal">/ {s.totalPrevisto}</span>}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Quality Inspections Card */}
                    <div className="bg-slate-50/30 p-5 rounded-2xl border border-slate-100 space-y-3">
                      <div className="flex items-center justify-between">
                        <h5 className="text-[11px] font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                          <ClipboardCheck className="w-4 h-4 text-purple-600" /> Inspeções de Qualidade de Processo
                        </h5>
                        <span className="px-2.5 py-0.5 bg-purple-50 text-purple-700 text-[10px] font-black rounded-lg border border-purple-100 flex items-center gap-1">
                          <ClipboardCheck className="w-3 h-3" />
                          {selectedUserData.qualityCount} {selectedUserData.qualityCount === 1 ? 'Inspeção' : 'Inspeções'}
                        </span>
                      </div>

                      {selectedUserData.qualityCount === 0 ? (
                        <div className="p-6 bg-white rounded-xl border border-slate-100 text-center text-slate-400 text-xs italic">
                          Nenhuma inspeção de qualidade realizada por este colaborador.
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                          {selectedUserData.qualityList.map((q: any, idx: number) => {
                            const isConforme = !q.responses || q.responses.every((r: any) => r.conformity !== 'nc' && r.conformity !== false);
                            return (
                              <div key={`qlt-usr-${q.id || idx}`} className="bg-white p-3 rounded-xl border border-slate-100 hover:border-slate-200 transition-all flex items-start justify-between gap-3 text-[11px]">
                                <div className="min-w-0 flex-1">
                                  <p className="font-bold text-slate-900 truncate" title={q.templateName}>
                                    {q.templateName || 'Inspeção de Linha'}
                                  </p>
                                  <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400 font-medium">
                                    <span>📅 {formatLocalDateTimeBR(q.timestamp)}</span>
                                    <span>•</span>
                                    <span>Turno: {q.shift || '-'}</span>
                                  </div>
                                </div>
                                <div className="shrink-0 text-right">
                                  <span className={cn(
                                    "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider inline-flex items-center gap-1",
                                    isConforme 
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60" 
                                      : "bg-rose-50 text-rose-700 border border-rose-200/60"
                                  )}>
                                    {isConforme ? 'Conforme' : 'Com Apontamentos'}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Promo recommendation */}
                  <div className="bg-emerald-50/40 p-5 rounded-2xl border border-emerald-100 flex gap-3">
                    <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 shrink-0">
                      <Smile className="w-4 h-4" />
                    </div>
                    <div>
                      <h6 className="text-[11px] font-black text-emerald-950 uppercase tracking-widest mb-1">PARECER DE USABILIDADE E ENGAJAMENTO</h6>
                      <p className="text-[11px] text-emerald-800 leading-normal">
                        Este colaborador possui <strong>{selectedUserData.accessCount} acessos ao sistema</strong> e <strong>{selectedUserData.totalActions} operações ativas registradas</strong> (DDS assinados: {selectedUserData.ddsSignaturesCount}, DDS criados: {selectedUserData.ddsCreatedCount}, Qualidade: {selectedUserData.qualityCount}, Rotas: {selectedUserData.routesCount}, Empilhadeiras: {selectedUserData.forkliftCount}, Segurança: {selectedUserData.safetyCount}, Paradas: {selectedUserData.stopsCount}, Manutenção: {selectedUserData.maintenanceCount}).
                        {!selectedUserData.hasAccessed && ' Atenção: O colaborador ainda não realizou logins no aplicativo. Recomenda-se orientação de acesso junto à liderança de turno.'}
                        {selectedUserData.hasAccessed && selectedUserData.totalActions > 25 && ' Seu altíssimo volume de interações indica engajamento exemplar, liderança ativa e conformidade excepcional no uso das rotinas digitais.'}
                        {selectedUserData.hasAccessed && selectedUserData.totalActions <= 25 && selectedUserData.totalActions >= 8 && ' Perfil dinâmico e participativo com boa consistência de registros cotidianos no sistema.'}
                        {selectedUserData.hasAccessed && selectedUserData.totalActions < 8 && ' Volume inicial ou moderado de interações no sistema. Recomenda-se incentivar maior participação ativa nas rotinas digitais da fábrica.'}
                      </p>
                    </div>
                  </div>

                  {/* Score Legend Explanation */}
                  <div className="bg-slate-50/55 border border-slate-200/60 p-5 rounded-2xl space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                      <ShieldCheck className="w-5 h-5 text-emerald-600" />
                      <div>
                        <h6 className="text-[11px] font-black text-slate-800 uppercase tracking-wider">Como Funciona a Avaliação de Usabilidade?</h6>
                        <p className="text-[10px] text-slate-400 font-bold">Métricas objetivas consideradas no cálculo</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Pilares Objetivos */}
                      <div className="space-y-2">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Métricas Computadas</span>
                        <ul className="space-y-2 text-xs font-semibold text-slate-600">
                          <li className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-slate-800 shrink-0" />
                            <span><strong>Acessos ao Sistema:</strong> Logins efetuados e sessões autenticadas</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                            <span><strong>DDS:</strong> Presenças assinadas e sessões elaboradas</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
                            <span><strong>Qualidade:</strong> Checklists e auditorias de processo</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                            <span><strong>Rotas & Empilhadeiras:</strong> Rondas operacionais e inspeções veiculares</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                            <span><strong>Segurança & Paradas:</strong> Desvios, apontamentos e paradas registradas</span>
                          </li>
                        </ul>
                      </div>

                      {/* Níveis de Classificação */}
                      <div className="space-y-2">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Classificação de Uso</span>
                        <div className="space-y-2">
                          <div className="bg-white p-2.5 rounded-xl border border-slate-100 flex items-start gap-2">
                            <span className="text-emerald-600 shrink-0 font-black">★</span>
                            <div>
                              <p className="font-black text-slate-800 text-[10px] leading-tight block uppercase">Alta Adoção (&gt; 25 operações)</p>
                              <p className="text-slate-400 text-[9px] font-bold leading-normal mt-0.5">Altíssimo engajamento e consistência no uso diário do sistema.</p>
                            </div>
                          </div>
                          <div className="bg-white p-2.5 rounded-xl border border-slate-100 flex items-start gap-2">
                            <span className="text-blue-500 shrink-0 font-black">✔</span>
                            <div>
                              <p className="font-black text-slate-800 text-[10px] leading-tight block uppercase">Consistente (8 a 25 operações)</p>
                              <p className="text-slate-400 text-[9px] font-bold leading-normal mt-0.5">Participação regular e contínua nos processos e registros.</p>
                            </div>
                          </div>
                          <div className="bg-white p-2.5 rounded-xl border border-slate-100 flex items-start gap-2">
                            <span className="text-orange-400 shrink-0 font-black">▲</span>
                            <div>
                              <p className="font-black text-slate-800 text-[10px] leading-tight block uppercase">Inicial (&lt; 8 operações)</p>
                              <p className="text-slate-400 text-[9px] font-bold leading-normal mt-0.5">Volume inicial de interações. Requer incentivo ao preenchimento.</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden min-h-[400px]">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white text-slate-900">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-bold text-slate-500 uppercase tracking-widest text-[10px]">
              {showFilters ? 'Filtros Personalizados Ativos' : 'Relatório Consolidado Mensal'}
            </span>
          </div>
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
            Exibindo: {filteredData.length} / {data.length}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-10 h-10 animate-spin text-emerald-600" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                    {reportType === 'stops_control' ? (
                      <>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Data / Tipo</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Local / Linha</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Horários & Duração</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Frentes & Atividades Realizadas</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Cortadeiras</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Responsável</th>
                      </>
                    ) : reportType === 'dds' ? (
                      <>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Colaborador</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Tema / Turno</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Letra</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Humor</th>
                      </>
                    ) : reportType === 'forklift' ? (
                      <>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Equipamento</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Condutor / Turno</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Letra</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                      </>
                    ) : reportType === 'wire_receiving' ? (
                      <>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider"></th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Nota Fiscal</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Fornecedor</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Bobinas</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Peso Total</th>
                      </>
                    ) : reportType === 'quality' ? (
                      <>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Operador / Escala</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Checklist / Setor</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Respostas</th>
                      </>
                    ) : reportType === 'pending_equipments' ? (
                      <>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Tag / Equipamento</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Linha</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Motivo / Observação</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Operador</th>
                      </>
                    ) : (
                    <>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Bobina</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Linha / Bitola</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Peso</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">T/L</th>
                    </>
                  )}
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Data/Hora</th>
                  {(reportType === 'stops_control' || reportType === 'forklift' || reportType === 'wire_consumption' || reportType === 'quality' || reportType === 'pending_equipments' || (reportType === 'dds' && (isAdmin || isMaster || isManager))) && (
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Ações</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredData.map((item, i) => (
                  <React.Fragment key={`${item.id}-${i}`}>
                    <motion.tr 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(i * 0.05, 1) }}
                      className={cn(
                        "hover:bg-slate-50/50",
                        expandedReceivingIds[item.id] && "bg-emerald-50/30",
                        expandedStopIds[item.id] && "bg-emerald-50/20"
                      )}
                    >
                      {reportType === 'stops_control' ? (
                        <>
                          <td className="px-6 py-4">
                            <p className="font-bold text-slate-900 leading-tight mb-1">{formatDateToBR(item.date)}</p>
                            <span className={cn(
                              "inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border",
                              getStopTypeBadgeClass(item.type)
                            )}>
                              {getStopTypeLabel(item.type)}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <Factory className="w-4 h-4 text-slate-400 shrink-0" />
                              <span className="font-bold text-slate-800 text-sm">{item.lineName || item.lineId}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="space-y-0.5">
                              <p className="text-xs font-bold text-slate-800">
                                {item.startTime} às {item.endTime}
                              </p>
                              <p className="text-xs font-black text-emerald-600">
                                {formatDurationString(getMinutesDiff(item.startTime, item.endTime))}
                              </p>
                              {item.rejectionTime ? (
                                <p className="text-[10px] text-slate-400 font-medium">Rejeição: {item.rejectionTime} min</p>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-6 py-4 max-w-xs">
                            <div className="space-y-1.5">
                              <div className="flex flex-wrap gap-1">
                                {(item.workFronts || []).map((wf: any, wfIdx: number) => (
                                  <span key={wfIdx} className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold rounded-md">
                                    {wf.front}
                                  </span>
                                ))}
                                {(!item.workFronts || item.workFronts.length === 0) && (
                                  <span className="text-xs text-slate-400 italic">Nenhuma frente</span>
                                )}
                              </div>
                              {(item.workFronts && item.workFronts.length > 0) && (
                                <button
                                  type="button"
                                  onClick={() => toggleStopExpand(item.id)}
                                  className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:text-emerald-700 transition-colors cursor-pointer"
                                >
                                  {expandedStopIds[item.id] ? 'Ocultar atividades' : `Ver ${item.workFronts.length} atividade(s)`}
                                  <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", expandedStopIds[item.id] && "rotate-180")} />
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-600 whitespace-nowrap">
                            <p><span className="font-bold text-slate-700">MS1:</span> {item.cutterSpeedMS1 || 0} m/min</p>
                            <p><span className="font-bold text-slate-700">MS2:</span> {item.cutterSpeedMS2 || 0} m/min</p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="font-bold text-slate-900 text-xs">{item.userName || 'Sistema'}</p>
                            {item.observation && (
                              <p className="text-[10px] text-slate-400 truncate max-w-[150px]" title={item.observation}>
                                Obs: {item.observation}
                              </p>
                            )}
                          </td>
                        </>
                      ) : reportType === 'dds' ? (
                        <>
                          <td className="px-6 py-4">
                            <p className="font-bold text-slate-900 leading-none mb-1.5">{item.userName}</p>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                Executante:
                              </span>
                              <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                                {item.executor && item.executor !== '-' ? item.executor : 'Não informado'}
                              </span>
                              {(isAdmin || isMaster || isManager) && item.sessionId && !item.isOrphan && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingExecutorModal({
                                      sessionId: item.sessionId,
                                      sessionTitle: item.sessionTitle,
                                      currentExecutor: item.executor !== '-' ? item.executor : ''
                                    });
                                    setNewExecutorValue(item.executor !== '-' ? item.executor : '');
                                  }}
                                  className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                                  title="Editar Executante deste DDS"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1">
                                <span className="text-sm font-bold text-slate-700 leading-tight">{item.sessionTitle}</span>
                                <span className="w-fit px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[9px] font-black rounded uppercase tracking-tighter">
                                  {item.shift}
                                </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-3 py-1 bg-slate-100 text-slate-600 text-[10px] font-black rounded-lg uppercase tabular-nums">
                              LETRA {item.group}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {item.mood === 'happy' && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <Smile className="w-3.5 h-3.5 text-emerald-500" /> FELIZ
                              </span>
                            )}
                            {item.mood === 'neutral' && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                                <Meh className="w-3.5 h-3.5 text-blue-500" /> NEUTRO
                              </span>
                            )}
                            {item.mood === 'sad' && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
                                <Frown className="w-3.5 h-3.5 text-amber-500" /> TRISTE
                              </span>
                            )}
                            {(!item.mood || item.mood === '-') && <span className="text-slate-300 font-bold">-</span>}
                          </td>
                        </>
                      ) : reportType === 'forklift' ? (
                        <>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                               <Truck className="w-5 h-5 text-slate-400" />
                               <p className="font-black text-slate-900 uppercase">#{item.forkliftNumber}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                             <p className="font-bold text-slate-900 leading-none mb-1">{item.conductorName}</p>
                             <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[9px] font-black rounded uppercase">
                               {item.shift}
                             </span>
                          </td>
                          <td className="px-6 py-4">
                             <span className="px-3 py-1 bg-slate-100 text-slate-600 text-[10px] font-black rounded-lg uppercase tabular-nums">
                               LETRA {item.group}
                             </span>
                          </td>
                          <td className="px-6 py-4">
                             <span className={cn(
                               "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                               item.status === 'normal' ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                             )}>
                               {item.status === 'normal' ? 'Normal' : 'Anormal'}
                             </span>
                          </td>
                        </>
                      ) : reportType === 'quality' ? (
                        <>
                          <td className="px-6 py-4">
                            <p className="font-black text-slate-900 leading-none mb-1">{item.userName}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{item.shift || '-'}</p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm font-bold text-slate-700">{item.templateName}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                               Linha: {lines.find(l => l.id === item.lineId)?.name || 'N/A'}
                            </p>
                            {item.sectorId !== item.lineId && (
                              <p className="text-[9px] text-slate-300 font-bold uppercase tracking-tighter">
                                Setor: {qualitySectors.find(s => s.id === item.sectorId)?.name || 'Geral'}
                              </p>
                            )}
                          </td>
                          <td className="px-6 py-4">
                             <div className="flex flex-wrap gap-1 max-w-xs">
                                {item.responses.filter((r: any) => {
                                   const template = qualityTemplates[item.templateId];
                                   const itemDef = template?.items?.find((i: any) => i.id === r.itemId);
                                   return itemDef?.type !== 'text';
                                }).map((res: any, idx: number) => (
                                   <span key={idx} className={cn(
                                     "px-2 py-0.5 rounded text-[9px] font-black uppercase",
                                     res.value === 'ok' || res.value === true ? "bg-emerald-100 text-emerald-700" :
                                     res.value === 'nok' || res.value === false ? "bg-rose-100 text-rose-700" :
                                     (typeof res.value === 'object' && res.value !== null) ? (
                                       Object.values(res.value).some((s: any) => String(s).toLowerCase().includes('tamponado') || String(s).toLowerCase().includes('vermelho')) ? "bg-rose-100 text-rose-700" :
                                       Object.values(res.value).some((s: any) => { const ls = String(s).toLowerCase(); return ls.includes('suj') && !ls.includes('pouco'); }) ? "bg-amber-100 text-amber-700" :
                                       "bg-emerald-100 text-emerald-700"
                                     ) : "bg-slate-100 text-slate-600"
                                   )}>
                                     {res.label}{res.value !== undefined ? ': ' : ''}{res.value === true ? 'Sim' : res.value === false ? 'Não' : (typeof res.value === 'object' && res.value !== null ? (res.value.left_top !== undefined ? `LE: ${res.value.left_top || '-'} RE: ${res.value.right_top || '-'} LD: ${res.value.left_bottom || '-'} RD: ${res.value.right_bottom || '-'}` : `E: ${res.value.left || '-'} D: ${res.value.right || '-'}`) : (res.value || ''))}
                                   </span>
                                ))}

                                {/* Standalone Text/Observation Responses */}
                                {item.responses.some((r: any) => {
                                   const template = qualityTemplates[item.templateId];
                                   const itemDef = template?.items?.find((i: any) => i.id === r.itemId);
                                   return itemDef?.type === 'text';
                                }) && (
                                   <div className="w-full mt-1.5 space-y-1 bg-emerald-50/40 p-2 rounded-xl border border-emerald-100/50 text-left">
                                      {item.responses.filter((r: any) => {
                                         const template = qualityTemplates[item.templateId];
                                         const itemDef = template?.items?.find((i: any) => i.id === r.itemId);
                                         return itemDef?.type === 'text';
                                      }).map((res: any, idx: number) => {
                                         const template = qualityTemplates[item.templateId];
                                         const itemDef = template?.items?.find((i: any) => i.id === res.itemId);
                                         const displayName = itemDef?.label || res.label || res.itemId || 'Item';
                                         return (
                                            <p key={idx} className="text-[9px] text-emerald-800 font-semibold leading-tight">
                                               <span className="font-bold text-emerald-600/70">{displayName}:</span> {res.value}
                                            </p>
                                         );
                                      })}
                                   </div>
                                )}
                                {/* Consolidated Observations */}
                                {item.responses.some((r: any) => r.observation) && (
                                   <div className="mt-1.5 space-y-1 bg-slate-50 p-2 rounded-xl border border-slate-200/50">
                                      {item.responses.filter((r: any) => r.observation).map((res: any, idx: number) => {
                                         const template = qualityTemplates[item.templateId];
                                         const itemDef = template?.items?.find((i: any) => i.id === res.itemId);
                                         const displayName = itemDef?.label || res.label || res.itemId || 'Item';
                                         return (
                                            <p key={idx} className="text-[9px] text-slate-500 font-semibold leading-tight">
                                               <span className="font-bold text-slate-400">#{item.responses.indexOf(res) + 1} ({displayName}):</span> {res.observation}
                                            </p>
                                         );
                                      })}
                                   </div>
                                )}
                             </div>
                          </td>
                        </>
                      ) : reportType === 'wire_receiving' ? (
                        <>
                          <td className="px-6 py-4 w-10">
                            <button 
                              onClick={() => toggleReceivingExpand(item.id)}
                              disabled={loadingBatchCoils[item.id]}
                              className="p-1.5 hover:bg-emerald-100/50 rounded-lg transition-all text-emerald-600"
                            >
                              {loadingBatchCoils[item.id] ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", expandedReceivingIds[item.id] && "rotate-180")} />
                              )}
                            </button>
                          </td>
                          <td className="px-6 py-4">
                            <p className="font-black text-slate-900 leading-none mb-1"># {item.nfNumber}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{item.responsibleName}</p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm font-bold text-slate-700">{item.supplierName}</p>
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-3 py-1 bg-blue-100 text-blue-700 text-[10px] font-black rounded-lg uppercase">
                              {item.coilsCount} Bobinas
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm font-black text-emerald-600 tabular-nums">
                              {item.totalWeight.toLocaleString('pt-BR')} kg
                            </p>
                          </td>
                        </>
                      ) : reportType === 'pending_equipments' ? (
                        <>
                          <td className="px-6 py-4">
                            <span className="inline-block px-2.5 py-1 bg-rose-50 text-rose-700 text-[10px] font-black rounded uppercase border border-rose-200">
                              {item.tag || 'S/T'}
                            </span>
                            <p className="text-sm font-bold text-slate-900 mt-1">{item.name}</p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm font-semibold text-slate-700">{item.line}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none mt-1">
                              {item.area || 'Geral'}
                            </p>
                          </td>
                          <td className="px-6 py-4 max-w-xs">
                            <div className="text-xs space-y-1">
                              <p className="font-extrabold text-[#0d6e4f] uppercase tracking-wider text-[9px]">
                                {item.diagnostic || 'ANOMALIA IDENTIFICADA'}
                              </p>
                              <p className="text-slate-600 font-medium truncate" title={item.notes}>
                                {item.notes || 'Sem observações adicionais.'}
                              </p>
                              {(item.schedule || item.sapNote) && (
                                <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-slate-100">
                                  {item.schedule && (
                                    <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[9px] font-black uppercase">
                                      Prog: {item.schedule}
                                    </span>
                                  )}
                                  {item.sapNote && (
                                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-[9px] font-black uppercase">
                                      SAP: {item.sapNote}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-xs font-semibold text-slate-600">
                            {item.operator}
                          </td>
                        </>
                      ) : (
                      <>
                        <td className="px-6 py-4">
                          <p className="font-black text-slate-900 leading-none mb-1">{item.coilNumber}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{item.consumedBy || 'Sistema'}</p>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <p className="text-sm font-bold text-slate-700">
                              Linha {lines.find(l => l.id === item.currentLineId)?.name || 'N/A'}
                            </p>
                            <span className="w-fit px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[9px] font-black rounded uppercase">
                              {item.diameter} mm
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-black text-amber-600 tabular-nums">{item.weight} kg</p>
                        </td>
                        <td className="px-6 py-4">
                           <div className="flex items-center gap-3">
                              <span className={cn(
                                "px-2 py-0.5 text-[10px] font-black rounded uppercase tabular-nums shadow-sm",
                                item.consumedShift === '1' ? "bg-amber-100 text-amber-700" :
                                item.consumedShift === '2' ? "bg-blue-100 text-blue-700" :
                                "bg-indigo-100 text-indigo-700"
                              )}>
                                T{item.consumedShift || '?'}
                              </span>
                              <div className="w-6 h-6 bg-emerald-600 text-white rounded flex items-center justify-center text-[10px] font-black uppercase shadow-sm" title="Letra">
                                {item.consumedByGroup || '-'}
                              </div>
                           </div>
                        </td>
                      </>
                    )}
                    <td className="px-6 py-4 text-right tabular-nums">
                      <p className="text-sm font-bold text-slate-900">{formatLocalDateBR(item.timestamp)}</p>
                      <p className="text-[10px] text-slate-500 font-semibold">{formatLocalTimeBR(item.timestamp)}</p>
                    </td>
                    {(reportType === 'stops_control' || reportType === 'forklift' || reportType === 'wire_consumption' || reportType === 'quality' || reportType === 'pending_equipments' || (reportType === 'dds' && (isAdmin || isMaster || isManager))) && (
                      <td className="px-6 py-4 text-right">
                        {reportType === 'stops_control' ? (
                          <div className="flex items-center justify-end gap-1">
                            <button 
                              type="button"
                              onClick={() => setSelectedStopModal(item)}
                              className="p-2 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                              title="Ver Detalhes da Parada"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button 
                              type="button"
                              onClick={() => handleExportSingleStopPDF(item)}
                              className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                              title="Imprimir / Baixar PDF Individual"
                            >
                              <FileDown className="w-4 h-4" />
                            </button>
                          </div>
                        ) : reportType === 'dds' ? (
                          item.sessionId && !item.isOrphan ? (
                            <button 
                              type="button"
                              onClick={() => {
                                setEditingExecutorModal({
                                  sessionId: item.sessionId,
                                  sessionTitle: item.sessionTitle,
                                  currentExecutor: item.executor !== '-' ? item.executor : ''
                                });
                                setNewExecutorValue(item.executor !== '-' ? item.executor : '');
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors border border-slate-200"
                              title="Alterar Executante deste DDS"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Executante</span>
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400 italic">-</span>
                          )
                        ) : reportType === 'forklift' ? (
                          <button 
                            onClick={() => setSelectedForkliftCheck(item)}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Ver Detalhes"
                          >
                            <FileText className="w-5 h-5" />
                          </button>
                        ) : reportType === 'wire_consumption' ? (
                          <button 
                            onClick={() => handleEditConsumption(item)}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Editar Dados"
                          >
                            <TrendingUp className="w-5 h-5" />
                          </button>
                        ) : reportType === 'pending_equipments' ? (
                          <button 
                            onClick={() => setSelectedPendingEquipment(item)}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Ver Detalhes da Anomalia"
                          >
                            <Search className="w-5 h-5" />
                          </button>
                        ) : (
                           <button 
                             onClick={() => alert('Visualização detalhada em breve')}
                             className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                             title="Ver Respostas"
                           >
                             <Search className="w-5 h-5" />
                           </button>
                        )}
                      </td>
                    )}
                  </motion.tr>

                  {/* Expansion for Stops Control */}
                  {reportType === 'stops_control' && expandedStopIds[item.id] && (
                    <tr>
                      <td colSpan={8} className="px-6 py-0 border-b border-emerald-100 bg-emerald-50/20">
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden py-4"
                        >
                          <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm overflow-hidden mb-2 p-5 space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                              <div>
                                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                                  <Wrench className="w-4 h-4 text-emerald-600" />
                                  Frentes de Trabalho e Atividades Realizadas ({formatDateToBR(item.date)} - {item.lineName || item.lineId})
                                </h4>
                                <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                                  Duração Total: {formatDurationString(getMinutesDiff(item.startTime, item.endTime))} • Rejeição: {item.rejectionTime || 0} min
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleExportSingleStopPDF(item)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer self-start sm:self-auto"
                              >
                                <FileDown className="w-3.5 h-3.5" />
                                Imprimir PDF Desta Parada
                              </button>
                            </div>

                            {(!item.workFronts || item.workFronts.length === 0) ? (
                              <p className="text-xs text-slate-400 italic">Nenhuma frente de trabalho detalhada nesta parada.</p>
                            ) : (
                              <div className="overflow-x-auto rounded-xl border border-slate-100">
                                <table className="w-full text-left text-xs">
                                  <thead className="bg-slate-50 border-b border-slate-100">
                                    <tr>
                                      <th className="px-4 py-2.5 font-black uppercase text-[10px] text-slate-400">Frente de Trabalho</th>
                                      <th className="px-4 py-2.5 font-black uppercase text-[10px] text-slate-400">Atividades Realizadas</th>
                                      <th className="px-4 py-2.5 font-black uppercase text-[10px] text-slate-400">Início</th>
                                      <th className="px-4 py-2.5 font-black uppercase text-[10px] text-slate-400">Término</th>
                                      <th className="px-4 py-2.5 font-black uppercase text-[10px] text-slate-400 text-right">Duração</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {item.workFronts.map((wf: any, idx: number) => {
                                      const dur = getMinutesDiff(wf.startTime, wf.endTime);
                                      return (
                                        <tr key={idx} className="hover:bg-slate-50/50">
                                          <td className="px-4 py-3 font-bold text-slate-800">
                                            <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-700 font-bold">
                                              {wf.front}
                                            </span>
                                          </td>
                                          <td className="px-4 py-3 text-slate-600">
                                            {wf.description || 'Sem detalhes informados'}
                                          </td>
                                          <td className="px-4 py-3 text-slate-700 font-medium whitespace-nowrap">
                                            {wf.startTime}
                                          </td>
                                          <td className="px-4 py-3 text-slate-700 font-medium whitespace-nowrap">
                                            {wf.endTime}
                                          </td>
                                          <td className="px-4 py-3 text-right font-black text-emerald-600 whitespace-nowrap">
                                            {formatDurationString(dur)}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            {item.observation && (
                              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs">
                                <span className="font-bold text-slate-700 uppercase text-[10px] tracking-wider block mb-1">
                                  Observações Gerais:
                                </span>
                                <p className="text-slate-600 whitespace-pre-line">{item.observation}</p>
                              </div>
                            )}

                            {item.mediaUrls && item.mediaUrls.length > 0 && (
                              <div className="space-y-1.5">
                                <span className="font-bold text-slate-700 uppercase text-[10px] tracking-wider block">
                                  Fotos Anexadas ({item.mediaUrls.length}):
                                </span>
                                <div className="flex flex-wrap gap-2">
                                  {item.mediaUrls.map((url: string, imgIdx: number) => (
                                    <button
                                      key={imgIdx}
                                      type="button"
                                      onClick={() => setActivePhotoModal({ url, caption: `Parada ${formatDateToBR(item.date)} - Foto ${imgIdx + 1}` })}
                                      className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200 group hover:opacity-90 transition-opacity cursor-pointer"
                                    >
                                      <img src={url} alt={`Foto ${imgIdx + 1}`} className="w-full h-full object-cover" />
                                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <Camera className="w-4 h-4 text-white" />
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      </td>
                    </tr>
                  )}

                  {/* Expansion for Wire Receiving */}
                  {reportType === 'wire_receiving' && expandedReceivingIds[item.id] && (
                    <tr>
                      <td colSpan={7} className="px-6 py-0 border-b border-emerald-100 bg-emerald-50/20">
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden py-4"
                        >
                          <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm overflow-hidden mb-2">
                             <table className="w-full text-left">
                               <thead className="bg-slate-50 border-b border-slate-100">
                                 <tr>
                                   <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">ID Bobina</th>
                                   <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Bitola (mm)</th>
                                   <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Peso (kg)</th>
                                   <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">Status</th>
                                 </tr>
                               </thead>
                               <tbody className="divide-y divide-slate-50">
                                 {expandedReceivingIds[item.id].map((coil, idx) => (
                                   <tr key={`${coil.id || ''}-${coil.coilNumber || ''}-${idx}`} className="hover:bg-slate-50/50">
                                     <td className="px-4 py-3 text-xs font-black text-slate-700">{coil.coilNumber}</td>
                                     <td className="px-4 py-3 text-xs font-bold text-slate-600">{coil.diameter} mm</td>
                                     <td className="px-4 py-3 text-xs font-black text-emerald-600 text-right tabular-nums">{coil.weight} kg</td>
                                     <td className="px-4 py-3 text-center">
                                       <span className={cn(
                                         "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter",
                                         coil.status === 'received' ? "bg-emerald-100 text-emerald-700" : 
                                         coil.status === 'in_use' ? "bg-blue-100 text-blue-700" : 
                                         "bg-slate-100 text-slate-500"
                                       )}>
                                         {coil.status === 'received' ? 'Em Estoque' : 
                                          coil.status === 'in_use' ? 'Em Uso' : 
                                          'Consumida'}
                                       </span>
                                     </td>
                                   </tr>
                                 ))}
                               </tbody>
                             </table>
                          </div>
                        </motion.div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
                {filteredData.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-20 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Search className="w-10 h-10 text-slate-200" />
                        <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Nenhum registro encontrado com estes filtros</p>
                        <button 
                          onClick={resetFilters}
                          className="mt-2 text-emerald-600 font-bold text-xs uppercase tracking-widest hover:underline"
                        >
                          Limpar todos os filtros
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      <AnimatePresence>
        {editingConsumption && (
          <div key="edit-consumption-modal-container" className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingConsumption(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-100">
                    <Factory className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900 tracking-tight uppercase">Corrigir Dados</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Bobina {editingConsumption.coilNumber}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setEditingConsumption(null)}
                  className="p-2 hover:bg-slate-200/50 rounded-xl transition-colors text-slate-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Linha de Produção</label>
                  <div className="relative">
                    <Factory className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                    <select 
                      value={editForm.line}
                      onChange={(e) => setEditForm(prev => ({ ...prev, line: e.target.value }))}
                      className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none appearance-none transition-all font-bold"
                    >
                      {lines.map((line, idx) => (
                        <option key={`edit-line-${line.id || idx}`} value={line.id}>{line.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Turno</label>
                    <div className="relative">
                      <select 
                        value={editForm.shift}
                        onChange={(e) => setEditForm(prev => ({ ...prev, shift: e.target.value }))}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none appearance-none transition-all font-bold"
                      >
                        <option value="1">Turno 1</option>
                        <option value="2">Turno 2</option>
                        <option value="3">Turno 3</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Letra (Escala)</label>
                    <div className="relative">
                      <select 
                        value={editForm.group}
                        onChange={(e) => setEditForm(prev => ({ ...prev, group: e.target.value }))}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none appearance-none transition-all font-bold"
                      >
                        <option value="-">-</option>
                        <option value="A">Letra A</option>
                        <option value="B">Letra B</option>
                        <option value="C">Letra C</option>
                        <option value="D">Letra D</option>
                        <option value="E">Letra E</option>
                        <option value="ADM">ADM</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <p className="text-[10px] text-slate-400 text-center italic">Altere apenas se houver erro no registro original.</p>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-3">
                <button 
                  onClick={() => setEditingConsumption(null)}
                  className="flex-1 py-3 bg-white border border-slate-200 text-slate-500 font-black uppercase tracking-widest text-[10px] rounded-xl hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={saveConsumptionEdit}
                  disabled={isSaving}
                  className="flex-[2] py-3 bg-emerald-600 text-white font-black uppercase tracking-widest text-[10px] rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                  Salvar Alterações
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {selectedForkliftCheck && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedForkliftCheck(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] modal-print"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-200">
                    <Truck className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Inspeção #{selectedForkliftCheck.forkliftNumber}</h3>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">{format(selectedForkliftCheck.timestamp, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedForkliftCheck(null)}
                  className="p-3 hover:bg-slate-200/50 rounded-2xl transition-colors text-slate-400"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8 modal-print-content">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status Geral</p>
                    <span className={cn(
                      "text-xs font-black uppercase tracking-widest px-2 py-1 rounded-lg inline-block text-center w-full",
                      selectedForkliftCheck.status === 'normal' ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
                    )}>
                      {selectedForkliftCheck.status === 'normal' ? 'Normal' : 'Anormal'}
                    </span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Turno</p>
                    <p className="text-sm font-black text-slate-700">{selectedForkliftCheck.shift}</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Letra</p>
                    <div className="w-6 h-6 bg-emerald-600 text-white rounded-lg flex items-center justify-center text-xs font-black mx-auto">
                      {selectedForkliftCheck.group}
                    </div>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Condutor</p>
                    <p className="text-sm font-black text-slate-700 truncate">{selectedForkliftCheck.conductorName}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    <ListFilter className="w-4 h-4" />
                    Itens da Verificação (Em Ordem)
                  </h4>
                  <div className="grid grid-cols-1 gap-2">
                    {checkItemsList.map((item, idx) => {
                      const res = selectedForkliftCheck.itemResults[item.id];
                      if (!res) return null;
                      
                      return (
                        <div key={`checkitem-ord-${item.id || idx}`} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                          <span className="text-sm font-bold text-slate-600">
                            {item.name}
                          </span>
                          <div className="flex items-center gap-3">
                             {res.value === true ? (
                               <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded-lg">SIM</span>
                             ) : res.value === false ? (
                               <span className="px-3 py-1 bg-rose-100 text-rose-700 text-[10px] font-black rounded-lg">NÃO</span>
                             ) : (
                               <span className="text-sm font-bold text-slate-700">{res.value}</span>
                             )}
                             <div className={cn(
                               "w-2 h-2 rounded-full",
                               res.status === 'normal' ? "bg-emerald-500" : "bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.5)]"
                             )} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {selectedForkliftCheck.notes && (
                  <div className="space-y-4">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Observações do Condutor</h4>
                    <div className="p-6 bg-slate-900 rounded-[2rem] text-slate-300 text-sm italic font-medium border-l-4 border-emerald-500">
                      "{selectedForkliftCheck.notes}"
                    </div>
                  </div>
                )}

                {selectedForkliftCheck.mediaUrl && (
                  <div className="space-y-4">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Registro Visual</h4>
                    <div className="rounded-[2rem] overflow-hidden border-4 border-slate-100 shadow-xl">
                      <img 
                        src={selectedForkliftCheck.mediaUrl} 
                        alt="Evidência da Inspeção" 
                        crossOrigin="anonymous"
                        className="w-full h-auto object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="p-8 border-t border-slate-100 bg-slate-50/50 flex gap-4 no-print">
                <button 
                  onClick={() => exportSingleChecklistPDF(selectedForkliftCheck)}
                  className="flex-1 px-8 py-4 bg-emerald-600 text-white font-black uppercase tracking-widest text-xs rounded-2xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200 flex items-center justify-center gap-3"
                >
                  <FileText className="w-4 h-4" />
                  Gerar PDF da Inspeção
                </button>
                <button 
                  onClick={() => setSelectedForkliftCheck(null)}
                  className="px-8 py-4 bg-white border border-slate-200 text-slate-400 font-black uppercase tracking-widest text-xs rounded-2xl hover:bg-slate-50 transition-all"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
        {selectedPendingEquipment && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedPendingEquipment(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-rose-600 rounded-2xl flex items-center justify-center shadow-lg shadow-rose-200">
                    <AlertTriangle className="w-8 h-8 text-white animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 tracking-tight uppercase">Equipamento com Pendência</h3>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                      Identificado em {format(selectedPendingEquipment.timestamp, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedPendingEquipment(null)}
                  className="p-3 hover:bg-slate-200/50 rounded-2xl transition-colors text-slate-400"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                {/* Visual Identity Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Tag do Equipamento</p>
                    <span className="inline-block px-3 py-1 bg-slate-200 text-slate-800 text-xs font-black rounded uppercase">
                      {selectedPendingEquipment.tag || 'Sem Tag'}
                    </span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Nome do Equipamento</p>
                    <p className="text-sm font-black text-slate-800 uppercase">{selectedPendingEquipment.name}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Linha</p>
                    <p className="text-sm font-bold text-slate-700">{selectedPendingEquipment.line}</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Área / Setor</p>
                    <p className="text-xs font-bold text-slate-700">{selectedPendingEquipment.area || selectedPendingEquipment.sector || 'Geral'}</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Responsável</p>
                    <p className="text-xs font-bold text-slate-700 truncate" title={selectedPendingEquipment.operator}>{selectedPendingEquipment.operator}</p>
                  </div>
                </div>

                {/* Problem definition section */}
                <div className="bg-red-50/50 p-6 rounded-[2rem] border border-red-100 space-y-2">
                  <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest flex items-center gap-1.5 font-bold">
                    <AlertTriangle className="w-4 h-4" /> Problema Identificado
                  </p>
                  <p className="text-sm font-extrabold text-slate-800">
                    {selectedPendingEquipment.reason}
                  </p>
                  {selectedPendingEquipment.notes && (
                    <div className="mt-4 pt-4 border-t border-red-100 text-slate-700 text-xs font-medium italic whitespace-pre-wrap">
                      "{selectedPendingEquipment.notes}"
                    </div>
                  )}
                </div>

                {/* Chronograma and technical feedback */}
                {(selectedPendingEquipment.schedule || selectedPendingEquipment.sapNote || selectedPendingEquipment.actionTaken || selectedPendingEquipment.responsibleCenter) && (
                  <div className="space-y-4 pt-2">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">Cronograma & Informações Técnicas</h4>
                    <div className="grid grid-cols-2 gap-4">
                      {selectedPendingEquipment.schedule && (
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Previsão Manutenção</p>
                          <p className="text-xs font-black text-[#0d6e4f] uppercase">{selectedPendingEquipment.schedule}</p>
                        </div>
                      )}
                      {selectedPendingEquipment.sapNote && (
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Nota SAP / Ordem</p>
                          <p className="text-xs font-black text-slate-700">{selectedPendingEquipment.sapNote}</p>
                        </div>
                      )}
                      {selectedPendingEquipment.responsibleCenter && (
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Centro Responsável</p>
                          <p className="text-xs font-bold text-slate-700">{selectedPendingEquipment.responsibleCenter}</p>
                        </div>
                      )}
                      {selectedPendingEquipment.actionTaken && (
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Ação Preventiva Realizada</p>
                          <p className="text-xs font-bold text-slate-700 truncate" title={selectedPendingEquipment.actionTaken}>{selectedPendingEquipment.actionTaken}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-8 border-t border-slate-100 bg-slate-50/50 flex justify-end">
                <button 
                  onClick={() => setSelectedPendingEquipment(null)}
                  className="px-8 py-3 bg-white border border-slate-200 text-slate-500 font-black uppercase tracking-widest text-[10px] rounded-xl hover:bg-slate-50 transition-all shadow-sm"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
        <ConfirmationModal
          key="generic-modal"
          isOpen={modalConfig.isOpen}
          onClose={closeModal}
          title={modalConfig.title}
          message={modalConfig.message}
          type={modalConfig.type}
        />
        <ConfirmationModal
          key="cleanup-orphans-modal"
          isOpen={showCleanupConfirm}
          onClose={() => setShowCleanupConfirm(false)}
          title="Excluir Registros Órfãos?"
          message={`Deseja realmente excluir ${orphanIds.length} registros de participação que não possuem DDS vinculado? Esta ação é irreversível.`}
          type="warning"
          confirmText="Sim, Excluir"
          showConfirmButton={true}
          onConfirm={() => handleCleanupOrphans(true)}
        />

        {/* Modal to Edit DDS Executor */}
        {editingExecutorModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-2xl">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Definir Executante do DDS</h3>
                    <p className="text-xs text-slate-500 truncate max-w-[240px]">
                      {editingExecutorModal.sessionTitle}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingExecutorModal(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Nome do Executante (Responsável pelo DDS)
                  </label>
                  <input
                    type="text"
                    value={newExecutorValue}
                    onChange={(e) => setNewExecutorValue(e.target.value)}
                    placeholder="Digite ou selecione o nome do executante"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                    autoFocus
                  />
                </div>

                {/* Suggestions from allUsers */}
                {allUsers.length > 0 && (
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                      Sugestões de colaboradores:
                    </span>
                    <div className="max-h-36 overflow-y-auto space-y-1 p-1 bg-slate-50 rounded-xl border border-slate-100">
                      {allUsers
                        .filter(u => !newExecutorValue || (u.displayName || '').toLowerCase().includes(newExecutorValue.toLowerCase()))
                        .slice(0, 8)
                        .map(u => (
                          <button
                            key={u.id || u.uid}
                            type="button"
                            onClick={() => setNewExecutorValue(u.displayName)}
                            className="w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:bg-emerald-100 hover:text-emerald-800 transition-colors flex items-center justify-between"
                          >
                            <span>{u.displayName}</span>
                            {u.role && (
                              <span className="text-[10px] text-slate-400 font-normal">{u.role}</span>
                            )}
                          </button>
                        ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingExecutorModal(null)}
                    className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={isSavingExecutor || !newExecutorValue.trim()}
                    onClick={handleSaveExecutor}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md shadow-emerald-600/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                  >
                    {isSavingExecutor ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Salvar</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Executor update success toast */}
        {executorUpdateSuccess && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 font-semibold text-sm border border-emerald-500"
          >
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>{executorUpdateSuccess}</span>
            <button
              onClick={() => setExecutorUpdateSuccess(null)}
              className="p-1 hover:bg-emerald-700 rounded-lg transition-colors ml-2"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}

        {/* Stop Report Details Modal */}
        {selectedStopModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedStopModal(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 md:p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-200 text-white">
                    <Clock className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-black text-slate-900 tracking-tight uppercase">
                        Controle de Parada
                      </h3>
                      <span className={cn(
                        "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border",
                        getStopTypeBadgeClass(selectedStopModal.type)
                      )}>
                        {getStopTypeLabel(selectedStopModal.type)}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                      {formatDateToBR(selectedStopModal.date)} • {selectedStopModal.lineName || selectedStopModal.lineId}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedStopModal(null)}
                  className="p-2.5 hover:bg-slate-200/50 rounded-2xl transition-colors text-slate-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
                {/* 4 Cards Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Início / Fim</p>
                    <p className="text-sm font-black text-slate-800 mt-0.5">
                      {selectedStopModal.startTime} - {selectedStopModal.endTime}
                    </p>
                  </div>
                  <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Duração Total</p>
                    <p className="text-sm font-black text-emerald-600 mt-0.5">
                      {formatDurationString(getMinutesDiff(selectedStopModal.startTime, selectedStopModal.endTime))}
                    </p>
                  </div>
                  <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rejeição</p>
                    <p className="text-sm font-black text-slate-800 mt-0.5">
                      {selectedStopModal.rejectionTime || 0} min
                    </p>
                  </div>
                  <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Registrado por</p>
                    <p className="text-sm font-black text-slate-800 truncate mt-0.5" title={selectedStopModal.userName || 'Sistema'}>
                      {selectedStopModal.userName || 'Sistema'}
                    </p>
                  </div>
                </div>

                {/* Cortadeiras */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Velocidade das Cortadeiras</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-xs font-bold text-slate-600">Cortadeira MS1:</span>
                      <p className="text-sm font-black text-slate-800">{selectedStopModal.cutterSpeedMS1 || 0} m/min</p>
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-600">Cortadeira MS2:</span>
                      <p className="text-sm font-black text-slate-800">{selectedStopModal.cutterSpeedMS2 || 0} m/min</p>
                    </div>
                  </div>
                </div>

                {/* Work Fronts & Activities */}
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2 mb-3">
                    <Wrench className="w-4 h-4 text-emerald-600" />
                    Frentes de Trabalho e Atividades Realizadas
                  </h4>
                  {(!selectedStopModal.workFronts || selectedStopModal.workFronts.length === 0) ? (
                    <div className="p-4 bg-slate-50 rounded-2xl text-center text-xs text-slate-400 italic">
                      Nenhuma frente de trabalho informada.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-2xl border border-slate-100">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-100">
                          <tr>
                            <th className="px-4 py-2.5 font-black uppercase text-[10px] text-slate-400">Frente</th>
                            <th className="px-4 py-2.5 font-black uppercase text-[10px] text-slate-400">Atividades Realizadas</th>
                            <th className="px-4 py-2.5 font-black uppercase text-[10px] text-slate-400">Horário</th>
                            <th className="px-4 py-2.5 font-black uppercase text-[10px] text-slate-400 text-right">Duração</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {selectedStopModal.workFronts.map((wf: any, idx: number) => {
                            const dur = getMinutesDiff(wf.startTime, wf.endTime);
                            return (
                              <tr key={idx} className="hover:bg-slate-50/50">
                                <td className="px-4 py-3 font-bold text-slate-800">
                                  <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-700 font-bold">
                                    {wf.front}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-slate-600">
                                  {wf.description || 'Sem detalhes informados'}
                                </td>
                                <td className="px-4 py-3 text-slate-700 font-medium whitespace-nowrap">
                                  {wf.startTime} às {wf.endTime}
                                </td>
                                <td className="px-4 py-3 text-right font-black text-emerald-600 whitespace-nowrap">
                                  {formatDurationString(dur)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Observations */}
                {selectedStopModal.observation && (
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs">
                    <span className="font-bold text-slate-700 uppercase text-[10px] tracking-wider block mb-1">
                      Observações Gerais:
                    </span>
                    <p className="text-slate-600 whitespace-pre-line">{selectedStopModal.observation}</p>
                  </div>
                )}

                {/* Photos */}
                {selectedStopModal.mediaUrls && selectedStopModal.mediaUrls.length > 0 && (
                  <div className="space-y-2">
                    <span className="font-bold text-slate-700 uppercase text-[10px] tracking-wider block">
                      Fotos Anexadas ({selectedStopModal.mediaUrls.length}):
                    </span>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                      {selectedStopModal.mediaUrls.map((url: string, imgIdx: number) => (
                        <button
                          key={imgIdx}
                          type="button"
                          onClick={() => setActivePhotoModal({ url, caption: `Parada ${formatDateToBR(selectedStopModal.date)} - Foto ${imgIdx + 1}` })}
                          className="relative aspect-square rounded-2xl overflow-hidden border border-slate-200 group hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
                        >
                          <img src={url} alt={`Foto ${imgIdx + 1}`} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Camera className="w-5 h-5 text-white" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedStopModal(null)}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => handleExportSingleStopPDF(selectedStopModal)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
                >
                  <FileDown className="w-4 h-4" />
                  Imprimir Relatório (PDF)
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Photo Preview Modal */}
        {activePhotoModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActivePhotoModal(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative max-w-3xl w-full bg-slate-900 rounded-3xl overflow-hidden shadow-2xl z-10 flex flex-col"
            >
              <div className="p-4 flex items-center justify-between text-white border-b border-slate-800">
                <span className="text-xs font-bold text-slate-300">{activePhotoModal.caption || 'Foto'}</span>
                <button
                  type="button"
                  onClick={() => setActivePhotoModal(null)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-2 flex items-center justify-center max-h-[75vh] overflow-hidden">
                <img src={activePhotoModal.url} alt="Foto Ampliada" className="max-h-[70vh] w-auto object-contain rounded-2xl" />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Reports;
