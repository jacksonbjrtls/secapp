import React, { useState, useEffect, useRef } from 'react';
import { 
  Truck, 
  Plus, 
  Settings2, 
  History, 
  CheckCircle2, 
  AlertTriangle, 
  Search, 
  MoreVertical, 
  Edit2, 
  Trash2,
  ChevronRight,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  Building2,
  Calendar,
  User as UserIcon,
  Loader2,
  X,
  ShieldCheck,
  FileOutput,
  ListFilter,
  Image as ImageIcon,
  Video,
  Eye,
  EyeOff,
  GripVertical,
  Bell,
  Lock,
  MessageSquare,
  Info,
  Settings,
  Camera,
  RotateCcw,
  Upload,
  Paperclip,
  Maximize2,
  RefreshCw,
  Smartphone,
  Download,
  FileText,
  Printer
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  getDocs,
  setDoc,
  Timestamp,
  writeBatch
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { Link } from 'react-router-dom';
import { cn, safeToDate } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/errorHandler';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ConfirmationModal } from '../components/ui/ConfirmationModal';

import { getCurrentShift, getGroupForShift, type Shift, type Group } from '../lib/scaleUtils';

interface Forklift {
  id: string;
  number: string;
  sector: string;
  status: 'liberada' | 'bloqueada';
  createdBy: string;
  createdAt: any;
  updatedAt?: any;
}

interface CheckItem {
  id: string;
  name: string;
  type: 'boolean' | 'numeric' | 'normal_anormal' | 'open_closed';
  unit?: string;
  active: boolean;
  showStatusSelection?: boolean;
  order: number;
}

interface Checklist {
  id: string;
  forkliftId: string;
  forkliftNumber: string;
  conductorId: string;
  conductorName: string;
  shift: Shift;
  group: Group;
  status: 'normal' | 'anormal';
  itemResults: Record<string, { 
    value: any; 
    status: 'normal' | 'anormal';
    observation?: string;
    mediaUrl?: string;
    fileName?: string;
    fileSizeKb?: number;
  }>;
  timestamp: any;
  notes?: string;
}

interface GlobalSettings {
  autoNotifyNonConformity: boolean;
  autoLockOnNonConformity: boolean;
  responsiblePersons?: { name: string; email: string }[];
}

const Forklifts: React.FC = () => {
  const { profile, isAdmin, isManager, isMaster, logoUrl } = useAuth();
  const [activeTab, setActiveTab] = useState<'checklists' | 'history' | 'admin'>('checklists');
  const [forklifts, setForklifts] = useState<Forklift[]>([]);
  const [checkItems, setCheckItems] = useState<CheckItem[]>([]);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [settings, setSettings] = useState<GlobalSettings>({ 
    autoNotifyNonConformity: true, 
    autoLockOnNonConformity: false,
    responsiblePersons: []
  });
  const [newResponsible, setNewResponsible] = useState({ name: '', email: '' });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedChecklistId, setExpandedChecklistId] = useState<string | null>(null);
  
  // Modals
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showForkliftModal, setShowForkliftModal] = useState(false);
  const [showCheckModal, setShowCheckModal] = useState<Forklift | null>(null);
  
  // Form States
  const [newForklift, setNewForklift] = useState({ number: '', sector: '', status: 'liberada' as const });
  const [editingForklift, setEditingForklift] = useState<Forklift | null>(null);
  const [newCheckItem, setNewCheckItem] = useState({ name: '', type: 'boolean' as const, unit: '', active: true, showStatusSelection: true, order: 0 });
  const [editingCheckItem, setEditingCheckItem] = useState<CheckItem | null>(null);
  const [checklistResults, setChecklistResults] = useState<Record<string, { 
    value: any; 
    status: 'normal' | 'anormal'; 
    observation?: string; 
    mediaUrl?: string; 
    fileName?: string;
    fileSizeKb?: number;
  }>>({});
  const [checklistNotes, setChecklistNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [draftDocId, setDraftDocId] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState<'saved' | 'saving' | 'offline'>('saved');
  const [generatingPdfId, setGeneratingPdfId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string, type: 'forklift' | 'item' | 'checklist', title: string; userId?: string } | null>(null);
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
    onConfirm?: () => void;
    showConfirmButton?: boolean;
    confirmText?: string;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'success'
  });

  // Camera & Photo Capture States
  const [activeCameraCapture, setActiveCameraCapture] = useState<{
    itemId: string;
    itemTitle: string;
  } | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [viewingPhotoModal, setViewingPhotoModal] = useState<{ url: string; title: string } | null>(null);

  const closeModal = () => setModalConfig(prev => ({ ...prev, isOpen: false }));

  // Helper: Compress and resize image file to maintain high visual clarity while keeping payload under ~40-60KB
  const compressImageFile = (
    file: File | Blob, 
    maxDimension = 800, 
    initialQuality = 0.65
  ): Promise<{ dataUrl: string; sizeKb: number }> => {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) {
        if (file.size > 5 * 1024 * 1024) {
          reject(new Error('Vídeos ou arquivos não-imagem devem ter no máximo 5MB.'));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const res = reader.result as string;
          const kb = Math.round((res.length * 0.75) / 1024);
          resolve({ dataUrl: res, sizeKb: kb });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
        return;
      }

      const img = new Image();
      const reader = new FileReader();
      reader.onload = (e) => {
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          // Scale down to maxDimension (e.g. 800px)
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            const raw = reader.result as string;
            resolve({ dataUrl: raw, sizeKb: Math.round((raw.length * 0.75) / 1024) });
            return;
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          // Optimized compression for ultra-lightweight Firestore storage
          let quality = initialQuality;
          let dataUrl = canvas.toDataURL('image/jpeg', quality);
          let estimatedKb = Math.round((dataUrl.length * 0.75) / 1024);

          // If still over 65KB, adjust quality slightly to keep file ultra-light
          if (estimatedKb > 65 && quality > 0.45) {
            quality = 0.50;
            dataUrl = canvas.toDataURL('image/jpeg', quality);
            estimatedKb = Math.round((dataUrl.length * 0.75) / 1024);
          }

          resolve({ dataUrl, sizeKb: estimatedKb });
        };
        img.onerror = () => {
          const raw = reader.result as string;
          resolve({ dataUrl: raw, sizeKb: Math.round((raw.length * 0.75) / 1024) });
        };
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Live Camera Lifecycle Hook
  useEffect(() => {
    if (!activeCameraCapture) {
      if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
        setCameraStream(null);
      }
      setCameraError(null);
      return;
    }

    let isMounted = true;
    async function startCam() {
      try {
        setCameraError(null);
        if (cameraStream) {
          cameraStream.getTracks().forEach(t => t.stop());
        }
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: cameraFacing },
              width: { ideal: 1920 },
              height: { ideal: 1080 }
            },
            audio: false
          });
        } catch {
          // Fallback to default camera
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
          });
        }

        if (!isMounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        setCameraStream(stream);
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream;
        }
      } catch (err: any) {
        console.error("Camera access error:", err);
        if (isMounted) {
          const errStr = String(err?.message || err || '').toLowerCase();
          if (errStr.includes('notallowed') || errStr.includes('permission')) {
            setCameraError("Acesso à câmera foi negado nas permissões do seu navegador. Por favor, libere a permissão de câmera ou selecione uma foto do dispositivo.");
          } else if (errStr.includes('notfound') || errStr.includes('device not found') || errStr.includes('requested device')) {
            setCameraError("Nenhuma câmera foi encontrada neste dispositivo. Você pode selecionar a foto diretamente da galeria.");
          } else {
            setCameraError("Não foi possível carregar a transmissão de vídeo da câmera. Você pode usar a câmera nativa do celular ou a galeria.");
          }
        }
      }
    }

    startCam();

    return () => {
      isMounted = false;
    };
  }, [activeCameraCapture, cameraFacing]);

  // Capture frame from Live Camera Viewfinder
  const handleCaptureFromCamera = async () => {
    if (!cameraVideoRef.current || !activeCameraCapture) return;
    const video = cameraVideoRef.current;
    
    let width = video.videoWidth || 1280;
    let height = video.videoHeight || 720;
    const maxDimension = 800;

    if (width > maxDimension || height > maxDimension) {
      if (width > height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    let quality = 0.65;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);
    let sizeKb = Math.round((dataUrl.length * 0.75) / 1024);
    if (sizeKb > 65) {
      quality = 0.50;
      dataUrl = canvas.toDataURL('image/jpeg', quality);
      sizeKb = Math.round((dataUrl.length * 0.75) / 1024);
    }

    const itemId = activeCameraCapture.itemId;
    setChecklistResults(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        mediaUrl: dataUrl,
        fileSizeKb: sizeKb,
        fileName: `foto_inspecao_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '_')}.jpg`
      }
    }));

    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      setCameraStream(null);
    }
    setActiveCameraCapture(null);
  };

  // Load draft when opening check modal
  useEffect(() => {
    if (showCheckModal && auth.currentUser) {
      const loadDraft = async () => {
        try {
          const q = query(
            collection(db, 'forklift_drafts'),
            where('forkliftId', '==', showCheckModal.id),
            where('conductorId', '==', auth.currentUser!.uid)
          );
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            const draftDoc = snapshot.docs[0];
            const data = draftDoc.data();
            setChecklistResults(data.itemResults || {});
            setChecklistNotes(data.notes || '');
            setDraftDocId(draftDoc.id);
          } else {
            // No draft exists! This is a fresh inspection.
            // Check the previous checklist for any pending items (status === 'anormal')
            const prevChecklist = checklists.find(c => c.forkliftId === showCheckModal.id);
            if (prevChecklist && prevChecklist.itemResults) {
              const prefilled: Record<string, any> = {};
              Object.entries(prevChecklist.itemResults).forEach(([itemId, result]: [string, any]) => {
                if (result.status === 'anormal') {
                  prefilled[itemId] = {
                    value: result.value !== undefined ? result.value : (checkItems.find(i => i.id === itemId)?.type === 'boolean' ? false : 'anormal'),
                    status: 'anormal',
                    observation: result.observation || 'Pendência anterior ainda não resolvida'
                  };
                }
              });
              setChecklistResults(prefilled);
            } else {
              setChecklistResults({});
            }
            setChecklistNotes('');
            setDraftDocId(null);
          }
        } catch (err) {
          console.error("Error loading draft:", err);
        }
      };
      loadDraft();
    }
  }, [showCheckModal, checklists, checkItems]);

  // Auto-save progress
  useEffect(() => {
    let timeout: any;
    if (showCheckModal && auth.currentUser && (Object.keys(checklistResults).length > 0 || checklistNotes)) {
      setSavingStatus('saving');
      timeout = setTimeout(async () => {
        try {
          const draftData = {
            forkliftId: showCheckModal.id,
            forkliftNumber: showCheckModal.number,
            conductorId: auth.currentUser!.uid,
            conductorName: profile?.displayName || auth.currentUser!.email,
            itemResults: checklistResults,
            notes: checklistNotes,
            updatedAt: serverTimestamp(),
            status: 'draft'
          };

          if (draftDocId) {
            await updateDoc(doc(db, 'forklift_drafts', draftDocId), draftData);
          } else {
            const newDoc = await addDoc(collection(db, 'forklift_drafts'), {
              ...draftData,
              createdAt: serverTimestamp()
            });
            setDraftDocId(newDoc.id);
          }
          setSavingStatus('saved');
        } catch (err) {
          console.error("Error auto-saving:", err);
          setSavingStatus('offline');
        }
      }, 1000); // Debounce 1s
    }
    return () => clearTimeout(timeout);
  }, [checklistResults, checklistNotes, showCheckModal]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, itemId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { dataUrl, sizeKb } = await compressImageFile(file, 800, 0.65);
      setChecklistResults(prev => ({
        ...prev,
        [itemId]: {
          ...prev[itemId],
          mediaUrl: dataUrl,
          fileSizeKb: sizeKb,
          fileName: file.name || 'evidencia_inspecao.jpg'
        }
      }));
    } catch (err: any) {
      console.error("Error processing file:", err);
      setModalConfig({
        isOpen: true,
        title: 'Erro no arquivo',
        message: err.message || 'Não foi possível processar a imagem selecionada. Tente outra foto.',
        type: 'warning'
      });
    }
  };

  useEffect(() => {
    const qF = query(collection(db, 'forklifts'), orderBy('number'));
    const unsubscribeF = onSnapshot(qF, (snapshot) => {
      setForklifts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Forklift)));
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'forklifts');
      setLoading(false);
    });

    const qI = query(collection(db, 'forklift_check_items'), orderBy('order'));
    const unsubscribeI = onSnapshot(qI, (snapshot) => {
      setCheckItems(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as CheckItem)));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'forklift_check_items');
    });

    const qC = query(collection(db, 'forklift_checklists'), orderBy('timestamp', 'desc'));
    const unsubscribeC = onSnapshot(qC, (snapshot) => {
      setChecklists(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Checklist)));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'forklift_checklists');
    });

    return () => {
      unsubscribeF();
      unsubscribeI();
      unsubscribeC();
    };
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'global'), (doc) => {
      if (doc.exists()) {
        setSettings(doc.data() as GlobalSettings);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'settings/global');
    });
    return () => unsub();
  }, []);

  const sendTestEmail = async () => {
    if (!settings.responsiblePersons || settings.responsiblePersons.length === 0) {
      setModalConfig({
        isOpen: true,
        title: 'Atenção',
        message: 'Adicione pelo menos um responsável primeiro.',
        type: 'warning'
      });
      return;
    }
    
    setTestingEmail(true);
    let automaticSent = false;
    let errorMessage = '';

    try {
      const idToken = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/send-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          recipients: settings.responsiblePersons,
          forkliftNumber: "TESTE-001 (E-mail de Teste)",
          conductorName: profile?.displayName || auth.currentUser?.email || 'Administrador',
          failures: [
            { name: 'Motor de Partida', observation: 'Ruído excessivo detectado no acionamento (Exemplo de Teste).' }
          ],
          localTime: new Date().toLocaleString('pt-BR')
        })
      });

      const resData = await response.json();
      if (resData.success) {
        automaticSent = true;
        setModalConfig({
          isOpen: true,
          title: 'E-mail de Teste Enviado!',
          message: `O servidor enviou automaticamente o e-mail de teste com sucesso para os seguintes responsáveis: ${settings.responsiblePersons.map(p => p.email).join(', ')}.`,
          type: 'success'
        });
      } else {
        errorMessage = resData.message || resData.error || '';
        console.warn("Automatic test email returned success=false:", errorMessage);
      }
    } catch (err: any) {
      errorMessage = err.message || '';
      console.error("Error sending automatic test email:", err);
    }

    if (!automaticSent) {
      setModalConfig({
        isOpen: true,
        title: 'Envio Direto Indisponível',
        message: `Não foi possível enviar o e-mail de teste automaticamente em segundo plano (${errorMessage || 'sem variáveis GMAIL_USER/RESEND_API_KEY configuradas no servidor'}).`,
        type: 'warning'
      });
      setTestingEmail(false);
    } else {
      setTestingEmail(false);
    }
  };

  const handleUpdateSettings = async (newSettings: Partial<GlobalSettings>) => {
    if (!isAdmin && !isManager) return;
    try {
      await setDoc(doc(db, 'settings', 'global'), {
        ...settings,
        ...newSettings,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid
      }, { merge: true });
    } catch (err) {
      console.error("Error updating settings:", err);
    }
  };

  const handleOpenEditForklift = (forklift: Forklift) => {
    setEditingForklift(forklift);
    setNewForklift({ 
      number: forklift.number, 
      sector: forklift.sector, 
      status: forklift.status 
    });
    setShowForkliftModal(true);
  };

  const handleSubmitForklift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin && !isManager) return;
    setSubmitting(true);
    try {
      if (editingForklift) {
        await updateDoc(doc(db, 'forklifts', editingForklift.id), {
          ...newForklift,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'forklifts'), {
          ...newForklift,
          createdBy: auth.currentUser?.uid,
          createdAt: serverTimestamp()
        });
      }
      setNewForklift({ number: '', sector: '', status: 'liberada' });
      setEditingForklift(null);
      setShowForkliftModal(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddCheckItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin && !isManager) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'forklift_check_items'), {
        ...newCheckItem,
        order: checkItems.length,
        createdAt: serverTimestamp(),
        addedBy: auth.currentUser?.uid
      });
      setNewCheckItem({ name: '', type: 'boolean', unit: '', active: true, showStatusSelection: true, order: 0 });
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateCheckItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCheckItem || (!isAdmin && !isManager)) return;
    setSubmitting(true);
    try {
      await updateDoc(doc(db, 'forklift_check_items', editingCheckItem.id), {
        name: editingCheckItem.name,
        type: editingCheckItem.type,
        unit: editingCheckItem.unit || '',
        showStatusSelection: editingCheckItem.showStatusSelection ?? true,
        updatedAt: serverTimestamp()
      });
      setEditingCheckItem(null);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const deleteForklift = async (id: string) => {
    if (!isAdmin && !isManager) return;
    setSubmitting(true);
    try {
      await deleteDoc(doc(db, 'forklifts', id));
      setDeleteConfirm(null);
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.DELETE, `forklifts/${id}`);
    } finally {
      setSubmitting(false);
    }
  };

  const deleteCheckItem = async (id: string) => {
    if (!isAdmin && !isManager) return;
    setSubmitting(true);
    try {
      await deleteDoc(doc(db, 'forklift_check_items', id));
      setDeleteConfirm(null);
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.DELETE, `forklift_check_items/${id}`);
    } finally {
      setSubmitting(false);
    }
  };

  const deleteChecklist = async (id: string, logUserId?: string) => {
    const isOwner = !!(logUserId && auth.currentUser?.uid && logUserId === auth.currentUser.uid);
    if (!isAdmin && !isManager && !isMaster && !isOwner) return;
    setSubmitting(true);
    try {
      await deleteDoc(doc(db, 'forklift_checklists', id));
      setDeleteConfirm(null);
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.DELETE, `forklift_checklists/${id}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleItemActive = async (item: CheckItem) => {
    await updateDoc(doc(db, 'forklift_check_items', item.id), {
      active: !item.active
    });
  };

  const handleReorderItems = async (newOrder: CheckItem[]) => {
    setCheckItems(newOrder);
    try {
      const batch = writeBatch(db);
      newOrder.forEach((item, index) => {
        if (item.order !== index) {
          const itemRef = doc(db, 'forklift_check_items', item.id);
          batch.update(itemRef, { order: index });
        }
      });
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'forklift_check_items');
    }
  };

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
        docPdf.text('| Sistema de Gestao Operacional', textStartX, footerY + 0.8);
      } else {
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(8);
        docPdf.setTextColor(5, 150, 105); // emerald-600
        docPdf.text('SecApp', textStartX, footerY + 0.8);

        const secAppWidth = docPdf.getTextWidth('SecApp');
        docPdf.setFont('helvetica', 'normal');
        docPdf.setTextColor(148, 163, 184); // slate-400
        docPdf.text(' | Sistema de Gestao Operacional', textStartX + secAppWidth, footerY + 0.8);
      }

      // Page numbers on right
      docPdf.text(`Pagina ${pageNum} de ${totalPages}`, pageWidth - 15, footerY + 0.8, { align: 'right' });
    }
  };

  // Generate Individual Forklift Checklist Inspection PDF (Standardized Theme matching Stops Control)
  const handleExportChecklistPdf = async (checklist: Checklist) => {
    setGeneratingPdfId(checklist.id);
    try {
      const docPdf = new jsPDF();
      const pageWidth = docPdf.internal.pageSize.getWidth();
      const pageHeight = docPdf.internal.pageSize.getHeight();

      // Header styling - Standardized Emerald Theme
      docPdf.setFillColor(5, 150, 105); // emerald-600
      docPdf.rect(0, 0, pageWidth, 40, 'F');

      // Title
      docPdf.setTextColor(255, 255, 255);
      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(18);
      docPdf.text(sanitizePdfText('RELATÓRIO DE INSPEÇÃO DE EMPILHADEIRA'), 15, 22);

      // Subtitle / Generation time
      docPdf.setFontSize(9);
      docPdf.setFont('helvetica', 'normal');
      docPdf.setTextColor(190, 242, 219); // emerald-100
      docPdf.text(sanitizePdfText(`Gerado em: ${new Date().toLocaleString('pt-BR')}`), 15, 32);

      // Status pill badge on the top right
      const isConform = checklist.status === 'normal';
      if (isConform) {
        docPdf.setFillColor(255, 255, 255);
        docPdf.roundedRect(pageWidth - 55, 14, 40, 12, 2, 2, 'F');
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(9.5);
        docPdf.setTextColor(5, 150, 105);
        docPdf.text('LIBERADA (OK)', pageWidth - 35, 21.5, { align: 'center' });
      } else {
        docPdf.setFillColor(254, 226, 226);
        docPdf.roundedRect(pageWidth - 60, 14, 45, 12, 2, 2, 'F');
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(9.5);
        docPdf.setTextColor(225, 29, 72);
        docPdf.text('BLOQUEADA (NC)', pageWidth - 37.5, 21.5, { align: 'center' });
      }

      // Section 1: Informações Gerais da Inspeção
      docPdf.setTextColor(5, 150, 105);
      docPdf.setFontSize(13);
      docPdf.setFont('helvetica', 'bold');
      docPdf.text(sanitizePdfText('Informações Gerais da Inspeção'), 15, 53);

      const dateFormatted = format(safeToDate(checklist.timestamp) || new Date(), 'dd/MM/yyyy HH:mm');
      const dayOfWeek = format(safeToDate(checklist.timestamp) || new Date(), "EEEE", { locale: ptBR });
      const matchedForklift = forklifts.find(f => f.id === checklist.forkliftId || f.number === checklist.forkliftNumber);
      const sectorName = matchedForklift?.sector || 'Operação Geral';

      const generalData = [
        [
          sanitizePdfText('Equipamento:'),
          sanitizePdfText(checklist.forkliftNumber),
          sanitizePdfText('Data e Hora:'),
          `${dateFormatted} (${sanitizePdfText(dayOfWeek)})`
        ],
        [
          sanitizePdfText('Condutor/Inspetor:'),
          sanitizePdfText(checklist.conductorName || 'Não informado'),
          sanitizePdfText('Turno / Letra:'),
          `Turno ${sanitizePdfText(checklist.shift || 'N/A')} - Letra ${sanitizePdfText(checklist.group || 'N/A')}`
        ],
        [
          sanitizePdfText('Setor / Área:'),
          sanitizePdfText(sectorName),
          sanitizePdfText('Status Geral:'),
          isConform ? 'CONFORME / LIBERADA' : 'ANORMAL / BLOQUEADA'
        ]
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

      // Section 2: Itens Inspecionados e Conformidade
      let currentY = (docPdf as any).lastAutoTable.finalY + 8;
      docPdf.setTextColor(5, 150, 105);
      docPdf.setFontSize(13);
      docPdf.setFont('helvetica', 'bold');
      docPdf.text(sanitizePdfText('Itens Inspecionados e Conformidade'), 15, currentY);

      // Prepare items inspection table body
      const tableRows: any[] = [];
      const itemEntries = Object.entries(checklist.itemResults || {});
      const photosToRender: { itemName: string; url: string; observation?: string; status: string }[] = [];

      itemEntries.forEach(([itemId, res], index) => {
        const matchedItem = checkItems.find(i => i.id === itemId);
        const itemName = matchedItem?.name || `Item ${index + 1}`;
        const unit = matchedItem?.unit ? ` ${matchedItem.unit}` : '';

        let formattedValue = '';
        if (typeof res.value === 'boolean') {
          formattedValue = res.value ? 'OK' : 'NÃO OK';
        } else if (res.value === 'normal') {
          formattedValue = 'Normal';
        } else if (res.value === 'anormal') {
          formattedValue = 'Anormal';
        } else if (res.value === 'open') {
          formattedValue = 'Aberto';
        } else if (res.value === 'closed') {
          formattedValue = 'Fechado';
        } else {
          formattedValue = `${res.value ?? '-'}${unit}`;
        }

        const isItemNormal = res.status === 'normal';
        const obs = res.observation ? sanitizePdfText(res.observation) : '-';

        tableRows.push([
          (index + 1).toString(),
          sanitizePdfText(itemName),
          sanitizePdfText(formattedValue),
          isItemNormal ? 'NORMAL / OK' : 'ANORMAL',
          obs
        ]);

        if (res.mediaUrl && (res.mediaUrl.startsWith('data:image') || res.mediaUrl.startsWith('http'))) {
          photosToRender.push({
            itemName,
            url: res.mediaUrl,
            observation: res.observation,
            status: res.status
          });
        }
      });

      if (tableRows.length === 0) {
        tableRows.push(['-', 'Nenhum item registrado nesta inspeção', '-', '-', '-']);
      }

      autoTable(docPdf, {
        startY: currentY + 4,
        margin: { left: 15, right: 15 },
        head: [[sanitizePdfText('#'), sanitizePdfText('Item Avaliado'), sanitizePdfText('Valor Registrado'), sanitizePdfText('Condição'), sanitizePdfText('Observações')]],
        body: tableRows,
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 2.5, overflow: 'linebreak' },
        headStyles: {
          fillColor: [5, 150, 105], // emerald-600
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8.5,
          halign: 'left'
        },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 60 },
          2: { cellWidth: 35 },
          3: { cellWidth: 32, fontStyle: 'bold' },
          4: { cellWidth: 43 }
        },
        didParseCell: (data) => {
          if (data.section === 'body') {
            if (data.column.index === 3) {
              const cellText = String(data.cell.raw || '');
              if (cellText.includes('ANORMAL')) {
                data.cell.styles.textColor = [225, 29, 72]; // rose-600
                data.cell.styles.fontStyle = 'bold';
              } else {
                data.cell.styles.textColor = [5, 150, 105]; // emerald-600
              }
            }
          }
        }
      });

      currentY = (docPdf as any).lastAutoTable.finalY + 8;

      // Section 3: Observações do Condutor
      if (checklist.notes && checklist.notes.trim()) {
        if (currentY + 28 > pageHeight - 20) {
          docPdf.addPage();
          currentY = 20;
        }

        docPdf.setTextColor(5, 150, 105);
        docPdf.setFontSize(13);
        docPdf.setFont('helvetica', 'bold');
        docPdf.text(sanitizePdfText('Observações Adicionais do Condutor'), 15, currentY);

        currentY += 5;

        docPdf.setFillColor(248, 250, 252);
        docPdf.setDrawColor(226, 232, 240);
        docPdf.roundedRect(15, currentY, pageWidth - 30, 20, 2, 2, 'FD');

        docPdf.setFont('helvetica', 'normal');
        docPdf.setFontSize(8.5);
        docPdf.setTextColor(30, 41, 59);
        const splitNotes = docPdf.splitTextToSize(sanitizePdfText(checklist.notes), pageWidth - 36);
        docPdf.text(splitNotes, 18, currentY + 7);

        currentY += 26;
      }

      // Section 4: Evidências Fotográficas Anexadas
      if (photosToRender.length > 0) {
        if (currentY + 55 > pageHeight - 20) {
          docPdf.addPage();
          currentY = 20;
        }

        docPdf.setTextColor(5, 150, 105);
        docPdf.setFontSize(13);
        docPdf.setFont('helvetica', 'bold');
        docPdf.text(sanitizePdfText('Evidências Fotográficas Anexadas'), 15, currentY);

        currentY += 6;

        let photoX = 15;
        const photoWidth = 56;
        const photoHeight = 42;

        for (let i = 0; i < photosToRender.length; i++) {
          const photo = photosToRender[i];

          if (photoX + photoWidth > pageWidth - 15) {
            photoX = 15;
            currentY += photoHeight + 14;
          }

          if (currentY + photoHeight + 14 > pageHeight - 20) {
            docPdf.addPage();
            currentY = 20;
            photoX = 15;
          }

          // Photo header label
          docPdf.setFont('helvetica', 'bold');
          docPdf.setFontSize(7.5);
          docPdf.setTextColor(51, 65, 85);
          docPdf.text(sanitizePdfText(photo.itemName), photoX, currentY);

          try {
            docPdf.addImage(photo.url, 'JPEG', photoX, currentY + 2, photoWidth, photoHeight);
            docPdf.setDrawColor(203, 213, 225);
            docPdf.rect(photoX, currentY + 2, photoWidth, photoHeight, 'S');

            // Status tag below image
            docPdf.setFont('helvetica', 'normal');
            docPdf.setFontSize(7);
            if (photo.status === 'normal') {
              docPdf.setTextColor(5, 150, 105);
              docPdf.text('Status: Normal/OK', photoX, currentY + photoHeight + 5.5);
            } else {
              docPdf.setTextColor(225, 29, 72);
              docPdf.text('Status: Anormal', photoX, currentY + photoHeight + 5.5);
            }
          } catch (imgErr) {
            console.warn('Erro ao inserir foto no PDF:', imgErr);
            docPdf.setFont('helvetica', 'italic');
            docPdf.setFontSize(7);
            docPdf.setTextColor(148, 163, 184);
            docPdf.text('[Foto indisponível para visualização]', photoX, currentY + 15);
          }

          photoX += photoWidth + 6;
        }

        currentY += photoHeight + 14;
      }

      // Add branding footer
      await addSecAppPdfFooter(docPdf);

      // File name format: Checklist_Empilhadeira_[NUM]_[DATA].pdf
      const safeNum = checklist.forkliftNumber.replace(/[^a-zA-Z0-9]/g, '_');
      const safeDateStr = format(safeToDate(checklist.timestamp) || new Date(), 'yyyyMMdd_HHmm');
      docPdf.save(`Checklist_Empilhadeira_${safeNum}_${safeDateStr}.pdf`);
    } catch (pdfErr) {
      console.error('Erro ao gerar PDF do checklist:', pdfErr);
      setModalConfig({
        isOpen: true,
        title: 'Erro na Geração do PDF',
        message: 'Não foi possível gerar o relatório PDF desta inspeção. Tente novamente.',
        type: 'error'
      });
    } finally {
      setGeneratingPdfId(null);
    }
  };

  // Generate Landscape General Report PDF for all Forklift Inspections
  const handleExportAllChecklistsPdf = async () => {
    try {
      const docPdf = new jsPDF('landscape');
      
      // Header styling - Standardized Emerald Theme
      docPdf.setFillColor(5, 150, 105); // emerald-600
      docPdf.rect(0, 0, 297, 35, 'F');
      
      docPdf.setTextColor(255, 255, 255);
      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(18);
      docPdf.text(sanitizePdfText('INSPEÇÕES DE EMPILHADEIRAS - RELATÓRIO GERAL'), 15, 18);
      
      docPdf.setFontSize(9);
      docPdf.setFont('helvetica', 'normal');
      docPdf.setTextColor(190, 242, 219); // emerald-100
      docPdf.text(sanitizePdfText(`Total de Registros: ${checklists.length} inspeções realizadas`), 15, 27);
      docPdf.text(sanitizePdfText(`Gerado em: ${new Date().toLocaleString('pt-BR')}`), 210, 27);

      const headers = [[
        sanitizePdfText('Data / Hora'),
        sanitizePdfText('Turno / Letra'),
        sanitizePdfText('Equipamento'),
        sanitizePdfText('Setor'),
        sanitizePdfText('Condutor / Responsável'),
        sanitizePdfText('Status'),
        sanitizePdfText('Itens com Anormalidade / Observações')
      ]];

      const body = checklists.map(log => {
        const dateStr = format(safeToDate(log.timestamp) || new Date(), 'dd/MM/yyyy HH:mm');
        const matchedForklift = forklifts.find(f => f.id === log.forkliftId || f.number === log.forkliftNumber);
        const sector = matchedForklift?.sector || 'Geral';
        
        // Find abnormal items
        const abnormalItems: string[] = [];
        Object.entries(log.itemResults || {}).forEach(([itemId, r]: [string, any]) => {
          if (r?.status === 'anormal') {
            const item = checkItems.find(i => i.id === itemId);
            abnormalItems.push(item?.name || 'Item Anormal');
          }
        });

        let notesText = abnormalItems.length > 0 ? `Anormal: ${abnormalItems.join(', ')}` : 'Todos itens conformes';
        if (log.notes && log.notes.trim()) {
          notesText += ` | Obs: ${log.notes.trim()}`;
        }

        return [
          dateStr,
          `Turno ${log.shift} - ${log.group}`,
          sanitizePdfText(log.forkliftNumber),
          sanitizePdfText(sector),
          sanitizePdfText(log.conductorName),
          log.status === 'normal' ? 'LIBERADA (OK)' : 'BLOQUEADA (NC)',
          sanitizePdfText(notesText)
        ];
      });

      autoTable(docPdf, {
        startY: 42,
        head: headers,
        body: body,
        theme: 'grid',
        headStyles: { fillColor: [5, 150, 105], textColor: [255, 255, 255], fontSize: 8.5, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2.5 },
        columnStyles: {
          0: { cellWidth: 32 },
          1: { cellWidth: 28 },
          2: { cellWidth: 28 },
          3: { cellWidth: 32 },
          4: { cellWidth: 42 },
          5: { cellWidth: 30, fontStyle: 'bold' },
          6: { cellWidth: 85 }
        },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 5) {
            const val = String(data.cell.raw || '');
            if (val.includes('BLOQUEADA')) {
              data.cell.styles.textColor = [225, 29, 72];
            } else {
              data.cell.styles.textColor = [5, 150, 105];
            }
          }
        }
      });

      // Add SecApp footer branding
      await addSecAppPdfFooter(docPdf);

      docPdf.save(`Relatorio_Geral_Empilhadeiras_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('Erro ao gerar relatório geral em PDF:', err);
      setModalConfig({
        isOpen: true,
        title: 'Erro na Geração do PDF',
        message: 'Não foi possível gerar o relatório geral em PDF. Tente novamente.',
        type: 'error'
      });
    }
  };

  const handleToggleStatus = async (forklift: Forklift) => {
    const newStatus = forklift.status === 'liberada' ? 'bloqueada' : 'liberada';
    try {
      await updateDoc(doc(db, 'forklifts', forklift.id), {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `forklifts/${forklift.id}`);
    }
  };

  const handleFillAllConforming = () => {
    const activeItems = checkItems.filter(i => i.active);
    const newResults = { ...checklistResults };
    activeItems.forEach(item => {
      if (item.type === 'boolean') {
        newResults[item.id] = { ...newResults[item.id], value: true, status: 'normal' };
      } else if (item.type === 'normal_anormal') {
        newResults[item.id] = { ...newResults[item.id], value: 'normal', status: 'normal' };
      } else if (item.type === 'open_closed') {
        newResults[item.id] = { ...newResults[item.id], value: 'closed', status: 'normal' };
      } else if (item.type === 'numeric') {
        if (!newResults[item.id]?.value) {
          newResults[item.id] = { ...newResults[item.id], value: '0', status: 'normal' };
        } else {
          newResults[item.id] = { ...newResults[item.id], status: 'normal' };
        }
      }
    });
    setChecklistResults(newResults);
  };

  const handleSubmitChecklist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !showCheckModal) return;

    if (!auth.currentUser) {
      setModalConfig({
        isOpen: true,
        title: 'Sessão Expirada',
        message: 'Você precisa estar autenticado para salvar o check-list. Por favor, recarregue a página ou faça login novamente.',
        type: 'error'
      });
      return;
    }

    const activeItems = checkItems.filter(i => i.active);
    const unansweredItems = activeItems.filter(item => {
      const res = checklistResults[item.id];
      if (!res) return true;
      if (item.type === 'boolean') return typeof res.value !== 'boolean';
      if (item.type === 'normal_anormal') return !res.value;
      if (item.type === 'open_closed') return !res.value;
      if (item.type === 'numeric') return res.value === undefined || res.value === null || res.value === '';
      return false;
    });

    if (unansweredItems.length > 0) {
      setModalConfig({
        isOpen: true,
        title: 'Itens Pendentes',
        message: `Existem ${unansweredItems.length} item(ns) sem resposta no checklist:\n\n• ${unansweredItems.map(i => i.name).slice(0, 4).join('\n• ')}${unansweredItems.length > 4 ? `\n• ... e mais ${unansweredItems.length - 4} item(ns)` : ''}\n\nPor favor, preencha todos os itens antes de finalizar.`,
        type: 'warning'
      });

      // Focus and scroll to first missing item
      const firstId = unansweredItems[0].id;
      setTimeout(() => {
        const el = document.getElementById(`check-item-${firstId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      return;
    }
    
    const currentShift = getCurrentShift();
    const groupOnScale = getGroupForShift(new Date(), currentShift);
    const conductorGroup = (profile?.group as Group) || groupOnScale;

    setSubmitting(true);
    const savedForkliftNumber = showCheckModal.number;
    try {
      const sanitizedItemResults: Record<string, any> = {};
      activeItems.forEach(item => {
        const res = checklistResults[item.id];
        if (res) {
          const itemPayload: Record<string, any> = {
            value: res.value !== undefined ? res.value : 'normal',
            status: res.status || 'normal'
          };
          if (res.observation && typeof res.observation === 'string' && res.observation.trim()) {
            itemPayload.observation = res.observation.trim();
          }
          if (res.mediaUrl && typeof res.mediaUrl === 'string') {
            itemPayload.mediaUrl = res.mediaUrl;
          }
          if (res.fileName && typeof res.fileName === 'string') {
            itemPayload.fileName = res.fileName;
          }
          if (typeof res.fileSizeKb === 'number') {
            itemPayload.fileSizeKb = res.fileSizeKb;
          }
          sanitizedItemResults[item.id] = itemPayload;
        }
      });

      const hasAnormal = Object.values(sanitizedItemResults).some((r: any) => r.status === 'anormal');
      const overallStatus = hasAnormal ? 'anormal' : 'normal';

      const checklistPayload = {
        forkliftId: showCheckModal.id,
        forkliftNumber: showCheckModal.number,
        conductorId: auth.currentUser.uid,
        conductorName: profile?.displayName || auth.currentUser.email || 'Condutor',
        shift: currentShift,
        group: conductorGroup,
        scaleGroup: groupOnScale,
        status: overallStatus,
        itemResults: sanitizedItemResults,
        notes: checklistNotes ? checklistNotes.trim() : '',
        timestamp: serverTimestamp()
      };

      const checklistRef = await addDoc(collection(db, 'forklift_checklists'), checklistPayload);

      if (overallStatus === 'anormal') {
        if (settings.autoLockOnNonConformity) {
          try {
            await updateDoc(doc(db, 'forklifts', showCheckModal.id), {
              status: 'bloqueada',
              updatedAt: serverTimestamp()
            });
          } catch (lockErr) {
            console.error("Erro ao bloquear empilhadeira automaticamente:", lockErr);
          }
        }
        
        if (settings.autoNotifyNonConformity) {
          // Identify specific failures
          const failures = Object.entries(sanitizedItemResults)
            .filter(([_, result]: [string, any]) => result.status === 'anormal')
            .map(([itemId, result]: [string, any]) => {
              const item = checkItems.find(i => i.id === itemId);
              return {
                name: item?.name || 'Item desconhecido',
                observation: result.observation || 'Sem observação.'
              };
            });

          // Build recipients list: current logged-in conductor FIRST, followed by other configured responsible persons (no duplicates)
          const responsibleList: Array<{ name: string; email: string }> = [];
          const currentEmail = (auth.currentUser?.email || profile?.email || '').trim().toLowerCase();
          const currentName = profile?.displayName || auth.currentUser?.displayName || auth.currentUser?.email || 'Condutor';

          if (currentEmail) {
            responsibleList.push({ name: currentName, email: currentEmail });
          }

          (settings.responsiblePersons || []).forEach(p => {
            const pEmail = (p.email || '').trim().toLowerCase();
            if (pEmail && !responsibleList.some(r => r.email.toLowerCase() === pEmail)) {
              responsibleList.push({ name: p.name || p.email, email: pEmail });
            }
          });

          const responsibleSummary = responsibleList.length > 0 
            ? `Cliente de e-mail do aparelho pronto para os responsáveis: ${responsibleList.map(p => p.email).join(', ')}.`
            : 'Nenhum responsável cadastrado para receber e-mail.';

          const notificationMessage = `Não conformidade detectada no equipamento ${showCheckModal.number} por ${profile?.displayName || auth.currentUser.email}. Itens: ${failures.map(f => f.name).join(', ')}`;

          try {
            await addDoc(collection(db, 'notifications'), {
              type: 'non_conformity',
              message: notificationMessage,
              forkliftNumber: showCheckModal.number,
              checklistId: checklistRef.id,
              read: false,
              createdAt: serverTimestamp(),
              recipients: responsibleList,
              failures
            });
          } catch (notifErr) {
            console.warn("Notification doc creation note:", notifErr);
          }

          // Send automatic server-side notification if configured, fallback to client-side mailto if it fails or returns success: false
          let automaticSent = false;
          let errorMessage = '';

          if (responsibleList.length > 0) {
            try {
              const idToken = await auth.currentUser?.getIdToken();
              const response = await fetch('/api/send-notification', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                  recipients: responsibleList,
                  forkliftNumber: showCheckModal.number,
                  conductorName: profile?.displayName || auth.currentUser.email || 'Condutor',
                  failures: failures,
                  localTime: new Date().toLocaleString('pt-BR')
                })
              });
              const resData = await response.json();
              if (resData.success) {
                automaticSent = true;
                console.log("Automatic email sent successfully via server API");
              } else {
                errorMessage = resData.message || resData.error || '';
                console.warn("Server email API returned success=false:", errorMessage);
              }
            } catch (err: any) {
              errorMessage = err.message || '';
              console.error("Error calling server email API:", err);
            }

          }
          
          const notificationSummary = automaticSent 
            ? `Notificação por e-mail enviada automaticamente pelo servidor para os responsáveis.`
            : `O alerta de não conformidade foi registrado no sistema (Notificações).`;

          setModalConfig({
            isOpen: true,
            title: 'Inconformidade Detectada',
            message: `${settings.autoLockOnNonConformity ? 'Check-list finalizado com Não Conformidade! Equipamento BLOQUEADO.' : 'Check-list finalizado com Não Conformidade!'}\n\n${notificationSummary}`,
            type: 'warning'
          });
        } else {
          setModalConfig({
            isOpen: true,
            title: 'Não Conformidade',
            message: 'Check-list finalizado com Não Conformidade!',
            type: 'warning'
          });
        }
      } else {
        setModalConfig({
          isOpen: true,
          title: 'Check-list Enviado',
          message: `O check-list do equipamento ${savedForkliftNumber} foi salvo com sucesso. Equipamento LIBERADO!`,
          type: 'success'
        });
      }

      setShowCheckModal(null);
      setChecklistResults({});
      setChecklistNotes('');
      setActiveTab('history');

      if (draftDocId) {
        try {
          await deleteDoc(doc(db, 'forklift_drafts', draftDocId));
          setDraftDocId(null);
        } catch (draftErr) {
          console.warn("Draft cleanup note:", draftErr);
        }
      }
    } catch (err: any) {
      console.error("Erro ao salvar checklist:", err);
      handleFirestoreError(err, OperationType.CREATE, 'forklift_checklists');
      setModalConfig({
        isOpen: true,
        title: 'Erro ao Salvar Check-list',
        message: err.message || 'Ocorreu um erro ao gravar as informações no banco de dados. Verifique a conexão e tente novamente.',
        type: 'error'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredForklifts = forklifts.filter(f => 
    f.number.toLowerCase().includes(search.toLowerCase()) || 
    f.sector.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <Truck className="w-10 h-10 text-emerald-600" />
            Check-list de Empilhadeiras
          </h2>
          <p className="text-slate-500 font-medium">Gestão de equipamentos e inspeções de segurança</p>
        </div>

        <div className="flex items-center gap-2">
           <div className="relative">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
             <input 
              type="text" 
              placeholder="Buscar equipamento..."
              className="pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-sm focus:ring-4 focus:ring-emerald-50 outline-none w-64 transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
             />
           </div>
           {(isAdmin || isManager) && (
             <button 
              onClick={() => setShowConfigModal(true)}
              className="p-2.5 bg-white border border-slate-200 rounded-2xl text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
              title="Configurações"
             >
               <Settings2 className="w-5 h-5" />
             </button>
           )}
        </div>
      </div>

      <div className="flex items-center gap-4 p-1.5 bg-slate-100 rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab('checklists')}
          className={cn(
            "px-6 py-2 rounded-xl text-sm font-bold transition-all",
            activeTab === 'checklists' ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
        >
          Check-list Online
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={cn(
            "px-6 py-2 rounded-xl text-sm font-bold transition-all",
            activeTab === 'history' ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
        >
          Histórico
        </button>
        {(isAdmin || isManager) && (
          <button
            onClick={() => setActiveTab('admin')}
            className={cn(
              "px-6 py-2 rounded-xl text-sm font-bold transition-all",
              activeTab === 'admin' ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Equipamentos
          </button>
        )}
      </div>

      <div className="min-h-[400px]">
        {activeTab === 'checklists' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredForklifts.map((forklift, idx) => (
              <motion.div 
                layout
                key={`${forklift.id}-${idx}`}
                className={cn(
                  "bg-white rounded-[2rem] border border-slate-200 p-6 shadow-sm hover:shadow-md transition-all group overflow-hidden relative",
                  forklift.status === 'bloqueada' && "opacity-80 grayscale-[0.5]"
                )}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-14 h-14 rounded-2xl flex items-center justify-center transition-colors",
                      forklift.status === 'liberada' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                    )}>
                      <Truck className="w-8 h-8" />
                    </div>
                    <div>
                      <h4 className="text-xl font-black text-slate-900 tracking-tight">{forklift.number}</h4>
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-widest">
                        <Building2 className="w-3 h-3" />
                        {forklift.sector}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                    <div className={cn("w-2 h-2 rounded-full", forklift.status === 'liberada' ? "bg-emerald-500" : "bg-rose-500")} />
                    <span>Status Operacional:</span>
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ml-1",
                      forklift.status === 'liberada' 
                        ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
                        : "bg-rose-50 text-rose-700 border-rose-100 font-bold"
                    )}>
                      {forklift.status}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (forklift.status === 'bloqueada' && !isAdmin && !isManager) {
                      setModalConfig({
                        isOpen: true,
                        title: 'Acesso Negado',
                        message: 'Este equipamento está bloqueado. Contate a manutenção para liberação.',
                        type: 'error'
                      });
                      return;
                    }
                    setShowCheckModal(forklift);
                  }}
                  className={cn(
                    "w-full py-4 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg transition-all",
                    forklift.status === 'liberada'
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200/50"
                      : "bg-slate-800 hover:bg-slate-900 text-white shadow-slate-200/50"
                  )}
                >
                  <ClipboardCheck className="w-5 h-5" />
                  Realizar Inspeção
                </button>

                <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[8px] font-black text-slate-400 uppercase">Turno Atual</span>
                    <span className="text-xs font-bold text-slate-700">{getCurrentShift()}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[8px] font-black text-slate-400 uppercase">Letra em Escala</span>
                    <div className="w-6 h-6 rounded-lg bg-emerald-500 text-white flex items-center justify-center text-[10px] font-black">
                      {getGroupForShift(new Date(), getCurrentShift())}
                    </div>
                  </div>
                </div>

                {forklift.status === 'bloqueada' && (
                  <div className="absolute top-0 right-0 left-0 bg-rose-500/10 backdrop-blur-[2px] h-full flex items-center justify-center p-6 text-center pointer-events-none group-hover:opacity-0 transition-opacity">
                    <div className="bg-rose-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl">
                      Equipamento Bloqueado
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-[2rem] border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-black">
                  <ClipboardList className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-800">Histórico de Inspeções</h4>
                  <p className="text-xs text-slate-400 font-medium">{checklists.length} inspeções registradas no sistema</p>
                </div>
              </div>
              <button
                onClick={handleExportAllChecklistsPdf}
                disabled={checklists.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-sm transition-all disabled:opacity-50"
                title="Exportar tabela geral de inspeções em PDF"
              >
                <FileOutput className="w-4 h-4 text-emerald-400" />
                Exportar Relatório Geral (PDF)
              </button>
            </div>

            <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 px-6">
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Data e Hora</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Turno/Letra</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Equipamento</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Responsável</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Status</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {checklists.map((log, idx) => (
                    <React.Fragment key={`${log.id}-${idx}`}>
                      <tr 
                        onClick={() => setExpandedChecklistId(expandedChecklistId === log.id ? null : log.id)}
                        className="hover:bg-slate-50/50 transition-colors cursor-pointer group"
                      >
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-900">
                              {format(safeToDate(log.timestamp) || new Date(), 'dd/MM/yyyy HH:mm')}
                            </span>
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                              {format(safeToDate(log.timestamp) || new Date(), "EEEE", { locale: ptBR })}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                           <div className="flex items-center gap-1.5">
                             <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-black uppercase">{log.shift}</span>
                             <span className="w-5 h-5 bg-emerald-500 text-white rounded flex items-center justify-center text-[10px] font-black">{log.group}</span>
                           </div>
                        </td>
                        <td className="px-6 py-4">
                           <div className="flex items-center gap-2">
                             <Truck className="w-4 h-4 text-slate-400" />
                             <span className="text-sm font-black text-slate-700">{log.forkliftNumber}</span>
                           </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <UserIcon className="w-4 h-4 text-slate-400" />
                            <span className="text-sm text-slate-600 font-medium">{log.conductorName}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border",
                            log.status === 'normal' 
                              ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
                              : "bg-rose-50 text-rose-700 border-rose-100"
                          )}>
                            {log.status === 'normal' ? <ShieldCheck className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                            {log.status}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                           <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                             <button
                               onClick={(e) => {
                                 e.stopPropagation();
                                 handleExportChecklistPdf(log);
                               }}
                               disabled={generatingPdfId === log.id}
                               className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 rounded-xl transition-all text-xs font-bold border border-slate-200 hover:border-emerald-200 disabled:opacity-50"
                               title="Gerar e Baixar Relatório PDF desta Inspeção"
                             >
                               {generatingPdfId === log.id ? (
                                 <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                               ) : (
                                 <FileOutput className="w-3.5 h-3.5 text-emerald-600" />
                               )}
                               <span className="hidden sm:inline">PDF</span>
                             </button>

                             {(isAdmin || isManager || isMaster || (log.userId && auth.currentUser?.uid && log.userId === auth.currentUser.uid)) && (
                               <button 
                                 onClick={(e) => {
                                   e.stopPropagation();
                                   setDeleteConfirm({
                                     id: log.id,
                                     userId: log.userId,
                                     type: 'checklist',
                                     title: `Inspeção de ${log.conductorName} (${log.forkliftNumber})`
                                   });
                                 }}
                                 className="p-1 px-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all text-xs font-bold"
                                 title="Excluir Inspeção"
                                >
                                  Excluir
                                </button>
                              )}
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedChecklistId(expandedChecklistId === log.id ? null : log.id);
                                }}
                                className="p-2 text-slate-400 hover:text-emerald-600 transition-colors"
                                title={expandedChecklistId === log.id ? "Recolher detalhes" : "Expandir detalhes"}
                              >
                                {expandedChecklistId === log.id ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                              </button>
                            </div>
                         </td>
                      </tr>
                      <AnimatePresence>
                        {expandedChecklistId === log.id && (
                          <tr>
                            <td colSpan={6} className="px-6 py-0 border-none">
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="py-6 px-10 bg-slate-50/50 rounded-3xl mb-4 border border-slate-100">
                                  <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-200/60">
                                    <div className="flex items-center gap-3">
                                      <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-black text-sm">
                                        <Truck className="w-5 h-5" />
                                      </div>
                                      <div>
                                        <h5 className="text-sm font-black text-slate-800">
                                          Detalhamento da Inspeção - {log.forkliftNumber}
                                        </h5>
                                        <p className="text-xs text-slate-400 font-medium">
                                          Condutor: {log.conductorName} | {format(safeToDate(log.timestamp) || new Date(), 'dd/MM/yyyy HH:mm')}
                                        </p>
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => handleExportChecklistPdf(log)}
                                      disabled={generatingPdfId === log.id}
                                      className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-sm transition-all disabled:opacity-50"
                                    >
                                      {generatingPdfId === log.id ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                      ) : (
                                        <FileOutput className="w-4 h-4" />
                                      )}
                                      Exportar Relatório PDF
                                    </button>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {Object.entries(log.itemResults).map(([itemId, result]: [string, any], itemIdx) => {
                                      const item = checkItems.find(i => i.id === itemId);
                                      return (
                                        <div key={`item-res-${log.id || 'log'}-${itemId}-${itemIdx}`} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                                          <div className="flex items-start justify-between mb-2">
                                            <p className="text-xs font-black text-slate-900 uppercase tracking-tight">{item?.name || 'Item Removido'}</p>
                                            <div className={cn(
                                              "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest",
                                              result.status === 'normal' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                                            )}>
                                              {result.status}
                                            </div>
                                          </div>
                                          <p className="text-sm font-bold text-slate-600">
                                            {typeof result.value === 'boolean' ? (result.value ? 'OK' : 'NÃO OK') : result.value}
                                            {item?.unit && <span className="ml-1 text-[10px] text-slate-400">{item.unit}</span>}
                                          </p>
                                          {result.observation && (
                                            <div className="mt-3 p-2 bg-rose-50 border border-rose-100 rounded-xl flex items-start gap-2">
                                              <AlertTriangle className="w-3 h-3 text-rose-500 shrink-0 mt-0.5" />
                                              <p className="text-[10px] text-rose-700 font-medium italic">{result.observation}</p>
                                            </div>
                                          )}
                                          {result.mediaUrl && (
                                            <div 
                                              onClick={() => {
                                                if (result.mediaUrl?.startsWith('data:image') || result.mediaUrl?.startsWith('http')) {
                                                  setViewingPhotoModal({
                                                    url: result.mediaUrl,
                                                    title: `${item?.name || 'Item de Inspeção'} - Registro de Evidência`
                                                  });
                                                }
                                              }}
                                              className="mt-3 rounded-xl overflow-hidden border border-slate-200 h-28 bg-slate-50 relative group cursor-pointer hover:border-emerald-400 transition-all shadow-xs"
                                            >
                                              {result.mediaUrl.startsWith('data:image') || result.mediaUrl.startsWith('http') ? (
                                                <>
                                                  <img src={result.mediaUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt="Evidência" />
                                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white">
                                                    <Maximize2 className="w-4 h-4" />
                                                    <span className="text-[10px] font-bold">Ver Foto</span>
                                                  </div>
                                                </>
                                              ) : (
                                                <div className="w-full h-full flex flex-col items-center justify-center p-2 text-slate-400">
                                                  <Video className="w-6 h-6 mb-1" />
                                                  <span className="text-[8px] font-black uppercase">Vídeo Anexado</span>
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                  {log.notes && (
                                    <div className="mt-6 p-4 bg-white rounded-2xl border border-slate-100">
                                      <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Notas do Condutor</h5>
                                      <p className="text-sm text-slate-600 font-medium">{log.notes}</p>
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            </td>
                          </tr>
                        )}
                      </AnimatePresence>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        )}

        {activeTab === 'admin' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
               <h3 className="text-xl font-bold text-slate-900">Gerenciamento de Frota</h3>
               <button 
                onClick={() => {
                  setEditingForklift(null);
                  setNewForklift({ number: '', sector: '', status: 'liberada' });
                  setShowForkliftModal(true);
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center gap-2 shadow-lg shadow-emerald-200"
               >
                 <Plus className="w-4 h-4" />
                 Novo Equipamento
               </button>
            </div>

            <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Número</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Setor</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Status</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {forklifts.map((f, idx) => (
                    <tr key={`${f.id}-${idx}`} className="hover:bg-slate-50/50">
                      <td className="px-6 py-4 font-black text-slate-900">{f.number}</td>
                      <td className="px-6 py-4 font-medium text-slate-600">{f.sector}</td>
                      <td className="px-6 py-4">
                        <button 
                          onClick={() => handleToggleStatus(f)}
                          className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border",
                            f.status === 'liberada' ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-rose-50 text-rose-700 border-rose-100 font-bold"
                          )}
                        >
                          {f.status}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                           <button 
                            onClick={() => handleOpenEditForklift(f)}
                            className="p-2 text-slate-400 hover:text-emerald-600"
                           >
                            <Edit2 className="w-4 h-4" />
                           </button>
                           <button 
                            onClick={() => setDeleteConfirm({ id: f.id, type: 'forklift', title: f.number })}
                            className="p-2 text-slate-400 hover:text-rose-600"
                           >
                            <Trash2 className="w-4 h-4" />
                           </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showConfigModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setShowConfigModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">Itens de Inspeção</h3>
                  <p className="text-slate-500 font-medium text-sm">Configure as perguntas obrigatórias do check-list</p>
                </div>
                <button onClick={() => setShowConfigModal(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
                  <X />
                </button>
              </div>

              <div className="p-8 max-h-[60vh] overflow-y-auto">
                 {isAdmin || isManager ? (
                   <div className="mb-8 p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
                     <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                       <Bell className="w-4 h-4 text-emerald-600" />
                       Configurações de Segurança
                     </h4>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <label className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-slate-100 cursor-pointer hover:border-emerald-200 transition-all">
                           <input 
                            type="checkbox"
                            className="w-5 h-5 rounded text-emerald-600 outline-none focus:ring-emerald-500"
                            checked={settings.autoNotifyNonConformity}
                            onChange={(e) => handleUpdateSettings({ autoNotifyNonConformity: e.target.checked })}
                           />
                           <div>
                             <p className="text-xs font-black text-slate-900 uppercase tracking-tight">Notificação Automática</p>
                             <p className="text-[10px] text-slate-400 font-medium">Avisar responsável sobre não conformidades</p>
                           </div>
                        </label>
                        <label className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-slate-100 cursor-pointer hover:border-emerald-200 transition-all">
                           <input 
                            type="checkbox"
                            className="w-5 h-5 rounded text-rose-600 outline-none focus:ring-rose-500"
                            checked={settings.autoLockOnNonConformity}
                            onChange={(e) => handleUpdateSettings({ autoLockOnNonConformity: e.target.checked })}
                           />
                           <div>
                             <p className="text-xs font-black text-slate-900 uppercase tracking-tight">Bloqueio Automático</p>
                             <p className="text-[10px] text-slate-400 font-medium">Bloquear equipamento em caso de "Não Ok"</p>
                           </div>
                        </label>
                     </div>

                     <div className="bg-white p-6 rounded-2xl border border-slate-100">
                        <div className="flex items-center justify-between mb-2">
                           <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Responsáveis pelas Notificações (E-mail)</h5>
                           <button 
                            onClick={sendTestEmail}
                            disabled={testingEmail}
                            className="flex items-center gap-2 px-3 py-1 bg-slate-900 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-slate-800 transition-all disabled:opacity-50"
                           >
                            {testingEmail ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bell className="w-3 h-3" />}
                            {testingEmail ? 'Enviando...' : 'Testar Envio'}
                           </button>
                        </div>
                        
                        <div className="space-y-3 mb-4">
                           {settings.responsiblePersons?.map((person, index) => (
                             <div key={`resp-person-${person.email || person.name || 'p'}-${index}`} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                               <div>
                                 <p className="text-xs font-bold text-slate-900">{person.name}</p>
                                 <p className="text-[10px] text-slate-500">{person.email}</p>
                               </div>
                               <button 
                                onClick={() => {
                                  const newList = [...(settings.responsiblePersons || [])];
                                  newList.splice(index, 1);
                                  handleUpdateSettings({ responsiblePersons: newList });
                                }}
                                className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                               >
                                 <Trash2 className="w-4 h-4" />
                               </button>
                             </div>
                           ))}
                           {(!settings.responsiblePersons || settings.responsiblePersons.length === 0) && (
                             <p className="text-center py-4 text-xs font-medium text-slate-400 italic">Nenhum responsável cadastrado.</p>
                           )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 bg-emerald-50/50 rounded-xl border border-emerald-100">
                           <input 
                            type="text"
                            placeholder="Nome do Responsável"
                            className="bg-white px-4 py-2 rounded-lg border border-emerald-100 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                            value={newResponsible.name}
                            onChange={e => setNewResponsible(prev => ({ ...prev, name: e.target.value }))}
                           />
                           <div className="flex gap-2">
                             <input 
                              type="email"
                              placeholder="E-mail"
                              className="flex-1 bg-white px-4 py-2 rounded-lg border border-emerald-100 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                              value={newResponsible.email}
                              onChange={e => setNewResponsible(prev => ({ ...prev, email: e.target.value }))}
                             />
                             <button 
                              type="button"
                              onClick={() => {
                                if (!newResponsible.name || !newResponsible.email) return;
                                handleUpdateSettings({ 
                                  responsiblePersons: [...(settings.responsiblePersons || []), newResponsible] 
                                });
                                setNewResponsible({ name: '', email: '' });
                              }}
                              className="bg-emerald-600 text-white p-2 rounded-lg hover:bg-emerald-700 transition-colors"
                             >
                               <Plus className="w-5 h-5" />
                             </button>
                           </div>
                        </div>
                     </div>
                   </div>
                 ) : null}

                 {editingCheckItem ? (
                   <form onSubmit={handleUpdateCheckItem} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 bg-emerald-50/30 p-6 rounded-[2rem] border border-emerald-100">
                    <div className="lg:col-span-2">
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Editar Nome do Item</label>
                      <input 
                        type="text" 
                        required
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-4 focus:ring-emerald-50 transition-all font-medium"
                        value={editingCheckItem.name}
                        onChange={e => setEditingCheckItem({...editingCheckItem, name: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Tipo de Valor</label>
                      <select 
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-4 focus:ring-emerald-50 transition-all font-medium appearance-none"
                        value={editingCheckItem.type}
                        onChange={e => setEditingCheckItem({...editingCheckItem, type: e.target.value as any})}
                      >
                        <option value="boolean">Ok / Não Ok</option>
                        <option value="numeric">Numérico (Custom)</option>
                        <option value="normal_anormal">Normal / Anormal</option>
                        <option value="open_closed">Aberto / Fechado</option>
                      </select>
                    </div>
                    {editingCheckItem.type === 'numeric' && (
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Unidade (Ex: bar, psi)</label>
                        <input 
                          type="text" 
                          className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-4 focus:ring-emerald-50 transition-all font-medium"
                          value={editingCheckItem.unit}
                          onChange={e => setEditingCheckItem({...editingCheckItem, unit: e.target.value})}
                        />
                      </div>
                    )}
                    {editingCheckItem.type === 'numeric' && (
                      <div className="lg:col-span-2 flex items-center gap-3 bg-white/50 p-3 rounded-xl border border-slate-100">
                        <input 
                          type="checkbox"
                          id="edit-show-status"
                          className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                          checked={editingCheckItem.showStatusSelection ?? true}
                          onChange={e => setEditingCheckItem({...editingCheckItem, showStatusSelection: e.target.checked})}
                        />
                        <label htmlFor="edit-show-status" className="text-xs font-bold text-slate-600 cursor-pointer">Habilitar seleção Normal/Anormal</label>
                      </div>
                    )}
                    <div className="lg:col-span-4 flex gap-3">
                       <button 
                        type="submit"
                        disabled={submitting}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-200/50"
                       >
                         {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                         SALVAR ALTERAÇÕES
                       </button>
                       <button 
                        type="button"
                        onClick={() => setEditingCheckItem(null)}
                        className="px-6 py-3 bg-white border border-slate-200 text-slate-500 font-bold rounded-xl hover:bg-slate-50 transition-all"
                       >
                         CANCELAR
                       </button>
                    </div>
                   </form>
                 ) : (
                  <form onSubmit={handleAddCheckItem} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 bg-slate-50 p-6 rounded-[2rem] border border-slate-100">
                    <div className="lg:col-span-2">
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Nome do Item</label>
                      <input 
                        type="text" 
                        required
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-4 focus:ring-emerald-50 transition-all font-medium"
                        placeholder="Ex: Nível de Óleo"
                        value={newCheckItem.name}
                        onChange={e => setNewCheckItem({...newCheckItem, name: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Tipo de Valor</label>
                      <select 
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-4 focus:ring-emerald-50 transition-all font-medium appearance-none"
                        value={newCheckItem.type}
                        onChange={e => setNewCheckItem({...newCheckItem, type: e.target.value as any})}
                      >
                        <option value="boolean">Ok / Não Ok</option>
                        <option value="numeric">Numérico (Custom)</option>
                        <option value="normal_anormal">Normal / Anormal</option>
                        <option value="open_closed">Aberto / Fechado</option>
                      </select>
                    </div>
                    {newCheckItem.type === 'numeric' && (
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Unidade (Ex: bar, psi)</label>
                        <input 
                          type="text" 
                          className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-4 focus:ring-emerald-50 transition-all font-medium"
                          placeholder="Ex: PSI"
                          value={newCheckItem.unit}
                          onChange={e => setNewCheckItem({...newCheckItem, unit: e.target.value})}
                        />
                      </div>
                    )}
                    {newCheckItem.type === 'numeric' && (
                      <div className="lg:col-span-2 flex items-center gap-3 bg-white/50 p-3 rounded-xl border border-slate-100">
                        <input 
                          type="checkbox"
                          id="show-status"
                          className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                          checked={newCheckItem.showStatusSelection}
                          onChange={e => setNewCheckItem({...newCheckItem, showStatusSelection: e.target.checked})}
                        />
                        <label htmlFor="show-status" className="text-xs font-bold text-slate-600 cursor-pointer">Habilitar seleção Normal/Anormal</label>
                      </div>
                    )}
                    <div className="lg:col-span-4">
                       <button 
                        type="submit"
                        disabled={submitting}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-200/50"
                       >
                         {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                         ADICIONAR ITEM AO CHECK-LIST
                       </button>
                    </div>
                 </form>
                )}

                 <Reorder.Group 
                   axis="y" 
                   values={checkItems} 
                   onReorder={handleReorderItems}
                   className="space-y-3"
                 >
                   {checkItems.map((item, idx) => (
                     <Reorder.Item 
                       key={item.id} 
                       value={item}
                       className={cn(
                        "flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl hover:border-emerald-200 transition-all shadow-sm cursor-default",
                        !item.active && "opacity-50 bg-slate-50"
                       )}
                     >
                       <div className="flex items-center gap-4">
                         <div className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing p-1">
                           <GripVertical className="w-5 h-5" />
                         </div>
                         <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500">
                           {idx + 1}
                         </div>
                         <div>
                           <p className="font-bold text-slate-900 text-sm tracking-tight">{item.name}</p>
                           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                             {item.type} {item.unit ? `(${item.unit})` : ''}
                           </p>
                         </div>
                       </div>
                       <div className="flex items-center gap-2">
                         <button 
                          onClick={() => setEditingCheckItem(item)}
                          className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                          title="Editar Item"
                         >
                           <Edit2 className="w-4 h-4" />
                         </button>
                         <button 
                          onClick={() => handleToggleItemActive(item)}
                          className={cn(
                            "p-2 rounded-lg transition-all",
                            item.active ? "text-emerald-600 bg-emerald-50" : "text-slate-400 bg-slate-100"
                          )}
                          title={item.active ? "Desativar Item" : "Ativar Item"}
                         >
                           {item.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                         </button>
                         <button 
                          onClick={() => deleteCheckItem(item.id)}
                          className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                         >
                           <Trash2 className="w-4 h-4" />
                         </button>
                       </div>
                     </Reorder.Item>
                   ))}
                 </Reorder.Group>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForkliftModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setShowForkliftModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="relative bg-white w-full max-md rounded-[2.5rem] shadow-2xl p-8"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-2">
                {editingForklift ? 'Editar Equipamento' : 'Novo Equipamento'}
              </h3>
              <p className="text-slate-500 font-medium text-sm mb-8">
                {editingForklift ? 'Atualize as informações do equipamento' : 'Cadastre uma nova empilhadeira na frota'}
              </p>

              <form onSubmit={handleSubmitForklift} className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Número Identificador</label>
                  <input 
                    type="text" 
                    required
                    maxLength={10}
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xl font-black outline-none focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500 transition-all tracking-widest placeholder-slate-200"
                    placeholder="Ex: EMP-045"
                    value={newForklift.number}
                    onChange={e => setNewForklift({...newForklift, number: e.target.value.toUpperCase()})}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Setor de Atuação</label>
                  <input 
                    type="text" 
                    required
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500 transition-all"
                    placeholder="Ex: Almoxarifado, Expedição"
                    value={newForklift.sector}
                    onChange={e => setNewForklift({...newForklift, sector: e.target.value})}
                  />
                </div>

                <div className="flex items-center gap-4 pt-4">
                  <button 
                    type="button" 
                    onClick={() => setShowForkliftModal(false)}
                    className="flex-1 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    disabled={submitting}
                    className="flex-[2] py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-lg shadow-emerald-200/50 transition-all flex items-center justify-center gap-2"
                  >
                    {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
                    {editingForklift ? 'SALVAR ALTERAÇÕES' : 'CADASTRAR EQUIPAMENTO'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCheckModal && (
          <div className="fixed inset-0 z-50 flex flex-col">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
              onClick={() => setShowCheckModal(null)}
            />
            <motion.div 
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              className="relative bg-white w-full h-full flex flex-col overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-8 bg-slate-900 text-white shrink-0">
                 <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                       <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-xl">
                          <Truck className="w-7 h-7 text-emerald-400" />
                       </div>
                       <div>
                          <h3 className="text-2xl font-black tracking-tight">{showCheckModal.number}</h3>
                          <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-[10px]">INSPEÇÃO DIÁRIA OBRIGATÓRIA</p>
                       </div>
                    </div>
                    <button onClick={() => setShowCheckModal(null)} className="p-2 hover:bg-white/10 rounded-xl transition-all">
                      <X />
                    </button>
                 </div>
                 <div className="flex items-center justify-between mt-4">
                    <div className="flex flex-wrap items-center gap-4 md:gap-6">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-emerald-500" />
                          <span className="text-xs font-bold text-slate-300">{showCheckModal.sector}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-emerald-500" />
                          <span className="text-xs font-bold text-slate-300">{format(new Date(), 'dd/MM/yyyy')}</span>
                        </div>
                        <div className="flex items-center gap-2 px-2 py-1 bg-emerald-500/20 rounded-lg border border-emerald-500/30">
                          <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">{getCurrentShift()}</span>
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span className="text-[9px] font-black text-white uppercase tracking-widest">Letra {getGroupForShift(new Date(), getCurrentShift())}</span>
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10">
                        <div className={cn(
                          "w-2 h-2 rounded-full animate-pulse",
                          savingStatus === 'saved' ? "bg-emerald-400" : 
                          savingStatus === 'saving' ? "bg-amber-400" : "bg-rose-400"
                        )} />
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                          {savingStatus === 'saved' ? 'Sincronizado' : 
                           savingStatus === 'saving' ? 'Salvando...' : 'Offline / Cache'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20">
                        <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400">
                          {Object.keys(checklistResults).filter(id => checkItems.some(i => i.id === id && i.active)).length} de {checkItems.filter(i => i.active).length} itens inspecionados
                        </span>
                      </div>
                    </div>
                 </div>
              </div>

              <form onSubmit={handleSubmitChecklist} className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 bg-slate-50/50">
                     {profile?.group && profile.group !== getGroupForShift(new Date(), getCurrentShift()) && (
                       <div className="p-4 bg-blue-50 border border-blue-200/70 rounded-2xl flex items-center justify-between gap-3 text-left">
                         <div className="flex items-center gap-2.5">
                           <Info className="w-5 h-5 text-blue-600 shrink-0" />
                           <div>
                             <p className="text-xs font-black text-blue-900 uppercase tracking-wide">Cobertura / Troca de Turno</p>
                             <p className="text-[11px] text-blue-700 font-medium">
                               Seu cadastro é <strong>Letra {profile.group}</strong> e a escala do turno é <strong>Letra {getGroupForShift(new Date(), getCurrentShift())}</strong>. O check-list será gravado com sucesso.
                             </p>
                           </div>
                         </div>
                       </div>
                     )}

                     <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200/80">
                       <div>
                         <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                           Critérios de Verificação
                           <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-2.5 py-0.5 rounded-full uppercase">
                             {Object.keys(checklistResults).filter(id => checkItems.some(i => i.id === id && i.active && checklistResults[id]?.value !== undefined && (checkItems.find(it => it.id === id)?.type !== 'numeric' || (checklistResults[id]?.value !== '' && checklistResults[id]?.value !== null)))).length} de {checkItems.filter(i => i.active).length} preenchidos
                           </span>
                         </h4>
                       </div>
                       
                       {checkItems.filter(i => i.active).length > 0 && (
                         <button
                           type="button"
                           onClick={handleFillAllConforming}
                           className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-xs active:scale-95"
                           title="Preenche todos os itens como Normal / Conforme de uma só vez"
                         >
                           <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                           Preencher Todos Conformes
                         </button>
                       )}
                    </div>

                    {checkItems.filter(i => i.active).length === 0 ? (
                      <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-slate-200">
                         <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-4" />
                         <p className="text-slate-500 font-medium">Nenhum item configurado pelo administrador.</p>
                      </div>
                    ) : (
                      checkItems.filter(i => i.active).map((item, index) => {
                        const result = checklistResults[item.id];
                        const isAnswered = result !== undefined;
                        
                        return (
                          <div key={`${item.id}-${index}`} className={cn(
                            "bg-white p-6 rounded-[2rem] border transition-all shadow-sm space-y-4",
                            isAnswered ? "border-emerald-100 bg-emerald-50/10" : "border-slate-200 hover:border-emerald-200"
                          )}>
                             <div className="flex flex-col gap-4">
                               <div className="flex items-center justify-between gap-4">
                                 <div className="flex items-center gap-3">
                                   <span className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-black text-sm shrink-0">
                                     {index + 1}
                                   </span>
                                   <div>
                                     <p className="font-bold text-slate-800 tracking-tight text-base md:text-lg">{item.name}</p>
                                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                                       {isAnswered ? (
                                          <span className="text-emerald-500 font-bold">Respondido</span>
                                       ) : (
                                          null
                                       )}
                                     </p>
                                   </div>
                                 </div>
                                 {isAnswered && (
                                   <button 
                                     type="button"
                                     onClick={() => {
                                        const newResults = { ...checklistResults };
                                        delete newResults[item.id];
                                        setChecklistResults(newResults);
                                     }}
                                     className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all shrink-0"
                                     title="Limpar resposta"
                                   >
                                     <X className="w-4.5 h-4.5" />
                                   </button>
                                 )}
                               </div>

                               <div className="sm:pl-11">
                                  {item.type === 'boolean' && (
                                    <div className="grid grid-cols-2 gap-3 w-full">
                                       <button
                                         type="button"
                                         onClick={() => setChecklistResults({...checklistResults, [item.id]: { ...checklistResults[item.id], value: true, status: 'normal' }})}
                                         className={cn(
                                           "flex-1 py-4 rounded-2xl font-black transition-all border-2 text-sm flex items-center justify-center gap-2 uppercase tracking-widest",
                                           checklistResults[item.id]?.value === true 
                                             ? "bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-100" 
                                             : "bg-white border-slate-200 text-slate-400 hover:border-emerald-200"
                                         )}
                                       >
                                         <CheckCircle2 className="w-5 h-5" />
                                         OK
                                       </button>
                                       <button
                                         type="button"
                                         onClick={() => setChecklistResults({...checklistResults, [item.id]: { ...checklistResults[item.id], value: false, status: 'anormal' }})}
                                         className={cn(
                                           "flex-1 py-4 rounded-2xl font-black transition-all border-2 text-sm flex items-center justify-center gap-2 uppercase tracking-widest",
                                           checklistResults[item.id]?.value === false 
                                             ? "bg-rose-600 border-rose-600 text-white shadow-lg shadow-rose-100" 
                                             : "bg-white border-slate-200 text-slate-400 hover:border-rose-200"
                                         )}
                                       >
                                         <AlertTriangle className="w-5 h-5" />
                                         NÃO OK
                                       </button>
                                    </div>
                                  )}

                                  {item.type === 'normal_anormal' && (
                                    <div className="grid grid-cols-2 gap-3 w-full">
                                       <button
                                         type="button"
                                         onClick={() => setChecklistResults({...checklistResults, [item.id]: { ...checklistResults[item.id], value: 'normal', status: 'normal' }})}
                                         className={cn(
                                           "flex-1 py-4 rounded-2xl font-black transition-all border-2 text-sm flex items-center justify-center gap-2 uppercase tracking-widest",
                                           checklistResults[item.id]?.value === 'normal' 
                                             ? "bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-100" 
                                             : "bg-white border-slate-200 text-slate-400 hover:border-emerald-200"
                                         )}
                                       >
                                         <CheckCircle2 className="w-5 h-5" />
                                         NORMAL
                                       </button>
                                       <button
                                         type="button"
                                         onClick={() => setChecklistResults({...checklistResults, [item.id]: { ...checklistResults[item.id], value: 'anormal', status: 'anormal' }})}
                                         className={cn(
                                           "flex-1 py-4 rounded-2xl font-black transition-all border-2 text-sm flex items-center justify-center gap-2 uppercase tracking-widest",
                                           checklistResults[item.id]?.value === 'anormal' 
                                             ? "bg-rose-600 border-rose-600 text-white shadow-lg shadow-rose-100" 
                                             : "bg-white border-slate-200 text-slate-400 hover:border-rose-200"
                                         )}
                                       >
                                         <AlertTriangle className="w-5 h-5" />
                                         ANORMAL
                                       </button>
                                    </div>
                                  )}

                                  {item.type === 'open_closed' && (
                                    <div className="grid grid-cols-2 gap-3 w-full">
                                       <button
                                         type="button"
                                         onClick={() => setChecklistResults({...checklistResults, [item.id]: { ...checklistResults[item.id], value: 'open', status: 'normal' }})}
                                         className={cn(
                                           "flex-1 py-4 rounded-2xl font-black transition-all border-2 text-sm flex items-center justify-center gap-2 uppercase tracking-widest",
                                           checklistResults[item.id]?.value === 'open' 
                                             ? "bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-100" 
                                             : "bg-white border-slate-200 text-slate-400 hover:border-emerald-200"
                                         )}
                                       >
                                         <CheckCircle2 className="w-5 h-5" />
                                         ABERTO
                                       </button>
                                       <button
                                         type="button"
                                         onClick={() => setChecklistResults({...checklistResults, [item.id]: { ...checklistResults[item.id], value: 'closed', status: 'normal' }})}
                                         className={cn(
                                           "flex-1 py-4 rounded-2xl font-black transition-all border-2 text-sm flex items-center justify-center gap-2 uppercase tracking-widest",
                                           checklistResults[item.id]?.value === 'closed' 
                                             ? "bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-100" 
                                             : "bg-white border-slate-200 text-slate-400 hover:border-emerald-200"
                                         )}
                                       >
                                         <CheckCircle2 className="w-5 h-5" />
                                         FECHADO
                                       </button>
                                    </div>
                                  )}

                                  {item.type === 'numeric' && (
                                    <div className="flex flex-col md:flex-row items-stretch gap-4 w-full">
                                       {(item.showStatusSelection ?? true) ? (
                                         <>
                                           <div className="relative flex-1">
                                             <input 
                                               type="text"
                                               required
                                               className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-50 font-black text-lg text-slate-800 pr-16"
                                               placeholder="Digite o valor..."
                                               value={checklistResults[item.id]?.value || ''}
                                               onChange={e => {
                                                 const val = e.target.value;
                                                 setChecklistResults({...checklistResults, [item.id]: { ...checklistResults[item.id], value: val }});
                                               }}
                                             />
                                             {item.unit && <span className="absolute right-5 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400 uppercase tracking-widest">{item.unit}</span>}
                                           </div>
                                           <div className="grid grid-cols-2 gap-3 flex-1">
                                             <button
                                               type="button"
                                               onClick={() => setChecklistResults({...checklistResults, [item.id]: { ...checklistResults[item.id], status: 'normal' }})}
                                               className={cn(
                                                 "flex-1 py-4 rounded-2xl font-black transition-all border-2 text-sm flex items-center justify-center gap-2 uppercase tracking-widest",
                                                 (checklistResults[item.id]?.status || 'normal') === 'normal' 
                                                   ? "bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-100" 
                                                   : "bg-white border-slate-200 text-slate-400 hover:border-emerald-200"
                                               )}
                                             >
                                               <CheckCircle2 className="w-5 h-5" />
                                               NORMAL
                                             </button>
                                             <button
                                               type="button"
                                               onClick={() => setChecklistResults({...checklistResults, [item.id]: { ...checklistResults[item.id], status: 'anormal' }})}
                                               className={cn(
                                                 "flex-1 py-4 rounded-2xl font-black transition-all border-2 text-sm flex items-center justify-center gap-2 uppercase tracking-widest",
                                                 checklistResults[item.id]?.status === 'anormal' 
                                                   ? "bg-rose-600 border-rose-600 text-white shadow-lg shadow-rose-100" 
                                                   : "bg-white border-slate-200 text-slate-400 hover:border-rose-200"
                                               )}
                                             >
                                               <AlertTriangle className="w-5 h-5" />
                                               ANORMAL
                                             </button>
                                           </div>
                                         </>
                                       ) : (
                                          <div className="relative w-full">
                                             <input 
                                               type="text"
                                               required
                                               className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-50 font-black text-lg text-slate-800 pr-16"
                                               placeholder="Digite o valor..."
                                               value={checklistResults[item.id]?.value || ''}
                                               onChange={e => {
                                                 const val = e.target.value;
                                                 setChecklistResults({...checklistResults, [item.id]: { ...checklistResults[item.id], value: val, status: 'normal' }});
                                               }}
                                             />
                                             {item.unit && <span className="absolute right-5 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400 uppercase tracking-widest">{item.unit}</span>}
                                          </div>
                                       )}
                                    </div>
                                  )}
                               </div>
                             </div>

                             {(checklistResults[item.id]?.status === 'anormal') && (
                               <motion.div 
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                className="pt-4 border-t border-slate-100 flex flex-col md:flex-row gap-4"
                              >
                                 <div className="flex-1 relative">
                                   <AlertTriangle className="absolute left-4 top-4 w-4 h-4 text-rose-500" />
                                   <textarea 
                                    className="w-full pl-12 pr-4 py-3 bg-rose-50/30 border border-rose-100 rounded-2xl text-xs font-medium placeholder-rose-300 outline-none focus:border-rose-300 transition-all"
                                    placeholder="Descreva a não conformidade encontrada..."
                                    rows={2}
                                    value={checklistResults[item.id]?.observation || ''}
                                    onChange={e => setChecklistResults({...checklistResults, [item.id]: { ...checklistResults[item.id], observation: e.target.value }})}
                                   />
                                 </div>
                                 <div className="md:w-80 flex flex-col gap-2">
                                    <input 
                                      type="file"
                                      accept="image/*,video/*"
                                      id={`file-${item.id}`}
                                      className="hidden"
                                      onChange={(e) => handleFileChange(e, item.id)}
                                    />
                                    <input 
                                      type="file"
                                      accept="image/*"
                                      capture="environment"
                                      id={`camera-native-${item.id}`}
                                      className="hidden"
                                      onChange={(e) => handleFileChange(e, item.id)}
                                    />
                                    
                                    {!checklistResults[item.id]?.mediaUrl ? (
                                      <div className="flex flex-col sm:flex-row gap-2">
                                        <button 
                                          type="button"
                                          onClick={() => {
                                            setActiveCameraCapture({
                                              itemId: item.id,
                                              itemTitle: item.name
                                            });
                                          }}
                                          className="flex-1 flex items-center justify-center gap-2 px-3 py-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-2xl transition-all shadow-xs group cursor-pointer"
                                          title="Tirar foto usando a câmera ao vivo"
                                        >
                                          <Camera className="w-4 h-4 text-emerald-600 group-hover:scale-110 transition-transform" />
                                          <span className="text-[10px] font-black uppercase tracking-wider">Tirar Foto</span>
                                        </button>

                                        <button 
                                          type="button"
                                          onClick={() => document.getElementById(`file-${item.id}`)?.click()}
                                          className="flex-1 flex items-center justify-center gap-2 px-3 py-3 bg-rose-50/70 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-2xl transition-all shadow-xs group cursor-pointer"
                                          title="Selecionar foto ou vídeo da galeria/arquivos"
                                        >
                                          <Paperclip className="w-3.5 h-3.5 text-rose-500 group-hover:scale-110 transition-transform" />
                                          <span className="text-[10px] font-black uppercase tracking-wider">Galeria / Arquivo</span>
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="relative group rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 h-[96px] shadow-sm flex items-center justify-center">
                                        {checklistResults[item.id]?.mediaUrl?.startsWith('data:image') || checklistResults[item.id]?.mediaUrl?.startsWith('http') ? (
                                          <>
                                            <img 
                                              src={checklistResults[item.id].mediaUrl} 
                                              alt="Preview" 
                                              className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent flex items-end justify-between p-2">
                                              <div className="flex items-center gap-1.5">
                                                <button
                                                  type="button"
                                                  onClick={() => setViewingPhotoModal({
                                                    url: checklistResults[item.id].mediaUrl!,
                                                    title: `${item.name} - Evidência da Não Conformidade`
                                                  })}
                                                  className="flex items-center gap-1 text-[9px] font-bold text-white bg-white/20 hover:bg-white/30 backdrop-blur-md px-2 py-1 rounded-lg border border-white/20 transition-all cursor-pointer"
                                                >
                                                  <Maximize2 className="w-3 h-3" />
                                                  Ver Foto
                                                </button>
                                                <span className="text-[9px] font-black text-emerald-300 bg-emerald-950/80 border border-emerald-500/40 px-1.5 py-0.5 rounded-md backdrop-blur-sm">
                                                  {checklistResults[item.id].fileSizeKb ? `~${checklistResults[item.id].fileSizeKb} KB` : 'Otimizada'}
                                                </span>
                                              </div>

                                              <div className="flex items-center gap-1">
                                                <button
                                                  type="button"
                                                  onClick={() => setActiveCameraCapture({
                                                    itemId: item.id,
                                                    itemTitle: item.name
                                                  })}
                                                  className="p-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-all shadow-xs cursor-pointer"
                                                  title="Tirar outra foto com a câmera"
                                                >
                                                  <Camera className="w-3.5 h-3.5" />
                                                </button>
                                                <button 
                                                  type="button"
                                                  onClick={() => setChecklistResults(prev => ({
                                                    ...prev,
                                                    [item.id]: { ...prev[item.id], mediaUrl: undefined, fileName: undefined, fileSizeKb: undefined }
                                                  }))}
                                                  className="p-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-all shadow-xs cursor-pointer"
                                                  title="Remover foto"
                                                >
                                                  <X className="w-3.5 h-3.5" />
                                                </button>
                                              </div>
                                            </div>
                                          </>
                                        ) : (
                                          <div className="w-full h-full flex flex-col items-center justify-center p-2 text-slate-300">
                                            <Video className="w-6 h-6 mb-1 text-slate-400" />
                                            <span className="text-[8px] font-black uppercase text-center truncate w-full text-slate-300">
                                              {checklistResults[item.id].fileName}
                                            </span>
                                            <button 
                                              type="button"
                                              onClick={() => setChecklistResults(prev => ({
                                                ...prev,
                                                [item.id]: { ...prev[item.id], mediaUrl: undefined, fileName: undefined }
                                              }))}
                                              className="absolute top-1 right-1 p-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-sm cursor-pointer"
                                            >
                                              <X className="w-3 h-3" />
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                 </div>
                              </motion.div>
                            )}
                          </div>
                        );
                      })
                    )}

                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Observações Adicionais</h4>
                    </div>
                    <textarea 
                     rows={3}
                     className="w-full px-6 py-4 bg-white border border-slate-200 rounded-[2rem] outline-none focus:ring-4 focus:ring-emerald-50 transition-all font-medium placeholder-slate-300"
                     placeholder="Relate aqui qualquer observação adicional sobre o equipamento ou inspeção..."
                     value={checklistNotes}
                     onChange={e => setChecklistNotes(e.target.value)}
                    />
                  </div>

                  <div className="pt-6 border-t border-slate-200 flex flex-col items-center gap-6">
                     <div className="w-full flex flex-col md:flex-row items-center justify-between gap-6">
                       <div>
                          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Responsável pela Inspeção</p>
                          <p className="text-slate-900 font-black flex items-center gap-2 uppercase tracking-tight">
                            <UserIcon className="w-5 h-5 text-emerald-600" />
                            {profile?.displayName || auth.currentUser?.email}
                          </p>
                       </div>
                        <button 
                          type="submit"
                          disabled={submitting}
                          className="w-full md:w-auto px-12 py-5 font-black uppercase tracking-[0.2em] rounded-[1.5rem] shadow-2xl transition-all flex items-center justify-center gap-3 group bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200/50 cursor-pointer active:scale-98"
                        >
                         {submitting ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                           <>
                             FINALIZAR E ENVIAR
                             <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                           </>
                         )}
                       </button>
                     </div>
                  </div>
              </form>
            </motion.div>
          </div>
        )}
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
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => {
                    if (deleteConfirm.type === 'forklift') {
                      deleteForklift(deleteConfirm.id);
                    } else if (deleteConfirm.type === 'checklist') {
                      deleteChecklist(deleteConfirm.id, deleteConfirm.userId);
                    } else {
                      deleteCheckItem(deleteConfirm.id);
                    }
                  }}
                  disabled={submitting}
                  className="flex-1 py-3 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Excluir'}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Live Camera Viewfinder Modal */}
        {activeCameraCapture && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setActiveCameraCapture(null)}
              className="absolute inset-0 bg-black/85 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative bg-slate-950 w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-slate-800 overflow-hidden flex flex-col z-10"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-4 sm:p-5 flex items-center justify-between border-b border-slate-800/80 bg-slate-900/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Camera className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">Câmera ao Vivo</h3>
                    <p className="text-[11px] font-medium text-slate-400 truncate max-w-[220px] sm:max-w-xs">
                      {activeCameraCapture.itemTitle}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveCameraCapture(null)}
                  className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Viewfinder Video Area */}
              <div className="relative aspect-[4/3] bg-black flex items-center justify-center overflow-hidden">
                <video
                  ref={cameraVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                
                {/* Target overlay guide */}
                <div className="absolute inset-6 border border-white/20 rounded-2xl pointer-events-none flex items-center justify-center">
                  <div className="w-4 h-4 border-t-2 border-l-2 border-emerald-400 absolute top-0 left-0 rounded-tl" />
                  <div className="w-4 h-4 border-t-2 border-r-2 border-emerald-400 absolute top-0 right-0 rounded-tr" />
                  <div className="w-4 h-4 border-b-2 border-l-2 border-emerald-400 absolute bottom-0 left-0 rounded-bl" />
                  <div className="w-4 h-4 border-b-2 border-r-2 border-emerald-400 absolute bottom-0 right-0 rounded-br" />
                </div>
              </div>

              {/* Controls Footer */}
              <div className="p-5 sm:p-6 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between gap-3">
                {/* Switch camera */}
                <button
                  type="button"
                  onClick={() => setCameraFacing(prev => prev === 'environment' ? 'user' : 'environment')}
                  className="flex items-center gap-2 px-3.5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all cursor-pointer border border-slate-700/60"
                  title="Alternar Câmera Frontal / Traseira"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span className="hidden sm:inline">Inverter</span>
                </button>

                {/* Capture Button */}
                <button
                  type="button"
                  onClick={handleCaptureFromCamera}
                  className="flex-1 flex items-center justify-center gap-2 py-4 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-slate-950 rounded-full font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-emerald-500/25 cursor-pointer"
                >
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-950 bg-white" />
                  <span>Capturar Foto</span>
                </button>

                {/* Native camera app fallback */}
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById(`camera-native-${activeCameraCapture.itemId}`);
                    setActiveCameraCapture(null);
                    el?.click();
                  }}
                  className="flex items-center gap-2 px-3.5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all cursor-pointer border border-slate-700/60"
                  title="Abrir aplicativo de câmera nativo do celular"
                >
                  <Smartphone className="w-4 h-4 text-emerald-400" />
                  <span className="hidden sm:inline">Nativa</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Fullscreen Photo Viewing Modal */}
        {viewingPhotoModal && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-3 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setViewingPhotoModal(null)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative max-w-3xl w-full max-h-[90vh] bg-slate-950 rounded-[2.5rem] border border-slate-800 overflow-hidden flex flex-col z-10 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-4 sm:p-5 flex items-center justify-between border-b border-slate-800/80 bg-slate-900/60">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">{viewingPhotoModal.title}</h3>
                    <p className="text-[11px] font-medium text-slate-400">Evidência registrada</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setViewingPhotoModal(null)}
                  className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 bg-black p-4 flex items-center justify-center overflow-auto max-h-[70vh]">
                <img 
                  src={viewingPhotoModal.url} 
                  alt="Evidência ampliada" 
                  className="max-w-full max-h-full object-contain rounded-xl shadow-lg"
                />
              </div>
            </motion.div>
          </div>
        )}

        <ConfirmationModal
          isOpen={modalConfig.isOpen}
          onClose={closeModal}
          title={modalConfig.title}
          message={modalConfig.message}
          type={modalConfig.type}
          showConfirmButton={modalConfig.showConfirmButton}
          onConfirm={modalConfig.onConfirm}
          confirmText={modalConfig.confirmText}
        />
      </AnimatePresence>
    </div>
  );
};

export default Forklifts;
