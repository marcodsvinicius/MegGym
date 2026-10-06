/* Service worker do MegGym: deixa o app instalável e funcionando offline.
   Ao mudar arquivos do app, aumente VERSION (e o ?v= dos arquivos no index.html). */
const VERSION = "v15";
const CACHE = `meggym-${VERSION}`;

const CORE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./data/exercises.json",
  "./data/workouts.json",
  "./assets/css/style.css?v=15",
  "./assets/js/theme.js?v=15",
  "./assets/js/config.js?v=15",
  "./assets/js/supabase.js?v=15",
  "./assets/js/common.js?v=15",
  "./assets/js/store.js?v=15",
  "./assets/js/pwa.js?v=15",
  "./assets/js/app.js?v=15",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/favicon-32.png",
  "./assets/fonts/material-symbols-rounded.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("meggym-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Rede primeiro (com cópia no cache) para a página e os dados; cache primeiro para o resto.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // YouTube, imagens externas etc.

  const networkFirst = req.mode === "navigate" || url.pathname.endsWith("/data/exercises.json");
  if (networkFirst) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          if (res.ok) caches.open(CACHE).then((c) => c.put(req.mode === "navigate" ? "./index.html" : req, copy));
          return res;
        })
        .catch(() => caches.match(req.mode === "navigate" ? "./index.html" : req, { ignoreSearch: req.mode === "navigate" }))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
