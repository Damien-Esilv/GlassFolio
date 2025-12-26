/**
 * Backend Types for GlassFolio Multi-Asset Portfolio Management
 * 
 * These types implement the "Super-Schema" approach for unified transaction handling
 * across different asset types: Cash, Equity, Crypto, ETFs.
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
    | 'INCOME'      // Dividends, Interest, Staking rewards
    | 'EXPENSE'     // Fees, Commissions
    | 'TRANSFER'
    | 'SWAP'        // Crypto: ETH -> BTC
    | 'ADJUSTMENT'; // Manual adjustments, corrections

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
export type ImportBatchStatus = 'completed' | 'partial' | 'rolled_back';

/**
 * Import mode for data ingestion
 */
export type ImportMode = 'history' | 'snapshot';

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

    /** FK to Account - which account received the import */
    accountId: string;

    /** Mode A (history) or Mode B (snapshot) */
    importMode: ImportMode;

    /** Reference to saved mapping template if used */
    mappingTemplateId?: string;

    /** Original filename for reference */
    fileName: string;

    /** Number of transactions created by this import */
    transactionCount: number;

    /** ISO DateTime - when import was performed */
    importedAt: string;

    /** Current status of the batch */
    status: ImportBatchStatus;

    /** Additional import metadata (column mappings, etc.) */
    metadata?: Record<string, unknown>;
}

/**
 * UnifiedTransaction - The "Super-Schema" for all transaction types
 * 
 * This unified model stores data from traditional banks (Bourso, Fortuneo)
 * and Crypto Exchanges (Binance, Bitget) in a single structure.
 * 
 * Nullable fields handle type-specific data:
 * - asset_isin: Only for equities
 * - feeAsset: When fee currency differs from main asset (e.g., BNB burn for ETH purchase)
 * - valueDate: Crucial for traditional banks (interest calculation)
 */
export interface UnifiedTransaction {
    // === Core Identifiers ===

    /** UUID - Internal Primary Key */
    id: string;

    /** UUID - Links to ImportBatch for rollback capability */
    batchId: string;

    /** Source's ID (TXID, UUID) - Used for de-duplication */
    externalId?: string;

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

    // === Integrity ===

    /** 
     * Balance snapshot provided by bank after transaction
     * Used for integrity/reconciliation checks
     */
    balanceAfter?: string;

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

    /** ISO DateTime - when created */
    createdAt: string;

    /** ISO DateTime - last update */
    updatedAt: string;
}
