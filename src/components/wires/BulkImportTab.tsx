import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  addDoc, 
  updateDoc,
  doc,
  serverTimestamp,
  getDocs
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { WireBatch, WireCoil, WireSupplier, WireStorageBay, ProductionLine } from '../../types';
import { 
  FileSpreadsheet, 
  Loader2, 
  CheckCircle2, 
  AlertTriangle, 
  UploadCloud, 
  Trash2, 
  Play, 
  Plus,
  Database,
  Clipboard,
  FileText,
  ShieldCheck,
  Zap,
  Download,
  Filter,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Layers,
  Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../../hooks/useAuth';
import { cn } from '../../lib/utils';

interface BulkImportTabProps {
  suppliers: WireSupplier[];
  storageBays: WireStorageBay[];
  coils?: WireCoil[];
  batches?: WireBatch[];
  lines?: ProductionLine[];
}

export type RowActionType = 'NEW' | 'UPDATE_CONSUMED' | 'UPDATE_DATA' | 'UNCHANGED' | 'ERROR';

export interface ParsedRow {
  index: number;
  raw: string[];
  id?: string;
  operator: string;
  date: string; // YYYY-MM-DD format (Data Entrada)
  consumedDate?: string; // YYYY-MM-DD format (Data Consumo)
  lineName?: string; // Linha de Produção
  consumedByGroup?: string; // Turma / Letra
  shift?: string; // Turno
  equipment?: string; // Máquina / Equipamento
  supplierName: string;
  status: 'received' | 'consumed';
  coilNumber: string;
  diameter: number;
  weight: number;
  nfNumber: string;
  storageBayName: string;
  errors: string[];
  warnings: string[];
  action: RowActionType;
  actionReason?: string;
  existingDbId?: string;
}

export const BulkImportTab: React.FC<BulkImportTabProps> = ({ 
  suppliers, 
  storageBays,
  coils = [],
  batches = [],
  lines = []
}) => {
  const { profile } = useAuth();
  
  // -------------------------------------------------------------
  // 1. STATE FOR EXPORT / TEMPLATE DOWNLOAD
  // -------------------------------------------------------------
  const [showExportSection, setShowExportSection] = useState(false);
  const [exportFilterStatus, setExportFilterStatus] = useState<'all' | 'in_stock' | 'consumed'>('in_stock');
  const [exportFilterSupplier, setExportFilterSupplier] = useState<string>('all');
  const [exportFilterBay, setExportFilterBay] = useState<string>('all');
  const [exportFilterDiameter, setExportFilterDiameter] = useState<string>('all');
  const [exportSearchTerm, setExportSearchTerm] = useState<string>('');
  const [copiedExportSuccess, setCopiedExportSuccess] = useState(false);

  // Map batches by ID for rapid NF / Date resolution
  const batchesMap = useMemo(() => {
    const map = new Map<string, WireBatch>();
    batches.forEach(b => map.set(b.id, b));
    return map;
  }, [batches]);

  // Map suppliers by ID
  const suppliersMap = useMemo(() => {
    const map = new Map<string, WireSupplier>();
    suppliers.forEach(s => map.set(s.id, s));
    return map;
  }, [suppliers]);

  // Distinct diameters available in stock
  const distinctDiameters = useMemo(() => {
    const set = new Set<number>();
    coils.forEach(c => {
      if (c.diameter) set.add(c.diameter);
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [coils]);

  // Filtered coils for Export
  const filteredExportCoils = useMemo(() => {
    return coils.filter(c => {
      // Status filter
      if (exportFilterStatus === 'in_stock') {
        if (c.status === 'consumed') return false;
      } else if (exportFilterStatus === 'consumed') {
        if (c.status !== 'consumed') return false;
      }

      // Supplier filter
      if (exportFilterSupplier !== 'all' && c.supplierId !== exportFilterSupplier) {
        return false;
      }

      // Storage Bay filter
      if (exportFilterBay !== 'all') {
        const bayName = (c.storageBayName || '').toUpperCase().trim();
        if (bayName !== exportFilterBay.toUpperCase().trim()) return false;
      }

      // Diameter filter
      if (exportFilterDiameter !== 'all') {
        const d = parseFloat(exportFilterDiameter);
        if (Math.abs(c.diameter - d) > 0.001) return false;
      }

      // Search term
      if (exportSearchTerm.trim()) {
        const term = exportSearchTerm.toLowerCase().trim();
        const batch = batchesMap.get(c.batchId);
        const matchCoil = (c.coilNumber || '').toLowerCase().includes(term);
        const matchNf = (batch?.nfNumber || '').toLowerCase().includes(term);
        if (!matchCoil && !matchNf) return false;
      }

      return true;
    });
  }, [coils, exportFilterStatus, exportFilterSupplier, exportFilterBay, exportFilterDiameter, exportSearchTerm, batchesMap]);

  // Format a single coil to standard import/export columns
  const formatCoilToRowData = (c: WireCoil, idx: number) => {
    const batch = batchesMap.get(c.batchId);
    const supplier = suppliersMap.get(c.supplierId) || (batch ? { name: batch.supplierName } : undefined);
    
    // Entry date
    let entryDateFormatted = '';
    if (c.receivedAt) {
      if (typeof c.receivedAt === 'string') {
        entryDateFormatted = c.receivedAt.split('T')[0].split('-').reverse().join('/');
      } else if (c.receivedAt.toDate) {
        const d = c.receivedAt.toDate();
        entryDateFormatted = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      }
    } else if (batch?.date) {
      entryDateFormatted = batch.date.split('-').reverse().join('/');
    }

    // Consumed date
    let consumedDateFormatted = '';
    if (c.consumedAt) {
      if (typeof c.consumedAt === 'string') {
        consumedDateFormatted = c.consumedAt.split('T')[0].split('-').reverse().join('/');
      } else if (c.consumedAt.toDate) {
        const d = c.consumedAt.toDate();
        consumedDateFormatted = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      }
    }

    const id = String(idx + 1);
    const operator = (c as any).consumedBy || batch?.responsibleName || 'Operador';
    const lineName = (c as any).lineName || '';
    const consumedByGroup = (c as any).consumedByGroup || '';
    const shift = (c as any).consumedShift || '';
    const equipment = (c as any).consumedIn || '';
    const supplierName = supplier?.name || batch?.supplierName || 'Geral';
    const status = c.status === 'consumed' ? 'Consumido' : 'Disponível';
    const coilNumber = c.coilNumber || '';
    const diameter = c.diameter ? c.diameter.toFixed(2).replace('.', ',') : '2,30';
    const weight = c.weight ? String(c.weight) : '1000';
    const nfNumber = batch?.nfNumber || '';
    const storageBay = c.storageBayName || batch?.storageBayName || 'GERAL';

    return [
      id,
      operator,
      entryDateFormatted,
      consumedDateFormatted,
      lineName,
      consumedByGroup,
      shift,
      equipment,
      supplierName,
      status,
      coilNumber,
      diameter,
      weight,
      nfNumber,
      storageBay
    ];
  };

  const headerColumns = [
    'ID', 
    'Operador', 
    'Data Entrada', 
    'Data Consumo', 
    'Linha', 
    'Turma / Letra', 
    'Turno', 
    'Máquina', 
    'Fornecedor', 
    'Status', 
    'Código da Bobina', 
    'Bitola (mm)', 
    'Peso (kg)', 
    'Nota Fiscal', 
    'Local Baia'
  ];

  // Export to CSV (semicolon separated with BOM for Excel)
  const handleExportCSV = () => {
    const rows = filteredExportCoils.map((c, idx) => formatCoilToRowData(c, idx));
    const csvContent = "\uFEFF" + [headerColumns.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const filterLabel = exportFilterStatus === 'in_stock' ? 'estoque' : (exportFilterStatus === 'consumed' ? 'consumidos' : 'todos');
    link.setAttribute("download", `arames_${filterLabel}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export to TSV (tab separated for Sheets/Excel copy)
  const handleExportTSV = () => {
    const rows = filteredExportCoils.map((c, idx) => formatCoilToRowData(c, idx));
    const tsvContent = "\uFEFF" + [headerColumns.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
    const blob = new Blob([tsvContent], { type: 'text/tab-separated-values;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const filterLabel = exportFilterStatus === 'in_stock' ? 'estoque' : (exportFilterStatus === 'consumed' ? 'consumidos' : 'todos');
    link.setAttribute("download", `arames_${filterLabel}_${new Date().toISOString().split('T')[0]}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Copy rows directly to Clipboard (TSV format)
  const handleCopyRowsToClipboard = async () => {
    const rows = filteredExportCoils.map((c, idx) => formatCoilToRowData(c, idx));
    const tsvContent = [headerColumns.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
    try {
      await navigator.clipboard.writeText(tsvContent);
      setCopiedExportSuccess(true);
      setTimeout(() => setCopiedExportSuccess(false), 3000);
    } catch {
      alert('Não foi possível copiar automaticamente para a área de transferência.');
    }
  };

  // Blank template download (Empty template for Excel)
  const downloadTemplateCSV = () => {
    const row1 = ['1', 'Alessandro Sousa Santos', '04/12/2025', '', '', '', '', '', 'Morlan', 'Disponível', '0002273002394374 M837804', '2,18', '1060', '773778-1', '1 C2'];
    const row2 = ['2', 'Carlos Oliveira', '04/12/2025', '10/12/2025', 'Linha 01', 'Turma A', 'Turno 1', 'Desbobinador 02', 'Belgo Bekaert', 'Consumido', '0002280020245484', '2,30', '1004', '773776-1', '1 E1'];
    
    const csvContent = "\uFEFF" + [headerColumns.join(';'), row1.join(';'), row2.join(';')].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "modelo_carga_arame_excel.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadTemplateTSV = () => {
    const row1 = ['1', 'Alessandro Sousa Santos', '04/12/2025', '', '', '', '', '', 'Morlan', 'Disponível', '0002273002394374 M837804', '2,18', '1060', '773778-1', '1 C2'];
    const row2 = ['2', 'Carlos Oliveira', '04/12/2025', '10/12/2025', 'Linha 01', 'Turma A', 'Turno 1', 'Desbobinador 02', 'Belgo Bekaert', 'Consumido', '0002280020245484', '2,30', '1004', '773776-1', '1 E1'];
    
    const tsvContent = "\uFEFF" + [headerColumns.join('\t'), row1.join('\t'), row2.join('\t')].join('\n');
    const blob = new Blob([tsvContent], { type: 'text/tab-separated-values;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "modelo_carga_arame_sheets.txt");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // -------------------------------------------------------------
  // 2. STATE FOR BULK IMPORT & DIFF PARSER
  // -------------------------------------------------------------
  const [inputText, setInputText] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [previewFilter, setPreviewFilter] = useState<'ALL' | 'NEW' | 'UPDATE' | 'UNCHANGED' | 'ERROR'>('ALL');
  const [delimiter, setDelimiter] = useState<'tsv' | 'csv_comma' | 'csv_semicolon' | 'auto'>('auto');
  const [hasHeaders, setHasHeaders] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [stepStatus, setStepStatus] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [isSuccess, setIsSuccess] = useState(false);
  const [updateExistingBayDetails, setUpdateExistingBayDetails] = useState(true);

  const [importSummary, setImportSummary] = useState({
    batchesCreated: 0,
    coilsCreated: 0,
    coilsUpdatedToConsumed: 0,
    coilsUpdatedData: 0,
    coilsSkippedUnchanged: 0,
    duplicatesInSheetMerged: 0,
    suppliersCreated: 0,
    baysCreated: 0,
    totalWeight: 0,
    quotaSavingsCount: 0
  });

  // Map of existing coils by normalized coilNumber
  const existingCoilsKeyMap = useMemo(() => {
    const map = new Map<string, WireCoil>();
    coils.forEach(c => {
      if (c.coilNumber) {
        const k = c.coilNumber.toLowerCase().trim().replace(/\s+/g, ' ');
        map.set(k, c);
      }
    });
    return map;
  }, [coils]);

  // Column mapping states
  const [colMapping, setColMapping] = useState<{ [key: string]: number }>({
    id: -1,
    operator: -1,
    date: -1,
    consumedDate: -1,
    lineName: -1,
    consumedByGroup: -1,
    shift: -1,
    equipment: -1,
    supplier: -1,
    status: -1,
    coilNumber: -1,
    diameter: -1,
    weight: -1,
    nfNumber: -1,
    storageBay: -1,
  });

  // Automatic parsing and diff calculation
  useEffect(() => {
    if (!inputText.trim()) {
      setParsedRows([]);
      return;
    }

    // 1. Detect delimiter
    let activeDelim = '\t';
    if (delimiter === 'auto') {
      const tabsCount = (inputText.match(/\t/g) || []).length;
      const semicolonsCount = (inputText.match(/;/g) || []).length;
      const commasCount = (inputText.match(/,/g) || []).length;

      if (tabsCount >= semicolonsCount && tabsCount >= commasCount) {
        activeDelim = '\t';
      } else if (semicolonsCount >= commasCount) {
        activeDelim = ';';
      } else {
        activeDelim = ',';
      }
    } else {
      activeDelim = delimiter === 'tsv' ? '\t' : (delimiter === 'csv_semicolon' ? ';' : ',');
    }

    const linesRaw = inputText.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (linesRaw.length === 0) {
      setParsedRows([]);
      return;
    }

    // Helper to parse line respecting quotes
    const parseLine = (line: string, delim: string): string[] => {
      if (delim === '\t') return line.split('\t');
      
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' || char === "'") {
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

    const firstLineRaw = parseLine(linesRaw[0], activeDelim);
    
    // 2. Map headers
    const mapping = {
      id: -1,
      operator: -1,
      date: -1,
      consumedDate: -1,
      lineName: -1,
      consumedByGroup: -1,
      shift: -1,
      equipment: -1,
      supplier: -1,
      status: -1,
      coilNumber: -1,
      diameter: -1,
      weight: -1,
      nfNumber: -1,
      storageBay: -1,
    };

    const headers = firstLineRaw.map(h => h.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
    
    if (hasHeaders) {
      headers.forEach((hdr, idx) => {
        if (hdr === 'id') mapping.id = idx;
        else if (hdr.includes('operador') || hdr.includes('responsavel') || hdr.includes('usuario') || hdr === 'quem') mapping.operator = idx;
        else if (hdr.includes('data consumo') || hdr.includes('data_consumo') || hdr.includes('data_uso') || hdr.includes('data uso')) mapping.consumedDate = idx;
        else if (hdr.includes('data') || hdr.includes('date') || hdr.includes('recebido') || hdr.includes('entrada')) mapping.date = idx;
        else if (hdr.includes('linha') || hdr.includes('line')) mapping.lineName = idx;
        else if (hdr.includes('turma') || hdr.includes('letra') || hdr.includes('grupo')) mapping.consumedByGroup = idx;
        else if (hdr.includes('turno') || hdr.includes('shift')) mapping.shift = idx;
        else if (hdr.includes('maquina') || hdr.includes('equipamento') || hdr.includes('maqu')) mapping.equipment = idx;
        else if (hdr.includes('fornecedor') || hdr.includes('supplier')) mapping.supplier = idx;
        else if (hdr === 'status') mapping.status = idx;
        else if (hdr.includes('codigo') || hdr.includes('code') || hdr.includes('bobina') || hdr.includes('coil') || hdr.includes('etiqueta')) mapping.coilNumber = idx;
        else if (hdr.includes('bitola') || hdr.includes('diametro') || hdr.includes('gauge')) mapping.diameter = idx;
        else if (hdr.includes('peso') || hdr.includes('weight') || hdr.includes('massa')) mapping.weight = idx;
        else if (hdr.includes('nota') || hdr.includes('nf') || hdr.includes('fiscal') || hdr.includes('invoice')) mapping.nfNumber = idx;
        else if (hdr.includes('baia') || hdr.includes('local') || hdr.includes('box') || hdr.includes('armazen')) mapping.storageBay = idx;
      });
    }

    if (!hasHeaders || Object.values(mapping).every(v => v === -1)) {
      mapping.id = 0;
      mapping.operator = 1 < firstLineRaw.length ? 1 : -1;
      mapping.date = 2 < firstLineRaw.length ? 2 : -1;
      mapping.consumedDate = 3 < firstLineRaw.length ? 3 : -1;
      mapping.lineName = 4 < firstLineRaw.length ? 4 : -1;
      mapping.consumedByGroup = 5 < firstLineRaw.length ? 5 : -1;
      mapping.shift = 6 < firstLineRaw.length ? 6 : -1;
      mapping.equipment = 7 < firstLineRaw.length ? 7 : -1;
      mapping.supplier = 8 < firstLineRaw.length ? 8 : -1;
      mapping.status = 9 < firstLineRaw.length ? 9 : -1;
      mapping.coilNumber = 10 < firstLineRaw.length ? 10 : -1;
      mapping.diameter = 11 < firstLineRaw.length ? 11 : -1;
      mapping.weight = 12 < firstLineRaw.length ? 12 : -1;
      mapping.nfNumber = 13 < firstLineRaw.length ? 13 : -1;
      mapping.storageBay = 14 < firstLineRaw.length ? 14 : -1;
    }

    setColMapping(mapping);

    // Date Normalization helper (DD/MM/YYYY to YYYY-MM-DD)
    const normalizeDateStr = (rawDateStr: string): string => {
      if (!rawDateStr) return '';
      const dmyMatch = rawDateStr.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
      const ymdMatch = rawDateStr.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
      
      if (dmyMatch) {
        const day = dmyMatch[1].padStart(2, '0');
        const month = dmyMatch[2].padStart(2, '0');
        const year = dmyMatch[3];
        return `${year}-${month}-${day}`;
      } else if (ymdMatch) {
        const year = ymdMatch[1];
        const month = ymdMatch[2].padStart(2, '0');
        const day = ymdMatch[3].padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
      return '';
    };

    // 3. Process data lines and calculate Diff in real-time
    const startIdx = hasHeaders ? 1 : 0;
    const processed: ParsedRow[] = [];

    for (let i = startIdx; i < linesRaw.length; i++) {
      const line = linesRaw[i];
      if (!line.trim()) continue;

      const rawRow = parseLine(line, activeDelim);
      
      const getField = (columnIdx: number, defaultValue: string = ''): string => {
        if (columnIdx === -1 || columnIdx >= rawRow.length) return defaultValue;
        return rawRow[columnIdx].trim();
      };

      const errors: string[] = [];
      const warnings: string[] = [];

      const id = getField(mapping.id);
      const operator = getField(mapping.operator, 'Administrador');
      const rawDate = getField(mapping.date);
      const rawConsumedDate = getField(mapping.consumedDate);
      const lineName = getField(mapping.lineName);
      const consumedByGroup = getField(mapping.consumedByGroup);
      const shift = getField(mapping.shift);
      const equipment = getField(mapping.equipment);
      const coilNumber = getField(mapping.coilNumber);
      let supplierName = getField(mapping.supplier, 'Geral');

      if (coilNumber && (coilNumber.toUpperCase().startsWith('GD') || /GD\d{10,20}/i.test(coilNumber))) {
        supplierName = 'Morlan';
      }

      const rawStatus = getField(mapping.status);
      const rawDiameter = getField(mapping.diameter);
      const rawWeight = getField(mapping.weight);
      const nfNumber = getField(mapping.nfNumber);
      const rawStorageBay = getField(mapping.storageBay);

      // Entry Date Normalization
      let normDate = normalizeDateStr(rawDate);
      if (!normDate) {
        normDate = new Date().toISOString().split('T')[0];
        if (rawDate) {
          warnings.push(`Formato de data de entrada '${rawDate}' inválido. Usando data de hoje.`);
        } else {
          warnings.push('Data de entrada ausente. Usando data de hoje.');
        }
      }

      // Consumed Date Normalization
      let normConsumedDate = normalizeDateStr(rawConsumedDate);
      if (!normConsumedDate && rawConsumedDate) {
        warnings.push(`Formato da data de consumo '${rawConsumedDate}' não reconhecido.`);
      }

      // Status translation
      let status: 'received' | 'consumed' = 'received';
      if (rawStatus) {
        const normalizedStatus = rawStatus.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (normalizedStatus.includes('consumido') || normalizedStatus.includes('consumo') || normalizedStatus.includes('consumed')) {
          status = 'consumed';
        }
      }

      // Diameter float conversion
      let diameter = 2.30;
      if (rawDiameter) {
        const cleanDiameter = rawDiameter.replace(',', '.');
        const parsedDiameter = parseFloat(cleanDiameter);
        if (isNaN(parsedDiameter)) {
          errors.push(`Bitola '${rawDiameter}' inválida (deve ser um número).`);
        } else {
          diameter = parsedDiameter;
        }
      } else {
        errors.push('Bitola ausente.');
      }

      // Weight float conversion
      let weight = 0;
      if (rawWeight) {
        const cleanWeight = rawWeight.replace(/[^\d\.,]/g, '').replace(',', '.');
        const parsedWeight = parseFloat(cleanWeight);
        if (isNaN(parsedWeight) || parsedWeight <= 0) {
          errors.push(`Peso '${rawWeight}' inválido (deve ser maior que zero).`);
        } else {
          weight = parsedWeight;
        }
      } else {
        errors.push('Peso ausente.');
      }

      // Coil Number checks
      if (!coilNumber) {
        errors.push('Código da bobina ausente.');
      }

      // NF check (needed for new batches)
      if (!nfNumber && errors.length === 0) {
        warnings.push('Sem número de NF. Será gerado lote avulso.');
      }

      // Storage Bay extraction
      let storageBayName = 'GERAL';
      if (rawStorageBay) {
        const cleanedBay = rawStorageBay.replace(/^\d+\s+/, '').trim().toUpperCase();
        if (cleanedBay) {
          storageBayName = cleanedBay;
        }
      } else {
        warnings.push('Local da baia ausente. Alocando na baia GERAL.');
      }

      const cleanCoilKey = coilNumber ? coilNumber.toLowerCase().trim().replace(/\s+/g, ' ') : '';
      const existingCoil = cleanCoilKey ? existingCoilsKeyMap.get(cleanCoilKey) : undefined;

      // Smart Diff Action Determination
      let action: RowActionType = 'NEW';
      let actionReason = 'Nova bobina. Será cadastrada.';
      let existingDbId: string | undefined = undefined;

      if (errors.length > 0) {
        action = 'ERROR';
        actionReason = errors.join('; ');
      } else if (!existingCoil) {
        action = 'NEW';
        actionReason = 'Código não encontrado no banco. Será criado novo cadastro.';
      } else {
        // Coil exists in DB
        existingDbId = existingCoil.id;
        const dbStatus = existingCoil.status || 'received';
        const isDbConsumed = dbStatus === 'consumed';
        const isIncomingConsumed = status === 'consumed';

        if (!isDbConsumed && isIncomingConsumed) {
          // Status changed from received to consumed
          action = 'UPDATE_CONSUMED';
          actionReason = 'Existente no banco como disponível. Será atualizada para CONSUMIDA.';
        } else if (isDbConsumed && !isIncomingConsumed) {
          // Status changed from consumed to received
          action = 'UPDATE_DATA';
          actionReason = 'Existente no banco como consumida. Será revertida para DISPONÍVEL.';
        } else {
          // Check other attributes (Storage Bay change, Line change, etc.)
          const dbBay = (existingCoil.storageBayName || '').toUpperCase().trim();
          const incomingBay = storageBayName.toUpperCase().trim();
          const bayChanged = incomingBay && dbBay && incomingBay !== dbBay;

          if (bayChanged && updateExistingBayDetails) {
            action = 'UPDATE_DATA';
            actionReason = `Mudança de baia detectada: ${dbBay} ➔ ${incomingBay}.`;
          } else {
            action = 'UNCHANGED';
            actionReason = 'Dados idênticos aos do banco. Será PULADA para poupar cota do Firebase.';
          }
        }
      }

      processed.push({
        index: i,
        raw: rawRow,
        id,
        operator,
        date: normDate,
        consumedDate: normConsumedDate || undefined,
        lineName: lineName || undefined,
        consumedByGroup: consumedByGroup || undefined,
        shift: shift || undefined,
        equipment: equipment || undefined,
        supplierName,
        status,
        coilNumber: coilNumber.trim().replace(/\s+/g, ' '),
        diameter,
        weight,
        nfNumber: nfNumber || 'S/NF',
        storageBayName,
        errors,
        warnings,
        action,
        actionReason,
        existingDbId
      });
    }

    setParsedRows(processed);
  }, [inputText, delimiter, hasHeaders, existingCoilsKeyMap, updateExistingBayDetails]);

  // Helper stats for Smart Import
  const stats = useMemo(() => {
    const total = parsedRows.length;
    const newCount = parsedRows.filter(r => r.action === 'NEW').length;
    const updateConsumedCount = parsedRows.filter(r => r.action === 'UPDATE_CONSUMED').length;
    const updateDataCount = parsedRows.filter(r => r.action === 'UPDATE_DATA').length;
    const unchangedCount = parsedRows.filter(r => r.action === 'UNCHANGED').length;
    const errorCount = parsedRows.filter(r => r.action === 'ERROR').length;
    const validCount = total - errorCount;
    const writesCount = newCount + updateConsumedCount + updateDataCount;

    const totalWeight = parsedRows.filter(r => r.action !== 'ERROR').reduce((sum, r) => sum + r.weight, 0);

    return {
      total,
      newCount,
      updateConsumedCount,
      updateDataCount,
      totalUpdatesCount: updateConsumedCount + updateDataCount,
      unchangedCount,
      errorCount,
      validCount,
      writesCount,
      totalWeight
    };
  }, [parsedRows]);

  // Filtered rows for the preview table
  const displayedRows = useMemo(() => {
    if (previewFilter === 'ALL') return parsedRows;
    if (previewFilter === 'NEW') return parsedRows.filter(r => r.action === 'NEW');
    if (previewFilter === 'UPDATE') return parsedRows.filter(r => r.action === 'UPDATE_CONSUMED' || r.action === 'UPDATE_DATA');
    if (previewFilter === 'UNCHANGED') return parsedRows.filter(r => r.action === 'UNCHANGED');
    if (previewFilter === 'ERROR') return parsedRows.filter(r => r.action === 'ERROR');
    return parsedRows;
  }, [parsedRows, previewFilter]);

  // Handle spreadsheet file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setInputText(text);
    };
    reader.readAsText(file, 'UTF-8');
  };

  // Execution flow (Smart Sync - writes ONLY new and updated coils)
  const handleImportExec = async () => {
    const rowsToExecute = parsedRows.filter(r => r.action === 'NEW' || r.action === 'UPDATE_CONSUMED' || r.action === 'UPDATE_DATA');
    if (rowsToExecute.length === 0) {
      alert('Não há bobinas novas ou com alterações para gravar. Todas as bobinas são idênticas às já salvas!');
      return;
    }

    setIsProcessing(true);
    setProgressPercent(5);
    
    try {
      setStepStatus('Consultando fornecedores e baias...');
      setProgressPercent(15);

      const liveSuppliers = [...suppliers];
      const liveBays = [...storageBays];

      const supplierNameToIdMap: { [name: string]: string } = {};
      liveSuppliers.forEach(s => {
        supplierNameToIdMap[s.name.toLowerCase().trim()] = s.id;
      });

      const uniqueSuppliersToCreate = Array.from(new Set(rowsToExecute.map(r => r.supplierName.trim()))) as string[];
      let suppliersAddedCount = 0;
      for (const sName of uniqueSuppliersToCreate) {
        const key = sName.toLowerCase().trim();
        if (!supplierNameToIdMap[key]) {
          const docRef = await addDoc(collection(db, 'wire_suppliers'), {
            name: sName,
            active: true
          });
          supplierNameToIdMap[key] = docRef.id;
          suppliersAddedCount++;
        }
      }

      setStepStatus('Verificando baias de armazenamento...');
      setProgressPercent(25);

      const bayNameToIdMap: { [name: string]: string } = {};
      liveBays.forEach(b => {
        bayNameToIdMap[b.name.toUpperCase().trim()] = b.id;
      });

      const uniqueBaysToCreate = Array.from(new Set(rowsToExecute.map(r => r.storageBayName.trim()))) as string[];
      let baysAddedCount = 0;
      for (const bName of uniqueBaysToCreate) {
        const key = bName.toUpperCase().trim();
        if (!bayNameToIdMap[key]) {
          const docRef = await addDoc(collection(db, 'wire_storage_bays'), {
            name: bName.toUpperCase(),
            active: true
          });
          bayNameToIdMap[key] = docRef.id;
          baysAddedCount++;
        }
      }

      // 1. Process Updates (Only for changed coils)
      const updateRows = rowsToExecute.filter(r => (r.action === 'UPDATE_CONSUMED' || r.action === 'UPDATE_DATA') && r.existingDbId);
      let updatedToConsumedCount = 0;
      let updatedDataCount = 0;

      if (updateRows.length > 0) {
        setStepStatus(`Atualizando ${updateRows.length} bobinas alteradas no Firestore...`);
        setProgressPercent(35);

        // Process in chunks of 50
        const chunkSize = 50;
        for (let i = 0; i < updateRows.length; i += chunkSize) {
          const chunk = updateRows.slice(i, i + chunkSize);
          await Promise.all(
            chunk.map(async (row) => {
              if (!row.existingDbId) return;
              const targetConsumedDate = row.consumedDate || row.date;
              const isConsumed = row.status === 'consumed';
              const bayId = bayNameToIdMap[row.storageBayName.toUpperCase().trim()] || '';

              if (row.action === 'UPDATE_CONSUMED') {
                await updateDoc(doc(db, 'wire_coils', row.existingDbId), {
                  status: 'consumed',
                  consumedAt: `${targetConsumedDate}T16:00:00Z`,
                  consumedBy: row.operator || 'Importação Histórica',
                  consumedByGroup: row.consumedByGroup || null,
                  lineName: row.lineName || null,
                  consumedShift: row.shift || null,
                  consumedIn: row.equipment || null,
                  storageBayName: row.storageBayName,
                  storageBayId: bayId,
                  updatedAt: serverTimestamp()
                });
                updatedToConsumedCount++;
              } else if (row.action === 'UPDATE_DATA') {
                await updateDoc(doc(db, 'wire_coils', row.existingDbId), {
                  status: row.status,
                  storageBayName: row.storageBayName,
                  storageBayId: bayId,
                  weight: row.weight,
                  diameter: row.diameter,
                  updatedAt: serverTimestamp()
                });
                updatedDataCount++;
              }
            })
          );
          const chunkProgress = 35 + Math.floor(((i + chunk.length) / updateRows.length) * 25);
          setProgressPercent(chunkProgress);
        }
      }

      // 2. Process NEW Coils (Group into Batches by NF)
      const newRows = rowsToExecute.filter(r => r.action === 'NEW');
      let batchesAddedCount = 0;
      let coilsAddedCount = 0;

      if (newRows.length > 0) {
        setStepStatus(`Agrupando ${newRows.length} novas bobinas em lotes (NFs)...`);
        setProgressPercent(60);

        interface BatchGroup {
          nfNumber: string;
          supplierName: string;
          date: string;
          responsibleName: string;
          storageBayName: string;
          coils: ParsedRow[];
        }

        const groups: { [key: string]: BatchGroup } = {};
        newRows.forEach(row => {
          const groupKey = `${row.nfNumber}-${row.supplierName.toLowerCase()}-${row.date}`;
          if (!groups[groupKey]) {
            groups[groupKey] = {
              nfNumber: row.nfNumber,
              supplierName: row.supplierName,
              date: row.date,
              responsibleName: row.operator || 'Sistema',
              storageBayName: row.storageBayName,
              coils: []
            };
          }
          groups[groupKey].coils.push(row);
        });

        const totalGroups = Object.keys(groups).length;
        let currentStepNum = 0;

        for (const groupKey of Object.keys(groups)) {
          currentStepNum++;
          const group = groups[groupKey];
          setStepStatus(`Criando lote ${currentStepNum} de ${totalGroups || 1} (NF: ${group.nfNumber})...`);

          const supplierId = supplierNameToIdMap[group.supplierName.toLowerCase().trim()] || '';
          const storageBayId = bayNameToIdMap[group.storageBayName.toUpperCase().trim()] || '';
          const batchTotalWeight = group.coils.reduce((sum, c) => sum + c.weight, 0);

          const batchRef = await addDoc(collection(db, 'wire_batches'), {
            nfNumber: group.nfNumber,
            supplierId,
            supplierName: group.supplierName,
            date: group.date,
            responsibleId: profile?.uid || 'imported',
            responsibleName: group.responsibleName,
            totalWeight: batchTotalWeight,
            coilsCount: group.coils.length,
            status: 'closed',
            storageBayId: storageBayId,
            storageBayName: group.storageBayName,
            createdAt: serverTimestamp()
          });

          batchesAddedCount++;

          await Promise.all(
            group.coils.map(async coil => {
              const coilStorageBayId = bayNameToIdMap[coil.storageBayName.toUpperCase().trim()] || '';
              const targetConsumedDate = coil.consumedDate || coil.date;
              const isConsumed = coil.status === 'consumed';

              await addDoc(collection(db, 'wire_coils'), {
                coilNumber: coil.coilNumber,
                batchId: batchRef.id,
                supplierId,
                diameter: coil.diameter,
                weight: coil.weight,
                status: coil.status,
                storageBayId: coilStorageBayId,
                storageBayName: coil.storageBayName,
                receivedAt: `${coil.date}T12:00:00Z`,
                consumedAt: isConsumed ? `${targetConsumedDate}T16:00:00Z` : null,
                consumedBy: isConsumed ? (coil.operator || 'Importação Histórica') : null,
                consumedByGroup: isConsumed ? (coil.consumedByGroup || null) : null,
                lineName: isConsumed ? (coil.lineName || null) : null,
                consumedShift: isConsumed ? (coil.shift || null) : null,
                consumedIn: isConsumed ? (coil.equipment || null) : null
              });
              coilsAddedCount++;
            })
          );

          const deltaProgress = 60 + Math.floor((currentStepNum / (totalGroups || 1)) * 38);
          setProgressPercent(deltaProgress);
        }
      }

      setStepStatus('Sincronização inteligente concluída com sucesso!');
      setProgressPercent(100);

      setImportSummary({
        batchesCreated: batchesAddedCount,
        coilsCreated: coilsAddedCount,
        coilsUpdatedToConsumed: updatedToConsumedCount,
        coilsUpdatedData: updatedDataCount,
        coilsSkippedUnchanged: stats.unchangedCount,
        duplicatesInSheetMerged: 0,
        suppliersCreated: suppliersAddedCount,
        baysCreated: baysAddedCount,
        totalWeight: rowsToExecute.reduce((acc, r) => acc + r.weight, 0),
        quotaSavingsCount: stats.unchangedCount
      });

      setIsSuccess(true);
      setInputText('');
    } catch (err) {
      console.error('Error during bulk load:', err);
      alert('Houve um erro de comunicação ou permissão ao salvar no Firestore. Verifique a internet e tente novamente.');
    } finally {
      setIsProcessing(false);
    }
  };

  const clearAll = () => {
    if (confirm('Deseja limpar o texto colado e os dados pré-processados?')) {
      setInputText('');
      setParsedRows([]);
    }
  };

  return (
    <div className="space-y-8 pb-12" id="bulk-import-container">
      
      {/* ------------------------------------------------------------- */}
      {/* TOP SECTION: SMART EXPORT TO EXCEL / MODEL GENERATOR          */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6 sm:p-8 rounded-[2.5rem] shadow-xl border border-slate-700/50 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0 shadow-inner">
              <Download className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black tracking-tight text-white">
                  Exportar Estoque & Histórico para o Excel
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Modelo Oficial
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium max-w-3xl leading-relaxed">
                Exporte as bobinas em estoque com filtros personalizados para o Excel, altere o status para <strong>Consumido</strong> ou adicione novas bobinas na planilha, e reimporte para atualizar apenas as modificações sem reenviar tudo.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setShowExportSection(prev => !prev)}
              className="flex items-center gap-2 px-5 py-3 bg-white/10 hover:bg-white/15 border border-white/20 text-white rounded-2xl text-xs font-bold transition-all active:scale-95 cursor-pointer backdrop-blur-sm shadow-md"
            >
              <Filter className="w-4 h-4 text-emerald-400" />
              <span>{showExportSection ? 'Ocultar Filtros de Exportação' : 'Filtrar & Exportar para Excel'}</span>
              {showExportSection ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Expandable Filter & Export Controls */}
        <AnimatePresence>
          {showExportSection && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="pt-4 border-t border-slate-700/60 space-y-6 overflow-hidden"
            >
              {/* Filter controls row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                
                {/* Status Filter */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Status das Bobinas
                  </label>
                  <select
                    value={exportFilterStatus}
                    onChange={(e: any) => setExportFilterStatus(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs font-bold text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="in_stock">🟢 Apenas em Estoque (Disponíveis)</option>
                    <option value="consumed">⚪ Apenas Consumidas</option>
                    <option value="all">📦 Todas as Bobinas ({coils.length})</option>
                  </select>
                </div>

                {/* Supplier Filter */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Fornecedor
                  </label>
                  <select
                    value={exportFilterSupplier}
                    onChange={(e) => setExportFilterSupplier(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs font-bold text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="all">Todos os Fornecedores</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                {/* Bay Filter */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Baia / Local
                  </label>
                  <select
                    value={exportFilterBay}
                    onChange={(e) => setExportFilterBay(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs font-bold text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="all">Todas as Baias</option>
                    {storageBays.map(b => (
                      <option key={b.id} value={b.name}>{b.name}</option>
                    ))}
                  </select>
                </div>

                {/* Diameter Filter */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Bitola (mm)
                  </label>
                  <select
                    value={exportFilterDiameter}
                    onChange={(e) => setExportFilterDiameter(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs font-bold text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="all">Todas as Bitolas</option>
                    {distinctDiameters.map(d => (
                      <option key={d} value={String(d)}>{d.toFixed(2)} mm</option>
                    ))}
                  </select>
                </div>

                {/* Search Text */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Busca Rápida
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Código bobina ou NF..."
                      value={exportSearchTerm}
                      onChange={(e) => setExportSearchTerm(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-xs font-bold text-white outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-slate-500"
                    />
                  </div>
                </div>
              </div>

              {/* Summary and Action buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-slate-800/80 rounded-2xl border border-slate-700/80">
                <div className="flex items-center gap-3">
                  <span className="flex h-3 w-3 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </span>
                  <div className="text-xs">
                    <span className="font-black text-white">{filteredExportCoils.length}</span> bobinas filtradas correspondentes •{' '}
                    <span className="font-bold text-emerald-400">
                      {filteredExportCoils.reduce((sum, c) => sum + (c.weight || 0), 0).toLocaleString('pt-BR')} kg
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleExportCSV}
                    disabled={filteredExportCoils.length === 0}
                    className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                    title="Baixar arquivo CSV compatível com Excel em Português"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Baixar Excel (.csv)</span>
                  </button>

                  <button
                    onClick={handleExportTSV}
                    disabled={filteredExportCoils.length === 0}
                    className="flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold shadow-lg transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                    title="Baixar arquivo de texto com tabulações para Google Sheets"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Baixar Sheets (.txt)</span>
                  </button>

                  <button
                    onClick={handleCopyRowsToClipboard}
                    disabled={filteredExportCoils.length === 0}
                    className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                    title="Copiar todas as linhas formatadas para colar no Excel ou no campo de importação"
                  >
                    {copiedExportSuccess ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span className="text-emerald-300">Copiado com Sucesso!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 text-slate-300" />
                        <span>Copiar Linhas</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SUCCESS SCREEN AFTER IMPORT                                    */}
      {/* ------------------------------------------------------------- */}
      {isSuccess ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white border border-slate-200 p-8 sm:p-12 rounded-[2.5rem] shadow-xl max-w-3xl mx-auto text-center space-y-6"
        >
          <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 mx-auto shadow-inner">
            <CheckCircle2 className="w-10 h-10 animate-bounce" />
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Sincronização Inteligente Concluída!</h3>
            <p className="text-sm font-semibold text-slate-500">
              O banco de dados foi atualizado com economia de cotas do Firebase.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-6 bg-slate-50 rounded-3xl border border-slate-100">
            <div className="text-center">
              <span className="block text-2xl sm:text-3xl font-black text-slate-900">{importSummary.coilsCreated}</span>
              <span className="text-[10px] uppercase font-black text-slate-400">Novas Bobinas</span>
            </div>
            <div className="text-center">
              <span className="block text-2xl sm:text-3xl font-black text-emerald-600">{importSummary.coilsUpdatedToConsumed}</span>
              <span className="text-[10px] uppercase font-black text-slate-400">Atu. Consumidas</span>
            </div>
            <div className="text-center">
              <span className="block text-2xl sm:text-3xl font-black text-blue-600">{importSummary.coilsUpdatedData}</span>
              <span className="text-[10px] uppercase font-black text-slate-400">Atu. Dados/Baias</span>
            </div>
            <div className="text-center">
              <span className="block text-2xl sm:text-3xl font-black text-amber-500">{importSummary.quotaSavingsCount}</span>
              <span className="text-[10px] uppercase font-black text-slate-400">Cota Economizada</span>
            </div>
          </div>
          
          <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl flex items-center justify-center gap-3 text-xs font-semibold text-emerald-800">
            <Zap className="w-4 h-4 text-amber-500 shrink-0" />
            <span>
              <strong>{importSummary.quotaSavingsCount} bobinas inalteradas</strong> foram puladas sem gerar nenhuma gravação no Firebase.
            </span>
          </div>

          <div className="pt-2">
            <button
              onClick={() => setIsSuccess(false)}
              className="px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-md transition-all active:scale-95 cursor-pointer"
            >
              Fazer Nova Importação
            </button>
          </div>
        </motion.div>
      ) : (
        /* ------------------------------------------------------------- */
        /* MAIN IMPORT FORM & REAL-TIME QUOTA SAVER PANEL                */
        /* ------------------------------------------------------------- */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Main pasted text inputs */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white border border-slate-200/80 p-6 lg:p-8 rounded-[2.5rem] shadow-sm space-y-6">
              
              {/* Header with templates buttons */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2">
                  <Clipboard className="w-5 h-5 text-emerald-600 animate-pulse" />
                  <span className="text-sm font-black text-slate-900 uppercase tracking-tight">Colar Planilha para Importação</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={downloadTemplateCSV}
                    className="flex items-center gap-1 text-[11px] font-bold text-slate-600 hover:text-emerald-700 bg-slate-50 hover:bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-slate-200 transition-all"
                    title="Baixar modelo em branco para Excel (.csv)"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Modelo Vazio</span>
                  </button>
                </div>
              </div>

              {/* Toolbar: Delimiter & Headers */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Separador:</span>
                  <select
                    value={delimiter}
                    onChange={(e: any) => setDelimiter(e.target.value)}
                    className="bg-white border border-slate-200 rounded-lg text-xs font-bold px-2 py-1 outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="auto">Auto-detectar</option>
                    <option value="tsv">Tabulações (Excel/Sheets)</option>
                    <option value="csv_semicolon">Ponto e Vírgula (;)</option>
                    <option value="csv_comma">Vírgula (,)</option>
                  </select>
                </div>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={hasHeaders} 
                      onChange={(e) => setHasHeaders(e.target.checked)}
                      className="accent-emerald-600 rounded text-xs"
                    />
                    <span className="text-[10px] font-black text-slate-600 uppercase">Contém Cabeçalho</span>
                  </label>

                  <label className="flex items-center gap-1.5 cursor-pointer select-none" title="Atualiza baia e dados de bobinas já existentes se houver diferença">
                    <input 
                      type="checkbox" 
                      checked={updateExistingBayDetails} 
                      onChange={(e) => setUpdateExistingBayDetails(e.target.checked)}
                      className="accent-emerald-600 rounded text-xs"
                    />
                    <span className="text-[10px] font-black text-slate-600 uppercase">Atualizar Baias/Dados</span>
                  </label>
                </div>
              </div>

              {/* Paste Text area */}
              <div className="space-y-2">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={`Cole as linhas copiadas de sua planilha Excel ou Google Sheets aqui...
Exemplo:
ID	Operador	Data Entrada	Data Consumo	Linha	Turma / Letra	Turno	Máquina	Fornecedor	Status	Código da Bobina	Bitola (mm)	Peso (kg)	Nota Fiscal	Local Baia
1	Alessandro Santos	04/12/2025	10/12/2025	Linha 01	Turma A	Turno 1	Desbobinador 02	Morlan	Consumido	0002273002394374 M837804	2,18	1060	773778-1	1 C2
2	Carlos Oliveira	04/12/2025		Linha 02		Turno 2		Belgo Bekaert	Disponível	0002280020245484	2,30	1004	773776-1	1 E1`}
                  rows={13}
                  className="w-full p-4 bg-slate-50/50 hover:bg-slate-50 focus:bg-white border border-slate-200 rounded-3xl outline-none text-[11px] font-mono leading-relaxed focus:ring-2 focus:ring-emerald-500 shadow-inner transition-all resize-y"
                  disabled={isProcessing}
                />
              </div>

              {/* File upload & clean actions */}
              <div className="flex flex-col sm:flex-row items-center gap-4 justify-between border-t border-slate-100 pt-4">
                <div>
                  <input
                    type="file"
                    accept=".csv,.tsv,.txt"
                    onChange={handleFileUpload}
                    id="csv-file-upload-input"
                    className="hidden"
                    disabled={isProcessing}
                  />
                  <label
                    htmlFor="csv-file-upload-input"
                    className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer shadow-sm transition-all"
                  >
                    <UploadCloud className="w-4 h-4 text-slate-500" /> Upload de Arquivo (.csv / .txt)
                  </label>
                </div>

                {inputText && (
                  <button
                    onClick={clearAll}
                    disabled={isProcessing}
                    className="flex items-center gap-2 text-rose-600 hover:bg-rose-50 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" /> Limpar Bloco de Texto
                  </button>
                )}
              </div>
            </div>

            {/* Smart Column Mapping feedback if data parsed */}
            {parsedRows.length > 0 && (
              <div className="bg-white border border-slate-200 p-6 rounded-[2.5rem] shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wider block">Mapeamento Inteligente de Colunas</span>
                  <span className="text-[10px] text-slate-400 font-bold">Auto-detectado</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Nota Fiscal', key: 'nfNumber' },
                    { label: 'Fornecedor', key: 'supplier' },
                    { label: 'Status', key: 'status' },
                    { label: 'Código Bobina', key: 'coilNumber' },
                    { label: 'Bitola', key: 'diameter' },
                    { label: 'Peso', key: 'weight' },
                    { label: 'Data Consumo', key: 'consumedDate' },
                    { label: 'Baia / Local', key: 'storageBay' },
                  ].map(m => {
                    const mappedIdx = colMapping[m.key];
                    const isMapped = mappedIdx !== -1;
                    return (
                      <div key={m.key} className={cn("p-3 rounded-xl border flex flex-col justify-between h-14", isMapped ? "bg-emerald-50/45 border-emerald-100" : "bg-slate-50 border-slate-200")}>
                        <span className="text-[10px] font-bold text-slate-400 leading-none">{m.label}</span>
                        <span className="text-xs font-black text-slate-800 mt-1.5 truncate">
                          {isMapped ? `Col. ${mappedIdx + 1}` : 'Não Mapeada ⚠️'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Verification & Smart Diff Impact Summary */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white border border-slate-200 p-6 lg:p-8 rounded-[2.5rem] shadow-sm space-y-6">
              
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                  <Database className="w-5 h-5 text-emerald-600" /> Análise de Impacto no Firebase
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-100 text-emerald-800">
                  Smart Sync
                </span>
              </div>

              {/* Quota Saver Highlights */}
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="text-xs font-bold text-slate-600">Total na Planilha</span>
                  <span className="text-sm font-black text-slate-800">{stats.total}</span>
                </div>

                <div className="flex items-center justify-between p-3.5 bg-emerald-50/70 rounded-2xl border border-emerald-100">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span className="text-xs font-bold text-emerald-900">Novas Bobinas a Cadastrar</span>
                  </div>
                  <span className="text-sm font-black text-emerald-700">+{stats.newCount}</span>
                </div>

                <div className="flex items-center justify-between p-3.5 bg-blue-50/70 rounded-2xl border border-blue-100">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    <span className="text-xs font-bold text-blue-900">Atualizações de Status / Consumo</span>
                  </div>
                  <span className="text-sm font-black text-blue-700">~{stats.totalUpdatesCount}</span>
                </div>

                <div className="flex items-center justify-between p-3.5 bg-amber-50/70 rounded-2xl border border-amber-100">
                  <div className="flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-amber-600" />
                    <span className="text-xs font-bold text-amber-900">Inalteradas (Economia de Cota)</span>
                  </div>
                  <span className="text-sm font-black text-amber-700">✓ {stats.unchangedCount}</span>
                </div>

                {stats.errorCount > 0 && (
                  <div className="flex items-center justify-between p-3.5 bg-rose-50 rounded-2xl border border-rose-100">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                      <span className="text-xs font-bold text-rose-700">Com Erros (Serão Ignoradas)</span>
                    </div>
                    <span className="text-sm font-black text-rose-600">{stats.errorCount}</span>
                  </div>
                )}
              </div>

              {/* Quota-Saving Explanation Banner */}
              <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-2xl border border-emerald-200/80 space-y-1.5">
                <div className="flex items-center gap-1.5 text-emerald-800 font-black text-[10px] uppercase tracking-wider">
                  <Zap className="w-4 h-4 text-emerald-600" />
                  <span>Gravação Otimizada de Cotas Ativa</span>
                </div>
                <p className="text-[11px] leading-relaxed text-emerald-900 font-medium">
                  Apenas <strong>{stats.writesCount} gravações</strong> serão executadas no Firestore. As <strong>{stats.unchangedCount} bobinas inalteradas</strong> serão puladas automaticamente com custo zero de cota.
                </p>
              </div>

              {/* Progress or Submit Action */}
              {isProcessing ? (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-emerald-600 uppercase tracking-widest">{stepStatus}</span>
                    <span className="text-xs font-black text-slate-700">{progressPercent}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden border border-slate-200">
                    <div 
                      className="bg-emerald-600 h-full rounded-full transition-all duration-300" 
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              ) : (
                <button
                  disabled={stats.writesCount === 0}
                  onClick={handleImportExec}
                  className={cn(
                    "w-full flex items-center justify-center gap-3 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all",
                    stats.writesCount === 0 
                      ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                      : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-100 hover:shadow-xl cursor-pointer active:scale-95"
                  )}
                >
                  <Play className="w-4 h-4" /> 
                  <span>
                    {stats.writesCount > 0 
                      ? `Sincronizar ${stats.writesCount} Bobinas (${stats.newCount} novas, ${stats.totalUpdatesCount} atualizações)`
                      : 'Nenhuma alteração a sincronizar'}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* INTERACTIVE DIFF PREVIEW TABLE                                */}
      {/* ------------------------------------------------------------- */}
      {parsedRows.length > 0 && !isSuccess && (
        <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-sm overflow-hidden" id="bulk-preview-grid">
          
          {/* Filter tabs above the table */}
          <div className="p-6 bg-slate-50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-xs font-black text-slate-800 uppercase tracking-wider block">
                Visualização do Pré-Processamento ({parsedRows.length} bobinas)
              </span>
              <p className="text-[11px] text-slate-500 font-medium">
                Confira a ação que será executada em cada bobina antes de gravar no Firestore
              </p>
            </div>

            {/* Filter buttons */}
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-200/60 p-1.5 rounded-xl">
              {[
                { key: 'ALL' as const, label: 'Todas', count: stats.total, color: 'text-slate-700' },
                { key: 'NEW' as const, label: '🟢 Novas', count: stats.newCount, color: 'text-emerald-700' },
                { key: 'UPDATE' as const, label: '🟡 Atualizações', count: stats.totalUpdatesCount, color: 'text-blue-700' },
                { key: 'UNCHANGED' as const, label: '⚡ Inalteradas', count: stats.unchangedCount, color: 'text-amber-700' },
                ...(stats.errorCount > 0 ? [{ key: 'ERROR' as const, label: '🔴 Erros', count: stats.errorCount, color: 'text-rose-700' }] : [])
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setPreviewFilter(f.key)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer",
                    previewFilter === f.key 
                      ? "bg-white shadow-sm " + f.color
                      : "text-slate-500 hover:text-slate-800"
                  )}
                >
                  {f.label} ({f.count})
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase bg-slate-50/50">
                  <th className="px-4 py-3.5">#</th>
                  <th className="px-4 py-3.5">Ação Prevista (Firestore)</th>
                  <th className="px-4 py-3.5">Status Planilha</th>
                  <th className="px-4 py-3.5">Nota Fiscal</th>
                  <th className="px-4 py-3.5">Código Bobina</th>
                  <th className="px-4 py-3.5">Fornecedor</th>
                  <th className="px-4 py-3.5">Bitola</th>
                  <th className="px-4 py-3.5">Peso</th>
                  <th className="px-4 py-3.5">Linha / Turma</th>
                  <th className="px-4 py-3.5">Data Consumo</th>
                  <th className="px-4 py-3.5">Baia</th>
                  <th className="px-4 py-3.5 text-right">Diagnóstico</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-xs">
                {displayedRows.map((row) => {
                  return (
                    <tr 
                      key={row.index} 
                      className={cn(
                        "transition-colors hover:bg-slate-50/60",
                        row.action === 'NEW' && "bg-emerald-50/15",
                        row.action === 'UPDATE_CONSUMED' && "bg-blue-50/20",
                        row.action === 'UPDATE_DATA' && "bg-sky-50/20",
                        row.action === 'UNCHANGED' && "opacity-75 bg-slate-50/30",
                        row.action === 'ERROR' && "bg-rose-50/30"
                      )}
                    >
                      <td className="px-4 py-3.5 font-semibold text-slate-400">{row.index}</td>
                      
                      {/* Action Badge */}
                      <td className="px-4 py-3.5">
                        {row.action === 'NEW' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <Plus className="w-3 h-3" /> Criar Nova
                          </span>
                        )}
                        {row.action === 'UPDATE_CONSUMED' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200">
                            <Sparkles className="w-3 h-3" /> Consumir
                          </span>
                        )}
                        {row.action === 'UPDATE_DATA' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-wider bg-sky-100 text-sky-800 border border-sky-200">
                            <Layers className="w-3 h-3" /> Atualizar
                          </span>
                        )}
                        {row.action === 'UNCHANGED' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200" title="Sem alterações. Poupando cota.">
                            <Zap className="w-3 h-3 text-amber-500" /> Pular (Inalterada)
                          </span>
                        )}
                        {row.action === 'ERROR' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-200">
                            <AlertTriangle className="w-3 h-3" /> Erro
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider",
                          row.status === 'consumed' ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700"
                        )}>
                          {row.status === 'consumed' ? 'Consumido' : 'Disponível'}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 font-bold text-slate-800">{row.nfNumber || '—'}</td>
                      <td className="px-4 py-3.5 font-mono text-slate-700">{row.coilNumber || '—'}</td>
                      <td className="px-4 py-3.5 font-semibold text-slate-700">{row.supplierName || '—'}</td>
                      <td className="px-4 py-3.5 font-mono text-slate-600">{row.diameter.toFixed(2)} mm</td>
                      <td className="px-4 py-3.5 font-semibold text-slate-800">{row.weight.toLocaleString('pt-BR')} kg</td>
                      <td className="px-4 py-3.5 font-medium text-slate-600">
                        {row.lineName ? `${row.lineName}${row.consumedByGroup ? ` (${row.consumedByGroup})` : ''}` : '—'}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-slate-600">
                        {row.consumedDate ? row.consumedDate.split('-').reverse().join('/') : '—'}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-[10px] bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md font-bold text-slate-600">
                          {row.storageBayName}
                        </span>
                      </td>

                      {/* Diagnostic reason */}
                      <td className="px-4 py-3.5 text-right font-medium text-[11px] text-slate-500">
                        <span className="truncate max-w-[200px] inline-block" title={row.actionReason}>
                          {row.actionReason}
                        </span>
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
  );
};
