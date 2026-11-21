/**
 * Connector relay for the hosted app (TGLA-221). Same allowlist and core as the Docker server
 * (server/connectorRelay.mjs); here the caller must hold a valid Supabase session and stays under a
 * per-user rate limit. Answers 404 on the showcase project, which shares this repository.
 *
 * Nothing is stored or logged: requests arrive as a JSON body (never secrets in the URL) and are
 * forwarded as signed by the browser.
 */
import {
  createCloudConnectorRelayHandler,
  createRateLimiter,
  createSupabaseSessionVerifier,
} from '../server/connectorRelay.mjs';
import { resolveVercelBuildTarget } from '../scripts/lib/vercelBuildTarget.mjs';

const isAppProject = () => {
  try {
    return resolveVercelBuildTarget(process.env) === 'app';
  } catch {
    return false;
  }
};

let handler = null;

const getHandler = () => {
  handler ??= createCloudConnectorRelayHandler({
    verifySession: createSupabaseSessionVerifier({
      supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
      anonKey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY,
    }),
    rateLimiter: createRateLimiter(),
  });
  return handler;
};

export default async function connectorRelay(request, response) {
  if (!isAppProject()) {
    response.statusCode = 404;
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.end('Not found');
    return;
  }
  await getHandler()(request, response);
}
