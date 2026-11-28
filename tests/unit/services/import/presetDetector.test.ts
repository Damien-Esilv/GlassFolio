/**
 * Broker CSV presets (TGLA-223): Revolut (stocks & ETF statement, crypto statement) and Bitpanda.
 *
 * Header layouts, as exported:
 * - Revolut stocks: Date,Ticker,Type,Quantity,Price per share,Total Amount,Currency,FX Rate
 * - Revolut crypto: Symbol,Type,Quantity,Price,Value,Fees,Date (values like "9,94 CHF", dates like "25 janv. 2026, 13:15:23")
 * - Bitpanda: six one-field preamble lines, then 16 columns (2021-2023 exports) or 18 with
 *   "Fee percent" and "Tax Fiat" (2025 exports); missing values are "-".
 * Coinhouse has a CSV export but its columns are documented nowhere, so it has no preset yet.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../../src/services/db', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../src/services/db')>();
  return { ...actual, delay: () => Promise.resolve() };
});

import { db } from '../../../../src/services/db';
import { vaultService } from '../../../../src/services/security/vaultService';
import { LocalAuthProvider } from '../../../../src/services/security/authService';
import { parseFile, parseCSVText } from '../../../../src/services/import/importManager';
import type { FieldMappings, ParseResult } from '../../../../src/services/import/importManager';
import { PRESET_PATTERNS, detectPreset } from '../../../../src/services/import/presetDetector';
import { readTestData } from '../../../fixtures/testData';

const REVOLUT_STOCKS_HEADERS = ['Date', 'Ticker', 'Type', 'Quantity', 'Price per share', 'Total Amount', 'Currency', 'FX Rate'];
const REVOLUT_CRYPTO_HEADERS = ['Symbol', 'Type', 'Quantity', 'Price', 'Value', 'Fees', 'Date'];
const BITPANDA_HEADERS_2021 = [
  'Transaction ID', 'Timestamp', 'Transaction Type', 'In/Out', 'Amount Fiat', 'Fiat', 'Amount Asset', 'Asset',
  'Asset market price', 'Asset market price currency', 'Asset class', 'Product ID', 'Fee', 'Fee asset', 'Spread',
  'Spread Currency',
];
const BITPANDA_HEADERS_2025 = [
  'Transaction ID', 'Timestamp', 'Transaction Type', 'In/Out', 'Amount Fiat', 'Fiat', 'Amount Asset', 'Asset',
  'Asset market price', 'Asset market price currency', 'Asset class', 'Product ID', 'Fee', 'Fee asset', 'Fee percent',
  'Spread', 'Spread Currency', 'Tax Fiat',
];

const BITPANDA_PREAMBLE = [
  '"Disclaimer: All data is without guarantee, errors and changes are reserved."',
  '"Example User, 01.01.1990"',
  'user@example.test',
  '"Account opened at: 01.02.2021, 10:00:00"',
  '"Venue: Bitpanda"',
  '"Reported by Bitpanda GmbH"',
].join('\n');

const BITPANDA_CSV = [
  BITPANDA_PREAMBLE,
  '"Transaction ID",Timestamp,"Transaction Type",In/Out,"Amount Fiat",Fiat,"Amount Asset",Asset,"Asset market price","Asset market price currency","Asset class","Product ID",Fee,"Fee asset",Spread,"Spread Currency"',
  'F0000000-0000-4000-8000-000000000001,2025-07-02T09:33:29+02:00,deposit,incoming,500.00,EUR,-,EUR,-,-,Fiat,-,8.85000000,EUR,-,-',
  'T0000000-0000-4000-8000-000000000002,2025-07-03T09:19:36+02:00,buy,outgoing,250.00,EUR,0.01329013,BTC,18810.95,EUR,Cryptocurrency,1,-,-,-,-',
  'T0000000-0000-4000-8000-000000000003,2025-08-05T14:35:07+02:00,sell,incoming,129.17,EUR,15.00000000,FTSE100,8.61,EUR,"ETF (derivative)",115,-,-,0.33000000,EUR',
].join('\n');

const REVOLUT_STOCKS_CSV = [
  REVOLUT_STOCKS_HEADERS.join(','),
  '2025-03-03T09:00:00.000Z,,CASH TOP-UP,,,USD 500,USD,1.04',
  '2025-03-04T14:31:02.786Z,AAPL,BUY - MARKET,2,USD 235.10,USD 470.20,USD,1.05',
  '2025-05-15T12:00:00.000Z,AAPL,DIVIDEND,,,USD 0.50,USD,1.12',
  '2025-06-02T15:45:10.120Z,AAPL,SELL - MARKET,1,USD 201.45,USD 201.45,USD,1.14',
].join('\n');

const REVOLUT_CRYPTO_CSV = [
  REVOLUT_CRYPTO_HEADERS.join(','),
  'BTC,Achat,"0,00014206","69 924,87 CHF","9,94 CHF","0,25 CHF","25 janv. 2025, 13:15:23"',
  'ETH,Récompense de staking,"0,0012","2 400,00 CHF","2,88 CHF","0,00 CHF","3 févr. 2025, 06:00:00"',
  'BTC,Vente,"0,0001","70 100,00 CHF","7,01 CHF","0,18 CHF","15 mars 2025, 08:00:00"',
].join('\n');

const ACCOUNT = 'acc-presets';

const seed = async (): Promise<void> => {
  localStorage.clear();
  await vaultService.resetVault();
  await new LocalAuthProvider().signUp('presets@example.test', 'Presets-Test-Key-2026!#xx', 'Presets');
  db.saveInstitutes([{ id: 'inst-1', ownerId: 'u', name: 'Broker', type: 'BROKER' } as never]);
  db.saveAccounts([{ id: ACCOUNT, ownerId: 'u', instituteId: 'inst-1', name: 'CTO', type: 'investment', defaultCurrency: 'EUR', isActive: true } as never]);
};

const parsePreset = async (csv: string, presetName: string): Promise<ParseResult> => {
  const detected = detectPreset(parseCSVText(csv).headers);
  expect(detected?.presetName).toBe(presetName);
  return parseFile(csv, { accountId: ACCOUNT, mode: 'history', customMappings: detected?.mappings as FieldMappings });
};

describe('detectPreset — Revolut', () => {
  it('recognises the stocks & ETF account statement and maps its columns', () => {
    const detected = detectPreset(REVOLUT_STOCKS_HEADERS);
    expect(detected?.presetName).toBe('Revolut');
    expect(detected?.mappings).toMatchObject({
      transactionDate: 'Date',
      type: 'Type',
      assetSymbol: 'Ticker',
      quantity: 'Quantity',
      priceUnit: 'Price per share',
      amountPrimary: 'Total Amount',
      currency: 'Currency',
    });
    expect(detected?.mappings.feeAmount).toBeUndefined();
  });

  it('recognises the crypto account statement and maps its columns', () => {
    const detected = detectPreset(REVOLUT_CRYPTO_HEADERS);
    expect(detected?.presetName).toBe('Revolut-Crypto');
    expect(detected?.mappings).toMatchObject({
      transactionDate: 'Date',
      type: 'Type',
      assetSymbol: 'Symbol',
      quantity: 'Quantity',
      priceUnit: 'Price',
      amountPrimary: 'Value',
      feeAmount: 'Fees',
    });
  });

  it('does not mistake a statement for the other one', () => {
    expect(detectPreset([...REVOLUT_STOCKS_HEADERS, 'Fees'])?.presetName).toBe('Revolut');
    expect(detectPreset([...REVOLUT_CRYPTO_HEADERS, 'Currency'])?.presetName).toBe('Revolut-Crypto');
  });
});

describe('detectPreset — Bitpanda', () => {
  it.each([
    ['2021-2023 export (16 columns)', BITPANDA_HEADERS_2021],
    ['2025 export (Fee percent, Tax Fiat)', BITPANDA_HEADERS_2025],
  ])('recognises the %s and maps its columns', (_label, headers) => {
    const detected = detectPreset(headers);
    expect(detected?.presetName).toBe('Bitpanda');
    expect(detected?.mappings).toMatchObject({
      externalId: 'Transaction ID',
      transactionDate: 'Timestamp',
      type: 'Transaction Type',
      assetSymbol: 'Asset',
      quantity: 'Amount Asset',
      priceUnit: 'Asset market price',
      amountPrimary: 'Amount Fiat',
      feeAmount: 'Fee',
      feeAsset: 'Fee asset',
      currency: 'Fiat',
    });
  });

  it('maps the tax column only when the export has one', () => {
    expect(detectPreset(BITPANDA_HEADERS_2025)?.mappings.taxAmount).toBe('Tax Fiat');
    expect(detectPreset(BITPANDA_HEADERS_2021)?.mappings.taxAmount).not.toBe('Tax Fiat');
  });

  it('is no longer taken for a Coinbase export', () => {
    // Timestamp / Transaction Type / Asset satisfy 3 of the 4 Coinbase patterns
    const names = Object.keys(PRESET_PATTERNS);
    expect(names.indexOf('Bitpanda')).toBeLessThan(names.indexOf('Coinbase'));
    expect(detectPreset(BITPANDA_HEADERS_2021)?.presetName).not.toBe('Coinbase');
  });

  it('finds the header below the preamble even in a short export', () => {
    const parsed = parseCSVText(BITPANDA_CSV);
    expect(parsed.headerRowIndex).toBe(6);
    expect(parsed.headers).toEqual(BITPANDA_HEADERS_2021);
    expect(parsed.rows).toHaveLength(3);
  });
});

describe('detectPreset — no false positives', () => {
  const sample = (name: string): string[] =>
    parseCSVText(readTestData(name)).headers;

  it.each([
    ['binance_transactions_2024.csv', 'Binance'],
    ['bitget_transactions_h2_2024.csv', 'Bitget'],
    ['bourso_transactions_h2_2024.csv', 'Bourso'],
    ['traderepublic_transactions_2024.csv', 'TradeRepublic'],
    ['coinbase_transactions_2024.csv', null],
    ['unknown_de_broker_2024.csv', null],
    ['binance_snapshot.csv', null],
    ['bitget_snapshot.csv', null],
    ['bourso_snapshot.csv', null],
    ['coinbase_snapshot.csv', null],
    ['traderepublic_snapshot.csv', null],
  ])('%s keeps its detection (%s)', (file, expected) => {
    expect(detectPreset(sample(file))?.presetName ?? null).toBe(expected);
  });

  it.each([
    ['Binance-Spot', ['Date(UTC)', 'Pair', 'Side', 'Price', 'Executed', 'Amount', 'Fee']],
    ['Bitget-Spot', ['Date', 'Order ID', 'Trading pair', 'Direction', 'Type', 'Executed quantity', 'Average price', 'Trading volume', 'Status', 'Fee']],
    ['BoursoBank-Alt', ['Date opération', 'Date valeur', 'Libellé', 'Montant', 'Solde', 'Devise']],
    ['Coinbase', ['ID', 'Timestamp', 'Transaction Type', 'Asset', 'Quantity Transacted', 'Price Currency',
      'Price at Transaction', 'Subtotal', 'Total (inclusive of fees and/or spread)', 'Fees and/or Spread', 'Notes']],
    ['Kraken', ['txid', 'ordertxid', 'pair', 'time', 'type', 'ordertype', 'price', 'cost', 'fee', 'vol', 'margin', 'misc', 'ledgers']],
    ['GlassFolio', ['id', 'date', 'operation', 'instrument', 'symbol', 'amount', 'price', 'total', 'fees', 'status', 'currency', 'source']],
  ])('%s headers are not claimed by a new preset', (expected, headers) => {
    expect(detectPreset(headers)?.presetName).toBe(expected);
  });

  it('leaves a hand-made CSV with generic columns to the column matcher', () => {
    expect(detectPreset(['Date', 'Type', 'Symbol', 'Quantity', 'Price', 'Total', 'Fees', 'Currency'])).toBeNull();
    expect(detectPreset(['Date', 'Type', 'Ticker', 'Quantity', 'Price', 'Amount', 'Currency'])).toBeNull();
  });
});

describe('audited real-world broker fixtures (TGLA-223)', () => {
  beforeEach(seed);

  const readFixture = (name: string): string =>
    readTestData(name);

  it('Trade Republic 2025 snake_case: promotes ISIN from symbol, handles CUSTOMER_INBOUND, SAVINGS_PLAN & DIVIDEND', async () => {
    const parsed = await parsePreset(readFixture('traderepublic_official_2025.csv'), 'TradeRepublic');
    expect(parsed.stats.total).toBe(4);
    expect(parsed.stats.errors).toBe(0);

    const [deposit, buy, savingsPlan, dividend] = parsed.candidates.map(c => c.parsed);
    expect(deposit).toMatchObject({ type: 'DEPOSIT', assetSymbol: 'EUR', amountPrimary: '1000' });
    expect(buy).toMatchObject({ type: 'BUY', assetIsin: 'US0378331005', quantity: '2', priceUnit: '215.5' });
    expect(buy.assetSymbol).toBeDefined();
    expect(savingsPlan).toMatchObject({ type: 'BUY', assetIsin: 'IE00B4L5Y983', quantity: '1.5', priceUnit: '95' });
    expect(dividend).toMatchObject({ type: 'INCOME', subType: 'DIVIDEND', assetIsin: 'US0378331005', amountPrimary: '2.4', taxAmount: '0.36' });
  });

  it('Coinbase 2025: skips 2 preamble lines, maps ID/Price Currency/Spot Price and strips € prefix', async () => {
    const parsed = await parsePreset(readFixture('coinbase_official_2025.csv'), 'Coinbase');
    expect(parsed.stats.total).toBe(3);
    expect(parsed.stats.errors).toBe(0);

    const [buy, staking, sell] = parsed.candidates.map(c => c.parsed);
    expect(buy).toMatchObject({
      externalId: '67800001',
      type: 'BUY',
      assetSymbol: 'BTC',
      quantity: '0.005',
      priceUnit: '90000',
      amountPrimary: '450',
      feeAmount: '6.7',
    });
    expect(staking).toMatchObject({ externalId: '67800002', type: 'INCOME', subType: 'STAKING_REWARD', assetSymbol: 'ETH', amountPrimary: '5.6' });
    expect(sell).toMatchObject({ externalId: '67800003', type: 'SELL', assetSymbol: 'BTC', quantity: '0.002', amountPrimary: '176' });
  });

  it('Binance-Spot 2025: splits Pair into base asset and extracts trailing fee units (0.001BNB)', async () => {
    const parsed = await parsePreset(readFixture('binance_spot_2025.csv'), 'Binance-Spot');
    expect(parsed.stats.total).toBe(2);
    expect(parsed.stats.errors).toBe(0);

    const [buyBtc, sellEth] = parsed.candidates.map(c => c.parsed);
    expect(buyBtc).toMatchObject({
      type: 'BUY',
      assetSymbol: 'BTC',
      quantity: '0.05',
      priceUnit: '95000',
      amountPrimary: '4750',
      feeAmount: '0.001',
      feeAsset: 'BNB',
    });
    expect(sellEth).toMatchObject({
      type: 'SELL',
      assetSymbol: 'ETH',
      quantity: '0.5',
      priceUnit: '2800',
      amountPrimary: '1400',
      feeAmount: '1.4',
      feeAsset: 'EUR',
    });
  });

  it('Kraken trades.csv 2025: normalizes XXBTZEUR & XETHZUSD pairs and maps externalId/cost/vol', async () => {
    const parsed = await parsePreset(readFixture('kraken_trades_2025.csv'), 'Kraken');
    expect(parsed.stats.total).toBe(2);
    expect(parsed.stats.errors).toBe(0);

    const [buyBtc, sellEth] = parsed.candidates.map(c => c.parsed);
    expect(buyBtc).toMatchObject({
      externalId: 'TX-KRK-001',
      type: 'BUY',
      assetSymbol: 'BTC',
      quantity: '0.01',
      priceUnit: '92000',
      amountPrimary: '920',
      feeAmount: '2.39',
    });
    expect(sellEth).toMatchObject({
      externalId: 'TX-KRK-002',
      type: 'SELL',
      assetSymbol: 'ETH',
      quantity: '0.2',
      priceUnit: '3000',
      amountPrimary: '600',
      originalCurrency: 'USD',
    });
  });

  it('BoursoBank official semicolon export (no devise column): imports as cash deposits/withdrawals in account currency', async () => {
    const parsed = await parsePreset(readFixture('boursobank_official_2025.csv'), 'Bourso');
    expect(parsed.detectedDelimiter).toBe(';');
    expect(parsed.stats.total).toBe(2);
    expect(parsed.stats.errors).toBe(0);

    const [salary, groceries] = parsed.candidates.map(c => c.parsed);
    expect(salary).toMatchObject({ type: 'DEPOSIT', assetSymbol: 'EUR', amountPrimary: '2500', balanceAfter: '2500' });
    expect(groceries).toMatchObject({ type: 'WITHDRAW', assetSymbol: 'EUR', amountPrimary: '-84.5', balanceAfter: '2415.5' });
  });

  it('Bitget-Spot 2025: detects Trading pair / Direction / Executed quantity / Trading volume', async () => {
    const parsed = await parsePreset(readFixture('bitget_spot_2025.csv'), 'Bitget-Spot');
    expect(parsed.stats.total).toBe(2);
    expect(parsed.stats.errors).toBe(0);

    const [buy, sell] = parsed.candidates.map(c => c.parsed);
    expect(buy).toMatchObject({
      externalId: 'BG-1001',
      type: 'BUY',
      assetSymbol: 'BTC',
      quantity: '0.01',
      priceUnit: '94000',
      amountPrimary: '940',
      feeAmount: '0.94',
      feeAsset: 'USDT',
    });
    expect(sell).toMatchObject({
      externalId: 'BG-1002',
      type: 'SELL',
      assetSymbol: 'ETH',
      quantity: '0.2',
      priceUnit: '2900',
      amountPrimary: '580',
      feeAsset: 'USDT',
    });
  });
});

describe('preset files through the import pipeline', () => {
  beforeEach(seed);

  it('reads a Revolut stocks statement: top-up, buy, dividend and sale with currency-prefixed values', async () => {
    const parsed = await parsePreset(REVOLUT_STOCKS_CSV, 'Revolut');
    expect(parsed.stats.errors).toBe(0);

    const [topUp, buy, dividend, sale] = parsed.candidates.map(c => c.parsed);
    expect(topUp.type).toBe('DEPOSIT');
    expect(topUp.assetSymbol).toBe('USD');
    expect(topUp.amountPrimary).toBe('500');

    expect(buy).toMatchObject({
      type: 'BUY',
      assetSymbol: 'AAPL',
      quantity: '2',
      priceUnit: '235.1',
      amountPrimary: '470.2',
      originalCurrency: 'USD',
      transactionDate: '2025-03-04T14:31:02.000Z',
    });
    expect(dividend).toMatchObject({ type: 'INCOME', subType: 'DIVIDEND', assetSymbol: 'AAPL', amountPrimary: '0.5' });
    expect(sale).toMatchObject({ type: 'SELL', quantity: '1', amountPrimary: '201.45' });
  });

  it('reads a Revolut crypto statement exported in French', async () => {
    const parsed = await parsePreset(REVOLUT_CRYPTO_CSV, 'Revolut-Crypto');
    expect(parsed.stats.errors).toBe(0);

    const [buy, staking, sale] = parsed.candidates.map(c => c.parsed);
    expect(buy).toMatchObject({
      type: 'BUY',
      assetSymbol: 'BTC',
      quantity: '0.00014206',
      priceUnit: '69924.87',
      amountPrimary: '9.94',
      feeAmount: '0.25',
      transactionDate: '2025-01-25T13:15:23.000Z',
    });
    expect(staking).toMatchObject({ type: 'INCOME', subType: 'STAKING_REWARD', assetSymbol: 'ETH', quantity: '0.0012' });
    expect(staking.transactionDate).toBe('2025-02-03T06:00:00.000Z');
    expect(sale).toMatchObject({ type: 'SELL', quantity: '0.0001', amountPrimary: '7.01' });
  });

  it('reads a Bitpanda history: preamble skipped, "-" read as empty, fees in their own asset', async () => {
    const parsed = await parsePreset(BITPANDA_CSV, 'Bitpanda');
    expect(parsed.stats.total).toBe(3);
    expect(parsed.stats.errors).toBe(0);

    const [deposit, buy, sale] = parsed.candidates.map(c => c.parsed);
    expect(deposit).toMatchObject({
      type: 'DEPOSIT',
      assetSymbol: 'EUR',
      amountPrimary: '500',
      feeAmount: '8.85',
      feeAsset: 'EUR',
      externalId: 'F0000000-0000-4000-8000-000000000001',
    });
    expect(deposit.quantity).not.toBe('-');

    expect(buy).toMatchObject({
      type: 'BUY',
      assetSymbol: 'BTC',
      quantity: '0.01329013',
      priceUnit: '18810.95',
      amountPrimary: '250',
      transactionDate: '2025-07-03T07:19:36.000Z',
    });
    expect(buy.feeAmount).toBeUndefined();

    expect(sale).toMatchObject({ type: 'SELL', assetSymbol: 'FTSE100', quantity: '15', amountPrimary: '129.17' });
  });
});
