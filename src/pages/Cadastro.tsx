import { useRef, useState } from 'react';
import { useApp } from '../store';
import { commit, patch, put, type Op } from '../db';
import { menuOps } from '../seed';
import type { Coded, Config, Ingredient, Product } from '../types';
import { STATUS, abbr, brl, col, dfull, ds, exportXlsx, genCode, isOn, newId, nf, nm, num, pct, readXlsx } from '../utils';
import { Empty, ModalHead, Tabs } from '../components/ui';

type Tab = 'prod' | 'tab' | 'pag' | 'desp' | 'msg';

export default function Cadastro() {
  const [tab, setTab] = useState<Tab>('prod');
  return <div className="card">
    <Tabs value={tab} onChange={setTab} items={[['prod', 'Produtos'], ['tab', 'Tipos, categorias, classes e unidades'], ['pag', 'Pagamentos e PIX'], ['desp', 'Categorias de despesa'], ['msg', 'Mensagens WhatsApp']]} />
    {tab === 'prod' && <Produtos />}
    {tab === 'tab' && <Tabelas />}
    {tab === 'pag' && <Pagamentos />}
    {tab === 'desp' && <CatDespesas />}
    {tab === 'msg' && <Mensagens />}
  </div>;
}

const saveCfg = (data: Partial<Config>) => put('config', 'app', data as Record<string, unknown>);

/* ---------------- Produtos ---------------- */
function Produtos() {
  const { products, cfg, ui } = useApp();
  const [f, setF] = useState('');
  const [q, setQ] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const l = products.filter(p => (!f || p.type === f) && (!q || (p.name + p.code).toLowerCase().includes(q.toLowerCase())));
  const mg = (p: Product) => (p.price > 0 ? pct((p.price - p.cost) / p.price) : '—');
  const ingrTxt = (p: Product) => p.ingr.map(i => i.n + (i.r ? '*' : '')).join('; ');

  const exp = () => exportXlsx('cadastro', {
    Produtos: [['Código', 'Nome', 'Descrição', 'Tipo', 'Categoria', 'Classe', 'Unidade', 'Custo', 'Preço', 'Margem', 'Estoque', 'Mínimo', 'Ativo', 'Indisponível', 'Ingredientes (* = pode retirar)'],
      ...products.map(p => [p.code, p.name, p.desc, p.type, p.cat, p.cls, p.unit, p.cost, p.price, mg(p), p.stock, p.min, p.active ? 'Sim' : 'Não', p.unavailable ? 'Sim' : 'Não', ingrTxt(p)])],
    Tipos: [['Código', 'Nome'], ...cfg.types.map(x => [x.c, x.n])],
    Categorias: [['Código', 'Nome'], ...cfg.cats.map(x => [x.c, x.n])],
    Classes: [['Código', 'Nome'], ...cfg.classes.map(x => [x.c, x.n])],
    Unidades: [['Unidade'], ...cfg.units.map(x => [x])],
    'Formas de pagamento': [['Forma'], ...cfg.pays.map(x => [x])],
    'Histórico de preços': [['Código', 'Produto', 'Preço', 'Vigente desde'], ...products.flatMap(p => (p.prices || []).map(x => [p.code, p.name, x.v, dfull(x.from)]))]
  });
  const importar = async (file: File) => {
    try {
      const rows = await readXlsx(file);
      const all = [...products];
      const ops: Op[] = [];
      let nNew = 0, nUpd = 0;
      for (const r of rows) {
        const name = String(col(r, 'Nome', 'Produto')).trim(); if (!name) continue;
        const code = String(col(r, 'Código', 'Codigo')).trim();
        const ex = all.find(p => (code && p.code === code) || p.name.toLowerCase() === name.toLowerCase());
        const ingr = String(col(r, 'Ingredientes (* = pode retirar)', 'Ingredientes')).split(/[;,]/).map(s => s.trim()).filter(Boolean).map(s => ({ n: s.replace('*', '').trim(), r: s.includes('*') }));
        const base = {
          name, desc: String(col(r, 'Descrição', 'Descricao')), unit: String(col(r, 'Unidade') || 'Unidade'),
          cost: num(col(r, 'Custo', 'Custo unitário') as string), price: num(col(r, 'Preço', 'Preco', 'Preço de venda') as string),
          min: num(col(r, 'Mínimo', 'Minimo', 'Estoque mínimo') as string), ...(ingr.length ? { ingr } : {})
        };
        if (ex) { ops.push({ op: 'update', path: 'products', id: ex.id, data: base }); nUpd++; continue; }
        const type = String(col(r, 'Tipo') || 'RV').toUpperCase(), cat = String(col(r, 'Categoria') || 'COM').toUpperCase(), cls = String(col(r, 'Classe') || 'LAN').toUpperCase();
        const newCode = genCode(all, type, cat, cls);
        all.push({ id: 'tmp' + nNew, code: newCode } as Product);
        ops.push({ op: 'add', path: 'products', data: { ...base, ingr, code: newCode, type, cat, cls, stock: num(col(r, 'Estoque', 'Estoque atual') as string), active: true, unavailable: false, prices: [{ v: base.price, from: ds() }] } });
        nNew++;
      }
      if (!ops.length) return ui.toast('Nenhuma linha válida encontrada');
      await commit(ops); ui.toast(`${nNew} produto(s) novo(s) e ${nUpd} atualizado(s)`);
    } catch (e) { ui.toast('Erro ao importar: ' + (e as Error).message); }
  };
  const loadMenu = async () => {
    if (!(await ui.confirm({ title: 'Carregar cardápio inicial?', text: 'Adiciona os 21 produtos do cardápio da Lalin Lanches com estoque zerado.', ok: 'Carregar' }))) return;
    await commit(menuOps()); ui.toast('Cardápio carregado');
  };

  return <>
    <div className="row sb">
      <div className="chips"><button className={'chip' + (!f ? ' on' : '')} onClick={() => setF('')}>Todos</button>
        {cfg.types.map(t => <button key={t.c} className={'chip' + (f === t.c ? ' on' : '')} onClick={() => setF(t.c)}>{t.n}</button>)}</div>
      <div className="row">
        <input ref={file} type="file" accept=".xlsx,.xls,.csv" hidden onChange={e => { const x = e.target.files?.[0]; if (x) importar(x); e.target.value = ''; }} />
        <button className="btn sm" onClick={() => file.current?.click()}>Importar XLSX</button>
        <button className="btn sm" onClick={exp}>Exportar XLSX</button>
        <button className="btn p" onClick={() => ui.modal(<ProductModal />)}>Novo produto</button>
      </div>
    </div>
    <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nome ou código…" style={{ marginTop: 10 }} aria-label="Buscar produto" />
    {!products.length && <div className="note" style={{ marginTop: 12 }}>Nenhum produto cadastrado. <button className="btn sm" onClick={loadMenu}>Carregar cardápio inicial</button></div>}
    {l.length ? <div className="scroll" style={{ marginTop: 10 }}><table className="stack"><thead><tr><th>Código</th><th>Nome</th><th>Classe</th><th className="n">Custo</th><th className="n">Preço</th><th className="n">Margem</th><th>Status</th><th></th></tr></thead>
      <tbody>{l.map(p => <tr key={p.id}><td><code>{p.code}</code></td>
        <td><b>{p.name}</b>{p.ingr.length > 0 && <><br /><span className="mute">{p.ingr.length} ingredientes · {p.ingr.filter(x => x.r).length} removíveis</span></>}
          {p.comp?.length ? <><br /><span className="mute">Baixa: {p.comp.map(c => { const m = products.find(x => x.id === c.pid); return `${nf(c.qty)} ${m?.unit || ''} ${m?.name || '?'}`; }).join(' + ')}</span></> : null}
          {p.type !== 'RV' && products.some(x => x.comp?.some(c => c.pid === p.id)) && <><br /><span className="mute">Vinculado a: {products.filter(x => x.comp?.some(c => c.pid === p.id)).map(x => x.name).join(', ')}</span></>}</td>
        <td>{nm(cfg.classes, p.cls)}</td><td className="n">{brl(p.cost)}</td><td className="n">{p.price ? brl(p.price) : '—'}</td><td className="n">{mg(p)}</td>
        <td><button className={'chip' + (p.active ? ' on' : '')} style={{ minHeight: 32 }} onClick={() => patch('products', p.id, { active: !p.active })}>{p.active ? 'Ativo' : 'Inativo'}</button></td>
        <td><button className="btn sm" onClick={() => ui.modal(<ProductModal p={p} />)}>Editar</button></td></tr>)}</tbody></table></div>
      : products.length ? <Empty>Nada encontrado.</Empty> : null}
  </>;
}

type LinkRow = { pid: string; qty: string };
/** Linhas de vínculo produto + quantidade (fora do modal para não perder o foco ao digitar). */
function LinkRows({ rows, setRows, pool, label }: { rows: LinkRow[]; setRows: (r: LinkRow[]) => void; pool: Product[]; label: (pid: string) => string }) {
  return <>
    {rows.map((r, i) => <div key={i} className="row li" style={{ flexWrap: 'nowrap', padding: '6px 0' }}>
      <select value={r.pid} onChange={x => setRows(rows.map((y, k) => (k === i ? { ...y, pid: x.target.value } : y)))} aria-label="Produto">
        <option value="">Escolha…</option>{pool.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
      <input type="number" inputMode="decimal" step="0.001" value={r.qty} onChange={x => setRows(rows.map((y, k) => (k === i ? { ...y, qty: x.target.value } : y)))} style={{ width: 110 }} aria-label="Quantidade" />
      <span className="mute" style={{ minWidth: 70 }}>{label(r.pid)}</span>
      <button className="btn sm" onClick={() => setRows(rows.filter((_, k) => k !== i))} aria-label="Remover vínculo">×</button>
    </div>)}
    <button className="btn sm" style={{ marginTop: 6 }} onClick={() => setRows([...rows, { pid: '', qty: '1' }])}>+ Vincular produto</button>
  </>;
}

function ProductModal({ p }: { p?: Product }) {
  const { cfg, products, ui } = useApp();
  const isNew = !p;
  const [e, setE] = useState({
    name: p?.name || '', desc: p?.desc || '', type: p?.type || 'RV', cat: p?.cat || 'COM', cls: p?.cls || 'LAN', unit: p?.unit || 'Unidade',
    min: String(p?.min ?? 0), stock: String(p?.stock ?? 0), cost: String(p?.cost ?? 0), price: String(p?.price ?? 0), vg: ds(), active: p?.active ?? true
  });
  const [ingr, setIngr] = useState<Ingredient[]>(p?.ingr.map(x => ({ ...x })) || []);
  const [ni, setNi] = useState('');
  // revenda: o que este produto baixa de matéria-prima a cada unidade
  const [comp, setComp] = useState<{ pid: string; qty: string }[]>((p?.comp || []).map(c => ({ pid: c.pid, qty: String(c.qty) })));
  // matéria-prima: em quais produtos de revenda ela é baixada (e quanto por unidade vendida)
  const [links, setLinks] = useState<{ pid: string; qty: string }[]>(p ? products.filter(x => x.comp?.some(c => c.pid === p.id)).map(x => ({ pid: x.id, qty: String(x.comp!.find(c => c.pid === p.id)!.qty) })) : []);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof e, v: string | boolean) => setE({ ...e, [k]: v });
  const others = products.filter(x => x.id !== p?.id);
  const moved = !isNew && (e.type !== p!.type || e.cat !== p!.cat || e.cls !== p!.cls);
  const code = isNew || moved ? genCode(others, e.type, e.cat, e.cls) : p!.code;
  const price = num(e.price), cost = num(e.cost);
  const isRV = e.type === 'RV';
  const compCost = comp.reduce((s, c) => s + num(c.qty) * (products.find(x => x.id === c.pid)?.cost || 0), 0);
  const close = () => ui.modal(null);
  const opts = (a: Coded[], list: string, cur: string) => a.filter(x => isOn(cfg, list, x.c) || x.c === cur).map(x => <option key={x.c} value={x.c}>{x.n} ({x.c})</option>);
  const unitOf = (pid: string) => products.find(x => x.id === pid)?.unit || '';

  const save = async () => {
    if (!e.name.trim()) return ui.toast('Informe o nome do produto');
    const cl = comp.filter(c => c.pid && num(c.qty) > 0).map(c => ({ pid: c.pid, qty: num(c.qty) }));
    const ll = links.filter(c => c.pid && num(c.qty) > 0).map(c => ({ pid: c.pid, qty: num(c.qty) }));
    setBusy(true);
    const id = p?.id || newId();
    const data = { name: e.name.trim(), desc: e.desc.trim(), unit: e.unit, min: num(e.min), cost, price, active: e.active, ingr: isRV ? ingr : [], comp: isRV ? cl : [],
      type: e.type, cat: e.cat, cls: e.cls, code };
    const ops: Op[] = [];
    if (isNew) ops.push({ op: 'set', path: 'products', id, data: { ...data, stock: num(e.stock), unavailable: false, prices: [{ v: price, from: e.vg }] } });
    else ops.push({ op: 'update', path: 'products', id, data: { ...data, ...(price !== p!.price ? { prices: [...(p!.prices || []), { v: price, from: e.vg }] } : {}),
      ...(moved ? { codes: [...(p!.codes || []), p!.code] } : {}) } });
    if (!isRV) {
      // grava o vínculo dentro de cada produto de revenda afetado
      for (const rv of products.filter(x => x.type === 'RV')) {
        const want = ll.find(l => l.pid === rv.id)?.qty || 0;
        const has = rv.comp?.find(c => c.pid === id)?.qty || 0;
        if (want === has) continue;
        const nc = (rv.comp || []).filter(c => c.pid !== id);
        if (want > 0) nc.push({ pid: id, qty: want });
        ops.push({ op: 'update', path: 'products', id: rv.id, data: { comp: nc } });
      }
    }
    try {
      await commit(ops);
      ui.toast(isNew ? 'Produto cadastrado' : moved ? `Produto atualizado · novo código ${code}` : 'Produto atualizado'); close();
    } catch (er) { ui.toast('Erro: ' + (er as Error).message); setBusy(false); }
  };

  return <>
    <ModalHead title={isNew ? 'Novo produto' : 'Editar produto'} onClose={close} />
    <p>Código <code style={{ fontSize: 15, fontWeight: 700 }}>{code}</code> <span className="mute">· automático: tipo.categoria.classe.sequencial</span>
      {moved && <><br /><span className="note" style={{ display: 'inline-block', marginTop: 6, padding: '4px 10px' }}>A classificação mudou: o código passa de <b>{p!.code}</b> para <b>{code}</b>. O código antigo fica guardado no histórico.</span></>}</p>
    <div className="fg">
      <label className="w2">Nome<input value={e.name} onChange={x => set('name', x.target.value)} autoFocus /></label>
      <label className="w2">Descrição<input value={e.desc} onChange={x => set('desc', x.target.value)} /></label>
      <label>Tipo<select value={e.type} onChange={x => set('type', x.target.value)}>{opts(cfg.types, 'types', e.type)}</select></label>
      <label>Categoria<select value={e.cat} onChange={x => set('cat', x.target.value)}>{opts(cfg.cats, 'cats', e.cat)}</select></label>
      <label>Classe<select value={e.cls} onChange={x => set('cls', x.target.value)}>{opts(cfg.classes, 'classes', e.cls)}</select></label>
      <label>Unidade<select value={e.unit} onChange={x => set('unit', x.target.value)}>{cfg.units.filter(u => isOn(cfg, 'units', u) || u === e.unit).map(u => <option key={u}>{u}</option>)}</select></label>
      <label>Estoque mínimo<input type="number" inputMode="decimal" value={e.min} onChange={x => set('min', x.target.value)} /></label>
      <label>Estoque atual<input type="number" inputMode="decimal" value={e.stock} disabled={!isNew} title={isNew ? '' : 'Altere pelo módulo Estoque'} onChange={x => set('stock', x.target.value)} /></label>
      <label>Custo unitário<input type="number" step="0.01" inputMode="decimal" value={e.cost} onChange={x => set('cost', x.target.value)} /></label>
      <label>Preço de venda<input type="number" step="0.01" inputMode="decimal" value={e.price} onChange={x => set('price', x.target.value)} /></label>
      <label>Margem<input readOnly value={price > 0 ? pct((price - cost) / price) : '—'} /></label>
      <label>Vigência do preço<input type="date" value={e.vg} onChange={x => set('vg', x.target.value)} /></label>
      <label className="ck"><input type="checkbox" checked={e.active} onChange={x => set('active', x.target.checked)} /> Produto ativo</label>
    </div>
    {isRV ? <>
      <h3>Composição · baixa de estoque</h3>
      <p className="mute" style={{ marginTop: -4 }}>A cada unidade vendida ou perdida deste produto, o estoque destes itens também é baixado (ex.: 1 Pão com pernil baixa 1 Pão de sal e 1 porção de Pernil).</p>
      <LinkRows rows={comp} setRows={setComp} pool={others.filter(x => x.type !== 'RV')} label={pid => (pid ? unitOf(pid) + ' por un.' : '')} />
      {comp.some(c => c.pid) && <p className="mute">Custo da composição: <b>{brl(compCost)}</b> por unidade <button className="btn sm" onClick={() => set('cost', compCost.toFixed(2))}>Usar como custo</button></p>}
      <h3>Ingredientes (pedido)</h3>
      {ingr.length ? ingr.map((x, i) => <div key={i} className="row sb li" style={{ padding: '6px 0' }}><span>{x.n}</span><span className="row">
        <label className="ck"><input type="checkbox" checked={x.r} onChange={ev => setIngr(ingr.map((y, k) => (k === i ? { ...y, r: ev.target.checked } : y)))} /> Cliente pode retirar</label>
        <button className="btn sm" onClick={() => setIngr(ingr.filter((_, k) => k !== i))}>Remover</button></span></div>) : <p className="mute">Sem ingredientes cadastrados.</p>}
      <div className="row" style={{ flexWrap: 'nowrap', marginTop: 8 }}><input value={ni} onChange={x => setNi(x.target.value)} placeholder="Novo ingrediente" onKeyDown={x => { if (x.key === 'Enter' && ni.trim()) { setIngr([...ingr, { n: ni.trim(), r: true }]); setNi(''); } }} />
        <button className="btn" onClick={() => { if (ni.trim()) { setIngr([...ingr, { n: ni.trim(), r: true }]); setNi(''); } }}>Adicionar</button></div>
    </> : <>
      <h3>Vincular a produtos de revenda</h3>
      <p className="mute" style={{ marginTop: -4 }}>Escolha os produtos de revenda que usam este item e quanto ({e.unit}) é baixado a cada unidade vendida ou perdida. Ex.: Pão com pernil → 1.</p>
      <LinkRows rows={links} setRows={setLinks} pool={products.filter(x => x.type === 'RV')} label={() => e.unit + ' por un.'} />
    </>}
    {!isNew && <><h3>Histórico de preços</h3>{(p!.prices || []).slice().reverse().map((x, i) => <p key={i} style={{ margin: '2px 0' }}>{brl(x.v)} <span className="mute">vigente desde {dfull(x.from)}</span></p>)}
      {p!.codes?.length ? <p className="mute">Códigos anteriores: {p!.codes.join(', ')}</p> : null}</>}
    <div className="row end">
      <button className="btn" onClick={close}>Cancelar</button><button className="btn p" disabled={busy} onClick={save}>Salvar produto</button></div>
  </>;
}

/* ---------------- Tabelas auxiliares ---------------- */
type ListKey = 'types' | 'cats' | 'classes' | 'units' | 'pays' | 'lossReasons' | 'expenseCats' | 'investCats' | 'delReasons';
/** Item de cadastro: toque no nome para alterar; o botão ao lado ativa/inativa (nada é apagado). */
function Item({ list, value, label, code }: { list: ListKey; value: string; label: string; code?: string }) {
  const { cfg, ui } = useApp();
  const on = isOn(cfg, list, value);
  const toggle = async () => {
    const off = cfg.off || [];
    const key = `${list}:${value}`;
    await saveCfg({ off: on ? [...off, key] : off.filter(k => k !== key) });
    ui.toast(`${label} ${on ? 'inativado' : 'reativado'}`);
  };
  return <span className={'chip'} style={{ opacity: on ? 1 : 0.55 }}>
    <button className="btn sm" style={{ minHeight: 26, padding: '0 4px', border: 0, background: 'none' }} title="Alterar nome" onClick={() => ui.modal(<RenameModal list={list} value={value} label={label} code={code} />)}>
      {on ? label : <s>{label}</s>}{code && <span className="mute">&nbsp;{code}</span>}</button>
    <button className="btn sm" style={{ minHeight: 26, padding: '0 8px', fontSize: 12 }} onClick={toggle}>{on ? 'Inativar' : 'Reativar'}</button>
  </span>;
}
function RenameModal({ list, value, label, code }: { list: ListKey; value: string; label: string; code?: string }) {
  const { cfg, ui } = useApp();
  const [v, setV] = useState(label);
  const close = () => ui.modal(null);
  const save = async () => {
    const n = v.trim(); if (!n || n === label) return close();
    if (code) {
      const arr = (cfg[list] as Coded[]).map(x => (x.c === code ? { ...x, n } : x));
      await saveCfg({ [list]: arr });
    } else {
      const arr = cfg[list] as string[];
      if (arr.includes(n)) return ui.toast('Já existe um item com esse nome');
      await saveCfg({ [list]: arr.map(x => (x === value ? n : x)), off: (cfg.off || []).map(k => (k === `${list}:${value}` ? `${list}:${n}` : k)) });
    }
    ui.toast('Alterado para ' + n); close();
  };
  return <>
    <ModalHead title={'Alterar ' + label} onClose={close} />
    {code && <p className="mute">O código <b>{code}</b> continua o mesmo (ele faz parte dos códigos dos produtos).</p>}
    {!code && <p className="mute">Lançamentos antigos continuam com o nome anterior.</p>}
    <label>Nome<input value={v} onChange={e => setV(e.target.value)} autoFocus onKeyDown={e => { if (e.key === 'Enter') save(); }} /></label>
    <div className="row end"><button className="btn" onClick={close}>Cancelar</button><button className="btn p" onClick={save}>Salvar</button></div>
  </>;
}
function CodedList({ k, title, len }: { k: 'types' | 'cats' | 'classes'; title: string; len: number }) {
  const { cfg, ui } = useApp();
  const [v, setV] = useState('');
  const arr = cfg[k];
  const addIt = async () => {
    const n = v.trim(); if (!n) return;
    let c = abbr(n, len) || 'X'; const base = c; let i = 1;
    while (arr.some(x => x.c === c)) c = base.slice(0, len - 1) + i++;
    await saveCfg({ [k]: [...arr, { c, n }] }); setV(''); ui.toast(`Adicionado: ${n} (${c})`);
  };
  const kc = cfg.kitchenCls || ['LAN', 'MAS'];
  return <div className="card"><h2>{title}</h2>
    <div className="chips">{arr.map(x => <Item key={x.c} list={k} value={x.c} label={x.n} code={x.c} />)}</div>
    {k === 'classes' && <>
      <h3>Vão para a fila da cozinha</h3>
      <div className="chips">{arr.map(x => <button key={x.c} className={'chip' + (kc.includes(x.c) ? ' on' : '')}
        onClick={() => saveCfg({ kitchenCls: kc.includes(x.c) ? kc.filter(c => c !== x.c) : [...kc, x.c] })}>{x.n}</button>)}</div>
      <p className="mute">Itens dessas classes entram na fila da cozinha. As demais (ex.: churrasquinho, bebidas) são servidas no balcão e aparecem só na comanda.</p>
    </>}
    <div className="row" style={{ marginTop: 12, flexWrap: 'nowrap' }}><input value={v} onChange={e => setV(e.target.value)} placeholder="Novo item" /><button className="btn" onClick={addIt}>Adicionar</button></div></div>;
}
function StrList({ k, title, ph }: { k: 'units' | 'pays' | 'lossReasons' | 'expenseCats' | 'investCats' | 'delReasons'; title: string; ph: string }) {
  const { cfg, ui } = useApp();
  const [v, setV] = useState('');
  const arr = cfg[k];
  const addIt = async () => { const n = v.trim(); if (!n || arr.includes(n)) return; await saveCfg({ [k]: [...arr, n] }); setV(''); ui.toast('Adicionado: ' + n); };
  return <div className="card"><h2>{title}</h2>
    <div className="chips">{arr.map(x => <Item key={x} list={k} value={x} label={x} />)}</div>
    <div className="row" style={{ marginTop: 12, flexWrap: 'nowrap' }}><input value={v} onChange={e => setV(e.target.value)} placeholder={ph} /><button className="btn" onClick={addIt}>Adicionar</button></div></div>;
}
function Tabelas() {
  return <><p className="mute" style={{ marginTop: 0 }}>Toque no nome para alterar. Itens inativos somem das listas de escolha, mas o histórico continua.</p><div className="g2">
    <CodedList k="types" title="Tipos de produto" len={2} />
    <CodedList k="cats" title="Categorias" len={3} />
    <CodedList k="classes" title="Classes" len={3} />
    <StrList k="units" title="Unidades de medida" ph="Nova unidade" />
    <StrList k="lossReasons" title="Motivos de perda" ph="Novo motivo" />
    <StrList k="delReasons" title="Motivos de exclusão" ph="Novo motivo" />
  </div></>;
}
function Pagamentos() {
  const { cfg, ui } = useApp();
  const [pix, setPix] = useState(cfg.pix);
  const [fee, setFee] = useState(String(cfg.cardFee));
  return <div className="g2">
    <StrList k="pays" title="Formas de pagamento" ph="Ex.: Fiado, Voucher" />
    <div className="card"><h2>Configuração PIX</h2>
      <div className="fg">
        <label className="w2">Chave PIX<input value={pix.key} onChange={e => setPix({ ...pix, key: e.target.value })} /></label>
        <label>Nome do favorecido<input value={pix.name} onChange={e => setPix({ ...pix, name: e.target.value })} /></label>
        <label>Cidade<input value={pix.city} onChange={e => setPix({ ...pix, city: e.target.value })} /></label>
        <label>Taxa média das maquininhas (%)<input type="number" step="0.01" inputMode="decimal" value={fee} onChange={e => setFee(e.target.value)} /></label>
      </div>
      <p className="mute">Chave de celular no formato +5531999999999; CPF/CNPJ só números; ou e-mail / chave aleatória.</p>
      <div className="row end"><button className="btn p" onClick={async () => { await saveCfg({ pix, cardFee: num(fee) }); ui.toast('Configuração salva'); }}>Salvar</button></div></div>
  </div>;
}
function CatDespesas() {
  return <div className="g2">
    <StrList k="expenseCats" title="Categorias de despesa" ph="Ex.: Contador, Seguro" />
    <StrList k="investCats" title="Categorias de investimento" ph="Ex.: Mobiliário" />
  </div>;
}
function Mensagens() {
  const { cfg, ui } = useApp();
  const [m, setM] = useState<Record<string, string>>({ ...cfg.msgs });
  const [wa, setWa] = useState(cfg.wa || { auto: false, on: [] });
  const tog = (s: string) => setWa({ ...wa, on: wa.on.includes(s) ? wa.on.filter(x => x !== s) : [...wa.on, s] });
  return <>
    <div className="card" style={{ marginBottom: 14 }}>
      <label className="ck" style={{ fontSize: 15 }}><input type="checkbox" checked={wa.auto} onChange={e => setWa({ ...wa, auto: e.target.checked })} /> Abrir o WhatsApp automaticamente quando o status do pedido mudar</label>
      <p className="mute">Vale para clientes que informaram o telefone. A conversa abre com a mensagem pronta; no WhatsApp Web ou no celular é só tocar em <b>Enviar</b>. Quando desligado, use o botão WhatsApp de cada pedido na fila.</p>
      <div className="chips">{(Object.keys(STATUS) as (keyof typeof STATUS)[]).map(s => <button key={s} disabled={!wa.auto} className={'chip' + (wa.on.includes(s) ? ' on' : '')} onClick={() => tog(s)}>{STATUS[s].n}</button>)}</div>
    </div>
    <p className="mute">Use <b>{'{nome}'}</b> para o primeiro nome do cliente, <b>{'{numero}'}</b> para o nº do pedido e <b>{'{status}'}</b> para o status.</p>
    <div className="fg" style={{ gridTemplateColumns: '1fr' }}>
      {(Object.keys(STATUS) as (keyof typeof STATUS)[]).map(s => <label key={s}>{STATUS[s].n}<textarea value={m[s] || ''} onChange={e => setM({ ...m, [s]: e.target.value })} /></label>)}
    </div>
    <div className="row end"><button className="btn p" onClick={async () => { await saveCfg({ msgs: m, wa }); ui.toast('Mensagens salvas'); }}>Salvar mensagens</button></div>
  </>;
}
