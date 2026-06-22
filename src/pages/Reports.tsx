import React, { useEffect, useState, useMemo } from 'react';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { MASTER_EMAILS } from '../constants';
import { handleFirestoreError, OperationType } from '../lib/errorHandler';
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
  User as UserIcon
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { cn, safeToDate } from '../lib/utils';

import { ConfirmationModal } from '../components/ui/ConfirmationModal';

const Reports: React.FC = () => {
  const { isManager, isAdmin, isMaster } = useAuth();
  const [reportType, setReportType] = useState<'dds' | 'forklift' | 'wire_receiving' | 'wire_consumption' | 'quality' | 'user_ray_x' | 'pending_equipments'>('dds');
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
  const [routeSubmissionsData, setRouteSubmissionsData] = useState<any[]>([]);
  const [safetyObservationsData, setSafetyObservationsData] = useState<any[]>([]);
  const [selectedRayXUser, setSelectedRayXUser] = useState<string>('');
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

  const closeModal = () => setModalConfig(prev => ({ ...prev, isOpen: false }));

  // Filters State
  const [filterUser, setFilterUser] = useState('');
  const [filterTheme, setFilterTheme] = useState('');
  const [filterShift, setFilterShift] = useState('all');
  const [filterGroup, setFilterGroup] = useState('all');
  const [filterMood, setFilterMood] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterLine, setFilterLine] = useState('all');
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false);

  useEffect(() => {
    resetFilters();
  }, [reportType]);

  useEffect(() => {
    if (!isManager) {
      setLoading(false);
      return;
    }
    const fetchData = async () => {
      try {
        setLoading(true);
        // Fetch DDS Data
        const signaturesSnap = await getDocs(query(collection(db, 'dds_signatures'), orderBy('timestamp', 'desc')));
        const sessionsSnap = await getDocs(collection(db, 'dds_sessions'));
        
        const sessions: Record<string, any> = {};
        sessionsSnap.docs.forEach(doc => {
          sessions[doc.id] = doc.data();
        });

        const currentOrphans: string[] = [];
        const ddsResults = signaturesSnap.docs.map(doc => {
          const sig = doc.data();
          const session = sessions[sig.sessionId];
          
          if (!session) {
            currentOrphans.push(doc.id);
          }

          return {
            id: doc.id,
            sessionId: sig.sessionId,
            userName: sig.userName || 'Desconhecido',
            sessionTitle: sig.sessionTitle || session?.title || 'Sessão Removida (Órfão)',
            shift: session?.shift || '-',
            group: session?.group || '-',
            executor: session?.executor || '-',
            mood: sig.mood || '-',
            timestamp: safeToDate(sig.timestamp) || new Date(),
            isOrphan: !session
          };
        });
        
        setOrphanIds(currentOrphans);
        setData(ddsResults);

        // Fetch Checklist Items Labels and Order
        const itemsSnap = await getDocs(query(collection(db, 'forklift_check_items'), orderBy('order')));
        const itemsMap: Record<string, string> = {};
        const itemsOrdered: any[] = [];
        itemsSnap.forEach(doc => {
          const itemData = doc.data();
          itemsMap[doc.id] = itemData.name;
          itemsOrdered.push({ id: doc.id, ...itemData });
        });
        setCheckItems(itemsMap);
        setCheckItemsList(itemsOrdered);

        // Fetch Forklift Data
        const forkliftSnap = await getDocs(query(collection(db, 'forklift_checklists'), orderBy('timestamp', 'desc')));
        const forkliftResults = forkliftSnap.docs.map(doc => {
          const check = doc.data();
          return {
            id: doc.id,
            forkliftNumber: check.forkliftNumber,
            conductorName: check.conductorName,
            status: check.status,
            shift: check.shift,
            group: check.group,
            timestamp: safeToDate(check.timestamp) || new Date(),
            itemResults: check.itemResults || {},
            notes: check.notes || '',
            mediaUrl: check.mediaUrl || ''
          };
        });
        setForkliftData(forkliftResults);

        // Fetch Wire Suppliers & Lines for labels
        const suppliersSnap = await getDocs(collection(db, 'wire_suppliers'));
        const suppliersList = suppliersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setSuppliers(suppliersList);

        const linesSnap = await getDocs(collection(db, 'production_lines'));
        const linesList = linesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setLines(linesList);

        // Fetch Wire Receiving Data (Batches)
        const batchesSnap = await getDocs(query(collection(db, 'wire_batches'), orderBy('createdAt', 'desc')));
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

        // Fetch Wire Consumption Data (Consumed Coils)
        const coilsSnap = await getDocs(query(collection(db, 'wire_coils'), where('status', '==', 'consumed'), orderBy('consumedAt', 'desc')));
        const coilsResults = coilsSnap.docs.map(doc => {
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
            consumedByGroup: coil.consumedByGroup || '-'
          };
        });
        setWireConsumptionData(coilsResults);
        
        // Fetch Quality Data
        const templatesSnap = await getDocs(collection(db, 'quality_checklist_templates'));
        const templatesMap: Record<string, any> = {};
        templatesSnap.forEach(doc => { templatesMap[doc.id] = doc.data(); });
        setQualityTemplates(templatesMap);

        const qualitySnap = await getDocs(query(collection(db, 'quality_checklist_submissions'), orderBy('createdAt', 'desc')));
        
        // Fetch Quality Sectors
        const sectorsSnap = await getDocs(collection(db, 'quality_sectors'));
        const sectorsList = sectorsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setQualitySectors(sectorsList);

        const qualityResults = qualitySnap.docs.map(doc => {
          const sub = doc.data();
          return {
            id: doc.id,
            templateId: sub.templateId,
            templateName: templatesMap[sub.templateId]?.name || 'Modelo Excluído',
            sectorId: sub.sectorId,
            lineId: sub.lineId,
            userId: sub.userId,
            userName: sub.userName,
            shift: sub.shift,
            responses: sub.responses || [],
            timestamp: safeToDate(sub.createdAt) || new Date()
          };
        });
        setQualityData(qualityResults);

        // Fetch route submissions for pending equipment reports and ray-x
        const routesSnap = await getDocs(collection(db, 'route_submissions'));
        const routesList = routesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setRouteSubmissionsData(routesList);

        // Fetch user ray-x evaluation analytical data conditionally
        if (isAdmin || isMaster) {
          const safetySnap = await getDocs(collection(db, 'safety_observations'));
          const safetyList = safetySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setSafetyObservationsData(safetyList);

          const usersSnap = await getDocs(collection(db, 'users'));
          const usersList = usersSnap.docs
            .map(doc => ({ uid: doc.id, id: doc.id, ...doc.data() as any }))
            .filter(user => {
              const userEmail = user.email?.toLowerCase().trim() || '';
              return !MASTER_EMAILS.includes(userEmail);
            });
          setAllUsers(usersList);
        }

      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, reportType === 'dds' ? 'dds_signatures' : 'forklift_checklists');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [isManager, isAdmin, isMaster]);

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
    else if (reportType === 'pending_equipments') {
      const pendingList: any[] = [];
      routeSubmissionsData.forEach(sub => {
        if (sub.responses && Array.isArray(sub.responses)) {
          sub.responses.forEach((resp: any) => {
            if (resp.status === 'not_ok') {
              pendingList.push({
                id: `${sub.id}_${resp.equipmentId}`,
                submissionId: sub.id,
                date: safeToDate(sub.createdAt) || new Date(),
                tag: resp.equipmentTag || resp.equipmentId || 'S/T',
                name: resp.equipmentName || 'Equipamento',
                line: sub.lineName || sub.templateName || 'Geral',
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
      dataSource = pendingList;
    }
    
    return dataSource.filter(item => {
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
        matchUser = (!filterUser || 
                     item.name.toLowerCase().includes(filterUser.toLowerCase()) || 
                     item.tag.toLowerCase().includes(filterUser.toLowerCase()) ||
                     item.operator.toLowerCase().includes(filterUser.toLowerCase()) ||
                     item.reason.toLowerCase().includes(filterUser.toLowerCase()));
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
          const selectedLineObj = lines.find(l => l.id === filterLine);
          if (selectedLineObj) {
            matchLine = item.line.toLowerCase() === selectedLineObj.name.toLowerCase();
          } else {
            matchLine = item.line.toLowerCase().includes(filterLine.toLowerCase());
          }
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
      if (filterDateStart) {
        const start = new Date(filterDateStart);
        start.setHours(0, 0, 0, 0);
        matchDate = matchDate && itemDate >= start;
      }
      if (filterDateEnd) {
        const end = new Date(filterDateEnd);
        end.setHours(23, 59, 59, 999);
        matchDate = matchDate && itemDate <= end;
      }

      return matchUser && matchThemeOrStatus && matchShift && matchGroup && matchLine && matchMood && matchDate;
    });
  }, [data, forkliftData, wireReceivingData, wireConsumptionData, qualityData, routeSubmissionsData, lines, reportType, filterUser, filterTheme, filterShift, filterGroup, filterLine, filterMood, filterStatus, filterDateStart, filterDateEnd]);

  const selectedUserData = useMemo(() => {
    if (!selectedRayXUser) return null;
    const matchedUser = allUsers.find(u => u.uid === selectedRayXUser || u.id === selectedRayXUser);
    if (!matchedUser) return null;

    const uName = matchedUser.displayName || matchedUser.name || '';
    const uEmail = matchedUser.email || '';

    // Filter DDS signatures where the name matches
    const userDds = data.filter(sig => 
      (sig.userName && sig.userName.toLowerCase().trim() === uName.toLowerCase().trim()) ||
      (sig.email && sig.email.toLowerCase().trim() === uEmail.toLowerCase().trim())
    );

    // Filter forklift checklists where conductor fits
    const userForklift = forkliftData.filter(chk => 
      chk.conductorName && chk.conductorName.toLowerCase().trim() === uName.toLowerCase().trim()
    );

    // Filter wire batches received where responsibleName fits
    const userWireReceiving = wireReceivingData.filter(bat => 
      bat.responsibleName && bat.responsibleName.toLowerCase().trim() === uName.toLowerCase().trim()
    );

    // Filter wire consumption where consumedBy fits
    const userWireConsumption = wireConsumptionData.filter(coi => 
      coi.consumedBy && coi.consumedBy.toLowerCase().trim() === uName.toLowerCase().trim()
    );

    // Filter quality submissions where userName fits
    const userQuality = qualityData.filter(qlt => 
      qlt.userName && qlt.userName.toLowerCase().trim() === uName.toLowerCase().trim()
    );

    // Filter route submissions where operator fits
    const userRoutes = routeSubmissionsData.filter(rut => 
      (rut.operatorName && rut.operatorName.toLowerCase().trim() === uName.toLowerCase().trim()) ||
      rut.operatorId === matchedUser.uid
    );

    // Filter safety hazard observations where reportedBy fits
    const userSafetyObs = safetyObservationsData.filter(obs => 
      (obs.reportedById && obs.reportedById === matchedUser.uid) ||
      (obs.reportedBy && obs.reportedBy.toLowerCase().trim() === uName.toLowerCase().trim()) ||
      (obs.observerName && obs.observerName.toLowerCase().trim() === uName.toLowerCase().trim())
    );

    // Mood distribution in DDS
    const ddsMoods = userDds.reduce((acc: any, cur: any) => {
      acc[cur.mood] = (acc[cur.mood] || 0) + 1;
      return acc;
    }, {});

    // Forklift conformity rate
    const forkliftTotal = userForklift.length;
    const forkliftConforme = userForklift.filter(c => c.status === 'conforme').length;
    const forkliftCompliancePercent = forkliftTotal > 0 ? Math.round((forkliftConforme / forkliftTotal) * 100) : 100;

    // Total metric points for score
    const totalActions = userDds.length + userForklift.length + userWireReceiving.length + userWireConsumption.length + userQuality.length + userRoutes.length + userSafetyObs.length;

    return {
      profile: matchedUser,
      ddsCount: userDds.length,
      ddsList: userDds,
      ddsMoods,
      forkliftCount: forkliftTotal,
      forkliftCompliancePercent,
      forkliftList: userForklift,
      wireReceivingCount: userWireReceiving.length,
      wireReceivingList: userWireReceiving,
      wireConsumptionCount: userWireConsumption.length,
      wireConsumptionList: userWireConsumption,
      qualityCount: userQuality.length,
      qualityList: userQuality,
      routesCount: userRoutes.length,
      routesList: userRoutes,
      safetyObsCount: userSafetyObs.length,
      safetyObsList: userSafetyObs,
      totalActions
    };
  }, [selectedRayXUser, allUsers, data, forkliftData, wireReceivingData, wireConsumptionData, qualityData, routeSubmissionsData, safetyObservationsData]);

  const exportPDF = () => {
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
    doc.text(title, 14, 20);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(190, 242, 219); // emerald-100ish for secondary text on emerald bg
    doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`, 14, 28);
    doc.text(`Filtros: ${filterUser || 'Todos'} | Turno: ${filterShift} | Letra: ${filterGroup}`, pageWidth - 14, 28, { align: 'right' });
    
    let head: any[], tableData: any[];
    if (reportType === 'dds') {
      head = [['Colaborador', 'Tema', 'Turno', 'Letra', 'Executante', 'Humor', 'Data/Hora']];
      tableData = filteredData.map(item => [
        item.userName,
        item.sessionTitle,
        item.shift,
        item.group,
        item.executor,
        item.mood === 'happy' ? 'Bem' : item.mood === 'neutral' ? 'Normal' : item.mood === 'sad' ? 'Cansado' : '-',
        item.timestamp.toLocaleString('pt-BR')
      ]);
    } else if (reportType === 'forklift') {
      head = [['Equipamento', 'Condutor', 'Turno', 'Letra', 'Status', 'Data/Hora']];
      tableData = filteredData.map(item => [
        item.forkliftNumber,
        item.conductorName,
        item.shift,
        item.group,
        item.status === 'normal' ? 'CONFORME' : 'NÃO CONFORME',
        item.timestamp.toLocaleString('pt-BR')
      ]);
    } else if (reportType === 'wire_receiving') {
      head = [['NF', 'Fornecedor', 'Bobinas', 'Peso Total (kg)', 'Responsável', 'Data']];
      tableData = filteredData.map(item => [
        item.nfNumber,
        item.supplierName,
        item.coilsCount,
        item.totalWeight.toLocaleString('pt-BR'),
        item.responsibleName,
        item.timestamp.toLocaleDateString('pt-BR')
      ]);
    } else if (reportType === 'quality') {
      head = [['Colaborador', 'Checklist', 'Setor/Linha', 'Escala', 'Itens', 'Data/Hora']];
      tableData = filteredData.map(item => [
        item.userName,
        item.templateName,
        lines.find(l => l.id === item.lineId)?.name || qualitySectors.find(s => s.id === item.sectorId)?.name || 'Todos',
        item.shift,
        item.responses.length,
        item.timestamp.toLocaleString('pt-BR')
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
        item.timestamp.toLocaleString('pt-BR')
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
        item.timestamp.toLocaleString('pt-BR')
      ]);
    }

    autoTable(doc, {
      startY: 40,
      head: head,
      body: tableData,
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
          if (data.cell.raw === 'NÃO CONFORME') {
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
          `"${item.mood}"`,
          `"${item.timestamp.toISOString()}"`
        ]);
      } else if (reportType === 'forklift') {
        headers = ['Equipamento', 'Condutor', 'Turno', 'Letra', 'Status', 'Data/Hora'];
        rows = filteredData.map(item => [
          `"${item.forkliftNumber}"`,
          `"${item.conductorName}"`,
          `"${item.shift}"`,
          `"${item.group}"`,
          `"${item.status}"`,
          `"${item.timestamp.toISOString()}"`
        ]);
      } else if (reportType === 'wire_receiving') {
        headers = ['NF', 'Fornecedor', 'Bobinas', 'Peso Total (kg)', 'Responsável', 'Data'];
        rows = filteredData.map(item => [
          `"${item.nfNumber}"`,
          `"${item.supplierName}"`,
          `"${item.coilsCount}"`,
          `"${item.totalWeight}"`,
          `"${item.responsibleName}"`,
          `"${item.timestamp.toISOString()}"`
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
          `"${item.timestamp.toISOString()}"`
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
          `"${item.timestamp.toISOString()}"`
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
          `"${item.timestamp.toISOString()}"`
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
    doc.text(`INSPEÇÃO # ${check.forkliftNumber}`, 14, 25);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Data: ${format(check.timestamp, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`, 14, 33);

    // Info Table
    const infoData = [
      ['Equipamento:', check.forkliftNumber, 'Status:', check.status === 'normal' ? 'CONFORME' : 'NÃO CONFORME'],
      ['Condutor:', check.conductorName, 'Turno:', check.shift],
      ['Grupo (Letra):', check.group, 'ID:', check.id]
    ];

    autoTable(doc, {
      startY: 45,
      body: infoData,
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
    doc.text('Itens de Verificação', 14, (doc as any).lastAutoTable.finalY + 15);

    // Filter checkItemsList to only show active items OR items that have a result in this check
    // Actually, usually we show all items that are assigned to this checklist
    const checkItemsData = checkItemsList.map((item) => {
      const res = check.itemResults[item.id];
      if (!res) return null; // Skip items that don't have results in this specific check
      
      const label = item.name;
      let valueStr = res.value === true ? 'SIM' : res.value === false ? 'NÃO' : String(res.value);
      return [label, valueStr, res.status === 'normal' ? 'NORMAL' : 'ANORMAL'];
    }).filter(Boolean);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [['Item da Verificação', 'Resposta', 'Status']],
      body: checkItemsData,
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
      doc.text('Observações', 14, (doc as any).lastAutoTable.finalY + 15);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(100, 116, 139); // slate-500
      const splitNotes = doc.splitTextToSize(check.notes, pageWidth - 28);
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

  const resetFilters = () => {
    setFilterUser('');
    setFilterTheme('');
    setFilterShift('all');
    setFilterGroup('all');
    setFilterMood('all');
    setFilterStatus('all');
    setFilterLine('all');
    setFilterDateStart('');
    setFilterDateEnd('');
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
            {reportType === 'wire_receiving' && <><FileText className="w-5 h-5 text-emerald-600" /> Recebimento</>}
            {reportType === 'wire_consumption' && <><Factory className="w-5 h-5 text-emerald-600" /> Consumo</>}
            {reportType === 'quality' && <><ClipboardCheck className="w-5 h-5 text-emerald-600" /> Qualidade</>}
            {reportType === 'pending_equipments' && <><AlertTriangle className="w-5 h-5 text-emerald-600" /> Equipamentos c/ Pendência</>}
            {reportType === 'user_ray_x' && <><UserIcon className="w-5 h-5 text-emerald-600" /> Raio-X Colaborador</>}
            <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", showTypeMenu && "rotate-180")} />
          </button>

          <AnimatePresence>
            {showTypeMenu && (
              <>
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
              </>
            )}
          </AnimatePresence>
        </div>

        {reportType !== 'user_ray_x' && (
          <div className="flex flex-wrap gap-3">
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
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {reportType === 'forklift' ? (
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
                   reportType === 'pending_equipments' ? 'Equipamento / Tag' : 'Bobina / Usuário'}
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
                      reportType === 'pending_equipments' ? "Buscar por tag ou nome..." : "ID Bobina ou Usuário..."
                    }
                    className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>
              </div>

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

              {reportType !== 'wire_receiving' && (
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
                      {lines.map((line, lIdx) => (
                        <option key={`line-opt-cons-${line.id || lIdx}`} value={line.id}>{line.name}</option>
                      ))}
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
                      <option value="happy">Bem (Feliz)</option>
                      <option value="neutral">Normal</option>
                      <option value="sad">Cansado (Triste)</option>
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {reportType === 'user_ray_x' ? (
        <div className="bg-white rounded-[2rem] p-8 border border-slate-200/80 shadow-sm space-y-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-100">
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Avaliação de Desempenho Administrativo (Raio-X de Trabalho)</h2>
              <p className="text-xs text-slate-500 mt-1">
                Visão Geral Analítica de contribuições, conformidades e atividades coletadas em todo o sistema.
              </p>
            </div>
            <div className="w-full lg:w-72">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Selecionar Colaborador</label>
              <div className="relative">
                <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600" />
                <select
                  value={selectedRayXUser}
                  onChange={(e) => setSelectedRayXUser(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500 appearance-none text-slate-800"
                >
                  <option value="">-- Escolha um colaborador --</option>
                  {allUsers.map((u, uIdx) => (
                    <option key={`usr-ray-${u.uid || u.id || uIdx}`} value={u.uid || u.id}>
                      {u.displayName || u.name || 'Sem nome'} ({u.email})
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {!selectedUserData ? (
            <div className="text-center py-20 px-6 border border-slate-100 rounded-2xl bg-slate-50/50 flex flex-col items-center justify-center">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-3">
                <UserIcon className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">Selecione um Colaborador</h3>
              <p className="text-slate-400 text-xs max-w-sm mt-1">
                Escolha um usuário no menu acima para cruzar todas as informações dele registradas no sistema (DDS, Empilhadeiras, Arames, Rondas e Desvios de Segurança) e gerar um dossiê completo.
              </p>
            </div>
          ) : (
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
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
                      <span className="text-slate-400 uppercase font-black tracking-widest text-[8px]">Status</span>
                      <p className="font-bold text-emerald-600 capitalize text-xs">{selectedUserData.profile.status || 'Ativo'}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 uppercase font-black tracking-widest text-[8px]">Cadastro</span>
                      <p className="font-bold text-slate-700 text-xs">
                        {selectedUserData.profile.createdAt 
                          ? safeToDate(selectedUserData.profile.createdAt)?.toLocaleDateString('pt-BR') 
                          : 'Início'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-7 flex flex-col justify-between p-4 bg-white rounded-xl border border-slate-100 shadow-sm">
                  <div>
                    <span className="text-slate-400 uppercase font-black tracking-widest text-[8px] block">Score de Engajamento e Segurança</span>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-3xl font-black text-emerald-600 tracking-tight">{selectedUserData.totalActions * 10}</span>
                      <span className="text-xs font-bold text-slate-400">pontos acumulados</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 leading-normal">
                      Métrica de segurança ativa que cruza sua frequência em DDSs, rondas realizadas, desvios apontados e checklists de qualidade.
                    </p>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-50 flex items-center justify-between text-[11px] font-bold">
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-slate-600">DDS: {selectedUserData.ddsCount}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      <span className="text-slate-600">Rondas: {selectedUserData.routesCount}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <span className="text-slate-600">Desvios: {selectedUserData.safetyObsCount}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-slate-400" />
                      <span className="text-slate-600">Consumo: {selectedUserData.wireConsumptionCount}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="bg-slate-50/30 p-5 rounded-2xl border border-slate-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <h5 className="text-[11px] font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" /> Diálogos Diários (DDS)
                    </h5>
                    <span className="px-2 py-0.5 bg-white text-emerald-700 text-[10px] font-black rounded-lg border border-emerald-50">
                      {selectedUserData.ddsCount} Sessões
                    </span>
                  </div>
                  {selectedUserData.ddsCount === 0 ? (
                    <p className="text-[11px] text-slate-400 italic">Sem participações registradas.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {selectedUserData.ddsList.slice(0, 4).map((d: any, idx: number) => (
                        <div key={idx} className="bg-white p-2.5 rounded-lg border border-slate-100 flex items-center justify-between text-[11px]">
                          <div className="truncate pr-2">
                            <p className="font-bold text-slate-800 truncate">{d.sessionTitle}</p>
                            <p className="text-[9px] text-slate-400">Facilitador: {d.executor}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className={cn(
                              "px-1.5 py-0.5 rounded text-[8px] font-black uppercase text-white tracking-widest",
                              d.mood === 'happy' ? "bg-emerald-500" : d.mood === 'neutral' ? "bg-blue-500" : "bg-amber-500"
                            )}>
                              {d.mood === 'happy' ? 'BEM' : d.mood === 'neutral' ? 'NORMAL' : 'CANSADO'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-slate-50/30 p-5 rounded-2xl border border-slate-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <h5 className="text-[11px] font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-500" /> Desvios de Segurança Relatados
                    </h5>
                    <span className="px-2 py-0.5 bg-white text-amber-700 text-[10px] font-black rounded-lg border border-amber-50">
                      {selectedUserData.safetyObsCount} Casos
                    </span>
                  </div>
                  {selectedUserData.safetyObsCount === 0 ? (
                    <p className="text-[11px] text-slate-400 italic">Nenhum desvio relatado por este colaborador.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {selectedUserData.safetyObsList.slice(0, 3).map((o: any, idx: number) => (
                        <div key={idx} className="bg-white p-2.5 rounded-lg border border-slate-100 text-[11px] space-y-1">
                          <div className="flex items-center justify-between">
                            <span className={cn(
                              "px-1.5 py-0.5 rounded text-[8px] font-black uppercase",
                              o.severity === 'high' ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"
                            )}>
                              {o.severity || 'médio'}
                            </span>
                            <span className="text-[9px] text-slate-400">{o.createdAt ? safeToDate(o.createdAt)?.toLocaleDateString('pt-BR') : '-'}</span>
                          </div>
                          <p className="text-slate-600 font-medium line-clamp-1">{o.description}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-slate-50/30 p-5 rounded-2xl border border-slate-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <h5 className="text-[11px] font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <ClipboardCheck className="w-4 h-4 text-blue-500" /> Rondas Operacionais Realizadas
                    </h5>
                    <span className="px-2 py-0.5 bg-white text-blue-700 text-[10px] font-black rounded-lg border border-blue-50">
                      {selectedUserData.routesCount} Rondas
                    </span>
                  </div>
                  {selectedUserData.routesCount === 0 ? (
                    <p className="text-[11px] text-slate-400 italic">Sem registros de rondas.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {selectedUserData.routesList.slice(0, 3).map((r: any, idx: number) => (
                        <div key={idx} className="bg-white p-2.5 rounded-lg border border-slate-100 flex items-center justify-between text-[11px]">
                          <span className="font-bold text-slate-800 truncate max-w-[180px]">{r.templateName}</span>
                          <span className="text-[9px] text-slate-400 shrink-0">{r.createdAt ? safeToDate(r.createdAt)?.toLocaleDateString('pt-BR') : '-'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-slate-50/30 p-5 rounded-2xl border border-slate-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <h5 className="text-[11px] font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Truck className="w-4 h-4 text-emerald-600" /> Checklists e Bobinas de Arame
                    </h5>
                    <span className="px-2 py-0.5 bg-white text-emerald-700 text-[10px] font-black rounded-lg border border-emerald-50">
                      {selectedUserData.forkliftCount + selectedUserData.wireReceivingCount + selectedUserData.wireConsumptionCount} Itens
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pb-2 text-center text-xs font-bold text-slate-700">
                    <div className="bg-white p-2 rounded-xl border border-slate-100">
                      <p className="text-[8px] text-slate-400 font-extrabold uppercase">Empilhadeiras</p>
                      <p className="text-sm font-black text-slate-800 mt-1">{selectedUserData.forkliftCount}</p>
                    </div>
                    <div className="bg-white p-2 rounded-xl border border-slate-100">
                      <p className="text-[8px] text-slate-400 font-extrabold uppercase">Recebimento</p>
                      <p className="text-sm font-black text-slate-800 mt-1">{selectedUserData.wireReceivingCount}</p>
                    </div>
                    <div className="bg-white p-2 rounded-xl border border-slate-100">
                      <p className="text-[8px] text-slate-400 font-extrabold uppercase">Consumo</p>
                      <p className="text-sm font-black text-slate-800 mt-1">{selectedUserData.wireConsumptionCount}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Promo recommendation */}
              <div className="bg-emerald-50/40 p-5 rounded-2xl border border-emerald-100 flex gap-3">
                <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 shrink-0">
                  <Smile className="w-4 h-4" />
                </div>
                <div>
                  <h6 className="text-[11px] font-black text-emerald-950 uppercase tracking-widest mb-1">AVALIAÇÃO DE COMPROMETIMENTO E DESEMPENHO</h6>
                  <p className="text-[11px] text-emerald-800 leading-normal">
                    Este colaborador possui **{selectedUserData.totalActions} interações ativas** no sistema. 
                    {selectedUserData.totalActions > 25 && ' Seu altíssimo volume de interações indica engajamento exemplar, liderança ativa e conformidade excepcional de dados, tornando-o altamente elegível para futuras promoções e posições de liderança.'}
                    {selectedUserData.totalActions <= 25 && selectedUserData.totalActions > 8 && ' Perfil dinâmico e participativo com boa consistência de registros cotidianos na fábrica. Ótimo desempenho global.'}
                    {selectedUserData.totalActions <= 8 && ' Volume inicial ou moderado de interações operacionais no sistema. Recomenda-se incentivar maior participação ativa nos Diálogos de Segurança e Rondas.'}
                  </p>
                </div>
              </div>

              {/* Score Legend Explanation */}
              <div className="bg-slate-50/55 border border-slate-200/60 p-5 rounded-2xl space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  <div>
                    <h6 className="text-[11px] font-black text-slate-800 uppercase tracking-wider">Como Funciona a Pontuação de Comprometimento?</h6>
                    <p className="text-[10px] text-slate-400 font-bold">Entenda como os pontos de engajamento são computados</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Regras de Pontuação */}
                  <div className="space-y-2">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Distribuição de Pontos (+10 Pontos cada)</span>
                    <ul className="space-y-2 text-xs font-semibold text-slate-600">
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                        <span><strong>Presença em DDS:</strong> Assinatura de Diálogo de Segurança</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                        <span><strong>Rondas Operacionais:</strong> Rondas de ativos finalizadas</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                        <span><strong>Relato de Desvios:</strong> Observações de segurança coletadas</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                        <span><strong>Checklist de Frota:</strong> Inspeções pré-operacionais</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
                        <span><strong>Recebimento / Consumo:</strong> Lançamentos de bobina/peso</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
                        <span><strong>Auditoria de Qualidade:</strong> Checklists de linha realizados</span>
                      </li>
                    </ul>
                  </div>

                  {/* Níveis de Classificação */}
                  <div className="space-y-2">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Níveis de Desempenho</span>
                    <div className="space-y-2">
                      <div className="bg-white p-2.5 rounded-xl border border-slate-100 flex items-start gap-2">
                        <span className="text-emerald-600 shrink-0 font-black">★</span>
                        <div>
                          <p className="font-black text-slate-800 text-[10px] leading-tight block uppercase">Destaque Excepcional (&gt; 250 pontos)</p>
                          <p className="text-slate-400 text-[9px] font-bold leading-normal mt-0.5">Altíssimo engajamento, consistência e exemplaridade na segurança e operação.</p>
                        </div>
                      </div>
                      <div className="bg-white p-2.5 rounded-xl border border-slate-100 flex items-start gap-2">
                        <span className="text-blue-500 shrink-0 font-black">✔</span>
                        <div>
                          <p className="font-black text-slate-800 text-[10px] leading-tight block uppercase">Consistente e Ativo (90 - 250 pontos)</p>
                          <p className="text-slate-400 text-[9px] font-bold leading-normal mt-0.5">Participação regular e ativa nos processos rotineiros de conformidade.</p>
                        </div>
                      </div>
                      <div className="bg-white p-2.5 rounded-xl border border-slate-100 flex items-start gap-2">
                        <span className="text-orange-400 shrink-0 font-black">▲</span>
                        <div>
                          <p className="font-black text-slate-800 text-[10px] leading-tight block uppercase">Inserção / Moderado (&lt; 90 pontos)</p>
                          <p className="text-slate-400 text-[9px] font-bold leading-normal mt-0.5">Volume inicial de interações. Sugere-se maior envolvimento nos DDS e rondas.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
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
                    {reportType === 'dds' ? (
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
                  {(reportType === 'forklift' || reportType === 'wire_consumption' || reportType === 'quality' || reportType === 'pending_equipments') && (
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
                        expandedReceivingIds[item.id] && "bg-emerald-50/30"
                      )}
                    >
                      {reportType === 'dds' ? (
                        <>
                          <td className="px-6 py-4">
                            <p className="font-bold text-slate-900 leading-none mb-1">{item.userName}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest italic">Executante: {item.executor}</p>
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
                            {item.mood === 'happy' && <Smile className="w-6 h-6 text-emerald-500" />}
                            {item.mood === 'neutral' && <Meh className="w-6 h-6 text-amber-500" />}
                            {item.mood === 'sad' && <Frown className="w-6 h-6 text-rose-500" />}
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
                                     "bg-slate-100 text-slate-600"
                                   )}>
                                     {res.label}{res.value !== undefined ? ': ' : ''}{res.value === true ? 'Sim' : res.value === false ? 'Não' : (res.value || '')}
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
                      <p className="text-sm font-bold text-slate-900">{item.timestamp.toLocaleDateString('pt-BR')}</p>
                      <p className="text-[10px] text-slate-400 font-medium">{item.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                    </td>
                    {(reportType === 'forklift' || reportType === 'wire_consumption' || reportType === 'quality' || reportType === 'pending_equipments') && (
                      <td className="px-6 py-4 text-right">
                        {reportType === 'forklift' ? (
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
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
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
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Letra (Grupo)</label>
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
          isOpen={modalConfig.isOpen}
          onClose={closeModal}
          title={modalConfig.title}
          message={modalConfig.message}
          type={modalConfig.type}
        />
        <ConfirmationModal
          isOpen={showCleanupConfirm}
          onClose={() => setShowCleanupConfirm(false)}
          title="Excluir Registros Órfãos?"
          message={`Deseja realmente excluir ${orphanIds.length} registros de participação que não possuem DDS vinculado? Esta ação é irreversível.`}
          type="warning"
          confirmText="Sim, Excluir"
          showConfirmButton={true}
          onConfirm={() => handleCleanupOrphans(true)}
        />
      </AnimatePresence>
    </div>
  );
};

export default Reports;
