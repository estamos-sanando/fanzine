/* =========================================================
 * Service Worker · Fanzine Runner v61
 * - install : precachea el juego (tolerante a fallos)
 * - fetch   : Network-First para HTML/JS/CSS (garantiza código actualizado)
 *             Cache-First para imágenes y audios pesados (máxima velocidad)
 * ========================================================= */
const CACHE_VERSION = 'v93';
const CACHE_NAME = 'fanzine-runner-' + CACHE_VERSION;

// Mantener sincronizado con el diccionario ASSETS de game.js
const PRECACHE = [
  './',
  'index.html',
  'style.css',
  'i18n.js',
  'leaderboard.js',
  'qrcode.min.js',
  'story-share.js',
  'game.js',
  'ASSETS/avion.webp',
  'ASSETS/avion1.webp',
  'ASSETS/avion2.webp',
  'ASSETS/avion.webp?v=89',
  'ASSETS/avion1.webp?v=89',
  'ASSETS/avion2.webp?v=89',
  'ASSETS/avionnoterindas.webp',
  'ASSETS/avionnoterindas1.webp',
  'ASSETS/avionnoterindas2.webp',
  'ASSETS/logonoterindas.webp',
  'ASSETS/logonoterindas.webp?v=88',
  'ASSETS/fondoinfinito.webp',
  'ASSETS/fondoinicio.webp',
  'ASSETS/Entrada.webp',
  'ASSETS/620cerrado.webp',
  'ASSETS/620abrepoco.webp',
  'ASSETS/620chicasale.webp',
  'ASSETS/620chicosale.webp',
  'ASSETS/chicacaminapuerta.webp',
  'ASSETS/chicacaminapuerta2.webp',
  'ASSETS/chicocaminapuerta.webp',
  'ASSETS/chicocaminapuerta2.webp',
  'ASSETS/chicadialogo.webp',
  'ASSETS/chicadialogo1.webp',
  'ASSETS/chicadialogo2.webp',
  'ASSETS/chicadialogo3.webp',
  'ASSETS/chicadialogo4.webp',
  'ASSETS/chicadialogo5.webp',
  'ASSETS/chicodialogo.webp',
  'ASSETS/chicodialogo1.webp',
  'ASSETS/chicodialogo2.webp',
  'ASSETS/chicodialogo3.webp',
  'ASSETS/chicodialogo4.webp',
  'ASSETS/chicodialogo5.webp',
  'ASSETS/maquina1.webp',
  'ASSETS/maquina2.webp',
  'ASSETS/maquina3.webp',
  'ASSETS/maquina4.webp',
  'ASSETS/cocachica1.webp',
  'ASSETS/cocachica2.webp',
  'ASSETS/cocachica3.webp',
  'ASSETS/cocachica4.webp',
  'ASSETS/cocachico1.webp',
  'ASSETS/cocachico2.webp',
  'ASSETS/cocachico3.webp',
  'ASSETS/cocachico4.webp',
  'ASSETS/SUELO.webp',
  'ASSETS/caballoobstaculo.webp',
  'ASSETS/virgenobstaculo.webp',
  'ASSETS/manualobstaculo.webp',
  'ASSETS/terovolando1.webp',
  'ASSETS/terovolando2.webp',
  'ASSETS/terovolando3.webp',
  'ASSETS/terovolando4.webp',
  'ASSETS/100puntostostado.webp',
  'ASSETS/200puntostortilla.webp',
  'ASSETS/500puntosmate.webp',
  'ASSETS/bonus.webp',
  'ASSETS/golfchica.webp',
  'ASSETS/golfchica1.webp',
  'ASSETS/golfchico.webp',
  'ASSETS/golfchico1.webp',
  'ASSETS/chicaquieta.webp',
  'ASSETS/chicacorreder.webp',
  'ASSETS/chicacorre1.webp',
  'ASSETS/chicacorreizq.webp',
  'ASSETS/chicacorre2.webp',
  'ASSETS/chicasalto.webp',
  'ASSETS/chicasalto1.webp',
  'ASSETS/chicasalto2.webp',
  'ASSETS/chicasalto3.webp',
  'ASSETS/chicoquieto.webp',
  'ASSETS/chicocorreder.webp',
  'ASSETS/chicocorre1.webp',
  'ASSETS/chicocorreizq.webp',
  'ASSETS/chicocorre2.webp',
  'ASSETS/chicosalto.webp',
  'ASSETS/chicosalto1.webp',
  'ASSETS/chicosalto2.webp',
  'ASSETS/chicosalto3.webp',
  'ASSETS/chicafestejo1.webp',
  'ASSETS/chicafestejo2.webp',
  'ASSETS/chicafestejo3.webp',
  'ASSETS/chicafestejo4.webp',
  'ASSETS/chicofestejo1.webp',
  'ASSETS/chicofestejo2.webp',
  'ASSETS/chicofestejo3.webp',
  'ASSETS/chicofestejo4.webp',
  // Música (game.js la descarga con fetch y la reproduce desde un blob)
  'ASSETS/Musica intro.mp3',
  'ASSETS/Musicajuego.mp3',
  'ASSETS/bonus1.mp3',
  'ASSETS/Musicaperder (1).mp3',
  'ASSETS/musicatop5.mp3'
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
  // Pedidos parciales (Range) de audio/video: los resuelve el navegador (una respuesta 206 no se puede cachear)
  if (req.headers.has('range')) return;

  const isNav = req.mode === 'navigate';
  const isCode = isNav || url.pathname.endsWith('.js') || url.pathname.endsWith('.css');

  if (isCode) {
    // Network-First real (cache: no-cache) para garantizar código JS/CSS/HTML siempre al día
    event.respondWith(
      fetch(new Request(req, { cache: 'no-cache' }))
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

  // Cache-First para imágenes y sonidos estáticos (prioriza URL exacta si incluye versión)
  event.respondWith(
    caches.match(req).then((exactCached) => {
      if (exactCached) return exactCached;
      return caches.match(req, { ignoreSearch: true }).then((cached) => {
        if (cached && !url.search) return cached;

        return fetch(req)
          .then((res) => {
            if (res && res.ok && res.type === 'basic') {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => {
            return cached || Response.error();
          });
      });
    })
  );
});
