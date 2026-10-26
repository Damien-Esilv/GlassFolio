/**
 * Tax Engine — Pure Fiscal Calculation Functions
 * 
 * This module contains PURE functions with NO side effects and NO DB access.
 * All data is passed in as parameters. The orchestration layer (taxService.ts)
 * is responsible for loading data from the DB and calling these functions.
 * 
 * Each function returns results with a `confidence` field indicating data quality.
 * 
 * Currently implements French (FR) tax calculations only.
 * The country-scoped rules architecture in taxRules.ts enables future extension.
 */

import {
    UnifiedTransaction,
    Account,
    Institute,
    Instrument,
    TaxableEvent,
    TaxSummaryResult,
    ForeignAccountObligation,
    FormCaseMapping,
    FiscalConfidence,
    FiscalProfile,
    WrapperType,
} from '../../types/types.backend';

import {
    getFiscalRulesOrThrow,
    calculateIRPerShare,
    FiscalYearRules,
} from './taxRules';

import {
    isTaxableWrapper,
    isPEAWrapper,
    CGI_ARTICLES,
} from '../../constants/fiscalConstants';

import {
    buildRealizedEvents,
    resolveFee,
    resolveGrossValue,
    resolveQuantity,
    sortChronologically,
    QTY_EPSILON,
} from '../portfolio/positionLedger';

// ============================================================================
// HELPER TYPES
// ============================================================================

export interface EnrichedTransaction extends UnifiedTransaction {
    account?: Account;
    institute?: Institute;
    instrument?: Instrument;
    resolvedWrapperType?: WrapperType;
}

interface CostBasisEntry {
    totalCost: number;
    totalQuantity: number;
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Filter transactions to a specific fiscal year.
 */
function filterByFiscalYear(txs: UnifiedTransaction[], year: string): UnifiedTransaction[] {
    const yearStart = new Date(`${year}-01-01T00:00:00Z`).getTime();
    const yearEnd = new Date(`${parseInt(year) + 1}-01-01T00:00:00Z`).getTime();
    return txs.filter(tx => {
        const d = new Date(tx.transactionDate).getTime();
        return d >= yearStart && d < yearEnd;
    });
}

/**
 * Fast fiscal year extractor from transaction date string.
 * Uses O(1) string slicing for ISO 8601 strings (YYYY-MM-DD), with fallback to Date parsing.
 */
function getFiscalYearFromDate(dateStr: string | undefined): string {
    if (!dateStr || dateStr.length < 4) return '';
    if (dateStr.length >= 10 && dateStr.charAt(4) === '-' && dateStr.charAt(7) === '-') {
        return dateStr.substring(0, 4);
    }
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? '' : parsed.getFullYear().toString();
}

/**
 * Enrich transactions with account, institute, and instrument info.
 * BOLT OPTIMIZATION:
 * Pre-build stack-scoped O(1) Map lookups for accounts, institutes, and instruments
 * to eliminate O(N * (A + I + Inst)) linear array searches on every mapped transaction.
 */
function enrichTransactions(
    txs: UnifiedTransaction[],
    accounts: Account[],
    institutes: Institute[],
    instruments: Instrument[]
): EnrichedTransaction[] {
    const accountMap = new Map(accounts.map(a => [a.id, a]));
    const instituteMap = new Map(institutes.map(i => [i.id, i]));
    const instrumentMap = new Map(instruments.map(i => [i.id, i]));

    return txs.map(tx => {
        const account = tx.accountId ? accountMap.get(tx.accountId) : undefined;
        const institute = account?.instituteId ? instituteMap.get(account.instituteId) : undefined;
        const instrument = tx.instrumentId ? instrumentMap.get(tx.instrumentId) : undefined;
        return {
            ...tx,
            account,
            institute,
            instrument,
            resolvedWrapperType: account?.wrapperType || 'CTO',
        };
    });
}

/**
 * Determine if a transaction is a crypto instrument.
 */
function isCryptoTransaction(tx: EnrichedTransaction): boolean {
    return tx.instrument?.type === 'crypto';
}

/**
 * Determine if a transaction represents a taxable cession to fiat.
 * Crypto-to-crypto exchanges are tax-neutral under current French rules.
 */
function isCryptoToFiatCession(tx: EnrichedTransaction): boolean {
    if (!isCryptoTransaction(tx)) return false;
    if (tx.type !== 'SELL') return false;
    // A SELL of crypto is treated as a cession to fiat (taxable)
    // unless the counterpart is another crypto (which would be recorded differently)
    return true;
}

// ============================================================================
// SHARED HELPERS FOR CAPITAL GAINS
// ============================================================================

/** Currency of a taxable event: the currency of the row's amounts */
function eventCurrency(tx: EnrichedTransaction): string {
    return tx.originalCurrency || tx.instrument?.denominationCurrency || 'EUR';
}

/** Amounts in a foreign currency with no recorded exchange rate cannot be declared in EUR as is */
function lacksFxRate(currency: string, tx: EnrichedTransaction): boolean {
    return currency !== 'EUR' && !tx.fxRate;
}

const symbolOf = (tx: EnrichedTransaction): string =>
    tx.assetSymbol || tx.instrument?.marketIdentifier.symbol || '';

// ============================================================================
// CAPITAL GAINS — CTO (Art. 150-0 A and 150-0 D CGI)
// ============================================================================

/**
 * Calculate PMP (Prix Moyen Pondéré) based capital gains for CTO accounts.
 * Replays the shared position ledger (same quantity, fee and adjustment rules as the portfolio
 * screens) in weighted-average mode: the PMP is mandatory for securities, whatever cost basis
 * method the account displays.
 *
 * PMP = (Total cost of acquisitions including fees) / Total quantity held
 * Gain = Sale proceeds - (PMP × quantity sold) - sale fees
 *
 * A sale that exceeds the recorded holdings is declared with the missing part at zero cost
 * (conservative), flagged `quantity_exceeds_holdings`.
 */
export function calculateCTOCapitalGains(
    allTransactions: EnrichedTransaction[],
    fiscalYear: string,
    rules: FiscalYearRules
): TaxableEvent[] {
    const events: TaxableEvent[] = [];
    const yearEnd = new Date(`${parseInt(fiscalYear) + 1}-01-01T00:00:00Z`).getTime();

    // Group transactions by (accountId, instrumentId) for CTO accounts only
    const groups = new Map<string, EnrichedTransaction[]>();

    for (const tx of allTransactions) {
        if (!isTaxableWrapper(tx.resolvedWrapperType)) continue;
        if (isCryptoTransaction(tx)) continue; // Crypto handled separately
        if (!tx.instrumentId || tx.instrument?.type === 'cash') continue;
        if (new Date(tx.transactionDate).getTime() >= yearEnd) continue;

        const key = `${tx.accountId}:${tx.instrumentId}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(tx);
    }

    for (const groupTxs of groups.values()) {
        const byId = new Map(groupTxs.map(tx => [tx.id, tx]));
        const sales = buildRealizedEvents(groupTxs, { keyOf: () => 'pmp', methodFor: () => 'WAC' });

        for (const sale of sales) {
            if (getFiscalYearFromDate(sale.date) !== fiscalYear) continue;
            const tx = byId.get(sale.txId);
            if (!tx) continue;

            const quantity = resolveQuantity(tx);
            const saleProceeds = resolveGrossValue(tx, quantity);
            const fees = resolveFee(tx);
            const acquisitionCost = sale.costRemoved;
            const taxableAmount = saleProceeds - acquisitionCost - fees;
            const pmp = sale.quantity > 0 ? acquisitionCost / sale.quantity : 0;

            const missingData: string[] = [];
            if (acquisitionCost <= 0) missingData.push('acquisition_cost_unknown');
            if (quantity - sale.quantity > QTY_EPSILON) missingData.push('quantity_exceeds_holdings');
            const currency = eventCurrency(tx);
            if (lacksFxRate(currency, tx)) missingData.push('fx_rate_missing');
            const confidence: FiscalConfidence = missingData.length === 0 ? 'determined' : 'estimated';

            events.push({
                transactionIds: [tx.id],
                fiscalYear,
                eventType: taxableAmount >= 0 ? 'capital_gain' : 'capital_loss',
                symbol: tx.assetSymbol || tx.instrument?.marketIdentifier.symbol || 'UNKNOWN',
                instrumentName: tx.instrument?.name || tx.label || 'Unknown',
                accountId: tx.accountId,
                wrapperType: tx.resolvedWrapperType,
                grossAmount: saleProceeds,
                acquisitionCost,
                taxableAmount,
                fees,
                currency,
                eventDate: tx.transactionDate,
                confidence,
                explanation: `PMP: ${pmp.toFixed(4)} × ${sale.quantity} = ${acquisitionCost.toFixed(2)}€ cost basis. Sale proceeds: ${saleProceeds.toFixed(2)}€. Net: ${taxableAmount.toFixed(2)}€`,
                legalReference: CGI_ARTICLES.ART_150_0_A,
                missingData: missingData.length > 0 ? missingData : undefined,
            });
        }
    }

    return events;
}

// ============================================================================
// CRYPTO GAINS — Art. 150 VH bis CGI
// ============================================================================

/** A transfer between own wallets: the deposit arrives within a week, minus at most 2% network fees */
const TRANSFER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const TRANSFER_FEE_TOLERANCE = 0.02;

/**
 * Pair each crypto DEPOSIT with the WITHDRAW it comes from (same asset, same amount minus
 * network fees, within a week). Both legs are tax-neutral: moving coins between your own wallets
 * is neither a cession nor an acquisition.
 */
function findOwnTransfers(cryptoTxs: EnrichedTransaction[]): Set<string> {
    const neutral = new Set<string>();
    const withdrawals = cryptoTxs.filter(tx => tx.type === 'WITHDRAW');
    const time = (tx: EnrichedTransaction): number => new Date(tx.transactionDate).getTime();

    for (const deposit of cryptoTxs.filter(tx => tx.type === 'DEPOSIT')) {
        const received = resolveQuantity(deposit);
        let source: EnrichedTransaction | undefined;
        let closest = Infinity;

        for (const withdrawal of withdrawals) {
            if (neutral.has(withdrawal.id) || symbolOf(withdrawal) !== symbolOf(deposit)) continue;
            const sent = resolveQuantity(withdrawal);
            if (sent <= 0 || received > sent * (1 + 1e-9) || (sent - received) / sent > TRANSFER_FEE_TOLERANCE) continue;
            const gap = Math.abs(time(withdrawal) - time(deposit));
            if (gap <= TRANSFER_WINDOW_MS && gap < closest) {
                source = withdrawal;
                closest = gap;
            }
        }

        if (source) {
            neutral.add(source.id);
            neutral.add(deposit.id);
        }
    }

    return neutral;
}

/**
 * Calculate crypto capital gains using the French formula (Art. 150 VH bis).
 * 
 * Formula per cession:
 *   Plus-value = Prix de cession − (Prix total d'acquisition × Prix de cession / Valeur globale du portefeuille)
 * 
 * Key rules:
 *   - After every cession (this year or an earlier one) the total acquisition price is reduced
 *     by the fraction of it contained in the cession price
 *   - The portfolio value is that of ALL crypto assets held just before the cession; assets with
 *     no known price are left out and flagged `portfolio_valuation_incomplete`
 *   - Moves between own wallets (withdrawal + matching deposit) are neutral
 *   - Crypto-to-crypto exchanges are tax-neutral
 *   - Only cessions to fiat (or payment for goods/services) trigger taxation
 *   - Below 305€ total annual cessions: exempt (but still declarable)
 *   - Losses can offset gains within the same year but NOT carried forward
 */
export function calculateCryptoGains(
    allTransactions: EnrichedTransaction[],
    fiscalYear: string,
    rules: FiscalYearRules
): TaxableEvent[] {
    const events: TaxableEvent[] = [];
    const yearEnd = new Date(`${parseInt(fiscalYear) + 1}-01-01T00:00:00Z`).getTime();

    // Global crypto portfolio, replayed chronologically up to the end of the fiscal year
    const cryptoTxs = sortChronologically(allTransactions.filter(tx => isCryptoTransaction(tx) && tx.isFiscal));
    const ownTransfers = findOwnTransfers(cryptoTxs);

    // Total acquisition price of the whole portfolio (reduced after every cession)
    let totalAcquisitionCost = 0;
    const holdings = new Map<string, number>();
    const lastPrice = new Map<string, number>();

    for (const tx of cryptoTxs) {
        if (new Date(tx.transactionDate).getTime() >= yearEnd) break;
        if (ownTransfers.has(tx.id)) continue;

        const symbol = symbolOf(tx);
        const quantity = resolveQuantity(tx);
        const gross = resolveGrossValue(tx, quantity);
        const fees = resolveFee(tx);
        const explicitPrice = parseFloat(tx.priceUnit || '0');
        const unitPrice = explicitPrice > 0 ? explicitPrice : (quantity > 0 && gross > 0 ? gross / quantity : undefined);
        if (unitPrice !== undefined) lastPrice.set(symbol, unitPrice);

        if (tx.type === 'BUY' || tx.type === 'DEPOSIT') {
            totalAcquisitionCost += gross + fees;
            holdings.set(symbol, (holdings.get(symbol) ?? 0) + quantity);
        } else if (isCryptoToFiatCession(tx)) {
            // Value of every held asset just before the cession, at its last known price
            let portfolioValue = 0;
            let priceMissing = false;
            for (const [asset, held] of holdings) {
                if (held <= QTY_EPSILON) continue;
                const price = lastPrice.get(asset);
                if (price === undefined) priceMissing = true;
                else portfolioValue += held * price;
            }

            const cessionPrice = gross;
            const fractionOfPortfolio = portfolioValue > 0 ? Math.min(1, cessionPrice / portfolioValue) : 0;
            const costBasisForCession = totalAcquisitionCost * fractionOfPortfolio;
            const taxableAmount = cessionPrice - costBasisForCession - fees;

            if (getFiscalYearFromDate(tx.transactionDate) === fiscalYear) {
                const currency = eventCurrency(tx);
                const missingData: string[] = [];
                const confidence: FiscalConfidence = portfolioValue > 0 ? 'estimated' : 'insufficient_data';
                if (confidence === 'estimated') {
                    missingData.push('portfolio_valuation_approximated');
                    if (priceMissing) missingData.push('portfolio_valuation_incomplete');
                }
                if (lacksFxRate(currency, tx)) missingData.push('fx_rate_missing');

                events.push({
                    transactionIds: [tx.id],
                    fiscalYear,
                    eventType: taxableAmount >= 0 ? 'crypto_gain' : 'crypto_loss',
                    symbol,
                    instrumentName: tx.instrument?.name || symbol,
                    accountId: tx.accountId,
                    wrapperType: tx.resolvedWrapperType,
                    grossAmount: cessionPrice,
                    acquisitionCost: costBasisForCession,
                    taxableAmount,
                    fees,
                    currency,
                    eventDate: tx.transactionDate,
                    confidence,
                    explanation: `Art. 150 VH bis: Cession ${cessionPrice.toFixed(2)}€ − (${totalAcquisitionCost.toFixed(2)}€ × ${cessionPrice.toFixed(2)}€ / ${portfolioValue.toFixed(2)}€) = ${taxableAmount.toFixed(2)}€`,
                    legalReference: CGI_ARTICLES.ART_150_VH_BIS,
                    missingData: missingData.length > 0 ? missingData : undefined,
                });
            }

            // The acquisition price carried forward shrinks by the share contained in this cession,
            // whether or not it falls in the declared year
            totalAcquisitionCost = Math.max(0, totalAcquisitionCost - costBasisForCession);
            holdings.set(symbol, Math.max(0, (holdings.get(symbol) ?? 0) - quantity));
        }
    }

    return events;
}

// ============================================================================
// DIVIDEND / INCOME TAX
// ============================================================================

/**
 * Calculate tax on dividends and interest income for a fiscal year.
 */
export function calculateDividendTax(
    allTransactions: EnrichedTransaction[],
    fiscalYear: string,
    rules: FiscalYearRules
): TaxableEvent[] {
    const events: TaxableEvent[] = [];

    const incomeTxs = allTransactions.filter(tx => {
        const txYear = getFiscalYearFromDate(tx.transactionDate);
        if (txYear !== fiscalYear) return false;
        if (!tx.isFiscal) return false;
        return tx.type === 'INCOME' || tx.subType === 'DIVIDEND' || tx.subType === 'INTEREST';
    });

    for (const tx of incomeTxs) {
        const amount = Math.abs(parseFloat(tx.amountPrimary || '0'));
        const withholdingTax = parseFloat(tx.taxAmount || '0');
        const fees = parseFloat(tx.feeAmount || '0');

        let eventType: TaxableEvent['eventType'] = 'other_income';
        if (tx.subType === 'DIVIDEND') eventType = 'dividend';
        else if (tx.subType === 'INTEREST') eventType = 'interest';
        else if (tx.subType === 'STAKING_REWARD') eventType = 'staking_reward';
        else if (tx.rawType?.toLowerCase().includes('dividend')) eventType = 'dividend';
        else if (tx.rawType?.toLowerCase().includes('interest')) eventType = 'interest';
        else if (tx.rawType?.toLowerCase().includes('coupon')) eventType = 'coupon';

        const isDividend = eventType === 'dividend';
        
        // For PEA: dividends are not taxable (reinvested internally)
        if (isPEAWrapper(tx.resolvedWrapperType) && isDividend) continue;

        const confidence: FiscalConfidence = 'determined';
        const symbol = tx.assetSymbol || tx.instrument?.marketIdentifier.symbol || '';

        events.push({
            transactionIds: [tx.id],
            fiscalYear,
            eventType,
            symbol,
            instrumentName: tx.instrument?.name || tx.label || 'Unknown',
            accountId: tx.accountId,
            wrapperType: tx.resolvedWrapperType,
            grossAmount: amount,
            acquisitionCost: 0,
            taxableAmount: amount, // Gross amount is taxable (PFU or barème applied later)
            fees,
            currency: tx.originalCurrency || tx.instrument?.denominationCurrency || 'EUR',
            eventDate: tx.transactionDate,
            confidence,
            explanation: isDividend
                ? `Dividend: ${amount.toFixed(2)}€ brut. Withholding tax paid: ${withholdingTax.toFixed(2)}€. Eligible for 40% abatement if barème chosen.`
                : `Income: ${amount.toFixed(2)}€`,
            legalReference: isDividend ? `${CGI_ARTICLES.ART_200_A}` : undefined,
        });
    }

    return events;
}

// ============================================================================
// PFU vs BARÈME COMPARISON (Option 2OP)
// ============================================================================

/**
 * Compare PFU (flat tax 30%) vs barème progressif for a fiscal year.
 * This helps the user decide whether to check box 2OP on their declaration.
 * 
 * Returns the tax amounts under each option so the user can choose.
 */
export function comparePFUvsBareme(
    events: TaxableEvent[],
    profile: FiscalProfile,
    rules: FiscalYearRules
): { pfuTotal: number; baremeTotal: number; recommendation: 'PFU' | 'BAREME' | 'NEUTRAL'; confidence: FiscalConfidence } {
    const shares = profile.fiscalShares || 1;
    const otherIncome = profile.otherTaxableIncome || 0;

    // --- PFU calculation ---
    let pfuTotal = 0;
    for (const event of events) {
        if (event.eventType === 'capital_gain' || event.eventType === 'capital_loss') {
            pfuTotal += Math.max(0, event.taxableAmount) * rules.pfu.totalRate;
        } else if (event.eventType === 'dividend' || event.eventType === 'interest') {
            pfuTotal += event.taxableAmount * rules.pfu.totalRate;
        }
    }

    // --- Barème calculation ---
    // Dividends get 40% abatement under barème
    let baremeIncome = otherIncome;
    let socialContribTotal = 0;

    for (const event of events) {
        if (event.eventType === 'dividend' && rules.dividends.hasAbatement) {
            baremeIncome += event.taxableAmount * (1 - rules.dividends.abatementRate);
            socialContribTotal += event.taxableAmount * rules.socialContributions.totalRate;
        } else if (event.eventType === 'interest') {
            baremeIncome += event.taxableAmount;
            socialContribTotal += event.taxableAmount * rules.socialContributions.totalRate;
        } else if (event.eventType === 'capital_gain') {
            baremeIncome += event.taxableAmount;
            socialContribTotal += Math.max(0, event.taxableAmount) * rules.socialContributions.totalRate;
        } else if (event.eventType === 'capital_loss') {
            baremeIncome += event.taxableAmount; // Negative value
        }
    }

    const irPerShare = calculateIRPerShare(baremeIncome / shares, rules.year, rules.country);
    const baremeIR = irPerShare * shares;
    // Deductible CSG reduces taxable income
    const deductibleCSG = socialContribTotal * (rules.socialContributions.deductibleCSGRate / rules.socialContributions.totalRate);
    const baremeTotal = baremeIR + socialContribTotal - deductibleCSG;

    const confidence: FiscalConfidence = profile.otherTaxableIncome !== undefined ? 'estimated' : 'insufficient_data';
    
    let recommendation: 'PFU' | 'BAREME' | 'NEUTRAL' = 'NEUTRAL';
    if (confidence !== 'insufficient_data') {
        const diff = pfuTotal - baremeTotal;
        if (Math.abs(diff) < 10) recommendation = 'NEUTRAL';
        else recommendation = diff > 0 ? 'BAREME' : 'PFU';
    }

    return { pfuTotal, baremeTotal, recommendation, confidence };
}

// ============================================================================
// FOREIGN ACCOUNT DETECTION
// ============================================================================

/**
 * Detect foreign account declaration obligations.
 * A French tax resident must declare all accounts held outside France.
 */
export function detectForeignAccounts(
    institutes: Institute[],
    accounts: Account[]
): ForeignAccountObligation[] {
    const obligations: ForeignAccountObligation[] = [];

    // Group accounts by institute
    const accountsByInstitute = new Map<string, Account[]>();
    for (const acc of accounts) {
        if (!acc.isActive) continue;
        if (!accountsByInstitute.has(acc.instituteId)) {
            accountsByInstitute.set(acc.instituteId, []);
        }
        accountsByInstitute.get(acc.instituteId)!.push(acc);
    }

    for (const inst of institutes) {
        const country = inst.country;
        // If no country set, we can't determine — skip with warning
        if (!country) continue;
        if (country === 'FR') continue; // French accounts don't need declaration

        const instAccounts = accountsByInstitute.get(inst.id) || [];
        if (instAccounts.length === 0) continue;

        // Determine which form applies
        const isCrypto = inst.type === 'exchange' || inst.type === 'wallet';
        const form = isCrypto ? '3916-bis' as const : '3916' as const;

        obligations.push({
            instituteId: inst.id,
            instituteName: inst.name,
            country,
            accountIds: instAccounts.map(a => a.id),
            accountNames: instAccounts.map(a => a.name),
            form,
            reason: isCrypto
                ? `Compte d'actifs numériques détenu à l'étranger (${country}) — déclaration obligatoire formulaire 3916-bis`
                : `Compte bancaire / financier détenu à l'étranger (${country}) — déclaration obligatoire formulaire 3916`,
            certainty: country ? 'certain' : 'to_verify',
        });
    }

    return obligations;
}

// ============================================================================
// DATA QUALITY ASSESSMENT
// ============================================================================

/**
 * Assess data completeness for reliable fiscal calculations.
 */
export function assessDataCompleteness(
    events: TaxableEvent[]
): TaxSummaryResult['dataQuality'] {
    const totalEvents = events.length;
    let determinedCount = 0;
    let estimatedCount = 0;
    let insufficientCount = 0;
    let complexCount = 0;
    const missingDataSummary: string[] = [];
    const missingDataSet = new Set<string>();

    for (const event of events) {
        switch (event.confidence) {
            case 'determined': determinedCount++; break;
            case 'estimated': estimatedCount++; break;
            case 'insufficient_data': insufficientCount++; break;
            case 'complex': complexCount++; break;
        }
        if (event.missingData) {
            event.missingData.forEach(d => missingDataSet.add(d));
        }
    }

    missingDataSet.forEach(d => missingDataSummary.push(d));

    return {
        totalEvents,
        determinedCount,
        estimatedCount,
        insufficientCount,
        complexCount,
        missingDataSummary,
    };
}

// ============================================================================
// FORM/CASE MAPPING GENERATOR
// ============================================================================

/**
 * Generate form/case mappings from taxable events.
 */
export function generateFormMappings(
    events: TaxableEvent[],
    rules: FiscalYearRules
): FormCaseMapping[] {
    const mappings: FormCaseMapping[] = [];

    // BOLT OPTIMIZATION:
    // Pre-build O(1) Map for formCases to replace repeated linear .find() calls
    const formCaseMap = new Map(rules.formCases.map(c => [c.caseId, c]));

    // --- CTO Capital Gains (3VG) ---
    const ctoGains = events
        .filter(e => e.eventType === 'capital_gain' && isTaxableWrapper(e.wrapperType))
        .reduce((sum, e) => sum + e.taxableAmount, 0);

    if (ctoGains > 0) {
        const caseDef = formCaseMap.get('3VG');
        if (caseDef) {
            mappings.push({
                form: caseDef.form,
                caseId: '3VG',
                caseDescription: caseDef.descriptionFr,
                value: Math.round(ctoGains),
                confidence: 'determined',
                fiscalYear: rules.year,
                legalReference: caseDef.legalReference,
            });
        }
    }

    // --- CTO Capital Losses (3VH) ---
    const ctoLosses = Math.abs(events
        .filter(e => e.eventType === 'capital_loss' && isTaxableWrapper(e.wrapperType))
        .reduce((sum, e) => sum + e.taxableAmount, 0));

    if (ctoLosses > 0) {
        const caseDef = formCaseMap.get('3VH');
        if (caseDef) {
            mappings.push({
                form: caseDef.form,
                caseId: '3VH',
                caseDescription: caseDef.descriptionFr,
                value: Math.round(ctoLosses),
                confidence: 'determined',
                fiscalYear: rules.year,
                legalReference: caseDef.legalReference,
            });
        }
    }

    // --- Dividends (2DC) ---
    const totalDividends = events
        .filter(e => e.eventType === 'dividend')
        .reduce((sum, e) => sum + e.grossAmount, 0);

    if (totalDividends > 0) {
        const caseDef = formCaseMap.get('2DC');
        if (caseDef) {
            mappings.push({
                form: caseDef.form,
                caseId: '2DC',
                caseDescription: caseDef.descriptionFr,
                value: Math.round(totalDividends),
                confidence: 'determined',
                fiscalYear: rules.year,
            });
        }
    }

    // --- Crypto Gains (3AN) ---
    const cryptoGains = events
        .filter(e => e.eventType === 'crypto_gain')
        .reduce((sum, e) => sum + e.taxableAmount, 0);

    if (cryptoGains > 0) {
        const caseDef = formCaseMap.get('3AN');
        if (caseDef) {
            mappings.push({
                form: caseDef.form,
                caseId: '3AN',
                caseDescription: caseDef.descriptionFr,
                value: Math.round(cryptoGains),
                confidence: 'estimated', // Crypto valuations are always estimated
                fiscalYear: rules.year,
                legalReference: caseDef.legalReference,
            });
        }
    }

    // --- Crypto Losses (3BN) ---
    const cryptoLosses = Math.abs(events
        .filter(e => e.eventType === 'crypto_loss')
        .reduce((sum, e) => sum + e.taxableAmount, 0));

    if (cryptoLosses > 0) {
        const caseDef = formCaseMap.get('3BN');
        if (caseDef) {
            mappings.push({
                form: caseDef.form,
                caseId: '3BN',
                caseDescription: caseDef.descriptionFr,
                value: Math.round(cryptoLosses),
                confidence: 'estimated',
                fiscalYear: rules.year,
                legalReference: caseDef.legalReference,
            });
        }
    }

    return mappings;
}

// ============================================================================
// MAIN AGGREGATION — Build TaxSummaryResult
// ============================================================================

/**
 * Build a complete TaxSummaryResult from raw data.
 * This is the main entry point for the tax engine.
 */
export function buildTaxSummary(
    allTransactions: UnifiedTransaction[],
    accounts: Account[],
    institutes: Institute[],
    instruments: Instrument[],
    fiscalYear: string,
    profile: FiscalProfile,
    country: string = 'FR'
): TaxSummaryResult {
    const rules = getFiscalRulesOrThrow(fiscalYear, country);

    // Enrich all transactions with account/instrument metadata
    const enriched = enrichTransactions(allTransactions, accounts, institutes, instruments);

    // --- Compute each category ---
    const ctoEvents = calculateCTOCapitalGains(enriched, fiscalYear, rules);
    const cryptoEvents = calculateCryptoGains(enriched, fiscalYear, rules);
    const incomeEvents = calculateDividendTax(enriched, fiscalYear, rules);
    const foreignAccounts = detectForeignAccounts(institutes, accounts);

    // All events combined
    const allEvents = [...ctoEvents, ...cryptoEvents, ...incomeEvents];
    const formMappings = generateFormMappings(allEvents, rules);
    const dataQuality = assessDataCompleteness(allEvents);

    // --- CTO aggregation ---
    const ctoGains = ctoEvents.filter(e => e.taxableAmount > 0).reduce((s, e) => s + e.taxableAmount, 0);
    const ctoLosses = Math.abs(ctoEvents.filter(e => e.taxableAmount < 0).reduce((s, e) => s + e.taxableAmount, 0));
    const ctoNet = ctoGains - ctoLosses;

    // Loss carryforward handling
    const priorLossCarryforward = profile.lossCarryforwards
        ? Object.values(profile.lossCarryforwards).reduce((sum, v) => sum + v, 0)
        : 0;
    const lossesApplied = ctoNet > 0 ? Math.min(ctoNet, priorLossCarryforward) : 0;
    const remainingCarryforward = ctoNet < 0
        ? priorLossCarryforward + Math.abs(ctoNet)
        : priorLossCarryforward - lossesApplied;

    // --- Crypto aggregation ---
    const cryptoTotalCessions = cryptoEvents.reduce((s, e) => s + e.grossAmount, 0);
    const cryptoGains = cryptoEvents.filter(e => e.taxableAmount > 0).reduce((s, e) => s + e.taxableAmount, 0);
    const cryptoLosses = Math.abs(cryptoEvents.filter(e => e.taxableAmount < 0).reduce((s, e) => s + e.taxableAmount, 0));
    const cryptoNet = cryptoGains - cryptoLosses;

    // --- Income aggregation ---
    const totalDividends = incomeEvents.filter(e => e.eventType === 'dividend').reduce((s, e) => s + e.taxableAmount, 0);
    const totalInterest = incomeEvents.filter(e => e.eventType === 'interest').reduce((s, e) => s + e.taxableAmount, 0);
    const totalCoupons = incomeEvents.filter(e => e.eventType === 'coupon').reduce((s, e) => s + e.taxableAmount, 0);

    return {
        fiscalYear,
        cto: {
            totalGains: ctoGains,
            totalLosses: ctoLosses,
            netResult: ctoNet,
            lossCarryforward: priorLossCarryforward,
            lossesApplied,
            remainingCarryforward,
            events: ctoEvents,
        },
        income: {
            totalDividends,
            totalInterest,
            totalCoupons,
            withholdingTaxPaid: 0, // TODO: Sum from transaction taxAmount fields
            events: incomeEvents,
        },
        crypto: {
            totalCessions: cryptoTotalCessions,
            totalGains: cryptoGains,
            totalLosses: cryptoLosses,
            netResult: cryptoNet,
            exceedsThreshold: cryptoTotalCessions > rules.crypto.exemptionThreshold,
            thresholdAmount: rules.crypto.exemptionThreshold,
            events: cryptoEvents,
        },
        pea: {
            withdrawals: [],
            taxableGain: 0,
            socialContributions: 0,
        },
        foreignAccounts,
        formMappings,
        dataQuality,
    };
}
