import React, { useState, useRef } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { getGroupForShift, Shift, Group } from '../lib/scaleUtils';
import { jsPDF } from 'jspdf';
import * as htmlToImage from 'html-to-image';
import { ConfirmationModal } from '../components/ui/ConfirmationModal';

const months = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const groupColors: Record<Group, { bg: string, text: string }> = {
  'A': { bg: '#fb923c', text: '#ffffff' }, // orange-400
  'B': { bg: '#93c5fd', text: '#1e293b' }, // blue-300 / slate-800
  'C': { bg: '#4ade80', text: '#ffffff' }, // green-400
  'D': { bg: '#fb7185', text: '#ffffff' }, // rose-400
  'E': { bg: '#334155', text: '#ffffff' }  // slate-700
};

interface MonthTableProps {
  month: number;
  year: number;
  isMini?: boolean;
}

const colors = {
  white: '#ffffff',
  slate50: '#f8fafc',
  slate100: '#f1f5f9',
  slate200: '#e2e8f0',
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate600: '#475569',
  slate700: '#334155',
  slate900: '#0f172a',
  emerald500: '#10b981',
  emerald600: '#059669',
};

const MonthTable: React.FC<MonthTableProps> = ({ month, year, isMini = false }) => {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const getDayName = (day: number) => {
    const date = new Date(year, month, day);
    const dayName = date.toLocaleDateString('pt-BR', { weekday: 'short' });
    return dayName.replace('.', '');
  };

  const getFolgasForDay = (day: number) => {
    const date = new Date(year, month, day);
    const workingGroups = new Set([
      getGroupForShift(date, 'Turno 1'),
      getGroupForShift(date, 'Turno 2'),
      getGroupForShift(date, 'Turno 3')
    ]);
    const allGroups: Group[] = ['A', 'B', 'C', 'D', 'E'];
    return allGroups.filter(g => !workingGroups.has(g));
  };

  const borderStyle = { border: `1px solid ${colors.slate200}` };

  return (
    <div 
      style={{ 
        backgroundColor: colors.white, 
        border: `1px solid ${colors.slate200}`,
        boxShadow: isMini ? '0 1px 2px 0 rgba(0,0,0,0.05)' : '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)'
      }}
      className={cn("overflow-hidden", isMini ? "rounded-xl mb-6 shadow-sm print:mb-4 print:shadow-none print:border-none print:rounded-none px-0" : "rounded-[2rem]")}
    >
      <div 
        style={{ 
          backgroundColor: isMini ? colors.slate100 : colors.emerald600, 
          color: isMini ? colors.slate900 : colors.white,
          borderBottom: isMini ? `1px solid ${colors.slate200}` : 'none'
        }}
        className={cn(
          "flex justify-between items-center",
          isMini ? "p-3 print:p-1.5" : "p-6 md:p-8"
        )}
      >
        <div>
          <h2 
            style={{ color: isMini ? colors.slate900 : colors.white }}
            className={cn("font-bold tracking-tight", isMini ? "text-base print:text-xs" : "text-xl")}
          >
            {months[month]} {year}
          </h2>
        </div>
      </div>

      <div className={cn("overflow-x-auto whitespace-nowrap print:p-0 print:overflow-visible", isMini ? "p-3" : "p-4 md:p-5")}>
        <table className={cn("border-collapse text-[9px] print:min-w-0 print:w-full", isMini ? "min-w-[800px] w-full" : "min-w-[850px] w-full")}>
          <thead>
            <tr>
              <th 
                style={{ backgroundColor: colors.white, border: `1px solid ${colors.slate200}`, color: colors.slate400 }}
                className={cn("sticky left-0 z-10 p-1 text-left font-black uppercase tracking-widest print:static print:bg-transparent", isMini ? "w-10" : "w-14")}
              >
                Dia
              </th>
              {daysArray.map(day => (
                <th 
                  key={day} 
                  style={{ border: `1px solid ${colors.slate200}`, color: colors.slate600 }}
                  className="p-0.5 text-center w-5 font-black"
                >
                  {day.toString().padStart(2, '0')}
                </th>
              ))}
            </tr>
            <tr style={{ backgroundColor: colors.slate50 }}>
              <th 
                style={{ backgroundColor: colors.slate50, border: `1px solid ${colors.slate200}`, color: colors.slate400 }}
                className={cn("sticky left-0 z-10 p-1 text-left font-bold uppercase tracking-widest print:static print:bg-transparent", isMini ? "w-10" : "w-14")}
              >
                Hora
              </th>
              {daysArray.map(day => (
                <th 
                  key={day} 
                  style={{ border: `1px solid ${colors.slate200}`, color: colors.slate500 }}
                  className="p-0.5 text-center w-5 font-bold lowercase"
                >
                  {getDayName(day)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td 
                style={{ backgroundColor: colors.white, border: `1px solid ${colors.slate200}`, color: colors.slate700 }}
                className={cn("sticky left-0 z-10 p-1.5 font-bold print:static print:bg-transparent", isMini ? "w-10" : "w-14")}
              >
                {isMini ? '16hs' : '16 às 24 h'}
              </td>
              {daysArray.map(day => {
                const group = getGroupForShift(new Date(year, month, day), 'Turno 3');
                return (
                  <td 
                    key={day} 
                    style={{ backgroundColor: groupColors[group].bg, color: groupColors[group].text, border: `1px solid ${colors.slate200}` }}
                    className="p-0 text-center font-black"
                  >
                    {group}
                  </td>
                );
              })}
            </tr>
            <tr>
              <td 
                style={{ backgroundColor: colors.white, border: `1px solid ${colors.slate200}`, color: colors.slate700 }}
                className={cn("sticky left-0 z-10 p-1.5 font-bold print:static print:bg-transparent", isMini ? "w-10" : "w-14")}
              >
                {isMini ? '00hs' : '00 às 08 h'}
              </td>
              {daysArray.map(day => {
                const group = getGroupForShift(new Date(year, month, day), 'Turno 1');
                return (
                  <td 
                    key={day} 
                    style={{ backgroundColor: groupColors[group].bg, color: groupColors[group].text, border: `1px solid ${colors.slate200}` }}
                    className="p-0 text-center font-black"
                  >
                    {group}
                  </td>
                );
              })}
            </tr>
            <tr>
              <td 
                style={{ backgroundColor: colors.white, border: `1px solid ${colors.slate200}`, color: colors.slate700 }}
                className={cn("sticky left-0 z-10 p-1.5 font-bold print:static print:bg-transparent", isMini ? "w-10" : "w-14")}
              >
                {isMini ? '08hs' : '08 às 16 h'}
              </td>
              {daysArray.map(day => {
                const group = getGroupForShift(new Date(year, month, day), 'Turno 2');
                return (
                  <td 
                    key={day} 
                    style={{ backgroundColor: groupColors[group].bg, color: groupColors[group].text, border: `1px solid ${colors.slate200}` }}
                    className="p-0 text-center font-black"
                  >
                    {group}
                  </td>
                );
              })}
            </tr>
            <tr style={{ backgroundColor: 'rgba(248, 250, 252, 0.5)' }}>
              <td 
                rowSpan={2} 
                style={{ backgroundColor: colors.slate50, border: `1px solid ${colors.slate200}`, color: colors.slate400 }}
                className={cn("sticky left-0 z-10 p-1.5 font-black uppercase tracking-[0.2em] print:static print:bg-transparent", isMini ? "w-10" : "w-14")}
              >
                Folga
              </td>
              {daysArray.map(day => {
                const folgas = getFolgasForDay(day);
                return (
                  <td 
                    key={day} 
                    style={{ border: `1px solid ${colors.slate200}`, color: colors.slate600, backgroundColor: colors.white }}
                    className="p-0.5 text-center font-bold h-5"
                  >
                    {folgas[0]}
                  </td>
                );
              })}
            </tr>
            <tr style={{ backgroundColor: 'rgba(248, 250, 252, 0.5)' }}>
              {daysArray.map(day => {
                const folgas = getFolgasForDay(day);
                return (
                  <td 
                    key={day} 
                    style={{ border: `1px solid ${colors.slate200}`, color: colors.slate600, backgroundColor: colors.white }}
                    className="p-0.5 text-center font-bold h-5"
                  >
                    {folgas[1]}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
      {!isMini && (
        <div 
          style={{ borderTop: `1px solid ${colors.slate100}`, backgroundColor: colors.slate50 }}
          className="p-8 flex flex-wrap gap-6 items-center print:hidden"
        >
          <div style={{ color: colors.slate400 }} className="text-[10px] font-black uppercase tracking-[0.2em] mr-2">Legenda:</div>
          {(['A', 'B', 'C', 'D', 'E'] as Group[]).map(group => (
            <div key={group} className="flex items-center gap-2">
              <div 
                style={{ backgroundColor: groupColors[group].bg, color: groupColors[group].text }}
                className="w-6 h-6 rounded-lg flex items-center justify-center font-black text-[10px]"
              >
                {group}
              </div>
              <span style={{ color: colors.slate600 }} className="text-xs font-bold">Letra {group}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const Schedule: React.FC = () => {
  const [viewMode, setViewMode] = useState<'monthly' | 'annual'>('monthly');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [exporting, setExporting] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const exportPDF = async () => {
    if (!containerRef.current) return;
    setExporting(true);

    try {
      const element = containerRef.current;
      
      // Calculate the actual scroll dimensions to capture everything
      const scrollWidth = element.scrollWidth;
      const scrollHeight = element.scrollHeight;

      // Force high quality capture of the full scrollable area
      const dataUrl = await htmlToImage.toPng(element, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        width: scrollWidth,
        height: scrollHeight,
        style: {
          transform: 'none',
          overflow: 'visible'
        }
      });

      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = dataUrl;
      });

      const imgWidth = img.width;
      const imgHeight = img.height;
      const pdfFormatWidth = 297; // mm
      const pdfFormatHeight = (imgHeight * pdfFormatWidth) / imgWidth;

      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: viewMode === 'annual' ? [pdfFormatWidth, pdfFormatHeight] : 'a4'
      });

      const actualPdfWidth = pdf.internal.pageSize.getWidth();
      const actualPdfHeight = pdf.internal.pageSize.getHeight();
      
      const margin = 10;
      const targetWidth = actualPdfWidth - (margin * 2);
      const targetHeight = actualPdfHeight - (margin * 2);
      
      const ratio = imgWidth / imgHeight;

      let finalWidth = targetWidth;
      let finalHeight = targetWidth / ratio;

      // For monthly view, we still want to ensure it fits A4 height
      if (viewMode === 'monthly' && finalHeight > targetHeight) {
        finalHeight = targetHeight;
        finalWidth = targetHeight * ratio;
      }

      // Center it on the page
      const x = (actualPdfWidth - finalWidth) / 2;
      const y = (actualPdfHeight - finalHeight) / 2;

      pdf.addImage(dataUrl, 'PNG', x, y, finalWidth, finalHeight);
      pdf.save(`escala_${viewMode}_${selectedYear}${viewMode === 'monthly' ? '_' + (selectedMonth + 1) : ''}.pdf`);
    } catch (err) {
      console.error("Error generating PDF:", err);
      setShowErrorModal(true);
    } finally {
      setExporting(false);
    }
  };

  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  const handlePrevYear = () => {
    setSelectedYear(selectedYear - 1);
  };

  const handleNextYear = () => {
    setSelectedYear(selectedYear + 1);
  };

  return (
    <div className="space-y-6">
      <style dangerouslySetInnerHTML={{ __html: `
        /* Forçar visibilidade total durante exportação para evitar cortes por scroll */
      .export-mode-active .overflow-x-auto {
        overflow: visible !important;
        width: auto !important;
        min-width: unset !important;
      }
      .export-mode-active table {
        min-width: unset !important;
        width: 100% !important;
        table-layout: auto !important;
        font-size: 7px !important;
      }
      .export-mode-active th, .export-mode-active td {
        padding: 0.5px !important;
      }
      .export-mode-active .sticky {
        position: static !important;
      }
      @media print {
          @page { size: landscape; margin: 1cm; }
          body { background: white !important; }
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          .print\\:p-0 { padding: 0 !important; }
          .print\\:m-0 { margin: 0 !important; }
          .print\\:shadow-none { shadow: none !important; }
          .print\\:w-full { width: 100% !important; }
          .print\\:text-black { color: black !important; }
          table { font-size: 8px !important; }
          th, td { padding: 2px !important; }
          @page { size: landscape; }
        }
      `}} />
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Escala de Turno</h1>
          <p className="text-gray-500 mt-1">Consulte a escala de trabalho e folgas.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              onClick={() => setViewMode('monthly')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all outline-none",
                viewMode === 'monthly' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Mensal
            </button>
            <button
              onClick={() => setViewMode('annual')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all outline-none",
                viewMode === 'annual' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Anual
            </button>
          </div>

          <button 
            onClick={exportPDF}
            disabled={exporting}
            className="flex items-center gap-2 bg-emerald-600 px-4 py-2.5 rounded-xl text-xs font-bold text-white hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 disabled:opacity-50"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            PDF
          </button>

          <div className={cn(
            "flex items-center gap-1 bg-white p-1 rounded-2xl border border-slate-200 shadow-sm transition-all focus-within:ring-2 focus-within:ring-emerald-100",
            viewMode === 'annual' ? "min-w-[140px]" : ""
          )}>
            <button 
              onClick={viewMode === 'monthly' ? handlePrevMonth : handlePrevYear}
              className="p-2 hover:bg-slate-50 rounded-xl text-slate-400 hover:text-indigo-600 transition-all outline-none"
              title={viewMode === 'monthly' ? "Mês Anterior" : "Ano Anterior"}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            
            <div className={cn("flex flex-col items-center px-2", viewMode === 'monthly' ? "min-w-[140px]" : "min-w-[100px]")}>
              {viewMode === 'monthly' && (
                <select 
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                  className="bg-transparent border-none text-sm font-bold text-slate-900 leading-none focus:ring-0 cursor-pointer p-0 text-center w-full appearance-none outline-none"
                >
                  {months.map((m, i) => (
                    <option key={m} value={i}>{m}</option>
                  ))}
                </select>
              )}
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className={cn(
                  "bg-transparent border-none focus:ring-0 cursor-pointer p-0 text-center w-full appearance-none outline-none",
                  viewMode === 'monthly' ? "text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1" : "text-sm font-bold text-slate-900 leading-none"
                )}
              >
                {Array.from({ length: 11 }, (_, i) => 2024 + i).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <button 
              onClick={viewMode === 'monthly' ? handleNextMonth : handleNextYear}
              className="p-2 hover:bg-slate-50 rounded-xl text-slate-400 hover:text-indigo-600 transition-all outline-none"
              title={viewMode === 'monthly' ? "Próximo Mês" : "Próximo Ano"}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div ref={containerRef} className={cn("bg-white rounded-[2rem] p-4 md:p-8", exporting && "export-mode-active")}>
        {/* Header visible only during PDF export */}
        {exporting && (
          <div className="mb-8 border-b pb-6 border-slate-100 uppercase">
            <h1 className="text-4xl font-black text-emerald-600 tracking-tighter">Escala de Turno {selectedYear}</h1>
            <p className="text-slate-500 font-bold text-sm mt-1">
              {viewMode === 'monthly' ? `Competência: ${months[selectedMonth]}` : 'Escala Anual Consolidada'}
            </p>
          </div>
        )}

        <motion.div 
          key={`${viewMode}-${selectedMonth}-${selectedYear}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(viewMode === 'monthly' ? "" : "space-y-4")}
        >
          {viewMode === 'monthly' ? (
            <MonthTable month={selectedMonth} year={selectedYear} />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                {months.map((_, index) => (
                  <MonthTable key={index} month={index} year={selectedYear} isMini={true} />
                ))}
              </div>
            <div 
              style={{ backgroundColor: colors.white, border: `1px solid ${colors.slate200}`, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)' }}
              className="rounded-[2rem] p-8"
            >
              <div className="flex flex-wrap gap-8 items-center justify-center">
                <div style={{ color: colors.slate400 }} className="text-[10px] font-black uppercase tracking-[0.2em]">Legenda da Escala:</div>
                {(['A', 'B', 'C', 'D', 'E'] as Group[]).map(group => (
                  <div key={group} className="flex items-center gap-2">
                    <div 
                      style={{ backgroundColor: groupColors[group].bg, color: groupColors[group].text }}
                      className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs"
                    >
                      {group}
                    </div>
                    <span style={{ color: colors.slate600 }} className="text-sm font-bold">Letra {group}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </motion.div>

      <ConfirmationModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        title="Erro na Geração"
        message="Ocorreu um erro ao gerar o PDF. Verifique se o conteúdo é muito extenso ou tente em outro navegador."
        type="error"
      />
    </div>
    </div>
  );
};

export default Schedule;
