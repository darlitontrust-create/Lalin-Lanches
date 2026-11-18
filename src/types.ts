export type Role = 'admin' | 'op';
export type PermKey = 'pedidos' | 'caixa' | 'estoque' | 'cadastro' | 'despesas' | 'perdas' | 'resultados';
export type Mode = 'local' | 'viagem';
export type Status = 'aguardando' | 'producao' | 'pronto' | 'entregue' | 'cancelado';

export interface AppUser {
  id: string; email: string; name: string; role: Role;
  perms: Partial<Record<PermKey, boolean>>; active: boolean;
}
export interface Coded { c: string; n: string }
export interface Ingredient { n: string; r: boolean }
export interface PricePoint { v: number; from: string }

export interface Product {
  id: string; code: string; name: string; desc: string;
  type: string; cat: string; cls: string; unit: string;
  min: number; stock: number; cost: number; price: number;
  active: boolean; unavailable?: boolean;
  ingr: Ingredient[]; prices: PricePoint[];
}

export interface OrderItem {
  pid: string; name: string; price: number; cost: number; qty: number;
  rem: string[]; obs: string; mode: Mode; removable?: boolean;
}
export interface Payment { m: string; recv: number; change: number; at: number; by: string; refunded?: boolean }
export interface Order {
  id: string; cx: string; num: number; day: string; at: number;
  client: string; phone: string; note: string; mode: Mode;
  items: OrderItem[]; status: Status; paid: boolean; pay?: Payment;
  cancel?: { at: number; by: string; reason: string };
  by: string; updatedAt?: number;
}
export interface Caixa {
  id: string; at: number; initial: number; by: string; open: boolean; seq: number;
  closedAt?: number; closedBy?: string; counted?: number; expected?: number; diff?: number;
  sold?: number; byMethod?: Record<string, number>; orders?: number;
}
export interface Move {
  id: string; pid: string; pname: string; t: 'Entrada' | 'Baixa' | 'Ajuste'; motivo: string;
  qty: number; val: number; date: string; obs: string; user: string; at: number;
}
export interface Loss { id: string; pid: string; pname: string; cat: string; qty: number; motivo: string; date: string; user: string; value: number; at: number }
export interface Expense { id: string; date: string; kind: 'despesa' | 'investimento'; cat: string; desc: string; value: number; user: string; at: number }
export interface Inventory { id: string; at: number; user: string; n: number; val: number; items: { pid: string; pname: string; before: number; after: number }[] }

export interface Config {
  types: Coded[]; cats: Coded[]; classes: Coded[]; units: string[]; pays: string[];
  lossReasons: string[]; expenseCats: string[]; investCats: string[];
  pix: { key: string; name: string; city: string };
  msgs: Record<string, string>;
  cardFee: number; // % estimada das maquininhas (crédito, débito, vale)
}
