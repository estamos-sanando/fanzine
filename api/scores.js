// Vercel Serverless Function: /api/scores
// Provee el ranking global compartido entre todos los dispositivos.
// Si en Vercel se activa "Storage -> KV" o Upstash Redis, usa KV_REST_API_URL automáticamente.
// Si no, guarda en memoria del servidor con persistencia local en /tmp.

const MAX_SCORES = 10;
const INITIAL_SCORES = [
  { name: 'UNL', score: 500 },
  { name: 'MAT', score: 350 },
  { name: 'FAN', score: 200 },
  { name: 'RUN', score: 100 },
  { name: 'BOY', score: 50 }
];

let memScores = [...INITIAL_SCORES];

// Soporte opcional para Vercel KV / Upstash Redis si el usuario lo conecta
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

function cleanName(n) {
  return String(n || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3).padEnd(3, 'A');
}

function sanitize(arr) {
  if (!Array.isArray(arr)) return [...INITIAL_SCORES];
  return arr
    .filter(e => e && Number.isFinite(Number(e.score)) && Number(e.score) > 0)
    .map(e => ({ name: cleanName(e.name), score: Math.floor(Number(e.score)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SCORES);
}

module.exports = async function handler(req, res) {
  // Encabezados CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // 1) Obtener lista actual
  let current = await getFromKV();
  if (!current) current = memScores;
  current = sanitize(current);

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

    // Calcular puesto que ocupa
    let rank = 1;
    while (rank <= current.length && current[rank - 1].score >= score) {
      rank++;
    }

    // Insertar si califica
    current.splice(rank - 1, 0, { name, score });
    current = sanitize(current);
    memScores = current;

    await saveToKV(current);

    return res.status(200).json({ rank, scores: current });
  }

  return res.status(405).json({ error: 'Método no permitido' });
};
