/**
 * Pure helpers for the post-deploy production smoke test (Epic E19 — TGLA-132).
 *
 * The expected security headers are derived from `vercel.json`, so the file that
 * configures production stays the single source of truth for what is verified.
 */

export const DEFAULT_SMOKE_HOSTS = ['https://glassfolio.dev', 'https://app.glassfolio.dev'];

/** A path that is not a real asset: a healthy SPA rewrite must still answer 200 + HTML. */
export const DEEP_LINK_PATH = '/__smoke-deep-link__';

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
 * @returns {string[]}
 */
export function evaluateSmokeResponse(response, expectedHeaders) {
  const failures = [];
  if (response.status !== 200) {
    failures.push(`${response.path}: expected HTTP 200, got ${response.status}`);
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
