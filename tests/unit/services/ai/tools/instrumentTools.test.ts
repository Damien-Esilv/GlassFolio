/**
 * AI tools for assets (instruments): list_instruments (read) and update_instrument (needs confirmation).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../../../src/services/db', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../../src/services/db')>();
  return { ...actual, delay: () => Promise.resolve() };
});

import { db } from '../../../../../src/services/db';
import { vaultService } from '../../../../../src/services/security/vaultService';
import { LocalAuthProvider } from '../../../../../src/services/security/authService';
import { aiToolRegistry } from '../../../../../src/services/ai/aiToolRegistry';
import '../../../../../src/services/ai/tools';
import { listInstrumentsTool, updateInstrumentTool } from '../../../../../src/services/ai/tools/instrumentTools';
import type { Instrument } from '../../../../../src/types';

const instrument = (id: string, symbol: string, over: Partial<Instrument> = {}): Instrument => ({
  id, ownerId: 'u', name: symbol, type: 'stock', marketIdentifier: { symbol }, isMarketReady: false,
  denominationCurrency: 'USD', createdAt: '', updatedAt: '', ...over,
});

describe('instrument AI tools', () => {
  beforeEach(async () => {
    localStorage.clear();
    await vaultService.resetVault();
    await new LocalAuthProvider().signUp('tools@example.test', 'Tools-Test-Key-2026!#xx', 'Tools');
    db.saveInstruments([instrument('i1', 'NEAR'), instrument('i2', 'AAPL', { marketIdentifier: { symbol: 'AAPL', isin: 'US0378331005' } })]);
  });

  it('are registered; only the write tool requires human confirmation', () => {
    expect(aiToolRegistry.getTool('list_instruments')).toBeDefined();
    expect(aiToolRegistry.getTool('update_instrument')?.requiresConfirmation).toBe(true);
    expect(listInstrumentsTool.requiresConfirmation).toBeFalsy();
  });

  it('list_instruments filters by symbol, name or ISIN', async () => {
    expect((await listInstrumentsTool.execute({})).map(i => i.symbol)).toEqual(['NEAR', 'AAPL']);
    expect((await listInstrumentsTool.execute({ searchQuery: 'us0378' })).map(i => i.symbol)).toEqual(['AAPL']);
    expect((await listInstrumentsTool.execute({ searchQuery: 'ne' }))[0]).toMatchObject({ instrumentId: 'i1', type: 'stock' });
  });

  it('update_instrument moves a token to crypto, found by its current symbol', async () => {
    const res = await updateInstrumentTool.execute({ symbol: 'near', type: 'crypto', exchange: 'Bitget' });
    expect(res.success).toBe(true);
    expect(db.getInstrumentById('i1')).toMatchObject({ type: 'crypto', isMarketReady: true });
  });

  it('update_instrument reports what blocked it, and changes nothing', async () => {
    const res = await updateInstrumentTool.execute({ instrumentId: 'i1', isin: 'bad' });
    expect(res.success).toBe(false);
    expect(res.message).toContain('INSTRUMENT_ISIN_INVALID');
    expect(db.getInstrumentById('i1')?.marketIdentifier.isin).toBeUndefined();
  });

  it('update_instrument asks for a merge on a duplicate, and merges when given the target', async () => {
    const refused = await updateInstrumentTool.execute({ instrumentId: 'i1', newSymbol: 'AAPL' });
    expect(refused).toMatchObject({ success: false });
    expect(refused.message).toContain('INSTRUMENT_DUPLICATE');
    const merged = await updateInstrumentTool.execute({ instrumentId: 'i1', newSymbol: 'AAPL', mergeIntoId: 'i2' });
    expect(merged.success).toBe(true);
    expect(db.getInstruments().map(i => i.id)).toEqual(['i2']);
  });

  it('update_instrument says so when the asset does not exist', async () => {
    expect((await updateInstrumentTool.execute({ symbol: 'NOPE', type: 'crypto' })).success).toBe(false);
    expect((await updateInstrumentTool.execute({ type: 'crypto' })).success).toBe(false);
  });
});
