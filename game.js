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
    virgen:        'ASSETS/virgenobstaculo.png', // obstáculo alto: ermita de la Virgen
    toast:         'ASSETS/100puntostostado.png',// +100
    tortilla:      'ASSETS/200puntostortilla.png',// +200
    mate:          'ASSETS/500puntosmate.png',   // +500 recompensa alta especial
    bonus:         'ASSETS/bonus.png',           // +1000 y activa carrito de golf por 5s
    fondoInicio:   'ASSETS/fondoinicio.png',    // fondo escena del bondi
    fondoEntrada:  'ASSETS/Entrada.png',        // fondo de la entrada a UNLaM
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
      jumpFall:    'ASSETS/chicasalto3.png',
      golf:        'ASSETS/golfchica.png'
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
      jumpFall:    'ASSETS/chicosalto3.png',
      golf:        'ASSETS/golfchico.png'
    }
  },

  sounds: {
    jump:       null,
    doubleJump: null,
    pickup:     null,
    hit:        null
  },

  // Música de fondo (mantener sincronizado con PRECACHE de sw.js)
  music: {
    intro: 'ASSETS/Musica intro.mp3',       // intro: menú, bondi, tutorial y entrada hasta tocar la máquina expendedora
    game:  'ASSETS/Musicajuego.mp3',        // carrera principal cuando se activa el juego
    bonus: 'ASSETS/bonus1.mp3',            // música especial durante el bonus de carrito de golf (bonus1)
    lose:  'ASSETS/Musicaperder (1).mp3'    // al chocar contra un obstáculo
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
  extremeTest: /[?&]extreme\b/.test(location.search), // ?extreme arranca en modo extremo (20.000 pts) para testing visual
  storageScores:   'fanzine_runner_global_v5',  // copia local del ranking global (para mostrar sin conexión)
  storagePending:  'fanzine_runner_pending',    // puntajes que todavía no se pudieron enviar al servidor
  storageInitials: 'fanzine_runner_initials',   // últimas iniciales usadas
  storagePersonalRecord: 'fanzine_runner_personal_record', // récord personal en este dispositivo
  apiScores: '/api/scores',                     // endpoint local/Vercel (api/scores.js)
  cloudScores: 'https://api.restful-api.dev/objects/ff808181a09d98f701a18d9ecd606591', // cloud backend global compartido
  apiTimeout: 3000,                             // ms antes de alternar al cloud
  maxScores: 5,                                 // Cantidad visualizada en Top 5
  maxScoresStored: 500,                         // Cantidad total conservada en el ranking global
  initialsLength: 3,
  storageChar: 'fanzine_runner_char',
  defaultCharacter: 'chica',
  storageMusicVolume: 'fanzine_runner_music_volume', // volumen de la música elegido en ⚙
  musicVolume: 0.6,                                  // volumen inicial de la música (0..1)

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
  size: { book: 0.55, horse: 1.30, virgen: 1.50, pickup: 0.50, mate: 0.58, bonus: 0.50, tero: 0.62 },

  // Hitboxes: margen recortado en cada lado
  hitbox: {
    book:   { l: 0.14, r: 0.14, t: 0.10, b: 0.00 },
    horse:  { l: 0.16, r: 0.18, t: 0.08, b: 0.04 },
    virgen: { l: 0.18, r: 0.18, t: 0.11, b: 0.04 },
    tero:   { l: 0.24, r: 0.24, t: 0.24, b: 0.26 }   // ajustado al cuerpo del tero (perdona puntas de alas/cola)
  },

  // Tero: entra volando desde la derecha con dificultad progresiva (suave al inicio, más activo al avanzar).
  tero: {
    refW: 130, refH: 110,     // caja de referencia (px del sprite) común a los 4 frames
    bob: 0.07,                // vaivén vertical de aleteo (en U)
    frameDur: 0.065,          // s por paso de aleteo fluido (ida y vuelta)
    intervalMin: [13.5, 6.5], // segundos mínimos entre apariciones [inicio suave, vel. máx]
    intervalMax: [18.5, 9.8], // segundos máximos entre apariciones [inicio suave, vel. máx]
    firstDelay: 12.5,         // primer tero recién tras entrar en ritmo (~12.5 s y >= 700 pts)
    minScoreRegular: 700,     // puntaje mínimo para empezar con teros periódicos
    lowUnlockScore: 2200,     // antes de 2.200 pts solo vuelan medios/altos (no cortan el salto simple)
    jumpHeatLimit: 6.6,       // umbral de saltos continuos antes de lanzar un tero cazador
    emergencyCooldown: 7.5    // s mínimos entre teros cazadores consecutivos
  },
  hero: { halfWidth: 0.17, bottom: 0.08, top: 0.85 },   // en U
  pickupForgiveness: 0.20,                              // pickups más fáciles de agarrar

  // Física (unidades: U y segundos)
  physics: {
    gravity:          12,
    maxJumps:         3,      // máximo 3 saltos seguidos antes de tocar la vereda
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
    horseExtraGap: 0.35,                  // margen extra tras un obstáculo alto (caballo / virgen) para aterrizar
    horseChance: [0.22, 0.60],            // probabilidad de obstáculo alto (caballo o ermita de la Virgen)
    virgenShare: 0.48,                    // proporción de ermitas de la Virgen dentro de los obstáculos altos
    doubleBookChance: [0.05, 0.38],       // libros dobles aparecen más frecuentemente al acelerar
    safeObstacles: 2                      // los primeros 2 obstáculos son siempre libros simples
  },

  points: { toast: 100, tortilla: 200, mate: 500, bonus: 1000 },

  // Bonus del carrito de golf (bonus.png -> golfchica / golfchico)
  golf: {
    thresholds: [3000, 15000],          // aparece a partir de 3.000 pts; si lo agarrás una vez, vuelve a partir de 15.000 pts
    duration: 14.16,                    // dura exactamente lo que dura el mp3 de bonus (~14.16s)
    graceAfter: 0.35,                   // margen breve al volver a correr por si sale de un obstáculo justo al terminar
    heightMul: 1.45,                    // alto visual del carrito en U
    magnetRangeFrac: 0.60,              // alcance horizontal del imán como fracción del ancho de pantalla
    magnetMinU: 6.0                     // alcance mínimo del imán en U
  },
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
  gameOverActions: $('gameover-actions'),
  gameOverScoresBtn: $('gameover-scores-btn'),
  fullScoresBtn:   $('full-scores-btn'),
  fullScoresModal: $('full-scores-modal'),
  fullScoresClose: $('full-scores-close'),
  fullScoresCloseBtn: $('full-scores-close-btn'),
  fullScoresList:  $('full-scores-list'),
  fullScoresCount: $('full-scores-count'),
  fullScoresPersonalRank: $('full-scores-personal-rank'),
  fullScoresPersonalPts:  $('full-scores-personal-pts'),
  skipTutorialBtn: $('skip-tutorial-btn'),
  fullscreenBtn:   $('fullscreen-btn'),
  settings:        $('settings'),
  settingsBtn:     $('settings-btn'),
  settingsPanel:   $('settings-panel'),
  musicVolume:     $('music-volume'),
  musicVolumeOut:  $('music-volume-value'),
  musicMuteBtn:    $('music-mute-btn')
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
  noiseBuf: null,
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
  getNoiseBuffer() {
    if (!this.ac) return null;
    if (this.noiseBuf) return this.noiseBuf;
    const len = Math.floor(this.ac.sampleRate * 1.0);
    const buf = this.ac.createBuffer(1, len, this.ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    return buf;
  },
  noise(dur, filterType = 'bandpass', f0 = 1200, f1 = 1200, q = 1.5, vol = 0.08, delay = 0) {
    if (!this.ac) return;
    const buf = this.getNoiseBuffer();
    if (!buf) return;
    const t = this.ac.currentTime + delay;
    const src = this.ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const flt = this.ac.createBiquadFilter();
    flt.type = filterType;
    flt.Q.setValueAtTime(q, t);
    flt.frequency.setValueAtTime(Math.max(20, f0), t);
    if (f1 !== f0) flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.015, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt).connect(g).connect(this.ac.destination);
    src.start(t);
    src.stop(t + dur + 0.02);
  },
  gulp(delay = 0, pitchMul = 1) {
    if (!this.ac) return;
    const t = this.ac.currentTime + delay;
    const osc = this.ac.createOscillator();
    const flt = this.ac.createBiquadFilter();
    const g = this.ac.createGain();
    osc.type = 'sine';
    // Contorno clásico de trago ("glug"): baja al tragar y sube con la burbuja de líquido
    osc.frequency.setValueAtTime(245 * pitchMul, t);
    osc.frequency.exponentialRampToValueAtTime(135 * pitchMul, t + 0.065);
    osc.frequency.exponentialRampToValueAtTime(385 * pitchMul, t + 0.175);
    flt.type = 'lowpass';
    flt.Q.setValueAtTime(5.0, t);
    flt.frequency.setValueAtTime(480, t);
    flt.frequency.exponentialRampToValueAtTime(860, t + 0.18);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
    osc.connect(flt).connect(g).connect(this.ac.destination);
    osc.start(t);
    osc.stop(t + 0.21);
    this.noise(0.09, 'bandpass', 560 * pitchMul, 780 * pitchMul, 3.8, 0.07, delay + 0.02);
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
      case 'bonus': // fanfarria arcade al activar el carrito de golf (+1000 pts!)
        this.tone(523, 659, 0.09, 'square', 0.11);
        this.tone(659, 784, 0.09, 'square', 0.11, 0.07);
        this.tone(784, 1046, 0.11, 'triangle', 0.13, 0.14);
        this.tone(1046, 1568, 0.22, 'square', 0.11, 0.22);
        break;
      case 'bonusEnd': // aviso suave al finalizar los 5s del carrito
        this.tone(784, 523, 0.12, 'triangle', 0.08);
        this.tone(523, 392, 0.14, 'triangle', 0.07, 0.09);
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
        // 1) Doble beep electrónico del botón + clic
        this.tone(1480, 1480, 0.055, 'sine', 0.11, 0);
        this.tone(1860, 1860, 0.075, 'sine', 0.12, 0.075);
        this.noise(0.03, 'bandpass', 1800, 1200, 2.0, 0.09, 0);
        // 2) Motor / espiral mecánica girando para empujar la lata
        this.tone(128, 152, 0.36, 'sawtooth', 0.075, 0.15);
        this.noise(0.34, 'bandpass', 340, 480, 3.0, 0.07, 0.16);
        // 3) Caída pesada y rebote metálico en el cajón dispensador
        this.tone(210, 54, 0.22, 'triangle', 0.24, 0.52);
        this.tone(360, 118, 0.14, 'square', 0.09, 0.52);
        this.noise(0.16, 'bandpass', 920, 360, 1.4, 0.20, 0.52);
        this.tone(155, 48, 0.14, 'triangle', 0.15, 0.68);
        this.noise(0.11, 'bandpass', 760, 300, 1.8, 0.12, 0.68);
        // 4) Golpecito de la tapa al retirar la bebida
        this.noise(0.07, 'lowpass', 680, 260, 1.2, 0.10, 0.90);
        break;
      case 'canOpen':
        // "Clack-pssshhh": apertura de lata fría con gas
        this.tone(2400, 920, 0.035, 'triangle', 0.14, 0);
        this.noise(0.035, 'highpass', 2600, 2600, 1.2, 0.18, 0);
        this.tone(3100, 1400, 0.03, 'sine', 0.10, 0.045);
        this.noise(0.36, 'bandpass', 3400, 5200, 0.9, 0.15, 0.055);
        break;
      case 'drink':
        // Tragos rítmicos ("glug, glug, glug") de alguien bebiendo
        this.gulp(0, 0.96 + opt * 0.06);
        break;
      case 'drinkAhh':
        // Exhalación suave de alivio al terminar de beber
        this.noise(0.26, 'bandpass', 1150, 680, 1.3, 0.09, 0);
        this.tone(310, 215, 0.22, 'sine', 0.055, 0.02);
        break;
      case 'startRun':
        this.tone(440, 880, 0.12, 'square', 0.08);
        this.tone(660, 1320, 0.14, 'square', 0.06, 0.08);
        this.tone(880, 1760, 0.10, 'triangle', 0.08, 0.16);
        break;
    }
  }
};

/* ---------- Música de fondo (Musica intro · Musicajuego · Musicaperder) ----------
 * - Un único <audio> alterna entre pistas: en iOS, una vez "desbloqueado" con un
 *   toque, ese mismo elemento puede cambiar de pista y sonar sin otro gesto
 *   (por ej. al iniciar la carrera tras la bebida o en el momento del choque).
 * - Las pistas se descargan con fetch y se reproducen desde un blob: así quedan
 *   en la caché del Service Worker y suenan también sin conexión.
 * - El volumen pasa por un GainNode de Web Audio porque en iOS la propiedad
 *   audio.volume es de solo lectura (fallback: audio.volume). */
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

const Music = {
  el: null,
  urls: {},           // pista -> URL lista para reproducir (blob: o ruta original)
  ready: {},          // pista -> Promise<URL>
  durations: {},      // pista -> duración en segundos
  track: null,        // pista cargada en el elemento
  current: 'intro',   // pista que debería sonar ('intro' | 'game' | 'lose' | null)
  volume: CONFIG.musicVolume,
  lastVolume: CONFIG.musicVolume,   // para restaurar al quitar el silencio
  unlocked: false,
  suspended: false,   // pausada porque la pestaña está oculta
  gain: null,
  // Web Audio con archivos locales (file://) da silencio en Chrome: solo se usa sobre http(s)
  useWebAudio: /^https?:$/.test(location.protocol),

  init() {
    const saved = parseFloat(storageGet(CONFIG.storageMusicVolume, ''));
    if (Number.isFinite(saved)) this.volume = clamp(saved, 0, 1);
    if (this.volume > 0) this.lastVolume = this.volume;
    this.el = new Audio();
    this.el.preload = 'auto';
    this.el.setAttribute('playsinline', '');
    this.applyVolume();
  },

  preload(name) {
    const names = name ? [name] : Object.keys(ASSETS.music);
    for (const n of names) {
      if (this.ready[n]) continue;
      const src = ASSETS.music[n];
      if (!src) continue;
      this.ready[n] = fetch(encodeURI(src))
        .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
        .then((b) => {
          const url = URL.createObjectURL(b);
          try {
            const probe = new Audio(url);
            probe.onloadedmetadata = () => {
              if (Number.isFinite(probe.duration) && probe.duration > 0) {
                this.durations[n] = probe.duration;
                if (n === 'bonus') CONFIG.golf.duration = probe.duration;
              }
            };
          } catch (_) {}
          return url;
        })
        .catch(() => encodeURI(src))            // sin fetch/blob: reproducir directo desde la ruta
        .then((url) => { this.urls[n] = url; return url; });
    }
  },

  // Debe llamarse dentro de un gesto del usuario (toque, clic o tecla)
  unlock() {
    Sfx.unlock();
    this.connect();
    if (this.unlocked) {
      // iOS puede frenar el audio al volver de segundo plano: se reanuda solo si hay una pista activa
      if (this.current && this.el.paused && !this.el.ended && !this.suspended) this.resume();
      return;
    }
    this.unlocked = true;
    const name = this.current;
    if (!name || !this.urls[name]) {
      // Se "bendice" el elemento con un silencio dentro del gesto
      this.el.src = SILENT_WAV;
      this.track = null;
      this.resume();
    }
    if (name) this.play(name, false);
  },

  connect() {
    if (this.gain || !this.useWebAudio || !Sfx.ac) return;
    try {
      const source = Sfx.ac.createMediaElementSource(this.el);
      const gain = Sfx.ac.createGain();
      source.connect(gain).connect(Sfx.ac.destination);
      this.gain = gain;
    } catch (_) { this.useWebAudio = false; }
    this.applyVolume();
  },

  // Reproduce una pista (si restart=false y ya está sonando esa misma pista, no la corta)
  play(name, restart = true) {
    if (!ASSETS.music[name]) return;
    if (!restart && this.current === name && this.track === name && this.el && !this.el.paused) {
      return;
    }
    this.current = name;
    const url = this.urls[name];
    if (url) { this.start(name, url, restart); return; }
    this.preload(name);
    this.ready[name].then((u) => { if (this.current === name) this.start(name, u, restart); });
  },

  // Corta la música inmediatamente (ej. al tocar la máquina expendedora)
  stop() {
    this.current = null;
    if (!this.el) return;
    this.el.pause();
    try { this.el.currentTime = 0; } catch (_) {}
  },

  start(name, url, restart = true) {
    const el = this.el;
    if (this.track !== name) {
      el.src = url;
      this.track = name;
    } else if (restart) {
      try { el.currentTime = 0; } catch (_) { /* aún sin metadata */ }
    }
    el.loop = name === 'intro' || name === 'game';
    el.onloadedmetadata = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) {
        this.durations[name] = el.duration;
        if (name === 'bonus') CONFIG.golf.duration = el.duration;
      }
    };
    el.onended = () => {
      if (this.current === 'bonus' && state === STATES.PLAYING) {
        world.golfTimer = 0;
        world.golfGraceTimer = CONFIG.golf.graceAfter;
        Sfx.play('bonusEnd');
        this.play('game', false);
      }
    };
    if (this.unlocked && !this.suspended) this.resume();
  },

  resume() {
    const p = this.el.play();
    if (p && p.catch) p.catch(() => { /* bloqueado hasta el próximo gesto */ });
  },

  setSuspended(hidden) {
    this.suspended = hidden;
    if (hidden) this.el.pause();
    else if (this.unlocked && this.current && !this.el.ended) this.resume();
  },

  setVolume(v) {
    this.volume = clamp(v, 0, 1);
    if (this.volume > 0) this.lastVolume = this.volume;
    storageSet(CONFIG.storageMusicVolume, this.volume.toFixed(2));
    this.applyVolume();
  },

  applyVolume() {
    if (!this.el) return;
    if (this.gain) {
      this.el.volume = 1;
      this.gain.gain.value = this.volume;
    } else {
      this.el.volume = this.volume;
    }
    this.el.muted = this.volume === 0;
  }
};

/* ---------- Menú de configuración (tuerca ⚙ arriba a la derecha) ---------- */
const Settings = {
  open: false,

  setup() {
    const { settings, settingsBtn, settingsPanel, musicVolume, musicMuteBtn } = dom;
    if (!settings || !settingsBtn || !settingsPanel) return;

    settingsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggle();
    });

    if (musicVolume) {
      musicVolume.value = String(Math.round(Music.volume * 100));
      musicVolume.addEventListener('input', () => {
        Music.setVolume(Number(musicVolume.value) / 100);
        this.render();
      });
    }
    if (musicMuteBtn) {
      musicMuteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        Music.setVolume(Music.volume > 0 ? 0 : (Music.lastVolume || CONFIG.musicVolume));
        if (musicVolume) musicVolume.value = String(Math.round(Music.volume * 100));
        this.render();
      });
    }

    // Los toques dentro del menú no deben hacer saltar al personaje ni activar otras capas
    ['pointerdown', 'touchstart', 'mousedown'].forEach((n) =>
      settings.addEventListener(n, (e) => e.stopPropagation(), { passive: true }));

    // Tocar fuera del panel lo cierra (y ese toque no cuenta como salto)
    document.addEventListener('pointerdown', (e) => {
      if (!this.open || (e.target && e.target.closest && e.target.closest('#settings'))) return;
      this.close();
      e.stopPropagation();
      e.preventDefault();
    }, true);

    this.render();
  },

  render() {
    const pct = Math.round(Music.volume * 100);
    if (dom.musicVolume) dom.musicVolume.style.setProperty('--fill', pct + '%');
    if (dom.musicVolumeOut) dom.musicVolumeOut.textContent = pct + '%';
    if (dom.musicMuteBtn) {
      dom.musicMuteBtn.classList.toggle('is-muted', pct === 0);
      dom.musicMuteBtn.setAttribute('aria-pressed', String(pct === 0));
      dom.musicMuteBtn.setAttribute('aria-label', pct === 0 ? 'Activar música' : 'Silenciar música');
    }
  },

  toggle() { this.open ? this.close() : this.openPanel(); },

  openPanel() {
    this.open = true;
    // Abrir el menú en plena carrera pone el juego en pausa
    if (state === STATES.PLAYING) { state = STATES.PAUSED; world.pausedAt = performance.now(); }
    dom.settings.classList.add('is-open');
    dom.settingsBtn.setAttribute('aria-expanded', 'true');
    dom.settingsPanel.setAttribute('aria-hidden', 'false');
  },

  close() {
    if (!this.open) return;
    this.open = false;
    dom.settings.classList.remove('is-open');
    dom.settingsBtn.setAttribute('aria-expanded', 'false');
    dom.settingsPanel.setAttribute('aria-hidden', 'true');
    // Sin foco en el menú, la barra espaciadora vuelve a ser "saltar"
    const a = document.activeElement;
    if (a && dom.settings.contains(a) && a.blur) a.blur();
    if (state === STATES.PAUSED) world.pausedAt = performance.now();
  }
};

/* ---------- Detección de dispositivos móviles y Pantalla Completa ---------- */
function isMobileDevice() {
  return ('ontouchstart' in window) ||
    (navigator.maxTouchPoints > 0) ||
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
    /Android|iPhone|iPad|iPod|Mobile|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');
}

function isFullscreenActive() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
}

function goFullscreen() {
  if (isFullscreenActive()) return;
  const el = document.documentElement;
  const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
  if (fn) {
    try {
      const p = fn.call(el, { navigationUI: 'hide' });
      if (p && p.then) {
        p.then(() => {
          if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(() => {});
          }
        }).catch(() => {});
      }
    } catch (_) { /* ignorado */ }
  }

  // En Android Chrome y navegadores móviles, bloquear orientación en apaisado para ocultar barras de navegación
  try {
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('landscape').catch(() => {});
    }
  } catch (_) {}

  // En iOS Safari / navegadores que no soportan Fullscreen API
  try {
    window.scrollTo(0, 1);
  } catch (_) {}
}

function exitFullscreen() {
  if (!isFullscreenActive()) return;
  const fn = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
  if (fn) {
    try {
      fn.call(document);
    } catch (_) {}
  }
}

function toggleFullscreen() {
  if (isFullscreenActive()) {
    exitFullscreen();
  } else {
    goFullscreen();
  }
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
let settingsInset = 0;    // px desde el borde derecho que ocupa el botón ⚙
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

  // Espacio que ocupa la tuerca ⚙ (arriba a la derecha) para no tapar el HUD
  if (dom.settingsBtn) {
    const r = dom.settingsBtn.getBoundingClientRect();
    settingsInset = r.width ? Math.max(0, W - r.left) : 0;
  }

  buildGroundTile();

  // Reescalar entidades en vuelo si cambió el ancho (rotación / barra del navegador)
  if (prevW && prevW !== W) {
    const k = W / prevW;
    world.obstacles.forEach((o) => { o.x *= k; if (o.flySpeed) o.flySpeed *= k; });
    world.pickups.forEach((p) => { p.x *= k; });
    world.popups.forEach((p) => { p.x *= k; });
  }

  checkOrientation();
}

function checkOrientation() {
  const modal = document.getElementById('rotate-device-modal');
  if (!modal) return;
  const isPortrait = window.innerHeight > window.innerWidth;
  const isMobile = isMobileDevice() || (Math.max(window.innerWidth, window.innerHeight) <= 1024);

  if (isPortrait && isMobile) {
    modal.classList.add('is-active');
  } else {
    modal.classList.remove('is-active');
    // Al estar en horizontal en móviles, asegurar pantalla completa
    if (isMobile && !isFullscreenActive() && state !== STATES.LOADING) {
      goFullscreen();
    }
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
  { name: 'BOY', score: 500 }
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
      const stored = JSON.parse(storageGet(CONFIG.storageScores, 'null'));
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
    for (const p of this.pending) {
      const alreadyInRemote = out.some((r) => r.name === p.name && r.score === p.score);
      if (!alreadyInRemote) out.push({ name: p.name, score: p.score });
    }
    this.list = this.sanitize(out);
  },
  save() {
    storageSet(CONFIG.storageScores, JSON.stringify(this.remote));
  },
  savePending() { storageSet(CONFIG.storagePending, JSON.stringify(this.pending)); },
  changed() { if (this.onChange) this.onChange(); },

  best() { return this.list.length ? this.list[0].score : 0; },
  qualifies(score) {
    // Califica para ingresar iniciales siempre que el puntaje sea mayor a 0
    return Number.isFinite(score) && score > 0;
  },
  isInTop5(score) {
    if (!Number.isFinite(score) || score <= 0) return false;
    const cap = CONFIG.maxScores || 5;
    if (this.list.length < cap) return true;
    return score >= this.list[cap - 1].score;
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

  // Baja el ranking global sincronizado
  async refresh() {
    const version = this.version;
    try {
      const data = await this.request('GET');
      if (data && Array.isArray(data.scores) && version === this.version) {
        this.remote = this.sanitize(data.scores);
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
            this.remote = this.sanitize(data.scores);
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
if (personalRecord >= 20000) {
  personalRecord = 0;
  storageSet(CONFIG.storagePersonalRecord, 0);
}

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
  world.virgenSeen = false;                     // garantiza que la ermita de la Virgen aparezca temprano en la carrera
  world.teroTimer = CONFIG.tero.firstDelay;      // primer tero temprano
  world.teroAlt = 0;                            // rotación de alturas del tero (0=bajo, 1=medio, 2=alto)
  world.emergencyTeroCd = 0;                    // enfriamiento entre teros cazadores
  world.newRecord = false;
  world.golfTimer = 0;                          // segundos restantes del bonus de carrito de golf
  world.golfGraceTimer = 0;                     // margen breve tras finalizar el carrito
  world.bonusTakenCount = 0;                    // cuántas veces se agarró bonus.png en la partida (0, 1, 2)
  world.bonusArmedTier = -1;                    // escalón armado (-1 ninguno, 0 = 3.000 pts, 1 = 15.000 pts)
  world.bonusSpawnDelay = 0;                    // espera aleatoria antes de spawnear bonus.png
  world.plane = { active: false, x: 0, y: 0, w: 0, h: 0, t: 0, speed: 150, timer: 1.5 };
  setExtremeMode(false);

  if (CONFIG.extremeTest) {
    world.bonus = 20000;
    world.score = 20000;
    setExtremeMode(true);
  }

  Object.assign(hero, { h: 0, vy: 0, grounded: true, jumps: 0, animT: 0, sinceJump: 0, sinceDouble: 99, landT: 0, buffer: 0, airTime: 0, jumpHeat: 0 });
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
// Centro vertical del tero: entra planeando desde arriba a la derecha y se nivela en las franjas de salto,
// dejando siempre libre la vereda para quien corre sin saltar
function teroCenterY(o) {
  const bob = Math.sin((o ? o.phase : 0)) * CONFIG.tero.bob * U;
  let swoopPx = 0;
  if (o && o.entryDropU) {
    const settleX = heroX + U * 2.8;
    const span = Math.max(U * 2.5, W - settleX);
    const k = clamp((o.x - settleX) / span, 0, 1);
    const smooth = k * k * (3 - 2 * k);
    swoopPx = o.entryDropU * U * smooth;
  }
  const minTop = safeTop + clamp(U * 0.35, 34, 62);
  if (o && o.skyY !== undefined) {
    return Math.max(minTop, o.skyY - swoopPx) + bob;
  }
  if (o && o.skyHeightU !== undefined) {
    return Math.max(minTop, groundY - o.skyHeightU * U - swoopPx) + bob;
  }
  const skyBottom = Math.max(minTop + 20, groundY - U * 1.40);
  const frac = o && o.skyFrac !== undefined ? o.skyFrac : 0.50;
  return lerp(minTop, skyBottom, frac) + bob;
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
  const h = (CONFIG.size[kind] || CONFIG.size.pickup) * U;
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
    hero.jumpHeat = (hero.jumpHeat || 0) + 0.25;
    Sfx.play('jump');
  } else if (hero.jumps < CONFIG.physics.maxJumps) {
    // Limitado a un máximo de 3 saltos (1 desde vereda + 2 en el aire)
    hero.jumps++;
    hero.sinceDouble = 0;
    // Si estaba cayendo, frena de inmediato la caída y da impulso ascendente
    hero.vy = Math.max(hero.vy * 0.15 + V2, V2);
    hero.jumpHeat = (hero.jumpHeat || 0) + (hero.jumps >= 3 ? 0.55 : 0.40);
    Sfx.play('airJump', hero.jumps);
  } else {
    // Ya agotó los 3 saltos: guarda buffer por si presiona justo antes de tocar el piso
    hero.buffer = CONFIG.physics.inputBuffer;
  }
}

function onPress() {
  if (dom.fullScoresModal && dom.fullScoresModal.classList.contains('is-open')) return;
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

window.addEventListener('touchstart', (e) => {
  if (isMobileDevice() && !isFullscreenActive()) {
    goFullscreen();
  }
}, { passive: true });

window.addEventListener('pointerdown', (e) => {
  if (isMobileDevice() && !isFullscreenActive()) {
    goFullscreen();
  }
  if (state === STATES.LOADING || state === STATES.CHARACTER_SELECT) return;          // el menú usa sus propios botones
  if (e.target && e.target.closest && e.target.closest('#menu-btn, #fullscreen-btn, #skip-tutorial-btn, #settings')) return;
  e.preventDefault();
  Sfx.unlock();
  if (state === STATES.ENTRY) { handleEntryPointer(e.clientX, e.clientY); return; }
  // Cinemáticas: interacción con la máquina expendedora
  if (state === STATES.VENDING_MACHINE) { handleVendingClick(e.clientX, e.clientY); return; }
  onPress();
}, { passive: false });

window.addEventListener('keydown', (e) => {
  // Menú de configuración: Escape lo cierra y, mientras está abierto, las teclas no controlan el juego
  if (Settings.open) {
    if (e.key === 'Escape') { e.preventDefault(); Settings.close(); }
    return;
  }
  if (e.target && e.target.closest && e.target.closest('#settings')) return;
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
// Bloquea el scroll/zoom táctil, salvo dentro del menú ⚙ (para poder arrastrar el control de volumen)
document.addEventListener('touchmove', (e) => {
  if (e.target && e.target.closest && e.target.closest('#settings')) return;
  e.preventDefault();
}, { passive: false });
document.addEventListener('dblclick', (e) => e.preventDefault());

// La música arranca con el primer gesto del usuario (requisito de autoplay de los navegadores)
['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'].forEach((n) =>
  window.addEventListener(n, () => Music.unlock(), { capture: true, passive: true }));

document.addEventListener('visibilitychange', () => {
  Music.setSuspended(document.hidden);
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
  let x0 = W + U;
  let extraOffset = 0;
  const isExtreme = world.score >= 20000;

  // Si ya viene volando un tero que cruzaría heroX al mismo tiempo que este obstáculo:
  // - si es bajo, desplazamos el obstáculo hacia atrás para poder pasar corriendo por abajo del tero primero
  // - si es medio/alto, generamos un manual bajo en vez de caballo/Virgen para no encerrar al jugador
  const tGroundArrive = world.speed > 1 ? (x0 - heroX) / world.speed : 99;
  const lowTeroConflict = world.obstacles.some((o) => {
    if (o.kind !== 'tero' || !o.flySpeed || (o.skyHeightU !== undefined && o.skyHeightU >= 2.18)) return false;
    const tTeroArrive = (o.x - heroX) / o.flySpeed;
    return tTeroArrive > 0 && Math.abs(tTeroArrive - tGroundArrive) < 0.75;
  });
  if (lowTeroConflict) {
    extraOffset = U * 3.4;
    x0 += extraOffset;
  }
  const tAdjustedArrive = world.speed > 1 ? (x0 - heroX) / world.speed : 99;
  const anyTeroConflict = world.obstacles.some((o) => {
    if (o.kind !== 'tero' || !o.flySpeed) return false;
    const tTeroArrive = (o.x - heroX) / o.flySpeed;
    return tTeroArrive > 0 && Math.abs(tTeroArrive - tAdjustedArrive) < 0.78;
  });

  // A partir de los 20.000 puntos aumenta la probabilidad de obstáculos altos (caballos / Virgen) y libros dobles
  const tallFactor = isExtreme ? Math.min(0.72, lerp(S.horseChance[0], S.horseChance[1], p) + 0.15) : lerp(S.horseChance[0], S.horseChance[1], p);
  const forceFirstVirgen = world.spawned === 4 && !world.virgenSeen && !anyTeroConflict;
  const isTall = !anyTeroConflict && (forceFirstVirgen || (world.spawned >= S.safeObstacles && Math.random() < tallFactor));
  let width;

  if (isTall) {
    const kind = (forceFirstVirgen || Math.random() < S.virgenShare) ? 'virgen' : 'horse';
    if (kind === 'virgen') world.virgenSeen = true;
    const d = obstacleDims(kind);
    world.obstacles.push({ kind, x: x0 });
    width = d.w;
    if (Math.random() < 0.55) {                       // premio por salto alto / multi-salto
      const pd = pickupDims('tortilla');
      const pickupH = kind === 'virgen' ? 2.30 : 2.15;
      world.pickups.push({ kind: 'tortilla', x: x0 + d.w / 2 - pd.w / 2, hU: pickupH, phase: rand(0, 6.28) });
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

  let gapSec = rand(lerp(S.gapMin[0], S.gapMin[1], p), lerp(S.gapMax[0], S.gapMax[1], p))
               + (isTall ? S.horseExtraGap : 0);
  if (isExtreme) {
    gapSec *= 0.82; // Espacio entre obstáculos más ajustado en modo extremo
  }
  const gapPx = gapSec * world.speed;
  world.spawnDist = extraOffset + width + gapPx;

  // Bonus del carrito de golf (bonus.png): aparece a partir de 3.000 pts y, si se agarró una vez, vuelve a partir de 15.000 pts
  const tier = world.bonusTakenCount || 0;
  const canSpawnBonus = IMG.bonus
    && tier < CONFIG.golf.thresholds.length
    && world.score >= CONFIG.golf.thresholds[tier]
    && world.bonusArmedTier === tier
    && world.bonusSpawnDelay <= 0
    && world.golfTimer <= 0
    && !world.pickups.some((pk) => pk.kind === 'bonus' && !pk.taken);

  if (canSpawnBonus) {
    const pd = pickupDims('bonus');
    world.pickups.push({
      kind: 'bonus',
      x: x0 + width + gapPx * 0.5 - pd.w / 2,
      hU: rand(1.15, 1.60),
      phase: 0
    });
    world.bonusSpawnDelay = 999; // en pantalla; si pasa de largo sin agarrarse, se reprograma al salir
    return;
  }

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

  if (Math.random() < 0.35 && !isMateSpawn) {                          // tostado "gratis" en el piso
    const pd = pickupDims('toast');
    world.pickups.push({ kind: 'toast', x: x0 + width + gapPx / 2 - pd.w / 2, hU: 0.5, phase: rand(0, 6.28) });
  }
}

/* ---------- Tero en la zona del cielo ---------- */
function hasGroundConflictAtHero(xStart, flySpeed) {
  if (flySpeed <= 1 || world.speed <= 1) return null;
  const tArrive = (xStart - heroX) / flySpeed;
  const padBack = world.score < 3000 ? U * 3.0 : U * 2.4;
  const padFront = world.score < 3000 ? U * 3.4 : U * 2.8;
  for (const o of world.obstacles) {
    if (o.kind === 'tero') continue;
    const w = obstacleDims(o.kind).w;
    const futureL = o.x - world.speed * tArrive;
    const futureR = futureL + w;
    if (futureR > heroX - padBack && futureL < heroX + padFront) {
      return o.kind; // 'book' | 'horse' | 'virgen'
    }
  }
  return null;
}

function spawnSkyTero(isEmergency = false) {
  if (!IMG.tero || !IMG.tero.length) return false;
  // Al inicio de la partida damos margen para entrar en calor antes del primer tero regular
  if (!isEmergency && world.score < CONFIG.tero.minScoreRegular) {
    return false;
  }
  // Nunca acumular más de un tero en pantalla al mismo tiempo
  if (world.obstacles.some((o) => o.kind === 'tero' && o.x > -U * 0.4)) {
    return false;
  }

  // Entra volando desde la derecha (más rápido que el suelo, pero más suave y legible al principio)
  const speedMul = isEmergency
    ? lerp(1.38, 1.50, world.p)
    : lerp(1.22, 1.35, world.p) * rand(0.98, 1.03);
  const flySpeed = world.speed * speedMul;
  const tw = obstacleDims('tero').w;
  const startX = W + tw + 36; // nace completamente fuera del borde derecho y entra volando
  const conflictKind = hasGroundConflictAtHero(startX, flySpeed);

  // Nunca superponer un tero con un caballo o la Virgen cerca de heroX (el jugador necesita saltar alto y aterrizar tranquilo)
  if (conflictKind === 'horse' || conflictKind === 'virgen') {
    return false;
  }

  let skyHeightU;
  if (isEmergency) {
    // Tero cazador cuando el jugador salta continuamente sin parar: apunta al corredor de salto
    skyHeightU = conflictKind === 'book'
      ? rand(2.18, 2.50) // deja espacio para salto simple sobre manual, pero castiga multi-salto continuo
      : rand(1.56, 1.98);
    Sfx.tone(520, 250, 0.20, 'sawtooth', 0.12);
    world.popups.push({
      text: '¡CUIDADO CON EL TERO!',
      x: W * 0.5,
      y: Math.max(safeTop + U * 0.9, groundY - U * 2.35),
      t: 0,
      gold: true
    });
  } else if (world.score < CONFIG.tero.lowUnlockScore) {
    // Inicio amigable (< 2.200 pts): los teros vuelan solo medios/altos para no complicar los saltos bajos iniciales
    const highSlot = (world.teroAlt || 0) % 2;
    world.teroAlt = (world.teroAlt || 0) + 1;
    skyHeightU = highSlot === 0 ? rand(2.42, 2.72) : rand(2.08, 2.32);
    if (conflictKind === 'book' && skyHeightU < 2.20) {
      skyHeightU = rand(2.24, 2.58);
    }
    Sfx.tone(880, 690, 0.08, 'sine', 0.05);
  } else {
    // A partir de 2.200 pts se suma también el vuelo bajo para exigir lectura completa del cielo
    const slot = (world.teroAlt || 0) % 3;
    world.teroAlt = slot + 1;
    if (slot === 0) skyHeightU = rand(1.46, 1.64);      // bajo: obliga a correr por la vereda sin saltar
    else if (slot === 1) skyHeightU = rand(1.98, 2.24); // medio: castiga doble salto descuidado
    else skyHeightU = rand(2.42, 2.72);                 // alto: protege la zona alta de mates / triple salto

    // Si coincide con un manual cerca de heroX, sube lo suficiente para permitir un salto simple limpio
    if (conflictKind === 'book' && skyHeightU < 2.18) {
      skyHeightU = rand(2.20, 2.56);
    }
    Sfx.tone(880, 690, 0.08, 'sine', 0.05);
  }

  world.obstacles.push({
    kind: 'tero',
    x: startX,
    flySpeed,
    speedMul,
    entryDropU: rand(0.24, 0.42), // entra planeando suavemente y se nivela con anticipación
    phase: rand(0, 6.28),
    t: 0,
    skyHeightU,
    isEmergency: !!isEmergency
  });
  return true;
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
  cinema.vending.gulpStep = 0;
  Music.stop();            // al tocar la máquina expendedora se corta la música de intro
  Music.preload('game');   // asegura que Musicajuego.mp3 esté lista apenas arranque la carrera
  Sfx.play('vendingDrop'); // sonido de máquina expendedora y caída de la bebida
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
    Music.play('intro', false);
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
      phase: 'enterWalk',  // enterWalk → running → dialog1 → practiceBook → dialog2 → practiceHorse → dialogVirgen → practiceVirgen → dialog3 → practiceTero → fadeOut → runToEnd → done
      dialogFrame: 0,
      dialogTimer: 0,
      charCount: 0,
      lastCharCount: 0,
      popAlpha: 0,
      obstacle: null,
      stumbleT: 0,
      passedBook: false,
      passedHorse: false,
      passedVirgen: false,
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
    const textPhaseVirgen = 'Hasta 3 saltos seguidos: ¡Saltá alto para esquivar la Virgen!';
    const textPhase3 = '¡Ojo en el cielo! Esquivá los teros (no saltes sin parar)';
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
            tut.phase = 'dialogVirgen';
            tut.t = 0;
            tut.charCount = 0;
            tut.lastCharCount = 0;
            tut.dialogTimer = 0;
            tut.dialogFrame = 0;
            Sfx.play('pickup');
          }
        }
        break;

      case 'dialogVirgen': {
        world.groundScroll += world.speed * dt;
        world.bgScroll += (world.speed * 0.45) * dt;
        tut.popAlpha = 1;
        const countV = Math.min(textPhaseVirgen.length, Math.floor(tut.t * charsPerSec));
        tut.charCount = countV;
        if (countV < textPhaseVirgen.length) {
          tut.dialogTimer += dt;
          tut.dialogFrame = Math.floor(tut.dialogTimer / 0.11) % 6;
          if (countV > (tut.lastCharCount || 0)) {
            tut.lastCharCount = countV;
            if (textPhaseVirgen[countV - 1] !== ' ' && countV % 2 === 0) Sfx.play('talk');
          }
        } else {
          tut.dialogFrame = 0;
          tut.dialogTimer = 0;
        }
        if (tut.t > 2.8) {
          tut.phase = 'practiceVirgen';
          tut.t = 0;
          tut.charCount = textPhaseVirgen.length;
          tut.dialogFrame = 0;
          tut.obstacle = { kind: 'virgen', x: W + U * 1.1 };
        }
        break;
      }

      case 'practiceVirgen':
        world.groundScroll += world.speed * dt;
        world.bgScroll += (world.speed * 0.45) * dt;
        tut.popAlpha = 1;
        tut.charCount = textPhaseVirgen.length;
        tut.dialogFrame = 0;
        if (tut.obstacle) {
          tut.obstacle.x -= world.speed * dt;
          const hr = heroRect(streetY);
          const or = obstacleRect(tut.obstacle, streetY);
          if (overlap(hr, or) && tut.stumbleT <= 0) {
            // Tropiezo con la ermita de la Virgen: reintenta para practicar salto alto / multi-salto
            tut.stumbleT = 0.55;
            Sfx.play('hit');
            tut.obstacle.x = W + U * 1.2;
          } else if (tut.obstacle.x < heroX - U * 0.8) {
            // Superada con éxito mediante salto alto / multi-salto
            tut.passedVirgen = true;
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
            x: W + obstacleDims('tero').w + 30,
            t: 0,
            phase: 0,
            flySpeed: world.speed * 1.42,
            entryDropU: 0.42,
            skyY: streetY - U * 1.38
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
    } else if (tut.phase === 'practiceVirgen') {
      const blink = Math.floor(performance.now() / 380) % 2 === 0;
      const size = clamp(U * 0.19, 11, 20);
      drawText('¡HASTA 3 SALTOS SEGUIDOS PARA ESQUIVAR LA VIRGEN!', W / 2, H - U * 0.42, size, {
        color: blink ? UNLAM.glow : '#ffffff',
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
      startX: 0,
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
    // Posición exacta del pasaje de entrada (centro de la puerta indicado con cruz roja en Entrada.png)
    const turnStartX = bg.x + (820 / 1366) * bg.w;
    const gateTargetX = bg.x + (932 / 1366) * bg.w;
    const sidewalkY = bg.y + (710 / 768) * bg.h;
    const thresholdY = bg.y + (508 / 768) * bg.h;

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
        // Continúa caminando hacia la derecha por la vereda hasta iniciar el giro hacia el centro de la puerta
        c.walkT += dt;
        c.charX += Math.max(W * 0.28, 170) * dt;
        c.charY = sidewalkY;
        // Al aproximarse a la abertura de la reja, comienza la curva hacia el centro del portal
        if (c.charX >= turnStartX) {
          c.startX = c.charX;
          c.phase = 'walkToDoor';
          c.t = 0;
          c.walkT = 0;
        }
        break;

      case 'walkToDoor':
        // Avanza en perspectiva curvando hacia el centro de la puerta (cruz roja entre las rejas abiertas)
        c.walkT += dt;
        const walkDur = 2.0;
        const p = clamp(c.t / walkDur, 0, 1);
        const curveP = Math.sin(p * Math.PI * 0.5);
        c.charX = lerp(c.startX || turnStartX, gateTargetX, curveP);
        c.charY = lerp(sidewalkY, thresholdY, p);
        if (p >= 1) {
          c.charX = gateTargetX;
          c.charY = thresholdY;
          c.phase = 'fadeOut';
          c.t = 0;
        }
        break;

      case 'fadeOut':
        // Al traspasar el centro del umbral, continúa caminando hacia adentro y hace fade a negro
        c.walkT += dt;
        c.charY = thresholdY - (c.t / 0.6) * (14 / 768) * bg.h;
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

    // Fondo: entrada de la universidad (UNLaM - Entrada)
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
      // Vista de espaldas en perspectiva hacia el centro del portal
      const sidewalkY = bg.y + (710 / 768) * bg.h;
      const thresholdY = bg.y + (508 / 768) * bg.h;
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
        // Cae la bebida al compartimento de salida (sprites maquina 1-4 sincronizados con el sonido)
        v.dropT += dt;
        if (v.dropT < 0.22) v.maqFrame = 0;
        else if (v.dropT < 0.50) v.maqFrame = 1;
        else if (v.dropT < 0.88) v.maqFrame = 2;
        else v.maqFrame = 3;
        if (v.dropT > 1.08) {
          v.phase = 'drink';
          v.t = 0;
          v.drinkT = 0;
          v.gulpStep = 0;
          Sfx.play('canOpen'); // destape con gas ("clack-pssshhh")
        }
        break;

      case 'drink':
        // El personaje bebe la gaseosa (animación cocachica / cocachico frames 1-4 + tragos)
        v.drinkT += dt;
        if (v.drinkT < 0.50) v.drinkFrame = 0;
        else if (v.drinkT < 0.88) v.drinkFrame = 1;
        else if (v.drinkT < 1.42) v.drinkFrame = 2;
        else v.drinkFrame = 3;

        if (v.gulpStep === 0 && v.drinkT >= 0.86) { v.gulpStep = 1; Sfx.play('drink', 0); }
        if (v.gulpStep === 1 && v.drinkT >= 1.20) { v.gulpStep = 2; Sfx.play('drink', 1); }
        if (v.gulpStep === 2 && v.drinkT >= 1.54) { v.gulpStep = 3; Sfx.play('drink', 2); }
        if (v.gulpStep === 3 && v.drinkT >= 1.86) { v.gulpStep = 4; Sfx.play('drinkAhh'); }

        if (v.drinkT > 2.15) {
          v.phase = 'ready';
          v.t = 0;
          Sfx.play('startRun');
        }
        break;

      case 'ready':
        // Regresa a la pose estándar de carrera (run) antes de iniciar
        if (v.t > 0.38) {
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
    Music.play('game'); // cuando se activa el juego comienza Musicajuego.mp3
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

    // A partir de los 20.000 puntos aumenta la dificultad y velocidad
    const isExtreme = world.score >= 20000;
    const extremeBoost = isExtreme ? Math.min(1.36, 1.18 + ((world.score - 20000) / 10000) * 0.18) : 1;
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

    // Activación del Modo Extremo a partir de los 20.000 puntos:
    // Aumenta la dificultad y transforma los colores del juego
    if (world.score >= 20000) {
      if (!world.isExtreme) {
        setExtremeMode(true);
        world.extremeFlash = 1.0;
        Sfx.play('milestone');
        Sfx.tone(960, 480, 0.35, 'sawtooth', 0.15);
        world.popups.push({
          text: '⚡ ¡MODO EXTREMO: 20.000 PTS! ⚡',
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

    // --- Temporizador del bonus Carrito de Golf (5 segundos) y aparición de bonus.png ---
    const G = CONFIG.golf;
    if (world.golfTimer > 0) {
      world.golfTimer = Math.max(0, world.golfTimer - dt);
      if (world.golfTimer === 0) {
        world.golfGraceTimer = G.graceAfter;
        Sfx.play('bonusEnd');
        if (state === STATES.PLAYING) {
          Music.play('game', false);
        }
      }
    } else if (world.golfGraceTimer > 0) {
      world.golfGraceTimer = Math.max(0, world.golfGraceTimer - dt);
    }

    const bonusTier = world.bonusTakenCount || 0;
    if (bonusTier < G.thresholds.length && world.score >= G.thresholds[bonusTier]) {
      if (world.bonusArmedTier !== bonusTier) {
        world.bonusArmedTier = bonusTier;
        world.bonusSpawnDelay = Math.max(world.golfTimer > 0 ? world.golfTimer + 2.0 : 0, rand(0.8, 2.2));
      } else if (world.golfTimer <= 0 && !world.pickups.some((p) => p.kind === 'bonus' && !p.taken)) {
        if (world.bonusSpawnDelay > 0) world.bonusSpawnDelay -= dt;
      }
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

    // --- Tero periódico (poca frecuencia, entra volando desde la derecha de a uno por vez) ---
    const T = CONFIG.tero;
    world.teroTimer -= dt;
    if (world.emergencyTeroCd > 0) world.emergencyTeroCd = Math.max(0, world.emergencyTeroCd - dt);
    if (world.teroTimer <= 0) {
      const spawned = spawnSkyTero(false);
      if (!spawned) {
        world.teroTimer = 0.65; // espera breve si ya había un tero o un obstáculo alto en heroX
      } else {
        const minI = lerp(T.intervalMin[0], T.intervalMin[1], world.p);
        const maxI = lerp(T.intervalMax[0], T.intervalMax[1], world.p);
        world.teroTimer = (world.score >= 20000)
          ? rand(5.0, 8.0) // Modo extremo: más activo pero sin saturar el cielo
          : rand(minI, maxI);
      }
    }

    // --- Detector de saltos continuos ("bunny-hopping" sin correr por la vereda) ---
    // En juego normal se enfría rápido en el piso; solo dispara un tero veloz si salta sin parar varios ciclos
    if (world.golfTimer > 0) {
      hero.jumpHeat = 0;
    } else if (!hero.grounded) {
      hero.jumpHeat = (hero.jumpHeat || 0) + dt * 0.90;
    } else {
      hero.jumpHeat = Math.max(0, (hero.jumpHeat || 0) - dt * 2.6);
    }
    const heatLimit = world.score < 2200 ? 7.8 : T.jumpHeatLimit;
    if (world.golfTimer <= 0 && hero.jumpHeat >= heatLimit && world.emergencyTeroCd <= 0) {
      if (spawnSkyTero(true)) {
        hero.jumpHeat = 0;
        world.emergencyTeroCd = T.emergencyCooldown;
        world.teroTimer = Math.max(world.teroTimer, 7.5);
      }
    }

    // --- Spawner ---
    world.spawnDist -= dx;
    if (world.spawnDist <= 0) spawnPattern();

    // --- Entidades ---
    for (const o of world.obstacles) {
      const spd = o.kind === 'tero'
        ? Math.max(o.flySpeed || 0, world.speed * (o.speedMul || 1.25))
        : world.speed;
      o.x -= spd * dt;
      if (o.kind === 'tero') { o.t += dt; o.phase += dt * 6.0; }   // aleteo + vuelo activo
    }

    // Imán de elementos con puntos mientras dura el bonus del carrito de golf
    const magnetActive = world.golfTimer > 0;
    const magnetRange = Math.max(W * G.magnetRangeFrac, U * G.magnetMinU);
    const magnetTargetX = heroX;
    const magnetTargetY = groundY - (hero.h + 0.55) * U;

    for (const p of world.pickups) {
      p.phase += dt * 4;
      if (p.kind !== 'bonus' && !p.taken) {
        if (magnetActive && p.x <= heroX + magnetRange && p.x >= -U * 0.8) {
          p.magnetized = true;
        }
        if (p.magnetized) {
          const pd = pickupDims(p.kind);
          const cx = p.x + pd.w / 2;
          const cy = groundY - p.hU * U;
          const vx = magnetTargetX - cx;
          const vy = magnetTargetY - cy;
          const dist = Math.hypot(vx, vy);
          const pullStep = Math.max(world.speed * 2.25, U * 16) * dt;
          if (dist <= pullStep || dist < U * 0.35) {
            p.x = magnetTargetX - pd.w / 2;
            p.hU = (groundY - magnetTargetY) / U;
          } else {
            const nx = cx + (vx / dist) * pullStep;
            const ny = cy + (vy / dist) * pullStep;
            p.x = nx - pd.w / 2;
            p.hU = (groundY - ny) / U;
          }
          continue;
        }
      }
      p.x -= dx;
    }

    for (const p of world.pickups) {
      if (p.kind === 'bonus' && !p.taken && p.x + pickupDims('bonus').w <= -U) {
        // Si no lo agarró en esta pasada, vuelve a ofrecerse más adelante
        world.bonusSpawnDelay = rand(5.5, 9.0);
      }
    }
    world.obstacles = world.obstacles.filter((o) => o.x + obstacleDims(o.kind).w > -U);
    world.pickups   = world.pickups.filter((p) => !p.taken && p.x + pickupDims(p.kind).w > -U);

    // --- Popups ---
    for (const p of world.popups) p.t += dt;
    world.popups = world.popups.filter((p) => p.t < 0.8);

    // --- Colisiones ---
    const hr = heroRect();
    const golfPassGround = world.golfTimer > 0 || world.golfGraceTimer > 0;
    for (const o of world.obstacles) {
      if (o.passedByGolf) continue;
      if (overlap(hr, obstacleRect(o))) {
        // El carrito de golf atraviesa todos los elementos del suelo (manuales y caballo)
        if (golfPassGround && o.kind !== 'tero') {
          o.passedByGolf = true;
          continue;
        }
        if (!CONFIG.godMode) { die(); return; }
      }
    }

    const pickupHr = world.golfTimer > 0
      ? { l: heroX - U * 0.85, r: heroX + U * 0.85, t: hr.t - U * 0.35, b: hr.b + U * 0.12 }
      : hr;
    for (const p of world.pickups) {
      if (!p.taken && overlap(pickupHr, pickupRect(p))) {
        p.taken = true;
        const pts = CONFIG.points[p.kind] || 100;
        world.bonus += pts;
        world.score = Math.floor(world.dist * 0.025) + world.bonus;
        if (p.kind === 'bonus') {
          world.bonusTakenCount = (world.bonusTakenCount || 0) + 1;
          const dur = (Music.durations['bonus'] && Music.durations['bonus'] > 0)
            ? Music.durations['bonus']
            : (Music.track === 'bonus' && Number.isFinite(Music.el.duration) && Music.el.duration > 0
              ? Music.el.duration
              : G.duration);
          CONFIG.golf.duration = dur;
          world.golfTimer = dur;
          world.golfGraceTimer = 0;
          if (!hero.grounded && hero.vy > 0) hero.vy *= 0.35;
          world.popups.push({
            text: '¡BONUS +' + pts + '!',
            x: heroX + U * 0.45,
            y: groundY - (hero.h + 1.45) * U,
            t: 0,
            gold: true
          });
          Sfx.play('bonus');
          Music.play('bonus');
          world.milestoneT = 1.5;
        } else {
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
  if (world.golfTimer > 0 && set.golf) return set.golf;
  if (!hero.grounded) {
    // 1) despegue agachado (también al iniciar 2do y 3er salto)
    if (hero.sinceJump < 0.07 || (hero.jumps >= 2 && hero.sinceDouble < 0.08)) return set.jumpTakeoff;
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
  const img = heroSprite();
  if (!img) return;

  const isGolf = world.golfTimer > 0 && set.golf && img === set.golf;
  const shrink = 1 - Math.min(hero.h, 2) * 0.18;

  if (isGolf) {
    const h = U * CONFIG.golf.heightMul;
    const w = h * (img.naturalWidth / img.naturalHeight);
    const rumble = (hero.grounded && state === STATES.PLAYING) ? Math.sin(world.time * 42) * U * 0.012 : 0;
    const padOffset = h * (character === 'chica' ? 0.045 : 0.028);
    const endingBlink = world.golfTimer < 1.0 && Math.floor(world.time * 12) % 2 === 1;

    // Sombra amplia bajo el carrito
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.beginPath();
    ctx.ellipse(heroX, customGroundY + U * 0.03, w * 0.42 * shrink, U * 0.075 * shrink, 0, 0, Math.PI * 2);
    ctx.fill();

    // Aura magnética pulsante alrededor del carrito
    ctx.save();
    const pulse = (world.time * 2.2) % 1;
    ctx.strokeStyle = pulse < 0.5 ? '#ffd34d' : UNLAM.glow;
    ctx.globalAlpha = (1 - pulse) * 0.55;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(heroX, customGroundY - hero.h * U - h * 0.44, w * (0.48 + pulse * 0.22), h * (0.44 + pulse * 0.18), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    if (endingBlink) ctx.globalAlpha = 0.55;
    ctx.drawImage(img, heroX - w / 2, customGroundY - hero.h * U - h + padOffset + rumble, w, h);
    ctx.restore();
    return;
  }

  const k = U / set.idle.naturalHeight;               // escala común para todos los frames

  // Sombra en el piso
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
  let x = (W - w) / 2;
  const y = H - h;
  // Mantener el portal de la entrada (a 932/1366 del ancho) dentro de pantalla en formatos estrechos
  const gateX = x + (932 / nw) * w;
  const margin = Math.min(60, W * 0.12);
  if (gateX > W - margin) {
    x = W - margin - (932 / nw) * w;
  }
  if (x > 0) x = 0;
  if (x < W - w) x = W - w;
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
  } else if (tut.phase === 'dialogVirgen' || tut.phase === 'practiceVirgen') {
    fullInstruction = 'Hasta 3 saltos seguidos: ¡Saltá alto para esquivar la Virgen!';
  } else if (tut.phase === 'dialog3' || tut.phase === 'practiceTero') {
    fullInstruction = '¡Ojo en el cielo! Esquivá los teros (no saltes sin parar)';
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

const TERO_WING_SEQ = [0, 1, 2, 3, 2, 1];
function drawTero(o) {
  const frames = IMG.tero;
  if (!frames || !frames.length) return;
  const seqIdx = TERO_WING_SEQ[Math.floor((o.t || 0) / CONFIG.tero.frameDur) % TERO_WING_SEQ.length];
  const img = frames[seqIdx % frames.length] || frames[0];
  const { w, h, s } = obstacleDims('tero');
  const cx = o.x + w / 2, cy = teroCenterY(o);
  // Inclinación natural de vuelo mientras entra planeando desde la derecha
  let tilt = Math.cos(o.phase || 0) * 0.04;
  if (o.entryDropU) {
    const settleX = heroX + U * 2.8;
    const k = clamp((o.x - settleX) / Math.max(U * 2.5, W - settleX), 0, 1);
    tilt += 0.11 * (4 * k * (1 - k));
  }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(-1, 1);                                       // los sprites miran a la derecha; el tero viene hacia la izquierda
  ctx.rotate(tilt);
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
    const bob = p.magnetized ? 0 : Math.sin(p.phase) * U * 0.05;
    const py = groundY - p.hU * U - h / 2 + bob;

    if (p.kind === 'bonus') {
      // Bonus con tamaño del resto de elementos (0.50 U) y luz radiante que resalta
      const cx = p.x + w / 2, cy = py + h / 2;
      const radius = Math.max(w, h) * 0.50;
      const pulse = Math.sin(world.time * 6.5) * 0.5 + 0.5; // 0..1
      const blinkOn = Math.floor(world.time * 8) % 2 === 0;

      // 1) Luz de fondo brillante (corona radial dorada/menta)
      ctx.save();
      const glowRadius = radius * (2.1 + pulse * 0.4);
      const grad = ctx.createRadialGradient(cx, cy, radius * 0.15, cx, cy, glowRadius);
      grad.addColorStop(0, 'rgba(255, 255, 220, 0.85)');
      grad.addColorStop(0.35, 'rgba(255, 215, 64, 0.50)');
      grad.addColorStop(0.70, 'rgba(92, 212, 182, 0.22)');
      grad.addColorStop(1, 'rgba(255, 215, 64, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 2) Destellos cruzados de luz radiante
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(world.time * 0.85);
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.5 + pulse * 0.4})`;
      ctx.lineWidth = 2;
      const flare = radius * (1.25 + pulse * 0.25);
      ctx.beginPath();
      ctx.moveTo(-flare, 0); ctx.lineTo(flare, 0);
      ctx.moveTo(0, -flare); ctx.lineTo(0, flare);
      ctx.stroke();
      const dFlare = flare * 0.60;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-dFlare, -dFlare); ctx.lineTo(dFlare, dFlare);
      ctx.moveTo(-dFlare, dFlare); ctx.lineTo(dFlare, -dFlare);
      ctx.stroke();
      ctx.restore();

      // 3) Anillo de luz exterior resplandeciente
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius * (1.10 + pulse * 0.12), 0, Math.PI * 2);
      ctx.strokeStyle = blinkOn ? '#ffe066' : '#ffffff';
      ctx.lineWidth = 2.4;
      ctx.shadowColor = '#ffd34d';
      ctx.shadowBlur = 12 + pulse * 8;
      ctx.stroke();
      ctx.restore();

      // 3.5) Base circular blanca para garantizar maximo contraste contra el fondo
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.94, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();

      // 4) Emblema del bonus del tamaño estándar de los pickups con iluminación
      ctx.save();
      ctx.shadowColor = '#ffd34d';
      ctx.shadowBlur = 14 + pulse * 8;
      ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
      ctx.restore();
      continue;
    }

    if (p.magnetized) {
      ctx.save();
      ctx.strokeStyle = '#ffd34d';
      ctx.globalAlpha = 0.65;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x + w / 2, py + h / 2, Math.max(w, h) * 0.52, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.drawImage(img, p.x, py, w, h);
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
    const isLong = p.text && p.text.length > 10;
    const s = isLong ? clamp(Math.min(size * 0.92, (W * 0.86) / (p.text.length * 0.62)), 13, 28) : (p.gold ? size * 1.35 : size);
    const halfEst = (p.text ? p.text.length : 4) * s * 0.31 + 12;
    const px = clamp(p.x, halfEst, Math.max(halfEst, W - halfEst));
    drawText(p.text, px, p.y - k * U * 0.6, s, { color: col, alpha: 1 - k * k });
  }
}

function drawHUD() {
  const size = clamp(U * 0.2, 14, 28);
  // En móviles en horizontal, garantizar separación de la barra de estado y notch/isla dinámica
  const y = Math.max(safeTop + 12, 16) + size / 2;
  const marginL = Math.max(safeLeft + 16, 24);
  const marginR = Math.max(safeRight + 16, 24, settingsInset + 12);   // deja lugar a la tuerca ⚙
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

  // Indicador activo del bonus de carrito de golf (5s)
  if (world.golfTimer > 0) {
    const subSize = clamp(size * 0.78, 11, 20);
    const by = y + size * 1.25;
    const frac = clamp(world.golfTimer / CONFIG.golf.duration, 0, 1);
    const warn = world.golfTimer < 1.0 && Math.floor(world.time * 10) % 2 === 1;
    drawText('★ BONUS ' + world.golfTimer.toFixed(1) + 's', marginL, by, subSize, {
      align: 'left',
      color: warn ? '#ffffff' : '#ffd34d'
    });
    const barW = clamp(U * 1.45, 96, 170);
    const barH = Math.max(5, Math.round(subSize * 0.34));
    const barY = by + subSize * 0.72;
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    rrect(marginL, barY, barW, barH, barH / 2);
    ctx.fill();
    if (frac > 0) {
      ctx.fillStyle = warn ? '#ff8a65' : UNLAM.glow;
      rrect(marginL, barY, Math.max(barH, barW * frac), barH, barH / 2);
      ctx.fill();
    }
    ctx.restore();
  }
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

  const inTop5 = entryUI.rank <= 5;
  const titleText = inTop5 ? '★ ¡ENTRASTE AL TOP 5! ★' : '★ REGISTRÁ TU PUNTAJE ★';
  const titleColor = inTop5 ? '#ffd34d' : UNLAM.green;
  drawText(titleText, W / 2, y + titleH / 2, f * 1.35, { color: titleColor, alpha: blink ? 1 : 0.75 });
  y += titleH;
  drawText('PUNTOS ' + pad(world.score), W / 2, y + lineH / 2, f);
  y += lineH;
  drawText('PUESTO #' + entryUI.rank, W / 2, y + lineH / 2, f * 0.9, { color: inTop5 ? '#ffd34d' : UNLAM.light });
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
  const hintText = inTop5 ? '¡Tu nombre aparecerá en el Top 5!' : 'Solo los 5 mejores puntajes se muestran en el Top 5';
  drawText(hintText, W / 2, y + f * 0.9, f * 0.65, { alpha: 0.75, weight: 600 });

  entryUI.hits = hits;
}

/* Game Over con ranking arcade (Top 5) */
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
  if (world.addedRank > 0 && world.addedRank <= 5) {
    lines.push({ t: '★ ¡ENTRASTE AL TOP 5! (#' + world.addedRank + ') ★', s: 0.95, color: '#ffd34d', blink: true });
  } else if (world.newGlobalRecord) {
    lines.push({ t: '★ ¡NUEVO RÉCORD GLOBAL! ★', s: 0.95, color: '#ffd34d', blink: true });
  } else if (world.newPersonalRecord) {
    const rankTxt = world.addedRank > 0 ? ' (PUESTO #' + world.addedRank + ')' : '';
    lines.push({ t: '★ ¡SUPERASTE TU RÉCORD!' + rankTxt + ' ★', s: 0.95, color: UNLAM.light, blink: true });
  } else if (world.addedRank > 5) {
    lines.push({ t: 'PUNTAJE REGISTRADO · PUESTO #' + world.addedRank, s: 0.85, color: '#aab3c5' });
  }
  if (rows.length) {
    lines.push({ t: '— TOP 5 GLOBAL —', s: 0.85, color: UNLAM.green, gap: 0.4 });
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
  world.golfTimer = 0;
  world.golfGraceTimer = 0;
  // Al perder (incluso tras superar los 20.000 pts), deja de cambiar de color de inmediato
  setExtremeMode(false);
  Sfx.play('hit');
  Music.play('lose');                          // corta el tema principal y suena Musicaperder
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
  // En modos de prueba (?extreme o ?god), no entra al ranking para no bloquear a los estudiantes
  if (CONFIG.extremeTest || CONFIG.godMode) {
    transitionTo(STATES.GAME_OVER);
    return;
  }
  if (Scores.qualifies(world.score)) {         // cualquier puntaje > 0 pide iniciales para registrarlo
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
  // Al reiniciar tras perder, va directo al inicio del juego luego de la gaseosa
  world.vendingX = heroX + U * 0.58;
  Sfx.play('startRun');
  transitionTo(STATES.PLAYING);                // STATES.PLAYING.enter() conserva vendingX e inicia Musicajuego.mp3
}

function showMenu() {
  if (state !== STATES.GAME_OVER) return;
  setExtremeMode(false);
  resetRun();
  Music.play('intro');
  transitionTo(STATES.CHARACTER_SELECT);
}


/* =============================================================================
 * 9) BUCLE PRINCIPAL Y ARRANQUE
 * ============================================================================= */
let lastT = 0;
let menuBtnShown = false;
let skipTutorialBtnShown = false;
let fullscreenBtnShown = true;

function frame(t) {
  requestAnimationFrame(frame);
  const dt = lastT ? clamp((t - lastT) / 1000, 0, 0.05) : 0;
  lastT = t;

  const handler = stateHandlers[state];
  if (handler) {
    if (handler.update) handler.update(dt);
    if (handler.draw) handler.draw(ctx);
  }

  // Botones de Game Over solo en la pantalla de game over
  const wantMenuBtn = state === STATES.GAME_OVER;
  if (wantMenuBtn !== menuBtnShown) {
    menuBtnShown = wantMenuBtn;
    if (dom.gameOverActions) dom.gameOverActions.classList.toggle('is-visible', wantMenuBtn);
    else if (dom.menuBtn) dom.menuBtn.classList.toggle('is-visible', wantMenuBtn);
  }

  // Botón "Saltar tutorial" solo durante el tutorial
  const wantSkipTutorial = state === STATES.TUTORIAL;
  if (wantSkipTutorial !== skipTutorialBtnShown) {
    skipTutorialBtnShown = wantSkipTutorial;
    if (dom.skipTutorialBtn) dom.skipTutorialBtn.classList.toggle('is-visible', wantSkipTutorial);
  }

  // Botón "Pantalla completa" visible en menú, game over y pausa; sutil/oculto durante carrera activa
  const wantFullscreenBtn = state === STATES.CHARACTER_SELECT || state === STATES.GAME_OVER || state === STATES.PAUSED;
  if (wantFullscreenBtn !== fullscreenBtnShown) {
    fullscreenBtnShown = wantFullscreenBtn;
    if (dom.fullscreenBtn) dom.fullscreenBtn.classList.toggle('is-hidden', !wantFullscreenBtn);
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


function renderFullScores() {
  if (!dom.fullScoresList) return;
  updatePersonalRecord();
  dom.fullScoresList.textContent = '';
  const list = Scores.list || [];

  if (dom.fullScoresCount) {
    dom.fullScoresCount.textContent = list.length
      ? `${list.length} puntajes registrados`
      : (Scores.status === 'loading' ? 'Cargando ranking…' : 'Sin puntajes registrados');
  }

  if (dom.fullScoresPersonalPts) {
    dom.fullScoresPersonalPts.textContent = pad(personalRecord);
  }
  if (dom.fullScoresPersonalRank) {
    const rank = personalRecord > 0 ? Scores.rankFor(personalRecord) : 0;
    dom.fullScoresPersonalRank.textContent = rank > 0 ? `Tu récord: Puesto #${rank}` : 'Aún sin récord';
  }

  const medalIcons = ['🥇', '🥈', '🥉'];
  list.forEach((e, i) => {
    const rank = i + 1;
    const li = document.createElement('li');
    li.className = 'full-scores-row';
    if (rank <= 3) li.classList.add('is-podium', 'is-rank-' + rank);
    else if (rank <= 5) li.classList.add('is-top5');
    if (world.addedRank === rank) li.classList.add('is-new');

    const rankSpan = document.createElement('span');
    rankSpan.className = 'col-rank';
    rankSpan.textContent = (rank <= 3 ? medalIcons[rank - 1] + ' ' : '') + '#' + rank;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'col-name';
    nameSpan.textContent = e.name;

    const ptsSpan = document.createElement('span');
    ptsSpan.className = 'col-pts';
    ptsSpan.textContent = pad(e.score);

    li.appendChild(rankSpan);
    li.appendChild(nameSpan);
    li.appendChild(ptsSpan);
    dom.fullScoresList.appendChild(li);
  });

  if (!list.length) {
    const emptyLi = document.createElement('li');
    emptyLi.className = 'full-scores-row is-empty';
    emptyLi.textContent = Scores.status === 'loading'
      ? 'Cargando ranking…'
      : '¡Sé la primera persona en dejar su marca!';
    dom.fullScoresList.appendChild(emptyLi);
  }
}

function openFullScoresModal() {
  Scores.refresh();
  renderFullScores();
  if (dom.fullScoresModal) {
    dom.fullScoresModal.setAttribute('aria-hidden', 'false');
    dom.fullScoresModal.classList.add('is-open');
  }
}

function closeFullScoresModal() {
  if (dom.fullScoresModal) {
    dom.fullScoresModal.setAttribute('aria-hidden', 'true');
    dom.fullScoresModal.classList.remove('is-open');
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
  if (dom.fullScoresModal && dom.fullScoresModal.classList.contains('is-open')) {
    if (e.key === 'Escape') closeFullScoresModal();
    return;
  }
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
  // Listeners para modal de ranking completo
  if (dom.fullScoresBtn) {
    dom.fullScoresBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openFullScoresModal();
    });
  }
  if (dom.gameOverScoresBtn) {
    dom.gameOverScoresBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openFullScoresModal();
    });
  }
  if (dom.fullScoresClose) {
    dom.fullScoresClose.addEventListener('click', (e) => {
      e.stopPropagation();
      closeFullScoresModal();
    });
  }
  if (dom.fullScoresCloseBtn) {
    dom.fullScoresCloseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeFullScoresModal();
    });
  }
  if (dom.fullScoresModal) {
    dom.fullScoresModal.addEventListener('click', (e) => {
      if (e.target === dom.fullScoresModal || (e.target && e.target.classList && e.target.classList.contains('full-scores-modal__backdrop'))) {
        e.stopPropagation();
        closeFullScoresModal();
      }
    });
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dom.fullScoresModal && dom.fullScoresModal.classList.contains('is-open')) {
      closeFullScoresModal();
    }
  });

  dom.pickers.forEach((b) => {
    const onPick = (e) => {
      e.stopPropagation();
      if (isMobileDevice()) goFullscreen();
      selectCharacter(b.dataset.char);
    };
    b.addEventListener('pointerdown', () => { if (isMobileDevice()) goFullscreen(); });
    b.addEventListener('touchstart', () => { if (isMobileDevice()) goFullscreen(); }, { passive: true });
    b.addEventListener('click', onPick);
  });

  if (dom.startBtn) {
    const onStart = (e) => {
      e.stopPropagation();
      goFullscreen();
      startGame();
    };
    dom.startBtn.addEventListener('pointerdown', () => goFullscreen());
    dom.startBtn.addEventListener('touchstart', () => goFullscreen(), { passive: true });
    dom.startBtn.addEventListener('click', onStart);
  }

  if (dom.fullscreenBtn) {
    const onToggleFs = (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleFullscreen();
    };
    dom.fullscreenBtn.addEventListener('click', onToggleFs);
    dom.fullscreenBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    dom.fullscreenBtn.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  }

  const rotateModal = document.getElementById('rotate-device-modal');
  if (rotateModal) {
    rotateModal.addEventListener('click', () => { if (isMobileDevice()) goFullscreen(); });
    rotateModal.addEventListener('touchstart', () => { if (isMobileDevice()) goFullscreen(); }, { passive: true });
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
  Scores.onChange = () => {
    hiScore = Scores.best();
    renderOverlayScores();
    if (dom.fullScoresModal && dom.fullScoresModal.classList.contains('is-open')) {
      renderFullScores();
    }
  };
  Scores.onRank = (id, rank) => {
    if (id === world.submitId && rank > 0) world.addedRank = rank;
  };
  window.addEventListener('online', () => Scores.refresh());   // reenvía lo pendiente al volver la conexión
}

async function main() {
  Sfx.init();
  Music.init();
  setupOverlay();
  Settings.setup();
  renderOverlayScores();
  selectCharacter(character);
  layout();
  resetRun();
  requestAnimationFrame(frame);
  Scores.refresh();                              // el ranking baja mientras cargan los assets

  await loadAssets();
  Music.preload();                               // la música se descarga después de las imágenes
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
