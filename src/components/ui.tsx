import type { ReactNode } from 'react';

export const Logo = ({ size = 44 }: { size?: number }) => (
  <svg className="logo" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
    <defs>
      <linearGradient id="lgb" x1="0" y1="1" x2="1" y2="0"><stop offset="0" style={{ stopColor: 'var(--logo1, #E63946)' }} /><stop offset="1" style={{ stopColor: 'var(--logo2, #FF8A3D)' }} /></linearGradient>
      <linearGradient id="lgg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".35" /><stop offset=".55" stopColor="#fff" stopOpacity="0" /></linearGradient>
    </defs>
    <rect width="64" height="64" rx="18" fill="url(#lgb)" /><rect width="64" height="64" rx="18" fill="url(#lgg)" />
    <path d="M14 48 50 30" stroke="#7a1d24" strokeOpacity=".35" strokeWidth="3" strokeLinecap="round" />
    <path d="M33 9c1.5 8.5 13 13.5 13 27a14 14 0 0 1-28 0c0-7 3.5-11.5 7.5-15 .3 5.5 2.6 8.6 5.6 9.6C29 23 31.5 16 33 9z" fill="#fff" />
    <path d="M32.5 30c4 3 7 6.2 7 10.5a7.5 7.5 0 0 1-15 0c0-3 1.5-5 3.5-6.5.5 2.5 1.7 3.6 3.2 4-.8-3 0-5.7 1.3-8z" fill="#FFC857" />
  </svg>
);

export const Wordmark = () => <span className="wm">Lalin<small>lanches</small></span>;

export const Icon = ({ d }: { d: string }) => <svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>;

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, ReactNode][] }) {
  return (
    <div className="tabs" role="tablist">
      {items.map(([k, l]) => <button key={k} role="tab" aria-selected={value === k} className={'chip' + (value === k ? ' on' : '')} onClick={() => onChange(k)}>{l}</button>)}
    </div>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <p className="empty">{children}</p>;

export function StockBadge({ stock, min, unavailable }: { stock: number; min: number; unavailable?: boolean }) {
  if (unavailable) return <span className="bd crit">Indisponível</span>;
  if (stock <= 0) return <span className="bd crit">Zerado</span>;
  if (stock <= min) return <span className="bd low">Baixo</span>;
  return <span className="bd ok">OK</span>;
}

/** Barras horizontais: rótulo numa linha só (corta com reticências), barra e valor. */
export function HBars({ rows, fmt }: { rows: [string, number][]; fmt: (v: number) => string }) {
  const m = Math.max(1, ...rows.map(r => r[1]));
  if (!rows.length) return <p className="mute">Sem dados no período.</p>;
  return <>{rows.map(([k, v]) => (
    <div className="hb" key={k}><span title={k}>{k}</span><i style={{ width: `${(v / m) * 100}%` }} /><span>{fmt(v)}</span></div>
  ))}</>;
}

export function ModalHead({ title, onClose }: { title: ReactNode; onClose: () => void }) {
  return <div className="mh"><h2 style={{ margin: 0 }}>{title}</h2><button className="btn ic" onClick={onClose} aria-label="Fechar">×</button></div>;
}
