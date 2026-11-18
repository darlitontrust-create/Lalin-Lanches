import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

try {
  const m = localStorage.getItem('lalin-mode');
  if (m) document.documentElement.dataset.mode = m;
} catch { /* sem armazenamento local */ }

// Rótulos das tabelas responsivas no celular (.stack)
new MutationObserver(() => {
  for (const c of document.querySelectorAll<HTMLTableCellElement>('.stack td:not([data-l])')) {
    let i = 0, p: Element | null = c;
    while ((p = p.previousElementSibling)) i += (p as HTMLTableCellElement).colSpan;
    c.dataset.l = c.closest('table')?.rows[0].cells[i]?.textContent || '';
  }
}).observe(document.body, { childList: true, subtree: true });

// App instalável (PWA): registra o service worker
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => { /* ignora */ }));
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
