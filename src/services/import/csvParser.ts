/**
 * CSV Parser
 * 
 * Utilities for parsing CSV files with auto-delimiter detection.
 */

import { ParsedCSV } from './types';

/**
 * Parse CSV text into structured data with auto-delimiter detection
 */
export function parseCSVText(text: string, forcedDelimiter?: string): ParsedCSV {
    const lines = text.split(/\r\n|\n/).filter(line => line.trim() !== '');
    if (lines.length < 1) return { headers: [], rows: [], delimiter: ',' };

    const firstLine = lines[0];

    // Detect delimiter if not forced
    let delimiter = forcedDelimiter || ',';
    if (!forcedDelimiter) {
        const delimiters = [',', ';', '\t', '|'];
        let maxCount = 0;
        delimiters.forEach(d => {
            const count = firstLine.split(d).length - 1;
            if (count > maxCount) {
                maxCount = count;
                delimiter = d;
            }
        });
    }

    // Split line respecting quotes
    const splitLine = (line: string): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuote = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuote = !inQuote;
            } else if (char === delimiter && !inQuote) {
                result.push(current.trim().replace(/^"|"$/g, ''));
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim().replace(/^"|"$/g, ''));
        return result;
    };

    const headers = splitLine(lines[0]);
    const rows = lines.slice(1).map(splitLine);

    return { headers, rows, delimiter };
}

/**
 * Parse date string with format detection
 */
export function parseDate(dateStr: string, formatHint?: string): string | null {
    if (!dateStr || dateStr.trim() === '') return null;

    const cleaned = dateStr.trim();

    // Try ISO format first
    if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) {
        const date = new Date(cleaned);
        if (!isNaN(date.getTime())) {
            return date.toISOString();
        }
    }

    // Try DD/MM/YYYY format (European)
    const euroMatch = cleaned.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(.*)$/);
    if (euroMatch) {
        const [, day, month, year, rest] = euroMatch;
        let time = '00:00:00';
        const timeMatch = rest.match(/(\d{2}):(\d{2})(?::(\d{2}))?/);
        if (timeMatch) {
            time = `${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3] || '00'}`;
        }
        const date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${time}Z`);
        if (!isNaN(date.getTime())) {
            return date.toISOString();
        }
    }

    // Try MM/DD/YYYY format (US)
    const usMatch = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(.*)$/);
    if (usMatch && formatHint === 'MM/DD/YYYY') {
        const [, month, day, year, rest] = usMatch;
        let time = '00:00:00';
        const timeMatch = rest.match(/(\d{2}):(\d{2})(?::(\d{2}))?/);
        if (timeMatch) {
            time = `${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3] || '00'}`;
        }
        const date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${time}Z`);
        if (!isNaN(date.getTime())) {
            return date.toISOString();
        }
    }

    // Fallback: try native Date parsing
    const fallback = new Date(cleaned);
    if (!isNaN(fallback.getTime())) {
        return fallback.toISOString();
    }

    return null;
}

/**
 * Parse decimal string, handling various formats
 */
export function parseDecimal(value: string | undefined): string | null {
    if (!value || value.trim() === '') return null;

    let cleaned = value.trim();

    // Handle European format (1.234,56 -> 1234.56)
    if (/^\-?\d{1,3}(\.\d{3})*,\d+$/.test(cleaned)) {
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    }
    // Handle simple comma decimal (1234,56 -> 1234.56)
    else if (/^\-?\d+,\d+$/.test(cleaned)) {
        cleaned = cleaned.replace(',', '.');
    }
    // Remove thousand separators for US format
    else if (/^\-?\d{1,3}(,\d{3})*(\.\d+)?$/.test(cleaned)) {
        cleaned = cleaned.replace(/,/g, '');
    }

    // Remove currency symbols and whitespace
    cleaned = cleaned.replace(/[€$£¥\s]/g, '');

    const num = parseFloat(cleaned);
    if (isNaN(num)) return null;

    return num.toString();
}

/**
 * Get value from row by header name or index
 */
export function getValue(
    row: string[],
    headers: string[],
    mapping: string | number | undefined
): string | undefined {
    if (mapping === undefined) return undefined;
    if (typeof mapping === 'number') return row[mapping];
    const idx = headers.indexOf(mapping);
    return idx >= 0 ? row[idx] : undefined;
}

/**
 * Convert row array to object with headers as keys
 */
export function rowToObject(row: string[], headers: string[]): Record<string, string> {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = row[i] || ''; });
    return obj;
}
