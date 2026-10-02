import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ShieldAlert, 
  ShieldCheck, 
  Clock, 
  Calendar, 
  Plus, 
  Edit3, 
  Trash2, 
  Filter, 
  Search, 
  AlertTriangle, 
  CheckCircle2, 
  TrendingUp, 
  Maximize2, 
  Minimize2, 
  Download, 
  Share2, 
  FileText, 
  Info, 
  Layers, 
  Power, 
  RefreshCw, 
  Sliders, 
  ChevronRight, 
  X, 
  ArrowLeft,
  Activity,
  HeartPulse,
  Flame,
  Award
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp, 
  query, 
  orderBy,
  Timestamp 
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { cn, safeToDate, formatDateBR } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/errorHandler';
import { 
  SafetyIncident, 
  SafetyIncidentClassification, 
  SafetyCategoryConfig 
} from '../types';
import { 
  PieChart, 
  Pie, 
  Cell, 
  Tooltip, 
  ResponsiveContainer, 
  Legend 
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Default baseline data derived from the official plant safety board photo
export const DEFAULT_SAFETY_CATEGORIES: Record<SafetyIncidentClassification, SafetyCategoryConfig> = {
  SAFSR: {
    code: 'SAFSR',
    name: 'Sem Restrição',
    fullName: 'Acidente Sem Afastamento e Sem Restrição',
    color: '#2563eb', // Vibrant Blue
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-700',
    borderColor: 'border-blue-200',
    cardBg: 'bg-gradient-to-br from-blue-600 to-blue-700 text-white',
    gradient: 'from-blue-500 to-blue-600',
    initialDate: '2018-02-21T00:00:00',
    initialDescription: 'Ferimento labio superior Ventilador Resfriamento.'
  },
  APS: {
    code: 'APS',
    name: 'Simples Atendimento',
    fullName: 'Atendimento de Primeiros Socorros / Simples Atendimento',
    color: '#9333ea', // Vibrant Purple
    badgeBg: 'bg-purple-50',
    badgeText: 'text-purple-700',
    borderColor: 'border-purple-200',
    cardBg: 'bg-gradient-to-br from-purple-600 to-purple-700 text-white',
    gradient: 'from-purple-500 to-purple-600',
    initialDate: '2022-05-03T00:00:00',
    initialDescription: 'Corte contuso membro inferior - Parte Úmida'
  },
  CA: {
    code: 'CA',
    name: 'Com Afastamento',
    fullName: 'Acidente de Trabalho Com Afastamento',
    color: '#dc2626', // Vibrant Red
    badgeBg: 'bg-red-50',
    badgeText: 'text-red-700',
    borderColor: 'border-red-200',
    cardBg: 'bg-gradient-to-br from-rose-600 to-red-700 text-white',
    gradient: 'from-rose-500 to-red-600',
    initialDate: '2021-06-16T00:00:00',
    initialDescription: 'Prensamento de membro superior secador - MS1'
  },
  SAFCR: {
    code: 'SAFCR',
    name: 'Com Restrição',
    fullName: 'Acidente Sem Afastamento e Com Restrição',
    color: '#16a34a', // Vibrant Green
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-700',
    borderColor: 'border-emerald-200',
    cardBg: 'bg-gradient-to-br from-emerald-600 to-emerald-700 text-white',
    gradient: 'from-emerald-500 to-emerald-600',
    initialDate: '2020-03-15T00:00:00',
    initialDescription: 'Corte contuso membro superior direito canaleta Depuração'
  }
};

// 4 Official historical occurrences pre-populated from the plant safety board
export const INITIAL_HISTORICAL_INCIDENTS: SafetyIncident[] = [
  {
    id: 'safsr_20180221',
    classification: 'SAFSR',
    title: 'Ferimento labio superior Ventilador Resfriamento',
    date: new Date('2018-02-21T08:00:00'),
    description: 'Ferimento em lábio superior durante intervenção próxima ao Ventilador de Resfriamento.',
    sector: 'Secagem',
    equipment: 'Ventilador Resfriamento',
    bodyPart: 'Lábio superior',
    injuryType: 'Ferimento',
    lostDays: 0,
    restrictionDays: 0,
    preventiveActions: 'Adequação de proteção física do ventilador e uso obrigatório de protetor facial com visor ampliado.',
    registeredBy: 'Coordenação de Segurança',
    createdAt: new Date('2018-02-21T08:00:00')
  },
  {
    id: 'safcr_20200315',
    classification: 'SAFCR',
    title: 'Corte contuso membro superior direito canaleta Depuração',
    date: new Date('2020-03-15T08:00:00'),
    description: 'Corte contuso em membro superior direito junto à canaleta de Depuração com restrição de atividades sem afastamento.',
    sector: 'Depuração',
    equipment: 'Canaleta Depuração',
    bodyPart: 'Membro superior direito',
    injuryType: 'Corte contuso',
    lostDays: 0,
    restrictionDays: 10,
    preventiveActions: 'Instalação de guarda-corpo, proteção nas bordas da canaleta e luvas de corte nível 5.',
    registeredBy: 'Coordenação de Segurança',
    createdAt: new Date('2020-03-15T08:00:00')
  },
  {
    id: 'ca_20210616',
    classification: 'CA',
    title: 'Prensamento de membro superior secador - MS1',
    date: new Date('2021-06-16T08:00:00'),
    description: 'Prensamento de membro superior na estrutura do secador MS1, gerando afastamento para assistência e repouso médico.',
    sector: 'Secador',
    equipment: 'Secador - MS1',
    bodyPart: 'Membro superior',
    injuryType: 'Prensamento',
    lostDays: 15,
    restrictionDays: 0,
    preventiveActions: 'Revisão completa de procedimento LOTO, bloqueio de energias perigosas e sensores nas portas do secador.',
    registeredBy: 'Coordenação de Segurança',
    createdAt: new Date('2021-06-16T08:00:00')
  },
  {
    id: 'aps_20220503',
    classification: 'APS',
    title: 'Corte contuso membro inferior - Parte Úmida',
    date: new Date('2022-05-03T08:00:00'),
    description: 'Corte contuso em membro inferior no setor de Parte Úmida com simples atendimento ambulatorial, sem afastamento.',
    sector: 'Parte Úmida',
    equipment: 'Área Operacional',
    bodyPart: 'Membro inferior',
    injuryType: 'Corte contuso',
    lostDays: 0,
    restrictionDays: 0,
    preventiveActions: 'Uso obrigatório de perneiras de proteção e eliminação de arestas cortantes na passagem.',
    registeredBy: 'Coordenação de Segurança',
    createdAt: new Date('2022-05-03T08:00:00')
  }
];

export const SafetyIncidents: React.FC = () => {
  const { user, profile, isAdmin, isMaster } = useAuth();
  const canManage = isAdmin || isMaster;

  // Real-time states - Pre-populated with the 4 official historical occurrences
  const [incidents, setIncidents] = useState<SafetyIncident[]>(INITIAL_HISTORICAL_INCIDENTS);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState<Date>(new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [moduleActive, setModuleActive] = useState<boolean>(true);

  // Filter & Search states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<'all' | SafetyIncidentClassification>('all');
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(true);

  // Baseline config from Firestore (system_config/safety_baseline)
  const [baselineConfig, setBaselineConfig] = useState<Record<SafetyIncidentClassification, { initialDate: string; initialDescription: string }>>({
    SAFSR: { initialDate: '2018-02-21T00:00:00', initialDescription: 'Ferimento labio superior Ventilador Resfriamento.' },
    APS: { initialDate: '2022-05-03T00:00:00', initialDescription: 'Corte contuso membro inferior - Parte Úmida' },
    CA: { initialDate: '2021-06-16T00:00:00', initialDescription: 'Prensamento de membro superior secador - MS1' },
    SAFCR: { initialDate: '2020-03-15T00:00:00', initialDescription: 'Corte contuso membro superior direito canaleta Depuração' },
  });

  // Modal states
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [editingIncident, setEditingIncident] = useState<SafetyIncident | null>(null);
  const [incidentToDelete, setIncidentToDelete] = useState<SafetyIncident | null>(null);
  const [showBaselineModal, setShowBaselineModal] = useState(false);
  const [viewingIncident, setViewingIncident] = useState<SafetyIncident | null>(null);

  // Feedback notifications
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form states for Incident
  const [formClassification, setFormClassification] = useState<SafetyIncidentClassification>('SAFSR');
  const [formDate, setFormDate] = useState<string>('');
  const [formTime, setFormTime] = useState<string>('08:00');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formSector, setFormSector] = useState('');
  const [formEquipment, setFormEquipment] = useState('');
  const [formBodyPart, setFormBodyPart] = useState('');
  const [formInjuryType, setFormInjuryType] = useState('');
  const [formLostDays, setFormLostDays] = useState<number>(0);
  const [formRestrictionDays, setFormRestrictionDays] = useState<number>(0);
  const [formPreventiveActions, setFormPreventiveActions] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Form states for baseline editing
  const [editBaselines, setEditBaselines] = useState<Record<SafetyIncidentClassification, { initialDate: string; initialDescription: string }>>(baselineConfig);

  const containerRef = useRef<HTMLDivElement>(null);

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  // 1. Clock ticker: Updates every second for precision chronometer (days, hours, minutes, seconds)
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Subscribe to system_config/modules to check if module is enabled
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'system_config', 'modules'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.safety_incidents !== undefined) {
          setModuleActive(data.safety_incidents);
        }
      }
    }, (err) => {
      console.warn('Could not load system_config/modules:', err);
    });
    return () => unsub();
  }, []);

  // 3. Subscribe to system_config/safety_baseline
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'system_config', 'safety_baseline'), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as any;
        setBaselineConfig(prev => ({
          ...prev,
          ...data
        }));
        setEditBaselines(prev => ({
          ...prev,
          ...data
        }));
      }
    }, (err) => {
      console.warn('Could not load safety_baseline config:', err);
    });
    return () => unsub();
  }, []);

  // 4. Subscribe to system_config/safety_incidents & ensure pre-population of the 4 official occurrences
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'system_config', 'safety_incidents'), async (snap) => {
      if (snap.exists() && Array.isArray(snap.data()?.items) && snap.data().items.length > 0) {
        const rawItems: any[] = snap.data().items;
        const mapped: SafetyIncident[] = rawItems.map(item => ({
          ...item,
          date: safeToDate(item.date) || new Date(item.date),
          createdAt: safeToDate(item.createdAt) || new Date(item.createdAt)
        }));
        setIncidents(mapped);
        setLoading(false);
      } else {
        // If Firestore has not yet been seeded, display the 4 official historical occurrences
        setIncidents(INITIAL_HISTORICAL_INCIDENTS);
        setLoading(false);

        // Pre-populate directly into system_config if user is Admin or Master
        if (canManage) {
          try {
            await setDoc(doc(db, 'system_config', 'safety_incidents'), {
              items: INITIAL_HISTORICAL_INCIDENTS.map(i => ({
                ...i,
                date: (i.date instanceof Date ? i.date : new Date(i.date)).toISOString(),
                createdAt: (i.createdAt instanceof Date ? i.createdAt : new Date(i.createdAt)).toISOString()
              })),
              updatedAt: new Date().toISOString()
            }, { merge: true });
          } catch (seedErr) {
            console.warn('Pre-population notice for safety_incidents in system_config:', seedErr);
          }
        }
      }
    }, (err) => {
      console.warn('system_config/safety_incidents subscription notice:', err);
      setIncidents(INITIAL_HISTORICAL_INCIDENTS);
      setLoading(false);
    });
    return () => unsub();
  }, [canManage]);

  // Restore or re-seed the 4 official board occurrences
  const handleRestoreBoardIncidents = async () => {
    if (!canManage) return;
    try {
      setLoading(true);
      await setDoc(doc(db, 'system_config', 'safety_incidents'), {
        items: INITIAL_HISTORICAL_INCIDENTS.map(i => ({
          ...i,
          date: (i.date instanceof Date ? i.date : new Date(i.date)).toISOString(),
          createdAt: (i.createdAt instanceof Date ? i.createdAt : new Date(i.createdAt)).toISOString()
        })),
        updatedAt: new Date().toISOString(),
        updatedBy: profile?.displayName || auth.currentUser?.displayName || 'Administrador'
      }, { merge: true });
      setIncidents(INITIAL_HISTORICAL_INCIDENTS);
      showNotification('As 4 ocorrências oficiais da placa foram sincronizadas com sucesso!');
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, 'system_config/safety_incidents');
      showNotification('Erro ao sincronizar ocorrências da placa.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Calculate stats for each category:
  // Most recent incident date OR baseline date
  const categoryStats = useMemo(() => {
    const categories: SafetyIncidentClassification[] = ['SAFSR', 'CA', 'SAFCR', 'APS'];
    
    return categories.map(cat => {
      const config = DEFAULT_SAFETY_CATEGORIES[cat];
      const baseline = baselineConfig[cat] || {
        initialDate: config.initialDate,
        initialDescription: config.initialDescription
      };

      // Filter incidents for this category
      const catIncidents = incidents.filter(i => i.classification === cat);
      
      let referenceDate: Date;
      let referenceTitle: string;
      let isFromIncident = false;
      let latestIncident: SafetyIncident | null = null;

      if (catIncidents.length > 0) {
        // Sort by date descending
        const sorted = [...catIncidents].sort((a, b) => {
          const tA = safeToDate(a.date)?.getTime() || 0;
          const tB = safeToDate(b.date)?.getTime() || 0;
          return tB - tA;
        });
        latestIncident = sorted[0];
        referenceDate = safeToDate(latestIncident.date) || new Date(baseline.initialDate || '2020-01-01');
        referenceTitle = latestIncident.title || baseline.initialDescription || 'Sem detalhes';
        isFromIncident = true;
      } else {
        referenceDate = new Date(baseline.initialDate || '2020-01-01');
        referenceTitle = baseline.initialDescription || 'Registro inicial de referência';
      }

      // Start of reference calendar day and start of today
      const startOfRef = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate(), 0, 0, 0, 0);
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

      // Total calendar days up to today
      const calendarDaysToToday = Math.round((startOfToday.getTime() - startOfRef.getTime()) / (1000 * 60 * 60 * 24));

      // As requested: the official count represents completed full days closed up to yesterday 23:59:59 (1 day less than today).
      // Today is still ongoing and only counts as a completed safe day at 00:00:00 of tomorrow.
      const totalDays = Math.max(0, calendarDaysToToday - 1);

      // Current ongoing day progress (hours, minutes, seconds counting towards completing today)
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const seconds = now.getSeconds();

      // Calculation of completed full years up to yesterday
      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
      let years = yesterday.getFullYear() - startOfRef.getFullYear();
      let tempYearDate = new Date(startOfRef.getFullYear() + years, startOfRef.getMonth(), startOfRef.getDate(), 0, 0, 0, 0);
      if (tempYearDate > yesterday) {
        years--;
        tempYearDate = new Date(startOfRef.getFullYear() + years, startOfRef.getMonth(), startOfRef.getDate(), 0, 0, 0, 0);
      }
      const remainingDays = Math.max(0, Math.round((yesterday.getTime() - tempYearDate.getTime()) / (1000 * 60 * 60 * 24)));

      const yearLabel = years === 1 ? '1 ano' : `${years} anos`;
      const chronometerString = years > 0
        ? `${yearLabel}, ${remainingDays}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`
        : `${remainingDays}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;

      return {
        code: cat,
        config,
        referenceDate,
        referenceTitle,
        isFromIncident,
        latestIncident,
        years,
        remainingDays,
        totalDays,
        hours,
        minutes,
        seconds,
        chronometerString,
        totalIncidents: catIncidents.length
      };
    });
  }, [incidents, baselineConfig, now]);

  // Chart data for Pie Chart
  const pieChartData = useMemo(() => {
    return categoryStats.map(stat => ({
      name: stat.code,
      fullName: stat.config.name,
      value: stat.totalDays,
      color: stat.config.color,
      daysLabel: `${stat.totalDays.toLocaleString('pt-BR')} dias`,
      code: stat.code
    }));
  }, [categoryStats]);

  // Total safe days across all categories (days without any CA)
  const caStat = categoryStats.find(s => s.code === 'CA');
  const safsrStat = categoryStats.find(s => s.code === 'SAFSR');
  const safcrStat = categoryStats.find(s => s.code === 'SAFCR');
  const apsStat = categoryStats.find(s => s.code === 'APS');

  // Filtered incidents for table
  const filteredIncidents = useMemo(() => {
    return incidents.filter(item => {
      const matchesCategory = selectedCategoryFilter === 'all' || item.classification === selectedCategoryFilter;
      const q = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm || 
        (item.title || '').toLowerCase().includes(q) ||
        (item.description || '').toLowerCase().includes(q) ||
        (item.sector || '').toLowerCase().includes(q) ||
        (item.equipment || '').toLowerCase().includes(q) ||
        (item.bodyPart || '').toLowerCase().includes(q) ||
        (item.injuryType || '').toLowerCase().includes(q) ||
        (item.registeredBy || '').toLowerCase().includes(q);
      
      return matchesCategory && matchesSearch;
    });
  }, [incidents, selectedCategoryFilter, searchTerm]);

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setEditingIncident(null);
    setFormClassification('SAFSR');
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    setFormDate(`${y}-${m}-${d}`);
    setFormTime('08:00');
    setFormTitle('');
    setFormDescription('');
    setFormSector('');
    setFormEquipment('');
    setFormBodyPart('');
    setFormInjuryType('');
    setFormLostDays(0);
    setFormRestrictionDays(0);
    setFormPreventiveActions('');
    setShowIncidentModal(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (incident: SafetyIncident) => {
    setEditingIncident(incident);
    setFormClassification(incident.classification);
    const dObj = safeToDate(incident.date) || new Date();
    const y = dObj.getFullYear();
    const m = String(dObj.getMonth() + 1).padStart(2, '0');
    const d = String(dObj.getDate()).padStart(2, '0');
    const hh = String(dObj.getHours()).padStart(2, '0');
    const mm = String(dObj.getMinutes()).padStart(2, '0');
    setFormDate(`${y}-${m}-${d}`);
    setFormTime(`${hh}:${mm}`);
    setFormTitle(incident.title || '');
    setFormDescription(incident.description || '');
    setFormSector(incident.sector || '');
    setFormEquipment(incident.equipment || '');
    setFormBodyPart(incident.bodyPart || '');
    setFormInjuryType(incident.injuryType || '');
    setFormLostDays(incident.lostDays || 0);
    setFormRestrictionDays(incident.restrictionDays || 0);
    setFormPreventiveActions(incident.preventiveActions || '');
    setShowIncidentModal(true);
  };

  // Save Incident (Create or Update)
  const handleSaveIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) {
      showNotification('Apenas administradores e master podem salvar ocorrências.', 'error');
      return;
    }
    if (!formTitle.trim() || !formDate) {
      showNotification('Preencha os campos obrigatórios (Título e Data).', 'error');
      return;
    }

    setFormSubmitting(true);
    try {
      const [year, month, day] = formDate.split('-').map(Number);
      const [hours, minutes] = (formTime || '00:00').split(':').map(Number);
      const incidentDate = new Date(year, month - 1, day, hours || 0, minutes || 0, 0);

      const editorName = profile?.displayName || auth.currentUser?.displayName || profile?.email || 'Administrador';

      let updatedList: SafetyIncident[] = [...incidents];

      if (editingIncident) {
        updatedList = updatedList.map(item => {
          if (item.id === editingIncident.id) {
            return {
              ...item,
              classification: formClassification,
              date: incidentDate,
              title: formTitle.trim(),
              description: formDescription.trim(),
              sector: formSector.trim(),
              equipment: formEquipment.trim(),
              bodyPart: formBodyPart.trim(),
              injuryType: formInjuryType.trim(),
              lostDays: formClassification === 'CA' ? Number(formLostDays) || 0 : 0,
              restrictionDays: formClassification === 'SAFCR' ? Number(formRestrictionDays) || 0 : 0,
              preventiveActions: formPreventiveActions.trim(),
              editadoPor: editorName,
              ultimaAlteracao: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
          }
          return item;
        });
        showNotification('Ocorrência atualizada com sucesso!');
      } else {
        const newRecord: SafetyIncident = {
          id: `inc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          classification: formClassification,
          date: incidentDate,
          title: formTitle.trim(),
          description: formDescription.trim(),
          sector: formSector.trim(),
          equipment: formEquipment.trim(),
          bodyPart: formBodyPart.trim(),
          injuryType: formInjuryType.trim(),
          lostDays: formClassification === 'CA' ? Number(formLostDays) || 0 : 0,
          restrictionDays: formClassification === 'SAFCR' ? Number(formRestrictionDays) || 0 : 0,
          preventiveActions: formPreventiveActions.trim(),
          registeredBy: editorName,
          registeredByUid: auth.currentUser?.uid || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        updatedList = [newRecord, ...updatedList];
        showNotification('Nova ocorrência registrada no painel!');
      }

      // Sort by date descending
      updatedList.sort((a, b) => {
        const tA = (a.date instanceof Date ? a.date : new Date(a.date)).getTime();
        const tB = (b.date instanceof Date ? b.date : new Date(b.date)).getTime();
        return tB - tA;
      });

      // Save to system_config/safety_incidents (always allowed for signed-in users)
      await setDoc(doc(db, 'system_config', 'safety_incidents'), {
        items: updatedList.map(item => ({
          ...item,
          date: (item.date instanceof Date ? item.date : new Date(item.date)).toISOString(),
          createdAt: (item.createdAt instanceof Date ? item.createdAt : new Date(item.createdAt)).toISOString()
        })),
        updatedAt: new Date().toISOString(),
        updatedBy: editorName
      }, { merge: true });

      setIncidents(updatedList);
      setShowIncidentModal(false);
      setEditingIncident(null);
    } catch (err: any) {
      handleFirestoreError(err, editingIncident ? OperationType.UPDATE : OperationType.CREATE, 'system_config/safety_incidents');
      showNotification('Erro ao salvar ocorrência.', 'error');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Delete Incident
  const handleDeleteIncident = async () => {
    if (!incidentToDelete || !canManage) return;
    try {
      const editorName = profile?.displayName || auth.currentUser?.displayName || 'Administrador';
      const updatedList = incidents.filter(i => i.id !== incidentToDelete.id);

      await setDoc(doc(db, 'system_config', 'safety_incidents'), {
        items: updatedList.map(item => ({
          ...item,
          date: (item.date instanceof Date ? item.date : new Date(item.date)).toISOString(),
          createdAt: (item.createdAt instanceof Date ? item.createdAt : new Date(item.createdAt)).toISOString()
        })),
        updatedAt: new Date().toISOString(),
        updatedBy: editorName
      }, { merge: true });

      setIncidents(updatedList);
      showNotification('Ocorrência excluída com sucesso!');
      setIncidentToDelete(null);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, 'system_config/safety_incidents');
      showNotification('Erro ao excluir ocorrência.', 'error');
    }
  };

  // Save Baseline Configuration
  const handleSaveBaselines = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    try {
      await setDoc(doc(db, 'system_config', 'safety_baseline'), editBaselines, { merge: true });
      showNotification('Marcos iniciais históricos atualizados com sucesso!');
      setShowBaselineModal(false);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, 'system_config/safety_baseline');
      showNotification('Erro ao salvar marcos iniciais.', 'error');
    }
  };

  // Toggle Fullscreen
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Export PDF Report
  const handleExportPDF = () => {
    try {
      const docPdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      
      // Header
      docPdf.setFillColor(15, 23, 42); // slate-900
      docPdf.rect(0, 0, 297, 24, 'F');
      
      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(14);
      docPdf.setTextColor(255, 255, 255);
      docPdf.text('RELATÓRIO DE SEGURANÇA DO TRABALHO - DIAS SEM ACIDENTES', 14, 12);
      
      docPdf.setFontSize(8);
      docPdf.setFont('helvetica', 'normal');
      docPdf.text(`Unidade Cuiabá - MT | Emitido em: ${now.toLocaleString('pt-BR')}`, 14, 19);

      // Category Summary Box
      let startY = 32;
      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(11);
      docPdf.setTextColor(15, 23, 42);
      docPdf.text('EVOLUÇÃO DOS DIAS SEM ACIDENTES POR CLASSIFICAÇÃO', 14, startY);

      const tableData = categoryStats.map(s => [
        s.code,
        s.config.name,
        `${s.totalDays.toLocaleString('pt-BR')} dias`,
        formatDateBR(s.referenceDate),
        s.referenceTitle,
        s.chronometerString
      ]);

      autoTable(docPdf, {
        startY: startY + 4,
        head: [['Sigla', 'Classificação', 'Dias Sem Acidentes', 'Último Ocorrido', 'Descrição do Evento / Equipamento', 'Tempo Corrido']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 3 },
        columnStyles: {
          0: { fontStyle: 'bold', halign: 'center', cellWidth: 20 },
          1: { fontStyle: 'bold', cellWidth: 45 },
          2: { fontStyle: 'bold', halign: 'center', cellWidth: 35 },
          3: { halign: 'center', cellWidth: 25 },
          4: { cellWidth: 95 },
          5: { fontStyle: 'bold', halign: 'center', cellWidth: 45 }
        }
      });

      // History Table
      const finalY = (docPdf as any).lastAutoTable?.finalY || 100;
      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(11);
      docPdf.setTextColor(15, 23, 42);
      docPdf.text('HISTÓRICO RECENTE DE OCORRÊNCIAS REGISTRADAS', 14, finalY + 10);

      const incidentTableData = incidents.slice(0, 15).map(inc => [
        formatDateBR(inc.date),
        inc.classification,
        inc.title,
        inc.sector || '-',
        inc.equipment || '-',
        inc.bodyPart || '-',
        inc.injuryType || '-',
        inc.registeredBy || 'Admin'
      ]);

      if (incidentTableData.length > 0) {
        autoTable(docPdf, {
          startY: finalY + 14,
          head: [['Data', 'Tipo', 'Título da Ocorrência', 'Setor', 'Equipamento', 'Parte do Corpo', 'Lesão', 'Registrado Por']],
          body: incidentTableData,
          theme: 'striped',
          headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
          styles: { fontSize: 7, cellPadding: 2.5 }
        });
      } else {
        docPdf.setFont('helvetica', 'italic');
        docPdf.setFontSize(8);
        docPdf.setTextColor(100, 116, 139);
        docPdf.text('Nenhuma ocorrência registrada além dos marcos históricos iniciais.', 14, finalY + 18);
      }

      // Footer
      const pageCount = (docPdf as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        docPdf.setPage(i);
        docPdf.setFontSize(7);
        docPdf.setTextColor(148, 163, 184);
        docPdf.text(`Página ${i} de ${pageCount} • SecApp - Gestão de Segurança Operacional`, 14, 202);
      }

      docPdf.save(`Evolucao_Dias_Sem_Acidentes_${now.toISOString().split('T')[0]}.pdf`);
      showNotification('Relatório PDF gerado e baixado com sucesso!');
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
      showNotification('Erro ao exportar PDF.', 'error');
    }
  };

  // If module is deactivated and user is not admin
  if (!moduleActive && !canManage) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-slate-200 text-center shadow-sm space-y-4">
          <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto text-amber-500">
            <Power className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">Módulo Desativado</h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            O painel de ocorrências de segurança está desativado nas configurações do Painel Administrativo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn("space-y-8 pb-16 transition-colors", isFullscreen && "bg-slate-950 p-6 overflow-y-auto")}>
      
      {/* Toast Notification */}
      <AnimatePresence>
        {feedback && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={cn(
              "fixed top-4 right-4 z-50 px-4 py-3 rounded-2xl shadow-xl border flex items-center gap-2 text-sm font-bold backdrop-blur-md",
              feedback.type === 'success' 
                ? "bg-emerald-500/90 text-white border-emerald-400" 
                : "bg-rose-500/90 text-white border-rose-400"
            )}
          >
            {feedback.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
            <span>{feedback.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Header & Actions Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
              Segurança do Trabalho & CIPA
            </span>
            {!moduleActive && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-200 flex items-center gap-1">
                <Power className="w-3 h-3" /> Desativado no Painel Administrativo
              </span>
            )}
          </div>
          <h1 className={cn("text-2xl sm:text-3xl font-black tracking-tight", isFullscreen ? "text-white" : "text-slate-900")}>
            Ocorrências de Segurança
          </h1>
          <p className={cn("text-xs sm:text-sm mt-0.5", isFullscreen ? "text-slate-400" : "text-slate-500")}>
            Painel Oficial de Evolução em Dias Sem Acidentes com cronômetro em tempo real
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          {/* Export PDF Button */}
          <button
            onClick={handleExportPDF}
            className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer"
            title="Exportar painel em PDF"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span className="hidden sm:inline">Exportar PDF</span>
          </button>

          {/* Fullscreen TV Mode */}
          <button
            onClick={toggleFullscreen}
            className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer"
            title={isFullscreen ? "Sair da Tela Cheia" : "Modo TV / Painel em Tela Cheia"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4 text-slate-600" /> : <Maximize2 className="w-4 h-4 text-slate-600" />}
            <span className="hidden sm:inline">{isFullscreen ? 'Sair da TV' : 'Modo TV'}</span>
          </button>

          {/* Admin Baseline Config */}
          {canManage && (
            <button
              onClick={() => {
                setEditBaselines(baselineConfig);
                setShowBaselineModal(true);
              }}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer"
              title="Ajustar marcos iniciais históricos"
            >
              <Sliders className="w-4 h-4 text-slate-600" />
              <span className="hidden sm:inline">Marcos Iniciais</span>
            </button>
          )}

          {/* Admin Register Incident */}
          {canManage && (
            <button
              onClick={handleOpenCreateModal}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-md shadow-emerald-600/20 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Registrar Ocorrência</span>
            </button>
          )}
        </div>
      </div>

      {/* ============================================================== */}
      {/* PAINEL CENTRAL IDÊNTICO À FOTO: EVOLUÇÃO EM DIAS SEM ACIDENTES */}
      {/* ============================================================== */}
      <div className={cn(
        "rounded-[2.5rem] p-6 sm:p-10 border transition-all shadow-xl relative overflow-hidden",
        isFullscreen 
          ? "bg-slate-900 border-slate-800 text-white" 
          : "bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-slate-800 text-white"
      )}>
        {/* Subtle decorative glow */}
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Top Header of the Board */}
        <div className="flex flex-col items-center justify-center text-center mb-8 relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-800/90 border border-slate-700 text-slate-300 text-xs font-bold uppercase tracking-widest shadow-inner mb-3">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Painel Oficial de Segurança</span>
          </div>

          <div className="bg-slate-800/80 border border-slate-700/80 px-6 py-2 rounded-2xl shadow-md mb-2">
            <h2 className="text-xl sm:text-3xl font-black uppercase tracking-wider text-white">
              EVOLUÇÃO EM DIAS SEM ACIDENTES
            </h2>
          </div>

          {/* Real-time updating banner */}
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-400 mt-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>Atualização em tempo real (Fuso de Cuiabá) • Cronômetro contínuo</span>
          </div>
        </div>

        {/* Central Layout: 4 Cards around the Circular 3D Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center relative z-10">
          
          {/* Left Column Cards: SAFSR (Top-Left) & APS (Bottom-Left) */}
          <div className="lg:col-span-3 space-y-6">
            {/* 1. SAFSR Card */}
            {safsrStat && (
              <motion.div 
                whileHover={{ scale: 1.02 }}
                className="bg-blue-600/90 backdrop-blur-md border border-blue-400/40 rounded-3xl p-5 shadow-2xl relative overflow-hidden group"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <span className="text-xl sm:text-2xl font-black tracking-wider text-white block">
                      SAFSR
                    </span>
                    <span className="text-xs font-bold text-blue-100 uppercase tracking-wide">
                      Sem Restrição
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl sm:text-3xl font-black text-white tabular-nums drop-shadow-md">
                      {safsrStat.totalDays.toLocaleString('pt-BR')}
                    </span>
                    <span className="text-[10px] block font-black uppercase tracking-wider text-blue-200">
                      Dias Sem Acidentes
                    </span>
                    {safsrStat.years > 0 && (
                      <span className="inline-block mt-0.5 px-2 py-0.5 rounded-md bg-blue-900/80 text-blue-100 text-[10px] font-black uppercase tracking-wider border border-blue-400/40">
                        {safsrStat.years} {safsrStat.years === 1 ? 'ano' : 'anos'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Chronometer */}
                <div className="bg-blue-900/60 border border-blue-400/30 rounded-xl px-3 py-1.5 flex items-center justify-between text-xs font-mono text-blue-200 font-bold mb-3 shadow-inner">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-blue-300" />
                    <span>Cronômetro:</span>
                  </div>
                  <span className="text-white text-xs">{safsrStat.chronometerString}</span>
                </div>

                {/* Last Occurrence Info */}
                <div className="bg-blue-700/60 rounded-xl p-3 border border-blue-400/30 text-[11px] text-blue-50 leading-relaxed">
                  <div className="flex items-center gap-1 font-bold text-blue-200 mb-1">
                    <Calendar className="w-3 h-3" />
                    <span>{formatDateBR(safsrStat.referenceDate)}</span>
                  </div>
                  <p className="line-clamp-2 font-medium">
                    {safsrStat.referenceTitle}
                  </p>
                </div>
              </motion.div>
            )}

            {/* 2. APS Card */}
            {apsStat && (
              <motion.div 
                whileHover={{ scale: 1.02 }}
                className="bg-purple-600/90 backdrop-blur-md border border-purple-400/40 rounded-3xl p-5 shadow-2xl relative overflow-hidden group"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <span className="text-xl sm:text-2xl font-black tracking-wider text-white block">
                      APS
                    </span>
                    <span className="text-xs font-bold text-purple-100 uppercase tracking-wide">
                      Simples Atendimento
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl sm:text-3xl font-black text-white tabular-nums drop-shadow-md">
                      {apsStat.totalDays.toLocaleString('pt-BR')}
                    </span>
                    <span className="text-[10px] block font-black uppercase tracking-wider text-purple-200">
                      Dias Sem Acidentes
                    </span>
                    {apsStat.years > 0 && (
                      <span className="inline-block mt-0.5 px-2 py-0.5 rounded-md bg-purple-900/80 text-purple-100 text-[10px] font-black uppercase tracking-wider border border-purple-400/40">
                        {apsStat.years} {apsStat.years === 1 ? 'ano' : 'anos'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Chronometer */}
                <div className="bg-purple-900/60 border border-purple-400/30 rounded-xl px-3 py-1.5 flex items-center justify-between text-xs font-mono text-purple-200 font-bold mb-3 shadow-inner">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-purple-300" />
                    <span>Cronômetro:</span>
                  </div>
                  <span className="text-white text-xs">{apsStat.chronometerString}</span>
                </div>

                {/* Last Occurrence Info */}
                <div className="bg-purple-700/60 rounded-xl p-3 border border-purple-400/30 text-[11px] text-purple-50 leading-relaxed">
                  <div className="flex items-center gap-1 font-bold text-purple-200 mb-1">
                    <Calendar className="w-3 h-3" />
                    <span>{formatDateBR(apsStat.referenceDate)}</span>
                  </div>
                  <p className="line-clamp-2 font-medium">
                    {apsStat.referenceTitle}
                  </p>
                </div>
              </motion.div>
            )}
          </div>

          {/* Center Column: The Central Pie / Donut Chart */}
          <div className="lg:col-span-6 flex flex-col items-center justify-center p-4">
            <div className="w-full h-72 sm:h-96 relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-slate-900/95 border border-slate-700 p-3 rounded-xl shadow-2xl text-xs space-y-1 backdrop-blur-md">
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: data.color }} />
                              <strong className="text-white font-bold text-sm">{data.name} - {data.fullName}</strong>
                            </div>
                            <p className="text-slate-300 font-bold">
                              Dias sem Acidentes: <span className="text-emerald-400 text-sm font-mono">{data.value.toLocaleString('pt-BR')}</span>
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Pie
                    data={pieChartData}
                    cx="50%"
                    cy="50%"
                    outerRadius={120}
                    innerRadius={45}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ payload }) => `${payload.name}: ${payload.value.toLocaleString('pt-BR')}`}
                    labelLine={{ stroke: '#94a3b8', strokeWidth: 1.5 }}
                  >
                    {pieChartData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.color} 
                        stroke="#0f172a" 
                        strokeWidth={3}
                        className="cursor-pointer transition-transform hover:scale-105"
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Central Legend / Badges */}
            <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
              {pieChartData.map((p, idx) => (
                <div key={idx} className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-800/90 border border-slate-700/80 text-xs">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                  <span className="font-bold text-white">{p.name}:</span>
                  <span className="font-mono text-slate-300 font-bold">{p.value.toLocaleString('pt-BR')}d</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column Cards: CA (Top-Right) & SAFCR (Bottom-Right) */}
          <div className="lg:col-span-3 space-y-6">
            {/* 3. CA Card */}
            {caStat && (
              <motion.div 
                whileHover={{ scale: 1.02 }}
                className="bg-red-600/90 backdrop-blur-md border border-red-400/40 rounded-3xl p-5 shadow-2xl relative overflow-hidden group"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <span className="text-xl sm:text-2xl font-black tracking-wider text-white block">
                      CA
                    </span>
                    <span className="text-xs font-bold text-red-100 uppercase tracking-wide">
                      Com Afastamento
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl sm:text-3xl font-black text-white tabular-nums drop-shadow-md">
                      {caStat.totalDays.toLocaleString('pt-BR')}
                    </span>
                    <span className="text-[10px] block font-black uppercase tracking-wider text-red-200">
                      Dias Sem Acidentes
                    </span>
                    {caStat.years > 0 && (
                      <span className="inline-block mt-0.5 px-2 py-0.5 rounded-md bg-red-900/80 text-red-100 text-[10px] font-black uppercase tracking-wider border border-red-400/40">
                        {caStat.years} {caStat.years === 1 ? 'ano' : 'anos'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Chronometer */}
                <div className="bg-red-900/60 border border-red-400/30 rounded-xl px-3 py-1.5 flex items-center justify-between text-xs font-mono text-red-200 font-bold mb-3 shadow-inner">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-red-300" />
                    <span>Cronômetro:</span>
                  </div>
                  <span className="text-white text-xs">{caStat.chronometerString}</span>
                </div>

                {/* Last Occurrence Info */}
                <div className="bg-red-700/60 rounded-xl p-3 border border-red-400/30 text-[11px] text-red-50 leading-relaxed">
                  <div className="flex items-center gap-1 font-bold text-red-200 mb-1">
                    <Calendar className="w-3 h-3" />
                    <span>{formatDateBR(caStat.referenceDate)}</span>
                  </div>
                  <p className="line-clamp-2 font-medium">
                    {caStat.referenceTitle}
                  </p>
                </div>
              </motion.div>
            )}

            {/* 4. SAFCR Card */}
            {safcrStat && (
              <motion.div 
                whileHover={{ scale: 1.02 }}
                className="bg-emerald-600/90 backdrop-blur-md border border-emerald-400/40 rounded-3xl p-5 shadow-2xl relative overflow-hidden group"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <span className="text-xl sm:text-2xl font-black tracking-wider text-white block">
                      SAFCR
                    </span>
                    <span className="text-xs font-bold text-emerald-100 uppercase tracking-wide">
                      Com Restrição
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl sm:text-3xl font-black text-white tabular-nums drop-shadow-md">
                      {safcrStat.totalDays.toLocaleString('pt-BR')}
                    </span>
                    <span className="text-[10px] block font-black uppercase tracking-wider text-emerald-200">
                      Dias Sem Acidentes
                    </span>
                    {safcrStat.years > 0 && (
                      <span className="inline-block mt-0.5 px-2 py-0.5 rounded-md bg-emerald-900/80 text-emerald-100 text-[10px] font-black uppercase tracking-wider border border-emerald-400/40">
                        {safcrStat.years} {safcrStat.years === 1 ? 'ano' : 'anos'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Chronometer */}
                <div className="bg-emerald-900/60 border border-emerald-400/30 rounded-xl px-3 py-1.5 flex items-center justify-between text-xs font-mono text-emerald-200 font-bold mb-3 shadow-inner">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-emerald-300" />
                    <span>Cronômetro:</span>
                  </div>
                  <span className="text-white text-xs">{safcrStat.chronometerString}</span>
                </div>

                {/* Last Occurrence Info */}
                <div className="bg-emerald-700/60 rounded-xl p-3 border border-emerald-400/30 text-[11px] text-emerald-50 leading-relaxed">
                  <div className="flex items-center gap-1 font-bold text-emerald-200 mb-1">
                    <Calendar className="w-3 h-3" />
                    <span>{formatDateBR(safcrStat.referenceDate)}</span>
                  </div>
                  <p className="line-clamp-2 font-medium">
                    {safcrStat.referenceTitle}
                  </p>
                </div>
              </motion.div>
            )}
          </div>
        </div>

        {/* Bottom Banner as in the Photo ("ATUALIZADO ATÉ DIA DD/MM/AAAA") */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 relative z-10">
          <div className="bg-slate-800/90 border border-slate-700 px-6 py-2.5 rounded-2xl shadow-lg flex flex-col sm:flex-row items-center gap-2 text-center">
            <span className="text-xs sm:text-sm font-black uppercase tracking-widest text-slate-200">
              ATUALIZADO ATÉ O DIA:
            </span>
            <span className="text-xs sm:text-sm font-black text-emerald-400 font-mono">
              {formatDateBR(now)} às {now.toLocaleTimeString('pt-BR')}
            </span>
            <span className="text-[11px] text-slate-400 sm:border-l sm:border-slate-700 sm:pl-2">
              (Dias completos fechados até ontem às 23:59 • Dia atual em andamento)
            </span>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* HISTÓRICO COMPLETO E GERENCIAMENTO DE OCORRÊNCIAS              */}
      {/* ============================================================== */}
      <div className="bg-white rounded-[2rem] border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-black text-slate-900 tracking-tight">
                Histórico de Ocorrências Registradas
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                {incidents.length} {incidents.length === 1 ? 'registro' : 'registros'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Registro cronológico de acidentes, atendimentos e eventos de segurança do trabalho
            </p>
          </div>

          {canManage && (
            <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
              <button
                onClick={handleRestoreBoardIncidents}
                className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 border border-slate-200 transition-all cursor-pointer"
                title="Sincronizar/Restaurar as 4 ocorrências originais da placa de segurança"
              >
                <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                <span>Restaurar 4 da Placa</span>
              </button>

              <button
                onClick={handleOpenCreateModal}
                className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4 text-emerald-400 stroke-[3]" />
                <span>Cadastrar Ocorrência</span>
              </button>
            </div>
          )}
        </div>

        {/* Filter bar & Search */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* Classification Pill Filters */}
          <div className="flex items-center flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategoryFilter('all')}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
                selectedCategoryFilter === 'all'
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              Todos ({incidents.length})
            </button>

            {(['SAFSR', 'CA', 'SAFCR', 'APS'] as SafetyIncidentClassification[]).map((cat) => {
              const count = incidents.filter(i => i.classification === cat).length;
              const cfg = DEFAULT_SAFETY_CATEGORIES[cat];
              const isSelected = selectedCategoryFilter === cat;

              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategoryFilter(cat)}
                  className={cn(
                    "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border",
                    isSelected
                      ? "text-white shadow-sm"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  )}
                  style={{
                    backgroundColor: isSelected ? cfg.color : undefined,
                    borderColor: isSelected ? cfg.color : undefined
                  }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: isSelected ? '#ffffff' : cfg.color }} />
                  <span>{cat}</span>
                  <span className="text-[10px] opacity-80">({count})</span>
                </button>
              );
            })}
          </div>

          {/* Search Input */}
          <div className="relative min-w-[260px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por descrição, setor, equipamento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-medium"
            />
          </div>
        </div>

        {/* Incidents Table / Cards */}
        {loading ? (
          <div className="py-12 text-center text-slate-400 text-xs font-bold flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
            Carregando ocorrências de segurança...
          </div>
        ) : filteredIncidents.length === 0 ? (
          <div className="py-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-8 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100/70 text-emerald-600 flex items-center justify-center mx-auto">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <p className="text-slate-800 font-bold text-sm">
              {searchTerm || selectedCategoryFilter !== 'all' 
                ? 'Nenhuma ocorrência encontrada para os filtros aplicados.' 
                : 'Nenhuma ocorrência registrada manualmente ainda.'}
            </p>
            <p className="text-slate-400 text-xs max-w-md mx-auto">
              O painel está contabilizando os dias a partir dos marcos históricos oficiais configurados. Novos eventos registrados por administradores aparecerão aqui.
            </p>
            {canManage && (
              <button
                onClick={handleOpenCreateModal}
                className="mt-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm cursor-pointer"
              >
                Cadastrar Primeira Ocorrência
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 overflow-hidden">
            {filteredIncidents.map((incident) => {
              const cfg = DEFAULT_SAFETY_CATEGORIES[incident.classification] || DEFAULT_SAFETY_CATEGORIES.SAFSR;
              const incDate = safeToDate(incident.date);

              return (
                <div 
                  key={incident.id} 
                  className="py-4.5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/80 -mx-4 px-4 rounded-xl transition-colors group"
                >
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    {/* Category Badge */}
                    <div 
                      className="px-3 py-2 rounded-xl text-white font-black text-xs shrink-0 shadow-sm flex flex-col items-center justify-center min-w-[65px]"
                      style={{ backgroundColor: cfg.color }}
                    >
                      <span>{incident.classification}</span>
                    </div>

                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                          {incident.title}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          {formatDateBR(incDate)}
                        </span>
                        {incident.sector && (
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md">
                            {incident.sector}
                          </span>
                        )}
                        {incident.equipment && (
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md">
                            {incident.equipment}
                          </span>
                        )}
                        {incident.classification === 'CA' && incident.lostDays ? (
                          <span className="text-[10px] font-black px-2 py-0.5 bg-red-100 text-red-800 rounded-md">
                            {incident.lostDays} dias afastamento
                          </span>
                        ) : null}
                        {incident.classification === 'SAFCR' && incident.restrictionDays ? (
                          <span className="text-[10px] font-black px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md">
                            {incident.restrictionDays} dias restrição
                          </span>
                        ) : null}
                      </div>

                      {incident.description && (
                        <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                          {incident.description}
                        </p>
                      )}

                      {/* Audit details: registeredBy and editadoPor */}
                      <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-400 flex-wrap">
                        {incident.registeredBy && (
                          <span>Registrado por: <strong className="text-slate-700">{incident.registeredBy}</strong></span>
                        )}
                        {incident.bodyPart && (
                          <span>• Membro afetado: <strong className="text-slate-700">{incident.bodyPart}</strong></span>
                        )}
                        {incident.injuryType && (
                          <span>• Lesão: <strong className="text-slate-700">{incident.injuryType}</strong></span>
                        )}
                        {incident.editadoPor && (
                          <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60 text-[10px] font-medium">
                            Alterado por: <strong>{incident.editadoPor}</strong>
                            {incident.ultimaAlteracao && (
                              <span> ({safeToDate(incident.ultimaAlteracao)?.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })})</span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions Buttons */}
                  <div className="flex items-center gap-1.5 self-end md:self-center shrink-0">
                    <button
                      onClick={() => setViewingIncident(incident)}
                      className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg text-xs font-bold transition-all cursor-pointer"
                      title="Ver detalhes completos"
                    >
                      <Info className="w-4 h-4" />
                    </button>

                    {canManage && (
                      <>
                        <button
                          onClick={() => handleOpenEditModal(incident)}
                          className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg text-xs font-bold transition-all cursor-pointer"
                          title="Editar ocorrência"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setIncidentToDelete(incident)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-bold transition-all cursor-pointer"
                          title="Excluir ocorrência"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* MODAL: CADASTRO / EDIÇÃO DE OCORRÊNCIA                          */}
      {/* ============================================================== */}
      {showIncidentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl p-6 sm:p-8 max-w-2xl w-full border border-slate-100 shadow-2xl space-y-6 my-8"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-xl font-black text-slate-900 tracking-tight">
                  {editingIncident ? 'Editar Ocorrência de Segurança' : 'Registrar Nova Ocorrência'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ao salvar, o contador de dias sem acidentes da classificação correspondente será reiniciado a partir desta data.
                </p>
              </div>
              <button 
                onClick={() => setShowIncidentModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveIncident} className="space-y-4">
              {/* Classification Selector */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2">
                  Classificação do Evento *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {(['SAFSR', 'APS', 'CA', 'SAFCR'] as SafetyIncidentClassification[]).map((cat) => {
                    const cfg = DEFAULT_SAFETY_CATEGORIES[cat];
                    const isSelected = formClassification === cat;

                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setFormClassification(cat)}
                        className={cn(
                          "p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between",
                          isSelected 
                            ? "border-2 shadow-md ring-2 ring-offset-1 ring-slate-900" 
                            : "border-slate-200 hover:bg-slate-50"
                        )}
                        style={{
                          backgroundColor: isSelected ? cfg.color : '#ffffff',
                          color: isSelected ? '#ffffff' : '#0f172a',
                          borderColor: isSelected ? cfg.color : undefined
                        }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-black text-sm">{cat}</span>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
                        </div>
                        <span className={cn("text-[10px] font-bold leading-tight", isSelected ? "text-white/90" : "text-slate-500")}>
                          {cfg.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Data do Ocorrido *
                  </label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Horário Aproximado
                  </label>
                  <input
                    type="time"
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              {/* Title / Summary */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Título Resumido da Ocorrência *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Corte contuso membro superior direito canaleta Depuração"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none font-medium"
                />
              </div>

              {/* Sector & Equipment */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Setor / Área da Fábrica
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Secagem, Depuração, Enfardamento..."
                    value={formSector}
                    onChange={(e) => setFormSector(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Equipamento / Máquina Envolvida
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Ventilador Resfriamento, Secador MS1..."
                    value={formEquipment}
                    onChange={(e) => setFormEquipment(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              {/* Body Part & Injury Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Parte do Corpo / Membro Afetado
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Lábio superior, Membro inferior..."
                    value={formBodyPart}
                    onChange={(e) => setFormBodyPart(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tipo de Lesão
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Corte contuso, Prensamento, Ferimento..."
                    value={formInjuryType}
                    onChange={(e) => setFormInjuryType(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              {/* Lost Days / Restriction Days (Conditional) */}
              {formClassification === 'CA' && (
                <div className="p-3 bg-red-50 rounded-xl border border-red-200">
                  <label className="block text-xs font-bold text-red-900 mb-1">
                    Dias de Afastamento (CA)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={formLostDays}
                    onChange={(e) => setFormLostDays(parseInt(e.target.value) || 0)}
                    className="w-full bg-white border border-red-300 rounded-xl px-3 py-2 text-sm font-bold text-red-900 outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              )}

              {formClassification === 'SAFCR' && (
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <label className="block text-xs font-bold text-emerald-900 mb-1">
                    Dias com Restrição de Atividade (SAFCR)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={formRestrictionDays}
                    onChange={(e) => setFormRestrictionDays(parseInt(e.target.value) || 0)}
                    className="w-full bg-white border border-emerald-300 rounded-xl px-3 py-2 text-sm font-bold text-emerald-900 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              )}

              {/* Detailed Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Descrição Detalhada do Acidente
                </label>
                <textarea
                  rows={3}
                  placeholder="Descreva a dinâmica do ocorrido, causas imediatas, condições no momento do fato..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none font-medium"
                />
              </div>

              {/* Preventive Actions */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Ações Corretivas e Preventivas Adotadas
                </label>
                <textarea
                  rows={2}
                  placeholder="Bloqueio de equipamento, treinamento, instalação de proteção física, revisão de procedimento..."
                  value={formPreventiveActions}
                  onChange={(e) => setFormPreventiveActions(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none font-medium"
                />
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowIncidentModal(false)}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-600/20 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
                >
                  {formSubmitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>{editingIncident ? 'Salvar Alterações' : 'Confirmar e Registrar'}</span>
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: MARCOS HISTÓRICOS INICIAIS (BASELINE)                   */}
      {/* ============================================================== */}
      {showBaselineModal && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl p-6 sm:p-8 max-w-xl w-full border border-slate-100 shadow-2xl space-y-6 my-8"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-xl font-black text-slate-900 tracking-tight">
                  Configurar Marcos Iniciais do Painel
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Define a data e descrição de referência quando não houver ocorrências recentes registradas no sistema.
                </p>
              </div>
              <button 
                onClick={() => setShowBaselineModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBaselines} className="space-y-4">
              {(['SAFSR', 'CA', 'SAFCR', 'APS'] as SafetyIncidentClassification[]).map((cat) => {
                const cfg = DEFAULT_SAFETY_CATEGORIES[cat];
                const current = editBaselines[cat] || { initialDate: cfg.initialDate, initialDescription: cfg.initialDescription };

                return (
                  <div key={cat} className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cfg.color }} />
                      <span className="font-black text-sm text-slate-900">{cat} - {cfg.name}</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          Data Inicial de Referência
                        </label>
                        <input
                          type="date"
                          value={current.initialDate ? current.initialDate.split('T')[0] : ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditBaselines(prev => ({
                              ...prev,
                              [cat]: {
                                ...prev[cat],
                                initialDate: `${val}T00:00:00`
                              }
                            }));
                          }}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          Descrição do Último Evento Histórico
                        </label>
                        <input
                          type="text"
                          value={current.initialDescription || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditBaselines(prev => ({
                              ...prev,
                              [cat]: {
                                ...prev[cat],
                                initialDescription: val
                              }
                            }));
                          }}
                          placeholder="Ex: Prensamento no secador..."
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowBaselineModal(false)}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-600/20 active:scale-95 cursor-pointer"
                >
                  Salvar Marcos Iniciais
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: VISUALIZAÇÃO DETALHADA                                   */}
      {/* ============================================================== */}
      {viewingIncident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full border border-slate-100 shadow-2xl space-y-5 my-8"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div 
                  className="px-3 py-1.5 rounded-xl text-white font-black text-xs shrink-0 shadow-sm"
                  style={{ backgroundColor: DEFAULT_SAFETY_CATEGORIES[viewingIncident.classification]?.color || '#2563eb' }}
                >
                  {viewingIncident.classification}
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 tracking-tight">
                    {viewingIncident.title}
                  </h3>
                  <span className="text-xs text-slate-500">
                    Ocorrido em {formatDateBR(viewingIncident.date)}
                  </span>
                </div>
              </div>
              <button 
                onClick={() => setViewingIncident(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs text-slate-700">
              {viewingIncident.description && (
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-1">
                  <span className="font-bold text-slate-900 block text-[11px] uppercase tracking-wider text-slate-400">
                    Dinâmica do Acidente:
                  </span>
                  <p className="leading-relaxed font-medium">{viewingIncident.description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Setor:</span>
                  <strong className="text-slate-900">{viewingIncident.sector || 'Não informado'}</strong>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Equipamento:</span>
                  <strong className="text-slate-900">{viewingIncident.equipment || 'Não informado'}</strong>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Membro Afetado:</span>
                  <strong className="text-slate-900">{viewingIncident.bodyPart || 'Não informado'}</strong>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Tipo de Lesão:</span>
                  <strong className="text-slate-900">{viewingIncident.injuryType || 'Não informado'}</strong>
                </div>
              </div>

              {viewingIncident.preventiveActions && (
                <div className="bg-emerald-50 p-3.5 rounded-2xl border border-emerald-100 space-y-1">
                  <span className="font-bold text-emerald-900 block text-[11px] uppercase tracking-wider">
                    Ações Corretivas / Preventivas:
                  </span>
                  <p className="text-emerald-800 leading-relaxed font-medium">{viewingIncident.preventiveActions}</p>
                </div>
              )}

              <div className="pt-2 text-slate-400 text-[11px]">
                Registrado por: <strong className="text-slate-700">{viewingIncident.registeredBy || 'Admin'}</strong>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setViewingIncident(null)}
                className="px-5 py-2 bg-slate-900 text-white rounded-xl font-bold text-xs cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: CONFIRMAÇÃO DE EXCLUSÃO                                 */}
      {/* ============================================================== */}
      {incidentToDelete && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full border border-slate-100 shadow-2xl space-y-5"
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-lg font-black text-slate-900 tracking-tight">
                Excluir Registro de Ocorrência?
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Você tem certeza que deseja remover esta ocorrência ({incidentToDelete.classification} - "{incidentToDelete.title}")? Esta ação não pode ser desfeita e recalculará os dias sem acidentes.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIncidentToDelete(null)}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteIncident}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-rose-600/20 active:scale-95 cursor-pointer"
              >
                Sim, Excluir
              </button>
            </div>
          </motion.div>
        </div>
      )}

    </div>
  );
};

export default SafetyIncidents;
