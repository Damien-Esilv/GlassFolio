/**
 * French banks through Woob (TGLA-236): the local server's side.
 *
 * The open GlassFolio tab calls `/api/woob/*` on its own origin; this module checks the caller (the
 * relay's guards: allowed Host, same origin, private client header) and hands the request to the Woob
 * worker (companions/woob), which talks to the bank. Two transports, one protocol:
 * - desktop app and `npm run dev`: the worker is a child process,
 *   started at the first request (`python -I -B -m glassfolio_woob worker`), one JSON request per line on stdin,
 *   one answer per line on stdout;
 * - Docker: the worker runs in its own container (profile `woob`), reached over HTTP with a shared token.
 *
 * Bank credentials pass through in memory only: never logged, never written. The worker's stderr is
 * dropped for the same reason (a bank module may print a page).
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export const WOOB_PATH_PREFIX = '/api/woob/';
export const MAX_WOOB_BODY_BYTES = 64 * 1024;

/** Command of each route, and how long the bank may take (an app validation waits for the user). */
const ROUTES = {
  'login': { command: 'login', timeoutMs: 180_000 },
  'login/answer': { command: 'answer', timeoutMs: 180_000 },
  'accounts': { command: 'accounts', timeoutMs: 180_000 },
  'holdings': { command: 'holdings', timeoutMs: 180_000 },
  'forget': { command: 'forget', timeoutMs: 15_000 },
  // Source of the bank modules (TGLA-241): download and check of Woob's latest modules take a while
  'modules': { command: 'modules', timeoutMs: 15_000 },
  'modules/set': { command: 'set_modules', timeoutMs: 300_000 },
  'modules/update': { command: 'update_modules', timeoutMs: 300_000 },
};
// The first status loads every bank module of Woob (well under a second, more on a slow disk)
const STATUS_TIMEOUT_MS = 60_000;

export const isWoobPath = (pathname) => typeof pathname === 'string' && pathname.startsWith(WOOB_PATH_PREFIX);

class WorkerUnavailable extends Error {}

/**
 * Where the worker is, in this order: the Docker container (GLASSFOLIO_WOOB_URL), the interpreter the
 * desktop app ships (GLASSFOLIO_WOOB_PYTHON), the development runtime (`npm run woob:setup`).
 * @param {{ env?: Record<string, string | undefined>, repoRoot?: string }} [options]
 * @returns {null | { kind: 'http', url: string, token: string, tokenFile?: string } | { kind: 'spawn', python: string, modules: string, sourceDir?: string }}
 */
export function resolveWoobRuntime({ env = process.env, repoRoot } = {}) {
  if (env.GLASSFOLIO_WOOB_URL) {
    return { kind: 'http', url: env.GLASSFOLIO_WOOB_URL.replace(/\/+$/, ''), token: env.GLASSFOLIO_WOOB_TOKEN || '', tokenFile: env.GLASSFOLIO_WOOB_TOKEN_FILE || '' };
  }
  if (env.GLASSFOLIO_WOOB_PYTHON && existsSync(env.GLASSFOLIO_WOOB_PYTHON)) {
    const modules = env.GLASSFOLIO_WOOB_MODULES || path.join(path.dirname(path.dirname(path.dirname(env.GLASSFOLIO_WOOB_PYTHON))), 'woob-modules');
    return { kind: 'spawn', python: env.GLASSFOLIO_WOOB_PYTHON, modules };
  }
  if (repoRoot) {
    const venv = path.join(repoRoot, '.woob-runtime', 'venv');
    const python = path.join(venv, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    // Development: the worker runs the repository's own code, which may change while the server runs
    if (existsSync(python)) {
      return { kind: 'spawn', python, modules: path.join(repoRoot, '.woob-runtime', 'woob-modules'), sourceDir: path.join(repoRoot, 'companions', 'woob', 'glassfolio_woob') };
    }
  }
  return null;
}

/** Latest change of the worker's Python files (development only): a new value means its code changed. */
export function sourceFingerprint(directory) {
  try {
    return String(Math.max(0, ...readdirSync(directory).filter(name => name.endsWith('.py')).map(name => statSync(path.join(directory, name)).mtimeMs)));
  } catch {
    return '';
  }
}

/** Environment of the worker: only what Python needs, never the server's own secrets. */
const workerEnv = (env, { modules, dataDir }) => {
  const kept = {};
  for (const name of ['PATH', 'HOME', 'USERPROFILE', 'SYSTEMROOT', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'TZ', 'SSL_CERT_FILE']) {
    if (env[name] !== undefined) kept[name] = env[name];
  }
  return { ...kept, GLASSFOLIO_WOOB_MODULES: modules, GLASSFOLIO_WOOB_DATA: dataDir, PYTHONDONTWRITEBYTECODE: '1', PYTHONIOENCODING: 'utf-8' };
};

/**
 * Child-process worker: started on first use, restarted after a crash, stopped with the server.
 * @param {{
 *   python: string,
 *   modules: string,
 *   sourceDir?: string,
 *   dataDir: string,
 *   env?: Record<string, string | undefined>,
 *   spawnImpl?: (command: string, args: string[], options: object) => import('node:child_process').ChildProcess,
 * }} options
 */
export function createSpawnWorker({ python, modules, dataDir, sourceDir, env = process.env, spawnImpl = spawn }) {
  let child = null;
  let startedOn = '';
  let buffer = '';
  let sequence = 0;
  const pending = new Map();

  const failAll = () => {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(new WorkerUnavailable('worker exited'));
    }
    pending.clear();
  };

  const start = () => {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    // -I: no user site, no PYTHON* variables; -B: never write bytecode (the desktop runtime is signed, read-only)
    const proc = spawnImpl(python, ['-I', '-B', '-m', 'glassfolio_woob', 'worker'], {
      env: workerEnv(env, { modules, dataDir }),
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true,
    });
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }
        const waiting = pending.get(message?.id);
        if (!waiting) continue;
        pending.delete(message.id);
        clearTimeout(waiting.timer);
        waiting.resolve(message);
      }
    });
    const onGone = () => {
      // A worker replaced on purpose (new code) exits after its successor started: its exit is not theirs
      if (child !== proc) return;
      child = null;
      buffer = '';
      failAll();
    };
    proc.once('exit', onGone);
    proc.once('error', onGone);
    proc.stdin.on('error', () => undefined);
    return proc;
  };

  return {
    kind: 'spawn',
    request(command, params, timeoutMs) {
      // Development: the worker's code changed since it started (a pull, an edit). Restart it once it is idle,
      // instead of answering with the old code until the server restarts. Bank sessions are saved on disk.
      if (child && sourceDir && pending.size === 0 && sourceFingerprint(sourceDir) !== startedOn) {
        child.kill();
        child = null;
      }
      if (!child) {
        startedOn = sourceDir ? sourceFingerprint(sourceDir) : '';
        child = start();
      }
      const id = `r${++sequence}`;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error('timeout'));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        child.stdin.write(`${JSON.stringify({ id, cmd: command, params })}\n`);
      });
    },
    stop() {
      child?.kill();
      child = null;
      failAll();
    },
  };
}

/**
 * HTTP worker (Docker container). The shared token is given, or read from the file the container writes
 * on its first start (a volume the GlassFolio server mounts read-only): it may appear after this server starts.
 * @param {{ url: string, token?: string, tokenFile?: string, fetchImpl?: typeof fetch, readFile?: (file: string) => string }} options
 */
export function createHttpWorker({ url, token = '', tokenFile = '', fetchImpl = fetch, readFile = (file) => readFileSync(file, 'utf8') }) {
  let sequence = 0;
  let secret = token;
  const currentToken = () => {
    if (!secret && tokenFile) {
      try {
        secret = readFile(tokenFile).trim();
      } catch {
        secret = '';
      }
    }
    return secret;
  };
  return {
    kind: 'http',
    async request(command, params, timeoutMs) {
      const token = currentToken();
      if (!token) throw new WorkerUnavailable('no token yet');
      let response;
      try {
        response = await fetchImpl(`${url}/rpc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: `h${++sequence}`, cmd: command, params }),
          signal: AbortSignal.timeout(timeoutMs),
          redirect: 'error',
        });
      } catch (error) {
        throw error?.name === 'TimeoutError' ? new Error('timeout') : new WorkerUnavailable('unreachable');
      }
      // The container made a new token (new volume): read the file again on the next call
      if (response.status === 401 && tokenFile) secret = '';
      if (!response.ok) throw new WorkerUnavailable(`status ${response.status}`);
      return response.json();
    },
    stop() {},
  };
}

export function createWoobWorker(runtime, { dataDir, env = process.env } = {}) {
  if (!runtime) return null;
  if (runtime.kind === 'http') return createHttpWorker(runtime);
  return createSpawnWorker({ python: runtime.python, modules: runtime.modules, sourceDir: runtime.sourceDir, dataDir, env });
}

const send = (res, status, body, securityHeaders) => {
  res.writeHead(status, {
    ...securityHeaders,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(body));
};

const failure = (code) => ({ ok: false, error: { code, message: '' } });

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_WOOB_BODY_BYTES) {
        reject(Object.assign(new Error('too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object expected');
        resolve(value);
      } catch {
        reject(Object.assign(new Error('invalid json'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

/**
 * `/api/woob/*` handler for the local server (Docker, desktop app, `npm run dev`).
 * @param {{
 *   worker: ReturnType<typeof createWoobWorker>,
 *   securityHeaders?: Record<string, string>,
 *   allowedHosts?: string[],
 *   isAllowedHost: (host: string | undefined, allowedHosts: string[]) => boolean,
 *   isSameOrigin: (req: import('node:http').IncomingMessage) => boolean,
 *   clientHeader: string,
 * }} options
 */
export function createLocalWoobHandler({ worker, securityHeaders = {}, allowedHosts = [], isAllowedHost, isSameOrigin, clientHeader }) {
  return async function handle(req, res, pathname) {
    const allowed = isAllowedHost(req.headers.host, allowedHosts) && isSameOrigin(req) && req.headers[clientHeader] === '1';
    if (!allowed) return send(res, 403, failure('forbidden'), securityHeaders);

    const route = pathname.slice(WOOB_PATH_PREFIX.length);
    if (route === 'status') {
      if (req.method !== 'GET') return send(res, 405, failure('method_not_allowed'), securityHeaders);
      if (!worker) return send(res, 200, { available: false }, securityHeaders);
      try {
        const answer = await worker.request('status', {}, STATUS_TIMEOUT_MS);
        return send(res, 200, answer?.ok ? { available: true, ...answer.result } : { available: false }, securityHeaders);
      } catch {
        return send(res, 200, { available: false }, securityHeaders);
      }
    }

    const spec = ROUTES[route];
    if (!spec) return send(res, 404, failure('not_found'), securityHeaders);
    if (req.method !== 'POST') return send(res, 405, failure('method_not_allowed'), securityHeaders);
    if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
      return send(res, 415, failure('invalid_request'), securityHeaders);
    }
    if (!worker) return send(res, 503, failure('companion_unavailable'), securityHeaders);

    let params;
    try {
      params = await readJsonBody(req);
    } catch (error) {
      return send(res, error.status || 400, failure('invalid_request'), securityHeaders);
    }
    try {
      const answer = await worker.request(spec.command, params, spec.timeoutMs);
      const body = answer?.ok ? { ok: true, result: answer.result } : { ok: false, error: answer?.error ?? { code: 'unknown', message: '' } };
      return send(res, 200, body, securityHeaders);
    } catch (error) {
      return send(res, 200, failure(error instanceof WorkerUnavailable ? 'companion_unavailable' : 'bank_timeout'), securityHeaders);
    }
  };
}
