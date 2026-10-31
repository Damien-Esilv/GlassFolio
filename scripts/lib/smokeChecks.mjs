/**
 * Pure helpers for the post-deploy production smoke test (Epic E19 — TGLA-132).
 *
 * The expected security headers are derived from `vercel.json`, so the file that
 * configures production stays the single source of truth for what is verified.
 */

export const DEFAULT_SMOKE_HOSTS = ['https://glassfolio.dev', 'https://app.glassfolio.dev'];

/** A path that doesn't exist: the app host's SPA rewrite answers 200 + HTML, the public site a real 404 page. */
export const DEEP_LINK_PATH = '/__smoke-deep-link__';

/**
 * @param {string} base
 * @returns {number}
 */
export const expectedDeepLinkStatus = (base) => (new URL(base).hostname.startsWith('app.') ? 200 : 404);

const CATCH_ALL_SOURCE = '/(.*)';

/**
 * Collects the headers that vercel.json applies to every path, keyed by lower-cased name.
 * @param {{ headers?: Array<{ source: string, headers: Array<{ key: string, value: string }> }> }} config
 * @returns {Record<string, string>}
 */
export function expectedHeadersFromVercelConfig(config) {
  const expected = {};
  for (const rule of config.headers ?? []) {
    if (rule.source !== CATCH_ALL_SOURCE) continue;
    for (const { key, value } of rule.headers) {
      expected[key.toLowerCase()] = value;
    }
  }
  return expected;
}

/**
 * Evaluates one HTTP response and returns the list of failures (empty when healthy).
 * @param {{ path: string, status: number, headers: Record<string, string> }} response
 * @param {Record<string, string>} expectedHeaders
 * @param {number} [expectedStatus]
 * @returns {string[]}
 */
export function evaluateSmokeResponse(response, expectedHeaders, expectedStatus = 200) {
  const failures = [];
  if (response.status !== expectedStatus) {
    failures.push(`${response.path}: expected HTTP ${expectedStatus}, got ${response.status}`);
  }
  const contentType = response.headers['content-type'] ?? '';
  if (!contentType.toLowerCase().includes('text/html')) {
    failures.push(`${response.path}: expected an HTML document, got content-type "${contentType}"`);
  }
  for (const [name, value] of Object.entries(expectedHeaders)) {
    const actual = response.headers[name];
    if (actual !== value) {
      failures.push(`${response.path}: header "${name}" expected "${value}", got "${actual ?? 'missing'}"`);
    }
  }
  return failures;
}
