/**
 * CSV Parser
 * 
 * Utilities for parsing CSV files with auto-delimiter detection.
 */

import { validateCSVRow } from '../../types/schemas';

// Single source of truth for value parsing lives in typeNormalizer
export { parseDate, parseDecimal, detectDateFormat } from './typeNormalizer';

export { detectDelimiter, parseCSVText, decodeCsvBuffer, readCsvFile } from './csvCore';

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

/**
 * Validates and sanitizes a raw CSV row object against CSVRowSchema.
 * Guarantees zero NaN / null corruption in staged metadata.
 */
export function sanitizeCSVRow(rowObj: Record<string, unknown>): { isValid: boolean; sanitized: Record<string, string>; errors?: string[] } {
    return validateCSVRow(rowObj);
}

/**
 * Validates whether CSV headers are non-empty and well-formed
 */
export function validateCSVHeaders(headers: string[]): { isValid: boolean; errors?: string[] } {
    if (!headers || !Array.isArray(headers) || headers.length === 0) {
        return { isValid: false, errors: ['CSV file contains no headers'] };
    }
    const cleanHeaders = headers.map(h => h.trim()).filter(Boolean);
    if (cleanHeaders.length === 0) {
        return { isValid: false, errors: ['All CSV headers are empty'] };
    }
    return { isValid: true };
}

