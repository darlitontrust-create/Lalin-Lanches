import { createContext, useContext, type ReactNode } from 'react';
import type { AppUser, Caixa, Config, PermKey, Product } from './types';

export interface ConfirmOpts { title: string; text?: ReactNode; ok?: string; danger?: boolean }
export interface UI {
  toast: (m: string) => void;
  modal: (n: ReactNode | null) => void;
  confirm: (o: ConfirmOpts) => Promise<boolean>;
}
export interface Ctx {
  user: AppUser; cfg: Config; products: Product[]; caixa: Caixa | null;
  can: (k: PermKey | 'admin') => boolean; ui: UI; go: (view: string) => void;
}
export const AppCtx = createContext<Ctx | null>(null);
export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error('AppCtx ausente');
  return c;
}
