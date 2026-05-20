import React, { useEffect, useState } from 'react';
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
  writeBatch 
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { UserProfile, AllowedDomain, UserRole, UserStatus } from '../types';
import { MASTER_EMAILS } from '../constants';
import { handleFirestoreError, OperationType } from '../lib/errorHandler';
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
  AlertTriangle
} from 'lucide-react';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, updateProfile, sendEmailVerification } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { motion, AnimatePresence } from 'motion/react';
import { cn, safeToDate } from '../lib/utils';
import { validateEmailDomain } from '../lib/domainUtils';

const Admin: React.FC = () => {
  const { isAdmin, isMaster } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [domains, setDomains] = useState<AllowedDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDomain, setNewDomain] = useState('');
  const [domainLoading, setDomainLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'users' | 'domains'>('users');
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'viewer' as UserRole });
  const [addUserLoading, setAddUserLoading] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);

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
      
      const usersList = usersSnap.docs.map(doc => {
        const data = doc.data() as any;
        const isUserMaster = MASTER_EMAILS.includes(data.email?.toLowerCase() || '');
        return { uid: doc.id, ...data, isMaster: isUserMaster } as UserProfile;
      });
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
      await setDoc(doc(db, 'users', user.uid), {
        email: newUser.email,
        displayName: newUser.name,
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
          const userSnap = await getDocs(query(collection(db, 'users'), where('email', '==', newUser.email.toLowerCase().trim())));
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
                  email: newUser.email.toLowerCase().trim(),
                  displayName: newUser.name || data.displayName || 'Usuário',
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


  const handleDeleteUser = async (userId: string, userEmail: string) => {
    if (userEmail === 'jacksonbjr@gmail.com') {
      setError('O usuário Master principal não pode ser excluído.');
      return;
    }

    if (!window.confirm(`Tem certeza que deseja excluir permanentemente o perfil de ${userEmail}? Esta ação NÃO removerá a conta do Firebase Auth, apenas o perfil e permissões no sistema.`)) return;
    
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

          <div className="flex bg-gray-100 p-1 rounded-xl">
           <button 
             onClick={() => setActiveTab('users')}
             className={cn("px-4 py-2 rounded-lg text-sm font-semibold transition-all", activeTab === 'users' ? "bg-white text-emerald-600 shadow-sm" : "text-gray-500 hover:text-gray-700")}
           >
             Usuários
           </button>
           <button 
             onClick={() => setActiveTab('domains')}
             className={cn("px-4 py-2 rounded-lg text-sm font-semibold transition-all", activeTab === 'domains' ? "bg-white text-emerald-600 shadow-sm" : "text-gray-500 hover:text-gray-700")}
           >
             Domínios
           </button>
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
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 font-bold shrink-0">
                          {user.displayName.charAt(0)}
                        </div>
                        <input
                          type="text"
                          defaultValue={user.displayName}
                          onBlur={(e) => {
                            if (e.target.value !== user.displayName) {
                              handleUpdateName(user.uid, e.target.value);
                            }
                          }}
                          className={cn(
                            "font-medium text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-emerald-500 outline-none transition-all w-full max-w-[200px]",
                            user.isMaster && !isMaster && "pointer-events-none"
                          )}
                          disabled={user.isMaster && !isMaster}
                        />
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
    ) : (
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
      </AnimatePresence>
    </div>
  );
};

export default Admin;
