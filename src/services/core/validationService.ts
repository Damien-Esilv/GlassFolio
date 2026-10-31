/**
 * Validation Service - Business Rule Validation
 * 
 * Comprehensive validation for import data according to French financial regulations.
 * All validation rules are centralized here for consistency.
 */

import {
    TransactionType,
    ImportMode,
    InstrumentType,
    VALID_CURRENCIES,
    VALID_FIAT_CURRENCIES,
    VALID_CRYPTO_SYMBOLS,
    ISIN_REGEX
} from '../../types/types.backend';

// Define locally to avoid circular import issues
export interface FieldError {
    field: string;
    message: string;
    severity: 'error' | 'warning';
    code?: string;
    /** Interpolation values for the i18n message `common:errors.importValidation.<code>` */
    params?: Record<string, string>;
}

export interface RowValidationResult {
    isValid: boolean;
    errors: FieldError[];
    warnings: FieldError[];
}

// ============================================================================
// VALIDATION RULES
// ============================================================================

/**
 * Validate a transaction date
 */
export function validateDate(dateStr: string | undefined, fieldName: string = 'transactionDate'): FieldError[] {
    const errors: FieldError[] = [];

    if (!dateStr || dateStr.trim() === '') {
        errors.push({
            field: fieldName,
            message: 'Date is required',
            severity: 'error',
            code: 'DATE_REQUIRED'
        });
        return errors;
    }

    const date = new Date(dateStr);

    if (isNaN(date.getTime())) {
        errors.push({
            field: fieldName,
            message: 'Invalid date format',
            severity: 'error',
            code: 'DATE_INVALID'
        });
        return errors;
    }

    // Check for future dates (more than 1 day ahead to account for timezones)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date > tomorrow) {
        errors.push({
            field: fieldName,
            message: 'Date cannot be in the future',
            severity: 'error',
            code: 'DATE_FUTURE'
        });
    }

    // Check for unreasonably old dates (before 1970)
    if (date.getFullYear() < 1970) {
        errors.push({
            field: fieldName,
            message: 'Date is too old (before 1970)',
            severity: 'warning',
            code: 'DATE_TOO_OLD'
        });
    }

    return errors;
}

/**
 * Validate quantity
 */
export function validateQuantity(
    quantity: string | undefined,
    type: TransactionType,
    fieldName: string = 'quantity'
): FieldError[] {
    const errors: FieldError[] = [];

    // Quantity is optional for some transaction types
    const requiresQuantity = ['BUY', 'SELL', 'SWAP'].includes(type);

    if (!quantity && requiresQuantity) {
        errors.push({
            field: fieldName,
            message: 'Quantity is required for buy/sell transactions',
            severity: 'error',
            code: 'QTY_REQUIRED'
        });
        return errors;
    }

    if (quantity) {
        const qty = parseFloat(quantity);

        if (isNaN(qty)) {
            errors.push({
                field: fieldName,
                message: 'Quantity must be a valid number',
                severity: 'error',
                code: 'QTY_INVALID'
            });
        } else if (qty < 0) {
            errors.push({
                field: fieldName,
                message: 'Quantity cannot be negative',
                severity: 'error',
                code: 'QTY_NEGATIVE'
            });
        } else if (qty === 0 && requiresQuantity) {
            errors.push({
                field: fieldName,
                message: 'Quantity cannot be zero for this transaction type',
                severity: 'error',
                code: 'QTY_ZERO'
            });
        }
    }

    return errors;
}

/**
 * Validate price
 */
export function validatePrice(
    price: string | undefined,
    type: TransactionType,
    fieldName: string = 'priceUnit'
): FieldError[] {
    const errors: FieldError[] = [];

    // Price is optional for some transaction types
    const requiresPrice = ['BUY', 'SELL'].includes(type);

    if (!price && requiresPrice) {
        errors.push({
            field: fieldName,
            message: 'Price is recommended for buy/sell transactions',
            severity: 'warning',
            code: 'PRICE_MISSING'
        });
        return errors;
    }

    if (price) {
        const p = parseFloat(price);

        if (isNaN(p)) {
            errors.push({
                field: fieldName,
                message: 'Price must be a valid number',
                severity: 'error',
                code: 'PRICE_INVALID'
            });
        } else if (p < 0) {
            errors.push({
                field: fieldName,
                message: 'Price cannot be negative',
                severity: 'error',
                code: 'PRICE_NEGATIVE'
            });
        } else if (p === 0 && requiresPrice) {
            errors.push({
                field: fieldName,
                message: 'Price is zero - please verify',
                severity: 'warning',
                code: 'PRICE_ZERO'
            });
        }
    }

    return errors;
}

/**
 * Validate amount
 */
export function validateAmount(
    amount: string | undefined,
    fieldName: string = 'amountPrimary'
): FieldError[] {
    const errors: FieldError[] = [];

    if (!amount || amount.trim() === '') {
        errors.push({
            field: fieldName,
            message: 'Amount is required',
            severity: 'error',
            code: 'AMOUNT_REQUIRED'
        });
        return errors;
    }

    const a = parseFloat(amount);

    if (isNaN(a)) {
        errors.push({
            field: fieldName,
            message: 'Amount must be a valid number',
            severity: 'error',
            code: 'AMOUNT_INVALID'
        });
    }
    // Note: Amount can be negative (outflow) or positive (inflow)

    return errors;
}

/**
 * Validate currency — strict ISO 4217 for transaction currencies.
 * Asset symbols (stock tickers, crypto) are validated separately.
 */
export function validateCurrency(
    currency: string | undefined,
    fieldName: string = 'currency',
    strictISO: boolean = false
): FieldError[] {
    const errors: FieldError[] = [];

    if (!currency || currency.trim() === '') {
        errors.push({
            field: fieldName,
            message: 'Currency/Asset symbol is required',
            severity: 'error',
            code: 'CURRENCY_REQUIRED'
        });
        return errors;
    }

    const normalized = currency.toUpperCase().trim();

    if (strictISO) {
        // Strict mode: must be a valid ISO 4217 fiat currency
        if (!VALID_FIAT_CURRENCIES.includes(normalized as typeof VALID_FIAT_CURRENCIES[number])) {
            errors.push({
                field: fieldName,
                message: `Currency must be ISO 4217. Got: ${normalized}`,
                severity: 'error',
                code: 'CURRENCY_NOT_ISO',
                params: { value: normalized }
            });
        }
    } else {
        // Permissive mode: accept known currencies and crypto, warn on unknown
        if (!VALID_CURRENCIES.includes(normalized as typeof VALID_CURRENCIES[number])) {
            // Check if it looks like a stock ticker (2-5 uppercase letters)
            if (!/^[A-Z]{1,5}$/.test(normalized) && !/^[A-Z]{2,10}\d*$/.test(normalized)) {
                errors.push({
                    field: fieldName,
                    message: `Unknown currency/asset code: ${normalized}`,
                    severity: 'warning',
                    code: 'CURRENCY_UNKNOWN',
                    params: { value: normalized }
                });
            }
        }
    }

    return errors;
}

/**
 * Validate ISIN code — regex format + Luhn check digit.
 */
export function validateISIN(
    isin: string | undefined,
    fieldName: string = 'assetIsin'
): FieldError[] {
    const errors: FieldError[] = [];

    if (!isin) return errors; // ISIN is optional

    const normalized = isin.toUpperCase().trim();

    if (!ISIN_REGEX.test(normalized)) {
        errors.push({
            field: fieldName,
            message: 'Invalid ISIN format (expected: 2 letters + 9 alphanumeric + 1 check digit)',
            severity: 'error',
            code: 'ISIN_FORMAT_INVALID'
        });
        return errors;
    }

    // Luhn check digit validation
    if (!validateISINCheckDigit(normalized)) {
        errors.push({
            field: fieldName,
            message: `ISIN check digit invalid: ${normalized}`,
            severity: 'warning',
            code: 'ISIN_CHECKDIGIT_INVALID',
            params: { value: normalized }
        });
    }

    return errors;
}

/**
 * ISIN Luhn check digit algorithm.
 * Converts letters to numbers (A=10, B=11, ..., Z=35), concatenates,
 * then applies Luhn mod-10 on the resulting digit string.
 */
function validateISINCheckDigit(isin: string): boolean {
    // Convert each character to its numeric value
    let digits = '';
    for (const char of isin) {
        if (char >= '0' && char <= '9') {
            digits += char;
        } else {
            // A=10, B=11, ..., Z=35
            digits += (char.charCodeAt(0) - 55).toString();
        }
    }

    // Standard Luhn algorithm on the digit string
    let sum = 0;
    let alternate = false;
    for (let i = digits.length - 1; i >= 0; i--) {
        let n = parseInt(digits[i], 10);
        if (alternate) {
            n *= 2;
            if (n > 9) n -= 9;
        }
        sum += n;
        alternate = !alternate;
    }

    return sum % 10 === 0;
}

/**
 * Validate fees
 */
export function validateFees(
    feeAmount: string | undefined,
    transactionAmount: string | undefined,
    fieldName: string = 'feeAmount'
): FieldError[] {
    const errors: FieldError[] = [];

    if (!feeAmount) return errors; // Fees are optional

    const fee = parseFloat(feeAmount);

    if (isNaN(fee)) {
        errors.push({
            field: fieldName,
            message: 'Fee must be a valid number',
            severity: 'error',
            code: 'FEE_INVALID'
        });
        return errors;
    }

    if (fee < 0) {
        errors.push({
            field: fieldName,
            message: 'Fee cannot be negative',
            severity: 'error',
            code: 'FEE_NEGATIVE'
        });
    }

    // Check if fee is unreasonably high compared to transaction
    if (transactionAmount) {
        const amount = Math.abs(parseFloat(transactionAmount));
        if (!isNaN(amount) && amount > 0 && fee > amount * 0.5) {
            errors.push({
                field: fieldName,
                message: 'Fee is more than 50% of transaction amount - please verify',
                severity: 'warning',
                code: 'FEE_HIGH'
            });
        }
    }

    return errors;
}

/**
 * Validate asset identification (at least symbol or ISIN required)
 * @deprecated Use validateInstrumentIdentification for type-aware validation
 */
export function validateAssetIdentification(
    symbol: string | undefined,
    isin: string | undefined
): FieldError[] {
    const errors: FieldError[] = [];

    if (!symbol && !isin) {
        errors.push({
            field: 'assetSymbol',
            message: 'At least asset symbol or ISIN is required',
            severity: 'error',
            code: 'ASSET_ID_REQUIRED'
        });
    }

    return errors;
}

/**
 * Validate instrument identification based on asset type.
 * Enforces mandatory identifiers per the instrument-centric model:
 *   stock/etf/fund → ISIN OR (symbol + exchange)
 *   crypto         → symbol + (exchange OR network OR contractAddress)
 *   cash           → currencyCode ISO 4217
 */
export function validateInstrumentIdentification(
    symbol: string | undefined,
    instrumentType: InstrumentType | undefined,
    opts?: {
        isin?: string;
        exchange?: string;
        network?: string;
        contractAddress?: string;
        currencyCode?: string;
    }
): FieldError[] {
    const errors: FieldError[] = [];

    // For actions/etfs/funds, we require symbol OR ISIN
    const isClassic = ['stock', 'etf', 'fund'].includes(instrumentType || '');

    if (isClassic) {
        if ((!symbol || symbol.trim() === '') && (!opts?.isin || opts.isin.trim() === '')) {
            errors.push({
                field: 'assetSymbol',
                message: 'Asset Symbol or ISIN Code is required',
                severity: 'error',
                code: 'IDENTIFIER_REQUIRED'
            });
            return errors;
        }
    } else {
        // For other types, symbol is strictly required
        if (!symbol || symbol.trim() === '') {
            errors.push({
                field: 'assetSymbol',
                message: 'Asset symbol is required',
                severity: 'error',
                code: 'SYMBOL_REQUIRED'
            });
            return errors;
        }
    }

    // If no type provided, we can only do basic validation
    if (!instrumentType) {
        return errors;
    }

    switch (instrumentType) {
        case 'stock':
        case 'etf':
        case 'fund': {
            const hasIsin = opts?.isin && ISIN_REGEX.test(opts.isin.toUpperCase());
            const hasSymbolAndExchange = symbol && opts?.exchange;
            if (!hasIsin && !hasSymbolAndExchange) {
                errors.push({
                    field: 'assetIdentification',
                    message: `${instrumentType.toUpperCase()} requires ISIN or (symbol + exchange)`,
                    // Market-data readiness only: the row is still a valid journal entry
                    severity: 'warning',
                    code: 'INSTRUMENT_ID_INSUFFICIENT',
                    params: { type: instrumentType.toUpperCase() }
                });
            }
            break;
        }
        case 'crypto': {
            const hasContext = opts?.exchange || opts?.network || opts?.contractAddress;
            if (!hasContext) {
                errors.push({
                    field: 'assetIdentification',
                    message: 'Crypto requires exchange, network, or contract address',
                    // Market-data readiness only: the row is still a valid journal entry
                    severity: 'warning',
                    code: 'CRYPTO_CONTEXT_REQUIRED'
                });
            }
            break;
        }
        case 'cash': {
            const code = opts?.currencyCode || symbol;
            if (!code || !VALID_FIAT_CURRENCIES.includes(
                code.toUpperCase() as typeof VALID_FIAT_CURRENCIES[number]
            )) {
                errors.push({
                    field: 'assetIdentification',
                    message: 'Cash instrument requires valid ISO 4217 currency code',
                    severity: 'error',
                    code: 'CASH_CURRENCY_INVALID'
                });
            }
            break;
        }
        // bond, other — best-effort, no hard errors
    }

    return errors;
}

// ============================================================================
// FULL ROW VALIDATION
// ============================================================================

export interface RowData {
    transactionDate?: string;
    valueDate?: string;
    type?: TransactionType;
    amountPrimary?: string;
    assetSymbol?: string;
    assetIsin?: string;
    priceUnit?: string;
    quantity?: string;
    feeAmount?: string;
    rawLabel?: string;
    label?: string;
    /** Instrument type for type-aware validation */
    instrumentType?: InstrumentType;
    /** Exchange for instrument identification */
    exchange?: string;
    /** Blockchain network for crypto */
    network?: string;
    /** Contract address for tokens */
    contractAddress?: string;
    /** ISO 4217 currency code for cash */
    currencyCode?: string;
}

/**
 * Validate a complete row of data.
 * Includes instrument-type-aware identification validation.
 */
export function validateRow(
    data: RowData,
    mode: ImportMode
): RowValidationResult {
    const allErrors: FieldError[] = [];

    // Date validation
    allErrors.push(...validateDate(data.transactionDate));
    if (data.valueDate) {
        allErrors.push(...validateDate(data.valueDate, 'valueDate'));
    }

    // Amount validation
    allErrors.push(...validateAmount(data.amountPrimary));

    // Instrument identification (type-aware if available)
    if (data.instrumentType) {
        allErrors.push(...validateInstrumentIdentification(
            data.assetSymbol,
            data.instrumentType,
            {
                isin: data.assetIsin,
                exchange: data.exchange,
                network: data.network,
                contractAddress: data.contractAddress,
                currencyCode: data.currencyCode
            }
        ));
    } else {
        // Fallback to basic asset identification
        allErrors.push(...validateAssetIdentification(data.assetSymbol, data.assetIsin));
    }

    // Currency/Symbol validation
    if (data.assetSymbol) {
        allErrors.push(...validateCurrency(data.assetSymbol));
    }

    // ISIN validation
    if (data.assetIsin) {
        allErrors.push(...validateISIN(data.assetIsin));
    }

    // Type-dependent validation
    const txType = data.type || 'BUY';
    allErrors.push(...validateQuantity(data.quantity, txType));
    allErrors.push(...validatePrice(data.priceUnit, txType));

    // Fee validation
    allErrors.push(...validateFees(data.feeAmount, data.amountPrimary));

    // Snapshot mode specific validation
    if (mode === 'snapshot') {
        if (!data.quantity) {
            allErrors.push({
                field: 'quantity',
                message: 'Quantity is required for snapshot mode',
                severity: 'error',
                code: 'SNAPSHOT_QTY_REQUIRED'
            });
        }
        if (!data.priceUnit) {
            allErrors.push({
                field: 'priceUnit',
                message: 'Average price is required for snapshot mode',
                severity: 'error',
                code: 'SNAPSHOT_PRICE_REQUIRED'
            });
        }
    }

    // Separate errors and warnings
    const errors = allErrors.filter(e => e.severity === 'error');
    const warnings = allErrors.filter(e => e.severity === 'warning');

    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
}

// ============================================================================
// POSITION VALIDATION
// ============================================================================

/**
 * Check if a sell would exceed current position
 */
export function validateSellQuantity(
    sellQuantity: string,
    currentPosition: string,
    symbol: string
): FieldError | null {
    const sell = parseFloat(sellQuantity);
    const position = parseFloat(currentPosition);

    if (isNaN(sell) || isNaN(position)) return null;

    if (sell > position) {
        return {
            field: 'quantity',
            message: `Cannot sell ${sell} ${symbol} - only ${position} available`,
            severity: 'error',
            code: 'OVERSELL',
            params: { sell: String(sell), symbol: String(symbol), position: String(position) }
        };
    }

    return null;
}

// ============================================================================
// EXPORT
// ============================================================================

export const validationService = {
    validateDate,
    validateQuantity,
    validatePrice,
    validateAmount,
    validateCurrency,
    validateISIN,
    validateFees,
    validateAssetIdentification,
    validateInstrumentIdentification,
    validateRow,
    validateSellQuantity
};
