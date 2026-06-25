import React, { useState, useEffect } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp, 
  orderBy,
  getDocs,
  getDoc,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { encryptValue, decryptValue } from '../lib/crypto';
import { 
  QualityChecklistTemplate, 
  QualityChecklistSubmission, 
  QualityChecklistOmission,
  ChecklistItemDefinition,
  ChecklistItemType,
  ProductionLine,
  QualitySector,
  QualityChecklistOptionSet
} from '../types';
import { ConfirmationModal } from '../components/ui/ConfirmationModal';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import { getCurrentShift, getGroupForShift, Shift } from '../lib/scaleUtils';
import { 
  ClipboardCheck, 
  Settings, 
  Plus, 
  Trash2, 
  Save, 
  X, 
  CheckCircle2, 
  AlertCircle,
  FileText,
  BarChart3,
  Clock,
  ChevronRight,
  ChevronLeft,
  Edit2,
  QrCode,
  Thermometer,
  Hash,
  ToggleLeft,
  LayoutGrid,
  Layers,
  Printer,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, safeToDate } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/errorHandler';

// Tabs
type QualityTab = 'perform' | 'templates' | 'sectors' | 'options' | 'omissions' | 'dashboard';

const getOptionColorClasses = (option: string, isSelected: boolean) => {
  const optLower = option.toLowerCase();
  
  // Limpo / Limpa
  if (optLower === 'limpo' || optLower === 'limpa' || optLower === 'conforme' || optLower === 'ok') {
    return isSelected
      ? "flex-1 min-w-[120px] py-3 px-4 rounded-xl font-bold border-2 text-xs uppercase tracking-wider transition-all bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-100"
      : "flex-1 min-w-[120px] py-3 px-4 rounded-xl font-bold border-2 text-xs uppercase tracking-wider transition-all bg-white border-slate-200 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50/20";
  }
  
  // Pouco sujo / levemente amarelo
  if (optLower.includes('pouco sujo') || optLower.includes('pouco suja') || optLower.includes('levemente sujo') || optLower.includes('levemente suja') || optLower.includes('pouco')) {
    return isSelected
      ? "flex-1 min-w-[120px] py-3 px-4 rounded-xl font-bold border-2 text-xs uppercase tracking-wider transition-all bg-yellow-400 border-yellow-400 text-yellow-950 shadow-md shadow-yellow-100"
      : "flex-1 min-w-[120px] py-3 px-4 rounded-xl font-bold border-2 text-xs uppercase tracking-wider transition-all bg-white border-slate-200 text-yellow-600 hover:border-yellow-300 hover:bg-yellow-50/20";
  }
  
  // Sujo / amarelo forte
  if (optLower === 'sujo' || optLower === 'suja' || optLower.includes('amarelo forte')) {
    return isSelected
      ? "flex-1 min-w-[120px] py-3 px-4 rounded-xl font-bold border-2 text-xs uppercase tracking-wider transition-all bg-amber-500 border-amber-500 text-white shadow-md shadow-amber-100"
      : "flex-1 min-w-[120px] py-3 px-4 rounded-xl font-bold border-2 text-xs uppercase tracking-wider transition-all bg-white border-slate-200 text-amber-600 hover:border-amber-300 hover:bg-amber-50/20";
  }
  
  // Muito sujo
  if (optLower.includes('muito sujo') || optLower.includes('muito suja') || optLower === 'não conforme' || optLower === 'nao conforme' || optLower === 'nok') {
    return isSelected
      ? "flex-1 min-w-[120px] py-3 px-4 rounded-xl font-bold border-2 text-xs uppercase tracking-wider transition-all bg-red-600 border-red-600 text-white shadow-md shadow-red-100"
      : "flex-1 min-w-[120px] py-3 px-4 rounded-xl font-bold border-2 text-xs uppercase tracking-wider transition-all bg-white border-slate-200 text-red-600 hover:border-red-300 hover:bg-red-50/20";
  }
  
  // Fallback for any other option
  return isSelected
    ? "flex-1 min-w-[120px] py-3 px-4 rounded-xl font-bold border-2 text-xs uppercase tracking-wider transition-all bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-100"
    : "flex-1 min-w-[120px] py-3 px-4 rounded-xl font-bold border-2 text-xs uppercase tracking-wider transition-all bg-white border-slate-200 text-slate-500 hover:border-emerald-300";
};

const getBadgeColorClasses = (value: any, isCompliant: boolean) => {
  if (value === undefined || value === null) return "px-4 py-2 rounded-xl text-sm font-black uppercase inline-block bg-slate-500 text-white";
  const valStr = String(value).toLowerCase();
  
  // Pouco sujo / conforme
  if (valStr.includes('pouco sujo') || valStr.includes('pouco suja') || valStr.includes('pouco') || valStr === 'limpo' || valStr === 'limpa' || valStr === 'conforme' || valStr === 'ok') {
    return "px-4 py-2 rounded-xl text-sm font-black uppercase inline-block bg-emerald-500 text-white shadow-sm shadow-emerald-100";
  }
  
  // Sujo / amarelo / amarelado
  if (valStr === 'sujo' || valStr === 'suja' || valStr.includes('amarelo') || valStr.includes('suj')) {
    return "px-4 py-2 rounded-xl text-sm font-black uppercase inline-block bg-yellow-400 text-yellow-950 border border-yellow-500 shadow-sm shadow-yellow-50";
  }
  
  // Tamponado / vermelho / muito sujo
  if (valStr.includes('tamponado') || valStr.includes('tamponada') || valStr.includes('muito sujo') || valStr.includes('muito suja') || valStr === 'not_ok' || valStr === 'não conforme' || valStr === 'nao conforme' || valStr === 'nok' || valStr === 'vermelho') {
    return "px-4 py-2 rounded-xl text-sm font-black uppercase inline-block bg-rose-600 text-white shadow-md shadow-rose-100";
  }
  
  // Fallback depending on compliant
  return isCompliant 
    ? "px-4 py-2 rounded-xl text-sm font-black uppercase inline-block bg-emerald-500 text-white" 
    : "px-4 py-2 rounded-xl text-sm font-black uppercase inline-block bg-rose-500 text-white";
};

const getIconColorClasses = (value: any, isCompliant: boolean) => {
  if (value === undefined || value === null) return "w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm bg-slate-50 text-slate-600";
  const valStr = String(value).toLowerCase();
  
  if (valStr.includes('pouco sujo') || valStr.includes('pouco suja') || valStr.includes('pouco') || valStr === 'limpo' || valStr === 'limpa' || valStr === 'conforme' || valStr === 'ok') {
    return "w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm bg-emerald-50 text-emerald-600 border border-emerald-200";
  }
  if (valStr === 'sujo' || valStr === 'suja' || valStr.includes('amarelo') || valStr.includes('suj')) {
    return "w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm bg-yellow-50 text-yellow-600 border border-yellow-200";
  }
  if (valStr.includes('tamponado') || valStr.includes('tamponada') || valStr.includes('muito sujo') || valStr.includes('muito suja') || valStr === 'not_ok' || valStr === 'não conforme' || valStr === 'nao conforme' || valStr === 'nok' || valStr === 'vermelho') {
    return "w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm bg-rose-50 text-rose-600 border border-rose-200";
  }
  return isCompliant 
    ? "w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm bg-emerald-50 text-emerald-600" 
    : "w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm bg-rose-50 text-rose-600";
};

const Quality: React.FC = () => {
  const { user, profile, isManager, isAdmin, isMaster } = useAuth();
  const [activeTab, setActiveTab] = useState<QualityTab>('perform');
  const [templates, setTemplates] = useState<QualityChecklistTemplate[]>([]);
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [sectors, setSectors] = useState<QualitySector[]>([]);
  const [optionSets, setOptionSets] = useState<QualityChecklistOptionSet[]>([]);
  const [submissions, setSubmissions] = useState<QualityChecklistSubmission[]>([]);
  const [omissions, setOmissions] = useState<QualityChecklistOmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingSubmission, setViewingSubmission] = useState<QualityChecklistSubmission | null>(null);

  // Performance Filtering
  const [selectedLineId, setSelectedLineId] = useState<string>('');

  // For Line Management
  const [isAddingLine, setIsAddingLine] = useState(false);
  const [editingLine, setEditingLine] = useState<ProductionLine | null>(null);
  const [newLine, setNewLine] = useState<Partial<ProductionLine>>({
    name: '',
    active: true
  });

  // For Sector Management
  const [isAddingSector, setIsAddingSector] = useState(false);
  const [editingSector, setEditingSector] = useState<QualitySector | null>(null);
  const [newSector, setNewSector] = useState<Partial<QualitySector>>({
    name: '',
    lineIds: [],
    active: true
  });

  // For Option Set Management
  const [isAddingOptionSet, setIsAddingOptionSet] = useState(false);
  const [editingOptionSet, setEditingOptionSet] = useState<QualityChecklistOptionSet | null>(null);
  const [newOptionSet, setNewOptionSet] = useState<Partial<QualityChecklistOptionSet>>({
    name: '',
    options: ['OK', 'NÃO OK'],
    active: true
  });

  // For Template Creation
  const [isAddingTemplate, setIsAddingTemplate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<QualityChecklistTemplate | null>(null);
  const [newTemplate, setNewTemplate] = useState<Partial<QualityChecklistTemplate>>({
    name: '',
    description: '',
    sectorId: '',
    frequencyPerShift: 1,
    items: [],
    active: true
  });

  // For Template Deletion
  const [templateToDelete, setTemplateToDelete] = useState<QualityChecklistTemplate | null>(null);
  const [submissionToDelete, setSubmissionToDelete] = useState<QualityChecklistSubmission | null>(null);
  const [sectorToDelete, setSectorToDelete] = useState<QualitySector | null>(null);
  const [optionSetToDelete, setOptionSetToDelete] = useState<any | null>(null);
  const [lineToDelete, setLineToDelete] = useState<ProductionLine | null>(null);
  const [selectedDryerSubId, setSelectedDryerSubId] = useState<string>('');

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

  const closeModal = () => setModalConfig(prev => ({ ...prev, isOpen: false }));

  useEffect(() => {
    const dryerSubs = submissions.filter(sub => {
      const template = templates.find(t => t.id === sub.templateId);
      return template?.name.toLowerCase().includes('limpeza') || template?.name.toLowerCase().includes('secador');
    });
    if (dryerSubs.length > 0) {
      if (!selectedDryerSubId || !dryerSubs.some(s => s.id === selectedDryerSubId)) {
        setSelectedDryerSubId(dryerSubs[0].id);
      }
    }
  }, [submissions, templates, selectedDryerSubId]);

  useEffect(() => {
    if (!user) return;

    const unsubTemplates = onSnapshot(collection(db, 'quality_checklist_templates'), async (snapshot) => {
      const fetchedTemplates = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as QualityChecklistTemplate));
      setTemplates(fetchedTemplates);
      
      const hasDryerTemplate = fetchedTemplates.some(t => t.name.toLowerCase().includes('limpeza') || t.name.toLowerCase().includes('secador'));
      if (!hasDryerTemplate) {
        try {
          const sectorsSnap = await getDocs(collection(db, 'quality_sectors'));
          const sectorsList = sectorsSnap.docs.map(d => ({ id: d.id, ...d.data() } as QualitySector));
          let targetSectorId = 'all';
          const secagemSec = sectorsList.find(s => s.name.toLowerCase().includes('secagem') || s.name.toLowerCase().includes('secador'));
          if (secagemSec) {
            targetSectorId = secagemSec.id;
          }
          
          const optionsSnap = await getDocs(collection(db, 'quality_checklist_options'));
          const optionsList = optionsSnap.docs.map(d => ({ id: d.id, ...d.data() } as QualityChecklistOptionSet));
          const optSet = optionsList.find(o => o.name.toLowerCase().includes('limpeza') || o.name.toLowerCase().includes('secador'));
          
          if (optSet) {
            const items = [];
            for (let door = 0; door < 24; door++) {
              for (const level of ['A', 'B', 'C', 'D']) {
                items.push({
                  id: `door_${door}_level_${level.toLowerCase()}`,
                  label: `Porta ${door} - Nivel ${level}`,
                  type: "condition",
                  required: false,
                  conditionOptionsId: optSet.id,
                  allowObservation: true
                });
              }
            }
            await addDoc(collection(db, 'quality_checklist_templates'), {
              name: "Inspeção de Limpeza do Secador",
              description: "Monitoramento de conformidade da limpeza do secador de celulose em 4 níveis de criticidade por porta.",
              sectorId: targetSectorId,
              frequencyPerShift: 1,
              active: true,
              createdBy: user?.uid || 'system',
              createdAt: serverTimestamp(),
              items: items
            });
            console.log("Seeded Dryer Cleanliness template with 96 items successfully.");
          }
        } catch (err) {
          console.error("Error auto-seeding template:", err);
        }
      } else {
        // If it exists but has very few items (e.g. only 1), expand it to 96 items
        const dryerTemplate = fetchedTemplates.find(t => t.name.toLowerCase().includes('limpeza') || t.name.toLowerCase().includes('secador'));
        if (dryerTemplate && dryerTemplate.items.length < 5) {
          try {
            const optionsSnap = await getDocs(collection(db, 'quality_checklist_options'));
            const optionsList = optionsSnap.docs.map(d => ({ id: d.id, ...d.data() } as QualityChecklistOptionSet));
            const optSet = optionsList.find(o => o.name.toLowerCase().includes('limpeza') || o.name.toLowerCase().includes('secador'));
            if (optSet) {
              const items = [];
              for (let door = 0; door < 24; door++) {
                for (const level of ['A', 'B', 'C', 'D']) {
                  items.push({
                    id: `door_${door}_level_${level.toLowerCase()}`,
                    label: `Porta ${door} - Nivel ${level}`,
                    type: "condition",
                    required: false,
                    conditionOptionsId: optSet.id,
                    allowObservation: true
                  });
                }
              }
              await updateDoc(doc(db, 'quality_checklist_templates', dryerTemplate.id), {
                items: items
              });
              console.log("Successfully updated existing dryer template to 96 items.");
            }
          } catch (err) {
            console.error("Error expanding existing dryer template:", err);
          }
        }
      }
    }, (error) => console.error("Error in quality_checklist_templates listener:", error));

    const unsubLines = onSnapshot(collection(db, 'production_lines'), (snapshot) => {
      const activeLines = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as ProductionLine))
        .filter(l => l.active);
      activeLines.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      setLines(activeLines);
    }, (error) => console.error("Error in production_lines listener (quality):", error));

    const unsubSectors = onSnapshot(collection(db, 'quality_sectors'), async (snapshot) => {
      const activeSectors = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as QualitySector));
      activeSectors.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      setSectors(activeSectors);

      const hasDryerSector = activeSectors.some(s => s.name.toLowerCase().includes('secagem') || s.name.toLowerCase().includes('secador'));
      if (!hasDryerSector) {
        try {
          await addDoc(collection(db, 'quality_sectors'), {
            name: "Secagem e Acabamento",
            lineIds: [],
            active: true,
            createdAt: serverTimestamp()
          });
        } catch (err) {
          console.error("Error auto-seeding sector:", err);
        }
      }
    }, (error) => console.error("Error in quality_sectors listener:", error));

    const unsubOptionSets = onSnapshot(collection(db, 'quality_checklist_options'), async (snapshot) => {
      const fetchedOptionSets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as QualityChecklistOptionSet));
      setOptionSets(fetchedOptionSets);

      const hasDryerLimpeza = fetchedOptionSets.some(os => os.name.toLowerCase().includes('limpeza'));
      if (!hasDryerLimpeza) {
        try {
          await addDoc(collection(db, 'quality_checklist_options'), {
            name: "Nível de Limpeza de Secador",
            options: ["Pouco Sujo", "Sujo", "Tamponado"],
            active: true,
            createdAt: serverTimestamp()
          });
          console.log("Seeded Nível de Limpeza de Secador option set.");
        } catch (err) {
          console.error("Error auto-seeding option set:", err);
        }
      } else {
        const dryerOs = fetchedOptionSets.find(os => os.name.toLowerCase().includes('limpeza'));
        if (dryerOs && (!dryerOs.options.includes('Tamponado') || dryerOs.options.includes('Limpo') || dryerOs.options.includes('Muito Sujo') || dryerOs.options.length !== 3)) {
          try {
            await updateDoc(doc(db, 'quality_checklist_options', dryerOs.id), {
              options: ["Pouco Sujo", "Sujo", "Tamponado"]
            });
            console.log("Updated existing option set to Pouco Sujo, Sujo, Tamponado.");
          } catch (err) {
            console.error("Error updating existing options:", err);
          }
        }
      }
    }, (error) => console.error("Error in quality_checklist_options listener:", error));

    const baseSubQuery = collection(db, 'quality_checklist_submissions');
    const subQuery = query(baseSubQuery, orderBy('createdAt', 'desc'));

    const unsubSubmissions = onSnapshot(subQuery, async (snapshot) => {
      const mapped = await Promise.all(snapshot.docs.map(async (doc) => {
        const data = doc.data() as any;
        const decName = await decryptValue(data.userName);
        return {
          id: doc.id,
          ...data,
          userName: decName
        } as QualityChecklistSubmission;
      }));
      setSubmissions(mapped);
    }, (error) => console.error("Error in quality_checklist_submissions listener:", error));

    const baseOmQuery = collection(db, 'quality_checklist_omissions');
    const omQuery = query(baseOmQuery, orderBy('createdAt', 'desc'));

    const unsubOmissions = onSnapshot(omQuery, async (snapshot) => {
      const mapped = await Promise.all(snapshot.docs.map(async (doc) => {
        const data = doc.data() as any;
        const decName = await decryptValue(data.userName);
        return {
          id: doc.id,
          ...data,
          userName: decName
        } as QualityChecklistOmission;
      }));
      setOmissions(mapped);
    }, (error) => console.error("Error in quality_checklist_omissions listener:", error));

    setLoading(false);

    return () => {
      unsubTemplates();
      unsubLines();
      unsubSectors();
      unsubOptionSets();
      unsubSubmissions();
      unsubOmissions();
    };
  }, [user]);

  const handleSaveLine = async () => {
    if (!newLine.name) {
      setModalConfig({
        isOpen: true,
        title: 'Aviso',
        message: 'Preencha o nome da linha.',
        type: 'warning'
      });
      return;
    }

    try {
      if (editingLine) {
        await updateDoc(doc(db, 'production_lines', editingLine.id), {
          ...newLine,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'production_lines'), {
          ...newLine,
          active: true,
          createdAt: serverTimestamp()
        });
      }
      setIsAddingLine(false);
      setEditingLine(null);
      setNewLine({ name: '', active: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'production_lines');
    }
  };

  const handleSaveSector = async () => {
    if (!newSector.name || !newSector.lineIds?.length) {
      setModalConfig({
        isOpen: true,
        title: 'Aviso',
        message: 'Preencha o nome e selecione pelo menos uma linha.',
        type: 'warning'
      });
      return;
    }

    try {
      if (editingSector) {
        await updateDoc(doc(db, 'quality_sectors', editingSector.id), {
          ...newSector,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'quality_sectors'), {
          ...newSector,
          active: true,
          createdAt: serverTimestamp()
        });
      }
      setIsAddingSector(false);
      setEditingSector(null);
      setNewSector({ name: '', lineIds: [], active: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'quality_sectors');
    }
  };

  const handleSaveOptionSet = async () => {
    if (!newOptionSet.name || !newOptionSet.options?.length) {
      setModalConfig({
        isOpen: true,
        title: 'Aviso',
        message: 'Preencha o nome e adicione pelo menos uma opção.',
        type: 'warning'
      });
      return;
    }

    try {
      if (editingOptionSet) {
        await updateDoc(doc(db, 'quality_checklist_options', editingOptionSet.id), {
          ...newOptionSet,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'quality_checklist_options'), {
          ...newOptionSet,
          active: true,
          createdAt: serverTimestamp()
        });
      }
      setIsAddingOptionSet(false);
      setEditingOptionSet(null);
      setNewOptionSet({ name: '', options: ['OK', 'NÃO OK'], active: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'quality_checklist_options');
    }
  };

  const handleSaveTemplate = async () => {
    if (!newTemplate.name || !newTemplate.sectorId || !newTemplate.items?.length) {
      setModalConfig({
        isOpen: true,
        title: 'Aviso',
        message: 'Preencha os campos obrigatórios e adicione pelo menos um item.',
        type: 'warning'
      });
      return;
    }

    try {
      if (editingTemplate) {
        await updateDoc(doc(db, 'quality_checklist_templates', editingTemplate.id), {
          ...newTemplate,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'quality_checklist_templates'), {
          ...newTemplate,
          createdBy: user?.uid,
          createdAt: serverTimestamp()
        });
      }
      setIsAddingTemplate(false);
      setEditingTemplate(null);
      setNewTemplate({
        name: '',
        description: '',
        sectorId: '',
        frequencyPerShift: 1,
        items: [],
        active: true
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'quality_checklist_templates');
    }
  };

  const addItemToTemplate = () => {
    const newItem: ChecklistItemDefinition = {
      id: Math.random().toString(36).substring(7),
      label: '',
      type: 'condition',
      required: true
    };
    setNewTemplate(prev => ({
      ...prev,
      items: [...(prev.items || []), newItem]
    }));
  };

  const removeItemFromTemplate = (id: string) => {
    setNewTemplate(prev => ({
      ...prev,
      items: prev.items?.filter(item => item.id !== id)
    }));
  };

  const updateItemInTemplate = (id: string, updates: Partial<ChecklistItemDefinition>) => {
    setNewTemplate(prev => ({
      ...prev,
      items: prev.items?.map(item => item.id === id ? { ...item, ...updates } : item)
    }));
  };

  // Perform Checklist Logic
  const [fillingTemplate, setFillingTemplate] = useState<QualityChecklistTemplate | null>(null);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [observations, setObservations] = useState<Record<string, string>>({});
  const [submissionLineId, setSubmissionLineId] = useState<string>('');
  const [activeScanner, setActiveScanner] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    let scanner: Html5Qrcode | null = null;

    if (activeScanner) {
      setCameraError(null);
      // Small delay to ensure the DOM element is rendered
      const timer = setTimeout(() => {
        const element = document.getElementById("qr-reader");
        if (!element) return;

        scanner = new Html5Qrcode("qr-reader");
        scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          },
          (decodedText) => {
            setResponses(prev => ({ ...prev, [activeScanner]: decodedText }));
            setActiveScanner(null);
          },
          (errorMessage) => {
            // ignore common errors
          }
        ).catch(err => {
          console.error("Scanner error:", err);
          if (err?.toString().includes("NotAllowedError")) {
            setCameraError("Acesso à câmera negado. Por favor, permita o acesso nas configurações do seu navegador.");
          } else {
            setCameraError("Erro ao iniciar a câmera. Verifique se outro aplicativo está usando a câmera.");
          }
        });
      }, 500);

      return () => {
        clearTimeout(timer);
        if (scanner && scanner.isScanning) {
          scanner.stop().then(() => {
            scanner?.clear();
          }).catch(err => console.error("Stop scanner error:", err));
        }
      };
    }
  }, [activeScanner]);

  const generateRangeOptions = (min?: number, max?: number, step?: number) => {
    if (min === undefined || max === undefined) return [];
    
    // If both are integers and no step provided, default to 1
    const isIntegerRange = Number.isInteger(min) && Number.isInteger(max);
    const s = step || (isIntegerRange ? 1 : 0.01);
    
    const options = [];
    // Limit to 200 options to avoid browser hang
    let current = min;
    while (current <= max && options.length < 500) {
      options.push(current);
      current = parseFloat((current + s).toFixed(4));
    }
    return options;
  };

  const handleSubmitChecklist = async () => {
    if (!fillingTemplate || !user || !profile) return;

    if (!submissionLineId && (fillingTemplate.sectorId === 'all' || sectors.some(s => s.id === fillingTemplate.sectorId))) {
      setModalConfig({
        isOpen: true,
        title: 'Aviso',
        message: 'Por favor, selecione qual linha está sendo inspecionada.',
        type: 'warning'
      });
      return;
    }

    // Validate requirements
    const missing = fillingTemplate.items.find(item => item.required && !responses[item.id]);
    if (missing) {
      setModalConfig({
        isOpen: true,
        title: 'Item Obrigatório',
        message: `O item "${missing.label}" é obrigatório.`,
        type: 'warning'
      });
      return;
    }

    // Shift frequency validation
    const currentShiftName = getCurrentShift();
    const currentGroup = getGroupForShift(new Date(), currentShiftName);
    const shiftIdentifier = `${currentGroup} - ${currentShiftName}`;
    const todayStr = new Date().toISOString().split('T')[0];

    const existingSubmissions = submissions.filter(sub => 
      sub.templateId === fillingTemplate.id && 
      (sub.lineId === submissionLineId || sub.lineId === fillingTemplate.sectorId) &&
      sub.shift === shiftIdentifier &&
      (safeToDate(sub.createdAt) || new Date()).toISOString().split('T')[0] === todayStr
    );

    if (existingSubmissions.length >= fillingTemplate.frequencyPerShift) {
      setModalConfig({
        isOpen: true,
        title: 'Limite Atingido',
        message: `Este checklist já foi realizado ${fillingTemplate.frequencyPerShift} vez(es) neste turno. Limite atingido.`,
        type: 'info'
      });
      return;
    }

    const targetLineId = submissionLineId || fillingTemplate.sectorId;
    const lineObj = lines.find(l => l.id === targetLineId) || sectors.find(s => s.id === targetLineId);
    const lineSuffix = lineObj ? ` para a ${lineObj.name}` : '';

    setModalConfig({
      isOpen: true,
      title: 'Confirmar Envio?',
      message: `Deseja realmente concluir e transmitir as respostas deste checklist de qualidade${lineSuffix}?`,
      type: 'info',
      showConfirmButton: true,
      confirmText: 'Sim, Enviar',
      onConfirm: async () => {
        closeModal();
        try {
          const encName = await encryptValue(profile.displayName || user.email);
          await addDoc(collection(db, 'quality_checklist_submissions'), {
            templateId: fillingTemplate.id,
            sectorId: fillingTemplate.sectorId,
            lineId: targetLineId,
            userId: user.uid,
            userName: encName,
            shift: shiftIdentifier, // Format: "A - Turno 1"
            responses: Object.entries(responses).map(([itemId, value]) => ({ 
              itemId, 
              value,
              observation: observations[itemId] || ''
            })),
            createdAt: serverTimestamp()
          });
          
          setFillingTemplate(null);
          setResponses({});
          setObservations({});
          setSubmissionLineId('');
          
          setModalConfig({
            isOpen: true,
            title: 'Check-list Enviado',
            message: `O check-list de qualidade${lineSuffix} foi enviado com sucesso!`,
            type: 'success'
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, 'quality_checklist_submissions');
        }
      }
    });
  };

  // Omission / Justification logic
  const [pendingOmissions, setPendingOmissions] = useState<any[]>([]);
  const [justifyingOmission, setJustifyingOmission] = useState<any | null>(null);
  const [justification, setJustification] = useState('');

  useEffect(() => {
    const checkOmissions = async () => {
      if (!templates.length) return;
      if (!profile && !isAdmin && !isManager) return;

      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      
      const activeTemplates = templates.filter(t => t.active);
      const pending = [];

      // Check last 2 days
      for (let i = 0; i < 2; i++) {
        const d = new Date(today.getTime() - i * 86400000);
        const dStr = d.toISOString().split('T')[0];
        const shifts: Shift[] = ['Turno 1', 'Turno 2', 'Turno 3'];
        
        for (const s of shifts) {
          const groupToWork = getGroupForShift(d, s);
          const shiftIdentifier = `${groupToWork} - ${s}`;
          
          if (groupToWork === profile?.group || isAdmin || isManager) {
            const shiftEndHours = s === 'Turno 1' ? 8 : (s === 'Turno 2' ? 16 : 24);
            const shiftEndTime = new Date(d);
            shiftEndTime.setHours(shiftEndHours, 0, 0, 0);

            if (Date.now() > shiftEndTime.getTime()) {
              for (const template of activeTemplates) {
                // Determine target line IDs for this template
                const targetLineIds = template.sectorId === 'all'
                  ? lines.map(l => l.id)
                  : sectors.find(sec => sec.id === template.sectorId)?.lineIds || [];

                for (const lineId of targetLineIds) {
                  const lineObj = lines.find(l => l.id === lineId);
                  if (!lineObj) continue;

                  const count = submissions.filter(sub => 
                    sub.templateId === template.id && 
                    sub.lineId === lineId &&
                    sub.shift === shiftIdentifier &&
                    (safeToDate(sub.createdAt) || new Date()).toISOString().split('T')[0] === dStr
                  ).length;

                  if (count < template.frequencyPerShift) {
                    const wasJustified = omissions.some(o => 
                      o.templateId === template.id && 
                      o.lineId === lineId &&
                      o.date === dStr &&
                      o.shift === shiftIdentifier
                    );

                    if (!wasJustified) {
                      pending.push({
                        template,
                        lineId,
                        lineName: lineObj.name,
                        date: dStr,
                        shift: shiftIdentifier,
                        missing: template.frequencyPerShift - count
                      });
                    }
                  }
                }
              }
            }
          }
        }

      }
      setPendingOmissions(pending);
    };

    if (activeTab === 'perform' || activeTab === 'omissions') {
      checkOmissions();
    }
  }, [templates, submissions, omissions, lines, sectors, profile, user, activeTab, isAdmin, isManager]);

  const handleSaveJustification = async () => {
    if (!justifyingOmission || !justification.trim() || !user) return;

    try {
      const authorName = profile?.displayName || user.displayName || user.email || 'Usuário';
      const encName = await encryptValue(authorName);
      await addDoc(collection(db, 'quality_checklist_omissions'), {
        userId: user.uid,
        userName: encName,
        templateId: justifyingOmission.template.id,
        templateName: justifyingOmission.template.name,
        lineId: justifyingOmission.lineId || '',
        lineName: justifyingOmission.lineName || '',
        date: justifyingOmission.date,
        shift: justifyingOmission.shift,
        justification: justification.trim(),
        createdAt: serverTimestamp()
      });
      
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          lastOmissionJustifiedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } catch (updErr) {
        console.warn("Could not update user document lastOmissionJustifiedAt:", updErr);
      }

      setJustifyingOmission(null);
      setJustification('');
      setModalConfig({
        isOpen: true,
        title: 'Sucesso',
        message: 'A justificativa de omissão foi enviada com sucesso.',
        type: 'success'
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'quality_checklist_omissions');
    }
  };

  const isResponseCompliant = (itemId: string, value: any, template: QualityChecklistTemplate) => {
    const item = template.items.find(i => i.id === itemId);
    if (!item) return true;

    const isDryer = template.name.toLowerCase().includes('limpeza') || template.name.toLowerCase().includes('secador');
    if (isDryer && value) {
      const lowerVal = String(value).toLowerCase();
      if (lowerVal.includes('pouco') || lowerVal === 'pouco sujo' || lowerVal === 'pouco suja' || lowerVal.includes('limp')) {
        return true;
      }
      if (lowerVal.includes('suj') || lowerVal.includes('tamponado') || lowerVal.includes('tamponada') || lowerVal.includes('vermelho')) {
        return false;
      }
    }

    if (item.type === 'condition') {
      // If custom options are used
      if (item.conditionOptionsId) {
        const optionSet = optionSets.find(os => os.id === item.conditionOptionsId);
        if (optionSet && optionSet.options.length > 0) {
          // Heuristic: First option is usually the compliant one (e.g., "OK", "CONFORME", "SIM")
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

    if (item.type === 'number') {
      if (value === undefined || value === null || value === '') return true;
      const numValue = Number(value);
      if (!isNaN(numValue)) {
        if (item.min !== undefined && numValue < item.min) return false;
        if (item.max !== undefined && numValue > item.max) return false;
      }
    }

    return true;
  };

  const calculateComplianceRate = () => {
    if (submissions.length === 0) return 0;
    
    let totalItemsChecked = 0;
    let compliantItemsCount = 0;

    submissions.forEach(sub => {
      const template = templates.find(t => t.id === sub.templateId);
      if (!template) return;

      sub.responses.forEach(resp => {
        // Some items might be optional or just info, but usually all in checklist are "compliance items"
        totalItemsChecked++;
        if (isResponseCompliant(resp.itemId, resp.value, template)) {
          compliantItemsCount++;
        }
      });
    });

    if (totalItemsChecked === 0) return 0;
    return (compliantItemsCount / totalItemsChecked) * 100;
  };

  
  // Helper to sanitize Portuguese accented characters for jsPDF text drawing
  const sanitizePdfText = (text: string | null | undefined): string => {
    if (!text) return '';
    return String(text)
      .replace(/[áàâãä]/g, 'a')
      .replace(/[ÁÀÂÃÄ]/g, 'A')
      .replace(/[éèêë]/g, 'e')
      .replace(/[ÉÈÊË]/g, 'E')
      .replace(/[íìîï]/g, 'i')
      .replace(/[ÍÌÎÏ]/g, 'I')
      .replace(/[óòôõö]/g, 'o')
      .replace(/[ÓÒÔÕÖ]/g, 'O')
      .replace(/[úùûü]/g, 'u')
      .replace(/[ÚÙÛÜ]/g, 'U')
      .replace(/[ç]/g, 'c')
      .replace(/[Ç]/g, 'C')
      .replace(/[ñ]/g, 'n')
      .replace(/[Ñ]/g, 'N');
  };

  const complianceRate = calculateComplianceRate();

  // Function to generate and download PDF of a quality inspection submission
  const generateSubmissionPDF = (sub: QualityChecklistSubmission) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const template = templates.find(t => t.id === sub.templateId);
    const sectorName = sectors.find(s => s.id === sub.sectorId)?.name || 'Todos os Setores';
    const lineName = lines.find(l => l.id === sub.lineId)?.name || 'N/A';
    const isDryer = template?.name.toLowerCase().includes('limpeza') || template?.name.toLowerCase().includes('secador');
    
    // Header - Standardized Emerald Theme
    doc.setFillColor(5, 150, 105); // emerald-600
    doc.rect(0, 0, pageWidth, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(sanitizePdfText(template?.name || 'INSPEÇÃO DE QUALIDADE'), 14, 25);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(190, 242, 219); // light emerald
    const dateStr = safeToDate(sub.createdAt)?.toLocaleString('pt-BR') || '';
    doc.text(`Gerado em: ${dateStr}`, 14, 33);
    
    // Info Table
    const infoData = [
      ['Colaborador:', sanitizePdfText(sub.userName), 'Setor/Setor de Qualidade:', sanitizePdfText(sectorName)],
      ['Turno:', sanitizePdfText(sub.shift), 'Linha Inspecionada:', sanitizePdfText(lineName)],
      ['ID do Registro:', sub.id || 'N/A', 'Data de Criação:', dateStr]
    ];
    
    autoTable(doc, {
      startY: 45,
      body: infoData,
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 35 },
        1: { cellWidth: 60 },
        2: { fontStyle: 'bold', cellWidth: 45 },
        3: { fontStyle: 'bold' }
      }
    });
    
    // Title for checklist items
    doc.setTextColor(15, 23, 42); // slate-900
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Respostas Coletadas / Itens da Inspeção', 14, (doc as any).lastAutoTable.finalY + 15);
    
    // Checklist Items
    const itemsData = sub.responses.map((resp, idx) => {
      const item = template?.items.find(it => it.id === resp.itemId);
      const compliant = template ? isResponseCompliant(resp.itemId, resp.value, template) : true;
      const optSetName = item?.type === 'condition' 
        ? sanitizePdfText(optionSets.find(os => os.id === item.conditionOptionsId)?.name || 'OK/NOK')
        : 'N/A';
      
      const patternStr = item?.type === 'condition' ? `Opções (${optSetName})` :
                         item?.type === 'number' ? 'Numérico' :
                         item?.type === 'range' ? 'Range (Baixo/Alto)' :
                         item?.type === 'barcode' ? 'Código / QR' :
                         item?.type === 'text' ? 'Texto Livre' : 'N/A';
                         
      let valStr = String(resp.value);
      if (resp.value === 'ok') valStr = 'CONFORME (OK)';
      if (resp.value === 'not_ok') valStr = 'NÃO CONFORME (NOK)';
      
      const obsStr = resp.observation ? `Obs: ${resp.observation}` : '';
      const displayVal = obsStr ? `${valStr}\n${obsStr}` : valStr;
      
      return [
        idx + 1,
        sanitizePdfText(item?.label || 'Item Removido'),
        sanitizePdfText(patternStr),
        sanitizePdfText(displayVal),
        compliant ? 'CONFORME' : 'NAO CONFORME'
      ];
    });
    
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [['#', 'Item de Inspecao', 'Padrao / Tipo', 'Resposta / Observacao', 'Avaliacao']],
      body: itemsData,
      headStyles: { 
        fillColor: [241, 245, 249], 
        textColor: [71, 85, 105],
        fontStyle: 'bold'
      },
      styles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 60 },
        2: { cellWidth: 40 },
        3: { cellWidth: 50 },
        4: { halign: 'center', fontStyle: 'bold' }
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          if (data.cell.raw === 'NAO CONFORME') {
            data.cell.styles.textColor = [225, 29, 72]; // rose-600
          } else {
            data.cell.styles.textColor = [5, 150, 105]; // emerald-600
          }
        }
      }
    });
    
    if (isDryer) {
      doc.addPage();
      
      // Page 2 Header
      doc.setFillColor(5, 150, 105); // emerald-600
      doc.rect(0, 0, pageWidth, 25, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(sanitizePdfText('MAPEAMENTO VISUAL DE LIMPEZA DO SECADOR'), 14, 16);

      // Section 1: Statistical Summary (Status de Limpeza)
      let currentY = 35;
      doc.setTextColor(15, 23, 42); // slate-900
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(sanitizePdfText('Status de Limpeza do Secador (Geral)'), 14, currentY);

      let pocoSujoCount = 0;
      let sujoCount = 0;
      let tamponadoCount = 0;
      let totalCount = 0;

      sub.responses.forEach(resp => {
        if (resp.value) {
          const valStr = String(resp.value).toLowerCase();
          if (valStr.includes('pouco') || valStr === 'pouco sujo' || valStr === 'pouco suja') {
            pocoSujoCount++;
            totalCount++;
          } else if (valStr === 'sujo' || valStr === 'suja' || valStr.includes('amarelo')) {
            sujoCount++;
            totalCount++;
          } else if (valStr.includes('tamponado') || valStr.includes('tamponada') || valStr === 'vermelho') {
            tamponadoCount++;
            totalCount++;
          }
        }
      });
      
      const totalDryerResponses = totalCount || 1;
      const pctPocoSujo = ((pocoSujoCount / totalDryerResponses) * 100).toFixed(1);
      const pctSujo = ((sujoCount / totalDryerResponses) * 100).toFixed(1);
      const pctTamponado = ((tamponadoCount / totalDryerResponses) * 100).toFixed(1);

      const statsData = [
        [sanitizePdfText('Pouco Sujo (Verde)'), `${pocoSujoCount} de ${totalDryerResponses}`, `${pctPocoSujo}%`, sanitizePdfText('Inspecao Conforme / Pouco Acumulo')],
        [sanitizePdfText('Sujo (Amarelo)'), `${sujoCount} de ${totalDryerResponses}`, `${pctSujo}%`, sanitizePdfText('Necessita Limpeza em Breve')],
        [sanitizePdfText('Tamponado (Vermelho)'), `${tamponadoCount} de ${totalDryerResponses}`, `${pctTamponado}%`, sanitizePdfText('Intervencao Imediata / Obstruido')]
      ];

      autoTable(doc, {
        startY: currentY + 4,
        head: [[sanitizePdfText('Classificacao'), sanitizePdfText('Registros'), sanitizePdfText('Percentual'), sanitizePdfText('Status Operacional')]],
        body: statsData,
        theme: 'striped',
        styles: { fontSize: 9 },
        headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], fontStyle: 'bold' },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 0) {
            if (data.cell.raw.toString().includes('Pouco Sujo')) {
              data.cell.styles.textColor = [16, 185, 129]; // green
              data.cell.styles.fontStyle = 'bold';
            } else if (data.cell.raw.toString().includes('Sujo')) {
              data.cell.styles.textColor = [245, 158, 11]; // yellow/amber
              data.cell.styles.fontStyle = 'bold';
            } else if (data.cell.raw.toString().includes('Tamponado')) {
              data.cell.styles.textColor = [239, 68, 68]; // red
              data.cell.styles.fontStyle = 'bold';
            }
          }
        }
      });

      currentY = (doc as any).lastAutoTable.finalY + 12;

      // Draw Dryer Grid helper
      const drawDryerGrid = (
        title: string, 
        doors: number[], 
        startYPos: number
      ) => {
        doc.setTextColor(15, 23, 42); // slate-900
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(sanitizePdfText(title), 14, startYPos);

        const cellWidth = 13;
        const cellHeight = 7;
        const labelWidth = 22;
        const gridStartX = 14;
        const gridStartY = startYPos + 4;

        // Draw Header row (PORTAS, and door numbers)
        doc.setFillColor(219, 234, 254); // blue-100 (light blue)
        doc.rect(gridStartX, gridStartY, labelWidth + doors.length * cellWidth, cellHeight, 'F');
        
        doc.setTextColor(30, 41, 59); // slate-800
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('PORTAS', gridStartX + 2, gridStartY + 5);

        doors.forEach((doorNum, colIdx) => {
          const x = gridStartX + labelWidth + colIdx * cellWidth;
          doc.text(String(doorNum).padStart(2, '0'), x + cellWidth / 2, gridStartY + 5, { align: 'center' });
        });

        // Draw rows for Nível A, B, C, D
        const levels = ['A', 'B', 'C', 'D'];
        levels.forEach((level, rowIdx) => {
          const y = gridStartY + (rowIdx + 1) * cellHeight;
          
          // Label column
          doc.setFillColor(219, 234, 254); // blue-100
          doc.rect(gridStartX, y, labelWidth, cellHeight, 'F');
          doc.setTextColor(30, 41, 59);
          doc.setFont('helvetica', 'bold');
          doc.text(`Nivel ${level}`, gridStartX + 2, y + 5);

          doors.forEach((doorNum, colIdx) => {
            const x = gridStartX + labelWidth + colIdx * cellWidth;
            
            // Get the response for this specific door and level
            const respId = `door_${doorNum}_level_${level.toLowerCase()}`;
            const response = sub.responses.find(r => r.itemId === respId || r.itemId.includes(`_${doorNum}_level_${level.toLowerCase()}`));
            
            const valStr = response ? String(response.value).toLowerCase() : '';
            
            let fillColor = [255, 255, 255]; // white (default)
            let textColor = [30, 41, 59];
            let valLabel = '';

            if (valStr.includes('pouco') || valStr === 'pouco sujo' || valStr === 'pouco suja') {
              fillColor = [16, 185, 129]; // Green (Pouco sujo)
              textColor = [255, 255, 255];
              valLabel = '3';
            } else if (valStr === 'sujo' || valStr === 'suja' || valStr.includes('amarelo')) {
              fillColor = [245, 158, 11]; // Yellow (Sujo)
              textColor = [255, 255, 255];
              valLabel = '2';
            } else if (valStr.includes('tamponado') || valStr.includes('tamponada') || valStr === 'vermelho') {
              fillColor = [239, 68, 68]; // Red (Tamponado)
              textColor = [255, 255, 255];
              valLabel = '1';
            }

            // Draw cell background
            doc.setFillColor(fillColor[0], fillColor[1], fillColor[2]);
            doc.rect(x, y, cellWidth, cellHeight, 'F');

            // Draw cell border
            doc.setDrawColor(148, 163, 184); // slate-400
            doc.setLineWidth(0.1);
            doc.rect(x, y, cellWidth, cellHeight, 'D');

            // Draw cell value label (1, 2, 3)
            if (valLabel) {
              doc.setTextColor(textColor[0], textColor[1], textColor[2]);
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(8);
              doc.text(valLabel, x + cellWidth / 2, y + 5, { align: 'center' });
            }
          });
        });

        // Draw border around the entire label col
        doc.setDrawColor(148, 163, 184);
        doc.setLineWidth(0.2);
        doc.rect(gridStartX, gridStartY, labelWidth, cellHeight * 5, 'D');

        return gridStartY + cellHeight * 5 + 6; // Return next Y position
      };

      // Section 2: Comando Side (Even Doors)
      const evenDoors = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 00];
      currentY = drawDryerGrid('Secador MS1 - Lado de Comando (Portas Pares)', evenDoors, currentY);

      // Section 3: Acionamento Side (Odd Doors)
      const oddDoors = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23];
      currentY = drawDryerGrid('Secador MS1 - Lado de Acionamento (Portas Ímpares)', oddDoors, currentY);

      // Legend
      doc.setTextColor(71, 85, 105);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(sanitizePdfText('Legenda de Classificação de Sujidade:'), 14, currentY);

      doc.setFillColor(16, 185, 129); // Green
      doc.rect(14, currentY + 2, 6, 4, 'F');
      doc.setTextColor(30, 41, 59);
      doc.text(sanitizePdfText('Pouco Sujo (Codigo 3) - Verde'), 22, currentY + 5);

      doc.setFillColor(245, 158, 11); // Yellow
      doc.rect(80, currentY + 2, 6, 4, 'F');
      doc.text(sanitizePdfText('Sujo (Codigo 2) - Amarelo'), 88, currentY + 5);

      doc.setFillColor(239, 68, 68); // Red
      doc.rect(140, currentY + 2, 6, 4, 'F');
      doc.text(sanitizePdfText('Tamponado (Codigo 1) - Vermelho'), 148, currentY + 5);
    }
    
    const fileName = `inspecao_qualidade_${sanitizePdfText(sub.userName).replace(/\s+/g, '_')}_${safeToDate(sub.createdAt)?.getTime()}.pdf`;
    doc.save(fileName);
  };

  // Calculate dryer cleaning levels statistics
  const dryerStats = (() => {
    let limpo = 0;
    let poucoSujo = 0;
    let sujo = 0;
    let muitoSujo = 0;
    
    submissions.forEach(sub => {
      sub.responses.forEach(resp => {
        if (resp.value) {
          const valLower = String(resp.value).toLowerCase();
          if (valLower === 'limpo' || valLower === 'limpa' || valLower === 'conforme' || valLower === 'ok') {
            limpo++;
          } else if (valLower.includes('pouco sujo') || valLower.includes('pouco suja') || valLower.includes('levemente sujo') || valLower.includes('levemente suja') || valLower.includes('pouco')) {
            poucoSujo++;
          } else if (valLower === 'sujo' || valLower === 'suja' || valLower.includes('amarelo forte')) {
            sujo++;
          } else if (valLower.includes('muito sujo') || valLower.includes('muito suja') || valLower === 'not_ok' || valLower === 'nok' || valLower.includes('não conforme') || valLower.includes('nao conforme') || valLower === 'não' || valLower === 'nao') {
            muitoSujo++;
          }
        }
      });
    });
    
    const total = limpo + poucoSujo + sujo + muitoSujo;
    return { limpo, poucoSujo, sujo, muitoSujo, total };
  })();

  // Group responses by door/port item
  const doorGroupedResponses = (() => {
    const groups: Record<string, { 
      itemId: string; 
      label: string; 
      templateName: string;
      latestValue: string; 
      latestDate: Date | null;
      latestUser: string;
      counts: { limpo: number; poucoSujo: number; sujo: number; muitoSujo: number; total: number };
      history: { date: Date | null; value: string; user: string; shift: string }[];
    }> = {};
    
    const sortedSubs = [...submissions].sort((a, b) => {
      const dateA = safeToDate(a.createdAt)?.getTime() || 0;
      const dateB = safeToDate(b.createdAt)?.getTime() || 0;
      return dateA - dateB;
    });
    
    sortedSubs.forEach(sub => {
      const template = templates.find(t => t.id === sub.templateId);
      const isDryerOrLimpeza = template?.name.toLowerCase().includes('limpeza') || template?.name.toLowerCase().includes('secador');
      
      sub.responses.forEach(resp => {
        const item = template?.items.find(it => it.id === resp.itemId);
        if (!item) return;
        
        const isPorta = item.label.toLowerCase().includes('porta') || item.label.toLowerCase().includes('limpeza') || isDryerOrLimpeza;
        if (!isPorta || item.type !== 'condition') return;
        
        const itemId = resp.itemId;
        const label = item.label;
        const valStr = String(resp.value);
        const subDate = safeToDate(sub.createdAt);
        
        if (!groups[itemId]) {
          groups[itemId] = {
            itemId,
            label,
            templateName: template.name,
            latestValue: valStr,
            latestDate: subDate,
            latestUser: sub.userName,
            counts: { limpo: 0, poucoSujo: 0, sujo: 0, muitoSujo: 0, total: 0 },
            history: []
          };
        }
        
        groups[itemId].latestValue = valStr;
        groups[itemId].latestDate = subDate;
        groups[itemId].latestUser = sub.userName;
        
        const valLower = valStr.toLowerCase();
        if (valLower === 'limpo' || valLower === 'limpa' || valLower === 'conforme' || valLower === 'ok') {
          groups[itemId].counts.limpo++;
        } else if (valLower.includes('pouco sujo') || valLower.includes('pouco suja') || valLower.includes('levemente sujo') || valLower.includes('levemente suja') || valLower.includes('pouco')) {
          groups[itemId].counts.poucoSujo++;
        } else if (valLower === 'sujo' || valLower === 'suja' || valLower.includes('amarelo forte')) {
          groups[itemId].counts.sujo++;
        } else if (valLower.includes('muito sujo') || valLower.includes('muito suja') || valLower === 'not_ok' || valLower === 'nok' || valLower.includes('não conforme') || valLower.includes('nao conforme') || valLower === 'não' || valLower === 'nao') {
          groups[itemId].counts.muitoSujo++;
        }
        groups[itemId].counts.total++;
        
        groups[itemId].history.push({
          date: subDate,
          value: valStr,
          user: sub.userName,
          shift: sub.shift
        });
      });
    });
    
    Object.values(groups).forEach(g => {
      g.history.sort((a, b) => {
        const timeA = a.date?.getTime() || 0;
        const timeB = b.date?.getTime() || 0;
        return timeB - timeA;
      });
    });
    
    return Object.values(groups);
  })();

  const dryerSubmissions = submissions.filter(sub => {
    const template = templates.find(t => t.id === sub.templateId);
    return template?.name.toLowerCase().includes('limpeza') || template?.name.toLowerCase().includes('secador');
  });

  const activeDryerSub = dryerSubmissions.find(s => s.id === selectedDryerSubId) || dryerSubmissions[0];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <ClipboardCheck className="w-10 h-10 text-emerald-600" />
            Qualidade de Processo
          </h1>
          <p className="text-slate-500 font-medium mt-1">Gestão de inspeções e conformidade.</p>
        </div>

        <div className="flex bg-slate-100 p-1.5 rounded-2xl overflow-x-auto max-w-full scrollbar-none whitespace-nowrap">
          <button
            onClick={() => setActiveTab('perform')}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-black transition-all shrink-0",
              activeTab === 'perform' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Realizar
          </button>
          {(isAdmin || isManager) && (
            <button
              onClick={() => setActiveTab('templates')}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-black transition-all shrink-0",
                activeTab === 'templates' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Modelos
            </button>
          )}
          {(isAdmin || isManager) && (
            <button
              onClick={() => setActiveTab('sectors')}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-black transition-all shrink-0",
                activeTab === 'sectors' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Setores
            </button>
          )}
          {(isAdmin || isManager) && (
            <button
              onClick={() => setActiveTab('options')}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-black transition-all shrink-0",
                activeTab === 'options' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Opções
            </button>
          )}
          <button
            onClick={() => setActiveTab('omissions')}
            className={cn(
              "px-3 py-2 rounded-xl text-sm font-black transition-all shrink-0",
              activeTab === 'omissions' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Justificativas
          </button>
          {(isAdmin || isManager) && (
            <button
              onClick={() => setActiveTab('dashboard')}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-black transition-all shrink-0",
                activeTab === 'dashboard' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Resultados
            </button>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'perform' && (
          <motion.div
            key="perform"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm space-y-4">
               <div>
                  <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">Informações do Turno Atual</h3>
                  <div className="flex flex-wrap gap-4">
                    <div className="bg-emerald-50 px-4 py-2 rounded-xl flex items-center gap-2 border border-emerald-100">
                      <Clock className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs font-black text-emerald-900 uppercase">
                        {getCurrentShift()}
                      </span>
                    </div>
                    <div className="bg-blue-50 px-4 py-2 rounded-xl flex items-center gap-2 border border-blue-100">
                      <Layers className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-black text-blue-900 uppercase">
                        Letra {getGroupForShift(new Date(), getCurrentShift())}
                      </span>
                    </div>
                  </div>
               </div>

               <div>
                  <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">Filtrar por Linha</h3>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setSelectedLineId('')}
                      className={cn(
                        "px-4 py-2 rounded-xl text-xs font-bold transition-all border",
                        selectedLineId === '' ? "bg-emerald-600 border-emerald-600 text-white" : "bg-slate-50 border-slate-100 text-slate-500 hover:border-emerald-200"
                      )}
                    >
                      Todas as Linhas
                    </button>
                    {lines.map(line => (
                      <button
                        key={line.id}
                        onClick={() => setSelectedLineId(line.id)}
                        className={cn(
                          "px-4 py-2 rounded-xl text-xs font-bold transition-all border",
                          selectedLineId === line.id ? "bg-emerald-600 border-emerald-600 text-white" : "bg-slate-50 border-slate-100 text-slate-500 hover:border-emerald-200"
                        )}
                      >
                        {line.name}
                      </button>
                    ))}
                  </div>
               </div>
            </div>

            {pendingOmissions.length > 0 && (
              <div className="bg-rose-50 border border-rose-200 p-8 rounded-[2rem] shadow-sm mb-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex gap-4">
                    <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center shrink-0">
                      <AlertCircle className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-rose-900">Inspeções Pendentes</h3>
                      <p className="text-rose-700/70 font-medium">
                        Você possui {pendingOmissions.length} turno{pendingOmissions.length > 1 ? 's' : ''} com inspeções incompletas que exigem justificativa.
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setActiveTab('omissions')}
                    className="bg-rose-600 text-white px-8 py-3 rounded-xl font-black shadow-lg shadow-rose-200 hover:bg-rose-700 transition-all flex items-center gap-2 group whitespace-nowrap"
                  >
                    Justificar Agora
                    <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            )}

            {fillingTemplate ? (
              <div className="bg-slate-50 border border-slate-200 rounded-[2.5rem] max-w-2xl mx-auto overflow-hidden shadow-xl">
                {/* VISUAL BRANDED FOREST GREEN HEADER BAR (Matches Operational Routes style!) */}
                <div className="bg-[#0d6e4f] text-white p-6 relative flex flex-col items-center justify-center text-center">
                  {/* Left Back Arrow icon */}
                  <button
                    onClick={() => {
                      setFillingTemplate(null);
                      setSubmissionLineId('');
                    }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-emerald-800 p-2 rounded-full transition-colors"
                    title="Voltar"
                  >
                    <ChevronLeft className="w-6 h-6 stroke-[3]" />
                  </button>

                  {/* Header Content Titles */}
                  <div className="space-y-0.5">
                    <h2 className="text-xs font-black tracking-widest uppercase opacity-90">CHECK-LIST DE QUALIDADE</h2>
                    <p className="text-base font-black tracking-wide uppercase leading-tight mt-0.5">{fillingTemplate.name}</p>
                    <p className="text-[10px] text-emerald-200 font-bold uppercase tracking-wider line-clamp-1 max-w-[320px] mx-auto">{fillingTemplate.description}</p>
                  </div>

                  {/* Right Close Button with safety modal */}
                  <button
                    onClick={() => {
                      setModalConfig({
                        isOpen: true,
                        title: 'Cancelar Preenchimento?',
                        message: 'Deseja realmente abandonar a execução deste check-list de qualidade? Todos os dados marcados serão perdidos.',
                        type: 'warning',
                        showConfirmButton: true,
                        confirmText: 'Sair e Descartar',
                        onConfirm: () => {
                          closeModal();
                          setFillingTemplate(null);
                          setResponses({});
                          setObservations({});
                          setSubmissionLineId('');
                        }
                      });
                    }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-emerald-800 p-2 rounded-full transition-colors"
                    title="Sair"
                  >
                    <X className="w-5 h-5 stroke-[2.5]" />
                  </button>
                </div>

                {/* PROGRESSIVE CONTAINER BLOCK */}
                <div className="p-6 md:p-8 bg-white space-y-6">
                  {/* Line Selection if Template covers multiple lines */}
                  {(fillingTemplate.sectorId === 'all' || sectors.some(s => s.id === fillingTemplate.sectorId)) && (
                    <div className="bg-slate-50 p-4 rounded-[1.5rem] border border-slate-200">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[#0d6e4f] ml-1 block mb-2 font-mono">Identifique a Linha Inspecionada</label>
                      <div className="flex flex-wrap gap-2">
                        {lines.filter(l => {
                          if (fillingTemplate.sectorId === 'all') return true;
                          const sector = sectors.find(s => s.id === fillingTemplate.sectorId);
                          return sector?.lineIds.includes(l.id);
                        }).map(line => {
                          const currentShift = getCurrentShift();
                          const currentGroup = getGroupForShift(new Date(), currentShift);
                          const shiftIdentifier = `${currentGroup} - ${currentShift}`;
                          const todayStr = new Date().toISOString().split('T')[0];

                          const lineSubmissionsCount = submissions.filter(sub => 
                            sub.templateId === fillingTemplate.id && 
                            sub.lineId === line.id &&
                            sub.shift === shiftIdentifier &&
                            (safeToDate(sub.createdAt) || new Date()).toISOString().split('T')[0] === todayStr
                          ).length;
                          const isLineCompleted = lineSubmissionsCount >= fillingTemplate.frequencyPerShift;

                          return (
                            <button
                              key={line.id}
                              type="button"
                              onClick={() => setSubmissionLineId(line.id)}
                              className={cn(
                                "px-4 py-2.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5",
                                submissionLineId === line.id 
                                  ? "bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-100" 
                                  : isLineCompleted
                                    ? "bg-slate-100 border-slate-200 text-slate-400 hover:bg-slate-200"
                                    : "bg-white border-slate-200 text-slate-700 hover:border-emerald-300"
                              )}
                            >
                              {isLineCompleted && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                              <span>{line.name}</span>
                              <span className="text-[10px] font-black opacity-60">
                                ({lineSubmissionsCount}/{fillingTemplate.frequencyPerShift}x)
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* PROGRESS BAR VISUAL INDICATOR */}
                  {(() => {
                    const answeredCount = fillingTemplate.items.filter(item => responses[item.id] !== undefined && responses[item.id] !== '').length;
                    const totalQuestionsCount = fillingTemplate.items.length;
                    const progressPct = totalQuestionsCount > 0 ? (answeredCount / totalQuestionsCount) * 100 : 0;
                    return (
                      <div className="bg-slate-50/50 p-4 border border-slate-150 rounded-[1.5rem] space-y-2">
                        <div className="flex justify-between items-center text-[10px] font-black text-slate-500 uppercase tracking-wider">
                          <span className="flex items-center gap-1.5 font-mono">
                            <Clock className="w-3.5 h-3.5 text-emerald-600" /> PROCESSO DE PREENCHIMENTO
                          </span>
                          <span className="text-emerald-700 font-extrabold">{answeredCount} de {totalQuestionsCount} respondidos ({Math.round(progressPct)}%)</span>
                        </div>
                        <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                          <div 
                            className="bg-emerald-500 h-full transition-all duration-300 rounded-full" 
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })()}

                  {/* ACCORDION ITEMS STREAM (Matches OperationalRoutes structure exactly) */}
                  <div className="space-y-3">
                    {fillingTemplate.items.map((item, idx) => {
                      const isExpanded = expandedItemId === item.id;
                      const isAnswered = responses[item.id] !== undefined && responses[item.id] !== '';
                      const currentValue = responses[item.id];

                      // Helper to advance to the next item
                      const advanceToNext = () => {
                        const nextIdx = idx + 1;
                        if (nextIdx < fillingTemplate.items.length) {
                          setExpandedItemId(fillingTemplate.items[nextIdx].id);
                        }
                      };

                      return (
                        <div
                          key={item.id || `item-${idx}`}
                          id={`focus-item-${item.id}`}
                          className={cn(
                            "border rounded-[1.5rem] overflow-hidden transition-all bg-white",
                            isAnswered ? "border-emerald-600/50 shadow-sm" : "border-slate-200",
                            isExpanded ? "ring-2 ring-emerald-600/30 border-emerald-600 shadow-md" : ""
                          )}
                        >
                          {/* Item Header */}
                          <div 
                            onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                            className="p-4 flex items-center justify-between gap-4 cursor-pointer select-none bg-white hover:bg-slate-50/50 transition-colors"
                          >
                            <div className="flex-1 flex items-center gap-3">
                              {/* Indicator badge circle style */}
                              <div className={cn(
                                "w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs shrink-0 transition-all",
                                isAnswered 
                                  ? "bg-emerald-100 text-emerald-800" 
                                  : "bg-slate-100 text-slate-500"
                              )}>
                                {isAnswered ? (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                ) : (
                                  idx + 1
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <h4 className="font-extrabold text-slate-800 text-xs md:text-sm leading-tight uppercase tracking-wide truncate max-w-[380px]">
                                  {item.label}
                                  {item.required && <span className="text-rose-500 ml-1 font-black">*</span>}
                                </h4>
                                {!isExpanded && isAnswered && (
                                  <p className="text-[9px] font-black text-emerald-700 uppercase tracking-widest mt-1 flex items-center gap-1.5 font-mono">
                                    <span>CONCLUÍDO</span>
                                    <span className="opacity-40">•</span>
                                    <span>VALOR: <strong className="bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-150">{String(currentValue).toUpperCase()}</strong></span>
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Chevron square button (Operational routes style!) */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedItemId(isExpanded ? null : item.id);
                              }}
                              className={cn(
                                "w-8 h-8 rounded-lg flex items-center justify-center transition-all shrink-0 text-white",
                                isExpanded ? "bg-emerald-800 rotate-180" : "bg-[#0d6e4f] hover:bg-emerald-800"
                              )}
                            >
                              <ChevronRight className="w-4 h-4 rotate-90 stroke-[3]" />
                            </button>
                          </div>

                          {/* Item Expanded contents */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="border-t border-slate-100 bg-slate-50/50 p-4 space-y-4"
                              >
                                {item.type === 'condition' && (
                                  <div className="flex flex-wrap gap-2.5">
                                    {item.conditionOptionsId ? (
                                      optionSets.find(s => s.id === item.conditionOptionsId)?.options.map((opt, optIdx) => (
                                        <button
                                          key={`${opt}-${optIdx}`}
                                          type="button"
                                          onClick={() => {
                                            setResponses(prev => ({ ...prev, [item.id]: opt }));
                                            setTimeout(advanceToNext, 250);
                                          }}
                                          className={getOptionColorClasses(opt, responses[item.id] === opt)}
                                        >
                                          {opt}
                                        </button>
                                      ))
                                    ) : (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setResponses(prev => ({ ...prev, [item.id]: 'ok' }));
                                            setTimeout(advanceToNext, 250);
                                          }}
                                          className={cn(
                                            "flex-1 py-3 px-4 rounded-xl font-black border-2 flex items-center justify-center gap-1.5 text-xs transition-all uppercase tracking-wider",
                                            responses[item.id] === 'ok' 
                                              ? "bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-100" 
                                              : "bg-white border-slate-200 text-slate-500 hover:border-emerald-300 hover:bg-emerald-50/10"
                                          )}
                                        >
                                          <CheckCircle2 className="w-4 h-4" />
                                          CONFORME (OK)
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setResponses(prev => ({ ...prev, [item.id]: 'not_ok' }));
                                            // Don't auto-advance on fail, let them type observation if they want
                                          }}
                                          className={cn(
                                            "flex-1 py-3 px-4 rounded-xl font-black border-2 flex items-center justify-center gap-1.5 text-xs transition-all uppercase tracking-wider",
                                            responses[item.id] === 'not_ok' 
                                              ? "bg-rose-600 border-rose-600 text-white shadow-md shadow-rose-100" 
                                              : "bg-white border-slate-200 text-slate-500 hover:border-rose-300 hover:bg-rose-50/10"
                                          )}
                                        >
                                          <AlertCircle className="w-4 h-4" />
                                          NÃO CONFORME
                                        </button>
                                      </>
                                    )}
                                  </div>
                                )}

                                {item.type === 'number' && (
                                  <div className="space-y-3">
                                    {item.isRangeDropdown ? (
                                      <select
                                        value={responses[item.id] || ''}
                                        onChange={(e) => {
                                          setResponses(prev => ({ ...prev, [item.id]: e.target.value }));
                                          // Simple change auto-advance if not empty
                                          if (e.target.value) {
                                            setTimeout(advanceToNext, 250);
                                          }
                                        }}
                                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/50 outline-none font-black text-sm appearance-none"
                                      >
                                        <option value="">Selecione o valor...</option>
                                        {generateRangeOptions(item.min, item.max, item.step).map(val => (
                                          <option key={val} value={val}>
                                            {val % 1 === 0 ? val : val.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                                          </option>
                                        ))}
                                      </select>
                                    ) : (
                                      <div className="relative group">
                                        <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-600 w-4 h-4" />
                                        <input
                                          type="number"
                                          step={item.isInteger ? "1" : (item.step || "0.01")}
                                          value={responses[item.id] || ''}
                                          onChange={(e) => setResponses(prev => ({ ...prev, [item.id]: e.target.value }))}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              advanceToNext();
                                            }
                                          }}
                                          placeholder={item.isInteger ? "Digite um número inteiro..." : "Digite o valor numérico..."}
                                          className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/30 outline-none font-bold text-xs"
                                        />
                                      </div>
                                    )}
                                  </div>
                                )}

                                {item.type === 'range' && (
                                  <div className="flex flex-wrap gap-2.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setResponses(prev => ({ ...prev, [item.id]: 'low' }));
                                        setTimeout(advanceToNext, 250);
                                      }}
                                      className={cn(
                                        "flex-1 py-3 px-3 rounded-xl font-extrabold text-xs transition-all border-2",
                                        responses[item.id] === 'low' 
                                          ? "bg-amber-600 border-amber-600 text-white shadow-md shadow-amber-50" 
                                          : "bg-white border-slate-200 text-slate-500 hover:border-amber-300"
                                      )}
                                    >
                                      BAIXO
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setResponses(prev => ({ ...prev, [item.id]: 'normal' }));
                                        setTimeout(advanceToNext, 250);
                                      }}
                                      className={cn(
                                        "flex-1 py-3 px-3 rounded-xl font-extrabold text-xs transition-all border-2",
                                        responses[item.id] === 'normal' 
                                          ? "bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-50" 
                                          : "bg-white border-slate-200 text-slate-500 hover:border-emerald-300"
                                      )}
                                    >
                                      NORMAL / OK
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setResponses(prev => ({ ...prev, [item.id]: 'high' }));
                                        setTimeout(advanceToNext, 250);
                                      }}
                                      className={cn(
                                        "flex-1 py-3 px-3 rounded-xl font-extrabold text-xs transition-all border-2",
                                        responses[item.id] === 'high' 
                                          ? "bg-rose-600 border-rose-600 text-white shadow-md shadow-rose-50" 
                                          : "bg-white border-slate-200 text-slate-500 hover:border-rose-300"
                                      )}
                                    >
                                      ALTO
                                    </button>
                                  </div>
                                )}

                                {item.type === 'barcode' && (
                                  <div className="space-y-3">
                                    <div className="relative group">
                                      <QrCode className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                                      <input
                                        type="text"
                                        id={`barcode-${item.id}`}
                                        value={responses[item.id] || ''}
                                        onChange={(e) => setResponses(prev => ({ ...prev, [item.id]: e.target.value }))}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            advanceToNext();
                                          }
                                        }}
                                        placeholder="Escaneie ou digite o código de leitura..."
                                        className="w-full pl-10 pr-10 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/30 outline-none font-bold text-xs"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          // Trigger scanner logic
                                          setActiveScanner(item.id);
                                        }}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-600 hover:text-emerald-700 p-1.5"
                                        title="Abrir Scanner"
                                      >
                                        <QrCode className="w-5 h-5" />
                                      </button>
                                    </div>

                                    {activeScanner === item.id && (
                                      <div className="relative bg-black rounded-xl overflow-hidden aspect-video border border-slate-800">
                                        {cameraError ? (
                                          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center text-white bg-slate-900 font-mono">
                                            <AlertCircle className="w-8 h-8 text-rose-500 mb-2 animate-pulse" />
                                            <p className="text-[10px] font-black leading-tight mb-4">{cameraError}</p>
                                            <button
                                              type="button"
                                              onClick={() => setActiveScanner(null)}
                                              className="px-4 py-1.5 bg-white text-slate-900 rounded-lg font-black text-[10px]"
                                            >
                                              FECHAR
                                            </button>
                                          </div>
                                        ) : (
                                          <>
                                            <div id="qr-reader" className="w-full h-full" />
                                            <button 
                                              type="button"
                                              onClick={() => setActiveScanner(null)}
                                              className="absolute top-2.5 right-2.5 bg-black/50 text-white p-1.5 rounded-full hover:bg-black"
                                            >
                                              <X className="w-3.5 h-3.5" />
                                            </button>
                                            <div className="absolute inset-0 border-2 border-emerald-500/40 pointer-events-none rounded-xl animate-pulse" />
                                          </>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}

                                {item.type === 'text' && (
                                  <div className="space-y-3">
                                    <textarea
                                      value={responses[item.id] || ''}
                                      onChange={(e) => setResponses(prev => ({ ...prev, [item.id]: e.target.value }))}
                                      placeholder="Digite a sua observação ou comentário aqui..."
                                      rows={2}
                                      className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/30 outline-none text-xs font-semibold text-slate-700 placeholder-slate-400"
                                    />
                                  </div>
                                )}

                                {item.allowObservation && (
                                  <div className="pt-2">
                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1 ml-1 font-mono">
                                      Complemento / Obs. Livre
                                    </label>
                                    <textarea
                                      value={observations[item.id] || ''}
                                      onChange={(e) => setObservations(prev => ({ ...prev, [item.id]: e.target.value }))}
                                      placeholder="Adicionar detalhes se necessário..."
                                      rows={2}
                                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/30 outline-none text-[10px] font-semibold text-slate-650 placeholder-slate-400"
                                    />
                                  </div>
                                )}

                                {/* Inner Card Navigation Helpers */}
                                <div className="flex justify-between items-center bg-slate-100/50 p-2.5 rounded-xl border border-slate-200/40 mt-3">
                                  <button
                                    type="button"
                                    disabled={idx === 0}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedItemId(fillingTemplate.items[idx - 1].id);
                                    }}
                                    className="px-3 py-1.5 text-[10px] font-black uppercase text-slate-400 hover:text-slate-700 disabled:opacity-40 transition-colors"
                                  >
                                    Item Anterior
                                  </button>

                                  {idx < fillingTemplate.items.length - 1 ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExpandedItemId(fillingTemplate.items[idx + 1].id);
                                      }}
                                      className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-[10px] font-black uppercase rounded-lg transition-colors"
                                    >
                                      Próximo Item
                                    </button>
                                  ) : (
                                    <span className="text-[9px] font-black uppercase text-emerald-600 px-3 py-1.5 font-mono">Último Item da Ficha</span>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* VISUAL BOTTOM ACTION FOOTER FOR SUBMISSION */}
                <div className="p-6 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row justify-end gap-3 rounded-b-[2.5rem]">
                  <button
                    type="button"
                    onClick={() => {
                      setModalConfig({
                        isOpen: true,
                        title: 'Descartar Check-list?',
                        message: 'Deseja realmente cancelar este preenchimento de qualidade? Todos os dados marcados serão perdidos.',
                        type: 'warning',
                        showConfirmButton: true,
                        confirmText: 'Sim, Descartar',
                        onConfirm: () => {
                          closeModal();
                          setFillingTemplate(null);
                          setResponses({});
                          setObservations({});
                          setSubmissionLineId('');
                        }
                      });
                    }}
                    className="px-5 py-3 font-extrabold text-slate-500 hover:bg-slate-100 rounded-xl text-xs uppercase tracking-wider transition-all"
                  >
                    Descartar
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitChecklist}
                    className="px-8 py-3 bg-emerald-600 text-white font-black rounded-xl hover:bg-emerald-700 shadow-md shadow-emerald-100 text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                  >
                    <Save className="w-4 h-4 shrink-0" />
                    Finalizar Inspeção
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {templates.filter(t => {
                  if (!t.active) return false;
                  if (!selectedLineId) return true;
                  
                  // Show if matched directly
                  if (t.sectorId === selectedLineId) return true;
                  // Show if matched 'all'
                  if (t.sectorId === 'all') return true;
                  
                  // Show if template is for a sector that contains this line
                  const parentSector = sectors.find(s => s.id === t.sectorId);
                  if (parentSector && parentSector.lineIds.includes(selectedLineId)) return true;
                  
                  return false;
                }).map(template => {
                  const sector = sectors.find(s => s.id === template.sectorId);
                  const line = lines.find(l => l.id === template.sectorId);
                  const locationName = template.sectorId === 'all' ? 'Fábrica Completa' : (sector?.name || line?.name || 'Geral');

                  // Progress calculation
                  const currentShift = getCurrentShift();
                  const currentGroup = getGroupForShift(new Date(), currentShift);
                  const shiftIdentifier = `${currentGroup} - ${currentShift}`;
                  const todayStr = new Date().toISOString().split('T')[0];

                  const targetLineIds = template.sectorId === 'all'
                    ? lines.map(l => l.id)
                    : (sectors.find(sec => sec.id === template.sectorId)?.lineIds || (lines.find(l => l.id === template.sectorId) ? [template.sectorId] : []));

                  const linesStatus = targetLineIds.map(lineId => {
                    const lineSubmissions = submissions.filter(sub => 
                      sub.templateId === template.id && 
                      sub.lineId === lineId &&
                      sub.shift === shiftIdentifier &&
                      (safeToDate(sub.createdAt) || new Date()).toISOString().split('T')[0] === todayStr
                    );
                    return {
                      lineId,
                      completed: lineSubmissions.length >= template.frequencyPerShift,
                      count: lineSubmissions.length
                    };
                  });

                  const activeStatuses = selectedLineId 
                    ? linesStatus.filter(s => s.lineId === selectedLineId)
                    : linesStatus;

                  const isCompleted = activeStatuses.length > 0 && activeStatuses.every(s => s.completed);
                  const completedLinesCount = linesStatus.filter(s => s.completed).length;
                  const totalLinesCount = targetLineIds.length;

                  return (
                    <button
                      key={template.id}
                      disabled={isCompleted}
                      onClick={() => {
                        setFillingTemplate(template);
                        setResponses({});
                        setObservations({});
                        setExpandedItemId(template.items[0]?.id || null);
                        // If selected line targets this template, default to it; otherwise default to empty or the template's single line
                        const defaultLineId = selectedLineId && targetLineIds.includes(selectedLineId)
                          ? selectedLineId
                          : (targetLineIds.length === 1 ? targetLineIds[0] : '');
                        setSubmissionLineId(defaultLineId);
                      }}
                      className={cn(
                        "group p-8 rounded-[2rem] border transition-all text-left flex flex-col justify-between relative overflow-hidden",
                        isCompleted 
                          ? "bg-slate-50 border-slate-100 opacity-60 cursor-not-allowed" 
                          : "bg-white border-slate-200 hover:border-emerald-500 hover:shadow-xl hover:shadow-emerald-50"
                      )}
                    >
                      {isCompleted && (
                        <div className="absolute top-0 right-0 p-4">
                          <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                        </div>
                      )}
                      
                      <div className="space-y-4">
                        <div className={cn(
                          "w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110",
                          isCompleted ? "bg-slate-100 text-slate-400" : "bg-emerald-50 text-emerald-600"
                        )}>
                          <ClipboardCheck className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className={cn(
                            "text-xl font-black transition-colors uppercase tracking-tight",
                            isCompleted ? "text-slate-500" : "text-slate-900 group-hover:text-emerald-600"
                          )}>
                            {template.name}
                          </h3>
                          <p className="text-slate-500 text-sm font-medium line-clamp-2 mt-1">{template.description}</p>
                        </div>
                      </div>

                      <div className="mt-8 pt-6 border-t border-slate-50 flex items-center justify-between">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-2 py-1 rounded flex items-center gap-1 w-fit">
                            <LayoutGrid className="w-3 h-3" />
                            {locationName}
                          </span>
                          
                          <div className="flex items-center gap-2 mt-1">
                            <span className={cn(
                              "text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded flex items-center gap-1 w-fit",
                              isCompleted ? "bg-slate-100 text-slate-500" : "bg-emerald-50 text-emerald-600"
                            )}>
                              <Clock className="w-3 h-3" />
                              {selectedLineId 
                                ? `${activeStatuses[0]?.count || 0} / ${template.frequencyPerShift}x`
                                : `${completedLinesCount} / ${totalLinesCount} Linhas`
                              }
                            </span>
                            {isCompleted && (
                              <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                                Concluído hoje
                              </span>
                            )}
                          </div>
                        </div>
                        {!isCompleted && <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-emerald-500 transition-all" />}
                      </div>
                    </button>
                  );
                })}

                {templates.filter(t => t.active).length === 0 && (
                  <div className="col-span-full py-20 text-center bg-white rounded-[2rem] border-2 border-dashed border-slate-200">
                    <ClipboardCheck className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-400 font-bold">Nenhum checklist configurado pelo administrador.</p>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'templates' && (
          <motion.div
            key="templates"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-slate-900">Configuração de Checklists</h2>
              <button
                onClick={() => {
                  setIsAddingTemplate(true);
                  setEditingTemplate(null);
                  setNewTemplate({
                    name: '',
                    description: '',
                    sectorId: '',
                    frequencyPerShift: 1,
                    items: [],
                    active: true
                  });
                }}
                className="bg-slate-900 text-white px-6 py-3 rounded-xl font-black flex items-center gap-2 hover:bg-slate-800 transition-all shadow-lg"
              >
                <Plus className="w-5 h-5" />
                Criar Novo Modelo
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {templates.map(template => {
                const sector = sectors.find(s => s.id === template.sectorId);
                const line = lines.find(l => l.id === template.sectorId);
                const locationName = template.sectorId === 'all' ? 'Fábrica Completa' : (sector?.name || line?.name || 'N/A');

                return (
                  <div key={template.id} className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-6">
                      <div className="w-12 h-12 bg-slate-50 text-slate-600 rounded-2xl flex items-center justify-center">
                        <FileText className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-black text-slate-900">{template.name}</h3>
                        <div className="flex items-center gap-4 mt-1">
                          <span className="text-xs font-bold text-slate-400">{template.items.length} itens</span>
                          <span className="text-xs font-bold text-slate-400">{template.frequencyPerShift}x por turno</span>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded w-fit">
                              {locationName}
                            </span>
                            {sector && (
                              <div className="flex flex-wrap gap-1">
                                {sector.lineIds.map((lineId, idx) => (
                                  <span key={`${lineId}-${idx}`} className="text-[8px] font-black text-slate-300 uppercase tracking-widest px-1 bg-slate-50 rounded">
                                    {lines.find(l => l.id === lineId)?.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <span className={cn(
                            "text-[10px] font-black px-2 py-0.5 rounded-full uppercase",
                            template.active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"
                          )}>
                            {template.active ? 'Ativo' : 'Inativo'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingTemplate(template);
                          setNewTemplate(template);
                          setIsAddingTemplate(true);
                        }}
                        className="p-3 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all"
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => setTemplateToDelete(template)}
                        className="p-3 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal for Template Creation */}
            <AnimatePresence>
              {isAddingTemplate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setIsAddingTemplate(false)}
                    className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                  />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl p-8 border border-slate-100 overflow-y-auto max-h-[90vh]"
                  >
                    <div className="flex items-center justify-between mb-8">
                       <h3 className="text-2xl font-black text-slate-900">
                         {editingTemplate ? 'Editar Modelo' : 'Novo Modelo de Checklist'}
                       </h3>
                       <button onClick={() => setIsAddingTemplate(false)} className="p-2 hover:bg-slate-100 rounded-full">
                         <X className="w-6 h-6" />
                       </button>
                    </div>

                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Nome do Checklist</label>
                          <input
                            type="text"
                            value={newTemplate.name}
                            onChange={(e) => setNewTemplate(prev => ({ ...prev, name: e.target.value }))}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold"
                            placeholder="ex: Inspeção de Qualidade Linha A"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Aplicável em (Setor ou Linha)</label>
                          <select
                            value={newTemplate.sectorId}
                            onChange={(e) => setNewTemplate(prev => ({ ...prev, sectorId: e.target.value }))}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold"
                          >
                            <option value="">Selecione o Destino</option>
                            <option value="all">Fábrica Completa</option>
                            <optgroup label="Setores Operacionais (Grupos)">
                              {sectors.map(sector => (
                                <option key={`sector-opt-${sector.id}`} value={sector.id}>{sector.name}</option>
                              ))}
                            </optgroup>
                            <optgroup label="Linhas Individuais">
                              {lines.map(line => (
                                <option key={`line-opt-${line.id}`} value={line.id}>{line.name}</option>
                              ))}
                            </optgroup>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Frequência por Turno</label>
                          <div className="relative">
                             <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                             <input
                               type="number"
                               min="1"
                               max="12"
                               value={newTemplate.frequencyPerShift}
                               onChange={(e) => setNewTemplate(prev => ({ ...prev, frequencyPerShift: parseInt(e.target.value) || 1 }))}
                               className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold"
                             />
                          </div>
                        </div>
                        <div className="space-y-2">
                           <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Descrição (Opcional)</label>
                           <input
                             type="text"
                             value={newTemplate.description}
                             onChange={(e) => setNewTemplate(prev => ({ ...prev, description: e.target.value }))}
                             className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium"
                             placeholder="Breve resumo da finalidade..."
                           />
                        </div>
                      </div>

                      <div className="space-y-4 pt-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                           <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Itens da Inspeção</h4>
                           <button
                             onClick={addItemToTemplate}
                             className="text-emerald-600 font-bold text-xs flex items-center gap-1 hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-all"
                           >
                             <Plus className="w-4 h-4" />
                             Adicionar Item
                           </button>
                        </div>

                        <div className="space-y-3">
                          {newTemplate.items?.map((item, idx) => (
                            <div key={item.id || `item-${idx}`} className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 space-y-4">
                              <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                                <span className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center font-black text-xs shrink-0">{idx + 1}</span>
                                <input
                                  type="text"
                                  value={item.label}
                                  onChange={(e) => updateItemInTemplate(item.id, { label: e.target.value })}
                                  className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none text-sm font-black"
                                  placeholder="Pergunta ou Item a verificar..."
                                />
                                <div className="flex gap-2 w-full md:w-auto">
                                  <select
                                    value={item.type}
                                    onChange={(e) => updateItemInTemplate(item.id, { type: e.target.value as ChecklistItemType })}
                                    className="flex-1 md:flex-none px-3 py-2.5 bg-white border border-slate-200 rounded-xl outline-none text-xs font-black"
                                  >
                                    <option value="condition">Opções (OK/NOK/...)</option>
                                    <option value="number">Numérico</option>
                                    <option value="range">Range (Baixo/Alto)</option>
                                    <option value="barcode">Código / QR</option>
                                    <option value="text">Texto Livre / Observação</option>
                                  </select>
                                  <button
                                    onClick={() => removeItemFromTemplate(item.id)}
                                    className="p-2.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                                  >
                                    <Trash2 className="w-5 h-5" />
                                  </button>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pl-12">
                                {item.type === 'condition' && (
                                  <div className="col-span-full">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Conjunto de Opções</label>
                                    <select
                                      value={item.conditionOptionsId || ''}
                                      onChange={(e) => updateItemInTemplate(item.id, { conditionOptionsId: e.target.value })}
                                      className="w-full md:w-64 px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none text-xs font-bold"
                                    >
                                      <option value="">Padrão (OK / NÃO OK)</option>
                                      {optionSets.map(set => (
                                        <option key={set.id} value={set.id}>{set.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                )}

                                {item.type === 'number' && (
                                  <>
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={item.isInteger || false}
                                        onChange={(e) => updateItemInTemplate(item.id, { isInteger: e.target.checked })}
                                        id={`int-${item.id}`}
                                        className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                      />
                                      <label htmlFor={`int-${item.id}`} className="text-xs font-bold text-slate-600">Número Inteiro</label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={item.isRangeDropdown || false}
                                        onChange={(e) => updateItemInTemplate(item.id, { isRangeDropdown: e.target.checked })}
                                        id={`range-${item.id}`}
                                        className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                      />
                                      <label htmlFor={`range-${item.id}`} className="text-xs font-bold text-slate-600">Usar Dropdown (Range)</label>
                                    </div>
                                    {item.isRangeDropdown && (
                                      <div className="flex gap-2 items-center col-span-full md:col-span-1">
                                        <input
                                          type="number"
                                          step="0.01"
                                          placeholder="Min"
                                          value={item.min || ''}
                                          onChange={(e) => updateItemInTemplate(item.id, { min: parseFloat(e.target.value) })}
                                          className="w-20 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                                        />
                                        <span className="text-slate-400 text-xs font-bold">até</span>
                                        <input
                                          type="number"
                                          step="0.01"
                                          placeholder="Max"
                                          value={item.max || ''}
                                          onChange={(e) => updateItemInTemplate(item.id, { max: parseFloat(e.target.value) })}
                                          className="w-20 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                                        />
                                        <span className="text-slate-400 text-xs font-bold">Passo:</span>
                                        <input
                                          type="number"
                                          step="0.01"
                                          placeholder="Step"
                                          value={item.step || ''}
                                          onChange={(e) => updateItemInTemplate(item.id, { step: parseFloat(e.target.value) })}
                                          className="w-20 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                                        />
                                      </div>
                                    )}
                                  </>
                                )}
                                <div className="col-span-full border-t border-slate-100 pt-3 mt-1 flex flex-col sm:flex-row sm:items-center gap-4">
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={item.required !== false}
                                      onChange={(e) => updateItemInTemplate(item.id, { required: e.target.checked })}
                                      id={`required-${item.id}`}
                                      className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                    />
                                    <label htmlFor={`required-${item.id}`} className="text-xs font-bold text-slate-600">
                                      Item Obrigatório
                                    </label>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={item.allowObservation || false}
                                      onChange={(e) => updateItemInTemplate(item.id, { allowObservation: e.target.checked })}
                                      id={`allow-obs-${item.id}`}
                                      className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                    />
                                    <label htmlFor={`allow-obs-${item.id}`} className="text-xs font-bold text-slate-600">
                                      Habilitar campo para observação (texto livre no checklist)
                                    </label>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                          {!newTemplate.items?.length && (
                            <div className="text-center py-8 text-slate-400 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-100">
                               Nenhum item adicionado ainda.
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
                        <button
                          onClick={() => setIsAddingTemplate(false)}
                          className="px-6 py-3 font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-all"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={handleSaveTemplate}
                          className="px-10 py-3 bg-emerald-600 text-white font-black rounded-xl hover:bg-emerald-700 shadow-xl shadow-emerald-100 transition-all"
                        >
                          {editingTemplate ? 'Salvar Alterações' : 'Criar Modelo'}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {activeTab === 'sectors' && (
          <motion.div
            key="sectors"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-12 pb-20"
          >
            {/* Seção de Linhas */}
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black text-slate-900">Linhas de Produção</h2>
                  <p className="text-sm font-medium text-slate-500">Cadastre as máquinas ou linhas individuais (ex: MS1, Linha A).</p>
                </div>
                <button
                  onClick={() => {
                    setIsAddingLine(true);
                    setEditingLine(null);
                    setNewLine({ name: '', active: true });
                  }}
                  className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-black flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                >
                  <Plus className="w-5 h-5" />
                  Nova Linha
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {lines.map(line => (
                  <div key={line.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between group">
                    <div>
                      <h3 className="font-black text-slate-900">{line.name}</h3>
                      <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2 py-0.5 rounded">Ativa</span>
                    </div>
                    <div className="flex gap-1">
                      <button 
                        onClick={() => {
                          setEditingLine(line);
                          setNewLine(line);
                          setIsAddingLine(true);
                        }}
                        className="p-2 text-slate-300 hover:text-emerald-600 transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setLineToDelete(line)}
                        className="p-2 text-slate-300 hover:text-rose-600 transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Seção de Setores */}
            <div className="space-y-6 pt-6 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black text-slate-900">Setores Operacionais (Grupos)</h2>
                  <p className="text-sm font-medium text-slate-500">Agrupe várias linhas em um setor (ex: Enfardamento = Linhas A, B, C, D).</p>
                </div>
                <button
                  onClick={() => {
                    setIsAddingSector(true);
                    setEditingSector(null);
                    setNewSector({ name: '', lineIds: [], active: true });
                  }}
                  className="bg-slate-900 text-white px-6 py-3 rounded-xl font-black flex items-center gap-2 hover:bg-slate-800 transition-all shadow-lg"
                >
                  <Plus className="w-5 h-5" />
                  Novo Setor
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {sectors.map(sector => (
                  <div key={sector.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                     <div className="flex items-center justify-between mb-4">
                       <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                         <Layers className="w-6 h-6" />
                       </div>
                       <div className="flex gap-2">
                         <button 
                           onClick={() => {
                             setEditingSector(sector);
                             setNewSector(sector);
                             setIsAddingSector(true);
                           }}
                           className="p-2 text-slate-400 hover:text-blue-500 transition-colors"
                          >
                            <Edit2 className="w-5 h-5" />
                          </button>
                         <button 
                           onClick={() => setSectorToDelete(sector)}
                           className="p-2 text-slate-400 hover:text-rose-500 transition-colors"
                         >
                            <Trash2 className="w-5 h-5" />
                          </button>
                          </div>
                     </div>
                     <h3 className="text-xl font-black text-slate-900 mb-2">{sector.name}</h3>
                     <div className="space-y-2">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Linhas Integrantes:</p>
                        <div className="flex flex-wrap gap-2">
                           {sector.lineIds.map((lineId, idx) => {
                             const line = lines.find(l => l.id === lineId);
                             return (
                               <span key={`${lineId}-${idx}`} className="px-3 py-1 bg-slate-100 rounded-lg text-xs font-bold text-slate-600">
                                 {line?.name || 'Linha Excluída'}
                               </span>
                             );
                           })}
                        </div>
                     </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal for Line Creation */}
            <AnimatePresence>
              {isAddingLine && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setIsAddingLine(false)}
                    className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                  />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-8 border border-slate-100"
                  >
                    <h3 className="text-2xl font-black text-slate-900 mb-8">
                      {editingLine ? 'Editar Linha' : 'Nova Linha de Produção'}
                    </h3>

                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Nome da Linha</label>
                        <input
                          type="text"
                          value={newLine.name}
                          onChange={(e) => setNewLine(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="Ex: MS1, Linha A, Linha B..."
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold"
                        />
                      </div>

                      <div className="flex justify-end gap-3 pt-6">
                        <button
                          onClick={() => setIsAddingLine(false)}
                          className="px-6 py-3 font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-all"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={handleSaveLine}
                          className="px-10 py-3 bg-emerald-600 text-white font-black rounded-xl hover:bg-emerald-700 shadow-xl shadow-emerald-100 transition-all"
                        >
                          Salvar Linha
                        </button>
                      </div>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* Modal for Sector Creation */}
            <AnimatePresence>
              {isAddingSector && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setIsAddingSector(false)}
                    className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                  />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl p-8 border border-slate-100"
                  >
                    <h3 className="text-2xl font-black text-slate-900 mb-8">
                      {editingSector ? 'Editar Setor' : 'Criar Novo Setor'}
                    </h3>

                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Nome do Setor</label>
                        <input
                          type="text"
                          value={newSector.name}
                          onChange={(e) => setNewSector(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="Ex: Enfardamento, Parte Seca..."
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                        />
                      </div>

                      <div className="space-y-2">
                         <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Vincular Linhas</label>
                         <div className="grid grid-cols-2 gap-2">
                            {lines.map(line => (
                              <button
                                key={line.id}
                                onClick={() => {
                                  const current = newSector.lineIds || [];
                                  if (current.includes(line.id)) {
                                    setNewSector(prev => ({ ...prev, lineIds: current.filter(id => id !== line.id) }));
                                  } else {
                                    setNewSector(prev => ({ ...prev, lineIds: [...current, line.id] }));
                                  }
                                }}
                                className={cn(
                                  "px-4 py-2 rounded-xl text-xs font-bold transition-all border",
                                  newSector.lineIds?.includes(line.id)
                                    ? "bg-blue-600 border-blue-600 text-white"
                                    : "bg-white border-slate-200 text-slate-500 hover:border-blue-200"
                                )}
                              >
                                {line.name}
                              </button>
                            ))}
                         </div>
                      </div>

                      <div className="flex justify-end gap-3 pt-6">
                        <button
                          onClick={() => setIsAddingSector(false)}
                          className="px-6 py-3 font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-all"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={handleSaveSector}
                          className="px-10 py-3 bg-blue-600 text-white font-black rounded-xl hover:bg-blue-700 shadow-xl shadow-blue-100 transition-all"
                        >
                          {editingSector ? 'Salvar' : 'Criar Setor'}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {activeTab === 'options' && (
          <motion.div
            key="options"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900">Opções Customizáveis</h2>
                <p className="text-sm font-medium text-slate-500">Defina os tipos de resposta (Ex: OK/Nok, Sim/Não, Normal/Anormal).</p>
              </div>
              <button
                onClick={() => {
                  setIsAddingOptionSet(true);
                  setEditingOptionSet(null);
                  setNewOptionSet({ name: '', options: ['OK', 'NÃO OK'], active: true });
                }}
                className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-black flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-lg"
              >
                <Plus className="w-5 h-5" />
                Criar Conjunto
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {optionSets.map(set => (
                <div key={set.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
                        <ToggleLeft className="w-6 h-6" />
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            setEditingOptionSet(set);
                            setNewOptionSet(set);
                            setIsAddingOptionSet(true);
                          }}
                          className="p-2 text-slate-400 hover:text-emerald-600 transition-colors"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => setOptionSetToDelete(set)}
                          className="p-2 text-slate-400 hover:text-rose-500 transition-colors"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    <h3 className="text-xl font-black text-slate-900 mb-2">{set.name}</h3>
                    <div className="flex flex-wrap gap-2">
                      {set.options.map((opt, i) => (
                        <span key={i} className="px-3 py-1 bg-slate-100 rounded-lg text-xs font-black text-slate-600 uppercase tracking-tight">
                          {opt}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Modal for Option Set Creation */}
            <AnimatePresence>
              {isAddingOptionSet && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setIsAddingOptionSet(false)}
                    className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                  />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl p-8 border border-slate-100"
                  >
                    <h3 className="text-2xl font-black text-slate-900 mb-8">
                      {editingOptionSet ? 'Editar Conjunto' : 'Novo Conjunto de Opções'}
                    </h3>

                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Nome do Conjunto</label>
                        <input
                          type="text"
                          value={newOptionSet.name}
                          onChange={(e) => setNewOptionSet(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="Ex: OK / NÃO OK, Sim / Não..."
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold"
                        />
                      </div>

                      <div className="space-y-4">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Opções de Resposta</label>
                        <div className="space-y-2">
                          {newOptionSet.options?.map((opt, idx) => (
                            <div key={idx} className="flex gap-2">
                              <input
                                type="text"
                                value={opt}
                                onChange={(e) => {
                                  const newOpts = [...(newOptionSet.options || [])];
                                  newOpts[idx] = e.target.value;
                                  setNewOptionSet(prev => ({ ...prev, options: newOpts }));
                                }}
                                className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none font-bold text-sm"
                              />
                              <button
                                onClick={() => {
                                  setNewOptionSet(prev => ({ 
                                    ...prev, 
                                    options: prev.options?.filter((_, i) => i !== idx) 
                                  }));
                                }}
                                className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg"
                              >
                                <X className="w-5 h-5" />
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={() => setNewOptionSet(prev => ({ ...prev, options: [...(prev.options || []), ''] }))}
                            className="flex items-center gap-2 text-sm font-black text-emerald-600 hover:text-emerald-700 mt-2"
                          >
                            <Plus className="w-4 h-4" />
                            Adicionar Opção
                          </button>
                        </div>
                      </div>

                      <div className="flex justify-end gap-3 pt-6">
                        <button
                          onClick={() => setIsAddingOptionSet(false)}
                          className="px-6 py-3 font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-all"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={handleSaveOptionSet}
                          className="px-10 py-3 bg-emerald-600 text-white font-black rounded-xl hover:bg-emerald-700 shadow-xl shadow-emerald-100 transition-all"
                        >
                          Salvar Conjunto
                        </button>
                      </div>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
        {activeTab === 'omissions' && (
          <motion.div
            key="omissions"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <div className="bg-slate-900 text-white p-10 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
               <div className="relative z-10">
                 <h2 className="text-3xl font-black mb-2 tracking-tight">Registro de Justificativas</h2>
                 <p className="text-emerald-100/60 max-w-lg">Quando uma inspeção não puder ser realizada dentro do turno previsto, o operador deve formalizar a justificativa aqui.</p>
               </div>
               <div className="absolute right-[-2%] top-[-10%] opacity-10">
                 <AlertCircle className="w-48 h-48" />
               </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {pendingOmissions.map((omission, idx) => (
                <div key={`pending-${idx}`} className="bg-amber-50 p-8 rounded-[2rem] border border-amber-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest bg-amber-100 px-2 py-0.5 rounded">Pendente de Justificativa</span>
                      <span className="text-xs font-bold text-slate-400 capitalize">{omission.shift} • {omission.date}</span>
                      {omission.lineName && (
                        <span className="text-[10px] font-black text-amber-700 uppercase tracking-widest bg-amber-200/50 px-2 py-0.5 rounded">Linha: {omission.lineName}</span>
                      )}
                    </div>
                    <h3 className="text-xl font-black text-slate-900">{omission.template.name}</h3>
                    <p className="text-sm text-slate-500 font-medium font-semibold">
                      Esta inspeção para a <strong>{omission.lineName || 'linha'}</strong> deveria ter sido realizada {omission.template.frequencyPerShift}x, mas foi feita {omission.template.frequencyPerShift - omission.missing}x.
                    </p>
                  </div>
                  <button
                    onClick={() => setJustifyingOmission(omission)}
                    className="bg-amber-600 text-white px-8 py-3 rounded-xl font-black shadow-lg shadow-amber-100 hover:bg-amber-700 transition-all whitespace-nowrap"
                  >
                    Justificar
                  </button>
                </div>
              ))}

              {omissions.map(omission => (
                <div key={omission.id} className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-2">
                       <div className="flex items-center gap-3">
                         <span className="text-xs font-black text-rose-500 uppercase tracking-widest bg-rose-50 px-3 py-1 rounded-full">Não Informado</span>
                         <span className="text-sm font-bold text-slate-400 capitalize">{omission.shift} • {omission.date}</span>{omission.lineName && <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-full ml-2">Linha: {omission.lineName}</span>}
                       </div>
                       <h3 className="text-xl font-black text-slate-900">{omission.templateName}</h3>
                       <p className="text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-100 italic font-medium">
                         "{omission.justification}"
                       </p>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                         <p className="text-sm font-bold text-slate-900">{omission.userName}</p>
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Colaborador</p>
                      </div>
                      <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center font-black text-slate-500">
                        {omission.userName.charAt(0)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {omissions.length === 0 && (
                <div className="text-center py-20 bg-white rounded-[2rem] border border-slate-200">
                   <CheckCircle2 className="w-12 h-12 text-emerald-100 mx-auto mb-4" />
                   <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">Nenhuma omissão ou justificativa registrada.</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeTab === 'dashboard' && (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
               <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Total de Inspeções</p>
                  <p className="text-3xl font-black text-slate-900">{submissions.length}</p>
               </div>
               <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Taxa de Conformidade</p>
                  <p className={cn(
                    "text-3xl font-black",
                    complianceRate >= 95 ? "text-emerald-600" : (complianceRate >= 85 ? "text-amber-600" : "text-rose-600")
                  )}>
                    {complianceRate.toFixed(1)}%
                  </p>
               </div>
               <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Justificativas</p>
                  <p className="text-3xl font-black text-amber-600">{omissions.length}</p>
               </div>
               <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
                   <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Modelos Ativos</p>
                   <p className="text-3xl font-black text-blue-600">{templates.filter(t => t.active).length}</p>
                </div>
              </div>

              {dryerSubmissions.length > 0 && activeDryerSub && (
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                    <div>
                      <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                        <LayoutGrid className="w-6 h-6 text-emerald-600" />
                        Mapeamento de Limpeza do Secador (Visual)
                      </h3>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">
                        Monitoramento de sujidade por porta e nível do secador MS1
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-wider text-slate-500">Histórico de Inspeção:</label>
                      <select
                        value={selectedDryerSubId}
                        onChange={(e) => setSelectedDryerSubId(e.target.value)}
                        className="px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl outline-none text-xs font-bold transition-all text-slate-800"
                      >
                        {dryerSubmissions.map(sub => {
                          const dateObj = safeToDate(sub.createdAt);
                          const dateStr = dateObj ? dateObj.toLocaleDateString('pt-BR') : 'Data Indefinida';
                          const timeStr = dateObj ? dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
                          return (
                            <option key={sub.id} value={sub.id}>
                              {dateStr} às {timeStr} ({sub.shift}) - {sub.userName}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>

                  {/* Summary of statistics of the selected inspection */}
                  {(() => {
                    let totalValids = 0;
                    let greenCount = 0;
                    let yellowCount = 0;
                    let redCount = 0;

                    activeDryerSub.responses.forEach(resp => {
                      const valStr = String(resp.value).toLowerCase();
                      if (valStr.includes('pouco') || valStr === 'pouco sujo' || valStr === 'pouco suja') {
                        greenCount++;
                        totalValids++;
                      } else if (valStr === 'sujo' || valStr === 'suja' || valStr.includes('amarelo') || valStr.includes('suj')) {
                        yellowCount++;
                        totalValids++;
                      } else if (valStr.includes('tamponado') || valStr.includes('tamponada') || valStr === 'vermelho') {
                        redCount++;
                        totalValids++;
                      }
                    });

                    const pctGreen = totalValids > 0 ? ((greenCount / totalValids) * 100).toFixed(1) : '0';
                    const pctYellow = totalValids > 0 ? ((yellowCount / totalValids) * 100).toFixed(1) : '0';
                    const pctRed = totalValids > 0 ? ((redCount / totalValids) * 100).toFixed(1) : '0';

                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl flex items-center justify-between">
                          <div>
                            <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">Pouco Sujo (Código 3)</p>
                            <p className="text-2xl font-black text-emerald-600 mt-1">{greenCount} <span className="text-xs font-bold text-emerald-500">({pctGreen}%)</span></p>
                            <p className="text-[10px] font-medium text-emerald-700 mt-0.5">Conforme / Pouco Acúmulo</p>
                          </div>
                          <span className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center font-black text-sm animate-none">3</span>
                        </div>

                        <div className="bg-yellow-50/50 border border-yellow-200 p-4 rounded-2xl flex items-center justify-between">
                          <div>
                            <p className="text-[10px] font-black text-yellow-800 uppercase tracking-widest">Sujo (Código 2)</p>
                            <p className="text-2xl font-black text-yellow-600 mt-1">{yellowCount} <span className="text-xs font-bold text-yellow-500">({pctYellow}%)</span></p>
                            <p className="text-[10px] font-medium text-yellow-700 mt-0.5">Crítico / Necessita Limpeza</p>
                          </div>
                          <span className="w-8 h-8 rounded-full bg-yellow-400 text-yellow-950 flex items-center justify-center font-black text-sm border border-yellow-500 animate-none">2</span>
                        </div>

                        <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex items-center justify-between">
                          <div>
                            <p className="text-[10px] font-black text-rose-800 uppercase tracking-widest">Tamponado (Código 1)</p>
                            <p className="text-2xl font-black text-rose-600 mt-1">{redCount} <span className="text-xs font-bold text-rose-500">({pctRed}%)</span></p>
                            <p className="text-[10px] font-medium text-rose-700 mt-0.5">Crítico / Obstruído</p>
                          </div>
                          <span className="w-8 h-8 rounded-full bg-rose-600 text-white flex items-center justify-center font-black text-sm animate-pulse">1</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Even Doors (Lado Comando) */}
                  {(() => {
                    const evenDoors = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 0];
                    const levels = ['A', 'B', 'C', 'D'];
                    return (
                      <div className="bg-slate-50/50 p-6 rounded-3xl border border-slate-100 space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="font-extrabold text-xs text-slate-700 uppercase tracking-wider">
                            Secador MS1 - Lado de Comando (Portas Pares)
                          </h4>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Vista Frontal</span>
                        </div>
                        <div className="overflow-x-auto pb-2">
                          <div className="min-w-[480px] space-y-2">
                            {/* Doors Header */}
                            <div className="grid grid-cols-[85px_repeat(12,1fr)] gap-1.5 items-center">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider text-right pr-2">PORTAS</span>
                              {evenDoors.map(door => (
                                <span key={door} className="text-center font-black text-slate-600 text-xs py-1.5 bg-slate-100 rounded-lg">
                                  {String(door).padStart(2, '0')}
                                </span>
                              ))}
                            </div>
                            {/* Level Rows */}
                            {levels.map(level => (
                              <div key={level} className="grid grid-cols-[85px_repeat(12,1fr)] gap-1.5 items-center">
                                <span className="font-extrabold text-slate-600 text-[11px] py-1 px-2 bg-slate-100/70 rounded-lg text-right pr-3">
                                  Nível {level}
                                </span>
                                {evenDoors.map(door => {
                                  const respId = `door_${door}_level_${level.toLowerCase()}`;
                                  const resp = activeDryerSub.responses.find(r => r.itemId === respId || r.itemId.includes(`_${door}_level_${level.toLowerCase()}`));
                                  const valStr = resp ? String(resp.value).toLowerCase() : '';

                                  let bgClass = "bg-slate-100/50 border border-slate-200 text-slate-400";
                                  let code = "-";
                                  let titleTip = `Porta ${door} - Nível ${level}: Não Inspecionado`;

                                  if (valStr.includes('pouco') || valStr === 'pouco sujo' || valStr === 'pouco suja') {
                                    bgClass = "bg-emerald-500 text-white shadow-sm shadow-emerald-100 font-black";
                                    code = "3";
                                    titleTip = `Porta ${door} - Nível ${level}: Pouco Sujo (Código 3)`;
                                  } else if (valStr === 'sujo' || valStr === 'suja' || valStr.includes('amarelo') || valStr.includes('suj')) {
                                    bgClass = "bg-yellow-400 text-yellow-950 border border-yellow-500 shadow-sm shadow-yellow-50 font-black";
                                    code = "2";
                                    titleTip = `Porta ${door} - Nível ${level}: Sujo (Código 2)`;
                                  } else if (valStr.includes('tamponado') || valStr.includes('tamponada') || valStr === 'vermelho') {
                                    bgClass = "bg-rose-600 text-white shadow-md shadow-rose-100 font-black";
                                    code = "1";
                                    titleTip = `Porta ${door} - Nível ${level}: Tamponado (Código 1)`;
                                  }

                                  if (resp?.observation) {
                                    titleTip += ` | Obs: ${resp.observation}`;
                                  }

                                  return (
                                    <div
                                      key={door}
                                      title={titleTip}
                                      className={`h-9 flex items-center justify-center text-xs rounded-xl transition-all duration-300 cursor-help hover:scale-105 ${bgClass}`}
                                    >
                                      {code}
                                    </div>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Odd Doors (Lado Acionamento) */}
                  {(() => {
                    const oddDoors = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23];
                    const levels = ['A', 'B', 'C', 'D'];
                    return (
                      <div className="bg-slate-50/50 p-6 rounded-3xl border border-slate-100 space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="font-extrabold text-xs text-slate-700 uppercase tracking-wider">
                            Secador MS1 - Lado de Acionamento (Portas Ímpares)
                          </h4>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Vista Frontal</span>
                        </div>
                        <div className="overflow-x-auto pb-2">
                          <div className="min-w-[480px] space-y-2">
                            {/* Doors Header */}
                            <div className="grid grid-cols-[85px_repeat(12,1fr)] gap-1.5 items-center">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider text-right pr-2">PORTAS</span>
                              {oddDoors.map(door => (
                                <span key={door} className="text-center font-black text-slate-600 text-xs py-1.5 bg-slate-100 rounded-lg">
                                  {String(door).padStart(2, '0')}
                                </span>
                              ))}
                            </div>
                            {/* Level Rows */}
                            {levels.map(level => (
                              <div key={level} className="grid grid-cols-[85px_repeat(12,1fr)] gap-1.5 items-center">
                                <span className="font-extrabold text-slate-600 text-[11px] py-1 px-2 bg-slate-100/70 rounded-lg text-right pr-3">
                                  Nível {level}
                                </span>
                                {oddDoors.map(door => {
                                  const respId = `door_${door}_level_${level.toLowerCase()}`;
                                  const resp = activeDryerSub.responses.find(r => r.itemId === respId || r.itemId.includes(`_${door}_level_${level.toLowerCase()}`));
                                  const valStr = resp ? String(resp.value).toLowerCase() : '';

                                  let bgClass = "bg-slate-100/50 border border-slate-200 text-slate-400";
                                  let code = "-";
                                  let titleTip = `Porta ${door} - Nível ${level}: Não Inspecionado`;

                                  if (valStr.includes('pouco') || valStr === 'pouco sujo' || valStr === 'pouco suja') {
                                    bgClass = "bg-emerald-500 text-white shadow-sm shadow-emerald-100 font-black";
                                    code = "3";
                                    titleTip = `Porta ${door} - Nível ${level}: Pouco Sujo (Código 3)`;
                                  } else if (valStr === 'sujo' || valStr === 'suja' || valStr.includes('amarelo') || valStr.includes('suj')) {
                                    bgClass = "bg-yellow-400 text-yellow-950 border border-yellow-500 shadow-sm shadow-yellow-50 font-black";
                                    code = "2";
                                    titleTip = `Porta ${door} - Nível ${level}: Sujo (Código 2)`;
                                  } else if (valStr.includes('tamponado') || valStr.includes('tamponada') || valStr === 'vermelho') {
                                    bgClass = "bg-rose-600 text-white shadow-md shadow-rose-100 font-black";
                                    code = "1";
                                    titleTip = `Porta ${door} - Nível ${level}: Tamponado (Código 1)`;
                                  }

                                  if (resp?.observation) {
                                    titleTip += ` | Obs: ${resp.observation}`;
                                  }

                                  return (
                                    <div
                                      key={door}
                                      title={titleTip}
                                      className={`h-9 flex items-center justify-center text-xs rounded-xl transition-all duration-300 cursor-help hover:scale-105 ${bgClass}`}
                                    >
                                      {code}
                                    </div>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Legend of cleanliness evaluation criteria */}
                  <div className="bg-slate-50 p-4 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs">
                    <div className="flex flex-wrap items-center gap-6">
                      <span className="font-extrabold text-slate-500 uppercase tracking-wider">Critério de Avaliação:</span>
                      <div className="flex items-center gap-2">
                        <span className="w-4 h-4 bg-emerald-500 rounded-md shadow-sm"></span>
                        <span className="font-bold text-slate-700">Pouco Sujo (Conforme)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-4 h-4 bg-yellow-400 rounded-md border border-yellow-500 shadow-sm"></span>
                        <span className="font-bold text-slate-700">Sujo (Não Conforme Crítico)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-4 h-4 bg-rose-600 rounded-md shadow-md"></span>
                        <span className="font-bold text-slate-700">Tamponado (Não Conforme Crítico)</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 font-semibold italic">
                      * Passe o mouse sobre os quadradinhos para ver as observações e detalhes.
                    </p>
                  </div>
                </div>
              )}

             <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-8">
                   <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                     <BarChart3 className="w-6 h-6 text-emerald-600" />
                     Histórico de Inspeções
                   </h3>
                </div>

                <div className="space-y-4">
                  {submissions.map((sub, idx) => (
                    <div key={sub.id || `sub-${idx}`} className="group bg-slate-50/50 hover:bg-white p-6 rounded-2xl border border-transparent hover:border-slate-200 transition-all flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="flex items-center gap-6">
                        <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center font-black text-emerald-600 border border-slate-100">
                          {lines.find(l => l.id === sub.lineId)?.name || sectors.find(s => s.id === sub.sectorId)?.name || lines.find(l => l.id === sub.sectorId)?.name || 'N/A'}
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900">{templates.find(t => t.id === sub.templateId)?.name || 'Modelo Excluído'}</h4>
                          <p className="text-xs font-medium text-slate-400 mt-0.5">
                            Realizado por <span className="font-bold text-slate-600">{sub.userName}</span> no <span className="font-bold text-slate-600">{sub.shift}</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-8">
                         <div className="text-right">
                           <p className="text-xs font-black text-slate-900 uppercase tracking-widest">
                             {safeToDate(sub.createdAt)?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                           </p>
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                             {safeToDate(sub.createdAt)?.toLocaleDateString('pt-BR')}
                           </p>
                         </div>
                         {(isManager || isAdmin || isMaster) && (
                           <button 
                             onClick={() => setSubmissionToDelete(sub)}
                             className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                             title="Excluir Inspeção de Qualidade"
                           >
                             <Trash2 className="w-5 h-5" />
                           </button>
                         )}
                         <button 
                            onClick={() => generateSubmissionPDF(sub)}
                            className="p-2 text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                            title="Baixar PDF da Inspeção"
                          >
                            <Printer className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => setViewingSubmission(sub)}
                            className="p-2 text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                            title="Visualizar Detalhes"
                          >
                            <FileText className="w-5 h-5" />
                          </button>
                      </div>
                    </div>
                  ))}
                  {submissions.length === 0 && (
                    <p className="text-center py-20 text-slate-400 font-bold uppercase tracking-widest text-xs">Nenhuma inspeção registrada para exibir no histórico.</p>
                  )}
                </div>
             </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {justifyingOmission && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setJustifyingOmission(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl p-8 border border-slate-100"
            >
              <div className="flex items-center gap-4 mb-6">
                 <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600">
                   <AlertCircle className="w-6 h-6" />
                 </div>
                 <div>
                   <h3 className="text-xl font-black text-slate-900">Justificar Omissão</h3>
                   <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">{justifyingOmission.template.name}</p>
                 </div>
              </div>

              <div className="space-y-6">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <p className="text-sm text-slate-600 font-medium leading-relaxed">
                    Você está justificando por que não realizou <strong className="text-slate-900">{justifyingOmission.missing}</strong> inspeção(ões) 
                    {justifyingOmission.lineName && <>para a <strong className="text-slate-900">{justifyingOmission.lineName}</strong> </>}
                    no dia <strong className="text-slate-900">{justifyingOmission.date}</strong> ({justifyingOmission.shift}).
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Motivo da Não Realização</label>
                  <textarea
                    autoFocus
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    placeholder="Ex: Queda de energia, manutenção emergencial na linha, etc..."
                    className="w-full h-32 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-amber-500 outline-none font-medium resize-none transition-all"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setJustifyingOmission(null)}
                    className="flex-1 py-3 font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-all"
                  >
                    Voltar
                  </button>
                  <button
                    disabled={!justification.trim()}
                    onClick={handleSaveJustification}
                    className="flex-[2] py-3 bg-amber-600 text-white font-black rounded-xl hover:bg-amber-700 shadow-xl shadow-amber-100 transition-all disabled:opacity-50"
                  >
                    Confirmar Justificativa
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Submission Deletion Confirmation */}
      <ConfirmationModal
        isOpen={!!submissionToDelete}
        onClose={() => setSubmissionToDelete(null)}
        title="Excluir Inspeção de Qualidade?"
        message={`Deseja realmente excluir permanentemente esta inspeção de qualidade realizada por ${submissionToDelete?.userName}? Esta ação não poderá ser desfeita.`}
        type="warning"
        confirmText="Sim, Excluir"
        showConfirmButton={true}
        onConfirm={async () => {
          if (!submissionToDelete) return;
          try {
            await deleteDoc(doc(db, 'quality_checklist_submissions', submissionToDelete.id));
            setSubmissionToDelete(null);
            setModalConfig({
              isOpen: true,
              title: 'Inspeção Excluída',
              message: 'A inspeção de qualidade foi removida permanentemente do sistema.',
              type: 'success'
            });
          } catch (err) {
            handleFirestoreError(err, OperationType.DELETE, 'quality_checklist_submissions');
          }
        }}
      />

      {/* Template Deletion Confirmation */}
      <ConfirmationModal
        isOpen={!!templateToDelete}
        onClose={() => setTemplateToDelete(null)}
        title="Excluir Modelo?"
        message={`Deseja realmente excluir permanentemente o modelo "${templateToDelete?.name}"? Esta ação não poderá ser desfeita.`}
        type="warning"
        confirmText="Sim, Excluir"
        showConfirmButton={true}
        onConfirm={async () => {
          if (!templateToDelete) return;
          try {
            await deleteDoc(doc(db, 'quality_checklist_templates', templateToDelete.id));
            setTemplateToDelete(null);
          } catch (err) {
            handleFirestoreError(err, OperationType.DELETE, 'quality_checklist_templates');
          }
        }}
      />

      {/* Sector Deletion Confirmation */}
      <ConfirmationModal
        isOpen={!!sectorToDelete}
        onClose={() => setSectorToDelete(null)}
        title="Excluir Setor?"
        message={`Deseja realmente excluir o setor "${sectorToDelete?.name}"? Isso não removerá as linhas, apenas o agrupamento.`}
        type="warning"
        confirmText="Sim, Excluir"
        showConfirmButton={true}
        onConfirm={async () => {
          if (!sectorToDelete) return;
          try {
            await deleteDoc(doc(db, 'quality_sectors', sectorToDelete.id));
            setSectorToDelete(null);
          } catch (err) {
            handleFirestoreError(err, OperationType.DELETE, 'quality_sectors');
          }
        }}
      />

      {/* Line Deletion Confirmation */}
      <ConfirmationModal
        isOpen={!!lineToDelete}
        onClose={() => setLineToDelete(null)}
        title="Excluir Linha?"
        message={`Deseja realmente excluir permanentemente a linha de produção "${lineToDelete?.name}"? Isso pode remover a linha das visualizações ativas.`}
        type="warning"
        confirmText="Sim, Excluir"
        showConfirmButton={true}
        onConfirm={async () => {
          if (!lineToDelete) return;
          try {
            await deleteDoc(doc(db, 'production_lines', lineToDelete.id));
            setLineToDelete(null);
          } catch (err) {
            handleFirestoreError(err, OperationType.DELETE, 'production_lines');
          }
        }}
      />

      {/* Option Set Deletion Confirmation */}
      <ConfirmationModal
        isOpen={!!optionSetToDelete}
        onClose={() => setOptionSetToDelete(null)}
        title="Excluir Conjunto de Opções?"
        message={`Deseja realmente excluir o conjunto de opções "${optionSetToDelete?.name}"? Isso pode afetar os itens de modelos ativos que usam essa opção.`}
        type="warning"
        confirmText="Sim, Excluir"
        showConfirmButton={true}
        onConfirm={async () => {
          if (!optionSetToDelete) return;
          try {
            await deleteDoc(doc(db, 'quality_checklist_options', optionSetToDelete.id));
            setOptionSetToDelete(null);
          } catch (err) {
            handleFirestoreError(err, OperationType.DELETE, 'quality_checklist_options');
          }
        }}
      />

      {/* Global Alert Modal Config */}
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

      <AnimatePresence>
        {viewingSubmission && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setViewingSubmission(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl p-8 border border-slate-100 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
                    <ClipboardCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900">Detalhes da Inspeção</h3>
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                      {templates.find(t => t.id === viewingSubmission.templateId)?.name || 'Modelo Excluído'}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setViewingSubmission(null)}
                  className="p-2 hover:bg-slate-100 rounded-full text-slate-400 group transition-all"
                >
                  <X className="w-6 h-6 group-hover:text-rose-500" />
                </button>
              </div>

              <div className="mb-8 grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Local / Linha</p>
                  <p className="text-sm font-bold text-slate-900">
                    {lines.find(l => l.id === viewingSubmission.lineId)?.name || sectors.find(s => s.id === viewingSubmission.sectorId)?.name || lines.find(l => l.id === viewingSubmission.sectorId)?.name || 'N/A'}
                  </p>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Turno e Grupo</p>
                  <p className="text-sm font-bold text-slate-900">{viewingSubmission.shift}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Data / Hora</p>
                  <p className="text-sm font-bold text-slate-900">
                    {safeToDate(viewingSubmission.createdAt)?.toLocaleString('pt-BR')}
                  </p>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Inspecionado por</p>
                  <p className="text-sm font-bold text-slate-900">{viewingSubmission.userName}</p>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Respostas Coletadas</h4>
                {viewingSubmission.responses.map((resp, idx) => {
                  const template = templates.find(t => t.id === viewingSubmission.templateId);
                  const item = template?.items.find(i => i.id === resp.itemId);
                  const compliant = template ? isResponseCompliant(resp.itemId, resp.value, template) : true;
                  
                  return (
                    <div key={idx} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-4">
                      <div className="flex items-center justify-between gap-4">
                       <div className="flex items-center gap-4">
                         <div className={getIconColorClasses(resp.value, compliant)}>
                           {idx + 1}
                         </div>
                         <div>
                           <p className="text-sm font-bold text-slate-900">{item?.label || 'Item Removido'}</p>
                           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                             {item?.type === 'condition' ? `Opções (${optionSets.find(os => os.id === item.conditionOptionsId)?.name || 'OK/NOK' || 'OK/NOK'})` :
                              item?.type === 'number' ? 'Numérico' :
                              item?.type === 'range' ? 'Range (Baixo/Alto)' :
                              item?.type === 'barcode' ? 'Código / QR' :
                              item?.type === 'text' ? 'Texto Livre / Observação' :
                              (item?.type || 'N/A')}
                           </p>
                         </div>
                       </div>
                       <div className="text-right">
                         <div className={getBadgeColorClasses(resp.value, compliant)}>
                           {item?.type === 'text' ? 'TEXTO REGISTRADO' : (resp.value === 'ok' ? 'CONFORME' : (resp.value === 'not_ok' ? 'NÃO CONFORME' : resp.value))}
                          </div>
                       </div>
                      </div>
                      
                      {item?.type === 'text' && (
                        <div className="ml-14 bg-slate-50 border border-slate-100 p-4 rounded-xl text-xs font-semibold text-slate-600">
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Resposta / Texto Livre</span>
                          <span className="font-semibold text-slate-700 whitespace-pre-wrap">{resp.value}</span>
                        </div>
                      )}

                      {resp.observation && (
                        <div className="ml-14 bg-slate-50 border border-slate-100 p-4 rounded-xl text-xs font-semibold text-slate-600">
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Observação do Operador</span>
                          <span className="font-semibold text-slate-700">{resp.observation}</span>
                        </div>
                      )}
                    </div>
                  );
                  /*
                         </div>
                       </div>
                    </div>
                  );
                */})}
              </div>

              <div className="mt-10 flex flex-col sm:flex-row gap-3">
                 <button
                   onClick={() => generateSubmissionPDF(viewingSubmission)}
                   className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl transition-all shadow-xl shadow-emerald-100 flex items-center justify-center gap-2 uppercase tracking-wider text-xs"
                 >
                   <Printer className="w-5 h-5" /> Exportar PDF
                 </button>
                 <button
                   onClick={() => setViewingSubmission(null)}
                   className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-black rounded-2xl transition-all flex items-center justify-center gap-2 uppercase tracking-wider text-xs"
                 >
                   Fechar
                 </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Quality;
