/**
 * Fiscal Module — Barrel Export
 * 
 * Re-exports all public APIs from the fiscal module.
 */

export { taxService } from './taxService';
export type { OptimizationSuggestion } from './taxService';

export {
    getFiscalRules,
    getFiscalRulesOrThrow,
    getSupportedYears,
    getSupportedCountries,
    DEFAULT_TAX_COUNTRY,
    calculateTMI,
    calculateIRPerShare,
    getPEATaxRule,
} from './taxRules';

export type {
    FiscalYearRules,
    IRBracket,
    PEATaxRule,
    FormCaseDefinition,
} from './taxRules';
