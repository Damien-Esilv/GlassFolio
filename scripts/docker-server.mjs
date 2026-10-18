#!/usr/bin/env node
/**
 * GlassFolio — Production Docker Runtime Server (TGLA-061).
 *
 * Lightweight, zero-dependency Node.js HTTP server:
 *  1. Serves production static SPA assets from `dist/` with security headers and SPA fallback.
 *  2. Exposes atomic disk persistence at `/api/local-vault` writing to `/data/vault-store.json`.
 *  3. Exposes health check endpoint at `/health` and `/api/health`.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '80', 10);
const HOST = process.env.HOST || '0.0.0.0';
const STATIC_DIR = process.env.STATIC_DIR || path.resolve(__dirname, '../dist');
const DATA_DIR = process.env.DATA_DIR || '/data';
const VAULT_STORE_FILE = path.join(DATA_DIR, 'vault-store.json');
const VAULT_STORE_TMP = path.join(DATA_DIR, 'vault-store.json.tmp');

// Ensure data directory exists
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (err) {
  console.warn(`[docker-server] Warning: Could not create DATA_DIR ${DATA_DIR}:`, err.message);
}

// In-memory cache synced with disk
let vaultStoreCache = { records: {} };

function loadVaultStoreFromDisk() {
  try {
    if (fs.existsSync(VAULT_STORE_FILE)) {
      const raw = fs.readFileSync(VAULT_STORE_FILE, 'utf8');
      vaultStoreCache = JSON.parse(raw);
      if (!vaultStoreCache.records) {
        vaultStoreCache.records = {};
      }
      console.log(`[docker-server] Loaded vault store with ${Object.keys(vaultStoreCache.records).length} keys from disk.`);
    }
  } catch (err) {
    console.error('[docker-server] Error reading vault store from disk, starting empty:', err.message);
    vaultStoreCache = { records: {} };
  }
}

function persistVaultStoreToDisk() {
  try {
    const serialized = JSON.stringify(vaultStoreCache, null, 2);
    fs.writeFileSync(VAULT_STORE_TMP, serialized, 'utf8');
    fs.renameSync(VAULT_STORE_TMP, VAULT_STORE_FILE);
  } catch (err) {
    console.error('[docker-server] Error persisting vault store to disk:', err.message);
  }
}

loadVaultStoreFromDisk();

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

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function readBodyJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 20 * 1024 * 1024) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // 1. Health checks
  if (pathname === '/health' || pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...SECURITY_HEADERS });
    res.end(JSON.stringify({ status: 'healthy', uptime: process.uptime() }));
    return;
  }

  // 2. Local Vault Disk Persistence API
  if (pathname === '/api/local-vault') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', ...SECURITY_HEADERS });
      res.end(JSON.stringify(vaultStoreCache));
      return;
    }

    if (req.method === 'PUT') {
      try {
        const body = await readBodyJson(req);
        if (body.key && typeof body.value === 'string') {
          vaultStoreCache.records[body.key] = body.value;
          persistVaultStoreToDisk();
          res.writeHead(200, { 'Content-Type': 'application/json', ...SECURITY_HEADERS });
          res.end(JSON.stringify({ success: true, key: body.key }));
          return;
        }
        res.writeHead(400, { 'Content-Type': 'application/json', ...SECURITY_HEADERS });
        res.end(JSON.stringify({ error: 'Missing key or value' }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json', ...SECURITY_HEADERS });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (req.method === 'DELETE') {
      try {
        const body = await readBodyJson(req);
        if (body.all) {
          vaultStoreCache.records = {};
          persistVaultStoreToDisk();
          res.writeHead(200, { 'Content-Type': 'application/json', ...SECURITY_HEADERS });
          res.end(JSON.stringify({ success: true, cleared: true }));
          return;
        }
        if (body.key) {
          delete vaultStoreCache.records[body.key];
          persistVaultStoreToDisk();
          res.writeHead(200, { 'Content-Type': 'application/json', ...SECURITY_HEADERS });
          res.end(JSON.stringify({ success: true, deleted: body.key }));
          return;
        }
        res.writeHead(400, { 'Content-Type': 'application/json', ...SECURITY_HEADERS });
        res.end(JSON.stringify({ error: 'Missing key or all flag' }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json', ...SECURITY_HEADERS });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    res.writeHead(405, { 'Content-Type': 'application/json', ...SECURITY_HEADERS });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  // 3. Static SPA File Serving
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

  // If file doesn't exist, fallback to SPA index.html
  if (!fs.existsSync(filePath)) {
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
      ...(ext === '.html' ? { 'Cache-Control': 'no-cache, must-revalidate' } : { 'Cache-Control': 'public, max-age=31536000, immutable' }),
    });
    res.end(content);
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
    res.end('Internal Server Error');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[docker-server] GlassFolio running on http://${HOST}:${PORT}`);
  console.log(`[docker-server] Serving assets from: ${STATIC_DIR}`);
  console.log(`[docker-server] Persisting vault data to: ${VAULT_STORE_FILE}`);
});
