import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User, 
  Users, 
  Factory, 
  Briefcase, 
  Calendar, 
  Shirt, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowRight, 
  Lock, 
  Sparkles,
  Clock,
  X
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { 
  getProfileCompletionStatus, 
  recordProfileReminderDismiss,
  REQUIRED_PROFILE_FIELDS,
  RequiredProfileFieldMeta
} from '../../lib/profileCompletion';
import { cn } from '../../lib/utils';

export const ProfileCompletionModal: React.FC = () => {
  const { user, profile, isApproved } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const status = getProfileCompletionStatus(profile);
  const isProfilePage = location.pathname === '/profile';

  // Real-time evaluation of whether to show modal or enforce lock
  useEffect(() => {
    // 1. If not logged in or not approved, do not show
    if (!user || !isApproved) {
      setIsOpen(false);
      return;
    }

    // 2. If profile is completely filled, NEVER show!
    if (status.isComplete) {
      setIsOpen(false);
      return;
    }

    // 3. If locked (3rd notice or above without completion):
    if (status.isLocked) {
      // If user is NOT on /profile, immediately force redirect to /profile
      if (!isProfilePage) {
        navigate('/profile', { replace: true });
      }
      // On /profile, the in-page banner takes over to allow typing smoothly without modal obstruction
      setIsOpen(false);
      return;
    }

    // 4. If user is currently on /profile, do not cover the form with a modal
    if (isProfilePage) {
      setIsOpen(false);
      return;
    }

    // 5. If not locked yet (reminderCount < 3), check session postponement
    const isPostponedInSession = sessionStorage.getItem(`secapp_profile_reminder_postponed_${user.uid}`) === 'true';
    if (isPostponedInSession) {
      setIsOpen(false);
      return;
    }

    // Show the intelligent popout
    setIsOpen(true);
  }, [user, isApproved, status.isComplete, status.isLocked, isProfilePage, location.pathname, navigate]);

  if (!isOpen || status.isComplete) {
    return null;
  }

  const currentAttempt = status.reminderCount + 1; // 1, 2 or 3
  const isLastWarning = currentAttempt === 2;
  const isForcedFinal = currentAttempt >= 3;

  const handleGoToProfile = async () => {
    setIsProcessing(true);
    setIsOpen(false);
    navigate('/profile');
  };

  const handlePostpone = async () => {
    if (!user || isForcedFinal || isProcessing) return;
    setIsProcessing(true);

    try {
      await recordProfileReminderDismiss(user.uid, status.reminderCount);
      setIsOpen(false);
    } catch (err) {
      console.error('Error postponing profile reminder:', err);
      setIsOpen(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const getFieldIcon = (iconName: RequiredProfileFieldMeta['iconName']) => {
    switch (iconName) {
      case 'User': return <User className="w-4 h-4" />;
      case 'Users': return <Users className="w-4 h-4" />;
      case 'Factory': return <Factory className="w-4 h-4" />;
      case 'Briefcase': return <Briefcase className="w-4 h-4" />;
      case 'Calendar': return <Calendar className="w-4 h-4" />;
      case 'Shirt': return <Shirt className="w-4 h-4" />;
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
        <motion.div
          initial={{ opacity: 0, scale: 0.93, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.93, y: 16 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="bg-white rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl border border-slate-100 max-w-lg w-full overflow-hidden flex flex-col max-h-[calc(100dvh-1.5rem)]"
        >
          {/* Top Stage Accent Banner */}
          <div className={cn(
            "p-6 pb-5 text-white transition-colors relative overflow-hidden",
            isForcedFinal 
              ? "bg-gradient-to-r from-rose-600 via-rose-700 to-slate-900" 
              : isLastWarning
              ? "bg-gradient-to-r from-amber-500 via-amber-600 to-slate-800"
              : "bg-gradient-to-r from-emerald-600 via-emerald-700 to-slate-900"
          )}>
            <div className="flex items-center justify-between gap-3 relative z-10">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-xs flex items-center gap-1.5",
                  isForcedFinal 
                    ? "bg-white/20 text-white" 
                    : isLastWarning 
                    ? "bg-white/20 text-white" 
                    : "bg-white/20 text-white"
                )}>
                  {isForcedFinal ? (
                    <>
                      <Lock className="w-3 h-3" />
                      Aviso 3 de 3 • Preenchimento Obrigatório
                    </>
                  ) : isLastWarning ? (
                    <>
                      <AlertTriangle className="w-3 h-3" />
                      Aviso 2 de 3 • Atenção (Resta 1 Aviso)
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3" />
                      Aviso 1 de 3 • Atualização de Perfil
                    </>
                  )}
                </span>
              </div>

              {!isForcedFinal && (
                <button
                  type="button"
                  onClick={handlePostpone}
                  disabled={isProcessing}
                  className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 hover:text-white flex items-center justify-center transition-all cursor-pointer"
                  title="Fechar e lembrar mais tarde"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="mt-3 relative z-10">
              <h2 className="text-xl md:text-2xl font-black tracking-tight text-white">
                {isForcedFinal
                  ? "Direcionamento Obrigatório ao Meu Perfil"
                  : isLastWarning
                  ? "Complete seus Dados Cadastrais"
                  : "Mantenha seu Perfil Atualizado"}
              </h2>
              <p className="text-xs text-white/90 mt-1 leading-relaxed font-medium">
                {isForcedFinal
                  ? "Você atingiu o 3º aviso sem preenchimento. Para continuar utilizando o sistema, preencha os 6 dados principais."
                  : isLastWarning
                  ? "Atenção: na próxima vez sem preenchimento, o acesso ficará retido na tela Meu Perfil até a conclusão."
                  : "Identificamos dados principais em branco no seu perfil. O preenchimento garante escalas, uniformes e comunicações corretas."}
              </p>
            </div>

            {/* 3-Step Warning Timeline Progress */}
            <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-white/15 relative z-10">
              <div className="flex flex-col gap-1">
                <div className="h-1.5 rounded-full bg-white transition-all shadow-xs" />
                <span className="text-[9px] font-bold text-white/90 uppercase tracking-wider">
                  1º Aviso {currentAttempt >= 1 && '✓'}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <div className={cn(
                  "h-1.5 rounded-full transition-all",
                  currentAttempt >= 2 ? "bg-white shadow-xs" : "bg-white/30"
                )} />
                <span className="text-[9px] font-bold text-white/90 uppercase tracking-wider">
                  2º Aviso {currentAttempt >= 2 && '✓'}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <div className={cn(
                  "h-1.5 rounded-full transition-all",
                  currentAttempt >= 3 ? "bg-white shadow-xs" : "bg-white/30"
                )} />
                <span className="text-[9px] font-bold text-white/90 uppercase tracking-wider">
                  3º Direcionamento {currentAttempt >= 3 && '🔒'}
                </span>
              </div>
            </div>
          </div>

          {/* Modal Body - Scrollable */}
          <div className="p-6 space-y-5 overflow-y-auto flex-1">
            {/* Progress status bar */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-black text-slate-700">Status dos Dados Principais:</span>
                <span className="font-extrabold text-emerald-700">
                  {status.filledCount} de {status.totalCount} preenchidos ({status.percentage}%)
                </span>
              </div>
              <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    status.percentage >= 66 ? "bg-emerald-500" : status.percentage >= 33 ? "bg-amber-500" : "bg-rose-500"
                  )}
                  style={{ width: `${Math.max(status.percentage, 8)}%` }}
                />
              </div>
            </div>

            {/* Checklist of 6 Required Fields */}
            <div>
              <div className="text-[11px] font-black text-slate-400 uppercase tracking-wider mb-2.5">
                Campos Obrigatórios ({status.missingFields.length} pendente{status.missingFields.length > 1 ? 's' : ''}):
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {REQUIRED_PROFILE_FIELDS.map((field) => {
                  const isMissing = status.missingFields.some(m => m.id === field.id);
                  return (
                    <div
                      key={field.id}
                      className={cn(
                        "p-3 rounded-2xl border transition-all flex items-start gap-2.5",
                        isMissing
                          ? "bg-rose-50/60 border-rose-200/80 text-rose-950"
                          : "bg-emerald-50/50 border-emerald-200/70 text-emerald-950"
                      )}
                    >
                      <div className={cn(
                        "w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
                        isMissing 
                          ? "bg-rose-100 text-rose-600" 
                          : "bg-emerald-100 text-emerald-600"
                      )}>
                        {getFieldIcon(field.iconName)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <h4 className="text-xs font-black truncate">{field.label}</h4>
                          {isMissing ? (
                            <span className="text-[9px] font-bold text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded-md shrink-0">
                              Pendente
                            </span>
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 leading-tight mt-0.5 line-clamp-1">
                          {field.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Explanatory notice */}
            <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3.5 flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-[11px] text-amber-900 leading-relaxed font-medium">
                <strong>Regra Operacional:</strong> Você tem até 3 avisos para concluir esses dados. Na 3ª vez sem preenchimento, o sistema trava nesta tela até que o cadastro esteja completo.
              </div>
            </div>
          </div>

          {/* Modal Footer / Actions */}
          <div className="p-6 pt-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center gap-3">
            <button
              type="button"
              onClick={handleGoToProfile}
              className="w-full sm:flex-1 py-3.5 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-2xl shadow-lg shadow-emerald-200 hover:shadow-xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
            >
              <span>Ir para o Meu Perfil e Preencher</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            {!isForcedFinal && (
              <button
                type="button"
                onClick={handlePostpone}
                disabled={isProcessing}
                className="w-full sm:w-auto py-3.5 px-4 bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-800 font-bold text-xs rounded-2xl border border-slate-200 transition-all cursor-pointer text-center whitespace-nowrap"
              >
                {isLastWarning 
                  ? "Continuar (Último aviso)" 
                  : "Lembrar Mais Tarde (Aviso 1 de 3)"}
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
