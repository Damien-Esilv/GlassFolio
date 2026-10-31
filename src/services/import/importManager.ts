/**
 * Import Manager - Production-Grade Import Engine
 * 
 * Complete rewrite of the import service with:
 * - ACID transactions via TransactionManager
 * - Row-level deduplication via hash
 * - File-level idempotence via fileHash
 * - Instrument resolution during parsing
 * - Proper validation
 * - Synthetic transaction handling for snapshot mode
 */

import {
    UnifiedTransaction,
    ImportBatch,
    ImportMode,
    TransactionType,
    TransactionSubType,
    SourceOrigin,
    MappingTemplate,
    ENGINE_VERSION,
    FieldError,
    Instrument,
    VALID_FIAT_CURRENCIES
} from '../../types/types.backend';
import { db, delay } from '../db';
import {
    transactionManager,
    computeFileHash,
    computeRowHash,
    isFileAlreadyImported,
    getExistingRowHashCounts,
    CommitResult
} from '../core/transactionManager';
import { validationService, RowData } from '../core/validationService';
import { instrumentService } from '../instrumentService';
import { getAccountContext } from './accountContext';
import {
    clearStagedInstruments,
    commitStagedInstruments,
    findInstrument,
    isStagedInstrument,
    removeInstruments,
    resolveInstrumentId,
    stageInstrument,
} from './instrumentDrafts';
import { portfolioService } from '../portfolioService';
import { buildLedger, resolveQuantity, sortChronologically } from '../portfolio/positionLedger';
import { validateCSVRow } from '../../types/schemas';
import { buildRowContext, normalizeRow } from './rowNormalizer';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Field mapping configuration - maps CSV columns to UnifiedTransaction fields
 */
export interface FieldMappings {
    transactionDate: string | number;
    amountPrimary: string | number;
    assetSymbol?: string | number;
    assetIsin?: string | number;
    type?: string | number;
    rawType?: string | number;
    label?: string | number;
    rawLabel?: string | number;
    priceUnit?: string | number;
    quantity?: string | number;
    feeAmount?: string | number;
    feeAsset?: string | number;
    taxAmount?: string | number;
    valueDate?: string | number;
    balanceAfter?: string | number;
    externalId?: string | number;
    /** Exchange MIC or crypto exchange name (e.g. XNAS, Binance) */
    exchange?: string | number;
    /** Blockchain network for crypto (e.g. ethereum, solana) */
    network?: string | number;
    /** Contract address for ERC-20 tokens */
    contractAddress?: string | number;
    /** Asset name from CSV (e.g. "Apple Inc.") */
    assetName?: string | number;
    /** Currency of the row's amounts (ISO 4217); also the asset of a bank statement line */
    currency?: string | number;
}

/**
 * Import configuration
 */
export interface ImportConfig {
    accountId: string;
    mode: ImportMode;
    mappingTemplateId?: string;
    customMappings?: FieldMappings;
    dateFormat?: string;
    delimiter?: string;
    referenceDate?: string; // For snapshot imports
    userId?: string;
}

/**
 * Staged transaction ready for review
 */
export interface StagedTransaction {
    id: string;
    rowIndex: number;
    originalRow: Record<string, string>;
    originalRowArray: string[];
    parsed: Partial<UnifiedTransaction>;
    rowHash: string;
    /** Hash an older version gave this row (see hashParts.legacySymbol), for duplicate detection only */
    legacyRowHash?: string;
    status: 'valid' | 'error' | 'duplicate' | 'warning';
    errors: FieldError[];
    resolution: 'pending' | 'import' | 'skip';
}

/**
 * Parse result
 */
export interface ParseResult {
    candidates: StagedTransaction[];
    stats: {
        total: number;
        valid: number;
        errors: number;
        duplicates: number;
        warnings: number;
    };
    headers: string[];
    fileHash: string;
    existingBatch: ImportBatch | null;
    detectedPreset?: string;
    detectedDelimiter: string;
    /** The assets the rows point at: new ones are drafts, persisted only when the import is confirmed. */
    instruments: ImportInstrumentSummary[];
}

/** An asset used by the rows of an import in review. */
export interface ImportInstrumentSummary {
    instrument: Instrument;
    /** New in this import (a draft) rather than already in the portfolio. */
    isNew: boolean;
    rowCount: number;
}

/**
 * Parsed CSV structure
 */
interface ParsedCSV {
    headers: string[];
    rows: string[][];
    delimiter: string;
}

// Re-export modular components for 100% backward compatibility
export {
    PRESET_PATTERNS,
    detectPreset,
    getPresetMappings
} from './presetDetector';
import { detectPreset } from './presetDetector';

export {
    normalizeTransactionType,
    inferTransactionSubType,
    parseDate,
    parseDecimal,
    detectDateFormat
} from './typeNormalizer';
import {
    normalizeTransactionType,
    parseDate,
    parseDecimal
} from './typeNormalizer';

export { parseCSVText } from './csvParser';
import { parseCSVText } from './csvParser';

// ============================================================================
// CORE PARSING
// ============================================================================

/**
 * Parse a CSV file into staged transactions
 */
export async function parseFile(
    csvText: string,
    config: ImportConfig
): Promise<ParseResult> {
    await delay(200);

    // A new analysis replaces the drafts of the previous one (nothing was persisted for them)
    clearStagedInstruments();

    // Compute file hash for idempotence
    const fileHash = await computeFileHash(csvText);

    // Check if file was already imported
    const existingBatch = await isFileAlreadyImported(fileHash);

    // Parse CSV
    const { headers, rows, delimiter } = parseCSVText(csvText, config.delimiter);

    // Get mappings
    let mappings = config.customMappings;
    let detectedPreset: string | undefined;

    if (!mappings) {
        if (config.mappingTemplateId) {
            const template = db.getMappingTemplateById(config.mappingTemplateId);
            if (template) {
                mappings = template.mappings as unknown as FieldMappings;
            }
        }

        if (!mappings) {
            const detected = detectPreset(headers);
            if (detected) {
                mappings = detected.mappings;
                detectedPreset = detected.presetName;
            }
        }
    }

    if (!mappings) {
        return {
            candidates: [],
            stats: { total: rows.length, valid: 0, errors: rows.length, duplicates: 0, warnings: 0 },
            headers,
            fileHash,
            existingBatch,
            detectedDelimiter: delimiter,
            instruments: []
        };
    }

    // Row hashes already stored for this account (a trade can legitimately appear twice in a file)
    const existingHashCounts = getExistingRowHashCounts(config.accountId);

    // Resolve each distinct asset once (rows run concurrently; without this every
    // row re-reads and re-parses the whole instrument store)
    const instrumentCache = new Map<string, Promise<Instrument>>();
    const resolveInstrument = (hint: Parameters<typeof instrumentService.findOrCreateInstrument>[0]): Promise<Instrument> => {
        const key = [hint.symbol, hint.isin, hint.exchange, hint.network, hint.contractAddress, hint.denominationCurrency].join('|');
        let pending = instrumentCache.get(key);
        if (!pending) {
            pending = instrumentService.findOrCreateInstrument(hint, { persist: false }).then(instrument => {
                if (!db.getInstrumentById(instrument.id)) stageInstrument(instrument);
                return instrument;
            });
            instrumentCache.set(key, pending);
        }
        return pending;
    };
    const instrumentsById = new Map<string, Instrument>();
    // New instruments are denominated in the target account currency (EUR for a PEA, not USD)
    const accountCurrency = db.getAccountById(config.accountId)?.defaultCurrency;
    // Where the assets are held steers their class; a crypto institution is also their exchange
    const { accountType, instituteType, exchange: exchangeAccountName } = getAccountContext(config.accountId);
    // File-wide conventions (day/month order, decimal separator, amount signs), read once
    const rowContext = buildRowContext(headers, rows, mappings, {
        mode: config.mode,
        dateFormat: config.dateFormat,
        delimiter,
        referenceDate: config.referenceDate,
        accountCurrency
    });

    // Parse each row
    const candidates: StagedTransaction[] = await Promise.all(rows.map(async (row, rowIndex) => {
        const rawRowObj: Record<string, string> = {};
        headers.forEach((h, i) => { rawRowObj[h] = row[i] || ''; });
        const { sanitized: originalRow } = validateCSVRow(rawRowObj);

        const normalized = normalizeRow(row, rowContext);
        const { parsed, hashParts } = normalized;

        const rowHash = await computeRowHash(
            hashParts.date,
            hashParts.amount,
            hashParts.symbol,
            hashParts.type,
            hashParts.fee
        );
        parsed.rowHash = rowHash;
        const legacyRowHash = hashParts.legacySymbol === undefined
            ? undefined
            : await computeRowHash(hashParts.date, hashParts.amount, hashParts.legacySymbol, hashParts.type, hashParts.fee);

        // Resolve the instrument from the symbol or, failing that, the ISIN
        const { exchange, network, contractAddress, assetName } = normalized.instrumentHints;
        const identifier = parsed.assetSymbol || parsed.assetIsin;
        let instrumentId: string | undefined;
        if (identifier) {
            try {
                const instrument = await resolveInstrument({
                    denominationCurrency: normalized.isCashAsset ? parsed.assetSymbol : (normalized.currencyCode ?? accountCurrency),
                    symbol: identifier,
                    isin: parsed.assetIsin,
                    name: assetName,
                    exchange: exchange ?? exchangeAccountName,
                    network,
                    contractAddress,
                    accountType,
                    instituteType
                });
                instrumentId = instrument.id;
                parsed.instrumentId = instrumentId;
                instrumentsById.set(instrument.id, instrument);
            } catch {
                // Instrument resolution failed — will be caught by validation
            }
        }

        // Store raw row in metadata
        parsed.metadata = { ...originalRow, ...parsed.metadata };

        // Resolve instrument type for validation context
        const resolvedInstrument = instrumentId ? instrumentsById.get(instrumentId) : undefined;

        // Validate with instrument context
        const rowData: RowData = {
            transactionDate: parsed.transactionDate || (normalized.rawDate.trim() ? normalized.rawDate : undefined),
            valueDate: parsed.valueDate,
            type: parsed.type,
            amountPrimary: parsed.amountPrimary,
            assetSymbol: parsed.assetSymbol,
            assetIsin: parsed.assetIsin,
            priceUnit: parsed.priceUnit,
            quantity: parsed.quantity,
            feeAmount: parsed.feeAmount,
            rawLabel: parsed.rawLabel,
            label: parsed.label,
            instrumentType: resolvedInstrument?.type,
            exchange: exchange ?? resolvedInstrument?.marketIdentifier.exchange,
            network: network ?? resolvedInstrument?.marketIdentifier.network,
            contractAddress: contractAddress ?? resolvedInstrument?.marketIdentifier.contractAddress
        };
        const validation = validationService.validateRow(rowData, config.mode);

        // An ISIN-only row takes the symbol of its instrument, so every consumer can group it
        if (!parsed.assetSymbol && resolvedInstrument) parsed.assetSymbol = resolvedInstrument.marketIdentifier.symbol;

        const hasErrors = !validation.isValid || normalized.issues.some(issue => issue.severity === 'error');
        const hasWarnings = validation.warnings.length > 0 || normalized.issues.some(issue => issue.severity === 'warning');

        let status: StagedTransaction['status'] = 'valid';
        if (hasErrors) status = 'error';
        else if (hasWarnings) status = 'warning';

        return {
            id: `row-${rowIndex}`,
            rowIndex,
            originalRow,
            originalRowArray: row,
            parsed,
            rowHash,
            ...(legacyRowHash ? { legacyRowHash } : {}),
            status,
            errors: [...normalized.issues, ...validation.errors, ...validation.warnings],
            resolution: 'pending' as const
        };
    }));

    flagDuplicates(candidates, existingHashCounts);
    flagOversells(candidates, config.accountId);

    // Calculate stats
    const stats = {
        total: candidates.length,
        valid: candidates.filter(c => c.status === 'valid').length,
        errors: candidates.filter(c => c.status === 'error').length,
        duplicates: candidates.filter(c => c.status === 'duplicate').length,
        warnings: candidates.filter(c => c.status === 'warning').length
    };

    return {
        candidates,
        stats,
        headers,
        fileHash,
        existingBatch,
        detectedPreset,
        detectedDelimiter: delimiter,
        instruments: describeImportInstruments(candidates)
    };
}

/**
 * A row is a duplicate when the account already stores that many rows with the same hash.
 * Two identical trades in one file are both real; a file overlapping an earlier import only
 * loses the rows that are really already there.
 */
function flagDuplicates(candidates: StagedTransaction[], storedCounts: Map<string, number>): void {
    const seenInFile = new Map<string, number>();
    for (const candidate of candidates) {
        if (candidate.status === 'error') continue;
        // Rows stored by an older version carry the hash it computed then
        const hash = candidate.legacyRowHash && storedCounts.has(candidate.legacyRowHash) ? candidate.legacyRowHash : candidate.rowHash;
        const occurrence = seenInFile.get(hash) ?? 0;
        seenInFile.set(hash, occurrence + 1);
        if (occurrence < (storedCounts.get(hash) ?? 0)) {
            candidate.status = 'duplicate';
            candidate.resolution = 'skip';
        }
    }
}

/**
 * Warn (never reject) when a sell exceeds what the account holds at that date: earlier imports
 * plus earlier rows of this file. Partial histories are normal, so this stays a warning.
 */
function flagOversells(candidates: StagedTransaction[], accountId: string): void {
    const held = new Map<string, number>();
    for (const [key, entry] of buildLedger(db.getUnifiedTransactionsByAccount(accountId))) {
        held.set(key, entry.state.quantity);
    }

    const importable = sortChronologically(
        candidates
            .filter(c => c.status !== 'error' && c.status !== 'duplicate' && c.parsed.transactionDate)
            .map(c => ({ candidate: c, transactionDate: c.parsed.transactionDate as string, createdAt: String(c.rowIndex).padStart(9, '0'), type: c.parsed.type }))
    );

    for (const { candidate } of importable) {
        const { parsed } = candidate;
        const asset = parsed.instrumentId || parsed.assetIsin || parsed.assetSymbol;
        if (!asset || !parsed.type) continue;
        const symbol = parsed.assetSymbol || asset;
        if (symbol && (VALID_FIAT_CURRENCIES as readonly string[]).includes(symbol) && !parsed.assetIsin) continue;

        const key = `${accountId}:${asset}`;
        const quantity = resolveQuantity({ quantity: parsed.quantity, amountPrimary: parsed.amountPrimary ?? '0', priceUnit: parsed.priceUnit });
        const current = held.get(key) ?? 0;

        if (parsed.type === 'BUY' || parsed.type === 'DEPOSIT') {
            held.set(key, current + quantity);
        } else if (parsed.type === 'SELL' || parsed.type === 'WITHDRAW') {
            const problem = validationService.validateSellQuantity(String(quantity), String(current), symbol);
            if (problem && quantity > current + QTY_TOLERANCE) {
                candidate.errors.push({ ...problem, severity: 'warning' });
                if (candidate.status === 'valid') candidate.status = 'warning';
            }
            held.set(key, Math.max(0, current - quantity));
        }
    }
}

/** Float noise margin when comparing a sold quantity with the holdings */
const QTY_TOLERANCE = 1e-9;

// ============================================================================
// BATCH COMMIT
// ============================================================================

/**
 * The assets the rows of an import point at (one entry per asset), drafts included. Recomputed after
 * an asset is edited or merged in the review.
 */
export function describeImportInstruments(candidates: StagedTransaction[]): ImportInstrumentSummary[] {
    const counts = new Map<string, number>();
    for (const staged of candidates) {
        const id = staged.parsed.instrumentId;
        if (!id) continue;
        const resolved = resolveInstrumentId(id);
        counts.set(resolved, (counts.get(resolved) ?? 0) + 1);
    }
    const summaries: ImportInstrumentSummary[] = [];
    for (const [id, rowCount] of counts) {
        const instrument = findInstrument(id);
        if (instrument) summaries.push({ instrument, isNew: isStagedInstrument(id), rowCount });
    }
    return summaries.sort((a, b) => b.rowCount - a.rowCount || a.instrument.marketIdentifier.symbol.localeCompare(b.instrument.marketIdentifier.symbol));
}

/** The asset behind a symbol or ISIN typed in the review: an existing one, or a new draft. */
export async function resolveStagedInstrument(
    symbolOrIsin: { symbol?: string; isin?: string; name?: string },
    accountId: string
): Promise<Instrument | undefined> {
    const identifier = symbolOrIsin.symbol?.trim() || symbolOrIsin.isin?.trim();
    if (!identifier) return undefined;
    const context = getAccountContext(accountId);
    const instrument = await instrumentService.findOrCreateInstrument(
        {
            symbol: identifier,
            isin: symbolOrIsin.isin,
            name: symbolOrIsin.name,
            exchange: context.exchange,
            accountType: context.accountType,
            instituteType: context.instituteType,
            denominationCurrency: db.getAccountById(accountId)?.defaultCurrency
        },
        { persist: false }
    );
    if (!db.getInstrumentById(instrument.id)) stageInstrument(instrument);
    return instrument;
}

/** Validates a row again after the user edited it or its asset, with the same rules as the parse. */
export function revalidateStagedRow(staged: StagedTransaction, mode: ImportMode): StagedTransaction {
    const instrument = staged.parsed.instrumentId ? findInstrument(staged.parsed.instrumentId) : undefined;
    const parsed = staged.parsed;
    const validation = validationService.validateRow({
        transactionDate: parsed.transactionDate,
        valueDate: parsed.valueDate,
        type: parsed.type,
        amountPrimary: parsed.amountPrimary,
        assetSymbol: parsed.assetSymbol,
        assetIsin: parsed.assetIsin,
        priceUnit: parsed.priceUnit,
        quantity: parsed.quantity,
        feeAmount: parsed.feeAmount,
        rawLabel: parsed.rawLabel,
        label: parsed.label,
        instrumentType: instrument?.type,
        exchange: instrument?.marketIdentifier.exchange,
        network: instrument?.marketIdentifier.network,
        contractAddress: instrument?.marketIdentifier.contractAddress
    }, mode);

    const hasErrors = !validation.isValid;
    const status: StagedTransaction['status'] = hasErrors
        ? 'error'
        : staged.status === 'duplicate'
            ? 'duplicate'
            : validation.warnings.length > 0 ? 'warning' : 'valid';
    return {
        ...staged,
        errors: [...validation.errors, ...validation.warnings],
        status,
        resolution: hasErrors ? 'skip' : staged.status === 'error' && staged.resolution === 'skip' ? 'pending' : staged.resolution
    };
}

/**
 * Commit staged transactions atomically
 */
export async function commitBatch(
    transactions: StagedTransaction[],
    accountId: string,
    mode: ImportMode,
    fileName: string,
    fileHash: string,
    userId: string = 'default-user',
    referenceDate?: string,
    delimiter: string = ','
): Promise<CommitResult & { batch?: ImportBatch }> {
    await delay(300);

    const batchId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    // Filter transactions to import: never import error rows
    const toImport = transactions.filter(t =>
        t.status !== 'error' && (
            t.resolution === 'import' ||
            (t.status === 'valid' && t.resolution === 'pending') ||
            (t.status === 'warning' && t.resolution === 'pending')
        )
    );

    if (toImport.length === 0) {
        return {
            success: false,
            transactionCount: 0,
            batchId: null,
            error: 'No valid transactions to import'
        };
    }

    // Defense-in-depth: Ensure no transactions have future dates
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    for (const staged of toImport) {
        if (staged.parsed.transactionDate) {
            const txDate = new Date(staged.parsed.transactionDate);
            if (!isNaN(txDate.getTime()) && txDate > tomorrow) {
                return {
                    success: false,
                    transactionCount: 0,
                    batchId: null,
                    error: 'Cannot import transactions with dates in the future'
                };
            }
        }
    }

    // Instruments created by this import stay drafts until now: persist the ones the rows use
    let addedInstrumentIds: string[] = [];

    // Begin atomic transaction
    try {
        transactionManager.begin();

        // A draft that was lost (another analysis ran meanwhile) is rebuilt from its row, so no row loses its asset
        for (const staged of toImport) {
            const id = staged.parsed.instrumentId ? resolveInstrumentId(staged.parsed.instrumentId) : '';
            if (id && !isStagedInstrument(id) && !db.getInstrumentById(id)) {
                const rebuilt = await resolveStagedInstrument({ symbol: staged.parsed.assetSymbol, isin: staged.parsed.assetIsin }, accountId);
                staged.parsed = { ...staged.parsed, instrumentId: rebuilt?.id };
            }
        }
        addedInstrumentIds = commitStagedInstruments(toImport.map(t => t.parsed.instrumentId).filter((id): id is string => Boolean(id)));

        // Convert to UnifiedTransaction
        const unifiedTxs: UnifiedTransaction[] = toImport.map(staged => ({
            id: `utx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            ownerId: userId,
            batchId,
            accountId,
            instrumentId: resolveInstrumentId(staged.parsed.instrumentId || ''),
            rowHash: staged.rowHash,
            externalId: staged.parsed.externalId,
            sourceOrigin: 'FILE' as SourceOrigin,
            isSynthetic: false,
            isFiscal: true,
            sourceMode: mode,
            transactionDate: staged.parsed.transactionDate || now,
            valueDate: staged.parsed.valueDate,
            type: staged.parsed.type || 'BUY',
            subType: staged.parsed.subType,
            rawType: staged.parsed.rawType || 'Unknown',
            label: staged.parsed.label,
            rawLabel: staged.parsed.rawLabel || '',
            amountPrimary: staged.parsed.amountPrimary || '0',
            assetSymbol: staged.parsed.assetSymbol || 'UNKNOWN',
            assetIsin: staged.parsed.assetIsin,
            priceUnit: staged.parsed.priceUnit,
            quantity: staged.parsed.quantity,
            feeAmount: staged.parsed.feeAmount,
            feeAsset: staged.parsed.feeAsset,
            taxAmount: staged.parsed.taxAmount,
            originalCurrency: staged.parsed.originalCurrency,
            balanceAfter: staged.parsed.balanceAfter,
            createdAt: now,
            updatedAt: now,
            version: 1,
            metadata: staged.parsed.metadata
        }));

        // Create batch record
        const newBatch: ImportBatch = {
            id: batchId,
            ownerId: userId,
            accountId,
            importMode: mode,
            fileName,
            fileHash,
            transactionCount: unifiedTxs.length,
            skippedCount: transactions.length - toImport.length,
            importedAt: now,
            importedBy: userId,
            status: 'completed',
            engineVersion: ENGINE_VERSION,
            metadata: {
                totalRows: transactions.length,
                delimiter,
                referenceDate
            }
        };

        // Add to transaction context
        transactionManager.addTransactions(unifiedTxs);
        transactionManager.addBatch(newBatch);

        // Commit atomically
        const result = transactionManager.commit();

        if (result.success) {
            clearStagedInstruments();
            // The import is committed: a failed recalculation must not report it as failed, nor drop
            // the instruments its transactions use. Positions are rebuilt on the next recalculation.
            try {
                await recalculatePositions();
            } catch (recalcError) {
                console.error('[import] Position recalculation failed after a committed import', recalcError);
            }
            return { ...result, batch: newBatch };
        }

        removeInstruments(addedInstrumentIds);
        return result;
    } catch (error) {
        transactionManager.rollback();
        removeInstruments(addedInstrumentIds);
        return {
            success: false,
            transactionCount: 0,
            batchId: null,
            error: error instanceof Error ? error.message : 'Commit failed'
        };
    }
}

// ============================================================================
// ROLLBACK
// ============================================================================

/**
 * Rollback an import batch
 */
export async function rollbackBatch(batchId: string): Promise<{ deleted: number; success: boolean; error?: string }> {
    await delay(200);

    try {
        transactionManager.begin();

        // Mark for deletion
        transactionManager.deleteTransactionsByBatch(batchId);
        transactionManager.updateBatchStatus(batchId, 'rolled_back');

        // Commit
        const result = transactionManager.commit();

        if (result.success) {
            // Recalculate positions
            await recalculatePositions();
            return { deleted: result.transactionCount, success: true };
        }

        return { deleted: 0, success: false, error: result.error };
    } catch (error) {
        transactionManager.rollback();
        return {
            deleted: 0,
            success: false,
            error: error instanceof Error ? error.message : 'Rollback failed'
        };
    }
}

// ============================================================================
// POSITION RECALCULATION
// ============================================================================

/**
 * Recalculate all positions from transaction journal
 * THIS IS THE SOURCE OF TRUTH - positions are always derived
 */
async function recalculatePositions(): Promise<void> {
    await portfolioService.recalculatePositions();
}

// ============================================================================
// IMPORT HISTORY
// ============================================================================

/**
 * Get import history
 */
export async function getImportHistory(): Promise<ImportBatch[]> {
    await delay(100);
    return db.getImportBatches();
}

// ============================================================================
// MAPPING TEMPLATES - Delegated to mappingTemplateService
// ============================================================================

export {
    saveMappingTemplate,
    getMappingTemplates,
    deleteMappingTemplate,
    renameMappingTemplate,
    findTemplateForHeaders,
    computeHeaderSignature
} from './mappingTemplateService';
import {
    saveMappingTemplate,
    getMappingTemplates,
    deleteMappingTemplate,
    renameMappingTemplate,
    findTemplateForHeaders
} from './mappingTemplateService';

// ============================================================================
// BACKUP IMPORT & RESTORE (JSON) - Delegated to backupRestoreService
// ============================================================================

export {
    type BackupValidationResult,
    type BackupErrorCode,
    validateBackupContent,
    validateBackup,
    restoreBackupReset,
    mergeBackupData,
    mergeTransactionsOnly,
    pickTransactionEntities,
    TRANSACTION_ENTITY_KEYS
} from './backupRestoreService';
import {
    validateBackupContent,
    restoreBackupReset,
    mergeBackupData
} from './backupRestoreService';

// ============================================================================
// EXPORT
// ============================================================================

export const importManager = {
    parseFile,
    parseCSVText,
    detectPreset,
    normalizeTransactionType,
    parseDate,
    parseDecimal,
    commitBatch,
    rollbackBatch,
    getImportHistory,
    saveMappingTemplate,
    getMappingTemplates,
    deleteMappingTemplate,
    renameMappingTemplate,
    findTemplateForHeaders,
    validateBackupContent,
    restoreBackupReset,
    mergeBackupData
};

