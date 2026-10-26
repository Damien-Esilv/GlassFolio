import { describe, it, expect } from 'vitest';
import { CHANGELOG } from '../../../src/constants/changelog';
import changelogEn from '../../../locales/en/changelog.json';
import changelogFr from '../../../locales/fr/changelog.json';

type Entries = Record<string, { title: string; highlights: Record<string, string> }>;

describe('changelog', () => {
  it('is sorted newest first with unique ids and versions', () => {
    const dates = CHANGELOG.map((entry) => entry.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(new Set(CHANGELOG.map((entry) => entry.id)).size).toBe(CHANGELOG.length);
    expect(new Set(CHANGELOG.map((entry) => entry.version)).size).toBe(CHANGELOG.length);
    for (const entry of CHANGELOG) expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('has an English and a French text for every entry and highlight', () => {
    for (const [lang, file] of [['en', changelogEn], ['fr', changelogFr]] as const) {
      const entries = (file as { entries: Entries }).entries;
      for (const entry of CHANGELOG) {
        expect(entries[entry.id]?.title, `${lang} ${entry.id} title`).toBeTruthy();
        for (const highlight of entry.highlights) {
          expect(entries[entry.id]?.highlights[highlight.key], `${lang} ${entry.id}.${highlight.key}`).toBeTruthy();
        }
      }
    }
  });
});
