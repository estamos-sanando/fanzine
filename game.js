'use strict';

/* =============================================================================
 *  FANZINE RUNNER  ·  Canvas 2D + cámara en vivo  ·  Vanilla JS (ES6+)
 * =============================================================================
 *  1) MAPEO DE ASSETS   <<<<<  EDITÁ ACÁ LOS NOMBRES DE TUS ARCHIVOS  >>>>>
 *  2) CONFIG            (escalas, física, dificultad, hitboxes)
 *  3) Utilidades, audio, cámara, fullscreen
 *  4) Layout responsive
 *  5) Estado, entradas, física, spawner, colisiones
 *  6) Render
 *  7) Bucle principal y arranque
 *
 *  Nota: Vercel (Linux) distingue mayúsculas/minúsculas. La carpeta se llama
 *  "ASSETS" y los nombres deben coincidir EXACTO con los archivos.
 * ============================================================================= */


/* =============================================================================
 * 1) MAPEO DE ASSETS
 * ============================================================================= */
const ASSETS = {
  // Escenario, obstáculos y coleccionables
  images: {
    gate:     'ASSETS/Inicio.png',               // portal que sale de escena al arrancar
    ground:   'ASSETS/SUELO.png',                // vereda (el cielo blanco es transparente)
    book:     'ASSETS/manualobstaculo.png',      // obstáculo bajo  -> 1 salto
    horse:    'ASSETS/caballoobstaculo.png',     // obstáculo alto  -> doble salto
    toast:    'ASSETS/100puntostostado.png',     // +100
    tortilla: 'ASSETS/200puntostortilla.png'     // +200
  },

  // Personajes disponibles (se elige en la pantalla de inicio)
  //   idle        : parado (también se usa de referencia de escala)
  //   run         : 2 frames de carrera (se alternan)
  // Secuencia del salto:  [1] despegue -> [2] subida -> [3] apex -> [4] caída -> [1] aterrizaje
  //   jumpTakeoff : 1) agachado (despegue y aterrizaje)
  //   jumpRise    : 2) subiendo
  //   jumpApex    : 3) punto más alto
  //   jumpFall    : 4) cayendo
  characters: {
    chica: {
      idle:        'ASSETS/chicaquieta.png',
      run:         ['ASSETS/chicacorreder.png', 'ASSETS/chicacorreizq.png'],
      jumpTakeoff: 'ASSETS/chicasalto.png',
      jumpRise:    'ASSETS/chicasalto1.png',
      jumpApex:    'ASSETS/chicasalto2.png',
      jumpFall:    'ASSETS/chicasalto3.png'
    },
    chico: {
      idle:        'ASSETS/chicoquieto.png',
      run:         ['ASSETS/chicocorreder.png', 'ASSETS/chicocorreizq.png'],
      jumpTakeoff: 'ASSETS/chicosalto.png',
      jumpRise:    'ASSETS/chicosalto1.png',
      jumpApex:    'ASSETS/chicosalto2.png',
      jumpFall:    'ASSETS/chicosalto3.png'
    }
  },

  // Sonidos opcionales. Dejalos en null para usar sonidos sintetizados (WebAudio),
  // o poné una ruta, ej.: jump: 'ASSETS/salto.mp3'
  sounds: {
    jump:       null,
    doubleJump: null,
    pickup:     null,
    hit:        null
  }
};


/* =============================================================================
 * 2) CONFIG
 *    Todo se mide en "U" = altura del personaje en pantalla, así el juego
 *    escala igual en cualquier celular.
 * ============================================================================= */
const CONFIG = {
  debug: /[?&]debug\b/.test(location.search),   // ?debug muestra hitboxes
  storageHi:   'fanzine_runner_hi',
  storageChar: 'fanzine_runner_char',
  defaultCharacter: 'chica',

  // Píxeles de SUELO.png (1920x1080) donde empieza la vereda; arriba es transparente
  groundSourceTop: 690,

  layout: {
    unitFromHeight: 0.22,   // U <= 22% del alto de pantalla
    unitFromWidth:  0.27,   // U <= 27% del ancho de pantalla
    unitMin: 56,
    unitMax: 230,
    stripHeightFrac: 0.28,  // la vereda ocupa el 28% inferior
    feetInStrip: 0.56,      // los pies caen al 56% de la vereda (como en la referencia)
    heroXFrac: 0.20         // posición horizontal del personaje
  },

  // Alto visual (en U) de cada sprite
  size: { book: 0.55, horse: 1.30, pickup: 0.50 },

  // Hitboxes: margen (fracción del sprite) recortado en cada lado => más chicas que el sprite
  hitbox: {
    book:  { l: 0.14, r: 0.14, t: 0.10, b: 0.00 },
    horse: { l: 0.16, r: 0.18, t: 0.08, b: 0.04 }
  },
  hero: { halfWidth: 0.17, bottom: 0.08, top: 0.85 },   // en U
  pickupForgiveness: 0.18,                              // pickups más fáciles de agarrar

  // Física (unidades: U y segundos)
  physics: {
    gravity:         12,
    jumpApex:        0.95,   // salto simple: no pasa al caballo (hitbox ~1.2 U)
    doubleApex:      1.10,   // altura EXTRA del 2º impulso
    doubleGravityMul: 0.80,  // más flotado en el doble salto
    inputBuffer:     0.12    // si tocás un poco antes de aterrizar, salta igual
  },

  // Velocidad horizontal en "anchos de pantalla por segundo"
  speed: { start: 0.50, max: 1.20, rampDistance: 3500 },

  // Spawner (huecos en SEGUNDOS => la dificultad es justa en cualquier resolución)
  spawn: {
    firstDelayFrac: 0.35,                 // primer obstáculo a 0.35 W de distancia extra
    gapMin: [1.30, 0.85],                 // [inicio, final] de la rampa
    gapMax: [2.20, 1.40],
    horseExtraGap: 0.25,
    horseChance: [0.25, 0.45],
    doubleBookChance: [0.10, 0.35],
    safeObstacles: 2                      // los primeros 2 son siempre libros
  },

  points: { toast: 100, tortilla: 200 },
  deadInputLock: 450                      // ms antes de poder reiniciar
};


/* =============================================================================
 * 3) UTILIDADES, AUDIO, CÁMARA, FULLSCREEN
 * ============================================================================= */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp  = (a, b, t) => a + (b - a) * t;
const rand  = (a, b) => a + Math.random() * (b - a);
const pad   = (n, len = 5) => String(Math.max(0, Math.floor(n))).padStart(len, '0');

const $ = (id) => document.getElementById(id);
const dom = {
  video:   $('camera'),
  canvas:  $('game'),
  overlay: $('overlay'),
  label:   $('start-label'),
  toast:   $('toast'),
  probe:   $('safe-probe'),
  pickers: Array.from(document.querySelectorAll('.picker__btn'))
};
const ctx = dom.canvas.getContext('2d', { alpha: true });

function storageGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v; }
  catch (_) { return fallback; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, String(value)); } catch (_) { /* modo privado */ }
}

let toastTimer = 0;
function showToast(msg, ms = 4200) {
  dom.toast.textContent = msg;
  dom.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => dom.toast.classList.remove('is-visible'), ms);
}

/* ---------- Audio (sintetizado, sin archivos; usa ASSETS.sounds si existen) ---------- */
const Sfx = {
  ac: null,
  files: {},
  init() {
    for (const [name, src] of Object.entries(ASSETS.sounds)) {
      if (src) { const a = new Audio(src); a.preload = 'auto'; this.files[name] = a; }
    }
  },
  unlock() {
    if (!this.ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) { try { this.ac = new AC(); } catch (_) { /* sin audio */ } }
    }
    if (this.ac && this.ac.state === 'suspended') this.ac.resume();
  },
  tone(f0, f1, dur, type = 'square', vol = 0.08, delay = 0) {
    if (!this.ac) return;
    const t = this.ac.currentTime + delay;
    const osc = this.ac.createOscillator();
    const g = this.ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.ac.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  },
  play(name) {
    const file = this.files[name];
    if (file) { try { file.currentTime = 0; file.play(); } catch (_) {} return; }
    switch (name) {
      case 'jump':       this.tone(320, 640, 0.14); break;
      case 'doubleJump': this.tone(480, 980, 0.18); this.tone(720, 1200, 0.12, 'square', 0.05, 0.06); break;
      case 'pickup':     this.tone(880, 1320, 0.09, 'triangle', 0.1); this.tone(1320, 1760, 0.12, 'triangle', 0.1, 0.08); break;
      case 'hit':        this.tone(220, 40, 0.4, 'sawtooth', 0.14); break;
    }
  }
};

/* ---------- Cámara trasera ---------- */
async function startCamera() {
  const md = navigator.mediaDevices;
  if (!md || !md.getUserMedia) return { ok: false, reason: 'unsupported' };

  const attempt = (video) => md.getUserMedia({ video, audio: false });
  let stream = null;
  try {
    stream = await attempt({ facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } });
  } catch (err) {
    if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
      return { ok: false, reason: 'denied' };
    }
    try { stream = await attempt(true); }                 // PC sin cámara trasera
    catch (err2) { return { ok: false, reason: (err2 && err2.name) || 'error' }; }
  }

  dom.video.srcObject = stream;
  try { await dom.video.play(); } catch (_) { /* autoplay ya cubierto por muted+playsinline */ }
  return { ok: true };
}

/* ---------- Pantalla completa ---------- */
function goFullscreen() {
  const el = document.documentElement;
  const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
  if (!fn) return;                                          // iPhone Safari: no soportado
  try {
    const p = fn.call(el, { navigationUI: 'hide' });
    if (p && p.catch) p.catch(() => {});
  } catch (_) { /* ignorado */ }
}


/* =============================================================================
 * Carga de imágenes
 * ============================================================================= */
const IMG = { chars: {} };
const missingAssets = [];

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => { missingAssets.push(src); resolve(null); };
    img.src = src;
  });
}

async function loadAssets() {
  const jobs = [];
  for (const [key, src] of Object.entries(ASSETS.images)) {
    jobs.push(loadImage(src).then((img) => { IMG[key] = img; }));
  }
  for (const [id, set] of Object.entries(ASSETS.characters)) {
    const slot = (IMG.chars[id] = {});
    for (const [pose, src] of Object.entries(set)) {
      if (Array.isArray(src)) {
        jobs.push(Promise.all(src.map(loadImage)).then((arr) => { slot[pose] = arr; }));
      } else {
        jobs.push(loadImage(src).then((img) => { slot[pose] = img; }));
      }
    }
  }
  await Promise.all(jobs);
  if (missingAssets.length) {
    console.error('[ASSETS] No se pudieron cargar:\n - ' + missingAssets.join('\n - ') +
                  '\nRevisá el diccionario ASSETS al inicio de game.js (mayúsculas/minúsculas incluidas).');
  }
}


/* =============================================================================
 * 4) LAYOUT RESPONSIVE
 * ============================================================================= */
let W = 0, H = 0, DPR = 1;
let U = 100;              // alto del personaje en px
let stripTop = 0, stripH = 0, groundY = 0, heroX = 0, safeTop = 0;
let groundTile = null;    // canvas offscreen (vereda + espejo para tile sin costuras)
let groundTileW = 0;      // ancho de UN tile en px CSS

function layout() {
  const prevW = W;
  W = window.innerWidth;
  H = window.innerHeight;
  DPR = Math.min(window.devicePixelRatio || 1, 2);

  dom.canvas.width  = Math.round(W * DPR);
  dom.canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const L = CONFIG.layout;
  U = clamp(Math.min(H * L.unitFromHeight, W * L.unitFromWidth), L.unitMin, L.unitMax);
  stripH   = Math.round(H * L.stripHeightFrac);
  stripTop = H - stripH;
  groundY  = stripTop + stripH * L.feetInStrip;
  heroX    = Math.max(W * L.heroXFrac, U * 0.7);
  safeTop  = parseFloat(getComputedStyle(dom.probe).paddingTop) || 0;

  buildGroundTile();

  // Reescalar entidades en vuelo si cambió el ancho (rotación / barra del navegador)
  if (prevW && prevW !== W) {
    const k = W / prevW;
    world.obstacles.forEach((o) => { o.x *= k; });
    world.pickups.forEach((p) => { p.x *= k; });
    world.popups.forEach((p) => { p.x *= k; });
    world.gateX *= k;
    if (state === 'menu') placeGate();
  }
}

function buildGroundTile() {
  const img = IMG.ground;
  if (!img) { groundTile = null; return; }
  const srcY = CONFIG.groundSourceTop;
  const srcH = img.naturalHeight - srcY;
  const s = stripH / srcH;
  groundTileW = Math.ceil(img.naturalWidth * s);

  const c = document.createElement('canvas');
  c.width  = groundTileW * 2 * DPR;
  c.height = Math.ceil(stripH * DPR);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.scale(DPR, DPR);
  g.drawImage(img, 0, srcY, img.naturalWidth, srcH, 0, 0, groundTileW, stripH);
  // Mitad espejada => el borde derecho coincide con el izquierdo (sin costura)
  g.save();
  g.translate(groundTileW * 2, 0);
  g.scale(-1, 1);
  g.drawImage(img, 0, srcY, img.naturalWidth, srcH, 0, 0, groundTileW, stripH);
  g.restore();
  groundTile = c;
}


/* =============================================================================
 * 5) ESTADO, ENTRADAS, FÍSICA, SPAWNER, COLISIONES
 * ============================================================================= */
let state = 'loading';          // loading | menu | running | paused | dead
const savedCharacter = storageGet(CONFIG.storageChar, '');
let character = ASSETS.characters[savedCharacter] ? savedCharacter : CONFIG.defaultCharacter;

let hiScore = parseInt(storageGet(CONFIG.storageHi, '0'), 10) || 0;

const P = CONFIG.physics;
const GRAV = P.gravity;
const V1 = Math.sqrt(2 * GRAV * P.jumpApex);
const GRAV2 = GRAV * P.doubleGravityMul;
const V2 = Math.sqrt(2 * GRAV2 * P.doubleApex);

const hero = {
  h: 0, vy: 0, grounded: true, jumps: 0,
  animT: 0, sinceJump: 0, sinceDouble: 99, landT: 0, buffer: 0
};

const world = {
  obstacles: [], pickups: [], popups: [],
  groundScroll: 0, gateX: 0,
  dist: 0, bonus: 0, speed: 0, p: 0, time: 0,
  spawnDist: 0, spawned: 0,
  score: 0, newRecord: false,
  deadAt: 0, deadT: 0, pausedAt: 0
};

function gateDims() {
  const img = IMG.gate;
  const aspect = img ? img.naturalWidth / img.naturalHeight : 1.9;
  const w = Math.min(W * 1.2, H * 1.6);
  return { w, h: w / aspect };
}
function placeGate() {
  world.gateX = heroX - gateDims().w * 0.44;    // la puerta queda sobre el personaje
}

function resetRun() {
  world.obstacles.length = 0;
  world.pickups.length = 0;
  world.popups.length = 0;
  world.groundScroll = 0;
  world.dist = 0; world.bonus = 0; world.p = 0; world.time = 0; world.score = 0;
  world.speed = W * CONFIG.speed.start;
  world.spawnDist = W * CONFIG.spawn.firstDelayFrac;
  world.spawned = 0;
  world.newRecord = false;
  Object.assign(hero, { h: 0, vy: 0, grounded: true, jumps: 0, animT: 0, sinceJump: 0, sinceDouble: 99, landT: 0, buffer: 0 });
  placeGate();
}

/* ---------- Dimensiones y hitboxes ---------- */
const aspectOf = (img) => (img ? img.naturalWidth / img.naturalHeight : 1);

function obstacleDims(kind) {
  const h = CONFIG.size[kind] * U;
  return { w: h * aspectOf(IMG[kind]), h };
}
function obstacleRect(o) {
  const { w, h } = obstacleDims(o.kind);
  const hb = CONFIG.hitbox[o.kind];
  return {
    l: o.x + w * hb.l,
    r: o.x + w * (1 - hb.r),
    t: groundY - h * (1 - hb.t),
    b: groundY - h * hb.b
  };
}
function pickupDims(kind) {
  const h = CONFIG.size.pickup * U;
  return { w: h * aspectOf(IMG[kind]), h };
}
function pickupRect(p) {
  const { w, h } = pickupDims(p.kind);
  const cy = groundY - p.hU * U;
  const f = CONFIG.pickupForgiveness;
  return { l: p.x - w * f, r: p.x + w * (1 + f), t: cy - h * (0.5 + f), b: cy + h * (0.5 + f) };
}
function heroRect() {
  const c = CONFIG.hero;
  return {
    l: heroX - c.halfWidth * U,
    r: heroX + c.halfWidth * U,
    t: groundY - (hero.h + c.top) * U,
    b: groundY - (hero.h + c.bottom) * U
  };
}
const overlap = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

/* ---------- Entradas ---------- */
function tryJump() {
  if (hero.grounded) {
    hero.vy = V1; hero.grounded = false; hero.jumps = 1;
    hero.sinceJump = 0; hero.landT = 0;
    Sfx.play('jump');
  } else if (hero.jumps === 1) {
    hero.vy = V2; hero.jumps = 2; hero.sinceDouble = 0;
    Sfx.play('doubleJump');
  } else {
    hero.buffer = P.inputBuffer;          // 3er toque: se guarda para aterrizar
  }
}

function onPress() {
  switch (state) {
    case 'running': tryJump(); break;
    case 'dead':
      if (performance.now() - world.deadAt > CONFIG.deadInputLock) beginRun();
      break;
    case 'paused':
      if (performance.now() - world.pausedAt > 200) { state = 'running'; }
      break;
  }
}

window.addEventListener('pointerdown', (e) => {
  if (state === 'menu' || state === 'loading') return;   // el overlay maneja el inicio
  e.preventDefault();
  onPress();
}, { passive: false });

window.addEventListener('keydown', (e) => {
  const isJump = e.code === 'Space' || e.code === 'ArrowUp' || e.key === ' ' || e.key === 'ArrowUp';
  if (!isJump) return;
  e.preventDefault();
  if (e.repeat) return;
  if (state === 'menu') { startFromOverlay(); return; }
  onPress();
}, { passive: false });

// Bloqueos extra de gestos (iOS) y menú contextual
['gesturestart', 'gesturechange', 'gestureend'].forEach((n) =>
  document.addEventListener(n, (e) => e.preventDefault()));
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('dblclick', (e) => e.preventDefault());

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (state === 'running') { state = 'paused'; world.pausedAt = performance.now(); }
  } else if (dom.video.srcObject) {
    dom.video.play().catch(() => {});
  }
});

/* ---------- Spawner ---------- */
function spawnPattern() {
  const S = CONFIG.spawn;
  const p = world.p;
  const x0 = W + U;
  const isHorse = world.spawned >= S.safeObstacles && Math.random() < lerp(S.horseChance[0], S.horseChance[1], p);
  let width;

  if (isHorse) {
    const d = obstacleDims('horse');
    world.obstacles.push({ kind: 'horse', x: x0 });
    width = d.w;
    if (Math.random() < 0.55) {                       // premio por doble salto perfecto
      const pd = pickupDims('tortilla');
      world.pickups.push({ kind: 'tortilla', x: x0 + d.w / 2 - pd.w / 2, hU: 2.15, phase: rand(0, 6.28) });
    }
  } else {
    const d = obstacleDims('book');
    const double = world.spawned >= 4 && Math.random() < lerp(S.doubleBookChance[0], S.doubleBookChance[1], p);
    world.obstacles.push({ kind: 'book', x: x0 });
    width = d.w;
    if (double) { world.obstacles.push({ kind: 'book', x: x0 + d.w * 1.05 }); width = d.w * 2.05; }
    if (Math.random() < 0.5) {
      const pd = pickupDims('toast');
      world.pickups.push({ kind: 'toast', x: x0 + width / 2 - pd.w / 2, hU: 1.2, phase: rand(0, 6.28) });
    }
  }
  world.spawned++;

  const gapSec = rand(lerp(S.gapMin[0], S.gapMin[1], p), lerp(S.gapMax[0], S.gapMax[1], p))
               + (isHorse ? S.horseExtraGap : 0);
  const gapPx = gapSec * world.speed;
  world.spawnDist = width + gapPx;

  if (Math.random() < 0.4) {                          // tostado "gratis" en el piso
    const pd = pickupDims('toast');
    world.pickups.push({ kind: 'toast', x: x0 + width + gapPx / 2 - pd.w / 2, hU: 0.5, phase: rand(0, 6.28) });
  }
}

/* ---------- Ciclo de partida ---------- */
function beginRun() {
  resetRun();
  state = 'running';
}

function die() {
  state = 'dead';
  world.deadAt = performance.now();
  world.deadT = 0;
  Sfx.play('hit');
  if (world.score > hiScore) {
    hiScore = world.score;
    world.newRecord = true;
    storageSet(CONFIG.storageHi, hiScore);
  }
}

function update(dt) {
  const S = CONFIG.speed;
  world.time += dt;
  world.p = 1 - Math.exp(-world.dist / S.rampDistance);
  world.speed = W * lerp(S.start, S.max, world.p);
  const dx = world.speed * dt;

  world.groundScroll += dx;
  world.dist += (world.speed / W) * 100 * dt;
  world.score = Math.floor(world.dist / 5) + world.bonus;
  world.gateX -= dx;

  // --- Héroe ---
  hero.animT += dt;
  hero.sinceDouble += dt;
  hero.buffer = Math.max(0, hero.buffer - dt);
  if (hero.landT > 0) hero.landT -= dt;
  if (!hero.grounded) {
    hero.sinceJump += dt;
    hero.vy -= (hero.jumps === 2 ? GRAV2 : GRAV) * dt;
    hero.h += hero.vy * dt;
    if (hero.h <= 0) {
      hero.h = 0; hero.vy = 0; hero.grounded = true; hero.jumps = 0; hero.landT = 0.09;
      if (hero.buffer > 0) { hero.buffer = 0; tryJump(); }
    }
  }

  // --- Spawner ---
  world.spawnDist -= dx;
  if (world.spawnDist <= 0) spawnPattern();

  // --- Entidades ---
  for (const o of world.obstacles) o.x -= dx;
  for (const p of world.pickups) { p.x -= dx; p.phase += dt * 4; }
  world.obstacles = world.obstacles.filter((o) => o.x + obstacleDims(o.kind).w > -U);
  world.pickups   = world.pickups.filter((p) => !p.taken && p.x + pickupDims(p.kind).w > -U);

  // --- Popups ---
  for (const p of world.popups) p.t += dt;
  world.popups = world.popups.filter((p) => p.t < 0.8);

  // --- Colisiones ---
  const hr = heroRect();
  for (const o of world.obstacles) {
    if (overlap(hr, obstacleRect(o))) { die(); return; }
  }
  for (const p of world.pickups) {
    if (!p.taken && overlap(hr, pickupRect(p))) {
      p.taken = true;
      const pts = CONFIG.points[p.kind];
      world.bonus += pts;
      world.popups.push({ text: '+' + pts, x: heroX + U * 0.4, y: groundY - (hero.h + 1.2) * U, t: 0 });
      Sfx.play('pickup');
    }
  }
}


/* =============================================================================
 * 6) RENDER
 * ============================================================================= */
const JUMP_APEX_BAND = 1.8;   // |vy| (U/s) por debajo del cual se muestra el frame de apex

function heroSprite() {
  const set = IMG.chars[character];
  if (!set) return null;
  if (state === 'menu' || state === 'loading') return set.idle;
  if (!hero.grounded) {
    // 1) despegue agachado (también al iniciar el doble salto)
    if (hero.sinceJump < 0.07 || (hero.jumps === 2 && hero.sinceDouble < 0.08)) return set.jumpTakeoff;
    // 2) subiendo  3) apex (velocidad vertical cercana a 0)  4) cayendo
    if (hero.vy > JUMP_APEX_BAND) return set.jumpRise;
    if (hero.vy >= -JUMP_APEX_BAND) return set.jumpApex;
    return set.jumpFall;
  }
  // 5) aterrizaje: vuelve al frame agachado
  if (hero.landT > 0) return set.jumpTakeoff;
  const frameDur = lerp(0.14, 0.08, world.p);
  const frames = set.run;
  return frames && frames.length ? frames[Math.floor(hero.animT / frameDur) % frames.length] : set.idle;
}

function drawHero() {
  const set = IMG.chars[character];
  if (!set || !set.idle) return;
  const k = U / set.idle.naturalHeight;               // escala común para todos los frames
  const img = heroSprite();
  if (!img) return;

  // Sombra en el piso
  const shrink = 1 - Math.min(hero.h, 2) * 0.18;
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(heroX, groundY + U * 0.02, U * 0.30 * shrink, U * 0.06 * shrink, 0, 0, Math.PI * 2);
  ctx.fill();

  const w = img.naturalWidth * k, h = img.naturalHeight * k;
  ctx.drawImage(img, heroX - w / 2, groundY - hero.h * U - h, w, h);
}

function drawGround() {
  if (!groundTile) {
    ctx.fillStyle = '#4a4d57';
    ctx.fillRect(0, stripTop, W, stripH);
    return;
  }
  const period = groundTileW * 2;
  let x = -(world.groundScroll % period);
  for (; x < W; x += period) ctx.drawImage(groundTile, x, stripTop, period, stripH);
}

function drawGate() {
  const img = IMG.gate;
  if (!img) return;
  const { w, h } = gateDims();
  if (world.gateX + w < 0) return;
  ctx.drawImage(img, world.gateX, groundY + U * 0.18 - h, w, h);
}

function drawObstacles() {
  for (const o of world.obstacles) {
    const img = IMG[o.kind];
    if (!img) continue;
    const { w, h } = obstacleDims(o.kind);
    ctx.drawImage(img, o.x, groundY - h + U * 0.04, w, h);
  }
}

function drawPickups() {
  for (const p of world.pickups) {
    const img = IMG[p.kind];
    if (!img) continue;
    const { w, h } = pickupDims(p.kind);
    const bob = Math.sin(p.phase) * U * 0.05;
    ctx.drawImage(img, p.x, groundY - p.hU * U - h / 2 + bob, w, h);
  }
}

function drawText(str, x, y, size, opt = {}) {
  const { align = 'center', color = '#fff', stroke = '#000', weight = 800, alpha = 1 } = opt;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${weight} ${size}px ui-monospace, "SFMono-Regular", Menlo, Consolas, "Courier New", monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size * 0.24);
  ctx.strokeStyle = stroke;
  ctx.strokeText(str, x, y);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  ctx.restore();
}

function drawPopups() {
  const size = clamp(U * 0.3, 16, 36);
  for (const p of world.popups) {
    const k = p.t / 0.8;
    drawText(p.text, p.x, p.y - k * U * 0.6, size, { color: '#ffd34d', alpha: 1 - k * k });
  }
}

function drawHUD() {
  const size = clamp(U * 0.2, 14, 28);
  const y = safeTop + 14 + size / 2;
  const m = 14;
  drawText('PUNTOS ' + pad(world.score), m, y, size, { align: 'left' });
  drawText('RÉCORD ' + pad(Math.max(hiScore, world.score)), W - m, y, size,
           { align: 'right', color: '#ffd34d' });
}

function drawPanel(lines) {
  ctx.fillStyle = 'rgba(6, 8, 16, 0.55)';
  ctx.fillRect(0, 0, W, H);
  const base = clamp(Math.min(W, H) * 0.09, 20, 56);
  let y = H * 0.30;
  for (const l of lines) {
    drawText(l.text, W / 2, y, base * (l.scale || 1), l);
    y += base * (l.scale || 1) * 1.45;
  }
}

function drawDebug() {
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#00ff88';
  const strokeRect = (r) => ctx.strokeRect(r.l, r.t, r.r - r.l, r.b - r.t);
  strokeRect(heroRect());
  ctx.strokeStyle = '#ff3355';
  world.obstacles.forEach((o) => strokeRect(obstacleRect(o)));
  ctx.strokeStyle = '#ffd34d';
  world.pickups.forEach((p) => strokeRect(pickupRect(p)));
  ctx.strokeStyle = '#00aaff';
  ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(W, groundY); ctx.stroke();
}

function render() {
  ctx.clearRect(0, 0, W, H);                    // canvas transparente: se ve la cámara detrás

  let shake = false;
  if (state === 'dead' && world.deadT < 0.28) {
    shake = true;
    ctx.save();
    const a = U * 0.06 * (1 - world.deadT / 0.28);
    ctx.translate(rand(-a, a), rand(-a, a));
  }

  drawGround();
  drawGate();
  drawPickups();
  drawObstacles();
  drawHero();
  drawPopups();
  if (CONFIG.debug) drawDebug();

  if (shake) ctx.restore();
  if (state === 'running' || state === 'dead' || state === 'paused') drawHUD();

  const blink = Math.floor(performance.now() / 500) % 2 === 0;

  if (state === 'dead') {
    if (world.deadT < 0.18) {                    // flash de impacto
      ctx.fillStyle = `rgba(255,255,255,${0.55 * (1 - world.deadT / 0.18)})`;
      ctx.fillRect(0, 0, W, H);
    }
    drawPanel([
      { text: 'GAME OVER', scale: 1.15, color: '#ff6b6b' },
      { text: 'PUNTOS ' + pad(world.score), scale: 0.62 },
      { text: 'RÉCORD ' + pad(hiScore), scale: 0.62, color: '#ffd34d' },
      { text: world.newRecord ? '¡NUEVO RÉCORD!' : ' ', scale: 0.6, color: '#7fe08a', alpha: blink ? 1 : 0.5 },
      { text: 'Tocá para reiniciar', scale: 0.5, alpha: blink ? 1 : 0.35 }
    ]);
  } else if (state === 'paused') {
    drawPanel([
      { text: 'PAUSA', scale: 1.1 },
      { text: 'Tocá para seguir', scale: 0.5, alpha: blink ? 1 : 0.35 }
    ]);
  }
}


/* =============================================================================
 * 7) BUCLE PRINCIPAL Y ARRANQUE
 * ============================================================================= */
let lastT = 0;
function frame(t) {
  requestAnimationFrame(frame);
  const dt = lastT ? clamp((t - lastT) / 1000, 0, 0.05) : 0;
  lastT = t;

  if (state === 'running') update(dt);
  else if (state === 'dead') world.deadT += dt;
  render();
}

/* ---------- Overlay de inicio ---------- */
let starting = false;

function selectCharacter(id) {
  if (!ASSETS.characters[id]) return;
  character = id;
  storageSet(CONFIG.storageChar, id);
  dom.pickers.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.char === id)));
}

async function startFromOverlay() {
  if (starting || state !== 'menu') return;
  starting = true;

  // Todo lo que requiere "gesto del usuario" se dispara de forma síncrona acá
  Sfx.unlock();
  goFullscreen();
  dom.label.textContent = 'Activando cámara…';
  const camPromise = startCamera();

  const cam = await camPromise;
  if (!cam.ok) {
    showToast(cam.reason === 'denied'
      ? 'Sin permiso de cámara: jugás con fondo alternativo.'
      : 'No se pudo abrir la cámara: jugás con fondo alternativo.');
  }

  dom.overlay.classList.add('is-hidden');
  layout();                                      // por si cambió el viewport al entrar en fullscreen
  beginRun();
  starting = false;
}

function setupOverlay() {
  dom.pickers.forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    selectCharacter(b.dataset.char);
  }));
  dom.overlay.addEventListener('click', startFromOverlay);
}

async function main() {
  Sfx.init();
  setupOverlay();
  selectCharacter(character);
  layout();
  resetRun();
  requestAnimationFrame(frame);                  // escena idle detrás del overlay

  await loadAssets();
  layout();                                      // ahora hay imágenes: tile de suelo y proporciones reales
  resetRun();

  if (!IMG.chars[character] || !IMG.chars[character].idle) selectCharacter(CONFIG.defaultCharacter);

  state = 'menu';
  dom.overlay.classList.remove('is-loading');
  dom.label.textContent = 'Tocá para empezar';
  dom.overlay.focus({ preventScroll: true });
}

let resizeRaf = 0;
const onResize = () => {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(layout);
};
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);
document.addEventListener('fullscreenchange', onResize);
document.addEventListener('webkitfullscreenchange', onResize);

main();
