/**
 * CSV core (pure, dependency-free)
 *
 * Decoding, delimiter / header detection and RFC 4180 tokenizing. Kept free of
 * validation schemas so the parsing Web Worker stays small.
 */

import type { ParsedCSV, CsvEncoding } from './types';

const CANDIDATE_DELIMITERS = [',', ';', '\t', '|'] as const;
const DELIMITER_SAMPLE_LINES = 30;
const HEADER_SEARCH_RECORDS = 20;

function stripBom(text: string): string {
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Count delimiter occurrences outside of double-quoted sections.
 */
function countOutsideQuotes(line: string, delimiter: string): number {
    let count = 0;
    let inQuote = false;
    for (const char of line) {
        if (char === '"') inQuote = !inQuote;
        else if (char === delimiter && !inQuote) count++;
    }
    return count;
}

/**
 * Detect the delimiter by looking for the candidate that splits the most lines
 * into the same number of columns. Consistency across lines beats raw counts,
 * so decimal commas inside a ';' file or a title line above the header do not
 * mislead the detection.
 */
export function detectDelimiter(text: string): string {
    const lines = stripBom(text).split(/\r\n|\n|\r/).filter(l => l.trim() !== '').slice(0, DELIMITER_SAMPLE_LINES);
    let best = ',';
    let bestScore = 0;

    for (const delimiter of CANDIDATE_DELIMITERS) {
        const frequency = new Map<number, number>();
        for (const line of lines) {
            const count = countOutsideQuotes(line, delimiter);
            if (count > 0) frequency.set(count, (frequency.get(count) || 0) + 1);
        }
        for (const [columns, lineCount] of frequency) {
            const score = lineCount * 1000 + columns;
            if (score > bestScore) {
                bestScore = score;
                best = delimiter;
            }
        }
    }

    return best;
}

/**
 * RFC 4180 tokenizer: quoted fields, escaped quotes (""), delimiters and line
 * breaks inside quotes, CRLF / LF / CR line endings. Fully empty records
 * (blank lines, Excel ";;;;" padding) are dropped.
 */
function tokenize(text: string, delimiter: string): string[][] {
    const records: string[][] = [];
    let record: string[] = [];
    let field = '';
    let inQuotes = false;

    const pushField = () => {
        record.push(field.trim());
        field = '';
    };
    const pushRecord = () => {
        pushField();
        if (record.some(cell => cell !== '')) records.push(record);
        record = [];
    };

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (inQuotes) {
            if (char === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += char;
            }
            continue;
        }

        if (char === '"' && field.trim() === '') {
            field = '';
            inQuotes = true;
        } else if (char === delimiter) {
            pushField();
        } else if (char === '\r' || char === '\n') {
            if (char === '\r' && text[i + 1] === '\n') i++;
            pushRecord();
        } else {
            field += char;
        }
    }

    if (field !== '' || record.length > 0) pushRecord();
    return records;
}

/**
 * Locate the header row: the first record that has the most common column
 * count. Skips preamble lines such as "Export du 15/01/2024" or account titles.
 */
function findHeaderIndex(records: string[][]): number {
    const sample = records.slice(0, HEADER_SEARCH_RECORDS);
    const frequency = new Map<number, number>();
    sample.forEach(r => frequency.set(r.length, (frequency.get(r.length) || 0) + 1));

    let modalColumns = 0;
    let modalCount = 0;
    for (const [columns, count] of frequency) {
        if (count > modalCount || (count === modalCount && columns > modalColumns)) {
            modalColumns = columns;
            modalCount = count;
        }
    }

    if (modalColumns <= 1) return 0;
    const index = sample.findIndex(r => r.length >= modalColumns);
    return index >= 0 ? index : 0;
}

/**
 * Parse CSV text into structured data with auto-delimiter and header detection
 */
export function parseCSVText(text: string, forcedDelimiter?: string): ParsedCSV {
    const clean = stripBom(text || '');
    if (clean.trim() === '') return { headers: [], rows: [], delimiter: forcedDelimiter || ',' };

    const delimiter = forcedDelimiter || detectDelimiter(clean);
    const records = tokenize(clean, delimiter);
    if (records.length === 0) return { headers: [], rows: [], delimiter };

    const headerRowIndex = findHeaderIndex(records);
    const headers = records[headerRowIndex];
    const rows = records.slice(headerRowIndex + 1);

    return { headers, rows, delimiter, headerRowIndex };
}

/**
 * Decode raw file bytes, recognising UTF-8 (with or without BOM), UTF-16 (BOM)
 * and falling back to Windows-1252 — the default of Excel and French bank exports.
 */
export function decodeCsvBuffer(buffer: ArrayBuffer): { text: string; encoding: CsvEncoding } {
    const bytes = new Uint8Array(buffer);

    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
        return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le' };
    }
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
        return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be' };
    }

    try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        return { text: stripBom(text), encoding: 'utf-8' };
    } catch {
        return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252' };
    }
}

/**
 * Read a user-provided CSV file with encoding detection.
 */
export async function readCsvFile(file: Blob): Promise<{ text: string; encoding: CsvEncoding }> {
    if (typeof file.arrayBuffer === 'function') {
        return decodeCsvBuffer(await file.arrayBuffer());
    }
    return { text: stripBom(await file.text()), encoding: 'utf-8' };
}
