/**
 * Off-main-thread CSV reading (E28 — TGLA-102)
 *
 * Files above LARGE_CSV_BYTES are decoded and parsed in a Web Worker so the
 * wizard stays responsive; smaller files (and environments without Worker,
 * such as tests) use the same functions synchronously. Both paths return the
 * exact same result.
 */

import { decodeCsvBuffer, parseCSVText } from './csvCore';
import type { CsvEncoding, ParsedCSV } from './types';

/** ~10k broker rows */
export const LARGE_CSV_BYTES = 1024 * 1024;

export interface CsvParseWorkerRequest {
    buffer: ArrayBuffer;
    delimiter?: string;
}

export type CsvParseWorkerResponse =
    | { ok: true; text: string; encoding: CsvEncoding; parsed: ParsedCSV }
    | { ok: false; error: string };

export interface ReadAndParseResult {
    text: string;
    encoding: CsvEncoding;
    parsed: ParsedCSV;
    /** True when the work ran in a Web Worker */
    offThread: boolean;
}

function parseOnMainThread(buffer: ArrayBuffer, delimiter?: string): ReadAndParseResult {
    const { text, encoding } = decodeCsvBuffer(buffer);
    return { text, encoding, parsed: parseCSVText(text, delimiter), offThread: false };
}

function parseInWorker(buffer: ArrayBuffer, delimiter?: string): Promise<ReadAndParseResult> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('../../workers/csvParse.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (event: MessageEvent<CsvParseWorkerResponse>) => {
            worker.terminate();
            const data = event.data;
            if (data.ok === true) resolve({ text: data.text, encoding: data.encoding, parsed: data.parsed, offThread: true });
            else reject(new Error((data as { error: string }).error));
        };
        worker.onerror = event => {
            worker.terminate();
            reject(new Error(event.message || 'CSV worker failed'));
        };
        const request: CsvParseWorkerRequest = { buffer, delimiter };
        worker.postMessage(request, [buffer]);
    });
}

/**
 * Read a CSV file with encoding detection and parse it, off the UI thread when large.
 */
export async function readAndParseCsvFile(file: Blob, delimiter?: string): Promise<ReadAndParseResult> {
    const buffer = typeof file.arrayBuffer === 'function'
        ? await file.arrayBuffer()
        : new TextEncoder().encode(await file.text()).buffer as ArrayBuffer;

    if (buffer.byteLength >= LARGE_CSV_BYTES && typeof Worker !== 'undefined') {
        try {
            return await parseInWorker(buffer.slice(0), delimiter);
        } catch {
            // Worker unavailable (CSP, old browser): fall back to the main thread
        }
    }
    return parseOnMainThread(buffer, delimiter);
}
