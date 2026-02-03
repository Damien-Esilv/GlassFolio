/**
 * Import Types
 * 
 * Shared types for the import system.
 */

import { TransactionType, ImportBatchStatus, ImportMode } from '../../types';

// ============================================================================
// ASSET IDENTIFICATION
// ============================================================================

/**
 * Flexible asset identification - supports both Symbol and ISIN
 * ETFs/Funds may only have ISIN, Stocks/Crypto usually have Symbol
 */
export interface AssetIdentifier {
    symbol?: string;       // AAPL, BTC (optional for ETFs)
    isin?: string;         // FR0010296061 (required for ETFs)
    name?: string;         // Display name
}

/**
 * Get the primary key for an asset
 * Priority: ISIN > Symbol
 */
export function getAssetKey(asset: AssetIdentifier): string {
    return asset.isin || asset.symbol || 'UNKNOWN';
}

/**
 * Check if two assets match by ISIN or Symbol
 */
export function assetsMatch(a: AssetIdentifier, b: AssetIdentifier): boolean {
    if (a.isin && b.isin) return a.isin === b.isin;
    if (a.symbol && b.symbol) return a.symbol.toUpperCase() === b.symbol.toUpperCase();
    return false;
}

// ============================================================================
// FIELD MAPPINGS
// ============================================================================

/**
 * Field mapping for History mode
 */
export interface HistoryFieldMappings {
    // Required
    transactionDate: string | number;
    amountPrimary: string | number;

    // Asset identification (at least one)
    assetSymbol?: string | number;
    assetIsin?: string | number;

    // Type handling
    type?: string | number;
    rawType?: string | number;

    // Description
    label?: string | number;
    rawLabel?: string | number;

    // Trade fields
    priceUnit?: string | number;
    quantity?: string | number;

    // Fees & taxes
    feeAmount?: string | number;
    feeAsset?: string | number;
    taxAmount?: string | number;

    // Bank-specific
    valueDate?: string | number;
    balanceAfter?: string | number;
    externalId?: string | number;
}

/**
 * Field mapping for Snapshot mode
 */
export interface SnapshotFieldMappings {
    // Asset identification (at least one required)
    assetSymbol?: string | number;
    assetIsin?: string | number;
    assetName?: string | number;

    // Position data (required)
    quantity: string | number;
    avgPrice: string | number;

    // Optional
    purchaseDate?: string | number;
}

// ============================================================================
// PARSED DATA
// ============================================================================

/**
 * Parsed CSV structure
 */
export interface ParsedCSV {
    headers: string[];
    rows: string[][];
    delimiter: string;
}

/**
 * Validation error for a field
 */
export interface FieldError {
    field: string;
    message: string;
    severity: 'error' | 'warning';
}

// ============================================================================
// HISTORY MODE TYPES
// ============================================================================

/**
 * Staged transaction for History mode
 */
export interface StagedTransaction {
    id: string;
    rowIndex: number;
    originalRow: Record<string, string>;
    originalRowArray: string[];
    parsed: {
        transactionDate?: string;
        valueDate?: string;
        type?: TransactionType;
        rawType?: string;
        label?: string;
        rawLabel?: string;
        amountPrimary?: string;
        assetSymbol?: string;
        assetIsin?: string;
        priceUnit?: string;
        quantity?: string;
        feeAmount?: string;
        feeAsset?: string;
        taxAmount?: string;
        balanceAfter?: string;
        externalId?: string;
        metadata?: Record<string, unknown>;
    };
    status: 'valid' | 'error' | 'duplicate' | 'warning';
    errors: FieldError[];
    resolution: 'pending' | 'import' | 'skip';
}

/**
 * Result of parsing a History file
 */
export interface HistoryParseResult {
    candidates: StagedTransaction[];
    stats: {
        total: number;
        valid: number;
        errors: number;
        duplicates: number;
        warnings: number;
    };
    headers: string[];
    detectedPreset?: string;
    detectedDelimiter: string;
}

// ============================================================================
// SNAPSHOT MODE TYPES
// ============================================================================

/**
 * Parsed snapshot position from CSV
 */
export interface SnapshotPosition {
    // Asset identification (at least one required)
    assetSymbol?: string;
    assetIsin?: string;
    assetName?: string;

    // Position data
    quantity: string;
    avgPrice: string;
    purchaseDate?: string;

    // For display
    displayName: string;
    assetKey: string;
}

/**
 * Existing position from database
 */
export interface ExistingPosition {
    assetSymbol?: string;
    assetIsin?: string;
    assetName?: string;
    quantity: string;
    avgPrice: string;
    totalCost: string;
    assetKey: string;
}

/**
 * Reconciliation diff between old and new position
 */
export interface ReconciliationDiff {
    assetKey: string;
    displayName: string;
    assetSymbol?: string;
    assetIsin?: string;

    // Old position (null if new asset)
    oldQty: string;
    oldAvgPrice: string;
    oldTotalCost: string;

    // New position
    newQty: string;
    newAvgPrice: string;
    newTotalCost: string;

    // Delta
    deltaQty: string;
    deltaTotalCost: string;

    // Synthetic transaction
    syntheticType: 'BUY' | 'SELL' | 'NONE';
    syntheticQty: string;
    syntheticPrice: string;

    // Validation
    requiresUserInput: boolean;
    isValid: boolean;
    validationMessage?: string;

    // User input for SELL price
    userProvidedSellPrice?: string;
}

/**
 * Staged snapshot position
 */
export interface StagedSnapshotPosition {
    id: string;
    rowIndex: number;
    originalRow: Record<string, string>;
    position: SnapshotPosition;
    status: 'valid' | 'error' | 'warning';
    errors: FieldError[];
}

/**
 * Snapshot import configuration
 */
export interface SnapshotImportConfig {
    accountId: string;
    generateSyntheticTransactions: boolean;
    defaultDate: string;
    mappings: SnapshotFieldMappings;
}

/**
 * Result of parsing a Snapshot file
 */
export interface SnapshotParseResult {
    positions: StagedSnapshotPosition[];
    stats: {
        total: number;
        valid: number;
        errors: number;
    };
    headers: string[];
    detectedDelimiter: string;
}

/**
 * Result of reconciliation calculation
 */
export interface ReconciliationResult {
    diffs: ReconciliationDiff[];
    stats: {
        newAssets: number;
        increasePositions: number;
        decreasePositions: number;
        unchangedPositions: number;
        requiresInput: number;
        hasErrors: number;
    };
}
