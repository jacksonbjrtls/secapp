import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { 
  collection, 
  addDoc, 
  setDoc,
  doc,
  getDocs, 
  query, 
  where, 
  serverTimestamp, 
  Timestamp,
  orderBy,
  limit,
  updateDoc,
  deleteDoc,
  writeBatch,
  onSnapshot
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { MASTER_EMAILS } from '../constants';
import { encryptValue, decryptValue } from '../lib/crypto';
import { Html5Qrcode } from "html5-qrcode";
import { 
  Edit2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Frown,
  Meh,
  ShieldCheck, 
  Clock, 
  Key, 
  CheckCircle2, 
  AlertCircle, 
  Plus, 
  Users,
  History,
  Calendar,
  Timer,
  Lock,
  ChevronRight,
  UserCheck,
  Smile,
  X,
  QrCode,
  AlertTriangle,
  Loader2,
  Search,
  Filter,
  BarChart3,
  TrendingUp,
  Target,
  FileSpreadsheet,
  RotateCcw,
  UserPlus,
  ArrowRightLeft
} from 'lucide-react';
import { DDSBulkImportModal } from '../components/dds/DDSBulkImportModal';
import { fetchUsersSafely, getLocalCachedUsers } from '../lib/usersCache';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  AreaChart,
  Area,
  ReferenceLine,
  XAxis, 
  YAxis, 
  Tooltip as RechartsTooltip, 
  CartesianGrid 
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { cn, safeToDate, formatDateBR, formatDateDDMMAAAA } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/errorHandler';
import { getCurrentShift, getGroupForShift, getTodayGroups, getShiftTimeRange, isWithinShiftWindow, type Shift } from '../lib/scaleUtils';

const CountdownTimer: React.FC<{ expiresAt: Date | null | undefined }> = ({ expiresAt }) => {
  const [timeLeft, setTimeLeft] = useState<{h: number, m: number, s: number} | null>(null);

  useEffect(() => {
    if (!expiresAt) {
      setTimeLeft(null);
      return;
    }

    const calculateTime = () => {
      const now = Date.now();
      const target = expiresAt.getTime();
      const diff = target - now;

      if (isNaN(diff) || diff <= 0) {
        setTimeLeft(null);
        return;
      }

      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft({ h, m, s });
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  if (!expiresAt || !timeLeft) return <span className="text-rose-500 font-bold uppercase tracking-widest text-[10px]">Expirado</span>;

  return (
    <span className="font-mono font-black tracking-wider">
      {String(timeLeft.h).padStart(2, '0')}:{String(timeLeft.m).padStart(2, '0')}:{String(timeLeft.s).padStart(2, '0')}
    </span>
  );
};

// Helper for timezone-safe local date string comparison (YYYY-MM-DD)
const getLocalDateStr = (d: Date | any): string => {
  const dateObj = safeToDate(d);
  if (!dateObj) return '';
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Standardizes DDS title display to: "Turno X - DDS DD-MM-AAAA"
 * E.g., "Turno 1 - DDS 15-08-2026"
 */
export const formatSessionDisplayTitle = (session: any): string => {
  if (!session) return '';
  const dateStr = formatDateDDMMAAAA(session.createdAt || session.date);
  const shiftStr = session.shift || 'Turno 1';
  const defaultPattern = `${shiftStr} - DDS ${dateStr}`;
  
  const rawTitle = (session.title || '').trim();
  if (!rawTitle) {
    return defaultPattern;
  }
  
  // If title was formatted as "DDS 2026-08-15 - Turno 1" or similar
  if (/^DDS\s+\d{4}-\d{2}-\d{2}\s*-\s*Turno\s*\d/i.test(rawTitle) ||
      /^DDS\s+\d{2}-\d{2}-\d{4}\s*-\s*Turno\s*\d/i.test(rawTitle) ||
      /^DDS\s+\d{2}\/\d{2}\/\d{4}\s*-\s*Turno\s*\d/i.test(rawTitle)) {
    return defaultPattern;
  }
  
  // If title already starts with standard "Turno X - DDS", return clean
  if (/^Turno\s*\d\s*-\s*DDS/i.test(rawTitle)) {
    return rawTitle;
  }
  
  // If user entered a custom theme like "Prevenção de Quedas", display "Turno 1 - DDS 15-08-2026 • Prevenção de Quedas"
  return `${defaultPattern} • ${rawTitle}`;
};

const DDS: React.FC = () => {
  const { profile, isAdmin, isManager, isMaster } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sessions, setSessions] = useState<any[]>([]);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [passcode, setPasscode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [hasSigned, setHasSigned] = useState(false);
  const [registeredUsers, setRegisteredUsers] = useState<any[]>([]);
  const [showExecutorDropdown, setShowExecutorDropdown] = useState(false);
  const executorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (executorRef.current && !executorRef.current.contains(event.target as Node)) {
        setShowExecutorDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const [showQRFullscreen, setShowQRFullscreen] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  
  // Admin state for sessions
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [sessionSignatures, setSessionSignatures] = useState<any[]>([]);
  const [signaturesLoading, setSignaturesLoading] = useState(false);
  const [editingSession, setEditingSession] = useState<any>(null);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [sessionToReset, setSessionToReset] = useState<{ id: string; title: string; count: number } | null>(null);
  
  // Manual signature management (Admin/Master/Manager)
  const [showAddSignatureModal, setShowAddSignatureModal] = useState(false);
  const [targetSessionForSignature, setTargetSessionForSignature] = useState<any | null>(null);
  const [manualParticipantName, setManualParticipantName] = useState('');
  const [manualRegistration, setManualRegistration] = useState('');
  const [manualSelectedUid, setManualSelectedUid] = useState('');
  const [manualUserSearch, setManualUserSearch] = useState('');
  const [isRefreshingUsers, setIsRefreshingUsers] = useState(false);
  const [manualMood, setManualMood] = useState<'happy' | 'neutral' | 'sad'>('happy');
  const [signatureToDelete, setSignatureToDelete] = useState<{ id: string; userName: string; sessionId: string } | null>(null);
  const [showWipeAllModal, setShowWipeAllModal] = useState(false);
  const [wipeInProgress, setWipeInProgress] = useState(false);

  // Reassign / Unify signature state (Admin/Master only)
  const [signatureToReassign, setSignatureToReassign] = useState<{
    id: string;
    userName: string;
    currentSessionId: string;
    currentSessionTitle: string;
  } | null>(null);
  const [targetReassignSessionId, setTargetReassignSessionId] = useState<string>('');

  // Stats and Filters for all users
  const [allSessionsList, setAllSessionsList] = useState<any[]>([]);
  const [allSignaturesList, setAllSignaturesList] = useState<any[]>([]);
  const [chartMode, setChartMode] = useState<'presence' | 'idds'>('presence');
  const [chartGroupFilter, setChartGroupFilter] = useState<string>('all');
  const [globalCompliance, setGlobalCompliance] = useState(0);
  const [totalSignaturesMonth, setTotalSignaturesMonth] = useState(0);
  const [participationRate, setParticipationRate] = useState(0);

  // Filter states
  const [filterDate, setFilterDate] = useState<string>(() => getLocalDateStr(new Date()));
  const [filterShift, setFilterShift] = useState<string>('all');
  const [selectedLetter, setSelectedLetter] = useState<string>('all');
  const [participantSearch, setParticipantSearch] = useState<string>('');
  
  // Admin form state (Automatic Date, Shift, and Group according to scale)
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newShift, setNewShift] = useState<string>(() => getCurrentShift());
  const [newGroup, setNewGroup] = useState<string>(() => getGroupForShift(new Date(), getCurrentShift()));
  const [newExecutor, setNewExecutor] = useState('');
  const [newTotalPrevisto, setNewTotalPrevisto] = useState<number>(9);
  const [newDate, setNewDate] = useState<string>(() => getLocalDateStr(new Date()));
  const [isCreateFormExpanded, setIsCreateFormExpanded] = useState(false);

  // Keep automatic shift and group synchronized with real-time clock
  const updateAutomaticShiftAndGroup = () => {
    const now = new Date();
    const curDateStr = getLocalDateStr(now);
    const curShift = getCurrentShift(now);
    const curGroup = getGroupForShift(now, curShift);
    setNewDate(curDateStr);
    setNewShift(curShift);
    setNewGroup(curGroup);
  };

  const handleDateChange = (dateVal: string) => {
    const todayStr = getLocalDateStr(new Date());
    // Prevent selecting a past date
    if (dateVal && dateVal < todayStr) {
      setError('Não é permitido criar DDS com data anterior à data atual.');
      return;
    }
    setNewDate(dateVal);
    if (dateVal) {
      const [year, month, day] = dateVal.split('-').map(Number);
      const d = new Date(year, month - 1, day, 12, 0, 0);
      const group = getGroupForShift(d, newShift as Shift);
      if (group) setNewGroup(group);
    }
  };

  const handleShiftChange = (shiftVal: string) => {
    setNewShift(shiftVal);
    if (newDate) {
      const [year, month, day] = newDate.split('-').map(Number);
      const d = new Date(year, month - 1, day, 12, 0, 0);
      const group = getGroupForShift(d, shiftVal as Shift);
      if (group) setNewGroup(group);
    }
  };

  // Mood selector state
  const [showMoodModal, setShowMoodModal] = useState(false);
  const [selectedMood, setSelectedMood] = useState<'happy' | 'neutral' | 'sad' | null>(null);
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);

  // Today date string in local timezone
  const todayDateStr = useMemo(() => getLocalDateStr(new Date()), []);

  // Today's active and created sessions (timezone-safe check)
  const todaySessions = useMemo(() => {
    return sessions.filter((s: any) => {
      const dStr = getLocalDateStr(s.createdAt || s.date);
      return dStr === todayDateStr;
    });
  }, [sessions, todayDateStr]);

  // Signatures mapped by session ID (sorted chronologically)
  const signaturesBySession = useMemo(() => {
    const map: Record<string, any[]> = {};
    allSignaturesList.forEach((sig: any) => {
      if (sig.sessionId) {
        if (!map[sig.sessionId]) map[sig.sessionId] = [];
        map[sig.sessionId].push(sig);
      }
    });
    // Sort signatures within each session ascending by timestamp
    Object.keys(map).forEach((sId) => {
      map[sId].sort((a, b) => {
        const tA = a.timestamp?.seconds || (a.timestamp ? new Date(a.timestamp).getTime() / 1000 : 0);
        const tB = b.timestamp?.seconds || (b.timestamp ? new Date(b.timestamp).getTime() / 1000 : 0);
        return tA - tB;
      });
    });
    return map;
  }, [allSignaturesList]);

  // Signatures count mapped by session ID
  const signatureCountBySession = useMemo(() => {
    const map: Record<string, number> = {};
    allSignaturesList.forEach((sig: any) => {
      if (sig.sessionId) {
        map[sig.sessionId] = (map[sig.sessionId] || 0) + 1;
      }
    });
    return map;
  }, [allSignaturesList]);

  // Standard DDS title suggestion: "Turno X - DDS DD-MM-AAAA"
  const defaultTitleSuggestion = useMemo(() => {
    if (!newDate) return `${newShift} - DDS ${formatDateDDMMAAAA(new Date())}`;
    const [year, month, day] = newDate.split('-').map(Number);
    const d = new Date(year, month - 1, day, 12, 0, 0);
    return `${newShift} - DDS ${formatDateDDMMAAAA(d)}`;
  }, [newDate, newShift]);

  useEffect(() => {
    const currentShift = getCurrentShift();
    const expectedGroup = getGroupForShift(new Date(), currentShift);
    setNewShift(currentShift);
    setNewGroup(expectedGroup);
    setNewExecutor(profile?.displayName || '');

    // Initialize from cache immediately for fast render and offline/quota resilience
    const cached = getLocalCachedUsers()
      .filter(user => {
        const userEmail = user.email || '';
        if (userEmail === 'jacksonbjr@gmail.com') return false;
        return (!MASTER_EMAILS.includes(userEmail) || isMaster) && user.displayName !== 'Sem nome';
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
    if (cached.length > 0) {
      setRegisteredUsers(cached);
    }

    // Fetch registered users safely with cache fallback
    const fetchUsers = async () => {
      if (!profile) return;
      try {
        const userList = await fetchUsersSafely();
        const filteredAndSortedList = userList
          .filter(user => {
            const userEmail = user.email || '';
            if (userEmail === 'jacksonbjr@gmail.com') return false;
            return (!MASTER_EMAILS.includes(userEmail) || isMaster) && user.displayName !== 'Sem nome';
          })
          .sort((a, b) => a.displayName.localeCompare(b.displayName));
        if (filteredAndSortedList.length > 0) {
          setRegisteredUsers(filteredAndSortedList);
        }
      } catch (err) {
        console.warn("Could not refresh users list:", err);
      }
    };
    fetchUsers();
  }, [profile]);

  useEffect(() => {
    const urlPasscode = searchParams.get('passcode');
    const directUrl = new URL(window.location.href);
    const directPasscode = urlPasscode || directUrl.searchParams.get('passcode') || new URLSearchParams(directUrl.hash.split('?')[1] || '').get('passcode');
    if (directPasscode) {
      setPasscode(directPasscode);
    }
  }, [searchParams]);

  useEffect(() => {
    // Listen to recent sessions across dates
    const q = query(
      collection(db, 'dds_sessions'),
      orderBy('createdAt', 'desc'),
      limit(400)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSessions(docs);
      
      // Auto-pick active session smoothly
      setActiveSession((currentActive: any) => {
        // If current active session still exists, keep it updated
        if (currentActive) {
          const fresh = docs.find((s: any) => s.id === currentActive.id);
          if (fresh) return fresh;
        }

        const todayStr = getLocalDateStr(new Date());
        const currentShift = getCurrentShift();
        const expectedGroup = getGroupForShift(new Date(), currentShift);

        // 1. Try finding exact shift + group match for today
        const exactMatch = docs.find((s: any) => {
          const dStr = getLocalDateStr(s.createdAt);
          return dStr === todayStr && s.shift === currentShift && s.group === expectedGroup;
        });
        if (exactMatch) return exactMatch;

        // 2. Try finding any session for current shift today
        const shiftMatch = docs.find((s: any) => {
          const dStr = getLocalDateStr(s.createdAt);
          return dStr === todayStr && s.shift === currentShift;
        });
        if (shiftMatch) return shiftMatch;

        // 3. Try finding any session created today
        const todayMatch = docs.find((s: any) => {
          const dStr = getLocalDateStr(s.createdAt);
          return dStr === todayStr;
        });
        if (todayMatch) return todayMatch;

        // 4. Try finding any session that is currently active and unexpired
        const unexpiredSession = docs.find((s: any) => {
          const exp = safeToDate(s.expiresAt);
          return exp && exp.getTime() > Date.now();
        });
        if (unexpiredSession) return unexpiredSession;

        // If no DDS was created for today and none is currently active/unexpired, return null
        return null;
      });
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'dds_sessions');
      setError("Erro ao carregar sessões.");
    });

    return () => unsubscribe();
  }, []);

  // When a 6-digit passcode is typed or scanned, automatically match and switch to that specific DDS session
  useEffect(() => {
    if (!passcode || passcode.trim().length !== 6) return;
    const cleanPass = passcode.trim();
    const matchingSession = sessions.find((s: any) => s.passcode === cleanPass);
    if (matchingSession && activeSession?.id !== matchingSession.id) {
      setActiveSession(matchingSession);
    }
  }, [passcode, sessions, activeSession]);

  useEffect(() => {
    if (!auth.currentUser || (!isManager && !isAdmin && !isMaster)) {
      setAllSessionsList([]);
      setAllSignaturesList([]);
      return;
    }

    // Fetch sessions for the whole month for charts and global compliance (Managers/Admins only)
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Sessions Query
    const qSessions = query(
      collection(db, 'dds_sessions'),
      where('createdAt', '>=', Timestamp.fromDate(firstDay)),
      orderBy('createdAt', 'asc')
    );

    // Signatures Query
    const qSignatures = query(
      collection(db, 'dds_signatures'),
      where('timestamp', '>=', Timestamp.fromDate(firstDay)),
      orderBy('timestamp', 'asc')
    );

    const unsubSessions = onSnapshot(qSessions, (snapshot) => {
      const allDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAllSessionsList(allDocs);
      
      // Global Compliance: (Completed Slots / Total Possible Slots)
      // We group by day and shift to avoid double counting same shift sessions
      const uniqueSessions = new Set();
      allDocs.forEach((s: any) => {
        const d = safeToDate(s.createdAt);
        const date = d ? d.toDateString() : '';
        if (date) uniqueSessions.add(`${date}_${s.shift}`);
      });

      const dayOfMonth = now.getDate();
      const expectedTotal = dayOfMonth * 3;
      const compliance = Math.min(100, Math.round((uniqueSessions.size / expectedTotal) * 100));
      setGlobalCompliance(compliance);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'dds_sessions');
    });

    const unsubSignatures = onSnapshot(qSignatures, async (snapshot) => {
      const allSigs = await Promise.all(snapshot.docs.map(async (doc) => {
        const data = doc.data() as any;
        const decName = await decryptValue(data.userName);
        return {
          id: doc.id,
          ...data,
          userName: decName
        };
      }));
      setAllSignaturesList(allSigs);
      setTotalSignaturesMonth(allSigs.length);
      
      // Participation rate
      setParticipationRate(allSigs.length); 
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'dds_signatures');
    });

    return () => {
      unsubSessions();
      unsubSignatures();
    };
  }, [auth.currentUser, isManager, isAdmin, isMaster]);

  const monthlyData = useMemo(() => {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    
    // Initialize day map for the entire month dynamically to show full tracking visual rhythm
    const dayMap: { [key: string]: { name: string; sessions: number; signatures: number; idds: number } } = {};
    for (let i = 1; i <= daysInMonth; i++) {
      const dayStr = i < 10 ? `0${i}` : `${i}`;
      dayMap[dayStr] = { name: dayStr, sessions: 0, signatures: 0, idds: 0 };
    }

    // Populate sessions
    allSessionsList.forEach((s: any) => {
      const d = safeToDate(s.createdAt);
      const date = d ? d.toLocaleDateString('pt-BR', { day: '2-digit' }) : '';
      if (date && dayMap[date]) {
        dayMap[date].sessions += 1;
      }
    });

    // Populate signatures
    allSignaturesList.forEach((sig: any) => {
      const d = safeToDate(sig.timestamp);
      const date = d ? d.toLocaleDateString('pt-BR', { day: '2-digit' }) : '';
      if (date && dayMap[date]) {
        dayMap[date].signatures += 1;
      }
    });

    // Calculate IDDS logic for each day (Ratio proportional with base target 0.75)
    const sessionsByDay: { [key: string]: any[] } = {};
    allSessionsList.forEach((s: any) => {
      const d = safeToDate(s.createdAt);
      const date = d ? d.toLocaleDateString('pt-BR', { day: '2-digit' }) : '';
      if (date) {
        if (!sessionsByDay[date]) sessionsByDay[date] = [];
        sessionsByDay[date].push(s);
      }
    });

    Object.keys(dayMap).forEach((dayStr) => {
      const sessions = sessionsByDay[dayStr] || [];
      if (sessions.length === 0) {
        dayMap[dayStr].idds = 0;
      } else {
        let iddsSum = 0;
        sessions.forEach((s: any) => {
          const sessionSigs = allSignaturesList.filter((sig: any) => sig.sessionId === s.id);
          const total_participantes = sessionSigs.length;
          const total_previsto = s.totalPrevisto || 9;
          const shiftCompliance = total_participantes / total_previsto;

          // Se realizado conforme o esperado (meta de 75%), IDDS é 1.0 (100%)
          // Se abaixo da meta, razão proporcional com base na meta de 0.75
          const idds = shiftCompliance >= 0.75 ? 1.0 : (shiftCompliance / 0.75);
          iddsSum += idds;
        });
        
        const dayAvgIdds = iddsSum / sessions.length;
        dayMap[dayStr].idds = Math.round(dayAvgIdds * 100);
      }
    });

    return Object.values(dayMap).sort((a, b) => a.name.localeCompare(b.name));
  }, [allSessionsList, allSignaturesList]);

  const filteredMonthlyData = useMemo(() => {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    
    // Initialize day map for the entire month dynamically to show full tracking visual rhythm
    const dayMap: { [key: string]: { name: string; sessions: number; signatures: number; idds: number } } = {};
    for (let i = 1; i <= daysInMonth; i++) {
      const dayStr = i < 10 ? `0${i}` : `${i}`;
      dayMap[dayStr] = { name: dayStr, sessions: 0, signatures: 0, idds: 0 };
    }

    // Filter sessions by selected group letter
    const filteredSessions = allSessionsList.filter((s: any) => {
      if (chartGroupFilter === 'all') return true;
      return s.group?.toUpperCase() === chartGroupFilter.toUpperCase();
    });

    // Populate sessions
    filteredSessions.forEach((s: any) => {
      const d = safeToDate(s.createdAt);
      const date = d ? d.toLocaleDateString('pt-BR', { day: '2-digit' }) : '';
      if (date && dayMap[date]) {
        dayMap[date].sessions += 1;
      }
    });

    // Filter signatures belonging to the filtered sessions
    const sessionIds = new Set(filteredSessions.map((s: any) => s.id));
    const filteredSignatures = allSignaturesList.filter((sig: any) => sessionIds.has(sig.sessionId));

    // Populate signatures
    filteredSignatures.forEach((sig: any) => {
      const d = safeToDate(sig.timestamp);
      const date = d ? d.toLocaleDateString('pt-BR', { day: '2-digit' }) : '';
      if (date && dayMap[date]) {
        dayMap[date].signatures += 1;
      }
    });

    // Calculate IDDS logic for each day (Ratio proportional with base target 0.75) for the filtered sessions
    const sessionsByDay: { [key: string]: any[] } = {};
    filteredSessions.forEach((s: any) => {
      const d = safeToDate(s.createdAt);
      const date = d ? d.toLocaleDateString('pt-BR', { day: '2-digit' }) : '';
      if (date) {
        if (!sessionsByDay[date]) sessionsByDay[date] = [];
        sessionsByDay[date].push(s);
      }
    });

    Object.keys(dayMap).forEach((dayStr) => {
      const sessions = sessionsByDay[dayStr] || [];
      if (sessions.length === 0) {
        dayMap[dayStr].idds = 0;
      } else {
        let iddsSum = 0;
        sessions.forEach((s: any) => {
          const sessionSigs = filteredSignatures.filter((sig: any) => sig.sessionId === s.id);
          const total_participantes = sessionSigs.length;
          const total_previsto = s.totalPrevisto || 9;
          const shiftCompliance = total_participantes / total_previsto;

          // Se realizado conforme o esperado (meta de 75%), IDDS é 1.0 (100%)
          // Se abaixo da meta, razão proporcional com base na meta de 0.75
          const idds = shiftCompliance >= 0.75 ? 1.0 : (shiftCompliance / 0.75);
          iddsSum += idds;
        });
        
        const dayAvgIdds = iddsSum / sessions.length;
        dayMap[dayStr].idds = Math.round(dayAvgIdds * 100);
      }
    });

    return Object.values(dayMap).sort((a, b) => a.name.localeCompare(b.name));
  }, [allSessionsList, allSignaturesList, chartGroupFilter]);

  const filteredSessions = useMemo(() => {
    const list = sessions.filter((s: any) => {
      // Date filter
      if (filterDate && filterDate !== 'all') {
        const dateStr = getLocalDateStr(s.createdAt);
        if (dateStr !== filterDate) return false;
      }

      // Shift filter
      if (filterShift && filterShift !== 'all') {
        if (s.shift !== filterShift) return false;
      }

      // Group/Letter filter
      if (selectedLetter && selectedLetter !== 'all') {
        if (s.group !== selectedLetter) return false;
      }

      // Search query (title, executor, description, id, passcode)
      if (participantSearch && participantSearch.trim() !== '') {
        const q = participantSearch.toLowerCase().trim();
        const titleMatch = (s.title || '').toLowerCase().includes(q);
        const executorMatch = (s.executor || '').toLowerCase().includes(q);
        const creatorMatch = (s.createdByName || '').toLowerCase().includes(q);
        const descMatch = (s.description || '').toLowerCase().includes(q);
        const idMatch = (s.id || '').toLowerCase().includes(q);
        const passMatch = (s.passcode || '').toLowerCase().includes(q);
        if (!titleMatch && !executorMatch && !creatorMatch && !descMatch && !idMatch && !passMatch) return false;
      }

      return true;
    });

    // Sort hierarchically: Date (descending) -> Shift (Turno 1, Turno 2, Turno 3) -> CreatedAt (descending)
    return list.sort((a: any, b: any) => {
      const dateA = getLocalDateStr(a.createdAt);
      const dateB = getLocalDateStr(b.createdAt);
      if (dateA !== dateB) {
        return dateB.localeCompare(dateA); // most recent date first
      }

      const shiftOrder: Record<string, number> = { 'Turno 1': 1, 'Turno 2': 2, 'Turno 3': 3 };
      const sA = shiftOrder[a.shift] || 99;
      const sB = shiftOrder[b.shift] || 99;
      if (sA !== sB) {
        return sA - sB; // Turno 1 -> Turno 2 -> Turno 3
      }

      const tA = a.createdAt?.seconds || (a.createdAt ? new Date(a.createdAt).getTime() / 1000 : 0);
      const tB = b.createdAt?.seconds || (b.createdAt ? new Date(b.createdAt).getTime() / 1000 : 0);
      return tB - tA;
    });
  }, [sessions, filterDate, filterShift, selectedLetter, participantSearch]);

  // Group filtered sessions by calendar date for clear visual hierarchy
  const groupedSessionsByDate = useMemo(() => {
    const groups: { dateKey: string; formattedDate: string; isToday: boolean; sessions: any[] }[] = [];
    const map = new Map<string, any[]>();
    const todayStr = getLocalDateStr(new Date());

    filteredSessions.forEach((s: any) => {
      const dKey = getLocalDateStr(s.createdAt) || 'Sem data';
      if (!map.has(dKey)) {
        map.set(dKey, []);
      }
      map.get(dKey)!.push(s);
    });

    map.forEach((sessionsInDate, dateKey) => {
      let formattedDate = dateKey;
      if (dateKey !== 'Sem data') {
        const [year, month, day] = dateKey.split('-').map(Number);
        if (year && month && day) {
          const d = new Date(year, month - 1, day, 12, 0, 0);
          formattedDate = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
          // Capitalize first letter of weekday
          formattedDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
        }
      }

      groups.push({
        dateKey,
        formattedDate,
        isToday: dateKey === todayStr,
        sessions: sessionsInDate
      });
    });

    return groups;
  }, [filteredSessions]);

  useEffect(() => {
    if (!activeSession || !auth.currentUser) {
      setHasSigned(false);
      return;
    }

    const docId = `${auth.currentUser.uid}_${activeSession.id}`;
    const unsubscribe = onSnapshot(doc(db, 'dds_signatures', docId), (doc) => {
      setHasSigned(doc.exists());
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `dds_signatures/${docId}`);
    });

    return () => unsubscribe();
  }, [activeSession]);

  useEffect(() => {
    if (!auth.currentUser) {
      setHistory([]);
      return;
    }

    setHistoryLoading(true);
    const q = query(
      collection(db, 'dds_signatures'),
      where('userId', '==', auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      let signatures = await Promise.all(snapshot.docs.map(async (doc) => {
        const data = doc.data() as any;
        const decName = await decryptValue(data.userName);
        return {
          id: doc.id,
          ...data,
          userName: decName
        };
      }));
      
      // Sort client-side descending by timestamp
      signatures.sort((a: any, b: any) => {
        const tA = a.timestamp?.seconds || (a.timestamp ? new Date(a.timestamp).getTime() / 1000 : 0);
        const tB = b.timestamp?.seconds || (b.timestamp ? new Date(b.timestamp).getTime() / 1000 : 0);
        return tB - tA;
      });
      // Limit to 5
      signatures = signatures.slice(0, 5);
      
      // If sessionTitle is missing (backward compatibility), fetch it
      const historyWithTitles = await Promise.all(signatures.map(async (sig: any) => {
        if (sig.sessionTitle) return sig;
        
        try {
          const sessionDoc = await getDocs(query(collection(db, 'dds_sessions'), where('__name__', '==', sig.sessionId)));
          if (!sessionDoc.empty) {
            return { ...sig, sessionTitle: sessionDoc.docs[0].data().title };
          }
        } catch (err) {
          console.error(err);
        }
        return { ...sig, sessionTitle: 'Sessão Desconhecida' };
      }));

      setHistory(historyWithTitles);
      setHistoryLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'dds_signatures');
      setHistoryLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!expandedSessionId) {
      setSessionSignatures([]);
      return;
    }

    setSignaturesLoading(true);
    const q = query(
      collection(db, 'dds_signatures'),
      where('sessionId', '==', expandedSessionId)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const sigs = await Promise.all(snapshot.docs.map(async (doc) => {
        const data = doc.data() as any;
        const decName = await decryptValue(data.userName);
        return {
          id: doc.id,
          ...data,
          userName: decName
        };
      }));
      // Sort client-side descending by timestamp
      sigs.sort((a: any, b: any) => {
        const tA = a.timestamp?.seconds || (a.timestamp ? new Date(a.timestamp).getTime() / 1000 : 0);
        const tB = b.timestamp?.seconds || (b.timestamp ? new Date(b.timestamp).getTime() / 1000 : 0);
        return tB - tA;
      });
      setSessionSignatures(sigs);
      setSignaturesLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'dds_signatures');
      setSignaturesLoading(false);
    });

    return () => unsubscribe();
  }, [expandedSessionId]);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate that creation date cannot be in the past
    const todayStr = getLocalDateStr(new Date());
    const creationDateStr = newDate || todayStr;
    if (creationDateStr < todayStr) {
      setError('Não é permitido criar DDS com data retroativa/anterior.');
      return;
    }

    const currentShiftAuto = getCurrentShift();
    const shiftToUse = (newShift || currentShiftAuto) as Shift;
    const groupToUse = getGroupForShift(new Date(), shiftToUse);

    const titleToSave = (newTitle || '').trim() || `${shiftToUse} - DDS ${formatDateDDMMAAAA(new Date())}`;
    
    setLoading(true);
    setError('');

    try {
      if (editingSession) {
        const updatePayload: any = {
          title: titleToSave,
          description: newDescription,
          shift: shiftToUse,
          group: groupToUse,
          executor: newExecutor,
          totalPrevisto: newTotalPrevisto,
          updatedAt: serverTimestamp()
        };

        if (newDate) {
          const [year, month, day] = newDate.split('-').map(Number);
          const sessionDate = new Date(year, month - 1, day, 12, 0, 0);
          updatePayload.createdAt = Timestamp.fromDate(sessionDate);
        }

        await updateDoc(doc(db, 'dds_sessions', editingSession.id), updatePayload);
        setEditingSession(null);
      } else {
        // Generate 6 digit passcode for managers, admins and masters
        const generatedPasscode = (isManager || isAdmin || isMaster) ? Math.floor(100000 + Math.random() * 900000).toString() : '';
        
        const now = new Date();
        const sessionDate = now;

        // Validity for DDS signature is exactly 4 hours from creation
        const expiresAt = new Date(now.getTime() + 4 * 60 * 60 * 1000);

        await addDoc(collection(db, 'dds_sessions'), {
          title: titleToSave,
          description: newDescription,
          shift: shiftToUse,
          group: groupToUse,
          executor: newExecutor,
          totalPrevisto: newTotalPrevisto,
          passcode: generatedPasscode,
          expiresAt: Timestamp.fromDate(expiresAt),
          createdAt: Timestamp.fromDate(sessionDate),
          createdBy: auth.currentUser?.uid,
          createdByName: profile?.displayName || auth.currentUser?.displayName || 'Administrador'
        });
      }

      setNewTitle('');
      setNewDescription('');
      setNewExecutor(profile?.displayName || '');
      setNewTotalPrevisto(9);
      updateAutomaticShiftAndGroup();
      setIsCreateFormExpanded(false);
      setSuccessMessage(editingSession ? 'Sessão atualizada com sucesso!' : 'Novo DDS criado com sucesso!');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes('Insufficient permissions') || err.message?.includes('permission-denied')) {
        setError('Você não tem permissão para criar ou alterar um DDS. Verifique se seu perfil foi aprovado pelo administrador.');
      } else if (err.message?.includes('index')) {
        setError('O sistema ainda está configurando os índices do banco de dados. Por favor, tente novamente em alguns minutos.');
      } else {
        setError('Ocorreu um erro ao processar o DDS. Verifique sua conexão.');
      }
      handleFirestoreError(err, editingSession ? OperationType.UPDATE : OperationType.CREATE, 'dds_sessions');
    } finally {
      setLoading(false);
    }
  };

  const handleEditSession = (session: any) => {
    if (!isAdmin && !isMaster && !isManager) {
      setError('Apenas gestores, administradores e master podem editar sessões de DDS.');
      return;
    }
    setEditingSession(session);
    setNewTitle(session.title || '');
    setNewDescription(session.description || '');
    setNewShift(session.shift || 'Turno 1');
    setNewGroup(session.group || 'A');
    setNewExecutor(session.executor || '');
    setNewTotalPrevisto(session.totalPrevisto || 9);
    
    const dObj = safeToDate(session.createdAt);
    if (dObj) {
      setNewDate(dObj.toISOString().split('T')[0]);
    } else {
      setNewDate(new Date().toISOString().split('T')[0]);
    }
    setIsCreateFormExpanded(true);
    
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!isAdmin && !isMaster && !isManager) {
      setError('Apenas gestores, administradores ou master podem excluir sessões.');
      return;
    }
    setSessionToDelete(sessionId);
  };

  const confirmDeleteSession = async () => {
    if (!sessionToDelete) return;
    
    setLoading(true);
    setError(null);
    try {
      // 1. Delete the session document itself
      await deleteDoc(doc(db, 'dds_sessions', sessionToDelete));

      // 2. Clean up any linked signatures safely with chunked batching
      try {
        const q = query(collection(db, 'dds_signatures'), where('sessionId', '==', sessionToDelete));
        const sigSnapshot = await getDocs(q);
        if (!sigSnapshot.empty) {
          const BATCH_SIZE = 450;
          for (let i = 0; i < sigSnapshot.docs.length; i += BATCH_SIZE) {
            const chunk = sigSnapshot.docs.slice(i, i + BATCH_SIZE);
            const batch = writeBatch(db);
            chunk.forEach(d => batch.delete(d.ref));
            await batch.commit();
          }
        }
      } catch (sigErr) {
        console.warn('Aviso ao excluir assinaturas vinculadas:', sigErr);
      }

      // 3. Synchronize local states instantly
      setSessions(prev => prev.filter(s => s.id !== sessionToDelete));
      setAllSessionsList(prev => prev.filter(s => s.id !== sessionToDelete));
      setAllSignaturesList(prev => prev.filter(s => s.sessionId !== sessionToDelete));
      setSessionSignatures(prev => prev.filter(s => s.sessionId !== sessionToDelete));

      if (activeSession && activeSession.id === sessionToDelete) {
        setActiveSession(null);
      }

      setSuccessMessage('Sessão de DDS e todas as assinaturas vinculadas foram excluídas com sucesso!');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error('Erro ao excluir sessão de DDS:', err);
      setError(err?.message || 'Falha ao excluir a sessão de DDS. Verifique suas permissões.');
    } finally {
      setLoading(false);
      setSessionToDelete(null);
    }
  };

  const handleResetSessionSignatures = (session: any, count: number) => {
    if (!isAdmin && !isMaster && !isManager) {
      setError('Apenas gestores, administradores ou master podem resetar listas de assinaturas.');
      return;
    }
    setSessionToReset({ id: session.id, title: session.title, count });
  };

  const confirmResetSessionSignatures = async () => {
    if (!sessionToReset) return;
    setLoading(true);
    setError(null);
    try {
      const q = query(collection(db, 'dds_signatures'), where('sessionId', '==', sessionToReset.id));
      const sigSnapshot = await getDocs(q);
      
      if (!sigSnapshot.empty) {
        const BATCH_SIZE = 450;
        for (let i = 0; i < sigSnapshot.docs.length; i += BATCH_SIZE) {
          const chunk = sigSnapshot.docs.slice(i, i + BATCH_SIZE);
          const batch = writeBatch(db);
          chunk.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
      }

      // Synchronize local signature states
      setSessionSignatures(prev => prev.filter(s => s.sessionId !== sessionToReset.id));
      setAllSignaturesList(prev => prev.filter(s => s.sessionId !== sessionToReset.id));

      setSuccessMessage(`Lista de assinaturas do DDS "${sessionToReset.title}" foi resetada com sucesso!`);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3500);
    } catch (err: any) {
      console.error('Erro ao resetar assinaturas:', err);
      setError(err?.message || 'Falha ao resetar assinaturas da sessão.');
    } finally {
      setLoading(false);
      setSessionToReset(null);
    }
  };

  const handleDeleteSignature = (sigId: string, userName: string, sessionId: string) => {
    if (!isAdmin && !isMaster && !isManager) {
      setError('Apenas gestores, administradores ou master podem excluir assinaturas.');
      return;
    }
    setSignatureToDelete({ id: sigId, userName, sessionId });
  };

  const confirmDeleteSignature = async () => {
    if (!signatureToDelete) return;
    setLoading(true);
    setError(null);
    try {
      await deleteDoc(doc(db, 'dds_signatures', signatureToDelete.id));
      setSessionSignatures(prev => prev.filter(s => s.id !== signatureToDelete.id));
      setAllSignaturesList(prev => prev.filter(s => s.id !== signatureToDelete.id));
      setSuccessMessage(`Assinatura de ${signatureToDelete.userName} excluída com sucesso!`);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error('Erro ao excluir assinatura:', err);
      setError(err?.message || 'Falha ao excluir assinatura.');
    } finally {
      setLoading(false);
      setSignatureToDelete(null);
    }
  };

  const confirmWipeAllDDSData = async () => {
    if (!isAdmin && !isMaster) {
      setError('Apenas administradores ou master podem limpar toda a base de DDS.');
      return;
    }
    setWipeInProgress(true);
    setError(null);
    try {
      // 1. Fetch all signatures
      const sigSnap = await getDocs(collection(db, 'dds_signatures'));
      const sigDocs = sigSnap.docs;

      // Batch delete signatures (chunks of 450 to respect Firestore 500 operation limit per batch)
      const BATCH_SIZE = 450;
      for (let i = 0; i < sigDocs.length; i += BATCH_SIZE) {
        const chunk = sigDocs.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        chunk.forEach(docSnap => {
          batch.delete(docSnap.ref);
        });
        await batch.commit();
      }

      // 2. Fetch all sessions
      const sessionSnap = await getDocs(collection(db, 'dds_sessions'));
      const sessionDocs = sessionSnap.docs;

      // Batch delete sessions
      for (let i = 0; i < sessionDocs.length; i += BATCH_SIZE) {
        const chunk = sessionDocs.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        chunk.forEach(docSnap => {
          batch.delete(docSnap.ref);
        });
        await batch.commit();
      }

      // Reset local states
      setSessions([]);
      setAllSessionsList([]);
      setSessionSignatures([]);
      setAllSignaturesList([]);
      setExpandedSessionId(null);

      setSuccessMessage(`Limpeza concluída com sucesso! ${sessionDocs.length} sessões e ${sigDocs.length} assinaturas foram apagadas sem exceder limites do Firebase.`);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4500);
      setShowWipeAllModal(false);
    } catch (err: any) {
      console.error('Erro ao apagar todo o histórico de DDS:', err);
      setError(err?.message || 'Falha ao limpar todos os dados de DDS.');
    } finally {
      setWipeInProgress(false);
    }
  };

  const handleRefreshRegisteredUsers = async () => {
    setIsRefreshingUsers(true);
    try {
      const userList = await fetchUsersSafely();
      const filtered = userList
        .filter(user => user.displayName && user.displayName !== 'Sem nome' && user.displayName.trim() !== '')
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
      if (filtered.length > 0) {
        setRegisteredUsers(filtered);
      }
    } catch (err) {
      console.warn("Could not refresh registered users:", err);
    } finally {
      setIsRefreshingUsers(false);
    }
  };

  const handleOpenAddSignature = async (session: any) => {
    if (!isAdmin && !isMaster && !isManager) return;
    setTargetSessionForSignature(session);
    setManualParticipantName('');
    setManualRegistration('');
    setManualSelectedUid('');
    setManualUserSearch('');
    setManualMood('happy');
    setShowAddSignatureModal(true);

    // Ensure registered users are available in the dropdown
    if (registeredUsers.length === 0) {
      const cached = getLocalCachedUsers()
        .filter(user => user.displayName && user.displayName !== 'Sem nome' && user.displayName.trim() !== '')
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
      if (cached.length > 0) {
        setRegisteredUsers(cached);
      }
      try {
        const userList = await fetchUsersSafely();
        const filtered = userList
          .filter(user => user.displayName && user.displayName !== 'Sem nome' && user.displayName.trim() !== '')
          .sort((a, b) => a.displayName.localeCompare(b.displayName));
        if (filtered.length > 0) {
          setRegisteredUsers(filtered);
        }
      } catch (err) {
        console.warn("Could not fetch users for manual signature modal:", err);
      }
    }
  };

  const handleSaveManualSignature = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin && !isMaster && !isManager) return;
    if (!targetSessionForSignature || !manualParticipantName.trim()) {
      setError('Por favor, informe o nome do colaborador.');
      return;
    }

    setLoading(true);
    try {
      const cleanName = manualParticipantName.trim();
      const encName = await encryptValue(cleanName);
      const mappedUid = manualSelectedUid || `manual_${Date.now()}`;
      const docId = `${mappedUid}_${targetSessionForSignature.id}`.replace(/[^a-zA-Z0-9_@.-]/g, '_').slice(0, 120);

      const sessionDate = safeToDate(targetSessionForSignature.createdAt) || new Date();

      await setDoc(doc(db, 'dds_signatures', docId), {
        sessionId: targetSessionForSignature.id,
        sessionTitle: targetSessionForSignature.title,
        userId: mappedUid,
        userName: encName,
        registration: manualRegistration.trim() || null,
        timestamp: Timestamp.fromDate(sessionDate),
        mood: manualMood,
        passcode: 'manual_admin',
        createdAt: serverTimestamp(),
        addedBy: auth.currentUser?.uid
      });

      setShowAddSignatureModal(false);
      setManualParticipantName('');
      setManualRegistration('');
      setManualSelectedUid('');
      setSuccessMessage(`Presença de ${cleanName} adicionada com sucesso!`);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'dds_signatures');
    } finally {
      setLoading(false);
    }
  };

  const handleRenewSession = async (sessionId: string) => {
    try {
      const newExpiresAt = new Date();
      newExpiresAt.setHours(newExpiresAt.getHours() + 4);
      await updateDoc(doc(db, 'dds_sessions', sessionId), {
        expiresAt: Timestamp.fromDate(newExpiresAt),
        updatedAt: serverTimestamp()
      });
      setSuccessMessage('Sessão reativada por mais 4 horas!');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `dds_sessions/${sessionId}`);
    }
  };

  const canEditSession = (session: any) => {
    if (!session) return false;
    // Admins, Masters, and Managers have authority to edit sessions
    if (isAdmin || isMaster || isManager) return true;
    
    // Regular users cannot edit
    return false;
  };

  const handleSign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession || !passcode) return;
    setShowMoodModal(true);
  };

  const submitSignature = async (mood: 'happy' | 'neutral' | 'sad') => {
    setLoading(true);
    setError('');
    setShowMoodModal(false);

    try {
      if (!auth.currentUser) throw new Error('Usuário não autenticado');
      
      const cleanPass = passcode.trim();
      // Determine target session (either matching passcode session or activeSession)
      let targetSession = activeSession;
      if (cleanPass) {
        const found = sessions.find((s: any) => s.passcode?.trim() === cleanPass);
        if (found) {
          targetSession = found;
        }
      }

      if (!targetSession) {
        throw new Error('Nenhuma sessão de DDS selecionada ou encontrada para esta senha.');
      }

      const now = new Date();

      // 1. Check if the passcode has expired (validity of 4 hours)
      const sessionExpiryDate = safeToDate(targetSession.expiresAt);
      if (sessionExpiryDate && now.getTime() > sessionExpiryDate.getTime()) {
        throw new Error('O código de validação deste DDS expirou (validade máxima de 4 horas). Solicite a reativação da senha ao gestor.');
      }

      // 2. Check if current time is within the session's shift operational window
      const sessionDate = safeToDate(targetSession.createdAt || targetSession.date) || now;
      const targetShift = targetSession.shift as Shift;
      if (targetShift && !isWithinShiftWindow(sessionDate, targetShift, now)) {
        const { start, end } = getShiftTimeRange(sessionDate, targetShift);
        const startStr = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
        const endStr = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
        throw new Error(`A assinatura só pode ser realizada dentro do seu respectivo turno (${targetShift}: ${startStr} às ${endStr}). Fora desse horário o registro não é permitido de acordo com a escala.`);
      }
      
      const rawDocId = `${auth.currentUser.uid}_${targetSession.id}`;
      const docId = rawDocId.replace(/[^a-zA-Z0-9_@.-]/g, '_').slice(0, 120);
      const encName = await encryptValue(profile?.displayName || 'Usuário');

      // Use setDoc with a predictable ID to prevent duplicates
      await setDoc(doc(db, 'dds_signatures', docId), {
        sessionId: targetSession.id,
        sessionTitle: targetSession.title, // Denormalize for history view
        userId: auth.currentUser.uid,
        userName: encName,
        timestamp: serverTimestamp(),
        passcode: targetSession.passcode ? targetSession.passcode.trim() : cleanPass, // Rules will check this against session passcode
        mood: mood
      });

      setPasscode('');
      setActiveSession(targetSession);
      setSuccessMessage(`Presença confirmada no DDS: ${targetSession.title} (${targetSession.shift} - Letra ${targetSession.group})!`);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3500);
    } catch (err: any) {
      console.error("Erro ao assinar DDS:", err);
      if (err.message?.includes('permission-denied') || err.message?.includes('insufficient permissions')) {
        setError('Senha incorreta ou perfil sem permissão para assinar.');
      } else if (err.message?.includes('resource-exhausted') || err.message?.includes('Quota limit')) {
        setError('Limite temporário de requisições atingido. Tente novamente em instantes.');
      } else if (err.message) {
        setError(`Erro ao assinar: ${err.message}`);
      } else {
        setError('Senha incorreta ou DDS expirado.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOpenReassignModal = (sig: any, session: any) => {
    if (!isAdmin && !isMaster && !isManager) return;
    setSignatureToReassign({
      id: sig.id,
      userName: sig.userName,
      currentSessionId: session.id,
      currentSessionTitle: session.title
    });
    // Pick another session from the same date or list
    const sessionDateStr = getLocalDateStr(session.createdAt || session.date);
    const sameDayOther = sessions.find(s => s.id !== session.id && getLocalDateStr(s.createdAt || s.date) === sessionDateStr);
    const anyOther = sessions.find(s => s.id !== session.id);
    setTargetReassignSessionId(sameDayOther ? sameDayOther.id : (anyOther ? anyOther.id : ''));
  };

  const handleConfirmReassign = async () => {
    if (!signatureToReassign || !targetReassignSessionId) return;
    setLoading(true);
    try {
      const destSession = sessions.find((s: any) => s.id === targetReassignSessionId);
      if (!destSession) throw new Error('Sessão de destino não encontrada.');

      await updateDoc(doc(db, 'dds_signatures', signatureToReassign.id), {
        sessionId: destSession.id,
        sessionTitle: destSession.title,
        updatedAt: serverTimestamp()
      });

      // Update local state for expanded participants list
      setSessionSignatures(prev => prev.filter(s => s.id !== signatureToReassign.id));
      
      setSuccessMessage(`Assinatura de ${signatureToReassign.userName} unificada e transferida para "${destSession.title} (${destSession.shift} - Letra ${destSession.group})"!`);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `dds_signatures/${signatureToReassign.id}`);
      setError('Erro ao reatribuir assinatura.');
    } finally {
      setLoading(false);
      setSignatureToReassign(null);
      setTargetReassignSessionId('');
    }
  };

  useEffect(() => {
    let html5QrCode: Html5Qrcode | null = null;
    let isMounted = true;
    
    if (isScanning) {
      // Use a slightly longer delay to ensure the DOM is absolutely ready
      const timeout = setTimeout(() => {
        if (!isMounted) return;
        
        try {
          const readerElement = document.getElementById('reader');
          if (!readerElement) {
            console.error("Reader element not found");
            setIsScanning(false);
            return;
          }

          html5QrCode = new Html5Qrcode("reader");
          const config = { 
            fps: 10, 
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0
          };

          const onScanSuccess = (decodedText: string) => {
            try {
              if (decodedText.includes('passcode=')) {
                const url = new URL(decodedText);
                const code = url.searchParams.get('passcode') || new URLSearchParams(url.hash.split('?')[1] || '').get('passcode');
                if (code) {
                  setPasscode(code);
                  setIsScanning(false);
                }
              } else if (/^\d{6}$/.test(decodedText)) {
                setPasscode(decodedText);
                setIsScanning(false);
              }
            } catch (e) {
              if (/^\d{6}$/.test(decodedText)) {
                setPasscode(decodedText);
                setIsScanning(false);
              }
            }
          };

          const startDdsScanner = async () => {
            try {
              await html5QrCode.start(
                { facingMode: "environment" },
                config,
                onScanSuccess,
                () => {}
              );
            } catch {
              await html5QrCode.start(
                { facingMode: "user" },
                config,
                onScanSuccess,
                () => {}
              );
            }
          };

          startDdsScanner().catch((err) => {
            console.error("Camera start error:", err);
            if (isMounted) {
              setIsScanning(false);
              const message = (err?.message || String(err)).toLowerCase();
              if (message.includes("notallowed") || message.includes("permission")) {
                setError("Acesso à câmera negado. Por favor, permita o acesso nas configurações do seu navegador.");
              } else if (message.includes("notfound") || message.includes("device not found") || message.includes("requested device")) {
                setError("Nenhuma câmera encontrada no dispositivo. Digite a senha de 6 dígitos manualmente.");
              } else {
                setError("Ocorreu um erro ao acessar a câmera. Tente novamente ou digite a senha manualmente.");
              }
            }
          });
        } catch (err) {
          console.error("Scanner init error:", err);
        }
      }, 500);

      return () => {
        isMounted = false;
        clearTimeout(timeout);
        if (html5QrCode && html5QrCode.isScanning) {
          html5QrCode.stop()
            .then(() => {
               try { html5QrCode?.clear(); } catch(e) {}
            })
            .catch((err) => console.error("Failed to stop scanner", err));
        }
      };
    }
  }, [isScanning]);

  return (
    <div className="space-y-8 pb-20">
      <AnimatePresence>
        {showQRFullscreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900 z-[60] flex flex-col items-center justify-center p-8 text-white"
          >
            <button 
              onClick={() => setShowQRFullscreen(false)}
              className="absolute top-10 right-10 p-4 bg-white/10 rounded-full hover:bg-white/20 transition-all text-white"
            >
              <X className="w-8 h-8" />
            </button>

            <div className="text-center mb-12">
              <h2 className="text-3xl font-black mb-2">{activeSession?.title}</h2>
              <p className="text-slate-400 uppercase tracking-[0.2em] font-bold text-sm">Escaneie para assinar o DDS</p>
            </div>

            <div className="bg-white p-8 rounded-[3rem] shadow-2xl mb-12">
              <QRCodeSVG 
                value={`${window.location.origin}/#/dds?passcode=${activeSession?.passcode}`} 
                size={300}
                level="H"
                includeMargin={false}
              />
            </div>

            <div className="flex flex-col items-center gap-4">
              <div className="px-10 py-8 bg-white/10 rounded-[2.5rem] border border-white/10 backdrop-blur-md flex flex-col items-center shadow-2xl">
                <span className="text-7xl font-black tracking-[0.2em] font-mono leading-none mb-6">
                  {activeSession?.passcode}
                </span>
                <div className="flex flex-col items-center gap-3">
                  <div className="px-4 py-2 bg-emerald-500/20 rounded-full border border-emerald-500/30 flex items-center gap-2">
                    <Timer className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm font-black tracking-widest uppercase">
                      <CountdownTimer expiresAt={safeToDate(activeSession?.expiresAt)} />
                    </span>
                  </div>
                  <p className="text-emerald-400 font-bold uppercase tracking-[0.2em] text-[10px]">Expiração da Senha</p>
                </div>
              </div>

              {isAdmin && ((safeToDate(activeSession?.expiresAt)?.getTime() || 0) < Date.now()) && (
                <button
                  onClick={() => handleRenewSession(activeSession.id)}
                  className="mt-4 bg-emerald-500 hover:bg-emerald-600 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest transition-all shadow-xl shadow-emerald-500/20 flex items-center gap-3 border-b-4 border-emerald-700 cursor-pointer"
                >
                  <Timer className="w-6 h-6" />
                  REATIVAR POR 4H
                </button>
              )}
            </div>
          </motion.div>
        )}

        {showMoodModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] p-10 max-w-md w-full shadow-2xl relative"
            >
              <button 
                onClick={() => setShowMoodModal(false)}
                className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="text-center mb-8">
                <h3 className="text-2xl font-black text-slate-900 mb-2">Como você está hoje?</h3>
                <p className="text-slate-500">Sua resposta nos ajuda a entender o clima da equipe.</p>
              </div>

              <div className="grid grid-cols-3 gap-6">
                <button
                  onClick={() => submitSignature('happy')}
                  className="group flex flex-col items-center gap-3 transition-transform active:scale-95 cursor-pointer"
                >
                  <div className="w-20 h-20 bg-emerald-50 rounded-[1.5rem] flex items-center justify-center text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white transition-all shadow-sm group-hover:shadow-emerald-200 group-hover:shadow-xl">
                    <Smile className="w-10 h-10" />
                  </div>
                  <span className="text-sm font-black uppercase tracking-wider text-slate-700 group-hover:text-emerald-600 transition-colors">FELIZ</span>
                </button>

                <button
                  onClick={() => submitSignature('neutral')}
                  className="group flex flex-col items-center gap-3 transition-transform active:scale-95 cursor-pointer"
                >
                  <div className="w-20 h-20 bg-blue-50 rounded-[1.5rem] flex items-center justify-center text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-all shadow-sm group-hover:shadow-blue-200 group-hover:shadow-xl">
                    <Meh className="w-10 h-10" />
                  </div>
                  <span className="text-sm font-black uppercase tracking-wider text-slate-700 group-hover:text-blue-600 transition-colors">NEUTRO</span>
                </button>

                <button
                  onClick={() => submitSignature('sad')}
                  className="group flex flex-col items-center gap-3 transition-transform active:scale-95 cursor-pointer"
                >
                  <div className="w-20 h-20 bg-amber-50 rounded-[1.5rem] flex items-center justify-center text-amber-500 group-hover:bg-amber-500 group-hover:text-white transition-all shadow-sm group-hover:shadow-amber-200 group-hover:shadow-xl">
                    <Frown className="w-10 h-10" />
                  </div>
                  <span className="text-sm font-black uppercase tracking-wider text-slate-700 group-hover:text-amber-600 transition-colors">TRISTE</span>
                </button>
              </div>

              <div className="mt-10 pt-8 border-t border-slate-100 flex justify-center">
                 <div className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.2em]">
                   Sua assinatura será processada após a seleção
                 </div>
              </div>
            </motion.div>
          </motion.div>
        )}

      </AnimatePresence>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Diálogo Diário de Segurança</h1>
          <p className="text-slate-500 mt-1">Participe do treinamento diário e valide sua presença.</p>
        </div>

        {(isManager || isAdmin || isMaster) && (
          <button
            type="button"
            onClick={() => setShowBulkImportModal(true)}
            className="flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs uppercase tracking-wider rounded-2xl transition-all shadow-lg shadow-emerald-600/20 cursor-pointer self-start sm:self-auto border-b-2 border-emerald-800"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Importação em Massa
          </button>
        )}
      </div>

      {/* Sections rearranged: Management and Validation at the top */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Admin/Creation Tools Side - Now at the Top Left */}
        <div className="lg:col-span-5 space-y-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-slate-900 rounded-[2rem] p-6 sm:p-8 text-white shadow-2xl"
          >
            {/* Collapsible Header Button for Creating / Editing DDS */}
            <button
              type="button"
              onClick={() => setIsCreateFormExpanded(prev => !prev)}
              className={`w-full flex items-center justify-between p-4 bg-slate-800/90 hover:bg-slate-800 rounded-2xl border border-slate-700/60 transition-all text-left group ${
                isCreateFormExpanded || editingSession || (activeSession && (isManager || isAdmin)) ? 'mb-2' : 'mb-0'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform">
                  {editingSession ? <Edit2 className="w-5 h-5 text-white" /> : <Plus className="w-5 h-5 text-white" />}
                </div>
                <div>
                  <h3 className="text-base font-extrabold tracking-tight text-white group-hover:text-emerald-300 transition-colors">
                    {editingSession ? 'EDITAR DDS' : 'CRIE NOVO DDS'}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-medium">
                    {editingSession ? 'Clique para alterar os dados da sessão' : 'Clique aqui para expandir o formulário'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {isCreateFormExpanded || editingSession ? 'Recolher' : 'Expandir'}
                </span>
                {isCreateFormExpanded || editingSession ? (
                  <ChevronUp className="w-5 h-5 text-emerald-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-slate-400 group-hover:text-emerald-400 transition-colors" />
                )}
              </div>
            </button>

            <AnimatePresence>
              {(isCreateFormExpanded || editingSession) && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden pt-2"
                >
                  {editingSession && (
                    <button 
                      onClick={() => {
                        setEditingSession(null);
                        setNewTitle('');
                        setNewDescription('');
                        setNewExecutor(profile?.displayName || '');
                        setIsCreateFormExpanded(false);
                      }}
                      className="mb-6 flex items-center gap-2 text-emerald-300 hover:text-white text-[10px] font-bold uppercase tracking-widest transition-colors"
                    >
                      <X className="w-3 h-3" />
                      Cancelar Edição
                    </button>
                  )}

                  <form onSubmit={handleCreateSession} className="space-y-4 pt-2 pb-2">
                    {/* Top Row: Data, Turno e Letra (Clean automatic status indicators) */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* 1. Data do DDS */}
                      <div className="bg-slate-800/90 p-3 rounded-xl border border-slate-700/60">
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Data
                          </label>
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                            Hoje
                          </span>
                        </div>
                        <p className="text-sm font-bold text-white">
                          {formatDateBR(newDate)}
                        </p>
                      </div>

                      {/* 2. Turno */}
                      <div className="bg-slate-800/90 p-3 rounded-xl border border-slate-700/60">
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Turno
                          </label>
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                            {newShift === 'Turno 1' ? '00h-08h' : newShift === 'Turno 2' ? '08h-16h' : '16h-00h'}
                          </span>
                        </div>
                        <p className="text-sm font-bold text-white">
                          {newShift}
                        </p>
                      </div>

                      {/* 3. Letra da Escala */}
                      <div className="bg-slate-800/90 p-3 rounded-xl border border-slate-700/60">
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Letra
                          </label>
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                            Escalado
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded bg-emerald-500 text-white flex items-center justify-center font-black text-[11px] shadow-sm">
                            {newGroup}
                          </span>
                          <span className="text-sm font-bold text-white">
                            Letra {newGroup}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Executante / Responsável */}
                    <div ref={executorRef} className="relative">
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-emerald-300 mb-1.5">
                        Executante (Responsável)
                      </label>
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          className="w-full bg-slate-800 border border-slate-700/60 rounded-xl pl-4 pr-10 py-2.5 text-white placeholder-slate-500 focus:ring-2 focus:ring-emerald-500 text-sm outline-none"
                          placeholder="Nome do responsável pelo DDS"
                          value={newExecutor || ''}
                          onChange={(e) => {
                            setNewExecutor(e.target.value);
                            setShowExecutorDropdown(true);
                          }}
                          onFocus={() => setShowExecutorDropdown(true)}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowExecutorDropdown(prev => !prev)}
                          className="absolute right-3 text-slate-400 hover:text-white transition-colors"
                        >
                          {showExecutorDropdown ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      </div>

                      {showExecutorDropdown && (
                        <div className="absolute left-0 right-0 mt-1 bg-slate-800 border border-slate-700/60 rounded-xl shadow-2xl z-50 max-h-56 overflow-y-auto">
                          {newExecutor && !registeredUsers.some(user => (user.displayName || '').toLowerCase() === newExecutor.toLowerCase()) && (
                            <div 
                              onClick={() => setShowExecutorDropdown(false)}
                              className="px-4 py-2 border-b border-slate-700/30 font-bold text-xs text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 cursor-pointer flex items-center justify-between transition-colors"
                            >
                              <span className="truncate">Usar: "{newExecutor}"</span>
                              <span className="text-[9px] bg-amber-500 text-slate-900 font-extrabold px-1.5 py-0.5 rounded">Novo</span>
                            </div>
                          )}
                          
                          {registeredUsers.filter(user => {
                            const queryStr = (newExecutor || '').toLowerCase();
                            return (user.displayName || '').toLowerCase().includes(queryStr) || (user.email || '').toLowerCase().includes(queryStr);
                          }).length === 0 ? (
                            <div className="px-4 py-2.5 text-slate-400 text-xs text-center">
                              Nenhum usuário cadastrado encontrado
                            </div>
                          ) : (
                            <div className="divide-y divide-slate-700/20">
                              {registeredUsers.filter(user => {
                                const queryStr = (newExecutor || '').toLowerCase();
                                return (user.displayName || '').toLowerCase().includes(queryStr) || (user.email || '').toLowerCase().includes(queryStr);
                              }).map((user, idx) => {
                                const isSelected = newExecutor === user.displayName;
                                return (
                                  <div
                                    key={`${user.uid}-${idx}`}
                                    onClick={() => {
                                      setNewExecutor(user.displayName);
                                      setShowExecutorDropdown(false);
                                    }}
                                    className={`px-4 py-2.5 text-xs flex flex-col hover:bg-slate-700/50 cursor-pointer transition-colors ${
                                      isSelected ? 'bg-emerald-500/15 border-l-2 border-emerald-500' : ''
                                    }`}
                                  >
                                    <span className="text-white font-bold text-xs">{user.displayName}</span>
                                    <span className="text-slate-400 text-[10px]">{user.registration ? `Matrícula: ${user.registration} • ` : ''}{user.cargoName || user.email}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Título do DDS */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-emerald-300 mb-1.5">
                        Título do DDS (Tema)
                      </label>
                      <input
                        type="text"
                        className="w-full bg-slate-800 border border-slate-700/60 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:ring-2 focus:ring-emerald-500 text-sm outline-none"
                        placeholder={defaultTitleSuggestion}
                        value={newTitle || ''}
                        onChange={(e) => setNewTitle(e.target.value)}
                      />
                    </div>

                    {/* Descrição do DDS (Campo ampliado) */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                          Descrição / Conteúdo do DDS (Opcional)
                        </label>
                        <span className="text-[10px] text-slate-400">
                          {newDescription.length} caracteres
                        </span>
                      </div>
                      <textarea
                        rows={5}
                        className="w-full bg-slate-800 border border-slate-700/60 rounded-xl p-3.5 text-white placeholder-slate-500 focus:ring-2 focus:ring-emerald-500 text-sm outline-none leading-relaxed transition-all"
                        placeholder="Descreva detalhadamente os tópicos de segurança abordados, orientações, riscos da atividade, procedimentos, recomendações ou observações..."
                        value={newDescription || ''}
                        onChange={(e) => setNewDescription(e.target.value)}
                      />
                    </div>

                    {/* Quantidade Prevista de Pessoas no Turno (Abaixo da Descrição) */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-emerald-300 mb-1.5">
                        Total de Pessoas Previstas no Turno
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          min={1}
                          max={200}
                          className="w-32 bg-slate-800 border border-slate-700/60 rounded-xl px-4 py-2.5 text-white font-bold placeholder-slate-500 focus:ring-2 focus:ring-emerald-500 text-sm outline-none"
                          placeholder="Ex: 9"
                          value={newTotalPrevisto}
                          onChange={(e) => setNewTotalPrevisto(Math.max(1, parseInt(e.target.value) || 1))}
                          required
                        />
                        <span className="text-xs text-slate-400 font-medium">
                          colaboradores esperados para assinatura neste DDS
                        </span>
                      </div>
                    </div>

                    <div className="bg-emerald-950/60 p-3 rounded-xl border border-emerald-800/40 flex items-center gap-3">
                       <Key className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                       <p className="text-xs text-emerald-200/90 font-medium">
                         {isManager || isAdmin || isMaster
                          ? "Código de 6 dígitos gerado com validade de 4 horas dentro do turno."
                          : "Após abrir, solicite a validação (senha) ao seu gestor para assinar."}
                       </p>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 text-sm cursor-pointer"
                    >
                      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (editingSession ? <CheckCircle2 className="w-5 h-5" /> : <Plus className="w-5 h-5" />)}
                      {editingSession ? 'Salvar Alterações' : 'Criar e Iniciar DDS'}
                    </button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>

            {activeSession && (isManager || isAdmin) && (() => {
              const sessionExpiryDate = safeToDate(activeSession.expiresAt);
              const isExpired = sessionExpiryDate ? sessionExpiryDate.getTime() < Date.now() : false;

              return (
                <div className="mt-8 pt-8 border-t border-slate-800">
                  <div className="flex justify-between items-center mb-4">
                    <span className={cn(
                      "text-[10px] font-bold uppercase tracking-widest",
                      activeSession.passcode 
                        ? (isExpired ? "text-rose-400" : "text-emerald-300")
                        : "text-amber-300"
                    )}>
                      {activeSession.passcode 
                        ? (isExpired ? 'Senha Expirada' : 'Senha Atual Ativa') 
                        : 'Aguardando Validação'}
                    </span>
                    {activeSession.passcode && !isExpired && (
                      <button 
                        onClick={() => setShowQRFullscreen(true)}
                        className="flex items-center gap-2 text-[10px] text-white hover:text-emerald-300 uppercase font-bold tracking-widest transition-colors cursor-pointer"
                      >
                         <QrCode className="w-4 h-4" />
                         Abrir QR Code
                      </button>
                    )}
                    {activeSession.passcode && (
                      <span className={cn(
                        "flex items-center gap-1 text-[10px] uppercase font-bold tracking-widest",
                        isExpired ? "text-rose-400" : "text-emerald-400"
                      )}>
                         {!isExpired && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>}
                         {isExpired ? 'Expirado' : 'Válido'}
                      </span>
                    )}
                  </div>

                  {activeSession.passcode ? (
                    <div className="bg-white text-slate-900 rounded-2xl p-6 flex flex-col items-center justify-center shadow-xl mb-4 group relative overflow-hidden">
                        <span className={cn(
                          "text-4xl font-black tracking-widest font-mono z-10",
                          isExpired ? "text-slate-400 line-through" : "text-slate-900"
                        )}>{activeSession.passcode}</span>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mt-4 z-10 mb-2">
                          {isExpired ? 'Esta senha expirou e precisa ser reativada' : 'Forneça este código aos colaboradores'}
                        </p>
                        
                      <div className={cn(
                        "z-10 flex items-center gap-2 px-3 py-1.5 rounded-full border",
                        isExpired 
                          ? "text-rose-700 bg-rose-50 border-rose-200" 
                          : "text-emerald-600 bg-emerald-50 border-emerald-100"
                      )}>
                        <Timer className="w-3 h-3" />
                        <span className="text-[10px] font-black uppercase tracking-widest">
                          Expira em: <CountdownTimer expiresAt={sessionExpiryDate} />
                        </span>
                      </div>

                      {(isAdmin || (isManager && activeSession.createdBy === auth.currentUser?.uid)) && isExpired && (
                          <button
                            onClick={() => handleRenewSession(activeSession.id)}
                            className="z-10 mt-4 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg shadow-emerald-100 cursor-pointer"
                          >
                            <Timer className="w-3.5 h-3.5" />
                            Reativar por 4h
                          </button>
                        )}

                        {!isExpired && (
                          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                             <QRCodeSVG value={`${window.location.origin}/#/dds?passcode=${activeSession.passcode}`} size={64} />
                          </div>
                        )}
                    </div>
                  ) : (
                    <div className="bg-slate-800 text-slate-400 rounded-2xl p-8 flex flex-col items-center justify-center border border-dashed border-slate-700 mb-4">
                      <Lock className="w-8 h-8 mb-3 opacity-20" />
                      <p className="text-xs font-bold uppercase tracking-widest text-center">Senha Pendente</p>
                      {isManager ? (
                        <button
                          onClick={async () => {
                            const code = Math.floor(100000 + Math.random() * 900000).toString();
                            const expiresAt = new Date();
                            expiresAt.setHours(expiresAt.getHours() + 4);
                            await updateDoc(doc(db, 'dds_sessions', activeSession.id), {
                              passcode: code,
                              expiresAt: Timestamp.fromDate(expiresAt),
                              updatedAt: serverTimestamp()
                            });
                          }}
                          type="button"
                          className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-500/10 cursor-pointer"
                        >
                          Gerar Senha para Validar
                        </button>
                      ) : (
                        <p className="text-[10px] text-slate-500 mt-2 text-center leading-relaxed">
                          Aguardando um gestor validar esta sessão e gerar a senha de participação.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </motion.div>
        </div>

        {/* User Participation Side - Validation at the Top Right */}
        <div className="lg:col-span-7 space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 tracking-tight">Validar Presença</h3>
                <p className="text-sm text-slate-400">Insira a senha fornecida pelo administrador</p>
              </div>
            </div>

            {activeSession ? (
              <form onSubmit={handleSign} className="space-y-6">
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 flex items-start justify-between gap-4">
                   <div>
                     <div className="flex items-center gap-2 mb-2">
                       <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded uppercase">
                         {activeSession.shift}
                       </span>
                       <span className="px-2 py-0.5 bg-slate-200 text-slate-700 text-[10px] font-bold rounded uppercase">
                         Letra {activeSession.group}
                       </span>
                     </div>
                     <h4 className="font-bold text-slate-900 mb-1">{formatSessionDisplayTitle(activeSession)}</h4>
                     <p className="text-sm text-slate-500 mb-2">{activeSession.description || 'Nenhuma descrição fornecida.'}</p>
                     <p className="text-xs text-slate-400">Executante: <span className="font-bold text-slate-600">{activeSession.executor}</span></p>

                     {/* Shift Schedule Notice */}
                     {(() => {
                       const sessionDate = safeToDate(activeSession.createdAt || activeSession.date) || new Date();
                       const targetShift = activeSession.shift as Shift;
                       const inShift = isWithinShiftWindow(sessionDate, targetShift, new Date());
                       const { start, end } = getShiftTimeRange(sessionDate, targetShift);
                       const startStr = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
                       const endStr = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;

                       return (
                         <div className={cn(
                           "mt-3 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border",
                           inShift 
                             ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                             : "bg-amber-50 text-amber-800 border-amber-200"
                         )}>
                           <Clock className={cn("w-4 h-4 flex-shrink-0", inShift ? "text-emerald-600" : "text-amber-600")} />
                           <span>
                             Janela do {targetShift}: <strong>{startStr} às {endStr}</strong>
                             {inShift ? " (Turno em andamento)" : " (Fora do horário do turno)"}
                           </span>
                         </div>
                       );
                     })()}
                   </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveSession(null);
                          setPasscode('');
                        }}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-all text-xs font-semibold flex items-center gap-1"
                        title="Desmarcar sessão atual"
                      >
                        <X className="w-4 h-4" />
                        <span className="text-[10px] hidden sm:inline">Desmarcar</span>
                      </button>
                      {(isAdmin || isMaster) && (
                        <button
                          type="button"
                          onClick={() => handleDeleteSession(activeSession.id)}
                          className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all border border-transparent hover:border-rose-100 flex-shrink-0 cursor-pointer"
                          title="Excluir Sessão de DDS e Assinaturas"
                        >
                          <Trash2 className="w-5 h-5 text-rose-500" />
                        </button>
                      )}
                    </div>
                 </div>

                 {!activeSession.passcode ? (
                   <div className="bg-amber-50 p-6 rounded-2xl border border-amber-100 flex flex-col items-center gap-3 text-center">
                     <Clock className="w-8 h-8 text-amber-500 animate-pulse" />
                     <div>
                       <h4 className="font-bold text-amber-900">Aguardando Validação</h4>
                       <p className="text-xs text-amber-700 mt-1">Este DDS foi criado mas a senha ainda não foi gerada por um gestor.</p>
                     </div>
                   </div>
                 ) : (
                   <>
                     <div className="space-y-2">
                       <div className="flex items-center justify-between ml-1 mb-1">
                         <label className="text-sm font-bold text-slate-700 uppercase tracking-wider text-[10px]">Senha de 6 Dígitos</label>
                         <button 
                           type="button"
                           onClick={() => setIsScanning(!isScanning)}
                           className={cn(
                             "flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer",
                             isScanning ? "bg-rose-500 text-white" : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                           )}
                         >
                           <QrCode className="w-3 h-3" />
                           {isScanning ? 'Cancelar' : 'Escanear QR'}
                         </button>
                       </div>

                       {isScanning && (
                         <div className="mb-4 overflow-hidden rounded-2xl border-2 border-emerald-500 bg-black min-h-[250px]">
                           <div id="reader" className="w-full h-full"></div>
                         </div>
                       )}

                       <input
                         type="text"
                         maxLength={6}
                         className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500 transition-all font-mono text-2xl tracking-[1em] text-center"
                         placeholder="000000"
                         value={passcode}
                         onChange={(e) => setPasscode(e.target.value)}
                         required
                       />
                       <div className="flex flex-col items-center gap-2 mt-2">
                         <div className="flex items-center justify-center gap-2 text-xs font-bold text-emerald-600 uppercase tracking-widest">
                           <Timer className="w-3.5 h-3.5" />
                           Expira em: <CountdownTimer expiresAt={safeToDate(activeSession.expiresAt)} />
                         </div>
                         {isManager && ((safeToDate(activeSession.expiresAt)?.getTime() || 0) < Date.now()) && (
                           <button
                             type="button"
                             onClick={() => handleRenewSession(activeSession.id)}
                             className="mt-2 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-emerald-100 transition-all cursor-pointer"
                           >
                             Reativar Senha (Manager)
                           </button>
                         )}
                       </div>
                     </div>

                    {error && (
                      <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm font-medium flex items-center gap-2 border border-red-100">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        {error}
                      </div>
                    )}

                    {success && (
                      <div className="bg-emerald-50 text-emerald-600 p-4 rounded-xl text-sm font-bold flex items-center gap-2 border border-emerald-100">
                        <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                        {successMessage || 'Operação realizada com sucesso!'}
                      </div>
                    )}

                    {hasSigned ? (
                       <div className="w-full bg-emerald-500 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 shadow-xl shadow-emerald-100 border-b-4 border-emerald-700">
                          <CheckCircle2 className="w-6 h-6" />
                          DDS ASSINADO COM SUCESSO
                       </div>
                    ) : (
                      <button
                        type="submit"
                        disabled={loading || passcode.length < 6}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-2xl transition-all shadow-xl shadow-emerald-100 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
                      >
                        {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <UserCheck className="w-6 h-6" />}
                        Assinar DDS
                      </button>
                    )}
                  </>
                )}
              </form>
            ) : (
              <div className="text-center py-12 px-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <h4 className="text-slate-900 font-bold">Nenhum DDS Ativo</h4>
                <p className="text-slate-500 text-sm mt-1">Aguarde o administrador iniciar uma sessão para o período.</p>
              </div>
            )}
          </motion.div>

          {/* Monthly Metric Chart moved here, below Validation */}
          {isManager && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                 <div>
                   <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Acompanhamento de Realização e KPIs</h3>
                   <p className="text-[15px] font-extrabold text-slate-800">Métrica Mensal (DDS vs Assinaturas)</p>
                 </div>
                 
                 <div className="flex bg-slate-100 p-1 rounded-xl gap-1 self-start sm:self-auto">
                   <button
                     onClick={() => setChartMode('presence')}
                     className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                       chartMode === 'presence'
                         ? 'bg-white text-slate-900 shadow-sm'
                         : 'text-slate-500 hover:text-slate-800'
                     }`}
                   >
                     Presenças (Absoluto)
                   </button>
                   <button
                     onClick={() => setChartMode('idds')}
                     className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                       chartMode === 'idds'
                         ? 'bg-emerald-600 text-white shadow-sm'
                         : 'text-slate-500 hover:text-slate-800'
                     }`}
                   >
                     IDDS (Índice de Desenvolvimento)
                   </button>
                 </div>
              </div>

              {chartMode === 'presence' && (
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-600"></div>
                    <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Sessões DDS</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-300"></div>
                    <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Assinaturas/Presenças</span>
                  </div>
                </div>
              )}

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={256}>
                  {chartMode === 'presence' ? (
                    <BarChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                      />
                      <YAxis 
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                      />
                      <RechartsTooltip 
                        cursor={{ fill: '#f8fafc' }}
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)' }}
                        itemStyle={{ fontWeight: 800, fontSize: '10px', textTransform: 'uppercase' }}
                      />
                      <Bar dataKey="sessions" fill="#059669" radius={[4, 4, 0, 0]} barSize={12} name="Sessões" />
                      <Bar dataKey="signatures" fill="#34d399" radius={[4, 4, 0, 0]} barSize={12} name="Presenças" opacity={0.6} />
                    </BarChart>
                  ) : (
                    <AreaChart data={monthlyData}>
                      <defs>
                        <linearGradient id="colorIdds" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#059669" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="#059669" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                      />
                      <YAxis 
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                        domain={[0, 100]}
                        tickFormatter={(v) => `${v}%`}
                      />
                      <RechartsTooltip 
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)' }}
                        itemStyle={{ fontWeight: 800, fontSize: '10px', textTransform: 'uppercase' }}
                        formatter={(value: any) => [`${value}%`, 'IDDS Diário']}
                      />
                      <ReferenceLine y={75} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'Meta: 75%', fill: '#d97706', fontSize: 10, position: 'top', fontWeight: 800 }} />
                      <ReferenceLine y={100} stroke="#059669" strokeDasharray="4 4" label={{ value: 'Alvo: 100%', fill: '#047857', fontSize: 10, position: 'bottom', fontWeight: 800 }} />
                      <Area type="monotone" dataKey="idds" stroke="#059669" strokeWidth={3} fillOpacity={1} fill="url(#colorIdds)" name="IDDS" />
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              </div>
            </motion.div>
          )}

          {/* Replicated Chart: IDDS Filtering by Turn Letters */}
          {isManager && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm mt-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                 <div>
                   <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Filtro Setorizado (IDDS)</h3>
                   <p className="text-[15px] font-extrabold text-slate-800">IDDS por Letra de Turno (Grupo)</p>
                 </div>
                 
                 <div className="flex bg-slate-100 p-1 rounded-xl gap-1 self-start sm:self-auto flex-wrap">
                   {['all', 'A', 'B', 'C', 'D', 'E'].map((letter, lIdx) => (
                     <button
                       key={`dds-chart-group-${letter}-${lIdx}`}
                       onClick={() => setChartGroupFilter(letter)}
                       className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                         chartGroupFilter === letter
                           ? 'bg-emerald-600 text-white shadow-sm font-black'
                           : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                       }`}
                     >
                       {letter === 'all' ? 'Todas' : `Letra ${letter}`}
                     </button>
                   ))}
                 </div>
              </div>

              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-600"></div>
                  <span className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wider">
                    Análise do Grupo: {chartGroupFilter === 'all' ? 'Todas as Letras' : `Letra ${chartGroupFilter}`}
                  </span>
                </div>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={256}>
                  <AreaChart data={filteredMonthlyData}>
                    <defs>
                      <linearGradient id="colorFilteredIdds" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#059669" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="#059669" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                    />
                    <YAxis 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                      domain={[0, 100]}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <RechartsTooltip 
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)' }}
                      itemStyle={{ fontWeight: 800, fontSize: '10px', textTransform: 'uppercase' }}
                      formatter={(value: any) => [`${value}%`, `IDDS - ${chartGroupFilter === 'all' ? 'Geral' : `Letra ${chartGroupFilter}`}`]}
                    />
                    <ReferenceLine y={75} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'Meta: 75%', fill: '#d97706', fontSize: 10, position: 'top', fontWeight: 800 }} />
                    <ReferenceLine y={100} stroke="#059669" strokeDasharray="4 4" label={{ value: 'Alvo: 100%', fill: '#047857', fontSize: 10, position: 'bottom', fontWeight: 800 }} />
                    <Area type="monotone" dataKey="idds" stroke="#059669" strokeWidth={3} fillOpacity={1} fill="url(#colorFilteredIdds)" name="IDDS" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          )}

          {/* Today's Shifts Matrix Status */}
          {isManager && (
            <div className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm">
              <div className="flex flex-col md:flex-row justify-between items-center mb-8 text-center md:text-left gap-4">
                <div>
                  <h3 className="font-bold text-xl text-slate-900 tracking-tight">Status de Realização DDS (Hoje)</h3>
                  <p className="text-sm text-slate-400">Acompanhamento dos turnos escalados para hoje</p>
                </div>
                <div className="flex gap-4 items-center">
                  <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-emerald-600 ring-2 ring-emerald-200"></div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Turno Atual</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Realizado</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-amber-400"></div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Pendente</span>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[1, 2, 3].map((shiftNum, sIdx) => {
                  const shiftName = `Turno ${shiftNum}` as Shift;
                  const group = getGroupForShift(new Date(), shiftName);
                  // Find session specifically for TODAY, this shift and this letter
                  const sessionForShift = todaySessions.find((s: any) => s.shift === shiftName && s.group === group);
                  const done = !!sessionForShift;
                  const isCurrent = getCurrentShift() === shiftName;
                  
                  return (
                    <motion.div 
                      key={`today-shift-matrix-${shiftNum}-${sIdx}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "relative p-6 rounded-[2rem] border transition-all flex flex-col items-center text-center gap-4",
                        isCurrent ? "ring-2 ring-emerald-500 ring-offset-4 bg-white shadow-xl" : "bg-slate-50/50 border-slate-100",
                        done ? "border-emerald-200" : isCurrent ? "border-emerald-200" : "border-slate-100"
                      )}
                      onClick={() => sessionForShift && setExpandedSessionId(expandedSessionId === sessionForShift.id ? null : sessionForShift.id)}
                    >
                      {isCurrent && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-lg">
                          DDS Agora
                        </div>
                      )}

                      <div className="flex flex-col items-center">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">{shiftName}</p>
                        <div className={cn(
                          "w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-black mb-2",
                          done ? "bg-emerald-500 text-white shadow-lg shadow-emerald-100" : "bg-white text-slate-900 border border-slate-100"
                        )}>
                          {group}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <p className={cn(
                          "text-sm font-black tracking-tight",
                          done ? "text-emerald-700" : "text-slate-600"
                        )}>
                          Letra {group}
                        </p>
                        <div className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest",
                          done 
                            ? "bg-emerald-100 text-emerald-700" 
                            : "bg-amber-100 text-amber-700"
                        )}>
                          {done ? (
                            <><ShieldCheck className="w-3 h-3" /> Realizado</>
                          ) : (
                            <><AlertTriangle className="w-3 h-3" /> Pendente</>
                          )}
                        </div>
                      </div>

                      {done ? (
                        <div className="mt-2 text-[9px] text-emerald-500 font-bold">
                          Concluído com sucesso
                        </div>
                      ) : isCurrent ? (
                        <div className="mt-2 text-[9px] text-emerald-600 font-black animate-pulse uppercase">
                          Aguardando Aplicação...
                        </div>
                      ) : (
                        <div className="mt-2 text-[9px] text-slate-400 font-medium">
                          Não iniciado
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>

              <div className="mt-8 p-6 bg-slate-900 rounded-[2rem] flex flex-col md:flex-row items-center justify-between gap-6 text-white overflow-hidden relative">
                <div className="absolute top-0 right-0 p-8 opacity-5">
                  <Target className="w-24 h-24" />
                </div>
                
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center text-3xl font-black text-emerald-400">
                    {Math.round((todaySessions.filter((s: any) => {
                      const today = new Date();
                      const sched = getTodayGroups(today);
                      return Object.entries(sched).some(([shift, group]) => s.shift === shift && s.group === group);
                    }).length / 3) * 100)}%
                  </div>
                  <div>
                    <h4 className="text-lg font-black tracking-tight leading-none mb-1">Aderência à Escala</h4>
                    <p className="text-xs text-slate-400">Percentual de DDS realizados conforme planejado para hoje.</p>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <div className="bg-white/5 border border-white/10 px-4 py-2 rounded-xl text-center">
                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Hoje</p>
                    <p className="text-xl font-black">3</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 px-4 py-2 rounded-xl text-center">
                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Concluídos</p>
                    <p className="text-xl font-black text-emerald-400">
                      {todaySessions.filter((s: any) => {
                        const today = new Date();
                        const sched = getTodayGroups(today);
                        return Object.entries(sched).some(([shift, group]) => s.shift === shift && s.group === group);
                      }).length}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Unified DDS History & Filtering for All Roles */}
          <div className="bg-white rounded-[2rem] border border-slate-200 p-6 md:p-8 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <History className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                      Histórico e Filtros de DDS
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">
                        {filteredSessions.length} {filteredSessions.length === 1 ? 'sessão' : 'sessões'}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      {isAdmin || isMaster 
                        ? 'Consulte, edite ou exclua sessões de DDS e gerencie colaboradores assinantes.' 
                        : 'Consulte as sessões e presenças por data, turno e letra.'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
                {(isAdmin || isMaster) && (
                  <button
                    onClick={() => setShowWipeAllModal(true)}
                    className="flex items-center gap-1.5 text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-xl border border-rose-200 transition-all"
                    title="Excluir todas as sessões e assinaturas de DDS com segurança"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Zerar Todos os DDS
                  </button>
                )}

                {(filterDate !== 'all' || filterShift !== 'all' || selectedLetter !== 'all' || participantSearch !== '') && (
                  <button
                    onClick={() => {
                      setFilterDate('all');
                      setFilterShift('all');
                      setSelectedLetter('all');
                      setParticipantSearch('');
                    }}
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-emerald-600 px-3 py-1.5 rounded-xl border border-slate-200 hover:border-emerald-300 transition-all"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Limpar Filtros
                  </button>
                )}
              </div>
            </div>

            {/* Filter Bar */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 mb-6 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">Data:</span>
                <button
                  type="button"
                  onClick={() => setFilterDate(new Date().toISOString().split('T')[0])}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-bold transition-all",
                    filterDate === new Date().toISOString().split('T')[0]
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                  )}
                >
                  Hoje
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const yesterday = new Date();
                    yesterday.setDate(yesterday.getDate() - 1);
                    setFilterDate(yesterday.toISOString().split('T')[0]);
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-bold transition-all",
                    filterDate !== 'all' && filterDate === (() => {
                      const y = new Date();
                      y.setDate(y.getDate() - 1);
                      return y.toISOString().split('T')[0];
                    })()
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                  )}
                >
                  Ontem
                </button>
                <button
                  type="button"
                  onClick={() => setFilterDate('all')}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-bold transition-all",
                    filterDate === 'all'
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                  )}
                >
                  Todas as Datas
                </button>

                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 ml-auto">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="date"
                    value={filterDate === 'all' ? '' : filterDate}
                    onChange={(e) => setFilterDate(e.target.value || 'all')}
                    className="bg-transparent text-xs font-medium text-slate-700 outline-none cursor-pointer"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200/60">
                {/* Shift Selector */}
                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
                  <Clock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <select
                    className="bg-transparent text-xs font-semibold text-slate-700 outline-none w-full cursor-pointer"
                    value={filterShift}
                    onChange={(e) => setFilterShift(e.target.value)}
                  >
                    <option value="all">Todos os Turnos</option>
                    <option value="Turno 1">Turno 1 (00h-08h)</option>
                    <option value="Turno 2">Turno 2 (08h-16h)</option>
                    <option value="Turno 3">Turno 3 (16h-00h)</option>
                  </select>
                </div>

                {/* Letter Selector */}
                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
                  <Filter className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <select
                    className="bg-transparent text-xs font-semibold text-slate-700 outline-none w-full cursor-pointer"
                    value={selectedLetter}
                    onChange={(e) => setSelectedLetter(e.target.value)}
                  >
                    <option value="all">Todas as Letras</option>
                    <option value="A">Letra A</option>
                    <option value="B">Letra B</option>
                    <option value="C">Letra C</option>
                    <option value="D">Letra D</option>
                    <option value="E">Letra E</option>
                  </select>
                </div>

                {/* Search Input */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar tema, facilitador ou colaborador..."
                    className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 placeholder-slate-400 outline-none focus:ring-2 focus:ring-emerald-500"
                    value={participantSearch}
                    onChange={(e) => setParticipantSearch(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Session Cards List Grouped By Date and Shift */}
            <div className="space-y-6 max-h-[750px] overflow-y-auto pr-1 custom-scrollbar">
              {groupedSessionsByDate.length > 0 ? (
                groupedSessionsByDate.map((dateGroup, gIdx) => (
                  <div key={`date-group-${dateGroup.dateKey}-${gIdx}`} className="space-y-3">
                    {/* Date Header Separator */}
                    <div className="flex items-center justify-between sticky top-0 z-10 bg-white/95 backdrop-blur-sm py-2 px-3 rounded-2xl border border-slate-200/80 shadow-2xs">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-emerald-600" />
                        <span className="text-xs font-black text-slate-800 tracking-tight">
                          {dateGroup.formattedDate}
                        </span>
                        {dateGroup.isToday && (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-black rounded-full uppercase">
                            Hoje
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-lg">
                        {dateGroup.sessions.length} {dateGroup.sessions.length === 1 ? 'Turno' : 'Turnos'}
                      </span>
                    </div>

                    {/* Sessions inside this Date */}
                    <div className="space-y-3 pl-1 sm:pl-2">
                      {dateGroup.sessions.map((session, idx) => {
                        const isExpanded = expandedSessionId === session.id;
                        const sessionSigs = signaturesBySession[session.id] || (expandedSessionId === session.id ? sessionSignatures : []);
                        const totalCount = sessionSigs.length || signatureCountBySession[session.id] || 0;
                        const totalPrevisto = session.totalPrevisto || 9;

                        return (
                          <div 
                            key={`${session.id}-${idx}`} 
                            className={cn(
                              "flex flex-col border rounded-3xl p-5 transition-all bg-white",
                              isExpanded ? "border-emerald-300 shadow-md ring-1 ring-emerald-100" : "border-slate-200 hover:border-emerald-200 shadow-sm"
                            )}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                              <div className="flex-1 text-left group">
                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                  <span className="px-2.5 py-0.5 bg-emerald-600 text-white text-[11px] font-extrabold rounded-lg uppercase tracking-wider shadow-2xs">
                                    {session.shift}
                                  </span>
                                  <span className="px-2.5 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-black rounded-lg uppercase">
                                    Letra {session.group}
                                  </span>
                                  <span className="text-xs text-slate-500 font-semibold flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-slate-400" />
                                    DDS de {formatDateDDMMAAAA(session.createdAt || session.date)}
                                  </span>
                                </div>
                                
                                <h4 className="font-extrabold text-slate-900 text-base sm:text-lg group-hover:text-emerald-600 transition-colors">
                                  {formatSessionDisplayTitle(session)}
                                </h4>
                                {session.description && (
                                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                                    {session.description}
                                  </p>
                                )}
                                
                                {/* Session Creator and Presenters Details */}
                                <div className="flex flex-wrap items-center gap-3 mt-3 pt-2 border-t border-slate-100/80">
                                  <div className="text-xs text-slate-600 font-medium flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200/60">
                                    <span className="text-slate-400 font-semibold">Criado por:</span>
                                    <strong className="text-slate-800 font-bold">
                                      {session.createdByName || session.creatorName || session.executor || 'Gestor/Admin'}
                                    </strong>
                                  </div>
                                  {session.executor && session.executor !== (session.createdByName || session.creatorName) && (
                                    <div className="text-xs text-slate-600 font-medium flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200/60">
                                      <span className="text-slate-400 font-semibold">Executante:</span>
                                      <strong className="text-slate-800 font-bold">{session.executor}</strong>
                                    </div>
                                  )}
                                  <span className={cn(
                                    "text-xs px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5 border",
                                    totalCount >= totalPrevisto 
                                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                      : totalCount > 0
                                        ? "bg-amber-50 text-amber-800 border-amber-200"
                                        : "bg-slate-50 text-slate-600 border-slate-200"
                                  )}>
                                    <Users className="w-3.5 h-3.5" />
                                    {totalCount} / {totalPrevisto} assinaturas
                                  </span>
                                  {activeSession?.id === session.id && (
                                    <span className="text-[10px] bg-slate-900 text-white font-bold px-2.5 py-1 rounded-lg">
                                      Sessão Ativa no Formulário
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 self-end sm:self-start flex-shrink-0">
                                {/* Quick Select / Sign this DDS */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveSession(session);
                                    if (session.passcode) {
                                      setPasscode(session.passcode);
                                    }
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                  }}
                                  className={cn(
                                    "px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1 cursor-pointer",
                                    activeSession?.id === session.id
                                      ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                                      : "bg-white text-slate-700 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50"
                                  )}
                                  title="Selecionar e Assinar este DDS"
                                >
                                  <UserCheck className="w-3.5 h-3.5" />
                                  {activeSession?.id === session.id ? 'Selecionado' : 'Assinar'}
                                </button>

                                {/* Manager / Admin / Master Edit Action */}
                                {(isManager || isAdmin || isMaster) && (
                                  <button
                                    type="button"
                                    onClick={() => handleEditSession(session)}
                                    className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all border border-transparent hover:border-emerald-200 cursor-pointer"
                                    title="Editar Sessão de DDS (Gestor/Admin/Master)"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                )}

                                {/* Manager / Admin / Master Add Participant Action */}
                                {(isManager || isAdmin || isMaster) && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenAddSignature(session)}
                                    className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all border border-transparent hover:border-emerald-200 cursor-pointer"
                                    title="Adicionar Colaborador Manualmente (Gestor/Admin/Master)"
                                  >
                                    <UserPlus className="w-4 h-4" />
                                  </button>
                                )}

                                {/* Manager / Admin / Master Reset Signatures Action */}
                                {(isManager || isAdmin || isMaster) && (
                                  <button
                                    type="button"
                                    onClick={() => handleResetSessionSignatures(session, sessionSigs.length)}
                                    className="p-2 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-all border border-transparent hover:border-amber-200 cursor-pointer"
                                    title="Resetar / Limpar lista de assinaturas deste DDS"
                                  >
                                    <RotateCcw className="w-4 h-4" />
                                  </button>
                                )}

                                {/* Manager / Admin / Master Delete Action */}
                                {(isManager || isAdmin || isMaster) && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteSession(session.id)}
                                    className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all border border-transparent hover:border-rose-200 cursor-pointer"
                                    title="Excluir Sessão e todas as assinaturas (Gestor/Admin/Master)"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}

                                {/* Expand/Collapse Toggle */}
                                <button
                                  type="button"
                                  onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                                  className={cn(
                                    "p-2 rounded-xl transition-all border cursor-pointer",
                                    isExpanded 
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                                      : "text-slate-400 hover:text-slate-900 border-slate-200 hover:border-slate-300 bg-white"
                                  )}
                                  title={isExpanded ? "Ocultar lista de assinantes" : "Expandir detalhes da lista de assinantes"}
                                >
                                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </button>
                              </div>
                            </div>

                            {/* Vertical Subscribers List inside corresponding DDS */}
                            <div className="border-t border-slate-100 mt-4 pt-4">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                    <Users className="w-3.5 h-3.5 text-emerald-600" />
                                    Colaboradores que Assinaram este DDS ({sessionSigs.length})
                                  </span>
                                  <span className={cn(
                                    "px-2 py-0.5 rounded-full text-[10px] font-bold",
                                    sessionSigs.length >= totalPrevisto
                                      ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                      : sessionSigs.length > 0
                                        ? "bg-amber-100 text-amber-800 border border-amber-200"
                                        : "bg-slate-100 text-slate-600"
                                  )}>
                                    {sessionSigs.length >= totalPrevisto ? 'Meta Atingida' : sessionSigs.length > 0 ? 'Em andamento' : 'Pendente de assinaturas'}
                                  </span>
                                </div>
                                
                                <div className="flex items-center gap-2">
                                  {(isManager || isAdmin || isMaster) && sessionSigs.length > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => handleResetSessionSignatures(session, sessionSigs.length)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-all cursor-pointer shadow-2xs"
                                      title="Limpar e resetar todos os assinantes desta lista"
                                    >
                                      <RotateCcw className="w-3 h-3 text-amber-600" />
                                      Resetar Lista
                                    </button>
                                  )}
                                  {session.passcode && (
                                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1 font-mono">
                                      <Key className="w-3 h-3 text-emerald-600" />
                                      Senha: {session.passcode}
                                    </span>
                                  )}
                                </div>
                              </div>
                              
                              {/* List of subscribers stacked vertically one below the other */}
                              <div className="space-y-2">
                                {sessionSigs.length > 0 ? (
                                  sessionSigs.map((sig: any, sIdx: number) => (
                                    <div 
                                      key={`${sig.id || sIdx}-${sIdx}`} 
                                      className="flex items-center justify-between p-3 bg-slate-50 hover:bg-emerald-50/30 rounded-2xl border border-slate-200/70 hover:border-emerald-200 transition-all"
                                    >
                                      <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-7 h-7 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-700 font-black text-xs flex-shrink-0 shadow-2xs">
                                          {sIdx + 1}
                                        </div>
                                        <div className="min-w-0">
                                          <p className="text-sm font-bold text-slate-800 flex items-center gap-2 truncate">
                                            <span className="truncate">{sig.userName}</span>
                                            {sig.registration && (
                                              <span className="text-[10px] font-mono text-slate-500 font-semibold bg-slate-200/70 px-1.5 py-0.5 rounded flex-shrink-0">
                                                Matrícula: {sig.registration}
                                              </span>
                                            )}
                                          </p>
                                          <p className="text-[10px] text-slate-400 font-medium flex items-center gap-1.5">
                                            <span>Turno: <strong>{sig.shift || session.shift}</strong></span>
                                            <span>•</span>
                                            <span>Letra: <strong>{sig.group || session.group}</strong></span>
                                            <span>•</span>
                                            <span>Assinado às {safeToDate(sig.timestamp)?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) || 'Horário registrado'}</span>
                                          </p>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-2 flex-shrink-0">
                                        <div className="flex items-center gap-1 mr-1">
                                          {sig.mood === 'happy' && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                                              <Smile className="w-3.5 h-3.5 text-emerald-500" /> FELIZ
                                            </span>
                                          )}
                                          {sig.mood === 'neutral' && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-blue-50 text-blue-700 border border-blue-200">
                                              <Meh className="w-3.5 h-3.5 text-blue-500" /> NEUTRO
                                            </span>
                                          )}
                                          {sig.mood === 'sad' && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-50 text-amber-700 border border-amber-200">
                                              <Frown className="w-3.5 h-3.5 text-amber-500" /> TRISTE
                                            </span>
                                          )}
                                        </div>

                                        {/* Manager / Admin / Master can reassign / move this signature to another DDS */}
                                        {(isManager || isAdmin || isMaster) && (
                                          <button
                                            type="button"
                                            onClick={() => handleOpenReassignModal(sig, session)}
                                            className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-slate-200 cursor-pointer"
                                            title="Mover assinatura para outro DDS"
                                          >
                                            <ArrowRightLeft className="w-3.5 h-3.5" />
                                          </button>
                                        )}

                                        {/* Manager / Admin / Master can delete this individual signature */}
                                        {(isManager || isAdmin || isMaster) && (
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteSignature(sig.id, sig.userName, session.id)}
                                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-slate-200 cursor-pointer"
                                            title="Excluir assinatura"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <div className="py-4 px-4 bg-slate-50/70 rounded-2xl border border-dashed border-slate-200 text-center">
                                    <p className="text-xs text-slate-500 font-medium">
                                      Nenhum colaborador assinou este DDS ainda.
                                    </p>
                                    {session.passcode && (
                                      <p className="text-[10px] text-slate-400 mt-0.5">
                                        Forneça a senha <strong>{session.passcode}</strong> aos colaboradores deste turno/letra para registrar a presença.
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 px-4 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                  <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-bold text-slate-700 mb-1">Nenhum DDS encontrado com os filtros selecionados.</p>
                  <p className="text-xs text-slate-400">
                    Tente selecionar outra data ou limpe os filtros para visualizar os registros anteriores.
                  </p>
                </div>
              )}
            </div>

            {/* Non-admin user recent personal history */}
            {!isManager && history.length > 0 && (
              <div className="mt-8 pt-6 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Minhas Assinaturas Recentes
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-48 overflow-y-auto pr-1">
                  {history.slice(0, 6).map((item, idx) => (
                    <div key={`${item.id}-${idx}`} className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between">
                      <div>
                        <p className="font-bold text-slate-800 text-xs truncate max-w-[200px]">{item.sessionTitle}</p>
                        <p className="text-[10px] text-slate-400">
                          {formatDateBR(item.timestamp, true)}
                        </p>
                      </div>
                      <div className="w-6 h-6 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center flex-shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

        {/* Wipe All DDS Confirmation Modal (Admin/Master) */}
        <AnimatePresence>
          {showWipeAllModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-[2rem] p-8 max-w-md w-full shadow-2xl border border-slate-100"
              >
                <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Trash2 className="w-8 h-8 text-rose-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 text-center mb-2">Apagar TODOS os DDS e Assinaturas?</h3>
                <p className="text-slate-600 text-center text-sm mb-4">
                  Esta ação irá apagar <strong>todas as sessões de DDS</strong> e <strong>todas as assinaturas vinculadas</strong> de forma permanente no banco de dados.
                </p>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 mb-6 text-xs text-amber-800 leading-relaxed">
                  <p className="font-bold flex items-center gap-1.5 mb-1">
                    <ShieldCheck className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    Proteção de Limites do Firebase:
                  </p>
                  A exclusão é executada em lotes fracionados seguros (máx. 450 operações por requisição), garantindo que a cota do Firebase Firestore não seja ultrapassada nem ocorram erros de limite.
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    disabled={wipeInProgress}
                    onClick={() => setShowWipeAllModal(false)}
                    className="py-3 px-4 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    disabled={wipeInProgress}
                    onClick={confirmWipeAllDDSData}
                    className="py-3 px-4 rounded-xl bg-rose-600 text-white font-bold hover:bg-rose-700 transition-colors shadow-lg shadow-rose-100 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {wipeInProgress ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Apagando...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        Sim, Apagar Tudo
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Delete Session Confirmation Modal (Manager/Admin/Master) */}
        <AnimatePresence>
          {sessionToDelete && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-[2rem] p-8 max-w-sm w-full shadow-2xl border border-slate-100"
              >
                <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <AlertTriangle className="w-8 h-8 text-rose-500" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 text-center mb-2">Excluir Sessão de DDS?</h3>
                <p className="text-slate-500 text-center text-sm mb-8">
                  Esta ação é irreversível. O DDS e todas as assinaturas vinculadas a ele serão excluídos permanentemente.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setSessionToDelete(null)}
                    className="py-3 px-4 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmDeleteSession}
                    className="py-3 px-4 rounded-xl bg-rose-500 text-white font-bold hover:bg-rose-600 transition-colors shadow-lg shadow-rose-100"
                  >
                    Excluir
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Reset Session Signatures Confirmation Modal (Manager/Admin/Master) */}
        <AnimatePresence>
          {sessionToReset && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-[2rem] p-8 max-w-md w-full shadow-2xl border border-slate-100"
              >
                <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <RotateCcw className="w-8 h-8 text-amber-500" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 text-center mb-2">Resetar Lista de Assinaturas?</h3>
                <p className="text-slate-600 text-center text-sm mb-2">
                  Deseja limpar todos os <strong>{sessionToReset.count}</strong> registros de presença do DDS:
                </p>
                <p className="text-xs text-emerald-800 bg-emerald-50 p-2.5 rounded-xl text-center font-bold mb-6 border border-emerald-200">
                  {sessionToReset.title}
                </p>
                <p className="text-xs text-slate-400 text-center mb-8">
                  A sessão de DDS permanecerá aberta e ativa para que novas assinaturas possam ser coletadas do zero.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setSessionToReset(null)}
                    className="py-3 px-4 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmResetSessionSignatures}
                    className="py-3 px-4 rounded-xl bg-amber-500 text-white font-bold hover:bg-amber-600 transition-colors shadow-lg shadow-amber-100 flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Resetar Lista
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Delete Signature Confirmation Modal (Admin/Master) */}
        <AnimatePresence>
          {signatureToDelete && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-[2rem] p-8 max-w-sm w-full shadow-2xl border border-slate-100"
              >
                <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <AlertTriangle className="w-8 h-8 text-rose-500" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 text-center mb-2">Excluir Assinatura?</h3>
                <p className="text-slate-500 text-center text-sm mb-8">
                  Deseja realmente remover a presença de <strong>{signatureToDelete.userName}</strong> desta sessão de DDS?
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setSignatureToDelete(null)}
                    className="py-3 px-4 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmDeleteSignature}
                    className="py-3 px-4 rounded-xl bg-rose-500 text-white font-bold hover:bg-rose-600 transition-colors shadow-lg shadow-rose-100"
                  >
                    Remover
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Manual Add Signature Modal (Admin/Master) */}
        <AnimatePresence>
          {showAddSignatureModal && targetSessionForSignature && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-[2rem] p-8 max-w-md w-full shadow-2xl border border-slate-100"
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                      <UserPlus className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">Adicionar Colaborador</h3>
                      <p className="text-xs text-slate-400">Ao DDS: {targetSessionForSignature.title}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowAddSignatureModal(false)}
                    className="p-2 text-slate-400 hover:text-slate-600 rounded-xl"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSaveManualSignature} className="space-y-4">
                  {/* Select from system registered users */}
                  <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-emerald-600" />
                        Colaborador Cadastrado no Sistema
                      </label>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          {registeredUsers.length} cadastrados
                        </span>
                        <button
                          type="button"
                          onClick={handleRefreshRegisteredUsers}
                          disabled={isRefreshingUsers}
                          className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"
                          title="Atualizar lista de colaboradores"
                        >
                          <RotateCcw className={cn("w-3 h-3", isRefreshingUsers && "animate-spin text-emerald-600")} />
                        </button>
                      </div>
                    </div>

                    {/* Quick filter input if there are multiple users */}
                    {registeredUsers.length > 5 && (
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Filtrar por nome, matrícula ou cargo..."
                          value={manualUserSearch}
                          onChange={(e) => setManualUserSearch(e.target.value)}
                          className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                        {manualUserSearch && (
                          <button
                            type="button"
                            onClick={() => setManualUserSearch('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    )}

                    <select
                      value={manualSelectedUid}
                      onChange={(e) => {
                        const uid = e.target.value;
                        setManualSelectedUid(uid);
                        if (uid && uid !== 'custom_manual') {
                          const found = registeredUsers.find(u => u.uid === uid);
                          if (found) {
                            setManualParticipantName(found.displayName);
                            setManualRegistration(found.registration || '');
                          }
                        } else if (uid === 'custom_manual') {
                          setManualSelectedUid('');
                          setManualParticipantName('');
                          setManualRegistration('');
                        }
                      }}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                    >
                      <option value="">-- Selecione na lista de cadastrados --</option>
                      {registeredUsers
                        .filter(u => {
                          if (!manualUserSearch.trim()) return true;
                          const term = manualUserSearch.toLowerCase();
                          return (
                            u.displayName?.toLowerCase().includes(term) ||
                            u.registration?.toLowerCase().includes(term) ||
                            u.cargoName?.toLowerCase().includes(term) ||
                            u.sectorName?.toLowerCase().includes(term)
                          );
                        })
                        .map((u, uIdx) => (
                          <option key={`manual-user-opt-${u.uid || uIdx}-${uIdx}`} value={u.uid}>
                            {u.displayName} {u.registration ? `• Matrícula: ${u.registration}` : ''} {u.cargoName ? `(${u.cargoName})` : ''}
                          </option>
                        ))}
                      <option value="custom_manual">✏️ Digitar outro nome / Não cadastrado...</option>
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Nome do Colaborador
                      </label>
                      {manualSelectedUid && (
                        <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Vinculado ao cadastro
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      list="user-suggestions"
                      placeholder="Digite ou selecione o nome..."
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                      value={manualParticipantName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setManualParticipantName(val);
                        const matched = registeredUsers.find(u => u.displayName.toLowerCase() === val.toLowerCase());
                        if (matched) {
                          setManualSelectedUid(matched.uid);
                          if (matched.registration && !manualRegistration) {
                            setManualRegistration(matched.registration);
                          }
                        } else {
                          setManualSelectedUid('');
                        }
                      }}
                      required
                    />
                    <datalist id="user-suggestions">
                      {registeredUsers.map((u, uIdx) => (
                        <option key={`user-sugg-${u.uid || uIdx}-${uIdx}`} value={u.displayName} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Matrícula / Registro (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 12345"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                      value={manualRegistration}
                      onChange={(e) => setManualRegistration(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Estado de Humor / Disposição
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setManualMood('happy')}
                        className={cn(
                          "p-3 rounded-xl border flex flex-col items-center gap-1 transition-all",
                          manualMood === 'happy'
                            ? "bg-emerald-50 border-emerald-500 text-emerald-700 ring-2 ring-emerald-200"
                            : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                        )}
                      >
                        <Smile className="w-5 h-5 text-emerald-500" />
                        <span className="text-[10px] font-black uppercase">FELIZ</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setManualMood('neutral')}
                        className={cn(
                          "p-3 rounded-xl border flex flex-col items-center gap-1 transition-all",
                          manualMood === 'neutral'
                            ? "bg-blue-50 border-blue-500 text-blue-700 ring-2 ring-blue-200"
                            : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                        )}
                      >
                        <Meh className="w-5 h-5 text-blue-500" />
                        <span className="text-[10px] font-black uppercase">NEUTRO</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setManualMood('sad')}
                        className={cn(
                          "p-3 rounded-xl border flex flex-col items-center gap-1 transition-all",
                          manualMood === 'sad'
                            ? "bg-amber-50 border-amber-500 text-amber-700 ring-2 ring-amber-200"
                            : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                        )}
                      >
                        <Frown className="w-5 h-5 text-amber-500" />
                        <span className="text-[10px] font-black uppercase">TRISTE</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setShowAddSignatureModal(false)}
                      className="py-2.5 px-4 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="py-2.5 px-4 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 flex items-center justify-center gap-2"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar Presença'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Reassign / Unify Signature Modal (Admin/Master) */}
        <AnimatePresence>
          {signatureToReassign && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-[2rem] p-8 max-w-md w-full shadow-2xl border border-slate-100"
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                      <ArrowRightLeft className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">Mover / Unificar Assinatura</h3>
                      <p className="text-xs text-slate-400">Reatribuir presença ao DDS correto</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSignatureToReassign(null)}
                    className="p-2 text-slate-400 hover:text-slate-600 rounded-xl"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1.5">
                    <p className="text-xs text-slate-500 font-medium">
                      Colaborador: <strong className="text-slate-800 text-sm">{signatureToReassign.userName}</strong>
                    </p>
                    <p className="text-xs text-slate-500 font-medium">
                      Sessão atual: <span className="text-rose-600 font-bold">{signatureToReassign.currentSessionTitle}</span>
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Selecione a Sessão de DDS de Destino
                    </label>
                    <select
                      value={targetReassignSessionId}
                      onChange={(e) => setTargetReassignSessionId(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">-- Selecione o DDS de destino --</option>
                      {sessions
                        .filter(s => s.id !== signatureToReassign.currentSessionId)
                        .map((s, sIdx) => (
                          <option key={`reassign-dest-${s.id || sIdx}-${sIdx}`} value={s.id}>
                            {formatSessionDisplayTitle(s)} (Letra {s.group})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setSignatureToReassign(null)}
                      className="py-2.5 px-4 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={loading || !targetReassignSessionId}
                      onClick={handleConfirmReassign}
                      className="py-2.5 px-4 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar Transferência'}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <DDSBulkImportModal
          isOpen={showBulkImportModal}
          onClose={() => setShowBulkImportModal(false)}
        />
      </div>
    );
  };

export default DDS;
