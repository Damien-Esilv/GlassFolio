/**
 * Optional access control for the self-hosted server (Epic E31).
 *
 * With GLASSFOLIO_ACCESS_TOKEN set, every page and API call (except /health) requires HTTP Basic
 * credentials: user `glassfolio`, password = the token. The browser shows its native prompt once,
 * then sends the credentials with every same-origin request, so the app needs no change.
 * Intended for exposing the container beyond 127.0.0.1; use TLS in front of it on untrusted
 * networks (Basic credentials are only base64 on plain HTTP).
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

export const ACCESS_USER = 'glassfolio';
export const MIN_TOKEN_LENGTH = 16;
const FAILURE_DELAY_MS = 750;

// Fixed-length MACs under a per-process random key make the comparison constant-time for any input
// length (nothing is stored or persisted: this is not password hashing).
const COMPARE_KEY = randomBytes(32);
const digest = (value) => createHmac('sha256', COMPARE_KEY).update(value).digest();
const safeEqual = (a, b) => timingSafeEqual(digest(a), digest(b));

/** @returns {string | null} an error message when the token is unusable, else null */
export const validateToken = (token) =>
  typeof token === 'string' && token.length >= MIN_TOKEN_LENGTH
    ? null
    : `GLASSFOLIO_ACCESS_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters`;

/**
 * Extracts `user:password` from a Basic Authorization header.
 * @param {string | undefined} header
 * @returns {{ user: string, password: string } | null}
 */
export function parseBasicAuth(header) {
  const match = /^Basic\s+([A-Za-z0-9+/=]+)$/i.exec(header ?? '');
  if (!match) return null;
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  if (separator < 0) return null;
  return { user: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
}

/**
 * @param {{ token?: string, failureDelayMs?: number }} options
 * @returns {{ enabled: boolean, authorize: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, headers?: Record<string, string>) => Promise<boolean> }}
 */
export function createAccessControl({ token = '', failureDelayMs = FAILURE_DELAY_MS } = {}) {
  if (!token) return { enabled: false, authorize: async () => true };
  const problem = validateToken(token);
  if (problem) throw new Error(problem);

  return {
    enabled: true,
    /** Resolves true when the request may proceed; otherwise it has already answered 401. */
    async authorize(req, res, headers = {}) {
      const credentials = parseBasicAuth(req.headers.authorization);
      // Both comparisons always run, so timing does not reveal which part was wrong.
      const userOk = safeEqual(credentials?.user ?? '', ACCESS_USER);
      const passwordOk = safeEqual(credentials?.password ?? '', token);
      if (credentials && userOk && passwordOk) return true;

      if (credentials) await sleep(failureDelayMs); // slows down guessing
      res.writeHead(401, {
        'Content-Type': 'text/plain; charset=utf-8',
        'WWW-Authenticate': 'Basic realm="GlassFolio", charset="UTF-8"',
        'Cache-Control': 'no-store',
        ...headers,
      });
      res.end('Authentication required');
      return false;
    },
  };
}
