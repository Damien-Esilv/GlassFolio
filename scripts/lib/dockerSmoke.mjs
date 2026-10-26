/** Pure helpers for scripts/smoke-docker.mjs (Epic E31 — TGLA-137). */

export const SMOKE_IMAGE = 'glassfolio:smoke';
export const CONTAINER_PORT = 8080;

/**
 * `docker run` arguments mirroring the hardening of docker-compose.yml, so the smoke test
 * exercises the same constraints (read-only rootfs, no capabilities, non-root, volume only).
 */
export const buildDockerRunArgs = ({ name, port, volume, image = SMOKE_IMAGE }) => [
  'run', '-d',
  '--name', name,
  '--init',
  '--read-only',
  '--tmpfs', '/tmp',
  '--cap-drop', 'ALL',
  '--security-opt', 'no-new-privileges:true',
  '-p', `127.0.0.1:${port}:${CONTAINER_PORT}`,
  '-v', `${volume}:/data`,
  image,
];

/** Failures (empty when fine) for a response that must be the SPA shell. */
export const evaluateSpaShell = ({ path, status, contentType, body, headers }) => {
  const failures = [];
  if (status !== 200) failures.push(`${path}: expected HTTP 200, got ${status}`);
  if (!String(contentType).includes('text/html')) failures.push(`${path}: expected text/html, got ${contentType}`);
  if (!body.includes('<div id="root"')) failures.push(`${path}: SPA root element missing`);
  if (headers['x-content-type-options'] !== 'nosniff') failures.push(`${path}: missing X-Content-Type-Options: nosniff`);
  const csp = String(headers['content-security-policy'] ?? '');
  if (!csp.includes("script-src 'self';")) failures.push(`${path}: Content-Security-Policy must restrict script-src to 'self'`);
  if (/unsafe-eval|script-src[^;]*unsafe-inline/.test(csp)) failures.push(`${path}: Content-Security-Policy allows unsafe script execution`);
  if (!csp.includes("frame-ancestors 'none'") || headers['x-frame-options'] !== 'DENY') failures.push(`${path}: framing must be refused (frame-ancestors + X-Frame-Options)`);
  return failures;
};
