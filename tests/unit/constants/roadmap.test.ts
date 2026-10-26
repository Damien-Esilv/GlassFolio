import { describe, it, expect } from 'vitest';
import { ROADMAP_ITEMS } from '../../../src/constants/roadmap';
import roadmapEn from '../../../locales/en/roadmap.json';
import roadmapFr from '../../../locales/fr/roadmap.json';

/**
 * The public roadmap only promises product capabilities. Security work, fixes or known gaps
 * would read as weaknesses and do not belong there.
 */
const FORBIDDEN = /secur|sécur|vulnerab|vulnérab|faille|breach|bug|fix|correct|patch|attack|attaque|exploit|leak|fuite|incident/i;

describe('roadmap', () => {
  it('has unique items with an English and a French text', () => {
    expect(new Set(ROADMAP_ITEMS.map((item) => item.key)).size).toBe(ROADMAP_ITEMS.length);
    for (const file of [roadmapEn, roadmapFr]) {
      for (const item of ROADMAP_ITEMS) {
        const texts = (file.items as Record<string, { title: string; body: string }>)[item.key];
        expect(texts?.title).toBeTruthy();
        expect(texts?.body).toBeTruthy();
      }
    }
  });

  it('never mentions security work, fixes or weaknesses', () => {
    for (const file of [roadmapEn, roadmapFr]) {
      expect(JSON.stringify(file)).not.toMatch(FORBIDDEN);
    }
  });
});
