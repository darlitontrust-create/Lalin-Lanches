// Senha do administrador (usada para ações sensíveis, como limpar o Log de exclusões).
// Fica só o "resumo" (hash) no Firestore, em secure/admin, que apenas administradores leem.
import { getOne, put } from './db';
import type { AppUser } from './types';

const DEFAULT_PIN = '1991'; // senha inicial: troque em Usuários › Senha do administrador

export async function hashPin(pin: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('lalin-admin:' + pin));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
export async function checkPin(pin: string) {
  const d = await getOne<{ hash: string }>('secure', 'admin');
  return (await hashPin(pin)) === (d?.hash || (await hashPin(DEFAULT_PIN)));
}
export async function setPin(pin: string, user: AppUser) {
  await put('secure', 'admin', { hash: await hashPin(pin), at: Date.now(), by: user.name }, false);
}
export async function usingDefaultPin() {
  return !(await getOne('secure', 'admin'));
}
