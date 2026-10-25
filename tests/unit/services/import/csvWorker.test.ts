/**
 * Tests — CSV worker parity (E28 — TGLA-102)
 * The worker and the main-thread path must return identical results.
 */

import { describe, it, expect, vi } from 'vitest';
import { readAndParseCsvFile, LARGE_CSV_BYTES } from '../../../../src/services/import/csvWorkerClient';
import type { CsvParseWorkerResponse } from '../../../../src/services/import/csvWorkerClient';

const CSV = 'Export\nDate;Libellé;Montant\n15/01/2024;"Achat ""ETF""";1 234,56\n16/01/2024;Vente;-99,90';

describe('csvParse.worker', () => {
  it('produces the same result as the main-thread path', async () => {
    const posted: CsvParseWorkerResponse[] = [];
    const postSpy = vi.spyOn(self, 'postMessage').mockImplementation((message: unknown) => {
      posted.push(message as CsvParseWorkerResponse);
    });
    await import('../../../../src/workers/csvParse.worker');

    const buffer = new TextEncoder().encode(CSV).buffer as ArrayBuffer;
    self.onmessage?.(new MessageEvent('message', { data: { buffer } }));
    postSpy.mockRestore();

    const mainThread = await readAndParseCsvFile(new File([CSV], 'a.csv'));
    expect(posted).toHaveLength(1);
    const response = posted[0];
    expect(response.ok).toBe(true);
    if (response.ok === true) {
      expect(response.parsed).toEqual(mainThread.parsed);
      expect(response.text).toBe(mainThread.text);
    }
    expect(mainThread.offThread).toBe(false);
  });

  it('falls back to the main thread for large files when Worker is unavailable', async () => {
    const big = 'Date,Amount\n' + '2024-01-01,10\n'.repeat(Math.ceil(LARGE_CSV_BYTES / 14));
    const result = await readAndParseCsvFile(new File([big], 'big.csv'));
    expect(result.offThread).toBe(false);
    expect(result.parsed.rows.length).toBeGreaterThan(70000);
  });
});
