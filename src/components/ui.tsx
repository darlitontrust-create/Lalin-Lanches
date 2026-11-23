import type { ReactNode } from 'react';

/** Marca Lalin: chama com o "L" da Lalin e uma faísca. As cores seguem a paleta ativa. */
export const Logo = ({ size = 44 }: { size?: number }) => (
  <svg className="logo" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
    <defs><linearGradient id="lgb" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" style={{ stopColor: 'var(--logo-bg1, #17181C)' }} /><stop offset="1" style={{ stopColor: 'var(--logo-bg2, #2A2C33)' }} />
    </linearGradient></defs>
    <rect width="64" height="64" rx="16" fill="url(#lgb)" />
    <path d="M33 9C35.5 17 47 22 47 37C47 46 40.5 53 32 53C23.5 53 17 46.5 17 38C17 30.5 21 25.5 25.5 21.5C25.8 26.5 28 29.5 30.5 30.5C29 23.5 30.5 15.5 33 9Z" style={{ fill: 'var(--logo-mark, #FFC21A)' }} />
    <path d="M26.5 34.5a1.5 1.5 0 0 1 1.5-1.5h2.5a1.5 1.5 0 0 1 1.5 1.5V42H38a1.5 1.5 0 0 1 1.5 1.5v1.8a1.5 1.5 0 0 1-1.5 1.5H28a1.5 1.5 0 0 1-1.5-1.5Z" style={{ fill: 'var(--logo-bg1, #17181C)' }} />
    <circle cx="45" cy="15" r="3.2" style={{ fill: 'var(--logo-mark2, #FFE39A)' }} />
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
