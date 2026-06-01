import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp, 
  query,
  orderBy
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { MASTER_EMAILS } from '../constants';
import { motion, AnimatePresence } from 'motion/react';
import { cn, safeToDate } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/errorHandler';
import { 
  ShieldAlert, 
  Plus, 
  Trash2, 
  Edit2, 
  CheckCircle2, 
  AlertTriangle, 
  Camera, 
  History, 
  TrendingUp, 
  User, 
  X,
  ShieldCheck,
  Calendar,
  AlertCircle,
  FileText,
  Clock,
  CheckCircle,
  Filter,
  Eye,
  Search,
  ChevronRight,
  Clipboard,
  Wrench,
  Check,
  Settings,
  UploadCloud,
  FileText as FileIcon
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { ConfirmationModal } from '../components/ui/ConfirmationModal';

// Shared interfaces for application state & Firestore persistence
export interface SafetyObservationTemplate {
  id: string;
  name: string;
  active: boolean;
  hasActivity: boolean;
  environmentChecklist: string[];
  safeBehaviors: string[];
  atRiskBehaviors: string[];
  hasFeedback: boolean;
  hasAction: boolean;
  createdAt: any;
}

export interface SafetyObservation {
  id: string;
  reportedBy: string;
  reportedById: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  status: 'pending' | 'working' | 'resolved';
  photoUrl?: string;
  fileName?: string;
  resolutionNotes?: string;
  resolvedBy?: string;
  createdAt: any;
  resolvedAt?: any;
  
  // Custom structured fields requested for Safety Checklist Form
  observerName?: string;
  observerMatricula?: string;
  observerArea?: string;
  observationLocation?: string;
  observedArea?: string;
  hadOrientation?: 'sim' | 'nao';
  isSafe?: 'seguro' | 'inseguro';
  date?: string;
  categoriesSelected?: string[];
  
  // Backward compatible template states (if used)
  templateId?: string;
  templateName?: string;
  formData?: any;
}

// Fixed plant areas for dropdowns
const AREAS_OPCOES = [
  "Produção",
  "Expedição",
  "Manutenção Mecânica",
  "Manutenção Elétrica",
  "Segurança do Trabalho",
  "Logística / Frota",
  "Almoxarifado",
  "Qualidade / Laboratórios",
  "Administrativo",
  "Engenharia de Processos",
  "Sala de Controle (COI)"
];

// Seed list of default checklist items under "O QUE OBSERVAR?"
const SEED_CATEGORIES = [
  { index: 1, name: "1. Equipamento de Elevação e Transporte (Oper. c/ Ponte Rolante, Oper. com Empilhadeira, Carga Suspensa, etc.)" },
  { index: 2, name: "2. Trabalho em Altura (Cinto de Segurança, Isolamento, Sinalização, etc.)" },
  { index: 3, name: "3. Trabalho em Espaço Confinado (Liberação de Serviço, Execução de Serviço, Vigia/ Sup. de entrada, etc.)" },
  { index: 4, name: "4. Trabalho a Quente (Liberação de Serviço, Execução de Serviço, Vigilante, etc.)" },
  { index: 5, name: "5. Ferramentas Manuais (Improvisação de Ferramentas, Aspectos/ Condições, etc.)" },
  { index: 6, name: "6. Equipamento de Proteção Individual - EPI" },
  { index: 7, name: "7. Equipamento de Proteção Coletiva - EPC" },
  { index: 8, name: "8. Ergonomia (Levantamento e Transporte Manual de Carga, Posicionamento (sentado/ em pé))" },
  { index: 9, name: "9. Adornos (Brincos, Anéis, Relógios, Correntes, Pulseiras)" },
  { index: 10, name: "10. Cartão de Bloqueio de Fonte de Energia (Preenchimento, Bloqueio Adequado, etc.)" },
  { index: 11, name: "11. Arrumação e Limpeza (Desobstrução de equipamentos de emergência, disposição de móveis etc.)" },
  { index: 12, name: "12. Trânsito (Faixa de pedestres, motoristas (cinto de segurança, luzes acesas, bicicletas, utilização de celulares, etc.)" },
  { index: 13, name: "13. Combate a Incêndio (obstrução de equipamento, cigarros, etc.)" },
  { index: 14, name: "14. Produtos Químicos (Manuseio, utilização de EPI, etc.)" },
  { index: 15, name: "15. Coleta Seletiva (descarte em local correto)" },
  { index: 16, name: "16. Desperdício de Recursos Naturais e Compostos (Água, Energia, Combustível, Insumo, etc.)" },
  { index: 17, name: "17. Isolamento e Sinalização de Área" },
  { index: 18, name: "18. Uso do corrimão, pressa e atenção ao caminhar" },
  { index: 19, name: "19. Procedimentos" }
];

const SafetyObservations: React.FC = () => {
  const { user, profile, isManager, isAdmin } = useAuth();
  
  // Navigation tabs: 'observations_list' | 'report_hazard' | 'analytics' | 'manage_templates'
  const [activeTab, setActiveTab] = useState<'observations_list' | 'report_hazard' | 'analytics' | 'manage_templates'>('observations_list');

  // Firestore Subscriptions States
  const [observations, setObservations] = useState<SafetyObservation[]>([]);
  const [safetyCategories, setSafetyCategories] = useState<{ id: string; name: string; index: number }[]>([]);
  const [plantAreas, setPlantAreas] = useState<{ id: string; name: string; index: number }[]>([]);
  const [operatorsState, setOperatorsState] = useState<{ id: string; name: string }[]>([]);
  const [dbOperators, setDbOperators] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Helper to get general chronological index for any safety observation
  const getObsNumber = (obsId: string) => {
    const sorted = [...observations].sort((a, b) => {
      const tA = safeToDate(a.createdAt)?.getTime() || Date.now();
      const tB = safeToDate(b.createdAt)?.getTime() || Date.now();
      return tA - tB;
    });
    const index = sorted.findIndex(o => o.id === obsId);
    if (index === -1) {
      let hash = 0;
      for (let i = 0; i < obsId.length; i++) {
        hash = obsId.charCodeAt(i) + ((hash << 5) - hash);
      }
      return (Math.abs(hash) % 1000) + 1;
    }
    return index + 1;
  };

  // Selector for report mode: 'checklist' is structured form, 'simple' is quick desvio
  const [reportMode, setReportMode] = useState<'simple' | 'checklist'>('checklist');

  // New Simple Hazard State
  const [newObs, setNewObs] = useState({
    description: '',
    severity: 'medium' as 'low' | 'medium' | 'high',
    photoUrl: '',
    fileName: ''
  });

  // Customized Safety Observation Form State (matching the EXACT requested fields)
  const [checklistForm, setChecklistForm] = useState({
    observerName: '',
    observerMatricula: '',
    observerArea: '',
    observationLocation: '',
    observedArea: '',
    hadOrientation: 'sim' as 'sim' | 'nao',
    isSafe: 'seguro' as 'seguro' | 'inseguro',
    date: '2026-05-22',
    whatToObserve: {} as Record<string, boolean>,
    description: '',
    photoUrl: '',
    fileName: ''
  });

  const [otherObserverName, setOtherObserverName] = useState('');
  const [obsSubmitting, setObsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // File Inputs references
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputChklRef = useRef<HTMLInputElement>(null);

  // Configuration Panel Sub-Tabs & Unified Add/Edit Dialog States
  const [configSubTab, setConfigSubTab] = useState<'categories' | 'areas' | 'operators'>('categories');
  const [configModal, setConfigModal] = useState<{
    isOpen: boolean;
    type: 'category' | 'area' | 'operator';
    id?: string;
    value: string;
  }>({
    isOpen: false,
    type: 'category',
    value: ''
  });

  // Administration of standard categories (O QUE OBSERVAR?) State (Retained for backward-compat if needed)
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<{ id: string; name: string } | null>(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);

  // Filter/Search States
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'working' | 'resolved'>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all');

  // Detail & Resolve Popups
  const [viewingObs, setViewingObs] = useState<SafetyObservation | null>(null);
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'success'
  });

  // Pre-filled quick selection operator names (Real operators configured under settings can be used)
  const defaultOperators = useMemo<string[]>(() => [], []);

  // Memoized dynamic Plant Areas mapped from Firestore settings
  const activePlantAreas = useMemo(() => {
    if (plantAreas.length > 0) {
      return plantAreas.map(a => a.name);
    }
    return [
      "Produção",
      "Expedição",
      "Manutenção Mecânica",
      "Manutenção Elétrica",
      "Segurança do Trabalho",
      "Logística / Frota",
      "Almoxarifado",
      "Qualidade / Laboratórios",
      "Administrativo",
      "Engenharia de Processos",
      "Sala de Controle (COI)"
    ];
  }, [plantAreas]);

  // Merge current users with default operators
  const combinedOperators = useMemo(() => {
    const uniqueNames = new Set<string>();
    
    dbOperators.forEach(op => {
      const trimmed = op.trim();
      if (trimmed) uniqueNames.add(trimmed);
    });

    defaultOperators.forEach(op => {
      const trimmed = op.trim();
      if (trimmed) uniqueNames.add(trimmed);
    });

    // Add current user
    const currentName = (profile?.displayName || user?.displayName || "").trim();
    if (currentName) {
      uniqueNames.add(currentName);
    }

    return Array.from(uniqueNames).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [dbOperators, defaultOperators, profile, user]);

  // Set default inspector name to current user if available
  useEffect(() => {
    const currentUserName = profile?.displayName || user?.displayName || user?.email || '';
    if (currentUserName && !checklistForm.observerName) {
      setChecklistForm(prev => ({ ...prev, observerName: currentUserName }));
    }
  }, [profile, user, checklistForm.observerName]);

  // Subscribe to Safety Observations from Firestore
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'safety_observations'), orderBy('createdAt', 'desc')),
      (snap) => {
        setObservations(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as SafetyObservation)));
        setLoading(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'safety_observations');
      }
    );
    return () => unsub();
  }, []);

  // Subscribe and Seed categories for "O QUE OBSERVAR?" in Firestore
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'safety_categories'), orderBy('index', 'asc')),
      async (snap) => {
        if (snap.empty && (isManager || isAdmin)) {
          // If Firestore is empty, seed with the 19 standard categories
          try {
            for (const cat of SEED_CATEGORIES) {
              await addDoc(collection(db, 'safety_categories'), {
                name: cat.name,
                index: cat.index,
                createdAt: serverTimestamp()
              });
            }
          } catch (e) {
            console.error("Error seeding default safety options:", e);
          }
        } else {
          setSafetyCategories(snap.docs.map(doc => ({ 
            id: doc.id, 
            name: doc.data().name, 
            index: doc.data().index || 99 
          })));
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'safety_categories');
      }
    );
    return () => unsub();
  }, [isManager, isAdmin]);

  // Subscribe and Seed plant areas in Firestore
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'safety_areas'), orderBy('index', 'asc')),
      async (snap) => {
        if (snap.empty && (isManager || isAdmin)) {
          // If Firestore is empty, seed with the default plant areas
          try {
            const SEED_AREAS = [
              "Produção",
              "Expedição",
              "Manutenção Mecânica",
              "Manutenção Elétrica",
              "Segurança do Trabalho",
              "Logística / Frota",
              "Almoxarifado",
              "Qualidade / Laboratórios",
              "Administrativo",
              "Engenharia de Processos",
              "Sala de Controle (COI)"
            ];
            for (let i = 0; i < SEED_AREAS.length; i++) {
              await addDoc(collection(db, 'safety_areas'), {
                name: SEED_AREAS[i],
                index: i + 1,
                createdAt: serverTimestamp()
              });
            }
          } catch (e) {
            console.error("Error seeding default safety areas:", e);
          }
        } else {
          setPlantAreas(snap.docs.map(doc => ({ 
            id: doc.id, 
            name: doc.data().name, 
            index: doc.data().index || 99 
          })));
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'safety_areas');
      }
    );
    return () => unsub();
  }, [isManager, isAdmin]);

  // Subscribe to registered users list as operators for autocomplete
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const uniqueUsersMap = new Map<string, { id: string; name: string }>();
 
      snap.docs.forEach(doc => {
        const u = doc.data();
        const userEmail = u.email?.toLowerCase().trim() || '';
        if (MASTER_EMAILS.includes(userEmail)) return;
        const rawName = (u.displayName || u.name || u.nome || u.email || '').trim();
        if (rawName && !uniqueUsersMap.has(rawName)) {
          uniqueUsersMap.set(rawName, {
            id: doc.id,
            name: rawName
          });
        }
      });
 
      const ops = Array.from(uniqueUsersMap.values());
 
      // Sort alphabetically
      ops.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
 
      setOperatorsState(ops);
      setDbOperators(ops.map(o => o.name));
    }, (err) => {
      console.error("Error loading registered users as operators:", err);
    });
    return () => unsub();
  }, []);

  // Unified Handler for Configuration Save (Categories, Areas, Operators)
  const handleSaveOptionSetting = async () => {
    const trimmedVal = configModal.value.trim();
    if (!trimmedVal) return;

    try {
      if (configModal.type === 'category') {
        if (configModal.id) {
          await updateDoc(doc(db, 'safety_categories', configModal.id), {
            name: trimmedVal
          });
          setModalConfig({
            isOpen: true,
            title: 'Categoria Atualizada',
            message: 'A opção de checklist foi atualizada com sucesso.',
            type: 'success'
          });
        } else {
          const nextIndex = safetyCategories.length > 0 
            ? Math.max(...safetyCategories.map(c => c.index)) + 1 
            : 1;
          await addDoc(collection(db, 'safety_categories'), {
            name: trimmedVal,
            index: nextIndex,
            createdAt: serverTimestamp()
          });
          setModalConfig({
            isOpen: true,
            title: 'Categoria Adicionada',
            message: 'A nova categoria foi inserida com sucesso no checklist.',
            type: 'success'
          });
        }
      } else if (configModal.type === 'area') {
        if (configModal.id) {
          await updateDoc(doc(db, 'safety_areas', configModal.id), {
            name: trimmedVal
          });
          setModalConfig({
            isOpen: true,
            title: 'Área Atualizada',
            message: 'A área industrial foi configurada com sucesso.',
            type: 'success'
          });
        } else {
          const nextIndex = plantAreas.length > 0
            ? Math.max(...plantAreas.map(a => a.index)) + 1
            : 1;
          await addDoc(collection(db, 'safety_areas'), {
            name: trimmedVal,
            index: nextIndex,
            createdAt: serverTimestamp()
          });
          setModalConfig({
            isOpen: true,
            title: 'Área Adicionada',
            message: 'A nova área operacional foi registrada.',
            type: 'success'
          });
        }
      } else if (configModal.type === 'operator') {
        if (configModal.id) {
          await updateDoc(doc(db, 'operators', configModal.id), {
            name: trimmedVal
          });
          setModalConfig({
            isOpen: true,
            title: 'Operador Atualizado',
            message: 'O nome do colaborador foi modificado com sucesso.',
            type: 'success'
          });
        } else {
          await addDoc(collection(db, 'operators'), {
            name: trimmedVal
          });
          setModalConfig({
            isOpen: true,
            title: 'Operador Cadastrado',
            message: 'O novo operador foi inserido na base com sucesso.',
            type: 'success'
          });
        }
      }

      setConfigModal({ isOpen: false, type: 'category', value: '' });
    } catch (e) {
      console.error("Error saving option setting:", e);
      setModalConfig({
        isOpen: true,
        title: 'Erro ao Salvar',
        message: 'Ocorreu um erro no servidor ao salvar a opção.',
        type: 'error'
      });
    }
  };

  // Unified Handler for Option Deletion
  const handleDeleteOptionSetting = async (type: 'category' | 'area' | 'operator', id: string, name: string) => {
    setModalConfig({
      isOpen: true,
      title: 'Confirmar Exclusão',
      message: `Tem certeza absoluta que deseja desativar/apagar "${name}" permanentemente?`,
      type: 'warning',
      onConfirm: async () => {
        try {
          const collectionName = type === 'category' ? 'safety_categories' : type === 'area' ? 'safety_areas' : 'operators';
          await deleteDoc(doc(db, collectionName, id));
          setModalConfig({
            isOpen: true,
            title: 'Excluído',
            message: 'O item selecionado foi desativado e removido do sistema.',
            type: 'success'
          });
        } catch (e) {
          console.error("Error deleting option setting:", e);
          setModalConfig({
            isOpen: true,
            title: 'Erro ao Excluir',
            message: 'Incapaz de remover a opção do banco de dados.',
            type: 'error'
          });
        }
      }
    });
  };

  // Handle manual browse files
  const handleFileBrowse = (event: React.ChangeEvent<HTMLInputElement>, formKey: 'simple' | 'checklist') => {
    const file = event.target.files?.[0];
    if (file) {
      processAttachedFile(file, formKey);
    }
  };

  // Drag and Drop implementation
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent, formKey: 'simple' | 'checklist') => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processAttachedFile(file, formKey);
    }
  };

  // Convert files to base64 data url for preview and persistence
  const processAttachedFile = (file: File, formKey: 'simple' | 'checklist') => {
    const reader = new FileReader();
    const name = file.name;
    reader.onloadend = () => {
      if (formKey === 'simple') {
        setNewObs(prev => ({
          ...prev,
          photoUrl: reader.result as string,
          fileName: name
        }));
      } else {
        setChecklistForm(prev => ({
          ...prev,
          photoUrl: reader.result as string,
          fileName: name
        }));
      }
    };
    reader.readAsDataURL(file);
  };

  // Submission for quick simple hazard/desvio text
  const handleSubmitSimpleObservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newObs.description.trim()) {
      setModalConfig({
        isOpen: true,
        title: 'Descrição Vazia',
        message: 'Por favor, detalhe as condições ou atos inseguros visualizados.',
        type: 'error'
      });
      return;
    }

    setObsSubmitting(true);
    try {
      await addDoc(collection(db, 'safety_observations'), {
        description: `⚠️ Desvio Rápido Registrado:\n${newObs.description}`,
        severity: newObs.severity,
        photoUrl: newObs.photoUrl || '',
        fileName: newObs.fileName || '',
        status: 'pending',
        reportedBy: profile?.displayName || user?.email || 'Operador em Campo',
        reportedById: user?.uid || '',
        createdAt: serverTimestamp()
      });

      // Clear Form
      setNewObs({
        description: '',
        severity: 'medium',
        photoUrl: '',
        fileName: ''
      });
      setActiveTab('observations_list');
      setModalConfig({
        isOpen: true,
        title: 'Desvio Rápido Reportado!',
        message: 'Agradecemos seu olhar de segurança! O desvio avulso foi registrado no sistema.',
        type: 'success'
      });
    } catch (err) {
      console.error('Error submitting simple desvio:', err);
      setModalConfig({
        isOpen: true,
        title: 'Erro de Envio',
        message: 'Não foi possível salvar o desvio de segurança no banco de dados.',
        type: 'error'
      });
    } finally {
      setObsSubmitting(false);
    }
  };

  // Submission of complete structured Brazilian Portuguese checklist
  const handleSubmitChecklistObservation = async (e: React.FormEvent) => {
    e.preventDefault();

    // Field Validations
    const activeObserverName = checklistForm.observerName ? checklistForm.observerName.trim() : '';
    if (!activeObserverName) {
      setModalConfig({
        isOpen: true,
        title: 'Campos Obrigatórios',
        message: 'Por favor, selecione ou digite o Nome do Observador.',
        type: 'error'
      });
      return;
    }

    if (!checklistForm.observerMatricula.trim()) {
      setModalConfig({
        isOpen: true,
        title: 'Campos Obrigatórios',
        message: 'Por favor, indique o Número da Matrícula do observador.',
        type: 'error'
      });
      return;
    }

    if (!checklistForm.observerArea) {
      setModalConfig({
        isOpen: true,
        title: 'Campos Obrigatórios',
        message: 'Por favor, escolha a Área do Observador.',
        type: 'error'
      });
      return;
    }

    if (!checklistForm.observationLocation.trim()) {
      setModalConfig({
        isOpen: true,
        title: 'Campos Obrigatórios',
        message: 'Por favor, descreva o Local da Observação.',
        type: 'error'
      });
      return;
    }

    if (!checklistForm.observedArea) {
      setModalConfig({
        isOpen: true,
        title: 'Campos Obrigatórios',
        message: 'Por favor, selecione a Área do Observado.',
        type: 'error'
      });
      return;
    }

    // Get checked categories from "O QUE OBSERVAR?"
    const selectedCats = Object.entries(checklistForm.whatToObserve)
      .filter(([_, checked]) => checked)
      .map(([catId]) => {
        const matchingObj = safetyCategories.find(c => c.id === catId);
        return matchingObj ? matchingObj.name : catId;
      });

    if (selectedCats.length === 0) {
      setModalConfig({
        isOpen: true,
        title: 'Seleção Obrigatória',
        message: 'Por favor, assinale pelo menos um item da checklist "O QUE OBSERVAR?".',
        type: 'error'
      });
      return;
    }

    setObsSubmitting(true);
    try {
      // Compiled descriptive markdown pattern for backward compatibility
      let compiledDesc = `**Ficha de Observação de Segurança**\n`;
      compiledDesc += `👤 Realizado por: ${activeObserverName} (Matrícula: ${checklistForm.observerMatricula})\n`;
      compiledDesc += `🏢 Áreas: Observador [${checklistForm.observerArea}] ➡️ Observado [${checklistForm.observedArea}]\n`;
      compiledDesc += `📍 Local Físico: ${checklistForm.observationLocation}\n`;
      compiledDesc += `⚙️ Classificação: ${checklistForm.isSafe === 'seguro' ? '🟢 SEGURO' : '🔴 INSEGURO'} | Orientação (feedback)? ${checklistForm.hadOrientation.toUpperCase()}\n`;
      compiledDesc += `📋 O que Observar: ${selectedCats.join(', ')}\n\n`;
      if (checklistForm.description.trim()) {
        compiledDesc += `📝 Relato / Descrição:\n${checklistForm.description}`;
      }

      const formattedDate = checklistForm.date.split('-').reverse().join('/'); // Converts yyyy-mm-dd to dd/mm/yyyy

      const insertData = {
        description: compiledDesc,
        severity: checklistForm.isSafe === 'seguro' ? 'low' : 'high',
        status: 'pending',
        reportedBy: activeObserverName,
        reportedById: user?.uid || '',
        createdAt: serverTimestamp(),
        
        // Detailed Structured Fields matching precise criteria
        observerName: activeObserverName,
        observerMatricula: checklistForm.observerMatricula,
        observerArea: checklistForm.observerArea,
        observationLocation: checklistForm.observationLocation,
        observedArea: checklistForm.observedArea,
        hadOrientation: checklistForm.hadOrientation,
        isSafe: checklistForm.isSafe,
        date: formattedDate,
        categoriesSelected: selectedCats,
        photoUrl: checklistForm.photoUrl || '',
        fileName: checklistForm.fileName || ''
      };

      await addDoc(collection(db, 'safety_observations'), insertData);

      // Reset Structured Form
      setChecklistForm({
        observerName: profile?.displayName || user?.displayName || '',
        observerMatricula: '',
        observerArea: '',
        observationLocation: '',
        observedArea: '',
        hadOrientation: 'sim',
        isSafe: 'seguro',
        date: '2026-05-22',
        whatToObserve: {},
        description: '',
        photoUrl: '',
        fileName: ''
      });
      setOtherObserverName('');

      setActiveTab('observations_list');
      setModalConfig({
        isOpen: true,
        title: 'Observação Cadastrada!',
        message: 'A ficha de segurança foi arquivada e sincronizada com sucesso!',
        type: 'success'
      });
    } catch (err) {
      console.error('Error submitting safety checklist:', err);
      setModalConfig({
        isOpen: true,
        title: 'Falha no Registro',
        message: 'Ocorreu um erro ao salvar a ficha de observação no banco.',
        type: 'error'
      });
    } finally {
      setObsSubmitting(false);
    }
  };

  // Legacy Category handlers removed (fully replaced by unified handlers handleSaveOptionSetting & handleDeleteOptionSetting)

  // Move status or mark as resolved
  const handleUpdateStatus = async (obsId: string, nextStatus: 'working' | 'resolved', notes = '') => {
    try {
      const updateData: any = {
        status: nextStatus,
        updatedAt: serverTimestamp()
      };

      if (nextStatus === 'resolved') {
        updateData.resolutionNotes = notes;
        updateData.resolvedBy = profile?.displayName || user?.displayName || user?.email || 'Liderança / Inspetor de Segurança';
        updateData.resolvedAt = serverTimestamp();
      }

      await updateDoc(doc(db, 'safety_observations', obsId), updateData);
      
      setModalConfig({
        isOpen: true,
        title: 'Status Sincronizado',
        message: `O desvio foi atualizado para "${nextStatus === 'working' ? 'Em Tratativa' : 'Resolvido/Sanado'}" com sucesso!`,
        type: 'success'
      });
    } catch (err) {
      console.error("Error updating safety status:", err);
    }
  };

  const handleOpenResolveForm = (obs: SafetyObservation) => {
    setResolvingId(obs.id);
    setResolutionNotes('');
    setIsResolveModalOpen(true);
  };

  const handleConfirmResolve = () => {
    if (!resolvingId) return;
    if (!resolutionNotes.trim()) {
      setModalConfig({
        isOpen: true,
        title: 'Ações Necessárias',
        message: 'Escreva de forma sucinta qual foi a tratativa imediata de bloqueio ou reparo aplicada.',
        type: 'error'
      });
      return;
    }

    handleUpdateStatus(resolvingId, 'resolved', resolutionNotes);
    setIsResolveModalOpen(false);
    setResolvingId(null);
  };

  // Filter Observations Engine
  const filteredObservations = useMemo(() => {
    return observations.filter(obs => {
      const descMatch = obs.description?.toLowerCase().includes(searchTerm.toLowerCase());
      const reporterMatch = obs.reportedBy?.toLowerCase().includes(searchTerm.toLowerCase());
      const locationMatch = obs.observationLocation?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesSearch = descMatch || reporterMatch || locationMatch;
      const matchesStatus = statusFilter === 'all' || obs.status === statusFilter;
      const matchesSeverity = severityFilter === 'all' || obs.severity === severityFilter;

      return matchesSearch && matchesStatus && matchesSeverity;
    });
  }, [observations, searchTerm, statusFilter, severityFilter]);

  // Analytics Aggregation Engine
  const analyticsData = useMemo(() => {
    const total = observations.length;
    const pending = observations.filter(o => o.status === 'pending').length;
    const working = observations.filter(o => o.status === 'working').length;
    const resolved = observations.filter(o => o.status === 'resolved').length;

    const low = observations.filter(o => o.severity === 'low').length;
    const medium = observations.filter(o => o.severity === 'medium').length;
    const high = observations.filter(o => o.severity === 'high').length;

    // Safety Ratio
    const safeTotal = observations.filter(o => o.isSafe === 'seguro').length;
    const unsafeTotal = observations.filter(o => o.isSafe === 'inseguro').length;

    const statusChart = [
      { name: 'Pendente', value: pending, color: '#f59e0b' },
      { name: 'Tratativa', value: working, color: '#3b82f6' },
      { name: 'Resolvidos', value: resolved, color: '#10b981' }
    ];

    const severityChart = [
      { name: 'Foco Seguro', Desvios: low, color: '#10b981' },
      { name: 'Média Risco', Desvios: medium, color: '#f59e0b' },
      { name: 'Crítico / Inseguro', Desvios: high, color: '#ef4444' }
    ];

    return {
      statusChart,
      severityChart,
      total,
      pending,
      working,
      resolved,
      safeTotal,
      unsafeTotal
    };
  }, [observations]);

  return (
    <div className="space-y-8">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldAlert className="w-8 h-8 text-rose-500 animate-pulse" /> Observação de Segurança
          </h1>
          <p className="text-slate-500 mt-1 font-medium text-sm">Controle de desvios, auditoria comportamental, condições de risco e abordagens em campo.</p>
        </div>

        {/* Dynamic Navigation Selectors */}
        <div className="flex flex-wrap bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
          <button 
            onClick={() => setActiveTab('observations_list')}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all", 
              activeTab === 'observations_list' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
            )}
          >
            Observações ({filteredObservations.length})
          </button>
          
          <button 
            onClick={() => {
              setActiveTab('report_hazard');
              setReportMode('checklist');
            }}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5", 
              activeTab === 'report_hazard' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
            )}
          >
            <Plus className="w-3.5 h-3.5 text-rose-500" /> Registrar Auditoria
          </button>
          
          {(isManager || isAdmin) && (
            <button 
              onClick={() => setActiveTab('manage_templates')}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5", 
                activeTab === 'manage_templates' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
              )}
            >
              <Settings className="w-3.5 h-3.5 text-slate-500" /> Configurar Checklist
            </button>
          )}

          <button 
            onClick={() => setActiveTab('analytics')}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all", 
              activeTab === 'analytics' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
            )}
          >
            Estatísticas
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-[2.5rem] border border-slate-200">
          <Clock className="w-12 h-12 text-rose-500 animate-spin mb-4" />
          <p className="text-slate-500 font-bold text-sm">Carregando auditorias de segurança...</p>
        </div>
      ) : activeTab === 'observations_list' ? (
        <div className="space-y-6">
          {/* Filters Bar */}
          <div className="bg-white p-6 rounded-[2.1rem] border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
            <div className="relative w-full md:max-w-md">
              <Search className="absolute left-4 top-3.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Pesquisar por desvio, observador, local..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-xs text-slate-800"
              />
            </div>

            <div className="flex flex-wrap gap-2 w-full md:w-auto">
              <select
                value={statusFilter}
                onChange={(e: any) => setStatusFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-bold text-xs"
              >
                <option value="all">Todos os Status</option>
                <option value="pending">Pendentes</option>
                <option value="working">Em Tratativa</option>
                <option value="resolved">Resolvidos</option>
              </select>

              <select
                value={severityFilter}
                onChange={(e: any) => setSeverityFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-bold text-xs"
              >
                <option value="all">Todas as Classificações</option>
                <option value="low">Foco Seguro (Baixa)</option>
                <option value="medium">Média Preocupação</option>
                <option value="high">Ato/Condição Inseguro (Alta)</option>
              </select>
            </div>
          </div>

          {/* Observations Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredObservations.length === 0 ? (
              <div className="col-span-full py-16 text-center bg-white border border-slate-200 rounded-[2.1rem]">
                <ShieldCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-400 font-bold text-xs">Nenhum registro de segurança encontrado com esses filtros.</p>
              </div>
            ) : (
              filteredObservations.map(obs => {
                const dateObj = safeToDate(obs.createdAt);
                const isCustomStyle = !!obs.observerMatricula;
                
                return (
                  <motion.div 
                    layout
                    key={obs.id} 
                    className="bg-white rounded-[2rem] border border-slate-200 p-6 flex flex-col justify-between hover:shadow-md transition-all relative"
                  >
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className={cn(
                          "px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-lg border",
                          obs.isSafe === 'seguro' ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-rose-550 bg-rose-50 text-rose-600 border-rose-100"
                        )}>
                          {obs.isSafe === 'seguro' ? '🟢 SEGURO (Desvio Zero)' : '🔴 INSEGURO / DESVIO'}
                        </span>

                        <span className={cn(
                          "px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-lg border",
                          obs.status === 'resolved' ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                          obs.status === 'working' ? "bg-blue-50 text-blue-600 border-blue-100" :
                          "bg-amber-50 text-amber-600 border-amber-100 animate-pulse"
                        )}>
                          {obs.status === 'resolved' ? 'Resolvido' : obs.status === 'working' ? 'Tratativa' : 'Pendente'}
                        </span>
                      </div>

                      {/* Photo evidence */}
                      {obs.photoUrl && (
                        <div className="w-full h-40 rounded-2xl overflow-hidden relative border border-slate-100 bg-slate-50">
                          {obs.photoUrl.startsWith("data:image") ? (
                            <img 
                              src={obs.photoUrl} 
                              alt="Evidência" 
                              className="w-full h-full object-cover" 
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 py-4 gap-1">
                              <FileIcon className="w-8 h-8 text-slate-400" />
                              <span className="text-[10px] font-bold text-slate-500 text-center truncate px-2">{obs.fileName || 'Documento Anexo'}</span>
                            </div>
                          )}
                        </div>
                      )}

                      <div>
                        {isCustomStyle ? (
                          <div className="space-y-1.5">
                            <p className="text-[10px] font-black uppercase text-emerald-600 tracking-wider flex items-center gap-1 leading-none">
                              <Clipboard className="w-3.5 h-3.5 shrink-0" /> Ficha de Observação Oficial nº {getObsNumber(obs.id)}
                            </p>
                            <h4 className="text-xs font-extrabold text-slate-900 leading-tight">
                              Local: <span className="font-semibold text-slate-600">{obs.observationLocation}</span>
                            </h4>
                            {obs.categoriesSelected && obs.categoriesSelected.length > 0 && (
                              <div className="text-[10px] text-indigo-600 font-bold shrink-0 bg-indigo-50/50 px-2 py-1 rounded inline-block truncate max-w-full">
                                Categoria: {obs.categoriesSelected[0]} {obs.categoriesSelected.length > 1 ? `(+${obs.categoriesSelected.length - 1})` : ''}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <p className="text-[10px] font-black uppercase text-amber-500 tracking-wider flex items-center gap-1 leading-none mb-1">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> Desvio Avulso nº {getObsNumber(obs.id)}
                            </p>
                          </div>
                        )}
                        <p className="text-xs text-slate-600 leading-normal font-semibold whitespace-pre-line mt-2 line-clamp-3">
                          {isCustomStyle ? obs.description : obs.description}
                        </p>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 pt-3 mt-4">
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase mb-3">
                        <span className="flex items-center gap-1 max-w-[150px] truncate"><User className="w-3 h-3 text-slate-400" /> {obs.reportedBy}</span>
                        <span>{obs.date || (dateObj ? dateObj.toLocaleDateString('pt-BR') : 'Hoje')}</span>
                      </div>

                      <div className="flex gap-1.5">
                        <button
                          onClick={() => setViewingObs(obs)}
                          className="flex-1 py-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all text-center flex items-center justify-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" /> Detalhes
                        </button>

                        {(isManager || isAdmin) && obs.status !== 'resolved' && (
                          <div className="flex gap-1">
                            {obs.status === 'pending' && (
                              <button
                                onClick={() => handleUpdateStatus(obs.id, 'working')}
                                className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all"
                              >
                                Tratar
                              </button>
                            )}
                            {obs.status === 'working' && (
                              <button
                                onClick={() => handleOpenResolveForm(obs)}
                                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all"
                              >
                                Sanar
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>
      ) : activeTab === 'report_hazard' ? (
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Choice selector */}
          <div className="bg-white p-2 rounded-2xl border border-slate-200 grid grid-cols-2 gap-2 text-center text-xs font-black uppercase tracking-wider shadow-sm">
            <button
              onClick={() => setReportMode('checklist')}
              className={cn("py-3 rounded-xl transition-all", reportMode === 'checklist' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50')}
            >
              Ficha de Observação Completa
            </button>
            <button
              onClick={() => setReportMode('simple')}
              className={cn("py-3 rounded-xl transition-all", reportMode === 'simple' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50')}
            >
              Relatar Risco Rápido
            </button>
          </div>

          <AnimatePresence mode="wait">
            {reportMode === 'simple' ? (
              <motion.div 
                key="simple-form"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="bg-white p-8 md:p-10 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-8"
              >
                <div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">Relatar Risco Avulso (Rápido)</h2>
                  <p className="text-xs text-slate-400 mt-1 font-medium">Relate de forma sumarizada uma condição ou ato em desconformidade encontrado no complexo industrial.</p>
                </div>

                <form onSubmit={handleSubmitSimpleObservation} className="space-y-6 text-xs font-semibold">
                  <div className="space-y-2">
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Descrição do Problema / Risco</label>
                    <textarea
                      rows={4}
                      required
                      placeholder="Descreva o desvio observado com clareza... Ex: Mancha de lubrificante na via de pedestre do galpão de laminação, gerando iminência de escorregamento."
                      value={newObs.description}
                      onChange={(e) => setNewObs(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full text-xs font-semibold p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-slate-400 text-slate-700 leading-normal"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-6">
                    <div className="space-y-2">
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Gravidade Sugerida</label>
                      <div className="flex gap-2">
                        {[
                          { id: 'low', label: 'Baixa', color: 'bg-slate-100 border-slate-200 text-slate-600', activeColor: 'bg-slate-500 text-white' },
                          { id: 'medium', label: 'Média', color: 'bg-amber-500/10 border-amber-200 text-amber-600', activeColor: 'bg-amber-500 text-white' },
                          { id: 'high', label: 'Alta (Crítica)', color: 'bg-rose-500/10 border-rose-200 text-rose-600', activeColor: 'bg-rose-600 text-white' }
                        ].map(sev => (
                          <button
                            key={sev.id}
                            type="button"
                            onClick={() => setNewObs(prev => ({ ...prev, severity: sev.id as any }))}
                            className={cn(
                              "flex-1 py-3 rounded-xl font-black text-center text-[10px] uppercase border tracking-wider transition-all",
                              newObs.severity === sev.id ? sev.activeColor : sev.color
                            )}
                          >
                            {sev.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* BLOCK 6: ANEXO - PREMIUM DRAG AND DROP ZONE */}
                    <div className="p-6 bg-slate-50/60 rounded-[1.8rem] border border-slate-100 space-y-3">
                      <h3 className="text-xs font-black text-slate-900 tracking-wide uppercase border-b border-slate-200 pb-2 flex items-center gap-1.5">
                        <Camera className="w-4 h-4 text-emerald-600" /> ANEXO (EX: FOTO, DOCUMENTO, ETC.)
                      </h3>
                      <div 
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, 'simple')}
                        className={cn(
                          "border-2 border-dashed rounded-2xl p-8 text-center transition-all flex flex-col items-center justify-center cursor-pointer gap-3",
                          isDragging ? "border-emerald-500 bg-emerald-50/40 scale-[0.98]" : "border-slate-300 bg-white hover:border-emerald-400"
                        )}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {newObs.photoUrl ? (
                          <div className="space-y-4" onClick={(e) => e.stopPropagation()}>
                            {newObs.photoUrl.startsWith("data:image") ? (
                              <img src={newObs.photoUrl} alt="Anexo" className="w-32 h-24 object-cover rounded-xl border border-slate-200 mx-auto" />
                            ) : (
                              <div className="flex flex-col items-center gap-1.5 text-indigo-600">
                                <FileIcon className="w-12 h-12" />
                              </div>
                            )}
                            <span className="block text-xs font-extrabold text-slate-700">{newObs.fileName || 'Arquivo Carregado'}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                  e.stopPropagation();
                                  setNewObs(prev => ({ ...prev, photoUrl: '', fileName: '' }));
                              }}
                              className="px-4 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 font-black text-[10px] rounded-lg uppercase transition-all"
                            >
                              Excluir Arquivo
                            </button>
                          </div>
                        ) : (
                          <>
                            <UploadCloud className={cn("w-12 h-12 text-slate-400 transition-all", isDragging && "text-emerald-500 scale-110")} />
                            <div>
                              <p className="text-xs font-black text-slate-800">Solte arquivos para anexar ou <span className="text-emerald-600 hover:underline">navegar</span></p>
                              <p className="text-[10px] text-slate-400 font-semibold mt-1">Carregue fotos (.png, .jpg) ou documentações operacionais de segurança.</p>
                            </div>
                          </>
                        )}
                      </div>
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        onChange={(e) => handleFileBrowse(e, 'simple')}
                      />
                    </div>
                  </div>

                  <div className="flex gap-4 justify-end mt-12 pt-6 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setActiveTab('observations_list')}
                      className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-all text-[10px] uppercase"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={obsSubmitting}
                      className="px-8 py-3 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl shadow-lg transition-all text-[10px] uppercase tracking-wider"
                    >
                      {obsSubmitting ? 'Enviando...' : 'Registrar Risco'}
                    </button>
                  </div>
                </form>
              </motion.div>
            ) : (
              /* DYNAMIC MASTER BRAZILIAN PORTUGUESE COMPLETE SHEET FORM */
              <motion.div 
                key="checklist-form"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="bg-white p-8 md:p-10 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-8"
              >
                <div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">Formulário Oficial de Auditoria / Observação</h2>
                  <p className="text-xs text-slate-400 mt-1 font-medium">Preencha os campos com rigor para registrar a inspeção de conduta e condições físicas em campo.</p>
                </div>

                <form onSubmit={handleSubmitChecklistObservation} className="space-y-8 text-xs font-semibold">
                  
                  {/* BLOC 1: OBSERVAÇÃO DE SEGURANÇA REALIZADO POR */}
                  <div className="p-6 bg-slate-50/60 rounded-[1.8rem] border border-slate-100 space-y-5">
                    <h3 className="text-xs font-black text-slate-900 tracking-wide uppercase border-b border-slate-200 pb-2.5 flex items-center gap-1.5">
                      <User className="w-4 h-4 text-emerald-600" /> OBSERVAÇÃO DE SEGURANÇA REALIZADO POR
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Name of Inspector with direct input & Autocomplete datalist */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">NOME DO OBSERVADOR *</label>
                        <input
                          type="text"
                          required
                          list="observer-operators-datalist"
                          placeholder="Digite ou selecione o nome do observador..."
                          value={checklistForm.observerName}
                          onChange={(e) => setChecklistForm(prev => ({ ...prev, observerName: e.target.value }))}
                          className="w-full text-xs font-semibold px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-sans"
                        />
                        <datalist id="observer-operators-datalist">
                          {combinedOperators.map(op => (
                            <option key={op} value={op} />
                          ))}
                        </datalist>
                      </div>

                      {/* Number of Matricula */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">NÚMERO DA MATRÍCULA *</label>
                        <input
                          type="text"
                          required
                          placeholder="Digite o número do registro/matrícula..."
                          value={checklistForm.observerMatricula}
                          onChange={(e) => setChecklistForm(prev => ({ ...prev, observerMatricula: e.target.value }))}
                          className="w-full text-xs font-semibold px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>

                      {/* Area of Observer */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-1 font-bold text-slate-400">ÁREA DO OBSERVADOR *</label>
                        <select
                          required
                          value={checklistForm.observerArea}
                          onChange={(e) => setChecklistForm(prev => ({ ...prev, observerArea: e.target.value }))}
                          className="w-full text-xs font-semibold px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="">Selecionar...</option>
                          {activePlantAreas.map((a, idx) => (
                            <option key={`observer-area-${a}-${idx}`} value={a}>{a}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* BLOCK 2: LOCAL DA OBSERVAÇÃO & INFRAESTRUTURA */}
                  <div className="p-6 bg-slate-50/60 rounded-[1.8rem] border border-slate-100 space-y-4">
                    <h3 className="text-xs font-black text-slate-900 tracking-wide uppercase border-b border-slate-200 pb-2 flex items-center gap-1.5">
                      <Wrench className="w-4 h-4 text-emerald-600" /> LOCAL DA OBSERVAÇÃO & ÁREA DE ATENDIMENTO
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Physical Location description */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">LOCAL DA OBSERVAÇÃO *</label>
                        <input
                          type="text"
                          required
                          placeholder="Ex: Próximo à Ponte Rolante 03 ou Baia de Fornos"
                          value={checklistForm.observationLocation}
                          onChange={(e) => setChecklistForm(prev => ({ ...prev, observationLocation: e.target.value }))}
                          className="w-full text-xs font-semibold px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>

                      {/* Area of Observed operator */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">ÁREA DO OBSERVADO *</label>
                        <select
                          required
                          value={checklistForm.observedArea}
                          onChange={(e) => setChecklistForm(prev => ({ ...prev, observedArea: e.target.value }))}
                          className="w-full text-xs font-semibold px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="">Selecionar...</option>
                          {activePlantAreas.map((a, idx) => (
                            <option key={`observed-area-${a}-${idx}`} value={a}>{a}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* BLOCK 3: CLASSIFICAÇÃO DE RISCO & COMPORTAMENTO */}
                  <div className="p-6 bg-slate-50/60 rounded-[1.8rem] border border-slate-100 space-y-5">
                    <h3 className="text-xs font-black text-slate-900 tracking-wide uppercase border-b border-slate-200 pb-2.5 flex items-center gap-1.5">
                      <Clipboard className="w-4 h-4 text-emerald-600" /> CLASSIFICAÇÃO DE SEGURANÇA E FEEDBACK
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      
                      {/* FEEDBACK STATUS */}
                      <div className="space-y-1.5 bg-white p-4 rounded-2xl border border-slate-100">
                        <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide block mb-2 text-center">HOUVE ORIENTAÇÃO (FEEDBACK)? *</label>
                        <div className="grid grid-cols-2 gap-2 text-center">
                          {[
                            { id: 'sim', label: 'Sim' },
                            { id: 'nao', label: 'Não' }
                          ].map(fdb => (
                            <button
                              key={fdb.id}
                              type="button"
                              onClick={() => setChecklistForm(prev => ({ ...prev, hadOrientation: fdb.id as any }))}
                              className={cn(
                                "py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all",
                                checklistForm.hadOrientation === fdb.id 
                                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm' 
                                  : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200'
                              )}
                            >
                              {fdb.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* SAFE VS UNSAFE STATUS */}
                      <div className="space-y-1.5 bg-white p-4 rounded-2xl border border-slate-100 md:col-span-2">
                        <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide block mb-2 text-center">SEGURO OU INSEGURO? *</label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setChecklistForm(prev => ({ ...prev, isSafe: 'seguro' }))}
                            className={cn(
                              "flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all flex items-center justify-center gap-1.5",
                              checklistForm.isSafe === 'seguro'
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                                : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200'
                            )}
                          >
                            <ShieldCheck className="w-4 h-4" /> Seguro (Ato Conforme)
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => setChecklistForm(prev => ({ ...prev, isSafe: 'inseguro' }))}
                            className={cn(
                              "flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all flex items-center justify-center gap-1.5",
                              checklistForm.isSafe === 'inseguro'
                                ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                                : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200'
                            )}
                          >
                            <AlertTriangle className="w-4 h-4" /> Inseguro (Desvio / Risco)
                          </button>
                        </div>
                      </div>

                      {/* DATE FIELD */}
                      <div className="space-y-1.5 md:col-span-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">DATA *</label>
                        <div className="relative">
                          <Calendar className="absolute left-4 top-3 h-4 w-4 text-slate-400" />
                          <input
                            type="date"
                            required
                            value={checklistForm.date}
                            onChange={(e) => setChecklistForm(prev => ({ ...prev, date: e.target.value }))}
                            className="w-full text-xs font-semibold pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <p className="text-[10px] font-medium text-slate-400 mt-1 pl-1">Exemplo: 22/05/2026</p>
                      </div>
                    </div>
                  </div>

                  {/* BLOCK 4: O QUE OBSERVAR? (19 CATEGORIES CHECKBOX LIST) */}
                  <div className="p-6 bg-slate-50/60 rounded-[1.8rem] border border-slate-100 space-y-4">
                    <div>
                      <h3 className="text-xs font-black text-slate-900 tracking-wide uppercase border-b border-slate-200 pb-2 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" /> O QUE OBSERVAR? *
                      </h3>
                      <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase">Selecione uma ou mais diretrizes avaliadas nesta rodada técnica de auditoria:</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-white p-4 rounded-2xl border border-slate-100">
                      {safetyCategories.map((cat) => {
                        const isChecked = !!checklistForm.whatToObserve[cat.id];
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => {
                              setChecklistForm(prev => ({
                                ...prev,
                                whatToObserve: {
                                  ...prev.whatToObserve,
                                  [cat.id]: !isChecked
                                }
                              }));
                            }}
                            className={cn(
                              "w-full text-left p-3.5 rounded-xl border text-xs font-semibold flex items-start gap-3 transition-all",
                              isChecked 
                                ? "bg-emerald-50 border-emerald-300 text-emerald-950 shadow-sm" 
                                : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                            )}
                          >
                            <div className={cn(
                              "w-4 h-4 rounded border flex items-center justify-center text-white shrink-0 mt-0.5",
                              isChecked ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-slate-300'
                            )}>
                              {isChecked && <Check className="w-3 h-3 text-white font-heavy stroke-[4px]" />}
                            </div>
                            <span className="leading-tight font-bold">{cat.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* BLOCK 5: DESCREVER (DETAILED TAXONOMY TEXTAREA) */}
                  <div className="p-6 bg-slate-50/60 rounded-[1.8rem] border border-slate-100 space-y-3">
                    <h3 className="text-xs font-black text-slate-900 tracking-wide uppercase border-b border-slate-200 pb-2 flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-emerald-600" /> DESCREVER
                    </h3>
                    <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">RELATO DA OBSERVAÇÃO:</label>
                    <textarea
                      rows={5}
                      placeholder="Descreva minuciosamente o comportamento analisado, o contexto operacional, as tratativas de feedback ou as condições identificadas..."
                      value={checklistForm.description}
                      onChange={(e) => setChecklistForm(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full text-xs font-bold leading-relaxed p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-slate-400 text-slate-800"
                    />
                  </div>

                  {/* BLOCK 6: ANEXO - PREMIUM DRAG AND DROP ZONE */}
                  <div className="p-6 bg-slate-50/60 rounded-[1.8rem] border border-slate-100 space-y-3">
                    <h3 className="text-xs font-black text-slate-900 tracking-wide uppercase border-b border-slate-200 pb-2 flex items-center gap-1.5">
                      <Camera className="w-4 h-4 text-emerald-600" /> ANEXO (EX: FOTO, DOCUMENTO, ETC.)
                    </h3>
                    
                    <div 
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, 'checklist')}
                      className={cn(
                        "border-2 border-dashed rounded-2xl p-8 text-center transition-all flex flex-col items-center justify-center cursor-pointer gap-3",
                        isDragging ? "border-emerald-500 bg-emerald-50/40 scale-[0.98]" : "border-slate-300 bg-white hover:border-emerald-400"
                      )}
                      onClick={() => fileInputChklRef.current?.click()}
                    >
                      {checklistForm.photoUrl ? (
                        <div className="space-y-4" onClick={(e) => e.stopPropagation()}>
                          {checklistForm.photoUrl.startsWith("data:image") ? (
                            <img src={checklistForm.photoUrl} alt="Anexo" className="w-32 h-24 object-cover rounded-xl border border-slate-200 mx-auto" />
                          ) : (
                            <div className="flex flex-col items-center gap-1.5 text-indigo-600">
                              <FileIcon className="w-12 h-12" />
                            </div>
                          )}
                          <span className="block text-xs font-extrabold text-slate-700">{checklistForm.fileName || 'Arquivo Carregado'}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setChecklistForm(prev => ({ ...prev, photoUrl: '', fileName: '' }));
                            }}
                            className="px-4 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 font-black text-[10px] rounded-lg uppercase transition-all"
                          >
                            Excluir Arquivo
                          </button>
                        </div>
                      ) : (
                        <>
                          <UploadCloud className={cn("w-12 h-12 text-slate-400 transition-all", isDragging && "text-emerald-500 scale-110")} />
                          <div>
                            <p className="text-xs font-black text-slate-800">Solte arquivos para anexar ou <span className="text-emerald-600 hover:underline">navegar</span></p>
                            <p className="text-[10px] text-slate-400 font-semibold mt-1">Carregue fotos (.png, .jpg) ou documentações operacionais de segurança.</p>
                          </div>
                        </>
                      )}
                    </div>
                    <input
                      type="file"
                      ref={fileInputChklRef}
                      className="hidden"
                      onChange={(e) => handleFileBrowse(e, 'checklist')}
                    />
                  </div>

                  {/* Submission and Cancel row */}
                  <div className="flex gap-4 justify-end mt-12 pt-6 border-t border-slate-150">
                    <button
                      type="button"
                      onClick={() => setActiveTab('observations_list')}
                      className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-[10px] uppercase transition-all"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={obsSubmitting}
                      className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-heavy rounded-xl shadow-lg transition-all text-[10px] uppercase tracking-wider"
                    >
                      {obsSubmitting ? 'Transmitindo...' : 'Transmitir Observação Completa'}
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : activeTab === 'manage_templates' ? (
        /* MANAGE CHECKLIST SELECTIONS, AREAS, AND OPERATORS IN PREMIUM SUB-TABBED PANEL */
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Gerenciamento do Sistema de Segurança</h2>
              <p className="text-xs text-slate-400 mt-1 font-medium">Configure e padronize as opções de área, colaboradores cadastrados e categorias de análise de desvios.</p>
            </div>
            
            {configSubTab !== 'operators' ? (
              <button
                onClick={() => {
                  setConfigModal({
                    isOpen: true,
                    type: configSubTab,
                    id: undefined,
                    value: ''
                  });
                }}
                className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all self-start md:self-auto"
              >
                <Plus className="w-4 h-4 text-emerald-500 font-bold" /> 
                {configSubTab === 'categories' ? 'Adicionar Categoria' : 'Adicionar Área'}
              </button>
            ) : (
              <div className="px-3 py-2 bg-slate-100 rounded-xl text-[10px] font-bold text-slate-500 uppercase tracking-wider border border-slate-200">
                Sincronizado com Contas de Usuários
              </div>
            )}
          </div>

          {/* Sub-tabs selection */}
          <div className="flex bg-slate-100 p-1 rounded-2xl gap-1">
            <button
              onClick={() => setConfigSubTab('categories')}
              className={cn(
                "flex-1 py-3 text-xs font-black rounded-xl uppercase tracking-wider transition-all",
                configSubTab === 'categories' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
              )}
            >
              O Que Observar ({safetyCategories.length})
            </button>
            <button
              onClick={() => setConfigSubTab('areas')}
              className={cn(
                "flex-1 py-3 text-xs font-black rounded-xl uppercase tracking-wider transition-all",
                configSubTab === 'areas' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
              )}
            >
              Áreas Industriais ({plantAreas.length})
            </button>
            <button
              onClick={() => setConfigSubTab('operators')}
              className={cn(
                "flex-1 py-3 text-xs font-black rounded-xl uppercase tracking-wider transition-all",
                configSubTab === 'operators' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
              )}
            >
              Operadores ({operatorsState.length})
            </button>
          </div>

          <div className="bg-white rounded-[2.2rem] border border-slate-200 shadow-sm overflow-hidden text-xs">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-150 flex items-center justify-between">
              <span className="font-black text-slate-600 uppercase tracking-wider text-[10px]">
                {configSubTab === 'categories' && 'Frentes de Avaliação Comportamental ("O Que Observar")'}
                {configSubTab === 'areas' && 'Áreas Operacionais e Unidades da Planta'}
                {configSubTab === 'operators' && 'Nomes Sugeridos no Autocomplete de Operadores'}
              </span>
              <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-150 text-indigo-600 font-black rounded-md text-[9px]">Ativo no Database</span>
            </div>

            <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
              {configSubTab === 'categories' && (
                <>
                  {safetyCategories.map((cat, idx) => (
                    <div key={cat.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-all font-semibold">
                      <div className="flex items-center gap-3">
                        <span className="bg-slate-100 text-slate-500 font-mono px-2 py-0.5 rounded text-[10px]">{idx + 1}</span>
                        <span className="text-slate-800 pr-4 font-bold">{cat.name}</span>
                      </div>

                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => setConfigModal({ isOpen: true, type: 'category', id: cat.id, value: cat.name })}
                          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
                          title="Editar"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteOptionSetting('category', cat.id, cat.name)}
                          className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                          title="Apagar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {safetyCategories.length === 0 && (
                    <div className="p-8 text-center text-slate-400 font-bold">
                      Nenhuma categoria de checagem configurada no momento.
                    </div>
                  )}
                </>
              )}

              {configSubTab === 'areas' && (
                <>
                  {plantAreas.map((area, idx) => (
                    <div key={area.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-all font-semibold">
                      <div className="flex items-center gap-3">
                        <span className="bg-slate-100 text-slate-500 font-mono px-2 py-0.5 rounded text-[10px]">{idx + 1}</span>
                        <span className="text-slate-800 pr-4 font-bold">{area.name}</span>
                      </div>

                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => setConfigModal({ isOpen: true, type: 'area', id: area.id, value: area.name })}
                          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
                          title="Editar"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteOptionSetting('area', area.id, area.name)}
                          className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                          title="Apagar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {plantAreas.length === 0 && (
                    <div className="p-8 text-center text-slate-400 font-bold">
                      Nenhuma área industrial configurada.
                    </div>
                  )}
                </>
              )}

              {configSubTab === 'operators' && (
                <>
                  {operatorsState.map((op, idx) => (
                    <div key={op.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-all font-semibold">
                      <div className="flex items-center gap-3">
                        <span className="bg-slate-100 text-slate-500 font-mono px-2 py-0.5 rounded text-[10px]">{idx + 1}</span>
                        <span className="text-slate-800 pr-4 font-bold">{op.name}</span>
                      </div>

                      <div className="flex gap-1 shrink-0">
                        <span className="text-[9px] uppercase font-black text-emerald-600 bg-emerald-55 bg-emerald-50 px-2.5 py-1 border border-emerald-100 rounded-lg">
                          Usuário Ativo no Sistema
                        </span>
                      </div>
                    </div>
                  ))}
                  {operatorsState.length === 0 && (
                    <div className="p-8 text-center text-slate-400 font-bold">
                      Nenhum usuário cadastrado no sistema.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ANALYTICS CHARTS AND RATIOS ENGINE */
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
              <ShieldAlert className="w-6 h-6 text-rose-500 mb-2 animate-pulse" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Auditorias Realizadas</span>
              <p className="text-3xl font-black text-slate-900 mt-1">{analyticsData.total}</p>
              <p className="text-[10px] text-slate-400 font-medium mt-1">Somas históricas cumulativas</p>
            </div>
            
            <div className="bg-amber-50 p-6 rounded-[2rem] border border-amber-100 shadow-sm">
              <Clock className="w-6 h-6 text-amber-500 mb-2" />
              <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest font-bold">Pendentes de Tratativas</span>
              <p className="text-3xl font-black text-amber-600 mt-1">{analyticsData.pending}</p>
              <p className="text-[10px] text-amber-500 font-medium mt-1">Correções no local aguardando</p>
            </div>

            <div className="bg-blue-50 p-6 rounded-[2rem] border border-blue-100 shadow-sm">
              <TrendingUp className="w-6 h-6 text-blue-500 mb-2" />
              <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest font-bold">Em Solução</span>
              <p className="text-3xl font-black text-blue-600 mt-1">{analyticsData.working}</p>
              <p className="text-[10px] text-blue-500 font-medium mt-1">Tratamentos em andamento</p>
            </div>

            <div className="bg-emerald-55 bg-emerald-50 p-6 rounded-[2rem] border border-emerald-100 shadow-sm">
              <CheckCircle className="w-6 h-6 text-emerald-500 mb-2" />
              <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest font-bold">Tratados / Resolvidos</span>
              <p className="text-3xl font-black text-emerald-600 mt-1">{analyticsData.resolved}</p>
              <p className="text-[10px] text-emerald-500 font-medium mt-1">100% de mitigações físicas</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Status Chart */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="font-black text-lg text-slate-900 tracking-tight">Status de Acompanhamento</h3>
                <p className="text-slate-400 text-xs mt-0.5">Indicador de auditorias analisadas vs aguardando tratamento.</p>
              </div>

              <div className="h-[250px] w-full mt-4 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analyticsData.statusChart}
                      innerRadius={65}
                      outerRadius={85}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {analyticsData.statusChart.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="flex justify-center gap-6 mt-4 text-[11px] font-bold uppercase tracking-wider text-slate-500 leading-none">
                {analyticsData.statusChart.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                     <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span>{item.name}: {item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Severity and Behavior indicators */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
              <div className="mb-6">
                <h3 className="font-black text-lg text-slate-900 tracking-tight">Relação de Comportamento na Planta</h3>
                <p className="text-slate-400 text-xs mt-0.5">Comparativo volumétrico de riscos críticos vs focos seguros observados.</p>
              </div>

              <div className="h-[260px] w-full text-xs font-semibold">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analyticsData.severityChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="name" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip />
                    <Bar dataKey="Desvios" fill="#ef4444" radius={[6, 6, 0, 0]}>
                      {analyticsData.severityChart.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW OBSERVATION MODAL WITH PREMIUM INDUSTRIAL VISUAL FORM */}
      <AnimatePresence>
        {viewingObs && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
              onClick={() => setViewingObs(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] border border-slate-200 w-full max-w-2xl overflow-hidden relative shadow-2xl z-10 max-h-[90vh] flex flex-col pt-6 font-semibold"
            >
              <div className="px-8 pb-4 border-b border-slate-150 flex items-start justify-between">
                <div>
                  <span className="text-[9px] uppercase font-black tracking-widest text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md">Atendimento de Segurança</span>
                  <h3 className="text-xl font-black text-slate-900 mt-1.5">
                    Ficha de Segurança nº {getObsNumber(viewingObs.id)}
                  </h3>
                </div>
                <button 
                  onClick={() => setViewingObs(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-50 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-8 space-y-6 overflow-y-auto flex-1 text-xs font-semibold scrollbar-thin">
                {/* Image of evidence */}
                {viewingObs.photoUrl && (
                  <div className="w-full h-56 rounded-2xl overflow-hidden relative border border-slate-155 bg-slate-50 border-slate-200">
                    {viewingObs.photoUrl.startsWith("data:image") ? (
                      <img 
                        src={viewingObs.photoUrl} 
                        alt="Evidência Visual" 
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-1.5 p-4">
                        <FileIcon className="w-12 h-12 text-blue-600" />
                        <span className="text-xs text-slate-705 font-bold">{viewingObs.fileName}</span>
                        <a 
                          href={viewingObs.photoUrl} 
                          download={viewingObs.fileName}
                          className="px-4 py-1.5 bg-blue-50 border border-blue-100 hover:bg-blue-100 text-blue-600 font-extrabold text-[10px] rounded-lg uppercase tracking-wider flex items-center gap-1 mt-2 shadow-sm"
                        >
                          Baixar Documento
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {/* Observer Details */}
                <div className="bg-slate-50 border border-slate-150 p-5 rounded-2xl space-y-4 shadow-inner">
                  <span className="text-[10px] font-black text-slate-450 text-slate-400 uppercase tracking-widest block leading-none">OBSERVAÇÃO DE SEGURANÇA REALIZADO POR</span>
                  
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-[9px] text-slate-400 block font-bold">NOME DO OBSERVADOR:</span>
                      <span className="text-slate-900 font-black text-[13px]">{viewingObs.reportedBy}</span>
                    </div>

                    <div>
                      <span className="text-[9px] text-slate-400 block font-bold">NÚMERO DA MATRÍCULA:</span>
                      <span className="text-slate-800 font-black font-mono">{viewingObs.observerMatricula || 'N/A'}</span>
                    </div>

                    <div>
                      <span className="text-[9px] text-slate-300 block font-bold text-slate-400">ÁREA DO OBSERVADOR:</span>
                      <span className="text-slate-800 font-bold">{viewingObs.observerArea || 'N/A'}</span>
                    </div>

                    <div>
                      <span className="text-[9px] text-slate-400 block font-bold">DATA DA OBSERVAÇÃO:</span>
                      <span className="text-slate-800 font-bold">{viewingObs.date || 'Sincronizando'}</span>
                    </div>
                  </div>
                </div>

                {/* Audit Locations details */}
                <div className="bg-slate-50 border border-slate-150 p-5 rounded-2xl space-y-4 shadow-inner">
                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest block leading-none text-slate-400">LOCALIZAÇÃO & CLASSIFICAÇÃO</span>
                  
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-[9px] text-slate-400 block font-bold">LOCAL DA OBSERVAÇÃO:</span>
                      <span className="text-slate-800 font-bold">{viewingObs.observationLocation || 'N/A'}</span>
                    </div>

                    <div>
                      <span className="text-[9px] text-slate-400 block font-bold">ÁREA DO OBSERVADO:</span>
                      <span className="text-slate-800 font-bold">{viewingObs.observedArea || 'N/A'}</span>
                    </div>

                    <div>
                      <span className="text-[9px] text-slate-400 block font-bold">HOUVE ORIENTAÇÃO (FEEDBACK)?</span>
                      <span className={cn(
                        "px-2 py-0.5 rounded text-[9px] font-black uppercase inline-block mt-0.5",
                        viewingObs.hadOrientation === 'sim' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      )}>
                        {viewingObs.hadOrientation === 'sim' ? "Sim" : "Não"}
                      </span>
                    </div>

                    <div>
                      <span className="text-[9px] text-slate-400 block font-bold">SEGURO OU INSEGURO?</span>
                      <span className={cn(
                        "px-2 py-0.5 rounded text-[9px] font-black uppercase inline-block mt-0.5",
                        viewingObs.isSafe === 'seguro' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                      )}>
                        {viewingObs.isSafe === 'seguro' ? "Seguro" : "Inseguro"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Standard checked items selected */}
                {viewingObs.categoriesSelected && viewingObs.categoriesSelected.length > 0 && (
                  <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-3">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wide block">DIRETRIZES OBSERVADAS (O QUE OBSERVAR):</span>
                    <div className="flex flex-wrap gap-2">
                      {viewingObs.categoriesSelected.map((catName, idx) => (
                        <span key={`${catName}-${idx}`} className="text-[10px] font-bold text-slate-700 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl block leading-tight">
                          ✅ {catName}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Raw Descriptions */}
                <div className="space-y-1.5 leading-relaxed">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">RELATO COMPLEMENTAR / DETALHES::</span>
                  <p className="text-slate-700 text-xs font-bold leading-normal p-4 bg-slate-50 rounded-2xl border border-slate-150 whitespace-pre-line">
                    {viewingObs.description}
                  </p>
                </div>

                {/* Status resolution notes if resolved */}
                {viewingObs.status === 'resolved' && (
                  <div className="bg-emerald-55 bg-emerald-50/50 p-5 rounded-2xl border border-emerald-100 space-y-2">
                    <span className="text-[9px] text-emerald-600 font-black uppercase tracking-widest">Ações Corretivas Aplicadas:</span>
                    <p className="text-slate-700 font-bold text-[11px] leading-relaxed">{viewingObs.resolutionNotes}</p>
                    <div className="flex justify-between items-center text-[9px] text-emerald-600 font-black tracking-wide border-t border-emerald-100/60 pt-2 mt-2">
                      <span>Mitigado por: {viewingObs.resolvedBy}</span>
                      <span>{safeToDate(viewingObs.resolvedAt)?.toLocaleDateString('pt-BR')}</span>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ADMIN ADD/EDIT OPTION DIALOG */}
      <AnimatePresence>
        {configModal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50"
              onClick={() => setConfigModal(prev => ({ ...prev, isOpen: false }))}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2rem] border border-slate-200 w-full max-w-md overflow-hidden relative shadow-2xl z-10 p-6 flex flex-col font-semibold"
            >
              <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                <h3 className="text-sm font-black text-slate-900 uppercase">
                  {configModal.id ? 'Editar Cadastro' : 'Novo Cadastro no Sistema'}
                </h3>
                <button onClick={() => setConfigModal(prev => ({ ...prev, isOpen: false }))}>
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>

              <div className="py-4 space-y-3 text-xs">
                <label className="text-[10px] text-slate-400 font-black uppercase block">
                  {configModal.type === 'category' && 'Descrição da Categoria (Ex: 20. Radiologia / Fontes de Calor)'}
                  {configModal.type === 'area' && 'Nome da Área Industrial (Ex: Alto Forno / Laminação / Silos)'}
                  {configModal.type === 'operator' && 'Nome Completo do Operador'}
                </label>
                <input
                  type="text"
                  placeholder={
                    configModal.type === 'category' ? "Ex: 20. Controle de Ruídos..." :
                    configModal.type === 'area' ? "Ex: Acabamento de Bobinas..." :
                    "Ex: Jackson Barreto..."
                  }
                  value={configModal.value}
                  onChange={(e) => setConfigModal(prev => ({ ...prev, value: e.target.value }))}
                  className="w-full text-xs font-semibold px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  onClick={() => setConfigModal(prev => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 bg-slate-100 text-slate-500 rounded-lg text-xs font-bold uppercase"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveOptionSetting}
                  className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-xs font-black uppercase tracking-wider"
                >
                  Salvar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* RESOLUTION MODAL */}
      <AnimatePresence>
        {isResolveModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50"
              onClick={() => setIsResolveModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2rem] border border-slate-200 w-full max-w-md overflow-hidden relative shadow-2xl z-10 p-6 flex flex-col font-semibold"
            >
              <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                <h3 className="text-sm font-black text-slate-950 uppercase">Tratativa de Encerramento (Segurança)</h3>
                <button onClick={() => setIsResolveModalOpen(false)}>
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>

              <div className="py-4 space-y-3 text-xs">
                <label className="text-[10px] text-slate-400 font-extrabold uppercase block">Relatório da Ação / Bloqueio adotado:</label>
                <textarea
                  rows={4}
                  placeholder="Relate brevemente o conserto ou intervenção local realizada para sanar o desvio..."
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  className="w-full text-xs font-semibold p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  onClick={() => setIsResolveModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-500 rounded-lg text-xs font-bold uppercase animate-none"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmResolve}
                  className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-xs font-black uppercase"
                >
                  Confirmar e Sanar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DEFAULT CONFIRMATION MODAL */}
      <ConfirmationModal
        isOpen={modalConfig.isOpen}
        onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
        title={modalConfig.title}
        message={modalConfig.message}
        type={modalConfig.type}
        onConfirm={modalConfig.onConfirm}
      />
    </div>
  );
};

export default SafetyObservations;
