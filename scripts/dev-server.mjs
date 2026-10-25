#!/usr/bin/env node
import { spawn } from 'child_process';
import process from 'process';

const rawArgs = process.argv.slice(2);
const isOnline = rawArgs.some((arg) => arg === '--online' || arg === '--cloud');
const filteredArgs = rawArgs.filter((arg) => arg !== '--online' && arg !== '--cloud');

const deploymentMode = isOnline ? 'cloud' : (process.env.VITE_DEPLOYMENT_MODE || 'local');

console.log(`\n🚀 [GlassFolio Dev Server] Mode: ${deploymentMode.toUpperCase()} (${deploymentMode === 'cloud' ? 'Supabase / Online' : 'Offline-first / Local'})\n`);

const env = {
  ...process.env,
  VITE_DEPLOYMENT_MODE: deploymentMode,
  VITE_APP_TARGET: process.env.VITE_APP_TARGET || 'unified',
};

const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const child = spawn(npxCmd, ['vite', ...filteredArgs], {
  stdio: 'inherit',
  env,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
