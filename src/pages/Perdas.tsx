import { useState } from 'react';
import { useApp } from '../store';
import { commit, inc, useCol } from '../db';
import type { Loss } from '../types';
import { brl, dbr, ds, exportXlsx, isOn, newId, nf, nm, num } from '../utils';
import { deleteLoss, editLoss } from '../ops';
import { ModalHead } from '../components/ui';
import { DeleteReasonModal } from '../components/DeleteModal';
import { Empty, HBars } from '../components/ui';

export default function Perdas() {
  const { products, cfg, user, ui } = useApp();
  const admin = user.role === 'admin';
  const reasons = cfg.lossReasons.filter(x => isOn(cfg, 'lossReasons', x));
  const [month, setMonth] = useState(ds().slice(0, 7));
  const [pid, setPid] = useState(products[0]?.id || '');
  const [qty, setQty] = useState('');
  const [mot, setMot] = useState(reasons[0] || 'Outro');
  const [date, setDate] = useState(ds());
  const [busy, setBusy] = useState(false);
  const rows = useCol<Loss>('losses', { where: [['date', '>=', month + '-01'], ['date', '<=', month + '-31']] });
  const p = products.find(x => x.id === pid);

  const save = async () => {
    const q = num(qty);
    if (!p || !(q > 0)) return ui.toast('Escolha o produto e a quantidade');
    setBusy(true);
    try {
      const moveId = newId();
      await commit([
        { op: 'add', path: 'losses', data: { pid: p.id, pname: p.name, cat: nm(cfg.cats, p.cat), qty: q, motivo: mot, date, user: user.name, value: q * p.cost, at: Date.now(), moveId } },
        { op: 'update', path: 'products', id: p.id, data: { stock: inc(-q) } },
        { op: 'set', path: 'moves', id: moveId, data: { pid: p.id, pname: p.name, t: 'Baixa', motivo: 'Perda', qty: q, val: p.cost, date, obs: mot, user: user.name, at: Date.now() } }
      ]);
      ui.toast(`Perda lançada e estoque baixado: ${nf(q)} ${p.unit} de ${p.name}`); setQty('');
    } catch (e) { ui.toast('Erro: ' + (e as Error).message); }
    setBusy(false);
  };
  const del = (l: Loss) => ui.modal(<DeleteReasonModal title="Excluir esta perda?"
    details={<>{l.qty}× {l.pname} · {l.motivo} · {brl(l.value)}<br /><span className="mute">A quantidade volta para o estoque.</span></>}
    onConfirm={async why => { await deleteLoss(l, user, products, why); ui.modal(null); ui.toast('Perda excluída e estoque devolvido'); }} />);
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
          <label>Motivo<select value={mot} onChange={e => setMot(e.target.value)}>{reasons.map(x => <option key={x}>{x}</option>)}</select></label>
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
      {list.length ? <div className="scroll"><table className="stack"><thead><tr><th>Data</th><th>Produto</th><th className="n">Qtd</th><th>Motivo</th><th>Responsável</th><th className="n">Valor</th>{admin && <th></th>}</tr></thead>
        <tbody>{list.map(l => <tr key={l.id}><td>{dbr(l.date)}</td><td>{l.pname}</td><td className="n">{nf(l.qty)}</td><td>{l.motivo}</td><td>{l.user}</td><td className="n">{brl(l.value)}</td>{admin && <td><div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}><button className="btn sm" onClick={() => ui.modal(<LossEditModal l={l} />)}>Editar</button><button className="btn sm danger" onClick={() => del(l)}>Excluir</button></div></td>}</tr>)}</tbody></table></div>
        : <Empty>Nenhuma perda neste mês.</Empty>}
    </div>
  </>;
}

function LossEditModal({ l }: { l: Loss }) {
  const { cfg, ui, user, products } = useApp();
  const [qty, setQty] = useState(String(l.qty));
  const [mot, setMot] = useState(l.motivo);
  const [date, setDate] = useState(l.date);
  const [busy, setBusy] = useState(false);
  const close = () => ui.modal(null);
  const unit = l.qty ? l.value / l.qty : 0;
  const reasons = cfg.lossReasons.filter(x => isOn(cfg, 'lossReasons', x) || x === l.motivo);
  const save = async () => {
    const q = num(qty);
    if (!(q > 0)) return ui.toast('Informe a quantidade');
    setBusy(true);
    try { await editLoss(l, { qty: q, motivo: mot, date }, user, products); ui.toast('Perda atualizada' + (q !== l.qty ? ' · estoque acertado' : '')); close(); }
    catch (e) { ui.toast('Erro: ' + (e as Error).message); setBusy(false); }
  };
  return <>
    <ModalHead title={'Editar perda · ' + l.pname} onClose={close} />
    <div className="fg">
      <label>Quantidade<input type="number" inputMode="decimal" step="0.01" value={qty} onChange={e => setQty(e.target.value)} /></label>
      <label>Motivo<select value={mot} onChange={e => setMot(e.target.value)}>{reasons.map(x => <option key={x}>{x}</option>)}</select></label>
      <label>Data<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
      <label>Valor<input readOnly value={brl(num(qty) * unit)} /></label>
    </div>
    <p className="mute">Se a quantidade mudar, o estoque é acertado pela diferença.</p>
    <div className="row end"><button className="btn" onClick={close}>Cancelar</button><button className="btn p" disabled={busy} onClick={save}>Salvar</button></div>
  </>;
}
