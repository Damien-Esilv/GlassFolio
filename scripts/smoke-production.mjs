#!/usr/bin/env node
/**
 * Post-deploy production smoke test (Epic E19 — TGLA-132).
 *
 * For every host: GET "/" must answer HTTP 200 + HTML, a non-existent path 200 on the app host
 * (SPA rewrite) and 404 on the public site, all with the security headers declared in vercel.json.
 *
 * Env:
 *   SMOKE_HOSTS     comma-separated base URLs (default: glassfolio.dev + app.glassfolio.dev)
 *   SMOKE_ATTEMPTS  attempts per host while the new deployment propagates (default 6)
 *   SMOKE_DELAY_MS  pause between attempts (default 10000)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  DEFAULT_SMOKE_HOSTS,
  DEEP_LINK_PATH,
  expectedHeadersFromVercelConfig,
  evaluateSmokeResponse,
  expectedDeepLinkStatus,
} from './lib/smokeChecks.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const expectedHeaders = expectedHeadersFromVercelConfig(
  JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')),
);

const hosts = (process.env.SMOKE_HOSTS ?? '')
  .split(',')
  .map((host) => {
    let clean = host.trim();
    while (clean.endsWith('/')) clean = clean.slice(0, -1);
    return clean;
  })
  .filter(Boolean);
const targets = hosts.length > 0 ? hosts : DEFAULT_SMOKE_HOSTS;
const attempts = Number(process.env.SMOKE_ATTEMPTS ?? 6);
const delayMs = Number(process.env.SMOKE_DELAY_MS ?? 10_000);

const probe = async (base, path) => {
  const res = await fetch(`${base}${path}`, { redirect: 'follow' });
  return { path, status: res.status, headers: Object.fromEntries(res.headers) };
};

const checkHost = async (base) => {
  let failures = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    failures = [];
    try {
      failures.push(...evaluateSmokeResponse(await probe(base, '/'), expectedHeaders));
      failures.push(...evaluateSmokeResponse(await probe(base, DEEP_LINK_PATH), expectedHeaders, expectedDeepLinkStatus(base)));
    } catch (error) {
      failures.push(`request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (failures.length === 0) return [];
    console.log(`[${base}] attempt ${attempt}/${attempts} failed (${failures.length} issue(s))`);
    if (attempt < attempts) await sleep(delayMs);
  }
  return failures;
};

let failed = false;
for (const base of targets) {
  const failures = await checkHost(base);
  if (failures.length === 0) {
    console.log(`✅ ${base} — HTTP 200, SPA fallback and ${Object.keys(expectedHeaders).length} security headers OK`);
    continue;
  }
  failed = true;
  for (const failure of failures) console.log(`::error title=Smoke test ${base}::${failure}`);
}

process.exit(failed ? 1 : 0);
