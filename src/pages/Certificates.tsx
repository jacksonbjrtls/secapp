import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../hooks/useAuth';
import { db } from '../lib/firebase';
import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy, 
  serverTimestamp 
} from 'firebase/firestore';
import { 
  Award, 
  Plus, 
  Calendar, 
  Clock, 
  User, 
  BookOpen, 
  FileText, 
  Copy, 
  Trash2, 
  Printer, 
  Eye, 
  Search, 
  Check, 
  ChevronLeft, 
  GraduationCap, 
  Maximize2,
  Lock,
  ChevronRight,
  UserCheck,
  AlertCircle
} from 'lucide-react';
import { TrainingCourse } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

const DEFAULT_SYLLABUS = `Conteúdo programático - Conhecimentos:
1. Introdução à tecnologia de secagem e fita do secador;
2. Reconhecimento, avaliação e controle de riscos operacionais;
3. Análise preliminar de riscos específicos da área de secagem (APR/PET);
4. Procedimento operacional padrão (POP) de emenda e costura da fita;
5. Critérios de liberação e teste dinâmico pós-costura;
6. Noções básicas de segurança na área do Secador de Celulose.`;

const DEFAULT_COURSES_TEMPLATES = [
  {
    title: "Treinamento de Emenda e Costura da Fita do Secador",
    syllabus: DEFAULT_SYLLABUS,
    hours: 2,
    instructor: "Juliano de Souza Gatti",
    instructorTitle: "Engenheiro de Segurança do Trabalho / CREA -SP/5061329780"
  },
  {
    title: "Treinamento de Partida Segura e Operação do Secador de Celulose",
    syllabus: `Conteúdo programático - Conhecimentos:
1. Fluxograma de vapor e condensado do secador;
2. Controle de pressões, temperaturas e sopro de ar quente;
3. Alinhamento de folha de celulose e passagem de ponta;
4. Controle de velocidades, tensão de telas e motores elétricos;
5. Segurança em máquinas e equipamentos (NR 12);
6. Dispositivos de parada de emergência do Secador.`,
    hours: 8,
    instructor: "Juliano de Souza Gatti",
    instructorTitle: "Engenheiro de Segurança do Trabalho / CREA -SP/5061329780"
  },
  {
    title: "Treinamento de Operação Seguro de Prensa de Fardos e Enfardamento",
    syllabus: `Conteúdo programático - Conhecimentos:
1. Componentes hidráulicos da Prensa de Fardos de Celulose;
2. Configuração de pressões das bombas e acumuladores de nitrogênio;
3. Ciclo automático de prensagem e parametrização de receitas;
4. Bloqueios e fontes de energia perigosas (LOTO);
5. Ajustes mecânicos de facas e sensores de posicionamento;
6. Riscos operacionais de esmagamento e quedas de fardos.`,
    hours: 4,
    instructor: "Juliano de Souza Gatti",
    instructorTitle: "Engenheiro de Segurança do Trabalho / CREA -SP/5061329780"
  }
];

const Certificates: React.FC = () => {
  const { user, profile, isManager, isAdmin, isMaster, isApproved, loading: authLoading } = useAuth();
  const [courses, setCourses] = useState<TrainingCourse[]>([]);
  const [registeredUsers, setRegisteredUsers] = useState<{ id: string; displayName: string; email: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'meus' | 'gerenciar'>('meus');
  
  // Create / Edit modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState<TrainingCourse | null>(null);
  
  // Form fields
  const [title, setTitle] = useState('');
  const [period, setPeriod] = useState('');
  const [hours, setHours] = useState(2);
  const [syllabus, setSyllabus] = useState(DEFAULT_SYLLABUS);
  const [instructor, setInstructor] = useState('Juliano de Souza Gatti');
  const [instructorTitle, setInstructorTitle] = useState('Engenheiro de Segurança do Trabalho / CREA -SP/5061329780');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [userSearchTerm, setUserSearchTerm] = useState('');

  // View Certificate state
  const [viewingCourse, setViewingCourse] = useState<TrainingCourse | null>(null);
  const [viewingOperatorName, setViewingOperatorName] = useState('');
  const [certificateSide, setCertificateSide] = useState<'frente' | 'verso'>('frente');
  const [certificateZoom, setCertificateZoom] = useState<'fit' | 'scroll'>('fit');

  // Search/Filters for operator view and manage view
  const [searchText, setSearchText] = useState('');
  const [isInIframe, setIsInIframe] = useState(false);

  useEffect(() => {
    setIsInIframe(window.self !== window.top);
  }, []);

  // Resize listener for responsive preview certificate scale in mobile
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [previewContainerSize, setPreviewContainerSize] = useState({ width: 1122, height: 794 });

  useEffect(() => {
    if (!viewingCourse) return;
    
    // Initial dimensions fallbacks
    if (previewContainerRef.current) {
      setPreviewContainerSize({
        width: previewContainerRef.current.clientWidth || 1122,
        height: previewContainerRef.current.clientHeight || 794
      });
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        setPreviewContainerSize({ width, height });
      }
    });

    if (previewContainerRef.current) {
      resizeObserver.observe(previewContainerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [viewingCourse]);

  const canManage = isManager || isAdmin || isMaster;

  // Fetch courses and users
  const fetchData = async () => {
    setLoading(true);
    try {
      const coursesSnap = await getDocs(query(collection(db, 'training_courses'), orderBy('createdAt', 'desc')));
      const coursesList = coursesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as TrainingCourse[];
      setCourses(coursesList);

      if (canManage) {
        const usersSnap = await getDocs(query(collection(db, 'users'), orderBy('displayName', 'asc')));
        const usersList = usersSnap.docs.map(doc => ({
          id: doc.id,
          displayName: doc.data().displayName || 'Sem nome',
          email: doc.data().email || ''
        })).filter(u => u.displayName !== 'Sem nome');
        setRegisteredUsers(usersList);
      }
    } catch (err) {
      console.error('Error fetching certificates data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    fetchData();
  }, [authLoading, isApproved, canManage]);

  // Preset autocomplete handler
  const selectPresetTemplate = (preset: typeof DEFAULT_COURSES_TEMPLATES[0]) => {
    setTitle(preset.title);
    setSyllabus(preset.syllabus);
    setHours(preset.hours);
    setInstructor(preset.instructor);
    setInstructorTitle(preset.instructorTitle);
  };

  // Participant selection toggle
  const toggleParticipant = (userId: string) => {
    if (selectedParticipants.includes(userId)) {
      setSelectedParticipants(selectedParticipants.filter(id => id !== userId));
    } else {
      setSelectedParticipants([...selectedParticipants, userId]);
    }
  };

  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !period || !instructor || selectedParticipants.length === 0) {
      alert('Por favor, preencha todos os campos obrigatórios e adicione pelo menos um participante.');
      return;
    }

    try {
      setLoading(true);
      const payload = {
        title,
        period,
        hours: Number(hours),
        syllabus,
        instructor,
        instructorTitle,
        participants: selectedParticipants,
        updatedAt: serverTimestamp(),
      };

      if (editingCourse) {
        await updateDoc(doc(db, 'training_courses', editingCourse.id), payload);
      } else {
        await addDoc(collection(db, 'training_courses'), {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: user?.uid || '',
          createdByName: profile?.displayName || 'Administrador'
        });
      }

      setShowAddModal(false);
      resetForm();
      fetchData();
    } catch (err) {
      console.error('Erro ao salvar treinamento:', err);
      alert('Erro ao salvar dados do treinamento no banco de dados.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCourse = async (courseId: string) => {
    if (!window.confirm('Tem certeza absoluta que deseja excluir este treinamento? Isso removerá o certificado de todos os participantes.')) {
      return;
    }
    try {
      setLoading(true);
      await deleteDoc(doc(db, 'training_courses', courseId));
      fetchData();
    } catch (err) {
      console.error('Erro ao deletar treinamento:', err);
      alert('Erro ao excluir do banco de dados.');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEditingCourse(null);
    setTitle('');
    setPeriod('');
    setHours(2);
    setSyllabus(DEFAULT_SYLLABUS);
    setInstructor('Juliano de Souza Gatti');
    setInstructorTitle('Engenheiro de Segurança do Trabalho / CREA -SP/5061329780');
    setSelectedParticipants(registeredUsers.map(u => u.id));
    setUserSearchTerm('');
  };

  const handleEditCourse = (course: TrainingCourse) => {
    setEditingCourse(course);
    setTitle(course.title);
    setPeriod(course.period);
    setHours(course.hours);
    setSyllabus(course.syllabus);
    setInstructor(course.instructor);
    setInstructorTitle(course.instructorTitle);
    setSelectedParticipants(course.participants || []);
    setShowAddModal(true);
  };

  const handleCloneAsRecycling = (course: TrainingCourse) => {
    // Clones the details but lets user provide new period and participants list, appending recycler suffix
    setEditingCourse(null);
    const newTitle = course.title.toLowerCase().includes('reciclagem') 
      ? course.title 
      : `${course.title} - Reciclagem`;
    
    setTitle(newTitle);
    setPeriod(''); // Let them specify a new date
    setHours(course.hours);
    setSyllabus(course.syllabus);
    setInstructor(course.instructor);
    setInstructorTitle(course.instructorTitle);
    setSelectedParticipants(course.participants || []); // Keep same ones for convenience, they can revise
    setShowAddModal(true);
  };

  // Filter users based on search
  const filteredUsersForSelection = registeredUsers.filter(u => 
    u.displayName.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(userSearchTerm.toLowerCase())
  );

  // My certificates (current user logged in)
  const myCertificates = courses.filter(course => 
    course.participants?.includes(user?.uid || '')
  );

  // Filter manage list
  const filteredManageCourses = courses.filter(course =>
    course.title.toLowerCase().includes(searchText.toLowerCase()) ||
    course.instructor.toLowerCase().includes(searchText.toLowerCase())
  );

  const triggerDirectPrint = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    try {
      // Abre uma nova janela para contornar restrições de iframe
      const printWindow = window.open('', '_blank', 'width=1100,height=800');
      if (!printWindow) {
        alert("Não foi possível abrir a janela de impressão. Por favor, permita popups para este site e tente novamente!");
        return;
      }

      const certElement = document.querySelector('.print-only-container');
      const html = certElement ? certElement.outerHTML : document.body.innerHTML;

      // Pegar as fontes importadas e styles
      const fontStyles = `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
      `;

      // Copiar os styleSheets
      let stylesHtml = `<style>${fontStyles}</style>`;
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          const rules = Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n');
          stylesHtml += `<style>${rules}</style>`;
        } catch (err) {
          if (sheet.href) {
            stylesHtml += `<link rel="stylesheet" href="${sheet.href}">`;
          }
        }
      }

      printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes">
  <title>Certificado - Eldorado Brasil</title>
  ${stylesHtml}
  <style>
    body {
      margin: 0 !important;
      padding: 0 !important;
      background: #0f172a !important; /* Cor de fundo correspondente */
    }
    /* Na tela da nova janela, vamos mostrar o certificado centralizado e bonito */
    @media screen {
      body {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        padding: 24px 12px !important;
        gap: 24px !important;
        overflow-y: auto !important;
        box-sizing: border-box;
      }
      .print-only-container {
        display: flex !important;
        flex-direction: column;
        gap: 24px !important;
        align-items: center !important;
        position: static !important;
        width: 100% !important;
        height: auto !important;
        max-width: 100% !important;
        box-sizing: border-box;
      }
      .certificate-print-page {
        display: flex !important;
        width: 297mm !important;
        height: 210mm !important;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5) !important;
        border-radius: 12px !important;
        overflow: hidden !important;
        background: white !important;
        background-color: white !important;
        transform-origin: top center;
        box-sizing: border-box;
        flex-shrink: 0 !important;
        
        /* Escala padrão para desktop e telas amplas */
        --scale: 0.85;
        transform: scale(var(--scale)) !important;
        /* Compensa o scale para as páginas não se sobreporem.
           O tamanho visual ocupado passa a ser 210mm * var(--scale).
           Portanto, subtraímos a diferença (210mm * (1 - var(--scale))) do margin-bottom.
        */
        margin-bottom: calc(-210mm * (1 - var(--scale))) !important;
      }
      
      /* Escala adaptável baseada na largura da janela/dispositivo (celulares e tablets) */
      @media (max-width: 1150px) {
        .certificate-print-page {
          --scale: calc((100vw - 24px) / 1122.52);
        }
      }
      
      .certificate-print-page:last-child {
        margin-bottom: 0 !important;
      }
    }

    /* Estilos definitivos para impressão e geração do PDF */
    @media print {
      body {
        background: white !important;
        background-color: white !important;
        overflow: visible !important;
      }
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
        border-radius: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        background: white !important;
        background-color: white !important;
        transform: none !important; /* Sem rotação ou escala no papel impresso/PDF */
        margin-bottom: 0 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .certificate-print-page:last-child {
        page-break-after: avoid !important;
        break-after: avoid !important;
      }
      @page {
        size: A4 landscape;
        margin: 0;
      }
    }
  </style>
</head>
<body>
  ${html}
</body>
</html>`);

      printWindow.document.close();
      printWindow.focus();

      // Aguarda as imagens carregarem e renderizar
      setTimeout(() => {
        printWindow.print();
        printWindow.addEventListener('afterprint', () => {
          printWindow.close();
        });
      }, 1000);

    } catch (err) {
      console.error("Print failed:", err);
      alert("Ocorreu um erro ao gerar a impressão. Por favor, tente novamente.");
    }
  };

  return (
    <div className="p-4 md:p-8 bg-slate-50 min-h-screen">
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

      {/* Header section */}
      <div className="max-w-7xl mx-auto mb-8 no-print">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-emerald-100 text-emerald-800 text-xs font-black px-3 py-1 rounded-full uppercase tracking-widest">
                Secagem Eldorado
              </span>
            </div>
            <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
              <Award className="w-8 h-8 text-emerald-600" />
              Módulo de Certificados
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Gere, armazene e emita certificados oficiais de treinamentos específicos ou informais aplicados na Secagem.
            </p>
          </div>
          
          {canManage && (
            <button
              onClick={() => {
                resetForm();
                setShowAddModal(true);
              }}
              className="bg-slate-900 text-white rounded-2xl hover:bg-slate-800 transition-all font-bold px-5 py-3.5 flex items-center justify-center gap-2 shadow-lg shadow-slate-200"
            >
              <Plus className="w-5 h-5" /> Cadastrar Treinamento
            </button>
          )}
        </div>
      </div>

      {/* Tabs configuration */}
      {canManage && (
        <div className="max-w-7xl mx-auto mb-6 flex bg-slate-200/50 p-1.5 rounded-2xl w-full md:w-fit no-print">
          <button
            onClick={() => setActiveTab('meus')}
            className={cn(
              "flex-1 md:flex-initial flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
              activeTab === 'meus' 
                ? "bg-white text-emerald-700 shadow-md"
                : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
            )}
          >
            <GraduationCap className="w-4 h-4" /> Meus Certificados
          </button>
          <button
            onClick={() => setActiveTab('gerenciar')}
            className={cn(
              "flex-1 md:flex-initial flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
              activeTab === 'gerenciar' 
                ? "bg-white text-emerald-700 shadow-md"
                : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
            )}
          >
            <Award className="w-4 h-4" /> Gerenciar Treinamentos ({courses.length})
          </button>
        </div>
      )}

      {/* Tab: My Certificates */}
      {(activeTab === 'meus' || !canManage) && (
        <div className="max-w-7xl mx-auto no-print">
          <div className="bg-white rounded-3xl border border-slate-100 p-6 md:p-8 shadow-xl shadow-slate-100">
            <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-emerald-600" />
              Treinamentos realizados por {profile?.displayName || user?.email}
            </h2>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-slate-500 text-sm font-bold animate-pulse">Buscando certificados...</span>
              </div>
            ) : myCertificates.length === 0 ? (
              <div className="text-center py-16 px-4 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-400">
                  <Award className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-slate-700 mb-1">Nenhum certificado registrado</h3>
                <p className="text-slate-500 text-sm max-w-md mx-auto">
                  Você ainda não consta na lista de participantes de nenhum treinamento cadastrado no sistema. Solicite a inclusão ao instrutor ou supervisor da área.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {myCertificates.map((course) => (
                  <div 
                    key={course.id}
                    className="p-5 bg-white border border-slate-100 rounded-3xl shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex justify-between items-start mb-3">
                        <span className="bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase px-2.5 py-1 rounded-md">
                          Nível Operacional
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">ID: {course.id.substring(0, 5)}</span>
                      </div>
                      <h4 className="text-sm font-black text-slate-800 line-clamp-2 leading-snug mb-4 h-10">
                        {course.title}
                      </h4>

                      <div className="space-y-2 mb-4">
                        <div className="flex items-center gap-2 text-xs text-slate-500 font-semibold">
                          <Calendar className="w-4 h-4 text-slate-400" />
                          <span>Período: {course.period}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 font-semibold">
                          <Clock className="w-4 h-4 text-slate-400" />
                          <span>Carga Horária: {course.hours} hora(s)</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 font-semibold">
                          <User className="w-4 h-4 text-slate-400" />
                          <span>Instrutor: {course.instructor}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setViewingCourse(course);
                        setViewingOperatorName(profile?.displayName || 'COLABORADOR');
                        setCertificateSide('frente');
                      }}
                      className="w-full bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors font-bold text-xs py-3.5 rounded-2xl flex items-center justify-center gap-2"
                    >
                      <Eye className="w-4 h-4" /> Visualizar Certificado
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Manage Courses */}
      {canManage && activeTab === 'gerenciar' && (
        <div className="max-w-7xl mx-auto bg-white rounded-3xl border border-slate-100 p-6 md:p-8 shadow-xl shadow-slate-100 no-print">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
            <h3 className="text-lg font-black text-slate-800">
              Controle Geral de Cursos ({filteredManageCourses.length})
            </h3>
            
            <div className="relative w-full md:w-80">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Filtrar treinamentos..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500 inline-block font-semibold"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-slate-500 text-sm font-bold">Buscando cursos...</span>
            </div>
          ) : filteredManageCourses.length === 0 ? (
            <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-2xl">
              Nenhum treinamento encontrado. Clique em "Cadastrar Treinamento" para registrar um curso.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50">
                    <th className="py-4 px-4 rounded-l-xl">Treinamento / Conteúdo</th>
                    <th className="py-4 px-4">Instrutor Técnico</th>
                    <th className="py-4 px-4">Periodo/Horas</th>
                    <th className="py-4 px-4 text-center">Nº Treinados</th>
                    <th className="py-4 px-4 text-right rounded-r-xl">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-slate-700 text-sm font-semibold">
                  {filteredManageCourses.map((course) => (
                    <tr key={course.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 px-4 max-w-sm">
                        <div className="font-extrabold text-slate-900 line-clamp-1">{course.title}</div>
                        <div className="text-[10px] text-slate-400 mt-1 line-clamp-2 max-h-8">
                          {course.syllabus?.replace(/[\r\n]+/g, ' ')}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="text-sm font-extrabold text-slate-800">{course.instructor}</div>
                        <div className="text-[10px] text-slate-400 font-bold">{course.instructorTitle}</div>
                      </td>
                      <td className="py-4 px-4 text-xs font-semibold">
                        <div className="text-slate-800">{course.period}</div>
                        <div className="text-[10px] text-emerald-600 font-extrabold mt-0.5 uppercase tracking-wide">
                          {course.hours} h de Carga
                        </div>
                      </td>
                      <td className="py-4 px-4 text-center font-black text-slate-800">
                        {course.participants?.length || 0}
                      </td>
                      <td className="py-4 px-4 text-right space-x-1 whitespace-nowrap">
                        <button
                          onClick={() => {
                            setViewingCourse(course);
                            setViewingOperatorName(
                              registeredUsers.find(u => course.participants?.includes(u.id))?.displayName || 'ESCOLHA UM COLABORADOR'
                            );
                            setCertificateSide('frente');
                          }}
                          title="Visualizar Certificados"
                          className="p-2 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors inline-block"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleCloneAsRecycling(course)}
                          title="Renovar / Clonar Treinamento (Reciclagem)"
                          className="p-2 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors inline-block"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleEditCourse(course)}
                          title="Editar Treinamento"
                          className="p-2 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors inline-block"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteCourse(course.id)}
                          title="Excluir Treinamento"
                          className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors inline-block"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Save / Edit form Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 no-print">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2.5rem] w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              <div className="p-6 md:p-8 bg-slate-900 text-white flex justify-between items-center select-none shrink-0">
                <div>
                  <h3 className="text-xl font-black flex items-center gap-2">
                    <GraduationCap className="w-6 h-6 text-emerald-400" />
                    {editingCourse ? 'Editar Treinamento' : 'Novo Treinamento Secagem'}
                  </h3>
                  <p className="text-xs text-slate-400 font-semibold mt-1">
                    Crie ou edite treinamentos com conteúdo no verso e gere certificados.
                  </p>
                </div>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="bg-white/10 text-white hover:bg-white/20 p-2 rounded-xl transition-all font-bold"
                >
                  Fechar
                </button>
              </div>

              <form onSubmit={handleSaveCourse} className="p-6 md:p-8 space-y-5 overflow-y-auto flex-1">
                {/* Auto-suggest templates section */}
                {!editingCourse && (
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2.5">
                      💡 Copiar Modelos Prontos de Secagem
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {DEFAULT_COURSES_TEMPLATES.map((tmpl, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => selectPresetTemplate(tmpl)}
                          className="bg-white text-slate-700 border border-slate-200 hover:border-emerald-500 hover:text-emerald-700 transition-all text-xs font-bold px-3 py-1.5 rounded-xl text-left"
                        >
                          {tmpl.title.split(' - ')[0].split(' de ')[1] || tmpl.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-extrabold uppercase text-slate-400 tracking-wider mb-2 ml-1">Título do Treinamento</label>
                    <input
                      required
                      type="text"
                      placeholder="Ex: Treinamento de Emenda e Costura da Fita do Secador"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold uppercase text-slate-400 tracking-wider mb-2 ml-1">Carga Horária (horas)</label>
                    <input
                      required
                      type="number"
                      min={1}
                      value={hours}
                      onChange={(e) => setHours(Math.max(1, Number(e.target.value)))}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-extrabold uppercase text-slate-400 tracking-wider mb-2 ml-1">Período / Data de Emissão</label>
                    <input
                      required
                      type="text"
                      placeholder="Ex: 01/09/2024"
                      value={period}
                      onChange={(e) => setPeriod(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold uppercase text-slate-400 tracking-wider mb-2 ml-1">Responsável Técnico / Instrutor</label>
                    <input
                      required
                      type="text"
                      placeholder="Nome completo do Instrutor"
                      value={instructor}
                      onChange={(e) => setInstructor(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-400 tracking-wider mb-2 ml-1">Cargo / Registro Profissional</label>
                  <input
                    required
                    type="text"
                    placeholder="Ex: Engenheiro de Segurança do Trabalho / CREA -SP/5061329780"
                    value={instructorTitle}
                    onChange={(e) => setInstructorTitle(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-400 tracking-wider mb-2 ml-1">Conteúdo Ministrado (Exibido no Verso)</label>
                  <textarea
                    rows={4}
                    placeholder="Especifique o programa e tópicos instruídos..."
                    value={syllabus}
                    onChange={(e) => setSyllabus(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Operator Participants Selection List */}
                <div className="border-t border-slate-100 pt-4">
                  <div className="flex items-center justify-between mb-3.5">
                    <div>
                      <h4 className="text-sm font-black text-slate-800">
                        Selecionar Participantes ({selectedParticipants.length})
                      </h4>
                      <p className="text-[10px] text-slate-400 font-bold">Colaboradores da área matriculados neste curso.</p>
                    </div>
                    
                    <input
                      type="text"
                      placeholder="Pesquisar operário..."
                      value={userSearchTerm}
                      onChange={(e) => setUserSearchTerm(e.target.value)}
                      className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 w-44 font-bold"
                    />
                  </div>

                  {/* Actions for selection */}
                  <div className="flex items-center gap-2 mb-3">
                    <button
                      type="button"
                      onClick={() => setSelectedParticipants(registeredUsers.map(u => u.id))}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
                    >
                      Selecionar Todos ({registeredUsers.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedParticipants([])}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-700 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
                    >
                      Limpar Seleção
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto bg-slate-50/50 p-3 rounded-2xl border border-slate-200">
                    {filteredUsersForSelection.map((u) => {
                      const isSelected = selectedParticipants.includes(u.id);
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => toggleParticipant(u.id)}
                          className={cn(
                            "flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-left transition-all text-xs font-bold",
                            isSelected 
                              ? "bg-emerald-50/50 border-emerald-500 text-emerald-800" 
                              : "bg-white border-slate-200 hover:border-slate-300 text-slate-700"
                          )}
                        >
                          <div className="truncate pr-2">
                            <div className="font-extrabold truncate">{u.displayName}</div>
                            <div className="text-[9px] text-slate-400 truncate">{u.email}</div>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-emerald-600 shrink-0 ml-1" />}
                        </button>
                      );
                    })}

                    {filteredUsersForSelection.length === 0 && (
                      <div className="col-span-full text-center py-6 text-slate-400 text-xs">
                        Nenhum colaborador encontrado com esta busca.
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-3 justify-end pt-4 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddModal(false);
                      resetForm();
                    }}
                    className="px-6 py-3.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-2xl font-bold text-xs uppercase"
                  >
                    Calcelar
                  </button>
                  <button
                    type="submit"
                    className="px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-xs uppercase shadow-lg shadow-emerald-100"
                  >
                    Salvar Registro
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Viewing / Printing Certificate Modal */}
      <AnimatePresence>
        {viewingCourse && (
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

                {/* Switch between front/back and print actions */}
                <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 lg:gap-3 w-full sm:w-auto">
                  <div className="bg-slate-950 p-1 rounded-xl flex gap-1">
                    <button
                      onClick={() => setCertificateSide('frente')}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all",
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
                        "px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all",
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
                        "px-1.5 sm:px-2.5 py-1.5 rounded-lg text-[10px] sm:text-xs font-black uppercase transition-all flex items-center gap-1",
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
                        "px-1.5 sm:px-2.5 py-1.5 rounded-lg text-[10px] sm:text-xs font-black uppercase transition-all flex items-center gap-1",
                        certificateZoom === 'scroll' 
                          ? "bg-emerald-600 text-white shadow-sm"
                          : "text-slate-400 hover:text-white"
                      )}
                    >
                      <Search className="w-3 h-3" /> Rolar (100%)
                    </button>
                  </div>

                  {canManage && viewingCourse.participants.length > 1 && (
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-slate-400 font-black uppercase">Colaborador:</label>
                      <select
                        value={viewingOperatorName}
                        onChange={(e) => setViewingOperatorName(e.target.value)}
                        className="bg-slate-950 text-white border border-slate-700/50 rounded-lg px-2.5 py-1.5 text-xs font-bold focus:outline-none"
                      >
                        {registeredUsers
                          .filter(u => viewingCourse.participants.includes(u.id))
                          .map(u => (
                            <option key={u.id} value={u.displayName}>
                              {u.displayName}
                            </option>
                          ))
                        }
                      </select>
                    </div>
                  )}

                  <button
                    onClick={triggerDirectPrint}
                    className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl transition-all font-bold text-xs flex items-center gap-2"
                  >
                    <Printer className="w-4 h-4" /> Imprimir / PDF
                  </button>
                  
                  <button
                    onClick={() => {
                      setViewingCourse(null);
                      setViewingOperatorName('');
                    }}
                    className="bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 px-4 py-2 rounded-xl transition-all font-bold text-xs"
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
                      
                      {/* Left Geometric Design Accent Column */}
                      <div className="w-[240px] bg-emerald-800 h-full flex flex-col justify-center items-center py-6 relative shadow-inner select-none shrink-0 overflow-hidden">
                        {/* Elegant yellow accent chevron */}
                        <div className="absolute top-0 left-0 w-0 h-0 border-t-[100px] border-t-yellow-400 border-r-[240px] border-r-transparent opacity-90"></div>
                        
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

                        {/* Bottom yellow geometrical corner chevron */}
                        <div className="absolute bottom-0 right-0 w-0 h-0 border-b-[100px] border-b-yellow-400 border-l-[240px] border-l-transparent opacity-90 pointer-events-none"></div>
                      </div>

                      {/* Main certificate text area */}
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

                        {/* Main Center Body */}
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

                        {/* Bottom Row: Signatures and Date */}
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

                        {/* Beautiful frame lines */}
                        <div className="absolute top-4 left-4 right-4 bottom-4 border border-emerald-800/10 pointer-events-none rounded-xl"></div>
                        <div className="absolute top-5 left-5 right-5 bottom-5 border border-emerald-800/5 pointer-events-none rounded-lg"></div>
                      </div>
                    </div>
                  ) : (
                    /* ====== BACK SIDE OF CERTIFICATE (CONTEÚDOS) ====== */
                    <div className="w-full h-full flex relative">
                      
                      {/* Main Syllabus text area */}
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

                        {/* Signatures recap */}
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

                        {/* Beautiful frame lines */}
                        <div className="absolute top-4 left-4 right-4 bottom-4 border border-emerald-800/10 pointer-events-none rounded-xl"></div>
                        <div className="absolute top-5 left-5 right-5 bottom-5 border border-emerald-800/5 pointer-events-none rounded-lg"></div>
                      </div>

                      {/* Right Design Accent on Back */}
                      <div className="w-[124px] bg-emerald-800 h-full flex flex-col justify-between items-center py-8 relative shadow-inner select-none shrink-0 overflow-hidden">
                        {/* Upper geometrical yellow triangle */}
                        <div className="absolute top-0 right-0 w-0 h-0 border-t-[80px] border-t-yellow-400 border-l-[120px] border-l-transparent opacity-90"></div>
                        
                        <div className="flex flex-col gap-8 items-center justify-center z-10 w-full rotate-90 shrink-0 select-none opacity-20">
                          <span className="text-white font-black tracking-widest text-[11px] uppercase whitespace-nowrap">
                            Eldorado Dry-End Academy
                          </span>
                        </div>

                        {/* Under geometrical yellow triangle */}
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

      {viewingCourse && createPortal(
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
                
                <div className="flex flex-col gap-8 items-center justify-center z-10 w-full rotate-90 shrink-0 select-none opacity-20">
                  <span className="text-white font-black tracking-widest text-[11px] uppercase whitespace-nowrap">
                    Eldorado Dry-End Academy
                  </span>
                </div>

                <div className="absolute bottom-0 left-0 w-0 h-0 border-b-[80px] border-b-yellow-400 border-r-[120px] border-r-transparent opacity-90"></div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Certificates;
