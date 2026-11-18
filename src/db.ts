// Camada de acesso ao Firestore: tudo que o app lê/grava passa por aqui.
import { useEffect, useState } from 'react';
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, increment, limit, onSnapshot, orderBy,
  query, runTransaction, setDoc, updateDoc, where, writeBatch,
  type QueryConstraint, type WhereFilterOp
} from 'firebase/firestore';
import { db } from './firebase';

export type Filter = [string, WhereFilterOp, unknown];
export interface Q { where?: Filter[]; order?: [string, 'asc' | 'desc']; max?: number }
type Data = Record<string, unknown>;

function build(path: string, q: Q = {}) {
  const c: QueryConstraint[] = [];
  (q.where || []).forEach(([f, o, v]) => c.push(where(f, o, v)));
  if (q.order) c.push(orderBy(q.order[0], q.order[1]));
  if (q.max) c.push(limit(q.max));
  return query(collection(db, path), ...c);
}

/** Lista em tempo real. Retorna null enquanto carrega. */
export function useCol<T>(path: string, q: Q = {}, enabled = true): T[] | null {
  const [rows, setRows] = useState<T[] | null>(null);
  const key = JSON.stringify(q);
  useEffect(() => {
    setRows(null);
    if (!enabled) return;
    return onSnapshot(
      build(path, q),
      s => setRows(s.docs.map(d => ({ id: d.id, ...d.data() }) as unknown as T)),
      e => { console.error(path, e); setRows([]); }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key, enabled]);
  return rows;
}

/** Documento em tempo real. undefined = carregando, null = não existe. */
export function useDoc<T>(path: string, id: string | null | undefined): T | null | undefined {
  const [val, setVal] = useState<T | null | undefined>(undefined);
  useEffect(() => {
    setVal(undefined);
    if (!id) { setVal(null); return; }
    return onSnapshot(
      doc(db, path, id),
      s => setVal(s.exists() ? ({ id: s.id, ...s.data() } as unknown as T) : null),
      e => { console.error(path, id, e); setVal(null); }
    );
  }, [path, id]);
  return val;
}

export async function fetchCol<T>(path: string, q: Q = {}): Promise<T[]> {
  const s = await getDocs(build(path, q));
  return s.docs.map(d => ({ id: d.id, ...d.data() }) as unknown as T);
}
export async function getOne<T>(path: string, id: string): Promise<T | null> {
  const s = await getDoc(doc(db, path, id));
  return s.exists() ? ({ id: s.id, ...s.data() } as unknown as T) : null;
}
export const add = (path: string, data: Data) => addDoc(collection(db, path), data).then(r => r.id);
export const put = (path: string, id: string, data: Data, merge = true) => setDoc(doc(db, path, id), data, { merge });
export const patch = (path: string, id: string, data: Data) => updateDoc(doc(db, path, id), data);
export const remove = (path: string, id: string) => deleteDoc(doc(db, path, id));
export const inc = (n: number) => increment(n);

export interface Op { op: 'set' | 'update' | 'add' | 'delete'; path: string; id?: string; data?: Data }
/** Grava várias operações de forma atômica (em lotes de 450). */
export async function commit(ops: Op[]) {
  for (let i = 0; i < ops.length; i += 450) {
    const b = writeBatch(db);
    for (const o of ops.slice(i, i + 450)) {
      const ref = o.id ? doc(db, o.path, o.id) : doc(collection(db, o.path));
      if (o.op === 'delete') b.delete(ref);
      else if (o.op === 'update') b.update(ref, o.data || {});
      else b.set(ref, o.data || {}, { merge: o.op === 'set' });
    }
    await b.commit();
  }
}

/** Próximo número de pedido do caixa (transação: dois aparelhos nunca pegam o mesmo número). */
export function nextSeq(caixaId: string): Promise<number> {
  return runTransaction(db, async tx => {
    const ref = doc(db, 'caixas', caixaId);
    const s = await tx.get(ref);
    const n = (Number(s.data()?.seq) || 0) + 1;
    tx.update(ref, { seq: n });
    return n;
  });
}
