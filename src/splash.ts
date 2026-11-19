// Controle da tela de abertura definida no index.html
declare global {
  interface Window { __splash?: (p: number) => void; __splashDone?: () => void }
}
export const splashProgress = (p: number) => window.__splash?.(p);
export const splashDone = () => window.__splashDone?.();
