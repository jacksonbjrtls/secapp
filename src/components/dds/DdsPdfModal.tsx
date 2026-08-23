import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Printer, 
  FileText, 
  SlidersHorizontal, 
  CheckCircle2, 
  Users, 
  Calendar, 
  Clock, 
  Filter, 
  Download,
  Loader2,
  FileCheck2
} from 'lucide-react';
import { exportSingleSessionDdsPdf, exportDdsHistoryPdf, HistoryPdfFilterOptions } from '../../lib/ddsPdfGenerator';
import { CachedUserItem } from '../../lib/usersCache';
import { formatSessionDisplayTitle } from '../../pages/DDS';
import { formatDateBR } from '../../lib/utils';

interface DdsPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  // If targetSession is provided, modal is in "Single Session Print" mode. If null, it's in "History / Filtered Report" mode.
  targetSession: any | null;
  filteredSessions: any[];
  allSignaturesList: any[];
  signaturesBySession: Record<string, any[]>;
  registeredUsers: CachedUserItem[];
  filters: HistoryPdfFilterOptions;
}

export const DdsPdfModal: React.FC<DdsPdfModalProps> = ({
  isOpen,
  onClose,
  targetSession,
  filteredSessions,
  allSignaturesList,
  signaturesBySession,
  registeredUsers,
  filters
}) => {
  const [generating, setGenerating] = useState(false);
  
  // Single session options
  const [includeBlankRows, setIncludeBlankRows] = useState(true);
  const [extraBlankRows, setExtraBlankRows] = useState(0);
  const [includeDescription, setIncludeDescription] = useState(true);
  const [includeSignaturesBlock, setIncludeSignaturesBlock] = useState(true);

  // History report options
  const [historyReportMode, setHistoryReportMode] = useState<'summary' | 'detailed'>('summary');
  const [includeKpiSummary, setIncludeKpiSummary] = useState(true);

  if (!isOpen) return null;

  const isSingleSession = !!targetSession;

  const handleGeneratePdf = async () => {
    try {
      setGenerating(true);
      if (isSingleSession && targetSession) {
        const sessionSigs = signaturesBySession[targetSession.id] || [];
        await exportSingleSessionDdsPdf(
          targetSession,
          sessionSigs,
          registeredUsers,
          {
            includeBlankRowsForPending: includeBlankRows,
            extraBlankRows: Number(extraBlankRows) || 0,
            includeDescription,
            includeSignaturesBlock
          }
        );
      } else {
        await exportDdsHistoryPdf(
          filteredSessions,
          allSignaturesList,
          registeredUsers,
          filters,
          {
            mode: historyReportMode,
            includeKpiSummary
          }
        );
      }
      onClose();
    } catch (err) {
      console.error('Error generating DDS PDF:', err);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 10 }}
          className="bg-white rounded-[2rem] p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-slate-100 relative overflow-hidden"
        >
          {/* Top Decorative Header */}
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-sm">
                {isSingleSession ? <Printer className="w-6 h-6" /> : <FileText className="w-6 h-6" />}
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                  {isSingleSession ? 'Imprimir Lista de Participantes' : 'Relatório de DDS em PDF'}
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  {isSingleSession 
                    ? 'Gere a folha oficial de presença e dados do DDS' 
                    : 'Exporte o relatório consolidado com os filtros atuais'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body Content */}
          <div className="space-y-4">
            {isSingleSession ? (
              <>
                {/* Single Session Preview Card */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span className="px-2 py-0.5 bg-emerald-600 text-white text-[10px] font-black rounded uppercase">
                      {targetSession.shift}
                    </span>
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-black rounded uppercase">
                      Letra {targetSession.group}
                    </span>
                    <span className="text-[11px] text-slate-500 font-semibold">
                      {formatDateBR(targetSession.createdAt || targetSession.date)}
                    </span>
                  </div>
                  <h4 className="font-extrabold text-slate-900 text-sm mb-1">
                    {formatSessionDisplayTitle(targetSession)}
                  </h4>
                  <div className="flex items-center gap-3 text-xs text-slate-600 font-medium mt-2 pt-2 border-t border-slate-200/60">
                    <span>Facilitador: <strong>{targetSession.executor || 'Não informado'}</strong></span>
                    <span>•</span>
                    <span className="flex items-center gap-1 text-emerald-700 font-bold">
                      <Users className="w-3.5 h-3.5 text-emerald-600" />
                      {(signaturesBySession[targetSession.id] || []).length} de {targetSession.totalPrevisto || 9} assinados
                    </span>
                  </div>
                </div>

                {/* Custom Options for Single Session */}
                <div className="space-y-2.5 pt-1">
                  <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider block">
                    Opções de Impressão
                  </span>

                  <label className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200/70 cursor-pointer transition-colors">
                    <div>
                      <p className="text-xs font-bold text-slate-800">Incluir linhas em branco para pendentes</p>
                      <p className="text-[10px] text-slate-500">Adiciona linhas pontilhadas para quem for assinar fisicamente em campo</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={includeBlankRows}
                      onChange={(e) => setIncludeBlankRows(e.target.checked)}
                      className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200/70 cursor-pointer transition-colors">
                    <div>
                      <p className="text-xs font-bold text-slate-800">Incluir Descrição e Tópicos</p>
                      <p className="text-[10px] text-slate-500">Exibe o texto com as diretrizes e riscos discutidos</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={includeDescription}
                      onChange={(e) => setIncludeDescription(e.target.checked)}
                      className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200/70 cursor-pointer transition-colors">
                    <div>
                      <p className="text-xs font-bold text-slate-800">Bloco de Visto e Assinatura Técnica</p>
                      <p className="text-[10px] text-slate-500">Campos para assinatura do Facilitador e Segurança do Trabalho</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={includeSignaturesBlock}
                      onChange={(e) => setIncludeSignaturesBlock(e.target.checked)}
                      className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer"
                    />
                  </label>

                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200/70">
                    <span className="text-xs font-bold text-slate-800">Linhas em branco extras (opcional):</span>
                    <select
                      value={extraBlankRows}
                      onChange={(e) => setExtraBlankRows(Number(e.target.value))}
                      className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-700 outline-none"
                    >
                      <option value={0}>0 extras</option>
                      <option value={2}>+2 linhas</option>
                      <option value={4}>+4 linhas</option>
                      <option value={6}>+6 linhas</option>
                      <option value={10}>+10 linhas</option>
                    </select>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* History Filter Preview Badge */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      Escopo do Relatório
                    </span>
                    <span className="text-xs font-black bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full">
                      {filteredSessions.length} {filteredSessions.length === 1 ? 'sessão selecionada' : 'sessões selecionadas'}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs text-slate-600 font-medium">
                    <p className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      Data: <strong>{filters.filterDate === 'all' ? 'Todas as Datas' : formatDateBR(filters.filterDate)}</strong>
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      Turno: <strong>{filters.filterShift === 'all' ? 'Todos os Turnos' : filters.filterShift}</strong>
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Filter className="w-3.5 h-3.5 text-slate-400" />
                      Letra da Escala: <strong>{filters.selectedLetter === 'all' ? 'Todas as Letras' : `Letra ${filters.selectedLetter}`}</strong>
                    </p>
                  </div>
                </div>

                {/* Report Format Selector */}
                <div className="space-y-2 pt-1">
                  <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider block">
                    Formato do Relatório
                  </span>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setHistoryReportMode('summary')}
                      className={`p-3 rounded-2xl border text-left transition-all ${
                        historyReportMode === 'summary'
                          ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-500/20'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-2">
                        <FileCheck2 className="w-4 h-4" />
                      </div>
                      <p className="text-xs font-extrabold text-slate-900">Resumo Executivo</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        Tabela comparativa com aderência e indicadores
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setHistoryReportMode('detailed')}
                      className={`p-3 rounded-2xl border text-left transition-all ${
                        historyReportMode === 'detailed'
                          ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-500/20'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-2">
                        <Users className="w-4 h-4" />
                      </div>
                      <p className="text-xs font-extrabold text-slate-900">Dossiê Completo</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        Inclui a lista nominal de participantes de cada DDS
                      </p>
                    </button>
                  </div>

                  <label className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200/70 cursor-pointer transition-colors mt-2">
                    <div>
                      <p className="text-xs font-bold text-slate-800">Incluir Resumo de Indicadores (KPIs)</p>
                      <p className="text-[10px] text-slate-500">Média de presenças, total de sessões e taxa global de adesão</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={includeKpiSummary}
                      onChange={(e) => setIncludeKpiSummary(e.target.checked)}
                      className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer"
                    />
                  </label>
                </div>
              </>
            )}
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3 mt-6 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={generating}
              className="py-3 px-4 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-colors text-xs disabled:opacity-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleGeneratePdf}
              disabled={generating || (!isSingleSession && filteredSessions.length === 0)}
              className="py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-all text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 disabled:opacity-50 cursor-pointer"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Gerando PDF...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  {isSingleSession ? 'Baixar PDF da Sessão' : 'Baixar Relatório PDF'}
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
