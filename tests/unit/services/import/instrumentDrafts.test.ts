/**
 * Instrument drafts in an import review: new assets are persisted only when the import is confirmed.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../../src/services/db', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../src/services/db')>();
  return { ...actual, delay: () => Promise.resolve() };
});

import { db } from '../../../../src/services/db';
import { vaultService } from '../../../../src/services/security/vaultService';
import { LocalAuthProvider } from '../../../../src/services/security/authService';
import { transactionManager } from '../../../../src/services/core/transactionManager';
import {
  parseFile, commitBatch, detectPreset, parseCSVText, describeImportInstruments, revalidateStagedRow, resolveStagedInstrument,
} from '../../../../src/services/import/importManager';
import type { FieldMappings, ParseResult } from '../../../../src/services/import/importManager';
import { matchHistoryColumns } from '../../../../src/services/import/columnMatcher';
import {
  clearStagedInstruments, getStagedInstrument, isStagedInstrument, resolveInstrumentId, updateStagedInstrument,
  previewStagedIssues,
} from '../../../../src/services/import/instrumentDrafts';
import { InstrumentValidationError } from '../../../../src/services/instrumentService';
import type { Instrument } from '../../../../src/types';

const CSV = [
  'Time,Symbol,Side,Qty,Price,Fee,Fee_Ccy,Total_USDT',
  '2024-07-05 08:15:32,BTC,Buy,0.012,58500.00,0.702,USDT,702.70',
  '2024-07-06 09:00:00,NEAR,Buy,100,5.11,0.5,USDT,511.50',
  '2024-07-08 09:00:00,NEAR,Buy,20,5.50,0.1,USDT,110.10',
].join('\n');

const seed = async (accountType = 'investment', instituteName = 'Broker'): Promise<void> => {
  localStorage.clear();
  await vaultService.resetVault();
  await new LocalAuthProvider().signUp('drafts@example.test', 'Drafts-Test-Key-2026!#xx', 'Drafts');
  db.saveInstitutes([{ id: 'inst-1', ownerId: 'u', name: instituteName, type: 'EXCHANGE' } as never]);
  db.saveAccounts([{ id: 'acc-1', ownerId: 'u', instituteId: 'inst-1', name: 'Account B', type: accountType, defaultCurrency: 'EUR', isActive: true } as never]);
};

const parse = (csv = CSV): Promise<ParseResult> => {
  const { headers } = parseCSVText(csv);
  const mappings = (detectPreset(headers)?.mappings ?? matchHistoryColumns(headers)) as FieldMappings;
  return parseFile(csv, { accountId: 'acc-1', mode: 'history', customMappings: mappings });
};
const commit = (parsed: ParseResult) => commitBatch(parsed.candidates, 'acc-1', 'history', 'f.csv', parsed.fileHash, 'u');
const instrumentOf = (symbol: string): Instrument | undefined => db.getInstruments().find(i => i.marketIdentifier.symbol === symbol);

describe('instrument drafts during an import', () => {
  beforeEach(async () => {
    clearStagedInstruments();
    await seed();
  });

  it('analysing a file creates no instrument: new assets are drafts listed for the review', async () => {
    const parsed = await parse();

    expect(db.getInstruments()).toHaveLength(0);
    expect(parsed.instruments.map(i => [i.instrument.marketIdentifier.symbol, i.isNew, i.rowCount])).toEqual([
      ['NEAR', true, 2],
      ['BTC', true, 1],
    ]);
  });

  it('cancelling (or analysing again) leaves nothing behind', async () => {
    await parse();
    await parse();
    expect(db.getInstruments()).toHaveLength(0);
  });

  it('confirming persists the drafts, with their edits, and the positions follow', async () => {
    const parsed = await parse();
    const near = parsed.instruments.find(i => i.instrument.marketIdentifier.symbol === 'NEAR')!.instrument;

    updateStagedInstrument(near.id, { type: 'crypto', exchange: 'Bitget', name: 'NEAR Protocol' });
    expect((await commit(parsed)).success).toBe(true);

    expect(instrumentOf('NEAR')).toMatchObject({ type: 'crypto', name: 'NEAR Protocol', marketIdentifier: { exchange: 'Bitget' } });
    expect(db.getPositions().find(p => p.symbol === 'NEAR')).toMatchObject({ type: 'Crypto', quantity: 120 });
    expect(describeImportInstruments(parsed.candidates).every(i => !i.isNew)).toBe(true);
  });

  it('an edited draft that matches an existing asset is merged into it and the rows follow', async () => {
    db.saveInstruments([{ id: 'i-existing', ownerId: 'u', name: 'NEAR Protocol', type: 'crypto', marketIdentifier: { symbol: 'NEARX', exchange: 'Bitget' }, isMarketReady: true, denominationCurrency: 'USD', createdAt: '', updatedAt: '' }]);
    const parsed = await parse();
    const near = parsed.instruments.find(i => i.instrument.marketIdentifier.symbol === 'NEAR')!.instrument;

    expect(() => updateStagedInstrument(near.id, { symbol: 'NEARX' })).toThrow(InstrumentValidationError);
    updateStagedInstrument(near.id, { symbol: 'NEARX' }, 'i-existing');

    expect(isStagedInstrument(near.id)).toBe(false);
    expect(resolveInstrumentId(near.id)).toBe('i-existing');
    expect(describeImportInstruments(parsed.candidates).find(i => i.instrument.id === 'i-existing')?.rowCount).toBe(2);
    await commit(parsed);
    expect(db.getUnifiedTransactions().filter(t => t.instrumentId === 'i-existing')).toHaveLength(2);
    expect(db.getInstruments().map(i => i.marketIdentifier.symbol).sort()).toEqual(['BTC', 'NEARX']);
  });

  it('refuses an invalid edit of a draft and shows the issues live', async () => {
    const parsed = await parse();
    const near = parsed.instruments[0].instrument;

    expect(previewStagedIssues(near.id, { isin: 'bad' }).some(i => i.code === 'INSTRUMENT_ISIN_INVALID')).toBe(true);
    expect(() => updateStagedInstrument(near.id, { isin: 'bad' })).toThrow(InstrumentValidationError);
    expect(getStagedInstrument(near.id)?.marketIdentifier.isin).toBeUndefined();
  });

  it('resolves the asset of an edited row: an existing one, or a new draft (never a saved copy)', async () => {
    db.saveInstruments([{ id: 'i-btc', ownerId: 'u', name: 'BTC', type: 'crypto', marketIdentifier: { symbol: 'BTC' }, isMarketReady: false, denominationCurrency: 'USD', createdAt: '', updatedAt: '' }]);

    expect((await resolveStagedInstrument({ symbol: 'btc' }, 'acc-1'))?.id).toBe('i-btc');
    const fresh = await resolveStagedInstrument({ symbol: 'ABCD' }, 'acc-1');
    expect(fresh && isStagedInstrument(fresh.id)).toBe(true);
    expect(instrumentOf('ABCD')).toBeUndefined();
    expect(await resolveStagedInstrument({}, 'acc-1')).toBeUndefined();
  });

  it('a failed commit takes back the assets it added', async () => {
    const parsed = await parse();
    vi.spyOn(transactionManager, 'commit').mockReturnValueOnce({ success: false, transactionCount: 0, batchId: null, error: 'boom' });

    expect((await commit(parsed)).success).toBe(false);

    expect(db.getInstruments()).toHaveLength(0);
    transactionManager.rollback(); // the stubbed commit never ended its transaction
    vi.restoreAllMocks();
  });

  it('a draft lost to another analysis is rebuilt from its row at commit', async () => {
    const parsed = await parse();
    clearStagedInstruments(); // e.g. another analysis ran in between

    const res = await commit(parsed);
    expect(res.error).toBeUndefined();
    expect(res.success).toBe(true);

    expect(instrumentOf('NEAR')).toBeDefined();
    expect(db.getUnifiedTransactions().every(t => t.instrumentId && db.getInstrumentById(t.instrumentId))).toBe(true);
  });

  it('re-validates a row after its asset was edited: a crypto asset with an exchange is no longer a warning', async () => {
    await seed('crypto_spot', 'Bitget');
    const parsed = await parse();
    // the institute of a crypto account is the exchange: no per-row warning about missing context
    expect(parsed.candidates.every(c => !c.errors.some(e => e.code === 'CRYPTO_CONTEXT_REQUIRED'))).toBe(true);
    expect(parsed.instruments.every(i => i.instrument.marketIdentifier.exchange === 'Bitget')).toBe(true);

    const near = parsed.instruments.find(i => i.instrument.marketIdentifier.symbol === 'NEAR')!.instrument;
    updateStagedInstrument(near.id, { exchange: '', network: '' });
    const row = parsed.candidates.find(c => c.parsed.assetSymbol === 'NEAR')!;
    expect(revalidateStagedRow(row, 'history').errors.some(e => e.code === 'CRYPTO_CONTEXT_REQUIRED')).toBe(true);

    updateStagedInstrument(near.id, { network: 'near' });
    expect(revalidateStagedRow(row, 'history').errors.some(e => e.code === 'CRYPTO_CONTEXT_REQUIRED')).toBe(false);
  });
});
