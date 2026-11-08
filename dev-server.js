'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const scoresHandler = require('./api/scores.js');

const PORT = Number(process.env.PORT) || 8080;
const ROOT_DIR = path.resolve(__dirname);
const MAX_BODY_BYTES = 4096;

const BLOCKED_PREFIXES = ['/api/', '/supabase/', '/data/', '/.git/', '/node_modules/'];
const BLOCKED_FILES = new Set(['dev-server.js', 'vercel.json', '.gitignore', '.env.example']);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg'
};

const STATIC_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: data:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ');

function setStaticSecurityHeaders(res) {
  res.setHeader('Content-Security-Policy', STATIC_CSP);
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
}

function handleRequest(req, res) {
  let parsedUrl;
  try {
    parsedUrl = new URL(req.url || '/', `http://localhost:${PORT}`);
  } catch (_) {
    res.statusCode = 400;
    res.end('Bad Request');
    return;
  }

  const pathname = parsedUrl.pathname;

  if (pathname === '/api/scores') {
    req.query = Object.fromEntries(parsedUrl.searchParams.entries());
    const chunks = [];
    let totalBytes = 0;
    let aborted = false;

    req.on('data', (chunk) => {
      if (aborted) return;
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        aborted = true;
        res.statusCode = 413;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Payload demasiado grande (máx. 4 KB).' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', async () => {
      if (aborted) return;
      req.body = Buffer.concat(chunks).toString('utf8');
      res.status = (code) => { res.statusCode = code; return res; };
      res.json = (data) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(data));
        return res;
      };
      try {
        await scoresHandler(req, res);
      } catch (err) {
        console.error('[API Error]', err);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Error interno del servidor.' }));
      }
    });
    return;
  }

  // Bloquear métodos distintos de GET / HEAD para archivos estáticos
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.end('Method Not Allowed');
    return;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch (_) {
    res.statusCode = 400;
    res.end('Bad Request');
    return;
  }

  const lowerPath = decodedPath.toLowerCase();
  const baseName = path.posix.basename(lowerPath);

  // Bloquear acceso a dotfiles (.env, .git) y directorios internos del backend
  if (
    baseName.startsWith('.') ||
    BLOCKED_FILES.has(baseName) ||
    BLOCKED_PREFIXES.some((p) => lowerPath.startsWith(p))
  ) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  const relTarget = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
  let filePath = path.resolve(ROOT_DIR, relTarget);

  // Protección estricta contra Path Traversal
  if (filePath !== ROOT_DIR && !filePath.startsWith(ROOT_DIR + path.sep)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(filePath)) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }
  if (fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
    if (!fs.existsSync(filePath)) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';
  setStaticSecurityHeaders(res);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'no-cache'
  });

  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(handleRequest);

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

module.exports = { server, handleRequest };
