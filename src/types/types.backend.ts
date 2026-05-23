/**
 * Backend Types for GlassFolio Multi-Asset Portfolio Management
 * 
 * Production-grade types implementing the "Super-Schema" approach for unified transaction handling.
 * Compliant with French financial regulations and ACID transaction requirements.
 * 
 * Note: Decimal values are stored as strings to preserve precision.
 * Use a library like decimal.js or bignumber.js for arithmetic operations.
 */

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

/**
 * Unified transaction type enum covering all possible transaction types
 * across traditional banks, brokers, and crypto exchanges.
 */
export type TransactionType =
    | 'BUY'
    | 'SELL'
    | 'DEPOSIT'
    | 'WITHDRAW'
    | 'INCOME'              // Dividends, Interest, Staking rewards
    | 'EXPENSE'             // Fees, Commissions
    | 'TRANSFER'
    | 'SWAP'                // Crypto: ETH -> BTC
    | 'ADJUSTMENT'          // Legacy manual adjustments
    | 'BALANCE_ADJUSTMENT'  // Synthetic: reconcile balance differences
    | 'SNAPSHOT_ADJUSTMENT';// Synthetic: from snapshot import reconciliation

/**
 * Origin of the transaction data
 */
export type SourceOrigin =
    | 'FILE'      // Imported from CSV/file
    | 'API'       // Future: direct API integration
    | 'MANUAL'    // User manually entered
    | 'SYNTHETIC';// System-generated (reconciliation, adjustments)

/**
 * Import mode - how the data was ingested
 */
export type ImportMode = 'history' | 'snapshot';

/**
 * Type of financial institution
 */
export type InstituteType = 'bank' | 'exchange' | 'wallet' | 'broker' | 'other';

/**
 * Type of account within an institution
 */
export type AccountType =
    | 'checking'
    | 'savings'
    | 'investment'    // PEA, CTO, etc.
    | 'crypto_spot'
    | 'crypto_earn'
    | 'crypto_futures'
    | 'other';

/**
 * Status of an import batch
 */
export type ImportBatchStatus = 'pending' | 'completed' | 'partial' | 'rolled_back' | 'failed';

// ============================================================================
// CORE ENTITIES
// ============================================================================

/**
 * Institute - The entity holding assets
 * Examples: "BoursoBank", "Binance", "Ledger Nano X", "Société Générale"
 */
export interface Institute {
    /** UUID - Internal Primary Key */
    id: string;

    /** Owner ID for RLS (Row Level Security) */
    ownerId: string;

    /** Display name of the institution */
    name: string;

    /** Category of the institution */
    type: InstituteType;

    /** Whether this was created by the user (vs. predefined) */
    isCustom: boolean;

    /** Optional logo URL for display */
    logoUrl?: string;

    /** ISO DateTime - when created */
    createdAt: string;

    /** ISO DateTime - last update */
    updatedAt: string;
}

/**
 * Account - Sub-container within an Institute
 * Examples: "Main Checking", "PEA", "Spot Wallet", "Earn Wallet", "Livret A"
 * 
 * An account can hold multiple asset types (e.g., a Crypto wallet holds BTC, ETH, USDT)
 */
export interface Account {
    /** UUID - Internal Primary Key */
    id: string;

    /** Owner ID for RLS */
    ownerId: string;

    /** FK to Institute */
    instituteId: string;

    /** Display name of the account */
    name: string;

    /** Type of account */
    type: AccountType;

    /** Default currency for this account (EUR, USD, etc.) */
    defaultCurrency: string;

    /** Whether the account is currently active */
    isActive: boolean;

    /** Import mode preference for this account */
    preferredImportMode?: ImportMode;

    /** ISO DateTime - when created */
    createdAt: string;

    /** ISO DateTime - last update */
    updatedAt: string;
}

/**
 * ImportBatch - Tracks each file import for rollback capability
 * 
 * Each import generates a unique batch_id that links all transactions
 * from that import, enabling clean rollback operations.
 */
export interface ImportBatch {
    /** UUID - the batch_id used by transactions */
    id: string;

    /** Owner ID for RLS */
    ownerId: string;

    /** FK to Account - which account received the import */
    accountId: string;

    /** Mode A (history) or Mode B (snapshot) */
    importMode: ImportMode;

    /** Reference to saved mapping template if used */
    mappingTemplateId?: string;

    /** Original filename for reference */
    fileName: string;

    /** SHA-256 hash of the original file content for idempotence */
    fileHash: string;

    /** Number of transactions created by this import */
    transactionCount: number;

    /** Number of rows skipped (duplicates, errors) */
    skippedCount: number;

    /** ISO DateTime - when import was performed */
    importedAt: string;

    /** User ID who performed the import */
    importedBy: string;

    /** Current status of the batch */
    status: ImportBatchStatus;

    /** Engine version for reproducibility */
    engineVersion: string;

    /** Additional import metadata */
    metadata?: {
        /** Total rows in source file */
        totalRows?: number;
        /** Preset/template used */
        presetName?: string;
        /** Detected delimiter */
        delimiter?: string;
        /** Column mappings used */
        columnMappings?: Record<string, string | number>;
        /** Errors encountered */
        errors?: string[];
        /** Reference date for snapshot imports */
        referenceDate?: string;
    };
}

/**
 * UnifiedTransaction - The "Super-Schema" for all transaction types
 * 
 * This unified model stores data from traditional banks (Bourso, Fortuneo)
 * and Crypto Exchanges (Binance, Bitget) in a single structure.
 * 
 * CRITICAL: All financial transactions flow through this schema.
 */
export interface UnifiedTransaction {
    // === Core Identifiers ===

    /** UUID - Internal Primary Key */
    id: string;

    /** Owner ID for RLS */
    ownerId: string;

    /** UUID - Direct link to Account */
    accountId: string;

    /** UUID - Links to ImportBatch for rollback capability */
    batchId: string;

    /** 
     * SHA-256 hash of immutable fields for deduplication
     * Computed from: date + amount + symbol + type + fees
     */
    rowHash: string;

    /** Source's ID (TXID, UUID) - Used for de-duplication */
    externalId?: string;

    // === Origin & Flags ===

    /** How this transaction was created */
    sourceOrigin: SourceOrigin;

    /** 
     * Whether this is a synthetic/derived transaction
     * TRUE for: BALANCE_ADJUSTMENT, SNAPSHOT_ADJUSTMENT, reconciliation entries
     */
    isSynthetic: boolean;

    /**
     * Whether this transaction should be included in fiscal calculations
     * FALSE for: synthetic adjustments, internal transfers
     * TRUE for: real buy/sell transactions
     */
    isFiscal: boolean;

    /** Import mode that created this transaction */
    sourceMode: ImportMode;

    // === Temporal Data ===

    /** 
     * ISO DateTime UTC - Primary date of the transaction
     * If source has no time, default to 00:00:00
     */
    transactionDate: string;

    /** 
     * ISO DateTime - Value date for traditional banks
     * Crucial for interest calculation
     */
    valueDate?: string;

    // === Transaction Classification ===

    /** Normalized transaction type */
    type: TransactionType;

    /** 
     * Original string from CSV for audit
     * Examples: "Small Assets Exchange", "Saveback", "Virement reçu"
     */
    rawType: string;

    // === Description ===

    /** Cleaned/normalized description */
    label?: string;

    /** Original CSV description - preserved for audit */
    rawLabel: string;

    // === Primary Amount ===

    /** 
     * Main impact on account balance (Signed)
     * Stored as string to preserve decimal precision
     */
    amountPrimary: string;

    /** 
     * Asset symbol: EUR, USD, BTC, AAPL
     * For cash, this is the currency code
     * For stocks, this is the ticker
     * For crypto, this is the coin symbol
     */
    assetSymbol: string;

    /** 
     * ISIN code for equities
     * Example: US0378331005 (Apple Inc.)
     */
    assetIsin?: string;

    // === Trade Details ===

    /** Execution price per unit (Decimal as string) */
    priceUnit?: string;

    /** 
     * Quantity traded
     * MUST support up to 10 decimals for Crypto/Fractional Shares
     * Example: "0.0000000001" for small crypto amounts
     */
    quantity?: string;

    // === Fees & Taxes ===

    /** Explicit fees paid (Decimal as string) */
    feeAmount?: string;

    /** 
     * Currency of the fee
     * Can differ from main asset (e.g., BNB burn for ETH purchase)
     */
    feeAsset?: string;

    /** 
     * Withholding tax
     * Examples: Flat Tax, Dividend tax
     */
    taxAmount?: string;

    // === FX Data ===

    /** Original currency if different from account currency */
    originalCurrency?: string;

    /** Exchange rate used for conversion */
    fxRate?: string;

    // === Integrity ===

    /** 
     * Balance snapshot provided by bank after transaction
     * Used for integrity/reconciliation checks
     */
    balanceAfter?: string;

    // === Audit ===

    /** ISO DateTime - when this record was created in our system */
    createdAt: string;

    /** ISO DateTime - last update (should be rare for append-only) */
    updatedAt: string;

    /** Version number for optimistic locking */
    version: number;

    // === Raw Data ===

    /** 
     * Bank-specific raw row data
     * Stores the complete original CSV row for audit/debugging
     */
    metadata?: Record<string, unknown>;
}

// ============================================================================
// MAPPING TEMPLATES (for Import UX)
// ============================================================================

/**
 * Saved mapping template for file imports
 * Allows users to save column mappings for reuse (e.g., "My Binance Export")
 */
export interface MappingTemplate {
    /** UUID */
    id: string;

    /** Owner ID for RLS */
    ownerId: string;

    /** User-friendly name: "Binance Export", "Bourso CSV" */
    name: string;

    /** Which institute this template is for (optional) */
    instituteId?: string;

    /** Column mappings: fieldName -> CSV column name/index */
    mappings: Record<string, string | number>;

    /** Date format string if custom: "YYYY-MM-DD", "DD/MM/YYYY" */
    dateFormat?: string;

    /** CSV delimiter if non-standard */
    delimiter?: string;

    /** Whether this is a system preset */
    isPreset: boolean;

    /** ISO DateTime - when created */
    createdAt: string;

    /** ISO DateTime - last update */
    updatedAt: string;
}

// ============================================================================
// ASSET POSITION (Derived/Cached)
// ============================================================================

/**
 * AssetPosition - Cached position derived from transactions
 * This is a DERIVED entity, recalculated from the transaction journal.
 */
export interface AssetPosition {
    /** UUID */
    id: string;

    /** Owner ID for RLS */
    ownerId: string;

    /** Account holding this position */
    accountId: string;

    /** Asset identifier (symbol or ISIN) */
    assetKey: string;

    /** Asset symbol */
    assetSymbol?: string;

    /** Asset ISIN */
    assetIsin?: string;

    /** Display name */
    displayName: string;

    /** Current quantity held */
    quantity: string;

    /** 
     * Average cost per unit (PRU/PMP)
     * Includes fees as per French regulation
     */
    avgCost: string;

    /** Total cost basis */
    totalCost: string;

    /** Total fees paid for this position */
    totalFees: string;

    /** Last known market price */
    lastPrice: string;

    /** Current market value */
    marketValue: string;

    /** Unrealized P&L */
    unrealizedPL: string;

    /** Unrealized P&L percentage */
    unrealizedPLPercent: string;

    /** Currency of the position */
    currency: string;

    /** Asset type */
    assetType: 'equity' | 'etf' | 'crypto' | 'cash' | 'bond' | 'other';

    /** 
     * How this position was primarily established
     * 'history' = from transaction imports
     * 'snapshot' = from snapshot import
     * 'mixed' = combination of both (requires careful handling)
     */
    sourceMode: ImportMode | 'mixed';

    /** ISO DateTime - when position was first opened */
    firstTransactionDate: string;

    /** ISO DateTime - last transaction affecting this position */
    lastTransactionDate: string;

    /** ISO DateTime - when this cache was last updated */
    lastCalculatedAt: string;
}

// ============================================================================
// VALIDATION TYPES
// ============================================================================

/**
 * Field validation error
 */
export interface FieldError {
    field: string;
    message: string;
    severity: 'error' | 'warning';
    code?: string;
}

/**
 * Validation result for a single row
 */
export interface RowValidationResult {
    isValid: boolean;
    errors: FieldError[];
    warnings: FieldError[];
}

// ============================================================================
// ENGINE CONSTANTS
// ============================================================================

/** Current engine version for audit trail */
export const ENGINE_VERSION = '2.0.0';

/** Valid ISO 4217 currency codes (common subset) */
export const VALID_CURRENCIES = [
    'EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'CNY', 'HKD', 'SGD',
    'BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'XRP', 'ADA', 'SOL', 'DOT', 'DOGE'
] as const;

/** ISIN validation regex */
export const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
