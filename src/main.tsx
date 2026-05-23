import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Suppress benign Vite/WebSocket network errors and unhandled rejections expected in the preview sandboxed environment
if (typeof window !== 'undefined') {
  const isBenignError = (message: string) => {
    const msg = message.toLowerCase();
    return (
      msg.includes('websocket') ||
      msg.includes('vite') ||
      msg.includes('ws://') ||
      msg.includes('wss://') ||
      msg.includes('fechado') ||
      msg.includes('closed') ||
      msg.includes('conectar') ||
      msg.includes('connection is established')
    );
  };

  // 1. Unhandled Rejections Tracker (with stopImmediatePropagation to hide from Vite overlay/browser alerts)
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason || '');
    if (isBenignError(message)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  }, true);

  // 2. Standard Errors Tracker
  window.addEventListener('error', (event) => {
    const message = event.message || '';
    if (isBenignError(message)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  }, true);

  // 3. Legacy window.onerror Fallback to suppress native browser / overlay popup rendering
  const originalOnError = window.onerror;
  window.onerror = function (message, source, lineno, colno, error) {
    const msg = String(message || '');
    if (isBenignError(msg)) {
      return true; // true suppresses standard error alert/overlay drawing
    }
    if (originalOnError) {
      return originalOnError.apply(this, arguments as any);
    }
    return false;
  };
}

// Register Service Worker for PWA (Progressive Web App) capabilities
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('[SW] Service Worker registrado com sucesso:', reg.scope);
      })
      .catch((err) => {
        console.error('[SW] Falha ao registrar Service Worker:', err);
      });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
