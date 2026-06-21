import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { updateProfile, updatePassword } from 'firebase/auth';
import { doc, updateDoc, serverTimestamp, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { handleFirestoreError, OperationType } from '../lib/errorHandler';
import { safeHtml2canvas } from '../lib/html2canvasShim';
import { jsPDF } from 'jspdf';
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
  Image as ImageIcon,
  Award,
  Calendar,
  Clock,
  Eye,
  Printer,
  Download,
  UserCheck,
  X,
  Maximize2,
  Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

const Profile: React.FC = () => {
  const { profile, user, isAdmin } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [photoURL, setPhotoURL] = useState(profile?.photoURL || '');
  const [group, setGroup] = useState(profile?.group || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [courses, setCourses] = useState<any[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);

  // States for direct PDF generation
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [activeCertificateForPdf, setActiveCertificateForPdf] = useState<{ course: any; participantName: string } | null>(null);

  // Unused legacy modal states retained for compiler compatibility
  const [viewingCourse, setViewingCourse] = useState<any>(null);
  const [viewingOperatorName, setViewingOperatorName] = useState('');
  const [certificateSide, setCertificateSide] = useState('frente');
  const [certificateZoom, setCertificateZoom] = useState('fit');
  const previewContainerSize = { width: 1122.52, height: 793.70 };
  const previewContainerRef = useRef<any>(null);
  const isInIframe = false;
  const triggerDirectPrint = () => {};

  React.useEffect(() => {
    const fetchUserCertificates = async () => {
      if (!user?.uid) return;
      try {
        const querySnap = await getDocs(
          query(collection(db, 'training_courses'), orderBy('createdAt', 'desc'))
        );
        const list = querySnap.docs
          .map(doc => ({ id: doc.id, ...doc.data() as any }))
          .filter(c => c.participants?.includes(user.uid));
        setCourses(list);
      } catch (err) {
        console.error('Erro ao buscar certificados no perfil:', err);
      } finally {
        setCoursesLoading(false);
      }
    };
    fetchUserCertificates();
  }, [user]);

  const handlePrint = async (course: any, participantName: string) => {
    if (isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    setActiveCertificateForPdf({ course, participantName });

    // Wait for the hidden container to render in the DOM
    await new Promise((resolve) => setTimeout(resolve, 800));

    try {
      const frontElement = document.getElementById('pdf-cert-front');
      const backElement = document.getElementById('pdf-cert-back');

      if (!frontElement || !backElement) {
        throw new Error('Elementos do certificado não encontrados no DOM.');
      }

      // Capture front side with optimal configuration for high quality print
      const canvasFront = await safeHtml2canvas(frontElement, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#FFFFFF',
        windowWidth: 1122.52,
        windowHeight: 793.70
      });

      // Capture back side
      const canvasBack = await safeHtml2canvas(backElement, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#FFFFFF',
        windowWidth: 1122.52,
        windowHeight: 793.70
      });

      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const imgWidth = 297; // A4 layout width in landscape format mm
      const imgHeight = 210; // A4 layout height in landscape format mm

      // Add Page 1
      const dataUrlFront = canvasFront.toDataURL('image/png', 1.0);
      pdf.addImage(dataUrlFront, 'PNG', 0, 0, imgWidth, imgHeight, undefined, 'FAST');

      // Add Page 2
      pdf.addPage();
      const dataUrlBack = canvasBack.toDataURL('image/png', 1.0);
      pdf.addImage(dataUrlBack, 'PNG', 0, 0, imgWidth, imgHeight, undefined, 'FAST');

      // Save using participants dynamic filename, sanitizing name strings
      const sanitizedName = participantName.replace(/[^a-z0-9]/gi, '_');
      pdf.save(`Certificado_${sanitizedName}.pdf`);

    } catch (err) {
      console.error('Erro ao gerar PDF do certificado:', err);
      alert('Houve um erro técnico ao gerar o seu certificado. Por favor tente no computador ou novamente.');
    } finally {
      setIsGeneratingPdf(false);
      setActiveCertificateForPdf(null);
    }
  };

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
      {/* Print-Only Style Overlay */}
      <style dangerouslySetInnerHTML={{ __html: `
        /* Hide print-only container on normal screens */
        .print-only-container {
          display: none !important;
        }

        @media print {
          /* Hide \`#root\` and other screen elements completely */
          #root,
          .no-print {
            display: none !important;
            visibility: hidden !important;
          }

          body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
          }

          /* Force display of the print-only container */
          .print-only-container {
            display: block !important;
            visibility: visible !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 297mm !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .print-only-container * {
            visibility: visible !important;
          }

          /* Define layout of individual pages */
          .certificate-print-page {
            display: flex !important;
            visibility: visible !important;
            width: 297mm !important;
            height: 210mm !important;
            page-break-after: always !important;
            break-after: page !important;
            position: relative !important;
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            background: white !important;
            background-color: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Avoid empty blank page at the end of output */
          .certificate-print-page:last-child {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }

          @page {
            size: A4 landscape;
            margin: 0;
          }
        }
      ` }} />

      <div className="no-print">
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Meu Perfil</h1>
        <p className="text-slate-500 mt-1">Gerencie suas informações pessoais e segurança da conta.</p>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Profile Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm overflow-hidden no-print"
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
                  disabled={loading}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all outline-none disabled:opacity-60 disabled:bg-slate-100/40"
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
                  disabled={loading}
                  className={cn(
                    "w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold focus:ring-2 focus:ring-emerald-500 transition-all outline-none appearance-none disabled:opacity-60 disabled:bg-slate-100/40",
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
                      disabled={loading}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-100 transition-all shadow-sm disabled:opacity-50"
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
                      disabled={loading}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-100 transition-all shadow-sm disabled:opacity-50"
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
                  disabled={loading}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all outline-none disabled:opacity-60 disabled:bg-slate-100/40"
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
          className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm overflow-hidden no-print"
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

        {/* Meus Certificados Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm overflow-hidden no-print"
        >
          <div className="flex items-center gap-4 mb-8">
            <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 border border-emerald-100 shrink-0">
              <Award className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Meus Certificados</h2>
              <p className="text-sm text-slate-500">Visualize seus certificados de treinamentos e qualificações aplicados na Secagem.</p>
            </div>
          </div>

          {coursesLoading ? (
            <div className="flex items-center justify-center py-12 gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
              <span className="text-slate-500 text-sm font-bold animate-pulse">Buscando seus treinamentos...</span>
            </div>
          ) : courses.length === 0 ? (
            <div className="text-center py-12 px-4 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
              <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3 text-slate-400">
                <Award className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-700 mb-0.5">Nenhum certificado disponível</h3>
              <p className="text-slate-500 text-xs max-w-sm mx-auto">
                Seu usuário ainda não foi incluído como participante em nenhum curso. Entre em contato com o responsável técnico do treinamento para incluir seu nome!
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {courses.map((course) => (
                <div 
                  key={course.id}
                  className="p-5 border border-slate-200 rounded-2xl bg-white hover:border-emerald-200 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <span className="bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase px-2.5 py-1 rounded-md inline-block">
                      {course.hours} hora(s) de qualificação
                    </span>
                    <h3 className="text-sm font-black text-slate-900 truncate">{course.title}</h3>
                    <div className="flex items-center gap-4 text-xs text-slate-500 font-bold flex-wrap mt-1">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>Período: {course.period}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                        <span>Instrutor: {course.instructor}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handlePrint(course, profile?.displayName || user?.displayName || user?.email || 'COLABORADOR')}
                    disabled={isGeneratingPdf}
                    className="px-4 py-2.5 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200 hover:border-emerald-200 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    {isGeneratingPdf && activeCertificateForPdf?.course.id === course.id ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                        Gerando PDF...
                      </>
                    ) : (
                      <>
                        <Printer className="w-4 h-4" /> Imprimir / PDF
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Viewing / Printing Certificate Modal */}
      <AnimatePresence>
        {false && viewingCourse && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              className="bg-slate-900 rounded-[2.5rem] w-full max-w-[320mm] overflow-hidden shadow-2xl flex flex-col max-h-[96vh]"
            >
              {/* Controls bar */}
              <div className="p-4 bg-slate-800 border-b border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 select-none text-white shrink-0 no-print">
                <div className="flex items-center gap-3">
                  <div className="bg-emerald-500 p-2 rounded-xl text-slate-900">
                    <Award className="w-5 h-5 font-black" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black truncate max-w-xs sm:max-w-md">
                      Certificado: {viewingOperatorName}
                    </h4>
                    <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                      {viewingCourse.title}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 lg:gap-3 w-full sm:w-auto">
                  <div className="bg-slate-950 p-1 rounded-xl flex gap-1">
                    <button
                      onClick={() => setCertificateSide('frente')}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all cursor-pointer",
                        certificateSide === 'frente' 
                          ? "bg-emerald-600 text-white shadow-sm"
                          : "text-slate-400 hover:text-white"
                      )}
                    >
                      Frente
                    </button>
                    <button
                      onClick={() => setCertificateSide('verso')}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all cursor-pointer",
                        certificateSide === 'verso' 
                          ? "bg-emerald-600 text-white shadow-sm"
                          : "text-slate-400 hover:text-white"
                      )}
                    >
                      Verso
                    </button>
                  </div>

                  {/* Zoom controls */}
                  <div className="bg-slate-950 p-1 rounded-xl flex gap-1">
                    <button
                      onClick={() => setCertificateZoom('fit')}
                      className={cn(
                        "px-1.5 sm:px-2.5 py-1.5 rounded-lg text-[10px] sm:text-xs font-black uppercase transition-all flex items-center gap-1 cursor-pointer",
                        certificateZoom === 'fit' 
                          ? "bg-emerald-600 text-white shadow-sm"
                          : "text-slate-400 hover:text-white"
                      )}
                    >
                      <Maximize2 className="w-3 h-3" /> Ajustar
                    </button>
                    <button
                      onClick={() => setCertificateZoom('scroll')}
                      className={cn(
                        "px-1.5 sm:px-2.5 py-1.5 rounded-lg text-[10px] sm:text-xs font-black uppercase transition-all flex items-center gap-1 cursor-pointer",
                        certificateZoom === 'scroll' 
                          ? "bg-emerald-600 text-white shadow-sm"
                          : "text-slate-400 hover:text-white"
                      )}
                    >
                      <Search className="w-3 h-3" /> Rolar (100%)
                    </button>
                  </div>

                  <button
                    onClick={triggerDirectPrint}
                    className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl transition-all font-bold text-xs flex items-center gap-2 cursor-pointer"
                  >
                    <Printer className="w-4 h-4" /> Imprimir / PDF
                  </button>
                  
                  <button
                    onClick={() => {
                      setViewingCourse(null);
                      setViewingOperatorName('');
                    }}
                    className="bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 px-4 py-2 rounded-xl transition-all font-bold text-xs cursor-pointer"
                  >
                    Sair
                  </button>
                </div>
              </div>

              {/* Landscape Sandbox Certificate display */}
              {(() => {
                const refWidth = 1122.52;
                const refHeight = 793.70;
                const paddingX = 24;
                const paddingY = 24;
                const availableWidth = Math.max(0, previewContainerSize.width - paddingX);
                const availableHeight = Math.max(0, previewContainerSize.height - paddingY);
                const scale = certificateZoom === 'fit'
                  ? Math.min(availableWidth / refWidth, availableHeight / refHeight, 1)
                  : Math.max(0.95, Math.min(availableWidth / refWidth, availableHeight / refHeight, 1));
                return (
                  <div 
                    ref={previewContainerRef}
                    className="bg-slate-950 flex-1 p-4 md:p-6 flex flex-col items-center justify-center overflow-auto min-h-[300px]"
                  >
                    {isInIframe && (
                      <div className="mb-4 bg-amber-500/10 border border-amber-500/30 text-amber-200 rounded-2xl p-4 text-xs font-semibold leading-relaxed max-w-2xl mx-auto select-none flex items-start gap-2.5 no-print">
                        <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                        <span>
                          <strong>Aviso do Sistema (Visualizador):</strong> Navegadores bloqueiam chamadas de impressão comandadas de dentro de painéis integrados (keyframes/iframes). Para imprimir e gerar o certificado com sucesso, clique no botão <strong>"Abrir em nova aba"</strong> no topo superior direito da tela e clique na mesma opção lá!
                        </span>
                      </div>
                    )}
                    {certificateZoom === 'scroll' && (
                      <div className="mb-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-2xl p-3.5 text-[11px] font-semibold leading-relaxed max-w-2xl mx-auto select-none flex items-center gap-2.5 no-print animate-pulse">
                        <AlertCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>
                          <strong>Modo Rolar Ativo:</strong> Arraste ou deslize horizontalmente para ver todo o certificado em tamanho real (100% nítido).
                        </span>
                      </div>
                    )}
                    <div 
                      style={{
                        width: `${refWidth * scale}px`,
                        height: `${refHeight * scale}px`,
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                      className="rounded-2xl shadow-2xl shrink-0 border border-white/5"
                    >
                      <div 
                        style={{
                          position: 'absolute',
                          left: '50%',
                          top: '50%',
                          width: `${refWidth}px`,
                          height: `${refHeight}px`,
                          transform: `translate(-50%, -50%) scale(${scale})`,
                          transformOrigin: 'center center',
                        }}
                        className="certificate-print-area bg-white text-slate-900 border border-slate-200 flex relative select-none overflow-hidden font-sans"
                      >
                  
                  {certificateSide === 'frente' ? (
                    /* ====== FRONT SIDE OF CERTIFICATE ====== */
                    <div className="w-full h-full flex relative">
                      
                      {/* Left Geometric Accent Column */}
                      <div className="w-[240px] bg-emerald-800 h-full flex flex-col justify-center items-center py-6 relative shadow-inner select-none shrink-0 overflow-hidden">
                        {/* Upper yellow banner */}
                        <div className="absolute top-0 left-0 w-0 h-0 border-t-[100px] border-t-yellow-400 border-r-[240px] border-r-transparent opacity-90 font-sans"></div>
                        
                        {/* Three custom treated images stacked vertically as perfect circle borders without any text or footer logos */}
                        <div className="flex flex-col gap-5 items-center justify-center z-10 w-full px-4">
                          <div className="w-[140px] h-[140px] rounded-full shadow-md shadow-black/30 overflow-hidden shrink-0 relative hover:scale-[1.05] transition-transform duration-300">
                            <img 
                              src="/logo_file/Imagem_Parte%20%C3%BAmida.png"
                              alt="Parte Úmida"
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          </div>

                          <div className="w-[140px] h-[140px] rounded-full shadow-md shadow-black/30 overflow-hidden shrink-0 relative hover:scale-[1.05] transition-transform duration-300">
                            <img 
                              src="/logo_file/Imagem_Enfardamento%202.png"
                              alt="Enfardamento 2"
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          </div>

                          <div className="w-[140px] h-[140px] rounded-full shadow-md shadow-black/30 overflow-hidden shrink-0 relative hover:scale-[1.05] transition-transform duration-300">
                            <img 
                              src="/logo_file/Imagem_Enfardamento%203.png"
                              alt="Enfardamento 3"
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        </div>

                        {/* Lower yellow banner */}
                        <div className="absolute bottom-0 right-0 w-0 h-0 border-b-[100px] border-b-yellow-400 border-l-[240px] border-l-transparent opacity-90 pointer-events-none"></div>
                      </div>

                      {/* Main Certificate Area */}
                      <div className="flex-1 p-12 flex flex-col justify-between h-full bg-white relative">
                        {/* Subtitle row at the top */}
                        <div className="text-center w-full select-none mb-4 shrink-0 px-2 flex flex-col items-center">
                          <span className="text-[10px] font-black tracking-[0.25em] text-emerald-800 uppercase font-sans">
                            Eldorado Brasil Celulose S.A.
                          </span>
                          <span className="text-[8px] font-bold tracking-widest text-slate-400 uppercase mt-0.5">
                            Unidade Industrial Três Lagoas • Processo de Secagem
                          </span>
                          <div className="h-16 flex items-center justify-center mt-3">
                            <img 
                              src="/logo_file/Logo_Eldorado.png" 
                              alt="Eldorado" 
                              className="h-14 object-contain"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        </div>

                        {/* Middle Text block */}
                        <div className="text-center flex-1 flex flex-col justify-center px-4 self-center max-w-2xl my-auto">
                          <h1 className="text-5xl font-extrabold text-emerald-900 tracking-tight uppercase mb-6 font-sans">
                            CERTIFICADO
                          </h1>
                          
                          <p className="text-base text-slate-600 font-semibold mb-4 leading-relaxed">
                            A Eldorado Brasil Celulose S/A, certifica que
                          </p>
                          
                          <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase mb-6 px-4 py-2 border-b-2 border-emerald-800 bg-slate-50 border-double">
                            {viewingOperatorName}
                          </h2>
                          
                          <p className="text-sm text-slate-700 leading-relaxed font-semibold">
                            participou com êxito do treinamento de qualificação e aperfeiçoamento operacional de 
                            <span className="block text-emerald-800 text-lg font-black mt-1 uppercase">
                              {viewingCourse.title}
                            </span>
                          </p>

                          <div className="flex items-center justify-center gap-8 mt-5 text-sm font-bold text-slate-600">
                            <div>no período de <span className="font-extrabold text-slate-900">{viewingCourse.period}</span></div>
                            <div className="w-1.5 h-1.5 bg-slate-300 rounded-full"></div>
                            <div>com carga horária de <span className="font-extrabold text-slate-900">{viewingCourse.hours} hora(s)</span></div>
                          </div>
                        </div>

                        {/* Bottom Signatures Row */}
                        <div className="border-t border-slate-100 pt-8 mt-4 shrink-0 flex items-start justify-between px-4">
                          {/* Instructor / Responsável Técnico signature */}
                          <div className="text-center w-72 flex flex-col items-center">
                            {/* Decorative handwritten placeholder signature */}
                            <div className="h-14 flex items-center justify-center font-serif italic text-emerald-800/80 text-lg select-none">
                              {viewingCourse.instructor.split(' ').slice(0, 3).join(' ')}
                            </div>
                            <div className="w-full border-t border-slate-400 mt-1 mb-2"></div>
                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest leading-none mb-1 font-sans">
                              Responsável Técnico
                            </p>
                            <p className="text-[11px] font-extrabold text-slate-800 mb-0.5">{viewingCourse.instructor}</p>
                            <p className="text-[9px] text-slate-500 font-semibold max-w-[200px] truncate">{viewingCourse.instructorTitle}</p>
                          </div>

                          {/* Date info section */}
                          <div className="flex flex-col items-center justify-end w-64 h-[100px] pb-3">
                            <div className="text-center text-xs text-slate-500 font-bold font-sans">
                              Três Lagoas (MS), {viewingCourse.period.split(' a ').slice(-1)[0]}
                            </div>
                          </div>

                          {/* Collaborator signature placeholder (clean right sidebar, no logos) */}
                          <div className="text-center w-72 flex flex-col items-center justify-end">
                            <div className="h-14 flex items-center justify-center">
                              {/* Empty space for signature */}
                            </div>
                            <div className="w-full border-t border-slate-400 mt-1 mb-2"></div>
                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest leading-none mb-1 font-sans">
                              Colaborador
                            </p>
                            <p className="text-[11px] font-extrabold text-slate-800 truncate max-w-[220px]">{viewingOperatorName}</p>
                          </div>
                        </div>

                        {/* Safe lines layout frame decoration */}
                        <div className="absolute top-4 left-4 right-4 bottom-4 border border-emerald-800/10 pointer-events-none rounded-xl"></div>
                        <div className="absolute top-5 left-5 right-5 bottom-5 border border-emerald-800/5 pointer-events-none rounded-lg"></div>
                      </div>
                    </div>
                  ) : (
                    /* ====== BACK SIDE OF CERTIFICATE ====== */
                    <div className="w-full h-full flex relative">
                      <div className="flex-1 p-12 pr-16 flex flex-col justify-between h-full bg-white relative">
                        <div>
                          <h1 className="text-3xl font-black text-emerald-900 tracking-tight uppercase mb-2 select-none">
                            CONTEÚDO PROGRAMÁTICO
                          </h1>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-0.5 mb-6">
                            Programa de Conhecimentos Ministrados
                          </p>

                          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 min-h-[95mm] overflow-hidden whitespace-pre-wrap font-mono text-xs font-bold text-slate-700 leading-relaxed max-w-3xl">
                            {viewingCourse.syllabus}
                          </div>
                        </div>

                        <div className="flex justify-between items-end border-t border-slate-100 pt-8 mt-4 shrink-0 max-w-3xl">
                          <div>
                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Responsável pela aplicação</p>
                            <p className="text-xs font-extrabold text-slate-800 mt-1">{viewingCourse.instructor}</p>
                            <p className="text-[10px] text-slate-500 font-semibold">{viewingCourse.instructorTitle}</p>
                          </div>
                          
                          <div className="text-right text-xs text-slate-400 font-bold select-none">
                            Eldorado Brasil Celulose S.A. <br />
                            Unidade Industrial Três Lagoas / Secagem
                          </div>
                        </div>

                        <div className="absolute top-4 left-4 right-4 bottom-4 border border-emerald-800/10 pointer-events-none rounded-xl"></div>
                        <div className="absolute top-5 left-5 right-5 bottom-5 border border-emerald-800/5 pointer-events-none rounded-lg"></div>
                      </div>

                      <div className="w-[124px] bg-emerald-800 h-full flex flex-col justify-between items-center py-8 relative shadow-inner select-none shrink-0 overflow-hidden">
                        <div className="absolute top-0 right-0 w-0 h-0 border-t-[80px] border-t-yellow-400 border-l-[120px] border-l-transparent opacity-90"></div>

                        <div className="absolute bottom-0 left-0 w-0 h-0 border-b-[80px] border-b-yellow-400 border-r-[120px] border-r-transparent opacity-90"></div>
                      </div>
                    </div>
                  )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {false && viewingCourse && createPortal(
        <div className="print-only-container">
          {/* Page 1: Front */}
          <div className="certificate-print-page font-sans">
            <div className="w-full h-full flex relative">
              {/* Left Geometric Design Accent Column */}
              <div className="w-[240px] bg-emerald-800 h-full flex flex-col justify-center items-center py-6 relative shadow-inner select-none shrink-0 overflow-hidden">
                <div className="absolute top-0 left-0 w-0 h-0 border-t-[100px] border-t-yellow-400 border-r-[240px] border-r-transparent opacity-90"></div>
                
                <div className="flex flex-col gap-5 items-center justify-center z-10 w-full px-4">
                  <div className="w-[140px] h-[140px] rounded-full shadow-md shadow-black/30 overflow-hidden shrink-0 relative">
                    <img 
                      src="/logo_file/Imagem_Parte%20%C3%BAmida.png"
                      alt="Parte Úmida"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="w-[140px] h-[140px] rounded-full shadow-md shadow-black/30 overflow-hidden shrink-0 relative">
                    <img 
                      src="/logo_file/Imagem_Enfardamento%202.png"
                      alt="Enfardamento 2"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="w-[140px] h-[140px] rounded-full shadow-md shadow-black/30 overflow-hidden shrink-0 relative">
                    <img 
                      src="/logo_file/Imagem_Enfardamento%203.png"
                      alt="Enfardamento 3"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>

                <div className="absolute bottom-0 right-0 w-0 h-0 border-b-[100px] border-b-yellow-400 border-l-[240px] border-l-transparent opacity-90 pointer-events-none"></div>
              </div>

              {/* Main certificate text area */}
              <div className="flex-1 p-12 flex flex-col justify-between h-full bg-white relative">
                <div className="text-center w-full select-none mb-4 shrink-0 px-2 flex flex-col items-center">
                  <span className="text-[10px] font-black tracking-[0.25em] text-emerald-800 uppercase font-sans">
                    Eldorado Brasil Celulose S.A.
                  </span>
                  <span className="text-[8px] font-bold tracking-widest text-slate-400 uppercase mt-0.5">
                    Unidade Industrial Três Lagoas • Processo de Secagem
                  </span>
                  <div className="h-16 flex items-center justify-center mt-3">
                    <img 
                      src="/logo_file/Logo_Eldorado.png" 
                      alt="Eldorado" 
                      className="h-14 object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </div>

                <div className="text-center flex-1 flex flex-col justify-center px-4 self-center max-w-2xl my-auto">
                  <h1 className="text-5xl font-extrabold text-emerald-900 tracking-tight uppercase mb-6 font-sans">
                    CERTIFICADO
                  </h1>
                  
                  <p className="text-base text-slate-600 font-semibold mb-4 leading-relaxed">
                    A Eldorado Brasil Celulose S/A, certifica que
                  </p>
                  
                  <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase mb-6 px-4 py-2 border-b-2 border-emerald-800 bg-slate-50 border-double">
                    {viewingOperatorName}
                  </h2>
                  
                  <p className="text-sm text-slate-700 leading-relaxed font-semibold">
                    participou com êxito do treinamento de qualificação e aperfeiçoamento operacional de 
                    <span className="block text-emerald-800 text-lg font-black mt-1 uppercase">
                      {viewingCourse.title}
                    </span>
                  </p>

                  <div className="flex items-center justify-center gap-8 mt-5 text-sm font-bold text-slate-600">
                    <div>no período de <span className="font-extrabold text-slate-900">{viewingCourse.period}</span></div>
                    <div className="w-1.5 h-1.5 bg-slate-300 rounded-full"></div>
                    <div>com carga horária de <span className="font-extrabold text-slate-900">{viewingCourse.hours} hora(s)</span></div>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-8 mt-4 shrink-0 flex items-start justify-between px-4">
                  <div className="text-center w-72 flex flex-col items-center">
                    <div className="h-14 flex items-center justify-center font-serif italic text-emerald-800/80 text-lg select-none">
                      {viewingCourse.instructor.split(' ').slice(0, 3).join(' ')}
                    </div>
                    <div className="w-full border-t border-slate-400 mt-1 mb-2"></div>
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest leading-none mb-1 font-sans">
                      Responsável Técnico
                    </p>
                    <p className="text-[11px] font-extrabold text-slate-800 mb-0.5">{viewingCourse.instructor}</p>
                    <p className="text-[9px] text-slate-500 font-semibold max-w-[200px] truncate">{viewingCourse.instructorTitle}</p>
                  </div>

                  {/* Date info section */}
                  <div className="flex flex-col items-center justify-end w-64 h-[100px] pb-3">
                    <div className="text-center text-xs text-slate-500 font-bold font-sans">
                      Três Lagoas (MS), {viewingCourse.period.split(' a ').slice(-1)[0]}
                    </div>
                  </div>

                  <div className="text-center w-72 flex flex-col items-center justify-end">
                    <div className="h-14 flex items-center justify-center"></div>
                    <div className="w-full border-t border-slate-400 mt-1 mb-2"></div>
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest leading-none mb-1 font-sans">
                      Colaborador
                    </p>
                    <p className="text-[11px] font-extrabold text-slate-800 truncate max-w-[220px]">{viewingOperatorName}</p>
                  </div>
                </div>

                <div className="absolute top-4 left-4 right-4 bottom-4 border border-emerald-800/10 pointer-events-none rounded-xl"></div>
                <div className="absolute top-5 left-5 right-5 bottom-5 border border-emerald-800/5 pointer-events-none rounded-lg"></div>
              </div>
            </div>
          </div>

          {/* Page 2: Back */}
          <div className="certificate-print-page font-sans">
            <div className="w-full h-full flex relative">
              <div className="flex-1 p-12 pr-16 flex flex-col justify-between h-full bg-white relative">
                <div>
                  <h1 className="text-3xl font-black text-emerald-950 tracking-tight uppercase mb-2 select-none">
                    CONTEÚDO PROGRAMÁTICO
                  </h1>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-0.5 mb-6">
                    Programa de Conhecimentos Ministrados
                  </p>

                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 min-h-[95mm] overflow-hidden whitespace-pre-wrap font-mono text-xs font-bold text-slate-700 leading-relaxed max-w-3xl">
                    {viewingCourse.syllabus}
                  </div>
                </div>

                <div className="flex justify-between items-end border-t border-slate-100 pt-8 mt-4 shrink-0 max-w-3xl">
                  <div>
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Responsável pela aplicação</p>
                    <p className="text-xs font-extrabold text-slate-800 mt-1">{viewingCourse.instructor}</p>
                    <p className="text-[10px] text-slate-500 font-semibold">{viewingCourse.instructorTitle}</p>
                  </div>
                  
                  <div className="text-right text-xs text-slate-400 font-bold select-none">
                    Eldorado Brasil Celulose S.A. <br />
                    Unidade Industrial Três Lagoas / Secagem
                  </div>
                </div>

                <div className="absolute top-4 left-4 right-4 bottom-4 border border-emerald-800/10 pointer-events-none rounded-xl"></div>
                <div className="absolute top-5 left-5 right-5 bottom-5 border border-emerald-800/5 pointer-events-none rounded-lg"></div>
              </div>

              <div className="w-[124px] bg-emerald-800 h-full flex flex-col justify-between items-center py-8 relative shadow-inner select-none shrink-0 overflow-hidden">
                <div className="absolute top-0 right-0 w-0 h-0 border-t-[80px] border-t-yellow-400 border-l-[120px] border-l-transparent opacity-90"></div>

                <div className="absolute bottom-0 left-0 w-0 h-0 border-b-[80px] border-b-yellow-400 border-r-[120px] border-r-transparent opacity-90"></div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

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

      {/* Off-screen high fidelity A4 Landscape Container for html2canvas capture */}
      {activeCertificateForPdf && (
        <div 
          style={{ 
            position: 'absolute', 
            left: '-9999px', 
            top: '-9999px',
            overflow: 'hidden',
            width: '1122.52px',
            height: '1600px' // Enough height to render both stacked
          }}
          className="no-print"
        >
          {/* Page 1 (Front) */}
          <div 
            id="pdf-cert-front"
            style={{
              width: '1122.52px',
              height: '793.70px',
            }}
            className="bg-white text-slate-900 border border-slate-200 flex relative select-none overflow-hidden font-sans"
          >
            <div className="w-full h-full relative bg-white">
              {/* Left Geometric Design Accent Column */}
              <div 
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: '240px',
                  height: '793.70px'
                }}
                className="bg-emerald-800 flex flex-col justify-center items-center py-6 shadow-inner select-none overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-0 h-0 border-t-[100px] border-t-yellow-400 border-r-[240px] border-r-transparent opacity-90"></div>
                
                <div className="flex flex-col gap-5 items-center justify-center z-10 w-full px-4">
                  <div style={{
                    width: '150px',
                    height: '150px',
                    minWidth: '150px',
                    minHeight: '150px',
                    maxWidth: '150px',
                    maxHeight: '150px',
                    aspectRatio: '1/1',
                    borderRadius: '50%',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    flexGrow: 0,
                    boxSizing: 'border-box',
                  }} className="shadow-md shadow-black/30 shrink-0">
                    <img 
                      src="/logo_file/Imagem_Parte%20%C3%BAmida.png"
                      alt="Parte Úmida"
                      referrerPolicy="no-referrer"
                      style={{
                        display: 'block',
                        width: '144px',
                        height: '144px',
                        minWidth: '144px',
                        minHeight: '144px',
                        maxWidth: '144px',
                        maxHeight: '144px',
                        aspectRatio: '1/1',
                        objectFit: 'cover',
                        borderRadius: '50%',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div style={{
                    width: '150px',
                    height: '150px',
                    minWidth: '150px',
                    minHeight: '150px',
                    maxWidth: '150px',
                    maxHeight: '150px',
                    aspectRatio: '1/1',
                    borderRadius: '50%',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    flexGrow: 0,
                    boxSizing: 'border-box',
                  }} className="shadow-md shadow-black/30 shrink-0">
                    <img 
                      src="/logo_file/Imagem_Enfardamento%202.png"
                      alt="Enfardamento 2"
                      referrerPolicy="no-referrer"
                      style={{
                        display: 'block',
                        width: '144px',
                        height: '144px',
                        minWidth: '144px',
                        minHeight: '144px',
                        maxWidth: '144px',
                        maxHeight: '144px',
                        aspectRatio: '1/1',
                        objectFit: 'cover',
                        borderRadius: '50%',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div style={{
                    width: '150px',
                    height: '150px',
                    minWidth: '150px',
                    minHeight: '150px',
                    maxWidth: '150px',
                    maxHeight: '150px',
                    aspectRatio: '1/1',
                    borderRadius: '50%',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    flexGrow: 0,
                    boxSizing: 'border-box',
                  }} className="shadow-md shadow-black/30 shrink-0">
                    <img 
                      src="/logo_file/Imagem_Enfardamento%203.png"
                      alt="Enfardamento 3"
                      referrerPolicy="no-referrer"
                      style={{
                        display: 'block',
                        width: '144px',
                        height: '144px',
                        minWidth: '144px',
                        minHeight: '144px',
                        maxWidth: '144px',
                        maxHeight: '144px',
                        aspectRatio: '1/1',
                        objectFit: 'cover',
                        borderRadius: '50%',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>

                <div className="absolute bottom-0 right-0 w-0 h-0 border-b-[100px] border-b-yellow-400 border-l-[240px] border-l-transparent opacity-90 pointer-events-none"></div>
              </div>

              {/* Main certificate text area */}
              <div 
                style={{
                  position: 'absolute',
                  left: '240px',
                  top: 0,
                  width: '882.52px',
                  height: '793.70px',
                  paddingTop: '28px',
                  paddingBottom: '36px'
                }}
                className="px-12 flex flex-col justify-between bg-white relative"
              >
                <div className="text-center w-full select-none mb-1.5 shrink-0 px-2 flex flex-col items-center">
                  <span className="text-[10px] font-black tracking-[0.25em] text-emerald-800 uppercase font-sans">
                    Eldorado Brasil Celulose S.A.
                  </span>
                  <span className="text-[8px] font-bold tracking-widest text-slate-400 uppercase mt-0.5">
                    Unidade Industrial Três Lagoas • Processo de Secagem
                  </span>
                  <div className="h-10 flex items-center justify-center mt-2">
                    <img 
                      src="/logo_file/Logo_Eldorado.png" 
                      alt="Eldorado" 
                      className="h-9 object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </div>

                <div className="text-center flex-1 flex flex-col justify-center px-4 self-center max-w-2xl my-auto">
                  <h1 className="text-4xl font-extrabold text-emerald-900 tracking-tight uppercase mb-2 font-sans">
                    CERTIFICADO
                  </h1>
                  
                  <p className="text-sm text-slate-600 font-semibold mb-1.5 leading-relaxed">
                    A Eldorado Brasil Celulose S/A, certifica que
                  </p>
                  
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase mb-2 px-4 py-1.5 border-b-2 border-emerald-800 bg-slate-50 border-double">
                    {activeCertificateForPdf.participantName}
                  </h2>
                  
                  <p className="text-sm text-slate-700 leading-relaxed font-semibold">
                    participou com êxito do treinamento de qualificação e aperfeiçoamento operacional de 
                    <span className="block text-emerald-800 text-base font-black mt-0.5 uppercase">
                      {activeCertificateForPdf.course.title}
                    </span>
                  </p>

                  <div className="flex items-center justify-center gap-8 mt-2 text-xs font-bold text-slate-600">
                    <div>no período de <span className="font-extrabold text-slate-900">{activeCertificateForPdf.course.period}</span></div>
                    <div className="w-1.5 h-1.5 bg-slate-300 rounded-full"></div>
                    <div>com carga horária de <span className="font-extrabold text-slate-900">{activeCertificateForPdf.course.hours} hora(s)</span></div>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-3 mt-1 shrink-0 flex items-start justify-between px-4">
                  <div className="text-center w-64 flex flex-col items-center">
                    <div className="h-10 flex items-center justify-center font-serif italic text-emerald-800/80 text-base select-none">
                      {activeCertificateForPdf.course.instructor.split(' ').slice(0, 3).join(' ')}
                    </div>
                    <div className="w-full border-t border-slate-400 mt-0.5 mb-1.5"></div>
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest leading-none mb-1 font-sans">
                      Responsável Técnico
                    </p>
                    <p className="text-[10px] font-extrabold text-slate-800 mb-0.5">{activeCertificateForPdf.course.instructor}</p>
                    <p className="text-[8px] text-slate-500 font-semibold max-w-[240px] truncate">{activeCertificateForPdf.course.instructorTitle}</p>
                  </div>

                  <div className="flex flex-col items-center justify-end w-40 h-[80px] pb-2">
                    <div className="text-center text-[11px] text-slate-500 font-bold font-sans">
                      Três Lagoas (MS), {activeCertificateForPdf.course.period.split(' a ').slice(-1)[0]}
                    </div>
                  </div>

                  <div className="text-center w-64 flex flex-col items-center justify-end">
                    <div className="h-10 flex items-center justify-center"></div>
                    <div className="w-full border-t border-slate-400 mt-0.5 mb-1.5"></div>
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest leading-none mb-1 font-sans">
                      Colaborador
                    </p>
                    <p className="text-[10px] font-extrabold text-slate-800 truncate max-w-[240px]">{activeCertificateForPdf.participantName}</p>
                  </div>
                </div>

                <div className="absolute top-4 left-4 right-4 bottom-4 border border-emerald-800/10 pointer-events-none rounded-xl"></div>
                <div className="absolute top-5 left-5 right-5 bottom-5 border border-emerald-800/5 pointer-events-none rounded-lg"></div>
              </div>
            </div>
          </div>

          {/* Page 2 (Back) */}
          <div 
            id="pdf-cert-back"
            style={{
              width: '1122.52px',
              height: '793.70px',
            }}
            className="bg-white text-slate-900 border border-slate-200 flex relative select-none overflow-hidden font-sans"
          >
            <div className="w-full h-full flex relative">
              <div className="flex-1 p-12 pr-16 flex flex-col justify-between h-full bg-white relative">
                <div>
                  <h1 className="text-3xl font-black text-emerald-900 tracking-tight uppercase mb-2 select-none">
                    CONTEÚDO PROGRAMÁTICO
                  </h1>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-0.5 mb-6">
                    Programa de Conhecimentos Ministrados
                  </p>

                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 min-h-[95mm] overflow-hidden whitespace-pre-wrap font-mono text-xs font-bold text-slate-700 leading-relaxed max-w-3xl">
                    {activeCertificateForPdf.course.syllabus}
                  </div>
                </div>

                <div className="flex justify-between items-end border-t border-slate-100 pt-8 mt-4 shrink-0 max-w-3xl">
                  <div>
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Responsável pela aplicação</p>
                    <p className="text-xs font-extrabold text-slate-800 mt-1">{activeCertificateForPdf.course.instructor}</p>
                    <p className="text-[10px] text-slate-500 font-semibold">{activeCertificateForPdf.course.instructorTitle}</p>
                  </div>
                  
                  <div className="text-right text-xs text-slate-400 font-bold select-none">
                    Eldorado Brasil Celulose S.A. <br />
                    Unidade Industrial Três Lagoas / Secagem
                  </div>
                </div>

                <div className="absolute top-4 left-4 right-4 bottom-4 border border-emerald-800/10 pointer-events-none rounded-xl"></div>
                <div className="absolute top-5 left-5 right-5 bottom-5 border border-emerald-800/5 pointer-events-none rounded-lg"></div>
              </div>

              <div className="w-[124px] bg-emerald-800 h-full flex flex-col justify-between items-center py-8 relative shadow-inner select-none shrink-0 overflow-hidden">
                <div className="absolute top-0 right-0 w-0 h-0 border-t-[80px] border-t-yellow-400 border-l-[120px] border-l-transparent opacity-90"></div>

                <div className="absolute bottom-0 left-0 w-0 h-0 border-b-[80px] border-b-yellow-400 border-r-[120px] border-r-transparent opacity-90"></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
