import React, { useEffect, useState, useRef } from 'react';
import { 
  collection, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc, 
  addDoc, 
  setDoc, 
  serverTimestamp, 
  query, 
  orderBy, 
  onSnapshot, 
  where, 
  writeBatch,
  limit
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { UserProfile, AllowedDomain, UserRole, UserStatus } from '../types';
import { MASTER_EMAILS } from '../constants';
import { handleFirestoreError, OperationType } from '../lib/errorHandler';
import { encryptValue, decryptValue, hashEmailForSearch } from '../lib/crypto';
import { useAuth } from '../hooks/useAuth';
import { 
  Users, 
  Globe, 
  Trash2, 
  Edit2, 
  Plus, 
  Search,
  ShieldAlert,
  Loader2,
  CheckCircle2,
  Ban,
  UserX,
  UserCheck2,
  Mail,
  MailCheck,
  ShieldCheck,
  UserPlus,
  X,
  AlertTriangle,
  History,
  Palette,
  Upload,
  Image as ImageIcon,
  ChevronDown,
  Sliders,
  Download,
  Info,
  Check,
  Key
} from 'lucide-react';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, updateProfile, sendEmailVerification, sendPasswordResetEmail } from 'firebase/auth';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const finalFirebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBo5pmkm8yIvR_2rg08a2XzgqdHvCFNnwA",
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "gen-lang-client-0972067932.firebaseapp.com",
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID || "gen-lang-client-0972067932",
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "gen-lang-client-0972067932.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "328642603761",
  appId:             import.meta.env.VITE_FIREBASE_APP_ID || "1:328642603761:web:62d4a334ccd5524ba71750",
};
import { motion, AnimatePresence } from 'motion/react';
import { cn, safeToDate } from '../lib/utils';
import { validateEmailDomain } from '../lib/domainUtils';
import { ConfirmationModal } from '../components/ui/ConfirmationModal';

const Admin: React.FC = () => {
  const { isAdmin, isMaster, user, logoUrl, updateCompanyLogo } = useAuth();
  const isSuperMaster = user?.email?.toLowerCase() === 'jacksonbjr@gmail.com';
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [editingNameUserId, setEditingNameUserId] = useState<string | null>(null);
  const [tempEditName, setTempEditName] = useState('');
  const [editingEmailUserId, setEditingEmailUserId] = useState<string | null>(null);
  const [tempEditEmail, setTempEditEmail] = useState('');
  const [moduleToReset, setModuleToReset] = useState<{
    id: string;
    title: string;
    collections: string[];
    description: string;
  } | null>(null);
  const [domains, setDomains] = useState<AllowedDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [userToDelete, setUserToDelete] = useState<{ id: string; email: string } | null>(null);
  const [newDomain, setNewDomain] = useState('');
  const [domainLoading, setDomainLoading] = useState(false);
  const [activeTab, setActiveTab ] = useState<'users' | 'domains' | 'logs' | 'modules' | 'reset' | 'branding' | 'import'>('users');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // CSV Importer States
  const [selectedImportTable, setSelectedImportTable] = useState<string>('users');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, successes: 0, errors: [] as string[] });
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetProgress, setResetProgress] = useState('');
  const [customLogoBase64, setCustomLogoBase64] = useState<string | null>(null);
  const [saveBrandingLoading, setSaveBrandingLoading] = useState(false);
  const [brandingDragActive, setBrandingDragActive] = useState(false);
  const [activeModules, setActiveModules] = useState<Record<string, boolean>>({
    dds: true,
    forklifts: true,
    wires: true,
    quality: true,
    schedule: true,
    operational_routes: true,
    safety_observations: true,
    shift_handover: true,
    certificates: true,
    stops_control: true,
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'viewer' as UserRole });
  const [addUserLoading, setAddUserLoading] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);
  const [userToResetPassword, setUserToResetPassword] = useState<{ id: string; email: string; displayName: string } | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState('Mudarsenha123');
  const [passwordResetLoading, setPasswordResetLoading] = useState(false);
  const [emailResetLoading, setEmailResetLoading] = useState(false);

  // Helper to sanitize Portuguese accented characters for jsPDF text drawing
  const sanitizePdfText = (text: string | null | undefined): string => {
    if (!text) return '';
    return String(text)
      .replace(/[áàâãäÁÀÂÃÄ]/g, 'a')
      .replace(/[éèêëÉÈÊË]/g, 'e')
      .replace(/[íìîïÍÌÎÏ]/g, 'i')
      .replace(/[óòôõöÓÒÔÕÖ]/g, 'o')
      .replace(/[úùûüÚÙÛÜ]/g, 'u')
      .replace(/[çÇ]/g, 'c')
      .replace(/[ñÑ]/g, 'n');
  };

  const handleExportUsersPDF = () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();

      // Header styling - Standardized Emerald Theme
      doc.setFillColor(5, 150, 105); // emerald-600
      doc.rect(0, 0, pageWidth, 35, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(sanitizePdfText('Relatório de Usuários'), 14, 20);
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(190, 242, 219); // emerald-100ish for secondary text on emerald bg
      
      const nowStr = new Date().toLocaleString('pt-BR');
      doc.text(sanitizePdfText(`Gerado em: ${nowStr}`), 14, 28);
      doc.text(sanitizePdfText(`Total de Usuários: ${filteredUsers.length}`), pageWidth - 14, 28, { align: 'right' });

      const head = [['Nome', 'E-mail', 'Função', 'Grupo/Letra', 'Status', 'Acesso']];
      const tableData = filteredUsers.map(u => {
        let roleLabel = 'Viewer';
        if (u.isMaster) roleLabel = 'Master';
        else if (u.role === 'admin') roleLabel = 'Admin';
        else if (u.role === 'manager') roleLabel = 'Manager';

        let statusLabel = 'Inativo';
        if (u.status === 'approved') statusLabel = 'Ativo';
        else if (u.status === 'blocked') statusLabel = 'Bloqueado';
        else if (u.status === 'pending') statusLabel = 'Pendente';

        const firstAccessLabel = u.mustChangePassword ? 'Primeiro Acesso' : 'Senha Alterada';

        return [
          u.displayName || 'Sem nome',
          u.email,
          roleLabel,
          u.group || '-',
          statusLabel,
          firstAccessLabel
        ];
      });

      autoTable(doc, {
        startY: 40,
        head: head.map(row => row.map(cell => sanitizePdfText(cell))),
        body: tableData.map(row => row.map(cell => sanitizePdfText(cell))),
        theme: 'striped',
        headStyles: { 
          fillColor: [5, 150, 105], // emerald-600 to look ultra cohesive!
          textColor: [255, 255, 255],
          fontSize: 8,
          fontStyle: 'bold'
        },
        styles: { fontSize: 8, cellPadding: 3 },
        alternateRowStyles: { fillColor: [248, 250, 252] } // slate-50
      });

      doc.save(`relatorio_usuarios_${Date.now()}.pdf`);
      setSuccess('PDF exportado com sucesso!');
    } catch (err: any) {
      console.error('Erro ao gerar PDF:', err);
      setError('Erro ao gerar PDF dos usuários.');
    }
  };

  // System Logs local states
  const [loginLogs, setLoginLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsSearchTerm, setLogsSearchTerm] = useState('');

  // CSV Importer Configurations & Handlers
  const CSV_TABLES = [
    {
      id: 'users',
      name: 'Perfil de Usuários / Colaboradores',
      collection: 'users',
      description: 'Cadastre usuários em massa no banco de dados para identificação e controle de acesso.',
      headers: ['displayName', 'email', 'role', 'status'],
      examples: [
        ['José de Souza', 'jose.souza@empresa.com', 'viewer', 'active'],
        ['Mariana Silva', 'mariana.silva@empresa.com', 'manager', 'active'],
        ['Roberto Antunes', 'roberto.antunes@empresa.com', 'admin', 'active']
      ],
      notes: 'O campo "role" suporta apenas: "viewer", "manager", "admin". Os domínios de e-mail devem estar cadastrados na aba correspondente.',
      processRow: (row: Record<string, string>) => ({
        displayName: row.displayName?.trim() || 'Usuário Sem Nome',
        email: row.email?.toLowerCase().trim() || '',
        role: ['viewer', 'manager', 'admin'].includes(row.role?.toLowerCase().trim()) ? row.role.toLowerCase().trim() : 'viewer',
        status: ['active', 'blocked'].includes(row.status?.toLowerCase().trim()) ? row.status.toLowerCase().trim() : 'active',
        createdAt: serverTimestamp(),
      }),
      getKey: (row: Record<string, string>) => row.email?.toLowerCase().trim()
    },
    {
      id: 'allowed_domains',
      name: 'Domínios Institucionais de E-mail',
      collection: 'allowed_domains',
      description: 'Defina quais domínios de e-mail (@empresa.com, etc) são permitidos para novos cadastros de login.',
      headers: ['domain'],
      examples: [
        ['empresa.com'],
        ['grupoindustrial.com.br']
      ],
      notes: 'Informe apenas a terminação do e-mail pós arroba, sem espaços ou símbolos adicionais.',
      processRow: (row: Record<string, string>) => ({
        domain: row.domain?.replace('@', '').toLowerCase().trim() || '',
        createdAt: serverTimestamp(),
      }),
      getKey: (row: Record<string, string>) => row.domain?.replace('@', '').toLowerCase().trim()
    },
    {
      id: 'production_lines',
      name: 'Linhas de Produção',
      collection: 'production_lines',
      description: 'Crie ou atualize as linhas produtivas integradas aos checklists de Qualidade, Arames e Consumo.',
      headers: ['name', 'active'],
      examples: [
        ['Linha de Laminação 01', 'true'],
        ['Linha de Revestimento 3B', 'true'],
        ['Setor de Preparação Auxiliar', 'false']
      ],
      notes: 'O campo "active" aceita apenas "true" (habilitado) ou "false" (desativado).',
      processRow: (row: Record<string, string>) => ({
        name: row.name?.trim() || '',
        active: row.active?.toLowerCase().trim() === 'true',
        createdAt: serverTimestamp(),
      }),
      getKey: (row: Record<string, string>) => row.name?.toLowerCase().replace(/[^a-z0-9]/g, '')
    },
    {
      id: 'wire_suppliers',
      name: 'Fornecedores de Bobinas (Arames)',
      collection: 'wire_suppliers',
      description: 'Cadastre os fornecedores para controle de matéria prima no estoque e rastreabilidade.',
      headers: ['name'],
      examples: [
        ['Gerdau Metálicos S/A'],
        ['Siderúrgica Belgo Bekaert'],
        ['ArcelorMittal Arame e Fios']
      ],
      notes: 'Nome por extenso amigável do fornecedor de bobinas.',
      processRow: (row: Record<string, string>) => ({
        name: row.name?.trim() || '',
      }),
      getKey: (row: Record<string, string>) => row.name?.toLowerCase().replace(/[^a-z0-9]/g, '')
    },
    {
      id: 'wire_storage_bays',
      name: 'Boxes de Estocagem (Arames)',
      collection: 'wire_storage_bays',
      description: 'Localizações operacionais (boxes, galpões, baias) para estocagem e movimentação de bobinas.',
      headers: ['name'],
      examples: [
        ['Baia A-01'],
        ['Doca de Recebimento Norte'],
        ['Galpão Auxiliar de Arame']
      ],
      notes: 'Identificador do box. Evita que o operador digite localizações inexistentes.',
      processRow: (row: Record<string, string>) => ({
        name: row.name?.trim() || '',
      }),
      getKey: (row: Record<string, string>) => row.name?.toLowerCase().replace(/[^a-z0-9]/g, '')
    },
    {
      id: 'forklifts',
      name: 'Frota de Empilhadeiras',
      collection: 'forklifts',
      description: 'Cadastre as empilhadeiras e veículos industriais que passarão por vistorias diárias.',
      headers: ['number', 'name', 'model', 'serial', 'sector'],
      examples: [
        ['101', 'Hyster 2.5T', 'H80FT', 'ABC1234567', 'Armazém de Acabados'],
        ['204', 'Toyota Elétrica', '8FBE15', 'XYZ7890123', 'Expedição Geral']
      ],
      notes: 'O "number" deve ser numérico e único para facilitar buscas por código de máquina.',
      processRow: (row: Record<string, string>) => ({
        number: row.number?.trim() || '',
        name: row.name?.trim() || '',
        model: row.model?.trim() || '',
        serial: row.serial?.trim() || '',
        sector: row.sector?.trim() || '',
        createdAt: serverTimestamp(),
      }),
      getKey: (row: Record<string, string>) => row.number?.trim()
    },
    {
      id: 'operators',
      name: 'Operadores e Inspetores',
      collection: 'operators',
      description: 'Insira a lista de operadores habilitados a realizar inspeções e verificações de rota.',
      headers: ['name', 'department', 'employeeId'],
      examples: [
        ['Carlos de Souza', 'Produção Mecânica', 'OP9912'],
        ['Mariana Antunes de Lima', 'Qualidade de Bobinas', 'OP1293']
      ],
      notes: 'Ideal para centralizar a lista com matrícula/employeeId único do colaborador.',
      processRow: (row: Record<string, string>) => ({
        name: row.name?.trim() || '',
        department: row.department?.trim() || '',
        employeeId: row.employeeId?.trim() || '',
        createdAt: serverTimestamp(),
      }),
      getKey: (row: Record<string, string>) => row.employeeId?.trim() || row.name?.toLowerCase().replace(/[^a-z0-9]/g, '')
    },
    {
      id: 'quality_sectors',
      name: 'Setores de Qualidade',
      collection: 'quality_sectors',
      description: 'Setores / Áreas departamentais que participam dos checklists de auditoria de qualidade.',
      headers: ['name', 'index'],
      examples: [
        ['Derrumbe e Trefilação', '1'],
        ['Pátio de Carregamento', '2'],
        ['Área de Expedição', '3']
      ],
      notes: 'O campo index determina a ordem de ordenação visual nos filtros.',
      processRow: (row: Record<string, string>) => ({
        name: row.name?.trim() || '',
        index: parseInt(row.index) || 0,
        createdAt: serverTimestamp(),
      }),
      getKey: (row: Record<string, string>) => row.name?.toLowerCase().replace(/[^a-z0-9]/g, '')
    },
    {
      id: 'consumable_items',
      name: 'Estoque de Insumos',
      collection: 'consumable_items',
      description: 'Itens, tintas, solventes e descartáveis gerenciados pelo módulo de consumables/insumos.',
      headers: ['name', 'description', 'unit', 'quantityInStock', 'minimumQuantity'],
      examples: [
        ['Tinta Epóxi Demarcação Amarela', 'Balde de 18L de alta densidade', 'L', '150', '30'],
        ['Diluente Químico Especial', 'Galão de solvente ecológico', 'GL', '45', '10']
      ],
      notes: 'As colunas quantityInStock e minimumQuantity precisam ser números válidos.',
      processRow: (row: Record<string, string>) => ({
        name: row.name?.trim() || '',
        description: row.description?.trim() || '',
        unit: row.unit?.trim() || 'UN',
        quantityInStock: parseFloat(row.quantityInStock) || 0,
        minimumQuantity: parseFloat(row.minimumQuantity) || 0,
        createdAt: serverTimestamp(),
      }),
      getKey: (row: Record<string, string>) => row.name?.toLowerCase().replace(/[^a-z0-9]/g, '')
    }
  ];

  const downloadImportTemplate = (tableId: string) => {
    const table = CSV_TABLES.find(t => t.id === tableId);
    if (!table) return;
    
    const headerRow = table.headers.join(';');
    const sampleRows = table.examples.map(ex => ex.join(';')).join('\n');
    const csvContent = `${headerRow}\n${sampleRows}`;
    
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `modelo_importacao_${table.id}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const parseCSVContent = (text: string) => {
    const lines: string[][] = [];
    let row: string[] = [""];
    let inQuotes = false;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          row[row.length - 1] += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' || char === ';') {
        if (inQuotes) {
          row[row.length - 1] += char;
        } else {
          row.push("");
        }
      } else if (char === '\r' || char === '\n') {
        if (inQuotes) {
          row[row.length - 1] += char;
        } else {
          if (char === '\r' && nextChar === '\n') {
            i++;
          }
          lines.push(row);
          row = [""];
        }
      } else {
        row[row.length - 1] += char;
      }
    }
    if (row.length > 1 || row[0] !== "") {
      lines.push(row);
    }
    return lines;
  };

  const handleCSVImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvFile) return;
    
    const tableDef = CSV_TABLES.find(t => t.id === selectedImportTable);
    if (!tableDef) {
      setError('Tabela de importação não identificada.');
      return;
    }
    
    setImporting(true);
    setImportProgress({ current: 0, total: 0, successes: 0, errors: [] });
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) {
          setError('O arquivo está vazio.');
          setImporting(false);
          return;
        }
        
        const rawLines = parseCSVContent(text);
        if (rawLines.length === 0) {
          setError('Nenhuma linha detectada no arquivo CSV.');
          setImporting(false);
          return;
        }
        
        const headers = rawLines[0].map(h => h.trim().replace(/^"|"$/g, ''));
        const missingHeaders = tableDef.headers.filter(h => !headers.includes(h));
        if (missingHeaders.length > 0) {
          setError(`Cabeçalhos inválidos. Faltando colunas cruciais: ${missingHeaders.join(', ')}`);
          setImporting(false);
          return;
        }
        
        const dataRows = rawLines.slice(1).filter(r => r.length > 0 && r.some(cell => cell.trim() !== ''));
        if (dataRows.length === 0) {
          setError('Nenhum registro de dados encontrado nas linhas subsequentes.');
          setImporting(false);
          return;
        }
        
        setImportProgress({
          current: 0,
          total: dataRows.length,
          successes: 0,
          errors: []
        });
        
        let successCount = 0;
        const errorLogs: string[] = [];
        
        for (let idx = 0; idx < dataRows.length; idx++) {
          const cells = dataRows[idx];
          const mappedRow: Record<string, string> = {};
          
          tableDef.headers.forEach(header => {
            const fileHeaderIdx = headers.indexOf(header);
            if (fileHeaderIdx !== -1) {
              mappedRow[header] = cells[fileHeaderIdx]?.trim().replace(/^"|"$/g, '') || '';
            } else {
              mappedRow[header] = '';
            }
          });
          
          try {
            let dataToInsert: any = tableDef.processRow(mappedRow);
            const key = tableDef.getKey(mappedRow);
            
            if (tableDef.id === 'users' && !mappedRow.email) {
              throw new Error('E-mail do colaborador é obrigatório.');
            }
            if (tableDef.id === 'allowed_domains' && !mappedRow.domain) {
              throw new Error('Domínio de e-mail não pode ser vazio.');
            }
            if (tableDef.id === 'production_lines' && !mappedRow.name) {
              throw new Error('Nome da Linha de Produção é obrigatório.');
            }
            if (tableDef.id === 'forklifts' && !mappedRow.number) {
              throw new Error('Número identificador da empilhadeira é obrigatório.');
            }

            if (tableDef.id === 'users') {
              const emailStr = mappedRow.email?.toLowerCase().trim() || "";
              const nameStr = mappedRow.displayName?.trim() || "Usuário Sem Nome";
              const encEmail = await encryptValue(emailStr);
              const encName = await encryptValue(nameStr);
              const emailHash = hashEmailForSearch(emailStr);
              dataToInsert = {
                email: encEmail,
                emailHash: emailHash,
                displayName: encName,
                role: ['viewer', 'manager', 'admin'].includes(mappedRow.role?.toLowerCase().trim()) ? mappedRow.role.toLowerCase().trim() : 'viewer',
                status: ['active', 'blocked'].includes(mappedRow.status?.toLowerCase().trim()) ? (mappedRow.status.toLowerCase().trim() === 'active' ? 'approved' : 'blocked') : 'approved',
                mustChangePassword: true,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
              };

              // Also write to users_public
              await setDoc(doc(db, 'users_public', emailHash), {
                exists: true,
                uid: emailStr, // For imported users, fallback uid is their plaintext email initially
                role: dataToInsert.role,
                status: dataToInsert.status,
                updatedAt: serverTimestamp()
              });
            }
            
            if (key) {
              await setDoc(doc(db, tableDef.collection, key), dataToInsert);
            } else {
              await addDoc(collection(db, tableDef.collection), dataToInsert);
            }
            
            successCount++;
          } catch (itemErr: any) {
            console.error('Import line error:', itemErr);
            errorLogs.push(`Linha ${idx + 2}: ${itemErr.message || 'Erro desconhecido ao salvar'}`);
          }
          
          setImportProgress(prev => ({
            ...prev,
            current: idx + 1,
            successes: successCount,
            errors: [...errorLogs]
          }));
        }
        
        setSuccess(`Processo concluído com sucesso! ${successCount} registros importados de ${dataRows.length}.`);
        setCsvFile(null);
        if (csvInputRef.current) csvInputRef.current.value = '';
      } catch (err: any) {
        console.error('Global CSV upload failure:', err);
        setError(`Falha ao ler o arquivo selecionado: ${err.message}`);
      } finally {
        setImporting(false);
      }
    };
    reader.readAsText(csvFile);
  };

  // Clear messages automatically after 5 seconds
  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess('');
        setError('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success, error]);




  const fetchData = async () => {
    setLoading(true);
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      const domainsSnap = await getDocs(query(collection(db, 'allowed_domains'), orderBy('createdAt', 'desc')));
      
      const usersList = (await Promise.all(usersSnap.docs
        .map(async (doc) => {
          const data = doc.data() as any;
          const decryptedEmail = await decryptValue(data.email);
          const decryptedDisplayName = await decryptValue(data.displayName);
          const isUserMaster = MASTER_EMAILS.includes(decryptedEmail?.toLowerCase() || '');
          return { 
            uid: doc.id, 
            ...data, 
            email: decryptedEmail,
            displayName: decryptedDisplayName,
            isMaster: isUserMaster 
          } as UserProfile;
        })))
        .filter(user => !user.isMaster || isMaster);

      // Group by email and auto-cleanup duplicates (sandbox vs real)
      const emailGroups: { [email: string]: UserProfile[] } = {};
      usersList.forEach(u => {
        const emailKey = (u.email || '').toLowerCase().trim();
        if (emailKey) {
          if (!emailGroups[emailKey]) {
            emailGroups[emailKey] = [];
          }
          emailGroups[emailKey].push(u);
        }
      });

      const uniqueUsers: UserProfile[] = [];
      const toDeleteFromDb: string[] = [];

      for (const emailKey of Object.keys(emailGroups)) {
        const group = emailGroups[emailKey];
        if (group.length === 1) {
          uniqueUsers.push(group[0]);
        } else {
          // Find if we have a real UID and sandbox UIDs
          const realUsers = group.filter(u => !u.uid.startsWith('sandbox_user_'));
          const sandboxUsers = group.filter(u => u.uid.startsWith('sandbox_user_'));

          if (realUsers.length > 0) {
            // Keep the real user (newest real if multiple exist)
            realUsers.sort((a, b) => {
              const tA = a.createdAt?.seconds || 0;
              const tB = b.createdAt?.seconds || 0;
              return tB - tA;
            });
            uniqueUsers.push(realUsers[0]);

            // Mark other real users as duplicates to delete
            for (let i = 1; i < realUsers.length; i++) {
              toDeleteFromDb.push(realUsers[i].uid);
            }
            // Mark all sandbox users as duplicates to delete
            sandboxUsers.forEach(su => toDeleteFromDb.push(su.uid));
          } else {
            // Only sandbox users exist. Keep the newest sandbox user.
            sandboxUsers.sort((a, b) => {
              const tA = a.createdAt?.seconds || 0;
              const tB = b.createdAt?.seconds || 0;
              return tB - tA;
            });
            uniqueUsers.push(sandboxUsers[0]);

            // Mark other sandbox users to delete
            for (let i = 1; i < sandboxUsers.length; i++) {
              toDeleteFromDb.push(sandboxUsers[i].uid);
            }
          }
        }
      }

      // Perform background deletion of duplicate profiles to heal the database
      if (toDeleteFromDb.length > 0) {
        console.log('[Admin fetchData] Healing duplicate user records by deleting stale UIDs:', toDeleteFromDb);
        toDeleteFromDb.forEach(async (dupUid) => {
          try {
            await deleteDoc(doc(db, 'users', dupUid));
          } catch (delErr) {
            console.warn(`[Admin fetchData] Failed to delete duplicate profile document ${dupUid}:`, delErr);
          }
        });
      }

      setUsers(uniqueUsers);
      setDomains(domainsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AllowedDomain)));
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'admin_data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchData();
    }
  }, [isAdmin]);

  const fetchLoginLogs = async () => {
    if (!isMaster) return;
    setLogsLoading(true);
    try {
      const logsSnap = await getDocs(
        query(
          collection(db, 'user_login_logs'), 
          orderBy('timestamp', 'desc'),
          limit(300)
        )
      );
      const logsList = logsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setLoginLogs(logsList);
    } catch (err) {
      console.error('Error fetching login logs:', err);
      setError('Erro ao carregar logs de acesso ou permissão insuficiente.');
    } finally {
      setLogsLoading(false);
    }
  };

  const handleDeleteAllLoginLogs = async () => {
    if (!isMaster) {
      setError('Apenas o usuário master pode limpar os logs.');
      return;
    }
    if (!window.confirm('Tem certeza absoluta que deseja apagar TODOS os logs de acesso gerais e individuais do sistema? Esta ação é irreversível.')) {
      return;
    }
    setLogsLoading(true);
    setError('');
    setSuccess('');
    try {
      const logsSnap = await getDocs(collection(db, 'user_login_logs'));
      if (logsSnap.empty) {
        setSuccess('Nenhum log encontrado para excluir.');
        return;
      }
      
      let batch = writeBatch(db);
      let count = 0;
      for (const d of logsSnap.docs) {
        batch.delete(doc(db, 'user_login_logs', d.id));
        count++;
        if (count >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }
      if (count > 0) {
        await batch.commit();
      }
      
      setSuccess('Todos os logs de acesso do sistema foram excluídos com sucesso!');
      await fetchLoginLogs();
    } catch (err: any) {
      console.error('Error clearing login logs:', err);
      setError(`Erro ao excluir os logs de acesso: ${err.message || err}`);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleDeleteIndividualLog = async (logId: string) => {
    if (!isMaster) {
      setError('Apenas o usuário master pode excluir logs.');
      return;
    }
    setLogsLoading(true);
    setError('');
    setSuccess('');
    try {
      await deleteDoc(doc(db, 'user_login_logs', logId));
      setSuccess('Registro de log excluído com sucesso!');
      await fetchLoginLogs();
    } catch (err: any) {
      console.error('Error deleting individual log:', err);
      setError(`Erro ao excluir registro de log: ${err.message || err}`);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin && activeTab === 'logs') {
      fetchLoginLogs();
    }
  }, [isAdmin, activeTab]);

  useEffect(() => {
    if (!isAdmin) return;
    const unsub = onSnapshot(doc(db, 'system_config', 'modules'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setActiveModules(prev => ({
          ...prev,
          ...data
        }));
      }
    }, (error) => {
      console.error('Error listening to modules configuration:', error);
    });
    return () => unsub();
  }, [isAdmin]);

  const handleToggleModule = async (moduleId: string) => {
    try {
      const updatedValue = !activeModules[moduleId];
      const updated = {
        ...activeModules,
        [moduleId]: updatedValue
      };
      setActiveModules(updated);
      await setDoc(doc(db, 'system_config', 'modules'), updated);
      setSuccess('Módulo atualizado com sucesso!');
    } catch (err) {
      console.error('Erro ao salvar módulo:', err);
      setError('Erro ao salvar configuração do módulo.');
    }
  };

  const formatUserAgent = (ua: string) => {
    if (!ua) return 'Não identificado';
    const uaLower = ua.toLowerCase();
    if (uaLower.includes('mobile') || uaLower.includes('android') || uaLower.includes('iphone') || uaLower.includes('ipad')) {
      if (uaLower.includes('android')) return '📱 Celular (Android)';
      if (uaLower.includes('iphone') || uaLower.includes('ipad')) return '📱 Celular (iOS)';
      return '📱 Dispositivo Móvel';
    }
    if (uaLower.includes('chrome')) return '💻 Computador (Chrome)';
    if (uaLower.includes('firefox')) return '💻 Computador (Firefox)';
    if (uaLower.includes('safari') && !uaLower.includes('chrome')) return '💻 Computador (Safari)';
    if (uaLower.includes('edge')) return '💻 Computador (Edge)';
    return '💻 Computador/Web';
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.displayName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          user.email.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.name || !newUser.email) return;

    // 1. Domain Check
    const { allowed, domain: emailDomain } = await validateEmailDomain(newUser.email);
    if (!allowed) {
      setError(`O domínio @${emailDomain} não é permitido. Cadastre o domínio primeiro na aba "Domínios".`);
      return;
    }

    // Check for duplicate email in Firestore
    const emailLower = newUser.email.toLowerCase().trim();
    const emailQuery = query(collection(db, 'users'), where('emailHash', '==', hashEmailForSearch(emailLower)), limit(1));
    const querySnapshot = await getDocs(emailQuery);
    if (!querySnapshot.empty) {
      setError("Este e-mail já possui um cadastro ativo no sistema.");
      return;
    }
    
    setAddUserLoading(true);
    const tempAppName = `temp-app-${Date.now()}`;
    const tempApp = initializeApp(finalFirebaseConfig, tempAppName);
    const tempAuth = getAuth(tempApp);
    const defaultPassword = 'Mudarsenha123';

    try {
      // 1. Create Auth User in secondary app to avoid logging out admin
      const { user } = await createUserWithEmailAndPassword(tempAuth, newUser.email, defaultPassword);
      await updateProfile(user, { displayName: newUser.name });

      // 2. Send Custom Welcome Email via Gmail API (instead of direct Firebase email)
      try {
        const adminToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
        await fetch('/api/send-custom-auth-email', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`
          },
          body: JSON.stringify({
            type: 'welcome',
            email: newUser.email,
            name: newUser.name
          })
        });
      } catch (emailErr) {
        console.error('Error sending custom welcome email:', emailErr);
      }

      // 3. Create User Profile in Firestore
      const addedUserEmail = newUser.email.toLowerCase().trim();
      const encryptedEmail = await encryptValue(addedUserEmail);
      const encryptedName = await encryptValue(newUser.name);
      const emailHash = hashEmailForSearch(addedUserEmail);

      await setDoc(doc(db, 'users', user.uid), {
        email: encryptedEmail,
        emailHash: emailHash,
        displayName: encryptedName,
        role: newUser.role,
        status: 'approved',
        mustChangePassword: true,
        emailVerifiedInAuth: false,
        isMaster: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Synchronize users_public lookup mapping
      await setDoc(doc(db, 'users_public', emailHash), {
        exists: true,
        uid: user.uid,
        role: newUser.role,
        status: 'approved',
        updatedAt: serverTimestamp()
      });

      setSuccess(`Usuário criado com sucesso! Senha padrão: ${defaultPassword}`);
      setIsAddUserOpen(false);
      setNewUser({ name: '', email: '', role: 'viewer' });
      fetchData();
    } catch (err: any) {
      console.error(err);
      const errStr = (err?.code || err?.message || String(err) || '').toLowerCase();
      const isEmailInUse = errStr.includes('email-already-in-use') || 
                           errStr.includes('email-already-exists') || 
                           errStr.includes('email_exists') || 
                           errStr.includes('already in use') || 
                           errStr.includes('already exists') || 
                           errStr.includes('already-in-use');

      if (isEmailInUse) {
        // Check if user exists in Firestore
        try {
          const checkEmailLower = newUser.email.toLowerCase().trim();
          const userSnap = await getDocs(query(collection(db, 'users'), where('emailHash', '==', hashEmailForSearch(checkEmailLower))));
          if (userSnap.empty) {
            // Recreate profile for existing Auth user!
            try {
              const adminToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
              const res = await fetch('/api/admin/get-auth-user', {
                method: 'POST',
                headers: { 
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify({ email: newUser.email })
              });
              
              let data: any = {};
              try {
                const responseText = await res.text();
                try {
                  data = JSON.parse(responseText);
                } catch (pErr) {
                  data = { error: responseText || `Status HTTP ${res.status}` };
                }
              } catch (readErr: any) {
                data = { error: readErr.message || 'Erro de leitura da resposta' };
              }

              if (res.ok && data.success && data.uid) {
                // Yes, we got the UID! Now let's create the Firestore user profile
                const encCheckEmail = await encryptValue(checkEmailLower);
                const encNewUserName = await encryptValue(newUser.name || data.displayName || 'Usuário');
                const emailHash = hashEmailForSearch(checkEmailLower);
                await setDoc(doc(db, 'users', data.uid), {
                  email: encCheckEmail,
                  emailHash: emailHash,
                  displayName: encNewUserName,
                  role: newUser.role,
                  status: 'approved',
                  mustChangePassword: true, // Treated as first access
                  emailVerifiedInAuth: true,
                  isMaster: false,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp()
                });

                // Synchronize users_public lookup mapping
                await setDoc(doc(db, 'users_public', emailHash), {
                  exists: true,
                  uid: data.uid,
                  role: newUser.role,
                  status: 'approved',
                  updatedAt: serverTimestamp()
                });
                setSuccess(`Usuário ${newUser.email} já possuía credenciais de acesso mas estava sem perfil ativo. O vínculo foi reestabelecido e ele foi ativado com sucesso!`);
                setIsAddUserOpen(false);
                setNewUser({ name: '', email: '', role: 'viewer' });
                fetchData();
                return;
              } else {
                if (data.code === 'auth/api-disabled') {
                  setError(`O e-mail ${newUser.email} já tem cadastro na Autenticação do Firebase, mas a API "Identity Toolkit" do Google Cloud está desativada no seu projeto. 
                  
✔️ NÃO SE PREOCUPE, você não precisa fazer nada complexo! 
Basta pedir para o usuário "${newUser.email}" fazer o login uma vez no sistema corporativo com a senha dele. O perfil de usuário dele será gerado AUTOMATICAMENTE e com total segurança no primeiro login dele! Depois disso, ele aparecerá aqui na sua lista de usuários para você gerenciar.`);
                } else {
                  setError(`O e-mail ${newUser.email} já existe na autenticação, mas não conseguimos recuperar o ID para criar o perfil: ${data.error || 'Erro desconhecido'}`);
                }
              }
            } catch (syncErr: any) {
              setError(`O e-mail ${newUser.email} já existe na autenticação e falhou ao recuperar perfil: ${syncErr.message}`);
            }
          } else {
            setError('Este e-mail já possui um cadastro ativo no sistema.');
          }
        } catch (dbErr) {
          setError('Este e-mail já está em uso no sistema de autenticação.');
        }
      } else if (err?.message?.includes('blocked') || err?.message?.includes('api-not-activated-or-disabled') || err?.code?.includes('api-key-restrictions')) {
        setError(`O cadastro de novos usuários está bloqueado pelas políticas do seu Firebase ou do Google Cloud.

Para solucionar isso de uma vez por todas, realize estes 2 passos simples:

1️⃣ Ativar o Provedor de E-mail/Senha:
No console do Firebase (console.firebase.google.com), vá em "Authentication" > aba "Sign-in method" > garanta que o provedor "E-mail/senha" esteja como ATIVADO.

2️⃣ Ajustar as Restrições da Chave de API no Google Cloud:
No Console do Google Cloud (console.cloud.google.com), vá no menu "APIs e Serviços" > "Credenciais", clique na sua Chave de API (Browser key) e certifique-se de marcar a "Identity Toolkit API" na lista de APIs permitidas. Caso contrário, o Google Cloud bloqueará a criação de qualquer usuário por e-mail!`);
      } else {
        const isEmailInUseFallback = errStr.includes('email-already-in-use') || 
                                     errStr.includes('email-already-exists') || 
                                     errStr.includes('email_exists') || 
                                     errStr.includes('already in use') || 
                                     errStr.includes('already exists') || 
                                     errStr.includes('already-in-use');
        if (isEmailInUseFallback) {
          setError('Este e-mail já está sendo utilizado por outra conta de usuário.');
        } else {
          setError(err.message || 'Erro ao criar usuário. Tente novamente.');
        }
      }
    } finally {
      setAddUserLoading(false);
      // Delete temporary app
      if (tempApp) {
        try {
          await deleteApp(tempApp);
        } catch (e) {
          console.warn("Error deleting temp app:", e);
        }
      }
    }
  };

  const handleUpdateName = async (userId: string, newName: string) => {
    if (!newName.trim()) return;
    try {
      const encryptedName = await encryptValue(newName.trim());
      await updateDoc(doc(db, 'users', userId), { 
        displayName: encryptedName,
        updatedAt: serverTimestamp()
      });
      setUsers(users.map(u => u.uid === userId ? { ...u, displayName: newName.trim() } : u));
      setSuccess('Nome atualizado com sucesso!');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
      setError('Erro ao atualizar nome.');
    }
  };

  const handleUpdateEmail = async (userId: string, newEmail: string) => {
    const emailLower = newEmail.trim().toLowerCase();
    if (!emailLower) return;
    
    const targetUser = users.find(u => u.uid === userId);
    if (!targetUser) return;
    
    const currentEmail = targetUser.email || '';
    if (currentEmail.toLowerCase().trim() === emailLower) return;

    setError('');
    setSuccess('');

    try {
      const oldEmailHash = targetUser.emailHash || hashEmailForSearch(currentEmail);
      const newEmailHash = hashEmailForSearch(emailLower);
      
      // Check duplicate in local users state first
      const isDuplicateInState = users.some(u => u.uid !== userId && (u.email || '').toLowerCase().trim() === emailLower);
      if (isDuplicateInState) {
        setError('Este e-mail já possui um cadastro ativo no sistema.');
        return;
      }

      // Check duplicate in Firestore
      const emailQuery = query(collection(db, 'users'), where('emailHash', '==', newEmailHash), limit(1));
      const querySnapshot = await getDocs(emailQuery);
      if (!querySnapshot.empty && querySnapshot.docs[0].id !== userId) {
        setError('Este e-mail já possui um cadastro ativo no sistema.');
        return;
      }

      setLoading(true);

      // 1. Update Firebase Auth first to ensure email is not in use and update is successful
      try {
        const adminToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
        const res = await fetch('/api/admin/update-auth-email', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`
          },
          body: JSON.stringify({ uid: userId, email: emailLower })
        });
        
        if (res.ok) {
          const resData = await res.json();
          if (!resData.success) {
            if (resData.error === 'email-already-in-use') {
              setError('Este e-mail já está sendo utilizado por outra conta de usuário.');
            } else {
              setError(`Erro ao atualizar e-mail na autenticação: ${resData.message || 'Falha desconhecida'}`);
            }
            return;
          }
        } else {
          const resData = await res.json().catch(() => ({}));
          const errMsg = resData.message || 'Falha de comunicação com o servidor de autenticação.';
          setError(`Erro ao atualizar e-mail: ${errMsg}`);
          return;
        }
      } catch (authErr: any) {
        console.error('[Admin] Failed to update user email in Firebase Authentication:', authErr);
        const errStr = (authErr?.code || authErr?.message || String(authErr) || '').toLowerCase();
        if (errStr.includes('email-already-in-use') || errStr.includes('already-in-use')) {
          setError('Este e-mail já está sendo utilizado por outra conta de usuário.');
        } else {
          setError(`Erro ao atualizar e-mail na autenticação: ${authErr.message || 'Falha de rede.'}`);
        }
        return;
      }

      // 2. Update main user document in Firestore
      const encryptedEmail = await encryptValue(emailLower);
      await updateDoc(doc(db, 'users', userId), { 
        email: encryptedEmail,
        emailHash: newEmailHash,
        updatedAt: serverTimestamp()
      });

      // 3. Manage users_public lookup
      if (oldEmailHash !== newEmailHash) {
        try {
          await deleteDoc(doc(db, 'users_public', oldEmailHash));
        } catch (e) {
          console.warn("Could not delete old users_public mapping:", e);
        }

        await setDoc(doc(db, 'users_public', newEmailHash), {
          exists: true,
          uid: userId,
          role: targetUser.role,
          status: targetUser.status || 'approved',
          updatedAt: serverTimestamp()
        });
      }

      setUsers(users.map(u => u.uid === userId ? { ...u, email: emailLower, emailHash: newEmailHash } : u));
      setSuccess('E-mail atualizado com sucesso!');
    } catch (err: any) {
      console.error(err);
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
      setError('Erro ao atualizar e-mail: ' + (err.message || ''));
    } finally {
      setLoading(false);
    }
  };

  const handleModuleReset = async (moduleId: string, collections: string[]) => {
    if (!isSuperMaster) return;
    setResetLoading(true);
    setError('');
    setSuccess('');
    setResetProgress('Iniciando limpeza individual...');

    try {
      if (moduleId === 'users') {
        // Clear all users except master emails
        await deleteCollectionDocs('users', (docSnap) => {
          const data = docSnap.data();
          const email = (data.email || '').toLowerCase().trim();
          return !MASTER_EMAILS.includes(email);
        });

        // Clear users_public except master hashes
        await deleteCollectionDocs('users_public', (docSnap) => {
          const masterHashes = MASTER_EMAILS.map(email => hashEmailForSearch(email.toLowerCase().trim()));
          return !masterHashes.includes(docSnap.id);
        });
      } else {
        // Clear collections directly
        for (const collName of collections) {
          await deleteCollectionDocs(collName);
        }
      }

      setResetProgress('Finalizando restauração...');
      setSuccess(`Módulo "${moduleToReset?.title || moduleId}" limpo com sucesso!`);
      setModuleToReset(null);
      await fetchData();
    } catch (err: any) {
      console.error('[Admin Module Reset] Error:', err);
      setError('Ocorreu um erro ao tentar limpar o módulo.');
    } finally {
      setResetLoading(false);
      setResetProgress('');
    }
  };

  const handleRestoreDefaultTemplates = async () => {
    if (!isSuperMaster) return;
    setResetLoading(true);
    setError('');
    setSuccess('');
    setResetProgress('Iniciando restauração de modelos...');

    try {
      // 1. Restore Quality Sector if not present
      setResetProgress('Restaurando Setor de Qualidade...');
      const sectorsSnap = await getDocs(collection(db, 'quality_sectors'));
      let targetSectorId = '';
      const existingSec = sectorsSnap.docs.find(d => {
        const data = d.data();
        return (data.name || '').toLowerCase().includes('secagem') || (data.name || '').toLowerCase().includes('secador');
      });

      if (existingSec) {
        targetSectorId = existingSec.id;
      } else {
        const docRef = await addDoc(collection(db, 'quality_sectors'), {
          name: "Secagem e Acabamento",
          lineIds: [],
          active: true,
          createdAt: serverTimestamp()
        });
        targetSectorId = docRef.id;
      }

      // 2. Restore Quality Option Set if not present
      setResetProgress('Restaurando Opções de Resposta...');
      const optionsSnap = await getDocs(collection(db, 'quality_checklist_options'));
      let targetOptionSetId = '';
      const existingOpt = optionsSnap.docs.find(d => {
        const data = d.data();
        return (data.name || '').toLowerCase().includes('limpeza') || (data.name || '').toLowerCase().includes('secador');
      });

      if (existingOpt) {
        targetOptionSetId = existingOpt.id;
      } else {
        const docRef = await addDoc(collection(db, 'quality_checklist_options'), {
          name: "Nível de Limpeza de Secador",
          options: ["Pouco Sujo", "Sujo", "Tamponado"],
          active: true,
          createdAt: serverTimestamp()
        });
        targetOptionSetId = docRef.id;
      }

      // 3. Restore Quality Checklist Template "Inspeção de Limpeza do Secador"
      setResetProgress('Gerando Checklist de Limpeza do Secador (100 itens)...');
      const templatesSnap = await getDocs(collection(db, 'quality_checklist_templates'));
      const existingTmpl = templatesSnap.docs.find(d => {
        const data = d.data();
        return (data.name || '').toLowerCase().includes('limpeza') || (data.name || '').toLowerCase().includes('secador');
      });

      if (!existingTmpl) {
        const items = [];
        for (let door = 0; door <= 24; door++) {
          for (const level of ['A', 'B', 'C', 'D']) {
            const isSpecial = door === 0 || door === 1 || door === 24;
            items.push({
              id: `door_${door}_level_${level.toLowerCase()}`,
              label: `Porta ${door === 24 ? '00' : door} - Nivel ${level}`,
              type: "condition",
              required: false,
              conditionOptionsId: targetOptionSetId,
              allowObservation: true,
              radiatorCount: isSpecial ? 2 : 4
            });
          }
        }
        await addDoc(collection(db, 'quality_checklist_templates'), {
          name: "Inspeção de Limpeza do Secador",
          description: "Monitoramento de conformidade da limpeza do secador de celulose em 4 níveis de criticidade por porta.",
          sectorId: targetSectorId || 'all',
          frequencyPerShift: 1,
          active: true,
          createdBy: auth.currentUser?.uid || 'system',
          createdAt: serverTimestamp(),
          items: items
        });
      }

      // 4. Restore Operational Route Templates
      setResetProgress('Restaurando Modelos de Rotas Operacionais...');
      const routeTemplatesSnap = await getDocs(collection(db, 'route_templates'));

      // Template 1: Rota da Mesa Formadora e Prensa
      const hasRoute1 = routeTemplatesSnap.docs.some(d => (d.data().name || '').toLowerCase().includes('mesa formadora'));
      if (!hasRoute1) {
        await addDoc(collection(db, 'route_templates'), {
          name: "Rota da Mesa Formadora e Prensa",
          active: true,
          sectorId: "all",
          frequency: "shift",
          allowedShifts: ["Turno 1", "Turno 2", "Turno 3"],
          equipments: [
            {
              id: 'mesa_formadora_nivel',
              name: 'Nível da Caixa de Entrada',
              tag: 'CX-ENT',
              description: 'Verificar se o nível da polpa na caixa de entrada está estável',
              required: true,
              type: 'condition'
            },
            {
              id: 'mesa_formadora_vazio',
              name: 'Pressão de Vácuo das Caixas',
              tag: 'VAC-CX',
              description: 'Nível de vácuo nas caixas de sucção (bar)',
              required: true,
              type: 'number',
              min: 0.1,
              max: 0.8
            },
            {
              id: 'mesa_formadora_feltro',
              name: 'Alinhamento do Feltro',
              tag: 'AL-FEL',
              description: 'Verificar centralização e guias',
              required: true,
              type: 'condition'
            },
            {
              id: 'prensa_pressao',
              name: 'Pressão Hidráulica da Prensa 1',
              tag: 'P-PRE1',
              description: 'Pressão do cilindro principal (bar)',
              required: true,
              type: 'number',
              min: 80,
              max: 180
            }
          ],
          createdAt: serverTimestamp()
        });
      }

      // Template 2: Rota de Inspeção do Secador de Celulose
      const hasRoute2 = routeTemplatesSnap.docs.some(d => (d.data().name || '').toLowerCase().includes('inspeção do secador'));
      if (!hasRoute2) {
        await addDoc(collection(db, 'route_templates'), {
          name: "Rota de Inspeção do Secador de Celulose",
          active: true,
          sectorId: "all",
          frequency: "shift",
          allowedShifts: ["Turno 1", "Turno 2", "Turno 3"],
          equipments: [
            {
              id: 'secador_vapor_pressao',
              name: 'Pressão do Vapor Principal',
              tag: 'P-VAP-PRIN',
              description: 'Pressão da linha de vapor (bar)',
              required: true,
              type: 'number',
              min: 4,
              max: 14
            },
            {
              id: 'secador_temperatura',
              name: 'Temperatura Interna Média',
              tag: 'T-SEC',
              description: 'Temperatura interna (°C)',
              required: true,
              type: 'number',
              min: 100,
              max: 155
            },
            {
              id: 'secador_vazamentos',
              name: 'Vazamentos nas Portas',
              tag: 'L-PORT',
              description: 'Verificar se há escape de vapor ou condensado',
              required: true,
              type: 'condition'
            }
          ],
          createdAt: serverTimestamp()
        });
      }

      // Template 3: Rota da Amarradeira (Enfardamento)
      const hasRoute3 = routeTemplatesSnap.docs.some(d => (d.data().name || '').toLowerCase().includes('amarradeira'));
      if (!hasRoute3) {
        await addDoc(collection(db, 'route_templates'), {
          name: "Rota da Amarradeira (Enfardamento)",
          active: true,
          sectorId: "all",
          frequency: "shift",
          allowedShifts: ["Turno 1", "Turno 2", "Turno 3"],
          equipments: [
            {
              id: 'amarradeira_tensao_esq',
              name: 'Tensionamento - Nó Esquerdo',
              tag: 'TENS-NOE',
              description: 'Aperto mecânico do nó esquerdo',
              required: true,
              type: 'condition'
            },
            {
              id: 'amarradeira_tensao_dir',
              name: 'Tensionamento - Nó Direito',
              tag: 'TENS-NOD',
              description: 'Aperto mecânico do nó direito',
              required: true,
              type: 'condition'
            },
            {
              id: 'amarradeira_pressao_ar',
              name: 'Pressão do Ar Comprimido',
              tag: 'P-AR-AM',
              description: 'Pressão de suprimento pneumático (bar)',
              required: true,
              type: 'number',
              min: 5.5,
              max: 8.5
            },
            {
              id: 'amarradeira_sensor_pos',
              name: 'Sensor de Posição do Fardo',
              tag: 'SENS-FAR',
              description: 'Alinhamento do sensor óptico',
              required: true,
              type: 'condition'
            }
          ],
          createdAt: serverTimestamp()
        });
      }

      // 5. Update local seeding configurations in firestore settings
      await setDoc(doc(db, 'settings', 'quality_seeding'), {
        dryerTemplateSeeded: true
      }, { merge: true });

      setResetProgress('Sincronizando...');
      setSuccess('Modelos de Rotas e Inspeções padrão restaurados com sucesso!');
    } catch (err: any) {
      console.error('[Admin Seeding Restore] Error:', err);
      setError('Ocorreu um erro ao tentar restaurar os modelos padrão: ' + (err.message || ''));
    } finally {
      setResetLoading(false);
      setResetProgress('');
    }
  };

  const handleUpdateRole = async (userId: string, newRole: UserRole) => {
    try {
      await updateDoc(doc(db, 'users', userId), { 
        role: newRole,
        updatedAt: serverTimestamp()
      });

      const targetUser = users.find(u => u.uid === userId);
      if (targetUser) {
        const hash = targetUser.emailHash || hashEmailForSearch(targetUser.email);
        await setDoc(doc(db, 'users_public', hash), {
          role: newRole,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      setUsers(users.map(u => u.uid === userId ? { ...u, role: newRole } : u));
      setSuccess('Função atualizada com sucesso!');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
      setError('Erro ao atualizar função.');
    }
  };

  const handleUpdateGroup = async (userId: string, newGroup: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { 
        group: newGroup || null,
        updatedAt: serverTimestamp()
      });
      setUsers(users.map(u => u.uid === userId ? { ...u, group: newGroup as any } : u));
      setSuccess('Escala atualizada com sucesso!');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
      setError('Erro ao atualizar escala.');
    }
  };

  const handleUpdateStatus = async (userId: string, newStatus: UserStatus) => {
    try {
      await updateDoc(doc(db, 'users', userId), { 
        status: newStatus,
        disabled: newStatus === 'blocked',
        updatedAt: serverTimestamp()
      });

      const targetUser = users.find(u => u.uid === userId);
      if (targetUser) {
        const hash = targetUser.emailHash || hashEmailForSearch(targetUser.email);
        await setDoc(doc(db, 'users_public', hash), {
          status: newStatus === 'blocked' ? 'blocked' : 'approved',
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      setUsers(users.map(u => u.uid === userId ? { ...u, status: newStatus, disabled: newStatus === 'blocked' } : u));
      setSuccess(`Usuário ${newStatus === 'blocked' ? 'bloqueado' : 'aprovado'} com sucesso!`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
      setError('Erro ao atualizar status.');
    }
  };

  const handleToggleStatus = async (user: UserProfile) => {
    // If pending, just approve them. If approved, block them. If blocked, approve them.
    const newStatus: UserStatus = user.status === 'blocked' ? 'approved' : 
                                 user.status === 'approved' ? 'blocked' : 'approved';
    handleUpdateStatus(user.uid, newStatus);
  };

  const handleToggleEmailVerify = async (user: UserProfile) => {
    try {
      const newValue = !user.isEmailVerifiedOverride;
      await updateDoc(doc(db, 'users', user.uid), { 
        isEmailVerifiedOverride: newValue,
        updatedAt: serverTimestamp()
      });
      setUsers(users.map(u => u.uid === user.uid ? { ...u, isEmailVerifiedOverride: newValue } : u));
      setSuccess('Status de e-mail atualizado!');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
      setError('Erro ao atualizar verificação.');
    }
  };

  const deleteCollectionDocs = async (collectionName: string, filterFn?: (docSnap: any) => boolean) => {
    try {
      setResetProgress(`Lendo coleção "${collectionName}"...`);
      const snap = await getDocs(collection(db, collectionName));
      if (snap.empty) return;

      const docsToDelete = filterFn ? snap.docs.filter(filterFn) : snap.docs;
      if (docsToDelete.length === 0) return;

      setResetProgress(`Apagando ${docsToDelete.length} itens da coleção "${collectionName}"...`);
      
      let batch = writeBatch(db);
      let count = 0;
      for (const d of docsToDelete) {
        batch.delete(doc(db, collectionName, d.id));
        count++;
        if (count >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }
      if (count > 0) {
        await batch.commit();
      }
    } catch (err) {
      console.error(`Error resetting collection ${collectionName}:`, err);
    }
  };

  const handleMasterReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperMaster) return;

    if (resetConfirmText.trim().toUpperCase() !== 'CONFIRMO APAGAR TUDO') {
      setError('Por favor, digite exatamente "CONFIRMO APAGAR TUDO" para prosseguir.');
      return;
    }

    setResetLoading(true);
    setError('');
    setSuccess('');
    setResetProgress('Iniciando...');

    try {
      const collectionsToClear = [
        'user_login_logs',
        'dds_sessions',
        'dds_signatures',
        'safety_observations',
        'safety_categories',
        'safety_areas',
        'operators',
        'quality_checklist_templates',
        'production_lines',
        'quality_sectors',
        'quality_checklist_options',
        'quality_checklist_submissions',
        'quality_checklist_omissions',
        'forklift_drafts',
        'forklifts',
        'forklift_check_items',
        'forklift_checklists',
        'notifications',
        'wire_suppliers',
        'wire_batches',
        'wire_coils',
        'wire_storage_bays',
        'monthly_production',
        'route_submissions',
        'route_templates'
      ];

      for (const collName of collectionsToClear) {
        await deleteCollectionDocs(collName);
      }

      const masterHashes = MASTER_EMAILS.map(email => hashEmailForSearch(email.toLowerCase().trim()));

      await deleteCollectionDocs('users', (docSnap) => {
        const data = docSnap.data();
        const hash = data.emailHash || '';
        return !masterHashes.includes(hash);
      });

      await deleteCollectionDocs('users_public', (docSnap) => {
        const hash = docSnap.id || '';
        return !masterHashes.includes(hash);
      });

      setResetProgress('Finalizando restauração...');
      setSuccess('Todo o sistema de banco de dados foi resetado com sucesso!');
      setResetConfirmText('');
      setActiveTab('users');
      await fetchData();
    } catch (err: any) {
      console.error('[Admin Reset] Error:', err);
      setError('Ocorreu um erro ao tentar resetar o sistema.');
    } finally {
      setResetLoading(false);
      setResetProgress('');
    }
  };


  const handleDeleteUser = async (userId: string, userEmail: string, confirmed = false) => {
    if (userEmail === 'jacksonbjr@gmail.com') {
      setError('O usuário Master principal não pode ser excluído.');
      return;
    }

    if (!confirmed) {
      setUserToDelete({ id: userId, email: userEmail });
      return;
    }
    
    setDeletingUserId(userId);
    try {
      console.log(`[Admin] Initiating full delete for user: ${userEmail} (ID: ${userId})`);
      const emailHash = hashEmailForSearch(userEmail.toLowerCase().trim());
      
      // 1. Delete from Firebase Authentication first to prevent email conflicts when recreating
      try {
        const adminToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
        await fetch('/api/admin/delete-auth-user', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`
          },
          body: JSON.stringify({ email: userEmail, uid: userId })
        });
      } catch (authDelErr) {
        console.warn('[Admin] Failed to delete user from Firebase Authentication:', authDelErr);
      }

      // 2. Query and delete all documents in 'users' with matching emailHash (both sandbox and real ones)
      try {
        const q = query(collection(db, 'users'), where('emailHash', '==', emailHash));
        const qSnap = await getDocs(q);
        const deletePromises = qSnap.docs.map(docSnap => deleteDoc(docSnap.ref));
        
        // Also ensure the selected userId is deleted even if its emailHash did not match or query failed
        if (!qSnap.docs.some(docSnap => docSnap.id === userId)) {
          deletePromises.push(deleteDoc(doc(db, 'users', userId)));
        }
        await Promise.all(deletePromises);
        console.log(`[Admin] Successfully deleted ${deletePromises.length} profile documents in Firestore for ${userEmail}`);
      } catch (dbDelErr) {
        console.error('[Admin] Failed to delete profile documents from users collection:', dbDelErr);
        // Fallback: delete at least the specific userId document
        await deleteDoc(doc(db, 'users', userId));
      }
      
      // 3. Delete from users_public lookup index
      if (userEmail) {
        try {
          await deleteDoc(doc(db, 'users_public', emailHash));
        } catch (pubErr) {
          console.warn('[Admin] Failed to delete public hash mapping:', pubErr);
        }
      }

      // 4. Update state by filtering out both the specific userId and any users with the same email
      setUsers(prev => prev.filter(u => u.uid !== userId && (u.email || '').toLowerCase().trim() !== userEmail.toLowerCase().trim()));
      setSuccess('Usuário e todos os seus perfis foram excluídos permanentemente com sucesso.');
    } catch (err) {
      console.error('[Admin] Delete error:', err);
      handleFirestoreError(err, OperationType.DELETE, `users/${userId}`);
      setError('Erro ao excluir usuário. Verifique as regras de segurança.');
    } finally {
      setDeletingUserId(null);
      setUserToDelete(null);
    }
  };

  const handleSendCustomVerification = async (user: UserProfile) => {
    if (!user.email) return;
    setSendingEmailId(user.uid);
    try {
      const adminToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      // We call our server API to send a custom email using the configured system Gmail
      const res = await fetch('/api/send-custom-auth-email', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          type: 'verification',
          email: user.email,
          name: user.displayName,
          userId: user.uid
        })
      });
      
      const data = await res.json();
      if (data.success) {
        setSuccess(`E-mail de boas-vindas/instruções enviado para ${user.email} via ${data.sender || 'e-mail do sistema'}`);
      } else {
        throw new Error(data.error || 'Falha ao enviar e-mail via servidor.');
      }
    } catch (err: any) {
      console.error('Email error:', err);
      setError(`Erro ao enviar e-mail: ${err.message}`);
    } finally {
      setSendingEmailId(null);
    }
  };

  const handleResetUserPassword = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!userToResetPassword) return;
    
    if (newPasswordValue.length < 6) {
      setError('A senha deve conter no mínimo 6 caracteres.');
      return;
    }
    
    setPasswordResetLoading(true);
    setError('');
    setSuccess('');
    
    try {
      const adminToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const response = await fetch('/api/admin/reset-user-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          email: userToResetPassword.email,
          userId: userToResetPassword.id,
          newPassword: newPasswordValue
        })
      });
      
      const data = await response.json();
      if (response.ok && data.success) {
        setSuccess(`Senha redefinida com sucesso para o usuário ${userToResetPassword.email}!`);
        setUserToResetPassword(null);
        setNewPasswordValue('Mudarsenha123');
        fetchData();
      } else {
        setError(data.error || 'Não foi possível redefinir a senha do usuário.');
      }
    } catch (err: any) {
      console.error('Password reset error:', err);
      setError('Erro ao redefinir a senha do usuário: ' + (err.message || ''));
    } finally {
      setPasswordResetLoading(false);
    }
  };

  const handleSendPasswordResetEmail = async () => {
    if (!userToResetPassword) return;
    
    setEmailResetLoading(true);
    setError('');
    setSuccess('');
    
    try {
      await sendPasswordResetEmail(auth, userToResetPassword.email.toLowerCase().trim());
      setSuccess(`E-mail de recuperação de senha enviado com sucesso para ${userToResetPassword.email}!`);
      setUserToResetPassword(null);
    } catch (err: any) {
      console.error('Send reset email error:', err);
      setError('Erro ao enviar e-mail de redefinição: ' + (err.message || ''));
    } finally {
      setEmailResetLoading(false);
    }
  };

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain) return;
    
    // Ensure we have the @ prefix for storage as requested
    let domain = newDomain.toLowerCase().trim();
    if (!domain.startsWith('@')) {
      domain = '@' + domain;
    }
    
    if (domain === '@') return;
    
    setDomainLoading(true);
    try {
      await setDoc(doc(db, 'allowed_domains', domain), {
        domain,
        addedBy: auth.currentUser?.uid,
        createdAt: serverTimestamp()
      });
      setNewDomain('');
      setSuccess('Domínio adicionado com sucesso!');
      fetchData();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'allowed_domains');
      setError('Erro ao adicionar domínio. Verifique se o domínio é válido.');
    } finally {
      setDomainLoading(false);
    }
  };

  const [editingDomain, setEditingDomain] = useState<{ id: string, value: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState<{ id: string, name: string } | null>(null);

  const handleUpdateDomain = async (oldId: string, newValue: string) => {
    let domain = newValue.toLowerCase().trim();
    if (!domain.startsWith('@')) {
      domain = '@' + domain;
    }
    
    if (domain === '@' || domain === oldId) {
      setEditingDomain(null);
      return;
    }

    setDomainLoading(true);
    try {
      // Find old data
      const oldDoc = domains.find(d => d.id === oldId);
      
      // Batch update (Delete and Create)
      const batch = writeBatch(db);
      batch.delete(doc(db, 'allowed_domains', oldId));
      batch.set(doc(db, 'allowed_domains', domain), {
        domain,
        addedBy: oldDoc?.addedBy || auth.currentUser?.uid,
        createdAt: oldDoc?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      await batch.commit();
      
      setSuccess('Domínio atualizado!');
      setEditingDomain(null);
      fetchData();
    } catch (err) {
      console.error('Update error:', err);
      handleFirestoreError(err, OperationType.WRITE, `allowed_domains/${oldId}`);
      setError('Erro ao atualizar domínio.');
    } finally {
      setDomainLoading(false);
    }
  };

  const handleDeleteDomain = async () => {
    if (!showConfirmDelete) return;
    const { id, name } = showConfirmDelete;
    
    setDeletingId(id);
    setShowConfirmDelete(null);
    try {
      await deleteDoc(doc(db, 'allowed_domains', id));
      setDomains(prev => prev.filter(d => d.id !== id));
      setSuccess(`Domínio ${name} removido com sucesso!`);
    } catch (err) {
      console.error('Delete error:', err);
      handleFirestoreError(err, OperationType.DELETE, `allowed_domains/${id}`);
      setError('Erro ao remover domínio. Verifique suas permissões.');
    } finally {
      setDeletingId(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-12 bg-white border border-red-100 rounded-[2rem] shadow-sm">
        <div className="w-20 h-20 bg-red-50 rounded-2xl flex items-center justify-center mb-6">
          <ShieldAlert className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Acesso Restrito</h2>
        <p className="text-slate-500 max-w-md">Esta área é exclusiva para administradores do sistema SecAPP.</p>
      </div>
    );
  }

  const menuOptions = [
    { id: 'users' as const, label: 'Usuários', icon: Users, color: 'text-emerald-500' },
    { id: 'domains' as const, label: 'Domínios', icon: Globe, color: 'text-indigo-500' },
    { id: 'modules' as const, label: 'Módulos', icon: Sliders, color: 'text-amber-500' },
    ...(isMaster ? [
      { id: 'branding' as const, label: 'Identidade Visual', icon: Palette, color: 'text-blue-500' },
      { id: 'logs' as const, label: 'Logs de Acesso', icon: History, color: 'text-purple-500' },
      { id: 'import' as const, label: 'Importação de Dados (CSV)', icon: Upload, color: 'text-teal-500' },
      ...(isSuperMaster ? [
        { id: 'reset' as const, label: 'Reset Sistema', icon: ShieldAlert, color: 'text-rose-600' }
      ] : [])
    ] : [])
  ];

  const currentOption = menuOptions.find(opt => opt.id === activeTab) || menuOptions[0];

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Painel Administrativo</h1>
          <p className="text-gray-500 mt-1">Gerencie usuários, permissões e restrições de domínio.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={() => setIsAddUserOpen(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg transition-all active:scale-95"
          >
            <UserPlus className="w-4 h-4" />
            Novo Usuário
          </button>

          {/* Custom Dropdown for Submenu Selection */}
          <div ref={dropdownRef} className="relative z-30">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-2.5 bg-white border border-slate-205 hover:border-slate-300 hover:bg-slate-50 text-slate-800 px-4 py-2 rounded-xl text-sm font-bold shadow-sm transition-all focus:outline-none min-w-[210px] justify-between cursor-pointer active:scale-98"
            >
              <div className="flex items-center gap-2 text-slate-700">
                {React.createElement(currentOption.icon, { className: `w-4 h-4 ${currentOption.color}` })}
                <span className="font-bold">{currentOption.label}</span>
              </div>
              <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform duration-200", isDropdownOpen && "rotate-180")} />
            </button>

            <AnimatePresence>
              {isDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 mt-2 w-56 bg-white border border-slate-150 rounded-2xl shadow-xl overflow-hidden py-1.5 focus:outline-none"
                >
                  <div className="px-3 py-1 mb-1 border-b border-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Selecione a Aba
                  </div>
                  {menuOptions.map((opt) => {
                    const isSelected = opt.id === activeTab;
                    const IconComponent = opt.icon;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setActiveTab(opt.id);
                          setIsDropdownOpen(false);
                        }}
                        className={cn(
                          "w-full px-4 py-2.5 text-left text-xs font-semibold flex items-center gap-2.5 transition-all cursor-pointer",
                          isSelected
                            ? "bg-slate-50 text-emerald-700 font-bold border-l-4 border-emerald-500"
                            : "text-slate-600 hover:text-slate-900 hover:bg-slate-50/70 border-l-4 border-transparent"
                        )}
                      >
                        <IconComponent className={`w-4 h-4 ${opt.color}`} />
                        <span className="flex-grow">{opt.label}</span>
                        {isSelected && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-10 h-10 animate-spin text-emerald-600" />
        </div>
      ) : activeTab === 'users' ? (
        <motion.div
           initial={{ opacity: 0, y: 10 }}
           animate={{ opacity: 1, y: 0 }}
           className="space-y-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-slate-400" />
                <span className="text-xs font-black text-slate-900 uppercase">Viewer</span>
              </div>
              <p className="text-[10px] text-slate-500 leading-tight">Visualização básica de escalas e informações. Não pode realizar alterações.</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-xs font-black text-blue-600 uppercase">Manager</span>
              </div>
              <p className="text-[10px] text-slate-500 leading-tight">Gestor operacional. Gerencia aprovações de escalas e atividades rotineiras.</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-purple-500" />
                <span className="text-xs font-black text-purple-600 uppercase">Admin</span>
              </div>
              <p className="text-[10px] text-slate-500 leading-tight">Administrador do sistema. Controla usuários, domínios e permissões gerais.</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-md shadow-emerald-50 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-1">
                <ShieldCheck className="w-3 h-3 text-emerald-200" />
              </div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-black text-emerald-600 uppercase">Master</span>
              </div>
              <p className="text-[10px] text-slate-500 leading-tight">Acesso absoluto e vitalício. Protegido contra exclusão e alterações por outros admins.</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
            <div className="relative flex-grow w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Buscar por nome ou e-mail..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 transition-all text-sm font-medium outline-none"
              />
            </div>
            <button
              onClick={handleExportUsersPDF}
              className="w-full sm:w-auto px-5 py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-sm rounded-2xl transition-all shadow-md shadow-emerald-100 flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              Exportar PDF
            </button>
          </div>

          <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b text-center">
                  <tr>
                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-left">Usuário</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-left">E-mail</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Escala</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Função</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Aprovação</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredUsers.map((user) => (
                  <tr key={user.uid} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3 min-w-[200px]">
                        <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 font-bold shrink-0">
                          {(user.displayName || 'U').charAt(0).toUpperCase()}
                        </div>
                        {editingNameUserId === user.uid ? (
                          <input
                            type="text"
                            value={tempEditName}
                            onChange={(e) => setTempEditName(e.target.value)}
                            onBlur={() => {
                              if (tempEditName.trim() && tempEditName.trim() !== user.displayName) {
                                handleUpdateName(user.uid, tempEditName);
                              }
                              setEditingNameUserId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                if (tempEditName.trim() && tempEditName.trim() !== user.displayName) {
                                  handleUpdateName(user.uid, tempEditName);
                                }
                                setEditingNameUserId(null);
                              } else if (e.key === 'Escape') {
                                setEditingNameUserId(null);
                              }
                            }}
                            autoFocus
                            className="font-bold text-slate-800 bg-white border border-emerald-300 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-emerald-500 w-full min-w-[150px] shrink-0"
                          />
                        ) : (
                          <div 
                            onClick={() => {
                              if (!user.isMaster || isMaster) {
                                setEditingNameUserId(user.uid);
                                setTempEditName(user.displayName);
                              }
                            }}
                            className="group flex flex-col justify-center min-w-0 cursor-pointer select-none"
                            title="Clique para editar o nome"
                          >
                            <span className="font-bold text-slate-800 text-sm truncate block">
                              {user.displayName || 'Sem Nome'}
                            </span>
                            {(!user.isMaster || isMaster) && (
                              <span className="text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                clique para editar
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {editingEmailUserId === user.uid ? (
                        <input
                          type="email"
                          value={tempEditEmail}
                          onChange={(e) => setTempEditEmail(e.target.value)}
                          onBlur={() => {
                            if (tempEditEmail.trim() && tempEditEmail.trim().toLowerCase() !== user.email) {
                              handleUpdateEmail(user.uid, tempEditEmail);
                            }
                            setEditingEmailUserId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              if (tempEditEmail.trim() && tempEditEmail.trim().toLowerCase() !== user.email) {
                                handleUpdateEmail(user.uid, tempEditEmail);
                              }
                              setEditingEmailUserId(null);
                            } else if (e.key === 'Escape') {
                              setEditingEmailUserId(null);
                            }
                          }}
                          autoFocus
                          className="font-mono text-xs text-slate-800 bg-white border border-emerald-300 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-emerald-500 w-full min-w-[200px]"
                        />
                      ) : (
                        <div 
                          onClick={() => {
                            if (!user.isMaster || isMaster) {
                              setEditingEmailUserId(user.uid);
                              setTempEditEmail(user.email || '');
                            }
                          }}
                          className="group flex flex-col justify-center min-w-0 cursor-pointer select-none"
                          title="Clique para editar o e-mail"
                        >
                          <span className="font-mono text-sm text-gray-600 truncate block">
                            {user.email}
                          </span>
                          {(!user.isMaster || isMaster) && (
                            <span className="text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                              clique para editar
                            </span>
                          )}
                        </div>
                      )}
                      <div className="mt-1">
                        {user.mustChangePassword ? (
                          <span className="inline-flex items-center gap-1 text-[9px] font-black text-amber-700 uppercase tracking-wider bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                            🔑 Primeiro Acesso
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[9px] font-black text-emerald-700 uppercase tracking-wider bg-emerald-50 border border-emerald-250 px-2 py-0.5 rounded-md">
                            🛡️ Senha Alterada
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={user.group || ''}
                        onChange={(e) => handleUpdateGroup(user.uid, e.target.value)}
                        className={cn(
                          "text-sm border border-gray-200 rounded-lg px-2 py-1 focus:ring-2 focus:ring-emerald-500 outline-none font-bold",
                          user.group ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-white text-slate-400"
                        )}
                        disabled={user.isMaster && !isMaster}
                      >
                        <option value="">Nenhuma</option>
                        <option value="A">Letra A</option>
                        <option value="B">Letra B</option>
                        <option value="C">Letra C</option>
                        <option value="D">Letra D</option>
                        <option value="E">Letra E</option>
                      </select>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={user.role}
                        onChange={(e) => handleUpdateRole(user.uid, e.target.value as UserRole)}
                        className={cn(
                         "text-sm bg-white border border-gray-200 rounded-lg px-2 py-1 focus:ring-2 focus:ring-emerald-500 outline-none font-bold capitalize",
                         user.role === 'admin' ? "text-purple-600" : user.role === 'manager' ? "text-blue-600" : "text-gray-600"
                        )}
                        disabled={user.isMaster && !isMaster}
                      >
                        <option value="viewer">Viewer</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleUpdateStatus(user.uid, user.status === 'approved' ? 'pending' : 'approved')}
                          disabled={user.isMaster && !isMaster}
                          className={cn(
                            "flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all duration-300 active:scale-95",
                            user.status === 'approved' 
                              ? "text-emerald-600 bg-emerald-50 shadow-inner" 
                              : "text-slate-400 bg-slate-50 opacity-60 hover:opacity-100 hover:bg-emerald-50 hover:text-emerald-500"
                          )}
                        >
                          <div className="relative">
                            <ShieldCheck className={cn("w-6 h-6", user.status === 'approved' ? "fill-emerald-100/50" : "fill-none")} />
                            {user.status !== 'approved' && (
                              <X className="w-3 h-3 absolute -top-1 -right-1 text-rose-500 bg-white rounded-full border border-rose-100 shadow-sm" />
                            )}
                          </div>
                          <span className={cn(
                            "text-[8px] font-black uppercase tracking-widest",
                            user.status === 'approved' ? "text-emerald-700" : "text-slate-500"
                          )}>
                            {user.status === 'approved' ? 'Aprovado' : 'Aprovar'}
                          </span>
                        </button>
                        
                        <button
                          onClick={() => handleToggleEmailVerify(user)}
                          disabled={user.isMaster && !isMaster}
                          className={cn(
                            "flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all duration-300 active:scale-95",
                            (user.isEmailVerifiedOverride || user.emailVerifiedInAuth) 
                              ? "text-emerald-600 bg-emerald-50 shadow-inner" 
                              : "text-slate-400 bg-slate-50 opacity-60 hover:opacity-100 hover:bg-emerald-50 hover:text-emerald-500"
                          )}
                        >
                          <div className="relative">
                            <MailCheck className={cn("w-6 h-6", (user.isEmailVerifiedOverride || user.emailVerifiedInAuth) ? "fill-emerald-100/50" : "fill-none")} />
                            {!(user.isEmailVerifiedOverride || user.emailVerifiedInAuth) && (
                              <X className="w-3 h-3 absolute -top-1 -right-1 text-rose-500 bg-white rounded-full border border-rose-100 shadow-sm" />
                            )}
                          </div>
                          <span className={cn(
                            "text-[8px] font-black uppercase tracking-widest",
                            (user.isEmailVerifiedOverride || user.emailVerifiedInAuth) ? "text-emerald-700" : "text-slate-500"
                          )}>
                            {(user.isEmailVerifiedOverride || user.emailVerifiedInAuth) ? 'Validado' : 'Validar'}
                          </span>
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleUpdateStatus(user.uid, user.status === 'blocked' ? 'approved' : 'blocked')}
                          title={user.status === 'blocked' ? "Bloqueado" : "Ativo"}
                          className={cn(
                            "flex flex-col items-center gap-1 transition-all duration-200 active:scale-90",
                            user.status === 'blocked' ? "text-rose-600 scale-110" : "text-emerald-500 hover:text-rose-400"
                          )}
                          disabled={user.isMaster && !isMaster}
                        >
                          <Ban className={cn("w-7 h-7", user.status === 'blocked' ? "fill-rose-50" : "fill-emerald-50")} />
                          <span className={cn("text-[7px] font-black uppercase tracking-tighter", user.status === 'blocked' ? "text-rose-600" : "text-emerald-600")}>
                            {user.status === 'blocked' ? 'Bloqueado' : 'Liberado'}
                          </span>
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleDeleteUser(user.uid, user.email)}
                          disabled={(user.isMaster && !isMaster) || deletingUserId === user.uid}
                          title="Excluir Perfil"
                          className={cn(
                            "p-2 rounded-xl transition-all",
                            deletingUserId === user.uid ? "text-emerald-500 animate-pulse" : "text-rose-300 hover:text-rose-600 hover:bg-rose-50"
                          )}
                        >
                          {deletingUserId === user.uid ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <Trash2 className="w-5 h-5" />
                          )}
                        </button>

                        <button
                          onClick={() => handleSendCustomVerification(user)}
                          disabled={sendingEmailId === user.uid}
                          title="Enviar E-mail de Boas-vindas (Gmail)"
                          className={cn(
                            "p-2 rounded-xl transition-all",
                            sendingEmailId === user.uid ? "text-blue-500 animate-pulse" : "text-blue-300 hover:text-blue-600 hover:bg-blue-50"
                          )}
                        >
                          {sendingEmailId === user.uid ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <Mail className="w-5 h-5" />
                          )}
                        </button>

                        <button
                          onClick={() => {
                            setUserToResetPassword({
                              id: user.uid,
                              email: user.email || '',
                              displayName: user.displayName || ''
                            });
                            setNewPasswordValue('Mudarsenha123');
                          }}
                          title="Resetar Senha Individual"
                          className="p-2 rounded-xl transition-all text-amber-500 hover:text-amber-700 hover:bg-amber-50"
                        >
                          <Key className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>
    ) : activeTab === 'domains' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
           <motion.div 
             initial={{ opacity: 0, x: -20 }}
             animate={{ opacity: 1, x: 0 }}
             className="md:col-span-1 space-y-6"
           >
              <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900 mb-4 tracking-tight">Adicionar Domínio</h3>
                <form onSubmit={handleAddDomain} className="space-y-4">
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 transition-colors group-focus-within:text-emerald-500" />
                    <input
                      type="text"
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 transition-all text-sm font-bold outline-none"
                      placeholder="ex: @empresa.com"
                      value={newDomain}
                      onChange={(e) => {
                        let val = e.target.value;
                        if (val && !val.startsWith('@') && val.length > 0) {
                          val = '@' + val;
                        }
                        setNewDomain(val);
                      }}
                    />
                  </div>
                  <button
                    disabled={domainLoading || !newDomain || newDomain === '@'}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-2xl transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {domainLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                    Cadastrar Domínio
                  </button>
                </form>
                <div className="mt-6 text-[10px] text-gray-500 flex items-start gap-2 bg-emerald-50/50 p-4 rounded-xl border border-emerald-100/50 leading-relaxed font-medium">
                  <ShieldCheck className="w-4 h-4 flex-shrink-0 text-emerald-600" />
                  <span>Use o formato <strong className="text-emerald-700">@dominio.com</strong>. Somente e-mails que terminarem exatamente com este padrão poderão acessar o aplicativo.</span>
                </div>
              </div>
           </motion.div>

           <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="md:col-span-2"
           >
              <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Domínio</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Adicionado em</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {domains.map((dom) => (
                      <tr key={dom.id} className="hover:bg-gray-50/50 group transition-all">
                        <td className="px-6 py-4">
                          {editingDomain?.id === dom.id ? (
                            <div className="flex items-center gap-2">
                              <input
                                autoFocus
                                type="text"
                                value={editingDomain.value}
                                onChange={(e) => setEditingDomain({ ...editingDomain, value: e.target.value })}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleUpdateDomain(dom.id, editingDomain.value);
                                  if (e.key === 'Escape') setEditingDomain(null);
                                }}
                                className="bg-white border border-emerald-500 rounded-lg px-2 py-1 text-sm font-bold text-emerald-700 outline-none w-full"
                              />
                              <button onClick={() => handleUpdateDomain(dom.id, editingDomain.value)} className="text-emerald-600 hover:bg-emerald-50 p-1 rounded">
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                              <button onClick={() => setEditingDomain(null)} className="text-slate-400 hover:bg-slate-50 p-1 rounded">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <span className="font-bold text-slate-800 flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-emerald-500" />
                              {dom.domain}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-tighter">
                          {safeToDate(dom.createdAt)?.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              disabled={domainLoading || deletingId !== null}
                              onClick={() => setEditingDomain({ id: dom.id, value: dom.domain })}
                              className="p-2 text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all disabled:opacity-30"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setShowConfirmDelete({ id: dom.id, name: dom.domain })}
                              disabled={deletingId === dom.id || domainLoading}
                              className={cn(
                                "p-2 rounded-xl transition-all disabled:opacity-50",
                                deletingId === dom.id ? "text-emerald-500" : "text-slate-300 hover:text-red-600 hover:bg-red-50"
                              )}
                            >
                              {deletingId === dom.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {domains.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-6 py-12 text-center text-gray-500">
                          Nenhum domínio cadastrado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
         </div>
      ) : activeTab === 'modules' ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm"
        >
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Módulos Ativos do Sistema</h2>
            <p className="text-sm text-slate-500 mt-1 font-semibold">Habilite ou desabilite os módulos do aplicativo. Módulos desabilitados não aparecerão no menu principal de navegação para nenhum usuário.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { id: 'overview', label: 'Overview', desc: 'Módulo de Visão Geral em tempo real de todas as frentes de trabalho da fábrica.', icon: 'Activity' },
              { id: 'dashboard', label: 'Dashboard / Analytics', desc: 'Painel analítico centralizado com gráficos e indicadores de desempenho (Analytics Center).', icon: 'LayoutDashboard' },
              { id: 'shift_handover', label: 'Passagem de Turno', desc: 'Módulo de passagem de turno com controle de ocorrências, observações e destaques do turno.', icon: 'ClipboardList' },
              { id: 'dds', label: 'DDS Online', desc: 'Módulo de Diálogo Diário de Segurança com assinaturas e confirmação de presença.', icon: 'ShieldCheck' },
              { id: 'forklifts', label: 'Empilhadeiras', desc: 'Controle de checklists e inspeções de segurança de empilhadeiras em tempo real.', icon: 'Truck' },
              { id: 'wires', label: 'Módulo de Arames', desc: 'Controle de estoque, recebimento de bobinas e consumo de arames no processo.', icon: 'Factory' },
              { id: 'quality', label: 'Qualidade de Processo', desc: 'Checklists de conformidade de processo, controle de não conformidades e rejeitos.', icon: 'ClipboardCheck' },
              { id: 'schedule', label: 'Escala de Turno', desc: 'Gestão de escalas de folgas e times operacionais.', icon: 'CalendarDays' },
              { id: 'operational_routes', label: 'Rotas Operacionais', desc: 'Criação de modelos de rota, inspeção de equipamentos com anexo de fotos e geração de observações.', icon: 'Activity' },
              { id: 'safety_observations', label: 'Observação de Segurança', desc: 'Mecanismo para que operadores possam reportar desvios de segurança e condições inseguras.', icon: 'ShieldAlert' },
              { id: 'consumables', label: 'Controle de Insumos', desc: 'Controle de estoque, entrada de produtos por unidade de medida e consumo de insumos (como tinta) por setor e linha.', icon: 'PackagePlus' },
              { id: 'certificates', label: 'Treinamentos/Certificados', desc: 'Módulo de treinamentos de Secagem para emissão e controle de certificados de qualificação e presença.', icon: 'Award' },
              { id: 'stops_control', label: 'Controle de Parada', desc: 'Módulo de controle de paradas (programadas ou gerais) com registro de frentes de trabalho (mecânica, elétrica, hidráulica, etc.) e estatísticas.', icon: 'Clock' },
            ].map((mod) => {
              const isEnabled = activeModules[mod.id] !== false;
              return (
                <div 
                  key={mod.id} 
                  className={cn(
                    "p-6 rounded-md bg-white border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm",
                    isEnabled 
                      ? "bg-slate-50 border-emerald-100 hover:border-emerald-200" 
                      : "bg-slate-50 border-slate-100 hover:border-slate-200"
                  )}
                >
                  <div className="space-y-1 max-w-md">
                    <div className="flex items-center gap-2">
                      <div className={cn("w-2 h-2 rounded-full", isEnabled ? "bg-emerald-500 animate-pulse" : "bg-slate-300")} />
                      <h3 className="font-bold text-slate-800 text-base">{mod.label}</h3>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed font-semibold">{mod.desc}</p>
                  </div>

                  <button
                    onClick={() => handleToggleModule(mod.id)}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-sm active:scale-95 whitespace-nowrap",
                      isEnabled
                        ? "bg-emerald-600 text-white hover:bg-emerald-700"
                        : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                    )}
                  >
                    {isEnabled ? 'Habilitado' : 'Desabilitado'}
                  </button>
                </div>
              );
            })}
          </div>
        </motion.div>
      ) : activeTab === 'branding' ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-50 space-y-8"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6">
            <div>
              <h2 className="text-2xl font-black text-emerald-800 tracking-tight flex items-center gap-3">
                <Palette className="w-8 h-8 text-emerald-600" />
                Identidade Visual da Empresa
              </h2>
              <p className="text-sm text-slate-500 mt-2 font-semibold max-w-2xl">
                Altere o logotipo oficial do sistema em tempo real sem precisar mexer em códigos. As alterações afetam todas as telas do aplicativo, a barra de navegação/abas e o ícone de instalação em celulares (PWA).
              </p>
            </div>
            {customLogoBase64 && (
              <button
                onClick={() => {
                  setCustomLogoBase64(null);
                  setSuccess('Ajustes descartados. Mostrando logotipo atual.');
                }}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 bg-slate-100/80 hover:bg-slate-200/80 rounded-xl transition-all"
              >
                Descartar rascunho
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Lado Esquerdo: Área de Upload */}
            <div className="space-y-6">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <Upload className="w-5 h-5 text-emerald-600" />
                Fazer Upload do Novo Logotipo
              </h3>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setBrandingDragActive(true);
                }}
                onDragLeave={() => setBrandingDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setBrandingDragActive(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      const img = new Image();
                      img.onload = () => {
                        const canvas = document.createElement('canvas');
                        const MAX_SIZE = 400;
                        let width = img.width;
                        let height = img.height;
                        if (width > height) {
                          if (width > MAX_SIZE) {
                            height *= MAX_SIZE / width;
                            width = MAX_SIZE;
                          }
                        } else {
                          if (height > MAX_SIZE) {
                            width *= MAX_SIZE / height;
                            height = MAX_SIZE;
                          }
                        }
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                          ctx.drawImage(img, 0, 0, width, height);
                          const base64Str = canvas.toDataURL('image/png', 0.9);
                          setCustomLogoBase64(base64Str);
                          setSuccess('Pré-visualização do novo logotipo carregada!');
                        }
                      };
                      img.src = event.target?.result as string;
                    };
                    reader.readAsDataURL(file);
                  }
                }}
                className={cn(
                  "border-2 border-dashed rounded-[2rem] p-8 text-center flex flex-col items-center justify-center transition-all cursor-pointer min-h-[200px]",
                  brandingDragActive 
                    ? "border-emerald-500 bg-emerald-50/50" 
                    : "border-slate-200 hover:border-slate-300 bg-slate-50/50 hover:bg-slate-50"
                )}
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*';
                  input.onchange = (e: any) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        const img = new Image();
                        img.onload = () => {
                          const canvas = document.createElement('canvas');
                          const MAX_SIZE = 400;
                          let width = img.width;
                          let height = img.height;
                          if (width > height) {
                            if (width > MAX_SIZE) {
                              height *= MAX_SIZE / width;
                              width = MAX_SIZE;
                            }
                          } else {
                            if (height > MAX_SIZE) {
                              width *= MAX_SIZE / height;
                              height = MAX_SIZE;
                            }
                          }
                          canvas.width = width;
                          canvas.height = height;
                          const ctx = canvas.getContext('2d');
                          if (ctx) {
                            ctx.drawImage(img, 0, 0, width, height);
                            const base64Str = canvas.toDataURL('image/png', 0.9);
                            setCustomLogoBase64(base64Str);
                            setSuccess('Pré-visualização do novo logotipo carregada!');
                          }
                        };
                        img.src = event.target?.result as string;
                      };
                      reader.readAsDataURL(file);
                    }
                  };
                  input.click();
                }}
              >
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center border border-slate-100 shadow-sm text-slate-400 mb-4">
                  <Upload className="w-6 h-6 text-slate-500" />
                </div>
                <p className="font-bold text-slate-700 text-sm">Arraste a imagem ou clique para selecionar</p>
                <p className="text-slate-400 text-xs mt-1 font-semibold">Formatos recomendados: PNG ou JPEG (máximo 5MB)</p>
                <p className="text-slate-400 text-[10px] mt-1 italic font-semibold">A imagem será otimizada automaticamente pela plataforma para um tamanho super leve.</p>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={async () => {
                    if (!customLogoBase64) return;
                    setSaveBrandingLoading(true);
                    try {
                      await updateCompanyLogo(customLogoBase64);
                      setSuccess('Logotipo atualizado e sincronizado com sucesso!');
                      setCustomLogoBase64(null);
                    } catch (err) {
                      setError('Falha ao gravar novo logotipo.');
                    } finally {
                      setSaveBrandingLoading(false);
                    }
                  }}
                  disabled={!customLogoBase64 || saveBrandingLoading}
                  className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-emerald-100 disabled:opacity-45 disabled:shadow-none flex items-center justify-center gap-2 cursor-pointer text-xs uppercase"
                >
                  {saveBrandingLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirmar e Sincronizar Novo Logotipo
                </button>

                {logoUrl && (
                  <button
                    onClick={async () => {
                      if (confirm('Tem certeza de que deseja restaurar o logotipo original padrão do sistema?')) {
                        setSaveBrandingLoading(true);
                        try {
                          await updateCompanyLogo(null);
                          setSuccess('Logotipo do sistema restaurado para o padrão original!');
                          setCustomLogoBase64(null);
                        } catch (err) {
                          setError('Falha ao restaurar logotipo.');
                        } finally {
                          setSaveBrandingLoading(false);
                        }
                      }
                    }}
                    disabled={saveBrandingLoading}
                    className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl transition-all flex items-center justify-center gap-2 border border-slate-200 cursor-pointer text-xs uppercase"
                  >
                    Restaurar Padrão
                  </button>
                )}
              </div>
            </div>

            {/* Lado Direito: Pré-visualizações */}
            <div className="bg-slate-50/50 p-6 rounded-3xl border border-slate-200 space-y-6">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-emerald-600" />
                Painel Comparativo de Pré-visualização
              </h3>

              <div className="space-y-4">
                {/* 1. Tamanho Tela Login / Cadastro */}
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Visualização no Login / Registro</span>
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 flex items-center justify-center shadow-inner min-h-[140px]">
                    <img
                      src={customLogoBase64 || logoUrl || "/logo_file/logo_400pixel.png"}
                      className="h-16 w-auto object-contain max-w-full"
                      alt="Logo Login Preview"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* 2. Tamanho Menu de Navegação / Shell */}
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Visualização no Menu / Barra</span>
                    <div className="bg-slate-900 p-4 rounded-2xl flex items-center justify-center min-h-[80px]">
                      <img
                        src={customLogoBase64 || logoUrl || "/logo_file/logo_400pixel.png"}
                        className="h-8 w-auto object-contain max-w-full"
                        alt="Logo Menu Preview"
                      />
                    </div>
                  </div>

                  {/* 3. Tamanho Ícone de Instalação no Celular / Favicon */}
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Visualização no Ícone App (PWA / Celular)</span>
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center justify-center min-h-[80px]">
                      <div className="w-12 h-12 bg-white rounded-xl shadow-md border border-slate-100 overflow-hidden flex items-center justify-center p-1">
                        <img
                          src={customLogoBase64 || logoUrl || "/logo_file/logo_400pixel.png"}
                          className="w-full h-full object-contain"
                          alt="Logo PWA Preview"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      ) : activeTab === 'reset' ? (
        !isSuperMaster ? (
          <div className="p-12 bg-white border border-red-100 rounded-[2rem] shadow-sm text-center">
            <h2 className="text-xl font-bold text-red-600 mb-2">Acesso Negado</h2>
            <p className="text-slate-500">Apenas o usuário master principal (jacksonbjr@gmail.com) tem permissão para visualizar e limpar os dados do sistema.</p>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white p-8 rounded-[2.5rem] border border-red-200 shadow-xl shadow-red-50"
          >
          <div className="mb-8">
            <h2 className="text-2xl font-black text-rose-700 tracking-tight flex items-center gap-3">
              <ShieldAlert className="w-8 h-8 text-rose-600 animate-bounce" />
              Zona Master: Restaurar Banco de Dados
            </h2>
            <p className="text-sm text-slate-500 mt-2 font-semibold">
              Esta é uma ferramenta administrativa de alta segurança que permite limpar completamente todas as informações do banco de dados e recomeçar do zero.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <div className="bg-rose-50/50 p-6 rounded-3xl border border-rose-100 space-y-4">
              <h3 className="font-bold text-rose-800 text-base flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                Coleções que serão apagadas:
              </h3>
              <ul className="text-xs text-slate-600 space-y-2 list-disc pl-5 font-semibold leading-relaxed">
                <li><strong className="text-slate-800">Módulo de Usuários:</strong> Todos os perfis e permissões dos usuários (exceto usuários Master).</li>
                <li><strong className="text-slate-800">Módulo de DDS:</strong> Todas as reuniões criadas, assinaturas digitais e listas de presença.</li>
                <li><strong className="text-slate-800">Módulo de Arames:</strong> Todo o histórico de recebimento de bobinas, lotes, fornecedores e consumo.</li>
                <li><strong className="text-slate-800">Módulo de Qualidade:</strong> Checklists preenchidos, não conformidades, relatórios de desvios e templates.</li>
                <li><strong className="text-slate-800">Módulo de Empilhadeiras:</strong> Todos os checklists de inspeção de segurança e empilhadeiras.</li>
                <li><strong className="text-slate-800">Módulo de Rotas:</strong> Inspeções de rotas operacionais, fotos e anomalias de equipamentos.</li>
                <li><strong className="text-slate-800">Módulo de Observações:</strong> Todos os desvios de segurança reportados por operadores.</li>
                <li><strong className="text-slate-800">Logs de Sistema:</strong> Todos os históricos de acessos e logins.</li>
              </ul>
            </div>

            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 space-y-4 flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-slate-800 text-base">O que NÃO será alterado?</h3>
                <ul className="text-xs text-slate-600 space-y-2 list-disc pl-5 font-semibold mt-3 leading-relaxed">
                  <li>O seu acesso como <strong className="text-emerald-600">usuário Master principal</strong> é mantido intacto. Você não será desconectado.</li>
                  <li>As credenciais de login no Firebase Auth não serão excluídas para evitar quebras de autenticação na API.</li>
                  <li>Os domínios cadastrados serão preservados para manter as regras de liberação de e-mail institucionais.</li>
                </ul>
              </div>

              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 text-[11px] font-bold text-amber-700 leading-normal">
                ⚠️ CUIDADO: Esta ação é definitiva e 100% irreversível. Uma vez confirmada, todos os dados no Firestore serão permanente excluídos e não poderão ser recuperados.
              </div>
            </div>
          </div>

          {/* Limpeza Seletiva por Módulo */}
          <div className="mb-12 border-t border-slate-100 pt-8">
            <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-4 flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-rose-500 animate-pulse" />
              Limpeza Seletiva por Módulo (Tabelas Individuais)
            </h3>
            <p className="text-xs text-slate-500 font-semibold mb-6">
              Selecione o módulo que deseja limpar separadamente. Todos os dados associados às coleções daquele módulo serão excluídos permanentemente, preservando o restante do sistema.
            </p>

            {resetLoading && moduleToReset ? (
              <div className="flex flex-col items-center justify-center py-10 bg-rose-50/50 rounded-3xl border border-rose-100 mb-6">
                <Loader2 className="w-8 h-8 text-rose-600 animate-spin mb-3" />
                <span className="text-xs font-bold text-rose-700 uppercase tracking-widest animate-pulse">
                  {resetProgress || 'Processando Exclusão de Módulo...'}
                </span>
                <span className="text-[10px] text-slate-400 mt-1">Por favor, não feche ou recarregue o aplicativo</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  {
                    id: 'wires',
                    title: 'Arames & Bobinas',
                    collections: ['wire_suppliers', 'wire_batches', 'wire_coils', 'wire_storage_bays', 'monthly_production'],
                    description: 'Apaga todo o histórico de bobinas, lotes de arames, fornecedores, baias e histórico de consumo.'
                  },
                  {
                    id: 'quality_submissions',
                    title: 'Inspeções de Qualidade',
                    collections: ['quality_checklist_submissions', 'quality_checklist_omissions'],
                    description: 'Apaga apenas as fichas de inspeção preenchidas e omissões registradas, mantendo os modelos de checklist intactos.'
                  },
                  {
                    id: 'quality_templates',
                    title: 'Modelos de Checklist (Qualidade)',
                    collections: ['quality_checklist_templates', 'production_lines', 'quality_sectors', 'quality_checklist_options'],
                    description: 'Apaga os templates de checklist de qualidade, linhas de produção, setores e opções de resposta.'
                  },
                  {
                    id: 'route_submissions',
                    title: 'Inspeções de Rotas',
                    collections: ['route_submissions'],
                    description: 'Apaga todas as fichas preenchidas de inspeção de rotas operacionais, mantendo os modelos e rotas.'
                  },
                  {
                    id: 'route_templates',
                    title: 'Modelos de Rotas Operacionais',
                    collections: ['route_templates'],
                    description: 'Apaga os modelos de rotas operacionais e equipamentos cadastrados.'
                  },
                  {
                    id: 'dds',
                    title: 'Diálogos de Segurança (DDS)',
                    collections: ['dds_sessions', 'dds_signatures'],
                    description: 'Remove todas as reuniões de DDS registradas e as assinaturas de presença dos operadores.'
                  },
                  {
                    id: 'forklift_checklists',
                    title: 'Checklists de Empilhadeira',
                    collections: ['forklift_checklists', 'forklift_drafts'],
                    description: 'Apaga apenas os checklists de empilhadeira preenchidos e rascunhos, sem apagar as empilhadeiras em si.'
                  },
                  {
                    id: 'forklifts',
                    title: 'Cadastro de Empilhadeiras',
                    collections: ['forklifts', 'forklift_check_items'],
                    description: 'Exclui o cadastro das empilhadeiras e os itens de inspeção padrões.'
                  },
                  {
                    id: 'users',
                    title: 'Usuários & Perfis',
                    collections: ['users', 'users_public'],
                    description: 'Limpa todos os cadastros e perfis de usuários do sistema, mantendo exclusivamente os acessos Master.'
                  },
                  {
                    id: 'safety',
                    title: 'Observações de Segurança',
                    collections: ['safety_observations', 'safety_categories', 'safety_areas'],
                    description: 'Apaga todas as observações de segurança (desvios) reportadas pelos colaboradores.'
                  },
                  {
                    id: 'courses',
                    title: 'Cursos & Treinamentos',
                    collections: ['training_courses', 'operators'],
                    description: 'Exclui o cadastro de operadores credenciados, cursos e certificados gerados.'
                  },
                  {
                    id: 'logs',
                    title: 'Logs & Notificações',
                    collections: ['user_login_logs', 'notifications'],
                    description: 'Remove todo o histórico de acessos/logins e a fila de notificações enviadas no sistema.'
                  }
                ].map((mod) => (
                  <div 
                    key={mod.id} 
                    className="bg-slate-50 border border-slate-200 p-5 rounded-3xl hover:border-rose-200 hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm mb-1">{mod.title}</h4>
                      <p className="text-[10px] text-slate-500 font-semibold leading-relaxed mb-4">{mod.description}</p>
                    </div>
                    <button
                      type="button"
                      disabled={resetLoading}
                      onClick={() => setModuleToReset(mod)}
                      className="w-full py-2 bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 border border-rose-100 hover:border-rose-200 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Limpar Módulo
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Restauração de Modelos Padrão */}
          <div className="mb-12 border-t border-slate-100 pt-8">
            <h3 className="text-lg font-black text-teal-800 uppercase tracking-tight mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-teal-600" />
              Restaurar Estruturas e Modelos Padrão
            </h3>
            <p className="text-xs text-slate-500 font-semibold mb-6">
              Se você apagou acidentalmente ou deseja reiniciar os modelos originais do sistema (incluindo as Rotas Operacionais, a Inspeção do Secador de Celulose com 100 itens, o Setor de Qualidade e as opções de respostas), utilize a ferramenta abaixo para recriá-los instantaneamente no banco de dados.
            </p>

            {resetLoading && (resetProgress.includes('restaura') || resetProgress.includes('Gerando') || resetProgress.includes('Modelos') || resetProgress.includes('Opções')) ? (
              <div className="flex flex-col items-center justify-center py-10 bg-teal-50/50 rounded-3xl border border-teal-100 mb-6">
                <Loader2 className="w-8 h-8 text-teal-600 animate-spin mb-3" />
                <span className="text-xs font-bold text-teal-700 uppercase tracking-widest animate-pulse">
                  {resetProgress || 'Restaurando Modelos Padrão...'}
                </span>
                <span className="text-[10px] text-slate-400 mt-1">Por favor, não feche ou recarregue o aplicativo</span>
              </div>
            ) : (
              <div className="max-w-md mx-auto bg-slate-50 p-6 rounded-[2rem] border border-slate-200 text-center space-y-4">
                <div className="text-xs text-slate-600 font-semibold leading-relaxed">
                  Esta ação irá verificar as tabelas e recriar os modelos de rotas operacionais e inspeções caso tenham sido removidos, sem alterar ou apagar os preenchimentos já realizados.
                </div>
                <button
                  type="button"
                  disabled={resetLoading}
                  onClick={handleRestoreDefaultTemplates}
                  className="w-full py-4 bg-teal-600 hover:bg-teal-700 text-white font-black rounded-2xl shadow-xl shadow-teal-100 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed uppercase tracking-wider text-xs"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Restaurar Modelos de Rotas e Inspeções
                </button>
              </div>
            )}
          </div>

          {/* Limpeza Geral (Master Reset) */}
          <div className="border-t border-slate-100 pt-8">
            <h3 className="text-lg font-black text-rose-700 uppercase tracking-tight mb-4 text-center">
              Limpeza Geral do Banco de Dados (Master Reset)
            </h3>
            <form onSubmit={handleMasterReset} className="max-w-md mx-auto bg-slate-50 p-6 rounded-[2rem] border border-slate-200 space-y-4">
              <div>
                <label className="block text-xs font-black text-rose-700 uppercase tracking-widest text-center mb-3">
                  Para confirmar, digite exatamente a frase abaixo:
                </label>
                <div className="text-center font-bold text-sm bg-rose-50 text-rose-700 py-2.5 px-4 rounded-xl border border-rose-100 mb-4 select-none">
                  CONFIRMO APAGAR TUDO
                </div>
                <input
                  type="text"
                  required
                  disabled={resetLoading}
                  placeholder="Digite a frase para autorizar..."
                  value={resetConfirmText}
                  onChange={(e) => setResetConfirmText(e.target.value)}
                  className="w-full text-center px-4 py-3 bg-white border border-slate-300 rounded-2xl focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none font-bold placeholder-slate-400 transition-all text-sm uppercase"
                />
              </div>

              {resetLoading && !moduleToReset ? (
                <div className="flex flex-col items-center justify-center py-4 bg-white rounded-2xl border border-slate-100 shadow-inner">
                  <Loader2 className="w-8 h-8 text-rose-600 animate-spin mb-3" />
                  <span className="text-xs font-bold text-rose-700 uppercase tracking-widest animate-pulse">
                    {resetProgress || 'Processando Exclusão...'}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1">Por favor, não feche ou recarregue o aplicativo</span>
                </div>
              ) : (
                <button
                  type="submit"
                  disabled={resetConfirmText.trim().toUpperCase() !== 'CONFIRMO APAGAR TUDO' || resetLoading}
                  className="w-full py-4 bg-rose-600 text-white font-black rounded-2xl hover:bg-rose-700 shadow-xl shadow-rose-200 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none uppercase tracking-wider text-xs"
                >
                  <Trash2 className="w-4 h-4" />
                  Executar Limpeza Geral do Sistema
                </button>
              )}
            </form>
          </div>
        </motion.div>
        )
      ) : activeTab === 'import' ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="space-y-8 bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-50"
        >
          {/* Header section describing the importer */}
          <div className="border-b border-slate-100 pb-6">
            <h2 className="text-2xl font-black text-teal-800 tracking-tight flex items-center gap-3">
              <Upload className="w-8 h-8 text-teal-600" />
              Importador de Dados (CSV)
            </h2>
            <p className="text-sm text-slate-500 mt-2 font-semibold max-w-2xl">
              Área Exclusiva Master: Realize a migração ou carga inicial de dados em massa para qualquer tabela do SecAPP utilizando planilhas do Microsoft Excel ou arquivos padrão .CSV.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left selector/information panel */}
            <div className="lg:col-span-1 space-y-6">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">
                  1. Selecione a Tabela de Destino
                </label>
                <div className="space-y-2">
                  {CSV_TABLES.map((t) => {
                    const isSelected = selectedImportTable === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setSelectedImportTable(t.id);
                          setCsvFile(null);
                          if (csvInputRef.current) csvInputRef.current.value = '';
                        }}
                        className={cn(
                          "w-full text-left p-4 rounded-2xl border transition-all flex items-center justify-between gap-3 cursor-pointer",
                          isSelected
                            ? "bg-teal-50 border-teal-300 text-teal-950 font-bold shadow-sm"
                            : "bg-slate-50 border-slate-100 hover:bg-slate-100/50 hover:border-slate-200 text-slate-700 font-medium"
                        )}
                      >
                        <div className="flex flex-col text-left min-w-0">
                          <span className="text-xs truncate">{t.name}</span>
                          <span className="text-[10px] text-slate-400 font-normal truncate mt-0.5">
                            Coleção: {t.collection}
                          </span>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-teal-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Middle and Right Panel (Import Rules + Upload Zone) */}
            <div className="lg:col-span-2 space-y-6">
              {/* Selected table specification rules */}
              {(() => {
                const currentTable = CSV_TABLES.find(t => t.id === selectedImportTable);
                if (!currentTable) return null;
                return (
                  <div className="bg-slate-50 border border-slate-200 rounded-[2rem] p-6 space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center text-teal-700 shrink-0">
                        <Info className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-sm font-black text-slate-800">{currentTable.name}</h4>
                        <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                          {currentTable.description}
                        </p>
                      </div>
                    </div>

                    <div className="p-4 bg-white border border-slate-100 rounded-2xl space-y-3">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-teal-600 block mb-1">
                          Cabeçalhos Obrigatórios no CSV:
                        </span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {currentTable.headers.map((hdr) => (
                            <code 
                              key={hdr} 
                              className="px-2.5 py-1 bg-slate-100 text-slate-705 rounded-md text-[11px] font-mono font-bold border border-slate-200"
                            >
                              {hdr}
                            </code>
                          ))}
                        </div>
                      </div>

                      <div className="text-[11px] leading-relaxed text-slate-600 space-y-1 mt-2">
                        <p className="font-bold flex items-center gap-1.5 text-slate-800">
                          <span>⚠️ Regras da Coleção:</span>
                        </p>
                        <p className="ml-1 pl-1 border-l-2 border-teal-500 font-semibold">{currentTable.notes}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => downloadImportTemplate(currentTable.id)}
                      className="flex items-center justify-center gap-2 w-full bg-white hover:bg-slate-100 border border-slate-300 hover:border-slate-400 text-slate-705 px-4 py-3 rounded-2xl text-xs font-bold shadow-sm transition-all active:scale-98 cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-emerald-600" />
                      Baixar Modelo Oficial Excel / CSV
                    </button>
                  </div>
                );
              })()}

              <div className="space-y-4">
                {/* Drag & Drop Zone */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      setCsvFile(e.dataTransfer.files[0]);
                    }
                  }}
                  className={cn(
                    "border-2 border-dashed rounded-[2rem] p-8 text-center flex flex-col items-center justify-center transition-all min-h-[160px]",
                    dragActive 
                      ? "border-teal-500 bg-teal-50/50" 
                      : "border-slate-300 hover:border-slate-400 bg-slate-50/20"
                  )}
                >
                  <Upload className="w-10 h-10 text-slate-400 mb-3" />
                  <span className="text-sm font-bold text-slate-700 block mb-1">
                    Arraste seu arquivo CSV para cá ou
                  </span>
                  
                  <input
                    type="file"
                    ref={csvInputRef}
                    accept=".csv"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setCsvFile(e.target.files[0]);
                      }
                    }}
                    className="hidden"
                    id="csv-file-importer"
                  />
                  <label
                    htmlFor="csv-file-importer"
                    className="text-xs text-teal-600 hover:text-teal-700 font-bold underline cursor-pointer hover:font-black transition-all"
                  >
                    Navegue nas pastas do seu computador
                  </label>
                  <span className="text-[10px] text-slate-400 font-semibold block mt-2">
                    Suporta os separadores vírgula (,) e ponto-e-vírgula (;) com codificação UTF-8
                  </span>
                </div>

                {/* Selected File State */}
                {csvFile && (
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex items-center justify-between gap-3 animate-fade-in text-[13px]">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 bg-teal-50 rounded-lg flex items-center justify-center text-teal-600 shrink-0 font-bold text-xs">
                        CSV
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-800 block truncate">{csvFile.name}</span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          {(csvFile.size / 1024).toFixed(1)} KB • Pronto para Importação
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCsvFile(null);
                        if (csvInputRef.current) csvInputRef.current.value = '';
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-100 transition-all cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Import Status Panel */}
                {importing && (
                  <div className="bg-slate-50 border border-slate-200 p-6 rounded-[2rem] space-y-4">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-bold text-teal-700 animate-pulse uppercase tracking-wider">
                        Processando Importação: {importProgress.current} de {importProgress.total} registros
                      </span>
                      <span className="font-black text-slate-600">
                        {importProgress.total > 0 ? Math.round((importProgress.current / importProgress.total) * 100) : 0}%
                      </span>
                    </div>

                    {/* Progress bar container */}
                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-teal-600 transition-all duration-150"
                        style={{ width: `${importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0}%` }}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-center">
                      <div className="p-3 bg-white border border-slate-100 rounded-xl">
                        <span className="text-[10px] font-black uppercase text-slate-400 block">Importações com Sucesso</span>
                        <span className="text-lg font-black text-emerald-600 mt-1 block">{importProgress.successes}</span>
                      </div>
                      <div className="p-3 bg-white border border-slate-100 rounded-xl">
                        <span className="text-[10px] font-black uppercase text-slate-400 block font-mono">Falhas de Linha</span>
                        <span className="text-lg font-black text-red-500 mt-1 block">{importProgress.errors.length}</span>
                      </div>
                    </div>

                    {/* Log details wrapper */}
                    {importProgress.errors.length > 0 && (
                      <div className="bg-red-50 border border-red-100 p-4 rounded-2xl space-y-2">
                        <h5 className="text-[10px] font-black text-red-700 uppercase tracking-widest flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 shrink-0" /> Detalhes dos Erros Encontrados:
                        </h5>
                        <div className="max-h-[150px] overflow-y-auto text-[11px] font-mono text-slate-600 space-y-1.5 font-semibold scrollbar-sin">
                          {importProgress.errors.map((err, errIdx) => (
                            <div key={errIdx} className="p-1 hover:bg-red-50/50 rounded flex items-start gap-1">
                              <span className="text-red-500 shrink-0">•</span>
                              <span>{err}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {!importing && csvFile && (
                  <button
                    type="button"
                    onClick={handleCSVImport}
                    className="w-full py-4 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-2xl shadow-xl shadow-teal-100 transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer uppercase tracking-wider text-xs"
                  >
                    <Upload className="w-4 h-4" />
                    Iniciar Importação para o Banco de Dados
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      ) : (
        <motion.div
           initial={{ opacity: 0, y: 10 }}
           animate={{ opacity: 1, y: 0 }}
           className="space-y-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <History className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Registros Totais</span>
                <span className="text-2xl font-black text-slate-800">{loginLogs.length}</span>
              </div>
            </div>
            
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Usuários Ativos</span>
                <span className="text-2xl font-black text-slate-800">
                  {new Set(loginLogs.map(l => l.email)).size}
                </span>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 font-bold">
                PR
              </div>
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Fuso Horário Supervisor</span>
                <span className="text-sm font-black text-purple-700 leading-tight block mt-1 uppercase tracking-tight">
                  {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} ({Intl.DateTimeFormat().resolvedOptions().timeZone})
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
            <div className="relative w-full md:max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Filtrar por nome ou e-mail de acesso..."
                value={logsSearchTerm}
                onChange={(e) => setLogsSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 transition-all text-sm font-medium outline-none"
              />
            </div>
            {isMaster && (
              <button
                type="button"
                onClick={handleDeleteAllLoginLogs}
                disabled={logsLoading}
                className="w-full md:w-auto px-5 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs uppercase tracking-wider rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 hover:shadow-lg hover:shadow-rose-100 shrink-0"
              >
                <Trash2 className="w-4 h-4" />
                Limpar Todos os Logs (Geral)
              </button>
            )}
          </div>

          <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden">
            {logsLoading ? (
              <div className="flex flex-col items-center justify-center py-24">
                <Loader2 className="w-10 h-10 animate-spin text-emerald-600 mb-4" />
                <span className="text-slate-500 text-sm font-bold">Carregando logs do sistema...</span>
              </div>
            ) : (
              <div className="overflow-x-auto text-[13px]">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 border-b text-center">
                    <tr>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-left">Usuário</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-left">E-mail</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-left">Dispositivo / Navegador</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Data/Horário Local</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Horário Servidor (UTC)</th>
                      {isMaster && (
                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Ações</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {loginLogs
                      .filter(log => {
                        const term = logsSearchTerm.toLowerCase();
                        return (log.displayName?.toLowerCase().includes(term) || 
                                log.email?.toLowerCase().includes(term));
                      })
                      .map((log) => {
                        const dateObj = safeToDate(log.timestamp);
                        return (
                          <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-4 text-left">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 font-bold shrink-0 text-xs">
                                  {log.displayName?.charAt(0) || 'U'}
                                </div>
                                <span className="font-bold text-slate-800">{log.displayName}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600 font-mono text-left">{log.email}</td>
                            <td className="px-6 py-4 text-slate-700 font-medium text-left">
                              {formatUserAgent(log.userAgent)}
                            </td>
                            <td className="px-6 py-4 text-emerald-600 font-bold text-center">
                              {dateObj ? dateObj.toLocaleString('pt-BR') : log.localTimeStr || 'N/A'}
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-400 font-mono text-right">
                              {dateObj ? dateObj.toISOString() : 'Aguardando sync'}
                            </td>
                            {isMaster && (
                              <td className="px-6 py-4 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteIndividualLog(log.id)}
                                  disabled={logsLoading}
                                  title="Excluir este log"
                                  className="p-1.5 hover:bg-rose-50 text-rose-500 hover:text-rose-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    {loginLogs.filter(log => {
                      const term = logsSearchTerm.toLowerCase();
                      return (log.displayName?.toLowerCase().includes(term) || 
                              log.email?.toLowerCase().includes(term));
                    }).length === 0 && (
                      <tr>
                        <td colSpan={isMaster ? 6 : 5} className="px-6 py-12 text-center text-gray-500">
                          Nenhum registro de acesso encontrado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </motion.div>
      )}

      <AnimatePresence>
        {showConfirmDelete && (
          <div key="confirm-delete-domain" className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConfirmDelete(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[2rem] shadow-2xl p-8 border border-white/20"
            >
              <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500 mb-6 mx-auto">
                <ShieldAlert className="w-8 h-8" />
              </div>
              
              <h3 className="text-xl font-bold text-slate-900 text-center mb-2">Excluir Domínio?</h3>
              <p className="text-slate-500 text-center text-sm mb-8 leading-relaxed">
                Tem certeza que deseja remover <strong className="text-slate-900">{showConfirmDelete.name}</strong>?<br/>
                Isso pode bloquear o acesso de usuários com este e-mail.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setShowConfirmDelete(null)}
                  className="px-4 py-3 text-sm font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteDomain}
                  className="px-4 py-3 text-sm font-bold bg-rose-600 text-white hover:bg-rose-700 rounded-xl shadow-lg shadow-rose-200 transition-all active:scale-95"
                >
                  Confirmar Exclusão
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {isAddUserOpen && (
          <div key="add-user-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !addUserLoading && setIsAddUserOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-8 border border-slate-100"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
                    <UserPlus className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">Cadastrar Usuário</h3>
                </div>
                <button
                  onClick={() => setIsAddUserOpen(false)}
                  disabled={addUserLoading}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Nome Completo</label>
                  <input
                    required
                    type="text"
                    value={newUser.name}
                    onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium transition-all"
                    placeholder="João Silva"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">E-mail</label>
                  <input
                    required
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                    className={cn(
                      "w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium transition-all",
                      newUser.email && !domains.some(d => newUser.email.toLowerCase().endsWith(d.domain.replace('@', ''))) && "border-amber-300 bg-amber-50"
                    )}
                    placeholder="exemplo@email.com"
                  />
                  {newUser.email && newUser.email.includes('@') && !domains.some(d => newUser.email.toLowerCase().endsWith(d.domain.replace('@', ''))) && (
                    <p className="mt-1 text-[10px] text-amber-600 font-bold flex items-center gap-1 uppercase tracking-tight ml-1">
                      <AlertTriangle className="w-3 h-3" /> Domínio não cadastrado
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Função Inicial</label>
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser({...newUser, role: e.target.value as UserRole})}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold transition-all"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl text-xs text-amber-700 space-y-1">
                  <p className="font-bold">Informações Importantes:</p>
                  <ul className="list-disc ml-4 space-y-1">
                    <li>Senha padrão: <span className="font-black">Mudarsenha123</span></li>
                    <li>O usuário será obrigado a trocar a senha no primeiro acesso.</li>
                    <li>O e-mail não precisará de verificação imediata para o primeiro acesso.</li>
                  </ul>
                </div>

                <button
                  type="submit"
                  disabled={addUserLoading}
                  className="w-full py-4 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 shadow-xl shadow-emerald-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {addUserLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
                  Cadastrar Usuário
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {error && (
          <motion.div
            key="error-toast"
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className="fixed bottom-10 left-1/2 bg-rose-500 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-3 z-50 max-w-[90vw] md:max-w-2xl"
          >
            <ShieldAlert className="w-6 h-6 shrink-0" />
            <span className="font-bold text-sm whitespace-pre-line text-left flex-1">{error}</span>
            <button onClick={() => setError('')} className="ml-auto hover:bg-white/20 p-1 rounded shrink-0">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}

        {success && (
          <motion.div
            key="success-toast"
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className="fixed bottom-10 left-1/2 bg-emerald-500 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-3 z-50 min-w-[300px]"
          >
            <CheckCircle2 className="w-6 h-6" />
            <span className="font-bold">{success}</span>
            <button onClick={() => setSuccess('')} className="ml-auto hover:bg-white/20 p-1 rounded">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}

        <ConfirmationModal
          key="delete-user-modal"
          isOpen={!!userToDelete}
          onClose={() => setUserToDelete(null)}
          title="Excluir Usuário?"
          message={`Tem certeza que deseja excluir permanentemente o usuário ${userToDelete?.email || ''}? Esta ação removerá completamente o perfil do banco de dados (Firestore) e as credenciais de acesso no sistema (Firebase Auth) de forma definitiva.`}
          type="warning"
          confirmText="Excluir"
          showConfirmButton={true}
          onConfirm={() => {
            if (userToDelete) {
              handleDeleteUser(userToDelete.id, userToDelete.email, true);
            }
          }}
        />

        <ConfirmationModal
          key="reset-module-modal"
          isOpen={!!moduleToReset}
          onClose={() => setModuleToReset(null)}
          title={`Limpar Módulo: ${moduleToReset?.title}?`}
          message={`Tem certeza que deseja excluir permanentemente todos os dados associados ao módulo "${moduleToReset?.title || ''}"? Esta ação é definitiva, limpará todas as tabelas listadas e é 100% irreversível.`}
          type="warning"
          confirmText="Limpar Módulo"
          showConfirmButton={true}
          onConfirm={() => {
            if (moduleToReset) {
              handleModuleReset(moduleToReset.id, moduleToReset.collections);
            }
          }}
        />

        {userToResetPassword && (
          <div key="reset-password-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setUserToResetPassword(null)}
            />
            
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[2rem] shadow-2xl overflow-hidden z-10 border border-slate-100"
            >
              <div className="p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2.5 bg-amber-50 rounded-xl text-amber-500">
                    <Key className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900 tracking-tight leading-none mb-1">
                      Resetar Senha
                    </h3>
                    <p className="text-xs text-slate-500 font-medium leading-none">
                      {userToResetPassword.displayName || 'Sem Nome'}
                    </p>
                  </div>
                </div>

                <div className="text-[11px] font-mono text-slate-400 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100/50 mb-4 truncate text-center">
                  {userToResetPassword.email}
                </div>

                <div className="space-y-3.5">
                  {/* Opção Principal: E-mail */}
                  <button
                    type="button"
                    disabled={emailResetLoading}
                    onClick={handleSendPasswordResetEmail}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-xl shadow-md shadow-emerald-600/10 transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-xs"
                  >
                    {emailResetLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Mail className="w-4 h-4" />
                        Enviar E-mail de Recuperação
                      </>
                    )}
                  </button>

                  <div className="relative flex py-0.5 items-center">
                    <div className="flex-grow border-t border-slate-100"></div>
                    <span className="flex-shrink mx-3 text-[9px] text-slate-300 font-bold uppercase tracking-wider">ou</span>
                    <div className="flex-grow border-t border-slate-100"></div>
                  </div>

                  {/* Opção Secundária: Manual */}
                  <form onSubmit={handleResetUserPassword} className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        value={newPasswordValue}
                        onChange={(e) => setNewPasswordValue(e.target.value)}
                        placeholder="Senha temporária"
                        className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-xs font-bold outline-none focus:bg-white focus:ring-1 focus:ring-amber-500 focus:border-transparent transition-all"
                      />
                      <button
                        type="submit"
                        disabled={passwordResetLoading}
                        className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-bold rounded-xl shadow-md shadow-amber-500/10 transition-all flex items-center justify-center gap-1 disabled:opacity-50 text-xs whitespace-nowrap"
                      >
                        {passwordResetLoading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          "Forçar Senha"
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setUserToResetPassword(null)}
                className="absolute top-5 right-5 p-2 text-slate-300 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Admin;
