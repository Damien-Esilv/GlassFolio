/**
 * Unit Tests — taxRules.ts
 * Covers: getFiscalRules, getFiscalRulesOrThrow, getSupportedCountries,
 * getSupportedYears, calculateTMI, calculateIRPerShare, getPEATaxRule
 */

import { describe, it, expect } from 'vitest';
import {
  getFiscalRules,
  getFiscalRulesOrThrow,
  getSupportedCountries,
  getSupportedYears,
  calculateTMI,
  calculateIRPerShare,
  getPEATaxRule,
  DEFAULT_TAX_COUNTRY,
} from '../../../../src/services/fiscal/taxRules';

describe('taxRules', () => {
  describe('DEFAULT_TAX_COUNTRY', () => {
    it('is default to FR', () => {
      expect(DEFAULT_TAX_COUNTRY).toBe('FR');
    });
  });

  describe('getFiscalRules', () => {
    it('returns 2024 fiscal rules for France with default country parameter', () => {
      const rules = getFiscalRules('2024');
      expect(rules).toBeDefined();
      expect(rules?.country).toBe('FR');
      expect(rules?.year).toBe('2024');
      expect(rules?.declarationYear).toBe('2025');
      expect(rules?.pfu).toEqual({
        totalRate: 0.30,
        irRate: 0.128,
        socialRate: 0.172,
      });
      expect(rules?.irBrackets).toHaveLength(5);
      expect(rules?.calendar.declarationOpening).toBe('2025-04-10');
    });

    it('returns 2024 fiscal rules for France with explicit country parameter', () => {
      const rules = getFiscalRules('2024', 'FR');
      expect(rules).toBeDefined();
      expect(rules?.year).toBe('2024');
      expect(rules?.country).toBe('FR');
    });

    it('returns 2025 fiscal rules with updated IR brackets', () => {
      const rules = getFiscalRules('2025', 'FR');
      expect(rules).toBeDefined();
      expect(rules?.year).toBe('2025');
      expect(rules?.declarationYear).toBe('2026');
      expect(rules?.irBrackets[1].min).toBe(11497);
    });

    it('extrapolates rules for future/unlisted years in France using 2025 template', () => {
      const rules = getFiscalRules('2028', 'FR');
      expect(rules).toBeDefined();
      expect(rules?.year).toBe('2028');
      expect(rules?.declarationYear).toBe('2029');
      expect(rules?.country).toBe('FR');
      // Should inherit PFU and IR brackets from 2025 rules
      expect(rules?.pfu.totalRate).toBe(0.30);
      expect(rules?.calendar).toBeDefined();
      expect(rules?.calendar.declarationOpening).toBeTruthy();
    });

    it('returns undefined for invalid non-numeric year strings in France', () => {
      expect(getFiscalRules('invalid-year', 'FR')).toBeUndefined();
      expect(getFiscalRules('abc', 'FR')).toBeUndefined();
    });

    it('returns undefined for unsupported countries', () => {
      expect(getFiscalRules('2024', 'US')).toBeUndefined();
      expect(getFiscalRules('2024', 'BE')).toBeUndefined();
      expect(getFiscalRules('2028', 'US')).toBeUndefined();
    });
  });

  describe('getFiscalRulesOrThrow', () => {
    it('returns rules for valid country and year', () => {
      const rules = getFiscalRulesOrThrow('2024', 'FR');
      expect(rules).toBeDefined();
      expect(rules.year).toBe('2024');
    });

    it('throws error when rules are not available', () => {
      expect(() => getFiscalRulesOrThrow('2024', 'US')).toThrowError(
        /Fiscal rules not available for US\/2024/
      );
      expect(() => getFiscalRulesOrThrow('invalid-year', 'FR')).toThrowError(
        /Fiscal rules not available for FR\/invalid-year/
      );
    });
  });

  describe('getSupportedCountries', () => {
    it('returns array of supported country codes containing FR', () => {
      const countries = getSupportedCountries();
      expect(countries).toBeInstanceOf(Array);
      expect(countries).toContain('FR');
      // Should be sorted alphabetically
      expect(countries).toEqual([...countries].sort());
    });
  });

  describe('getSupportedYears', () => {
    it('returns list of supported years for France including 2024 and 2025', () => {
      const years = getSupportedYears('FR');
      expect(years).toContain('2024');
      expect(years).toContain('2025');
      expect(years).toEqual([...years].sort());
    });

    it('handles unsupported country by returning candidate current/previous years', () => {
      const years = getSupportedYears('US');
      expect(years.length).toBeGreaterThan(0);
    });
  });

  describe('calculateTMI (Taux Marginal d\'Imposition)', () => {
    it('returns 0 for income in the first bracket (0%)', () => {
      expect(calculateTMI(10000, '2024')).toBe(0);
    });

    it('returns 0.11 for income in the second bracket (11%)', () => {
      expect(calculateTMI(20000, '2024')).toBe(0.11);
    });

    it('returns 0.30 for income in the third bracket (30%)', () => {
      expect(calculateTMI(50000, '2024')).toBe(0.30);
    });

    it('returns 0.41 for income in the fourth bracket (41%)', () => {
      expect(calculateTMI(100000, '2024')).toBe(0.41);
    });

    it('returns 0.45 for income in the top bracket (45%)', () => {
      expect(calculateTMI(200000, '2024')).toBe(0.45);
    });
  });

  describe('calculateIRPerShare', () => {
    it('returns 0 tax for income within non-taxable bracket', () => {
      expect(calculateIRPerShare(10000, '2024')).toBe(0);
    });

    it('calculates progressive tax correctly for income in 11% bracket', () => {
      // 2024 brackets: 0..11294 @ 0%, 11294..28797 @ 11%
      // For 20000: (20000 - 11294) * 0.11 = 8706 * 0.11 = 957.66
      const tax = calculateIRPerShare(20000, '2024');
      expect(tax).toBeCloseTo(957.66, 2);
    });

    it('calculates progressive tax across multiple brackets', () => {
      // For 50000:
      // Bracket 1 (0..11294): 0
      // Bracket 2 (11294..28797): (28797 - 11294) * 0.11 = 17503 * 0.11 = 1925.33
      // Bracket 3 (28797..50000): (50000 - 28797) * 0.30 = 21203 * 0.30 = 6360.90
      // Total = 1925.33 + 6360.90 = 8286.23
      const tax = calculateIRPerShare(50000, '2024');
      expect(tax).toBeCloseTo(8286.23, 2);
    });
  });

  describe('getPEATaxRule', () => {
    it('returns rule for plan opened less than 2 years ago', () => {
      const openDate = '2024-01-01';
      const withdrawalDate = '2025-01-01'; // ~1 year
      const rule = getPEATaxRule(openDate, withdrawalDate, '2024');
      expect(rule.incomeTaxRate).toBe(0.225);
      expect(rule.socialRate).toBe(0.172);
      expect(rule.closesOnWithdrawal).toBe(true);
    });

    it('returns rule for plan opened between 2 and 5 years ago', () => {
      const openDate = '2021-01-01';
      const withdrawalDate = '2024-06-01'; // ~3.4 years
      const rule = getPEATaxRule(openDate, withdrawalDate, '2024');
      expect(rule.incomeTaxRate).toBe(0.19);
      expect(rule.socialRate).toBe(0.172);
      expect(rule.closesOnWithdrawal).toBe(true);
    });

    it('returns rule for plan opened more than 5 years ago', () => {
      const openDate = '2018-01-01';
      const withdrawalDate = '2024-06-01'; // ~6.4 years
      const rule = getPEATaxRule(openDate, withdrawalDate, '2024');
      expect(rule.incomeTaxRate).toBe(0);
      expect(rule.socialRate).toBe(0.172);
      expect(rule.closesOnWithdrawal).toBe(false);
    });
  });
});
