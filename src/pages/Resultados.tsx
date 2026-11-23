import { useState, type ReactNode } from 'react';
import { useApp } from '../store';
import { useCol } from '../db';
import type { Expense, Loss, Order } from '../types';
import { addDays, brl, daysBetween, dbr, ds, exportXlsx, isSale, nf, nm, orderCost, orderTotal, payParts, pct, type Sheet } from '../utils';
import { HBars } from '../components/ui';

type Per = 'dia' | 'semana' | 'mes' | 'periodo';
type Met = 'fat' | 'qtd' | 'tm';

const short = (v: number, money: boolean) => {
  const s = Math.abs(v) >= 1000 ? (v / 1000).toFixed(1).replace('.', ',') + ' mil' : money ? v.toFixed(0) : nf(v);
  return money ? 'R$ ' + s : s;
};

function stats(os: Order[], fee: number) {
  const rev = os.reduce((s, o) => s + orderTotal(o), 0);
  const cost = os.reduce((s, o) => s + orderCost(o), 0);
  const items = os.reduce((s, o) => s + o.items.reduce((a, i) => a + i.qty, 0), 0);
  const card = os.flatMap(payParts).filter(p => p.m !== 'Dinheiro' && p.m !== 'PIX').reduce((s, p) => s + p.value, 0);
  const tickets = os.map(orderTotal);
  return { rev, cost, items, n: os.length, tm: os.length ? rev / os.length : 0, fees: (card * fee) / 100, max: Math.max(0, ...tickets), min: tickets.length ? Math.min(...tickets) : 0 };
}

export default function Resultados() {
  const { cfg, products } = useApp();
  const today = ds();
  const [per, setPer] = useState<Per>('mes');
  const [met, setMet] = useState<Met>('fat');
  const [from, setFrom] = useState(today.slice(0, 8) + '01');
  const [to, setTo] = useState(today);

  const [a, b] = per === 'dia' ? [today, today] : per === 'semana' ? [addDays(today, -6), today] : per === 'mes' ? [today.slice(0, 8) + '01', today] : [from <= to ? from : to, from <= to ? to : from];
  const len = daysBetween(a, b).length;
  const pa = addDays(a, -len), pb = addDays(a, -1);
  const ordersAll = useCol<Order>('orders', { where: [['day', '>=', pa], ['day', '<=', b]] });
  const expAll = useCol<Expense>('expenses', { where: [['date', '>=', pa], ['date', '<=', b]] });
  const lossAll = useCol<Loss>('losses', { where: [['date', '>=', pa], ['date', '<=', b]] });

  const label = per === 'dia' ? 'Hoje' : per === 'semana' ? 'Últimos 7 dias' : per === 'mes' ? `Mês atual (${dbr(a)} a ${dbr(b)})` : `${dbr(a)} a ${dbr(b)}`;
  const head = <div className="card noprint" style={{ marginBottom: 16 }}>
    <div className="row sb">
      <div className="chips">{([['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês'], ['periodo', 'Período']] as [Per, string][]).map(([k, l]) => <button key={k} className={'chip' + (per === k ? ' on' : '')} onClick={() => setPer(k)}>{l}</button>)}</div>
      <div className="chips">{([['fat', 'Faturamento'], ['qtd', 'Quantidade vendida'], ['tm', 'Ticket médio']] as [Met, string][]).map(([k, l]) => <button key={k} className={'chip y' + (met === k ? ' on' : '')} onClick={() => setMet(k)}>{l}</button>)}</div>
    </div>
    {per === 'periodo' && <div className="fg" style={{ maxWidth: 420, marginTop: 10 }}>
      <label>De<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
      <label>Até<input type="date" value={to} max={today} onChange={e => setTo(e.target.value)} /></label></div>}
  </div>;
  if (!ordersAll || !expAll || !lossAll) return <>{head}<p className="mute">Carregando…</p></>;

  const sales = ordersAll.filter(isSale);
  const cur = sales.filter(o => o.day >= a && o.day <= b), prev = sales.filter(o => o.day >= pa && o.day <= pb);
  const S = stats(cur, cfg.cardFee), SP = stats(prev, cfg.cardFee);
  const exps = expAll.filter(x => x.date >= a && x.date <= b), expsP = expAll.filter(x => x.date >= pa && x.date <= pb);
  const desp = exps.filter(x => x.kind === 'despesa'), inv = exps.filter(x => x.kind === 'investimento');
  const losses = lossAll.filter(x => x.date >= a && x.date <= b), lossesP = lossAll.filter(x => x.date >= pa && x.date <= pb);
  const sum = (xs: { value: number }[]) => xs.reduce((s, x) => s + x.value, 0);
  const opRes = (s: typeof S, d: number, l: number) => s.rev - s.fees - s.cost - l - d;
  const R = opRes(S, sum(desp), sum(losses)), RP = opRes(SP, sum(expsP.filter(x => x.kind === 'despesa')), sum(lossesP));

  // série do gráfico
  let keys: (string | number)[], lab: (k: string | number) => string, grp: (o: Order) => string | number;
  if (per === 'dia') {
    const hrs = cur.map(o => new Date(o.at).getHours());
    const h0 = Math.min(17, ...hrs), h1 = Math.max(23, ...hrs);
    keys = Array.from({ length: h1 - h0 + 1 }, (_, i) => h0 + i); lab = k => k + 'h'; grp = o => new Date(o.at).getHours();
  } else {
    const start = per === 'mes' && len > 15 ? addDays(b, -14) : a; // mês: últimos 15 dias
    keys = daysBetween(start, b); lab = k => dbr(String(k)); grp = o => o.day;
  }
  const agg = new Map(keys.map(k => [k, { r: 0, n: 0, q: 0 }]));
  for (const o of cur) { const x = agg.get(grp(o)); if (x) { x.r += orderTotal(o); x.n++; x.q += o.items.reduce((s, i) => s + i.qty, 0); } }
  const val = (x: { r: number; n: number; q: number }) => (met === 'fat' ? x.r : met === 'qtd' ? x.q : x.n ? x.r / x.n : 0);
  const series = keys.map(k => [k, val(agg.get(k)!)] as [string | number, number]);
  const mx = Math.max(1, ...series.map(s => s[1]));
  const step = Math.ceil(keys.length / 16), stepM = Math.ceil(keys.length / 7);
  const money = met !== 'qtd';

  // rankings
  const prodQ: Record<string, number> = {}, clsCost: Record<string, number> = {}, catCost: Record<string, number> = {}, byPay: Record<string, number> = {};
  for (const o of cur) {
    for (const pp of payParts(o)) byPay[pp.m] = (byPay[pp.m] || 0) + pp.value;
    for (const i of o.items) {
      prodQ[i.name] = (prodQ[i.name] || 0) + i.qty;
      const p = products.find(x => x.id === i.pid);
      const cls = p ? nm(cfg.classes, p.cls) : 'Outros', cat = p ? nm(cfg.cats, p.cat) : 'Outros';
      clsCost[cls] = (clsCost[cls] || 0) + i.qty * i.cost; catCost[cat] = (catCost[cat] || 0) + i.qty * i.cost;
    }
  }
  const sortE = (o: Record<string, number>) => Object.entries(o).sort((x, y) => y[1] - x[1]);
  const top = sortE(prodQ);
  const peak = series.reduce((m, s) => (s[1] > m[1] ? s : m), series[0] || ['', 0]);
  const despCat = sortE(desp.reduce<Record<string, number>>((m, x) => ({ ...m, [x.cat]: (m[x.cat] || 0) + x.value }), {}));
  const invCat = sortE(inv.reduce<Record<string, number>>((m, x) => ({ ...m, [x.cat]: (m[x.cat] || 0) + x.value }), {}));
  const tByMode = (m: string) => { const l = cur.filter(o => o.mode === m); return l.length ? l.reduce((s, o) => s + orderTotal(o), 0) / l.length : 0; };

  const delta = (c: number, p: number) => {
    if (!p) return <span className="s">sem base anterior</span>;
    const d = (c - p) / Math.abs(p);
    return <span className="s"><span className={d >= 0 ? 'up' : 'down'}>{d >= 0 ? '+' : ''}{pct(d)}</span> vs anterior</span>;
  };
  type Card = [string, string, ReactNode];
  const cards: Card[] = met === 'fat' ? [
    ['Faturamento', brl(S.rev), delta(S.rev, SP.rev)],
    ['Pedidos', String(S.n), delta(S.n, SP.n)],
    ['Custo produtos', brl(S.cost), <span className="s">{S.rev ? pct(S.cost / S.rev) : '0%'} do faturamento</span>],
    ['Lucro bruto', brl(S.rev - S.cost), <span className="s">margem bruta {S.rev ? pct((S.rev - S.cost) / S.rev) : '0%'}</span>],
    ['Despesas', brl(sum(desp)), <span className="s">{desp.length} lançamento(s)</span>],
    ['Resultado oper.', brl(R), delta(R, RP)]
  ] : met === 'qtd' ? [
    ['Itens vendidos', nf(S.items), delta(S.items, SP.items)],
    ['Pedidos', String(S.n), delta(S.n, SP.n)],
    ['Itens/pedido', S.n ? (S.items / S.n).toFixed(1).replace('.', ',') : '0', <span className="s">média do período</span>],
    ['Mais vendido', top[0]?.[0] || '—', <span className="s">{top[0] ? top[0][1] + ' un.' : 'sem vendas'}</span>],
    [per === 'dia' ? 'Média/hora' : 'Média/dia', nf(S.items / (per === 'dia' ? Math.max(1, series.filter(s => s[1] > 0).length) : len)), <span className="s">itens</span>],
    ['Pico de vendas', peak[1] ? lab(peak[0]) : '—', <span className="s">{peak[1] ? nf(peak[1]) + ' itens' : 'sem vendas'}</span>]
  ] : [
    ['Ticket médio', brl(S.tm), delta(S.tm, SP.tm)],
    ['Maior pedido', brl(S.max), <span className="s">no período</span>],
    ['Menor pedido', brl(S.min), <span className="s">no período</span>],
    ['Ticket local', brl(tByMode('local')), <span className="s">{cur.filter(o => o.mode === 'local').length} pedido(s)</span>],
    ['Ticket viagem', brl(tByMode('viagem')), <span className="s">{cur.filter(o => o.mode === 'viagem').length} pedido(s)</span>],
    ['Faturamento', brl(S.rev), <span className="s">{S.n} pedido(s)</span>]
  ];

  const dre: [string, number, string][] = [
    ['Receita bruta (vendas)', S.rev, 's'], [`(−) Taxas de cartão e vale (estimado ${nf(cfg.cardFee)}%)`, -S.fees, 'i'], ['Receita líquida', S.rev - S.fees, 's'],
    ...sortE(catCost).map(([k, v]) => [`(−) Custo dos produtos · ${k}`, -v, 'i'] as [string, number, string]),
    ['Lucro bruto', S.rev - S.fees - S.cost, 's'], ['(−) Perdas', -sum(losses), 'i'],
    ...despCat.map(([k, v]) => [`(−) ${k}`, -v, 'i'] as [string, number, string]),
    ['Resultado operacional', R, 's']
  ];
  const exp = () => {
    const sheets: Record<string, Sheet> = {
      Indicadores: [['Indicador', 'Valor'], ...cards.map(c => [c[0], c[1]])],
      Série: [[per === 'dia' ? 'Hora' : 'Dia', 'Faturamento', 'Pedidos', 'Itens', 'Ticket médio'], ...keys.map(k => { const x = agg.get(k)!; return [lab(k), x.r, x.n, x.q, x.n ? x.r / x.n : 0]; })],
      'Resultado financeiro': [['Linha', 'Valor'], ...dre.map(d => [d[0], d[1]]), ['Margem operacional', S.rev ? R / S.rev : 0], ...invCat.map(([k, v]) => ['Investimento · ' + k, v])],
      'Mais vendidos': [['Produto', 'Quantidade'], ...top]
    };
    exportXlsx(`resultados-${a}-a-${b}`, sheets);
  };

  return <>
    {head}
    <div className="row sb" style={{ marginBottom: 10 }}><h2 style={{ margin: 0 }}>{label}</h2>
      <div className="row noprint"><button className="btn sm" onClick={exp}>Exportar XLSX</button><button className="btn sm" onClick={() => window.print()}>Imprimir / PDF</button></div></div>
    <div className="kpis">{cards.map((c, i) => <div key={c[0]} className={'card kpi' + (i === 0 ? ' hot' : '')}><div className="l" title={c[0]}>{c[0]}</div><div className="v" title={c[1]}>{c[1]}</div>{c[2]}</div>)}</div>

    <div className="card">
      <div className="row sb"><h2 style={{ margin: 0 }}>{met === 'fat' ? 'Faturamento' : met === 'qtd' ? 'Quantidade vendida' : 'Ticket médio'} por {per === 'dia' ? 'hora' : 'dia'}</h2>
        <span className="mute">{per === 'mes' && len > 15 ? 'últimos 15 dias do mês' : label}</span></div>
      <div className={'bars' + (series.length > 8 ? ' many' : '')}>{series.map(([k, v]) => (
        <div key={k} title={`${lab(k)}: ${money ? brl(v) : nf(v) + ' itens'}`}>
          {series.length <= 16 && v > 0 && <b>{short(v, money)}</b>}
          <i style={{ height: `${(v / mx) * 100}%` }} />
        </div>))}</div>
      <div className="bx">{series.map(([k], i) => <span key={k} className={i % stepM ? 'dk' : ''}>{i % step ? '' : lab(k)}</span>)}</div>
    </div>

    <div className="g2 mt">
      <div className="card"><h2>Mais vendidos</h2><HBars rows={top.slice(0, 8)} fmt={v => v + ' un.'} /></div>
      <div className="card"><h2>Custos de produtos por classe</h2><HBars rows={sortE(clsCost)} fmt={brl} />
        <h3>Vendas por forma de pagamento</h3><HBars rows={sortE(byPay)} fmt={brl} /></div>
    </div>

    <div className="g3 mt">
      <div className="card"><h2>Resultado financeiro · {label}</h2>
        <table className="dre"><tbody>
          {dre.map(([l, v, c]) => <tr key={l} className={c === 's' ? 's' : ''}><td className={c === 'i' ? 'ind' : ''}>{l}</td><td className="n">{brl(v)}</td></tr>)}
          <tr><td>Margem operacional</td><td className="n"><b>{S.rev ? pct(R / S.rev) : '0%'}</b></td></tr>
        </tbody></table>
        {!desp.length && <p className="mute">Nenhuma despesa lançada no período. Lance em Despesas para o resultado ficar completo.</p>}
      </div>
      <div className="card"><h2>Investimentos</h2>
        {invCat.length ? invCat.map(([k, v]) => <div key={k} className="row sb"><span>{k}</span><b>{brl(v)}</b></div>) : <p className="mute">Nenhum investimento lançado no período.</p>}
        <h3>Despesas por categoria</h3><HBars rows={despCat} fmt={brl} />
        <h3>Perdas</h3><p style={{ margin: 0 }}><b>{brl(sum(losses))}</b> <span className="mute">em {losses.length} lançamento(s)</span></p>
      </div>
    </div>
  </>;
}
