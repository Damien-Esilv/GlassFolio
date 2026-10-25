/**
 * Round trip (E15 x E28): what the GDPR archive / exports produce must be re-importable,
 * either as a full restore or as transactions only.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../../src/services/db', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../src/services/db')>();
  return { ...actual, delay: () => Promise.resolve() };
});

import { db } from '../../../../src/services/db';
import { vaultService } from '../../../../src/services/security/vaultService';
import { LocalAuthProvider } from '../../../../src/services/security/authService';
import { buildRGPDArchiveFiles, buildTransactionsCSV, exportTransactionsCSV, generateBackupData, objectsToCSV, CSV_BOM } from '../../../../src/services/exportService';
import { appStorage } from '../../../../src/services/storage/appStorage';
import { validateBackupContent, validateBackup, restoreBackupReset, mergeBackupData, mergeTransactionsOnly, pickTransactionEntities, parseFile } from '../../../../src/services/import/importManager';
import type { Transaction } from '../../../../src/types/domain';

const tx = (id: string, symbol: string, amount: number): Transaction => ({
  id, date: '2026-03-10T00:00:00.000Z', type: 'Buy', instrument: symbol, symbol, amount, price: 10,
  total: amount * 10, currency: 'EUR', source: 'manual', fees: 1, status: 'Completed',
});

const seedRealAccount = async () => {
  localStorage.clear();
  await vaultService.resetVault();
  await new LocalAuthProvider().signUp('roundtrip@example.test', 'Round-Trip-Test-Key-2026!#', 'Round Trip');
  expect(vaultService.isDemoVault()).toBe(false);
};

describe('GDPR archive JSON -> full restore', () => {
  beforeEach(seedRealAccount);

  it('restores transactions and goals from the archive backup file', async () => {
    db.saveTransactions([tx('t1', 'CW8', 5), tx('t2', 'WPEA', 3)]);
    db.saveGoals([{ id: 'g1', name: 'House', targetAmount: 1000, currentAmount: 10 } as never]);

    const files = await buildRGPDArchiveFiles();
    const backupName = Object.keys(files).find(name => name.startsWith('data/glassfolio-backup-')) as string;
    const validation = validateBackupContent(files[backupName]);
    expect(validation.valid).toBe(true);

    await seedRealAccount(); // brand new empty account on another device
    await restoreBackupReset(validation.payload!.data);

    expect(db.getTransactions().map(t => t.id)).toEqual(['t1', 't2']);
    expect(db.getGoals().map(g => g.id)).toEqual(['g1']);
  });

  it('keeps built-in reference data (instruments, mapping presets) after a restore', async () => {
    db.saveTransactions([tx('t1', 'CW8', 5)]);
    const files = await buildRGPDArchiveFiles();
    const backupName = Object.keys(files).find(name => name.startsWith('data/glassfolio-backup-')) as string;
    const validation = validateBackupContent(files[backupName]);

    await seedRealAccount();
    const presetsBefore = db.getMappingTemplates().length;
    const instrumentsBefore = db.getInstruments().length;
    await restoreBackupReset(validation.payload!.data);

    expect(db.getMappingTemplates().length).toBe(presetsBefore);
    expect(db.getInstruments().length).toBe(instrumentsBefore);
  });
});

describe('transactions only', () => {
  beforeEach(seedRealAccount);

  it('merges only the transactions of a backup into an account that has other data', async () => {
    db.saveTransactions([tx('t1', 'CW8', 5), tx('t2', 'WPEA', 3)]);
    const data = generateBackupData({ persistedOnly: true }).data as Record<string, unknown[]>;

    await seedRealAccount();
    db.saveTransactions([tx('t9', 'SWDA', 1)]);
    const result = await mergeBackupData({ transactions: data.transactions as never[] });

    expect(result.importedCount).toBe(2);
    expect(db.getTransactions().map(t => t.id).sort()).toEqual(['t1', 't2', 't9']);
  });

  it('re-imports the exported transactions CSV through the import engine', async () => {
    db.saveTransactions([tx('t1', 'CW8', 5), tx('t2', 'WPEA', 3)]);
    const csv = objectsToCSV(db.getTransactions() as unknown as Record<string, unknown>[]);

    const parsed = await parseFile(csv, { accountId: 'acc-1', mode: 'history' });
    expect(parsed.detectedPreset).toBe('GlassFolio');
    expect(parsed.stats.total).toBe(2);
    expect(parsed.stats.errors).toBe(0);
    expect(parsed.stats.valid + parsed.stats.warnings).toBe(2);
    const first = parsed.candidates[0].parsed;
    expect(first.assetSymbol).toBe('CW8');
    expect(Number(first.quantity)).toBe(5);
    expect(first.type).toBe('BUY');
  });
});

const unifiedTx = (id: string, type: string, symbol: string, qty: string, amount: string) => ({
  id, ownerId: 'u', accountId: 'acc-1', instrumentId: 'instr-1', batchId: 'batch-1', rowHash: `h-${id}`,
  externalId: id, sourceOrigin: 'FILE', isSynthetic: false, isFiscal: true, sourceMode: 'history',
  transactionDate: '2026-04-02T00:00:00.000Z', type, assetSymbol: symbol, quantity: qty,
  amountPrimary: amount, priceUnit: '10', feeAmount: '1', label: `${type} ${symbol}`,
}) as never;

const seedLedger = () => {
  db.saveInstitutes([{ id: 'inst-1', ownerId: 'u', name: 'Bourso', type: 'BROKER' } as never]);
  db.saveAccounts([{ id: 'acc-1', ownerId: 'u', instituteId: 'inst-1', name: 'PEA', type: 'PEA', defaultCurrency: 'EUR', isActive: true } as never]);
  db.saveInstruments([{ id: 'instr-1', name: 'Amundi MSCI World', type: 'ETF', denominationCurrency: 'EUR', marketIdentifier: { symbol: 'CW8' } } as never]);
  db.saveUnifiedTransactions([
    unifiedTx('u1', 'BUY', 'CW8', '5', '50'),
    unifiedTx('u2', 'INCOME', 'CW8', '0', '12'),
    unifiedTx('u3', 'SWAP', 'CW8', '2', '20'),
    unifiedTx('u4', 'ADJUSTMENT', 'CW8', '1', '10'),
  ]);
};

describe('unified ledger (E28) export and re-import', () => {
  beforeEach(seedRealAccount);

  it('exports what the Transactions page shows, not the empty legacy store', () => {
    seedLedger();
    expect(db.getTransactions()).toEqual([]);
    const csv = buildTransactionsCSV();
    expect(csv.split('\n')).toHaveLength(5);
    expect(csv).toContain('operation');
    expect(csv).toContain('PEA');
  });

  it('keeps INCOME, SWAP and ADJUSTMENT through a CSV round trip', async () => {
    seedLedger();
    const parsed = await parseFile(buildTransactionsCSV(), { accountId: 'acc-1', mode: 'history' });

    expect(parsed.detectedPreset).toBe('GlassFolio');
    expect(parsed.candidates.map(c => c.parsed.type)).toEqual(['BUY', 'INCOME', 'SWAP', 'ADJUSTMENT']);
  });

  it('puts a UTF-8 BOM only on the downloaded CSV', async () => {
    seedLedger();
    let captured: Blob | null = null;
    global.URL.createObjectURL = vi.fn((blob: Blob) => { captured = blob; return 'blob:x'; });
    global.URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    await exportTransactionsCSV();

    const bytes = await new Promise<Uint8Array>(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.readAsArrayBuffer(captured as unknown as Blob);
    });
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(buildTransactionsCSV().startsWith(CSV_BOM)).toBe(false);
  });

  it('restores only the transactions, with their accounts, into an account that has other data', async () => {
    seedLedger();
    const files = await buildRGPDArchiveFiles();
    const backupName = Object.keys(files).find(name => name.startsWith('data/glassfolio-backup-')) as string;
    const validation = await validateBackup(files[backupName]);
    expect(validation.valid).toBe(true);
    expect(validation.checksumVerified).toBe(true);

    await seedRealAccount();
    db.saveGoals([{ id: 'g-local', name: 'Local goal' } as never]);
    const picked = pickTransactionEntities({ ...validation.payload!.data, goals: [{ id: 'g-other' }] });
    expect(Object.keys(picked)).not.toContain('goals');

    const result = await mergeTransactionsOnly({ ...validation.payload!.data, goals: [{ id: 'g-other' }] });
    expect(result.importedCount).toBeGreaterThanOrEqual(4);
    expect(db.getUnifiedTransactions().map(t => t.id).sort()).toEqual(['u1', 'u2', 'u3', 'u4']);
    expect(db.getAccounts().map(a => a.id)).toEqual(['acc-1']);
    expect(db.getGoals().map(g => g.id)).toEqual(['g-local']);
  });

  it('detects an archive backup altered after export', async () => {
    seedLedger();
    const files = await buildRGPDArchiveFiles();
    const backupName = Object.keys(files).find(name => name.startsWith('data/glassfolio-backup-')) as string;
    const tampered = files[backupName].replace('"amountPrimary": "50"', '"amountPrimary": "5000"');
    expect(tampered).not.toBe(files[backupName]);

    const result = await validateBackup(tampered);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('checksum_mismatch');
  });
});

describe('restore keeps local secrets', () => {
  beforeEach(seedRealAccount);

  it('keeps the API key already stored when restoring AI settings from an export (which has none)', async () => {
    appStorage.setItem('glassfolio_ai_settings_v1', JSON.stringify({ model: 'old', apiKey: 'sk-local', customApiKey: 'ck-local' }));

    await restoreBackupReset({ aiSettings: [{ model: 'from-backup' }] });

    const stored = JSON.parse(appStorage.getItem('glassfolio_ai_settings_v1') as string);
    expect(stored).toMatchObject({ model: 'from-backup', apiKey: 'sk-local', customApiKey: 'ck-local' });
  });
});
