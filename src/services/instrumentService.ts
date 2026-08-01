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
    Instrument,
    InstrumentType,
    MarketIdentifier,
    VALID_FIAT_CURRENCIES,
    VALID_CRYPTO_SYMBOLS,
    ISIN_REGEX
} from '../types';
import { db, delay } from './db';

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
    findOrCreateInstrument: async (hint: AssetHint): Promise<Instrument> => {
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
            }

            return existing;
        }

        // Create new instrument
        const type = inferInstrumentType(hint);
        const now = new Date().toISOString();

        const marketIdentifier: MarketIdentifier = {
            symbol: upperSymbol,
            isin: upperIsin,
            exchange: hint.exchange,
            network: hint.network,
            contractAddress: hint.contractAddress,
            currencyCode: type === 'cash' ? (hint.currencyCode || upperSymbol) : hint.currencyCode
        };

        const validation = validateMarketReadiness(type, marketIdentifier);

        const newInstrument: Instrument = {
            id: `instr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            ownerId: 'default-user',
            name: hint.name || upperSymbol,
            type,
            marketIdentifier,
            isMarketReady: validation.isMarketReady,
            denominationCurrency: hint.denominationCurrency ||
                (type === 'cash' ? (hint.currencyCode || upperSymbol) : 'USD'),
            createdAt: now,
            updatedAt: now
        };

        // Save
        const all = db.getInstruments();
        db.saveInstruments([...all, newInstrument]);

        return newInstrument;
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
