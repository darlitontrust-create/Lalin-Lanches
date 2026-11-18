import { useRef, useState } from 'react';
import { useApp } from '../store';
import { add, commit, patch, put, remove, type Op } from '../db';
import { menuOps } from '../seed';
import type { Coded, Config, Ingredient, Product } from '../types';
import { STATUS, abbr, brl, col, dfull, ds, exportXlsx, genCode, nm, num, pct, readXlsx } from '../utils';
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
        <td><b>{p.name}</b>{p.ingr.length > 0 && <><br /><span className="mute">{p.ingr.length} ingredientes · {p.ingr.filter(x => x.r).length} removíveis</span></>}</td>
        <td>{nm(cfg.classes, p.cls)}</td><td className="n">{brl(p.cost)}</td><td className="n">{p.price ? brl(p.price) : '—'}</td><td className="n">{mg(p)}</td>
        <td><button className={'chip' + (p.active ? ' on' : '')} style={{ minHeight: 32 }} onClick={() => patch('products', p.id, { active: !p.active })}>{p.active ? 'Ativo' : 'Inativo'}</button></td>
        <td><button className="btn sm" onClick={() => ui.modal(<ProductModal p={p} />)}>Editar</button></td></tr>)}</tbody></table></div>
      : products.length ? <Empty>Nada encontrado.</Empty> : null}
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
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof e, v: string | boolean) => setE({ ...e, [k]: v });
  const code = isNew ? genCode(products, e.type, e.cat, e.cls) : p!.code;
  const price = num(e.price), cost = num(e.cost);
  const close = () => ui.modal(null);
  const opts = (a: Coded[]) => a.map(x => <option key={x.c} value={x.c}>{x.n} ({x.c})</option>);
  const save = async () => {
    if (!e.name.trim()) return ui.toast('Informe o nome do produto');
    setBusy(true);
    const data = { name: e.name.trim(), desc: e.desc.trim(), unit: e.unit, min: num(e.min), cost, price, active: e.active, ingr: e.type === 'RV' ? ingr : [] };
    try {
      if (isNew) await add('products', { ...data, code, type: e.type, cat: e.cat, cls: e.cls, stock: num(e.stock), unavailable: false, prices: [{ v: price, from: e.vg }] });
      else await patch('products', p!.id, { ...data, ...(price !== p!.price ? { prices: [...(p!.prices || []), { v: price, from: e.vg }] } : {}) });
      ui.toast(isNew ? 'Produto cadastrado' : 'Produto atualizado'); close();
    } catch (er) { ui.toast('Erro: ' + (er as Error).message); setBusy(false); }
  };
  const del = async () => {
    if (!(await ui.confirm({ title: `Excluir ${p!.name}?`, text: 'Prefira inativar: o histórico de vendas continua com o nome do produto.', ok: 'Excluir' }))) return ui.modal(<ProductModal p={p} />);
    await remove('products', p!.id); ui.toast('Produto excluído');
  };
  return <>
    <ModalHead title={isNew ? 'Novo produto' : 'Editar produto'} onClose={close} />
    <p>Código <code style={{ fontSize: 15, fontWeight: 700 }}>{code}</code> <span className="mute">· automático: tipo.categoria.classe.sequencial</span></p>
    <div className="fg">
      <label className="w2">Nome<input value={e.name} onChange={x => set('name', x.target.value)} autoFocus /></label>
      <label className="w2">Descrição<input value={e.desc} onChange={x => set('desc', x.target.value)} /></label>
      <label>Tipo<select value={e.type} disabled={!isNew} onChange={x => set('type', x.target.value)}>{opts(cfg.types)}</select></label>
      <label>Categoria<select value={e.cat} disabled={!isNew} onChange={x => set('cat', x.target.value)}>{opts(cfg.cats)}</select></label>
      <label>Classe<select value={e.cls} disabled={!isNew} onChange={x => set('cls', x.target.value)}>{opts(cfg.classes)}</select></label>
      <label>Unidade<select value={e.unit} onChange={x => set('unit', x.target.value)}>{cfg.units.map(u => <option key={u}>{u}</option>)}</select></label>
      <label>Estoque mínimo<input type="number" inputMode="decimal" value={e.min} onChange={x => set('min', x.target.value)} /></label>
      <label>Estoque atual<input type="number" inputMode="decimal" value={e.stock} disabled={!isNew} title={isNew ? '' : 'Altere pelo módulo Estoque'} onChange={x => set('stock', x.target.value)} /></label>
      <label>Custo unitário<input type="number" step="0.01" inputMode="decimal" value={e.cost} onChange={x => set('cost', x.target.value)} /></label>
      <label>Preço de venda<input type="number" step="0.01" inputMode="decimal" value={e.price} onChange={x => set('price', x.target.value)} /></label>
      <label>Margem<input readOnly value={price > 0 ? pct((price - cost) / price) : '—'} /></label>
      <label>Vigência do preço<input type="date" value={e.vg} onChange={x => set('vg', x.target.value)} /></label>
      <label className="ck"><input type="checkbox" checked={e.active} onChange={x => set('active', x.target.checked)} /> Produto ativo</label>
    </div>
    {e.type === 'RV' && <>
      <h3>Ingredientes</h3>
      {ingr.length ? ingr.map((x, i) => <div key={i} className="row sb li" style={{ padding: '6px 0' }}><span>{x.n}</span><span className="row">
        <label className="ck"><input type="checkbox" checked={x.r} onChange={ev => setIngr(ingr.map((y, k) => (k === i ? { ...y, r: ev.target.checked } : y)))} /> Cliente pode retirar</label>
        <button className="btn sm" onClick={() => setIngr(ingr.filter((_, k) => k !== i))}>Remover</button></span></div>) : <p className="mute">Sem ingredientes cadastrados.</p>}
      <div className="row" style={{ flexWrap: 'nowrap', marginTop: 8 }}><input value={ni} onChange={x => setNi(x.target.value)} placeholder="Novo ingrediente" onKeyDown={x => { if (x.key === 'Enter' && ni.trim()) { setIngr([...ingr, { n: ni.trim(), r: true }]); setNi(''); } }} />
        <button className="btn" onClick={() => { if (ni.trim()) { setIngr([...ingr, { n: ni.trim(), r: true }]); setNi(''); } }}>Adicionar</button></div>
    </>}
    {!isNew && <><h3>Histórico de preços</h3>{(p!.prices || []).slice().reverse().map((x, i) => <p key={i} style={{ margin: '2px 0' }}>{brl(x.v)} <span className="mute">vigente desde {dfull(x.from)}</span></p>)}</>}
    <div className="row end">{!isNew && <button className="btn danger" onClick={del} style={{ marginRight: 'auto' }}>Excluir</button>}
      <button className="btn" onClick={close}>Cancelar</button><button className="btn p" disabled={busy} onClick={save}>Salvar produto</button></div>
  </>;
}

/* ---------------- Tabelas auxiliares ---------------- */
function CodedList({ k, title, len }: { k: 'types' | 'cats' | 'classes'; title: string; len: number }) {
  const { cfg, products, ui } = useApp();
  const [v, setV] = useState('');
  const arr = cfg[k];
  const field = k === 'types' ? 'type' : k === 'cats' ? 'cat' : 'cls';
  const addIt = async () => {
    const n = v.trim(); if (!n) return;
    let c = abbr(n, len) || 'X'; const base = c; let i = 1;
    while (arr.some(x => x.c === c)) c = base.slice(0, len - 1) + i++;
    await saveCfg({ [k]: [...arr, { c, n }] }); setV(''); ui.toast(`Adicionado: ${n} (${c})`);
  };
  const del = async (x: Coded) => {
    if (products.some(p => (p as unknown as Record<string, string>)[field] === x.c)) return ui.toast(`${x.n} está em uso por produtos`);
    await saveCfg({ [k]: arr.filter(y => y.c !== x.c) });
  };
  return <div className="card"><h2>{title}</h2>
    <div className="chips">{arr.map(x => <span key={x.c} className="chip">{x.n} <span className="mute">{x.c}</span><button className="btn sm" style={{ minHeight: 26, padding: '0 6px' }} aria-label={'Remover ' + x.n} onClick={() => del(x)}>×</button></span>)}</div>
    <div className="row" style={{ marginTop: 12, flexWrap: 'nowrap' }}><input value={v} onChange={e => setV(e.target.value)} placeholder="Novo item" /><button className="btn" onClick={addIt}>Adicionar</button></div></div>;
}
function StrList({ k, title, ph }: { k: 'units' | 'pays' | 'lossReasons' | 'expenseCats' | 'investCats'; title: string; ph: string }) {
  const { cfg, ui } = useApp();
  const [v, setV] = useState('');
  const arr = cfg[k];
  const addIt = async () => { const n = v.trim(); if (!n || arr.includes(n)) return; await saveCfg({ [k]: [...arr, n] }); setV(''); ui.toast('Adicionado: ' + n); };
  return <div className="card"><h2>{title}</h2>
    <div className="chips">{arr.map(x => <span key={x} className="chip">{x}<button className="btn sm" style={{ minHeight: 26, padding: '0 6px' }} aria-label={'Remover ' + x} onClick={() => saveCfg({ [k]: arr.filter(y => y !== x) })}>×</button></span>)}</div>
    <div className="row" style={{ marginTop: 12, flexWrap: 'nowrap' }}><input value={v} onChange={e => setV(e.target.value)} placeholder={ph} /><button className="btn" onClick={addIt}>Adicionar</button></div></div>;
}
function Tabelas() {
  return <div className="g2">
    <CodedList k="types" title="Tipos de produto" len={2} />
    <CodedList k="cats" title="Categorias" len={3} />
    <CodedList k="classes" title="Classes" len={3} />
    <StrList k="units" title="Unidades de medida" ph="Nova unidade" />
    <StrList k="lossReasons" title="Motivos de perda" ph="Novo motivo" />
  </div>;
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
  return <>
    <p className="mute">Use <b>{'{nome}'}</b> para o primeiro nome do cliente, <b>{'{numero}'}</b> para o nº do pedido e <b>{'{status}'}</b> para o status. A mensagem abre no WhatsApp do aparelho, pronta para enviar.</p>
    <div className="fg" style={{ gridTemplateColumns: '1fr' }}>
      {(Object.keys(STATUS) as (keyof typeof STATUS)[]).map(s => <label key={s}>{STATUS[s].n}<textarea value={m[s] || ''} onChange={e => setM({ ...m, [s]: e.target.value })} /></label>)}
    </div>
    <div className="row end"><button className="btn p" onClick={async () => { await saveCfg({ msgs: m }); ui.toast('Mensagens salvas'); }}>Salvar mensagens</button></div>
  </>;
}
