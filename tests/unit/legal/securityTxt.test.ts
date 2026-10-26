import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LEGAL_CONTACT_EMAIL } from '../../../src/config/legal';

const read = (file: string): string => readFileSync(join(process.cwd(), file), 'utf-8');
const fields = (text: string): Array<[string, string]> =>
  text
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.startsWith('#'))
    .map((line) => {
      const index = line.indexOf(':');
      return [line.slice(0, index), line.slice(index + 1).trim()];
    });

describe('security.txt (RFC 9116) and security policy', () => {
  const entries = fields(read('public/.well-known/security.txt'));
  const first = (name: string): string | undefined => entries.find(([key]) => key === name)?.[1];

  it('publishes a real, current contact', () => {
    expect(first('Contact')).toBe(`mailto:${LEGAL_CONTACT_EMAIL}`);
    expect(entries.filter(([key]) => key === 'Canonical').map(([, value]) => value)).toContain(
      'https://glassfolio.dev/.well-known/security.txt',
    );
  });

  it('has an Expires date in the future, at most one year away (renew it before it lapses)', () => {
    const expires = Date.parse(first('Expires') ?? '');
    expect(Number.isNaN(expires)).toBe(false);
    const days = (expires - Date.now()) / 86_400_000;
    expect(days, 'security.txt expires in less than 14 days: bump Expires').toBeGreaterThan(14);
    expect(days).toBeLessThanOrEqual(366);
  });

  it('is shipped by the build and not swallowed by the SPA rewrite', () => {
    expect(read('.github/SECURITY.md')).toContain(LEGAL_CONTACT_EMAIL);
    // static files win over vercel.json rewrites, but a catch-all that excluded dot-folders would hide it
    const vercel = JSON.parse(read('vercel.json')) as { rewrites?: Array<{ source: string }> };
    expect(vercel.rewrites?.some((rule) => rule.source.includes('.well-known'))).toBeFalsy();
  });
});
