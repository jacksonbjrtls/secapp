import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  query,
  orderBy
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/errorHandler';
import { 
  Clock, 
  Calendar, 
  Plus, 
  Trash2, 
  Edit2, 
  Search, 
  FileText, 
  TrendingUp, 
  BarChart2, 
  Download, 
  AlertTriangle, 
  CheckCircle2, 
  Info, 
  MapPin, 
  Sliders, 
  ClipboardList, 
  Wrench,
  Gauge,
  X,
  FileDown,
  Activity
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { StopReport, StopWorkFront, ProductionLine } from '../types';

const formatDateToBR = (dateStr: string): string => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};

const WORK_FRONT_OPTIONS = [
  'Mecânica',
  'Elétrica',
  'Instrumentação',
  'Hidráulica',
  'Civil',
  'Caldeiraria',
  'Operacional'
] as const;

export default function StopsControl() {
  const { user, isManager, isAdmin } = useAuth();
  
  // Tabs: 'register' | 'history' | 'stats'
  const [activeTab, setActiveTab] = useState<'register' | 'history' | 'stats'>('register');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reports, setReports] = useState<StopReport[]>([]);
  const [lines, setLines] = useState<ProductionLine[]>([]);

  // Search & Filter state for History
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterLine, setFilterLine] = useState<string>('all');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');

  // Editing state
  const [editingReport, setEditingReport] = useState<StopReport | null>(null);

  // Form State
  const [formType, setFormType] = useState<'programada' | 'geral'>('programada');
  const [formDate, setFormDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [formLineId, setFormLineId] = useState<string>('');
  const [formStartTime, setFormStartTime] = useState<string>('08:00');
  const [formEndTime, setFormEndTime] = useState<string>('12:00');
  const [formRejectionTime, setFormRejectionTime] = useState<string>('0');
  const [formSpeedMS1, setFormSpeedMS1] = useState<number>(0);
  const [formSpeedMS2, setFormSpeedMS2] = useState<number>(0);
  const [formObservation, setFormObservation] = useState<string>('');
  
  // Work fronts state inside the form
  const [formWorkFronts, setFormWorkFronts] = useState<Record<string, {
    active: boolean;
    description: string;
    startTime: string;
    endTime: string;
  }>>(() => {
    const initial: Record<string, any> = {};
    WORK_FRONT_OPTIONS.forEach(front => {
      initial[front] = {
        active: false,
        description: '',
        startTime: '08:00',
        endTime: '12:00'
      };
    });
    return initial;
  });

  // Selected report for viewing details modal
  const [viewingReport, setViewingReport] = useState<StopReport | null>(null);

  // Report that was just saved (to display success modal and download PDF)
  const [justSavedReport, setJustSavedReport] = useState<StopReport | null>(null);

  // Sync stop start/end times with all active work fronts by default
  useEffect(() => {
    setFormWorkFronts(prev => {
      const updated = { ...prev };
      WORK_FRONT_OPTIONS.forEach(front => {
        if (!updated[front].active) {
          // Update times if they haven't been manually adjusted when inactive, or always to match
          updated[front] = {
            ...updated[front],
            startTime: formStartTime,
            endTime: formEndTime
          };
        }
      });
      return updated;
    });
  }, [formStartTime, formEndTime]);

  // Load production lines
  useEffect(() => {
    const unsubLines = onSnapshot(collection(db, 'production_lines'), (snap) => {
      const linesData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProductionLine));
      const sortedLines = [...linesData].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      setLines(sortedLines);
      if (sortedLines.length > 0 && !formLineId) {
        setFormLineId(sortedLines[0].id);
      }
    });
    return () => unsubLines();
  }, []);

  // Subscribe to stops reports
  useEffect(() => {
    const q = query(collection(db, 'stops_reports'), orderBy('date', 'desc'));
    const unsubReports = onSnapshot(q, (snap) => {
      const reportsData = snap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          // Handle timestamps
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        } as StopReport;
      });
      setReports(reportsData);
      setLoading(false);
    }, (err) => {
      console.error("Error loading stops reports:", err);
      handleFirestoreError(err, OperationType.LIST, 'stops_reports');
      setLoading(false);
    });
    return () => unsubReports();
  }, []);

  // List of fallback production lines if database is empty
  const availableLines = useMemo(() => {
    const list = lines.length > 0 ? lines : [
      { id: 'ms1', name: 'Linha MS1', active: true },
      { id: 'ms2', name: 'Linha MS2', active: true },
      { id: 'both', name: 'Linhas MS1 & MS2', active: true }
    ];
    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [lines]);

  // Set lineId defaults if empty
  useEffect(() => {
    if (availableLines.length > 0 && !formLineId) {
      setFormLineId(availableLines[0].id);
    }
  }, [availableLines, formLineId]);

  // Form helper to calculate duration of stop in minutes
  const calculatedStopDuration = useMemo(() => {
    if (!formStartTime || !formEndTime) return 0;
    const [startH, startM] = formStartTime.split(':').map(Number);
    const [endH, endM] = formEndTime.split(':').map(Number);
    let diff = (endH * 60 + endM) - (startH * 60 + startM);
    if (diff < 0) {
      diff += 24 * 60; // Stop went over midnight
    }
    return diff;
  }, [formStartTime, formEndTime]);

  // Helper functions for duration
  const getMinutesDiff = (start: string, end: string) => {
    if (!start || !end) return 0;
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    let diff = (endH * 60 + endM) - (startH * 60 + startM);
    if (diff < 0) diff += 24 * 60;
    return diff;
  };

  const formatDurationString = (minutes: number) => {
    if (minutes <= 0) return '0 min';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0) {
      return `${h}h ${m > 0 ? `${m}m` : ''}`;
    }
    return `${m} min`;
  };

  // Set form fields for editing
  const handleStartEdit = (report: StopReport) => {
    setEditingReport(report);
    setFormType(report.type);
    setFormDate(report.date);
    setFormLineId(report.lineId);
    setFormStartTime(report.startTime);
    setFormEndTime(report.endTime);
    setFormRejectionTime(report.rejectionTime || '0');
    setFormSpeedMS1(report.cutterSpeedMS1 || 0);
    setFormSpeedMS2(report.cutterSpeedMS2 || 0);
    setFormObservation(report.observation || '');
    
    // Build initial form work fronts
    const initialFronts: Record<string, any> = {};
    WORK_FRONT_OPTIONS.forEach(front => {
      const match = report.workFronts.find(wf => wf.front === front);
      if (match) {
        initialFronts[front] = {
          active: true,
          description: match.description,
          startTime: match.startTime,
          endTime: match.endTime
        };
      } else {
        initialFronts[front] = {
          active: false,
          description: '',
          startTime: report.startTime,
          endTime: report.endTime
        };
      }
    });
    setFormWorkFronts(initialFronts);
    setActiveTab('register');
  };

  // Cancel edit mode
  const handleCancelEdit = () => {
    setEditingReport(null);
    resetForm();
  };

  // Reset Form fields
  const resetForm = () => {
    setFormType('programada');
    setFormDate(new Date().toISOString().split('T')[0]);
    if (availableLines.length > 0) {
      setFormLineId(availableLines[0].id);
    }
    setFormStartTime('08:00');
    setFormEndTime('12:00');
    setFormRejectionTime('0');
    setFormSpeedMS1(0);
    setFormSpeedMS2(0);
    setFormObservation('');
    
    const initial: Record<string, any> = {};
    WORK_FRONT_OPTIONS.forEach(front => {
      initial[front] = {
        active: false,
        description: '',
        startTime: '08:00',
        endTime: '12:00'
      };
    });
    setFormWorkFronts(initial);
  };

  // Submit report to Firestore
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formLineId) {
      alert("Por favor, selecione uma linha.");
      return;
    }

    setSubmitting(true);
    
    try {
      const selectedLineObj = availableLines.find(l => l.id === formLineId);
      const lineName = selectedLineObj ? selectedLineObj.name : formLineId;

      // Extract work fronts that are active
      const activeWorkFronts: StopWorkFront[] = [];
      WORK_FRONT_OPTIONS.forEach(front => {
        const item = formWorkFronts[front];
        if (item.active) {
          activeWorkFronts.push({
            id: `wf_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            front,
            description: item.description,
            startTime: item.startTime,
            endTime: item.endTime
          });
        }
      });

      const reportData: any = {
        type: formType,
        date: formDate,
        lineId: formLineId,
        lineName,
        startTime: formStartTime,
        endTime: formEndTime,
        rejectionTime: formRejectionTime,
        cutterSpeedMS1: Number(formSpeedMS1) || 0,
        cutterSpeedMS2: Number(formSpeedMS2) || 0,
        workFronts: activeWorkFronts,
        observation: formObservation,
        userId: user?.uid || 'anonymous',
        userName: user?.displayName || 'Operador',
      };

      if (editingReport) {
        reportData.createdAt = editingReport.createdAt || serverTimestamp();
        reportData.updatedAt = serverTimestamp();
      } else {
        reportData.createdAt = serverTimestamp();
      }

      let savedReport: StopReport;

      if (editingReport) {
        await updateDoc(doc(db, 'stops_reports', editingReport.id), reportData);
        savedReport = {
          id: editingReport.id,
          ...reportData,
          createdAt: editingReport.createdAt || new Date()
        };
        setEditingReport(null);
      } else {
        const docRef = await addDoc(collection(db, 'stops_reports'), reportData);
        savedReport = {
          id: docRef.id,
          ...reportData,
          createdAt: new Date()
        };
      }

      setJustSavedReport(savedReport);
      resetForm();
    } catch (err) {
      console.error("Error saving stop report:", err);
      alert("Erro ao salvar relatório de parada. Verifique os logs.");
    } finally {
      setSubmitting(false);
    }
  };

  // Delete a report
  const handleDeleteReport = async (reportId: string) => {
    if (!window.confirm("Deseja realmente excluir este registro de parada permanentemente?")) return;
    
    try {
      await deleteDoc(doc(db, 'stops_reports', reportId));
      alert("Registro excluído com sucesso!");
      if (viewingReport?.id === reportId) {
        setViewingReport(null);
      }
    } catch (err) {
      console.error("Error deleting stop report:", err);
      alert("Erro ao excluir registro.");
    }
  };

  // Toggle work front participation
  const toggleWorkFront = (front: string) => {
    setFormWorkFronts(prev => {
      const active = !prev[front].active;
      return {
        ...prev,
        [front]: {
          ...prev[front],
          active,
          // Pre-fill start/end times with the main stop times if toggled on
          startTime: active ? formStartTime : prev[front].startTime,
          endTime: active ? formEndTime : prev[front].endTime
        }
      };
    });
  };

  const handleWorkFrontChange = (front: string, field: 'description' | 'startTime' | 'endTime', value: string) => {
    setFormWorkFronts(prev => ({
      ...prev,
      [front]: {
        ...prev[front],
        [field]: value
      }
    }));
  };

  // Filtered reports for History View
  const filteredReports = useMemo(() => {
    return reports.filter(r => {
      // Type filter
      if (filterType !== 'all' && r.type !== filterType) return false;
      
      // Line filter
      if (filterLine !== 'all' && r.lineId !== filterLine) return false;
      
      // Date start filter
      if (filterStartDate && r.date < filterStartDate) return false;

      // Date end filter
      if (filterEndDate && r.date > filterEndDate) return false;

      // Text Search Term (matches operator, line name, observations, or work fronts)
      if (searchTerm.trim() !== '') {
        const term = searchTerm.toLowerCase();
        const matchesUser = r.userName?.toLowerCase().includes(term);
        const matchesLine = r.lineName?.toLowerCase().includes(term);
        const matchesObs = r.observation?.toLowerCase().includes(term);
        const matchesFronts = r.workFronts.some(wf => 
          wf.front.toLowerCase().includes(term) || wf.description.toLowerCase().includes(term)
        );
        return matchesUser || matchesLine || matchesObs || matchesFronts;
      }

      return true;
    });
  }, [reports, filterType, filterLine, filterStartDate, filterEndDate, searchTerm]);

  // Calculation metrics for Statistics view
  const metrics = useMemo(() => {
    let totalDowntimeMin = 0;
    let scheduledCount = 0;
    let generalCount = 0;
    let totalMS1Speed = 0;
    let totalMS2Speed = 0;
    let speedMS1Count = 0;
    let speedMS2Count = 0;
    let totalRejectionTime = 0;

    const lineDowntime: Record<string, number> = {};
    const frontFrequency: Record<string, number> = {};

    filteredReports.forEach(r => {
      const dur = getMinutesDiff(r.startTime, r.endTime);
      totalDowntimeMin += dur;

      if (r.type === 'programada') scheduledCount++;
      else generalCount++;

      if (r.cutterSpeedMS1 > 0) {
        totalMS1Speed += r.cutterSpeedMS1;
        speedMS1Count++;
      }
      if (r.cutterSpeedMS2 > 0) {
        totalMS2Speed += r.cutterSpeedMS2;
        speedMS2Count++;
      }

      // Rejection time parsing
      const rejVal = parseFloat(r.rejectionTime);
      if (!isNaN(rejVal)) {
        totalRejectionTime += rejVal;
      }

      // Line aggregation
      const lineName = r.lineName || 'Outras';
      lineDowntime[lineName] = (lineDowntime[lineName] || 0) + (dur / 60);

      // Front involvements
      r.workFronts.forEach(wf => {
        frontFrequency[wf.front] = (frontFrequency[wf.front] || 0) + 1;
      });
    });

    const typeData = [
      { name: 'Programada', value: scheduledCount, color: '#0ea5e9' },
      { name: 'Geral', value: generalCount, color: '#f59e0b' }
    ].filter(item => item.value > 0);

    const lineChartData = Object.entries(lineDowntime).map(([name, hours]) => ({
      name,
      hours: Number(hours.toFixed(1))
    }));

    const frontChartData = WORK_FRONT_OPTIONS.map(front => ({
      front,
      frequencia: frontFrequency[front] || 0
    }));

    return {
      totalStops: filteredReports.length,
      totalHours: (totalDowntimeMin / 60).toFixed(1),
      avgMS1Speed: speedMS1Count > 0 ? (totalMS1Speed / speedMS1Count).toFixed(1) : '0',
      avgMS2Speed: speedMS2Count > 0 ? (totalMS2Speed / speedMS2Count).toFixed(1) : '0',
      totalRejectionTime,
      typeData,
      lineChartData,
      frontChartData
    };
  }, [filteredReports]);

  // Export selected Stop Report to PDF
  const handleExportSinglePDF = (report: StopReport) => {
    const docPdf = new jsPDF();
    const duration = getMinutesDiff(report.startTime, report.endTime);

    const addMinutesToTime = (timeStr: string, mins: number): string => {
      if (!timeStr) return '';
      const [h, m] = timeStr.split(':').map(Number);
      const totalMins = h * 60 + m + mins;
      const newH = Math.floor(totalMins / 60) % 24;
      const newM = Math.floor(totalMins % 60);
      return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
    };

    // Header styling
    docPdf.setFillColor(30, 41, 59); // slate-800
    docPdf.rect(0, 0, 210, 40, 'F');
    
    docPdf.setTextColor(255, 255, 255);
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(20);
    docPdf.text('RELATÓRIO DE CONTROLE DE PARADA', 15, 25);
    
    // Footer / Metadata line
    docPdf.setFontSize(9);
    docPdf.setFont('helvetica', 'normal');
    docPdf.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 150, 35);

    // Section 1: General Info
    docPdf.setTextColor(30, 41, 59);
    docPdf.setFontSize(14);
    docPdf.setFont('helvetica', 'bold');
    docPdf.text('Informações Gerais da Parada', 15, 55);
    
    docPdf.setFontSize(10);
    docPdf.setFont('helvetica', 'normal');
    
    const generalData = [
      ['Data:', formatDateToBR(report.date), 'Tipo de Parada:', report.type.toUpperCase()],
      ['Local (Linha):', report.lineName || report.lineId, 'Tempo de Rejeição:', `${report.rejectionTime} min`],
      ['Hora Início:', report.startTime, 'Hora Término:', report.endTime],
      ['Duração:', formatDurationString(duration), 'Registrado por:', report.userName]
    ];

    autoTable(docPdf, {
      startY: 60,
      head: [],
      body: generalData,
      theme: 'plain',
      styles: { cellPadding: 2, fontSize: 10, textColor: [51, 65, 85] },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 35 },
        1: { cellWidth: 65 },
        2: { fontStyle: 'bold', cellWidth: 45 },
        3: { cellWidth: 45 }
      }
    });

    // Section 2: Cutter speeds
    let currentY = (docPdf as any).lastAutoTable.finalY + 10;
    docPdf.setFontSize(14);
    docPdf.setFont('helvetica', 'bold');
    docPdf.text('Velocidade das Cortadeiras', 15, currentY);

    const speedData = [
      ['Cortadeira Linha MS1:', `${report.cutterSpeedMS1 || 0} m/min`],
      ['Cortadeira Linha MS2:', `${report.cutterSpeedMS2 || 0} m/min`]
    ];

    autoTable(docPdf, {
      startY: currentY + 5,
      head: [],
      body: speedData,
      theme: 'plain',
      styles: { cellPadding: 2, fontSize: 10, textColor: [51, 65, 85] },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 60 },
        1: { cellWidth: 130 }
      }
    });

    // Section 3: Work fronts
    currentY = (docPdf as any).lastAutoTable.finalY + 10;
    docPdf.setFontSize(14);
    docPdf.setFont('helvetica', 'bold');
    docPdf.text('Atividades e Frentes de Trabalho', 15, currentY);

    if (report.workFronts.length === 0) {
      docPdf.setFontSize(10);
      docPdf.setFont('helvetica', 'italic');
      docPdf.setTextColor(100, 116, 139);
      docPdf.text('Nenhuma frente de trabalho foi registrada nesta parada.', 15, currentY + 8);
      currentY += 15;
    } else {
      const frontsHeaders = [['Frente de Trabalho', 'Descrição das Atividades Realizadas', 'Início', 'Fim', 'Duração']];
      const frontsBody = report.workFronts.map(wf => {
        const wfDuration = getMinutesDiff(wf.startTime, wf.endTime);
        return [
          wf.front,
          wf.description || 'Sem detalhes informados.',
          wf.startTime,
          wf.endTime,
          formatDurationString(wfDuration)
        ];
      });

      autoTable(docPdf, {
        startY: currentY + 5,
        head: frontsHeaders,
        body: frontsBody,
        theme: 'striped',
        headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255] },
        styles: { fontSize: 9, cellPadding: 3 },
        columnStyles: {
          0: { cellWidth: 35, fontStyle: 'bold' },
          1: { cellWidth: 100 },
          2: { cellWidth: 20 },
          3: { cellWidth: 20 },
          4: { cellWidth: 20 }
        }
      });
      currentY = (docPdf as any).lastAutoTable.finalY + 10;
    }

    // Cronograma Visual / Gantt Chart Section
    if (report.workFronts && report.workFronts.length > 0) {
      const chartHeight = 15 + (report.workFronts.length * 10) + 15;
      if (currentY + chartHeight > 275) {
        docPdf.addPage();
        currentY = 20;
      }

      docPdf.setFontSize(14);
      docPdf.setFont('helvetica', 'bold');
      docPdf.text('Cronograma de Frentes de Trabalho', 15, currentY);
      currentY += 8;

      const chartX = 55;
      const chartWidth = 140;
      const totalMins = getMinutesDiff(report.startTime, report.endTime) || 1;

      // Draw Time Scale / Eixo de Tempo at the top of chart
      docPdf.setFontSize(8);
      docPdf.setFont('helvetica', 'bold');
      docPdf.setTextColor(100, 116, 139); // slate-500
      
      const intervals = 4;
      for (let i = 0; i <= intervals; i++) {
        const pct = i / intervals;
        const xPos = chartX + pct * chartWidth;
        const offsetMins = Math.round(pct * totalMins);
        const timeLabel = addMinutesToTime(report.startTime, offsetMins);
        
        // Draw vertical scale line
        docPdf.setDrawColor(226, 232, 240); // slate-200
        docPdf.setLineWidth(0.3);
        docPdf.line(xPos, currentY, xPos, currentY + (report.workFronts.length * 10) + 3);
        
        // Draw label centered above the line
        docPdf.text(timeLabel, xPos, currentY - 2, { align: 'center' });
      }
      
      currentY += 2;

      // Draw active fronts horizontal bars
      report.workFronts.forEach((wf, index) => {
        const rowY = currentY + (index * 10);
        
        // Front label on the left
        docPdf.setFontSize(9);
        docPdf.setFont('helvetica', 'bold');
        docPdf.setTextColor(51, 65, 85); // slate-700
        docPdf.text(wf.front, 15, rowY + 5);

        // Calculate offsets and clamp to total duration
        let startMins = getMinutesDiff(report.startTime, wf.startTime);
        let wfMins = getMinutesDiff(wf.startTime, wf.endTime);
        
        if (startMins < 0) {
          wfMins = Math.max(0, wfMins + startMins);
          startMins = 0;
        }
        if (startMins > totalMins) startMins = totalMins;
        if (startMins + wfMins > totalMins) wfMins = totalMins - startMins;
        if (wfMins < 0) wfMins = 0;

        const leftX = chartX + (startMins / totalMins) * chartWidth;
        const barW = (wfMins / totalMins) * chartWidth;

        // Draw track background
        docPdf.setFillColor(248, 250, 252); // slate-50
        docPdf.rect(chartX, rowY + 1, chartWidth, 6, 'F');

        // Color coding for each work front
        let color = [100, 116, 139]; // Default Slate
        if (wf.front === 'Mecânica') color = [249, 115, 22]; // Orange
        else if (wf.front === 'Elétrica') color = [245, 158, 11]; // Amber
        else if (wf.front === 'Instrumentação') color = [59, 130, 246]; // Blue
        else if (wf.front === 'Hidráulica') color = [6, 182, 212]; // Cyan
        else if (wf.front === 'Civil') color = [16, 185, 129]; // Emerald
        else if (wf.front === 'Caldeiraria') color = [244, 63, 94]; // Rose
        else if (wf.front === 'Operacional') color = [139, 92, 246]; // Violet / Purple

        // Draw the colored bar
        docPdf.setFillColor(color[0], color[1], color[2]);
        docPdf.rect(leftX, rowY + 1.2, Math.max(1.5, barW), 5.6, 'F');

        // Add duration text inside or next to the bar
        docPdf.setFontSize(7);
        docPdf.setFont('helvetica', 'bold');
        docPdf.setTextColor(255, 255, 255);
        const durLabel = `${wfMins} min`;
        if (barW > 18) {
          docPdf.text(durLabel, leftX + (barW / 2), rowY + 5.2, { align: 'center' });
        } else {
          docPdf.setTextColor(100, 116, 139); // slate-500
          docPdf.text(durLabel, leftX + barW + 2, rowY + 5.2);
        }
      });

      currentY += (report.workFronts.length * 10) + 12;
    }

    // Section 4: Observations
    if (currentY + 25 > 275) {
      docPdf.addPage();
      currentY = 20;
    }

    docPdf.setFontSize(14);
    docPdf.setFont('helvetica', 'bold');
    docPdf.text('Observações Finais', 15, currentY);
    
    docPdf.setFontSize(10);
    docPdf.setFont('helvetica', 'normal');
    docPdf.setTextColor(51, 65, 85);
    
    const obsText = report.observation || 'Nenhuma observação informada.';
    const splitObs = docPdf.splitTextToSize(obsText, 180);
    docPdf.text(splitObs, 15, currentY + 6);

    // Save File
    docPdf.save(`Controle_Parada_${formatDateToBR(report.date).replace(/\//g, '-')}_${report.lineName || 'Linha'}.pdf`);
  };

  // Export full table of stops to PDF
  const handleExportFullPDF = () => {
    const docPdf = new jsPDF('landscape');
    
    // Header
    docPdf.setFillColor(30, 41, 59);
    docPdf.rect(0, 0, 297, 35, 'F');
    
    docPdf.setTextColor(255, 255, 255);
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(18);
    docPdf.text('CONTROLE DE PARADAS - RELATÓRIO GERAL', 15, 20);
    
    docPdf.setFontSize(9);
    docPdf.setFont('helvetica', 'normal');
    docPdf.text(`Filtrado por data: ${filterStartDate ? formatDateToBR(filterStartDate) : 'Início'} até ${filterEndDate ? formatDateToBR(filterEndDate) : 'Fim'} | Total registros: ${filteredReports.length}`, 15, 28);
    docPdf.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 220, 28);

    const headers = [['Data', 'Tipo', 'Local/Linha', 'Início', 'Término', 'Duração', 'Rejeição', 'MS1 Speed', 'MS2 Speed', 'Frentes de Trabalho']];
    const body = filteredReports.map(r => {
      const duration = getMinutesDiff(r.startTime, r.endTime);
      const frontsStr = r.workFronts.map(wf => wf.front).join(', ');
      return [
        formatDateToBR(r.date),
        r.type.toUpperCase(),
        r.lineName || r.lineId,
        r.startTime,
        r.endTime,
        formatDurationString(duration),
        `${r.rejectionTime || 0}m`,
        `${r.cutterSpeedMS1 || 0} m/min`,
        `${r.cutterSpeedMS2 || 0} m/min`,
        frontsStr || 'Nenhuma'
      ];
    });

    autoTable(docPdf, {
      startY: 45,
      head: headers,
      body: body,
      theme: 'grid',
      headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontSize: 9 },
      styles: { fontSize: 8, cellPadding: 2 }
    });

    docPdf.save(`Controle_Paradas_Geral_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12 px-4" id="stops-control-container">
      {/* Top Banner with animated background */}
      <div className="relative overflow-hidden bg-slate-900 rounded-[2.5rem] text-white p-8 md:p-10 shadow-xl border border-slate-800">
        <div className="absolute inset-0 bg-radial-gradient from-blue-900/30 via-transparent to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-600/20 text-blue-400 rounded-2xl border border-blue-500/20">
                <Clock className="w-8 h-8" />
              </div>
              <h1 className="text-3xl font-black tracking-tight font-sans">Controle de Parada</h1>
            </div>
            <p className="text-slate-400 max-w-xl font-medium text-sm leading-relaxed">
              Módulo operacional para registrar, acompanhar e analisar paradas de máquinas programadas ou gerais, velocidades de cortadeiras MS1 e MS2 e frentes de trabalho.
            </p>
          </div>
          
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              onClick={() => setActiveTab('register')}
              className={cn(
                "px-5 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider transition-all",
                activeTab === 'register'
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20 border border-blue-500"
                  : "bg-slate-800/60 text-slate-300 hover:bg-slate-800 border border-slate-700/50"
              )}
            >
              {editingReport ? "Editar Parada" : "Novo Registro"}
            </button>
            <button
              onClick={() => {
                setActiveTab('history');
                handleCancelEdit();
              }}
              className={cn(
                "px-5 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider transition-all",
                activeTab === 'history'
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20 border border-blue-500"
                  : "bg-slate-800/60 text-slate-300 hover:bg-slate-800 border border-slate-700/50"
              )}
            >
              Histórico
            </button>
            <button
              onClick={() => {
                setActiveTab('stats');
                handleCancelEdit();
              }}
              className={cn(
                "px-5 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider transition-all",
                activeTab === 'stats'
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20 border border-blue-500"
                  : "bg-slate-800/60 text-slate-300 hover:bg-slate-800 border border-slate-700/50"
              )}
            >
              Indicadores
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* TAB 1: REGISTER / NEW STOP */}
        {activeTab === 'register' && (
          <motion.form 
            onSubmit={handleSubmit}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
            id="stops-form"
          >
            {editingReport && (
              <div className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  <span className="font-bold text-sm">Modo de Edição Ativo: Editando parada de {formatDateToBR(editingReport.date)} às {editingReport.startTime}</span>
                </div>
                <button 
                  type="button" 
                  onClick={handleCancelEdit} 
                  className="px-3 py-1 bg-amber-200 hover:bg-amber-300 text-amber-900 rounded-lg text-xs font-bold"
                >
                  Cancelar Edição
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left Column: Basic Info */}
              <div className="lg:col-span-2 space-y-6">
                
                {/* General parameters Card */}
                <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-100 shadow-sm space-y-6">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-50">
                    <Sliders className="w-5 h-5 text-blue-500" />
                    <h2 className="text-lg font-bold text-slate-900">Parâmetros da Parada</h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Tipo de Parada</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setFormType('programada')}
                          className={cn(
                            "py-3 rounded-xl text-xs font-bold uppercase transition-all border",
                            formType === 'programada'
                              ? "bg-sky-50 text-sky-700 border-sky-300 shadow-sm"
                              : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                          )}
                        >
                          🕒 Programada
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormType('geral')}
                          className={cn(
                            "py-3 rounded-xl text-xs font-bold uppercase transition-all border",
                            formType === 'geral'
                              ? "bg-amber-50 text-amber-700 border-amber-300 shadow-sm"
                              : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                          )}
                        >
                          ⚠️ Geral / Emergência
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Data da Parada</label>
                      <div className="relative">
                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="date"
                          required
                          value={formDate}
                          onChange={(e) => setFormDate(e.target.value)}
                          className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-slate-800"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Local / Linha de Produção</label>
                      <div className="relative">
                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <select
                          value={formLineId}
                          onChange={(e) => setFormLineId(e.target.value)}
                          className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-slate-800 appearance-none"
                        >
                          {availableLines.map(line => (
                            <option key={line.id} value={line.id}>{line.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Tempo de Rejeição (Minutos)</label>
                      <div className="relative">
                        <AlertTriangle className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          required
                          placeholder="Ex: 15"
                          value={formRejectionTime}
                          onChange={(e) => setFormRejectionTime(e.target.value)}
                          className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-slate-800"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Horário de Início</label>
                      <div className="relative">
                        <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="time"
                          required
                          value={formStartTime}
                          onChange={(e) => setFormStartTime(e.target.value)}
                          className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-slate-800"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Horário de Término</label>
                      <div className="relative">
                        <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="time"
                          required
                          value={formEndTime}
                          onChange={(e) => setFormEndTime(e.target.value)}
                          className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-slate-800"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Downtime display pill */}
                  <div className="flex items-center gap-2 p-4 bg-blue-50 border border-blue-100 rounded-2xl">
                    <Info className="w-5 h-5 text-blue-500 shrink-0" />
                    <span className="text-xs font-bold text-blue-800">
                      Duração Total Calculada da Parada: <span className="underline">{formatDurationString(calculatedStopDuration)}</span>
                    </span>
                  </div>
                </div>

                {/* Cutter speeds Card */}
                <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-100 shadow-sm space-y-6">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-50">
                    <Gauge className="w-5 h-5 text-blue-500" />
                    <h2 className="text-lg font-bold text-slate-900">Velocidade das Cortadeiras durante a Parada</h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Linha MS1 (m/min)</label>
                        <span className="text-xs font-extrabold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">{formSpeedMS1} m/min</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="250"
                        step="5"
                        value={formSpeedMS1}
                        onChange={(e) => setFormSpeedMS1(Number(e.target.value))}
                        className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                      <div className="flex justify-between text-[10px] font-bold text-slate-400 px-1 mt-1">
                        <span>0 m/min</span>
                        <span>125 m/min</span>
                        <span>250 m/min</span>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Linha MS2 (m/min)</label>
                        <span className="text-xs font-extrabold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">{formSpeedMS2} m/min</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="250"
                        step="5"
                        value={formSpeedMS2}
                        onChange={(e) => setFormSpeedMS2(Number(e.target.value))}
                        className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                      <div className="flex justify-between text-[10px] font-bold text-slate-400 px-1 mt-1">
                        <span>0 m/min</span>
                        <span>125 m/min</span>
                        <span>250 m/min</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Work fronts (Frentes de trabalho) registration */}
                <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-100 shadow-sm space-y-6">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-50">
                    <Wrench className="w-5 h-5 text-blue-500" />
                    <h2 className="text-lg font-bold text-slate-900">Envolvimento de Frentes de Trabalho</h2>
                  </div>
                  
                  <p className="text-xs font-semibold text-slate-500">
                    Selecione quais frentes de trabalho atuaram durante a parada e descreva suas respectivas atividades e horários:
                  </p>

                  <div className="space-y-4">
                    {WORK_FRONT_OPTIONS.map(front => {
                      const item = formWorkFronts[front];
                      const frontDuration = getMinutesDiff(item.startTime, item.endTime);

                      return (
                        <div 
                          key={front} 
                          className={cn(
                            "border rounded-2xl transition-all overflow-hidden shadow-sm",
                            item.active 
                              ? "bg-slate-50/50 border-blue-200" 
                              : "bg-white border-slate-100 hover:border-slate-200"
                          )}
                        >
                          {/* Front Header Header */}
                          <div 
                            onClick={() => toggleWorkFront(front)}
                            className="p-4 flex items-center justify-between cursor-pointer select-none"
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={item.active}
                                onChange={() => {}} // Controlled by click on parent
                                className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                              <span className={cn("text-sm font-extrabold", item.active ? "text-slate-800" : "text-slate-400")}>
                                {front}
                              </span>
                            </div>

                            {item.active && (
                              <div className="flex items-center gap-1.5 px-3 py-1 bg-blue-100/60 border border-blue-100 rounded-full text-[10px] font-bold text-blue-700">
                                <Clock className="w-3 h-3" />
                                {formatDurationString(frontDuration)}
                              </div>
                            )}
                          </div>

                          {/* Front Expandable Body */}
                          <AnimatePresence initial={false}>
                            {item.active && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="border-t border-slate-100 p-4 bg-slate-50/30 grid grid-cols-1 md:grid-cols-2 gap-4"
                              >
                                <div className="md:col-span-2">
                                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">O que a equipe está fazendo / Atividade realizada</label>
                                  <textarea
                                    required
                                    placeholder={`Descreva a atividade realizada pela equipe de ${front}...`}
                                    value={item.description}
                                    onChange={(e) => handleWorkFrontChange(front, 'description', e.target.value)}
                                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-slate-700 text-xs leading-relaxed"
                                    rows={4}
                                  />
                                </div>

                                <div>
                                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Início da Atividade</label>
                                  <input
                                    type="time"
                                    required
                                    value={item.startTime}
                                    onChange={(e) => handleWorkFrontChange(front, 'startTime', e.target.value)}
                                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-slate-700 text-xs"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Término da Atividade</label>
                                  <input
                                    type="time"
                                    required
                                    value={item.endTime}
                                    onChange={(e) => handleWorkFrontChange(front, 'endTime', e.target.value)}
                                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-slate-700 text-xs"
                                  />
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>

              {/* Right Column: Observation & Actions */}
              <div className="space-y-6">
                
                {/* Observations Card */}
                <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-100 shadow-sm space-y-6">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-50">
                    <ClipboardList className="w-5 h-5 text-blue-500" />
                    <h2 className="text-lg font-bold text-slate-900">Observações</h2>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Anotações / Observações Finais</label>
                    <textarea
                      placeholder="Espaço para notas de encerramento, observações das frentes, pendências de término e horário final do término."
                      value={formObservation}
                      onChange={(e) => setFormObservation(e.target.value)}
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700 text-xs leading-relaxed"
                      rows={5}
                    />
                  </div>

                  <div className="text-[10px] text-slate-400 font-bold ml-1 leading-relaxed">
                    Nota: O campo observação acima pode ser utilizado para registrar o horário de fechamento definitivo ou observações circunstanciais da fábrica.
                  </div>
                </div>

                {/* Submitting Card */}
                <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-4 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
                  >
                    {submitting ? "Salvando..." : (editingReport ? "Salvar Alterações" : "Gravar Parada")}
                  </button>
                  {editingReport && (
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="w-full py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-all active:scale-95 text-xs uppercase"
                    >
                      Cancelar Edição
                    </button>
                  )}
                </div>

              </div>

            </div>
          </motion.form>
        )}

        {/* TAB 2: HISTORY LOG */}
        {activeTab === 'history' && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
            id="stops-history"
          >
            {/* Filters panel */}
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-50">
                <div className="flex items-center gap-2">
                  <Search className="w-5 h-5 text-slate-400" />
                  <h2 className="text-base font-bold text-slate-800">Filtrar e Buscar Paradas</h2>
                </div>
                {filteredReports.length > 0 && (
                  <button
                    onClick={handleExportFullPDF}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold transition-all"
                  >
                    <FileDown className="w-4 h-4" />
                    Exportar Lista PDF
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                {/* Text search */}
                <div className="lg:col-span-1">
                  <input
                    type="text"
                    placeholder="Buscar operador, observações..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Type Filter */}
                <div>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">Todos os Tipos</option>
                    <option value="programada">Programadas</option>
                    <option value="geral">Gerais/Emergências</option>
                  </select>
                </div>

                {/* Line Filter */}
                <div>
                  <select
                    value={filterLine}
                    onChange={(e) => setFilterLine(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">Todas as Linhas</option>
                    {availableLines.map(line => (
                      <option key={line.id} value={line.id}>{line.name}</option>
                    ))}
                  </select>
                </div>

                {/* Start Date */}
                <div>
                  <input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* End Date */}
                <div>
                  <input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* List / Table */}
            {loading ? (
              <div className="p-12 text-center bg-white rounded-3xl border border-slate-100">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto" />
                <p className="text-slate-400 font-bold text-xs mt-3">Carregando histórico de paradas...</p>
              </div>
            ) : filteredReports.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-3xl border border-slate-100 space-y-2">
                <Info className="w-8 h-8 text-slate-300 mx-auto" />
                <h3 className="font-bold text-slate-800 text-sm">Nenhuma parada encontrada</h3>
                <p className="text-slate-400 font-semibold text-xs max-w-sm mx-auto leading-relaxed">
                  Não existem registros de paradas cadastrados no período ou com os filtros aplicados no momento.
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        <th className="p-4 pl-6">Data</th>
                        <th className="p-4">Tipo</th>
                        <th className="p-4">Linha</th>
                        <th className="p-4">Horários</th>
                        <th className="p-4 text-center">Duração</th>
                        <th className="p-4 text-center">MS1/MS2 Speed</th>
                        <th className="p-4 text-center">Rejeição</th>
                        <th className="p-4">Frentes</th>
                        <th className="p-4 pr-6 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-slate-700 text-xs font-bold">
                      {filteredReports.map(report => {
                        const duration = getMinutesDiff(report.startTime, report.endTime);
                        return (
                          <tr key={report.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="p-4 pl-6 whitespace-nowrap">
                              <span className="text-slate-800">{formatDateToBR(report.date)}</span>
                            </td>
                            <td className="p-4 whitespace-nowrap">
                              <span className={cn(
                                "px-2.5 py-1 rounded-full text-[10px] uppercase font-bold border",
                                report.type === 'programada'
                                  ? "bg-sky-50 border-sky-100 text-sky-700"
                                  : "bg-amber-50 border-amber-100 text-amber-700"
                              )}>
                                {report.type === 'programada' ? 'Programada' : 'Geral'}
                              </span>
                            </td>
                            <td className="p-4 whitespace-nowrap text-slate-600">
                              {report.lineName || report.lineId}
                            </td>
                            <td className="p-4 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                              {report.startTime} - {report.endTime}
                            </td>
                            <td className="p-4 text-center whitespace-nowrap">
                              <span className="text-blue-600">{formatDurationString(duration)}</span>
                            </td>
                            <td className="p-4 text-center whitespace-nowrap text-slate-500 font-mono text-[11px]">
                              {report.cutterSpeedMS1 || 0} / {report.cutterSpeedMS2 || 0} m/min
                            </td>
                            <td className="p-4 text-center whitespace-nowrap text-slate-500">
                              {report.rejectionTime || '0'} m
                            </td>
                            <td className="p-4">
                              <div className="flex flex-wrap gap-1 max-w-xs">
                                {report.workFronts.length === 0 ? (
                                  <span className="text-slate-300 text-[10px] italic font-medium">Nenhuma</span>
                                ) : (
                                  report.workFronts.map((wf, idx) => (
                                    <span key={wf.id || `${wf.front}-${idx}`} className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 rounded text-[9px]">
                                      {wf.front}
                                    </span>
                                  ))
                                )}
                              </div>
                            </td>
                            <td className="p-4 pr-6 whitespace-nowrap text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => setViewingReport(report)}
                                  className="p-1.5 bg-blue-50 border border-blue-100 hover:bg-blue-100 text-blue-600 rounded-lg transition-all"
                                  title="Ver Detalhes"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleExportSinglePDF(report)}
                                  className="p-1.5 bg-emerald-50 border border-emerald-100 hover:bg-emerald-100 text-emerald-600 rounded-lg transition-all"
                                  title="Exportar Relatório PDF"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                                {(isManager || isAdmin) && (
                                  <>
                                    <button
                                      onClick={() => handleStartEdit(report)}
                                      className="p-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-lg transition-all"
                                      title="Editar"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteReport(report.id)}
                                      className="p-1.5 bg-rose-50 border border-rose-100 hover:bg-rose-100 text-rose-600 rounded-lg transition-all"
                                      title="Excluir"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* TAB 3: STATS / CHARTS */}
        {activeTab === 'stats' && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
            id="stops-analytics"
          >
            {/* Top Metric Cards Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              
              <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-blue-50 text-blue-500 rounded-2xl border border-blue-100">
                  <Activity className="w-6 h-6" />
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total de Paradas</span>
                  <span className="text-2xl font-black text-slate-800">{metrics.totalStops}</span>
                </div>
              </div>

              <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-amber-50 text-amber-500 rounded-2xl border border-amber-100">
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Horas Paradas</span>
                  <span className="text-2xl font-black text-slate-800">{metrics.totalHours}h</span>
                </div>
              </div>

              <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-emerald-50 text-emerald-500 rounded-2xl border border-emerald-100">
                  <Gauge className="w-6 h-6" />
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Avg Speed MS1</span>
                  <span className="text-2xl font-black text-slate-800">{metrics.avgMS1Speed} <span className="text-[10px] font-bold text-slate-400">m/min</span></span>
                </div>
              </div>

              <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-purple-50 text-purple-500 rounded-2xl border border-purple-100">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tempo Rejeição</span>
                  <span className="text-2xl font-black text-slate-800">{metrics.totalRejectionTime} <span className="text-[10px] font-bold text-slate-400">min</span></span>
                </div>
              </div>

            </div>

            {/* Recharts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Stops by Type (Pie Chart) */}
              <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 border-b border-slate-50 pb-3">
                  <span className="w-1.5 h-3 bg-blue-500 rounded" />
                  Divisão por Tipo de Parada
                </h3>
                {metrics.typeData.length === 0 ? (
                  <div className="h-60 flex items-center justify-center text-slate-400 text-xs font-bold italic">Sem dados disponíveis</div>
                ) : (
                  <div className="h-60 flex flex-col justify-center">
                    <div className="h-44">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={metrics.typeData}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={70}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {metrics.typeData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => [`${value} parada(s)`, 'Quantidade']} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    {/* Legend */}
                    <div className="flex justify-center gap-6 text-[11px] font-bold mt-2">
                      {metrics.typeData.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="text-slate-600">{item.name}: {item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Downtime Hours by Line (Bar Chart) */}
              <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-100 shadow-sm space-y-4 lg:col-span-2">
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 border-b border-slate-50 pb-3">
                  <span className="w-1.5 h-3 bg-blue-500 rounded" />
                  Horas de Parada por Linha de Produção
                </h3>
                {metrics.lineChartData.length === 0 ? (
                  <div className="h-60 flex items-center justify-center text-slate-400 text-xs font-bold italic">Sem dados disponíveis</div>
                ) : (
                  <div className="h-60">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={metrics.lineChartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} fontWeight="bold" />
                        <YAxis stroke="#94a3b8" fontSize={11} fontWeight="bold" />
                        <Tooltip formatter={(value) => [`${value} horas`, 'Downtime']} />
                        <Bar dataKey="hours" fill="#0ea5e9" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Work fronts frequency */}
              <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-100 shadow-sm space-y-4 lg:col-span-3">
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 border-b border-slate-50 pb-3">
                  <span className="w-1.5 h-3 bg-blue-500 rounded" />
                  Frequência de Atuação de Frentes de Trabalho (Ocorrências)
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={metrics.frontChartData} margin={{ bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="front" stroke="#94a3b8" fontSize={11} fontWeight="bold" />
                      <YAxis stroke="#94a3b8" fontSize={11} fontWeight="bold" />
                      <Tooltip formatter={(value) => [`${value} atuação(ões)`, 'Total']} />
                      <Bar dataKey="frequencia" fill="#6366f1" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DETAIL VIEW MODAL */}
      <AnimatePresence>
        {viewingReport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 px-3 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2.5rem] border border-slate-100 shadow-2xl w-full max-w-3xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              {/* Header */}
              <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "px-2.5 py-0.5 rounded-full text-[10px] uppercase font-bold border border-transparent",
                      viewingReport.type === 'programada'
                        ? "bg-sky-500/20 text-sky-300"
                        : "bg-amber-500/20 text-amber-300"
                    )}>
                      {viewingReport.type === 'programada' ? 'Programada' : 'Geral'}
                    </span>
                    <span className="text-xs text-slate-400 font-bold">{formatDateToBR(viewingReport.date)}</span>
                  </div>
                  <h3 className="text-lg font-extrabold tracking-tight mt-1">{viewingReport.lineName || viewingReport.lineId}</h3>
                </div>
                <button
                  onClick={() => setViewingReport(null)}
                  className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="p-6 md:p-8 overflow-y-auto space-y-6">
                
                {/* Information Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                  <div>
                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Horários</span>
                    <span className="text-xs font-bold text-slate-700 font-mono">{viewingReport.startTime} - {viewingReport.endTime}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Duração</span>
                    <span className="text-xs font-bold text-blue-600">
                      {formatDurationString(getMinutesDiff(viewingReport.startTime, viewingReport.endTime))}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rejeição</span>
                    <span className="text-xs font-bold text-slate-700">{viewingReport.rejectionTime || '0'} min</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Operador</span>
                    <span className="text-xs font-bold text-slate-700 truncate block">{viewingReport.userName}</span>
                  </div>
                </div>

                {/* Cutter speeds */}
                <div className="space-y-2">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">Velocidade das Cortadeiras</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-xl flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-600">Cortadeira MS1</span>
                      <span className="text-xs font-black text-blue-700">{viewingReport.cutterSpeedMS1 || 0} m/min</span>
                    </div>
                    <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-xl flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-600">Cortadeira MS2</span>
                      <span className="text-xs font-black text-blue-700">{viewingReport.cutterSpeedMS2 || 0} m/min</span>
                    </div>
                  </div>
                </div>

                {/* Work fronts */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">Frentes de Trabalho e Atividades</h4>
                  {viewingReport.workFronts.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">Nenhuma equipe ou atividade foi registrada nesta parada.</p>
                  ) : (
                    <div className="space-y-3">
                      {viewingReport.workFronts.map((wf, idx) => {
                        const wfDuration = getMinutesDiff(wf.startTime, wf.endTime);
                        return (
                          <div key={wf.id || `${wf.front}-${idx}`} className="p-4 border border-slate-100 rounded-2xl bg-slate-50/30 space-y-2">
                            <div className="flex items-center justify-between pb-2 border-b border-slate-100/60">
                              <span className="text-xs font-extrabold text-slate-800">{wf.front}</span>
                              <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold text-slate-500">
                                <Clock className="w-3.5 h-3.5 text-slate-400" />
                                {wf.startTime} - {wf.endTime} ({formatDurationString(wfDuration)})
                              </div>
                            </div>
                            <p className="text-xs font-semibold text-slate-600 leading-relaxed">
                              {wf.description}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Observations */}
                {viewingReport.observation && (
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">Observações Adicionais</h4>
                    <p className="text-xs font-semibold text-slate-600 bg-slate-50 p-4 border border-slate-100 rounded-2xl leading-relaxed whitespace-pre-wrap">
                      {viewingReport.observation}
                    </p>
                  </div>
                )}

              </div>

              {/* Footer */}
              <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  onClick={() => handleExportSinglePDF(viewingReport)}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
                >
                  <Download className="w-4 h-4" />
                  Baixar PDF
                </button>
                <button
                  onClick={() => setViewingReport(null)}
                  className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold rounded-xl text-xs uppercase tracking-wider transition-all"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* POST-COMPLETION / SUCCESS MODAL WITH PDF EXPORT */}
      <AnimatePresence>
        {justSavedReport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 px-3 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2.5rem] border border-slate-100 shadow-2xl w-full max-w-md overflow-hidden p-6 md:p-8 flex flex-col items-center text-center space-y-6"
            >
              {/* Success Badge / Icon */}
              <div className="w-16 h-16 bg-emerald-50 rounded-full border border-emerald-100 flex items-center justify-center text-emerald-500 shadow-inner">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              {/* Title & Info */}
              <div className="space-y-2">
                <h3 className="text-xl font-black text-slate-800 tracking-tight">Parada Gravada com Sucesso!</h3>
                <p className="text-xs font-semibold text-slate-500 leading-relaxed text-balance">
                  Os detalhes da parada foram salvos com êxito no banco de dados operacional.
                </p>
              </div>

              {/* Summary Details Panel */}
              <div className="w-full bg-slate-50/80 border border-slate-100 rounded-2xl p-4 text-left space-y-2.5 text-xs font-semibold text-slate-600">
                <div className="flex justify-between">
                  <span className="text-slate-400">Linha:</span>
                  <span className="font-extrabold text-slate-800">{justSavedReport.lineName || justSavedReport.lineId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Data:</span>
                  <span className="font-extrabold text-slate-800">{formatDateToBR(justSavedReport.date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Período:</span>
                  <span className="font-extrabold text-slate-800">{justSavedReport.startTime} - {justSavedReport.endTime}</span>
                </div>
                {justSavedReport.workFronts && justSavedReport.workFronts.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Frentes Ativas:</span>
                    <span className="font-extrabold text-slate-800">
                      {justSavedReport.workFronts.map(wf => wf.front).join(', ')}
                    </span>
                  </div>
                )}
              </div>

              {/* Prominent Action Button to Export PDF */}
              <button
                type="button"
                onClick={() => handleExportSinglePDF(justSavedReport)}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-2xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-95 transition-all"
              >
                <Download className="w-4 h-4" />
                Gerar PDF da Parada Realizada
              </button>

              {/* Secondary Option Buttons */}
              <div className="w-full grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setJustSavedReport(null)}
                  className="py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-[10px] uppercase tracking-wider transition-all"
                >
                  Nova Parada
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setJustSavedReport(null);
                    setActiveTab('history');
                  }}
                  className="py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-[10px] uppercase tracking-wider transition-all"
                >
                  Ver no Histórico
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
