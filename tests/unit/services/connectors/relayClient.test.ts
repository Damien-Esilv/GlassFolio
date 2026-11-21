import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mode = vi.hoisted(() => ({ value: 'local' as 'local' | 'cloud', token: 'session-token' as string | undefined }));

vi.mock('../../../../src/config/deployment', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../src/config/deployment')>();
  return { ...actual, getDeploymentMode: () => mode.value };
});

vi.mock('../../../../src/services/security/authService', () => ({
  authService: { getActiveAccessToken: async () => mode.token },
}));

import { relayFetch, relayJson, CONNECTOR_RELAY_URL } from '../../../../src/services/connectors/relayClient';
import { ConnectorError } from '../../../../src/services/connectors/types';

const request = { provider: 'snaptrade' as const, method: 'GET' as const, path: '/api/v1/accounts', query: 'clientId=x&timestamp=1' };

describe('relay client (TGLA-221)', () => {
  beforeEach(() => {
    mode.value = 'local';
    mode.token = 'session-token';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the request to the same-origin relay without a session in local mode', async () => {
    const fetchMock = vi.fn(async () => new Response('{"ok":1}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await relayJson(request)).toEqual({ ok: 1 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(CONNECTOR_RELAY_URL);
    expect(JSON.parse(init.body as string)).toEqual(request);
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('adds the Supabase session in cloud mode', async () => {
    mode.value = 'cloud';
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await relayFetch(request);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer session-token');
  });

  it('refuses to call the hosted relay without a session', async () => {
    mode.value = 'cloud';
    mode.token = undefined;
    vi.stubGlobal('fetch', vi.fn());
    await expect(relayFetch(request)).rejects.toMatchObject({ code: 'relay_unavailable' });
  });

  it.each([
    [401, 'auth_failed'],
    [429, 'rate_limited'],
    [502, 'relay_unavailable'],
    [500, 'invalid_response'],
  ])('maps HTTP %i to %s', async (status, code) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status })));
    await expect(relayFetch(request)).rejects.toMatchObject({ code });
  });

  it('reports a network failure as relay unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(relayFetch(request)).rejects.toBeInstanceOf(ConnectorError);
  });

  it('reports a non-JSON answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 200 })));
    await expect(relayJson(request)).rejects.toMatchObject({ code: 'invalid_response' });
  });
});
