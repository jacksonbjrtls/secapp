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
  MessageSquare, 
  ExternalLink,
  History,
  ChevronDown,
  ChevronUp,
  Eye,
  Edit3,
  Copy,
  Check,
  Smartphone,
  Globe,
  HelpCircle
} from 'lucide-react';
import { AppFeedbackSurvey } from '../../types';
import { formatLocalDateTimeBR } from '../../lib/utils';
import { db, auth } from '../../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../../hooks/useAuth';
import { 
  generateSecAppEmailHtml, 
  copyFormattedEmailToClipboard, 
  openOutlookWeb, 
  openGmailWeb, 
  openDefaultMailClient, 
  SecAppEmailOptions 
} from '../../lib/emailFormatter';

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
  
  const [activeTab, setActiveTab] = useState<'compose' | 'preview'>('compose');
  const [subject, setSubject] = useState(
    survey.replySubject || 'SecApp - Retorno sobre sua avaliação da Pesquisa de Satisfação'
  );
  const [message, setMessage] = useState(survey.replyMessage || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);
  const [copyNotification, setCopyNotification] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const senderName = userProfile?.displayName || user?.displayName || 'Gestão SecApp';
  const senderEmail = user?.email || userProfile?.email || 'gestao@eldorado.com.br';

  const handleApplyTemplate = (templateText: string) => {
    setMessage(templateText);
  };

  const getEmailOptions = (): SecAppEmailOptions => ({
    toEmail: survey.userEmail,
    toName: survey.userName || 'Colaborador',
    userGroup: survey.userGroup,
    cargoName: survey.cargoName,
    sectorName: survey.sectorName,
    rating: survey.rating,
    observation: survey.observation || '',
    highlights: survey.highlights,
    replyMessage: message.trim(),
    senderName,
    senderEmail,
    subject: subject.trim() || 'SecApp - Retorno sobre sua avaliação da Pesquisa de Satisfação',
    appUrl: window.location.origin
  });

  const notifyCopied = (customMsg?: string) => {
    setCopyNotification(customMsg || 'Identidade visual do SecApp copiada! Basta colar (Ctrl+V) no Outlook ou Gmail.');
    setTimeout(() => {
      setCopyNotification(null);
    }, 4500);
  };

  // 1. Copy Rich Formatted HTML to Clipboard
  const handleCopyFormatted = async () => {
    if (!message.trim()) {
      setError('Por favor, digite uma mensagem de retorno antes de copiar.');
      return;
    }
    const options = getEmailOptions();
    const success = await copyFormattedEmailToClipboard(options);
    if (success) {
      notifyCopied('Design e identidade visual do SecApp copiados! Cole (Ctrl+V) no seu Outlook ou Gmail.');
    } else {
      setError('Não foi possível copiar para a área de transferência neste navegador.');
    }
  };

  // Helper to persist survey state
  const saveReplyRecord = async (method: 'email' | 'mailto' | 'internal') => {
    const finalSubject = subject.trim() || 'SecApp - Retorno sobre sua avaliação da Pesquisa de Satisfação';
    const newHistoryItem = {
      id: 'reply_' + Date.now(),
      repliedAt: new Date().toISOString(),
      repliedBy: senderName,
      repliedByEmail: senderEmail,
      subject: finalSubject,
      message: message.trim(),
      sentMethod: method
    };

    const updatedSurvey: AppFeedbackSurvey = {
      ...survey,
      replied: true,
      repliedAt: new Date().toISOString(),
      repliedBy: senderName,
      repliedByEmail: senderEmail,
      replySubject: finalSubject,
      replyMessage: message.trim(),
      replySentMethod: method,
      replyHistory: [...(survey.replyHistory || []), newHistoryItem]
    };

    if (survey.id) {
      try {
        await updateDoc(doc(db, 'app_feedback_surveys', survey.id), {
          replied: true,
          repliedAt: updatedSurvey.repliedAt,
          repliedBy: senderName,
          repliedByEmail: senderEmail,
          replySubject: finalSubject,
          replyMessage: message.trim(),
          replySentMethod: method,
          replyHistory: updatedSurvey.replyHistory
        });
      } catch (dbErr) {
        console.warn('Could not update survey document in Firestore:', dbErr);
      }
    }

    onSuccess(updatedSurvey);
    return updatedSurvey;
  };

  // 2. Open Outlook Web (Office 365) with formatted clipboard copy
  const handleOpenOutlook = async () => {
    if (!message.trim()) {
      setError('Por favor, digite uma mensagem de retorno antes de abrir o e-mail.');
      return;
    }
    const options = getEmailOptions();
    await copyFormattedEmailToClipboard(options);
    openOutlookWeb(options);
    await saveReplyRecord('mailto');
    setSuccessInfo('Outlook aberto! A identidade visual foi copiada para sua área de transferência. Basta colar (Ctrl+V) no corpo do e-mail.');
  };

  // 3. Open Gmail Web with formatted clipboard copy
  const handleOpenGmail = async () => {
    if (!message.trim()) {
      setError('Por favor, digite uma mensagem de retorno antes de abrir o e-mail.');
      return;
    }
    const options = getEmailOptions();
    await copyFormattedEmailToClipboard(options);
    openGmailWeb(options);
    await saveReplyRecord('mailto');
    setSuccessInfo('Gmail aberto! A identidade visual foi copiada para sua área de transferência. Basta colar (Ctrl+V) no corpo do e-mail.');
  };

  // 4. Open Default Mail App (Outlook Desktop / iOS Mail / Android)
  const handleOpenClientMail = async () => {
    if (!message.trim()) {
      setError('Por favor, digite uma mensagem de retorno antes de abrir o e-mail.');
      return;
    }
    const options = getEmailOptions();
    await copyFormattedEmailToClipboard(options);
    openDefaultMailClient(options);
    await saveReplyRecord('mailto');
    setSuccessInfo('App de e-mail aberto! A identidade visual foi copiada para sua área de transferência. Basta colar (Ctrl+V) no corpo do e-mail.');
  };

  // 5. Send directly via Server API (SMTP / Resend with Rich HTML)
  const handleSendServerEmail = async () => {
    if (!message.trim()) {
      setError('Por favor, digite uma mensagem de retorno antes de enviar.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessInfo(null);

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
          console.warn('Could not parse response as JSON:', jsonErr);
        }
      }

      if (response && response.ok && data && data.success && data.method === 'email') {
        await saveReplyRecord('email');
        setSuccessInfo(data.message || `E-mail com identidade visual SecApp enviado com sucesso para ${survey.userEmail}!`);
        setTimeout(() => {
          onClose();
        }, 1800);
        return;
      }

      // If direct SMTP failed or is not configured on the container
      await saveReplyRecord('mailto');
      const errorMsg = data?.error || data?.warning || 'Envio direto indisponível no servidor. Use os botões abaixo para abrir no Outlook ou Gmail com a identidade visual já copiada.';
      setError(errorMsg);

    } catch (err: any) {
      console.error('Error sending feedback reply:', err);
      setError('Não foi possível concluir o envio automático pelo servidor. Use as opções abaixo do Outlook ou Gmail.');
    } finally {
      setLoading(false);
    }
  };

  // 6. Save Internal Record in SecApp
  const handleSaveInternalOnly = async () => {
    if (!message.trim()) {
      setError('Por favor, digite uma mensagem de retorno antes de registrar.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await saveReplyRecord('internal');
      setSuccessInfo('Retorno registrado com sucesso no SecApp!');
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

  const ratingNum = survey.rating ? Math.max(1, Math.min(5, Math.round(Number(survey.rating)))) : 0;

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
        className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col max-h-[92vh]"
      >
        {/* Top Header */}
        <div className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-slate-800 p-4 sm:p-5 text-white flex items-center justify-between shrink-0">
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
              <h3 className="text-base sm:text-lg font-black text-white tracking-tight mt-0.5">
                Retorno com Identidade Visual SecApp
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="bg-emerald-950/40 p-1 rounded-xl flex items-center border border-white/10">
              <button
                type="button"
                onClick={() => setActiveTab('compose')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'compose'
                    ? 'bg-white text-emerald-900 shadow-xs'
                    : 'text-emerald-200 hover:text-white'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Escrever</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'preview'
                    ? 'bg-white text-emerald-900 shadow-xs'
                    : 'text-emerald-200 hover:text-white'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Identidade Visual</span>
                <span className="sm:hidden">Prévia</span>
              </button>
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
        </div>

        {/* Dynamic Notification Toast */}
        {copyNotification && (
          <div className="bg-emerald-600 text-white px-4 py-2.5 text-xs font-bold flex items-center justify-between gap-2 transition-all animate-slideDown shrink-0">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-200 shrink-0" />
              <span>{copyNotification}</span>
            </div>
            <button
              type="button"
              onClick={() => setCopyNotification(null)}
              className="p-1 hover:bg-white/20 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          
          {/* TAB 1: COMPOSE VIEW */}
          {activeTab === 'compose' && (
            <div className="space-y-4">
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
                      <span className="font-mono">{survey.userEmail}</span>
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
                      Histórico de Retornos Anteriores ({survey.replyHistory.length})
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
                      Mensagem de Retorno / Resposta da Gestão
                    </label>
                    <button
                      type="button"
                      onClick={() => setActiveTab('preview')}
                      className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Ver como fica no E-mail
                    </button>
                  </div>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={5}
                    placeholder="Escreva a resposta explicando o que foi analisado, ações de melhoria tomadas ou agradecimento..."
                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500 transition-all resize-y leading-relaxed"
                  />
                </div>

                <div className="text-[11px] text-slate-500 flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                  <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>
                    Assinatura: <strong>{senderName}</strong> {senderEmail ? `(${senderEmail})` : ''} • Eldorado Brasil Celulose
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SECAPP VISUAL IDENTITY PREVIEW */}
          {activeTab === 'preview' && (
            <div className="space-y-4">
              
              {/* Guidance Banner */}
              <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-2xl flex items-start gap-3 text-xs text-emerald-900">
                <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">
                    Identidade Visual Oficial do SecApp pronta para Outlook e Gmail
                  </p>
                  <p className="text-[11.5px] text-emerald-800 leading-relaxed">
                    Ao clicar em <strong>Abrir no Outlook</strong> ou <strong>Abrir no Gmail</strong>, a mensagem é pré-preenchida e a formatação visual rica abaixo é <strong>copiada automaticamente</strong> para a sua área de transferência. Basta clicar no corpo do e-mail e <strong>colar (Ctrl+V)</strong> para enviar com o design oficial completo!
                  </p>
                </div>
              </div>

              {/* Quick Actions in Preview */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-100/80 rounded-2xl border border-slate-200">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5 pl-1">
                  <Copy className="w-3.5 h-3.5 text-emerald-600" />
                  Ações Rápidas de Disparo:
                </span>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleCopyFormatted}
                    className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs hover:border-emerald-500"
                    title="Copiar HTML formatado para colar em qualquer cliente de e-mail"
                  >
                    <Copy className="w-3.5 h-3.5 text-emerald-600" />
                    Copiar Formatação
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenOutlook}
                    className="px-3 py-1.5 bg-[#0078d4] hover:bg-[#106ebe] text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                    title="Abrir no Microsoft Outlook (Web / Office 365)"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    Abrir no Outlook
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenGmail}
                    className="px-3 py-1.5 bg-[#ea4335] hover:bg-[#d93025] text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                    title="Abrir no Gmail Web"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    Abrir no Gmail
                  </button>
                </div>
              </div>

              {/* Exact Visual Render of the Email Card */}
              <div className="bg-slate-100 p-3 sm:p-6 rounded-2xl border border-slate-200 overflow-hidden flex justify-center">
                <div className="w-full max-w-[580px] bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden text-slate-800 text-left font-sans">
                  
                  {/* Top Emerald Accent Stripe */}
                  <div className="h-2 bg-emerald-600 w-full" />

                  {/* Header Banner */}
                  <div className="p-5 sm:p-6 bg-gradient-to-b from-emerald-50/80 to-white border-b border-slate-100">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="bg-emerald-700 text-white font-extrabold px-3 py-1.5 rounded-lg text-sm tracking-tight flex items-center gap-1.5 shadow-xs">
                          <span>🛡️</span>
                          <span>SecApp</span>
                        </div>
                        <span className="text-xs font-bold text-emerald-800 uppercase tracking-wide">
                          Eldorado Brasil Celulose
                        </span>
                      </div>
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 bg-emerald-100/90 border border-emerald-300/80 px-2.5 py-1 rounded-full">
                        Pesquisa de Avaliação
                      </span>
                    </div>

                    <h4 className="text-base sm:text-lg font-black text-slate-900 tracking-tight mt-3">
                      Retorno sobre sua Avaliação no SecApp
                    </h4>
                  </div>

                  {/* Email Body */}
                  <div className="p-5 sm:p-6 space-y-4">
                    <p className="text-sm font-semibold text-slate-900">
                      Olá, <strong className="text-emerald-700">{survey.userName || 'Colaborador'}</strong>!
                    </p>

                    <p className="text-xs text-slate-600 leading-relaxed">
                      Agradecemos imensamente pela sua participação na nossa <strong>Pesquisa de Avaliação do SecApp</strong>. Sua avaliação e seus apontamentos sinceros são fundamentais para que possamos aprimorar continuamente a ferramenta, a agilidade das checagens e a rotina operacional da sua equipe.
                    </p>

                    {/* Identified Details */}
                    {(survey.userGroup || survey.cargoName || survey.sectorName) && (
                      <div className="text-[11px] text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-150">
                        Identificação: <strong>{[survey.userGroup ? `Turno ${survey.userGroup}` : '', survey.cargoName, survey.sectorName].filter(Boolean).join(' • ')}</strong>
                      </div>
                    )}

                    {/* Collaborator Review Box */}
                    <div className="bg-amber-50/80 border border-amber-200 border-l-4 border-l-amber-500 rounded-xl p-3.5 space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-amber-800">
                        <span>📌 Sua Avaliação Registrada:</span>
                        {ratingNum > 0 && (
                          <span className="text-amber-600 font-black tracking-widest text-xs">
                            {'★'.repeat(ratingNum)}{'☆'.repeat(5 - ratingNum)} ({ratingNum}/5)
                          </span>
                        )}
                      </div>

                      {survey.observation && survey.observation.trim() ? (
                        <div className="text-xs text-slate-700 italic bg-white/90 p-3 rounded-lg border border-amber-200/60 leading-relaxed font-medium">
                          "{survey.observation.trim()}"
                        </div>
                      ) : (
                        <div className="text-xs text-amber-700 italic">
                          (Avaliação quantitativa com nota registrada)
                        </div>
                      )}

                      {survey.highlights && survey.highlights.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 pt-1">
                          <span className="text-[10px] font-bold text-amber-800">Destaques:</span>
                          {survey.highlights.map(h => (
                            <span key={h} className="text-[10px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full border border-amber-200 font-semibold">
                              {h}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Management Response Box */}
                    <div className="bg-emerald-50/90 border border-emerald-200 border-l-4 border-l-emerald-600 rounded-xl p-4 space-y-2">
                      <div className="text-[11.5px] font-black uppercase tracking-wider text-emerald-900 flex items-center justify-between">
                        <span>💬 Retorno da Gestão / Analisado por: <strong>{senderName}</strong></span>
                      </div>
                      <div className="text-xs sm:text-sm text-emerald-950 font-medium leading-relaxed whitespace-pre-line">
                        {message.trim() || '(Digite a mensagem na aba "Escrever" para pré-visualizar aqui...)'}
                      </div>
                    </div>

                    <p className="text-xs text-slate-500 leading-relaxed">
                      Continuamos à total disposição para ouvir suas sugestões. Se desejar esclarecer qualquer ponto ou acrescentar novos detalhes, sinta-se à vontade para responder a esta mensagem.
                    </p>

                    {/* Call to Action Button */}
                    <div className="text-center pt-2 pb-1">
                      <span className="inline-block bg-emerald-600 text-white font-bold text-xs px-6 py-2.5 rounded-lg shadow-sm">
                        Acessar o SecApp
                      </span>
                    </div>

                  </div>

                  {/* Email Footer */}
                  <div className="bg-slate-50 border-t border-slate-200 p-4 text-center space-y-1">
                    <p className="text-xs font-bold text-slate-800">
                      SecApp • Gestão de Segurança e Operações
                    </p>
                    <p className="text-[11px] font-semibold text-emerald-700">
                      Eldorado Brasil Celulose S.A.
                    </p>
                    <p className="text-[10px] text-slate-400">
                      Mensagem oficial enviada por {senderName} {senderEmail ? `(${senderEmail})` : ''} • Três Lagoas - MS
                    </p>
                  </div>

                </div>
              </div>

            </div>
          )}

          {/* Feedback Messages */}
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-semibold text-rose-700 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <div className="space-y-2 w-full">
                <p>{error}</p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleOpenOutlook}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0078d4] text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs hover:bg-[#106ebe]"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    Abrir no Outlook Web
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenGmail}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#ea4335] text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs hover:bg-[#d93025]"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    Abrir no Gmail
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenClientMail}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs hover:bg-slate-800"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    Abrir no App do Celular
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveInternalOnly}
                    disabled={loading || !message.trim()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs hover:bg-emerald-800"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Salvar Retorno no SecApp
                  </button>
                </div>
              </div>
            </div>
          )}

          {successInfo && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-semibold text-emerald-800 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <p>{successInfo}</p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleOpenOutlook}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0078d4] text-white rounded-lg text-xs font-bold hover:bg-[#106ebe] transition-all cursor-pointer"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    Abrir Outlook
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenGmail}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#ea4335] text-white rounded-lg text-xs font-bold hover:bg-[#d93025] transition-all cursor-pointer"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    Abrir Gmail
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Action Footer */}
        <div className="p-3.5 sm:p-5 bg-slate-50 border-t border-slate-200 flex flex-col md:flex-row items-center justify-between gap-3 shrink-0">
          
          {/* Direct External Web/App Buttons */}
          <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
            <button
              type="button"
              onClick={handleOpenOutlook}
              disabled={loading || !message.trim()}
              className="px-3 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-[#0078d4] rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs hover:border-[#0078d4]"
              title="Abrir no Microsoft Outlook Web já com destinatário e texto formatado copiado"
            >
              <Globe className="w-3.5 h-3.5" />
              Outlook
            </button>

            <button
              type="button"
              onClick={handleOpenGmail}
              disabled={loading || !message.trim()}
              className="px-3 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-[#ea4335] rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs hover:border-[#ea4335]"
              title="Abrir no Gmail Web já com destinatário e texto formatado copiado"
            >
              <Mail className="w-3.5 h-3.5" />
              Gmail
            </button>

            <button
              type="button"
              onClick={handleOpenClientMail}
              disabled={loading || !message.trim()}
              className="px-3 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
              title="Abrir no aplicativo padrão de e-mail do celular ou computador"
            >
              <Smartphone className="w-3.5 h-3.5 text-slate-500" />
              App de E-mail
            </button>

            <button
              type="button"
              onClick={handleCopyFormatted}
              disabled={loading || !message.trim()}
              className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title="Copiar HTML rico formatado com a identidade visual do SecApp"
            >
              <Copy className="w-3.5 h-3.5 text-emerald-600" />
              Copiar Visual
            </button>
          </div>

          {/* Primary Submit & Close Actions */}
          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            <button
              type="button"
              onClick={handleSaveInternalOnly}
              disabled={loading || !message.trim()}
              className="px-3 py-2 bg-slate-200/80 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title="Registrar retorno no SecApp sem abrir e-mail externo"
            >
              Salvar no App
            </button>

            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Fechar
            </button>

            <button
              type="button"
              onClick={handleSendServerEmail}
              disabled={loading || !message.trim()}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-700/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed active:scale-95"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Enviando...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Enviar pelo Servidor</span>
                </>
              )}
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
