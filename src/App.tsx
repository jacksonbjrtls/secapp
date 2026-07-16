import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { auth, db } from './lib/firebase';
import { signOut, updatePassword } from 'firebase/auth';
import { doc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { cn } from './lib/utils';
import Shell from './components/layout/Shell';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Admin from './pages/Admin';
import Reports from './pages/Reports';
import Profile from './pages/Profile';
import DDS from './pages/DDS';
import Schedule from './pages/Schedule';
import Forklifts from './pages/Forklifts';
import WireControl from './pages/WireControl';
import ConsumablesControl from './pages/ConsumablesControl';
import Quality from './pages/Quality';
import Overview from './pages/Overview';
import OperationalRoutes from './pages/OperationalRoutes';
import SafetyObservations from './pages/SafetyObservations';
import { ShiftHandover } from './pages/ShiftHandover';
import Certificates from './pages/Certificates';
import { Loader2, Ban, MailCheck, KeyRound, Eye, EyeOff, AlertCircle } from 'lucide-react';

const ProtectedRoute: React.FC<{ children: React.ReactNode; requireAdmin?: boolean; requireManager?: boolean }> = ({ 
  children, 
  requireAdmin,
  requireManager 
}) => {
  const { user, profile, loading, isAdmin, isManager, isApproved, isPending, isBlocked, isDisabled, isEmailVerified, mustChangePassword, isMaster, isDomainAllowed } = useAuth();
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState('');
  const [updateLoading, setUpdateLoading] = React.useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-emerald-600">
        <Loader2 className="w-12 h-12 text-white animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // 0. Forced Password Change Check
  if (mustChangePassword) {
    const handlePasswordChange = async (e: React.FormEvent) => {
      e.preventDefault();
      if (newPassword.length < 6) {
        setError('A senha deve ter pelo menos 6 caracteres.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setError('As senhas não coincidem.');
        return;
      }

      setUpdateLoading(true);
      setError('');
      try {
        await updatePassword(user, newPassword);
        await updateDoc(doc(db, 'users', user.uid), {
          mustChangePassword: false,
          updatedAt: serverTimestamp()
        });
        window.location.reload();
      } catch (err: any) {
        console.error(err);
        if (err.code === 'auth/requires-recent-login') {
          setError('Para sua segurança, saia e entre novamente com a senha padrão antes de trocá-la.');
        } else {
          setError('Erro ao trocar senha. Tente novamente.');
        }
      } finally {
        setUpdateLoading(false);
      }
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 px-4 py-12">
        <div className="max-w-md w-full bg-white p-8 md:p-10 rounded-[2.5rem] shadow-2xl border border-slate-100">
          <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6 text-blue-600">
             <KeyRound className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 mb-2 tracking-tight text-center">Primeiro Acesso</h2>
          <p className="text-slate-500 mb-8 leading-relaxed text-center text-sm">
            Para garantir a segurança da sua conta, você deve criar uma nova senha pessoal antes de continuar.
          </p>

          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Nova Senha</label>
              <div className="relative">
                <input
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-4 pr-12 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Confirmar Senha</label>
              <input
                required
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 text-rose-500 text-xs font-bold bg-rose-50 p-4 rounded-xl border border-rose-100">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button 
              type="submit"
              disabled={updateLoading}
              className="w-full py-4 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-2"
            >
              {updateLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Atualizar e Entrar'}
            </button>

            <button 
              type="button"
              onClick={() => signOut(auth)}
              className="w-full py-3 text-slate-400 font-bold hover:text-slate-600 transition-all text-[10px] uppercase tracking-widest"
            >
              Fazer Login com Outra Conta
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 1. Email Verification Check
  if (!isEmailVerified && !isMaster) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full bg-white p-10 rounded-[2.5rem] shadow-2xl text-center border border-slate-100">
          <div className="w-24 h-24 bg-emerald-50 rounded-3xl flex items-center justify-center mx-auto mb-8 text-emerald-500">
             <MailCheck className="w-12 h-12" />
          </div>
          <h2 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">Verifique seu e-mail</h2>
          <p className="text-slate-500 mb-10 leading-relaxed">
            Enviamos um link de confirmação para sua caixa de entrada. Clique no link para verificar sua identidade e ativar seu acesso.
          </p>
          <div className="space-y-4">
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-4 px-6 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200"
            >
              Já verifiquei meu e-mail
            </button>
            <button 
              onClick={() => signOut(auth)}
              className="w-full py-4 px-6 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-all font-black uppercase tracking-widest text-xs"
            >
              Sair
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Pending Approval Check
  const needsProfile = !profile && user && !isMaster;
  const needsApproval = (isPending || needsProfile) && !isMaster;
  
  const handleRegisterProfile = async () => {
    if (!user) return;
    setUpdateLoading(true);
    try {
      await setDoc(doc(db, 'users', user.uid), {
        email: user.email?.toLowerCase().trim(),
        displayName: user.displayName || 'Usuário',
        role: 'viewer',
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      // Small delay then reload
      setTimeout(() => window.location.reload(), 1000);
    } catch (err: any) {
      console.error('Error creating missing profile:', err);
      // If it exists now, reload
      if (err.code === 'permission-denied') {
        // Check if it exists via getDoc
        window.location.reload();
      } else {
        setError('Erro ao criar perfil. Tente novamente ou contate o suporte.');
      }
    } finally {
      setUpdateLoading(false);
    }
  };

  if (needsApproval) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full bg-white p-10 rounded-[2.5rem] shadow-2xl text-center border border-slate-100">
          <div className="w-24 h-24 bg-amber-50 rounded-3xl flex items-center justify-center mx-auto mb-8 text-amber-500">
             <Loader2 className="w-12 h-12 animate-spin" />
          </div>
          <h2 className="text-3xl font-black text-slate-900 mb-2 tracking-tight">
            {needsProfile ? 'Perfil Incompleto' : 'Aguardando Aprovação'}
          </h2>
          <div className="mb-8">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Logado como:</p>
            <p className="text-sm font-bold text-slate-700 bg-slate-50 py-2 px-4 rounded-xl border border-slate-100 inline-block">{user.email}</p>
            {!needsProfile && (
              <div className="mt-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status atual:</p>
                <p className={cn(
                  "text-xs font-black uppercase px-3 py-1 rounded-full border inline-block",
                  isPending ? "bg-amber-50 text-amber-600 border-amber-100" : "bg-emerald-50 text-emerald-600 border-emerald-100"
                )}>
                  {profile?.status}
                </p>
              </div>
            )}
          </div>
          
          <p className="text-slate-500 mb-10 leading-relaxed">
            {needsProfile 
              ? 'Detectamos que sua conta de acesso existe, mas seu perfil de dados não foi criado corretamente. Clique abaixo para concluir seu cadastro.'
              : 'Seu cadastro foi realizado com sucesso. Um administrador irá revisar sua solicitação e liberar seu acesso em breve.'}
          </p>
          
          <div className="space-y-4">
            {!needsProfile && (
              <button 
                onClick={() => window.location.reload()}
                className="w-full py-4 px-6 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200 flex items-center justify-center gap-2"
              >
                <Loader2 className="w-5 h-5" />
                Verificar Status Novamente
              </button>
            )}

            {needsProfile && (
              <button 
                onClick={handleRegisterProfile}
                disabled={updateLoading}
                className="w-full py-4 px-6 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200 flex items-center justify-center gap-2"
              >
                {updateLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Completar Meu Perfil'}
              </button>
            )}
            
            <button 
              onClick={() => signOut(auth)}
              className="w-full py-4 px-6 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
            >
              Sair do Sistema
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Blocked or Unauthorized Domain Check
  const isUnauthorizedDomain = !isDomainAllowed && !isMaster;
  
  if (isDisabled || isBlocked || isUnauthorizedDomain) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full bg-white p-10 rounded-[2.5rem] shadow-2xl text-center border border-slate-100">
          <div className="w-24 h-24 bg-rose-50 rounded-3xl flex items-center justify-center mx-auto mb-8 text-rose-500">
             <Ban className="w-12 h-12" />
          </div>
          <h2 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">
            {isUnauthorizedDomain ? 'Domínio não Autorizado' : 'Acesso Bloqueado'}
          </h2>
          <p className="text-slate-500 mb-10 leading-relaxed font-medium">
            {isUnauthorizedDomain 
              ? `O domínio do e-mail ${user.email} não é mais permitido para acessar este sistema. Utilize um e-mail corporativo autorizado.`
              : 'Sua conta foi desativada ou bloqueada por um administrador. Entre em contato com a equipe de segurança para mais informações.'}
          </p>
          <button 
            onClick={() => signOut(auth)}
            className="w-full py-4 px-6 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
          >
            Sair e Entrar com Outro E-mail
          </button>
        </div>
      </div>
    );
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  if (requireManager && !isManager && !isAdmin) {
    return <Navigate to="/dds" replace />;
  }

  return <Shell>{children}</Shell>;
};

const HomeRedirect = () => {
  const { loading, isAdmin, isManager, isMaster } = useAuth();
  if (loading) return null;
  if (isAdmin || isManager || isMaster) {
    return <Navigate to="/overview" replace />;
  }
  return <Navigate to="/shift-handover" replace />;
};

const App: React.FC = () => {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Navigate to="/login" replace />} />
          
          <Route 
            path="/" 
            element={
              <ProtectedRoute>
                <HomeRedirect />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/shift-handover" 
            element={
              <ProtectedRoute>
                <ShiftHandover />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute requireManager>
                <Dashboard />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/dds" 
            element={
              <ProtectedRoute>
                <DDS />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/forklifts" 
            element={
              <ProtectedRoute>
                <Forklifts />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/wires" 
            element={
              <ProtectedRoute>
                <WireControl />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/consumables" 
            element={
              <ProtectedRoute>
                <ConsumablesControl />
              </ProtectedRoute>
            } 
          />
          
          <Route 
            path="/quality" 
            element={
              <ProtectedRoute>
                <Quality />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/operational-routes" 
            element={
              <ProtectedRoute>
                <OperationalRoutes />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/safety-observations" 
            element={
              <ProtectedRoute>
                <SafetyObservations />
              </ProtectedRoute>
            } 
          />
          
          <Route 
            path="/schedule" 
            element={
              <ProtectedRoute>
                <Schedule />
              </ProtectedRoute>
            } 
          />
          
          <Route 
            path="/certificates" 
            element={
              <ProtectedRoute>
                <Certificates />
              </ProtectedRoute>
            } 
          />
          
          <Route 
            path="/admin" 
            element={
              <ProtectedRoute requireAdmin>
                <Admin />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/reports" 
            element={
              <ProtectedRoute requireManager>
                <Reports />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/overview" 
            element={
              <ProtectedRoute requireManager>
                <Overview />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/profile" 
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            } 
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
};

export default App;
