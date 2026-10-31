import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isHostAllowed, isOriginAllowed, loadOrCreateToken, SUPPORTED_PROTOCOL_VERSIONS } from '../../../mcp-server/bridge.mjs';
import { TOKEN, TOKEN_HEADER, authHeaders, catalog, connectTab, rawRequest, rpc, startBridge, type RunningBridge } from './mcpTestKit';

let running: RunningBridge | undefined;
afterEach(async () => {
  await running?.stop();
  running = undefined;
});
const init = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } };
const call = (id: number, name: string, args: unknown = {}) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });

describe('MCP Streamable HTTP endpoint', () => {
  it('answers initialize with the negotiated version, its identity and what it needs from the user', async () => {
    running = await startBridge();
    const { status, json } = await rpc(running.base, init);
    expect(status).toBe(200);
    expect(json.result.protocolVersion).toBe('2025-06-18');
    expect(json.result.serverInfo).toMatchObject({ name: 'glassfolio', version: '9.9.9' });
    expect(json.result.capabilities.tools).toBeDefined();
    expect(json.result.instructions).toMatch(/unlocked their vault/);
  });

  it('falls back to its newest version when the client asks for one it does not know', async () => {
    running = await startBridge();
    const { json } = await rpc(running.base, { ...init, params: { protocolVersion: '1999-01-01' } });
    expect(json.result.protocolVersion).toBe(SUPPORTED_PROTOCOL_VERSIONS[0]);
  });

  it('lists the 35 tools of the catalog, with their schemas and read-only hints', async () => {
    running = await startBridge();
    const { json } = await rpc(running.base, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(json.result.tools).toHaveLength(catalog.tools.length);
    expect(json.result.tools.length).toBeGreaterThanOrEqual(30);
    json.result.tools.forEach((tool: any) => {
      expect(tool.inputSchema.type).toBe('object');
      expect(typeof tool.annotations.readOnlyHint).toBe('boolean');
    });
  });

  it('accepts notifications, pings, batches and refuses unknown methods and bad JSON', async () => {
    running = await startBridge();
    expect((await rpc(running.base, { jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202);
    expect((await rpc(running.base, { jsonrpc: '2.0', id: 3, method: 'ping' })).json.result).toEqual({});
    const batch = await rpc(running.base, [{ jsonrpc: '2.0', id: 4, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/initialized' }, { jsonrpc: '2.0', id: 5, method: 'tools/list' }]);
    expect(batch.json.map((entry: any) => entry.id)).toEqual([4, 5]);
    expect((await rpc(running.base, { jsonrpc: '2.0', id: 6, method: 'nope/nope' })).json.error.code).toBe(-32601);
    const bad = await rpc(running.base, '{not json');
    expect(bad.status).toBe(400);
    expect(bad.json.error.code).toBe(-32700);
    expect((await rpc(running.base, { id: 7, method: 'ping' })).json.error.code).toBe(-32600);
  });

  it('has no server-initiated stream and ends a session without state', async () => {
    running = await startBridge();
    const get = await fetch(`${running.base}/mcp`, { headers: authHeaders });
    expect(get.status).toBe(405);
    expect(get.headers.get('allow')).toContain('POST');
    expect((await fetch(`${running.base}/mcp`, { method: 'DELETE', headers: authHeaders })).status).toBe(204);
  });
});

describe('access to the bridge', () => {
  it('refuses a request without the right token, on every endpoint', async () => {
    running = await startBridge();
    for (const [method, path] of [['POST', '/mcp'], ['GET', '/mcp/bridge/events'], ['POST', '/mcp/bridge/result'], ['GET', '/mcp/bridge/status']]) {
      const none = await fetch(`${running.base}${path}`, { method });
      expect(none.status, `${method} ${path}`).toBe(401);
      expect(none.headers.get('www-authenticate')).toMatch(/Bearer/);
      const wrong = await fetch(`${running.base}${path}`, { method, headers: { [TOKEN_HEADER]: 'b'.repeat(32) } });
      expect(wrong.status).toBe(401);
    }
  });

  it('accepts the token as a Bearer header or as X-GlassFolio-Token', async () => {
    running = await startBridge();
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' });
    expect((await fetch(`${running.base}/mcp`, { method: 'POST', body, headers: { Authorization: `Bearer ${TOKEN}` } })).status).toBe(200);
    expect((await fetch(`${running.base}/mcp`, { method: 'POST', body, headers: { [TOKEN_HEADER]: TOKEN } })).status).toBe(200);
  });

  it('refuses a token that is too short to be one', async () => {
    await expect(startBridge({ token: 'short' })).rejects.toThrow(/token/);
  });

  it('answers only to localhost, IP literals and the hosts the operator listed (DNS rebinding)', async () => {
    running = await startBridge({ allowedHosts: ['glassfolio.example'] });
    const ask = (host: string) => rawRequest(running!.port, { method: 'POST', path: '/mcp', headers: { Host: host, ...authHeaders }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }) });
    expect((await ask('evil.example')).status).toBe(403);
    expect((await ask('localhost:3000')).status).toBe(200);
    expect((await ask('127.0.0.1:47831')).status).toBe(200);
    expect((await ask('glassfolio.example')).status).toBe(200);
    expect(isHostAllowed('evil.example')).toBe(false);
    expect(isHostAllowed('[::1]:3000')).toBe(true);
    expect(isHostAllowed(undefined as unknown as string)).toBe(false);
  });

  it('lets a browser tab in only from an allowed origin, and answers its preflight for the local network', async () => {
    running = await startBridge({ allowedOrigins: ['https://app.glassfolio.dev'] });
    const preflight = (origin: string) =>
      rawRequest(running!.port, {
        method: 'OPTIONS',
        path: '/mcp/bridge/events',
        headers: { Host: `127.0.0.1:${running!.port}`, Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'x-glassfolio-token', 'Access-Control-Request-Private-Network': 'true' },
      });
    const allowed = await preflight('https://app.glassfolio.dev');
    expect(allowed.status).toBe(204);
    expect(allowed.headers['access-control-allow-origin']).toBe('https://app.glassfolio.dev');
    expect(allowed.headers['access-control-allow-private-network']).toBe('true');
    expect(allowed.headers['access-control-allow-headers']).toContain('x-glassfolio-token');
    const refused = await preflight('https://evil.example');
    expect(refused.status).toBe(403);
    expect(refused.headers['access-control-allow-origin']).toBeUndefined();
    const withOrigin = await rawRequest(running.port, { path: '/mcp/bridge/status', headers: { Host: `127.0.0.1:${running.port}`, Origin: 'https://evil.example', [TOKEN_HEADER]: TOKEN } });
    expect(withOrigin.status).toBe(403);
    expect(isOriginAllowed(undefined, 'x', [])).toBe(true);
    expect(isOriginAllowed('null', 'x', [])).toBe(false);
  });

  it('hands the token to a same-origin page only, when the server asks for it', async () => {
    running = await startBridge({ sameOriginConfig: true });
    const same = await fetch(`${running.base}/mcp/bridge/config`, { headers: { 'Sec-Fetch-Site': 'same-origin' } });
    expect(same.status).toBe(200);
    expect(await same.json()).toMatchObject({ token: TOKEN, tools: catalog.tools.length });
    expect((await fetch(`${running.base}/mcp/bridge/config`, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403);
    const foreign = await rawRequest(running.port, { path: '/mcp/bridge/config', headers: { Host: `127.0.0.1:${running.port}`, Origin: 'https://evil.example' } });
    expect(foreign.status).toBe(403);
    await running.stop();
    running = await startBridge();
    expect((await fetch(`${running.base}/mcp/bridge/config`)).status).toBe(401);
  });
});

describe('relaying a tool call to the open tab', () => {
  it('tells the client to open and unlock GlassFolio when no tab is connected', async () => {
    running = await startBridge();
    const { json } = await rpc(running.base, call(1, 'get_portfolio_summary'));
    expect(json.result.isError).toBe(true);
    expect(json.result.content[0].text).toMatch(/not connected.*unlock/i);
  });

  it('refuses a tool that is not in the catalog, and arguments that are not an object', async () => {
    running = await startBridge();
    expect((await rpc(running.base, call(1, 'drop_database'))).json.error.code).toBe(-32602);
    expect((await rpc(running.base, call(2, 'get_portfolio_summary', ['x']))).json.error.code).toBe(-32602);
  });

  it('runs the call in the tab and returns its result', async () => {
    running = await startBridge({ callTimeoutMs: 2000 });
    const tab = await connectTab(running.base);
    expect(await tab.next('hello')).toMatchObject({ version: '9.9.9', tools: catalog.tools.length });
    expect((await (await fetch(`${running.base}/mcp/bridge/status`, { headers: authHeaders })).json()).connected).toBe(true);
    const pending = rpc(running.base, call(1, 'list_goals', { limit: 3 }));
    const request = await tab.next('call');
    expect(request).toMatchObject({ name: 'list_goals', arguments: { limit: 3 } });
    expect(await tab.postResult({ id: request.id, ok: true, result: [{ title: 'House' }] })).toBe(204);
    const { json } = await pending;
    expect(json.result.isError).toBe(false);
    expect(JSON.parse(json.result.content[0].text)).toEqual([{ title: 'House' }]);
    tab.close();
  });

  it('returns a failure of the tool as an error result, not as a protocol error', async () => {
    running = await startBridge({ callTimeoutMs: 2000 });
    const tab = await connectTab(running.base);
    const pending = rpc(running.base, call(1, 'record_transaction', {}));
    const request = await tab.next('call');
    await tab.postResult({ id: request.id, ok: false, error: 'The user declined this change in GlassFolio.' });
    const { json } = await pending;
    expect(json.result).toMatchObject({ isError: true, content: [{ type: 'text', text: 'The user declined this change in GlassFolio.' }] });
    tab.close();
  });

  it('gives up when the tab does not answer in time', async () => {
    running = await startBridge({ callTimeoutMs: 100 });
    const tab = await connectTab(running.base);
    const { json } = await rpc(running.base, call(1, 'list_goals'));
    expect(json.result.isError).toBe(true);
    expect(json.result.content[0].text).toMatch(/did not answer in time/);
    tab.close();
  });

  it('fails the waiting calls when the tab goes away (lock, close, sign-out)', async () => {
    running = await startBridge({ callTimeoutMs: 5000 });
    const tab = await connectTab(running.base);
    const pending = rpc(running.base, call(1, 'list_goals'));
    await tab.next('call');
    tab.close();
    const { json } = await pending;
    expect(json.result.isError).toBe(true);
    expect(json.result.content[0].text).toMatch(/tab disconnected/);
    expect(running.bridge.status().connected).toBe(false);
  });

  it('sends calls to the newest tab and tells the older one it was replaced', async () => {
    running = await startBridge({ callTimeoutMs: 2000 });
    const first = await connectTab(running.base);
    const second = await connectTab(running.base);
    await first.next('replaced');
    const pending = rpc(running.base, call(1, 'list_goals'));
    const request = await second.next('call');
    await second.postResult({ id: request.id, ok: true, result: 'ok' });
    expect((await pending).json.result.content[0].text).toBe('ok');
    first.close();
    second.close();
  });

  it('rejects a result nobody waits for, and limits the calls in flight', async () => {
    running = await startBridge({ callTimeoutMs: 3000 });
    const tab = await connectTab(running.base);
    expect(await tab.postResult({ id: 'nope', ok: true })).toBe(404);
    const waiting = Array.from({ length: 8 }, (_, index) => rpc(running!.base, call(index, 'list_goals')));
    for (let i = 0; i < 8; i += 1) await tab.next('call');
    const extra = await rpc(running.base, call(99, 'list_goals'));
    expect(extra.json.result.content[0].text).toMatch(/Too many/);
    running.bridge.close();
    await Promise.all(waiting);
    tab.close();
  });
});

describe('bridge token file', () => {
  it('creates a random token once, keeps it, and keeps the file private', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gf-mcp-'));
    const token = loadOrCreateToken(dir);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(loadOrCreateToken(dir)).toBe(token);
    expect(readFileSync(join(dir, 'mcp-token'), 'utf-8').trim()).toBe(token);
    if (process.platform !== 'win32') expect(statSync(join(dir, 'mcp-token')).mode & 0o077).toBe(0);
  });
});
