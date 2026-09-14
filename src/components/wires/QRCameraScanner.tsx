import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats, CameraDevice } from 'html5-qrcode';
import { X, Camera, RefreshCw, Zap, Image as ImageIcon, SwitchCamera, AlertCircle } from 'lucide-react';

interface QRCameraScannerProps {
  onScan: (data: string) => void;
  onClose: () => void;
}

export const QRCameraScanner: React.FC<QRCameraScannerProps> = ({ onScan, onClose }) => {
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [availableCameras, setAvailableCameras] = useState<CameraDevice[]>([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState<number>(0);
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const isProcessingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sound beep confirmation
  const playScanBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1760, audioCtx.currentTime); // High pitch A6
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.12);
    } catch {}
  };

  const checkTorchSupport = () => {
    try {
      const videoElement = document.querySelector('#qr-reader video') as HTMLVideoElement | null;
      if (videoElement && videoElement.srcObject) {
        const stream = videoElement.srcObject as MediaStream;
        const track = stream.getVideoTracks()[0];
        if (track) {
          const capabilities = (track.getCapabilities ? track.getCapabilities() : {}) as any;
          if (capabilities && capabilities.torch) {
            setHasTorch(true);
            return;
          }
        }
      }
    } catch {}
    setHasTorch(false);
  };

  const toggleTorch = async () => {
    try {
      const videoElement = document.querySelector('#qr-reader video') as HTMLVideoElement | null;
      if (videoElement && videoElement.srcObject) {
        const stream = videoElement.srcObject as MediaStream;
        const track = stream.getVideoTracks()[0];
        if (track) {
          const nextState = !isTorchOn;
          await track.applyConstraints({
            advanced: [{ torch: nextState } as any]
          });
          setIsTorchOn(nextState);
        }
      }
    } catch (err) {
      console.warn("Torch error:", err);
    }
  };

  const handleScanSuccess = useCallback(async (decodedText: string) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    playScanBeep();

    try {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current.clear();
      }
    } catch {}

    onScan(decodedText);
    onClose();
  }, [onScan, onClose]);

  const initCameraWithIndex = async (cameras: CameraDevice[], index: number) => {
    if (!cameras.length) return;
    setIsInitializing(true);
    setError(null);

    const targetCamera = cameras[index % cameras.length];

    try {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        await html5QrCodeRef.current.stop();
      }
    } catch {}

    const formats = [
      Html5QrcodeSupportedFormats.QR_CODE,
      Html5QrcodeSupportedFormats.DATA_MATRIX,
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.CODE_93,
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.ITF,
      Html5QrcodeSupportedFormats.PDF_417,
      Html5QrcodeSupportedFormats.AZTEC,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E
    ];

    const html5QrCode = html5QrCodeRef.current || new Html5Qrcode("qr-reader", {
      formatsToSupport: formats,
      verbose: false
    });
    html5QrCodeRef.current = html5QrCode;

    const qrboxCalc = (viewfinderWidth: number, viewfinderHeight: number) => {
      const minDim = Math.min(viewfinderWidth, viewfinderHeight);
      const edge = Math.floor(minDim * 0.85);
      return {
        width: Math.max(edge, 260),
        height: Math.max(edge, 260)
      };
    };

    const config = {
      fps: 25,
      qrbox: qrboxCalc,
      aspectRatio: 1.0,
      disableFlip: false
    };

    try {
      await html5QrCode.start(
        targetCamera.id,
        config,
        handleScanSuccess,
        () => {}
      );
      setCurrentCameraIndex(index);
      setIsInitializing(false);
      setTimeout(checkTorchSupport, 800);
    } catch (err: any) {
      console.warn("Failed with target camera ID, trying environment constraint:", err);
      try {
        await html5QrCode.start(
          { facingMode: "environment" },
          config,
          handleScanSuccess,
          () => {}
        );
        setIsInitializing(false);
        setTimeout(checkTorchSupport, 800);
      } catch (fallbackErr: any) {
        console.error("Camera start failed entirely:", fallbackErr);
        setError("Não foi possível iniciar o leitor. Verifique as permissões de câmera ou utilize a foto da etiqueta.");
        setIsInitializing(false);
      }
    }
  };

  const switchCamera = async () => {
    if (availableCameras.length <= 1) return;
    const nextIndex = (currentCameraIndex + 1) % availableCameras.length;
    await initCameraWithIndex(availableCameras, nextIndex);
  };

  // Scan directly from an uploaded or snapped photo
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingImage(true);
    setScanMessage("Processando foto da etiqueta...");

    try {
      const formats = [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.DATA_MATRIX,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.PDF_417
      ];

      // Use a fresh instance or existing to scan file
      const scanner = html5QrCodeRef.current || new Html5Qrcode("qr-reader", {
        formatsToSupport: formats,
        verbose: false
      });

      const decoded = await scanner.scanFile(file, true);
      playScanBeep();

      try {
        if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
      } catch {}

      onScan(decoded);
      onClose();
    } catch (err) {
      console.warn("Error scanning image file:", err);
      setScanMessage("Código não encontrado na foto. Tente aproximar ou melhorar a iluminação.");
      setTimeout(() => setScanMessage(null), 4000);
    } finally {
      setIsProcessingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    let isMounted = true;

    const startScanner = async () => {
      try {
        const formats = [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.PDF_417,
          Html5QrcodeSupportedFormats.AZTEC,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E
        ];

        const html5QrCode = new Html5Qrcode("qr-reader", {
          formatsToSupport: formats,
          verbose: false
        });
        html5QrCodeRef.current = html5QrCode;

        // Try getting cameras list
        let devices: CameraDevice[] = [];
        try {
          devices = await Html5Qrcode.getCameras();
          if (isMounted) setAvailableCameras(devices);
        } catch {}

        const qrboxCalc = (viewfinderWidth: number, viewfinderHeight: number) => {
          const minDim = Math.min(viewfinderWidth, viewfinderHeight);
          const edge = Math.floor(minDim * 0.85);
          return {
            width: Math.max(edge, 260),
            height: Math.max(edge, 260)
          };
        };

        const config = {
          fps: 25,
          qrbox: qrboxCalc,
          aspectRatio: 1.0,
          disableFlip: false
        };

        // If devices exist, prefer rear camera
        const backCamera = devices.find(d => 
          d.label.toLowerCase().includes('back') || 
          d.label.toLowerCase().includes('traseira') ||
          d.label.toLowerCase().includes('environment') ||
          d.label.toLowerCase().includes('rear')
        );

        const chosenCameraId = backCamera?.id || (devices.length > 0 ? devices[0].id : null);

        if (chosenCameraId) {
          await html5QrCode.start(
            chosenCameraId,
            config,
            handleScanSuccess,
            () => {}
          );
        } else {
          // Fallback to constraint
          try {
            await html5QrCode.start(
              { facingMode: "environment" },
              config,
              handleScanSuccess,
              () => {}
            );
          } catch {
            await html5QrCode.start(
              { facingMode: "user" },
              config,
              handleScanSuccess,
              () => {}
            );
          }
        }

        if (isMounted) {
          setIsInitializing(false);
          setTimeout(checkTorchSupport, 800);
        }
      } catch (err: any) {
        console.error("Error starting QR scanner:", err);
        if (!isMounted) return;

        const errStr = String(err?.message || err || '').toLowerCase();
        if (errStr.includes("notallowed") || errStr.includes("permission")) {
          setError("Acesso à câmera negado. Por favor, libere as permissões de câmera do navegador.");
        } else if (errStr.includes("notfound") || errStr.includes("device not found") || errStr.includes("requested device")) {
          setError("Nenhuma câmera foi encontrada no seu dispositivo. Você pode tirar uma foto da etiqueta abaixo.");
        } else {
          setError("Não foi possível acessar o fluxo de vídeo da câmera. Você pode carregar uma foto da etiqueta diretamente.");
        }
        setIsInitializing(false);
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.stop().catch(console.error);
      }
    };
  }, [handleScanSuccess]);

  const stopAndClose = async () => {
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      try {
        await html5QrCodeRef.current.stop();
      } catch {}
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black select-none">
      {/* Header */}
      <div className="safe-top bg-black/60 backdrop-blur-md p-4 flex items-center justify-between sticky top-0 z-20 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-emerald-500/30">
            <Camera className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-white font-black text-sm tracking-tight leading-none">Leitor de Bobinas</h3>
              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[9px] font-black uppercase rounded-full border border-emerald-500/30">
                Belgo & Morlan
              </span>
            </div>
            <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mt-1">
              QR Code • DataMatrix • Código 128
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Switch Camera if multiple cameras detected */}
          {availableCameras.length > 1 && (
            <button 
              type="button"
              onClick={switchCamera}
              className="p-2.5 bg-white/10 text-white rounded-full hover:bg-white/20 transition-all cursor-pointer active:scale-95"
              title="Trocar lente da câmera"
            >
              <SwitchCamera className="w-5 h-5" />
            </button>
          )}

          <button 
            type="button"
            onClick={stopAndClose}
            className="w-10 h-10 bg-white/10 text-white rounded-full flex items-center justify-center hover:bg-white/20 transition-all cursor-pointer active:scale-95"
            title="Fechar scanner"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Camera Viewport Container */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-zinc-950">
        <div id="qr-reader" className="w-full h-full object-cover"></div>
        
        {/* Visual Target Reticle */}
        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
          <div className="w-72 h-72 sm:w-80 sm:h-80 border-2 border-emerald-500/40 rounded-3xl relative flex items-center justify-center backdrop-contrast-105">
            {/* High-visibility corner brackets */}
            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-emerald-400 rounded-tl-2xl"></div>
            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-emerald-400 rounded-tr-2xl"></div>
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-emerald-400 rounded-bl-2xl"></div>
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-emerald-400 rounded-br-2xl"></div>
            
            {/* Center target crosshair subtle */}
            <div className="w-4 h-0.5 bg-emerald-400/40"></div>
            <div className="h-4 w-0.5 bg-emerald-400/40 absolute"></div>

            {/* Continuous Scanner Laser Line */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-scan-line shadow-[0_0_15px_rgba(52,211,153,0.8)]"></div>
          </div>
          
          <div className="mt-6 px-4 py-2 bg-black/70 backdrop-blur-md rounded-2xl border border-white/10 text-center max-w-xs">
            <p className="text-white font-black text-xs">
              Aponte para o QR Code ou DataMatrix da etiqueta Belgo
            </p>
            <p className="text-emerald-400 text-[10px] font-bold mt-0.5">
              Leitura instantânea em alta precisão
            </p>
          </div>
        </div>

        {/* Scan / Status Toast */}
        {scanMessage && (
          <div className="absolute top-4 left-4 right-4 z-30 p-3 bg-slate-900/90 border border-emerald-500/50 rounded-2xl text-white text-center text-xs font-bold backdrop-blur-md animate-in fade-in flex items-center justify-center gap-2">
            <AlertCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{scanMessage}</span>
          </div>
        )}

        {isInitializing && (
          <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center text-white gap-4 z-20">
            <RefreshCw className="w-10 h-10 animate-spin text-emerald-500" />
            <div className="text-center">
              <p className="font-black text-sm tracking-wider uppercase">Calibrando Sensor Óptico...</p>
              <p className="text-white/40 text-xs mt-1">Carregando decodificador DataMatrix & QR</p>
            </div>
          </div>
        )}

        {isProcessingImage && (
          <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center text-white gap-4 z-30">
            <RefreshCw className="w-10 h-10 animate-spin text-emerald-400" />
            <p className="font-black text-sm tracking-wider">Processando imagem da etiqueta...</p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center text-white p-8 text-center gap-4 z-20">
            <div className="w-16 h-16 bg-rose-500/20 text-rose-500 rounded-3xl flex items-center justify-center">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h4 className="font-black text-base">Atenção na Câmera</h4>
            <p className="text-slate-300 text-xs max-w-sm leading-relaxed">{error}</p>
            
            <div className="flex flex-col sm:flex-row gap-3 mt-3 w-full max-w-xs">
              <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-6 py-3.5 bg-emerald-500 text-slate-950 font-black rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-emerald-400 transition-all cursor-pointer"
              >
                <ImageIcon className="w-4 h-4" />
                Carregar Foto da Etiqueta
              </button>
              <button 
                type="button"
                onClick={stopAndClose}
                className="px-6 py-3 bg-white/10 text-white font-bold rounded-xl text-sm hover:bg-white/20 transition-all cursor-pointer"
              >
                Voltar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Hidden File Input for Alternative Photo Capture/Upload */}
      <input 
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Footer Controls */}
      <div className="safe-bottom p-5 bg-black/80 backdrop-blur-md border-t border-white/10 flex items-center justify-around gap-4 z-20">
        {/* Flash Toggle */}
        <button
          type="button"
          onClick={toggleTorch}
          disabled={!hasTorch}
          className={`px-4 py-2.5 rounded-2xl flex items-center gap-2 transition-all cursor-pointer ${
            isTorchOn 
              ? 'bg-amber-400 text-slate-950 font-black shadow-lg shadow-amber-400/40' 
              : hasTorch 
                ? 'bg-white/10 text-white hover:bg-white/20 font-bold' 
                : 'bg-white/5 text-white/30 cursor-not-allowed opacity-50'
          }`}
          title={hasTorch ? "Ligar/desligar lanterna" : "Lanterna não disponível nesta lente"}
        >
          <Zap className={`w-4 h-4 ${isTorchOn ? 'fill-current' : ''}`} />
          <span className="text-xs">{isTorchOn ? 'Lanterna Ligada' : 'Lanterna'}</span>
        </button>

        {/* Upload Photo Button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="px-4 py-2.5 bg-white/10 text-white hover:bg-white/20 rounded-2xl flex items-center gap-2 text-xs font-bold transition-all cursor-pointer"
          title="Tirar foto ou selecionar imagem da etiqueta"
        >
          <ImageIcon className="w-4 h-4 text-emerald-400" />
          <span>Foto da Etiqueta</span>
        </button>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes scan-line {
          0% { top: 4%; opacity: 0.2; }
          50% { opacity: 1; }
          100% { top: 96%; opacity: 0.2; }
        }
        .animate-scan-line {
          animation: scan-line 2.2s ease-in-out infinite;
        }
        #qr-reader {
          width: 100% !important;
          height: 100% !important;
          border: none !important;
        }
        #qr-reader video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
        }
        #qr-reader__scan_region {
          width: 100% !important;
          height: 100% !important;
        }
        #qr-reader__scan_region video {
          object-fit: cover !important;
        }
        #qr-reader__dashboard_section {
          display: none !important;
        }
      `}} />
    </div>
  );
};

