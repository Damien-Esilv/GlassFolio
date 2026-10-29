/**
 * Browser security headers, single source of truth (Epic E31 — TGLA-127/141).
 *
 * Used by the Docker server directly and written into vercel.json by `npm run security:headers`
 * (a unit test fails if vercel.json drifts). The Content-Security-Policy is deliberately strict:
 * the app ships no third-party script (Tailwind is compiled at build time), so `script-src` is
 * 'self' only. The one relaxation is `style-src 'unsafe-inline'`, needed by React/Recharts inline
 * `style=""` attributes; it cannot execute code.
 *
 * To call a new external API, add its origin to the matching list below (a test scans src/ for
 * API hosts and fails if one is missing), then run `npm run security:headers`.
 */

/** Hosted AI providers the user may configure with their own key (BYOK), plus market data. */
export const AI_AND_MARKET_ORIGINS = Object.freeze([
  'https://api.openai.com',
  'https://api.anthropic.com',
  'https://api.groq.com',
  'https://openrouter.ai',
  'https://generativelanguage.googleapis.com',
  'https://api.coingecko.com',
]);

/**
 * Trusted Types policies the client registers (src/services/security/trustedTypes.ts). Any other
 * policy name, and any raw string reaching an HTML/script sink, is refused by the browser.
 * A test keeps this list and the client code in sync.
 */
export const TRUSTED_TYPES_POLICIES = Object.freeze(['glassfolio-qr', 'default']);

/**
 * Local AI (Ollama) runs on the user's machine, whatever the port. (`http://[::1]:*` is not a valid
 * CSP source in browsers, so IPv6 loopback is intentionally absent.)
 */
export const LOCAL_AI_ORIGINS = Object.freeze(['http://localhost:*', 'http://127.0.0.1:*']);

export const CSP_PROFILES = Object.freeze({
  /** Self-hosted Docker image / `npm run dev`: market data goes through the same-origin /yf proxy. */
  local: Object.freeze({
    scriptSrc: Object.freeze(["'self'"]),
    connectSrc: Object.freeze(["'self'", ...AI_AND_MARKET_ORIGINS, ...LOCAL_AI_ORIGINS]),
    imgSrc: Object.freeze(["'self'", 'data:', 'blob:']),
    frameSrc: Object.freeze(["'none'"]),
  }),
  /** Vercel deployment (glassfolio.dev, app.glassfolio.dev): Supabase auth + direct Yahoo quotes + Cloudflare Turnstile anti-bot. */
  cloud: Object.freeze({
    scriptSrc: Object.freeze(["'self'", 'https://challenges.cloudflare.com']),
    connectSrc: Object.freeze([
      "'self'",
      'https://*.supabase.co',
      'https://query1.finance.yahoo.com',
      'https://challenges.cloudflare.com',
      'https://www.googleapis.com',
      ...AI_AND_MARKET_ORIGINS,
      ...LOCAL_AI_ORIGINS,
    ]),
    // Google OAuth profile pictures
    imgSrc: Object.freeze(["'self'", 'data:', 'blob:', 'https://*.googleusercontent.com']),
    frameSrc: Object.freeze(['https://challenges.cloudflare.com']),
  }),
});

/**
 * @param {'local' | 'cloud'} profile
 * @param {{ extraConnectSrc?: string[] }} [options] extra origins for self-hosters (e.g. a remote Ollama)
 * @returns {string}
 */
export function buildContentSecurityPolicy(profile, { extraConnectSrc = [] } = {}) {
  const { connectSrc, imgSrc, scriptSrc = ["'self'"], frameSrc = ["'none'"] } = CSP_PROFILES[profile];
  const directives = [
    ["default-src", ["'self'"]],
    ["script-src", scriptSrc],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", imgSrc],
    ["font-src", ["'self'", 'data:']],
    ["connect-src", [...connectSrc, ...extraConnectSrc]],
    ["worker-src", ["'self'", 'blob:']],
    ["manifest-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["frame-src", frameSrc],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
    ["require-trusted-types-for", ["'script'"]],
    ["trusted-types", [...TRUSTED_TYPES_POLICIES]],
  ];
  return directives.map(([name, values]) => `${name} ${values.join(' ')}`).join('; ');
}

const PERMISSIONS_POLICY = [
  'camera=()', 'microphone=()', 'geolocation=()', 'payment=()', 'usb=()', 'serial=()', 'bluetooth=()',
  'accelerometer=()', 'gyroscope=()', 'magnetometer=()', 'browsing-topics=()',
].join(', ');

/**
 * Headers for every response. `X-XSS-Protection: 0` follows OWASP (the legacy auditor can itself
 * introduce vulnerabilities); framing is refused twice (CSP frame-ancestors + X-Frame-Options).
 * @param {'local' | 'cloud'} profile
 * @param {{ extraConnectSrc?: string[] }} [options]
 * @returns {Record<string, string>}
 */
export function buildSecurityHeaders(profile, options = {}) {
  /** @type {Record<string, string>} */
  const headers = {
    'Content-Security-Policy': buildContentSecurityPolicy(profile, options),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': PERMISSIONS_POLICY,
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
  // Two years, subdomains included (glassfolio.dev, www, app are all HTTPS-only). Deliberately no
  // `preload`: submission to the browsers' preload lists is practically irreversible.
  if (profile === 'cloud') headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains';
  return headers;
}
