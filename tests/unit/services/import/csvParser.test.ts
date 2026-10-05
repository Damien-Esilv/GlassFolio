/**
 * Tests — csvParser.ts
 * Covers: parseCSVText, parseDate, parseDecimal, getValue, rowToObject
 */

import { describe, it, expect } from 'vitest';
import {
  parseCSVText,
  parseDate,
  parseDecimal,
  getValue,
  rowToObject,
} from '../../../../src/services/import/csvParser';

// ══════════════════════════════════════════════════════════════════════════════
// parseCSVText
// ══════════════════════════════════════════════════════════════════════════════
describe('parseCSVText', () => {
  it('parses a simple comma-delimited CSV', () => {
    const csv = 'date,amount,label\n2024-01-01,100,Buy AAPL';
    const result = parseCSVText(csv);
    expect(result.headers).toEqual(['date', 'amount', 'label']);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual(['2024-01-01', '100', 'Buy AAPL']);
    expect(result.delimiter).toBe(',');
  });

  it('auto-detects semicolon delimiter', () => {
    const csv = 'date;amount;label\n2024-01-01;100;Buy AAPL';
    const result = parseCSVText(csv);
    expect(result.delimiter).toBe(';');
    expect(result.rows[0]).toEqual(['2024-01-01', '100', 'Buy AAPL']);
  });

  it('auto-detects tab delimiter', () => {
    const csv = 'date\tamount\tlabel\n2024-01-01\t100\tBuy AAPL';
    const result = parseCSVText(csv);
    expect(result.delimiter).toBe('\t');
    expect(result.rows[0]).toEqual(['2024-01-01', '100', 'Buy AAPL']);
  });

  it('auto-detects pipe delimiter', () => {
    const csv = 'date|amount|label\n2024-01-01|100|Buy AAPL';
    const result = parseCSVText(csv);
    expect(result.delimiter).toBe('|');
  });

  it('respects forced delimiter', () => {
    const csv = 'date;amount\n2024-01-01;100';
    const result = parseCSVText(csv, ',');
    // Forced comma → header is one big cell
    expect(result.delimiter).toBe(',');
    expect(result.headers).toHaveLength(1);
  });

  it('handles quoted fields containing the delimiter', () => {
    const csv = 'name,description\n"AAPL","Buy, Apple Inc"';
    const result = parseCSVText(csv);
    expect(result.rows[0][1]).toBe('Buy, Apple Inc');
  });

  it('returns empty structure for empty string', () => {
    const result = parseCSVText('');
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it('returns empty structure for whitespace-only string', () => {
    const result = parseCSVText('   \n   ');
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it('handles CRLF line endings', () => {
    const csv = 'date,amount\r\n2024-01-01,100\r\n2024-01-02,200';
    const result = parseCSVText(csv);
    expect(result.rows).toHaveLength(2);
  });

  it('trims whitespace from cell values', () => {
    const csv = 'date , amount \n 2024-01-01 , 100 ';
    const result = parseCSVText(csv);
    expect(result.headers[0]).toBe('date');
    expect(result.headers[1]).toBe('amount');
  });

  it('handles a header-only CSV with no data rows', () => {
    const csv = 'date,amount,label';
    const result = parseCSVText(csv);
    expect(result.headers).toHaveLength(3);
    expect(result.rows).toHaveLength(0);
  });

  it('handles rows with fewer columns than header', () => {
    const csv = 'date,amount,label\n2024-01-01,100';
    const result = parseCSVText(csv);
    expect(result.rows[0]).toHaveLength(2);
  });

  it('handles unicode characters in cells', () => {
    const csv = 'label,amount\nAchèt LVMH,1000';
    const result = parseCSVText(csv);
    expect(result.rows[0][0]).toBe('Achèt LVMH');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// parseDate
// ══════════════════════════════════════════════════════════════════════════════
describe('parseDate', () => {
  it('parses ISO 8601 date string', () => {
    const result = parseDate('2024-01-15');
    expect(result).not.toBeNull();
    expect(result).toContain('2024-01-15');
  });

  it('parses ISO 8601 datetime string', () => {
    const result = parseDate('2024-01-15T10:30:00Z');
    expect(result).not.toBeNull();
    expect(result).toContain('2024-01-15');
  });

  it('parses European DD/MM/YYYY format', () => {
    const result = parseDate('15/01/2024');
    expect(result).not.toBeNull();
    expect(result).toContain('2024-01-15');
  });

  it('parses European DD-MM-YYYY format', () => {
    const result = parseDate('15-01-2024');
    expect(result).not.toBeNull();
    expect(result).toContain('2024-01-15');
  });

  it('parses European DD.MM.YYYY format', () => {
    const result = parseDate('15.01.2024');
    expect(result).not.toBeNull();
    expect(result).toContain('2024-01-15');
  });

  it('parses US MM/DD/YYYY format with hint', () => {
    const result = parseDate('01/15/2024', 'MM/DD/YYYY');
    expect(result).not.toBeNull();
    expect(result).toContain('2024-01-15');
  });

  it('parses European date with time (DD/MM/YYYY HH:MM:SS)', () => {
    const result = parseDate('15/01/2024 14:30:00');
    expect(result).not.toBeNull();
    expect(result).toContain('2024-01-15');
    expect(result).toContain('14:30');
  });

  it('returns null for empty string', () => {
    expect(parseDate('')).toBeNull();
  });

  it('returns null for whitespace string', () => {
    expect(parseDate('   ')).toBeNull();
  });

  it('returns null for completely invalid date', () => {
    expect(parseDate('not-a-date')).toBeNull();
  });

  it('returns a valid ISO string (ends with Z or +00:00)', () => {
    const result = parseDate('2024-06-01');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// parseDecimal
// ══════════════════════════════════════════════════════════════════════════════
describe('parseDecimal', () => {
  it('parses simple integer string', () => {
    expect(parseDecimal('100')).toBe('100');
  });

  it('parses simple decimal with dot', () => {
    expect(parseDecimal('1234.56')).toBe('1234.56');
  });

  it('parses European decimal with comma', () => {
    expect(parseDecimal('1234,56')).toBe('1234.56');
  });

  it('parses European format with thousands dots and comma decimal', () => {
    expect(parseDecimal('1.234,56')).toBe('1234.56');
  });

  it('parses US format with thousands commas', () => {
    expect(parseDecimal('1,234.56')).toBe('1234.56');
  });

  it('parses negative value', () => {
    expect(parseDecimal('-1234.56')).toBe('-1234.56');
  });

  it('parses negative European format', () => {
    expect(parseDecimal('-1234,56')).toBe('-1234.56');
  });

  it('strips EUR symbol', () => {
    expect(parseDecimal('€1234.56')).toBe('1234.56');
  });

  it('strips USD symbol', () => {
    expect(parseDecimal('$1234.56')).toBe('1234.56');
  });

  it('strips GBP symbol', () => {
    expect(parseDecimal('£1234.56')).toBe('1234.56');
  });

  it('returns null for empty string', () => {
    expect(parseDecimal('')).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(parseDecimal(undefined)).toBeNull();
  });

  it('returns null for non-numeric text', () => {
    expect(parseDecimal('abc')).toBeNull();
  });

  it('handles zero', () => {
    expect(parseDecimal('0')).toBe('0');
  });

  it('handles very large numbers', () => {
    const result = parseDecimal('999999999.99');
    expect(result).toBe('999999999.99');
  });

  it('handles very small amounts (fractions of a cent)', () => {
    const result = parseDecimal('0.000001');
    expect(parseFloat(result!)).toBeCloseTo(0.000001);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// getValue
// ══════════════════════════════════════════════════════════════════════════════
describe('getValue', () => {
  const headers = ['date', 'amount', 'label'];
  const row = ['2024-01-01', '100', 'Buy AAPL'];

  it('gets value by header name', () => {
    expect(getValue(row, headers, 'amount')).toBe('100');
  });

  it('gets value by numeric index', () => {
    expect(getValue(row, headers, 0)).toBe('2024-01-01');
  });

  it('returns undefined for missing header', () => {
    expect(getValue(row, headers, 'nonexistent')).toBeUndefined();
  });

  it('returns undefined when mapping is undefined', () => {
    expect(getValue(row, headers, undefined)).toBeUndefined();
  });

  it('gets last column by name', () => {
    expect(getValue(row, headers, 'label')).toBe('Buy AAPL');
  });

  it('gets value at numeric index 2', () => {
    expect(getValue(row, headers, 2)).toBe('Buy AAPL');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// rowToObject
// ══════════════════════════════════════════════════════════════════════════════
describe('rowToObject', () => {
  it('converts row and headers to an object', () => {
    const headers = ['date', 'amount', 'label'];
    const row = ['2024-01-01', '100', 'Buy AAPL'];
    const result = rowToObject(row, headers);
    expect(result).toEqual({ date: '2024-01-01', amount: '100', label: 'Buy AAPL' });
  });

  it('fills missing row cells with empty string', () => {
    const headers = ['date', 'amount', 'label'];
    const row = ['2024-01-01'];
    const result = rowToObject(row, headers);
    expect(result.amount).toBe('');
    expect(result.label).toBe('');
  });

  it('handles empty headers and row', () => {
    const result = rowToObject([], []);
    expect(result).toEqual({});
  });
});
