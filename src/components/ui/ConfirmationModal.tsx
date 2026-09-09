import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, X, Info, Loader2 } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  confirmText?: string;
  onConfirm?: () => void | Promise<void>;
  showConfirmButton?: boolean;
  isLoading?: boolean;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  title,
  message,
  type = 'success',
  confirmText = 'Entendido',
  onConfirm,
  showConfirmButton = false,
  isLoading = false
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const isExecutingRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      setIsProcessing(false);
      isExecutingRef.current = false;
    }
  }, [isOpen]);

  const busy = isProcessing || isLoading;

  const handleConfirm = async () => {
    if (busy || isExecutingRef.current) return;
    isExecutingRef.current = true;
    setIsProcessing(true);
    try {
      if (onConfirm) {
        await Promise.resolve(onConfirm());
      }
      onClose();
    } catch (err) {
      console.error("Erro na confirmação da ação:", err);
    } finally {
      setIsProcessing(false);
      isExecutingRef.current = false;
    }
  };

  const handleClose = () => {
    if (busy) return;
    onClose();
  };

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="w-12 h-12 text-emerald-500" />;
      case 'error':
        return <AlertCircle className="w-12 h-12 text-red-500" />;
      case 'warning':
        return <AlertCircle className="w-12 h-12 text-amber-500" />;
      default:
        return <Info className="w-12 h-12 text-blue-500" />;
    }
  };

  const getButtonClass = () => {
    switch (type) {
      case 'success':
        return 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-200';
      case 'error':
        return 'bg-red-500 hover:bg-red-600 shadow-red-200';
      case 'warning':
        return 'bg-amber-500 hover:bg-amber-600 shadow-amber-200';
      default:
        return 'bg-blue-500 hover:bg-blue-600 shadow-blue-200';
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />
          
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200/50 overflow-hidden"
          >
            <div className="p-8 pb-6 flex flex-col items-center text-center">
              <div className="mb-6 p-4 bg-slate-50 rounded-3xl">
                {getIcon()}
              </div>
              
              <h3 className="text-xl font-black text-slate-900 mb-2 tracking-tight">
                {title}
              </h3>
              
              <p className="text-slate-500 font-medium leading-relaxed">
                {message}
              </p>
            </div>
            
            <div className="p-6 pt-0 flex gap-3">
              {showConfirmButton && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleClose}
                  className="flex-1 py-4 rounded-2xl text-slate-500 font-black uppercase tracking-widest text-sm transition-all active:scale-95 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  Cancelar
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={handleConfirm}
                className={`${showConfirmButton ? 'flex-1' : 'w-full'} py-4 rounded-2xl text-white font-black uppercase tracking-widest text-sm transition-all active:scale-95 shadow-lg ${getButtonClass()} disabled:opacity-75 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer`}
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                <span>{busy ? 'Processando...' : confirmText}</span>
              </button>
            </div>
            
            {!busy && (
              <button 
                type="button"
                onClick={handleClose}
                className="absolute top-4 right-4 p-2 text-slate-300 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
