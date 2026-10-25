/**
 * Import Types
 * 
 * Shared types for the import system.
 * Re-exports from importManager and snapshotService for compatibility.
 */

// Re-export types from importManager
export type {
    FieldMappings,
    ImportConfig,
    StagedTransaction,
    ParseResult
} from './importManager';

// Re-export types from snapshotService
export type {
    SnapshotFieldMappings,
    SnapshotPosition,
    ExistingPosition,
    ReconciliationDiff,
    StagedSnapshotPosition,
    SnapshotParseResult,
    ReconciliationResult
} from './snapshotService';

// Re-export validation types
export type {
    RowData,
    RowValidationResult
} from '../core/validationService';

// Legacy type aliases for backward compatibility
export type { FieldMappings as HistoryFieldMappings } from './importManager';

// Asset identifier helper
export interface AssetIdentifier {
    symbol?: string;
    isin?: string;
    name?: string;
}

// CSV parsing result
export interface ParsedCSV {
    headers: string[];
    rows: string[][];
    delimiter: string;
    /** Number of preamble lines (titles, export notes) skipped before the header row */
    headerRowIndex?: number;
}

/** Text encodings the CSV decoder can recognise */
export type CsvEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252';

/**
 * Helper to create a unique asset key
 */
export function getAssetKey(identifier: AssetIdentifier): string {
    return identifier.isin || identifier.symbol || identifier.name || 'UNKNOWN';
}

/**
 * Helper to check if two assets match
 */
export function assetsMatch(a: AssetIdentifier, b: AssetIdentifier): boolean {
    if (a.isin && b.isin) return a.isin === b.isin;
    if (a.symbol && b.symbol) return a.symbol.toUpperCase() === b.symbol.toUpperCase();
    if (a.name && b.name) return a.name.toLowerCase() === b.name.toLowerCase();
    return false;
}

// Legacy FieldError type for compatibility
export interface FieldError {
    field: string;
    message: string;
    severity: 'error' | 'warning';
    code?: string;
    /** Interpolation values for the i18n message `common:errors.importValidation.<code>` */
    params?: Record<string, string>;
}
