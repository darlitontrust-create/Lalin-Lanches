import { useState } from 'react';
import { patch } from '../db';
import { useApp } from '../store';
import { useCol } from '../db';
import { caixaStats, deleteOrder, editSale } from '../ops';
import type { Caixa, Mode, Order, OrderItem } from '../types';
import { ML, STATUS, brl, ds, dt, exportXlsx, hm, isOn, isSale, num, orderTotal, sellable } from '../utils';
import { Empty, HBars, ModalHead } from '../components/ui';
import { CaixaOpen, CloseCaixaModal } from './shared';

export default function CaixaPage() {
  const { caixa, ui, go, can, user } = useApp();
  const admin = user.role === 'admin';
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
      {closed.length ? <div className="scroll"><table className="stack"><thead><tr><th>Abertura</th><th>Fechamento</th><th>Responsável</th><th className="n">Vendas</th><th className="n">Vendido</th><th className="n">Esperado em dinheiro</th><th className="n">Contado</th><th className="n">Diferença</th>{admin && <th></th>}</tr></thead>
        <tbody>{closed.slice(0, show).map(c => <tr key={c.id}><td>{dt(c.at)}</td><td>{c.closedAt ? dt(c.closedAt) : ''}</td><td>{c.closedBy || c.by}</td><td className="n">{c.orders || 0}</td>
          <td className="n">{brl(c.sold || 0)}</td><td className="n">{brl(c.expected || 0)}</td><td className="n">{brl(c.counted || 0)}</td>
          <td className="n" style={{ color: (c.diff || 0) < 0 ? 'var(--red)' : 'var(--ok)' }}>{brl(c.diff || 0)}</td>{admin && <td><button className="btn sm" onClick={() => ui.modal(<ClosingEditModal c={c} />)}>Editar</button></td>}</tr>)}</tbody></table>
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
    <p className="mute">{list.length} pedido(s) · vendido {brl(sold)}{admin ? ' · o administrador pode editar ou apagar lançamentos feitos por engano' : ''}</p>
    {rows === null ? <p className="mute">Carregando…</p> : list.length ? <div className="scroll"><table className="stack"><thead><tr><th>Nº</th><th>Hora</th><th>Cliente</th><th>Itens</th><th>Status</th><th>Pagamento</th><th className="n">Total</th><th>Por</th>{admin && <th></th>}</tr></thead>
      <tbody>{list.map(o => <tr key={o.id}><td>{o.num}</td><td>{hm(o.at)}</td><td>{o.client}</td><td>{o.items.map(i => `${i.qty}× ${i.name}`).join(', ')}</td>
        <td>{STATUS[o.status].n}</td><td>{o.paid ? (o.pay?.refunded ? 'Estornado' : o.pay?.m) : 'Não pago'}</td><td className="n">{brl(orderTotal(o))}</td><td>{o.by}</td>
        {admin && <td><div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}><button className="btn sm" disabled={o.status === 'cancelado'} onClick={() => ui.modal(<OrderEditModal o={o} />)}>Editar</button><button className="btn sm danger" onClick={() => del(o)}>Apagar</button></div></td>}</tr>)}</tbody></table></div>
      : <Empty>Nenhum pedido neste dia.</Empty>}
  </div>;
}

/** Edição de pedido/venda: cliente, itens, quantidades e forma de pagamento. */
function OrderEditModal({ o }: { o: Order }) {
  const { products, cfg, user, ui } = useApp();
  const [client, setClient] = useState(o.client);
  const [phone, setPhone] = useState(o.phone || '');
  const [note, setNote] = useState(o.note || '');
  const [mode, setMode] = useState<Mode>(o.mode);
  const [items, setItems] = useState<OrderItem[]>(o.items.map(i => ({ ...i, rem: [...i.rem] })));
  const [payM, setPayM] = useState(o.pay?.m || '');
  const [recv, setRecv] = useState(String(o.pay?.recv ?? ''));
  const [addPid, setAddPid] = useState('');
  const [busy, setBusy] = useState(false);
  const close = () => ui.modal(null);
  const t = items.reduce((s, i) => s + i.qty * i.price, 0);
  const qty = (k: number, d: number) => setItems(items.map((i, j) => (j === k ? { ...i, qty: i.qty + d } : i)).filter(i => i.qty > 0));
  const addItem = () => {
    const p = products.find(x => x.id === addPid); if (!p) return;
    setItems([...items, { pid: p.id, name: p.name, price: p.price, cost: p.cost, qty: 1, rem: [], obs: '', mode, removable: p.ingr.some(x => x.r) }]);
    setAddPid('');
  };
  const save = async () => {
    if (!client.trim()) return ui.toast('O nome do cliente é obrigatório');
    if (!items.length) return ui.toast('O pedido ficou sem itens. Para tirar o pedido, use Apagar.');
    if (o.paid && payM === 'Dinheiro' && num(recv) < t) return ui.toast('Valor recebido menor que o total');
    setBusy(true);
    try {
      await editSale(o, { client, phone, note, mode, items, payM: o.paid ? payM : undefined, recv: num(recv) }, user, products);
      ui.toast(`Pedido nº ${o.num} atualizado` + (isSale(o) ? ' · estoque acertado' : '')); close();
    } catch (e) { ui.toast('Erro: ' + (e as Error).message); setBusy(false); }
  };
  const pays = cfg.pays.filter(x => isOn(cfg, 'pays', x) || x === o.pay?.m);
  return <>
    <ModalHead title={`Editar pedido nº ${o.num}`} onClose={close} />
    <p className="mute" style={{ marginTop: 0 }}>{dt(o.at)} · {STATUS[o.status].n} · lançado por {o.by}{isSale(o) ? ' · o estoque é acertado pela diferença das quantidades' : ''}</p>
    <div className="fg">
      <label>Cliente *<input value={client} onChange={e => setClient(e.target.value)} /></label>
      <label>Telefone<input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" /></label>
      <label>Identificação<input value={note} onChange={e => setNote(e.target.value)} /></label>
      <label>Consumo<select value={mode} onChange={e => setMode(e.target.value as Mode)}>{(Object.keys(ML) as Mode[]).map(k => <option key={k} value={k}>{ML[k]}</option>)}</select></label>
    </div>
    <h3>Itens</h3>
    {items.map((i, k) => <div key={k} className="row sb li" style={{ padding: '8px 0' }}>
      <span><b>{i.name}</b>{i.rem.length > 0 && <span className="rm"> · sem {i.rem.map(x => x.toLowerCase()).join(', ')}</span>}<br /><span className="mute">{brl(i.price)} un.</span></span>
      <span className="row"><span className="qty"><button onClick={() => qty(k, -1)} aria-label="Diminuir">−</button><span>{i.qty}</span><button onClick={() => qty(k, 1)} aria-label="Aumentar">+</button></span><b style={{ minWidth: 80, textAlign: 'right' }}>{brl(i.qty * i.price)}</b></span>
    </div>)}
    <div className="row" style={{ flexWrap: 'nowrap', marginTop: 8 }}>
      <select value={addPid} onChange={e => setAddPid(e.target.value)} aria-label="Adicionar produto"><option value="">Adicionar produto…</option>{products.filter(sellable).map(p => <option key={p.id} value={p.id}>{p.name} — {brl(p.price)}</option>)}</select>
      <button className="btn" disabled={!addPid} onClick={addItem}>Adicionar</button></div>
    <div className="tot"><span className="mute">Novo total {t !== orderTotal(o) && <>(antes {brl(orderTotal(o))})</>}</span><b>{brl(t)}</b></div>
    {o.paid && <div className="fg">
      <label>Forma de pagamento<select value={payM} onChange={e => setPayM(e.target.value)}>{pays.map(x => <option key={x}>{x}</option>)}</select></label>
      {payM === 'Dinheiro' && <label>Valor recebido<input type="number" inputMode="decimal" step="0.01" value={recv} onChange={e => setRecv(e.target.value)} /></label>}
      {payM === 'Dinheiro' && <label>Troco<input readOnly value={brl(Math.max(0, num(recv) - t))} /></label>}
    </div>}
    <div className="row end"><button className="btn" onClick={close}>Cancelar</button><button className="btn p" disabled={busy} onClick={save}>Salvar alterações</button></div>
  </>;
}

/** Correção do valor contado num fechamento de caixa. */
function ClosingEditModal({ c }: { c: Caixa }) {
  const { ui, user } = useApp();
  const [cont, setCont] = useState(String(c.counted ?? ''));
  const close = () => ui.modal(null);
  const diff = num(cont) - (c.expected || 0);
  const save = async () => {
    await patch('caixas', c.id, { counted: num(cont), diff, editedBy: user.name, editedAt: Date.now() });
    ui.toast('Fechamento corrigido'); close();
  };
  return <>
    <ModalHead title="Corrigir fechamento" onClose={close} />
    <p className="mute" style={{ marginTop: 0 }}>Caixa aberto em {dt(c.at)} e fechado em {c.closedAt ? dt(c.closedAt) : '—'}.</p>
    <div className="row sb"><span>Esperado em dinheiro</span><b>{brl(c.expected || 0)}</b></div>
    <label style={{ marginTop: 10 }}>Dinheiro contado<input type="number" inputMode="decimal" step="0.01" value={cont} onChange={e => setCont(e.target.value)} /></label>
    <div className={'troco' + (diff < 0 ? ' neg' : '')}><span>{diff < 0 ? 'Falta' : diff > 0 ? 'Sobra' : 'Confere'}</span><b>{brl(diff)}</b></div>
    <div className="row end"><button className="btn" onClick={close}>Cancelar</button><button className="btn p" onClick={save}>Salvar</button></div>
  </>;
}
