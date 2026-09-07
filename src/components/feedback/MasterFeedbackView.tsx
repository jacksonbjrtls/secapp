import React, { useState, useEffect, useMemo } from 'react';
import { 
  Star, 
  MessageSquareHeart, 
  Download, 
  Search, 
  Trash2, 
  RefreshCw,
  Sparkles,
  User,
  Calendar,
  Eye,
  CheckCircle2,
  AlertCircle,
  Filter,
  FileText
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { db } from '../../lib/firebase';
import { 
  collection, 
  getDocs, 
  query, 
  orderBy, 
  deleteDoc, 
  doc 
} from 'firebase/firestore';
import { AppFeedbackSurvey } from '../../types';
import { formatLocalDateTimeBR } from '../../lib/utils';
import { AppFeedbackModal } from './AppFeedbackModal';

interface MasterFeedbackViewProps {
  isMaster: boolean;
}

export const MasterFeedbackView: React.FC<MasterFeedbackViewProps> = ({ isMaster }) => {
  const [surveys, setSurveys] = useState<AppFeedbackSurvey[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [ratingFilter, setRatingFilter] = useState<'all' | '5' | '4' | '3' | '2' | '1' | 'with_obs'>('all');
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  const fetchSurveys = async () => {
    if (!isMaster) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'app_feedback_surveys'),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      const list: AppFeedbackSurvey[] = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as AppFeedbackSurvey));
      setSurveys(list);
    } catch (err) {
      console.error('Error loading feedback surveys:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSurveys();
  }, [isMaster]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta avaliação de feedback?')) return;
    setDeletingId(id);
    try {
      await deleteDoc(doc(db, 'app_feedback_surveys', id));
      setSurveys(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      console.error('Error deleting survey:', err);
      alert('Erro ao excluir avaliação.');
    } finally {
      setDeletingId(null);
    }
  };

  // Metrics calculations
  const totalCount = surveys.length;
  const avgRating = totalCount > 0 
    ? (surveys.reduce((acc, curr) => acc + (curr.rating || 0), 0) / totalCount)
    : 0;

  const count5 = surveys.filter(s => s.rating === 5).length;
  const count4 = surveys.filter(s => s.rating === 4).length;
  const count3 = surveys.filter(s => s.rating === 3).length;
  const count2 = surveys.filter(s => s.rating === 2).length;
  const count1 = surveys.filter(s => s.rating === 1).length;
  const countWithObs = surveys.filter(s => s.observation && s.observation.trim().length > 0).length;

  const satisfactionRate = totalCount > 0 
    ? Math.round(((count5 + count4) / totalCount) * 100) 
    : 0;

  // Filtered List
  const filteredSurveys = useMemo(() => {
    return surveys.filter(item => {
      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesName = item.userName?.toLowerCase().includes(term);
        const matchesEmail = item.userEmail?.toLowerCase().includes(term);
        const matchesObs = item.observation?.toLowerCase().includes(term);
        const matchesCargo = item.cargoName?.toLowerCase().includes(term);
        const matchesSector = item.sectorName?.toLowerCase().includes(term);
        if (!matchesName && !matchesEmail && !matchesObs && !matchesCargo && !matchesSector) {
          return false;
        }
      }

      // Rating filter
      if (ratingFilter === 'with_obs') {
        return !!(item.observation && item.observation.trim().length > 0);
      }
      if (ratingFilter !== 'all') {
        return item.rating === Number(ratingFilter);
      }

      return true;
    });
  }, [surveys, searchTerm, ratingFilter]);

  const sanitizePdfText = (text: string | null | undefined): string => {
    if (!text) return '';
    return String(text)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x00-\x7F]/g, '');
  };

  // Export to PDF
  const handleExportPDF = () => {
    if (surveys.length === 0) {
      alert('Nenhuma avaliação encontrada para gerar o relatório PDF.');
      return;
    }

    setExportingPdf(true);
    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Top Emerald Header Bar
      doc.setFillColor(5, 150, 105); // emerald-600
      doc.rect(0, 0, pageWidth, 28, 'F');

      // Accent Sub-bar
      doc.setFillColor(4, 120, 87); // emerald-700
      doc.rect(0, 28, pageWidth, 2, 'F');

      // Header Title
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('PESQUISA DE AVALIACAO DO APLICATIVO - SecApp', 14, 13);

      // Subtitle
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(209, 250, 229); // emerald-100
      doc.text('Relatorio Gerencial de Satisfacao e Feedback dos Colaboradores', 14, 20);

      // Header Right Metadata
      const nowStr = new Date().toLocaleString('pt-BR');
      doc.setFontSize(8.5);
      doc.text(sanitizePdfText(`Gerado em: ${nowStr}`), pageWidth - 14, 13, { align: 'right' });
      doc.setFont('helvetica', 'bold');
      doc.text('Acesso: Perfil Master', pageWidth - 14, 20, { align: 'right' });

      // KPI Summary Banner Box (StartY: 34)
      doc.setFillColor(248, 250, 252); // slate-50
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.roundedRect(14, 34, pageWidth - 28, 18, 2, 2, 'FD');

      // KPI 1: Media Geral
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text('MEDIA GERAL', 20, 39.5);
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text(`${avgRating > 0 ? avgRating.toFixed(1) : '0.0'} / 5.0`, 20, 47);

      // KPI 2: Total Avaliacoes
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text('TOTAL AVALIACOES', 68, 39.5);
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text(`${totalCount} colaboradores`, 68, 47);

      // KPI 3: Satisfacao
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text('INDICE SATISFACAO', 124, 39.5);
      doc.setFontSize(12);
      doc.setTextColor(5, 150, 105); // emerald-600
      doc.text(`${satisfactionRate}% (Notas 4 e 5)`, 124, 47);

      // KPI 4: Comentarios
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text('COM COMENTARIOS', 182, 39.5);
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text(`${countWithObs} (${totalCount > 0 ? Math.round((countWithObs / totalCount) * 100) : 0}%)`, 182, 47);

      // KPI 5: Distribuicao das Notas
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text('DISTRIBUICAO:', 236, 39.5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`5*: ${count5} | 4*: ${count4} | 3*: ${count3}`, 236, 44);
      doc.text(`2*: ${count2} | 1*: ${count1}`, 236, 48.5);

      // Determine items to export based on current view
      const dataToExport = filteredSurveys;

      // Table Header & Rows
      const head = [[
        'Colaborador', 
        'Cargo / Setor / Turno', 
        'Nota', 
        'Destaques Apontados', 
        'Comentario / Sugestao de Melhoria', 
        'Acessos',
        'Data / Hora'
      ]];

      const tableData = dataToExport.map(s => {
        const userLine = [s.userName || 'Colaborador', s.userEmail].filter(Boolean).join('\n');
        
        const details = [
          s.cargoName ? `Cargo: ${s.cargoName}` : '',
          s.sectorName ? `Setor: ${s.sectorName}` : '',
          s.userGroup ? `Turno: ${s.userGroup}` : ''
        ].filter(Boolean).join('\n') || '-';

        const notaLabel = `${s.rating || 0}/5\n${s.ratingLabel || ''}`;
        const highlightsStr = (s.highlights && s.highlights.length > 0) 
          ? s.highlights.join('; ') 
          : '-';
        
        const obsStr = s.observation?.trim() ? `"${s.observation.trim()}"` : '(Sem comentarios adicionais)';
        const accessesStr = s.accessCount ? `${s.accessCount}` : '10+';
        const dateStr = formatLocalDateTimeBR(s.createdAt);

        return [
          sanitizePdfText(userLine),
          sanitizePdfText(details),
          sanitizePdfText(notaLabel),
          sanitizePdfText(highlightsStr),
          sanitizePdfText(obsStr),
          sanitizePdfText(accessesStr),
          sanitizePdfText(dateStr)
        ];
      });

      autoTable(doc, {
        startY: 55,
        head: head.map(r => r.map(c => sanitizePdfText(c))),
        body: tableData,
        theme: 'grid',
        styles: {
          fontSize: 7.5,
          cellPadding: 2.2,
          lineColor: [226, 232, 240],
          lineWidth: 0.15,
          overflow: 'linebreak'
        },
        headStyles: {
          fillColor: [5, 150, 105], // emerald-600
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 7.5,
          halign: 'left'
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252] // slate-50
        },
        columnStyles: {
          0: { cellWidth: 44, fontStyle: 'bold' }, // Colaborador
          1: { cellWidth: 40 },                   // Cargo/Setor/Turno
          2: { cellWidth: 26, fontStyle: 'bold' }, // Nota
          3: { cellWidth: 46 },                   // Destaques
          4: { cellWidth: 70 },                   // Comentario / Sugestao
          5: { cellWidth: 17, halign: 'center' }, // Acessos
          6: { cellWidth: 26, halign: 'center' }  // Data/Hora
        },
        didDrawPage: () => {
          const totalPages = (doc as any).internal.getNumberOfPages();
          const currentPage = (doc as any).internal.getCurrentPageInfo().pageNumber;

          doc.setFontSize(7.5);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(148, 163, 184); // slate-400

          // Footer separator line
          doc.setDrawColor(226, 232, 240);
          doc.line(14, pageHeight - 8, pageWidth - 14, pageHeight - 8);

          doc.text(
            'SecApp - Sistema de Gestao Operacional | Relatorio de Pesquisa de Avaliacao',
            14,
            pageHeight - 4.5
          );
          doc.text(
            `Pagina ${currentPage} de ${totalPages}`,
            pageWidth - 14,
            pageHeight - 4.5,
            { align: 'right' }
          );
        }
      });

      doc.save(`relatorio_avaliacao_secapp_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error('Error generating feedback survey PDF:', err);
      alert('Erro ao gerar o relatório em PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (surveys.length === 0) {
      alert('Nenhuma avaliação encontrada para exportar.');
      return;
    }

    const headers = ['Nome', 'Email', 'Cargo', 'Setor', 'Grupo/Turno', 'Nota', 'Classificação', 'Destaques', 'Observação / Sugestão', 'Acessos Registrados', 'Data / Hora'];
    const rows = surveys.map(s => [
      `"${(s.userName || '').replace(/"/g, '""')}"`,
      `"${(s.userEmail || '').replace(/"/g, '""')}"`,
      `"${(s.cargoName || '').replace(/"/g, '""')}"`,
      `"${(s.sectorName || '').replace(/"/g, '""')}"`,
      `"${(s.userGroup || '').replace(/"/g, '""')}"`,
      s.rating || '',
      `"${(s.ratingLabel || '').replace(/"/g, '""')}"`,
      `"${(s.highlights || []).join('; ').replace(/"/g, '""')}"`,
      `"${(s.observation || '').replace(/"/g, '""')}"`,
      s.accessCount || '',
      `"${formatLocalDateTimeBR(s.createdAt)}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `pesquisa_avaliacao_app_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isMaster) {
    return (
      <div className="p-8 text-center bg-rose-50 border border-rose-200 rounded-2xl text-rose-700">
        <AlertCircle className="w-10 h-10 mx-auto mb-2 text-rose-500" />
        <h3 className="text-lg font-bold">Acesso Restrito ao Master</h3>
        <p className="text-sm">Apenas o usuário Master tem permissão para visualizar as avaliações do aplicativo.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-gradient-to-r from-emerald-900 via-slate-900 to-slate-800 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <Sparkles className="w-3.5 h-3.5" />
              Exclusivo Master
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
              <MessageSquareHeart className="w-8 h-8 text-emerald-400" />
              Pesquisa de Avaliação do Aplicativo
            </h2>
            <p className="text-slate-300 text-xs sm:text-sm max-w-2xl leading-relaxed">
              Consulte como os colaboradores estão avaliando o novo sistema SecApp, com notas, índices de satisfação e comentários de melhoria.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setPreviewModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-xs font-bold text-white transition-all shadow-sm active:scale-95 cursor-pointer"
            >
              <Eye className="w-4 h-4 text-amber-300" />
              Testar Popout
            </button>
            <button
              onClick={handleExportPDF}
              disabled={surveys.length === 0 || exportingPdf}
              className="flex items-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-700 text-white rounded-xl text-xs font-bold shadow-md transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed"
              title="Gerar e baixar relatório em PDF formatado"
            >
              <FileText className="w-4 h-4" />
              {exportingPdf ? 'Gerando PDF...' : 'Exportar PDF'}
            </button>
            <button
              onClick={handleExportCSV}
              disabled={surveys.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-700 text-white rounded-xl text-xs font-bold shadow-md transition-all active:scale-95 cursor-pointer"
              title="Baixar planilha CSV com os dados brutos"
            >
              <Download className="w-4 h-4" />
              Exportar CSV
            </button>
            <button
              onClick={fetchSurveys}
              disabled={loading}
              className="p-2.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-white transition-all active:scale-95 cursor-pointer"
              title="Atualizar dados"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Dashboard Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Rating Médio */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Média Geral de Avaliação
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900">
                {avgRating > 0 ? avgRating.toFixed(1) : '0.0'}
              </span>
              <span className="text-xs font-bold text-slate-400">/ 5.0</span>
            </div>
            <div className="flex items-center gap-0.5 pt-0.5">
              {[1, 2, 3, 4, 5].map(st => (
                <Star 
                  key={st} 
                  className={`w-3.5 h-3.5 ${
                    st <= Math.round(avgRating) 
                      ? 'text-amber-400 fill-amber-400' 
                      : 'text-slate-200'
                  }`} 
                />
              ))}
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center">
            <Star className="w-6 h-6 fill-amber-400" />
          </div>
        </div>

        {/* Metric 2: Total Respondentes */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Total de Avaliações
            </span>
            <div className="text-3xl font-black text-slate-900">
              {totalCount}
            </div>
            <span className="text-xs font-semibold text-slate-500">
              Colaboradores que já responderam
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <User className="w-6 h-6" />
          </div>
        </div>

        {/* Metric 3: Taxa de Satisfação */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Satisfação (4 e 5 estrelas)
            </span>
            <div className="text-3xl font-black text-emerald-600">
              {satisfactionRate}%
            </div>
            <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {count5 + count4} de {totalCount} avaliações
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Sparkles className="w-6 h-6" />
          </div>
        </div>

        {/* Metric 4: Com Observações */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Com Comentários / Sugestões
            </span>
            <div className="text-3xl font-black text-slate-900">
              {countWithObs}
            </div>
            <span className="text-xs font-semibold text-slate-500">
              {totalCount > 0 ? Math.round((countWithObs / totalCount) * 100) : 0}% deixaram observação
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <MessageSquareHeart className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Distribution Bars Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-sm">
        <h3 className="text-sm font-black uppercase tracking-wider text-slate-700 mb-4 flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          Distribuição das Notas
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {[
            { star: 5, label: 'Excelente', count: count5, color: 'bg-emerald-500', textColor: 'text-emerald-700' },
            { star: 4, label: 'Bom', count: count4, color: 'bg-emerald-400', textColor: 'text-emerald-600' },
            { star: 3, label: 'Regular', count: count3, color: 'bg-amber-400', textColor: 'text-amber-600' },
            { star: 2, label: 'Ruim', count: count2, color: 'bg-orange-400', textColor: 'text-orange-600' },
            { star: 1, label: 'Muito Ruim', count: count1, color: 'bg-rose-500', textColor: 'text-rose-600' },
          ].map(item => {
            const pct = totalCount > 0 ? Math.round((item.count / totalCount) * 100) : 0;
            return (
              <div 
                key={`dist-${item.star}`} 
                onClick={() => setRatingFilter(ratingFilter === String(item.star) as any ? 'all' : String(item.star) as any)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                  ratingFilter === String(item.star) 
                    ? 'border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-500/20' 
                    : 'border-slate-150 bg-slate-50/60 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-black mb-1.5">
                  <span className="flex items-center gap-1 text-slate-700">
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    {item.star} {item.star === 1 ? 'estrela' : 'estrelas'}
                  </span>
                  <span className={item.textColor}>{item.count}</span>
                </div>
                {/* Progress bar */}
                <div className="w-full bg-slate-200/80 rounded-full h-2 overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${item.color}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="text-[10px] text-slate-400 font-semibold mt-1.5 flex justify-between">
                  <span>{item.label}</span>
                  <span>{pct}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por colaborador, e-mail, texto..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <span className="text-xs font-bold text-slate-500">Filtrar:</span>
          {[
            { id: 'all', label: 'Todas' },
            { id: '5', label: '5 ★' },
            { id: '4', label: '4 ★' },
            { id: '3', label: '3 ★' },
            { id: '2', label: '2 ★' },
            { id: '1', label: '1 ★' },
            { id: 'with_obs', label: 'Com Observações' }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setRatingFilter(f.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                ratingFilter === f.id
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Evaluations Table List */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-emerald-500" />
            <p className="text-xs font-bold">Carregando avaliações...</p>
          </div>
        ) : filteredSurveys.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <MessageSquareHeart className="w-12 h-12 mx-auto text-slate-300" />
            <p className="text-sm font-bold text-slate-700">Nenhuma avaliação encontrada</p>
            <p className="text-xs text-slate-400">
              {surveys.length === 0 
                ? 'Os colaboradores que acessarem o sistema pelo menos 10 vezes verão o popout de avaliação e as respostas aparecerão aqui.'
                : 'Nenhum resultado corresponde aos filtros selecionados.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200/80 text-slate-500 uppercase tracking-wider font-black text-[10px]">
                <tr>
                  <th className="py-3.5 px-4">Colaborador</th>
                  <th className="py-3.5 px-4">Nota</th>
                  <th className="py-3.5 px-4">Destaques</th>
                  <th className="py-3.5 px-4">Observação / Sugestão</th>
                  <th className="py-3.5 px-4">Acessos</th>
                  <th className="py-3.5 px-4">Data / Hora</th>
                  <th className="py-3.5 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredSurveys.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* User Info */}
                    <td className="py-3.5 px-4">
                      <div className="space-y-0.5">
                        <div className="font-bold text-slate-800 text-sm">
                          {item.userName || 'Colaborador'}
                        </div>
                        <div className="text-slate-400 text-[11px]">
                          {item.userEmail}
                        </div>
                        {(item.cargoName || item.sectorName || item.userGroup) && (
                          <div className="text-[10px] text-slate-500 flex items-center gap-1.5 pt-0.5">
                            {item.cargoName && <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{item.cargoName}</span>}
                            {item.sectorName && <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{item.sectorName}</span>}
                            {item.userGroup && <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-bold">Tur. {item.userGroup}</span>}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Rating */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map(st => (
                            <Star 
                              key={st} 
                              className={`w-4 h-4 ${
                                st <= (item.rating || 0) 
                                  ? 'text-amber-400 fill-amber-400' 
                                  : 'text-slate-200'
                              }`} 
                            />
                          ))}
                        </div>
                        <span className={`text-[11px] font-black ${
                          item.rating >= 4 ? 'text-emerald-600' : item.rating === 3 ? 'text-amber-600' : 'text-rose-600'
                        }`}>
                          {item.ratingLabel || `${item.rating} estrelas`}
                        </span>
                      </div>
                    </td>

                    {/* Highlights Tags */}
                    <td className="py-3.5 px-4 max-w-xs">
                      {item.highlights && item.highlights.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {item.highlights.map(tag => (
                            <span 
                              key={tag} 
                              className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-semibold border border-slate-200"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-300 text-[11px] italic">—</span>
                      )}
                    </td>

                    {/* Observation */}
                    <td className="py-3.5 px-4 max-w-md">
                      {item.observation && item.observation.trim() ? (
                        <div className="p-2.5 bg-amber-50/60 border border-amber-200/60 rounded-xl text-slate-700 text-xs font-semibold leading-relaxed">
                          "{item.observation}"
                        </div>
                      ) : (
                        <span className="text-slate-300 text-[11px] italic">Sem observações adicionais</span>
                      )}
                    </td>

                    {/* Access Count */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-slate-100 text-slate-700">
                        {item.accessCount || '10+'} acessos
                      </span>
                    </td>

                    {/* Date */}
                    <td className="py-3.5 px-4 whitespace-nowrap text-slate-500 font-semibold text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {formatLocalDateTimeBR(item.createdAt)}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      {item.id && (
                        <button
                          onClick={() => handleDelete(item.id!)}
                          disabled={deletingId === item.id}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Excluir esta avaliação"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Popout Preview Modal for Master testing */}
      {previewModalOpen && (
        <AppFeedbackModal 
          forceOpen={true} 
          onCloseForce={() => setPreviewModalOpen(false)} 
        />
      )}
    </div>
  );
};
