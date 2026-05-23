/**
 * Snapshot Service (Refactored)
 * 
 * Handles Snapshot mode imports with proper reconciliation logic.
 * Generates BALANCE_ADJUSTMENT transactions (non-fiscal) for position changes.
 * 
 * CRITICAL: Synthetic transactions are NEVER fiscal.
 */

import {
    UnifiedTransaction,
    TransactionType,
    SourceOrigin,
    ImportMode,
    FieldError
} from '../../types';
import { db, delay } from '../db';
import { computeRowHash } from '../core/transactionManager';
import { parseCSVText, parseDate, parseDecimal } from './importManager';

// ============================================================================
// TYPES
// ============================================================================

export interface SnapshotFieldMappings {
    assetSymbol?: string | number;
    assetIsin?: string | number;
    assetName?: string | number;
    quantity: string | number;
    avgPrice: string | number;
    purchaseDate?: string | number;
}

export interface SnapshotPosition {
    assetSymbol?: string;
    assetIsin?: string;
    assetName?: string;
    quantity: string;
    avgPrice: string;
    purchaseDate?: string;
    displayName: string;
    assetKey: string;
}

export interface ExistingPosition {
    assetSymbol?: string;
    assetIsin?: string;
    assetName?: string;
    quantity: string;
    avgPrice: string;
    totalCost: string;
    assetKey: string;
    sourceMode: ImportMode | 'mixed';
}

export interface ReconciliationDiff {
    assetKey: string;
    displayName: string;
    assetSymbol?: string;
    assetIsin?: string;

    // Old position
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

    // Synthetic transaction to generate
    syntheticType: 'BALANCE_ADJUSTMENT' | 'NONE';
    syntheticQty: string;
    syntheticPrice: string;

    // Direction for UI
    direction: 'increase' | 'decrease' | 'none';

    // Validation
    requiresUserInput: boolean;
    isValid: boolean;
    validationMessage?: string;
    userProvidedSellPrice?: string;

    // Source mode conflict detection
    hasSourceModeConflict: boolean;
    existingSourceMode?: ImportMode | 'mixed';
}

export interface StagedSnapshotPosition {
    id: string;
    rowIndex: number;
    originalRow: Record<string, string>;
    position: SnapshotPosition;
    status: 'valid' | 'error' | 'warning';
    errors: FieldError[];
}

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

export interface ReconciliationResult {
    diffs: ReconciliationDiff[];
    stats: {
        newAssets: number;
        increasePositions: number;
        decreasePositions: number;
        unchangedPositions: number;
        requiresInput: number;
        hasErrors: number;
        hasConflicts: number;
    };
    warnings: string[];
}

// ============================================================================
// MAPPABLE FIELDS
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
// HELPERS
// ============================================================================

function rowToObject(row: string[], headers: string[]): Record<string, string> {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = row[i] || ''; });
    return obj;
}

function getValue(row: string[], headers: string[], mapping: string | number | undefined): string | undefined {
    if (mapping === undefined) return undefined;
    if (typeof mapping === 'number') return row[mapping];
    const idx = headers.indexOf(mapping);
    return idx >= 0 ? row[idx] : undefined;
}

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
        } else {
            const qty = parseFloat(quantity);
            if (qty < 0) {
                errors.push({
                    field: 'quantity',
                    message: 'Quantity cannot be negative',
                    severity: 'error'
                });
            }
        }

        // Parse average price
        const avgPrice = parseDecimal(rawPrice);
        if (!avgPrice) {
            errors.push({
                field: 'avgPrice',
                message: 'Average price is required',
                severity: 'error'
            });
        } else {
            const price = parseFloat(avgPrice);
            if (price < 0) {
                errors.push({
                    field: 'avgPrice',
                    message: 'Price cannot be negative',
                    severity: 'error'
                });
            }
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
 * Get existing positions from transaction journal
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
        sourceModes: Set<ImportMode>;
    }>();

    for (const tx of transactions) {
        if (tx.accountId !== accountId) continue;
        if (!['BUY', 'SELL', 'BALANCE_ADJUSTMENT', 'SNAPSHOT_ADJUSTMENT'].includes(tx.type)) continue;

        const key = tx.assetIsin || tx.assetSymbol;
        if (!key) continue;

        const existing = positionMap.get(key) || {
            assetSymbol: tx.assetSymbol,
            assetIsin: tx.assetIsin,
            assetName: undefined,
            totalQty: 0,
            totalCost: 0,
            sourceModes: new Set<ImportMode>()
        };

        const qty = parseFloat(tx.quantity || tx.amountPrimary || '0');
        const amount = parseFloat(tx.amountPrimary || '0');

        if (tx.type === 'BUY' || tx.type === 'BALANCE_ADJUSTMENT' || tx.type === 'SNAPSHOT_ADJUSTMENT') {
            existing.totalQty += Math.abs(qty);
            existing.totalCost += Math.abs(amount);
        } else if (tx.type === 'SELL') {
            existing.totalQty -= Math.abs(qty);
        }

        existing.sourceModes.add(tx.sourceMode);
        positionMap.set(key, existing);
    }

    // Convert to array
    const positions: ExistingPosition[] = [];
    for (const [key, pos] of positionMap) {
        if (pos.totalQty <= 0) continue;

        const avgPrice = pos.totalQty > 0 ? pos.totalCost / pos.totalQty : 0;
        const sourceMode: ImportMode | 'mixed' = pos.sourceModes.size > 1 ? 'mixed' :
            pos.sourceModes.values().next().value || 'history';

        positions.push({
            assetSymbol: pos.assetSymbol,
            assetIsin: pos.assetIsin,
            assetName: pos.assetName,
            quantity: pos.totalQty.toString(),
            avgPrice: avgPrice.toString(),
            totalCost: pos.totalCost.toString(),
            assetKey: key,
            sourceMode
        });
    }

    return positions;
}

// ============================================================================
// RECONCILIATION
// ============================================================================

/**
 * Calculate reconciliation between new snapshot and existing positions
 * 
 * CRITICAL: When mixing snapshot with history, we generate BALANCE_ADJUSTMENT
 * transactions that are explicitly marked as non-fiscal.
 */
export async function calculateReconciliation(
    newPositions: SnapshotPosition[],
    existingPositions: ExistingPosition[]
): Promise<ReconciliationResult> {
    await delay(100);

    const diffs: ReconciliationDiff[] = [];
    const warnings: string[] = [];
    const processedExistingKeys = new Set<string>();

    // Process each new position
    for (const newPos of newPositions) {
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

        // Check for source mode conflicts
        const hasSourceModeConflict = !!existing && existing.sourceMode === 'history';
        if (hasSourceModeConflict) {
            warnings.push(
                `Asset ${newPos.displayName} has history transactions. ` +
                `Snapshot will create BALANCE_ADJUSTMENT (non-fiscal) to reconcile.`
            );
        }

        // Determine synthetic transaction
        let syntheticType: 'BALANCE_ADJUSTMENT' | 'NONE' = 'NONE';
        let syntheticQty = '0';
        let syntheticPrice = '0';
        let direction: 'increase' | 'decrease' | 'none' = 'none';
        let requiresUserInput = false;
        let isValid = true;
        let validationMessage: string | undefined;

        if (Math.abs(deltaQty) > 0.000001) {
            syntheticType = 'BALANCE_ADJUSTMENT';

            if (deltaQty > 0) {
                // Position increased
                direction = 'increase';
                syntheticQty = deltaQty.toString();

                // Calculate implied price
                const impliedPrice = deltaQty !== 0 ? deltaTotalCost / deltaQty : newAvgPrice;

                if (impliedPrice < 0) {
                    isValid = false;
                    validationMessage = 'Calculated price is negative - check your average price';
                    syntheticPrice = '0';
                } else {
                    syntheticPrice = impliedPrice.toFixed(4);
                }
            } else {
                // Position decreased
                direction = 'decrease';
                syntheticQty = Math.abs(deltaQty).toString();

                // For decreases, we need user to provide sell price (snapshot doesn't tell us)
                // UNLESS we're just doing a balance adjustment
                requiresUserInput = false; // Balance adjustments don't need price
                syntheticPrice = oldAvgPrice.toFixed(4); // Use old PRU as reference
            }
        }

        diffs.push({
            assetKey: newPos.assetKey,
            displayName: newPos.displayName,
            assetSymbol: newPos.assetSymbol,
            assetIsin: newPos.assetIsin,
            oldQty: oldQty.toString(),
            oldAvgPrice: oldAvgPrice.toFixed(4),
            oldTotalCost: oldTotalCost.toFixed(2),
            newQty: newQty.toString(),
            newAvgPrice: newAvgPrice.toFixed(4),
            newTotalCost: newTotalCost.toFixed(2),
            deltaQty: deltaQty.toFixed(4),
            deltaTotalCost: deltaTotalCost.toFixed(2),
            syntheticType,
            syntheticQty,
            syntheticPrice,
            direction,
            requiresUserInput,
            isValid,
            validationMessage,
            hasSourceModeConflict,
            existingSourceMode: existing?.sourceMode
        });
    }

    // Calculate stats
    const stats = {
        newAssets: diffs.filter(d => d.oldQty === '0').length,
        increasePositions: diffs.filter(d => d.direction === 'increase' && d.oldQty !== '0').length,
        decreasePositions: diffs.filter(d => d.direction === 'decrease').length,
        unchangedPositions: diffs.filter(d => d.syntheticType === 'NONE').length,
        requiresInput: diffs.filter(d => d.requiresUserInput).length,
        hasErrors: diffs.filter(d => !d.isValid).length,
        hasConflicts: diffs.filter(d => d.hasSourceModeConflict).length
    };

    return { diffs, stats, warnings };
}

// ============================================================================
// TRANSACTION GENERATION
// ============================================================================

/**
 * Generate BALANCE_ADJUSTMENT transactions from reconciliation
 * These are ALWAYS non-fiscal (isFiscal: false)
 */
export async function generateReconciliationTransactions(
    diffs: ReconciliationDiff[],
    batchId: string,
    accountId: string,
    defaultDate: string,
    userId: string = 'default-user'
): Promise<UnifiedTransaction[]> {
    const transactions: UnifiedTransaction[] = [];
    const now = new Date().toISOString();

    for (const diff of diffs) {
        if (diff.syntheticType === 'NONE') continue;
        if (!diff.isValid) continue;
        if (diff.requiresUserInput) continue;

        const qty = parseFloat(diff.syntheticQty);
        const price = parseFloat(diff.syntheticPrice);
        const total = qty * price;

        // Compute row hash for this synthetic transaction
        const rowHash = await computeRowHash(
            defaultDate,
            total.toString(),
            diff.assetSymbol || diff.assetIsin || 'UNKNOWN',
            'BALANCE_ADJUSTMENT',
            '0'
        );

        const tx: UnifiedTransaction = {
            id: `utx-adj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            ownerId: userId,
            batchId,
            accountId,
            rowHash,
            sourceOrigin: 'SYNTHETIC' as SourceOrigin,

            // CRITICAL: Synthetic transactions are NOT fiscal
            isSynthetic: true,
            isFiscal: false,

            sourceMode: 'snapshot',
            transactionDate: defaultDate,
            type: 'BALANCE_ADJUSTMENT' as TransactionType,
            rawType: `Balance Adjustment (Snapshot Reconciliation - ${diff.direction})`,
            label: `${diff.direction === 'increase' ? '+' : '-'}${qty} ${diff.displayName} @ ${price}`,
            rawLabel: `Snapshot reconciliation: ${diff.direction}`,
            amountPrimary: diff.direction === 'increase' ? (-total).toString() : total.toString(),
            assetSymbol: diff.assetSymbol || diff.assetIsin || 'UNKNOWN',
            assetIsin: diff.assetIsin,
            priceUnit: diff.syntheticPrice,
            quantity: diff.syntheticQty,
            createdAt: now,
            updatedAt: now,
            version: 1,
            metadata: {
                syntheticTransaction: true,
                fromSnapshot: true,
                reconciliationType: diff.direction,
                oldQty: diff.oldQty,
                newQty: diff.newQty,
                deltaQty: diff.deltaQty,
                hadSourceModeConflict: diff.hasSourceModeConflict
            }
        };

        transactions.push(tx);
    }

    return transactions;
}

/**
 * Create position transactions for new assets (first-time snapshot)
 * These are marked as synthetic but use SNAPSHOT_ADJUSTMENT type
 */
export async function createPositionTransactions(
    positions: SnapshotPosition[],
    batchId: string,
    accountId: string,
    defaultDate: string,
    userId: string = 'default-user'
): Promise<UnifiedTransaction[]> {
    const transactions: UnifiedTransaction[] = [];
    const now = new Date().toISOString();

    for (const pos of positions) {
        const qty = parseFloat(pos.quantity);
        const price = parseFloat(pos.avgPrice);
        const total = qty * price;

        // Compute row hash
        const rowHash = await computeRowHash(
            pos.purchaseDate || defaultDate,
            total.toString(),
            pos.assetSymbol || pos.assetIsin || 'UNKNOWN',
            'SNAPSHOT_ADJUSTMENT',
            '0'
        );

        const tx: UnifiedTransaction = {
            id: `utx-snap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            ownerId: userId,
            batchId,
            accountId,
            rowHash,
            sourceOrigin: 'SYNTHETIC' as SourceOrigin,

            // CRITICAL: Snapshot positions are NOT fiscal
            // They establish a baseline, not a real purchase
            isSynthetic: true,
            isFiscal: false,

            sourceMode: 'snapshot',
            transactionDate: pos.purchaseDate || defaultDate,
            type: 'SNAPSHOT_ADJUSTMENT' as TransactionType,
            rawType: 'Snapshot Position',
            label: `Position: ${qty} ${pos.displayName} @ ${price}`,
            rawLabel: `Snapshot import: ${pos.displayName}`,
            amountPrimary: (-total).toString(),
            assetSymbol: pos.assetSymbol || pos.assetIsin || 'UNKNOWN',
            assetIsin: pos.assetIsin,
            priceUnit: pos.avgPrice,
            quantity: pos.quantity,
            createdAt: now,
            updatedAt: now,
            version: 1,
            metadata: {
                snapshotImport: true,
                displayName: pos.displayName
            }
        };

        transactions.push(tx);
    }

    return transactions;
}

/**
 * Detect potential conflicts between source modes (History vs Snapshot)
 * 
 * If an account already has snapshot imports, history import might cause 
 * duplicate balances unless handled carefully.
 */
export async function detectSourceModeConflict(
    accountId: string,
    newMode: ImportMode
): Promise<'NONE' | 'WARNING' | 'CRITICAL'> {
    const batches = db.getImportBatches().filter(b => b.accountId === accountId && b.status === 'completed');

    if (batches.length === 0) return 'NONE';

    const hasSnapshots = batches.some(b => b.importMode === 'snapshot');
    const hasHistory = batches.some(b => b.importMode === 'history');

    if (newMode === 'history' && hasSnapshots) {
        // Mixing history into a snapshot-based account is dangerous
        return 'CRITICAL';
    }

    if (newMode === 'snapshot' && hasHistory) {
        // Snapshot over history is okay but needs warning about potential adjustments
        return 'WARNING';
    }

    return 'NONE';
}

// ============================================================================
// EXPORT
// ============================================================================

export const snapshotService = {
    parseSnapshotFile,
    getExistingPositions,
    calculateReconciliation,
    generateReconciliationTransactions,
    createPositionTransactions,
    detectSourceModeConflict,
    SNAPSHOT_MAPPABLE_FIELDS
};
