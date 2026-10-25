/**
 * CSV parsing worker (E28 — TGLA-102)
 *
 * Decodes and tokenizes large CSV files off the UI thread. Pure module:
 * no storage access, no DOM — it only runs the pure csvCore functions.
 */

import { decodeCsvBuffer, parseCSVText } from '../services/import/csvCore';
import type { CsvParseWorkerRequest, CsvParseWorkerResponse } from '../services/import/csvWorkerClient';

self.onmessage = (event: MessageEvent<CsvParseWorkerRequest>) => {
    try {
        const { text, encoding } = decodeCsvBuffer(event.data.buffer);
        const parsed = parseCSVText(text, event.data.delimiter);
        const response: CsvParseWorkerResponse = { ok: true, text, encoding, parsed };
        self.postMessage(response);
    } catch (error) {
        const response: CsvParseWorkerResponse = { ok: false, error: error instanceof Error ? error.message : 'CSV parse failed' };
        self.postMessage(response);
    }
};
