/**
 * Bank statement import (Epic E52 — TGLA-253): Debit / Credit columns, the sign deciding the
 * direction on checking and savings accounts, bank categories kept as hints, OFX statements read
 * locally, and a whole statement parsed into a checking account.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../../../../src/services/db', async importOriginal => {
    const actual = await importOriginal<typeof import('../../../../src/services/db')>();
    return { ...actual, delay: () => Promise.resolve() };
});

import { db } from '../../../../src/services/db';
import { vaultService } from '../../../../src/services/security/vaultService';
import { LocalAuthProvider } from '../../../../src/services/security/authService';
import { commitBatch, parseFile } from '../../../../src/services/import/importManager';
import type { FieldMappings } from '../../../../src/services/import/importManager';
import { buildRowContext, normalizeRow } from '../../../../src/services/import/rowNormalizer';
import { matchHistoryColumns } from '../../../../src/services/import/columnMatcher';
import { detectPreset } from '../../../../src/services/import/presetDetector';
import { parseCSVText } from '../../../../src/services/import/csvParser';
import { isOfx, ofxToCsv, parseOfx, OFX_CSV_HEADERS } from '../../../../src/services/import/ofxParser';
import { readAndParseCsvFile } from '../../../../src/services/import/csvWorkerClient';

const fixture = (name: string): string => readFileSync(join(__dirname, '../../../../test-data/presets', name), 'utf-8');

const normalize = (headers: string[], row: string[], mappings: Partial<FieldMappings>, accountType: string) => {
    const full = { transactionDate: '', amountPrimary: '', ...mappings } as FieldMappings;
    const ctx = buildRowContext(headers, [row], full, { mode: 'history', delimiter: ';', accountCurrency: 'EUR', accountType });
    return normalizeRow(row, ctx).parsed;
};

describe('bank statement columns', () => {
    it('recognises Date / Libellé / Débit / Crédit / Solde headers', () => {
        const m = matchHistoryColumns(['Date', 'Libellé', 'Débit', 'Crédit', 'Solde']);
        expect(m).toMatchObject({ transactionDate: 'Date', rawLabel: 'Libellé', debitAmount: 'Débit', creditAmount: 'Crédit', balanceAfter: 'Solde' });
        expect(m.amountPrimary).toBeUndefined();
        const english = matchHistoryColumns(['Date', 'Description', 'Paid out', 'Paid in', 'Category']);
        expect(english).toMatchObject({ debitAmount: 'Paid out', creditAmount: 'Paid in', category: 'Category' });
    });

    it('turns Debit / Credit into a signed amount', () => {
        const headers = ['Date', 'Libellé', 'Débit', 'Crédit'];
        const mappings = { transactionDate: 'Date', rawLabel: 'Libellé', debitAmount: 'Débit', creditAmount: 'Crédit' };
        expect(normalize(headers, ['02/01/2025', 'LOYER', '950,00', ''], mappings, 'checking')).toMatchObject({ amountPrimary: '-950', type: 'WITHDRAW', assetSymbol: 'EUR' });
        expect(normalize(headers, ['10/01/2025', 'SALAIRE', '', '3 250,00'], mappings, 'checking')).toMatchObject({ amountPrimary: '3250', type: 'DEPOSIT' });
        // A debit written with a minus sign is still money out
        expect(normalize(headers, ['10/01/2025', 'X', '-12,50', ''], mappings, 'checking').amountPrimary).toBe('-12.5');
    });

    it('lets the sign decide on checking and savings accounts, the type column only refining it', () => {
        const headers = ['Date', 'Type', 'Libellé', 'Montant'];
        const mappings = { transactionDate: 'Date', type: 'Type', rawLabel: 'Libellé', amountPrimary: 'Montant' };
        const transfer = normalize(headers, ['20/01/2025', 'Virement', 'VIR VERS LIVRET A', '-150,00'], mappings, 'checking');
        expect(transfer).toMatchObject({ type: 'WITHDRAW', subType: 'TRANSFER_OUT', isFiscal: false });
        const credit = normalize(headers, ['12/01/2025', 'Crédit', 'REMBOURSEMENT CREDIT', '-512,30'], mappings, 'checking');
        expect(credit.type).toBe('WITHDRAW');
        const incomingTransfer = normalize(headers, ['20/01/2025', 'Virement', 'VIR RECU', '80,00'], mappings, 'savings');
        expect(incomingTransfer).toMatchObject({ type: 'DEPOSIT', subType: 'TRANSFER_IN' });
    });

    it('keeps the old behaviour on investment accounts', () => {
        const headers = ['Date', 'Type', 'Montant', 'Devise'];
        const mappings = { transactionDate: 'Date', type: 'Type', amountPrimary: 'Montant', currency: 'Devise' };
        const row = normalize(headers, ['20/01/2025', 'Virement', '-150,00', 'EUR'], mappings, 'investment');
        expect(row.type).toBe('TRANSFER');
        expect(row.isFiscal).toBe(true);
    });

    it('keeps the bank category, parent and merchant as hints', () => {
        const headers = ['dateOp', 'label', 'category', 'categoryParent', 'supplierFound', 'amount'];
        const mappings = { transactionDate: 'dateOp', rawLabel: 'label', amountPrimary: 'amount', category: 'category', categoryParent: 'categoryParent', counterparty: 'supplierFound' };
        const row = normalize(headers, ['2025-01-12', 'CARTE 11/01 SUPERMARCHE', 'Alimentation', 'Vie quotidienne', 'SUPERMARCHE', '-84,50'], mappings, 'checking');
        expect(row.metadata).toEqual({ bankHints: { category: 'Alimentation', categoryParent: 'Vie quotidienne', counterparty: 'SUPERMARCHE' } });
    });

    it('maps the BoursoBank category columns through its preset', () => {
        const { headers } = parseCSVText(fixture('boursobank_official_2025.csv'));
        const detected = detectPreset(headers);
        expect(detected?.presetName).toBe('Bourso');
        expect(detected?.mappings).toMatchObject({ category: 'category', categoryParent: 'categoryParent', counterparty: 'supplierFound' });
    });
});

describe('OFX statements', () => {
    it('reads SGML statements: dates, signed amounts, labels with their memo, references and types', () => {
        const text = fixture('generic_bank_statement_2025.ofx');
        expect(isOfx(text)).toBe(true);
        expect(isOfx('Date;Libellé\n')).toBe(false);
        const rows = parseOfx(text);
        expect(rows).toHaveLength(5);
        expect(rows[0]).toEqual({ date: '2025-01-02', amount: '-950.00', label: 'PRLV SEPA FONCIA LOYER JANVIER', reference: '2025010200001', type: 'debit', currency: 'EUR' });
        expect(rows[1]).toMatchObject({ date: '2025-01-05', amount: '-42.80', label: 'CARTE CARREFOUR CITY & CO', type: 'pos' });
        expect(rows[4]).toMatchObject({ amount: '3.12', type: 'int' });
    });

    it('reads XML statements and skips incomplete blocks', () => {
        const xml = `<?xml version="1.0"?><OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>USD</CURDEF><BANKTRANLIST>
            <STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20250301</DTPOSTED><TRNAMT>+12.00</TRNAMT><FITID>a</FITID><NAME>REFUND</NAME></STMTTRN>
            <STMTTRN><TRNTYPE>DEBIT</TRNTYPE><TRNAMT>-5</TRNAMT><FITID>no-date</FITID></STMTTRN>
            </BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
        expect(parseOfx(xml)).toEqual([{ date: '2025-03-01', amount: '12.00', label: 'REFUND', reference: 'a', type: 'credit', currency: 'USD' }]);
    });

    it('becomes a CSV the OFX preset maps, from a dropped file too', async () => {
        const csv = ofxToCsv(fixture('generic_bank_statement_2025.ofx'));
        const { headers } = parseCSVText(csv, ';');
        expect(headers).toEqual([...OFX_CSV_HEADERS]);
        expect(detectPreset(headers)).toMatchObject({ presetName: 'OFX', mappings: { transactionDate: 'Date', amountPrimary: 'Amount', rawLabel: 'Label', externalId: 'Reference', bankTxType: 'OFX type' } });
        const read = await readAndParseCsvFile(new Blob([fixture('generic_bank_statement_2025.ofx')]));
        expect(read.parsed.rows).toHaveLength(5);
        expect(read.text.startsWith('Date;Label;Amount')).toBe(true);
    });
});

describe('a statement parsed into a checking account', () => {
    beforeEach(async () => {
        localStorage.clear();
        await vaultService.resetVault();
        await new LocalAuthProvider().signUp('bank.import@example.test', 'Bank-Import-Test-Key-2026!#xx', 'Bank Import');
        db.saveInstitutes([{ id: 'inst', ownerId: 'u', name: 'Banque', type: 'bank' } as never]);
        db.saveAccounts([{ id: 'acc-checking', ownerId: 'u', instituteId: 'inst', name: 'Courant', type: 'checking', defaultCurrency: 'EUR', isActive: true } as never]);
    });

    it('stages signed bank movements with compact metadata', async () => {
        const csv = fixture('generic_bank_statement_2025.csv');
        const { headers } = parseCSVText(csv, ';');
        const result = await parseFile(csv, {
            accountId: 'acc-checking',
            mode: 'history',
            delimiter: ';',
            customMappings: { ...matchHistoryColumns(headers), transactionDate: 'Date', amountPrimary: '' } as FieldMappings,
        });
        expect(result.stats.total).toBe(7);
        expect(result.stats.errors).toBe(0);
        const byLabel = new Map(result.candidates.map(c => [c.parsed.rawLabel, c.parsed]));
        expect(byLabel.get('PRLV SEPA FONCIA LOYER')).toMatchObject({ type: 'WITHDRAW', amountPrimary: '-950', isFiscal: false });
        expect(byLabel.get('VIR SEPA RECU ACME SAS SALAIRE')).toMatchObject({ type: 'DEPOSIT', amountPrimary: '3250' });
        expect(byLabel.get('REMBOURSEMENT CREDIT IMMO')).toMatchObject({ type: 'WITHDRAW' });
        // No raw CSV row copied into every bank line
        expect(byLabel.get('CARTE 04/01 CARREFOUR CITY PARIS')?.metadata).toBeUndefined();
    });

    it('commits the bank movements outside the tax engine', async () => {
        const csv = fixture('generic_bank_statement_2025.csv');
        const { headers } = parseCSVText(csv, ';');
        const result = await parseFile(csv, {
            accountId: 'acc-checking',
            mode: 'history',
            delimiter: ';',
            customMappings: { ...matchHistoryColumns(headers), transactionDate: 'Date', amountPrimary: '' } as FieldMappings,
        });
        const committed = await commitBatch(result.candidates, 'acc-checking', 'history', 'statement.csv', 'hash-statement', 'u', undefined, ';');
        expect(committed.success).toBe(true);
        const rows = db.getUnifiedTransactionsByAccount('acc-checking');
        expect(rows).toHaveLength(7);
        expect(rows.every(row => row.isFiscal === false)).toBe(true);
    });
});
