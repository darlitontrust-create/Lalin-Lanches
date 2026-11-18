// Regras de negócio que gravam em mais de uma coleção ao mesmo tempo
import { add, commit, inc, nextSeq, patch, type Op } from './db';
import type { AppUser, Caixa, Loss, Mode, Move, Order, OrderItem, Product, Status } from './types';
import { ds, isSale, moveEffect, newId, orderTotal } from './utils';

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

function stockOps(o: Order, sign: 1 | -1, motivo: string, user: AppUser, products: Product[], ids?: string[]): Op[] {
  const ops: Op[] = [];
  for (const i of o.items) {
    if (!products.some(p => p.id === i.pid)) continue;
    const id = newId(); ids?.push(id);
    ops.push({ op: 'update', path: 'products', id: i.pid, data: { stock: inc(sign * i.qty) } });
    ops.push({ op: 'set', path: 'moves', id, data: {
      pid: i.pid, pname: i.name, t: sign > 0 ? 'Entrada' : 'Baixa', motivo, qty: i.qty, val: sign > 0 ? i.cost : i.price,
      date: ds(), obs: `Pedido nº ${o.num}`, user: user.name, at: Date.now()
    } });
  }
  return ops;
}

export async function payOrder(o: Order, m: string, recv: number, user: AppUser, products: Product[]) {
  const t = orderTotal(o);
  const pay = { m, recv: m === 'Dinheiro' ? recv : t, change: m === 'Dinheiro' ? Math.max(0, recv - t) : 0, at: Date.now(), by: user.name };
  const moveIds: string[] = [];
  const st = stockOps(o, -1, 'Venda', user, products, moveIds);
  await commit([{ op: 'update', path: 'orders', id: o.id, data: { paid: true, pay, moveIds, updatedAt: Date.now() } }, ...st]);
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

/* ---------- Exclusões (somente administrador) ---------- */

/** Apaga o pedido. Se era uma venda válida, devolve os itens ao estoque e apaga as baixas da venda. */
export async function deleteOrder(o: Order, user: AppUser, products: Product[]) {
  const ops: Op[] = [{ op: 'delete', path: 'orders', id: o.id }];
  if (isSale(o)) {
    if (o.moveIds?.length) {
      for (const i of o.items) if (products.some(p => p.id === i.pid)) ops.push({ op: 'update', path: 'products', id: i.pid, data: { stock: inc(i.qty) } });
      for (const id of o.moveIds) ops.push({ op: 'delete', path: 'moves', id });
    } else ops.push(...stockOps(o, 1, 'Exclusão de venda', user, products));
  }
  await commit(ops);
}

/** Apaga a perda e devolve a quantidade ao estoque. */
export async function deleteLoss(l: Loss, user: AppUser, products: Product[]) {
  const ops: Op[] = [{ op: 'delete', path: 'losses', id: l.id }];
  if (products.some(p => p.id === l.pid)) ops.push({ op: 'update', path: 'products', id: l.pid, data: { stock: inc(l.qty) } });
  if (l.moveId) ops.push({ op: 'delete', path: 'moves', id: l.moveId });
  else ops.push({ op: 'add', path: 'moves', data: { pid: l.pid, pname: l.pname, t: 'Entrada', motivo: 'Exclusão de perda', qty: l.qty, val: 0, date: ds(), obs: l.motivo, user: user.name, at: Date.now() } });
  await commit(ops);
}

/** Apaga a movimentação e desfaz o efeito dela no estoque. */
export async function deleteMove(m: Move, products: Product[]) {
  const ops: Op[] = [{ op: 'delete', path: 'moves', id: m.id }];
  if (products.some(p => p.id === m.pid)) ops.push({ op: 'update', path: 'products', id: m.pid, data: { stock: inc(-moveEffect(m)) } });
  await commit(ops);
}
