import React, { useEffect, useState, useMemo } from 'react';
import { collection, query, limit, getDocs, orderBy, onSnapshot, where, Timestamp, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { decryptValue } from '../lib/crypto';
import { MASTER_EMAILS } from '../constants';
import { handleFirestoreError, OperationType } from '../lib/errorHandler';
import { Metric } from '../types';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line,
  AreaChart,
  Area,
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { 
  TrendingUp, 
  Users as UsersIcon, 
  Activity, 
  Shield, 
  Info, 
  Calendar, 
  Filter, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown,
  Target,
  Truck,
  AlertTriangle,
  History,
  LayoutDashboard,
  ClipboardCheck,
  Layers as LayersIcon,
  FileText,
  CheckCircle2,
  Box,
  Scale,
  Clock,
  ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { cn, safeToDate } from '../lib/utils';
import { getCurrentShift, getGroupForShift, getTodayGroups, Shift, Group } from '../lib/scaleUtils';

const Dashboard: React.FC = () => {
  const { isManager } = useAuth();
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

  const tabsList = useMemo(() => [
    { id: 'dds', moduleKey: 'dds', label: 'DDS Online', icon: Shield },
    { id: 'forklifts', moduleKey: 'forklifts', label: 'Empilhadeiras', icon: Truck },
    { id: 'quality', moduleKey: 'quality', label: 'Inspeções', icon: ClipboardCheck },
    { id: 'wire', moduleKey: 'wires', label: 'Arames', icon: LayersIcon },
    { id: 'operational_routes', moduleKey: 'operational_routes', label: 'Rota Operacional', icon: Activity },
    { id: 'safety_observations', moduleKey: 'safety_observations', label: 'Observações de Segurança', icon: ShieldAlert },
    { id: 'consumables', moduleKey: 'consumables', label: 'Controle de Insumos', icon: Box }
  ] as const, []);

  const [activeTab, setActiveTab ] = useState<'dds' | 'forklifts' | 'quality' | 'wire' | 'operational_routes' | 'safety_observations' | 'consumables'>('dds');
  const [routesSubmissions, setRoutesSubmissions ] = useState<any[]>([]);
  const [routesTemplates, setRoutesTemplates ] = useState<any[]>([]);
  const [safetyObservations, setSafetyObservations] = useState<any[]>([]);
  const [consumableItems, setConsumableItems] = useState<any[]>([]);
  const [consumableLogs, setConsumableLogs] = useState<any[]>([]);
  const [showTabMenu, setShowTabMenu] = useState(false);
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeDDS: 0,
    totalSignatures: 0,
    allowedDomains: 0
  });

  // Forklift States
  const [forkliftStats, setForkliftStats] = useState({
    total: 0,
    blocked: 0,
    liberated: 0,
    totalChecklists: 0,
    nonConformityRate: 0
  });
  const [forkliftHistory, setForkliftHistory] = useState<any[]>([]);
  const [checkItems, setCheckItems] = useState<any[]>([]);

  // Quality States
  const [qualitySubmissions, setQualitySubmissions] = useState<any[]>([]);
  const [qualityTemplates, setQualityTemplates] = useState<any[]>([]);
  const [qualityOptionSets, setQualityOptionSets] = useState<any[]>([]);

  // Wire States
  const [wireBatches, setWireBatches] = useState<any[]>([]);
  const [wireCoils, setWireCoils] = useState<any[]>([]);
  const [lines, setLines] = useState<any[]>([]);

  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Compliance States
  const [allSessions, setAllSessions] = useState<any[]>([]);
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth());
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterLetter, setFilterLetter] = useState<string>('all');
  const [filterDay, setFilterDay] = useState<string>('all');

  const [ddsStatus, setDdsStatus] = useState<Record<string, boolean>>({});
  const [expectedDuty, setExpectedDuty] = useState<{ shift: Shift, group: Group } | null>(null);

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
      console.error('Error listening to modules configuration in Dashboard:', error);
    });
    return () => unsubModules();
  }, []);

  useEffect(() => {
    const currentTabMap = tabsList.find(t => t.id === activeTab);
    if (currentTabMap && activeModules[currentTabMap.moduleKey] === false) {
      const firstEnabled = tabsList.find(t => activeModules[t.moduleKey] !== false);
      if (firstEnabled) {
        setActiveTab(firstEnabled.id);
      }
    }
  }, [activeModules, activeTab, tabsList]);

  useEffect(() => {
    if (!isManager) {
      setLoading(false);
      return;
    }

    // Real-time listener for ALL sessions (filtered by year for performance)
    const currentYearStart = new Date(filterYear, 0, 1);
    const q = query(
      collection(db, 'dds_sessions'),
      where('createdAt', '>=', Timestamp.fromDate(currentYearStart)),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const sessions = await Promise.all(snapshot.docs.map(async (doc) => {
        const data = doc.data() as any;
        const decName = await decryptValue(data.userName);
        return { id: doc.id, ...data, userName: decName };
      }));
      setAllSessions(sessions);

      // Update current day status
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const statusMap: Record<string, boolean> = {};
      sessions.forEach((data: any) => {
        const createdAt = safeToDate(data.createdAt) || new Date();
        if (createdAt >= today) {
          const key = `${data.shift}-${data.group}`;
          statusMap[key] = true;
        }
      });
      setDdsStatus(statusMap);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'dds_sessions');
    });

    const fetchOtherStats = async () => {
      try {
        const currentShift = getCurrentShift();
        const currentGroup = getGroupForShift(new Date(), currentShift);
        setExpectedDuty({ shift: currentShift, group: currentGroup });
        
        const [usersSnap, signaturesSnap, domainsSnap, sessionsSnap] = await Promise.all([
          getDocs(collection(db, 'users')).catch(err => handleFirestoreError(err, OperationType.LIST, 'users')),
          getDocs(collection(db, 'dds_signatures')).catch(err => handleFirestoreError(err, OperationType.LIST, 'dds_signatures')),
          getDocs(collection(db, 'allowed_domains')).catch(err => handleFirestoreError(err, OperationType.LIST, 'allowed_domains')),
          getDocs(collection(db, 'dds_sessions')).catch(err => handleFirestoreError(err, OperationType.LIST, 'dds_sessions'))
        ]);

        if (!usersSnap || !signaturesSnap || !domainsSnap || !sessionsSnap) return;

        const validSessionIds = new Set(sessionsSnap.docs.map(d => d.id));
        const validSignatures = signaturesSnap.docs.filter(d => validSessionIds.has(d.data().sessionId));

        const nonMasterUsersCount = usersSnap.docs.filter(doc => {
          const email = doc.data()?.email?.toLowerCase().trim() || '';
          return !MASTER_EMAILS.includes(email);
        }).length;

        setStats({
          totalUsers: nonMasterUsersCount,
          activeDDS: 0, 
          totalSignatures: validSignatures.length,
          allowedDomains: domainsSnap.size
        });
      } catch (err) {
        console.error("Error fetching generic stats:", err);
      }
    };

    fetchOtherStats();

    // Forklift Real-time Listeners
    const unsubForklifts = onSnapshot(collection(db, 'forklifts'), (snapshot) => {
      const docs = snapshot.docs.map(d => d.data());
      setForkliftStats(prev => ({
        ...prev,
        total: docs.length,
        blocked: docs.filter(d => d.status === 'bloqueada').length,
        liberated: docs.filter(d => d.status === 'liberada').length
      }));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'forklifts');
    });

    const unsubChecklists = onSnapshot(collection(db, 'forklift_checklists'), async (snapshot) => {
      const docs = await Promise.all(snapshot.docs.map(async (doc) => {
        const data = doc.data() as any;
        const decName = await decryptValue(data.conductorName);
        return { id: doc.id, ...data, conductorName: decName };
      }));
      setForkliftHistory(docs);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'forklift_checklists');
    });

    const unsubCheckItems = onSnapshot(collection(db, 'forklift_check_items'), (snapshot) => {
      setCheckItems(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'forklift_check_items');
    });

    // Quality Listeners
    const unsubQualSubmissions = onSnapshot(collection(db, 'quality_checklist_submissions'), async (snapshot) => {
      const docs = await Promise.all(snapshot.docs.map(async (doc) => {
        const data = doc.data() as any;
        const decName = await decryptValue(data.userName);
        return { id: doc.id, ...data, userName: decName };
      }));
      setQualitySubmissions(docs);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'quality_checklist_submissions'));

    const unsubQualTemplates = onSnapshot(collection(db, 'quality_checklist_templates'), (snapshot) => {
      setQualityTemplates(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'quality_checklist_templates'));

    const unsubQualOptions = onSnapshot(collection(db, 'quality_checklist_options'), (snapshot) => {
      setQualityOptionSets(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'quality_checklist_options'));

    // Wire Listeners
    const unsubWireBatches = onSnapshot(collection(db, 'wire_batches'), (snapshot) => {
      setWireBatches(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'wire_batches'));

    const unsubWireCoils = onSnapshot(collection(db, 'wire_coils'), (snapshot) => {
      setWireCoils(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'wire_coils'));

    const unsubLines = onSnapshot(collection(db, 'production_lines'), (snapshot) => {
      setLines(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'production_lines'));

    const unsubRoutesSub = onSnapshot(collection(db, 'route_submissions'), async (snapshot) => {
      const docs = await Promise.all(snapshot.docs.map(async (doc) => {
        const data = doc.data() as any;
        const decName = await decryptValue(data.userName);
        return { id: doc.id, ...data, userName: decName };
      }));
      setRoutesSubmissions(docs);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'route_submissions'));

    const unsubRoutesTmpl = onSnapshot(collection(db, 'route_templates'), (snapshot) => {
      setRoutesTemplates(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'route_templates'));

    const unsubSafetyObs = onSnapshot(collection(db, 'safety_observations'), async (snapshot) => {
      const docs = await Promise.all(snapshot.docs.map(async (doc) => {
        const data = doc.data() as any;
        const decName = await decryptValue(data.userName);
        return { id: doc.id, ...data, userName: decName };
      }));
      setSafetyObservations(docs);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'safety_observations'));

    const unsubConsumableItems = onSnapshot(collection(db, 'consumable_items'), (snapshot) => {
      setConsumableItems(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'consumable_items'));

    const unsubConsumableLogs = onSnapshot(collection(db, 'consumable_logs'), async (snapshot) => {
      const docs = await Promise.all(snapshot.docs.map(async (doc) => {
        const data = doc.data() as any;
        const decName = await decryptValue(data.userName);
        return { id: doc.id, ...data, userName: decName };
      }));
      setConsumableLogs(docs);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'consumable_logs'));

    return () => {
      unsubscribe();
      unsubForklifts();
      unsubChecklists();
      unsubCheckItems();
      unsubQualSubmissions();
      unsubQualTemplates();
      unsubQualOptions();
      unsubWireBatches();
      unsubWireCoils();
      unsubLines();
      unsubRoutesSub();
      unsubRoutesTmpl();
      unsubSafetyObs();
      unsubConsumableItems();
      unsubConsumableLogs();
    };
  }, [isManager, filterYear, filterMonth]);

  // Derived forklift metrics for the selected period
  const forkliftMetrics = useMemo(() => {
    const history = forkliftHistory.filter(h => {
      const d = safeToDate(h.timestamp);
      return d && d.getMonth() === filterMonth && d.getFullYear() === filterYear;
    });

    const total = history.length;
    const abnormal = history.filter(h => h.status === 'anormal').length;
    
    return {
      totalChecklists: total,
      nonConformityRate: total > 0 ? Math.round((abnormal / total) * 100) : 0,
      abnormalCount: abnormal
    };
  }, [forkliftHistory, filterMonth, filterYear]);

  // Derived routes metrics for the selected period
  const routeMetrics = useMemo(() => {
    const history = routesSubmissions.filter(h => {
      const d = safeToDate(h.createdAt);
      return d && d.getMonth() === filterMonth && d.getFullYear() === filterYear;
    });

    let totalChecked = 0;
    let okChecked = 0;
    const eqFails: Record<string, number> = {};

    history.forEach(h => {
      h.responses?.forEach((r: any) => {
        totalChecked++;
        if (r.status === 'ok') {
          okChecked++;
        } else {
          eqFails[r.equipmentName] = (eqFails[r.equipmentName] || 0) + 1;
        }
      });
    });

    const complianceRate = totalChecked > 0 ? Math.round((okChecked / totalChecked) * 100) : 100;

    // Daily trends
    const daysInMonth = new Date(filterYear, filterMonth + 1, 0).getDate();
    const dailyTrend = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const daySubs = history.filter(h => {
        const d = safeToDate(h.createdAt);
        return d && d.getDate() === day;
      });

      if (daySubs.length === 0) {
        continue;
      }

      let dChecked = 0;
      let dOk = 0;
      daySubs.forEach(h => {
        h.responses?.forEach((r: any) => {
          dChecked++;
          if (r.status === 'ok') dOk++;
        });
      });

      const rate = dChecked > 0 ? Math.round((dOk / dChecked) * 100) : 100;
      dailyTrend.push({ Day: `${day}`, Conformidade: rate });
    }

    const failedEquipmentList = Object.entries(eqFails)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalSubmissions: history.length,
      complianceRate,
      failedEquipmentList,
      dailyTrend,
      latestSubmissions: history.slice(0, 5)
    };
  }, [routesSubmissions, filterMonth, filterYear]);

  // Derived Safety Observations metrics
  const safetyMetrics = useMemo(() => {
    const history = safetyObservations.filter(h => {
      const d = safeToDate(h.createdAt);
      return d && d.getMonth() === filterMonth && d.getFullYear() === filterYear;
    });

    const total = history.length;
    const pending = history.filter(h => h.status === 'pending').length;
    const resolved = history.filter(h => h.status === 'resolved').length;
    const working = history.filter(h => h.status === 'working').length;

    const safeCount = history.filter(h => h.isSafe === 'seguro').length;
    const riskCount = history.filter(h => h.isSafe !== 'seguro').length;

    const highSeverity = history.filter(h => h.severity === 'high').length;
    const mediumSeverity = history.filter(h => h.severity === 'medium').length;
    const lowSeverity = history.filter(h => h.severity === 'low').length;

    // Severity list helper
    const severityDist = [
      { name: 'Crítica / Alta (Desvio)', value: highSeverity, color: '#f43f5e' },
      { name: 'Média (Atenção)', value: mediumSeverity, color: '#f59e0b' },
      { name: 'Baixa (Acompanhar)', value: lowSeverity, color: '#3b82f6' }
    ].filter(s => s.value > 0);

    // Group by plant area (observerArea or observedArea)
    const areaMap: Record<string, number> = {};
    history.forEach(h => {
      const area = h.observedArea || h.observerArea || 'Área Geral / Operacional';
      areaMap[area] = (areaMap[area] || 0) + 1;
    });

    const areaList = Object.entries(areaMap).map(([name, count]) => ({
      name,
      count
    })).sort((a, b) => b.count - a.count);

    const topAreas = areaList.slice(0, 5);
    const safetyCompliance = total > 0 ? Math.round((safeCount / total) * 100) : 100;

    // Daily trends
    const daysInMonth = new Date(filterYear, filterMonth + 1, 0).getDate();
    const dailyTrend = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const daySubs = history.filter(h => {
        const d = safeToDate(h.createdAt);
        return d && d.getDate() === day;
      });

      if (daySubs.length === 0) {
        continue;
      }

      const safeInDay = daySubs.filter(h => h.isSafe === 'seguro').length;
      const desvioInDay = daySubs.filter(h => h.isSafe !== 'seguro').length;

      dailyTrend.push({
        Day: `${day}`,
        'Registros': daySubs.length,
        'Seguro': safeInDay,
        'Desvios': desvioInDay
      });
    }

    return {
      total,
      pending,
      resolved,
      working,
      safeCount,
      riskCount,
      highSeverity,
      mediumSeverity,
      lowSeverity,
      severityDist,
      areaList,
      topAreas,
      safetyCompliance,
      dailyTrend,
      latestObservations: history.slice(0, 10)
    };
  }, [safetyObservations, filterMonth, filterYear]);

  // Derived Statistics based on filters
  const complianceData = useMemo(() => {
    const daysInMonth = new Date(filterYear, filterMonth + 1, 0).getDate();
    const data = [];

    for (let day = 1; day <= daysInMonth; day++) {
      if (filterDay !== 'all' && day !== parseInt(filterDay)) continue;

      const date = new Date(filterYear, filterMonth, day);
      const groupsWorking = getTodayGroups(date);
      
      const sessionsOnDay = allSessions.filter(s => {
        const sDate = safeToDate(s.createdAt);
        if (!sDate) return false;
        return sDate.getFullYear() === filterYear && 
               sDate.getMonth() === filterMonth && 
               sDate.getDate() === day;
      });

      let done = 0;
      let expected = 0;

      if (filterLetter !== 'all') {
        // Look for this specific letter across all shifts of this day
        Object.entries(groupsWorking).forEach(([shift, group]) => {
          if (group === filterLetter) {
            expected++;
            if (sessionsOnDay.some(s => s.shift === shift && s.group === group)) {
              done++;
            }
          }
        });
      } else {
        // Calculate daily global compliance (3 sessions expected per day)
        expected = 3;
        const completions = new Set();
        sessionsOnDay.forEach(s => completions.add(`${s.shift}-${s.group}`));
        done = completions.size;
      }

      if (expected > 0 || filterLetter === 'all') {
        data.push({
          name: `${day}/${filterMonth + 1}`,
          day,
          percentage: expected > 0 ? Math.round((done / expected) * 100) : 0,
          done,
          expected: expected || 3
        });
      }
    }
    return data;
  }, [allSessions, filterMonth, filterYear, filterLetter, filterDay]);

  // NEW: Calculate monthly commitment per letter (A, B, C, D, E)
  const letterCommitmentData = useMemo(() => {
    const letters: Group[] = ['A', 'B', 'C', 'D', 'E'];
    const daysInMonth = new Date(filterYear, filterMonth + 1, 0).getDate();
    
    return letters.map(letter => {
      let daysScheduled = 0;
      let daysPerformed = 0;

      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(filterYear, filterMonth, day);
        const groupsWorking = getTodayGroups(date);
        
        // A letter works on this day if it's assigned to any shift
        const isWorkingToday = Object.values(groupsWorking).includes(letter);
        
        if (isWorkingToday) {
          daysScheduled++;
          
          // Check if at least one session was created for this letter on this day
          const sessionExists = allSessions.some(s => {
            const sDate = safeToDate(s.createdAt);
            return sDate && 
                   sDate.getFullYear() === filterYear && 
                   sDate.getMonth() === filterMonth && 
                   sDate.getDate() === day &&
                   s.group === letter;
          });

          if (sessionExists) {
            daysPerformed++;
          }
        }
      }

      const percentage = daysScheduled > 0 ? Math.round((daysPerformed / daysScheduled) * 100) : 0;

      return {
        letter,
        daysScheduled,
        daysPerformed,
        percentage
      };
    });
  }, [allSessions, filterMonth, filterYear]);

  const forkliftChartData = useMemo(() => {
    // Generate daily inspection trend for current month
    const daysInMonth = new Date(filterYear, filterMonth + 1, 0).getDate();
    const data = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const inspectionsOnDay = forkliftHistory.filter(h => {
        const d = safeToDate(h.timestamp);
        return d && d.getDate() === day && d.getMonth() === filterMonth && d.getFullYear() === filterYear;
      });
      data.push({
        name: `${day}/${filterMonth + 1}`,
        count: inspectionsOnDay.length,
        anormal: inspectionsOnDay.filter(i => i.status === 'anormal').length
      });
    }
    return data;
  }, [forkliftHistory, filterMonth, filterYear]);

  const ncDistributionData = useMemo(() => {
    if (!forkliftHistory.length || !checkItems.length) return [];

    const distribution: Record<string, number> = {};

    forkliftHistory.forEach(checklist => {
      // Only consider inspections from the selected period
      const d = safeToDate(checklist.timestamp);
      if (!d || d.getMonth() !== filterMonth || d.getFullYear() !== filterYear) return;

      Object.entries(checklist.itemResults || {}).forEach(([itemId, result]: [string, any]) => {
        if (result.status === 'anormal') {
          const item = checkItems.find(i => i.id === itemId);
          const name = item?.name || 'Desconhecido';
          distribution[name] = (distribution[name] || 0) + 1;
        }
      });
    });

    return Object.entries(distribution)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8); // Top 8 failures
  }, [forkliftHistory, checkItems, filterMonth, filterYear]);

  // Quality Metrics
  const qualityMetrics = useMemo(() => {
    const isResponseCompliant = (itemId: string, value: any, template: any) => {
      const item = template?.items?.find((i: any) => i.id === itemId);
      if (!item) return true;

      const isDryer = template?.name ? (template.name.toLowerCase().includes('limpeza') || template.name.toLowerCase().includes('secador')) : false;
      if (isDryer && value) {
        if (typeof value === 'object' && value !== null) {
          const statuses = Object.values(value) as string[];
          const hasNonCompliant = statuses.some(s => {
            const lowerS = String(s).toLowerCase();
            if (lowerS.includes('pouco') || lowerS.includes('limp')) return false;
            return lowerS.includes('suj') || lowerS.includes('tamponado') || lowerS.includes('tamponada') || lowerS.includes('vermelho');
          });
          return !hasNonCompliant;
        } else {
          const lowerVal = String(value).toLowerCase();
          if (lowerVal.includes('pouco') || lowerVal === 'pouco sujo' || lowerVal === 'pouco suja' || lowerVal.includes('limp')) {
            return true;
          }
          if (lowerVal.includes('suj') || lowerVal.includes('tamponado') || lowerVal.includes('tamponada') || lowerVal.includes('vermelho')) {
            return false;
          }
        }
      }

      if (item.type === 'condition') {
        if (item.conditionOptionsId) {
          const optionSet = qualityOptionSets.find(os => os.id === item.conditionOptionsId);
          if (optionSet && optionSet.options.length > 0) {
            return value === optionSet.options[0];
          }
        }
        if (value === 'not_ok') return false;
        const lowerVal = String(value).toLowerCase();
        if (lowerVal.includes('não') || lowerVal.includes('nao') || lowerVal.includes('not')) return false;
        if (lowerVal === 'nok' || lowerVal === 'fail') return false;
      }
      if (item.type === 'range') {
        if (value === 'low' || value === 'high') return false;
      }
      return true;
    };

    const daysInMonth = new Date(filterYear, filterMonth + 1, 0).getDate();
    const trend = [];
    const ncDist: Record<string, number> = {};

    for (let day = 1; day <= daysInMonth; day++) {
      const subsOnDay = qualitySubmissions.filter(s => {
        const d = safeToDate(s.createdAt);
        return d && d.getDate() === day && d.getMonth() === filterMonth && d.getFullYear() === filterYear;
      });

      let dayTotalItems = 0;
      let dayCompliantItems = 0;

      subsOnDay.forEach(sub => {
        const template = qualityTemplates.find(t => t.id === sub.templateId);
        if (!template) return;

        sub.responses.forEach((resp: any) => {
          dayTotalItems++;
          const compliant = isResponseCompliant(resp.itemId, resp.value, template);
          if (compliant) {
            dayCompliantItems++;
          } else {
            const item = template.items.find((i: any) => i.id === resp.itemId);
            const label = item?.label || 'Desconhecido';
            ncDist[label] = (ncDist[label] || 0) + 1;
          }
        });
      });

      trend.push({
        name: `${day}/${filterMonth + 1}`,
        compliance: dayTotalItems > 0 ? Math.round((dayCompliantItems / dayTotalItems) * 100) : 100,
        count: subsOnDay.length
      });
    }

    const totalItems = qualitySubmissions.reduce((acc, sub) => {
      const d = safeToDate(sub.createdAt);
      if (!d || d.getMonth() !== filterMonth || d.getFullYear() !== filterYear) return acc;
      return acc + sub.responses.length;
    }, 0);

    const compliantItems = qualitySubmissions.reduce((acc, sub) => {
      const d = safeToDate(sub.createdAt);
      if (!d || d.getMonth() !== filterMonth || d.getFullYear() !== filterYear) return acc;
      const template = qualityTemplates.find(t => t.id === sub.templateId);
      if (!template) return acc;
      return acc + sub.responses.filter((r: any) => isResponseCompliant(r.itemId, r.value, template)).length;
    }, 0);

    return {
      trend,
      complianceRate: totalItems > 0 ? Math.round((compliantItems / totalItems) * 100) : 100,
      totalSubmissions: trend.reduce((a, b) => a + b.count, 0),
      ncDistribution: Object.entries(ncDist)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8)
    };
  }, [qualitySubmissions, qualityTemplates, qualityOptionSets, filterMonth, filterYear]);

  // Wire Metrics
  const wireMetrics = useMemo(() => {
    const history = wireCoils.filter(c => {
      const d = safeToDate(c.receivedAt);
      return d && d.getMonth() === filterMonth && d.getFullYear() === filterYear;
    });

    const totalWeight = history.reduce((acc, c) => acc + (c.weight || 0), 0);
    const consumedWeight = history.reduce((acc, c) => c.status === 'consumed' ? acc + (c.weight || 0) : acc, 0);
    
    const statusDist = [
      { name: 'Recebido', value: history.filter(c => c.status === 'received').length, color: '#94a3b8' },
      { name: 'Em Uso', value: history.filter(c => c.status === 'in_use').length, color: '#f59e0b' },
      { name: 'Consumido', value: history.filter(c => c.status === 'consumed').length, color: '#10b981' }
    ].filter(s => s.value > 0);

    const supplierDist: Record<string, number> = {};
    history.forEach(c => {
      const batch = wireBatches.find(b => b.id === c.batchId);
      const name = batch?.supplierName || 'N/A';
      supplierDist[name] = (supplierDist[name] || 0) + (c.weight || 0);
    });

    return {
      totalWeight,
      consumedWeight,
      consumptionRate: totalWeight > 0 ? Math.round((consumedWeight / totalWeight) * 100) : 0,
      statusDist,
      supplierData: Object.entries(supplierDist).map(([name, value]) => ({ name, value }))
    };
  }, [wireCoils, wireBatches, filterMonth, filterYear]);

  const currentMonthCompliance = useMemo(() => {
    if (complianceData.length === 0) return 0;
    const totalDone = complianceData.reduce((acc, curr) => acc + curr.done, 0);
    const totalExpected = complianceData.reduce((acc, curr) => acc + curr.expected, 0);
    return Math.round((totalDone / totalExpected) * 100) || 0;
  }, [complianceData]);

  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const statCards = [
    { name: 'Total de Usuários', value: stats.totalUsers.toLocaleString(), icon: UsersIcon, color: 'text-blue-600', bg: 'bg-blue-50' },
    { name: 'DDS Ativos Agora', value: stats.activeDDS.toString(), icon: Activity, color: 'text-green-600', bg: 'bg-green-50' },
    { name: 'Assinaturas Registradas', value: stats.totalSignatures.toLocaleString(), icon: Shield, color: 'text-red-600', bg: 'bg-red-50' },
    { name: 'Domínios Autorizados', value: stats.allowedDomains.toString(), icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  ];

  if (activeModules.dashboard === false) {
    return (
      <div className="max-w-md mx-auto my-12 text-center" id="dashboard-disabled">
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-md flex flex-col items-center">
          <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500 mb-4">
            <LayoutDashboard className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Módulo Desabilitado</h2>
          <p className="text-sm text-slate-500 mt-2 font-semibold">
            O módulo de Dashboard foi temporariamente desativado pelo administrador do sistema.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-white p-8 rounded-[2.5rem] border border-slate-200">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight leading-none mb-2">Analytics Center</h1>
          <p className="text-sm text-slate-400 font-medium italic">Monitoramento centralizado de operações e segurança.</p>
        </div>

        <div className="relative">
          <button
            onClick={() => setShowTabMenu(!showTabMenu)}
            className="flex items-center gap-3 px-5 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-black uppercase tracking-tight text-slate-700 shadow-sm hover:border-emerald-200 transition-all active:scale-95"
          >
            {(() => {
              const currentTabInfo = tabsList.find(t => t.id === activeTab);
              if (currentTabInfo) {
                const IconComponent = currentTabInfo.icon;
                return (
                  <>
                    <IconComponent className={cn("w-5 h-5", activeTab === 'safety_observations' ? "text-rose-600" : "text-emerald-600")} /> 
                    {currentTabInfo.label}
                  </>
                );
              }
              return 'Selecione';
            })()}
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
                  className="absolute left-0 mt-2 w-64 bg-white border border-slate-100 rounded-2xl shadow-2xl z-20 overflow-hidden p-1.5"
                >
                  {tabsList
                    .filter(tab => activeModules[tab.moduleKey] !== false)
                    .map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => { setActiveTab(tab.id as any); setShowTabMenu(false); }}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-xs font-black uppercase tracking-tight transition-all",
                          activeTab === tab.id ? "bg-emerald-50 text-emerald-700" : "text-slate-500 hover:bg-slate-50"
                        )}
                      >
                        <tab.icon className="w-4 h-4" /> {tab.label}
                      </button>
                    ))}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'dds' ? (
          <motion.div
            key="dds"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">DDS Online Analysis</h2>
                <p className="text-xs text-slate-400 font-bold tracking-widest uppercase">Métricas de aplicação e conformidade</p>
              </div>

              {/* Filters Panel */}
              <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm w-full md:w-auto justify-center md:justify-start">
                {/* Note: [vite] failed to connect to websocket errors are benign and expected in this environment */}
                <div className="flex items-center gap-2 px-3 md:border-r border-slate-100">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  <select 
                    value={filterMonth} 
                    onChange={(e) => setFilterMonth(parseInt(e.target.value))}
                    className="bg-transparent border-none text-xs font-bold text-slate-700 focus:ring-0 cursor-pointer"
                  >
                    {months.map((m, i) => <option key={m} value={i}>{m}</option>)}
                  </select>
                  <input 
                    type="number" 
                    value={filterYear}
                    onChange={(e) => setFilterYear(parseInt(e.target.value))}
                    className="w-20 bg-transparent border-none text-xs font-bold text-slate-700 focus:ring-0 cursor-pointer"
                  />
                </div>

                <div className="flex items-center gap-2 px-3 md:border-r border-slate-100">
                  <Target className="w-4 h-4 text-slate-400" />
                  <select 
                    value={filterLetter} 
                    onChange={(e) => setFilterLetter(e.target.value)}
                    className="bg-transparent border-none text-xs font-bold text-slate-700 focus:ring-0 cursor-pointer"
                  >
                    <option value="all">Todas Letras</option>
                    <option value="A">Letra A</option>
                    <option value="B">Letra B</option>
                    <option value="C">Letra C</option>
                    <option value="D">Letra D</option>
                    <option value="E">Letra E</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 px-3">
                  <Filter className="w-4 h-4 text-slate-400" />
                  <select 
                    value={filterDay} 
                    onChange={(e) => setFilterDay(e.target.value)}
                    className="bg-transparent border-none text-xs font-bold text-slate-700 focus:ring-0 cursor-pointer"
                  >
                    <option value="all">Mês Todo</option>
                    {Array.from({length: 31}, (_, i) => (
                      <option key={i+1} value={i+1}>Dia {i+1}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* Compliance Main Chart */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="md:col-span-12 lg:col-span-8 bg-white rounded-[2.5rem] border border-slate-200 p-8 flex flex-col shadow-sm"
              >
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <h3 className="font-black text-xl text-slate-900 tracking-tight">Conformidade de Aplicação</h3>
                    <p className="text-sm text-slate-400">Meta: 3 DDS realizados diariamente (100%)</p>
                  </div>
                  <div className="bg-emerald-50 text-emerald-600 px-4 py-2 rounded-2xl flex flex-col items-center">
                    <span className="text-xs font-black uppercase tracking-widest leading-none mb-1">Impacto Mensal</span>
                    <span className="text-2xl font-black">{currentMonthCompliance}%</span>
                  </div>
                </div>

                <div className="h-[350px] w-full min-h-[350px]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={350}>
                    <BarChart data={complianceData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} 
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}}
                        domain={[0, 100]}
                        width={30}
                      />
                      <Tooltip 
                        cursor={{fill: '#f8fafc'}}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border border-slate-800">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Dia {data.day}</p>
                                <div className="space-y-1">
                                  <p className="text-2xl font-black">{data.percentage}%</p>
                                  <p className="text-[10px] font-bold text-emerald-400">{data.done} de {data.expected} DDS Concluídos</p>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar 
                        dataKey="percentage" 
                        radius={[8, 8, 8, 8]}
                        barSize={20}
                      >
                        {complianceData.map((entry, index) => ( entry.percentage === 100 ? <Cell key={`cell-${index}`} fill="#10b981" /> : entry.percentage >= 50 ? <Cell key={`cell-${index}`} fill="#10b981" /> : <Cell key={`cell-${index}`} fill="#f59e0b" /> ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>

              {/* Info/Stats Column */}
              <div className="md:col-span-12 lg:col-span-4 space-y-6">
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-xl relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-8 opacity-10">
                    <Target className="w-32 h-32" />
                  </div>
                  
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-300 mb-6">Status da Letra</h4>
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center text-3xl font-black">
                      {filterLetter === 'all' ? 'All' : filterLetter}
                    </div>
                    <div>
                        <p className="text-2xl font-black">{currentMonthCompliance}%</p>
                        <p className="text-xs text-slate-400">Eficiência de Segurança</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                      <span className="text-slate-400">Progresso Mensal</span>
                      <span className="text-emerald-400">{currentMonthCompliance}%</span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${currentMonthCompliance}%` }}
                          className="h-full bg-emerald-500 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.5)]"
                        />
                    </div>
                  </div>

                  <div className="mt-8 pt-8 border-t border-slate-800 grid grid-cols-2 gap-4">
                    <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Realizados</p>
                        <p className="text-xl font-black">{complianceData.reduce((a,c) => a+c.done,0)}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Faltantes</p>
                        <p className="text-xl font-black text-rose-500">
                          {Math.max(0, complianceData.reduce((a,c) => a+c.expected,0) - complianceData.reduce((a,c) => a+c.done,0))}
                        </p>
                    </div>
                  </div>
                </motion.div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white rounded-[2rem] border border-slate-200 p-6 shadow-sm">
                      <UsersIcon className="w-5 h-5 text-emerald-600 mb-4" />
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Colaboradores</p>
                      <p className="text-2xl font-black text-slate-900">{stats.totalUsers}</p>
                  </div>
                  <div className="bg-white rounded-[2rem] border border-slate-200 p-6 shadow-sm">
                      <Shield className="w-5 h-5 text-emerald-600 mb-4" />
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Sigs</p>
                      <p className="text-2xl font-black text-slate-900">{stats.totalSignatures}</p>
                  </div>
                </div>
              </div>

              {/* Letter Commitment Monthly Chart */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="md:col-span-12 lg:col-span-12 bg-white rounded-[2.5rem] border border-slate-200 p-8 flex flex-col shadow-sm"
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8">
                  <div>
                    <h3 className="font-black text-xl text-slate-900 tracking-tight">Comprometimento por Letra</h3>
                    <p className="text-sm text-slate-400">Eficiência baseada na escala de trabalho (DDS realizados / Dias trabalhados)</p>
                  </div>
                  <div className="bg-emerald-50 text-emerald-600 px-4 py-2 rounded-2xl flex flex-col items-center min-w-[100px]">
                    <span className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">Média Mensal</span>
                    <span className="text-2xl font-black">{Math.round(letterCommitmentData.reduce((a,c) => a+c.percentage, 0) / 5)}%</span>
                  </div>
                </div>

                <div className="h-[300px] w-full min-h-[300px]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={300}>
                    <BarChart data={letterCommitmentData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                      <XAxis type="number" domain={[0, 100]} hide />
                      <YAxis 
                        dataKey="letter" 
                        type="category"
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fill: '#475569', fontSize: 14, fontWeight: 800}}
                        width={40}
                      />
                      <Tooltip 
                        cursor={{fill: '#f8fafc'}}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border border-slate-800">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Letra {data.letter}</p>
                                <div className="space-y-1">
                                  <p className="text-2xl font-black">{data.percentage}%</p>
                                  <p className="text-[10px] font-bold text-emerald-400/60">Trabalhou {data.daysScheduled} dias no mês</p>
                                  <p className="text-[10px] font-bold text-emerald-400">Realizou {data.daysPerformed} DDS</p>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar 
                        dataKey="percentage" 
                        radius={[0, 8, 8, 0]}
                        barSize={32}
                      >
                        {letterCommitmentData.map((entry, index) => (
                          <Cell 
                            key={`commitment-cell-${index}`} 
                            fill={entry.percentage === 100 ? '#10b981' : entry.percentage >= 80 ? '#6366f1' : '#f59e0b'} 
                            fillOpacity={0.9}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>

              {/* DDS Attendance Matrix */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="md:col-span-12 bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm"
              >
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
                    const shift = `Turno ${shiftNum}` as Shift;
                    const group = getGroupForShift(new Date(), shift);
                    const done = ddsStatus[`${shift}-${group}`];
                    const isCurrent = expectedDuty?.shift === shift;
                    
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
                      >
                        {isCurrent && (
                          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-lg">
                            DDS Agora
                          </div>
                        )}

                        <div className="flex flex-col items-center">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">{shift}</p>
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
                              <><Shield className="w-3 h-3" /> Realizado</>
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
                      {Math.round((Object.keys(ddsStatus).filter(k => {
                        const today = new Date();
                        const sched = getTodayGroups(today);
                        return Object.entries(sched).some(([s, g]) => k === `${s}-${g}`);
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
                        {Object.keys(ddsStatus).filter(k => {
                          const today = new Date();
                          const sched = getTodayGroups(today);
                          return Object.entries(sched).some(([s, g]) => k === `${s}-${g}`);
                        }).length}
                      </p>
                    </div>
                  </div>
                </div>

              </motion.div>
            </div>
          </motion.div>
        ) : activeTab === 'forklifts' ? (
          <motion.div
            key="forklifts"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">Fleet Management Analysis</h2>
                <p className="text-xs text-slate-400 font-bold tracking-widest uppercase">Segurança e disponibbilidade de empilhadeiras</p>
              </div>

              {/* Forklift Filter */}
              <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
                <Calendar className="w-4 h-4 text-slate-400" />
                <select 
                  value={filterMonth} 
                  onChange={(e) => setFilterMonth(parseInt(e.target.value))}
                  className="bg-transparent border-none text-xs font-bold text-slate-700 focus:ring-0 cursor-pointer"
                >
                  {months.map((m, i) => <option key={m} value={i}>{m}</option>)}
                </select>
                <input 
                  type="number" 
                  value={filterYear}
                  onChange={(e) => setFilterYear(parseInt(e.target.value))}
                  className="w-16 bg-transparent border-none text-xs font-bold text-slate-700 focus:ring-0 cursor-pointer"
                />
              </div>
            </div>

            {/* Forklift Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <Truck className="w-6 h-6 text-slate-400" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Frota Total</span>
                </div>
                <p className="text-4xl font-black text-slate-900">{forkliftStats.total}</p>
                <p className="text-xs text-slate-400 mt-1 font-medium">Equipamentos cadastrados</p>
              </div>
              <div className="bg-rose-50 p-8 rounded-[2.5rem] border border-rose-100 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <AlertTriangle className="w-6 h-6 text-rose-500" />
                  <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Bloqueadas</span>
                </div>
                <p className="text-4xl font-black text-rose-600">{forkliftStats.blocked}</p>
                <p className="text-xs text-rose-400 mt-1 font-medium">Impeditivo de segurança</p>
              </div>
              <div className="bg-emerald-50 p-8 rounded-[2.5rem] border border-emerald-100 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <Shield className="w-6 h-6 text-emerald-500" />
                  <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Liberadas</span>
                </div>
                <p className="text-4xl font-black text-emerald-600">{forkliftStats.liberated}</p>
                <p className="text-xs text-emerald-400 mt-1 font-medium">Disponíveis para operação</p>
              </div>
              <div className="bg-slate-900 p-8 rounded-[2.5rem] border border-slate-800 shadow-sm text-white">
                <div className="flex items-center justify-between mb-4">
                  <Activity className="w-6 h-6 text-emerald-400" />
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Check-lists</span>
                </div>
                <p className="text-4xl font-black text-white">{forkliftMetrics.totalChecklists}</p>
                <p className="text-xs text-slate-400 mt-1 font-medium italic">Inspeções no período</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* Inspection Trend Chart */}
              <div className="md:col-span-8 bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <h3 className="font-black text-xl text-slate-900 tracking-tight">Frequência de Inspeção</h3>
                    <p className="text-sm text-slate-400">Total de check-lists realizados diariamente no mês</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-emerald-600">+{forkliftHistory.filter(h => {
                      const d = safeToDate(h.timestamp);
                      const now = new Date();
                      return d && d.getDate() === now.getDate() && d.getMonth() === now.getMonth();
                    }).length}</p>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hoje</p>
                  </div>
                </div>

                <div className="h-[300px] w-full min-h-[300px]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={300}>
                    <AreaChart data={forkliftChartData}>
                      <defs>
                        <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} />
                      <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} />
                      <Tooltip content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-slate-900 text-white p-4 rounded-xl">
                              <p className="text-xs font-black uppercase text-slate-400 mb-1">{data.name}</p>
                              <p className="text-lg font-black">{data.count} Inspeções</p>
                              <p className="text-xs text-rose-400 font-bold">{data.anormal} Não Conformidades</p>
                            </div>
                          );
                        }
                        return null;
                      }} />
                      <Area type="monotone" dataKey="count" stroke="#10b981" fillOpacity={1} fill="url(#colorCount)" strokeWidth={3} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Small Stats Container */}
              <div className="md:col-span-4 space-y-6">
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
                  <div className="w-24 h-24 relative mb-6 shrink-0">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={96}>
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Blocked', value: forkliftStats.blocked },
                            { name: 'Liberated', value: forkliftStats.liberated }
                          ]}
                          cx="50%"
                          cy="50%"
                          innerRadius={35}
                          outerRadius={45}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          <Cell fill="#f43f5e" />
                          <Cell fill="#10b981" />
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                       <span className="text-xl font-black text-slate-900 leading-none">
                         {forkliftStats.total > 0 ? Math.round((forkliftStats.liberated / forkliftStats.total) * 100) : 0}%
                       </span>
                    </div>
                  </div>
                  <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">Disponibilidade da Frota</h4>
                  <p className="text-[10px] text-slate-400 font-medium mt-2">Percentual de equipamentos liberados para uso imediato.</p>
                </div>

                <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-xl text-white">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-rose-500/20 rounded-xl">
                      <AlertTriangle className="w-5 h-5 text-rose-400" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest leading-none mb-1">Criticidade</p>
                      <h4 className="text-xl font-black">N.C. Rate: {forkliftMetrics.nonConformityRate}%</h4>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-4">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${forkliftMetrics.nonConformityRate}%` }}
                      className="h-full bg-rose-500 rounded-full"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium leading-relaxed italic mb-6">
                    Taxa de não conformidade detectada em check-lists neste mês. Monitorar criticidade mecânica.
                  </p>

                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Top Causas de N.C.</p>
                    {ncDistributionData.slice(0, 3).map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-300 truncate max-w-[150px]">{item.name}</span>
                        <span className="text-xs font-black text-rose-400">{item.count}</span>
                      </div>
                    ))}
                    {ncDistributionData.length === 0 && (
                      <p className="text-[10px] text-slate-600 font-medium">Nenhuma falha registrada</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* NEW: NC Distribution Chart */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
               <div className="md:col-span-12 lg:col-span-8 bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col">
                  <div className="flex justify-between items-start mb-8">
                    <div>
                      <h3 className="font-black text-xl text-slate-900 tracking-tight">Distribuição de Não Conformidades</h3>
                      <p className="text-sm text-slate-400">Frequência de falhas por item de segurança e operação</p>
                    </div>
                    <div className="bg-rose-50 px-4 py-2 rounded-2xl">
                       <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Pareto de Falhas</p>
                    </div>
                  </div>

                  <div className="h-[350px] w-full min-h-[350px]">
                    {ncDistributionData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={350}>
                        <BarChart data={ncDistributionData} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                          <XAxis type="number" hide />
                          <YAxis 
                            dataKey="name" 
                            type="category" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{fill: '#475569', fontSize: 10, fontWeight: 800}}
                            width={150}
                          />
                          <Tooltip 
                            cursor={{fill: '#f8fafc'}}
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                return (
                                  <div className="bg-slate-900 text-white p-4 rounded-xl shadow-2xl border border-slate-800">
                                    <p className="text-[10px] font-black uppercase text-slate-400 mb-1">{payload[0].payload.name}</p>
                                    <p className="text-xl font-black">{payload[0].value} Ocorrências</p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar 
                            dataKey="count" 
                            radius={[0, 8, 8, 0]}
                            barSize={32}
                          >
                            {ncDistributionData.map((entry, index) => (
                              <Cell 
                                key={`nc-cell-${index}`} 
                                fill={index === 0 ? '#f43f5e' : index < 3 ? '#fb7185' : '#fda4af'} 
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                        <Shield className="w-12 h-12 mb-4 opacity-20" />
                        <p className="font-bold">Nenhuma falha registrada para o período selecionado</p>
                      </div>
                    )}
                  </div>
               </div>

               {/* NEW: Recent Failures List */}
               <div className="md:col-span-12 lg:col-span-4 bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-3 mb-6">
                    <History className="w-5 h-5 text-slate-900" />
                    <h3 className="font-black text-lg text-slate-900 tracking-tight">Histórico Recente de Falhas</h3>
                  </div>
                  
                  <div className="space-y-4 max-h-[430px] overflow-y-auto pr-2 custom-scrollbar">
                    {forkliftHistory
                      .filter(h => {
                        const d = safeToDate(h.timestamp);
                        return d && d.getMonth() === filterMonth && d.getFullYear() === filterYear && h.status === 'anormal';
                      })
                      .slice(0, 10)
                      .map((h) => (
                        <div key={h.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-slate-900">EMP {h.forkliftNumber}</span>
                            <span className="text-[10px] font-bold text-slate-400">
                              {safeToDate(h.timestamp) ? format(safeToDate(h.timestamp)!, 'dd/MM HH:mm') : '-'}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(h.itemResults || {})
                              .filter(([_, r]: [string, any]) => r.status === 'anormal')
                              .map(([itemId, _]) => {
                                const item = checkItems.find(it => it.id === itemId);
                                return (
                                  <span key={itemId} className="px-2 py-0.5 bg-rose-50 text-rose-600 rounded-lg text-[9px] font-black uppercase">
                                    {item?.name || 'Item NC'}
                                  </span>
                                );
                              })
                            }
                          </div>
                          <p className="text-[10px] text-slate-500 font-medium italic truncate">{h.conductorName}</p>
                        </div>
                      ))
                    }
                    {forkliftHistory.filter(h => {
                      const d = safeToDate(h.timestamp);
                      return d && d.getMonth() === filterMonth && d.getFullYear() === filterYear && h.status === 'anormal';
                    }).length === 0 && (
                      <div className="py-12 text-center">
                        <p className="text-sm font-bold text-slate-400">Nenhuma não conformidade no período</p>
                      </div>
                    )}
                  </div>
               </div>
            </div>
          </motion.div>
        ) : activeTab === 'quality' ? (
          <motion.div
            key="quality"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">Qualidade Analytics</h2>
                <p className="text-xs text-slate-400 font-bold tracking-widest uppercase">Métricas de conformidade e inspeções de qualidade</p>
              </div>

              <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
                <Calendar className="w-4 h-4 text-slate-400" />
                <select 
                  value={filterMonth} 
                  onChange={(e) => setFilterMonth(parseInt(e.target.value))}
                  className="bg-transparent border-none text-xs font-bold text-slate-700 focus:ring-0 cursor-pointer"
                >
                  {months.map((m, i) => <option key={m} value={i}>{m}</option>)}
                </select>
                <input 
                  type="number" 
                  value={filterYear}
                  onChange={(e) => setFilterYear(parseInt(e.target.value))}
                  className="w-16 bg-transparent border-none text-xs font-bold text-slate-700 focus:ring-0 cursor-pointer"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <ClipboardCheck className="w-6 h-6 text-slate-400" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total de Inspeções</span>
                </div>
                <p className="text-4xl font-black text-slate-900">{qualityMetrics.totalSubmissions}</p>
                <p className="text-xs text-slate-400 mt-1 font-medium">No período selecionado</p>
              </div>
              <div className="bg-emerald-50 p-8 rounded-[2.5rem] border border-emerald-100 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <Target className="w-6 h-6 text-emerald-500" />
                  <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Taxa de Conformidade</span>
                </div>
                <p className="text-4xl font-black text-emerald-600">{qualityMetrics.complianceRate}%</p>
                <p className="text-xs text-emerald-400 mt-1 font-medium">Média mensal de conformidade</p>
              </div>
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                 <div className="flex items-center justify-between mb-4">
                   <Clock className="w-6 h-6 text-slate-400" />
                   <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Modelos Ativos</span>
                 </div>
                 <p className="text-4xl font-black text-slate-900">{qualityTemplates.filter(t => t.active).length}</p>
                 <p className="text-xs text-slate-400 mt-1 font-medium">Templates cadastrados</p>
              </div>
              <div className="bg-slate-900 p-8 rounded-[2.5rem] border border-slate-800 shadow-sm text-white">
                <div className="flex items-center justify-between mb-4">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Status Geral</span>
                </div>
                <p className="text-4xl font-black text-white">{qualityMetrics.complianceRate >= 95 ? 'Excelente' : qualityMetrics.complianceRate >= 85 ? 'Bom' : 'Crítico'}</p>
                <p className="text-xs text-slate-400 mt-1 font-medium italic">Baseado na conformidade</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              <div className="md:col-span-8 bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <h3 className="font-black text-xl text-slate-900 tracking-tight mb-8">Tendência Diária de Conformidade</h3>
                <div className="h-[350px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={qualityMetrics.trend}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} 
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}}
                        domain={[0, 100]}
                        width={30}
                      />
                      <Tooltip 
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border border-slate-800">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{payload[0].payload.name}</p>
                                <p className="text-2xl font-black">{payload[0].value}% Conformidade</p>
                                <p className="text-[10px] font-bold text-emerald-400 opacity-60 uppercase">{payload[0].payload.count} Inspeções</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="compliance" 
                        stroke="#10b981" 
                        strokeWidth={4} 
                        dot={{ r: 4, fill: '#10b981', strokeWidth: 0 }}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="md:col-span-4 bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <h3 className="font-black text-xl text-slate-900 tracking-tight mb-8">Top Falhas Detectadas</h3>
                <div className="space-y-6">
                  {qualityMetrics.ncDistribution.length > 0 ? (
                    qualityMetrics.ncDistribution.map((item, idx) => (
                      <div key={idx} className="space-y-2">
                        <div className="flex justify-between text-xs font-black uppercase tracking-widest">
                          <span className="text-slate-600 truncate max-w-[200px]">{item.name}</span>
                          <span className="text-rose-500">{item.count} NCs</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${(item.count / qualityMetrics.ncDistribution[0].count) * 100}%` }}
                            className="h-full bg-rose-400 rounded-full"
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center opacity-40">
                      <Shield className="w-12 h-12 mb-4 text-slate-300" />
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400">Excelente! Sem falhas detectadas</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        ) : activeTab === 'wire' ? (
          <motion.div
            key="wire"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">Dashboard de Arames</h2>
                <p className="text-xs text-slate-400 font-bold tracking-widest uppercase">Visão geral do consumo e estoque de materiais</p>
              </div>

              <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
                <Calendar className="w-4 h-4 text-slate-400" />
                <select 
                  value={filterMonth} 
                  onChange={(e) => setFilterMonth(parseInt(e.target.value))}
                  className="bg-transparent border-none text-xs font-bold text-slate-700 focus:ring-0 cursor-pointer"
                >
                  {months.map((m, i) => <option key={m} value={i}>{m}</option>)}
                </select>
                <input 
                  type="number" 
                  value={filterYear}
                  onChange={(e) => setFilterYear(parseInt(e.target.value))}
                  className="w-16 bg-transparent border-none text-xs font-bold text-slate-700 focus:ring-0 cursor-pointer"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <Scale className="w-6 h-6 text-slate-400" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Recebido</span>
                </div>
                <p className="text-4xl font-black text-slate-900">{wireMetrics.totalWeight.toLocaleString()} kg</p>
                <p className="text-xs text-slate-400 mt-1 font-medium">No período selecionado</p>
              </div>
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <Activity className="w-6 h-6 text-emerald-500" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Consumido</span>
                </div>
                <p className="text-4xl font-black text-emerald-600">{wireMetrics.consumedWeight.toLocaleString()} kg</p>
                <p className="text-xs text-emerald-400 mt-1 font-medium italic">{wireMetrics.consumptionRate}% do recebido</p>
              </div>
              <div className="bg-slate-900 p-8 rounded-[2.5rem] border border-slate-800 shadow-sm text-white">
                <div className="flex items-center justify-between mb-4">
                  <Box className="w-6 h-6 text-emerald-400" />
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Disponível / Em Uso</span>
                </div>
                <p className="text-4xl font-black text-white">{(wireMetrics.totalWeight - wireMetrics.consumedWeight).toLocaleString()} kg</p>
                <p className="text-xs text-slate-400 mt-1 font-medium italic">Saldo atual em fábrica</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <h3 className="font-black text-xl text-slate-900 tracking-tight mb-8">Status da Matéria Prima</h3>
                <div className="flex items-center justify-center p-4">
                  <div className="h-[250px] w-full max-w-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={wireMetrics.statusDist}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {wireMetrics.statusDist.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-col gap-4 ml-8">
                    {wireMetrics.statusDist.map((s: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: s.color }} />
                        <div>
                          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest leading-none">{s.name}</p>
                          <p className="text-lg font-black text-slate-900 leading-tight">{s.value} Coils</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <h3 className="font-black text-xl text-slate-900 tracking-tight mb-8">Consumo por Fornecedor (kg)</h3>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={wireMetrics.supplierData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} 
                      />
                      <YAxis hide />
                      <Tooltip 
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-slate-900 text-white p-4 rounded-xl shadow-2xl border border-slate-800">
                                <p className="text-[10px] font-black uppercase text-slate-400 mb-1">{payload[0].payload.name}</p>
                                <p className="text-xl font-black">{payload[0].value.toLocaleString()} kg</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="value" fill="#6366f1" radius={[8, 8, 8, 8]} barSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </motion.div>
        ) : activeTab === 'operational_routes' ? (
          <motion.div
            key="operational_routes"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">Dashboard de Rota Operacional</h2>
                <p className="text-xs text-slate-400 font-bold tracking-widest uppercase">Análise de vistorias de equipamentos e conformidade fabril</p>
              </div>

              <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
                <Calendar className="w-4 h-4 text-slate-400" />
                <select 
                  value={filterMonth} 
                  onChange={(e) => setFilterMonth(parseInt(e.target.value))}
                  className="bg-transparent border-none text-xs font-bold text-slate-700 focus:ring-0 cursor-pointer"
                >
                  {months.map((m, i) => <option key={m} value={i}>{m}</option>)}
                </select>
                <input 
                  type="number" 
                  value={filterYear}
                  onChange={(e) => setFilterYear(parseInt(e.target.value))}
                  className="w-16 bg-transparent border-none text-xs font-bold text-slate-700 focus:ring-0 cursor-pointer"
                />
              </div>
            </div>

            {/* Three top stats cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <ClipboardCheck className="w-6 h-6 text-slate-400" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rotas Efetuadas</span>
                </div>
                <p className="text-4xl font-black text-slate-900">{routeMetrics.totalSubmissions}</p>
                <p className="text-xs text-slate-400 mt-1 font-medium">No período selecionado</p>
              </div>

              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <Activity className="w-6 h-6 text-emerald-500" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Taxa de Conformidade</span>
                </div>
                <p className="text-4xl font-black text-emerald-600">{routeMetrics.complianceRate}%</p>
                <p className="text-xs text-emerald-400 mt-1 font-medium italic">Componentes classificados como OK</p>
              </div>

              <div className="bg-slate-900 p-8 rounded-[2.5rem] border border-slate-800 shadow-sm text-white">
                <div className="flex items-center justify-between mb-4">
                  <AlertTriangle className="w-6 h-6 text-amber-400" />
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Incidentes / Desvios</span>
                </div>
                <p className="text-4xl font-black text-white">
                  {routeMetrics.failedEquipmentList.reduce((acc, curr) => acc + curr.count, 0)}
                </p>
                <p className="text-xs text-slate-400 mt-1 font-medium italic">Anomalias identificadas</p>
              </div>
            </div>

            {/* Charts & Failures list */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8 bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col">
                <div className="mb-6">
                  <h3 className="font-black text-xl text-slate-900 tracking-tight">Taxa de Conformidade no Período (%)</h3>
                  <p className="text-xs text-slate-400">Evolução diária da conformidade de rota</p>
                </div>
                <div className="h-[300px] w-full">
                  {routeMetrics.dailyTrend.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={routeMetrics.dailyTrend}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="Day" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} 
                        />
                        <YAxis 
                          domain={[0, 100]} 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} 
                        />
                        <Tooltip 
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              return (
                                <div className="bg-slate-900 text-white p-4 rounded-xl shadow-2xl border border-slate-800">
                                  <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Dia {payload[0].payload.Day}</p>
                                  <p className="text-xl font-black">{payload[0].value}% Conformidade</p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="Conformidade" 
                          stroke="#10b981" 
                          strokeWidth={4} 
                          dot={{ r: 4, fill: '#10b981', strokeWidth: 0 }}
                          activeDot={{ r: 6, strokeWidth: 0 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                      <History className="w-12 h-12 mb-4 text-slate-300" />
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400">Nenhuma vistoria no período selecionado</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="lg:col-span-4 bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col">
                <div className="mb-6">
                  <h3 className="font-black text-xl text-slate-900 tracking-tight">Equipamentos Críticos</h3>
                  <p className="text-xs text-slate-400 font-medium">Top componentes com mais não conformidades</p>
                </div>
                <div className="space-y-4 flex-1 overflow-y-auto w-full">
                  {routeMetrics.failedEquipmentList.length > 0 ? (
                    routeMetrics.failedEquipmentList.map((item, idx) => (
                      <div key={idx} className="space-y-2">
                        <div className="flex justify-between text-xs font-black uppercase tracking-widest">
                          <span className="text-slate-600 truncate max-w-[200px]">{item.name}</span>
                          <span className="text-rose-500">{item.count} falhas</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${(item.count / routeMetrics.failedEquipmentList[0].count) * 100}%` }}
                            className="h-full bg-rose-400 rounded-full"
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="h-[250px] flex flex-col items-center justify-center text-center opacity-40 py-12">
                      <CheckCircle2 className="w-12 h-12 mb-4 text-emerald-400" />
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400">Tudo OK! Sem falhas relatadas</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Audit Logs section */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
              <div className="mb-6">
                <h3 className="font-black text-xl text-slate-900 tracking-tight">Histórico Recente de Inspeções</h3>
                <p className="text-xs text-slate-400">Últimas rotas operacionais submetidas neste período</p>
              </div>

              <div className="overflow-x-auto">
                {routeMetrics.latestSubmissions.length > 0 ? (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        <th className="pb-4">Data/Hora</th>
                        <th className="pb-4">Modelo de Rota</th>
                        <th className="pb-4">Operador</th>
                        <th className="pb-4 text-center">Itens OK</th>
                        <th className="pb-4 text-center">Itens NC</th>
                        <th className="pb-4 text-right">Status Geral</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-sm">
                      {routeMetrics.latestSubmissions.map((sub) => {
                        const date = safeToDate(sub.createdAt);
                        const totalResponses = sub.responses?.length || 0;
                        const notOkCount = sub.responses?.filter((r: any) => r.status === 'not_ok').length || 0;
                        const okCount = totalResponses - notOkCount;
                        return (
                          <tr key={sub.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-4 font-semibold text-slate-700">
                              {date ? date.toLocaleString('pt-BR') : '---'}
                            </td>
                            <td className="py-4 font-black text-slate-900 truncate max-w-[200px]">{sub.templateName}</td>
                            <td className="py-4 font-semibold text-slate-600">{sub.operatorName}</td>
                            <td className="py-4 text-center font-bold text-emerald-600">{okCount}</td>
                            <td className="py-4 text-center font-bold text-rose-500">{notOkCount}</td>
                            <td className="py-4 text-right">
                              <span className={cn(
                                "px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                                notOkCount > 0 ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"
                              )}>
                                {notOkCount > 0 ? 'Com Desvios' : 'Conforme'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-center py-12 opacity-40">
                    <History className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">Nenhum registro encontrado no período</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ) : activeTab === 'safety_observations' ? (
          <motion.div
            key="safety_observations"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">Dashboard de Observações de Segurança</h2>
                <p className="text-xs text-slate-400 font-bold tracking-widest uppercase">Análise de desvios comportamentais, condições inseguras e frentes de segurança fabril</p>
              </div>

              <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
                <Calendar className="w-4 h-4 text-slate-400" />
                <select 
                  value={filterMonth} 
                  onChange={(e) => setFilterMonth(parseInt(e.target.value))}
                  className="bg-transparent border-none text-xs font-bold text-slate-700 focus:ring-0 cursor-pointer"
                >
                  {months.map((m, i) => <option key={m} value={i}>{m}</option>)}
                </select>
                <input 
                  type="number" 
                  value={filterYear}
                  onChange={(e) => setFilterYear(parseInt(e.target.value))}
                  className="w-16 bg-transparent border-none text-xs font-bold text-slate-700 focus:ring-0 cursor-pointer"
                />
              </div>
            </div>

            {/* Top Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <ShieldAlert className="w-6 h-6 text-indigo-500" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Registrado</span>
                </div>
                <p className="text-3xl font-black text-slate-900">{safetyMetrics.total}</p>
                <p className="text-xs text-slate-400 mt-1 font-medium">Observações no período</p>
              </div>

              <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Comportamentos Seguros</span>
                </div>
                <p className="text-3xl font-black text-emerald-600">{safetyMetrics.safeCount}</p>
                <p className="text-xs text-emerald-400 mt-1 font-medium">{safetyMetrics.safetyCompliance}% de conformidade</p>
              </div>

              <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <AlertTriangle className="w-6 h-6 text-rose-500" />
                  <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Desvios Registrados</span>
                </div>
                <p className="text-3xl font-black text-rose-600">{safetyMetrics.riskCount}</p>
                <p className="text-xs text-slate-400 mt-1 font-medium">Condições inseguras / desvios</p>
              </div>

              <div className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800 shadow-sm text-white">
                <div className="flex items-center justify-between mb-3">
                  <Clock className="w-6 h-6 text-sky-400" />
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Pendentes de Tratativa</span>
                </div>
                <p className="text-3xl font-black text-sky-450">{safetyMetrics.pending}</p>
                <p className="text-xs text-slate-400 mt-1 font-medium italic">{safetyMetrics.resolved} resolvidas, {safetyMetrics.working} em andamento</p>
              </div>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Daily Trend Chart */}
              <div className="lg:col-span-8 bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col">
                <div className="mb-6">
                  <h3 className="font-black text-xl text-slate-900 tracking-tight">Evolução de Atividades de Segurança</h3>
                  <p className="text-xs text-slate-400 font-medium">Registros e desvios ao longo dos dias do mês</p>
                </div>
                <div className="h-[300px] w-full">
                  {safetyMetrics.dailyTrend.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={safetyMetrics.dailyTrend}>
                        <defs>
                          <linearGradient id="colorRegistros" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorDesvios" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="Day" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} 
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} 
                        />
                        <Tooltip 
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              return (
                                <div className="bg-slate-900 text-white p-4 rounded-xl shadow-2xl border border-slate-800 space-y-1">
                                  <p className="text-[10px] font-black uppercase text-slate-400">Dia {payload[0].payload.Day}</p>
                                  {payload.map((p: any, idx: number) => (
                                    <p key={idx} className="text-xs font-bold text-slate-200">
                                      {p.name}: {p.value}
                                    </p>
                                  ))}
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="Registros" 
                          stroke="#6366f1" 
                          strokeWidth={3}
                          fillOpacity={1} 
                          fill="url(#colorRegistros)" 
                        />
                        <Area 
                          type="monotone" 
                          dataKey="Desvios" 
                          stroke="#f43f5e" 
                          strokeWidth={3}
                          fillOpacity={1} 
                          fill="url(#colorDesvios)" 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                      <History className="w-12 h-12 mb-4 text-slate-300" />
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400">Nenhum registro de segurança no período selecionado</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Severity distribution */}
              <div className="lg:col-span-4 bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col">
                <div className="mb-6">
                  <h3 className="font-black text-xl text-slate-900 tracking-tight">Distribuição de Gravidade</h3>
                  <p className="text-xs text-slate-400 font-medium font-semibold">Níveis de perigo identificados em desvios</p>
                </div>
                
                {safetyMetrics.severityDist.length > 0 ? (
                  <div className="flex flex-col items-center justify-center flex-1">
                    <div className="h-[150px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={safetyMetrics.severityDist}
                            cx="50%"
                            cy="50%"
                            innerRadius={45}
                            outerRadius={65}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {safetyMetrics.severityDist.map((entry: any, index: number) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="w-full space-y-2 mt-4 text-xs font-bold text-slate-700">
                      {safetyMetrics.severityDist.map((s, idx) => (
                        <div key={idx} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                            <span>{s.name}</span>
                          </div>
                          <span>{s.value} ({Math.round((s.value / safetyMetrics.riskCount) * 100)}%)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center opacity-40 py-8">
                    <CheckCircle2 className="w-12 h-12 mb-4 text-emerald-400" />
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">Excelente! Sem desvios reportados hoje</p>
                  </div>
                )}
              </div>
            </div>

            {/* Plant Areas and Recent Records */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Plant Areas */}
              <div className="lg:col-span-4 bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col">
                <div className="mb-6">
                  <h3 className="font-black text-xl text-slate-900 tracking-tight">Desvios por Área</h3>
                  <p className="text-xs text-slate-400 font-medium">As frentes industriais com maior número de alertas</p>
                </div>

                <div className="space-y-4 flex-1 overflow-y-auto">
                  {safetyMetrics.topAreas.length > 0 ? (
                    safetyMetrics.topAreas.map((item, idx) => (
                      <div key={idx} className="space-y-2">
                        <div className="flex justify-between text-xs font-black uppercase tracking-widest">
                          <span className="text-slate-600 truncate max-w-[200px]">{item.name}</span>
                          <span className="text-slate-800">{item.count} observações</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${(item.count / safetyMetrics.topAreas[0].count) * 100}%` }}
                            className="h-full bg-indigo-500 rounded-full"
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="h-[200px] flex flex-col items-center justify-center text-center opacity-40">
                      <ShieldAlert className="w-12 h-12 mb-4 text-slate-300" />
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400 font-semibold">Sem áreas reportadas</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Recent Records Log */}
              <div className="lg:col-span-8 bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <div className="mb-6">
                  <h3 className="font-black text-xl text-slate-900 tracking-tight">Histórico Recente de Segurança</h3>
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest">Últimas avaliações e desvios comportamentais catalogados</p>
                </div>

                <div className="overflow-x-auto">
                  {safetyMetrics.latestObservations.length > 0 ? (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">
                          <th className="pb-4">Data/Hora</th>
                          <th className="pb-4">Observador / Colaborador</th>
                          <th className="pb-4">Área Relatada</th>
                          <th className="pb-4">Avaliação</th>
                          <th className="pb-4">Gravidade</th>
                          <th className="pb-4 text-right">Fase / Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 text-xs text-slate-600 font-semibold">
                        {safetyMetrics.latestObservations.map((obs) => {
                          const date = safeToDate(obs.createdAt);
                          return (
                            <tr key={obs.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="py-4 whitespace-nowrap text-slate-500">
                                {date ? date.toLocaleString('pt-BR') : '---'}
                              </td>
                              <td className="py-4">
                                <div className="font-bold text-slate-900 truncate max-w-[150px]">
                                  {obs.observerName || obs.reportedBy || 'Anônimo'}
                                </div>
                                <span className="text-[10px] text-slate-400">{obs.observerMatricula ? `Mat: ${obs.observerMatricula}` : 'Auto-registro'}</span>
                              </td>
                              <td className="py-4 font-bold text-slate-800">
                                {obs.observedArea || obs.observerArea || 'N/A'}
                              </td>
                              <td className="py-4">
                                <span className={cn(
                                  "px-2 py-0.5 rounded text-[10px] uppercase font-black",
                                  obs.isSafe === 'seguro' ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                                )}>
                                  {obs.isSafe === 'seguro' ? 'Seguro' : 'Desvio'}
                                </span>
                              </td>
                              <td className="py-4">
                                <span className={cn(
                                  "px-2 py-0.5 rounded text-[10px] uppercase font-black",
                                  obs.severity === 'high' ? "bg-rose-100 text-rose-800" :
                                  obs.severity === 'medium' ? "bg-amber-100 text-amber-800" :
                                  "bg-sky-100 text-sky-800"
                                )}>
                                  {obs.severity === 'high' ? 'Alta' :
                                   obs.severity === 'medium' ? 'Média' :
                                   'Baixa'}
                                </span>
                              </td>
                              <td className="py-4 text-right">
                                <span className={cn(
                                  "px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                                  obs.status === 'resolved' ? "bg-emerald-100 text-emerald-800" :
                                  obs.status === 'working' ? "bg-indigo-100 text-indigo-800" :
                                  "bg-amber-100 text-amber-800"
                                )}>
                                  {obs.status === 'resolved' ? 'Resolvido' :
                                   obs.status === 'working' ? 'Em Acompanhamento' :
                                   'Pendente'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <div className="text-center py-12 opacity-40">
                      <History className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400 font-bold">Nenhuma observação de segurança listada</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="consumables"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">Dashboard de Controle de Insumos</h2>
                <p className="text-xs text-slate-400 font-bold tracking-widest uppercase">Métricas de consumo de tintas, pesos e balanços em estoque</p>
              </div>

              <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-black text-slate-700">Visão Geral Setorizada</span>
              </div>
            </div>

            {/* Top Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <Box className="w-6 h-6 text-emerald-500" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Insumos Registrados</span>
                </div>
                <p className="text-3xl font-black text-slate-900">{consumableItems.length}</p>
                <p className="text-xs text-slate-400 mt-1 font-medium">Cadastrados ativos e inativos</p>
              </div>

              <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <AlertTriangle className="w-6 h-6 text-amber-500" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-amber-700">Abaixo do Mínimo</span>
                </div>
                <p className="text-3xl font-black text-slate-900">
                  {consumableItems.filter(i => i.active && i.currentStock < (i.minStock || 0)).length}
                </p>
                <p className="text-xs text-slate-400 mt-1 font-medium">Necessitam de reabastecimento</p>
              </div>

              <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <TrendingUp className="w-6 h-6 text-emerald-500" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Entradas Registradas</span>
                </div>
                <p className="text-3xl font-black text-emerald-600">
                  {consumableLogs.filter(l => l.type === 'entry').length}
                </p>
                <p className="text-xs text-slate-400 mt-1 font-medium">Lotes de abastecimento total</p>
              </div>

              <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <Activity className="w-6 h-6 text-rose-500" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-rose-700">Consumos Totais</span>
                </div>
                <p className="text-3xl font-black text-rose-600">
                  {consumableLogs.filter(l => l.type === 'consumption').length}
                </p>
                <p className="text-xs text-slate-400 mt-1 font-medium">Deduções de estoque registradas</p>
              </div>
            </div>

            {/* Detailed tables and visuals for dashboard */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left visual graph of inputs volume */}
              <div className="lg:col-span-8 bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <div className="mb-6">
                  <h3 className="font-black text-xl text-slate-900 tracking-tight">Gráfico Geral de Insumos</h3>
                  <p className="text-xs text-slate-400 font-medium">Diferencial entre estoque estipulado mínimo e estoque atual</p>
                </div>
                <div className="h-80 w-full text-xs">
                  {consumableItems.length === 0 ? (
                    <div className="h-full flex items-center justify-center opacity-40 font-bold">Nenhum insumo para gerar gráfico</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={consumableItems.filter(i => i.active).slice(0, 15).map(item => ({
                          name: item.name,
                          Estoque: item.currentStock || 0,
                          Mínimo: item.minStock || 0
                        }))}
                        margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} />
                        <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
                        <Tooltip contentStyle={{ borderRadius: '1rem' }} />
                        <Bar dataKey="Estoque" fill="#10b981" radius={[4, 4, 0, 0]} barSize={26} />
                        <Bar dataKey="Mínimo" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={26} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Right panel: low items alerts */}
              <div className="lg:col-span-4 bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="font-black text-xl text-slate-900 tracking-tight mb-4">Críticos & Alertas</h3>
                  <div className="space-y-3">
                    {consumableItems.filter(i => i.active && i.currentStock < i.minStock).slice(0, 5).map(item => (
                      <div key={item.id} className="p-3 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-between text-xs font-semibold">
                        <div>
                          <p className="font-extrabold text-slate-950">{item.name}</p>
                          <p className="text-[10px] text-amber-700">Mínimo: {item.minStock} {item.unit}</p>
                        </div>
                        <span className="font-black bg-white px-2 py-1 rounded-lg border border-amber-200 text-amber-800">
                          {item.currentStock} {item.unit}
                        </span>
                      </div>
                    ))}
                    {consumableItems.filter(i => i.active && i.currentStock < (i.minStock || 0)).length === 0 && (
                      <div className="text-center py-10 opacity-40">
                        <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                        <p className="text-[11px] font-black uppercase text-slate-500">Tudo sob controle!</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Dashboard;
