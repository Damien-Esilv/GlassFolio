/**
 * Tests — GDPR export (E15): demo accounts are never exported, only persisted data of a real
 * account is, and the archive carries a manifest, profile and consent without any secret.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const vaultState = vi.hoisted(() => ({ real: false }));

// A real vault header would make AppStorage require an unlocked vault for every write, so the
// "real account" flag is driven directly here.
vi.mock('../../../src/services/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/services/db')>()),
  isRealUserVaultActive: () => vaultState.real,
}));
import {
  buildRGPDArchiveFiles,
  canExportAccountData,
  exportBackupJSON,
  exportRGPDZip,
  exportTransactionsCSV,
  ExportNotAllowedError,
  GDPR_EXPORT_SCHEMA,
} from '../../../src/services/exportService';
import { appStorage } from '../../../src/services/storage/appStorage';
import { setConsent } from '../../../src/services/consentService';

const setRealAccount = (real: boolean) => {
  vaultState.real = real;
};

beforeEach(() => setRealAccount(false));

describe('GDPR export - demo account guard', () => {
  it('refuses every export when no real vault exists', async () => {
    expect(canExportAccountData()).toBe(false);
    await expect(exportRGPDZip()).rejects.toBeInstanceOf(ExportNotAllowedError);
    await expect(exportBackupJSON()).rejects.toBeInstanceOf(ExportNotAllowedError);
    await expect(exportTransactionsCSV()).rejects.toBeInstanceOf(ExportNotAllowedError);
  });

  it('refuses the export for the demo vault', async () => {
    setRealAccount(false);
    expect(canExportAccountData()).toBe(false);
    await expect(buildRGPDArchiveFiles()).rejects.toBeInstanceOf(ExportNotAllowedError);
  });
});

describe('GDPR export - real account archive', () => {
  it('contains no demo seed data for an empty real account', async () => {
    setRealAccount(true);
    const files = await buildRGPDArchiveFiles();
    const backupName = Object.keys(files).find(name => name.startsWith('data/glassfolio-backup-'));
    expect(backupName).toBeDefined();
    const backup = JSON.parse(files[backupName as string]) as { data: Record<string, unknown[]> };
    const nonEmpty = Object.entries(backup.data).filter(([, rows]) => rows.length > 0);
    expect(nonEmpty).toEqual([]);
    expect(Object.keys(files).some(name => name.startsWith('data/csv/'))).toBe(false);
  });

  it('exports persisted data with manifest, profile, consent and no secrets', async () => {
    appStorage.setItem('glassfolio_user', JSON.stringify({
      id: 'u-real', email: 'real@example.com', name: 'Real', masterPasswordHash: 'h', authSalt: 's',
    }));
    appStorage.setItem('glassfolio_transactions', JSON.stringify([{ id: 't1', symbol: 'CW8', amount: 10 }]));
    appStorage.setItem('glassfolio_ai_settings_v1', JSON.stringify({ model: 'x', apiKey: 'sk-secret' }));
    setConsent(false);
    setRealAccount(true);

    const files = await buildRGPDArchiveFiles();

    expect(Object.keys(files)).toEqual(expect.arrayContaining([
      'manifest.json', 'profile.json', 'consent.json', 'security-summary.json', 'README.txt', 'data/csv/transactions.csv',
    ]));
    const manifest = JSON.parse(files['manifest.json']);
    expect(manifest.schema).toBe(GDPR_EXPORT_SCHEMA);
    expect(manifest.collections.transactions).toBe(1);
    expect(JSON.parse(files['profile.json']).email).toBe('real@example.com');
    expect(JSON.parse(files['consent.json']).analytics).toBe(false);

    // The manifest names the excluded secret fields on purpose; every other file must not carry them.
    const everything = Object.entries(files).filter(([name]) => name !== 'manifest.json').map(([, content]) => content).join('\n');
    expect(everything).not.toContain('sk-secret');
    expect(everything).not.toContain('"masterPasswordHash"');
    expect(everything).not.toContain('"authSalt"');
  });
});
