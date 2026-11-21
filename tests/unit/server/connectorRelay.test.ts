/**
 * Connector relay (TGLA-221): only allowlisted requests reach a provider, nothing else is forwarded,
 * and the local and hosted entry points keep their own guards.
 */
import { describe, it, expect, vi } from 'vitest';
import { Readable } from 'node:stream';
import {
  buildUpstreamRequest,
  createCloudConnectorRelayHandler,
  createLocalConnectorRelayHandler,
  createRateLimiter,
  createSupabaseSessionVerifier,
  isConnectorRelayPath,
  relayUpstream,
  MAX_RELAY_RESPONSE_BYTES,
} from '../../../server/connectorRelay.mjs';
import { CLIENT_HEADER, isAllowedHost, isSameOrigin } from '../../../server/localVault.mjs';

const snaptradeRequest = {
  provider: 'snaptrade',
  method: 'GET',
  path: '/accounts/all',
  query: 'clientId=GLASS-TEST&timestamp=1767225600',
  headers: { Signature: 'c2lnbmF0dXJl' },
};

interface Captured { status: number; headers: Record<string, string>; body: string }

/** A real readable stream: like an HTTP request, it holds its data until someone reads it. */
const fakeReq = (body: unknown, headers: Record<string, string>, method = 'POST') => {
  const chunks = body === undefined ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))];
  return Object.assign(Readable.from(chunks), { method, headers });
};

const fakeRes = () => {
  const captured: Captured = { status: 0, headers: {}, body: '' };
  const res = {
    writeHead: (status: number, headers: Record<string, string>) => {
      captured.status = status;
      captured.headers = headers;
    },
    end: (chunk?: Buffer | string) => {
      captured.body = chunk ? chunk.toString() : '';
    },
  };
  return { res, captured };
};

const okFetch = () =>
  vi.fn(async () => new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;

describe('connector relay allowlist', () => {
  it('recognises only its own path', () => {
    expect(isConnectorRelayPath('/api/connector-relay')).toBe(true);
    expect(isConnectorRelayPath('/api/connector-relay/x')).toBe(false);
  });

  it('builds the SnapTrade request with only the signature header and no body', () => {
    const upstream = buildUpstreamRequest(snaptradeRequest);
    expect(upstream.ok).toBe(true);
    if (!upstream.ok) return;
    expect(upstream.url).toBe('https://api.snaptrade.com/accounts/all?clientId=GLASS-TEST&timestamp=1767225600');
    expect(buildUpstreamRequest({ ...snaptradeRequest, path: '/accounts/2f7dc9b3-5c33-4668/activities' }).ok).toBe(true);
    expect(buildUpstreamRequest({ ...snaptradeRequest, path: '/api/v1/accounts' }).ok).toBe(true);
    expect(upstream.init.method).toBe('GET');
    expect(upstream.init.redirect).toBe('manual');
    expect(upstream.init.body).toBeUndefined();
    expect(Object.keys(upstream.init.headers as Record<string, string>).sort()).toEqual(['accept', 'signature', 'user-agent']);
  });

  it.each([
    [{ ...snaptradeRequest, provider: 'evil' }, 403],
    [{ ...snaptradeRequest, provider: '__proto__' }, 403],
    [{ ...snaptradeRequest, method: 'POST' }, 403],
    [{ ...snaptradeRequest, path: '/api/v1/snapTrade/deleteUser' }, 403],
    [{ ...snaptradeRequest, path: '/api/v1/accounts/../trade' }, 403],
    [{ ...snaptradeRequest, path: '/accounts/abc/trading/simple' }, 403],
    [{ ...snaptradeRequest, path: '/snapTrade/login' }, 403],
    [{ ...snaptradeRequest, path: '//evil.example/api/v1/accounts' }, 403],
    [{ ...snaptradeRequest, headers: { Cookie: 'a=b' } }, 403],
    [{ ...snaptradeRequest, headers: { Authorization: 'Bearer x' } }, 403],
    [{ ...snaptradeRequest, headers: { Signature: 'a\r\nX-Injected: 1' } }, 400],
    [{ ...snaptradeRequest, query: 'a=b#frag' }, 400],
    [{ ...snaptradeRequest, query: 'a=b c' }, 400],
    [{ ...snaptradeRequest, body: { trade: true } }, 400],
    [null, 400],
  ])('refuses %j', (payload, status) => {
    expect(buildUpstreamRequest(payload)).toMatchObject({ ok: false, status });
  });

  it('accepts read-only Solana balance calls and refuses anything else', () => {
    const call = { jsonrpc: '2.0', id: 1, method: 'getBalance', params: ['So1anaAddre55'] };
    expect(buildUpstreamRequest({ provider: 'solana', method: 'POST', path: '/', body: call }).ok).toBe(true);
    expect(buildUpstreamRequest({ provider: 'solana', method: 'POST', path: '/', body: { ...call, method: 'sendTransaction' } }).ok).toBe(false);
  });

  it('accepts OpenFIGI ISIN lookups only', () => {
    const jobs = [{ idType: 'ID_ISIN', idValue: 'IE00B4L5Y983' }];
    expect(buildUpstreamRequest({ provider: 'openfigi', method: 'POST', path: '/v3/mapping', body: jobs }).ok).toBe(true);
    expect(buildUpstreamRequest({ provider: 'openfigi', method: 'POST', path: '/v3/mapping', body: [{ idType: 'ID_ISIN', idValue: 'x', extra: 1 }] }).ok).toBe(false);
  });
});

describe('connector relay forwarding', () => {
  it('refuses a provider redirect instead of following it', async () => {
    const upstream = buildUpstreamRequest(snaptradeRequest);
    if (!upstream.ok) throw new Error('unexpected');
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://evil.example' } })) as unknown as typeof fetch;
    const result = await relayUpstream(upstream, { fetchImpl });
    expect(result.status).toBe(502);
  });

  it('caps the response size', async () => {
    const upstream = buildUpstreamRequest(snaptradeRequest);
    if (!upstream.ok) throw new Error('unexpected');
    const big = new Uint8Array(MAX_RELAY_RESPONSE_BYTES + 1);
    const fetchImpl = vi.fn(async () => new Response(big, { status: 200 })) as unknown as typeof fetch;
    expect((await relayUpstream(upstream, { fetchImpl })).status).toBe(502);
  });

  it('reports an unreachable provider without details', async () => {
    const upstream = buildUpstreamRequest(snaptradeRequest);
    if (!upstream.ok) throw new Error('unexpected');
    const fetchImpl = vi.fn(async () => { throw new Error('ECONNRESET secret-detail'); }) as unknown as typeof fetch;
    const result = await relayUpstream(upstream, { fetchImpl });
    expect(result.status).toBe(502);
    expect(result.body.toString()).not.toContain('secret-detail');
  });
});

describe('local relay entry point', () => {
  const handler = (fetchImpl: typeof fetch) =>
    createLocalConnectorRelayHandler({ isAllowedHost, isSameOrigin, clientHeader: CLIENT_HEADER, fetchImpl });
  const localHeaders = { host: 'localhost:3780', origin: 'http://localhost:3780', 'content-type': 'application/json', [CLIENT_HEADER]: '1' };

  it('forwards a same-origin request carrying the private header', async () => {
    const fetchImpl = okFetch();
    const { res, captured } = fakeRes();
    await handler(fetchImpl)(fakeReq(snaptradeRequest, localHeaders), res);
    expect(captured.status).toBe(200);
    expect(captured.headers['Cache-Control']).toBe('no-store');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it.each([
    [{ ...localHeaders, [CLIENT_HEADER]: '0' }],
    [{ ...localHeaders, origin: 'https://evil.example' }],
    [{ ...localHeaders, host: 'evil.example' }],
    [{ ...localHeaders, 'sec-fetch-site': 'cross-site' }],
  ])('refuses %j', async (headers) => {
    const fetchImpl = okFetch();
    const { res, captured } = fakeRes();
    await handler(fetchImpl)(fakeReq(snaptradeRequest, headers), res);
    expect(captured.status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a non-POST call', async () => {
    const { res, captured } = fakeRes();
    await handler(okFetch())(fakeReq(undefined, localHeaders, 'GET'), res);
    expect(captured.status).toBe(405);
  });
});

describe('hosted relay entry point', () => {
  const cloudHeaders = {
    host: 'app.glassfolio.dev',
    origin: 'https://app.glassfolio.dev',
    'sec-fetch-site': 'same-origin',
    'content-type': 'application/json',
    'x-glassfolio-relay': '1',
    authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.session-token-value',
  };

  it('requires a valid Supabase session', async () => {
    const verifySession = vi.fn(async () => ({ ok: false as const, status: 401 }));
    const fetchImpl = okFetch();
    const { res, captured } = fakeRes();
    await createCloudConnectorRelayHandler({ verifySession, rateLimiter: () => true, fetchImpl })(fakeReq(snaptradeRequest, cloudHeaders), res);
    expect(captured.status).toBe(401);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('forwards for a signed-in user under the limit, refuses beyond it', async () => {
    const verifySession = vi.fn(async () => ({ ok: true as const, userId: 'user-1' }));
    const rateLimiter = createRateLimiter({ limit: 1 });
    const relay = createCloudConnectorRelayHandler({ verifySession, rateLimiter, fetchImpl: okFetch() });
    const first = fakeRes();
    await relay(fakeReq(snaptradeRequest, cloudHeaders), first.res);
    expect(first.captured.status).toBe(200);
    const second = fakeRes();
    await relay(fakeReq(snaptradeRequest, cloudHeaders), second.res);
    expect(second.captured.status).toBe(429);
  });

  it('refuses a cross-site page even with a session', async () => {
    const verifySession = vi.fn(async () => ({ ok: true as const, userId: 'user-1' }));
    const { res, captured } = fakeRes();
    await createCloudConnectorRelayHandler({ verifySession, rateLimiter: () => true, fetchImpl: okFetch() })(
      fakeReq(snaptradeRequest, { ...cloudHeaders, origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }), res);
    expect(captured.status).toBe(403);
    expect(verifySession).not.toHaveBeenCalled();
  });

  it('verifies the session once and caches it', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"id":"user-1"}', { status: 200 })) as unknown as typeof fetch;
    const verify = createSupabaseSessionVerifier({ supabaseUrl: 'https://project.supabase.co', anonKey: 'anon', fetchImpl });
    expect(await verify(cloudHeaders.authorization)).toEqual({ ok: true, userId: 'user-1' });
    expect(await verify(cloudHeaders.authorization)).toEqual({ ok: true, userId: 'user-1' });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(await verify('Basic abc')).toEqual({ ok: false, status: 401 });
  });

  it('is unavailable when Supabase is not configured', async () => {
    const verify = createSupabaseSessionVerifier({ supabaseUrl: '', anonKey: '' });
    expect(await verify(cloudHeaders.authorization)).toEqual({ ok: false, status: 503 });
  });
});
