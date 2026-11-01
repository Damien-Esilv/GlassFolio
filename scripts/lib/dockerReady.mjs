/** Final message of `npm run docker:up`, once the container reports healthy. */

const LOOPBACK_BINDS = new Set(['', '127.0.0.1', 'localhost', '::1']);

/**
 * The address to open is always `localhost`: browsers give some features (passkeys, for instance)
 * to a domain name only, never to an IP address such as 127.0.0.1.
 * @param {{ port?: string, bind?: string, hasToken?: boolean }} options
 * @returns {string}
 */
export function buildReadyMessage({ port = '3000', bind = '127.0.0.1', hasToken = false } = {}) {
  const url = `http://localhost:${port || '3000'}`;
  const lines = [
    '',
    '✅ GlassFolio is up and healthy.',
    '',
    `   Open ${url} in your browser.`,
    '   Please use "localhost" rather than 127.0.0.1 to be sure that every feature works.',
  ];
  if (!LOOPBACK_BINDS.has(bind)) {
    lines.push(
      '',
      `   The container is reachable on your network (${bind}).`,
      hasToken
        ? '   Sign in with the user "glassfolio" and your access token.'
        : '   Warning: no access token is set.',
    );
  }
  lines.push('', '   Logs: npm run docker:logs   |   Stop: npm run docker:down', '');
  return lines.join('\n');
}

/**
 * Waits until `docker inspect` reports the container healthy.
 * @param {{ inspect: () => string, timeoutMs?: number, intervalMs?: number, sleep?: (ms: number) => Promise<void> }} options
 * @returns {Promise<boolean>}
 */
export async function waitUntilHealthy({
  inspect,
  timeoutMs = 90_000,
  intervalMs = 1_000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  for (let waited = 0; waited <= timeoutMs; waited += intervalMs) {
    let status = '';
    try {
      status = inspect().trim();
    } catch {
      /* the container may not be listed yet */
    }
    if (status === 'healthy') return true;
    if (status === 'unhealthy') return false;
    await sleep(intervalMs);
  }
  return false;
}
