/* 水準測量野帳 Service Worker — オフライン動作用 */
const CACHE = "yacho-v4";

// インストール時に本体を先読みしてキャッシュ（電波が無くても起動できるように）
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable.png"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(PRECACHE.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 同じ場所に別のアプリ（他のhtml）が置かれていても影響しないよう、
// 野帳自身のファイルだけを扱う
const BASE = new URL("./", self.location).pathname;      // 例: /-/
const SELF_PAGES = [BASE, BASE + "index.html"];
const SELF_FILES = PRECACHE.map(p => new URL(p, self.location).pathname)
                           .concat([BASE + "sw.js"]);

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 外部リソースは素通し

  // 野帳以外のページ・ファイルには一切介入しない（素通し）
  const isSelfPage = SELF_PAGES.includes(url.pathname);
  if (req.mode === "navigate") {
    if (!isSelfPage) return;
  } else if (!SELF_FILES.includes(url.pathname)) {
    return;
  }

  // ページ本体：キャッシュ優先で即起動（電波が弱い現場でも待たされない）
  // 裏でネットから取り直し、次回起動時に最新版へ切り替わる
  if (req.mode === "navigate") {
    e.respondWith(
      caches.match("./index.html").then(hit => {
        const net = fetch(req).then(r => {
          if (r && r.status === 200) {
            const cp = r.clone();
            caches.open(CACHE).then(c => c.put("./index.html", cp));
          }
          return r;
        });
        if (hit) {
          e.waitUntil(net.catch(() => {}));  // 更新は裏で実行（起動は待たない）
          return hit;
        }
        return net.catch(() => caches.match("./"));
      })
    );
    return;
  }

  // それ以外：キャッシュ優先＋裏で更新
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(r => {
        if (r && r.status === 200) {
          const cp = r.clone();
          caches.open(CACHE).then(c => c.put(req, cp));
        }
        return r;
      }).catch(() => hit);
      return hit || net;
    })
  );
});

// 更新確認用
self.addEventListener("message", e => {
  if (e.data === "skipWaiting") self.skipWaiting();
});
