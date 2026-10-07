/* Service worker do MegGym: deixa o app instalável e funcionando offline.
   Ao mudar arquivos do app, aumente VERSION (e o ?v= dos arquivos no index.html). */
const VERSION = "v46";
const CACHE = `meggym-${VERSION}`;

const CORE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./data/exercises.json",
  "./data/workouts.json",
  "./assets/css/style.css?v=46",
  "./assets/js/theme.js?v=46",
  "./assets/js/config.js?v=46",
  "./assets/js/supabase.js?v=46",
  "./assets/js/bodymap.js?v=46",
  "./assets/js/common.js?v=46",
  "./assets/js/store.js?v=46",
  "./assets/js/pwa.js?v=46",
  "./assets/js/app.js?v=46",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/favicon-32.png",
  "./assets/fonts/material-symbols-rounded.woff2?v=46",
  "./assets/fonts/plus-jakarta-sans.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)));
  // Não troca sozinho: a versão nova espera o usuário tocar em "Atualizar" (mensagem abaixo).
  // Na primeira instalação não há versão antiga, então ela já começa ativa.
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "VERSION") event.source?.postMessage({ type: "VERSION", version: VERSION });
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
