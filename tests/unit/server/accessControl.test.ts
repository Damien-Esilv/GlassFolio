import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { ACCESS_USER, createAccessControl, parseBasicAuth, validateToken } from '../../../server/accessControl.mjs';
import { evaluateNetworkExposure, parseEnvFile } from '../../../scripts/lib/dockerGuard.mjs';

const TOKEN = 'a-long-enough-access-token';
const basic = (user: string, password: string): string => `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

describe('access control (E31 — network mode)', () => {
  it('validates the token length', () => {
    expect(validateToken('short')).toMatch(/at least 16/);
    expect(validateToken(TOKEN)).toBeNull();
    expect(() => createAccessControl({ token: 'short' })).toThrow(/at least 16/);
  });

  it('parses Basic credentials, passwords may contain colons', () => {
    expect(parseBasicAuth(basic('glassfolio', 'p:a:ss'))).toEqual({ user: 'glassfolio', password: 'p:a:ss' });
    expect(parseBasicAuth('Bearer abc')).toBeNull();
    expect(parseBasicAuth(undefined)).toBeNull();
    expect(parseBasicAuth('Basic !!!')).toBeNull();
  });

  it('is a no-op without a token', async () => {
    const access = createAccessControl({ token: '' });
    expect(access.enabled).toBe(false);
    await expect(access.authorize({} as never, {} as never)).resolves.toBe(true);
  });

  describe('over HTTP', () => {
    let server: http.Server;
    let port: number;

    beforeEach(async () => {
      const access = createAccessControl({ token: TOKEN, failureDelayMs: 1 });
      server = http.createServer(async (req, res) => {
        if (!(await access.authorize(req, res, { 'X-Test': '1' }))) return;
        res.writeHead(200);
        res.end('secret');
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      port = (server.address() as AddressInfo).port;
    });
    afterEach(async () => {
      await new Promise((resolve) => server.close(resolve));
    });

    const get = (authorization?: string) =>
      new Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
        http
          .get({ host: '127.0.0.1', port, headers: authorization ? { Authorization: authorization } : {} }, (res) => {
            let body = '';
            res.on('data', (c) => (body += c));
            res.on('end', () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
          })
          .on('error', reject);
      });

    it('asks for credentials when none are sent', async () => {
      const res = await get();
      expect(res.status).toBe(401);
      expect(res.headers['www-authenticate']).toMatch(/^Basic realm="GlassFolio"/);
      expect(res.headers['x-test']).toBe('1');
      expect(res.body).not.toContain('secret');
    });

    it('lets the right credentials through', async () => {
      const res = await get(basic(ACCESS_USER, TOKEN));
      expect(res.status).toBe(200);
      expect(res.body).toBe('secret');
    });

    it.each([
      ['wrong password', basic(ACCESS_USER, `${TOKEN}x`)],
      ['wrong user', basic('admin', TOKEN)],
      ['empty password', basic(ACCESS_USER, '')],
      ['bearer scheme', `Bearer ${TOKEN}`],
    ])('rejects %s', async (_label, header) => {
      const res = await get(header);
      expect(res.status).toBe(401);
      expect(res.body).not.toContain('secret');
    });
  });
});

describe('docker:up network guard (E31)', () => {
  it('accepts loopback binds without a token', () => {
    for (const bind of ['127.0.0.1', 'localhost', '::1', undefined]) expect(evaluateNetworkExposure({ bind })).toBeNull();
  });

  it('refuses a network bind without a strong token', () => {
    expect(evaluateNetworkExposure({ bind: '0.0.0.0' })).toMatch(/GLASSFOLIO_ACCESS_TOKEN/);
    expect(evaluateNetworkExposure({ bind: '192.168.1.5', token: 'short' })).not.toBeNull();
  });

  it('accepts a network bind with a long token', () => {
    expect(evaluateNetworkExposure({ bind: '0.0.0.0', token: TOKEN })).toBeNull();
  });

  it('parses env files, ignoring comments', () => {
    expect(parseEnvFile('# c\nGLASSFOLIO_PORT=3000\n  GLASSFOLIO_BIND = 127.0.0.1 \n#X=1\n')).toEqual({ GLASSFOLIO_PORT: '3000', GLASSFOLIO_BIND: '127.0.0.1' });
  });
});
