import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appStorage } from '../../../../src/services/storage/appStorage';
import * as deployment from '../../../../src/config/deployment';
import {
  STANDALONE_BRIDGE_URL,
  fetchOwnServerToken,
  getMcpBridgeSettings,
  normalizeBridgeUrl,
  resolveBridgeBaseUrl,
  saveMcpBridgeSettings,
  subscribeMcpBridgeSettings,
} from '../../../../src/services/mcpBridge/mcpBridgeSettings';

beforeEach(() => {
  appStorage.removeItem('gf_mcp_bridge');
  vi.restoreAllMocks();
});

describe('bridge address', () => {
  it('accepts only an address of this computer, as an origin', () => {
    expect(normalizeBridgeUrl('')).toBe('');
    expect(normalizeBridgeUrl('  http://127.0.0.1:47831/ ')).toBe('http://127.0.0.1:47831');
    expect(normalizeBridgeUrl('http://localhost:9/mcp')).toBe('http://localhost:9');
    expect(normalizeBridgeUrl('https://localhost:8443')).toBe('https://localhost:8443');
  });

  it.each(['https://evil.example', 'http://192.168.1.20:47831', 'http://127.0.0.1.evil.com', 'ftp://localhost', 'javascript:alert(1)', 'not a url', 'http://[::1]:1'])(
    'refuses %s, so a pasted address never sends the data elsewhere',
    (value) => expect(normalizeBridgeUrl(value)).toBeNull()
  );
});

describe('bridge settings of the device', () => {
  it('starts off, with no address and no token', () => {
    expect(getMcpBridgeSettings()).toEqual({ enabled: false, url: '', token: '' });
  });

  it('saves a part of the settings, trims the token and tells the subscribers', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeMcpBridgeSettings(listener);
    saveMcpBridgeSettings({ enabled: true });
    saveMcpBridgeSettings({ token: '  abc  ', url: 'http://127.0.0.1:47831/' });
    expect(getMcpBridgeSettings()).toEqual({ enabled: true, url: 'http://127.0.0.1:47831', token: 'abc' });
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    saveMcpBridgeSettings({ enabled: false });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('keeps the previous address when the new one is refused', () => {
    saveMcpBridgeSettings({ url: 'http://localhost:47831' });
    saveMcpBridgeSettings({ url: 'https://evil.example' });
    expect(getMcpBridgeSettings().url).toBe('http://localhost:47831');
  });

  it('returns the same object until something changes, as a React store needs', () => {
    saveMcpBridgeSettings({ enabled: true });
    expect(getMcpBridgeSettings()).toBe(getMcpBridgeSettings());
  });

  it('falls back to the defaults on a corrupt or hostile value', () => {
    appStorage.setItem('gf_mcp_bridge', '{not json');
    expect(getMcpBridgeSettings()).toEqual({ enabled: false, url: '', token: '' });
    appStorage.setItem('gf_mcp_bridge', JSON.stringify({ enabled: 'yes', url: 'https://evil.example', token: 5 }));
    expect(getMcpBridgeSettings()).toEqual({ enabled: false, url: '', token: '' });
  });

  it('uses the server of the app in local mode and the standalone bridge online', () => {
    vi.spyOn(deployment, 'getDeploymentMode').mockReturnValue('local');
    expect(resolveBridgeBaseUrl({ enabled: true, url: '', token: '' })).toBe('');
    vi.spyOn(deployment, 'getDeploymentMode').mockReturnValue('cloud');
    expect(resolveBridgeBaseUrl({ enabled: true, url: '', token: '' })).toBe(STANDALONE_BRIDGE_URL);
    expect(resolveBridgeBaseUrl({ enabled: true, url: 'http://localhost:1234', token: '' })).toBe('http://localhost:1234');
  });
});

describe('token of the server of the app', () => {
  const answer = (body: unknown, ok = true): typeof fetch => (async () => ({ ok, json: async () => body }) as Response) as typeof fetch;

  it('reads it from the same origin', async () => {
    expect(await fetchOwnServerToken(answer({ token: 'abc' }))).toBe('abc');
  });

  it('gives null when the server has no bridge, answers badly or cannot be reached', async () => {
    expect(await fetchOwnServerToken(answer({}, false))).toBeNull();
    expect(await fetchOwnServerToken(answer({ token: '' }))).toBeNull();
    expect(await fetchOwnServerToken(answer({ token: 5 }))).toBeNull();
    expect(await fetchOwnServerToken((async () => { throw new Error('down'); }) as unknown as typeof fetch)).toBeNull();
  });
});
