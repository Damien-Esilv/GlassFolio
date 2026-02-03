/**
 * Snapshot Service
 * 
 * Handles Snapshot mode imports with reconciliation logic and
 * optional synthetic transaction generation.
 */

import { UnifiedTransaction } from '../../types';
import { db, delay } from '../db';
import { parseCSVText, parseDate, parseDecimal, getValue, rowToObject } from './csvParser';
import {
    SnapshotFieldMappings,
    SnapshotPosition,
    StagedSnapshotPosition,
    SnapshotParseResult,
    SnapshotImportConfig,
    ExistingPosition,
    ReconciliationDiff,
    ReconciliationResult,
    FieldError,
    getAssetKey,
    assetsMatch
} from './types';

// ============================================================================
// SNAPSHOT MAPPING FIELDS
// ============================================================================

export const SNAPSHOT_MAPPABLE_FIELDS = [
    { key: 'assetSymbol', label: 'Asset Symbol', required: false, hint: 'AAPL, BTC (optional for ETFs)' },
    { key: 'assetIsin', label: 'ISIN', required: false, hint: 'For ETFs/Funds' },
    { key: 'assetName', label: 'Asset Name', required: false, hint: 'Display name' },
    { key: 'quantity', label: 'Quantity', required: true, hint: 'Number of shares/units' },
    { key: 'avgPrice', label: 'Average Price', required: true, hint: 'Cost basis per unit' },
    { key: 'purchaseDate', label: 'Purchase Date', required: false, hint: 'Defaults to import date' },
] as const;

// ============================================================================
// PARSING
// ============================================================================

/**
 * Parse a Snapshot CSV file
 */
export async function parseSnapshotFile(
    csvText: string,
    mappings: SnapshotFieldMappings
): Promise<SnapshotParseResult> {
    await delay(200);

    const { headers, rows, delimiter } = parseCSVText(csvText);

    const positions: StagedSnapshotPosition[] = rows.map((row, rowIndex) => {
        const originalRow = rowToObject(row, headers);
        const errors: FieldError[] = [];

        // Extract values
        const rawSymbol = getValue(row, headers, mappings.assetSymbol);
        const rawIsin = getValue(row, headers, mappings.assetIsin);
        const rawName = getValue(row, headers, mappings.assetName);
        const rawQty = getValue(row, headers, mappings.quantity);
        const rawPrice = getValue(row, headers, mappings.avgPrice);
        const rawDate = getValue(row, headers, mappings.purchaseDate);

        // Validate asset identification
        const assetSymbol = rawSymbol?.toUpperCase().trim() || undefined;
        const assetIsin = rawIsin?.trim() || undefined;
        const assetName = rawName?.trim() || undefined;

        if (!assetSymbol && !assetIsin) {
            errors.push({
                field: 'assetSymbol',
                message: 'At least Symbol or ISIN is required',
                severity: 'error'
            });
        }

        // Parse quantity
        const quantity = parseDecimal(rawQty);
        if (!quantity) {
            errors.push({
                field: 'quantity',
                message: 'Quantity is required',
                severity: 'error'
            });
        }

        // Parse average price
        const avgPrice = parseDecimal(rawPrice);
        if (!avgPrice) {
            errors.push({
                field: 'avgPrice',
                message: 'Average price is required',
                severity: 'error'
            });
        }

        // Parse optional date
        const purchaseDate = rawDate ? parseDate(rawDate) || undefined : undefined;

        // Build display name
        const displayName = assetName || assetSymbol || assetIsin || 'Unknown';
        const assetKey = assetIsin || assetSymbol || 'UNKNOWN';

        const position: SnapshotPosition = {
            assetSymbol,
            assetIsin,
            assetName,
            quantity: quantity || '0',
            avgPrice: avgPrice || '0',
            purchaseDate,
            displayName,
            assetKey
        };

        const hasErrors = errors.some(e => e.severity === 'error');

        return {
            id: `snap-${rowIndex}`,
            rowIndex,
            originalRow,
            position,
            status: hasErrors ? 'error' : 'valid',
            errors
        };
    });

    return {
        positions,
        stats: {
            total: positions.length,
            valid: positions.filter(p => p.status === 'valid').length,
            errors: positions.filter(p => p.status === 'error').length
        },
        headers,
        detectedDelimiter: delimiter
    };
}

// ============================================================================
// EXISTING POSITIONS
// ============================================================================

/**
 * Get existing positions from UnifiedTransactions
 * Groups by assetKey (ISIN or Symbol)
 */
export async function getExistingPositions(accountId: string): Promise<ExistingPosition[]> {
    await delay(100);

    const transactions = db.getUnifiedTransactions();

    // Group transactions by asset key
    const positionMap = new Map<string, {
        assetSymbol?: string;
        assetIsin?: string;
        assetName?: string;
        totalQty: number;
        totalCost: number;
    }>();

    for (const tx of transactions) {
        // Filter by account ID first
        if (tx.accountId !== accountId) continue;

        // Skip non-buy/sell transactions for position calculation
        if (!['BUY', 'SELL'].includes(tx.type)) continue;

        const key = tx.assetIsin || tx.assetSymbol;
        if (!key) continue;

        const existing = positionMap.get(key) || {
            assetSymbol: tx.assetSymbol,
            assetIsin: tx.assetIsin,
            assetName: undefined,
            totalQty: 0,
            totalCost: 0
        };

        const qty = parseFloat(tx.quantity || tx.amountPrimary || '0');
        const price = parseFloat(tx.priceUnit || '0');
        const amount = parseFloat(tx.amountPrimary || '0');

        if (tx.type === 'BUY') {
            existing.totalQty += qty;
            existing.totalCost += Math.abs(amount);
        } else if (tx.type === 'SELL') {
            existing.totalQty -= Math.abs(qty);
            // Selling doesn't reduce cost basis in simple tracking
        }

        positionMap.set(key, existing);
    }

    // Convert to array
    const positions: ExistingPosition[] = [];
    for (const [key, pos] of positionMap) {
        if (pos.totalQty <= 0) continue; // Skip zero/negative positions

        const avgPrice = pos.totalQty > 0 ? pos.totalCost / pos.totalQty : 0;

        positions.push({
            assetSymbol: pos.assetSymbol,
            assetIsin: pos.assetIsin,
            assetName: pos.assetName,
            quantity: pos.totalQty.toString(),
            avgPrice: avgPrice.toString(),
            totalCost: pos.totalCost.toString(),
            assetKey: key
        });
    }

    return positions;
}

// ============================================================================
// RECONCILIATION
// ============================================================================

/**
 * Calculate reconciliation between new snapshot and existing positions
 * Generates synthetic transaction recommendations
 */
export async function calculateReconciliation(
    newPositions: SnapshotPosition[],
    existingPositions: ExistingPosition[]
): Promise<ReconciliationResult> {
    await delay(100);

    const diffs: ReconciliationDiff[] = [];
    const processedExistingKeys = new Set<string>();

    // Process each new position
    for (const newPos of newPositions) {
        // Find matching existing position
        const existing = existingPositions.find(ex =>
            (ex.assetIsin && newPos.assetIsin && ex.assetIsin === newPos.assetIsin) ||
            (ex.assetSymbol && newPos.assetSymbol && ex.assetSymbol.toUpperCase() === newPos.assetSymbol.toUpperCase())
        );

        if (existing) {
            processedExistingKeys.add(existing.assetKey);
        }

        // Calculate values
        const oldQty = existing ? parseFloat(existing.quantity) : 0;
        const oldAvgPrice = existing ? parseFloat(existing.avgPrice) : 0;
        const oldTotalCost = oldQty * oldAvgPrice;

        const newQty = parseFloat(newPos.quantity);
        const newAvgPrice = parseFloat(newPos.avgPrice);
        const newTotalCost = newQty * newAvgPrice;

        const deltaQty = newQty - oldQty;
        const deltaTotalCost = newTotalCost - oldTotalCost;

        // Determine synthetic transaction type
        let syntheticType: 'BUY' | 'SELL' | 'NONE' = 'NONE';
        let syntheticQty = '0';
        let syntheticPrice = '0';
        let requiresUserInput = false;
        let isValid = true;
        let validationMessage: string | undefined;

        if (Math.abs(deltaQty) > 0.000001) { // Threshold for float comparison
            if (deltaQty > 0) {
                // Position increased → synthetic BUY
                syntheticType = 'BUY';
                syntheticQty = deltaQty.toString();

                // Calculate implied price: ΔTC / ΔQ
                const impliedPrice = deltaTotalCost / deltaQty;

                if (impliedPrice < 0) {
                    isValid = false;
                    validationMessage = 'Calculated price is negative - check your average price';
                    syntheticPrice = '0';
                } else {
                    syntheticPrice = impliedPrice.toFixed(4);
                }
            } else {
                // Position decreased → synthetic SELL
                syntheticType = 'SELL';
                syntheticQty = Math.abs(deltaQty).toString();

                // For SELL, we need user to provide the sell price
                // (snapshot doesn't tell us at what price they sold)
                requiresUserInput = true;
                syntheticPrice = '0';
                validationMessage = 'Please enter the sell price';
            }
        }

        diffs.push({
            assetKey: newPos.assetKey,
            displayName: newPos.displayName,
            assetSymbol: newPos.assetSymbol,
            assetIsin: newPos.assetIsin,
            oldQty: oldQty.toString(),
            oldAvgPrice: oldAvgPrice.toFixed(2),
            oldTotalCost: oldTotalCost.toFixed(2),
            newQty: newQty.toString(),
            newAvgPrice: newAvgPrice.toFixed(2),
            newTotalCost: newTotalCost.toFixed(2),
            deltaQty: deltaQty.toFixed(4),
            deltaTotalCost: deltaTotalCost.toFixed(2),
            syntheticType,
            syntheticQty,
            syntheticPrice,
            requiresUserInput,
            isValid,
            validationMessage
        });
    }

    // Calculate stats
    const stats = {
        newAssets: diffs.filter(d => d.oldQty === '0').length,
        increasePositions: diffs.filter(d => d.syntheticType === 'BUY' && d.oldQty !== '0').length,
        decreasePositions: diffs.filter(d => d.syntheticType === 'SELL').length,
        unchangedPositions: diffs.filter(d => d.syntheticType === 'NONE').length,
        requiresInput: diffs.filter(d => d.requiresUserInput).length,
        hasErrors: diffs.filter(d => !d.isValid).length
    };

    return { diffs, stats };
}

/**
 * Update a reconciliation diff with user-provided sell price
 */
export function updateDiffSellPrice(
    diff: ReconciliationDiff,
    sellPrice: string
): ReconciliationDiff {
    const price = parseFloat(sellPrice);

    if (isNaN(price) || price <= 0) {
        return {
            ...diff,
            syntheticPrice: sellPrice,
            isValid: false,
            validationMessage: 'Please enter a valid positive price'
        };
    }

    return {
        ...diff,
        syntheticPrice: price.toFixed(4),
        userProvidedSellPrice: sellPrice,
        requiresUserInput: false,
        isValid: true,
        validationMessage: undefined
    };
}

// ============================================================================
// TRANSACTION GENERATION
// ============================================================================

/**
 * Generate synthetic transactions from reconciliation diffs
 * Only processes diffs that are valid and resolved
 */
export function generateSyntheticTransactions(
    diffs: ReconciliationDiff[],
    batchId: string,
    accountId: string,
    defaultDate: string
): UnifiedTransaction[] {
    const transactions: UnifiedTransaction[] = [];

    for (const diff of diffs) {
        if (diff.syntheticType === 'NONE') continue;
        if (!diff.isValid) continue;
        if (diff.requiresUserInput) continue;

        const qty = parseFloat(diff.syntheticQty);
        const price = parseFloat(diff.syntheticPrice);
        const total = qty * price;

        const tx: UnifiedTransaction = {
            id: `utx-synth-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            batchId,
            accountId,
            transactionDate: defaultDate,
            type: diff.syntheticType,
            rawType: `Synthetic ${diff.syntheticType} (Snapshot Reconciliation)`,
            label: `${diff.syntheticType} ${qty} ${diff.displayName} @ ${price}`,
            rawLabel: `Snapshot reconciliation: ${diff.syntheticType}`,
            amountPrimary: diff.syntheticType === 'BUY' ? (-total).toString() : total.toString(),
            assetSymbol: diff.assetSymbol || diff.assetIsin || 'UNKNOWN',
            assetIsin: diff.assetIsin,
            priceUnit: diff.syntheticPrice,
            quantity: diff.syntheticQty,
            metadata: {
                syntheticTransaction: true,
                fromSnapshot: true,
                oldQty: diff.oldQty,
                newQty: diff.newQty,
                deltaQty: diff.deltaQty
            }
        };

        transactions.push(tx);
    }

    return transactions;
}

// ============================================================================
// SNAPSHOT ONLY MODE (No Transaction Generation)
// ============================================================================

/**
 * Create position records directly from snapshot
 * Returns synthetic BUY transactions representing current holdings
 */
export function createPositionTransactions(
    positions: SnapshotPosition[],
    batchId: string,
    accountId: string,
    defaultDate: string
): UnifiedTransaction[] {
    return positions.map(pos => {
        const qty = parseFloat(pos.quantity);
        const price = parseFloat(pos.avgPrice);
        const total = qty * price;

        return {
            id: `utx-snap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            batchId,
            accountId,
            transactionDate: pos.purchaseDate || defaultDate,
            type: 'BUY' as const,
            rawType: 'Snapshot Position',
            label: `Position: ${qty} ${pos.displayName} @ ${price}`,
            rawLabel: `Snapshot import: ${pos.displayName}`,
            amountPrimary: (-total).toString(),
            assetSymbol: pos.assetSymbol || pos.assetIsin || 'UNKNOWN',
            assetIsin: pos.assetIsin,
            priceUnit: pos.avgPrice,
            quantity: pos.quantity,
            metadata: {
                snapshotImport: true,
                displayName: pos.displayName
            }
        };
    });
}

// ============================================================================
// EXPORT
// ============================================================================

export const snapshotService = {
    parseSnapshotFile,
    getExistingPositions,
    calculateReconciliation,
    updateDiffSellPrice,
    generateSyntheticTransactions,
    createPositionTransactions,
    SNAPSHOT_MAPPABLE_FIELDS
};
