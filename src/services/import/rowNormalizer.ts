/**
 * Row Normalizer (TGLA-147)
 *
 * The single, pure path from one CSV row + a column mapping to a UnifiedTransaction draft.
 * It resolves what a row means (type from label and signs, decimal separator, currency,
 * unknown costs) without any I/O: instrument lookup, validation and duplicate detection stay
 * in importManager.parseFile, which is also what the wizard preview can call.
 */

import { VALID_FIAT_CURRENCIES } from '../../types/types.backend';
import type { ImportMode, TransactionType, UnifiedTransaction } from '../../types/types.backend';
import type { FieldMappings } from './importManager';
import type { FieldError } from './types';
import {
    parseDate,
    parseDecimal,
    detectDateFormat,
    detectDecimalSeparator,
    detectAmountSignConvention,
    resolveTransactionType,
    inferTransactionSubType
} from './typeNormalizer';
import type { DecimalSeparator } from './typeNormalizer';

/** Rows read to infer file-wide conventions (decimal separator, amount signs) */
const SAMPLE_ROW_LIMIT = 1000;

type Mapping = string | number | undefined;

export interface RowContext {
    mappings: FieldMappings;
    mode: ImportMode;
    /** Header name → column index (first occurrence wins) */
    columnIndex: Map<string, number>;
    dateHint?: string;
    decimalHint?: DecimalSeparator;
    /** The amount column mixes negative and positive cash flows */
    amountSigned: boolean;
    /** Amount and quantity are the same column (Binance statements: "Change" in coin units) */
    amountIsQuantity: boolean;
    referenceDate?: string;
    /** Currency of the target account: a row currency equal to it is not "original" */
    accountCurrency?: string;
}

export interface RowContextOptions {
    mode: ImportMode;
    dateFormat?: string;
    delimiter?: string;
    referenceDate?: string;
    accountCurrency?: string;
}

export interface NormalizedRow {
    parsed: Partial<UnifiedTransaction>;
    /** Text of the date cell, for the "unreadable date" message */
    rawDate: string;
    /** Problems found while reading the row (type guessing, unsupported corporate action, unknown cost) */
    issues: FieldError[];
    /** Inputs of the row hash, unchanged from the pre-normalizer engine so stored rows still match */
    hashParts: { date: string; amount: string; symbol: string; type: TransactionType; fee: string | undefined };
    /** Valid ISO 4217 code found in the currency column */
    currencyCode?: string;
    /** The row is about a currency (bank statement line), not a security */
    isCashAsset: boolean;
    /** Raw instrument hints for the instrument lookup */
    instrumentHints: { exchange?: string; network?: string; contractAddress?: string; assetName?: string };
}

const sameColumn = (a: Mapping, b: Mapping): boolean =>
    a !== undefined && a !== '' && a === b;

function cell(row: string[], mapping: Mapping, ctx: Pick<RowContext, 'columnIndex'>): string | undefined {
    if (mapping === undefined || mapping === '') return undefined;
    if (typeof mapping === 'number') return row[mapping];
    const index = ctx.columnIndex.get(mapping);
    return index !== undefined ? row[index] : undefined;
}

const absString = (value: string | null): string | undefined => {
    if (value === null) return undefined;
    return value.startsWith('-') ? value.slice(1) : value;
};

const isFiat = (symbol: string | undefined): boolean =>
    !!symbol && (VALID_FIAT_CURRENCIES as readonly string[]).includes(symbol);

/**
 * Read the file-wide conventions once: date order, decimal separator, amount signs.
 */
export function buildRowContext(
    headers: string[],
    rows: string[][],
    mappings: FieldMappings,
    options: RowContextOptions
): RowContext {
    const columnIndex = new Map<string, number>();
    headers.forEach((header, index) => {
        if (!columnIndex.has(header)) columnIndex.set(header, index);
    });

    const samples = (mapping: Mapping): string[] => {
        const values: string[] = [];
        for (const row of rows.slice(0, SAMPLE_ROW_LIMIT)) {
            const value = cell(row, mapping, { columnIndex });
            if (value !== undefined && value !== '') values.push(value);
        }
        return values;
    };

    const amountIsQuantity = sameColumn(mappings.amountPrimary, mappings.quantity);
    const dateHint = options.dateFormat
        || detectDateFormat(rows.map(row => cell(row, mappings.transactionDate, { columnIndex }) || ''));
    const decimalHint = detectDecimalSeparator([
        ...samples(mappings.quantity),
        ...samples(mappings.priceUnit),
        ...samples(mappings.amountPrimary),
        ...samples(mappings.feeAmount)
    ], options.delimiter);

    return {
        mappings,
        mode: options.mode,
        columnIndex,
        dateHint,
        decimalHint,
        amountIsQuantity,
        amountSigned: !amountIsQuantity && detectAmountSignConvention(samples(mappings.amountPrimary)) === 'signed',
        referenceDate: options.referenceDate,
        accountCurrency: options.accountCurrency?.toUpperCase()
    };
}

/**
 * Turn one CSV row into a transaction draft. Pure: no storage, no network, no clock
 * (except the snapshot-mode fallback date).
 */
export function normalizeRow(row: string[], ctx: RowContext): NormalizedRow {
    const { mappings, decimalHint } = ctx;
    const get = (mapping: Mapping): string | undefined => cell(row, mapping, ctx);
    const issues: FieldError[] = [];

    const rawDate = get(mappings.transactionDate) || '';
    const rawType = get(mappings.type || mappings.rawType) || '';
    const rawSymbol = get(mappings.assetSymbol) || '';
    const rawAmount = get(mappings.amountPrimary) || '';
    const rawFees = get(mappings.feeAmount);

    const transactionDate = parseDate(rawDate, ctx.dateHint)
        || (ctx.mode === 'snapshot' ? (ctx.referenceDate || new Date().toISOString()) : undefined);

    // Numbers keep their sign here: it carries the direction of the trade
    const quantitySigned = parseDecimal(get(mappings.quantity), decimalHint);
    const priceParsed = parseDecimal(get(mappings.priceUnit), decimalHint);
    const amountParsed = parseDecimal(rawAmount, decimalHint);
    const feeSigned = parseDecimal(rawFees, decimalHint);

    // Cash amount: explicit column, otherwise quantity × unit price. A column shared with the
    // quantity holds coin units, not money.
    const cashAmount = ctx.amountIsQuantity ? null : amountParsed;
    let derivedAmount: string | null = null;
    if (!cashAmount && quantitySigned && priceParsed) {
        derivedAmount = (Math.abs(parseFloat(quantitySigned)) * parseFloat(priceParsed)).toString();
    }
    let amountValue = cashAmount || derivedAmount;

    // Identity
    const assetIsin = get(mappings.assetIsin)?.trim() || undefined;
    const currencyRaw = get(mappings.currency)?.trim().toUpperCase();
    const currencyCode = currencyRaw && /^[A-Z]{3}$/.test(currencyRaw) ? currencyRaw : undefined;
    let assetSymbol = rawSymbol.toUpperCase().trim() || undefined;
    // No symbol and no ISIN: the currency column is the only identity (a bank statement line)
    if (!assetSymbol && !assetIsin && currencyCode) assetSymbol = currencyCode;
    const isCashAsset = !assetIsin && isFiat(assetSymbol);

    const resolution = resolveTransactionType({
        rawType,
        quantity: quantitySigned,
        amount: ctx.amountIsQuantity ? null : amountParsed,
        amountSigned: ctx.amountSigned,
        isCashAsset
    });
    let type = resolution.type;

    if (resolution.corporateAction) {
        issues.push({
            field: 'type',
            message: 'Splits and spin-offs are not supported as journal rows',
            severity: 'error',
            code: 'CORPORATE_ACTION_UNSUPPORTED'
        });
    } else if (rawType && !resolution.recognized) {
        issues.push({
            field: 'type',
            message: `Unknown transaction type: ${rawType}`,
            severity: resolution.source === 'default' ? 'error' : 'warning',
            code: 'TYPE_UNRECOGNIZED',
            params: { label: rawType, type }
        });
    } else if (!rawType && resolution.source === 'sign' && !isCashAsset) {
        // On a currency line the sign is the standard convention (money in / money out), not a guess
        issues.push({
            field: 'type',
            message: `No type in the file: read as ${type} from the sign of the quantity or amount`,
            severity: 'warning',
            code: 'TYPE_INFERRED',
            params: { type }
        });
    }

    const parsed: Partial<UnifiedTransaction> = {
        transactionDate,
        type,
        subType: inferTransactionSubType(rawType),
        rawType: rawType || 'Unknown',
        assetSymbol,
        sourceOrigin: 'FILE',
        isSynthetic: false,
        isFiscal: true,
        sourceMode: ctx.mode
    };

    if (assetIsin) parsed.assetIsin = assetIsin;

    const rawLabel = get(mappings.rawLabel);
    if (rawLabel) parsed.rawLabel = rawLabel;
    const label = get(mappings.label);
    if (label) parsed.label = label;

    const valueDate = get(mappings.valueDate);
    if (valueDate) parsed.valueDate = parseDate(valueDate, ctx.dateHint) || undefined;

    if (priceParsed) parsed.priceUnit = priceParsed;

    // Quantity and fees are magnitudes: the type says the direction
    if (quantitySigned) parsed.quantity = absString(quantitySigned);
    // No quantity column but amount and unit price: quantity = |amount| / price
    if (!parsed.quantity && amountValue && parsed.priceUnit && parseFloat(parsed.priceUnit) > 0) {
        parsed.quantity = (Math.abs(parseFloat(amountValue)) / parseFloat(parsed.priceUnit)).toString();
    }
    if (feeSigned) parsed.feeAmount = absString(feeSigned);

    // The file gives coin units only: no price, so no cost or proceeds
    if (ctx.amountIsQuantity && !amountValue) {
        amountValue = '0';
        const pricedType = !isCashAsset && (type === 'BUY' || type === 'DEPOSIT' || type === 'SELL');
        if (pricedType && parsed.quantity) {
            parsed.metadata = { costBasisUnknown: true };
            issues.push({
                field: 'amountPrimary',
                message: 'No price or cash amount in the file: cost basis or proceeds are unknown (set to 0)',
                severity: 'warning',
                code: 'COST_UNKNOWN'
            });
        }
    }
    if (amountValue) parsed.amountPrimary = amountValue;

    const feeAsset = get(mappings.feeAsset);
    if (feeAsset) parsed.feeAsset = feeAsset.toUpperCase().trim();

    const taxAmount = get(mappings.taxAmount);
    if (taxAmount) parsed.taxAmount = parseDecimal(taxAmount, decimalHint) || undefined;

    const balanceAfter = get(mappings.balanceAfter);
    if (balanceAfter) parsed.balanceAfter = parseDecimal(balanceAfter, decimalHint) || undefined;

    const externalId = get(mappings.externalId);
    if (externalId) parsed.externalId = externalId.trim();

    if (currencyCode && currencyCode !== ctx.accountCurrency) parsed.originalCurrency = currencyCode;

    // Snapshot mode: invested amount from quantity × price
    if (ctx.mode === 'snapshot' && parsed.quantity && parsed.priceUnit) {
        const qty = parseFloat(parsed.quantity);
        const price = parseFloat(parsed.priceUnit);
        if (!isNaN(qty) && !isNaN(price)) {
            parsed.amountPrimary = (qty * price).toString();
            parsed.type = 'BUY';
            type = 'BUY';
        }
    }

    return {
        parsed,
        rawDate,
        issues,
        hashParts: {
            date: transactionDate || '',
            amount: amountParsed || derivedAmount || '0',
            symbol: rawSymbol,
            type,
            fee: feeSigned ?? undefined
        },
        currencyCode,
        isCashAsset,
        instrumentHints: {
            exchange: get(mappings.exchange)?.trim(),
            network: get(mappings.network)?.trim(),
            contractAddress: get(mappings.contractAddress)?.trim(),
            assetName: get(mappings.assetName)?.trim()
        }
    };
}
