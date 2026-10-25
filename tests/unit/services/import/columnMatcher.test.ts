/**
 * Tests — E28 column recognition (TGLA-102)
 * Every sample export in test-data/ must map its quantity, price and amount
 * columns to the right fields.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  tokenizeHeader,
  matchHistoryColumns,
  matchSnapshotColumns,
} from '../../../../src/services/import/columnMatcher';
import { detectPreset } from '../../../../src/services/import/presetDetector';
import { parseCSVText } from '../../../../src/services/import/csvParser';
import type { FieldMappings } from '../../../../src/services/import/importManager';

const headersOf = (file: string): string[] =>
  parseCSVText(readFileSync(resolve(__dirname, '../../../../test-data', file), 'utf-8')).headers;

const historyMappingFor = (file: string): Partial<FieldMappings> => {
  const headers = headersOf(file);
  return detectPreset(headers)?.mappings ?? matchHistoryColumns(headers);
};

describe('tokenizeHeader', () => {
  it('splits camelCase, strips accents and punctuation', () => {
    expect(tokenizeHeader('dateOp')).toEqual(['date', 'op']);
    expect(tokenizeHeader("Prix d'achat (€)")).toEqual(['prix', 'd', 'achat']);
    expect(tokenizeHeader('Opération')).toEqual(['operation']);
  });
});

describe('matchHistoryColumns — generic heuristics', () => {
  it('never maps "Exchange" to the amount just because it contains "change"', () => {
    const mapping = matchHistoryColumns(['Date', 'Exchange', 'Symbol', 'Montant']);
    expect(mapping.amountPrimary).toBe('Montant');
  });

  it('recognises French headers with accents', () => {
    const mapping = matchHistoryColumns(['Date opération', 'Date valeur', 'Opération', 'Libellé', 'Quantité', 'Cours', 'Montant', 'Frais']);
    expect(mapping).toMatchObject({
      transactionDate: 'Date opération',
      valueDate: 'Date valeur',
      type: 'Opération',
      rawLabel: 'Libellé',
      quantity: 'Quantité',
      priceUnit: 'Cours',
      amountPrimary: 'Montant',
      feeAmount: 'Frais',
    });
  });

  it('separates fee amount and fee currency', () => {
    const mapping = matchHistoryColumns(['Time', 'Symbol', 'Qty', 'Price', 'Fee', 'Fee_Ccy']);
    expect(mapping.feeAmount).toBe('Fee');
    expect(mapping.feeAsset).toBe('Fee_Ccy');
  });

  it('uses each header at most once', () => {
    const mapping = matchHistoryColumns(['Date', 'Amount']);
    const used = Object.values(mapping);
    expect(new Set(used).size).toBe(used.length);
  });
});

describe('history mappings on test-data exports', () => {
  it('Trade Republic: shares → quantity, ISIN, tax', () => {
    expect(historyMappingFor('traderepublic_transactions_2024.csv')).toMatchObject({
      quantity: 'Shares', priceUnit: 'Price', amountPrimary: 'Amount', assetIsin: 'ISIN', taxAmount: 'Tax', feeAmount: 'Fee',
    });
  });

  it('Bitget: Qty → quantity and Total_USDT → amount', () => {
    expect(historyMappingFor('bitget_transactions_h2_2024.csv')).toMatchObject({
      quantity: 'Qty', priceUnit: 'Price', amountPrimary: 'Total_USDT', feeAmount: 'Fee', feeAsset: 'Fee_Ccy',
    });
  });

  it('Coinbase: Subtotal (pre-fee) is the amount', () => {
    expect(historyMappingFor('coinbase_transactions_2024.csv')).toMatchObject({
      transactionDate: 'Date', quantity: 'Quantity', priceUnit: 'Price_Per_Unit', amountPrimary: 'Subtotal', feeAmount: 'Fees',
    });
  });

  it('Binance statement: Change is the quantity', () => {
    expect(historyMappingFor('binance_transactions_2024.csv')).toMatchObject({
      transactionDate: 'UTC_Time', assetSymbol: 'Coin', quantity: 'Change', amountPrimary: 'Change',
    });
  });

  it('Bourso: dateOp (not dateVal) and the currency column as symbol', () => {
    expect(historyMappingFor('bourso_transactions_h2_2024.csv')).toMatchObject({
      transactionDate: 'dateOp', valueDate: 'dateVal', amountPrimary: 'amount', assetSymbol: 'devise',
    });
  });
});

describe('snapshot mappings on test-data exports', () => {
  it.each([
    ['binance_snapshot.csv', { assetSymbol: 'Coin', quantity: 'Quantity', avgPrice: 'Avg_Price', purchaseDate: 'Date_Acquired' }],
    ['bitget_snapshot.csv', { assetSymbol: 'Asset', quantity: 'Amount', avgPrice: 'Average_Cost', purchaseDate: 'Acquisition_Date' }],
    ['bourso_snapshot.csv', { assetIsin: 'ISIN', assetSymbol: 'Symbol', assetName: 'Name', quantity: 'Quantity', avgPrice: 'AvgPrice' }],
    ['coinbase_snapshot.csv', { assetSymbol: 'Asset', quantity: 'Balance', avgPrice: 'Cost_Basis_Per_Unit' }],
    ['traderepublic_snapshot.csv', { assetSymbol: 'Symbol', assetIsin: 'ISIN', quantity: 'Shares', avgPrice: 'Avg_Cost' }],
  ])('%s', (file, expected) => {
    expect(matchSnapshotColumns(headersOf(file))).toMatchObject(expected);
  });

  it('prefers the cost basis over the current price', () => {
    const mapping = matchSnapshotColumns(['Libellé', 'Quantité', 'Dernier prix', 'Prix de revient', 'Valorisation']);
    expect(mapping.avgPrice).toBe('Prix de revient');
    expect(mapping.quantity).toBe('Quantité');
  });
});
