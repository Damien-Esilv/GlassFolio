/**
 * PEA withdrawals, EUR conversion and the full crypto portfolio (TGLA-188).
 */
import { describe, it, expect } from 'vitest';
import {
  buildTaxSummary,
  calculateCryptoGains,
  calculatePEAWithdrawals,
  convertToEur,
  EnrichedTransaction,
} from '../../../../src/services/fiscal/taxEngine';
import { getFiscalRulesOrThrow, planAgeYears } from '../../../../src/services/fiscal/taxRules';
import type { Account, Instrument, UnifiedTransaction } from '../../../../src/types/types.backend';

let seq = 0;
const NOW = '2020-01-01T00:00:00Z';

const instrument = (symbol: string, type: Instrument['type'], currency = 'EUR'): Instrument => ({
  id: `inst-${symbol}`, ownerId: 'u', name: symbol, type, marketIdentifier: { symbol },
  isMarketReady: true, denominationCurrency: currency, createdAt: NOW, updatedAt: NOW,
});

const account = (overrides: Partial<Account> = {}): Account => ({
  id: 'acc-1', ownerId: 'u', instituteId: 'inst-bank', name: 'Mon PEA', type: 'investment',
  defaultCurrency: 'EUR', isActive: true, wrapperType: 'PEA', openedAt: '2018-01-15',
  createdAt: NOW, updatedAt: NOW, ...overrides,
} as Account);

const row = (overrides: Partial<UnifiedTransaction>): UnifiedTransaction => {
  seq++;
  return {
    id: `tx-${seq}`, ownerId: 'u', accountId: 'acc-1', batchId: 'b', rowHash: `h${seq}`,
    sourceOrigin: 'FILE', isSynthetic: false, isFiscal: true, sourceMode: 'history',
    transactionDate: '2024-01-01', type: 'BUY', rawType: 'BUY', rawLabel: '',
    amountPrimary: '0', assetSymbol: 'EUR', createdAt: NOW, updatedAt: NOW, version: 1,
    ...overrides,
  } as UnifiedTransaction;
};

const enrich = (txs: UnifiedTransaction[], acc: Account, instruments: Instrument[]): EnrichedTransaction[] =>
  txs.map(tx => ({
    ...tx,
    account: acc,
    instrument: instruments.find(i => i.id === tx.instrumentId),
    resolvedWrapperType: acc.wrapperType,
  }));

const cashEur = instrument('EUR', 'cash');
const etf = instrument('CW8', 'etf');

describe('PEA withdrawals', () => {
  const rules2024 = getFiscalRulesOrThrow('2024', 'FR');

  it('taxes only the gain share of a withdrawal, after 5 years with social contributions only', () => {
    const acc = account();
    const txs = enrich([
      row({ type: 'DEPOSIT', transactionDate: '2018-02-01', amountPrimary: '10000', instrumentId: cashEur.id }),
      row({ type: 'BUY', transactionDate: '2018-02-02', amountPrimary: '-10000', quantity: '100', priceUnit: '100', assetSymbol: 'CW8', instrumentId: etf.id }),
      row({ type: 'SELL', transactionDate: '2024-03-01', amountPrimary: '20000', quantity: '100', priceUnit: '200', assetSymbol: 'CW8', instrumentId: etf.id }),
      row({ type: 'WITHDRAW', transactionDate: '2024-03-05', amountPrimary: '-5000', instrumentId: cashEur.id }),
    ], acc, [cashEur, etf]);

    const [event] = calculatePEAWithdrawals(txs, '2024', rules2024);

    // Plan worth 20000 for 10000 deposited: a quarter of it is withdrawn, half of that is gain
    expect(event.eventType).toBe('pea_withdrawal');
    expect(event.acquisitionCost).toBeCloseTo(2500);
    expect(event.taxableAmount).toBeCloseTo(2500);
    expect(event.incomeTax).toBe(0);
    expect(event.socialContributions).toBeCloseTo(2500 * 0.172);
    expect(event.closesPlan).toBe(false);
    expect(event.confidence).toBe('estimated');
  });

  it('applies income tax and closes the plan before 5 years', () => {
    const acc = account({ openedAt: '2022-06-01' });
    const txs = enrich([
      row({ type: 'DEPOSIT', transactionDate: '2022-06-02', amountPrimary: '1000', instrumentId: cashEur.id }),
      row({ type: 'BUY', transactionDate: '2022-06-03', amountPrimary: '-1000', quantity: '10', priceUnit: '100', assetSymbol: 'CW8', instrumentId: etf.id }),
      row({ type: 'SELL', transactionDate: '2024-06-01', amountPrimary: '1500', quantity: '10', priceUnit: '150', assetSymbol: 'CW8', instrumentId: etf.id }),
      row({ type: 'WITHDRAW', transactionDate: '2024-06-02', amountPrimary: '-1500', instrumentId: cashEur.id }),
    ], acc, [cashEur, etf]);

    const [event] = calculatePEAWithdrawals(txs, '2024', rules2024);

    expect(event.taxableAmount).toBeCloseTo(500);
    expect(event.incomeTax).toBeCloseTo(500 * 0.128);
    expect(event.closesPlan).toBe(true);
    expect(event.planAgeYears).toBe(2);
  });

  it('reduces the deposits left after a withdrawal, so the next one is computed on what remains', () => {
    const acc = account();
    const txs = enrich([
      row({ type: 'DEPOSIT', transactionDate: '2018-02-01', amountPrimary: '1000', instrumentId: cashEur.id }),
      row({ type: 'INCOME', transactionDate: '2023-01-01', amountPrimary: '1000', instrumentId: cashEur.id }),
      row({ type: 'WITHDRAW', transactionDate: '2024-01-10', amountPrimary: '-1000', instrumentId: cashEur.id }),
      row({ type: 'WITHDRAW', transactionDate: '2024-02-10', amountPrimary: '-1000', instrumentId: cashEur.id }),
    ], acc, [cashEur]);

    const events = calculatePEAWithdrawals(txs, '2024', rules2024);

    // 2000 for 1000 deposited: each withdrawal is half gain
    expect(events.map(e => Math.round(e.taxableAmount))).toEqual([500, 500]);
  });

  it('flags a plan whose opening date is unknown', () => {
    const acc = account({ openedAt: undefined });
    const txs = enrich([
      row({ type: 'DEPOSIT', transactionDate: '2018-02-01', amountPrimary: '1000', instrumentId: cashEur.id }),
      row({ type: 'WITHDRAW', transactionDate: '2024-02-10', amountPrimary: '-100', instrumentId: cashEur.id }),
    ], acc, [cashEur]);

    expect(calculatePEAWithdrawals(txs, '2024', rules2024)[0].missingData).toContain('pea_open_date_missing');
  });

  it('uses the 18.6 % social rate for withdrawals from 2026', () => {
    expect(getFiscalRulesOrThrow('2026', 'FR').pea.taxByAge.every(r => r.socialRate === 0.186)).toBe(true);
    expect(getFiscalRulesOrThrow('2025', 'FR').pea.taxByAge.every(r => r.socialRate === 0.172)).toBe(true);
  });

  it('counts plan age by anniversary', () => {
    expect(planAgeYears('2019-03-01', '2024-02-28')).toBe(4);
    expect(planAgeYears('2019-03-01', '2024-03-01')).toBe(5);
  });

  it('appears in the yearly summary', () => {
    const acc = account();
    const summary = buildTaxSummary([
      row({ type: 'DEPOSIT', transactionDate: '2018-02-01', amountPrimary: '1000', instrumentId: cashEur.id }),
      row({ type: 'INCOME', transactionDate: '2023-01-01', amountPrimary: '1000', instrumentId: cashEur.id }),
      row({ type: 'WITHDRAW', transactionDate: '2024-01-10', amountPrimary: '-1000', instrumentId: cashEur.id }),
    ], [acc], [], [cashEur], '2024', {});

    expect(summary.pea.withdrawals).toHaveLength(1);
    expect(summary.pea.taxableGain).toBeCloseTo(500);
    expect(summary.pea.socialContributions).toBeCloseTo(500 * 0.172);
  });
});

describe('EUR conversion', () => {
  const usdStock = instrument('AAPL', 'stock', 'USD');

  it('converts each operation at the rate of its own date', () => {
    const acc = account({ wrapperType: 'CTO', defaultCurrency: 'USD' });
    const rates: Record<string, number> = { '2024-01-10': 0.9, '2024-06-10': 0.8 };
    const summary = buildTaxSummary([
      row({ type: 'BUY', transactionDate: '2024-01-10', quantity: '10', priceUnit: '100', amountPrimary: '-1000', assetSymbol: 'AAPL', instrumentId: usdStock.id }),
      row({ type: 'SELL', transactionDate: '2024-06-10', quantity: '10', priceUnit: '150', amountPrimary: '1500', assetSymbol: 'AAPL', instrumentId: usdStock.id }),
    ], [acc], [], [usdStock], '2024', {}, 'FR', {
      rateToEur: (_currency, date) => ({ rate: rates[date], estimated: false }),
    });

    const [event] = summary.cto.events;
    expect(event.currency).toBe('EUR');
    expect(event.acquisitionCost).toBeCloseTo(900);
    expect(event.grossAmount).toBeCloseTo(1200);
    expect(event.taxableAmount).toBeCloseTo(300);
    expect(event.missingData ?? []).not.toContain('fx_rate_missing');
  });

  it('uses the row rate when the account is in EUR, and flags an approximated rate', () => {
    const acc = account({ wrapperType: 'CTO' });
    const [own, looked] = convertToEur([
      { ...row({ amountPrimary: '100', originalCurrency: 'USD', fxRate: '0.9' }), account: acc },
      { ...row({ amountPrimary: '100', originalCurrency: 'USD' }), account: acc },
    ], () => ({ rate: 0.8, estimated: true }));

    expect(own.amountPrimary).toBe('90');
    expect(own.fxStatus).toBe('converted');
    expect(parseFloat(looked.amountPrimary)).toBeCloseTo(80);
    expect(looked.fxStatus).toBe('estimated');
  });

  it('leaves the amounts in their currency when no rate is known', () => {
    const acc = account({ wrapperType: 'CTO', defaultCurrency: 'USD' });
    const [tx] = convertToEur([{ ...row({ amountPrimary: '100' }), account: acc }], () => undefined);
    expect(tx.amountPrimary).toBe('100');
    expect(tx.fxStatus).toBe('missing');
  });
});

describe('crypto portfolio value', () => {
  const rules2024 = getFiscalRulesOrThrow('2024', 'FR');
  const btc = instrument('BTC', 'crypto');
  const eth = instrument('ETH', 'crypto');
  const coin = (overrides: Partial<UnifiedTransaction>, inst: Instrument = btc): EnrichedTransaction => ({
    ...row({ assetSymbol: inst.marketIdentifier.symbol, instrumentId: inst.id, ...overrides }),
    instrument: inst,
    resolvedWrapperType: 'CTO',
  });

  it('counts staking rewards in the portfolio value at a zero acquisition price', () => {
    const [withReward] = calculateCryptoGains([
      coin({ type: 'BUY', transactionDate: '2024-01-01', quantity: '1', priceUnit: '1000', amountPrimary: '1000' }),
      coin({ type: 'INCOME', subType: 'STAKING_REWARD', transactionDate: '2024-02-01', quantity: '1', priceUnit: '1000', amountPrimary: '1000' }),
      coin({ type: 'SELL', transactionDate: '2024-03-01', quantity: '1', priceUnit: '1000', amountPrimary: '1000' }),
    ], '2024', rules2024);

    // Portfolio 2000, cost 1000: half of the cost goes with the cession
    expect(withReward.acquisitionCost).toBeCloseTo(500);
    expect(withReward.taxableAmount).toBeCloseTo(500);
  });

  it('follows a crypto-to-crypto swap without taxing it', () => {
    const events = calculateCryptoGains([
      coin({ type: 'BUY', transactionDate: '2024-01-01', quantity: '1', priceUnit: '1000', amountPrimary: '1000' }),
      coin({ type: 'SWAP', transactionDate: '2024-02-01', quantity: '-1', priceUnit: '2000', amountPrimary: '-2000' }),
      coin({ type: 'SWAP', transactionDate: '2024-02-01', quantity: '10', priceUnit: '200', amountPrimary: '2000' }, eth),
      coin({ type: 'SELL', transactionDate: '2024-03-01', quantity: '5', priceUnit: '200', amountPrimary: '1000' }, eth),
    ], '2024', rules2024);

    expect(events).toHaveLength(1);
    // Portfolio = 10 ETH × 200 = 2000 (no BTC left): half of the 1000 cost goes
    expect(events[0].acquisitionCost).toBeCloseTo(500);
  });

  it('removes coins sent elsewhere and flags the later cessions', () => {
    const [event] = calculateCryptoGains([
      coin({ type: 'BUY', transactionDate: '2024-01-01', quantity: '2', priceUnit: '1000', amountPrimary: '2000' }),
      coin({ type: 'WITHDRAW', transactionDate: '2024-02-01', quantity: '1', priceUnit: '1000', amountPrimary: '1000' }),
      coin({ type: 'SELL', transactionDate: '2024-03-01', quantity: '1', priceUnit: '1000', amountPrimary: '1000' }),
    ], '2024', rules2024);

    // 1 BTC left worth 1000, carrying 1000 of cost: no gain
    expect(event.acquisitionCost).toBeCloseTo(1000);
    expect(event.taxableAmount).toBeCloseTo(0);
    expect(event.missingData).toContain('crypto_withdrawal_unmatched');
  });
});
