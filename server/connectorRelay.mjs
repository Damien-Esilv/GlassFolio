/**
 * Connector relay (TGLA-221).
 *
 * Most broker and blockchain APIs refuse calls from a browser (CORS). The sync engine runs in the
 * user's tab, so it sends the already-signed request here and the relay forwards it as is:
 *
 * - only to an allowlisted provider, method, path and header set (connectorRelaySpec.mjs);
 * - never following redirects, with a timeout and a capped response size;
 * - storing nothing and logging nothing (no URL, header or body ever reaches a log).
 *
 * The same core serves the Docker / `npm run dev` server (same-origin guards of the local vault)
 * and the hosted app (`api/connector-relay.js`, Supabase session required, per-user rate limit).
 */
import { createHash } from 'node:crypto';
import { RELAY_PROVIDERS } from './connectorRelaySpec.mjs';

export const CONNECTOR_RELAY_PATH = '/api/connector-relay';
/** CSRF marker: a cross-site page cannot send a custom header without a preflight we never grant. */
export const RELAY_CLIENT_HEADER = 'x-glassfolio-relay';
export const MAX_RELAY_REQUEST_BYTES = 64 * 1024;
export const MAX_RELAY_RESPONSE_BYTES = 5 * 1024 * 1024;
export const RELAY_TIMEOUT_MS = 10_000;
const MAX_QUERY_LENGTH = 2048;
const MAX_HEADER_VALUE_LENGTH = 4096;
const QUERY_PATTERN = /^[A-Za-z0-9\-._~%=&+,:]*$/;
const PASSTHROUGH_CONTENT_TYPE = /^(application\/(json|xml)|text\/(plain|xml|csv))\b/i;

export const isConnectorRelayPath = (pathname) => pathname === CONNECTOR_RELAY_PATH;

const failure = (status, error) => ({ ok: false, status, error });

/**
 * Checks a relay request against the allowlist and builds the upstream request.
 * @returns {{ ok: true, url: string, init: RequestInit } | { ok: false, status: number, error: string }}
 */
export function buildUpstreamRequest(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return failure(400, 'Invalid request');
  const spec = Object.hasOwn(RELAY_PROVIDERS, payload.provider) ? RELAY_PROVIDERS[payload.provider] : undefined;
  if (!spec) return failure(403, 'Provider not allowed');

  const method = typeof payload.method === 'string' ? payload.method.toUpperCase() : '';
  const path = typeof payload.path === 'string' ? payload.path : '';
  const route = spec.routes.find((candidate) => candidate.method === method && candidate.path.test(path));
  if (!route) return failure(403, 'Route not allowed');

  const query = payload.query ?? '';
  if (typeof query !== 'string' || query.length > MAX_QUERY_LENGTH || !QUERY_PATTERN.test(query)) {
    return failure(400, 'Invalid query');
  }

  const headers = { accept: 'application/json', 'user-agent': 'GlassFolio-Relay/1.0' };
  const incoming = payload.headers ?? {};
  if (incoming === null || typeof incoming !== 'object' || Array.isArray(incoming)) return failure(400, 'Invalid headers');
  for (const [rawName, value] of Object.entries(incoming)) {
    const name = rawName.toLowerCase();
    if (!spec.forwardHeaders.includes(name)) return failure(403, 'Header not allowed');
    if (typeof value !== 'string' || value.length > MAX_HEADER_VALUE_LENGTH || /[\r\n]/.test(value)) {
      return failure(400, 'Invalid header value');
    }
    headers[name] = value;
  }

  let body;
  if (route.body) {
    if (!route.body(payload.body)) return failure(400, 'Invalid body');
    body = JSON.stringify(payload.body);
    headers['content-type'] = 'application/json';
  } else if (payload.body !== undefined && payload.body !== null) {
    return failure(400, 'Body not allowed');
  }

  const url = new URL(`${spec.origin}${path}${query ? `?${query}` : ''}`);
  if (url.origin !== spec.origin || url.pathname !== path) return failure(403, 'Route not allowed');
  return { ok: true, url: url.toString(), init: { method, headers, body, redirect: 'manual' } };
}

async function readCapped(response, maxBytes) {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/**
 * Forwards an allowlisted request.
 * @returns {Promise<{ status: number, contentType: string, body: Buffer }>}
 */
export async function relayUpstream(upstream, { fetchImpl = fetch } = {}) {
  const json = (status, error) => ({
    status,
    contentType: 'application/json; charset=utf-8',
    body: Buffer.from(JSON.stringify({ error })),
  });
  let response;
  try {
    response = await fetchImpl(upstream.url, { ...upstream.init, signal: AbortSignal.timeout(RELAY_TIMEOUT_MS) });
  } catch {
    return json(502, 'Provider unreachable');
  }
  if (response.status >= 300 && response.status < 400) return json(502, 'Provider redirect refused');
  const body = await readCapped(response, MAX_RELAY_RESPONSE_BYTES).catch(() => null);
  if (body === null) return json(502, 'Provider response too large');
  const upstreamType = response.headers.get('content-type') || '';
  return {
    status: response.status,
    contentType: PASSTHROUGH_CONTENT_TYPE.test(upstreamType) ? upstreamType : 'text/plain; charset=utf-8',
    body,
  };
}

/** Reads a JSON request body with a size cap. Rejects with `{ status }` on overflow or bad JSON. */
export const readRelayBody = (req, maxBytes = MAX_RELAY_REQUEST_BYTES) =>
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
    req.on('error', (error) => reject(Object.assign(error, { status: 400 })));
  });

const isJsonRequest = (req) => /^application\/json\b/i.test(req.headers['content-type'] || '');

/** Writes the relay answer. Never sets cookies and is never cached. */
export function sendRelayResponse(res, result, securityHeaders = {}) {
  res.writeHead(result.status, {
    ...securityHeaders,
    'Content-Type': result.contentType,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(result.body);
}

const errorResult = (status, error) => ({
  status,
  contentType: 'application/json; charset=utf-8',
  body: Buffer.from(JSON.stringify({ error })),
});

/**
 * Shared request flow once the caller has been authorized.
 * @returns {Promise<{ status: number, contentType: string, body: Buffer }>}
 */
export async function processRelayRequest(req, { fetchImpl } = {}) {
  if (req.method !== 'POST') return errorResult(405, 'Method not allowed');
  if (!isJsonRequest(req)) return errorResult(415, 'JSON expected');
  let payload;
  try {
    payload = await readRelayBody(req);
  } catch (error) {
    return errorResult(error.status || 400, 'Invalid request');
  }
  const upstream = buildUpstreamRequest(payload);
  if (!upstream.ok) return errorResult(upstream.status, upstream.error);
  return relayUpstream(upstream, { fetchImpl });
}

/**
 * Local mode (Docker, `npm run dev`): same guards as the local vault API — localhost or an allowed
 * Host, same-origin request, and the private client header.
 * @param {{
 *   securityHeaders?: Record<string, string>,
 *   allowedHosts?: string[],
 *   isAllowedHost: (host: string | undefined, allowedHosts: string[]) => boolean,
 *   isSameOrigin: (req: import('node:http').IncomingMessage) => boolean,
 *   clientHeader: string,
 *   fetchImpl?: typeof fetch,
 * }} options
 */
export function createLocalConnectorRelayHandler({
  securityHeaders = {},
  allowedHosts = [],
  isAllowedHost,
  isSameOrigin,
  clientHeader,
  fetchImpl,
}) {
  return async function handle(req, res) {
    const allowed =
      isAllowedHost(req.headers.host, allowedHosts) && isSameOrigin(req) && req.headers[clientHeader] === '1';
    const result = allowed ? await processRelayRequest(req, { fetchImpl }) : errorResult(403, 'Forbidden');
    sendRelayResponse(res, result, securityHeaders);
  };
}

/** Same-origin check for the hosted app: the request must come from a page of this very host. */
export function isSameOriginCloud(req) {
  const site = req.headers['sec-fetch-site'];
  if (site !== undefined && site !== 'same-origin') return false;
  const origin = req.headers.origin;
  if (typeof origin !== 'string') return site === 'same-origin';
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/**
 * Supabase session check for the hosted relay, with a short cache so a sync (a handful of calls)
 * costs one verification. Only a hash of the token is kept in memory.
 */
export function createSupabaseSessionVerifier({ supabaseUrl, anonKey, fetchImpl = fetch, ttlMs = 5 * 60 * 1000, maxEntries = 500 }) {
  const cache = new Map();
  return async function verify(authorizationHeader) {
    if (!supabaseUrl || !anonKey) return { ok: false, status: 503 };
    const match = /^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(authorizationHeader || '');
    if (!match) return { ok: false, status: 401 };
    const key = createHash('sha256').update(match[1]).digest('hex');
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return { ok: true, userId: cached.userId };
    let response;
    try {
      response = await fetchImpl(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
        headers: { apikey: anonKey, authorization: `Bearer ${match[1]}` },
        redirect: 'manual',
        signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
      });
    } catch {
      return { ok: false, status: 503 };
    }
    if (response.status !== 200) return { ok: false, status: 401 };
    const user = await response.json().catch(() => null);
    if (!user || typeof user.id !== 'string') return { ok: false, status: 401 };
    if (cache.size >= maxEntries) cache.delete(cache.keys().next().value);
    cache.set(key, { userId: user.id, expiresAt: Date.now() + ttlMs });
    return { ok: true, userId: user.id };
  };
}

/** Fixed-window limit per user (best effort: each serverless instance keeps its own counters). */
export function createRateLimiter({ limit = 120, windowMs = 60 * 1000, maxEntries = 2000 } = {}) {
  const windows = new Map();
  return function allow(userId, now = Date.now()) {
    const current = windows.get(userId);
    if (!current || now - current.start >= windowMs) {
      if (windows.size >= maxEntries) windows.delete(windows.keys().next().value);
      windows.set(userId, { start: now, count: 1 });
      return true;
    }
    current.count += 1;
    return current.count <= limit;
  };
}

/**
 * Hosted app handler: same-origin, private header, a valid Supabase session and a per-user limit.
 * @param {{
 *   verifySession: (authorization: string | undefined) => Promise<{ ok: true, userId: string } | { ok: false, status: number }>,
 *   rateLimiter: (userId: string) => boolean,
 *   securityHeaders?: Record<string, string>,
 *   fetchImpl?: typeof fetch,
 * }} options
 */
export function createCloudConnectorRelayHandler({ verifySession, rateLimiter, securityHeaders = {}, fetchImpl }) {
  return async function handle(req, res) {
    if (!isSameOriginCloud(req) || req.headers[RELAY_CLIENT_HEADER] !== '1') {
      sendRelayResponse(res, errorResult(403, 'Forbidden'), securityHeaders);
      return;
    }
    const session = await verifySession(req.headers.authorization);
    if (!session.ok) {
      sendRelayResponse(res, errorResult(session.status, 'Unauthorized'), securityHeaders);
      return;
    }
    if (!rateLimiter(session.userId)) {
      sendRelayResponse(res, errorResult(429, 'Too many requests'), securityHeaders);
      return;
    }
    sendRelayResponse(res, await processRelayRequest(req, { fetchImpl }), securityHeaders);
  };
}
