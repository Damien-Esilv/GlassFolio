/**
 * Merchant logos (Epic E52): bundled Simple Icons, strict matching so a wrong logo never shows.
 */
import { describe, it, expect } from 'vitest';
import { findMerchantLogo } from '../../../../src/services/cashflow/merchantLogos';

const title = (label: string): string | undefined => findMerchantLogo(label)?.title;

describe('merchant logos', () => {
    it('finds the brand at the start of the merchant, after the bank noise', () => {
        expect(title('CARTE 12/03 CARREFOUR CITY PARIS')).toBe('Carrefour');
        expect(title('CB CARREFOUR MARKET 4X1234')).toBe('Carrefour');
        expect(title('CARTE E.LECLERC ST DENIS')).toBe('E.Leclerc');
        expect(title('Leclerc Drive')).toBe('E.Leclerc');
        expect(title('PRLV SEPA ORANGE SA')).toBe('Orange');
        expect(title('CARTE 15/10 NETFLIX.COM AMSTERDAM')).toBe('Netflix');
        expect(title('Netflix Com')).toBe('Netflix');
        expect(title('CARTE MCDONALDS PARIS 11')).toBe("McDonald's");
    });

    it('prefers the most precise brand', () => {
        expect(title('CARTE UBER EATS PARIS')).toBe('Uber Eats');
        expect(title('CARTE 03/02 UBER *TRIP')).toBe('Uber');
    });

    it('never guesses: a brand word later in the label, a missing brand or a partial word gives no logo', () => {
        expect(findMerchantLogo('CARTE BAR JUS D ORANGE')).toBeUndefined();
        expect(findMerchantLogo('CARTE TOTALENERGIES STATION')).toBeUndefined();
        expect(findMerchantLogo('CARTE TOTAL ACCESS')).toBeUndefined();
        expect(findMerchantLogo('PRLV SEPA FREE MOBILE')).toBeUndefined();
        expect(findMerchantLogo('CARTE AMAZON EU SARL')).toBeUndefined();
        expect(findMerchantLogo('CARTE LIDLAND')).toBeUndefined();
        expect(findMerchantLogo('')).toBeUndefined();
    });

    it('gives a drawable icon: an SVG path and a 6-digit colour', () => {
        const logo = findMerchantLogo('SNCF');
        expect(logo?.path.length).toBeGreaterThan(10);
        expect(logo?.hex).toMatch(/^[0-9A-F]{6}$/i);
    });
});
