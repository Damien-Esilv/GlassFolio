/**
 * Tax Rules — Year-Versioned French Fiscal Rules
 * 
 * Contains rates, thresholds, form/case mappings, and IR brackets
 * for each supported fiscal year.
 * 
 * IMPORTANT: Each year's rules are independent. A change in 2025 law
 * must NOT retroactively modify 2024 calculations.
 * 
 * Sources:
 * - Légifrance / CGI (versions temporelles)
 * - BOFiP-Impôts
 * - DGFiP formulaires et notices officielles
 */

import { TAX_FORMS, CGI_ARTICLES } from '../../constants/fiscalConstants';
import { getEffectiveCalendar, computeFrenchTaxCalendar } from './taxCalendarService';

// ============================================================================
// TYPES
// ============================================================================

/** Income tax bracket for the barème progressif */
export interface IRBracket {
    /** Lower bound (inclusive) of the bracket */
    min: number;
    /** Upper bound (exclusive, Infinity for last bracket) */
    max: number;
    /** Tax rate as a decimal (e.g., 0.30 for 30%) */
    rate: number;
}

/** PEA taxation rule based on plan age */
export interface PEATaxRule {
    /** Minimum age of the plan in years (inclusive) */
    minAgeYears: number;
    /** Maximum age of the plan in years (exclusive, Infinity for last bracket) */
    maxAgeYears: number;
    /** Income tax rate on gains upon withdrawal */
    incomeTaxRate: number;
    /** Social contributions rate on gains upon withdrawal */
    socialRate: number;
    /** Whether withdrawal triggers plan closure */
    closesOnWithdrawal: boolean;
    /** Description of the consequences */
    description: string;
    /** Legal reference */
    legalReference: string;
}

/** Form/case mapping definition for a specific fiscal year */
export interface FormCaseDefinition {
    form: string;
    caseId: string;
    description: string;
    descriptionFr: string;
    /** Which event types populate this case */
    applicableTo: string[];
    /** Legal reference */
    legalReference?: string;
}

/** Complete fiscal year rule set */
export interface FiscalYearRules {
    /** ISO 3166-1 alpha-2 country code this rule set applies to */
    country: string;
    /** Fiscal year identifier */
    year: string;
    /** Declaration year (year + 1 typically) */
    declarationYear: string;

    // --- PFU (Prélèvement Forfaitaire Unique) ---
    pfu: {
        /** Total PFU rate (IR + Social) */
        totalRate: number;
        /** IR component of the PFU */
        irRate: number;
        /** Social contributions component */
        socialRate: number;
    };

    // --- Social Contributions breakdown ---
    socialContributions: {
        /** Total social contributions rate */
        totalRate: number;
        /** CSG rate */
        csgRate: number;
        /** CRDS rate */
        crdsRate: number;
        /** Prélèvement de solidarité */
        solidarityRate: number;
        /** CSG déductible rate (when barème option is chosen) */
        deductibleCSGRate: number;
    };

    // --- Barème progressif de l'IR ---
    irBrackets: IRBracket[];

    // --- Dividend specifics ---
    dividends: {
        /** Abattement of 40% on dividends when opting for barème */
        abatementRate: number;
        /** Whether the 40% abattement applies */
        hasAbatement: boolean;
        /** Legal reference for the abattement */
        legalReference: string;
    };

    // --- Crypto specifics (Art. 150 VH bis) ---
    crypto: {
        /** Annual cession threshold below which gains are exempt */
        exemptionThreshold: number;
        /** PFU rate for crypto gains */
        pfuRate: number;
        /** Whether crypto-to-crypto exchanges are tax-neutral */
        cryptoCryptoNeutral: boolean;
        /** Legal reference */
        legalReference: string;
        /** Whether stablecoins are treated as crypto (not fiat) for exchange purposes */
        stablecoinAsCrypto: boolean;
    };

    // --- PEA rules ---
    pea: {
        /** Tax rules by plan age */
        taxByAge: PEATaxRule[];
        /** Maximum cumulative deposit amount */
        maxDeposit: number;
        /** PEA-PME maximum deposit */
        maxDepositPME: number;
        /** Combined PEA + PEA-PME ceiling */
        combinedCeiling: number;
        /** Legal reference */
        legalReference: string;
    };

    // --- Capital loss carryforward ---
    lossCarryforward: {
        /** Maximum years losses can be carried forward */
        maxYears: number;
        /** Legal reference */
        legalReference: string;
    };

    // --- Foreign account declarations ---
    foreignAccounts: {
        /** Whether declaration is required for foreign bank accounts */
        bankAccountsRequired: boolean;
        /** Whether declaration is required for foreign crypto/digital asset accounts */
        cryptoAccountsRequired: boolean;
        /** Applicable form for bank accounts */
        bankForm: string;
        /** Applicable form for crypto accounts */
        cryptoForm: string;
        /** Fine per undeclared account */
        finePerAccount: number;
        /** Maximum fine percentage of account balance */
        maxFinePercent?: number;
        /** Legal reference */
        legalReference: string;
    };

    // --- Key form/case definitions ---
    formCases: FormCaseDefinition[];

    // --- Declaration calendar ---
    calendar: {
        /** IFU reception period */
        ifuReceptionStart: string;
        ifuReceptionEnd: string;
        /** Online declaration opening */
        declarationOpening: string;
        /** Paper declaration deadline */
        paperDeclarationDeadline?: string;
        /** Declaration deadline (latest zone) */
        declarationDeadline: string;
        /** Deadlines by French zone */
        zoneDeadlines?: {
            zone1: string; // 01 to 19 & non-residents
            zone2: string; // 20 to 54
            zone3: string; // 55 to 976
        };
        /** Tax notice reception */
        taxNoticeDate: string;
        /** Year-end tax planning deadline */
        yearEndDeadline: string;
        /** Data source */
        source?: 'online' | 'computed';
        lastUpdated?: string;
    };
}

// ============================================================================
// FISCAL YEAR 2024 (Revenus 2024 → Déclaration 2025)
// ============================================================================

const RULES_2024: FiscalYearRules = {
    country: 'FR',
    year: '2024',
    declarationYear: '2025',

    pfu: {
        totalRate: 0.30,
        irRate: 0.128,
        socialRate: 0.172,
    },

    socialContributions: {
        totalRate: 0.172,
        csgRate: 0.092,
        crdsRate: 0.005,
        solidarityRate: 0.075,
        deductibleCSGRate: 0.068,
    },

    irBrackets: [
        { min: 0, max: 11294, rate: 0 },
        { min: 11294, max: 28797, rate: 0.11 },
        { min: 28797, max: 82341, rate: 0.30 },
        { min: 82341, max: 177106, rate: 0.41 },
        { min: 177106, max: Infinity, rate: 0.45 },
    ],

    dividends: {
        abatementRate: 0.40,
        hasAbatement: true,
        legalReference: `${CGI_ARTICLES.ART_200_A} — Abattement de 40 % sur les dividendes (option barème)`,
    },

    crypto: {
        exemptionThreshold: 305,
        pfuRate: 0.30,
        cryptoCryptoNeutral: true,
        legalReference: CGI_ARTICLES.ART_150_VH_BIS,
        stablecoinAsCrypto: true,
    },

    pea: {
        taxByAge: [
            {
                minAgeYears: 0,
                maxAgeYears: 2,
                incomeTaxRate: 0.225,
                socialRate: 0.172,
                closesOnWithdrawal: true,
                description: 'Retrait avant 2 ans : clôture du plan, gain taxé à 22,5 % + 17,2 % PS',
                legalReference: CGI_ARTICLES.ART_163_QUINQUIES_D,
            },
            {
                minAgeYears: 2,
                maxAgeYears: 5,
                incomeTaxRate: 0.19,
                socialRate: 0.172,
                closesOnWithdrawal: true,
                description: 'Retrait entre 2 et 5 ans : clôture du plan, gain taxé à 19 % + 17,2 % PS',
                legalReference: CGI_ARTICLES.ART_163_QUINQUIES_D,
            },
            {
                minAgeYears: 5,
                maxAgeYears: Infinity,
                incomeTaxRate: 0,
                socialRate: 0.172,
                closesOnWithdrawal: false,
                description: 'Retrait après 5 ans : exonération IR, soumis aux PS (17,2 %). Le retrait partiel ne clôture pas le plan.',
                legalReference: `${CGI_ARTICLES.ART_163_QUINQUIES_D} — BOI-RPPM-RCM-40-50`,
            },
        ],
        maxDeposit: 150000,
        maxDepositPME: 225000,
        combinedCeiling: 225000,
        legalReference: CGI_ARTICLES.ART_163_QUINQUIES_D,
    },

    lossCarryforward: {
        maxYears: 10,
        legalReference: `${CGI_ARTICLES.ART_150_0_D} — Imputation des moins-values sur 10 ans`,
    },

    foreignAccounts: {
        bankAccountsRequired: true,
        cryptoAccountsRequired: true,
        bankForm: TAX_FORMS.FORM_3916,
        cryptoForm: TAX_FORMS.FORM_3916_BIS,
        finePerAccount: 1500,
        maxFinePercent: 5,
        legalReference: `${CGI_ARTICLES.ART_1649_A}, ${CGI_ARTICLES.ART_1649_BIS_C}, ${CGI_ARTICLES.ART_1736}`,
    },

    formCases: [
        // 2042 — Capital gains
        {
            form: TAX_FORMS.FORM_2042,
            caseId: '3VG',
            description: 'Net capital gains on securities (CTO)',
            descriptionFr: 'Plus-values nettes sur cessions de valeurs mobilières (CTO)',
            applicableTo: ['capital_gain'],
            legalReference: CGI_ARTICLES.ART_150_0_A,
        },
        {
            form: TAX_FORMS.FORM_2042,
            caseId: '3VH',
            description: 'Capital losses on securities (CTO)',
            descriptionFr: 'Moins-values nettes sur cessions de valeurs mobilières (CTO)',
            applicableTo: ['capital_loss'],
            legalReference: CGI_ARTICLES.ART_150_0_D,
        },
        // 2042 — Dividends / Income
        {
            form: TAX_FORMS.FORM_2042,
            caseId: '2DC',
            description: 'Dividends eligible for 40% allowance',
            descriptionFr: 'Revenus des actions et parts — Dividendes éligibles à l\'abattement de 40 %',
            applicableTo: ['dividend'],
        },
        {
            form: TAX_FORMS.FORM_2042,
            caseId: '2CK',
            description: 'Flat tax already withheld (prélèvement forfaitaire non libératoire)',
            descriptionFr: 'Prélèvement forfaitaire non libératoire déjà versé — Crédit d\'impôt',
            applicableTo: ['dividend', 'interest'],
        },
        {
            form: TAX_FORMS.FORM_2042,
            caseId: '2BH',
            description: 'Gross taxable dividends (barème option)',
            descriptionFr: 'Revenus distribués imposables — Montant brut des dividendes (option barème)',
            applicableTo: ['dividend'],
        },
        {
            form: TAX_FORMS.FORM_2042,
            caseId: '2CG',
            description: 'Foreign tax credit on dividends',
            descriptionFr: 'Crédit d\'impôt étranger — Retenue à la source étrangère sur dividendes',
            applicableTo: ['dividend'],
        },
        // 2042 — Barème option
        {
            form: TAX_FORMS.FORM_2042,
            caseId: '2OP',
            description: 'Option for progressive tax scale (barème) instead of PFU',
            descriptionFr: 'Option pour l\'imposition au barème progressif (case à cocher)',
            applicableTo: ['dividend', 'interest', 'capital_gain'],
        },
        // 2042-C — Crypto
        {
            form: TAX_FORMS.FORM_2042_C,
            caseId: '3AN',
            description: 'Net crypto capital gains (Art. 150 VH bis)',
            descriptionFr: 'Plus-values sur actifs numériques (Art. 150 VH bis du CGI)',
            applicableTo: ['crypto_gain'],
            legalReference: CGI_ARTICLES.ART_150_VH_BIS,
        },
        {
            form: TAX_FORMS.FORM_2042_C,
            caseId: '3BN',
            description: 'Net crypto capital losses (Art. 150 VH bis)',
            descriptionFr: 'Moins-values sur actifs numériques (Art. 150 VH bis du CGI)',
            applicableTo: ['crypto_loss'],
            legalReference: CGI_ARTICLES.ART_150_VH_BIS,
        },
    ],

    calendar: {
        ifuReceptionStart: '2025-02-15',
        ifuReceptionEnd: '2025-03-31',
        declarationOpening: '2025-04-10',
        declarationDeadline: '2025-06-05',
        taxNoticeDate: '2025-07-25',
        yearEndDeadline: '2024-12-31',
    },
};

// ============================================================================
// FISCAL YEAR 2025 (Revenus 2025 → Déclaration 2026)
// ============================================================================

const RULES_2025: FiscalYearRules = {
    country: 'FR',
    year: '2025',
    declarationYear: '2026',

    pfu: {
        totalRate: 0.30,
        irRate: 0.128,
        socialRate: 0.172,
    },

    socialContributions: {
        totalRate: 0.172,
        csgRate: 0.092,
        crdsRate: 0.005,
        solidarityRate: 0.075,
        deductibleCSGRate: 0.068,
    },

    // 2025 brackets (indexed for inflation — to be confirmed with LFI 2025 publication)
    irBrackets: [
        { min: 0, max: 11497, rate: 0 },
        { min: 11497, max: 29315, rate: 0.11 },
        { min: 29315, max: 83823, rate: 0.30 },
        { min: 83823, max: 180294, rate: 0.41 },
        { min: 180294, max: Infinity, rate: 0.45 },
    ],

    dividends: {
        abatementRate: 0.40,
        hasAbatement: true,
        legalReference: `${CGI_ARTICLES.ART_200_A} — Abattement de 40 % sur les dividendes (option barème)`,
    },

    crypto: {
        exemptionThreshold: 305,
        pfuRate: 0.30,
        cryptoCryptoNeutral: true,
        legalReference: CGI_ARTICLES.ART_150_VH_BIS,
        stablecoinAsCrypto: true,
    },

    pea: {
        taxByAge: [
            {
                minAgeYears: 0,
                maxAgeYears: 2,
                incomeTaxRate: 0.225,
                socialRate: 0.172,
                closesOnWithdrawal: true,
                description: 'Retrait avant 2 ans : clôture du plan, gain taxé à 22,5 % + 17,2 % PS',
                legalReference: CGI_ARTICLES.ART_163_QUINQUIES_D,
            },
            {
                minAgeYears: 2,
                maxAgeYears: 5,
                incomeTaxRate: 0.19,
                socialRate: 0.172,
                closesOnWithdrawal: true,
                description: 'Retrait entre 2 et 5 ans : clôture du plan, gain taxé à 19 % + 17,2 % PS',
                legalReference: CGI_ARTICLES.ART_163_QUINQUIES_D,
            },
            {
                minAgeYears: 5,
                maxAgeYears: Infinity,
                incomeTaxRate: 0,
                socialRate: 0.172,
                closesOnWithdrawal: false,
                description: 'Retrait après 5 ans : exonération IR, soumis aux PS (17,2 %). Le retrait partiel ne clôture pas le plan.',
                legalReference: `${CGI_ARTICLES.ART_163_QUINQUIES_D} — BOI-RPPM-RCM-40-50`,
            },
        ],
        maxDeposit: 150000,
        maxDepositPME: 225000,
        combinedCeiling: 225000,
        legalReference: CGI_ARTICLES.ART_163_QUINQUIES_D,
    },

    lossCarryforward: {
        maxYears: 10,
        legalReference: `${CGI_ARTICLES.ART_150_0_D} — Imputation des moins-values sur 10 ans`,
    },

    foreignAccounts: {
        bankAccountsRequired: true,
        cryptoAccountsRequired: true,
        bankForm: TAX_FORMS.FORM_3916,
        cryptoForm: TAX_FORMS.FORM_3916_BIS,
        finePerAccount: 1500,
        maxFinePercent: 5,
        legalReference: `${CGI_ARTICLES.ART_1649_A}, ${CGI_ARTICLES.ART_1649_BIS_C}, ${CGI_ARTICLES.ART_1736}`,
    },

    formCases: [
        // Same structure as 2024 — cases are verified against millésime 2026 forms
        {
            form: TAX_FORMS.FORM_2042,
            caseId: '3VG',
            description: 'Net capital gains on securities (CTO)',
            descriptionFr: 'Plus-values nettes sur cessions de valeurs mobilières (CTO)',
            applicableTo: ['capital_gain'],
            legalReference: CGI_ARTICLES.ART_150_0_A,
        },
        {
            form: TAX_FORMS.FORM_2042,
            caseId: '3VH',
            description: 'Capital losses on securities (CTO)',
            descriptionFr: 'Moins-values nettes sur cessions de valeurs mobilières (CTO)',
            applicableTo: ['capital_loss'],
            legalReference: CGI_ARTICLES.ART_150_0_D,
        },
        {
            form: TAX_FORMS.FORM_2042,
            caseId: '2DC',
            description: 'Dividends eligible for 40% allowance',
            descriptionFr: 'Revenus des actions et parts — Dividendes éligibles à l\'abattement de 40 %',
            applicableTo: ['dividend'],
        },
        {
            form: TAX_FORMS.FORM_2042,
            caseId: '2CK',
            description: 'Flat tax already withheld',
            descriptionFr: 'Prélèvement forfaitaire non libératoire déjà versé — Crédit d\'impôt',
            applicableTo: ['dividend', 'interest'],
        },
        {
            form: TAX_FORMS.FORM_2042,
            caseId: '2BH',
            description: 'Gross taxable dividends (barème option)',
            descriptionFr: 'Revenus distribués imposables — Montant brut des dividendes (option barème)',
            applicableTo: ['dividend'],
        },
        {
            form: TAX_FORMS.FORM_2042,
            caseId: '2CG',
            description: 'Foreign tax credit on dividends',
            descriptionFr: 'Crédit d\'impôt étranger — Retenue à la source étrangère sur dividendes',
            applicableTo: ['dividend'],
        },
        {
            form: TAX_FORMS.FORM_2042,
            caseId: '2OP',
            description: 'Option for progressive tax scale instead of PFU',
            descriptionFr: 'Option pour l\'imposition au barème progressif (case à cocher)',
            applicableTo: ['dividend', 'interest', 'capital_gain'],
        },
        {
            form: TAX_FORMS.FORM_2042_C,
            caseId: '3AN',
            description: 'Net crypto capital gains (Art. 150 VH bis)',
            descriptionFr: 'Plus-values sur actifs numériques (Art. 150 VH bis du CGI)',
            applicableTo: ['crypto_gain'],
            legalReference: CGI_ARTICLES.ART_150_VH_BIS,
        },
        {
            form: TAX_FORMS.FORM_2042_C,
            caseId: '3BN',
            description: 'Net crypto capital losses (Art. 150 VH bis)',
            descriptionFr: 'Moins-values sur actifs numériques (Art. 150 VH bis du CGI)',
            applicableTo: ['crypto_loss'],
            legalReference: CGI_ARTICLES.ART_150_VH_BIS,
        },
    ],

    calendar: {
        ifuReceptionStart: '2026-02-15',
        ifuReceptionEnd: '2026-03-31',
        declarationOpening: '2026-04-09',
        declarationDeadline: '2026-06-04',
        taxNoticeDate: '2026-07-25',
        yearEndDeadline: '2025-12-31',
    },
};

// ============================================================================
// RULES REGISTRY
// ============================================================================

/**
 * Rules registry — keyed by country (ISO 3166-1 alpha-2) → year.
 * 
 * To add support for a new country (e.g., Belgium 'BE'), create a new
 * RULES_BE_2024 object implementing FiscalYearRules with country: 'BE'
 * and add it here under FISCAL_RULES_BY_COUNTRY['BE'].
 * 
 * Currently only France ('FR') is implemented.
 */
const FISCAL_RULES_BY_COUNTRY: Record<string, Record<string, FiscalYearRules>> = {
    FR: {
        '2024': RULES_2024,
        '2025': RULES_2025,
    },
    // Future: BE: { '2024': RULES_BE_2024 }, DE: { ... }, etc.
};

/** Default tax residence country */
export const DEFAULT_TAX_COUNTRY = 'FR';

/** Get all supported countries */
export function getSupportedCountries(): string[] {
    return Object.keys(FISCAL_RULES_BY_COUNTRY).sort();
}

/**
 * Get fiscal rules for a specific country and year.
 * Incorporates dynamic internet/computed calendar.
 * @param year Fiscal year (e.g., '2024', '2025', '2026', ...)
 * @param country ISO 3166-1 alpha-2 country code (default: 'FR')
 */
export function getFiscalRules(year: string, country: string = DEFAULT_TAX_COUNTRY): FiscalYearRules | undefined {
    let rules = FISCAL_RULES_BY_COUNTRY[country]?.[year];

    // For future or unlisted years in France, extrapolate based on latest known rules (2025)
    if (!rules && country === 'FR') {
        const yearNum = parseInt(year, 10);
        if (!isNaN(yearNum)) {
            const template = RULES_2025;
            rules = {
                ...template,
                year,
                declarationYear: String(yearNum + 1),
                calendar: computeFrenchTaxCalendar(year),
            };
        }
    }

    if (rules && country === 'FR') {
        return {
            ...rules,
            calendar: getEffectiveCalendar(year),
        };
    }

    return rules;
}

/**
 * Get fiscal rules for a specific country and year, throwing if not found.
 */
export function getFiscalRulesOrThrow(year: string, country: string = DEFAULT_TAX_COUNTRY): FiscalYearRules {
    const rules = getFiscalRules(year, country);
    if (!rules) {
        throw new Error(`Fiscal rules not available for ${country}/${year}. Supported countries: ${getSupportedCountries().join(', ')}`);
    }
    return rules;
}

/**
 * Get all supported fiscal years for a given country.
 */
export function getSupportedYears(country: string = DEFAULT_TAX_COUNTRY): string[] {
    const countryRules = FISCAL_RULES_BY_COUNTRY[country];
    const registeredYears = countryRules ? Object.keys(countryRules) : [];
    const currentYear = new Date().getFullYear();
    // Ensure current year and previous 2 years are in the list
    const candidateYears = new Set([...registeredYears, String(currentYear - 1), String(currentYear)]);
    return Array.from(candidateYears).sort();
}

/**
 * Calculate the marginal tax rate (TMI) for a given taxable income per fiscal share.
 */
export function calculateTMI(taxableIncomePerShare: number, year: string, country: string = DEFAULT_TAX_COUNTRY): number {
    const rules = getFiscalRulesOrThrow(year, country);
    for (const bracket of rules.irBrackets) {
        if (taxableIncomePerShare >= bracket.min && taxableIncomePerShare < bracket.max) {
            return bracket.rate;
        }
    }
    return rules.irBrackets[rules.irBrackets.length - 1].rate;
}

/**
 * Calculate the income tax amount using the barème progressif.
 * Returns the tax for ONE fiscal share.
 */
export function calculateIRPerShare(taxableIncomePerShare: number, year: string, country: string = DEFAULT_TAX_COUNTRY): number {
    const rules = getFiscalRulesOrThrow(year, country);
    let tax = 0;
    for (const bracket of rules.irBrackets) {
        if (taxableIncomePerShare <= bracket.min) break;
        const taxableInBracket = Math.min(taxableIncomePerShare, bracket.max) - bracket.min;
        tax += taxableInBracket * bracket.rate;
    }
    return tax;
}

/**
 * Determine PEA tax treatment based on plan age at withdrawal date.
 * Note: PEA is specific to France. Other countries may have equivalent
 * tax-advantaged wrappers with different rules.
 */
export function getPEATaxRule(
    planOpenDate: string,
    withdrawalDate: string,
    year: string,
    country: string = DEFAULT_TAX_COUNTRY
): PEATaxRule {
    const rules = getFiscalRulesOrThrow(year, country);
    const openMs = new Date(planOpenDate).getTime();
    const withdrawMs = new Date(withdrawalDate).getTime();
    const ageYears = (withdrawMs - openMs) / (1000 * 60 * 60 * 24 * 365.25);

    for (const rule of rules.pea.taxByAge) {
        if (ageYears >= rule.minAgeYears && ageYears < rule.maxAgeYears) {
            return rule;
        }
    }
    // Fallback to last rule (after 5 years)
    return rules.pea.taxByAge[rules.pea.taxByAge.length - 1];
}
