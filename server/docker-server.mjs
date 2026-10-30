#!/usr/bin/env node
/**
 * GlassFolio — Production Docker Runtime Server (TGLA-061).
 *
 * Lightweight, zero-dependency Node.js HTTP server:
 *  1. Serves production static SPA assets from `dist/` with security headers and SPA fallback.
 *  2. Exposes the local vault API (`/api/local-vault`, server/localVault.mjs): the `/data` volume is the
 *     source of truth for the encrypted vault records, so browser cache/browser changes never lose data.
 *  3. Exposes health check endpoint at `/health` and `/api/health`.
 *  4. Proxies allow-listed Yahoo Finance endpoints at `/yf/*` (no CORS from the browser otherwise).
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocalVaultHandler, createLocalVaultStore, isLocalVaultPath } from './localVault.mjs';
import { createAccessControl } from './accessControl.mjs';
import { buildSecurityHeaders } from './securityHeaders.mjs';
import { handleYahooProxy, isYahooProxyPath } from './yahooProxy.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';
const STATIC_DIR = process.env.STATIC_DIR || path.resolve(__dirname, '../dist');
const DATA_DIR = process.env.DATA_DIR || '/data';
const ALLOWED_HOSTS = (process.env.ALLOWED_HOSTS || '')
  .split(',')
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

// Optional login (HTTP Basic) for network exposure; /health stays open for the container healthcheck.
const access = createAccessControl({ token: process.env.ACCESS_TOKEN || '' });
if (access.enabled) console.log('[docker-server] Access control enabled (HTTP Basic, user "glassfolio").');

const vaultStore = createLocalVaultStore({ dataDir: DATA_DIR });
console.log(`[docker-server] Vault store: ${vaultStore.stats().records} record(s), writable=${vaultStore.stats().writable}.`);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

const EXTRA_CONNECT_SRC = (process.env.CSP_CONNECT_SRC || '')
  .split(/[\s,]+/)
  .filter((origin) => /^(https?|wss?):\/\/[^\s;]+$/.test(origin));

// CSP + hardening headers, shared with vercel.json (server/securityHeaders.mjs)
const SECURITY_HEADERS = buildSecurityHeaders('local', { extraConnectSrc: EXTRA_CONNECT_SRC });

// GLASSFOLIO_DEMO=1: the app opens on the demo account instead of offering it on every visit
const DEMO = process.env.GLASSFOLIO_DEMO === '1';
const handleLocalVault = createLocalVaultHandler(vaultStore, { securityHeaders: SECURITY_HEADERS, allowedHosts: ALLOWED_HOSTS, demo: DEMO });

/** Hashed build output (Vite `assets/`): its name changes with its content, so it can be cached for good. */
const isFingerprintedAsset = (pathname) => pathname.startsWith('/assets/');

const server = http.createServer(async (req, res) => {
  try {
    await handleRequest(req, res);
  } catch (err) {
    // One bad request must never take the server (and every user's session) down
    console.error('[docker-server] Request failed', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
      res.end('Internal Server Error');
    } else {
      res.destroy();
    }
  }
});

async function handleRequest(req, res) {
  let parsedUrl;
  try {
    // A malformed request target (e.g. "//") makes the URL constructor throw
    parsedUrl = new URL(req.url, 'http://localhost');
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
    res.end('Bad Request');
    return;
  }
  const pathname = parsedUrl.pathname;

  // 1. Health checks
  if (pathname === '/health' || pathname === '/api/health') {
    const persistence = vaultStore.stats();
    res.writeHead(persistence.writable ? 200 : 503, { 'Content-Type': 'application/json', ...SECURITY_HEADERS });
    res.end(JSON.stringify({ status: persistence.writable ? 'healthy' : 'degraded', uptime: process.uptime(), persistence }));
    return;
  }

  if (!(await access.authorize(req, res, SECURITY_HEADERS))) return;

  // 2. Market data proxy (same-origin /yf/*)
  if (isYahooProxyPath(pathname)) {
    await handleYahooProxy(req, res, parsedUrl, { securityHeaders: SECURITY_HEADERS });
    return;
  }

  // 3. Local vault API (server volume = source of truth)
  if (isLocalVaultPath(pathname)) {
    await handleLocalVault(req, res, parsedUrl);
    return;
  }

  // 4. Static SPA File Serving
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
    res.end('Method Not Allowed');
    return;
  }

  // Normalize path & prevent directory traversal
  let safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(STATIC_DIR, safePath);

  // If pointing to directory or root, serve index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  // If file doesn't exist, fallback to SPA index.html; a missing file (e.g. a chunk of an older
  // build) gets a 404, not an HTML page served under a script's name.
  if (!fs.existsSync(filePath)) {
    if (path.extname(pathname)) {
      res.writeHead(404, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
      res.end('Not Found');
      return;
    }
    filePath = path.join(STATIC_DIR, 'index.html');
  }

  try {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const content = fs.readFileSync(filePath);

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': content.length,
      ...SECURITY_HEADERS,
      'Cache-Control': ext === '.html'
        ? 'no-cache, must-revalidate'
        : isFingerprintedAsset(pathname) ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
    });
    res.end(content);
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
    res.end('Internal Server Error');
  }
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`[docker-server] ${signal} received, shutting down.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}

server.listen(PORT, HOST, () => {
  console.log(`[docker-server] GlassFolio running on http://${HOST}:${PORT}`);
  console.log(`[docker-server] Serving assets from: ${STATIC_DIR}`);
  console.log(`[docker-server] Persisting vault data to: ${DATA_DIR}`);
});
