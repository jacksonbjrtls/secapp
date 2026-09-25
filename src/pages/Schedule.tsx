import React, { useState, useRef } from 'react';
import { 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  Download, 
  Loader2, 
  CalendarDays, 
  ChevronDown, 
  X, 
  ArrowRight, 
  RotateCcw, 
  Search 
} from 'lucide-react';
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

interface AnnualPDFMonthTableProps {
  month: number;
  year: number;
}

const AnnualPDFMonthTable: React.FC<AnnualPDFMonthTableProps> = ({ month, year }) => {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysArray = Array.from({ length: 31 }, (_, i) => i + 1);

  const getDayName = (day: number) => {
    if (day > daysInMonth) return '';
    const date = new Date(year, month, day);
    const dayName = date.toLocaleDateString('pt-BR', { weekday: 'short' });
    return dayName.replace('.', '').toLowerCase();
  };

  const getFolgasForDay = (day: number) => {
    if (day > daysInMonth) return ['', ''];
    const date = new Date(year, month, day);
    const workingGroups = new Set([
      getGroupForShift(date, 'Turno 1'),
      getGroupForShift(date, 'Turno 2'),
      getGroupForShift(date, 'Turno 3')
    ]);
    const allGroups: Group[] = ['A', 'B', 'C', 'D', 'E'];
    return allGroups.filter(g => !workingGroups.has(g));
  };

  const monthLabel = months[month].toLowerCase() + ' ' + year;

  return (
    <table 
      style={{ 
        width: '100%', 
        borderCollapse: 'collapse', 
        tableLayout: 'fixed',
        fontFamily: 'Inter, sans-serif'
      }}
      className="border border-slate-300"
    >
      <colgroup>
        <col style={{ width: '28px' }} />
        <col style={{ width: '68px' }} />
        {Array.from({ length: 31 }).map((_, i) => (
          <col key={i} style={{ width: '33.5px' }} />
        ))}
      </colgroup>
      <tbody>
        {/* Dia Row */}
        <tr style={{ height: '15px' }}>
          {/* Month Label spans all 7 rows */}
          <td 
            rowSpan={7} 
            className="bg-slate-800 text-white font-black text-[8px] uppercase tracking-wider border border-slate-300 text-center select-none"
            style={{
              padding: '1px',
              verticalAlign: 'middle',
              position: 'relative'
            }}
          >
            <div 
              style={{ 
                writingMode: 'vertical-rl', 
                transform: 'rotate(180deg)',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '95px',
                width: '100%'
              }}
              className="mx-auto"
            >
              {monthLabel}
            </div>
          </td>
          
          <td className="bg-slate-700 text-white font-black text-[8px] uppercase tracking-wider border border-slate-300 px-1 text-left select-none">
            Dia
          </td>
          {daysArray.map(day => {
            const hasDay = day <= daysInMonth;
            return (
              <td 
                key={`day-${day}`}
                className={cn(
                  "border border-slate-300 text-center text-[9px] font-black select-none",
                  hasDay ? "bg-slate-700 text-white" : "bg-slate-50"
                )}
                style={{ padding: 0 }}
              >
                {hasDay ? day.toString().padStart(2, '0') : ''}
              </td>
            );
          })}
        </tr>

        {/* Hora (Weekday) Row */}
        <tr style={{ height: '15px' }}>
          <td className="bg-emerald-100 text-emerald-950 font-black text-[8px] uppercase tracking-wider border border-slate-300 px-1 text-left select-none">
            Hora
          </td>
          {daysArray.map(day => {
            const hasDay = day <= daysInMonth;
            const isWeekend = hasDay && (new Date(year, month, day).getDay() === 0 || new Date(year, month, day).getDay() === 6);
            return (
              <td 
                key={`dayname-${day}`}
                className={cn(
                  "border border-slate-300 text-center text-[8px] font-bold select-none",
                  hasDay 
                    ? isWeekend 
                      ? "bg-emerald-200 text-emerald-950 font-black" 
                      : "bg-emerald-100 text-emerald-900" 
                    : "bg-slate-50"
                )}
                style={{ padding: 0 }}
              >
                {getDayName(day)}
              </td>
            );
          })}
        </tr>

        {/* 16 às 24 h (Shift 3) */}
        <tr style={{ height: '17px' }}>
          <td className="bg-white text-slate-700 font-bold text-[8px] border border-slate-300 px-1 text-left select-none">
            16 às 24 h
          </td>
          {daysArray.map(day => {
            const hasDay = day <= daysInMonth;
            if (!hasDay) return <td key={`shift3-${day}`} className="border border-slate-300 bg-slate-50" />;
            const group = getGroupForShift(new Date(year, month, day), 'Turno 3');
            return (
              <td 
                key={`shift3-${day}`}
                style={{ 
                  backgroundColor: groupColors[group].bg, 
                  color: groupColors[group].text,
                }}
                className="border border-slate-300 text-center text-[9px] font-black select-none"
              >
                {group}
              </td>
            );
          })}
        </tr>

        {/* 00 às 08 h (Shift 1) */}
        <tr style={{ height: '17px' }}>
          <td className="bg-white text-slate-700 font-bold text-[8px] border border-slate-300 px-1 text-left select-none">
            00 às 08 h
          </td>
          {daysArray.map(day => {
            const hasDay = day <= daysInMonth;
            if (!hasDay) return <td key={`shift1-${day}`} className="border border-slate-300 bg-slate-50" />;
            const group = getGroupForShift(new Date(year, month, day), 'Turno 1');
            return (
              <td 
                key={`shift1-${day}`}
                style={{ 
                  backgroundColor: groupColors[group].bg, 
                  color: groupColors[group].text,
                }}
                className="border border-slate-300 text-center text-[9px] font-black select-none"
              >
                {group}
              </td>
            );
          })}
        </tr>

        {/* 08 às 16 h (Shift 2) */}
        <tr style={{ height: '17px' }}>
          <td className="bg-white text-slate-700 font-bold text-[8px] border border-slate-300 px-1 text-left select-none">
            08 às 16 h
          </td>
          {daysArray.map(day => {
            const hasDay = day <= daysInMonth;
            if (!hasDay) return <td key={`shift2-${day}`} className="border border-slate-300 bg-slate-50" />;
            const group = getGroupForShift(new Date(year, month, day), 'Turno 2');
            return (
              <td 
                key={`shift2-${day}`}
                style={{ 
                  backgroundColor: groupColors[group].bg, 
                  color: groupColors[group].text,
                }}
                className="border border-slate-300 text-center text-[9px] font-black select-none"
              >
                {group}
              </td>
            );
          })}
        </tr>

        {/* Folga Row 1 */}
        <tr style={{ height: '17px' }}>
          <td rowSpan={2} className="bg-slate-100 text-slate-600 font-black text-[8px] uppercase tracking-wider border border-slate-300 px-1 text-left select-none">
            Folga
          </td>
          {daysArray.map(day => {
            const hasDay = day <= daysInMonth;
            if (!hasDay) return <td key={`folga1-${day}`} className="border border-slate-300 bg-slate-50" />;
            const folgas = getFolgasForDay(day);
            return (
              <td 
                key={`folga1-${day}`}
                className="border border-slate-300 text-center text-[9px] font-bold text-slate-700 bg-white select-none"
              >
                {folgas[0]}
              </td>
            );
          })}
        </tr>

        {/* Folga Row 2 */}
        <tr style={{ height: '17px' }}>
          {daysArray.map(day => {
            const hasDay = day <= daysInMonth;
            if (!hasDay) return <td key={`folga2-${day}`} className="border border-slate-300 bg-slate-50" />;
            const folgas = getFolgasForDay(day);
            return (
              <td 
                key={`folga2-${day}`}
                className="border border-slate-300 text-center text-[9px] font-bold text-slate-700 bg-white select-none"
              >
                {folgas[1]}
              </td>
            );
          })}
        </tr>
      </tbody>
    </table>
  );
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
                  key={`header-day-${day}`} 
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
                  key={`header-dayname-${day}`} 
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
                    key={`shift-3-${day}`} 
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
                    key={`shift-1-${day}`} 
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
                    key={`shift-2-${day}`} 
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
                    key={`folga-1-${day}`} 
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
                    key={`folga-2-${day}`} 
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
          {(['A', 'B', 'C', 'D', 'E'] as Group[]).map((group, gIdx) => (
            <div key={`legend-group-main-${group}-${gIdx}`} className="flex items-center gap-2">
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

  const currentRealYear = new Date().getFullYear();
  const [isYearPickerOpen, setIsYearPickerOpen] = useState(false);
  const [pickerDecadeStart, setPickerDecadeStart] = useState(() => Math.floor(new Date().getFullYear() / 10) * 10);
  const [customYearInput, setCustomYearInput] = useState('');

  const openYearPicker = () => {
    setPickerDecadeStart(Math.floor(selectedYear / 10) * 10);
    setCustomYearInput(selectedYear.toString());
    setIsYearPickerOpen(true);
  };

  const handleSelectYear = (year: number) => {
    setSelectedYear(year);
    setIsYearPickerOpen(false);
  };

  const handleApplyCustomYear = () => {
    const parsed = parseInt(customYearInput.trim(), 10);
    if (!isNaN(parsed) && parsed >= 1900 && parsed <= 2150) {
      handleSelectYear(parsed);
    }
  };

  const quickYears = [
    selectedYear - 2,
    selectedYear - 1,
    selectedYear,
    selectedYear + 1,
    selectedYear + 2,
    selectedYear + 3,
  ];

  const exportPDF = async () => {
    setExporting(true);

    // Give React sufficient time to render the off-screen templates in the DOM
    await new Promise((resolve) => setTimeout(resolve, 600));

    try {
      if (viewMode === 'monthly') {
        const pdf = new jsPDF({
          orientation: 'landscape',
          unit: 'mm',
          format: 'a4'
        });

        const element = document.getElementById('pdf-page-monthly');
        if (!element) throw new Error("Export element not found");

        const dataUrl = await htmlToImage.toPng(element, {
          backgroundColor: '#ffffff',
          pixelRatio: 3, // Ultra high-definition crisp output
          style: {
            transform: 'none',
          }
        });

        pdf.addImage(dataUrl, 'PNG', 0, 0, 297, 210);
        pdf.save(`escala_mensal_${selectedYear}_${selectedMonth + 1}.pdf`);
      } else {
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4'
        });

        const element = document.getElementById('pdf-page-annual');
        if (!element) throw new Error("Export element not found");

        const dataUrl = await htmlToImage.toPng(element, {
          backgroundColor: '#ffffff',
          pixelRatio: 3, // Ultra high-definition crisp output
          style: {
            transform: 'none',
          }
        });

        pdf.addImage(dataUrl, 'PNG', 0, 0, 210, 297);
        pdf.save(`escala_anual_${selectedYear}.pdf`);
      }
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

      {/* Modern Unlimited Year Picker Modal */}
      <AnimatePresence>
        {isYearPickerOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className="bg-white rounded-[2rem] shadow-2xl border border-slate-200 p-5 sm:p-6 md:p-7 max-w-md w-full space-y-4 sm:space-y-5 max-h-[calc(100dvh-1.5rem)] overflow-y-auto"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-xs">
                    <CalendarDays className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-800 tracking-tight">Selecione o Ano da Escala</h3>
                    <p className="text-xs text-slate-400 font-medium">Navegação contínua sem limite de anos</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsYearPickerOpen(false)}
                  className="w-8 h-8 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Decade Navigator */}
              <div className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded-2xl border border-slate-200/80">
                <button
                  onClick={() => setPickerDecadeStart(prev => prev - 10)}
                  className="p-2 hover:bg-white rounded-xl text-slate-600 hover:text-emerald-600 transition-all shadow-xs"
                  title="Década Anterior (-10 anos)"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="text-xs font-black text-slate-700 uppercase tracking-wider">
                  Década de {pickerDecadeStart} ({pickerDecadeStart} – {pickerDecadeStart + 9})
                </div>
                <button
                  onClick={() => setPickerDecadeStart(prev => prev + 10)}
                  className="p-2 hover:bg-white rounded-xl text-slate-600 hover:text-emerald-600 transition-all shadow-xs"
                  title="Próxima Década (+10 anos)"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Year Grid */}
              <div className="grid grid-cols-3 gap-2.5">
                {Array.from({ length: 12 }, (_, i) => pickerDecadeStart - 1 + i).map((y) => {
                  const isSelected = y === selectedYear;
                  const isCurrent = y === currentRealYear;
                  return (
                    <button
                      key={`grid-year-${y}`}
                      onClick={() => handleSelectYear(y)}
                      className={cn(
                        "relative p-3 rounded-2xl text-center font-black transition-all flex flex-col items-center justify-center gap-0.5",
                        isSelected
                          ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200 scale-[1.02] ring-2 ring-emerald-600 ring-offset-2"
                          : "bg-slate-50 hover:bg-emerald-50/80 text-slate-700 hover:text-emerald-800 border border-slate-200/60 hover:border-emerald-200"
                      )}
                    >
                      <span className="text-sm tracking-tight">{y}</span>
                      {isCurrent && (
                        <span className={cn(
                          "text-[9px] uppercase tracking-wider px-1.5 py-0.2 rounded-full font-bold",
                          isSelected ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-800"
                        )}>
                          Atual
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Direct Year Input */}
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Ou digite qualquer ano desejado:
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="number"
                      value={customYearInput}
                      onChange={(e) => setCustomYearInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleApplyCustomYear();
                        }
                      }}
                      placeholder="Ex: 2038 ou 2050"
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <button
                    onClick={handleApplyCustomYear}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-sm active:scale-95 shrink-0"
                  >
                    Ir <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Quick Presets */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <button
                  onClick={() => handleSelectYear(currentRealYear)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all",
                    selectedYear === currentRealYear ? "bg-emerald-100 text-emerald-800 font-black" : "bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-600"
                  )}
                >
                  Ano Atual ({currentRealYear})
                </button>
                <button
                  onClick={() => handleSelectYear(selectedYear + 1)}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-600 text-[11px] font-bold transition-all"
                >
                  +1 Ano ({selectedYear + 1})
                </button>
                <button
                  onClick={() => handleSelectYear(selectedYear + 5)}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-600 text-[11px] font-bold transition-all"
                >
                  +5 Anos ({selectedYear + 5})
                </button>
                <button
                  onClick={() => handleSelectYear(selectedYear + 10)}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-600 text-[11px] font-bold transition-all"
                >
                  +10 Anos ({selectedYear + 10})
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Escala de Turno</h1>
          <p className="text-gray-500 mt-1">Consulte a escala de trabalho e folgas com calendário contínuo sem limites.</p>
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
            title={`Exportar ${viewMode === 'annual' ? `Escala Anual de ${selectedYear}` : `Escala de ${months[selectedMonth]}/${selectedYear}`} em PDF`}
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            PDF {viewMode === 'annual' ? selectedYear : ''}
          </button>

          {/* Navigator Container */}
          <div className="flex items-center gap-1 bg-white p-1 rounded-2xl border border-slate-200 shadow-xs transition-all">
            <button 
              onClick={viewMode === 'monthly' ? handlePrevMonth : handlePrevYear}
              className="p-2 hover:bg-slate-50 rounded-xl text-slate-400 hover:text-emerald-600 transition-all outline-none"
              title={viewMode === 'monthly' ? "Mês Anterior" : "Ano Anterior"}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            
            {viewMode === 'monthly' ? (
              <div className="flex items-center px-1">
                <select 
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                  className="bg-transparent border-none text-sm font-black text-slate-900 leading-none focus:ring-0 cursor-pointer py-1 px-2 appearance-none outline-none hover:text-emerald-600"
                >
                  {months.map((m, i) => (
                    <option key={`sched-month-${m}-${i}`} value={i}>{m}</option>
                  ))}
                </select>
                <button
                  onClick={openYearPicker}
                  className="flex items-center gap-1 py-1 px-2 rounded-lg hover:bg-slate-100 text-xs font-black text-slate-500 hover:text-emerald-700 transition-all"
                  title="Clique para escolher qualquer ano livremente"
                >
                  <span>{selectedYear}</span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>
              </div>
            ) : (
              <button
                onClick={openYearPicker}
                className="flex items-center gap-2 py-1.5 px-3 rounded-xl hover:bg-emerald-50/60 text-sm font-black text-slate-900 hover:text-emerald-700 transition-all"
                title="Clique para abrir o seletor anual ilimitado"
              >
                <Calendar className="w-4 h-4 text-emerald-600" />
                <span>Ano {selectedYear}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>
            )}

            <button 
              onClick={viewMode === 'monthly' ? handleNextMonth : handleNextYear}
              className="p-2 hover:bg-slate-50 rounded-xl text-slate-400 hover:text-emerald-600 transition-all outline-none"
              title={viewMode === 'monthly' ? "Próximo Mês" : "Próximo Ano"}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {selectedYear !== currentRealYear && (
            <button
              onClick={() => setSelectedYear(currentRealYear)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 text-xs font-bold transition-all border border-slate-200 shadow-2xs"
              title="Voltar para o ano corrente"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Ano Atual ({currentRealYear})
            </button>
          )}
        </div>
      </div>

      <div ref={containerRef} className="bg-white rounded-[2rem] p-4 md:p-8">
        <motion.div 
          key={`${viewMode}-${selectedMonth}-${selectedYear}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(viewMode === 'monthly' ? "" : "space-y-6")}
        >
          {viewMode === 'monthly' ? (
            <MonthTable month={selectedMonth} year={selectedYear} />
          ) : (
            <div className="space-y-6">
              {/* Annual Header Banner with Quick Chips */}
              <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-900 text-white rounded-[2rem] p-6 shadow-lg border border-emerald-800/40 flex flex-col md:flex-row md:items-center justify-between gap-5">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-[10px] font-black uppercase tracking-wider text-emerald-300">
                      Calendário Anual Completo
                    </span>
                    <span className="text-xs text-emerald-200/90 font-bold">• 12 Meses (Jan a Dez)</span>
                  </div>
                  <h2 className="text-2xl md:text-3xl font-black tracking-tight text-white flex items-center gap-3">
                    Escala de Turno — {selectedYear}
                  </h2>
                  <p className="text-xs text-emerald-100/80 max-w-xl">
                    Ciclo contínuo de 35 dias rotativo. Visualize os dias de trabalho e folgas para qualquer ano futuro ou passado sem qualquer limitação.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex items-center gap-1 bg-white/10 backdrop-blur-md p-1.5 rounded-2xl border border-white/15">
                    <button
                      onClick={handlePrevYear}
                      className="p-1.5 hover:bg-white/20 rounded-xl text-white transition-colors"
                      title="Ano Anterior"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    {quickYears.map((qy) => (
                      <button
                        key={`quick-year-${qy}`}
                        onClick={() => setSelectedYear(qy)}
                        className={cn(
                          "px-3 py-1 rounded-xl text-xs font-black transition-all",
                          qy === selectedYear
                            ? "bg-emerald-500 text-white shadow-md scale-105"
                            : "text-white/80 hover:bg-white/15 hover:text-white"
                        )}
                      >
                        {qy}
                      </button>
                    ))}
                    <button
                      onClick={handleNextYear}
                      className="p-1.5 hover:bg-white/20 rounded-xl text-white transition-colors"
                      title="Próximo Ano"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    onClick={openYearPicker}
                    className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-white font-black text-xs px-4 py-2.5 rounded-xl transition-all shadow-md active:scale-95"
                    title="Abrir Seletor Anual Ilimitado"
                  >
                    <CalendarDays className="w-4 h-4" />
                    Escolher Ano
                  </button>
                </div>
              </div>

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
                  {(['A', 'B', 'C', 'D', 'E'] as Group[]).map((group, gIdx) => (
                    <div key={`legend-group-annual-${group}-${gIdx}`} className="flex items-center gap-2">
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
      </div>

      {/* Off-screen high-quality container for crisp A4 landscape PDF rendering */}
      {exporting && (
        <div
          style={{
            position: 'absolute',
            left: '-9999px',
            top: '0',
            width: '1200px',
            backgroundColor: '#ffffff',
          }}
        >
          {viewMode === 'monthly' ? (
            <div
              id="pdf-page-monthly"
              className="p-10 bg-white flex flex-col justify-between"
              style={{
                width: '1200px',
                height: '848px',
                boxSizing: 'border-box',
              }}
            >
              <div>
                <div className="flex justify-between items-center border-b pb-4 mb-6 border-slate-200">
                  <div>
                    <h1 className="text-3xl font-black text-emerald-600 tracking-tight">Escala de Turno</h1>
                    <p className="text-slate-500 font-bold text-sm mt-0.5">Competência: {months[selectedMonth]} {selectedYear}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-wider">GERADO EM {new Date().toLocaleDateString('pt-BR')}</p>
                  </div>
                </div>
                <MonthTable month={selectedMonth} year={selectedYear} isMini={false} />
              </div>

              <div className="mt-6 p-5 bg-slate-50 border border-slate-200/60 rounded-[1.5rem] flex flex-wrap gap-6 items-center justify-center">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider mr-2">Legenda da Escala:</div>
                {(['A', 'B', 'C', 'D', 'E'] as Group[]).map((group, gIdx) => (
                  <div key={`legend-group-pdf-${group}-${gIdx}`} className="flex items-center gap-2">
                    <div
                      style={{ backgroundColor: groupColors[group].bg, color: groupColors[group].text }}
                      className="w-6 h-6 rounded-lg flex items-center justify-center font-black text-xs"
                    >
                      {group}
                    </div>
                    <span className="text-xs font-bold text-slate-600">Letra {group}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div
              id="pdf-page-annual"
              className="p-8 bg-white flex flex-col justify-between"
              style={{
                width: '1200px',
                height: '1697px',
                boxSizing: 'border-box',
              }}
            >
              <div>
                <div className="border-[3px] border-slate-800 py-2.5 text-center mb-3">
                  <h1 className="text-2xl font-black text-slate-800 uppercase tracking-[0.15em]">
                    ESCALA DE TURNO - {selectedYear}
                  </h1>
                </div>

                <div className="space-y-[3.5px]">
                  {months.map((_, index) => (
                    <AnnualPDFMonthTable key={index} month={index} year={selectedYear} />
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold border-t border-slate-200 pt-1.5 mt-2">
                <div className="uppercase tracking-wider">Gestão de Escalas Inteligente</div>
                <div className="uppercase tracking-wider">Impresso em {new Date().toLocaleDateString('pt-BR')} - M.A.A.S.</div>
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmationModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        title="Erro na Geração"
        message="Ocorreu um erro ao gerar o PDF. Verifique se o conteúdo é muito extenso ou tente em outro navegador."
        type="error"
      />
    </div>
  );
};

export default Schedule;
