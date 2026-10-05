/**
 * Fiscal Constants
 * 
 * Shared constants for the French tax module.
 * These are structural constants (enum-like values, form identifiers),
 * NOT year-specific rates or thresholds — those live in taxRules.ts.
 */

import { WrapperType } from '../types/types.backend';

// ============================================================================
// SUPPORTED FISCAL YEARS
// ============================================================================

/** Fiscal years currently supported by the tax engine */
export const SUPPORTED_FISCAL_YEARS = ['2024', '2025'] as const;
export type SupportedFiscalYear = typeof SUPPORTED_FISCAL_YEARS[number];

/** Default fiscal year for new users */
export const DEFAULT_FISCAL_YEAR: SupportedFiscalYear = '2024';

// ============================================================================
// FORM IDENTIFIERS
// ============================================================================

/** Official DGFiP tax form identifiers */
export const TAX_FORMS = {
    FORM_2042: '2042',
    FORM_2042_C: '2042-C',
    FORM_2042_C_PRO: '2042-C-PRO',
    FORM_2074: '2074',
    FORM_2074_CMV: '2074-CMV',
    FORM_2086: '2086',
    FORM_3916: '3916',
    FORM_3916_BIS: '3916-bis',
} as const;

// ============================================================================
// WRAPPER TYPE HELPERS
// ============================================================================

/** Wrapper types that are considered "tax-advantaged envelopes" */
export const TAX_ADVANTAGED_WRAPPERS: WrapperType[] = ['PEA', 'PEA_PME', 'ASSURANCE_VIE', 'PER', 'LIVRET'];

/** Wrapper types subject to standard capital gains taxation */
export const TAXABLE_WRAPPERS: WrapperType[] = ['CTO', 'OTHER'];

/** Check if a wrapper type is a PEA variant */
export function isPEAWrapper(wrapperType?: WrapperType): boolean {
    return wrapperType === 'PEA' || wrapperType === 'PEA_PME';
}

/** Check if a wrapper type is subject to standard CTO taxation */
export function isTaxableWrapper(wrapperType?: WrapperType): boolean {
    if (!wrapperType) return true; // Default to taxable if unknown
    return TAXABLE_WRAPPERS.includes(wrapperType);
}

// ============================================================================
// CGI ARTICLE REFERENCES
// ============================================================================

/** Key CGI articles referenced in the tax module */
export const CGI_ARTICLES = {
    // Capital gains on securities
    ART_150_0_A: 'Article 150-0 A du CGI',
    ART_150_0_D: 'Article 150-0 D du CGI',
    // Crypto-assets
    ART_150_VH_BIS: 'Article 150 VH bis du CGI',
    // PEA
    ART_163_QUINQUIES_D: 'Article 163 quinquies D du CGI',
    // PFU / Flat tax
    ART_200_A: 'Article 200 A du CGI',
    // Dividends
    ART_112: 'Article 112 du CGI',
    // Foreign accounts
    ART_1649_A: 'Article 1649 A du CGI',
    ART_1649_BIS_C: 'Article 1649 bis C du CGI',
    // Penalties
    ART_1736: 'Article 1736 du CGI',
} as const;

// ============================================================================
// BOFIP REFERENCES
// ============================================================================

export const BOFIP_REFS = {
    PV_VALEURS_MOBILIERES: 'BOI-RPPM-PVBMI',
    REVENUS_CAPITAUX_MOBILIERS: 'BOI-RPPM-RCM',
    PEA: 'BOI-RPPM-RCM-40-50',
} as const;

// ============================================================================
// OFFICIAL URLS
// ============================================================================

export const OFFICIAL_URLS = {
    LEGIFRANCE_CGI: 'https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006069577/',
    BOFIP: 'https://bofip.impots.gouv.fr/',
    IMPOTS_GOUV: 'https://www.impots.gouv.fr/',
    FORMULAIRES_DGFiP: 'https://www.impots.gouv.fr/formulaire',
} as const;

// ============================================================================
// CAPITAL LOSS CARRYFORWARD
// ============================================================================

/** Maximum number of years capital losses can be carried forward (CTO) */
export const LOSS_CARRYFORWARD_YEARS = 10;

// ============================================================================
// TRANSACTION TYPE CLASSIFICATION FOR FISCAL PURPOSES
// ============================================================================

/** Transaction types that represent taxable cessions */
export const TAXABLE_CESSION_TYPES = ['SELL'] as const;

/** Transaction types that represent income events */
export const INCOME_TYPES = ['INCOME'] as const;

/** Transaction sub-types that represent dividend income */
export const DIVIDEND_SUB_TYPES = ['DIVIDEND'] as const;

/** Transaction sub-types that represent interest/coupon income */
export const INTEREST_SUB_TYPES = ['INTEREST'] as const;

/** Transaction sub-types for crypto passive income */
export const CRYPTO_PASSIVE_INCOME_SUB_TYPES = ['STAKING_REWARD', 'AIRDROP', 'MINING_REWARD'] as const;
