// Regras de negócio que gravam em mais de uma coleção ao mesmo tempo
import { add, commit, fetchCol, getOne, inc, nextSeq, patch, type Op } from './db';
import type { AppUser, Caixa, Expense, Loss, Mode, Move, Order, OrderItem, Product, Status, StockLine, Why } from './types';
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

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** O que sai do estoque: o próprio produto + a composição (matéria-prima vinculada) × quantidade. */
export function expand(lines: { pid: string; qty: number }[], products: Product[]): StockLine[] {
  const m: Record<string, number> = {};
  for (const l of lines) {
    const p = products.find(x => x.id === l.pid); if (!p) continue;
    m[p.id] = (m[p.id] || 0) + l.qty;
    for (const c of p.comp || []) if (products.some(x => x.id === c.pid)) m[c.pid] = (m[c.pid] || 0) + l.qty * c.qty;
  }
  return Object.entries(m).map(([pid, qty]) => ({ pid, qty: r3(qty) })).filter(x => x.qty);
}
/** O que efetivamente saiu do estoque na venda (pedidos antigos: só os itens). */
const outOf = (o: Order): StockLine[] => o.stockOut || Object.entries(o.items.reduce<Record<string, number>>((m, i) => ({ ...m, [i.pid]: (m[i.pid] || 0) + i.qty }), {})).map(([pid, qty]) => ({ pid, qty }));
const sumLines = (l: StockLine[]) => l.reduce<Record<string, number>>((m, x) => ({ ...m, [x.pid]: (m[x.pid] || 0) + x.qty }), {});

/** Movimenta o estoque (+ entra / − sai) e registra uma movimentação por produto. */
function lineOps(lines: StockLine[], sign: 1 | -1, motivo: string, obs: string, user: AppUser, products: Product[], ids?: string[], date = ds()): Op[] {
  const ops: Op[] = [];
  for (const l of lines) {
    const p = products.find(x => x.id === l.pid); if (!p || !l.qty) continue;
    const id = newId(); ids?.push(id);
    ops.push({ op: 'update', path: 'products', id: p.id, data: { stock: inc(sign * l.qty) } });
    ops.push({ op: 'set', path: 'moves', id, data: {
      pid: p.id, pname: p.name, t: sign > 0 ? 'Entrada' : 'Baixa', motivo, qty: l.qty, val: p.type === 'RV' && motivo === 'Venda' ? p.price : p.cost,
      date, obs, user: user.name, at: Date.now()
    } });
  }
  return ops;
}

export async function payOrder(o: Order, m: string, recv: number, user: AppUser, products: Product[]) {
  const t = orderTotal(o);
  const pay = { m, recv: m === 'Dinheiro' ? recv : t, change: m === 'Dinheiro' ? Math.max(0, recv - t) : 0, at: Date.now(), by: user.name };
  const moveIds: string[] = [];
  const stockOut = expand(o.items, products);
  const st = lineOps(stockOut, -1, 'Venda', `Pedido nº ${o.num}`, user, products, moveIds);
  await commit([{ op: 'update', path: 'orders', id: o.id, data: { paid: true, pay, moveIds, stockOut, updatedAt: Date.now() } }, ...st]);
  return pay;
}

/** Cancela o pedido. Se já estava pago, estorna o pagamento e devolve os itens ao estoque. */
export async function cancelOrder(o: Order, reason: string, user: AppUser, products: Product[]) {
  const ops: Op[] = [{ op: 'update', path: 'orders', id: o.id, data: {
    status: 'cancelado', cancel: { at: Date.now(), by: user.name, reason: reason.trim() }, updatedAt: Date.now(),
    ...(o.paid && o.pay ? { pay: { ...o.pay, refunded: true } } : {})
  } }];
  if (isSale(o)) ops.push(...lineOps(outOf(o), 1, 'Estorno', `Pedido nº ${o.num} cancelado`, user, products));
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
/** Registro no Log de exclusões (vai na mesma gravação da exclusão). */
export function logOp(kind: string, desc: string, value: number, why: Why, user: AppUser, ref: string, date: string, data?: object): Op {
  return { op: 'add', path: 'deletions', data: {
    at: Date.now(), user: user.name, kind, desc, value, reason: why.reason, note: why.note.trim(), ref, date,
    data: data ? JSON.parse(JSON.stringify(data)) : null
  } };
}

export async function deleteOrder(o: Order, user: AppUser, products: Product[], why: Why) {
  const ops: Op[] = [{ op: 'delete', path: 'orders', id: o.id },
    logOp('Pedido', `Pedido nº ${o.num} · ${o.client} · ${o.items.map(i => `${i.qty}× ${i.name}`).join(', ')}`, orderTotal(o), why, user, o.id, o.day, o)];
  if (isSale(o)) {
    if (o.moveIds?.length) {
      for (const l of outOf(o)) if (products.some(p => p.id === l.pid)) ops.push({ op: 'update', path: 'products', id: l.pid, data: { stock: inc(l.qty) } });
      for (const id of o.moveIds) ops.push({ op: 'delete', path: 'moves', id });
    } else ops.push(...lineOps(outOf(o), 1, 'Exclusão de venda', `Pedido nº ${o.num}`, user, products));
  }
  await commit(ops);
}

/** Lança uma perda: baixa o produto e, se for produto de revenda com composição, a matéria-prima vinculada. */
export async function createLoss(p: Product, qty: number, motivo: string, date: string, cat: string, user: AppUser, products: Product[]) {
  const moveIds: string[] = [];
  const stockOut = expand([{ pid: p.id, qty }], products);
  const ops = lineOps(stockOut, -1, 'Perda', motivo, user, products, moveIds, date);
  ops.unshift({ op: 'add', path: 'losses', data: { pid: p.id, pname: p.name, cat, qty, motivo, date, user: user.name, value: qty * p.cost, at: Date.now(), moveIds, stockOut } });
  await commit(ops);
}
const lossOut = (l: Loss): StockLine[] => l.stockOut || [{ pid: l.pid, qty: l.qty }];
const lossMoves = (l: Loss) => l.moveIds || (l.moveId ? [l.moveId] : []);

/** Apaga a perda e devolve tudo o que ela tinha baixado. */
export async function deleteLoss(l: Loss, user: AppUser, products: Product[], why: Why) {
  const ops: Op[] = [{ op: 'delete', path: 'losses', id: l.id },
    logOp('Perda', `${l.qty}× ${l.pname} · ${l.motivo}`, l.value, why, user, l.id, l.date, l)];
  const mv = lossMoves(l);
  if (mv.length) {
    for (const x of lossOut(l)) if (products.some(p => p.id === x.pid)) ops.push({ op: 'update', path: 'products', id: x.pid, data: { stock: inc(x.qty) } });
    for (const id of mv) ops.push({ op: 'delete', path: 'moves', id });
  } else ops.push(...lineOps(lossOut(l), 1, 'Exclusão de perda', l.motivo, user, products));
  await commit(ops);
}

/** Apaga a movimentação e desfaz o efeito dela no estoque. */
export async function deleteMove(m: Move, products: Product[], user: AppUser, why: Why) {
  const ops: Op[] = [{ op: 'delete', path: 'moves', id: m.id },
    logOp('Movimentação de estoque', `${m.t} · ${m.motivo} · ${Math.abs(m.qty)} ${m.pname}`, Math.abs(m.qty) * (m.val || 0), why, user, m.id, m.date, m)];
  if (products.some(p => p.id === m.pid)) ops.push({ op: 'update', path: 'products', id: m.pid, data: { stock: inc(-moveEffect(m)) } });
  await commit(ops);
}

/* ---------- Edições (somente administrador) ---------- */

export interface SaleEdit { client: string; phone: string; note: string; mode: Mode; items: OrderItem[]; payM?: string; recv?: number }

/** Edita um pedido já lançado. Se for venda paga, acerta o estoque pela diferença de quantidades e recalcula o pagamento. */
export async function editSale(o: Order, e: SaleEdit, user: AppUser, products: Product[], why?: Why) {
  const ops: Op[] = [];
  // itens retirados ou com quantidade reduzida vão para o Log de exclusões
  const sumBy = (items: OrderItem[]) => items.reduce<Record<string, { q: number; i: OrderItem }>>((m, i) => ({ ...m, [i.pid]: { q: (m[i.pid]?.q || 0) + i.qty, i } }), {});
  const b0 = sumBy(o.items), b1 = sumBy(e.items);
  for (const [pid, x] of Object.entries(b0)) {
    const lost = x.q - (b1[pid]?.q || 0);
    if (lost > 0) ops.push(logOp('Item de pedido', `Pedido nº ${o.num} · ${o.client} · ${lost}× ${x.i.name}`, lost * x.i.price,
      why || { reason: 'Edição do pedido', note: '' }, user, o.id, o.day, { pedido: o.num, cliente: o.client, item: x.i.name, quantidade: lost, preco: x.i.price }));
  }
  const moveIds = [...(o.moveIds || [])];
  let stockOut: StockLine[] | undefined;
  if (isSale(o)) {
    const before = sumLines(outOf(o)); stockOut = expand(e.items, products); const after = sumLines(stockOut);
    for (const pid of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const d = r3((after[pid] || 0) - (before[pid] || 0));
      if (!d) continue;
      ops.push(...lineOps([{ pid, qty: Math.abs(d) }], d > 0 ? -1 : 1, d > 0 ? 'Venda' : 'Edição de venda', `Edição do pedido nº ${o.num}`, user, products, moveIds));
    }
  }
  const data: Record<string, unknown> = {
    client: e.client.trim(), phone: e.phone.trim(), note: e.note.trim(), mode: e.mode, items: e.items,
    moveIds, updatedAt: Date.now(), editedBy: user.name, ...(stockOut ? { stockOut } : {})
  };
  if (o.paid && o.pay) {
    const t = e.items.reduce((s, i) => s + i.qty * i.price, 0);
    const m = e.payM || o.pay.m;
    const recv = m === 'Dinheiro' ? Math.max(e.recv ?? o.pay.recv, t) : t;
    data.pay = { ...o.pay, m, recv, change: m === 'Dinheiro' ? recv - t : 0 };
  }
  ops.unshift({ op: 'update', path: 'orders', id: o.id, data });
  await commit(ops);
}

/** Edita uma perda e acerta o estoque (produto + composição) pela diferença. */
export async function editLoss(l: Loss, e: { qty: number; motivo: string; date: string }, user: AppUser, products: Product[]) {
  const unit = l.qty ? l.value / l.qty : products.find(p => p.id === l.pid)?.cost || 0;
  const before = sumLines(lossOut(l));
  const stockOut = expand([{ pid: l.pid, qty: e.qty }], products);
  const after = sumLines(stockOut);
  const ops: Op[] = [];
  const old = lossMoves(l);
  const moveIds: string[] = [];
  if (old.length) {
    // refaz as movimentações da perda com os dados novos
    for (const id of old) ops.push({ op: 'delete', path: 'moves', id });
    for (const x of stockOut) {
      const p = products.find(y => y.id === x.pid); if (!p) continue;
      const id = newId(); moveIds.push(id);
      ops.push({ op: 'set', path: 'moves', id, data: { pid: p.id, pname: p.name, t: 'Baixa', motivo: 'Perda', qty: x.qty, val: p.cost, date: e.date, obs: e.motivo, user: user.name, at: Date.now() } });
    }
    for (const pid of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const d = r3((after[pid] || 0) - (before[pid] || 0));
      if (d && products.some(p => p.id === pid)) ops.push({ op: 'update', path: 'products', id: pid, data: { stock: inc(-d) } });
    }
  } else {
    for (const pid of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const d = r3((after[pid] || 0) - (before[pid] || 0));
      if (d) ops.push(...lineOps([{ pid, qty: Math.abs(d) }], d > 0 ? -1 : 1, 'Edição de perda', e.motivo, user, products, moveIds));
    }
  }
  ops.unshift({ op: 'update', path: 'losses', id: l.id, data: { qty: e.qty, motivo: e.motivo, date: e.date, value: e.qty * unit, editedBy: user.name, stockOut, moveIds: old.length ? moveIds : [...(l.moveIds || []), ...moveIds] } });
  await commit(ops);
}

export async function deleteExpense(x: Expense, user: AppUser, why: Why) {
  await commit([{ op: 'delete', path: 'expenses', id: x.id },
    logOp(x.kind === 'despesa' ? 'Despesa' : 'Investimento', `${x.cat}${x.desc ? ' · ' + x.desc : ''}`, x.value, why, user, x.id, x.date, x)]);
}

/** Recalcula os totais de um caixa já fechado depois de editar/apagar pedidos dele. */
export async function recalcClosing(cxId?: string) {
  if (!cxId) return;
  const c = await getOne<Caixa>('caixas', cxId);
  if (!c || c.open) return;
  const orders = await fetchCol<Order>('orders', { where: [['cx', '==', cxId]] });
  const s = caixaStats(c, orders);
  await patch('caixas', cxId, { sold: s.sold, byMethod: s.by, orders: s.sales.length, expected: s.cash, diff: (c.counted || 0) - s.cash });
}
