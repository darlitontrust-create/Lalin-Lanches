import { useState } from 'react';
import { useApp } from '../store';
import { commit, inc, useCol } from '../db';
import type { Loss } from '../types';
import { brl, dbr, ds, exportXlsx, nf, nm, num } from '../utils';
import { Empty, HBars } from '../components/ui';

export default function Perdas() {
  const { products, cfg, user, ui } = useApp();
  const [month, setMonth] = useState(ds().slice(0, 7));
  const [pid, setPid] = useState(products[0]?.id || '');
  const [qty, setQty] = useState('');
  const [mot, setMot] = useState(cfg.lossReasons[0] || 'Outro');
  const [date, setDate] = useState(ds());
  const [busy, setBusy] = useState(false);
  const rows = useCol<Loss>('losses', { where: [['date', '>=', month + '-01'], ['date', '<=', month + '-31']] });
  const p = products.find(x => x.id === pid);

  const save = async () => {
    const q = num(qty);
    if (!p || !(q > 0)) return ui.toast('Escolha o produto e a quantidade');
    setBusy(true);
    try {
      await commit([
        { op: 'add', path: 'losses', data: { pid: p.id, pname: p.name, cat: nm(cfg.cats, p.cat), qty: q, motivo: mot, date, user: user.name, value: q * p.cost, at: Date.now() } },
        { op: 'update', path: 'products', id: p.id, data: { stock: inc(-q) } },
        { op: 'add', path: 'moves', data: { pid: p.id, pname: p.name, t: 'Baixa', motivo: 'Perda', qty: q, val: p.cost, date, obs: mot, user: user.name, at: Date.now() } }
      ]);
      ui.toast(`Perda lançada e estoque baixado: ${nf(q)} ${p.unit} de ${p.name}`); setQty('');
    } catch (e) { ui.toast('Erro: ' + (e as Error).message); }
    setBusy(false);
  };
  const list = (rows || []).slice().sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at);
  const group = (f: (l: Loss) => string) => Object.entries(list.reduce<Record<string, number>>((m, l) => ({ ...m, [f(l)]: (m[f(l)] || 0) + l.value }), {})).sort((a, b) => b[1] - a[1]);
  const total = list.reduce((s, l) => s + l.value, 0);
  const exp = () => exportXlsx('perdas-' + month, {
    Lançamentos: [['Data', 'Produto', 'Categoria', 'Quantidade', 'Motivo', 'Responsável', 'Valor'], ...list.map(l => [l.date, l.pname, l.cat, l.qty, l.motivo, l.user, l.value])],
    'Por produto': [['Produto', 'Valor'], ...group(l => l.pname)],
    'Por motivo': [['Motivo', 'Valor'], ...group(l => l.motivo)],
    'Por categoria': [['Categoria', 'Valor'], ...group(l => l.cat)]
  });

  return <>
    <div className="g3">
      <div className="card"><h2>Lançar perda</h2>
        <div className="fg">
          <label className="w2">Produto (somente cadastrados)<select value={pid} onChange={e => setPid(e.target.value)}>{products.map(x => <option key={x.id} value={x.id}>{x.name} — estoque {nf(x.stock)} {x.unit}</option>)}</select></label>
          <label>Quantidade<input type="number" inputMode="decimal" step="0.01" value={qty} onChange={e => setQty(e.target.value)} /></label>
          <label>Motivo<select value={mot} onChange={e => setMot(e.target.value)}>{cfg.lossReasons.map(x => <option key={x}>{x}</option>)}</select></label>
          <label>Data<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
          <label>Responsável<input value={user.name} readOnly /></label>
        </div>
        <p className="mute">Ao lançar, o estoque é baixado automaticamente. Valor = quantidade × custo unitário{p ? ` (${brl(p.cost)})` : ''}.</p>
        <div className="row end"><button className="btn p" disabled={busy} onClick={save}>Lançar perda</button></div>
      </div>
      <div className="card kpi hot" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div className="row sb"><div className="l">Valor perdido no mês</div><input type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ width: 'auto', minHeight: 36 }} /></div>
        <div className="v" style={{ fontSize: 44 }}>{brl(total)}</div><div className="l">{list.length} lançamento(s)</div>
      </div>
    </div>
    <div className="g2 mt">
      <div className="card"><h2>Por motivo</h2><HBars rows={group(l => l.motivo)} fmt={brl} /><h2 className="mt">Por categoria</h2><HBars rows={group(l => l.cat)} fmt={brl} /></div>
      <div className="card"><h2>Por produto</h2><HBars rows={group(l => l.pname)} fmt={brl} /></div>
    </div>
    <div className="card mt">
      <div className="row sb"><h2>Lançamentos</h2><button className="btn sm" onClick={exp}>Exportar XLSX</button></div>
      {list.length ? <div className="scroll"><table className="stack"><thead><tr><th>Data</th><th>Produto</th><th className="n">Qtd</th><th>Motivo</th><th>Responsável</th><th className="n">Valor</th></tr></thead>
        <tbody>{list.map(l => <tr key={l.id}><td>{dbr(l.date)}</td><td>{l.pname}</td><td className="n">{nf(l.qty)}</td><td>{l.motivo}</td><td>{l.user}</td><td className="n">{brl(l.value)}</td></tr>)}</tbody></table></div>
        : <Empty>Nenhuma perda neste mês.</Empty>}
    </div>
  </>;
}
