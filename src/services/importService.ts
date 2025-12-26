/**
 * Universal Financial Import Service
 * 
 * Core ETL logic for parsing heterogeneous CSV files into the UnifiedTransaction schema.
 * Supports History Mode (transaction replay) and Snapshot Mode (position averaging).
 */

import { db, delay } from './db';
import {
    UnifiedTransaction,
    TransactionType,
    ImportBatch,
    ImportMode,
    MappingTemplate,
    ImportBatchStatus
} from '../types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Field mapping configuration - maps CSV columns to UnifiedTransaction fields
 * Value can be column name (string) or column index (number)
 */
export interface FieldMappings {
    // Required fields
    transactionDate: string | number;
    amountPrimary: string | number;
    assetSymbol: string | number;

    // Type handling
    type?: string | number;
    rawType?: string | number;

    // Description
    label?: string | number;
    rawLabel?: string | number;

    // Trade fields
    priceUnit?: string | number;
    quantity?: string | number;
    assetIsin?: string | number;

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
 * Import configuration passed to parseFile
 */
export interface ImportConfig {
    accountId: string;
    mode: ImportMode;
    mappingTemplateId?: string;
    customMappings?: FieldMappings;
    dateFormat?: string;   // e.g., 'DD/MM/YYYY', 'YYYY-MM-DD'
    delimiter?: string;    // Auto-detected if not provided
}

/**
 * Validation error for a specific field
 */
export interface FieldError {
    field: string;
    message: string;
    severity: 'error' | 'warning';
}

/**
 * A staged transaction ready for review
 */
export interface StagedTransaction {
    id: string;
    rowIndex: number;
    originalRow: Record<string, string>;
    originalRowArray: string[];
    parsed: Partial<UnifiedTransaction>;
    status: 'valid' | 'error' | 'duplicate' | 'warning';
    errors: FieldError[];
    resolution: 'pending' | 'import' | 'skip';
}

/**
 * Result of parsing a file
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
    detectedPreset?: string;
    detectedDelimiter: string;
}

/**
 * Parsed CSV data structure
 */
export interface ParsedCSV {
    headers: string[];
    rows: string[][];
    delimiter: string;
}

// ============================================================================
// CSV PARSING
// ============================================================================

/**
 * Parse CSV text into structured data with auto-delimiter detection
 */
export const parseCSVText = (text: string, forcedDelimiter?: string): ParsedCSV => {
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
};

// ============================================================================
// TRANSACTION TYPE NORMALIZATION
// ============================================================================

/**
 * Normalize raw transaction type string to TransactionType enum
 */
export const normalizeTransactionType = (rawType: string): TransactionType => {
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

    // Income patterns (dividends, interest)
    if (lower.includes('dividend') || lower.includes('dividende') || lower.includes('interest') ||
        lower.includes('intérêt') || lower.includes('distribution') || lower.includes('staking') ||
        lower.includes('reward') || lower.includes('cashback') || lower.includes('saveback')) {
        return 'INCOME';
    }

    // Expense patterns (fees)
    if (lower.includes('fee') || lower.includes('frais') || lower.includes('commission') ||
        lower.includes('charge')) {
        return 'EXPENSE';
    }

    // Transfer patterns
    if (lower.includes('transfer') || lower.includes('virement') || lower.includes('send') ||
        lower.includes('receive') || lower.includes('envoi')) {
        return 'TRANSFER';
    }

    // Swap patterns (crypto)
    if (lower.includes('swap') || lower.includes('exchange') || lower.includes('convert') ||
        lower.includes('small assets') || lower.includes('dust')) {
        return 'SWAP';
    }

    // Adjustment patterns
    if (lower.includes('adjust') || lower.includes('correction') || lower.includes('manual')) {
        return 'ADJUSTMENT';
    }

    // Default to BUY if unrecognized
    return 'BUY';
};

// ============================================================================
// SMART PRESET DETECTION
// ============================================================================

/**
 * Known header patterns for auto-detection
 */
const PRESET_PATTERNS: Record<string, string[]> = {
    'Binance': ['UTC_Time', 'Account', 'Operation', 'Coin', 'Change', 'Remark'],
    'Binance-Spot': ['Date(UTC)', 'Pair', 'Side', 'Price', 'Executed', 'Amount', 'Fee'],
    'Bitget': ['Time', 'Symbol', 'Side', 'Price', 'Filled', 'Total', 'Fee'],
    'Bourso': ['dateOp', 'dateVal', 'label', 'amount', 'accountBalance'],
    'BoursoBank-Alt': ['Date opération', 'Date valeur', 'Libellé', 'Montant', 'Solde'],
    'TradeRepublic': ['Date', 'Type', 'ISIN', 'Name', 'Shares', 'Price', 'Amount'],
    'Coinbase': ['Timestamp', 'Transaction Type', 'Asset', 'Quantity Transacted', 'Price at Transaction'],
    'Kraken': ['txid', 'time', 'type', 'pair', 'price', 'vol', 'fee']
};

/**
 * Detect preset based on CSV headers
 */
export const detectPreset = (headers: string[]): { presetName: string; template: MappingTemplate } | null => {
    const lowerHeaders = headers.map(h => h.toLowerCase().trim());

    for (const [presetName, patterns] of Object.entries(PRESET_PATTERNS)) {
        const matches = patterns.filter(p =>
            lowerHeaders.some(h => h.includes(p.toLowerCase()))
        );

        // If at least 60% of patterns match, consider it a match
        if (matches.length >= Math.ceil(patterns.length * 0.6)) {
            return {
                presetName,
                template: getPresetTemplate(presetName, headers)
            };
        }
    }

    return null;
};

/**
 * Get mapping template for a known preset
 */
const getPresetTemplate = (presetName: string, headers: string[]): MappingTemplate => {
    const findHeader = (patterns: string[]): string => {
        for (const pattern of patterns) {
            const found = headers.find(h => h.toLowerCase().includes(pattern.toLowerCase()));
            if (found) return found;
        }
        return '';
    };

    const now = new Date().toISOString();

    switch (presetName) {
        case 'Binance':
            return {
                id: `preset-${presetName}`,
                name: presetName,
                mappings: {
                    transactionDate: findHeader(['UTC_Time', 'time']),
                    type: findHeader(['Operation', 'type']),
                    rawType: findHeader(['Operation', 'type']),
                    assetSymbol: findHeader(['Coin', 'asset']),
                    amountPrimary: findHeader(['Change', 'amount']),
                    rawLabel: findHeader(['Remark', 'note'])
                },
                dateFormat: 'YYYY-MM-DD HH:mm:ss',
                delimiter: ',',
                createdAt: now,
                updatedAt: now
            };

        case 'Bourso':
        case 'BoursoBank-Alt':
            return {
                id: `preset-${presetName}`,
                name: presetName,
                mappings: {
                    transactionDate: findHeader(['dateOp', 'Date opération']),
                    valueDate: findHeader(['dateVal', 'Date valeur']),
                    rawLabel: findHeader(['label', 'Libellé']),
                    amountPrimary: findHeader(['amount', 'Montant']),
                    balanceAfter: findHeader(['accountBalance', 'Solde']),
                    assetSymbol: 'EUR' // Default for BoursoBank
                },
                dateFormat: 'DD/MM/YYYY',
                delimiter: ';',
                createdAt: now,
                updatedAt: now
            };

        default:
            // Generic template with auto-detection
            return {
                id: `preset-${presetName}`,
                name: presetName,
                mappings: {
                    transactionDate: findHeader(['date', 'time', 'timestamp']),
                    type: findHeader(['type', 'side', 'operation', 'action']),
                    assetSymbol: findHeader(['symbol', 'asset', 'coin', 'ticker']),
                    amountPrimary: findHeader(['amount', 'change', 'quantity', 'total']),
                    priceUnit: findHeader(['price', 'prix']),
                    feeAmount: findHeader(['fee', 'frais', 'commission'])
                },
                createdAt: now,
                updatedAt: now
            };
    }
};

// ============================================================================
// DATE PARSING
// ============================================================================

/**
 * Parse date string with format detection
 */
export const parseDate = (dateStr: string, formatHint?: string): string | null => {
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
};

/**
 * Parse decimal string, handling various formats
 */
export const parseDecimal = (value: string | undefined): string | null => {
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
};

// ============================================================================
// ROW VALIDATION
// ============================================================================

/**
 * Validate a parsed row and return errors
 */
const validateRow = (
    parsed: Partial<UnifiedTransaction>,
    mode: ImportMode
): FieldError[] => {
    const errors: FieldError[] = [];

    // Required: transactionDate
    if (!parsed.transactionDate) {
        errors.push({ field: 'transactionDate', message: 'Date is required', severity: 'error' });
    }

    // Required: amountPrimary
    if (!parsed.amountPrimary) {
        errors.push({ field: 'amountPrimary', message: 'Amount is required', severity: 'error' });
    }

    // Required: assetSymbol
    if (!parsed.assetSymbol) {
        errors.push({ field: 'assetSymbol', message: 'Asset symbol is required', severity: 'error' });
    }

    // Warning: rawLabel recommended
    if (!parsed.rawLabel && !parsed.label) {
        errors.push({ field: 'rawLabel', message: 'Description recommended for audit', severity: 'warning' });
    }

    // Snapshot mode: quantity or amount required for position
    if (mode === 'snapshot' && !parsed.quantity && !parsed.amountPrimary) {
        errors.push({ field: 'quantity', message: 'Quantity required for snapshot mode', severity: 'error' });
    }

    return errors;
};

// ============================================================================
// DUPLICATE DETECTION
// ============================================================================

/**
 * Check if a transaction is a duplicate based on external_id or signature
 */
const checkDuplicate = (
    parsed: Partial<UnifiedTransaction>,
    existingTxs: UnifiedTransaction[]
): boolean => {
    // Check by external_id first (most reliable)
    if (parsed.externalId) {
        return existingTxs.some(tx => tx.externalId === parsed.externalId);
    }

    // Fallback: signature-based matching (date + amount + symbol + type)
    return existingTxs.some(tx => {
        const sameDate = tx.transactionDate?.substring(0, 10) === parsed.transactionDate?.substring(0, 10);
        const sameAmount = tx.amountPrimary === parsed.amountPrimary;
        const sameSymbol = tx.assetSymbol === parsed.assetSymbol;
        const sameType = tx.type === parsed.type;

        return sameDate && sameAmount && sameSymbol && sameType;
    });
};

// ============================================================================
// CORE PARSING FUNCTION
// ============================================================================

/**
 * Parse a CSV file into staged transactions
 */
export const parseFile = async (
    csvText: string,
    config: ImportConfig
): Promise<ParseResult> => {
    await delay(300); // Simulate processing time

    // Parse CSV
    const { headers, rows, delimiter } = parseCSVText(csvText, config.delimiter);

    // Detect preset if no mapping provided
    let mappings = config.customMappings;
    let detectedPreset: string | undefined;

    if (!mappings) {
        if (config.mappingTemplateId) {
            // Load saved template
            const templates = db.getMappingTemplates();
            const template = templates.find(t => t.id === config.mappingTemplateId);
            if (template) {
                mappings = template.mappings as FieldMappings;
            }
        }

        if (!mappings) {
            // Try auto-detection
            const detected = detectPreset(headers);
            if (detected) {
                mappings = detected.template.mappings as FieldMappings;
                detectedPreset = detected.presetName;
            }
        }
    }

    if (!mappings) {
        return {
            candidates: [],
            stats: { total: rows.length, valid: 0, errors: rows.length, duplicates: 0, warnings: 0 },
            headers,
            detectedDelimiter: delimiter
        };
    }

    // Get existing transactions for duplicate detection
    const existingTxs = db.getUnifiedTransactions();

    // Helper to get value from row
    const getValue = (row: string[], mapping: string | number | undefined): string | undefined => {
        if (mapping === undefined) return undefined;
        if (typeof mapping === 'number') return row[mapping];
        const idx = headers.indexOf(mapping);
        return idx >= 0 ? row[idx] : undefined;
    };

    // Parse each row
    const candidates: StagedTransaction[] = rows.map((row, rowIndex) => {
        const originalRow: Record<string, string> = {};
        headers.forEach((h, i) => { originalRow[h] = row[i] || ''; });

        // Extract and parse values
        const rawDateStr = getValue(row, mappings!.transactionDate);
        const rawType = getValue(row, mappings!.type || mappings!.rawType) || '';
        const rawAmount = getValue(row, mappings!.amountPrimary);
        const rawSymbol = getValue(row, mappings!.assetSymbol);

        // Build parsed transaction
        const parsed: Partial<UnifiedTransaction> = {
            id: `staged-${Date.now()}-${rowIndex}-${Math.random().toString(36).substr(2, 6)}`,
            transactionDate: parseDate(rawDateStr || '') || (config.mode === 'snapshot' ? new Date().toISOString() : undefined),
            type: normalizeTransactionType(rawType),
            rawType: rawType || 'Unknown',
            amountPrimary: parseDecimal(rawAmount) || undefined,
            assetSymbol: rawSymbol?.toUpperCase().trim() || undefined,
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

        // Snapshot mode: calculate invested amount if needed
        if (config.mode === 'snapshot' && parsed.quantity && parsed.priceUnit) {
            const qty = parseFloat(parsed.quantity);
            const price = parseFloat(parsed.priceUnit);
            if (!isNaN(qty) && !isNaN(price)) {
                parsed.amountPrimary = (qty * price).toString();
                parsed.type = 'BUY'; // Snapshot creates synthetic buy
            }
        }

        // Store raw row in metadata
        parsed.metadata = { ...originalRow };

        // Validate
        const errors = validateRow(parsed, config.mode);
        const hasErrors = errors.some(e => e.severity === 'error');
        const hasWarnings = errors.some(e => e.severity === 'warning');

        // Check duplicate
        const isDuplicate = !hasErrors && checkDuplicate(parsed, existingTxs);

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
            status,
            errors,
            resolution: isDuplicate ? 'skip' : 'pending'
        };
    });

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
        detectedPreset,
        detectedDelimiter: delimiter
    };
};

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Commit staged transactions as a batch
 */
export const commitBatch = async (
    transactions: StagedTransaction[],
    accountId: string,
    mode: ImportMode,
    fileName: string
): Promise<ImportBatch> => {
    await delay(500);

    const batchId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    // Filter to only import resolved transactions
    const toImport = transactions.filter(t =>
        t.resolution === 'import' ||
        (t.status === 'valid' && t.resolution === 'pending') ||
        (t.status === 'warning' && t.resolution === 'pending')
    );

    // Convert to UnifiedTransaction
    const unifiedTxs: UnifiedTransaction[] = toImport.map(staged => ({
        id: `utx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        batchId,
        ...staged.parsed,
        transactionDate: staged.parsed.transactionDate || now,
        type: staged.parsed.type || 'BUY',
        rawType: staged.parsed.rawType || 'Unknown',
        amountPrimary: staged.parsed.amountPrimary || '0',
        assetSymbol: staged.parsed.assetSymbol || 'UNKNOWN',
        rawLabel: staged.parsed.rawLabel || staged.parsed.label || ''
    } as UnifiedTransaction));

    // Save to DB
    const existing = db.getUnifiedTransactions();
    db.saveUnifiedTransactions([...unifiedTxs, ...existing]);

    // Create batch record
    const newBatch: ImportBatch = {
        id: batchId,
        accountId,
        importMode: mode,
        fileName,
        transactionCount: unifiedTxs.length,
        importedAt: now,
        status: 'completed',
        metadata: {
            totalRows: transactions.length,
            skipped: transactions.length - toImport.length
        }
    };

    const batches = db.getImportBatches();
    db.saveImportBatches([newBatch, ...batches]);

    return newBatch;
};

/**
 * Rollback an import batch
 */
export const rollbackBatch = async (batchId: string): Promise<{ deleted: number; batch: ImportBatch | null }> => {
    await delay(300);

    // Delete transactions
    const deletedCount = db.deleteTransactionsByBatch(batchId);

    // Update batch status
    const batches = db.getImportBatches();
    const batchIndex = batches.findIndex(b => b.id === batchId);

    if (batchIndex >= 0) {
        batches[batchIndex] = {
            ...batches[batchIndex],
            status: 'rolled_back' as ImportBatchStatus
        };
        db.saveImportBatches(batches);
        return { deleted: deletedCount, batch: batches[batchIndex] };
    }

    return { deleted: deletedCount, batch: null };
};

/**
 * Get import history
 */
export const getImportHistory = async (): Promise<ImportBatch[]> => {
    await delay(100);
    return db.getImportBatches();
};

// ============================================================================
// MAPPING TEMPLATE OPERATIONS
// ============================================================================

/**
 * Save a custom mapping template
 */
export const saveMappingTemplate = async (
    name: string,
    mappings: FieldMappings,
    instituteId?: string,
    dateFormat?: string,
    delimiter?: string
): Promise<MappingTemplate> => {
    await delay(200);

    const now = new Date().toISOString();
    const template: MappingTemplate = {
        id: `tpl-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        name,
        instituteId,
        mappings: mappings as Record<string, string | number>,
        dateFormat,
        delimiter,
        createdAt: now,
        updatedAt: now
    };

    const templates = db.getMappingTemplates();
    db.saveMappingTemplates([...templates, template]);

    return template;
};

/**
 * Get all mapping templates
 */
export const getMappingTemplates = async (): Promise<MappingTemplate[]> => {
    await delay(100);
    return db.getMappingTemplates();
};

/**
 * Delete a mapping template
 */
export const deleteMappingTemplate = async (id: string): Promise<boolean> => {
    await delay(100);
    const templates = db.getMappingTemplates();
    const filtered = templates.filter(t => t.id !== id);
    if (filtered.length === templates.length) return false;
    db.saveMappingTemplates(filtered);
    return true;
};

// ============================================================================
// EXPORT UTILITIES
// ============================================================================

/**
 * Generate CSV for invalid rows (for offline fixing)
 */
export const generateInvalidRowsCSV = (
    candidates: StagedTransaction[],
    headers: string[]
): string => {
    const invalidRows = candidates.filter(c => c.status === 'error');

    if (invalidRows.length === 0) return '';

    // Add error column
    const csvHeaders = [...headers, 'IMPORT_ERRORS'];
    const lines = [csvHeaders.join(',')];

    invalidRows.forEach(row => {
        const values = row.originalRowArray.map(v => `"${v.replace(/"/g, '""')}"`);
        const errorMsg = row.errors.map(e => `${e.field}: ${e.message}`).join('; ');
        values.push(`"${errorMsg}"`);
        lines.push(values.join(','));
    });

    return lines.join('\n');
};

// ============================================================================
// EXPORT SERVICE OBJECT
// ============================================================================

export const importService = {
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
    generateInvalidRowsCSV
};
