import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import {
  createLocalVaultHandler,
  createLocalVaultStore,
  isAllowedHost,
  isLocalVaultPath,
  KEY_PATTERN,
  validateBatch,
} from '../../../server/localVault.mjs';

const silentLogger = { warn: () => undefined, error: () => undefined, log: () => undefined } as unknown as Pick<Console, 'warn' | 'error' | 'log'>;

describe('local vault store (E33 — TGLA-138)', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-vault-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('starts empty and persists batches atomically across restarts', () => {
    const store = createLocalVaultStore({ dataDir: dir, logger: silentLogger });
    expect(store.snapshot().records).toEqual({});

    store.apply({ set: { glassfolio_user: 'cipher-1', gf_vault_header: '{"v":1}' } });
    const second = createLocalVaultStore({ dataDir: dir, logger: silentLogger });
    expect(second.snapshot().records).toEqual({ glassfolio_user: 'cipher-1', gf_vault_header: '{"v":1}' });
    expect(second.snapshot().revision).toBe(1);
    expect(fs.existsSync(path.join(dir, 'vault-store.json.tmp'))).toBe(false);
  });

  it('applies clear, then remove, then set in a single revision', () => {
    const store = createLocalVaultStore({ dataDir: dir, logger: silentLogger });
    store.apply({ set: { glassfolio_a: '1', glassfolio_b: '2' } });
    const { revision } = store.apply({ clear: true, set: { glassfolio_c: '3' }, remove: ['glassfolio_c'] });
    expect(revision).toBe(2);
    // remove runs before set, so the key written in the same batch survives
    expect(store.snapshot().records).toEqual({ glassfolio_c: '3' });
  });

  it('keeps a backup of the previous state and recovers from a corrupted file', () => {
    const store = createLocalVaultStore({ dataDir: dir, logger: silentLogger });
    store.apply({ set: { glassfolio_a: 'first' } });
    store.apply({ set: { glassfolio_a: 'second' } });
    fs.writeFileSync(path.join(dir, 'vault-store.json'), '{ not json');

    const recovered = createLocalVaultStore({ dataDir: dir, logger: silentLogger });
    expect(recovered.snapshot().records).toEqual({ glassfolio_a: 'first' });
    expect(fs.readdirSync(dir).some((f) => f.startsWith('vault-store.json.corrupt-'))).toBe(true);
  });

  it('starts empty (and quarantines the file) when neither file is readable', () => {
    fs.writeFileSync(path.join(dir, 'vault-store.json'), 'garbage');
    const store = createLocalVaultStore({ dataDir: dir, logger: silentLogger });
    expect(store.snapshot().records).toEqual({});
    expect(fs.readdirSync(dir).some((f) => f.includes('.corrupt-'))).toBe(true);
  });

  it('reads the legacy { records } format', () => {
    fs.writeFileSync(path.join(dir, 'vault-store.json'), JSON.stringify({ records: { glassfolio_old: 'x' } }));
    const store = createLocalVaultStore({ dataDir: dir, logger: silentLogger });
    expect(store.snapshot()).toMatchObject({ schema: 1, revision: 0, records: { glassfolio_old: 'x' } });
  });

  it('leaves the state untouched when the disk write fails', () => {
    const store = createLocalVaultStore({ dataDir: dir, logger: silentLogger });
    store.apply({ set: { glassfolio_a: 'kept' } });
    fs.rmSync(dir, { recursive: true, force: true });
    fs.writeFileSync(dir, 'a file where the directory used to be');
    expect(() => store.apply({ set: { glassfolio_a: 'lost' } })).toThrow();
    expect(store.snapshot().records).toEqual({ glassfolio_a: 'kept' });
  });
});

describe('local vault validation (E33 — TGLA-138)', () => {
  it.each(['glassfolio_user', 'glassfolio_ai_chats_v1', 'gf_vault_header', 'gf_totp_enrolled', 'gf_manual_price_history'])(
    'accepts the key %s',
    (key) => expect(KEY_PATTERN.test(key)).toBe(true),
  );

  it.each(['gf_consent_v1', 'gf_public_theme', '__proto__', 'glassfolio_', 'Glassfolio_x', '../glassfolio_x', 'other'])(
    'rejects the key %s',
    (key) => expect(KEY_PATTERN.test(key)).toBe(false),
  );

  it('validates batch shapes', () => {
    expect(validateBatch({ set: { glassfolio_a: 'x' }, remove: ['glassfolio_b'], clear: false })).toBeNull();
    expect(validateBatch(null)).toMatch(/object/);
    expect(validateBatch([])).toMatch(/object/);
    expect(validateBatch({ clear: 'yes' })).toMatch(/boolean/);
    expect(validateBatch({ remove: 'glassfolio_a' })).toMatch(/array/);
    expect(validateBatch({ remove: ['evil'] })).toMatch(/not allowed/);
    expect(validateBatch({ set: { evil: 'x' } })).toMatch(/not allowed/);
    expect(validateBatch({ set: { glassfolio_a: 1 } })).toMatch(/string/);
    expect(validateBatch({ set: { glassfolio_a: 'x'.repeat(5 * 1024 * 1024 + 1) } })).toMatch(/too large/);
  });

  it('recognises the API paths', () => {
    expect(isLocalVaultPath('/api/local-vault')).toBe(true);
    expect(isLocalVaultPath('/api/local-vault/batch')).toBe(true);
    expect(isLocalVaultPath('/api/local-vaultx')).toBe(false);
  });

  it('only allows localhost, IP literals and listed hosts (DNS-rebinding guard)', () => {
    expect(isAllowedHost('localhost:3000')).toBe(true);
    expect(isAllowedHost('127.0.0.1:8080')).toBe(true);
    expect(isAllowedHost('192.168.1.20')).toBe(true);
    expect(isAllowedHost('[::1]:3000')).toBe(true);
    expect(isAllowedHost('evil.example.com')).toBe(false);
    expect(isAllowedHost('glassfolio.home', ['glassfolio.home'])).toBe(true);
    expect(isAllowedHost(undefined)).toBe(false);
  });
});

describe('local vault HTTP API (E33 — TGLA-138)', () => {
  let dir: string;
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-vault-http-'));
    const store = createLocalVaultStore({ dataDir: dir, logger: silentLogger });
    const handle = createLocalVaultHandler(store, { logger: silentLogger });
    server = http.createServer((req, res) => {
      void handle(req, res, new URL(req.url ?? '/', 'http://localhost'));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const call = (method: string, urlPath: string, opts: { headers?: Record<string, string>; body?: string; noClientHeader?: boolean } = {}) =>
    new Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
      const clientHeader: Record<string, string> = opts.noClientHeader ? {} : { 'X-GlassFolio-Local': '1' };
      const req = http.request(
        { host: '127.0.0.1', port, method, path: urlPath, headers: { ...clientHeader, ...opts.headers } },
        (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
        },
      );
      req.on('error', reject);
      if (opts.body !== undefined) req.write(opts.body);
      req.end();
    });

  const json = { 'Content-Type': 'application/json' };

  it('round-trips a batch through POST /batch and GET', async () => {
    const post = await call('POST', '/api/local-vault/batch', {
      headers: json,
      body: JSON.stringify({ set: { glassfolio_user: 'cipher' } }),
    });
    expect(post.status).toBe(200);
    expect(JSON.parse(post.body)).toEqual({ ok: true, revision: 1 });

    const get = await call('GET', '/api/local-vault');
    expect(get.status).toBe(200);
    expect(get.headers['cache-control']).toBe('no-store');
    expect(JSON.parse(get.body).records).toEqual({ glassfolio_user: 'cipher' });
  });

  it('tells the page whether it was started for the demo (off by default)', async () => {
    const config = await call('GET', '/api/local-vault/config');
    expect(config.status).toBe(200);
    expect(JSON.parse(config.body)).toEqual({ demo: false });
  });

  it('refuses requests without the app client header (second CSRF barrier)', async () => {
    const read = await call('GET', '/api/local-vault', { noClientHeader: true });
    expect(read.status).toBe(403);
    const write = await call('POST', '/api/local-vault/batch', {
      noClientHeader: true,
      headers: json,
      body: JSON.stringify({ clear: true }),
    });
    expect(write.status).toBe(403);
    // Nothing was changed by the refused write.
    expect(JSON.parse((await call('GET', '/api/local-vault')).body).revision).toBe(0);
  });

  it('refuses cross-site and cross-origin requests', async () => {
    const crossSite = await call('GET', '/api/local-vault', { headers: { 'Sec-Fetch-Site': 'cross-site' } });
    expect(crossSite.status).toBe(403);
    const foreignOrigin = await call('POST', '/api/local-vault/batch', {
      headers: { ...json, Origin: 'https://evil.example' },
      body: '{}',
    });
    expect(foreignOrigin.status).toBe(403);
    const sameOrigin = await call('GET', '/api/local-vault', {
      headers: { 'Sec-Fetch-Site': 'same-origin', Origin: `http://127.0.0.1:${port}` },
    });
    expect(sameOrigin.status).toBe(200);
  });

  it('refuses a rebound hostname', async () => {
    const res = await call('GET', '/api/local-vault', { headers: { Host: 'evil.example.com' } });
    expect(res.status).toBe(403);
  });

  it('rejects non-JSON content types, bad JSON, bad keys and bad methods', async () => {
    expect((await call('POST', '/api/local-vault/batch', { headers: { 'Content-Type': 'text/plain' }, body: '{}' })).status).toBe(415);
    expect((await call('POST', '/api/local-vault/batch', { headers: json, body: '{oops' })).status).toBe(400);
    expect((await call('POST', '/api/local-vault/batch', { headers: json, body: JSON.stringify({ set: { evil: 'x' } }) })).status).toBe(400);
    expect((await call('PUT', '/api/local-vault', { headers: json, body: '{}' })).status).toBe(405);
    expect((await call('GET', '/api/local-vault/batch')).status).toBe(405);
    expect((await call('GET', '/api/local-vault/unknown')).status).toBe(404);
  });

  it('answers 413 for an oversized body', async () => {
    const huge = JSON.stringify({ set: { glassfolio_a: 'x'.repeat(21 * 1024 * 1024) } });
    const res = await call('POST', '/api/local-vault/batch', { headers: json, body: huge }).catch(() => ({ status: 413 }));
    expect(res.status).toBe(413);
  });
});
