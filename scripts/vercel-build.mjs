#!/usr/bin/env node
/**
 * Build command of both Vercel projects (TGLA-193). `buildCommand` in vercel.json applies to the two
 * projects, so the target comes from the project running the build:
 *   showcase: Vite build, then static HTML for the public pages (scripts/prerender.mjs)
 *   app:      Vite build; index.html serves "/", app-shell.html the rewritten app routes
 */
import { execSync } from 'node:child_process';
import { copyFileSync } from 'node:fs';
import { resolveVercelBuildTarget } from './lib/vercelBuildTarget.mjs';

const target = resolveVercelBuildTarget(process.env);
const env = { ...process.env, VITE_DEPLOYMENT_MODE: 'cloud', VITE_APP_TARGET: target };
const run = (command) => execSync(command, { stdio: 'inherit', env });

console.log(`Vercel build target: ${target}`);
run('npx vite build');
if (target === 'showcase') {
  run('npx vite build --ssr src/entry-prerender.tsx --outDir .prerender');
  run('node scripts/prerender.mjs');
} else {
  copyFileSync('dist/index.html', 'dist/app-shell.html');
}
