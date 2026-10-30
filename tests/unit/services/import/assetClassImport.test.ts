/**
 * Asset class at import: a crypto the app has never heard of (NEAR) must not end up in "Equities".
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../../src/services/db', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../src/services/db')>();
  return { ...actual, delay: () => Promise.resolve() };
});

import { db } from '../../../../src/services/db';
import { vaultService } from '../../../../src/services/security/vaultService';
import { LocalAuthProvider } from '../../../../src/services/security/authService';
import { parseFile, commitBatch, detectPreset, parseCSVText } from '../../../../src/services/import/importManager';
import type { FieldMappings } from '../../../../src/services/import/importManager';
import { matchHistoryColumns } from '../../../../src/services/import/columnMatcher';

const CSV = [
  'Time,Symbol,Side,Qty,Price,Fee,Fee_Ccy,Total_USDT',
  '2024-07-05 08:15:32,BTC,Buy,0.012,58500.00,0.702,USDT,702.70',
  '2024-07-06 09:00:00,NEAR,Buy,100,5.11,0.5,USDT,511.50',
  '2024-07-07 09:00:00,EUR,Buy,500,1,0,EUR,500',
].join('\n');

const seed = async (accountType: string): Promise<void> => {
  localStorage.clear();
  await vaultService.resetVault();
  await new LocalAuthProvider().signUp('class@example.test', 'Class-Test-Key-2026!#xx', 'Class');
  db.saveInstitutes([{ id: 'inst-1', ownerId: 'u', name: 'Bitget', type: 'EXCHANGE' } as never]);
  db.saveAccounts([{ id: 'acc-1', ownerId: 'u', instituteId: 'inst-1', name: 'Account B', type: accountType, defaultCurrency: 'EUR', isActive: true } as never]);
};

const run = async (): Promise<void> => {
  const { headers } = parseCSVText(CSV);
  const mappings = (detectPreset(headers)?.mappings ?? matchHistoryColumns(headers)) as FieldMappings;
  const parsed = await parseFile(CSV, { accountId: 'acc-1', mode: 'history', customMappings: mappings });
  const res = await commitBatch(parsed.candidates, 'acc-1', 'history', 'bitget.csv', parsed.fileHash, 'u');
  expect(res.success).toBe(true);
};

const typeOf = (symbol: string): string | undefined =>
  db.getInstruments().find(i => i.marketIdentifier.symbol === symbol)?.type;

describe('asset class at import', () => {
  it('a crypto account makes NEAR a crypto, BTC too, and keeps EUR as cash', async () => {
    await seed('crypto_spot');
    await run();

    expect(typeOf('NEAR')).toBe('crypto');
    expect(typeOf('BTC')).toBe('crypto');
    expect(typeOf('EUR')).toBe('cash');
    expect(db.getPositions().find(p => p.symbol === 'NEAR')?.type).toBe('Crypto');
  });

  it('a securities account without lookup keeps the offline rules: unknown symbols stay stocks', async () => {
    await seed('investment');
    await run();

    expect(typeOf('NEAR')).toBe('stock');
    expect(typeOf('BTC')).toBe('crypto'); // short offline list
    expect(typeOf('EUR')).toBe('cash');
  });

  it('an "other" account files unknown assets under Other (manual price)', async () => {
    await seed('other');
    await run();

    expect(typeOf('NEAR')).toBe('other');
    expect(db.getPositions().find(p => p.symbol === 'NEAR')?.type).toBe('Other');
  });
});
