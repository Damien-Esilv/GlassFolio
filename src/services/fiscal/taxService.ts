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
import {
    TaxSummaryResult,
    ForeignAccountObligation,
    FormCaseMapping,
    FiscalProfile,
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

// ============================================================================
// IN-MEMORY CACHE & DEDUPLICATION (PREVENTS REDUNDANT DOUBLE-LOADING)
// ============================================================================

interface CachedTaxSummary {
    summary: TaxSummaryResult;
    txCount: number;
    cachedAt: number;
}

const taxSummaryCache = new Map<string, CachedTaxSummary>();
const inFlightSummaries = new Map<string, Promise<TaxSummaryResult>>();

export const clearTaxSummaryCache = (): void => {
    taxSummaryCache.clear();
    inFlightSummaries.clear();
};

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
        const cacheKey = `${fiscalYear}:${country}:${JSON.stringify(profile)}`;

        // Fast return from memory cache if transactions count has not changed
        const cached = taxSummaryCache.get(cacheKey);
        if (cached && cached.txCount === allTransactions.length) {
            return cached.summary;
        }

        // Return active in-flight request if identical query is already pending
        const existingPromise = inFlightSummaries.get(cacheKey);
        if (existingPromise) {
            return existingPromise;
        }

        const fetchPromise = (async () => {
            try {
                await delay(500);

                const accounts = db.getAccounts();
                const institutes = db.getInstitutes();
                const instruments = db.getInstruments();

                const summary = buildTaxSummary(
                    allTransactions,
                    accounts,
                    institutes,
                    instruments,
                    fiscalYear,
                    profile,
                    country
                );

                taxSummaryCache.set(cacheKey, {
                    summary,
                    txCount: allTransactions.length,
                    cachedAt: Date.now(),
                });

                return summary;
            } finally {
                inFlightSummaries.delete(cacheKey);
            }
        })();

        inFlightSummaries.set(cacheKey, fetchPromise);
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

        return comparePFUvsBareme(allEvents, profile, rules);
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
     * Returns actionable insights for tax-loss harvesting and envelope arbitrage.
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

        // --- PFU vs Barème ---
        const allEvents = [...summary.cto.events, ...summary.income.events];
        const pfuComparison = comparePFUvsBareme(allEvents, profile, rules);
        
        if (pfuComparison.confidence !== 'insufficient_data') {
            const savings = Math.abs(pfuComparison.pfuTotal - pfuComparison.baremeTotal);
            suggestions.push({
                id: 'pfu-vs-bareme',
                category: 'regime',
                title: 'PFU vs Barème',
                impact: savings,
                recommendation: pfuComparison.recommendation === 'BAREME'
                    ? `L'option barème (2OP) vous ferait économiser ~${Math.round(savings)}€`
                    : pfuComparison.recommendation === 'PFU'
                        ? `Le PFU (flat tax) est plus avantageux (~${Math.round(savings)}€ d'économie)`
                        : `PFU et barème sont équivalents pour votre situation`,
                confidence: pfuComparison.confidence,
            });
        }

        // --- Tax-Loss Harvesting ---
        if (summary.cto.totalGains > 0 && summary.cto.totalLosses === 0) {
            suggestions.push({
                id: 'tax-loss-harvesting',
                category: 'harvesting',
                title: 'Tax-Loss Harvesting',
                impact: summary.cto.totalGains * rules.pfu.totalRate,
                recommendation: `Vous avez ${Math.round(summary.cto.totalGains)}€ de plus-values réalisées. Cherchez des positions en moins-value latente à matérialiser avant le 31/12.`,
                confidence: 'estimated',
            });
        }

        // --- Foreign accounts warning ---
        if (summary.foreignAccounts.length > 0) {
            suggestions.push({
                id: 'foreign-accounts',
                category: 'compliance',
                title: 'Comptes étrangers',
                impact: summary.foreignAccounts.length * rules.foreignAccounts.finePerAccount,
                recommendation: `${summary.foreignAccounts.length} compte(s) étranger(s) détecté(s). N'oubliez pas de les déclarer (amende ${rules.foreignAccounts.finePerAccount}€ par compte non déclaré).`,
                confidence: 'determined',
            });
        }

        // --- Crypto threshold ---
        if (summary.crypto.totalCessions > 0 && !summary.crypto.exceedsThreshold) {
            suggestions.push({
                id: 'crypto-threshold',
                category: 'crypto',
                title: 'Seuil crypto 305€',
                impact: summary.crypto.netResult * rules.crypto.pfuRate,
                recommendation: `Vos cessions crypto totalisent ${Math.round(summary.crypto.totalCessions)}€, sous le seuil de ${rules.crypto.exemptionThreshold}€. Les gains sont exonérés mais restent déclarables.`,
                confidence: 'determined',
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
    title: string;
    /** Estimated monetary impact in EUR */
    impact: number;
    recommendation: string;
    confidence: import('../../types/types.backend').FiscalConfidence;
}
