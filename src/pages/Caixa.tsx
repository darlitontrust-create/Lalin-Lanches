import { useState } from 'react';
import { useApp } from '../store';
import { useCol } from '../db';
import { caixaStats } from '../ops';
import type { Caixa, Order } from '../types';
import { brl, dt, exportXlsx } from '../utils';
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
