/**
 * Tests — import & cost basis AI tools (E28 — TGLA-102)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../../../src/services/db', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../../src/services/db')>();
  return { ...actual, delay: () => Promise.resolve() };
});
vi.mock('../../../../../src/services/priceService', () => ({
  refreshPositionPrices: vi.fn(async <T,>(positions: T[]) => positions),
  getLastPriceFetchTime: vi.fn(() => null),
  clearPriceCache: vi.fn(),
}));

import { db } from '../../../../../src/services/db';
import { aiToolRegistry } from '../../../../../src/services/ai/aiToolRegistry';
import '../../../../../src/services/ai/tools';
import {
  previewCsvImportTool,
  proposeCsvMappingTool,
  previewSnapshotImportTool,
  importSnapshotTool,
  getCostBasisMethodTool,
  setCostBasisMethodTool,
} from '../../../../../src/services/ai/tools/importTools';
import type { Account } from '../../../../../src/types/types.backend';

const SNAPSHOT = 'Symbol;Quantité;PRU\nAAPL;10;150,5\nMSFT;2;400';

describe('import AI tools', () => {
  beforeEach(() => {
    localStorage.clear();
    db.saveUnifiedTransactions([]);
    db.saveImportBatches([]);
    db.saveAccounts([{ id: 'acc-ai', ownerId: 'u', instituteId: 'i', name: 'PEA', type: 'investment', defaultCurrency: 'EUR', isActive: true, createdAt: '', updatedAt: '' } as Account]);
  });

  it('are registered, and every write tool requires human confirmation', () => {
    for (const name of ['preview_csv_import', 'propose_csv_mapping', 'preview_snapshot_import', 'import_snapshot', 'get_cost_basis_method', 'set_cost_basis_method']) {
      expect(aiToolRegistry.getTool(name)).toBeDefined();
    }
    expect(importSnapshotTool.requiresConfirmation).toBe(true);
    expect(setCostBasisMethodTool.requiresConfirmation).toBe(true);
    expect(previewCsvImportTool.requiresConfirmation).toBeFalsy();
    expect(proposeCsvMappingTool.requiresConfirmation).toBeFalsy();
    expect(previewSnapshotImportTool.requiresConfirmation).toBeFalsy();
  });

  it('preview_csv_import detects delimiter, preamble and mapping without saving anything', async () => {
    const result = await previewCsvImportTool.execute({ csvText: 'Relevé PEA\nDate;Libellé;Quantité;Cours;Montant\n15/01/2024;Achat;2;100;200\n20/01/2024;Achat;1;110;110' });
    expect(result).toMatchObject({ delimiter: ';', headerRowIndex: 1, rowCount: 2, dateFormat: 'DD/MM/YYYY' });
    expect(result.mapping).toMatchObject({ transactionDate: 'Date', quantity: 'Quantité', priceUnit: 'Cours', amountPrimary: 'Montant' });
    expect(db.getUnifiedTransactions()).toHaveLength(0);
  });

  it('propose_csv_mapping maps a foreign layout column by column and saves nothing', async () => {
    const csv = 'Datum;Typ;WKN;Wertpapier;Stück;Kurs;Betrag\n05.01.2024;Kauf;US0378331005;Apple Inc.;5;185,50;927,50\n12.02.2024;Verkauf;US5949181045;Microsoft Corp.;2;400,00;800,00';
    const result = await proposeCsvMappingTool.execute({ csvText: csv });

    expect(result).toMatchObject({ delimiter: ';', rowCount: 2, detectedPreset: null });
    const byHeader = Object.fromEntries(result.columns.map(c => [c.header, c]));
    expect(byHeader.Datum).toMatchObject({ field: 'transactionDate', status: 'matched' });
    expect(byHeader.WKN).toMatchObject({ field: 'assetIsin', status: 'matched', samples: ['US0378331005', 'US5949181045'] });
    expect(result.summary).toEqual({ matched: 7, ambiguous: 0, unmatched: 0 });
    expect(result.mapping).toMatchObject({ transactionDate: 'Datum', quantity: 'Stück', amountPrimary: 'Betrag' });
    expect(db.getUnifiedTransactions()).toHaveLength(0);
  });

  it('propose_csv_mapping reports the columns it cannot place instead of guessing', async () => {
    const result = await proposeCsvMappingTool.execute({ csvText: 'when,how many,cash\n2024-01-05,5,927.50\n2024-02-12,2,800.00' });

    const unmatched = result.columns.filter(c => c.status === 'unmatched').map(c => c.header);
    expect(unmatched).toEqual(['how many', 'cash']);
    expect(result.mapping).toEqual({ transactionDate: 'when' });
  });

  it('propose_csv_mapping follows a known broker preset instead of guessing (GlassFolio export: amount is the quantity)', async () => {
    const csv = 'id,date,type,operation,instrument,symbol,amount,price,total,currency,source,fees,status,accountName,bankName\nt1,2026-03-10,Buy,BUY,Amundi MSCI World,CW8,5,10,50,EUR,manual,1,Completed,CTO,Broker';
    const result = await proposeCsvMappingTool.execute({ csvText: csv });

    expect(result.detectedPreset).toBe('GlassFolio');
    expect(result.mapping).toMatchObject({ quantity: 'amount', amountPrimary: 'total', transactionDate: 'date', assetSymbol: 'symbol' });
    const amount = result.columns.find(c => c.header === 'amount');
    expect(amount).toMatchObject({ field: 'quantity', status: 'matched' });
  });

  it('propose_csv_mapping handles holdings snapshots too', async () => {
    const result = await proposeCsvMappingTool.execute({ csvText: SNAPSHOT, mode: 'snapshot' });
    expect(result.mapping).toMatchObject({ assetSymbol: 'Symbol', quantity: 'Quantité', avgPrice: 'PRU' });
  });

  it('preview then import a snapshot; re-import is a no-op', async () => {
    const preview = await previewSnapshotImportTool.execute({ accountId: 'acc-ai', csvText: SNAPSHOT });
    expect(preview.changes.map(c => c.action)).toEqual(['new', 'new']);
    expect(preview.investedAfter).toBeCloseTo(10 * 150.5 + 800);

    const first = await importSnapshotTool.execute({ accountId: 'acc-ai', csvText: SNAPSHOT }, { userId: 'user-ai' });
    expect(first.success).toBe(true);
    expect(first.transactionCount).toBe(2);
    expect(db.getUnifiedTransactions().every(t => t.ownerId === 'user-ai')).toBe(true);

    const again = await previewSnapshotImportTool.execute({ accountId: 'acc-ai', csvText: SNAPSHOT });
    expect(again.changes.every(c => c.action === 'unchanged')).toBe(true);
  });

  it('reads and changes the cost basis method', async () => {
    expect(await getCostBasisMethodTool.execute({ accountId: 'acc-ai' })).toEqual([{ accountId: 'acc-ai', name: 'PEA', method: 'WAC' }]);
    const res = await setCostBasisMethodTool.execute({ accountId: 'acc-ai', method: 'FIFO' });
    expect(res.success).toBe(true);
    expect(db.getAccountById('acc-ai')?.costBasisMethod).toBe('FIFO');
  });
});
