import React, { useState, useEffect } from 'react';
import { 
  Star, 
  X, 
  Send, 
  CheckCircle2, 
  Sparkles,
  MessageSquareHeart,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../../hooks/useAuth';
import { db } from '../../lib/firebase';
import { 
  collection, 
  addDoc, 
  doc, 
  updateDoc, 
  serverTimestamp, 
  increment,
  query,
  where,
  getDocs,
  limit
} from 'firebase/firestore';

interface AppFeedbackModalProps {
  forceOpen?: boolean;
  onCloseForce?: () => void;
}

const RATING_LABELS: Record<number, { text: string; emoji: string; color: string }> = {
  1: { text: 'Muito Ruim', emoji: '😞', color: 'text-rose-600' },
  2: { text: 'Ruim', emoji: '🙁', color: 'text-orange-500' },
  3: { text: 'Regular', emoji: '😐', color: 'text-amber-500' },
  4: { text: 'Bom', emoji: '🙂', color: 'text-emerald-500' },
  5: { text: 'Excelente!', emoji: '🤩', color: 'text-emerald-600' }
};

const QUICK_TAGS = [
  'Interface limpa e moderna',
  'Fácil de usar e prático',
  'Rápido e responsivo',
  'Facilita a rotina de trabalho',
  'Gostaria de mais relatórios',
  'Precisa de pequenos ajustes'
];

export const AppFeedbackModal: React.FC<AppFeedbackModalProps> = ({ forceOpen = false, onCloseForce }) => {
  const { user, profile, isApproved } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [observation, setObservation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [currentAccessCount, setCurrentAccessCount] = useState<number>(0);

  // Evaluate if popout should be shown to user
  useEffect(() => {
    if (forceOpen) {
      setIsOpen(true);
      return;
    }

    if (!user || !isApproved) {
      setIsOpen(false);
      return;
    }

    // 1. Check if already submitted
    const isSubmittedLocally = localStorage.getItem(`secapp_feedback_submitted_${user.uid}`) === 'true';
    if (profile?.appFeedbackSubmitted || isSubmittedLocally) {
      setIsOpen(false);
      return;
    }

    // 2. Check if user postponed in this browser session
    const isPostponedSession = sessionStorage.getItem(`secapp_feedback_postponed_${user.uid}`) === 'true';
    if (isPostponedSession) {
      setIsOpen(false);
      return;
    }

    // 3. Track current session & calculate total access count
    const checkAccessAndTrigger = async () => {
      try {
        let count = profile?.accessCount || 0;

        // Count new session if not counted in this tab yet
        const sessionCounted = sessionStorage.getItem(`secapp_session_tracked_${user.uid}`) === 'true';
        if (!sessionCounted) {
          sessionStorage.setItem(`secapp_session_tracked_${user.uid}`, 'true');
          count += 1;
          // Update in background
          updateDoc(doc(db, 'users', user.uid), {
            accessCount: increment(1),
            lastLoginAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          }).catch(() => {});
        }

        // If count < 10, check if user has at least 10 historical records in user_login_logs
        if (count < 10) {
          try {
            const logsQ = query(
              collection(db, 'user_login_logs'),
              where('userId', '==', user.uid),
              limit(15)
            );
            const logsSnap = await getDocs(logsQ);
            if (logsSnap.size >= 10) {
              count = Math.max(count, logsSnap.size);
              // Sync back to user document so we don't query again
              updateDoc(doc(db, 'users', user.uid), {
                accessCount: count,
                updatedAt: serverTimestamp()
              }).catch(() => {});
            }
          } catch (err) {
            console.debug('Could not query user_login_logs:', err);
          }
        }

        setCurrentAccessCount(count);

        // Required: only show if user accessed at least 10 times
        if (count >= 10) {
          // Add a smooth delay so it appears gently after the page is loaded
          const timer = setTimeout(() => {
            setIsOpen(true);
          }, 2000);
          return () => clearTimeout(timer);
        }
      } catch (e) {
        console.warn('Error checking feedback trigger:', e);
      }
    };

    checkAccessAndTrigger();
  }, [user, profile, isApproved, forceOpen]);

  const handleToggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handlePostpone = () => {
    if (user) {
      sessionStorage.setItem(`secapp_feedback_postponed_${user.uid}`, 'true');
    }
    setIsOpen(false);
    if (onCloseForce) onCloseForce();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) return;

    setSubmitting(true);
    try {
      if (user) {
        const surveyData = {
          userId: user.uid,
          userEmail: user.email || '',
          userName: profile?.displayName || user.displayName || 'Colaborador',
          userRole: profile?.role || 'viewer',
          userGroup: profile?.group || '',
          cargoName: profile?.cargoName || '',
          sectorName: profile?.sectorName || '',
          rating: rating,
          ratingLabel: RATING_LABELS[rating]?.text || '',
          highlights: selectedTags,
          observation: observation.trim(),
          accessCount: currentAccessCount || profile?.accessCount || 10,
          createdAt: serverTimestamp()
        };

        // Save evaluation to app_feedback_surveys collection
        await addDoc(collection(db, 'app_feedback_surveys'), surveyData);

        // Mark on user's profile that feedback was submitted
        await updateDoc(doc(db, 'users', user.uid), {
          appFeedbackSubmitted: true,
          appFeedbackSubmittedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        // Store locally so it never shows again on this device/browser
        localStorage.setItem(`secapp_feedback_submitted_${user.uid}`, 'true');
      }

      setIsSubmitted(true);

      // Auto close after showing success
      setTimeout(() => {
        setIsOpen(false);
        setIsSubmitted(false);
        if (onCloseForce) onCloseForce();
      }, 2500);

    } catch (err) {
      console.error('Error submitting feedback survey:', err);
      // Even if firestore errors, store local flag to avoid annoying the user
      if (user) {
        localStorage.setItem(`secapp_feedback_submitted_${user.uid}`, 'true');
      }
      setIsSubmitted(true);
      setTimeout(() => {
        setIsOpen(false);
        if (onCloseForce) onCloseForce();
      }, 2000);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div 
        id="app-feedback-modal-backdrop" 
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm"
      >
        <motion.div
          id="app-feedback-modal-card"
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden"
        >
          {/* Header decorative bar */}
          <div className="h-2 w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-500" />

          {/* Close button (Postpones for this session) */}
          <button
            id="btn-close-app-feedback"
            type="button"
            onClick={handlePostpone}
            disabled={submitting}
            className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors z-10"
            title="Lembrar mais tarde"
          >
            <X className="w-5 h-5" />
          </button>

          {isSubmitted ? (
            <div className="p-8 text-center space-y-4">
              <div className="w-16 h-16 mx-auto bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center animate-bounce">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-black text-slate-800 tracking-tight">
                Muito Obrigado!
              </h3>
              <p className="text-sm font-semibold text-slate-600 max-w-sm mx-auto leading-relaxed">
                Sua avaliação foi recebida com sucesso. Sua opinião é essencial para continuarmos aperfeiçoando o novo aplicativo para toda a equipe!
              </p>
              <div className="pt-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700">
                  <Sparkles className="w-3.5 h-3.5" />
                  Feedback registrado com sucesso
                </span>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-6 sm:p-7 space-y-5">
              {/* Header Info */}
              <div className="text-center space-y-1.5 pt-1">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-400 to-emerald-500 text-white shadow-md shadow-emerald-100 mb-1">
                  <MessageSquareHeart className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">
                  Como está sendo sua experiência?
                </h2>
                <p className="text-xs font-medium text-slate-500 max-w-sm mx-auto">
                  Você já é um usuário frequente do nosso novo aplicativo. Conte-nos o que está achando do sistema!
                </p>
              </div>

              {/* Star Rating Selection */}
              <div className="bg-slate-50 border border-slate-150/80 rounded-2xl p-4 text-center space-y-2.5">
                <label className="text-xs font-black uppercase tracking-wider text-slate-500 block">
                  Qual é a sua nota para o sistema? <span className="text-rose-500">*</span>
                </label>
                
                <div className="flex items-center justify-center gap-2 sm:gap-3 py-1">
                  {[1, 2, 3, 4, 5].map((starVal) => {
                    const isFilled = (hoverRating || rating) >= starVal;
                    return (
                      <button
                        key={`star-${starVal}`}
                        type="button"
                        id={`btn-star-rating-${starVal}`}
                        onClick={() => setRating(starVal)}
                        onMouseEnter={() => setHoverRating(starVal)}
                        onMouseLeave={() => setHoverRating(0)}
                        className="p-1 rounded-xl transition-transform hover:scale-125 active:scale-95 focus:outline-none"
                      >
                        <Star 
                          className={`w-8 h-8 sm:w-9 sm:h-9 transition-colors ${
                            isFilled 
                              ? 'text-amber-400 fill-amber-400 drop-shadow-sm' 
                              : 'text-slate-300'
                          }`} 
                        />
                      </button>
                    );
                  })}
                </div>

                {/* Rating Label / Feedback feedback */}
                <div className="h-6 flex items-center justify-center">
                  {(hoverRating || rating) > 0 ? (
                    <span className={`text-sm font-black flex items-center gap-1.5 ${RATING_LABELS[hoverRating || rating]?.color}`}>
                      <span>{RATING_LABELS[hoverRating || rating]?.emoji}</span>
                      <span>{RATING_LABELS[hoverRating || rating]?.text}</span>
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400 font-medium italic">
                      Clique nas estrelas para avaliar
                    </span>
                  )}
                </div>
              </div>

              {/* Quick Tags / Highlights */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 block">
                  O que você destaca no aplicativo? <span className="text-slate-400 font-normal">(opcional)</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_TAGS.map((tag) => {
                    const isSelected = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleToggleTag(tag)}
                        className={`text-[11px] font-bold px-2.5 py-1.5 rounded-xl border transition-all ${
                          isSelected
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Observation Field */}
              <div className="space-y-1.5">
                <label 
                  htmlFor="feedback-observation" 
                  className="text-xs font-bold text-slate-700 flex items-center justify-between"
                >
                  <span>Campo de Observação ou Sugestão <span className="text-slate-400 font-normal">(opcional)</span></span>
                  <span className="text-[10px] text-slate-400 font-mono">{observation.length}/500</span>
                </label>
                <textarea
                  id="feedback-observation"
                  rows={3}
                  maxLength={500}
                  value={observation}
                  onChange={(e) => setObservation(e.target.value)}
                  placeholder="Deixe seu comentário, crítica construtiva ou sugestão de melhoria..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all resize-none"
                />
              </div>

              {/* Footer Actions */}
              <div className="pt-2 flex flex-col-reverse sm:flex-row items-center gap-2">
                <button
                  type="button"
                  id="btn-postpone-feedback"
                  onClick={handlePostpone}
                  disabled={submitting}
                  className="w-full sm:w-auto px-4 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Clock className="w-3.5 h-3.5" />
                  Lembrar mais tarde
                </button>

                <button
                  type="submit"
                  id="btn-submit-feedback"
                  disabled={rating === 0 || submitting}
                  className="w-full sm:flex-1 py-3 px-5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:from-slate-200 disabled:to-slate-200 text-white disabled:text-slate-400 rounded-xl text-xs font-black uppercase tracking-wider shadow-md hover:shadow-lg disabled:shadow-none transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed active:scale-98"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Enviar Avaliação
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
