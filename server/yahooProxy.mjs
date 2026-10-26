/**
 * Same-origin Yahoo Finance proxy (`/yf/*`) for the self-hosted server.
 *
 * Yahoo does not send CORS headers, so the browser cannot call it directly. The app asks
 * `/yf/<path>` (see src/config/marketData.ts) and this module forwards allow-listed, read-only
 * endpoints. It is deliberately not a general proxy: GET only, fixed upstream host, fixed paths.
 */

export const YAHOO_PROXY_PREFIX = '/yf';
const UPSTREAM_ORIGIN = 'https://query1.finance.yahoo.com';
const UPSTREAM_TIMEOUT_MS = 10_000;
const MAX_QUERY_LENGTH = 512;

const ALLOWED_PATHS = [
  /^\/v1\/finance\/search$/,
  /^\/v8\/finance\/chart\/[A-Za-z0-9.^=%_-]{1,64}$/,
];

const UPSTREAM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; GlassFolio self-hosted)',
  Accept: 'application/json',
};

export const isYahooProxyPath = (pathname) =>
  pathname === YAHOO_PROXY_PREFIX || pathname.startsWith(`${YAHOO_PROXY_PREFIX}/`);

/**
 * Handles a `/yf/*` request. Always responds; callers only need to route on `isYahooProxyPath`.
 * `fetchImpl` is injectable for tests.
 */
export async function handleYahooProxy(req, res, url, { fetchImpl = fetch, securityHeaders = {} } = {}) {
  const send = (status, body, extra = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...securityHeaders, ...extra });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };

  if (req.method !== 'GET') {
    send(405, { error: 'Method not allowed' }, { Allow: 'GET' });
    return;
  }

  const upstreamPath = url.pathname.slice(YAHOO_PROXY_PREFIX.length);
  if (!ALLOWED_PATHS.some((pattern) => pattern.test(upstreamPath)) || url.search.length > MAX_QUERY_LENGTH) {
    send(404, { error: 'Unsupported market data endpoint' });
    return;
  }

  try {
    const upstream = await fetchImpl(`${UPSTREAM_ORIGIN}${upstreamPath}${url.search}`, {
      headers: UPSTREAM_HEADERS,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const body = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
      'Content-Length': body.length,
      'Cache-Control': 'private, max-age=30',
      ...securityHeaders,
    });
    res.end(body);
  } catch {
    send(502, { error: 'Market data provider unreachable' });
  }
}
