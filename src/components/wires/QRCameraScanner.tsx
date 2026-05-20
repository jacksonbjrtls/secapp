import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Camera, RefreshCw, Zap } from 'lucide-react';

interface QRCameraScannerProps {
  onScan: (data: string) => void;
  onClose: () => void;
}

export const QRCameraScanner: React.FC<QRCameraScannerProps> = ({ onScan, onClose }) => {
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const isProcessingRef = useRef(false);

  useEffect(() => {
    const startScanner = async () => {
      try {
        const html5QrCode = new Html5Qrcode("qr-reader");
        html5QrCodeRef.current = html5QrCode;

        const config = {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.EAN_13
          ]
        };

        await html5QrCode.start(
          { facingMode: "environment" }, // Prefer back camera
          config,
          (decodedText) => {
            if (isProcessingRef.current) return;
            isProcessingRef.current = true;
            
            onScan(decodedText);
            stopAndClose();
          },
          (errorMessage) => {
            // Silently handle scan errors (mostly no QR found in frame)
          }
        );
        setIsInitializing(false);
      } catch (err) {
        console.error("Error starting QR scanner:", err);
        setError("Não foi possível acessar a câmera. Verifique as permissões.");
        setIsInitializing(false);
      }
    };

    startScanner();

    return () => {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.stop().catch(console.error);
      }
    };
  }, []);

  const stopAndClose = async () => {
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      await html5QrCodeRef.current.stop();
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black">
      {/* Header */}
      <div className="safe-top bg-black/50 backdrop-blur-md p-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center text-white">
            <Camera className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-white font-black leading-none">Scanner Ativo</h3>
            <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest mt-1">Traseira (Environment)</p>
          </div>
        </div>
        <button 
          onClick={stopAndClose}
          className="w-12 h-12 bg-white/10 text-white rounded-full flex items-center justify-center hover:bg-white/20 transition-all"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Camera Viewport Container */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center">
        <div id="qr-reader" className="w-full h-full object-cover"></div>
        
        {/* Overlay Overlay */}
        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
            {/* Target Area */}
            <div className="w-64 h-64 border-2 border-emerald-500/50 rounded-3xl relative">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-emerald-500 rounded-tl-xl"></div>
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-emerald-500 rounded-tr-xl"></div>
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-emerald-500 rounded-bl-xl"></div>
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-emerald-500 rounded-br-xl"></div>
                
                {/* Scanner Line */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500/30 animate-scan-line shadow-[0_0_15px_rgba(16,185,129,0.5)]"></div>
            </div>
            
            <p className="text-white/70 text-sm font-bold mt-8 text-center px-8">
                Posicione o código ArcelorMittal ou manuais no centro do visor.
            </p>
        </div>

        {isInitializing && (
          <div className="absolute inset-0 bg-black flex flex-col items-center justify-center text-white gap-4">
             <RefreshCw className="w-10 h-10 animate-spin text-emerald-500" />
             <p className="font-bold text-sm tracking-widest uppercase animate-pulse">Iniciando Sensor...</p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center text-white p-8 text-center gap-4">
             <div className="w-16 h-16 bg-rose-500/20 text-rose-500 rounded-3xl flex items-center justify-center">
               <X className="w-8 h-8" />
             </div>
             <p className="font-bold">{error}</p>
             <button 
                onClick={stopAndClose}
                className="mt-4 px-8 py-3 bg-white text-black font-black rounded-2xl"
             >
                Voltar
             </button>
          </div>
        )}
      </div>

      {/* Footer Controls */}
      <div className="safe-bottom p-8 bg-black/50 backdrop-blur-md flex items-center justify-center gap-8">
        <button className="w-16 h-16 bg-white/5 text-white/50 rounded-full flex flex-col items-center justify-center gap-1 opacity-50 cursor-not-allowed">
            <Zap className="w-6 h-6" />
            <span className="text-[8px] font-black uppercase">Flash</span>
        </button>
        <div className="w-1 h-8 bg-white/10 rounded-full"></div>
        <div className="text-center">
            <p className="text-emerald-500 font-black text-xs uppercase tracking-tighter">Auto-Focus Ativado</p>
            <p className="text-white/30 text-[8px] font-bold uppercase mt-1">Processamento em Tempo Real</p>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes scan-line {
            0% { top: 0; }
            100% { top: 100%; }
        }
        .animate-scan-line {
            animation: scan-line 2s linear infinite;
        }
        #qr-reader__scan_region video {
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
        }
      `}} />
    </div>
  );
};
