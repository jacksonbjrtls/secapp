import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats, CameraDevice } from 'html5-qrcode';
import { 
  X, 
  Camera, 
  RefreshCw, 
  Zap, 
  ZapOff, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  QrCode, 
  Keyboard, 
  Check, 
  Volume2, 
  VolumeX, 
  Sliders, 
  Sparkles,
  ClipboardPaste,
  Barcode
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface QualityBarcodeScannerModalProps {
  isOpen?: boolean;
  itemLabel?: string;
  title?: string;
  description?: string;
  currentValue?: string;
  onScan: (decodedText: string) => void;
  onClose: () => void;
}

// Audio beep synthesizer using Web Audio API
const playScanSuccessSound = () => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
    osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.12); // A6

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  } catch {
    // AudioContext might be blocked or unsupported; silent fallback
  }
};

export const QualityBarcodeScannerModal: React.FC<QualityBarcodeScannerModalProps> = ({
  isOpen = true,
  itemLabel,
  title,
  description,
  currentValue = '',
  onScan,
  onClose,
}) => {
  if (!isOpen) return null;
  const displayTitle = title || itemLabel || 'Código / QR Code';

  const [isInitializing, setIsInitializing] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  
  // Torch / Flashlight state
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);

  // Zoom control state
  const [hasHardwareZoom, setHasHardwareZoom] = useState(false);
  const [minZoom, setMinZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(3);
  const [zoomStep, setZoomStep] = useState(0.1);
  const [currentZoom, setCurrentZoom] = useState(1);
  const [showZoomSlider, setShowZoomSlider] = useState(true);

  // Sound toggle
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Manual / USB Scanner Input state
  const [manualCode, setManualCode] = useState(currentValue || '');
  const [showManualInput, setShowManualInput] = useState(false);
  const [lastScannedResult, setLastScannedResult] = useState<string | null>(null);

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const activeTrackRef = useRef<MediaStreamTrack | null>(null);
  const isProcessingRef = useRef(false);
  const isMountedRef = useRef(true);
  const manualInputRef = useRef<HTMLInputElement | null>(null);

  // Barcode USB/Keyboard listener accumulator
  const keyBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  // Success handler
  const handleSuccess = async (decoded: string) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    setLastScannedResult(decoded);

    // Audio & Haptic feedback
    if (soundEnabled) {
      playScanSuccessSound();
    }
    if (navigator.vibrate) {
      try {
        navigator.vibrate([50, 40, 90]);
      } catch {}
    }

    // Gracefully stop scanner and tracks first before notifying parent (to prevent play request interruption on unmount)
    try {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current.clear();
      }
    } catch (e) {
      console.warn('Silent catch stopping scanner on success:', e);
    }

    if (activeTrackRef.current) {
      try {
        activeTrackRef.current.stop();
      } catch {}
      activeTrackRef.current = null;
    }

    setTimeout(() => {
      onScan(decoded);
      onClose();
    }, 250);
  };

  // Inspect track capabilities (hardware zoom & torch)
  const inspectMediaStream = () => {
    try {
      const videoEl = document.querySelector('#quality-qr-reader video') as HTMLVideoElement | null;
      if (videoEl && videoEl.srcObject) {
        const stream = videoEl.srcObject as MediaStream;
        const tracks = stream.getVideoTracks();
        if (tracks && tracks.length > 0) {
          const track = tracks[0];
          activeTrackRef.current = track;

          const caps = (track.getCapabilities ? track.getCapabilities() : {}) as any;

          // Check torch capability
          if (caps.torch) {
            setHasTorch(true);
          } else {
            setHasTorch(false);
          }

          // Check hardware zoom capability
          if (caps.zoom) {
            setHasHardwareZoom(true);
            const min = caps.zoom.min || 1;
            const max = Math.min(caps.zoom.max || 5, 5); // Cap to 5x for stability
            const step = caps.zoom.step || 0.1;
            setMinZoom(min);
            setMaxZoom(max);
            setZoomStep(step);
            const cur = (track.getSettings?.() as any)?.zoom || min;
            setCurrentZoom(cur);
          } else {
            setHasHardwareZoom(false);
            setMinZoom(1);
            setMaxZoom(3);
            setZoomStep(0.25);
          }
        }
      }
    } catch (err) {
      console.warn('Could not inspect video stream capabilities:', err);
    }
  };

  // Apply zoom level (hardware or fallback)
  const applyZoom = async (newZoom: number) => {
    const clamped = Math.max(minZoom, Math.min(newZoom, maxZoom));
    setCurrentZoom(clamped);

    if (hasHardwareZoom && activeTrackRef.current) {
      try {
        await activeTrackRef.current.applyConstraints({
          advanced: [{ zoom: clamped } as any]
        });
      } catch (err) {
        console.warn('Failed applying hardware zoom constraint:', err);
      }
    }

    // Always apply digital CSS scale to video element for fluid responsive zoom effect
    const videoEl = document.querySelector('#quality-qr-reader video') as HTMLVideoElement | null;
    if (videoEl) {
      const digitalFactor = hasHardwareZoom ? 1 : clamped;
      videoEl.style.transform = `scale(${digitalFactor})`;
      videoEl.style.transformOrigin = 'center center';
      videoEl.style.transition = 'transform 0.15s ease-out';
    }
  };

  // Toggle torch / flash
  const toggleTorch = async () => {
    if (!activeTrackRef.current || !hasTorch) return;
    try {
      const nextState = !isTorchOn;
      await activeTrackRef.current.applyConstraints({
        advanced: [{ torch: nextState } as any]
      });
      setIsTorchOn(nextState);
    } catch (err) {
      console.warn('Torch toggle failed:', err);
    }
  };

  // Initialize Scanner instance
  const startCamera = async (cameraId?: string, facing: 'environment' | 'user' = facingMode) => {
    if (!isMountedRef.current) return;
    setIsInitializing(true);
    setErrorMessage(null);
    isProcessingRef.current = false;

    // Stop existing instance if any
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      try {
        await html5QrCodeRef.current.stop();
      } catch (e) {
        // silent catch
      }
    }

    try {
      // Fetch available camera devices list
      const devices = await Html5Qrcode.getCameras();
      if (!isMountedRef.current) return;
      if (devices && devices.length > 0) {
        setCameras(devices);
      }

      const scanner = new Html5Qrcode('quality-qr-reader');
      html5QrCodeRef.current = scanner;

      // Scan configuration with wide rectangular aspect ratio for 1D barcodes and 2D QR
      const config = {
        fps: 15,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          // Calculate a wide, generous scanning box suited for both 1D and 2D codes
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const boxWidth = Math.min(Math.floor(viewfinderWidth * 0.88), 480);
          const boxHeight = Math.min(Math.floor(viewfinderHeight * 0.60), 280);
          return {
            width: Math.max(boxWidth, 260),
            height: Math.max(boxHeight, 160)
          };
        },
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODABAR,
        ],
        videoConstraints: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: facing
        }
      };

      const cameraParam = cameraId ? { deviceId: { exact: cameraId } } : { facingMode: facing };

      await scanner.start(
        cameraParam,
        config,
        (decodedText) => {
          handleSuccess(decodedText);
        },
        () => {}
      );

      if (!isMountedRef.current) {
        if (scanner.isScanning) {
          scanner.stop().then(() => scanner.clear()).catch(() => {});
        }
        return;
      }

      setIsInitializing(false);

      // Inspect capabilities after video starts
      setTimeout(() => {
        if (isMountedRef.current) {
          inspectMediaStream();
        }
      }, 350);

    } catch (err: any) {
      if (!isMountedRef.current) return;
      console.warn('Initial camera start failed, trying fallback:', err);
      // Fallback: try default without explicit resolution constraints
      try {
        if (!html5QrCodeRef.current) {
          html5QrCodeRef.current = new Html5Qrcode('quality-qr-reader');
        }
        await html5QrCodeRef.current.start(
          { facingMode: facing },
          {
            fps: 10,
            qrbox: { width: 300, height: 200 }
          },
          (decodedText) => {
            handleSuccess(decodedText);
          },
          () => {}
        );
        if (!isMountedRef.current) {
          if (html5QrCodeRef.current?.isScanning) {
            html5QrCodeRef.current.stop().then(() => html5QrCodeRef.current?.clear()).catch(() => {});
          }
          return;
        }
        setIsInitializing(false);
        setTimeout(() => {
          if (isMountedRef.current) inspectMediaStream();
        }, 350);
      } catch (fallbackErr: any) {
        if (!isMountedRef.current) return;
        console.error('All camera start attempts failed:', fallbackErr);
        const errStr = String(fallbackErr?.message || fallbackErr || '').toLowerCase();
        if (errStr.includes('notallowed') || errStr.includes('permission')) {
          setErrorMessage('Permissão da câmera foi negada. Permita o acesso à câmera no navegador ou utilize a digitação manual abaixo.');
        } else if (errStr.includes('notfound') || errStr.includes('device not found')) {
          setErrorMessage('Nenhuma câmera foi detectada no dispositivo. Utilize a digitação manual ou leitor USB.');
        } else {
          setErrorMessage('Não foi possível iniciar a câmera. Verifique se outro app está usando a câmera ou digite o código.');
        }
        setIsInitializing(false);
      }
    }
  };

  // Switch facing mode (back / front)
  const toggleFacingMode = () => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextFacing);
    setSelectedCameraId('');
    startCamera(undefined, nextFacing);
  };

  // Switch camera device
  const handleSelectCamera = (devId: string) => {
    setSelectedCameraId(devId);
    startCamera(devId, facingMode);
  };

  // Stop scanner and close
  const stopAndClose = async () => {
    try {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current.clear();
      }
    } catch (e) {
      // silent catch
    }
    if (activeTrackRef.current) {
      try {
        activeTrackRef.current.stop();
      } catch {}
      activeTrackRef.current = null;
    }
    onClose();
  };

  // Handle physical barcode scanner (USB / Bluetooth keyboard wedge) & global keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If user is focused on the manual input element, let natural typing happen
      if (document.activeElement === manualInputRef.current) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (manualCode.trim()) {
            handleSuccess(manualCode.trim());
          }
        }
        return;
      }

      // Escape key closes modal
      if (e.key === 'Escape') {
        stopAndClose();
        return;
      }

      // Barcode Gun detection: rapid keystrokes (< 50ms interval) ending in Enter
      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        if (keyBufferRef.current.length >= 2) {
          const scannedGunCode = keyBufferRef.current.trim();
          keyBufferRef.current = '';
          handleSuccess(scannedGunCode);
        }
      } else if (e.key.length === 1) {
        if (timeDiff > 250) {
          // Reset buffer if delay is long (normal human typing)
          keyBufferRef.current = e.key;
        } else {
          keyBufferRef.current += e.key;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [manualCode]);

  // Paste from clipboard helper
  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        setManualCode(text.trim());
        handleSuccess(text.trim());
      }
    } catch {
      setShowManualInput(true);
      manualInputRef.current?.focus();
    }
  };

  // Initial startup and unmount cleanup
  useEffect(() => {
    isMountedRef.current = true;
    const timer = setTimeout(() => {
      if (isMountedRef.current) {
        startCamera();
      }
    }, 150);

    return () => {
      isMountedRef.current = false;
      clearTimeout(timer);
      if (html5QrCodeRef.current) {
        if (html5QrCodeRef.current.isScanning) {
          html5QrCodeRef.current.stop().then(() => {
            html5QrCodeRef.current?.clear();
          }).catch(() => {});
        } else {
          try {
            html5QrCodeRef.current.clear();
          } catch {}
        }
      }
      if (activeTrackRef.current) {
        try {
          activeTrackRef.current.stop();
        } catch {}
        activeTrackRef.current = null;
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-4 md:p-6 bg-slate-950/95 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-3xl bg-slate-900 border border-slate-700/80 sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden text-white relative"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 flex items-center justify-between z-20 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0 shadow-inner">
              <Barcode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-black text-white uppercase tracking-wider">
                  Leitor de Código de Barras / QR
                </h3>
                <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-500/30 font-mono">
                  HD SCAN
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400 font-medium truncate max-w-[260px] sm:max-w-md mt-0.5">
                {description || <span>Item: <strong className="text-slate-200">{displayTitle}</strong></span>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Sound toggle */}
            <button
              type="button"
              onClick={() => setSoundEnabled(prev => !prev)}
              className={`p-2 rounded-xl border transition-all ${
                soundEnabled 
                  ? 'bg-slate-800 border-slate-700 text-emerald-400 hover:bg-slate-700' 
                  : 'bg-slate-800/50 border-slate-800 text-slate-500 hover:bg-slate-800'
              }`}
              title={soundEnabled ? 'Som ativado' : 'Som desativado'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Close button */}
            <button 
              type="button"
              onClick={stopAndClose}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl border border-slate-700 transition-all ml-1"
              title="Fechar Scanner"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Viewfinder Main Stage */}
        <div className="flex-1 relative bg-black flex flex-col items-center justify-center overflow-hidden min-h-[320px] sm:min-h-[420px]">
          {/* HTML5 QR Code Container */}
          <div 
            id="quality-qr-reader" 
            className="w-full h-full flex items-center justify-center overflow-hidden" 
          />

          {/* High-Visibility Industrial Scanning Guide Overlay */}
          {!errorMessage && !isInitializing && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">
              {/* Wide Target Area for 1D Barcodes + 2D Codes */}
              <div className="w-[88%] max-w-[480px] h-[55%] max-h-[260px] min-h-[160px] relative rounded-2xl border border-emerald-500/30 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] flex items-center justify-center">
                {/* Corner Markers */}
                <div className="absolute -top-1 -left-1 w-7 h-7 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl shadow-sm shadow-emerald-400/50" />
                <div className="absolute -top-1 -right-1 w-7 h-7 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl shadow-sm shadow-emerald-400/50" />
                <div className="absolute -bottom-1 -left-1 w-7 h-7 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl shadow-sm shadow-emerald-400/50" />
                <div className="absolute -bottom-1 -right-1 w-7 h-7 border-b-4 border-r-4 border-emerald-400 rounded-br-xl shadow-sm shadow-emerald-400/50" />

                {/* Laser Red/Emerald Scanning Line */}
                <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-emerald-500/10 via-emerald-400 to-emerald-500/10 shadow-[0_0_12px_#34d399] animate-quality-scan-line" />

                {/* Center crosshair */}
                <div className="w-6 h-6 border border-emerald-400/30 rounded-full flex items-center justify-center opacity-70">
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                </div>
              </div>

              {/* Status helper text */}
              <div className="mt-3 px-4 py-1.5 bg-slate-950/80 backdrop-blur-md rounded-full border border-slate-800 text-[11px] font-bold text-slate-300 flex items-center gap-2 shadow-lg">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                <span>Posicione o código de barras ou QR no quadro central</span>
              </div>
            </div>
          )}

          {/* Loading Indicator */}
          {isInitializing && (
            <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center text-white gap-3 z-30 p-6 text-center">
              <RefreshCw className="w-10 h-10 animate-spin text-emerald-400" />
              <div>
                <p className="font-black text-sm tracking-wider uppercase text-emerald-300">Inicializando Sensor de Câmera...</p>
                <p className="text-xs text-slate-400 mt-1 font-medium">Ajustando foco automático e resolução HD</p>
              </div>
            </div>
          )}

          {/* Success Flash Backdrop */}
          {lastScannedResult && (
            <div className="absolute inset-0 bg-emerald-950/90 backdrop-blur-sm flex flex-col items-center justify-center text-white gap-3 z-40 p-6 text-center animate-fade-in">
              <div className="w-16 h-16 rounded-3xl bg-emerald-500 text-slate-950 flex items-center justify-center shadow-2xl shadow-emerald-500/40">
                <Check className="w-10 h-10 stroke-[3]" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-emerald-300">Código Reconhecido com Sucesso!</p>
                <p className="text-lg font-black text-white font-mono mt-1 bg-black/40 px-4 py-2 rounded-xl border border-emerald-500/40">
                  {lastScannedResult}
                </p>
              </div>
            </div>
          )}

          {/* Error Message & Manual Fallback */}
          {errorMessage && (
            <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center text-white p-6 sm:p-8 text-center gap-4 z-30">
              <div className="w-14 h-14 bg-rose-500/20 text-rose-400 rounded-3xl border border-rose-500/30 flex items-center justify-center">
                <Camera className="w-7 h-7" />
              </div>
              <div className="max-w-md">
                <h4 className="font-black text-sm uppercase tracking-wider text-rose-300">Câmera Indisponível</h4>
                <p className="text-xs text-slate-300 font-medium mt-1 leading-relaxed">{errorMessage}</p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => startCamera()}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs flex items-center gap-2 transition-all shadow-lg"
                >
                  <RefreshCw className="w-4 h-4" /> Tentar Novamente
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowManualInput(true);
                    setTimeout(() => manualInputRef.current?.focus(), 150);
                  }}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-black rounded-xl text-xs flex items-center gap-2 border border-slate-700 transition-all"
                >
                  <Keyboard className="w-4 h-4 text-emerald-400" /> Digitar Código
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Quick Zoom & Scanner Floating Controls Over Video (Floating Pill Bar) */}
        {!errorMessage && !isInitializing && (
          <div className="bg-slate-900/95 border-t border-slate-800 px-4 py-3 shrink-0 flex flex-col gap-3">
            {/* Zoom Controls Bar */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                  <ZoomIn className="w-3.5 h-3.5 text-emerald-400" />
                  Zoom:
                </span>

                {/* Quick Zoom Preset Buttons (1x, 1.5x, 2x, 3x) */}
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  {[1, 1.5, 2, 3].map((zVal) => {
                    const isActive = Math.abs(currentZoom - zVal) < 0.15;
                    return (
                      <button
                        key={zVal}
                        type="button"
                        onClick={() => applyZoom(zVal)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all ${
                          isActive 
                            ? 'bg-emerald-500 text-slate-950 shadow-sm' 
                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                      >
                        {zVal}x
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step Zoom Buttons & Slider Toggle */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => applyZoom(currentZoom - 0.25)}
                  disabled={currentZoom <= minZoom}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded-lg text-slate-300 border border-slate-700 transition-all"
                  title="Diminuir Zoom"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>

                {/* Range Slider */}
                <input
                  type="range"
                  min={minZoom}
                  max={maxZoom}
                  step={zoomStep}
                  value={currentZoom}
                  onChange={(e) => applyZoom(parseFloat(e.target.value))}
                  className="w-20 sm:w-28 accent-emerald-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                />

                <button
                  type="button"
                  onClick={() => applyZoom(currentZoom + 0.25)}
                  disabled={currentZoom >= maxZoom}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded-lg text-slate-300 border border-slate-700 transition-all"
                  title="Aumentar Zoom"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>

              {/* Torch & Camera Flip Actions */}
              <div className="flex items-center gap-2 ml-auto">
                {hasTorch && (
                  <button
                    type="button"
                    onClick={toggleTorch}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-black flex items-center gap-1.5 transition-all ${
                      isTorchOn 
                        ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md shadow-amber-400/20' 
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                    title="Ligar/Desligar Flash"
                  >
                    {isTorchOn ? <Zap className="w-4 h-4 fill-current" /> : <ZapOff className="w-4 h-4" />}
                    <span>{isTorchOn ? 'Flash ON' : 'Flash'}</span>
                  </button>
                )}

                {/* Flip camera button */}
                <button
                  type="button"
                  onClick={toggleFacingMode}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all"
                  title="Virar Câmera (Traseira/Frontal)"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span className="hidden sm:inline">{facingMode === 'environment' ? 'Traseira' : 'Frontal'}</span>
                </button>

                {/* Camera selector if multiple */}
                {cameras.length > 1 && (
                  <select
                    value={selectedCameraId}
                    onChange={(e) => handleSelectCamera(e.target.value)}
                    className="px-2.5 py-1.5 bg-slate-800 text-slate-300 border border-slate-700 rounded-xl text-xs font-bold outline-none max-w-[120px] sm:max-w-[160px] truncate"
                  >
                    <option value="">Câmera Padrão</option>
                    {cameras.map((c) => (
                      <option key={c.id} value={c.id}>{c.label || `Câmera ${c.id.slice(0, 6)}`}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Bottom Bar: Manual Typing / USB Gun Input Fallback */}
            <div className="pt-2 border-t border-slate-800 flex flex-col sm:flex-row items-center gap-2">
              <div className="relative flex-1 w-full">
                <input
                  ref={manualInputRef}
                  type="text"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && manualCode.trim()) {
                      e.preventDefault();
                      handleSuccess(manualCode.trim());
                    }
                  }}
                  placeholder="Digitar código manualmente ou bipar leitor USB..."
                  className="w-full pl-9 pr-24 py-2.5 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl text-xs font-bold text-white placeholder-slate-500 outline-none font-mono"
                />
                <Keyboard className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                
                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handlePasteClipboard}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-bold flex items-center gap-1"
                    title="Colar da Área de Transferência"
                  >
                    <ClipboardPaste className="w-3.5 h-3.5 text-emerald-400" />
                  </button>
                  {manualCode.trim() && (
                    <button
                      type="button"
                      onClick={() => handleSuccess(manualCode.trim())}
                      className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-[11px] rounded-lg transition-all"
                    >
                      Confirmar
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-between sm:justify-end text-[10px] text-slate-400 font-medium">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  Leitor USB / Teclado Ativo
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Global style for laser scan animation */}
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes quality-scan-line {
            0% { top: 6%; opacity: 0.8; }
            50% { top: 92%; opacity: 1; }
            100% { top: 6%; opacity: 0.8; }
          }
          .animate-quality-scan-line {
            animation: quality-scan-line 2.2s ease-in-out infinite;
          }
          #quality-qr-reader {
            position: relative;
            width: 100% !important;
            height: 100% !important;
          }
          #quality-qr-reader video {
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
          }
          #quality-qr-reader__scan_region {
            background: transparent !important;
          }
          #quality-qr-reader__dashboard {
            display: none !important;
          }
        `}} />
      </motion.div>
    </div>
  );
};
