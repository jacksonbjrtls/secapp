import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  setDoc,
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
  Activity,
  Loader2,
  Camera,
  Upload,
  Settings,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronUp,
  Eye,
  Check
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
import { StopReport, StopWorkFront, StopWorkFrontPhoto, ProductionLine } from '../types';

const formatDateToBR = (dateStr: string): string => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};

const DEFAULT_WORK_FRONTS = [
  'Mecânica',
  'Elétrica',
  'Instrumentação',
  'Hidráulica',
  'Civil',
  'Caldeiraria',
  'Operacional'
];

const SPEED_OPTIONS = Array.from({ length: 251 }, (_, i) => i);

const getStopTypeLabel = (type: string): string => {
  switch (type) {
    case 'programada': return 'Programada';
    case 'geral': return 'Geral';
    case 'emergencia': return 'Emergência';
    case 'inspecao': return 'Inspeção';
    default: return type || 'Programada';
  }
};

const getStopTypeBadgeClass = (type: string): string => {
  switch (type) {
    case 'programada':
      return 'bg-sky-50 border-sky-200 text-sky-800';
    case 'geral':
      return 'bg-amber-50 border-amber-200 text-amber-800';
    case 'emergencia':
      return 'bg-rose-50 border-rose-200 text-rose-800';
    case 'inspecao':
      return 'bg-purple-50 border-purple-200 text-purple-800';
    default:
      return 'bg-slate-50 border-slate-200 text-slate-700';
  }
};

const getStopTypeModalBadgeClass = (type: string): string => {
  switch (type) {
    case 'programada':
      return 'bg-sky-500/20 text-sky-300';
    case 'geral':
      return 'bg-amber-500/20 text-amber-300';
    case 'emergencia':
      return 'bg-rose-500/20 text-rose-300';
    case 'inspecao':
      return 'bg-purple-500/20 text-purple-300';
    default:
      return 'bg-slate-500/20 text-slate-300';
  }
};

export default function StopsControl() {
  const { user, isManager, isAdmin, isMaster, logoUrl } = useAuth();
  
  // Tabs: 'register' | 'history' | 'stats'
  const [activeTab, setActiveTab] = useState<'register' | 'history' | 'stats'>('register');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reports, setReports] = useState<StopReport[]>([]);
  const [lines, setLines] = useState<ProductionLine[]>([]);

  // Admin & Dynamic Work Fronts state
  const [workFrontOptions, setWorkFrontOptions] = useState<string[]>(DEFAULT_WORK_FRONTS);
  const [showWorkFrontsModal, setShowWorkFrontsModal] = useState(false);
  const [newWorkFrontName, setNewWorkFrontName] = useState('');
  const [savingWorkFronts, setSavingWorkFronts] = useState(false);
  const [frontToDeleteConfirm, setFrontToDeleteConfirm] = useState<string | null>(null);

  // Lightbox Preview Modal State
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);

  // Search & Filter state for History
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterLine, setFilterLine] = useState<string>('all');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');

  // Key for localStorage auto-save draft
  const DRAFT_STORAGE_KEY = 'stops_control_form_draft_v1';

  // Read saved draft on initial render
  const initialDraft = useMemo(() => {
    try {
      const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn("Could not load stops control draft from localStorage:", e);
    }
    return null;
  }, []);

  // Editing state
  const [editingReport, setEditingReport] = useState<StopReport | null>(initialDraft?.editingReport || null);

  // Form State
  const [formType, setFormType] = useState<'programada' | 'geral' | 'emergencia' | 'inspecao'>(initialDraft?.formType || 'programada');
  const [formDate, setFormDate] = useState<string>(() => {
    if (initialDraft?.formDate) return initialDraft.formDate;
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [formLineId, setFormLineId] = useState<string>(initialDraft?.formLineId || '');
  const [formStartTime, setFormStartTime] = useState<string>(initialDraft?.formStartTime || '08:00');
  const [formEndTime, setFormEndTime] = useState<string>(initialDraft?.formEndTime || '12:00');
  const [formRejectionTime, setFormRejectionTime] = useState<string>(initialDraft?.formRejectionTime || '0');
  const [formSpeedMS1, setFormSpeedMS1] = useState<number>(initialDraft?.formSpeedMS1 ?? 0);
  const [formSpeedMS2, setFormSpeedMS2] = useState<number>(initialDraft?.formSpeedMS2 ?? 0);
  const [formObservation, setFormObservation] = useState<string>(initialDraft?.formObservation || '');
  
  // Work fronts state inside the form
  const [formWorkFronts, setFormWorkFronts] = useState<Record<string, {
    active: boolean;
    description: string;
    startTime: string;
    endTime: string;
    photos: StopWorkFrontPhoto[];
  }>>(() => {
    if (initialDraft?.formWorkFronts && typeof initialDraft.formWorkFronts === 'object') {
      return initialDraft.formWorkFronts;
    }
    const initial: Record<string, any> = {};
    DEFAULT_WORK_FRONTS.forEach(front => {
      initial[front] = {
        active: false,
        description: '',
        startTime: '08:00',
        endTime: '12:00',
        photos: []
      };
    });
    return initial;
  });

  // Expanded work fronts accordion state (only expanded front(s) are open, auto-retracting others for clarity)
  const [expandedFronts, setExpandedFronts] = useState<Record<string, boolean>>({});

  const [hasDraft, setHasDraft] = useState<boolean>(() => !!initialDraft);

  // Selected report for viewing details modal
  const [viewingReport, setViewingReport] = useState<StopReport | null>(null);

  // Selected report for deletion confirmation modal
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string } | null>(null);

  // Report that was just saved (to display success modal and download PDF)
  const [justSavedReport, setJustSavedReport] = useState<StopReport | null>(null);

  // Auto-save form draft to localStorage whenever form fields change
  useEffect(() => {
    const hasActiveFronts = Object.values(formWorkFronts).some((wf: any) => 
      wf && (wf.active || (wf.description && wf.description.trim() !== '') || (wf.photos && wf.photos.length > 0))
    );
    const isDirty = editingReport !== null ||
      formObservation.trim() !== '' ||
      formRejectionTime !== '0' ||
      formSpeedMS1 !== 0 ||
      formSpeedMS2 !== 0 ||
      hasActiveFronts;

    if (isDirty) {
      const draftData = {
        editingReport,
        formType,
        formDate,
        formLineId,
        formStartTime,
        formEndTime,
        formRejectionTime,
        formSpeedMS1,
        formSpeedMS2,
        formObservation,
        formWorkFronts,
        updatedAt: new Date().toISOString()
      };
      try {
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftData));
        setHasDraft(true);
      } catch (err) {
        console.warn("Could not save form draft:", err);
      }
    } else {
      try {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
      } catch (err) {}
      setHasDraft(false);
    }
  }, [
    editingReport,
    formType,
    formDate,
    formLineId,
    formStartTime,
    formEndTime,
    formRejectionTime,
    formSpeedMS1,
    formSpeedMS2,
    formObservation,
    formWorkFronts
  ]);

  // Subscribe to system_config/stop_work_fronts for dynamic admin work fronts
  useEffect(() => {
    const unsubWorkFronts = onSnapshot(doc(db, 'system_config', 'stop_work_fronts'), (snap) => {
      if (snap.exists() && Array.isArray(snap.data().list) && snap.data().list.length > 0) {
        const loadedList: string[] = snap.data().list;
        setWorkFrontOptions(loadedList);

        // Keep formWorkFronts in sync with loaded options
        setFormWorkFronts(prev => {
          const updated = { ...prev };
          loadedList.forEach(front => {
            if (!updated[front]) {
              updated[front] = {
                active: false,
                description: '',
                startTime: formStartTime || '08:00',
                endTime: formEndTime || '12:00',
                photos: []
              };
            }
          });
          return updated;
        });
      } else {
        setWorkFrontOptions(DEFAULT_WORK_FRONTS);
      }
    }, (err) => {
      console.warn("Could not load system_config/stop_work_fronts:", err);
      setWorkFrontOptions(DEFAULT_WORK_FRONTS);
    });
    return () => unsubWorkFronts();
  }, [formStartTime, formEndTime]);

  // Sync stop start/end times with all active work fronts by default
  useEffect(() => {
    setFormWorkFronts(prev => {
      const updated = { ...prev };
      workFrontOptions.forEach(front => {
        if (updated[front] && !updated[front].active) {
          updated[front] = {
            ...updated[front],
            startTime: formStartTime,
            endTime: formEndTime
          };
        }
      });
      return updated;
    });
  }, [formStartTime, formEndTime, workFrontOptions]);

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

  const getBase64SizeKB = (base64: string): number => {
    if (!base64) return 0;
    const stringLength = base64.length - (base64.indexOf(',') + 1);
    const sizeInBytes = (stringLength * 3) / 4;
    return Math.round(sizeInBytes / 1024);
  };

  // Image Compression Helper - High quality visual with ultra-lightweight size (~25-50KB)
  const compressImageFile = (file: File, maxWidth = 600, maxHeight = 600, quality = 0.55): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          if (width > maxWidth || height > maxHeight) {
            if (width / height > maxWidth / maxHeight) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            } else {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('Canvas ctx null'));
          ctx.drawImage(img, 0, 0, width, height);
          let result = canvas.toDataURL('image/jpeg', quality);

          // Second compression pass if result is larger than 60KB (~80KB base64 length)
          if (result.length > 80000) {
            const secondCanvas = document.createElement('canvas');
            const targetWidth = Math.min(width, 450);
            const targetHeight = Math.round((height * targetWidth) / width);
            secondCanvas.width = targetWidth;
            secondCanvas.height = targetHeight;
            const ctx2 = secondCanvas.getContext('2d');
            if (ctx2) {
              ctx2.drawImage(img, 0, 0, targetWidth, targetHeight);
              result = secondCanvas.toDataURL('image/jpeg', 0.45);
            }
          }

          resolve(result);
        };
        img.onerror = (err) => reject(err);
        img.src = e.target?.result as string;
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  // Photo handlers per work front
  const handleAddPhotoToWorkFront = async (front: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    try {
      const newPhotos: StopWorkFrontPhoto[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const compressedBase64 = await compressImageFile(file);
        const photoNum = (formWorkFronts[front]?.photos?.length || 0) + i + 1;
        newPhotos.push({
          id: `ph_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 5)}`,
          url: compressedBase64,
          caption: `Foto ${photoNum} - Frente ${front}`,
          createdAt: new Date().toISOString()
        });
      }

      setFormWorkFronts(prev => {
        const currentPhotos = prev[front]?.photos || [];
        return {
          ...prev,
          [front]: {
            ...prev[front],
            photos: [...currentPhotos, ...newPhotos]
          }
        };
      });
    } catch (err) {
      console.error("Error attaching photo:", err);
      alert("Não foi possível carregar a imagem. Tente novamente.");
    } finally {
      e.target.value = '';
    }
  };

  const handleUpdatePhotoCaption = (front: string, photoId: string, caption: string) => {
    setFormWorkFronts(prev => {
      const currentPhotos = prev[front]?.photos || [];
      const updatedPhotos = currentPhotos.map(ph => ph.id === photoId ? { ...ph, caption } : ph);
      return {
        ...prev,
        [front]: {
          ...prev[front],
          photos: updatedPhotos
        }
      };
    });
  };

  const handleRemovePhotoFromWorkFront = (front: string, photoId: string) => {
    setFormWorkFronts(prev => {
      const currentPhotos = prev[front]?.photos || [];
      const updatedPhotos = currentPhotos.filter(ph => ph.id !== photoId);
      return {
        ...prev,
        [front]: {
          ...prev[front],
          photos: updatedPhotos
        }
      };
    });
  };

  // Admin Management of Work Fronts
  const handleAddCustomWorkFront = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newWorkFrontName.trim();
    if (!trimmed) return;

    if (workFrontOptions.some(f => f.toLowerCase() === trimmed.toLowerCase())) {
      alert("Esta frente de trabalho já existe!");
      return;
    }

    const updatedList = [...workFrontOptions, trimmed];
    setSavingWorkFronts(true);
    try {
      await setDoc(doc(db, 'system_config', 'stop_work_fronts'), {
        list: updatedList,
        updatedAt: serverTimestamp(),
        updatedBy: user?.displayName || user?.email || 'Admin'
      });
      setWorkFrontOptions(updatedList);
      setNewWorkFrontName('');
    } catch (err) {
      console.error("Error adding work front:", err);
      alert("Erro ao salvar nova frente de trabalho.");
    } finally {
      setSavingWorkFronts(false);
    }
  };

  const handleDeleteCustomWorkFront = async (frontToDelete: string) => {
    const updatedList = workFrontOptions.filter(f => f !== frontToDelete);
    setSavingWorkFronts(true);
    try {
      await setDoc(doc(db, 'system_config', 'stop_work_fronts'), {
        list: updatedList,
        updatedAt: serverTimestamp(),
        updatedBy: user?.displayName || user?.email || 'Admin'
      });
      setWorkFrontOptions(updatedList);
      setFrontToDeleteConfirm(null);
      
      // Remove deleted work front from form state
      setFormWorkFronts(prev => {
        const copy = { ...prev };
        delete copy[frontToDelete];
        return copy;
      });
    } catch (err) {
      console.error("Error deleting work front:", err);
      alert("Erro ao excluir frente de trabalho.");
    } finally {
      setSavingWorkFronts(false);
    }
  };

  const canEditReport = (report: StopReport | null) => {
    if (!report) return false;
    if (isManager || isAdmin || isMaster) return true;
    return !!(user?.uid && report.userId === user.uid);
  };

  const canDeleteReport = (report: StopReport | null) => {
    if (!report) return false;
    return isManager || isAdmin || isMaster;
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
    const allKnownFronts = Array.from(new Set([...workFrontOptions, ...report.workFronts.map(wf => wf.front)]));
    
    allKnownFronts.forEach(front => {
      const match = report.workFronts.find(wf => wf.front === front);
      if (match) {
        initialFronts[front] = {
          active: true,
          description: match.description,
          startTime: match.startTime,
          endTime: match.endTime,
          photos: match.photos || []
        };
      } else {
        initialFronts[front] = {
          active: false,
          description: '',
          startTime: report.startTime,
          endTime: report.endTime,
          photos: []
        };
      }
    });
    setFormWorkFronts(initialFronts);
    // Expand the first active work front for editing
    const firstActiveFront = report.workFronts[0]?.front;
    if (firstActiveFront) {
      setExpandedFronts({ [firstActiveFront]: true });
    } else {
      setExpandedFronts({});
    }
    setActiveTab('register');
  };

  // Cancel edit mode
  const handleCancelEdit = () => {
    setEditingReport(null);
    resetForm();
  };

  // Reset Form fields
  const resetForm = () => {
    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch (err) {}
    setHasDraft(false);

    setEditingReport(null);
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
    setExpandedFronts({});
    
    const initial: Record<string, any> = {};
    workFrontOptions.forEach(front => {
      initial[front] = {
        active: false,
        description: '',
        startTime: '08:00',
        endTime: '12:00',
        photos: []
      };
    });
    setFormWorkFronts(initial);
  };

  const compressBase64 = (base64Str: string, maxWidth = 450, quality = 0.45): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } else {
          resolve(base64Str);
        }
      };
      img.onerror = () => resolve(base64Str);
      img.src = base64Str;
    });
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
      const keysToProcess = Array.from(new Set([...workFrontOptions, ...Object.keys(formWorkFronts)]));
      
      keysToProcess.forEach(front => {
        const item = formWorkFronts[front];
        if (item && item.active) {
          activeWorkFronts.push({
            id: `wf_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            front,
            description: item.description,
            startTime: item.startTime,
            endTime: item.endTime,
            photos: item.photos || []
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
        userId: editingReport ? (editingReport.userId || user?.uid || 'anonymous') : (user?.uid || 'anonymous'),
        userName: editingReport ? (editingReport.userName || user?.displayName || 'Operador') : (user?.displayName || 'Operador'),
      };

      if (editingReport) {
        reportData.createdAt = editingReport.createdAt || serverTimestamp();
        reportData.updatedAt = serverTimestamp();
      } else {
        reportData.createdAt = serverTimestamp();
      }

      // Safety check: calculate approximate size of JSON payload
      let payloadString = JSON.stringify(reportData);
      
      // If payload is over 800KB (~800,000 chars), attempt aggressive re-compression of photos
      if (payloadString.length > 800000) {
        for (const wf of reportData.workFronts) {
          if (wf.photos && wf.photos.length > 0) {
            wf.photos = await Promise.all(
              wf.photos.map(async (ph: StopWorkFrontPhoto) => {
                if (ph.url && ph.url.startsWith('data:image')) {
                  const compressed = await compressBase64(ph.url, 400, 0.4);
                  return { ...ph, url: compressed };
                }
                return ph;
              })
            );
          }
        }
        payloadString = JSON.stringify(reportData);
      }

      // If still over 980KB, notify user cleanly
      if (payloadString.length > 980000) {
        alert("O relatório excede o limite de tamanho (1MB) devido ao número excessivo de fotos. Por favor, remova 1 ou 2 fotos e tente novamente.");
        setSubmitting(false);
        return;
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
    } catch (err: any) {
      console.error("Error saving stop report:", err);
      if (err?.message?.includes('exceeds') || err?.code === 'resource-exhausted' || err?.message?.includes('bytes')) {
        alert("O relatório excede o limite de tamanho do banco de dados (1MB) devido às fotos. Por favor, remova algumas fotos antes de salvar.");
      } else {
        handleFirestoreError(err, editingReport ? OperationType.UPDATE : OperationType.CREATE, 'stops_reports');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Delete a report
  const handleDeleteReport = (report: StopReport) => {
    setDeleteConfirm({
      id: report.id,
      title: `Parada de ${report.lineName || report.lineId} (${formatDateToBR(report.date)})`
    });
  };

  const confirmDeleteReport = async () => {
    if (!deleteConfirm) return;
    setSubmitting(true);
    try {
      await deleteDoc(doc(db, 'stops_reports', deleteConfirm.id));
      if (viewingReport?.id === deleteConfirm.id) {
        setViewingReport(null);
      }
      setDeleteConfirm(null);
    } catch (err) {
      console.error("Error deleting stop report:", err);
      handleFirestoreError(err, OperationType.DELETE, `stops_reports/${deleteConfirm.id}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle work front participation
  const toggleWorkFront = (front: string) => {
    let willBeActive = false;
    setFormWorkFronts(prev => {
      const active = !prev[front]?.active;
      willBeActive = active;
      const currentDesc = prev[front]?.description || '';
      const newDesc = (active && !currentDesc) ? '- ' : currentDesc;
      return {
        ...prev,
        [front]: {
          ...prev[front],
          active,
          description: newDesc,
          // Pre-fill start/end times with the main stop times if toggled on
          startTime: active ? formStartTime : prev[front]?.startTime || formStartTime,
          endTime: active ? formEndTime : prev[front]?.endTime || formEndTime
        }
      };
    });

    setExpandedFronts(prev => {
      const isCurrentlyActive = formWorkFronts[front]?.active;
      if (!isCurrentlyActive) {
        // Turning ON -> expand this front and retract others to keep screen clean and organized
        return { [front]: true };
      } else {
        // Turning OFF -> collapse it
        const copy = { ...prev };
        delete copy[front];
        return copy;
      }
    });
  };

  // Toggle expand/collapse state without deactivating the work front
  const toggleExpandWorkFront = (front: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedFronts(prev => {
      const isCurrentlyExpanded = !!prev[front];
      if (isCurrentlyExpanded) {
        // Collapse
        const copy = { ...prev };
        delete copy[front];
        return copy;
      } else {
        // Expand this front, auto-retract others so user focuses on one front at a time
        return { [front]: true };
      }
    });
  };

  const expandAllWorkFronts = () => {
    const allExpanded: Record<string, boolean> = {};
    workFrontOptions.forEach(f => {
      allExpanded[f] = true;
    });
    setExpandedFronts(allExpanded);
  };

  const collapseAllWorkFronts = () => {
    setExpandedFronts({});
  };

  const handleFocusWorkFront = (front: string) => {
    // When typing or focusing in a work front, auto-retract other fronts for a clean screen
    if (!expandedFronts[front]) {
      setExpandedFronts({ [front]: true });
    }
    if (!formWorkFronts[front]?.description) {
      handleWorkFrontChange(front, 'description', '- ');
    }
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

  const handleAddWorkFrontBullet = (front: string) => {
    setFormWorkFronts(prev => {
      const current = prev[front]?.description || '';
      let updated = '';
      if (!current.trim()) {
        updated = '- ';
      } else {
        updated = current.endsWith('\n') ? `${current}- ` : `${current}\n- `;
      }
      return {
        ...prev,
        [front]: {
          ...prev[front],
          description: updated
        }
      };
    });
  };

  const handleWorkFrontKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, front: string) => {
    if (e.key === 'Enter') {
      const target = e.currentTarget;
      const selectionStart = target.selectionStart;
      const selectionEnd = target.selectionEnd;
      const value = target.value;

      const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
      const currentLine = value.substring(lineStart, selectionStart);

      if (/^\s*-\s*/.test(currentLine)) {
        e.preventDefault();
        if (currentLine.trim() === '-' || currentLine.trim() === '') {
          const newValue = value.substring(0, lineStart) + value.substring(selectionEnd);
          handleWorkFrontChange(front, 'description', newValue);
          setTimeout(() => {
            target.selectionStart = target.selectionEnd = lineStart;
          }, 0);
          return;
        }

        const prefix = '\n- ';
        const newValue = value.substring(0, selectionStart) + prefix + value.substring(selectionEnd);
        handleWorkFrontChange(front, 'description', newValue);
        setTimeout(() => {
          target.selectionStart = target.selectionEnd = selectionStart + prefix.length;
        }, 0);
      }
    }
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
    let emergencyCount = 0;
    let inspectionCount = 0;
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
      else if (r.type === 'geral') generalCount++;
      else if (r.type === 'emergencia') emergencyCount++;
      else if (r.type === 'inspecao') inspectionCount++;

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
      { name: 'Geral', value: generalCount, color: '#f59e0b' },
      { name: 'Emergência', value: emergencyCount, color: '#f43f5e' },
      { name: 'Inspeção', value: inspectionCount, color: '#a855f7' }
    ].filter(item => item.value > 0);

    const lineChartData = Object.entries(lineDowntime).map(([name, hours]) => ({
      name,
      hours: Number(hours.toFixed(1))
    }));

    const frontChartData = workFrontOptions.map(front => ({
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
  }, [filteredReports, workFrontOptions]);

  // Sanitize text for jsPDF output
  const sanitizePdfText = (text: string | null | undefined): string => {
    if (!text) return '';
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x00-\x7F]/g, '');
  };

  // Render small SecApp branding footer on all PDF pages
  const addSecAppPdfFooter = async (docPdf: jsPDF) => {
    const totalPages = (docPdf as any).internal.getNumberOfPages();
    let logoBase64: string | null = null;
    
    try {
      logoBase64 = await new Promise<string | null>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              resolve(canvas.toDataURL('image/png'));
              return;
            }
          } catch {
            // ignore canvas error
          }
          resolve(null);
        };
        img.onerror = () => resolve(null);
        img.src = logoUrl || '/logo_file/logo_400pixel.png';
      });
    } catch {
      logoBase64 = null;
    }

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      docPdf.setPage(pageNum);
      
      const pageWidth = docPdf.internal.pageSize.getWidth();
      const pageHeight = docPdf.internal.pageSize.getHeight();
      const footerY = pageHeight - 10;

      // Subtle horizontal divider
      docPdf.setDrawColor(226, 232, 240); // slate-200
      docPdf.setLineWidth(0.3);
      docPdf.line(15, footerY - 4, pageWidth - 15, footerY - 4);

      let textStartX = 15;
      if (logoBase64) {
        try {
          docPdf.addImage(logoBase64, 'PNG', 15, footerY - 3, 10, 4);
          textStartX = 27;
        } catch {
          // ignore addImage fallback
        }
      }

      if (logoBase64) {
        docPdf.setFont('helvetica', 'normal');
        docPdf.setFontSize(8);
        docPdf.setTextColor(148, 163, 184); // slate-400
        docPdf.text('| Sistema de Gestão Operacional', textStartX, footerY + 0.8);
      } else {
        // Fallback text if logo is unavailable
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(8);
        docPdf.setTextColor(5, 150, 105); // emerald-600
        docPdf.text('SecApp', textStartX, footerY + 0.8);

        const secAppWidth = docPdf.getTextWidth('SecApp');
        docPdf.setFont('helvetica', 'normal');
        docPdf.setTextColor(148, 163, 184); // slate-400
        docPdf.text(' | Sistema de Gestão Operacional', textStartX + secAppWidth, footerY + 0.8);
      }

      // Page numbers on right
      docPdf.text(`Página ${pageNum} de ${totalPages}`, pageWidth - 15, footerY + 0.8, { align: 'right' });
    }
  };

  // Export selected Stop Report to PDF
  const handleExportSinglePDF = async (report: StopReport) => {
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

    // Header styling - Standardized Emerald Theme
    docPdf.setFillColor(5, 150, 105); // emerald-600
    docPdf.rect(0, 0, 210, 40, 'F');
    
    docPdf.setTextColor(255, 255, 255);
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(18);
    docPdf.text(sanitizePdfText('RELATÓRIO DE CONTROLE DE PARADA'), 15, 22);
    
    // Subtitle / Metadata line
    docPdf.setFontSize(9);
    docPdf.setFont('helvetica', 'normal');
    docPdf.setTextColor(190, 242, 219); // emerald-100
    docPdf.text(sanitizePdfText(`Gerado em: ${new Date().toLocaleString('pt-BR')}`), 15, 32);

    // Section 1: General Info
    docPdf.setTextColor(5, 150, 105);
    docPdf.setFontSize(13);
    docPdf.setFont('helvetica', 'bold');
    docPdf.text(sanitizePdfText('Informações Gerais da Parada'), 15, 53);
    
    const generalData = [
      [sanitizePdfText('Data:'), formatDateToBR(report.date), sanitizePdfText('Tipo de Parada:'), sanitizePdfText(getStopTypeLabel(report.type).toUpperCase())],
      [sanitizePdfText('Local (Linha):'), sanitizePdfText(report.lineName || report.lineId), sanitizePdfText('Tempo de Rejeição:'), `${report.rejectionTime || 0} min`],
      [sanitizePdfText('Hora Início:'), report.startTime, sanitizePdfText('Hora Término:'), report.endTime],
      [sanitizePdfText('Duração:'), formatDurationString(duration), sanitizePdfText('Registrado por:'), sanitizePdfText(report.userName)]
    ];

    autoTable(docPdf, {
      startY: 58,
      head: [],
      body: generalData,
      theme: 'plain',
      styles: { cellPadding: 2, fontSize: 9.5, textColor: [51, 65, 85] },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 35 },
        1: { cellWidth: 65 },
        2: { fontStyle: 'bold', cellWidth: 45 },
        3: { cellWidth: 45 }
      }
    });

    // Section 2: Cutter speeds
    let currentY = (docPdf as any).lastAutoTable.finalY + 8;
    docPdf.setTextColor(5, 150, 105);
    docPdf.setFontSize(13);
    docPdf.setFont('helvetica', 'bold');
    docPdf.text(sanitizePdfText('Velocidade das Cortadeiras'), 15, currentY);

    const speedData = [
      [sanitizePdfText('Cortadeira Linha MS1:'), `${report.cutterSpeedMS1 || 0} m/min`],
      [sanitizePdfText('Cortadeira Linha MS2:'), `${report.cutterSpeedMS2 || 0} m/min`]
    ];

    autoTable(docPdf, {
      startY: currentY + 4,
      head: [],
      body: speedData,
      theme: 'plain',
      styles: { cellPadding: 2, fontSize: 9.5, textColor: [51, 65, 85] },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 60 },
        1: { cellWidth: 130 }
      }
    });

    // Section 3: Work fronts
    currentY = (docPdf as any).lastAutoTable.finalY + 8;
    docPdf.setTextColor(5, 150, 105);
    docPdf.setFontSize(13);
    docPdf.setFont('helvetica', 'bold');
    docPdf.text(sanitizePdfText('Atividades e Frentes de Trabalho'), 15, currentY);

    if (report.workFronts.length === 0) {
      docPdf.setFontSize(9.5);
      docPdf.setFont('helvetica', 'italic');
      docPdf.setTextColor(100, 116, 139);
      docPdf.text(sanitizePdfText('Nenhuma frente de trabalho foi registrada nesta parada.'), 15, currentY + 8);
      currentY += 15;
    } else {
      const frontsHeaders = [[
        sanitizePdfText('Frente de Trabalho'),
        sanitizePdfText('Descrição das Atividades Realizadas'),
        sanitizePdfText('Início'),
        sanitizePdfText('Fim'),
        sanitizePdfText('Duração')
      ]];
      const frontsBody = report.workFronts.map(wf => {
        const wfDuration = getMinutesDiff(wf.startTime, wf.endTime);
        return [
          sanitizePdfText(wf.front),
          sanitizePdfText(wf.description || 'Sem detalhes informados.'),
          wf.startTime,
          wf.endTime,
          formatDurationString(wfDuration)
        ];
      });

      autoTable(docPdf, {
        startY: currentY + 4,
        head: frontsHeaders,
        body: frontsBody,
        theme: 'striped',
        headStyles: { fillColor: [5, 150, 105], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 8.5, cellPadding: 3 },
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

      docPdf.setTextColor(5, 150, 105);
      docPdf.setFontSize(13);
      docPdf.setFont('helvetica', 'bold');
      docPdf.text(sanitizePdfText('Cronograma de Frentes de Trabalho'), 15, currentY);
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
        docPdf.setFontSize(8.5);
        docPdf.setFont('helvetica', 'bold');
        docPdf.setTextColor(51, 65, 85); // slate-700
        docPdf.text(sanitizePdfText(wf.front), 15, rowY + 5);

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
        const frontStr: string = wf.front;
        if (frontStr.includes('Mecân') || frontStr.includes('Mecan')) color = [249, 115, 22]; // Orange
        else if (frontStr.includes('Elétr') || frontStr.includes('Eletr')) color = [245, 158, 11]; // Amber
        else if (frontStr.includes('Instrumenta')) color = [16, 185, 129]; // Emerald
        else if (frontStr.includes('Hidrául') || frontStr.includes('Hidraul')) color = [6, 182, 212]; // Cyan
        else if (frontStr.includes('Civil')) color = [16, 185, 129]; // Emerald
        else if (frontStr.includes('Caldeiraria')) color = [244, 63, 94]; // Rose
        else if (frontStr.includes('Operacional')) color = [139, 92, 246]; // Violet / Purple

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

    docPdf.setTextColor(5, 150, 105);
    docPdf.setFontSize(13);
    docPdf.setFont('helvetica', 'bold');
    docPdf.text(sanitizePdfText('Observações Finais'), 15, currentY);
    
    docPdf.setFontSize(9.5);
    docPdf.setFont('helvetica', 'normal');
    docPdf.setTextColor(51, 65, 85);
    
    const obsText = sanitizePdfText(report.observation || 'Nenhuma observação informada.');
    const splitObs = docPdf.splitTextToSize(obsText, 180);
    docPdf.text(splitObs, 15, currentY + 6);

    // Section 5: Photographic Record per Work Front
    const allPhotos: { photo: StopWorkFrontPhoto; frontName: string; index: number }[] = [];
    let photoCounter = 1;
    (report.workFronts || []).forEach(wf => {
      if (wf.photos && wf.photos.length > 0) {
        wf.photos.forEach(ph => {
          allPhotos.push({
            photo: ph,
            frontName: wf.front,
            index: photoCounter++
          });
        });
      }
    });

    if (allPhotos.length > 0) {
      currentY += (splitObs.length * 5) + 12;

      if (currentY + 70 > 270) {
        docPdf.addPage();
        currentY = 20;
      }

      docPdf.setTextColor(5, 150, 105);
      docPdf.setFontSize(13);
      docPdf.setFont('helvetica', 'bold');
      docPdf.text(sanitizePdfText('Registro Fotográfico das Frentes de Trabalho'), 15, currentY);
      currentY += 8;

      const colWidth = 85;
      const colHeight = 55;
      const gapX = 10;
      const gapY = 12;

      for (let i = 0; i < allPhotos.length; i++) {
        const item = allPhotos[i];
        const colIndex = i % 2;

        if (colIndex === 0 && i > 0) {
          currentY += colHeight + gapY;
        }

        if (currentY + colHeight + 8 > 270) {
          docPdf.addPage();
          currentY = 20;
        }

        const posX = 15 + colIndex * (colWidth + gapX);
        const posY = currentY;

        // Container box border
        docPdf.setDrawColor(226, 232, 240);
        docPdf.setFillColor(248, 250, 252);
        docPdf.rect(posX, posY, colWidth, colHeight + 6, 'FD');

        // Image
        try {
          docPdf.addImage(item.photo.url, 'JPEG', posX + 1.5, posY + 1.5, colWidth - 3, colHeight - 3);
        } catch (err) {
          console.warn("Could not render photo image in PDF:", err);
          docPdf.setFontSize(8);
          docPdf.setTextColor(148, 163, 184);
          docPdf.text('[Foto Indisponível]', posX + (colWidth / 2), posY + (colHeight / 2), { align: 'center' });
        }

        // Dark banner legend underneath photo
        docPdf.setFillColor(15, 23, 42); // slate-900
        docPdf.rect(posX, posY + colHeight - 2, colWidth, 8, 'F');

        const defaultLegend = `Foto ${item.index} - Frente trabalho ${item.frontName}`;
        const legendText = item.photo.caption && item.photo.caption.trim() ? item.photo.caption : defaultLegend;

        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(7.5);
        docPdf.setTextColor(255, 255, 255);

        const safeLegend = sanitizePdfText(legendText);
        const splitLegend = docPdf.splitTextToSize(safeLegend, colWidth - 4);
        docPdf.text(splitLegend[0] || safeLegend, posX + 2, posY + colHeight + 3.5);
      }
    }

    // Add SecApp footer branding
    await addSecAppPdfFooter(docPdf);

    // Save File
    docPdf.save(`Controle_Parada_${formatDateToBR(report.date).replace(/\//g, '-')}_${sanitizePdfText(report.lineName || 'Linha')}.pdf`);
  };

  // Export full table of stops to PDF
  const handleExportFullPDF = async () => {
    const docPdf = new jsPDF('landscape');
    
    // Header styling - Standardized Emerald Theme
    docPdf.setFillColor(5, 150, 105); // emerald-600
    docPdf.rect(0, 0, 297, 35, 'F');
    
    docPdf.setTextColor(255, 255, 255);
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(18);
    docPdf.text(sanitizePdfText('CONTROLE DE PARADAS - RELATÓRIO GERAL'), 15, 18);
    
    docPdf.setFontSize(9);
    docPdf.setFont('helvetica', 'normal');
    docPdf.setTextColor(190, 242, 219); // emerald-100
    docPdf.text(sanitizePdfText(`Filtrado por data: ${filterStartDate ? formatDateToBR(filterStartDate) : 'Início'} até ${filterEndDate ? formatDateToBR(filterEndDate) : 'Fim'} | Total registros: ${filteredReports.length}`), 15, 27);
    docPdf.text(sanitizePdfText(`Gerado em: ${new Date().toLocaleString('pt-BR')}`), 210, 27);

    const headers = [[
      sanitizePdfText('Data'),
      sanitizePdfText('Tipo'),
      sanitizePdfText('Local/Linha'),
      sanitizePdfText('Início'),
      sanitizePdfText('Término'),
      sanitizePdfText('Duração'),
      sanitizePdfText('Rejeição'),
      sanitizePdfText('MS1 Speed'),
      sanitizePdfText('MS2 Speed'),
      sanitizePdfText('Frentes de Trabalho')
    ]];
    const body = filteredReports.map(r => {
      const duration = getMinutesDiff(r.startTime, r.endTime);
      const frontsStr = r.workFronts.map(wf => wf.front).join(', ');
      return [
        formatDateToBR(r.date),
        sanitizePdfText(getStopTypeLabel(r.type).toUpperCase()),
        sanitizePdfText(r.lineName || r.lineId),
        r.startTime,
        r.endTime,
        formatDurationString(duration),
        `${r.rejectionTime || 0}m`,
        `${r.cutterSpeedMS1 || 0} m/min`,
        `${r.cutterSpeedMS2 || 0} m/min`,
        sanitizePdfText(frontsStr || 'Nenhuma')
      ];
    });

    autoTable(docPdf, {
      startY: 42,
      head: headers,
      body: body,
      theme: 'grid',
      headStyles: { fillColor: [5, 150, 105], textColor: [255, 255, 255], fontSize: 8.5, fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 2.5 }
    });

    // Add SecApp footer branding
    await addSecAppPdfFooter(docPdf);

    docPdf.save(`Controle_Paradas_Geral_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12 px-4" id="stops-control-container">
      {/* Top Banner with animated background */}
      <div className="relative overflow-hidden bg-slate-900 rounded-[2.5rem] text-white p-8 md:p-10 shadow-xl border border-slate-800">
        <div className="absolute inset-0 bg-radial-gradient from-emerald-900/30 via-transparent to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-600/20 text-emerald-400 rounded-2xl border border-emerald-500/20">
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
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 border border-emerald-500"
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
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 border border-emerald-500"
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
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 border border-emerald-500"
                  : "bg-slate-800/60 text-slate-300 hover:bg-slate-800 border border-slate-700/50"
              )}
            >
              Indicadores
            </button>
            {(isAdmin || isManager || isMaster) && (
              <button
                type="button"
                onClick={() => setShowWorkFrontsModal(true)}
                className="px-4 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider transition-all bg-emerald-900/60 hover:bg-emerald-800 text-emerald-200 border border-emerald-700/60 flex items-center gap-1.5 active:scale-95 cursor-pointer"
                title="Gerenciar Frentes de Trabalho"
              >
                <Settings className="w-3.5 h-3.5 text-emerald-400" />
                <span>Gerenciar Frentes</span>
              </button>
            )}
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
                  className="px-3 py-1 bg-amber-200 hover:bg-amber-300 text-amber-900 rounded-lg text-xs font-bold cursor-pointer transition-all"
                >
                  Cancelar Edição
                </button>
              </div>
            )}

            {hasDraft && !editingReport && (
              <div className="flex items-center justify-between p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-300 shadow-2xs backdrop-blur-xs">
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </span>
                  <span className="font-bold text-xs text-emerald-200">
                    Rascunho salvo automaticamente. Se você mudar de tela ou atualizar, os dados preenchidos serão mantidos.
                  </span>
                </div>
                <button 
                  type="button" 
                  onClick={resetForm} 
                  className="px-3 py-1 bg-emerald-900/60 hover:bg-emerald-800 text-emerald-200 border border-emerald-700/60 rounded-xl text-[11px] font-bold transition-all cursor-pointer shadow-2xs"
                >
                  Limpar Rascunho
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left Column: Basic Info */}
              <div className="lg:col-span-2 space-y-6">
                
                {/* General parameters Card */}
                <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-100 shadow-sm space-y-6">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-50">
                    <Sliders className="w-5 h-5 text-emerald-600" />
                    <h2 className="text-lg font-bold text-slate-900">Parâmetros da Parada</h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Tipo de Parada</label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <button
                          type="button"
                          onClick={() => setFormType('programada')}
                          className={cn(
                            "py-3 px-2 rounded-xl text-xs font-bold uppercase transition-all border flex items-center justify-center gap-1.5 cursor-pointer",
                            formType === 'programada'
                              ? "bg-sky-50 text-sky-800 border-sky-300 shadow-2xs ring-2 ring-sky-400/20 font-extrabold"
                              : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                          )}
                        >
                          <span>🕒</span> Programada
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormType('geral')}
                          className={cn(
                            "py-3 px-2 rounded-xl text-xs font-bold uppercase transition-all border flex items-center justify-center gap-1.5 cursor-pointer",
                            formType === 'geral'
                              ? "bg-amber-50 text-amber-800 border-amber-300 shadow-2xs ring-2 ring-amber-400/20 font-extrabold"
                              : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                          )}
                        >
                          <span>⚙️</span> Geral
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormType('emergencia')}
                          className={cn(
                            "py-3 px-2 rounded-xl text-xs font-bold uppercase transition-all border flex items-center justify-center gap-1.5 cursor-pointer",
                            formType === 'emergencia'
                              ? "bg-rose-50 text-rose-800 border-rose-300 shadow-2xs ring-2 ring-rose-400/20 font-extrabold"
                              : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                          )}
                        >
                          <span>🚨</span> Emergência
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormType('inspecao')}
                          className={cn(
                            "py-3 px-2 rounded-xl text-xs font-bold uppercase transition-all border flex items-center justify-center gap-1.5 cursor-pointer",
                            formType === 'inspecao'
                              ? "bg-purple-50 text-purple-800 border-purple-300 shadow-2xs ring-2 ring-purple-400/20 font-extrabold"
                              : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                          )}
                        >
                          <span>🔍</span> Inspeção
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
                          className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-semibold text-slate-800"
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
                          className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-semibold text-slate-800 appearance-none"
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
                          className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-semibold text-slate-800"
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
                          className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-semibold text-slate-800"
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
                          className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-semibold text-slate-800"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Downtime display pill */}
                  <div className="flex items-center gap-2 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
                    <Info className="w-5 h-5 text-emerald-600 shrink-0" />
                    <span className="text-xs font-bold text-emerald-800">
                      Duração Total Calculada da Parada: <span className="underline">{formatDurationString(calculatedStopDuration)}</span>
                    </span>
                  </div>
                </div>

                {/* Cutter speeds Card */}
                <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-100 shadow-sm space-y-6">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-50">
                    <Gauge className="w-5 h-5 text-emerald-600" />
                    <h2 className="text-lg font-bold text-slate-900">Velocidade das Cortadeiras durante a Parada</h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Linha MS1 (m/min)</label>
                        <span className="text-xs font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">{formSpeedMS1} m/min</span>
                      </div>
                      <select
                        value={formSpeedMS1}
                        onChange={(e) => setFormSpeedMS1(Number(e.target.value))}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-sm outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                      >
                        {SPEED_OPTIONS.map((speed, spIdx) => (
                          <option key={`speed-ms1-${speed}-${spIdx}`} value={speed}>
                            {speed} m/min
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Linha MS2 (m/min)</label>
                        <span className="text-xs font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">{formSpeedMS2} m/min</span>
                      </div>
                      <select
                        value={formSpeedMS2}
                        onChange={(e) => setFormSpeedMS2(Number(e.target.value))}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-sm outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                      >
                        {SPEED_OPTIONS.map((speed, spIdx) => (
                          <option key={`speed-ms2-${speed}-${spIdx}`} value={speed}>
                            {speed} m/min
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Work fronts (Frentes de trabalho) registration */}
                <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-100 shadow-sm space-y-6">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Wrench className="w-5 h-5 text-emerald-600" />
                      <h2 className="text-lg font-bold text-slate-900">Envolvimento de Frentes de Trabalho</h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={expandAllWorkFronts}
                        className="text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                        title="Expandir todas as frentes de trabalho"
                      >
                        <Maximize2 className="w-3 h-3 text-slate-500" />
                        Expandir
                      </button>
                      <button
                        type="button"
                        onClick={collapseAllWorkFronts}
                        className="text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                        title="Retrair frentes para organizar a tela"
                      >
                        <Minimize2 className="w-3 h-3 text-slate-500" />
                        Recolher
                      </button>
                    </div>
                  </div>
                  
                  <p className="text-xs font-semibold text-slate-500">
                    Selecione quais frentes de trabalho atuaram durante a parada e descreva suas respectivas atividades e horários:
                  </p>

                  <div className="space-y-4">
                    {workFrontOptions.map((front, fIdx) => {
                      const item = formWorkFronts[front] || {
                        active: false,
                        description: '',
                        startTime: formStartTime,
                        endTime: formEndTime,
                        photos: []
                      };
                      const frontDuration = getMinutesDiff(item.startTime, item.endTime);
                      const isExpanded = item.active && !!expandedFronts[front];

                      // Extract clean preview string for collapsed state
                      const descPreview = item.description 
                        ? item.description.split('\n').filter(l => l.trim().length > 0)[0]?.replace(/^-?\s*/, '') 
                        : '';

                      return (
                        <div 
                          key={`workfront-card-${front}-${fIdx}`} 
                          className={cn(
                            "border rounded-2xl transition-all overflow-hidden shadow-xs",
                            item.active 
                              ? "bg-slate-50/50 border-emerald-200/80" 
                              : "bg-white border-slate-100 hover:border-slate-200"
                          )}
                        >
                          {/* Front Header */}
                          <div 
                            onClick={() => {
                              if (!item.active) {
                                toggleWorkFront(front);
                              } else {
                                toggleExpandWorkFront(front);
                              }
                            }}
                            className={cn(
                              "p-4 flex items-center justify-between cursor-pointer select-none transition-colors",
                              item.active ? "hover:bg-slate-100/60" : "hover:bg-slate-50"
                            )}
                          >
                            <div className="flex items-center gap-3 flex-wrap min-w-0">
                              <input
                                type="checkbox"
                                checked={item.active}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  toggleWorkFront(front);
                                }}
                                className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0"
                              />
                              <span className={cn("text-sm font-extrabold", item.active ? "text-slate-800" : "text-slate-400")}>
                                {front}
                              </span>

                              {item.active && (
                                <>
                                  {item.photos && item.photos.length > 0 && (
                                    <span className="bg-emerald-100/80 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                                      <Camera className="w-3 h-3 text-emerald-600" />
                                      {item.photos.length} foto{item.photos.length > 1 ? 's' : ''}
                                    </span>
                                  )}

                                  {!isExpanded && descPreview && (
                                    <span className="hidden sm:inline-block text-[11px] font-medium text-slate-500 truncate max-w-[200px] md:max-w-[300px] bg-slate-100 px-2.5 py-0.5 rounded-md border border-slate-200/60">
                                      {descPreview}
                                    </span>
                                  )}
                                </>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {item.active && (
                                <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-100/60 border border-emerald-100 rounded-full text-[10px] font-bold text-emerald-800">
                                  <Clock className="w-3 h-3" />
                                  {formatDurationString(frontDuration)}
                                </div>
                              )}

                              {item.active && (
                                <button
                                  type="button"
                                  onClick={(e) => toggleExpandWorkFront(front, e)}
                                  className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition-all cursor-pointer"
                                  title={isExpanded ? "Recolher frente" : "Expandir frente para editar"}
                                >
                                  {isExpanded ? (
                                    <ChevronUp className="w-5 h-5 text-emerald-600" />
                                  ) : (
                                    <ChevronDown className="w-5 h-5 text-slate-400" />
                                  )}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Front Expandable Body */}
                          <AnimatePresence initial={false}>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="border-t border-slate-100 p-4 bg-slate-50/30 grid grid-cols-1 md:grid-cols-2 gap-4"
                              >
                                <div className="md:col-span-2 space-y-1.5">
                                  <div className="flex items-center justify-between">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                      O que a equipe está fazendo / Atividade realizada
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() => handleAddWorkFrontBullet(front)}
                                      className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 px-2.5 py-0.5 rounded-lg transition-all cursor-pointer active:scale-95"
                                    >
                                      <Plus className="w-3 h-3" /> Adicionar item (-)
                                    </button>
                                  </div>
                                  <textarea
                                    required
                                    placeholder={`Descreva detalhadamente as atividades da equipe de ${front} separando por hífens (-):\n- Exemplo de atividade 1\n- Exemplo de atividade 2`}
                                    value={item.description}
                                    onChange={(e) => handleWorkFrontChange(front, 'description', e.target.value)}
                                    onKeyDown={(e) => handleWorkFrontKeyDown(e, front)}
                                    onFocus={() => handleFocusWorkFront(front)}
                                    className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-800 text-sm leading-relaxed min-h-[170px] shadow-2xs"
                                    rows={7}
                                  />
                                  <p className="text-[10px] text-slate-400 font-medium">
                                    Dica: Pressione <kbd className="px-1 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-600 font-mono">Enter</kbd> para criar automaticamente um novo item com <kbd className="px-1 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-600 font-mono">-</kbd>.
                                  </p>
                                </div>

                                <div>
                                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Início da Atividade</label>
                                  <input
                                    type="time"
                                    required
                                    value={item.startTime}
                                    onChange={(e) => handleWorkFrontChange(front, 'startTime', e.target.value)}
                                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-semibold text-slate-700 text-xs"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Término da Atividade</label>
                                  <input
                                    type="time"
                                    required
                                    value={item.endTime}
                                    onChange={(e) => handleWorkFrontChange(front, 'endTime', e.target.value)}
                                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-semibold text-slate-700 text-xs"
                                  />
                                </div>

                                {/* Photo Upload Component per Work Front */}
                                <div className="md:col-span-2 pt-3 border-t border-slate-200/60 space-y-3">
                                  <div className="flex items-center justify-between flex-wrap gap-2">
                                    <div className="flex items-center gap-1.5 text-xs font-black text-slate-700 uppercase tracking-wider">
                                      <Camera className="w-4 h-4 text-emerald-600" />
                                      <span>Registro Fotográfico ({front})</span>
                                      {item.photos && item.photos.length > 0 && (
                                        <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                                          {item.photos.length}
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <label className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer">
                                        <Camera className="w-3.5 h-3.5" />
                                        <span>Tirar Foto</span>
                                        <input
                                          type="file"
                                          accept="image/*"
                                          capture="environment"
                                          onChange={(e) => handleAddPhotoToWorkFront(front, e)}
                                          className="hidden"
                                        />
                                      </label>

                                      <label className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer">
                                        <Upload className="w-3.5 h-3.5 text-slate-500" />
                                        <span>Anexar Foto(s)</span>
                                        <input
                                          type="file"
                                          accept="image/*"
                                          multiple
                                          onChange={(e) => handleAddPhotoToWorkFront(front, e)}
                                          className="hidden"
                                        />
                                      </label>
                                    </div>
                                  </div>

                                  {item.photos && item.photos.length > 0 ? (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-1">
                                      {item.photos.map((ph, idx) => (
                                        <div key={ph.id || idx} className="group relative bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                                          <div className="relative">
                                            <img
                                              src={ph.url}
                                              alt={ph.caption || `Foto ${idx + 1}`}
                                              className="w-full h-24 object-cover cursor-pointer hover:opacity-90 transition-all"
                                              onClick={() => setPreviewImage({ url: ph.url, title: ph.caption || `Foto ${idx + 1} - ${front}` })}
                                            />
                                            <span className="absolute bottom-1.5 right-1.5 bg-slate-900/80 text-white text-[9px] font-mono font-bold px-1.5 py-0.5 rounded backdrop-blur-xs shadow-xs">
                                              {getBase64SizeKB(ph.url)} KB
                                            </span>
                                          </div>
                                          <div className="p-1.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-1">
                                            <input
                                              type="text"
                                              value={ph.caption || ''}
                                              placeholder={`Foto ${idx + 1} - Frente trabalho ${front}`}
                                              onChange={(e) => handleUpdatePhotoCaption(front, ph.id, e.target.value)}
                                              className="w-full text-[10px] font-semibold text-slate-700 bg-transparent border-none outline-none focus:bg-white focus:px-1 rounded"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => handleRemovePhotoFromWorkFront(front, ph.id)}
                                              className="p-1 text-slate-400 hover:text-rose-600 rounded-md transition-colors"
                                              title="Remover foto"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-[11px] text-slate-400 italic">
                                      Nenhuma foto registrada nesta frente. Você pode tirar uma foto agora durante a atividade ou anexá-la da galeria.
                                    </p>
                                  )}
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
                    <ClipboardList className="w-5 h-5 text-emerald-600" />
                    <h2 className="text-lg font-bold text-slate-900">Observações</h2>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Anotações / Observações Finais</label>
                    <textarea
                      placeholder="Espaço para notas de encerramento, observações das frentes, pendências de término e horário final do término."
                      value={formObservation}
                      onChange={(e) => setFormObservation(e.target.value)}
                      className="w-full p-4 md:p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-800 text-sm leading-relaxed min-h-[220px] shadow-2xs"
                      rows={8}
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
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Type Filter */}
                <div>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value="all">Todos os Tipos</option>
                    <option value="programada">Programadas</option>
                    <option value="geral">Gerais</option>
                    <option value="emergencia">Emergências</option>
                    <option value="inspecao">Inspeções</option>
                  </select>
                </div>

                {/* Line Filter */}
                <div>
                  <select
                    value={filterLine}
                    onChange={(e) => setFilterLine(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
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
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* End Date */}
                <div>
                  <input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* List / Table */}
            {loading ? (
              <div className="p-12 text-center bg-white rounded-3xl border border-slate-100">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mx-auto" />
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
                                getStopTypeBadgeClass(report.type)
                              )}>
                                {getStopTypeLabel(report.type)}
                              </span>
                            </td>
                            <td className="p-4 whitespace-nowrap text-slate-600">
                              {report.lineName || report.lineId}
                            </td>
                            <td className="p-4 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                              {report.startTime} - {report.endTime}
                            </td>
                            <td className="p-4 text-center whitespace-nowrap">
                              <span className="text-emerald-700 font-extrabold">{formatDurationString(duration)}</span>
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
                                  className="p-1.5 bg-emerald-50 border border-emerald-100 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-all"
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
                                {canEditReport(report) && (
                                  <button
                                    onClick={() => handleStartEdit(report)}
                                    className="p-1.5 bg-amber-50 border border-amber-100 hover:bg-amber-100 text-amber-600 rounded-lg transition-all"
                                    title="Editar"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {canDeleteReport(report) && (
                                  <button
                                    onClick={() => handleDeleteReport(report)}
                                    className="p-1.5 bg-rose-50 border border-rose-100 hover:bg-rose-100 text-rose-600 rounded-lg transition-all"
                                    title="Excluir"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
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
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100">
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
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100">
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
                  <span className="w-1.5 h-3 bg-emerald-600 rounded" />
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
                  <span className="w-1.5 h-3 bg-emerald-600 rounded" />
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
                        <Bar dataKey="hours" fill="#059669" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Work fronts frequency */}
              <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-100 shadow-sm space-y-4 lg:col-span-3">
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 border-b border-slate-50 pb-3">
                  <span className="w-1.5 h-3 bg-emerald-600 rounded" />
                  Frequência de Atuação de Frentes de Trabalho (Ocorrências)
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={metrics.frontChartData} margin={{ bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="front" stroke="#94a3b8" fontSize={11} fontWeight="bold" />
                      <YAxis stroke="#94a3b8" fontSize={11} fontWeight="bold" />
                      <Tooltip formatter={(value) => [`${value} atuação(ões)`, 'Total']} />
                      <Bar dataKey="frequencia" fill="#10b981" radius={[8, 8, 0, 0]} />
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
          <div key="detail-view-modal-container" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 px-3 overflow-y-auto">
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
                      getStopTypeModalBadgeClass(viewingReport.type)
                    )}>
                      {getStopTypeLabel(viewingReport.type)}
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
                    <span className="text-xs font-bold text-emerald-700">
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
                    <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-600">Cortadeira MS1</span>
                      <span className="text-xs font-black text-emerald-800">{viewingReport.cutterSpeedMS1 || 0} m/min</span>
                    </div>
                    <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-600">Cortadeira MS2</span>
                      <span className="text-xs font-black text-emerald-800">{viewingReport.cutterSpeedMS2 || 0} m/min</span>
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
                            <p className="text-xs font-semibold text-slate-600 leading-relaxed whitespace-pre-wrap">
                              {wf.description}
                            </p>

                            {/* Registered Photos for this work front */}
                            {wf.photos && wf.photos.length > 0 && (
                              <div className="pt-2 border-t border-slate-100 mt-2">
                                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                                  <Camera className="w-3.5 h-3.5 text-emerald-600" />
                                  Fotos da Atividade ({wf.photos.length})
                                </span>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                  {wf.photos.map((ph, photoIdx) => (
                                    <div 
                                      key={ph.id || photoIdx} 
                                      onClick={() => setPreviewImage({ url: ph.url, title: ph.caption || `Foto ${photoIdx + 1} - Frente ${wf.front}` })}
                                      className="group relative bg-white border border-slate-200 rounded-xl overflow-hidden cursor-pointer hover:ring-2 hover:ring-emerald-500 transition-all shadow-xs"
                                    >
                                      <img src={ph.url} alt={ph.caption || 'Foto'} className="w-full h-20 object-cover group-hover:scale-105 transition-transform" />
                                      <div className="p-1 bg-slate-900/80 text-white text-[9px] font-bold truncate text-center">
                                        {ph.caption || `Foto ${photoIdx + 1}`}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
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
                {canDeleteReport(viewingReport) && (
                  <button
                    onClick={() => handleDeleteReport(viewingReport)}
                    className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold rounded-xl text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    Excluir
                  </button>
                )}
                {canEditReport(viewingReport) && (
                  <button
                    onClick={() => {
                      const rep = viewingReport;
                      setViewingReport(null);
                      handleStartEdit(rep);
                    }}
                    className="px-4 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 font-bold rounded-xl text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all"
                  >
                    <Edit2 className="w-4 h-4" />
                    Editar
                  </button>
                )}
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
          <div key="success-pdf-modal-container" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 px-3 overflow-y-auto">
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

      {/* DELETE CONFIRMATION MODAL */}
      <AnimatePresence>
        {deleteConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirm(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white w-full max-w-sm rounded-[2rem] shadow-2xl p-8 text-center"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black text-slate-900 mb-2">Confirmar Exclusão</h3>
              <p className="text-slate-500 text-sm mb-8">
                Tem certeza que deseja excluir <strong>{deleteConfirm.title}</strong>? Esta ação não pode ser desfeita.
              </p>
              <div className="flex gap-3">
                <button 
                  type="button"
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="button"
                  onClick={confirmDeleteReport}
                  disabled={submitting}
                  className="flex-1 py-3 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-rose-600/20"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Excluir'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ADMIN WORK FRONTS MANAGEMENT MODAL */}
      <AnimatePresence>
        {showWorkFrontsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2.5rem] border border-slate-100 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-white/10 rounded-xl border border-white/10 text-emerald-400">
                    <Settings className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base">Gerenciar Frentes de Trabalho</h3>
                    <p className="text-xs text-slate-400">Crie ou remova frentes de trabalho do sistema</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowWorkFrontsModal(false)}
                  className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
                {/* Form to Add New Work Front */}
                <form onSubmit={handleAddCustomWorkFront} className="space-y-2">
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-wider">
                    Adicionar Nova Frente de Trabalho
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      placeholder="Ex: Automação, Pintura, Refrigeração..."
                      value={newWorkFrontName}
                      onChange={(e) => setNewWorkFrontName(e.target.value)}
                      className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="submit"
                      disabled={savingWorkFronts || !newWorkFrontName.trim()}
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition-all"
                    >
                      {savingWorkFronts ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      Adicionar
                    </button>
                  </div>
                </form>

                {/* Current List */}
                <div className="space-y-2">
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-wider">
                    Frentes de Trabalho Cadastradas ({workFrontOptions.length})
                  </label>
                  <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/50">
                    {workFrontOptions.map((front, index) => (
                      <div key={front || index} className="p-3.5 flex items-center justify-between hover:bg-white transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span className="text-xs font-extrabold text-slate-800">{front}</span>
                        </div>
                        {frontToDeleteConfirm === front ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-rose-600">Excluir?</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteCustomWorkFront(front)}
                              disabled={savingWorkFronts}
                              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs shadow-xs transition-all flex items-center gap-1 cursor-pointer"
                            >
                              {savingWorkFronts ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Sim'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setFrontToDeleteConfirm(null)}
                              disabled={savingWorkFronts}
                              className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg text-xs transition-all cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setFrontToDeleteConfirm(front)}
                            disabled={savingWorkFronts}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                            title="Excluir frente de trabalho"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => setShowWorkFrontsModal(false)}
                  className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs uppercase tracking-wider transition-all"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* LIGHTBOX / PHOTO PREVIEW MODAL */}
      <AnimatePresence>
        {previewImage && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative max-w-4xl max-h-[90vh] flex flex-col items-center justify-center space-y-3"
            >
              <button
                onClick={() => setPreviewImage(null)}
                className="absolute -top-10 right-0 p-2 text-white hover:text-emerald-400 transition-all bg-slate-800/80 rounded-full cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>
              <img
                src={previewImage.url}
                alt={previewImage.title}
                className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl border border-white/10"
              />
              <p className="text-white font-bold text-xs bg-slate-900/80 px-4 py-2 rounded-full border border-white/10">
                {previewImage.title}
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
