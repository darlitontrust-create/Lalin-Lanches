// Log de exclusões: tudo que foi excluído, por quem, quando e por quê
import { Fragment, useState } from 'react';
import { add, commit, fetchCol, useCol, type Op } from '../db';
import { useApp } from '../store';
import { checkPin } from '../security';
import type { Deletion } from '../types';
import { brl, ds, dt, exportXlsx } from '../utils';
import { Empty, HBars, ModalHead } from '../components/ui';

export default function Log() {
  const { ui } = useApp();
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
          <button className="btn sm" onClick={exp}>Exportar XLSX</button>
          <button className="btn sm danger" onClick={() => ui.modal(<ClearLogModal month={month} />)}>Limpar log</button></div>
      </div>
      <p className="mute">Ninguém altera estes registros; só o administrador pode limpar o log, com senha. Valor total excluído no filtro: <b>{brl(list.reduce((s, d) => s + (d.value || 0), 0))}</b></p>
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

/** Limpeza do log: só administrador, com senha. A limpeza em si fica registrada. */
function ClearLogModal({ month }: { month: string }) {
  const { ui, user } = useApp();
  const [scope, setScope] = useState<'mes' | 'tudo'>('mes');
  const [pin, setPinV] = useState('');
  const [busy, setBusy] = useState(false);
  const close = () => ui.modal(null);
  const label = scope === 'mes' ? `de ${month.slice(5, 7)}/${month.slice(0, 4)}` : 'de todos os meses';
  const go = async () => {
    if (!pin) return ui.toast('Digite a senha do administrador');
    setBusy(true);
    try {
      if (!(await checkPin(pin))) { ui.toast('Senha incorreta'); setBusy(false); return; }
      const from = new Date(month + '-01T00:00').getTime();
      const to = new Date(new Date(from).getFullYear(), new Date(from).getMonth() + 1, 1).getTime();
      const rows = await fetchCol<Deletion>('deletions', scope === 'mes' ? { where: [['at', '>=', from], ['at', '<', to]] } : {});
      const ops: Op[] = rows.map(r => ({ op: 'delete', path: 'deletions', id: r.id }));
      await commit(ops);
      await add('deletions', { at: Date.now(), user: user.name, kind: 'Limpeza do log', desc: `${rows.length} registro(s) ${label} apagado(s)`, value: 0,
        reason: 'Limpeza do log', note: '', ref: '', date: ds(), data: null });
      ui.toast(`Log limpo: ${rows.length} registro(s) apagado(s)`); close();
    } catch (e) { ui.toast('Erro: ' + (e as Error).message); setBusy(false); }
  };
  return <>
    <ModalHead title="Limpar Log de exclusões" onClose={close} />
    <div className="chips" style={{ marginBottom: 12 }}>
      <button className={'chip' + (scope === 'mes' ? ' on' : '')} onClick={() => setScope('mes')}>Só o mês {month.slice(5, 7)}/{month.slice(0, 4)}</button>
      <button className={'chip' + (scope === 'tudo' ? ' on' : '')} onClick={() => setScope('tudo')}>Todo o log</button>
    </div>
    <p className="note">Os registros {label} serão apagados definitivamente. Fica apenas uma linha informando quem limpou e quando. Exporte o XLSX antes, se quiser guardar.</p>
    <label>Senha do administrador<input type="password" value={pin} onChange={e => setPinV(e.target.value)} autoFocus autoComplete="off" onKeyDown={e => { if (e.key === 'Enter') go(); }} /></label>
    <div className="row end"><button className="btn" onClick={close}>Cancelar</button><button className="btn p" disabled={busy} onClick={go}>Limpar log</button></div>
  </>;
}
