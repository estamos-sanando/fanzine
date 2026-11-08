// =============================================================================
// Vercel Serverless Function & Node Dev Server: /api/scores
// Arquitectura Global Arcade Leaderboard v5 — Hardened Production Security
// - Cero secretos o URLs sensibles embebidas en código fuente
// - CORS restringido por lista blanca de dominios (ALLOWED_ORIGINS) + Security Headers
// - Anti-Cheat estricto: Tokens HMAC-SHA256 obligatorios vinculados a cliente,
//   validación de enteros puros, techo físico de puntos/segundo y anti-replay
// - Rate Limiting multicapa resistente a falsificación de X-Forwarded-For
// =============================================================================

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCHEMA_VERSION = 5;
const MAX_STORED_SCORES = 100;
const DEFAULT_LIMIT = 50;
const MAX_PLAUSIBLE_SCORE = 100000;
const MIN_RUN_DURATION_MS = 1200;             // Mínimo físico para sumar puntos y morir (~1.2s)
const MAX_SCORE_PER_SECOND = 380;             // Techo físico teórico con bonus + mates + velocidad máx.
const SCORE_BASE_TOLERANCE = 1200;            // Margen inicial por primer pickup/bonus temprano
const SESSION_MAX_AGE_MS = 2 * 60 * 60 * 1000;// Expiración máxima de token de partida: 2 horas
const MAX_BODY_BYTES = 4096;                  // Protección DoS contra payloads gigantes (4 KB máx.)
const CLOUD_CACHE_TTL_MS = 2000;              // Coalescing de lecturas remotas

const INITIALS_REGEX = /^[A-Z0-9]{3}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const IS_VERCEL = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
const IS_PROD = IS_VERCEL || process.env.NODE_ENV === 'production';
const LOCAL_FILE = IS_VERCEL
  ? path.join(os.tmpdir(), 'fanzine_scores_v5.json')
  : path.join(__dirname, '..', 'data', 'scores.json');

// =============================================================================
// Gestión Segura de Secretos (Cero claves hardcodeadas en repositorio)
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
    process.env.ADMIN_RESET_KEY;

  if (backendPrivate && backendPrivate.trim().length >= 16) {
    cachedHmacKey = crypto
      .createHmac('sha256', backendPrivate.trim())
      .update('fanzine-runner-session-hmac-v5')
      .digest();
    return cachedHmacKey;
  }

  // Fallback efímero fuera del árbol Git (desarrollo local / instancia temporal)
  const tmpKeyFile = path.join(os.tmpdir(), '.fanzine_hmac_v5.key');
  try {
    if (fs.existsSync(tmpKeyFile)) {
      const raw = fs.readFileSync(tmpKeyFile);
      if (raw && raw.length >= 32) {
        cachedHmacKey = raw;
        return cachedHmacKey;
      }
    }
    const generated = crypto.randomBytes(32);
    fs.writeFileSync(tmpKeyFile, generated, { mode: 0o600 });
    cachedHmacKey = generated;
    return cachedHmacKey;
  } catch (_) {
    cachedHmacKey = crypto.randomBytes(32);
    return cachedHmacKey;
  }
}

function safeCompareStrings(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a.length || !b.length) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// =============================================================================
// Estado en Memoria (Caché Coalescente, CRDT G-Set, Rate-Limit y Anti-Replay)
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
  // Rechazar cualquier etiqueta HTML/XSS, SQLi, símbolo o longitud distinta de 3
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
        // Evitar manipulación de timestamps para ganar desempates cronológicos
        const maxPast = now - 10 * 60 * 1000;
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

  // 2. Dominios propios automáticos del despliegue en Vercel / Host actual
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    allowed.add(normalizeOrigin(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`));
  }
  if (process.env.VERCEL_URL) {
    allowed.add(normalizeOrigin(`https://${process.env.VERCEL_URL}`));
  }
  const hostHeader = req.headers && (req.headers['x-forwarded-host'] || req.headers.host);
  if (typeof hostHeader === 'string' && hostHeader.trim()) {
    const cleanHost = hostHeader.split(',')[0].trim().toLowerCase();
    allowed.add(`https://${cleanHost}`);
    if (!IS_PROD) allowed.add(`http://${cleanHost}`);
  }

  return allowed;
}

function isOriginPermitted(originHeader, req) {
  if (!originHeader) return true; // Petición same-origin directa sin cabecera Origin
  const norm = normalizeOrigin(originHeader);
  if (!norm) return false;

  const allowed = buildAllowedOrigins(req);
  if (allowed.has(norm)) return true;

  // En entorno local de desarrollo permitir localhost / 127.0.0.1 en cualquier puerto
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
  // Priorizar cabeceras inyectadas por la plataforma Edge (no falsificables por el cliente)
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

function computeClientUaFingerprint(req) {
  const ua = String((req.headers && req.headers['user-agent']) || 'unknown-ua').slice(0, 256);
  return crypto.createHmac('sha256', getHmacSecretKey()).update(`ua:${ua}`).digest('base64url').slice(0, 16);
}

function createSessionToken(req) {
  const payloadObj = {
    sid: generateUUID(),
    iat: Date.now(),
    uaf: computeClientUaFingerprint(req)
  };
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', getHmacSecretKey()).update(payloadB64).digest('base64url');
  return {
    sessionToken: `${payloadB64}.${sig}`,
    issuedAt: payloadObj.iat
  };
}

function verifySessionToken(token, req) {
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
    if (payload.uaf && payload.uaf !== computeClientUaFingerprint(req)) {
      return { valid: false, reason: 'client_mismatch' };
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

  if (ipBuckets.size > 1500) {
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
  // Exponer únicamente URL pública y clave anónima (restringida por RLS a SELECT)
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
    return { scores, updatedAt: computeUpdatedAt(scores, memState.updatedAt) };
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
    return { scores: state.scores, updatedAt: memState.updatedAt };
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
    memState.updatedAt = Date.now();
    return { scores: [], updatedAt: memState.updatedAt };
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
    zset: 'fanzine:lb:v4:zset',
    hash: 'fanzine:lb:v4:items',
    meta: 'fanzine:lb:v4:updated_at'
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
    const [zRes, metaRes] = await this.pipeline([
      ['ZREVRANGE', this.KEYS.zset, '0', String(limit - 1)],
      ['GET', this.KEYS.meta]
    ]);
    const ids = Array.isArray(zRes && zRes.result) ? zRes.result : [];
    const updatedAt = Number(metaRes && metaRes.result) || 1;
    if (!ids.length) return { scores: [], updatedAt };

    const [hRes] = await this.pipeline([['HMGET', this.KEYS.hash, ...ids]]);
    const rawItems = Array.isArray(hRes && hRes.result) ? hRes.result : [];
    const parsed = rawItems.map((s) => {
      try { return typeof s === 'string' ? JSON.parse(s) : s; } catch (_) { return null; }
    }).filter(Boolean);
    const scores = sortAndTrimEntries(parsed, limit);
    return { scores, updatedAt: Math.max(updatedAt, computeUpdatedAt(scores, 1)) };
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
    await this.pipeline([
      ['DEL', this.KEYS.zset, this.KEYS.hash],
      ['SET', this.KEYS.meta, String(now)]
    ]);
    return { scores: [], updatedAt: now };
  }
};

// =============================================================================
// ADAPTER 3: Cloud JSON Privado (por Variable de Entorno) + Almacenamiento Local
// =============================================================================
function getCloudStorageUrl() {
  return (process.env.CLOUD_STORAGE_URL || '').trim();
}

function getCloudHeaders(extra = {}) {
  const h = { ...extra };
  if (process.env.CLOUD_STORAGE_SECURITY_KEY) {
    h['Security-key'] = process.env.CLOUD_STORAGE_SECURITY_KEY.trim();
  }
  return h;
}

function readLocalFileEnvelope() {
  try {
    if (!fs.existsSync(LOCAL_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8'));
    if (Array.isArray(raw)) {
      const scores = sortAndTrimEntries(raw);
      return { schemaVersion: SCHEMA_VERSION, epoch: 1, updatedAt: computeUpdatedAt(scores, 1), scores };
    }
    if (raw && typeof raw === 'object' && Array.isArray(raw.scores)) {
      const scores = sortAndTrimEntries(raw.scores);
      return {
        schemaVersion: SCHEMA_VERSION,
        epoch: Number(raw.epoch) || 1,
        updatedAt: Number(raw.updatedAt) || computeUpdatedAt(scores, 1),
        scores
      };
    }
  } catch (_) {}
  return null;
}

function writeLocalFileEnvelope(envelope) {
  try {
    const dir = path.dirname(LOCAL_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LOCAL_FILE, JSON.stringify(envelope, null, 2), 'utf8');
  } catch (_) {}
}

async function fetchCloudEnvelope(timeoutMs = 5500) {
  const cloudUrl = getCloudStorageUrl();
  if (!cloudUrl) {
    const local = readLocalFileEnvelope();
    return local || { schemaVersion: SCHEMA_VERSION, epoch: memState.epoch, updatedAt: memState.updatedAt || 1, scores: memState.scores };
  }

  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const sep = cloudUrl.includes('?') ? '&' : '?';
      const res = await fetch(`${cloudUrl}${sep}_t=${Date.now()}`, {
        method: 'GET',
        headers: getCloudHeaders({ Accept: 'application/json', 'Cache-Control': 'no-cache' }),
        cache: 'no-store',
        signal: ctl.signal
      });
      clearTimeout(timer);

      if (res.status === 404) {
        return { emptyBin: true, schemaVersion: SCHEMA_VERSION, epoch: 1, updatedAt: 1, scores: [] };
      }
      if (!res.ok) throw new Error(`Cloud GET status ${res.status}`);

      const data = await res.json();
      const rawScores = Array.isArray(data && data.scores)
        ? data.scores
        : (data && data.data && Array.isArray(data.data.scores) ? data.data.scores : []);
      const scores = sortAndTrimEntries(rawScores);
      const epoch = Number(data && data.epoch) || 1;
      const updatedAt = Number(data && data.updatedAt) || computeUpdatedAt(scores, 1);
      return { schemaVersion: SCHEMA_VERSION, epoch, updatedAt, scores };
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 220));
    }
  }
  throw lastErr || new Error('Cloud storage unreachable');
}

async function putCloudEnvelope(envelope, timeoutMs = 6000) {
  const cloudUrl = getCloudStorageUrl();
  if (!cloudUrl) return true;

  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(cloudUrl, {
        method: 'PUT',
        headers: getCloudHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(envelope),
        cache: 'no-store',
        signal: ctl.signal
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`Cloud PUT status ${res.status}`);
      return true;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw lastErr || new Error('Cloud PUT failed');
}

function mergeWithMemState(remoteEnv) {
  if (remoteEnv.epoch > memState.epoch) {
    memState.epoch = remoteEnv.epoch;
    memState.confirmedById.clear();
  }
  for (const s of remoteEnv.scores) {
    memState.confirmedById.set(s.id, s);
  }
  const merged = sortAndTrimEntries(Array.from(memState.confirmedById.values()), MAX_STORED_SCORES);
  memState.scores = merged;
  memState.updatedAt = Math.max(memState.updatedAt, remoteEnv.updatedAt, computeUpdatedAt(merged, 1));
  memState.lastFetchedAt = Date.now();
  return { scores: merged, updatedAt: memState.updatedAt, epoch: memState.epoch };
}

const CloudGSetAdapter = {
  name: getCloudStorageUrl() ? 'cloud-gset' : (IS_VERCEL ? 'ephemeral-unconfigured' : 'local-file'),
  async list(limit = MAX_STORED_SCORES, forceFresh = false) {
    const now = Date.now();
    if (!forceFresh && memState.lastFetchedAt > 0 && (now - memState.lastFetchedAt) < CLOUD_CACHE_TTL_MS) {
      return { scores: memState.scores.slice(0, limit), updatedAt: memState.updatedAt };
    }
    if (!forceFresh && inflightRead) {
      const shared = await inflightRead;
      return { scores: shared.scores.slice(0, limit), updatedAt: shared.updatedAt };
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
    return { scores: result.scores.slice(0, limit), updatedAt: result.updatedAt };
  },

  insert(entry) {
    const op = writeChain.then(async () => {
      let base;
      try {
        base = await fetchCloudEnvelope();
      } catch (_) {
        if (getCloudStorageUrl() && IS_VERCEL) {
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
      for (const s of base.scores) {
        memState.confirmedById.set(s.id, s);
      }
      memState.confirmedById.set(entry.id, entry);

      const mergedScores = sortAndTrimEntries(Array.from(memState.confirmedById.values()), MAX_STORED_SCORES);
      const nextEnvelope = {
        schemaVersion: SCHEMA_VERSION,
        epoch: Math.max(memState.epoch, base.epoch || 1),
        updatedAt: Math.max(Date.now(), (base.updatedAt || 0) + 1),
        scores: mergedScores
      };

      if (getCloudStorageUrl()) {
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
      memState.scores = mergedScores;
      memState.updatedAt = nextEnvelope.updatedAt;
      memState.lastFetchedAt = Date.now();
      return { scores: mergedScores, updatedAt: nextEnvelope.updatedAt };
    });

    writeChain = op.catch(() => {});
    return op;
  },

  reset() {
    const op = writeChain.then(async () => {
      let currentEpoch = memState.epoch;
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

      if (getCloudStorageUrl()) {
        await putCloudEnvelope(freshEnvelope);
      }
      writeLocalFileEnvelope(freshEnvelope);
      memState.epoch = nextEpoch;
      memState.confirmedById.clear();
      memState.scores = [];
      memState.updatedAt = freshEnvelope.updatedAt;
      memState.lastFetchedAt = Date.now();
      return { scores: [], updatedAt: freshEnvelope.updatedAt };
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

  // Bloquear orígenes externos no autorizados
  if (origin && !originAllowed) {
    return res.status(403).json({ error: 'Origen no autorizado por política CORS.' });
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Protección DoS por tamaño de cuerpo excesivo
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

  // Exigir Content-Type: application/json cuando se envía cabecera en POST (mitigación CSRF)
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
    const rl = checkRateLimit(`sess:${clientIp}`, 20, 60_000);
    applyRateLimitHeaders(res, 20, rl);
    if (!rl.allowed) {
      return res.status(429).json({ error: 'Demasiadas sesiones iniciadas. Esperá unos segundos.' });
    }

    const session = createSessionToken(req);
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
        mode: adapter.name,
        updatedAt: resetState.updatedAt,
        scores: []
      });
    } catch (_) {
      return res.status(503).json({ error: 'No se pudo completar el reinicio en la base de datos.' });
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Lectura Pública del Ranking + Delta Sync (GET /api/scores)
  // ---------------------------------------------------------------------------
  if (req.method === 'GET') {
    const rl = checkRateLimit(`get:${clientIp}`, 90, 60_000);
    applyRateLimitHeaders(res, 90, rl);
    if (!rl.allowed) {
      return res.status(429).json({ error: 'Límite de consultas alcanzado. Reintentando en breve.' });
    }

    const parsedLimit = Number(query.limit);
    const limit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(MAX_STORED_SCORES, Math.floor(parsedLimit)))
      : DEFAULT_LIMIT;
    const since = Number(query.since) || 0;

    try {
      const state = await adapter.list(limit);
      if (since > 0 && state.updatedAt > 0 && since === state.updatedAt) {
        return res.status(200).json({
          unchanged: true,
          updatedAt: state.updatedAt,
          mode: adapter.name
        });
      }

      return res.status(200).json({
        unchanged: false,
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

    // Rate limit estricto: máx. 5 envíos/min por IP y cooldown de 2.5s contra ráfagas automatizadas
    const rl = checkRateLimit(`post:${clientIp}`, 5, 60_000, 2500);
    applyRateLimitHeaders(res, 5, rl);
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
      const check = verifySessionToken(body.sessionToken, req);
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

      // Techo físico dinámico según duración real firmada en el servidor
      const effectiveDurationMs = Number.isFinite(body.durationMs) && body.durationMs > 0
        ? Math.min(ageMs, body.durationMs + 4000)
        : ageMs;
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
