/**
 * Tests — validationService.ts
 * Covers all exported validators: validateDate, validateQuantity, validatePrice,
 * validateAmount, validateCurrency, validateISIN, validateFees,
 * validateAssetIdentification, validateInstrumentIdentification,
 * validateRow, validateSellQuantity
 */

import { describe, it, expect } from 'vitest';
import {
  validateDate,
  validateQuantity,
  validatePrice,
  validateAmount,
  validateCurrency,
  validateISIN,
  validateFees,
  validateAssetIdentification,
  validateInstrumentIdentification,
  validateRow,
  validateSellQuantity,
} from '../../../../src/services/core/validationService';

// ══════════════════════════════════════════════════════════════════════════════
// validateDate
// ══════════════════════════════════════════════════════════════════════════════
describe('validateDate', () => {
  it('returns no errors for a valid past date', () => {
    const errors = validateDate('2023-06-15');
    expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
  });

  it('returns error for empty string', () => {
    const errors = validateDate('');
    expect(errors.some(e => e.code === 'DATE_REQUIRED')).toBe(true);
  });

  it('returns error for undefined', () => {
    const errors = validateDate(undefined);
    expect(errors.some(e => e.code === 'DATE_REQUIRED')).toBe(true);
  });

  it('returns error for invalid date format', () => {
    const errors = validateDate('not-a-date');
    expect(errors.some(e => e.code === 'DATE_INVALID')).toBe(true);
  });

  it('returns error for far future date', () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const errors = validateDate(futureDate.toISOString());
    expect(errors.some(e => e.code === 'DATE_FUTURE')).toBe(true);
  });

  it('returns warning for date before 1970', () => {
    const errors = validateDate('1969-12-31');
    expect(errors.some(e => e.code === 'DATE_TOO_OLD')).toBe(true);
    expect(errors.some(e => e.code === 'DATE_TOO_OLD' && e.severity === 'warning')).toBe(true);
  });

  it('accepts a date exactly at today', () => {
    const today = new Date().toISOString();
    const errors = validateDate(today);
    expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
  });

  it('returns errors with severity field populated', () => {
    const errors = validateDate('');
    errors.forEach(e => {
      expect(['error', 'warning']).toContain(e.severity);
    });
  });

  it('uses custom fieldName in error field property', () => {
    const errors = validateDate('', 'customDate');
    expect(errors[0].field).toBe('customDate');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// validateQuantity
// ══════════════════════════════════════════════════════════════════════════════
describe('validateQuantity', () => {
  it('returns no errors for valid quantity on BUY', () => {
    expect(validateQuantity('10', 'BUY')).toHaveLength(0);
  });

  it('returns no errors for valid quantity on SELL', () => {
    expect(validateQuantity('5.5', 'SELL')).toHaveLength(0);
  });

  it('returns error when BUY quantity is missing', () => {
    const errors = validateQuantity(undefined, 'BUY');
    expect(errors.some(e => e.code === 'QTY_REQUIRED')).toBe(true);
  });

  it('returns error when SELL quantity is missing', () => {
    const errors = validateQuantity(undefined, 'SELL');
    expect(errors.some(e => e.code === 'QTY_REQUIRED')).toBe(true);
  });

  it('does not require quantity for DEPOSIT', () => {
    expect(validateQuantity(undefined, 'DEPOSIT')).toHaveLength(0);
  });

  it('does not require quantity for WITHDRAW', () => {
    expect(validateQuantity(undefined, 'WITHDRAW')).toHaveLength(0);
  });

  it('returns error for non-numeric quantity', () => {
    const errors = validateQuantity('abc', 'BUY');
    expect(errors.some(e => e.code === 'QTY_INVALID')).toBe(true);
  });

  it('returns error for negative quantity', () => {
    const errors = validateQuantity('-5', 'BUY');
    expect(errors.some(e => e.code === 'QTY_NEGATIVE')).toBe(true);
  });

  it('returns error for zero quantity on BUY', () => {
    const errors = validateQuantity('0', 'BUY');
    expect(errors.some(e => e.code === 'QTY_ZERO')).toBe(true);
  });

  it('accepts very large quantities', () => {
    expect(validateQuantity('1000000000', 'BUY')).toHaveLength(0);
  });

  it('accepts fractional quantities (crypto)', () => {
    expect(validateQuantity('0.000001', 'BUY')).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// validatePrice
// ══════════════════════════════════════════════════════════════════════════════
describe('validatePrice', () => {
  it('returns no errors for valid price on BUY', () => {
    expect(validatePrice('100.50', 'BUY')).toHaveLength(0);
  });

  it('returns warning when BUY price is missing', () => {
    const errors = validatePrice(undefined, 'BUY');
    expect(errors.some(e => e.code === 'PRICE_MISSING' && e.severity === 'warning')).toBe(true);
  });

  it('does not require price for DEPOSIT', () => {
    expect(validatePrice(undefined, 'DEPOSIT')).toHaveLength(0);
  });

  it('returns error for non-numeric price', () => {
    const errors = validatePrice('abc', 'BUY');
    expect(errors.some(e => e.code === 'PRICE_INVALID')).toBe(true);
  });

  it('returns error for negative price', () => {
    const errors = validatePrice('-1', 'BUY');
    expect(errors.some(e => e.code === 'PRICE_NEGATIVE')).toBe(true);
  });

  it('returns warning for zero price on BUY', () => {
    const errors = validatePrice('0', 'BUY');
    expect(errors.some(e => e.code === 'PRICE_ZERO' && e.severity === 'warning')).toBe(true);
  });

  it('accepts very high price (Berkshire B-style)', () => {
    expect(validatePrice('500000', 'BUY')).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// validateAmount
// ══════════════════════════════════════════════════════════════════════════════
describe('validateAmount', () => {
  it('returns no errors for positive amount', () => {
    expect(validateAmount('1000.50')).toHaveLength(0);
  });

  it('returns no errors for negative amount (outflow)', () => {
    expect(validateAmount('-500')).toHaveLength(0);
  });

  it('returns no errors for zero amount', () => {
    expect(validateAmount('0')).toHaveLength(0);
  });

  it('returns error for missing amount', () => {
    const errors = validateAmount(undefined);
    expect(errors.some(e => e.code === 'AMOUNT_REQUIRED')).toBe(true);
  });

  it('returns error for empty amount', () => {
    const errors = validateAmount('');
    expect(errors.some(e => e.code === 'AMOUNT_REQUIRED')).toBe(true);
  });

  it('returns error for non-numeric amount', () => {
    const errors = validateAmount('abc');
    expect(errors.some(e => e.code === 'AMOUNT_INVALID')).toBe(true);
  });

  it('accepts very large amounts', () => {
    expect(validateAmount('999999999999')).toHaveLength(0);
  });

  it('accepts very small fractional amounts', () => {
    expect(validateAmount('0.001')).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// validateCurrency
// ══════════════════════════════════════════════════════════════════════════════
describe('validateCurrency', () => {
  it('returns no errors for EUR', () => {
    expect(validateCurrency('EUR')).toHaveLength(0);
  });

  it('returns no errors for USD', () => {
    expect(validateCurrency('USD')).toHaveLength(0);
  });

  it('returns no errors for lowercase eur (normalized)', () => {
    expect(validateCurrency('eur')).toHaveLength(0);
  });

  it('returns error for empty currency', () => {
    const errors = validateCurrency('');
    expect(errors.some(e => e.code === 'CURRENCY_REQUIRED')).toBe(true);
  });

  it('returns error for undefined', () => {
    const errors = validateCurrency(undefined);
    expect(errors.some(e => e.code === 'CURRENCY_REQUIRED')).toBe(true);
  });

  it('returns no errors for known stock ticker (AAPL) in permissive mode', () => {
    // AAPL is treated as ticker-like (uppercase 2-5 letters)
    const errors = validateCurrency('AAPL');
    expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
  });

  it('returns error for completely unknown non-ticker symbol in strict mode', () => {
    const errors = validateCurrency('FAKE123456', undefined, true);
    expect(errors.some(e => e.code === 'CURRENCY_NOT_ISO')).toBe(true);
  });

  it('strict mode: rejects crypto symbol BTC', () => {
    const errors = validateCurrency('BTC', undefined, true);
    expect(errors.some(e => e.code === 'CURRENCY_NOT_ISO')).toBe(true);
  });

  it('strict mode: accepts EUR', () => {
    expect(validateCurrency('EUR', undefined, true)).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// validateISIN
// ══════════════════════════════════════════════════════════════════════════════
describe('validateISIN', () => {
  // US0378331005 = Apple Inc (valid ISIN with correct Luhn check digit)
  it('returns no errors for valid Apple ISIN', () => {
    expect(validateISIN('US0378331005')).toHaveLength(0);
  });

  // FR0000131104 = BNP Paribas
  it('returns no errors for valid French ISIN', () => {
    expect(validateISIN('FR0000131104')).toHaveLength(0);
  });

  it('returns no errors when ISIN is undefined (optional)', () => {
    expect(validateISIN(undefined)).toHaveLength(0);
  });

  it('returns error for too-short ISIN', () => {
    const errors = validateISIN('US037833100');
    expect(errors.some(e => e.code === 'ISIN_FORMAT_INVALID')).toBe(true);
  });

  it('returns error for ISIN starting with digits', () => {
    const errors = validateISIN('123456789012');
    expect(errors.some(e => e.code === 'ISIN_FORMAT_INVALID')).toBe(true);
  });

  it('returns warning for ISIN with bad check digit', () => {
    // Valid format but wrong check digit
    const errors = validateISIN('US0378331004');
    expect(errors.some(e => e.code === 'ISIN_CHECKDIGIT_INVALID')).toBe(true);
  });

  it('normalizes lowercase to uppercase before validation', () => {
    expect(validateISIN('us0378331005')).toHaveLength(0);
  });

  it('returns error for ISIN with special characters', () => {
    const errors = validateISIN('US037833100!');
    expect(errors.some(e => e.code === 'ISIN_FORMAT_INVALID')).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// validateFees
// ══════════════════════════════════════════════════════════════════════════════
describe('validateFees', () => {
  it('returns no errors when fee is absent (optional)', () => {
    expect(validateFees(undefined, '1000')).toHaveLength(0);
  });

  it('returns no errors for reasonable fee', () => {
    expect(validateFees('5', '1000')).toHaveLength(0);
  });

  it('returns error for non-numeric fee', () => {
    const errors = validateFees('abc', '1000');
    expect(errors.some(e => e.code === 'FEE_INVALID')).toBe(true);
  });

  it('returns error for negative fee', () => {
    const errors = validateFees('-5', '1000');
    expect(errors.some(e => e.code === 'FEE_NEGATIVE')).toBe(true);
  });

  it('returns warning when fee > 50% of transaction', () => {
    const errors = validateFees('600', '1000');
    expect(errors.some(e => e.code === 'FEE_HIGH' && e.severity === 'warning')).toBe(true);
  });

  it('returns no warning when fee is exactly 50% of transaction', () => {
    // 500 fee / 1000 amount = 50% — boundary condition (strict >)
    const errors = validateFees('500', '1000');
    expect(errors.some(e => e.code === 'FEE_HIGH')).toBe(false);
  });

  it('returns no errors for zero fee', () => {
    expect(validateFees('0', '1000')).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// validateAssetIdentification (deprecated path)
// ══════════════════════════════════════════════════════════════════════════════
describe('validateAssetIdentification', () => {
  it('returns no errors when symbol is provided', () => {
    expect(validateAssetIdentification('AAPL', undefined)).toHaveLength(0);
  });

  it('returns no errors when ISIN is provided', () => {
    expect(validateAssetIdentification(undefined, 'US0378331005')).toHaveLength(0);
  });

  it('returns no errors when both symbol and ISIN are provided', () => {
    expect(validateAssetIdentification('AAPL', 'US0378331005')).toHaveLength(0);
  });

  it('returns error when both symbol and ISIN are absent', () => {
    const errors = validateAssetIdentification(undefined, undefined);
    expect(errors.some(e => e.code === 'ASSET_ID_REQUIRED')).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// validateInstrumentIdentification
// ══════════════════════════════════════════════════════════════════════════════
describe('validateInstrumentIdentification', () => {
  it('accepts stock with valid ISIN', () => {
    const errors = validateInstrumentIdentification('AAPL', 'stock', { isin: 'US0378331005' });
    expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
  });

  it('accepts stock with symbol + exchange', () => {
    const errors = validateInstrumentIdentification('AAPL', 'stock', { exchange: 'NASDAQ' });
    expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
  });

  it('returns error for stock without ISIN or exchange', () => {
    const errors = validateInstrumentIdentification('AAPL', 'stock', {});
    expect(errors.some(e => e.code === 'INSTRUMENT_ID_INSUFFICIENT')).toBe(true);
  });

  it('accepts ETF with ISIN', () => {
    const errors = validateInstrumentIdentification('CW8', 'etf', { isin: 'LU1861134382' });
    expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
  });

  it('returns error for crypto without context', () => {
    const errors = validateInstrumentIdentification('BTC', 'crypto', {});
    expect(errors.some(e => e.code === 'CRYPTO_CONTEXT_REQUIRED')).toBe(true);
  });

  it('accepts crypto with exchange', () => {
    const errors = validateInstrumentIdentification('BTC', 'crypto', { exchange: 'Binance' });
    expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
  });

  it('accepts crypto with network', () => {
    const errors = validateInstrumentIdentification('ETH', 'crypto', { network: 'Ethereum' });
    expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
  });

  it('returns error for cash with invalid currency', () => {
    const errors = validateInstrumentIdentification('FAKE', 'cash', {});
    expect(errors.some(e => e.code === 'CASH_CURRENCY_INVALID')).toBe(true);
  });

  it('accepts cash with valid ISO currency', () => {
    const errors = validateInstrumentIdentification('EUR', 'cash', { currencyCode: 'EUR' });
    expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
  });

  it('returns error when symbol is missing for non-classic type', () => {
    const errors = validateInstrumentIdentification(undefined, 'crypto', { exchange: 'Binance' });
    expect(errors.some(e => e.code === 'SYMBOL_REQUIRED')).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// validateRow
// ══════════════════════════════════════════════════════════════════════════════
describe('validateRow', () => {
  const validRow = {
    transactionDate: '2024-01-15',
    amountPrimary: '1000',
    assetSymbol: 'AAPL',
    assetIsin: 'US0378331005',
    type: 'BUY' as const,
    quantity: '10',
    priceUnit: '100',
    rawLabel: 'Buy Apple',
  };

  it('validates a complete valid BUY row in history mode', () => {
    const result = validateRow(validRow, 'history');
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns invalid when date is missing', () => {
    const result = validateRow({ ...validRow, transactionDate: '' }, 'history');
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.code === 'DATE_REQUIRED')).toBe(true);
  });

  it('returns invalid when amount is missing', () => {
    const result = validateRow({ ...validRow, amountPrimary: '' }, 'history');
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.code === 'AMOUNT_REQUIRED')).toBe(true);
  });

  it('snapshot mode requires quantity', () => {
    const result = validateRow({ ...validRow, quantity: undefined }, 'snapshot');
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.code === 'SNAPSHOT_QTY_REQUIRED')).toBe(true);
  });

  it('snapshot mode requires priceUnit', () => {
    const result = validateRow({ ...validRow, priceUnit: undefined }, 'snapshot');
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.code === 'SNAPSHOT_PRICE_REQUIRED')).toBe(true);
  });

  it('separates errors from warnings in result', () => {
    const result = validateRow({ ...validRow, rawLabel: undefined, label: undefined }, 'history');
    // Missing label = warning, not error
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some(e => e.code === 'LABEL_MISSING')).toBe(true);
  });

  it('isValid is false when any error is present', () => {
    const result = validateRow({ ...validRow, transactionDate: 'bad' }, 'history');
    expect(result.isValid).toBe(false);
  });

  it('isValid is true even when only warnings are present', () => {
    // Remove optional label to trigger warning, keep all required fields
    const result = validateRow({ ...validRow, rawLabel: undefined, label: undefined }, 'history');
    expect(result.isValid).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// validateSellQuantity
// ══════════════════════════════════════════════════════════════════════════════
describe('validateSellQuantity', () => {
  it('returns null when sell is less than position', () => {
    expect(validateSellQuantity('5', '10', 'AAPL')).toBeNull();
  });

  it('returns null when sell equals position (full exit)', () => {
    expect(validateSellQuantity('10', '10', 'AAPL')).toBeNull();
  });

  it('returns error when selling more than held', () => {
    const error = validateSellQuantity('15', '10', 'AAPL');
    expect(error).not.toBeNull();
    expect(error!.code).toBe('OVERSELL');
    expect(error!.severity).toBe('error');
    expect(error!.message).toContain('AAPL');
  });

  it('returns null for invalid numeric inputs (cannot determine)', () => {
    expect(validateSellQuantity('abc', '10', 'AAPL')).toBeNull();
    expect(validateSellQuantity('5', 'xyz', 'AAPL')).toBeNull();
  });

  it('returns error for very small oversell (floating point edge)', () => {
    const error = validateSellQuantity('10.001', '10', 'BTC');
    expect(error).not.toBeNull();
    expect(error!.code).toBe('OVERSELL');
  });
});
