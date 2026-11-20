import { useEffect, useState } from 'react';
import { checkPin, setPin, usingDefaultPin } from '../security';
import { useApp } from '../store';
import { patch, put, useCol } from '../db';
import { SUPER_ADMIN } from '../firebase';
import type { AppUser, PermKey, Role } from '../types';

const PERMS: [PermKey, string][] = [['pedidos', 'Pedidos'], ['caixa', 'Fechamento de caixa'], ['estoque', 'Estoque'], ['cadastro', 'Cadastro'],
  ['despesas', 'Despesas'], ['perdas', 'Perdas'], ['resultados', 'Resultados']];

export default function Usuarios() {
  const { ui, user } = useApp();
  const users = useCol<AppUser>('users', { order: ['name', 'asc'] });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('op');

  const addUser = async () => {
    const em = email.trim().toLowerCase();
    if (!name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return ui.toast('Informe nome e um e-mail Google válido');
    if (users?.some(u => u.id === em)) return ui.toast('Este e-mail já está cadastrado');
    await put('users', em, { email: em, name: name.trim(), role, active: true, createdAt: Date.now(),
      perms: role === 'admin' ? {} : { pedidos: true } });
    ui.toast(`${name.trim()} liberado. Ele já pode entrar com a conta Google ${em}.`);
    setName(''); setEmail('');
  };
  const isSuper = (u: AppUser) => u.id === SUPER_ADMIN;
  return <div className="card">
    <p className="mute" style={{ marginTop: 0 }}>Só entra no sistema quem estiver nesta lista. A pessoa usa o botão "Entrar com Google" com o mesmo e-mail cadastrado aqui. Para tirar o acesso, use Bloqueado.</p>
    {!users ? <p className="mute">Carregando…</p> : <div className="scroll"><table className="stack"><thead><tr><th>Usuário</th><th>Perfil</th>{PERMS.map(p => <th key={p[0]}>{p[1]}</th>)}<th>Acesso</th></tr></thead>
      <tbody>{users.map(u => <tr key={u.id}>
        <td><b>{u.name}</b><br /><span className="mute">{u.email}</span></td>
        <td><select value={u.role} disabled={isSuper(u) || u.id === user.id} style={{ minHeight: 38 }} onChange={e => patch('users', u.id, { role: e.target.value })}>
          <option value="admin">Administrador</option><option value="op">Operador</option></select></td>
        {PERMS.map(([k, l]) => <td key={k}><label className="ck"><input type="checkbox" aria-label={l} checked={u.role === 'admin' || !!u.perms?.[k]} disabled={u.role === 'admin'}
          onChange={e => patch('users', u.id, { ['perms.' + k]: e.target.checked })} /></label></td>)}
        <td><button className={'chip' + (u.active ? ' on' : '')} style={{ minHeight: 32 }} disabled={isSuper(u) || u.id === user.id} onClick={() => patch('users', u.id, { active: !u.active })}>{u.active ? 'Liberado' : 'Bloqueado'}</button></td>
      </tr>)}</tbody></table></div>}
    <h3>Liberar novo acesso (conta Google)</h3>
    <div className="fg" style={{ maxWidth: 760 }}>
      <label>Nome<input value={name} onChange={e => setName(e.target.value)} /></label>
      <label>E-mail Google<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="nome@gmail.com" /></label>
      <label>Perfil<select value={role} onChange={e => setRole(e.target.value as Role)}><option value="op">Operador</option><option value="admin">Administrador</option></select></label>
    </div>
    <div className="row end" style={{ maxWidth: 760 }}><button className="btn p" onClick={addUser}>Liberar acesso</button></div>
    <AdminPin />
  </div>;
}

function AdminPin() {
  const { ui, user } = useApp();
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [cf, setCf] = useState('');
  const [def, setDef] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { usingDefaultPin().then(setDef).catch(() => setDef(false)); }, []);
  const save = async () => {
    if (nw.length < 4) return ui.toast('A nova senha precisa ter pelo menos 4 caracteres');
    if (nw !== cf) return ui.toast('A confirmação não confere com a nova senha');
    setBusy(true);
    try {
      if (!(await checkPin(cur))) { ui.toast('Senha atual incorreta'); setBusy(false); return; }
      await setPin(nw, user); setCur(''); setNw(''); setCf(''); setDef(false); ui.toast('Senha do administrador alterada');
    } catch (e) { ui.toast('Erro: ' + (e as Error).message); }
    setBusy(false);
  };
  return <>
    <h3 style={{ marginTop: 28 }}>Senha do administrador</h3>
    <p className="mute" style={{ marginTop: -4 }}>Pedida para ações sensíveis, como limpar o Log de exclusões. Só administradores podem usar e alterar.
      {def && <> <b style={{ color: 'var(--red)' }}>A senha inicial (1991) ainda está em uso — troque por uma só sua.</b></>}</p>
    <div className="fg" style={{ maxWidth: 760 }}>
      <label>Senha atual<input type="password" value={cur} onChange={e => setCur(e.target.value)} autoComplete="current-password" /></label>
      <label>Nova senha<input type="password" value={nw} onChange={e => setNw(e.target.value)} autoComplete="new-password" /></label>
      <label>Confirmar nova senha<input type="password" value={cf} onChange={e => setCf(e.target.value)} autoComplete="new-password" /></label>
    </div>
    <div className="row end" style={{ maxWidth: 760 }}><button className="btn p" disabled={busy} onClick={save}>Alterar senha</button></div>
  </>;
}
