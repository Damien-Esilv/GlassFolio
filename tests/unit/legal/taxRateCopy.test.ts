import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const LANGS = ['en', 'fr'];
const read = (lang: string, file: string): string => readFileSync(join(process.cwd(), 'locales', lang, file), 'utf-8');

describe('PFU and licence wording', () => {
  it.each(LANGS)('never hard-codes the flat tax rate in %s copy', (lang) => {
    for (const file of ['tax.json', 'ai.json', 'legal.json']) {
      expect(read(lang, file), file).not.toMatch(/PFU[^"]{0,12}\b30\s?%|\b30\s?%\s*(flat|PFU)/i);
    }
    expect(read(lang, 'tax.json')).toContain('{{peaSocial}}');
  });

  it.each(LANGS)('lists the 17.2 % exceptions in %s', (lang) => {
    const copy = read(lang, 'tax.json');
    expect(copy).toContain('"rateExceptions"');
    expect(copy).toMatch(/17[.,]2\s?%/);
  });

  it.each(LANGS)('does not call the source-available code open source in %s landing copy', (lang) => {
    expect(read(lang, 'landing.json')).not.toMatch(/open.?source|code ouvert|open codebase/i);
  });
});
