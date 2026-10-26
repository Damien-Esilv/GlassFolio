#!/usr/bin/env node
/** Refuses `npm run docker:up` when the container would be reachable without an access token. */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateNetworkExposure, parseEnvFile } from './lib/dockerGuard.mjs';

const envFile = join(dirname(fileURLToPath(import.meta.url)), '..', 'docker', 'docker.env');
const defaults = existsSync(envFile) ? parseEnvFile(readFileSync(envFile, 'utf8')) : {};
const bind = process.env.GLASSFOLIO_BIND ?? defaults.GLASSFOLIO_BIND;
const token = process.env.GLASSFOLIO_ACCESS_TOKEN ?? defaults.GLASSFOLIO_ACCESS_TOKEN ?? '';

const problem = evaluateNetworkExposure({ bind, token });
if (problem) {
  console.error(`\n${problem}\n`);
  process.exit(1);
}
