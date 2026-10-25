/**
 * Tests — real user end-to-end data flow (E28 — TGLA-102)
 * A real (non-demo) vault starts empty; a snapshot import must then feed the
 * positions, the dashboard totals AND the dashboard curve.
 * Also covers mapping profiles (save / filter / suggest / presets read-only).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../../src/services/db', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../src/services/db')>();
  return { ...actual, delay: () => Promise.resolve() };
});
vi.mock('../../../../src/services/priceService', () => ({
  refreshPositionPrices: vi.fn(async <T,>(positions: T[]) => positions),
  fetchRealPriceHistory: vi.fn(async (pos: { symbol: string }) =>
    pos.symbol === 'TTE' ? [{ timestamp: Date.now() - 40 * 24 * 3600 * 1000, price: 60 }, { timestamp: Date.now() - 3600 * 1000, price: 70 }] : []),
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
import { portfolioService } from '../../../../src/services/portfolioService';
import { transactionService } from '../../../../src/services/transactionService';
import { parseSnapshotFile, buildSnapshotCommit } from '../../../../src/services/import/snapshotService';
import { recordCashBalances } from '../../../../src/services/import/cashBalanceService';
import {
  saveMappingTemplate,
  getMappingTemplates,
  deleteMappingTemplate,
  renameMappingTemplate,
  findTemplateForHeaders,
} from '../../../../src/services/import/mappingTemplateService';

const ACCOUNT = 'acc-real';

describe('real user — blank slate then snapshot import', () => {
  beforeEach(async () => {
    localStorage.clear();
    await vaultService.resetVault();
    // Real local signup → unlocked, non-demo encrypted vault
    await new LocalAuthProvider().signUp('real.investor@example.test', 'Real-Investor-Test-Key-2026!#', 'Real Investor');
    expect(vaultService.isDemoVault()).toBe(false);
  });

  it('starts with every user collection empty (no demo leakage)', async () => {
    expect(db.getUnifiedTransactions()).toEqual([]);
    expect(db.getTransactions()).toEqual([]);
    expect(db.getPositions()).toEqual([]);
    expect(db.getInstitutes()).toEqual([]);
    expect(db.getAccounts()).toEqual([]);
    expect(db.getImportBatches()).toEqual([]);
    expect(db.getGoals()).toEqual([]);
    expect(await transactionService.getTransactions()).toEqual([]);
    const summary = await portfolioService.getDashboardSummary('1Y', 'EUR');
    expect(summary.totalValue).toBe(0);
    expect(summary.chartData.every(p => p.value === 0)).toBe(true);
  });

  it('snapshot import feeds positions, totals and the dashboard curve', async () => {
    const csv = 'ISIN;Symbol;Name;Quantité;PRU\nFR0000120271;TTE;TotalEnergies;25;58,45\nFR0000121014;MC;LVMH;3;725,80';
    const parsed = await parseSnapshotFile(csv, { assetIsin: 'ISIN', assetSymbol: 'Symbol', assetName: 'Name', quantity: 'Quantité', avgPrice: 'PRU' });
    expect(parsed.stats.valid).toBe(2);

    const date = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const txs = await buildSnapshotCommit({
      mode: 'replace',
      positions: parsed.positions.map(p => p.position),
      accountId: ACCOUNT,
      batchId: 'batch-real',
      date,
      userId: 'user-real',
    });
    expect(txs.every(t => t.ownerId === 'user-real')).toBe(true);
    db.saveUnifiedTransactions(txs);
    await portfolioService.recalculatePositions();

    const positions = db.getPositions();
    expect(positions).toHaveLength(2);
    const tte = positions.find(p => p.symbol === 'TTE')!;
    expect(tte.quantity).toBe(25);
    expect(tte.avgCost).toBeCloseTo(58.45);

    const summary = await portfolioService.getDashboardSummary('1M', 'EUR');
    expect(summary.totalCost).toBeCloseTo(25 * 58.45 + 3 * 725.8, 1);
    // Regression: the curve used to read the legacy store and stayed flat at 0
    expect(summary.chartData[summary.chartData.length - 1].value).toBeGreaterThan(0);

    const listed = await transactionService.getTransactions();
    expect(listed).toHaveLength(2);

    // Historical mode values TTE with the real close (70) instead of the estimate
    const historical = await portfolioService.getDashboardSummary('1M', 'EUR', 'fr-FR', 'DD/MM/YYYY', { chartMode: 'historical' });
    const simulated = summary.chartData[summary.chartData.length - 1].value;
    const real = historical.chartData[historical.chartData.length - 1].value;
    expect(real).not.toBe(simulated);
    expect(real).toBeGreaterThanOrEqual(25 * 70);
  });

  it('cash balance statements replace the previous balance', async () => {
    await recordCashBalances({
      accountId: ACCOUNT, currency: 'EUR', userId: 'user-real', source: 'MANUAL', fileName: 'manual',
      statements: [{ date: '2024-01-01T12:00:00.000Z', balance: '1000' }],
    });
    await recordCashBalances({
      accountId: ACCOUNT, currency: 'EUR', userId: 'user-real', source: 'MANUAL', fileName: 'manual',
      statements: [{ date: '2024-02-01T12:00:00.000Z', balance: '1500' }],
    });
    const cash = db.getPositions().find(p => p.symbol === 'EUR')!;
    expect(cash.quantity).toBe(1500);
    expect(cash.marketValue).toBe(1500);
  });
});

describe('mapping profiles', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores owner, institute, date format, delimiter and mode (regression: institute landed in userId)', async () => {
    const tpl = await saveMappingTemplate('Bourso FR', { transactionDate: 'Date', amountPrimary: 'Montant', assetSymbol: '' }, {
      userId: 'user-1', instituteId: 'inst-bourso', dateFormat: 'DD/MM/YYYY', delimiter: ';', mode: 'history', headers: ['Date', 'Montant'],
    });
    expect(tpl).toMatchObject({ ownerId: 'user-1', instituteId: 'inst-bourso', dateFormat: 'DD/MM/YYYY', delimiter: ';', mode: 'history' });
    expect(tpl.mappings).toEqual({ transactionDate: 'Date', amountPrimary: 'Montant' });
  });

  it('filters profiles by wizard mode and institute', async () => {
    await saveMappingTemplate('H', { transactionDate: 'Date' }, { mode: 'history', instituteId: 'a' });
    await saveMappingTemplate('S', { quantity: 'Qty' }, { mode: 'snapshot' });
    const snapshot = await getMappingTemplates({ mode: 'snapshot' });
    expect(snapshot.map(t => t.name)).toEqual(['S']);
    const historyB = await getMappingTemplates({ mode: 'history', instituteId: 'b' });
    expect(historyB.some(t => t.name === 'H')).toBe(false);
  });

  it('suggests the profile with the same header signature (order/case insensitive)', async () => {
    const tpl = await saveMappingTemplate('Mine', { quantity: 'Quantité', avgPrice: 'PRU' }, { mode: 'snapshot', headers: ['Quantité', 'PRU', 'Libellé'] });
    const all = await getMappingTemplates({ mode: 'snapshot' });
    expect(findTemplateForHeaders(all, ['libelle', 'pru', 'QUANTITÉ'])?.id).toBe(tpl.id);
    expect(findTemplateForHeaders(all, ['Foo', 'Bar'])).toBeNull();
  });

  it('renames and deletes user profiles but never system presets', async () => {
    const tpl = await saveMappingTemplate('Old', { quantity: 'Qty' }, { mode: 'snapshot' });
    expect(await renameMappingTemplate(tpl.id, 'New')).toBe(true);
    expect((await getMappingTemplates()).find(t => t.id === tpl.id)?.name).toBe('New');
    const preset = (await getMappingTemplates()).find(t => t.isPreset)!;
    expect(await deleteMappingTemplate(preset.id)).toBe(false);
    expect(await renameMappingTemplate(preset.id, 'x')).toBe(false);
    expect(await deleteMappingTemplate(tpl.id)).toBe(true);
  });
});
