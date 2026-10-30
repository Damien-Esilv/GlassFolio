/**
 * Tax Service — Orchestration Layer
 * 
 * Wraps the pure taxEngine functions with DB access.
 * All public methods follow the service layer convention:
 *   - Use `await delay(500)` for simulated latency
 *   - Return typed results (no `any`)
 *   - Access data through `db` only
 */

import { db, delay } from '../db';
import { vaultService } from '../security/vaultService';
import { currencyService } from '../currencyService';
import { portfolioService } from '../portfolioService';
import { isTaxableWrapper } from '../../constants/fiscalConstants';
import {
    TaxSummaryResult,
    ForeignAccountObligation,
    FormCaseMapping,
    FiscalProfile,
    UnifiedTransaction,
    Account,
    Instrument,
} from '../../types/types.backend';

import {
    buildTaxSummary,
    comparePFUvsBareme,
    detectForeignAccounts,
} from './taxEngine';

import {
    getFiscalRulesOrThrow,
    getSupportedYears,
    getSupportedCountries,
    DEFAULT_TAX_COUNTRY,
} from './taxRules';

import {
    getEffectiveCalendar,
    fetchRemoteTaxCalendar,
    getUserFiscalDeadline,
} from './taxCalendarService';

/**
 * Currencies, other than EUR, whose amounts must be converted for this year's summary: rows up to
 * the end of the year, without a usable rate of their own (see taxEngine.convertToEur).
 */
function foreignCurrencies(
    transactions: UnifiedTransaction[],
    accounts: Account[],
    instruments: Instrument[],
    fiscalYear: string
): string[] {
    const accountById = new Map(accounts.map(a => [a.id, a]));
    const instrumentById = new Map(instruments.map(i => [i.id, i]));
    const codes = new Set<string>();
    for (const tx of transactions) {
        if (tx.transactionDate.slice(0, 4) > fiscalYear) continue;
        const account = accountById.get(tx.accountId);
        const currency = (tx.originalCurrency || account?.defaultCurrency
            || (tx.instrumentId ? instrumentById.get(tx.instrumentId)?.denominationCurrency : undefined) || 'EUR').toUpperCase();
        const ownRate = tx.originalCurrency && (account?.defaultCurrency || 'EUR').toUpperCase() === 'EUR' && parseFloat(tx.fxRate || '') > 0;
        if (currency !== 'EUR' && !ownRate) codes.add(currency);
    }
    return Array.from(codes);
}

// ============================================================================
// IN-MEMORY CACHE & DEDUPLICATION (PREVENTS REDUNDANT DOUBLE-LOADING)
// ============================================================================

interface CachedTaxSummary {
    summary: TaxSummaryResult;
    /** db.getDataVersion() when computed: an edited trade, account or asset makes it stale. */
    dataVersion: number;
    cachedAt: number;
}

const taxSummaryCache = new Map<string, CachedTaxSummary>();
const inFlightSummaries = new Map<string, Promise<TaxSummaryResult>>();

export const clearTaxSummaryCache = (): void => {
    taxSummaryCache.clear();
    inFlightSummaries.clear();
};

vaultService.subscribeStatus((status) => {
    if (status === 'locked') {
        clearTaxSummaryCache();
    }
});

// ============================================================================
// PUBLIC API
// ============================================================================

export const taxService = {
    /** Clear in-memory tax summary cache (e.g. after import or transaction edit). */
    clearCache: clearTaxSummaryCache,

    /**
     * Get the complete tax summary for a fiscal year.
     * This is the main entry point for the Declaration Assistant page.
     * Caches in memory to eliminate double loading screens during tab navigation.
     */
    getTaxSummary: async (
        fiscalYear: string,
        profile: FiscalProfile,
        country: string = DEFAULT_TAX_COUNTRY
    ): Promise<TaxSummaryResult> => {
        const allTransactions = db.getUnifiedTransactions();
        const dataVersion = db.getDataVersion();
        const cacheKey = `${fiscalYear}:${country}:${JSON.stringify(profile)}`;

        // Fast return from memory cache if no data changed since
        const cached = taxSummaryCache.get(cacheKey);
        if (cached && cached.dataVersion === dataVersion) {
            return cached.summary;
        }

        // Return active in-flight request if identical query is already pending (on the same data)
        const flightKey = `${cacheKey}:${dataVersion}`;
        const existingPromise = inFlightSummaries.get(flightKey);
        if (existingPromise) {
            return existingPromise;
        }

        const fetchPromise = (async () => {
            try {
                await delay(500);

                const accounts = db.getAccounts();
                const institutes = db.getInstitutes();
                const instruments = db.getInstruments();
                const rateToEur = await currencyService.getHistoricalRatesToEur(
                    foreignCurrencies(allTransactions, accounts, instruments, fiscalYear)
                );

                const summary = buildTaxSummary(
                    allTransactions,
                    accounts,
                    institutes,
                    instruments,
                    fiscalYear,
                    profile,
                    country,
                    { rateToEur }
                );

                taxSummaryCache.set(cacheKey, {
                    summary,
                    dataVersion,
                    cachedAt: Date.now(),
                });

                return summary;
            } finally {
                inFlightSummaries.delete(flightKey);
            }
        })();

        inFlightSummaries.set(flightKey, fetchPromise);
        return fetchPromise;
    },

    /**
     * Get form/case mappings for a specific fiscal year.
     * Convenience method that extracts formMappings from the full summary.
     */
    getFormMappings: async (
        fiscalYear: string,
        profile: FiscalProfile,
        country: string = DEFAULT_TAX_COUNTRY
    ): Promise<FormCaseMapping[]> => {
        const summary = await taxService.getTaxSummary(fiscalYear, profile, country);
        return summary.formMappings;
    },

    /**
     * Get foreign account declaration obligations.
     */
    getForeignAccountObligations: async (): Promise<ForeignAccountObligation[]> => {
        await delay(500);
        const institutes = db.getInstitutes();
        const accounts = db.getAccounts();
        return detectForeignAccounts(institutes, accounts);
    },

    /**
     * Compare PFU vs Barème for a fiscal year.
     */
    comparePFUvsBareme: async (
        fiscalYear: string,
        profile: FiscalProfile,
        country: string = DEFAULT_TAX_COUNTRY,
        existingSummary?: TaxSummaryResult
    ): Promise<{
        pfuTotal: number;
        baremeTotal: number;
        recommendation: 'PFU' | 'BAREME' | 'NEUTRAL';
        confidence: import('../../types/types.backend').FiscalConfidence;
    }> => {
        const summary = existingSummary || await taxService.getTaxSummary(fiscalYear, profile, country);
        const rules = getFiscalRulesOrThrow(fiscalYear, country);

        // Collect all taxable events for comparison
        const allEvents = [
            ...summary.cto.events,
            ...summary.income.events,
        ];

        return comparePFUvsBareme(allEvents, profile, rules, summary.cto.lossCarryforward);
    },

    /**
     * Get supported fiscal years for the UI selector.
     */
    getSupportedYears: (country: string = DEFAULT_TAX_COUNTRY): string[] => {
        return getSupportedYears(country);
    },

    /**
     * Get supported countries for the UI selector.
     */
    getSupportedCountries: (): string[] => {
        return getSupportedCountries();
    },

    /**
     * Get dynamic fiscal calendar with user department resolution.
     */
    getTaxCalendar: async (fiscalYear: string, department?: string) => {
        await delay(200);
        const calendar = getEffectiveCalendar(fiscalYear);
        const userDetails = getUserFiscalDeadline(calendar, department);
        return {
            calendar,
            ...userDetails,
        };
    },

    /**
     * Trigger an online update for the fiscal calendar via Internet.
     */
    syncTaxCalendarOnline: async (fiscalYear: string, department?: string) => {
        const calendar = await fetchRemoteTaxCalendar(fiscalYear);
        const userDetails = getUserFiscalDeadline(calendar, department);
        return {
            calendar,
            ...userDetails,
        };
    },

    /**
     * Get optimization suggestions for a fiscal year.
     * Each one rests on figures the summary or the portfolio actually holds; PFU vs barème has its
     * own card on the page and is not repeated here.
     */
    getOptimizationSuggestions: async (
        fiscalYear: string,
        profile: FiscalProfile,
        country: string = DEFAULT_TAX_COUNTRY,
        existingSummary?: TaxSummaryResult
    ): Promise<OptimizationSuggestion[]> => {
        const summary = existingSummary || await taxService.getTaxSummary(fiscalYear, profile, country);
        const rules = getFiscalRulesOrThrow(fiscalYear, country);
        const suggestions: OptimizationSuggestion[] = [];

        // --- Tax-loss harvesting: only while the year is open, only up to the gain still taxed,
        // and only with losses the taxable accounts actually hold today ---
        const taxedGain = Math.max(0, summary.cto.netResult - summary.cto.lossesApplied);
        if (taxedGain > 0 && fiscalYear === String(new Date().getFullYear())) {
            const accounts = new Map(db.getAccounts().map(a => [a.id, a]));
            const positions = await portfolioService.getPositions();
            const unrealizedLosses = positions
                .filter(p => {
                    const account = p.accountId ? accounts.get(p.accountId) : undefined;
                    // Crypto losses offset only crypto gains (art. 150 VH bis), not these
                    return account !== undefined && isTaxableWrapper(account.wrapperType || 'CTO')
                        && p.type !== 'Crypto' && p.type !== 'Cash' && p.unrealizedPL < 0;
                })
                .reduce((sum, p) => sum + Math.abs(p.unrealizedPL), 0);
            const harvestable = Math.min(taxedGain, unrealizedLosses);
            if (harvestable > 0) {
                suggestions.push({
                    id: 'tax-loss-harvesting',
                    category: 'harvesting',
                    titleKey: 'harvesting',
                    params: { gain: Math.round(taxedGain), losses: Math.round(unrealizedLosses), harvestable: Math.round(harvestable) },
                    impact: harvestable * rules.pfu.totalRate,
                    impactKind: 'savings',
                    confidence: 'estimated',
                });
            }
        }

        // --- Foreign accounts: a declaration to make, with the fine incurred per account if missed ---
        const foreignAccountCount = summary.foreignAccounts.reduce((n, o) => n + o.accountIds.length, 0);
        if (foreignAccountCount > 0) {
            suggestions.push({
                id: 'foreign-accounts',
                category: 'compliance',
                titleKey: 'foreignAccounts',
                params: { count: foreignAccountCount, fine: rules.foreignAccounts.finePerAccount },
                impact: foreignAccountCount * rules.foreignAccounts.finePerAccount,
                impactKind: 'risk',
                confidence: 'determined',
            });
        }

        // --- Crypto under the threshold: gains exempt, nothing to report in 3AN ---
        if (summary.crypto.totalCessions > 0 && !summary.crypto.exceedsThreshold) {
            suggestions.push({
                id: 'crypto-threshold',
                category: 'crypto',
                titleKey: 'cryptoThreshold',
                params: { cessions: Math.round(summary.crypto.totalCessions), threshold: rules.crypto.exemptionThreshold },
                impact: Math.max(0, summary.crypto.netResult) * rules.crypto.pfuRate,
                impactKind: 'savings',
                confidence: 'determined',
            });
        }

        // --- PEA withdrawal before 5 years: the plan is closed and the gain bears income tax ---
        const earlyWithdrawals = summary.pea.withdrawals.filter(e => e.closesPlan);
        if (earlyWithdrawals.length > 0) {
            suggestions.push({
                id: 'pea-early-withdrawal',
                category: 'envelope',
                titleKey: 'peaEarlyWithdrawal',
                params: { count: earlyWithdrawals.length, tax: Math.round(summary.pea.incomeTax) },
                impact: summary.pea.incomeTax,
                impactKind: 'cost',
                confidence: 'estimated',
            });
        }

        return suggestions;
    },
};

// ============================================================================
// TYPES
// ============================================================================

export interface OptimizationSuggestion {
    id: string;
    category: 'regime' | 'harvesting' | 'compliance' | 'crypto' | 'envelope';
    /** Texts under `tax:optimization.suggestions.items.<titleKey>` (title, text), filled with `params` */
    titleKey: 'harvesting' | 'foreignAccounts' | 'cryptoThreshold' | 'peaEarlyWithdrawal';
    params: Record<string, number>;
    /** Amount in EUR: a possible saving, a fine incurred, or a tax already due */
    impact: number;
    impactKind: 'savings' | 'risk' | 'cost';
    confidence: import('../../types/types.backend').FiscalConfidence;
}
