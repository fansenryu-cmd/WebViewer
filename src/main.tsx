import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DbProvider } from './hooks/useDb';
import App from './App';
import './index.css';

// FOUC 방지: 저장된 테마 즉시 적용
const saved = localStorage.getItem('nf-viewer-theme');
if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
  document.documentElement.classList.add('dark');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DbProvider>
      <App />
    </DbProvider>
  </StrictMode>,
);
