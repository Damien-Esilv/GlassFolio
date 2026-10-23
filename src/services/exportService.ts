/**
 * Export Service
 * 
 * Provides methods for exporting user data:
 * 1. Full Backup JSON (for account transfer and restore)
 * 2. RGPD Zip archive (JSON + CSV per entity) using zero-dependency Zip generator
 */

import { db } from './db';

export interface BackupPayload {
    version: string;
    exportedAt: string;
    exportedBy: string;
    schema: 'transfer';
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
        // Security: Mitigate CSV Formula & Command Injection (OWASP) by escaping formula triggers (=, +, -, @, %, |, tab, CR)
        // Ignores purely numeric strings like "-100" or "+5.2" while catching payloads like "-100_payload" or "  =SUM(1)"
        const isPureNumeric = typeof val === 'string' && /^\s*[-+]?\d+(\.\d+)?\s*$/.test(str);
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

    const crc32 = (buf: Uint8Array): number => {
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < buf.length; i++) {
            crc ^= buf[i];
            for (let j = 0; j < 8; j++) {
                crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
            }
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    };

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
export function generateBackupData(): BackupPayload {
    const data = db.exportAll();
    return {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        exportedBy: 'GlassFolio-v1',
        schema: 'transfer',
        data
    };
}

/**
 * Trigger transactions only CSV download
 */
export async function exportTransactionsCSV(): Promise<void> {
    const transactions = db.getTransactions();
    const csvContent = objectsToCSV(transactions as unknown as Record<string, unknown>[]);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const today = new Date().toISOString().split('T')[0];
    downloadFile(blob, `glassfolio-transactions-${today}.csv`);
}

/**
 * Trigger transactions only JSON download
 */
export async function exportTransactionsJSON(): Promise<void> {
    const transactions = db.getTransactions();
    const jsonContent = JSON.stringify({ transactions }, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const today = new Date().toISOString().split('T')[0];
    downloadFile(blob, `glassfolio-transactions-${today}.json`);
}

/**
 * Trigger full backup JSON download
 */
export async function exportBackupJSON(): Promise<void> {
    const payload = generateBackupData();
    const jsonString = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const today = new Date().toISOString().split('T')[0];
    downloadFile(blob, `glassfolio-backup-${today}.json`);
}

/**
 * Trigger RGPD ZIP download (ZIP containing backup.json and individual CSV files)
 */
export async function exportRGPDZip(): Promise<void> {
    const payload = generateBackupData();
    const today = new Date().toISOString().split('T')[0];
    const zipFiles: Record<string, string> = {};

    // Add main JSON file
    zipFiles[`glassfolio-backup-${today}.json`] = JSON.stringify(payload, null, 2);

    // Add CSV files per entity
    if (payload.data) {
        Object.entries(payload.data).forEach(([entityName, entityData]) => {
            if (Array.isArray(entityData) && entityData.length > 0) {
                const csvContent = objectsToCSV(entityData as Record<string, unknown>[]);
                zipFiles[`csv_exports/${entityName}.csv`] = csvContent;
            }
        });
    }

    const zipBlob = createSimpleZip(zipFiles);
    downloadFile(zipBlob, `glassfolio-data-export-${today}.zip`);
}
