// Componentes usados por mais de um módulo: abrir/fechar caixa e cancelar pedido
import { useState } from 'react';
import { useApp } from '../store';
import { add, patch, useCol } from '../db';
import { cancelOrder, caixaStats } from '../ops';
import type { Order } from '../types';
import { STATUS, brl, hm, isOpenOrder, num, orderTotal } from '../utils';
import { ModalHead } from '../components/ui';

export function CaixaOpen() {
  const { user, ui, caixa } = useApp();
  const [ini, setIni] = useState('100');
  const [busy, setBusy] = useState(false);
  const open = async () => {
    if (caixa) return;
    setBusy(true);
    try {
      await add('caixas', { at: Date.now(), initial: num(ini), by: user.name, open: true, seq: 0 });
      ui.toast('Caixa aberto · os pedidos começam no nº 1');
    } catch (e) { ui.toast('Erro ao abrir caixa: ' + (e as Error).message); }
    setBusy(false);
  };
  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h2>Abra o caixa para começar</h2>
      <p className="mute" style={{ marginTop: -4 }}>A fila e a numeração dos pedidos recomeçam no nº 1 a cada abertura de caixa.</p>
      <label>Valor inicial (fundo de troco)<input type="number" inputMode="decimal" step="0.01" value={ini} onChange={e => setIni(e.target.value)} /></label>
      <button className="btn p wide" style={{ marginTop: 14 }} disabled={busy} onClick={open}>Abrir caixa</button>
    </div>
  );
}

export function CancelModal({ order, after }: { order: Order; after?: () => void }) {
  const { user, ui, products } = useApp();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const back = () => (after ? after() : ui.modal(null));
  const go = async () => {
    setBusy(true);
    try {
      await cancelOrder(order, reason, user, products);
      ui.toast(`Pedido nº ${order.num} cancelado` + (order.paid ? ' · pagamento estornado e itens devolvidos ao estoque' : ''));
      back();
    } catch (e) { ui.toast('Erro: ' + (e as Error).message); setBusy(false); }
  };
  return <>
    <ModalHead title={`Cancelar pedido nº ${order.num}`} onClose={back} />
    <p><b>{order.client}</b> · {order.items.map(i => `${i.qty}× ${i.name}`).join(', ')} · {brl(orderTotal(order))}</p>
    {order.paid && <p className="note">Este pedido já foi pago ({order.pay?.m}). Ao cancelar, o pagamento fica marcado como estornado e os itens voltam ao estoque. Devolva o valor ao cliente.</p>}
    <label>Motivo do cancelamento<input value={reason} onChange={e => setReason(e.target.value)} placeholder="Ex.: cliente desistiu" autoFocus /></label>
    <div className="row end"><button className="btn" onClick={back}>Voltar</button>
      <button className="btn p" disabled={busy || !reason.trim()} onClick={go}>Cancelar pedido</button></div>
  </>;
}

/** Fechamento do caixa. Só fecha quando não há pedidos em aberto na fila. */
export function CloseCaixaModal({ onGoQueue }: { onGoQueue?: () => void }) {
  const { caixa, ui, user } = useApp();
  const orders = useCol<Order>('orders', { where: [['cx', '==', caixa?.id || '-']] }, !!caixa);
  const [cont, setCont] = useState('');
  const [busy, setBusy] = useState(false);
  if (!caixa) return null;
  if (!orders) return <p className="mute">Carregando pedidos…</p>;
  const close = () => ui.modal(null);
  const pend = orders.filter(isOpenOrder).sort((a, b) => a.num - b.num);
  if (pend.length) return <>
    <ModalHead title="Ainda há pedidos na fila" onClose={close} />
    <p>Para fechar o caixa, todos os pedidos precisam estar <b>pagos e entregues</b> ou <b>cancelados</b>. Pendentes:</p>
    <div>{pend.map(o => (
      <div key={o.id} className="row sb li">
        <span><b>nº {o.num} · {o.client}</b><br /><span className="mute">{STATUS[o.status].n} · {o.paid ? 'pago' : 'não pago'} · {brl(orderTotal(o))}</span></span>
        <button className="btn sm danger" onClick={() => ui.modal(<CancelModal order={o} after={() => ui.modal(<CloseCaixaModal onGoQueue={onGoQueue} />)} />)}>Cancelar pedido</button>
      </div>))}
    </div>
    <div className="row end"><button className="btn" onClick={close}>Fechar</button>
      {onGoQueue && <button className="btn p" onClick={() => { close(); onGoQueue(); }}>Ir para a fila</button>}</div>
  </>;
  const s = caixaStats(caixa, orders);
  const diff = cont === '' ? null : num(cont) - s.cash;
  const go = async () => {
    if (cont === '') return ui.toast('Informe o dinheiro contado na gaveta');
    setBusy(true);
    try {
      await patch('caixas', caixa.id, {
        open: false, closedAt: Date.now(), closedBy: user.name, counted: num(cont), expected: s.cash, diff: num(cont) - s.cash,
        sold: s.sold, byMethod: s.by, orders: s.sales.length
      });
      ui.modal(null); ui.toast('Caixa fechado · a fila foi reiniciada');
    } catch (e) { ui.toast('Erro: ' + (e as Error).message); setBusy(false); }
  };
  return <>
    <ModalHead title="Fechar caixa" onClose={close} />
    <p className="mute">Aberto às {hm(caixa.at)} por {caixa.by} · {s.sales.length} venda(s)</p>
    <div className="row sb"><span>Total vendido</span><b>{brl(s.sold)}</b></div>
    {Object.entries(s.by).map(([m, v]) => <div key={m} className="row sb mute"><span>{m}</span><span>{brl(v)}</span></div>)}
    <div className="row sb" style={{ marginTop: 8 }}><span>Troco concedido</span><b>{brl(s.change)}</b></div>
    <div className="row sb"><span>Esperado em dinheiro (fundo + vendas em dinheiro)</span><b style={{ fontSize: 20 }}>{brl(s.cash)}</b></div>
    <label style={{ marginTop: 12 }}>Dinheiro contado na gaveta<input type="number" inputMode="decimal" step="0.01" value={cont} onChange={e => setCont(e.target.value)} placeholder="0,00" /></label>
    {diff !== null && <div className={'troco' + (diff < 0 ? ' neg' : '')}><span>{diff < 0 ? 'Falta no caixa' : diff > 0 ? 'Sobra no caixa' : 'Caixa confere'}</span><b style={{ fontSize: 24 }}>{brl(diff)}</b></div>}
    <div className="row end"><button className="btn" onClick={close}>Cancelar</button><button className="btn p" disabled={busy} onClick={go}>Fechar caixa</button></div>
  </>;
}
