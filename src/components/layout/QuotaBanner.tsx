import React, { useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink, RefreshCw, X } from 'lucide-react';
import { subscribeToQuotaStatus, resetQuotaStatus } from '../../lib/errorHandler';

export const QuotaBanner: React.FC = () => {
  const [exceeded, setExceeded] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    return sessionStorage.getItem('secapp_dismissed_quota_banner') === 'true';
  });

  useEffect(() => {
    const unsub = subscribeToQuotaStatus((isExceeded) => {
      setExceeded(isExceeded);
    });
    return () => unsub();
  }, []);

  if (!exceeded || dismissed) return null;

  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || "gen-lang-client-0972067932";
  const databaseId = import.meta.env.VITE_FIREBASE_DATABASE_ID || "ai-studio-0394a074-0ded-48a0-9733-51828b2a3a52";
  const upgradeUrl = `https://console.firebase.google.com/project/${projectId}/firestore/databases/${databaseId}/data?openUpgradeDialog=true`;

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('secapp_dismissed_quota_banner', 'true');
  };

  const handleReload = () => {
    resetQuotaStatus();
    sessionStorage.removeItem('secapp_dismissed_quota_banner');
    window.location.reload();
  };

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 text-amber-900 text-xs shadow-sm sticky top-0 z-40 transition-all">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-amber-950">
              Limite diário de leitura do Firestore atingido (ou propagação do plano em andamento)
            </p>
            <p className="text-amber-800 text-[11px] mt-0.5 leading-relaxed">
              Caso tenha acabado de atualizar para o <strong>Plano Blaze</strong>, a ativação no Google Cloud/Firebase pode levar de 5 a 15 minutos para liberar todas as conexões. Os dados continuam funcionando via cache local.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-center flex-shrink-0">
          <a
            href={upgradeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition-colors shadow-xs"
          >
            Firebase Console
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            onClick={handleReload}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-amber-200 hover:bg-amber-100 text-amber-800 font-semibold text-xs transition-colors cursor-pointer"
            title="Recarregar e testar nova conexão"
          >
            <RefreshCw className="w-3 h-3" />
            Testar / Recarregar
          </button>
          <button
            onClick={handleDismiss}
            className="p-1 text-amber-600 hover:text-amber-900 rounded-md hover:bg-amber-100/60 transition-colors cursor-pointer"
            title="Ocultar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
