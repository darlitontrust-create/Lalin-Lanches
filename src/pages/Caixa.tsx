import { useState } from 'react';
import { useApp } from '../store';
import { useCol } from '../db';
import { caixaStats, deleteOrder } from '../ops';
import type { Caixa, Order } from '../types';
import { ML, STATUS, brl, ds, dt, exportXlsx, hm, isSale, orderTotal } from '../utils';
import { Empty, HBars } from '../components/ui';
import { CaixaOpen, CloseCaixaModal } from './shared';

export default function CaixaPage() {
  const { caixa, ui, go, can } = useApp();
  const orders = useCol<Order>('orders', { where: [['cx', '==', caixa?.id || '-']] }, !!caixa);
  const hist = useCol<Caixa>('caixas', { order: ['at', 'desc'], max: 60 });
  const [show, setShow] = useState(15);
  const closed = (hist || []).filter(c => !c.open);
  const s = caixa && orders ? caixaStats(caixa, orders) : null;

  const exportHist = () => exportXlsx('fechamentos-caixa', {
    Fechamentos: [['Abertura', 'Fechamento', 'Aberto por', 'Fechado por', 'Fundo', 'Vendas', 'Vendido', 'Esperado em dinheiro', 'Contado', 'Diferença'],
      ...closed.map(c => [dt(c.at), c.closedAt ? dt(c.closedAt) : '', c.by, c.closedBy || '', c.initial, c.orders || 0, c.sold || 0, c.expected || 0, c.counted || 0, c.diff || 0])]
  });

  return <>
    {!caixa ? <CaixaOpen /> : !s ? <p className="mute">Carregando…</p> : <>
      <div className="kpis">
        <div className="card kpi hot"><div className="l">Total vendido</div><div className="v">{brl(s.sold)}</div><div className="s">{s.sales.length} venda(s)</div></div>
        <div className="card kpi"><div className="l">Total recebido</div><div className="v">{brl(s.recv)}</div></div>
        <div className="card kpi"><div className="l">Troco concedido</div><div className="v">{brl(s.change)}</div></div>
        <div className="card kpi"><div className="l">Fundo inicial</div><div className="v">{brl(caixa.initial)}</div></div>
        <div className="card kpi"><div className="l">Esperado em dinheiro</div><div className="v">{brl(s.cash)}</div></div>
      </div>
      <div className="g2">
        <div className="card"><h2>Vendas por forma de pagamento</h2><HBars rows={Object.entries(s.by).sort((a, b) => b[1] - a[1])} fmt={brl} /></div>
        <div className="card"><h2>Fechamento</h2>
          <p className="mute">O caixa só fecha quando todos os pedidos da fila estiverem pagos e entregues, ou cancelados. Ao fechar, a fila e a numeração recomeçam.</p>
          <div className="row">
            <button className="btn p" onClick={() => ui.modal(<CloseCaixaModal onGoQueue={can('pedidos') ? () => go('pedidos') : undefined} />)}>Fechar caixa</button>
            {can('pedidos') && <button className="btn" onClick={() => go('pedidos')}>Ir para Pedidos</button>}
          </div></div>
      </div>
    </>}
    <VendasDoDia />
    <div className="card mt">
      <div className="row sb"><h2>Fechamentos anteriores</h2><div className="row noprint"><button className="btn sm" onClick={exportHist}>Exportar XLSX</button><button className="btn sm" onClick={() => window.print()}>Imprimir / PDF</button></div></div>
      {closed.length ? <div className="scroll"><table className="stack"><thead><tr><th>Abertura</th><th>Fechamento</th><th>Responsável</th><th className="n">Vendas</th><th className="n">Vendido</th><th className="n">Esperado em dinheiro</th><th className="n">Contado</th><th className="n">Diferença</th></tr></thead>
        <tbody>{closed.slice(0, show).map(c => <tr key={c.id}><td>{dt(c.at)}</td><td>{c.closedAt ? dt(c.closedAt) : ''}</td><td>{c.closedBy || c.by}</td><td className="n">{c.orders || 0}</td>
          <td className="n">{brl(c.sold || 0)}</td><td className="n">{brl(c.expected || 0)}</td><td className="n">{brl(c.counted || 0)}</td>
          <td className="n" style={{ color: (c.diff || 0) < 0 ? 'var(--red)' : 'var(--ok)' }}>{brl(c.diff || 0)}</td></tr>)}</tbody></table>
        {closed.length > show && <button className="btn sm" onClick={() => setShow(show + 15)}>Ver mais</button>}</div>
        : <Empty>Nenhum fechamento registrado ainda.</Empty>}
    </div>
  </>;
}

/** Lista de pedidos de um dia, com exclusão (somente administrador). */
function VendasDoDia() {
  const { user, ui, products } = useApp();
  const admin = user.role === 'admin';
  const [day, setDay] = useState(ds());
  const rows = useCol<Order>('orders', { where: [['day', '==', day]] });
  const list = (rows || []).slice().sort((a, b) => b.at - a.at);
  const sold = list.filter(isSale).reduce((s, o) => s + orderTotal(o), 0);
  const del = async (o: Order) => {
    const ok = await ui.confirm({
      title: `Apagar o pedido nº ${o.num} de ${o.client}?`, ok: 'Apagar definitivamente',
      text: <>
        <p style={{ margin: '0 0 8px' }}>{o.items.map(i => `${i.qty}× ${i.name}`).join(', ')} · <b>{brl(orderTotal(o))}</b></p>
        <p className="mute" style={{ margin: 0 }}>O pedido some da fila, das vendas e dos resultados.{isSale(o) ? ' Os itens voltam ao estoque.' : ''} Esta ação não pode ser desfeita.
          {o.status !== 'cancelado' && ' Se o cliente só desistiu, prefira cancelar o pedido na fila: assim fica o registro.'}
          {' '}Fechamentos de caixa já feitos mantêm os valores que foram registrados.</p>
      </>
    });
    if (!ok) return;
    try { await deleteOrder(o, user, products); ui.toast(`Pedido nº ${o.num} apagado`); } catch (e) { ui.toast('Erro: ' + (e as Error).message); }
  };
  const exp = () => exportXlsx('pedidos-' + day, {
    Pedidos: [['Nº', 'Hora', 'Cliente', 'Itens', 'Consumo', 'Status', 'Pago', 'Forma', 'Total', 'Lançado por'],
      ...list.map(o => [o.num, hm(o.at), o.client, o.items.map(i => `${i.qty}x ${i.name}`).join(', '), ML[o.mode], STATUS[o.status].n, o.paid ? (o.pay?.refunded ? 'Estornado' : 'Sim') : 'Não', o.pay?.m || '', orderTotal(o), o.by])]
  });
  return <div className="card mt">
    <div className="row sb"><h2 style={{ margin: 0 }}>Vendas do dia</h2>
      <div className="row noprint"><input type="date" value={day} max={ds()} onChange={e => setDay(e.target.value || ds())} style={{ width: 'auto' }} aria-label="Dia" />
        <button className="btn sm" onClick={exp}>Exportar XLSX</button></div></div>
    <p className="mute">{list.length} pedido(s) · vendido {brl(sold)}{admin ? ' · o administrador pode apagar lançamentos feitos por engano' : ''}</p>
    {rows === null ? <p className="mute">Carregando…</p> : list.length ? <div className="scroll"><table className="stack"><thead><tr><th>Nº</th><th>Hora</th><th>Cliente</th><th>Itens</th><th>Status</th><th>Pagamento</th><th className="n">Total</th><th>Por</th>{admin && <th></th>}</tr></thead>
      <tbody>{list.map(o => <tr key={o.id}><td>{o.num}</td><td>{hm(o.at)}</td><td>{o.client}</td><td>{o.items.map(i => `${i.qty}× ${i.name}`).join(', ')}</td>
        <td>{STATUS[o.status].n}</td><td>{o.paid ? (o.pay?.refunded ? 'Estornado' : o.pay?.m) : 'Não pago'}</td><td className="n">{brl(orderTotal(o))}</td><td>{o.by}</td>
        {admin && <td><button className="btn sm danger" onClick={() => del(o)}>Apagar</button></td>}</tr>)}</tbody></table></div>
      : <Empty>Nenhum pedido neste dia.</Empty>}
  </div>;
}
