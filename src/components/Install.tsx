// Botão "Instalar app": Android/Chrome/Edge usam o aviso nativo; iPhone recebe as instruções
import { useEffect, useState } from 'react';
import { ModalHead } from './ui';

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: BIP | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as BIP; listeners.forEach(f => f()); });
  addEventListener('appinstalled', () => { deferred = null; listeners.forEach(f => f()); });
}
const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function InstallButton({ modal, className = 'btn' }: { modal: (n: JSX.Element | null) => void; className?: string }) {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force(x => x + 1); listeners.add(f); return () => { listeners.delete(f); }; }, []);
  if (standalone()) return null;
  const ios = isIOS();
  if (!deferred && !ios) return null;
  const click = async () => {
    if (deferred) { await deferred.prompt(); await deferred.userChoice; deferred = null; force(x => x + 1); return; }
    modal(<>
      <ModalHead title="Instalar no iPhone / iPad" onClose={() => modal(null)} />
      <ol style={{ lineHeight: 1.8, paddingLeft: 20 }}>
        <li>Abra este site no <b>Safari</b>.</li>
        <li>Toque no botão <b>Compartilhar</b> (quadrado com seta para cima).</li>
        <li>Escolha <b>Adicionar à Tela de Início</b> e toque em <b>Adicionar</b>.</li>
      </ol>
      <p className="mute">O ícone da Lalin Lanches aparece na tela do aparelho e abre o sistema em tela cheia, como um app.</p>
      <div className="row end"><button className="btn p" onClick={() => modal(null)}>Entendi</button></div>
    </>);
  };
  return <button className={className} onClick={click} title="Instalar como aplicativo">Instalar app</button>;
}
