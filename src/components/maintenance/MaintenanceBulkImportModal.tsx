import React, { useState, useMemo, useRef } from 'react';
import { 
  collection, 
  writeBatch, 
  doc, 
  serverTimestamp,
  addDoc
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../hooks/useAuth';
import { MaintenanceEquipment, ProductionLine, WorkSector } from '../../types';
import { getLocalDateStrBR, formatLocalDateBR, safeToDate } from '../../lib/utils';
import * as XLSX from 'xlsx';
import { 
  FileSpreadsheet, 
  UploadCloud, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  Loader2, 
  Download, 
  Info, 
  Trash2, 
  Play, 
  HelpCircle,
  FileText,
  Search,
  Check,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface MaintenanceBulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  existingEquipments: MaintenanceEquipment[];
  existingLines: ProductionLine[];
  existingSectors: WorkSector[];
}

export interface ParsedIssueRow {
  index: number;
  raw: any;
  date: string; // YYYY-MM-DD
  sector: string;
  line: string;
  shift: string;
  teamLetter: string;
  equipmentTag: string;
  equipmentName: string;
  inspectionType: string;
  inspectionName: string;
  responsibleCenter: string;
  programmingType: string;
  status: string;
  sapNote: string;
  description: string;
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Standard defaults for dropdowns & fallbacks
const DEFAULT_INSPECTION_TYPES = ['Mecânica', 'Elétrica', 'Instrumentação', 'Preditiva', 'Lubrificação', 'Operacional', 'Segurança'];
const DEFAULT_RESPONSIBLE_CENTERS = ['PCM / Manutenção Mecânica', 'Oficina Elétrica', 'Equipe de Instrumentação', 'Automação & Redes', 'Serviços Gerais / Civil', 'Equipe Operacional'];
const DEFAULT_PROGRAMMING_TYPES = ['Parada Programada', 'Oportunidade de Operação', 'Manutenção Corretiva', 'Intervenção Emergencial', 'Inspeção Sistemática'];
const DEFAULT_STATUSES = ['Pendente', 'Em Andamento', 'Aguardando Peça', 'Concluído'];

export const MaintenanceBulkImportModal: React.FC<MaintenanceBulkImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  existingEquipments,
  existingLines,
  existingSectors
}) => {
  const { user, profile, isMaster } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Input modes: 'file' | 'paste'
  const [activeMode, setActiveMode] = useState<'file' | 'paste'>('file');
  const [pasteText, setPasteText] = useState('');
  const [fileName, setFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // Parsing & Rows
  const [parsedRows, setParsedRows] = useState<ParsedIssueRow[]>([]);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [previewFilter, setPreviewFilter] = useState<'all' | 'valid' | 'warning' | 'error'>('all');
  const [searchFilter, setSearchFilter] = useState('');

  // Execution state
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [importSummary, setImportSummary] = useState<{
    totalCreated: number;
    equipmentsCreated: number;
  } | null>(null);

  // Fast map of existing equipments by uppercase tag
  const equipmentMap = useMemo(() => {
    const map = new Map<string, MaintenanceEquipment>();
    existingEquipments.forEach(eq => {
      if (eq.tag) {
        map.set(eq.tag.trim().toUpperCase(), eq);
      }
    });
    return map;
  }, [existingEquipments]);

  // Convert Excel serial date, Date object or textual date (DD-MM-AAAA, DD/MM/AAAA, AAAA-MM-DD, etc.) to YYYY-MM-DD
  const normalizeDate = (val: any): string => {
    if (!val && val !== 0) return getLocalDateStrBR(new Date());

    const res = getLocalDateStrBR(val);
    if (res && /^\d{4}-\d{2}-\d{2}$/.test(res)) {
      return res;
    }

    return getLocalDateStrBR(new Date());
  };

  // Find column index or property name based on header variations
  const mapHeaders = (headers: string[]): Record<string, number> => {
    const mapping: Record<string, number> = {};

    headers.forEach((h, idx) => {
      const clean = h
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

      if (/^data|^date|^dt/.test(clean) && mapping['date'] === undefined) {
        mapping['date'] = idx;
      } else if (/^setor|^area|^setor\/area/.test(clean) && mapping['sector'] === undefined) {
        mapping['sector'] = idx;
      } else if (/^linha|^line|^local/.test(clean) && mapping['line'] === undefined) {
        mapping['line'] = idx;
      } else if (/^turno|^shift/.test(clean) && mapping['shift'] === undefined) {
        mapping['shift'] = idx;
      } else if (/^turma|^letra|^grupo|^team/.test(clean) && mapping['teamLetter'] === undefined) {
        mapping['teamLetter'] = idx;
      } else if (/^tag|^codigo|^cod|^identificador/.test(clean) && mapping['tag'] === undefined) {
        mapping['tag'] = idx;
      } else if (/^equipamento|^nome do equipamento|^maquina|^ativo/.test(clean) && mapping['equipment'] === undefined) {
        mapping['equipment'] = idx;
      } else if (/^tipo.*inspec|^disciplina|^especialidade/.test(clean) && mapping['inspectionType'] === undefined) {
        mapping['inspectionType'] = idx;
      } else if (/^anomalia|^nome.*inspec|^defeito|^falha|^problema|^item/.test(clean) && mapping['inspectionName'] === undefined) {
        mapping['inspectionName'] = idx;
      } else if (/^centro.*resp|^oficina|^area.*resp|^responsavel/.test(clean) && mapping['responsibleCenter'] === undefined) {
        mapping['responsibleCenter'] = idx;
      } else if (/^tipo.*prog|^programacao|^regime|^prioridade/.test(clean) && mapping['programmingType'] === undefined) {
        mapping['programmingType'] = idx;
      } else if (/^status|^situacao/.test(clean) && mapping['status'] === undefined) {
        mapping['status'] = idx;
      } else if (/^nota.*sap|^sap|^ordem|^nota/.test(clean) && mapping['sapNote'] === undefined) {
        mapping['sapNote'] = idx;
      } else if (/^descri|^observa|^acao|^detalhe|^comentario/.test(clean) && mapping['description'] === undefined) {
        mapping['description'] = idx;
      }
    });

    return mapping;
  };

  // Process raw 2D array of rows
  const processRawData = (rows: any[][]) => {
    if (!rows || rows.length === 0) {
      setParsedRows([]);
      return;
    }

    // Find header row (first non-empty row)
    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const row = rows[i];
      if (row && row.some(cell => typeof cell === 'string' && cell.trim().length > 0)) {
        headerRowIdx = i;
        break;
      }
    }

    if (headerRowIdx === -1) {
      setParsedRows([]);
      return;
    }

    const headerRow = rows[headerRowIdx].map(c => String(c || '').trim());
    const headerMap = mapHeaders(headerRow);

    const parsed: ParsedIssueRow[] = [];

    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;

      // Skip completely empty rows
      const hasContent = row.some(c => c !== undefined && c !== null && String(c).trim() !== '');
      if (!hasContent) continue;

      const getVal = (colKey: string): string => {
        const idx = headerMap[colKey];
        if (idx !== undefined && row[idx] !== undefined && row[idx] !== null) {
          return String(row[idx]).trim();
        }
        return '';
      };

      const rawTag = getVal('tag').toUpperCase();
      let rawEquipment = getVal('equipment');
      let rawSector = getVal('sector');
      let rawLine = getVal('line');
      const rawDate = normalizeDate(getVal('date'));
      let rawShift = getVal('shift');
      let rawTeam = getVal('teamLetter').toUpperCase();
      let rawInspType = getVal('inspectionType');
      let rawInspName = getVal('inspectionName');
      let rawCenter = getVal('responsibleCenter');
      let rawProgType = getVal('programmingType');
      let rawStatus = getVal('status');
      const rawSap = getVal('sapNote');
      let rawDesc = getVal('description');

      const errors: string[] = [];
      const warnings: string[] = [];

      // Check if tag exists in database to fill in sector/line/equipmentName automatically
      const existingEq = rawTag ? equipmentMap.get(rawTag) : undefined;
      if (existingEq) {
        if (!rawEquipment) rawEquipment = existingEq.name;
        if (!rawSector) rawSector = existingEq.sector;
        if (!rawLine) rawLine = existingEq.line;
      }

      // Mandatory validation: We need at least an Equipment/TAG or an Anomaly/Description
      if (!rawTag && !rawEquipment) {
        warnings.push('Sem TAG ou Nome de Equipamento especificado.');
      }

      if (!rawInspName && !rawDesc) {
        errors.push('Obrigatório informar a Anomalia ou Descrição da pendência.');
      }

      // Fallbacks
      if (!rawShift) rawShift = '1º Turno';
      if (!rawTeam) rawTeam = '-';
      if (!rawInspType) rawInspType = 'Mecânica';
      if (!rawCenter) rawCenter = 'PCM / Manutenção Mecânica';
      if (!rawProgType) rawProgType = 'Parada Programada';
      if (!rawStatus) rawStatus = 'Pendente';
      if (!rawSector) rawSector = 'Geral';
      if (!rawLine) rawLine = 'Geral';
      if (!rawEquipment) rawEquipment = rawTag ? `Equipamento ${rawTag}` : 'Equipamento não especificado';
      if (!rawInspName) rawInspName = rawDesc ? rawDesc.slice(0, 45) : 'Pendência de Manutenção';
      if (!rawDesc) rawDesc = rawInspName;

      // Status standardizer
      const lowerStatus = rawStatus.toLowerCase();
      if (lowerStatus.includes('conclu') || lowerStatus.includes('fech') || lowerStatus.includes('resolv')) {
        rawStatus = 'Concluído';
      } else if (lowerStatus.includes('anda') || lowerStatus.includes('execu')) {
        rawStatus = 'Em Andamento';
      } else if (lowerStatus.includes('peça') || lowerStatus.includes('peca') || lowerStatus.includes('aguard')) {
        rawStatus = 'Aguardando Peça';
      } else {
        rawStatus = 'Pendente';
      }

      parsed.push({
        index: r + 1,
        raw: row,
        date: rawDate,
        sector: rawSector,
        line: rawLine,
        shift: rawShift,
        teamLetter: rawTeam,
        equipmentTag: rawTag,
        equipmentName: rawEquipment,
        inspectionType: rawInspType,
        inspectionName: rawInspName,
        responsibleCenter: rawCenter,
        programmingType: rawProgType,
        status: rawStatus,
        sapNote: rawSap,
        description: rawDesc,
        isValid: errors.length === 0,
        errors,
        warnings
      });
    }

    setParsedRows(parsed);
  };

  // Read uploaded Excel or CSV file
  const handleFileUpload = (file: File) => {
    setFileName(file.name);
    setIsProcessingFile(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        processRawData(jsonRows);
      } catch (err) {
        console.error("Erro ao ler arquivo:", err);
        alert("Erro ao ler o arquivo. Certifique-se de enviar uma planilha Excel (.xlsx, .xls) ou CSV válido.");
      } finally {
        setIsProcessingFile(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Parse text pasted from clipboard / Excel
  const handleProcessPastedText = () => {
    if (!pasteText.trim()) return;
    setIsProcessingFile(true);

    try {
      const lines = pasteText.split(/\r?\n/).filter(line => line.trim().length > 0);
      if (lines.length === 0) return;

      // Determine delimiter (tab, semicolon, or comma)
      const firstLine = lines[0];
      let delimiter = '\t';
      if (firstLine.includes('\t')) delimiter = '\t';
      else if (firstLine.includes(';')) delimiter = ';';
      else if (firstLine.includes(',')) delimiter = ',';

      const rows: any[][] = lines.map(line => line.split(delimiter).map(cell => cell.replace(/^["']|["']$/g, '').trim()));
      processRawData(rows);
    } catch (err) {
      console.error("Erro ao processar texto colado:", err);
      alert("Erro ao processar os dados. Verifique a formatação.");
    } finally {
      setIsProcessingFile(false);
    }
  };

  // Download Excel template
  const handleDownloadExcelTemplate = () => {
    const headers = [
      'DATA',
      'SETOR',
      'LINHA',
      'TURNO',
      'TURMA',
      'TAG',
      'EQUIPAMENTO',
      'TIPO_INSPECAO',
      'ANOMALIA',
      'CENTRO_RESPONSAVEL',
      'TIPO_PROGRAMACAO',
      'STATUS',
      'NOTA_SAP',
      'DESCRICAO'
    ];

    const todayBR = formatLocalDateBR(new Date());
    const todayISO = getLocalDateStrBR(new Date());

    const exampleRows = [
      [
        todayBR,
        'Laminação',
        'Linha 1',
        '1º Turno',
        'A',
        'MOT-101',
        'Motor Principal da Laminação',
        'Mecânica',
        'Vibração Excessiva no Rolamento Dianteiro',
        'PCM / Manutenção Mecânica',
        'Parada Programada',
        'Pendente',
        '10045231',
        'Ruído anormal e vibração acima da tolerância detectados no mancal. Necessário alinhamento e troca de rolamento.'
      ],
      [
        todayBR,
        'Trefila',
        'Trefila 02',
        '2º Turno',
        'B',
        'BOM-04',
        'Bomba de Água do Capstan',
        'Mecânica',
        'Vazamento no Selo Mecânico',
        'PCM / Manutenção Mecânica',
        'Oportunidade de Operação',
        'Pendente',
        '10045232',
        'Gotejamento contínuo de fluido refrigerante na base da bomba.'
      ],
      [
        todayISO,
        'Galvanização',
        'Linha Contínua',
        '3º Turno',
        'C',
        'PAI-02',
        'Painel de Acionamento dos Rolos',
        'Elétrica',
        'Superaquecimento de Contator K3',
        'Oficina Elétrica',
        'Intervenção Emergencial',
        'Aguardando Peça',
        '10045233',
        'Aquecimento de 72°C detectado com termovisão. Contator com sinais de desgaste nos contatos de força.'
      ]
    ];

    const instructionsData = [
      ['INSTRUÇÕES DE PREENCHIMENTO - IMPORTAÇÃO DE PENDÊNCIAS'],
      [''],
      ['Coluna', 'Obrigatória?', 'Descrição', 'Exemplos / Valores Aceitos'],
      ['DATA', 'Não', 'Data de registro da ocorrência (Aceita DD/MM/AAAA, DD-MM-AAAA ou AAAA-MM-DD)', `${todayBR} ou ${todayISO} (Se vazio, assume hoje)`],
      ['SETOR', 'Não', 'Área ou setor produtivo', 'Laminação, Trefila, Galvanização, Manutenção, Utilidades'],
      ['LINHA', 'Não', 'Linha de produção ou equipamento geral', 'Linha 1, Linha 2, Trefila 03, Geral'],
      ['TURNO', 'Não', 'Turno de trabalho', '1º Turno, 2º Turno, 3º Turno, Central'],
      ['TURMA', 'Não', 'Letra da equipe / turma operacional', 'A, B, C, D, E'],
      ['TAG', 'Recomendado', 'Código da TAG do equipamento', 'MOT-101, BOM-04, RED-02, PONTE-01'],
      ['EQUIPAMENTO', 'Recomendado', 'Nome do equipamento ou máquina', 'Motor Principal, Bomba de Vácuo, Redutor'],
      ['TIPO_INSPECAO', 'Não', 'Disciplina da inspeção / especialidade', 'Mecânica, Elétrica, Instrumentação, Preditiva, Lubrificação, Operacional, Segurança'],
      ['ANOMALIA', 'Sim*', 'Título resumido da anomalia / problema', 'Vibração excessiva, Vazamento de óleo, Ruído anormal, Desgaste de correia'],
      ['CENTRO_RESPONSAVEL', 'Não', 'Oficina ou equipe encarregada', 'PCM / Manutenção Mecânica, Oficina Elétrica, Instrumentação, Automação'],
      ['TIPO_PROGRAMACAO', 'Não', 'Regime de intervenção necessário', 'Parada Programada, Oportunidade de Operação, Manutenção Corretiva, Intervenção Emergencial'],
      ['STATUS', 'Não', 'Situação atual da pendência', 'Pendente, Em Andamento, Aguardando Peça, Concluído (Padrão: Pendente)'],
      ['NOTA_SAP', 'Não', 'Número da nota ou ordem de manutenção SAP', '10045231, OM-44590'],
      ['DESCRICAO', 'Sim*', 'Descrição detalhada e recomendação técnica', 'Descreva o problema encontrado, localização e serviço a realizar.']
    ];

    const wb = XLSX.utils.book_new();

    // Sheet 1: Template data
    const wsData = XLSX.utils.aoa_to_sheet([headers, ...exampleRows]);
    // Set auto width
    wsData['!cols'] = headers.map(() => ({ wch: 24 }));
    XLSX.utils.book_append_sheet(wb, wsData, 'Pendências');

    // Sheet 2: Instructions
    const wsInst = XLSX.utils.aoa_to_sheet(instructionsData);
    wsInst['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 45 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(wb, wsInst, 'Instruções');

    XLSX.writeFile(wb, 'modelo_importacao_pendencias_manutencao.xlsx');
  };

  // Download CSV template
  const handleDownloadCsvTemplate = () => {
    const headers = 'DATA;SETOR;LINHA;TURNO;TURMA;TAG;EQUIPAMENTO;TIPO_INSPECAO;ANOMALIA;CENTRO_RESPONSAVEL;TIPO_PROGRAMACAO;STATUS;NOTA_SAP;DESCRICAO\n';
    const todayBR = formatLocalDateBR(new Date());
    const row1 = `${todayBR};Laminação;Linha 1;1º Turno;A;MOT-101;Motor Principal;Mecânica;Vibração Excessiva no Rolamento;PCM / Manutenção Mecânica;Parada Programada;Pendente;10045231;Ruído anormal detectado durante rota operacional.\n`;
    const row2 = `${todayBR};Trefila;Trefila 02;2º Turno;B;BOM-04;Bomba de Água;Mecânica;Vazamento no Selo Mecânico;PCM / Manutenção Mecânica;Oportunidade de Operação;Pendente;10045232;Gotejamento contínuo na base da bomba.\n`;

    const blob = new Blob(['\uFEFF' + headers + row1 + row2], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'modelo_importacao_pendencias_manutencao.csv';
    link.click();
  };

  // Execution: Batch insert into Firestore
  const handleExecuteImport = async () => {
    if (!isMaster) {
      alert("Acesso restrito: Apenas o perfil Master pode realizar a importação em massa de pendências.");
      return;
    }

    const validRows = parsedRows.filter(r => r.isValid);
    if (validRows.length === 0) {
      alert("Nenhuma linha válida para importar.");
      return;
    }

    setIsImporting(true);
    setImportProgress({ current: 0, total: validRows.length });

    try {
      let createdCount = 0;
      let newEquipmentsCount = 0;

      // Local caches to avoid duplicate equipment additions during this bulk import
      const knownTags = new Set<string>();
      existingEquipments.forEach(eq => {
        if (eq.tag) knownTags.add(eq.tag.trim().toUpperCase());
      });

      const knownLines = new Set<string>();
      existingLines.forEach(l => {
        knownLines.add(`${(l.sector || '').toUpperCase()}::${(l.name || '').toUpperCase()}`);
      });

      const knownSectors = new Set<string>();
      existingSectors.forEach(s => {
        knownSectors.add(s.name.toUpperCase());
      });

      // Split in batches of 350 to respect Firestore batch limit (500)
      const CHUNK_SIZE = 350;
      for (let i = 0; i < validRows.length; i += CHUNK_SIZE) {
        const chunk = validRows.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);

        for (const row of chunk) {
          const issueRef = doc(collection(db, 'maintenance_issues'));
          const issueData = {
            date: row.date,
            sector: row.sector,
            line: row.line,
            shift: row.shift,
            teamLetter: row.teamLetter,
            equipmentTag: row.equipmentTag,
            equipmentName: row.equipmentName,
            inspectionType: row.inspectionType,
            inspectionName: row.inspectionName,
            responsibleCenter: row.responsibleCenter,
            programmingType: row.programmingType,
            status: row.status,
            sapNote: row.sapNote,
            description: row.description,
            attachments: [],
            origin: 'Importação em Massa',
            createdBy: user?.uid || 'import',
            createdByName: profile?.displayName || user?.email || 'Importação em Massa',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          };

          batch.set(issueRef, issueData);
          createdCount++;

          // Auto register new TAG in maintenance_equipments if not existing
          if (row.equipmentTag && !knownTags.has(row.equipmentTag)) {
            const eqRef = doc(collection(db, 'maintenance_equipments'));
            batch.set(eqRef, {
              tag: row.equipmentTag,
              name: row.equipmentName || 'Equipamento',
              sector: row.sector || 'Geral',
              line: row.line || 'Geral',
              active: true,
              createdAt: serverTimestamp()
            });
            knownTags.add(row.equipmentTag);
            newEquipmentsCount++;
          }
        }

        await batch.commit();
        setImportProgress({ current: Math.min(i + CHUNK_SIZE, validRows.length), total: validRows.length });
      }

      setImportSummary({
        totalCreated: createdCount,
        equipmentsCreated: newEquipmentsCount
      });

      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      console.error("Erro ao executar importação em massa:", err);
      alert("Ocorreu um erro durante a importação. Verifique a conexão com a base de dados.");
    } finally {
      setIsImporting(false);
    }
  };

  // Filtered rows for preview
  const filteredPreviewRows = useMemo(() => {
    return parsedRows.filter(r => {
      if (previewFilter === 'valid' && !r.isValid) return false;
      if (previewFilter === 'warning' && r.warnings.length === 0) return false;
      if (previewFilter === 'error' && r.isValid) return false;

      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase();
        return (
          r.equipmentTag.toLowerCase().includes(q) ||
          r.equipmentName.toLowerCase().includes(q) ||
          r.inspectionName.toLowerCase().includes(q) ||
          r.sector.toLowerCase().includes(q) ||
          r.line.toLowerCase().includes(q) ||
          r.sapNote.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [parsedRows, previewFilter, searchFilter]);

  const validCount = useMemo(() => parsedRows.filter(r => r.isValid).length, [parsedRows]);
  const warningCount = useMemo(() => parsedRows.filter(r => r.warnings.length > 0).length, [parsedRows]);
  const errorCount = useMemo(() => parsedRows.filter(r => !r.isValid).length, [parsedRows]);

  if (!isOpen || !isMaster) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-5xl my-auto overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Modal Header */}
        <div className="p-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-600/20 text-emerald-400 rounded-2xl border border-emerald-500/20">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight">Importação em Massa de Pendências</h2>
              <p className="text-xs text-slate-400 font-medium">
                Carregue planilhas Excel (.xlsx) ou CSV para cadastrar múltiplas pendências de manutenção de uma vez.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isImporting}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Success Summary View */}
          {importSummary ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-12 px-6 text-center space-y-6 max-w-md mx-auto"
            >
              <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-slate-900">Importação Concluída com Sucesso!</h3>
                <p className="text-sm text-slate-500 font-medium">
                  Todas as pendências foram cadastradas e já estão visíveis no Módulo de Manutenção.
                </p>
              </div>

              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 grid grid-cols-2 gap-4 text-left">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Pendências Criadas</span>
                  <span className="text-2xl font-black text-emerald-600">{importSummary.totalCreated}</span>
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Novas TAGs Cadastradas</span>
                  <span className="text-2xl font-black text-blue-600">{importSummary.equipmentsCreated}</span>
                </div>
              </div>

              <div className="pt-4 flex gap-3 justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setImportSummary(null);
                    setParsedRows([]);
                    setFileName('');
                    setPasteText('');
                  }}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all"
                >
                  Importar Outra Planilha
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/20 transition-all"
                >
                  Fechar e Ver Pendências
                </button>
              </div>
            </motion.div>
          ) : (
            <>
              {/* Top Action & Template Download Cards */}
              <div className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-emerald-950 uppercase tracking-wider">
                      Modelo Oficial de Importação
                    </span>
                  </div>
                  <p className="text-xs text-emerald-800 font-medium max-w-xl">
                    Para garantir que todas as colunas correspondam perfeitamente, utilize o nosso modelo pré-formatado. Aceita datas nos formatos <strong>DD/MM/AAAA</strong>, <strong>DD-MM-AAAA</strong> ou <strong>AAAA-MM-DD</strong>.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleDownloadExcelTemplate}
                    className="px-3.5 py-2 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Baixar Excel (.xlsx)</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadCsvTemplate}
                    className="px-3 py-2 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-600" />
                    <span>CSV (.csv)</span>
                  </button>
                </div>
              </div>

              {/* Input Mode Selector */}
              <div className="flex border-b border-slate-200 gap-6">
                <button
                  type="button"
                  onClick={() => setActiveMode('file')}
                  className={`pb-3 text-xs font-bold uppercase tracking-wider transition-all relative ${
                    activeMode === 'file' ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  1. Enviar Arquivo (Excel / CSV)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMode('paste')}
                  className={`pb-3 text-xs font-bold uppercase tracking-wider transition-all relative ${
                    activeMode === 'paste' ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  2. Colar Linhas da Planilha (Ctrl+V)
                </button>
              </div>

              {/* Mode 1: File Upload */}
              {activeMode === 'file' && (
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      handleFileUpload(e.dataTransfer.files[0]);
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all ${
                    isDragging 
                      ? 'border-emerald-500 bg-emerald-50/60' 
                      : 'border-slate-200 hover:border-emerald-400 hover:bg-slate-50'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileUpload(e.target.files[0]);
                      }
                    }}
                  />

                  <div className="max-w-md mx-auto space-y-3">
                    <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto border border-emerald-100 shadow-sm">
                      <UploadCloud className="w-7 h-7" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">
                        {fileName ? (
                          <span className="text-emerald-700">Arquivo selecionado: {fileName}</span>
                        ) : (
                          'Arraste e solte o arquivo aqui ou clique para selecionar'
                        )}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Formatos aceitos: Microsoft Excel (.xlsx, .xls) ou Texto delimitado (.csv)
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Mode 2: Paste from clipboard */}
              {activeMode === 'paste' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-semibold">Cole as linhas copiadas do Excel ou Google Planilhas:</span>
                    <span className="text-[11px] text-slate-400">Inclua o cabeçalho das colunas na 1ª linha</span>
                  </div>
                  <textarea
                    rows={6}
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder={`DATA\tSETOR\tLINHA\tTURNO\tTURMA\tTAG\tEQUIPAMENTO\tANOMALIA\tDESCRICAO\n2026-09-03\tLaminação\tLinha 1\t1º Turno\tA\tMOT-101\tMotor Principal\tVibração no Rolamento\tNecessário troca`}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <div className="flex justify-end gap-2">
                    {pasteText && (
                      <button
                        type="button"
                        onClick={() => setPasteText('')}
                        className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-600 font-bold"
                      >
                        Limpar
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={!pasteText.trim() || isProcessingFile}
                      onClick={handleProcessPastedText}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {isProcessingFile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                      <span>Processar Linhas</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Parsed Rows Preview */}
              {parsedRows.length > 0 && (
                <div className="space-y-4 pt-2">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                        Pré-visualização dos Dados ({parsedRows.length} linhas)
                      </h4>

                      {/* Status Pills */}
                      <div className="flex items-center gap-1.5 text-xs font-bold">
                        <button
                          type="button"
                          onClick={() => setPreviewFilter('all')}
                          className={`px-2.5 py-1 rounded-lg transition-all ${
                            previewFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          Todas ({parsedRows.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewFilter('valid')}
                          className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                            previewFilter === 'valid' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          }`}
                        >
                          <Check className="w-3 h-3" />
                          Válidas ({validCount})
                        </button>
                        {warningCount > 0 && (
                          <button
                            type="button"
                            onClick={() => setPreviewFilter('warning')}
                            className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                              previewFilter === 'warning' ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                            }`}
                          >
                            <AlertTriangle className="w-3 h-3" />
                            Avisos ({warningCount})
                          </button>
                        )}
                        {errorCount > 0 && (
                          <button
                            type="button"
                            onClick={() => setPreviewFilter('error')}
                            className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                              previewFilter === 'error' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                            }`}
                          >
                            <AlertCircle className="w-3 h-3" />
                            Inválidas ({errorCount})
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="relative w-full sm:w-64">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Filtrar pré-visualização..."
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Table */}
                  <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className="max-h-72 overflow-y-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                          <tr>
                            <th className="py-2.5 px-3 w-12 text-center">#</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3">Data</th>
                            <th className="py-2.5 px-3">TAG</th>
                            <th className="py-2.5 px-3">Equipamento</th>
                            <th className="py-2.5 px-3">Anomalia / Descrição</th>
                            <th className="py-2.5 px-3">Setor / Linha</th>
                            <th className="py-2.5 px-3">Centro Resp.</th>
                            <th className="py-2.5 px-3">Programação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredPreviewRows.length === 0 ? (
                            <tr>
                              <td colSpan={9} className="py-8 text-center text-slate-400 font-medium">
                                Nenhuma linha corresponde aos filtros aplicados.
                              </td>
                            </tr>
                          ) : (
                            filteredPreviewRows.map((r, idx) => (
                              <tr
                                key={`row-preview-${r.index}-${idx}`}
                                className={`transition-colors ${
                                  !r.isValid ? 'bg-rose-50/50' : r.warnings.length > 0 ? 'bg-amber-50/30' : 'hover:bg-slate-50'
                                }`}
                              >
                                <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px]">
                                  {r.index}
                                </td>
                                <td className="py-2 px-3 whitespace-nowrap">
                                  {r.isValid ? (
                                    r.warnings.length > 0 ? (
                                      <span
                                        className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded"
                                        title={r.warnings.join('; ')}
                                      >
                                        <AlertTriangle className="w-3 h-3" />
                                        Aviso
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                                        <Check className="w-3 h-3" />
                                        OK
                                      </span>
                                    )
                                  ) : (
                                    <span
                                      className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded"
                                      title={r.errors.join('; ')}
                                    >
                                      <AlertCircle className="w-3 h-3" />
                                      Erro
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3 whitespace-nowrap font-mono text-slate-600">
                                  {formatLocalDateBR(r.date) || r.date}
                                </td>
                                <td className="py-2 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                                  {r.equipmentTag || <span className="text-slate-400 italic">S/ TAG</span>}
                                </td>
                                <td className="py-2 px-3 font-semibold text-slate-800 max-w-[160px] truncate" title={r.equipmentName}>
                                  {r.equipmentName}
                                </td>
                                <td className="py-2 px-3 text-slate-700 max-w-[220px] truncate" title={r.description}>
                                  <span className="font-bold text-slate-900">{r.inspectionName}</span>
                                  {r.description && r.description !== r.inspectionName && (
                                    <span className="text-slate-400 block text-[11px] truncate">{r.description}</span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-slate-600 whitespace-nowrap">
                                  <span className="font-semibold text-slate-700">{r.sector}</span>
                                  <span className="text-slate-400 text-[10px] block">{r.line}</span>
                                </td>
                                <td className="py-2 px-3 text-slate-600 whitespace-nowrap text-[11px]">
                                  {r.responsibleCenter}
                                </td>
                                <td className="py-2 px-3 text-slate-600 whitespace-nowrap text-[11px]">
                                  {r.programmingType}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        {!importSummary && (
          <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
            <div className="text-xs text-slate-500 font-medium text-center sm:text-left">
              {parsedRows.length > 0 ? (
                <span>
                  Pronto para importar <strong className="text-slate-900">{validCount}</strong> de {parsedRows.length} pendências válidas.
                </span>
              ) : (
                <span>Selecione uma planilha ou cole os dados para iniciar.</span>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={isImporting}
                className="px-5 py-2.5 text-slate-600 hover:bg-slate-200/60 font-bold text-xs rounded-xl transition-all disabled:opacity-50"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={isImporting || validCount === 0}
                onClick={handleExecuteImport}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Importando ({importProgress.current}/{importProgress.total})...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirmar Importação ({validCount})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};
