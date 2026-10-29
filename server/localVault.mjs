/**
 * Local vault store + HTTP handler (Epic E33 — TGLA-138).
 *
 * In local mode the server volume is the single source of truth for the encrypted vault
 * records, so clearing the browser cache or switching browser never loses data. This module is
 * shared by the Docker server and the Vite dev/preview plugin and has no dependency.
 *
 * API (same origin only):
 *   GET  /api/local-vault        -> { schema, revision, updatedAt, records }
 *   POST /api/local-vault/batch  -> body { set?: {key: value}, remove?: string[], clear?: boolean }
 *                                   applied in the order clear, remove, set with ONE disk write.
 */

import fs from 'node:fs';
import path from 'node:path';

export const LOCAL_VAULT_PATH = '/api/local-vault';
export const LOCAL_VAULT_BATCH_PATH = '/api/local-vault/batch';
export const STORE_SCHEMA = 1;
/**
 * Every call must carry this header (the app client always does). A cross-site page cannot add a
 * custom header without a CORS preflight, which this API never grants: a second CSRF barrier next to
 * the Sec-Fetch-Site / Origin check, effective even for browsers that omit those.
 */
export const CLIENT_HEADER = 'x-glassfolio-local';
export const MAX_BODY_BYTES = 20 * 1024 * 1024;
export const MAX_VALUE_BYTES = 5 * 1024 * 1024;

/** Keys the client may persist. Must stay in sync with isServerPersistedKey (src/services/storage/storageKeys.ts). */
export const KEY_PATTERN = /^(glassfolio_[a-z0-9_]+|gf_vault_header|gf_totp_enrolled|gf_manual_price_history)$/;

const STORE_FILE = 'vault-store.json';

const emptyState = () => ({ schema: STORE_SCHEMA, revision: 0, updatedAt: null, records: {} });

const readState = (file) => {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (parsed === null || typeof parsed !== 'object' || parsed.records === null || typeof parsed.records !== 'object') {
    throw new Error('Unexpected vault store shape');
  }
  return {
    schema: STORE_SCHEMA,
    revision: Number.isInteger(parsed.revision) ? parsed.revision : 0,
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
    records: parsed.records,
  };
};

/**
 * @param {{ dataDir: string, logger?: Pick<Console, 'warn' | 'error' | 'log'> }} options
 */
export function createLocalVaultStore({ dataDir, logger = console } = {}) {
  if (!dataDir) throw new Error('createLocalVaultStore requires a dataDir');
  const file = path.join(dataDir, STORE_FILE);
  const backup = `${file}.bak`;
  const tmp = `${file}.tmp`;

  let writable = true;
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.accessSync(dataDir, fs.constants.W_OK);
  } catch (err) {
    writable = false;
    logger.error(`[local-vault] Data directory ${dataDir} is not writable:`, err.message);
  }

  const load = () => {
    for (const candidate of [file, backup]) {
      if (!fs.existsSync(candidate)) continue;
      try {
        const state = readState(candidate);
        if (candidate === backup) logger.warn('[local-vault] Recovered the vault store from its backup.');
        return state;
      } catch (err) {
        logger.error(`[local-vault] ${candidate} is unreadable (${err.message}); quarantining it.`);
        try {
          fs.renameSync(candidate, `${file}.corrupt-${Date.now()}`);
        } catch { /* best effort */ }
      }
    }
    return emptyState();
  };

  let state = load();

  const persist = (next) => {
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeSync(fd, JSON.stringify(next));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    if (fs.existsSync(file)) fs.copyFileSync(file, backup);
    fs.renameSync(tmp, file);
  };

  return {
    snapshot: () => ({ ...state, records: { ...state.records } }),

    stats: () => ({ records: Object.keys(state.records).length, revision: state.revision, writable }),

    /** Applies a validated batch atomically; throws (leaving state untouched) if the disk write fails. */
    apply({ set = {}, remove = [], clear = false }) {
      const records = clear ? {} : { ...state.records };
      for (const key of remove) delete records[key];
      for (const [key, value] of Object.entries(set)) records[key] = value;
      const next = { schema: STORE_SCHEMA, revision: state.revision + 1, updatedAt: new Date().toISOString(), records };
      persist(next);
      state = next;
      return { revision: next.revision };
    },
  };
}

// ── HTTP layer ────────────────────────────────────────────────────────────────

export const isLocalVaultPath = (pathname) => pathname === LOCAL_VAULT_PATH || pathname.startsWith(`${LOCAL_VAULT_PATH}/`);

const isIpLiteral = (hostname) => /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.startsWith('[');

/**
 * DNS-rebinding guard: by default only localhost and IP-literal Host headers may use the API.
 * Behind a reverse proxy with a domain name, list it in GLASSFOLIO_ALLOWED_HOSTS.
 */
export const isAllowedHost = (hostHeader, allowedHosts = []) => {
  if (typeof hostHeader !== 'string' || hostHeader === '') return false;
  let hostname;
  try {
    hostname = new URL(`http://${hostHeader}`).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || isIpLiteral(hostname)) return true;
  return allowedHosts.includes(hostname);
};

const isSameOrigin = (req) => {
  const site = req.headers['sec-fetch-site'];
  if (site !== undefined && site !== 'same-origin' && site !== 'none') return false;
  const origin = req.headers.origin;
  if (origin !== undefined) {
    try {
      if (new URL(origin).host !== req.headers.host) return false;
    } catch {
      return false;
    }
  }
  return true;
};

const readJsonBody = (req, maxBytes) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'));
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });

/** Returns an error message for an invalid batch, or null. */
export const validateBatch = (batch) => {
  if (batch === null || typeof batch !== 'object' || Array.isArray(batch)) return 'Body must be an object';
  const { set, remove, clear } = batch;
  if (clear !== undefined && typeof clear !== 'boolean') return '"clear" must be a boolean';
  if (remove !== undefined) {
    if (!Array.isArray(remove)) return '"remove" must be an array';
    for (const key of remove) {
      if (typeof key !== 'string' || !KEY_PATTERN.test(key)) return `Key not allowed: ${String(key).slice(0, 64)}`;
    }
  }
  if (set !== undefined) {
    if (set === null || typeof set !== 'object' || Array.isArray(set)) return '"set" must be an object';
    for (const [key, value] of Object.entries(set)) {
      if (!KEY_PATTERN.test(key)) return `Key not allowed: ${key.slice(0, 64)}`;
      if (typeof value !== 'string') return `Value for ${key} must be a string`;
      if (Buffer.byteLength(value, 'utf8') > MAX_VALUE_BYTES) return `Value for ${key} is too large`;
    }
  }
  return null;
};

/**
 * Creates the request handler. It returns true when it handled the request, so callers only
 * need to route on `isLocalVaultPath`.
 */
/**
 * @param {ReturnType<typeof createLocalVaultStore>} store
 * @param {{ securityHeaders?: Record<string, string>, allowedHosts?: string[], logger?: Pick<Console, 'warn' | 'error' | 'log'> }} [options]
 */
export function createLocalVaultHandler(store, { securityHeaders = {}, allowedHosts = [], logger = console } = {}) {
  const send = (res, status, body, extra = {}) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...securityHeaders,
      ...extra,
    });
    res.end(JSON.stringify(body));
  };

  return async function handle(req, res, url) {
    if (!isAllowedHost(req.headers.host, allowedHosts) || !isSameOrigin(req)) {
      send(res, 403, { error: 'Forbidden' });
      return true;
    }

    if (req.headers[CLIENT_HEADER] !== '1') {
      send(res, 403, { error: 'Forbidden' });
      return true;
    }

    if (url.pathname === LOCAL_VAULT_PATH) {
      if (req.method !== 'GET') {
        send(res, 405, { error: 'Method not allowed' }, { Allow: 'GET' });
        return true;
      }
      send(res, 200, store.snapshot());
      return true;
    }

    if (url.pathname === LOCAL_VAULT_BATCH_PATH) {
      if (req.method !== 'POST') {
        send(res, 405, { error: 'Method not allowed' }, { Allow: 'POST' });
        return true;
      }
      if (!String(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
        send(res, 415, { error: 'Content-Type must be application/json' });
        return true;
      }
      try {
        const batch = await readJsonBody(req, MAX_BODY_BYTES);
        const problem = validateBatch(batch);
        if (problem) {
          send(res, 400, { error: problem });
          return true;
        }
        const { revision } = store.apply(batch);
        send(res, 200, { ok: true, revision });
      } catch (err) {
        if (err.status) {
          send(res, err.status, { error: err.message });
        } else {
          logger.error('[local-vault] Failed to persist batch:', err.message);
          send(res, 500, { error: 'Could not persist the vault store' });
        }
      }
      return true;
    }

    send(res, 404, { error: 'Not found' });
    return true;
  };
}
