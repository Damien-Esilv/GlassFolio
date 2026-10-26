#!/usr/bin/env node
/**
 * Writes the security headers of server/securityHeaders.mjs ('cloud' profile) into vercel.json
 * (Epic E31). `--check` only verifies and exits 1 when vercel.json is out of date.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSecurityHeaders } from '../server/securityHeaders.mjs';

const vercelPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'vercel.json');
const config = JSON.parse(readFileSync(vercelPath, 'utf8'));

const headers = Object.entries(buildSecurityHeaders('cloud')).map(([key, value]) => ({ key, value }));
const rules = (config.headers ?? []).filter((rule) => rule.source !== '/(.*)');
const next = { ...config, headers: [{ source: '/(.*)', headers }, ...rules] };
const serialized = `${JSON.stringify(next, null, 2)}\n`;

if (process.argv.includes('--check')) {
  if (readFileSync(vercelPath, 'utf8') !== serialized) {
    console.error('vercel.json security headers are out of date. Run: npm run security:headers');
    process.exit(1);
  }
  console.log('vercel.json security headers are in sync with server/securityHeaders.mjs');
} else {
  writeFileSync(vercelPath, serialized);
  console.log('vercel.json updated from server/securityHeaders.mjs');
}
