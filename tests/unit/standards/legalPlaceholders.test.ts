import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Legal Documents & Zero-Knowledge Cleanup Standards', () => {
  it('ensures legal.json files exist for FR and EN', () => {
    const frLegalPath = resolve(process.cwd(), 'locales/fr/legal.json');
    const enLegalPath = resolve(process.cwd(), 'locales/en/legal.json');

    expect(existsSync(frLegalPath)).toBe(true);
    expect(existsSync(enLegalPath)).toBe(true);
  });

  it('verifies 0 placeholders remain in legal.json files', () => {
    const frText = readFileSync(resolve(process.cwd(), 'locales/fr/legal.json'), 'utf-8');
    const enText = readFileSync(resolve(process.cwd(), 'locales/en/legal.json'), 'utf-8');

    const forbiddenPlaceholders = [
      '[LAST_NAME]',
      '[CONTACT_EMAIL]',
      '[GITHUB_OR_LINKEDIN_URL]',
      '[STREET_ADDRESS]',
      '[CITY_POSTAL_CODE]',
    ];

    for (const placeholder of forbiddenPlaceholders) {
      expect(frText).not.toContain(placeholder);
      expect(enText).not.toContain(placeholder);
    }
  });

  it('verifies publisher identity is set without personal email exposure', () => {
    const frText = readFileSync(resolve(process.cwd(), 'locales/fr/legal.json'), 'utf-8');
    expect(frText).toContain('Damien');
    expect(frText).toContain('https://github.com/Damien-Esilv');
    // Ensure no raw gmail / personal email is leaked
    expect(frText).not.toContain('@gmail.com');
  });

  it('verifies strict absence of "zero-knowledge" across legal and landing copy', () => {
    const frLegal = readFileSync(resolve(process.cwd(), 'locales/fr/legal.json'), 'utf-8');
    const enLegal = readFileSync(resolve(process.cwd(), 'locales/en/legal.json'), 'utf-8');
    const frLanding = readFileSync(resolve(process.cwd(), 'locales/fr/landing.json'), 'utf-8');
    const enLanding = readFileSync(resolve(process.cwd(), 'locales/en/landing.json'), 'utf-8');

    expect(frLegal.toLowerCase()).not.toContain('zero-knowledge');
    expect(enLegal.toLowerCase()).not.toContain('zero-knowledge');
    expect(frLanding.toLowerCase()).not.toContain('zero-knowledge');
    expect(enLanding.toLowerCase()).not.toContain('zero-knowledge');

    expect(frLegal.toLowerCase()).not.toContain('zero knowledge');
    expect(enLegal.toLowerCase()).not.toContain('zero knowledge');
    expect(frLanding.toLowerCase()).not.toContain('zero knowledge');
    expect(enLanding.toLowerCase()).not.toContain('zero knowledge');
  });
});
