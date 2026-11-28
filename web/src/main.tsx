import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/reset.css';
import { AppErrorBoundary } from './components/ui/ErrorBoundary';
import { App } from './App';

if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    try {
      const last = Number(sessionStorage.getItem('cf_preload_reload_at') || '0');
      const now = Date.now();
      if (!last || now - last > 10_000) {
        sessionStorage.setItem('cf_preload_reload_at', String(now));
        event.preventDefault();
        window.location.reload();
      }
    } catch {
      event.preventDefault();
      window.location.reload();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
);
