/**
 * Import pipeline integrity (TGLA-147)
 * Real files through parseFile + commitBatch: identity, sign conventions, currency,
 * unknown costs, duplicates and oversells must all behave on any broker layout.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../../../../src/services/db', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../src/services/db')>();
  return { ...actual, delay: () => Promise.resolve() };
});

import { db } from '../../../../src/services/db';
import { vaultService } from '../../../../src/services/security/vaultService';
import { LocalAuthProvider } from '../../../../src/services/security/authService';
import { parseFile, commitBatch, detectPreset, parseCSVText } from '../../../../src/services/import/importManager';
import type { FieldMappings, ParseResult } from '../../../../src/services/import/importManager';
import { matchHistoryColumns } from '../../../../src/services/import/columnMatcher';
import { parseSnapshotFile } from '../../../../src/services/import/snapshotService';
import { computeRowHash } from '../../../../src/services/core/transactionManager';

const ACCOUNT = 'acc-1';

const seed = async (): Promise<void> => {
  localStorage.clear();
  await vaultService.resetVault();
  await new LocalAuthProvider().signUp('integrity@example.test', 'Integrity-Test-Key-2026!#xx', 'Integrity');
  db.saveInstitutes([{ id: 'inst-1', ownerId: 'u', name: 'Broker', type: 'BROKER' } as never]);
  db.saveAccounts([{ id: ACCOUNT, ownerId: 'u', instituteId: 'inst-1', name: 'CTO', type: 'investment', defaultCurrency: 'EUR', isActive: true } as never]);
};

const sample = (name: string): string => fs.readFileSync(path.join(process.cwd(), 'test-data', name), 'utf8');

/** Same mapping choice as the wizard: a known preset first, then the generic matcher. */
const mappingsFor = (csv: string): FieldMappings => {
  const { headers } = parseCSVText(csv);
  const detected = detectPreset(headers);
  return (detected ? detected.mappings : matchHistoryColumns(headers)) as FieldMappings;
};

const parse = (csv: string, mappings: FieldMappings = mappingsFor(csv)): Promise<ParseResult> =>
  parseFile(csv, { accountId: ACCOUNT, mode: 'history', customMappings: mappings });

const importAll = async (csv: string, mappings?: FieldMappings): Promise<ParseResult> => {
  const parsed = await parse(csv, mappings);
  const result = await commitBatch(parsed.candidates, ACCOUNT, 'history', 'file.csv', parsed.fileHash, 'u');
  expect(result.success).toBe(true);
  return parsed;
};

const codes = (parsed: ParseResult, row: number): string[] => parsed.candidates[row].errors.map(e => e.code ?? '');

describe('import pipeline integrity', () => {
  beforeEach(seed);

  it('imports the Binance statement without rejecting rows and without taking coin units for euros', async () => {
    const parsed = await importAll(sample('binance_transactions_2024.csv'));

    expect(parsed.stats.total).toBe(30);
    expect(parsed.stats.errors).toBe(0);
    expect(parsed.candidates.every(c => codes(parsed, c.rowIndex).includes('COST_UNKNOWN'))).toBe(true);
    const positions = db.getPositions();
    expect(positions.length).toBeGreaterThan(0);
    expect(positions.every(p => p.avgCost !== p.quantity)).toBe(true);
  });

  it('reads a bank statement without type column as cash deposits and withdrawals', async () => {
    const parsed = await importAll(sample('bourso_transactions_h2_2024.csv'));

    expect(parsed.stats.errors).toBe(0);
    expect(parsed.stats.warnings).toBe(0);
    const journal = db.getUnifiedTransactions();
    expect(journal).toHaveLength(20);
    expect(journal.every(t => t.assetSymbol === 'EUR')).toBe(true);
    const types = new Set(journal.map(t => t.type));
    expect([...types].every(type => type === 'DEPOSIT' || type === 'WITHDRAW')).toBe(true);
    expect(types.has('DEPOSIT') && types.has('WITHDRAW')).toBe(true);
  });

  it('gives a file with an ISIN and no symbol column a real instrument and a position', async () => {
    const csv = 'Date,Type,ISIN,Name,Shares,Price,Amount\n2024-01-08,BUY,US0378331005,Apple Inc.,5,185.50,927.50';
    await importAll(csv);

    const [tx] = db.getUnifiedTransactions();
    expect(tx.instrumentId).not.toBe('');
    expect(tx.assetSymbol).not.toBe('UNKNOWN');
    expect(tx.assetIsin).toBe('US0378331005');
    const positions = db.getPositions();
    expect(positions).toHaveLength(1);
    expect(positions[0].quantity).toBe(5);
  });

  it('keeps two different ETFs bought the same day for the same amount in a file without symbols (TGLA-188)', async () => {
    const csv = 'Date,Type,ISIN,Name,Shares,Price,Amount\n'
      + '2024-02-01,BUY,IE00B4L5Y983,iShares Core MSCI World,10,50,500\n'
      + '2024-02-01,BUY,IE00BKM4GZ66,iShares Core MSCI EM IMI,10,50,500';
    const parsed = await importAll(csv);

    expect(parsed.candidates.map(c => c.status)).not.toContain('duplicate');
    expect(db.getUnifiedTransactions()).toHaveLength(2);
    expect(db.getPositions()).toHaveLength(2);

    // Importing the same file again still recognises both rows
    const again = await parse(csv);
    expect(again.candidates.map(c => c.status)).toEqual(['duplicate', 'duplicate']);
  });

  it('still recognises a row stored with the hash older versions computed (no symbol in it)', async () => {
    const csv = 'Date,Type,ISIN,Name,Shares,Price,Amount\n2024-02-01,BUY,IE00B4L5Y983,iShares Core MSCI World,10,50,500';
    const parsed = await importAll(csv);
    const legacyHash = parsed.candidates[0].legacyRowHash;
    expect(legacyHash).toBeDefined();
    db.saveUnifiedTransactions(db.getUnifiedTransactions().map(tx => ({ ...tx, rowHash: legacyHash as string })));

    const again = await parse(csv);
    expect(again.candidates[0].status).toBe('duplicate');
  });

  it('imports a French layout without a type column: negative quantity is a sell, negative fees are costs, devise is the currency', async () => {
    const csv = 'Date;Produit;Code ISIN;Quantité;Cours;Devise;Total;Frais de courtage\n'
      + '02-01-2024;APPLE INC;US0378331005;10;185,00;USD;-1 850,00;-2,00\n'
      + '03-02-2024;APPLE INC;US0378331005;-4;190,00;USD;760,00;-2,00';
    const mappings = matchHistoryColumns(parseCSVText(csv).headers) as FieldMappings;
    expect(mappings.currency).toBe('Devise');
    expect(mappings.assetSymbol).toBeUndefined();

    const parsed = await importAll(csv, mappings);

    expect(parsed.stats.errors).toBe(0);
    const [buy, sell] = parsed.candidates.map(c => c.parsed);
    expect(buy.type).toBe('BUY');
    expect(sell.type).toBe('SELL');
    expect(sell.quantity).toBe('4');
    expect(sell.feeAmount).toBe('2');
    expect(sell.originalCurrency).toBe('USD');
    expect(codes(parsed, 1)).toContain('TYPE_INFERRED');
    expect(db.getPositions()[0].quantity).toBe(6);
  });

  it('reads 3-digit decimal quantities in a semicolon file as decimals, not thousands', async () => {
    const csv = 'Date;Type;Symbol;Shares;Price;Amount\n'
      + '2024-01-05;BUY;AAPL;1,500;100,00;150,00\n'
      + '2024-01-06;BUY;AAPL;2,250;100,00;225,00\n'
      + '2024-01-07;BUY;AAPL;10;123,50;1 235,00';
    const parsed = await parse(csv, matchHistoryColumns(parseCSVText(csv, ';').headers) as FieldMappings);

    expect(parsed.candidates.map(c => c.parsed.quantity)).toEqual(['1.5', '2.25', '10']);
    expect(parsed.candidates[2].parsed.amountPrimary).toBe('1235');
  });

  it('keeps every real trade when a file overlaps an earlier import (2 stored, 3 in the file)', async () => {
    const header = 'Date,Type,Symbol,Shares,Price,Amount';
    const row = '2024-01-01,BUY,AAPL,5,100,500';
    await importAll([header, row, row].join('\n'));
    expect(db.getUnifiedTransactions()).toHaveLength(2);

    const parsed = await parse([header, row, row, row].join('\n'));

    expect(parsed.stats.duplicates).toBe(2);
    expect(parsed.stats.valid + parsed.stats.warnings).toBe(1);
    expect(parsed.candidates.filter(c => c.status === 'duplicate').every(c => c.resolution === 'skip')).toBe(true);
  });

  it('warns, without rejecting the row, when a sell is larger than the position', async () => {
    const csv = 'Date,Type,Symbol,Shares,Price,Amount\n2024-01-01,BUY,AAPL,5,100,500\n2024-03-01,SELL,AAPL,10,250,2500';
    const parsed = await parse(csv);

    const oversell = parsed.candidates[1].errors.find(e => e.code === 'OVERSELL');
    expect(oversell?.severity).toBe('warning');
    expect(parsed.candidates[1].status).toBe('warning');
    expect(parsed.candidates[0].errors.some(e => e.code === 'OVERSELL')).toBe(false);
  });

  it('counts the holdings of earlier imports when checking an oversell', async () => {
    const header = 'Date,Type,Symbol,Shares,Price,Amount';
    await importAll([header, '2024-01-01,BUY,AAPL,10,100,1000'].join('\n'));

    const parsed = await parse([header, '2024-03-01,SELL,AAPL,10,250,2500'].join('\n'));

    expect(codes(parsed, 0)).not.toContain('OVERSELL');
  });

  it('rejects split rows instead of reading them as purchases', async () => {
    const csv = 'Date,Type,Symbol,Shares,Price,Amount\n2024-01-01,Split,AAPL,10,0,0';
    const parsed = await parse(csv);

    expect(parsed.candidates[0].status).toBe('error');
    expect(codes(parsed, 0)).toContain('CORPORATE_ACTION_UNSUPPORTED');
  });

  it('rejects an unknown label that carries no sign information, and warns when a sign exists', async () => {
    const csv = 'Date,Type,Symbol,Shares,Price,Amount\n2024-01-01,Foo,AAPL,,,100\n2024-01-02,Foo,AAPL,5,20,100';
    const parsed = await parse(csv);

    expect(parsed.candidates[0].errors.find(e => e.code === 'TYPE_UNRECOGNIZED')?.severity).toBe('error');
    expect(parsed.candidates[1].errors.find(e => e.code === 'TYPE_UNRECOGNIZED')?.severity).toBe('warning');
  });

  it.each([
    'traderepublic_transactions_2024.csv',
    'coinbase_transactions_2024.csv',
    'bitget_transactions_h2_2024.csv',
    'binance_transactions_h1_2024.csv',
  ])('keeps importing %s without errors', async name => {
    const parsed = await parse(sample(name));
    expect(parsed.stats.errors).toBe(0);
    expect(parsed.stats.total).toBeGreaterThan(0);
  });

  it('keeps the GlassFolio export preset and maps its currency column to the currency field', async () => {
    const csv = 'id,date,type,operation,instrument,symbol,amount,price,total,currency,source,fees,status,accountName,bankName\n'
      + 't1,2026-03-10,Buy,BUY,Amundi MSCI World,CW8,5,10,50,EUR,manual,1,Completed,CTO,Broker';
    const detected = detectPreset(parseCSVText(csv).headers);

    expect(detected?.presetName).toBe('GlassFolio');
    expect(detected?.mappings.currency).toBe('currency');
    expect(detected?.mappings.assetSymbol).toBe('symbol');
    const parsed = await parse(csv);
    expect(parsed.stats.errors).toBe(0);
    expect(parsed.candidates[0].parsed.assetSymbol).toBe('CW8');
  });

  it('reads 3-digit decimal quantities in a snapshot file as decimals, not thousands', async () => {
    const csv = 'Symbol;Quantité;PRU\nAAPL;1,500;100,00\nMSFT;2,250;200,50';
    const parsed = await parseSnapshotFile(csv, { assetSymbol: 'Symbol', quantity: 'Quantité', avgPrice: 'PRU' });

    expect(parsed.positions.map(p => p.position.quantity)).toEqual(['1.5', '2.25']);
    expect(parsed.positions.map(p => p.position.avgPrice)).toEqual(['100', '200.5']);
  });

  it('keeps the row hash of ordinary broker rows, so files imported before still dedupe', async () => {
    const generic = await parse('Date,Type,Symbol,Shares,Price,Amount,Fee\n2024-01-08,BUY,AAPL,5,185.5,927.5,1');
    expect(generic.candidates[0].rowHash).toBe(await computeRowHash('2024-01-08T00:00:00.000Z', '927.5', 'AAPL', 'BUY', '1'));

    const binance = await parse('UTC_Time,Account,Operation,Coin,Change,Fee,Remark\n2024-01-05 10:15:32,Spot,Buy,BTC,0.025,-0.0001,Market order');
    expect(binance.candidates[0].rowHash).toBe(await computeRowHash('2024-01-05T10:15:32.000Z', '0.025', 'BTC', 'BUY', '-0.0001'));
  });

  it('still reads a file with no type column and only positive amounts as purchases, without guessing noise', async () => {
    const csv = 'Date,Symbol,Shares,Price,Amount\n2024-01-05,AAPL,5,100,500\n2024-02-05,MSFT,2,200,400';
    const parsed = await parse(csv, matchHistoryColumns(parseCSVText(csv).headers) as FieldMappings);

    expect(parsed.candidates.map(c => c.parsed.type)).toEqual(['BUY', 'BUY']);
    expect(parsed.candidates.flatMap(c => c.errors.map(e => e.code))).not.toContain('TYPE_INFERRED');
    expect(parsed.stats.errors).toBe(0);
  });
});
