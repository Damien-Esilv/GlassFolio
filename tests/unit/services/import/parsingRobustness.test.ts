/**
 * Tests — E28 parsing robustness (TGLA-102)
 * Covers real-world broker CSV quirks: localized numbers, ambiguous dates,
 * RFC 4180 quoting, preamble lines and legacy encodings.
 */

import { describe, it, expect } from 'vitest';
import {
  parseCSVText,
  parseDecimal,
  parseDate,
  detectDateFormat,
  detectDelimiter,
  decodeCsvBuffer,
  readCsvFile,
} from '../../../../src/services/import/csvParser';

describe('parseDecimal — localized formats', () => {
  it.each([
    ['1 234,56', '1234.56'],
    ['1 234,56', '1234.56'],
    ['1 234,56 €', '1234.56'],
    ['1234,56 €', '1234.56'],
    ['-1.234,56 €', '-1234.56'],
    ['EUR 12.50', '12.5'],
    ['+3500.00', '3500'],
    ['(12.50)', '-12.5'],
    ['12,50-', '-12.5'],
    ["1'234.56", '1234.56'],
    ['1.2E-5', '0.000012'],
    ['−5,5', '-5.5'],
    ['1.234.567', '1234567'],
    ['1,234,567.89', '1234567.89'],
    ['0,123', '0.123'],
    ['12 %', '12'],
  ])('parses %s as %s', (input, expected) => {
    expect(parseDecimal(input)).toBe(expected);
  });

  it.each(['N/A', '-', '1,2,3,4', '1.2.3,4,5', ''])('rejects %s', input => {
    expect(parseDecimal(input)).toBeNull();
  });
});

describe('parseDate — deterministic and strict', () => {
  it('honours the MM/DD hint even when the day is <= 12', () => {
    expect(parseDate('05/03/2024', 'MM/DD/YYYY')).toBe('2024-05-03T00:00:00.000Z');
    expect(parseDate('05/03/2024')).toBe('2024-03-05T00:00:00.000Z');
  });

  it('auto-detects an unambiguous US date without hint', () => {
    expect(parseDate('01/15/2024')).toBe('2024-01-15T00:00:00.000Z');
  });

  it('reads ISO datetimes without offset as UTC (timezone-independent)', () => {
    expect(parseDate('2024-01-15 10:30:00')).toBe('2024-01-15T10:30:00.000Z');
  });

  it('applies explicit offsets', () => {
    expect(parseDate('2024-01-15T10:30:00+02:00')).toBe('2024-01-15T08:30:00.000Z');
  });

  it('rejects impossible calendar dates instead of rolling over', () => {
    expect(parseDate('31/02/2024')).toBeNull();
    expect(parseDate('2024-02-30')).toBeNull();
  });

  it('supports 2-digit years, month names and epoch timestamps', () => {
    expect(parseDate('15/01/24')).toBe('2024-01-15T00:00:00.000Z');
    expect(parseDate('15 janv. 2024')).toBe('2024-01-15T00:00:00.000Z');
    expect(parseDate('15 août 2024')).toBe('2024-08-15T00:00:00.000Z');
    expect(parseDate('Jan 15, 2024')).toBe('2024-01-15T00:00:00.000Z');
    expect(parseDate('1705314600')).toBe('2024-01-15T10:30:00.000Z');
    expect(parseDate('1705314600000')).toBe('2024-01-15T10:30:00.000Z');
  });

  it('detects the day/month order of a whole column', () => {
    expect(detectDateFormat(['01/02/2024', '03/25/2024'])).toBe('MM/DD/YYYY');
    expect(detectDateFormat(['01/02/2024', '25/03/2024'])).toBe('DD/MM/YYYY');
    expect(detectDateFormat(['01/02/2024', '2024-03-05'])).toBeUndefined();
  });
});

describe('parseCSVText — RFC 4180 and broker quirks', () => {
  it('keeps line breaks and escaped quotes inside quoted fields', () => {
    const csv = 'label,amount\n"Achat ""ETF""\nMSCI World",100\nVente,50';
    const result = parseCSVText(csv);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0][0]).toBe('Achat "ETF"\nMSCI World');
  });

  it('strips the UTF-8 BOM from the first header', () => {
    const result = parseCSVText('﻿Date;Montant\n2024-01-01;10');
    expect(result.headers[0]).toBe('Date');
  });

  it('prefers ";" when commas only appear as decimal separators', () => {
    const csv = 'Date;Montant;Quantité\n15/01/2024;1250,50;3,5\n16/01/2024;99,90;1';
    expect(detectDelimiter(csv)).toBe(';');
    expect(parseCSVText(csv).rows[0]).toEqual(['15/01/2024', '1250,50', '3,5']);
  });

  it('skips preamble lines above the header row', () => {
    const csv = 'Export du compte titres\nGénéré le 15/01/2024\n\nISIN;Libellé;Quantité;PRU\nFR0000120271;TotalEnergies;25;58,45\nFR0000121014;LVMH;3;725,80';
    const result = parseCSVText(csv);
    expect(result.delimiter).toBe(';');
    expect(result.headers).toEqual(['ISIN', 'Libellé', 'Quantité', 'PRU']);
    expect(result.rows).toHaveLength(2);
    expect(result.headerRowIndex).toBe(2);
  });

  it('still skips preamble lines when the delimiter is forced (re-parse at analysis time)', () => {
    const csv = 'Relevé PEA\nDate;Montant\n15/01/2024;10\n16/01/2024;20';
    const result = parseCSVText(csv, ';');
    expect(result.headers).toEqual(['Date', 'Montant']);
    expect(result.rows).toHaveLength(2);
  });

  it('drops Excel empty padding rows', () => {
    const result = parseCSVText('a;b;c\n1;2;3\n;;\n;;');
    expect(result.rows).toEqual([['1', '2', '3']]);
  });
});

describe('decodeCsvBuffer — encoding detection', () => {
  it('decodes Windows-1252 exports (French banks / Excel)', () => {
    // "Libellé;Montant\nAchat;12,50 €" encoded in cp1252 (é = 0xE9, € = 0x80)
    const bytes = new Uint8Array([
      0x4c, 0x69, 0x62, 0x65, 0x6c, 0x6c, 0xe9, 0x3b, 0x4d, 0x6f, 0x6e, 0x74, 0x61, 0x6e, 0x74, 0x0a,
      0x41, 0x63, 0x68, 0x61, 0x74, 0x3b, 0x31, 0x32, 0x2c, 0x35, 0x30, 0x20, 0x80,
    ]);
    const { text, encoding } = decodeCsvBuffer(bytes.buffer);
    expect(encoding).toBe('windows-1252');
    expect(text).toBe('Libellé;Montant\nAchat;12,50 €');
  });

  it('decodes UTF-8 with BOM', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Libellé;Montant')]);
    const { text, encoding } = decodeCsvBuffer(bytes.buffer);
    expect(encoding).toBe('utf-8');
    expect(text).toBe('Libellé;Montant');
  });

  it('decodes UTF-16LE with BOM (Excel "Unicode text")', () => {
    const body = 'Date\tMontant';
    const bytes = new Uint8Array(2 + body.length * 2);
    bytes[0] = 0xff;
    bytes[1] = 0xfe;
    for (let i = 0; i < body.length; i++) bytes[2 + i * 2] = body.charCodeAt(i);
    const { text, encoding } = decodeCsvBuffer(bytes.buffer);
    expect(encoding).toBe('utf-16le');
    expect(text).toBe(body);
  });

  it('reads a File through readCsvFile', async () => {
    const file = new File(['Date,Amount\n2024-01-01,10'], 'test.csv', { type: 'text/csv' });
    const { text } = await readCsvFile(file);
    expect(parseCSVText(text).headers).toEqual(['Date', 'Amount']);
  });
});
