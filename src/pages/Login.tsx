import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  signInWithEmailAndPassword, 
  sendPasswordResetEmail, 
  sendEmailVerification, 
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  updatePassword
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
import { ShieldCheck, Loader2, Mail, ArrowLeft, AlertTriangle, Eye, EyeOff, KeyRound } from 'lucide-react';
import { Logo } from '../components/ui/Logo';
import { PrivacyPolicyModal } from '../components/ui/PrivacyPolicyModal';
import { encryptValue, decryptValue, hashEmailForSearch } from '../lib/crypto';

import { MASTER_EMAILS } from '../constants';
import { recordUserLogin } from '../lib/loginLogger';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [requiresVerification, setRequiresVerification] = useState(false);
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
  const [domainsLoading, setDomainsLoading] = useState(true);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);

  // States for verifying if the email is pre-registered
  const [emailChecked, setEmailChecked] = useState(false);
  const [emailExists, setEmailExists] = useState<boolean | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);
  
  // For the immediate password change popout
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);
  const [changePasswordError, setChangePasswordError] = useState('');
  const [loggedInUser, setLoggedInUser] = useState<any>(null);

  const navigate = useNavigate();

  const checkEmailExistence = async (emailToCheck: string) => {
    const trimmed = emailToCheck.toLowerCase().trim();
    if (!trimmed || !trimmed.includes('@') || !trimmed.includes('.')) {
      setEmailExists(null);
      setEmailChecked(false);
      return;
    }

    setCheckingEmail(true);
    setError('');
    try {
      const checkRes = await fetch('/api/auth/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed })
      });
      if (checkRes.ok) {
        const data = await checkRes.json();
        setEmailExists(data.exists);
        setEmailChecked(true);
        if (!data.exists) {
          setError('Este e-mail não está cadastrado no sistema. O acesso é exclusivo para usuários pré-cadastrados por um administrador.');
        }
      } else {
        // Safe fallback
        setEmailExists(true);
        setEmailChecked(true);
      }
    } catch (err) {
      console.error('Error checking email:', err);
      setEmailExists(true);
      setEmailChecked(true);
    } finally {
      setCheckingEmail(false);
    }
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setEmail(val);
    setEmailExists(null);
    setEmailChecked(false);
    setError('');
  };

  React.useEffect(() => {
    const trimmed = email.toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      setEmailExists(null);
      setEmailChecked(false);
      return;
    }

    const timer = setTimeout(() => {
      checkEmailExistence(trimmed);
    }, 600);

    return () => clearTimeout(timer);
  }, [email]);

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

      let userCredential;
      try {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
      } catch (err: any) {
        // Se a senha inserida for uma das senhas padrão, tenta o auto-provisionamento no backend
        const isDefaultPasswordInput = password === 'Mudarsenha123' || password === 'Mudar@123';
        if (isDefaultPasswordInput) {
          try {
            const provRes = await fetch('/api/auth/auto-provision', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: email.toLowerCase().trim() })
            });
            const provData = await provRes.json();
            
            if (provData.success) {
              // Se provisionado com sucesso, tenta autenticar novamente no cliente
              userCredential = await signInWithEmailAndPassword(auth, email, password);
            } else {
              // Se o endpoint retornou um erro explicativo (ex: e-mail não cadastrado ou bloqueado)
              if (provData.error) {
                throw new Error(provData.error);
              }
              throw err;
            }
          } catch (provErr: any) {
            // Se o provisionamento falhar ou o login pós-provisionamento falhar, tenta com a senha alternativa como fallback
            const alternativePassword = password === 'Mudarsenha123' ? 'Mudar@123' : 'Mudarsenha123';
            try {
              userCredential = await signInWithEmailAndPassword(auth, email, alternativePassword);
            } catch (fallbackErr) {
              // Se falhar de tudo, lança o erro explicativo do provisionamento ou o original
              throw new Error(provErr.message || err.message || 'Erro de autenticação.');
            }
          }
        } else {
          throw err;
        }
      }
      const user = userCredential.user;
      const userDocRef = doc(db, 'users', user.uid);

      // Sync verification status to Firestore for Admin tracking, auto-create profile if missing
      let mustChange = password === 'Mudarsenha123' || password === 'Mudar@123';
      try {
        const userDoc = await getDoc(userDocRef);
        
        const emailLower = user.email?.toLowerCase() || '';
        const isMaster = MASTER_EMAILS.includes(emailLower);
        
        if (!userDoc.exists()) {
          // If the profile does not exist (e.g. created in Auth but no Firestore record), create it
          const encEmail = await encryptValue(emailLower);
          const encDisplayName = await encryptValue(user.displayName || emailLower.split('@')[0]);
          await setDoc(userDocRef, {
            email: encEmail,
            emailHash: hashEmailForSearch(emailLower),
            displayName: encDisplayName,
            role: isMaster ? 'admin' : 'viewer',
            isMaster: isMaster,
            status: isMaster ? 'approved' : 'pending',
            emailVerifiedInAuth: user.emailVerified,
            mustChangePassword: mustChange,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          const profileData = userDoc.data();
          if (profileData?.mustChangePassword === true) {
            mustChange = true;
          }
          await updateDoc(userDocRef, {
            emailVerifiedInAuth: user.emailVerified,
            updatedAt: serverTimestamp()
          });
        }
      } catch (e) {
        console.warn('Could not sync verification status to Firestore', e);
      }

      // Record successful user login
      try {
        const userDoc = await getDoc(userDocRef);
        const rawName = userDoc.exists() ? (userDoc.data() as any)?.displayName : undefined;
        const customName = rawName ? await decryptValue(rawName) : undefined;
        await recordUserLogin(user, customName);
      } catch (logErr) {
        console.warn('Could not record login log:', logErr);
      }

      if (mustChange) {
        setLoggedInUser(user);
        setShowChangePasswordModal(true);
        setLoading(false);
        return;
      }

      navigate('/');
    } catch (err: any) {
      let errStrLower = '';
      try {
        errStrLower = JSON.stringify(err).toLowerCase();
      } catch (e) {
        errStrLower = String(err).toLowerCase();
      }

      const isInvalidCred = err?.code === 'auth/invalid-credential' || 
                            err?.code === 'auth/wrong-password' || 
                            err?.message?.toLowerCase()?.includes('invalid-credential') || 
                            err?.message?.toLowerCase()?.includes('wrong-password') || 
                            errStrLower.includes('invalid-credential') || 
                            errStrLower.includes('wrong-password') || 
                            errStrLower.includes('invalid_credential') || 
                            errStrLower.includes('wrong_password');

      const isUserNotFound = err?.code === 'auth/user-not-found' || 
                             err?.message?.toLowerCase()?.includes('user-not-found') || 
                             errStrLower.includes('user-not-found') ||
                             errStrLower.includes('user_not_found');

      const isTooManyRequests = err?.code === 'auth/too-many-requests' ||
                                errStrLower.includes('too-many-requests') ||
                                errStrLower.includes('too_many_requests');

      if (isInvalidCred || isUserNotFound) {
        setError('E-mail ou senha incorretos. Por favor, verifique suas credenciais e tente novamente.');
        setEmail('');
        setPassword('');
        console.warn('Tentativa de login malsucedida: Credenciais inválidas ou usuário não cadastrado.');
      } else if (isTooManyRequests) {
        setError('Muitas tentativas malsucedidas de login. Sua conta foi temporariamente bloqueada. Tente novamente mais tarde ou redefina sua senha.');
        console.warn('Tentativa de login bloqueada temporariamente devido a muitas requisições.');
      } else {
        const readableMessage = err.message || err.code || 'Verifique sua conexão e tente novamente.';
        setError(`Erro ao entrar: ${readableMessage}`);
        console.error('Erro inesperado de login:', err);
      }
    } finally {
      if (!requiresVerification) {
        setLoading(false);
      }
    }
  };

  const handleImmediatePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loggedInUser) return;
    
    if (newPassword.length < 6) {
      setChangePasswordError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setChangePasswordError('As senhas não coincidem.');
      return;
    }

    setChangePasswordLoading(true);
    setChangePasswordError('');

    try {
      await updatePassword(loggedInUser, newPassword);
      
      const userDocRef = doc(db, 'users', loggedInUser.uid);
      await updateDoc(userDocRef, {
        mustChangePassword: false,
        updatedAt: serverTimestamp()
      });

      setShowChangePasswordModal(false);
      navigate('/');
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/requires-recent-login') {
        setChangePasswordError('Para sua segurança, por favor tente recarregar a página e fazer o login novamente antes de trocar a senha.');
      } else {
        setChangePasswordError(err.message || 'Erro ao trocar senha. Tente novamente.');
      }
    } finally {
      setChangePasswordLoading(false);
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
        const encEmail = await encryptValue(user.email);
        const encDisplayName = await encryptValue(user.displayName || 'Usuário Google');
        await setDoc(doc(db, 'users', user.uid), {
          email: encEmail,
          emailHash: hashEmailForSearch(user.email),
          displayName: encDisplayName,
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

      // Record successful user login
      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        const rawName = userDoc.exists() ? (userDoc.data() as any)?.displayName : undefined;
        const customName = rawName ? await decryptValue(rawName) : undefined;
        await recordUserLogin(user, customName);
      } catch (logErr) {
        console.warn('Could not record login log:', logErr);
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
         const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
         await fetch('/api/send-custom-auth-email', {
           method: 'POST',
           headers: { 
             'Content-Type': 'application/json',
             'Authorization': `Bearer ${token}`
           },
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

      // Try custom SMTP first as it bypasses generic domain spam-filters
      try {
        const response = await fetch('/api/send-custom-auth-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'password_reset',
            email: email.toLowerCase().trim()
          })
        });

        const resData = await response.json().catch(() => ({}));
        if (!response.ok || resData.success === false) {
          const errMsg = resData.error || 'Falha no backup de envio de e-mails.';
          throw new Error(errMsg);
        }

        setMessage('E-mail de redefinição enviado com sucesso pelo servidor corporativo! Por favor, verifique sua caixa de entrada.');
        setTimeout(() => setIsForgotPassword(false), 8000);
      } catch (customErr: any) {
        console.warn('Custom email send failed or not configured, falling back to standard Firebase client-side reset:', customErr);
        
        // Skip fallback if user does not exist
        if (customErr.message && (customErr.message.includes('não encontrado') || customErr.message.includes('encontrado'))) {
          throw new Error('Este e-mail não está cadastrado no sistema SecApp.');
        }

        // Fallback to standard client-side Firebase send
        await sendPasswordResetEmail(auth, email.toLowerCase().trim());
        setMessage('E-mail de redefinição enviado pelo Firebase! Verifique sua caixa de entrada e pasta de Spam.');
        setTimeout(() => setIsForgotPassword(false), 8500);
      }
    } catch (err: any) {
      console.error('Reset error:', err);
      let displayError = 'Erro ao enviar e-mail de redefinição. Verifique se o endereço está correto e cadastrado.';
      if (err.code === 'auth/user-not-found' || err.message?.includes('user-not-found') || err.message?.includes('não cadastrado')) {
        displayError = 'Este e-mail não está cadastrado no sistema SecApp.';
      } else if (err.message?.includes('identitytoolkit') || err.message?.includes('Identity Toolkit') || err.message?.includes('disabled')) {
        displayError = 'A API Identity Toolkit está desativada no seu Google Cloud Console. O administrador do sistema precisa ativá-la para habilitar a redefinição de senha.';
      } else if (err.message) {
        displayError = err.message;
      }
      setError(displayError);
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
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-2xl rounded-3xl sm:px-12 border border-white/20">
          
          {/* Centralized Logo inside the card with customized caption */}
          <div className="flex flex-col items-center justify-center mb-8">
            <div className="bg-white p-4 rounded-3xl border border-slate-100 flex items-center justify-center transform hover:scale-105 transition-all duration-300">
              <Logo className="h-16" />
            </div>
            <p className="text-slate-500 text-center font-semibold text-sm mt-4">
              {isForgotPassword ? 'Recupere seu acesso' : 'Entre para gerenciar seu sistema'}
            </p>
          </div>

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
                <div className="relative mt-1">
                  <input
                    type="email"
                    required
                    className={`block w-full pl-4 pr-12 py-3 bg-gray-50 border rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all ${
                      emailChecked && emailExists === false ? 'border-red-300 bg-red-50/30' : 
                      emailChecked && emailExists === true ? 'border-emerald-300 bg-emerald-50/10' : 'border-gray-200'
                    }`}
                    value={email}
                    onChange={handleEmailChange}
                    onBlur={() => {
                      const trimmed = email.toLowerCase().trim();
                      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                      if (emailRegex.test(trimmed) && !emailChecked && !checkingEmail) {
                        checkEmailExistence(trimmed);
                      }
                    }}
                    placeholder="seu@dominio.com"
                  />
                  {checkingEmail && (
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center text-emerald-600">
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </div>
                  )}
                </div>
                {emailChecked && emailExists === false && (
                  <p className="mt-1.5 text-xs text-red-600 font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Este e-mail não está cadastrado. Solicite acesso ao administrador.
                  </p>
                )}
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
                    disabled={!emailChecked || emailExists !== true || checkingEmail}
                    onClick={() => setIsForgotPassword(true)}
                    className="text-xs font-bold text-emerald-600 hover:text-emerald-500 underline-offset-2 hover:underline disabled:opacity-40 disabled:no-underline"
                  >
                    Esqueceu a senha?
                  </button>
                </div>
                <div className="relative mt-1">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    disabled={!emailChecked || emailExists !== true || checkingEmail}
                    className={`block w-full pl-4 pr-12 py-3 border rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all ${
                      (!emailChecked || emailExists !== true || checkingEmail) 
                        ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed' 
                        : 'bg-gray-50 border-gray-200'
                    }`}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={(!emailChecked || emailExists !== true || checkingEmail) ? "Digite um e-mail válido para liberar" : "••••••••"}
                  />
                  <button
                    type="button"
                    disabled={!emailChecked || emailExists !== true || checkingEmail}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-30"
                    title={showPassword ? "Ocultar senha" : "Ver senha"}
                  >
                     {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="space-y-3">
                  <div className="text-red-500 text-sm bg-red-50 p-4 rounded-xl border border-red-100 italic flex gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <span className="whitespace-pre-line text-left flex-1 font-medium">{error}</span>
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
                disabled={loading || !isDomainAllowed || !emailChecked || emailExists !== true || checkingEmail}
                className="w-full flex justify-center py-3 px-4 rounded-xl shadow-lg shadow-emerald-900/20 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all uppercase tracking-widest"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Entrar'}
              </button>
            </form>
          ) : message ? (
            <div className="space-y-6 text-center animate-fade-in">
              <div className="mx-auto w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center border border-emerald-100 shadow-sm">
                <Mail className="w-8 h-8 text-emerald-600" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">E-mail de Redefinição Enviado!</h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  Enviamos instruções detalhadas de redefinição de senha para o endereço abaixo:
                </p>
                <div className="bg-slate-50 border border-slate-150 px-4 py-2.5 rounded-xl font-mono text-xs text-slate-700 select-all break-all inline-block max-w-full">
                  {email}
                </div>
              </div>

              <div className="bg-emerald-50/55 border border-emerald-100 p-5 rounded-2xl text-left space-y-2">
                <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" /> Próximos passos recomendados:
                </h4>
                <ul className="text-xs text-emerald-700 space-y-1.5 list-disc list-inside leading-relaxed">
                  <li>Aguarde alguns instantes e verifique sua caixa de entrada corporativa.</li>
                  <li>Cheque também a pasta de <strong>Spam</strong> ou <strong>Lixo Eletrônico</strong> caso não encontre na caixa de entrada.</li>
                  <li>Clique no link de segurança recebido para redefinir sua senha com facilidade.</li>
                </ul>
              </div>

              <div className="pt-2 space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    setMessage('');
                    setIsForgotPassword(false);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl shadow-lg shadow-emerald-950/10 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all uppercase tracking-widest"
                >
                  Ir para a tela de Login
                </button>
              </div>
            </div>
          ) : (
            <form className="space-y-6" onSubmit={handleResetPassword}>
              <div className="text-gray-600 text-sm leading-relaxed">
                Insira seu e-mail corporativo cadastrado para receber um link de redefinição de senha com segurança.
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
                <div className="space-y-2">
                  <div className="text-red-500 text-sm bg-red-50 p-3 rounded-lg border border-red-100 italic flex gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => window.open(window.location.href, '_blank')}
                    className="w-full py-2 px-4 bg-slate-100 text-slate-700 text-[10px] font-bold uppercase tracking-widest rounded-lg hover:bg-slate-200 transition-colors flex items-center justify-center gap-2 mb-2"
                  >
                    <ArrowLeft className="w-3 h-3 rotate-180" />
                    Abrir em nova aba para redefinir
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-3 px-4 rounded-xl shadow-lg text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 transition-all uppercase tracking-widest"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Enviar E-mail de Redefinição'}
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

          {/* Registration link removed by request */}
        </div>
        
        {/* Footer Privacy Link (LGPD) */}
        <div className="mt-8 text-center text-xs text-slate-400">
          <button 
            type="button" 
            onClick={() => setPrivacyModalOpen(true)} 
            className="underline hover:text-slate-300 transition-colors cursor-pointer"
          >
            Política de Privacidade e Proteção de Dados (LGPD)
          </button>
        </div>
      </div>

      {/* Privacy Policy Modal */}
      <PrivacyPolicyModal isOpen={privacyModalOpen} onClose={() => setPrivacyModalOpen(false)} />

      {/* Change Password Modal Popout */}
      {showChangePasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white p-8 md:p-10 rounded-[2.5rem] shadow-2xl border border-slate-100">
            <div className="w-20 h-20 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-6 text-emerald-600">
              <KeyRound className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-2 tracking-tight text-center">Alterar Senha Padrão</h2>
            <p className="text-slate-500 mb-8 leading-relaxed text-center text-sm">
              Você entrou com a senha padrão. Para garantir a segurança dos seus dados, crie uma nova senha pessoal antes de continuar.
            </p>

            <form onSubmit={handleImmediatePasswordChange} className="space-y-5">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Nova Senha</label>
                <div className="relative">
                  <input
                    required
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full pl-4 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none font-bold transition-all text-slate-800"
                    placeholder="Sua nova senha"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Confirmar Nova Senha</label>
                <div className="relative">
                  <input
                    required
                    type={showNewPassword ? 'text' : 'password'}
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    className="w-full pl-4 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none font-bold transition-all text-slate-800"
                    placeholder="Repita a nova senha"
                  />
                </div>
              </div>

              {changePasswordError && (
                <div className="flex items-start gap-2 text-rose-500 text-xs font-bold bg-rose-50 p-4 rounded-xl border border-rose-100">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{changePasswordError}</span>
                </div>
              )}

              <div className="pt-2 space-y-3">
                <button 
                  type="submit"
                  disabled={changePasswordLoading}
                  className="w-full py-4 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200 flex items-center justify-center gap-2 cursor-pointer text-sm uppercase tracking-wider font-bold"
                >
                  {changePasswordLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Atualizar e Acessar'}
                </button>

                <button 
                  type="button"
                  onClick={async () => {
                    await signOut(auth);
                    setShowChangePasswordModal(false);
                    setNewPassword('');
                    setConfirmNewPassword('');
                  }}
                  className="w-full py-3 text-slate-400 font-bold hover:text-slate-600 transition-all text-[10px] uppercase tracking-widest text-center"
                >
                  Voltar e Sair
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
