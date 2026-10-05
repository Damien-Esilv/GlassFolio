/**
 * Tests — transactionManager.ts
 * Covers: computeHash, computeFileHash, computeRowHash
 * Note: commitBatch / rollbackBatch depend on db (localStorage) — tested via integration tests.
 */

import { describe, it, expect } from 'vitest';
import {
  computeHash,
  computeFileHash,
  computeRowHash,
} from '../../../../src/services/core/transactionManager';

// ══════════════════════════════════════════════════════════════════════════════
// computeHash
// ══════════════════════════════════════════════════════════════════════════════
describe('computeHash', () => {
  it('returns a 64-character hex string', async () => {
    const hash = await computeHash('hello world');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('is deterministic — same input gives same hash', async () => {
    const h1 = await computeHash('test-input');
    const h2 = await computeHash('test-input');
    expect(h1).toBe(h2);
  });

  it('different inputs produce different hashes', async () => {
    const h1 = await computeHash('input-a');
    const h2 = await computeHash('input-b');
    expect(h1).not.toBe(h2);
  });

  it('handles empty string', async () => {
    const hash = await computeHash('');
    expect(hash).toHaveLength(64);
  });

  it('handles unicode characters', async () => {
    const hash = await computeHash('€ Achèt 日本語');
    expect(hash).toHaveLength(64);
  });

  it('is case-sensitive', async () => {
    const h1 = await computeHash('Hello');
    const h2 = await computeHash('hello');
    expect(h1).not.toBe(h2);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// computeFileHash
// ══════════════════════════════════════════════════════════════════════════════
describe('computeFileHash', () => {
  it('returns a valid 64-char hex hash', async () => {
    const hash = await computeFileHash('date,amount\n2024-01-01,100');
    expect(hash).toHaveLength(64);
  });

  it('normalizes BOM — files with and without BOM produce same hash', async () => {
    const withBOM = '\uFEFFdate,amount\n2024-01-01,100';
    const withoutBOM = 'date,amount\n2024-01-01,100';
    expect(await computeFileHash(withBOM)).toBe(await computeFileHash(withoutBOM));
  });

  it('normalizes CRLF — Windows and Unix line endings produce same hash', async () => {
    const crlf = 'date,amount\r\n2024-01-01,100';
    const lf   = 'date,amount\n2024-01-01,100';
    expect(await computeFileHash(crlf)).toBe(await computeFileHash(lf));
  });

  it('normalizes surrounding whitespace', async () => {
    const trimmed  = 'date,amount\n2024-01-01,100';
    const padded   = '  date,amount\n2024-01-01,100  ';
    expect(await computeFileHash(trimmed)).toBe(await computeFileHash(padded));
  });

  it('handles empty file', async () => {
    const hash = await computeFileHash('');
    expect(hash).toHaveLength(64);
  });

  it('produces different hash for different content', async () => {
    const h1 = await computeFileHash('content-a');
    const h2 = await computeFileHash('content-b');
    expect(h1).not.toBe(h2);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// computeRowHash
// ══════════════════════════════════════════════════════════════════════════════
describe('computeRowHash', () => {
  const base = {
    date: '2024-01-15T00:00:00Z',
    amount: '1000',
    symbol: 'AAPL',
    type: 'BUY',
    fees: '5',
  };

  it('returns a 64-char hex hash', async () => {
    const hash = await computeRowHash(base.date, base.amount, base.symbol, base.type, base.fees);
    expect(hash).toHaveLength(64);
  });

  it('is deterministic', async () => {
    const h1 = await computeRowHash(base.date, base.amount, base.symbol, base.type, base.fees);
    const h2 = await computeRowHash(base.date, base.amount, base.symbol, base.type, base.fees);
    expect(h1).toBe(h2);
  });

  it('normalizes date to YYYY-MM-DD — same day with/without time produces same hash', async () => {
    const withTime    = await computeRowHash('2024-01-15T10:30:00Z', base.amount, base.symbol, base.type);
    const withoutTime = await computeRowHash('2024-01-15', base.amount, base.symbol, base.type);
    expect(withTime).toBe(withoutTime);
  });

  it('normalizes symbol to uppercase', async () => {
    const h1 = await computeRowHash(base.date, base.amount, 'AAPL', base.type);
    const h2 = await computeRowHash(base.date, base.amount, 'aapl', base.type);
    expect(h1).toBe(h2);
  });

  it('handles missing fees gracefully (defaults to 0)', async () => {
    const withNoFee   = await computeRowHash(base.date, base.amount, base.symbol, base.type, undefined);
    const withZeroFee = await computeRowHash(base.date, base.amount, base.symbol, base.type, '0');
    expect(withNoFee).toBe(withZeroFee);
  });

  it('different types produce different hashes', async () => {
    const buyHash  = await computeRowHash(base.date, base.amount, base.symbol, 'BUY');
    const sellHash = await computeRowHash(base.date, base.amount, base.symbol, 'SELL');
    expect(buyHash).not.toBe(sellHash);
  });

  it('different amounts produce different hashes', async () => {
    const h1 = await computeRowHash(base.date, '1000', base.symbol, base.type);
    const h2 = await computeRowHash(base.date, '2000', base.symbol, base.type);
    expect(h1).not.toBe(h2);
  });

  it('different dates produce different hashes', async () => {
    const h1 = await computeRowHash('2024-01-15', base.amount, base.symbol, base.type);
    const h2 = await computeRowHash('2024-01-16', base.amount, base.symbol, base.type);
    expect(h1).not.toBe(h2);
  });

  it('normalizes amount to 8 decimal places — trailing zeros match', async () => {
    const h1 = await computeRowHash(base.date, '1000', base.symbol, base.type);
    const h2 = await computeRowHash(base.date, '1000.00000000', base.symbol, base.type);
    expect(h1).toBe(h2);
  });
});
