/**
 * French banks (TGLA-240): the bank list comes from the Woob worker at run time; the app only keeps notes
 * on some banks. Every note and every translated field label exists in both languages.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isVerifiedWoobBank, TRANSLATED_WOOB_FIELDS, VERIFIED_WOOB_BANKS, WOOB_BANK_LIMITS } from '../../../src/config/woobBanks';

const root = path.resolve(__dirname, '../../..');
const banksText = (lang: string) => JSON.parse(readFileSync(path.join(root, `locales/${lang}/settings.json`), 'utf8')).connections.banks;
const source = JSON.parse(readFileSync(path.join(root, 'companions/woob/woob-source.json'), 'utf8'));

describe('Woob bank notes', () => {
    it('Woob is pinned to a full commit; no fixed bank list ships with the worker', () => {
        expect(source.commit).toMatch(/^[0-9a-f]{40}$/);
        expect(source.modules).toBeUndefined();
    });

    it('only BoursoBank is verified on a real account', () => {
        expect(VERIFIED_WOOB_BANKS).toEqual(['boursorama']);
        expect(isVerifiedWoobBank('boursorama')).toBe(true);
        expect(isVerifiedWoobBank('cragr')).toBe(false);
        expect(isVerifiedWoobBank(undefined)).toBe(false);
    });

    it('every limit and translated field has its texts in English and French', () => {
        for (const lang of ['en', 'fr']) {
            const texts = banksText(lang);
            for (const limit of [...new Set(Object.values(WOOB_BANK_LIMITS)), 'balancesOnly']) expect(texts.limits[limit]).toBeTruthy();
            for (const field of TRANSLATED_WOOB_FIELDS) expect(texts.fields[field]).toBeTruthy();
        }
    });
});
