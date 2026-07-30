import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp, 
  query, 
  orderBy,
  getDocs
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { getCurrentShift, getGroupForShift, Shift } from '../lib/scaleUtils';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/errorHandler';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Wrench,
  Plus,
  Trash2,
  Edit3,
  CheckCircle2,
  Clock,
  Search,
  Filter,
  FileDown,
  Camera,
  Upload,
  X,
  Tag,
  SlidersHorizontal,
  Building2,
  Layers,
  FileText,
  AlertTriangle,
  Info,
  Check,
  Eye,
  RefreshCw,
  FolderInput,
  ShieldCheck,
  Sparkles,
  ChevronRight,
  Printer,
  LayoutGrid,
  MapPin,
  Factory
} from 'lucide-react';
import { 
  MaintenanceIssue, 
  MaintenanceEquipment, 
  MaintenanceInspectionType, 
  MaintenanceInspectionName, 
  MaintenanceResponsibleCenter, 
  MaintenanceProgrammingType, 
  MaintenanceStatus,
  ProductionLine,
  WorkSector
} from '../types';

// Default Fallbacks for first time setup
const DEFAULT_INSPECTION_TYPES = ['Mecânica', 'Elétrica', 'Instrumentação', 'Preditiva', 'Lubrificação', 'Operacional', 'Segurança'];
const DEFAULT_RESPONSIBLE_CENTERS = ['PCM / Manutenção Mecânica', 'Oficina Elétrica', 'Equipe de Instrumentação', 'Automação & Redes', 'Serviços Gerais / Civil', 'Equipe Operacional'];
const DEFAULT_PROGRAMMING_TYPES = ['Parada Programada', 'Oportunidade de Operação', 'Manutenção Corretiva', 'Intervenção Emergencial', 'Inspeção Sistemática'];
const DEFAULT_STATUSES = ['Pendente', 'Em Andamento', 'Aguardando Peça', 'Concluído'];
const DEFAULT_SHIFTS = ['1º Turno', '2º Turno', '3º Turno', 'Central'];
const DEFAULT_TEAMS = ['A', 'B', 'C', 'D', 'E'];

// Scale Shift Mappers
const mapFormShiftToScaleShift = (fShift: string): Shift => {
  if (fShift.includes('2')) return 'Turno 2';
  if (fShift.includes('3')) return 'Turno 3';
  return 'Turno 1';
};

const mapScaleShiftToFormShift = (sShift: Shift): string => {
  if (sShift === 'Turno 2') return '2º Turno';
  if (sShift === 'Turno 3') return '3º Turno';
  return '1º Turno';
};

export default function Maintenance() {
  const { user, profile, isAdmin, isMaster, logoUrl } = useAuth();

  // Tabs: 'pendencies' | 'settings'
  const [activeTab, setActiveTab] = useState<'pendencies' | 'settings'>('pendencies');
  const [loading, setLoading] = useState(true);

  // Firestore collections state
  const [issues, setIssues] = useState<MaintenanceIssue[]>([]);
  const [equipments, setEquipments] = useState<MaintenanceEquipment[]>([]);
  const [inspectionTypes, setInspectionTypes] = useState<MaintenanceInspectionType[]>([]);
  const [inspectionNames, setInspectionNames] = useState<MaintenanceInspectionName[]>([]);
  const [responsibleCenters, setResponsibleCenters] = useState<MaintenanceResponsibleCenter[]>([]);
  const [programmingTypes, setProgrammingTypes] = useState<MaintenanceProgrammingType[]>([]);
  const [statuses, setStatuses] = useState<MaintenanceStatus[]>([]);
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [sectors, setSectors] = useState<WorkSector[]>([]);

  // Filtering & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLine, setFilterLine] = useState('all');
  const [filterSector, setFilterSector] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCenter, setFilterCenter] = useState('all');
  const [filterOrigin, setFilterOrigin] = useState('all');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // Issue Form Modal State
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [editingIssue, setEditingIssue] = useState<MaintenanceIssue | null>(null);
  const [submittingIssue, setSubmittingIssue] = useState(false);

  // Form Fields
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formSector, setFormSector] = useState('');
  const [formLine, setFormLine] = useState('');
  const [formShift, setFormShift] = useState('1º Turno');
  const [formTeamLetter, setFormTeamLetter] = useState('A');
  const [formEquipmentTag, setFormEquipmentTag] = useState('');
  const [formEquipmentName, setFormEquipmentName] = useState('');
  const [formInspectionType, setFormInspectionType] = useState('');
  const [formInspectionName, setFormInspectionName] = useState('');
  const [formResponsibleCenter, setFormResponsibleCenter] = useState('');
  const [formProgrammingType, setFormProgrammingType] = useState('');
  const [formStatus, setFormStatus] = useState('Pendente');
  const [formSapNote, setFormSapNote] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formAttachments, setFormAttachments] = useState<string[]>([]);

  // Detail Modal / Photo Viewer Modal
  const [viewingIssue, setViewingIssue] = useState<MaintenanceIssue | null>(null);
  const [viewingPhotoUrl, setViewingPhotoUrl] = useState<string | null>(null);

  // Delete Confirmation Modal State ("Balão de Confirmação de Exclusão")
  const [deleteTarget, setDeleteTarget] = useState<{
    colName: string;
    id: string;
    title: string;
    subtitle?: string;
  } | null>(null);

  // Settings Sub-tab State (Admin)
  const [settingsSection, setSettingsSection] = useState<'equipments' | 'sectors' | 'lines' | 'inspections' | 'centers' | 'programming' | 'statuses'>('equipments');

  // Sectors & Production Lines State
  const [newSectorInput, setNewSectorInput] = useState('');
  const [editingSector, setEditingSector] = useState<{ id: string; name: string } | null>(null);

  const [newLineNameInput, setNewLineNameInput] = useState('');
  const [newLineSectorInput, setNewLineSectorInput] = useState('');
  const [editingLine, setEditingLine] = useState<{ id: string; name: string; sector?: string } | null>(null);

  // Tag Import Modal
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importCsvText, setImportCsvText] = useState('');
  const [importingTags, setImportingTags] = useState(false);

  // Admin Single Entry Creation Forms
  const [newTagInput, setNewTagInput] = useState('');
  const [newEquipmentNameInput, setNewEquipmentNameInput] = useState('');
  const [newEquipmentSectorInput, setNewEquipmentSectorInput] = useState('');
  const [newEquipmentLineInput, setNewEquipmentLineInput] = useState('');
  const [editingEquipment, setEditingEquipment] = useState<MaintenanceEquipment | null>(null);
  const [equipmentSearchTerm, setEquipmentSearchTerm] = useState('');
  const [newInspTypeInput, setNewInspTypeInput] = useState('');
  const [newInspNameTypeSel, setNewInspNameTypeSel] = useState('');
  const [newInspNameInput, setNewInspNameInput] = useState('');
  const [newCenterInput, setNewCenterInput] = useState('');
  const [newProgTypeInput, setNewProgTypeInput] = useState('');
  const [newStatusInput, setNewStatusInput] = useState('');

  // Tag Search for Form Dropdown
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Load Firestore collections
  useEffect(() => {
    setLoading(true);

    const unsubIssues = onSnapshot(
      query(collection(db, 'maintenance_issues'), orderBy('createdAt', 'desc')),
      (snap) => {
        const list: MaintenanceIssue[] = [];
        snap.forEach(docSnap => {
          list.push({ id: docSnap.id, ...docSnap.data() } as MaintenanceIssue);
        });
        setIssues(list);
        setLoading(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'maintenance_issues');
        setLoading(false);
      }
    );

    const unsubEquipments = onSnapshot(collection(db, 'maintenance_equipments'), (snap) => {
      const list: MaintenanceEquipment[] = [];
      snap.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() } as MaintenanceEquipment);
      });
      list.sort((a, b) => a.tag.localeCompare(b.tag));
      setEquipments(list);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'maintenance_equipments'));

    const unsubInspTypes = onSnapshot(collection(db, 'maintenance_inspection_types'), (snap) => {
      const list: MaintenanceInspectionType[] = [];
      snap.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() } as MaintenanceInspectionType);
      });
      setInspectionTypes(list);

      if (snap.empty && !localStorage.getItem('maint_seeded_insp_types_v2')) {
        localStorage.setItem('maint_seeded_insp_types_v2', 'true');
        DEFAULT_INSPECTION_TYPES.forEach(name => {
          addDoc(collection(db, 'maintenance_inspection_types'), {
            name,
            active: true,
            createdAt: serverTimestamp()
          }).catch(console.error);
        });
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'maintenance_inspection_types'));

    const unsubInspNames = onSnapshot(collection(db, 'maintenance_inspection_names'), (snap) => {
      const list: MaintenanceInspectionName[] = [];
      snap.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() } as MaintenanceInspectionName);
      });
      setInspectionNames(list);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'maintenance_inspection_names'));

    const unsubCenters = onSnapshot(collection(db, 'maintenance_responsible_centers'), (snap) => {
      const list: MaintenanceResponsibleCenter[] = [];
      snap.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() } as MaintenanceResponsibleCenter);
      });
      setResponsibleCenters(list);

      if (snap.empty && !localStorage.getItem('maint_seeded_centers_v2')) {
        localStorage.setItem('maint_seeded_centers_v2', 'true');
        DEFAULT_RESPONSIBLE_CENTERS.forEach(name => {
          addDoc(collection(db, 'maintenance_responsible_centers'), {
            name,
            active: true,
            createdAt: serverTimestamp()
          }).catch(console.error);
        });
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'maintenance_responsible_centers'));

    const unsubProgTypes = onSnapshot(collection(db, 'maintenance_programming_types'), (snap) => {
      const list: MaintenanceProgrammingType[] = [];
      snap.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() } as MaintenanceProgrammingType);
      });
      setProgrammingTypes(list);

      if (snap.empty && !localStorage.getItem('maint_seeded_prog_types_v2')) {
        localStorage.setItem('maint_seeded_prog_types_v2', 'true');
        DEFAULT_PROGRAMMING_TYPES.forEach(name => {
          addDoc(collection(db, 'maintenance_programming_types'), {
            name,
            active: true,
            createdAt: serverTimestamp()
          }).catch(console.error);
        });
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'maintenance_programming_types'));

    const unsubStatuses = onSnapshot(collection(db, 'maintenance_statuses'), (snap) => {
      const list: MaintenanceStatus[] = [];
      snap.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() } as MaintenanceStatus);
      });
      setStatuses(list);

      if (snap.empty && !localStorage.getItem('maint_seeded_statuses_v2')) {
        localStorage.setItem('maint_seeded_statuses_v2', 'true');
        DEFAULT_STATUSES.forEach(name => {
          addDoc(collection(db, 'maintenance_statuses'), {
            name,
            active: true,
            createdAt: serverTimestamp()
          }).catch(console.error);
        });
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'maintenance_statuses'));

    const unsubLines = onSnapshot(collection(db, 'maintenance_lines'), (snap) => {
      const list: ProductionLine[] = [];
      snap.forEach(docSnap => {
        const d = docSnap.data();
        if (d.active !== false) {
          list.push({ id: docSnap.id, ...d } as ProductionLine);
        }
      });
      setLines(list);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'maintenance_lines'));

    const unsubSectors = onSnapshot(collection(db, 'work_sectors'), (snap) => {
      const list: WorkSector[] = [];
      snap.forEach(docSnap => {
        const d = docSnap.data();
        if (d.active !== false) {
          list.push({ id: docSnap.id, ...d } as WorkSector);
        }
      });
      setSectors(list);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'work_sectors'));

    return () => {
      unsubIssues();
      unsubEquipments();
      unsubInspTypes();
      unsubInspNames();
      unsubCenters();
      unsubProgTypes();
      unsubStatuses();
      unsubLines();
      unsubSectors();
    };
  }, []);

  // Compute lists for UI with fallback options if collections are empty
  const availableInspectionTypes = inspectionTypes.length > 0 
    ? inspectionTypes.map(t => t.name)
    : DEFAULT_INSPECTION_TYPES;

  const availableResponsibleCenters = (responsibleCenters.length > 0
    ? responsibleCenters.map(c => c.name)
    : DEFAULT_RESPONSIBLE_CENTERS
  ).slice().sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));

  const availableProgrammingTypes = programmingTypes.length > 0
    ? programmingTypes.map(p => p.name)
    : DEFAULT_PROGRAMMING_TYPES;

  const availableStatuses = statuses.length > 0
    ? statuses.map(s => s.name)
    : DEFAULT_STATUSES;

  // Sorted lines in alphabetical order
  const sortedLines = [...lines].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));

  // Filter inspection names based on current form Inspection Type
  const filteredInspectionNames = inspectionNames
    .filter(n => !formInspectionType || n.inspectionTypeName === formInspectionType)
    .map(n => n.name);

  // Filtered maintenance issues list
  const filteredIssues = issues.filter(issue => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      !searchTerm ||
      issue.equipmentTag?.toLowerCase().includes(searchLower) ||
      issue.equipmentName?.toLowerCase().includes(searchLower) ||
      issue.description?.toLowerCase().includes(searchLower) ||
      issue.sapNote?.toLowerCase().includes(searchLower) ||
      issue.createdByName?.toLowerCase().includes(searchLower);

    const matchesLine = filterLine === 'all' || issue.line === filterLine;
    const matchesSector = filterSector === 'all' || issue.sector === filterSector;
    const matchesStatus = filterStatus === 'all' || issue.status === filterStatus;
    const matchesCenter = filterCenter === 'all' || issue.responsibleCenter === filterCenter;
    const matchesOrigin = filterOrigin === 'all' || (issue.origin || 'Manual') === filterOrigin;

    let matchesDate = true;
    if (filterStartDate) {
      matchesDate = matchesDate && issue.date >= filterStartDate;
    }
    if (filterEndDate) {
      matchesDate = matchesDate && issue.date <= filterEndDate;
    }

    return matchesSearch && matchesLine && matchesSector && matchesStatus && matchesCenter && matchesOrigin && matchesDate;
  });

  // Calculate quick metrics
  const totalPendingCount = issues.filter(i => i.status !== 'Concluído').length;
  const totalCompletedCount = issues.filter(i => i.status === 'Concluído').length;
  const routeOriginCount = issues.filter(i => i.origin === 'Rota Operacional').length;

  // Reset Issue Form
  const handleOpenNewIssueModal = () => {
    setEditingIssue(null);
    const todayStr = new Date().toISOString().split('T')[0];
    setFormDate(todayStr);
    setFormSector(sectors[0]?.name || '');
    setFormLine(lines[0]?.name || '');

    // Auto calculate current shift and team letter based on system scale
    const currentScaleShift = getCurrentShift();
    const autoShift = mapScaleShiftToFormShift(currentScaleShift);
    const autoGroup = getGroupForShift(new Date(), currentScaleShift);

    setFormShift(autoShift);
    setFormTeamLetter(autoGroup);
    setFormEquipmentTag('');
    setFormEquipmentName('');
    setTagSearchQuery('');
    setFormInspectionType(availableInspectionTypes[0] || '');
    setFormInspectionName('');
    setFormResponsibleCenter(availableResponsibleCenters[0] || '');
    setFormProgrammingType(availableProgrammingTypes[0] || '');
    setFormStatus('Pendente');
    setFormSapNote('');
    setFormDescription('');
    setFormAttachments([]);
    setIsIssueModalOpen(true);
  };

  const handleOpenEditIssueModal = (issue: MaintenanceIssue) => {
    setEditingIssue(issue);
    setFormDate(issue.date || new Date().toISOString().split('T')[0]);
    setFormSector(issue.sector || '');
    setFormLine(issue.line || '');
    setFormShift(issue.shift || '1º Turno');
    setFormTeamLetter(issue.teamLetter || 'A');
    setFormEquipmentTag(issue.equipmentTag || '');
    setFormEquipmentName(issue.equipmentName || '');
    setTagSearchQuery(issue.equipmentTag || '');
    setFormInspectionType(issue.inspectionType || availableInspectionTypes[0] || '');
    setFormInspectionName(issue.inspectionName || '');
    setFormResponsibleCenter(issue.responsibleCenter || availableResponsibleCenters[0] || '');
    setFormProgrammingType(issue.programmingType || availableProgrammingTypes[0] || '');
    setFormStatus(issue.status || 'Pendente');
    setFormSapNote(issue.sapNote || '');
    setFormDescription(issue.description || '');
    setFormAttachments(issue.attachments || []);
    setIsIssueModalOpen(true);
  };

  // Helper to compress camera / album photos into lightweight JPEG base64 (max 1280px, ~150-250KB)
  const processAndCompressImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxDim = 1280;

          if (width > height) {
            if (width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
            resolve(dataUrl);
          } else {
            resolve((e.target?.result as string) || '');
          }
        };
        img.onerror = () => {
          resolve((e.target?.result as string) || '');
        };
        img.src = e.target?.result as string;
      };
      reader.onerror = () => {
        resolve('');
      };
      reader.readAsDataURL(file);
    });
  };

  // Image Upload handler (Convert to Base64 with compression)
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputEl = e.target;
    const files = inputEl.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files) as File[];
    for (const file of fileList) {
      try {
        const compressedDataUrl = await processAndCompressImage(file);
        if (compressedDataUrl) {
          setFormAttachments(prev => [...prev, compressedDataUrl]);
        }
      } catch (err) {
        console.error('Erro ao processar foto:', err);
      }
    }
    // Reseta o input para permitir capturar/selecionar novamente
    inputEl.value = '';
  };

  const handleRemoveAttachment = (index: number) => {
    setFormAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // Save Issue
  const handleSaveIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEquipmentTag.trim()) {
      alert('Por favor, informe a Tag do equipamento.');
      return;
    }
    if (!formDescription.trim()) {
      alert('Por favor, descreva a pendência.');
      return;
    }

    setSubmittingIssue(true);
    try {
      const issueData = {
        date: formDate,
        sector: formSector,
        line: formLine,
        shift: formShift,
        teamLetter: formTeamLetter,
        equipmentTag: formEquipmentTag.toUpperCase().trim(),
        equipmentName: formEquipmentName.trim() || 'Equipamento',
        inspectionType: formInspectionType,
        inspectionName: formInspectionName,
        responsibleCenter: formResponsibleCenter,
        programmingType: formProgrammingType,
        status: formStatus,
        sapNote: formSapNote.trim(),
        description: formDescription.trim(),
        attachments: formAttachments,
        origin: editingIssue ? (editingIssue.origin || 'Manual') : 'Manual',
        createdBy: editingIssue ? editingIssue.createdBy : user?.uid,
        createdByName: editingIssue ? editingIssue.createdByName : (profile?.displayName || user?.email || 'Usuário'),
        updatedAt: serverTimestamp(),
      };

      if (editingIssue) {
        if (formStatus === 'Concluído' && editingIssue.status !== 'Concluído') {
          (issueData as any).resolvedAt = serverTimestamp();
          (issueData as any).resolvedBy = user?.uid;
          (issueData as any).resolvedByName = profile?.displayName || user?.email || 'Usuário';
        }
        await updateDoc(doc(db, 'maintenance_issues', editingIssue.id), issueData);
      } else {
        await addDoc(collection(db, 'maintenance_issues'), {
          ...issueData,
          createdAt: serverTimestamp()
        });
      }

      setIsIssueModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, editingIssue ? OperationType.UPDATE : OperationType.CREATE, 'maintenance_issues');
    } finally {
      setSubmittingIssue(false);
    }
  };

  // Quick Complete
  const handleToggleCompleteIssue = async (issue: MaintenanceIssue) => {
    const isNowCompleted = issue.status !== 'Concluído';
    try {
      await updateDoc(doc(db, 'maintenance_issues', issue.id), {
        status: isNowCompleted ? 'Concluído' : 'Pendente',
        resolvedAt: isNowCompleted ? serverTimestamp() : null,
        resolvedBy: isNowCompleted ? user?.uid : null,
        resolvedByName: isNowCompleted ? (profile?.displayName || user?.email || 'Usuário') : null,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'maintenance_issues');
    }
  };

  // Delete Issue Trigger
  const handleDeleteIssue = (issue: MaintenanceIssue) => {
    setDeleteTarget({
      colName: 'maintenance_issues',
      id: issue.id,
      title: `Pendência TAG ${issue.equipmentTag}`,
      subtitle: issue.description
    });
  };

  // Delete Admin Item Trigger
  const handleDeleteAdminItem = (colName: string, id: string, itemName?: string) => {
    setDeleteTarget({
      colName,
      id,
      title: itemName || 'Item Selecionado'
    });
  };

  // Execute Delete Execution
  const executeDeleteTarget = async () => {
    if (!deleteTarget) return;
    const { colName, id } = deleteTarget;
    setDeleteTarget(null);
    try {
      await deleteDoc(doc(db, colName, id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, colName);
    }
  };

  // Download CSV template for importing TAGs
  const handleDownloadTemplate = () => {
    const headers = "Setor;Linha;TAG;Nome do Equipamento";
    const rows = [
      "Cortadeira;MS1;101-EX-01;Exaustor Principal",
      "Tratamento de Água;ETA;101-BC-02;Bomba de Pasta",
      "Enfardadeira;Mesa 1;102-RO-05;Rolo Pressionador"
    ];
    const csvContent = "\uFEFF" + [headers, ...rows].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'modelo_importacao_tags.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Upload CSV or TXT file into state
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === 'string') {
        setImportCsvText(text);
      }
    };
    reader.readAsText(file);
  };

  // Admin Tag CSV Import Handler
  // Sequence: Setor; Linha; TAG; Nome do Equipamento
  const handleProcessImportTags = async () => {
    if (!importCsvText.trim()) return;
    setImportingTags(true);

    try {
      // Remove BOM if present and split lines cleanly handling \r\n
      const cleanText = importCsvText.replace(/^\uFEFF/, '').trim();
      const inputLines = cleanText.split(/\r?\n/);
      let count = 0;

      // Track created sectors and lines locally to avoid duplicate DB calls during batch execution
      const knownSectors = new Set(sectors.map(s => s.name.trim().toUpperCase()));
      const knownLines = new Set(lines.map(l => `${(l.sector || '').trim().toUpperCase()}::${l.name.trim().toUpperCase()}`));

      // Local map of equipments by tag (upper-case) to handle updates or duplicate tags in the same batch
      const localEquipmentsMap = new Map<string, { id: string; name: string; sector: string; line: string }>();
      equipments.forEach(e => {
        localEquipmentsMap.set(e.tag.toUpperCase(), { id: e.id, name: e.name, sector: e.sector || '', line: e.line || '' });
      });

      for (const rawLine of inputLines) {
        const lineStr = rawLine.trim();
        if (!lineStr) continue;

        let sectorStr = '';
        let lineValStr = '';
        let tagStr = '';
        let nameStr = '';

        let parts: string[] = [];
        if (lineStr.includes(';')) {
          parts = lineStr.split(';');
        } else if (lineStr.includes('\t')) {
          parts = lineStr.split('\t');
        } else if (lineStr.includes(',')) {
          parts = lineStr.split(',');
        } else {
          parts = [lineStr];
        }

        // Clean quotes and extra whitespace from each column part
        parts = parts.map(p => p.trim().replace(/^["']|["']$/g, '').trim());

        if (parts.length >= 5) {
          // If 5 columns provided (legacy format: Area; Setor; Linha; TAG; Nome)
          sectorStr = parts[1] || parts[0] || '';
          lineValStr = parts[2] || '';
          tagStr = parts[3]?.toUpperCase() || '';
          nameStr = parts[4] || tagStr;
        } else if (parts.length === 4) {
          // Standard sequence: Setor; Linha; TAG; Nome do Equipamento
          sectorStr = parts[0] || '';
          lineValStr = parts[1] || '';
          tagStr = parts[2]?.toUpperCase() || '';
          nameStr = parts[3] || tagStr;
        } else if (parts.length === 3) {
          // Sequence: Setor; Linha; TAG
          sectorStr = parts[0] || '';
          lineValStr = parts[1] || '';
          tagStr = parts[2]?.toUpperCase() || '';
          nameStr = tagStr;
        } else if (parts.length === 2) {
          // Sequence: TAG; Nome
          tagStr = parts[0]?.toUpperCase() || '';
          nameStr = parts[1] || tagStr;
        } else {
          tagStr = lineStr.toUpperCase().replace(/^["']|["']$/g, '').trim();
          nameStr = tagStr;
        }

        // Header check: skip if header row
        const firstUpper = (parts[0] || '').toUpperCase();
        const tagUpper = tagStr.toUpperCase();
        if (
          firstUpper === 'SETOR' ||
          firstUpper === 'ÁREA' ||
          firstUpper === 'AREA' ||
          tagUpper === 'TAG' ||
          tagUpper === 'CÓDIGO' ||
          tagUpper === 'CODIGO' ||
          tagUpper === 'LINHA' ||
          !tagStr
        ) {
          continue;
        }

        // Check if equipment already exists
        const existingEq = localEquipmentsMap.get(tagStr);

        if (existingEq) {
          await updateDoc(doc(db, 'maintenance_equipments', existingEq.id), {
            name: nameStr || existingEq.name,
            sector: sectorStr || existingEq.sector,
            line: lineValStr || existingEq.line || '',
            updatedAt: serverTimestamp()
          });
          localEquipmentsMap.set(tagStr, {
            id: existingEq.id,
            name: nameStr || existingEq.name,
            sector: sectorStr || existingEq.sector,
            line: lineValStr || existingEq.line
          });
          count++;
        } else {
          const docRef = await addDoc(collection(db, 'maintenance_equipments'), {
            tag: tagStr,
            name: nameStr,
            sector: sectorStr,
            line: lineValStr,
            active: true,
            createdAt: serverTimestamp()
          });
          localEquipmentsMap.set(tagStr, {
            id: docRef.id,
            name: nameStr,
            sector: sectorStr,
            line: lineValStr
          });
          count++;
        }

        // Auto-create sector if provided and not existing
        if (sectorStr && !knownSectors.has(sectorStr.toUpperCase())) {
          try {
            await addDoc(collection(db, 'work_sectors'), {
              name: sectorStr,
              active: true,
              createdAt: serverTimestamp()
            });
            knownSectors.add(sectorStr.toUpperCase());
          } catch (e) {
            console.warn("Auto create sector error:", e);
          }
        }

        // Auto-create production line if provided and not existing
        const lineKey = `${sectorStr.toUpperCase()}::${lineValStr.toUpperCase()}`;
        if (lineValStr && !knownLines.has(lineKey)) {
          try {
            await addDoc(collection(db, 'maintenance_lines'), {
              name: lineValStr,
              sector: sectorStr,
              active: true,
              createdAt: serverTimestamp()
            });
            knownLines.add(lineKey);
          } catch (e) {
            console.warn("Auto create line error:", e);
          }
        }
      }

      alert(`${count} equipamento(s) importado(s)/atualizado(s) com sucesso!`);
      setIsImportModalOpen(false);
      setImportCsvText('');
    } catch (err) {
      console.error('Erro na importação de TAGs:', err);
      alert('Erro ao importar lista de TAGs. Verifique a formatação.');
    } finally {
      setImportingTags(false);
    }
  };

  // Admin Single Add Equipment
  const handleAddSingleEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagInput.trim()) return;
    try {
      await addDoc(collection(db, 'maintenance_equipments'), {
        tag: newTagInput.trim().toUpperCase(),
        name: newEquipmentNameInput.trim() || newTagInput.trim().toUpperCase(),
        sector: newEquipmentSectorInput || '',
        line: newEquipmentLineInput || '',
        active: true,
        createdAt: serverTimestamp()
      });
      setNewTagInput('');
      setNewEquipmentNameInput('');
      setNewEquipmentSectorInput('');
      setNewEquipmentLineInput('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'maintenance_equipments');
    }
  };

  // Admin Save Edit Equipment
  const handleSaveEditEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEquipment || !editingEquipment.tag.trim()) return;
    try {
      await updateDoc(doc(db, 'maintenance_equipments', editingEquipment.id), {
        tag: editingEquipment.tag.trim().toUpperCase(),
        name: editingEquipment.name.trim() || editingEquipment.tag.trim().toUpperCase(),
        sector: editingEquipment.sector || '',
        line: editingEquipment.line || '',
        updatedAt: serverTimestamp()
      });
      setEditingEquipment(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'maintenance_equipments');
    }
  };

  // Filtered equipments list for admin settings
  const filteredEquipments = equipments.filter(eq => {
    const matchesSearch = !equipmentSearchTerm || 
      eq.tag.toLowerCase().includes(equipmentSearchTerm.toLowerCase()) || 
      eq.name.toLowerCase().includes(equipmentSearchTerm.toLowerCase());
    return matchesSearch;
  });

  // Admin Single Add Inspection Type
  const handleAddInspectionType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInspTypeInput.trim()) return;
    try {
      await addDoc(collection(db, 'maintenance_inspection_types'), {
        name: newInspTypeInput.trim(),
        active: true,
        createdAt: serverTimestamp()
      });
      setNewInspTypeInput('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'maintenance_inspection_types');
    }
  };

  // Admin Single Add Inspection Name
  const handleAddInspectionName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInspNameInput.trim() || !newInspNameTypeSel) return;
    try {
      await addDoc(collection(db, 'maintenance_inspection_names'), {
        inspectionTypeName: newInspNameTypeSel,
        name: newInspNameInput.trim(),
        active: true,
        createdAt: serverTimestamp()
      });
      setNewInspNameInput('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'maintenance_inspection_names');
    }
  };

  // Admin Add Responsible Center
  const handleAddResponsibleCenter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCenterInput.trim()) return;
    try {
      await addDoc(collection(db, 'maintenance_responsible_centers'), {
        name: newCenterInput.trim(),
        active: true,
        createdAt: serverTimestamp()
      });
      setNewCenterInput('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'maintenance_responsible_centers');
    }
  };

  // Admin Add Programming Type
  const handleAddProgrammingType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProgTypeInput.trim()) return;
    try {
      await addDoc(collection(db, 'maintenance_programming_types'), {
        name: newProgTypeInput.trim(),
        active: true,
        createdAt: serverTimestamp()
      });
      setNewProgTypeInput('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'maintenance_programming_types');
    }
  };

  // Admin Add Sector
  const handleAddSector = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSectorInput.trim()) return;
    try {
      await addDoc(collection(db, 'work_sectors'), {
        name: newSectorInput.trim(),
        active: true,
        createdAt: serverTimestamp()
      });
      setNewSectorInput('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'work_sectors');
    }
  };

  // Admin Save Edit Sector
  const handleSaveEditSector = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSector || !editingSector.name.trim()) return;
    try {
      await updateDoc(doc(db, 'work_sectors', editingSector.id), {
        name: editingSector.name.trim(),
        updatedAt: serverTimestamp()
      });
      setEditingSector(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'work_sectors');
    }
  };

  // Admin Add Maintenance Line
  const handleAddLine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLineNameInput.trim()) return;
    try {
      await addDoc(collection(db, 'maintenance_lines'), {
        name: newLineNameInput.trim(),
        sector: newLineSectorInput.trim(),
        active: true,
        createdAt: serverTimestamp()
      });
      setNewLineNameInput('');
      setNewLineSectorInput('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'maintenance_lines');
    }
  };

  // Admin Save Edit Maintenance Line
  const handleSaveEditLine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLine || !editingLine.name.trim()) return;
    try {
      await updateDoc(doc(db, 'maintenance_lines', editingLine.id), {
        name: editingLine.name.trim(),
        sector: editingLine.sector ? editingLine.sector.trim() : '',
        updatedAt: serverTimestamp()
      });
      setEditingLine(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'maintenance_lines');
    }
  };

  // Admin Add Status
  const handleAddStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStatusInput.trim()) return;
    try {
      await addDoc(collection(db, 'maintenance_statuses'), {
        name: newStatusInput.trim(),
        active: true,
        createdAt: serverTimestamp()
      });
      setNewStatusInput('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'maintenance_statuses');
    }
  };



  // Helper PDF branding footer
  const addSecAppPdfFooter = async (docPdf: jsPDF) => {
    const totalPages = (docPdf as any).internal.getNumberOfPages();
    let logoBase64: string | null = null;
    
    try {
      logoBase64 = await new Promise<string | null>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              resolve(canvas.toDataURL('image/png'));
              return;
            }
          } catch {
            // ignore
          }
          resolve(null);
        };
        img.onerror = () => resolve(null);
        img.src = logoUrl || '/logo_file/logo_400pixel.png';
      });
    } catch {
      logoBase64 = null;
    }

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      docPdf.setPage(pageNum);
      
      const pageWidth = docPdf.internal.pageSize.getWidth();
      const pageHeight = docPdf.internal.pageSize.getHeight();
      const footerY = pageHeight - 10;

      docPdf.setDrawColor(226, 232, 240);
      docPdf.setLineWidth(0.3);
      docPdf.line(15, footerY - 4, pageWidth - 15, footerY - 4);

      let textStartX = 15;
      if (logoBase64) {
        try {
          docPdf.addImage(logoBase64, 'PNG', 15, footerY - 3, 10, 4);
          textStartX = 27;
        } catch {
          // ignore
        }
      }

      if (logoBase64) {
        docPdf.setFont('helvetica', 'normal');
        docPdf.setFontSize(8);
        docPdf.setTextColor(148, 163, 184);
        docPdf.text('| Sistema de Gestão Operacional', textStartX, footerY + 0.8);
      } else {
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(8);
        docPdf.setTextColor(5, 150, 105);
        docPdf.text('SecApp', textStartX, footerY + 0.8);

        const secAppWidth = docPdf.getTextWidth('SecApp');
        docPdf.setFont('helvetica', 'normal');
        docPdf.setTextColor(148, 163, 184);
        docPdf.text(' | Sistema de Gestão Operacional', textStartX + secAppWidth, footerY + 0.8);
      }

      docPdf.text(`Página ${pageNum} de ${totalPages}`, pageWidth - 15, footerY + 0.8, { align: 'right' });
    }
  };

  // Export PDF Report for Filtered Issues
  const handleExportPDF = async () => {
    const docPdf = new jsPDF('landscape');

    // Header
    docPdf.setFillColor(15, 23, 42); // slate-900
    docPdf.rect(0, 0, 297, 24, 'F');

    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(14);
    docPdf.setTextColor(255, 255, 255);
    docPdf.text('RELATÓRIO DE PENDÊNCIAS DE MANUTENÇÃO', 15, 15);

    docPdf.setFont('helvetica', 'normal');
    docPdf.setFontSize(9);
    docPdf.setTextColor(148, 163, 184);
    docPdf.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 282, 15, { align: 'right' });

    // Table mapping
    const tableData = filteredIssues.map((issue, idx) => [
      (idx + 1).toString(),
      issue.date ? issue.date.split('-').reverse().join('/') : '-',
      issue.area || '-',
      issue.line || '-',
      issue.equipmentTag || '-',
      issue.equipmentName || '-',
      issue.inspectionType || '-',
      issue.responsibleCenter || '-',
      issue.status || 'Pendente',
      issue.sapNote || '-',
      issue.description || '-',
      issue.origin || 'Manual'
    ]);

    autoTable(docPdf, {
      startY: 28,
      head: [['#', 'Data', 'Área', 'Linha', 'TAG', 'Equipamento', 'Tipo Insp.', 'Centro Resp.', 'Status', 'Nota SAP', 'Descrição', 'Origem']],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [5, 150, 105], // emerald-600
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
        halign: 'center'
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 2,
        valign: 'middle'
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        1: { halign: 'center', cellWidth: 18 },
        2: { cellWidth: 18 },
        3: { cellWidth: 16 },
        4: { fontStyle: 'bold', cellWidth: 22 },
        5: { cellWidth: 32 },
        6: { cellWidth: 22 },
        7: { cellWidth: 28 },
        8: { halign: 'center', fontStyle: 'bold', cellWidth: 20 },
        9: { cellWidth: 18 },
        10: { cellWidth: 50 },
        11: { halign: 'center', cellWidth: 18 }
      }
    });

    await addSecAppPdfFooter(docPdf);
    docPdf.save(`Pendencias_Manutencao_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // Filtered Equipment tags for tag selector in modal
  const searchedTags = equipments.filter(eq => {
    const eqSecUpper = (eq.sector || '').trim().toUpperCase();
    const eqLineUpper = (eq.line || '').trim().toUpperCase();
    const formSecUpper = (formSector || '').trim().toUpperCase();
    const formLineUpper = (formLine || '').trim().toUpperCase();

    // If sector is selected, match equipment sector (or allow if eq has no sector assigned)
    const matchesSector = !formSecUpper || !eqSecUpper || eqSecUpper === formSecUpper;
    // If line is selected, match equipment line (or allow if eq has no line assigned)
    const matchesLine = !formLineUpper || !eqLineUpper || eqLineUpper === formLineUpper;

    const queryUpper = (tagSearchQuery || '').trim().toUpperCase();
    const matchesQuery = !queryUpper || 
      eq.tag.toUpperCase().includes(queryUpper) || 
      eq.name.toUpperCase().includes(queryUpper);

    return matchesSector && matchesLine && matchesQuery;
  }).slice(0, 30);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12 px-4" id="maintenance-container">
      {/* Top Banner */}
      <div className="relative overflow-hidden bg-slate-900 rounded-[2.5rem] text-white p-8 md:p-10 shadow-xl border border-slate-800">
        <div className="absolute inset-0 bg-radial-gradient from-emerald-900/30 via-transparent to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-600/20 text-emerald-400 rounded-2xl border border-emerald-500/20">
                <Wrench className="w-8 h-8" />
              </div>
              <h1 className="text-3xl font-black tracking-tight font-sans">Módulo de Manutenção</h1>
            </div>
            <p className="text-slate-400 text-sm font-medium">
              Gestão de pendências de equipamentos, TAGs, inspeções e integração com rotas operacionais.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab('pendencies')}
              className={cn(
                "px-5 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider transition-all",
                activeTab === 'pendencies'
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 border border-emerald-500"
                  : "bg-slate-800/60 text-slate-300 hover:bg-slate-800 border border-slate-700/50"
              )}
            >
              Pendências
            </button>

            {(isAdmin || isMaster) && (
              <button
                onClick={() => setActiveTab('settings')}
                className={cn(
                  "px-5 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2",
                  activeTab === 'settings'
                    ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 border border-emerald-500"
                    : "bg-slate-800/60 text-slate-300 hover:bg-slate-800 border border-slate-700/50"
                )}
              >
                <SlidersHorizontal className="w-4 h-4" />
                Cadastros & TAGs
              </button>
            )}
          </div>
        </div>
      </div>

      {/* METRICS CARDS */}
      {activeTab === 'pendencies' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl border border-amber-100">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <span className="text-2xl font-black text-slate-900">{totalPendingCount}</span>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pendências Abertas</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <span className="text-2xl font-black text-slate-900">{totalCompletedCount}</span>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pendências Concluídas</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl border border-blue-100">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <span className="text-2xl font-black text-slate-900">{routeOriginCount}</span>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Vindas de Rota Operacional</p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 1: PENDENCIES */}
      {activeTab === 'pendencies' && (
        <div className="space-y-6">
          {/* Action Bar & Filters */}
          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-emerald-600" />
                <h2 className="text-lg font-bold text-slate-900">Filtrar e Buscar Pendências</h2>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportPDF}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all flex items-center gap-2 border border-slate-200"
                >
                  <FileDown className="w-4 h-4 text-emerald-600" />
                  Imprimir / Exportar PDF
                </button>

                <button
                  onClick={handleOpenNewIssueModal}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Nova Pendência
                </button>
              </div>
            </div>

            {/* Filters grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div>
                <input
                  type="text"
                  placeholder="Buscar TAG, Equipamento, SAP..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="all">Todos os Status</option>
                  {availableStatuses.map(st => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>

              <div>
                <select
                  value={filterSector}
                  onChange={(e) => setFilterSector(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="all">Todos os Setores</option>
                  {sectors.map(s => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <select
                  value={filterLine}
                  onChange={(e) => setFilterLine(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="all">Todas as Linhas</option>
                  {sortedLines.map(l => (
                    <option key={l.id} value={l.name}>{l.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <select
                  value={filterCenter}
                  onChange={(e) => setFilterCenter(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="all">Todos os Centros</option>
                  {availableResponsibleCenters.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <select
                  value={filterOrigin}
                  onChange={(e) => setFilterOrigin(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="all">Todas as Origens</option>
                  <option value="Manual">Manual</option>
                  <option value="Rota Operacional">Rota Operacional</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table / List */}
          {loading ? (
            <div className="p-12 text-center bg-white rounded-3xl border border-slate-100">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mx-auto" />
              <p className="text-slate-400 font-bold text-xs mt-3">Carregando pendências de manutenção...</p>
            </div>
          ) : filteredIssues.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-[2rem] border border-slate-100 space-y-3">
              <Wrench className="w-12 h-12 text-slate-300 mx-auto" />
              <h3 className="text-base font-bold text-slate-700">Nenhuma pendência encontrada</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Não há registros correspondentes aos filtros aplicados. Clique no botão de "Nova Pendência" para registrar.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                      <th className="p-4">Status</th>
                      <th className="p-4">Data</th>
                      <th className="p-4">TAG / Equipamento</th>
                      <th className="p-4">Setor / Linha</th>
                      <th className="p-4">Tipo Inspeção / Centro</th>
                      <th className="p-4">Nota SAP</th>
                      <th className="p-4">Descrição</th>
                      <th className="p-4 text-center">Fotos</th>
                      <th className="p-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-xs font-medium text-slate-700">
                    {filteredIssues.map((issue) => {
                      const isDone = issue.status === 'Concluído';
                      return (
                        <tr key={issue.id} className="hover:bg-slate-50/60 transition-all">
                          <td className="p-4 whitespace-nowrap">
                            <span className={cn(
                              "px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase border inline-flex items-center gap-1",
                              isDone
                                ? "bg-emerald-50 border-emerald-100 text-emerald-800"
                                : issue.status === 'Aguardando Peça'
                                ? "bg-amber-50 border-amber-100 text-amber-700"
                                : "bg-sky-50 border-sky-100 text-sky-800"
                            )}>
                              {isDone ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <Clock className="w-3 h-3" />}
                              {issue.status || 'Pendente'}
                            </span>
                          </td>

                          <td className="p-4 whitespace-nowrap font-bold text-slate-800">
                            {issue.date ? issue.date.split('-').reverse().join('/') : '-'}
                          </td>

                          <td className="p-4">
                            <span className="font-extrabold text-slate-900 block font-mono text-xs">{issue.equipmentTag}</span>
                            <span className="text-[11px] text-slate-500 line-clamp-1">{issue.equipmentName}</span>
                          </td>

                          <td className="p-4 whitespace-nowrap">
                            <span className="font-bold text-slate-800 block">{issue.sector || 'Geral'}</span>
                            <span className="text-[10px] text-slate-400 font-semibold">{issue.line || 'Geral'}</span>
                          </td>

                          <td className="p-4">
                            <span className="font-bold text-slate-800 block">{issue.inspectionType || '-'}</span>
                            <span className="text-[10px] text-slate-500">{issue.responsibleCenter || '-'}</span>
                          </td>

                          <td className="p-4 whitespace-nowrap font-mono text-xs font-bold text-slate-700">
                            {issue.sapNote || '-'}
                          </td>

                          <td className="p-4 max-w-xs">
                            <p className="text-xs text-slate-700 line-clamp-2 font-medium">{issue.description}</p>
                            {issue.origin === 'Rota Operacional' && (
                              <span className="inline-block mt-1 text-[9px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                Rota Operacional
                              </span>
                            )}
                          </td>

                          <td className="p-4 text-center whitespace-nowrap">
                            {issue.attachments && issue.attachments.length > 0 ? (
                              <button
                                onClick={() => setViewingPhotoUrl(issue.attachments[0])}
                                className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 mx-auto"
                              >
                                <Camera className="w-3 h-3" />
                                {issue.attachments.length} foto(s)
                              </button>
                            ) : (
                              <span className="text-slate-300 text-[10px] italic">Sem anexos</span>
                            )}
                          </td>

                          <td className="p-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleToggleCompleteIssue(issue)}
                                title={isDone ? "Reabrir Pendência" : "Concluir Pendência"}
                                className={cn(
                                  "p-1.5 rounded-lg border transition-all",
                                  isDone
                                    ? "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
                                    : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                )}
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>

                              <button
                                onClick={() => handleOpenEditIssueModal(issue)}
                                title="Editar"
                                className="p-1.5 bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 rounded-lg transition-all"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>

                              {(isAdmin || isMaster) && (
                                <button
                                  onClick={() => handleDeleteIssue(issue)}
                                  title="Excluir"
                                  className="p-1.5 bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 rounded-lg transition-all"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SETTINGS & TAGS (ADMIN & MASTER) */}
      {activeTab === 'settings' && (isAdmin || isMaster) && (
        <div className="space-y-6">
          {/* Sub-navigation bar */}
          <div className="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm flex flex-wrap gap-2">
            <button
              onClick={() => setSettingsSection('equipments')}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                settingsSection === 'equipments'
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
                  : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              )}
            >
              <Tag className="w-4 h-4" />
              TAGs & Equipamentos ({equipments.length})
            </button>

            <button
              onClick={() => setSettingsSection('sectors')}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                settingsSection === 'sectors'
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
                  : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              )}
            >
              <LayoutGrid className="w-4 h-4" />
              Setores da Planta ({sectors.length})
            </button>

            <button
              onClick={() => setSettingsSection('lines')}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                settingsSection === 'lines'
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
                  : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              )}
            >
              <Factory className="w-4 h-4" />
              Linhas de Produção ({lines.length})
            </button>

            <button
              onClick={() => setSettingsSection('inspections')}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                settingsSection === 'inspections'
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
                  : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              )}
            >
              <FileText className="w-4 h-4" />
              Tipos e Nomes de Inspeção
            </button>

            <button
              onClick={() => setSettingsSection('centers')}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                settingsSection === 'centers'
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
                  : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              )}
            >
              <Building2 className="w-4 h-4" />
              Centros Responsáveis
            </button>

            <button
              onClick={() => setSettingsSection('programming')}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                settingsSection === 'programming'
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
                  : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              )}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Tipos de Programação
            </button>

            <button
              onClick={() => setSettingsSection('statuses')}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                settingsSection === 'statuses'
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
                  : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              )}
            >
              <Layers className="w-4 h-4" />
              Status Personalizados
            </button>
          </div>

          {/* Section 1: EQUIPMENTS / TAGS */}
          {settingsSection === 'equipments' && (
            <div className="space-y-6">
              <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-100 shadow-sm space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Cadastro de TAGs e Equipamentos</h3>
                    <p className="text-xs text-slate-400">Importe em lote ou adicione manualmente as TAGs da fábrica.</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadTemplate}
                      className="px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold rounded-xl transition-all flex items-center gap-2 border border-emerald-200/80"
                    >
                      <FileDown className="w-4 h-4 text-emerald-600" />
                      Baixar Modelo (.CSV)
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsImportModalOpen(true)}
                      className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-lg transition-all flex items-center gap-2"
                    >
                      <FolderInput className="w-4 h-4 text-emerald-400" />
                      Importar Lista (CSV / Texto)
                    </button>
                  </div>
                </div>

                {/* Add single tag form */}
                <form onSubmit={handleAddSingleEquipment} className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/60">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">Setor *</label>
                      <select
                        value={newEquipmentSectorInput}
                        onChange={(e) => setNewEquipmentSectorInput(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">Selecione o Setor...</option>
                        {sectors.map(s => (
                          <option key={s.id} value={s.name}>{s.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">Linha de Produção</label>
                      <select
                        value={newEquipmentLineInput}
                        onChange={(e) => setNewEquipmentLineInput(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">Selecione a Linha...</option>
                        {sortedLines
                          .filter(l => !newEquipmentSectorInput || l.sector === newEquipmentSectorInput)
                          .map(l => (
                            <option key={l.id} value={l.name}>{l.name}</option>
                          ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">TAG do Equipamento *</label>
                      <input
                        type="text"
                        placeholder="Ex: 101-EX-01"
                        required
                        value={newTagInput}
                        onChange={(e) => setNewTagInput(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">Nome / Descrição</label>
                      <input
                        type="text"
                        placeholder="Ex: Exaustor Principal"
                        value={newEquipmentNameInput}
                        onChange={(e) => setNewEquipmentNameInput(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                    <p className="text-[11px] text-slate-400 italic">O equipamento fica atrelado ao Setor e Linha de Produção para facilitar a localização.</p>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20"
                    >
                      <Plus className="w-4 h-4" /> Cadastrar TAG & Equipamento
                    </button>
                  </div>
                </form>

                {/* List of tags with search */}
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">
                      TAGs Cadastradas ({filteredEquipments.length} de {equipments.length})
                    </h4>

                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Buscar TAG ou Nome..."
                          value={equipmentSearchTerm}
                          onChange={(e) => setEquipmentSearchTerm(e.target.value)}
                          className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                  </div>

                  {filteredEquipments.length === 0 ? (
                    <p className="text-xs text-slate-400 italic p-4 text-center bg-slate-50 rounded-xl border border-slate-200/60">
                      Nenhum equipamento encontrado com os filtros aplicados.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-96 overflow-y-auto pr-2">
                      {filteredEquipments.map((eq, idx) => (
                        <div key={`${eq.id}-${eq.tag}-${idx}`} className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex items-start justify-between gap-2 hover:border-slate-300 transition-all">
                          <div className="space-y-1 min-w-0">
                            <span className="font-mono font-black text-xs text-slate-900 block truncate">{eq.tag}</span>
                            <span className="text-[11px] text-slate-600 block line-clamp-1 font-medium">{eq.name}</span>
                            <div className="flex flex-wrap items-center gap-1 pt-0.5">
                              {eq.sector && (
                                <span className="px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded-md text-[9px] font-extrabold">
                                  {eq.sector}
                                </span>
                              )}
                              {eq.line && (
                                <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded-md text-[9px] font-extrabold">
                                  Linha: {eq.line}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => setEditingEquipment(eq)}
                              className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                              title="Editar Equipamento"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteAdminItem('maintenance_equipments', eq.id, `TAG ${eq.tag}${eq.name ? ' - ' + eq.name : ''}`)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Excluir Equipamento"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Section: SETORES DA PLANTA */}
          {settingsSection === 'sectors' && (
            <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-100 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Cadastro de Setores da Planta</h3>
                  <p className="text-xs text-slate-400">Cadastre e gerencie os setores e posições operacionais da fábrica.</p>
                </div>
              </div>

              {/* Add single sector form */}
              <form onSubmit={handleAddSector} className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/60">
                <div className="flex flex-col sm:flex-row items-end gap-3">
                  <div className="flex-1 w-full">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">Nome do Setor / Posição *</label>
                    <input
                      type="text"
                      placeholder="Ex: Linha 1 de Prensa"
                      required
                      value={newSectorInput}
                      onChange={(e) => setNewSectorInput(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20"
                  >
                    <Plus className="w-4 h-4" /> Cadastrar Setor
                  </button>
                </div>
              </form>

              {/* List of custom sectors */}
              <div className="space-y-3">
                <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">
                  Setores Cadastrados ({sectors.length})
                </h4>

                {sectors.length === 0 ? (
                  <div className="p-4 text-center bg-slate-50 rounded-xl border border-slate-200/60">
                    <p className="text-xs text-slate-400 italic">Nenhum setor cadastrado ainda.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {sectors.map((sec) => (
                      <div key={sec.id} className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl flex items-start justify-between gap-2 hover:border-slate-300 transition-all">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-extrabold text-xs text-slate-900 truncate">{sec.name}</span>
                          </div>
                          {lines.filter(l => l.sector === sec.name).length > 0 && (
                            <div className="flex flex-wrap items-center gap-1 pt-1">
                              <span className="text-[9px] text-slate-400 font-bold uppercase">Linhas:</span>
                              {lines.filter(l => l.sector === sec.name).map(l => (
                                <span key={l.id} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded text-[9px] font-bold">
                                  {l.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setEditingSector({ id: sec.id, name: sec.name, area: '' })}
                            className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Editar Setor"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAdminItem('work_sectors', sec.id, `Setor ${sec.name}`)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Excluir Setor"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Section: LINES */}
          {settingsSection === 'lines' && (
            <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-100 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Cadastro de Linhas de Produção</h3>
                  <p className="text-xs text-slate-400">
                    Cadastre e gerencie as linhas de produção (ex: MS1, Prensa 1) vinculadas aos Setores.
                  </p>
                </div>
              </div>

              {/* Add single line form */}
              <form onSubmit={handleAddLine} className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/60">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">Setor Atrelado *</label>
                    <select
                      value={newLineSectorInput}
                      onChange={(e) => setNewLineSectorInput(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">Selecione o Setor...</option>
                      {sectors.map(s => (
                        <option key={s.id} value={s.name}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">Nome da Linha de Produção *</label>
                    <input
                      type="text"
                      placeholder="Ex: MS1"
                      required
                      value={newLineNameInput}
                      onChange={(e) => setNewLineNameInput(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20"
                  >
                    <Plus className="w-4 h-4" /> Cadastrar Linha de Produção
                  </button>
                </div>
              </form>

              {/* List of custom lines */}
              <div className="space-y-3">
                <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">
                  Linhas Cadastradas ({lines.length})
                </h4>

                {lines.length === 0 ? (
                  <div className="p-4 text-center bg-slate-50 rounded-xl border border-slate-200/60">
                    <p className="text-xs text-slate-400 italic">Nenhuma linha de produção cadastrada ainda.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {sortedLines.map((l) => (
                      <div key={l.id} className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl flex items-start justify-between gap-2 hover:border-slate-300 transition-all">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <Factory className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span className="font-extrabold text-xs text-slate-900 truncate">{l.name}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1 pt-0.5">
                            {l.sector && (
                              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded-md text-[9px] font-extrabold">
                                Setor: {l.sector}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setEditingLine({ id: l.id, name: l.name, sector: l.sector || '', area: '' })}
                            className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Editar Linha"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAdminItem('maintenance_lines', l.id, `Linha ${l.name}`)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Excluir Linha"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Section 2: INSPECTIONS */}
          {settingsSection === 'inspections' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Inspection Types */}
              <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-slate-900">Tipos de Inspeção ({inspectionTypes.length})</h3>
                </div>

                <form onSubmit={handleAddInspectionType} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Novo Tipo (ex: Termografia)"
                    value={newInspTypeInput}
                    onChange={(e) => setNewInspTypeInput(e.target.value)}
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button type="submit" className="px-4 py-2 bg-emerald-600 text-white font-bold text-xs rounded-xl hover:bg-emerald-700 transition-colors">
                    Adicionar
                  </button>
                </form>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {inspectionTypes.length === 0 ? (
                    <div className="p-4 text-center bg-slate-50 rounded-xl border border-slate-200/60">
                      <p className="text-xs text-slate-400 italic">Nenhum tipo de inspeção cadastrado.</p>
                    </div>
                  ) : (
                    inspectionTypes.map((it) => (
                      <div key={it.id} className="p-2.5 bg-slate-50 border border-slate-200/70 rounded-xl flex items-center justify-between hover:border-slate-300 transition-all">
                        <span className="text-xs font-bold text-slate-800">{it.name}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteAdminItem('maintenance_inspection_types', it.id, it.name)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Excluir Tipo de Inspeção"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Inspection Names linked to Type */}
              <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
                <h3 className="text-base font-bold text-slate-900">Nomes de Inspeção ({inspectionNames.length})</h3>

                <form onSubmit={handleAddInspectionName} className="space-y-2">
                  <select
                    value={newInspNameTypeSel}
                    onChange={(e) => setNewInspNameTypeSel(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Selecione o Tipo de Inspeção...</option>
                    {availableInspectionTypes.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Nome da Inspeção (ex: Medição de Vibração)"
                      value={newInspNameInput}
                      onChange={(e) => setNewInspNameInput(e.target.value)}
                      className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button type="submit" className="px-4 py-2 bg-emerald-600 text-white font-bold text-xs rounded-xl hover:bg-emerald-700 transition-colors">
                      Adicionar
                    </button>
                  </div>
                </form>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {inspectionNames.length === 0 ? (
                    <p className="text-xs text-slate-400 italic p-3 text-center bg-slate-50 rounded-xl border border-slate-200/60">
                      Nenhum nome de inspeção cadastrado.
                    </p>
                  ) : (
                    inspectionNames.map((iname) => (
                      <div key={iname.id} className="p-2.5 bg-slate-50 border border-slate-200/70 rounded-xl flex items-center justify-between hover:border-slate-300 transition-all">
                        <div>
                          <span className="text-xs font-bold text-slate-800 block">{iname.name}</span>
                          <span className="text-[10px] text-slate-400">{iname.inspectionTypeName}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteAdminItem('maintenance_inspection_names', iname.id, iname.name)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Excluir Nome de Inspeção"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Section 3: RESPONSIBLE CENTERS */}
          {settingsSection === 'centers' && (
            <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-100 shadow-sm space-y-4 max-w-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">Centros Responsáveis ({responsibleCenters.length})</h3>
              </div>

              <form onSubmit={handleAddResponsibleCenter} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Novo Centro (ex: Oficina Elétrica)"
                  value={newCenterInput}
                  onChange={(e) => setNewCenterInput(e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button type="submit" className="px-4 py-2 bg-emerald-600 text-white font-bold text-xs rounded-xl hover:bg-emerald-700 transition-colors">
                  Adicionar
                </button>
              </form>

              <div className="space-y-2">
                {responsibleCenters.length === 0 ? (
                  <div className="p-4 text-center bg-slate-50 rounded-xl border border-slate-200/60">
                    <p className="text-xs text-slate-400 italic">Nenhum centro responsável cadastrado.</p>
                  </div>
                ) : (
                  [...responsibleCenters]
                    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }))
                    .map((rc) => (
                      <div key={rc.id} className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl flex items-center justify-between hover:border-slate-300 transition-all">
                        <span className="text-xs font-bold text-slate-800">{rc.name}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteAdminItem('maintenance_responsible_centers', rc.id, rc.name)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Excluir Centro Responsável"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                )}
              </div>
            </div>
          )}

          {/* Section 4: PROGRAMMING TYPES */}
          {settingsSection === 'programming' && (
            <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-100 shadow-sm space-y-4 max-w-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">Tipos de Programação ({programmingTypes.length})</h3>
              </div>

              <form onSubmit={handleAddProgrammingType} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Novo Tipo de Programação (ex: Oportunidade)"
                  value={newProgTypeInput}
                  onChange={(e) => setNewProgTypeInput(e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button type="submit" className="px-4 py-2 bg-emerald-600 text-white font-bold text-xs rounded-xl hover:bg-emerald-700 transition-colors">
                  Adicionar
                </button>
              </form>

              <div className="space-y-2">
                {programmingTypes.length === 0 ? (
                  <div className="p-4 text-center bg-slate-50 rounded-xl border border-slate-200/60">
                    <p className="text-xs text-slate-400 italic">Nenhum tipo de programação cadastrado.</p>
                  </div>
                ) : (
                  programmingTypes.map((pt) => (
                    <div key={pt.id} className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl flex items-center justify-between hover:border-slate-300 transition-all">
                      <span className="text-xs font-bold text-slate-800">{pt.name}</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteAdminItem('maintenance_programming_types', pt.id, pt.name)}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Excluir Tipo de Programação"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Section 5: STATUSES */}
          {settingsSection === 'statuses' && (
            <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-100 shadow-sm space-y-4 max-w-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">Status de Pendências ({statuses.length})</h3>
              </div>

              <form onSubmit={handleAddStatus} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Novo Status (ex: Aguardando Peça)"
                  value={newStatusInput}
                  onChange={(e) => setNewStatusInput(e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button type="submit" className="px-4 py-2 bg-emerald-600 text-white font-bold text-xs rounded-xl hover:bg-emerald-700 transition-colors">
                  Adicionar
                </button>
              </form>

              <div className="space-y-2">
                {statuses.length === 0 ? (
                  <div className="p-4 text-center bg-slate-50 rounded-xl border border-slate-200/60">
                    <p className="text-xs text-slate-400 italic">Nenhum status cadastrado.</p>
                  </div>
                ) : (
                  statuses.map((st) => (
                    <div key={st.id} className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl flex items-center justify-between hover:border-slate-300 transition-all">
                      <span className="text-xs font-bold text-slate-800">{st.name}</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteAdminItem('maintenance_statuses', st.id, st.name)}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Excluir Status"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* CREATE / EDIT ISSUE MODAL */}
      <AnimatePresence>
        {isIssueModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden my-8"
            >
              {/* Modal Header */}
              <div className="bg-slate-900 text-white p-6 md:p-8 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black">
                    {editingIssue ? 'Editar Pendência de Manutenção' : 'Nova Pendência de Manutenção'}
                  </h3>
                  <p className="text-slate-400 text-xs">Preencha os detalhes técnicos do equipamento e da inspeção.</p>
                </div>
                <button
                  onClick={() => setIsIssueModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-xl"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Form */}
              <form onSubmit={handleSaveIssue} className="p-6 md:p-8 space-y-6 max-h-[80vh] overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
                  {/* Data */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 ml-1">Data *</label>
                    <input
                      type="date"
                      required
                      value={formDate}
                      onChange={(e) => {
                        const newDateStr = e.target.value;
                        setFormDate(newDateStr);
                        if (newDateStr && formShift !== 'Central') {
                          const dt = new Date(`${newDateStr}T12:00:00`);
                          const calculatedGroup = getGroupForShift(dt, mapFormShiftToScaleShift(formShift));
                          setFormTeamLetter(calculatedGroup);
                        }
                      }}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  {/* Setor */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 ml-1">Setor *</label>
                    <select
                      value={formSector}
                      onChange={(e) => {
                        const secName = e.target.value;
                        setFormSector(secName);
                        if (formLine) {
                          const currentL = lines.find(l => l.name === formLine);
                          if (currentL?.sector && currentL.sector !== secName) {
                            setFormLine('');
                          }
                        }
                      }}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">Selecione o Setor...</option>
                      {sectors.map(s => (
                        <option key={s.id} value={s.name}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Linha */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 ml-1">Linha *</label>
                    <select
                      value={formLine}
                      onChange={(e) => {
                        const lineName = e.target.value;
                        setFormLine(lineName);
                        const matched = lines.find(l => l.name === lineName);
                        if (matched?.sector) {
                          setFormSector(matched.sector);
                        }
                      }}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">Selecione a Linha...</option>
                      {sortedLines
                        .filter(l => !formSector || !l.sector || l.sector === formSector)
                        .map(l => (
                          <option key={l.id} value={l.name}>{l.name}{l.sector ? ` (${l.sector})` : ''}</option>
                        ))}
                    </select>
                  </div>

                  {/* Turno */}
                  <div>
                    <div className="flex items-center justify-between mb-1 ml-1">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Turno</label>
                      <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">Escala Atual</span>
                    </div>
                    <select
                      value={formShift}
                      onChange={(e) => {
                        const newShift = e.target.value;
                        setFormShift(newShift);
                        if (newShift !== 'Central') {
                          const dt = formDate ? new Date(`${formDate}T12:00:00`) : new Date();
                          const calculatedGroup = getGroupForShift(dt, mapFormShiftToScaleShift(newShift));
                          setFormTeamLetter(calculatedGroup);
                        }
                      }}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {DEFAULT_SHIFTS.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  {/* Letra */}
                  <div>
                    <div className="flex items-center justify-between mb-1 ml-1">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Letra / Escala</label>
                      <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">Turma {formTeamLetter}</span>
                    </div>
                    <select
                      value={formTeamLetter}
                      onChange={(e) => setFormTeamLetter(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {DEFAULT_TEAMS.map(t => (
                        <option key={t} value={t}>Turma {t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Equipment Tag Searchable Autocomplete */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100">
                  <div className="relative">
                    <label className="block text-[10px] font-bold text-emerald-800 uppercase tracking-wider mb-1 ml-1">
                      TAG do Equipamento *
                    </label>
                    <input
                      type="text"
                      placeholder="Digitar ou Buscar TAG..."
                      required
                      value={formEquipmentTag}
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase();
                        setFormEquipmentTag(val);
                        setTagSearchQuery(val);
                        setIsTagDropdownOpen(true);

                        // Auto-fill equipment name, sector, and line if matching tag exists
                        const match = equipments.find(eq => eq.tag.toUpperCase() === val);
                        if (match) {
                          setFormEquipmentName(match.name);
                          if (match.sector) setFormSector(match.sector);
                          if (match.line) setFormLine(match.line);
                        }
                      }}
                      onFocus={() => setIsTagDropdownOpen(true)}
                      className="w-full px-3.5 py-2.5 bg-white border border-emerald-200 rounded-xl text-xs font-mono font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                    />

                    {/* Search dropdown */}
                    {isTagDropdownOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-30 max-h-56 overflow-y-auto">
                        {(formSector || formLine) && (
                          <div className="p-2.5 bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-500 flex items-center justify-between">
                            <span>Filtrando por: <strong className="text-slate-800">{formSector || 'Todos Setores'}{formLine ? ` • ${formLine}` : ''}</strong></span>
                            <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60">{searchedTags.length} TAGs</span>
                          </div>
                        )}
                        {searchedTags.length === 0 ? (
                          <div className="p-4 text-center text-xs text-slate-400 italic">
                            Nenhuma TAG encontrada para os filtros selecionados.
                          </div>
                        ) : (
                          searchedTags.map((eq, idx) => (
                            <button
                              key={`${eq.id}-${eq.tag}-${idx}`}
                              type="button"
                              onClick={() => {
                                setFormEquipmentTag(eq.tag);
                                setFormEquipmentName(eq.name);
                                if (eq.sector) setFormSector(eq.sector);
                                if (eq.line) setFormLine(eq.line);
                                setIsTagDropdownOpen(false);
                              }}
                              className="w-full text-left p-3 hover:bg-emerald-50 transition-colors border-b border-slate-50 last:border-0 space-y-0.5"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-mono font-extrabold text-slate-900 text-xs">{eq.tag}</span>
                                {eq.sector && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded">
                                    {eq.sector}{eq.line ? ` • ${eq.line}` : ''}
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-500 block">{eq.name}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-emerald-800 uppercase tracking-wider mb-1 ml-1">
                      Nome do Equipamento
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Exaustor da Secagem"
                      value={formEquipmentName}
                      onChange={(e) => setFormEquipmentName(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-emerald-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {/* Inspection Type & Name */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 ml-1">Tipo de Inspeção *</label>
                    <select
                      value={formInspectionType}
                      onChange={(e) => {
                        setFormInspectionType(e.target.value);
                        setFormInspectionName('');
                      }}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {availableInspectionTypes.map(it => (
                        <option key={it} value={it}>{it}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 ml-1">Nome da Inspeção</label>
                    <select
                      value={formInspectionName}
                      onChange={(e) => setFormInspectionName(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">Selecione o Nome da Inspeção...</option>
                      {filteredInspectionNames.map(inName => (
                        <option key={inName} value={inName}>{inName}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Center, Programming & Status */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 ml-1">Centro Responsável</label>
                    <select
                      value={formResponsibleCenter}
                      onChange={(e) => setFormResponsibleCenter(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {availableResponsibleCenters.map(rc => (
                        <option key={rc} value={rc}>{rc}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 ml-1">Tipo de Programação</label>
                    <select
                      value={formProgrammingType}
                      onChange={(e) => setFormProgrammingType(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {availableProgrammingTypes.map(pt => (
                        <option key={pt} value={pt}>{pt}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 ml-1">Status</label>
                    <select
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {availableStatuses.map(st => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* SAP Note */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 ml-1">Número da Nota do SAP</label>
                  <input
                    type="text"
                    placeholder="Ex: 10098234"
                    value={formSapNote}
                    onChange={(e) => setFormSapNote(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 ml-1">Descrição da Pendência *</label>
                  <textarea
                    required
                    rows={4}
                    placeholder="Descreva detalhadamente a falha, ruído, anomalia ou necessidade de intervenção do equipamento..."
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500 leading-relaxed"
                  />
                </div>

                {/* Photo Uploads */}
                <div className="space-y-3">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">
                    Anexar Fotos / Evidências (Câmera ou Álbum)
                  </label>

                  <div className="flex gap-3">
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handleImageUpload}
                    />
                    <input
                      type="file"
                      ref={cameraInputRef}
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={handleImageUpload}
                    />

                    <button
                      type="button"
                      onClick={() => {
                        if (cameraInputRef.current) {
                          cameraInputRef.current.value = '';
                          cameraInputRef.current.click();
                        }
                      }}
                      className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
                    >
                      <Camera className="w-4 h-4 text-emerald-600" /> Tirar Foto
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (fileInputRef.current) {
                          fileInputRef.current.value = '';
                          fileInputRef.current.click();
                        }
                      }}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
                    >
                      <Upload className="w-4 h-4 text-slate-500" /> Escolher do Álbum
                    </button>
                  </div>

                  {/* Attachments preview */}
                  {formAttachments.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 pt-2">
                      {formAttachments.map((imgSrc, idx) => (
                        <div key={idx} className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-video bg-slate-100">
                          <img src={imgSrc} alt="Evidência" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => handleRemoveAttachment(idx)}
                            className="absolute top-1 right-1 bg-rose-600 text-white p-1 rounded-lg opacity-90 hover:opacity-100"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Form Actions */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsIssueModalOpen(false)}
                    className="px-5 py-3 text-slate-600 font-bold text-xs hover:bg-slate-100 rounded-xl transition-all"
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    disabled={submittingIssue}
                    className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2"
                  >
                    {submittingIssue ? 'Salvando...' : 'Salvar Pendência'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ADMIN TAG IMPORT CSV MODAL */}
      <AnimatePresence>
        {isImportModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden"
            >
              <div className="bg-slate-900 text-white p-6 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black">Importação em Lote de TAGs</h3>
                  <p className="text-slate-400 text-xs">Cole as TAGs diretamente do Excel ou arquivo CSV.</p>
                </div>
                <button
                  onClick={() => setIsImportModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <div>
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Ordem das Colunas</span>
                    <code className="text-xs font-black text-emerald-700">Setor ; Linha ; TAG ; Nome do Equipamento</code>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-lg transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    <FileDown className="w-3.5 h-3.5" /> Baixar Modelo CSV
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-700">Conteúdo do Arquivo / Texto:</span>
                  <label className="cursor-pointer px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-lg transition-all flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5 text-slate-500" />
                    Carregar Arquivo (.CSV / .TXT)
                    <input
                      type="file"
                      accept=".csv,.txt"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                <pre className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] font-mono text-slate-700 leading-relaxed">
                  Cortadeira;MS1;101-EX-01;Exaustor Principal{'\n'}
                  Tratamento de Água;ETA;101-BC-02;Bomba de Pasta{'\n'}
                  Enfardadeira;Mesa 1;102-RO-05;Rolo Pressionador
                </pre>

                <textarea
                  rows={7}
                  placeholder="Cole aqui a lista (Setor;Linha;TAG;Nome do Equipamento)..."
                  value={importCsvText}
                  onChange={(e) => setImportCsvText(e.target.value)}
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                />

                <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => setIsImportModalOpen(false)}
                    className="px-4 py-2.5 text-slate-600 font-bold text-xs hover:bg-slate-100 rounded-xl transition-all"
                  >
                    Cancelar
                  </button>

                  <button
                    onClick={handleProcessImportTags}
                    disabled={importingTags || !importCsvText.trim()}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2"
                  >
                    {importingTags ? 'Processando...' : 'Importar Equipamentos'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* EDIT EQUIPMENT MODAL */}
      <AnimatePresence>
        {editingEquipment && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden"
            >
              <div className="bg-slate-900 text-white p-6 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black">Editar TAG & Equipamento</h3>
                  <p className="text-slate-400 text-xs">Atualize a área, setor, linha, nome e TAG deste equipamento.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingEquipment(null)}
                  className="p-2 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveEditEquipment} className="p-6 space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 ml-1">TAG do Equipamento *</label>
                  <input
                    type="text"
                    required
                    value={editingEquipment.tag}
                    onChange={(e) => setEditingEquipment({ ...editingEquipment, tag: e.target.value.toUpperCase() })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 ml-1">Nome / Descrição</label>
                  <input
                    type="text"
                    value={editingEquipment.name}
                    onChange={(e) => setEditingEquipment({ ...editingEquipment, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 ml-1">Setor</label>
                    <select
                      value={editingEquipment.sector || ''}
                      onChange={(e) => setEditingEquipment({ ...editingEquipment, sector: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">Selecione o Setor...</option>
                      {sectors.map(s => (
                        <option key={s.id} value={s.name}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 ml-1">Linha de Produção</label>
                    <select
                      value={editingEquipment.line || ''}
                      onChange={(e) => setEditingEquipment({ ...editingEquipment, line: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">Selecione a Linha...</option>
                      {sortedLines.map(l => (
                        <option key={l.id} value={l.name}>{l.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setEditingEquipment(null)}
                    className="px-4 py-2.5 text-slate-600 font-bold text-xs hover:bg-slate-100 rounded-xl transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/20 transition-all"
                  >
                    Salvar Alterações
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* EDIT SECTOR MODAL */}
      <AnimatePresence>
        {editingSector && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden"
            >
              <div className="bg-slate-900 text-white p-6 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black">Editar Setor</h3>
                  <p className="text-slate-400 text-xs">Altere o nome do setor.</p>
                </div>
                <button
                  onClick={() => setEditingSector(null)}
                  className="p-2 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveEditSector} className="p-6 space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nome do Setor *</label>
                  <input
                    type="text"
                    required
                    value={editingSector.name}
                    onChange={(e) => setEditingSector({ ...editingSector, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setEditingSector(null)}
                    className="px-4 py-2.5 text-slate-600 font-bold text-xs hover:bg-slate-100 rounded-xl transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/20 transition-all"
                  >
                    Salvar Alterações
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* EDIT LINE MODAL */}
      <AnimatePresence>
        {editingLine && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden"
            >
              <div className="bg-slate-900 text-white p-6 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black">Editar Linha de Produção</h3>
                  <p className="text-slate-400 text-xs">Altere o nome e setor vinculados.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingLine(null)}
                  className="p-2 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveEditLine} className="p-6 space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nome da Linha *</label>
                  <input
                    type="text"
                    required
                    value={editingLine.name}
                    onChange={(e) => setEditingLine({ ...editingLine, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Setor Atrelado</label>
                  <select
                    value={editingLine.sector || ''}
                    onChange={(e) => setEditingLine({ ...editingLine, sector: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Selecione um Setor...</option>
                    {sectors.map(s => (
                      <option key={s.id} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setEditingLine(null)}
                    className="px-4 py-2.5 text-slate-600 font-bold text-xs hover:bg-slate-100 rounded-xl transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/20 transition-all"
                  >
                    Salvar Alterações
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* FULL PHOTO VIEWER MODAL */}
      <AnimatePresence>
        {viewingPhotoUrl && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="relative max-w-4xl max-h-[90vh]">
              <button
                onClick={() => setViewingPhotoUrl(null)}
                className="absolute -top-12 right-0 p-2 text-white bg-slate-800/80 hover:bg-slate-800 rounded-full"
              >
                <X className="w-6 h-6" />
              </button>
              <img
                src={viewingPhotoUrl}
                alt="Evidência Ampliada"
                className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl"
              />
            </div>
          </div>
        )}
      </AnimatePresence>
      {/* CUSTOM DELETE CONFIRMATION MODAL ("BALÃO DE CONFIRMAÇÃO DE EXCLUSÃO") */}
      <AnimatePresence>
        {deleteTarget && (
          <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-4 text-left"
            >
              <div className="flex items-center gap-3 text-rose-600">
                <div className="p-3 bg-rose-100/80 rounded-2xl">
                  <Trash2 className="w-6 h-6 text-rose-600" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Confirmar Exclusão</h3>
                  <p className="text-xs text-slate-500 font-medium">Esta ação não poderá ser desfeita.</p>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Item Selecionado</p>
                <p className="text-sm font-black text-slate-900">{deleteTarget.title}</p>
                {deleteTarget.subtitle && (
                  <p className="text-xs text-slate-600 font-medium line-clamp-2">{deleteTarget.subtitle}</p>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={executeDeleteTarget}
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-rose-600/20 flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" /> Sim, Excluir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
