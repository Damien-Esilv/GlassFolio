/**
 * Export -> import round trip, end to end (TGLA-152)
 * What the transactions CSV export writes must come back as the same positions, the same
 * realized gains and the same dashboard totals on a fresh account. Also: an unknown broker
 * layout (German headers, decimal commas, a negative sell quantity) imports without any
 * hand-made mapping.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../../../../src/services/db', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../src/services/db')>();
  return { ...actual, delay: () => Promise.resolve() };
});
vi.mock('../../../../src/services/priceService', () => ({
  refreshPositionPrices: vi.fn(async <T,>(positions: T[]) => positions),
  fetchRealPriceHistory: vi.fn(async () => []),
  getLastPriceFetchTime: vi.fn(() => null),
  clearPriceCache: vi.fn(),
}));
vi.mock('../../../../src/services/currencyService', () => ({
  currencyService: {
    getExchangeRates: vi.fn(async () => ({})),
    convertAmount: vi.fn((amount: number) => amount),
  },
}));

import { db } from '../../../../src/services/db';
import { vaultService } from '../../../../src/services/security/vaultService';
import { LocalAuthProvider } from '../../../../src/services/security/authService';
import { parseFile, commitBatch, parseCSVText, detectPreset } from '../../../../src/services/import/importManager';
import type { FieldMappings } from '../../../../src/services/import/importManager';
import { proposeColumnMapping, proposalsToMappings, HISTORY_COLUMN_SPECS } from '../../../../src/services/import/columnMatcher';
import { buildTransactionsCSV } from '../../../../src/services/exportService';
import { portfolioService } from '../../../../src/services/portfolioService';

const seedAccounts = async (): Promise<void> => {
  localStorage.clear();
  await vaultService.resetVault();
  await new LocalAuthProvider().signUp('roundtrip-totals@example.test', 'Roundtrip-Totals-Key-2026!#', 'Round Trip');
  db.saveInstitutes([{ id: 'inst-1', ownerId: 'u', name: 'Broker', type: 'BROKER' } as never]);
  db.saveAccounts([
    { id: 'acc-a', ownerId: 'u', instituteId: 'inst-1', name: 'CTO A', type: 'investment', defaultCurrency: 'EUR', isActive: true } as never,
    { id: 'acc-b', ownerId: 'u', instituteId: 'inst-1', name: 'CTO B', type: 'investment', defaultCurrency: 'EUR', isActive: true } as never,
  ]);
};

/** Same choice as the wizard: a known preset first (GlassFolio's own export is one), then the proposals. */
const mappingsFor = (csv: string): FieldMappings => {
  const { headers, rows } = parseCSVText(csv);
  const preset = detectPreset(headers);
  return (preset ? preset.mappings : proposalsToMappings(proposeColumnMapping(headers, rows, HISTORY_COLUMN_SPECS))) as FieldMappings;
};

const importInto = async (accountId: string, csv: string, mappings: FieldMappings = mappingsFor(csv)) => {
  const parsed = await parseFile(csv, { accountId, mode: 'history', customMappings: mappings });
  const result = await commitBatch(parsed.candidates, accountId, 'history', 'file.csv', parsed.fileHash, 'u');
  expect(result.success, JSON.stringify(parsed.stats)).toBe(true);
  return parsed;
};

const positionsOf = () => db.getPositions()
  .map(p => ({ symbol: p.symbol, quantity: p.quantity, avgCost: p.avgCost, lastPrice: p.lastPrice }))
  .sort((a, b) => a.symbol.localeCompare(b.symbol));

const BROKER_CSV = [
  'Date,Type,Symbol,Shares,Price,Amount,Fee',
  '2024-01-05,BUY,AAPL,10,100,1000,1',
  '2024-01-19,BUY,AAPL,5,120,600,1',
  '2024-02-02,BUY,MSFT,3,300,900,2',
  '2024-03-01,SELL,AAPL,8,130,1040,1',
].join('\n');

describe('export -> import round trip', () => {
  beforeEach(seedAccounts);

  it('brings back the same positions, realized gain and dashboard totals on a fresh account', async () => {
    await importInto('acc-a', BROKER_CSV);
    const positionsBefore = positionsOf();
    const realizedBefore = (await portfolioService.getRealizedPL('EUR')).total;
    const summaryBefore = await portfolioService.getDashboardSummary('ALL', 'EUR');
    expect(positionsBefore.map(p => p.symbol)).toEqual(['AAPL', 'MSFT']);
    expect(realizedBefore).not.toBe(0);

    const exported = buildTransactionsCSV();

    // A brand new account: nothing of the first import is left
    db.saveUnifiedTransactions([]);
    db.saveImportBatches([]);
    db.savePositions([]);
    await importInto('acc-b', exported);

    const positionsAfter = positionsOf();
    expect(positionsAfter).toHaveLength(positionsBefore.length);
    positionsBefore.forEach((before, index) => {
      expect(positionsAfter[index].symbol).toBe(before.symbol);
      expect(positionsAfter[index].quantity).toBeCloseTo(before.quantity, 6);
      expect(positionsAfter[index].avgCost).toBeCloseTo(before.avgCost, 6);
    });
    expect((await portfolioService.getRealizedPL('EUR')).total).toBeCloseTo(realizedBefore, 6);
    const summaryAfter = await portfolioService.getDashboardSummary('ALL', 'EUR');
    expect(summaryAfter.totalCost).toBeCloseTo(summaryBefore.totalCost, 6);
    expect(summaryAfter.totalValue).toBeCloseTo(summaryBefore.totalValue, 6);
  });

  it('carries the cost basis method as data, not in the CSV: FIFO still round-trips the quantities', async () => {
    db.saveAccounts(db.getAccounts().map(a => ({ ...a, costBasisMethod: 'FIFO' as const })));
    await importInto('acc-a', BROKER_CSV);
    const quantities = positionsOf().map(p => [p.symbol, p.quantity]);

    const exported = buildTransactionsCSV();
    db.saveUnifiedTransactions([]);
    db.saveImportBatches([]);
    db.savePositions([]);
    await importInto('acc-b', exported);

    expect(positionsOf().map(p => [p.symbol, p.quantity])).toEqual(quantities);
  });
});

describe('an unknown broker layout', () => {
  beforeEach(seedAccounts);

  it('imports test-data/unknown_de_broker_2024.csv from the proposals alone', async () => {
    const csv = fs.readFileSync(path.join(process.cwd(), 'test-data', 'unknown_de_broker_2024.csv'), 'utf8');
    const { headers, rows } = parseCSVText(csv);
    const proposals = proposeColumnMapping(headers, rows, HISTORY_COLUMN_SPECS);
    expect(proposals.every(p => p.status === 'matched'), JSON.stringify(proposals.map(p => [p.header, p.field, p.status]))).toBe(true);

    const parsed = await importInto('acc-a', csv);

    expect(parsed.stats.total).toBe(9);
    expect(parsed.stats.errors).toBe(0);
    const sell = parsed.candidates[4].parsed; // "-6" in the file
    expect(sell.type).toBe('SELL');
    expect(sell.quantity).toBe('6');
    expect(parsed.candidates[8].parsed.quantity).toBe('1.5'); // "1,500" is a fractional share, not 1500

    const bySymbol = Object.fromEntries(positionsOf().map(p => [p.symbol, p]));
    expect(Object.keys(bySymbol).sort()).toEqual(['DE0005557508', 'DE0007164600', 'DE0007236101', 'DE0008404005']);
    // SAP: 10 + 5 bought (fees included), 6 sold at the average, 1.5 bought
    expect(bySymbol.DE0007164600.quantity).toBeCloseTo(10.5, 6);
    expect(bySymbol.DE0007164600.avgCost).toBeCloseTo(1578.4 / 10.5, 4);
    expect(bySymbol.DE0007236101.quantity).toBeCloseTo(3, 6);
    expect(bySymbol.DE0005557508.quantity).toBeCloseTo(100, 6);
  });
});
