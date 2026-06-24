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
  Check
} from 'lucide-react';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, updateProfile, sendEmailVerification } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { motion, AnimatePresence } from 'motion/react';
import { cn, safeToDate } from '../lib/utils';
import { validateEmailDomain } from '../lib/domainUtils';
import { ConfirmationModal } from '../components/ui/ConfirmationModal';

const Admin: React.FC = () => {
  const { isAdmin, isMaster, logoUrl, updateCompanyLogo } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [editingNameUserId, setEditingNameUserId] = useState<string | null>(null);
  const [tempEditName, setTempEditName] = useState('');
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
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'viewer' as UserRole });
  const [addUserLoading, setAddUserLoading] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);

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
            const dataToInsert = tableDef.processRow(mappedRow);
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
      
      const usersList = usersSnap.docs
        .map(doc => {
          const data = doc.data() as any;
          const decryptedEmail = decryptValue(data.email);
          const decryptedDisplayName = decryptValue(data.displayName);
          const isUserMaster = MASTER_EMAILS.includes(decryptedEmail?.toLowerCase() || '');
          return { 
            uid: doc.id, 
            ...data, 
            email: decryptedEmail,
            displayName: decryptedDisplayName,
            isMaster: isUserMaster 
          } as UserProfile;
        })
        .filter(user => !user.isMaster);
      setUsers(usersList);
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
    const tempApp = initializeApp(firebaseConfig, tempAppName);
    const tempAuth = getAuth(tempApp);
    const defaultPassword = 'Mudar@123';

    try {
      // 1. Create Auth User in secondary app to avoid logging out admin
      const { user } = await createUserWithEmailAndPassword(tempAuth, newUser.email, defaultPassword);
      await updateProfile(user, { displayName: newUser.name });

      // 2. Send Custom Welcome Email via Gmail API (instead of direct Firebase email)
      try {
        await fetch('/api/send-custom-auth-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
      await setDoc(doc(db, 'users', user.uid), {
        email: encryptValue(addedUserEmail),
        emailHash: hashEmailForSearch(addedUserEmail),
        displayName: encryptValue(newUser.name),
        role: newUser.role,
        status: 'approved',
        mustChangePassword: true,
        emailVerifiedInAuth: false,
        isMaster: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      setSuccess(`Usuário criado com sucesso! Senha padrão: ${defaultPassword}`);
      setIsAddUserOpen(false);
      setNewUser({ name: '', email: '', role: 'viewer' });
      fetchData();
    } catch (err: any) {
      console.error(err);
      const isEmailInUse = err?.code === 'auth/email-already-in-use' || 
                           err?.message?.includes('auth/email-already-in-use') || 
                           err?.message?.includes('email-already-in-use') ||
                           String(err)?.includes('email-already-in-use');

      if (isEmailInUse) {
        // Check if user exists in Firestore
        try {
          const checkEmailLower = newUser.email.toLowerCase().trim();
          const userSnap = await getDocs(query(collection(db, 'users'), where('emailHash', '==', hashEmailForSearch(checkEmailLower))));
          if (userSnap.empty) {
            // Recreate profile for existing Auth user!
            try {
              const res = await fetch('/api/admin/get-auth-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: newUser.email })
              });
              const data = await res.json();
              if (data.success && data.uid) {
                // Yes, we got the UID! Now let's create the Firestore user profile
                await setDoc(doc(db, 'users', data.uid), {
                  email: encryptValue(checkEmailLower),
                  emailHash: hashEmailForSearch(checkEmailLower),
                  displayName: encryptValue(newUser.name || data.displayName || 'Usuário'),
                  role: newUser.role,
                  status: 'approved',
                  mustChangePassword: false, // Keep existing password
                  emailVerifiedInAuth: true,
                  isMaster: false,
                  createdAt: serverTimestamp(),
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
      } else {
        setError(err.message || 'Erro ao criar usuário. Tente novamente.');
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
      await updateDoc(doc(db, 'users', userId), { 
        displayName: newName.trim(),
        updatedAt: serverTimestamp()
      });
      setUsers(users.map(u => u.uid === userId ? { ...u, displayName: newName.trim() } : u));
      setSuccess('Nome atualizado com sucesso!');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
      setError('Erro ao atualizar nome.');
    }
  };

  const handleUpdateRole = async (userId: string, newRole: UserRole) => {
    try {
      await updateDoc(doc(db, 'users', userId), { 
        role: newRole,
        updatedAt: serverTimestamp()
      });
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
    if (!isMaster) return;

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

      await deleteCollectionDocs('users', (docSnap) => {
        const data = docSnap.data();
        const email = (data.email || '').toLowerCase().trim();
        return !MASTER_EMAILS.includes(email);
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
      console.log(`[Admin] Deleting user profile: ${userId} (${userEmail})`);
      await deleteDoc(doc(db, 'users', userId));
      setUsers(prev => prev.filter(u => u.uid !== userId));
      setSuccess('Usuário removido do sistema.');
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
      // We call our server API to send a custom email using secagemapp@gmail.com
      const res = await fetch('/api/send-custom-auth-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'verification',
          email: user.email,
          name: user.displayName,
          userId: user.uid
        })
      });
      
      const data = await res.json();
      if (data.success) {
        setSuccess(`E-mail de boas-vindas/instruções enviado para ${user.email} via secagemapp@gmail.com`);
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
      { id: 'reset' as const, label: 'Reset Sistema', icon: ShieldAlert, color: 'text-rose-600' }
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

          <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
            <div className="relative w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Buscar por nome ou e-mail..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 transition-all text-sm font-medium outline-none"
              />
            </div>
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
                    <td className="px-6 py-4 text-sm text-gray-600 font-mono">{user.email}</td>
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

            {resetLoading ? (
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
                disabled={resetConfirmText.trim().toUpperCase() !== 'CONFIRMO APAGAR TUDO'}
                className="w-full py-4 bg-rose-600 text-white font-black rounded-2xl hover:bg-rose-700 shadow-xl shadow-rose-200 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none uppercase tracking-wider text-xs"
              >
                <Trash2 className="w-4 h-4" />
                Executar Limpeza Geral do Sistema
              </button>
            )}
          </form>
        </motion.div>
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
            <div className="relative w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Filtrar por nome ou e-mail de acesso..."
                value={logsSearchTerm}
                onChange={(e) => setLogsSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 transition-all text-sm font-medium outline-none"
              />
            </div>
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
                          </tr>
                        );
                      })}
                    {loginLogs.filter(log => {
                      const term = logsSearchTerm.toLowerCase();
                      return (log.displayName?.toLowerCase().includes(term) || 
                              log.email?.toLowerCase().includes(term));
                    }).length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
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
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
                    <li>Senha padrão: <span className="font-black">Mudar@123</span></li>
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
            className="fixed bottom-10 left-1/2 bg-rose-500 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-3 z-50 min-w-[300px]"
          >
            <ShieldAlert className="w-6 h-6" />
            <span className="font-bold">{error}</span>
            <button onClick={() => setError('')} className="ml-auto hover:bg-white/20 p-1 rounded">
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
          isOpen={!!userToDelete}
          onClose={() => setUserToDelete(null)}
          title="Excluir Perfil?"
          message={`Tem certeza que deseja excluir permanentemente o perfil de ${userToDelete?.email || ''}? Esta ação NÃO removerá a conta do Firebase Auth, apenas o perfil e permissões no sistema.`}
          type="warning"
          confirmText="Excluir"
          showConfirmButton={true}
          onConfirm={() => {
            if (userToDelete) {
              handleDeleteUser(userToDelete.id, userToDelete.email, true);
            }
          }}
        />
      </AnimatePresence>
    </div>
  );
};

export default Admin;
