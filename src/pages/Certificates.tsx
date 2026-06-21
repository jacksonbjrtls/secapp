import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { safeHtml2canvas } from '../lib/html2canvasShim';
import jsPDF from 'jspdf';
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
  AlertCircle,
  Download,
  Loader2
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
2. Controle de pressões, temperaturas and sopro de ar quente;
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

  // View Certificate state - PDF Generation and Accordion Toggle
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<string | null>(null);
  const [activeCertificateForPdf, setActiveCertificateForPdf] = useState<{
    course: TrainingCourse;
    participantName: string;
  } | null>(null);
  const [expandedCourseParticipantsId, setExpandedCourseParticipantsId] = useState<string | null>(null);

  // Search/Filters for operator view and manage view
  const [searchText, setSearchText] = useState('');

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

  const handlePrint = async (course: TrainingCourse, participantName: string) => {
    const loadingId = `${course.id}_${participantName}`;
    setIsGeneratingPdf(loadingId);
    try {
      setActiveCertificateForPdf({ course, participantName });
      
      // Wait to let React mount and paint the elements in the hidden offscreen container
      await new Promise((resolve) => setTimeout(resolve, 600));
      
      const frontElement = document.getElementById('pdf-cert-front');
      const backElement = document.getElementById('pdf-cert-back');
      
      if (!frontElement || !backElement) {
        console.error('Elementos do certificado não localizados.');
        return;
      }
      
      const canvasFront = await safeHtml2canvas(frontElement, { 
        scale: 2, 
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
      });
      const imgFront = canvasFront.toDataURL('image/png');
      
      const canvasBack = await safeHtml2canvas(backElement, { 
        scale: 2, 
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
      });
      const imgBack = canvasBack.toDataURL('image/png');
      
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      pdf.addImage(imgFront, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.addPage();
      pdf.addImage(imgBack, 'PNG', 0, 0, pdfWidth, pdfHeight);
      
      pdf.save(`Certificado_${participantName.replace(/\s+/g, '_')}.pdf`);
    } catch (err) {
      console.error('Falha ao gerar certificado em PDF:', err);
    } finally {
      setIsGeneratingPdf(null);
      setActiveCertificateForPdf(null);
    }
  };

  return (
    <div className="p-4 md:p-8 bg-slate-50 min-h-screen">
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
                      disabled={isGeneratingPdf !== null}
                      onClick={() => handlePrint(course, profile?.displayName || 'COLABORADOR')}
                      className="w-full bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors font-bold text-xs py-3.5 rounded-2xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {isGeneratingPdf === `${course.id}_${profile?.displayName || 'COLABORADOR'}` ? (
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
                  {filteredManageCourses.map((course) => {
                    const isExpanded = expandedCourseParticipantsId === course.id;
                    return (
                      <React.Fragment key={course.id}>
                        <tr className="hover:bg-slate-50/50 transition-colors border-b border-slate-50">
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
                              type="button"
                              onClick={() => {
                                setExpandedCourseParticipantsId(isExpanded ? null : course.id);
                              }}
                              title="Visualizar Certificados dos Colaboradores"
                              className={cn(
                                "p-2 rounded-lg transition-colors inline-block cursor-pointer",
                                isExpanded
                                  ? "bg-emerald-100 text-emerald-800 font-bold"
                                  : "text-slate-400 hover:text-emerald-700 hover:bg-emerald-50"
                              )}
                            >
                              <UserCheck className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCloneAsRecycling(course)}
                              title="Renovar / Clonar Treinamento (Reciclagem)"
                              className="p-2 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors inline-block cursor-pointer"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEditCourse(course)}
                              title="Editar Treinamento"
                              className="p-2 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors inline-block cursor-pointer"
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCourse(course.id)}
                              title="Excluir Treinamento"
                              className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors inline-block cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-slate-50/50">
                            <td colSpan={5} className="py-3 px-6">
                              <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
                                <div className="text-[10px] font-black tracking-wider text-slate-400 uppercase">
                                  Selecione o operador para gerar o PDF: ({course.participants?.length || 0})
                                </div>
                                {(!course.participants || course.participants.length === 0) ? (
                                  <div className="text-xs text-slate-400 font-medium py-2">
                                    Nenhum colaborador registrado neste treinamento.
                                  </div>
                                ) : (
                                  <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
                                    {registeredUsers
                                      .filter(u => course.participants?.includes(u.id))
                                      .map(operator => (
                                        <div key={operator.id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                                          <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                                            <span className="text-xs font-bold text-slate-800">{operator.displayName}</span>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => handlePrint(course, operator.displayName)}
                                            disabled={isGeneratingPdf !== null}
                                            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                          >
                                            {isGeneratingPdf === `${course.id}_${operator.displayName}` ? (
                                              <>
                                                <Loader2 className="w-3 h-3 animate-spin text-emerald-600" />
                                                Gerando...
                                              </>
                                            ) : (
                                              <>
                                                <Printer className="w-3 h-3" /> PDF
                                              </>
                                            )}
                                          </button>
                                        </div>
                                      ))}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
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


      {/* ═══════════════════════════════════════════
          GERADOR DE PDF — Contêiner oculto fora de tela
          Layout fiel ao PDF de referência Eldorado Brasil
      ═══════════════════════════════════════════ */}
      {activeCertificateForPdf && (
        <div
          style={{
            position: 'absolute',
            left: '-9999px',
            top: '-9999px',
            width: '1122.52px',
            height: '1587.4px',
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
          className="no-print"
        >

          {/* ══════════════════════════════════
              PÁGINA 1 — FRENTE
          ══════════════════════════════════ */}
          <div
            id="pdf-cert-front"
            style={{
              width: '1122.52px',
              height: '793.70px',
              position: 'relative',
              overflow: 'hidden',
              background: '#ffffff',
              fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif",
            }}
          >
            {/* ── Coluna lateral esquerda verde ── */}
            <div style={{
              position: 'absolute',
              top: 0, left: 0,
              width: '218px',
              height: '793.70px',
              background: '#0d5c2e',
              overflow: 'hidden',
            }}>
              {/* Triângulo amarelo — canto superior esquerdo */}
              <div style={{
                position: 'absolute', top: 0, left: 0,
                width: 0, height: 0,
                borderTop: '100px solid #f0c000',
                borderRight: '218px solid transparent',
              }} />
              {/* Triângulo amarelo — canto inferior direito */}
              <div style={{
                position: 'absolute', bottom: 0, right: 0,
                width: 0, height: 0,
                borderBottom: '100px solid #f0c000',
                borderLeft: '218px solid transparent',
              }} />

              {/* 3 fotos circulares — espaçadas verticalmente (100% Redondas e Maiores) */}
              <div style={{
                position: 'absolute',
                top: '120px', left: 0, right: 0, bottom: '120px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'space-around',
              }}>
                {[
                  '/logo_file/Imagem_Parte%20%C3%BAmida.png',
                  '/logo_file/Imagem_Enfardamento%202.png',
                  '/logo_file/Imagem_Enfardamento%203.png',
                ].map((src, i) => (
                  <div
                    key={i}
                    style={{
                      width: '136px',
                      height: '136px',
                      minWidth: '136px',
                      minHeight: '136px',
                      maxWidth: '136px',
                      maxHeight: '136px',
                      aspectRatio: '1/1',
                      borderRadius: '50%',
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      flexGrow: 0,
                      border: '3px solid rgba(255,255,255,0.25)',
                      boxShadow: '0 3px 12px rgba(0,0,0,0.35)',
                      boxSizing: 'border-box',
                    }}
                  >
                    <img
                      src={src}
                      alt=""
                      referrerPolicy="no-referrer"
                      style={{
                        display: 'block',
                        width: '130px',
                        height: '130px',
                        minWidth: '130px',
                        minHeight: '130px',
                        maxWidth: '130px',
                        maxHeight: '130px',
                        aspectRatio: '1/1',
                        objectFit: 'cover',
                        borderRadius: '50%',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* ── Área principal (branca) ── */}
            <div style={{
              position: 'absolute',
              top: 0, left: '218px',
              width: '904.52px',
              height: '793.70px',
              background: '#ffffff',
              overflow: 'hidden',
            }}>
              {/* Borda fina interna */}
              <div style={{
                position: 'absolute',
                top: '10px', left: '10px', right: '10px', bottom: '10px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                pointerEvents: 'none',
              }} />

              {/* ── Cabeçalho ── */}
              <div style={{
                textAlign: 'center',
                paddingTop: '22px',
                paddingLeft: '60px',
                paddingRight: '60px',
              }}>
                <div style={{
                  fontSize: '9.5px',
                  fontWeight: 900,
                  letterSpacing: '0.28em',
                  color: '#1e293b',
                  textTransform: 'uppercase',
                }}>
                  Eldorado Brasil Celulose S.A.
                </div>
                <div style={{
                  fontSize: '7.5px',
                  fontWeight: 600,
                  letterSpacing: '0.18em',
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  marginTop: '2px',
                }}>
                  Unidade Industrial Três Lagoas &bull; Processo de Secagem
                </div>
                <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'center' }}>
                  <img
                    src="/logo_file/Logo_Eldorado.png"
                    alt="Eldorado Brasil"
                    referrerPolicy="no-referrer"
                    style={{
                      height: '52px',
                      display: 'block',
                      objectFit: 'contain',
                    }}
                  />
                </div>
                {/* Linha divisória */}
                <div style={{
                  width: '55%',
                  height: '1px',
                  background: '#e2e8f0',
                  margin: '12px auto 0',
                }} />
              </div>

              {/* ── Corpo central ── */}
              <div style={{
                textAlign: 'center',
                padding: '65px 70px 0',
              }}>
                <h1 style={{
                  fontSize: '52px',
                  fontWeight: 900,
                  color: '#0d5c2e',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  margin: '0 0 10px 0',
                  lineHeight: 1,
                }}>
                  CERTIFICADO
                </h1>

                <p style={{
                  fontSize: '11.5px',
                  color: '#64748b',
                  fontWeight: 500,
                  margin: '0 0 10px 0',
                  fontStyle: 'italic',
                }}>
                  A Eldorado Brasil Celulose S/A, certifica que
                </p>

                {/* Nome do colaborador */}
                <div style={{
                  display: 'inline-block',
                  borderBottom: '2.5px solid #0d5c2e',
                  paddingBottom: '6px',
                  marginBottom: '14px',
                  minWidth: '65%',
                }}>
                  <h2 style={{
                    fontSize: '28px',
                    fontWeight: 900,
                    color: '#1e293b',
                    letterSpacing: '0.03em',
                    textTransform: 'uppercase',
                    margin: 0,
                    lineHeight: 1.2,
                  }}>
                    {activeCertificateForPdf.participantName}
                  </h2>
                </div>

                <p style={{
                  fontSize: '11.5px',
                  color: '#475569',
                  fontWeight: 500,
                  margin: '0 0 6px 0',
                  lineHeight: 1.5,
                  display: 'block',
                }}>
                  participou com êxito do treinamento de qualificação e aperfeiçoamento operacional de
                </p>

                <p style={{
                  fontSize: '14.5px',
                  fontWeight: 900,
                  color: '#0d5c2e',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  margin: '0 0 12px 0',
                  lineHeight: 1.3,
                }}>
                  {activeCertificateForPdf.course.title}
                </p>

                <div style={{
                  fontSize: '11px',
                  fontWeight: 500,
                  color: '#475569',
                }}>
                  no período de&nbsp;
                  <strong style={{ color: '#1e293b', fontWeight: 800 }}>
                    {activeCertificateForPdf.course.period}
                  </strong>
                  &nbsp;&nbsp;&bull;&nbsp;&nbsp;
                  com carga horária de&nbsp;
                  <strong style={{ color: '#1e293b', fontWeight: 800 }}>
                    {activeCertificateForPdf.course.hours} hora(s)
                  </strong>
                </div>
              </div>

              {/* ── Rodapé com assinaturas — position:absolute garante que não corta (Alturas Ajustadas e Margem Sobscrita Adicionada) ── */}
              <div style={{
                position: 'absolute',
                bottom: '32px',
                left: 0, right: 0,
                padding: '10px 52px 0',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
              }}>

                {/* Coluna esquerda — Responsável Técnico */}
                <div style={{ width: '250px', textAlign: 'center' }}>
                  {/* Nome em itálico (estilo assinatura) */}
                  <div style={{
                    fontSize: '14px',
                    fontStyle: 'italic',
                    color: '#0d5c2e',
                    fontFamily: 'Georgia, "Times New Roman", serif',
                    marginBottom: '3px',
                    lineHeight: 1.2,
                  }}>
                    {activeCertificateForPdf.course.instructor.split(' ').slice(0, 3).join(' ')}
                  </div>
                  <div style={{ borderTop: '1px solid #94a3b8', marginBottom: '4px' }} />
                  <div style={{
                    fontSize: '7.5px',
                    fontWeight: 900,
                    color: '#94a3b8',
                    textTransform: 'uppercase',
                    letterSpacing: '0.18em',
                    marginBottom: '3px',
                  }}>
                    Responsável Técnico
                  </div>
                  <div style={{ fontSize: '10px', fontWeight: 800, color: '#1e293b', lineHeight: 1.3 }}>
                    {activeCertificateForPdf.course.instructor}
                  </div>
                  <div style={{ fontSize: '8px', fontWeight: 500, color: '#64748b', marginTop: '1px', lineHeight: 1.3 }}>
                    {activeCertificateForPdf.course.instructorTitle}
                  </div>
                </div>

                {/* Centro — Cidade e data */}
                <div style={{
                  textAlign: 'center',
                  fontSize: '10.5px',
                  fontWeight: 600,
                  color: '#475569',
                  paddingBottom: '4px',
                }}>
                  Três Lagoas (MS),&nbsp;
                  {activeCertificateForPdf.course.period.split(' a ').slice(-1)[0]}
                </div>

                {/* Coluna direita — Colaborador */}
                <div style={{ width: '250px', textAlign: 'center' }}>
                  <div style={{ minHeight: '22px', marginBottom: '3px' }} />
                  <div style={{ borderTop: '1px solid #94a3b8', marginBottom: '4px' }} />
                  <div style={{
                    fontSize: '7.5px',
                    fontWeight: 900,
                    color: '#94a3b8',
                    textTransform: 'uppercase',
                    letterSpacing: '0.18em',
                    marginBottom: '3px',
                  }}>
                    Colaborador
                  </div>
                  <div style={{ fontSize: '10px', fontWeight: 800, color: '#1e293b', lineHeight: 1.3 }}>
                    {activeCertificateForPdf.participantName}
                  </div>
                  <div style={{ fontSize: '8px', fontWeight: 500, color: '#64748b', marginTop: '1px' }}>
                    Eldorado Brasil Celulose S.A.
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* ══════════════════════════════════
              PÁGINA 2 — VERSO
          ══════════════════════════════════ */}
          <div
            id="pdf-cert-back"
            style={{
              width: '1122.52px',
              height: '793.70px',
              position: 'relative',
              overflow: 'hidden',
              background: '#ffffff',
              fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif",
            }}
          >
            {/* Borda fina interna */}
            <div style={{
              position: 'absolute',
              top: '10px', left: '10px', right: '10px', bottom: '10px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              pointerEvents: 'none',
            }} />

            {/* ── Conteúdo principal ── */}
            <div style={{
              position: 'absolute',
              top: 0, left: 0, right: '110px', bottom: 0,
              padding: '42px 52px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}>
              <div>
                {/* Título */}
                <h1 style={{
                  fontSize: '26px',
                  fontWeight: 900,
                  color: '#0d5c2e',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  margin: '0 0 4px 0',
                  lineHeight: 1,
                }}>
                  Conteúdo Programático
                </h1>
                <p style={{
                  fontSize: '8px',
                  fontWeight: 700,
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  letterSpacing: '0.22em',
                  margin: '0 0 22px 0',
                }}>
                  Programa de Conhecimentos Ministrados
                </p>

                {/* Card do conteúdo */}
                <div style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '20px 26px',
                  maxHeight: '520px',
                  overflow: 'hidden',
                }}>
                  <pre style={{
                    fontFamily: "'Courier New', Courier, monospace",
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#334155',
                    lineHeight: 1.75,
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}>
                    {activeCertificateForPdf.course.syllabus}
                  </pre>
                </div>
              </div>

              {/* Rodapé do verso */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                borderTop: '1px solid #e2e8f0',
                paddingTop: '12px',
              }}>
                <div>
                  <div style={{
                    fontSize: '7.5px',
                    fontWeight: 900,
                    color: '#94a3b8',
                    textTransform: 'uppercase',
                    letterSpacing: '0.18em',
                    marginBottom: '3px',
                  }}>
                    Responsável pela aplicação
                  </div>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#1e293b' }}>
                    {activeCertificateForPdf.course.instructor}
                  </div>
                  <div style={{ fontSize: '9px', fontWeight: 500, color: '#64748b', marginTop: '1px' }}>
                    {activeCertificateForPdf.course.instructorTitle}
                  </div>
                </div>
                <div style={{
                  textAlign: 'right',
                  fontSize: '9.5px',
                  fontWeight: 700,
                  color: '#64748b',
                  lineHeight: 1.7,
                }}>
                  Eldorado Brasil Celulose S.A.<br />
                  Unidade Industrial Três Lagoas / Secagem
                </div>
              </div>
            </div>

             {/* ── Faixa lateral direita verde ── */}
            <div style={{
              position: 'absolute',
              top: 0, right: 0,
              width: '110px',
              height: '793.70px',
              background: '#0d5c2e',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {/* Triângulo amarelo — canto superior direito */}
              <div style={{
                position: 'absolute', top: 0, right: 0,
                width: 0, height: 0,
                borderTop: '80px solid #f0c000',
                borderLeft: '110px solid transparent',
              }} />
              {/* Triângulo amarelo — canto inferior esquerdo */}
              <div style={{
                position: 'absolute', bottom: 0, left: 0,
                width: 0, height: 0,
                borderBottom: '80px solid #f0c000',
                borderRight: '110px solid transparent',
              }} />
            </div>
          </div>

        </div>
      )}
    </div>
  );
};

export default Certificates;
