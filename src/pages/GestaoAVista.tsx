import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  serverTimestamp, 
  getDocs, 
  query, 
  where 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { MASTER_EMAILS, DEFAULT_BUDGETED_PRODUCTION, DEFAULT_REAL_PRODUCTION } from '../constants';
import { safeToDate, formatDateBR } from '../lib/utils';
import { getGroupForShift, Shift, Group } from '../lib/scaleUtils';
import { 
  Presentation, 
  BarChart3, 
  Plus, 
  Trash2, 
  Printer, 
  Tv, 
  CheckCircle2, 
  Calendar, 
  Maximize2, 
  Minimize2, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown,
  Play, 
  Pause, 
  Save, 
  X, 
  FileSpreadsheet, 
  RefreshCw, 
  Info, 
  Database, 
  Factory, 
  Users, 
  CalendarDays, 
  Check, 
  AlertCircle, 
  Clock, 
  TrendingUp, 
  SlidersHorizontal 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import { toPng } from 'html-to-image';

// Types
export interface BoardSeries {
  id: string;
  name: string;
  color: string;
  target?: number;
  unit?: string;
}

export interface MonthlyValues {
  [seriesId: string]: number | null;
}

export interface GestaoBoard {
  id: string;
  title: string;
  subtitle?: string;
  category: string;
  year: number;
  unit: string;
  type: 'dds_matrix' | 'grouped_bars' | 'production_matrix' | 'bar_with_target';
  series: BoardSeries[];
  monthlyData: {
    month: string;
    label: string;
    values: MonthlyValues;
    manualOverrides?: Record<string, boolean>;
  }[];
  targets?: Record<string, number>;
  notes?: string;
  isSystemDefault?: boolean;
  order?: number;
  createdAt?: any;
  updatedAt?: any;
  updatedBy?: string;
  dataSource?: 'dds_online' | 'consumables_db' | 'monthly_production' | 'manual';
}

const MONTHS_KEYS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTHS_FULL_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];
const TURMAS_LETRAS: Group[] = ['A', 'B', 'C', 'D', 'E'];
const SHIFTS_LIST: Shift[] = ['Turno 1', 'Turno 2', 'Turno 3'];

const getMonthLabels = (year: number) => {
  const shortYear = String(year).slice(-2);
  return MONTHS_KEYS.map(m => ({
    month: m,
    label: `${m}-${shortYear}`
  }));
};

// Seed boards replicating the physical acrylic boards from plant
const getDefaultBoards = (year: number = 2026): GestaoBoard[] => {
  const months = getMonthLabels(year);

  // 1. DDS Indicadores (Image 2 - meses sem dados já preenchidos com 100%)
  const ddsMonthlyData = months.map((m) => {
    return {
      month: m.month,
      label: m.label,
      values: {
        cumprimento: 100,
        participacao: 100
      },
      manualOverrides: {
        cumprimento: false,
        participacao: false
      }
    };
  });

  const ddsBoard: GestaoBoard = {
    id: `dds_indicador_${year}`,
    title: 'DDS',
    subtitle: 'INDICADORES OPERACIONAIS',
    category: 'Segurança & DDS',
    year,
    unit: '%',
    type: 'dds_matrix',
    isSystemDefault: true,
    order: 1,
    dataSource: 'dds_online',
    series: [
      { id: 'cumprimento', name: 'Cumprimento', color: '#008744', target: 95, unit: '%' },
      { id: 'participacao', name: 'Participação', color: '#0057b7', target: 100, unit: '%' }
    ],
    targets: {
      cumprimento: 95,
      participacao: 100
    },
    monthlyData: ddsMonthlyData,
    notes: 'Acompanhamento mensal de cumprimento e participação dos Diálogos Diários de Segurança (alimentado pelo DDS Online).'
  };

  // 2. Consumíveis de Processo Enfardamento (Image 1)
  const consumiveisValues: Record<string, { arame_218: number; arame_230: number; arame_300: number; tinta: number; solvente: number }> = {
    jan: { arame_218: 0.56, arame_230: 1.31, arame_300: 0.06, tinta: 0.13, solvente: 0 },
    fev: { arame_218: 0.58, arame_230: 1.25, arame_300: 0.10, tinta: 0.13, solvente: 0 },
    mar: { arame_218: 0.52, arame_230: 1.29, arame_300: 0.10, tinta: 0.11, solvente: 0 },
    abr: { arame_218: 0.52, arame_230: 1.25, arame_300: 0.12, tinta: 0.12, solvente: 0 },
    mai: { arame_218: 0.58, arame_230: 1.31, arame_300: 0.07, tinta: 0.11, solvente: 0 },
    jun: { arame_218: 0.52, arame_230: 1.25, arame_300: 0.12, tinta: 0.12, solvente: 0.03 },
    jul: { arame_218: 0.58, arame_230: 1.29, arame_300: 0.12, tinta: 0.11, solvente: 0 },
    ago: { arame_218: 0.52, arame_230: 1.28, arame_300: 0.06, tinta: 0.11, solvente: 0 },
    set: { arame_218: 0.57, arame_230: 1.29, arame_300: 0.07, tinta: 0.11, solvente: 0.03 },
    out: { arame_218: 0, arame_230: 0, arame_300: 0, tinta: 0, solvente: 0 },
    nov: { arame_218: 0, arame_230: 0, arame_300: 0, tinta: 0, solvente: 0 },
    dez: { arame_218: 0, arame_230: 0, arame_300: 0, tinta: 0, solvente: 0 },
  };

  const consumiveisMonthlyData = months.map((m, idx) => {
    const data = consumiveisValues[m.month];
    const hasData = idx <= 8;
    return {
      month: m.month,
      label: m.label,
      values: {
        arame_218: hasData ? data.arame_218 : null,
        arame_230: hasData ? data.arame_230 : null,
        arame_300: hasData ? data.arame_300 : null,
        tinta: hasData ? data.tinta : null,
        solvente: hasData ? data.solvente : null
      }
    };
  });

  const consumiveisBoard: GestaoBoard = {
    id: `consumiveis_enfardamento_${year}`,
    title: 'CONSUMÍVEIS DE PROCESSO ENFARDAMENTO',
    subtitle: 'ENFARDAMENTO & INSUMOS',
    category: 'Consumíveis',
    year,
    unit: 'kg/t',
    type: 'grouped_bars',
    isSystemDefault: true,
    order: 2,
    dataSource: 'consumables_db',
    series: [
      { id: 'arame_218', name: 'Arame 2,18mm', color: '#165b33' },
      { id: 'arame_230', name: 'Arame 2,30mm', color: '#2e7d32' },
      { id: 'arame_300', name: 'Arame 3,00mm', color: '#558b2f' },
      { id: 'tinta', name: 'Tinta', color: '#c084fc' },
      { id: 'solvente', name: 'Solvente', color: '#64748b' }
    ],
    monthlyData: consumiveisMonthlyData,
    notes: 'Consumo específico de arames, tintas e solventes por tonelada de celulose produzida.'
  };

  // 3. Produção de Celulose (Image 3)
  const producaoValues: Record<string, { real: number; orcado: number }> = {
    jan: { real: 157546, orcado: 156665 },
    fev: { real: 142180, orcado: 140118 },
    mar: { real: 157666, orcado: 151517 },
    abr: { real: 153256, orcado: 149883 },
    mai: { real: 160808, orcado: 155260 },
    jun: { real: 154170, orcado: 152307 },
    jul: { real: 158330, orcado: 152210 },
    ago: { real: 157610, orcado: 155168 },
    set: { real: 152026, orcado: 149971 },
    out: { real: 0, orcado: 0 },
    nov: { real: 0, orcado: 0 },
    dez: { real: 0, orcado: 0 },
  };

  const producaoMonthlyData = months.map((m, idx) => {
    const monthNum = idx + 1;
    const data = producaoValues[m.month];
    const defaultBudget = DEFAULT_BUDGETED_PRODUCTION[monthNum] ?? data?.orcado ?? 0;
    const defaultReal = data?.real && data.real > 0 ? data.real : (DEFAULT_REAL_PRODUCTION[monthNum] ?? null);

    return {
      month: m.month,
      label: m.label,
      values: {
        real: defaultReal,
        orcado: defaultBudget
      }
    };
  });

  const producaoBoard: GestaoBoard = {
    id: `producao_celulose_${year}`,
    title: 'PRODUÇÃO DE CELULOSE',
    subtitle: 'PRODUÇÃO & ORÇAMENTO',
    category: 'Produção Celulose',
    year,
    unit: 't',
    type: 'production_matrix',
    isSystemDefault: true,
    order: 3,
    dataSource: 'monthly_production',
    series: [
      { id: 'real', name: 'Real', color: '#008744', unit: 't' },
      { id: 'orcado', name: 'Orçado', color: '#0057b7', unit: 't' }
    ],
    monthlyData: producaoMonthlyData,
    notes: 'Acompanhamento mensal da produção de celulose (Real vs Orçado) conectado ao Controle de Produção.'
  };

  return [ddsBoard, consumiveisBoard, producaoBoard];
};

export const GestaoAVista: React.FC = () => {
  const { user, profile } = useAuth();
  const isMaster = Boolean(user?.email && MASTER_EMAILS.includes(user.email.toLowerCase().trim()));
  const isAdmin = profile?.role === 'admin' || isMaster;
  // Acesso visual para TODOS, porém criar, editar e excluir SOMENTE para Master e Admin
  const canManage = isMaster || isAdmin;
  const canEdit = canManage;
  const canCreate = canManage;
  const canDelete = canManage;

  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());
  const [isYearPickerOpen, setIsYearPickerOpen] = useState<boolean>(false);
  const [manualYearInput, setManualYearInput] = useState<string>('');
  const [boards, setBoards] = useState<GestaoBoard[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  // DDS Online Live Data State
  const [ddsSessions, setDdsSessions] = useState<any[]>([]);
  const [ddsSignatures, setDdsSignatures] = useState<any[]>([]);
  const [selectedDdsLetter, setSelectedDdsLetter] = useState<string>('all'); // 'all', 'A', 'B', 'C', 'D', 'E'
  const [ddsDetailTab, setDdsDetailTab] = useState<'board' | 'letters_ranking' | 'daily_rhythm'>('board');
  const [selectedDdsMonth, setSelectedDdsMonth] = useState<number>(() => new Date().getMonth());

  // Modals & Tools
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editMonthlyData, setEditMonthlyData] = useState<any[]>([]);
  const [editTargets, setEditTargets] = useState<Record<string, number>>({});
  const [isAddBoardModalOpen, setIsAddBoardModalOpen] = useState<boolean>(false);
  const [isKioskMode, setIsKioskMode] = useState<boolean>(false);
  const [kioskAutoPlay, setKioskAutoPlay] = useState<boolean>(true);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [syncLoading, setSyncLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const boardPrintRef = useRef<HTMLDivElement>(null);

  // 1. Listen to visual boards in Firestore
  useEffect(() => {
    setLoading(true);
    const colRef = collection(db, 'gestao_a_vista_boards');
    const unsub = onSnapshot(colRef, (snapshot) => {
      const dbBoards: GestaoBoard[] = [];
      snapshot.forEach((docSnap) => {
        dbBoards.push({ id: docSnap.id, ...docSnap.data() } as GestaoBoard);
      });

      const defaultBoards = getDefaultBoards(selectedYear);
      
      const currentYearDbBoards = dbBoards.filter(b => b.year === selectedYear || Number(b.year) === selectedYear || b.id.endsWith(`_${selectedYear}`));
      const merged: GestaoBoard[] = [...currentYearDbBoards];

      defaultBoards.forEach(def => {
        if (!merged.some(b => b.id === def.id)) {
          merged.push(def);
        }
      });

      merged.sort((a, b) => (a.order || 99) - (b.order || 99) || a.title.localeCompare(b.title));

      setBoards(merged);
      if (!activeBoardId || !merged.some(b => b.id === activeBoardId)) {
        setActiveBoardId(merged[0]?.id || '');
      }
      setLoading(false);
    }, (error) => {
      console.warn('Erro ao carregar quadros do Firestore, usando padrões locais:', error);
      const defaults = getDefaultBoards(selectedYear);
      setBoards(defaults);
      setActiveBoardId(defaults[0]?.id || '');
      setLoading(false);
    });

    return () => unsub();
  }, [selectedYear]);

  const [monthlyProductionDocs, setMonthlyProductionDocs] = useState<any[]>([]);

  // 2. Real-time Live Listener for DDS Online & Monthly Production
  useEffect(() => {
    const unsubSessions = onSnapshot(collection(db, 'dds_sessions'), (snap) => {
      const list: any[] = [];
      snap.forEach(d => {
        const data = d.data();
        const dateVal = safeToDate(data.date || data.createdAt || data.timestamp);
        if (dateVal && dateVal.getFullYear() === selectedYear) {
          list.push({ id: d.id, ...data, resolvedDate: dateVal });
        }
      });
      setDdsSessions(list);
    });

    const unsubSignatures = onSnapshot(collection(db, 'dds_signatures'), (snap) => {
      const sigs: any[] = [];
      snap.forEach(d => {
        const data = d.data();
        const dateVal = safeToDate(data.timestamp || data.createdAt || data.date);
        if (dateVal && dateVal.getFullYear() === selectedYear) {
          sigs.push({ id: d.id, ...data, resolvedDate: dateVal });
        }
      });
      setDdsSignatures(sigs);
    });

    const unsubProd = onSnapshot(collection(db, 'monthly_production'), (snap) => {
      const list: any[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() });
      });
      setMonthlyProductionDocs(list);
    });

    return () => {
      unsubSessions();
      unsubSignatures();
      unsubProd();
    };
  }, [selectedYear]);

  // Active board
  const activeBoard = useMemo(() => {
    return boards.find(b => b.id === activeBoardId) || boards[0] || null;
  }, [boards, activeBoardId]);

  // 3. Computed real stats from DDS Online by Month and Letter
  // Every day has 3 operational shifts (Turno 1, Turno 2, Turno 3).
  // A letter is required to execute DDS if it is on duty (não estava de folga).
  // If it was scheduled to work that shift and did not execute DDS -> indicator falls.
  // Overall compliance = (total executed DDS / total expected shifts) * 100.
  const ddsRealStats = useMemo(() => {
    const sessionMap = new Map<string, any>();
    ddsSessions.forEach(s => sessionMap.set(s.id, s));

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentDay = now.getDate();

    // Per-month, per-letter compliance tracker for detailed table
    const monthLetterCompliance: Record<number, Record<Group, { expected: number; realized: number; rate: number | null }>> = {};

    const letterStats: Record<Group, {
      sessionsCount: number;
      completedCount: number;
      signaturesCount: number;
      expectedCount: number;
      cumprimentoRate: number;
      participacaoRate: number;
    }> = {
      'A': { sessionsCount: 0, completedCount: 0, signaturesCount: 0, expectedCount: 0, cumprimentoRate: 100, participacaoRate: 100 },
      'B': { sessionsCount: 0, completedCount: 0, signaturesCount: 0, expectedCount: 0, cumprimentoRate: 100, participacaoRate: 100 },
      'C': { sessionsCount: 0, completedCount: 0, signaturesCount: 0, expectedCount: 0, cumprimentoRate: 100, participacaoRate: 100 },
      'D': { sessionsCount: 0, completedCount: 0, signaturesCount: 0, expectedCount: 0, cumprimentoRate: 100, participacaoRate: 100 },
      'E': { sessionsCount: 0, completedCount: 0, signaturesCount: 0, expectedCount: 0, cumprimentoRate: 100, participacaoRate: 100 },
    };

    const monthlyStats: Array<{
      monthIndex: number;
      cumprimento: number | null;
      participacao: number | null;
      sessionsCount: number;
      completedCount: number;
      signaturesCount: number;
      expectedCount: number;
    }> = [];

    for (let m = 0; m < 12; m++) {
      monthLetterCompliance[m] = {
        'A': { expected: 0, realized: 0, rate: null },
        'B': { expected: 0, realized: 0, rate: null },
        'C': { expected: 0, realized: 0, rate: null },
        'D': { expected: 0, realized: 0, rate: null },
        'E': { expected: 0, realized: 0, rate: null },
      };

      const daysInMonth = new Date(selectedYear, m + 1, 0).getDate();

      // Determine how many days should be evaluated for compliance
      let evaluatedDays = 0;
      if (selectedYear < currentYear || (selectedYear === currentYear && m < currentMonth)) {
        evaluatedDays = daysInMonth;
      } else if (selectedYear === currentYear && m === currentMonth) {
        evaluatedDays = currentDay;
      } else {
        const hasForwardSessions = ddsSessions.some(s => s.resolvedDate && s.resolvedDate.getMonth() === m);
        if (hasForwardSessions) {
          const maxDay = Math.max(...ddsSessions.filter(s => s.resolvedDate && s.resolvedDate.getMonth() === m).map(s => s.resolvedDate.getDate()));
          evaluatedDays = Math.min(daysInMonth, maxDay);
        } else {
          evaluatedDays = 0;
        }
      }

      // Filter sessions and signatures in this month
      let monthSessions = ddsSessions.filter(s => s.resolvedDate && s.resolvedDate.getMonth() === m);
      let monthSignatures = ddsSignatures.filter(sig => sig.resolvedDate && sig.resolvedDate.getMonth() === m);

      if (selectedDdsLetter !== 'all') {
        monthSessions = monthSessions.filter(s => (s.group || '').trim().toUpperCase() === selectedDdsLetter.toUpperCase());
        monthSignatures = monthSignatures.filter(sig => {
          const sigGroup = (sig.group || '').trim().toUpperCase();
          if (sigGroup === selectedDdsLetter.toUpperCase()) return true;
          const parentSession = sessionMap.get(sig.sessionId);
          return (parentSession?.group || '').trim().toUpperCase() === selectedDdsLetter.toUpperCase();
        });
      }

      let monthExpectedShifts = 0;
      let monthRealizedShifts = 0;

      // Evaluate day by day, shift by shift across the 3 daily shifts
      for (let day = 1; day <= evaluatedDays; day++) {
        const dayDate = new Date(selectedYear, m, day, 12, 0, 0);

        const daySessions = ddsSessions.filter(s => 
          s.resolvedDate &&
          s.resolvedDate.getFullYear() === selectedYear &&
          s.resolvedDate.getMonth() === m &&
          s.resolvedDate.getDate() === day
        );

        SHIFTS_LIST.forEach(shift => {
          const dutyGroup = getGroupForShift(dayDate, shift) as Group;

          // Check if a session was executed for this shift / duty group on this date
          const matchingSession = daySessions.find(s => {
            const sShift = (s.shift || '').trim().toLowerCase();
            const targetShift = shift.toLowerCase();
            const sGroup = (s.group || '').trim().toUpperCase();
            return (sShift === targetShift || sShift.includes(targetShift)) || sGroup === dutyGroup;
          });

          const isRealized = Boolean(
            matchingSession && 
            (matchingSession.status === 'completed' || matchingSession.isCompleted || (matchingSession.signaturesCount && matchingSession.signaturesCount > 0) || matchingSession.id)
          );

          // Track for each individual letter
          if (TURMAS_LETRAS.includes(dutyGroup)) {
            monthLetterCompliance[m][dutyGroup].expected += 1;
            if (isRealized) {
              monthLetterCompliance[m][dutyGroup].realized += 1;
            }
          }

          // Track for overall board (or filtered letter)
          const matchesFilter = selectedDdsLetter === 'all' || selectedDdsLetter.toUpperCase() === dutyGroup;
          if (matchesFilter) {
            monthExpectedShifts += 1;
            if (isRealized) {
              monthRealizedShifts += 1;
            }
          }
        });
      }

      // Calculate monthly letter compliance rates
      TURMAS_LETRAS.forEach(letra => {
        const lData = monthLetterCompliance[m][letra];
        lData.rate = lData.expected > 0 ? Math.min(100, Math.round((lData.realized / lData.expected) * 100)) : null;
      });

      const cumprimento = evaluatedDays > 0 && monthExpectedShifts > 0
        ? Math.min(100, Math.round((monthRealizedShifts / monthExpectedShifts) * 100))
        : null;

      const totalExpectedParticipants = monthSessions.reduce((acc, s) => acc + (s.totalPrevisto || 9), 0);
      const totalSignatures = monthSignatures.length;

      const participacao = totalExpectedParticipants > 0 
        ? Math.min(100, Math.round((totalSignatures / totalExpectedParticipants) * 100))
        : (monthRealizedShifts > 0 ? 100 : null);

      monthlyStats.push({
        monthIndex: m,
        cumprimento,
        participacao,
        sessionsCount: monthExpectedShifts,
        completedCount: monthRealizedShifts,
        signaturesCount: totalSignatures,
        expectedCount: totalExpectedParticipants
      });
    }

    // Cumulative stats for each letter across the whole evaluated period of the year
    TURMAS_LETRAS.forEach(letra => {
      let letterExp = 0;
      let letterReal = 0;
      for (let m = 0; m < 12; m++) {
        letterExp += monthLetterCompliance[m][letra].expected;
        letterReal += monthLetterCompliance[m][letra].realized;
      }

      const lSignatures = ddsSignatures.filter(sig => {
        const sigGroup = (sig.group || '').trim().toUpperCase();
        if (sigGroup === letra) return true;
        const parentSession = sessionMap.get(sig.sessionId);
        return (parentSession?.group || '').trim().toUpperCase() === letra;
      });

      const lSessions = ddsSessions.filter(s => (s.group || '').trim().toUpperCase() === letra);
      const expHead = lSessions.reduce((acc, s) => acc + (s.totalPrevisto || 9), 0);
      const totalSigs = lSignatures.length;

      const cumpRate = letterExp > 0 ? Math.min(100, Math.round((letterReal / letterExp) * 100)) : 100;
      const partRate = expHead > 0 ? Math.min(100, Math.round((totalSigs / expHead) * 100)) : 100;

      letterStats[letra] = {
        sessionsCount: letterExp,
        completedCount: letterReal,
        signaturesCount: totalSigs,
        expectedCount: expHead,
        cumprimentoRate: cumpRate,
        participacaoRate: partRate
      };
    });

    return {
      monthlyStats,
      letterStats,
      monthLetterCompliance,
      hasRealData: ddsSessions.length > 0
    };
  }, [ddsSessions, ddsSignatures, selectedDdsLetter, selectedYear]);

  // Merge real DDS live numbers or real monthly production into active board
  const displayedMonthlyData = useMemo(() => {
    if (!activeBoard) return [];

    // 1. DDS Matrix Board: real DDS live numbers, defaulting months without data to 100%,
    // and strictly honoring manual edits/inputs saved via Fechamento Mensal / Editar
    if (activeBoard.type === 'dds_matrix') {
      return activeBoard.monthlyData.map((m, idx) => {
        const realMonth = ddsRealStats.monthlyStats[idx];

        // Cumprimento:
        let cVal: number | null = null;
        if (m.manualOverrides?.['cumprimento'] === false) {
          // Explicitly reset by user to use automatic online calculation
          cVal = realMonth?.cumprimento !== null && realMonth?.cumprimento !== undefined ? realMonth.cumprimento : 100;
        } else if (m.values['cumprimento'] !== null && m.values['cumprimento'] !== undefined && m.values['cumprimento'] !== '') {
          // Explicit value entered or saved by user
          cVal = Number(m.values['cumprimento']);
        } else if (realMonth?.cumprimento !== null && realMonth?.cumprimento !== undefined) {
          // Live calculation from DDS sessions
          cVal = realMonth.cumprimento;
        } else {
          // Default 100% for months without data
          cVal = 100;
        }

        // Participação:
        let pVal: number | null = null;
        if (m.manualOverrides?.['participacao'] === false) {
          // Explicitly reset by user to use automatic online calculation
          pVal = realMonth?.participacao !== null && realMonth?.participacao !== undefined ? realMonth.participacao : 100;
        } else if (m.values['participacao'] !== null && m.values['participacao'] !== undefined && m.values['participacao'] !== '') {
          // Explicit value entered or saved by user
          pVal = Number(m.values['participacao']);
        } else if (realMonth?.participacao !== null && realMonth?.participacao !== undefined) {
          // Live calculation from DDS signatures
          pVal = realMonth.participacao;
        } else {
          // Default 100% for months without data
          pVal = 100;
        }

        return {
          ...m,
          values: {
            cumprimento: cVal,
            participacao: pVal
          }
        };
      });
    }

    // 2. Produção de Celulose Board: real-time synchronization with monthly_production (WireControl)
    if (activeBoard.type === 'production_matrix' || activeBoard.id.startsWith('producao_celulose')) {
      return activeBoard.monthlyData.map((m, idx) => {
        const monthNum = idx + 1;
        const prodDoc = monthlyProductionDocs.find(p => p.year === selectedYear && p.month === monthNum);

        // Sanitize legacy hardcoded orcado values (155000 / 150000 / 152000) for late months (out, nov, dez) if not manually overridden
        let rawReal = m.values['real'];
        let rawOrcado = m.values['orcado'];
        if (monthNum >= 10 && (rawOrcado === 155000 || rawOrcado === 150000 || rawOrcado === 152000) && !m.manualOverrides?.['orcado']) {
          rawOrcado = 0;
        }

        const realVal = (rawReal !== null && rawReal !== undefined && rawReal !== '')
          ? Number(rawReal)
          : (prodDoc?.productionTons !== undefined && prodDoc?.productionTons !== null
            ? Number(prodDoc.productionTons)
            : (DEFAULT_REAL_PRODUCTION[monthNum] ?? 0));

        const orcadoVal = (rawOrcado !== null && rawOrcado !== undefined && rawOrcado !== '')
          ? Number(rawOrcado)
          : (prodDoc?.budgetedTons !== undefined && prodDoc?.budgetedTons !== null
            ? Number(prodDoc.budgetedTons)
            : (DEFAULT_BUDGETED_PRODUCTION[monthNum] ?? 0));

        return {
          ...m,
          values: {
            real: realVal,
            orcado: orcadoVal
          }
        };
      });
    }

    return activeBoard.monthlyData;
  }, [activeBoard, ddsRealStats, monthlyProductionDocs, selectedYear]);

  // 4. Daily rhythm breakdown for DDS: shows which letter did DDS on each day of the selected month
  const dailyDdsRhythm = useMemo(() => {
    const daysInMonth = new Date(selectedYear, selectedDdsMonth + 1, 0).getDate();
    const daysList = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(selectedYear, selectedDdsMonth, day, 12, 0, 0);
      const dayStr = day < 10 ? `0${day}` : `${day}`;
      const daySessions = ddsSessions.filter(s => {
        if (!s.resolvedDate) return false;
        return (
          s.resolvedDate.getFullYear() === selectedYear &&
          s.resolvedDate.getMonth() === selectedDdsMonth &&
          s.resolvedDate.getDate() === day
        );
      });

      // Scheduled groups for the 3 shifts today
      const scheduledT1 = getGroupForShift(dateObj, 'Turno 1');
      const scheduledT2 = getGroupForShift(dateObj, 'Turno 2');
      const scheduledT3 = getGroupForShift(dateObj, 'Turno 3');
      const workingGroups = new Set([scheduledT1, scheduledT2, scheduledT3]);

      // Per-letter status for today
      const lettersStatus: Record<Group, { 
        status: 'completed' | 'active' | 'missing' | 'off_duty'; 
        signatures: number;
        shift?: string;
        title?: string;
      }> = {
        'A': { status: workingGroups.has('A') ? 'missing' : 'off_duty', signatures: 0 },
        'B': { status: workingGroups.has('B') ? 'missing' : 'off_duty', signatures: 0 },
        'C': { status: workingGroups.has('C') ? 'missing' : 'off_duty', signatures: 0 },
        'D': { status: workingGroups.has('D') ? 'missing' : 'off_duty', signatures: 0 },
        'E': { status: workingGroups.has('E') ? 'missing' : 'off_duty', signatures: 0 },
      };

      daySessions.forEach(s => {
        const g = (s.group || '').trim().toUpperCase() as Group;
        if (TURMAS_LETRAS.includes(g)) {
          const sigsCount = ddsSignatures.filter(sig => sig.sessionId === s.id).length || s.signaturesCount || 0;
          const isDone = s.status === 'completed' || s.isCompleted || sigsCount > 0;
          lettersStatus[g] = {
            status: isDone ? 'completed' : 'active',
            signatures: sigsCount,
            shift: s.shift,
            title: s.title
          };
        }
      });

      const totalSignaturesToday = Object.values(lettersStatus).reduce((acc, curr) => acc + curr.signatures, 0);
      const completedLetters = Object.values(lettersStatus).filter(v => v.status === 'completed').length;
      const expectedWorkingLetters = workingGroups.size;
      const dayCompliancePct = expectedWorkingLetters > 0 ? Math.min(100, Math.round((completedLetters / expectedWorkingLetters) * 100)) : 100;

      daysList.push({
        day,
        dayStr,
        dateObj,
        dateFormatted: formatDateBR(dateObj),
        dayOfWeek: dateObj.toLocaleDateString('pt-BR', { weekday: 'short' }),
        lettersStatus,
        totalSignaturesToday,
        dayCompliancePct,
        sessionsCount: daySessions.length
      });
    }

    return daysList;
  }, [selectedYear, selectedDdsMonth, ddsSessions, ddsSignatures]);

  // Real-time synchronization with monthly_production when Produção de Celulose board is active
  useEffect(() => {
    if (!activeBoard || activeBoard.type !== 'production_matrix') return;

    const unsubProd = onSnapshot(collection(db, 'monthly_production'), (snapshot) => {
      const prodList: any[] = [];
      snapshot.forEach(docSnap => prodList.push({ id: docSnap.id, ...docSnap.data() }));

      const currentYearProd = prodList.filter(p => p.year === selectedYear);
      if (currentYearProd.length === 0) return;

      let hasChanges = false;
      const updatedMonthlyData = activeBoard.monthlyData.map((m, idx) => {
        const monthNum = idx + 1;
        const entry = currentYearProd.find(p => p.month === monthNum);
        if (entry) {
          const currentReal = m.values['real'];
          const currentOrcado = m.values['orcado'];
          const newReal = entry.productionTons !== undefined && entry.productionTons !== null ? entry.productionTons : currentReal;
          const newOrcado = entry.budgetedTons !== undefined && entry.budgetedTons !== null ? entry.budgetedTons : currentOrcado;

          if (currentReal !== newReal || currentOrcado !== newOrcado) {
            hasChanges = true;
            return {
              ...m,
              values: {
                ...m.values,
                real: newReal,
                orcado: newOrcado
              }
            };
          }
        }
        return m;
      });

      if (hasChanges) {
        setBoards(prev => prev.map(b => b.id === activeBoard.id ? { ...b, monthlyData: updatedMonthlyData } : b));
      }
    });

    return () => unsubProd();
  }, [activeBoard?.id, selectedYear]);

  // Kiosk mode auto-rotation
  useEffect(() => {
    if (!isKioskMode || !kioskAutoPlay || boards.length <= 1) return;

    const interval = setInterval(() => {
      setBoards(prev => {
        if (prev.length <= 1) return prev;
        const currentIndex = prev.findIndex(b => b.id === activeBoardId);
        const nextIndex = (currentIndex + 1) % prev.length;
        setActiveBoardId(prev[nextIndex].id);
        return prev;
      });
    }, 15000);

    return () => clearInterval(interval);
  }, [isKioskMode, kioskAutoPlay, activeBoardId, boards.length]);

  // Open Fechamento Mensal / Editar with pre-populated values and explicit override flags
  const handleOpenEditModal = () => {
    if (!activeBoard) return;

    const cloned = activeBoard.monthlyData.map((m, idx) => {
      const monthNum = idx + 1;
      const currentValues = { ...m.values };
      const currentManualOverrides = { ...(m.manualOverrides || {}) };

      // Sanitize legacy hardcoded orcado values for months 10, 11, 12 if not manually overridden
      if (monthNum >= 10 && (currentValues['orcado'] === 155000 || currentValues['orcado'] === 150000 || currentValues['orcado'] === 152000) && !currentManualOverrides['orcado']) {
        currentValues['orcado'] = 0;
      }

      activeBoard.series.forEach(s => {
        // If not already set or null, take currently displayed value
        if (currentValues[s.id] === undefined || currentValues[s.id] === null) {
          const dispVal = displayedMonthlyData[idx]?.values[s.id];
          if (dispVal !== undefined && dispVal !== null) {
            currentValues[s.id] = dispVal;
          }
        }
      });

      return {
        ...m,
        values: currentValues,
        manualOverrides: currentManualOverrides
      };
    });

    setEditMonthlyData(cloned);
    setEditTargets({ ...(activeBoard.targets || {}) });
    setIsEditModalOpen(true);
  };

  // Export to PDF formatted for physical acrylic frame (A4 landscape)
  const handleExportLandscapePdf = async () => {
    if (!boardPrintRef.current || !activeBoard) return;
    setIsExportingPdf(true);
    setStatusMessage({ text: 'Renderizando Quadro para impressão física em alta resolução...', type: 'info' });

    try {
      const element = boardPrintRef.current;
      
      const imgData = await toPng(element, {
        quality: 0.98,
        pixelRatio: 2.5,
        backgroundColor: '#ffffff',
        cacheBust: true,
      });

      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = (e) => reject(e);
        img.src = imgData;
      });

      const naturalWidth = img.naturalWidth || img.width || 1200;
      const naturalHeight = img.naturalHeight || img.height || 800;

      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      const margin = 8;
      const printWidth = pdfWidth - margin * 2;
      const printHeight = (naturalHeight * printWidth) / naturalWidth;

      const yOffset = printHeight < pdfHeight ? (pdfHeight - printHeight) / 2 : margin;

      pdf.addImage(imgData, 'PNG', margin, yOffset, printWidth, Math.min(printHeight, pdfHeight - margin * 2));
      pdf.save(`Quadro_Gestao_A_Vista_${activeBoard.title.replace(/[^a-zA-Z0-9]/g, '_')}_${activeBoard.year}.pdf`);

      setStatusMessage({ text: 'PDF do Quadro pronto para impressão e inserção na moldura acrílica!', type: 'success' });
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
      setStatusMessage({ text: 'Erro ao gerar o arquivo PDF. Tente novamente.', type: 'error' });
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Sync from DDS Online button
  const handleSyncDdsData = async () => {
    if (!activeBoard || activeBoard.type !== 'dds_matrix') return;
    setSyncLoading(true);
    setStatusMessage({ text: 'Sincronizando dados reais do DDS Online (sessões, assinaturas e turmas)...', type: 'info' });

    try {
      const updatedMonthlyData = activeBoard.monthlyData.map((m, idx) => {
        const stats = ddsRealStats.monthlyStats[idx];
        if (stats && stats.sessionsCount > 0) {
          return {
            ...m,
            values: {
              cumprimento: stats.cumprimento,
              participacao: stats.participacao
            }
          };
        }
        return m;
      });

      const updatedBoard: GestaoBoard = {
        ...activeBoard,
        monthlyData: updatedMonthlyData,
        updatedAt: serverTimestamp(),
        updatedBy: user?.displayName || user?.email || 'Sistema'
      };

      await setDoc(doc(db, 'gestao_a_vista_boards', activeBoard.id), updatedBoard, { merge: true });
      setStatusMessage({ text: `Dados de DDS sincronizados com sucesso a partir de ${ddsSessions.length} reuniões e ${ddsSignatures.length} presenças registradas no DDS Online!`, type: 'success' });
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err) {
      console.error('Erro ao sincronizar dados de DDS:', err);
      setStatusMessage({ text: 'Não foi possível sincronizar automaticamente.', type: 'error' });
    } finally {
      setSyncLoading(false);
    }
  };

  // Sync Consumíveis from App database
  const handleSyncConsumablesData = async () => {
    if (!activeBoard || activeBoard.type !== 'grouped_bars') return;
    setSyncLoading(true);
    setStatusMessage({ text: 'Consultando consumo de arames e insumos e produções mensais...', type: 'info' });

    try {
      const prodSnap = await getDocs(collection(db, 'monthly_production'));
      const productionMap: Record<number, number> = {};
      prodSnap.forEach(d => {
        const data = d.data();
        if (data.year === selectedYear && data.productionTons) {
          productionMap[data.month - 1] = Number(data.productionTons);
        }
      });

      const coilsSnap = await getDocs(query(collection(db, 'wire_coils'), where('status', '==', 'consumed')));
      const wireConsumptionKg: Record<number, { '2.18': number; '2.30': number; '3.00': number }> = {};
      for (let i = 0; i < 12; i++) {
        wireConsumptionKg[i] = { '2.18': 0, '2.30': 0, '3.00': 0 };
      }

      coilsSnap.forEach(d => {
        const c = d.data();
        const dateVal = c.consumedAt?.toDate ? c.consumedAt.toDate() : (c.consumedAt ? new Date(c.consumedAt) : null);
        if (dateVal && dateVal.getFullYear() === selectedYear) {
          const m = dateVal.getMonth();
          const dStr = Number(c.diameter).toFixed(2);
          const weight = Number(c.weight) || 0;
          if (dStr === '2.18') wireConsumptionKg[m]['2.18'] += weight;
          else if (dStr === '2.30') wireConsumptionKg[m]['2.30'] += weight;
          else if (dStr === '3.00') wireConsumptionKg[m]['3.00'] += weight;
        }
      });

      const logsSnap = await getDocs(collection(db, 'consumable_logs'));
      const otherConsumption: Record<number, { tinta: number; solvente: number }> = {};
      for (let i = 0; i < 12; i++) {
        otherConsumption[i] = { tinta: 0, solvente: 0 };
      }

      logsSnap.forEach(d => {
        const log = d.data();
        if (log.type === 'consumption' || log.type === 'operator_consumption') {
          const dateVal = log.date?.toDate ? log.date.toDate() : (log.date ? new Date(log.date) : null);
          if (dateVal && dateVal.getFullYear() === selectedYear) {
            const m = dateVal.getMonth();
            const itemName = (log.itemName || '').toLowerCase();
            const qty = Number(log.quantity) || 0;
            if (itemName.includes('tinta')) otherConsumption[m].tinta += qty;
            if (itemName.includes('solvente')) otherConsumption[m].solvente += qty;
          }
        }
      });

      let updatedCount = 0;
      const updatedMonthlyData = activeBoard.monthlyData.map((m, idx) => {
        const prodTons = productionMap[idx];
        const wires = wireConsumptionKg[idx];
        const others = otherConsumption[idx];

        if (prodTons && prodTons > 0 && (wires['2.18'] > 0 || wires['2.30'] > 0 || wires['3.00'] > 0)) {
          updatedCount++;
          return {
            ...m,
            values: {
              arame_218: Number((wires['2.18'] / prodTons).toFixed(2)),
              arame_230: Number((wires['2.30'] / prodTons).toFixed(2)),
              arame_300: Number((wires['3.00'] / prodTons).toFixed(2)),
              tinta: Number((others.tinta / (prodTons / 1000)).toFixed(2)),
              solvente: Number((others.solvente / (prodTons / 1000)).toFixed(2))
            }
          };
        }
        return m;
      });

      if (updatedCount > 0) {
        const updatedBoard: GestaoBoard = {
          ...activeBoard,
          monthlyData: updatedMonthlyData,
          updatedAt: serverTimestamp(),
          updatedBy: user?.displayName || user?.email || 'Sistema'
        };
        await setDoc(doc(db, 'gestao_a_vista_boards', activeBoard.id), updatedBoard, { merge: true });
        setStatusMessage({ text: `Consumíveis recalculados com sucesso a partir das bobinas e insumos reais (${updatedCount} meses atualizados)!`, type: 'success' });
      } else {
        setStatusMessage({ text: 'Consumíveis sincronizados com a base. Para cálculo automático de kg/t, registre as toneladas em Controle de Produção.', type: 'info' });
      }
      setTimeout(() => setStatusMessage(null), 4500);
    } catch (err) {
      console.error('Erro ao sincronizar consumíveis:', err);
      setStatusMessage({ text: 'Erro ao sincronizar consumíveis da base.', type: 'error' });
    } finally {
      setSyncLoading(false);
    }
  };

  // Sync Produção de Celulose
  const handleSyncProductionData = async () => {
    if (!activeBoard || activeBoard.type !== 'production_matrix') return;
    setSyncLoading(true);
    setStatusMessage({ text: 'Consultando histórico de produção de celulose no sistema...', type: 'info' });

    try {
      const prodSnap = await getDocs(collection(db, 'monthly_production'));
      const prodList: any[] = [];
      prodSnap.forEach(d => prodList.push({ id: d.id, ...d.data() }));

      const currentYearProd = prodList.filter(p => p.year === selectedYear);
      if (currentYearProd.length === 0) {
        setStatusMessage({ text: `Nenhum fechamento de produção encontrado para ${selectedYear}. Cadastre em Controle de Arames.`, type: 'info' });
        setTimeout(() => setStatusMessage(null), 4000);
        setSyncLoading(false);
        return;
      }

      const updatedMonthlyData = activeBoard.monthlyData.map((m, idx) => {
        const monthNum = idx + 1;
        const entry = currentYearProd.find(p => p.month === monthNum);
        if (entry) {
          return {
            ...m,
            values: {
              real: entry.productionTons !== undefined && entry.productionTons !== null ? entry.productionTons : m.values['real'],
              orcado: entry.budgetedTons !== undefined && entry.budgetedTons !== null ? entry.budgetedTons : m.values['orcado']
            }
          };
        }
        return m;
      });

      const updatedBoard: GestaoBoard = {
        ...activeBoard,
        monthlyData: updatedMonthlyData,
        updatedAt: serverTimestamp(),
        updatedBy: user?.displayName || user?.email || 'Sistema'
      };

      await setDoc(doc(db, 'gestao_a_vista_boards', activeBoard.id), updatedBoard, { merge: true });
      setStatusMessage({ text: 'Produção de Celulose sincronizada com sucesso a partir de Controle de Arames!', type: 'success' });
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err) {
      console.error('Erro ao sincronizar produção:', err);
      setStatusMessage({ text: 'Erro ao sincronizar produção.', type: 'error' });
    } finally {
      setSyncLoading(false);
    }
  };

  const handleDeleteBoard = async (boardId: string) => {
    if (!canDelete) return;
    if (confirm('Tem certeza de que deseja excluir este quadro indicador da Gestão À Vista?')) {
      try {
        await deleteDoc(doc(db, 'gestao_a_vista_boards', boardId));
        setStatusMessage({ text: 'Quadro indicador excluído com sucesso.', type: 'success' });
        setTimeout(() => setStatusMessage(null), 3000);
      } catch (err) {
        console.error('Erro ao excluir quadro:', err);
        setStatusMessage({ text: 'Erro ao excluir quadro.', type: 'error' });
      }
    }
  };

  // Find max value in monthly series to auto-scale bars
  const maxChartValue = useMemo(() => {
    if (!activeBoard) return 100;
    if (activeBoard.type === 'dds_matrix') return 105;
    if (activeBoard.type === 'production_matrix') {
      let max = 0;
      displayedMonthlyData.forEach(m => {
        const r = Number(m.values['real'] || 0);
        const o = Number(m.values['orcado'] || 0);
        if (r > max) max = r;
        if (o > max) max = o;
      });
      return max > 0 ? Math.ceil(max * 1.15) : 200000;
    }

    let max = 0;
    displayedMonthlyData.forEach(m => {
      Object.values(m.values).forEach(v => {
        const num = Number(v);
        if (!isNaN(num) && num > max) max = num;
      });
    });

    return max > 0 ? Math.ceil(max * 1.25 * 10) / 10 : 10;
  }, [activeBoard, displayedMonthlyData]);

  return (
    <div className="min-h-screen bg-slate-100/70 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Header & Actions */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-800 flex items-center justify-center text-white shadow-md shadow-emerald-950/20">
            <Presentation className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">Gestão À Vista</h1>
              <span className="bg-emerald-100 text-emerald-800 text-xs font-black px-2.5 py-0.5 rounded-full border border-emerald-200">
                Painéis Operacionais • SecApp
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Painéis idênticos aos quadros acrílicos físicos espalhados pela planta para fechamento mensal, telões e impressão A4.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Modern Dynamic Year Navigator */}
          <div className="relative">
            <div className="flex items-center bg-slate-100/90 hover:bg-slate-100 border border-slate-300/80 rounded-xl p-1 shadow-xs transition-all">
              <button
                onClick={() => setSelectedYear((y) => y - 1)}
                title="Ano Anterior"
                className="p-1 rounded-lg hover:bg-white text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                onClick={() => setIsYearPickerOpen(!isYearPickerOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-black text-slate-800 hover:text-emerald-700 transition-colors cursor-pointer"
                title="Abrir calendário e seleção de anos"
              >
                <Calendar className="w-3.5 h-3.5 text-emerald-700" />
                <span className="text-[11px] text-slate-500 font-bold">Ano:</span>
                <span className="text-sm font-black text-emerald-950 tracking-tight">{selectedYear}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              <button
                onClick={() => setSelectedYear((y) => y + 1)}
                title="Próximo Ano"
                className="p-1 rounded-lg hover:bg-white text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Year Selector Popover */}
            {isYearPickerOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setIsYearPickerOpen(false)}
                />
                <div className="absolute right-0 top-full mt-2 z-50 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-emerald-700" />
                      <span className="text-xs font-black text-slate-800 uppercase tracking-wide">
                        Exercício / Ano dos Dados
                      </span>
                    </div>
                    <button
                      onClick={() => setIsYearPickerOpen(false)}
                      className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Quick Shortcut Buttons */}
                  <div className="grid grid-cols-3 gap-1.5 mb-3">
                    <button
                      onClick={() => {
                        setSelectedYear(new Date().getFullYear());
                        setIsYearPickerOpen(false);
                      }}
                      className={`px-2 py-1.5 rounded-lg text-[11px] font-black transition-all cursor-pointer ${
                        selectedYear === new Date().getFullYear()
                          ? 'bg-emerald-700 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      Atual ({new Date().getFullYear()})
                    </button>
                    <button
                      onClick={() => {
                        setSelectedYear(new Date().getFullYear() - 1);
                        setIsYearPickerOpen(false);
                      }}
                      className={`px-2 py-1.5 rounded-lg text-[11px] font-black transition-all cursor-pointer ${
                        selectedYear === new Date().getFullYear() - 1
                          ? 'bg-emerald-700 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {new Date().getFullYear() - 1}
                    </button>
                    <button
                      onClick={() => {
                        setSelectedYear(new Date().getFullYear() + 1);
                        setIsYearPickerOpen(false);
                      }}
                      className={`px-2 py-1.5 rounded-lg text-[11px] font-black transition-all cursor-pointer ${
                        selectedYear === new Date().getFullYear() + 1
                          ? 'bg-emerald-700 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {new Date().getFullYear() + 1}
                    </button>
                  </div>

                  {/* Dynamic Year Chips Grid (covers 24 dynamic years) */}
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Selecione o Ano
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 max-h-44 overflow-y-auto p-1 bg-slate-50/80 rounded-xl border border-slate-100 mb-3">
                    {Array.from({ length: 24 }, (_, i) => new Date().getFullYear() - 8 + i).map((yr) => (
                      <button
                        key={`year-chip-${yr}`}
                        onClick={() => {
                          setSelectedYear(yr);
                          setIsYearPickerOpen(false);
                        }}
                        className={`py-1.5 px-1 rounded-lg text-xs font-black transition-all cursor-pointer text-center ${
                          selectedYear === yr
                            ? 'bg-emerald-700 text-white shadow-xs ring-2 ring-emerald-500/30'
                            : 'bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-200/60'
                        }`}
                      >
                        {yr}
                      </button>
                    ))}
                  </div>

                  {/* Direct Manual Year Jump */}
                  <div className="pt-2.5 border-t border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Ou digite qualquer ano:
                    </span>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const parsed = parseInt(manualYearInput, 10);
                        if (!isNaN(parsed) && parsed >= 1990 && parsed <= 2150) {
                          setSelectedYear(parsed);
                          setIsYearPickerOpen(false);
                          setManualYearInput('');
                        }
                      }}
                      className="flex items-center gap-1.5"
                    >
                      <input
                        type="number"
                        min={1990}
                        max={2150}
                        placeholder="Ex: 2028"
                        value={manualYearInput}
                        onChange={(e) => setManualYearInput(e.target.value)}
                        className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <button
                        type="submit"
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-black cursor-pointer shadow-xs"
                      >
                        Ir
                      </button>
                    </form>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* PDF Landscape Export */}
          <button
            onClick={handleExportLandscapePdf}
            disabled={isExportingPdf}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            title="Exportar no formato exato da moldura acrílica A4 paisagem"
          >
            <Printer className="w-4 h-4 text-emerald-400" />
            <span>{isExportingPdf ? 'Exportando...' : 'Imprimir / PDF Acrílico'}</span>
          </button>

          {/* Kiosk / TV Mode */}
          <button
            onClick={() => setIsKioskMode(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer"
            title="Modo tela cheia para TV ou projetor de área"
          >
            <Tv className="w-4 h-4" />
            <span>Modo Telão TV</span>
          </button>

          {/* Fechamento / Edit button */}
          {canEdit && activeBoard && (
            <button
              onClick={handleOpenEditModal}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Fechamento Mensal / Editar</span>
            </button>
          )}

          {/* Add new board */}
          {canEdit && (
            <button
              onClick={() => setIsAddBoardModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-emerald-600 text-emerald-700 hover:bg-emerald-50 text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar Indicador</span>
            </button>
          )}
        </div>
      </div>

      {/* Status banner */}
      {statusMessage && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-3.5 rounded-xl border text-xs font-bold flex items-center justify-between ${
            statusMessage.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
            statusMessage.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' :
            'bg-sky-50 border-sky-200 text-sky-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Info className="w-4 h-4" />}
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}

      {/* Tabs / Board Selection */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {boards.map((b) => {
          const isActive = b.id === activeBoardId;
          return (
            <button
              key={b.id}
              onClick={() => setActiveBoardId(b.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap cursor-pointer ${
                isActive 
                  ? 'bg-emerald-800 text-white shadow-md shadow-emerald-900/20' 
                  : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <BarChart3 className={`w-4 h-4 ${isActive ? 'text-emerald-300' : 'text-slate-400'}`} />
              <span>{b.title}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold uppercase ${
                isActive ? 'bg-emerald-900/60 text-emerald-200' : 'bg-slate-100 text-slate-500'
              }`}>
                {b.year}
              </span>
            </button>
          );
        })}
      </div>

      {/* Acrylic Physical Board Simulation Container */}
      {activeBoard ? (
        <div className="space-y-4">
          {/* Action bar for active board */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs font-semibold text-slate-500 px-1 gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-700">{activeBoard.title}</span>
              <span>•</span>
              <span>Categoria: <strong className="text-slate-800">{activeBoard.category}</strong></span>
              {activeBoard.dataSource && (
                <span className="bg-emerald-100/80 text-emerald-900 border border-emerald-300 px-2 py-0.5 rounded text-[10px] font-black flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                  {activeBoard.dataSource === 'dds_online' ? (
                    ddsRealStats.hasRealData ? `Alimentado via DDS Online (${ddsSessions.length} sessões / ${ddsSignatures.length} presenças)` : 'Alimentado via DDS Online'
                  ) : activeBoard.dataSource === 'consumables_db' ? 'Alimentado via Arames & Insumos' :
                   activeBoard.dataSource === 'monthly_production' ? 'Alimentado via Controle de Produção' : 'Manual'}
                </span>
              )}
            </div>

            {/* Quick Sincronizar & Gestão Buttons - Exclusivo Master e Admin */}
            {canManage && (
              <div className="flex items-center gap-3">
                {activeBoard.type === 'dds_matrix' && (
                  <button
                    onClick={handleSyncDdsData}
                    disabled={syncLoading}
                    className="flex items-center gap-1.5 text-emerald-700 hover:text-emerald-800 font-bold bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200 transition-colors cursor-pointer"
                    title="Atualizar dados de DDS a partir das sessões e assinaturas reais do DDS Online"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncLoading ? 'animate-spin' : ''}`} />
                    <span>{syncLoading ? 'Sincronizando...' : 'Recalcular do DDS Online'}</span>
                  </button>
                )}

                {activeBoard.type === 'grouped_bars' && (
                  <button
                    onClick={handleSyncConsumablesData}
                    disabled={syncLoading}
                    className="flex items-center gap-1.5 text-emerald-700 hover:text-emerald-800 font-bold bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200 transition-colors cursor-pointer"
                    title="Atualizar consumo específico a partir das bobinas de arame e insumos do sistema"
                  >
                    <Database className={`w-3.5 h-3.5 ${syncLoading ? 'animate-spin' : ''}`} />
                    <span>{syncLoading ? 'Calculando...' : 'Sincronizar da Base do Sistema'}</span>
                  </button>
                )}

                {activeBoard.type === 'production_matrix' && (
                  <button
                    onClick={handleSyncProductionData}
                    disabled={syncLoading}
                    className="flex items-center gap-1.5 text-emerald-700 hover:text-emerald-800 font-bold bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200 transition-colors cursor-pointer"
                    title="Sincronizar valores de produção realizada e orçada a partir do Controle de Arames"
                  >
                    <Factory className={`w-3.5 h-3.5 ${syncLoading ? 'animate-spin' : ''}`} />
                    <span>{syncLoading ? 'Atualizando...' : 'Sincronizar Produção de Celulose'}</span>
                  </button>
                )}

                {canDelete && !activeBoard.isSystemDefault && (
                  <button
                    onClick={() => handleDeleteBoard(activeBoard.id)}
                    className="flex items-center gap-1 text-rose-600 hover:text-rose-700 font-bold hover:bg-rose-50 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                    title="Excluir este indicador"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Excluir</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Sub-Tabs for DDS: Physical Board vs Ranking das Letras vs Detalhamento Diário */}
          {activeBoard.type === 'dds_matrix' && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDdsDetailTab('board')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    ddsDetailTab === 'board' 
                      ? 'bg-emerald-800 text-white shadow-xs' 
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Presentation className="w-3.5 h-3.5" />
                  <span>Quadro Físico Acrílico (A4)</span>
                </button>

                <button
                  onClick={() => setDdsDetailTab('letters_ranking')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    ddsDetailTab === 'letters_ranking' 
                      ? 'bg-emerald-800 text-white shadow-xs' 
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Participação & Cumprimento por Letra</span>
                </button>

                <button
                  onClick={() => setDdsDetailTab('daily_rhythm')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    ddsDetailTab === 'daily_rhythm' 
                      ? 'bg-emerald-800 text-white shadow-xs' 
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  <span>Cumprimento por Dias e Letras</span>
                </button>
              </div>

              {/* Letter Filter Selector */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                <span className="text-[10px] font-black text-slate-500 uppercase px-2">Turma:</span>
                <button
                  onClick={() => setSelectedDdsLetter('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                    selectedDdsLetter === 'all' ? 'bg-white text-emerald-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Geral
                </button>
                {TURMAS_LETRAS.map(letra => (
                  <button
                    key={letra}
                    onClick={() => setSelectedDdsLetter(letra)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                      selectedDdsLetter === letra ? 'bg-white text-emerald-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Turma {letra}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ================= 1. PHYSICAL ACRYLIC FRAME SIMULATION (PRINTABLE CONTAINER) ================= */}
          {(activeBoard.type !== 'dds_matrix' || ddsDetailTab === 'board') && (
            <div 
              ref={boardPrintRef}
              className="bg-white rounded-3xl border-4 border-slate-300/80 shadow-2xl p-6 md:p-8 relative overflow-hidden transition-all print:p-0 print:border-none print:shadow-none"
              style={{
                boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.15), inset 0 0 0 2px rgba(255, 255, 255, 0.8)'
              }}
            >
              {/* Acrylic Mounting Hardware (Corner Bolts Simulation) */}
              <div className="absolute top-4 left-4 w-4 h-4 rounded-full bg-gradient-to-br from-slate-200 to-slate-400 border border-slate-400 shadow-inner flex items-center justify-center opacity-70">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-600"></div>
              </div>
              <div className="absolute top-4 right-4 w-4 h-4 rounded-full bg-gradient-to-br from-slate-200 to-slate-400 border border-slate-400 shadow-inner flex items-center justify-center opacity-70">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-600"></div>
              </div>
              <div className="absolute bottom-4 left-4 w-4 h-4 rounded-full bg-gradient-to-br from-slate-200 to-slate-400 border border-slate-400 shadow-inner flex items-center justify-center opacity-70">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-600"></div>
              </div>
              <div className="absolute bottom-4 right-4 w-4 h-4 rounded-full bg-gradient-to-br from-slate-200 to-slate-400 border border-slate-400 shadow-inner flex items-center justify-center opacity-70">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-600"></div>
              </div>

              {/* HEADER CAPSULE REPLICATING PHYSICAL BOARD EXACTLY */}
              <div className="flex items-center mb-6 pt-1">
                <div className="w-full flex items-center bg-[#004d2c] rounded-full p-1 shadow-md border border-[#003920]">
                  <div className="bg-gradient-to-r from-slate-300 via-slate-200 to-slate-300 text-slate-800 font-black text-xs sm:text-sm px-6 py-2 rounded-full uppercase tracking-wider shadow-inner flex items-center justify-center border border-slate-400/50">
                    INDICADORES
                  </div>

                  <div className="flex-1 px-4 sm:px-6 flex items-center justify-center text-white font-black text-sm sm:text-base md:text-lg tracking-wide uppercase truncate">
                    {activeBoard.title} {activeBoard.type === 'dds_matrix' && selectedDdsLetter !== 'all' ? `• TURMA ${selectedDdsLetter}` : ''}
                  </div>

                  <div className="flex items-center gap-3 pr-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-white shadow-sm hidden sm:block"></div>
                    
                    <div className="flex items-center px-4 py-1.5 bg-white/15 rounded-xl border border-white/25 backdrop-blur-xs shadow-xs">
                      <span className="font-black text-xs sm:text-sm tracking-widest text-white">
                        SECAPP
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ================= 1. DDS INDICADOR VIEW (PHOTO 2 REPLICATION) ================= */}
              {activeBoard.type === 'dds_matrix' && (
                <div className="space-y-0">
                  <div className="h-[310px] sm:h-[340px] w-full pt-8 pb-2 px-2 flex items-end justify-between border-b-2 border-slate-700">
                    {displayedMonthlyData.map((m) => {
                      const cumpVal = m.values['cumprimento'];
                      const partVal = m.values['participacao'];
                      const hasCump = typeof cumpVal === 'number' && cumpVal > 0;
                      const hasPart = typeof partVal === 'number' && partVal > 0;

                      const cumpHeightPct = hasCump ? Math.min(100, Math.max(5, (cumpVal! / 105) * 100)) : 0;
                      const partHeightPct = hasPart ? Math.min(100, Math.max(5, (partVal! / 105) * 100)) : 0;

                      return (
                        <div key={m.month} className="flex-1 flex flex-col items-center justify-end h-full px-1 sm:px-2 group">
                          <div className="text-[8px] sm:text-[10px] font-black text-slate-800 tracking-tighter mb-1 text-center leading-tight whitespace-nowrap">
                            {hasCump && <div className="text-[#008744]">{cumpVal}%</div>}
                            {hasPart && <div className="text-[#0057b7]">{partVal}%</div>}
                          </div>

                          <div className="w-full flex items-end justify-center gap-0.5 sm:gap-1 h-[220px]">
                            <div 
                              className="w-2.5 sm:w-4 bg-[#008744] rounded-t-sm transition-all duration-500"
                              style={{ height: `${cumpHeightPct}%` }}
                              title={`Cumprimento (${m.label}): ${cumpVal ?? 'Sem dados'}%`}
                            />
                            <div 
                              className="w-2.5 sm:w-4 bg-[#0057b7] rounded-t-sm transition-all duration-500"
                              style={{ height: `${partHeightPct}%` }}
                              title={`Participação (${m.label}): ${partVal ?? 'Sem dados'}%`}
                            />
                          </div>

                          <div className="text-[10px] sm:text-xs font-black text-slate-800 mt-2 text-center uppercase tracking-tight whitespace-nowrap">
                            {m.label}
                          </div>
                        </div>
                      );
                    })}

                    <div className="flex-1 flex flex-col items-center justify-end h-full px-1 sm:px-2 border-l border-slate-300/80 pl-2">
                      <div className="text-[8px] sm:text-[10px] font-black text-slate-800 tracking-tighter mb-1 text-center leading-tight whitespace-nowrap">
                        <div className="text-[#008744]">95%</div>
                        <div className="text-[#0057b7]">100%</div>
                      </div>
                      <div className="w-full flex items-end justify-center gap-0.5 sm:gap-1 h-[220px]">
                        <div 
                          className="w-2.5 sm:w-4 bg-[#008744] rounded-t-sm"
                          style={{ height: `${(95 / 105) * 100}%` }}
                          title="Meta Cumprimento: 95%"
                        />
                        <div 
                          className="w-2.5 sm:w-4 bg-[#0057b7] rounded-t-sm"
                          style={{ height: `${(100 / 105) * 100}%` }}
                          title="Meta Participação: 100%"
                        />
                      </div>
                      <div className="text-[10px] sm:text-xs font-black text-emerald-900 mt-2 text-center uppercase tracking-tight whitespace-nowrap">
                        Meta
                      </div>
                    </div>
                  </div>

                  <div className="w-full overflow-x-auto">
                    <table className="w-full text-center border-collapse border border-slate-700 text-xs sm:text-sm font-bold">
                      <thead>
                        <tr className="bg-slate-100/90 text-slate-700 divide-x divide-slate-400">
                          <th className="py-1 px-2 border-b border-slate-400 text-left w-32 sm:w-40 font-black"></th>
                          {displayedMonthlyData.map(m => (
                            <th key={m.month} className="py-1 px-1 border-b border-slate-400 font-bold text-[11px] sm:text-xs">
                              {m.label}
                            </th>
                          ))}
                          <th className="py-1 px-2 border-b border-slate-400 font-black text-[11px] sm:text-xs bg-slate-200 text-slate-900">
                            Meta
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-400">
                        <tr className="hover:bg-slate-50 transition-colors divide-x divide-slate-400">
                          <td className="py-1.5 px-2 text-left flex items-center gap-2 font-black text-slate-800 text-[11px] sm:text-xs">
                            <span className="w-3 h-3 bg-[#008744] rounded-xs inline-block shadow-xs flex-shrink-0"></span>
                            <span>Cumprimento</span>
                          </td>
                          {displayedMonthlyData.map(m => {
                            const val = m.values['cumprimento'];
                            return (
                              <td key={m.month} className="py-1.5 px-0.5 text-[11px] sm:text-xs font-bold text-slate-900">
                                {val !== null && val !== undefined ? val : ''}
                              </td>
                            );
                          })}
                          <td className="py-1.5 px-2 font-black text-emerald-800 bg-emerald-50 text-[11px] sm:text-xs">
                            {activeBoard.targets?.['cumprimento'] || 95}
                          </td>
                        </tr>

                        <tr className="hover:bg-slate-50 transition-colors divide-x divide-slate-400">
                          <td className="py-1.5 px-2 text-left flex items-center gap-2 font-black text-slate-800 text-[11px] sm:text-xs">
                            <span className="w-3 h-3 bg-[#0057b7] rounded-xs inline-block shadow-xs flex-shrink-0"></span>
                            <span>Participação</span>
                          </td>
                          {displayedMonthlyData.map(m => {
                            const val = m.values['participacao'];
                            return (
                              <td key={m.month} className="py-1.5 px-0.5 text-[11px] sm:text-xs font-bold text-slate-900">
                                {val !== null && val !== undefined ? val : ''}
                              </td>
                            );
                          })}
                          <td className="py-1.5 px-2 font-black text-blue-800 bg-blue-50 text-[11px] sm:text-xs">
                            {activeBoard.targets?.['participacao'] || 100}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ================= 2. PRODUÇÃO DE CELULOSE VIEW (PHOTO 3 REPLICATION) ================= */}
              {activeBoard.type === 'production_matrix' && (
                <div className="space-y-0">
                  <div className="h-[310px] sm:h-[340px] w-full pt-8 pb-2 px-2 flex items-end justify-between border-b-2 border-slate-700">
                    {displayedMonthlyData.map((m) => {
                      const realVal = m.values['real'];
                      const orcadoVal = m.values['orcado'];
                      const hasReal = typeof realVal === 'number' && realVal > 0;
                      const hasOrcado = typeof orcadoVal === 'number' && orcadoVal > 0;

                      const realHeightPct = hasReal ? Math.min(100, Math.max(5, (realVal! / maxChartValue) * 100)) : 0;
                      const orcadoHeightPct = hasOrcado ? Math.min(100, Math.max(5, (orcadoVal! / maxChartValue) * 100)) : 0;

                      const formatVal = (v: number) => Math.round(v).toLocaleString('pt-BR');

                      return (
                        <div key={m.month} className="flex-1 flex flex-col items-center justify-end h-full px-0.5 sm:px-1.5 group">
                          <div className="text-[8px] sm:text-[10px] font-black text-slate-800 tracking-tighter mb-1 text-center leading-tight whitespace-nowrap">
                            {hasReal && <div className="text-[#008744]">{formatVal(realVal!)}</div>}
                            {hasOrcado && <div className="text-[#0057b7] font-bold">{formatVal(orcadoVal!)}</div>}
                          </div>

                          <div className="w-full flex items-end justify-center gap-0.5 sm:gap-1.5 h-[220px]">
                            <div 
                              className="w-2.5 sm:w-4 bg-[#008744] rounded-t-sm transition-all duration-500"
                              style={{ height: `${realHeightPct}%` }}
                              title={`Real (${m.label}): ${hasReal ? formatVal(realVal!) : 'Sem dados'} t`}
                            />
                            <div 
                              className="w-2.5 sm:w-4 bg-[#0057b7] rounded-t-sm transition-all duration-500"
                              style={{ height: `${orcadoHeightPct}%` }}
                              title={`Orçado (${m.label}): ${hasOrcado ? formatVal(orcadoVal!) : 'Sem dados'} t`}
                            />
                          </div>

                          <div className="text-[10px] sm:text-xs font-black text-slate-800 mt-2 text-center uppercase tracking-tight whitespace-nowrap">
                            {m.label}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="w-full overflow-x-auto">
                    <table className="w-full text-center border-collapse border border-slate-700 text-xs sm:text-sm font-bold">
                      <thead>
                        <tr className="bg-slate-100/90 text-slate-700 divide-x divide-slate-400">
                          <th className="py-1 px-2 border-b border-slate-400 text-left w-28 sm:w-36 font-black"></th>
                          {displayedMonthlyData.map(m => (
                            <th key={m.month} className="py-1 px-1 border-b border-slate-400 font-bold text-[11px] sm:text-xs">
                              {m.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-400">
                        <tr className="hover:bg-slate-50 transition-colors divide-x divide-slate-400">
                          <td className="py-1.5 px-2 text-left flex items-center gap-2 font-black text-slate-800 text-[11px] sm:text-xs">
                            <span className="w-3 h-3 bg-[#008744] rounded-xs inline-block shadow-xs flex-shrink-0"></span>
                            <span>Real</span>
                          </td>
                          {displayedMonthlyData.map(m => {
                            const val = m.values['real'];
                            return (
                              <td key={m.month} className="py-1.5 px-0.5 text-[10px] sm:text-xs font-bold text-slate-900">
                                {val !== null && val !== undefined && val > 0 ? Math.round(val).toLocaleString('pt-BR') : ''}
                              </td>
                            );
                          })}
                        </tr>

                        <tr className="hover:bg-slate-50 transition-colors divide-x divide-slate-400">
                          <td className="py-1.5 px-2 text-left flex items-center gap-2 font-black text-slate-800 text-[11px] sm:text-xs">
                            <span className="w-3 h-3 bg-[#0057b7] rounded-xs inline-block shadow-xs flex-shrink-0"></span>
                            <span>Orçado</span>
                          </td>
                          {displayedMonthlyData.map(m => {
                            const val = m.values['orcado'];
                            return (
                              <td key={m.month} className="py-1.5 px-0.5 text-[10px] sm:text-xs font-bold text-slate-900">
                                {val !== null && val !== undefined && val > 0 ? Math.round(val).toLocaleString('pt-BR') : ''}
                              </td>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ================= 3. CONSUMÍVEIS VIEW (PHOTO 1 REPLICATION) ================= */}
              {activeBoard.type === 'grouped_bars' && (
                <div className="space-y-4">
                  <div className="h-[300px] sm:h-[350px] w-full pt-8 pb-2 px-2 flex items-end justify-between border-b border-slate-700">
                    {displayedMonthlyData.map((m) => {
                      return (
                        <div key={m.month} className="flex-1 flex flex-col items-center justify-end h-full px-0.5 sm:px-1">
                          <div className="w-full flex items-end justify-center gap-0.5 sm:gap-1 h-[260px]">
                            {activeBoard.series.map((s) => {
                              const val = m.values[s.id];
                              const hasVal = typeof val === 'number';
                              const numVal = hasVal ? val : 0;
                              const heightPct = numVal > 0 ? Math.min(100, Math.max(4, (numVal / maxChartValue) * 100)) : 0;

                              const displayVal = hasVal ? (
                                Number.isInteger(numVal) ? String(numVal) : numVal.toFixed(2).replace('.', ',')
                              ) : '';

                              return (
                                <div key={s.id} className="flex flex-col items-center justify-end h-full flex-1 max-w-[14px]">
                                  {numVal > 0 && (
                                    <span className="text-[8px] sm:text-[9px] font-bold text-slate-800 mb-0.5 leading-none transform -rotate-45 sm:rotate-0 origin-bottom">
                                      {displayVal}
                                    </span>
                                  )}
                                  <div
                                    className="w-full rounded-t-xs transition-all duration-300"
                                    style={{
                                      height: `${heightPct}%`,
                                      backgroundColor: s.color
                                    }}
                                    title={`${s.name} (${m.label}): ${displayVal}`}
                                  />
                                </div>
                              );
                            })}
                          </div>

                          <div className="text-[10px] sm:text-xs font-bold text-slate-800 mt-2 text-center whitespace-nowrap">
                            {m.label}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 pt-2">
                    {activeBoard.series.map((s) => (
                      <div key={s.id} className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        <span 
                          className="w-3.5 h-3.5 rounded-xs inline-block shadow-xs flex-shrink-0"
                          style={{ backgroundColor: s.color }}
                        />
                        <span>{s.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* FOOTER PANORAMA REPLICATING PHYSICAL FACTORY BANNER */}
              <div className="mt-8 pt-4 border-t border-slate-200">
                <div className="w-full h-14 sm:h-16 rounded-xl overflow-hidden shadow-inner relative flex items-center justify-between px-4 bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-950 border border-slate-300">
                  <div 
                    className="absolute inset-0 opacity-40 bg-cover bg-center mix-blend-luminosity pointer-events-none"
                    style={{
                      backgroundImage: `url('/logo_file/Imagem_Enfardamento 2.png')`
                    }}
                  />
                  
                  <div className="relative z-10 flex items-center justify-between w-full text-white text-[11px] sm:text-xs font-bold tracking-wider">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      <span className="uppercase text-slate-200">Complexo Industrial • Enfardamento & Produção</span>
                    </div>
                    <div className="text-slate-400 uppercase text-[10px] hidden sm:block">
                      Quadro Oficial de Gestão À Vista • Sistema SecApp
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-300 font-black tracking-widest uppercase text-xs sm:text-sm">
                        SECAPP
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= 2. DDS DETALHAMENTO: PARTICIPAÇÃO E CUMPRIMENTO POR LETRA ================= */}
          {activeBoard.type === 'dds_matrix' && ddsDetailTab === 'letters_ranking' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {TURMAS_LETRAS.map((letra) => {
                  const stats = ddsRealStats.letterStats[letra];
                  const meetsCompliance = stats.cumprimentoRate >= 95;
                  const meetsParticipation = stats.participacaoRate >= 100;

                  return (
                    <div 
                      key={letra} 
                      className={`bg-white rounded-2xl p-5 border shadow-sm transition-all hover:shadow-md ${
                        selectedDdsLetter === letra ? 'border-emerald-600 ring-2 ring-emerald-500/20' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-10 h-10 rounded-xl bg-emerald-800 text-white font-black text-lg flex items-center justify-center shadow-sm">
                            {letra}
                          </div>
                          <div>
                            <h4 className="font-black text-slate-800 text-sm">Turma {letra}</h4>
                            <span className="text-[10px] text-slate-400 font-bold uppercase">Escala 2026</span>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            setSelectedDdsLetter(letra);
                            setDdsDetailTab('board');
                          }}
                          className="text-[10px] font-black text-emerald-700 hover:text-emerald-800 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200 cursor-pointer"
                          title="Visualizar quadro acrílico exclusivo desta turma"
                        >
                          Ver Quadro
                        </button>
                      </div>

                      <div className="space-y-3">
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-[10px] font-black text-slate-500 uppercase">Cumprimento</span>
                            <span className={`font-black ${meetsCompliance ? 'text-emerald-700' : 'text-amber-600'}`}>
                              {stats.cumprimentoRate}%
                            </span>
                          </div>
                          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${meetsCompliance ? 'bg-emerald-600' : 'bg-amber-500'}`} 
                              style={{ width: `${Math.min(100, stats.cumprimentoRate)}%` }}
                            />
                          </div>
                          <span className="text-[9px] text-slate-400 block mt-1 font-semibold">Meta de Cumprimento: 95%</span>
                        </div>

                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-[10px] font-black text-slate-500 uppercase">Participação</span>
                            <span className={`font-black ${meetsParticipation ? 'text-blue-700' : 'text-slate-700'}`}>
                              {stats.participacaoRate}%
                            </span>
                          </div>
                          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${meetsParticipation ? 'bg-blue-600' : 'bg-slate-500'}`} 
                              style={{ width: `${Math.min(100, stats.participacaoRate)}%` }}
                            />
                          </div>
                          <span className="text-[9px] text-slate-400 block mt-1 font-semibold">Meta de Presença: 100%</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-1 text-center">
                          <div className="bg-emerald-50/60 p-2 rounded-lg border border-emerald-100">
                            <span className="text-[9px] font-bold text-slate-400 uppercase block">Reuniões</span>
                            <span className="text-xs font-black text-emerald-900">{stats.completedCount}</span>
                          </div>
                          <div className="bg-blue-50/60 p-2 rounded-lg border border-blue-100">
                            <span className="text-[9px] font-bold text-slate-400 uppercase block">Assinaturas</span>
                            <span className="text-xs font-black text-blue-900">{stats.signaturesCount}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Monthly breakdown table for all letters */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6">
                <h4 className="font-black text-slate-800 text-sm mb-4 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  Comparativo Mensal de Cumprimento e Participação por Letra ({selectedYear})
                </h4>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 font-black text-slate-600">
                      <tr>
                        <th className="py-2.5 px-3">Mês</th>
                        <th className="py-2.5 px-3 text-center">Média Geral</th>
                        {TURMAS_LETRAS.map(letra => (
                          <th key={letra} className="py-2.5 px-3 text-center">
                            Turma {letra}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {displayedMonthlyData.map((m, idx) => {
                        return (
                          <tr key={m.month} className="hover:bg-slate-50/80">
                            <td className="py-2 px-3 font-black text-slate-800 bg-slate-50/40">
                              {m.label}
                            </td>
                            <td className="py-2 px-3 text-center font-black text-emerald-800 bg-emerald-50/30">
                              {m.values['cumprimento'] !== null ? `${m.values['cumprimento']}% / ${m.values['participacao']}%` : '-'}
                            </td>
                            {TURMAS_LETRAS.map(letra => {
                              const lData = ddsRealStats.monthLetterCompliance?.[idx]?.[letra];
                              const cRate = lData?.rate ?? null;

                              return (
                                <td key={letra} className="py-2 px-3 text-center">
                                  {cRate !== null ? (
                                    <span className={`font-black px-2 py-0.5 rounded-md text-[11px] ${cRate >= 95 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                                      {cRate}%
                                    </span>
                                  ) : (
                                    <span className="text-slate-300">-</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================= 3. DDS DETALHAMENTO: CUMPRIMENTO POR DIAS E LETRAS ================= */}
          {activeBoard.type === 'dds_matrix' && ddsDetailTab === 'daily_rhythm' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <h4 className="font-black text-slate-800 text-base flex items-center gap-2">
                    <CalendarDays className="w-5 h-5 text-emerald-600" />
                    Cumprimento do DDS por Dias e Letras (Escala Real de Turno)
                  </h4>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Visão detalhada de cada dia do mês demonstrando a realização do DDS por turma de acordo com a escala operacional.
                  </p>
                </div>

                {/* Month Picker */}
                <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
                  <Calendar className="w-4 h-4 text-emerald-700 ml-1" />
                  <span className="text-xs font-bold text-slate-700">Mês:</span>
                  <select
                    value={selectedDdsMonth}
                    onChange={(e) => setSelectedDdsMonth(Number(e.target.value))}
                    className="bg-white px-3 py-1.5 rounded-lg text-xs font-black text-emerald-900 border border-slate-200 outline-none cursor-pointer"
                  >
                    {MONTHS_FULL_NAMES.map((name, idx) => (
                      <option key={name} value={idx}>{name} de {selectedYear}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Status Legend */}
              <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-[10px] uppercase font-black text-slate-400">Legenda de Status:</span>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block shadow-xs"></span>
                  <span>DDS Realizado</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-amber-500 inline-block shadow-xs"></span>
                  <span>Em Andamento</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-rose-500 inline-block shadow-xs"></span>
                  <span>Não Realizado (Escalado)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-slate-300 inline-block shadow-xs"></span>
                  <span>Folga da Turma</span>
                </div>
              </div>

              {/* Daily Table Matrix */}
              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-center border-collapse text-xs">
                  <thead className="bg-slate-100/90 text-slate-700 divide-x divide-slate-200 font-black">
                    <tr>
                      <th className="py-2.5 px-3 text-left w-24">Dia</th>
                      <th className="py-2.5 px-2 w-16">Semana</th>
                      {TURMAS_LETRAS.map(letra => (
                        <th key={letra} className="py-2.5 px-2">
                          Turma {letra}
                        </th>
                      ))}
                      <th className="py-2.5 px-3 bg-emerald-50 text-emerald-900">Cumprimento</th>
                      <th className="py-2.5 px-3 bg-blue-50 text-blue-900">Assinaturas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {dailyDdsRhythm.map((d) => {
                      const isToday = new Date().getFullYear() === selectedYear && new Date().getMonth() === selectedDdsMonth && new Date().getDate() === d.day;

                      return (
                        <tr key={d.day} className={`hover:bg-slate-50/90 transition-colors divide-x divide-slate-200 ${isToday ? 'bg-amber-50/40' : ''}`}>
                          <td className="py-2 px-3 text-left font-black text-slate-800">
                            Dia {d.dayStr} {isToday && <span className="text-[9px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-black ml-1">Hoje</span>}
                          </td>
                          <td className="py-2 px-2 font-bold text-slate-500 capitalize">
                            {d.dayOfWeek}
                          </td>

                          {TURMAS_LETRAS.map(letra => {
                            const info = d.lettersStatus[letra];

                            if (info.status === 'completed') {
                              return (
                                <td key={letra} className="py-2 px-2 bg-emerald-50/60">
                                  <div className="inline-flex items-center gap-1 bg-emerald-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-xs" title={`${info.shift || 'Turno'}: ${info.signatures} assinaturas`}>
                                    <Check className="w-3 h-3" />
                                    <span>{info.signatures} ass.</span>
                                  </div>
                                </td>
                              );
                            }

                            if (info.status === 'active') {
                              return (
                                <td key={letra} className="py-2 px-2 bg-amber-50/60">
                                  <div className="inline-flex items-center gap-1 bg-amber-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-xs">
                                    <Clock className="w-3 h-3" />
                                    <span>Aberto</span>
                                  </div>
                                </td>
                              );
                            }

                            if (info.status === 'missing') {
                              return (
                                <td key={letra} className="py-2 px-2 bg-rose-50/40">
                                  <div className="inline-flex items-center gap-1 bg-rose-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-xs">
                                    <AlertCircle className="w-3 h-3" />
                                    <span>Pendente</span>
                                  </div>
                                </td>
                              );
                            }

                            return (
                              <td key={letra} className="py-2 px-2 text-slate-300 font-bold bg-slate-50/30">
                                <span className="text-[10px] text-slate-400">Folga</span>
                              </td>
                            );
                          })}

                          <td className="py-2 px-3 font-black text-emerald-800 bg-emerald-50/40">
                            {d.dayCompliancePct}%
                          </td>
                          <td className="py-2 px-3 font-black text-blue-800 bg-blue-50/40">
                            {d.totalSignaturesToday}
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
      ) : (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-sm">
          <Presentation className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-700">Nenhum quadro indicador disponível</h3>
          <p className="text-xs text-slate-400 mt-1">Clique em "Adicionar Indicador" para criar um novo painel para a fábrica.</p>
        </div>
      )}

      {/* ================= MODAL: FECHAMENTO MENSAL / EDITAR VALORES ================= */}
      {isEditModalOpen && canEdit && activeBoard && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col"
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                  Fechamento Mensal: {activeBoard.title} ({activeBoard.year})
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Atualize os valores mensais realizados para os 12 meses do ano.
                </p>
              </div>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4">
              {/* Informative Guidance Banner */}
              <div className="bg-sky-50 border border-sky-200 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-sky-900">
                <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">
                    Cálculo Automático vs. Entrada Manual:
                  </p>
                  <p className="text-[11px] text-sky-700 leading-relaxed">
                    Meses com dados do <strong>DDS Online</strong> trazem os indicadores calculados em tempo real. Você pode digitar valores manuais para qualquer mês (inclusive meses sem dados) para fechar o indicador. O sistema respeita e prioriza o que for digitado manualmente em todos os gráficos, rankings e relatórios. Se quiser restaurar o cálculo automático, basta clicar em <strong>Resetar Auto</strong>.
                  </p>
                </div>
              </div>

              {/* Targets / Metas Configuration */}
              {activeBoard.type === 'dds_matrix' && (
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <span className="text-xs font-black text-slate-700 uppercase tracking-wider block mb-2">Metas dos Indicadores:</span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {activeBoard.series.map(s => (
                      <div key={s.id} className="bg-white p-2.5 rounded-xl border border-slate-200">
                        <span className="text-[10px] font-bold text-slate-500 block truncate">{s.name}</span>
                        <div className="flex items-center gap-1 mt-1">
                          <input
                            type="number"
                            step="any"
                            value={editTargets[s.id] ?? s.target ?? ''}
                            onChange={(e) => {
                              const val = e.target.value === '' ? undefined : Number(e.target.value);
                              setEditTargets(prev => {
                                const next = { ...prev };
                                if (val !== undefined) {
                                  next[s.id] = val;
                                } else {
                                  delete next[s.id];
                                }
                                return next;
                              });
                            }}
                            className="w-full text-xs font-black text-slate-800 bg-slate-50 border border-slate-200 rounded-lg p-1 outline-none focus:border-emerald-500"
                          />
                          <span className="text-[10px] font-bold text-slate-400">{activeBoard.unit}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Monthly Closing Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-100 border-b border-slate-200 font-black text-slate-700">
                    <tr>
                      <th className="py-2.5 px-3 w-28">Mês</th>
                      {activeBoard.series.map(s => (
                        <th key={s.id} className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: s.color }}></span>
                            <span className="truncate">{s.name} {s.unit ? `(${s.unit})` : (activeBoard.unit ? `(${activeBoard.unit})` : '')}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {editMonthlyData.map((m, mIdx) => (
                      <tr key={m.month} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-3 font-black text-slate-700 bg-slate-50/50">
                          {m.label}
                        </td>
                        {activeBoard.series.map(s => {
                          const isManual = m.manualOverrides?.[s.id] === true;
                          const currentVal = m.values?.[s.id];
                          const realStat = activeBoard.type === 'dds_matrix' ? ddsRealStats.monthlyStats[mIdx] : null;
                          const onlineVal = realStat ? (realStat as any)[s.id] : null;
                          const hasOnlineData = onlineVal !== null && onlineVal !== undefined;

                          return (
                            <td key={s.id} className="py-2 px-3 align-top">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    step="any"
                                    value={currentVal !== null && currentVal !== undefined ? currentVal : ''}
                                    placeholder={hasOnlineData ? `${onlineVal}%` : (activeBoard.type === 'dds_matrix' ? '100%' : '-')}
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      const numVal = raw === '' ? null : Number(raw);
                                      setEditMonthlyData(prev => {
                                        const next = [...prev];
                                        const item = { ...next[mIdx] };
                                        item.values = {
                                          ...item.values,
                                          [s.id]: numVal
                                        };
                                        item.manualOverrides = {
                                          ...(item.manualOverrides || {}),
                                          [s.id]: numVal !== null
                                        };
                                        next[mIdx] = item;
                                        return next;
                                      });
                                    }}
                                    className={`w-28 text-xs font-bold rounded-lg px-2.5 py-1.5 outline-none transition-all ${
                                      isManual
                                        ? 'bg-amber-50 border-2 border-amber-400 text-amber-950 font-black focus:border-amber-500'
                                        : 'bg-white border border-slate-300 text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
                                    }`}
                                  />
                                  <span className="text-[11px] font-bold text-slate-400">{s.unit || activeBoard.unit}</span>
                                </div>

                                {/* DDS indicators status pill & reset option */}
                                {activeBoard.type === 'dds_matrix' && (
                                  <div className="flex items-center gap-1.5 pt-0.5">
                                    {isManual ? (
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] font-black text-amber-800 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded-md">
                                          ✏️ Manual
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditMonthlyData(prev => {
                                              const next = [...prev];
                                              const item = { ...next[mIdx] };
                                              const fallbackVal = hasOnlineData ? onlineVal : 100;
                                              item.values = {
                                                ...item.values,
                                                [s.id]: fallbackVal
                                              };
                                              item.manualOverrides = {
                                                ...(item.manualOverrides || {}),
                                                [s.id]: false
                                              };
                                              next[mIdx] = item;
                                              return next;
                                            });
                                          }}
                                          className="text-[10px] font-bold text-emerald-700 hover:text-emerald-900 hover:underline cursor-pointer"
                                          title="Voltar ao cálculo automático do DDS"
                                        >
                                          Resetar Auto
                                        </button>
                                      </div>
                                    ) : (
                                      <span className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                                        {hasOnlineData ? (
                                          <span className="text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md">
                                            ⚡ DDS Online ({onlineVal}%)
                                          </span>
                                        ) : (
                                          <span className="text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md">
                                            🔹 Padrão 100%
                                          </span>
                                        )}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>

              <button
                onClick={async () => {
                  try {
                    const updatedBoard = {
                      ...activeBoard,
                      year: selectedYear,
                      targets: editTargets,
                      monthlyData: editMonthlyData,
                      updatedAt: serverTimestamp(),
                      updatedBy: user?.displayName || user?.email || 'Usuário'
                    };

                    // 1. Update React state immediately so charts, tables and KPIs update in 0ms
                    setBoards(prev => prev.map(b => b.id === activeBoard.id ? updatedBoard : b));

                    // 2. Persist to Firestore
                    await setDoc(doc(db, 'gestao_a_vista_boards', activeBoard.id), updatedBoard, { merge: true });

                    // Synchronize with monthly_production collection (two-way sync with WireControl)
                    if (activeBoard.type === 'production_matrix' || activeBoard.id.startsWith('producao_celulose')) {
                      for (let i = 0; i < editMonthlyData.length; i++) {
                        const mData = editMonthlyData[i];
                        const monthNum = i + 1;
                        const realVal = mData.values['real'];
                        const orcadoVal = mData.values['orcado'];
                        const prodDocId = `${selectedYear}-${monthNum}`;

                        const prodPayload: any = {
                          year: selectedYear,
                          month: monthNum,
                          productionTons: (realVal !== undefined && realVal !== null && realVal !== '') ? Number(realVal) : 0,
                          budgetedTons: (orcadoVal !== undefined && orcadoVal !== null && orcadoVal !== '') ? Number(orcadoVal) : 0,
                          updatedAt: serverTimestamp(),
                          updatedBy: user?.displayName || user?.email || 'Gestão À Vista'
                        };
                        await setDoc(doc(db, 'monthly_production', prodDocId), prodPayload, { merge: true });
                      }
                    }

                    setIsEditModalOpen(false);
                    setStatusMessage({ text: 'Fechamento mensal salvo e sincronizado com sucesso!', type: 'success' });
                    setTimeout(() => setStatusMessage(null), 3000);
                  } catch (err: any) {
                    console.error('Erro ao salvar fechamento:', err);
                    setStatusMessage({ 
                      text: `Erro ao salvar fechamento: ${err?.message || 'Permissões insuficientes ou erro no banco.'}`, 
                      type: 'error' 
                    });
                  }
                }}
                className="flex items-center gap-1.5 px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Salvar Fechamento Mensal</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ================= MODAL: ADICIONAR NOVO INDICADOR ================= */}
      {isAddBoardModalOpen && canCreate && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col"
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <Plus className="w-5 h-5 text-emerald-600" />
                  Cadastrar Novo Quadro de Gestão À Vista
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Crie novos indicadores com metas e séries para exibição nos quadros físicos e telões.
                </p>
              </div>
              <button 
                onClick={() => setIsAddBoardModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const title = (form.elements.namedItem('boardTitle') as HTMLInputElement).value;
                const category = (form.elements.namedItem('boardCategory') as HTMLInputElement).value;
                const unit = (form.elements.namedItem('boardUnit') as HTMLInputElement).value;
                const type = (form.elements.namedItem('boardType') as HTMLSelectElement).value as any;
                const seriesNamesRaw = (form.elements.namedItem('seriesNames') as HTMLInputElement).value;

                const seriesList = seriesNamesRaw.split(',').map((name, i) => {
                  const colors = ['#165b33', '#0057b7', '#ca8a04', '#dc2626', '#7c3aed', '#0284c7'];
                  return {
                    id: `series_${i + 1}`,
                    name: name.trim(),
                    color: colors[i % colors.length]
                  };
                });

                const months = getMonthLabels(selectedYear);
                const monthlyData = months.map(m => {
                  const values: MonthlyValues = {};
                  seriesList.forEach(s => {
                    values[s.id] = null;
                  });
                  return {
                    month: m.month,
                    label: m.label,
                    values
                  };
                });

                const boardId = `board_${Date.now()}`;
                const newBoard: GestaoBoard = {
                  id: boardId,
                  title: title.toUpperCase(),
                  category,
                  year: selectedYear,
                  unit: unit || 'un',
                  type,
                  series: seriesList,
                  monthlyData,
                  order: boards.length + 1,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                  updatedBy: user?.displayName || user?.email || 'Usuário'
                };

                try {
                  await setDoc(doc(db, 'gestao_a_vista_boards', boardId), newBoard);
                  setIsAddBoardModalOpen(false);
                  setActiveBoardId(boardId);
                  setStatusMessage({ text: 'Novo indicador criado com sucesso! Use o botão Fechamento para preencher os dados.', type: 'success' });
                  setTimeout(() => setStatusMessage(null), 4000);
                } catch (err: any) {
                  console.error('Erro ao criar indicador:', err);
                  setStatusMessage({ 
                    text: `Erro ao criar indicador: ${err?.message || 'Falha ao salvar no banco.'}`, 
                    type: 'error' 
                  });
                }
              }}
              className="space-y-4 pt-4"
            >
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Título do Indicador:</label>
                <input
                  required
                  name="boardTitle"
                  type="text"
                  placeholder="ex: PARADAS DE PRODUÇÃO, MANUTENÇÃO PREVENTIVA"
                  className="w-full text-xs font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Categoria / Setor:</label>
                  <input
                    required
                    name="boardCategory"
                    type="text"
                    defaultValue="Operação"
                    placeholder="ex: Manutenção, Produção, Segurança"
                    className="w-full text-xs font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Unidade de Medida:</label>
                  <input
                    required
                    name="boardUnit"
                    type="text"
                    defaultValue="%"
                    placeholder="%, kg/t, kWh/t, un, h, t"
                    className="w-full text-xs font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Formato Visual do Quadro:</label>
                <select
                  name="boardType"
                  className="w-full text-xs font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value="grouped_bars">Barras Verticais Agrupadas com Valores no Topo (Padrão Consumíveis)</option>
                  <option value="dds_matrix">Barras com Tabela Integrada e Meta (Padrão DDS)</option>
                  <option value="production_matrix">Barras com Tabela Integrada (Padrão Produção Celulose Real vs Orçado)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Nomes das Séries / Variáveis (separadas por vírgula):
                </label>
                <input
                  required
                  name="seriesNames"
                  type="text"
                  defaultValue="Real, Meta"
                  placeholder="ex: Linha 1, Linha 2, Linha 3"
                  className="w-full text-xs font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <span className="text-[10px] text-slate-400 font-semibold block mt-1">
                  Cada item separado por vírgula será representado por uma barra colorida em cada mês.
                </span>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddBoardModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer"
                >
                  Cadastrar Indicador
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* ================= FULLSCREEN KIOSK / MODO TELÃO TV ================= */}
      {isKioskMode && (
        <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col p-4 sm:p-6 overflow-hidden">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-700 flex items-center justify-center font-black">
                <Tv className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-black tracking-tight text-white flex items-center gap-2">
                  <span>Modo Telão Fábrica • Gestão À Vista</span>
                  <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded-full font-bold">
                    Ao Vivo
                  </span>
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const idx = boards.findIndex(b => b.id === activeBoardId);
                  const prevIdx = (idx - 1 + boards.length) % boards.length;
                  setActiveBoardId(boards[prevIdx].id);
                }}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <button
                onClick={() => setKioskAutoPlay(!kioskAutoPlay)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                  kioskAutoPlay ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300'
                }`}
                title="Girar automaticamente a cada 15 segundos"
              >
                {kioskAutoPlay ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{kioskAutoPlay ? 'Rotação Automática (15s)' : 'Pausado'}</span>
              </button>

              <button
                onClick={() => {
                  const idx = boards.findIndex(b => b.id === activeBoardId);
                  const nextIdx = (idx + 1) % boards.length;
                  setActiveBoardId(boards[nextIdx].id);
                }}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                <ChevronRight className="w-5 h-5" />
              </button>

              <button
                onClick={() => setIsKioskMode(false)}
                className="p-1.5 rounded-lg bg-rose-900/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 ml-2 cursor-pointer"
                title="Sair da tela cheia"
              >
                <Minimize2 className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center p-2 sm:p-6 overflow-auto">
            <div className="w-full max-w-6xl bg-white text-slate-900 rounded-3xl p-6 sm:p-10 shadow-2xl border-4 border-slate-700">
              <div className="flex items-center mb-6">
                <div className="w-full flex items-center bg-[#004d2c] rounded-full p-1.5 shadow-md">
                  <div className="bg-gradient-to-r from-slate-300 to-slate-200 text-slate-900 font-black text-sm sm:text-base px-6 py-2 rounded-full uppercase tracking-wider">
                    INDICADORES
                  </div>
                  <div className="flex-1 px-6 text-center text-white font-black text-base sm:text-xl uppercase tracking-wider truncate">
                    {activeBoard?.title} {activeBoard?.type === 'dds_matrix' && selectedDdsLetter !== 'all' ? `• TURMA ${selectedDdsLetter}` : ''}
                  </div>
                  <div className="flex items-center gap-2 pr-4">
                    <div className="flex items-center px-4 py-1.5 bg-white/15 rounded-xl border border-white/25">
                      <span className="text-white font-black text-sm sm:text-base tracking-widest">
                        SECAPP
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Chart presentation in kiosk */}
              {activeBoard?.type === 'dds_matrix' ? (
                <div>
                  <div className="h-[310px] w-full flex items-end justify-between border-b-2 border-slate-700 pb-2 px-2">
                    {displayedMonthlyData.map(m => {
                      const cVal = m.values['cumprimento'];
                      const pVal = m.values['participacao'];
                      const hasC = typeof cVal === 'number' && cVal > 0;
                      const hasP = typeof pVal === 'number' && pVal > 0;
                      return (
                        <div key={m.month} className="flex-1 flex flex-col items-center justify-end h-full px-1">
                          <div className="text-[10px] sm:text-xs font-black text-slate-800 mb-1 leading-tight text-center">
                            {hasC && <div className="text-[#008744]">{cVal}%</div>}
                            {hasP && <div className="text-[#0057b7]">{pVal}%</div>}
                          </div>
                          <div className="w-full flex items-end justify-center gap-1 h-[220px]">
                            <div className="w-3 sm:w-5 bg-[#008744] rounded-t-sm" style={{ height: `${hasC ? (cVal! / 105) * 100 : 0}%` }} />
                            <div className="w-3 sm:w-5 bg-[#0057b7] rounded-t-sm" style={{ height: `${hasP ? (pVal! / 105) * 100 : 0}%` }} />
                          </div>
                          <div className="text-[10px] sm:text-xs font-black text-slate-800 mt-2 text-center uppercase tracking-tight whitespace-nowrap">
                            {m.label}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <table className="w-full text-center border-collapse border border-slate-700 text-xs sm:text-sm font-bold mt-2">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 divide-x divide-slate-400">
                        <th className="py-1 px-2 border-b border-slate-400 text-left w-32 font-black"></th>
                        {displayedMonthlyData.map(m => (
                          <th key={m.month} className="py-1 px-1 border-b border-slate-400 font-bold text-xs">{m.label}</th>
                        ))}
                        <th className="py-1 px-2 border-b border-slate-400 font-black text-xs bg-slate-200">Meta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-400">
                      <tr className="divide-x divide-slate-400">
                        <td className="py-1.5 px-2 text-left font-black text-slate-800">■ Cumprimento</td>
                        {displayedMonthlyData.map(m => (
                          <td key={m.month} className="py-1.5 text-xs font-bold text-slate-900">{m.values['cumprimento'] ?? ''}</td>
                        ))}
                        <td className="py-1.5 font-black text-emerald-800 bg-emerald-50">95</td>
                      </tr>
                      <tr className="divide-x divide-slate-400">
                        <td className="py-1.5 px-2 text-left font-black text-slate-800">■ Participação</td>
                        {displayedMonthlyData.map(m => (
                          <td key={m.month} className="py-1.5 text-xs font-bold text-slate-900">{m.values['participacao'] ?? ''}</td>
                        ))}
                        <td className="py-1.5 font-black text-blue-800 bg-blue-50">100</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : activeBoard?.type === 'production_matrix' ? (
                <div>
                  <div className="h-[310px] w-full flex items-end justify-between border-b-2 border-slate-700 pb-2 px-2">
                    {displayedMonthlyData.map(m => {
                      const rVal = m.values['real'];
                      const oVal = m.values['orcado'];
                      const hasR = typeof rVal === 'number' && rVal > 0;
                      const hasO = typeof oVal === 'number' && oVal > 0;
                      return (
                        <div key={m.month} className="flex-1 flex flex-col items-center justify-end h-full px-1">
                          <div className="text-[10px] font-black text-slate-800 mb-1 leading-tight text-center">
                            {hasR && <div className="text-[#008744]">{Math.round(rVal!).toLocaleString('pt-BR')}</div>}
                            {hasO && <div className="text-[#0057b7] font-bold">{Math.round(oVal!).toLocaleString('pt-BR')}</div>}
                          </div>
                          <div className="w-full flex items-end justify-center gap-1 h-[220px]">
                            <div className="w-3 sm:w-5 bg-[#008744] rounded-t-sm" style={{ height: `${hasR ? (rVal! / maxChartValue) * 100 : 0}%` }} />
                            <div className="w-3 sm:w-5 bg-[#0057b7] rounded-t-sm" style={{ height: `${hasO ? (oVal! / maxChartValue) * 100 : 0}%` }} />
                          </div>
                          <div className="text-[10px] sm:text-xs font-black text-slate-800 mt-2 text-center uppercase tracking-tight whitespace-nowrap">
                            {m.label}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <table className="w-full text-center border-collapse border border-slate-700 text-xs sm:text-sm font-bold mt-2">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 divide-x divide-slate-400">
                        <th className="py-1 px-2 border-b border-slate-400 text-left w-32 font-black"></th>
                        {displayedMonthlyData.map(m => (
                          <th key={m.month} className="py-1 px-1 border-b border-slate-400 font-bold text-xs">{m.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-400">
                      <tr className="divide-x divide-slate-400">
                        <td className="py-1.5 px-2 text-left font-black text-slate-800">■ Real</td>
                        {displayedMonthlyData.map(m => (
                          <td key={m.month} className="py-1.5 text-xs font-bold text-slate-900">
                            {m.values['real'] ? Math.round(m.values['real']!).toLocaleString('pt-BR') : ''}
                          </td>
                        ))}
                      </tr>
                      <tr className="divide-x divide-slate-400">
                        <td className="py-1.5 px-2 text-left font-black text-slate-800">■ Orçado</td>
                        {displayedMonthlyData.map(m => (
                          <td key={m.month} className="py-1.5 text-xs font-bold text-slate-900">
                            {m.values['orcado'] ? Math.round(m.values['orcado']!).toLocaleString('pt-BR') : ''}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div>
                  <div className="h-[320px] w-full flex items-end justify-between border-b border-slate-700 pb-2 px-2">
                    {displayedMonthlyData.map(m => (
                      <div key={m.month} className="flex-1 flex flex-col items-center justify-end h-full px-1">
                        <div className="w-full flex items-end justify-center gap-1 h-[260px]">
                          {activeBoard.series.map(s => {
                            const val = m.values[s.id];
                            const num = typeof val === 'number' ? val : 0;
                            const hPct = num > 0 ? (num / maxChartValue) * 100 : 0;
                            return (
                              <div key={s.id} className="flex flex-col items-center justify-end h-full flex-1 max-w-[16px]">
                                {num > 0 && (
                                  <span className="text-[9px] font-bold text-slate-800 mb-0.5 leading-none">
                                    {Number.isInteger(num) ? num : num.toFixed(2).replace('.', ',')}
                                  </span>
                                )}
                                <div className="w-full rounded-t-xs" style={{ height: `${hPct}%`, backgroundColor: s.color }} />
                              </div>
                            );
                          })}
                        </div>
                        <div className="text-xs font-bold text-slate-800 mt-2 text-center">{m.label}</div>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-6 pt-3">
                    {activeBoard?.series.map(s => (
                      <div key={s.id} className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        <span className="w-3.5 h-3.5 rounded-xs" style={{ backgroundColor: s.color }} />
                        <span>{s.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GestaoAVista;
