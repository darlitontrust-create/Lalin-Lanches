import { useState } from 'react';
import { useApp } from '../store';
import { add, patch, remove, useCol } from '../db';
import type { Expense } from '../types';
import { brl, dbr, ds, exportXlsx, isOn, num } from '../utils';
import { Empty, HBars, ModalHead } from '../components/ui';

export default function Despesas() {
  const { cfg, user, ui } = useApp();
  const admin = user.role === 'admin';
  const expCats = cfg.expenseCats.filter(x => isOn(cfg, 'expenseCats', x)), invCats = cfg.investCats.filter(x => isOn(cfg, 'investCats', x));
  const [month, setMonth] = useState(ds().slice(0, 7));
  const [kind, setKind] = useState<'despesa' | 'investimento'>('despesa');
  const [cat, setCat] = useState(expCats[0] || '');
  const [desc, setDesc] = useState('');
  const [value, setValue] = useState('');
  const [date, setDate] = useState(ds());
  const [busy, setBusy] = useState(false);
  const rows = useCol<Expense>('expenses', { where: [['date', '>=', month + '-01'], ['date', '<=', month + '-31']] });
  const cats = kind === 'despesa' ? expCats : invCats;

  const save = async () => {
    if (!(num(value) > 0) || !cat) return ui.toast('Informe a categoria e o valor');
    setBusy(true);
    try {
      await add('expenses', { date, kind, cat, desc: desc.trim(), value: num(value), user: user.name, at: Date.now() });
      ui.toast(`${kind === 'despesa' ? 'Despesa' : 'Investimento'} lançado: ${cat} ${brl(num(value))}`);
      setDesc(''); setValue('');
    } catch (e) { ui.toast('Erro: ' + (e as Error).message); }
    setBusy(false);
  };
  const del = async (x: Expense) => {
    if (await ui.confirm({ title: 'Apagar lançamento?', text: `${x.cat} · ${brl(x.value)} · ${dbr(x.date)}`, ok: 'Apagar' })) { await remove('expenses', x.id); ui.toast('Lançamento apagado'); }
  };
  const list = (rows || []).slice().sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at);
  const sum = (k: string) => list.filter(x => x.kind === k).reduce((s, x) => s + x.value, 0);
  const byCat = (k: string) => Object.entries(list.filter(x => x.kind === k).reduce<Record<string, number>>((m, x) => ({ ...m, [x.cat]: (m[x.cat] || 0) + x.value }), {})).sort((a, b) => b[1] - a[1]);
  const exp = () => exportXlsx('despesas-' + month, {
    Lançamentos: [['Data', 'Tipo', 'Categoria', 'Descrição', 'Valor', 'Lançado por'], ...list.map(x => [x.date, x.kind, x.cat, x.desc, x.value, x.user])],
    'Por categoria': [['Tipo', 'Categoria', 'Total'], ...byCat('despesa').map(([c, v]) => ['despesa', c, v]), ...byCat('investimento').map(([c, v]) => ['investimento', c, v])]
  });

  return <>
    <div className="g3">
      <div className="card"><h2>Lançar</h2>
        <div className="chips" style={{ marginBottom: 10 }}>
          <button className={'chip' + (kind === 'despesa' ? ' on' : '')} onClick={() => { setKind('despesa'); setCat(expCats[0] || ''); }}>Despesa operacional</button>
          <button className={'chip' + (kind === 'investimento' ? ' on' : '')} onClick={() => { setKind('investimento'); setCat(invCats[0] || ''); }}>Investimento</button>
        </div>
        <div className="fg">
          <label>Categoria<select value={cat} onChange={e => setCat(e.target.value)}>{cats.map(c => <option key={c}>{c}</option>)}</select></label>
          <label>Valor<input type="number" inputMode="decimal" step="0.01" value={value} onChange={e => setValue(e.target.value)} placeholder="0,00" /></label>
          <label>Data<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
          <label className="w2">Descrição (opcional)<input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Ex.: conta de luz de outubro" /></label>
        </div>
        <p className="mute">Despesas entram no Resultado operacional. Investimentos aparecem separados, sem reduzir o lucro operacional. Novas categorias: Cadastro › Categorias de despesa.</p>
        <div className="row end"><button className="btn p" disabled={busy} onClick={save}>Lançar</button></div>
      </div>
      <div className="card"><div className="row sb"><h2>Mês</h2><input type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ width: 'auto' }} /></div>
        <div className="kpis" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 10 }}>
          <div className="card kpi hot"><div className="l">Despesas</div><div className="v">{brl(sum('despesa'))}</div></div>
          <div className="card kpi"><div className="l">Investimentos</div><div className="v">{brl(sum('investimento'))}</div></div>
        </div>
        <HBars rows={byCat('despesa')} fmt={brl} />
      </div>
    </div>
    <div className="card mt">
      <div className="row sb"><h2>Lançamentos do mês</h2><button className="btn sm" onClick={exp}>Exportar XLSX</button></div>
      {rows === null ? <p className="mute">Carregando…</p> : list.length ? <div className="scroll"><table className="stack"><thead><tr><th>Data</th><th>Tipo</th><th>Categoria</th><th>Descrição</th><th className="n">Valor</th><th>Por</th><th></th></tr></thead>
        <tbody>{list.map(x => <tr key={x.id}><td>{dbr(x.date)}</td><td><span className={'bd ' + (x.kind === 'despesa' ? 'low' : 'v')}>{x.kind === 'despesa' ? 'Despesa' : 'Investimento'}</span></td>
          <td>{x.cat}</td><td>{x.desc}</td><td className="n">{brl(x.value)}</td><td>{x.user}</td><td>{admin && <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}><button className="btn sm" onClick={() => ui.modal(<ExpenseEditModal x={x} />)}>Editar</button><button className="btn sm danger" onClick={() => del(x)}>Apagar</button></div>}</td></tr>)}</tbody></table></div>
        : <Empty>Nenhum lançamento neste mês.</Empty>}
    </div>
  </>;
}

function ExpenseEditModal({ x }: { x: Expense }) {
  const { cfg, ui, user } = useApp();
  const [kind, setKind] = useState(x.kind);
  const [cat, setCat] = useState(x.cat);
  const [desc, setDesc] = useState(x.desc);
  const [value, setValue] = useState(String(x.value));
  const [date, setDate] = useState(x.date);
  const close = () => ui.modal(null);
  const list = (kind === 'despesa' ? cfg.expenseCats : cfg.investCats).filter(c => isOn(cfg, kind === 'despesa' ? 'expenseCats' : 'investCats', c) || c === x.cat);
  const save = async () => {
    if (!(num(value) > 0) || !cat) return ui.toast('Informe a categoria e o valor');
    await patch('expenses', x.id, { kind, cat, desc: desc.trim(), value: num(value), date, editedBy: user.name, editedAt: Date.now() });
    ui.toast('Lançamento atualizado'); close();
  };
  return <>
    <ModalHead title="Editar lançamento" onClose={close} />
    <div className="chips" style={{ marginBottom: 10 }}>
      <button className={'chip' + (kind === 'despesa' ? ' on' : '')} onClick={() => { setKind('despesa'); setCat(cfg.expenseCats[0] || ''); }}>Despesa operacional</button>
      <button className={'chip' + (kind === 'investimento' ? ' on' : '')} onClick={() => { setKind('investimento'); setCat(cfg.investCats[0] || ''); }}>Investimento</button>
    </div>
    <div className="fg">
      <label>Categoria<select value={cat} onChange={e => setCat(e.target.value)}>{(list.includes(cat) ? list : [cat, ...list]).map(c => <option key={c}>{c}</option>)}</select></label>
      <label>Valor<input type="number" inputMode="decimal" step="0.01" value={value} onChange={e => setValue(e.target.value)} /></label>
      <label>Data<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
      <label className="w2">Descrição<input value={desc} onChange={e => setDesc(e.target.value)} /></label>
    </div>
    <div className="row end"><button className="btn" onClick={close}>Cancelar</button><button className="btn p" onClick={save}>Salvar</button></div>
  </>;
}
