/**
 * instrumentService — editing an asset (any field), integrity checks, duplicates and merge.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/services/db', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../src/services/db')>();
  return { ...actual, delay: () => Promise.resolve() };
});

import { db } from '../../../src/services/db';
import { vaultService } from '../../../src/services/security/vaultService';
import { LocalAuthProvider } from '../../../src/services/security/authService';
import {
  instrumentService,
  InstrumentValidationError,
  applyInstrumentPatch,
  validateInstrumentDraft,
} from '../../../src/services/instrumentService';
import type { Instrument } from '../../../src/types';

const instrument = (id: string, symbol: string, over: Partial<Instrument> = {}): Instrument => ({
  id,
  ownerId: 'u',
  name: symbol,
  type: 'stock',
  marketIdentifier: { symbol },
  isMarketReady: false,
  denominationCurrency: 'USD',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...over,
});

const buy = (id: string, instrumentId: string, symbol: string, quantity = '100') => ({
  id, ownerId: 'u', accountId: 'acc-1', instrumentId, batchId: 'batch-1', rowHash: `h-${id}`,
  sourceOrigin: 'FILE', isSynthetic: false, isFiscal: true, sourceMode: 'history',
  transactionDate: '2024-01-08T00:00:00.000Z', type: 'BUY', rawType: 'BUY', rawLabel: '',
  amountPrimary: '510', assetSymbol: symbol, quantity, priceUnit: '5.1',
  createdAt: '2024-01-08T00:00:00.000Z', updatedAt: '2024-01-08T00:00:00.000Z', version: 1,
}) as never;

describe('instrumentService editing', () => {
  beforeEach(async () => {
    localStorage.clear();
    await vaultService.resetVault();
    await new LocalAuthProvider().signUp('instr@example.test', 'Instr-Test-Key-2026!#xx', 'Instr');
  });

  describe('applyInstrumentPatch / validateInstrumentDraft (pure)', () => {
    it('normalises symbol, ISIN and currency and drops emptied optional fields', () => {
      const base = instrument('i1', 'NEAR', { marketIdentifier: { symbol: 'NEAR', exchange: 'BITGET', network: 'near' } });
      const out = applyInstrumentPatch(base, { symbol: ' near ', isin: ' us0378331005 ', exchange: '', network: null, denominationCurrency: 'eur' });
      expect(out.marketIdentifier).toMatchObject({ symbol: 'NEAR', isin: 'US0378331005', exchange: undefined, network: undefined });
      expect(out.denominationCurrency).toBe('EUR');
    });

    it('reports an empty symbol, a malformed ISIN and an invalid currency as errors', () => {
      const draft = applyInstrumentPatch(instrument('i1', 'X'), { symbol: '', isin: 'nope', denominationCurrency: '€' });
      const codes = validateInstrumentDraft(draft, []).filter(i => i.severity === 'error').map(i => i.code);
      expect(codes).toEqual(expect.arrayContaining(['INSTRUMENT_SYMBOL_REQUIRED', 'INSTRUMENT_ISIN_INVALID', 'INSTRUMENT_CURRENCY_INVALID']));
    });

    it('only warns about a wrong ISIN check digit', () => {
      const draft = applyInstrumentPatch(instrument('i1', 'AAPL'), { isin: 'US0378331006' });
      const issues = validateInstrumentDraft(draft, []);
      expect(issues.find(i => i.code === 'INSTRUMENT_ISIN_CHECKDIGIT')?.severity).toBe('warning');
      expect(issues.some(i => i.severity === 'error')).toBe(false);
    });

    it('flags a duplicate by symbol or ISIN', () => {
      const others = [instrument('i2', 'NEAR', { type: 'crypto' }), instrument('i3', 'APPLE', { marketIdentifier: { symbol: 'APPLE', isin: 'US0378331005' } })];
      expect(validateInstrumentDraft(instrument('i1', 'near'.toUpperCase()), others).some(i => i.code === 'INSTRUMENT_DUPLICATE')).toBe(true);
      const byIsin = applyInstrumentPatch(instrument('i1', 'AAPL'), { isin: 'US0378331005' });
      expect(validateInstrumentDraft(byIsin, others).some(i => i.code === 'INSTRUMENT_DUPLICATE')).toBe(true);
    });

    it('an "Other" asset needs no market data: it is only told its price is entered by hand', () => {
      const issues = validateInstrumentDraft(instrument('i1', 'WINE', { type: 'other' }), []);
      expect(issues.map(i => i.code)).toEqual(['INSTRUMENT_MANUAL_PRICE_ONLY']);
    });

    it('warns when a crypto has no exchange, network or contract', () => {
      const issues = validateInstrumentDraft(instrument('i1', 'NEAR', { type: 'crypto' }), []);
      expect(issues.some(i => i.code === 'INSTRUMENT_MARKET_DATA_MISSING')).toBe(true);
    });
  });

  describe('updateInstrument', () => {
    it('turns NEAR from Equity into Crypto and the position follows (with its instrumentId)', async () => {
      db.saveInstruments([instrument('i1', 'NEAR')]);
      db.saveUnifiedTransactions([buy('t1', 'i1', 'NEAR')]);
      const { portfolioService } = await import('../../../src/services/portfolioService');
      await portfolioService.recalculatePositions();
      expect(db.getPositions()[0]).toMatchObject({ type: 'Equity', instrumentId: 'i1' });

      const res = await instrumentService.updateInstrument('i1', { type: 'crypto', exchange: 'Bitget' });

      expect(res.instrument.type).toBe('crypto');
      expect(res.instrument.isMarketReady).toBe(true);
      expect(db.getInstrumentById('i1')?.type).toBe('crypto');
      expect(db.getPositions()[0].type).toBe('Crypto');
    });

    it('changes the symbol and name of every transaction view, and forgets the stale cached price', async () => {
      db.saveInstruments([instrument('i1', 'NEAR')]);
      db.saveUnifiedTransactions([buy('t1', 'i1', 'NEAR')]);
      localStorage.setItem('gf_price_cache', JSON.stringify({ data: { NEAR: 5.1, 'NEAR-USD': 5.2, AAPL: 190 }, fetchedAt: new Date().toISOString() }));

      await instrumentService.updateInstrument('i1', { symbol: 'NEAR2', name: 'Near Protocol' });

      expect(db.getInstrumentById('i1')?.name).toBe('Near Protocol');
      expect(db.getPositions()[0].symbol).toBe('NEAR2');
      const cache = JSON.parse(localStorage.getItem('gf_price_cache') || '{}');
      expect(cache.data).toEqual({ AAPL: 190 });
    });

    it('refuses an invalid edit and changes nothing', async () => {
      db.saveInstruments([instrument('i1', 'NEAR')]);

      await expect(instrumentService.updateInstrument('i1', { isin: 'not-an-isin' })).rejects.toBeInstanceOf(InstrumentValidationError);
      await expect(instrumentService.updateInstrument('i1', { symbol: '  ' })).rejects.toBeInstanceOf(InstrumentValidationError);

      expect(db.getInstrumentById('i1')?.marketIdentifier).toEqual({ symbol: 'NEAR' });
    });

    it('refuses a duplicate unless asked to merge, then moves the transactions to the kept instrument', async () => {
      db.saveInstruments([instrument('i1', 'NEAR'), instrument('i2', 'NEARX', { type: 'crypto', marketIdentifier: { symbol: 'NEARX', exchange: 'Bitget' } })]);
      db.saveUnifiedTransactions([buy('t1', 'i1', 'NEAR', '100'), buy('t2', 'i2', 'NEARX', '50')]);

      await expect(instrumentService.updateInstrument('i1', { symbol: 'NEARX', type: 'crypto' })).rejects.toMatchObject({
        issues: expect.arrayContaining([expect.objectContaining({ code: 'INSTRUMENT_DUPLICATE', params: expect.objectContaining({ id: 'i2' }) })]),
      });
      expect(db.getInstruments()).toHaveLength(2);

      const res = await instrumentService.updateInstrument('i1', { symbol: 'NEARX', type: 'crypto' }, { mergeInto: 'i2' });

      expect(res.instrument.id).toBe('i2');
      expect(db.getInstruments().map(i => i.id)).toEqual(['i2']);
      expect(db.getUnifiedTransactions().every(t => t.instrumentId === 'i2')).toBe(true);
      const positions = db.getPositions();
      expect(positions).toHaveLength(1);
      expect(positions[0]).toMatchObject({ symbol: 'NEARX', quantity: 150, type: 'Crypto' });
    });

    it('rejects a merge target that is not a duplicate', async () => {
      db.saveInstruments([instrument('i1', 'NEAR'), instrument('i2', 'BTC', { type: 'crypto' })]);
      await expect(instrumentService.updateInstrument('i1', { name: 'x' }, { mergeInto: 'i2' })).rejects.toThrow('INSTRUMENT_MERGE_TARGET_INVALID');
    });

    it('follows a symbol rename in the asset groups', async () => {
      db.saveInstruments([instrument('i1', 'NEAR')]);
      db.saveAssetGroups([{ id: 'g1', name: 'Alts', symbols: ['NEAR', 'SOL'], color: 'brand' }]);

      await instrumentService.updateInstrument('i1', { symbol: 'NEAR2' });

      expect(db.getAssetGroups()[0].symbols).toEqual(['NEAR2', 'SOL']);
    });

    it('throws for an unknown instrument', async () => {
      await expect(instrumentService.updateInstrument('nope', { name: 'x' })).rejects.toThrow('INSTRUMENT_NOT_FOUND');
    });
  });

  describe('lookups', () => {
    it('finds the instrument of a position by id, then by ISIN or symbol', () => {
      db.saveInstruments([instrument('i1', 'NEAR'), instrument('i2', 'AAPL', { marketIdentifier: { symbol: 'AAPL', isin: 'US0378331005' } })]);
      expect(instrumentService.findInstrumentForPosition({ instrumentId: 'i1', symbol: 'whatever' })?.id).toBe('i1');
      expect(instrumentService.findInstrumentForPosition({ symbol: 'near' })?.id).toBe('i1');
      expect(instrumentService.findInstrumentForPosition({ isin: 'us0378331005', symbol: 'x' })?.id).toBe('i2');
      expect(instrumentService.findInstrumentForPosition({ symbol: 'nothing' })).toBeUndefined();
    });

    it('findOrCreateInstrument returns the enriched instrument, not the stale one', async () => {
      db.saveInstruments([instrument('i1', 'AAPL')]);
      const found = await instrumentService.findOrCreateInstrument({ symbol: 'AAPL', isin: 'US0378331005', exchange: 'XNAS' });
      expect(found.marketIdentifier).toMatchObject({ isin: 'US0378331005', exchange: 'XNAS' });
    });
  });
});
