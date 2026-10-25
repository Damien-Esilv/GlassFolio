/**
 * Minimal ZIP reader (E28 / E15) for GlassFolio's own GDPR archive.
 *
 * Reads the central directory, supports "stored" entries (what `createSimpleZip` writes) and
 * "deflate" entries (archives re-zipped by an operating system), and checks every CRC32.
 */

export type ZipErrorCode = 'invalid_zip' | 'unsupported_compression' | 'crc_mismatch';

export class ZipError extends Error {
    constructor(public readonly code: ZipErrorCode) {
        super(`ZIP error: ${code}`);
        this.name = 'ZipError';
    }
}

export const crc32 = (buf: Uint8Array): number => {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
        crc ^= buf[i];
        for (let j = 0; j < 8; j++) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
        }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
};

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
    if (typeof DecompressionStream === 'undefined') throw new ZipError('unsupported_compression');
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Returns the text content of every file entry of the archive, keyed by path. */
export async function readZipTextEntries(buffer: ArrayBuffer): Promise<Record<string, string>> {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    const decoder = new TextDecoder();

    // End of central directory record: 22 bytes, searched from the end (an optional comment may follow).
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
        if (view.getUint32(i, true) === 0x06054b50) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0) throw new ZipError('invalid_zip');

    const entryCount = view.getUint16(eocd + 10, true);
    let cursor = view.getUint32(eocd + 16, true);
    const entries: Record<string, string> = {};

    for (let n = 0; n < entryCount; n++) {
        if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) throw new ZipError('invalid_zip');
        const method = view.getUint16(cursor + 10, true);
        const crc = view.getUint32(cursor + 16, true);
        const compressedSize = view.getUint32(cursor + 20, true);
        const nameLength = view.getUint16(cursor + 28, true);
        const extraLength = view.getUint16(cursor + 30, true);
        const commentLength = view.getUint16(cursor + 32, true);
        const localOffset = view.getUint32(cursor + 42, true);
        const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
        cursor += 46 + nameLength + extraLength + commentLength;

        if (name.endsWith('/')) continue; // directory entry
        if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== 0x04034b50) throw new ZipError('invalid_zip');
        const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
        if (dataStart + compressedSize > bytes.length) throw new ZipError('invalid_zip');
        const raw = bytes.subarray(dataStart, dataStart + compressedSize);

        let content: Uint8Array;
        if (method === 0) content = raw;
        else if (method === 8) content = await inflateRaw(raw);
        else throw new ZipError('unsupported_compression');

        if (crc32(content) !== crc) throw new ZipError('crc_mismatch');
        entries[name] = decoder.decode(content);
    }
    return entries;
}

/** Path of the JSON backup inside a GlassFolio GDPR archive, if present. */
export function findBackupEntry(entries: Record<string, string>): string | undefined {
    return Object.keys(entries).find(name => /(^|\/)glassfolio-backup-[^/]*\.json$/.test(name));
}
