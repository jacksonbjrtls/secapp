import React, { useState } from 'react';
import { 
  X, 
  Send, 
  Mail, 
  Star, 
  User, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Clock, 
  MessageSquare, 
  ExternalLink,
  History,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { AppFeedbackSurvey } from '../../types';
import { formatLocalDateTimeBR } from '../../lib/utils';
import { db, auth } from '../../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../../hooks/useAuth';

interface ReplyFeedbackModalProps {
  survey: AppFeedbackSurvey;
  onClose: () => void;
  onSuccess: (updatedSurvey: AppFeedbackSurvey) => void;
}

const QUICK_TEMPLATES = [
  {
    id: 'thanks_improvement',
    title: 'Agradecimento & Melhoria',
    text: 'Olá! Muito obrigado pela sua avaliação e sugestão sincera. Já registramos sua observação e nossa equipe de gestão e desenvolvimento está trabalhando para implementar melhorias e facilitar ainda mais sua rotina operacional no SecApp.'
  },
  {
    id: 'clarification',
    title: 'Esclarecimento Operacional',
    text: 'Olá! Agradecemos pelo seu apontamento na pesquisa. Gostaríamos de esclarecer que essa funcionalidade já foi atualizada na versão mais recente do aplicativo. Caso ainda identifique alguma dificuldade, estamos 100% à disposição para auxiliá-lo.'
  },
  {
    id: 'request_details',
    title: 'Solicitar Mais Detalhes',
    text: 'Olá! Recebemos sua observação com muita atenção. Para podermos solucionar de forma ágil e assertiva, você poderia nos passar mais detalhes sobre em qual tela ou situação específica isso ocorreu? Pode responder diretamente a este e-mail!'
  },
  {
    id: 'compliment',
    title: 'Elogio & Reconhecimento',
    text: 'Olá! Ficamos imensamente felizes com a sua avaliação positiva! Nosso objetivo é fornecer uma ferramenta rápida, segura e prática para você e sua equipe. Continuamos trabalhando diariamente para aprimorar sua experiência.'
  }
];

export const ReplyFeedbackModal: React.FC<ReplyFeedbackModalProps> = ({
  survey,
  onClose,
  onSuccess
}) => {
  const { user, userProfile } = useAuth();
  
  const [subject, setSubject] = useState(
    survey.replySubject || 'SecApp - Retorno sobre sua avaliação da Pesquisa de Satisfação'
  );
  const [message, setMessage] = useState(survey.replyMessage || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);
  const [fallbackMailto, setFallbackMailto] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const senderName = userProfile?.displayName || user?.displayName || 'Gestão SecApp';
  const senderEmail = user?.email || userProfile?.email || 'gestao@eldorado.com.br';

  const handleApplyTemplate = (templateText: string) => {
    setMessage(templateText);
  };

  const handleSendEmail = async () => {
    if (!message.trim()) {
      setError('Por favor, digite uma mensagem de retorno antes de enviar.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessInfo(null);
    setFallbackMailto(null);

    // Pre-calculate client mailto URL as an instant fallback
    const finalSubject = subject.trim() || 'SecApp - Retorno sobre sua avaliação da Pesquisa de Satisfação';
    const mailtoBody = `Olá, ${survey.userName || 'Colaborador'}!\n\nAvaliamos com muita atenção seu feedback na pesquisa de satisfação do SecApp:\n\n` +
      (survey.observation ? `Sua observação: "${survey.observation}"\n\n` : '') +
      `Retorno da Gestão:\n${message.trim()}\n\nAtenciosamente,\n${senderName}\nSecApp - Eldorado Brasil Celulose`;
    const clientMailtoUrl = `mailto:${encodeURIComponent(survey.userEmail)}?subject=${encodeURIComponent(finalSubject)}&body=${encodeURIComponent(mailtoBody)}`;

    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      let response: Response | null = null;
      
      try {
        response = await fetch('/api/admin/reply-feedback', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({
            surveyId: survey.id,
            toEmail: survey.userEmail,
            toName: survey.userName,
            subject: subject.trim(),
            message: message.trim(),
            observation: survey.observation || '',
            rating: survey.rating,
            senderName,
            senderEmail
          })
        });
      } catch (fetchErr: any) {
        console.warn('Direct fetch to /api/admin/reply-feedback failed:', fetchErr);
      }

      let data: any = null;
      if (response) {
        try {
          const responseText = await response.text();
          data = responseText ? JSON.parse(responseText) : null;
        } catch (jsonErr) {
          console.warn('Could not parse response as JSON, falling back:', jsonErr);
        }
      }

      // If server dispatch was not confirmed (or returned failure/warning)
      if (!response || !response.ok || !data || !data.success) {
        const mailtoTarget = data?.mailtoUrl || clientMailtoUrl;
        setFallbackMailto(mailtoTarget);
        
        const errorMsg = data?.error || data?.warning || 
          (response && response.status === 401 
            ? 'Sessão expirada. Você pode abrir e enviar direto pelo seu aplicativo de e-mail abaixo.' 
            : 'Envio automático indisponível no servidor. Use a opção "Abrir no meu E-mail" ou "Registrar Retorno no SecApp".');
        
        setError(errorMsg);
        return;
      }

      // Successful dispatch or mailto prepared by server
      const newHistoryItem = {
        id: 'reply_' + Date.now(),
        repliedAt: new Date().toISOString(),
        repliedBy: senderName,
        repliedByEmail: senderEmail,
        subject: subject.trim(),
        message: message.trim(),
        sentMethod: data.method === 'email' ? ('email' as const) : ('mailto' as const)
      };

      const updatedSurvey: AppFeedbackSurvey = {
        ...survey,
        replied: true,
        repliedAt: new Date().toISOString(),
        repliedBy: senderName,
        repliedByEmail: senderEmail,
        replySubject: subject.trim(),
        replyMessage: message.trim(),
        replySentMethod: data.method === 'email' ? 'email' : 'mailto',
        replyHistory: [...(survey.replyHistory || []), newHistoryItem]
      };

      // Persist directly to Firestore using client authentication (Master privileges)
      if (survey.id) {
        try {
          await updateDoc(doc(db, 'app_feedback_surveys', survey.id), {
            replied: true,
            repliedAt: updatedSurvey.repliedAt,
            repliedBy: senderName,
            repliedByEmail: senderEmail,
            replySubject: subject.trim(),
            replyMessage: message.trim(),
            replySentMethod: data.method === 'email' ? 'email' : 'mailto',
            replyHistory: updatedSurvey.replyHistory
          });
        } catch (dbErr) {
          console.warn('Could not update survey in Firestore directly:', dbErr);
        }
      }

      if (data.method === 'email') {
        setSuccessInfo(data.message || `E-mail enviado com sucesso para ${survey.userEmail}!`);
        setTimeout(() => {
          onSuccess(updatedSurvey);
          onClose();
        }, 1600);
      } else {
        // Mailto prepared
        setFallbackMailto(data.mailtoUrl || clientMailtoUrl);
        setSuccessInfo('Status atualizado como respondido! Clique no botão abaixo para abrir o seu aplicativo de e-mail e concluir o envio.');
        onSuccess(updatedSurvey);
      }

    } catch (err: any) {
      console.error('Error sending feedback reply:', err);
      setFallbackMailto(clientMailtoUrl);
      setError('Envio direto pelo servidor não concluído. Você pode abrir seu aplicativo de e-mail (Gmail / Outlook) clicando abaixo.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenClientMail = async () => {
    const finalSubject = subject.trim() || 'SecApp - Retorno sobre sua avaliação da Pesquisa de Satisfação';
    const mailtoBody = `Olá, ${survey.userName || 'Colaborador'}!\n\nAvaliamos com muita atenção seu feedback na pesquisa de satisfação do SecApp:\n\n` +
      (survey.observation ? `Sua observação: "${survey.observation}"\n\n` : '') +
      `Retorno da Gestão:\n${message.trim()}\n\nAtenciosamente,\n${senderName}\nSecApp - Eldorado Brasil Celulose`;

    const mailtoUrl = `mailto:${encodeURIComponent(survey.userEmail)}?subject=${encodeURIComponent(finalSubject)}&body=${encodeURIComponent(mailtoBody)}`;
    
    // On mobile devices (iOS / Android), window.location.href opens the default Mail app directly without popup block
    try {
      window.location.href = mailtoUrl;
    } catch {
      window.open(mailtoUrl, '_blank');
    }

    if (survey.id && message.trim()) {
      const newHistoryItem = {
        id: 'reply_' + Date.now(),
        repliedAt: new Date().toISOString(),
        repliedBy: senderName,
        repliedByEmail: senderEmail,
        subject: finalSubject,
        message: message.trim(),
        sentMethod: 'mailto' as const
      };

      const updatedSurvey: AppFeedbackSurvey = {
        ...survey,
        replied: true,
        repliedAt: new Date().toISOString(),
        repliedBy: senderName,
        repliedByEmail: senderEmail,
        replySubject: finalSubject,
        replyMessage: message.trim(),
        replySentMethod: 'mailto',
        replyHistory: [...(survey.replyHistory || []), newHistoryItem]
      };

      try {
        await updateDoc(doc(db, 'app_feedback_surveys', survey.id), {
          replied: true,
          repliedAt: updatedSurvey.repliedAt,
          repliedBy: senderName,
          repliedByEmail: senderEmail,
          replySubject: finalSubject,
          replyMessage: message.trim(),
          replySentMethod: 'mailto',
          replyHistory: updatedSurvey.replyHistory
        });
        onSuccess(updatedSurvey);
        setSuccessInfo('Status atualizado como respondido no SecApp!');
      } catch (dbErr) {
        console.warn('Could not update survey document in Firestore:', dbErr);
      }
    }
  };

  const handleSaveInternalOnly = async () => {
    if (!message.trim()) {
      setError('Por favor, digite uma mensagem de retorno antes de registrar.');
      return;
    }

    setLoading(true);
    setError(null);
    const finalSubject = subject.trim() || 'SecApp - Retorno sobre sua avaliação da Pesquisa de Satisfação';

    const newHistoryItem = {
      id: 'reply_' + Date.now(),
      repliedAt: new Date().toISOString(),
      repliedBy: senderName,
      repliedByEmail: senderEmail,
      subject: finalSubject,
      message: message.trim(),
      sentMethod: 'mailto' as const
    };

    const updatedSurvey: AppFeedbackSurvey = {
      ...survey,
      replied: true,
      repliedAt: new Date().toISOString(),
      repliedBy: senderName,
      repliedByEmail: senderEmail,
      replySubject: finalSubject,
      replyMessage: message.trim(),
      replySentMethod: 'mailto',
      replyHistory: [...(survey.replyHistory || []), newHistoryItem]
    };

    try {
      if (survey.id) {
        await updateDoc(doc(db, 'app_feedback_surveys', survey.id), {
          replied: true,
          repliedAt: updatedSurvey.repliedAt,
          repliedBy: senderName,
          repliedByEmail: senderEmail,
          replySubject: finalSubject,
          replyMessage: message.trim(),
          replySentMethod: 'mailto',
          replyHistory: updatedSurvey.replyHistory
        });
      }
      setSuccessInfo('Retorno registrado com sucesso no SecApp!');
      onSuccess(updatedSurvey);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (dbErr: any) {
      console.warn('Could not update survey document in Firestore:', dbErr);
      setError('Erro ao salvar no banco de dados: ' + (dbErr.message || ''));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      id="reply-feedback-modal-backdrop" 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div 
        id="reply-feedback-modal-card" 
        className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto"
      >
        {/* Header bar */}
        <div className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-slate-800 p-5 sm:p-6 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center border border-white/20">
              <Mail className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-black tracking-wider bg-emerald-500/30 text-emerald-200 px-2 py-0.5 rounded-full border border-emerald-400/30">
                  Retorno 1 a 1
                </span>
                {survey.replied && (
                  <span className="text-[10px] font-bold bg-amber-400/30 text-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Já respondido
                  </span>
                )}
              </div>
              <h3 className="text-lg sm:text-xl font-black text-white tracking-tight mt-0.5">
                Dar Retorno por E-mail
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer"
            title="Fechar janela"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Collaborator Profile Banner */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-black text-sm shrink-0">
                {survey.userName?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 text-sm">{survey.userName || 'Colaborador'}</span>
                  {survey.userGroup && (
                    <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.2 rounded">
                      Turno {survey.userGroup}
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-2">
                  <span>{survey.userEmail}</span>
                  {(survey.cargoName || survey.sectorName) && (
                    <>
                      <span>•</span>
                      <span>{[survey.cargoName, survey.sectorName].filter(Boolean).join(' - ')}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map(st => (
                  <Star
                    key={st}
                    className={`w-3.5 h-3.5 ${
                      st <= (survey.rating || 0)
                        ? 'text-amber-400 fill-amber-400'
                        : 'text-slate-200'
                    }`}
                  />
                ))}
              </div>
              <span className="text-xs font-black text-slate-700">
                {survey.rating}/5
              </span>
            </div>
          </div>

          {/* Original Observation Card */}
          <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-amber-800">
              <span className="flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-amber-600" />
                Observação enviada pelo colaborador:
              </span>
              <span className="text-amber-700 font-semibold normal-case">
                {formatLocalDateTimeBR(survey.createdAt)}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-800 font-semibold leading-relaxed italic bg-white/70 p-3 rounded-xl border border-amber-200/50">
              {survey.observation && survey.observation.trim() 
                ? `"${survey.observation.trim()}"` 
                : '(O colaborador não incluiu texto, avaliou apenas com as notas e estrelas)'}
            </p>
            {survey.highlights && survey.highlights.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] font-bold text-amber-700">Destaques selecionados:</span>
                {survey.highlights.map(h => (
                  <span key={h} className="text-[10px] bg-white text-slate-700 px-2 py-0.5 rounded-full border border-amber-200 font-medium">
                    {h}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Previous Reply History if exists */}
          {survey.replyHistory && survey.replyHistory.length > 0 && (
            <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50/50">
              <button
                type="button"
                onClick={() => setShowHistory(!showHistory)}
                className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-black text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <History className="w-4 h-4 text-emerald-600" />
                  Histórico de Retornos Enviados ({survey.replyHistory.length})
                </span>
                {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showHistory && (
                <div className="p-4 space-y-3 divide-y divide-slate-200 border-t border-slate-200 bg-white">
                  {survey.replyHistory.map((hist, idx) => (
                    <div key={hist.id || idx} className="pt-3 first:pt-0 space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span className="font-bold text-slate-700">
                          {hist.repliedBy || 'Gestor'} {hist.repliedByEmail ? `(${hist.repliedByEmail})` : ''}
                        </span>
                        <span>{formatLocalDateTimeBR(hist.repliedAt)}</span>
                      </div>
                      <div className="text-xs font-semibold text-slate-800 bg-slate-50 p-2.5 rounded-xl border border-slate-150">
                        {hist.message}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Quick Suggestions Templates */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Modelos de Resposta Rápida (Clique para usar):
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {QUICK_TEMPLATES.map(tmpl => (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => handleApplyTemplate(tmpl.text)}
                  className="p-2.5 rounded-xl border border-slate-200 bg-white hover:border-emerald-400 hover:bg-emerald-50/40 text-left transition-all group cursor-pointer"
                >
                  <div className="text-xs font-black text-slate-800 group-hover:text-emerald-700 flex items-center justify-between">
                    <span>{tmpl.title}</span>
                    <span className="text-[10px] text-slate-400 group-hover:text-emerald-600 font-bold">Usar</span>
                  </div>
                  <div className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                    {tmpl.text}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Form Composer */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Assunto do E-mail
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Assunto da mensagem"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">
                  Mensagem de Retorno / Resposta
                </label>
                <span className="text-[11px] text-slate-400 font-semibold">
                  {message.length} caracteres
                </span>
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                placeholder="Escreva a resposta e feedback para o colaborador explicando o que foi analisado, se já está em melhoria ou agradecendo..."
                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500 transition-all resize-y leading-relaxed"
              />
            </div>

            <div className="text-[11px] text-slate-500 flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
              <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>
                Assinatura automática: <strong>{senderName}</strong> {senderEmail ? `(${senderEmail})` : ''}
              </span>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-700 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <div className="space-y-2 w-full">
                <p>{error}</p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {fallbackMailto && (
                    <button
                      type="button"
                      onClick={handleOpenClientMail}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Abrir no Meu E-mail (Gmail / Outlook)
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSaveInternalOnly}
                    disabled={loading || !message.trim()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    Salvar Retorno no SecApp
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Success Message */}
          {successInfo && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <p>{successInfo}</p>
                {fallbackMailto && (
                  <button
                    type="button"
                    onClick={handleOpenClientMail}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-all cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Abrir no Gmail / Outlook agora
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Action Footer */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleOpenClientMail}
              disabled={loading || !message.trim()}
              className="w-full sm:w-auto px-3.5 py-2.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title="Abrir diretamente no aplicativo de e-mail do celular ou computador"
            >
              <ExternalLink className="w-4 h-4 text-slate-500" />
              Abrir no Meu E-mail
            </button>
            <button
              type="button"
              onClick={handleSaveInternalOnly}
              disabled={loading || !message.trim()}
              className="hidden sm:inline-flex px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title="Registrar resposta no SecApp sem abrir e-mail externo"
            >
              Salvar no App
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="w-1/3 sm:w-auto px-4 py-2.5 bg-slate-200/80 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSendEmail}
              disabled={loading || !message.trim()}
              className="w-2/3 sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-700/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed active:scale-95"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Enviar E-mail
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
