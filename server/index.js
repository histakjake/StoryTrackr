/**
 * server/index.js — StoryTrackr dev server
 *
 * Serves:
 *   /api/*       → api-router.js
 *   /            → public/index.html (SPA shell)
 *   /assets/*    → app/assets/  (JS, CSS, images)
 *   /demo        → public/index.html (demo entry; JS handles auto-login)
 */

import http from 'node:http';
import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { routeRequest } from './api-router.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.join(__dirname, '..');
const PUBLIC    = path.join(ROOT, 'public');
const ASSETS    = path.join(ROOT, 'app', 'assets');

// ─── Load .env if present (dev convenience — no external deps required) ──

try {
  const envPath = new URL('../.env', import.meta.url);
  const lines = fs.readFileSync(fileURLToPath(envPath), 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !(key in process.env)) process.env[key] = val;
  }
} catch (_) { /* .env absent — rely on real env vars */ }

// ─── Environment ────────────────────────────────────────────────────────

const env = {
  SUPABASE_URL:         process.env.SUPABASE_URL         ?? '',
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ?? '',
  NODE_ENV:             process.env.NODE_ENV             ?? 'development',
};

// ─── MIME types ─────────────────────────────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

function serveFile(res, filePath) {
  try {
    const content = fs.readFileSync(filePath);
    const ext     = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}

// ─── Server ──────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const pathname = url.pathname;

  // API routes
  if (pathname.startsWith('/api/')) {
    try {
      await routeRequest(req, res, env);
    } catch (err) {
      console.error('[server] Unhandled error for', pathname, err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    }
    return;
  }

  // Static assets
  if (pathname.startsWith('/assets/')) {
    const file = path.join(ASSETS, pathname.replace('/assets/', ''));
    return serveFile(res, file);
  }

  // SPA shell — any other path gets index.html
  const indexPath = path.join(PUBLIC, 'index.html');
  return serveFile(res, indexPath);
});

const PORT = parseInt(process.env.PORT ?? '3000', 10);

server.listen(PORT, () => {
  console.log(`StoryTrackr dev server listening on http://localhost:${PORT}`);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    console.warn('⚠  SUPABASE_URL / SUPABASE_SERVICE_KEY not set — API calls will fail.');
    console.warn('   Copy .env.example to .env.local and fill in your credentials.');
  }
});
