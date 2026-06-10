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
  onSnapshot
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { MASTER_EMAILS } from '../constants';
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
  Target
} from 'lucide-react';
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
import { cn, safeToDate } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/errorHandler';
import { getCurrentShift, getGroupForShift, getTodayGroups, type Shift } from '../lib/scaleUtils';

const CountdownTimer: React.FC<{ expiresAt: Date }> = ({ expiresAt }) => {
  const [timeLeft, setTimeLeft] = useState<{h: number, m: number, s: number} | null>(null);

  useEffect(() => {
    const calculateTime = () => {
      const now = new Date().getTime();
      const target = expiresAt.getTime();
      const diff = target - now;

      if (diff <= 0) {
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

  if (!timeLeft) return <span className="text-rose-500 font-bold uppercase tracking-widest text-[10px]">Expirado</span>;

  return (
    <span className="font-mono font-black tracking-wider">
      {String(timeLeft.h).padStart(2, '0')}:{String(timeLeft.m).padStart(2, '0')}:{String(timeLeft.s).padStart(2, '0')}
    </span>
  );
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
  
  // Stats and Filters
  const [allSessionsList, setAllSessionsList] = useState<any[]>([]);
  const [allSignaturesList, setAllSignaturesList] = useState<any[]>([]);
  const [chartMode, setChartMode] = useState<'presence' | 'idds'>('presence');
  const [chartGroupFilter, setChartGroupFilter] = useState<string>('all');
  const [globalCompliance, setGlobalCompliance] = useState(0);
  const [totalSignaturesMonth, setTotalSignaturesMonth] = useState(0);
  const [participationRate, setParticipationRate] = useState(0);
  const [selectedLetter, setSelectedLetter] = useState<string>('all');
  const [participantSearch, setParticipantSearch] = useState<string>('');
  
  // Admin form state
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newShift, setNewShift] = useState('Turno 1');
  const [newGroup, setNewGroup] = useState('A');
  const [newExecutor, setNewExecutor] = useState('');
  const [newTotalPrevisto, setNewTotalPrevisto] = useState<number>(9);

  // AI DDS Processor state
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiResult, setAiResult] = useState<any>(null);

  // Mood selector state
  const [showMoodModal, setShowMoodModal] = useState(false);
  const [selectedMood, setSelectedMood] = useState<'happy' | 'neutral' | 'sad' | null>(null);

  useEffect(() => {
    const currentShift = getCurrentShift();
    const expectedGroup = getGroupForShift(new Date(), currentShift);
    setNewShift(currentShift);
    setNewGroup(expectedGroup);
    setNewExecutor(profile?.displayName || '');

    // Fetch all registered users for the dropdown
    const fetchUsers = async () => {
      if (!profile) return;
      try {
        const q = query(collection(db, 'users'), orderBy('displayName', 'asc'));
        const snapshot = await getDocs(q);
        const usersList = snapshot.docs
          .map(doc => ({
            uid: doc.id,
            displayName: doc.data().displayName,
            email: doc.data().email
          }))
          .filter(user => {
            const userEmail = user.email?.toLowerCase().trim() || '';
            return !MASTER_EMAILS.includes(userEmail);
          });
        setRegisteredUsers(usersList);
      } catch (err) {
        console.error("Error fetching users:", err);
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
    // Listen to current active sessions for today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const q = query(
      collection(db, 'dds_sessions'),
      where('createdAt', '>=', Timestamp.fromDate(startOfDay)),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSessions(docs);
      
      // Find the most recent session for the current shift and expected group
      const currentShift = getCurrentShift();
      const expectedGroup = getGroupForShift(new Date(), currentShift);
      const active = docs.find((s: any) => s.shift === currentShift && s.group === expectedGroup);
      setActiveSession(active || null);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'dds_sessions');
      // Fallback if index is missing or other error
      setError("Erro ao carregar sessões. Verifique se o índice do Firestore foi criado.");
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isManager) return;

    // Fetch sessions for the whole month for charts and global compliance
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

    const unsubSignatures = onSnapshot(qSignatures, (snapshot) => {
      const allSigs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
  }, []);

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
      where('userId', '==', auth.currentUser.uid),
      orderBy('timestamp', 'desc'),
      limit(5)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const signatures = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
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
    if (!expandedSessionId || !isManager) {
      setSessionSignatures([]);
      return;
    }

    setSignaturesLoading(true);
    const q = query(
      collection(db, 'dds_signatures'),
      where('sessionId', '==', expandedSessionId),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const sigs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSessionSignatures(sigs);
      setSignaturesLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'dds_signatures');
      setSignaturesLoading(false);
    });

    return () => unsubscribe();
  }, [expandedSessionId, isAdmin]);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle) return;
    
    setLoading(true);
    setError('');

    try {
      if (editingSession) {
        await updateDoc(doc(db, 'dds_sessions', editingSession.id), {
          title: newTitle,
          description: newDescription,
          shift: newShift,
          group: newGroup,
          executor: newExecutor,
          totalPrevisto: newTotalPrevisto,
          updatedAt: serverTimestamp()
        });
        setEditingSession(null);
      } else {
        // Duplicate check: Check if a session already exists for this shift and group today
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        
        const q = query(
          collection(db, 'dds_sessions'),
          where('createdAt', '>=', Timestamp.fromDate(startOfDay)),
          where('shift', '==', newShift),
          where('group', '==', newGroup)
        );
        
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          setError(`Já existe um DDS ativo para o ${newShift} - Letra ${newGroup} hoje.`);
          setLoading(false);
          return;
        }

        // Generate 6 digit passcode ONLY for managers
        const generatedPasscode = isManager ? Math.floor(100000 + Math.random() * 900000).toString() : '';
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 4);

        await addDoc(collection(db, 'dds_sessions'), {
          title: newTitle,
          description: newDescription,
          shift: newShift,
          group: newGroup,
          executor: newExecutor,
          totalPrevisto: newTotalPrevisto,
          passcode: generatedPasscode,
          expiresAt: Timestamp.fromDate(expiresAt),
          createdAt: serverTimestamp(),
          createdBy: auth.currentUser?.uid
        });
      }

      setNewTitle('');
      setNewDescription('');
      setNewExecutor(profile?.displayName || '');
      setNewTotalPrevisto(9);
      setSuccessMessage(editingSession ? 'Sessão atualizada com sucesso!' : 'Novo DDS criado com sucesso!');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes('Insufficient permissions') || err.message?.includes('permission-denied')) {
        setError('Você não tem permissão para criar um DDS. Verifique se seu perfil foi aprovado pelo administrador.');
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
    setEditingSession(session);
    setNewTitle(session.title);
    setNewDescription(session.description || '');
    setNewShift(session.shift);
    setNewGroup(session.group);
    setNewExecutor(session.executor);
    setNewTotalPrevisto(session.totalPrevisto || 9);
    
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!isAdmin && !isMaster) {
      setError('Apenas administradores ou master podem excluir sessões.');
      return;
    }
    setSessionToDelete(sessionId);
  };

  const confirmDeleteSession = async () => {
    if (!sessionToDelete) return;
    
    setLoading(true);
    try {
      // Check if there are any signatures first
      const q = query(collection(db, 'dds_signatures'), where('sessionId', '==', sessionToDelete));
      const sigSnapshot = await getDocs(q);
      
      if (!sigSnapshot.empty && !isMaster) {
        setError('Não é possível excluir um DDS que já possui assinaturas. De acordo com as normas de segurança, registros com participações são permanentes.');
        setLoading(false);
        setSessionToDelete(null);
        return;
      }

      // If isMaster and there are signatures, delete them first to avoid orphaned records
      if (isMaster && !sigSnapshot.empty) {
        const deletePromises = sigSnapshot.docs.map(d => deleteDoc(d.ref));
        await Promise.all(deletePromises);
      }

      await deleteDoc(doc(db, 'dds_sessions', sessionToDelete));
      setSuccessMessage('Sessão excluída com sucesso!');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `dds_sessions/${sessionToDelete}`);
    } finally {
      setLoading(false);
      setSessionToDelete(null);
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

  const handleAIProcess = async () => {
    if (!aiText) return;
    setAiProcessing(true);
    setAiError('');
    setAiResult(null);

    try {
      const response = await fetch('/api/gemini/process-dds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: aiText })
      });
      const data = await response.json();
      if (!data.success) {
        setAiError(data.error || 'Erro desconhecido ao processar com a IA.');
      } else {
        setAiResult(data.result);
        
        // Match turn and group to prefill fields
        const parsed = data.result;
        if (parsed.metadados) {
          setNewTitle(parsed.metadados.assunto || '');
          setNewExecutor(parsed.metadados.executante || '');
          
          const rawTurno = parsed.metadados.turno || '';
          if (rawTurno.toLowerCase().includes('1') || rawTurno.toLowerCase().includes('a')) {
            setNewShift('Turno 1');
          } else if (rawTurno.toLowerCase().includes('2') || rawTurno.toLowerCase().includes('b')) {
            setNewShift('Turno 2');
          } else if (rawTurno.toLowerCase().includes('3') || rawTurno.toLowerCase().includes('c')) {
            setNewShift('Turno 3');
          }

          const letterMatch = rawTurno.match(/[A-E]/i);
          if (letterMatch) {
            setNewGroup(letterMatch[0].toUpperCase());
          }
        }
        if (parsed.indicadores_diarios) {
          setNewTotalPrevisto(parsed.indicadores_diarios.total_previsto || 9);
        }
      }
    } catch (err: any) {
      console.error(err);
      setAiError('Falha na comunicação com o servidor de Inteligência Artificial.');
    } finally {
      setAiProcessing(false);
    }
  };

  const handleAIConfirmAndSave = async () => {
    if (!aiResult) return;
    setLoading(true);
    setError('');

    try {
      const parsed = aiResult;
      const meta = parsed.metadados || {};
      const generatedPasscode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 4);

      // Create DDS session
      const sessionDocRef = await addDoc(collection(db, 'dds_sessions'), {
        title: meta.assunto || 'DDS Importado via IA',
        description: `DDS processado via Inteligência Artificial. Área: ${meta.area || 'Qualidade / Enfardamento'}.`,
        shift: newShift,
        group: newGroup,
        executor: meta.executante || 'Responsável',
        totalPrevisto: parsed.indicadores_diarios?.total_previsto || 9,
        passcode: generatedPasscode,
        expiresAt: Timestamp.fromDate(expiresAt),
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid
      });

      // Save imported signatures
      const participants = parsed.participantes || [];
      const batchPromises = participants.map(async (p: any, idx: number) => {
        const sigDocId = `imported_${sessionDocRef.id}_${idx}_${Date.now()}`;
        const ratingMap: Record<string, string> = {
          'Bom': 'happy',
          'Regular': 'neutral',
          'Ruim': 'sad',
          'Ausente': ''
        };
        const mappedMood = ratingMap[p.avaliacao] || 'happy';

        if (p.avaliacao !== 'Ausente') {
          return setDoc(doc(db, 'dds_signatures', sigDocId), {
            sessionId: sessionDocRef.id,
            sessionTitle: meta.assunto || 'DDS Importado via IA',
            userId: `imported_user_${idx}`,
            userName: p.nome || 'Colaborador',
            timestamp: serverTimestamp(),
            passcode: generatedPasscode,
            mood: mappedMood,
            evaluation: p.avaliacao || 'Bom'
          });
        }
      });

      await Promise.all(batchPromises);

      setShowAIModal(false);
      setAiText('');
      setAiResult(null);
      setSuccessMessage('DDS e participantes importados com sucesso via Inteligência Artificial!');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3500);
    } catch (err: any) {
      console.error(err);
      setError('Erro ao salvar o DDS e assinaturas processados.');
    } finally {
      setLoading(false);
    }
  };

  const canEditSession = (session: any) => {
    if (!session) return false;
    
    const now = new Date();
    const createdAt = safeToDate(session.createdAt) || new Date();
    
    // Same day check
    const isSameDay = now.toDateString() === createdAt.toDateString();
    if (!isSameDay) return false;

    // Shift check
    const currentShift = getCurrentShift();
    return session.shift === currentShift;
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
      
      const docId = `${auth.currentUser.uid}_${activeSession.id}`;
      
      // Use setDoc with a predictable ID to prevent duplicates
      await setDoc(doc(db, 'dds_signatures', docId), {
        sessionId: activeSession.id,
        sessionTitle: activeSession.title, // Denormalize for history view
        userId: auth.currentUser.uid,
        userName: profile?.displayName || 'Usuário',
        timestamp: serverTimestamp(),
        passcode: passcode, // Rules will check this
        mood: mood
      });

      setPasscode('');
      setSuccessMessage('Presença confirmada com sucesso!');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error(err);
      setError('Senha incorreta ou DDS expirado.');
    } finally {
      setLoading(false);
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

          html5QrCode.start(
            { facingMode: "environment" },
            config,
            (decodedText) => {
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
            },
            () => {} // ignore scan failures
          ).catch((err) => {
            console.error("Camera start error:", err);
            if (isMounted) {
              setIsScanning(false);
              const message = err?.message || String(err);
              if (message.includes("NotAllowedError") || message.includes("Permission denied")) {
                setError("Acesso à câmera negado. Por favor, permita o acesso nas configurações do seu navegador.");
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
                       <CountdownTimer expiresAt={safeToDate(activeSession?.expiresAt) || new Date()} />
                     </span>
                   </div>
                   <p className="text-emerald-400 font-bold uppercase tracking-[0.2em] text-[10px]">Expiração da Senha</p>
                 </div>
              </div>

              {isAdmin && (safeToDate(activeSession?.expiresAt) || new Date()) < new Date() && (
                <button
                  onClick={() => handleRenewSession(activeSession.id)}
                  className="mt-4 bg-emerald-500 hover:bg-emerald-600 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest transition-all shadow-xl shadow-emerald-500/20 flex items-center gap-3 border-b-4 border-emerald-700"
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
                  className="group flex flex-col items-center gap-3 transition-transform active:scale-95"
                >
                  <div className="w-20 h-20 bg-emerald-50 rounded-[1.5rem] flex items-center justify-center text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white transition-all shadow-sm group-hover:shadow-emerald-200 group-hover:shadow-xl">
                    <Smile className="w-10 h-10" />
                  </div>
                  <span className="text-sm font-bold text-slate-600 group-hover:text-emerald-600 transition-colors">Bem</span>
                </button>

                <button
                  onClick={() => submitSignature('neutral')}
                  className="group flex flex-col items-center gap-3 transition-transform active:scale-95"
                >
                  <div className="w-20 h-20 bg-amber-50 rounded-[1.5rem] flex items-center justify-center text-amber-500 group-hover:bg-amber-500 group-hover:text-white transition-all shadow-sm group-hover:shadow-amber-200 group-hover:shadow-xl">
                    <Meh className="w-10 h-10" />
                  </div>
                  <span className="text-sm font-bold text-slate-600 group-hover:text-amber-600 transition-colors">Normal</span>
                </button>

                <button
                  onClick={() => submitSignature('sad')}
                  className="group flex flex-col items-center gap-3 transition-transform active:scale-95"
                >
                  <div className="w-20 h-20 bg-rose-50 rounded-[1.5rem] flex items-center justify-center text-rose-500 group-hover:bg-rose-500 group-hover:text-white transition-all shadow-sm group-hover:shadow-rose-200 group-hover:shadow-xl">
                    <Frown className="w-10 h-10" />
                  </div>
                  <span className="text-sm font-bold text-slate-600 group-hover:text-rose-600 transition-colors">Cansado</span>
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

        {showAIModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[60] flex items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 15, opacity: 0 }}
              className="bg-white rounded-[2rem] p-8 max-w-2xl w-full shadow-2xl relative border border-slate-100 my-8"
            >
              <button 
                onClick={() => {
                  setShowAIModal(false);
                  setAiText('');
                  setAiResult(null);
                  setAiError('');
                }}
                className="absolute top-6 right-6 p-2 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full hover:text-slate-700 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3.5 mb-6">
                <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 flex-shrink-0">
                  <span className="text-xl">✨</span>
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-slate-800 tracking-tight">Importação de DDS por Inteligência Artificial</h3>
                  <p className="text-slate-400 text-xs font-semibold">Cole o relatório bruto ou anotações para análise instantânea</p>
                </div>
              </div>

              {!aiResult ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Relatório ou Transcrição do DDS</label>
                    <textarea
                      rows={8}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm leading-relaxed"
                      placeholder="Cole informações brutas aqui... Exemplo:&#10;DDS realizado pelo Danillo Souza no turno B dia 25/08/2025. Assunto abordado foi sobre Cintos de Segurança e Movimentação de Cargas.&#10;Presentes e avaliação:&#10;- João Silva - Reação: Bom&#10;- Maria Oliveira - Reação: Regular&#10;- Pedro Santos - Ausente"
                      value={aiText}
                      onChange={(e) => setAiText(e.target.value)}
                    />
                  </div>

                  {aiError && (
                    <div className="p-4 bg-rose-50 rounded-xl border border-rose-100 text-rose-600 text-xs font-semibold">
                      {aiError}
                    </div>
                  )}

                  <div className="flex justify-end gap-3 mt-4">
                    <button
                      type="button"
                      onClick={() => setShowAIModal(false)}
                      className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold uppercase tracking-widest rounded-xl transition-all"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={aiProcessing || !aiText}
                      onClick={handleAIProcess}
                      className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-emerald-100 cursor-pointer"
                    >
                      {aiProcessing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Processando...</span>
                        </>
                      ) : (
                        <>
                          <span>Analisar com IA</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-100/50">
                    <h4 className="text-emerald-800 font-bold text-xs uppercase tracking-wider mb-3">Informações Extraídas por IA</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                      <div>
                        <span className="text-slate-400 font-semibold uppercase tracking-wider block text-[9px] mb-1">Tema / Assunto</span>
                        <span className="font-bold text-slate-800 block truncate">{aiResult.metadados?.assunto || 'Não identificado'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-semibold uppercase tracking-wider block text-[9px] mb-1">Executante</span>
                        <span className="font-bold text-slate-800 block truncate">{aiResult.metadados?.executante || 'Não identificado'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-semibold uppercase tracking-wider block text-[9px] mb-1">Turno / Escala</span>
                        <span className="font-bold text-slate-800 block truncate">{aiResult.metadados?.turno || 'Não identificado'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-semibold uppercase tracking-wider block text-[9px] mb-1">Data</span>
                        <span className="font-bold text-slate-800 block truncate">{aiResult.metadados?.data || 'Não identificado'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-semibold uppercase tracking-wider block text-[9px] mb-1">Área</span>
                        <span className="font-bold text-slate-800 block truncate">{aiResult.metadados?.area || 'Não previsto'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-semibold uppercase tracking-wider block text-[9px] mb-1">Total Estimado</span>
                        <span className="font-bold text-slate-800 block">{aiResult.indicadores_diarios?.total_previsto || 9} colaboradores</span>
                      </div>
                    </div>
                  </div>

                  <div>
                     <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                       <h4 className="text-slate-700 font-bold text-xs uppercase tracking-wider">Participantes e Reação</h4>
                       <span className="bg-emerald-600/10 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                         {aiResult.participantes?.length || 0} Colaboradores
                       </span>
                     </div>
                     
                     <div className="max-h-48 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-50">
                       {aiResult.participantes && aiResult.participantes.map((p: any, idx: number) => {
                         const colorMap: Record<string, string> = {
                           'Bom': 'bg-emerald-50 text-emerald-700',
                           'Regular': 'bg-amber-50 text-amber-700',
                           'Ruim': 'bg-rose-50 text-rose-700',
                           'Ausente': 'bg-slate-50 text-slate-500'
                         };
                         return (
                           <div key={idx} className="p-3 flex items-center justify-between hover:bg-slate-50">
                             <span className="text-xs font-bold text-slate-700">{p.nome}</span>
                             <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-lg ${colorMap[p.avaliacao] || 'bg-slate-100 text-slate-600'}`}>
                               {p.avaliacao}
                             </span>
                           </div>
                         );
                       })}
                     </div>
                  </div>

                  <div className="flex bg-slate-50 p-4 rounded-xl border border-slate-100 items-start justify-between">
                    <div>
                      <span className="text-slate-400 font-semibold uppercase tracking-wider block text-[9px]">IDDS do Dia Calculado</span>
                      <span className="text-lg font-black text-emerald-600">
                        {aiResult.indicadores_diarios ? Math.round(aiResult.indicadores_diarios.idds_do_dia * 100) : 100}%
                      </span>
                    </div>
                    <div className="text-right text-xs">
                       <span className="text-slate-400 font-semibold block uppercase tracking-wider text-[9px]">Aderência Mínima</span>
                       <span className="font-extrabold text-slate-600 block">Meta: 75% da Equipe</span>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 mt-4">
                    <button
                      type="button"
                      onClick={() => setAiResult(null)}
                      className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold uppercase tracking-widest rounded-xl transition-all cursor-pointer"
                    >
                      Voltar
                    </button>
                    <button
                      type="button"
                      onClick={handleAIConfirmAndSave}
                      className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-emerald-100 cursor-pointer"
                    >
                      <span>Confirmar e Salvar DDS</span>
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Diálogo Diário de Segurança</h1>
        <p className="text-slate-500 mt-1">Participe do treinamento diário e valide sua presença.</p>
      </div>

      {/* Sections rearranged: Management and Validation at the top */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Admin/Creation Tools Side - Now at the Top Left */}
        <div className="lg:col-span-5 space-y-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-slate-900 rounded-[2rem] p-8 text-white shadow-2xl h-full"
          >
            <div className="flex items-center justify-between gap-2 mb-8">
               <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0">
                    <ShieldCheck className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold tracking-tight">
                    {editingSession ? 'Editar DDS' : 'Gestão de DDS'}
                  </h3>
               </div>
               
               {!editingSession && (isManager || isAdmin) && (
                 <button
                   type="button"
                   onClick={() => setShowAIModal(true)}
                   className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl transition-all shadow-md shadow-emerald-900/30 active:scale-95 cursor-pointer flex-shrink-0"
                 >
                   <span>Mágico de IA ✨</span>
                 </button>
               )}
            </div>

            {editingSession && (
              <button 
                onClick={() => {
                  setEditingSession(null);
                  setNewTitle('');
                  setNewDescription('');
                  setNewExecutor(profile?.displayName || '');
                }}
                className="mb-6 flex items-center gap-2 text-emerald-300 hover:text-white text-[10px] font-bold uppercase tracking-widest transition-colors"
              >
                <X className="w-3 h-3" />
                Cancelar Edição
              </button>
            )}

            <form onSubmit={handleCreateSession} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-emerald-300 mb-2">Turno</label>
                  <select
                    value={newShift}
                    onChange={(e) => setNewShift(e.target.value)}
                    className="w-full bg-slate-800 border-none rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="Turno 1">Turno 1 (00h-08h)</option>
                    <option value="Turno 2">Turno 2 (08h-16h)</option>
                    <option value="Turno 3">Turno 3 (16h-00h)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-emerald-300 mb-2">Letra</label>
                  <select
                    value={newGroup}
                    onChange={(e) => setNewGroup(e.target.value)}
                    className="w-full bg-slate-800 border-none rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="A">Letra A</option>
                    <option value="B">Letra B</option>
                    <option value="C">Letra C</option>
                    <option value="D">Letra D</option>
                    <option value="E">Letra E</option>
                  </select>
                </div>
              </div>

              <div ref={executorRef} className="relative">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-emerald-300 mb-2">Executante (Responsável)</label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    className="w-full bg-slate-800 border-none rounded-xl pl-4 pr-10 py-3 text-white placeholder-slate-500 focus:ring-2 focus:ring-emerald-500 text-sm"
                    placeholder="Nome do responsável ou visitante"
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
                  <div className="absolute left-0 right-0 mt-1 bg-slate-800 border border-slate-700/50 rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto">
                    {/* Indicador de novo usuário sem cadastro */}
                    {newExecutor && !registeredUsers.some(user => (user.displayName || '').toLowerCase() === newExecutor.toLowerCase()) && (
                      <div 
                        onClick={() => setShowExecutorDropdown(false)}
                        className="px-4 py-2.5 border-b border-slate-700/30 font-bold text-xs text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 cursor-pointer flex items-center justify-between transition-colors"
                      >
                        <span className="truncate">Usar novo executor sem cadastro: "{newExecutor}"</span>
                        <span className="text-[9px] bg-amber-500 text-slate-900 font-extrabold px-1.5 py-0.5 rounded flex-shrink-0 ml-2">Novo</span>
                      </div>
                    )}
                    
                    {registeredUsers.filter(user => {
                      const queryStr = (newExecutor || '').toLowerCase();
                      return (user.displayName || '').toLowerCase().includes(queryStr) || (user.email || '').toLowerCase().includes(queryStr);
                    }).length === 0 ? (
                      <div className="px-4 py-3 text-slate-400 text-xs text-center">
                        Nenhum usuário cadastrado encontrado com "{newExecutor}"
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-700/20">
                        {registeredUsers.filter(user => {
                          const queryStr = (newExecutor || '').toLowerCase();
                          return (user.displayName || '').toLowerCase().includes(queryStr) || (user.email || '').toLowerCase().includes(queryStr);
                        }).map(user => {
                          const isSelected = newExecutor === user.displayName;
                          return (
                            <div
                              key={user.uid}
                              onClick={() => {
                                setNewExecutor(user.displayName);
                                setShowExecutorDropdown(false);
                              }}
                              className={`px-4 py-3 text-xs flex flex-col hover:bg-slate-700/50 cursor-pointer transition-colors ${
                                isSelected ? 'bg-emerald-500/15 border-l-2 border-emerald-500' : ''
                              }`}
                            >
                              <span className="text-white font-bold text-[13px]">{user.displayName}</span>
                              <span className="text-slate-400 text-[10px] mt-0.5">{user.email}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-emerald-300 mb-2">Título do DDS (Tema)</label>
                <input
                  type="text"
                  className="w-full bg-slate-800 border-none rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:ring-2 focus:ring-emerald-500"
                  placeholder="ex: Prevenção de Quedas"
                  value={newTitle || ''}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-emerald-300 mb-2">Descrição (Opcional)</label>
                <textarea
                  rows={3}
                  className="w-full bg-slate-800 border-none rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:ring-2 focus:ring-emerald-500"
                  placeholder="Tópicos abordados..."
                  value={newDescription || ''}
                  onChange={(e) => setNewDescription(e.target.value)}
                />
              </div>

              {(isManager || isAdmin) && (
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-emerald-300 mb-2">Total Previsto no Turno (Colaboradores)</label>
                  <input
                    type="number"
                    min={1}
                    className="w-full bg-slate-800 border-none rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:ring-2 focus:ring-emerald-500"
                    placeholder="ex: 15"
                    value={newTotalPrevisto}
                    onChange={(e) => setNewTotalPrevisto(Math.max(1, parseInt(e.target.value) || 1))}
                    required
                  />
                </div>
              )}

              <div className="bg-emerald-800/50 p-4 rounded-xl border border-emerald-700/50 flex items-start gap-3">
                 <Key className="w-5 h-5 text-emerald-300 flex-shrink-0" />
                 <p className="text-xs text-emerald-100 leading-relaxed font-medium">
                   {isManager 
                    ? "Ao criar, uma senha aleatória será gerada com validade de 4 horas."
                    : "Após criar o DDS, solicite a validação (senha) ao seu gestor para que os colaboradores possam assinar."}
                 </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (editingSession ? <CheckCircle2 className="w-5 h-5" /> : <Plus className="w-5 h-5" />)}
                {editingSession ? 'Salvar Alterações' : 'Novo DDS do Período'}
              </button>
            </form>

            {activeSession && (isManager || isAdmin) && (
              <div className="mt-8 pt-8 border-t border-slate-800">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                    {activeSession.passcode ? 'Senha Atual Ativa' : 'Aguardando Validação'}
                  </span>
                  {activeSession.passcode && (
                    <button 
                      onClick={() => setShowQRFullscreen(true)}
                      className="flex items-center gap-2 text-[10px] text-white hover:text-emerald-300 uppercase font-bold tracking-widest transition-colors"
                    >
                       <QrCode className="w-4 h-4" />
                       Abrir QR Code
                    </button>
                  )}
                  {activeSession.passcode && (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400 uppercase font-bold tracking-widest">
                       <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
                       Válido
                    </span>
                  )}
                </div>

                {activeSession.passcode ? (
                  <div className="bg-white text-slate-900 rounded-2xl p-6 flex flex-col items-center justify-center shadow-xl mb-4 group relative overflow-hidden">
                      <span className="text-4xl font-black tracking-widest font-mono z-10">{activeSession.passcode}</span>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mt-4 z-10 mb-2">Forneça este código aos colaboradores</p>
                      
                    <div className="z-10 flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
                      <Timer className="w-3 h-3" />
                      <span className="text-[10px] font-black uppercase tracking-widest">
                        Expira em: <CountdownTimer expiresAt={safeToDate(activeSession.expiresAt) || new Date()} />
                      </span>
                    </div>

                    {(isAdmin || (isManager && activeSession.createdBy === auth.currentUser?.uid)) && (safeToDate(activeSession.expiresAt) || new Date()) < new Date() && (
                        <button
                          onClick={() => handleRenewSession(activeSession.id)}
                          className="z-10 mt-4 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg shadow-emerald-100"
                        >
                          <Timer className="w-3.5 h-3.5" />
                          Reativar por 4h
                        </button>
                      )}

                      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                         <QRCodeSVG value={`${window.location.origin}/#/dds?passcode=${activeSession.passcode}`} size={64} />
                      </div>
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
                        className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-500/10"
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
            )}
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
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                   <div className="flex items-center gap-2 mb-2">
                     <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded uppercase">
                       {activeSession.shift}
                     </span>
                     <span className="px-2 py-0.5 bg-slate-200 text-slate-700 text-[10px] font-bold rounded uppercase">
                       Letra {activeSession.group}
                     </span>
                   </div>
                   <h4 className="font-bold text-slate-900 mb-1">{activeSession.title}</h4>
                   <p className="text-sm text-slate-500 mb-2">{activeSession.description || 'Nenhuma descrição fornecida.'}</p>
                   <p className="text-xs text-slate-400 mb-4">Executante: <span className="font-bold text-slate-600">{activeSession.executor}</span></p>
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
                            "flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
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
                          Expira em: <CountdownTimer expiresAt={safeToDate(activeSession.expiresAt) || new Date()} />
                        </div>
                        {isManager && (safeToDate(activeSession.expiresAt) || new Date()) < new Date() && (
                          <button
                            type="button"
                            onClick={() => handleRenewSession(activeSession.id)}
                            className="mt-2 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-emerald-100 transition-all"
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
                   {['all', 'A', 'B', 'C', 'D', 'E'].map((letter) => (
                     <button
                       key={letter}
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
                {[1, 2, 3].map(shiftNum => {
                  const shiftName = `Turno ${shiftNum}` as Shift;
                  const group = getGroupForShift(new Date(), shiftName);
                  const sessionForShift = sessions.find(s => s.shift === shiftName && s.group === group);
                  const done = !!sessionForShift;
                  const isCurrent = getCurrentShift() === shiftName;
                  
                  return (
                    <motion.div 
                      key={shiftNum}
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
                    {Math.round((sessions.filter(s => {
                      const today = new Date();
                      const sched = getTodayGroups(today);
                      return Object.entries(sched).some(([shift, group]) => s.shift === shift && s.group === group && safeToDate(s.createdAt)?.toDateString() === today.toDateString());
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
                      {sessions.filter(s => {
                        const today = new Date();
                        const sched = getTodayGroups(today);
                        return Object.entries(sched).some(([shift, group]) => s.shift === shift && s.group === group && safeToDate(s.createdAt)?.toDateString() === today.toDateString());
                      }).length}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* User's recent signatures or Admin Session History with Search/Filters */}
          <div className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 tracking-tight">
                 {isManager ? <History className="w-5 h-5 text-emerald-600" /> : <History className="w-5 h-5 text-emerald-600" />}
                 {isManager ? 'Histórico de Sessões' : 'Meu Histórico de DDS'}
              </h3>
              
              {isManager && (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Participante..."
                      className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 outline-none w-40"
                      value={participantSearch}
                      onChange={(e) => setParticipantSearch(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                    <Filter className="w-3.5 h-3.5 text-slate-400" />
                    <select 
                      className="bg-transparent text-xs font-bold text-slate-600 outline-none"
                      value={selectedLetter}
                      onChange={(e) => setSelectedLetter(e.target.value)}
                    >
                      <option value="all">Todas Letras</option>
                      <option value="A">Letra A</option>
                      <option value="B">Letra B</option>
                      <option value="C">Letra C</option>
                      <option value="D">Letra D</option>
                      <option value="E">Letra E</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
            
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
              {isManager ? (
                // Admin/Manager View: Sessions with Participants
                sessions
                  .filter(s => selectedLetter === 'all' || s.group === selectedLetter)
                  .length > 0 ? (
                  sessions
                    .filter(s => selectedLetter === 'all' || s.group === selectedLetter)
                    .map((session) => (
                    <div key={session.id} className="flex flex-col gap-4 border border-slate-100 rounded-3xl p-4 hover:border-emerald-200 transition-all opacity-60 hover:opacity-100">
                      <div className="flex items-start justify-between gap-4">
                        <button 
                          onClick={() => setExpandedSessionId(expandedSessionId === session.id ? null : session.id)}
                          className="flex-1 text-left"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded uppercase">
                              {session.shift}
                            </span>
                             <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                                {safeToDate(session.createdAt)?.toLocaleDateString('pt-BR')}
                             </span>
                          </div>
                          <h4 className="font-bold text-slate-900 text-sm group-hover:text-emerald-600 transition-colors">
                            {session.title}
                          </h4>
                          <p className="text-xs text-slate-400">Executante: {session.executor}</p>
                        </button>

                        <div className="flex items-center gap-1">
                          {canEditSession(session) ? (
                            <button
                              onClick={() => handleEditSession(session)}
                              className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                              title="Editar Sessão"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <div className="p-2 text-slate-200 cursor-not-allowed" title="Edição permitida apenas no turno e dia da criação">
                              <Lock className="w-4 h-4" />
                            </div>
                          )}
                          
                          {isAdmin && (
                            <button
                              onClick={() => handleDeleteSession(session.id)}
                              className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                              title="Excluir Sessão"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          
                          <button
                            onClick={() => setExpandedSessionId(expandedSessionId === session.id ? null : session.id)}
                            className="p-2 text-slate-400 hover:text-slate-900 transition-all"
                          >
                            {expandedSessionId === session.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                          </button>
                        </div>
                      </div>

                      <AnimatePresence>
                        {expandedSessionId === session.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden border-t border-slate-50 pt-4"
                          >
                            <div className="flex items-center justify-between mb-4">
                               <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Collaboradores ({sessionSignatures.length})</span>
                               <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Senha: {session.passcode}</span>
                            </div>
                            
                            <div className="space-y-2">
                              {signaturesLoading ? (
                                <div className="flex justify-center py-4">
                                  <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
                                </div>
                              ) : sessionSignatures.filter(sig => !participantSearch || sig.userName.toLowerCase().includes(participantSearch.toLowerCase())).length > 0 ? (
                                sessionSignatures
                                  .filter(sig => !participantSearch || sig.userName.toLowerCase().includes(participantSearch.toLowerCase()))
                                  .map((sig) => (
                                  <div key={sig.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 bg-white border border-slate-100 rounded-lg flex items-center justify-center text-slate-400">
                                        <Users className="w-4 h-4" />
                                      </div>
                                      <div>
                                        <p className="text-sm font-bold text-slate-700">{sig.userName}</p>
                                        <p className="text-[9px] text-slate-400 font-bold uppercase">{safeToDate(sig.timestamp)?.toLocaleTimeString('pt-BR')}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {sig.mood === 'happy' && <Smile className="w-4 h-4 text-emerald-500" />}
                                      {sig.mood === 'neutral' && <Meh className="w-4 h-4 text-amber-500" />}
                                      {sig.mood === 'sad' && <Frown className="w-4 h-4 text-rose-500" />}
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="text-center py-4 text-xs text-slate-400 font-medium italic">Nenhuma assinatura realizada ainda.</div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-sm text-slate-400">Nenhum histórico encontrado.</div>
                )
              ) : (
                // User View: My Signatures & Created Sessions
                <div className="space-y-6">
                  {sessions.filter(s => s.createdBy === auth.currentUser?.uid).length > 0 && (
                    <div className="space-y-3 pb-6 border-b border-slate-100">
                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                        Sessões de Hoje Criadas por Você
                      </h4>
                      <p className="text-[10px] text-slate-400 font-medium">Você pode editar seus lançamentos durante o turno atual.</p>
                      <div className="space-y-2">
                        {sessions
                          .filter(s => s.createdBy === auth.currentUser?.uid)
                          .map((session) => (
                            <div key={session.id} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                              <div className="flex-1">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[9px] font-bold rounded uppercase">
                                    {session.shift}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                                    Letra {session.group}
                                  </span>
                                </div>
                                <span className="text-sm font-bold text-slate-900">{session.title}</span>
                                <p className="text-xs text-slate-400">Responsável: {session.executor}</p>
                              </div>
                              {canEditSession(session) ? (
                                <button
                                  onClick={() => handleEditSession(session)}
                                  className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                                  title="Editar Sessão"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                              ) : (
                                <div className="p-2 text-slate-200 cursor-not-allowed" title="Edição fechada após o turno ou data de criação">
                                  <Lock className="w-4 h-4" />
                                </div>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <History className="w-3.5 h-3.5 text-emerald-500" />
                    Sua Participação Recente
                  </h4>

                  {historyLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                    </div>
                  ) : history.length > 0 ? (
                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                      {history.map((item) => (
                        <div key={item.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-emerald-200 transition-colors">
                          <div className="flex flex-col gap-1">
                            <p className="font-bold text-slate-900 text-sm">{item.sessionTitle}</p>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                              <Calendar className="w-3 h-3" />
                              {safeToDate(item.timestamp) ? safeToDate(item.timestamp)?.toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR')} 
                              <span className="mx-1">•</span>
                              <Clock className="w-3 h-3" />
                              {safeToDate(item.timestamp) ? safeToDate(item.timestamp)?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {item.mood === 'happy' && <Smile className="w-5 h-5 text-emerald-500" />}
                            {item.mood === 'neutral' && <Meh className="w-5 h-5 text-amber-500" />}
                            {item.mood === 'sad' && <Frown className="w-5 h-5 text-rose-500" />}
                            <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 shadow-sm border border-emerald-200">
                              <CheckCircle2 className="w-4 h-4" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-400 text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      <AlertCircle className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                      <p>Você ainda não assinou nenhum DDS.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
        </div>
        </div>

        {/* Admin/Creation Tools Side */}
      </div>

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
                <h3 className="text-xl font-bold text-slate-900 text-center mb-2">Excluir Sessão?</h3>
                <p className="text-slate-500 text-center text-sm mb-8">
                  Esta ação é irreversível. Todas as assinaturas serão mantidas, mas o acesso à sessão será removido.
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
      </div>
    );
  };

export default DDS;
