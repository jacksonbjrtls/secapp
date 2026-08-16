import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  Timestamp, 
  writeBatch, 
  doc, 
  serverTimestamp,
  setDoc,
  addDoc
} from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { encryptValue } from '../../lib/crypto';
import { safeToDate, cn, formatDateBR, formatDateDDMMAAAA } from '../../lib/utils';
import { fetchUsersSafely, getLocalCachedUsers } from '../../lib/usersCache';
import * as XLSX from 'xlsx';
import { 
  FileSpreadsheet, 
  UploadCloud, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  Loader2, 
  Info, 
  Trash2, 
  Play, 
  Download, 
  Users, 
  ClipboardCheck, 
  Layers, 
  ShieldCheck, 
  HelpCircle,
  Clock,
  Sparkles,
  ArrowRight,
  Database,
  Upload,
  FileUp,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface DDSBulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type ImportMode = 'sessions' | 'signatures' | 'unified';

interface ParsedSessionRow {
  index: number;
  raw: string[];
  id?: string;
  dateStr: string;
  dateObj: Date | null;
  shift: string; // 'Turno 1' | 'Turno 2' | 'Turno 3'
  group: string; // 'A' | 'B' | 'C' | 'D' | 'E'
  title: string;
  description: string;
  executor: string;
  totalPrevisto: number;
  passcode?: string;
  errors: string[];
  warnings: string[];
}

interface ParsedSignatureRow {
  index: number;
  raw: string[];
  sessionId?: string;
  sessionKey?: string; // e.g. "2024-05-10_Turno 1_A"
  participantName: string;
  registration?: string; // Matricula
  dateStr: string;
  dateObj: Date | null;
  shift?: string;
  group?: string;
  sessionTitle?: string;
  mood?: 'happy' | 'neutral' | 'sad';
  errors: string[];
  warnings: string[];
}

interface ParsedUnifiedRow {
  index: number;
  raw: string[];
  dateStr: string;
  dateObj: Date | null;
  shift: string;
  group: string;
  title: string;
  description: string;
  executor: string;
  totalPrevisto: number;
  participantName: string;
  registration?: string;
  signatureDateStr?: string;
  signatureDateObj: Date | null;
  mood?: 'happy' | 'neutral' | 'sad';
  errors: string[];
  warnings: string[];
}

const getLocalDateStr = (dateVal: any): string => {
  if (!dateVal) return '';
  const d = safeToDate(dateVal);
  if (!d || isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const DDSBulkImportModal: React.FC<DDSBulkImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [activeMode, setActiveMode] = useState<ImportMode>('sessions');
  const [inputText, setInputText] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [delimiter, setDelimiter] = useState<'auto' | 'tsv' | 'csv_semicolon' | 'csv_comma'>('auto');
  const [hasHeaders, setHasHeaders] = useState(true);

  // Parsing state
  const [parsedSessions, setParsedSessions] = useState<ParsedSessionRow[]>([]);
  const [parsedSignatures, setParsedSignatures] = useState<ParsedSignatureRow[]>([]);
  const [parsedUnified, setParsedUnified] = useState<ParsedUnifiedRow[]>([]);

  // Execution state
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [isCompleted, setIsCompleted] = useState(false);
  const [importSummary, setImportSummary] = useState({
    sessionsCreated: 0,
    sessionsUpdated: 0,
    sessionsSkipped: 0,
    signaturesCreated: 0,
    signaturesSkipped: 0,
    errorsCount: 0
  });

  // Reset when opening
  useEffect(() => {
    if (isOpen) {
      setInputText('');
      setUploadedFileName(null);
      setIsDragging(false);
      setIsCompleted(false);
      setProgressPercent(0);
      setStatusMessage('');
      setParsedSessions([]);
      setParsedSignatures([]);
      setParsedUnified([]);
    }
  }, [isOpen]);

  // File Upload Processor
  const processUploadedFile = async (file: File) => {
    try {
      setUploadedFileName(`${file.name} (${Math.round(file.size / 1024)} KB)`);
      const ext = file.name.split('.').pop()?.toLowerCase();

      if (ext === 'xlsx' || ext === 'xls') {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) return;
        const sheet = workbook.Sheets[firstSheetName];
        // Convert to CSV using semicolon delimiter for clean row extraction
        const csvText = XLSX.utils.sheet_to_csv(sheet, { FS: ';' });
        setInputText(csvText);
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = (e.target?.result as string) || '';
          setInputText(text);
        };
        reader.readAsText(file, 'utf-8');
      }
    } catch (err) {
      console.error('Erro ao processar arquivo:', err);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processUploadedFile(file);
    }
    // reset input so same file can be re-selected if needed
    if (e.target) e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processUploadedFile(file);
    }
  };

  // Helper date parser
  const parseDateFlexible = (val: string): Date | null => {
    if (!val) return null;
    const clean = val.trim();
    if (!clean) return null;

    // Check Excel serial number
    if (/^\d{5}(\.\d+)?$/.test(clean)) {
      const serial = parseFloat(clean);
      const utcDays = serial - 25569;
      const utcValue = utcDays * 86400;
      const dateInfo = new Date(utcValue * 1000);
      if (!isNaN(dateInfo.getTime())) return dateInfo;
    }

    // Format DD/MM/YYYY or DD/MM/YYYY HH:mm or DD/MM/YYYY HH:mm:ss
    const ddmmyyyy = clean.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (ddmmyyyy) {
      const day = parseInt(ddmmyyyy[1], 10);
      const month = parseInt(ddmmyyyy[2], 10) - 1;
      const year = parseInt(ddmmyyyy[3], 10);
      const hour = ddmmyyyy[4] ? parseInt(ddmmyyyy[4], 10) : 12;
      const min = ddmmyyyy[5] ? parseInt(ddmmyyyy[5], 10) : 0;
      const sec = ddmmyyyy[6] ? parseInt(ddmmyyyy[6], 10) : 0;
      const d = new Date(year, month, day, hour, min, sec);
      if (!isNaN(d.getTime())) return d;
    }

    // Format YYYY-MM-DD
    const yyyymmdd = clean.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (yyyymmdd) {
      const year = parseInt(yyyymmdd[1], 10);
      const month = parseInt(yyyymmdd[2], 10) - 1;
      const day = parseInt(yyyymmdd[3], 10);
      const hour = yyyymmdd[4] ? parseInt(yyyymmdd[4], 10) : 12;
      const min = yyyymmdd[5] ? parseInt(yyyymmdd[5], 10) : 0;
      const sec = yyyymmdd[6] ? parseInt(yyyymmdd[6], 10) : 0;
      const d = new Date(year, month, day, hour, min, sec);
      if (!isNaN(d.getTime())) return d;
    }

    const fallback = new Date(clean);
    return isNaN(fallback.getTime()) ? null : fallback;
  };

  // Normalize Shift string to 'Turno 1' | 'Turno 2' | 'Turno 3'
  const normalizeShift = (val: string): string => {
    const s = (val || '').trim().toLowerCase();
    if (s.includes('3') || s.includes('terceiro') || s.includes('t3')) return 'Turno 3';
    if (s.includes('2') || s.includes('segundo') || s.includes('t2')) return 'Turno 2';
    return 'Turno 1';
  };

  // Normalize Group/Letter string to 'A' | 'B' | 'C' | 'D' | 'E'
  const normalizeGroup = (val: string): string => {
    const s = (val || '').trim().toUpperCase();
    if (s.includes('B')) return 'B';
    if (s.includes('C')) return 'C';
    if (s.includes('D')) return 'D';
    if (s.includes('E')) return 'E';
    return 'A';
  };

  // Normalize Mood
  const normalizeMood = (val: string): 'happy' | 'neutral' | 'sad' => {
    const s = (val || '').trim().toLowerCase();
    if (s.includes('triste') || s.includes('cansado') || s.includes('sad') || s.includes('ruim')) return 'sad';
    if (s.includes('neutro') || s.includes('normal') || s.includes('regular') || s.includes('meh')) return 'neutral';
    return 'happy';
  };

  // Normalize Header for intelligent column discovery
  const normalizeHeader = (h: string): string => {
    return (h || '')
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  };

  // Auto-detect delimiter
  const detectDelimiter = (text: string): '\t' | ';' | ',' => {
    if (delimiter === 'tsv') return '\t';
    if (delimiter === 'csv_semicolon') return ';';
    if (delimiter === 'csv_comma') return ',';

    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0).slice(0, 5);
    let tabCount = 0;
    let semiCount = 0;
    let commaCount = 0;

    lines.forEach(l => {
      tabCount += (l.match(/\t/g) || []).length;
      semiCount += (l.match(/;/g) || []).length;
      commaCount += (l.match(/,/g) || []).length;
    });

    if (tabCount >= semiCount && tabCount >= commaCount && tabCount > 0) return '\t';
    if (semiCount >= commaCount && semiCount > 0) return ';';
    return ',';
  };

  // Line parser supporting quotes
  const parseLine = (line: string, delim: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
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

  // Parse on input change
  useEffect(() => {
    if (!inputText.trim()) {
      setParsedSessions([]);
      setParsedSignatures([]);
      setParsedUnified([]);
      return;
    }

    const activeDelim = detectDelimiter(inputText);
    const lines = inputText.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length === 0) return;

    const startIdx = hasHeaders ? 1 : 0;
    const headerRow = hasHeaders ? parseLine(lines[0], activeDelim) : [];
    const normHeaders = headerRow.map(normalizeHeader);

    // -------------------------------------------------------------------------
    // SESSIONS PARSER
    // -------------------------------------------------------------------------
    if (activeMode === 'sessions') {
      const results: ParsedSessionRow[] = [];

      // Smart Header Index Resolution
      let hIdIdx = -1;
      let hDateIdx = -1;
      let hShiftIdx = -1;
      let hGroupIdx = -1;
      let hTitleIdx = -1;
      let hDescIdx = -1;
      let hExecIdx = -1;
      let hTotalIdx = -1;
      let hPassIdx = -1;

      if (hasHeaders && normHeaders.length > 0) {
        normHeaders.forEach((h, idx) => {
          if (['id', 'idds', 'codigodds', 'coddds', 'legacyid'].includes(h)) hIdIdx = idx;
          else if (['data', 'datadds', 'dt', 'date', 'dataabertura', 'dia'].includes(h)) hDateIdx = idx;
          else if (['turno', 'shift', 't'].includes(h)) hShiftIdx = idx;
          else if (['letra', 'turma', 'grupo', 'group'].includes(h)) hGroupIdx = idx;
          else if (['tema', 'titulo', 'temadds', 'assunto', 'title', 'topico', 'topic', 'treinamento'].some(k => h.includes(k))) hTitleIdx = idx;
          else if (['descricao', 'desc', 'observacao', 'obs', 'detalhes', 'description', 'conteudo', 'resumo'].some(k => h.includes(k))) hDescIdx = idx;
          else if (['executante', 'responsavel', 'instrutor', 'facilitador', 'gestor', 'executor', 'ministrante', 'lider', 'quemaplicou', 'aplicador'].some(k => h.includes(k))) hExecIdx = idx;
          else if (['totalprevisto', 'total', 'previsto', 'meta', 'quantidade', 'nparticipantes', 'qtd'].some(k => h.includes(k))) hTotalIdx = idx;
          else if (['senha', 'passcode', 'pin', 'codigoacesso'].some(k => h.includes(k))) hPassIdx = idx;
        });
      }

      const hasSmartHeaders = hTitleIdx !== -1 && (hDateIdx !== -1 || hShiftIdx !== -1);

      for (let i = startIdx; i < lines.length; i++) {
        const raw = parseLine(lines[i], activeDelim);
        if (raw.every(cell => !cell.trim())) continue;

        const errors: string[] = [];
        const warnings: string[] = [];

        let idVal = '';
        let dateVal = '';
        let shiftVal = '';
        let groupVal = '';
        let titleVal = '';
        let descVal = '';
        let execVal = '';
        let totalVal = '9';
        let passVal = '';

        if (hasSmartHeaders) {
          if (hIdIdx !== -1 && raw[hIdIdx]) idVal = raw[hIdIdx];
          if (hDateIdx !== -1 && raw[hDateIdx]) dateVal = raw[hDateIdx];
          if (hShiftIdx !== -1 && raw[hShiftIdx]) shiftVal = raw[hShiftIdx];
          if (hGroupIdx !== -1 && raw[hGroupIdx]) groupVal = raw[hGroupIdx];
          if (hTitleIdx !== -1 && raw[hTitleIdx]) titleVal = raw[hTitleIdx];
          if (hDescIdx !== -1 && raw[hDescIdx]) descVal = raw[hDescIdx];
          if (hExecIdx !== -1 && raw[hExecIdx]) execVal = raw[hExecIdx];
          if (hTotalIdx !== -1 && raw[hTotalIdx]) totalVal = raw[hTotalIdx];
          if (hPassIdx !== -1 && raw[hPassIdx]) passVal = raw[hPassIdx];
        } else {
          // Positional fallback
          if (raw.length === 1) {
            errors.push('Linha sem separadores adequados.');
          } else if (raw.length >= 8) {
            // [ID, Data, Turno, Letra, Tema, Descrição, Executante, Total Previsto, Senha]
            idVal = raw[0];
            dateVal = raw[1];
            shiftVal = raw[2];
            groupVal = raw[3];
            titleVal = raw[4];
            descVal = raw[5] || '';
            execVal = raw[6];
            totalVal = raw[7] || '9';
            passVal = raw[8] || '';
          } else if (raw.length >= 6) {
            // [Data, Turno, Letra, Tema, Descrição, Executante, Total]
            dateVal = raw[0];
            shiftVal = raw[1];
            groupVal = raw[2];
            titleVal = raw[3];
            descVal = raw[4] || '';
            execVal = raw[5];
            totalVal = raw[6] || '9';
          } else if (raw.length === 5) {
            // [Data, Turno, Letra, Tema, Executante] or [Data, Turno, Letra, Tema, Descrição]
            dateVal = raw[0];
            shiftVal = raw[1];
            groupVal = raw[2];
            titleVal = raw[3];
            execVal = raw[4];
            descVal = '';
          } else if (raw.length >= 4) {
            // [Data, Turno, Letra, Tema]
            dateVal = raw[0];
            shiftVal = raw[1];
            groupVal = raw[2];
            titleVal = raw[3];
            descVal = '';
            execVal = 'Gestor Operacional';
          }
        }

        const dateObj = parseDateFlexible(dateVal);
        if (!dateObj) {
          errors.push(`Data inválida ou não reconhecida: "${dateVal}"`);
        }

        const normShift = normalizeShift(shiftVal);
        const normGroup = normalizeGroup(groupVal);
        const parsedTotal = parseInt(totalVal, 10) || 9;

        if (!titleVal) {
          const ddmmyyyy = dateObj ? formatDateDDMMAAAA(dateObj) : dateVal;
          titleVal = `${normShift} - DDS ${ddmmyyyy}`;
        }

        results.push({
          index: i + 1,
          raw,
          id: idVal,
          dateStr: dateVal,
          dateObj,
          shift: normShift,
          group: normGroup,
          title: titleVal,
          // Description is completely optional - accept empty without warning/error
          description: descVal ? descVal.trim() : '',
          executor: execVal ? execVal.trim() : 'Gestor Operacional',
          totalPrevisto: parsedTotal,
          passcode: passVal || Math.floor(100000 + Math.random() * 900000).toString(),
          errors,
          warnings
        });
      }

      setParsedSessions(results);
    } 
    
    // -------------------------------------------------------------------------
    // SIGNATURES PARSER
    // -------------------------------------------------------------------------
    else if (activeMode === 'signatures') {
      const results: ParsedSignatureRow[] = [];

      // Smart Header Index Resolution for Signatures
      let hSigIdIdx = -1;
      let hSigPartIdx = -1;
      let hSigRegIdx = -1;
      let hSigDateIdx = -1;
      let hSigShiftIdx = -1;
      let hSigGroupIdx = -1;
      let hSigThemeIdx = -1;
      let hSigMoodIdx = -1;

      if (hasHeaders && normHeaders.length > 0) {
        normHeaders.forEach((h, idx) => {
          if (['id', 'idds', 'codigodds', 'sessao', 'sessionid'].includes(h)) hSigIdIdx = idx;
          else if (['colaborador', 'nome', 'participante', 'nomecolaborador', 'funcionario', 'operador', 'presente', 'name'].some(k => h.includes(k))) hSigPartIdx = idx;
          else if (['matricula', 're', 'cracha', 'registro', 'idcolaborador'].some(k => h.includes(k))) hSigRegIdx = idx;
          else if (['dataassinatura', 'datahora', 'datahoraassinatura', 'horaassinatura', 'timestamp', 'data', 'dt'].some(k => h.includes(k))) hSigDateIdx = idx;
          else if (['turno', 'shift', 't'].includes(h)) hSigShiftIdx = idx;
          else if (['letra', 'turma', 'grupo', 'group'].includes(h)) hSigGroupIdx = idx;
          else if (['tema', 'titulo', 'temadds', 'assunto'].some(k => h.includes(k))) hSigThemeIdx = idx;
          else if (['humor', 'sentimento', 'mood', 'status'].some(k => h.includes(k))) hSigMoodIdx = idx;
        });
      }

      const hasSmartHeaders = hSigPartIdx !== -1;

      for (let i = startIdx; i < lines.length; i++) {
        const raw = parseLine(lines[i], activeDelim);
        if (raw.every(cell => !cell.trim())) continue;

        const errors: string[] = [];
        const warnings: string[] = [];

        let sessionIdVal = '';
        let participantName = '';
        let regVal = '';
        let dateVal = '';
        let shiftVal = '';
        let groupVal = '';
        let themeVal = '';
        let moodVal = '';

        if (hasSmartHeaders) {
          if (hSigIdIdx !== -1 && raw[hSigIdIdx]) sessionIdVal = raw[hSigIdIdx];
          if (hSigPartIdx !== -1 && raw[hSigPartIdx]) participantName = raw[hSigPartIdx];
          if (hSigRegIdx !== -1 && raw[hSigRegIdx]) regVal = raw[hSigRegIdx];
          if (hSigDateIdx !== -1 && raw[hSigDateIdx]) dateVal = raw[hSigDateIdx];
          if (hSigShiftIdx !== -1 && raw[hSigShiftIdx]) shiftVal = raw[hSigShiftIdx];
          if (hSigGroupIdx !== -1 && raw[hSigGroupIdx]) groupVal = raw[hSigGroupIdx];
          if (hSigThemeIdx !== -1 && raw[hSigThemeIdx]) themeVal = raw[hSigThemeIdx];
          if (hSigMoodIdx !== -1 && raw[hSigMoodIdx]) moodVal = raw[hSigMoodIdx];
        } else {
          // Positional fallback
          if (raw.length >= 6) {
            if (parseDateFlexible(raw[0])) {
              dateVal = raw[0];
              shiftVal = raw[1];
              groupVal = raw[2];
              participantName = raw[3];
              regVal = raw[4];
              moodVal = raw[6] || '';
              sessionIdVal = '';
            } else {
              sessionIdVal = raw[0];
              participantName = raw[1];
              regVal = raw[2];
              dateVal = raw[3];
              shiftVal = raw[4] || '';
              groupVal = raw[5] || '';
              themeVal = raw[6] || '';
              moodVal = raw[7] || '';
            }
          } else if (raw.length >= 3) {
            if (parseDateFlexible(raw[0])) {
              dateVal = raw[0];
              participantName = raw[1];
              regVal = raw[2] || '';
            } else {
              sessionIdVal = raw[0];
              participantName = raw[1];
              dateVal = raw[2];
              regVal = raw[3] || '';
            }
          } else if (raw.length >= 2) {
            sessionIdVal = raw[0];
            participantName = raw[1];
            dateVal = new Date().toISOString();
          }
        }

        if (!participantName) {
          errors.push('Nome do colaborador é obrigatório.');
        }

        const dateObj = parseDateFlexible(dateVal) || new Date();
        const normShift = shiftVal ? normalizeShift(shiftVal) : undefined;
        const normGroup = groupVal ? normalizeGroup(groupVal) : undefined;
        const normMood = normalizeMood(moodVal);

        let sessionKey: string | undefined = undefined;
        if (dateObj && normShift && normGroup) {
          const dStr = getLocalDateStr(dateObj);
          sessionKey = `${dStr}_${normShift}_${normGroup}`;
        }

        results.push({
          index: i + 1,
          raw,
          sessionId: sessionIdVal,
          sessionKey,
          participantName,
          registration: regVal,
          dateStr: dateVal,
          dateObj,
          shift: normShift,
          group: normGroup,
          sessionTitle: themeVal,
          mood: normMood,
          errors,
          warnings
        });
      }

      setParsedSignatures(results);
    } 
    
    // -------------------------------------------------------------------------
    // UNIFIED PARSER
    // -------------------------------------------------------------------------
    else if (activeMode === 'unified') {
      const results: ParsedUnifiedRow[] = [];

      let uDateIdx = -1;
      let uShiftIdx = -1;
      let uGroupIdx = -1;
      let uTitleIdx = -1;
      let uDescIdx = -1;
      let uExecIdx = -1;
      let uPartIdx = -1;
      let uRegIdx = -1;
      let uSigDateIdx = -1;
      let uMoodIdx = -1;

      if (hasHeaders && normHeaders.length > 0) {
        normHeaders.forEach((h, idx) => {
          if (['data', 'datadds', 'dt', 'date'].includes(h)) uDateIdx = idx;
          else if (['turno', 'shift', 't'].includes(h)) uShiftIdx = idx;
          else if (['letra', 'turma', 'grupo', 'group'].includes(h)) uGroupIdx = idx;
          else if (['tema', 'titulo', 'temadds', 'assunto'].some(k => h.includes(k))) uTitleIdx = idx;
          else if (['descricao', 'desc', 'observacao', 'obs', 'detalhes'].some(k => h.includes(k))) uDescIdx = idx;
          else if (['executante', 'responsavel', 'instrutor', 'gestor', 'executor'].some(k => h.includes(k))) uExecIdx = idx;
          else if (['colaborador', 'nome', 'participante', 'funcionario', 'operador'].some(k => h.includes(k))) uPartIdx = idx;
          else if (['matricula', 're', 'cracha', 'registro'].some(k => h.includes(k))) uRegIdx = idx;
          else if (['dataassinatura', 'datahora', 'timestamp'].some(k => h.includes(k))) uSigDateIdx = idx;
          else if (['humor', 'sentimento', 'mood'].some(k => h.includes(k))) uMoodIdx = idx;
        });
      }

      const hasSmartHeaders = uTitleIdx !== -1 && uPartIdx !== -1;

      for (let i = startIdx; i < lines.length; i++) {
        const raw = parseLine(lines[i], activeDelim);
        if (raw.every(cell => !cell.trim())) continue;

        const errors: string[] = [];
        const warnings: string[] = [];

        let dateVal = '';
        let shiftVal = '';
        let groupVal = '';
        let titleVal = '';
        let descVal = '';
        let execVal = '';
        let partVal = '';
        let regVal = '';
        let sigDateVal = '';
        let moodVal = '';

        if (hasSmartHeaders) {
          if (uDateIdx !== -1 && raw[uDateIdx]) dateVal = raw[uDateIdx];
          if (uShiftIdx !== -1 && raw[uShiftIdx]) shiftVal = raw[uShiftIdx];
          if (uGroupIdx !== -1 && raw[uGroupIdx]) groupVal = raw[uGroupIdx];
          if (uTitleIdx !== -1 && raw[uTitleIdx]) titleVal = raw[uTitleIdx];
          if (uDescIdx !== -1 && raw[uDescIdx]) descVal = raw[uDescIdx];
          if (uExecIdx !== -1 && raw[uExecIdx]) execVal = raw[uExecIdx];
          if (uPartIdx !== -1 && raw[uPartIdx]) partVal = raw[uPartIdx];
          if (uRegIdx !== -1 && raw[uRegIdx]) regVal = raw[uRegIdx];
          if (uSigDateIdx !== -1 && raw[uSigDateIdx]) sigDateVal = raw[uSigDateIdx];
          if (uMoodIdx !== -1 && raw[uMoodIdx]) moodVal = raw[uMoodIdx];
        } else {
          // Columns: [Data, Turno, Letra, Tema, Descrição, Executante, Colaborador, Matrícula, DataAssinatura, Humor]
          dateVal = raw[0] || '';
          shiftVal = raw[1] || '';
          groupVal = raw[2] || '';
          titleVal = raw[3] || '';
          descVal = raw[4] || '';
          execVal = raw[5] || '';
          partVal = raw[6] || '';
          regVal = raw[7] || '';
          sigDateVal = raw[8] || dateVal;
          moodVal = raw[9] || '';
        }

        const dateObj = parseDateFlexible(dateVal);
        if (!dateObj) {
          errors.push(`Data do DDS inválida: "${dateVal}"`);
        }
        const normShift = normalizeShift(shiftVal);
        const normGroup = normalizeGroup(groupVal);

        if (!titleVal) {
          const ddmmyyyy = dateObj ? formatDateDDMMAAAA(dateObj) : dateVal;
          titleVal = `${normShift} - DDS ${ddmmyyyy}`;
        }
        if (!partVal) {
          errors.push('Nome do colaborador é obrigatório');
        }

        const sigDateObj = parseDateFlexible(sigDateVal) || dateObj;

        results.push({
          index: i + 1,
          raw,
          dateStr: dateVal,
          dateObj,
          shift: normShift,
          group: normGroup,
          title: titleVal,
          description: descVal ? descVal.trim() : '',
          executor: execVal ? execVal.trim() : 'Gestor Operacional',
          totalPrevisto: 9,
          participantName: partVal,
          registration: regVal,
          signatureDateStr: sigDateVal,
          signatureDateObj: sigDateObj,
          mood: normalizeMood(moodVal),
          errors,
          warnings
        });
      }

      setParsedUnified(results);
    }
  }, [inputText, activeMode, delimiter, hasHeaders]);

  // Total error count
  const currentTotalErrors = useMemo(() => {
    if (activeMode === 'sessions') return parsedSessions.reduce((acc, r) => acc + r.errors.length, 0);
    if (activeMode === 'signatures') return parsedSignatures.reduce((acc, r) => acc + r.errors.length, 0);
    return parsedUnified.reduce((acc, r) => acc + r.errors.length, 0);
  }, [activeMode, parsedSessions, parsedSignatures, parsedUnified]);

  const currentTotalValid = useMemo(() => {
    if (activeMode === 'sessions') return parsedSessions.filter(r => r.errors.length === 0).length;
    if (activeMode === 'signatures') return parsedSignatures.filter(r => r.errors.length === 0).length;
    return parsedUnified.filter(r => r.errors.length === 0).length;
  }, [activeMode, parsedSessions, parsedSignatures, parsedUnified]);

  // Templates download
  const downloadSessionExcelCSV = () => {
    const headers = ['ID_DDS', 'Data', 'Turno', 'Letra', 'Tema_DDS', 'Descricao', 'Executante', 'Total_Previsto'];
    const row1 = ['DDS-101', '10/05/2024', 'Turno 1', 'A', 'Uso Correto de EPIs nas Linhas', 'Orientação sobre protetor auricular e óculos', 'Alessandro Sousa', '9'];
    const row2 = ['DDS-102', '10/05/2024', 'Turno 2', 'B', 'Atenção aos Pontos de Prensamento', 'Verificação de proteções fixas e móveis', 'Carlos Oliveira', '9'];
    const row3 = ['DDS-103', '11/05/2024', 'Turno 1', 'C', 'Segurança no Enfardamento e Amarração', 'Procedimentos seguros no abastecimento de arame', 'Marcos Santos', '9'];

    const content = "\uFEFF" + [headers.join(';'), row1.join(';'), row2.join(';'), row3.join(';')].join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "modelo_dds_criados_excel.csv";
    link.click();
  };

  const downloadSessionSheetsTSV = () => {
    const headers = ['ID_DDS', 'Data', 'Turno', 'Letra', 'Tema_DDS', 'Descricao', 'Executante', 'Total_Previsto'];
    const row1 = ['DDS-101', '10/05/2024', 'Turno 1', 'A', 'Uso Correto de EPIs nas Linhas', 'Orientação sobre protetor auricular e óculos', 'Alessandro Sousa', '9'];
    const row2 = ['DDS-102', '10/05/2024', 'Turno 2', 'B', 'Atenção aos Pontos de Prensamento', 'Verificação de proteções fixas e móveis', 'Carlos Oliveira', '9'];

    const content = "\uFEFF" + [headers.join('\t'), row1.join('\t'), row2.join('\t')].join('\n');
    const blob = new Blob([content], { type: 'text/tab-separated-values;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "modelo_dds_criados_sheets.txt";
    link.click();
  };

  const downloadSignaturesExcelCSV = () => {
    const headers = ['ID_DDS_ou_Data', 'Turno', 'Letra', 'Nome_Colaborador', 'Matricula', 'Data_Hora_Assinatura', 'Humor'];
    const row1 = ['DDS-101', 'Turno 1', 'A', 'Carlos Eduardo Lima', '88412', '10/05/2024 07:15:00', 'Feliz'];
    const row2 = ['DDS-101', 'Turno 1', 'A', 'João Batista Ramos', '88530', '10/05/2024 07:18:22', 'Normal'];
    const row3 = ['10/05/2024', 'Turno 2', 'B', 'Marcos Paulo Silva', '89100', '10/05/2024 15:20:10', 'Feliz'];

    const content = "\uFEFF" + [headers.join(';'), row1.join(';'), row2.join(';'), row3.join(';')].join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "modelo_dds_assinaturas_excel.csv";
    link.click();
  };

  const downloadUnifiedExcelCSV = () => {
    const headers = ['Data', 'Turno', 'Letra', 'Tema_DDS', 'Descricao', 'Executante', 'Nome_Colaborador', 'Matricula', 'Data_Assinatura', 'Humor'];
    const row1 = ['10/05/2024', 'Turno 1', 'A', 'Uso Correto de EPIs', 'Procedimentos nas máquinas', 'Alessandro Sousa', 'Carlos Eduardo Lima', '88412', '10/05/2024 07:15', 'Feliz'];
    const row2 = ['10/05/2024', 'Turno 1', 'A', 'Uso Correto de EPIs', 'Procedimentos nas máquinas', 'Alessandro Sousa', 'João Batista Ramos', '88530', '10/05/2024 07:18', 'Normal'];
    const row3 = ['10/05/2024', 'Turno 2', 'B', 'Pontos de Prensamento', 'Checagem de travas', 'Carlos Oliveira', 'Marcos Paulo Silva', '89100', '10/05/2024 15:20', 'Feliz'];

    const content = "\uFEFF" + [headers.join(';'), row1.join(';'), row2.join(';'), row3.join(';')].join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "modelo_dds_unificado_excel.csv";
    link.click();
  };

  // Helper slug generator for safe composite user ids
  const slugify = (text: string) => {
    return text.toString().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
  };

  // PROCESS IMPORT
  const handleExecuteImport = async () => {
    setIsProcessing(true);
    setProgressPercent(5);
    setStatusMessage('Consultando sessões existentes no banco...');

    try {
      // 1. Fetch all registered users to map userIds where possible
      let userList = getLocalCachedUsers();
      if (userList.length === 0) {
        userList = await fetchUsersSafely();
      }
      const userMapByName = new Map<string, string>(); // lowercase name -> uid
      const userMapByEmail = new Map<string, string>();

      userList.forEach(u => {
        if (u.displayName) userMapByName.set(u.displayName.trim().toLowerCase(), u.uid);
        if (u.email) userMapByEmail.set(u.email.trim().toLowerCase(), u.uid);
      });

      // 2. Fetch existing DDS sessions
      const existingSessionsSnap = await getDocs(collection(db, 'dds_sessions'));
      // Key: "YYYY-MM-DD_Turno X_Grupo" -> sessionDocId
      const sessionMapByKey = new Map<string, { id: string; title: string; createdAt: Date }>();
      const sessionMapById = new Map<string, { id: string; title: string }>();

      existingSessionsSnap.docs.forEach(d => {
        const s = d.data();
        const dObj = safeToDate(s.createdAt);
        if (dObj && s.shift && s.group) {
          const dStr = getLocalDateStr(dObj);
          const k = `${dStr}_${s.shift}_${s.group}`;
          sessionMapByKey.set(k, { id: d.id, title: s.title, createdAt: dObj });
        }
        if (s.legacyId) {
          sessionMapById.set(s.legacyId, { id: d.id, title: s.title });
        }
        sessionMapById.set(d.id, { id: d.id, title: s.title });
      });

      let sessionsCreated = 0;
      let sessionsUpdated = 0;
      let sessionsSkipped = 0;
      let signaturesCreated = 0;
      let signaturesSkipped = 0;
      let errorsCount = 0;

      // -------------------------------------------------------------
      // MODE 1: SESSIONS IMPORT
      // -------------------------------------------------------------
      if (activeMode === 'sessions') {
        const validRows = parsedSessions.filter(r => r.errors.length === 0);
        const total = validRows.length;

        // Group rows in batches of 400
        let currentBatch = writeBatch(db);
        let batchCount = 0;

        for (let i = 0; i < total; i++) {
          const row = validRows[i];
          const dateObj = row.dateObj || new Date();
          const dStr = getLocalDateStr(dateObj);
          const sessionKey = `${dStr}_${row.shift}_${row.group}`;

          const existing = sessionMapByKey.get(sessionKey);
          let targetDocRef;

          if (existing) {
            // Update existing
            targetDocRef = doc(db, 'dds_sessions', existing.id);
            currentBatch.update(targetDocRef, {
              title: row.title,
              description: row.description,
              executor: row.executor,
              totalPrevisto: row.totalPrevisto,
              updatedAt: serverTimestamp(),
              importedAt: serverTimestamp()
            });
            sessionsUpdated++;
          } else {
            // Create new
            const newDocRef = doc(collection(db, 'dds_sessions'));
            const expiresAt = new Date(dateObj);
            expiresAt.setHours(expiresAt.getHours() + 24);

            currentBatch.set(newDocRef, {
              title: row.title,
              description: row.description,
              shift: row.shift,
              group: row.group,
              executor: row.executor,
              totalPrevisto: row.totalPrevisto,
              passcode: row.passcode || Math.floor(100000 + Math.random() * 900000).toString(),
              expiresAt: Timestamp.fromDate(expiresAt),
              createdAt: Timestamp.fromDate(dateObj),
              createdBy: auth.currentUser?.uid || 'importacao',
              importedAt: serverTimestamp(),
              legacyId: row.id || null
            });

            sessionMapByKey.set(sessionKey, { id: newDocRef.id, title: row.title, createdAt: dateObj });
            if (row.id) sessionMapById.set(row.id, { id: newDocRef.id, title: row.title });
            sessionsCreated++;
          }

          batchCount++;
          if (batchCount >= 400) {
            await currentBatch.commit();
            currentBatch = writeBatch(db);
            batchCount = 0;
            setProgressPercent(Math.round(10 + ((i + 1) / total) * 85));
            setStatusMessage(`Importando sessões: ${i + 1} de ${total}...`);
          }
        }

        if (batchCount > 0) {
          await currentBatch.commit();
        }
      }

      // -------------------------------------------------------------
      // MODE 2: SIGNATURES IMPORT
      // -------------------------------------------------------------
      else if (activeMode === 'signatures') {
        const validRows = parsedSignatures.filter(r => r.errors.length === 0);
        const total = validRows.length;

        let currentBatch = writeBatch(db);
        let batchCount = 0;

        for (let i = 0; i < total; i++) {
          const row = validRows[i];
          const dateObj = row.dateObj || new Date();
          const dStr = getLocalDateStr(dateObj);

          // 1. Locate session
          let matchedSession: { id: string; title: string } | undefined;

          if (row.sessionId && sessionMapById.has(row.sessionId)) {
            matchedSession = sessionMapById.get(row.sessionId);
          } else if (row.sessionKey && sessionMapByKey.has(row.sessionKey)) {
            matchedSession = sessionMapByKey.get(row.sessionKey);
          } else if (row.shift && row.group) {
            const k = `${dStr}_${row.shift}_${row.group}`;
            matchedSession = sessionMapByKey.get(k);
          }

          // If session not found, auto-create a historical session for it
          let sessionId = matchedSession?.id;
          let sessionTitle = matchedSession?.title || row.sessionTitle || `DDS ${dStr} - ${row.shift || 'Turno 1'}`;

          if (!sessionId) {
            const newSessionRef = doc(collection(db, 'dds_sessions'));
            const sShift = row.shift || 'Turno 1';
            const sGroup = row.group || 'A';
            const sExpiresAt = new Date(dateObj);
            sExpiresAt.setHours(sExpiresAt.getHours() + 24);

            await setDoc(newSessionRef, {
              title: sessionTitle,
              description: 'Sessão gerada automaticamente pela importação de histórico de presenças.',
              shift: sShift,
              group: sGroup,
              executor: 'Gestor Operacional',
              totalPrevisto: 9,
              passcode: Math.floor(100000 + Math.random() * 900000).toString(),
              expiresAt: Timestamp.fromDate(sExpiresAt),
              createdAt: Timestamp.fromDate(dateObj),
              createdBy: auth.currentUser?.uid || 'importacao',
              importedAt: serverTimestamp(),
              legacyId: row.sessionId || null
            });

            sessionId = newSessionRef.id;
            const k = `${dStr}_${sShift}_${sGroup}`;
            sessionMapByKey.set(k, { id: sessionId, title: sessionTitle, createdAt: dateObj });
            if (row.sessionId) sessionMapById.set(row.sessionId, { id: sessionId, title: sessionTitle });
            sessionsCreated++;
          }

          // 2. Identify user ID
          const cleanName = row.participantName.trim();
          const cleanLower = cleanName.toLowerCase();
          const mappedUid = userMapByName.get(cleanLower) || `legacy_${row.registration || slugify(cleanName)}`;

          // 3. Encrypt participant name
          const encName = await encryptValue(cleanName);

          // 4. Stable composite doc ID to avoid duplicates
          const signatureDocId = `${mappedUid}_${sessionId}`.replace(/[^a-zA-Z0-9_@.-]/g, '_').slice(0, 120);
          const sigDocRef = doc(db, 'dds_signatures', signatureDocId);

          currentBatch.set(sigDocRef, {
            sessionId: sessionId,
            sessionTitle: sessionTitle,
            userId: mappedUid,
            userName: encName,
            registration: row.registration || null,
            timestamp: Timestamp.fromDate(dateObj),
            mood: row.mood || 'happy',
            passcode: 'importado',
            importedAt: serverTimestamp()
          });

          signaturesCreated++;
          batchCount++;

          if (batchCount >= 400) {
            await currentBatch.commit();
            currentBatch = writeBatch(db);
            batchCount = 0;
            setProgressPercent(Math.round(10 + ((i + 1) / total) * 85));
            setStatusMessage(`Importando assinaturas: ${i + 1} de ${total}...`);
          }
        }

        if (batchCount > 0) {
          await currentBatch.commit();
        }
      }

      // -------------------------------------------------------------
      // MODE 3: UNIFIED IMPORT (DDS + SIGNATURE)
      // -------------------------------------------------------------
      else if (activeMode === 'unified') {
        const validRows = parsedUnified.filter(r => r.errors.length === 0);
        const total = validRows.length;

        // Group rows by DDS session first to batch session creations
        const sessionGroups = new Map<string, {
          dateObj: Date;
          shift: string;
          group: string;
          title: string;
          description: string;
          executor: string;
          totalPrevisto: number;
          signatures: ParsedUnifiedRow[];
        }>();

        validRows.forEach(r => {
          const dStr = getLocalDateStr(r.dateObj || new Date());
          const k = `${dStr}_${r.shift}_${r.group}`;
          if (!sessionGroups.has(k)) {
            sessionGroups.set(k, {
              dateObj: r.dateObj || new Date(),
              shift: r.shift,
              group: r.group,
              title: r.title,
              description: r.description,
              executor: r.executor,
              totalPrevisto: r.totalPrevisto,
              signatures: []
            });
          }
          sessionGroups.get(k)!.signatures.push(r);
        });

        // 1. Create or match sessions
        let currentBatch = writeBatch(db);
        let batchCount = 0;

        for (const [k, groupData] of sessionGroups.entries()) {
          let sessionId = sessionMapByKey.get(k)?.id;

          if (!sessionId) {
            const newDocRef = doc(collection(db, 'dds_sessions'));
            sessionId = newDocRef.id;
            const exp = new Date(groupData.dateObj);
            exp.setHours(exp.getHours() + 24);

            currentBatch.set(newDocRef, {
              title: groupData.title,
              description: groupData.description,
              shift: groupData.shift,
              group: groupData.group,
              executor: groupData.executor,
              totalPrevisto: groupData.totalPrevisto,
              passcode: Math.floor(100000 + Math.random() * 900000).toString(),
              expiresAt: Timestamp.fromDate(exp),
              createdAt: Timestamp.fromDate(groupData.dateObj),
              createdBy: auth.currentUser?.uid || 'importacao',
              importedAt: serverTimestamp()
            });

            sessionMapByKey.set(k, { id: sessionId, title: groupData.title, createdAt: groupData.dateObj });
            sessionsCreated++;
            batchCount++;
          }

          // 2. Add signatures
          for (const sig of groupData.signatures) {
            const cleanName = sig.participantName.trim();
            const cleanLower = cleanName.toLowerCase();
            const mappedUid = userMapByName.get(cleanLower) || `legacy_${sig.registration || slugify(cleanName)}`;
            const encName = await encryptValue(cleanName);

            const signatureDocId = `${mappedUid}_${sessionId}`.replace(/[^a-zA-Z0-9_@.-]/g, '_').slice(0, 120);
            const sigDocRef = doc(db, 'dds_signatures', signatureDocId);

            currentBatch.set(sigDocRef, {
              sessionId: sessionId,
              sessionTitle: groupData.title,
              userId: mappedUid,
              userName: encName,
              registration: sig.registration || null,
              timestamp: Timestamp.fromDate(sig.signatureDateObj || groupData.dateObj),
              mood: sig.mood || 'happy',
              passcode: 'importado',
              importedAt: serverTimestamp()
            });

            signaturesCreated++;
            batchCount++;

            if (batchCount >= 400) {
              await currentBatch.commit();
              currentBatch = writeBatch(db);
              batchCount = 0;
            }
          }
        }

        if (batchCount > 0) {
          await currentBatch.commit();
        }
      }

      setProgressPercent(100);
      setStatusMessage('Importação concluída com sucesso!');
      setImportSummary({
        sessionsCreated,
        sessionsUpdated,
        sessionsSkipped,
        signaturesCreated,
        signaturesSkipped,
        errorsCount
      });
      setIsCompleted(true);
      if (onSuccess) onSuccess();

    } catch (err: any) {
      console.error("Error during DDS Bulk Import:", err);
      setStatusMessage(`Erro durante a importação: ${err.message || 'Falha inesperada.'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-md"
      />

      {/* Modal Card */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="relative bg-white w-full max-w-5xl rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden flex flex-col z-10 my-auto max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 sm:p-8 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/10">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                  Carga Histórica
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white mt-0.5">
                Importação em Massa de DDS & Assinaturas
              </h2>
              <p className="text-xs text-slate-400 font-medium">
                Migre e sincronize sessões de DDS anteriores e assinaturas de presença
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer border border-slate-700/60"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8 overflow-y-auto flex-1 space-y-6">
          {!isCompleted ? (
            <>
              {/* Mode Switcher Tabs */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setActiveMode('sessions');
                    setInputText('');
                  }}
                  className={cn(
                    "p-4 rounded-2xl border-2 text-left transition-all cursor-pointer relative overflow-hidden flex flex-col gap-1",
                    activeMode === 'sessions'
                      ? "border-emerald-600 bg-emerald-50/50 shadow-md shadow-emerald-100/50"
                      : "border-slate-100 bg-slate-50/60 hover:border-slate-200"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
                      <ClipboardCheck className="w-4 h-4 text-emerald-600" />
                      1. DDS Criados (Temas)
                    </span>
                    {activeMode === 'sessions' && (
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                    Importa a tabela de DDS gerados com Data, Turno, Letra, Tema, Descrição e Executante.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveMode('signatures');
                    setInputText('');
                  }}
                  className={cn(
                    "p-4 rounded-2xl border-2 text-left transition-all cursor-pointer relative overflow-hidden flex flex-col gap-1",
                    activeMode === 'signatures'
                      ? "border-emerald-600 bg-emerald-50/50 shadow-md shadow-emerald-100/50"
                      : "border-slate-100 bg-slate-50/60 hover:border-slate-200"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
                      <Users className="w-4 h-4 text-emerald-600" />
                      2. DDS Assinados (Presenças)
                    </span>
                    {activeMode === 'signatures' && (
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                    Importa as assinaturas dos participantes vinculando por ID ou (Data + Turno + Letra).
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveMode('unified');
                    setInputText('');
                  }}
                  className={cn(
                    "p-4 rounded-2xl border-2 text-left transition-all cursor-pointer relative overflow-hidden flex flex-col gap-1",
                    activeMode === 'unified'
                      ? "border-emerald-600 bg-emerald-50/50 shadow-md shadow-emerald-100/50"
                      : "border-slate-100 bg-slate-50/60 hover:border-slate-200"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-emerald-600" />
                      3. Planilha Unificada
                    </span>
                    {activeMode === 'unified' && (
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                    Se você possui os dados de DDS e assinaturas na mesma linha da planilha.
                  </p>
                </button>
              </div>

              {/* Action Banner / Templates */}
              <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-700 shadow-sm">
                    <Download className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                      Modelos de Planilha Recomendados
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Baixe o arquivo de exemplo para preencher ou conferir a ordem das colunas
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
                  {activeMode === 'sessions' && (
                    <>
                      <button
                        type="button"
                        onClick={downloadSessionExcelCSV}
                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        Modelo Excel (.csv)
                      </button>
                      <button
                        type="button"
                        onClick={downloadSessionSheetsTSV}
                        className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Modelo Sheets (.txt)
                      </button>
                    </>
                  )}

                  {activeMode === 'signatures' && (
                    <button
                      type="button"
                      onClick={downloadSignaturesExcelCSV}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      Modelo Assinaturas (.csv)
                    </button>
                  )}

                  {activeMode === 'unified' && (
                    <button
                      type="button"
                      onClick={downloadUnifiedExcelCSV}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      Modelo Unificado (.csv)
                    </button>
                  )}
                </div>
              </div>

              {/* File Upload Zone + Paste / Text Area */}
              <div className="space-y-3">
                {/* Hidden File Input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.tsv,.txt"
                  onChange={handleFileInputChange}
                  className="hidden"
                />

                {/* Drag and drop / file selector box */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={cn(
                    "p-4 rounded-2xl border-2 border-dashed transition-all flex flex-col sm:flex-row items-center justify-between gap-4",
                    isDragging
                      ? "border-emerald-500 bg-emerald-50/80 scale-[1.01]"
                      : uploadedFileName
                      ? "border-emerald-300 bg-emerald-50/40"
                      : "border-slate-300 bg-white hover:border-emerald-400 hover:bg-slate-50/60"
                  )}
                >
                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors shadow-sm",
                      uploadedFileName ? "bg-emerald-600 text-white" : "bg-emerald-100 text-emerald-700"
                    )}>
                      {uploadedFileName ? <FileSpreadsheet className="w-5 h-5" /> : <FileUp className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-black text-slate-900 truncate">
                        {uploadedFileName ? (
                          <span className="flex items-center gap-1.5 text-emerald-800">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            {uploadedFileName}
                          </span>
                        ) : (
                          "Carregar Arquivo de Planilha (.xlsx, .xls, .csv, .txt)"
                        )}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {uploadedFileName
                          ? "Arquivo carregado com sucesso. Você pode revisar ou editar o texto abaixo."
                          : "Arraste e solte o arquivo aqui ou clique no botão ao lado"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
                    {uploadedFileName && (
                      <button
                        type="button"
                        onClick={() => {
                          setUploadedFileName(null);
                          setInputText('');
                        }}
                        className="px-3 py-2 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                        title="Remover arquivo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remover
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer"
                    >
                      <Upload className="w-4 h-4" />
                      {uploadedFileName ? "Trocar Arquivo" : "Carregar Arquivo"}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
                    <UploadCloud className="w-4 h-4 text-emerald-600" />
                    Ou Copie e Cole Diretamente os Dados (Excel / Google Sheets)
                  </label>
                  
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={hasHeaders}
                        onChange={e => setHasHeaders(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                      />
                      Primeira linha contém cabeçalhos
                    </label>

                    {inputText && (
                      <button
                        type="button"
                        onClick={() => {
                          setInputText('');
                          setUploadedFileName(null);
                        }}
                        className="text-rose-500 hover:text-rose-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Limpar
                      </button>
                    )}
                  </div>
                </div>

                <textarea
                  rows={5}
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  placeholder={
                    activeMode === 'sessions'
                      ? "Cole aqui as linhas da planilha de DDS Criados ou carregue o arquivo acima...\nExemplo com descrição vazia (opcional):\nID_DDS;Data;Turno;Letra;Tema_DDS;Descricao;Executante;Total_Previsto\nDDS-01;10/05/2024;Turno 1;A;Uso Correto de EPIs;;Carlos Silva;9"
                      : activeMode === 'signatures'
                      ? "Cole aqui as linhas da planilha de DDS Assinados ou carregue o arquivo acima...\nExemplo:\nID_DDS;Turno;Letra;Nome_Colaborador;Matricula;Data_Assinatura;Humor\nDDS-01;Turno 1;A;Carlos Eduardo Lima;88412;10/05/2024 07:15;Feliz"
                      : "Cole aqui as linhas da planilha Unificada de DDS ou carregue o arquivo acima...\nExemplo (descrição vazia aceita normalmente):\nData;Turno;Letra;Tema_DDS;Descricao;Executante;Colaborador;Matricula;DataAssinatura;Humor\n10/05/2024;Turno 1;A;Uso de EPIs;;Carlos Silva;João Batista;88530;10/05/2024 07:15;Feliz"
                  }
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all resize-y shadow-inner leading-relaxed"
                />
              </div>

              {/* Preview Table & Validation */}
              {inputText.trim().length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                        Prévia da Importação
                      </h4>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">
                        {currentTotalValid} Linhas Válidas
                      </span>
                      {currentTotalErrors > 0 && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800">
                          {currentTotalErrors} Erros Detectados
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Preview grid */}
                  <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-64 overflow-y-auto shadow-sm">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100/80 sticky top-0 text-[10px] font-black text-slate-600 uppercase tracking-wider border-b border-slate-200">
                        {activeMode === 'sessions' && (
                          <tr>
                            <th className="p-3">#</th>
                            <th className="p-3">Data</th>
                            <th className="p-3">Turno / Letra</th>
                            <th className="p-3">Tema do DDS</th>
                            <th className="p-3">Executante</th>
                            <th className="p-3 text-center">Previsto</th>
                            <th className="p-3 text-center">Status</th>
                          </tr>
                        )}
                        {activeMode === 'signatures' && (
                          <tr>
                            <th className="p-3">#</th>
                            <th className="p-3">Colaborador</th>
                            <th className="p-3">Matrícula</th>
                            <th className="p-3">Data/Hora</th>
                            <th className="p-3">Vínculo DDS</th>
                            <th className="p-3 text-center">Humor</th>
                            <th className="p-3 text-center">Status</th>
                          </tr>
                        )}
                        {activeMode === 'unified' && (
                          <tr>
                            <th className="p-3">#</th>
                            <th className="p-3">Data DDS</th>
                            <th className="p-3">Turno / Letra</th>
                            <th className="p-3">Tema</th>
                            <th className="p-3">Colaborador</th>
                            <th className="p-3">Matrícula</th>
                            <th className="p-3 text-center">Status</th>
                          </tr>
                        )}
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-700 bg-white">
                        {activeMode === 'sessions' &&
                          parsedSessions.slice(0, 15).map((row, idx) => (
                            <tr key={idx} className={row.errors.length > 0 ? "bg-rose-50/50" : "hover:bg-slate-50"}>
                              <td className="p-3 font-mono text-[10px] text-slate-400">{row.index}</td>
                              <td className="p-3 font-bold text-slate-900">
                                {row.dateObj ? formatDateBR(row.dateObj) : <span className="text-rose-500">{formatDateBR(row.dateStr) || row.dateStr}</span>}
                              </td>
                              <td className="p-3">
                                <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold mr-1">
                                  {row.shift}
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold">
                                  Letra {row.group}
                                </span>
                              </td>
                              <td className="p-3 max-w-xs">
                                <div className="font-bold text-slate-800 truncate">{row.title}</div>
                                {row.description ? (
                                  <div className="text-[10px] text-slate-500 truncate">{row.description}</div>
                                ) : (
                                  <div className="text-[10px] text-slate-400 italic">Sem descrição (opcional)</div>
                                )}
                              </td>
                              <td className="p-3 text-slate-600 truncate max-w-[120px]">{row.executor}</td>
                              <td className="p-3 text-center font-mono">{row.totalPrevisto}</td>
                              <td className="p-3 text-center">
                                {row.errors.length === 0 ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-600">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> OK
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-black text-rose-600" title={row.errors.join('; ')}>
                                    <AlertTriangle className="w-3.5 h-3.5" /> Erro
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}

                        {activeMode === 'signatures' &&
                          parsedSignatures.slice(0, 15).map((row, idx) => (
                            <tr key={idx} className={row.errors.length > 0 ? "bg-rose-50/50" : "hover:bg-slate-50"}>
                              <td className="p-3 font-mono text-[10px] text-slate-400">{row.index}</td>
                              <td className="p-3 font-bold text-slate-900">{row.participantName}</td>
                              <td className="p-3 font-mono text-slate-600">{row.registration || '-'}</td>
                              <td className="p-3 text-slate-600">
                                {row.dateObj ? formatDateBR(row.dateObj, true) : (formatDateBR(row.dateStr, true) || row.dateStr)}
                              </td>
                              <td className="p-3">
                                {row.sessionId ? (
                                  <span className="font-mono text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                                    ID: {row.sessionId}
                                  </span>
                                ) : row.shift && row.group ? (
                                  <span className="text-[10px] font-bold text-slate-600">
                                    {row.shift} / {row.group}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-400">Data</span>
                                )}
                              </td>
                              <td className="p-3 text-center capitalize text-[10px] font-bold">{row.mood || 'Feliz'}</td>
                              <td className="p-3 text-center">
                                {row.errors.length === 0 ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-600">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> OK
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-black text-rose-600" title={row.errors.join('; ')}>
                                    <AlertTriangle className="w-3.5 h-3.5" /> Erro
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}

                        {activeMode === 'unified' &&
                          parsedUnified.slice(0, 15).map((row, idx) => (
                            <tr key={idx} className={row.errors.length > 0 ? "bg-rose-50/50" : "hover:bg-slate-50"}>
                              <td className="p-3 font-mono text-[10px] text-slate-400">{row.index}</td>
                              <td className="p-3 font-bold text-slate-900">
                                {row.dateObj ? formatDateBR(row.dateObj) : (formatDateBR(row.dateStr) || row.dateStr)}
                              </td>
                              <td className="p-3">
                                <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold mr-1">
                                  {row.shift}
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold">
                                  {row.group}
                                </span>
                              </td>
                              <td className="p-3 max-w-[150px]">
                                <div className="font-bold text-slate-800 truncate">{row.title}</div>
                                {row.description ? (
                                  <div className="text-[10px] text-slate-500 truncate">{row.description}</div>
                                ) : (
                                  <div className="text-[10px] text-slate-400 italic">Sem descrição (opcional)</div>
                                )}
                              </td>
                              <td className="p-3 font-bold text-slate-900 truncate max-w-[140px]">{row.participantName}</td>
                              <td className="p-3 font-mono text-slate-600">{row.registration || '-'}</td>
                              <td className="p-3 text-center">
                                {row.errors.length === 0 ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-600">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> OK
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-black text-rose-600" title={row.errors.join('; ')}>
                                    <AlertTriangle className="w-3.5 h-3.5" /> Erro
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Progress & Processing Bar */}
              {isProcessing && (
                <div className="p-6 bg-slate-900 text-white rounded-2xl space-y-3 shadow-xl">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="flex items-center gap-2 text-emerald-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {statusMessage}
                    </span>
                    <span>{progressPercent}%</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden border border-slate-700">
                    <motion.div
                      className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Completed Success Screen */
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-6">
              <div className="w-20 h-20 bg-emerald-100 border-4 border-emerald-50 text-emerald-600 rounded-full flex items-center justify-center shadow-xl shadow-emerald-500/20">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                  Importação Finalizada com Sucesso!
                </h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto mt-1">
                  Os dados foram processados e integrados à base de dados do Diálogo Diário de Segurança.
                </p>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full max-w-2xl">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-[10px] font-black text-slate-400 uppercase">Sessões Criadas</span>
                  <p className="text-2xl font-black text-emerald-600 mt-1">{importSummary.sessionsCreated}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-[10px] font-black text-slate-400 uppercase">Sessões Atualizadas</span>
                  <p className="text-2xl font-black text-blue-600 mt-1">{importSummary.sessionsUpdated}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-[10px] font-black text-slate-400 uppercase">Assinaturas Registradas</span>
                  <p className="text-2xl font-black text-emerald-600 mt-1">{importSummary.signaturesCreated}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-[10px] font-black text-slate-400 uppercase">Total Integrado</span>
                  <p className="text-2xl font-black text-slate-900 mt-1">
                    {importSummary.sessionsCreated + importSummary.signaturesCreated}
                  </p>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsCompleted(false);
                    setInputText('');
                  }}
                  className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-all cursor-pointer"
                >
                  Importar Mais Dados
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
                >
                  Concluir e Fechar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!isCompleted && (
          <div className="p-6 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-6 py-3 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl font-bold text-xs transition-all cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleExecuteImport}
              disabled={isProcessing || currentTotalValid === 0}
              className={cn(
                "px-8 py-3.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg cursor-pointer",
                currentTotalValid > 0 && !isProcessing
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20 active:scale-95"
                  : "bg-slate-200 text-slate-400 shadow-none cursor-not-allowed"
              )}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processando Carga...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  Iniciar Importação ({currentTotalValid} Linhas)
                </>
              )}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};
