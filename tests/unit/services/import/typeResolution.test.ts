/**
 * Type and number resolution (TGLA-147)
 * A CSV without a usable "type" column, or with a foreign vocabulary, must never be
 * silently read as a purchase; FR decimals with 3 fraction digits must not become thousands.
 */
import { describe, it, expect } from 'vitest';
import {
  parseDecimal,
  detectDecimalSeparator,
  detectAmountSignConvention,
  resolveTransactionType,
  normalizeTransactionType,
} from '../../../../src/services/import/typeNormalizer';

const resolve = (
  rawType: string,
  quantity: string | null,
  amount: string | null,
  opts: { amountSigned?: boolean; isCashAsset?: boolean } = {}
) => resolveTransactionType({
  rawType,
  quantity,
  amount,
  amountSigned: opts.amountSigned ?? false,
  isCashAsset: opts.isCashAsset ?? false,
});

describe('parseDecimal with a decimal separator hint', () => {
  it('reads a single comma followed by 3 digits as a decimal when the file uses decimal commas', () => {
    expect(parseDecimal('1,500', ',')).toBe('1.5');
    expect(parseDecimal('12,345', ',')).toBe('12.345');
  });

  it('reads that same comma as a thousands separator when the file uses decimal points', () => {
    expect(parseDecimal('1,500', '.')).toBe('1500');
  });

  it('keeps the historical default without a hint', () => {
    expect(parseDecimal('1,500')).toBe('1500');
    expect(parseDecimal('1.500')).toBe('1.5');
  });

  it('reads a single point followed by 3 digits as thousands when the file uses decimal commas', () => {
    expect(parseDecimal('1.500', ',')).toBe('1500');
  });

  it('does not let the hint change unambiguous values', () => {
    expect(parseDecimal('1 234,56', '.')).toBe('1234.56');
    expect(parseDecimal('1,234.56', ',')).toBe('1234.56');
    expect(parseDecimal('2,5', '.')).toBe('2.5');
  });
});

describe('detectDecimalSeparator', () => {
  it('finds the comma from a mix of values', () => {
    expect(detectDecimalSeparator(['1 234,56', '-2,00', '10'])).toBe(',');
  });

  it('finds the point from a mix of values', () => {
    expect(detectDecimalSeparator(['1,234.56', '3.5'])).toBe('.');
  });

  it('falls back to the comma when only 3-digit groups exist in a semicolon file', () => {
    expect(detectDecimalSeparator(['1,500', '2,000'], ';')).toBe(',');
  });

  it('stays undecided when 3-digit groups are all there is in a comma file', () => {
    expect(detectDecimalSeparator(['1,500', '2,000'], ',')).toBeUndefined();
  });

  it('ignores empty and non numeric samples', () => {
    expect(detectDecimalSeparator(['', 'abc', '12,5'])).toBe(',');
    expect(detectDecimalSeparator([])).toBeUndefined();
  });
});

describe('detectAmountSignConvention', () => {
  it('is signed only when the column mixes negative and positive values', () => {
    expect(detectAmountSignConvention(['-1250,45', '+3500,00', '-10'])).toBe('signed');
  });

  it('is unsigned when every value is positive', () => {
    expect(detectAmountSignConvention(['10', '25,5', '300'])).toBe('unsigned');
  });

  it('is unsigned when every value is negative', () => {
    expect(detectAmountSignConvention(['-10', '-25,5'])).toBe('unsigned');
  });
});

describe('resolveTransactionType — label vocabulary', () => {
  it.each([
    ['Kauf', 'BUY'],
    ['Souscription', 'BUY'],
    ['Transaction Buy', 'BUY'],
    ['Transaction Revenue', 'BUY'],
    ['Verkauf', 'SELL'],
    ['Rachat', 'SELL'],
    ['Transaction Spend', 'SELL'],
    ['Transaction Sold', 'SELL'],
    ['Apport', 'DEPOSIT'],
    ['Coupon', 'INCOME'],
  ])('reads %s as %s from the label', (label, expected) => {
    const result = resolve(label, '1', '10');
    expect(result.type).toBe(expected);
    expect(result.source).toBe('label');
    expect(result.recognized).toBe(true);
    expect(result.corporateAction).toBe(false);
  });

  it.each(['Split', 'Reverse split', 'Regroupement', 'Spin-off'])('flags %s as a corporate action', label => {
    const result = resolve(label, '10', null);
    expect(result.corporateAction).toBe(true);
    expect(result.recognized).toBe(true);
  });

  it('applies the new vocabulary to normalizeTransactionType without touching known labels', () => {
    expect(normalizeTransactionType('Rachat')).toBe('SELL');
    expect(normalizeTransactionType('Verkauf')).toBe('SELL');
    expect(normalizeTransactionType('Achat comptant')).toBe('BUY');
    expect(normalizeTransactionType('Virement reçu')).toBe('DEPOSIT');
    expect(normalizeTransactionType('Small Assets Exchange')).toBe('SWAP');
  });
});

describe('resolveTransactionType — signs when the label says nothing', () => {
  it('reads a negative quantity as a sell', () => {
    const result = resolve('', '-4', '760');
    expect(result.type).toBe('SELL');
    expect(result.source).toBe('sign');
  });

  it('reads a positive quantity as a buy', () => {
    expect(resolve('', '10', '-1850').type).toBe('BUY');
  });

  it('follows the cash flow when quantities are unsigned and amounts mix signs', () => {
    expect(resolve('', '5', '-50', { amountSigned: true }).type).toBe('BUY');
    expect(resolve('', '5', '50', { amountSigned: true }).type).toBe('SELL');
  });

  it('reads a negative amount without quantity as a buy (cash out)', () => {
    const result = resolve('', null, '-1250', { amountSigned: true });
    expect(result.type).toBe('BUY');
    expect(result.source).toBe('sign');
  });

  it('reads a positive amount without quantity as a sell when the amounts mix signs', () => {
    expect(resolve('', null, '3500', { amountSigned: true }).type).toBe('SELL');
  });

  it('keeps a buy for an unsigned amount column and says it was a default', () => {
    const result = resolve('', null, '1000');
    expect(result.type).toBe('BUY');
    expect(result.source).toBe('default');
  });

  it('flags an unknown label while still using the sign', () => {
    const result = resolve('Foo', '5', '50');
    expect(result.type).toBe('BUY');
    expect(result.recognized).toBe(false);
    expect(result.source).toBe('sign');
  });

  it('uses the sign of an unknown label too', () => {
    const result = resolve('Foo', '-5', '50');
    expect(result.type).toBe('SELL');
    expect(result.recognized).toBe(false);
  });
});

describe('resolveTransactionType — cash lines', () => {
  it('reads a negative amount on a currency as a withdrawal', () => {
    expect(resolve('', null, '-1250', { isCashAsset: true }).type).toBe('WITHDRAW');
  });

  it('reads a positive amount on a currency as a deposit', () => {
    expect(resolve('', null, '3500', { isCashAsset: true, amountSigned: true }).type).toBe('DEPOSIT');
  });

  it('never books a purchase of a currency: ACHAT on cash is a withdrawal', () => {
    const result = resolve('ACHAT AMUNDI ETF', null, '-1250.45', { isCashAsset: true });
    expect(result.type).toBe('WITHDRAW');
    expect(result.source).toBe('label');
  });

  it('turns a sale label on cash into a deposit', () => {
    expect(resolve('VENTE LVMH', null, '1420.8', { isCashAsset: true }).type).toBe('DEPOSIT');
  });

  it('keeps income and expense labels on cash', () => {
    expect(resolve('Dividende', null, '12', { isCashAsset: true }).type).toBe('INCOME');
    expect(resolve('Frais de tenue de compte', null, '-2', { isCashAsset: true }).type).toBe('EXPENSE');
  });
});

describe('credited income (TGLA-188)', () => {
  it('reads a credited dividend or interest as income, and debited interest as a withdrawal', () => {
    expect(normalizeTransactionType('Dividende crédité')).toBe('INCOME');
    expect(normalizeTransactionType('Intérêts crédités')).toBe('INCOME');
    expect(normalizeTransactionType('Interest credit')).toBe('INCOME');
    expect(normalizeTransactionType('Intérêts débiteurs')).toBe('WITHDRAW');
    expect(normalizeTransactionType('Virement crédité')).toBe('DEPOSIT');
  });
});
