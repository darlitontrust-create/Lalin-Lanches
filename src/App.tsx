import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, google, SUPER_ADMIN } from './firebase';
import { getOne, put, useCol, useDoc } from './db';
import { AppCtx, type Ctx, type UI } from './store';
import type { AppUser, Caixa, Config, PermKey, Product } from './types';
import { DEFAULT_CONFIG, seedAll } from './seed';
import { hm } from './utils';
import { splashDone, splashProgress } from './splash';
import { Icon, Logo, ModalHead, Wordmark } from './components/ui';
import { InstallButton } from './components/Install';
import Pedidos from './pages/Pedidos';
import CaixaPage from './pages/Caixa';
import Estoque from './pages/Estoque';
import Cadastro from './pages/Cadastro';
import Despesas from './pages/Despesas';
import Perdas from './pages/Perdas';
import Resultados from './pages/Resultados';
import Usuarios from './pages/Usuarios';
import Log from './pages/Log';

type View = 'pedidos' | 'caixa' | 'estoque' | 'cadastro' | 'despesas' | 'perdas' | 'resultados' | 'usuarios' | 'log';
const NAV: [View, string, PermKey | 'admin', string][] = [
  ['pedidos', 'Pedidos', 'pedidos', 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h4'],
  ['caixa', 'Caixa', 'caixa', 'M4 9h16v10H4zM8 9V5h8v4M12 13v2'],
  ['estoque', 'Estoque', 'estoque', 'M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8'],
  ['cadastro', 'Cadastro', 'cadastro', 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h3'],
  ['despesas', 'Despesas', 'despesas', 'M4 6h16v12H4zM4 10h16M8 15h3M15 15h1'],
  ['perdas', 'Perdas', 'perdas', 'M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3'],
  ['resultados', 'Resultados', 'resultados', 'M4 20V11M10 20V5M16 20v-6M21 20H3'],
  ['usuarios', 'Usuários', 'admin', 'M17 20c0-3-2.2-5-5-5s-5 2-5 5M12 12a3.5 3.5 0 100-7 3.5 3.5 0 000 7'],
  ['log', 'Log de exclusões', 'admin', 'M12 8v4l3 2M4 12a8 8 0 1016 0 8 8 0 00-16 0']
];
const PAGES: Record<View, () => JSX.Element> = {
  pedidos: Pedidos, caixa: CaixaPage, estoque: Estoque, cadastro: Cadastro, despesas: Despesas,
  perdas: Perdas, resultados: Resultados, usuarios: Usuarios, log: Log
};

function useUI() {
  const [toasts, setToasts] = useState<{ id: number; m: string }[]>([]);
  const [md, setMd] = useState<ReactNode | null>(null);
  const ui = useMemo<UI>(() => ({
    toast: m => {
      const id = Date.now() + Math.random();
      setToasts(t => (t.some(x => x.m === m) ? t : [...t.slice(-2), { id, m }]));
      setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
    },
    modal: n => setMd(n),
    confirm: o => new Promise<boolean>(res => {
      const done = (v: boolean) => { setMd(null); res(v); };
      setMd(<>
        <ModalHead title={o.title} onClose={() => done(false)} />
        {o.text && <div style={{ margin: '8px 0' }}>{o.text}</div>}
        <div className="row end"><button className="btn" onClick={() => done(false)}>Voltar</button>
          <button className="btn p" onClick={() => done(true)}>{o.ok || 'Confirmar'}</button></div>
      </>);
    })
  }), []);
  const layer = <>
    {md && <div className="ov" onMouseDown={e => { if (e.target === e.currentTarget) setMd(null); }}>
      <div className="card md" role="dialog" aria-modal="true">{md}</div></div>}
    <div className="toast" aria-live="polite">{toasts.map(t => <div key={t.id}>{t.m}</div>)}</div>
  </>;
  return { ui, layer };
}

export default function App() {
  const { ui, layer } = useUI();
  const [fb, setFb] = useState<User | null | undefined>(undefined);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => onAuthStateChanged(auth, async u => {
    setFb(u); setProfile(null);
    if (!u) return;
    const email = (u.email || '').toLowerCase();
    try {
      let p = await getOne<AppUser>('users', email);
      if (!p && email === SUPER_ADMIN) {
        const data = { email, name: u.displayName || 'Administrador', role: 'admin' as const, perms: {}, active: true, createdAt: Date.now() };
        await put('users', email, data);
        p = { id: email, ...data };
      }
      if (!p || !p.active) {
        setErr(`O e-mail ${email} não está liberado para este sistema. Peça ao administrador para cadastrar seu acesso em Usuários.`);
        await signOut(auth);
        return;
      }
      setErr(''); setProfile(p);
    } catch (e) {
      setErr('Não foi possível validar seu acesso: ' + (e as Error).message);
      await signOut(auth);
    }
  }), []);

  if (fb === undefined) return null; // a tela de abertura continua visível
  if (fb && !profile && !err) { splashProgress(55); return <div className="center"><p className="mute">Verificando acesso…</p></div>; }
  if (!fb || !profile) return <Login err={err} />;
  return <Main profile={profile} ui={ui} layer={layer} />;
}

function Login({ err }: { err: string }) {
  useEffect(splashDone, []);
  const [busy, setBusy] = useState(false);
  const [e2, setE2] = useState('');
  const go = async () => {
    setBusy(true); setE2('');
    try { await signInWithPopup(auth, google); }
    catch (e) { const c = (e as { code?: string }).code || ''; if (!c.includes('popup-closed')) setE2('Falha no login: ' + c); }
    finally { setBusy(false); }
  };
  return (
    <div className="center"><div className="card lgc">
      <Logo size={104} /><Wordmark />
      <p className="mute" style={{ margin: '14px 0 18px' }}>Sistema de gestão · pedidos, caixa, estoque e resultados</p>
      <button className="gbtn" onClick={go} disabled={busy}>
        <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-4z" /><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.7-.4-4z" /></svg>
        {busy ? 'Abrindo o Google…' : 'Entrar com Google'}
      </button>
      {(err || e2) && <div className="err">{err || e2}</div>}
      <p className="mute" style={{ marginTop: 18 }}>Somente contas Google liberadas pelo administrador conseguem entrar.</p>
      <InstallButton modal={() => alertIOS()} className="btn sm" />
    </div></div>
  );
}

function alertIOS() {
  window.alert('No iPhone: abra no Safari, toque em Compartilhar e escolha "Adicionar à Tela de Início".');
}

function isDark() {
  const m = document.documentElement.dataset.mode;
  return m ? m === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}

function Main({ profile, ui, layer }: { profile: AppUser; ui: UI; layer: ReactNode }) {
  const live = useDoc<AppUser>('users', profile.id);
  const user = live || profile;
  const cfgDoc = useDoc<Config>('config', 'app');
  const products = useCol<Product>('products', { order: ['name', 'asc'] });
  const open = useCol<Caixa>('caixas', { where: [['open', '==', true]] });
  const [view, setView] = useState<View>(() => (location.hash.slice(1) as View) || 'pedidos');
  const [dark, setDark] = useState(isDark);
  const [palette, setPalette] = useState(() => document.documentElement.dataset.palette || 'marinho');
  const togglePalette = () => {
    const pl = palette === 'marinho' ? 'classica' : 'marinho';
    document.documentElement.dataset.palette = pl;
    try { localStorage.setItem('lalin-palette', pl); } catch { /* ignore */ }
    setPalette(pl);
  };

  useEffect(() => {
    const f = () => { const h = location.hash.slice(1) as View; if (PAGES[h]) setView(h); ui.modal(null); };
    addEventListener('hashchange', f); return () => removeEventListener('hashchange', f);
  }, [ui]);
  useEffect(() => { if (live === null || (live && !live.active)) signOut(auth); }, [live]);

  const can = (k: PermKey | 'admin') => user.role === 'admin' || (k !== 'admin' && !!user.perms?.[k]);
  const allowed = NAV.filter(n => can(n[2]));
  const cur = allowed.find(n => n[0] === view) || allowed[0];
  const go = (v: string) => { location.hash = v; };
  const toggleTheme = () => {
    const m = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.mode = m;
    try { localStorage.setItem('lalin-mode', m); } catch { /* ignore */ }
    setDark(m === 'dark');
  };

  if (cfgDoc === undefined || products === null || open === null) { splashProgress(80); return <div className="center"><p className="mute">Carregando dados…</p></div>; }
  splashDone();
  if (cfgDoc === null) return <Setup admin={user.role === 'admin'} ui={ui} />;
  if (!cur) return <div className="center"><div className="card lgc"><h2>Sem módulos liberados</h2><p className="mute">Peça ao administrador para liberar suas permissões.</p><button className="btn" onClick={() => signOut(auth)}>Sair</button></div></div>;

  const cfg: Config = { ...DEFAULT_CONFIG, ...cfgDoc };
  const caixa = open.slice().sort((a, b) => b.at - a.at)[0] || null;
  const ctx: Ctx = { user, cfg, products, caixa, can, ui, go };
  const Page = PAGES[cur[0]];

  return (
    <AppCtx.Provider value={ctx}>
      <div className="app">
        <aside className="side">
          <div className="brand"><Logo /><Wordmark /></div>
          <nav className="nav">{allowed.map(n => <a key={n[0]} href={'#' + n[0]} className={n[0] === cur[0] ? 'on' : ''}><Icon d={n[3]} /><span>{n[1]}</span></a>)}</nav>
          <div className="foot">{user.email}</div>
        </aside>
        <main>
          <div className="top">
            <h1>{cur[1]}</h1>
            <span className={'pill' + (caixa ? '' : ' off')}><i />{caixa ? 'Caixa aberto desde ' + hm(caixa.at) : 'Caixa fechado'}</span>
            <button className="btn ic" onClick={togglePalette} aria-label="Trocar paleta de cores" title={'Paleta: ' + (palette === 'marinho' ? 'Marinho' : 'Clássica') + ' (toque para trocar)'}>
              <Icon d="M12 3a9 9 0 100 18c1 0 1.5-.8 1.5-1.6 0-.9-.6-1.4-.6-2.2 0-.9.7-1.6 1.6-1.6H16a5 5 0 005-5c0-4.1-4-7.6-9-7.6zM7.5 12a1 1 0 110-2 1 1 0 010 2zM9.5 8a1 1 0 110-2 1 1 0 010 2zM14.5 8a1 1 0 110-2 1 1 0 010 2z" />
            </button>
            <button className="btn ic" onClick={toggleTheme} aria-label="Alternar modo claro/escuro" title="Modo claro/escuro">
              <Icon d={dark ? 'M12 3v2M12 19v2M5 5l1.5 1.5M17.5 17.5 19 19M3 12h2M19 12h2M5 19l1.5-1.5M17.5 6.5 19 5M12 8a4 4 0 100 8 4 4 0 000-8z' : 'M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z'} />
            </button>
            <InstallButton modal={ui.modal} />
            <button className="btn" onClick={() => signOut(auth)}><span className="uname">{user.name} ·</span> Sair</button>
          </div>
          <Page />
        </main>
      </div>
      {layer}
    </AppCtx.Provider>
  );
}

function Setup({ admin, ui }: { admin: boolean; ui: UI }) {
  useEffect(splashDone, []);
  const [busy, setBusy] = useState(false);
  const run = async (menu: boolean) => {
    setBusy(true);
    try { await seedAll(menu); } catch (e) { ui.toast('Erro: ' + (e as Error).message); setBusy(false); }
  };
  return (
    <div className="center"><div className="card lgc">
      <Logo size={80} /><h2 style={{ marginTop: 12 }}>Primeiro acesso</h2>
      {admin ? <>
        <p className="mute">Vamos criar a configuração inicial: tipos, categorias, classes, unidades, formas de pagamento, PIX, categorias de despesa e mensagens de WhatsApp.</p>
        <button className="btn p wide" disabled={busy} onClick={() => run(true)}>Criar configuração + cardápio inicial</button>
        <button className="btn wide" style={{ marginTop: 8 }} disabled={busy} onClick={() => run(false)}>Criar só a configuração</button>
        <p className="mute" style={{ marginTop: 12 }}>O cardápio inicial traz os 21 produtos do PDF, com estoque zerado. Ajuste custos e estoque depois.</p>
      </> : <p className="mute">O administrador ainda não configurou o sistema.</p>}
      <button className="btn sm" style={{ marginTop: 12 }} onClick={() => signOut(auth)}>Sair</button>
    </div></div>
  );
}
