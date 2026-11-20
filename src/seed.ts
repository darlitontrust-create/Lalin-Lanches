// Configuração e cardápio inicial (cardápio do PDF da Lalin Lanches)
import { commit, type Op } from './db';
import type { Config } from './types';
import { ds } from './utils';

export const DEFAULT_CONFIG: Config = {
  types: [{ c: 'RV', n: 'Revenda' }, { c: 'MP', n: 'Matéria-Prima' }, { c: 'EM', n: 'Embalagem' }, { c: 'EX', n: 'Extras' }],
  cats: [{ c: 'COM', n: 'Comida' }, { c: 'BEB', n: 'Bebida' }, { c: 'EMB', n: 'Embalagem' }, { c: 'MPR', n: 'Matéria-Prima' }],
  classes: [{ c: 'LAN', n: 'Lanches' }, { c: 'MAS', n: 'Massas' }, { c: 'CHU', n: 'Churrasquinho' }, { c: 'REF', n: 'Refrigerantes' },
    { c: 'CER', n: 'Cervejas' }, { c: 'BEB', n: 'Bebidas' }, { c: 'ALI', n: 'Alimentação' }],
  units: ['Unidade', 'Kg', 'Grama', 'Litro', 'ml', 'Caixa', 'Pacote', 'Garrafa', 'Lata'],
  pays: ['Dinheiro', 'PIX', 'Crédito', 'Débito', 'Vale Refeição'],
  lossReasons: ['Vencimento', 'Quebra', 'Produção incorreta', 'Contaminação', 'Furto', 'Outro'],
  expenseCats: ['Aluguel', 'Energia', 'Água', 'Internet', 'Gás', 'Impostos', 'Salários', 'Manutenção', 'Taxas bancárias', 'Marketing', 'Outros'],
  investCats: ['Compras de estoque', 'Aquisição de equipamentos', 'Reformas'],
  pix: { key: '319714806982', name: 'LALIN LANCHES', city: 'RIBEIRAO DAS NEVES' },
  msgs: {
    aguardando: 'Olá, {nome}! Recebemos seu pedido nº {numero} na Lalin Lanches. Status: {status}.',
    producao: 'Olá, {nome}! Seu pedido nº {numero} já está em produção na chapa.',
    pronto: 'Olá, {nome}! Seu pedido nº {numero} está pronto. Pode retirar no balcão da Lalin Lanches!',
    entregue: 'Obrigado, {nome}! Seu pedido nº {numero} foi entregue. Bom apetite!',
    cancelado: 'Olá, {nome}. Seu pedido nº {numero} foi cancelado. Qualquer dúvida, fale com a gente.'
  },
  cardFee: 2.5,
  off: [],
  wa: { auto: false, on: ['aguardando', 'pronto'] },
  delReasons: ['Lançamento duplicado', 'Lançamento errado', 'Valor ou quantidade errada', 'Lançamento de teste', 'Cliente desistiu', 'Outro']
};

type Row = [string, string, string, string, string, number, number, number, number, string?, string?];
// nome, tipo, categoria, classe, unidade, preço, custo, estoque, mínimo, descrição, ingredientes (* = cliente pode retirar)
// Custos, estoques e mínimos são estimativas iniciais: ajuste no Cadastro/Estoque.
const MENU: Row[] = [
  ['Pão com pernil', 'RV', 'COM', 'LAN', 'Unidade', 18, 7, 0, 8, 'Pão de sal, pernil, vinagrete e mussarela', 'Pão de sal,Pernil,Vinagrete*,Mussarela*'],
  ['Pão com linguiça', 'RV', 'COM', 'LAN', 'Unidade', 18, 6.5, 0, 8, 'Pão de sal, linguiça caseira de bacon, vinagrete e mussarela', 'Pão de sal,Linguiça caseira de bacon,Vinagrete*,Mussarela*'],
  ['Macarrão na chapa', 'RV', 'COM', 'MAS', 'Unidade', 25, 9.5, 0, 6, 'Macarrão, bacon, calabresa, cebola, pimentão, cenoura, repolho, milho, azeitona e o segredo da casa',
    'Macarrão,Bacon*,Calabresa*,Cebola*,Pimentão*,Cenoura*,Repolho*,Milho*,Azeitona*,Tempero da casa'],
  ['Espeto de boi', 'RV', 'COM', 'CHU', 'Unidade', 12, 5.8, 0, 10],
  ['Espeto de toucinho', 'RV', 'COM', 'CHU', 'Unidade', 12, 4.5, 0, 10, 'Carne de porco'],
  ['Espeto almôndega c/ mussarela', 'RV', 'COM', 'CHU', 'Unidade', 12, 5, 0, 10],
  ['Espeto medalhão de frango', 'RV', 'COM', 'CHU', 'Unidade', 12, 5.2, 0, 10],
  ['Espeto medalhão de coração', 'RV', 'COM', 'CHU', 'Unidade', 12, 5.5, 0, 6, 'Somente na falta do medalhão de frango'],
  ['Espeto de coraçãozinho', 'RV', 'COM', 'CHU', 'Unidade', 12, 5, 0, 10],
  ['Espeto de tulipa', 'RV', 'COM', 'CHU', 'Unidade', 12, 4.6, 0, 10],
  ['Coca Cola lata', 'RV', 'BEB', 'REF', 'Lata', 6, 3.2, 0, 12],
  ['Coca Cola 200ml', 'RV', 'BEB', 'REF', 'Garrafa', 3, 1.5, 0, 12],
  ['Guaraná lata', 'RV', 'BEB', 'REF', 'Lata', 6, 2.9, 0, 12],
  ['Guaraná 200ml', 'RV', 'BEB', 'REF', 'Garrafa', 3, 1.4, 0, 12],
  ['Mate Couro 1L', 'RV', 'BEB', 'REF', 'Garrafa', 8, 4.5, 0, 4],
  ['Brahma 473ml', 'RV', 'BEB', 'CER', 'Lata', 6, 3.6, 0, 24],
  ['Original 473ml', 'RV', 'BEB', 'CER', 'Lata', 8, 4.8, 0, 12],
  ['Heineken 473ml', 'RV', 'BEB', 'CER', 'Lata', 10, 6.2, 0, 12],
  ['Del Valle uva 290ml', 'RV', 'BEB', 'BEB', 'Lata', 6, 3.4, 0, 6],
  ['Tial uva 250ml', 'RV', 'BEB', 'BEB', 'Unidade', 4, 2.2, 0, 6],
  ['Água 500ml', 'RV', 'BEB', 'BEB', 'Garrafa', 2, 0.8, 0, 12]
];

export async function seedAll(withMenu: boolean) {
  const ops: Op[] = [{ op: 'set', path: 'config', id: 'app', data: { ...DEFAULT_CONFIG } }];
  if (withMenu) ops.push(...menuOps());
  await commit(ops);
}

export function menuOps(): Op[] {
  const seq: Record<string, number> = {};
  return MENU.map(r => {
    const pre = `${r[1]}.${r[2]}.${r[3]}.`;
    seq[pre] = (seq[pre] || 0) + 1;
    return {
      op: 'add' as const, path: 'products', data: {
        code: pre + String(seq[pre]).padStart(4, '0'), name: r[0], type: r[1], cat: r[2], cls: r[3], unit: r[4],
        price: r[5], cost: r[6], stock: r[7], min: r[8], desc: r[9] || '', active: true, unavailable: false,
        ingr: (r[10] || '').split(',').filter(Boolean).map(x => ({ n: x.replace('*', '').trim(), r: x.includes('*') })),
        prices: [{ v: r[5], from: ds() }]
      }
    };
  });
}
