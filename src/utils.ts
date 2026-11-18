import * as XLSX from 'xlsx';
import type { Config, Mode, Order, OrderItem, Product, Status } from './types';

export const brl = (v: number) => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const nf = (v: number) => (+v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
export const pct = (v: number) => (isFinite(v) ? (v * 100).toFixed(1).replace('.', ',') : '0') + '%';
export const ds = (d: Date = new Date()) =>
  d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
export const dbr = (s: string) => s.slice(8, 10) + '/' + s.slice(5, 7);
export const dfull = (s: string) => s.split('-').reverse().join('/');
export const hm = (t: number) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
export const dt = (t: number) => new Date(t).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
export const addDays = (s: string, n: number) => { const d = new Date(s + 'T12:00'); d.setDate(d.getDate() + n); return ds(d); };
export const daysBetween = (a: string, b: string) => { const r: string[] = []; for (let d = a; d <= b; d = addDays(d, 1)) r.push(d); return r; };
export const num = (s: string | number) => +String(s ?? '').replace(',', '.') || 0;

export const ML: Record<Mode, string> = { local: 'No local', viagem: 'Para viagem' };
export const STATUS: Record<Status, { n: string; c: string; next?: Status; act?: string }> = {
  aguardando: { n: 'Aguardando', c: '#FFC857', next: 'producao', act: 'Iniciar preparo' },
  producao: { n: 'Em produção', c: '#7fb0ff', next: 'pronto', act: 'Marcar pronto' },
  pronto: { n: 'Pronto', c: '#6fd39b', next: 'entregue', act: 'Entregar' },
  entregue: { n: 'Entregue', c: '#c3c6cc' },
  cancelado: { n: 'Cancelado', c: '#f19aa0' }
};

export const itemsTotal = (items: OrderItem[]) => items.reduce((s, i) => s + i.qty * i.price, 0);
export const orderTotal = (o: Pick<Order, 'items'>) => itemsTotal(o.items);
export const orderCost = (o: Pick<Order, 'items'>) => o.items.reduce((s, i) => s + i.qty * i.cost, 0);
/** Venda válida = paga, não cancelada e não estornada. */
export const isSale = (o: Order) => o.paid && o.status !== 'cancelado' && !o.pay?.refunded;
/** Pedido que impede o fechamento do caixa. */
export const isOpenOrder = (o: Order) => o.status !== 'cancelado' && !(o.status === 'entregue' && o.paid);

export const sellable = (p: Product) => p.type === 'RV' && p.active && p.price > 0;
/** Item de cadastro auxiliar ativo? (formas de pagamento, unidades, categorias…) */
export const isOn = (cfg: Config, list: string, v: string) => !(cfg.off || []).includes(`${list}:${v}`);
export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).replace(/[^a-zA-Z0-9]/g, '').slice(0, 20);
/** Quanto uma movimentação mexeu no estoque (+ entrou, − saiu). */
export const moveEffect = (m: { t: string; motivo: string; qty: number }) =>
  m.t === 'Entrada' ? m.qty : m.t === 'Baixa' ? -m.qty : m.motivo === 'Inventário' ? m.qty : -m.qty;
export const nm = (arr: { c: string; n: string }[], c: string) => (arr.find(x => x.c === c) || { n: c }).n;

export function genCode(products: Product[], t: string, c: string, k: string) {
  const pre = `${t}.${c}.${k}.`;
  const max = products.filter(p => p.code?.startsWith(pre)).reduce((m, p) => Math.max(m, +p.code.slice(pre.length) || 0), 0);
  return pre + String(max + 1).padStart(4, '0');
}
export const abbr = (n: string, len: number) =>
  n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, len);

/* ---------- PIX (BR Code estático com valor) ---------- */
export function pixPayload(cfg: Config['pix'], value: number, txid: string) {
  const f = (i: string, s: string) => i + String(s.length).padStart(2, '0') + s;
  const clean = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, '');
  const id = txid.replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  const p = f('00', '01') + f('26', f('00', 'br.gov.bcb.pix') + f('01', cfg.key.trim())) + f('52', '0000') + f('53', '986') +
    f('54', value.toFixed(2)) + f('58', 'BR') + f('59', clean(cfg.name).slice(0, 25)) + f('60', clean(cfg.city).slice(0, 15)) +
    f('62', f('05', id)) + '6304';
  let c = 0xffff;
  for (let i = 0; i < p.length; i++) {
    c ^= p.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
  }
  return p + c.toString(16).toUpperCase().padStart(4, '0');
}

/* ---------- WhatsApp ---------- */
export function waLink(phone: string, text: string) {
  let d = phone.replace(/\D/g, '');
  if (d.length <= 11) d = '55' + d;
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}
export function fillMsg(tpl: string, o: Pick<Order, 'client' | 'num' | 'status'>) {
  return (tpl || '').replace(/\{nome\}/g, o.client.split(' ')[0]).replace(/\{numero\}/g, String(o.num))
    .replace(/\{status\}/g, STATUS[o.status].n.toLowerCase());
}

/* ---------- Planilhas ---------- */
export type Sheet = (string | number)[][];
export function exportXlsx(file: string, sheets: Record<string, Sheet>) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = (rows[0] || []).map((_, i) => ({ wch: Math.min(40, Math.max(10, ...rows.map(r => String(r[i] ?? '').length + 2))) }));
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  XLSX.writeFile(wb, file.endsWith('.xlsx') ? file : file + '.xlsx');
}
export async function readXlsx(file: File): Promise<Record<string, unknown>[]> {
  const wb = XLSX.read(await file.arrayBuffer());
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
}
/** Lê uma coluna aceitando variações de nome (com/sem acento, maiúsculas). */
export function col(row: Record<string, unknown>, ...names: string[]) {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const keys = Object.keys(row);
  for (const n of names) { const k = keys.find(x => norm(x) === norm(n)); if (k) return row[k]; }
  return '';
}
