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
    for (const name of ['preview_csv_import', 'preview_snapshot_import', 'import_snapshot', 'get_cost_basis_method', 'set_cost_basis_method']) {
      expect(aiToolRegistry.getTool(name)).toBeDefined();
    }
    expect(importSnapshotTool.requiresConfirmation).toBe(true);
    expect(setCostBasisMethodTool.requiresConfirmation).toBe(true);
    expect(previewCsvImportTool.requiresConfirmation).toBeFalsy();
    expect(previewSnapshotImportTool.requiresConfirmation).toBeFalsy();
  });

  it('preview_csv_import detects delimiter, preamble and mapping without saving anything', async () => {
    const result = await previewCsvImportTool.execute({ csvText: 'Relevé PEA\nDate;Libellé;Quantité;Cours;Montant\n15/01/2024;Achat;2;100;200\n20/01/2024;Achat;1;110;110' });
    expect(result).toMatchObject({ delimiter: ';', headerRowIndex: 1, rowCount: 2, dateFormat: 'DD/MM/YYYY' });
    expect(result.mapping).toMatchObject({ transactionDate: 'Date', quantity: 'Quantité', priceUnit: 'Cours', amountPrimary: 'Montant' });
    expect(db.getUnifiedTransactions()).toHaveLength(0);
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
