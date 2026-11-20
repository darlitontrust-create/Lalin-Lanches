// Módulo Pedidos: Novo pedido, Fila e Cobrança juntos, com abertura/fechamento de caixa
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import QRCode from 'qrcode';
import { useApp } from '../store';
import { useCol } from '../db';
import { createOrder, payOrder, setStatus, updateOrder, type Draft, type DraftItem } from '../ops';
import type { Mode, Order, Product, Status } from '../types';
import { ML, STATUS, brl, fillMsg, hm, isOn, isOpenOrder, num, orderTotal, pixPayload, sellable, waLink } from '../utils';
import { Empty, ModalHead } from '../components/ui';
import { CaixaOpen, CancelModal, CloseCaixaModal } from './shared';

type Tab = 'novo' | 'fila' | 'cobranca';
const emptyDraft = (): Draft => ({ client: '', phone: '', note: '', mode: 'local', items: [] });
let kseq = 0;
const newKey = () => 'k' + ++kseq;

export default function Pedidos() {
  const { caixa, ui } = useApp();
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
  const inQueue = valid.filter(isOpenOrder).length;
  const toCharge = valid.filter(o => !o.paid).length;

  const edit = (o: Order) => {
    setDraft({
      editing: o.id, num: o.num, client: o.client, phone: o.phone, note: o.note, mode: o.mode,
      items: o.items.map(i => ({ key: newKey(), pid: i.pid, qty: i.qty, rem: [...i.rem], obs: i.obs, mode: i.mode === o.mode ? '' : i.mode }))
    });
    setTab('novo');
  };
  const tabs: [Tab, string, number][] = [['novo', draft.editing ? `Editando nº ${draft.num}` : 'Novo pedido', 0], ['fila', 'Fila', inQueue], ['cobranca', 'Cobrança', toCharge]];

  return <>
    <div className="ptop">
      <div className="tabs scrollx" role="tablist">
        {tabs.map(([k, l, c]) => <button key={k} role="tab" aria-selected={tab === k} className={'chip' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l}{c > 0 && <span className="cnt">{c}</span>}</button>)}
      </div>
      <div className="row">
        <span className="mute">Caixa aberto às {hm(caixa.at)} · {valid.length} pedido(s) · próximo nº {(caixa.seq || 0) + 1}</span>
        <button className="btn" onClick={() => ui.modal(<CloseCaixaModal onGoQueue={() => setTab('fila')} />)}>Fechar caixa</button>
      </div>
    </div>
    {orders === null ? <p className="mute">Carregando pedidos…</p> : <>
      {tab === 'novo' && <NovoPedido draft={draft} setDraft={setDraft} onSaved={() => { setDraft(emptyDraft()); }} onCancelEdit={() => setDraft(emptyDraft())} />}
      {tab === 'fila' && <Fila orders={list} onEdit={edit} onCharge={id => { setSel(id); setTab('cobranca'); }} />}
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

function NovoPedido({ draft: d, setDraft, onSaved, onCancelEdit }: { draft: Draft; setDraft: (f: (d: Draft) => Draft) => void; onSaved: () => void; onCancelEdit: () => void }) {
  const { products, cfg, caixa, user, ui } = useApp();
  const [q, setQ] = useState('');
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
      if (d.editing) { await updateOrder(d.editing, d, products); ui.toast(`Pedido nº ${d.num} atualizado na fila`); }
      else {
        const n = await createOrder(d, caixa!, products, user); ui.toast(`Pedido nº ${n} enviado para a cozinha`);
        if (w) w.location.href = waLink(d.phone, fillMsg(cfg.msgs.aguardando, { client: d.client.trim(), num: n, status: 'aguardando' }));
      }
      onSaved();
    } catch (e) { w?.close(); ui.toast('Erro ao salvar: ' + (e as Error).message); }
    setBusy(false);
  };

  const groups = cfg.classes.map(c => ({ c, it: products.filter(p => sellable(p) && p.cls === c.c && (!q || p.name.toLowerCase().includes(q.toLowerCase()))) })).filter(g => g.it.length);
  const NOTES = ['Mesa próxima da TV', 'Camisa azul', 'Motoqueiro', 'Retirada'];

  return <>
    {d.editing && <div className="banner row sb"><span>Editando o pedido <b>nº {d.num}</b>. As mudanças aparecem na fila ao salvar.</span><button className="btn sm" onClick={onCancelEdit}>Cancelar edição</button></div>}
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
        <button className="btn p wide" disabled={busy || !d.items.length} onClick={send}>{d.editing ? `Salvar alterações do nº ${d.num}` : 'Enviar para a cozinha'}</button>
      </div>
    </div>
  </>;
}

/* ======================= FILA ======================= */
type FS = 'todos' | Status;
function Fila({ orders, onEdit, onCharge }: { orders: Order[]; onEdit: (o: Order) => void; onCharge: (id: string) => void }) {
  const { ui, cfg } = useApp();
  const [fs, setFs] = useState<FS>('todos');
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(x => x + 1), 30000); return () => clearInterval(t); }, []);
  const cols = (['aguardando', 'producao', 'pronto', 'entregue'] as Status[]);
  const cnt = (s: Status) => orders.filter(o => o.status === s).length;
  const all = fs === 'todos';
  const shown = all ? cols : [fs];
  const advance = async (o: Order) => {
    const nx = STATUS[o.status].next!;
    // WhatsApp automático: abre a conversa já com a mensagem do novo status
    if (cfg.wa?.auto && o.phone && cfg.wa.on.includes(nx)) window.open(waLink(o.phone, fillMsg(cfg.msgs[nx], { ...o, status: nx })), '_blank');
    await setStatus(o, nx);
    if (nx === 'entregue' && !o.paid) ui.toast(`Pedido nº ${o.num} entregue — falta cobrar`);
    if (o.phone && nx === 'pronto' && !(cfg.wa?.auto && cfg.wa.on.includes('pronto'))) ui.toast(`Pedido nº ${o.num} pronto. Toque em WhatsApp para avisar ${o.client}.`);
  };
  const Ticket = ({ o }: { o: Order }) => {
    const min = Math.round((Date.now() - o.at) / 6e4);
    const st = STATUS[o.status];
    const canEdit = !o.paid && (o.status === 'aguardando' || o.status === 'producao');
    return (
      <article className="tk">
        <div className="row sb"><span className="n">nº {o.num}</span><span className="mute">{hm(o.at)} · {min} min · por {o.by}</span></div>
        <div style={{ marginTop: 4 }}><b>{o.client}</b>{o.note && <> · <span className="mute">{o.note}</span></>}</div>
        <div className="row" style={{ marginTop: 6, gap: 6 }}><span className={'bd ' + (o.mode === 'viagem' ? 'v' : 'g')}>{ML[o.mode]}</span>
          {o.status === 'cancelado' ? <span className="bd low">Cancelado</span> : o.paid ? <span className="bd ok">Pago · {o.pay?.m}</span> : <span className="bd y">A cobrar · {brl(orderTotal(o))}</span>}</div>
        <ul>{o.items.map((i, k) => <li key={k}><b>{i.qty}×</b> {i.name}{i.mode !== o.mode && <> <span className="bd v">{ML[i.mode]}</span></>}
          {i.rem.length ? <><br /><span className="rm">Sem {i.rem.map(x => x.toLowerCase()).join(', sem ')}</span></> : i.removable ? <><br /><span className="okc">Completo</span></> : null}
          {i.obs && <><br /><span className="mute">{i.obs}</span></>}</li>)}</ul>
        {o.cancel && <p className="mute">Motivo: {o.cancel.reason} · {o.cancel.by}</p>}
        {o.status !== 'cancelado' && <>
          <div className="row sb">{!o.paid ? <button className="btn sm" onClick={() => onCharge(o.id)}>Cobrar</button> : <span />}
            {st.next && <button className="btn sm p" onClick={() => advance(o)}>{st.act}</button>}</div>
          <div className="acts">
            {o.phone && <a className="btn sm wa" href={waLink(o.phone, fillMsg(cfg.msgs[o.status], o))} target="_blank" rel="noreferrer">WhatsApp</a>}
            {canEdit && <button className="btn sm" onClick={() => onEdit(o)}>Editar</button>}
            {!(o.status === 'entregue' && o.paid) && <button className="btn sm danger" onClick={() => ui.modal(<CancelModal order={o} />)}>Cancelar</button>}
          </div></>}
      </article>);
  };
  const filters: [FS, string, string][] = [['todos', 'Todos', ''], ...cols.map(s => [s, STATUS[s].n, STATUS[s].c] as [FS, string, string]), ['cancelado', 'Cancelados', STATUS.cancelado.c]];
  return <>
    <div className="chips scrollx" style={{ marginBottom: 10 }} role="group" aria-label="Filtrar por status">
      {filters.map(([k, n, c]) => <button key={k} className={'chip' + (c ? ' st' : '') + (fs === k ? ' on' : '')} style={{ '--c': c } as CSSProperties} onClick={() => setFs(k)}>
        {n} ({k === 'todos' ? orders.filter(o => o.status !== 'cancelado').length : cnt(k as Status)})</button>)}
    </div>
    <div className={'kb' + (all ? '' : ' one')}>
      {shown.map(s => {
        let l = orders.filter(o => o.status === s);
        if (s === 'entregue' || s === 'cancelado') l = l.slice().reverse();
        if (all && s === 'entregue') l = l.slice(0, 6);
        return <section key={s}>
          <div className="colh" style={{ background: STATUS[s].c }}>{STATUS[s].n}<span>{cnt(s)}</span></div>
          <div className="tks">{l.length ? l.map(o => <Ticket key={o.id} o={o} />) : <Empty>Nada aqui.</Empty>}</div>
        </section>;
      })}
    </div>
  </>;
}

/* ======================= COBRANÇA ======================= */
function Cobranca({ orders, sel, setSel }: { orders: Order[]; sel: string | null; setSel: (id: string | null) => void }) {
  const { cfg, ui, user, products } = useApp();
  const [m, setM] = useState('Dinheiro');
  const [recv, setRecv] = useState('');
  const [qr, setQr] = useState('');
  const [busy, setBusy] = useState(false);
  const o = orders.find(x => x.id === sel) || null;
  const t = o ? orderTotal(o) : 0;
  const payload = o && m === 'PIX' ? pixPayload(cfg.pix, t, `LALIN${o.day.replace(/-/g, '')}N${o.num}`) : '';
  useEffect(() => { setQr(''); if (payload) QRCode.toDataURL(payload, { margin: 1, width: 440 }).then(setQr).catch(() => setQr('')); }, [payload]);
  useEffect(() => { setRecv(''); }, [sel]);
  const r = num(recv);
  const pay = async () => {
    if (!o) return;
    if (m === 'Dinheiro' && r < t) return ui.toast('Valor recebido menor que o total');
    setBusy(true);
    try {
      const p = await payOrder(o, m, m === 'Dinheiro' ? r : t, user, products);
      ui.toast(`Pedido nº ${o.num} pago` + (p.change > 0 ? ` · troco ${brl(p.change)}` : ''));
      setSel(null); setM('Dinheiro');
    } catch (e) { ui.toast('Erro: ' + (e as Error).message); }
    setBusy(false);
  };
  const copy = () => navigator.clipboard?.writeText(payload).then(() => ui.toast('Código PIX copiado'), () => ui.toast('Não foi possível copiar'));
  return (
    <div className="paygrid">
      <div className="card"><h2>A cobrar</h2>
        <div className="olist">{orders.length ? orders.map(x => (
          <button key={x.id} className={x.id === sel ? 'on' : ''} onClick={() => { setSel(x.id); setM('Dinheiro'); }}>
            <span><b>nº {x.num} · {x.client}</b><br /><span className="mute">{x.items.length} {x.items.length > 1 ? 'itens' : 'item'} · {STATUS[x.status].n} · {ML[x.mode]}</span></span>
            <b>{brl(orderTotal(x))}</b></button>)) : <Empty>Nenhum pedido a cobrar.</Empty>}</div>
      </div>
      <div className="card">{!o ? <Empty>Selecione um pedido para cobrar.</Empty> : <>
        <div className="row sb"><h2 style={{ margin: 0 }}>Pedido nº {o.num} · {o.client}</h2><span className="bd y">{STATUS[o.status].n}</span></div>
        <ul style={{ paddingLeft: 18 }}>{o.items.map((i, k) => <li key={k}>{i.qty}× {i.name} — {brl(i.qty * i.price)}</li>)}</ul>
        <div className="row sb"><span className="mute">Valor total</span><span className="big">{brl(t)}</span></div>
        <h3>Forma de pagamento</h3>
        <div className="chips">{cfg.pays.filter(x => isOn(cfg, 'pays', x)).map(x => <button key={x} className={'chip' + (x === m ? ' on' : '')} onClick={() => setM(x)}>{x}</button>)}</div>
        <div style={{ marginTop: 14 }}>
          {m === 'Dinheiro' ? <>
            <label>Valor recebido<input type="number" inputMode="decimal" step="0.01" value={recv} onChange={e => setRecv(e.target.value)} placeholder="0,00" /></label>
            <div className="chips" style={{ marginTop: 8 }}>{([['Exato', t], ['R$ 20', 20], ['R$ 50', 50], ['R$ 100', 100], ['R$ 200', 200]] as [string, number][]).filter(x => x[1] >= t).map(([l, v]) =>
              <button key={l} className="chip" onClick={() => setRecv(String(v))}>{l}</button>)}</div>
            {recv !== '' && <div className={'troco' + (r < t ? ' neg' : '')}><span>{r < t ? 'Faltam' : 'Troco'}</span><span className="big" style={{ fontSize: 34 }}>{brl(Math.abs(r - t))}</span></div>}
          </> : m === 'PIX' ? (
            <div className="qr">{qr ? <img src={qr} alt="QR Code PIX" /> : <div className="mute">Gerando QR…</div>}
              <div><label>PIX copia e cola<textarea readOnly value={payload} /></label>
                <button className="btn" style={{ marginTop: 8 }} onClick={copy}>Copiar código</button>
                <p className="mute">Chave {cfg.pix.key} · {cfg.pix.name} · valor já preenchido. Confira o recebimento no app do banco antes de confirmar.</p></div></div>
          ) : <div className="note">Passe <b>{brl(t)}</b> no {m.toLowerCase()} na maquininha e confirme abaixo.</div>}
        </div>
        <button className="btn p wide" style={{ marginTop: 14 }} disabled={busy} onClick={pay}>Confirmar pagamento</button>
        {o.phone && <p className="mute" style={{ marginTop: 10 }}>Cliente com WhatsApp: {o.phone}</p>}
      </>}</div>
    </div>
  );
}

