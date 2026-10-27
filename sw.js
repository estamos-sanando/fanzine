/* =========================================================
 * Service Worker · estrategia CACHE FIRST
 * - install : precachea todo el juego (tolerante a fallos individuales)
 * - fetch   : responde desde caché; si no está, va a red y lo guarda
 * - Si publicás cambios en Vercel, SUBÍ el número de CACHE_VERSION
 *   para que los celulares descarguen la versión nueva.
 * ========================================================= */
const CACHE_VERSION = 'v6';
const CACHE_NAME = 'fanzine-runner-' + CACHE_VERSION;

// Mantener sincronizado con el diccionario ASSETS de game.js
const PRECACHE = [
  './',
  'index.html',
  'style.css',
  'game.js',
  'ASSETS/Inicio.png',
  'ASSETS/SUELO.png',
  'ASSETS/caballoobstaculo.png',
  'ASSETS/manualobstaculo.png',
  'ASSETS/100puntostostado.png',
  'ASSETS/200puntostortilla.png',
  'ASSETS/chicaquieta.png',
  'ASSETS/chicacorreder.png',
  'ASSETS/chicacorre1.png',
  'ASSETS/chicacorreizq.png',
  'ASSETS/chicacorre2.png',
  'ASSETS/chicasalto.png',
  'ASSETS/chicasalto1.png',
  'ASSETS/chicasalto2.png',
  'ASSETS/chicasalto3.png',
  'ASSETS/chicoquieto.png',
  'ASSETS/chicocorreder.png',
  'ASSETS/chicocorre1.png',
  'ASSETS/chicocorreizq.png',
  'ASSETS/chicocorre2.png',
  'ASSETS/chicosalto.png',
  'ASSETS/chicosalto1.png',
  'ASSETS/chicosalto2.png',
  'ASSETS/chicosalto3.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.allSettled(
        PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' })))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('fanzine-runner-') && k !== CACHE_NAME)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isNav = req.mode === 'navigate';

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;                       // 1) Cache First

      return fetch(req)                                // 2) Red + guardado en caché
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => {                                 // 3) Sin red y sin caché
          if (isNav) return caches.match('index.html').then((r) => r || caches.match('./'));
          return Response.error();
        });
    })
  );
});
