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
    FieldError
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

// ============================================================================
// CSV PARSING
// ============================================================================

/**
 * Parse CSV text with auto-delimiter detection
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

// ============================================================================
// TRANSACTION TYPE NORMALIZATION
// ============================================================================

/**
 * Normalize raw transaction type string.
 * Returns both the main type and optional sub-type for granular classification.
 */
export function normalizeTransactionType(rawType: string): TransactionType {
    if (!rawType) return 'BUY';

    const lower = rawType.toLowerCase().trim();

    // Buy patterns
    if (lower.includes('buy') || lower.includes('achat') || lower.includes('purchase')) {
        return 'BUY';
    }

    // Sell patterns
    if (lower.includes('sell') || lower.includes('vente') || lower.includes('sold')) {
        return 'SELL';
    }

    // Deposit patterns
    if (lower.includes('deposit') || lower.includes('dépôt') || lower.includes('virement reçu') ||
        lower.includes('credit') || lower.includes('crédit') || lower.includes('versement')) {
        return 'DEPOSIT';
    }

    // Withdraw patterns
    if (lower.includes('withdraw') || lower.includes('retrait') || lower.includes('virement émis') ||
        lower.includes('debit') || lower.includes('débit')) {
        return 'WITHDRAW';
    }

    // Income patterns (dividends, interest, staking, cashback)
    if (lower.includes('dividend') || lower.includes('dividende') || lower.includes('interest') ||
        lower.includes('intérêt') || lower.includes('distribution') || lower.includes('staking') ||
        lower.includes('reward') || lower.includes('cashback') || lower.includes('saveback') ||
        lower.includes('airdrop') || lower.includes('mining')) {
        return 'INCOME';
    }

    // Expense patterns
    if (lower.includes('fee') || lower.includes('frais') || lower.includes('commission')) {
        return 'EXPENSE';
    }

    // Transfer patterns
    if (lower.includes('transfer') || lower.includes('virement') || lower.includes('send') ||
        lower.includes('receive') || lower.includes('envoi')) {
        return 'TRANSFER';
    }

    // Swap patterns
    if (lower.includes('swap') || lower.includes('exchange') || lower.includes('convert') ||
        lower.includes('small assets') || lower.includes('dust')) {
        return 'SWAP';
    }

    // Adjustment patterns
    if (lower.includes('adjust') || lower.includes('correction') || lower.includes('manual')) {
        return 'ADJUSTMENT';
    }

    return 'BUY';
}

/**
 * Infer transaction sub-type from raw type string.
 * Provides granular classification, especially for crypto operations.
 */
export function inferTransactionSubType(rawType: string): TransactionSubType | undefined {
    if (!rawType) return undefined;
    const lower = rawType.toLowerCase().trim();

    if (lower.includes('dividend') || lower.includes('dividende')) return 'DIVIDEND';
    if (lower.includes('interest') || lower.includes('intérêt')) return 'INTEREST';
    if (lower.includes('staking') || lower.includes('stake reward')) return 'STAKING_REWARD';
    if (lower.includes('airdrop')) return 'AIRDROP';
    if (lower.includes('mining')) return 'MINING_REWARD';
    if (lower.includes('cashback') || lower.includes('saveback')) return 'CASHBACK';
    if (lower.includes('dust') || lower.includes('small assets')) return 'DUST_CONVERSION';

    return undefined;
}

// ============================================================================
// DATE PARSING
// ============================================================================

/**
 * Parse date with format detection
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
    const euroMatch = cleaned.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(.*)$/);
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

    // Fallback
    const fallback = new Date(cleaned);
    if (!isNaN(fallback.getTime())) {
        return fallback.toISOString();
    }

    return null;
}

/**
 * Parse decimal with format detection
 */
export function parseDecimal(value: string | undefined): string | null {
    if (!value || value.trim() === '') return null;

    let cleaned = value.trim();

    // European format (1.234,56 -> 1234.56)
    if (/^-?\d{1,3}(\.\d{3})*,\d+$/.test(cleaned)) {
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    }
    // Simple comma decimal (1234,56 -> 1234.56)
    else if (/^-?\d+,\d+$/.test(cleaned)) {
        cleaned = cleaned.replace(',', '.');
    }
    // US format with thousand separators
    else if (/^-?\d{1,3}(,\d{3})*(\.\d+)?$/.test(cleaned)) {
        cleaned = cleaned.replace(/,/g, '');
    }

    // Remove currency symbols
    cleaned = cleaned.replace(/[€$£¥\s]/g, '');

    const num = parseFloat(cleaned);
    if (isNaN(num)) return null;

    return num.toString();
}

// ============================================================================
// PRESET DETECTION
// ============================================================================

const PRESET_PATTERNS: Record<string, string[]> = {
    'Binance': ['UTC_Time', 'Account', 'Operation', 'Coin', 'Change', 'Remark'],
    'Binance-Spot': ['Date(UTC)', 'Pair', 'Side', 'Price', 'Executed', 'Amount', 'Fee'],
    'Bitget': ['Time', 'Symbol', 'Side', 'Price', 'Filled', 'Total', 'Fee'],
    'Bourso': ['dateOp', 'dateVal', 'label', 'amount', 'accountBalance'],
    'BoursoBank-Alt': ['Date opération', 'Date valeur', 'Libellé', 'Montant', 'Solde'],
    'TradeRepublic': ['Date', 'Type', 'ISIN', 'Name', 'Shares', 'Price', 'Amount'],
    'Coinbase': ['Timestamp', 'Transaction Type', 'Asset', 'Quantity Transacted'],
    'Kraken': ['txid', 'time', 'type', 'pair', 'price', 'vol', 'fee']
};

/**
 * Detect preset from headers
 */
export function detectPreset(headers: string[]): { presetName: string; mappings: FieldMappings } | null {
    const lowerHeaders = headers.map(h => h.toLowerCase().trim());

    for (const [presetName, patterns] of Object.entries(PRESET_PATTERNS)) {
        const matches = patterns.filter(p =>
            lowerHeaders.some(h => h.includes(p.toLowerCase()))
        );

        if (matches.length >= Math.ceil(patterns.length * 0.6)) {
            return {
                presetName,
                mappings: getPresetMappings(presetName, headers)
            };
        }
    }

    return null;
}

/**
 * Get mappings for a known preset
 */
function getPresetMappings(presetName: string, headers: string[]): FieldMappings {
    const findHeader = (patterns: string[]): string => {
        for (const pattern of patterns) {
            const found = headers.find(h => h.toLowerCase().includes(pattern.toLowerCase()));
            if (found) return found;
        }
        return '';
    };

    switch (presetName) {
        case 'Binance':
            return {
                transactionDate: findHeader(['UTC_Time', 'time']),
                type: findHeader(['Operation', 'type']),
                rawType: findHeader(['Operation', 'type']),
                assetSymbol: findHeader(['Coin', 'asset']),
                amountPrimary: findHeader(['Change', 'amount']),
                rawLabel: findHeader(['Remark', 'note'])
            };

        case 'Bourso':
        case 'BoursoBank-Alt':
            return {
                transactionDate: findHeader(['dateOp', 'Date opération']),
                valueDate: findHeader(['dateVal', 'Date valeur']),
                rawLabel: findHeader(['label', 'Libellé']),
                amountPrimary: findHeader(['amount', 'Montant']),
                balanceAfter: findHeader(['accountBalance', 'Solde']),
                assetSymbol: 'EUR'
            };

        default:
            return {
                transactionDate: findHeader(['date', 'time', 'timestamp']),
                type: findHeader(['type', 'side', 'operation', 'action']),
                assetSymbol: findHeader(['symbol', 'asset', 'coin', 'ticker']),
                amountPrimary: findHeader(['amount', 'change', 'quantity', 'total']),
                priceUnit: findHeader(['price', 'prix']),
                feeAmount: findHeader(['fee', 'frais', 'commission'])
            };
    }
}

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
        if (mapping === undefined) return undefined;
        if (typeof mapping === 'number') return row[mapping];
        const idx = headers.indexOf(mapping);
        return idx >= 0 ? row[idx] : undefined;
    };

    // Parse each row
    const candidates: StagedTransaction[] = await Promise.all(rows.map(async (row, rowIndex) => {
        const originalRow: Record<string, string> = {};
        headers.forEach((h, i) => { originalRow[h] = row[i] || ''; });

        // Extract values
        const rawDateStr = getValue(row, mappings!.transactionDate) || '';
        const rawType = getValue(row, mappings!.type || mappings!.rawType) || '';
        const rawAmount = getValue(row, mappings!.amountPrimary) || '';
        const rawSymbol = getValue(row, mappings!.assetSymbol) || '';
        const rawFees = getValue(row, mappings!.feeAmount);

        // Parse date
        const transactionDate = parseDate(rawDateStr) ||
            (config.mode === 'snapshot' ? (config.referenceDate || new Date().toISOString()) : undefined);

        // Compute row hash
        const rowHash = await computeRowHash(
            transactionDate || '',
            parseDecimal(rawAmount) || '0',
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
            amountPrimary: parseDecimal(rawAmount) || undefined,
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
        if (valueDate) parsed.valueDate = parseDate(valueDate) || undefined;

        const priceUnit = getValue(row, mappings!.priceUnit);
        if (priceUnit) parsed.priceUnit = parseDecimal(priceUnit) || undefined;

        const quantity = getValue(row, mappings!.quantity);
        if (quantity) parsed.quantity = parseDecimal(quantity) || undefined;

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
                const instrument = await instrumentService.findOrCreateInstrument({
                    symbol: parsed.assetSymbol,
                    isin: parsed.assetIsin,
                    name: assetNameVal?.trim(),
                    exchange: exchangeVal?.trim(),
                    network: networkVal?.trim(),
                    contractAddress: contractAddressVal?.trim()
                });
                instrumentId = instrument.id;
                parsed.instrumentId = instrumentId;
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
        const resolvedInstrument = instrumentId ? db.getInstrumentById(instrumentId) : undefined;

        // Validate with instrument context
        const rowData: RowData = {
            transactionDate: parsed.transactionDate,
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
    referenceDate?: string
): Promise<CommitResult & { batch?: ImportBatch }> {
    await delay(300);

    const batchId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    // Filter transactions to import
    const toImport = transactions.filter(t =>
        t.resolution === 'import' ||
        (t.status === 'valid' && t.resolution === 'pending') ||
        (t.status === 'warning' && t.resolution === 'pending')
    );

    if (toImport.length === 0) {
        return {
            success: false,
            transactionCount: 0,
            batchId: null,
            error: 'No valid transactions to import'
        };
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
                delimiter: ',',
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
// MAPPING TEMPLATES
// ============================================================================

export async function saveMappingTemplate(
    name: string,
    mappings: FieldMappings,
    userId: string = 'default-user',
    instituteId?: string,
    dateFormat?: string,
    delimiter?: string
): Promise<MappingTemplate> {
    await delay(200);

    const now = new Date().toISOString();
    const template: MappingTemplate = {
        id: `tpl-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        ownerId: userId,
        name,
        instituteId,
        mappings: mappings as unknown as Record<string, string | number>,
        dateFormat,
        delimiter,
        isPreset: false,
        createdAt: now,
        updatedAt: now
    };

    const templates = db.getMappingTemplates();
    db.saveMappingTemplates([...templates, template]);

    return template;
}

export async function getMappingTemplates(): Promise<MappingTemplate[]> {
    await delay(100);
    return db.getMappingTemplates();
}

export async function deleteMappingTemplate(id: string): Promise<boolean> {
    await delay(100);
    const templates = db.getMappingTemplates();
    const filtered = templates.filter(t => t.id !== id);
    if (filtered.length === templates.length) return false;
    db.saveMappingTemplates(filtered);
    return true;
}

// ============================================================================
// BACKUP IMPORT & RESTORE (JSON) - Delegated to backupRestoreService
// ============================================================================

export {
    type BackupValidationResult,
    validateBackupContent,
    restoreBackupReset,
    mergeBackupData
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
    validateBackupContent,
    restoreBackupReset,
    mergeBackupData
};

