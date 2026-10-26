/**
 * Column proposals for any CSV (TGLA-151)
 * Headers AND cell contents are scored; every column ends up matched, ambiguous or unmatched,
 * and a column the engine is not sure about is never presented as a confident match.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  proposeColumnMapping,
  proposalsToMappings,
  matchHistoryColumns,
  HISTORY_COLUMN_SPECS,
  SNAPSHOT_COLUMN_SPECS,
} from '../../../../src/services/import/columnMatcher';
import type { ColumnSpec } from '../../../../src/services/import/columnMatcher';
import { parseCSVText } from '../../../../src/services/import/csvParser';

const parse = (csv: string) => parseCSVText(csv);
const propose = (csv: string) => {
  const { headers, rows } = parse(csv);
  return proposeColumnMapping(headers, rows, HISTORY_COLUMN_SPECS);
};
const byHeader = (csv: string) => Object.fromEntries(propose(csv).map(p => [p.header, p]));

describe('proposeColumnMapping — foreign layouts', () => {
  const german = 'Datum;Typ;WKN;Wertpapier;Stück;Kurs;Betrag;Gebühren\n'
    + '05.01.2024;Kauf;US0378331005;Apple Inc.;5;185,50;927,50;1,00\n'
    + '12.02.2024;Verkauf;US5949181045;Microsoft Corp.;2;400,00;800,00;1,00';

  it('maps a German export column by column', () => {
    const p = byHeader(german);
    expect(p.Datum.field).toBe('transactionDate');
    expect(p.Typ.field).toBe('type');
    expect(p['Wertpapier'].field).toBe('assetName');
    expect(p['Stück'].field).toBe('quantity');
    expect(p.Kurs.field).toBe('priceUnit');
    expect(p.Betrag.field).toBe('amountPrimary');
    expect(p['Gebühren'].field).toBe('feeAmount');
  });

  it('recognises an ISIN column under a misleading header by its content', () => {
    const p = byHeader(german);
    expect(p.WKN.field).toBe('assetIsin');
    expect(p.WKN.status).toBe('matched');
  });

  it('maps French abbreviations', () => {
    const p = byHeader("Date opération;Libellé opération;Code valeur;Sens;Qté;Prix d'exécution;Montant net;Commission;Devise\n"
      + '02/01/2024;ACHAT APPLE;US0378331005;Achat;10;185,00;1850,00;2,00;USD');
    expect(p['Date opération'].field).toBe('transactionDate');
    expect(p['Qté'].field).toBe('quantity');
    expect(p["Prix d'exécution"].field).toBe('priceUnit');
    expect(p['Montant net'].field).toBe('amountPrimary');
    expect(p.Commission.field).toBe('feeAmount');
    expect(p.Devise.field).toBe('currency');
  });
});

describe('proposeColumnMapping — headers that tell nothing', () => {
  const csv = 'when,what,how many,unit cost,ticker,cash\n'
    + '2024-01-05,buy,5,185.50,AAPL,927.50\n'
    + '2024-02-12,sell,2,400.00,MSFT,800.00\n'
    + '2024-03-01,buy,1,10.00,TSLA,10.00';
  const p = byHeader(csv);

  it('finds the date and the type from the values', () => {
    expect(p.when.field).toBe('transactionDate');
    expect(p.what.field).toBe('type');
    expect(p.ticker.field).toBe('assetSymbol');
  });

  it('leaves the numeric columns unmatched and lists numeric fields as alternatives', () => {
    for (const header of ['how many', 'unit cost', 'cash']) {
      expect(p[header].status, header).toBe('unmatched');
      expect(p[header].field, header).toBeNull();
      expect(p[header].alternatives, header).toEqual(expect.arrayContaining(['quantity', 'priceUnit', 'amountPrimary']));
    }
  });

  it('keeps one proposal per column, in file order, with the first three non-empty samples', () => {
    const proposals = propose(csv);
    expect(proposals.map(x => x.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(proposals[1].samples).toEqual(['buy', 'sell', 'buy']);
    const sparse = propose('a,b\n,x\n,\n1,y\n2,z\n3,w');
    expect(sparse[0].samples).toEqual(['1', '2', '3']);
  });
});

describe('proposeColumnMapping — contents veto a header', () => {
  it('does not take a text column called "Raw data" for a date', () => {
    const [proposal] = propose('Raw data,Qty\n"{""a"":1}",5\n"{""b"":2}",6\n"{""c"":3}",7');
    expect(proposal.field).not.toBe('transactionDate');
    expect(proposal.status).toBe('unmatched');
  });

  it('keeps a Unix timestamp column as the date', () => {
    const p = byHeader('time,qty\n1704450932,5\n1704537332,6\n1704623732,7');
    expect(p.time.field).toBe('transactionDate');
  });
});

describe('proposeColumnMapping — ambiguity', () => {
  const specs: ColumnSpec<'a' | 'b'>[] = [
    { field: 'a', synonyms: ['value'] },
    { field: 'b', synonyms: ['value'] },
  ];

  it('marks a column ambiguous when two fields fit it equally well', () => {
    const [proposal] = proposeColumnMapping(['Value'], [['1'], ['2']], specs);
    expect(proposal.field).toBe('a');
    expect(proposal.status).toBe('ambiguous');
    expect(proposal.alternatives).toEqual(['b']);
  });

  it('marks a clear winner as matched', () => {
    const [proposal] = proposeColumnMapping(['ISIN'], [['FR0000120271']], HISTORY_COLUMN_SPECS);
    expect(proposal.field).toBe('assetIsin');
    expect(proposal.status).toBe('matched');
  });

  it('turns proposals into a mapping that skips unmatched columns', () => {
    const proposals = proposeColumnMapping(['Value', 'Nothing here'], [['1', 'x']], specs);
    expect(proposalsToMappings(proposals)).toEqual({ a: 'Value' });
  });
});

describe('proposeColumnMapping — known broker headers keep their mapping', () => {
  const headersOf = (file: string): string[] =>
    parseCSVText(readFileSync(resolve(__dirname, '../../../../test-data', file), 'utf-8')).headers;

  it.each([
    'traderepublic_transactions_2024.csv',
    'bitget_transactions_h2_2024.csv',
    'coinbase_transactions_2024.csv',
    'binance_transactions_2024.csv',
    'bourso_transactions_h2_2024.csv',
  ])('%s: header-only proposals equal the header matcher', file => {
    const headers = headersOf(file);
    const proposed = proposalsToMappings(proposeColumnMapping(headers, [], HISTORY_COLUMN_SPECS));
    expect(proposed).toEqual(matchHistoryColumns(headers));
  });

  it('works for snapshot specs too', () => {
    const [isin, qty] = proposeColumnMapping(['ISIN', 'Quantité'], [['FR0000120271', '25']], SNAPSHOT_COLUMN_SPECS);
    expect(isin.field).toBe('assetIsin');
    expect(qty.field).toBe('quantity');
  });
});
