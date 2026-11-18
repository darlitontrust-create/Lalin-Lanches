// Regras de negócio que gravam em mais de uma coleção ao mesmo tempo
import { add, commit, inc, nextSeq, patch, type Op } from './db';
import type { AppUser, Caixa, Mode, Order, OrderItem, Product, Status } from './types';
import { ds, isSale, orderTotal } from './utils';

export interface DraftItem { key: string; pid: string; qty: number; rem: string[]; obs: string; mode: Mode | '' }
export interface Draft { editing?: string; num?: number; client: string; phone: string; note: string; mode: Mode; items: DraftItem[] }

function toItems(d: Draft, products: Product[]): OrderItem[] {
  return d.items.map(i => {
    const p = products.find(x => x.id === i.pid);
    return {
      pid: i.pid, name: p?.name || '?', price: p?.price || 0, cost: p?.cost || 0, qty: i.qty,
      rem: i.rem, obs: i.obs.trim(), mode: (i.mode || d.mode) as Mode, removable: !!p?.ingr.some(x => x.r)
    };
  });
}

export async function createOrder(d: Draft, caixa: Caixa, products: Product[], user: AppUser) {
  const num = await nextSeq(caixa.id);
  const now = Date.now();
  await add('orders', {
    cx: caixa.id, num, day: ds(), at: now, client: d.client.trim(), phone: d.phone.trim(), note: d.note.trim(),
    mode: d.mode, items: toItems(d, products), status: 'aguardando', paid: false, by: user.name
  });
  return num;
}

export async function updateOrder(id: string, d: Draft, products: Product[]) {
  await patch('orders', id, {
    client: d.client.trim(), phone: d.phone.trim(), note: d.note.trim(), mode: d.mode,
    items: toItems(d, products), updatedAt: Date.now()
  });
}

export const setStatus = (o: Order, s: Status) => patch('orders', o.id, { status: s, updatedAt: Date.now() });

function stockOps(o: Order, sign: 1 | -1, motivo: string, user: AppUser, products: Product[]): Op[] {
  const ops: Op[] = [];
  for (const i of o.items) {
    if (!products.some(p => p.id === i.pid)) continue;
    ops.push({ op: 'update', path: 'products', id: i.pid, data: { stock: inc(sign * i.qty) } });
    ops.push({ op: 'add', path: 'moves', data: {
      pid: i.pid, pname: i.name, t: sign > 0 ? 'Entrada' : 'Baixa', motivo, qty: i.qty, val: sign > 0 ? i.cost : i.price,
      date: ds(), obs: `Pedido nº ${o.num}`, user: user.name, at: Date.now()
    } });
  }
  return ops;
}

export async function payOrder(o: Order, m: string, recv: number, user: AppUser, products: Product[]) {
  const t = orderTotal(o);
  const pay = { m, recv: m === 'Dinheiro' ? recv : t, change: m === 'Dinheiro' ? Math.max(0, recv - t) : 0, at: Date.now(), by: user.name };
  await commit([{ op: 'update', path: 'orders', id: o.id, data: { paid: true, pay, updatedAt: Date.now() } }, ...stockOps(o, -1, 'Venda', user, products)]);
  return pay;
}

/** Cancela o pedido. Se já estava pago, estorna o pagamento e devolve os itens ao estoque. */
export async function cancelOrder(o: Order, reason: string, user: AppUser, products: Product[]) {
  const ops: Op[] = [{ op: 'update', path: 'orders', id: o.id, data: {
    status: 'cancelado', cancel: { at: Date.now(), by: user.name, reason: reason.trim() }, updatedAt: Date.now(),
    ...(o.paid && o.pay ? { pay: { ...o.pay, refunded: true } } : {})
  } }];
  if (isSale(o)) ops.push(...stockOps(o, 1, 'Estorno', user, products));
  await commit(ops);
}

export function caixaStats(caixa: Caixa, orders: Order[]) {
  const sales = orders.filter(isSale);
  const by: Record<string, number> = {};
  let sold = 0, recv = 0, change = 0;
  for (const o of sales) {
    const t = orderTotal(o); sold += t; by[o.pay!.m] = (by[o.pay!.m] || 0) + t;
    recv += o.pay!.recv; change += o.pay!.change;
  }
  return { sales, by, sold, recv, change, cash: caixa.initial + (by['Dinheiro'] || 0) };
}
