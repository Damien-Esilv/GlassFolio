/**
 * Export Service
 * 
 * Provides methods for exporting user data:
 * 1. Full Backup JSON (for account transfer and restore)
 * 2. RGPD Zip archive (JSON + CSV per entity) using zero-dependency Zip generator
 */

import i18n from 'i18next';
import { db, isRealUserVaultActive } from './db';
import { getConsent } from './consentService';
import { computeBackupChecksum } from './import/backupIntegrity';
import { crc32 } from './import/zipReader';
import { convertToLegacyTransaction } from './transformers';
import type { Account, Institute, Instrument, UnifiedTransaction } from '../types';
import type { Transaction } from '../types/domain';
import { totpService } from './security/totpService';
import { passkeyService } from './security/passkeyService';
import { vaultService } from './security/vaultService';
import { VaultLockedError } from './security/vaultTypes';

/** Thrown when an export is requested for a demo / not-yet-created account (no personal data to export). */
export class ExportNotAllowedError extends Error {
    constructor() {
        super('Export unavailable: the demo account holds no personal data.');
        this.name = 'ExportNotAllowedError';
    }
}

/** Only a real (non-demo) vault owns personal data that can be exported. */
export function canExportAccountData(): boolean {
    return isRealUserVaultActive();
}

function assertExportable(): void {
    if (!canExportAccountData()) throw new ExportNotAllowedError();
    // A locked vault reads as empty: the archive would look complete while holding nothing
    if (vaultService.isInitialized() && !vaultService.isUnlocked()) throw new VaultLockedError();
}

export const GDPR_EXPORT_SCHEMA = 'glassfolio-gdpr-export';
export const GDPR_EXPORT_VERSION = '2.0';

export interface BackupPayload {
    version: string;
    exportedAt: string;
    exportedBy: string;
    schema: 'transfer';
    /** SHA-256 of `JSON.stringify(data)`, verified before a restore (see backupIntegrity). */
    checksum?: string;
    data: Record<string, unknown>;
}

/**
 * Convert an array of objects to a CSV string.
 */
export function objectsToCSV(items: Record<string, unknown>[]): string {
    if (!items || items.length === 0) return '';

    // Collect all unique keys
    const headersSet = new Set<string>();
    items.forEach(item => {
        if (item && typeof item === 'object') {
            Object.keys(item).forEach(key => headersSet.add(key));
        }
    });
    const headers = Array.from(headersSet);

    const escapeCSV = (val: unknown): string => {
        if (val === null || val === undefined) return '';
        if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
        let str = String(val);
        // Security: Mitigate CSV Formula Injection (OWASP) by escaping formula trigger characters,
        // including leading whitespace, while preserving pure numeric strings (e.g. "-50.25").
        const isPureNumeric = /^[+-]?\d+(\.\d+)?$/.test(str.trim());
        if (typeof val === 'string' && !isPureNumeric && /^\s*[=+\-@%\t\r|]/.test(str)) {
            str = `'${str}`;
        }
        if (str.includes(',') || str.includes('\n') || str.includes('"') || str.includes(';')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };

    const rowHeader = headers.map(h => escapeCSV(h)).join(',');
    const rows = items.map(item => {
        return headers.map(h => escapeCSV(item[h])).join(',');
    });

    return [rowHeader, ...rows].join('\n');
}

/**
 * Zero-dependency pure JavaScript ZIP builder (Store compression mode).
 * Produces standard .zip files compatible with Windows Explorer, macOS, WinZip, etc.
 */
export function createSimpleZip(files: Record<string, string>): Blob {
    const encoder = new TextEncoder();
    const parts: Uint8Array[] = [];
    const cdEntries: Uint8Array[] = [];
    let offset = 0;

    const entries = Object.entries(files);

    for (const [filename, content] of entries) {
        const nameBytes = encoder.encode(filename);
        const contentBytes = encoder.encode(content);
        const crc = crc32(contentBytes);
        const size = contentBytes.length;

        // Local header (30 bytes + name)
        const header = new Uint8Array(30 + nameBytes.length);
        const view = new DataView(header.buffer);

        view.setUint32(0, 0x04034b50, true); // Signature
        view.setUint16(4, 20, true);         // Version needed
        view.setUint16(6, 0, true);          // Bit flag
        view.setUint16(8, 0, true);          // Compression method (0 = Store)
        view.setUint16(10, 0, true);         // Mod time
        view.setUint16(12, 0, true);         // Mod date
        view.setUint32(14, crc, true);       // CRC32
        view.setUint32(18, size, true);      // Compressed size
        view.setUint32(22, size, true);      // Uncompressed size
        view.setUint16(26, nameBytes.length, true);
        view.setUint16(28, 0, true);         // Extra length
        header.set(nameBytes, 30);

        parts.push(header, contentBytes);

        // Central directory entry (46 bytes + name)
        const cdHeader = new Uint8Array(46 + nameBytes.length);
        const cdView = new DataView(cdHeader.buffer);
        cdView.setUint32(0, 0x02014b50, true);
        cdView.setUint16(4, 20, true);
        cdView.setUint16(6, 20, true);
        cdView.setUint16(8, 0, true);
        cdView.setUint16(10, 0, true);
        cdView.setUint16(12, 0, true);
        cdView.setUint16(14, 0, true);
        cdView.setUint32(16, crc, true);
        cdView.setUint32(20, size, true);
        cdView.setUint32(24, size, true);
        cdView.setUint16(28, nameBytes.length, true);
        cdView.setUint16(30, 0, true);
        cdView.setUint16(32, 0, true);
        cdView.setUint16(34, 0, true);
        cdView.setUint16(36, 0, true);
        cdView.setUint32(38, 0, true);
        cdView.setUint32(42, offset, true);
        cdHeader.set(nameBytes, 46);

        cdEntries.push(cdHeader);
        offset += header.length + contentBytes.length;
    }

    const cdStart = offset;
    let cdSize = 0;
    for (const cd of cdEntries) {
        parts.push(cd);
        cdSize += cd.length;
    }

    // End of central directory record (22 bytes)
    const eocd = new Uint8Array(22);
    const eocdView = new DataView(eocd.buffer);
    eocdView.setUint32(0, 0x06054b50, true);
    eocdView.setUint16(4, 0, true);
    eocdView.setUint16(6, 0, true);
    eocdView.setUint16(8, entries.length, true);
    eocdView.setUint16(10, entries.length, true);
    eocdView.setUint32(12, cdSize, true);
    eocdView.setUint32(16, cdStart, true);
    eocdView.setUint16(20, 0, true);

    parts.push(eocd);

    return new Blob(parts, { type: 'application/zip' });
}

/**
 * Helper to trigger browser download of a Blob file
 */
function downloadFile(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Generate full backup JSON object
 */
export function generateBackupData(options?: { persistedOnly?: boolean }): BackupPayload {
    const data = db.exportAll(options);
    return {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        exportedBy: 'GlassFolio-v1',
        schema: 'transfer',
        data
    };
}

/** UTF-8 byte order mark: lets Excel display accented characters correctly. */
export const CSV_BOM = '\uFEFF';

/** One line of the transactions CSV: the legacy columns plus the exact operation type. */
export interface TransactionExportRow {
    id: string;
    date: string;
    type: string;
    /** Exact unified operation (BUY, SELL, INCOME, SWAP…), read first by the "GlassFolio" import preset. */
    operation: string;
    instrument: string;
    symbol: string;
    amount: number;
    price: number;
    total: number;
    currency: string;
    source: string;
    fees: number;
    status: string;
    accountName: string;
    bankName: string;
}

const LEGACY_OPERATION: Record<string, string> = {
    Buy: 'BUY',
    Sell: 'SELL',
    Deposit: 'DEPOSIT',
    Withdrawal: 'WITHDRAW',
};

/**
 * Transactions exactly as the Transactions page shows them: the unified ledger first, the legacy
 * store only when the ledger is empty. Never reads demo seed data (callers check `assertExportable`).
 */
export function buildTransactionExportRows(
    source: Record<string, unknown> = db.exportAll({ persistedOnly: true })
): TransactionExportRow[] {
    const list = <T,>(key: string): T[] => (Array.isArray(source[key]) ? (source[key] as T[]) : []);
    const unified = list<UnifiedTransaction>('unifiedTransactions');
    if (unified.length > 0) {
        const accounts = new Map(list<Account>('accounts').map(account => [account.id, account]));
        const institutes = new Map(list<Institute>('institutes').map(institute => [institute.id, institute]));
        const instruments = new Map(list<Instrument>('instruments').map(instrument => [instrument.id, instrument]));
        return unified.map(tx => {
            const legacy = convertToLegacyTransaction(tx, accounts, institutes, instruments);
            return {
                id: legacy.id,
                date: legacy.date,
                type: legacy.type,
                operation: tx.type,
                instrument: legacy.instrument,
                symbol: legacy.symbol,
                amount: legacy.amount,
                price: legacy.price,
                total: legacy.total,
                currency: legacy.currency,
                source: legacy.source,
                fees: legacy.fees,
                status: legacy.status,
                accountName: legacy.accountName ?? '',
                bankName: legacy.bankName ?? '',
            };
        });
    }
    return list<Transaction>('transactions').map(tx => ({
        id: tx.id,
        date: tx.date,
        type: tx.type,
        operation: LEGACY_OPERATION[tx.type] ?? 'BUY',
        instrument: tx.instrument,
        symbol: tx.symbol,
        amount: tx.amount,
        price: tx.price,
        total: tx.total,
        currency: tx.currency,
        source: tx.source,
        fees: tx.fees,
        status: tx.status,
        accountName: tx.accountName ?? '',
        bankName: tx.bankName ?? '',
    }));
}

/** Transactions CSV content (without BOM), ready for the import wizard's "GlassFolio" preset. */
export function buildTransactionsCSV(source?: Record<string, unknown>): string {
    return objectsToCSV(buildTransactionExportRows(source) as unknown as Record<string, unknown>[]);
}

/**
 * Trigger transactions only CSV download
 */
export async function exportTransactionsCSV(): Promise<void> {
    assertExportable();
    const csvContent = CSV_BOM + buildTransactionsCSV();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const today = new Date().toISOString().split('T')[0];
    downloadFile(blob, `glassfolio-transactions-${today}.csv`);
}

/**
 * Trigger transactions only JSON download
 */
export async function exportTransactionsJSON(): Promise<void> {
    assertExportable();
    const transactions = buildTransactionExportRows();
    const jsonContent = JSON.stringify({ transactions }, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const today = new Date().toISOString().split('T')[0];
    downloadFile(blob, `glassfolio-transactions-${today}.json`);
}

/**
 * Trigger full backup JSON download
 */
export async function exportBackupJSON(): Promise<void> {
    assertExportable();
    const payload = generateBackupData();
    payload.checksum = await computeBackupChecksum(payload.data);
    const jsonString = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const today = new Date().toISOString().split('T')[0];
    downloadFile(blob, `glassfolio-backup-${today}.json`);
}

async function readSecuritySummary(): Promise<{ totpEnabled: boolean | null; passkeyCount: number | null }> {
    let totpEnabled: boolean | null = null;
    let passkeyCount: number | null = null;
    try {
        totpEnabled = await totpService.isEnabled();
    } catch {
        // Locked or unavailable: reported as unknown rather than failing the export.
    }
    try {
        passkeyCount = (await passkeyService.listPasskeys()).length;
    } catch {
        // Same as above.
    }
    return { totpEnabled, passkeyCount };
}

/**
 * Builds the GDPR access / portability archive (Art. 15 and 20) as a file map.
 * Only data persisted for the real account is included, never demo seed data and never secrets
 * (password hashes, salts, API keys, TOTP / passkey material).
 */
export async function buildRGPDArchiveFiles(): Promise<Record<string, string>> {
    assertExportable();
    const exportedAt = new Date().toISOString();
    const today = exportedAt.split('T')[0];
    const payload = generateBackupData({ persistedOnly: true });
    payload.checksum = await computeBackupChecksum(payload.data);
    const data = (payload.data ?? {}) as Record<string, unknown>;
    const profile = Array.isArray(data.userProfile) ? data.userProfile[0] ?? null : null;

    const files: Record<string, string> = {};
    const collections: Record<string, number> = {};

    files[`data/glassfolio-backup-${today}.json`] = JSON.stringify(payload, null, 2);
    Object.entries(data).forEach(([entityName, entityData]) => {
        if (Array.isArray(entityData) && entityData.length > 0) {
            collections[entityName] = entityData.length;
            files[`data/csv/${entityName}.csv`] = CSV_BOM + objectsToCSV(entityData as Record<string, unknown>[]);
        }
    });
    // The readable transactions file is what the user sees in the app (unified ledger), re-importable as is.
    const transactionRows = buildTransactionExportRows(data);
    if (transactionRows.length > 0) {
        collections.transactions = transactionRows.length;
        files['data/csv/transactions.csv'] = CSV_BOM + buildTransactionsCSV(data);
    }

    files['profile.json'] = JSON.stringify(profile, null, 2);
    files['consent.json'] = JSON.stringify(getConsent(), null, 2);
    files['security-summary.json'] = JSON.stringify(await readSecuritySummary(), null, 2);
    files['manifest.json'] = JSON.stringify({
        schema: GDPR_EXPORT_SCHEMA,
        version: GDPR_EXPORT_VERSION,
        exportedAt,
        collections,
        excludedByDesign: ['masterPasswordHash', 'authSalt', 'apiKey', 'customApiKey', 'totpSecret', 'passkeyMaterial'],
        files: Object.keys(files).concat(['manifest.json', 'README.txt']).sort(),
    }, null, 2);
    files['README.txt'] = i18n.t('settings:dataAndBackup.gdprReadme', { date: today });
    return files;
}

/**
 * Trigger RGPD ZIP download (manifest, profile, consent, security summary, JSON backup and CSV per entity)
 */
export async function exportRGPDZip(): Promise<void> {
    const files = await buildRGPDArchiveFiles();
    const today = new Date().toISOString().split('T')[0];
    downloadFile(createSimpleZip(files), `glassfolio-data-export-${today}.zip`);
}
