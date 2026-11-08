// =============================================================================
// Vercel Serverless Function & Node Dev Server: /api/scores
// Arquitectura Global Arcade Leaderboard v4 (Tiempo Real + Multi-Adapter + Anti-Cheat)
// Soporta:
//   1. Supabase PostgreSQL + Realtime (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY / ANON_KEY)
//   2. Upstash Redis / Vercel KV Atómico (UPSTASH_REDIS_REST_URL / KV_REST_API_URL)
//   3. Almacenamiento Cloud G-Set Redundante v4 (Zero-Config inmediato en Vercel)
// =============================================================================

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 4;
const MAX_STORED_SCORES = 100;
const DEFAULT_LIMIT = 50;
const MAX_PLAUSIBLE_SCORE = 250000;
const MIN_SESSION_MS_HIGH_SCORE = 1500;
const SESSION_MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 horas
const CLOUD_CACHE_TTL_MS = 2000;              // Coalescing de lecturas (evita rate-limits)

const INITIALS_REGEX = /^[A-Z0-9]{3}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DEFAULT_CLOUD_URL = process.env.CLOUD_STORAGE_URL || 'https://extendsclass.com/api/json-storage/bin/bdadddb';
const LOCAL_FILE = path.join(__dirname, '..', 'data', 'scores.json');
const IS_VERCEL = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);

// Secreto HMAC para tokens de sesión de partida
const SCORE_SECRET = process.env.SCORE_SECRET || 'fanzine-unlam-arcade-hmac-v4-2026';

// =============================================================================
// Estado en memoria por instancia (caché coalescente, CRDT G-Set y anti-replay)
// =============================================================================
let memState = {
  epoch: 1,
  updatedAt: 0,
  lastFetchedAt: 0,
  confirmedById: new Map(), // id -> ScoreEntry (unión monotónica dentro del mismo epoch)
  scores: []
};
let inflightRead = null;
let writeChain = Promise.resolve();

const ipBuckets = new Map();       // ip -> number[] timestamps
const consumedSessions = new Map(); // sid -> entryId (idempotencia por UUID)

// =============================================================================
// Utilidades de Validación, Sanitización y Criptografía
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
  const hash = crypto.createHash('sha256').update(`${initials}:${score}:${createdAt || 'v4'}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function sanitizeInitials(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') return '';
  const trimmed = String(raw)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  // Rechazar cualquier carácter especial, etiqueta HTML/SQL o longitud distinta de 3
  if (!INITIALS_REGEX.test(trimmed)) return '';
  return trimmed;
}

function isValidInitials(str) {
  return typeof str === 'string' && INITIALS_REGEX.test(str);
}

function normalizeIsoDate(raw) {
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const initials = sanitizeInitials(raw.initials || raw.name);
  if (!isValidInitials(initials)) return null;

  const score = Math.floor(Number(raw.score));
  if (!Number.isFinite(score) || score <= 0 || score > MAX_PLAUSIBLE_SCORE) return null;

  // Bloquear artefacto histórico de test
  if (initials === 'TES' && score === 9999) return null;

  const created_at = normalizeIsoDate(raw.created_at || raw.createdAt);
  const rawId = typeof raw.id === 'string' ? raw.id.trim().toLowerCase() : '';
  const id = UUID_REGEX.test(rawId) ? rawId : deterministicId(initials, score, created_at);

  return {
    id,
    initials,
    name: initials, // alias retrocompatible con renderizadores canvas
    score,
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
// Tokens HMAC de Sesión de Partida y Rate Limiting
// =============================================================================
function createSessionToken() {
  const payloadObj = { sid: generateUUID(), iat: Date.now() };
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SCORE_SECRET).update(payloadB64).digest('base64url');
  return {
    sessionToken: `${payloadB64}.${sig}`,
    issuedAt: payloadObj.iat
  };
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return { valid: false, reason: 'missing' };
  }
  const parts = token.split('.');
  if (parts.length !== 2) return { valid: false, reason: 'malformed' };

  const [payloadB64, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SCORE_SECRET).update(payloadB64).digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, reason: 'bad_signature' };
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!payload || !payload.sid || !Number.isFinite(payload.iat)) {
      return { valid: false, reason: 'bad_payload' };
    }
    return { valid: true, payload };
  } catch (_) {
    return { valid: false, reason: 'parse_error' };
  }
}

function getClientIp(req) {
  const xff = req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip']);
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'local';
}

function checkRateLimit(key, maxReqs, windowMs) {
  const now = Date.now();
  const prev = ipBuckets.get(key) || [];
  const fresh = prev.filter((ts) => now - ts < windowMs);
  if (fresh.length >= maxReqs) {
    ipBuckets.set(key, fresh);
    return false;
  }
  fresh.push(now);
  ipBuckets.set(key, fresh);

  // Limpieza periódica de memoria
  if (ipBuckets.size > 1000) {
    for (const [k, arr] of ipBuckets.entries()) {
      if (!arr.length || now - arr[arr.length - 1] > windowMs) ipBuckets.delete(k);
    }
  }
  return true;
}

// =============================================================================
// ADAPTER 1: Supabase PostgreSQL + Realtime
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
      const txt = await res.text().catch(() => '');
      throw new Error(`Supabase SELECT HTTP ${res.status}: ${txt.slice(0, 140)}`);
    }
    const rows = await res.json();
    const scores = sortAndTrimEntries(rows, limit);
    return { scores, updatedAt: computeUpdatedAt(scores, memState.updatedAt) };
  },
  async insert(entry) {
    const res = await fetch(`${this.baseUrl()}?on_conflict=id`, {
      method: 'POST',
      headers: this.headers({ Prefer: 'resolution=merge-duplicates,return=representation' }),
      body: JSON.stringify({
        id: entry.id,
        initials: entry.initials,
        score: entry.score,
        created_at: entry.created_at
      }),
      cache: 'no-store'
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Supabase INSERT HTTP ${res.status}: ${txt.slice(0, 140)}`);
    }
    const state = await this.list(MAX_STORED_SCORES);
    memState.updatedAt = Math.max(Date.now(), state.updatedAt);
    return { scores: state.scores, updatedAt: memState.updatedAt };
  },
  async reset() {
    const res = await fetch(`${this.baseUrl()}?score=gt.0`, {
      method: 'DELETE',
      headers: this.headers(),
      cache: 'no-store'
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Supabase DELETE HTTP ${res.status}: ${txt.slice(0, 140)}`);
    }
    memState.updatedAt = Date.now();
    return { scores: [], updatedAt: memState.updatedAt };
  }
};

// =============================================================================
// ADAPTER 2: Upstash Redis / Vercel KV (Operaciones ZSET + HASH 100% Atómicas)
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
    if (!res.ok) throw new Error(`Redis pipeline HTTP ${res.status}`);
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
    // Desempate cronológico en ZSET: menor timestamp => mayor fracción decimal (0..0.99)
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
// ADAPTER 3: Cloud G-Set Store v4 + Espejo Local (Zero-Config Producción)
// =============================================================================
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
  if (IS_VERCEL) return; // El filesystem del código en Vercel es de solo lectura
  try {
    const dir = path.dirname(LOCAL_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LOCAL_FILE, JSON.stringify(envelope, null, 2), 'utf8');
  } catch (_) {}
}

async function fetchCloudEnvelope(timeoutMs = 5500) {
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const sep = DEFAULT_CLOUD_URL.includes('?') ? '&' : '?';
      const res = await fetch(`${DEFAULT_CLOUD_URL}${sep}_t=${Date.now()}`, {
        method: 'GET',
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
        cache: 'no-store',
        signal: ctl.signal
      });
      clearTimeout(timer);

      if (res.status === 404) {
        return { emptyBin: true, schemaVersion: SCHEMA_VERSION, epoch: 1, updatedAt: 1, scores: [] };
      }
      if (!res.ok) {
        throw new Error(`Cloud GET HTTP ${res.status}`);
      }
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
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(DEFAULT_CLOUD_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envelope),
        cache: 'no-store',
        signal: ctl.signal
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`Cloud PUT HTTP ${res.status}`);
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
    // Un administrador reinició el ranking global: limpiar G-Set de esta instancia
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
  name: 'cloud-gset',
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
        // En desarrollo local sin internet, usar archivo local data/scores.json
        if (!IS_VERCEL) {
          const local = readLocalFileEnvelope();
          if (local) return mergeWithMemState(local);
        }
        // Si ya tenemos caché caliente en memoria, servirlo en lecturas sin borrar nada
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
    // Serializar escrituras concurrentes en la misma instancia
    const op = writeChain.then(async () => {
      let base;
      try {
        base = await fetchCloudEnvelope();
      } catch (err) {
        if (!IS_VERCEL) {
          base = readLocalFileEnvelope() || { schemaVersion: SCHEMA_VERSION, epoch: memState.epoch, updatedAt: Date.now(), scores: [] };
        } else {
          // REGLA DE ORO: JAMÁS sobrescribir la nube si la lectura previa falló.
          const e = new Error('Almacenamiento global temporalmente ocupado, reintentando...');
          e.statusCode = 503;
          throw e;
        }
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

      try {
        await putCloudEnvelope(nextEnvelope);
      } catch (err) {
        if (IS_VERCEL) {
          const e = new Error('No se pudo confirmar la escritura en la nube, reintentando...');
          e.statusCode = 503;
          throw e;
        }
      }

      writeLocalFileEnvelope(nextEnvelope);
      memState.scores = mergedScores;
      memState.updatedAt = nextEnvelope.updatedAt;
      memState.lastFetchedAt = Date.now();
      return { scores: mergedScores, updatedAt: nextEnvelope.updatedAt };
    });

    // Evitar que un rechazo rompa la cola de promesas futuras
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

      try {
        await putCloudEnvelope(freshEnvelope);
      } catch (err) {
        if (IS_VERCEL) throw err;
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
// HTTP Request Handler (Vercel Serverless & Local Dev Server)
// =============================================================================
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Parseo seguro de query y body
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
    try { body = body.length ? JSON.parse(body) : {}; } catch (_) { body = null; }
  }
  if (body === undefined) body = {};

  const adapter = selectAdapter();
  const clientIp = getClientIp(req);

  // ---------------------------------------------------------------------------
  // 1. Emisión de Token de Sesión de Partida (Anti-Cheat)
  // ---------------------------------------------------------------------------
  if (
    (req.method === 'GET' && query.action === 'session') ||
    (req.method === 'POST' && body && body.action === 'session')
  ) {
    if (!checkRateLimit(`sess:${clientIp}`, 40, 60_000)) {
      return res.status(429).json({ error: 'Demasiadas sesiones solicitadas. Esperá unos segundos.' });
    }
    const session = createSessionToken();
    return res.status(200).json({
      ...session,
      mode: adapter.name,
      realtime: getPublicRealtimeConfig()
    });
  }

  // ---------------------------------------------------------------------------
  // 2. Reinicio Administrativo Protegido (DELETE o action=reset)
  // ---------------------------------------------------------------------------
  const wantsReset =
    req.method === 'DELETE' ||
    query.reset === 'true' ||
    (body && (body.action === 'reset' || body.reset === true));

  if (wantsReset) {
    const configuredAdminKey = process.env.ADMIN_RESET_KEY;
    const providedKey =
      (req.headers && req.headers['x-admin-key']) ||
      query.admin_key ||
      (body && body.admin_key);

    if (configuredAdminKey && providedKey !== configuredAdminKey) {
      return res.status(403).json({ error: 'Clave de administrador inválida para reiniciar el ranking.' });
    }
    // Sin ADMIN_RESET_KEY configurada, exigir DELETE explícito o confirmación
    if (!configuredAdminKey && req.method === 'GET' && query.confirm !== 'yes') {
      return res.status(403).json({
        error: 'Para reiniciar vía navegador usá ?reset=true&confirm=yes o configurá ADMIN_RESET_KEY.'
      });
    }

    try {
      const resetState = await adapter.reset();
      return res.status(200).json({
        reset: true,
        mode: adapter.name,
        updatedAt: resetState.updatedAt,
        scores: []
      });
    } catch (err) {
      return res.status(503).json({ error: 'No se pudo completar el reinicio global.', detail: err.message });
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Lectura Global & Delta Sync en Tiempo Real (GET /api/scores)
  // ---------------------------------------------------------------------------
  if (req.method === 'GET') {
    const limit = Math.max(1, Math.min(MAX_STORED_SCORES, Number(query.limit) || DEFAULT_LIMIT));
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
    } catch (err) {
      return res.status(503).json({
        error: 'Servicio de ranking sincronizando, reintentando…',
        mode: adapter.name
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Registro de Nuevo Puntaje (POST /api/scores)
  // ---------------------------------------------------------------------------
  if (req.method === 'POST') {
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'JSON inválido en el cuerpo de la solicitud.' });
    }

    if (!checkRateLimit(`post:${clientIp}`, 10, 60_000)) {
      return res.status(429).json({ error: 'Demasiados envíos seguidos. Esperá un momento.' });
    }

    // Validación estricta de iniciales (3 caracteres alfanuméricos A-Z, 0-9)
    const rawInitials = body.initials !== undefined ? body.initials : body.name;
    const initials = sanitizeInitials(rawInitials);
    if (!isValidInitials(initials)) {
      return res.status(400).json({
        error: 'Las iniciales deben tener exactamente 3 caracteres alfanuméricos en mayúsculas (A-Z, 0-9).'
      });
    }

    // Validación estricta de puntaje
    const rawScore = Number(body.score);
    const score = Math.floor(rawScore);
    if (!Number.isFinite(rawScore) || score <= 0 || score > MAX_PLAUSIBLE_SCORE) {
      return res.status(400).json({
        error: `Puntaje fuera de rango permitido (1 - ${MAX_PLAUSIBLE_SCORE}).`
      });
    }

    if (initials === 'TES' && score === 9999) {
      return res.status(400).json({ error: 'Puntaje de prueba bloqueado.' });
    }

    // ID único UUID v4 (acepta UUID de cliente para idempotencia ante reintentos de red)
    const clientUuid = typeof body.id === 'string' && UUID_REGEX.test(body.id.trim())
      ? body.id.trim().toLowerCase()
      : generateUUID();

    // Validación de Token de Sesión HMAC (si fue emitido) o plausibilidad temporal
    if (body.sessionToken) {
      const check = verifySessionToken(body.sessionToken);
      if (!check.valid) {
        return res.status(403).json({ error: 'Token de sesión de partida inválido.' });
      }
      const { sid, iat } = check.payload;
      const ageMs = Date.now() - iat;

      if (!body.offlineRetry && ageMs > SESSION_MAX_AGE_MS) {
        return res.status(403).json({ error: 'La sesión de partida expiró.' });
      }
      if (score > 3000 && ageMs >= 0 && ageMs < MIN_SESSION_MS_HIGH_SCORE) {
        return res.status(400).json({ error: 'Duración de partida inválida para el puntaje enviado.' });
      }

      const prevEntryId = consumedSessions.get(sid);
      if (prevEntryId && prevEntryId !== clientUuid) {
        return res.status(409).json({ error: 'Este token de partida ya fue utilizado.' });
      }
      consumedSessions.set(sid, clientUuid);
      if (consumedSessions.size > 2000) {
        const firstKey = consumedSessions.keys().next().value;
        consumedSessions.delete(firstKey);
      }
    } else if (process.env.REQUIRE_SESSION_TOKEN === 'true') {
      return res.status(403).json({ error: 'Se requiere token de sesión activo.' });
    } else if (Number.isFinite(Number(body.durationMs)) && Number(body.durationMs) < 800 && score > 3000) {
      return res.status(400).json({ error: 'Duración de partida inverosímil.' });
    }

    const entry = {
      id: clientUuid,
      initials,
      name: initials,
      score,
      created_at: normalizeIsoDate(body.created_at)
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
      const code = err.statusCode || 503;
      return res.status(code).json({
        error: err.message || 'Error temporal guardando en la base de datos global.'
      });
    }
  }

  return res.status(405).json({ error: 'Método HTTP no permitido.' });
};
