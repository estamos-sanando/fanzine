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
    gate:          'ASSETS/Inicio.png',          // portal de la universidad
    fondoinicio:   'ASSETS/fondoinicio.png',     // fondo para pantalla de inicio (árboles, cielo)
    reja:          'ASSETS/reja.png',            // reja modular sobre la vereda
    fondoinfinito: 'ASSETS/fondoinfinito.png',   // fondo infinito durante la carrera (Teatro, Auditorio, Biblioteca)
    ground:        'ASSETS/SUELO.png',           // vereda
    book:          'ASSETS/manualobstaculo.png', // obstáculo bajo
    horse:         'ASSETS/caballoobstaculo.png',// obstáculo alto
    toast:         'ASSETS/100puntostostado.png',// +100
    tortilla:      'ASSETS/200puntostortilla.png',// +200
    mate:          'ASSETS/500puntosmate.png'    // +500 recompensa alta especial
  },

  // Personajes disponibles (se elige en la pantalla de inicio)
  characters: {
    chica: {
      idle:        'ASSETS/chicaquieta.png',
      run: [
        'ASSETS/chicacorreder.png',
        'ASSETS/chicacorre1.png',
        'ASSETS/chicacorreizq.png',
        'ASSETS/chicacorre2.png'
      ],
      jumpTakeoff: 'ASSETS/chicasalto.png',
      jumpRise:    'ASSETS/chicasalto1.png',
      jumpApex:    'ASSETS/chicasalto2.png',
      jumpFall:    'ASSETS/chicasalto3.png'
    },
    chico: {
      idle:        'ASSETS/chicoquieto.png',
      run: [
        'ASSETS/chicocorreder.png',
        'ASSETS/chicocorre1.png',
        'ASSETS/chicocorreizq.png',
        'ASSETS/chicocorre2.png'
      ],
      jumpTakeoff: 'ASSETS/chicosalto.png',
      jumpRise:    'ASSETS/chicosalto1.png',
      jumpApex:    'ASSETS/chicosalto2.png',
      jumpFall:    'ASSETS/chicosalto3.png'
    }
  },

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
  storageScores:   'fanzine_runner_scores',     // tabla de puntajes (top 10)
  storageInitials: 'fanzine_runner_initials',   // últimas iniciales usadas
  maxScores: 10,
  initialsLength: 3,
  storageChar: 'fanzine_runner_char',
  defaultCharacter: 'chica',

  // Píxeles de SUELO.png (1920x1080) donde empieza la vereda
  groundSourceTop: 690,

  layout: {
    unitFromHeight: 0.22,   // U <= 22% del alto de pantalla
    unitFromWidth:  0.27,   // U <= 27% del ancho de pantalla
    unitMin: 56,
    unitMax: 230,
    stripHeightFrac: 0.28,  // la vereda ocupa el 28% inferior
    feetInStrip: 0.56,      // los pies caen al 56% de la vereda
    heroXFrac: 0.20         // posición horizontal del personaje
  },

  // Alto visual (en U) de cada sprite
  size: { book: 0.55, horse: 1.30, pickup: 0.50, mate: 0.58 },

  // Hitboxes: margen recortado en cada lado
  hitbox: {
    book:  { l: 0.14, r: 0.14, t: 0.10, b: 0.00 },
    horse: { l: 0.16, r: 0.18, t: 0.08, b: 0.04 }
  },
  hero: { halfWidth: 0.17, bottom: 0.08, top: 0.85 },   // en U
  pickupForgiveness: 0.20,                              // pickups más fáciles de agarrar

  // Física (unidades: U y segundos)
  physics: {
    gravity:          12,
    jumpApex:         0.95,   // salto simple
    doubleApex:       1.10,   // altura de cada impulso aéreo
    doubleGravityMul: 0.80,   // caída más ágil y controlable en el aire
    inputBuffer:      0.14    // buffer de entrada antes de tocar el suelo
  },

  // Velocidad y aceleración idénticas al Dinosaurio de Google (Chromium T-Rex Runner)
  // Parámetros oficiales de Runner.config en Chromium:
  // Velocidad y aceleración progresiva (arranque accesible y aceleración continua perceptible)
  speed: {
    start: 6,             // SPEED inicial (0.60 pantallas/s)
    max: 13.5,            // MAX_SPEED desafiante (1.35 pantallas/s)
    acceleration: 0.0028, // Aceleración acelerada (+0.168/s): la dificultad escala visiblemente desde los 10-15s
    startFrac: 0.60,      // factor de ancho de pantalla por segundo al iniciar
    maxFrac: 1.35         // factor de ancho de pantalla por segundo a vel. máxima
  },

  // Spawner: la separación se reduce y la variedad de obstáculos aumenta con la velocidad
  spawn: {
    firstDelayFrac: 0.50,                 // margen inicial para acomodarse antes del primer obstáculo
    gapMin: [1.30, 0.72],                 // hueco mín en segundos [inicio, vel. máx]
    gapMax: [2.05, 1.10],                 // hueco máx en segundos [inicio, vel. máx]
    horseExtraGap: 0.35,                  // margen extra tras un caballo para aterrizar
    horseChance: [0.12, 0.55],            // escala de libros simples hacia más caballos
    doubleBookChance: [0.05, 0.38],       // libros dobles aparecen más frecuentemente al acelerar
    safeObstacles: 2                      // los primeros 2 obstáculos son siempre libros simples
  },

  points: { toast: 100, tortilla: 200, mate: 500 },
  deadInputLock: 450                      // ms antes de poder reiniciar
};


/* =============================================================================
 * 3) UTILIDADES, AUDIO, FULLSCREEN
 * ============================================================================= */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp  = (a, b, t) => a + (b - a) * t;
const rand  = (a, b) => a + Math.random() * (b - a);
const pad   = (n, len = 5) => String(Math.max(0, Math.floor(n))).padStart(len, '0');

const $ = (id) => document.getElementById(id);
const dom = {
  canvas:     $('game'),
  overlay:    $('overlay'),
  startBtn:   $('start-btn'),
  label:      $('start-label'),
  toast:      $('toast'),
  probe:      $('safe-probe'),
  pickers:    Array.from(document.querySelectorAll('.picker__btn')),
  scoresBox:  $('hiscores-box'),
  scoresList: $('hiscores')
};
const ctx = dom.canvas.getContext('2d', { alpha: false });

function storageGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v; }
  catch (_) { return fallback; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, String(value)); } catch (_) { /* modo privado */ }
}

let toastTimer = 0;
function showToast(msg, ms = 4200) {
  if (!dom.toast) return;
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
  play(name, opt = 0) {
    const file = this.files[name];
    if (file) { try { file.currentTime = 0; file.play(); } catch (_) {} return; }
    switch (name) {
      case 'jump':
        this.tone(320, 640, 0.14);
        break;
      case 'airJump': {
        const step = Math.min(opt, 5);
        const f0 = 420 + step * 55;
        const f1 = 840 + step * 95;
        this.tone(f0, f1, 0.16);
        this.tone(f0 * 1.4, f1 * 1.3, 0.09, 'square', 0.04, 0.04);
        break;
      }
      case 'doubleJump':
        this.tone(480, 980, 0.18);
        this.tone(720, 1200, 0.12, 'square', 0.05, 0.06);
        break;
      case 'pickup':
        this.tone(880, 1320, 0.09, 'triangle', 0.1);
        this.tone(1320, 1760, 0.12, 'triangle', 0.1, 0.08);
        break;
      case 'mate': // sonido festivo triunfal para el mate (+500 pts!)
        this.tone(587, 880, 0.08, 'triangle', 0.12);
        this.tone(880, 1318, 0.10, 'triangle', 0.12, 0.06);
        this.tone(1318, 1760, 0.16, 'square', 0.10, 0.12);
        break;
      case 'hit':
        this.tone(220, 40, 0.4, 'sawtooth', 0.14);
        break;
      case 'milestone':
        this.tone(660, 660, 0.05, 'square', 0.08);
        this.tone(880, 880, 0.08, 'square', 0.08, 0.07);
        break;
    }
  }
};

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
let state = 'loading';          // loading | menu | running | paused | entry | dead
const savedCharacter = storageGet(CONFIG.storageChar, '');
let character = ASSETS.characters[savedCharacter] ? savedCharacter : CONFIG.defaultCharacter;

/* ---------- Tabla de puntajes estilo arcade (persistente en localStorage) ---------- */
const NAME_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const cleanName = (s) =>
  String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, CONFIG.initialsLength)
    .padEnd(CONFIG.initialsLength, 'A');

const DEFAULT_SCORES = [
  { name: 'UNL', score: 500 },
  { name: 'MAT', score: 350 },
  { name: 'FAN', score: 200 },
  { name: 'RUN', score: 100 },
  { name: 'BOY', score: 50 }
];

const Scores = {
  list: [],                                   // [{ name, score }] ordenado de mayor a menor
  load() {
    try {
      const raw = JSON.parse(storageGet(CONFIG.storageScores, '[]'));
      this.list = (Array.isArray(raw) ? raw : [])
        .filter((e) => e && Number.isFinite(e.score) && e.score > 0)
        .map((e) => ({ name: cleanName(e.name), score: Math.floor(e.score) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, CONFIG.maxScores);
    } catch (_) { this.list = []; }

    // Migración retrocompatible o tabla arcade clásica inicial
    if (this.list.length === 0) {
      const oldHi = parseInt(storageGet('fanzine_runner_hi', '0'), 10) || 0;
      if (oldHi > 0) {
        this.list = [{ name: 'AAA', score: oldHi }, ...DEFAULT_SCORES.slice(1)];
      } else {
        this.list = DEFAULT_SCORES.map((e) => ({ ...e }));
      }
      this.save();
    }
  },
  save() { storageSet(CONFIG.storageScores, JSON.stringify(this.list)); },
  best() { return this.list.length ? this.list[0].score : 0; },
  qualifies(score) {
    return score > 0 && (this.list.length < CONFIG.maxScores ||
                         score > this.list[this.list.length - 1].score);
  },
  rankFor(score) {                            // puesto (1..n) que ocuparía; empates van abajo
    let i = 0;
    while (i < this.list.length && this.list[i].score >= score) i++;
    return i + 1;
  },
  add(name, score) {
    const rank = this.rankFor(score);
    this.list.splice(rank - 1, 0, { name: cleanName(name), score: Math.floor(score) });
    this.list.length = Math.min(this.list.length, CONFIG.maxScores);
    this.save();
    return rank;
  }
};
Scores.load();

let hiScore = Scores.best();
let initials = cleanName(storageGet(CONFIG.storageInitials, 'AAA'));

// Estado de la pantalla de ingreso de iniciales
const entryUI = { letters: initials.split(''), slot: 0, rank: 1, hits: [] };

/* Lista de mejores puntajes en la pantalla de inicio (DOM) */
function renderOverlayScores() {
  if (!dom.scoresList) return;
  dom.scoresList.textContent = '';
  Scores.list.slice(0, 5).forEach((e, i) => {
    const li = document.createElement('li');
    [(i + 1) + '.', e.name, pad(e.score)].forEach((txt, j) => {
      const s = document.createElement('span');
      s.className = ['rank', 'name', 'pts'][j];
      s.textContent = txt;
      li.appendChild(s);
    });
    dom.scoresList.appendChild(li);
  });
  dom.scoresBox.hidden = Scores.list.length === 0;
}

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
  groundScroll: 0, bgScroll: 0, gateX: 0,
  dinoSpeed: CONFIG.speed.start,
  dist: 0, bonus: 0, speed: 0, p: 0, time: 0,
  spawnDist: 0, spawned: 0,
  score: 0, newRecord: false,
  deadAt: 0, deadT: 0, pausedAt: 0,
  milestoneT: 0
};

function gateDims() {
  const img = IMG.gate;
  const aspect = img ? img.naturalWidth / img.naturalHeight : 1.904;
  // Escala del portal en la entrada: proporcional al alto disponible sobre la vereda
  const maxH = Math.max(180, (groundY - safeTop - 20) * 0.90);
  const h = Math.min(maxH, H * 0.76);
  return { w: h * aspect, h };
}
function placeGate() {
  // Portal a la derecha del personaje (según Imagen 2 de referencia)
  world.gateX = Math.max(heroX + U * 0.85, W * 0.28);
}

function resetRun() {
  world.obstacles.length = 0;
  world.pickups.length = 0;
  world.popups.length = 0;
  world.groundScroll = 0;
  world.bgScroll = 0;
  world.dinoSpeed = CONFIG.speed.start;
  world.dist = 0; world.bonus = 0; world.p = 0; world.time = 0; world.score = 0;
  world.milestoneT = 0;
  world.speed = W * CONFIG.speed.startFrac;
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
    hero.vy = V1;
    hero.grounded = false;
    hero.jumps = 1;
    hero.sinceJump = 0;
    hero.landT = 0;
    Sfx.play('jump');
  } else {
    // Salto ilimitado en el aire (no limitado a 2 saltos)
    hero.jumps++;
    hero.sinceDouble = 0;
    // Si estaba cayendo, frena de inmediato la caída y da impulso ascendente
    hero.vy = Math.max(hero.vy * 0.15 + V2, V2);
    Sfx.play('airJump', hero.jumps);
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

/* ---------- Ingreso de iniciales (arcade) ---------- */
const ENTRY_READY_AT = 0.55;                    // s: el panel aparece tras el golpe

function entryBlip() { Sfx.tone(700, 700, 0.04, 'square', 0.05); }

function cycleLetter(i, dir) {
  const idx = NAME_CHARS.indexOf(entryUI.letters[i]);
  entryUI.letters[i] = NAME_CHARS[(idx + dir + NAME_CHARS.length) % NAME_CHARS.length];
  entryUI.slot = i;
  entryBlip();
}

function confirmEntry() {
  initials = entryUI.letters.join('');
  storageSet(CONFIG.storageInitials, initials);
  world.addedRank = Scores.add(initials, world.score);
  hiScore = Scores.best();
  renderOverlayScores();
  entryUI.hits = [];
  state = 'dead';
  world.deadAt = performance.now();             // evita reinicio accidental con el mismo toque
  Sfx.play('pickup');
}

function handleEntryPointer(clientX, clientY) {
  if (world.deadT < ENTRY_READY_AT) return;
  const rect = dom.canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  for (const h of entryUI.hits) {
    if (x < h.x || x > h.x + h.w || y < h.y || y > h.y + h.h) continue;
    if (h.type === 'up') cycleLetter(h.i, 1);
    else if (h.type === 'down') cycleLetter(h.i, -1);
    else if (h.type === 'slot') { entryUI.slot = h.i; entryBlip(); }
    else if (h.type === 'ok') confirmEntry();
    return;
  }
}

function handleEntryKey(e) {
  if (world.deadT < ENTRY_READY_AT) return;
  const last = CONFIG.initialsLength - 1;
  if (/^[a-zA-Z]$/.test(e.key)) {
    e.preventDefault();
    entryUI.letters[entryUI.slot] = e.key.toUpperCase();
    entryUI.slot = Math.min(entryUI.slot + 1, last);
    entryBlip();
  } else if (e.key === 'Backspace') {
    e.preventDefault();
    entryUI.slot = Math.max(entryUI.slot - 1, 0);
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault(); entryUI.slot = Math.max(entryUI.slot - 1, 0);
  } else if (e.key === 'ArrowRight') {
    e.preventDefault(); entryUI.slot = Math.min(entryUI.slot + 1, last);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault(); cycleLetter(entryUI.slot, 1);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault(); cycleLetter(entryUI.slot, -1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (!e.repeat) confirmEntry();
  } else if (e.key === ' ') {
    e.preventDefault();
  }
}

let lastMenuTap = 0;

function handleMenuTap(clientX, clientY) {
  if (state !== 'menu') return;
  const now = performance.now();
  const isDoubleTap = (now - lastMenuTap < 420);
  lastMenuTap = now;

  const rect = dom.canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;

  const { w, h } = gateDims();
  const gateY = groundY + U * 0.18 - h;
  // Clic/tap sobre el portal de la universidad
  const inGate = (x >= world.gateX && x <= world.gateX + w && y >= gateY && y <= gateY + h);

  if (inGate || isDoubleTap) {
    startFromOverlay();
  }
}

window.addEventListener('pointerdown', (e) => {
  if (state === 'menu') {
    handleMenuTap(e.clientX, e.clientY);
    return;
  }
  if (state === 'loading') return;
  e.preventDefault();
  if (state === 'entry') { handleEntryPointer(e.clientX, e.clientY); return; }
  onPress();
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (state === 'entry') { handleEntryKey(e); return; }
  const isJump = e.code === 'Space' || e.code === 'ArrowUp' || e.key === ' ' || e.key === 'ArrowUp';
  const isEnter = e.key === 'Enter' && (state === 'dead' || state === 'menu');
  if (!isJump && !isEnter) return;
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

  // Recompensa especial: ¡Mate de 500 puntos cada tanto!
  const isMateSpawn = world.spawned >= 3 && (world.spawned % 5 === 0 || Math.random() < 0.22);
  if (isMateSpawn) {
    const pd = pickupDims('mate');
    // Se ubica alto en el aire para aprovechar el multi-salto
    const mateHeight = rand(2.35, 2.75);
    world.pickups.push({
      kind: 'mate',
      x: x0 + width + rand(U * 0.6, U * 1.5),
      hU: mateHeight,
      phase: rand(0, 6.28)
    });
  }

  const gapSec = rand(lerp(S.gapMin[0], S.gapMin[1], p), lerp(S.gapMax[0], S.gapMax[1], p))
               + (isHorse ? S.horseExtraGap : 0);
  const gapPx = gapSec * world.speed;
  world.spawnDist = width + gapPx;

  if (Math.random() < 0.35 && !isMateSpawn) {                          // tostado "gratis" en el piso
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
  world.newRecord = world.score > Scores.best();
  world.addedRank = 0;
  entryUI.hits = [];
  if (Scores.qualifies(world.score)) {         // entra en el top 10 -> pide iniciales
    state = 'entry';
    entryUI.letters = initials.split('');
    entryUI.slot = 0;
    entryUI.rank = Scores.rankFor(world.score);
  }
}

function update(dt) {
  const S = CONFIG.speed;
  const frames = dt * 60; // frames normalizados a 60 fps (independiente de la tasa de refresco)
  world.time += dt;

  // Aceleración idéntica al Dinosaurio de Google (Runner.config.ACCELERATION = 0.001 por frame hasta 13)
  if (world.dinoSpeed < S.max) {
    world.dinoSpeed = Math.min(S.max, world.dinoSpeed + S.acceleration * frames);
  }
  world.p = clamp((world.dinoSpeed - S.start) / (S.max - S.start), 0, 1);
  world.speed = W * lerp(S.startFrac, S.maxFrac, world.p);
  const dx = world.speed * dt;

  world.groundScroll += dx;
  world.bgScroll += (world.speed * 0.45) * dt;
  world.dist += world.dinoSpeed * frames;

  // Puntuación idéntica a Google Dino (DistanceMeter COEFFICIENT: 0.025) + bonus
  const prev100 = Math.floor(world.score / 100);
  world.score = Math.floor(world.dist * 0.025) + world.bonus;
  const new100 = Math.floor(world.score / 100);
  if (new100 > prev100 && world.score >= 100) {
    Sfx.play('milestone');
    world.milestoneT = 1.0;
  }
  if (world.milestoneT > 0) world.milestoneT -= dt;

  world.gateX -= dx;

  // --- Héroe ---
  hero.animT += dt;
  hero.sinceDouble += dt;
  hero.buffer = Math.max(0, hero.buffer - dt);
  if (hero.landT > 0) hero.landT -= dt;
  if (!hero.grounded) {
    hero.sinceJump += dt;
    hero.vy -= (hero.jumps > 1 ? GRAV2 : GRAV) * dt;
    hero.h += hero.vy * dt;

    // Límite de techo para que no se pierda por arriba de la pantalla al saltar muchas veces
    const maxHeroH = Math.max(2.4, (groundY - safeTop - U * 0.45) / U);
    if (hero.h > maxHeroH) {
      hero.h = maxHeroH;
      hero.vy = Math.min(hero.vy, 0);
    }

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
      const isMate = p.kind === 'mate';
      world.popups.push({
        text: '+' + pts,
        x: heroX + U * 0.4,
        y: groundY - (hero.h + 1.2) * U,
        t: 0,
        gold: isMate
      });
      if (isMate) {
        Sfx.play('mate');
        world.milestoneT = 1.2;
      } else {
        Sfx.play('pickup');
      }
    }
  }
}


/* =============================================================================
 * 6) RENDER
 * ============================================================================= */
const JUMP_APEX_BAND = 1.8;   // |vy| (U/s) por debajo del cual se muestra el frame de apex

// Paleta institucional UNLaM (#299F80)
const UNLAM = {
  green: '#299F80',   // Verde oficial UNLaM
  light: '#42bfa0',   // Verde claro / resplandor
  glow:  '#5cd4b6',   // Verde menta
  dark:  '#1b6d58',   // Verde profundo
  white: '#ffffff'
};

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
  const frameDur = lerp(0.11, 0.045, world.p);
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

  // Los frames corre1 y corre2 (exportados a 1x con ~106px de alto) se escalan a 1.5x
  // para coincidir exactamente con los demás sprites (160px)
  const scale = img.naturalHeight < 120 ? 1.5 : 1;
  const w = img.naturalWidth * k * scale, h = img.naturalHeight * k * scale;
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

function drawInfiniteBackground() {
  const img = IMG.fondoinfinito;
  if (!img) {
    ctx.fillStyle = '#10141e';
    ctx.fillRect(0, 0, W, stripTop);
    return;
  }
  const bgH = stripTop + 6;
  const s = bgH / img.naturalHeight;
  const bgW = Math.ceil(img.naturalWidth * s);
  const scroll = (world.bgScroll || 0) % bgW;
  for (let x = -scroll; x < W; x += bgW) {
    ctx.drawImage(img, x, 0, bgW, bgH);
  }
}

function drawMenuBackground() {
  // 1) Fondo de inicio (cielo, nubes, árboles y horizonte de la UNLaM)
  const bgImg = IMG.fondoinicio;
  if (bgImg) {
    const bgH = stripTop + 6;
    const s = bgH / bgImg.naturalHeight;
    const bgW = Math.ceil(bgImg.naturalWidth * s);
    const offset = Math.max(0, (bgW - W) * 0.25);
    for (let x = -offset; x < W; x += bgW) {
      ctx.drawImage(bgImg, x, 0, bgW, bgH);
    }
  } else {
    ctx.fillStyle = '#7ec0ee';
    ctx.fillRect(0, 0, W, stripTop);
  }

  // 2) Reja modular que bordea la vereda (Imagen 2)
  const rejaImg = IMG.reja;
  if (rejaImg) {
    const rejaH = U * 1.25;
    const s = rejaH / rejaImg.naturalHeight;
    const rejaW = Math.ceil(rejaImg.naturalWidth * s);
    const rejaY = stripTop - rejaH + U * 0.12;
    for (let x = 0; x < W; x += rejaW) {
      ctx.drawImage(rejaImg, x, rejaY, rejaW, rejaH);
    }
  }
}

function drawGate() {
  const img = IMG.gate;
  if (!img) return;
  const { w, h } = gateDims();
  if (world.gateX + w < 0) return;
  const gateY = groundY + U * 0.18 - h;
  ctx.drawImage(img, world.gateX, gateY, w, h);

  // En la pantalla de inicio, indicador visual animado sobre la puerta abierta
  if (state === 'menu') {
    const doorX = world.gateX + w * 0.50;
    const doorY = groundY - h * 0.35;
    const pulse = 0.88 + 0.12 * Math.sin(performance.now() / 240);
    ctx.save();
    ctx.translate(doorX, doorY);
    ctx.scale(pulse, pulse);

    const badgeW = Math.max(92, U * 0.95);
    const badgeH = 28;
    ctx.fillStyle = 'rgba(41, 159, 128, 0.92)';
    rrect(-badgeW / 2, -badgeH / 2, badgeW, badgeH, 14);
    ctx.fill();
    ctx.strokeStyle = '#5cd4b6';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    drawText('ENTRAR', 0, 1, 13, { color: '#ffffff', stroke: 'rgba(0,0,0,0)', weight: 800 });
    ctx.restore();
  }
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
    const col = p.gold ? '#ffd34d' : UNLAM.green;
    const s = p.gold ? size * 1.35 : size;
    drawText(p.text, p.x, p.y - k * U * 0.6, s, { color: col, alpha: 1 - k * k });
  }
}

function drawHUD() {
  const size = clamp(U * 0.2, 14, 28);
  const y = safeTop + 14 + size / 2;
  const m = 14;
  const isMilestone = world.milestoneT > 0 && Math.floor(world.milestoneT * 6) % 2 === 0;
  drawText('PUNTOS ' + pad(world.score), m, y, size, {
    align: 'left',
    color: isMilestone ? UNLAM.light : '#fff'
  });
  drawText('RÉCORD ' + pad(Math.max(hiScore, world.score)), W - m, y, size,
           { align: 'right', color: UNLAM.green });
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

function rrect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawTriangle(cx, cy, size, up, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  const d = up ? -1 : 1;
  ctx.moveTo(cx, cy + d * size * 0.6);
  ctx.lineTo(cx - size, cy - d * size * 0.5);
  ctx.lineTo(cx + size, cy - d * size * 0.5);
  ctx.closePath();
  ctx.fill();
}

/* Pantalla de ingreso de iniciales: ▲/▼ cambian la letra, tocar la casilla la selecciona */
function drawEntryPanel(blink) {
  ctx.fillStyle = 'rgba(6, 8, 16, 0.74)';
  ctx.fillRect(0, 0, W, H);

  const n = CONFIG.initialsLength;
  const f = clamp(Math.min(W * 0.06, H * 0.045), 12, 30);
  const slot = f * 2.6, gap = f * 0.7;
  const arrowH = Math.max(f * 2, 40);
  const btnH = f * 2.4, btnW = Math.max(f * 8, 130);
  const titleH = f * 1.9, lineH = f * 1.35;
  const total = titleH + lineH * 2 + arrowH * 2 + slot + f * 0.5 + btnH + f * 1.4;
  let y = Math.max(safeTop + 8, (H - total) / 2);
  const hits = [];

  drawText('¡NUEVO PUNTAJE!', W / 2, y + titleH / 2, f * 1.5, { color: UNLAM.green, alpha: blink ? 1 : 0.75 });
  y += titleH;
  drawText('PUNTOS ' + pad(world.score), W / 2, y + lineH / 2, f);
  y += lineH;
  drawText('PUESTO #' + entryUI.rank, W / 2, y + lineH / 2, f * 0.9, { color: UNLAM.light });
  y += lineH;

  const x0 = (W - (n * slot + (n - 1) * gap)) / 2;
  const arrowsY = [y, y + arrowH + slot];
  for (let i = 0; i < n; i++) {
    const x = x0 + i * (slot + gap), cx = x + slot / 2;
    const active = i === entryUI.slot;
    const col = active ? UNLAM.green : 'rgba(255,255,255,0.8)';

    drawTriangle(cx, arrowsY[0] + arrowH / 2, f * 0.7, true, col);
    hits.push({ type: 'up', i, x, y: arrowsY[0], w: slot, h: arrowH });

    const by = y + arrowH;
    rrect(x, by, slot, slot, f * 0.4);
    ctx.fillStyle = active ? 'rgba(41, 159, 128, 0.22)' : 'rgba(255,255,255,0.10)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = active ? (blink ? UNLAM.green : 'rgba(41,159,128,0.45)') : 'rgba(255,255,255,0.35)';
    ctx.stroke();
    drawText(entryUI.letters[i], cx, by + slot / 2 + slot * 0.04, slot * 0.72, { color: active ? UNLAM.green : '#fff' });
    hits.push({ type: 'slot', i, x, y: by, w: slot, h: slot });

    drawTriangle(cx, arrowsY[1] + arrowH / 2, f * 0.7, false, col);
    hits.push({ type: 'down', i, x, y: arrowsY[1], w: slot, h: arrowH });
  }
  y += arrowH * 2 + slot + f * 0.5;

  const bx = (W - btnW) / 2;
  const grad = ctx.createLinearGradient(0, y, 0, y + btnH);
  grad.addColorStop(0, UNLAM.light); grad.addColorStop(1, UNLAM.green);
  rrect(bx, y, btnW, btnH, btnH / 2);
  ctx.fillStyle = grad;
  ctx.fill();
  drawText('LISTO', W / 2, y + btnH / 2 + 1, f * 1.1, { color: '#ffffff', stroke: 'rgba(0,0,0,0)' });
  hits.push({ type: 'ok', x: bx, y, w: btnW, h: btnH });
  y += btnH;
  drawText('Elegí tus iniciales', W / 2, y + f * 0.9, f * 0.7, { alpha: 0.7, weight: 600 });

  entryUI.hits = hits;
}

/* Game Over con ranking (top 5/8 según alto de pantalla) */
function drawDeadPanel(blink) {
  ctx.fillStyle = 'rgba(6, 8, 16, 0.62)';
  ctx.fillRect(0, 0, W, H);

  const f = clamp(Math.min(W * 0.05, H * 0.042), 11, 28);
  const cap = H >= 640 ? 8 : 5;
  const rows = Scores.list.slice(0, cap).map((e, i) => ({ rank: i + 1, name: e.name, score: e.score, isNew: world.addedRank === i + 1 }));
  if (world.addedRank > cap) {                  // el puesto nuevo quedó fuera del recorte: mostrarlo igual
    const e = Scores.list[world.addedRank - 1];
    rows[cap - 1] = { rank: world.addedRank, name: e.name, score: e.score, isNew: true };
  }

  const medal = [UNLAM.green, '#d9dee8', '#e0a070'];
  const lines = [
    { t: 'GAME OVER', s: 1.9, color: '#ff6b6b', gap: 0.3 },
    { t: 'PUNTOS ' + pad(world.score), s: 1.15 }
  ];
  if (world.newRecord) lines.push({ t: '¡NUEVO RÉCORD!', s: 1.0, color: UNLAM.light, blink: true });
  if (rows.length) {
    lines.push({ t: '— MEJORES PUNTAJES —', s: 0.9, color: UNLAM.green, gap: 0.5 });
    rows.forEach((r) => lines.push({
      t: String(r.rank).padStart(2, ' ') + '. ' + r.name + '  ' + pad(r.score),
      s: 1.0, color: medal[r.rank - 1] || '#fff', blink: r.isNew, alt: UNLAM.light
    }));
  }
  lines.push({ t: 'Tocá para reiniciar', s: 0.9, gap: 0.7, blink: true, dim: true });

  const hOf = (l) => f * l.s * 1.4 + (l.gap || 0) * f;
  const total = lines.reduce((a, l) => a + hOf(l), 0);
  let y = Math.max(safeTop + 8, (H - total) / 2);
  for (const l of lines) {
    const h = hOf(l);
    let color = l.color || '#fff', alpha = 1;
    if (l.blink && l.alt) color = blink ? l.alt : l.color;      // fila nueva: alterna verde/medalla
    else if (l.blink) alpha = l.dim ? (blink ? 1 : 0.35) : (blink ? 1 : 0.5);
    drawText(l.t, W / 2, y + (f * l.s * 1.4) / 2 + (l.gap || 0) * f, f * l.s, { color, alpha });
    y += h;
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
  ctx.clearRect(0, 0, W, H);

  let shake = false;
  if (state === 'dead' && world.deadT < 0.28) {
    shake = true;
    ctx.save();
    const a = U * 0.06 * (1 - world.deadT / 0.28);
    ctx.translate(rand(-a, a), rand(-a, a));
  }

  if (state === 'menu' || state === 'loading') {
    drawMenuBackground();
    drawGround();
    drawGate();
    drawHero();
  } else {
    drawInfiniteBackground();
    drawGround();
    drawGate();
    drawPickups();
    drawObstacles();
    drawHero();
    drawPopups();
  }
  if (CONFIG.debug) drawDebug();

  if (shake) ctx.restore();
  if (state === 'running' || state === 'dead' || state === 'entry' || state === 'paused') drawHUD();

  const blink = Math.floor(performance.now() / 500) % 2 === 0;

  if (state === 'dead' || state === 'entry') {
    if (world.deadT < 0.18) {                    // flash de impacto
      ctx.fillStyle = `rgba(255,255,255,${0.55 * (1 - world.deadT / 0.18)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (state === 'entry') {
      if (world.deadT >= ENTRY_READY_AT) drawEntryPanel(blink);
    } else {
      drawDeadPanel(blink);
    }
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
  else if (state === 'dead' || state === 'entry') world.deadT += dt;
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

function startFromOverlay() {
  if (starting || state !== 'menu') return;
  starting = true;

  // Audio y pantalla completa
  Sfx.unlock();
  goFullscreen();

  dom.overlay.classList.add('is-hidden');
  layout();
  beginRun();
  starting = false;
}

function setupOverlay() {
  dom.pickers.forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    selectCharacter(b.dataset.char);
  }));
  if (dom.startBtn) {
    dom.startBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      startFromOverlay();
    });
  }
}

async function main() {
  Sfx.init();
  setupOverlay();
  renderOverlayScores();
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
  if (dom.label) dom.label.innerHTML = 'Hacé <b>clic en la puerta</b> o <b>dos toques</b> para entrar';
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
