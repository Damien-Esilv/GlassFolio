import { describe, it, expect } from 'vitest';
import { calculateCryptoGains, buildTaxSummary, generateFormMappings, detectForeignAccounts, comparePFUvsBareme, EnrichedTransaction } from '../../../../src/services/fiscal/taxEngine';
import { getFiscalRulesOrThrow } from '../../../../src/services/fiscal/taxRules';
import { CGI_ARTICLES } from '../../../../src/constants/fiscalConstants';
import { UnifiedTransaction, Account, Institute, Instrument } from '../../../../src/types/types.backend';

// Helper to construct EnrichedTransaction objects for testing
function createMockCryptoTx(overrides: Partial<EnrichedTransaction> = {}): EnrichedTransaction {
  return {
    id: 'tx-crypto-1',
    ownerId: 'user-1',
    accountId: 'acc-crypto-1',
    instrumentId: 'inst-btc',
    batchId: 'batch-1',
    rowHash: 'hash-1',
    sourceOrigin: 'FILE',
    isSynthetic: false,
    isFiscal: true,
    sourceMode: 'history',
    transactionDate: '2024-05-10T10:00:00Z',
    type: 'BUY',
    rawType: 'BUY',
    rawLabel: 'Buy BTC',
    amountPrimary: '1000',
    assetSymbol: 'BTC',
    priceUnit: '1000',
    quantity: '1',
    feeAmount: '0',
    createdAt: '2024-05-10T10:00:00Z',
    updatedAt: '2024-05-10T10:00:00Z',
    version: 1,
    instrument: {
      id: 'inst-btc',
      ownerId: 'user-1',
      name: 'Bitcoin',
      type: 'crypto',
      marketIdentifier: { symbol: 'BTC' },
      isMarketReady: true,
      denominationCurrency: 'EUR',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
    resolvedWrapperType: 'CTO',
    ...overrides,
  };
}

describe('calculateCryptoGains', () => {
  const rules2024 = getFiscalRulesOrThrow('2024', 'FR');

  it('returns empty array when no transactions are provided', () => {
    const events = calculateCryptoGains([], '2024', rules2024);
    expect(events).toEqual([]);
  });

  it('ignores non-crypto transactions', () => {
    const nonCryptoTx = createMockCryptoTx({
      instrument: {
        id: 'inst-stock',
        ownerId: 'user-1',
        name: 'Apple Inc.',
        type: 'stock',
        marketIdentifier: { symbol: 'AAPL' },
        isMarketReady: true,
        denominationCurrency: 'USD',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      type: 'SELL',
      amountPrimary: '500',
    });

    const events = calculateCryptoGains([nonCryptoTx], '2024', rules2024);
    expect(events).toEqual([]);
  });

  it('ignores crypto transactions with isFiscal = false', () => {
    const nonFiscalTx = createMockCryptoTx({
      isFiscal: false,
      type: 'SELL',
      amountPrimary: '500',
    });

    const events = calculateCryptoGains([nonFiscalTx], '2024', rules2024);
    expect(events).toEqual([]);
  });

  it('calculates a crypto gain accurately for a buy and sell in the same fiscal year', () => {
    const buyTx = createMockCryptoTx({
      id: 'tx-buy-btc',
      transactionDate: '2024-01-15T10:00:00Z',
      type: 'BUY',
      quantity: '1',
      priceUnit: '30000',
      amountPrimary: '30000',
      feeAmount: '10',
      assetSymbol: 'BTC',
    });

    const sellTx = createMockCryptoTx({
      id: 'tx-sell-btc',
      transactionDate: '2024-06-20T14:00:00Z',
      type: 'SELL',
      quantity: '0.5',
      amountPrimary: '25000',
      priceUnit: '50000',
      feeAmount: '50',
      assetSymbol: 'BTC',
    });

    const events = calculateCryptoGains([buyTx, sellTx], '2024', rules2024);

    expect(events).toHaveLength(1);
    const event = events[0];

    expect(event.transactionIds).toEqual(['tx-sell-btc']);
    expect(event.fiscalYear).toBe('2024');
    expect(event.eventType).toBe('crypto_gain');
    expect(event.symbol).toBe('BTC');
    expect(event.instrumentName).toBe('Bitcoin');
    expect(event.grossAmount).toBe(25000);

    // Total cost basis = 30000 + 10 = 30010
    // Estimated portfolio value = 1 * 50000 = 50000
    // Fraction of portfolio = 25000 / 50000 = 0.5
    // Acquisition cost for cession = 30010 * 0.5 = 15005
    // Taxable amount = 25000 - 15005 - 50 = 9945
    expect(event.acquisitionCost).toBeCloseTo(15005, 2);
    expect(event.taxableAmount).toBeCloseTo(9945, 2);
    expect(event.fees).toBe(50);
    expect(event.currency).toBe('EUR');
    expect(event.confidence).toBe('estimated');
    expect(event.missingData).toEqual(['portfolio_valuation_approximated']);
    expect(event.legalReference).toBe(CGI_ARTICLES.ART_150_VH_BIS);
  });

  it('calculates a crypto loss when sale proceeds are lower than cost basis', () => {
    const buyTx = createMockCryptoTx({
      id: 'tx-buy-eth',
      transactionDate: '2024-02-01T09:00:00Z',
      type: 'BUY',
      quantity: '1',
      priceUnit: '3000',
      amountPrimary: '3000',
      feeAmount: '0',
      assetSymbol: 'ETH',
      instrument: {
        id: 'inst-eth',
        ownerId: 'user-1',
        name: 'Ethereum',
        type: 'crypto',
        marketIdentifier: { symbol: 'ETH' },
        isMarketReady: true,
        denominationCurrency: 'EUR',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    });

    const sellTx = createMockCryptoTx({
      id: 'tx-sell-eth',
      transactionDate: '2024-07-01T15:00:00Z',
      type: 'SELL',
      quantity: '1',
      amountPrimary: '1500',
      priceUnit: '1500',
      feeAmount: '10',
      assetSymbol: 'ETH',
      instrument: {
        id: 'inst-eth',
        ownerId: 'user-1',
        name: 'Ethereum',
        type: 'crypto',
        marketIdentifier: { symbol: 'ETH' },
        isMarketReady: true,
        denominationCurrency: 'EUR',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    });

    const events = calculateCryptoGains([buyTx, sellTx], '2024', rules2024);

    expect(events).toHaveLength(1);
    const event = events[0];

    expect(event.eventType).toBe('crypto_loss');
    expect(event.grossAmount).toBe(1500);
    // Cost basis = 3000, Taxable amount = 1500 - 3000 - 10 = -1510
    expect(event.acquisitionCost).toBe(3000);
    expect(event.taxableAmount).toBe(-1510);
  });

  it('handles crypto DEPOSIT transactions as cost basis additions', () => {
    const depositTx = createMockCryptoTx({
      id: 'tx-dep-sol',
      transactionDate: '2024-03-01T10:00:00Z',
      type: 'DEPOSIT',
      quantity: '10',
      priceUnit: '100',
      amountPrimary: '1000',
      feeAmount: '5',
      assetSymbol: 'SOL',
    });

    const sellTx = createMockCryptoTx({
      id: 'tx-sell-sol',
      transactionDate: '2024-08-01T10:00:00Z',
      type: 'SELL',
      quantity: '10',
      amountPrimary: '1500',
      priceUnit: '150',
      feeAmount: '0',
      assetSymbol: 'SOL',
    });

    const events = calculateCryptoGains([depositTx, sellTx], '2024', rules2024);

    expect(events).toHaveLength(1);
    const event = events[0];

    // Acquisition cost = 1000 + 5 = 1005
    // Taxable amount = 1500 - 1005 - 0 = 495
    expect(event.acquisitionCost).toBe(1005);
    expect(event.taxableAmount).toBe(495);
  });

  it('accumulates cost basis across multiple years and reports events only for target fiscal year', () => {
    const buy2023 = createMockCryptoTx({
      id: 'tx-buy-2023',
      transactionDate: '2023-05-10T10:00:00Z',
      type: 'BUY',
      quantity: '2',
      priceUnit: '20000',
      amountPrimary: '40000',
      feeAmount: '0',
      assetSymbol: 'BTC',
    });

    const sell2023 = createMockCryptoTx({
      id: 'tx-sell-2023',
      transactionDate: '2023-11-10T10:00:00Z',
      type: 'SELL',
      quantity: '1',
      amountPrimary: '25000',
      priceUnit: '25000',
      feeAmount: '0',
      assetSymbol: 'BTC',
    });

    const buy2024 = createMockCryptoTx({
      id: 'tx-buy-2024',
      transactionDate: '2024-02-10T10:00:00Z',
      type: 'BUY',
      quantity: '1',
      priceUnit: '50000',
      amountPrimary: '50000',
      feeAmount: '0',
      assetSymbol: 'BTC',
    });

    const sell2024 = createMockCryptoTx({
      id: 'tx-sell-2024',
      transactionDate: '2024-09-10T10:00:00Z',
      type: 'SELL',
      quantity: '1',
      amountPrimary: '60000',
      priceUnit: '60000',
      feeAmount: '0',
      assetSymbol: 'BTC',
    });

    const events = calculateCryptoGains([buy2023, sell2023, buy2024, sell2024], '2024', rules2024);

    expect(events).toHaveLength(1);
    const event = events[0];

    expect(event.transactionIds).toEqual(['tx-sell-2024']);
    expect(event.fiscalYear).toBe('2024');

    // Portfolio state, the acquisition price shrinking after every cession (art. 150 VH bis):
    // buy2023: totalAcquisitionCost = 40000, 2 BTC
    // sell2023: V = 2 × 25000 = 50000, fraction 25000 / 50000 = 0.5 → 20000 leaves the portfolio
    //           (totalAcquisitionCost = 20000, 1 BTC)
    // buy2024: totalAcquisitionCost = 20000 + 50000 = 70000, 2 BTC
    // sell2024: V = 2 × 60000 = 120000, fraction = 60000 / 120000 = 0.5
    // costBasisForCession = 70000 * 0.5 = 35000, taxableAmount = 60000 - 35000 = 25000
    expect(event.acquisitionCost).toBe(35000);
    expect(event.taxableAmount).toBe(25000);
  });

  it('stops processing when transactions are on or after the end of the fiscal year', () => {
    const buyTx = createMockCryptoTx({
      id: 'tx-buy',
      transactionDate: '2024-01-01T10:00:00Z',
      type: 'BUY',
      quantity: '1',
      amountPrimary: '1000',
    });

    const futureSellTx = createMockCryptoTx({
      id: 'tx-future-sell',
      transactionDate: '2025-01-01T00:00:00Z',
      type: 'SELL',
      quantity: '1',
      amountPrimary: '2000',
      priceUnit: '2000',
    });

    const events = calculateCryptoGains([buyTx, futureSellTx], '2024', rules2024);
    expect(events).toEqual([]);
  });

  it('derives the cession price from amount and quantity when priceUnit is 0', () => {
    const buyTx = createMockCryptoTx({
      id: 'tx-buy',
      transactionDate: '2024-01-01T10:00:00Z',
      type: 'BUY',
      quantity: '1',
      amountPrimary: '1000',
    });

    const sellTx = createMockCryptoTx({
      id: 'tx-sell-no-price',
      transactionDate: '2024-05-01T10:00:00Z',
      type: 'SELL',
      quantity: '1',
      amountPrimary: '1500',
      priceUnit: '0',
    });

    const events = calculateCryptoGains([buyTx, sellTx], '2024', rules2024);

    expect(events).toHaveLength(1);
    const event = events[0];

    // 1500 / 1 = 1500 per coin: the whole holding is sold, so the whole acquisition price is used
    expect(event.confidence).toBe('estimated');
    expect(event.missingData).toEqual(['portfolio_valuation_approximated']);
    expect(event.acquisitionCost).toBe(1000);
    expect(event.taxableAmount).toBe(500);
  });

  it('returns insufficient_data confidence when nothing is held before the sale', () => {
    const sellTx = createMockCryptoTx({
      id: 'tx-sell-nothing-held',
      transactionDate: '2024-05-01T10:00:00Z',
      type: 'SELL',
      quantity: '1',
      amountPrimary: '1500',
      priceUnit: '1500',
    });

    const events = calculateCryptoGains([sellTx], '2024', rules2024);

    expect(events).toHaveLength(1);
    expect(events[0].confidence).toBe('insufficient_data');
    expect(events[0].missingData).toBeUndefined();
    expect(events[0].acquisitionCost).toBe(0);
    expect(events[0].taxableAmount).toBe(1500);
  });

  it('falls back to instrument marketIdentifier symbol and instrument name', () => {
    const txWithoutAssetSymbol = createMockCryptoTx({
      id: 'tx-no-symbol',
      transactionDate: '2024-05-01T10:00:00Z',
      type: 'SELL',
      quantity: '1',
      amountPrimary: '100',
      priceUnit: '100',
      assetSymbol: undefined as unknown as string,
      instrument: {
        id: 'inst-cardano',
        ownerId: 'user-1',
        name: 'Cardano',
        type: 'crypto',
        marketIdentifier: { symbol: 'ADA' },
        isMarketReady: true,
        denominationCurrency: 'EUR',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    });

    const events = calculateCryptoGains([txWithoutAssetSymbol], '2024', rules2024);

    expect(events).toHaveLength(1);
    expect(events[0].symbol).toBe('ADA');
    expect(events[0].instrumentName).toBe('Cardano');
  });

  it('falls back to symbol as instrument name when instrument name is missing', () => {
    const txWithoutInstrumentName = createMockCryptoTx({
      id: 'tx-no-name',
      transactionDate: '2024-05-01T10:00:00Z',
      type: 'SELL',
      quantity: '1',
      amountPrimary: '100',
      priceUnit: '100',
      assetSymbol: 'DOT',
      instrument: {
        id: 'inst-dot',
        ownerId: 'user-1',
        name: '',
        type: 'crypto',
        marketIdentifier: { symbol: 'DOT' },
        isMarketReady: true,
        denominationCurrency: 'EUR',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    });

    const events = calculateCryptoGains([txWithoutInstrumentName], '2024', rules2024);

    expect(events).toHaveLength(1);
    expect(events[0].instrumentName).toBe('DOT');
  });
});

describe('taxEngine O(1) Lookups & Date Parsing Robustness (Jules Hardening)', () => {
  const rules2024 = getFiscalRulesOrThrow('2024', 'FR');

  it('correctly maps accounts, institutes, and instruments via stack-scoped Maps', () => {
    const mockAccounts: Account[] = [
      {
        id: 'acc-1',
        ownerId: 'user-1',
        name: 'Compte CTO',
        type: 'investment',
        wrapperType: 'CTO',
        instituteId: 'inst-1',
        defaultCurrency: 'EUR',
        isActive: true,
        openedAt: '2023-01-01',
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
      },
    ];

    const mockInstitutes: Institute[] = [
      {
        id: 'inst-1',
        ownerId: 'user-1',
        name: 'BoursoBank',
        type: 'bank',
        isCustom: false,
        country: 'FR',
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
      },
    ];

    const mockInstruments: Instrument[] = [
      {
        id: 'instr-1',
        ownerId: 'user-1',
        name: 'TotalEnergies',
        type: 'stock',
        marketIdentifier: { symbol: 'TTE' },
        isMarketReady: true,
        denominationCurrency: 'EUR',
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
      },
    ];

    const mockTxs: UnifiedTransaction[] = [
      {
        id: 'tx-1',
        ownerId: 'user-1',
        accountId: 'acc-1',
        instrumentId: 'instr-1',
        batchId: 'b-1',
        rowHash: 'h-1',
        sourceOrigin: 'FILE',
        isSynthetic: false,
        isFiscal: true,
        sourceMode: 'history',
        transactionDate: '2024-06-15T10:00:00Z',
        type: 'BUY',
        rawType: 'BUY',
        rawLabel: 'Achat TTE',
        amountPrimary: '1000',
        assetSymbol: 'TTE',
        quantity: '20',
        feeAmount: '5',
        createdAt: '2024-06-15T10:00:00Z',
        updatedAt: '2024-06-15T10:00:00Z',
        version: 1,
      },
      // Edge case: transaction without accountId or instrumentId
      {
        id: 'tx-orphan',
        ownerId: 'user-1',
        accountId: '',
        instrumentId: '',
        batchId: 'b-1',
        rowHash: 'h-2',
        sourceOrigin: 'FILE',
        isSynthetic: false,
        isFiscal: true,
        sourceMode: 'history',
        transactionDate: '2024-06-20T10:00:00Z',
        type: 'ADJUSTMENT',
        rawType: 'ADJUSTMENT',
        rawLabel: 'Ajustement',
        amountPrimary: '100',
        assetSymbol: '',
        createdAt: '2024-06-20T10:00:00Z',
        updatedAt: '2024-06-20T10:00:00Z',
        version: 1,
      },
    ];

    const mockProfile = { taxResidenceCountries: ['FR'], fiscalShares: 1 };
    const summary = buildTaxSummary(mockTxs, mockAccounts, mockInstitutes, mockInstruments, '2024', mockProfile);
    expect(summary).toBeDefined();
    expect(summary.income.totalDividends).toBe(0);
    expect(summary.cto.totalGains).toBe(0);
  });

  it('handles non-ISO dates safely with fallback parser without crashing', () => {
    const mockAccounts: Account[] = [];
    const mockInstitutes: Institute[] = [];
    const mockInstruments: Instrument[] = [];

    const mockTxs: UnifiedTransaction[] = [
      {
        id: 'tx-non-iso',
        ownerId: 'user-1',
        accountId: 'acc-1',
        instrumentId: 'instr-1',
        batchId: 'b-1',
        rowHash: 'h-3',
        sourceOrigin: 'FILE',
        isSynthetic: false,
        isFiscal: true,
        sourceMode: 'history',
        transactionDate: '2024/05/10', // non-ISO slash format
        type: 'INCOME',
        subType: 'DIVIDEND',
        rawType: 'DIVIDEND',
        rawLabel: 'Dividende',
        amountPrimary: '50',
        assetSymbol: 'TTE',
        createdAt: '2024-05-10T10:00:00Z',
        updatedAt: '2024-05-10T10:00:00Z',
        version: 1,
      },
      {
        id: 'tx-malformed',
        ownerId: 'user-1',
        accountId: 'acc-1',
        instrumentId: 'instr-1',
        batchId: 'b-1',
        rowHash: 'h-4',
        sourceOrigin: 'FILE',
        isSynthetic: false,
        isFiscal: true,
        sourceMode: 'history',
        transactionDate: '', // empty date
        type: 'INCOME',
        subType: 'DIVIDEND',
        rawType: 'DIVIDEND',
        rawLabel: 'Dividende malformed',
        amountPrimary: '25',
        assetSymbol: 'TTE',
        createdAt: '2024-05-10T10:00:00Z',
        updatedAt: '2024-05-10T10:00:00Z',
        version: 1,
      },
    ];

    const mockProfile = { taxResidenceCountries: ['FR'], fiscalShares: 1 };
    const summary = buildTaxSummary(mockTxs, mockAccounts, mockInstitutes, mockInstruments, '2024', mockProfile);
    expect(summary).toBeDefined();
    // Only the 2024 transaction should count
    expect(summary.income.totalDividends).toBe(50);
  });

  it('correctly maps form cases via O(1) formCaseMap', () => {
    const events = [
      {
        transactionIds: ['tx-1'],
        fiscalYear: '2024',
        eventType: 'capital_gain' as const,
        symbol: 'TTE',
        instrumentName: 'TotalEnergies',
        accountId: 'acc-1',
        wrapperType: 'CTO' as const,
        grossAmount: 500,
        acquisitionCost: 0,
        taxableAmount: 500,
        fees: 0,
        currency: 'EUR',
        eventDate: '2024-06-15T10:00:00Z',
        confidence: 'determined' as const,
        explanation: 'Gain CTO',
        legalReference: 'Art. 150-0 A',
      },
    ];

    const mappings = generateFormMappings(events, rules2024);
    expect(mappings).toHaveLength(1);
    expect(mappings[0].caseId).toBe('3VG');
    expect(mappings[0].value).toBe(500);
  });

  it('only carries forward the losses of the last 10 years (TGLA-188)', () => {
    const profile = { taxResidenceCountries: ['FR'], fiscalShares: 1, lossCarryforwards: { '2013': 5000, '2014': 300, '2020': 200, '2024': 999 } };
    const summary = buildTaxSummary([], [], [], [], '2024', profile);
    // 2013 expired (2024 - 10 = 2014 is the oldest usable year); a loss of 2024 itself is not "prior"
    expect(summary.cto.lossCarryforward).toBe(500);
  });

  it('declares a foreign account closed during the year, never one opened after it (TGLA-188)', () => {
    const institutes = [{ id: 'ib', ownerId: 'u', name: 'Interactive Brokers', type: 'broker', country: 'IE' }] as never[];
    const accounts = [
      { id: 'closed', ownerId: 'u', instituteId: 'ib', name: 'Closed in 2024', type: 'investment', defaultCurrency: 'EUR', isActive: false },
      { id: 'old-closed', ownerId: 'u', instituteId: 'ib', name: 'Closed long ago', type: 'investment', defaultCurrency: 'EUR', isActive: false },
      { id: 'later', ownerId: 'u', instituteId: 'ib', name: 'Opened 2025', type: 'investment', defaultCurrency: 'EUR', isActive: true, openedAt: '2025-03-01' },
    ] as never[];

    const [obligation] = detectForeignAccounts(institutes, accounts, { fiscalYear: '2024', accountsUsedInYear: new Set(['closed']) });
    expect(obligation.accountIds).toEqual(['closed']);
  });

  describe('PFU vs barème (TGLA-188)', () => {
    const ev = (eventType: string, taxableAmount: number) => ({ eventType, taxableAmount, grossAmount: Math.abs(taxableAmount), wrapperType: 'CTO' }) as never;

    it('charges the salary to neither side: only the tax these revenues add', () => {
      // Income 2025 rules, salary 35 000, one CTO gain of 10 000
      const rules = getFiscalRulesOrThrow('2025', 'FR');
      const { pfuTotal, baremeTotal, recommendation } = comparePFUvsBareme([ev('capital_gain', 10000)], { fiscalShares: 1, otherTaxableIncome: 35000 }, rules);
      // PFU: 10 000 × 12.8 % + 10 000 × 18.6 % = 1 280 + 1 860
      expect(pfuTotal).toBeCloseTo(3140, 2);
      // Barème: base 10 000 − 6.8 % deductible CSG = 9 320, all in the 30 % bracket = 2 796, + 1 860
      expect(baremeTotal).toBeCloseTo(4656, 2);
      expect(recommendation).toBe('PFU');
    });

    it('nets the losses of the year and the earlier ones before taxing', () => {
      const rules = getFiscalRulesOrThrow('2024', 'FR');
      const events = [ev('capital_gain', 1000), ev('capital_loss', -400)];
      expect(comparePFUvsBareme(events, { fiscalShares: 1, otherTaxableIncome: 0 }, rules).pfuTotal).toBeCloseTo(180, 2);
      expect(comparePFUvsBareme(events, { fiscalShares: 1, otherTaxableIncome: 0 }, rules, 600).pfuTotal).toBe(0);
    });

    it('keeps dividends of 2025 at 17.2 % of social contributions while gains are at 18.6 %', () => {
      const rules = getFiscalRulesOrThrow('2025', 'FR');
      const { pfuTotal } = comparePFUvsBareme([ev('dividend', 1000), ev('capital_gain', 1000)], { fiscalShares: 1, otherTaxableIncome: 0 }, rules);
      // 2 000 × 12.8 % + 1 000 × 17.2 % + 1 000 × 18.6 %
      expect(pfuTotal).toBeCloseTo(256 + 172 + 186, 2);
    });
  });

  it('declares one net securities result and nothing for exempt crypto (TGLA-188)', () => {
    const rules = getFiscalRulesOrThrow('2024', 'FR');
    const ev = (eventType: string, taxableAmount: number) => ({ eventType, taxableAmount, grossAmount: Math.abs(taxableAmount), wrapperType: 'CTO' }) as never;
    const boxes = (events: never[], options = {}) => Object.fromEntries(generateFormMappings(events, rules, options).map(m => [m.caseId, m.value]));

    expect(boxes([ev('capital_gain', 1000), ev('capital_loss', -400)])).toMatchObject({ '3VG': 600 });
    expect(boxes([ev('capital_gain', 1000), ev('capital_loss', -400)])['3VH']).toBeUndefined();
    expect(boxes([ev('capital_gain', 300), ev('capital_loss', -500)])).toMatchObject({ '3VH': 200 });
    expect(boxes([ev('capital_gain', 1000)], { priorLossCarryforward: 250 })).toMatchObject({ '3VG': 750 });
    expect(boxes([ev('crypto_gain', 100)], { cryptoExempt: true })['3AN']).toBeUndefined();
  });
});
