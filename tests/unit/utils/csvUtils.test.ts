/**
 * Tests — utils/csvUtils.ts
 * Covers: parseCSV (delimiter detection, quoting, edge cases)
 * Note: similar to csvParser but for the legacy utility used in components.
 */

import { describe, it, expect } from 'vitest';
import { parseCSV } from '../../../utils/csvUtils';

describe('parseCSV', () => {
  it('returns empty structure for less than 2 lines', () => {
    const result = parseCSV('only-one-line');
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it('returns empty structure for empty string', () => {
    const result = parseCSV('');
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it('parses comma-delimited CSV', () => {
    const csv = 'date,amount,label\n2024-01-01,100,Buy';
    const result = parseCSV(csv);
    expect(result.headers).toEqual(['date', 'amount', 'label']);
    expect(result.rows[0]).toEqual(['2024-01-01', '100', 'Buy']);
  });

  it('auto-detects semicolon delimiter', () => {
    const csv = 'date;amount\n2024-01-01;100';
    const result = parseCSV(csv);
    expect(result.rows[0]).toEqual(['2024-01-01', '100']);
  });

  it('auto-detects tab delimiter', () => {
    const csv = 'date\tamount\n2024-01-01\t100';
    const result = parseCSV(csv);
    expect(result.rows[0]).toEqual(['2024-01-01', '100']);
  });

  it('handles quoted fields with delimiter inside', () => {
    const csv = 'name,description\n"AAPL","Buy, Apple Inc"';
    const result = parseCSV(csv);
    expect(result.rows[0][1]).toBe('Buy, Apple Inc');
  });

  it('handles CRLF line endings', () => {
    const csv = 'date,amount\r\n2024-01-01,100\r\n2024-01-02,200';
    const result = parseCSV(csv);
    expect(result.rows).toHaveLength(2);
  });

  it('handles multiple data rows', () => {
    const lines = ['date,amount', ...Array.from({ length: 10 }, (_, i) => `2024-01-0${i + 1},${(i + 1) * 100}`)];
    const result = parseCSV(lines.join('\n'));
    expect(result.rows).toHaveLength(10);
  });

  it('trims cell whitespace', () => {
    const csv = ' date , amount \n 2024-01-01 , 100 ';
    const result = parseCSV(csv);
    expect(result.headers[0]).toBe('date');
  });
});
