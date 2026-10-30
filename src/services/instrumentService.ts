/**
 * Instrument Service — Manages the Instrument entity lifecycle.
 *
 * Instruments are created dynamically during CSV import from user-provided data.
 * The service validates market-readiness based on InstrumentType rules:
 *   stock/etf/fund  → ISIN OR (symbol + exchange) required
 *   crypto          → symbol + (exchange OR network OR contractAddress) required
 *   cash            → currencyCode ISO 4217 required
 *
 * No hardcoded instrument list — all data comes from user imports.
 */

import {
    AccountType,
    Instrument,
    InstrumentType,
    MarketIdentifier,
    VALID_FIAT_CURRENCIES,
    VALID_CRYPTO_SYMBOLS,
    ISIN_REGEX
} from '../types';
import { db, delay } from './db';
import { validateISIN } from './core/validationService';
import { portfolioService } from './portfolioService';
import { taxService } from './fiscal/taxService';
import { forgetCachedPrices } from './priceService';
import { classifyAsset } from './assetClassifier';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Hint data provided during import to find or create an instrument.
 * At least `symbol` must be provided.
 */
export interface AssetHint {
    /** Ticker symbol (AAPL, BTC, EUR) — always required */
    symbol: string;
    /** ISIN code for stocks/ETFs/funds */
    isin?: string;
    /** Human-readable name */
    name?: string;
    /** Instrument type — if not provided, will be inferred */
    type?: InstrumentType;
    /** Exchange MIC or crypto exchange name */
    exchange?: string;
    /** Blockchain network for crypto */
    network?: string;
    /** Smart contract address for tokens */
    contractAddress?: string;
    /** ISO 4217 currency code for cash instruments */
    currencyCode?: string;
    /** Denomination currency (e.g. USD for US stocks) */
    denominationCurrency?: string;
    /** Type of the account the asset is imported into: its default class when nothing else tells. */
    accountType?: AccountType;
}

/**
 * Result of instrument validation
 */
export interface InstrumentValidationResult {
    isMarketReady: boolean;
    errors: string[];
    warnings: string[];
}

// ============================================================================
// TYPE INFERENCE
// ============================================================================

/**
 * Infer InstrumentType from available data.
 * Priority: explicit type > ISIN presence > known crypto > known fiat > fallback
 */
function inferInstrumentType(hint: AssetHint): InstrumentType {
    if (hint.type) return hint.type;

    const upperSymbol = hint.symbol.toUpperCase();

    // If ISIN is provided, it's a traditional instrument
    if (hint.isin && ISIN_REGEX.test(hint.isin.toUpperCase())) {
        // Could be stock, etf, or fund — default to stock, user can override
        return 'stock';
    }

    // Check if it's a known fiat currency
    if (VALID_FIAT_CURRENCIES.includes(upperSymbol as typeof VALID_FIAT_CURRENCIES[number])) {
        return 'cash';
    }

    // Check if it's a known crypto symbol
    if (VALID_CRYPTO_SYMBOLS.includes(upperSymbol as typeof VALID_CRYPTO_SYMBOLS[number])) {
        return 'crypto';
    }

    // If exchange/network/contractAddress hints present → crypto
    if (hint.network || hint.contractAddress) {
        return 'crypto';
    }

    // Default to stock (most common for CSV imports with unknown symbols)
    return 'stock';
}

// ============================================================================
// MARKET-READINESS VALIDATION
// ============================================================================

/**
 * Validate whether an instrument has sufficient identifiers
 * for future market data lookup.
 */
export function validateMarketReadiness(
    type: InstrumentType,
    marketIdentifier: MarketIdentifier
): InstrumentValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Symbol is always required
    if (!marketIdentifier.symbol || marketIdentifier.symbol.trim() === '') {
        errors.push('Symbol is required for all instrument types');
    }

    switch (type) {
        case 'stock':
        case 'etf':
        case 'fund': {
            // ISIN OR (symbol + exchange) required
            const hasIsin = marketIdentifier.isin && ISIN_REGEX.test(marketIdentifier.isin);
            const hasSymbolAndExchange = marketIdentifier.symbol && marketIdentifier.exchange;

            if (!hasIsin && !hasSymbolAndExchange) {
                errors.push(
                    `${type.toUpperCase()} requires ISIN or (symbol + exchange). ` +
                    `Got: symbol=${marketIdentifier.symbol || 'none'}, ` +
                    `isin=${marketIdentifier.isin || 'none'}, ` +
                    `exchange=${marketIdentifier.exchange || 'none'}`
                );
            }

            if (marketIdentifier.isin && !ISIN_REGEX.test(marketIdentifier.isin)) {
                warnings.push(`ISIN format invalid: ${marketIdentifier.isin}`);
            }
            break;
        }

        case 'crypto': {
            // symbol + (exchange OR network OR contractAddress) required
            const hasContext =
                marketIdentifier.exchange ||
                marketIdentifier.network ||
                marketIdentifier.contractAddress;

            if (!hasContext) {
                errors.push(
                    `Crypto requires symbol + (exchange OR network OR contract_address). ` +
                    `Got only symbol=${marketIdentifier.symbol}`
                );
            }
            break;
        }

        case 'cash': {
            // currencyCode ISO 4217 required
            if (!marketIdentifier.currencyCode) {
                errors.push('Cash instrument requires ISO 4217 currencyCode');
            } else if (!VALID_FIAT_CURRENCIES.includes(
                marketIdentifier.currencyCode.toUpperCase() as typeof VALID_FIAT_CURRENCIES[number]
            )) {
                warnings.push(`Currency code "${marketIdentifier.currencyCode}" not in known ISO 4217 list`);
            }
            break;
        }

        case 'bond':
        case 'other': {
            // Best-effort — warn but don't error
            if (!marketIdentifier.isin && !marketIdentifier.exchange) {
                warnings.push(`${type} instrument: ISIN or exchange recommended for market data`);
            }
            break;
        }
    }

    return {
        isMarketReady: errors.length === 0,
        errors,
        warnings
    };
}

// ============================================================================
// EDITING: PATCH, INTEGRITY CHECKS, DUPLICATES
// ============================================================================

export const INSTRUMENT_TYPES: readonly InstrumentType[] = ['stock', 'etf', 'fund', 'crypto', 'cash', 'bond', 'other'];

/** Fields of an instrument the user can change. `null` clears an optional field. */
export interface InstrumentPatch {
    name?: string;
    symbol?: string;
    type?: InstrumentType;
    isin?: string | null;
    exchange?: string | null;
    network?: string | null;
    contractAddress?: string | null;
    denominationCurrency?: string;
}

export type InstrumentIssueCode =
    | 'INSTRUMENT_SYMBOL_REQUIRED'
    | 'INSTRUMENT_TYPE_INVALID'
    | 'INSTRUMENT_ISIN_INVALID'
    | 'INSTRUMENT_ISIN_CHECKDIGIT'
    | 'INSTRUMENT_CURRENCY_INVALID'
    | 'INSTRUMENT_DUPLICATE'
    | 'INSTRUMENT_MARKET_DATA_MISSING'
    | 'INSTRUMENT_MANUAL_PRICE_ONLY';

export interface InstrumentIssue {
    code: InstrumentIssueCode;
    field: 'symbol' | 'type' | 'isin' | 'denominationCurrency' | 'marketData';
    severity: 'error' | 'warning' | 'info';
    params?: Record<string, string>;
}

export class InstrumentValidationError extends Error {
    constructor(public readonly issues: InstrumentIssue[]) {
        super(issues.map(i => i.code).join(', '));
        this.name = 'InstrumentValidationError';
    }
}

export interface InstrumentUpdateOptions {
    /** Id of a duplicate this instrument is merged into once saved (its transactions move there). */
    mergeInto?: string;
}

export interface InstrumentUpdateResult {
    instrument: Instrument;
    /** Warnings and infos only: errors throw an InstrumentValidationError. */
    issues: InstrumentIssue[];
}

const CURRENCY_CODE_REGEX = /^[A-Z0-9]{2,10}$/;

const clean = (value: string | null | undefined): string | undefined => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
};

/** Applies a patch to an instrument (pure): normalises symbol/ISIN/currency and drops emptied optionals. */
export function applyInstrumentPatch(current: Instrument, patch: InstrumentPatch): Instrument {
    const identifier = { ...current.marketIdentifier };
    if (patch.symbol !== undefined) identifier.symbol = patch.symbol.trim().toUpperCase();
    if (patch.isin !== undefined) identifier.isin = clean(patch.isin)?.toUpperCase();
    if (patch.exchange !== undefined) identifier.exchange = clean(patch.exchange);
    if (patch.network !== undefined) identifier.network = clean(patch.network);
    if (patch.contractAddress !== undefined) identifier.contractAddress = clean(patch.contractAddress);

    const type = patch.type ?? current.type;
    if (type === 'cash') identifier.currencyCode = identifier.currencyCode || identifier.symbol;

    return {
        ...current,
        name: clean(patch.name) ?? (patch.name !== undefined ? identifier.symbol : current.name),
        type,
        marketIdentifier: identifier,
        denominationCurrency: patch.denominationCurrency !== undefined
            ? patch.denominationCurrency.trim().toUpperCase()
            : current.denominationCurrency,
    };
}

/** Other instruments that stand for the same asset: same ISIN, or same symbol. */
export function findDuplicateInstruments(draft: Instrument, others: Instrument[]): Instrument[] {
    const isin = draft.marketIdentifier.isin?.toUpperCase();
    const symbol = draft.marketIdentifier.symbol.toUpperCase();
    return others.filter(o =>
        o.id !== draft.id && (
            (isin && o.marketIdentifier.isin?.toUpperCase() === isin) ||
            (symbol && o.marketIdentifier.symbol.toUpperCase() === symbol)
        )
    );
}

/** Integrity checks of an instrument as edited (pure, shown live in the editor). */
export function validateInstrumentDraft(draft: Instrument, others: Instrument[]): InstrumentIssue[] {
    const issues: InstrumentIssue[] = [];
    const { symbol, isin } = draft.marketIdentifier;

    if (!symbol) issues.push({ code: 'INSTRUMENT_SYMBOL_REQUIRED', field: 'symbol', severity: 'error' });
    if (!INSTRUMENT_TYPES.includes(draft.type)) issues.push({ code: 'INSTRUMENT_TYPE_INVALID', field: 'type', severity: 'error' });

    if (isin) {
        for (const err of validateISIN(isin)) {
            issues.push(err.code === 'ISIN_CHECKDIGIT_INVALID'
                ? { code: 'INSTRUMENT_ISIN_CHECKDIGIT', field: 'isin', severity: 'warning', params: { value: isin } }
                : { code: 'INSTRUMENT_ISIN_INVALID', field: 'isin', severity: 'error' });
        }
    }

    if (!CURRENCY_CODE_REGEX.test(draft.denominationCurrency)) {
        issues.push({ code: 'INSTRUMENT_CURRENCY_INVALID', field: 'denominationCurrency', severity: 'error' });
    }

    for (const dup of findDuplicateInstruments(draft, others)) {
        issues.push({
            code: 'INSTRUMENT_DUPLICATE',
            field: dup.marketIdentifier.isin && dup.marketIdentifier.isin === isin ? 'isin' : 'symbol',
            severity: 'error',
            params: { id: dup.id, name: dup.name, symbol: dup.marketIdentifier.symbol }
        });
    }

    if (draft.type === 'other') {
        issues.push({ code: 'INSTRUMENT_MANUAL_PRICE_ONLY', field: 'marketData', severity: 'info' });
    } else if (INSTRUMENT_TYPES.includes(draft.type) && symbol && !validateMarketReadiness(draft.type, draft.marketIdentifier).isMarketReady) {
        issues.push({ code: 'INSTRUMENT_MARKET_DATA_MISSING', field: 'marketData', severity: 'warning' });
    }

    return issues;
}

/** An "other" instrument has no market data to look up, so it is always ready. */
export const isInstrumentMarketReady = (instrument: Instrument): boolean =>
    instrument.type === 'other' || validateMarketReadiness(instrument.type, instrument.marketIdentifier).isMarketReady;

/** What must be refreshed once an instrument changed (positions, tax summary, stale prices, groups). */
async function afterInstrumentChange(opts: { forgetSymbols: string[]; renamed?: { from: string; to: string } }): Promise<void> {
    forgetCachedPrices(opts.forgetSymbols);
    const renamed = opts.renamed;
    if (renamed && renamed.from.toUpperCase() !== renamed.to.toUpperCase()) {
        const from = renamed.from.toUpperCase();
        const groups = db.getAssetGroups();
        if (groups.some(g => g.symbols.some(sym => sym.toUpperCase() === from))) {
            db.saveAssetGroups(groups.map(g => ({
                ...g,
                symbols: g.symbols.map(sym => (sym.toUpperCase() === from ? renamed.to : sym))
            })));
        }
    }
    await portfolioService.recalculatePositions();
    taxService.clearCache();
}

/** Moves every transaction of `source` to `target`, completes the target's empty fields, removes `source`. */
function mergeInstrumentRecords(sourceId: string, targetId: string): Instrument {
    const all = db.getInstruments();
    const source = all.find(i => i.id === sourceId);
    const target = all.find(i => i.id === targetId);
    if (!source || !target || source.id === target.id) throw new Error('INSTRUMENT_NOT_FOUND');

    const t = target.marketIdentifier;
    const s = source.marketIdentifier;
    const merged: Instrument = {
        ...target,
        name: target.name && target.name !== t.symbol ? target.name : source.name,
        marketIdentifier: {
            ...t,
            isin: t.isin ?? s.isin,
            exchange: t.exchange ?? s.exchange,
            network: t.network ?? s.network,
            contractAddress: t.contractAddress ?? s.contractAddress,
        },
        updatedAt: new Date().toISOString(),
    };
    merged.isMarketReady = isInstrumentMarketReady(merged);

    db.saveUnifiedTransactions(db.getUnifiedTransactions().map(tx =>
        tx.instrumentId === source.id
            ? { ...tx, instrumentId: target.id, assetSymbol: merged.marketIdentifier.symbol, assetIsin: merged.marketIdentifier.isin ?? tx.assetIsin }
            : tx
    ));
    db.saveInstruments(all.filter(i => i.id !== source.id).map(i => (i.id === target.id ? merged : i)));
    return merged;
}

// ============================================================================
// INSTRUMENT SERVICE
// ============================================================================

export const instrumentService = {
    /**
     * Get all instruments
     */
    getInstruments: async (): Promise<Instrument[]> => {
        await delay(100);
        return db.getInstruments();
    },

    /**
     * Get instrument by ID
     */
    getInstrumentById: async (id: string): Promise<Instrument | undefined> => {
        await delay(50);
        return db.getInstrumentById(id);
    },

    /**
     * Find an existing instrument or create a new one from import hints.
     *
     * Resolution order:
     * 1. Match by ISIN (most specific)
     * 2. Match by currencyCode (for cash)
     * 3. Match by symbol (least specific)
     * 4. If no match → create new instrument
     *
     * No hardcoded lookup — all instruments come from prior imports
     * or are created on the fly.
     */
    findOrCreateInstrument: async (hint: AssetHint, options?: { persist?: boolean }): Promise<Instrument> => {
        await delay(50);

        const rawSymbol = hint.symbol || hint.isin || 'UNKNOWN';
        const upperSymbol = rawSymbol.toUpperCase().trim();
        const upperIsin = hint.isin?.toUpperCase().trim();

        // Try to find existing instrument
        const existing = db.findInstrumentByMarketId({
            isin: upperIsin,
            symbol: upperSymbol,
            currencyCode: hint.currencyCode?.toUpperCase()
        });

        if (existing) {
            // Optionally enrich existing instrument with new data
            let updated = false;
            const enriched = { ...existing, marketIdentifier: { ...existing.marketIdentifier } };

            if (upperIsin && !enriched.marketIdentifier.isin) {
                enriched.marketIdentifier.isin = upperIsin;
                updated = true;
            }
            if (hint.exchange && !enriched.marketIdentifier.exchange) {
                enriched.marketIdentifier.exchange = hint.exchange;
                updated = true;
            }
            if (hint.network && !enriched.marketIdentifier.network) {
                enriched.marketIdentifier.network = hint.network;
                updated = true;
            }
            if (hint.contractAddress && !enriched.marketIdentifier.contractAddress) {
                enriched.marketIdentifier.contractAddress = hint.contractAddress;
                updated = true;
            }
            if (hint.name && !enriched.name) {
                enriched.name = hint.name;
                updated = true;
            }

            if (updated) {
                // Re-validate market readiness
                const validation = validateMarketReadiness(enriched.type, enriched.marketIdentifier);
                enriched.isMarketReady = validation.isMarketReady;
                enriched.updatedAt = new Date().toISOString();

                // Save enriched version
                const all = db.getInstruments().map(i => i.id === enriched.id ? enriched : i);
                db.saveInstruments(all);
                return enriched;
            }

            return existing;
        }

        // Create new instrument: the class comes from the file, the currency code, the account and, best
        // effort, a market-data lookup (assetClassifier); the local rules are the offline fallback.
        const classification = await classifyAsset({
            symbol: upperSymbol,
            isin: upperIsin,
            network: hint.network,
            contractAddress: hint.contractAddress,
            accountType: hint.accountType,
            type: hint.type,
        }).catch(() => undefined);
        const type = classification?.type ?? inferInstrumentType(hint);
        const now = new Date().toISOString();

        const marketIdentifier: MarketIdentifier = {
            symbol: upperSymbol,
            isin: upperIsin,
            exchange: hint.exchange ?? classification?.exchange,
            network: hint.network,
            contractAddress: hint.contractAddress,
            currencyCode: type === 'cash' ? (hint.currencyCode || upperSymbol) : hint.currencyCode
        };

        const validation = validateMarketReadiness(type, marketIdentifier);

        const newInstrument: Instrument = {
            id: `instr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            ownerId: 'default-user',
            name: hint.name || classification?.name || upperSymbol,
            type,
            marketIdentifier,
            isMarketReady: validation.isMarketReady,
            denominationCurrency: hint.denominationCurrency ||
                (type === 'cash' ? (hint.currencyCode || upperSymbol) : 'USD'),
            createdAt: now,
            updatedAt: now
        };

        // Save (an import review keeps new instruments as drafts until the import is confirmed)
        if (options?.persist !== false) {
            const all = db.getInstruments();
            db.saveInstruments([...all, newInstrument]);
        }

        return newInstrument;
    },

    /** The instrument a position was built from (by id, else by ISIN or symbol for positions cached before ids existed). */
    findInstrumentForPosition: (position: { instrumentId?: string; isin?: string; symbol: string }): Instrument | undefined => {
        if (position.instrumentId) {
            const byId = db.getInstrumentById(position.instrumentId);
            if (byId) return byId;
        }
        return db.findInstrumentByMarketId({ isin: position.isin?.toUpperCase(), symbol: position.symbol.toUpperCase() });
    },

    /** Live integrity checks for an edit in progress (nothing is saved). */
    previewInstrumentIssues: (id: string, patch: InstrumentPatch): InstrumentIssue[] => {
        const all = db.getInstruments();
        const current = all.find(i => i.id === id);
        if (!current) return [];
        return validateInstrumentDraft(applyInstrumentPatch(current, patch), all.filter(i => i.id !== id));
    },

    /**
     * Edit any field of an instrument. Errors (empty symbol, malformed ISIN, invalid currency, a duplicate
     * without `mergeInto`) throw an InstrumentValidationError and change nothing. On success the positions,
     * the tax summary and the stale prices are refreshed. With `mergeInto`, the edited instrument is merged
     * into that duplicate: its transactions move there and it disappears.
     */
    updateInstrument: async (
        id: string,
        patch: InstrumentPatch,
        options?: InstrumentUpdateOptions
    ): Promise<InstrumentUpdateResult> => {
        await delay(100);
        const all = db.getInstruments();
        const current = all.find(i => i.id === id);
        if (!current) throw new Error('INSTRUMENT_NOT_FOUND');

        const others = all.filter(i => i.id !== id);
        const draft = applyInstrumentPatch(current, patch);
        const issues = validateInstrumentDraft(draft, others);

        const duplicates = findDuplicateInstruments(draft, others);
        const mergeTarget = options?.mergeInto ? duplicates.find(d => d.id === options.mergeInto) : undefined;
        if (options?.mergeInto && !mergeTarget) throw new Error('INSTRUMENT_MERGE_TARGET_INVALID');
        const blocking = issues.filter(i => i.severity === 'error' && !(mergeTarget && i.code === 'INSTRUMENT_DUPLICATE'));
        if (blocking.length > 0) throw new InstrumentValidationError(issues);

        const saved: Instrument = { ...draft, isMarketReady: isInstrumentMarketReady(draft), updatedAt: new Date().toISOString() };
        db.saveInstruments(all.map(i => (i.id === id ? saved : i)));

        let result = saved;
        if (mergeTarget) result = mergeInstrumentRecords(saved.id, mergeTarget.id);

        await afterInstrumentChange({
            forgetSymbols: [current.marketIdentifier.symbol, saved.marketIdentifier.symbol],
            renamed: { from: current.marketIdentifier.symbol, to: result.marketIdentifier.symbol }
        });
        return { instrument: result, issues: issues.filter(i => i.severity !== 'error') };
    },

    /** Merge `sourceId` into `targetId`: transactions move to the target, the source is removed. */
    mergeInstruments: async (sourceId: string, targetId: string): Promise<Instrument> => {
        await delay(100);
        const source = db.getInstrumentById(sourceId);
        const merged = mergeInstrumentRecords(sourceId, targetId);
        await afterInstrumentChange({
            forgetSymbols: [source?.marketIdentifier.symbol ?? '', merged.marketIdentifier.symbol],
            renamed: source ? { from: source.marketIdentifier.symbol, to: merged.marketIdentifier.symbol } : undefined
        });
        return merged;
    },

    /**
     * Validate an instrument's market-readiness
     */
    validateMarketReadiness: (instrument: Instrument): InstrumentValidationResult => {
        return validateMarketReadiness(instrument.type, instrument.marketIdentifier);
    },

    /**
     * Delete an instrument (alpha only)
     */
    deleteInstrument: async (id: string): Promise<boolean> => {
        await delay(100);
        const instruments = db.getInstruments();
        const filtered = instruments.filter(i => i.id !== id);
        if (filtered.length === instruments.length) return false;
        db.saveInstruments(filtered);
        return true;
    },

    /**
     * Remove all non-market-ready instruments and return count.
     * Alpha-only cleanup operation.
     */
    purgeInvalidInstruments: async (): Promise<number> => {
        await delay(200);
        const instruments = db.getInstruments();
        const valid = instruments.filter(i => i.isMarketReady);
        const purged = instruments.length - valid.length;
        db.saveInstruments(valid);
        return purged;
    }
};
