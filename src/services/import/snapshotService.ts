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
    FieldError,
    ImportBatch,
    ENGINE_VERSION
} from '../../types';
import { db, delay } from '../db';
import { computeRowHash, computeFileHash, transactionManager, CommitResult } from '../core/transactionManager';
import { portfolioService } from '../portfolioService';
import { parseCSVText, parseDate, parseDecimal, detectDateFormat } from './importManager';
import { detectDecimalSeparator } from './typeNormalizer';
import { instrumentService } from '../instrumentService';
import { buildLedger, QTY_EPSILON } from '../portfolio/positionLedger';
import { validateDate } from '../core/validationService';

/** Cost basis differences below half a cent are rounding noise */
const COST_EPSILON = 0.005;

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
    /** Exact (unrounded) cost basis change applied by the adjustment */
    deltaCostBasis: string;

    /** Asset held on the account but absent from the snapshot file */
    isClosure: boolean;

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

export interface ReconciliationOptions {
    /** Close assets held on the account that are absent from the snapshot (default true) */
    closeMissing?: boolean;
}

/** Snapshot commit strategy: 'replace' = snapshot-only mode, 'synthetic' = reconciliation journal */
export type SnapshotCommitMode = 'replace' | 'synthetic';

export interface SnapshotCommitParams {
    mode: SnapshotCommitMode;
    positions: SnapshotPosition[];
    accountId: string;
    batchId: string;
    date: string;
    userId: string;
    closeMissing?: boolean;
    /** Pre-computed reconciliation (synthetic mode, may include user edits) */
    diffs?: ReconciliationDiff[];
}

// ============================================================================
// MAPPABLE FIELDS
// ============================================================================

export const SNAPSHOT_MAPPABLE_FIELDS = [
    { key: 'assetSymbol', labelKey: 'snapshotWizard.fields.assetSymbol', required: false, hintKey: 'snapshotWizard.hints.assetSymbol' },
    { key: 'assetIsin', labelKey: 'snapshotWizard.fields.assetIsin', required: false, hintKey: 'snapshotWizard.hints.assetIsin' },
    { key: 'assetName', labelKey: 'snapshotWizard.fields.assetName', required: false, hintKey: 'snapshotWizard.hints.assetName' },
    { key: 'quantity', labelKey: 'snapshotWizard.fields.quantity', required: true, hintKey: 'snapshotWizard.hints.quantity' },
    { key: 'avgPrice', labelKey: 'snapshotWizard.fields.avgPrice', required: true, hintKey: 'snapshotWizard.hints.avgPrice' },
    { key: 'purchaseDate', labelKey: 'snapshotWizard.fields.purchaseDate', required: false, hintKey: 'snapshotWizard.hints.purchaseDate' },
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
    if (mapping === undefined || mapping === '') return undefined;
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
    const dateHint = detectDateFormat(rows.map(r => getValue(r, headers, mappings.purchaseDate) || ''));
    const decimalHint = detectDecimalSeparator(rows.slice(0, 1000).flatMap(r => [
        getValue(r, headers, mappings.quantity) ?? '',
        getValue(r, headers, mappings.avgPrice) ?? ''
    ]), delimiter);

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
                severity: 'error',
                code: 'ASSET_ID_REQUIRED'
            });
        }

        // Parse quantity
        const quantity = parseDecimal(rawQty, decimalHint);
        if (!quantity) {
            errors.push({
                field: 'quantity',
                message: 'Quantity is required',
                severity: 'error',
                code: 'SNAPSHOT_QTY_REQUIRED'
            });
        } else {
            const qty = parseFloat(quantity);
            if (qty < 0) {
                errors.push({
                    field: 'quantity',
                    message: 'Quantity cannot be negative',
                    severity: 'error',
                    code: 'QTY_NEGATIVE'
                });
            }
        }

        // Parse average price
        const avgPrice = parseDecimal(rawPrice, decimalHint);
        if (!avgPrice) {
            errors.push({
                field: 'avgPrice',
                message: 'Average price is required',
                severity: 'error',
                code: 'SNAPSHOT_PRICE_REQUIRED'
            });
        } else {
            const price = parseFloat(avgPrice);
            if (price < 0) {
                errors.push({
                    field: 'avgPrice',
                    message: 'Price cannot be negative',
                    severity: 'error',
                    code: 'PRICE_NEGATIVE'
                });
            }
        }

        // Parse optional date
        const purchaseDate = rawDate ? parseDate(rawDate, dateHint) || undefined : undefined;
        if (rawDate && rawDate.trim() !== '') {
            const dateErrors = validateDate(purchaseDate || rawDate, 'purchaseDate');
            errors.push(...dateErrors);
        }

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
 * Get existing positions of an account, computed by the shared position ledger
 * (same maths as the dashboard), grouped by instrument.
 */
export async function getExistingPositions(accountId: string): Promise<ExistingPosition[]> {
    await delay(100);

    const transactions = db.getUnifiedTransactions().filter(tx => tx.accountId === accountId);
    const methodFor = () => db.getAccountById(accountId)?.costBasisMethod ?? 'WAC';
    const ledger = buildLedger(transactions, { methodFor });

    // Identity (symbol / ISIN / modes) per ledger key
    const identity = new Map<string, { assetSymbol?: string; assetIsin?: string; sourceModes: Set<ImportMode> }>();
    for (const tx of transactions) {
        const key = `${tx.accountId}:${tx.instrumentId || tx.assetIsin || tx.assetSymbol}`;
        const entry = identity.get(key) || { sourceModes: new Set<ImportMode>() };
        entry.assetSymbol = entry.assetSymbol || tx.assetSymbol || undefined;
        entry.assetIsin = entry.assetIsin || tx.assetIsin || undefined;
        if (['BUY', 'SELL', 'BALANCE_ADJUSTMENT', 'SNAPSHOT_ADJUSTMENT'].includes(tx.type)) entry.sourceModes.add(tx.sourceMode);
        identity.set(key, entry);
    }

    const positions: ExistingPosition[] = [];
    for (const { key, state } of ledger.values()) {
        if (state.quantity <= QTY_EPSILON) continue;
        const id = identity.get(key);
        const modes = id?.sourceModes ?? new Set<ImportMode>();
        const sourceMode: ImportMode | 'mixed' = modes.size > 1 ? 'mixed' : modes.values().next().value || 'history';

        positions.push({
            assetSymbol: id?.assetSymbol,
            assetIsin: id?.assetIsin,
            assetName: undefined,
            quantity: state.quantity.toString(),
            avgPrice: (state.costBasis / state.quantity).toString(),
            totalCost: state.costBasis.toString(),
            assetKey: id?.assetIsin || id?.assetSymbol || key,
            sourceMode
        });
    }

    return positions;
}

// ============================================================================
// RECONCILIATION
// ============================================================================

interface DiffInput {
    assetKey: string;
    displayName: string;
    assetSymbol?: string;
    assetIsin?: string;
    oldQty: number;
    oldTotalCost: number;
    newQty: number;
    newAvgPrice: number;
    existing?: ExistingPosition;
    isClosure: boolean;
}

function buildDiff(input: DiffInput): ReconciliationDiff {
    const { oldQty, oldTotalCost, newQty, newAvgPrice, existing } = input;
    const oldAvgPrice = oldQty > 0 ? oldTotalCost / oldQty : 0;
    const newTotalCost = newQty * newAvgPrice;
    const deltaQty = newQty - oldQty;
    const deltaCost = newTotalCost - oldTotalCost;

    const qtyChanged = Math.abs(deltaQty) > QTY_EPSILON;
    const costChanged = Math.abs(deltaCost) > COST_EPSILON;
    const direction: ReconciliationDiff['direction'] = !qtyChanged ? 'none' : deltaQty > 0 ? 'increase' : 'decrease';
    const syntheticType: ReconciliationDiff['syntheticType'] = qtyChanged || costChanged ? 'BALANCE_ADJUSTMENT' : 'NONE';

    // Implied unit price of the adjustment (informative): Δcost / Δqty
    const impliedPrice = qtyChanged ? deltaCost / deltaQty : 0;
    const validationMessage = qtyChanged && impliedPrice < 0
        ? 'snapshotWizard.warnings.negativeImpliedPrice'
        : undefined;

    return {
        assetKey: input.assetKey,
        displayName: input.displayName,
        assetSymbol: input.assetSymbol,
        assetIsin: input.assetIsin,
        oldQty: oldQty.toString(),
        oldAvgPrice: oldAvgPrice.toFixed(4),
        oldTotalCost: oldTotalCost.toFixed(2),
        newQty: newQty.toString(),
        newAvgPrice: newAvgPrice.toFixed(4),
        newTotalCost: newTotalCost.toFixed(2),
        deltaQty: deltaQty.toFixed(4),
        deltaTotalCost: deltaCost.toFixed(2),
        deltaCostBasis: syntheticType === 'NONE' ? '0' : deltaCost.toString(),
        isClosure: input.isClosure,
        syntheticType,
        syntheticQty: qtyChanged ? Math.abs(deltaQty).toString() : '0',
        syntheticPrice: qtyChanged ? Math.abs(impliedPrice).toFixed(4) : '0',
        direction,
        requiresUserInput: false,
        isValid: true,
        validationMessage,
        hasSourceModeConflict: !!existing && existing.sourceMode === 'history',
        existingSourceMode: existing?.sourceMode
    };
}

/**
 * Calculate reconciliation between a new snapshot and existing positions.
 *
 * Guarantee: applying the generated adjustments to the existing positions
 * yields exactly the snapshot (quantity AND cost basis), including PRU-only
 * changes and, when closeMissing is on, assets absent from the file.
 * Adjustments are BALANCE_ADJUSTMENT and therefore never fiscal.
 */
export async function calculateReconciliation(
    newPositions: SnapshotPosition[],
    existingPositions: ExistingPosition[],
    options: ReconciliationOptions = {}
): Promise<ReconciliationResult> {
    await delay(100);

    const closeMissing = options.closeMissing ?? true;
    const diffs: ReconciliationDiff[] = [];
    const warnings: string[] = [];
    const matchedExisting = new Set<ExistingPosition>();

    for (const newPos of newPositions) {
        const existing = existingPositions.find(ex =>
            !matchedExisting.has(ex) && (
                (ex.assetIsin && newPos.assetIsin && ex.assetIsin === newPos.assetIsin) ||
                (ex.assetSymbol && newPos.assetSymbol && ex.assetSymbol.toUpperCase() === newPos.assetSymbol.toUpperCase())
            )
        );
        if (existing) matchedExisting.add(existing);

        const diff = buildDiff({
            assetKey: newPos.assetKey,
            displayName: newPos.displayName,
            assetSymbol: newPos.assetSymbol || existing?.assetSymbol,
            assetIsin: newPos.assetIsin || existing?.assetIsin,
            oldQty: existing ? parseFloat(existing.quantity) : 0,
            oldTotalCost: existing ? parseFloat(existing.totalCost) : 0,
            newQty: parseFloat(newPos.quantity),
            newAvgPrice: parseFloat(newPos.avgPrice),
            existing,
            isClosure: false
        });
        if (diff.hasSourceModeConflict) warnings.push(newPos.displayName);
        diffs.push(diff);
    }

    if (closeMissing) {
        for (const existing of existingPositions) {
            if (matchedExisting.has(existing) || parseFloat(existing.quantity) <= QTY_EPSILON) continue;
            diffs.push(buildDiff({
                assetKey: existing.assetKey,
                displayName: existing.assetName || existing.assetSymbol || existing.assetIsin || existing.assetKey,
                assetSymbol: existing.assetSymbol,
                assetIsin: existing.assetIsin,
                oldQty: parseFloat(existing.quantity),
                oldTotalCost: parseFloat(existing.totalCost),
                newQty: 0,
                newAvgPrice: 0,
                existing,
                isClosure: true
            }));
        }
    }

    const stats = {
        newAssets: diffs.filter(d => parseFloat(d.oldQty) === 0 && d.direction === 'increase').length,
        increasePositions: diffs.filter(d => d.direction === 'increase' && parseFloat(d.oldQty) !== 0).length,
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
        const costDelta = parseFloat(diff.deltaCostBasis ?? diff.deltaTotalCost);

        // Resolve instrument
        let instrumentId = '';
        try {
            const instrument = await instrumentService.findOrCreateInstrument({
                denominationCurrency: db.getAccountById(accountId)?.defaultCurrency,
                accountType: db.getAccountById(accountId)?.type,
                symbol: diff.assetSymbol || diff.assetIsin || 'UNKNOWN',
                isin: diff.assetIsin,
                name: diff.displayName
            });
            instrumentId = instrument.id;
        } catch (e) {
            // ignore
        }

        // Compute row hash for this synthetic transaction
        const rowHash = await computeRowHash(
            defaultDate,
            costDelta.toString(),
            diff.assetSymbol || diff.assetIsin || 'UNKNOWN',
            'BALANCE_ADJUSTMENT',
            diff.syntheticQty
        );

        const tx: UnifiedTransaction = {
            id: `utx-adj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            ownerId: userId,
            batchId,
            accountId,
            instrumentId,
            rowHash,
            sourceOrigin: 'SYNTHETIC' as SourceOrigin,

            // CRITICAL: Synthetic transactions are NOT fiscal
            isSynthetic: true,
            isFiscal: false,

            sourceMode: 'snapshot',
            transactionDate: defaultDate,
            type: 'BALANCE_ADJUSTMENT' as TransactionType,
            rawType: `Balance Adjustment (Snapshot Reconciliation - ${diff.isClosure ? 'closure' : diff.direction})`,
            label: diff.direction === 'none'
                ? `${diff.displayName}: ${diff.oldAvgPrice} → ${diff.newAvgPrice}`
                : `${diff.direction === 'increase' ? '+' : '-'}${qty} ${diff.displayName} @ ${price}`,
            rawLabel: `Snapshot reconciliation: ${diff.isClosure ? 'closure' : diff.direction}`,
            // Cash view of the cost basis change: money "invested" is negative
            amountPrimary: (-costDelta).toString(),
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
                costDelta,
                isClosure: diff.isClosure,
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

        // Resolve instrument
        let instrumentId = '';
        try {
            const instrument = await instrumentService.findOrCreateInstrument({
                denominationCurrency: db.getAccountById(accountId)?.defaultCurrency,
                accountType: db.getAccountById(accountId)?.type,
                symbol: pos.assetSymbol || pos.assetIsin || 'UNKNOWN',
                isin: pos.assetIsin,
                name: pos.displayName
            });
            instrumentId = instrument.id;
        } catch (e) {
            // ignore
        }

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
            instrumentId,
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
                displayName: pos.displayName,
                reconciliationType: 'increase',
                costDelta: total
            }
        };

        transactions.push(tx);
    }

    return transactions;
}

/**
 * Build the transactions of a snapshot import.
 *
 * - 'synthetic': the reconciliation diffs become BALANCE_ADJUSTMENT rows.
 * - 'replace' (snapshot-only): the account is set to the snapshot. New assets
 *   become SNAPSHOT_ADJUSTMENT rows (keeping their purchase date), assets
 *   already held are reconciled — re-importing the same file adds nothing.
 */
export async function buildSnapshotCommit(params: SnapshotCommitParams): Promise<UnifiedTransaction[]> {
    const { mode, positions, accountId, batchId, date, userId, closeMissing } = params;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date && new Date(date) > tomorrow) {
        throw new Error('Snapshot date cannot be in the future');
    }

    for (const pos of positions) {
        if (pos.purchaseDate && new Date(pos.purchaseDate) > tomorrow) {
            throw new Error('Snapshot purchase date cannot be in the future');
        }
    }

    if (mode === 'synthetic' && params.diffs) {
        return generateReconciliationTransactions(params.diffs, batchId, accountId, date, userId);
    }

    const existing = await getExistingPositions(accountId);
    const { diffs } = await calculateReconciliation(positions, existing, { closeMissing });

    if (mode === 'synthetic') {
        return generateReconciliationTransactions(diffs, batchId, accountId, date, userId);
    }

    const newAssetKeys = new Set(
        diffs.filter(d => parseFloat(d.oldQty) === 0 && d.direction === 'increase').map(d => d.assetKey)
    );
    const newAssetPositions = positions.filter(p => newAssetKeys.has(p.assetKey));
    const adjustments = diffs.filter(d => !newAssetKeys.has(d.assetKey));

    return [
        ...await createPositionTransactions(newAssetPositions, batchId, accountId, date, userId),
        ...await generateReconciliationTransactions(adjustments, batchId, accountId, date, userId)
    ];
}

export interface CommitSnapshotParams extends Omit<SnapshotCommitParams, 'batchId' | 'date'> {
    rawContent: string;
    fileName: string;
    totalRows: number;
    date?: string;
}

/**
 * Build and atomically persist a snapshot import (transactions + batch), then
 * refresh derived positions. Shared by the wizard and the AI / MCP tool.
 */
export async function commitSnapshotImport(params: CommitSnapshotParams): Promise<CommitResult & { batch?: ImportBatch }> {
    const batchId = `batch-snap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = params.date || new Date().toISOString();

    const transactions = await buildSnapshotCommit({ ...params, batchId, date: now });
    const batch: ImportBatch = {
        id: batchId,
        ownerId: params.userId,
        accountId: params.accountId,
        importMode: 'snapshot',
        fileName: params.fileName,
        fileHash: await computeFileHash(params.rawContent),
        transactionCount: transactions.length,
        skippedCount: params.totalRows - params.positions.length,
        importedAt: now,
        importedBy: params.userId,
        status: 'completed',
        engineVersion: ENGINE_VERSION,
        metadata: { totalRows: params.totalRows }
    };

    try {
        transactionManager.begin();
        transactionManager.addTransactions(transactions);
        transactionManager.addBatch(batch);
        const result = transactionManager.commit();
        if (!result.success) return result;
        await portfolioService.recalculatePositions();
        return { ...result, batch };
    } catch (error) {
        transactionManager.rollback();
        return {
            success: false,
            transactionCount: 0,
            batchId: null,
            error: error instanceof Error ? error.message : 'Commit failed'
        };
    }
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
    buildSnapshotCommit,
    commitSnapshotImport,
    detectSourceModeConflict,
    SNAPSHOT_MAPPABLE_FIELDS
};
