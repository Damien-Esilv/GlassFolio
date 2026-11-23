/**
 * Woob bridge of the local server (TGLA-236): only the open tab of this very server reaches the worker;
 * requests and answers pass through untouched; a crash or a slow bank never hangs the server; the
 * worker never inherits the server's secrets.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, utimesSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createHttpWorker,
  createLocalWoobHandler,
  createSpawnWorker,
  isWoobPath,
  resolveWoobRuntime,
} from '../../../server/woobBridge.mjs';
import { CLIENT_HEADER, isAllowedHost, isSameOrigin } from '../../../server/localVault.mjs';

interface Captured { status: number; headers: Record<string, string>; body: string }

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
    end: (body: string) => {
      captured.body = body;
    },
  };
  return { res, captured, json: () => JSON.parse(captured.body) };
};

const FAKE_WORKER = path.resolve(__dirname, '../../fixtures/fakeWoobWorker.mjs');
const workers: Array<{ stop: () => void }> = [];

const fakeSpawnWorker = (overrides: { env?: NodeJS.ProcessEnv } = {}) => {
  const worker = createSpawnWorker({
    python: 'python3',
    modules: '/modules',
    dataDir: mkdtempSync(path.join(os.tmpdir(), 'woob-bridge-')),
    env: overrides.env ?? process.env,
    spawnImpl: (_command: string, _args: string[], options: object) => spawn(process.execPath, [FAKE_WORKER], options),
  });
  workers.push(worker);
  return worker;
};

const localHeaders = { host: 'localhost:3790', origin: 'http://localhost:3790', 'content-type': 'application/json', [CLIENT_HEADER]: '1' };
const handlerWith = (worker: unknown) =>
  createLocalWoobHandler({ worker: worker as never, isAllowedHost, isSameOrigin, clientHeader: CLIENT_HEADER });

afterEach(() => {
  while (workers.length) workers.pop()?.stop();
});

describe('development worker', () => {
  it('restarts with the new code once the worker\'s Python files change', async () => {
    // A worker started before a pull kept answering with the old code until the server restarted
    const source = mkdtempSync(path.join(os.tmpdir(), 'woob-source-'));
    const file = path.join(source, 'service.py');
    writeFileSync(file, '# v1');
    const spawned: number[] = [];
    const worker = createSpawnWorker({
      python: 'python3', modules: '/modules', sourceDir: source, dataDir: mkdtempSync(path.join(os.tmpdir(), 'woob-bridge-')),
      spawnImpl: (_command: string, _args: string[], options: object) => {
        const child = spawn(process.execPath, [FAKE_WORKER], options);
        spawned.push(child.pid ?? 0);
        return child;
      },
    });
    workers.push(worker);

    await worker.request('status', {}, 5_000);
    await worker.request('status', {}, 5_000);
    expect(spawned).toHaveLength(1);
    const later = new Date(Date.now() + 60_000);
    utimesSync(file, later, later);
    await worker.request('status', {}, 5_000);
    expect(spawned).toHaveLength(2);
  });
});

describe('Woob bridge routing', () => {
  it('owns /api/woob/* only', () => {
    expect(isWoobPath('/api/woob/holdings')).toBe(true);
    expect(isWoobPath('/api/woobly')).toBe(false);
    expect(isWoobPath('/api/connector-relay')).toBe(false);
  });

  it('finds the worker: Docker container, then the desktop interpreter, then the development runtime', () => {
    const repo = mkdtempSync(path.join(os.tmpdir(), 'woob-repo-'));
    expect(resolveWoobRuntime({ env: {}, repoRoot: repo })).toBeNull();

    const bin = path.join(repo, '.woob-runtime', 'venv', process.platform === 'win32' ? 'Scripts' : 'bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(path.join(bin, process.platform === 'win32' ? 'python.exe' : 'python'), '');
    expect(resolveWoobRuntime({ env: {}, repoRoot: repo })).toMatchObject({ kind: 'spawn', modules: path.join(repo, '.woob-runtime', 'woob-modules') });

    const shipped = path.join(repo, 'woob-runtime', 'python', 'bin', 'python3');
    mkdirSync(path.dirname(shipped), { recursive: true });
    writeFileSync(shipped, '');
    expect(resolveWoobRuntime({ env: { GLASSFOLIO_WOOB_PYTHON: shipped, GLASSFOLIO_WOOB_MODULES: '/m' }, repoRoot: repo }))
      .toEqual({ kind: 'spawn', python: shipped, modules: '/m' });

    expect(resolveWoobRuntime({ env: { GLASSFOLIO_WOOB_URL: 'http://woob:47832/', GLASSFOLIO_WOOB_TOKEN: 't' }, repoRoot: repo }))
      .toEqual({ kind: 'http', url: 'http://woob:47832', token: 't', tokenFile: '' });
  });
});

describe('Woob bridge guards', () => {
  it.each([
    [{ ...localHeaders, [CLIENT_HEADER]: '0' }],
    [{ ...localHeaders, origin: 'https://evil.example' }],
    [{ ...localHeaders, host: 'evil.example' }],
    [{ ...localHeaders, 'sec-fetch-site': 'cross-site' }],
  ])('refuses %j without reaching the worker', async (headers) => {
    const worker = { request: vi.fn() };
    const { res, captured } = fakeRes();
    await handlerWith(worker)(fakeReq({ key: 'k' }, headers), res, '/api/woob/holdings');
    expect(captured.status).toBe(403);
    expect(worker.request).not.toHaveBeenCalled();
  });

  it('refuses another method, an unknown route, a non-JSON or an oversized body', async () => {
    const worker = { request: vi.fn() };
    const calls: Array<[unknown, Record<string, string>, string, string?]> = [
      [{}, localHeaders, '/api/woob/holdings', 'GET'],
      [{}, localHeaders, '/api/woob/rm'],
      ['x', { ...localHeaders, 'content-type': 'text/plain' }, '/api/woob/holdings'],
      ['x'.repeat(70_000), localHeaders, '/api/woob/holdings'],
    ];
    const statuses: number[] = [];
    for (const [body, headers, route, method] of calls) {
      const { res, captured } = fakeRes();
      await handlerWith(worker)(fakeReq(body, headers, method), res, route);
      statuses.push(captured.status);
    }
    expect(statuses).toEqual([405, 404, 415, 413]);
    expect(worker.request).not.toHaveBeenCalled();
  });

  it('without a worker: status says unavailable, the other routes answer companion_unavailable', async () => {
    const status = fakeRes();
    await handlerWith(null)(fakeReq(undefined, localHeaders, 'GET'), status.res, '/api/woob/status');
    expect(status.json()).toEqual({ available: false });
    const sync = fakeRes();
    await handlerWith(null)(fakeReq({ key: 'k' }, localHeaders), sync.res, '/api/woob/holdings');
    expect(sync.captured.status).toBe(503);
    expect(sync.json().error.code).toBe('companion_unavailable');
  });
});

describe('Woob bridge with a worker process', () => {
  it('relays each route to its command, untouched, with no-store answers', async () => {
    const handler = handlerWith(fakeSpawnWorker());
    const { res, captured, json } = fakeRes();
    await handler(fakeReq({ key: 'conn-1', module: 'boursorama', credentials: { login: '1', password: 'p' } }, localHeaders), res, '/api/woob/login/answer');
    expect(captured.status).toBe(200);
    expect(captured.headers['Cache-Control']).toBe('no-store');
    expect(json()).toEqual({ ok: true, result: { cmd: 'answer', echo: { key: 'conn-1', module: 'boursorama', credentials: { login: '1', password: 'p' } } } });
  });

  it('maps the module source routes to their commands (TGLA-241)', async () => {
    const handler = handlerWith(fakeSpawnWorker());
    for (const [route, command] of [['modules', 'modules'], ['modules/set', 'set_modules'], ['modules/update', 'update_modules']]) {
      const { res, json } = fakeRes();
      await handler(fakeReq({ channel: 'latest' }, localHeaders), res, `/api/woob/${route}`);
      expect(json().result.cmd).toBe(command);
    }
  });

  it('passes worker errors through and reports status', async () => {
    const handler = handlerWith(fakeSpawnWorker());
    const sync = fakeRes();
    await handler(fakeReq({ key: 'reauth' }, localHeaders), sync.res, '/api/woob/holdings');
    expect(sync.json()).toEqual({ ok: false, error: { code: 'reauth_required', message: '' } });
    const status = fakeRes();
    await handler(fakeReq(undefined, localHeaders, 'GET'), status.res, '/api/woob/status');
    expect(status.json()).toMatchObject({ available: true, worker: 'fake' });
  });

  it('a crashed worker fails the request, then starts again', async () => {
    const handler = handlerWith(fakeSpawnWorker());
    const crashed = fakeRes();
    await handler(fakeReq({ key: 'crash' }, localHeaders), crashed.res, '/api/woob/holdings');
    expect(crashed.json().error.code).toBe('companion_unavailable');
    const next = fakeRes();
    await handler(fakeReq({ key: 'conn-1' }, localHeaders), next.res, '/api/woob/holdings');
    expect(next.json().ok).toBe(true);
  });

  it('a request the bank never answers times out without blocking the others', async () => {
    const worker = fakeSpawnWorker();
    await expect(worker.request('holdings', { key: 'slow' }, 200)).rejects.toThrow('timeout');
    await expect(worker.request('holdings', { key: 'conn-1' }, 5_000)).resolves.toMatchObject({ ok: true });
  });

  it('the worker never inherits the server secrets', async () => {
    const worker = fakeSpawnWorker({ env: { ...process.env, ACCESS_TOKEN: 'server-secret', GLASSFOLIO_ACCESS_TOKEN: 'x', UPDATE_SIGNING_KEY: 'k' } });
    const answer = await worker.request('holdings', { key: 'env' }, 5_000);
    const env: string[] = answer.result.env;
    expect(env).toEqual(expect.arrayContaining(['GLASSFOLIO_WOOB_MODULES', 'GLASSFOLIO_WOOB_DATA']));
    expect(env).not.toContain('ACCESS_TOKEN');
    expect(env).not.toContain('GLASSFOLIO_ACCESS_TOKEN');
    expect(env).not.toContain('UPDATE_SIGNING_KEY');
  });
});

describe('Woob bridge over HTTP (Docker container)', () => {
  it('sends the shared token and maps an unreachable container to companion_unavailable', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: 'h1', ok: true, result: { a: 1 } }), { status: 200 }));
    const worker = createHttpWorker({ url: 'http://woob:47832', token: 'tok', fetchImpl });
    await expect(worker.request('status', {}, 1_000)).resolves.toMatchObject({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://woob:47832/rpc');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');

    const down = createHttpWorker({ url: 'http://woob:47832', token: 'tok', fetchImpl: vi.fn(async () => { throw new TypeError('fetch failed'); }) });
    const handler = handlerWith(down);
    const { res, json } = fakeRes();
    await handler(fakeReq({ key: 'k' }, localHeaders), res, '/api/woob/holdings');
    expect(json().error.code).toBe('companion_unavailable');
  });
});

const devPython = path.resolve(__dirname, '../../../.woob-runtime/venv/bin/python');

describe.skipIf(!existsSync(devPython))('real worker (npm run woob:setup)', () => {
  it('answers status with the pinned Woob commit and the supported banks', async () => {
    const runtime = resolveWoobRuntime({ env: {}, repoRoot: path.resolve(__dirname, '../../..') });
    const worker = createSpawnWorker({ ...(runtime as { python: string; modules: string }), dataDir: mkdtempSync(path.join(os.tmpdir(), 'woob-real-')) });
    workers.push(worker);
    const answer = await worker.request('status', {}, 30_000);
    expect(answer.result.commit).toBe('49f267fe1d3890d994ed511acac3d77dcd884e60');
    // Every bank module of Woob that loads here, each with its form (TGLA-240)
    const modules = answer.result.banks.map((bank: { module: string }) => bank.module);
    expect(modules).toEqual(expect.arrayContaining(['boursorama', 'cragr', 'creditmutuel', 'bp']));
    expect(modules.length).toBeGreaterThan(80);
    const refused = await worker.request('holdings', { key: 'conn-1', module: 'notabank', credentials: {} }, 30_000);
    expect(refused.error.code).toBe('unsupported_bank');
  }, 40_000);
});

describe('Woob bridge token file (Docker)', () => {
  it('reads the token the container writes on its first start, and again after a refusal', async () => {
    let content = '';
    const readFile = vi.fn(() => {
      if (!content) throw new Error('ENOENT');
      return `${content}\n`;
    });
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string>).Authorization;
      return new Response(JSON.stringify({ ok: auth === 'Bearer second' }), { status: auth === 'Bearer second' ? 200 : 401 });
    });
    const worker = createHttpWorker({ url: 'http://woob:47832', tokenFile: '/run/glassfolio-token/token', fetchImpl, readFile });

    await expect(worker.request('status', {}, 1_000)).rejects.toThrow('no token yet');
    content = 'first';
    await expect(worker.request('status', {}, 1_000)).rejects.toThrow('status 401');
    content = 'second';
    await expect(worker.request('status', {}, 1_000)).resolves.toEqual({ ok: true });
  });
});

