#!/usr/bin/env node
/** Last step of `npm run docker:up`: waits for the container to be healthy, then says where to open it. */
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnvFile } from './lib/dockerGuard.mjs';
import { buildReadyMessage, waitUntilHealthy } from './lib/dockerReady.mjs';

const CONTAINER = 'glassfolio-app';
const envFile = join(dirname(fileURLToPath(import.meta.url)), '..', 'docker', 'docker.env');
const defaults = existsSync(envFile) ? parseEnvFile(readFileSync(envFile, 'utf8')) : {};
const setting = (key) => process.env[key] ?? defaults[key];

console.log('\nWaiting for GlassFolio to be healthy…');
const healthy = await waitUntilHealthy({
  inspect: () => execFileSync('docker', ['inspect', '--format', '{{.State.Health.Status}}', CONTAINER], { encoding: 'utf8' }),
});

if (!healthy) {
  console.error('\n❌ GlassFolio did not become healthy. Check the logs with: npm run docker:logs\n');
  process.exit(1);
}

console.log(buildReadyMessage({
  port: setting('GLASSFOLIO_PORT'),
  bind: setting('GLASSFOLIO_BIND'),
  hasToken: Boolean(setting('GLASSFOLIO_ACCESS_TOKEN')),
}));
