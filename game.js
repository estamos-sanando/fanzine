'use strict';

/* =============================================================================
 *  FANZINE RUNNER  ·  Canvas 2D + FSM cinemática  ·  Vanilla JS (ES6+)
 * =============================================================================
 *  FSM States: CHARACTER_SELECT → INTRO_BUS → TUTORIAL → CAMPUS_ENTRANCE →
 *              VENDING_MACHINE → PLAYING → GAME_OVER (+ ENTRY)
 *
 *  Cada estado tiene su propio update(dt) y draw(ctx).
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
    logo:          'ASSETS/logonoterindas.png',  // Logo oficial "¡No te rindas!"
    fondoinfinito: 'ASSETS/fondoinfinito.png',   // fondo infinito durante la carrera (Teatro, Auditorio, Biblioteca)
    ground:        'ASSETS/SUELO.png',           // vereda
    book:          'ASSETS/manualobstaculo.png', // obstáculo bajo
    horse:         'ASSETS/caballoobstaculo.png',// obstáculo alto
    toast:         'ASSETS/100puntostostado.png',// +100
    tortilla:      'ASSETS/200puntostortilla.png',// +200
    mate:          'ASSETS/500puntosmate.png',   // +500 recompensa alta especial
    fondoInicio:   'ASSETS/fondoinicio.png',    // fondo escena del bondi
    fondoEntrada:  'ASSETS/fondoentrada.png',    // fondo de la entrada a UNLaM
    bus620closed:  'ASSETS/620cerrado.png',      // bondi cerrado
    bus620open:    'ASSETS/620abrepoco.png',     // bondi con puerta abierta
  },

  // Avión publicitario de Instagram en el tutorial (@nella_costa)
  avion: [
    'ASSETS/avion.png',
    'ASSETS/avion1.png',
    'ASSETS/avion2.png'
  ],

  // Avión oficial "No te rindas" durante el juego
  avionNoTeRindas: [
    'ASSETS/avionnoterindas.png',
    'ASSETS/avionnoterindas1.png',
    'ASSETS/avionnoterindas2.png'
  ],

  // Bus con personaje bajando
  bus620sale: {
    chica: 'ASSETS/620chicasale.png',
    chico: 'ASSETS/620chicosale.png'
  },

  // Obstáculo aéreo: tero en vuelo (4 frames de aleteo, miran a la derecha => se espejan)
  tero: [
    'ASSETS/terovolando1.png',
    'ASSETS/terovolando2.png',
    'ASSETS/terovolando3.png',
    'ASSETS/terovolando4.png'
  ],

  // Máquina expendedora (4 frames de animación)
  maquina: [
    'ASSETS/maquina1.png',
    'ASSETS/maquina2.png',
    'ASSETS/maquina3.png',
    'ASSETS/maquina4.png'
  ],

  // Coca / bebida animación (4 frames cada personaje)
  coca: {
    chica: ['ASSETS/cocachica1.png', 'ASSETS/cocachica2.png', 'ASSETS/cocachica3.png', 'ASSETS/cocachica4.png'],
    chico: ['ASSETS/cocachico1.png', 'ASSETS/cocachico2.png', 'ASSETS/cocachico3.png', 'ASSETS/cocachico4.png']
  },

  // Diálogos del tutorial (6 frames cada personaje: 0=base, 1-5=secuencia)
  dialogo: {
    chica: ['ASSETS/chicadialogo.png', 'ASSETS/chicadialogo1.png', 'ASSETS/chicadialogo2.png',
            'ASSETS/chicadialogo3.png', 'ASSETS/chicadialogo4.png', 'ASSETS/chicadialogo5.png'],
    chico: ['ASSETS/chicodialogo.png', 'ASSETS/chicodialogo1.png', 'ASSETS/chicodialogo2.png',
            'ASSETS/chicodialogo3.png', 'ASSETS/chicodialogo4.png', 'ASSETS/chicodialogo5.png']
  },

  // Personaje caminando hacia la puerta (perspectiva de espalda)
  caminaPuerta: {
    chica: ['ASSETS/chicacaminapuerta.png', 'ASSETS/chicacaminapuerta2.png'],
    chico: ['ASSETS/chicocaminapuerta.png', 'ASSETS/chicocaminapuerta2.png']
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
  godMode: /[?&]god\b/.test(location.search),   // ?god activa modo invencible para testing visual
  skipCinematic: /[?&]skip\b/.test(location.search), // ?skip salta las cinemáticas
  extremeTest: /[?&]extreme\b/.test(location.search), // ?extreme arranca en modo extremo (10.000 pts) para testing visual
  storageScores:   'fanzine_runner_global_v2',  // copia local del ranking global (para mostrar sin conexión)
  storagePending:  'fanzine_runner_pending',    // puntajes que todavía no se pudieron enviar al servidor
  storageInitials: 'fanzine_runner_initials',   // últimas iniciales usadas
  storagePersonalRecord: 'fanzine_runner_personal_record', // récord personal en este dispositivo
  apiScores: '/api/scores',                     // endpoint local/Vercel (api/scores.js)
  cloudScores: 'https://api.restful-api.dev/objects/ff808181a09d98f701a18d9ecd606591', // cloud backend global compartido
  apiTimeout: 5500,                             // ms antes de alternar al cloud
  maxScores: 5,                                 // Cantidad visualizada en Top 5
  maxScoresStored: 500,                         // Cantidad total conservada en el ranking global
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
  size: { book: 0.55, horse: 1.30, pickup: 0.50, mate: 0.58, tero: 0.62 },

  // Hitboxes: margen recortado en cada lado
  hitbox: {
    book:  { l: 0.14, r: 0.14, t: 0.10, b: 0.00 },
    horse: { l: 0.16, r: 0.18, t: 0.08, b: 0.04 },
    tero:  { l: 0.20, r: 0.20, t: 0.20, b: 0.22 }   // relativo a la caja de referencia del tero
  },

  // Tero: vuela cruzando la pantalla desde la derecha. Alterna entre alto y bajo cada tanto.
  // Si el jugador permanece >10s en el aire, sale un tero de inmediato a su altura para nivelar la dificultad.
  tero: {
    refW: 130, refH: 110,   // caja de referencia (px del sprite) común a los 4 frames
    bob: 0.04,              // vaivén vertical suave de aleteo (en U)
    frameDur: 0.09,         // s por frame de aleteo
    intervalMin: 10,        // segundos mínimos entre apariciones regulares
    intervalMax: 15,        // segundos máximos entre apariciones regulares
    firstDelay: 4.5,        // primer tero a los 4.5 segundos de arrancar
    airAbuseTime: 10.0      // segundos continuos en el aire antes de lanzar tero inmediato
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
  speed: {
    start: 6,             // SPEED inicial (0.60 pantallas/s)
    max: 13.5,            // MAX_SPEED desafiante (1.35 pantallas/s)
    acceleration: 0.0028, // Aceleración acelerada (+0.168/s)
    startFrac: 0.60,      // factor de ancho de pantalla por segundo al iniciar
    maxFrac: 1.35         // factor de ancho de pantalla por segundo a vel. máxima
  },

  // Spawner: la separación se reduce y la variedad de obstáculos aumenta con la velocidad
  spawn: {
    firstDelayFrac: 1.0,                  // margen inicial tras tocar COMENZAR (~1.6s de pista libre)
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
  canvas:          $('game'),
  toast:           $('toast'),
  probe:           $('safe-probe'),
  overlay:         $('overlay'),
  startBtn:        $('start-btn'),
  pickers:         Array.from(document.querySelectorAll('.picker__btn')),
  scoresBox:       $('hiscores-box'),
  scoresList:      $('hiscores'),
  scoresState:     $('hiscores-status'),
  scoresPersonal:  $('personal-record-pts'),
  menuBtn:         $('menu-btn'),
  skipTutorialBtn: $('skip-tutorial-btn')
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
      case 'talk':
        this.tone(rand(420, 520), 380, 0.035, 'triangle', 0.035);
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
      case 'busHorn':
        this.tone(280, 280, 0.35, 'sawtooth', 0.10);
        this.tone(350, 350, 0.35, 'sawtooth', 0.08, 0.30);
        break;
      case 'doorOpen':
        this.tone(440, 520, 0.15, 'triangle', 0.06);
        break;
      case 'steps':
        this.tone(120, 80, 0.08, 'square', 0.04);
        break;
      case 'vendingDrop':
        this.tone(600, 200, 0.25, 'triangle', 0.10);
        this.tone(200, 120, 0.15, 'square', 0.06, 0.22);
        break;
      case 'drink':
        this.tone(300, 450, 0.12, 'sine', 0.06);
        this.tone(450, 600, 0.10, 'sine', 0.05, 0.10);
        break;
      case 'startRun':
        this.tone(440, 880, 0.12, 'square', 0.08);
        this.tone(660, 1320, 0.14, 'square', 0.06, 0.08);
        this.tone(880, 1760, 0.10, 'triangle', 0.08, 0.16);
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
  IMG.tero = [];
  jobs.push(Promise.all(ASSETS.tero.map(loadImage)).then((arr) => { IMG.tero = arr.filter(Boolean); }));

  // Avión promocional de Instagram (tutorial)
  IMG.avion = [];
  jobs.push(Promise.all(ASSETS.avion.map(loadImage)).then((arr) => { IMG.avion = arr.filter(Boolean); }));

  // Avión oficial durante el juego ("No te rindas")
  IMG.avionNoTeRindas = [];
  jobs.push(Promise.all(ASSETS.avionNoTeRindas.map(loadImage)).then((arr) => { IMG.avionNoTeRindas = arr.filter(Boolean); }));

  // Máquina expendedora frames
  IMG.maquina = [];
  jobs.push(Promise.all(ASSETS.maquina.map(loadImage)).then((arr) => { IMG.maquina = arr.filter(Boolean); }));

  // Bus 620 con personaje bajando
  IMG.bus620sale = {};
  for (const [id, src] of Object.entries(ASSETS.bus620sale)) {
    jobs.push(loadImage(src).then((img) => { IMG.bus620sale[id] = img; }));
  }

  // Coca frames
  IMG.coca = {};
  for (const [id, arr] of Object.entries(ASSETS.coca)) {
    jobs.push(Promise.all(arr.map(loadImage)).then((imgs) => { IMG.coca[id] = imgs.filter(Boolean); }));
  }

  // Diálogo frames
  IMG.dialogo = {};
  for (const [id, arr] of Object.entries(ASSETS.dialogo)) {
    jobs.push(Promise.all(arr.map(loadImage)).then((imgs) => { IMG.dialogo[id] = imgs.filter(Boolean); }));
  }

  // Camina puerta frames
  IMG.caminaPuerta = {};
  for (const [id, arr] of Object.entries(ASSETS.caminaPuerta)) {
    jobs.push(Promise.all(arr.map(loadImage)).then((imgs) => { IMG.caminaPuerta[id] = imgs.filter(Boolean); }));
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
let stripTop = 0, stripH = 0, groundY = 0, heroX = 0, safeTop = 0, safeLeft = 0, safeRight = 0, safeBottom = 0;
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

  const probeStyle = getComputedStyle(dom.probe);
  safeTop    = parseFloat(probeStyle.paddingTop) || 0;
  safeLeft   = parseFloat(probeStyle.paddingLeft) || 0;
  safeRight  = parseFloat(probeStyle.paddingRight) || 0;
  safeBottom = parseFloat(probeStyle.paddingBottom) || 0;

  buildGroundTile();

  // Reescalar entidades en vuelo si cambió el ancho (rotación / barra del navegador)
  if (prevW && prevW !== W) {
    const k = W / prevW;
    world.obstacles.forEach((o) => { o.x *= k; });
    world.pickups.forEach((p) => { p.x *= k; });
    world.popups.forEach((p) => { p.x *= k; });
  }

  checkOrientation();
}

function checkOrientation() {
  const modal = document.getElementById('rotate-device-modal');
  if (!modal) return;
  const isPortrait = window.innerHeight > window.innerWidth;
  const isMobileOrTablet = ('ontouchstart' in window) ||
    (navigator.maxTouchPoints > 0) ||
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
    (Math.max(window.innerWidth, window.innerHeight) <= 1024);

  if (isPortrait && isMobileOrTablet) {
    modal.classList.add('is-active');
  } else {
    modal.classList.remove('is-active');
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
 * 5) FSM – MÁQUINA DE ESTADOS FINITA
 * ============================================================================= */
const STATES = {
  LOADING:          'LOADING',
  CHARACTER_SELECT: 'CHARACTER_SELECT',
  INTRO_BUS:        'INTRO_BUS',
  TUTORIAL:         'TUTORIAL',
  CAMPUS_ENTRANCE:  'CAMPUS_ENTRANCE',
  VENDING_MACHINE:  'VENDING_MACHINE',
  PLAYING:          'PLAYING',
  GAME_OVER:        'GAME_OVER',
  ENTRY:            'ENTRY',
  PAUSED:           'PAUSED'
};

let state = STATES.LOADING;
const savedCharacter = storageGet(CONFIG.storageChar, '');
let character = ASSETS.characters[savedCharacter] ? savedCharacter : CONFIG.defaultCharacter;
window.selectedCharacter = character === 'chica' ? 'girl' : 'boy';
window.selectedCharacterId = character;

// Transition helper
function transitionTo(newState) {
  const prev = state;
  state = newState;
  if (dom.skipTutorialBtn) {
    dom.skipTutorialBtn.classList.toggle('is-visible', newState === STATES.TUTORIAL);
  }
  if (stateHandlers[newState] && stateHandlers[newState].enter) {
    stateHandlers[newState].enter(prev);
  }
}


/* =============================================================================
 * 5b) RANKING GLOBAL
 * ============================================================================= */
const NAME_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const cleanName = (s) =>
  String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, CONFIG.initialsLength)
    .padEnd(CONFIG.initialsLength, 'A');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const INITIAL_SCORES = [
  { name: 'UNL', score: 1200 },
  { name: 'FAN', score: 950 },
  { name: 'MAT', score: 780 },
  { name: 'RUN', score: 620 },
  { name: 'BOY', score: 500 },
  { name: 'GRL', score: 420 },
  { name: 'SAN', score: 350 },
  { name: 'JMP', score: 280 },
  { name: 'TOP', score: 200 },
  { name: 'WIN', score: 150 }
];

const Scores = {
  remote: [],             // último top global confirmado por el servidor/cloud [{ name, score }]
  list: [],               // lo que se muestra: remote + puntajes propios pendientes, de mayor a menor
  pending: [],            // [{ id, name, score }] puntajes que todavía no llegaron al servidor
  status: 'loading',      // loading | ok | offline
  version: 0,             // sube con cada envío confirmado (descarta GETs viejos)
  syncing: false,
  onChange: null,         // callback: cambió la lista o el estado
  onRank: null,           // callback(id, rank): el servidor confirmó un puntaje enviado

  load() {
    try {
      const stored = JSON.parse(storageGet(CONFIG.storageScores, 'null')) ||
                     JSON.parse(storageGet('fanzine_runner_global', 'null'));
      this.remote = stored ? this.sanitize(stored) : [...INITIAL_SCORES];
    } catch (_) {
      this.remote = [...INITIAL_SCORES];
    }
    try {
      const raw = JSON.parse(storageGet(CONFIG.storagePending, '[]'));
      this.pending = (Array.isArray(raw) ? raw : []).filter((e) => e && e.id && Number.isFinite(e.score))
        .map((e) => ({ id: String(e.id), name: cleanName(e.name), score: Math.floor(e.score) }));
    } catch (_) { this.pending = []; }
    this.rebuild();
  },
  sanitize(raw) {
    if (!Array.isArray(raw) || !raw.length) return [...INITIAL_SCORES];
    const valid = raw
      .filter((e) => e && Number.isFinite(Number(e.score)) && Number(e.score) > 0)
      .map((e) => ({ name: cleanName(e.name), score: Math.floor(Number(e.score)) }))
      .sort((a, b) => b.score - a.score);
    return valid.length ? valid.slice(0, CONFIG.maxScoresStored || 500) : [...INITIAL_SCORES];
  },
  // Muestra también los puntajes propios que aún no confirmó el servidor
  rebuild() {
    const out = (this.remote && this.remote.length) ? this.remote.slice() : [...INITIAL_SCORES];
    for (const p of this.pending) out.push({ name: p.name, score: p.score });
    this.list = this.sanitize(out);
  },
  save() {
    storageSet(CONFIG.storageScores, JSON.stringify(this.remote));
    // Guardar también en la clave anterior como resguardo
    storageSet('fanzine_runner_global', JSON.stringify(this.remote));
  },
  savePending() { storageSet(CONFIG.storagePending, JSON.stringify(this.pending)); },
  changed() { if (this.onChange) this.onChange(); },

  best() { return this.list.length ? this.list[0].score : 0; },
  qualifies(score) {
    // Todos los puntajes mayores a cero entran al ranking global
    return Number.isFinite(score) && score > 0;
  },
  rankFor(score) {                            // puesto (1..n) que ocuparía; empates van abajo
    let i = 0;
    while (i < this.list.length && this.list[i].score >= score) i++;
    return i + 1;
  },

  async request(method, body) {
    // 1. Intentar endpoint local o Vercel (/api/scores)
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), CONFIG.apiTimeout);
      const res = await fetch(CONFIG.apiScores, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
        signal: ctl.signal
      });
      clearTimeout(timer);
      if (res.ok) {
        return await res.json();
      }
    } catch (_) {}

    // 2. Si /api/scores no está disponible (ej: GitHub Pages o sin backend Node), usar Cloud REST directo
    const ctlCloud = new AbortController();
    const tCloud = setTimeout(() => ctlCloud.abort(), CONFIG.apiTimeout);
    try {
      if (method === 'GET') {
        const res = await fetch(CONFIG.cloudScores, { cache: 'no-store', signal: ctlCloud.signal });
        if (!res.ok) throw new Error('Cloud HTTP ' + res.status);
        const d = await res.json();
        const scores = (d && d.data && Array.isArray(d.data.scores)) ? d.data.scores : [];
        return { scores };
      } else if (method === 'POST') {
        let current = [];
        try {
          const curRes = await fetch(CONFIG.cloudScores, { cache: 'no-store', signal: ctlCloud.signal });
          if (curRes.ok) {
            const curData = await curRes.json();
            if (curData && curData.data && Array.isArray(curData.data.scores)) current = curData.data.scores;
          }
        } catch (_) {}
        const merged = this.sanitize([...current, body]);
        let rank = 1;
        while (rank <= merged.length && merged[rank - 1].score > body.score) rank++;

        await fetch(CONFIG.cloudScores, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'fanzine_scores', data: { scores: merged } }),
          signal: ctlCloud.signal
        });
        return { rank, scores: merged };
      }
    } finally {
      clearTimeout(tCloud);
    }
  },

  // Baja el ranking global y fusiona sin borrar puntajes propios
  async refresh() {
    const version = this.version;
    try {
      const data = await this.request('GET');
      if (data && Array.isArray(data.scores) && version === this.version) {
        // Fusión atómica: conserva siempre los puntajes más altos
        const combined = [...(this.remote || []), ...data.scores];
        this.remote = this.sanitize(combined);
        this.rebuild();
        this.save();
      }
      this.status = 'ok';
    } catch (_) {
      this.status = 'offline';
    }
    this.changed();
    if (this.status === 'ok') this.flush();
  },

  // Guarda al instante (se ve en el ranking) y envía en segundo plano
  submit(name, score) {
    const item = { id: uid(), name: cleanName(name), score: Math.floor(score) };
    const rank = this.rankFor(item.score);
    this.pending.push(item);
    this.savePending();
    // Guardar inmediatamente en remote para que NUNCA desaparezca
    this.remote = this.sanitize([...this.remote, { name: item.name, score: item.score }]);
    this.save();
    this.rebuild();
    this.changed();
    this.flush();
    return { id: item.id, rank };
  },

  async flush() {
    if (this.syncing || !this.pending.length) return;
    this.syncing = true;
    this.changed();
    try {
      while (this.pending.length) {
        const item = this.pending[0];
        try {
          const data = await this.request('POST', item);
          this.pending.shift();                       // confirmado: ya no es "pendiente"
          this.version++;
          this.savePending();
          if (data && Array.isArray(data.scores)) {
            const combined = [...(this.remote || []), ...data.scores];
            this.remote = this.sanitize(combined);
            this.rebuild();
            this.save();
          }
          this.status = 'ok';
          if (this.onRank && data && data.rank) this.onRank(item.id, data.rank);
          this.changed();
        } catch (e) {
          if (e && e.status === 400) {                // puntaje inválido: descartarlo
            this.pending.shift();
            this.savePending();
            this.rebuild();
            continue;
          }
          this.status = 'offline';                    // sin red / límite: reintenta luego
          break;
        }
      }
    } finally {
      this.syncing = false;
      this.changed();
    }
  }
};
Scores.load();

let personalRecord = parseInt(storageGet(CONFIG.storagePersonalRecord, '0'), 10) || 0;

function updatePersonalRecord(newScore = 0) {
  if (newScore > personalRecord) {
    personalRecord = Math.floor(newScore);
    storageSet(CONFIG.storagePersonalRecord, personalRecord);
  } else if (personalRecord === 0) {
    const currentInitials = cleanName(storageGet(CONFIG.storageInitials, ''));
    if (currentInitials && currentInitials !== 'AAA') {
      const myEntries = Scores.list.filter((e) => e.name === currentInitials);
      if (myEntries.length) {
        personalRecord = Math.max(...myEntries.map((e) => e.score));
        storageSet(CONFIG.storagePersonalRecord, personalRecord);
      }
    }
  }
  if (dom.scoresPersonal) {
    dom.scoresPersonal.textContent = pad(personalRecord);
  }
}

updatePersonalRecord();

let hiScore = Scores.best();
let initials = cleanName(storageGet(CONFIG.storageInitials, 'AAA'));

// Estado de la pantalla de ingreso de iniciales
const entryUI = { letters: initials.split(''), slot: 0, rank: 1, hits: [] };

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
  groundScroll: 0, bgScroll: 0,
  dinoSpeed: CONFIG.speed.start,
  dist: 0, bonus: 0, speed: 0, p: 0, time: 0,
  spawnDist: 0, spawned: 0,
  score: 0, newRecord: false,
  deadAt: 0, deadT: 0, pausedAt: 0,
  milestoneT: 0,
  plane: { active: false, x: 0, y: 0, w: 0, h: 0, t: 0, speed: 150, timer: 1.5 }
};

/* ---------- Avión publicitario en el cielo (Tutorial: @nella_costa | Juego: No te rindas) ---------- */
function updatePlane(dt) {
  const p = world.plane;
  if (!p) return;
  if (p.active) {
    p.t += dt;
    p.x -= p.speed * dt;
    // Vaivén suave en el cielo
    p.y += Math.sin(p.t * 2.5) * (0.30 * dt * 60);
    if (p.x + p.w < -60) {
      p.active = false;
      p.timer = rand(22, 34); // Próximo vuelo en 22 a 34 segundos
    }
  } else {
    p.timer -= dt;
    if (p.timer <= 0) {
      p.active = true;
      p.t = 0;
      p.h = clamp(H * 0.13, 44, 90);
      const isTut = state === STATES.TUTORIAL;
      const frames = (isTut ? IMG.avion : (IMG.avionNoTeRindas && IMG.avionNoTeRindas.length ? IMG.avionNoTeRindas : IMG.avion));
      const refImg = (frames && frames[0]) ? frames[0] : null;
      const aspect = refImg ? (refImg.naturalWidth / refImg.naturalHeight) : (1119 / 220);
      p.w = p.h * aspect;
      p.x = W + 40;
      p.y = clamp(H * 0.09, 18, 80);
      p.speed = Math.max(W * 0.16, 130);
    }
  }
}

function drawPlane(g = ctx) {
  const p = world.plane;
  if (!p || !p.active) return;
  const isTut = state === STATES.TUTORIAL;
  const frames = (isTut ? IMG.avion : (IMG.avionNoTeRindas && IMG.avionNoTeRindas.length ? IMG.avionNoTeRindas : IMG.avion));
  if (!frames || !frames.length) return;
  const frameDur = 0.11;
  const img = frames[Math.floor(p.t / frameDur) % frames.length];
  if (!img) return;
  g.drawImage(img, p.x, p.y, p.w, p.h);
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
  world.teroTimer = CONFIG.tero.firstDelay;      // primer tero a los 4.5 segundos
  world.teroAlt = 0;                            // 0 = más arriba, 1 = más abajo (alterna)
  world.newRecord = false;
  world.plane = { active: false, x: 0, y: 0, w: 0, h: 0, t: 0, speed: 150, timer: 1.5 };
  setExtremeMode(false);

  if (CONFIG.extremeTest) {
    world.bonus = 10000;
    world.score = 10000;
    setExtremeMode(true);
  }

  Object.assign(hero, { h: 0, vy: 0, grounded: true, jumps: 0, animT: 0, sinceJump: 0, sinceDouble: 99, landT: 0, buffer: 0, airTime: 0 });
}

function setExtremeMode(active) {
  world.isExtreme = !!active;
  if (!active) {
    world.extremeFlash = 0;
  }
  if (dom && dom.canvas) {
    dom.canvas.classList.toggle('is-extreme', !!active);
  }
  if (document.body) {
    document.body.classList.toggle('is-extreme', !!active);
  }
}

/* ---------- Dimensiones y hitboxes ---------- */
const aspectOf = (img) => (img ? img.naturalWidth / img.naturalHeight : 1);

function obstacleDims(kind) {
  if (kind === 'tero') {
    const T = CONFIG.tero;
    const s = (CONFIG.size.tero * U) / T.refH;       // px de sprite -> px de pantalla
    return { w: T.refW * s, h: T.refH * s, s };
  }
  const h = CONFIG.size[kind] * U;
  return { w: h * aspectOf(IMG[kind]), h };
}
// Centro vertical del tero: vuela en la zona del cielo
// Alterna entre "uno más arriba" (cielo alto) y "uno más abajo" (cielo bajo, sobre techos)
function teroCenterY(o) {
  const bob = Math.sin((o ? o.phase : 0)) * CONFIG.tero.bob * U;
  if (o && o.skyY !== undefined) {
    return o.skyY + bob;
  }
  const skyTop = safeTop + clamp(U * 0.28, 36, 68);
  const skyBottom = Math.max(skyTop + 35, stripTop * 0.30);
  // skyFrac: 0.10 = uno más arriba (cielo alto), 0.85 = uno más abajo (cielo bajo, sobre edificios)
  const frac = o && o.skyFrac !== undefined ? o.skyFrac : 0.50;
  const base = lerp(skyTop, skyBottom, frac);
  return base + bob;
}
function obstacleRect(o, customGroundY = groundY) {
  const { w, h } = obstacleDims(o.kind);
  const hb = CONFIG.hitbox[o.kind];
  if (o.kind === 'tero') {
    const top = teroCenterY(o) - h / 2;
    return { l: o.x + w * hb.l, r: o.x + w * (1 - hb.r), t: top + h * hb.t, b: top + h * (1 - hb.b) };
  }
  return {
    l: o.x + w * hb.l,
    r: o.x + w * (1 - hb.r),
    t: customGroundY - h * (1 - hb.t),
    b: customGroundY - h * hb.b
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
function heroRect(customGroundY = groundY) {
  const c = CONFIG.hero;
  return {
    l: heroX - c.halfWidth * U,
    r: heroX + c.halfWidth * U,
    t: customGroundY - (hero.h + c.top) * U,
    b: customGroundY - (hero.h + c.bottom) * U
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
    case STATES.PLAYING:
      tryJump();
      break;
    case STATES.GAME_OVER:
      if (performance.now() - world.deadAt > CONFIG.deadInputLock) beginRunFromMenu();
      break;
    case STATES.PAUSED:
      if (performance.now() - world.pausedAt > 200) { state = STATES.PLAYING; }
      break;
    // Tutorial: salto activo durante toda la práctica interactiva
    case STATES.TUTORIAL:
      tryJump();
      break;
    // Máquina expendedora: interacción con toque/clic
    case STATES.VENDING_MACHINE:
      triggerVendingDrop();
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
  const sent = Scores.submit(initials, world.score);   // se ve ya mismo; el servidor lo confirma en segundo plano
  world.submitId = sent.id;
  world.addedRank = sent.rank;
  entryUI.hits = [];
  transitionTo(STATES.GAME_OVER);
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

window.addEventListener('pointermove', (e) => {
  if (state === STATES.VENDING_MACHINE && cinema.vending && cinema.vending.phase === 'idle') {
    const rect = dom.canvas.getBoundingClientRect();
    const scaleX = W / (rect.width || W);
    const scaleY = H / (rect.height || H);
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    const maq = cinema.vending.maqRect;
    if (maq && x >= maq.x && x <= maq.x + maq.w && y >= maq.y && y <= maq.y + maq.h) {
      dom.canvas.style.cursor = 'pointer';
      return;
    }
  }
  dom.canvas.style.cursor = 'default';
});

window.addEventListener('pointerdown', (e) => {
  if (state === STATES.LOADING || state === STATES.CHARACTER_SELECT) return;          // el menú usa sus propios botones
  if (e.target && e.target.closest && e.target.closest('#menu-btn')) return;
  e.preventDefault();
  Sfx.unlock();
  if (state === STATES.ENTRY) { handleEntryPointer(e.clientX, e.clientY); return; }
  // Cinemáticas: interacción con la máquina expendedora
  if (state === STATES.VENDING_MACHINE) { handleVendingClick(e.clientX, e.clientY); return; }
  onPress();
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (state === STATES.LOADING) return;
  if (state === STATES.CHARACTER_SELECT) { handleMenuKey(e); return; }
  if (state === STATES.ENTRY) { handleEntryKey(e); return; }
  if (state === STATES.GAME_OVER && (e.key === 'm' || e.key === 'M' || e.key === 'Escape')) {
    e.preventDefault();
    showMenu();
    return;
  }
  if (state === STATES.VENDING_MACHINE && (e.code === 'Space' || e.key === ' ' || e.code === 'Enter' || e.key === 'Enter')) {
    e.preventDefault();
    triggerVendingDrop();
    return;
  }
  const isJump = e.code === 'Space' || e.code === 'ArrowUp' || e.key === ' ' || e.key === 'ArrowUp';
  const isEnter = e.key === 'Enter' && state === STATES.GAME_OVER;
  if (!isJump && !isEnter) return;
  e.preventDefault();
  if (e.repeat) return;
  Sfx.unlock();
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
    if (state === STATES.PLAYING) { state = STATES.PAUSED; world.pausedAt = performance.now(); }
  }
});


/* =============================================================================
 * 5c) SPAWNER DE VEREDA
 * ============================================================================= */
function spawnPattern() {
  const S = CONFIG.spawn;
  const p = world.p;
  const x0 = W + U;
  const isExtreme = world.score >= 10000;

  // A partir de los 10.000 puntos aumenta la probabilidad de caballos y obstáculos dobles
  const horseFactor = isExtreme ? Math.min(0.68, lerp(S.horseChance[0], S.horseChance[1], p) + 0.15) : lerp(S.horseChance[0], S.horseChance[1], p);
  const isHorse = world.spawned >= S.safeObstacles && Math.random() < horseFactor;
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
    const doubleFactor = isExtreme ? Math.min(0.50, lerp(S.doubleBookChance[0], S.doubleBookChance[1], p) + 0.15) : lerp(S.doubleBookChance[0], S.doubleBookChance[1], p);
    const double = world.spawned >= 4 && Math.random() < doubleFactor;
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
    const mateHeight = rand(2.35, 2.75);
    world.pickups.push({
      kind: 'mate',
      x: x0 + width + rand(U * 0.6, U * 1.5),
      hU: mateHeight,
      phase: rand(0, 6.28)
    });
  }

  let gapSec = rand(lerp(S.gapMin[0], S.gapMin[1], p), lerp(S.gapMax[0], S.gapMax[1], p))
               + (isHorse ? S.horseExtraGap : 0);
  if (isExtreme) {
    gapSec *= 0.82; // Espacio entre obstáculos más ajustado en modo extremo
  }
  const gapPx = gapSec * world.speed;
  world.spawnDist = width + gapPx;

  if (Math.random() < 0.35 && !isMateSpawn) {                          // tostado "gratis" en el piso
    const pd = pickupDims('toast');
    world.pickups.push({ kind: 'toast', x: x0 + width + gapPx / 2 - pd.w / 2, hU: 0.5, phase: rand(0, 6.28) });
  }
}

/* ---------- Tero en la zona del cielo ---------- */
function spawnSkyTero(isEmergency = false) {
  if (!IMG.tero || !IMG.tero.length) return;
  const T = CONFIG.tero;
  let skyFrac, skyY;

  if (isEmergency) {
    // Si el jugador persiste >10s solo en la zona aérea, sale a su misma altura para nivelar la dificultad
    const playerCenterY = groundY - (hero.h + 0.45) * U;
    skyY = clamp(playerCenterY, safeTop + 45, groundY - U * 1.3);
    Sfx.tone(480, 240, 0.22, 'sawtooth', 0.12);
    world.popups.push({
      text: '¡CUIDADO!',
      x: heroX + U * 0.4,
      y: groundY - (hero.h + 1.2) * U,
      t: 0,
      gold: true
    });
  } else {
    // Alterna: uno más arriba (0.10) y uno más abajo (0.85)
    skyFrac = world.teroAlt === 0 ? 0.10 : 0.85;
    world.teroAlt = 1 - world.teroAlt;
    Sfx.tone(850, 680, 0.08, 'sine', 0.04);
  }

  // Velocidad de vuelo horizontal para cruzar fluidamente la pantalla desde la derecha
  const isExtreme = world.score >= 10000;
  const baseFlySpeed = isEmergency
    ? (W * 0.40 + world.speed * 0.32)
    : (W * 0.28 + world.speed * 0.22);
  const flySpeed = baseFlySpeed * (isExtreme ? 1.25 : 1);

  world.obstacles.push({
    kind: 'tero',
    x: W + 30,                                  // entra volando desde el borde derecho
    flySpeed,                                   // cruza toda la pantalla hacia la izquierda
    phase: rand(0, 6.28),
    t: 0,
    skyFrac,
    skyY,
    isEmergency: !!isEmergency
  });
}


/* =============================================================================
 * 5d) CINEMÁTICA - Estado compartido por las escenas
 * ============================================================================= */
const cinema = {
  bus: null,
  tutorial: null,
  campus: null,
  vending: null
};

/* ---------- Vending machine interaction helpers ---------- */
function handleVendingClick(clientX, clientY) {
  if (!cinema.vending || cinema.vending.phase !== 'idle') return;
  const rect = dom.canvas.getBoundingClientRect();
  const scaleX = W / (rect.width || W);
  const scaleY = H / (rect.height || H);
  const x = (clientX - rect.left) * scaleX;
  const y = (clientY - rect.top) * scaleY;
  const maq = cinema.vending.maqRect;
  if (maq && x >= maq.x && x <= maq.x + maq.w && y >= maq.y && y <= maq.y + maq.h) {
    triggerVendingDrop();
  }
}

function triggerVendingDrop() {
  if (!cinema.vending || cinema.vending.phase !== 'idle') return;
  cinema.vending.phase = 'drop';
  cinema.vending.dropT = 0;
  Sfx.play('vendingDrop');
}


/* =============================================================================
 * 6) STATE HANDLERS – FSM (CHARACTER_SELECT, INTRO_BUS, TUTORIAL,
 *                         CAMPUS_ENTRANCE, VENDING_MACHINE, PLAYING, GAME_OVER)
 * ============================================================================= */
const stateHandlers = {};

/* Helper seguro para obtener el contexto de canvas 2D */
function getCanvasCtx(c) {
  return (c && c.drawImage) ? c : ctx;
}

/* ---------- LOADING ---------- */
stateHandlers[STATES.LOADING] = {
  update() {},
  draw(c) {
    const g = getCanvasCtx(c);
    g.fillStyle = '#10141e';
    g.fillRect(0, 0, W, H);
    drawText('CARGANDO...', W / 2, H / 2, clamp(U * 0.3, 16, 30), { color: '#8c96ab' });
  }
};

/* ---------- CHARACTER_SELECT (Estado 0: Menú de Selección) ---------- */
stateHandlers[STATES.CHARACTER_SELECT] = {
  enter() {
    dom.overlay.classList.remove('is-hidden');
    dom.overlay.classList.remove('is-loading');
    renderOverlayScores();
    if (dom.startBtn) {
      dom.startBtn.textContent = '▶ COMENZAR';
      dom.startBtn.focus({ preventScroll: true });
    }
  },
  update() {},
  draw(c) {
    const g = getCanvasCtx(c);
    g.fillStyle = '#10141e';
    g.fillRect(0, 0, W, H);
    drawInfiniteBackground();
    drawGround();
    drawHero();
  }
};

/* ---------- INTRO_BUS (Estado 1: Bondi 620 y Bajada) ---------- */
stateHandlers[STATES.INTRO_BUS] = {
  enter() {
    dom.overlay.classList.add('is-hidden');
    cinema.bus = {
      t: 0,
      phase: 'arriving', // arriving → stopping → doorOpen → stepping → busLeaving → charWalkRight → done
      busOffsetX: -W * 1.5,
      charX: 0,
      charY: 0,
      charWalkT: 0,
      fadeAlpha: 0,
      logoOffsetX: 0,
      logoAlpha: 1,
      startCharX: 0
    };
    Sfx.play('busHorn');
  },

  update(dt) {
    const b = cinema.bus;
    if (!b) return;
    b.t += dt;
    const bg = getFondoInicioRect();

    switch (b.phase) {
      case 'arriving': {
        const dur = 2.2;
        const p = clamp(b.t / dur, 0, 1);
        const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
        b.busOffsetX = lerp(-bg.w * 0.98, 0, eased);
        b.logoAlpha = 1;
        b.logoOffsetX = 0;
        if (p >= 1) {
          b.busOffsetX = 0;
          b.phase = 'stopping';
          b.t = 0;
        }
        break;
      }
      case 'stopping': {
        b.busOffsetX = 0;
        b.logoAlpha = 1;
        b.logoOffsetX = 0;
        if (b.t > 0.4) {
          b.phase = 'doorOpen';
          b.t = 0;
          Sfx.play('doorOpen');
        }
        break;
      }
      case 'doorOpen': {
        b.busOffsetX = 0;
        b.logoAlpha = 1;
        b.logoOffsetX = 0;
        if (b.t > 0.6) {
          b.phase = 'stepping';
          b.t = 0;
          Sfx.play('steps');
        }
        break;
      }
      case 'stepping': {
        b.busOffsetX = 0;
        b.logoAlpha = 1;
        b.logoOffsetX = 0;
        // El personaje baja del colectivo hasta apoyarse en el asfalto de la calle (proporcional al 620)
        b.charX = bg.x + (185 / 1366) * bg.w;
        const busOffsetY = (196 / 768) * bg.h;
        const charH = (185 / 768) * bg.h;
        const padOffset = (6 / 152) * charH;
        const stepY = bg.y + busOffsetY + (440 / 768) * bg.h + padOffset;
        const groundWalkY = bg.y + busOffsetY + (476 / 768) * bg.h + padOffset;
        const stepP = clamp(b.t / 0.8, 0, 1);
        b.charY = lerp(stepY, groundWalkY, stepP);

        if (b.t > 1.1) {
          b.phase = 'busLeaving';
          b.t = 0;
          b.charY = groundWalkY;
        }
        break;
      }
      case 'busLeaving': {
        const dur = 1.8;
        const p = clamp(b.t / dur, 0, 1);
        const eased = p * p; // ease-in para arrancar progresivamente
        b.busOffsetX = lerp(0, bg.w + 180, eased);
        b.logoAlpha = 1;
        b.logoOffsetX = 0;
        if (p >= 1) {
          b.phase = 'charWalkRight';
          b.t = 0;
          b.charWalkT = 0;
          b.startCharX = b.charX;
        }
        break;
      }
      case 'charWalkRight': {
        b.charWalkT += dt;
        const walkSpeed = Math.max(W * 0.38, 190);
        b.charX += walkSpeed * dt;
        const busOffsetY = (196 / 768) * bg.h;
        const charH = (185 / 768) * bg.h;
        const padOffset = (6 / 152) * charH;
        b.charY = bg.y + busOffsetY + (476 / 768) * bg.h + padOffset;

        // Se desvanece de a poco en el mismo lugar cuando el personaje comienza a correr
        b.logoOffsetX = 0;
        const fadeDur = 1.4; // desvanecimiento gradual en el mismo lugar
        b.logoAlpha = Math.max(0, 1 - (b.charWalkT / fadeDur));

        // Camina hacia la derecha hasta salir de la pantalla para cambio de escena manteniendo el mismo fondo
        if (b.charX > W + 80) {
          b.phase = 'done';
          b.t = 0;
        }
        break;
      }
      case 'done': {
        // Transición directa al Tutorial sin corte abrupto manteniendo el fondo de calle
        transitionTo(STATES.TUTORIAL);
        break;
      }
    }
  },

  draw(c) {
    const g = getCanvasCtx(c);
    const b = cinema.bus;
    if (!b) return;
    const bg = getFondoInicioRect();

    // Fondo: calle y reja institucional de llegada
    if (IMG.fondoInicio) {
      g.drawImage(IMG.fondoInicio, bg.x, bg.y, bg.w, bg.h);
    } else {
      g.fillStyle = '#10141e';
      g.fillRect(0, 0, W, H);
    }

    // Logo "¡No te rindas!" en el cielo (se despliega hacia la derecha sincronizado con la carrera)
    if (b.logoAlpha > 0.01) {
      const logoW = clamp(W * 0.46, 220, 520);
      const targetX = (W - logoW) / 2 + (b.logoOffsetX || 0);
      const targetY = clamp(H * 0.08, 14, 46) + safeTop;
      drawIntroLogo(g, targetX, targetY, b.logoAlpha);
    }

    // Bus 620 en sus distintas fases de animación (asentado sobre el asfalto en la cota de la calle)
    const busOffsetY = (196 / 768) * bg.h;
    const busY = bg.y + busOffsetY;
    if (b.phase === 'stepping') {
      const saleImg = IMG.bus620sale[character];
      if (saleImg) g.drawImage(saleImg, bg.x + b.busOffsetX, busY, bg.w, bg.h);
    } else if (b.phase === 'doorOpen') {
      if (IMG.bus620open) g.drawImage(IMG.bus620open, bg.x + b.busOffsetX, busY, bg.w, bg.h);
    } else if (b.phase !== 'charWalkRight' && b.phase !== 'done') {
      if (IMG.bus620closed) g.drawImage(IMG.bus620closed, bg.x + b.busOffsetX, busY, bg.w, bg.h);
    }

    // Personaje sobre el asfalto (proporcional al colectivo 620: 185px escala 768)
    const charH = (185 / 768) * bg.h;
    const feetGroundY = bg.y + busOffsetY + (476 / 768) * bg.h;
    if (b.phase === 'busLeaving') {
      const set = IMG.chars[character];
      if (set && set.idle) {
        const k = charH / set.idle.naturalHeight;
        const cw = set.idle.naturalWidth * k;
        // Sombra suave en el suelo apoyada en el asfalto
        g.fillStyle = 'rgba(0,0,0,0.30)';
        g.beginPath();
        g.ellipse(b.charX, feetGroundY, charH * 0.28, charH * 0.05, 0, 0, Math.PI * 2);
        g.fill();
        g.drawImage(set.idle, b.charX - cw / 2, b.charY - charH, cw, charH);
      }
    } else if (b.phase === 'charWalkRight') {
      drawWalkingChar(b.charX, b.charWalkT, b.charY, charH);
    }
  }
};

/* ---------- TUTORIAL (Estado 2: Práctica interactiva - Aprender Jugando) ---------- */
stateHandlers[STATES.TUTORIAL] = {
  enter() {
    const cameFromBus = cinema.bus && cinema.bus.phase === 'done';
    cinema.tutorial = {
      t: 0,
      phase: 'enterWalk',  // enterWalk → running → dialog1 → practiceBook → dialog2 → practiceHorse → fadeOut → runToEnd → done
      dialogFrame: 0,
      dialogTimer: 0,
      charCount: 0,
      lastCharCount: 0,
      popAlpha: 0,
      obstacle: null,
      stumbleT: 0,
      passedBook: false,
      passedHorse: false,
      passedTero: false,
      runX: 0,
      showLogo: !cameFromBus,
      logoT: 0,
      logoOffsetX: 0,
      logoAlpha: !cameFromBus ? 1 : 0
    };
    resetRun();
    world.speed = Math.max(W * 0.36, 180);
    world.dinoSpeed = 4.5;
  },

  update(dt) {
    const tut = cinema.tutorial;
    if (!tut) return;
    tut.t += dt;
    hero.animT += dt;
    hero.sinceDouble += dt;
    hero.buffer = Math.max(0, hero.buffer - dt);
    if (hero.landT > 0) hero.landT -= dt;
    if (tut.stumbleT > 0) tut.stumbleT -= dt;

    // Si arrancó directamente en el tutorial, el logo se desvanece de a poco en el mismo lugar
    if (tut.showLogo && tut.logoAlpha > 0) {
      tut.logoT += dt;
      tut.logoOffsetX = 0;
      tut.logoAlpha = Math.max(0, 1 - (tut.logoT / 1.4));
      if (tut.logoAlpha <= 0) tut.showLogo = false;
    }

    // Actualiza el vuelo del avión en el tutorial
    updatePlane(dt);

    const streetY = tutorialStreetY();

    // Física del personaje (salto y gravedad sobre el asfalto de la calle)
    if (!hero.grounded) {
      hero.sinceJump += dt;
      hero.vy -= (hero.jumps > 1 ? GRAV2 : GRAV) * dt;
      hero.h += hero.vy * dt;
      const maxHeroH = Math.max(2.4, (streetY - safeTop - U * 0.45) / U);
      if (hero.h > maxHeroH) { hero.h = maxHeroH; hero.vy = Math.min(hero.vy, 0); }
      if (hero.h <= 0) {
        hero.h = 0; hero.vy = 0; hero.grounded = true; hero.jumps = 0; hero.landT = 0.09;
        if (hero.buffer > 0) { hero.buffer = 0; tryJump(); }
      }
    }

    const textPhase1 = 'Un toque / Barra espaciadora: Salto simple (esquiva manuales)';
    const textPhase2 = 'Doble toque / Doble espacio: Doble salto (esquiva el caballo)';
    const textPhase3 = '¡Ojo en el cielo! Esquivá los teros (no saltes cuando pasen)';
    const charsPerSec = 34; // velocidad de escritura fluida

    switch (tut.phase) {
      case 'enterWalk':
        // El personaje entra en cuadro y toma unos pasos de carrera inicial
        world.groundScroll += (world.speed * 0.6) * dt;
        world.bgScroll += (world.speed * 0.28) * dt;
        tut.dialogFrame = 0;
        if (tut.t > 0.7) {
          tut.phase = 'running';
          tut.t = 0;
        }
        break;

      case 'running':
        // Entorno entra en velocidad normal de juego y se despliega el pop-up
        world.groundScroll += world.speed * dt;
        world.bgScroll += (world.speed * 0.45) * dt;
        tut.popAlpha = clamp(tut.t / 0.4, 0, 1);
        tut.dialogFrame = 0;
        if (tut.t > 0.5) {
          tut.phase = 'dialog1';
          tut.t = 0;
          tut.charCount = 0;
          tut.lastCharCount = 0;
          tut.dialogTimer = 0;
        }
        break;

      case 'dialog1':
        world.groundScroll += world.speed * dt;
        world.bgScroll += (world.speed * 0.45) * dt;
        tut.popAlpha = 1;
        const count1 = Math.min(textPhase1.length, Math.floor(tut.t * charsPerSec));
        tut.charCount = count1;
        if (count1 < textPhase1.length) {
          // El personaje está hablando: anima boca en sincronía con el texto
          tut.dialogTimer += dt;
          tut.dialogFrame = Math.floor(tut.dialogTimer / 0.11) % 6;
          if (count1 > (tut.lastCharCount || 0)) {
            tut.lastCharCount = count1;
            if (textPhase1[count1 - 1] !== ' ' && count1 % 2 === 0) Sfx.play('talk');
          }
        } else {
          // Terminó de hablar: boca cerrada en reposo (frame 0)
          tut.dialogFrame = 0;
          tut.dialogTimer = 0;
        }
        if (tut.t > 2.8) {
          tut.phase = 'practiceBook';
          tut.t = 0;
          tut.charCount = textPhase1.length;
          tut.dialogFrame = 0;
          tut.obstacle = { kind: 'book', x: W + U * 0.9 };
        }
        break;

      case 'practiceBook':
        world.groundScroll += world.speed * dt;
        world.bgScroll += (world.speed * 0.45) * dt;
        tut.popAlpha = 1;
        tut.charCount = textPhase1.length;
        tut.dialogFrame = 0; // Boca en reposo
        if (tut.obstacle) {
          tut.obstacle.x -= world.speed * dt;
          const hr = heroRect(streetY);
          const or = obstacleRect(tut.obstacle, streetY);
          if (overlap(hr, or) && tut.stumbleT <= 0) {
            // Golpe en tutorial: tropiezo didáctico sin Game Over para aprender
            tut.stumbleT = 0.55;
            Sfx.play('hit');
            tut.obstacle.x = W + U * 1.0;
          } else if (tut.obstacle.x < heroX - U * 0.6) {
            // Superado con éxito mediante salto simple
            tut.passedBook = true;
            tut.obstacle = null;
            tut.phase = 'dialog2';
            tut.t = 0;
            tut.charCount = 0;
            tut.lastCharCount = 0;
            tut.dialogTimer = 0;
            tut.dialogFrame = 0;
            Sfx.play('pickup');
          }
        }
        break;

      case 'dialog2':
        world.groundScroll += world.speed * dt;
        world.bgScroll += (world.speed * 0.45) * dt;
        tut.popAlpha = 1;
        const count2 = Math.min(textPhase2.length, Math.floor(tut.t * charsPerSec));
        tut.charCount = count2;
        if (count2 < textPhase2.length) {
          // El personaje está hablando: anima boca en sincronía con el texto
          tut.dialogTimer += dt;
          tut.dialogFrame = Math.floor(tut.dialogTimer / 0.11) % 6;
          if (count2 > (tut.lastCharCount || 0)) {
            tut.lastCharCount = count2;
            if (textPhase2[count2 - 1] !== ' ' && count2 % 2 === 0) Sfx.play('talk');
          }
        } else {
          // Terminó de hablar: boca cerrada en reposo (frame 0)
          tut.dialogFrame = 0;
          tut.dialogTimer = 0;
        }
        if (tut.t > 2.8) {
          tut.phase = 'practiceHorse';
          tut.t = 0;
          tut.charCount = textPhase2.length;
          tut.dialogFrame = 0;
          tut.obstacle = { kind: 'horse', x: W + U * 1.1 };
        }
        break;

      case 'practiceHorse':
        world.groundScroll += world.speed * dt;
        world.bgScroll += (world.speed * 0.45) * dt;
        tut.popAlpha = 1;
        tut.charCount = textPhase2.length;
        tut.dialogFrame = 0; // Boca en reposo
        if (tut.obstacle) {
          tut.obstacle.x -= world.speed * dt;
          const hr = heroRect(streetY);
          const or = obstacleRect(tut.obstacle, streetY);
          if (overlap(hr, or) && tut.stumbleT <= 0) {
            // Tropiezo con caballo: reintenta para practicar doble salto
            tut.stumbleT = 0.55;
            Sfx.play('hit');
            tut.obstacle.x = W + U * 1.2;
          } else if (tut.obstacle.x < heroX - U * 0.8) {
            // Superado con éxito mediante doble salto
            tut.passedHorse = true;
            tut.obstacle = null;
            tut.phase = 'dialog3';
            tut.t = 0;
            tut.charCount = 0;
            tut.lastCharCount = 0;
            tut.dialogTimer = 0;
            tut.dialogFrame = 0;
            Sfx.play('pickup');
          }
        }
        break;

      case 'dialog3':
        world.groundScroll += world.speed * dt;
        world.bgScroll += (world.speed * 0.45) * dt;
        tut.popAlpha = 1;
        const count3 = Math.min(textPhase3.length, Math.floor(tut.t * charsPerSec));
        tut.charCount = count3;
        if (count3 < textPhase3.length) {
          // El personaje está hablando: anima boca en sincronía con el texto
          tut.dialogTimer += dt;
          tut.dialogFrame = Math.floor(tut.dialogTimer / 0.11) % 6;
          if (count3 > (tut.lastCharCount || 0)) {
            tut.lastCharCount = count3;
            if (textPhase3[count3 - 1] !== ' ' && count3 % 2 === 0) Sfx.play('talk');
          }
        } else {
          tut.dialogFrame = 0;
          tut.dialogTimer = 0;
        }
        if (tut.t > 2.8) {
          tut.phase = 'practiceTero';
          tut.t = 0;
          tut.charCount = textPhase3.length;
          tut.dialogFrame = 0;
          Sfx.tone(850, 680, 0.08, 'sine', 0.04);
          tut.obstacle = {
            kind: 'tero',
            x: W + U * 0.9,
            t: 0,
            phase: 0,
            flySpeed: world.speed * 1.25,
            skyY: streetY - U * 1.35
          };
        }
        break;

      case 'practiceTero':
        world.groundScroll += world.speed * dt;
        world.bgScroll += (world.speed * 0.45) * dt;
        tut.popAlpha = 1;
        tut.charCount = textPhase3.length;
        tut.dialogFrame = 0; // Boca en reposo
        if (tut.obstacle) {
          tut.obstacle.x -= tut.obstacle.flySpeed * dt;
          tut.obstacle.t += dt;
          tut.obstacle.phase += dt * 4.5;
          const hr = heroRect(streetY);
          const or = obstacleRect(tut.obstacle, streetY);
          if (overlap(hr, or) && tut.stumbleT <= 0) {
            // Golpe con el tero en el aire: tropiezo didáctico
            tut.stumbleT = 0.55;
            Sfx.play('hit');
            tut.obstacle.x = W + U * 1.1;
          } else if (tut.obstacle.x < -U * 0.8) {
            // Superado con éxito dejándolo pasar en el cielo
            tut.passedTero = true;
            tut.obstacle = null;
            tut.phase = 'fadeOut';
            tut.t = 0;
            tut.dialogFrame = 0;
            Sfx.play('mate');
          }
        }
        break;

      case 'fadeOut':
        world.groundScroll += world.speed * dt;
        world.bgScroll += (world.speed * 0.45) * dt;
        tut.popAlpha = 1 - clamp(tut.t / 0.5, 0, 1);
        if (tut.t > 0.5) {
          tut.phase = 'runToEnd';
          tut.t = 0;
        }
        break;

      case 'runToEnd':
        // El personaje llega al final del tramo y avanza sin interrupción hacia la siguiente escena
        world.groundScroll += world.speed * dt;
        world.bgScroll += (world.speed * 0.45) * dt;
        tut.runX += (world.speed * 0.6) * dt;
        if (tut.t > 1.1) {
          transitionTo(STATES.CAMPUS_ENTRANCE);
        }
        break;
    }
  },

  draw(c) {
    const g = getCanvasCtx(c);
    const tut = cinema.tutorial;
    if (!tut) return;

    // Escenario de fondo con la misma calle (sin suelo de vereda, directamente sobre la calle)
    drawStreetBackground();
    drawPlane(g);

    const streetY = tutorialStreetY();

    // Obstáculo de práctica en la calle / cielo
    if (tut.obstacle) {
      if (tut.obstacle.kind === 'tero') {
        drawTero(tut.obstacle);
      } else {
        const img = IMG[tut.obstacle.kind];
        if (img) {
          const { w, h } = obstacleDims(tut.obstacle.kind);
          g.drawImage(img, tut.obstacle.x, streetY - h + U * 0.04, w, h);
        }
      }
    }

    // Personaje sobre el asfalto de la calle
    if (tut.stumbleT > 0 && Math.floor(performance.now() / 80) % 2 === 0) {
      // parpadeo al tropezar
    } else {
      if (tut.phase === 'runToEnd' && tut.runX > 0) {
        // Corre avanzando hacia el extremo derecho
        const runX = heroX + tut.runX;
        drawWalkingChar(runX, hero.animT, streetY, U);
      } else {
        drawHero(streetY);
      }
    }

    // Logo "¡No te rindas!" desplegándose hacia la derecha
    if (tut.showLogo && tut.logoAlpha > 0.01) {
      const logoW = clamp(W * 0.46, 220, 520);
      const targetX = (W - logoW) / 2 + (tut.logoOffsetX || 0);
      const targetY = clamp(H * 0.08, 14, 46) + safeTop;
      drawIntroLogo(g, targetX, targetY, tut.logoAlpha);
    }

    // Pop-up flotante con cuadro de diálogo y assets chico/chica dialogando
    if (tut.popAlpha > 0) {
      g.save();
      g.globalAlpha = tut.popAlpha;
      drawTutorialDialog(tut);
      g.restore();
    }

    // Indicador sutil de acción
    if (tut.phase === 'practiceBook') {
      const blink = Math.floor(performance.now() / 380) % 2 === 0;
      const size = clamp(U * 0.19, 11, 20);
      drawText('¡TOCÁ O ESPACIO PARA SALTAR!', W / 2, H - U * 0.42, size, {
        color: blink ? UNLAM.light : '#ffffff',
        alpha: 0.95
      });
    } else if (tut.phase === 'practiceHorse') {
      const blink = Math.floor(performance.now() / 380) % 2 === 0;
      const size = clamp(U * 0.19, 11, 20);
      drawText('¡DOBLE TOQUE O DOBLE ESPACIO PARA DOBLE SALTO!', W / 2, H - U * 0.42, size, {
        color: blink ? '#ffd34d' : '#ffffff',
        alpha: 0.95
      });
    } else if (tut.phase === 'practiceTero') {
      const blink = Math.floor(performance.now() / 380) % 2 === 0;
      const size = clamp(U * 0.19, 11, 20);
      drawText('¡CUIDADO CON EL TERO EN EL CIELO!', W / 2, H - U * 0.42, size, {
        color: blink ? '#ff6b6b' : '#ffffff',
        alpha: 0.95
      });
    }
  }
};

/* ---------- CAMPUS_ENTRANCE (Estado 3: Entrada a la UNLaM) ---------- */
stateHandlers[STATES.CAMPUS_ENTRANCE] = {
  enter() {
    cinema.campus = {
      t: 0,
      phase: 'fadeIn',     // fadeIn → walkForward → walkToDoor → fadeOut → done
      charX: -60,
      charY: 0,
      walkT: 0,
      fadeAlpha: 1
    };
    Object.assign(hero, { h: 0, vy: 0, grounded: true, jumps: 0, animT: 0 });
  },

  update(dt) {
    const c = cinema.campus;
    if (!c) return;
    c.t += dt;
    const bg = getCampusRect();
    // Posición exacta del pasaje de entrada (cruz roja de referencia entre las rejas abiertas)
    const gateTargetX = bg.x + (755 / 1366) * bg.w;
    const sidewalkY = bg.y + (710 / 768) * bg.h;
    const thresholdY = bg.y + (515 / 768) * bg.h;

    switch (c.phase) {
      case 'fadeIn':
        c.fadeAlpha = 1 - clamp(c.t / 0.4, 0, 1);
        c.charY = sidewalkY;
        if (c.fadeAlpha <= 0) {
          c.phase = 'walkForward';
          c.t = 0;
        }
        break;

      case 'walkForward':
        // Continúa caminando hacia la derecha (entra por la izquierda hasta el pasaje marcado con la cruz roja)
        c.walkT += dt;
        c.charX += Math.max(W * 0.28, 170) * dt;
        c.charY = sidewalkY;
        // Al alcanzar la posición de la cruz roja en el pasaje entre las rejas, cambia de perspectiva hacia el fondo
        if (c.charX >= gateTargetX) {
          c.charX = gateTargetX;
          c.phase = 'walkToDoor';
          c.t = 0;
          c.walkT = 0;
        }
        break;

      case 'walkToDoor':
        // Avanza en dirección al portal de la universidad a través de la abertura (hacia el fondo)
        c.walkT += dt;
        const walkDur = 2.0;
        const p = clamp(c.t / walkDur, 0, 1);
        c.charY = lerp(sidewalkY, thresholdY, p);
        if (p >= 1) {
          c.phase = 'fadeOut';
          c.t = 0;
        }
        break;

      case 'fadeOut':
        // Al llegar al umbral interior, fade a negro total
        c.fadeAlpha = clamp(c.t / 0.6, 0, 1);
        if (c.fadeAlpha >= 1) {
          transitionTo(STATES.VENDING_MACHINE);
        }
        break;
    }
  },

  draw(c) {
    const g = getCanvasCtx(c);
    const cm = cinema.campus;
    if (!cm) return;
    const bg = getCampusRect();

    // Fondo: entrada de la universidad (UNLaM - fondoentrada)
    if (IMG.fondoEntrada) {
      g.drawImage(IMG.fondoEntrada, bg.x, bg.y, bg.w, bg.h);
    } else {
      g.fillStyle = '#1a2232';
      g.fillRect(0, 0, W, H);
    }

    const baseH = (135 / 768) * bg.h;

    if (cm.phase === 'fadeIn' || cm.phase === 'walkForward') {
      // Vista lateral caminando hacia la derecha
      drawWalkingChar(cm.charX, cm.walkT, cm.charY, baseH);
    } else if (cm.phase === 'walkToDoor' || cm.phase === 'fadeOut') {
      // Vista de espaldas en perspectiva hacia el portal
      const sidewalkY = bg.y + (710 / 768) * bg.h;
      const thresholdY = bg.y + (515 / 768) * bg.h;
      const p = clamp((cm.charY - thresholdY) / (sidewalkY - thresholdY), 0, 1);
      const scale = lerp(0.65, 1.0, p);
      const curH = baseH * scale;
      const frames = IMG.caminaPuerta[character];
      if (frames && frames.length) {
        const idx = Math.floor(cm.walkT / 0.20) % frames.length;
        const img = frames[idx];
        if (img) {
          const k = curH / img.naturalHeight;
          const w = img.naturalWidth * k;
          // Sombra en perspectiva
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.beginPath();
          g.ellipse(cm.charX, cm.charY + curH * 0.02, curH * 0.25, curH * 0.05, 0, 0, Math.PI * 2);
          g.fill();
          g.drawImage(img, cm.charX - w / 2, cm.charY - curH, w, curH);
        }
      }
    }

    // Transición a negro
    if (cm.fadeAlpha > 0) {
      g.fillStyle = `rgba(0,0,0,${cm.fadeAlpha})`;
      g.fillRect(0, 0, W, H);
    }
  }
};

/* ---------- VENDING_MACHINE (Estado 4: Máquina Expendedora y la Bebida) ---------- */
stateHandlers[STATES.VENDING_MACHINE] = {
  enter() {
    cinema.vending = {
      t: 0,
      phase: 'fadeIn',   // fadeIn → idle (waiting_for_vending_machine) → drop → drink → ready → done
      fadeAlpha: 1,
      maqRect: null,
      dropT: 0,
      drinkT: 0,
      drinkFrame: 0,
      maqFrame: 0,
      maqX: 0,
      maqY: 0,
      maqW: 0,
      maqH: 0
    };
    resetRun();
    Object.assign(hero, { h: 0, vy: 0, grounded: true, jumps: 0, animT: 0 });
  },

  update(dt) {
    const v = cinema.vending;
    if (!v) return;
    v.t += dt;

    switch (v.phase) {
      case 'fadeIn':
        // Se disipa el fundido a negro
        v.fadeAlpha = 1 - clamp(v.t / 0.5, 0, 1);
        if (v.fadeAlpha <= 0) {
          v.phase = 'idle'; // En espera de interacción (waiting_for_vending_machine)
          v.t = 0;
        }
        break;

      case 'idle':
        v.maqFrame = 0;
        break;

      case 'drop':
        // Cae una botella de bebida al compartimento de salida (sprites maquina 1-4)
        v.dropT += dt;
        v.maqFrame = Math.min(Math.floor(v.dropT / 0.20), 3);
        if (v.dropT > 0.8) {
          v.phase = 'drink';
          v.t = 0;
          v.drinkT = 0;
          Sfx.play('drink');
        }
        break;

      case 'drink':
        // El personaje bebe la gaseosa (animación cocachica / cocachico frames 1-4)
        v.drinkT += dt;
        v.drinkFrame = Math.min(Math.floor(v.drinkT / 0.45), 3);
        if (v.drinkT > 1.8) {
          v.phase = 'ready';
          v.t = 0;
          Sfx.play('startRun');
        }
        break;

      case 'ready':
        // Regresa a la pose estándar de carrera (run) antes de iniciar
        if (v.t > 0.4) {
          world.vendingX = v.maqX;
          transitionTo(STATES.PLAYING);
        }
        break;
    }
  },

  draw(c) {
    const g = getCanvasCtx(c);
    const v = cinema.vending;
    if (!v) return;

    // Escenario principal infinito (Teatro, Auditorio, Biblioteca y vereda)
    drawInfiniteBackground();
    drawGround();

    // Dimensiones y hitbox responsive de la máquina expendedora (ampliada y a la derecha del personaje)
    const maqFrames = IMG.maquina;
    const maqImg = (maqFrames && maqFrames.length) ? (maqFrames[v.maqFrame] || maqFrames[0]) : null;
    const maqH = U * 1.72;
    const maqW = maqImg ? (maqH * (maqImg.naturalWidth / maqImg.naturalHeight)) : (maqH * 0.792);
    // Ubicada a la derecha del personaje para que no se superpongan (personaje a la izquierda)
    const maqX = heroX + U * 0.58;
    const maqY = groundY - maqH + U * 0.04;

    v.maqX = maqX;
    v.maqY = maqY;
    v.maqW = maqW;
    v.maqH = maqH;
    // Hitbox responsive recalculada según dimensiones actuales del canvas
    v.maqRect = { x: maqX - 25, y: maqY - 25, w: maqW + 50, h: maqH + 50 };

    // 1) Dibujar máquina expendedora
    if (maqImg) {
      g.drawImage(maqImg, maqX, maqY, maqW, maqH);

      // Indicador visual / parpadeo resaltando la máquina en espera de interacción
      if (v.phase === 'idle') {
        const pulse = 0.4 + Math.sin(v.t * 4.5) * 0.3;
        g.save();
        g.globalAlpha = pulse;
        g.strokeStyle = UNLAM.light;
        g.lineWidth = 3;
        rrect(maqX - 6, maqY - 6, maqW + 12, maqH + 12, 10);
        g.stroke();
        g.restore();

        const blink = Math.floor(performance.now() / 420) % 2 === 0;
        const size = clamp(U * 0.18, 11, 20);
        drawText('▶ TOCÁ LA MÁQUINA', maqX + maqW / 2, maqY - U * 0.22, size, {
          color: blink ? UNLAM.light : '#ffffff',
          alpha: 0.95
        });
      }
    }

    // 2) Dibujar personaje a la izquierda de la máquina, aumentado proporcionalmente (charH = U * 1.25)
    const charH = U * 1.25;
    if (v.phase === 'drink') {
      const cocaFrames = IMG.coca[character];
      if (cocaFrames && cocaFrames.length) {
        const img = cocaFrames[v.drinkFrame] || cocaFrames[0];
        if (img) {
          const k = charH / img.naturalHeight;
          const w = img.naturalWidth * k;
          const h = img.naturalHeight * k;
          g.drawImage(img, heroX - w / 2, groundY - h, w, h);
        }
      }
    } else if (v.phase === 'ready') {
      // Pose estándar de carrera (run)
      const set = IMG.chars[character];
      const img = set && set.run && set.run[0] ? set.run[0] : (set && set.idle);
      if (img) {
        const k = charH / (set.idle ? set.idle.naturalHeight : img.naturalHeight);
        const w = img.naturalWidth * k;
        const h = img.naturalHeight * k;
        g.drawImage(img, heroX - w / 2, groundY - h, w, h);
      }
    } else {
      // Personaje quieto (idle) frente al circuito
      const set = IMG.chars[character];
      if (set && set.idle) {
        const k = charH / set.idle.naturalHeight;
        const w = set.idle.naturalWidth * k;
        const h = set.idle.naturalHeight * k;
        // Sombra suave en el suelo
        g.fillStyle = 'rgba(0,0,0,0.28)';
        g.beginPath();
        g.ellipse(heroX, groundY + charH * 0.02, charH * 0.28, charH * 0.05, 0, 0, Math.PI * 2);
        g.fill();
        g.drawImage(set.idle, heroX - w / 2, groundY - h, w, h);
      }
    }

    // Fundido a negro que se disipa
    if (v.fadeAlpha > 0) {
      g.fillStyle = `rgba(0,0,0,${v.fadeAlpha})`;
      g.fillRect(0, 0, W, H);
    }
  }
};

/* ---------- PLAYING (Escena 5: Core game loop) ---------- */
stateHandlers[STATES.PLAYING] = {
  enter() {
    const savedVendingX = world.vendingX;
    resetRun();
    world.vendingX = savedVendingX;
    layout();
  },

  update(dt) {
    const S = CONFIG.speed;
    const frames = dt * 60; // frames normalizados a 60 fps (independiente de la tasa de refresco)
    world.time += dt;

    // Aceleración idéntica al Dinosaurio de Google (Runner.config.ACCELERATION = 0.001 por frame hasta 13)
    if (world.dinoSpeed < S.max) {
      world.dinoSpeed = Math.min(S.max, world.dinoSpeed + S.acceleration * frames);
    }
    world.p = clamp((world.dinoSpeed - S.start) / (S.max - S.start), 0, 1);

    // A partir de los 10.000 puntos aumenta la dificultad y velocidad
    const isExtreme = world.score >= 10000;
    const extremeBoost = isExtreme ? Math.min(1.36, 1.18 + ((world.score - 10000) / 10000) * 0.18) : 1;
    world.speed = W * lerp(S.startFrac, S.maxFrac, world.p) * extremeBoost;
    const dx = world.speed * dt;

    world.groundScroll += dx;
    world.bgScroll += (world.speed * 0.45) * dt;
    if (world.vendingX !== undefined && world.vendingX > -U * 3) {
      world.vendingX -= dx;
    }
    world.dist += world.dinoSpeed * frames;

    // Puntuación idéntica a Google Dino (DistanceMeter COEFFICIENT: 0.025) + bonus
    const prevScore = world.score;
    const prev100 = Math.floor(prevScore / 100);
    world.score = Math.floor(world.dist * 0.025) + world.bonus;
    const new100 = Math.floor(world.score / 100);
    if (new100 > prev100 && world.score >= 100) {
      Sfx.play('milestone');
      world.milestoneT = 1.0;
    }
    if (world.milestoneT > 0) world.milestoneT -= dt;

    // Activación del Modo Extremo a partir de los 10.000 puntos:
    // Aumenta la dificultad y transforma los colores del juego
    if (world.score >= 10000) {
      if (!world.isExtreme) {
        setExtremeMode(true);
        world.extremeFlash = 1.0;
        Sfx.play('milestone');
        Sfx.tone(960, 480, 0.35, 'sawtooth', 0.15);
        world.popups.push({
          text: '⚡ ¡MODO EXTREMO: 10.000 PTS! ⚡',
          x: W / 2,
          y: groundY - U * 1.6,
          t: 0,
          gold: true
        });
        world.popups.push({
          text: '¡DIFICULTAD MÁXIMA!',
          x: W / 2,
          y: groundY - U * 1.1,
          t: 0,
          gold: true
        });
      }
    } else {
      if (world.isExtreme) {
        setExtremeMode(false);
      }
    }
    if (world.extremeFlash > 0) {
      world.extremeFlash = Math.max(0, world.extremeFlash - dt * 2.5);
    }

    // Actualiza el avión publicitario en el cielo
    updatePlane(dt);

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

    // --- Tero periódico (cruza la pantalla alternando alto y bajo cada tanto) ---
    const T = CONFIG.tero;
    world.teroTimer -= dt;
    if (world.teroTimer <= 0) {
      spawnSkyTero(false);
      world.teroTimer = (world.score >= 10000)
        ? rand(5.5, 9.0) // Más teros en el cielo en modo extremo
        : rand(T.intervalMin, T.intervalMax);
    }

    // --- Monitoreo de persistencia en la zona aérea (anti-abuso: > 10 seg) ---
    if (!hero.grounded && hero.h > 0.08) {
      hero.airTime = (hero.airTime || 0) + dt;
      if (hero.airTime >= T.airAbuseTime) {
        spawnSkyTero(true); // ¡sale un tero inmediatamente para nivelar la dificultad!
        hero.airTime = 4.0; // cooldown: si persiste en el aire 6s más sin bajar, saldrá otro
      }
    } else {
      hero.airTime = 0;     // al tocar la vereda se reinicia el contador
    }

    // --- Spawner ---
    world.spawnDist -= dx;
    if (world.spawnDist <= 0) spawnPattern();

    // --- Entidades ---
    for (const o of world.obstacles) {
      const spd = o.kind === 'tero' ? (o.flySpeed || (world.speed * 1.25)) : world.speed;
      o.x -= spd * dt;
      if (o.kind === 'tero') { o.t += dt; o.phase += dt * 4.5; }   // aleteo + vaivén
    }
    for (const p of world.pickups) { p.x -= dx; p.phase += dt * 4; }
    world.obstacles = world.obstacles.filter((o) => o.x + obstacleDims(o.kind).w > -U);
    world.pickups   = world.pickups.filter((p) => !p.taken && p.x + pickupDims(p.kind).w > -U);

    // --- Popups ---
    for (const p of world.popups) p.t += dt;
    world.popups = world.popups.filter((p) => p.t < 0.8);

    // --- Colisiones ---
    const hr = heroRect();
    for (const o of world.obstacles) {
      if (overlap(hr, obstacleRect(o))) {
        if (!CONFIG.godMode) { die(); return; }
      }
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
  },

  draw(c) {
    const g = getCanvasCtx(c);
    drawInfiniteBackground();
    drawPlane(g);
    drawGround();
    // La máquina expendedora (ampliada) se aleja junto con el escenario al iniciar la carrera
    if (world.vendingX !== undefined && world.vendingX > -U * 4 && IMG.maquina && IMG.maquina[3]) {
      const maqImg = IMG.maquina[3];
      const maqH = U * 1.72;
      const maqW = maqH * (maqImg.naturalWidth / maqImg.naturalHeight);
      g.drawImage(maqImg, world.vendingX, groundY - maqH + U * 0.04, maqW, maqH);
    }
    drawPickups();
    drawObstacles();
    drawHero();
    drawPopups();
    if (CONFIG.debug) drawDebug();
    if (world.extremeFlash > 0) {
      g.fillStyle = `rgba(255, 255, 255, ${world.extremeFlash * 0.55})`;
      g.fillRect(0, 0, W, H);
    }
    drawHUD();
  }
};

/* ---------- GAME_OVER ---------- */
stateHandlers[STATES.GAME_OVER] = {
  update(dt) {
    world.deadT += dt;
  },
  draw() {
    // Render subyacente
    let shake = false;
    if (world.deadT < 0.28) {
      shake = true;
      ctx.save();
      const a = U * 0.06 * (1 - world.deadT / 0.28);
      ctx.translate(rand(-a, a), rand(-a, a));
    }
    drawInfiniteBackground();
    drawPlane(ctx);
    drawGround();
    drawPickups();
    drawObstacles();
    drawHero();
    drawPopups();
    if (CONFIG.debug) drawDebug();
    if (shake) ctx.restore();
    drawHUD();

    const blink = Math.floor(performance.now() / 500) % 2 === 0;
    if (world.deadT < 0.18) {                    // flash de impacto
      ctx.fillStyle = `rgba(255,255,255,${0.55 * (1 - world.deadT / 0.18)})`;
      ctx.fillRect(0, 0, W, H);
    }
    drawDeadPanel(blink);
  }
};

/* ---------- ENTRY (Ingreso de iniciales) ---------- */
stateHandlers[STATES.ENTRY] = {
  update(dt) {
    world.deadT += dt;
  },
  draw() {
    // Render subyacente
    let shake = false;
    if (world.deadT < 0.28) {
      shake = true;
      ctx.save();
      const a = U * 0.06 * (1 - world.deadT / 0.28);
      ctx.translate(rand(-a, a), rand(-a, a));
    }
    drawInfiniteBackground();
    drawPlane(ctx);
    drawGround();
    drawPickups();
    drawObstacles();
    drawHero();
    drawPopups();
    if (shake) ctx.restore();
    drawHUD();

    const blink = Math.floor(performance.now() / 500) % 2 === 0;
    if (world.deadT < 0.18) {
      ctx.fillStyle = `rgba(255,255,255,${0.55 * (1 - world.deadT / 0.18)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (world.deadT >= ENTRY_READY_AT) drawEntryPanel(blink);
  }
};

/* ---------- PAUSED ---------- */
stateHandlers[STATES.PAUSED] = {
  update() {},
  draw() {
    drawInfiniteBackground();
    drawPlane(ctx);
    drawGround();
    drawPickups();
    drawObstacles();
    drawHero();
    drawPopups();
    drawHUD();
    const blink = Math.floor(performance.now() / 500) % 2 === 0;
    drawPanel([
      { text: 'PAUSA', scale: 1.1 },
      { text: 'Tocá para seguir', scale: 0.5, alpha: blink ? 1 : 0.35 }
    ]);
  }
};


/* =============================================================================
 * 7) RENDER HELPERS
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
  if (state === STATES.LOADING || state === STATES.CHARACTER_SELECT) return set.idle;
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

function drawHero(customGroundY = groundY) {
  const set = IMG.chars[character];
  if (!set || !set.idle) return;
  const k = U / set.idle.naturalHeight;               // escala común para todos los frames
  const img = heroSprite();
  if (!img) return;

  // Sombra en el piso
  const shrink = 1 - Math.min(hero.h, 2) * 0.18;
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(heroX, customGroundY + U * 0.02, U * 0.30 * shrink, U * 0.06 * shrink, 0, 0, Math.PI * 2);
  ctx.fill();

  // Los frames corre1 y corre2 (exportados a 1x con ~106px de alto) se escalan a 1.5x
  // para coincidir exactamente con los demás sprites (160px)
  const scale = img.naturalHeight < 120 ? 1.5 : 1;
  const w = img.naturalWidth * k * scale, h = img.naturalHeight * k * scale;
  ctx.drawImage(img, heroX - w / 2, customGroundY - hero.h * U - h, w, h);
}

function drawWalkingChar(x, t, customY = groundY, customH = U) {
  const set = IMG.chars[character];
  if (!set || !set.run || !set.run.length) return;
  const frameDur = 0.14;
  const img = set.run[Math.floor(t / frameDur) % set.run.length];
  if (!img) return;
  const k = customH / (set.idle ? set.idle.naturalHeight : img.naturalHeight);
  const scale = img.naturalHeight < 120 ? 1.5 : 1;
  const w = img.naturalWidth * k * scale;
  const h = img.naturalHeight * k * scale;
  // Sombra
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(x, customY + customH * 0.02, customH * 0.28, customH * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.drawImage(img, x - w / 2, customY - h, w, h);
}

function getFondoInicioRect() {
  const img = IMG.fondoInicio;
  const nw = img ? img.naturalWidth : 1366;
  const nh = img ? img.naturalHeight : 768;
  const scale = Math.max(W / nw, H / nh);
  const w = nw * scale;
  const h = nh * scale;
  const x = (W - w) / 2;
  const y = H - h; // Aligned to bottom so street/pavement is at bottom
  return { x, y, w, h, scale };
}

function tutorialStreetY() {
  const bg = getFondoInicioRect();
  return bg.y + (672 / 768) * bg.h;
}

function drawStreetBackground() {
  const img = IMG.fondoInicio;
  if (!img) {
    drawInfiniteBackground();
    return;
  }
  const bg = getFondoInicioRect();
  const period = bg.w * 2;
  let x = -((world.bgScroll || 0) % period);
  for (; x < W; x += period) {
    ctx.drawImage(img, x, bg.y, bg.w, bg.h);
    ctx.save();
    ctx.translate(x + bg.w * 2, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(img, 0, bg.y, bg.w, bg.h);
    ctx.restore();
  }
}

function drawIntroLogo(g, x, y, alpha = 1) {
  const img = IMG.logo;
  if (!img || alpha <= 0.01) return;
  const logoW = clamp(W * 0.46, 220, 520);
  const logoH = logoW * (img.naturalHeight / img.naturalWidth);
  const ctxTarget = g || ctx;
  ctxTarget.save();
  ctxTarget.globalAlpha = clamp(alpha, 0, 1);
  ctxTarget.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctxTarget.shadowBlur = 10;
  ctxTarget.shadowOffsetX = 0;
  ctxTarget.shadowOffsetY = 3;
  ctxTarget.drawImage(img, x, y, logoW, logoH);
  ctxTarget.restore();
}

function getCampusRect() {
  const img = IMG.fondoEntrada;
  const nw = img ? img.naturalWidth : 1366;
  const nh = img ? img.naturalHeight : 768;
  const scale = Math.max(W / nw, H / nh);
  const w = nw * scale;
  const h = nh * scale;
  const x = (W - w) / 2;
  const y = H - h;
  return { x, y, w, h, scale };
}

function drawTutorialDialog(tut) {
  const dialogFrames = IMG.dialogo[character];
  const frameIdx = dialogFrames && dialogFrames.length ? (tut.dialogFrame % dialogFrames.length) : 0;
  const portraitImg = dialogFrames ? dialogFrames[frameIdx] : null;

  const boxW = clamp(W * 0.92, 280, 560);
  const boxH = clamp(U * 0.72, 60, 88);
  const boxX = (W - boxW) / 2;
  const boxY = safeTop + 14;

  ctx.save();
  // Glassmorphic translúcido: más transparente para apreciar el fondo del juego
  ctx.fillStyle = 'rgba(10, 14, 24, 0.65)';
  ctx.strokeStyle = 'rgba(66, 191, 160, 0.50)';
  ctx.lineWidth = 2;
  rrect(boxX, boxY, boxW, boxH, 14);
  ctx.fill();
  ctx.stroke();

  // Portrait on left
  let textX = boxX + 16;
  if (portraitImg) {
    const portH = boxH - 12;
    const portW = portH * (portraitImg.naturalWidth / portraitImg.naturalHeight);
    ctx.drawImage(portraitImg, boxX + 10, boxY + 6, portW, portH);
    textX = boxX + portW + 20;
  }

  const textW = boxW - (textX - boxX) - 14;
  let fullInstruction = '';
  if (tut.phase === 'dialog1' || tut.phase === 'practiceBook') {
    fullInstruction = 'Un toque / Barra espaciadora: Salto simple (esquiva manuales)';
  } else if (tut.phase === 'dialog2' || tut.phase === 'practiceHorse') {
    fullInstruction = 'Doble toque / Doble espacio: Doble salto (esquiva el caballo)';
  } else if (tut.phase === 'dialog3' || tut.phase === 'practiceTero') {
    fullInstruction = '¡Ojo en el cielo! Esquivá los teros (no saltes cuando pasen)';
  }

  const charCount = Number.isFinite(tut.charCount) ? tut.charCount : fullInstruction.length;
  const visibleText = fullInstruction.slice(0, charCount);

  // Sombra suave en los textos para nitidez y legibilidad óptima sobre fondos translúcidos
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;

  // Title
  ctx.font = `800 ${clamp(boxH * 0.17, 9, 13)}px "Press Start 2P", monospace, sans-serif`;
  ctx.fillStyle = UNLAM.light;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('TUTORIAL · ¡APRENDÉ A JUGAR!', textX, boxY + 12);

  // Body: texto sincronizado con los sprites de diálogo
  ctx.font = `700 ${clamp(boxH * 0.22, 11, 15)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(visibleText, textX, boxY + 34, textW);
  ctx.restore();
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

function drawTero(o) {
  const frames = IMG.tero;
  if (!frames || !frames.length) return;
  const img = frames[Math.floor(o.t / CONFIG.tero.frameDur) % frames.length];
  const { w, h, s } = obstacleDims('tero');
  const cx = o.x + w / 2, cy = teroCenterY(o);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(-1, 1);                                       // los sprites miran a la derecha; el tero viene hacia la izquierda
  ctx.drawImage(img, -img.naturalWidth * s / 2, -img.naturalHeight * s / 2,
                img.naturalWidth * s, img.naturalHeight * s);
  ctx.restore();
}

function drawObstacles() {
  for (const o of world.obstacles) {
    if (o.kind === 'tero') { drawTero(o); continue; }
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
  // En móviles en horizontal, garantizar separación de la barra de estado y notch/isla dinámica
  const y = Math.max(safeTop + 12, 16) + size / 2;
  const marginL = Math.max(safeLeft + 16, 24);
  const marginR = Math.max(safeRight + 16, 24);
  const isMilestone = world.milestoneT > 0 && Math.floor(world.milestoneT * 6) % 2 === 0;
  const isExtreme = world.isExtreme && state === STATES.PLAYING;
  const scoreText = 'PUNTOS ' + pad(world.score) + (isExtreme ? ' ⚡ EXTREMO' : '');
  const scoreColor = isMilestone ? UNLAM.light : (isExtreme ? '#ff3b30' : '#fff');

  drawText(scoreText, marginL, y, size, {
    align: 'left',
    color: scoreColor
  });
  drawText('RÉCORD ' + pad(Math.max(personalRecord, world.score)), W - marginR, y, size,
           { align: 'right', color: isExtreme ? '#ffd34d' : UNLAM.green });
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
  const cap = Math.min(CONFIG.maxScores, 5);
  // Solo se visualizan los primeros 5 en la tabla
  const rows = Scores.list.slice(0, cap).map((e, i) => ({
    rank: i + 1,
    name: e.name,
    score: e.score,
    isNew: world.addedRank === i + 1
  }));

  const medal = [UNLAM.green, '#d9dee8', '#e0a070', '#ffffff', '#ffffff'];
  const lines = [
    { t: 'GAME OVER', s: 1.9, color: '#ff6b6b', gap: 0.3 },
    { t: 'PUNTOS ' + pad(world.score), s: 1.15 },
    { t: 'TU RÉCORD ' + pad(personalRecord), s: 0.95, color: UNLAM.light }
  ];
  if (world.addedRank > 5) {
    lines.push({ t: 'TU PUESTO EN EL RANKING: #' + world.addedRank, s: 0.95, color: '#ffd34d', blink: true });
  }
  if (world.newGlobalRecord) {
    lines.push({ t: '★ ¡NUEVO RÉCORD GLOBAL! ★', s: 0.95, color: '#ffd34d', blink: true });
  } else if (world.newPersonalRecord) {
    lines.push({ t: '★ ¡SUPERASTE TU RÉCORD! ★', s: 0.95, color: UNLAM.light, blink: true });
  }
  if (rows.length) {
    lines.push({ t: '— RANKING GLOBAL (TOP 5) —', s: 0.85, color: UNLAM.green, gap: 0.4 });
    rows.forEach((r) => lines.push({
      t: String(r.rank).padStart(2, ' ') + '. ' + r.name + '  ' + pad(r.score),
      s: 0.95, color: medal[r.rank - 1] || '#fff', blink: r.isNew, alt: UNLAM.light
    }));
  }
  const note = Scores.status === 'offline'
    ? (Scores.pending.length ? 'Sin conexión · tu puntaje se enviará solo' : 'Sin conexión · ranking guardado')
    : (Scores.syncing ? 'Enviando puntaje…' : '');
  if (note) lines.push({ t: note, s: 0.6, color: '#aab3c5', gap: 0.2 });
  lines.push({ t: 'Tocá para reiniciar', s: 0.9, gap: 0.6, blink: true, dim: true });

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


/* =============================================================================
 * 8) GAME FLOW FUNCTIONS
 * ============================================================================= */
function die() {
  world.deadAt = performance.now();
  world.deadT = 0;
  // Al perder (incluso tras superar los 10.000 pts), deja de cambiar de color de inmediato
  setExtremeMode(false);
  Sfx.play('hit');
  const prevPersonal = personalRecord;
  const bestGlobal = Scores.best();
  world.newGlobalRecord = world.score > 0 && world.score > bestGlobal;
  world.newPersonalRecord = world.score > 0 && world.score > prevPersonal;
  world.newRecord = world.newPersonalRecord || world.newGlobalRecord;
  updatePersonalRecord(world.score);
  world.addedRank = 0;
  world.submitId = null;
  entryUI.hits = [];
  Scores.refresh();                            // trae el ranking global más reciente
  if (Scores.qualifies(world.score)) {         // entra en el top 5 -> pide iniciales
    transitionTo(STATES.ENTRY);
    entryUI.letters = initials.split('');
    entryUI.slot = 0;
    entryUI.rank = Scores.rankFor(world.score);
  } else {
    transitionTo(STATES.GAME_OVER);
  }
}

function beginRunFromMenu() {
  setExtremeMode(false);
  resetRun();
  if (CONFIG.skipCinematic) {
    transitionTo(STATES.PLAYING);
  } else {
    transitionTo(STATES.INTRO_BUS);
  }
}

function showMenu() {
  if (state !== STATES.GAME_OVER) return;
  setExtremeMode(false);
  resetRun();
  transitionTo(STATES.CHARACTER_SELECT);
}


/* =============================================================================
 * 9) BUCLE PRINCIPAL Y ARRANQUE
 * ============================================================================= */
let lastT = 0;
let menuBtnShown = false;
let skipTutorialBtnShown = false;

function frame(t) {
  requestAnimationFrame(frame);
  const dt = lastT ? clamp((t - lastT) / 1000, 0, 0.05) : 0;
  lastT = t;

  const handler = stateHandlers[state];
  if (handler) {
    if (handler.update) handler.update(dt);
    if (handler.draw) handler.draw(ctx);
  }

  // Botón "Menú" solo en la pantalla de game over
  const wantMenuBtn = state === STATES.GAME_OVER;
  if (wantMenuBtn !== menuBtnShown) {
    menuBtnShown = wantMenuBtn;
    if (dom.menuBtn) dom.menuBtn.classList.toggle('is-visible', wantMenuBtn);
  }

  // Botón "Saltar tutorial" solo durante el tutorial
  const wantSkipTutorial = state === STATES.TUTORIAL;
  if (wantSkipTutorial !== skipTutorialBtnShown) {
    skipTutorialBtnShown = wantSkipTutorial;
    if (dom.skipTutorialBtn) dom.skipTutorialBtn.classList.toggle('is-visible', wantSkipTutorial);
  }
}

/* ---------- Pantalla de inicio: personaje + COMENZAR + ranking global ---------- */
let starting = false;

function selectCharacter(id) {
  if (!ASSETS.characters[id]) return;
  character = id;
  window.selectedCharacter = id === 'chica' ? 'girl' : 'boy';
  window.selectedCharacterId = id;
  storageSet(CONFIG.storageChar, id);
  dom.pickers.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.char === id)));
  if (dom.startBtn) {
    dom.startBtn.disabled = false;
    dom.startBtn.textContent = '▶ COMENZAR';
  }
}

function renderOverlayScores() {
  if (!dom.scoresList) return;
  updatePersonalRecord();
  dom.scoresList.textContent = '';
  const top = Scores.list.slice(0, CONFIG.maxScores);
  top.forEach((e, i) => {
    const li = document.createElement('li');
    [(i + 1) + '.', e.name, pad(e.score)].forEach((txt, j) => {
      const s = document.createElement('span');
      s.className = ['rank', 'name', 'pts'][j];
      s.textContent = txt;
      li.appendChild(s);
    });
    dom.scoresList.appendChild(li);
  });
  if (!top.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = Scores.status === 'loading' ? 'Cargando ranking…' : '¡Sé la primera persona en dejar su marca!';
    dom.scoresList.appendChild(li);
  }
  if (dom.scoresState) {
    dom.scoresState.dataset.state = Scores.status;
    dom.scoresState.textContent = Scores.status === 'offline'
      ? (Scores.pending.length ? 'Sin conexión · tu puntaje se enviará solo' : 'Sin conexión · mostrando el último ranking')
      : (Scores.status === 'loading' ? 'Conectando…' : '');
  }
}

function startGame() {
  if (starting || state !== STATES.CHARACTER_SELECT) return;
  starting = true;

  // Audio y pantalla completa (requieren gesto del usuario)
  Sfx.unlock();
  goFullscreen();

  dom.overlay.classList.add('is-hidden');
  layout();

  if (CONFIG.skipCinematic) {
    transitionTo(STATES.PLAYING);
  } else {
    transitionTo(STATES.INTRO_BUS);
  }
  starting = false;
}

function handleMenuKey(e) {
  if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) startGame();
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    const ids = Object.keys(ASSETS.characters);
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    selectCharacter(ids[(ids.indexOf(character) + dir + ids.length) % ids.length]);
  }
}

function setupOverlay() {
  dom.pickers.forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    selectCharacter(b.dataset.char);
  }));
  if (dom.startBtn) {
    dom.startBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      startGame();
    });
  }
  if (dom.menuBtn) {
    dom.menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showMenu();
    });
  }
  if (dom.skipTutorialBtn) {
    const onSkipTutorial = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (state === STATES.TUTORIAL) {
        dom.skipTutorialBtn.classList.remove('is-visible');
        skipTutorialBtnShown = false;
        Sfx.play('click');
        transitionTo(STATES.CAMPUS_ENTRANCE);
      }
    };
    dom.skipTutorialBtn.addEventListener('click', onSkipTutorial);
    dom.skipTutorialBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    dom.skipTutorialBtn.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: false });
    dom.skipTutorialBtn.addEventListener('mousedown', (e) => e.stopPropagation());
  }

  // Ranking global: al cambiar la lista se actualiza el récord, la pantalla de inicio y el puesto obtenido
  Scores.onChange = () => { hiScore = Scores.best(); renderOverlayScores(); };
  Scores.onRank = (id, rank) => {
    if (id === world.submitId && rank > 0) world.addedRank = rank;
  };
  window.addEventListener('online', () => Scores.refresh());   // reenvía lo pendiente al volver la conexión
}

async function main() {
  Sfx.init();
  setupOverlay();
  renderOverlayScores();
  selectCharacter(character);
  layout();
  resetRun();
  requestAnimationFrame(frame);
  Scores.refresh();                              // el ranking baja mientras cargan los assets

  await loadAssets();
  layout();
  resetRun();

  if (!IMG.chars[character] || !IMG.chars[character].idle) selectCharacter(CONFIG.defaultCharacter);

  transitionTo(STATES.CHARACTER_SELECT);
}

let resizeRaf = 0;
const onResize = () => {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(layout);
};
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);
if (screen && screen.orientation && screen.orientation.addEventListener) {
  screen.orientation.addEventListener('change', onResize);
}
document.addEventListener('fullscreenchange', onResize);
document.addEventListener('webkitfullscreenchange', onResize);

main();
