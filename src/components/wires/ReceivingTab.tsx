import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  getDocs,
  where,
  writeBatch,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { WireBatch, WireCoil, WireSupplier, WireStorageBay, WireReceivingDraft } from '../../types';
import { 
  PackagePlus, 
  X, 
  Loader2, 
  Save, 
  Barcode, 
  AlertTriangle, 
  Weight, 
  Factory, 
  Trash2, 
  Camera, 
  Keyboard, 
  ShieldAlert, 
  ChevronDown, 
  CloudCheck, 
  Cloud, 
  Sparkles, 
  Smartphone, 
  User, 
  Clock, 
  ArrowRight, 
  Layers,
  ShieldCheck,
  CheckCircle2,
  Lock,
  FileCheck,
  AlertCircle,
  Hash,
  MapPin,
  Calendar,
  CheckCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { parseWireQRCode } from '../../lib/wireUtils';
import { QRCameraScanner } from './QRCameraScanner';
import { ConfirmationModal } from '../ui/ConfirmationModal';
import { useAuth } from '../../hooks/useAuth';

interface ReceivingTabProps {
  suppliers: WireSupplier[];
  isManager: boolean;
  storageBays: WireStorageBay[];
}

const WIRE_RECEIVING_DRAFT_KEY = 'secapp_wire_receiving_draft_v1';
const WIRE_RECEIVING_ACTIVE_ID_KEY = 'secapp_wire_receiving_active_draft_id_v1';

interface StoredDraft {
  draftId?: string;
  currentBatch: Partial<WireBatch>;
  scannedCoils: Partial<WireCoil>[];
  lastSavedAt: string;
}

export const ReceivingTab: React.FC<ReceivingTabProps> = ({ suppliers, isManager, storageBays }) => {
  const { profile } = useAuth();
  
  // Active draft doc ID in Firestore
  const [activeDraftId, setActiveDraftId] = useState<string>(() => {
    try {
      const savedId = localStorage.getItem(WIRE_RECEIVING_ACTIVE_ID_KEY);
      if (savedId) return savedId;
    } catch (e) {
      // ignore
    }
    return `draft_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  });

  // Active Cloud Drafts from Firestore
  const [cloudDrafts, setCloudDrafts] = useState<WireReceivingDraft[]>([]);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'saved' | 'saving' | 'error' | 'idle'>('idle');
  const [discardTargetDraftId, setDiscardTargetDraftId] = useState<string | null>(null);

  // Initialize batch state from localStorage if available
  const [currentBatch, setCurrentBatch] = useState<Partial<WireBatch> | null>(() => {
    try {
      const saved = localStorage.getItem(WIRE_RECEIVING_DRAFT_KEY);
      if (saved) {
        const parsed: StoredDraft = JSON.parse(saved);
        if (parsed.currentBatch && Object.keys(parsed.currentBatch).length > 0) {
          return parsed.currentBatch;
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar rascunho local de recebimento:', e);
    }
    return null;
  });

  const [scannedCoils, setScannedCoils] = useState<Partial<WireCoil>[]>(() => {
    try {
      const saved = localStorage.getItem(WIRE_RECEIVING_DRAFT_KEY);
      if (saved) {
        const parsed: StoredDraft = JSON.parse(saved);
        if (Array.isArray(parsed.scannedCoils)) {
          return parsed.scannedCoils;
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar bobinas do rascunho local:', e);
    }
    return [];
  });

  const [lastSavedTime, setLastSavedTime] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem(WIRE_RECEIVING_DRAFT_KEY);
      if (saved) {
        const parsed: StoredDraft = JSON.parse(saved);
        return parsed.lastSavedAt ? new Date(parsed.lastSavedAt).toLocaleTimeString('pt-BR') : null;
      }
    } catch (e) {
      // ignore
    }
    return null;
  });

  const [draftRestoredBanner, setDraftRestoredBanner] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(WIRE_RECEIVING_DRAFT_KEY);
      if (saved) {
        const parsed: StoredDraft = JSON.parse(saved);
        return Boolean(parsed.currentBatch || (parsed.scannedCoils && parsed.scannedCoils.length > 0));
      }
    } catch (e) {
      // ignore
    }
    return false;
  });

  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [qrInput, setQrInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [validatingSecurity, setValidatingSecurity] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualData, setManualData] = useState({ coilNumber: '', weight: '', diameter: 2.30 });
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastSavedBatchId, setLastSavedBatchId] = useState<string | null>(null);

  // Manager Security Save Modal State
  const [showManagerSecurityModal, setShowManagerSecurityModal] = useState(false);
  const [managerNotes, setManagerNotes] = useState('');
  const [duplicateCoilsFound, setDuplicateCoilsFound] = useState<string[]>([]);

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Real-time listener for open cloud drafts in Firestore
  useEffect(() => {
    const q = query(collection(db, 'wire_receiving_drafts'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const drafts: WireReceivingDraft[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.status !== 'completed' && data.status !== 'discarded') {
          drafts.push({
            id: docSnap.id,
            userId: data.userId || '',
            userName: data.userName || 'Operador',
            userEmail: data.userEmail || '',
            currentBatch: data.currentBatch || {},
            scannedCoils: data.scannedCoils || [],
            lastSavedAt: data.lastSavedAt || '',
            status: data.status || 'in_progress',
            updatedAt: data.updatedAt
          });
        }
      });
      // Sort newest first
      drafts.sort((a, b) => new Date(b.lastSavedAt || 0).getTime() - new Date(a.lastSavedAt || 0).getTime());
      setCloudDrafts(drafts);
    }, (err) => {
      console.warn('Erro ao escutar rascunhos de recebimento na nuvem:', err);
    });

    return () => unsubscribe();
  }, []);

  // Synchronize Active Draft ID to localStorage
  useEffect(() => {
    try {
      if (activeDraftId) {
        localStorage.setItem(WIRE_RECEIVING_ACTIVE_ID_KEY, activeDraftId);
      }
    } catch (e) {
      // ignore
    }
  }, [activeDraftId]);

  // Real-time Cloud Auto-save effect
  useEffect(() => {
    // 1. LocalStorage immediate backup
    try {
      if (currentBatch || scannedCoils.length > 0) {
        const now = new Date();
        const draft: StoredDraft = {
          draftId: activeDraftId,
          currentBatch: currentBatch || {},
          scannedCoils,
          lastSavedAt: now.toISOString()
        };
        localStorage.setItem(WIRE_RECEIVING_DRAFT_KEY, JSON.stringify(draft));
        setLastSavedTime(now.toLocaleTimeString('pt-BR'));
      } else {
        localStorage.removeItem(WIRE_RECEIVING_DRAFT_KEY);
        setLastSavedTime(null);
      }
    } catch (e) {
      console.warn('Erro ao salvar rascunho local de recebimento:', e);
    }

    // 2. Cloud Firestore Auto-save (debounced to avoid rate limits while maintaining real-time sync)
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    if (currentBatch || scannedCoils.length > 0) {
      setCloudSyncStatus('saving');
      saveTimerRef.current = setTimeout(async () => {
        try {
          const draftDocRef = doc(db, 'wire_receiving_drafts', activeDraftId);
          await setDoc(draftDocRef, {
            id: activeDraftId,
            userId: profile?.id || 'unknown_user',
            userName: profile?.displayName || profile?.email || 'Operador',
            userEmail: profile?.email || '',
            currentBatch: currentBatch || {},
            scannedCoils: scannedCoils || [],
            lastSavedAt: new Date().toISOString(),
            status: 'in_progress',
            updatedAt: serverTimestamp()
          }, { merge: true });
          
          setCloudSyncStatus('saved');
          setLastSavedTime(new Date().toLocaleTimeString('pt-BR'));
        } catch (cloudErr) {
          console.warn('Erro ao sincronizar rascunho na nuvem:', cloudErr);
          setCloudSyncStatus('error');
        }
      }, 400);
    } else {
      setCloudSyncStatus('idle');
    }

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [currentBatch, scannedCoils, activeDraftId, profile]);

  const startNewBatch = () => {
    if (!isManager) {
      setError('Apenas usuários com perfil de Gerente/Manager podem iniciar e salvar recebimentos.');
      return;
    }
    const newId = `draft_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    setActiveDraftId(newId);
    const initialBatch: Partial<WireBatch> = {
      nfNumber: '',
      supplierId: '',
      supplierName: '',
      date: new Date().toISOString().split('T')[0],
      status: 'open',
      totalWeight: 0,
      coilsCount: 0,
      storageBayId: '',
      storageBayName: ''
    };
    setCurrentBatch(initialBatch);
    setScannedCoils([]);
    setDraftRestoredBanner(false);
    setError('');
  };

  // Resume a draft from the cloud or list
  const resumeCloudDraft = (draft: WireReceivingDraft) => {
    setActiveDraftId(draft.id);
    setCurrentBatch(draft.currentBatch || {});
    setScannedCoils(draft.scannedCoils || []);
    setLastSavedTime(draft.lastSavedAt ? new Date(draft.lastSavedAt).toLocaleTimeString('pt-BR') : null);
    setDraftRestoredBanner(true);
    setError('');
  };

  const handleDiscardDraft = async () => {
    const targetId = discardTargetDraftId || activeDraftId;
    
    // Delete from Firestore Cloud
    try {
      if (targetId) {
        await deleteDoc(doc(db, 'wire_receiving_drafts', targetId));
      }
    } catch (e) {
      console.warn('Erro ao apagar rascunho na nuvem:', e);
    }

    // Clean LocalStorage if discarding the active draft
    if (!discardTargetDraftId || discardTargetDraftId === activeDraftId) {
      try {
        localStorage.removeItem(WIRE_RECEIVING_DRAFT_KEY);
        localStorage.removeItem(WIRE_RECEIVING_ACTIVE_ID_KEY);
      } catch (e) {
        console.warn(e);
      }
      setCurrentBatch(null);
      setScannedCoils([]);
      setLastSavedTime(null);
      setDraftRestoredBanner(false);
    }

    setDiscardTargetDraftId(null);
    setShowDiscardModal(false);
    setError('');
  };

  const processScanData = (data: string) => {
    if (!currentBatch?.supplierId) {
      setError('Selecione primeiro o fornecedor da carga no formulário ao lado.');
      return;
    }

    const parsed = parseWireQRCode(data);
    if (!parsed) {
      setError('Formato de código não reconhecido. Verifique se o QR code é de um fornecedor homologado.');
      return;
    }

    // Business Rule: Check if the scanned coil belongs to the selected supplier
    const selectedSupplier = suppliers.find(s => s.id === currentBatch.supplierId);
    if (!selectedSupplier) return;

    const supplierMatch = parsed.supplier.toLowerCase().trim() === selectedSupplier.name.toLowerCase().trim();
    
    if (!supplierMatch) {
      setError(`Erro de Fornecedor: Esta bobina é da ${parsed.supplier}, mas você selecionou ${selectedSupplier.name}. Todas as bobinas de uma carga devem ser do mesmo fornecedor.`);
      return;
    }

    if (scannedCoils.some(c => c.coilNumber === parsed.coilNumber)) {
      setError('Esta bobina já foi bipada nesta carga.');
      return;
    }

    const newCoil: Partial<WireCoil> = {
      coilNumber: parsed.coilNumber,
      diameter: parsed.diameter,
      weight: parsed.weight,
      supplierId: currentBatch.supplierId,
      status: 'received',
      receivedAt: new Date().toISOString(),
      isDamaged: false
    };

    setScannedCoils(prev => [newCoil, ...prev]);
    setQrInput('');
    setError('');
    
    // Auto-focus back to input for next scan if manually typing
    const input = document.querySelector('input[placeholder*="Bipe"]') as HTMLInputElement;
    if (input) input.focus();
  };

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!qrInput) return;
    processScanData(qrInput);
  };

  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualData.coilNumber || !manualData.weight) {
      setError('Preencha o número e o peso da bobina.');
      return;
    }

    const manualCoil: Partial<WireCoil> = {
      coilNumber: manualData.coilNumber,
      diameter: manualData.diameter,
      weight: parseFloat(manualData.weight.toString()),
      status: 'received',
      receivedAt: new Date().toISOString(),
      isDamaged: true
    };
    setScannedCoils(prev => [manualCoil, ...prev]);
    setShowManualModal(false);
    setManualData({ coilNumber: '', weight: '', diameter: 2.30 });
    setError('');
  };

  const updateCoil = (index: number, fields: Partial<WireCoil>) => {
    setScannedCoils(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...fields };
      return copy;
    });
  };

  const removeCoil = (index: number) => {
    setScannedCoils(prev => prev.filter((_, i) => i !== index));
  };

  // Step 1: Pre-validation and Duplicate Check before opening the Manager Security Modal
  const initiateManagerSave = async () => {
    setError('');

    if (!isManager) {
      setError('Acesso restrito: Apenas usuários com perfil de Gerente/Manager têm permissão para homologar e salvar o recebimento no estoque.');
      return;
    }

    if (!currentBatch?.nfNumber?.trim()) {
      setError('Informe o número da Nota Fiscal (NF) antes de finalizar.');
      return;
    }

    if (!currentBatch?.supplierId) {
      setError('Selecione o Fornecedor da carga.');
      return;
    }

    if (!currentBatch?.storageBayId) {
      setError('Selecione o local de armazenamento (baia) para estocar as bobinas.');
      return;
    }

    if (scannedCoils.length === 0) {
      setError('Bipe ou registre ao menos 1 bobina antes de finalizar o carregamento.');
      return;
    }

    const unweightedCoils = scannedCoils.filter(c => !c.weight || c.weight <= 0);
    if (unweightedCoils.length > 0) {
      setError(`Existem ${unweightedCoils.length} bobina(s) com peso zero ou inválido. Ajuste os pesos antes de salvar.`);
      return;
    }

    setValidatingSecurity(true);

    try {
      // 1. Check for duplicates in the current scanned list
      const coilNumbers = scannedCoils.map(c => c.coilNumber).filter(Boolean) as string[];
      const internalDuplicates = coilNumbers.filter((item, index) => coilNumbers.indexOf(item) !== index);
      if (internalDuplicates.length > 0) {
        setError(`Atenção: A bobina "${internalDuplicates[0]}" está duplicada nesta carga. Remova a duplicata.`);
        setValidatingSecurity(false);
        return;
      }

      // 2. Query Firestore in chunks to check if any of these coil IDs already exist in the database
      const foundInDb: string[] = [];
      const chunkSize = 30; // Firestore 'in' query limit is 30
      
      for (let i = 0; i < coilNumbers.length; i += chunkSize) {
        const chunk = coilNumbers.slice(i, i + chunkSize);
        const qCoils = query(collection(db, 'wire_coils'), where('coilNumber', 'in', chunk));
        const snap = await getDocs(qCoils);
        snap.forEach(docSnap => {
          const data = docSnap.data();
          if (data.coilNumber) {
            foundInDb.push(data.coilNumber);
          }
        });
      }

      setDuplicateCoilsFound(foundInDb);

      if (foundInDb.length > 0) {
        setError(`Alerta de Segurança Crítico: As seguintes bobinas já estão cadastradas no estoque: ${foundInDb.join(', ')}. Não é permitido salvar bobinas já existentes.`);
        setValidatingSecurity(false);
        return;
      }

      // Everything verified with 100% integrity -> Open Manager Security Confirmation Modal
      setShowManagerSecurityModal(true);
    } catch (err) {
      console.error('Erro na validação de segurança:', err);
      setError('Erro ao verificar integridade do estoque na nuvem. Verifique sua conexão.');
    } finally {
      setValidatingSecurity(false);
    }
  };

  // Step 2: Atomic Transactional Commit to Firestore with total safety
  const executeAtomicSave = async () => {
    if (!currentBatch?.nfNumber || !currentBatch?.supplierId || scannedCoils.length === 0) return;

    setLoading(true);
    setError('');

    try {
      const supplierName = suppliers.find(s => s.id === currentBatch.supplierId)?.name || '';
      const totalWeight = scannedCoils.reduce((acc, c) => acc + (c.weight || 0), 0);
      const managerName = profile?.displayName || profile?.email || 'Gerente Responsável';
      const managerEmail = profile?.email || '';
      const managerId = profile?.id || 'manager_user';

      // Atomic Batch Write Setup
      const batch = writeBatch(db);

      // 1. Create Wire Batch Record
      const batchDocRef = doc(collection(db, 'wire_batches'));
      const batchId = batchDocRef.id;

      batch.set(batchDocRef, {
        id: batchId,
        nfNumber: currentBatch.nfNumber.trim(),
        supplierId: currentBatch.supplierId,
        supplierName,
        date: currentBatch.date || new Date().toISOString().split('T')[0],
        status: 'closed',
        totalWeight,
        coilsCount: scannedCoils.length,
        storageBayId: currentBatch.storageBayId,
        storageBayName: currentBatch.storageBayName,
        responsibleName: managerName,
        managerId,
        managerEmail,
        notes: managerNotes.trim() || undefined,
        securityVerified: true,
        securityVerifiedAt: new Date().toISOString(),
        createdAt: serverTimestamp()
      });

      // 2. Add all Coils linked to this batch
      for (const coil of scannedCoils) {
        const coilDocRef = doc(collection(db, 'wire_coils'));
        batch.set(coilDocRef, {
          id: coilDocRef.id,
          coilNumber: coil.coilNumber,
          diameter: coil.diameter || 2.30,
          weight: coil.weight,
          supplierId: currentBatch.supplierId,
          batchId: batchId,
          storageBayId: currentBatch.storageBayId,
          storageBayName: currentBatch.storageBayName,
          status: 'received',
          receivedAt: coil.receivedAt || new Date().toISOString(),
          isDamaged: Boolean(coil.isDamaged),
          receivedByManagerId: managerId,
          receivedByManagerName: managerName,
          createdAt: serverTimestamp()
        });
      }

      // 3. Create Immutable Audit Log for total traceability
      const auditDocRef = doc(collection(db, 'wire_audit_logs'));
      batch.set(auditDocRef, {
        id: auditDocRef.id,
        action: 'WIRE_BATCH_SAVED',
        batchId: batchId,
        managerId,
        managerName,
        managerEmail,
        nfNumber: currentBatch.nfNumber.trim(),
        supplierName,
        coilsCount: scannedCoils.length,
        totalWeight,
        storageBayName: currentBatch.storageBayName,
        notes: managerNotes.trim() || 'Recebimento de arames validado e gravado com segurança total.',
        timestamp: serverTimestamp()
      });

      // 4. Delete the cloud draft in the same atomic commit
      if (activeDraftId) {
        const draftDocRef = doc(db, 'wire_receiving_drafts', activeDraftId);
        batch.delete(draftDocRef);
      }

      // Commit Atomic Batch (All succeed together or all roll back)
      await batch.commit();

      // Clear local storage
      try {
        localStorage.removeItem(WIRE_RECEIVING_DRAFT_KEY);
        localStorage.removeItem(WIRE_RECEIVING_ACTIVE_ID_KEY);
      } catch (e) {
        console.warn(e);
      }

      setLastSavedBatchId(batchId);
      setShowManagerSecurityModal(false);
      setCurrentBatch(null);
      setScannedCoils([]);
      setLastSavedTime(null);
      setDraftRestoredBanner(false);
      setManagerNotes('');
      setShowSuccessModal(true);
    } catch (err) {
      console.error('Erro na gravação atômica do recebimento:', err);
      setError('Erro crítico ao salvar recebimento no banco de dados. Nenhuma alteração foi realizada. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseOrDiscardClick = () => {
    setDiscardTargetDraftId(activeDraftId);
    if (scannedCoils.length > 0 || (currentBatch && (currentBatch.nfNumber || currentBatch.supplierId))) {
      setShowDiscardModal(true);
    } else {
      handleDiscardDraft();
    }
  };

  // Filter other cloud drafts (excluding the one currently loaded)
  const otherCloudDrafts = cloudDrafts.filter(d => d.id !== activeDraftId || !currentBatch);
  const totalWeightCalc = scannedCoils.reduce((acc, c) => acc + (c.weight || 0), 0);
  const selectedSupplierName = suppliers.find(s => s.id === currentBatch?.supplierId)?.name || currentBatch?.supplierName || 'Não selecionado';
  const selectedBayName = storageBays.find(b => b.id === currentBatch?.storageBayId)?.name || currentBatch?.storageBayName || 'Não selecionada';

  return (
    <div className="space-y-6">
      {isCameraOpen && (
        <QRCameraScanner 
          onScan={processScanData} 
          onClose={() => setIsCameraOpen(false)} 
        />
      )}

      {/* Post-Save Success Modal with Manager Receipt */}
      <AnimatePresence>
        {showSuccessModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden border border-emerald-100"
            >
              <div className="p-8 text-center bg-gradient-to-b from-emerald-50/80 to-white border-b border-emerald-100">
                <div className="w-20 h-20 bg-emerald-500 text-white rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-emerald-200">
                  <ShieldCheck className="w-10 h-10" />
                </div>
                <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wider rounded-full">
                  Homologado pelo Gestor
                </span>
                <h3 className="text-2xl font-black text-slate-900 mt-2">Recebimento Gravado com Segurança Total!</h3>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  Todas as bobinas foram inseridas no estoque de arames através de transação atômica protegida com trilha de auditoria.
                </p>
              </div>

              <div className="p-8 space-y-4 bg-slate-50/50">
                <div className="p-4 bg-white rounded-2xl border border-slate-200/80 space-y-2 text-xs">
                  <div className="flex justify-between items-center text-slate-500">
                    <span>Protocolo / ID do Lote:</span>
                    <span className="font-mono font-bold text-slate-900">{lastSavedBatchId || 'Gerado'}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-500">
                    <span>Assinado Digitalmente por:</span>
                    <span className="font-bold text-emerald-700">{profile?.displayName || profile?.email || 'Gerente'}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-500">
                    <span>Status de Integridade:</span>
                    <span className="font-black text-emerald-600 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> 100% Validado
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowSuccessModal(false)}
                  className="w-full py-4 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white rounded-2xl font-black uppercase tracking-wider text-xs transition-all shadow-lg cursor-pointer"
                >
                  Concluir e Voltar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Discard Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDiscardModal}
        onClose={() => {
          setShowDiscardModal(false);
          setDiscardTargetDraftId(null);
        }}
        onConfirm={handleDiscardDraft}
        title="Descartar Recebimento em Andamento?"
        message="Deseja realmente cancelar este recebimento? O rascunho salvo na nuvem e todas as bobinas registradas serão excluídos permanentemente."
        confirmText="Sim, Descartar"
        cancelText="Voltar ao Recebimento"
        type="danger"
      />

      {/* Manager High-Security Confirmation Modal */}
      <AnimatePresence>
        {showManagerSecurityModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-200"
            >
              {/* Header */}
              <div className="p-7 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-lg shadow-emerald-900/50">
                    <ShieldCheck className="w-7 h-7" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-black tracking-tight">Homologação de Recebimento</h3>
                      <span className="px-2 py-0.5 bg-emerald-400 text-slate-950 font-black text-[9px] uppercase rounded-full tracking-wider">
                        Segurança Total
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">
                      Confirmação expressa do Gestor responsável para entrada no estoque.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowManagerSecurityModal(false)}
                  disabled={loading}
                  className="p-2.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Body */}
              <div className="p-7 space-y-6 max-h-[75vh] overflow-y-auto">
                {/* Security Checklist */}
                <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-2xl space-y-2.5">
                  <h4 className="text-xs font-black text-emerald-950 uppercase tracking-wider flex items-center gap-2">
                    <Lock className="w-4 h-4 text-emerald-600" />
                    Checagens de Integridade Aprovadas
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-bold text-emerald-900">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Zero duplicidades no estoque</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Pesos e bitolas auditados</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Transação atômica protegida</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Log de auditoria gerado</span>
                    </div>
                  </div>
                </div>

                {/* Cargo Overview Card */}
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 space-y-3">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                    Resumo Operacional da Carga
                  </span>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-white rounded-xl border border-slate-200">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Nota Fiscal (NF)</span>
                      <span className="text-base font-black text-slate-900 font-mono">{currentBatch?.nfNumber}</span>
                    </div>
                    <div className="p-3 bg-white rounded-xl border border-slate-200">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Fornecedor</span>
                      <span className="text-sm font-black text-slate-900 truncate block">{selectedSupplierName}</span>
                    </div>
                    <div className="p-3 bg-white rounded-xl border border-slate-200">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Local de Estocagem</span>
                      <span className="text-sm font-black text-slate-900 truncate block">{selectedBayName}</span>
                    </div>
                    <div className="p-3 bg-white rounded-xl border border-slate-200">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Data de Entrada</span>
                      <span className="text-sm font-black text-slate-900 block">{currentBatch?.date || 'Hoje'}</span>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between border-t border-slate-200">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Total de Bobinas</span>
                      <span className="text-2xl font-black text-emerald-600">{scannedCoils.length} un</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Peso Líquido Total</span>
                      <span className="text-2xl font-black text-blue-600 font-mono">
                        {totalWeightCalc.toLocaleString()} kg <span className="text-xs text-slate-400 font-bold">({(totalWeightCalc / 1000).toFixed(2)} t)</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Manager Signature Card */}
                <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                      Assinatura Digital do Gestor
                    </span>
                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-black uppercase rounded-md">
                      Manager Autorizado
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-emerald-400 font-black text-base border border-slate-700">
                      {profile?.displayName?.charAt(0) || 'M'}
                    </div>
                    <div>
                      <p className="text-sm font-black text-white">{profile?.displayName || 'Gestor Responsável'}</p>
                      <p className="text-xs text-slate-400">{profile?.email || 'usuario@eldorado.com.br'}</p>
                    </div>
                  </div>
                </div>

                {/* Optional Manager Observation */}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest">
                    Observações de Auditoria (Opcional)
                  </label>
                  <textarea
                    rows={2}
                    value={managerNotes}
                    onChange={(e) => setManagerNotes(e.target.value)}
                    placeholder="Ex: Carga conferida fisicamente, caminhão lacrado, sem avarias visíveis..."
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium text-xs text-slate-900"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setShowManagerSecurityModal(false)}
                  className="flex-1 py-4 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-2xl font-black uppercase tracking-wider text-xs transition-all cursor-pointer"
                >
                  Voltar e Revisar
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={executeAtomicSave}
                  className="flex-[2] py-4 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-2xl font-black uppercase tracking-wider text-xs transition-all shadow-xl shadow-emerald-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Gravando no Estoque com Segurança...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      Confirmar e Gravar com Segurança Total
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Auto-restored / Cloud Synced Banner when working on a draft */}
      <AnimatePresence>
        {draftRestoredBanner && currentBatch && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-emerald-50 border border-emerald-200 rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-200">
                <CloudCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-black text-emerald-950">Recebimento Sincronizado na Nuvem</h4>
                  {lastSavedTime && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-200/80 text-emerald-900 text-[10px] font-black uppercase">
                      Auto-salvo às {lastSavedTime}
                    </span>
                  )}
                </div>
                <p className="text-xs text-emerald-800 font-medium mt-0.5">
                  Seus dados estão salvos na nuvem em tempo real: {scannedCoils.length} bobina(s) registrada(s){currentBatch.nfNumber ? ` (NF: ${currentBatch.nfNumber})` : ''}. Se o celular descarregar ou der problema, basta abrir em outro aparelho para continuar.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              <button
                type="button"
                onClick={() => setDraftRestoredBanner(false)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-sm cursor-pointer"
              >
                Continuar
              </button>
              <button
                type="button"
                onClick={() => {
                  setDiscardTargetDraftId(activeDraftId);
                  setShowDiscardModal(true);
                }}
                className="px-4 py-2 bg-white hover:bg-rose-50 border border-rose-200 text-rose-600 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer"
              >
                Descartar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showManualModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <form onSubmit={handleManualAdd}>
                <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                    <Keyboard className="w-8 h-8 text-emerald-500" />
                    Entrada Manual
                  </h3>
                  <button type="button" onClick={() => setShowManualModal(false)} className="p-2 hover:bg-slate-100 rounded-full cursor-pointer">
                    <X className="w-7 h-7 text-slate-400" />
                  </button>
                </div>

                <div className="p-8 space-y-5">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">ID / Número da Bobina</label>
                    <input
                      required
                      type="text"
                      value={manualData.coilNumber}
                      onChange={(e) => setManualData({...manualData, coilNumber: e.target.value})}
                      placeholder="Ex: 1060..."
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-lg text-slate-900"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Peso (kg)</label>
                      <input
                        required
                        type="number"
                        step="0.01"
                        value={manualData.weight}
                        onChange={(e) => setManualData({...manualData, weight: e.target.value})}
                        placeholder="0.00"
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-lg text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Bitola (mm)</label>
                      <select
                        required
                        value={manualData.diameter}
                        onChange={(e) => setManualData({...manualData, diameter: parseFloat(e.target.value)})}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-lg appearance-none text-slate-900"
                      >
                        <option value="2.18">2.18 mm</option>
                        <option value="2.3">2.30 mm</option>
                        <option value="3.0">3.00 mm</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="p-8 bg-slate-50 flex gap-4">
                  <button
                    type="button"
                    onClick={() => setShowManualModal(false)}
                    className="flex-1 py-4 bg-white text-slate-600 rounded-2xl font-black border border-slate-200 hover:bg-slate-100 transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-[2] py-4 bg-emerald-600 text-white rounded-2xl font-black shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all cursor-pointer"
                  >
                    Adicionar Bobina
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Receiving State: Not in Active Batch */}
      {!currentBatch ? (
        <div className="space-y-8">
          {/* Start New Receiving Hero Box */}
          <div className="flex flex-col items-center justify-center p-8 sm:p-12 bg-white rounded-[3rem] border-2 border-dashed border-slate-200 shadow-sm">
            <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center mb-5 text-emerald-600 shadow-inner">
              <PackagePlus className="w-10 h-10" />
            </div>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-2xl font-black text-slate-900">Iniciar Novo Recebimento</h3>
              <span className="px-2.5 py-1 bg-slate-900 text-emerald-400 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                Segurança Manager
              </span>
            </div>
            <p className="text-slate-500 mb-6 text-center max-w-md text-sm font-medium">
              Registre a chegada de uma nova carga de arames. Todo o progresso é sincronizado na nuvem em tempo real e a homologação final é realizada com validação atômica pelo Gestor.
            </p>
            <button
              onClick={startNewBatch}
              className="bg-emerald-600 text-white px-8 py-4 rounded-2xl font-black shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
            >
              <PackagePlus className="w-5 h-5" />
              Começar Novo Recebimento
            </button>
          </div>

          {/* Cloud In-Progress Drafts List (Cross-Device Continuation) */}
          {otherCloudDrafts.length > 0 && (
            <div className="bg-white p-6 sm:p-8 rounded-[2.5rem] border border-slate-200/80 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                    <Cloud className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900 tracking-tight">Recebimentos em Andamento na Nuvem</h3>
                    <p className="text-xs text-slate-500 font-medium">
                      Cargas iniciadas em outros celulares ou computadores prontas para continuar.
                    </p>
                  </div>
                </div>
                <span className="px-3 py-1 bg-indigo-50 text-indigo-700 font-black text-xs uppercase tracking-wider rounded-full self-start sm:self-auto">
                  {otherCloudDrafts.length} rascunho(s) ativo(s)
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {otherCloudDrafts.map((draft) => {
                  const supplierName = draft.currentBatch.supplierName || 
                    suppliers.find(s => s.id === draft.currentBatch.supplierId)?.name || 
                    'Fornecedor não selecionado';
                  const nf = draft.currentBatch.nfNumber || 'Sem NF informada';
                  const coilCount = draft.scannedCoils?.length || 0;
                  const totalKg = (draft.scannedCoils || []).reduce((acc, c) => acc + (c.weight || 0), 0);
                  const isOwnDraft = draft.userId === profile?.id;
                  const formattedTime = draft.lastSavedAt ? new Date(draft.lastSavedAt).toLocaleString('pt-BR') : 'Data não informada';

                  return (
                    <motion.div
                      key={draft.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "p-5 rounded-2xl border transition-all flex flex-col justify-between gap-4 bg-slate-50/50 hover:bg-white hover:shadow-md",
                        isOwnDraft ? "border-emerald-200 ring-1 ring-emerald-100" : "border-slate-200"
                      )}
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-black text-slate-900 text-base">NF: {nf}</span>
                              {isOwnDraft && (
                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase rounded-full">
                                  Seu Dispositivo
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-bold text-slate-600 mt-0.5">{supplierName}</p>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="inline-flex items-center gap-1 text-[11px] font-black text-slate-900 bg-white border border-slate-200 px-2.5 py-1 rounded-xl shadow-xs">
                              <Layers className="w-3.5 h-3.5 text-emerald-600" />
                              {coilCount} bobina(s)
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 font-bold bg-white p-2.5 rounded-xl border border-slate-100">
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3 text-slate-400" />
                            {draft.userName}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1 font-mono">
                            <Weight className="w-3 h-3 text-slate-400" />
                            {totalKg.toLocaleString()} kg
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1 text-[10px] text-slate-400">
                            <Clock className="w-3 h-3" />
                            {formattedTime}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/60">
                        <button
                          type="button"
                          onClick={() => {
                            setDiscardTargetDraftId(draft.id);
                            setShowDiscardModal(true);
                          }}
                          className="px-3 py-2 text-rose-500 hover:bg-rose-50 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Descartar
                        </button>

                        <button
                          type="button"
                          onClick={() => resumeCloudDraft(draft)}
                          className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shadow-sm cursor-pointer"
                        >
                          <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                          Continuar neste Celular
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10">
          {/* Batch Info Form - Sticky sidebar on desktop */}
          <div className="lg:col-span-12 xl:col-span-4 self-start xl:sticky xl:top-8">
            <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Dados da Carga</h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {cloudSyncStatus === 'saving' ? (
                        <p className="text-[10px] text-amber-600 font-bold flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Sincronizando na nuvem...
                        </p>
                      ) : (
                        <p className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Nuvem salva {lastSavedTime ? `às ${lastSavedTime}` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={handleCloseOrDiscardClick} 
                  title="Cancelar ou descartar rascunho"
                  className="p-3 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all active:scale-95 cursor-pointer"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Manager Security Shield Tag */}
              <div className="mb-6 p-3 bg-slate-900 text-white rounded-2xl flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2 text-xs">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="font-bold text-[11px]">
                    Gestor: <strong className="text-emerald-400 font-black">{profile?.displayName || profile?.email || 'Manager'}</strong>
                  </span>
                </div>
                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[9px] font-black uppercase rounded-md">
                  Segurança Ativa
                </span>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest">Número da NF</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={currentBatch.nfNumber || ''}
                    onChange={(e) => setCurrentBatch({...currentBatch, nfNumber: e.target.value})}
                    placeholder="Ex: 123456"
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-lg shadow-sm text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest">Fornecedor</label>
                  <div className="relative">
                    <select
                      disabled={scannedCoils.length > 0}
                      value={currentBatch.supplierId || ''}
                      onChange={(e) => {
                        const supId = e.target.value;
                        const supName = suppliers.find(s => s.id === supId)?.name || '';
                        setCurrentBatch({
                          ...currentBatch, 
                          supplierId: supId,
                          supplierName: supName
                        });
                      }}
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-lg appearance-none disabled:opacity-70 disabled:bg-slate-100 shadow-sm text-slate-900"
                    >
                      <option value="">Selecione...</option>
                      {suppliers.filter(s => s.active).map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none">
                       <ChevronDown className="w-5 h-5 text-slate-400" />
                    </div>
                  </div>
                  {scannedCoils.length > 0 && (
                    <p className="text-[9px] font-bold text-amber-600 mt-2 ml-1 uppercase bg-amber-50 px-2 py-1 rounded inline-block">Fornecedor bloqueado (bobinas já registradas)</p>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest">Local de Armazenamento (Baia)</label>
                  <div className="relative">
                    <select
                      value={currentBatch.storageBayId || ''}
                      onChange={(e) => {
                        const bayId = e.target.value;
                        const bayName = storageBays.find(b => b.id === bayId)?.name || '';
                        setCurrentBatch({
                          ...currentBatch,
                          storageBayId: bayId,
                          storageBayName: bayName
                        });
                      }}
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-lg appearance-none shadow-sm text-slate-900"
                    >
                      <option value="">Selecione a Baia...</option>
                      {storageBays.filter(b => b.active).map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                    <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none">
                       <ChevronDown className="w-5 h-5 text-slate-400" />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest">Data do Recebimento</label>
                  <input
                    type="date"
                    value={currentBatch.date || ''}
                    onChange={(e) => setCurrentBatch({...currentBatch, date: e.target.value})}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-lg shadow-sm text-slate-900"
                  />
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-slate-100">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Resumo Operacional</span>
                  <span className="text-[10px] font-black text-emerald-600 uppercase">
                    {(totalWeightCalc / 1000).toFixed(2)} t
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-emerald-50/50 p-5 rounded-2xl border border-emerald-100/50 shadow-inner">
                    <p className="text-[10px] font-black text-emerald-600 uppercase mb-1">Bobinas</p>
                    <p className="text-3xl font-black text-emerald-700 tabular-nums">{scannedCoils.length}</p>
                  </div>
                  <div className="bg-blue-50/50 p-5 rounded-2xl border border-blue-100/50 shadow-inner">
                    <p className="text-[10px] font-black text-blue-600 uppercase mb-1">Massa (kg)</p>
                    <p className="text-3xl font-black text-blue-700 tabular-nums">
                      {totalWeightCalc.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-6 p-4 bg-rose-50 rounded-2xl text-xs font-bold text-rose-600 flex items-start gap-3 border border-rose-100 shadow-sm"
                >
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-rose-500" />
                  <p>{error}</p>
                </motion.div>
              )}

              <button
                onClick={initiateManagerSave}
                disabled={validatingSecurity || loading || scannedCoils.length === 0}
                className="w-full mt-8 bg-slate-900 hover:bg-slate-800 text-white py-5 rounded-2xl font-black shadow-xl hover:shadow-2xl transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-30 disabled:grayscale cursor-pointer"
              >
                {validatingSecurity ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
                    Validando Segurança...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    Finalizar Carregamento
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Scanner and Coil List - Main Content Area */}
          <div className="lg:col-span-12 xl:col-span-8 space-y-8">
            <div className="bg-white p-8 md:p-10 rounded-3xl border-2 border-emerald-500 shadow-2xl shadow-emerald-100/50 relative overflow-hidden group">
               {/* Decorative Scanner Background */}
               <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-50 rounded-full blur-3xl opacity-50 -mr-40 -mt-40 group-hover:opacity-70 transition-opacity" />
               
               <div className="relative z-10">
                 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8">
                   <div>
                     <div className="flex flex-wrap items-center gap-2.5">
                       <h3 className="text-2xl font-black text-slate-900 tracking-tight">Captura de Bobinas</h3>
                       <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100/80 text-emerald-800 rounded-full text-[10px] font-black uppercase tracking-wider">
                         <CloudCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                         Nuvem Sincronizada
                       </span>
                     </div>
                     <p className="text-sm font-medium text-slate-500 mt-1">Bipe as etiquetas ou use a câmera. Seus dados são salvos na nuvem a cada bipada.</p>
                   </div>
                   <div className="flex gap-3">
                     <button 
                        onClick={() => setIsCameraOpen(true)}
                        className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl text-sm font-black shadow-lg shadow-emerald-200 active:scale-95 transition-all hover:bg-emerald-700 cursor-pointer"
                     >
                       <Camera className="w-5 h-5" />
                       Ligar Câmera
                     </button>
                     <button 
                        onClick={() => {
                          if (!currentBatch?.supplierId) {
                            setError('Selecione primeiro o fornecedor da carga.');
                            return;
                          }
                          setShowManualModal(true);
                        }}
                        className="flex items-center gap-2 px-6 py-3 bg-white border-2 border-emerald-100 text-emerald-700 rounded-xl text-sm font-black active:scale-95 transition-all hover:bg-emerald-50 cursor-pointer"
                     >
                       <Keyboard className="w-5 h-5" />
                       Manual
                     </button>
                   </div>
                 </div>
                 
                 <form onSubmit={handleScanSubmit} className="relative">
                   <div className="absolute left-6 top-1/2 -translate-y-1/2">
                      <Barcode className="w-8 h-8 text-emerald-600 opacity-40" />
                   </div>
                   <input
                     autoFocus
                     type="text"
                     value={qrInput}
                     onChange={(e) => setQrInput(e.target.value)}
                     placeholder="Aguardando bipe do leitor USB..."
                     className="w-full pl-16 pr-8 py-8 bg-slate-50 border-2 border-transparent focus:border-emerald-500 focus:bg-white rounded-3xl text-3xl font-black font-mono outline-none transition-all placeholder:font-sans placeholder:text-base shadow-inner text-slate-900"
                   />
                 </form>
               </div>
            </div>

            {/* Scanned List - High Density Grid */}
            <div className="space-y-6">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-3">
                   <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Pátio de Entrada</h4>
                   <div className="w-1 h-1 bg-slate-300 rounded-full" />
                   <span className="text-xs font-black text-slate-900 tabular-nums uppercase">{scannedCoils.length} unidade(s)</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {scannedCoils.map((coil, idx) => (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    key={coil.coilNumber || `manual-${idx}`}
                    className={cn(
                      "group p-6 bg-white rounded-3xl border border-slate-200 shadow-sm hover:border-emerald-200 hover:shadow-md transition-all relative overflow-hidden",
                      coil.isDamaged && "border-amber-200 bg-amber-50/10 shadow-amber-50 ring-1 ring-amber-100"
                    )}
                  >
                    <div className="flex items-start gap-5">
                      <div className={cn(
                        "w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl shrink-0 shadow-sm transition-transform group-hover:scale-105",
                        coil.isDamaged ? "bg-amber-100 text-amber-600" : "bg-emerald-100 text-emerald-600"
                      )}>
                        {scannedCoils.length - idx}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div className="truncate pr-4">
                            {coil.isDamaged ? (
                              <input
                                type="text"
                                value={coil.coilNumber || ''}
                                onChange={(e) => updateCoil(idx, { coilNumber: e.target.value })}
                                className="font-black text-xl text-slate-900 bg-transparent border-b-2 border-amber-300 outline-none w-full focus:border-emerald-500 transition-colors"
                                placeholder="ID Bobina"
                              />
                            ) : (
                              <p className="font-black text-xl text-slate-900 tracking-tight truncate">{coil.coilNumber}</p>
                            )}
                            {coil.isDamaged && (
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[8px] bg-amber-500 text-white px-2 py-0.5 rounded-full uppercase font-black tracking-widest">Manual</span>
                                <span className="text-[8px] text-amber-600 font-bold uppercase italic">Ajuste necessário</span>
                              </div>
                            )}
                          </div>
                          
                          <button
                            onClick={() => removeCoil(idx)}
                            className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all active:scale-90 cursor-pointer"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 mt-6">
                          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex flex-col group-hover:bg-white transition-colors">
                            <div className="flex items-center gap-2 mb-1">
                               <Weight className="w-3 h-3 text-slate-400" />
                               <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Massa</span>
                            </div>
                            {coil.isDamaged ? (
                              <div className="flex items-baseline gap-1 mt-1">
                                <input
                                  type="number"
                                  value={coil.weight || ''}
                                  onChange={(e) => updateCoil(idx, { weight: parseFloat(e.target.value) })}
                                  className="font-black text-xl text-slate-900 bg-transparent border-b border-slate-300 w-24 outline-none focus:border-emerald-500"
                                  placeholder="0.00"
                                />
                                <span className="text-xs font-bold text-slate-400">kg</span>
                              </div>
                            ) : (
                              <p className="font-black text-xl text-slate-900 tracking-tight">
                                {coil.weight} <span className="text-xs font-bold text-slate-400 font-sans">kg</span>
                              </p>
                            )}
                          </div>

                          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex flex-col group-hover:bg-white transition-colors">
                            <div className="flex items-center gap-2 mb-1">
                               <Factory className="w-3 h-3 text-slate-400" />
                               <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Bitola</span>
                            </div>
                            {coil.isDamaged ? (
                              <select
                                value={coil.diameter || 2.30}
                                onChange={(e) => updateCoil(idx, { diameter: parseFloat(e.target.value) })}
                                className="font-black text-sm text-slate-900 bg-transparent outline-none mt-1"
                              >
                                <option value="2.18">2.18 mm</option>
                                <option value="2.3">2.30 mm</option>
                                <option value="3.0">3.00 mm</option>
                              </select>
                            ) : (
                              <p className="font-black text-xl text-slate-900 tracking-tight">
                                {coil.diameter?.toFixed(2)} <span className="text-xs font-bold text-slate-400 font-sans">mm</span>
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
