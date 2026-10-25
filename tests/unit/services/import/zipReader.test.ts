import { describe, it, expect } from 'vitest';
import { createSimpleZip } from '../../../../src/services/exportService';
import { crc32, findBackupEntry, readZipTextEntries, ZipError } from '../../../../src/services/import/zipReader';

const toBuffer = (blob: Blob): Promise<ArrayBuffer> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });

describe('zipReader', () => {
  it('computes the standard CRC32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('reads back what createSimpleZip wrote, accents and sub-folders included', async () => {
    const zip = createSimpleZip({
      'manifest.json': '{"ok":true}',
      'data/csv/transactions.csv': 'id,libellé\nt1,Dépôt €',
      'data/glassfolio-backup-2026-10-25.json': '{"data":{}}',
    });
    const entries = await readZipTextEntries(await toBuffer(zip));

    expect(Object.keys(entries).sort()).toEqual([
      'data/csv/transactions.csv', 'data/glassfolio-backup-2026-10-25.json', 'manifest.json',
    ]);
    expect(entries['data/csv/transactions.csv']).toBe('id,libellé\nt1,Dépôt €');
    expect(findBackupEntry(entries)).toBe('data/glassfolio-backup-2026-10-25.json');
  });

  it('refuses an entry whose content no longer matches its CRC', async () => {
    const buffer = await toBuffer(createSimpleZip({ 'a.txt': 'hello world' }));
    const bytes = new Uint8Array(buffer);
    const at = bytes.indexOf('h'.charCodeAt(0), 30); // first content byte after the local header
    bytes[at] = 'j'.charCodeAt(0);

    await expect(readZipTextEntries(buffer)).rejects.toMatchObject({ code: 'crc_mismatch' });
  });

  it('rejects data that is not a ZIP archive', async () => {
    const garbage = new TextEncoder().encode('this is not a zip file at all, just text').buffer;
    await expect(readZipTextEntries(garbage)).rejects.toBeInstanceOf(ZipError);
    await expect(readZipTextEntries(garbage)).rejects.toMatchObject({ code: 'invalid_zip' });
  });

  it('finds no backup entry in an archive that holds none', () => {
    expect(findBackupEntry({ 'manifest.json': '{}' })).toBeUndefined();
  });
});
