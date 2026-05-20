import React, { useState, useRef } from 'react';
import { updateProfile, updatePassword } from 'firebase/auth';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { handleFirestoreError, OperationType } from '../lib/errorHandler';
import { 
  User, 
  Users,
  Camera, 
  Lock, 
  Save, 
  AlertCircle, 
  CheckCircle2,
  Loader2,
  Upload,
  Image as ImageIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

const Profile: React.FC = () => {
  const { profile, user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [photoURL, setPhotoURL] = useState(profile?.photoURL || '');
  const [group, setGroup] = useState(profile?.group || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Clear messages automatically after 5 seconds
  React.useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess('');
        setError('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success, error]);

  React.useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName || '');
      setPhotoURL(profile.photoURL || '');
      setGroup(profile.group || '');
    }
  }, [profile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Por favor, selecione uma imagem válida.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Create canvas for compression
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 400;
        const MAX_HEIGHT = 400;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        // Convert to quality-reduced JPEG to save space
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        setPhotoURL(dataUrl);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // Update Auth Profile
      const isDataUrl = photoURL.startsWith('data:');
      
      await updateProfile(auth.currentUser, {
        displayName,
        ...(isDataUrl ? {} : { photoURL })
      });

      // Update Firestore User Doc
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        displayName,
        photoURL,
        group: group || null,
        updatedAt: serverTimestamp()
      });

      setSuccess('Perfil atualizado com sucesso!');
    } catch (err: any) {
      console.error('Update Profile Error:', err);
      if (err.code?.startsWith('auth/')) {
        setError(`Erro na conta: ${err.message}`);
      } else {
        handleFirestoreError(err, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
        setError('Erro ao atualizar banco de dados.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !newPassword) return;

    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    if (newPassword.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await updatePassword(auth.currentUser, newPassword);
      
      // Also update Firestore to clear forced change flag if it exists
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        mustChangePassword: false,
        updatedAt: serverTimestamp()
      });

      setNewPassword('');
      setConfirmPassword('');
      setSuccess('Senha atualizada com sucesso!');
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/requires-recent-login') {
        setError('Para trocar a senha, você precisa ter feito login recentemente. Saia e entre novamente.');
      } else {
        setError('Erro ao atualizar senha: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-20">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Meu Perfil</h1>
        <p className="text-slate-500 mt-1">Gerencie suas informações pessoais e segurança da conta.</p>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Profile Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm overflow-hidden"
        >
          <div className="flex items-center gap-4 mb-8">
            <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 border border-emerald-100 shrink-0">
              {profile?.photoURL ? (
                <img src={profile.photoURL} alt="Avatar" className="w-full h-full object-cover rounded-2xl" />
              ) : (
                <User className="w-8 h-8" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Dados Pessoais</h2>
              <p className="text-sm text-slate-500">Atualize seu nome de exibição e foto.</p>
            </div>
          </div>

          <form onSubmit={handleUpdateProfile} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Nome de Exibição</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all outline-none"
                  placeholder="Seu nome"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Letra de Trabalho (Escala)</label>
              <div className="relative">
                <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <select
                  value={group}
                  onChange={(e) => setGroup(e.target.value as any)}
                  className={cn(
                    "w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold focus:ring-2 focus:ring-emerald-500 transition-all outline-none appearance-none",
                    group ? "text-emerald-600" : "text-slate-400"
                  )}
                >
                  <option value="">Nenhuma</option>
                  <option value="A">Letra A</option>
                  <option value="B">Letra B</option>
                  <option value="C">Letra C</option>
                  <option value="D">Letra D</option>
                  <option value="E">Letra E</option>
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                  <span className="text-slate-400">▼</span>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 ml-1">Isso definirá qual letra da escala será destacada para você.</p>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Foto de Perfil</label>
              
              <div className="flex flex-col sm:flex-row items-center gap-6 p-6 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="w-24 h-24 bg-white rounded-2xl flex items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 overflow-hidden shrink-0">
                  {photoURL ? (
                    <img src={photoURL} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="w-8 h-8" />
                  )}
                </div>
                
                <div className="flex-1 space-y-3 w-full">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept="image/*"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-100 transition-all shadow-sm"
                    >
                      <Upload className="w-4 h-4" />
                      Escolher Foto
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const input = fileInputRef.current;
                        if (input) {
                          input.setAttribute('capture', 'user');
                          input.click();
                          // Reset capture after use to allow normal selection
                          setTimeout(() => input.removeAttribute('capture'), 1000);
                        }
                      }}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-100 transition-all shadow-sm"
                    >
                      <Camera className="w-4 h-4" />
                      Tirar Foto
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400">Suporta JPG, PNG. Recomendado: 400x400px.</p>
                </div>
              </div>

              <div className="relative">
                <ImageIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="url"
                  value={photoURL}
                  onChange={(e) => setPhotoURL(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all outline-none"
                  placeholder="Ou cole a URL da imagem..."
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-900 text-white rounded-2xl py-4 font-black uppercase tracking-widest text-sm hover:bg-slate-800 transition-all disabled:opacity-50 flex items-center justify-center gap-2 group shadow-xl"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5 group-hover:scale-110 transition-transform" />}
              Salvar Alterações
            </button>
          </form>
        </motion.div>

        {/* Change Password */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm overflow-hidden"
        >
          <div className="flex items-center gap-4 mb-8">
            <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-600 border border-rose-100 shrink-0">
              <Lock className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Segurança</h2>
              <p className="text-sm text-slate-500">Altere sua senha de acesso.</p>
            </div>
          </div>

          <form onSubmit={handleUpdatePassword} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Nova Senha</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-sm font-medium focus:ring-2 focus:ring-rose-500 focus:border-rose-500 transition-all outline-none"
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Confirmar Nova Senha</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-sm font-medium focus:ring-2 focus:ring-rose-500 focus:border-rose-500 transition-all outline-none"
                  placeholder="Confirme sua senha"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !newPassword}
              className="w-full bg-rose-600 text-white rounded-2xl py-4 font-black uppercase tracking-widest text-sm hover:bg-rose-500 transition-all disabled:opacity-50 flex items-center justify-center gap-2 group shadow-xl"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5 group-hover:scale-110 transition-transform" />}
              Atualizar Senha
            </button>
          </form>
        </motion.div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-rose-500 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-3 z-50 min-w-[300px]"
          >
            <AlertCircle className="w-6 h-6" />
            <span className="font-bold">{error}</span>
          </motion.div>
        )}

        {success && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-emerald-500 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-3 z-50 min-w-[300px]"
          >
            <CheckCircle2 className="w-6 h-6" />
            <span className="font-bold">{success}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Profile;
