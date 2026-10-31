/**
 * GlassFolio MCP bridge (TGLA-198).
 *
 * An MCP client (Claude Code, Codex, Cursor, Antigravity...) cannot read the vault: it is encrypted in
 * the browser and only the open, unlocked GlassFolio tab holds the key. This module sits on the user's
 * own machine and relays tool calls to that tab:
 *
 *   MCP client --Streamable HTTP (POST /mcp)--> bridge --SSE (/mcp/bridge/events)--> GlassFolio tab
 *   MCP client <------------- JSON-RPC result -- bridge <-- POST /mcp/bridge/result -- GlassFolio tab
 *
 * The tab runs the tool on its own data, so nothing is decrypted or stored here and no GlassFolio
 * server ever sees it. Zero dependency, used by the standalone CLI and by the Docker / dev servers.
 */

import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { clearInterval, clearTimeout, setInterval, setTimeout } from 'node:timers';

export const MCP_PATH = '/mcp';
export const BRIDGE_PREFIX = '/mcp/bridge';
export const DEFAULT_PORT = 47831;
export const TOKEN_HEADER = 'x-glassfolio-token';
/** The app origins allowed to open the tab connection of a standalone bridge. */
export const DEFAULT_APP_ORIGINS = ['https://app.glassfolio.dev', 'https://dev-app.glassfolio.dev'];
export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_IN_FLIGHT = 8;
const MIN_TOKEN_LENGTH = 16;

export const NOT_CONNECTED_MESSAGE =
  'GlassFolio is not connected. Ask the user to open GlassFolio in their browser, unlock their vault, and turn on "AI clients" in Settings > AI & MCP. Then try again.';
const INSTRUCTIONS =
  "GlassFolio's tools run in the user's open GlassFolio tab, on their own data, once they have unlocked their vault. " +
  'If a tool says that GlassFolio is not connected, ask the user to open GlassFolio and unlock it. ' +
  'Tools that change data wait for the user to approve the change in GlassFolio before they run.';

/** Reads the bridge token of a data directory, creating a random one (owner-only file) the first time. */
export function loadOrCreateToken(dir, fileName = 'mcp-token') {
  const file = path.join(dir, fileName);
  try {
    const existing = readFileSync(file, 'utf8').trim();
    if (existing.length >= MIN_TOKEN_LENGTH) return existing;
  } catch {
    // first run: create it below
  }
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const token = randomBytes(32).toString('hex');
  writeFileSync(file, `${token}\n`, { mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {
    // best effort on filesystems without permissions
  }
  return token;
}

export const isBridgePath = (pathname) => pathname === MCP_PATH || pathname.startsWith(`${MCP_PATH}/`);

const isIpLiteral = (hostname) => /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.startsWith('[');

/** DNS-rebinding guard: only localhost, IP literals and the hosts listed by the operator may call the bridge. */
export const isHostAllowed = (hostHeader, allowedHosts = []) => {
  if (typeof hostHeader !== 'string' || hostHeader === '') return false;
  let hostname;
  try {
    hostname = new URL(`http://${hostHeader}`).hostname.toLowerCase();
  } catch {
    return false;
  }
  return hostname === 'localhost' || hostname.endsWith('.localhost') || isIpLiteral(hostname) || allowedHosts.includes(hostname);
};

/** A request without an Origin (every non-browser MCP client) passes; a browser one must be same-origin or listed. */
export const isOriginAllowed = (origin, hostHeader, allowedOrigins = []) => {
  if (origin === undefined) return true;
  try {
    const parsed = new URL(origin);
    return parsed.host === hostHeader || allowedOrigins.includes(parsed.origin);
  } catch {
    return false;
  }
};

const digest = (value) => createHash('sha256').update(String(value)).digest();
const sameSecret = (a, b) => timingSafeEqual(digest(a), digest(b));

const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result });
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

/**
 * @param {{
 *   token: string,
 *   tools: Array<{ name: string, description: string, inputSchema: object, annotations?: object }>,
 *   version: string,
 *   allowedHosts?: string[],
 *   allowedOrigins?: string[],
 *   headers?: Record<string, string>,
 *   sameOriginConfig?: boolean,
 *   callTimeoutMs?: number,
 *   keepAliveMs?: number,
 * }} options
 */
export function createMcpBridge({
  token,
  tools,
  version,
  allowedHosts = [],
  allowedOrigins = [],
  headers = {},
  sameOriginConfig = false,
  callTimeoutMs = 120_000,
  keepAliveMs = 15_000,
}) {
  if (typeof token !== 'string' || token.length < MIN_TOKEN_LENGTH) {
    throw new Error(`The MCP bridge token must be at least ${MIN_TOKEN_LENGTH} characters`);
  }
  const toolNames = new Set(tools.map((tool) => tool.name));
  /** @type {{ id: string, res: import('node:http').ServerResponse, timer: NodeJS.Timeout } | null} */
  let tab = null;
  /** @type {Map<string, { resolve: (outcome: object) => void, timer: NodeJS.Timeout, tabId: string }>} */
  const pending = new Map();

  const send = (res, status, body, extra = {}) => {
    const payload = body === undefined ? '' : JSON.stringify(body);
    res.writeHead(status, {
      ...headers,
      ...extra,
      ...(payload ? { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) } : {}),
      'Cache-Control': 'no-store',
    });
    res.end(payload);
  };

  const failPending = (tabId, message) => {
    for (const [id, call] of pending) {
      if (call.tabId !== tabId) continue;
      clearTimeout(call.timer);
      pending.delete(id);
      call.resolve({ ok: false, error: message });
    }
  };

  /** Runs a tool in the connected tab: resolves with { ok: true, result } or { ok: false, error }. */
  const callTool = (name, args) =>
    new Promise((resolve) => {
      if (!tab) return resolve({ ok: false, error: NOT_CONNECTED_MESSAGE });
      if (pending.size >= MAX_IN_FLIGHT) {
        return resolve({ ok: false, error: 'Too many tool calls are waiting for GlassFolio. Try again in a moment.' });
      }
      const id = randomUUID();
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve({
          ok: false,
          error: 'GlassFolio did not answer in time. If the tool asks for approval, the user has to answer it in GlassFolio.',
        });
      }, callTimeoutMs);
      pending.set(id, { resolve, timer, tabId: tab.id });
      writeEvent(tab.res, 'call', { id, name, arguments: args });
    });

  const writeEvent = (res, event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const handleToolCall = async (id, params) => {
    const name = params?.name;
    const args = params?.arguments ?? {};
    if (typeof name !== 'string' || !toolNames.has(name)) {
      return rpcError(id, -32602, `Unknown tool: ${String(name).slice(0, 80)}`);
    }
    if (typeof args !== 'object' || args === null || Array.isArray(args)) {
      return rpcError(id, -32602, 'Tool arguments must be an object');
    }
    const outcome = await callTool(name, args);
    const text = outcome.ok ? (typeof outcome.result === 'string' ? outcome.result : JSON.stringify(outcome.result ?? null)) : String(outcome.error);
    return rpcResult(id, { content: [{ type: 'text', text }], isError: !outcome.ok });
  };

  /** One JSON-RPC message in, its response out (null for a notification or a client response). */
  const dispatch = async (message) => {
    if (typeof message !== 'object' || message === null || Array.isArray(message) || message.jsonrpc !== '2.0') {
      return rpcError(message?.id, -32600, 'Invalid Request');
    }
    const { id, method, params } = message;
    if (typeof method !== 'string' || id === undefined || id === null) return null;
    switch (method) {
      case 'initialize': {
        const requested = params?.protocolVersion;
        return rpcResult(id, {
          protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'glassfolio', title: 'GlassFolio', version },
          instructions: INSTRUCTIONS,
        });
      }
      case 'ping':
        return rpcResult(id, {});
      case 'tools/list':
        return rpcResult(id, { tools });
      case 'tools/call':
        return handleToolCall(id, params);
      case 'resources/list':
        return rpcResult(id, { resources: [] });
      case 'prompts/list':
        return rpcResult(id, { prompts: [] });
      default:
        return rpcError(id, -32601, `Method not found: ${method.slice(0, 80)}`);
    }
  };

  const corsFor = (req) => {
    const origin = req.headers.origin;
    if (origin === undefined || !isOriginAllowed(origin, req.headers.host, allowedOrigins)) return {};
    return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Expose-Headers': 'Mcp-Session-Id' };
  };

  const authorized = (req) => {
    const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')?.[1];
    const candidate = req.headers[TOKEN_HEADER] ?? bearer;
    return typeof candidate === 'string' && sameSecret(candidate, token);
  };

  const handleEvents = (req, res, cors) => {
    if (tab) {
      writeEvent(tab.res, 'replaced', {});
      tab.res.end();
    }
    const id = randomUUID();
    res.writeHead(200, {
      ...headers,
      ...cors,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const current = { id, res, timer: setInterval(() => res.write(': keepalive\n\n'), keepAliveMs) };
    current.timer.unref?.();
    tab = current;
    writeEvent(res, 'hello', { version, tools: tools.length });
    res.on('close', () => {
      clearInterval(current.timer);
      if (tab?.id === id) tab = null;
      failPending(id, 'The GlassFolio tab disconnected before it answered.');
    });
  };

  const handleResult = async (req, res) => {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (error) {
      return send(res, error?.status === 413 ? 413 : 400, { error: 'invalid_body' }, corsFor(req));
    }
    const call = typeof body?.id === 'string' ? pending.get(body.id) : undefined;
    if (!call) return send(res, 404, { error: 'unknown_call' }, corsFor(req));
    clearTimeout(call.timer);
    pending.delete(body.id);
    call.resolve(body.ok === true ? { ok: true, result: body.result } : { ok: false, error: String(body.error ?? 'The tool failed.') });
    return send(res, 204, undefined, corsFor(req));
  };

  const handleRpc = async (req, res) => {
    let parsed;
    try {
      parsed = JSON.parse(await readBody(req));
    } catch (error) {
      return send(res, error?.status === 413 ? 413 : 400, rpcError(null, -32700, 'Parse error'), corsFor(req));
    }
    if (Array.isArray(parsed)) {
      const responses = (await Promise.all(parsed.map(dispatch))).filter(Boolean);
      return responses.length ? send(res, 200, responses, corsFor(req)) : send(res, 202, undefined, corsFor(req));
    }
    const response = await dispatch(parsed);
    return response ? send(res, 200, response, corsFor(req)) : send(res, 202, undefined, corsFor(req));
  };

  /** Resolves true when the request belonged to the bridge (and has been answered). */
  const handle = async (req, res, url) => {
    const { pathname } = url;
    if (!isBridgePath(pathname)) return false;
    const cors = corsFor(req);

    if (!isHostAllowed(req.headers.host, allowedHosts) || !isOriginAllowed(req.headers.origin, req.headers.host, allowedOrigins)) {
      send(res, 403, { error: 'forbidden' });
      return true;
    }

    if (req.method === 'OPTIONS') {
      const requested = req.headers['access-control-request-headers'];
      send(res, 204, undefined, {
        ...cors,
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': typeof requested === 'string' && requested ? requested : `authorization, content-type, ${TOKEN_HEADER}`,
        ...(req.headers['access-control-request-private-network'] === 'true' ? { 'Access-Control-Allow-Private-Network': 'true' } : {}),
        'Access-Control-Max-Age': '600',
      });
      return true;
    }

    // The tab of a same-origin server gets the token here: only a same-origin page may read it.
    if (sameOriginConfig && pathname === `${BRIDGE_PREFIX}/config` && req.method === 'GET') {
      const site = req.headers['sec-fetch-site'];
      if (site !== undefined && site !== 'same-origin' && site !== 'none') {
        send(res, 403, { error: 'forbidden' });
      } else {
        send(res, 200, { token, tools: tools.length, version });
      }
      return true;
    }

    if (!authorized(req)) {
      send(res, 401, { error: 'unauthorized' }, { ...cors, 'WWW-Authenticate': 'Bearer realm="GlassFolio MCP"' });
      return true;
    }

    if (pathname === MCP_PATH) {
      if (req.method === 'POST') await handleRpc(req, res);
      else if (req.method === 'DELETE') send(res, 204, undefined, cors);
      else send(res, 405, { error: 'method_not_allowed' }, { ...cors, Allow: 'POST, DELETE, OPTIONS' });
      return true;
    }
    if (pathname === `${BRIDGE_PREFIX}/events` && req.method === 'GET') {
      handleEvents(req, res, cors);
      return true;
    }
    if (pathname === `${BRIDGE_PREFIX}/result` && req.method === 'POST') {
      await handleResult(req, res);
      return true;
    }
    if (pathname === `${BRIDGE_PREFIX}/status` && req.method === 'GET') {
      send(res, 200, { connected: tab !== null, pending: pending.size, tools: tools.length, version }, cors);
      return true;
    }
    send(res, 404, { error: 'not_found' }, cors);
    return true;
  };

  const close = () => {
    if (tab) {
      clearInterval(tab.timer);
      tab.res.end();
      tab = null;
    }
    for (const [id, call] of pending) {
      clearTimeout(call.timer);
      pending.delete(id);
      call.resolve({ ok: false, error: 'The bridge stopped.' });
    }
  };

  return { handle, dispatch, callTool, close, isBridgePath, status: () => ({ connected: tab !== null, pending: pending.size }) };
}
