// Service worker do Lalin Lanches: permite instalar como app e abrir mesmo com internet instável.
// Os dados (pedidos, estoque...) ficam no Firestore, que tem cache próprio; aqui só guardamos os arquivos do site.
const CACHE = 'lalin-v4';
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', './index.html'])).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // Firebase e Google passam direto
  // arquivos com nome versionado (assets/…-hash.js/css) nunca mudam: usa o guardado
  if (url.pathname.includes('/assets/')) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)); } return r; })));
    return;
  }
  // página, manifesto e ícones: sempre busca a versão nova; sem internet, usa a guardada
  e.respondWith(fetch(req, { cache: 'no-cache' }).then(r => {
    if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(req.mode === 'navigate' ? './index.html' : req, c)); }
    return r;
  }).catch(() => caches.match(req.mode === 'navigate' ? './index.html' : req)));
});
