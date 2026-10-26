/**
 * Vite plugin exposing the local vault API in `npm run dev` / `vite preview` (Epic E33 — TGLA-138),
 * so development behaves like the Docker image: data is written to ./glassfolio-data on disk
 * instead of living in the browser. Active only in local deployment mode (the default).
 */

import path from 'node:path';
import { createLocalVaultHandler, createLocalVaultStore, isLocalVaultPath } from './localVault.mjs';

export function localVaultPlugin({ dataDir } = {}) {
  const mode = (process.env.VITE_DEPLOYMENT_MODE || 'local').trim().toLowerCase();
  const name = 'glassfolio-local-vault';
  if (mode !== 'local') return { name };

  const resolvedDir = path.resolve(process.cwd(), dataDir || process.env.DATA_DIR || 'glassfolio-data');
  let handler = null;

  const attach = (server) => {
    server.middlewares.use((req, res, next) => {
      const url = new URL(req.url || '/', 'http://localhost');
      if (!isLocalVaultPath(url.pathname)) {
        next();
        return;
      }
      handler ??= createLocalVaultHandler(createLocalVaultStore({ dataDir: resolvedDir }), {
        allowedHosts: (process.env.ALLOWED_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean),
      });
      handler(req, res, url).catch(next);
    });
  };

  return { name, configureServer: attach, configurePreviewServer: attach };
}
