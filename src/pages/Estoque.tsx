import { useRef, useState } from 'react';
import { useApp } from '../store';
import { commit, inc, patch, useCol, type Op } from '../db';
import type { Inventory, Move, Product } from '../types';
import { brl, col, dbr, ds, dt, exportXlsx, nf, nm, num, readXlsx } from '../utils';
import { Empty, StockBadge, Tabs } from '../components/ui';

type Tab = 'pos' | 'mov' | 'inv' | 'hist';

export default function Estoque() {
  const { products, cfg } = useApp();
  const [tab, setTab] = useState<Tab>('pos');
  const alert = products.filter(p => p.unavailable || p.stock <= p.min);
  return <>
    {alert.length > 0 && <div className="card" style={{ marginBottom: 16, borderColor: 'var(--red)' }}>
      <b style={{ color: 'var(--red)' }}>{products.filter(p => p.stock <= 0).length} zerado(s), {products.filter(p => p.stock > 0 && p.stock <= p.min).length} abaixo do mínimo, {products.filter(p => p.unavailable).length} indisponível(is).</b>
      <span className="mute"> Estoque zerado só avisa; para bloquear a venda marque o produto como indisponível.</span>
    </div>}
    <div className="card">
      <Tabs value={tab} onChange={setTab} items={[['pos', 'Posição'], ['mov', 'Entrada / Baixa'], ['inv', 'Inventário'], ['hist', 'Movimentações']]} />
      {tab === 'pos' && <Posicao />}
      {tab === 'mov' && <Movimentar />}
      {tab === 'inv' && <Inventario />}
      {tab === 'hist' && <Historico />}
    </div>
    <p className="mute" style={{ marginTop: 10 }}>{cfg.types.length} tipos de produto · {products.length} produtos cadastrados</p>
  </>;
}

function Posicao() {
  const { products, cfg, ui, can } = useApp();
  const [f, setF] = useState<'todos' | 'alerta' | 'indisp'>('todos');
  const [q, setQ] = useState('');
  const l = products.filter(p => (f === 'todos' || (f === 'alerta' ? p.stock <= p.min : p.unavailable)) && (!q || p.name.toLowerCase().includes(q.toLowerCase())));
  const toggle = async (p: Product) => {
    await patch('products', p.id, { unavailable: !p.unavailable });
    ui.toast(p.unavailable ? `${p.name} liberado para venda` : `${p.name} bloqueado para venda`);
  };
  const exp = () => exportXlsx('estoque-atual', {
    Estoque: [['Código', 'Produto', 'Tipo', 'Categoria', 'Unidade', 'Estoque atual', 'Estoque mínimo', 'Custo unitário', 'Valor em estoque', 'Situação'],
      ...products.map(p => [p.code, p.name, nm(cfg.types, p.type), nm(cfg.cats, p.cat), p.unit, p.stock, p.min, p.cost, p.stock * p.cost,
        p.unavailable ? 'Indisponível' : p.stock <= 0 ? 'Zerado' : p.stock <= p.min ? 'Baixo' : 'OK'])],
    'Sem estoque': [['Código', 'Produto', 'Estoque'], ...products.filter(p => p.stock <= 0).map(p => [p.code, p.name, p.stock])]
  });
  const total = products.reduce((s, p) => s + Math.max(0, p.stock) * p.cost, 0);
  return <>
    <div className="row sb">
      <div className="chips">
        <button className={'chip' + (f === 'todos' ? ' on' : '')} onClick={() => setF('todos')}>Todos ({products.length})</button>
        <button className={'chip' + (f === 'alerta' ? ' on' : '')} onClick={() => setF('alerta')}>Baixo ou zerado ({products.filter(p => p.stock <= p.min).length})</button>
        <button className={'chip' + (f === 'indisp' ? ' on' : '')} onClick={() => setF('indisp')}>Indisponíveis ({products.filter(p => p.unavailable).length})</button>
      </div>
      <button className="btn sm" onClick={exp}>Exportar XLSX</button>
    </div>
    <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar produto…" style={{ marginTop: 10 }} aria-label="Buscar produto" />
    <p className="mute">Valor total em estoque (custo): <b>{brl(total)}</b></p>
    <div className="scroll"><table className="stack"><thead><tr><th>Código</th><th>Produto</th><th>Unidade</th><th className="n">Atual</th><th className="n">Mínimo</th><th className="n">Valor (custo)</th><th>Situação</th><th>Venda</th></tr></thead>
      <tbody>{l.map(p => <tr key={p.id}><td><code>{p.code}</code></td><td>{p.name}</td><td>{p.unit}</td><td className="n"><b>{nf(p.stock)}</b></td><td className="n">{nf(p.min)}</td>
        <td className="n">{brl(Math.max(0, p.stock) * p.cost)}</td><td><StockBadge stock={p.stock} min={p.min} unavailable={p.unavailable} /></td>
        <td>{p.type === 'RV' ? <button className={'chip' + (p.unavailable ? ' on' : '')} style={{ minHeight: 34 }} disabled={!can('estoque')} onClick={() => toggle(p)}>{p.unavailable ? 'Indisponível' : 'Disponível'}</button> : <span className="mute">—</span>}</td></tr>)}</tbody></table></div>
  </>;
}

function Movimentar() {
  const { products, user, ui } = useApp();
  const [t, setT] = useState<'Entrada' | 'Baixa'>('Entrada');
  const [pid, setPid] = useState(products[0]?.id || '');
  const [qty, setQty] = useState('');
  const [val, setVal] = useState('');
  const [mot, setMot] = useState('Uso Interno');
  const [date, setDate] = useState(ds());
  const [obs, setObs] = useState('');
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const p = products.find(x => x.id === pid);
  const save = async () => {
    const q = num(qty);
    if (!p || !(q > 0)) return ui.toast('Escolha o produto e a quantidade');
    setBusy(true);
    const isAdj = t === 'Baixa' && mot === 'Ajuste';
    const ops: Op[] = [
      { op: 'update', path: 'products', id: p.id, data: { stock: inc(t === 'Entrada' ? q : -q), ...(t === 'Entrada' && num(val) > 0 ? { cost: num(val) } : {}) } },
      { op: 'add', path: 'moves', data: { pid: p.id, pname: p.name, t: isAdj ? 'Ajuste' : t, motivo: t === 'Entrada' ? 'Compra' : mot, qty: q, val: t === 'Entrada' ? num(val) || p.cost : p.cost, date, obs, user: user.name, at: Date.now() } }
    ];
    try { await commit(ops); ui.toast(`${t} registrada: ${nf(q)} ${p.unit} de ${p.name}`); setQty(''); setVal(''); setObs(''); }
    catch (e) { ui.toast('Erro: ' + (e as Error).message); }
    setBusy(false);
  };
  const importar = async (f: File) => {
    try {
      const rows = await readXlsx(f);
      const ops: Op[] = [];
      for (const r of rows) {
        const code = String(col(r, 'Código', 'Codigo')).trim(); const q = num(col(r, 'Quantidade', 'Qtd') as string);
        const prod = products.find(x => x.code === code || x.name.toLowerCase() === String(col(r, 'Produto', 'Nome')).toLowerCase().trim());
        if (!prod || !(q > 0)) continue;
        const v = num(col(r, 'Valor unitário', 'Valor unitario', 'Custo') as string);
        ops.push({ op: 'update', path: 'products', id: prod.id, data: { stock: inc(q), ...(v > 0 ? { cost: v } : {}) } });
        ops.push({ op: 'add', path: 'moves', data: { pid: prod.id, pname: prod.name, t: 'Entrada', motivo: 'Compra', qty: q, val: v || prod.cost, date: String(col(r, 'Data') || ds()).slice(0, 10), obs: String(col(r, 'Observação', 'Observacao') || 'Importado'), user: user.name, at: Date.now() } });
      }
      if (!ops.length) return ui.toast('Nenhuma linha válida. Use as colunas Código (ou Produto), Quantidade, Valor unitário, Data, Observação.');
      await commit(ops); ui.toast(`${ops.length / 2} entrada(s) importada(s)`);
    } catch (e) { ui.toast('Erro ao importar: ' + (e as Error).message); }
  };
  return <>
    <div className="fg" style={{ maxWidth: 780 }}>
      <label>Operação<select value={t} onChange={e => setT(e.target.value as 'Entrada' | 'Baixa')}><option>Entrada</option><option>Baixa</option></select></label>
      <label className="w2">Produto (somente cadastrados)<select value={pid} onChange={e => setPid(e.target.value)}>{products.map(x => <option key={x.id} value={x.id}>{x.name} — {x.code} (atual {nf(x.stock)})</option>)}</select></label>
      <label>Quantidade<input type="number" inputMode="decimal" step="0.01" value={qty} onChange={e => setQty(e.target.value)} /></label>
      {t === 'Entrada' ? <label>Valor unitário (atualiza o custo)<input type="number" inputMode="decimal" step="0.01" value={val} onChange={e => setVal(e.target.value)} placeholder={p ? String(p.cost) : ''} /></label>
        : <label>Motivo<select value={mot} onChange={e => setMot(e.target.value)}><option>Venda</option><option>Uso Interno</option><option>Perda</option>{user.role === 'admin' ? <option>Ajuste</option> : <option disabled>Ajuste (só administrador)</option>}</select></label>}
      <label>Data<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
      <label className="w2">Observação<input value={obs} onChange={e => setObs(e.target.value)} /></label>
    </div>
    <div className="row end" style={{ maxWidth: 780 }}>
      <input ref={file} type="file" accept=".xlsx,.xls,.csv" hidden onChange={e => { const f = e.target.files?.[0]; if (f) importar(f); e.target.value = ''; }} />
      <button className="btn" onClick={() => file.current?.click()}>Importar entradas (XLSX)</button>
      <button className="btn p" disabled={busy} onClick={save}>Registrar {t.toLowerCase()}</button>
    </div>
  </>;
}

function Inventario() {
  const { products, user, ui } = useApp();
  const invs = useCol<Inventory>('inventories', { order: ['at', 'desc'], max: 30 });
  const [cnt, setCnt] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const isAdmin = user.role === 'admin';
  const gen = async () => {
    const items = products.filter(p => cnt[p.id] !== undefined && cnt[p.id] !== '' && num(cnt[p.id]) !== p.stock)
      .map(p => ({ pid: p.id, pname: p.name, before: p.stock, after: num(cnt[p.id]), cost: p.cost }));
    if (!items.length) return ui.toast('Nenhuma diferença para ajustar');
    setBusy(true);
    const ops: Op[] = [];
    let val = 0;
    for (const i of items) {
      val += (i.after - i.before) * i.cost;
      ops.push({ op: 'update', path: 'products', id: i.pid, data: { stock: i.after } });
      ops.push({ op: 'add', path: 'moves', data: { pid: i.pid, pname: i.pname, t: 'Ajuste', motivo: 'Inventário', qty: i.after - i.before, val: i.cost, date: ds(), obs: `Teórico ${nf(i.before)} → físico ${nf(i.after)}`, user: user.name, at: Date.now() } });
    }
    ops.push({ op: 'add', path: 'inventories', data: { at: Date.now(), user: user.name, n: items.length, val, items: items.map(({ cost, ...r }) => { void cost; return r; }) } });
    try { await commit(ops); setCnt({}); ui.toast(`${items.length} produto(s) ajustado(s)`); } catch (e) { ui.toast('Erro: ' + (e as Error).message); }
    setBusy(false);
  };
  const exp = () => exportXlsx('inventarios', {
    Inventários: [['Data', 'Responsável', 'Produto', 'Teórico', 'Físico', 'Diferença'],
      ...(invs || []).flatMap(v => v.items.map(i => [dt(v.at), v.user, i.pname, i.before, i.after, i.after - i.before]))]
  });
  return <>
    <p className="mute">Digite a contagem física. A diferença aparece contra o estoque teórico; ao gerar o ajuste, o estoque passa a ser o contado.</p>
    <div className="scroll"><table className="stack"><thead><tr><th>Produto</th><th className="n">Teórico</th><th className="n">Físico</th><th className="n">Diferença</th></tr></thead>
      <tbody>{products.map(p => {
        const v = cnt[p.id]; const df = v === undefined || v === '' ? null : num(v) - p.stock;
        return <tr key={p.id}><td>{p.name} <span className="mute">{p.unit}</span></td><td className="n">{nf(p.stock)}</td>
          <td className="n"><input type="number" inputMode="decimal" value={v ?? ''} onChange={e => setCnt({ ...cnt, [p.id]: e.target.value })} aria-label={'Contagem de ' + p.name} /></td>
          <td className="n" style={{ color: df !== null && df < 0 ? 'var(--red)' : 'var(--ok)' }}>{df === null ? '—' : (df > 0 ? '+' : '') + nf(df)}</td></tr>;
      })}</tbody></table></div>
    <div className="row end"><button className="btn p" disabled={busy || !isAdmin} title={isAdmin ? '' : 'Ajuste restrito ao administrador'} onClick={gen}>Gerar ajuste de estoque</button></div>
    <div className="row sb mt"><h3 style={{ margin: 0 }}>Histórico de inventários</h3><button className="btn sm" onClick={exp}>Exportar XLSX</button></div>
    {invs?.length ? invs.map(x => <p key={x.id}>{dt(x.at)} · {x.user} · {x.n} produto(s) ajustado(s) · diferença {brl(x.val)}</p>) : <p className="mute">Nenhum inventário registrado.</p>}
  </>;
}

function Historico() {
  const moves = useCol<Move>('moves', { order: ['at', 'desc'], max: 300 });
  if (!moves) return <p className="mute">Carregando…</p>;
  const exp = () => exportXlsx('movimentacoes-estoque', {
    Movimentações: [['Data', 'Operação', 'Produto', 'Quantidade', 'Valor unitário', 'Motivo', 'Usuário', 'Observação'],
      ...moves.map(m => [m.date, m.t, m.pname, m.qty, m.val, m.motivo, m.user, m.obs])]
  });
  return <>
    <div className="row end" style={{ marginTop: 0 }}><button className="btn sm" onClick={exp}>Exportar XLSX</button></div>
    {moves.length ? <div className="scroll"><table className="stack"><thead><tr><th>Data</th><th>Operação</th><th>Produto</th><th className="n">Qtd</th><th>Motivo</th><th>Usuário</th><th>Obs.</th></tr></thead>
      <tbody>{moves.map(m => <tr key={m.id}><td>{dbr(m.date)}</td><td><span className={'bd ' + (m.t === 'Entrada' ? 'ok' : m.t === 'Ajuste' ? 'y' : 'low')}>{m.t}</span></td>
        <td>{m.pname}</td><td className="n">{nf(m.qty)}</td><td>{m.motivo}</td><td>{m.user}</td><td>{m.obs}</td></tr>)}</tbody></table></div>
      : <Empty>Nenhuma movimentação ainda.</Empty>}
  </>;
}

