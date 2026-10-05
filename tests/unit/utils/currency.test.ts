/**
 * Tests — utils/currency.ts
 * Covers: SUPPORTED_CURRENCIES, CURRENCY_SYMBOLS, formatCurrency
 */

import { describe, it, expect } from 'vitest';
import {
  SUPPORTED_CURRENCIES,
  CURRENCY_SYMBOLS,
  formatCurrency,
} from '../../../utils/currency';

// ══════════════════════════════════════════════════════════════════════════════
// SUPPORTED_CURRENCIES
// ══════════════════════════════════════════════════════════════════════════════
describe('SUPPORTED_CURRENCIES', () => {
  it('contains EUR', () => {
    expect(SUPPORTED_CURRENCIES.some(c => c.code === 'EUR')).toBe(true);
  });

  it('contains USD', () => {
    expect(SUPPORTED_CURRENCIES.some(c => c.code === 'USD')).toBe(true);
  });

  it('USD has defaultUsdRate of exactly 1.0', () => {
    const usd = SUPPORTED_CURRENCIES.find(c => c.code === 'USD');
    expect(usd?.defaultUsdRate).toBe(1.0);
  });

  it('all entries have required fields', () => {
    for (const c of SUPPORTED_CURRENCIES) {
      expect(c.code).toBeTruthy();
      expect(c.symbol).toBeTruthy();
      expect(c.label).toBeTruthy();
      expect(typeof c.defaultUsdRate).toBe('number');
      expect(c.defaultUsdRate).toBeGreaterThan(0);
    }
  });

  it('all codes are uppercase', () => {
    for (const c of SUPPORTED_CURRENCIES) {
      expect(c.code).toBe(c.code.toUpperCase());
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// CURRENCY_SYMBOLS
// ══════════════════════════════════════════════════════════════════════════════
describe('CURRENCY_SYMBOLS', () => {
  it('maps EUR to €', () => {
    expect(CURRENCY_SYMBOLS['EUR']).toBe('€');
  });

  it('maps USD to $', () => {
    expect(CURRENCY_SYMBOLS['USD']).toBe('$');
  });

  it('maps GBP to £', () => {
    expect(CURRENCY_SYMBOLS['GBP']).toBe('£');
  });

  it('derived from SUPPORTED_CURRENCIES — same count', () => {
    expect(Object.keys(CURRENCY_SYMBOLS)).toHaveLength(SUPPORTED_CURRENCIES.length);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// formatCurrency
// ══════════════════════════════════════════════════════════════════════════════
describe('formatCurrency', () => {
  it('formats USD in en-US locale', () => {
    const result = formatCurrency(1234.56, 'USD', 'en-US');
    expect(result).toContain('1,234.56');
    expect(result).toContain('$');
  });

  it('formats EUR in fr-FR locale', () => {
    const result = formatCurrency(1234.56, 'EUR', 'fr-FR');
    expect(result).toContain('€');
  });

  it('formats negative values', () => {
    const result = formatCurrency(-500, 'USD', 'en-US');
    expect(result).toContain('500');
    // Should include a negative indicator
    expect(result).toMatch(/-|−|\(.*\)/);
  });

  it('formats zero correctly', () => {
    const result = formatCurrency(0, 'USD', 'en-US');
    expect(result).toContain('0');
  });

  it('formats very large amounts without crashing', () => {
    const result = formatCurrency(1_000_000_000, 'EUR', 'en-US');
    expect(result).toBeTruthy();
    expect(result).toContain('1,000,000,000');
  });

  it('formats very small fractional amounts', () => {
    const result = formatCurrency(0.001, 'USD', 'en-US');
    expect(result).toBeTruthy();
  });

  it('falls back gracefully for unknown currency code', () => {
    // BTC is not a valid Intl currency — should use fallback path
    const result = formatCurrency(0.5, 'BTC', 'en-US');
    expect(result).toBeTruthy();
    expect(result).toContain('BTC');
  });

  it('applies custom Intl options (no decimals)', () => {
    const result = formatCurrency(1234.56, 'USD', 'en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
    expect(result).not.toContain('.56');
    expect(result).toContain('1,235'); // rounded
  });

  it('handles lowercase currency code by normalizing', () => {
    const lower = formatCurrency(100, 'eur', 'en-US');
    const upper = formatCurrency(100, 'EUR', 'en-US');
    expect(lower).toBe(upper);
  });

  it('defaults to USD when no currency specified', () => {
    const result = formatCurrency(100);
    expect(result).toContain('$');
  });
});
