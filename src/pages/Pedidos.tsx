// Módulo Pedidos: Novo pedido, Cozinha (fila de produção), Comandas e Cobrança, com abertura/fechamento de caixa
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import QRCode from 'qrcode';
import { useApp } from '../store';
import { useCol } from '../db';
import { createOrder, isKitchen, payOrder, roundsOf, setRoundStatus, updateOrder, type Draft, type DraftItem } from '../ops';
import type { Mode, Order, OrderItem, PayPart, Product, Round, Status } from '../types';
import { ML, STATUS, brl, fillMsg, hm, isOn, isOpenOrder, num, orderTotal, payLabel, pixPayload, sellable, waLink } from '../utils';
import { Empty, ModalHead } from '../components/ui';
import { CaixaOpen, CancelModal, CloseCaixaModal } from './shared';

type Tab = 'novo' | 'cozinha' | 'comandas' | 'cobranca';
const emptyDraft = (): Draft => ({ client: '', phone: '', note: '', mode: 'local', items: [] });
let kseq = 0;
const newKey = () => 'k' + ++kseq;

export default function Pedidos() {
  const { caixa, ui, products, cfg } = useApp();
  const [tab, setTab] = useState<Tab>('novo');
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [sel, setSel] = useState<string | null>(null);
  const orders = useCol<Order>('orders', { where: [['cx', '==', caixa?.id || '-']] }, !!caixa);
  const lastCx = useRef(caixa?.id);
  useEffect(() => { // caixa novo = fila nova
    if (caixa?.id !== lastCx.current) { lastCx.current = caixa?.id; setDraft(emptyDraft()); setSel(null); setTab('novo'); }
  }, [caixa?.id]);

  if (!caixa) return <CaixaOpen />;
  const list = (orders || []).slice().sort((a, b) => a.num - b.num);
  const valid = list.filter(o => o.status !== 'cancelado');
  const inKitchen = valid.reduce((n, o) => n + roundsOf(o).filter(r => r.status !== 'entregue' && o.items.some(i => isKitchen(i, products, cfg.kitchenCats) && (i.r ?? 1) === r.n)).length, 0);
  const openTabs = valid.filter(isOpenOrder).length;
  const toCharge = valid.filter(o => !o.paid).length;

  const edit = (o: Order) => {
    setDraft({
      editing: o.id, num: o.num, client: o.client, phone: o.phone, note: o.note, mode: o.mode,
      items: o.items.map(i => ({ key: newKey(), pid: i.pid, qty: i.qty, rem: [...i.rem], obs: i.obs, mode: i.mode === o.mode ? '' : i.mode, r: i.r ?? 1, q0: i.qty }))
    });
    setTab('novo');
  };
  const tabs: [Tab, string, number][] = [['novo', draft.editing ? `Editando nº ${draft.num}` : 'Novo pedido', 0], ['cozinha', 'Cozinha', inKitchen], ['comandas', 'Comandas', openTabs], ['cobranca', 'Cobrança', toCharge]];
  const charge = (id: string) => { setSel(id); setTab('cobranca'); };

  return <>
    <div className="ptop">
      <div className="tabs scrollx" role="tablist">
        {tabs.map(([k, l, c]) => <button key={k} role="tab" aria-selected={tab === k} className={'chip' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l}{c > 0 && <span className="cnt">{c}</span>}</button>)}
      </div>
      <div className="row">
        <span className="mute">Caixa aberto às {hm(caixa.at)} · {valid.length} pedido(s) · próximo nº {(caixa.seq || 0) + 1}</span>
        <button className="btn" onClick={() => ui.modal(<CloseCaixaModal onGoQueue={() => setTab('comandas')} />)}>Fechar caixa</button>
      </div>
    </div>
    {orders === null ? <p className="mute">Carregando pedidos…</p> : <>
      {tab === 'novo' && <NovoPedido draft={draft} setDraft={setDraft} orders={list} onSaved={wasEdit => { setDraft(emptyDraft()); if (wasEdit) setTab('comandas'); }} onCancelEdit={() => setDraft(emptyDraft())} />}
      {tab === 'cozinha' && <Cozinha orders={list} onEdit={edit} onCharge={charge} />}
      {tab === 'comandas' && <Comandas orders={list} onEdit={edit} onCharge={charge} />}
      {tab === 'cobranca' && <Cobranca orders={valid.filter(o => !o.paid)} sel={sel} setSel={setSel} />}
    </>}
  </>;
}

/* ======================= NOVO PEDIDO ======================= */
type Change = { rem: string } | { obs: string } | { mode: Mode };
function applyChange(d: Draft, i: number, ch: Change, all: boolean): Draft {
  const items = d.items.map(x => ({ ...x, rem: [...x.rem] }));
  const it = items[i];
  if (!all && it.qty > 1) {
    const rest: DraftItem[] = Array.from({ length: it.qty - 1 }, () => ({ ...it, key: newKey(), qty: 1, rem: [...it.rem] }));
    it.qty = 1;
    items.splice(i + 1, 0, ...rest);
  }
  if ('rem' in ch) { const k = it.rem.indexOf(ch.rem); if (k < 0) it.rem.push(ch.rem); else it.rem.splice(k, 1); }
  else if ('mode' in ch) it.mode = ch.mode === d.mode ? '' : ch.mode;
  else it.obs = ch.obs;
  return { ...d, items };
}

function NovoPedido({ draft: d, setDraft, orders, onSaved, onCancelEdit }: { draft: Draft; setDraft: (f: (d: Draft) => Draft) => void; orders: Order[]; onSaved: (wasEdit: boolean) => void; onCancelEdit: () => void }) {
  const { products, cfg, caixa, user, ui } = useApp();
  const [q, setQ] = useState('');
  const [fcat, setFcat] = useState('');
  const [fcls, setFcls] = useState('');
  const [busy, setBusy] = useState(false);
  const asking = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const P = (id: string) => products.find(p => p.id === id);
  const total = d.items.reduce((s, i) => s + i.qty * (P(i.pid)?.price || 0), 0);
  const set = (patch: Partial<Draft>) => setDraft(x => ({ ...x, ...patch }));
  const needName = () => { ui.toast('Preencha primeiro o nome do cliente'); nameRef.current?.focus(); nameRef.current?.scrollIntoView({ block: 'center' }); };

  const addItem = (p: Product) => {
    if (!d.client.trim()) return needName();
    if (p.stock <= 0) ui.toast(`${p.name}: estoque zerado no sistema — confira o estoque`);
    else if (p.stock <= p.min) ui.toast(`${p.name}: estoque baixo (${p.stock})`);
    setDraft(x => {
      const items = x.items.map(i => ({ ...i }));
      const l = items.find(i => i.pid === p.id && !i.rem.length && !i.obs && !i.mode);
      if (l) l.qty++; else items.push({ key: newKey(), pid: p.id, qty: 1, rem: [], obs: '', mode: '' });
      return { ...x, items };
    });
  };
  const change = (i: number, ch: Change) => {
    const it = d.items[i];
    if (it.qty < 2) return setDraft(x => applyChange(x, i, ch, true));
    const what = 'rem' in ch ? (it.rem.includes(ch.rem) ? `voltar com ${ch.rem.toLowerCase()}` : `"Sem ${ch.rem.toLowerCase()}"`)
      : 'mode' in ch ? `"${ML[ch.mode]}"` : ch.obs ? `a observação "${ch.obs}"` : 'apagar a observação';
    asking.current = true;
    const done = (all: boolean | null) => { asking.current = false; ui.modal(null); if (all !== null) setDraft(x => applyChange(x, i, ch, all)); };
    ui.modal(<>
      <ModalHead title="Aplicar a todas as unidades?" onClose={() => done(null)} />
      <p style={{ fontSize: 16 }}>Este item tem <b>{it.qty}× {P(it.pid)?.name}</b>. Aplicar {what} em todas?</p>
      <div className="row end"><button className="btn" onClick={() => done(false)}>Não, só em 1 (uma por linha)</button>
        <button className="btn p" onClick={() => done(true)}>Sim, nas {it.qty}</button></div>
    </>);
  };
  const qty = (i: number, delta: number) => setDraft(x => {
    const items = x.items.map(it => ({ ...it }));
    items[i].qty += delta;
    return { ...x, items: items.filter(it => it.qty > 0) };
  });
  const send = async () => {
    if (asking.current) return;
    if (!d.client.trim()) return needName();
    if (!d.items.length) return ui.toast('Adicione pelo menos um item');
    const off = d.items.map(i => P(i.pid)).filter(p => !p || p.unavailable);
    if (off.length) return ui.toast('Há itens indisponíveis no pedido: ' + off.map(p => p?.name || 'removido').join(', '));
    setBusy(true);
    // WhatsApp automático do pedido recebido: a janela abre já no clique (o navegador bloqueia se abrir depois)
    const w = !d.editing && d.phone.trim() && cfg.wa?.auto && cfg.wa.on.includes('aguardando') ? window.open('', '_blank') : null;
    try {
      if (d.editing) {
        const o = orders.find(x => x.id === d.editing);
        if (!o) throw new Error('pedido não encontrado');
        if (o.paid) throw new Error('este pedido já foi pago');
        const r = await updateOrder(o, d, products, cfg.kitchenCats);
        ui.toast(`Comanda nº ${d.num} atualizada` + (r.newRound ? ' · itens novos de comida enviados para a cozinha' : ''));
      } else {
        const r = await createOrder(d, caixa!, products, user, cfg.kitchenCats);
        ui.toast(`Pedido nº ${r.num} lançado` + (r.kitchen ? ' · comida enviada para a cozinha' : ' · só bebidas, sem fila de cozinha'));
        if (w) w.location.href = waLink(d.phone, fillMsg(cfg.msgs.aguardando, { client: d.client.trim(), num: r.num, status: 'aguardando' }));
      }
      onSaved(!!d.editing);
    } catch (e) { w?.close(); ui.toast('Erro ao salvar: ' + (e as Error).message); }
    setBusy(false);
  };

  const forSale = products.filter(sellable);
  const catsOn = cfg.cats.filter(c => forSale.some(p => p.cat === c.c));
  const clsOn = cfg.classes.filter(c => forSale.some(p => p.cls === c.c && (!fcat || p.cat === fcat)));
  const groups = cfg.classes.map(c => ({ c, it: forSale.filter(p => p.cls === c.c && (!fcat || p.cat === fcat) && (!fcls || p.cls === fcls) && (!q || p.name.toLowerCase().includes(q.toLowerCase()))) })).filter(g => g.it.length);
  const NOTES = ['Mesa próxima da TV', 'Camisa azul', 'Motoqueiro', 'Retirada'];

  return <>
    {d.editing && <div className="banner row sb"><span>Editando a comanda <b>nº {d.num}</b>: adicione ou altere itens. Comida nova vai para a cozinha; bebida entra só na comanda.</span><button className="btn sm" onClick={onCancelEdit}>Cancelar edição</button></div>}
    <div className="card">
      <h2>1. Cliente</h2>
      <div className="fg">
        <label>Nome do cliente *<input ref={nameRef} value={d.client} onChange={e => set({ client: e.target.value })} placeholder="Ex.: João" required autoComplete="off" /></label>
        <label>Telefone / WhatsApp (opcional)<input value={d.phone} onChange={e => set({ phone: e.target.value })} inputMode="tel" placeholder="(31) 9 0000-0000" /></label>
        <label className="w2">Identificação<input value={d.note} onChange={e => set({ note: e.target.value })} placeholder="Ex.: mesa próxima da TV" /></label>
      </div>
      <div className="chips" style={{ marginTop: 8 }}>{NOTES.map(x => <button key={x} className={'chip y' + (d.note === x ? ' on' : '')} onClick={() => set({ note: d.note === x ? '' : x })}>{x}</button>)}</div>
      <h3 style={{ marginBottom: 6 }}>Consumo do pedido</h3>
      <div className="chips">{(Object.keys(ML) as Mode[]).map(k => <button key={k} className={'chip' + (d.mode === k ? ' on' : '')}
        onClick={() => setDraft(x => ({ ...x, mode: k, items: x.items.map(i => (i.mode === k ? { ...i, mode: '' } : i)) }))}>{ML[k]}</button>)}</div>
    </div>

    <div className="pos">
      <div className="card">
        <h2>2. Itens</h2>
        {!d.client.trim() && <p className="mute" style={{ margin: '-4px 0 10px' }}>Preencha o nome do cliente antes de adicionar itens.</p>}
        <div className="chips scrollx" role="group" aria-label="Filtrar por categoria" style={{ marginBottom: 8 }}>
          <button className={'chip' + (!fcat ? ' on' : '')} onClick={() => { setFcat(''); setFcls(''); }}>Todas</button>
          {catsOn.map(c => <button key={c.c} className={'chip' + (fcat === c.c ? ' on' : '')} onClick={() => { setFcat(fcat === c.c ? '' : c.c); setFcls(''); }}>{c.n}</button>)}
        </div>
        {clsOn.length > 1 && <div className="chips scrollx" role="group" aria-label="Filtrar por classe" style={{ marginBottom: 10 }}>
          {clsOn.map(c => <button key={c.c} className={'chip y' + (fcls === c.c ? ' on' : '')} onClick={() => setFcls(fcls === c.c ? '' : c.c)}>{c.n}</button>)}
        </div>}
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar produto…" aria-label="Buscar produto" />
        {groups.length ? groups.map(g => <div key={g.c.c}>
          <h3>{g.c.n}</h3>
          <div className="tiles">{g.it.map(p => (
            <button key={p.id} className="tile" disabled={p.unavailable} onClick={() => addItem(p)}>
              <span className="tn"><b>{p.name}</b>{p.desc && <span className="mute">{p.desc}</span>}</span>
              <span className="tr">
                {p.unavailable ? <span className="bd crit">Indisponível</span> : p.stock <= 0 ? <span className="bd low">Estoque zerado</span> : p.stock <= p.min ? <span className="bd low">{p.stock}</span> : null}
                <span className="pr">{brl(p.price)}</span>{!p.unavailable && <span className="plus" aria-hidden="true">+</span>}
              </span>
            </button>))}</div>
        </div>) : <Empty>Nenhum produto à venda encontrado. Cadastre produtos do tipo Revenda com preço.</Empty>}
      </div>

      <div className="card cart">
        <h2>Itens do pedido{d.client.trim() ? ' · ' + d.client.trim() : ''}</h2>
        <p className="mute" style={{ margin: '-4px 0 0' }}>Consumo: {ML[d.mode]} · toque no botão de cada item para mudar só ele</p>
        {d.items.length ? d.items.map((it, i) => {
          const p = P(it.pid);
          if (!p) return <div key={it.key} className="li row sb"><span className="mute">Produto removido do cadastro</span><button className="btn sm" onClick={() => qty(i, -it.qty)}>Remover</button></div>;
          const rm = p.ingr.filter(x => x.r);
          const eff = it.mode || d.mode;
          return (
            <div key={it.key} className="li">
              <div className="row sb"><b>{p.name}</b><span className="mute">{brl(p.price)} un.</span></div>
              <div className="row sb" style={{ marginTop: 6 }}>
                <span className="qty"><button onClick={() => qty(i, -1)} aria-label="Diminuir">−</button><span>{it.qty}</span><button onClick={() => qty(i, 1)} aria-label="Aumentar">+</button></span>
                <button className={'chip' + (eff !== d.mode ? ' y on' : '')} style={{ minHeight: 36 }} onClick={() => change(i, { mode: eff === 'local' ? 'viagem' : 'local' })} title="Tocar para trocar">{ML[eff]}</button>
                <b>{brl(it.qty * p.price)}</b>
              </div>
              {rm.length > 0 && !it.rem.length && <div style={{ marginTop: 8 }}><span className="bd ok">Completo</span></div>}
              {rm.length > 0 && <div className="chips" style={{ marginTop: 8 }}>{rm.map(x => <button key={x.n} className={'chip' + (it.rem.includes(x.n) ? ' on' : '')} onClick={() => change(i, { rem: x.n })}>Sem {x.n.toLowerCase()}</button>)}</div>}
              <input key={it.key + '|' + it.obs} defaultValue={it.obs} placeholder="Observação: pouco sal, bacon extra…" style={{ marginTop: 8 }}
                onBlur={e => { const v = e.target.value.trim(); if (v !== it.obs) change(i, { obs: v }); }} />
            </div>);
        }) : <Empty>Toque nos produtos para montar o pedido.</Empty>}
        <div className="tot"><span className="mute">Total do pedido</span><b>{brl(total)}</b></div>
        <button className="btn p wide" disabled={busy || !d.items.length} onClick={send}>{d.editing ? `Salvar comanda nº ${d.num}` : 'Lançar pedido'}</button>
      </div>
    </div>
  </>;
}

/* ======================= COZINHA (fila de produção) ======================= */
type FS = 'todos' | Status;
interface Ticket { o: Order; r: Round; items: OrderItem[]; status: Status; multi: boolean }
const roundLabel = (n: number) => `${n}º envio`;

function Cozinha({ orders, onEdit, onCharge }: { orders: Order[]; onEdit: (o: Order) => void; onCharge: (id: string) => void }) {
  const { ui, cfg, products } = useApp();
  const [fs, setFs] = useState<FS>('todos');
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(x => x + 1), 30000); return () => clearInterval(t); }, []);
  // um ticket por envio de comida (bebidas não entram na fila)
  const tickets: Ticket[] = [];
  for (const o of orders) {
    const rs = roundsOf(o);
    for (const r of rs) {
      const items = o.items.filter(i => isKitchen(i, products, cfg.kitchenCats) && (i.r ?? 1) === r.n);
      if (items.length) tickets.push({ o, r, items, status: o.status === 'cancelado' ? 'cancelado' : r.status, multi: rs.length > 1 });
    }
  }
  const cols: Status[] = ['aguardando', 'producao', 'pronto', 'entregue'];
  const cnt = (s: Status) => tickets.filter(t => t.status === s).length;
  const all = fs === 'todos';
  const advance = async (t: Ticket) => {
    const nx = STATUS[t.r.status].next!;
    const o = t.o;
    if (cfg.wa?.auto && o.phone && cfg.wa.on.includes(nx)) window.open(waLink(o.phone, fillMsg(cfg.msgs[nx], { ...o, status: nx })), '_blank');
    await setRoundStatus(o, t.r.n, nx);
    if (nx === 'entregue' && !o.paid) ui.toast(`Pedido nº ${o.num} entregue — falta cobrar`);
    if (o.phone && nx === 'pronto' && !(cfg.wa?.auto && cfg.wa.on.includes('pronto'))) ui.toast(`Pedido nº ${o.num} pronto. Toque em WhatsApp para avisar ${o.client}.`);
  };
  const TicketCard = ({ t }: { t: Ticket }) => {
    const o = t.o;
    const min = Math.round((Date.now() - t.r.at) / 6e4);
    const st = STATUS[t.r.status];
    const drinks = o.items.filter(i => !isKitchen(i, products, cfg.kitchenCats)).reduce((n, i) => n + i.qty, 0);
    return (
      <article className="tk">
        <div className="row sb"><span className="n">nº {o.num}{t.multi && <span className="mute" style={{ fontSize: 13, fontFamily: 'Inter' }}> · {roundLabel(t.r.n)}</span>}</span><span className="mute">{hm(t.r.at)} · {min} min</span></div>
        <div style={{ marginTop: 4 }}><b>{o.client}</b>{o.note && <> · <span className="mute">{o.note}</span></>}</div>
        <div className="row" style={{ marginTop: 6, gap: 6 }}><span className={'bd ' + (o.mode === 'viagem' ? 'v' : 'g')}>{ML[o.mode]}</span>
          {o.status === 'cancelado' ? <span className="bd low">Cancelado</span> : o.paid ? <span className="bd ok">Pago</span> : <span className="bd y">A cobrar</span>}</div>
        <ul>{t.items.map((i, k) => <li key={k}><b>{i.qty}×</b> {i.name}{i.mode !== o.mode && <> <span className="bd v">{ML[i.mode]}</span></>}
          {i.rem.length ? <><br /><span className="rm">Sem {i.rem.map(x => x.toLowerCase()).join(', sem ')}</span></> : i.removable ? <><br /><span className="okc">Completo</span></> : null}
          {i.obs && <><br /><span className="mute">{i.obs}</span></>}</li>)}</ul>
        {drinks > 0 && <p className="mute" style={{ margin: '0 0 6px' }}>+ {drinks} bebida(s) na comanda</p>}
        {o.cancel && <p className="mute">Motivo: {o.cancel.reason} · {o.cancel.by}</p>}
        {o.status !== 'cancelado' && <>
          <div className="row sb">{!o.paid ? <button className="btn sm" onClick={() => onCharge(o.id)}>Cobrar</button> : <span />}
            {st.next && <button className="btn sm p" onClick={() => advance(t)}>{st.act}</button>}</div>
          <div className="acts">
            {o.phone && <a className="btn sm wa" href={waLink(o.phone, fillMsg(cfg.msgs[t.r.status], o))} target="_blank" rel="noreferrer">WhatsApp</a>}
            {!o.paid && <button className="btn sm" onClick={() => onEdit(o)}>Editar / + itens</button>}
            {!(o.status === 'entregue' && o.paid) && <button className="btn sm danger" onClick={() => ui.modal(<CancelModal order={o} />)}>Cancelar</button>}
          </div></>}
      </article>);
  };
  const filters: [FS, string, string][] = [['todos', 'Todos', ''], ...cols.map(s => [s, STATUS[s].n, STATUS[s].c] as [FS, string, string]), ['cancelado', 'Cancelados', STATUS.cancelado.c]];
  return <>
    <div className="chips scrollx" style={{ marginBottom: 10 }} role="group" aria-label="Filtrar por status">
      {filters.map(([k, n, c]) => <button key={k} className={'chip' + (c ? ' st' : '') + (fs === k ? ' on' : '')} style={{ '--c': c } as CSSProperties} onClick={() => setFs(k)}>
        {n} ({k === 'todos' ? tickets.filter(t => t.status !== 'cancelado').length : cnt(k as Status)})</button>)}
    </div>
    <p className="mute" style={{ marginTop: 0 }}>Fila de produção: só os itens de comida. As bebidas ficam em Comandas.</p>
    <div className={'kb' + (all ? '' : ' one')}>
      {(all ? cols : [fs as Status]).map(s => {
        let l = tickets.filter(t => t.status === s);
        if (s === 'entregue' || s === 'cancelado') l = l.slice().reverse();
        if (all && s === 'entregue') l = l.slice(0, 6);
        return <section key={s}>
          <div className="colh" style={{ background: STATUS[s].c }}>{STATUS[s].n}<span>{cnt(s)}</span></div>
          <div className="tks">{l.length ? l.map(t => <TicketCard key={t.o.id + ':' + t.r.n} t={t} />) : <Empty>Nada aqui.</Empty>}</div>
        </section>;
      })}
    </div>
  </>;
}

/* ======================= COMANDAS (gestão dos pedidos) ======================= */
type CF = 'abertas' | 'pagas' | 'todas' | 'canceladas';
function Comandas({ orders, onEdit, onCharge }: { orders: Order[]; onEdit: (o: Order) => void; onCharge: (id: string) => void }) {
  const { ui, cfg, products } = useApp();
  const [f, setF] = useState<CF>('abertas');
  const [q, setQ] = useState('');
  const pick = (o: Order) => f === 'canceladas' ? o.status === 'cancelado' : o.status !== 'cancelado' && (f === 'todas' || (f === 'pagas' ? o.paid : !o.paid || o.status !== 'entregue'));
  const list = orders.filter(o => pick(o) && (!q || (o.client + ' ' + o.num + ' ' + o.note).toLowerCase().includes(q.toLowerCase()))).slice().reverse();
  const count = (x: CF) => orders.filter(o => x === 'canceladas' ? o.status === 'cancelado' : o.status !== 'cancelado' && (x === 'todas' || (x === 'pagas' ? o.paid : !o.paid || o.status !== 'entregue'))).length;
  const rstat = (o: Order, i: OrderItem) => roundsOf(o).find(r => r.n === (i.r ?? 1))?.status || 'aguardando';
  return <>
    <div className="row sb" style={{ marginBottom: 10 }}>
      <div className="chips scrollx">{([['abertas', 'Em aberto'], ['pagas', 'Pagas'], ['todas', 'Todas'], ['canceladas', 'Canceladas']] as [CF, string][]).map(([k, l]) =>
        <button key={k} className={'chip' + (f === k ? ' on' : '')} onClick={() => setF(k)}>{l} ({count(k)})</button>)}</div>
      <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar cliente ou nº…" style={{ maxWidth: 280 }} aria-label="Buscar comanda" />
    </div>
    {list.length ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 12 }}>
      {list.map(o => {
        const food = o.items.filter(i => isKitchen(i, products, cfg.kitchenCats)), drink = o.items.filter(i => !isKitchen(i, products, cfg.kitchenCats));
        return <article key={o.id} className="tk" style={{ marginBottom: 0 }}>
          <div className="row sb"><span className="n">nº {o.num}</span><span className="mute">{hm(o.at)} · por {o.by}</span></div>
          <div style={{ marginTop: 4 }}><b>{o.client}</b>{o.note && <> · <span className="mute">{o.note}</span></>}</div>
          <div className="row" style={{ marginTop: 6, gap: 6 }}><span className={'bd ' + (o.mode === 'viagem' ? 'v' : 'g')}>{ML[o.mode]}</span>
            {o.status === 'cancelado' ? <span className="bd low">Cancelado</span> : o.paid ? <span className="bd ok">Pago · {payLabel(o)}</span> : <span className="bd y">A cobrar</span>}
            {o.status !== 'cancelado' && <span className="bd g">{food.length ? 'Cozinha: ' + STATUS[o.status].n : 'Só balcão'}</span>}</div>
          <ul>
            {food.map((i, k) => { const s = rstat(o, i); return <li key={'f' + k} className="row sb" style={{ flexWrap: 'nowrap' }}>
              <span><b>{i.qty}×</b> {i.name}{i.rem.length ? <span className="rm"> · sem {i.rem.map(x => x.toLowerCase()).join(', ')}</span> : null}</span>
              <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><span className="bd" style={{ background: 'color-mix(in srgb,' + STATUS[s].c + ' 35%,transparent)', color: 'var(--ink)' }}>{STATUS[s].n}</span><span className="mute">{brl(i.qty * i.price)}</span></span></li>; })}
            {drink.map((i, k) => <li key={'d' + k} className="row sb" style={{ flexWrap: 'nowrap' }}><span><b>{i.qty}×</b> {i.name}</span><span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><span className="bd g">Balcão</span><span className="mute">{brl(i.qty * i.price)}</span></span></li>)}
          </ul>
          <div className="row sb"><span className="mute">Total</span><b style={{ fontSize: 20 }}>{brl(orderTotal(o))}</b></div>
          {o.status !== 'cancelado' && <div className="acts">
            {!o.paid && <button className="btn sm p" onClick={() => onEdit(o)}>+ Adicionar itens</button>}
            {!o.paid && <button className="btn sm" onClick={() => onCharge(o.id)}>Cobrar</button>}
            {o.phone && <a className="btn sm wa" href={waLink(o.phone, fillMsg(cfg.msgs[o.status], o))} target="_blank" rel="noreferrer">WhatsApp</a>}
            {!(o.status === 'entregue' && o.paid) && <button className="btn sm danger" onClick={() => ui.modal(<CancelModal order={o} />)}>Cancelar</button>}
          </div>}
        </article>;
      })}
    </div> : <Empty>Nenhuma comanda aqui.</Empty>}
  </>;
}
/* ======================= COBRANÇA ======================= */
type PayMode = 'unico' | 'misto' | 'dividir';
interface Row { m: string; v: string; unit: 'R$' | '%'; recv: string }
const cents = (n: number) => Math.round(n * 100) / 100;

/** Divide o total em n partes iguais; a última absorve o arredondamento para fechar a conta. */
function splitEqual(total: number, n: number) {
  const base = Math.floor((total / n) * 100) / 100;
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? cents(total - base * (n - 1)) : base));
}

function Cobranca({ orders, sel, setSel }: { orders: Order[]; sel: string | null; setSel: (id: string | null) => void }) {
  const { cfg, ui, user, products } = useApp();
  const pays = cfg.pays.filter(x => isOn(cfg, 'pays', x));
  const [mode, setMode] = useState<PayMode>('unico');
  const [m, setM] = useState('Dinheiro');
  const [recv, setRecv] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [split, setSplit] = useState<'igual' | 'valores'>('igual');
  const [people, setPeople] = useState(2);
  const [same, setSame] = useState(true);
  const [sameM, setSameM] = useState('PIX');
  const [qrFor, setQrFor] = useState<{ v: number; label: string } | null>(null);
  const [qr, setQr] = useState('');
  const [busy, setBusy] = useState(false);
  const o = orders.find(x => x.id === sel) || null;
  const t = o ? orderTotal(o) : 0;
  const pixValue = mode === 'unico' && m === 'PIX' ? t : qrFor?.v || 0;
  const payload = o && pixValue > 0 ? pixPayload(cfg.pix, pixValue, `LALIN${o.day.replace(/-/g, '')}N${o.num}`) : '';
  useEffect(() => { setQr(''); if (payload) QRCode.toDataURL(payload, { margin: 1, width: 440 }).then(setQr).catch(() => setQr('')); }, [payload]);
  useEffect(() => { setRecv(''); setMode('unico'); setM('Dinheiro'); setQrFor(null); setRows([]); }, [sel]);

  // linhas conforme o modo
  const defRow = (mm: string): Row => ({ m: mm, v: '', unit: 'R$', recv: '' });
  const ensureRows = (n: number, mm = 'PIX') => setRows(r => Array.from({ length: n }, (_, i) => r[i] || defRow(i === 0 ? mm : 'Dinheiro')));
  useEffect(() => { if (mode === 'misto' && rows.length < 2) ensureRows(2); if (mode === 'dividir') ensureRows(people); /* eslint-disable-next-line */ }, [mode, people]);
  const valOf = (r: Row) => cents(r.unit === '%' ? (t * num(r.v)) / 100 : num(r.v));
  const eq = splitEqual(t, Math.max(1, people));
  const parts: PayPart[] = mode === 'misto' ? rows.map(r => ({ m: r.m, value: valOf(r), recv: r.m === 'Dinheiro' && r.recv ? num(r.recv) : undefined }))
    : mode === 'dividir' ? rows.slice(0, people).map((r, i) => ({ who: `Pessoa ${i + 1}`, m: same ? sameM : r.m, value: split === 'igual' ? eq[i] : valOf(r),
      recv: (same ? sameM : r.m) === 'Dinheiro' && r.recv ? num(r.recv) : undefined })) : [];
  const sum = cents(parts.reduce((s, p) => s + p.value, 0));
  const falta = cents(t - sum);
  const setRow = (i: number, patch: Partial<Row>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  const pay = async () => {
    if (!o) return;
    if (mode === 'unico' && m === 'Dinheiro' && num(recv) < t) return ui.toast('Valor recebido menor que o total');
    if (mode !== 'unico') {
      if (Math.abs(falta) >= 0.01) return ui.toast(falta > 0 ? `Faltam ${brl(falta)} para fechar a conta` : `Passou ${brl(-falta)} do total`);
      if (parts.some(p => !(p.value > 0))) return ui.toast('Todas as partes precisam ter valor');
      const shortCash = parts.find(p => p.m === 'Dinheiro' && p.recv !== undefined && p.recv < p.value);
      if (shortCash) return ui.toast(`Dinheiro recebido menor que ${brl(shortCash.value)}${shortCash.who ? ' (' + shortCash.who + ')' : ''}`);
    }
    setBusy(true);
    try {
      const p = await payOrder(o, m, mode === 'unico' && m === 'Dinheiro' ? num(recv) : t, user, products,
        mode === 'unico' ? undefined : { kind: mode === 'misto' ? 'misto' : 'dividido', parts });
      ui.toast(`Pedido nº ${o.num} pago` + (p.change > 0 ? ` · troco ${brl(p.change)}` : ''));
      setSel(null);
    } catch (e) { ui.toast('Erro: ' + (e as Error).message); }
    setBusy(false);
  };
  const copy = () => navigator.clipboard?.writeText(payload).then(() => ui.toast('Código PIX copiado'), () => ui.toast('Não foi possível copiar'));
  const qrBox = payload ? <div className="qr" style={{ marginTop: 12 }}>{qr ? <img src={qr} alt="QR Code PIX" /> : <div className="mute">Gerando QR…</div>}
    <div><label>PIX copia e cola{qrFor ? ` · ${qrFor.label} · ${brl(qrFor.v)}` : ''}<textarea readOnly value={payload} /></label>
      <button className="btn" style={{ marginTop: 8 }} onClick={copy}>Copiar código</button>
      <p className="mute">Chave {cfg.pix.key} · valor já preenchido. Confira o recebimento no app do banco antes de confirmar.</p></div></div> : null;

  // função (e não componente) para os campos não perderem o foco ao digitar
  const rowEditor = (r: Row, i: number, label?: string, fixed?: number) => {
    const mm = mode === 'dividir' && same ? sameM : r.m;
    const v = fixed ?? valOf(r);
    return <div key={i} className="li" style={{ padding: '8px 0' }}>
      <div className="row" style={{ gap: 8 }}>
        {label && <b style={{ minWidth: 74 }}>{label}</b>}
        {!(mode === 'dividir' && same) && <select value={r.m} onChange={e => setRow(i, { m: e.target.value })} style={{ width: 150 }} aria-label="Forma de pagamento">{pays.map(x => <option key={x}>{x}</option>)}</select>}
        {fixed === undefined ? <>
          <input type="number" inputMode="decimal" step="0.01" value={r.v} onChange={e => setRow(i, { v: e.target.value })} placeholder={r.unit === 'R$' ? '0,00' : '0'} style={{ width: 110 }} aria-label="Valor" />
          <span className="qty"><button style={{ width: 44, fontSize: 13, fontWeight: 700, background: r.unit === 'R$' ? 'var(--acc)' : '', color: r.unit === 'R$' ? 'var(--acc-ink)' : '' }} onClick={() => setRow(i, { unit: 'R$' })}>R$</button>
            <button style={{ width: 44, fontSize: 13, fontWeight: 700, background: r.unit === '%' ? 'var(--acc)' : '', color: r.unit === '%' ? 'var(--acc-ink)' : '' }} onClick={() => setRow(i, { unit: '%' })}>%</button></span>
          {r.unit === '%' && <span className="mute">= {brl(v)}</span>}
        </> : <b style={{ fontSize: 18 }}>{brl(v)}</b>}
        {mm === 'Dinheiro' && <input type="number" inputMode="decimal" step="0.01" value={r.recv} onChange={e => setRow(i, { recv: e.target.value })} placeholder="Recebido" style={{ width: 110 }} aria-label="Recebido em dinheiro" />}
        {mm === 'Dinheiro' && r.recv && num(r.recv) > v && <span className="okc">troco {brl(num(r.recv) - v)}</span>}
        {mm === 'PIX' && v > 0 && <button className="btn sm" onClick={() => setQrFor({ v, label: label || 'PIX' })}>QR</button>}
        {mode === 'misto' && rows.length > 2 && <button className="btn sm" onClick={() => setRows(rows.filter((_, k) => k !== i))} aria-label="Remover forma">×</button>}
      </div>
    </div>;
  };

  return (
    <div className="paygrid">
      <div className="card"><h2>A cobrar</h2>
        <div className="olist">{orders.length ? orders.map(x => (
          <button key={x.id} className={x.id === sel ? 'on' : ''} onClick={() => setSel(x.id)}>
            <span><b>nº {x.num} · {x.client}</b><br /><span className="mute">{x.items.reduce((n, i) => n + i.qty, 0)} item(ns) · {STATUS[x.status].n} · {ML[x.mode]}</span></span>
            <b>{brl(orderTotal(x))}</b></button>)) : <Empty>Nenhum pedido a cobrar.</Empty>}</div>
      </div>
      <div className="card">{!o ? <Empty>Selecione um pedido para cobrar.</Empty> : <>
        <div className="row sb"><h2 style={{ margin: 0 }}>Pedido nº {o.num} · {o.client}</h2><span className="bd y">{STATUS[o.status].n}</span></div>
        <ul style={{ paddingLeft: 18 }}>{o.items.map((i, k) => <li key={k}>{i.qty}× {i.name} — {brl(i.qty * i.price)}</li>)}</ul>
        <div className="row sb"><span className="mute">Valor total</span><span className="big">{brl(t)}</span></div>
        <h3>Forma de pagamento</h3>
        <div className="chips">
          {pays.map(x => <button key={x} className={'chip' + (mode === 'unico' && x === m ? ' on' : '')} onClick={() => { setMode('unico'); setM(x); setQrFor(null); }}>{x}</button>)}
          <button className={'chip y' + (mode === 'misto' ? ' on' : '')} onClick={() => { setMode('misto'); setQrFor(null); }}>Pagamento misto</button>
          <button className={'chip y' + (mode === 'dividir' ? ' on' : '')} onClick={() => { setMode('dividir'); setQrFor(null); }}>Rachar conta</button>
        </div>
        <div style={{ marginTop: 14 }}>
          {mode === 'unico' && (m === 'Dinheiro' ? <>
            <label>Valor recebido<input type="number" inputMode="decimal" step="0.01" value={recv} onChange={e => setRecv(e.target.value)} placeholder="0,00" /></label>
            <div className="chips" style={{ marginTop: 8 }}>{([['Exato', t], ['R$ 20', 20], ['R$ 50', 50], ['R$ 100', 100], ['R$ 200', 200]] as [string, number][]).filter(x => x[1] >= t).map(([l, v]) =>
              <button key={l} className="chip" onClick={() => setRecv(String(v))}>{l}</button>)}</div>
            {recv !== '' && <div className={'troco' + (num(recv) < t ? ' neg' : '')}><span>{num(recv) < t ? 'Faltam' : 'Troco'}</span><span className="big" style={{ fontSize: 34 }}>{brl(Math.abs(num(recv) - t))}</span></div>}
          </> : m === 'PIX' ? qrBox : <div className="note">Passe <b>{brl(t)}</b> no {m.toLowerCase()} na maquininha e confirme abaixo.</div>)}

          {mode === 'misto' && <>
            <p className="mute" style={{ marginTop: 0 }}>Combine formas de pagamento. Preencha em reais ou em percentual.</p>
            {rows.map((r, i) => rowEditor(r, i))}
            <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setRows([...rows, defRow(pays[0] || 'PIX')])}>+ Forma de pagamento</button>
          </>}

          {mode === 'dividir' && <>
            <div className="row" style={{ gap: 12 }}>
              <span className="qty"><button onClick={() => setPeople(Math.max(2, people - 1))} aria-label="Menos pessoas">−</button><span>{people}</span><button onClick={() => setPeople(Math.min(20, people + 1))} aria-label="Mais pessoas">+</button></span>
              <span className="mute">pessoas</span>
              <div className="chips">
                <button className={'chip' + (split === 'igual' ? ' on' : '')} onClick={() => setSplit('igual')}>Dividir igual</button>
                <button className={'chip' + (split === 'valores' ? ' on' : '')} onClick={() => setSplit('valores')}>Valor ou % por pessoa</button>
              </div>
            </div>
            <div className="row" style={{ marginTop: 10, gap: 10 }}>
              <label className="ck"><input type="checkbox" checked={same} onChange={e => setSame(e.target.checked)} /> Todos pagam com a mesma forma</label>
              {same && <select value={sameM} onChange={e => setSameM(e.target.value)} style={{ width: 170 }} aria-label="Forma de pagamento de todos">{pays.map(x => <option key={x}>{x}</option>)}</select>}
            </div>
            {split === 'igual' && eq[0] !== eq[eq.length - 1] && <p className="mute">Arredondamento: a Pessoa {people} paga {brl(eq[eq.length - 1])} para fechar a conta exata.</p>}
            {rows.slice(0, people).map((r, i) => rowEditor(r, i, `Pessoa ${i + 1}`, split === 'igual' ? eq[i] : undefined))}
          </>}

          {mode !== 'unico' && <>
            <div className={'troco' + (Math.abs(falta) >= 0.01 ? ' neg' : '')}><span>{Math.abs(falta) < 0.01 ? 'Conta fechada' : falta > 0 ? 'Falta para fechar' : 'Passou do total'}</span>
              <span className="big" style={{ fontSize: 30 }}>{brl(Math.abs(falta))}</span></div>
            {qrFor && qrBox}
          </>}
        </div>
        <button className="btn p wide" style={{ marginTop: 14 }} disabled={busy || (mode !== 'unico' && Math.abs(falta) >= 0.01)} onClick={pay}>Confirmar pagamento</button>
        {o.phone && <p className="mute" style={{ marginTop: 10 }}>Cliente com WhatsApp: {o.phone}</p>}
      </>}</div>
    </div>
  );
}
