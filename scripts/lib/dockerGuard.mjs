/** Pre-flight rules for `npm run docker:up` (Epic E31). */

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/**
 * Exposing the port beyond the machine without an access token would let anyone on the network
 * read or erase the vault records, so it is refused.
 * @param {{ bind?: string, token?: string }} env
 * @returns {string | null} an error message, or null when the setup is acceptable
 */
export function evaluateNetworkExposure({ bind = '127.0.0.1', token = '' } = {}) {
  if (LOOPBACK.has(bind.trim().toLowerCase())) return null;
  if (token.length >= 16) return null;
  return [
    `GLASSFOLIO_BIND=${bind} exposes GlassFolio beyond this machine.`,
    'Set GLASSFOLIO_ACCESS_TOKEN (at least 16 characters, e.g. `openssl rand -hex 16`) to require a login,',
    'or keep GLASSFOLIO_BIND=127.0.0.1. Put a TLS reverse proxy in front on untrusted networks.',
  ].join('\n');
}

/** Parses simple KEY=VALUE lines (comments and blank lines ignored). */
export function parseEnvFile(text) {
  const values = {};
  for (const line of text.split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match && !line.trim().startsWith('#')) values[match[1]] = match[2];
  }
  return values;
}
