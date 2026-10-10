// ヘロン求積 専用 Service Worker（heron フォルダ内だけを担当）
const CACHE = 'heron-v1';
const FILES = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  // 自分の古いキャッシュ（heron- で始まるもの）だけ整理する。他アプリのキャッシュには触らない
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('heron-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// キャッシュ優先：電波が弱くても即起動。裏で最新版を取りに行き、次回起動時に反映
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || !url.href.startsWith(self.registration.scope)) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = req.mode === 'navigate' ? new URL('index.html', self.registration.scope).href : req;
    const hit = await cache.match(key, { ignoreSearch: true });
    const net = fetch(req)
      .then(r => { if (r && r.ok) cache.put(key, r.clone()); return r; })
      .catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const r = await net;
    return r || new Response('オフラインです。一度電波のある所で開いてください。',
      { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  })());
});
