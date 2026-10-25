/**
 * Legal documents guardrails (E15): required GDPR / LCEN sections, no leaked interpolation tokens,
 * no "open-source" claim for a non-commercial licence, and a storage inventory that cannot drift.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { LEGAL_CONTACT_EMAIL, SUBPROCESSOR_IDS } from '../../../src/config/legal';

type Section = { id: string; title: string; paragraphs?: string[]; items?: string[]; table?: string };
type LegalLocale = {
  legalNotice: { sections: Section[] };
  privacy: { sections: Section[]; subprocessors: Record<string, unknown> };
  terms: { sections: Section[] };
  cookies: { rows: Record<string, { key: string }> };
};

const root = process.cwd();
const readLocale = (lang: 'fr' | 'en'): LegalLocale => JSON.parse(readFileSync(resolve(root, `locales/${lang}/legal.json`), 'utf-8'));
const ids = (sections: Section[]) => sections.map(section => section.id);

describe.each(['fr', 'en'] as const)('legal documents (%s)', (lang) => {
  const locale = readLocale(lang);
  const raw = readFileSync(resolve(root, `locales/${lang}/legal.json`), 'utf-8');

  it('privacy policy covers every GDPR Art. 13 topic', () => {
    expect(ids(locale.privacy.sections)).toEqual(expect.arrayContaining([
      'controller', 'data', 'purposes', 'recipients', 'transfers', 'retention', 'rights', 'security', 'minors', 'changes',
    ]));
    const rights = locale.privacy.sections.find(section => section.id === 'rights');
    expect((rights?.items ?? []).length).toBeGreaterThanOrEqual(6);
  });

  it('lists every configured processor with name, purpose and location', () => {
    SUBPROCESSOR_IDS.forEach(id => {
      const entry = locale.privacy.subprocessors[id] as Record<string, string>;
      expect(entry?.name).toBeTruthy();
      expect(entry?.purpose).toBeTruthy();
      expect(entry?.location).toBeTruthy();
    });
  });

  it('terms cover account loss, eligibility, liability, termination and governing law', () => {
    expect(ids(locale.terms.sections)).toEqual(expect.arrayContaining([
      'eligibility', 'account', 'disclaimer', 'liability', 'termination', 'changes', 'law',
    ]));
  });

  it('legal notice identifies publisher, hosts and licence', () => {
    expect(ids(locale.legalNotice.sections)).toEqual(expect.arrayContaining(['publisher', 'hosting', 'ip', 'law']));
  });

  it('never claims open-source for the non-commercial licence', () => {
    // The only allowed mention is the sentence that explicitly says the licence is NOT OSI open-source.
    const withoutOsiDisclaimer = raw.replace(/[^.]*\bOSI\b[^.]*\./g, '');
    expect(withoutOsiDisclaimer.toLowerCase()).not.toMatch(/open[- ]?source/);
    expect(raw).toContain('PolyForm Noncommercial 1.0.0');
  });

  it('uses interpolation variables only for known tokens', () => {
    const tokens = new Set([...raw.matchAll(/\{\{(\w+)\}\}/g)].map(match => match[1]));
    tokens.forEach(token => expect(['email', 'version', 'date']).toContain(token));
    expect(raw).not.toContain(LEGAL_CONTACT_EMAIL);
  });
});

describe('storage inventory in the Cookies tab', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap(entry => {
      if (['node_modules', 'dist', 'tests', 'curated-agent-kit', 'locales'].includes(entry)) return [];
      const full = join(dir, entry);
      return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(entry) ? [full] : [];
    });

  const usedKeys = (): Set<string> => {
    const keys = new Set<string>();
    ['src', 'context', 'components', 'pages', 'hooks', 'utils'].forEach(folder => {
      walk(resolve(root, folder)).forEach(file => {
        const source = readFileSync(file, 'utf-8');
        for (const match of source.matchAll(/['"`](gf_[a-z0-9_]+)['"`]/g)) keys.add(match[1]);
      });
    });
    return keys;
  };

  it('documents every gf_* storage key written by the app', () => {
    const documented = (['fr', 'en'] as const).map(lang =>
      Object.values(readLocale(lang).cookies.rows).map(row => row.key).join(' ')
    );
    // `gf_totp_enrolled` is only read to clean up a legacy flag; it is never written anymore.
    const legacyCleanupOnly = new Set(['gf_totp_enrolled']);
    usedKeys().forEach(key => {
      if (legacyCleanupOnly.has(key)) return;
      documented.forEach(text => expect(text, `${key} missing from the cookies inventory`).toContain(key));
    });
  });
});
