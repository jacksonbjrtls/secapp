import React, { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot, query, where, Timestamp, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { MASTER_EMAILS } from '../constants';
import { safeToDate, cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/errorHandler';
import { getCurrentShift, getGroupForShift, getTodayGroups, Shift, Group } from '../lib/scaleUtils';
import { 
  Activity, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  TrendingUp, 
  Database,
  Truck, 
  Zap, 
  ClipboardCheck, 
  User, 
  Award,
  Circle,
  BarChart,
  Grid,
  Barcode,
  RefreshCw,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const Overview: React.FC = () => {
  const { isManager, isAdmin } = useAuth();
  
  // Real-time collections state
  const [users, setUsers] = useState<any[]>([]);
  const [ddsSessions, setDdsSessions] = useState<any[]>([]);
  const [ddsSignatures, setDdsSignatures] = useState<any[]>([]);
  const [forklifts, setForklifts] = useState<any[]>([]);
  const [forkliftChecklists, setForkliftChecklists] = useState<any[]>([]);
  const [forkliftCheckItems, setForkliftCheckItems] = useState<any[]>([]);
  const [qualitySubmissions, setQualitySubmissions] = useState<any[]>([]);
  const [qualityTemplates, setQualityTemplates] = useState<any[]>([]);
  const [qualitySectors, setQualitySectors] = useState<any[]>([]);
  const [qualityOptionSets, setQualityOptionSets] = useState<any[]>([]);
  const [wireBatches, setWireBatches] = useState<any[]>([]);
  const [wireCoils, setWireCoils] = useState<any[]>([]);
  const [lines, setLines] = useState<any[]>([]);
  const [qualityOmissions, setQualityOmissions] = useState<any[]>([]);
  const [routeSubmissions, setRouteSubmissions] = useState<any[]>([]);
  const [safetyObservations, setSafetyObservations] = useState<any[]>([]);
  const [consumableItems, setConsumableItems] = useState<any[]>([]);
  const [consumableLogs, setConsumableLogs] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

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
  });

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
      console.error('Error listening to modules configuration in Overview:', error);
    });
    return () => unsubModules();
  }, []);

  // Clock tick to keep current shift real-time
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Set up all real-time subscriptions
  useEffect(() => {
    // Current day boundaries 
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const filtered = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() as any }))
        .filter(user => {
          const userEmail = user.email?.toLowerCase().trim() || '';
          return !MASTER_EMAILS.includes(userEmail);
        });
      setUsers(filtered);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'users');
    });

    const unsubSessions = onSnapshot(collection(db, 'dds_sessions'), (snap) => {
      setDdsSessions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'dds_sessions');
    });

    const unsubSignatures = onSnapshot(collection(db, 'dds_signatures'), (snap) => {
      setDdsSignatures(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'dds_signatures');
    });

    const unsubForklifts = onSnapshot(collection(db, 'forklifts'), (snap) => {
      setForklifts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'forklifts');
    });

    const unsubForkChecklists = onSnapshot(collection(db, 'forklift_checklists'), (snap) => {
      setForkliftChecklists(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'forklift_checklists');
    });

    const unsubForkCheckItems = onSnapshot(collection(db, 'forklift_check_items'), (snap) => {
      setForkliftCheckItems(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'forklift_check_items');
    });

    const unsubQualSub = onSnapshot(collection(db, 'quality_checklist_submissions'), (snap) => {
      setQualitySubmissions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'quality_checklist_submissions');
    });

    const unsubOm = onSnapshot(collection(db, 'quality_checklist_omissions'), (snap) => {
      setQualityOmissions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'quality_checklist_omissions');
    });

    const unsubQualTemplates = onSnapshot(collection(db, 'quality_checklist_templates'), (snap) => {
      setQualityTemplates(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'quality_checklist_templates');
    });

    const unsubQualSecs = onSnapshot(collection(db, 'quality_sectors'), (snap) => {
      setQualitySectors(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'quality_sectors');
    });

    const unsubOptionSets = onSnapshot(collection(db, 'quality_checklist_options'), (snap) => {
      setQualityOptionSets(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'quality_checklist_options');
    });

    const unsubBatches = onSnapshot(collection(db, 'wire_batches'), (snap) => {
      setWireBatches(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'wire_batches');
    });

    const unsubCoils = onSnapshot(collection(db, 'wire_coils'), (snap) => {
      setWireCoils(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'wire_coils');
    });

    const unsubLines = onSnapshot(collection(db, 'production_lines'), (snap) => {
      setLines(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'production_lines');
    });

    const unsubRoutes = onSnapshot(collection(db, 'route_submissions'), (snap) => {
      setRouteSubmissions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'route_submissions');
    });

    const unsubSafetyObs = onSnapshot(collection(db, 'safety_observations'), (snap) => {
      setSafetyObservations(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'safety_observations');
    });

    const unsubConsumableItems = onSnapshot(collection(db, 'consumable_items'), (snap) => {
      setConsumableItems(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'consumable_items');
    });

    const unsubConsumableLogs = onSnapshot(collection(db, 'consumable_logs'), (snap) => {
      setConsumableLogs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'consumable_logs');
    });

    setLoading(false);
    setLastUpdated(new Date());

    return () => {
      unsubUsers();
      unsubSessions();
      unsubSignatures();
      unsubForklifts();
      unsubForkChecklists();
      unsubForkCheckItems();
      unsubQualSub();
      unsubOm();
      unsubQualTemplates();
      unsubQualSecs();
      unsubOptionSets();
      unsubBatches();
      unsubCoils();
      unsubLines();
      unsubRoutes();
      unsubSafetyObs();
      unsubConsumableItems();
      unsubConsumableLogs();
    };
  }, []);

  // Active dates filtering
  const todayStart = useMemo(() => {
    const d = new Date(currentTime);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [currentTime]);

  const todayEnd = useMemo(() => {
    const d = new Date(currentTime);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [currentTime]);

  // Daily Scale Details
  const activeShift = useMemo(() => getCurrentShift(), [currentTime]);
  const activeGroups = useMemo(() => getTodayGroups(currentTime), [currentTime]);

  // 1. DDS Today's Compliance Data
  const ddsTodayStats = useMemo(() => {
    // Expected shifts configuration
    const shifts: Shift[] = ['Turno 1', 'Turno 2', 'Turno 3'];
    
    // Check sessions created today
    const sessionsToday = ddsSessions.filter(s => {
      const created = safeToDate(s.createdAt);
      return created && created >= todayStart && created <= todayEnd;
    });

    const shiftStatus = shifts.map(shift => {
      const expectedGroup = activeGroups[shift];
      const matchingSession = sessionsToday.find(s => s.shift === shift && s.group === expectedGroup);
      
      const signaturesCount = matchingSession 
        ? ddsSignatures.filter(sig => sig.sessionId === matchingSession.id).length 
        : 0;

      return {
        shift,
        group: expectedGroup,
        applied: !!matchingSession,
        theme: matchingSession?.title || matchingSession?.theme || '---',
        instructor: matchingSession?.instructorName || '---',
        signatures: signaturesCount,
        sessionId: matchingSession?.id || null,
        time: matchingSession?.createdAt ? safeToDate(matchingSession.createdAt)?.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : null
      };
    });

    const totalApplied = shiftStatus.filter(s => s.applied).length;
    const totalSignaturesCount = shiftStatus.reduce((acc, curr) => acc + curr.signatures, 0);

    return {
      shiftStatus,
      totalApplied,
      totalExpected: 3,
      totalSignaturesToday: totalSignaturesCount
    };
  }, [ddsSessions, ddsSignatures, activeGroups, todayStart, todayEnd]);

  // 2. Wire Control Summary (Movimentos de Hoje)
  const wireTodayStats = useMemo(() => {
    // Coils received today
    const receivedTodayVal = wireCoils.filter(c => {
      const rec = safeToDate(c.receivedAt);
      return rec && rec >= todayStart && rec <= todayEnd;
    });

    // Coils consumed today
    const consumedTodayVal = wireCoils.filter(c => {
      const cons = safeToDate(c.consumedAt);
      return cons && cons >= todayStart && cons <= todayEnd;
    });

    const totalWeightReceived = receivedTodayVal.reduce((acc, c) => acc + (c.weight || 0), 0);
    const totalWeightConsumed = consumedTodayVal.reduce((acc, c) => acc + (c.weight || 0), 0);

    // Latest consumption actions today (realtime logs)
    const logs = consumedTodayVal.map(c => {
      const lineObj = lines.find(l => l.id === c.currentLineId);
      return {
        id: c.id,
        coilNumber: c.coilNumber,
        diameter: c.diameter,
        weight: c.weight,
        line: lineObj?.name || '---',
        operator: c.consumedBy || 'Sistema',
        shift: c.consumedShift || '?',
        time: c.consumedAt ? safeToDate(c.consumedAt)?.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '---'
      };
    }).sort((a, b) => b.time.localeCompare(a.time));

    // Latest batch inputs registered today
    const newBatchesToday = wireBatches.filter(b => {
      const created = safeToDate(b.createdAt);
      return created && created >= todayStart && created <= todayEnd;
    });

    return {
      receivedCount: receivedTodayVal.length,
      receivedWeight: totalWeightReceived,
      consumedCount: consumedTodayVal.length,
      consumedWeight: totalWeightConsumed,
      recentConsumptions: logs.slice(0, 5),
      batchesToday: newBatchesToday
    };
  }, [wireCoils, wireBatches, lines, todayStart, todayEnd]);

  // Consumables Stats
  const consumablesStats = useMemo(() => {
    const activeList = consumableItems.filter(i => i.active !== false);
    const lowStockList = activeList.filter(i => i.currentStock < (i.minStock || 0));
    
    // Logs processed today
    const logsToday = consumableLogs.filter(log => {
      let tDate: Date | null = null;
      if (log.timestamp) {
        tDate = log.timestamp.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
      }
      return tDate && tDate >= todayStart && tDate <= todayEnd;
    });

    const totalEntriesCount = logsToday.filter(l => l.type === 'entry').length;
    const totalConsumptionsCount = logsToday.filter(l => l.type === 'consumption').length;

    return {
      activeCount: activeList.length,
      lowStockCount: lowStockList.length,
      lowStockItems: lowStockList.slice(0, 3),
      totalEntriesCount,
      totalConsumptionsCount,
      logsTodayCount: logsToday.length
    };
  }, [consumableItems, consumableLogs, todayStart, todayEnd]);

  // 3. Quality Inspections Summary today
  const qualityTodayStats = useMemo(() => {
    // Qualitysubmissions done today
    const subsToday = qualitySubmissions.filter(sub => {
      const created = safeToDate(sub.createdAt);
      return created && created >= todayStart && created <= todayEnd;
    });

    // Quality omissions for today (by actual event target date, NOT the creation date of the justification)
    const todayYmd = todayStart.toISOString().split('T')[0];
    const omiToday = qualityOmissions.filter(om => {
      return om.date === todayYmd;
    });

    const isResponseCompliant = (itemId: string, value: any, template: any) => {
      const item = template?.items?.find((i: any) => i.id === itemId);
      if (!item) return true;

      const valStr = String(value).toUpperCase().trim();

      if (item.type === 'condition') {
        if (item.conditionOptionsId) {
          const optionSet = qualityOptionSets.find(os => os.id === item.conditionOptionsId);
          if (optionSet && optionSet.options && optionSet.options.length > 0) {
            // Index 0 in options is ALWAYS the compliant option (e.g., "OK", "CONFORME", etc.)
            // Any other option selected is a non-conformity!
            return String(value) === String(optionSet.options[0]);
          }
        }
        if (valStr === 'NOT_OK' || valStr === 'NÃO OK' || valStr === 'NAO OK' || valStr === 'NOK' || valStr === 'REJEITADO' || valStr === 'FALHA') {
          return false;
        }
        if (valStr.includes('NÃO') || valStr.includes('NAO') || valStr.includes('NOT')) {
          return false;
        }
      }
      if (item.type === 'range') {
        if (valStr === 'LOW' || valStr === 'HIGH' || valStr === 'BAIXO' || valStr === 'ALTO') {
          return false;
        }
      }
      if (item.type === 'number') {
        const numValue = Number(value);
        if (!isNaN(numValue)) {
          if (item.min !== undefined && numValue < item.min) return false;
          if (item.max !== undefined && numValue > item.max) return false;
        }
      }
      return true;
    };

    // Extract conformities status:
    // How many answers are not compliant
    let totalNonConformities = 0;
    const itemsWithFailure: any[] = [];

    subsToday.forEach(sub => {
      const template = qualityTemplates.find(t => t.id === sub.templateId);
      const sector = qualitySectors.find(s => s.id === sub.sectorId);
      const lineObj = lines.find(l => l.id === sub.lineId);
      
      let subFails = 0;
      sub.responses?.forEach((r: any) => {
        const compliant = isResponseCompliant(r.itemId, r.value, template);
        if (!compliant) {
          totalNonConformities++;
          subFails++;
        }
      });

      if (subFails > 0) {
        itemsWithFailure.push({
          id: sub.id,
          templateName: template?.name || 'Inspeção de Qualidade',
          sector: sector?.name || 'N/A',
          lineName: lineObj?.name || 'N/A',
          operator: sub.userName,
          shift: sub.shift,
          time: safeToDate(sub.createdAt)?.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}),
          failuresCount: subFails
        });
      }
    });

    // Calculate done and pending checklists for today
    let doneCalculated = 0;
    let pendingCalculated = 0;
    const activeTemplates = qualityTemplates.filter(t => t.active);
    const shifts: Shift[] = ['Turno 1', 'Turno 2', 'Turno 3'];

    shifts.forEach(s => {
      const groupToWork = getGroupForShift(todayStart, s);
      const shiftIdentifier = `${groupToWork} - ${s}`;

      activeTemplates.forEach(template => {
        const lineIds = template.sectorId === 'all'
          ? lines.map(l => l.id)
          : qualitySectors.find(sec => sec.id === template.sectorId)?.lineIds || [];

        lineIds.forEach(lineId => {
          const lineObj = lines.find(l => l.id === lineId);
          if (!lineObj) return;

          const reqCount = template.frequencyPerShift || 1;
          const actualCount = subsToday.filter(sub => 
            sub.templateId === template.id && 
            sub.lineId === lineId && 
            sub.shift === shiftIdentifier
          ).length;

          doneCalculated += Math.min(actualCount, reqCount);
          pendingCalculated += Math.max(0, reqCount - actualCount);
        });
      });
    });

    return {
      totalInspectionsToday: subsToday.length,
      doneCount: doneCalculated,
      pendingCount: pendingCalculated,
      omissionsCount: omiToday.length,
      nonConformitiesCount: totalNonConformities,
      recentSubmissions: subsToday.map(sub => {
        const temp = qualityTemplates.find(t => t.id === sub.templateId);
        const lineObj = lines.find(l => l.id === sub.lineId);
        return {
          id: sub.id,
          templateName: temp?.name || 'Inspeção',
          line: lineObj?.name || '---',
          operator: sub.userName,
          shift: sub.shift,
          time: safeToDate(sub.createdAt)?.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})
        };
      }).sort((a,b) => b.time.localeCompare(a.time)).slice(0, 5),
      failingSubmissions: itemsWithFailure
    };
  }, [qualitySubmissions, qualityOmissions, qualityTemplates, qualitySectors, lines, qualityOptionSets, todayStart, todayEnd]);

  // 4. Forklift Inspections Summary today
  const forkliftTodayStats = useMemo(() => {
    // Checklists completed today
    const checksToday = forkliftChecklists.filter(c => {
      const dateVal = safeToDate(c.timestamp);
      return dateVal && dateVal >= todayStart && dateVal <= todayEnd;
    });

    // For all registered forklifts, find their inspection result for today
    const reports = forklifts.map(f => {
      const todayChecks = checksToday.filter(c => c.forkliftId === f.id || String(c.forkliftNumber) === String(f.number));
      const lastCheck = todayChecks.length > 0 ? todayChecks[todayChecks.length - 1] : null;

      const anomalies: string[] = [];
      if (lastCheck && lastCheck.itemResults) {
        Object.entries(lastCheck.itemResults).forEach(([itemId, res]: [string, any]) => {
          if (res && res.status === 'anormal') {
            const item = forkliftCheckItems.find(i => i.id === itemId);
            anomalies.push(item?.name || 'Não conformidade');
          }
        });
      }

      return {
        id: f.id,
        number: f.number,
        model: f.model || 'Padrão',
        plate: f.plate || '---',
        inspected: !!lastCheck,
        status: f.status === 'bloqueada'
          ? 'bloqueada'
          : lastCheck
          ? 'liberada'
          : 'sem_inspecao',
        operator: lastCheck?.conductorName || lastCheck?.operatorName || '---',
        time: lastCheck?.timestamp ? safeToDate(lastCheck.timestamp)?.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '---',
        anomalies: anomalies
      };
    });

    const inspectedCount = reports.filter(r => r.inspected).length;
    const blockedCount = reports.filter(r => r.status === 'bloqueada').length;
    const warningAnomaliesCount = reports.reduce((acc, r) => acc + r.anomalies.length, 0);

    return {
      reports,
      totalForklifts: forklifts.length,
      inspectedCount,
      blockedCount,
      warningAnomaliesCount
    };
  }, [forklifts, forkliftChecklists, forkliftCheckItems, todayStart, todayEnd]);

  // 4. Operational Routes Summary (Rotas de Hoje)
  const routeTodayStats = useMemo(() => {
    const todayRoutes = routeSubmissions.filter(sub => {
      const created = safeToDate(sub.createdAt);
      return created && created >= todayStart && created <= todayEnd;
    });

    const anomaliesCount = todayRoutes.reduce((acc, sub) => {
      const fails = sub.responses.filter((r: any) => r.status === 'not_ok').length;
      return acc + fails;
    }, 0);

    return {
      totalSubmissionsToday: todayRoutes.length,
      anomaliesCount,
      recentRoutesToday: todayRoutes.map(r => {
        const timestamp = safeToDate(r.createdAt);
        return {
          id: r.id,
          name: r.templateName,
          operator: r.operatorName,
          time: timestamp ? timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '---',
          fails: r.responses.filter((resp: any) => resp.status === 'not_ok').length
        };
      })
    };
  }, [routeSubmissions, todayStart, todayEnd]);

  // 5. Safety Overview Stats (Observações de Hoje)
  const safetyOverviewStats = useMemo(() => {
    // Today's observations
    const todayObs = safetyObservations.filter(obs => {
      const created = safeToDate(obs.createdAt);
      return created && created >= todayStart && created <= todayEnd;
    });

    const totalToday = todayObs.length;
    const safeToday = todayObs.filter(obs => obs.isSafe === 'seguro').length;
    const riskToday = todayObs.filter(obs => obs.isSafe !== 'seguro').length;

    // Month observations
    const startOfMonth = new Date(currentTime.getFullYear(), currentTime.getMonth(), 1);
    const monthObs = safetyObservations.filter(obs => {
      const created = safeToDate(obs.createdAt);
      return created && created >= startOfMonth;
    });

    const totalMonth = monthObs.length;
    const pendingMonth = monthObs.filter(obs => obs.status === 'pending').length;
    const resolvedMonth = monthObs.filter(obs => obs.status === 'resolved').length;
    const safeMonth = monthObs.filter(obs => obs.isSafe === 'seguro').length;
    const riskMonth = monthObs.filter(obs => obs.isSafe !== 'seguro').length;

    return {
      totalToday,
      safeToday,
      riskToday,
      totalMonth,
      pendingMonth,
      resolvedMonth,
      safeMonth,
      riskMonth,
      todayObservations: todayObs,
      monthObservations: monthObs
    };
  }, [safetyObservations, currentTime, todayStart, todayEnd]);

  // Overall Operations Health Score Index (Daily KPIs consolidated)
  const healthIndex = useMemo(() => {
    let score = 100;

    // 1. DDS factor (30 pts weight)
    // -10 pts per missing shift talk so far
    if (activeModules.dds !== false) {
      const currentShiftIndex = ['Turno 1', 'Turno 2', 'Turno 3'].indexOf(activeShift);
      const shiftsToCount = ['Turno 1', 'Turno 2', 'Turno 3'].slice(0, currentShiftIndex + 1);
      let missingDds = 0;
      shiftsToCount.forEach(shift => {
        const matchStatus = ddsTodayStats.shiftStatus.find(s => s.shift === shift);
        if (matchStatus && !matchStatus.applied) {
          missingDds++;
          score -= 10;
        }
      });
    }

    if (activeModules.quality !== false) {
      // 2. Quality Omissions factor (25 pts weight)
      // -5 per omitted checklist
      score -= (qualityTodayStats.omissionsCount * 5);

      // 3. Quality Non Conformities factor (15 pts weight)
      // -3 per failure detected
      score -= (qualityTodayStats.nonConformitiesCount * 2);
    }

    if (activeModules.forklifts !== false) {
      // 4. Forklift Blockages / Non Inspections factor (30 pts weight)
      // -5 per uninspected forklift in active model
      const missingForkInspections = forkliftTodayStats.reports.filter(r => !r.inspected).length;
      score -= (missingForkInspections * 3);
      // -10 per blocked layout due to safety danger
      score -= (forkliftTodayStats.blockedCount * 10);
    }

    if (activeModules.safety_observations !== false) {
      // 5. Safety observation risk factor
      // -5 per risk/desvio reported today
      score -= (safetyOverviewStats.riskToday * 5);
    }

    return Math.max(0, Math.min(100, score));
  }, [activeShift, activeModules, ddsTodayStats, qualityTodayStats, forkliftTodayStats, safetyOverviewStats]);

  // Combined Non-Conformities list (Quality failing checklist submissions + Forklift checklists failing/anormal)
  const combinedNonConformities = useMemo(() => {
    const list: any[] = [];

    // 1. Quality non-conformities - ONLY IF quality is enabled
    if (activeModules.quality !== false) {
      qualityTodayStats.failingSubmissions.forEach(sub => {
        list.push({ ...sub, type: 'quality' });
      });
    }

    // 2. Forklift non-conformities - ONLY IF forklifts is enabled
    if (activeModules.forklifts !== false) {
      forkliftChecklists.forEach(c => {
        const created = safeToDate(c.timestamp);
        if (created && created >= todayStart && created <= todayEnd && c.status === 'anormal') {
          let subFails = 0;
          const anomalies: string[] = [];
          if (c.itemResults) {
            Object.entries(c.itemResults).forEach(([itemId, res]: [string, any]) => {
              if (res && res.status === 'anormal') {
                subFails++;
                const item = forkliftCheckItems.find(i => i.id === itemId);
                anomalies.push(item?.name || 'Não conformidade');
              }
            });
          }

          if (subFails > 0) {
            list.push({
              id: c.id,
              type: 'forklift',
              templateName: `Empilhadeira #${c.forkliftNumber}`,
              sector: 'Frota',
              lineName: 'Pátio / Logística',
              operator: c.conductorName || 'Operador',
              shift: c.shift || '---',
              time: created.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}),
              failuresCount: subFails,
              anomalies: anomalies
            });
          }
        }
      });
    }

    // Sort by time descending
    return list.sort((a, b) => b.time.localeCompare(a.time));
  }, [activeModules.quality, activeModules.forklifts, qualityTodayStats.failingSubmissions, forkliftChecklists, forkliftCheckItems, todayStart, todayEnd]);

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-8">
        <LoaderComponent text="Sincronizando Visão Geral" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-12">
      
      {/* Real-time Header & Live Indicator */}
      <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-200/80 shadow-sm flex flex-col xl:flex-row xl:items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-full bg-slate-50 opacity-40 -skew-x-12 pointer-events-none" />
        
        <div className="flex flex-wrap items-center gap-5 relative z-10">
          <div className="w-16 h-16 bg-slate-900 text-white rounded-[1.5rem] flex items-center justify-center shadow-lg relative">
            <Activity className="w-8 h-8 text-emerald-400 animate-pulse" />
            <span className="absolute -top-1.5 -right-1.5 flex h-4.5 w-4.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4.5 w-4.5 bg-emerald-500 border-2 border-white flex items-center justify-center">
                 <span className="w-1.5 h-1.5 rounded-full bg-white block" />
              </span>
            </span>
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">Overview Real-Time</h2>
              <span className="bg-emerald-100 text-emerald-800 text-[10px] uppercase font-black tracking-widest px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                Tempo Real
              </span>
            </div>
            <p className="text-slate-500 font-semibold lg:text-base mt-1">Conexão real-time com todas as atividades fabris de hoje.</p>
          </div>
        </div>

        {/* Current Scale info & Time */}
        <div className="flex flex-wrap items-center gap-4 xl:self-center relative z-10">
          <div className="bg-slate-50 px-5 py-3 rounded-2xl border border-slate-100 flex items-center gap-3">
            <Clock className="w-5 h-5 text-indigo-500" />
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hora Atual</p>
              <p className="text-lg font-black text-slate-800 tracking-tight tabular-nums">
                {currentTime.toLocaleTimeString('pt-BR')}
              </p>
            </div>
          </div>

          <div className="bg-slate-50 px-5 py-3 rounded-2xl border border-slate-100 flex items-center gap-3">
            <Zap className="w-5 h-5 text-amber-500 hover:scale-110 transition-transform" />
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Turno Ativo</p>
              <p className="text-lg font-black text-slate-800 tracking-tight">
                {activeShift}
              </p>
            </div>
          </div>

          <div className="bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-xl shadow-slate-200/80 flex items-center gap-3">
            <Award className="w-5 h-5 text-emerald-400" />
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Equipe Agora</p>
              <p className="text-lg font-black text-white tracking-tight">
                Letra {activeGroups[activeShift] || '---'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main KPI Operational Health Index Block */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        
        {/* Operations Health Gauge Dashboard Card - Bigger Card */}
        <div className="xl:col-span-4 bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-[0.02] pointer-events-none group-hover:scale-125 transition-transform duration-700">
            <Award className="w-64 h-64" />
          </div>

          <div className="relative z-10 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Índice de Performance</p>
                <h3 className="text-xl font-black text-slate-900 tracking-tight uppercase">Saúde Operacional (Dia)</h3>
              </div>
              <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shadow-inner">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>

            <div className="flex flex-col items-center py-6">
              <div className="relative flex items-center justify-center">
                {/* Visual Gauge Circle */}
                <svg className="w-36 h-36 rotate-[-90deg]" viewBox="0 0 144 144">
                  <circle
                    cx="72"
                    cy="72"
                    r="50"
                    stroke="#f1f5f9"
                    strokeWidth="10"
                    fill="transparent"
                  />
                  <circle
                    cx="72"
                    cy="72"
                    r="50"
                    stroke={healthIndex > 85 ? '#10b981' : healthIndex > 65 ? '#f59e0b' : '#ef4444'}
                    strokeWidth="10"
                    fill="transparent"
                    strokeDasharray={2 * Math.PI * 50}
                    strokeDashoffset={2 * Math.PI * 50 * (1 - healthIndex / 100)}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                <div className="absolute flex flex-col items-center justify-center text-center">
                  <span className="text-4xl font-black text-slate-900 tracking-tighter tabular-nums">{healthIndex}%</span>
                  <span className={cn(
                    "text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 mt-1.5 rounded-full",
                    healthIndex >= 90 ? "bg-emerald-100 text-emerald-800" :
                    healthIndex >= 75 ? "bg-amber-100 text-amber-800" :
                    "bg-rose-100 text-rose-800"
                  )}>
                    {healthIndex >= 90 ? "EXCELENTE" : healthIndex >= 75 ? "REGULAR" : "REVISÃO"}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-xs font-bold text-slate-500 leading-relaxed text-center">
                {healthIndex >= 95 
                  ? "Flg fabril operando sem atrasos em DDS, sem omissões de qualidade registradas e empilhadeiras auditadas."
                  : healthIndex >= 80
                  ? "Status dentro da tolerância de riscos, porém atente-se para inspeções complementares ou DDS faltante."
                  : "Alerta: Baixo índice de auditoria preventiva hoje. Priorize assinaturas e checklists mecânicos."}
              </p>
            </div>
          </div>
        </div>

        {/* Small Real-Time summary grid of other 4 tabs */}
        <div className="xl:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-6">

          {/* Card 1: DDS Status Check */}
          {activeModules.dds !== false && (
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col justify-between transition-all hover:shadow-md hover:border-blue-100 group">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded-md">Módulo DDS</span>
                  <h3 className="text-lg font-black text-slate-900 mt-2">DDS Online hoje</h3>
                </div>
                <div className="w-12 h-12 bg-blue-50/50 text-blue-600 rounded-2xl flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform">
                  <ShieldAlert className="w-6 h-6" />
                </div>
              </div>

              <div className="my-5 flex items-baseline gap-2">
                <span className="text-4xl font-black text-slate-900 tracking-tight">{ddsTodayStats.totalApplied}</span>
                <span className="text-slate-400 font-bold text-sm">/ {ddsTodayStats.totalExpected} turnos aplicados</span>
              </div>

              <div className="flex items-center justify-between text-xs pt-3 border-t border-slate-100 text-slate-400">
                <span className="font-bold flex items-center gap-1.5 transition-colors">
                  <User className="w-3.5 h-3.5 text-blue-500" />
                  {ddsTodayStats.totalSignaturesToday} assinaturas registradas hoje
                </span>
              </div>
            </div>
          )}

          {/* Card 2: Wire movements status */}
          {activeModules.wires !== false && (
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col justify-between transition-all hover:shadow-md hover:border-indigo-100 group">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded-md">Módulo Arames</span>
                  <h3 className="text-lg font-black text-slate-900 mt-2">Recebidos & Consumos</h3>
                </div>
                <div className="w-12 h-12 bg-indigo-50/50 text-indigo-600 rounded-2xl flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform">
                  <Barcode className="w-6 h-6" />
                </div>
              </div>

              <div className="my-5 grid grid-cols-2 gap-2 divide-x divide-slate-100">
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recebido</p>
                  <p className="text-xl font-black text-slate-950 truncate leading-none">{wireTodayStats.receivedWeight.toLocaleString()} <span className="text-[10px] text-slate-400 font-bold uppercase">kg</span></p>
                  <p className="text-xs text-slate-400 font-bold">{wireTodayStats.receivedCount} bobinas</p>
                </div>
                <div className="pl-4 space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Consumido</p>
                  <p className="text-xl font-black text-slate-950 text-right truncate leading-none">{wireTodayStats.consumedWeight.toLocaleString()} <span className="text-[10px] text-slate-400 font-bold uppercase">kg</span></p>
                  <p className="text-xs text-slate-400 font-bold text-right">{wireTodayStats.consumedCount} bobinas dadas baixa</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-3 border-t border-slate-100 text-slate-400">
                <span className="font-bold flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-indigo-500" />
                  {wireTodayStats.batchesToday.length} Notas Fiscais processadas hoje
                </span>
              </div>
            </div>
          )}

          {/* Card 3: Quality status check */}
          {activeModules.quality !== false && (
            <div className="bg-white p-5 rounded-[2rem] border border-slate-200/90 shadow-sm flex flex-col justify-between transition-all hover:shadow-md hover:border-emerald-100 group">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2 py-0.5 rounded-md">Qualidade</span>
                  <h3 className="text-base md:text-lg font-black text-slate-900 mt-2">Auditorias de Linha</h3>
                </div>
                <div className="w-10 h-10 bg-emerald-50/50 text-emerald-600 rounded-xl flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform">
                  <ClipboardCheck className="w-5 h-5" />
                </div>
              </div>

              <div className="my-4 grid grid-cols-3 gap-1 divide-x divide-slate-100">
                <div className="space-y-0.5">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Enviadas</p>
                  <p className="text-xl font-black text-slate-900 leading-tight">{qualityTodayStats.totalInspectionsToday}</p>
                </div>
                <div className="pl-2 space-y-0.5">
                  <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Feitas</p>
                  <p className="text-xl font-black text-emerald-600 leading-tight">{qualityTodayStats.doneCount}</p>
                </div>
                <div className="pl-2 space-y-0.5 text-right">
                  <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest">Pendentes</p>
                  <p className={cn(
                    "text-xl font-black leading-tight",
                    qualityTodayStats.pendingCount > 0 ? "text-amber-600" : "text-slate-400"
                  )}>
                    {qualityTodayStats.pendingCount}
                  </p>
                </div>
              </div>

              <div className="flex items-center pt-3 border-t border-slate-100">
                <span className="w-full text-center font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg flex items-center justify-center gap-1 text-[10px]">
                  <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                  {qualityTodayStats.omissionsCount} {qualityTodayStats.omissionsCount === 1 ? 'omissão registrada' : 'omissões registradas'} hoje
                </span>
              </div>
            </div>
          )}

          {/* Card 4: Forklift status checklist */}
          {activeModules.forklifts !== false && (
            <div className="bg-white p-5 rounded-[2rem] border border-slate-200/90 shadow-sm flex flex-col justify-between transition-all hover:shadow-md hover:border-amber-100 group">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest bg-amber-50 px-2 py-0.5 rounded-md">Frota Empilhadeira</span>
                  <h3 className="text-base md:text-lg font-black text-slate-900 mt-2">Checklists mecânicos</h3>
                </div>
                <div className="w-10 h-10 bg-amber-50/50 text-amber-600 rounded-xl flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform">
                  <Truck className="w-5 h-5" />
                </div>
              </div>

              <div className="my-4 flex justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Inspecionadas</p>
                  <p className="text-2xl font-black text-slate-900 leading-tight">
                    {forkliftTodayStats.inspectedCount} <span className="text-xs text-slate-400 font-bold">/ {forkliftTodayStats.totalForklifts}</span>
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Bloqueadas</p>
                  <p className={cn(
                    "text-2xl font-black text-right leading-tight",
                    forkliftTodayStats.blockedCount > 0 ? "text-rose-600" : "text-slate-400"
                  )}>
                    {forkliftTodayStats.blockedCount}
                  </p>
                </div>
              </div>

              <div className="flex items-center pt-3 border-t border-slate-100 justify-center">
                <span className="font-bold text-slate-500 text-center text-[10px]">
                  {forkliftTodayStats.warningAnomaliesCount === 1 ? '1 falha relatada em inspeção' : `${forkliftTodayStats.warningAnomaliesCount} falhas relatadas em inspeção`}
                </span>
              </div>
            </div>
          )}

          {/* Card 5: Operational Routes status checklist */}
          {activeModules.operational_routes !== false && (
            <div className="bg-white p-5 rounded-[2rem] border border-slate-200/90 shadow-sm flex flex-col justify-between transition-all hover:shadow-md hover:border-emerald-100 group">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2 py-0.5 rounded-md">Rota Operacional</span>
                  <h3 className="text-base md:text-lg font-black text-slate-900 mt-2">Vistorias de Ativos</h3>
                </div>
                <div className="w-10 h-10 bg-emerald-50/50 text-emerald-600 rounded-xl flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform">
                  <Activity className="w-5 h-5 text-emerald-600 animate-pulse" />
                </div>
              </div>

              <div className="my-4 flex justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Rotas de Hoje</p>
                  <p className="text-2xl font-black text-slate-900 leading-tight">
                    {routeTodayStats.totalSubmissionsToday} <span className="text-xs text-slate-400 font-bold">concluídas</span>
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Anomalias de Rota</p>
                  <p className={cn(
                    "text-2xl font-black text-right leading-tight",
                    routeTodayStats.anomaliesCount > 0 ? "text-rose-600" : "text-slate-400"
                  )}>
                    {routeTodayStats.anomaliesCount}
                  </p>
                </div>
              </div>

              <div className="flex items-center pt-3 border-t border-slate-100 justify-center font-bold">
                <span className="font-bold text-slate-500 text-center text-[10px]">
                  {routeTodayStats.anomaliesCount === 1 ? '1 falha necessitando observação' : `${routeTodayStats.anomaliesCount} falhas necessitando observação`}
                </span>
              </div>
            </div>
          )}

          {/* Card 6: Safety Observations checklist */}
          {activeModules.safety_observations !== false && (
            <div className="bg-white p-5 rounded-[2rem] border border-slate-200/90 shadow-sm flex flex-col justify-between transition-all hover:shadow-md hover:border-rose-100 group">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest bg-rose-50 px-2 py-0.5 rounded-md">Observação de Segurança</span>
                  <h3 className="text-base md:text-lg font-black text-slate-900 mt-2">Segurança Comportamental</h3>
                </div>
                <div className="w-10 h-10 bg-rose-50/50 text-rose-500 rounded-xl flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform">
                  <ShieldAlert className="w-5 h-5 text-rose-500" />
                </div>
              </div>

              <div className="my-4 flex justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Sinalizações Hoje</p>
                  <p className="text-2xl font-black text-slate-900 leading-tight">
                    {safetyOverviewStats.totalToday} <span className="text-xs text-slate-400 font-bold">registros</span>
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Desvios de Risco</p>
                  <p className={cn(
                    "text-2xl font-black text-right leading-tight",
                    safetyOverviewStats.riskToday > 0 ? "text-rose-600" : "text-slate-400"
                  )}>
                    {safetyOverviewStats.riskToday}
                  </p>
                </div>
              </div>

              <div className="flex items-center pt-3 border-t border-slate-100 justify-between text-[10px] font-semibold text-slate-400 mt-1">
                <span>Mês: <strong className="text-slate-700">{safetyOverviewStats.totalMonth} total</strong></span>
                <span className="text-slate-500 font-bold">{safetyOverviewStats.pendingMonth} pendentes</span>
              </div>
            </div>
          )}

          {/* Card 7: Consumables & Stock Status */}
          {activeModules.consumables !== false && (
            <div className="bg-white p-5 rounded-[2rem] border border-slate-200/90 shadow-sm flex flex-col justify-between transition-all hover:shadow-md hover:border-emerald-100 group">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2 py-0.5 rounded-md">Controle de Insumos</span>
                  <h3 className="text-base md:text-lg font-black text-slate-900 mt-2">Níveis de Estoque</h3>
                </div>
                <div className="w-10 h-10 bg-emerald-50/50 text-emerald-600 rounded-xl flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform">
                  <Database className="w-5 h-5 text-emerald-600" />
                </div>
              </div>

              <div className="my-4 flex justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Insumos Críticos</p>
                  <p className={cn(
                    "text-2xl font-black leading-tight",
                    consumablesStats.lowStockCount > 0 ? "text-amber-600" : "text-emerald-700"
                  )}>
                    {consumablesStats.lowStockCount} <span className="text-xs text-slate-400 font-bold">/ {consumablesStats.activeCount} ativos</span>
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Lançamentos Hoje</p>
                  <p className="text-2xl font-black text-right leading-tight text-slate-900">
                    {consumablesStats.logsTodayCount}
                  </p>
                </div>
              </div>

              <div className="flex items-center pt-3 border-t border-slate-100 justify-between text-[10px] font-semibold text-slate-400 mt-1">
                <span>Entradas: <strong className="text-slate-700">{consumablesStats.totalEntriesCount} hoje</strong></span>
                <span className="text-slate-500 font-bold">{consumablesStats.totalConsumptionsCount} saídas</span>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Grid: Secondary Visual Area - Detailed Live Event Feeds */}
      {(activeModules.dds !== false || activeModules.forklifts !== false) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* DDS Shift Compliance Board Details - Grid col span 6 */}
          {activeModules.dds !== false && (
            <div className={cn("lg:col-span-12 bg-white p-4 md:p-6 rounded-[2rem] border border-slate-200 shadow-sm",
              activeModules.forklifts !== false ? "xl:col-span-6" : "xl:col-span-12"
            )}>
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                <h3 className="text-base md:text-lg font-black text-slate-900 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-blue-600" />
                  Acompanhamento de DDS por Turno
                </h3>
                <span className="text-[10px] text-slate-400 font-bold italic">Meta: 100% de Diálogo</span>
              </div>

              <div className="space-y-3">
                {ddsTodayStats.shiftStatus.map((s, idx) => (
                  <div 
                    key={`dds-shift-row-${idx}`}
                    className={cn(
                      "p-3.5 rounded-xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-3",
                      s.applied 
                        ? "bg-slate-50/50 border-slate-100" 
                        : s.shift === activeShift 
                        ? "bg-amber-50/30 border-amber-300 ring-2 ring-amber-100" 
                        : "bg-slate-50/30 border-dashed border-slate-200"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-inner",
                        s.applied ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"
                      )}>
                        {s.applied ? <CheckCircle2 className="w-5 h-5" /> : <Clock className="w-5 h-5 animate-pulse" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-black text-slate-800 text-xs md:text-sm leading-none">{s.shift}</p>
                          <span className="text-[9px] font-black bg-slate-900 text-white px-2 py-0.5 rounded-full uppercase">Letra {s.group}</span>
                        </div>
                        <p className="text-xs font-bold text-slate-400 mt-1 truncate max-w-[200px] sm:max-w-xs md:max-w-[220px]">
                          {s.applied ? `Tópico: ${s.theme}` : "Diálogo pendente de aplicação"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-4 border-t md:border-t-0 pt-2.5 md:pt-0 border-slate-100">
                      <div className="md:text-right">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Status</p>
                        {s.applied ? (
                          <span className="inline-block mt-0.5 text-[10px] font-black text-emerald-600 bg-emerald-100/60 px-2 py-0.5 rounded-full uppercase">Aplicado</span>
                        ) : (
                          <span className={cn(
                            "inline-block mt-0.5 text-[10px] font-black px-2 py-0.5 rounded-full uppercase animate-pulse",
                            s.shift === activeShift ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-400"
                          )}>
                            {s.shift === activeShift ? "Aguardando" : "Pendente"}
                          </span>
                        )}
                      </div>

                      <div className="md:text-right min-w-[65px]">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Presenças</p>
                        <p className="text-sm md:text-base font-black text-slate-800 tracking-tight mt-0.5">{s.signatures} <span className="text-[9px] text-slate-500 font-bold">colabs</span></p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Forklifts Fleet Inspections Detailed Board */}
          {activeModules.forklifts !== false && (
            <div className={cn("lg:col-span-12 bg-white p-4 md:p-6 rounded-[2rem] border border-slate-200 shadow-sm",
              activeModules.dds !== false ? "xl:col-span-6" : "xl:col-span-12"
            )}>
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                <h3 className="text-base md:text-lg font-black text-slate-900 flex items-center gap-2">
                  <Truck className="w-5 h-5 text-amber-500" />
                  Inspeção Diária da Frota (Checklists)
                </h3>
                <span className="text-[10px] text-slate-400 font-bold italic">Total: {forkliftTodayStats.totalForklifts} Ativas</span>
              </div>

              <div className="space-y-3">
                {forkliftTodayStats.reports.map((f, idx) => (
                  <div 
                    key={`forklift-row-status-${idx}`}
                    className="p-3.5 bg-slate-50/50 rounded-xl border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-start md:items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-inner mt-0.5 md:mt-0",
                        f.status === 'liberada' ? "bg-emerald-50 text-emerald-600" : 
                        f.status === 'bloqueada' ? "bg-rose-50 text-rose-600" :
                        "bg-slate-100 text-slate-400"
                      )}>
                        <Truck className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-black text-slate-800 text-xs md:text-sm leading-none">Empilhadeira #{f.number}</p>
                          <span className="text-[9px] font-bold text-slate-400">{f.model} • {f.plate}</span>
                        </div>
                        
                        <p className="text-[11px] font-bold text-slate-400 mt-1 truncate">
                          {f.inspected ? `Insp: ${f.operator} (${f.time})` : "Aguardando checklist pré-operacional"}
                        </p>

                        {f.anomalies.length > 0 && (
                          <div className="mt-1.5 bg-rose-50 text-rose-600 px-2.5 py-1 rounded-lg border border-rose-100 inline-flex flex-wrap items-center gap-1 max-w-[240px] sm:max-w-md">
                            <span className="text-[8px] font-black uppercase tracking-tight shrink-0">Danos:</span>
                            <span className="text-[10px] font-bold truncate max-w-[150px] sm:max-w-xs">{f.anomalies.join(', ')}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-4 border-t md:border-t-0 pt-2.5 md:pt-0 border-slate-100 shrink-0">
                      <div className="md:text-right">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Status</p>
                        <span className={cn(
                          "inline-block mt-1 text-[10px] font-black px-2.5 py-0.5 rounded-md uppercase",
                          f.status === 'liberada' ? "bg-emerald-100 text-emerald-800" : 
                          f.status === 'bloqueada' ? "bg-rose-100 text-rose-800 ring-2 ring-rose-200" : 
                          "bg-slate-100 text-slate-400"
                        )}>
                          {f.status === 'liberada' ? 'Liberada' : f.status === 'bloqueada' ? 'Bloqueada' : 'Não Inspecionada'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Wire Control Consumptions live feed vs Quality detailed checklist list */}
      {(activeModules.wires !== false || activeModules.quality !== false) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Real-Time Wire Consumptions Feed */}
          {activeModules.wires !== false && (
            <div className={cn("lg:col-span-12 bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-200 shadow-sm",
              activeModules.quality !== false ? "xl:col-span-6" : "xl:col-span-12"
            )}>
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <Barcode className="w-5 h-5 text-indigo-600" />
                  Consumos Recentes de Bobinas (Hoje)
                </h3>
                <span className="text-[10px] font-black bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full uppercase animate-pulse">Real-time feed</span>
              </div>

              <div className="overflow-x-auto">
                 <table className="w-full text-left">
                   <thead>
                     <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                       <th className="py-3 px-2">Bobina ID</th>
                       <th className="py-3 px-2">Linha</th>
                       <th className="py-3 px-2">Bitola / Peso</th>
                       <th className="py-3 px-2 text-center">Turno</th>
                       <th className="py-3 px-2 text-right">Horário</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                     {wireTodayStats.recentConsumptions.map((c, idx) => (
                       <tr key={`coil-cons-row-${idx}`} className="text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                         <td className="py-4 px-2 font-black text-slate-900 flex items-center gap-2">
                           <div className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                           {c.coilNumber}
                         </td>
                         <td className="py-4 px-2 font-bold text-slate-500">{c.line}</td>
                         <td className="py-4 px-2">
                           <div className="flex flex-col">
                             <span className="font-extrabold text-slate-800">{c.weight?.toLocaleString()} kg</span>
                             <span className="text-[10px] text-blue-500 font-extrabold">{c.diameter} mm</span>
                           </div>
                         </td>
                         <td className="py-4 px-2 text-center">
                           <span className="text-[9px] font-black bg-slate-50 px-2 py-0.5 rounded border border-slate-200 uppercase">T{c.shift}</span>
                         </td>
                         <td className="py-4 px-2 text-right text-slate-500 leading-none">{c.time}</td>
                       </tr>
                     ))}
                     {wireTodayStats.recentConsumptions.length === 0 && (
                       <tr>
                         <td colSpan={5} className="py-12 text-center text-slate-400 text-xs italic font-semibold">Nenhuma bobina consumida nas linhas hoje.</td>
                       </tr>
                     )}
                   </tbody>
                 </table>
              </div>
            </div>
          )}

          {/* Quality Audit Checklist Submissions done today */}
          {activeModules.quality !== false && (
            <div className={cn("lg:col-span-12 bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-200 shadow-sm",
              activeModules.wires !== false ? "xl:col-span-6" : "xl:col-span-12"
            )}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6 pb-4 border-b border-slate-100">
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <ClipboardCheck className="w-5 h-5 text-emerald-600" />
                  Verificações de Qualidade em Linha (Hoje)
                </h3>
                <span className="text-[10px] font-bold text-slate-400">Total submetidas: {qualityTodayStats.totalInspectionsToday}</span>
              </div>

              {/* New Feitas & Pendentes Counter with Visual Progress Bar */}
              <div className="mb-6 bg-slate-50/50 p-4 rounded-2xl border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Realizadas</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black text-emerald-600 tabular-nums leading-none">
                        {qualityTodayStats.doneCount}
                      </span>
                      <span className="text-[9px] font-bold text-slate-400">inspeções</span>
                    </div>
                  </div>
                  
                  <div className="w-px h-8 bg-slate-200 shrink-0" />
                  
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Ainda Pendentes</p>
                    <div className="flex items-baseline gap-1">
                      <span className={cn(
                        "text-2xl font-black tabular-nums leading-none",
                        qualityTodayStats.pendingCount > 0 ? "text-amber-600" : "text-slate-400"
                      )}>
                        {qualityTodayStats.pendingCount}
                      </span>
                      <span className="text-[9px] font-bold text-slate-400">pendentes hoje</span>
                    </div>
                  </div>
                </div>

                {/* Progress Bar Visualizer */}
                <div className="flex-1 max-w-[200px] space-y-1.5 self-stretch sm:self-auto flex flex-col justify-center">
                  <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-slate-400 leading-none">
                    <span>Progresso</span>
                    <span>
                      {Math.round((qualityTodayStats.doneCount / Math.max(1, qualityTodayStats.doneCount + qualityTodayStats.pendingCount)) * 100)}%
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                      style={{ width: `${(qualityTodayStats.doneCount / Math.max(1, qualityTodayStats.doneCount + qualityTodayStats.pendingCount)) * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Omission alert box if any omission exists */}
              {qualityTodayStats.omissionsCount > 0 && (
                <div className="mb-4 bg-amber-50 text-amber-800 p-4 rounded-2xl border border-amber-200 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider">Atenção Administrativa</p>
                    <p className="text-xs font-bold leading-relaxed mt-1">
                      Registramos {qualityTodayStats.omissionsCount} omissão justificada de checklist de qualidade de produtos hoje. Revise em relatórios.
                    </p>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                 <table className="w-full text-left">
                   <thead>
                     <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                       <th className="py-3 px-2">Tipo / Template</th>
                       <th className="py-3 px-2">Linha</th>
                       <th className="py-3 px-2">Responsável</th>
                       <th className="py-3 px-2 text-center">Turno</th>
                       <th className="py-3 px-2 text-right">Horário</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                     {qualityTodayStats.recentSubmissions.map((s, idx) => (
                       <tr key={`val-sub-row-${idx}`} className="text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                         <td className="py-4 px-2 font-black text-slate-900 flex items-center gap-2">
                           <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                           <span className="truncate max-w-[150px]">{s.templateName}</span>
                         </td>
                         <td className="py-4 px-2 tracking-tight">{s.line}</td>
                         <td className="py-4 px-2 text-slate-500 uppercase text-xs font-extrabold truncate max-w-[100px]">{s.operator}</td>
                         <td className="py-4 px-2 text-center">
                           <span className="text-[9px] font-black bg-slate-50 px-2 py-0.5 rounded border border-slate-200 uppercase">T{s.shift}</span>
                         </td>
                         <td className="py-4 px-2 text-right text-slate-500 leading-none">{s.time}</td>
                       </tr>
                     ))}
                     {qualityTodayStats.recentSubmissions.length === 0 && (
                       <tr>
                         <td colSpan={5} className="py-12 text-center text-slate-400 text-xs italic font-semibold">Sem auditoria de qualidade efetuada hoje.</td>
                       </tr>
                     )}
                   </tbody>
                 </table>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Non-Conformities detailed box if any */}
      {combinedNonConformities.length > 0 && (
        <div className="bg-rose-50 border-2 border-rose-200 p-6 md:p-8 rounded-[2.5rem] shadow-sm">
          <div className="flex items-center gap-3 mb-4">
             <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center text-rose-500 shadow-inner">
               <AlertTriangle className="w-5 h-5" />
             </div>
             <div>
                <h4 className="font-black text-rose-950 uppercase leading-none tracking-tight">Ocorrências Não-Conformes Detectadas Hoje</h4>
                <p className="text-xs text-rose-700 mt-1 font-semibold leading-relaxed">Itens avaliados como NÃO OK ou REJEITADO pelas inspeções operacionais.</p>
             </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
             {combinedNonConformities.map((item, idx) => (
                <div key={`fails-card-${idx}`} className="bg-white p-4 rounded-2xl border border-rose-100 shadow-sm flex flex-col justify-between">
                   <div className="space-y-2 mb-4">
                     <div className="flex items-center justify-between">
                        <span className={cn(
                           "text-[9px] font-black uppercase px-2 py-0.5 rounded",
                           item.type === 'forklift' ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"
                         )}>
                           {item.type === 'forklift' ? "Frota" : "Qualidade"}
                        </span>
                        <span className="text-xs text-slate-400 font-bold">{item.time}</span>
                     </div>
                     <h5 className="font-extrabold text-slate-900 text-sm truncate">{item.templateName}</h5>
                     <p className="text-xs font-bold text-slate-500">
                       {item.type === 'forklift' ? "Área: Pátio / Logística" : `Linha: ${item.lineName} • Setor: ${item.sector}`}
                     </p>
                     {item.type === 'forklift' && item.anomalies && item.anomalies.length > 0 && (
                       <p className="text-[10px] text-amber-700 font-extrabold tracking-tight mt-1 truncate">
                         Itens: {item.anomalies.join(', ')}
                       </p>
                     )}
                   </div>
                   <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-extrabold uppercase truncate">Op: {item.operator} • {item.shift}</span>
                      <span className="text-xs font-black text-rose-600 bg-rose-50 px-2 py-1 rounded">
                         {item.failuresCount} {item.failuresCount === 1 ? 'Falha' : 'Falhas'}
                      </span>
                   </div>
                </div>
             ))}
          </div>
        </div>
      )}
      
    </div>
  );
};

// Loader Indicator Component
interface LoaderProps {
  text?: string;
}

const LoaderComponent: React.FC<LoaderProps> = ({ text = "Carregando" }) => {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      <div className="relative">
        <div className="w-16 h-16 border-4 border-slate-100 border-t-slate-900 rounded-full animate-spin" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
           <Activity className="w-6 h-6 text-emerald-500 animate-pulse" />
        </div>
      </div>
      <p className="font-black text-slate-500 text-xs uppercase tracking-widest mt-2">{text}...</p>
    </div>
  );
};

export default Overview;
