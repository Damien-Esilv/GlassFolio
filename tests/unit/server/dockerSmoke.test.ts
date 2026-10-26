import { describe, it, expect } from 'vitest';
import { buildDockerRunArgs, evaluateSpaShell } from '../../../scripts/lib/dockerSmoke.mjs';

describe('Docker smoke helpers (E31 — TGLA-137)', () => {
  it('runs the container with the same hardening as docker-compose.yml', () => {
    const args: string[] = buildDockerRunArgs({ name: 'gf', port: 38001, volume: 'gf-data', image: 'img' });
    expect(args).toEqual(expect.arrayContaining(['--read-only', '--init']));
    expect(args.join(' ')).toContain('--cap-drop ALL');
    expect(args.join(' ')).toContain('--security-opt no-new-privileges:true');
    expect(args).toContain('127.0.0.1:38001:8080');
    expect(args).toContain('gf-data:/data');
    expect(args[args.length - 1]).toBe('img');
  });

  it('accepts a well-formed SPA shell', () => {
    expect(
      evaluateSpaShell({
        path: '/',
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: '<html><div id="root"></div></html>',
        headers: {
          'x-content-type-options': 'nosniff',
          'x-frame-options': 'DENY',
          'content-security-policy': "default-src 'self'; script-src 'self'; frame-ancestors 'none'",
        },
      }),
    ).toEqual([]);
  });

  it('reports every problem of a bad response', () => {
    const failures: string[] = evaluateSpaShell({
      path: '/x',
      status: 500,
      contentType: 'text/plain',
      body: 'boom',
      headers: {},
    });
    expect(failures).toHaveLength(6); // status, type, root, nosniff, CSP script-src, framing
  });
});
