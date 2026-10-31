/* =========================================================
 * Service Worker · Fanzine Runner v31
 * - install : precachea el juego (tolerante a fallos)
 * - fetch   : Network-First para HTML/JS/CSS (garantiza código actualizado)
 *             Cache-First para imágenes y audios pesados (máxima velocidad)
 * ========================================================= */
const CACHE_VERSION = 'v31';
const CACHE_NAME = 'fanzine-runner-' + CACHE_VERSION;

// Mantener sincronizado con el diccionario ASSETS de game.js
const PRECACHE = [
  './',
  'index.html',
  'style.css',
  'game.js',
  'ASSETS/avion.png',
  'ASSETS/avion1.png',
  'ASSETS/avion2.png',
  'ASSETS/avionnoterindas.png',
  'ASSETS/avionnoterindas1.png',
  'ASSETS/avionnoterindas2.png',
  'ASSETS/logonoterindas.png',
  'ASSETS/fondoinfinito.png',
  'ASSETS/fondoinicio.png',
  'ASSETS/fondo inicio.png',
  'ASSETS/fondoentrada.png',
  'ASSETS/620cerrado.png',
  'ASSETS/620abrepoco.png',
  'ASSETS/620chicasale.png',
  'ASSETS/620chicosale.png',
  'ASSETS/chicacaminapuerta.png',
  'ASSETS/chicacaminapuerta2.png',
  'ASSETS/chicocaminapuerta.png',
  'ASSETS/chicocaminapuerta2.png',
  'ASSETS/chicadialogo.png',
  'ASSETS/chicadialogo1.png',
  'ASSETS/chicadialogo2.png',
  'ASSETS/chicadialogo3.png',
  'ASSETS/chicadialogo4.png',
  'ASSETS/chicadialogo5.png',
  'ASSETS/chicodialogo.png',
  'ASSETS/chicodialogo1.png',
  'ASSETS/chicodialogo2.png',
  'ASSETS/chicodialogo3.png',
  'ASSETS/chicodialogo4.png',
  'ASSETS/chicodialogo5.png',
  'ASSETS/maquina1.png',
  'ASSETS/maquina2.png',
  'ASSETS/maquina3.png',
  'ASSETS/maquina4.png',
  'ASSETS/cocachica1.png',
  'ASSETS/cocachica2.png',
  'ASSETS/cocachica3.png',
  'ASSETS/cocachica4.png',
  'ASSETS/cocachico1.png',
  'ASSETS/cocachico2.png',
  'ASSETS/cocachico3.png',
  'ASSETS/cocachico4.png',
  'ASSETS/SUELO.png',
  'ASSETS/caballoobstaculo.png',
  'ASSETS/manualobstaculo.png',
  'ASSETS/terovolando1.png',
  'ASSETS/terovolando2.png',
  'ASSETS/terovolando3.png',
  'ASSETS/terovolando4.png',
  'ASSETS/100puntostostado.png',
  'ASSETS/200puntostortilla.png',
  'ASSETS/500puntosmate.png',
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
  // No interceptar endpoints de API (ej: /api/scores) para tener siempre datos frescos en red
  if (url.pathname.startsWith('/api/')) return;

  const isNav = req.mode === 'navigate';
  const isCode = isNav || url.pathname.endsWith('.js') || url.pathname.endsWith('.css');

  if (isCode) {
    // Network-First para código: asegura ver los cambios desplegados en Vercel de inmediato
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => {
          return caches.match(req, { ignoreSearch: true }).then((cached) => {
            if (cached) return cached;
            if (isNav) return caches.match('index.html').then((r) => r || caches.match('./'));
            return Response.error();
          });
        })
    );
    return;
  }

  // Cache-First para imágenes y sonidos estáticos
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;

      return fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => {
          return Response.error();
        });
    })
  );
});
