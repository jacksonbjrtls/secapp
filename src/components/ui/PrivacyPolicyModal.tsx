import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldAlert, Clock, Scale, ClipboardCheck } from 'lucide-react';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({ isOpen, onClose }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            className="bg-white w-full max-w-2xl rounded-[2.5rem] border border-slate-200 shadow-2xl p-6 md:p-10 space-y-6 relative my-8 text-slate-800"
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-6 right-6 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="pb-4 border-b border-slate-100">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mb-3">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">Política de Privacidade e Termos de Uso</h3>
              <p className="text-xs text-slate-400 font-semibold mt-1 uppercase tracking-wider">Tratamento de Dados sob a LGPD (Lei Geral de Proteção de Dados)</p>
            </div>

            <div className="space-y-6 text-sm leading-relaxed text-slate-600 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
              <div className="space-y-2">
                <h4 className="text-base font-bold text-slate-850 flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4 text-emerald-600" /> 1. Finalidades do Tratamento de Dados
                </h4>
                <p>
                  O presente sistema realiza o tratamento de seus dados de identificação e assinaturas digitais com objetivos estritamente corporativos, preventivos e regulatórios, abrangendo:
                </p>
                <ul className="list-disc list-inside pl-4 space-y-1 font-medium text-slate-500">
                  <li>Auditorias de segurança de máquinas e equipamentos (como checklists de empilhadeiras);</li>
                  <li>Evidências de presença e concordância nos Diálogos Diários de Segurança (DDS Online);</li>
                  <li>Acompanhamento de rotas de inspeção operacional e observações de comportamento seguro;</li>
                  <li>Comprovação trabalhista de cumprimento de normas de saúde e segurança do trabalho (SST).</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="text-base font-bold text-slate-850 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-600" /> 2. Prazo de Retenção de Dados
                </h4>
                <p>
                  Considerando as obrigações legais de comprovação documental de treinamentos, inspeções de segurança e conscientização de riscos:
                </p>
                <p className="font-semibold text-slate-700 bg-slate-50 border border-slate-100 p-4 rounded-2xl">
                  As vistorias de equipamentos, listas de presença de DDS, rotas operacionais e registros de desvios de segurança serão armazenados de forma íntegra e segura por um período mínimo de 5 (cinco) anos para fins trabalhistas, de auditoria externa e fiscalização regulatória aplicável.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="text-base font-bold text-slate-850 flex items-center gap-2">
                  <Scale className="w-4 h-4 text-emerald-600" /> 3. Consentimento e Amparo Legal
                </h4>
                <p>
                  O tratamento de dados é amparado pelo cumprimento de obrigação legal ou regulatória pelo controlador (Artigo 7º, inciso II da LGPD) e, quando aplicável, pelo consentimento explícito do colaborador para fins de registro oficial em livros e plataformas de SST, garantindo a rastreabilidade e validade jurídica de todas as vistorias e treinamentos.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="text-base font-bold text-slate-850">4. Seus Direitos como Titular</h4>
                <p>
                  Conforme a legislação brasileira (LGPD), você poderá, a qualquer momento, solicitar informações sobre seus dados tratados, solicitar a correção de dados incompletos ou desatualizados, bem como tirar dúvidas adicionais junto à equipe de segurança do trabalho ou administração da plataforma.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-150 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-2xl transition-all uppercase tracking-wider cursor-pointer"
              >
                Fechar e retornar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
