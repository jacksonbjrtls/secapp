import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDoc,
  setDoc,
  serverTimestamp, 
  getDocs,
  query,
  orderBy,
  Timestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { getCurrentShift, getGroupForShift } from '../lib/scaleUtils';
import { motion, AnimatePresence } from 'motion/react';
import { cn, safeToDate } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/errorHandler';
import { Html5Qrcode } from 'html5-qrcode';
import { 
  Activity, 
  Plus, 
  Trash2, 
  Edit2, 
  CheckCircle2, 
  AlertTriangle, 
  Lock,
  Camera, 
  Upload, 
  Download,
  History, 
  Settings, 
  FileText, 
  TrendingUp, 
  Clipboard, 
  User, 
  Image as ImageIcon,
  Wrench,
  X,
  ShieldCheck,
  Calendar,
  Layers,
  BarChart2,
  AlertCircle,
  Loader2,
  LayoutGrid,
  Clock,
  QrCode,
  Tag,
  Maximize2,
  Search,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Check,
  Home,
  Video,
  GripVertical,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  Cell 
} from 'recharts';
import { ConfirmationModal } from '../components/ui/ConfirmationModal';
import { ProductionLine, QualitySector, QualityChecklistOptionSet } from '../types';

// Updated Route Template and Submission contracts
export interface RouteEquipmentItem {
  id: string;
  name: string;
  tag: string;
  description: string;
  required: boolean;
  lineId?: string;       // Associated production line
  sectorId?: string;     // Associated operational sector
  type: 'condition' | 'number' | 'range' | 'barcode';
  conditionOptionsId?: string; // custom set options like OK/NOK
  isInteger?: boolean;
  isRangeDropdown?: boolean;
  min?: number;
  max?: number;
  step?: number;
}

export interface RouteTemplate {
  id: string;
  name: string;
  active: boolean;
  sectorId: string; // Associated system sector, line, or 'all' (meaning factory wide)
  frequency: 'shift' | 'weekly' | 'custom';
  customFrequencyPeriod?: string; // used when frequency is 'custom'
  allowedShifts?: string[];
  equipments: RouteEquipmentItem[];
  createdAt: any;
  updatedAt?: any;
}

export interface RouteSubmission {
  id: string;
  templateId: string;
  templateName: string;
  operatorName: string;
  operatorId: string;
  createdAt: any;
  responses: {
    equipmentId: string;
    equipmentName: string;
    equipmentTag?: string;
    status: 'ok' | 'not_ok';
    notes: string;
    photoUrl?: string;
    videoUrl?: string;
    value?: any; // Dynamic field value collected
    observationGenerated?: boolean;
    observationText?: string;
  }[];
}

export interface ParsedEquipmentCSV {
  raw: Record<string, string>;
  equipment: RouteEquipmentItem;
  errors: string[];
  warnings: string[];
}

export const parseCSVEquipments = (text: string, linesList: ProductionLine[], sectorsList: QualitySector[]): ParsedEquipmentCSV[] => {
  if (!text.trim()) return [];
  
  // Split into lines, handle CRLF and LF safely
  const rawLines = text.split(/\r?\n/).filter(line => line.trim() !== '');
  if (rawLines.length === 0) return [];
  
  // Detect delimiter
  const firstLine = rawLines[0];
  let delimiter = ',';
  if (firstLine.includes(';')) delimiter = ';';
  else if (firstLine.includes('\t')) delimiter = '\t';
  
  // Custom split CSV function to handle quotes correctly
  const splitCSVLine = (lineStr: string, delim: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < lineStr.length; i++) {
        const char = lineStr[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === delim && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
  };

  const headers = splitCSVLine(rawLines[0], delimiter).map(h => h.toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
  );
  
  // Map standard header candidates
  const colIndex = {
    name: headers.findIndex(h => ['nome', 'name', 'equipamento', 'equipment'].includes(h)),
    tag: headers.findIndex(h => ['tag', 'patrimonio', 'patrimônio', 'codigo', 'código', 'code'].includes(h)),
    description: headers.findIndex(h => ['descricao', 'descrição', 'especificacao', 'especificação', 'instrucoes', 'instruções', 'specification', 'spec', 'description'].includes(h)),
    sector: headers.findIndex(h => ['setor', 'sector', 'area', 'área'].includes(h)),
    line: headers.findIndex(h => ['linha', 'line', 'producao', 'produção'].includes(h)),
    type: headers.findIndex(h => ['tipo', 'type', 'tipodados', 'coleta'].includes(h)),
    required: headers.findIndex(h => ['obrigatorio', 'obrigatório', 'requerido', 'required', 'obrigatoria'].includes(h)),
    min: headers.findIndex(h => ['min', 'minimo', 'mínimo'].includes(h)),
    max: headers.findIndex(h => ['max', 'maximo', 'máximo'].includes(h)),
    step: headers.findIndex(h => ['passo', 'step'].includes(h))
  };

  // If we can't find name column, try to default to the 1st column as name
  if (colIndex.name === -1 && headers.length > 0) {
    colIndex.name = 0;
  }

  const results: ParsedEquipmentCSV[] = [];

  for (let i = 1; i < rawLines.length; i++) {
    const rowRaw = rawLines[i];
    const cells = splitCSVLine(rowRaw, delimiter);
    if (cells.length === 0 || (cells.length === 1 && !cells[0])) continue;
    
    const errors: string[] = [];
    const warnings: string[] = [];
    
    const name = colIndex.name !== -1 && cells[colIndex.name] ? cells[colIndex.name].replace(/^"|"$/g, '').trim() : '';
    if (!name) {
      errors.push(`Linha ${i + 1}: O nome do equipamento está vazio.`);
      continue;
    }
    
    const tag = colIndex.tag !== -1 && cells[colIndex.tag] ? cells[colIndex.tag].replace(/^"|"$/g, '').trim() : '';
    const description = colIndex.description !== -1 && cells[colIndex.description] ? cells[colIndex.description].replace(/^"|"$/g, '').trim() : '';
    
    // Sector lookup by name or ID
    let sectorId = '';
    const sectorVal = colIndex.sector !== -1 && cells[colIndex.sector] ? cells[colIndex.sector].replace(/^"|"$/g, '').trim() : '';
    if (sectorVal) {
      const matchedSector = sectorsList.find(s => 
        s.id === sectorVal || 
        s.name.toLowerCase().trim() === sectorVal.toLowerCase().trim()
      );
      if (matchedSector) {
        sectorId = matchedSector.id;
      } else {
        warnings.push(`Setor "${sectorVal}" não encontrado.`);
      }
    }
    
    // Line lookup by name or ID
    let lineId = '';
    const lineVal = colIndex.line !== -1 && cells[colIndex.line] ? cells[colIndex.line].replace(/^"|"$/g, '').trim() : '';
    if (lineVal) {
      const matchedLine = linesList.find(l => 
        l.id === lineVal || 
        l.name.toLowerCase().trim() === lineVal.toLowerCase().trim()
      );
      if (matchedLine) {
        lineId = matchedLine.id;
      } else {
        warnings.push(`Linha "${lineVal}" não encontrada.`);
      }
    }
    
    // Type mapping with default
    let type: 'condition' | 'number' | 'range' | 'barcode' = 'condition';
    const typeVal = colIndex.type !== -1 && cells[colIndex.type] ? cells[colIndex.type].replace(/^"|"$/g, '').toLowerCase().trim() : '';
    if (typeVal) {
      if (['numerico', 'número', 'numero', 'number', 'num'].includes(typeVal)) {
        type = 'number';
      } else if (['faixa', 'range', 'alerta', 'rango'].includes(typeVal)) {
        type = 'range';
      } else if (['codigo', 'código', 'barras', 'barcode', 'qr'].includes(typeVal)) {
        type = 'barcode';
      } else if (['condition', 'condicao', 'condição', 'opcoes', 'opções', 'ok/nok'].includes(typeVal)) {
        type = 'condition';
      } else {
        warnings.push(`Tipo "${typeVal}" desconhecido. Usando padrão "Opções OK/NOK".`);
      }
    }
    
    // Required boolean map
    let required = true;
    const reqVal = colIndex.required !== -1 && cells[colIndex.required] ? cells[colIndex.required].replace(/^"|"$/g, '').toLowerCase().trim() : '';
    if (reqVal) {
      if (['nao', 'não', 'false', 'no', '0'].includes(reqVal)) {
        required = false;
      }
    }
    
    // Numerical inputs
    const minVal = colIndex.min !== -1 && cells[colIndex.min] ? parseFloat(cells[colIndex.min]) : undefined;
    const maxVal = colIndex.max !== -1 && cells[colIndex.max] ? parseFloat(cells[colIndex.max]) : undefined;
    const stepVal = colIndex.step !== -1 && cells[colIndex.step] ? parseFloat(cells[colIndex.step]) : undefined;
    
    const equipment: RouteEquipmentItem = {
      id: `eq_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 5)}`,
      name,
      tag,
      description,
      required,
      type,
      lineId: lineId || undefined,
      sectorId: sectorId || undefined,
      min: (minVal !== undefined && isNaN(minVal)) ? undefined : minVal,
      max: (maxVal !== undefined && isNaN(maxVal)) ? undefined : maxVal,
      step: (stepVal !== undefined && isNaN(stepVal)) ? undefined : stepVal,
    };
    
    const rawMap: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rawMap[h] = cells[idx] || '';
    });
    
    results.push({
      raw: rawMap,
      equipment,
      errors,
      warnings
    });
  }
  
  return results;
};

const OperationalRoutes: React.FC = () => {
  const { user, profile, isManager, isAdmin, isMaster } = useAuth();
  
  // Tabs: 'my_routes' | 'new_route' | 'manage_templates' | 'metrics'
  const [activeTab, setActiveTab] = useState<'my_routes' | 'new_route' | 'manage_templates' | 'metrics'>('my_routes');

  // Firestore States
  const [templates, setTemplates] = useState<RouteTemplate[]>([]);
  const [submissions, setSubmissions] = useState<RouteSubmission[]>([]);
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [sectors, setSectors] = useState<QualitySector[]>([]);
  const [optionSets, setOptionSets] = useState<QualityChecklistOptionSet[]>([]);
  const [loading, setLoading] = useState(true);

  // States for Barcode/QR Scanner
  const [activeScanner, setActiveScanner] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // State for inspecting Equipment history
  const [historyEquipment, setHistoryEquipment] = useState<{ name: string; tag?: string } | null>(null);

  // New Route Template Form
  const [editingTemplate, setEditingTemplate] = useState<RouteTemplate | null>(null);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateSectorId, setTemplateSectorId] = useState('all');
  const [templateFrequency, setTemplateFrequency] = useState<'shift' | 'weekly' | 'custom'>('shift');
  const [templateCustomPeriod, setTemplateCustomPeriod] = useState('');
  const [templateAllowedShifts, setTemplateAllowedShifts] = useState<string[]>([]);
  const [templateEquipments, setTemplateEquipments] = useState<RouteEquipmentItem[]>([]);
  const [draggedEquipmentIndex, setDraggedEquipmentIndex] = useState<number | null>(null);
  const [dragOverEquipmentIndex, setDragOverEquipmentIndex] = useState<number | null>(null);

  // MASS EQUIPMENT CHARGE FROM CSV
  const [isCsvImportModalOpen, setIsCsvImportModalOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [csvParseResults, setCsvParseResults] = useState<ParsedEquipmentCSV[]>([]);
  const [csvDragOver, setCsvDragOver] = useState(false);

  // New Route Execution Form
  const [selectedTemplate, setSelectedTemplate] = useState<RouteTemplate | null>(null);
  const [routeResponses, setRouteResponses] = useState<Record<string, {
    status: 'ok' | 'not_ok';
    notes: string;
    photoUrl?: string;
    videoUrl?: string;
    value?: any;
    generateObservation?: boolean;
    observationText?: string;
  }>>({});

  // Route Step-by-Step Wizard States
  const [routeStep, setRouteStep] = useState<'select_area' | 'select_sector' | 'select_details' | 'active_inspection'>('select_area');
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [selectedSector, setSelectedSector] = useState<QualitySector | null>(null);
  const [selectedLine, setSelectedLine] = useState<ProductionLine | null>(null);
  const [selectedShift, setSelectedShift] = useState<string>(() => {
    const currentShift = getCurrentShift();
    const shiftMapping: Record<string, string> = {
      'Turno 1': '00:00 - 08:00',
      'Turno 2': '08:00 - 16:00',
      'Turno 3': '16:00 - 24:00'
    };
    return shiftMapping[currentShift] || '08:00 - 16:00';
  });
  const [selectedTeam, setSelectedTeam] = useState<string>(() => {
    const currentShift = getCurrentShift();
    return getGroupForShift(new Date(), currentShift) || 'A';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedEquipmentId, setExpandedEquipmentId] = useState<string | null>(null);
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);
  const [isPrefilledFromHistory, setIsPrefilledFromHistory] = useState(false);
  const [isReadOnlyRoute, setIsReadOnlyRoute] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);

  // States for the detailed NON OK / Anomaly Specification Modal (Images 9 & 10)
  const [anomalyDetailingEqId, setAnomalyDetailingEqId] = useState<string | null>(null);
  const [detailingResponses, setDetailingResponses] = useState<Record<string, {
    inspectionType: string;
    diagnostic: string;
    notes: string;
    photoUrl?: string;
    actionTaken: string;
    responsibleCenter: string;
    schedule: string;
    sapNote: string;
  }>>({});

  // States for justification modal of routes not executed (Step 3)
  const [isJustifyModalOpen, setIsJustifyModalOpen] = useState(false);
  const [justificationText, setJustificationText] = useState('');
  
  // Modal & Confirmation Config
  const [viewingRoute, setViewingRoute] = useState<RouteSubmission | null>(null);
  const [routeToDelete, setRouteToDelete] = useState<RouteTemplate | null>(null);
  const [submissionToDelete, setSubmissionToDelete] = useState<RouteSubmission | null>(null);
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

  // Reference for file input clicks
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const csvFileInputRef = useRef<HTMLInputElement | null>(null);

  // Year & Month filter for charts
  const [filterMonth, setFilterMonth] = useState<number>(new Date().getMonth());
  const [filterYear, setFilterYear] = useState<number>(new Date().getFullYear());

  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  // Helper helper function to find route submission under current shift and today's date
  const getTemplateShiftSubmissionToday = (tmplId: string) => {
    const currentShift = getCurrentShift();
    const shiftMapping: Record<string, string> = {
      'Turno 1': '00:00 - 08:00',
      'Turno 2': '08:00 - 16:00',
      'Turno 3': '16:00 - 24:00'
    };
    const currentShiftValue = shiftMapping[currentShift] || '08:00 - 16:00';
    const today = new Date();

    return submissions.find(s => {
      if (s.templateId !== tmplId) return false;
      if (s.shift !== currentShiftValue) return false;
      const subDate = safeToDate(s.createdAt);
      if (!subDate) return false;
      return (
        subDate.getDate() === today.getDate() &&
        subDate.getMonth() === today.getMonth() &&
        subDate.getFullYear() === today.getFullYear()
      );
    }) || null;
  };

  // Reset read-only status when template exits
  useEffect(() => {
    if (!selectedTemplate) {
      setIsReadOnlyRoute(false);
    }
  }, [selectedTemplate]);

  // Lock parent layout scrolling on active inspection to keep route header perfectly sticky at the top
  useEffect(() => {
    if (activeTab === 'new_route' && selectedTemplate && routeStep === 'active_inspection') {
      const mainEl = document.querySelector('main');
      if (mainEl) {
        const originalOverflow = mainEl.style.overflow || 'auto';
        mainEl.style.overflow = 'hidden';
        
        // Also scroll to top initially so that the container is fully in view
        mainEl.scrollTo({ top: 0, behavior: 'instant' });
        
        return () => {
          mainEl.style.overflow = originalOverflow;
        };
      }
    }
  }, [activeTab, selectedTemplate, routeStep]);

  // Subscribe to Route Templates
  useEffect(() => {
    if (isCsvImportModalOpen) {
      const results = parseCSVEquipments(csvText, lines, sectors);
      setCsvParseResults(results);
    }
  }, [csvText, isCsvImportModalOpen, lines, sectors]);

  useEffect(() => {
    const unsubTemplates = onSnapshot(collection(db, 'route_templates'), (snap) => {
      setTemplates(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as RouteTemplate)));
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'route_templates');
    });

    return () => unsubTemplates();
  }, []);

  // Subscribe to Route Submissions
  useEffect(() => {
    const unsubSubs = onSnapshot(
      query(collection(db, 'route_submissions'), orderBy('createdAt', 'desc')), 
      (snap) => {
        setSubmissions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as RouteSubmission)));
      }, (err) => {
        handleFirestoreError(err, OperationType.LIST, 'route_submissions');
      }
    );

    return () => unsubSubs();
  }, []);

  // Subscribe to Production Lines
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'production_lines'), (snap) => {
      setLines(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProductionLine)));
    });
    return () => unsub();
  }, []);

  // Auto-save route draft to Firestore on changes
  useEffect(() => {
    if (!selectedTemplate || !user || routeStep !== 'active_inspection' || isReadOnlyRoute) return;

    const hasValues = Object.keys(routeResponses).length > 0;
    if (!hasValues) return;

    const draftId = `${user.uid}_${selectedTemplate.id}`;
    
    const timeoutId = setTimeout(async () => {
      try {
        await setDoc(doc(db, 'route_drafts', draftId), {
          templateId: selectedTemplate.id,
          templateName: selectedTemplate.name,
          operatorId: user.uid,
          routeResponses,
          detailingResponses,
          selectedArea,
          selectedSector: selectedSector ? { id: selectedSector.id, name: selectedSector.name } : null,
          selectedLine: selectedLine ? { id: selectedLine.id, name: selectedLine.name } : null,
          selectedShift,
          selectedTeam,
          updatedAt: new Date()
        });
      } catch (err) {
        console.error("Erro ao salvar rascunho de rota:", err);
      }
    }, 1500);

    return () => clearTimeout(timeoutId);
  }, [routeResponses, detailingResponses, selectedTemplate, routeStep, user, selectedArea, selectedSector, selectedLine, selectedShift, selectedTeam]);

  // Clean / Discard draft
  const handleDiscardDraftAndStartFresh = async () => {
    if (!selectedTemplate || !user) return;
    
    const initialResponses: Record<string, any> = {};
    selectedTemplate.equipments.forEach(eq => {
      initialResponses[eq.id] = {
        status: 'ok',
        notes: '',
        value: eq.type === 'range' ? 'normal' : '',
        generateObservation: false,
        observationText: ''
      };
    });
    setRouteResponses(initialResponses);
    setDetailingResponses({});
    setIsDraftLoaded(false);
    setDraftSavedAt(null);
    
    const draftId = `${user.uid}_${selectedTemplate.id}`;
    try {
      await deleteDoc(doc(db, 'route_drafts', draftId));
    } catch (e) {
      console.error("Erro ao remover rascunho de rota deletado:", e);
    }
  };

  // Subscribe to Sectors
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'quality_sectors'), (snap) => {
      setSectors(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as QualitySector)));
    });
    return () => unsub();
  }, []);

  // Subscribe to customizable response parameter Option Sets
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'quality_checklist_options'), (snap) => {
      setOptionSets(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as QualityChecklistOptionSet)));
    });
    return () => unsub();
  }, []);

  // Effect to handle dynamic barcode scanner initialization
  useEffect(() => {
    if (!activeScanner) return;
    let scanner: Html5Qrcode | null = null;
    setCameraError(null);
    
    const startScanner = async () => {
      try {
        scanner = new Html5Qrcode("qr-reader-route");
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            setRouteResponses(prev => ({
              ...prev,
              [activeScanner]: { ...prev[activeScanner], value: decodedText }
            }));
            setActiveScanner(null);
          },
          () => {}
        );
      } catch (err: any) {
        console.error("Camera access error:", err);
        setCameraError("Não foi possível acessar a câmera do dispositivo. Verifique as permissões de acesso.");
      }
    };

    const timer = setTimeout(startScanner, 200);
    return () => {
      clearTimeout(timer);
      if (scanner && scanner.isScanning) {
        scanner.stop().catch(console.error);
      }
    };
  }, [activeScanner]);

  // Lookup helper function to resolve latest recorded inspection status/notes for a given equipment
  const getEquipmentLastInspection = (name: string, tag?: string) => {
    for (const sub of submissions) {
      const resp = sub.responses.find(r => 
        (tag && r.equipmentTag === tag) || 
        r.equipmentName === name
      );
      if (resp) {
        return {
          createdAt: sub.createdAt,
          operatorName: sub.operatorName,
          status: resp.status,
          notes: resp.notes,
          value: resp.value,
          photoUrl: resp.photoUrl,
          videoUrl: resp.videoUrl
        };
      }
    }
    return null;
  };

  // Helper function to extract all past checks for an equipment
  const getEquipmentAllInspections = (name: string, tag?: string) => {
    const list: any[] = [];
    submissions.forEach(sub => {
      const resp = sub.responses.find(r => 
        (tag && r.equipmentTag === tag) || 
        r.equipmentName === name
      );
      if (resp) {
        list.push({
          id: sub.id,
          createdAt: sub.createdAt,
          operatorName: sub.operatorName,
          status: resp.status,
          notes: resp.notes,
          value: resp.value,
          photoUrl: resp.photoUrl,
          videoUrl: resp.videoUrl
        });
      }
    });
    return list;
  };

  const handleOpenAddTemplate = () => {
    setEditingTemplate(null);
    setTemplateName('');
    setTemplateSectorId('all');
    setTemplateFrequency('shift');
    setTemplateCustomPeriod('');
    setTemplateAllowedShifts([]);
    setTemplateEquipments([
      { 
        id: 'eq_1', 
        name: '', 
        tag: '', 
        description: '', 
        required: true, 
        type: 'condition', 
        lineId: '', 
        sectorId: '' 
      }
    ]);
    setIsTemplateModalOpen(true);
  };

  const handleOpenEditTemplate = (tmpl: RouteTemplate) => {
    setEditingTemplate(tmpl);
    setTemplateName(tmpl.name);
    setTemplateSectorId(tmpl.sectorId || 'all');
    setTemplateFrequency(tmpl.frequency || 'shift');
    setTemplateCustomPeriod(tmpl.customFrequencyPeriod || '');
    setTemplateAllowedShifts(tmpl.allowedShifts || []);
    setTemplateEquipments(tmpl.equipments || []);
    setIsTemplateModalOpen(true);
  };

  const handleAddEquipmentField = () => {
    setTemplateEquipments(prev => [
      ...prev,
      { 
        id: `eq_${Date.now()}`, 
        name: '', 
        tag: '', 
        description: '', 
        required: true, 
        type: 'condition',
        lineId: '', 
        sectorId: '' 
      }
    ]);
  };

  const handleRemoveEquipmentField = (id: string) => {
    setTemplateEquipments(prev => prev.filter(eq => eq.id !== id));
  };

  const handleUpdateEquipmentField = (id: string, field: keyof RouteEquipmentItem, value: any) => {
    setTemplateEquipments(prev => prev.map(eq => {
      if (eq.id === id) {
        return { ...eq, [field]: value };
      }
      return eq;
    }));
  };

  const moveEquipmentUp = (index: number) => {
    if (index === 0) return;
    const list = [...templateEquipments];
    const prev = list[index - 1];
    list[index - 1] = list[index];
    list[index] = prev;
    setTemplateEquipments(list);
  };

  const moveEquipmentDown = (index: number) => {
    if (index === templateEquipments.length - 1) return;
    const list = [...templateEquipments];
    const next = list[index + 1];
    list[index + 1] = list[index];
    list[index] = next;
    setTemplateEquipments(list);
  };

  const handleDropEquipment = (targetIdx: number) => {
    if (draggedEquipmentIndex === null) return;
    const list = [...templateEquipments];
    const itemToMove = list[draggedEquipmentIndex];
    list.splice(draggedEquipmentIndex, 1);
    list.splice(targetIdx, 0, itemToMove);
    setTemplateEquipments(list);
    setDraggedEquipmentIndex(null);
    setDragOverEquipmentIndex(null);
  };

  // CSV Bulk Import handlers
  const handleDownloadCsvTemplate = () => {
    const csvContent = "nome,tag,descricao,setor,linha,tipo,obrigatorio\n" +
      "Compressor de Ar,COMP-01,Inspecionar vazamento e pressao,Utilidades,,numérico,sim\n" +
      "Ponte Rolante,PTR-02,Verificar esticadores de cabo de aco,,Linha 1,opções,não\n" +
      "Motor Redutor Executivo,MTR-03,Coletar aquecimento dos mancais,,,range,sim\n" +
      "Leitor Optico de Caixa,LIT-04,Validar chave de fim de curso,,,barcode,sim";
    
    // Add BOM for Microsoft Excel UTF-8 compatibility
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "modelo_importacao_equipamentos.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCsvFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    readCsvFile(file);
  };

  const readCsvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setCsvText(text);
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleCsvDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setCsvDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      readCsvFile(file);
    }
  };

  const handleApplyImport = (shouldReplace: boolean) => {
    if (csvParseResults.length === 0) return;
    
    const validEquipments = csvParseResults
      .filter(item => item.errors.length === 0)
      .map(item => item.equipment);
      
    if (validEquipments.length === 0) {
      setModalConfig({
        isOpen: true,
        title: 'Nenhum Equipamento Válido',
        message: 'Nenhum equipamento foi carregado pois todas as linhas possuem erros de validação.',
        type: 'error'
      });
      return;
    }

    if (shouldReplace) {
      setTemplateEquipments(validEquipments);
    } else {
      setTemplateEquipments(prev => [...prev, ...validEquipments]);
    }

    setIsCsvImportModalOpen(false);
    setCsvText('');
    setCsvParseResults([]);
    
    setModalConfig({
      isOpen: true,
      title: 'Equipamentos Carregados',
      message: `${validEquipments.length} equipamentos foram adicionados com sucesso ao modelo de rota. Salve o modelo para registrar permanentemente no banco.`,
      type: 'success'
    });
  };

  // Create or Update template in firestore
  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      setModalConfig({
        isOpen: true,
        title: 'Campo Obrigatório',
        message: 'Por favor, insira o nome da rota.',
        type: 'error'
      });
      return;
    }

    if (templateEquipments.length === 0 || templateEquipments.some(eq => !eq.name.trim())) {
      setModalConfig({
        isOpen: true,
        title: 'Equipamentos Incompletos',
        message: 'Por favor, registre pelo menos um equipamento e certifique-se de que todos tenham nome.',
        type: 'error'
      });
      return;
    }

    try {
      const templateData = {
        name: templateName,
        active: editingTemplate ? editingTemplate.active : true,
        sectorId: templateSectorId,
        frequency: templateFrequency,
        customFrequencyPeriod: templateFrequency === 'custom' ? templateCustomPeriod : '',
        allowedShifts: templateAllowedShifts,
        equipments: templateEquipments.map(eq => ({
          id: eq.id,
          name: eq.name,
          tag: eq.tag || '',
          description: eq.description || '',
          required: eq.required !== false,
          type: eq.type || 'condition',
          conditionOptionsId: eq.conditionOptionsId || '',
          isInteger: !!eq.isInteger,
          isRangeDropdown: !!eq.isRangeDropdown,
          min: eq.min !== undefined ? Number(eq.min) : 0,
          max: eq.max !== undefined ? Number(eq.max) : 10,
          step: eq.step !== undefined ? Number(eq.step) : 1,
          lineId: eq.lineId || '',
          sectorId: eq.sectorId || ''
        })),
        updatedAt: serverTimestamp()
      };

      if (editingTemplate) {
        await updateDoc(doc(db, 'route_templates', editingTemplate.id), templateData);
      } else {
        await addDoc(collection(db, 'route_templates'), {
          ...templateData,
          createdAt: serverTimestamp()
        });
      }

      setIsTemplateModalOpen(false);
      setModalConfig({
        isOpen: true,
        title: 'Modelo Salvo',
        message: `O modelo de rota "${templateName}" foi salvo com sucesso!`,
        type: 'success'
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'route_templates');
    }
  };

  // Toggle Template Status
  const handleToggleTemplateActive = async (tmpl: RouteTemplate) => {
    try {
      await updateDoc(doc(db, 'route_templates', tmpl.id), {
        active: !tmpl.active,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'route_templates');
    }
  };

  // Image/video upload base64 parser
  const handleFileChange = (equipmentId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 25 * 1024 * 1024) {
        setModalConfig({
          isOpen: true,
          title: 'Arquivo muito grande',
          message: 'O tamanho máximo permitido para vídeos e fotos é de 25MB para garantir a estabilidade do sistema.',
          type: 'error'
        });
        return;
      }

      const isVideo = file.type.startsWith('video/');
      const reader = new FileReader();
      reader.onloadend = () => {
        setRouteResponses(prev => ({
          ...prev,
          [equipmentId]: {
            ...prev[equipmentId],
            photoUrl: isVideo ? undefined : (reader.result as string),
            videoUrl: isVideo ? (reader.result as string) : undefined
          }
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClearEquipmentMedia = (equipmentId: string) => {
    setRouteResponses(prev => ({
      ...prev,
      [equipmentId]: {
        ...prev[equipmentId],
        photoUrl: undefined,
        videoUrl: undefined
      }
    }));
  };

  // Initialize Route Execution responses
  const handleStartRoute = async (tmpl: RouteTemplate) => {
    // Check if the route has already been completed in the current shift today
    const existingSubmission = getTemplateShiftSubmissionToday(tmpl.id);
    if (existingSubmission) {
      setIsReadOnlyRoute(true);
      const dateText = existingSubmission.createdAt?.toDate 
        ? existingSubmission.createdAt.toDate().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        : 'recentemente';
      setModalConfig({
        isOpen: true,
        title: 'Modo de Leitura: Turno Concluído',
        message: `Esta rota operacional já foi realizada e enviada neste turno às ${dateText} por ${existingSubmission.operatorName}. Carregamos os dados preenchidos em modo de visualização / somente-leitura.`,
        type: 'info'
      });
    } else {
      setIsReadOnlyRoute(false);
    }

    setSelectedTemplate(tmpl);
    setSearchQuery('');
    setExpandedEquipmentId(null);
    setAnomalyDetailingEqId(null);
    setIsDraftLoaded(false);
    setDraftSavedAt(null);

    let loadedDraft: any = null;
    if (user) {
      try {
        const draftDoc = await getDoc(doc(db, 'route_drafts', `${user.uid}_${tmpl.id}`));
        if (draftDoc.exists()) {
          loadedDraft = draftDoc.data();
        }
      } catch (e) {
        console.error("Erro ao buscar rascunho anterior:", e);
      }
    }

    if (loadedDraft) {
      setRouteResponses(loadedDraft.routeResponses || {});
      setDetailingResponses(loadedDraft.detailingResponses || {});
      if (loadedDraft.selectedArea) setSelectedArea(loadedDraft.selectedArea);
      setIsPrefilledFromHistory(false);
      
      // Resolve sector and line
      if (loadedDraft.selectedSector) {
        setSelectedSector(loadedDraft.selectedSector);
      } else {
        const matchedSector = sectors.find(s => s.id === tmpl.sectorId) || sectors[0] || null;
        setSelectedSector(matchedSector);
      }
      
      if (loadedDraft.selectedLine) {
        setSelectedLine(loadedDraft.selectedLine);
      } else {
        const matchedSector = sectors.find(s => s.id === tmpl.sectorId) || sectors[0] || null;
        const matchedLine = matchedSector && matchedSector.lineIds && matchedSector.lineIds.length > 0
          ? (lines.find(l => l.id === matchedSector.lineIds[0]) || lines[0] || null)
          : (lines[0] || null);
        setSelectedLine(matchedLine);
      }
      
      if (loadedDraft.selectedShift) setSelectedShift(loadedDraft.selectedShift);
      if (loadedDraft.selectedTeam) setSelectedTeam(loadedDraft.selectedTeam);
      
      const savedDate = loadedDraft.updatedAt?.toDate ? loadedDraft.updatedAt.toDate() : new Date(loadedDraft.updatedAt);
      setDraftSavedAt(savedDate);
      setIsDraftLoaded(true);
      setRouteStep('active_inspection');
    } else {
      const lastSubmissionForTemplate = submissions.find(s => s.templateId === tmpl.id);
      const initialResponses: Record<string, any> = {};
      tmpl.equipments.forEach(eq => {
        const prevResp = lastSubmissionForTemplate?.responses?.find(r => r.equipmentId === eq.id);
        initialResponses[eq.id] = {
          status: prevResp ? prevResp.status : 'ok',
          notes: prevResp ? prevResp.notes : '',
          value: prevResp && prevResp.value !== undefined ? prevResp.value : (eq.type === 'range' ? 'normal' : ''),
          generateObservation: false,
          observationText: ''
        };
      });
      setRouteResponses(initialResponses);
      setIsPrefilledFromHistory(!!lastSubmissionForTemplate);
      
      const matchedSector = sectors.find(s => s.id === tmpl.sectorId) || sectors[0] || null;
      const matchedLine = matchedSector && matchedSector.lineIds && matchedSector.lineIds.length > 0
        ? (lines.find(l => l.id === matchedSector.lineIds[0]) || lines[0] || null)
        : (lines[0] || null);

      setRouteStep('active_inspection');
      setSelectedArea(matchedSector ? matchedSector.name : 'SECAGEM');
      setSelectedSector(matchedSector);
      setSelectedLine(matchedLine);
      
      const currentShift = getCurrentShift();
      const shiftMapping: Record<string, string> = {
        'Turno 1': '00:00 - 08:00',
        'Turno 2': '08:00 - 16:00',
        'Turno 3': '16:00 - 24:00'
      };
      setSelectedShift(shiftMapping[currentShift] || '08:00 - 16:00');
      setSelectedTeam(getGroupForShift(new Date(), currentShift) || 'A');
      setDetailingResponses({});
    }
    
    setActiveTab('new_route');
  };

  // Save Route Submission
  const handleSaveRouteSubmission = async () => {
    if (!selectedTemplate || !user) return;

    // Validation
    const missing = selectedTemplate.equipments.find(
      eq => eq.required && !routeResponses[eq.id]?.status
    );

    if (missing) {
      setModalConfig({
        isOpen: true,
        title: 'Equipamento Pendente',
        message: `Por favor, selecione e preencha todos os campos obrigatórios. Falta avaliar: ${missing.name}`,
        type: 'error'
      });
      return;
    }

    // Modal Confirmation before saving
    setModalConfig({
      isOpen: true,
      title: 'Confirmar Envio da Rota?',
      message: `Deseja concluir e registrar os dados da rota de inspeção "${selectedTemplate.name}"?`,
      type: 'info',
      showConfirmButton: true,
      confirmText: 'Enviar Rota',
      onConfirm: async () => {
        closeModal();
        try {
          const finalResponses = selectedTemplate.equipments.map(eq => {
            const resp = routeResponses[eq.id];
            // Read anomaly details if any
            const detail = detailingResponses[eq.id] || {
              inspectionType: '',
              diagnostic: '',
              notes: '',
              photoUrl: '',
              actionTaken: '',
              responsibleCenter: '',
              schedule: '',
              sapNote: ''
            };
            
            return {
              equipmentId: eq.id,
              equipmentName: eq.name,
              equipmentTag: eq.tag || '',
              status: resp.status,
              notes: resp.notes || detail.notes || '',
              photoUrl: resp.photoUrl || detail.photoUrl || '',
              videoUrl: resp.videoUrl || detail.videoUrl || '',
              value: resp.value !== undefined ? resp.value : '',
              observationGenerated: !!resp.generateObservation,
              observationText: resp.generateObservation ? resp.observationText : '',
              
              // New details fields
              inspectionType: detail.inspectionType || '',
              diagnostic: detail.diagnostic || '',
              actionTaken: detail.actionTaken || '',
              responsibleCenter: detail.responsibleCenter || '',
              schedule: detail.schedule || '',
              sapNote: detail.sapNote || ''
            };
          });

          // 1. Save Submissions
          await addDoc(collection(db, 'route_submissions'), {
            templateId: selectedTemplate.id,
            templateName: selectedTemplate.name,
            operatorName: profile?.displayName || user.email || 'Operador',
            operatorId: user.uid,
            responses: finalResponses,
            
            // New fields for wizard
            areaName: selectedArea || 'SECAGEM',
            sectorName: selectedSector ? selectedSector.name : '',
            lineName: selectedLine ? selectedLine.name : '',
            shift: selectedShift,
            team: selectedTeam,
            
            createdAt: serverTimestamp()
          });

          // 2. Loop through and create Safety Observations in firestore if requested
          for (const resp of finalResponses) {
            if (resp.status === 'not_ok' && (resp.observationGenerated || resp.diagnostic || resp.notes)) {
              await addDoc(collection(db, 'safety_observations'), {
                equipmentId: resp.equipmentId,
                equipmentName: resp.equipmentName,
                routeTemplateId: selectedTemplate.id,
                routeName: selectedTemplate.name,
                reportedBy: profile?.displayName || user.email || 'Operador',
                reportedById: user.uid,
                description: resp.observationText || `Falha identificada: ${resp.diagnostic || 'Anomalia no equipamento'}. Comentário: ${resp.notes || 'Nenhum'}. Providência: ${resp.actionTaken || 'Tomar providências'}`,
                photoUrl: resp.photoUrl || '',
                status: 'pending', // pending, working, resolved
                createdAt: serverTimestamp()
              });
            }
          }

          // Delete Draft
          const draftId = `${user.uid}_${selectedTemplate.id}`;
          try {
            await deleteDoc(doc(db, 'route_drafts', draftId));
          } catch (e) {
            console.error("Erro ao remover rascunho de rota concluída:", e);
          }

          setSelectedTemplate(null);
          setRouteResponses({});
          setDetailingResponses({});
          setIsDraftLoaded(false);
          setDraftSavedAt(null);
          setActiveTab('my_routes');
          
          setModalConfig({
            isOpen: true,
            title: 'Rota Registrada!',
            message: 'Inspeção de rota operacional concluída e transmitida ao servidor com sucesso!',
            type: 'success'
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, 'route_submissions');
        }
      }
    });
  };

  const closeModal = () => {
    setModalConfig(prev => ({ ...prev, isOpen: false }));
  };

  // Metrics Data Extraction
  const metrics = useMemo(() => {
    const daysInMonth = new Date(filterYear, filterMonth + 1, 0).getDate();
    const trendData: { name: string; compliance: number }[] = [];
    const eqFailureCounts: Record<string, number> = {};

    // Filter submissions for selected month and year
    const monthlySubs = submissions.filter(sub => {
      const date = safeToDate(sub.createdAt);
      return date && date.getMonth() === filterMonth && date.getFullYear() === filterYear;
    });

    // Conformity Trend by Day
    for (let day = 1; day <= daysInMonth; day++) {
      const subsOnDay = monthlySubs.filter(s => {
        const d = safeToDate(s.createdAt);
        return d && d.getDate() === day;
      });

      if (subsOnDay.length === 0) {
        trendData.push({ name: `${day}`, compliance: 100 });
        continue;
      }

      let checked = 0;
      let okCount = 0;
      subsOnDay.forEach(sub => {
        sub.responses.forEach(r => {
          checked++;
          if (r.status === 'ok') okCount++;
        });
      });

      const rate = checked > 0 ? Math.round((okCount / checked) * 100) : 100;
      trendData.push({ name: `${day}`, compliance: rate });
    }

    // Equipment Failure counts
    monthlySubs.forEach(sub => {
      sub.responses.forEach(r => {
        if (r.status === 'not_ok') {
          eqFailureCounts[r.equipmentName] = (eqFailureCounts[r.equipmentName] || 0) + 1;
        }
      });
    });

    const failedEquipmentData = Object.entries(eqFailureCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Global rates
    let totalEquipmentChecked = 0;
    let conformingEquipmentChecked = 0;

    monthlySubs.forEach(s => {
      s.responses.forEach(r => {
        totalEquipmentChecked++;
        if (r.status === 'ok') conformingEquipmentChecked++;
      });
    });

    const averageMonthConformityRate = totalEquipmentChecked > 0 
      ? Math.round((conformingEquipmentChecked / totalEquipmentChecked) * 100) 
      : 100;

    return {
      trend: trendData,
      failedEquipments: failedEquipmentData,
      totalSubmissions: monthlySubs.length,
      averageConformity: averageMonthConformityRate,
      criticalEquipmentsCount: failedEquipmentData.length
    };
  }, [submissions, filterMonth, filterYear]);

  return (
    <div className="space-y-8">
      {/* Page Title & Main Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Activity className="w-8 h-8 text-emerald-600 animate-pulse" /> Rotas Operacionais
          </h1>
          <p className="text-slate-500 mt-1 font-medium text-sm">Gerencie, realize e analise verificações e rondas de equipamentos na fábrica.</p>
        </div>

        {/* Action Button for Managers to create models */}
        <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
          <button 
            onClick={() => {
              setSelectedTemplate(null);
              setRouteResponses({});
              setActiveTab('my_routes');
            }}
            className={cn(
              "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all", 
              activeTab === 'my_routes' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
            )}
          >
            Últimas Rondadas
          </button>
          {isManager && (
            <button 
              onClick={() => {
                setSelectedTemplate(null);
                setRouteResponses({});
                setActiveTab('manage_templates');
              }}
              className={cn(
                "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all", 
                activeTab === 'manage_templates' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
              )}
            >
              Modelos Rota
            </button>
          )}
          <button 
            onClick={() => {
              setSelectedTemplate(null);
              setRouteResponses({});
              setActiveTab('metrics');
            }}
            className={cn(
              "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all", 
              activeTab === 'metrics' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
            )}
          >
            Métricas
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white border border-slate-200 rounded-[2.5rem]">
          <Loader2 className="w-12 h-12 text-slate-300 animate-spin" />
          <p className="text-slate-400 font-bold mt-4 text-xs">Aguardando dados de sincronização do Firestore...</p>
        </div>
      ) : activeTab === 'my_routes' ? (
        <div className="space-y-8">
          {/* List of active templates for worker inspection */}
          <div className="space-y-4">
            <h2 className="text-xl font-black text-slate-900 tracking-tight ml-1">Rotas de Vistoria Ativas</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {templates
                .filter(t => t.active)
                .filter(t => {
                  if (!t.allowedShifts || t.allowedShifts.length === 0) return true;
                  const currentShift = getCurrentShift();
                  return t.allowedShifts.includes(currentShift);
                })
                .map(tmpl => {
                const sectorObj = sectors.find(s => s.id === tmpl.sectorId);
                const lineObj = lines.find(l => l.id === tmpl.sectorId);
                const scopeLabel = tmpl.sectorId === 'all' 
                  ? 'Geral / Fábrica' 
                  : (sectorObj?.name || lineObj?.name || 'Setor de Máquinas');
                
                const showPeriod = tmpl.frequency === 'custom' && tmpl.customFrequencyPeriod;

                const completionToday = getTemplateShiftSubmissionToday(tmpl.id);

                return (
                  <div key={tmpl.id} className={cn(
                    "bg-white border p-8 rounded-[2rem] shadow-xs flex flex-col justify-between hover:border-emerald-500 transition-all group",
                    completionToday ? "border-emerald-100 bg-[#fafdfb]" : "border-slate-200"
                  )}>
                    <div className="space-y-4">
                      <div className={cn(
                        "w-11 h-11 rounded-2xl flex items-center justify-center",
                        completionToday ? "bg-emerald-100 text-emerald-700" : "bg-emerald-50 text-emerald-600"
                      )}>
                        <Wrench className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-black text-lg text-slate-900 tracking-tight leading-tight group-hover:text-emerald-600 transition-colors uppercase">{tmpl.name}</h3>
                          {completionToday && (
                            <span className="text-[9px] font-black uppercase tracking-wider px-2 py-1 bg-emerald-100 text-emerald-800 rounded-lg flex items-center gap-1 shrink-0 animate-fade-in select-none">
                              <Check className="w-3 h-3 text-emerald-800 shrink-0" /> Turno Ok
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 font-semibold mt-1 flex items-center gap-1">
                          <LayoutGrid className="w-3.5 h-3.5 text-slate-400" /> {scopeLabel}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-1.5 pt-2">
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 bg-blue-50 text-blue-600 rounded flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {tmpl.frequency === 'shift' ? 'Por Turno' : tmpl.frequency === 'weekly' ? 'Semanal' : `${showPeriod || 'Personalizada'}`}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 bg-slate-50 text-slate-500 rounded">
                          {tmpl.equipments?.length || 0} Equipamentos
                        </span>
                        {tmpl.allowedShifts && tmpl.allowedShifts.length > 0 && (
                          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-lg">
                            {tmpl.allowedShifts.join(', ')}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => handleStartRoute(tmpl)}
                      className={cn(
                        "w-full mt-6 py-3 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center justify-center gap-2",
                        completionToday 
                          ? "bg-slate-100 hover:bg-slate-200 text-slate-500 border border-slate-200" 
                          : "bg-slate-900 hover:bg-slate-800 text-white"
                      )}
                    >
                      {completionToday ? (
                        <>Ronda Concluída <Check className="w-4 h-4 text-emerald-600 shrink-0" /></>
                      ) : (
                        <>Iniciar Ronda <Clipboard className="w-4 h-4 shrink-0" /></>
                      )}
                    </button>
                  </div>
                );
              })}
              {templates.filter(t => t.active).length === 0 && (
                <div className="col-span-full py-16 bg-white border border-dashed border-slate-200 rounded-[2rem] text-center text-slate-400">
                  <Wrench className="w-12 h-12 text-slate-200 mx-auto mb-3 animate-[spin_4s_linear_infinite]" />
                  <p className="font-black text-xs">Nenhum modelo de rota ativo disponível.</p>
                </div>
              )}
            </div>
          </div>

          {/* Past Submissions list */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <h2 className="text-xl font-black text-slate-900 tracking-tight ml-1">Histórico Recente de Rondas</h2>
            <div className="space-y-4">
              {submissions.length === 0 ? (
                <div className="py-12 bg-white border border-slate-100 rounded-[2rem] text-center text-slate-400 text-xs font-semibold">
                  Nenhum registro de ronda de equipamentos executado no banco.
                </div>
              ) : (
                submissions.slice(0, 10).map((sub, idx) => {
                  const dateObj = safeToDate(sub.createdAt);
                  const failResponsesCount = sub.responses.filter(r => r.status === 'not_ok').length;

                  return (
                    <div key={sub.id || `sub-${idx}`} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-slate-300 transition-all">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-12 h-12 rounded-2xl shrink-0 flex items-center justify-center text-white font-black",
                          failResponsesCount > 0 ? "bg-rose-500" : "bg-emerald-500"
                        )}>
                          <Clipboard className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="font-black text-slate-900 text-base leading-tight uppercase">{sub.templateName}</h3>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-slate-400 mt-1">
                            <span className="flex items-center gap-1 text-slate-500 font-bold"><User className="w-3 h-3 text-slate-400" /> {sub.operatorName}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1 text-slate-400"><Calendar className="w-3 h-3 text-slate-400" /> {dateObj ? dateObj.toLocaleString('pt-BR') : 'Aguardando sync'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 self-end md:self-auto">
                        <div className="text-right">
                          <p className="text-xs font-black text-slate-700">{sub.responses.length} Equipamentos Inspecionados</p>
                          <p className={cn("text-[10px] font-black uppercase mt-1", failResponsesCount > 0 ? "text-rose-500" : "text-emerald-600")}>
                            {failResponsesCount > 0 ? `${failResponsesCount} Falhas Reportadas` : 'Sem anomalia'}
                          </p>
                        </div>
                        {(isManager || isAdmin || isMaster) && (
                          <button
                            onClick={() => setSubmissionToDelete(sub)}
                            className="p-2 text-slate-350 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                            title="Excluir Registro de Ronda"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        )}
                        <button
                          onClick={() => setViewingRoute(sub)}
                          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black uppercase tracking-wider rounded-xl transition-all"
                        >
                          Detalhes
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : activeTab === 'new_route' && selectedTemplate ? (
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "bg-slate-50 border border-slate-200 rounded-[2.5rem] mx-auto overflow-hidden shadow-xl flex flex-col transition-all duration-300",
            routeStep === 'active_inspection' 
              ? "max-w-4xl h-[calc(100vh-64px)] max-h-[calc(100vh-64px)] md:h-[calc(100vh-100px)] md:max-h-[calc(100vh-100px)] w-full" 
              : "max-w-2xl w-full"
          )}
        >
          {/* VISUAL BRANDED FOREST GREEN HEADER BAR (Matches screenshots exactly) */}
          <div className="bg-[#0d6e4f] text-white p-6 relative flex flex-col items-center justify-center text-center shrink-0">
            {/* Left Back Arrow / Home indicator */}
            <button
              onClick={() => {
                setModalConfig({
                  isOpen: true,
                  title: 'Cancelar Ronda?',
                  message: 'Deseja realmente abandonar a execução desta rota operacional? Todos os dados preenchidos serão perdidos.',
                  type: 'warning',
                  showConfirmButton: true,
                  confirmText: 'Sair da Rota',
                  onConfirm: () => {
                    closeModal();
                    if (user && selectedTemplate) {
                      const draftId = `${user.uid}_${selectedTemplate.id}`;
                      deleteDoc(doc(db, 'route_drafts', draftId)).catch(console.error);
                    }
                    setSelectedTemplate(null);
                    setRouteResponses({});
                    setDetailingResponses({});
                    setIsDraftLoaded(false);
                    setDraftSavedAt(null);
                    setActiveTab('my_routes');
                  }
                });
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-emerald-800 p-2 rounded-full transition-colors"
              title="Voltar"
            >
              <ChevronLeft className="w-6 h-6 stroke-[3]" />
            </button>

            {/* Header Content Titles */}
            <div className="space-y-0.5 text-center">
              {routeStep !== 'active_inspection' && (
                <h2 className="text-sm font-black tracking-widest uppercase opacity-90">ROTA OPERACIONAL</h2>
              )}
              {routeStep === 'select_area' && (
                <p className="text-base font-black tracking-wide">Selecione sua Área</p>
              )}
              {routeStep === 'select_sector' && (
                <p className="text-base font-black tracking-wide">Setores: {selectedArea || 'SECAGEM'}</p>
              )}
              {routeStep === 'select_details' && (
                <p className="text-base font-black tracking-wide uppercase">{selectedSector?.name || 'Selecione a Linha'}</p>
              )}
              {routeStep === 'active_inspection' && (
                <div className="text-center flex flex-col items-center">
                  <p className="text-sm sm:text-base font-black uppercase leading-tight">
                    {selectedTemplate?.name || 'ROTA OPERACIONAL'}
                  </p>
                  <p className="text-[10px] sm:text-xs font-bold opacity-90 mt-0.5 uppercase tracking-wider">
                    TURNO: {selectedShift} | EQUIPE: {selectedTeam}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-0.5 bg-[#0b5c42] px-3 py-1 rounded-full border border-emerald-800/40 shadow-inner">
                    <span className="text-[9px] sm:text-[10px] font-bold text-emerald-100 uppercase tracking-wider leading-none">
                      Equipamentos: <span className="font-extrabold text-white">{selectedTemplate.equipments.length}</span>
                    </span>
                    <span className="text-emerald-700/60 font-medium leading-none select-none">|</span>
                    <span className="text-[9px] sm:text-[10px] font-bold text-emerald-100 uppercase tracking-wider leading-none">
                      Inspecionados: <span className="font-extrabold text-emerald-300">{
                        selectedTemplate.equipments.filter(e => 
                          routeResponses[e.id]?.status !== undefined && 
                          (routeResponses[e.id].value !== '' || routeResponses[e.id].notes !== '' || routeResponses[e.id].status === 'not_ok')
                        ).length
                      }</span>
                    </span>
                  </div>
                </div>
              )}
            </div>


          </div>

          {/* WIZARD PANEL BODY */}
          <div className={cn(
            "p-6 md:p-8 bg-white space-y-6",
            routeStep === 'active_inspection' ? "flex-1 overflow-y-auto" : ""
          )}>
            
            {/* STEP 1: SELECT AREA */}
            {routeStep === 'select_area' && (
              <div className="space-y-6 animate-fade-in">
                <div className="text-center md:text-left">
                  <h3 className="text-2xl font-black text-[#0d6e4f] tracking-tight leading-none">Selecione sua Área</h3>
                  <p className="text-xs font-semibold text-slate-400 mt-2">Escolha uma das plantas operacionais abaixo para iniciar o checklist da rota.</p>
                </div>

                <div className="space-y-3">
                  {/* Option 1: SECAGEM (Direct representation of Image 1) */}
                  <button
                    onClick={() => {
                      setSelectedArea('SECAGEM');
                      setRouteStep('select_sector');
                    }}
                    className="w-full flex items-center gap-4 bg-slate-50 border-2 border-slate-200/85 hover:border-[#0d6e4f] p-5 rounded-3xl transition-all hover:bg-emerald-50/25 text-left group"
                  >
                    {/* Concentric Spiral SVG custom logo */}
                    <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center border border-emerald-100 shadow-sm shrink-0">
                      <svg className="w-7 h-7" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path 
                          d="M50 15 C69.33 15, 85 30.67, 85 50 C85 69.33, 69.33 85, 50 85 C30.67 85, 15 69.33, 15 50 C15 36.67, 22.33 25.33, 33 20" 
                          stroke="#0d6e4f" 
                          strokeWidth="6" 
                          strokeLinecap="round" 
                          strokeDasharray="4 4"
                        />
                        <path 
                          d="M50 25 C63.81 25, 75 36.19, 75 50 C75 63.81, 63.81 75, 50 75 C36.19 75, 25 63.81, 25 50 C25 41.67, 29.17 34.17, 36 30" 
                          stroke="#10b981" 
                          strokeWidth="6" 
                          strokeLinecap="round" 
                        />
                        <path 
                          d="M50 35 C58.28 35, 65 41.72, 65 50 C65 58.28, 58.28 65, 50 65 C41.72 65, 35 58.28, 35 50" 
                          stroke="#34d399" 
                          strokeWidth="6" 
                          strokeLinecap="round" 
                        />
                      </svg>
                    </div>

                    <div className="flex-1">
                      <h4 className="font-black text-slate-800 text-lg uppercase tracking-wide group-hover:text-[#0d6e4f] transition-colors leading-none">SECAGEM</h4>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1.5 flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-emerald-600" /> Planta de Processamento e Secadoras
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-[#0d6e4f]" />
                  </button>

                  {/* Fallback Option so it feels completely standard */}
                  <button
                    onClick={() => {
                      setSelectedArea('OUTRA ÁREA');
                      setRouteStep('select_sector');
                    }}
                    className="w-full flex items-center gap-4 bg-slate-50 border border-slate-200 hover:border-slate-300 opacity-60 p-5 rounded-3xl transition-all text-left group"
                  >
                    <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center shrink-0">
                      <Wrench className="w-5 h-5 text-slate-400" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-slate-600 text-base uppercase leading-none">OUTRAS ÁREAS</h4>
                      <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-wider">Demais instalações auxiliares</p>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: SELECT SECTOR */}
            {routeStep === 'select_sector' && (
              <div className="space-y-5 animate-fade-in">
                <div className="text-center md:text-left">
                  <h3 className="text-2xl font-black text-[#0d6e4f] tracking-tight leading-none">Setores: {selectedArea}</h3>
                  <p className="text-xs font-semibold text-slate-400 mt-2">Escolha o setor departamental onde será executada a rota operacional.</p>
                </div>

                <div className="space-y-3">
                  {sectors.map(sec => (
                    <button
                      key={sec.id}
                      onClick={() => {
                        setSelectedSector(sec);
                        setRouteStep('select_details');
                      }}
                      className="w-full flex items-center gap-4 bg-slate-50 border-2 border-slate-200/80 hover:border-[#0d6e4f] p-5 rounded-3xl transition-all hover:bg-emerald-50/25 text-left group"
                    >
                      <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center border border-emerald-100 shadow-sm shrink-0">
                        <svg className="w-7 h-7" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path 
                            d="M50 15 C69.33 15, 85 30.67, 85 50 C85 69.33, 69.33 85, 50 85 C30.67 85, 15 69.33, 15 50 C15 36.67, 22.33 25.33, 33 20" 
                            stroke="#0d6e4f" 
                            strokeWidth="6" 
                            strokeLinecap="round" 
                            strokeDasharray="4 4"
                          />
                          <path 
                            d="M50 25 C63.81 25, 75 36.19, 75 50 C75 63.81, 63.81 75, 50 75 C36.19 75, 25 63.81, 25 50 C25 41.67, 29.17 34.17, 36 30" 
                            stroke="#10b981" 
                            strokeWidth="6" 
                            strokeLinecap="round" 
                          />
                        </svg>
                      </div>

                      <div className="flex-1">
                        <h4 className="font-black text-slate-800 text-base uppercase tracking-wide group-hover:text-[#0d6e4f] transition-colors leading-none">{sec.name}</h4>
                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-1.5">Clique para prosseguir para o preenchimento de detalhes</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-[#0d6e4f]" />
                    </button>
                  ))}

                  {sectors.length === 0 && (
                    <div className="p-8 text-center bg-slate-50 border border-dashed rounded-3xl text-slate-400 text-xs">
                      Nenhum setor de qualidade cadastrado no sistema. Por favor, crie um setor de qualidade primeiro.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* STEP 3: SELECT DETAILS (Line, Shift & Team) */}
            {routeStep === 'select_details' && (
              <div className="space-y-6 animate-fade-in text-slate-800">
                <div className="text-left border-b pb-4 border-slate-100">
                  <h3 className="text-xl font-black text-[#0d6e4f] uppercase tracking-tight">Setor: {selectedSector?.name}</h3>
                  <p className="text-xs font-semibold text-slate-450 mt-1">Configure a linha, turno e equipe de inspeção para abrir o caderno de ronda.</p>
                </div>

                {/* 1. LINHA DE PRODUÇÃO (Production Line) */}
                <div className="space-y-2.5">
                  <label className="text-[11px] font-black uppercase tracking-wider text-slate-400">Linha de Produção</label>
                  <div className="grid grid-cols-2 gap-3">
                    {lines
                      .filter(l => !selectedSector?.lineIds || selectedSector.lineIds.length === 0 || selectedSector.lineIds.includes(l.id))
                      .map(ln => {
                        const isChosen = selectedLine?.id === ln.id;
                        return (
                          <div
                            key={ln.id}
                            onClick={() => setSelectedLine(ln)}
                            className={cn(
                              "flex items-center gap-3 p-4 border rounded-2xl cursor-pointer transition-all hover:bg-slate-50/50",
                              isChosen ? "border-[#0d6e4f] bg-emerald-50/10 ring-1 ring-[#0d6e4f]" : "border-slate-200"
                            )}
                          >
                            <div className={cn(
                              "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0",
                              isChosen ? "border-[#0d6e4f]" : "border-slate-300"
                            )}>
                              {isChosen && <div className="w-2.5 h-2.5 rounded-full bg-[#0d6e4f]" />}
                            </div>
                            <span className="font-black text-sm uppercase tracking-wide text-slate-850 leading-none">{ln.name}</span>
                          </div>
                        );
                      })}

                    {lines.length === 0 && (
                      <div className="col-span-2 text-center p-4 bg-slate-50 border rounded-2xl text-xs text-slate-400">
                        Nenhuma linha cadastrada. Utilizando defaults...
                        <div className="flex gap-2 mt-2">
                          {['MS1', 'MS2'].map(defName => (
                            <button
                              key={defName}
                              onClick={() => setSelectedLine({ id: defName, name: defName, active: true })}
                              className="flex-1 p-3 border rounded-xl font-bold text-xs"
                            >
                              {defName}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. TURNO (Shift Selection) */}
                <div className="space-y-2.5">
                  <label className="text-[11px] font-black uppercase tracking-wider text-slate-400">Turno Operacional</label>
                  <div className="space-y-2">
                    {[
                      '00:00 - 08:00',
                      '08:00 - 16:00',
                      '16:00 - 24:00'
                    ].map(sh => {
                      const isChosen = selectedShift === sh;
                      return (
                        <div
                          key={sh}
                          onClick={() => setSelectedShift(sh)}
                          className={cn(
                            "flex items-center gap-3 p-4 border rounded-2xl cursor-pointer transition-all hover:bg-slate-50/50",
                            isChosen ? "border-[#0d6e4f] bg-emerald-50/10 ring-1 ring-[#0d6e4f]" : "border-slate-200"
                          )}
                        >
                          <div className={cn(
                            "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0",
                            isChosen ? "border-[#0d6e4f]" : "border-slate-300"
                          )}>
                            {isChosen && <div className="w-2.5 h-2.5 rounded-full bg-[#0d6e4f]" />}
                          </div>
                          <span className="font-bold text-sm text-slate-800 leading-none">{sh}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 3. EQUIPE (Team A Through E) */}
                <div className="space-y-2.5">
                  <label className="text-[11px] font-black uppercase tracking-wider text-slate-400">Equipe / Grupo</label>
                  <div className="flex justify-between items-center gap-2">
                    {['A', 'B', 'C', 'D', 'E'].map(tm => {
                      const isChosen = selectedTeam === tm;
                      return (
                        <button
                          key={tm}
                          type="button"
                          onClick={() => setSelectedTeam(tm)}
                          className={cn(
                            "w-11 h-11 uppercase font-black text-xs rounded-full border transition-all flex items-center justify-center shadow-xs active:scale-95",
                            isChosen 
                              ? "bg-[#0d6e4f] text-white border-[#0d6e4f] ring-2 ring-emerald-100" 
                              : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                          )}
                        >
                          {tm}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 4. BUTTONS - Submissions Start or Non-Executed Justification */}
                <div className="pt-4 border-t border-slate-100 space-y-3">
                  <button
                    onClick={() => {
                      if (!selectedLine) {
                        setModalConfig({
                          isOpen: true,
                          title: 'Linha Requerida',
                          message: 'Por favor, selecione uma linha de produção para iniciar a ronda.',
                          type: 'error'
                        });
                        return;
                      }
                      setRouteStep('active_inspection');
                    }}
                    className="w-full bg-[#0d6e4f] hover:bg-emerald-800 text-white font-black py-4 rounded-2xl transition-all shadow-md active:scale-95 text-xs uppercase tracking-wider"
                  >
                    INICIAR ROTA
                  </button>

                  <button
                    onClick={() => {
                      setIsJustifyModalOpen(true);
                    }}
                    className="w-full bg-rose-50 hover:bg-rose-100 text-rose-600 font-black py-3.5 rounded-2xl transition-all text-[11px] uppercase tracking-wider border border-rose-100 block text-center"
                  >
                    JUSTIFICAR ROTA NÃO REALIZADA
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: ITEM LISTS / DRILLDOWNS (Images 4 through 8) */}
            {routeStep === 'active_inspection' && (
              <div className="space-y-4 animate-fade-in text-slate-800">
                
                {/* Search query textbox + QR scan icon (Direct representation of image 4 search row) */}
                <div className="relative group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#0d6e4f] w-5 h-5 transition-colors" />
                  <input
                    type="text"
                    placeholder="Itens de busca"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-3xl pl-12 pr-12 py-3.5 outline-none focus:bg-white focus:ring-2 focus:ring-[#0d6e4f]/50 font-bold text-xs text-slate-700 placeholder:text-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      // Trigger dynamic scanner popup
                      setActiveScanner('general-lookup');
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#0d6e4f] hover:bg-slate-100 p-2 rounded-full"
                    title="Ler Placa de Identificação por Código / TAG QR"
                  >
                    <QrCode className="w-5 h-5" />
                  </button>
                </div>

                {isReadOnlyRoute && (
                  <div className="bg-amber-50 border border-amber-200/60 p-4 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-3 text-slate-800 animate-fade-in sm:px-6 shadow-xs">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
                        <Lock className="w-5 h-5 text-amber-705" />
                      </div>
                      <div className="text-left leading-tight">
                        <h4 className="text-xs font-black text-amber-900 uppercase tracking-wide">Rota Concluída neste Turno</h4>
                        <p className="text-[10px] text-amber-700 font-bold mt-0.5 max-w-sm">
                          Esta rota operacional já foi realizada e enviada neste turno. Você está visualizando os dados preenchidos no modo somente leitura.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {isPrefilledFromHistory && !isDraftLoaded && !isReadOnlyRoute && (
                  <div className="bg-[#f0fbf6] border border-[#d1f2e1] p-4 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-3 text-slate-800 animate-fade-in sm:px-6 shadow-xs">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-emerald-100 flex items-center justify-center shrink-0">
                        <History className="w-5 h-5 text-[#0d6e4f]" />
                      </div>
                      <div className="text-left leading-tight">
                        <h4 className="text-xs font-black text-emerald-900 uppercase tracking-wide">Integração por Histórico</h4>
                        <p className="text-[10px] text-emerald-700 font-bold mt-0.5 max-w-sm">
                          Os campos desta rota foram pré-preenchidos com os dados da última inspeção realizada. Revise e adicione notas caso haja necessidade de correção.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {isDraftLoaded && draftSavedAt && (
                  <div className="bg-emerald-50 border border-emerald-200/80 p-4 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-3 text-slate-800 animate-fade-in sm:px-6 shadow-xs">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-emerald-100 flex items-center justify-center shrink-0">
                        <Clock className="w-5 h-5 text-emerald-600 animate-pulse" />
                      </div>
                      <div className="text-left leading-tight">
                        <h4 className="text-xs font-black text-emerald-900 uppercase tracking-wide">Rascunho Recuperado</h4>
                        <p className="text-[10px] text-emerald-700 font-bold mt-0.5 max-w-sm">
                          Progresso salvo automaticamente às {draftSavedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} do dia {draftSavedAt.toLocaleDateString('pt-BR')}.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={isReadOnlyRoute}
                      onClick={() => {
                        setModalConfig({
                          isOpen: true,
                          title: 'Reiniciar Rota?',
                          message: 'Se você reiniciar, todas as respostas recuperadas serão apagadas permanentemente. Deseja continuar?',
                          type: 'warning',
                          showConfirmButton: true,
                          confirmText: 'Limpar e Começar Nova',
                          onConfirm: () => {
                            closeModal();
                            handleDiscardDraftAndStartFresh();
                          }
                        });
                      }}
                      className={cn(
                        "font-extrabold text-[10px] uppercase tracking-wider py-2 px-3 rounded-xl border shadow-xs leading-none shrink-0 transition-colors",
                        isReadOnlyRoute
                          ? "bg-slate-100 text-slate-305 border-slate-200 cursor-not-allowed opacity-60"
                          : "text-slate-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-100/30 bg-white border-slate-200 cursor-pointer"
                      )}
                    >
                      Começar do Zero
                    </button>
                  </div>
                )}

                {/* QR CAMERA BOX POPULAR SCANNER ON TOP */}
                {activeScanner === 'general-lookup' && (
                  <div className="p-4 bg-slate-900 rounded-3xl text-white space-y-3 relative overflow-hidden border border-slate-800 animate-slide-in">
                    <h4 className="text-xs font-black uppercase tracking-widest text-[#10b981] flex items-center gap-1">
                      <QrCode className="w-4 h-4 animate-bounce" /> Leitor de Tag de Equipamento Ativo
                    </h4>
                    <p className="text-[10px] text-slate-400 font-semibold leading-normal">
                      Aponte a câmera ao QR Code / Código de Barras colado no equipamento para localizá-lo de forma autônoma.
                    </p>
                    <div className="aspect-video relative rounded-2xl bg-black overflow-hidden border border-slate-800 max-w-sm mx-auto">
                      {cameraError ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
                          <AlertCircle className="w-8 h-8 text-rose-500 mb-2" />
                          <p className="text-[10px] font-bold leading-relaxed">{cameraError}</p>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveScanner(null);
                              setCameraError(null);
                            }}
                            className="mt-3 px-3 py-1.5 bg-white text-slate-900 text-[10px] font-bold uppercase rounded-lg"
                          >
                            Fechar
                          </button>
                        </div>
                      ) : (
                        <>
                          <div id="qr-reader-route" className="w-full h-full" />
                          <button
                            onClick={() => setActiveScanner(null)}
                            className="absolute top-2 right-2 bg-black/60 hover:bg-black p-1.5 rounded-full text-white z-20"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* ITEMS CARDS GRID LIST (Represented in images 4, 5, 6) */}
                <div className="space-y-3">
                  {(() => {
                    const filtered = selectedTemplate.equipments.filter(eq => {
                      if (!searchQuery) return true;
                      const q = searchQuery.toLowerCase();
                      return eq.name.toLowerCase().includes(q) || (eq.tag && eq.tag.toLowerCase().includes(q));
                    });

                    if (filtered.length === 0) {
                      return (
                        <div className="py-12 bg-slate-50 border border-slate-200 border-dashed rounded-3xl text-center text-slate-450 text-xs font-semibold">
                          Nenhum equipamento de rota encontrado na pesquisa por "{searchQuery}".
                        </div>
                      );
                    }

                    return filtered.map((eq, inlineIdx) => {
                      const isExpanded = expandedEquipmentId === eq.id;
                      const resp = routeResponses[eq.id] || { status: 'ok', notes: '', value: '', generateObservation: false };
                      const isChecked = resp.value !== '' || resp.notes !== '' || resp.status === 'not_ok';
                      
                      return (
                        <div
                          key={eq.id}
                          className={cn(
                            "border rounded-3xl transition-all bg-white relative",
                            isChecked ? "border-[#0d6e4f]/60 shadow-sm" : "border-slate-200"
                          )}
                        >
                          {/* Item Header */}
                          <div className="p-4 flex items-center justify-between gap-4 select-none">
                            {/* Left part */}
                            <div 
                              onClick={() => setExpandedEquipmentId(isExpanded ? null : eq.id)}
                              className="flex-1 cursor-pointer"
                            >
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {eq.tag ? (
                                  <span className={cn(
                                    "text-xs font-black px-2 py-0.5 rounded leading-none uppercase transition-colors duration-200",
                                    resp.value === '' 
                                      ? "bg-slate-100 text-slate-500 border border-slate-200" 
                                      : (resp.status === 'not_ok' ? "bg-rose-100 text-rose-700" : "bg-[#f0fdf4] text-[#0d6e4f]")
                                  )}>
                                    {eq.tag}
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded uppercase">TAG PENDENTE</span>
                                )}
                                
                                {isChecked && (
                                  <Check className={cn(
                                    "w-4 h-4 shrink-0 font-bold",
                                    resp.status === 'not_ok' ? "text-rose-500" : "text-[#0d6e4f]"
                                  )} />
                                )}
                              </div>
                              <h4 className="font-extrabold text-slate-700 text-sm mt-1 leading-tight uppercase truncate max-w-[340px]">
                                {eq.name}
                              </h4>
                            </div>

                            {/* Down Arrow square button (matches images exactly) */}
                            <button
                              type="button"
                              onClick={() => setExpandedEquipmentId(isExpanded ? null : eq.id)}
                              className={cn(
                                "w-10 h-10 rounded-xl flex items-center justify-center transition-all shrink-0 text-white cursor-pointer",
                                isExpanded ? "bg-emerald-800 rotate-180" : "bg-[#0d6e4f] hover:bg-emerald-800"
                              )}
                            >
                              <ChevronRight className="w-5 h-5 rotate-90 stroke-[3]" />
                            </button>
                          </div>

                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden border-t border-slate-100 p-5 space-y-4 text-xs font-semibold text-[#1e293b] bg-slate-50/40 rounded-b-3xl"
                                onClick={(e) => e.stopPropagation()}
                              >


                                  {eq.description && (
                                    <p className="text-slate-400 text-[11px] leading-normal italic bg-slate-50 p-2 rounded-xl">" {eq.description} "</p>
                                  )}

                                  {/* Custom collect fields depending on type */}
                                  <div className="space-y-4">
                                    {/* CONDITION TYPE OPTION ROWS */}
                                    {eq.type === 'condition' && (
                                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                                        <div className="flex flex-col text-left">
                                          <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Parâmetro de Inspeção:</span>
                                          <span className="text-xs font-black text-slate-700 uppercase mt-0.5">Selecione o Estado</span>
                                        </div>
                                        <div className="flex flex-wrap gap-2 justify-end">
                                          {(optionSets.find(o => o.id === eq.conditionOptionsId)?.options || ['OK', 'NÃO OK']).map((option, inlineOptionIdx) => {
                                            const isSelected = resp.value === option;
                                            return (
                                              <button
                                                key={`${option}-${inlineOptionIdx}`}
                                                type="button"
                                                disabled={isReadOnlyRoute}
                                                onClick={() => {
                                                  const labelLower = option.toLowerCase();
                                                  const autoStatus = (labelLower === 'not ok' || labelLower === 'nok' || labelLower.includes('não') || labelLower.includes('falha') || labelLower.includes('instável'))
                                                    ? 'not_ok'
                                                    : 'ok';
                                                  
                                                  setRouteResponses(prev => ({
                                                    ...prev,
                                                    [eq.id]: {
                                                      ...prev[eq.id],
                                                      value: option,
                                                      status: autoStatus
                                                    }
                                                  }));
                                                  
                                                  if (autoStatus === 'not_ok') {
                                                    setAnomalyDetailingEqId(eq.id);
                                                  }
                                                }}
                                                className={cn(
                                                  "px-3 py-2 rounded-xl text-xs font-bold border transition-all",
                                                  isReadOnlyRoute ? "cursor-not-allowed opacity-75" : "cursor-pointer",
                                                  isSelected 
                                                    ? "bg-emerald-50 text-emerald-700 border-[#0d6e4f] ring-1 ring-[#0d6e4f]" 
                                                    : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                                                )}
                                              >
                                                {option}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}

                                    {/* NUMBER VALUE COLLECT */}
                                    {eq.type === 'number' && (
                                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                                        <div className="flex flex-col text-left">
                                          <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Valor Medido:</span>
                                          <span className="text-xs font-black text-slate-700 uppercase mt-0.5">
                                            Limites: {eq.min ?? '0'} a {eq.max ?? '10'} {eq.unit ?? ''}
                                          </span>
                                        </div>
                                        <div className="flex gap-2 justify-end w-full sm:w-auto">
                                          <input
                                            type="number"
                                            placeholder="..."
                                            disabled={isReadOnlyRoute}
                                            value={resp.value || ''}
                                            onChange={(e) => {
                                              const rawVal = e.target.value;
                                              const valNum = parseFloat(rawVal);
                                              let autoStatus = 'ok';
                                              if (rawVal !== '' && !isNaN(valNum)) {
                                                const minLimit = eq.min !== undefined ? eq.min : 0;
                                                const maxLimit = eq.max !== undefined ? eq.max : 10;
                                                if (valNum < minLimit || valNum > maxLimit) {
                                                  autoStatus = 'not_ok';
                                                }
                                              }
                                              setRouteResponses(prev => ({
                                                ...prev,
                                                [eq.id]: { 
                                                  ...prev[eq.id], 
                                                  value: rawVal,
                                                  status: autoStatus as 'ok' | 'not_ok'
                                                }
                                              }));
                                              
                                              if (autoStatus === 'not_ok') {
                                                setAnomalyDetailingEqId(eq.id);
                                              }
                                            }}
                                            className={cn(
                                              "w-full sm:w-36 text-right text-xs px-3 py-2 border rounded-xl outline-none font-bold",
                                              isReadOnlyRoute 
                                                ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed" 
                                                : "bg-slate-50 border-slate-200 text-slate-705 focus:ring-1 focus:ring-[#0d6e4f]"
                                            )}
                                          />
                                        </div>
                                      </div>
                                    )}

                                    {/* RANGE SELECTIONS BAIXO/NORMAL/ALTO */}
                                    {eq.type === 'range' && (
                                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                                        <div className="flex flex-col text-left">
                                          <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Nível Operacional:</span>
                                          <span className="text-xs font-black text-slate-700 uppercase mt-0.5">Defina o Nível</span>
                                        </div>
                                        <div className="flex gap-1.5 justify-end w-full sm:w-auto shrink-0">
                                          {[
                                            { label: 'BAIXO', val: 'low', col: 'bg-amber-600 text-white border-amber-600' },
                                            { label: 'NORMAL / OK', val: 'normal', col: 'bg-[#0d6e4f] text-white border-[#0d6e4f]' },
                                            { label: 'ALTO', val: 'high', col: 'bg-rose-600 text-white border-rose-600' }
                                          ].map(rnVal => {
                                            const isActive = resp.value === rnVal.val;
                                            return (
                                              <button
                                                key={rnVal.val}
                                                type="button"
                                                disabled={isReadOnlyRoute}
                                                onClick={() => {
                                                  const autoStatus = rnVal.val === 'low' || rnVal.val === 'high' ? 'not_ok' : 'ok';
                                                  setRouteResponses(prev => ({
                                                    ...prev,
                                                    [eq.id]: {
                                                      ...prev[eq.id],
                                                      value: rnVal.val,
                                                      status: autoStatus
                                                    }
                                                  }));
                                                  if (autoStatus === 'not_ok') {
                                                    setAnomalyDetailingEqId(eq.id);
                                                  }
                                                }}
                                                className={cn(
                                                  "px-2.5 py-1.5 rounded-xl text-[9px] font-black uppercase border transition-all text-center",
                                                  isReadOnlyRoute ? "cursor-not-allowed opacity-75" : "cursor-pointer",
                                                  isActive ? rnVal.col : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                                                )}
                                              >
                                                {rnVal.label}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}

                                    {/* BARCODE VALUE COLLECT */}
                                    {eq.type === 'barcode' && (
                                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                                        <div className="flex flex-col text-left">
                                          <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Cód. Barras:</span>
                                          <span className="text-xs font-black text-slate-700 uppercase mt-0.5">Identificador Cód. Barras</span>
                                        </div>
                                        <div className="flex gap-2 justify-end w-full sm:w-auto shrink-0">
                                          <input
                                            type="text"
                                            placeholder="Digite ou leia..."
                                            disabled={isReadOnlyRoute}
                                            value={resp.value || ''}
                                            onChange={(e) => {
                                              setRouteResponses(prev => ({
                                                ...prev,
                                                [eq.id]: { ...prev[eq.id], value: e.target.value }
                                              }));
                                            }}
                                            className={cn(
                                              "w-full sm:w-36 text-xs px-3 py-2 border rounded-xl outline-none font-bold text-right",
                                              isReadOnlyRoute ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed" : "bg-slate-50 border-slate-200 text-slate-700"
                                            )}
                                          />
                                          <button
                                            type="button"
                                            disabled={isReadOnlyRoute}
                                            onClick={() => setActiveScanner(eq.id)}
                                            className={cn(
                                              "p-2 rounded-xl shrink-0 border",
                                              isReadOnlyRoute ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed" : "bg-emerald-50 text-[#0d6e4f] border-emerald-100 hover:bg-emerald-100 cursor-pointer"
                                            )}
                                          >
                                            <QrCode className="w-4 h-4" />
                                          </button>
                                        </div>
                                      </div>
                                    )}

                                    {/* If QR Scanner is triggered for individual item */}
                                    {activeScanner === eq.id && (
                                      <div className="p-3 bg-black rounded-xl overflow-hidden aspect-video border border-slate-800 relative max-w-[260px] mx-auto">
                                        <div id="qr-reader-route" className="w-full h-full" />
                                        <button
                                          type="button"
                                          onClick={() => setActiveScanner(null)}
                                          className="absolute top-2 right-2 p-1 bg-black/50 text-white rounded-full cursor-pointer"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    )}

                                    {/* Display if they detailed and filled deep NON-OK options */}
                                    {resp.status === 'not_ok' && detailingResponses[eq.id] && (
                                      <div className="p-3 bg-rose-50/50 border border-rose-100 rounded-xl text-[10px] text-rose-950 space-y-1">
                                        <div className="flex items-center gap-1 text-[9px] font-black uppercase text-rose-750">
                                          <AlertTriangle className="w-3.5 h-3.5 text-rose-500" /> Detalhes Desvio
                                        </div>
                                        <p className="leading-tight">Diagnóstico: <strong>{detailingResponses[eq.id].diagnostic}</strong></p>
                                        <p className="leading-tight">Ação: <strong>{detailingResponses[eq.id].actionTaken}</strong></p>
                                        <button
                                          type="button"
                                          onClick={() => setAnomalyDetailingEqId(eq.id)}
                                          className="text-blue-600 hover:underline hover:text-blue-800 font-bold uppercase text-[9px] block mt-1 cursor-pointer"
                                        >
                                          Editar Parâmetros Técnicos
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  {/* HISTORICAL RECORDS OF THIS EQUIPMENT (WITHIN ACTIVE ROUTE) */}
                                  {(() => {
                                    const eqHistory = submissions
                                      .map(sub => {
                                        const r = sub.responses?.find(resp => resp.equipmentId === eq.id);
                                        if (!r) return null;
                                        return {
                                          createdAt: sub.createdAt,
                                          operatorName: sub.operatorName,
                                          status: r.status,
                                          value: r.value,
                                          notes: r.notes
                                        };
                                      })
                                      .filter((item): item is NonNullable<typeof item> => item !== null)
                                      .slice(0, 3);
                                    
                                    if (eqHistory.length === 0) return null;

                                    return (
                                      <div className="border-t border-slate-100 pt-3 mt-1.5 space-y-1.5 text-left">
                                        <div className="flex items-center gap-1.5 select-none">
                                          <History className="w-3.5 h-3.5 text-slate-400" />
                                          <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Histórico Recente de Parâmetros:</span>
                                        </div>
                                        <div className="bg-slate-50 border border-slate-150 rounded-2xl p-2.5 divide-y divide-slate-150/40">
                                          {eqHistory.map((hist, histIdx) => {
                                            const rawDate = hist.createdAt;
                                            let dateText = 'Data indisponível';
                                            if (rawDate) {
                                              const d = rawDate.toDate ? rawDate.toDate() : new Date(rawDate);
                                              dateText = d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                                            }
                                            
                                            let valDisplay = hist.value ?? '';
                                            if (valDisplay === 'low') valDisplay = 'BAIXO';
                                            if (valDisplay === 'normal') valDisplay = 'NORMAL / OK';
                                            if (valDisplay === 'high') valDisplay = 'ALTO';

                                            return (
                                              <div key={histIdx} className="text-[10px] text-slate-600 font-medium py-1.5 first:pt-0 last:pb-0 leading-normal">
                                                <div className="flex items-center justify-between font-bold text-slate-400">
                                                  <span>{dateText}</span>
                                                  <span className="text-[8px] font-black px-1.5 py-0.5 rounded-sm uppercase tracking-wider bg-slate-205 text-slate-600">
                                                    {hist.operatorName?.split(' ')[0] || 'Inspetor'}
                                                  </span>
                                                </div>
                                                <div className="mt-1 flex items-center justify-between gap-2.5 flex-wrap">
                                                  <div className="flex items-center gap-1.5">
                                                    <span className={cn(
                                                      "w-2 h-2 rounded-full shrink-0",
                                                      hist.status === 'not_ok' ? "bg-rose-500 animate-pulse" : "bg-emerald-500"
                                                    )} />
                                                    <span className="text-slate-800 font-extrabold uppercase">{valDisplay}</span>
                                                  </div>
                                                  {hist.notes && (
                                                    <p className="text-slate-400 italic text-[9.5px] leading-tight w-full truncate max-w-full">
                                                      "{hist.notes}"
                                                    </p>
                                                  )}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    );
                                  })()}

                                  {/* Custom notes text comment inside dropdown */}
                                  <div className="border-t border-slate-100 pt-3 mt-1 space-y-1">
                                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Notas / Detalhamento:</span>
                                    <textarea
                                      placeholder="Escreva observações adicionais para este item, observações técnicas ou detalhes do status..."
                                      disabled={isReadOnlyRoute}
                                      value={resp.notes || ''}
                                      rows={3}
                                      onChange={(e) => {
                                        setRouteResponses(prev => ({
                                          ...prev,
                                          [eq.id]: { ...prev[eq.id], notes: e.target.value }
                                        }));
                                      }}
                                      className={cn(
                                        "w-full border rounded-xl px-3 py-2 font-semibold text-slate-700 outline-none text-xs resize-none",
                                        isReadOnlyRoute ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed" : "bg-slate-50 border-slate-200 focus:ring-1 focus:ring-[#0d6e4f]"
                                      )}
                                    />
                                  </div>

                                  {/* Section: Multimedia Attachment (Photo / Short Video) */}
                                  <div className="border-t border-slate-100 pt-3 mt-1.5 space-y-1.5 text-left">
                                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1 select-none">
                                      <Camera className="w-3.5 h-3.5 text-slate-400" /> Evidência do Item (Foto ou Vídeo):
                                    </span>
                                    
                                    {resp.photoUrl || resp.videoUrl ? (
                                      <div className="relative border border-slate-200 rounded-2xl overflow-hidden bg-slate-950 flex flex-col justify-center items-center">
                                        {resp.photoUrl && (
                                          <img 
                                            src={resp.photoUrl} 
                                            alt="Mídia de inspeção" 
                                            className="w-full max-h-48 object-cover rounded-2xl" 
                                          />
                                        )}
                                        {resp.videoUrl && (
                                          <video 
                                            src={resp.videoUrl} 
                                            controls 
                                            playsInline
                                            className="w-full max-h-48 object-contain rounded-2xl bg-black" 
                                          />
                                        )}
                                        
                                        {!isReadOnlyRoute && (
                                          <button
                                            type="button"
                                            onClick={() => handleClearEquipmentMedia(eq.id)}
                                            className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-rose-600 text-white rounded-full transition-colors cursor-pointer"
                                            title="Remover anexo"
                                          >
                                            <X className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    ) : (
                                      <>
                                        {!isReadOnlyRoute ? (
                                          <div className="flex gap-2">
                                            <label className="flex-1 border-2 border-dashed border-slate-250 hover:border-[#0d6e4f] rounded-2xl p-4 flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-slate-50 transition-colors">
                                              <Upload className="w-4 h-4 text-slate-400" />
                                              <span className="text-[9px] font-black text-slate-600 uppercase tracking-wider block">
                                                Anexar Foto ou Vídeo
                                              </span>
                                              <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest block block-inline">
                                                Máximo 25MB (PNG, JPG, MP4)
                                              </span>
                                              <input
                                                type="file"
                                                accept="image/*,video/*"
                                                onChange={(e) => handleFileChange(eq.id, e)}
                                                className="hidden"
                                              />
                                            </label>
                                          </div>
                                        ) : (
                                          <span className="text-[10px] text-slate-400 font-semibold italic mt-1 block">
                                            Nenhuma mídia foi anexada para este item.
                                          </span>
                                        )}
                                      </>
                                    )}
                                  </div>

                                  {/* CONFIRM BUTTON */}
                                  <button
                                    type="button"
                                    disabled={isReadOnlyRoute}
                                    onClick={() => setExpandedEquipmentId(null)}
                                    className={cn(
                                      "w-full py-2.5 font-extrabold rounded-xl text-[10px] uppercase tracking-wider transition-colors shadow-xs",
                                      isReadOnlyRoute
                                        ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                                        : "bg-[#0d6e4f] hover:bg-emerald-800 text-white cursor-pointer"
                                    )}
                                  >
                                    OK / Confirmar
                                  </button>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* BOTTOM STICKY FLOATING METRICS SUMMARY FOOTER */}
                <div className="pt-4 border-t border-slate-150 flex items-center justify-end gap-4 py-4 px-1">
                  <div className="flex gap-2.5 w-full sm:w-auto shrink-0 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        if (isReadOnlyRoute) {
                          setSelectedTemplate(null);
                          setRouteResponses({});
                          setDetailingResponses({});
                          setIsDraftLoaded(false);
                          setDraftSavedAt(null);
                          setActiveTab('my_routes');
                          return;
                        }
                        setModalConfig({
                          isOpen: true,
                          title: 'Cancelar Ronda?',
                          message: 'Deseja realmente abandonar a execução desta rota operacional? Todos os dados preenchidos serão perdidos.',
                          type: 'warning',
                          showConfirmButton: true,
                          confirmText: 'Sair da Rota',
                          onConfirm: () => {
                            closeModal();
                            if (user && selectedTemplate) {
                              const draftId = `${user.uid}_${selectedTemplate.id}`;
                              deleteDoc(doc(db, 'route_drafts', draftId)).catch(console.error);
                            }
                            setSelectedTemplate(null);
                            setRouteResponses({});
                            setDetailingResponses({});
                            setIsDraftLoaded(false);
                            setDraftSavedAt(null);
                            setActiveTab('my_routes');
                          }
                        });
                      }}
                      className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black rounded-xl text-xs uppercase tracking-wide leading-none"
                    >
                      {isReadOnlyRoute ? 'Sair' : 'Voltar'}
                    </button>
                    
                    {isReadOnlyRoute ? (
                      <button
                        type="button"
                        disabled
                        className="px-8 py-3 bg-slate-100 border border-slate-200 text-slate-400 font-black rounded-xl text-xs uppercase tracking-wide leading-none cursor-not-allowed"
                      >
                        Salvo neste Turno
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSaveRouteSubmission}
                        className="px-8 py-3 bg-[#0d6e4f] hover:bg-emerald-800 text-white font-black rounded-xl text-xs uppercase tracking-wide leading-none shadow-md shadow-emerald-50 active:scale-95 transition-all"
                      >
                        Finalizar Ronda
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

          </div>
        </motion.div>
      ) : activeTab === 'manage_templates' ? (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex-wrap gap-4">
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Gerenciamento de Modelos</h2>
              <p className="text-xs text-slate-400 mt-0.5 font-medium flex items-center gap-1">
                <Settings className="w-3.5 h-3.5 text-slate-300" /> Crie, ative ou customize rotas de inspeções e rondeiras.
              </p>
            </div>
            <button
              onClick={handleOpenAddTemplate}
              className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-5 py-3 rounded-xl text-xs font-black shadow-lg shadow-slate-200 uppercase tracking-wider transition-all"
            >
              <Plus className="w-4 h-4" /> Novo Modelo Rota
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map(tmpl => {
              const secObj = sectors.find(s => s.id === tmpl.sectorId);
              const lineObj = lines.find(l => l.id === tmpl.sectorId);
              const applicableLabel = tmpl.sectorId === 'all' 
                ? 'Todos (Fábrica)' 
                : (secObj?.name || lineObj?.name || 'Geral');

              return (
                <div key={tmpl.id} className="bg-white rounded-[2rem] border border-slate-200 p-6 flex flex-col justify-between hover:shadow-md transition-all">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-black text-slate-900 text-base leading-tight uppercase">{tmpl.name}</h3>
                        <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mt-1">
                          {tmpl.equipments?.length || 0} Equipamentos atrelados
                        </p>
                      </div>

                      <button
                        onClick={() => handleToggleTemplateActive(tmpl)}
                        className={cn(
                          "px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-lg border leading-none transition-colors shrink-0",
                          tmpl.active ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-slate-100 text-slate-400 border-slate-200"
                        )}
                      >
                        {tmpl.active ? 'Ativo' : 'Inativo'}
                      </button>
                    </div>

                    <div className="space-y-1 bg-slate-50/50 p-3 rounded-xl border">
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">
                        Frequência: <span className="font-extrabold text-blue-600">{tmpl.frequency === 'shift' ? 'Turno' : tmpl.frequency === 'weekly' ? 'Semanal' : `${tmpl.customFrequencyPeriod || 'Customizado'}`}</span>
                      </p>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">
                        Foco de Rota: <span className="font-extrabold text-slate-700">{applicableLabel}</span>
                      </p>
                      {tmpl.allowedShifts && tmpl.allowedShifts.length > 0 && (
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">
                          Turno(s) Autorizados: <span className="font-extrabold text-[#0d6e4f]">{tmpl.allowedShifts.join(', ')}</span>
                        </p>
                      )}
                    </div>

                    <div className="bg-slate-50 p-4 rounded-xl max-h-[140px] overflow-y-auto border border-slate-100/50">
                      <span className="text-[9px] uppercase font-black tracking-widest text-slate-400 block mb-2 font-bold">Distribuição de Itens:</span>
                      <ul className="space-y-2">
                        {tmpl.equipments?.map((eq, idx) => (
                          <li key={idx} className="flex flex-col text-xs font-bold text-slate-600 border-b pb-1 last:border-0 border-slate-200/50">
                            <div className="flex items-center gap-1.5 justify-between">
                              <span className="truncate max-w-[190px]">{eq.name}</span>
                              <span className="text-[8px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-1 py-0.5 rounded border border-emerald-100/50">
                                {eq.type === 'condition' ? 'Custom Cond.' : eq.type === 'number' ? 'Numérico' : eq.type === 'range' ? 'Range HML' : 'Cód. Barras'}
                              </span>
                            </div>
                            {eq.tag && <span className="text-[9px] font-semibold text-slate-400 leading-none mt-0.5 uppercase">TAG: {eq.tag}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="flex gap-2 border-t border-slate-100 pt-4 mt-6">
                    <button
                      onClick={() => handleOpenEditTemplate(tmpl)}
                      className="flex-1 px-3 py-2 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 text-xs font-black rounded-lg transition-colors flex items-center justify-center gap-1 uppercase"
                    >
                      <Edit2 className="w-3.5 h-3.5" /> Editar
                    </button>
                    <button
                      onClick={async () => {
                        setRouteToDelete(tmpl);
                      }}
                      className="px-3 py-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 text-xs font-black rounded-lg transition-colors flex items-center justify-center gap-1 uppercase"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Excluir
                    </button>
                  </div>
                </div>
              );
            })}
            {templates.length === 0 && (
              <div className="col-span-full text-center py-20 text-slate-400 text-xs bg-white rounded-3xl border border-slate-200">
                Nenhum modelo cadastrado. Comece criando um novo modelo!
              </div>
            )}
          </div>
        </div>
      ) : (
        /* METRICS & REPORTS TAB */
        <div className="space-y-8">
          {/* Controls to change Month and Year */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm animate-fade-in">
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Análise de Rendimento & Conformidade</h2>
              <p className="text-xs text-slate-400 font-medium font-semibold flex items-center gap-1">
                <BarChart2 className="w-3.5 h-3.5 text-slate-300" /> Acompanhe estatísticas, tendências e equipamentos com maiores incidências de falha.
              </p>
            </div>

            <div className="flex gap-2">
              <select
                value={filterMonth}
                onChange={(e) => setFilterMonth(parseInt(e.target.value))}
                className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-bold text-xs outline-none focus:ring-2 focus:ring-emerald-500 text-slate-700"
              >
                {months.map((m, idx) => (
                  <option key={m} value={idx}>{m}</option>
                ))}
              </select>
              <select
                value={filterYear}
                onChange={(e) => setFilterYear(parseInt(e.target.value))}
                className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-bold text-xs outline-none focus:ring-2 focus:ring-emerald-500 text-slate-700"
              >
                {[2024, 2025, 2026, 2027].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <Clipboard className="w-6 h-6 text-slate-400 mb-2" />
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rotas Efetuadas</span>
                <p className="text-3xl font-black text-slate-900 mt-1">{metrics.totalSubmissions}</p>
              </div>
              <p className="text-[10px] text-slate-400 font-medium mt-4">Concluídas no mês selecionado</p>
            </div>
            
            <div className="bg-emerald-50/50 p-6 rounded-[2rem] border border-emerald-100 shadow-sm flex flex-col justify-between animate-pulse">
              <div>
                <TrendingUp className="w-6 h-6 text-emerald-500 mb-2" />
                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Taxa de Conformidade</span>
                <p className="text-3xl font-black text-emerald-600 mt-1">{metrics.averageConformity}%</p>
              </div>
              <p className="text-[10px] text-emerald-400 font-medium mt-4">Média mensal de equipamentos Conformes</p>
            </div>

            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <AlertCircle className="w-6 h-6 text-rose-500 mb-2" />
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Equipamentos Críticos</span>
                <p className="text-3xl font-black text-rose-600 mt-1">{metrics.criticalEquipmentsCount}</p>
              </div>
              <p className="text-[10px] text-slate-400 font-bold mt-4">Falhas reportadas nesta competência</p>
            </div>

            <div className="bg-slate-900 text-white p-6 rounded-[2rem] border border-slate-800 shadow-sm flex flex-col justify-between">
              <div>
                <ShieldCheck className="w-6 h-6 text-emerald-400 mb-2" />
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Eficiência Status</span>
                <p className="text-2xl font-black text-white mt-1">{metrics.averageConformity >= 95 ? 'Excelente' : metrics.averageConformity >= 85 ? 'Controlado' : 'Atenção Máxima'}</p>
              </div>
              <p className="text-[10px] text-slate-400 font-medium mt-4 font-semibold italic">Classificação geral de confiabilidade</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Daily Trend Chart (2/3 columns) */}
            <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-6">
              <h3 className="font-black text-lg text-slate-900 tracking-tight">Tendência de Conformidade de Ronda</h3>
              <div className="h-[280px] w-full text-xs font-semibold">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={metrics.trend}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" stroke="#94a3b8" />
                    <YAxis domain={[0, 100]} stroke="#94a3b8" />
                    <Tooltip />
                    <Line type="monotone" dataKey="compliance" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top failure charts (1/3 column) */}
            <div className="lg:col-span-1 bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-6">
              <h3 className="font-black text-lg text-slate-900 tracking-tight">Incidência de Falhas</h3>
              <div className="space-y-4 max-h-[280px] overflow-y-auto pr-1">
                {metrics.failedEquipments.length === 0 ? (
                  <div className="text-center py-16 text-slate-400 text-xs">
                    Nenhuma anomalia de equipamento reportada neste mês.
                  </div>
                ) : (
                  metrics.failedEquipments.map((item, idx) => (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs font-bold leading-none uppercase tracking-wider text-slate-600">
                        <span className="truncate max-w-[160px] ">{item.name}</span>
                        <span className="text-rose-600 shrink-0">{item.count} vezes</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(item.count / metrics.failedEquipments[0].count) * 100}%` }}
                          className="h-full bg-rose-400 rounded-full"
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HISTÓRICO COMPLETO DETAILED SUBMODAL FOR AN INDIVIDUAL EQUIPMENT */}
      <AnimatePresence>
        {historyEquipment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setHistoryEquipment(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-[2rem] border w-full max-w-xl shadow-2xl overflow-hidden relative z-10 font-semibold"
            >
              <div className="p-6 border-b flex items-center justify-between">
                <div>
                  <span className="text-[9px] uppercase font-black text-slate-400 tracking-widest block font-bold">Histórico de Inspeção</span>
                  <h3 className="text-lg font-black text-slate-900 mt-0.5">{historyEquipment.name}</h3>
                  {historyEquipment.tag && (
                    <span className="text-[10px] text-slate-500 font-extrabold flex items-center gap-1 mt-1 leading-none uppercase">
                      <Tag className="w-3 h-3 text-slate-400" /> TAG: {historyEquipment.tag}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setHistoryEquipment(null)}
                  className="p-2 hover:bg-slate-100 rounded-lg shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
                {(() => {
                  const items = getEquipmentAllInspections(historyEquipment.name, historyEquipment.tag);
                  if (items.length === 0) {
                    return (
                      <p className="text-center py-10 text-slate-400 text-xs font-bold">
                        Nenhuma aferição anterior registrada para este equipamento.
                      </p>
                    );
                  }
                  return items.map((itm, idx) => {
                    const dateVal = safeToDate(itm.createdAt);
                    return (
                      <div key={idx} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                        <div className="flex justify-between items-center gap-2">
                          <span className="text-slate-400 font-black text-[9px] uppercase">
                            {dateVal ? dateVal.toLocaleString('pt-BR') : 'Sem data registrada'}
                          </span>

                          <span className={cn(
                            "px-2 py-0.5 rounded text-[9px] uppercase font-black tracking-wider border",
                            itm.status === 'ok' 
                              ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
                              : "bg-rose-50 text-rose-600 border-rose-100"
                          )}>
                            {itm.status === 'ok' ? 'Conforme' : 'Instável'}
                          </span>
                        </div>

                        <div className="font-medium text-slate-700 leading-normal">
                          <p>Inspecionado por <strong className="font-black">{itm.operatorName}</strong>.</p>
                          {itm.value !== undefined && itm.value !== '' && (
                            <p className="mt-1">
                              Valor coletado: <strong className="font-extrabold text-blue-600 bg-white border px-1.5 py-0.5 rounded text-[10px] font-mono whitespace-nowrap">{String(itm.value)}</strong>
                            </p>
                          )}
                          {itm.notes && (
                            <p className="mt-1 pb-1 text-slate-500 text-[11px] font-medium italic">
                              " Obs: {itm.notes} "
                            </p>
                          )}
                        </div>

                        {itm.photoUrl && (
                          <div className="mt-2 pt-2 border-t border-slate-200/50">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Evidência registrada:</span>
                            <img src={itm.photoUrl} alt="Evidência histórica" className="w-full h-24 object-cover rounded-lg" />
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>

              <div className="bg-slate-50 p-4 border-t flex justify-end">
                <button
                  type="button"
                  onClick={() => setHistoryEquipment(null)}
                  className="px-5 py-2 bg-white hover:bg-slate-100 border rounded-xl font-bold text-xs uppercase"
                >
                  Fechar janela
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL VIEWING SUBMISSIONS DETAILS */}
      <AnimatePresence>
        {viewingRoute && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50"
              onClick={() => setViewingRoute(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] border border-slate-200 w-full max-w-2xl overflow-hidden relative shadow-2xl z-10 max-h-[90vh] flex flex-col pt-6 font-semibold"
            >
              {/* Header inside Modal */}
              <div className="px-8 pb-4 border-b border-slate-100 flex items-start justify-between">
                <div>
                  <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 font-bold">Resumo Coletado</span>
                  <h3 className="text-xl font-black text-slate-900 mt-1">{viewingRoute.templateName}</h3>
                </div>
                <button 
                  onClick={() => setViewingRoute(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-50 opacity-100 hover:opacity-100 transition-opacity"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-8 space-y-6 overflow-y-auto flex-1 text-xs">
                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl text-xs font-bold uppercase tracking-wide border border-slate-100">
                  <div>
                    <span className="text-[9px] text-slate-400 font-black block">Operador Responsável</span>
                    <span className="text-slate-800 font-bold">{viewingRoute.operatorName}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 font-black block">Data e Horário</span>
                    <span className="text-slate-800 font-bold">
                      {safeToDate(viewingRoute.createdAt)?.toLocaleString('pt-BR') || 'Aguardando sync'}
                    </span>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Equipamentos Analisados</h4>
                  <div className="space-y-3">
                    {viewingRoute.responses.map((resp, idx) => (
                      <div key={idx} className="p-4 bg-slate-50/50 border border-slate-100 rounded-2xl text-xs">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-black text-slate-800 leading-tight uppercase block">{resp.equipmentName}</span>
                              {resp.equipmentTag && (
                                <span className="text-[9px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded leading-none uppercase">TAG: {resp.equipmentTag}</span>
                              )}
                            </div>
                            
                            {/* Value dynamic details */}
                            {resp.value !== undefined && resp.value !== '' && (
                              <p className="font-extrabold text-[11px] text-blue-600 uppercase mt-1">
                                Valor Operacional: <strong className="font-mono text-xs text-slate-800 bg-white border border-slate-200 rounded px-1.5 py-0.5 whitespace-nowrap font-black">{String(resp.value)}</strong>
                              </p>
                            )}

                            {resp.notes && <p className="text-[11px] text-slate-500 font-medium leading-normal mt-1 italic">Obs: {resp.notes}</p>}
                          </div>

                          <span className={cn(
                            "px-3 py-1 font-black text-[10px] uppercase tracking-wider rounded-lg border shrink-0",
                            resp.status === 'ok' ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-rose-50 text-rose-600 border-rose-100"
                          )}>
                            {resp.status === 'ok' ? 'Conforme' : 'Instável'}
                          </span>
                        </div>

                        {/* Image/Video preview in detail modal */}
                        {(resp.photoUrl || resp.videoUrl) && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-200/50">
                            <div>
                              <span className="text-[9px] text-slate-400 font-black block mb-2 uppercase tracking-wide">
                                Evidência anexada ({resp.photoUrl ? 'Foto' : 'Vídeo'})
                              </span>
                              {resp.photoUrl && (
                                <img src={resp.photoUrl} alt="Vistoria" className="w-full h-32 object-cover rounded-xl shadow-xs" />
                              )}
                              {resp.videoUrl && (
                                <video src={resp.videoUrl} controls playsInline className="w-full h-32 object-cover bg-black rounded-xl shadow-xs" />
                              )}
                            </div>
                            
                            {/* If safety observation generating was linked */}
                            {resp.observationGenerated && (
                              <div className="bg-rose-50/30 border border-rose-100/50 p-3 rounded-xl flex flex-col justify-between">
                                <div>
                                  <span className="text-[9px] text-rose-500 font-black uppercase tracking-wider block">Observação de Segurança Gerada</span>
                                  <p className="text-slate-600 text-[11px] font-medium leading-relaxed mt-2">{resp.observationText}</p>
                                </div>
                                <span className="text-[9px] text-rose-400 font-bold italic mt-2 uppercase">Integrado com Segurança do Trabalho</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL CREATING / EDITING ROUTE MODEL/TEMPLATE */}
      <AnimatePresence>
        {isTemplateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50"
              onClick={() => setIsTemplateModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] border border-slate-200 w-full max-w-3xl overflow-hidden relative shadow-2xl z-10 max-h-[90vh] flex flex-col pt-6 font-semibold"
            >
              {/* Header */}
              <div className="px-8 pb-4 border-b border-slate-100 flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-black text-slate-900">
                    {editingTemplate ? 'Editar Modelo de Rota' : 'Novo Modelo de Rota'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5 font-medium">Configure as frequências, alvos, equipamentos e campos de coletas da rota.</p>
                </div>
                <button 
                  onClick={() => setIsTemplateModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-50 opacity-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body content */}
              <div className="p-8 space-y-6 overflow-y-auto flex-1 text-xs">
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Name field */}
                  <div className="space-y-2">
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Nome do Modelo de Rota</label>
                    <input
                      type="text"
                      placeholder="Ex: Rota de Linha A - Inspeção Semanal"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      className="w-full text-xs px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold placeholder:text-slate-400"
                    />
                  </div>

                  {/* Applicability selector */}
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1 block">Aplicável em (Setor ou Linha)</label>
                    <select
                      value={templateSectorId}
                      onChange={(e) => setTemplateSectorId(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold"
                    >
                      <option value="all">Fábrica Completa</option>
                      <optgroup label="Setores Operacionais (Grupos)">
                        {sectors.map(sec => (
                          <option key={sec.id} value={sec.id}>{sec.name}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Linhas Individuais">
                        {lines.map(line => (
                          <option key={line.id} value={line.id}>{line.name}</option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Frequency field */}
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1 block">Frequência de Ronda</label>
                    <select
                      value={templateFrequency}
                      onChange={(e) => setTemplateFrequency(e.target.value as any)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-700"
                    >
                      <option value="shift">Uma vez no turno (de acordo com a escala)</option>
                      <option value="weekly">Uma vez na semana</option>
                      <option value="custom">Período customizável</option>
                    </select>
                  </div>

                  {/* Period field if custom */}
                  {templateFrequency === 'custom' && (
                    <div className="space-y-2 animate-fade-in">
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Especificar Período Customizado</label>
                      <input
                        type="text"
                        placeholder="Ex: A cada 15 dias, mensalmente, etc..."
                        value={templateCustomPeriod}
                        onChange={(e) => setTemplateCustomPeriod(e.target.value)}
                        className="w-full text-xs px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none font-bold"
                      />
                    </div>
                  )}
                </div>

                {/* Agendamento de Turnos */}
                <div className="bg-slate-50/50 border border-slate-200/60 p-5 rounded-2xl space-y-3">
                  <div>
                    <label className="text-xs font-black text-slate-800 uppercase tracking-wider block">Agendamento & Restrição de Execução por Turno</label>
                    <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Determine em quais turnos esta rota de vistoria poderá ser realizada. Deixe desmarcado para livre visualização.</p>
                  </div>
                  <div className="flex flex-wrap gap-4 pt-1">
                    {['Turno 1', 'Turno 2', 'Turno 3'].map((sht) => {
                      const hourRange = sht === 'Turno 1' ? '00:00 - 08:00' : sht === 'Turno 2' ? '08:00 - 16:00' : '16:00 - 24:00';
                      const isSelected = templateAllowedShifts.includes(sht);
                      return (
                        <button
                          key={sht}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setTemplateAllowedShifts(prev => prev.filter(s => s !== sht));
                            } else {
                              setTemplateAllowedShifts(prev => [...prev, sht]);
                            }
                          }}
                          className={cn(
                            "flex-1 min-w-[140px] px-4 py-3 border rounded-xl flex flex-col items-center justify-center text-center transition-all",
                            isSelected
                              ? "bg-emerald-50 text-emerald-800 border-emerald-500 ring-2 ring-emerald-500/20"
                              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                          )}
                        >
                          <span className="text-[11px] font-black uppercase tracking-wide">{sht}</span>
                          <span className="text-[9px] text-slate-400 font-semibold mt-0.5">{hourRange}</span>
                        </button>
                      );
                    })}
                  </div>
                  {templateAllowedShifts.length > 0 && (
                    <p className="text-[9px] text-emerald-700 font-black uppercase tracking-wider flex items-center gap-1 mt-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                      Visível somente no: {templateAllowedShifts.join(', ')}
                    </p>
                  )}
                  {templateAllowedShifts.length === 0 && (
                    <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider flex items-center gap-1 mt-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                      Livre: Visível e executável em todos os turnos
                    </p>
                  )}
                </div>

                 {/* EQUIPMENTS TABLE SETUP */}
                <div className="space-y-4 pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                    <h4 className="text-xs font-black text-slate-950 uppercase tracking-widest ml-1">Equipamentos associados ({templateEquipments.length})</h4>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setCsvText('');
                          setCsvParseResults([]);
                          setIsCsvImportModalOpen(true);
                        }}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg flex items-center gap-1.5 leading-none uppercase tracking-wider text-[10px] transition-colors shadow-sm"
                        title="Importar Equipamentos via arquivo CSV"
                      >
                        <Upload className="w-3.5 h-3.5" /> Importar CSV
                      </button>
                      <button
                        type="button"
                        onClick={handleAddEquipmentField}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg flex items-center gap-1 leading-none uppercase tracking-wider text-[10px] transition-colors"
                      >
                        <Plus className="w-3 h-3" /> Adicionar Equipamento
                      </button>
                    </div>
                  </div>

                  <div className="space-y-6 max-h-[400px] overflow-y-auto pr-2">
                    {templateEquipments.map((eq, idx) => (
                      <div 
                        key={eq.id} 
                        draggable
                        onDragStart={(e) => {
                          setDraggedEquipmentIndex(idx);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragOverEquipmentIndex(idx);
                        }}
                        onDragEnd={() => {
                          setDraggedEquipmentIndex(null);
                          setDragOverEquipmentIndex(null);
                        }}
                        onDrop={() => handleDropEquipment(idx)}
                        className={cn(
                          "p-5 bg-slate-50 border rounded-3xl relative space-y-4 transition-all duration-200",
                          draggedEquipmentIndex === idx ? "opacity-30 bg-slate-100" : "",
                          dragOverEquipmentIndex === idx ? "border-dashed border-emerald-400 scale-[0.98] bg-emerald-50/20" : "border-slate-200"
                        )}
                      >
                        <div className="flex items-center justify-between border-b border-slate-200/55 pb-2">
                          <div className="flex items-center gap-1.5 select-none">
                            <div className="cursor-grab text-slate-400 hover:text-slate-600 active:cursor-grabbing p-1">
                              <GripVertical className="w-4 h-4" />
                            </div>
                            <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest font-extrabold">
                              Equipamento #{idx + 1}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => moveEquipmentUp(idx)}
                              disabled={idx === 0}
                              className={cn(
                                "p-1 rounded hover:bg-slate-200 text-slate-500 transition-colors cursor-pointer",
                                idx === 0 && "opacity-30 cursor-not-allowed"
                              )}
                              title="Mover para Cima"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveEquipmentDown(idx)}
                              disabled={idx === templateEquipments.length - 1}
                              className={cn(
                                "p-1 rounded hover:bg-slate-200 text-slate-500 transition-colors cursor-pointer",
                                idx === templateEquipments.length - 1 && "opacity-30 cursor-not-allowed"
                              )}
                              title="Mover para Baixo"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveEquipmentField(eq.id)}
                              className="p-1 rounded hover:bg-rose-50 text-slate-350 hover:text-rose-500 transition-colors ml-1 cursor-pointer"
                              title="Excluir Equipamento"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Row 1: Equipment Name, tag, specs */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Nome do equipamento</label>
                            <input
                              type="text"
                              placeholder="Ex: Ponte Rolante Principal"
                              value={eq.name}
                              onChange={(e) => handleUpdateEquipmentField(eq.id, 'name', e.target.value)}
                              className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-emerald-500 font-bold"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Tag Patrimônio</label>
                              <input
                                type="text"
                                placeholder="TAG-101"
                                value={eq.tag}
                                onChange={(e) => handleUpdateEquipmentField(eq.id, 'tag', e.target.value)}
                                className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-emerald-500 font-bold uppercase"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Esp. de Inspeção</label>
                              <input
                                type="text"
                                placeholder="Verificar ganchos..."
                                value={eq.description}
                                onChange={(e) => handleUpdateEquipmentField(eq.id, 'description', e.target.value)}
                                className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Row 2: Sector and production lines for this equipment */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Setor de locação</label>
                            <select
                              value={eq.sectorId || ''}
                              onChange={(e) => handleUpdateEquipmentField(eq.id, 'sectorId', e.target.value)}
                              className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none font-bold"
                            >
                              <option value="">Não especificado</option>
                              {sectors.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                          </div>
                          
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Linha de locação</label>
                            <select
                              value={eq.lineId || ''}
                              onChange={(e) => handleUpdateEquipmentField(eq.id, 'lineId', e.target.value)}
                              className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none font-bold"
                            >
                              <option value="">Não especificado</option>
                              {lines.map(l => (
                                <option key={l.id} value={l.id}>{l.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Row 3: Customizable Type selector */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-3 border-slate-200/60">
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Tipo de dados coletado em campo</label>
                            <select
                              value={eq.type || 'condition'}
                              onChange={(e) => handleUpdateEquipmentField(eq.id, 'type', e.target.value)}
                              className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none font-bold text-slate-700"
                            >
                              <option value="condition">Opções (OK/NOK, SIM/NÃO, Customizado...)</option>
                              <option value="number">Numérico (Medições analógicas)</option>
                              <option value="range">Range (Baixo / Normal / Alto)</option>
                              <option value="barcode">Código ou QR de Equipamento</option>
                            </select>
                          </div>

                          <div className="space-y-1 my-auto pt-4 flex items-center">
                            <label className="flex items-center gap-1.5 cursor-pointer selection-none">
                              <input
                                type="checkbox"
                                checked={!!eq.required}
                                onChange={(e) => handleUpdateEquipmentField(eq.id, 'required', e.target.checked)}
                                className="w-3.5 h-3.5 text-emerald-600 bg-white border-slate-300 rounded"
                              />
                              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Obrigatoriedade</span>
                            </label>
                          </div>
                        </div>

                        {/* Row 4: Conditional Fields based on custom types */}
                        <div className="pl-4 border-l-2 border-slate-300 space-y-3">
                          {eq.type === 'condition' && (
                            <div className="max-w-md space-y-1">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Conjunto de opções customizadas</label>
                              <select
                                value={eq.conditionOptionsId || ''}
                                onChange={(e) => handleUpdateEquipmentField(eq.id, 'conditionOptionsId', e.target.value)}
                                className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none font-bold text-slate-700"
                              >
                                <option value="">Padrão (OK / NÃO OK)</option>
                                {optionSets.map(set => (
                                  <option key={set.id} value={set.id}>{set.name}</option>
                                ))}
                              </select>
                            </div>
                          )}

                          {eq.type === 'number' && (
                            <div className="space-y-3">
                              <div className="flex items-center gap-6">
                                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={!!eq.isInteger}
                                    onChange={(e) => handleUpdateEquipmentField(eq.id, 'isInteger', e.target.checked)}
                                    className="w-3.5 h-3.5 text-emerald-600 bg-white border-slate-300 rounded"
                                  />
                                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Número Inteiro</span>
                                </label>

                                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={!!eq.isRangeDropdown}
                                    onChange={(e) => handleUpdateEquipmentField(eq.id, 'isRangeDropdown', e.target.checked)}
                                    className="w-3.5 h-3.5 text-emerald-600 bg-white border-slate-300 rounded"
                                  />
                                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Usar Dropdown de Escala</span>
                                </label>
                              </div>

                              <div className="grid grid-cols-3 gap-2 max-w-sm">
                                <div className="space-y-1">
                                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">Valor Mínimo</label>
                                  <input
                                    type="number"
                                    step="any"
                                    placeholder="0"
                                    value={eq.min ?? ''}
                                    onChange={(e) => handleUpdateEquipmentField(eq.id, 'min', e.target.value)}
                                    className="w-full text-xs px-3 py-1.5 bg-white border border-slate-200 rounded-lg outline-none"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">Valor Máximo</label>
                                  <input
                                    type="number"
                                    step="any"
                                    placeholder="100"
                                    value={eq.max ?? ''}
                                    onChange={(e) => handleUpdateEquipmentField(eq.id, 'max', e.target.value)}
                                    className="w-full text-xs px-3 py-1.5 bg-white border border-slate-200 rounded-lg outline-none"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">Intervalo (Passo)</label>
                                  <input
                                    type="number"
                                    step="any"
                                    placeholder="1"
                                    value={eq.step ?? ''}
                                    onChange={(e) => handleUpdateEquipmentField(eq.id, 'step', e.target.value)}
                                    className="w-full text-xs px-3 py-1.5 bg-white border border-slate-200 rounded-lg outline-none"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-8 py-6 bg-slate-50 border-t border-slate-100 flex gap-4 justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => setIsTemplateModalOpen(false)}
                  className="px-6 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  className="px-8 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs uppercase shadow-md shadow-emerald-150"
                >
                  Salvar Rota
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL IMPORTAÇÃO DE EQUIPAMENTOS EM MASSA VIA CSV */}
      <AnimatePresence>
        {isCsvImportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
              onClick={() => setIsCsvImportModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2rem] border border-slate-200 w-full max-w-5xl overflow-hidden relative shadow-2xl z-10 max-h-[92vh] flex flex-col pt-6 font-semibold"
            >
              {/* Header */}
              <div className="px-8 pb-4 border-b border-slate-100 flex items-start justify-between shrink-0">
                <div>
                  <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                    <Upload className="w-5 h-5 text-emerald-600" /> Carregar Equipamentos em Massa
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5 font-medium">Importe de forma autônoma dezenas de equipamentos com mapeamento automático de colunas, setores e linhas.</p>
                </div>
                <button 
                  onClick={() => setIsCsvImportModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-8 overflow-y-auto flex-1 space-y-6">
                
                {/* Info & Instructions */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  {/* Instruzões de Formatação */}
                  <div className="lg:col-span-1 bg-slate-50 p-5 rounded-2xl border border-slate-200/50 space-y-4">
                    <div className="flex flex-col gap-2.5 border-b pb-2.5 border-slate-200">
                      <h4 className="text-xs font-black text-slate-850 uppercase tracking-wider flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-slate-500" /> Instruções de Importação
                      </h4>
                      <button
                        type="button"
                        onClick={handleDownloadCsvTemplate}
                        className="w-full mt-1.5 px-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                        title="Baixar arquivo modelo .csv pré-configurado"
                      >
                        <Download className="w-3.5 h-3.5" /> Baixar Modelo CSV
                      </button>
                    </div>
                    
                    <div className="space-y-3 text-[11px] leading-relaxed font-medium text-slate-600">
                      <div>
                        <span className="font-extrabold text-slate-900 block font-sans">nome <span className="text-rose-500">*obrigatório</span></span>
                        <p className="text-slate-500">Ex: Compressor de Ar Principal</p>
                      </div>
                      <div>
                        <span className="font-extrabold text-slate-900 block">tag</span>
                        <p className="text-slate-500">Identificação interna. Ex: COMP-112</p>
                      </div>
                      <div>
                        <span className="font-extrabold text-slate-900 block">descricao</span>
                        <p className="text-slate-500">Ex: Medir pressão e ruídos</p>
                      </div>
                      <div>
                        <span className="font-extrabold text-slate-900 block">setor</span>
                        <p className="text-slate-500">Nome ou ID do setor para vinculação automática.</p>
                      </div>
                      <div>
                        <span className="font-extrabold text-slate-900 block">linha</span>
                        <p className="text-slate-500">Nome ou ID da linha de produção.</p>
                      </div>
                      <div>
                        <span className="font-extrabold text-slate-900 block">tipo</span>
                        <p className="text-slate-500">opções, numérico, range, barcode</p>
                      </div>
                      <div>
                        <span className="font-extrabold text-slate-900 block">obrigatorio</span>
                        <p className="text-slate-500">sim / não (padrão: sim)</p>
                      </div>
                    </div>
                  </div>

                  {/* Upload Area & Pasting Area */}
                  <div className="lg:col-span-2 space-y-4">
                    <div className="flex gap-2 border-b pb-2 border-slate-100">
                      <span className="text-xs font-black text-slate-850 uppercase tracking-wider">Selecione o método de entrada</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Drag and Drop File zone */}
                      <div 
                        onDragOver={(e) => { e.preventDefault(); setCsvDragOver(true); }}
                        onDragLeave={() => setCsvDragOver(false)}
                        onDrop={handleCsvDrop}
                        onClick={() => csvFileInputRef.current?.click()}
                        className={cn(
                          "border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all min-h-[160px] select-none",
                          csvDragOver 
                            ? "border-emerald-500 bg-emerald-50/50" 
                            : "border-slate-200 hover:border-slate-350 hover:bg-slate-50"
                        )}
                      >
                        <input 
                          type="file" 
                          ref={csvFileInputRef}
                          onChange={handleCsvFileSelect}
                          accept=".csv"
                          className="hidden"
                        />
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-full mb-3">
                          <Upload className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-bold text-slate-800">Arraste seu arquivo CSV</span>
                        <span className="text-[10px] text-slate-400 mt-1 font-medium">Ou clique para selecionar no computador</span>
                        <span className="text-[9px] bg-slate-100 text-slate-500 rounded px-1.5 py-0.5 mt-2 font-black">PADRÃO: VÍRGULA OU PONTO E VÍRGULA</span>
                      </div>

                      {/* Paste direct Area */}
                      <div className="space-y-1.5 flex flex-col">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Colar dados do Excel / CSV</label>
                          <button 
                            type="button"
                            onClick={() => setCsvText(
                              "nome,tag,descricao,setor,linha,tipo,obrigatorio\n" +
                              "Compressor de Ar,COMP-01,Medir pressão,Utilidades,,numérico,sim\n" +
                              "Ponte Rolante,PTR-02,Ganchos de elevação,,Linha 1,opções,não\n" +
                              "Motor Alimentador,MTR-03,Aquecimento de mancais,,,range,sim"
                            )}
                            className="text-[9px] font-black text-emerald-600 hover:text-emerald-700 uppercase tracking-wider"
                          >
                            Carregar Exemplo
                          </button>
                        </div>
                        
                        <textarea
                          placeholder="Cole aqui as linhas copiadas da sua planilha ou arquivo texto CSV.&#13;Primeira linha deve conter os cabeçalhos das colunas."
                          value={csvText}
                          onChange={(e) => setCsvText(e.target.value)}
                          className="w-full flex-1 text-xs px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-mono focus:ring-1 focus:ring-emerald-500 min-h-[130px] font-medium resize-none leading-relaxed"
                        />
                      </div>
                    </div>
                  </div>

                </div>

                {/* Live Preview Container */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-slate-500" /> Pré-visualização dos Equipamentos ({csvParseResults.length})
                    </h4>
                    {csvParseResults.length > 0 && (
                      <button 
                        type="button"
                        onClick={() => { setCsvText(''); setCsvParseResults([]); }}
                        className="text-[10px] font-black text-rose-600 hover:text-rose-700 uppercase tracking-wider flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Limpar Dados
                      </button>
                    )}
                  </div>

                  {csvParseResults.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center">
                      <Clipboard className="w-8 h-8 text-slate-350 mb-2" />
                      <span className="text-xs font-bold text-slate-600">Nenhum dado importado para exibir</span>
                      <p className="text-[10px] text-slate-400 mt-0.5 font-medium max-w-sm">Insira de forma rápida alguns dados colando no campo de texto ou arrastando um arquivo .csv no painel acima.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                            <th className="py-3 px-4">Linha</th>
                            <th className="py-3 px-4">Nome</th>
                            <th className="py-3 px-4">Tag</th>
                            <th className="py-3 px-4">Setor Mapeado</th>
                            <th className="py-3 px-4">Linha Mapeada</th>
                            <th className="py-3 px-4">Coleta</th>
                            <th className="py-3 px-4 text-center">Obrigatório</th>
                            <th className="py-3 px-4 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                          {csvParseResults.map((item, index) => {
                            const isErr = item.errors.length > 0;
                            const isWarn = item.warnings.length > 0;
                            
                            return (
                              <tr key={index} className={cn("hover:bg-slate-50/60", isErr ? "bg-rose-50/20" : "")}>
                                <td className="py-3 px-4 text-slate-400 font-bold">{index + 1}</td>
                                <td className="py-3 px-4 font-bold text-slate-850">
                                  {item.equipment.name || <span className="text-rose-500 italic">Vazio</span>}
                                  {isErr && (
                                    <span className="block text-[10px] text-rose-500 font-semibold mt-0.5">{item.errors.join(' ')}</span>
                                  )}
                                  {isWarn && (
                                    <span className="block text-[10px] text-amber-500 font-semibold mt-0.5">{item.warnings.join(' ')}</span>
                                  )}
                                </td>
                                <td className="py-3 px-4">
                                  {item.equipment.tag ? (
                                    <span className="bg-slate-100 text-slate-650 px-1.5 py-0.5 rounded text-[10px] font-extrabold">{item.equipment.tag}</span>
                                  ) : (
                                    <span className="text-slate-350 italic">-</span>
                                  )}
                                </td>
                                <td className="py-3 px-4">
                                  {item.equipment.sectorId ? (
                                    <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-lg text-[10px]">
                                      {sectors.find(s => s.id === item.equipment.sectorId)?.name}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 italic">Global</span>
                                  )}
                                </td>
                                <td className="py-3 px-4">
                                  {item.equipment.lineId ? (
                                    <span className="text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded-lg text-[10px]">
                                      {lines.find(l => l.id === item.equipment.lineId)?.name}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 italic">Geral</span>
                                  )}
                                </td>
                                <td className="py-3 px-4 font-bold text-slate-650">
                                  {item.equipment.type === 'condition' && 'Opções (OK/NOK)'}
                                  {item.equipment.type === 'number' && 'Numérico'}
                                  {item.equipment.type === 'range' && 'Range (Baixo/Normal/Alto)'}
                                  {item.equipment.type === 'barcode' && 'Barcode / QR'}
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <span className={cn(
                                    "px-1.5 py-0.5 rounded text-[10px] font-black",
                                    item.equipment.required 
                                      ? "bg-amber-50 text-amber-700" 
                                      : "bg-slate-100 text-slate-400"
                                  )}>
                                    {item.equipment.required ? 'SIM' : 'NÃO'}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-right">
                                  {isErr ? (
                                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-rose-100 text-rose-700 rounded-full font-black text-[9px] uppercase"><AlertCircle className="w-3 h-3" /> Erro</span>
                                  ) : isWarn ? (
                                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-black text-[9px] uppercase"><AlertTriangle className="w-3 h-3" /> Aviso</span>
                                  ) : (
                                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-black text-[9px] uppercase"><Check className="w-3 h-3" /> Ok</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

              </div>

              {/* Footer */}
              <div className="px-8 py-6 bg-slate-50 border-t border-slate-100 flex flex-wrap gap-4 justify-between items-center shrink-0">
                <span className="text-[10px] text-slate-450 font-bold max-w-sm">
                  {csvParseResults.length > 0 && (
                    <>
                      Carregados <strong className="text-slate-700">{csvParseResults.filter(r => r.errors.length === 0).length}</strong> válidos de <strong className="text-slate-700">{csvParseResults.length}</strong> no total. Erros serão ignorados automaticamente.
                    </>
                  )}
                </span>
                
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCsvImportModalOpen(false)}
                    className="px-6 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Voltar
                  </button>
                  {csvParseResults.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleApplyImport(false)}
                        className="px-6 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-black rounded-xl text-xs uppercase transition-colors"
                      >
                        Adicionar ao Final
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplyImport(true)}
                        className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs uppercase shadow-md shadow-emerald-150 transition-colors"
                      >
                        Substituir Lista Atual
                      </button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DELETE SUBMISSION CONFIRM */}
      <ConfirmationModal
        isOpen={!!submissionToDelete}
        onClose={() => setSubmissionToDelete(null)}
        title="Excluir Registro de Ronda?"
        message={`Deseja realmente excluir permanentemente este registro de ronda concluída por ${submissionToDelete?.operatorName}? Esta ação não poderá ser desfeita.`}
        type="warning"
        confirmText="Sim, Excluir"
        showConfirmButton={true}
        onConfirm={async () => {
          if (!submissionToDelete) return;
          try {
            await deleteDoc(doc(db, 'route_submissions', submissionToDelete.id));
            setSubmissionToDelete(null);
            setModalConfig({
              isOpen: true,
              title: 'Registro Excluído',
              message: 'O registro de ronda foi excluído do sistema permanentemente.',
              type: 'success'
            });
          } catch (err) {
            handleFirestoreError(err, OperationType.DELETE, 'route_submissions');
          }
        }}
      />

      {/* DELETE TEMPLATE CONFIRM */}
      <ConfirmationModal
        isOpen={!!routeToDelete}
        onClose={() => setRouteToDelete(null)}
        title="Excluir Modelo de Rota?"
        message={`Deseja realmente deletar permanentemente o modelo de rota "${routeToDelete?.name}"? Esta ação não afetará as rondas concluídas anteriormente que dele herdaram.`}
        type="warning"
        confirmText="Sim, Excluir"
        showConfirmButton={true}
        onConfirm={async () => {
          if (!routeToDelete) return;
          try {
            await deleteDoc(doc(db, 'route_templates', routeToDelete.id));
            setRouteToDelete(null);
            setModalConfig({
              isOpen: true,
              title: 'Modelo Excluído',
              message: 'O modelo de rota foi excluído do sistema.',
              type: 'success'
            });
          } catch (err) {
            handleFirestoreError(err, OperationType.DELETE, 'route_templates');
          }
        }}
      />

      {/* GLOBAL MODALS */}
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
    </div>
  );
};

export default OperationalRoutes;
