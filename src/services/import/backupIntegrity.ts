/**
 * Backup integrity (E28 / E15): a SHA-256 checksum over the `data` section of a backup file.
 *
 * The checksum is computed from `JSON.stringify(data)`, which is stable across a parse / stringify
 * round trip, so reformatting the file (indentation) never invalidates it.
 */

export type ChecksumStatus = 'verified' | 'missing' | 'mismatch';

const toHex = (buffer: ArrayBuffer): string =>
    Array.from(new Uint8Array(buffer)).map(byte => byte.toString(16).padStart(2, '0')).join('');

export async function computeBackupChecksum(data: unknown): Promise<string> {
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    return toHex(await crypto.subtle.digest('SHA-256', bytes));
}

/** Compares the checksum stored in a backup with the one recomputed from its data. */
export async function verifyBackupChecksum(json: { data?: unknown; checksum?: unknown }): Promise<ChecksumStatus> {
    if (typeof json.checksum !== 'string' || json.checksum === '') return 'missing';
    return (await computeBackupChecksum(json.data)) === json.checksum ? 'verified' : 'mismatch';
}
