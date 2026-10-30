#!/usr/bin/env node
import { spawn } from 'child_process';
import process from 'process';

const rawArgs = process.argv.slice(2);
const isOnline = rawArgs.some((arg) => arg === '--online' || arg === '--cloud');
// --demo (local mode): the app opens on the demo account; without it no demo is offered
const isDemo = rawArgs.includes('--demo');
const filteredArgs = rawArgs.filter((arg) => arg !== '--online' && arg !== '--cloud' && arg !== '--demo');

const deploymentMode = isOnline ? 'cloud' : (process.env.VITE_DEPLOYMENT_MODE || 'local');

console.log(`\n🚀 [GlassFolio Dev Server] Mode: ${deploymentMode.toUpperCase()} (${deploymentMode === 'cloud' ? 'Supabase / Online' : 'Offline-first / Local'})${isDemo ? ' — DEMO' : ''}\n`);

const env = {
  ...process.env,
  VITE_DEPLOYMENT_MODE: deploymentMode,
  VITE_APP_TARGET: process.env.VITE_APP_TARGET || 'unified',
  ...(isDemo ? { GLASSFOLIO_DEMO: '1' } : {}),
};

const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const child = spawn(npxCmd, ['vite', ...filteredArgs], {
  stdio: 'inherit',
  env,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
