import { describe, it, expect } from 'vitest';
import { buildReadyMessage, waitUntilHealthy } from '../../../scripts/lib/dockerReady.mjs';

describe('docker:up ready message', () => {
  it('points to localhost on the configured port, never to 127.0.0.1', () => {
    const message = buildReadyMessage({ port: '3100', bind: '127.0.0.1' });
    expect(message).toContain('http://localhost:3100');
    expect(message).not.toContain('http://127.0.0.1');
    expect(message).toContain('up and healthy');
  });

  it('defaults to port 3000', () => {
    expect(buildReadyMessage()).toContain('http://localhost:3000');
  });

  it('reminds about the access token when exposed on the network', () => {
    expect(buildReadyMessage({ bind: '0.0.0.0', hasToken: true })).toContain('access token');
    expect(buildReadyMessage({ bind: '127.0.0.1' })).not.toContain('reachable on your network');
  });

  it('waits until the container reports healthy', async () => {
    const statuses = ['starting', 'starting', 'healthy'];
    const ok = await waitUntilHealthy({ inspect: () => statuses.shift() ?? 'healthy', sleep: async () => {}, intervalMs: 1, timeoutMs: 10 });
    expect(ok).toBe(true);
  });

  it('gives up on an unhealthy or unknown container', async () => {
    expect(await waitUntilHealthy({ inspect: () => 'unhealthy', sleep: async () => {} })).toBe(false);
    expect(await waitUntilHealthy({ inspect: () => { throw new Error('no such container'); }, sleep: async () => {}, intervalMs: 1, timeoutMs: 3 })).toBe(false);
  });
});
