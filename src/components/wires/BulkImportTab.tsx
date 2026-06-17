import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  addDoc, 
  serverTimestamp,
  getDocs,
  query,
  where
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../lib/errorHandler';
import { WireBatch, WireCoil, WireSupplier, WireStorageBay } from '../../types';
import { 
  FileSpreadsheet, 
  Loader2, 
  CheckCircle2, 
  AlertTriangle, 
  UploadCloud, 
  Trash2, 
  Play, 
  Plus, 
  Info, 
  Database,
  ArrowRight,
  Clipboard,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../../hooks/useAuth';
import { cn } from '../../lib/utils';

interface BulkImportTabProps {
  suppliers: WireSupplier[];
  storageBays: WireStorageBay[];
}

interface ParsedRow {
  index: number;
  raw: string[];
  id?: string;
  operator: string;
  date: string; // YYYY-MM-DD format
  supplierName: string;
  status: 'received' | 'consumed';
  coilNumber: string;
  diameter: number;
  weight: number;
  nfNumber: string;
  storageBayName: string;
  errors: string[];
  warnings: string[];
}

export const BulkImportTab: React.FC<BulkImportTabProps> = ({ suppliers, storageBays }) => {
  const { profile } = useAuth();
  const [inputText, setInputText] = useState('');
  
  // Download CSV template separated by semicolon (Excellent for Excel in Portuguese)
  const downloadTemplateCSV = () => {
    const headers = ['ID', 'Operador', 'Data', 'Fornecedor', 'Status', 'Código da Bobina', 'Bitola (mm)', 'Peso (kg)', 'Nota Fiscal', 'Local Baia'];
    const row1 = ['2474', 'Alessandro Sousa Santos', '04/12/2025', 'Morlan', 'Disponível', '0002273002394374 M837804', '2,18', '1060', '773778-1', '1 C2'];
    const row2 = ['2484', 'Alessandro Sousa Santos', '04/12/2025', 'Belgo Bekaert', 'Disponível', '0002280020245484', '2,30', '1004', '773776-1', '1 E1'];
    
    const csvContent = "\uFEFF" + [headers.join(';'), row1.join(';'), row2.join(';')].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "modelo_carga_arame_excel.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Download TSV template separated by tabs (Excellent for Google Sheets copy-paste)
  const downloadTemplateTSV = () => {
    const headers = ['ID', 'Operador', 'Data', 'Fornecedor', 'Status', 'Código da Bobina', 'Bitola (mm)', 'Peso (kg)', 'Nota Fiscal', 'Local Baia'];
    const row1 = ['2474', 'Alessandro Sousa Santos', '04/12/2025', 'Morlan', 'Disponível', '0002273002394374 M837804', '2,18', '1060', '773778-1', '1 C2'];
    const row2 = ['2484', 'Alessandro Sousa Santos', '04/12/2025', 'Belgo Bekaert', 'Disponível', '0002280020245484', '2,30', '1004', '773776-1', '1 E1'];
    
    const tsvContent = "\uFEFF" + [headers.join('\t'), row1.join('\t'), row2.join('\t')].join('\n');
    const blob = new Blob([tsvContent], { type: 'text/tab-separated-values;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "modelo_carga_arame_sheets.txt");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [delimiter, setDelimiter] = useState<'tsv' | 'csv_comma' | 'csv_semicolon' | 'auto'>('auto');
  const [isProcessing, setIsProcessing] = useState(false);
  const [stepStatus, setStepStatus] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [isSuccess, setIsSuccess] = useState(false);
  const [importSummary, setImportSummary] = useState({
    batchesCreated: 0,
    coilsCreated: 0,
    suppliersCreated: 0,
    baysCreated: 0,
    totalWeight: 0
  });

  const [hasHeaders, setHasHeaders] = useState(true);

  // Column mapping states - index of headers
  const [colMapping, setColMapping] = useState<{ [key: string]: number }>({
    id: -1,
    operator: -1,
    date: -1,
    supplier: -1,
    status: -1,
    coilNumber: -1,
    diameter: -1,
    weight: -1,
    nfNumber: -1,
    storageBay: -1,
  });

  // Automatically parse text on input or delimiter change
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

    const lines = inputText.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length === 0) {
      setParsedRows([]);
      return;
    }

    // Helper to parse CSV line keeping text in quotes together
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

    const firstLineRaw = parseLine(lines[0], activeDelim);
    
    // 2. Map headers or set defaults
    const mapping = {
      id: -1,
      operator: -1,
      date: -1,
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
        else if (hdr.includes('operador') || hdr.includes('responsavel') || hdr.includes('usuario')) mapping.operator = idx;
        else if (hdr === 'data' || hdr.includes('date') || hdr.includes('recebido')) mapping.date = idx;
        else if (hdr.includes('fornecedor') || hdr.includes('supplier')) mapping.supplier = idx;
        else if (hdr === 'status') mapping.status = idx;
        else if (hdr.includes('codigo') || hdr.includes('code') || hdr.includes('bobina') || hdr.includes('coil')) mapping.coilNumber = idx;
        else if (hdr.includes('bitola') || hdr.includes('diametro') || hdr.includes('gauge')) mapping.diameter = idx;
        else if (hdr.includes('peso') || hdr.includes('weight') || hdr.includes('massa')) mapping.weight = idx;
        else if (hdr.includes('nota') || hdr.includes('nf') || hdr.includes('fiscal') || hdr.includes('invoice')) mapping.nfNumber = idx;
        else if (hdr.includes('baia') || hdr.includes('local') || hdr.includes('box') || hdr.includes('armazen')) mapping.storageBay = idx;
      });
    }

    // Default mappings if headers are not found or disabled
    if (!hasHeaders || Object.values(mapping).every(v => v === -1)) {
      // Fallback ordered mappings resembling the attached image columns:
      // ID | Operador | Data | Fornecedor | Status | Código | Bitola (mm) | Peso | Nota Fiscal | Quantidade Baia
      mapping.id = 0;
      mapping.operator = 1 < firstLineRaw.length ? 1 : -1;
      mapping.date = 2 < firstLineRaw.length ? 2 : -1;
      mapping.supplier = 3 < firstLineRaw.length ? 3 : -1;
      mapping.status = 4 < firstLineRaw.length ? 4 : -1;
      mapping.coilNumber = 5 < firstLineRaw.length ? 5 : -1;
      mapping.diameter = 6 < firstLineRaw.length ? 6 : -1;
      mapping.weight = 7 < firstLineRaw.length ? 7 : -1;
      mapping.nfNumber = 8 < firstLineRaw.length ? 8 : -1;
      mapping.storageBay = 9 < firstLineRaw.length ? 9 : -1;
    }

    setColMapping(mapping);

    // 3. Process data lines
    const startIdx = hasHeaders ? 1 : 0;
    const processed: ParsedRow[] = [];

    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      const rawRow = parseLine(line, activeDelim);
      
      const getField = (columnIdx: number, defaultValue: string = ''): string => {
        if (columnIdx === -1 || columnIdx >= rawRow.length) return defaultValue;
        return rawRow[columnIdx].trim();
      };

      const errors: string[] = [];
      const warnings: string[] = [];

      // Raw fields
      const id = getField(mapping.id);
      const operator = getField(mapping.operator, 'Administrador');
      const rawDate = getField(mapping.date);
      const coilNumber = getField(mapping.coilNumber);
      let supplierName = getField(mapping.supplier, 'Geral');

      // Auto-detect Morlan if coil number looks like a Morlan GD code
      if (coilNumber && (coilNumber.toUpperCase().startsWith('GD') || /GD\d{10,20}/i.test(coilNumber))) {
        supplierName = 'Morlan';
      }

      const rawStatus = getField(mapping.status);
      const rawDiameter = getField(mapping.diameter);
      const rawWeight = getField(mapping.weight);
      const nfNumber = getField(mapping.nfNumber);
      const rawStorageBay = getField(mapping.storageBay);

      // Conversions and Validations
      
      // Date Normalization (DD/MM/YYYY to YYYY-MM-DD)
      let normDate = '';
      if (rawDate) {
        const dmyMatch = rawDate.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
        const ymdMatch = rawDate.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
        
        if (dmyMatch) {
          const day = dmyMatch[1].padStart(2, '0');
          const month = dmyMatch[2].padStart(2, '0');
          const year = dmyMatch[3];
          normDate = `${year}-${month}-${day}`;
        } else if (ymdMatch) {
          const year = ymdMatch[1];
          const month = ymdMatch[2].padStart(2, '0');
          const day = ymdMatch[3].padStart(2, '0');
          normDate = `${year}-${month}-${day}`;
        } else {
          normDate = new Date().toISOString().split('T')[0];
          warnings.push(`Formato de data '${rawDate}' inválido ou não reconhecido. Usando data de hoje.`);
        }
      } else {
        normDate = new Date().toISOString().split('T')[0];
        warnings.push('Data ausente. Usando data de hoje.');
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

      // NF check
      if (!nfNumber) {
        errors.push('Número da Nota Fiscal ausente.');
      }

      // Storage Bay extraction (e.g. "1 C2" -> "C2")
      let storageBayName = 'GERAL';
      if (rawStorageBay) {
        // Replace "1 " or any initial digits + space
        const cleanedBay = rawStorageBay.replace(/^\d+\s+/, '').trim().toUpperCase();
        if (cleanedBay) {
          storageBayName = cleanedBay;
        }
      } else {
        warnings.push('Local da baia ausente. Alocando na baia GERAL.');
      }

      // Check if Supplier already exists
      const supplierExists = suppliers.some(s => s.name.toLowerCase().trim() === supplierName.toLowerCase().trim());
      if (!supplierExists && supplierName) {
        warnings.push(`Novo fornecedor '${supplierName}' será adicionado automaticamente.`);
      }

      // Check if Storage Bay already exists
      const bayExists = storageBays.some(b => b.name.toUpperCase().trim() === storageBayName.toUpperCase().trim());
      if (!bayExists && storageBayName) {
        warnings.push(`Nova baia de armazenamento '${storageBayName}' será cadastrada automaticamente.`);
      }

      processed.push({
        index: i,
        raw: rawRow,
        id,
        operator,
        date: normDate,
        supplierName,
        status,
        coilNumber: coilNumber.trim().replace(/\s+/g, ' '),
        diameter,
        weight,
        nfNumber,
        storageBayName,
        errors,
        warnings
      });
    }

    setParsedRows(processed);
  }, [inputText, delimiter, hasHeaders, suppliers, storageBays]);

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

  // Helper stats
  const stats = useMemo(() => {
    const validRows = parsedRows.filter(r => r.errors.length === 0);
    const invalidRows = parsedRows.filter(r => r.errors.length > 0);
    
    // Group unique NF batches to be created
    const uniqueBatches = new Set(validRows.map(r => `${r.nfNumber}-${r.supplierName.toLowerCase()}-${r.date}`));
    const totalWeight = validRows.reduce((sum, r) => sum + r.weight, 0);

    // Dynamic unique suppliers and bays to be newly added
    const uniqueNewSuppliers = new Set(
      validRows
        .filter(r => !suppliers.some(s => s.name.toLowerCase().trim() === r.supplierName.toLowerCase().trim()))
        .map(r => r.supplierName)
    );

    const uniqueNewBays = new Set(
      validRows
        .filter(r => !storageBays.some(b => b.name.toUpperCase().trim() === r.storageBayName.toUpperCase().trim()))
        .map(r => r.storageBayName)
    );

    return {
      validCount: validRows.length,
      invalidCount: invalidRows.length,
      batchesCount: uniqueBatches.size,
      totalWeight,
      newSuppliersCount: uniqueNewSuppliers.size,
      newSuppliersList: Array.from(uniqueNewSuppliers),
      newBaysCount: uniqueNewBays.size,
      newBaysList: Array.from(uniqueNewBays),
    };
  }, [parsedRows, suppliers, storageBays]);

  // Bulk execution flow
  const handleImportExec = async () => {
    const validRows = parsedRows.filter(r => r.errors.length === 0);
    if (validRows.length === 0) return;

    setIsProcessing(true);
    setProgressPercent(10);
    
    try {
      const liveSuppliers = [...suppliers];
      const liveBays = [...storageBays];

      let suppliersAddedCount = 0;
      let baysAddedCount = 0;

      // 1. Resolve or Create Suppliers
      setStepStatus('Verificando fornecedores e criando itens não cadastrados...');
      const supplierNameToIdMap: { [name: string]: string } = {};
      
      // Initialize map with existing ones
      liveSuppliers.forEach(s => {
        supplierNameToIdMap[s.name.toLowerCase().trim()] = s.id;
      });

      const uniqueSuppliersToCreate = Array.from(new Set(validRows.map(r => r.supplierName.trim()))) as string[];
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

      setProgressPercent(30);

      // 2. Resolve or Create Storage Bays
      setStepStatus('Verificando baias de estoque e cadastrando ausentes...');
      const bayNameToIdMap: { [name: string]: string } = {};

      liveBays.forEach(b => {
        bayNameToIdMap[b.name.toUpperCase().trim()] = b.id;
      });

      const uniqueBaysToCreate = Array.from(new Set(validRows.map(r => r.storageBayName.trim()))) as string[];
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

      setProgressPercent(50);

      // 3. Group valid rows into Batches to create
      setStepStatus('Agrupando bobinas e gerando lotes de carga (NFs)...');
      
      // We group by unique combination of: nfNumber + supplierName + date
      interface BatchGroup {
        nfNumber: string;
        supplierName: string;
        date: string;
        responsibleName: string;
        storageBayName: string;
        coils: ParsedRow[];
      }

      const groups: { [key: string]: BatchGroup } = {};
      validRows.forEach(row => {
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

      // 4. Create batches & coils sequentially
      const totalSteps = Object.keys(groups).length;
      let currentStepNum = 0;
      let batchesAddedCount = 0;
      let coilsAddedCount = 0;

      for (const groupKey of Object.keys(groups)) {
        currentStepNum++;
        const group = groups[groupKey];
        setStepStatus(`Importando lote ${currentStepNum} de ${totalSteps} (NF: ${group.nfNumber})...`);
        
        const supplierId = supplierNameToIdMap[group.supplierName.toLowerCase().trim()];
        const storageBayId = bayNameToIdMap[group.storageBayName.toUpperCase().trim()];
        
        const batchTotalWeight = group.coils.reduce((sum, c) => sum + c.weight, 0);

        // Add doc to wire_batches
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
          storageBayId: storageBayId || '',
          storageBayName: group.storageBayName,
          createdAt: serverTimestamp()
        });

        batchesAddedCount++;

        // Add all nested coils in parallel for this batch
        await Promise.all(
          group.coils.map(async coil => {
            const coilStorageBayId = bayNameToIdMap[coil.storageBayName.toUpperCase().trim()];
            await addDoc(collection(db, 'wire_coils'), {
              coilNumber: coil.coilNumber,
              batchId: batchRef.id,
              supplierId,
              diameter: coil.diameter,
              weight: coil.weight,
              status: coil.status,
              storageBayId: coilStorageBayId || '',
              storageBayName: coil.storageBayName,
              receivedAt: `${coil.date}T12:00:00Z`, // Received on the batch date
              consumedAt: coil.status === 'consumed' ? `${coil.date}T16:00:00Z` : null,
              consumedBy: coil.status === 'consumed' ? coil.operator : null
            });
            coilsAddedCount++;
          })
        );

        // Calculate progress dynamically between 50% and 95%
        const deltaProgress = 50 + Math.floor((currentStepNum / totalSteps) * 45);
        setProgressPercent(deltaProgress);
      }

      setStepStatus('Sincronização concluída com sucesso!');
      setProgressPercent(100);
      setImportSummary({
        batchesCreated: batchesAddedCount,
        coilsCreated: coilsAddedCount,
        suppliersCreated: suppliersAddedCount,
        baysCreated: baysAddedCount,
        totalWeight: stats.totalWeight
      });
      setIsSuccess(true);
      setInputText('');
    } catch (err) {
      console.error('Error during bulk load:', err);
      alert('Houve um erro técnico de permissões ao salvar os dados. Verifique a internet e tente novamente.');
    } finally {
      setIsProcessing(false);
    }
  };

  const clearAll = () => {
    if (confirm('Deseja limpar todos os dados digitados?')) {
      setInputText('');
      setParsedRows([]);
    }
  };

  return (
    <div className="space-y-8 pb-12" id="bulk-import-container">
      {/* Visual Instruction Header with zero tech larp details */}
      <div className="bg-slate-50 border border-slate-200/60 p-6 rounded-[2rem] flex flex-col xl:flex-row gap-6 xl:items-center">
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 shadow-sm">
          <FileSpreadsheet className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-black text-slate-900 leading-tight">Painel de Carga em Massa (Exclusivo Administrador)</h2>
          <p className="text-xs text-slate-500 font-semibold mt-1 leading-relaxed">
            Importe folhas inteiras de bobinas de arame para nossa base de dados. Aceita o formato padrão de planilhas. Basta selecionar todas as linhas em sua planilha, copiar, colar no bloco de texto abaixo e clicar em Processar.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 shrink-0">
          <button
            onClick={downloadTemplateCSV}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 hover:text-slate-900 rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95 cursor-pointer"
            title="Download de arquivo CSV configurado com ponto-e-vírgula excelente para Microsoft Excel em Português"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Modelo Excel (.csv)</span>
          </button>
          <button
            onClick={downloadTemplateTSV}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 hover:text-slate-900 rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95 cursor-pointer"
            title="Download de arquivo TSV com tabulações excelente para copiar e colar no Google Sheets"
          >
            <FileText className="w-4 h-4 text-sky-600" />
            <span>Modelo Sheets (.txt)</span>
          </button>
        </div>
      </div>

      {isSuccess ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-xl max-w-2xl mx-auto text-center space-y-6"
        >
          <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 mx-auto shadow-inner">
            <CheckCircle2 className="w-10 h-10 animate-bounce" />
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">Carga Realizada com Sucesso!</h3>
            <p className="text-sm font-semibold text-slate-500">Toda a base de dados em massa foi processada e salva no Firestore</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-5 bg-slate-50 rounded-3xl border border-slate-100">
            <div className="text-center">
              <span className="block text-2xl font-black text-slate-900">{importSummary.batchesCreated}</span>
              <span className="text-[10px] uppercase font-black text-slate-400">Lotes (NFs)</span>
            </div>
            <div className="text-center">
              <span className="block text-2xl font-black text-slate-900">{importSummary.coilsCreated}</span>
              <span className="text-[10px] uppercase font-black text-slate-400">Bobinas</span>
            </div>
            <div className="text-center">
              <span className="block text-2xl font-black text-emerald-600">+{importSummary.suppliersCreated}</span>
              <span className="text-[10px] uppercase font-black text-slate-400">Novos Fornec.</span>
            </div>
            <div className="text-center">
              <span className="block text-2xl font-black text-emerald-600">+{importSummary.baysCreated}</span>
              <span className="text-[10px] uppercase font-black text-slate-400">Baias Cad.</span>
            </div>
          </div>
          
          <div className="text-center py-1">
            <p className="text-xs font-semibold text-slate-400">
              Peso total integrado: <strong className="text-slate-800 font-bold ml-1">{importSummary.totalWeight.toLocaleString('pt-BR')} kg</strong>
            </p>
          </div>

          <button
            onClick={() => setIsSuccess(false)}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-md transition-all active:scale-95 cursor-pointer"
          >
            Fazer Nova Importação
          </button>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Main pasted text inputs */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white border border-slate-200/80 p-6 lg:p-8 rounded-[2.5rem] shadow-sm space-y-6">
              
              {/* Toolbar & selectors */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2">
                  <Clipboard className="w-5 h-5 text-emerald-600 animate-pulse" />
                  <span className="text-sm font-black text-slate-900 uppercase tracking-tight">Conteúdo da Carga</span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Divisor:</span>
                    <select
                      value={delimiter}
                      onChange={(e: any) => setDelimiter(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold p-1 outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="auto">Auto-detectar</option>
                      <option value="tsv">Tabulações (Excel)</option>
                      <option value="csv_semicolon">Ponto e Vírgula (;)</option>
                      <option value="csv_comma">Vírgula (,)</option>
                    </select>
                  </div>

                  <label className="flex items-center gap-1 cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={hasHeaders} 
                      onChange={(e) => setHasHeaders(e.target.checked)}
                      className="accent-emerald-600 rounded text-xs"
                    />
                    <span className="text-[10px] font-black text-slate-500 uppercase">Contém Cabeçalho</span>
                  </label>
                </div>
              </div>

              {/* Paste Text area */}
              <div className="space-y-2">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={`Cole as linhas de sua planilha Excel ou Google Sheets aqui...
Exemplo:
ID	Operador	Data	Fornecedor	Status	Código	Bitola (mm)	Peso	Nota Fiscal	Quantidade Baia
2474	Alessandro Sousa Santos	04/12/2025	Morlan	Disponível	0002273002394374  M837804	2,18	1060	773778-1	1 C2
2484	Alessandro Sousa Santos	04/12/2025	Morlan	Disponível	0002280020245484	2,30	1004	773776-1	1 E1`}
                  rows={14}
                  className="w-full p-4 bg-slate-50/50 hover:bg-slate-50 focus:bg-white border border-slate-200 rounded-3xl outline-none text-[11px] font-mono leading-relaxed focus:ring-2 focus:ring-emerald-500 shadow-inner transition-all resize-y"
                  disabled={isProcessing}
                />
              </div>

              {/* File drop zone & helper actions */}
              <div className="flex flex-col sm:flex-row items-center gap-4 justify-between border-t border-slate-100 pt-4">
                <div className="relative">
                  <input
                    type="file"
                    accept=".csv,.tsv,.txt"
                    onChange={handleFileUpload}
                    id="csv-file-upload"
                    className="hidden"
                    disabled={isProcessing}
                  />
                  <label
                    htmlFor="csv-file-upload"
                    className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer shadow-sm transition-all"
                  >
                    <UploadCloud className="w-4 h-4 text-slate-500" /> Upload de Arquivo
                  </label>
                </div>

                {inputText && (
                  <button
                    onClick={clearAll}
                    disabled={isProcessing}
                    className="flex items-center gap-2 text-rose-600 hover:bg-rose-50 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" /> Limpar Tudo
                  </button>
                )}
              </div>
            </div>

            {/* Smart Column Mapping feedback if data parsed */}
            {parsedRows.length > 0 && (
              <div className="bg-white border border-slate-200 p-6 rounded-[2.5rem] shadow-sm space-y-4">
                <span className="text-xs font-black text-slate-800 uppercase tracking-wider block">Mapeamento Inteligente de Colunas</span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { label: 'Nota Fiscal', key: 'nfNumber' },
                    { label: 'Fornecedor', key: 'supplier' },
                    { label: 'Bitola', key: 'diameter' },
                    { label: 'Peso', key: 'weight' },
                    { label: 'Código Bobina', key: 'coilNumber' },
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

          {/* Verification & Actions bar */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white border border-slate-200 p-6 lg:p-8 rounded-[2.5rem] shadow-sm space-y-6">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                <Database className="w-5 h-5 text-emerald-600" /> Resumo do Pré-Processamento
              </h3>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="text-xs font-bold text-slate-500">Bobinas Válidas</span>
                  <span className="text-sm font-black text-emerald-600">{stats.validCount}</span>
                </div>
                {stats.invalidCount > 0 && (
                  <div className="flex items-center justify-between p-3.5 bg-rose-50 rounded-2xl border border-rose-100">
                    <span className="text-xs font-bold text-rose-500">Com Erros (Serão Ignoradas)</span>
                    <span className="text-sm font-black text-rose-600">{stats.invalidCount}</span>
                  </div>
                )}
                <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="text-xs font-bold text-slate-500 font-semibold">Total de Lotes (NFs)</span>
                  <span className="text-sm font-black text-slate-800">{stats.batchesCount}</span>
                </div>
                <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="text-xs font-bold text-slate-500 font-semibold">Peso Total Estimado</span>
                  <span className="text-sm font-black text-slate-800">{stats.totalWeight.toLocaleString('pt-BR')} kg</span>
                </div>
              </div>

              {/* Dynamic Auto-Registration warnings */}
              {(stats.newSuppliersCount > 0 || stats.newBaysCount > 0) && (
                <div className="p-4 bg-amber-50/50 rounded-2xl border border-amber-200/60 space-y-3">
                  <div className="flex items-center gap-1.5 text-amber-700">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span className="text-[10px] font-black uppercase tracking-wider">Ajustes Automáticos Encontrados</span>
                  </div>

                  <div className="text-[11px] leading-relaxed text-slate-600 space-y-1.5 font-semibold">
                    {stats.newSuppliersCount > 0 && (
                      <p>
                        🔍 <strong>Fornecedores novos ({stats.newSuppliersCount}):</strong> {stats.newSuppliersList.join(', ')} serão criados automaticamente.
                      </p>
                    )}
                    {stats.newBaysCount > 0 && (
                      <p>
                        📍 <strong>Novas baias de estoque ({stats.newBaysCount}):</strong> {stats.newBaysList.join(', ')} serão cadastradas automaticamente.
                      </p>
                    )}
                  </div>
                </div>
              )}

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
                  disabled={stats.validCount === 0}
                  onClick={handleImportExec}
                  className={cn(
                    "w-full flex items-center justify-center gap-3 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all",
                    stats.validCount === 0 
                      ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                      : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-100 hover:shadow-xl cursor-pointer active:scale-95"
                  )}
                >
                  <Play className="w-4 h-4" /> Importar {stats.validCount || ''} Bobinas Válidas
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Inline validator report / Grid preview */}
      {parsedRows.length > 0 && !isSuccess && (
        <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-sm overflow-hidden" id="bulk-preview-grid">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs font-black text-slate-800 uppercase tracking-wider">Visualização das Bobinas Reconhecidas ({parsedRows.length})</span>
            <div className="flex items-center gap-3">
              <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-1 rounded-md font-black">VALID: {stats.validCount}</span>
              {stats.invalidCount > 0 && (
                <span className="text-[10px] bg-rose-100 text-rose-700 px-2 py-1 rounded-md font-black">ERR: {stats.invalidCount}</span>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase bg-slate-50/50">
                  <th className="px-6 py-3.5">Linha</th>
                  <th className="px-6 py-3.5">Status Banco</th>
                  <th className="px-6 py-3.5">Nota Fiscal</th>
                  <th className="px-6 py-3.5">Código Bobina</th>
                  <th className="px-6 py-3.5">Fornecedor</th>
                  <th className="px-6 py-3.5">Bitola (mm)</th>
                  <th className="px-6 py-3.5">Peso (kg)</th>
                  <th className="px-6 py-3.5">Baia</th>
                  <th className="px-6 py-3.5 text-right">Validação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-xs">
                {parsedRows.map((row) => {
                  const hasErr = row.errors.length > 0;
                  return (
                    <tr key={row.index} className={cn("transition-colors hover:bg-slate-50/45", hasErr && "bg-rose-50/20")}>
                      <td className="px-6 py-3.5 font-semibold text-slate-400">{row.index}</td>
                      <td className="px-6 py-3.5">
                        <span className={cn(
                          "px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-wider",
                          row.status === 'consumed' ? "bg-slate-100 text-slate-500" : "bg-emerald-50 text-emerald-600"
                        )}>
                          {row.status === 'consumed' ? 'Consumido' : 'Disponível'}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 font-bold text-slate-800">{row.nfNumber || '—'}</td>
                      <td className="px-6 py-3.5 font-mono text-slate-600">{row.coilNumber || '—'}</td>
                      <td className="px-6 py-3.5 font-semibold text-slate-700">{row.supplierName || '—'}</td>
                      <td className="px-6 py-3.5 font-mono text-slate-600">{row.diameter.toFixed(2)} mm</td>
                      <td className="px-6 py-3.5 font-semibold text-slate-800">{row.weight.toLocaleString('pt-BR')} kg</td>
                      <td className="px-6 py-3.5">
                        <span className="text-[10px] bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md font-bold text-slate-600">
                          {row.storageBayName}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right font-medium">
                        {hasErr ? (
                          <div className="flex items-center gap-1.5 justify-end text-rose-500 font-bold">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>Erro de dados</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 justify-end text-emerald-600 font-medium">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            <span>Ok</span>
                          </div>
                        )}
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
