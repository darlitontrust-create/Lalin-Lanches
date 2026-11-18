import { useState } from 'react';
import { useApp } from '../store';
import { patch, put, remove, useCol } from '../db';
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
  const del = async (u: AppUser) => {
    if (await ui.confirm({ title: `Remover o acesso de ${u.name}?`, text: 'A pessoa não conseguirá mais entrar. O histórico continua.', ok: 'Remover' })) {
      await remove('users', u.id); ui.toast('Acesso removido');
    }
  };

  return <div className="card">
    <p className="mute" style={{ marginTop: 0 }}>Só entra no sistema quem estiver nesta lista. A pessoa usa o botão "Entrar com Google" com o mesmo e-mail cadastrado aqui.</p>
    {!users ? <p className="mute">Carregando…</p> : <div className="scroll"><table className="stack"><thead><tr><th>Usuário</th><th>Perfil</th>{PERMS.map(p => <th key={p[0]}>{p[1]}</th>)}<th>Acesso</th><th></th></tr></thead>
      <tbody>{users.map(u => <tr key={u.id}>
        <td><b>{u.name}</b><br /><span className="mute">{u.email}</span></td>
        <td><select value={u.role} disabled={isSuper(u) || u.id === user.id} style={{ minHeight: 38 }} onChange={e => patch('users', u.id, { role: e.target.value })}>
          <option value="admin">Administrador</option><option value="op">Operador</option></select></td>
        {PERMS.map(([k, l]) => <td key={k}><label className="ck"><input type="checkbox" aria-label={l} checked={u.role === 'admin' || !!u.perms?.[k]} disabled={u.role === 'admin'}
          onChange={e => patch('users', u.id, { ['perms.' + k]: e.target.checked })} /></label></td>)}
        <td><button className={'chip' + (u.active ? ' on' : '')} style={{ minHeight: 32 }} disabled={isSuper(u) || u.id === user.id} onClick={() => patch('users', u.id, { active: !u.active })}>{u.active ? 'Liberado' : 'Bloqueado'}</button></td>
        <td>{!isSuper(u) && u.id !== user.id && <button className="btn sm danger" onClick={() => del(u)}>Remover</button>}</td>
      </tr>)}</tbody></table></div>}
    <h3>Liberar novo acesso (conta Google)</h3>
    <div className="fg" style={{ maxWidth: 760 }}>
      <label>Nome<input value={name} onChange={e => setName(e.target.value)} /></label>
      <label>E-mail Google<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="nome@gmail.com" /></label>
      <label>Perfil<select value={role} onChange={e => setRole(e.target.value as Role)}><option value="op">Operador</option><option value="admin">Administrador</option></select></label>
    </div>
    <div className="row end" style={{ maxWidth: 760 }}><button className="btn p" onClick={addUser}>Liberar acesso</button></div>
  </div>;
}
