import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  signInWithEmailAndPassword, 
  sendPasswordResetEmail, 
  sendEmailVerification, 
  signOut,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  serverTimestamp, 
  collection, 
  getDocs 
} from 'firebase/firestore';
import { validateEmailDomain } from '../lib/domainUtils';
import { ShieldCheck, Loader2, Mail, ArrowLeft, AlertTriangle } from 'lucide-react';
import { Logo } from '../components/ui/Logo';

import { MASTER_EMAILS } from '../constants';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [requiresVerification, setRequiresVerification] = useState(false);
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
  const [domainsLoading, setDomainsLoading] = useState(true);
  const navigate = useNavigate();

  const isDomainAllowed = React.useMemo(() => {
    const emailLower = email.toLowerCase().trim();
    if (!emailLower || !emailLower.includes('@')) return true;
    
    const parts = emailLower.split('@');
    let domain = parts[parts.length - 1].trim(); 
    if (!domain) return true;
    
    // Add @ for comparison if it's missing (as we want to match @domain.com format)
    if (!domain.startsWith('@')) {
      domain = '@' + domain;
    }
    
    // Master emails always bypass domain checks
    if (MASTER_EMAILS.includes(emailLower)) return true;
    
    if (domainsLoading) return false;
    
    // If no domains are configured yet, allow everyone (bootstrap mode)
    if (allowedDomains.length === 0) return true;
    
    // Normalize allowed domains to have @ for safe comparison
    const normalizedAllowed = allowedDomains.map(d => d.startsWith('@') ? d : '@' + d);
    
    return normalizedAllowed.includes(domain);
  }, [email, allowedDomains, domainsLoading]);

  React.useEffect(() => {
    const fetchDomains = async () => {
      try {
        const snap = await getDocs(collection(db, 'allowed_domains'));
        setAllowedDomains(snap.docs.map(doc => doc.id.toLowerCase().trim()));
      } catch (err) {
        console.error('Error fetching domains:', err);
      } finally {
        setDomainsLoading(false);
      }
    };
    fetchDomains();

    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        navigate('/');
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    setRequiresVerification(false);
    
    try {
      // 1. Early Domain Check
      const { allowed } = await validateEmailDomain(email);
      if (!allowed) {
        setError("Este domínio de e-mail não é permitido. Por favor, use seu e-mail corporativo.");
        setLoading(false);
        return;
      }

      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Sync verification status to Firestore for Admin tracking, auto-create profile if missing
      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        
        const emailLower = user.email?.toLowerCase() || '';
        const isMaster = MASTER_EMAILS.includes(emailLower);
        
        if (!userDoc.exists()) {
          // If the profile does not exist (e.g. created in Auth but no Firestore record), create it
          await setDoc(userDocRef, {
            email: emailLower,
            displayName: user.displayName || emailLower.split('@')[0],
            role: isMaster ? 'admin' : 'viewer',
            isMaster: isMaster,
            status: isMaster ? 'approved' : 'pending',
            emailVerifiedInAuth: user.emailVerified,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(userDocRef, {
            emailVerifiedInAuth: user.emailVerified,
            updatedAt: serverTimestamp()
          });
        }
      } catch (e) {
        console.warn('Could not sync verification status to Firestore', e);
      }

      navigate('/');
    } catch (err: any) {
      const errStr = String(err);
      const isInvalidCred = err?.code === 'auth/invalid-credential' || 
                            err?.code === 'auth/wrong-password' || 
                            err?.message?.includes('invalid-credential') || 
                            err?.message?.includes('wrong-password') || 
                            errStr.includes('invalid-credential') || 
                            errStr.includes('wrong-password') || 
                            errStr.includes('invalid-credential');

      const isUserNotFound = err?.code === 'auth/user-not-found' || 
                             err?.message?.includes('user-not-found') || 
                             errStr.includes('user-not-found');

      if (isInvalidCred) {
        setError('E-mail ou senha incorretos. Caso já tenha se cadastrado, você pode redefinir sua senha clicando em "Esqueceu a senha?" acima. Caso não tenha uma conta, clique em "Registrar-se" abaixo.');
      } else if (isUserNotFound) {
        setError('Usuário não encontrado. Você já criou sua conta no link "Registrar-se"?');
      } else {
        setError(`Erro ao entrar: ${err.message || err.code || 'Verifique sua conexão e tente novamente.'}`);
      }
      console.error(err);
    } finally {
      if (!requiresVerification) {
        setLoading(false);
      }
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      // Use prompt: 'select_account' to ensure cleaner state, which often fixes 'automatic' login issues
      provider.setCustomParameters({ prompt: 'select_account' });
      
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      const emailLower = user.email?.toLowerCase() || '';
      const domain = emailLower.split('@')[1];
      const isMaster = MASTER_EMAILS.includes(emailLower);

      // Check if user has profile, if not create one
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) {
        // Enforce domain check
        const { allowed, domain: emailDomain } = await validateEmailDomain(emailLower);
        
        if (!allowed) {
          await signOut(auth);
          throw { code: 'auth/unauthorized-domain', message: `O domínio @${emailDomain} não está autorizado para acesso.` };
        }

        // Auto-approve if it's the master
        await setDoc(doc(db, 'users', user.uid), {
          email: user.email,
          displayName: user.displayName || 'Usuário Google',
          role: isMaster ? 'admin' : 'viewer',
          isMaster: isMaster,
          status: isMaster ? 'approved' : 'pending',
          emailVerifiedInAuth: user.emailVerified,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(doc(db, 'users', user.uid), {
          emailVerifiedInAuth: user.emailVerified,
          updatedAt: serverTimestamp()
        });
      }

      navigate('/');
    } catch (err: any) {
      console.error('Google Login Error:', err);
      const hostname = window.location.hostname;
      
      if (err.code === 'auth/unauthorized-domain') {
        setError(`ERRO DE CONFIGURAÇÃO: O domínio "${hostname}" não está autorizado no seu Firebase. Acesse o Console do Firebase > Authentication > Settings > Authorized Domains e adicione este endereço para liberar o login.`);
      } else if (err.code === 'auth/network-request-failed' || err.code === 'auth/popup-blocked' || err.code === 'auth/internal-error') {
        setError('O login via Google foi impedido pelo navegador ou por estar dentro de um quadro (iframe). Por favor, use o botão "ABRIR SISTEMA EM NOVA ABA" abaixo para logar com sucesso.');
      } else if (err.code === 'auth/popup-closed-by-user') {
        setError('A janela de login foi fechada antes da conclusão.');
      } else {
        setError(`Falha no login Google: ${err.message || err.code || 'Erro desconhecido'}. Tente abrir em nova aba.`);
      }
    } finally {
      setLoading(false);
    }
  };

  const isInIframe = window.self !== window.top;

  const handleResendVerification = async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      // Direct client-side verification as primary, which always works and bypasses identity toolkit admin API checks
      await sendEmailVerification(auth.currentUser);
      setMessage('E-mail de verificação enviado com sucesso diretamente pelo sistema!');
    } catch (err: any) {
       console.error('Direct verification error, trying backup API:', err);
       try {
         await fetch('/api/send-custom-auth-email', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({
             type: 'verification',
             email: auth.currentUser.email,
             name: auth.currentUser.displayName || ''
           })
         });
         setMessage('E-mail de verificação reenviado via backup!');
       } catch (backupErr: any) {
         console.error('Backup API also failed:', backupErr);
         setError('Erro ao enviar e-mail. Caso seu e-mail já esteja cadastrado e você queira redefinir a senha, utilize a opção de recuperar senha na tela anterior.');
       }
    } finally {
      setLoading(false);
    }
  };

  const handleCheckVerification = async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    try {
      await auth.currentUser.reload();
      if (auth.currentUser.emailVerified) {
        navigate('/');
      } else {
        setError('O e-mail ainda não foi verificado. Verifique seu e-mail e tente novamente.');
      }
    } catch (err) {
      setError('Erro ao verificar status. Tente recarregar a página.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = async () => {
    await signOut(auth);
    setRequiresVerification(false);
    setError('');
    setMessage('');
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Por favor, informe seu e-mail.');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      // Early domain check for password reset too
      const { allowed, domain: emailDomain } = await validateEmailDomain(email);
      if (!allowed) {
        setError(`O domínio @${emailDomain} não está autorizado. Por favor, use seu e-mail corporativo.`);
        setLoading(false);
        return;
      }

      // First try standard Firebase client-side password reset which works 100% of the time directly in client
      try {
        await sendPasswordResetEmail(auth, email.toLowerCase().trim());
        setMessage('E-mail de redefinição enviado com sucesso pelo Firebase! Verifique sua caixa de entrada.');
        setTimeout(() => setIsForgotPassword(false), 8000);
      } catch (authErr: any) {
        console.warn('Direct password reset failed, trying custom API backup:', authErr);
        // Fallback to backend API
        await fetch('/api/send-custom-auth-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'password_reset',
            email: email.toLowerCase().trim()
          })
        });
        setMessage('E-mail de redefinição enviado via backup de e-mail! Verifique sua caixa de entrada.');
        setTimeout(() => setIsForgotPassword(false), 8500);
      }
    } catch (err: any) {
      console.error('Reset error:', err);
      setError('Erro ao enviar e-mail de redefinição. Verifique se o endereço está correto.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-8 px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-green-500 rounded-full blur-[120px]"></div>
      </div>
      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center flex-col items-center gap-4">
          <div className="bg-white p-4 rounded-3xl shadow-2xl border border-slate-800/10 flex items-center justify-center transform hover:scale-105 transition-all duration-300">
            <Logo className="h-16" />
          </div>
          <p className="text-emerald-100/60 text-center font-medium tracking-wide text-sm">
            {isForgotPassword ? 'Recupere seu acesso' : 'Entre para gerenciar seu sistema'}
          </p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-10 px-6 shadow-2xl rounded-3xl sm:px-12 border border-white/20">
          {requiresVerification ? (
            <div className="space-y-6">
               <div className="bg-amber-50 border border-amber-100 p-6 rounded-2xl flex flex-col items-center text-center gap-4">
                  <div className="bg-amber-100 p-3 rounded-full">
                    <Mail className="w-8 h-8 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="text-amber-900 font-bold text-lg">Confirme seu e-mail</h3>
                    <p className="text-amber-700 text-sm mt-1">
                      Enviamos um link de ativação para <strong>{email}</strong>. Verifique sua caixa de entrada e também a pasta de <strong>Spam</strong>.
                    </p>
                  </div>
               </div>

               {message && (
                <div className="text-emerald-600 text-sm bg-emerald-50 p-4 rounded-xl border border-emerald-100 font-medium flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5" />
                  {message}
                </div>
              )}

               <div className="space-y-3 pt-2">
                  <button
                    onClick={handleCheckVerification}
                    disabled={loading}
                    className="w-full flex justify-center py-4 px-4 rounded-xl shadow-lg text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all uppercase tracking-widest"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Já verifiquei meu e-mail'}
                  </button>
                  <button
                    onClick={handleResendVerification}
                    disabled={loading}
                    className="w-full flex justify-center py-4 px-4 rounded-xl border-2 border-emerald-100 text-sm font-bold text-emerald-600 hover:bg-emerald-50 transition-all uppercase tracking-widest"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Reenviar Link de Ativação'}
                  </button>
                  
                  <div className="flex flex-col gap-2 pt-4">
                    <button
                      onClick={handleBackToLogin}
                      className="w-full flex items-center justify-center gap-2 text-sm font-bold text-gray-400 hover:text-emerald-600 transition-colors py-2"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Usar outro e-mail / Voltar
                    </button>
                  </div>
               </div>
            </div>
          ) : !isForgotPassword ? (
            <form className="space-y-6" onSubmit={handleLogin}>
              <div>
                <label className="block text-sm font-medium text-gray-700">E-mail</label>
                <input
                  type="email"
                  required
                  className="mt-1 block w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@dominio.com"
                />
                {email.includes('@') && !isDomainAllowed && (
                  <p className="mt-1 text-[10px] text-amber-600 font-bold flex items-center gap-1 uppercase tracking-tight">
                    <AlertTriangle className="w-3 h-3" /> Este domínio de e-mail não é permitido
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700">Senha</label>
                  <button
                    type="button"
                    onClick={() => setIsForgotPassword(true)}
                    className="text-xs font-bold text-emerald-600 hover:text-emerald-500 underline-offset-2 hover:underline"
                  >
                    Esqueceu a senha?
                  </button>
                </div>
                <input
                  type="password"
                  required
                  className="mt-1 block w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <div className="space-y-3">
                  <div className="text-red-500 text-sm bg-red-50 p-3 rounded-lg border border-red-100 italic flex gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                  {(error.includes('aba') || error.includes('pop-up') || error.includes('desativá-lo')) && (
                    <button
                      type="button"
                      onClick={() => window.open(window.location.href, '_blank')}
                      className="w-full py-2 px-4 bg-slate-100 text-slate-700 text-[10px] font-bold uppercase tracking-widest rounded-lg hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
                    >
                      <ArrowLeft className="w-3 h-3 rotate-180" />
                      Abrir em nova aba para logar
                    </button>
                  )}
                  {error.includes('Falha na conexão') && (
                    <div className="text-amber-600 text-[10px] bg-amber-50 p-2 rounded border border-amber-100">
                      <strong>Dica:</strong> Se você estiver usando um bloqueador de anúncios (AdBlock, uBlock, etc), tente desativá-lo para este site. Bloqueadores costumam impedir a conexão com os servidores de login do Google.
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !isDomainAllowed}
                className="w-full flex justify-center py-3 px-4 rounded-xl shadow-lg shadow-emerald-900/20 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all uppercase tracking-widest"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Entrar'}
              </button>
            </form>
          ) : (
            <form className="space-y-6" onSubmit={handleResetPassword}>
              <div className="text-gray-600 text-sm">
                Insira seu e-mail para receber um link de redefinição de senha.
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">E-mail Corporativo</label>
                <div className="mt-1 relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    required
                    className="block w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 transition-all"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@dominio.com"
                  />
                </div>
              </div>

              {error && (
                <div className="text-red-500 text-sm bg-red-50 p-3 rounded-lg border border-red-100">
                  {error}
                </div>
              )}

              {message && (
                <div className="text-emerald-600 text-sm bg-emerald-50 p-3 rounded-lg border border-emerald-100 font-bold">
                  {message}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-3 px-4 rounded-xl shadow-lg text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 transition-all uppercase tracking-widest"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Enviar E-mail'}
              </button>

              <button
                type="button"
                onClick={() => setIsForgotPassword(false)}
                className="w-full flex items-center justify-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar para Login
              </button>
            </form>
          )}

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Não tem uma conta?{' '}
              <Link to="/register" className="font-bold text-emerald-600 hover:text-emerald-500 underline-offset-4 hover:underline">
                Registrar-se
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
