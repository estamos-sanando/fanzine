// Vercel Serverless Function & Node dev-server: /api/scores
// Provee el ranking global TOP 10 compartido entre todos los dispositivos sin reiniciarse.
const fs = require('fs');
const path = require('path');

const MAX_SCORES = 500;
const PRIMARY_CLOUD_URL = 'https://extendsclass.com/api/json-storage/bin/efefedd';
const BACKUP_CLOUD_URL = 'https://api.restful-api.dev/objects/ff808181a09d98f701a18d9ecd606591';
const LOCAL_FILE = path.join(__dirname, '..', 'data', 'scores.json');
const TMP_FILE = '/tmp/fanzine_scores.json';

const INITIAL_SCORES = [
  { name: 'UNL', score: 1200 },
  { name: 'FAN', score: 950 },
  { name: 'MAT', score: 780 },
  { name: 'RUN', score: 620 },
  { name: 'BOY', score: 500 }
];

let memScores = null;

function cleanName(n) {
  return String(n || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3).padEnd(3, 'A');
}

function sanitize(arr) {
  if (!Array.isArray(arr) || !arr.length) return [...INITIAL_SCORES];
  const valid = [];
  for (let e of arr) {
    if (!e) continue;
    if (typeof e === 'string') {
      try {
        e = JSON.parse(e);
      } catch (_) {
        const m = e.match(/name[=:]\s*([A-Za-z]+).*?score[=:]\s*(\d+)/i) || e.match(/score[=:]\s*(\d+).*?name[=:]\s*([A-Za-z]+)/i);
        if (m) {
          e = { name: m[1] || m[2], score: Number(m[2] || m[1]) };
        }
      }
    }
    const score = Number(e && e.score);
    if (Number.isFinite(score) && score > 0) {
      valid.push({ name: cleanName(e.name), score: Math.floor(score) });
    }
  }
  valid.sort((a, b) => b.score - a.score);
  return valid.length ? valid.slice(0, MAX_SCORES) : [...INITIAL_SCORES];
}

// 1. Vercel KV / Upstash Redis (si el usuario lo configura en Vercel)
async function getFromKV() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url}/get/fanzine_global_scores`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.result) return null;
    return typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
  } catch (_) {
    return null;
  }
}

async function saveToKV(scores) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return false;
  try {
    await fetch(`${url}/set/fanzine_global_scores`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(scores)
    });
    return true;
  } catch (_) {
    return false;
  }
}

// 2. Cloud REST persistence (compartido globalmente y resistente a reinicios de lambdas)
async function getFromCloud() {
  // 1. Probar almacenamiento persistente principal
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 6000);
    const res = await fetch(PRIMARY_CLOUD_URL, { signal: ctl.signal, cache: 'no-store' });
    clearTimeout(t);
    if (res.ok) {
      const d = await res.json();
      if (d && Array.isArray(d.scores)) return d.scores;
      if (d && d.data && Array.isArray(d.data.scores)) return d.data.scores;
    }
  } catch (_) {}

  // 2. Respaldo secundario
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 6000);
    const res = await fetch(BACKUP_CLOUD_URL, { signal: ctl.signal, cache: 'no-store' });
    clearTimeout(t);
    if (res.ok) {
      const d = await res.json();
      if (d && d.data && Array.isArray(d.data.scores)) return d.data.scores;
      if (d && Array.isArray(d.scores)) return d.scores;
    }
  } catch (_) {}

  return null;
}

async function saveToCloud(scores) {
  const tasks = [];
  try {
    const ctl1 = new AbortController();
    const t1 = setTimeout(() => ctl1.abort(), 6000);
    tasks.push(
      fetch(PRIMARY_CLOUD_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scores }),
        signal: ctl1.signal,
        cache: 'no-store'
      }).finally(() => clearTimeout(t1))
    );
  } catch (_) {}

  try {
    const ctl2 = new AbortController();
    const t2 = setTimeout(() => ctl2.abort(), 6000);
    tasks.push(
      fetch(BACKUP_CLOUD_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'fanzine_scores', data: { scores } }),
        signal: ctl2.signal,
        cache: 'no-store'
      }).finally(() => clearTimeout(t2))
    );
  } catch (_) {}

  const results = await Promise.allSettled(tasks);
  return results.some(r => r.status === 'fulfilled' && r.value && r.value.ok);
}

// 3. Persistencia en disco local /tmp
function getFromFile() {
  try {
    if (fs.existsSync(TMP_FILE)) {
      return JSON.parse(fs.readFileSync(TMP_FILE, 'utf8'));
    }
    if (fs.existsSync(LOCAL_FILE)) {
      return JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8'));
    }
  } catch (_) {}
  return null;
}

function saveToFile(scores) {
  try {
    const json = JSON.stringify(scores, null, 2);
    try {
      const dir = path.dirname(LOCAL_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(LOCAL_FILE, json, 'utf8');
    } catch (_) {}
    try { fs.writeFileSync(TMP_FILE, json, 'utf8'); } catch (_) {}
  } catch (_) {}
}

async function loadScores() {
  let list = await getFromKV();
  if (!list) list = await getFromCloud();
  if (!list) list = getFromFile();
  if (!list && memScores) list = memScores;
  if (!list) list = INITIAL_SCORES;
  memScores = sanitize(list);
  return memScores;
}

module.exports = async function handler(req, res) {
  // CORS y desactivación de caché en el Edge / CDN / Navegador
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  let current = await loadScores();

  if (req.method === 'GET') {
    return res.status(200).json({ scores: current });
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (_) { body = {}; }
    }
    body = body || {};

    const name = cleanName(body.name);
    const score = Math.floor(Number(body.score));

    if (!Number.isFinite(score) || score <= 0) {
      return res.status(400).json({ error: 'Puntaje inválido' });
    }

    // Calcular puesto que ocuparía
    let rank = 1;
    while (rank <= current.length && current[rank - 1].score >= score) {
      rank++;
    }

    // Insertar si califica
    current.splice(rank - 1, 0, { name, score });
    current = sanitize(current);
    memScores = current;

    // Persistir en todos los niveles
    saveToFile(current);
    await Promise.allSettled([
      saveToCloud(current),
      saveToKV(current)
    ]);

    return res.status(200).json({ rank, scores: current });
  }

  return res.status(405).json({ error: 'Método no permitido' });
};
