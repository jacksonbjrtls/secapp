import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc, addDoc, collection, query, where, getDocs, serverTimestamp, limit } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/errorHandler';
import { validateEmailDomain } from '../lib/domainUtils';
import { ShieldCheck, Loader2, AlertCircle, AlertTriangle, MailCheck } from 'lucide-react';
import { Logo } from '../components/ui/Logo';
import { PrivacyPolicyModal } from '../components/ui/PrivacyPolicyModal';
import { encryptValue, hashEmailForSearch } from '../lib/crypto';

import { MASTER_EMAILS } from '../constants';

const Register: React.FC = () => {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
  const [domainsLoading, setDomainsLoading] = useState(true);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);
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
    
    // If domains are still loading, we should be cautious
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
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 1. Early Domain Check
      const { allowed, domain: emailDomain, isMaster } = await validateEmailDomain(email);
      
      if (!allowed) {
        setError("Este domínio de e-mail não é permitido. Por favor, use seu e-mail corporativo.");
        setLoading(false);
        return;
      }

      // Create user
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 1. Send verification email via direct Firebase Client SDK (preferred and always works)
      let emailError = false;
      try {
        await sendEmailVerification(user);
      } catch (clientErr) {
        console.warn('Direct Firebase verification send failed, trying backup custom Gmail API:', clientErr);
        try {
          await fetch('/api/send-custom-auth-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'verification',
              email: email.toLowerCase().trim(),
              name: displayName
            })
          });
        } catch (fbErr) {
          console.error('Custom verification email backup also failed:', fbErr);
          // Do not fail the registration if only email send fails, as the account is already created
        }
      }

      // 2. Notify Admin via Backend (Using your custom GMAIL config)
      try {
        await fetch('/api/admin/notify-new-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            userEmail: email.toLowerCase().trim(),
            displayName: isMaster ? 'Jackson Bomfim da Silva Júnior' : displayName
          })
        });
      } catch (notifyErr) {
        console.error('Admin notification failed (non-critical):', notifyErr);
      }

      // Create user profile
      const userDisplayName = isMaster ? 'Jackson Bomfim da Silva Júnior' : displayName;
      
      // IMPORTANT: Only master emails (already verified in rules) can register as admin
      // Any other user starts as viewer-pending
      const isActuallyMaster = isMaster;
      const initialStatus = isActuallyMaster ? 'approved' : 'pending';
      const initialRole = isActuallyMaster ? 'admin' : 'viewer';

      const cleanEmail = email.toLowerCase().trim();
      await setDoc(doc(db, 'users', user.uid), {
        email: encryptValue(cleanEmail),
        emailHash: hashEmailForSearch(cleanEmail),
        displayName: encryptValue(userDisplayName),
        role: initialRole,
        status: initialStatus,
        isMaster: isActuallyMaster,
        disabled: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Add their domain to allowed list if it's the master
      if (isActuallyMaster) {
        try {
          const domainRef = doc(db, 'allowed_domains', emailDomain);
          await setDoc(domainRef, {
            domain: emailDomain,
            addedBy: user.uid,
            createdAt: serverTimestamp(),
          });
        } catch (domErr) {
          console.error('Error auto-adding domain for master:', domErr);
        }
      }

      if (emailError) {
        setError('Conta criada, mas houve um erro ao enviar o e-mail de confirmação. Você pode tentar reenviar o e-mail na tela de login.');
        setLoading(false);
        return;
      }

      setVerificationSent(true);
    } catch (err: any) {
      console.error('Registration error:', err);
      let msg = 'Erro ao realizar cadastro. Tente novamente.';
      
      const isEmailInUse = err?.code === 'auth/email-already-in-use' || 
                           err?.message?.includes('auth/email-already-in-use') || 
                           err?.message?.includes('email-already-in-use') ||
                           String(err)?.includes('email-already-in-use');
      
      if (isEmailInUse) {
        msg = 'Este e-mail já possui um cadastro no sistema. Tente fazer login ou recupere sua senha.';
      } else if (err?.code === 'auth/invalid-email') {
        msg = 'O endereço de e-mail informado não é válido.';
      } else if (err?.code === 'auth/weak-password') {
        msg = 'A senha informada é muito fraca. Use pelo menos 6 caracteres.';
      } else if (err?.code === 'auth/network-request-failed') {
        msg = 'Erro de conexão. Verifique sua internet.';
      } else if (err?.message) {
        msg = err.message;
      }
      
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (verificationSent) {
    return (
      <div className="min-h-screen bg-emerald-600 flex flex-col justify-center py-12 px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-12 px-6 shadow-2xl rounded-3xl sm:px-12 text-center space-y-6">
            <div className="bg-emerald-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
              <ShieldCheck className="w-10 h-10 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Cadastro Realizado!</h2>
            <div className="space-y-4">
              <p className="text-gray-600">
                Sua conta para o e-mail <strong>{email}</strong> foi registrada no sistema.
              </p>
              <p className="text-sm text-emerald-700 font-bold bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                Não é necessário verificar e-mail. Agora, aguarde até que um administrador ative e libere seu acesso via painel do sistema para poder entrar.
              </p>
            </div>
            <div className="pt-4">
              <Link
                to="/login"
                className="w-full flex justify-center py-3 px-4 rounded-xl shadow-lg text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all uppercase tracking-widest"
              >
                Ir para Login
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-8 px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-green-500 rounded-full blur-[120px]"></div>
      </div>
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center relative z-10">
        <div className="flex justify-center flex-col items-center gap-4">
          <div className="bg-white p-4 rounded-3xl shadow-2xl border border-slate-800/10 flex items-center justify-center transform hover:scale-105 transition-all duration-300">
            <Logo className="h-16" />
          </div>
          <p className="text-emerald-100/60 font-medium tracking-wide text-sm">Crie sua conta corporativa</p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-10 px-6 shadow-2xl rounded-3xl sm:px-12 border border-white/20">
          <form className="space-y-4" onSubmit={handleRegister}>
             <div>
              <label className="block text-sm font-medium text-gray-700">Nome Completo</label>
              <input
                type="text"
                required
                className="mt-1 block w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 transition-all"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="João Silva"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">E-mail Corporativo</label>
              <input
                type="email"
                required
                className="mt-1 block w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 transition-all"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="joao@empresa.com"
              />
              {email.includes('@') && !isDomainAllowed && (
                <p className="mt-1 text-[10px] text-amber-600 font-bold flex items-center gap-1 uppercase tracking-tight">
                  <AlertTriangle className="w-3 h-3" /> Este domínio de e-mail não é permitido
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Senha</label>
              <input
                type="password"
                required
                className="mt-1 block w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 transition-all"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Confirmar Senha</label>
              <input
                type="password"
                required
                className="mt-1 block w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 transition-all"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="text-red-500 text-sm bg-red-50 p-3 rounded-lg border border-red-100 flex items-start gap-2">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Explicit Consent Checkbox (LGPD) */}
            <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-150 p-3 rounded-xl">
              <input
                id="acceptedTerms"
                type="checkbox"
                required
                className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded mt-0.5"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
              />
              <label htmlFor="acceptedTerms" className="text-xs text-gray-600 font-semibold leading-relaxed">
                Li e concordo que meus dados de identificação e assinatura digital de segurança do trabalho serão tratados pelo sistema para fins de cumprimento das Normas Regulamentadoras (SST).{' '}
                <button
                  type="button"
                  onClick={() => setPrivacyModalOpen(true)}
                  className="text-emerald-600 font-bold hover:underline underline-offset-2 inline-block cursor-pointer"
                >
                  Ver Política de Privacidade
                </button>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading || !isDomainAllowed || !acceptedTerms}
              className="w-full flex justify-center py-3 px-4 rounded-xl shadow-lg shadow-emerald-900/20 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all uppercase tracking-widest"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Registrar'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Já tem uma conta?{' '}
              <Link to="/login" className="font-bold text-emerald-600 hover:text-emerald-500">
                Fazer login
              </Link>
            </p>
          </div>
        </div>
      </div>
      
      {/* Privacy Policy Modal */}
      <PrivacyPolicyModal isOpen={privacyModalOpen} onClose={() => setPrivacyModalOpen(false)} />
    </div>
  );
};

export default Register;
