#!/usr/bin/env node
/**
 * Self-hosted image smoke test (Epic E31 — TGLA-137).
 *
 * Builds docker/Dockerfile (unless --skip-build), starts it with the same hardening as
 * docker-compose.yml on a throw-away volume, then checks: health, SPA shell + deep link,
 * the Yahoo proxy allow-list, the vault API guards, and that written data survives a restart.
 *
 * Usage: node scripts/smoke-docker.mjs [--skip-build]
 * Env:   SMOKE_PORT (default: random free-ish port in 38000-38999)
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { buildDockerRunArgs, evaluateSpaShell, SMOKE_IMAGE } from './lib/dockerSmoke.mjs';

const skipBuild = process.argv.includes('--skip-build');
const suffix = randomBytes(4).toString('hex');
const name = `glassfolio-smoke-${suffix}`;
const volume = `glassfolio-smoke-data-${suffix}`;
const port = Number(process.env.SMOKE_PORT ?? 38000 + Math.floor(Math.random() * 1000));
const base = `http://127.0.0.1:${port}`;

const docker = (args, { allowFail = false } = {}) => {
  const result = spawnSync('docker', args, { encoding: 'utf8' });
  if (result.status !== 0 && !allowFail) {
    throw new Error(`docker ${args[0]} failed:\n${result.stderr || result.stdout}`);
  }
  return result;
};

const failures = [];
const check = (label, problems) => {
  const list = Array.isArray(problems) ? problems : problems ? [problems] : [];
  if (list.length === 0) console.log(`  ✓ ${label}`);
  else list.forEach((problem) => { failures.push(`${label}: ${problem}`); console.log(`  ✗ ${label}: ${problem}`); });
};

const get = async (path, init = {}) => {
  // The local vault API requires the app client header (server/localVault.mjs CLIENT_HEADER).
  const res = await fetch(`${base}${path}`, { ...init, headers: { 'X-GlassFolio-Local': '1', ...(init.headers ?? {}) } });
  return { path, status: res.status, contentType: res.headers.get('content-type') ?? '', headers: Object.fromEntries(res.headers), body: await res.text() };
};

const waitForHealth = async () => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) return;
    } catch { /* not listening yet */ }
    await sleep(500);
  }
  throw new Error(`container did not become healthy on ${base}/health`);
};

const jsonHeaders = { 'Content-Type': 'application/json' };
const batch = (payload, headers = {}) => get('/api/local-vault/batch', {
  method: 'POST',
  headers: { ...jsonHeaders, ...headers },
  body: JSON.stringify(payload),
});

const cleanup = () => {
  docker(['rm', '-f', name], { allowFail: true });
  docker(['volume', 'rm', '-f', volume], { allowFail: true });
};

try {
  if (!skipBuild) {
    console.log('Building image…');
    docker(['build', '-f', 'docker/Dockerfile', '-t', SMOKE_IMAGE, '.']);
  }
  console.log(`Starting ${name} on ${base}`);
  docker(buildDockerRunArgs({ name, port, volume }));
  await waitForHealth();

  const health = await get('/health');
  check('health endpoint', health.status === 200 && JSON.parse(health.body).status === 'healthy' ? [] : [`unexpected ${health.status} ${health.body}`]);

  const root = await get('/');
  check('serves the app shell', evaluateSpaShell(root));
  const stylesheet = root.body.match(/href="(\/assets\/[^"]+\.css)"/)?.[1];
  const css = stylesheet ? await get(stylesheet) : null;
  check(
    'ships the compiled stylesheet (no CDN)',
    css && css.status === 200 && css.contentType.includes('text/css') && css.body.includes('--bg-canvas') && !root.body.includes('cdn.tailwindcss.com')
      ? []
      : ['compiled CSS missing or still loading Tailwind from a CDN'],
  );
  const securityTxt = await get('/.well-known/security.txt');
  check(
    'publishes security.txt',
    securityTxt.status === 200 && /^Contact: mailto:/m.test(securityTxt.body) && /^Expires: /m.test(securityTxt.body)
      ? []
      : [`expected a security.txt with Contact and Expires, got ${securityTxt.status}`],
  );
  check(
    'requires Trusted Types for script sinks',
    String(root.headers['content-security-policy']).includes("require-trusted-types-for 'script'") ? [] : ['missing require-trusted-types-for in the CSP'],
  );
  const deepLink = await get('/portfolio');
  check('SPA deep link falls back to index.html', evaluateSpaShell(deepLink));

  const unlisted = await get('/yf/v7/finance/quote?symbols=AAPL');
  check('Yahoo proxy rejects non-allow-listed endpoints', unlisted.status === 404 ? [] : [`expected 404, got ${unlisted.status}`]);
  const wrongMethod = await get('/yf/v1/finance/search', { method: 'POST' });
  check('Yahoo proxy is GET-only', wrongMethod.status === 405 ? [] : [`expected 405, got ${wrongMethod.status}`]);

  const written = await batch({ set: { glassfolio_smoke_probe: 'ciphertext-probe' } });
  check('writes a vault record', written.status === 200 ? [] : [`expected 200, got ${written.status}: ${written.body}`]);
  const before = JSON.parse((await get('/api/local-vault')).body);
  check('reads the record back', before.records?.glassfolio_smoke_probe === 'ciphertext-probe' ? [] : ['record missing before restart']);

  const forbiddenKey = await batch({ set: { not_a_glassfolio_key: 'x' } });
  check('vault API rejects keys outside the allow-list', forbiddenKey.status === 400 ? [] : [`expected 400, got ${forbiddenKey.status}`]);
  const crossOrigin = await batch({ clear: true }, { Origin: 'https://evil.example' });
  check('vault API refuses cross-origin writes', crossOrigin.status === 403 ? [] : [`expected 403, got ${crossOrigin.status}`]);
  const stillThere = JSON.parse((await get('/api/local-vault')).body);
  check('refused writes did not touch the data', stillThere.records?.glassfolio_smoke_probe === 'ciphertext-probe' ? [] : ['record was modified by a refused request']);

  docker(['restart', name]);
  await waitForHealth();
  const after = JSON.parse((await get('/api/local-vault')).body);
  check('record survives a container restart', after.records?.glassfolio_smoke_probe === 'ciphertext-probe' ? [] : ['record lost after restart']);
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
  console.error(error);
} finally {
  cleanup();
}

if (failures.length > 0) {
  console.error(`\nDocker smoke test FAILED (${failures.length} issue(s)).`);
  process.exit(1);
}
console.log('\nDocker smoke test passed.');
