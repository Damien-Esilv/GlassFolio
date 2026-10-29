/**
 * Vite plugin exposing the local vault API in `npm run dev` / `vite preview` (Epic E33 — TGLA-138),
 * so development behaves like the Docker image: data is written to ./glassfolio-data on disk
 * instead of living in the browser. Active only in local deployment mode (the default).
 */

import path from 'node:path';
import { createLocalVaultHandler, createLocalVaultStore, isLocalVaultPath } from './localVault.mjs';
import { createAccessControl } from './accessControl.mjs';
import { buildSecurityHeaders } from './securityHeaders.mjs';
import { evaluateNetworkExposure } from './networkExposure.mjs';

export function localVaultPlugin({ dataDir } = {}) {
  const mode = (process.env.VITE_DEPLOYMENT_MODE || 'local').trim().toLowerCase();
  const name = 'glassfolio-local-vault';
  if (mode !== 'local') return { name };

  const resolvedDir = path.resolve(process.cwd(), dataDir || process.env.DATA_DIR || 'glassfolio-data');
  const token = process.env.GLASSFOLIO_ACCESS_TOKEN || process.env.ACCESS_TOKEN || '';
  const access = createAccessControl({ token });
  const securityHeaders = buildSecurityHeaders('local');
  let handler = null;

  // Same rule as `npm run docker:up`: the vault API must not be reachable from the network without a token.
  const assertSafeExposure = () => {
    for (const bind of [process.env.GLASSFOLIO_DEV_HOST, process.env.GLASSFOLIO_PREVIEW_HOST]) {
      if (bind === undefined) continue;
      const problem = evaluateNetworkExposure({ bind, token });
      if (problem) throw new Error(problem.replace('GLASSFOLIO_BIND', 'GLASSFOLIO_DEV_HOST / GLASSFOLIO_PREVIEW_HOST'));
    }
  };

  const attach = (server) => {
    assertSafeExposure();
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url || '/', 'http://localhost');
      if (!isLocalVaultPath(url.pathname)) {
        next();
        return;
      }
      if (access.enabled) {
        const ok = await access.authorize(req, res, securityHeaders);
        if (!ok) return;
      }
      handler ??= createLocalVaultHandler(createLocalVaultStore({ dataDir: resolvedDir }), {
        securityHeaders,
        allowedHosts: (process.env.ALLOWED_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean),
      });
      handler(req, res, url).catch(next);
    });
  };

  return { name, configureServer: attach, configurePreviewServer: attach };
}
