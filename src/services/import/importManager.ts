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
    Instrument
} from '../../types/types.backend';
import { db, delay } from '../db';
import {
    transactionManager,
    computeFileHash,
    computeRowHash,
    isFileAlreadyImported,
    getExistingRowHashes,
    CommitResult
} from '../core/transactionManager';
import { validationService, RowData } from '../core/validationService';
import { instrumentService } from '../instrumentService';
import { portfolioService } from '../portfolioService';
import { validateCSVRow } from '../../types/schemas';

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
    inferTransactionSubType,
    parseDate,
    parseDecimal,
    detectDateFormat
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
            detectedDelimiter: delimiter
        };
    }

    // Get existing row hashes for deduplication
    const existingHashes = getExistingRowHashes(config.accountId);

    // Helper to get value from row
    const getValue = (row: string[], mapping: string | number | undefined): string | undefined => {
        if (mapping === undefined || mapping === '') return undefined;
        if (typeof mapping === 'number') return row[mapping];
        const idx = headers.indexOf(mapping);
        return idx >= 0 ? row[idx] : undefined;
    };

    // Resolve each distinct asset once (rows run concurrently; without this every
    // row re-reads and re-parses the whole instrument store)
    const instrumentCache = new Map<string, Promise<Instrument>>();
    const resolveInstrument = (hint: Parameters<typeof instrumentService.findOrCreateInstrument>[0]): Promise<Instrument> => {
        const key = [hint.symbol, hint.isin, hint.exchange, hint.network, hint.contractAddress, hint.denominationCurrency].join('|');
        let pending = instrumentCache.get(key);
        if (!pending) {
            pending = instrumentService.findOrCreateInstrument(hint);
            instrumentCache.set(key, pending);
        }
        return pending;
    };
    const instrumentsById = new Map<string, Instrument>();
    // New instruments are denominated in the target account currency (EUR for a PEA, not USD)
    const accountCurrency = db.getAccountById(config.accountId)?.defaultCurrency;

    // Resolve day/month ordering once for the whole column (explicit config wins)
    const dateHint = config.dateFormat || detectDateFormat(rows.map(r => getValue(r, mappings!.transactionDate) || ''));

    // Parse each row
    const candidates: StagedTransaction[] = await Promise.all(rows.map(async (row, rowIndex) => {
        const rawRowObj: Record<string, string> = {};
        headers.forEach((h, i) => { rawRowObj[h] = row[i] || ''; });
        const { sanitized: originalRow } = validateCSVRow(rawRowObj);

        // Extract values
        const rawDateStr = getValue(row, mappings!.transactionDate) || '';
        const rawType = getValue(row, mappings!.type || mappings!.rawType) || '';
        const rawAmount = getValue(row, mappings!.amountPrimary) || '';
        const rawSymbol = getValue(row, mappings!.assetSymbol) || '';
        const rawFees = getValue(row, mappings!.feeAmount);

        // Parse date
        const transactionDate = parseDate(rawDateStr, dateHint) ||
            (config.mode === 'snapshot' ? (config.referenceDate || new Date().toISOString()) : undefined);

        // Amount: explicit column, otherwise derived from quantity × unit price
        let amountValue = parseDecimal(rawAmount);
        if (!amountValue) {
            const derivedQty = parseDecimal(getValue(row, mappings!.quantity));
            const derivedPrice = parseDecimal(getValue(row, mappings!.priceUnit));
            if (derivedQty && derivedPrice) {
                amountValue = (Math.abs(parseFloat(derivedQty)) * parseFloat(derivedPrice)).toString();
            }
        }

        // Compute row hash
        const rowHash = await computeRowHash(
            transactionDate || '',
            amountValue || '0',
            rawSymbol,
            normalizeTransactionType(rawType),
            parseDecimal(rawFees)
        );

        // Build parsed transaction
        const txType = normalizeTransactionType(rawType);
        const subType = inferTransactionSubType(rawType);

        const parsed: Partial<UnifiedTransaction> = {
            transactionDate,
            type: txType,
            subType,
            rawType: rawType || 'Unknown',
            amountPrimary: amountValue || undefined,
            assetSymbol: rawSymbol?.toUpperCase().trim() || undefined,
            rowHash,
            sourceOrigin: 'FILE' as SourceOrigin,
            isSynthetic: false,
            isFiscal: true,
            sourceMode: config.mode
        };

        // Optional fields
        const rawLabel = getValue(row, mappings!.rawLabel);
        if (rawLabel) parsed.rawLabel = rawLabel;

        const label = getValue(row, mappings!.label);
        if (label) parsed.label = label;

        const valueDate = getValue(row, mappings!.valueDate);
        if (valueDate) parsed.valueDate = parseDate(valueDate, dateHint) || undefined;

        const priceUnit = getValue(row, mappings!.priceUnit);
        if (priceUnit) parsed.priceUnit = parseDecimal(priceUnit) || undefined;

        const quantity = getValue(row, mappings!.quantity);
        if (quantity) parsed.quantity = parseDecimal(quantity) || undefined;
        // No quantity column but amount and unit price: quantity = |amount| / price
        if (!parsed.quantity && parsed.amountPrimary && parsed.priceUnit && parseFloat(parsed.priceUnit) > 0) {
            parsed.quantity = (Math.abs(parseFloat(parsed.amountPrimary)) / parseFloat(parsed.priceUnit)).toString();
        }

        const assetIsin = getValue(row, mappings!.assetIsin);
        if (assetIsin) parsed.assetIsin = assetIsin.trim();

        const feeAmount = getValue(row, mappings!.feeAmount);
        if (feeAmount) parsed.feeAmount = parseDecimal(feeAmount) || undefined;

        const feeAsset = getValue(row, mappings!.feeAsset);
        if (feeAsset) parsed.feeAsset = feeAsset.toUpperCase().trim();

        const taxAmount = getValue(row, mappings!.taxAmount);
        if (taxAmount) parsed.taxAmount = parseDecimal(taxAmount) || undefined;

        const balanceAfter = getValue(row, mappings!.balanceAfter);
        if (balanceAfter) parsed.balanceAfter = parseDecimal(balanceAfter) || undefined;

        const externalId = getValue(row, mappings!.externalId);
        if (externalId) parsed.externalId = externalId.trim();

        // Extract instrument-related fields from CSV
        const exchangeVal = getValue(row, mappings!.exchange);
        const networkVal = getValue(row, mappings!.network);
        const contractAddressVal = getValue(row, mappings!.contractAddress);
        const assetNameVal = getValue(row, mappings!.assetName);

        // Resolve instrument from CSV data (find existing or create new)
        let instrumentId: string | undefined;
        if (parsed.assetSymbol) {
            try {
                const instrument = await resolveInstrument({
                    denominationCurrency: accountCurrency,
                    symbol: parsed.assetSymbol,
                    isin: parsed.assetIsin,
                    name: assetNameVal?.trim(),
                    exchange: exchangeVal?.trim(),
                    network: networkVal?.trim(),
                    contractAddress: contractAddressVal?.trim()
                });
                instrumentId = instrument.id;
                parsed.instrumentId = instrumentId;
                instrumentsById.set(instrument.id, instrument);
            } catch {
                // Instrument resolution failed — will be caught by validation
            }
        }

        // Snapshot mode: calculate invested amount
        if (config.mode === 'snapshot' && parsed.quantity && parsed.priceUnit) {
            const qty = parseFloat(parsed.quantity);
            const price = parseFloat(parsed.priceUnit);
            if (!isNaN(qty) && !isNaN(price)) {
                parsed.amountPrimary = (qty * price).toString();
                parsed.type = 'BUY';
            }
        }

        // Store raw row in metadata
        parsed.metadata = { ...originalRow };

        // Resolve instrument type for validation context
        const resolvedInstrument = instrumentId ? instrumentsById.get(instrumentId) : undefined;

        // Validate with instrument context
        const rowData: RowData = {
            transactionDate: parsed.transactionDate || (rawDateStr.trim() ? rawDateStr : undefined),
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
            exchange: exchangeVal?.trim(),
            network: networkVal?.trim(),
            contractAddress: contractAddressVal?.trim()
        };
        const validation = validationService.validateRow(rowData, config.mode);
        const hasErrors = !validation.isValid;
        const hasWarnings = validation.warnings.length > 0;

        // Check duplicate by hash
        const isDuplicate = !hasErrors && existingHashes.has(rowHash);

        let status: StagedTransaction['status'] = 'valid';
        if (hasErrors) status = 'error';
        else if (isDuplicate) status = 'duplicate';
        else if (hasWarnings) status = 'warning';

        return {
            id: `row-${rowIndex}`,
            rowIndex,
            originalRow,
            originalRowArray: row,
            parsed,
            rowHash,
            status,
            errors: [...validation.errors, ...validation.warnings],
            resolution: isDuplicate ? 'skip' : 'pending'
        };
    }));

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
        detectedDelimiter: delimiter
    };
}

// ============================================================================
// BATCH COMMIT
// ============================================================================

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

    // Begin atomic transaction
    try {
        transactionManager.begin();

        // Convert to UnifiedTransaction
        const unifiedTxs: UnifiedTransaction[] = toImport.map(staged => ({
            id: `utx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            ownerId: userId,
            batchId,
            accountId,
            instrumentId: staged.parsed.instrumentId || '',
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
            // Recalculate positions after successful commit
            await recalculatePositions();
            return { ...result, batch: newBatch };
        }

        return result;
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

