// Service worker : permet d'installer l'appli et de l'ouvrir hors connexion.
// Les stocks (tableur Google) ne sont jamais mis en cache ici : ils sont relus à chaque ouverture.
const VERSION = "appui-v62";
const FICHIERS = [
  "./", "index.html", "css/style.css", "js/app.js", "js/config.js",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png",
  "icons/logo-appui.png", "icons/symbole-appui.png", "data/catalogue-exemple.csv",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((cles) => Promise.all(cles.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Réseau d'abord (pour toujours avoir la dernière version), cache en secours.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((rep) => {
        const copie = rep.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copie));
        return rep;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
