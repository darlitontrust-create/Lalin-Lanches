// Log de exclusões: tudo que foi excluído, por quem, quando e por quê
import { Fragment, useState } from 'react';
import { useCol } from '../db';
import type { Deletion } from '../types';
import { brl, ds, dt, exportXlsx } from '../utils';
import { Empty, HBars } from '../components/ui';

export default function Log() {
  const [month, setMonth] = useState(ds().slice(0, 7));
  const [kind, setKind] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const from = new Date(month + '-01T00:00').getTime();
  const to = new Date(new Date(from).getFullYear(), new Date(from).getMonth() + 1, 1).getTime();
  const rows = useCol<Deletion>('deletions', { where: [['at', '>=', from], ['at', '<', to]] });
  const all = (rows || []).slice().sort((a, b) => b.at - a.at);
  const kinds = [...new Set(all.map(x => x.kind))];
  const list = all.filter(x => !kind || x.kind === kind);
  const group = (f: (d: Deletion) => string) => Object.entries(list.reduce<Record<string, number>>((m, d) => ({ ...m, [f(d)]: (m[f(d)] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
  const exp = () => exportXlsx('log-exclusoes-' + month, {
    Exclusões: [['Data e hora', 'Tipo', 'Descrição', 'Valor', 'Motivo', 'Observação', 'Excluído por', 'Data do lançamento'],
      ...list.map(d => [dt(d.at), d.kind, d.desc, d.value, d.reason, d.note, d.user, d.date])]
  });
  return <>
    <div className="card">
      <div className="row sb">
        <div className="chips"><button className={'chip' + (!kind ? ' on' : '')} onClick={() => setKind('')}>Todos ({all.length})</button>
          {kinds.map(k => <button key={k} className={'chip' + (kind === k ? ' on' : '')} onClick={() => setKind(k)}>{k} ({all.filter(x => x.kind === k).length})</button>)}</div>
        <div className="row"><input type="month" value={month} onChange={e => setMonth(e.target.value || ds().slice(0, 7))} style={{ width: 'auto' }} aria-label="Mês" />
          <button className="btn sm" onClick={exp}>Exportar XLSX</button></div>
      </div>
      <p className="mute">Registro permanente: nada aqui pode ser alterado ou apagado. Valor total excluído no filtro: <b>{brl(list.reduce((s, d) => s + (d.value || 0), 0))}</b></p>
      {rows === null ? <p className="mute">Carregando…</p> : list.length ? <div className="scroll"><table className="stack"><thead><tr><th>Quando</th><th>Tipo</th><th>O que foi excluído</th><th className="n">Valor</th><th>Motivo</th><th>Por</th><th></th></tr></thead>
        <tbody>{list.map(d => <Fragment key={d.id}>
          <tr><td>{dt(d.at)}</td><td><span className="bd low">{d.kind}</span></td><td>{d.desc}</td><td className="n">{brl(d.value || 0)}</td>
            <td>{d.reason}{d.note && <><br /><span className="mute">{d.note}</span></>}</td><td>{d.user}</td>
            <td>{d.data && <button className="btn sm" onClick={() => setOpen(open === d.id ? null : d.id)}>{open === d.id ? 'Fechar' : 'Detalhes'}</button>}</td></tr>
          {open === d.id && <tr><td colSpan={7}><Details data={d.data!} /></td></tr>}
        </Fragment>)}</tbody></table></div> : <Empty>Nenhuma exclusão neste mês.</Empty>}
    </div>
    {list.length > 0 && <div className="g2 mt">
      <div className="card"><h2>Por motivo</h2><HBars rows={group(d => d.reason)} fmt={v => v + 'x'} /></div>
      <div className="card"><h2>Por usuário</h2><HBars rows={group(d => d.user)} fmt={v => v + 'x'} /></div>
    </div>}
  </>;
}

const LABELS: Record<string, string> = {
  num: 'Nº do pedido', client: 'Cliente', phone: 'Telefone', note: 'Identificação', day: 'Dia', date: 'Data', status: 'Status', by: 'Lançado por',
  user: 'Lançado por', pname: 'Produto', qty: 'Quantidade', motivo: 'Motivo', value: 'Valor', cat: 'Categoria', desc: 'Descrição', kind: 'Tipo',
  t: 'Operação', val: 'Valor unitário', obs: 'Observação', pedido: 'Nº do pedido', cliente: 'Cliente', item: 'Item', quantidade: 'Quantidade', preco: 'Preço'
};
/** Mostra o registro excluído de forma legível. */
function Details({ data }: { data: Record<string, unknown> }) {
  const items = Array.isArray(data.items) ? (data.items as { qty: number; name: string; price: number; rem?: string[] }[]) : null;
  const pay = data.pay as { m?: string; recv?: number; change?: number } | undefined;
  const rows = Object.entries(data).filter(([k, v]) => LABELS[k] && v !== '' && v !== null && typeof v !== 'object');
  return <div style={{ fontSize: 13, display: 'grid', gap: 4 }}>
    {rows.map(([k, v]) => <div key={k}><span className="mute">{LABELS[k]}:</span> {typeof v === 'number' && ['value', 'val', 'preco'].includes(k) ? brl(v) : String(v)}</div>)}
    {items && <div><span className="mute">Itens:</span> {items.map(i => `${i.qty}× ${i.name} (${brl(i.price)})${i.rem?.length ? ' sem ' + i.rem.join(', ').toLowerCase() : ''}`).join(' · ')}</div>}
    {pay?.m && <div><span className="mute">Pagamento:</span> {pay.m}{pay.m === 'Dinheiro' ? ` · recebido ${brl(pay.recv || 0)} · troco ${brl(pay.change || 0)}` : ''}</div>}
  </div>;
}
