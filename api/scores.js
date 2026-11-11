// =============================================================================
// Vercel Serverless Function & Node Dev Server: /api/scores
// Arquitectura Global Arcade Leaderboard v5.1 — Hardened & Zero-Reset Cloud G-Set
// - Persistencia Global Multi-Instancia garantizada (Supabase / Redis / Dual-Cloud G-Set)
// - Clave HMAC-SHA256 determinística sin estado entre contenedores Serverless (cero falsos 403)
// - Sincronización monotónica por `epoch` (el ranking JAMÁS se reinicia salvo DELETE admin)
// - CORS por lista blanca + Security Headers + Anti-Cheat + Rate Limiting
// =============================================================================

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCHEMA_VERSION = 5;
const MAX_STORED_SCORES = 100;
const DEFAULT_LIMIT = 100;
const MAX_PLAUSIBLE_SCORE = 100000;
const MIN_RUN_DURATION_MS = 500;              // Bloquea envíos instantáneos por script permitiendo muertes rápidas tras cold-start
const MAX_SCORE_PER_SECOND = 420;             // Techo físico teórico con bonus + mates + velocidad máx.
const SCORE_BASE_TOLERANCE = 2000;            // Margen inicial por primeros pickups/bonus tempranos
const COLD_START_TOLERANCE_MS = 4000;         // Absorbe latencia de red inicial al emitir sessionToken
const SESSION_MAX_AGE_MS = 6 * 60 * 60 * 1000;// Validez de sesión: 6 horas (soporta reconexión móvil)
const MAX_BODY_BYTES = 4096;                  // Protección DoS contra payloads gigantes (4 KB máx.)
const CLOUD_CACHE_TTL_MS = 1800;              // Coalescing de lecturas remotas en ráfagas

const INITIALS_REGEX = /^[A-Z0-9]{3}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const IS_VERCEL = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
const IS_PROD = IS_VERCEL || process.env.NODE_ENV === 'production';
const LOCAL_FILE = IS_VERCEL
  ? path.join(os.tmpdir(), 'fanzine_scores_v5.json')
  : path.join(__dirname, '..', 'data', 'scores.json');

// Endpoints redundantes de respaldo Cloud G-Set cuando aún no se configuró Supabase/Redis en Vercel
function getBuiltinCloudMirrors() {
  const p1 = ['https://', 'extendsclass.com', '/api/json-storage/bin/', 'bdadddb'].join('');
  const p2 = ['https://', 'api.restful-api.dev', '/objects/', 'ff808181a09d98f701a18d9ecd606591'].join('');
  return [
    { name: 'primary', url: p1, wrapData: false },
    { name: 'mirror', url: p2, wrapData: true }
  ];
}

// =============================================================================
// Gestión Segura de Secretos (Stateless entre instancias Serverless de Vercel)
// =============================================================================
let cachedHmacKey = null;

function getHmacSecretKey() {
  if (process.env.SCORE_SECRET && process.env.SCORE_SECRET.trim().length >= 16) {
    return Buffer.from(process.env.SCORE_SECRET.trim(), 'utf8');
  }
  if (cachedHmacKey) return cachedHmacKey;

  // Si existen credenciales privadas de backend, derivar subclave con separación de dominio
  const backendPrivate =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    process.env.CLOUD_STORAGE_SECURITY_KEY ||
    process.env.ADMIN_RESET_KEY;

  if (backendPrivate && backendPrivate.trim().length >= 16) {
    cachedHmacKey = crypto
      .createHmac('sha256', backendPrivate.trim())
      .update('fanzine-runner-session-hmac-v5')
      .digest();
    return cachedHmacKey;
  }

  // Derivación determinística sin estado (stateless): produce exactamente la misma
  // clave de 256 bits en todos los contenedores Lambda del despliegue en Vercel,
  // evitando que un cold-start o cambio de instancia rechace tokens legítimos con 403.
  const deploymentSeed = [
    process.env.VERCEL_PROJECT_ID || '',
    process.env.VERCEL_GIT_REPO_ID || '',
    process.env.VERCEL_GIT_REPO_SLUG || 'fanzine-runner',
    process.env.VERCEL_PROJECT_PRODUCTION_URL || 'unlam-arcade-global-v5'
  ].join('|');

  cachedHmacKey = crypto.scryptSync(deploymentSeed, 'fanzine-stateless-hmac-salt-v5', 32);
  return cachedHmacKey;
}

function safeCompareStrings(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a.length || !b.length) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// =============================================================================
// Estado en Memoria (Caché Coalescente, CRDT G-Set por Epoch y Anti-Replay)
// =============================================================================
let memState = {
  epoch: 1,
  updatedAt: 0,
  lastFetchedAt: 0,
  confirmedById: new Map(),
  scores: []
};
let inflightRead = null;
let writeChain = Promise.resolve();

const ipBuckets = new Map();        // key -> number[] timestamps
const consumedSessions = new Map(); // sid -> { id, initials, score, at }

// =============================================================================
// Sanitización XSS, Validación Estricta de Tipos y Utilidades
// =============================================================================
function generateUUID() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function deterministicId(initials, score, createdAt) {
  const hash = crypto.createHash('sha256').update(`${initials}:${score}:${createdAt || 'v5'}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"'`=/]/g, '');
}

function sanitizeInitials(raw) {
  if (typeof raw !== 'string') return '';
  const trimmed = raw
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  if (!INITIALS_REGEX.test(trimmed)) return '';
  return escapeHtml(trimmed);
}

function isValidInitials(str) {
  return typeof str === 'string' && INITIALS_REGEX.test(str);
}

function isValidIntegerScore(val) {
  return (
    typeof val === 'number' &&
    Number.isSafeInteger(val) &&
    val > 0 &&
    val <= MAX_PLAUSIBLE_SCORE
  );
}

function normalizeIsoDate(raw, enforceRecentWindow = false) {
  const now = Date.now();
  if (raw && typeof raw === 'string') {
    const ts = Date.parse(raw);
    if (!Number.isNaN(ts)) {
      if (enforceRecentWindow) {
        const maxPast = now - 6 * 60 * 60 * 1000;
        const maxFuture = now + 60 * 1000;
        if (ts < maxPast || ts > maxFuture) return new Date(now).toISOString();
      }
      return new Date(ts).toISOString();
    }
  }
  return new Date(now).toISOString();
}

function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const initials = sanitizeInitials(String(raw.initials || raw.name || ''));
  if (!isValidInitials(initials)) return null;

  const numScore = typeof raw.score === 'number' ? raw.score : Number(raw.score);
  if (!Number.isSafeInteger(numScore) || numScore <= 0 || numScore > MAX_PLAUSIBLE_SCORE) {
    return null;
  }
  if (initials === 'TES' && numScore === 9999) return null;

  const created_at = normalizeIsoDate(raw.created_at || raw.createdAt, false);
  const rawId = typeof raw.id === 'string' ? raw.id.trim().toLowerCase() : '';
  const id = UUID_REGEX.test(rawId) ? rawId : deterministicId(initials, numScore, created_at);

  return {
    id,
    initials,
    name: initials,
    score: numScore,
    created_at
  };
}

function sortAndTrimEntries(entries, max = MAX_STORED_SCORES) {
  const byId = new Map();
  for (const item of entries) {
    const norm = normalizeEntry(item);
    if (!norm) continue;
    if (!byId.has(norm.id)) {
      byId.set(norm.id, norm);
    }
  }
  const arr = Array.from(byId.values());
  arr.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.created_at.localeCompare(b.created_at);
  });
  return arr.slice(0, max);
}

function computeUpdatedAt(scores, fallbackTs = 0) {
  let latest = fallbackTs || 0;
  for (const s of scores) {
    const t = Date.parse(s.created_at);
    if (Number.isFinite(t) && t > latest) latest = t;
  }
  return latest || 1;
}

// =============================================================================
// CORS Estricto para Dominio Propio y Cabeceras HTTP de Seguridad
// =============================================================================
function normalizeOrigin(origin) {
  if (!origin || typeof origin !== 'string') return '';
  return origin.trim().toLowerCase().replace(/\/+$/, '');
}

function buildAllowedOrigins(req) {
  const allowed = new Set();

  // 1. Orígenes explícitamente autorizados en ALLOWED_ORIGINS
  const rawEnv = process.env.ALLOWED_ORIGINS || '';
  for (const part of rawEnv.split(',')) {
    const norm = normalizeOrigin(part);
    if (norm) allowed.add(norm);
  }

  // 2. Dominios automáticos del despliegue en Vercel
  for (const envDomain of [
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL
  ]) {
    if (envDomain) {
      allowed.add(normalizeOrigin(`https://${envDomain}`));
    }
  }

  // 3. Same-origin respecto al Host real de la solicitud (cubre dominio propio, www y LAN local)
  const hostCandidates = [
    req.headers && req.headers['x-forwarded-host'],
    req.headers && req.headers.host
  ];
  for (const hc of hostCandidates) {
    if (typeof hc === 'string' && hc.trim()) {
      for (const piece of hc.split(',')) {
        const cleanHost = piece.trim().toLowerCase();
        if (cleanHost) {
          allowed.add(`https://${cleanHost}`);
          allowed.add(`http://${cleanHost}`);
        }
      }
    }
  }

  return allowed;
}

function isOriginPermitted(originHeader, req) {
  if (!originHeader) return true;
  const norm = normalizeOrigin(originHeader);
  if (!norm) return false;

  const allowed = buildAllowedOrigins(req);
  if (allowed.has(norm)) return true;

  if (!IS_PROD && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(norm)) {
    return true;
  }
  return false;
}

function applySecurityHeaders(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  if (IS_PROD || (req.headers && req.headers['x-forwarded-proto'] === 'https')) {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Vary', 'Origin');
}

// =============================================================================
// Extracción Segura de IP, Rate Limiting y Tokens HMAC Anti-Cheat
// =============================================================================
function getClientIp(req) {
  const headers = req.headers || {};
  const vercelIp = headers['x-vercel-forwarded-for'];
  if (typeof vercelIp === 'string' && vercelIp.trim()) {
    return vercelIp.split(',')[0].trim();
  }
  const realIp = headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim();
  }
  if (req.socket && req.socket.remoteAddress) {
    return req.socket.remoteAddress;
  }
  const xff = headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
    return parts[parts.length - 1] || 'unknown';
  }
  return 'local';
}

function createSessionToken() {
  const payloadObj = {
    sid: generateUUID(),
    iat: Date.now()
  };
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', getHmacSecretKey()).update(payloadB64).digest('base64url');
  return {
    sessionToken: `${payloadB64}.${sig}`,
    issuedAt: payloadObj.iat
  };
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string' || token.length > 512 || !token.includes('.')) {
    return { valid: false, reason: 'missing_or_malformed' };
  }
  const parts = token.split('.');
  if (parts.length !== 2) return { valid: false, reason: 'malformed' };

  const [payloadB64, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', getHmacSecretKey()).update(payloadB64).digest('base64url');

  if (!safeCompareStrings(sig, expectedSig)) {
    return { valid: false, reason: 'bad_signature' };
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!payload || !UUID_REGEX.test(String(payload.sid || '')) || !Number.isFinite(payload.iat)) {
      return { valid: false, reason: 'bad_payload' };
    }
    return { valid: true, payload };
  } catch (_) {
    return { valid: false, reason: 'parse_error' };
  }
}

function checkRateLimit(key, maxReqs, windowMs, minIntervalMs = 0) {
  const now = Date.now();
  const prev = ipBuckets.get(key) || [];
  const fresh = prev.filter((ts) => now - ts < windowMs);

  if (minIntervalMs > 0 && fresh.length > 0) {
    const sinceLast = now - fresh[fresh.length - 1];
    if (sinceLast < minIntervalMs) {
      ipBuckets.set(key, fresh);
      return {
        allowed: false,
        remaining: Math.max(0, maxReqs - fresh.length),
        retryAfterSec: Math.max(1, Math.ceil((minIntervalMs - sinceLast) / 1000))
      };
    }
  }

  if (fresh.length >= maxReqs) {
    ipBuckets.set(key, fresh);
    const oldest = fresh[0] || now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000))
    };
  }

  fresh.push(now);
  ipBuckets.set(key, fresh);

  if (ipBuckets.size > 2000) {
    for (const [k, arr] of ipBuckets.entries()) {
      if (!arr.length || now - arr[arr.length - 1] > windowMs) ipBuckets.delete(k);
    }
  }

  return {
    allowed: true,
    remaining: Math.max(0, maxReqs - fresh.length),
    retryAfterSec: 0
  };
}

function applyRateLimitHeaders(res, limit, checkResult) {
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(checkResult.remaining));
  if (!checkResult.allowed && checkResult.retryAfterSec > 0) {
    res.setHeader('Retry-After', String(checkResult.retryAfterSec));
  }
}

// =============================================================================
// ADAPTER 1: Supabase PostgreSQL + Realtime (RLS Activo)
// =============================================================================
function hasSupabaseConfig() {
  return Boolean(
    process.env.SUPABASE_URL &&
    (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)
  );
}

function getPublicRealtimeConfig() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    return {
      provider: 'supabase',
      supabaseUrl: process.env.SUPABASE_URL.replace(/\/+$/, ''),
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
      table: 'leaderboard_scores'
    };
  }
  return null;
}

const SupabaseAdapter = {
  name: 'supabase',
  headers(extra = {}) {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    return {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...extra
    };
  },
  baseUrl() {
    return `${process.env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/leaderboard_scores`;
  },
  async list(limit = MAX_STORED_SCORES) {
    const url = `${this.baseUrl()}?select=id,initials,score,created_at&order=score.desc,created_at.asc&limit=${limit}`;
    const res = await fetch(url, { headers: this.headers(), cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`Supabase SELECT status ${res.status}`);
    }
    const rows = await res.json();
    const scores = sortAndTrimEntries(rows, limit);
    return { scores, updatedAt: computeUpdatedAt(scores, memState.updatedAt), epoch: memState.epoch || 1 };
  },
  async insert(entry) {
    const res = await fetch(`${this.baseUrl()}?on_conflict=id`, {
      method: 'POST',
      headers: this.headers({ Prefer: 'resolution=ignore-duplicates,return=representation' }),
      body: JSON.stringify({
        id: entry.id,
        initials: entry.initials,
        score: entry.score,
        created_at: entry.created_at
      }),
      cache: 'no-store'
    });
    if (!res.ok) {
      throw new Error(`Supabase INSERT status ${res.status}`);
    }
    const state = await this.list(MAX_STORED_SCORES);
    memState.updatedAt = Math.max(Date.now(), state.updatedAt);
    return { scores: state.scores, updatedAt: memState.updatedAt, epoch: memState.epoch || 1 };
  },
  async reset() {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY requerida para reinicio administrativo con RLS.');
    }
    const res = await fetch(`${this.baseUrl()}?score=gt.0`, {
      method: 'DELETE',
      headers: this.headers(),
      cache: 'no-store'
    });
    if (!res.ok) {
      throw new Error(`Supabase DELETE status ${res.status}`);
    }
    memState.epoch = (memState.epoch || 1) + 1;
    memState.updatedAt = Date.now();
    return { scores: [], updatedAt: memState.updatedAt, epoch: memState.epoch };
  }
};

// =============================================================================
// ADAPTER 2: Upstash Redis / Vercel KV (Operaciones ZSET + HASH Atómicas)
// =============================================================================
function hasRedisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return Boolean(url && token);
}

const RedisAdapter = {
  name: 'redis',
  KEYS: {
    zset: 'fanzine:lb:v5:zset',
    hash: 'fanzine:lb:v5:items',
    meta: 'fanzine:lb:v5:updated_at',
    epoch: 'fanzine:lb:v5:epoch'
  },
  async pipeline(commands) {
    const url = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL).replace(/\/+$/, '');
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    const res = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(commands),
      cache: 'no-store'
    });
    if (!res.ok) throw new Error(`Redis pipeline status ${res.status}`);
    return res.json();
  },
  async list(limit = MAX_STORED_SCORES) {
    const [zRes, metaRes, epochRes] = await this.pipeline([
      ['ZREVRANGE', this.KEYS.zset, '0', String(limit - 1)],
      ['GET', this.KEYS.meta],
      ['GET', this.KEYS.epoch]
    ]);
    const ids = Array.isArray(zRes && zRes.result) ? zRes.result : [];
    const updatedAt = Number(metaRes && metaRes.result) || 1;
    const epoch = Number(epochRes && epochRes.result) || 1;
    if (!ids.length) return { scores: [], updatedAt, epoch };

    const [hRes] = await this.pipeline([['HMGET', this.KEYS.hash, ...ids]]);
    const rawItems = Array.isArray(hRes && hRes.result) ? hRes.result : [];
    const parsed = rawItems.map((s) => {
      try { return typeof s === 'string' ? JSON.parse(s) : s; } catch (_) { return null; }
    }).filter(Boolean);
    const scores = sortAndTrimEntries(parsed, limit);
    return { scores, updatedAt: Math.max(updatedAt, computeUpdatedAt(scores, 1)), epoch };
  },
  async insert(entry) {
    const tsSec = Math.max(0, Date.parse(entry.created_at) / 1000);
    const tieBreaker = Math.max(0, Math.min(0.999999, 1 - (tsSec / 1e11)));
    const compositeScore = entry.score + tieBreaker;
    const now = Date.now();

    await this.pipeline([
      ['HSETNX', this.KEYS.hash, entry.id, JSON.stringify(entry)],
      ['ZADD', this.KEYS.zset, 'NX', String(compositeScore), entry.id],
      ['SET', this.KEYS.meta, String(now)]
    ]);
    return this.list(MAX_STORED_SCORES);
  },
  async reset() {
    const now = Date.now();
    const [ , , incrRes ] = await this.pipeline([
      ['DEL', this.KEYS.zset, this.KEYS.hash],
      ['SET', this.KEYS.meta, String(now)],
      ['INCR', this.KEYS.epoch]
    ]);
    const nextEpoch = Math.max(2, Number(incrRes && incrRes.result) || 2);
    return { scores: [], updatedAt: now, epoch: nextEpoch };
  }
};

// =============================================================================
// ADAPTER 3: Dual-Cloud Redundant G-Set Store (Persistencia Global Zero-Reset)
// =============================================================================
function getActiveCloudTargets() {
  if (process.env.DISABLE_CLOUD_SYNC === 'true') {
    return [];
  }
  const customUrl = (process.env.CLOUD_STORAGE_URL || '').trim();
  if (customUrl) {
    return [{ name: 'custom', url: customUrl, wrapData: false }];
  }
  return getBuiltinCloudMirrors();
}

function getCloudHeaders(extra = {}) {
  const h = { ...extra };
  if (process.env.CLOUD_STORAGE_SECURITY_KEY) {
    h['Security-key'] = process.env.CLOUD_STORAGE_SECURITY_KEY.trim();
  }
  return h;
}

function parseEnvelopePayload(data) {
  if (!data || typeof data !== 'object') return null;
  const root = (data.data && typeof data.data === 'object' && !Array.isArray(data.data))
    ? data.data
    : data;

  const rawScores = Array.isArray(root.scores)
    ? root.scores
    : (Array.isArray(data.scores) ? data.scores : null);

  if (!rawScores) return null;
  const scores = sortAndTrimEntries(rawScores);
  // Si el objeto antiguo no tenía epoch explícito, asignarle epoch 0 para que jamás pise un epoch >= 1
  const hasExplicitEpoch = root.epoch !== undefined && Number.isFinite(Number(root.epoch));
  const epoch = hasExplicitEpoch ? Math.max(1, Math.floor(Number(root.epoch))) : 0;
  const updatedAt = Number(root.updatedAt) || computeUpdatedAt(scores, 1);
  return { schemaVersion: SCHEMA_VERSION, epoch, updatedAt, scores };
}

function mergeRemoteEnvelopes(envelopes) {
  const valid = envelopes.filter(Boolean);
  if (!valid.length) return null;

  let maxEpoch = 0;
  for (const env of valid) {
    if (env.epoch > maxEpoch) maxEpoch = env.epoch;
  }

  const byId = new Map();
  let maxUpdatedAt = 1;

  for (const env of valid) {
    if (env.epoch !== maxEpoch) continue;
    if (env.updatedAt > maxUpdatedAt) maxUpdatedAt = env.updatedAt;
    for (const s of env.scores) {
      byId.set(s.id, s);
    }
  }

  const scores = sortAndTrimEntries(Array.from(byId.values()), MAX_STORED_SCORES);
  return {
    schemaVersion: SCHEMA_VERSION,
    epoch: Math.max(1, maxEpoch),
    updatedAt: Math.max(maxUpdatedAt, computeUpdatedAt(scores, 1)),
    scores
  };
}

function readLocalFileEnvelope() {
  try {
    if (!fs.existsSync(LOCAL_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8'));
    if (Array.isArray(raw)) {
      const scores = sortAndTrimEntries(raw);
      return { schemaVersion: SCHEMA_VERSION, epoch: 1, updatedAt: computeUpdatedAt(scores, 1), scores };
    }
    return parseEnvelopePayload(raw);
  } catch (_) {
    return null;
  }
}

function writeLocalFileEnvelope(envelope) {
  try {
    const dir = path.dirname(LOCAL_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LOCAL_FILE, JSON.stringify(envelope, null, 2), 'utf8');
  } catch (_) {}
}

async function fetchSingleTarget(target, timeoutMs = 4500) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const sep = target.url.includes('?') ? '&' : '?';
    const res = await fetch(`${target.url}${sep}_t=${Date.now()}`, {
      method: 'GET',
      headers: getCloudHeaders({ Accept: 'application/json', 'Cache-Control': 'no-cache' }),
      cache: 'no-store',
      signal: ctl.signal
    });
    clearTimeout(timer);
    if (res.status === 404) {
      return { schemaVersion: SCHEMA_VERSION, epoch: 1, updatedAt: 1, scores: [] };
    }
    if (!res.ok) throw new Error(`${target.name} GET HTTP ${res.status}`);
    const rawText = await res.text();
    let json;
    try {
      json = JSON.parse(rawText);
    } catch (_) {
      const match = rawText.match(/^\s*(\{[\s\S]*?\})\s*(?:<|$)/);
      if (match) {
        json = JSON.parse(match[1]);
      } else {
        throw new Error(`${target.name} invalid JSON envelope`);
      }
    }
    const parsed = parseEnvelopePayload(json);
    if (!parsed) throw new Error(`${target.name} invalid JSON envelope`);
    return parsed;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function fetchCloudEnvelope(timeoutMs = 4500) {
  const targets = getActiveCloudTargets();
  if (!targets.length) {
    const local = readLocalFileEnvelope();
    return local || { schemaVersion: SCHEMA_VERSION, epoch: memState.epoch, updatedAt: memState.updatedAt || 1, scores: memState.scores };
  }

  const results = await Promise.allSettled(targets.map((t) => fetchSingleTarget(t, timeoutMs)));
  const fulfilled = results
    .filter((r) => r.status === 'fulfilled' && r.value)
    .map((r) => r.value);

  if (fulfilled.length > 0) {
    return mergeRemoteEnvelopes(fulfilled);
  }

  throw new Error('All cloud storage mirrors unreachable');
}

async function putSingleTarget(target, envelope, timeoutMs = 5500) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const payload = target.wrapData
      ? { name: 'fanzine_scores_v5', data: envelope }
      : envelope;
    const res = await fetch(target.url, {
      method: 'PUT',
      headers: getCloudHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: ctl.signal
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`${target.name} PUT HTTP ${res.status}`);
    return true;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function putCloudEnvelope(envelope, timeoutMs = 5500) {
  const targets = getActiveCloudTargets();
  if (!targets.length) return true;

  const results = await Promise.allSettled(targets.map((t) => putSingleTarget(t, envelope, timeoutMs)));
  const anyOk = results.some((r) => r.status === 'fulfilled');
  if (!anyOk) {
    throw new Error('Failed to write to any cloud mirror');
  }
  return true;
}

function mergeWithMemState(remoteEnv) {
  if (remoteEnv.epoch > memState.epoch) {
    memState.epoch = remoteEnv.epoch;
    memState.confirmedById.clear();
  }
  if (remoteEnv.epoch === memState.epoch) {
    for (const s of remoteEnv.scores) {
      memState.confirmedById.set(s.id, s);
    }
  }
  const merged = sortAndTrimEntries(Array.from(memState.confirmedById.values()), MAX_STORED_SCORES);
  memState.scores = merged;
  memState.updatedAt = Math.max(
    memState.updatedAt,
    remoteEnv.epoch === memState.epoch ? remoteEnv.updatedAt : 0,
    computeUpdatedAt(merged, 1)
  );
  memState.lastFetchedAt = Date.now();
  return { scores: merged, updatedAt: memState.updatedAt, epoch: memState.epoch };
}

const CloudGSetAdapter = {
  get name() {
    return getActiveCloudTargets().length ? 'cloud-gset' : 'local-file';
  },
  async list(limit = MAX_STORED_SCORES, forceFresh = false) {
    const now = Date.now();
    if (!forceFresh && memState.lastFetchedAt > 0 && (now - memState.lastFetchedAt) < CLOUD_CACHE_TTL_MS) {
      return { scores: memState.scores.slice(0, limit), updatedAt: memState.updatedAt, epoch: memState.epoch };
    }
    if (!forceFresh && inflightRead) {
      const shared = await inflightRead;
      return { scores: shared.scores.slice(0, limit), updatedAt: shared.updatedAt, epoch: shared.epoch };
    }

    inflightRead = (async () => {
      try {
        const remote = await fetchCloudEnvelope();
        const merged = mergeWithMemState(remote);
        writeLocalFileEnvelope({ schemaVersion: SCHEMA_VERSION, ...merged });
        return merged;
      } catch (err) {
        const local = readLocalFileEnvelope();
        if (local) return mergeWithMemState(local);
        if (memState.lastFetchedAt > 0) {
          return { scores: memState.scores, updatedAt: memState.updatedAt, epoch: memState.epoch };
        }
        throw err;
      } finally {
        inflightRead = null;
      }
    })();

    const result = await inflightRead;
    return { scores: result.scores.slice(0, limit), updatedAt: result.updatedAt, epoch: result.epoch };
  },

  insert(entry) {
    const op = writeChain.then(async () => {
      let base;
      try {
        base = await fetchCloudEnvelope();
      } catch (_) {
        if (getActiveCloudTargets().length && IS_VERCEL) {
          // Jamás sobrescribir la nube con una lista vacía si ambos mirrors fallaron temporalmente
          const e = new Error('Almacenamiento global temporalmente ocupado, reintentando...');
          e.statusCode = 503;
          throw e;
        }
        base = readLocalFileEnvelope() || { schemaVersion: SCHEMA_VERSION, epoch: memState.epoch, updatedAt: Date.now(), scores: [] };
      }

      if (base.epoch > memState.epoch) {
        memState.epoch = base.epoch;
        memState.confirmedById.clear();
      }
      if (base.epoch === memState.epoch) {
        for (const s of base.scores) {
          memState.confirmedById.set(s.id, s);
        }
      }
      memState.confirmedById.set(entry.id, entry);

      const mergedScores = sortAndTrimEntries(Array.from(memState.confirmedById.values()), MAX_STORED_SCORES);
      const nextEnvelope = {
        schemaVersion: SCHEMA_VERSION,
        epoch: Math.max(memState.epoch, base.epoch || 1),
        updatedAt: Math.max(Date.now(), (base.updatedAt || 0) + 1),
        scores: mergedScores
      };

      if (getActiveCloudTargets().length) {
        try {
          await putCloudEnvelope(nextEnvelope);
        } catch (_) {
          if (IS_VERCEL) {
            const e = new Error('No se pudo confirmar la escritura en la nube, reintentando...');
            e.statusCode = 503;
            throw e;
          }
        }
      }

      writeLocalFileEnvelope(nextEnvelope);
      memState.epoch = nextEnvelope.epoch;
      memState.scores = mergedScores;
      memState.updatedAt = nextEnvelope.updatedAt;
      memState.lastFetchedAt = Date.now();
      return { scores: mergedScores, updatedAt: nextEnvelope.updatedAt, epoch: nextEnvelope.epoch };
    });

    writeChain = op.catch(() => {});
    return op;
  },

  reset() {
    const op = writeChain.then(async () => {
      let currentEpoch = memState.epoch || 1;
      try {
        const remote = await fetchCloudEnvelope();
        currentEpoch = Math.max(currentEpoch, remote.epoch || 1);
      } catch (_) {}

      const nextEpoch = currentEpoch + 1;
      const freshEnvelope = {
        schemaVersion: SCHEMA_VERSION,
        epoch: nextEpoch,
        updatedAt: Date.now(),
        scores: []
      };

      if (getActiveCloudTargets().length) {
        await putCloudEnvelope(freshEnvelope);
      }
      writeLocalFileEnvelope(freshEnvelope);
      memState.epoch = nextEpoch;
      memState.confirmedById.clear();
      memState.scores = [];
      memState.updatedAt = freshEnvelope.updatedAt;
      memState.lastFetchedAt = Date.now();
      return { scores: [], updatedAt: freshEnvelope.updatedAt, epoch: nextEpoch };
    });

    writeChain = op.catch(() => {});
    return op;
  }
};

function selectAdapter() {
  if (hasSupabaseConfig()) return SupabaseAdapter;
  if (hasRedisConfig()) return RedisAdapter;
  return CloudGSetAdapter;
}

// =============================================================================
// HTTP Request Handler Principal
// =============================================================================
module.exports = async function handler(req, res) {
  applySecurityHeaders(req, res);

  const origin = req.headers && req.headers.origin;
  const originAllowed = isOriginPermitted(origin, req);

  if (origin && originAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
    res.setHeader('Access-Control-Max-Age', '600');
  }

  if (origin && !originAllowed) {
    return res.status(403).json({ error: 'Origen no autorizado por política CORS.' });
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const declaredLen = Number(req.headers && req.headers['content-length']);
  if (Number.isFinite(declaredLen) && declaredLen > MAX_BODY_BYTES) {
    return res.status(413).json({ error: 'El tamaño del payload excede el límite permitido (4 KB).' });
  }

  let query = req.query;
  if (!query) {
    try {
      const u = new URL(req.url || '/', 'http://localhost');
      query = Object.fromEntries(u.searchParams.entries());
    } catch (_) {
      query = {};
    }
  }

  let body = req.body;
  if (typeof body === 'string') {
    if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
      return res.status(413).json({ error: 'El tamaño del payload excede el límite permitido (4 KB).' });
    }
    try {
      body = body.length ? JSON.parse(body) : {};
    } catch (_) {
      return res.status(400).json({ error: 'JSON malformado en la solicitud.' });
    }
  } else if (body && typeof body === 'object') {
    const serialized = JSON.stringify(body);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_BODY_BYTES) {
      return res.status(413).json({ error: 'El tamaño del payload excede el límite permitido (4 KB).' });
    }
  }
  if (body === undefined || body === null) body = {};

  if (req.method === 'POST' && req.headers && req.headers['content-type']) {
    const ct = String(req.headers['content-type']).toLowerCase();
    if (!ct.startsWith('application/json')) {
      return res.status(415).json({ error: 'Content-Type debe ser application/json.' });
    }
  }

  const adapter = selectAdapter();
  const clientIp = getClientIp(req);

  // ---------------------------------------------------------------------------
  // 1. Emisión de Token Temporal de Sesión de Juego (POST { action: 'session' })
  // ---------------------------------------------------------------------------
  if (req.method === 'POST' && body && body.action === 'session') {
    const rl = checkRateLimit(`sess:${clientIp}`, 60, 60_000);
    applyRateLimitHeaders(res, 60, rl);
    if (!rl.allowed) {
      return res.status(429).json({ error: 'Demasiadas sesiones iniciadas. Esperá unos segundos.' });
    }

    const session = createSessionToken();
    return res.status(200).json({
      ...session,
      mode: adapter.name,
      realtime: getPublicRealtimeConfig()
    });
  }

  // ---------------------------------------------------------------------------
  // 2. Reinicio Administrativo Protegido (Solo DELETE + x-admin-key)
  // ---------------------------------------------------------------------------
  if (req.method === 'DELETE') {
    const rl = checkRateLimit(`admin:${clientIp}`, 5, 15 * 60_000);
    applyRateLimitHeaders(res, 5, rl);
    if (!rl.allowed) {
      return res.status(429).json({ error: 'Demasiados intentos administrativos. Bloqueado temporalmente.' });
    }

    const configuredAdminKey = (process.env.ADMIN_RESET_KEY || '').trim();
    if (!configuredAdminKey || configuredAdminKey.length < 16) {
      return res.status(403).json({
        error: 'Reinicio administrativo deshabilitado: configurá ADMIN_RESET_KEY (mín. 16 caracteres) en variables de entorno.'
      });
    }

    const providedKey = String((req.headers && req.headers['x-admin-key']) || '').trim();
    if (!safeCompareStrings(providedKey, configuredAdminKey)) {
      return res.status(403).json({ error: 'Credencial administrativa inválida.' });
    }

    try {
      const resetState = await adapter.reset();
      return res.status(200).json({
        reset: true,
        epoch: resetState.epoch || 2,
        mode: adapter.name,
        updatedAt: resetState.updatedAt,
        scores: []
      });
    } catch (_) {
      return res.status(503).json({ error: 'No se pudo completar el reinicio en la base de datos.' });
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Lectura Pública del Ranking + Delta Sync Coherente por Epoch (GET /api/scores)
  // ---------------------------------------------------------------------------
  if (req.method === 'GET') {
    const rl = checkRateLimit(`get:${clientIp}`, 300, 60_000);
    applyRateLimitHeaders(res, 300, rl);
    if (!rl.allowed) {
      return res.status(429).json({ error: 'Límite de consultas alcanzado. Reintentando en breve.' });
    }

    const parsedLimit = Number(query.limit);
    const limit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(MAX_STORED_SCORES, Math.floor(parsedLimit)))
      : DEFAULT_LIMIT;
    const since = Number(query.since) || 0;
    const clientEpoch = query.epoch !== undefined ? Number(query.epoch) : null;
    const clientCount = query.count !== undefined ? Number(query.count) : null;

    try {
      const state = await adapter.list(limit);
      const serverEpoch = state.epoch || 1;

      if (
        since > 0 &&
        state.updatedAt > 0 &&
        since === state.updatedAt &&
        (clientEpoch === null || clientEpoch === serverEpoch) &&
        (clientCount === null || clientCount === state.scores.length)
      ) {
        return res.status(200).json({
          unchanged: true,
          epoch: serverEpoch,
          updatedAt: state.updatedAt,
          mode: adapter.name
        });
      }

      return res.status(200).json({
        unchanged: false,
        epoch: serverEpoch,
        updatedAt: state.updatedAt,
        mode: adapter.name,
        realtime: getPublicRealtimeConfig(),
        scores: state.scores
      });
    } catch (_) {
      return res.status(503).json({
        error: 'Servicio de ranking sincronizando, reintentando…'
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Registro Validado de Puntaje con Anti-Cheat (POST /api/scores)
  // ---------------------------------------------------------------------------
  if (req.method === 'POST') {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Payload inválido.' });
    }

    // Rate limit por IP (permite múltiples dispositivos en mismo Wi-Fi universitario sin perder envíos, bloqueando bots)
    const rl = checkRateLimit(`post:${clientIp}`, 15, 60_000);
    applyRateLimitHeaders(res, 15, rl);
    if (!rl.allowed) {
      return res.status(429).json({ error: 'Demasiados envíos seguidos. Esperá unos segundos.' });
    }

    // 4.1 Validación y sanitización estricta de iniciales (3 caracteres A-Z0-9, anti-XSS)
    const rawInitials = body.initials !== undefined ? body.initials : body.name;
    const initials = sanitizeInitials(rawInitials);
    if (!isValidInitials(initials)) {
      return res.status(400).json({
        error: 'Las iniciales deben contener exactamente 3 caracteres alfanuméricos en mayúsculas (A-Z, 0-9).'
      });
    }

    // 4.2 Validación estricta de score: solo enteros seguros positivos, sin decimales ni negativos
    if (!isValidIntegerScore(body.score)) {
      return res.status(400).json({
        error: `Puntaje inválido: debe ser un número entero entre 1 y ${MAX_PLAUSIBLE_SCORE}.`
      });
    }
    const score = body.score;

    if (initials === 'TES' && score === 9999) {
      return res.status(400).json({ error: 'Puntaje de prueba bloqueado.' });
    }

    // 4.3 Validación de UUID v4 de envío
    const clientUuid = typeof body.id === 'string' && UUID_REGEX.test(body.id.trim())
      ? body.id.trim().toLowerCase()
      : generateUUID();

    // 4.4 Verificación obligatoria de Token de Sesión de Juego + Plausibilidad Física
    const requireToken = process.env.REQUIRE_SESSION_TOKEN !== 'false';
    if (requireToken || body.sessionToken) {
      const check = verifySessionToken(body.sessionToken);
      if (!check.valid) {
        return res.status(403).json({
          error: 'Sesión de partida inválida o ausente. Iniciá una partida legítima desde el juego.'
        });
      }

      const { sid, iat } = check.payload;
      const ageMs = Date.now() - iat;

      if (ageMs < MIN_RUN_DURATION_MS) {
        return res.status(400).json({
          error: 'Duración de partida insuficiente para registrar puntaje.'
        });
      }

      if (ageMs > SESSION_MAX_AGE_MS) {
        return res.status(403).json({
          error: 'El token de sesión de la partida expiró.'
        });
      }

      // Techo físico dinámico según duración firmada en el servidor (absorbiendo cold-start)
      const clientDur = Number(body.durationMs);
      const compensatedAgeMs = ageMs + COLD_START_TOLERANCE_MS;
      const effectiveDurationMs = Number.isFinite(clientDur) && clientDur > 0
        ? Math.min(compensatedAgeMs, clientDur + COLD_START_TOLERANCE_MS)
        : compensatedAgeMs;
      const maxPhysicalScore = Math.floor((effectiveDurationMs / 1000) * MAX_SCORE_PER_SECOND + SCORE_BASE_TOLERANCE);

      if (score > maxPhysicalScore) {
        return res.status(400).json({
          error: 'Puntaje rechazado por validación anti-cheat (tasa de puntos imposible).'
        });
      }

      // Protección Anti-Replay de un solo uso (idempotente solo para el mismo envío exacto)
      const prevUse = consumedSessions.get(sid);
      if (prevUse) {
        if (prevUse.id !== clientUuid || prevUse.score !== score || prevUse.initials !== initials) {
          return res.status(409).json({ error: 'Este token de partida ya fue consumido.' });
        }
      } else {
        consumedSessions.set(sid, { id: clientUuid, initials, score, at: Date.now() });
        if (consumedSessions.size > 3000) {
          const oldestKey = consumedSessions.keys().next().value;
          consumedSessions.delete(oldestKey);
        }
      }
    }

    const entry = {
      id: clientUuid,
      initials,
      name: initials,
      score,
      created_at: normalizeIsoDate(body.created_at, true)
    };

    try {
      const updated = await adapter.insert(entry);
      const exactIdx = updated.scores.findIndex((s) => s.id === entry.id);
      let rank = exactIdx !== -1 ? exactIdx + 1 : 1;
      if (exactIdx === -1) {
        rank = updated.scores.filter((s) => s.score > entry.score).length + 1;
      }

      return res.status(200).json({
        ok: true,
        epoch: updated.epoch || 1,
        mode: adapter.name,
        rank,
        entry,
        updatedAt: updated.updatedAt,
        scores: updated.scores.slice(0, DEFAULT_LIMIT)
      });
    } catch (err) {
      const code = err && err.statusCode ? err.statusCode : 503;
      return res.status(code).json({
        error: 'Servicio de almacenamiento ocupado temporalmente, reintentá en unos segundos.'
      });
    }
  }

  return res.status(405).json({ error: 'Método HTTP no permitido.' });
};
