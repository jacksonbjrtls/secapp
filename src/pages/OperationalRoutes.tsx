import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp, 
  getDocs,
  query,
  orderBy,
  Timestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
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
  Camera, 
  Upload, 
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
  Maximize2
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
    value?: any; // Dynamic field value collected
    observationGenerated?: boolean;
    observationText?: string;
  }[];
}

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
  const [templateEquipments, setTemplateEquipments] = useState<RouteEquipmentItem[]>([]);

  // New Route Execution Form
  const [selectedTemplate, setSelectedTemplate] = useState<RouteTemplate | null>(null);
  const [routeResponses, setRouteResponses] = useState<Record<string, {
    status: 'ok' | 'not_ok';
    notes: string;
    photoUrl?: string;
    value?: any;
    generateObservation?: boolean;
    observationText?: string;
  }>>({});
  
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

  // Year & Month filter for charts
  const [filterMonth, setFilterMonth] = useState<number>(new Date().getMonth());
  const [filterYear, setFilterYear] = useState<number>(new Date().getFullYear());

  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  // Subscribe to Route Templates
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
          photoUrl: resp.photoUrl
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
          photoUrl: resp.photoUrl
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

  // Image upload base64 parser
  const handleFileChange = (equipmentId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setRouteResponses(prev => ({
          ...prev,
          [equipmentId]: {
            ...prev[equipmentId],
            photoUrl: reader.result as string
          }
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Initialize Route Execution responses
  const handleStartRoute = (tmpl: RouteTemplate) => {
    setSelectedTemplate(tmpl);
    const initialResponses: Record<string, any> = {};
    tmpl.equipments.forEach(eq => {
      initialResponses[eq.id] = {
        status: 'ok',
        notes: '',
        value: eq.type === 'range' ? 'normal' : '',
        generateObservation: false,
        observationText: ''
      };
    });
    setRouteResponses(initialResponses);
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
            return {
              equipmentId: eq.id,
              equipmentName: eq.name,
              equipmentTag: eq.tag || '',
              status: resp.status,
              notes: resp.notes || '',
              photoUrl: resp.photoUrl || '',
              value: resp.value !== undefined ? resp.value : '',
              observationGenerated: !!resp.generateObservation,
              observationText: resp.generateObservation ? resp.observationText : ''
            };
          });

          // 1. Save Submissions
          await addDoc(collection(db, 'route_submissions'), {
            templateId: selectedTemplate.id,
            templateName: selectedTemplate.name,
            operatorName: profile?.displayName || user.email || 'Operador',
            operatorId: user.uid,
            responses: finalResponses,
            createdAt: serverTimestamp()
          });

          // 2. Loop through and create Safety Observations in firestore if requested
          for (const resp of finalResponses) {
            if (resp.status === 'not_ok' && resp.observationGenerated && resp.observationText) {
              await addDoc(collection(db, 'safety_observations'), {
                equipmentId: resp.equipmentId,
                equipmentName: resp.equipmentName,
                routeTemplateId: selectedTemplate.id,
                routeName: selectedTemplate.name,
                reportedBy: profile?.displayName || user.email || 'Operador',
                reportedById: user.uid,
                description: resp.observationText,
                photoUrl: resp.photoUrl || '',
                status: 'pending', // pending, working, resolved
                createdAt: serverTimestamp()
              });
            }
          }

          setSelectedTemplate(null);
          setRouteResponses({});
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
              {templates.filter(t => t.active).map(tmpl => {
                const sectorObj = sectors.find(s => s.id === tmpl.sectorId);
                const lineObj = lines.find(l => l.id === tmpl.sectorId);
                const scopeLabel = tmpl.sectorId === 'all' 
                  ? 'Geral / Fábrica' 
                  : (sectorObj?.name || lineObj?.name || 'Setor de Máquinas');
                
                const showPeriod = tmpl.frequency === 'custom' && tmpl.customFrequencyPeriod;

                return (
                  <div key={tmpl.id} className="bg-white border border-slate-200 p-8 rounded-[2rem] shadow-xs flex flex-col justify-between hover:border-emerald-500 transition-all group">
                    <div className="space-y-4">
                      <div className="w-11 h-11 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
                        <Wrench className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-black text-lg text-slate-900 tracking-tight leading-tight group-hover:text-emerald-600 transition-colors uppercase">{tmpl.name}</h3>
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
                      </div>
                    </div>

                    <button
                      onClick={() => handleStartRoute(tmpl)}
                      className="w-full mt-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
                    >
                      Iniciar Ronda <Clipboard className="w-4 h-4" />
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
          className="bg-white p-8 md:p-10 rounded-[2.5rem] border border-slate-200 max-w-4xl mx-auto shadow-sm"
        >
          {/* Active checklist execution page */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-6 mb-8">
            <div className="space-y-1">
              <span className="px-3 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-black tracking-widest uppercase rounded-full border border-emerald-100">Registro de Ronda</span>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight mt-1">{selectedTemplate.name}</h2>
            </div>
            <button 
              onClick={() => {
                setSelectedTemplate(null);
                setRouteResponses({});
                setActiveTab('my_routes');
              }}
              className="p-3 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-2xl transition-all"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="space-y-8">
            {selectedTemplate.equipments.map((eq, index) => {
              const resp = routeResponses[eq.id] || { status: 'ok', notes: '', value: '', generateObservation: false, observationText: '' };
              const lastInsp = getEquipmentLastInspection(eq.name, eq.tag);
              const lastInspDate = lastInsp ? safeToDate(lastInsp.createdAt) : null;

              // Render logic for custom value parameters
              return (
                <div key={eq.id} className="p-6 bg-slate-50/50 border border-slate-100 rounded-[2rem] hover:bg-slate-50/80 transition-all space-y-4">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="space-y-1 my-auto">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg">Equipamento {index + 1}</span>
                        <h3 className="font-black text-slate-800 text-base">{eq.name}</h3>
                        {eq.tag && (
                          <span className="text-[10px] font-black uppercase text-slate-500 bg-slate-100 px-2 py-0.5 rounded flex items-center gap-1">
                            <Tag className="w-3 h-3 text-slate-400" /> {eq.tag}
                          </span>
                        )}
                        {eq.required && <span className="text-rose-500 font-bold text-xs">*</span>}
                      </div>
                      
                      {/* Equipment Location / Lines Details */}
                      <div className="flex items-center gap-4 text-[10px] font-extrabold text-blue-600 uppercase tracking-wider pl-1">
                        {eq.sectorId && (
                          <span>Setor: {sectors.find(s => s.id === eq.sectorId)?.name || eq.sectorId}</span>
                        )}
                        {eq.lineId && (
                          <span>Linha: {lines.find(l => l.id === eq.lineId)?.name || eq.lineId}</span>
                        )}
                      </div>

                      {eq.description && (
                        <p className="text-xs text-slate-400 font-medium ml-1 leading-normal max-w-xl">{eq.description}</p>
                      )}
                    </div>

                    {/* Conforme / Falha buttons */}
                    <div className="flex gap-2 min-w-[200px] md:self-center shrink-0">
                      <button
                        type="button"
                        onClick={() => setRouteResponses(prev => ({
                          ...prev,
                          [eq.id]: { ...prev[eq.id], status: 'ok' }
                        }))}
                        className={cn(
                          "flex-1 py-3 text-xs uppercase tracking-wider font-black rounded-xl border transition-all active:scale-95",
                          resp.status === 'ok' 
                            ? "bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-50" 
                            : "bg-white border-slate-200 text-slate-400 hover:border-emerald-200"
                        )}
                      >
                        Conforme
                      </button>
                      <button
                        type="button"
                        onClick={() => setRouteResponses(prev => ({
                          ...prev,
                          [eq.id]: { ...prev[eq.id], status: 'not_ok' }
                        }))}
                        className={cn(
                          "flex-1 py-3 text-xs uppercase tracking-wider font-black rounded-xl border transition-all active:scale-95",
                          resp.status === 'not_ok' 
                            ? "bg-rose-600 border-rose-600 text-white shadow-md shadow-rose-50" 
                            : "bg-white border-slate-200 text-slate-400 hover:border-rose-200"
                        )}
                      >
                        Instável
                      </button>
                    </div>
                  </div>

                  {/* ACTIVE PREVIOUS WARNING AND TIMELINE INTEGRATION */}
                  {lastInsp && (
                    <div className={cn(
                      "p-4 rounded-2xl border text-xs leading-relaxed transition-all",
                      lastInsp.status === 'not_ok' 
                        ? "bg-rose-50/40 border-rose-100 text-rose-950" 
                        : "bg-slate-100/60 border-slate-200/50 text-slate-700"
                    )}>
                      <div className="flex items-center justify-between gap-2 border-b pb-2 mb-2 border-slate-200/50 flex-wrap">
                        <div className="flex items-center gap-1 text-slate-600 font-extrabold uppercase tracking-wider text-[10px]">
                          {lastInsp.status === 'not_ok' ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-500 animate-bounce" />
                          ) : (
                            <History className="w-3.5 h-3.5 text-slate-400" />
                          )}
                          Inspeção Anterior ({lastInspDate ? lastInspDate.toLocaleDateString('pt-BR') : 'Sem data'})
                        </div>
                        
                        <button
                          type="button"
                          onClick={() => setHistoryEquipment({ name: eq.name, tag: eq.tag })}
                          className="text-[10px] font-black text-blue-600 hover:text-blue-800 hover:underline uppercase flex items-center gap-1 shrink-0"
                        >
                          <History className="w-3 h-3" /> Ver Histórico Completo
                        </button>
                      </div>

                      <p className="text-[11px] font-medium">
                        Realizada por <strong className="font-bold">{lastInsp.operatorName}</strong>. 
                        Status: <strong className={cn("font-bold px-1 py-0.5 rounded text-[9px] uppercase", lastInsp.status === 'ok' ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800")}>{lastInsp.status === 'ok' ? 'Conforme' : 'Instável'}</strong>
                        {lastInsp.value !== undefined && lastInsp.value !== '' && (
                          <span> • Vistoriado: <strong className="font-bold text-slate-800 bg-white border px-1.5 py-0.5 rounded">{String(lastInsp.value)}</strong></span>
                        )}
                      </p>
                      {lastInsp.notes && (
                        <p className="mt-1 pb-1 text-slate-500 text-[11px] font-medium italic">" Obs: {lastInsp.notes} "</p>
                      )}
                    </div>
                  )}

                  {/* CUSTOMIZABLE PARAMETERS FIELD COLLECTOR GROUP */}
                  <div className="p-5 bg-white border border-slate-100 rounded-2xl space-y-3">
                    <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 font-semibold block">Parâmetro de Coleta em Campo:</span>
                    
                    {/* CONDITION TYPE CONFIG OR FALLBACKS */}
                    {eq.type === 'condition' && (
                      <div className="flex flex-wrap gap-2">
                        {(optionSets.find(o => o.id === eq.conditionOptionsId)?.options || ['OK', 'NÃO OK']).map((option, inlineIdx) => {
                          const isSelected = resp.value === option;
                          return (
                            <button
                              key={`${option}-${inlineIdx}`}
                              type="button"
                              onClick={() => {
                                setRouteResponses(prev => {
                                  // Auto set status 'not_ok' if option contains failure hints
                                  const labelLower = option.toLowerCase();
                                  const autoStatus = (labelLower === 'not ok' || labelLower === 'nok' || labelLower.includes('não') || labelLower.includes('falha') || labelLower.includes('instável'))
                                    ? 'not_ok'
                                    : prev[eq.id]?.status || 'ok';

                                  return {
                                    ...prev,
                                    [eq.id]: {
                                      ...prev[eq.id],
                                      value: option,
                                      status: autoStatus
                                    }
                                  };
                                });
                              }}
                              className={cn(
                                "px-4 py-2.5 rounded-xl text-xs font-bold transition-all border",
                                isSelected 
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-500 ring-1 ring-emerald-500" 
                                  : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                              )}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* NUMBER COGNITIVE LAYOUTS */}
                    {eq.type === 'number' && (
                      <div className="max-w-md">
                        {eq.isRangeDropdown ? (
                          <div className="space-y-1">
                            <select
                              value={resp.value || ''}
                              onChange={(e) => setRouteResponses(prev => ({
                                ...prev,
                                [eq.id]: { ...prev[eq.id], value: e.target.value }
                              }))}
                              className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-slate-700"
                            >
                              <option value="">Selecione um valor de medição...</option>
                              {(() => {
                                const minV = eq.min ?? 0;
                                const maxV = eq.max ?? 10;
                                const stepV = eq.step ?? 1;
                                const list: number[] = [];
                                for (let v = minV; v <= maxV; v = Number((v + stepV).toFixed(4))) {
                                  list.push(v);
                                }
                                return list.map(v => (
                                  <option key={v} value={v}>{v}</option>
                                ));
                              })()}
                            </select>
                            <span className="text-[10px] text-slate-400 font-semibold pl-1">Range de escala: de {eq.min} até {eq.max} (Passo de {eq.step})</span>
                          </div>
                        ) : (
                          <input
                            type="number"
                            step={eq.isInteger ? "1" : "any"}
                            placeholder={`Digite o valor operacional medido (mín: ${eq.min ?? '0'} / máx: ${eq.max ?? '10'})...`}
                            value={resp.value || ''}
                            onChange={(e) => setRouteResponses(prev => ({
                              ...prev,
                              [eq.id]: { ...prev[eq.id], value: e.target.value }
                            }))}
                            className="w-full text-xs px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                          />
                        )}
                      </div>
                    )}

                    {/* RANGE BAJO/NORMAL/ALTO BUTTONS */}
                    {eq.type === 'range' && (
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => setRouteResponses(prev => ({
                            ...prev,
                            [eq.id]: { ...prev[eq.id], value: 'low' }
                          }))}
                          className={cn(
                            "flex-1 py-3 text-[11px] font-black uppercase rounded-xl border-2 transition-all max-w-[150px]",
                            resp.value === 'low'
                              ? "bg-amber-600 border-amber-600 text-white"
                              : "bg-white border-slate-200 text-slate-400"
                          )}
                        >
                          BAIXO
                        </button>
                        <button
                          type="button"
                          onClick={() => setRouteResponses(prev => ({
                            ...prev,
                            [eq.id]: { ...prev[eq.id], value: 'normal' }
                          }))}
                          className={cn(
                            "flex-1 py-3 text-[11px] font-black uppercase rounded-xl border-2 transition-all max-w-[150px]",
                            resp.value === 'normal'
                              ? "bg-emerald-600 border-emerald-600 text-white"
                              : "bg-white border-slate-200 text-slate-400"
                          )}
                        >
                          NORMAL / OK
                        </button>
                        <button
                          type="button"
                          onClick={() => setRouteResponses(prev => ({
                            ...prev,
                            [eq.id]: { ...prev[eq.id], value: 'high' }
                          }))}
                          className={cn(
                            "flex-1 py-3 text-[11px] font-black uppercase rounded-xl border-2 transition-all max-w-[150px]",
                            resp.value === 'high'
                              ? "bg-rose-600 border-rose-600 text-white"
                              : "bg-white border-slate-200 text-slate-400"
                          )}
                        >
                          ALTO
                        </button>
                      </div>
                    )}

                    {/* BARCODE VALUE AND QR SCAN OR TEXT Typing */}
                    {eq.type === 'barcode' && (
                      <div className="space-y-3">
                        <div className="relative group max-w-md">
                          <QrCode className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 w-5 h-5 transition-colors" />
                          <input
                            type="text"
                            placeholder="Aponte o leitor ou digite o código do dispositivo..."
                            value={resp.value || ''}
                            onChange={(e) => setRouteResponses(prev => ({
                              ...prev,
                              [eq.id]: { ...prev[eq.id], value: e.target.value }
                            }))}
                            className="w-full pl-12 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setActiveScanner(eq.id);
                            }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 p-1.5 rounded-lg"
                          >
                            <QrCode className="w-4.5 h-4.5" />
                          </button>
                        </div>

                        {activeScanner === eq.id && (
                          <div className="relative bg-black rounded-2xl overflow-hidden aspect-video border border-slate-800 max-w-md">
                            {cameraError ? (
                              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-white bg-slate-900 border border-slate-700 rounded-2xl">
                                <AlertCircle className="w-10 h-10 text-rose-500 mb-3" />
                                <p className="text-xs font-bold leading-normal mb-4">{cameraError}</p>
                                <button
                                  onClick={() => setActiveScanner(null)}
                                  className="px-4 py-2 bg-white text-slate-900 rounded-xl font-bold text-[10px] hover:bg-slate-100 uppercase"
                                >
                                  Fechar Câmera
                                </button>
                              </div>
                            ) : (
                              <>
                                <div id="qr-reader-route" className="w-full h-full" />
                                <button 
                                  onClick={() => setActiveScanner(null)}
                                  className="absolute top-3 right-3 bg-black/50 text-white p-1.5 rounded-full hover:bg-black/80 z-10"
                                >
                                  <X className="w-4.5 h-4.5" />
                                </button>
                                <div className="absolute inset-x-8 inset-y-12 border border-emerald-500/50 pointer-events-none rounded animate-pulse" />
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Photograph Upload & Safety Observation Context when checking fails */}
                  <AnimatePresence>
                    {resp.status === 'not_ok' && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-100/80 overflow-hidden"
                      >
                        {/* Photograph Upload container */}
                        <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col items-center justify-center min-h-[160px] text-center relative group">
                          {resp.photoUrl ? (
                            <div className="w-full h-full relative group">
                              <img src={resp.photoUrl} alt="Anomalia" className="w-full h-32 object-cover rounded-xl" />
                              <button
                                onClick={() => setRouteResponses(prev => ({
                                  ...prev,
                                  [eq.id]: {
                                    ...prev[eq.id],
                                    photoUrl: undefined
                                  }
                                }))}
                                className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-full text-white hover:bg-black/90 transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="w-10 h-10 bg-slate-50 text-slate-500 rounded-full flex items-center justify-center mx-auto border border-slate-100">
                                <Camera className="w-5 h-5" />
                              </div>
                              <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Anexar Evidência Visual</p>
                              <p className="text-[9px] text-slate-400 font-medium">Insira uma fotografia de evidência do equipamento falho</p>
                              <button
                                type="button"
                                onClick={() => fileInputRefs.current[eq.id]?.click()}
                                className="px-3 py-1.5 bg-slate-900 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg hover:bg-slate-800 transition-colors mt-2"
                              >
                                Selecionar Imagem
                              </button>
                              <input
                                type="file"
                                accept="image/*"
                                ref={el => fileInputRefs.current[eq.id] = el}
                                className="hidden"
                                onChange={(e) => handleFileChange(eq.id, e)}
                              />
                            </div>
                          )}
                        </div>

                        {/* Safety Observations Toggle */}
                        <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={!!resp.generateObservation}
                              onChange={(e) => setRouteResponses(prev => ({
                                ...prev,
                                [eq.id]: {
                                  ...prev[eq.id],
                                  generateObservation: e.target.checked
                                }
                              }))}
                              className="w-4 h-4 text-emerald-600 bg-slate-100 border-slate-300 rounded focus:ring-emerald-500 focus:ring-2"
                            />
                            <span className="text-xs font-black text-slate-700 uppercase tracking-widest">Registrar Ordem de Segurança</span>
                          </label>

                          {resp.generateObservation && (
                            <textarea
                              rows={3}
                              placeholder="Descreva as condições de instabilidade ou riscos ambientais observados..."
                              value={resp.observationText || ''}
                              onChange={(e) => setRouteResponses(prev => ({
                                ...prev,
                                [eq.id]: {
                                  ...prev[eq.id],
                                  observationText: e.target.value
                                }
                              }))}
                              className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 font-bold text-slate-600 placeholder:text-slate-400 leading-normal"
                            />
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Comment notes field */}
                  <div className="flex items-center gap-2 border-t pt-2 border-dashed border-slate-200">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider whitespace-nowrap">Comentações:</span>
                    <input
                      type="text"
                      placeholder="Espaço opcional para anotações do vistoriador..."
                      value={resp.notes}
                      onChange={(e) => setRouteResponses(prev => ({
                        ...prev,
                        [eq.id]: { ...prev[eq.id], notes: e.target.value }
                      }))}
                      className="w-full bg-transparent border-none outline-none text-xs font-semibold py-1 focus:text-slate-700 text-slate-500 placeholder:text-slate-300"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-4 justify-end mt-12 border-t border-slate-100 pt-8">
            <button
              onClick={() => {
                setSelectedTemplate(null);
                setRouteResponses({});
                setActiveTab('my_routes');
              }}
              className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-all text-xs uppercase"
            >
              Cancelar
            </button>
            <button
              onClick={handleSaveRouteSubmission}
              className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl shadow-lg shadow-emerald-100 transition-all text-xs uppercase"
            >
              Salvar e Concluir Ronda
            </button>
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

                        {/* Image preview in detail modal */}
                        {resp.photoUrl && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-200/50">
                            <div>
                              <span className="text-[9px] text-slate-400 font-black block mb-2 uppercase tracking-wide">Fotografia do local</span>
                              <img src={resp.photoUrl} alt="Vistoria" className="w-full h-32 object-cover rounded-xl shadow-xs" />
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

                {/* EQUIPMENTS TABLE SETUP */}
                <div className="space-y-4 pt-4">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h4 className="text-xs font-black text-slate-950 uppercase tracking-widest ml-1">Equipamentos associados ({templateEquipments.length})</h4>
                    <button
                      type="button"
                      onClick={handleAddEquipmentField}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg flex items-center gap-1 leading-none uppercase tracking-wider text-[10px]"
                    >
                      <Plus className="w-3 h-3" /> Adicionar Equipamento
                    </button>
                  </div>

                  <div className="space-y-6 max-h-[400px] overflow-y-auto pr-2">
                    {templateEquipments.map((eq, idx) => (
                      <div key={eq.id} className="p-5 bg-slate-50 border border-slate-200 rounded-3xl relative space-y-4">
                        <button
                          type="button"
                          onClick={() => handleRemoveEquipmentField(eq.id)}
                          className="absolute top-4 right-4 text-slate-300 hover:text-rose-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>

                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block font-extrabold">Equipamento #{idx + 1}</span>

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
