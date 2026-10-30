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
    getPEATaxRule,
    planAgeYears,
    FiscalYearRules,
} from './taxRules';

import {
    isTaxableWrapper,
    isPEAWrapper,
    CGI_ARTICLES,
} from '../../constants/fiscalConstants';

import {
    buildRealizedEvents,
    isBalanceStatement,
    quantityDelta,
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
    /**
     * Set by `convertToEur`: the amounts are in EUR ('converted' at a known rate, 'estimated' at an
     * approximate one) or still in their own currency because no rate was found ('missing').
     */
    fxStatus?: 'eur' | 'converted' | 'estimated' | 'missing';
}

/** EUR value of one unit of `currency` on `date` (YYYY-MM-DD); `estimated` when it is not that day's rate */
export type EurRateLookup = (currency: string, date: string) => { rate: number; estimated: boolean } | undefined;

export interface TaxSummaryOptions {
    /** Historical exchange rates: French tax converts every amount at the rate of its operation's date */
    rateToEur?: EurRateLookup;
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
    if (tx.fxStatus && tx.fxStatus !== 'missing') return 'EUR';
    return tx.originalCurrency || tx.instrument?.denominationCurrency || 'EUR';
}

/** Amounts in a foreign currency with no recorded exchange rate cannot be declared in EUR as is */
function lacksFxRate(currency: string, tx: EnrichedTransaction): boolean {
    if (tx.fxStatus) return tx.fxStatus === 'missing';
    return currency !== 'EUR' && !tx.fxRate;
}

/** missingData flags of a row's currency conversion */
function fxFlags(tx: EnrichedTransaction): string[] {
    if (lacksFxRate(eventCurrency(tx), tx)) return ['fx_rate_missing'];
    return tx.fxStatus === 'estimated' ? ['fx_rate_estimated'] : [];
}

const scaleDecimal = (value: string | undefined, rate: number): string | undefined => {
    if (value === undefined || value === '') return value;
    const n = parseFloat(value);
    return Number.isFinite(n) ? String(n * rate) : value;
};

/**
 * Converts every amount to EUR at the rate of the operation's date (art. 150-0 D: acquisition and
 * cession prices are each converted on their own date). Quantities are left as they are.
 *
 * A row's amounts are in its `originalCurrency`, else in its account's currency. The row's own
 * `fxRate` (original currency → account currency) is used when the account is in EUR.
 */
export function convertToEur(txs: EnrichedTransaction[], rateToEur?: EurRateLookup): EnrichedTransaction[] {
    return txs.map(tx => {
        const currency = (tx.originalCurrency || tx.account?.defaultCurrency || tx.instrument?.denominationCurrency || 'EUR').toUpperCase();
        if (currency === 'EUR') return { ...tx, fxStatus: 'eur' };

        const ownRate = parseFloat(tx.fxRate || '');
        const accountInEur = (tx.account?.defaultCurrency || 'EUR').toUpperCase() === 'EUR';
        let rate: number | undefined;
        let estimated = false;
        if (tx.originalCurrency && accountInEur && Number.isFinite(ownRate) && ownRate > 0) {
            rate = ownRate;
        } else {
            const found = rateToEur?.(currency, tx.transactionDate.slice(0, 10));
            if (found && found.rate > 0) {
                rate = found.rate;
                estimated = found.estimated;
            }
        }
        if (rate === undefined) return { ...tx, fxStatus: 'missing' };

        // A fee paid in another asset (e.g. BNB) is not an amount of this currency
        const feeInCurrency = !tx.feeAsset || tx.feeAsset.toUpperCase() === currency;
        return {
            ...tx,
            amountPrimary: scaleDecimal(tx.amountPrimary, rate) ?? tx.amountPrimary,
            priceUnit: scaleDecimal(tx.priceUnit, rate),
            feeAmount: feeInCurrency ? scaleDecimal(tx.feeAmount, rate) : tx.feeAmount,
            feeAsset: feeInCurrency && tx.feeAsset ? 'EUR' : tx.feeAsset,
            taxAmount: scaleDecimal(tx.taxAmount, rate),
            fxStatus: estimated ? 'estimated' : 'converted',
        };
    });
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
            missingData.push(...fxFlags(tx));
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
                explanation: `PMP: ${pmp.toFixed(4)} × ${sale.quantity} = ${acquisitionCost.toFixed(2)} cost basis. Sale proceeds: ${saleProceeds.toFixed(2)}. Net: ${taxableAmount.toFixed(2)}`,
                explanationKey: 'cto',
                explanationParams: { pmp, quantity: sale.quantity, cost: acquisitionCost, proceeds: saleProceeds, fees, net: taxableAmount },
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
    const addHolding = (symbol: string, delta: number): void => {
        holdings.set(symbol, Math.max(0, (holdings.get(symbol) ?? 0) + delta));
    };
    // Coins that left the portfolio without a matching deposit (sent elsewhere, spent, given)
    let unmatchedExit = false;

    /** Value of every held asset at its last known price */
    const valuePortfolio = (): { value: number; priceMissing: boolean } => {
        let value = 0;
        let priceMissing = false;
        for (const [asset, held] of holdings) {
            if (held <= QTY_EPSILON) continue;
            const price = lastPrice.get(asset);
            if (price === undefined) priceMissing = true;
            else value += held * price;
        }
        return { value, priceMissing };
    };

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
            addHolding(symbol, quantity);
        } else if (tx.type === 'INCOME') {
            // Staking, airdrop, mining: the coins join the portfolio at a zero acquisition price
            // (their value is not a price paid), so they raise its value but not its cost.
            addHolding(symbol, quantity);
        } else if (tx.type === 'SWAP') {
            // Crypto-to-crypto exchange: neutral (no cession, no acquisition price), only the
            // composition changes. Each leg is a row; its sign says whether the coin leaves or arrives.
            const signed = parseFloat(tx.quantity || tx.amountPrimary || '0');
            addHolding(symbol, signed < 0 ? -quantity : quantity);
        } else if (tx.type === 'EXPENSE') {
            // Network or platform fee paid in the coin itself
            addHolding(symbol, -quantity);
        } else if (tx.type === 'WITHDRAW') {
            // Sent out of the tracked wallets with no matching deposit: the coins leave the portfolio,
            // with the share of the acquisition price they carried.
            const { value } = valuePortfolio();
            const leaving = unitPrice !== undefined ? quantity * unitPrice : 0;
            if (value > 0 && leaving > 0) {
                totalAcquisitionCost = Math.max(0, totalAcquisitionCost * (1 - Math.min(1, leaving / value)));
            }
            addHolding(symbol, -quantity);
            unmatchedExit = true;
        } else if (isCryptoToFiatCession(tx)) {
            // Value of every held asset just before the cession, at its last known price
            const { value: portfolioValue, priceMissing } = valuePortfolio();

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
                if (unmatchedExit) missingData.push('crypto_withdrawal_unmatched');
                missingData.push(...fxFlags(tx));

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
                    explanation: `Art. 150 VH bis: Cession ${cessionPrice.toFixed(2)} − (${totalAcquisitionCost.toFixed(2)} × ${cessionPrice.toFixed(2)} / ${portfolioValue.toFixed(2)}) = ${taxableAmount.toFixed(2)}`,
                    explanationKey: 'crypto',
                    explanationParams: { cession: cessionPrice, totalCost: totalAcquisitionCost, portfolioValue, fees, net: taxableAmount },
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
        // Income kept inside a tax wrapper (PEA, assurance-vie, PER, livret) is not taxed when received:
        // the wrapper's own rules apply on withdrawal, if ever.
        if (!isTaxableWrapper(tx.resolvedWrapperType)) continue;
        // Signed: a reversed (negative) dividend lowers the year's income instead of adding to it
        const amount = parseFloat(tx.amountPrimary || '0');
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

        const missingData = fxFlags(tx);
        const confidence: FiscalConfidence = missingData.length === 0 ? 'determined' : 'estimated';
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
            currency: eventCurrency(tx),
            eventDate: tx.transactionDate,
            confidence,
            explanation: isDividend
                ? `Dividend: ${amount.toFixed(2)} gross. Withholding tax paid: ${withholdingTax.toFixed(2)}. Eligible for 40% abatement if barème chosen.`
                : `Income: ${amount.toFixed(2)}`,
            explanationKey: isDividend ? 'dividend' : 'income',
            explanationParams: { amount, withholding: withholdingTax },
            legalReference: isDividend ? `${CGI_ARTICLES.ART_200_A}` : undefined,
            missingData: missingData.length > 0 ? missingData : undefined,
            withholdingTax,
        });
    }

    return events;
}

// ============================================================================
// PEA WITHDRAWALS — Art. 150-0 A II-2 and 157 5° bis CGI
// ============================================================================

const isPEACashRow = (tx: EnrichedTransaction): boolean => {
    if (tx.instrument) return tx.instrument.type === 'cash';
    const code = (tx.assetSymbol || '').toUpperCase();
    return code === '' || code === (tx.account?.defaultCurrency || 'EUR').toUpperCase();
};

/**
 * Taxable gain of each cash withdrawal from a PEA / PEA-PME during the fiscal year.
 *
 * Gain of a withdrawal = amount withdrawn − net deposits × amount withdrawn / plan value
 * (art. 150-0 A II-2): the withdrawal carries a share of the deposits and a share of the gain,
 * in proportion to the plan's value just before it. The deposits left in the plan then shrink by
 * the share withdrawn.
 *
 * The plan value is the cash (deposits, trades, income) plus the securities at their last traded
 * price: no market quote is stored at past dates, so every event is `estimated`.
 * Before 5 years the gain bears income tax (12.8 %) and the withdrawal closes the plan; after,
 * only social contributions are due. Both are collected by the bank, which reports the gain on the IFU.
 */
export function calculatePEAWithdrawals(
    allTransactions: EnrichedTransaction[],
    fiscalYear: string,
    rules: FiscalYearRules
): TaxableEvent[] {
    const events: TaxableEvent[] = [];
    const yearEnd = new Date(`${parseInt(fiscalYear) + 1}-01-01T00:00:00Z`).getTime();

    const byAccount = new Map<string, EnrichedTransaction[]>();
    for (const tx of allTransactions) {
        if (!isPEAWrapper(tx.resolvedWrapperType)) continue;
        if (new Date(tx.transactionDate).getTime() >= yearEnd) continue;
        const list = byAccount.get(tx.accountId) ?? [];
        list.push(tx);
        byAccount.set(tx.accountId, list);
    }

    for (const accountTxs of byAccount.values()) {
        const sorted = sortChronologically(accountTxs);
        const account = sorted[0].account;
        const openDate = account?.openedAt || sorted[0].transactionDate;
        let netDeposits = 0;
        let cash = 0;
        const holdings = new Map<string, number>();
        const lastPrice = new Map<string, number>();

        for (const tx of sorted) {
            const quantity = resolveQuantity(tx);
            const amount = Math.abs(parseFloat(tx.amountPrimary || '0')) || 0;

            if (isPEACashRow(tx)) {
                if (isBalanceStatement(tx)) { cash = quantity; continue; }
                if (tx.type === 'DEPOSIT' || tx.type === 'INCOME') {
                    cash += amount;
                    if (tx.type === 'DEPOSIT') netDeposits += amount;
                    continue;
                }
                if (tx.type === 'EXPENSE') { cash -= amount; continue; }
                if (tx.type !== 'WITHDRAW') continue;

                let securities = 0;
                for (const [key, held] of holdings) {
                    if (held > QTY_EPSILON) securities += held * (lastPrice.get(key) ?? 0);
                }
                // Never below the amount withdrawn: the plan held at least that much
                const planValue = Math.max(amount, Math.max(0, cash) + securities);
                const depositShare = planValue > 0 ? netDeposits * amount / planValue : 0;
                const gain = amount - depositShare;
                netDeposits = Math.max(0, netDeposits - depositShare);
                cash -= amount;

                if (getFiscalYearFromDate(tx.transactionDate) !== fiscalYear || amount <= 0) continue;

                const rule = getPEATaxRule(openDate, tx.transactionDate, fiscalYear, rules.country);
                const ageYears = planAgeYears(openDate, tx.transactionDate);
                const taxedGain = Math.max(0, gain);
                const missingData = ['pea_valuation_approximated', ...fxFlags(tx)];
                if (!account?.openedAt) missingData.push('pea_open_date_missing');

                events.push({
                    transactionIds: [tx.id],
                    fiscalYear,
                    eventType: 'pea_withdrawal',
                    symbol: account?.name || tx.assetSymbol || '',
                    instrumentName: account?.name || tx.label || '',
                    accountId: tx.accountId,
                    wrapperType: tx.resolvedWrapperType,
                    grossAmount: amount,
                    acquisitionCost: depositShare,
                    taxableAmount: gain,
                    fees: 0,
                    currency: eventCurrency(tx),
                    eventDate: tx.transactionDate,
                    confidence: 'estimated',
                    explanation: `PEA withdrawal: ${amount.toFixed(2)} − (${(netDeposits + depositShare).toFixed(2)} × ${amount.toFixed(2)} / ${planValue.toFixed(2)}) = ${gain.toFixed(2)}`,
                    explanationKey: rule.closesOnWithdrawal ? 'peaBefore5' : 'peaAfter5',
                    explanationParams: {
                        amount, deposits: netDeposits + depositShare, planValue, net: gain, age: ageYears,
                        incomeTaxRate: rule.incomeTaxRate * 100, socialRate: rule.socialRate * 100,
                    },
                    legalReference: rule.legalReference,
                    missingData,
                    incomeTax: taxedGain * rule.incomeTaxRate,
                    socialContributions: taxedGain * rule.socialRate,
                    planAgeYears: ageYears,
                    closesPlan: rule.closesOnWithdrawal,
                });
                continue;
            }

            // Securities: quantities and last traded price, and the cash they move
            const key = tx.instrumentId || tx.assetIsin || symbolOf(tx);
            if (!key) continue;
            const gross = resolveGrossValue(tx, quantity);
            const fees = resolveFee(tx);
            const price = parseFloat(tx.priceUnit || '0');
            if (price > 0) lastPrice.set(key, price);
            else if (quantity > 0 && gross > 0 && (tx.type === 'BUY' || tx.type === 'SELL')) lastPrice.set(key, gross / quantity);
            holdings.set(key, Math.max(0, (holdings.get(key) ?? 0) + quantityDelta(tx)));
            if (tx.type === 'BUY') cash -= gross + fees;
            else if (tx.type === 'SELL') cash += gross - fees;
            else if (tx.type === 'INCOME' && !(tx.subType && quantityDelta(tx) > 0)) cash += amount;
            else if (tx.type === 'EXPENSE') cash -= amount;
        }
    }

    return events;
}

// ============================================================================
// PFU vs BARÈME COMPARISON (Option 2OP)
// ============================================================================

/**
 * Compare PFU (flat tax) vs barème progressif for a fiscal year.
 * This helps the user decide whether to check box 2OP on their declaration.
 *
 * Both totals cover the same thing: the tax due because of these investment revenues (social
 * contributions included). Under the barème that is the income tax with them minus the income tax
 * the household's other income bears anyway. The 2OP option covers securities gains, dividends,
 * interest and coupons together; crypto gains have their own option and stay out.
 */
export function comparePFUvsBareme(
    events: TaxableEvent[],
    profile: FiscalProfile,
    rules: FiscalYearRules,
    /** Earlier losses still usable this year (see buildTaxSummary) */
    priorLossCarryforward: number = 0
): { pfuTotal: number; baremeTotal: number; recommendation: 'PFU' | 'BAREME' | 'NEUTRAL'; confidence: FiscalConfidence } {
    const shares = profile.fiscalShares || 1;
    const otherIncome = profile.otherTaxableIncome || 0;
    const gainsSocialRate = rules.socialContributions.totalRate;
    const incomeSocialRate = rules.socialContributions.placementIncomeRate ?? gainsSocialRate;

    // Securities: the year's gains and losses net out, then earlier losses apply; a net loss is taxed at 0
    const yearNet = events
        .filter(e => e.eventType === 'capital_gain' || e.eventType === 'capital_loss')
        .reduce((sum, e) => sum + e.taxableAmount, 0);
    const netGains = Math.max(0, yearNet - Math.max(0, priorLossCarryforward));
    const sumOf = (types: TaxableEvent['eventType'][]): number => Math.max(0, events
        .filter(e => types.includes(e.eventType))
        .reduce((sum, e) => sum + e.taxableAmount, 0));
    const dividends = sumOf(['dividend']);
    const interest = sumOf(['interest', 'coupon']);
    const grossRevenue = netGains + dividends + interest;

    // Social contributions are the same whichever option is chosen
    const social = netGains * gainsSocialRate + (dividends + interest) * incomeSocialRate;

    // --- PFU: flat income tax on every item ---
    const pfuTotal = grossRevenue * rules.pfu.irRate + social;

    // --- Barème: 40 % abatement on dividends; the deductible CSG lowers the taxable income ---
    const dividendBase = rules.dividends.hasAbatement ? dividends * (1 - rules.dividends.abatementRate) : dividends;
    const deductibleCSG = grossRevenue * rules.socialContributions.deductibleCSGRate;
    const baremeBase = Math.max(0, netGains + dividendBase + interest - deductibleCSG);
    const irWith = calculateIRPerShare((otherIncome + baremeBase) / shares, rules.year, rules.country) * shares;
    const irWithout = calculateIRPerShare(otherIncome / shares, rules.year, rules.country) * shares;
    const baremeTotal = (irWith - irWithout) + social;

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
    accounts: Account[],
    options: {
        /** Only accounts held during this year: one opened later is not declared for it */
        fiscalYear?: string;
        /** Accounts with an operation in that year: a closed one still has to be declared for it */
        accountsUsedInYear?: Set<string>;
    } = {}
): ForeignAccountObligation[] {
    const obligations: ForeignAccountObligation[] = [];

    // Group accounts by institute
    const accountsByInstitute = new Map<string, Account[]>();
    for (const acc of accounts) {
        // Form 3916 covers accounts opened, held, used or closed during the year
        if (!acc.isActive && !options.accountsUsedInYear?.has(acc.id)) continue;
        if (options.fiscalYear && acc.openedAt && acc.openedAt.slice(0, 4) > options.fiscalYear) continue;
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
            reasonKey: isCrypto ? 'cryptoAccount' : 'bankAccount',
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
    rules: FiscalYearRules,
    options: {
        /** Earlier securities losses still usable: 3VG is the gain left after them */
        priorLossCarryforward?: number;
        /** Crypto cessions at or under the yearly threshold are exempt: nothing to declare in 3AN/3BN */
        cryptoExempt?: boolean;
    } = {}
): FormCaseMapping[] {
    const mappings: FormCaseMapping[] = [];

    // BOLT OPTIMIZATION:
    // Pre-build O(1) Map for formCases to replace repeated linear .find() calls
    const formCaseMap = new Map(rules.formCases.map(c => [c.caseId, c]));

    // --- CTO: one net result (form 2074), declared as a net gain (3VG) or a net loss (3VH) ---
    const ctoNetOfYear = events
        .filter(e => (e.eventType === 'capital_gain' || e.eventType === 'capital_loss') && isTaxableWrapper(e.wrapperType))
        .reduce((sum, e) => sum + e.taxableAmount, 0);
    const ctoGains = ctoNetOfYear > 0 ? Math.max(0, ctoNetOfYear - Math.max(0, options.priorLossCarryforward ?? 0)) : 0;

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

    // --- CTO net loss of the year (3VH) ---
    const ctoLosses = ctoNetOfYear < 0 ? Math.abs(ctoNetOfYear) : 0;

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

    // --- Crypto: one net result (form 2086): net gain (3AN) or net loss (3BN), none when exempt ---
    const cryptoNet = options.cryptoExempt ? 0 : events
        .filter(e => e.eventType === 'crypto_gain' || e.eventType === 'crypto_loss')
        .reduce((sum, e) => sum + e.taxableAmount, 0);
    const cryptoGains = cryptoNet > 0 ? cryptoNet : 0;

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

    // --- Crypto net loss (3BN) ---
    const cryptoLosses = cryptoNet < 0 ? Math.abs(cryptoNet) : 0;

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
    country: string = 'FR',
    options: TaxSummaryOptions = {}
): TaxSummaryResult {
    const rules = getFiscalRulesOrThrow(fiscalYear, country);

    // Enrich all transactions with account/instrument metadata, amounts in EUR
    const enriched = convertToEur(enrichTransactions(allTransactions, accounts, institutes, instruments), options.rateToEur);

    // --- Compute each category ---
    const ctoEvents = calculateCTOCapitalGains(enriched, fiscalYear, rules);
    const cryptoEvents = calculateCryptoGains(enriched, fiscalYear, rules);
    const incomeEvents = calculateDividendTax(enriched, fiscalYear, rules);
    const peaEvents = calculatePEAWithdrawals(enriched, fiscalYear, rules);
    const accountsUsedInYear = new Set(
        enriched.filter(tx => getFiscalYearFromDate(tx.transactionDate) === fiscalYear).map(tx => tx.accountId)
    );
    const foreignAccounts = detectForeignAccounts(institutes, accounts, { fiscalYear, accountsUsedInYear });

    // All events combined
    const allEvents = [...ctoEvents, ...cryptoEvents, ...incomeEvents, ...peaEvents];
    const dataQuality = assessDataCompleteness(allEvents);

    // --- CTO aggregation ---
    const ctoGains = ctoEvents.filter(e => e.taxableAmount > 0).reduce((s, e) => s + e.taxableAmount, 0);
    const ctoLosses = Math.abs(ctoEvents.filter(e => e.taxableAmount < 0).reduce((s, e) => s + e.taxableAmount, 0));
    const ctoNet = ctoGains - ctoLosses;

    // Loss carryforward handling: a loss can only be used in the following `maxYears` years
    const oldestUsableYear = parseInt(fiscalYear, 10) - rules.lossCarryforward.maxYears;
    const priorLossCarryforward = profile.lossCarryforwards
        ? Object.entries(profile.lossCarryforwards)
            .filter(([year]) => {
                const lossYear = parseInt(year, 10);
                return Number.isFinite(lossYear) && lossYear >= oldestUsableYear && lossYear < parseInt(fiscalYear, 10);
            })
            .reduce((sum, [, v]) => sum + v, 0)
        : 0;
    const lossesApplied = ctoNet > 0 ? Math.min(ctoNet, priorLossCarryforward) : 0;
    const remainingCarryforward = ctoNet < 0
        ? priorLossCarryforward + Math.abs(ctoNet)
        : priorLossCarryforward - lossesApplied;

    // --- Crypto aggregation ---
    const cryptoTotalCessions = cryptoEvents.reduce((s, e) => s + e.grossAmount, 0);
    const cryptoExceedsThreshold = cryptoTotalCessions > rules.crypto.exemptionThreshold;
    const formMappings = generateFormMappings(allEvents, rules, {
        priorLossCarryforward,
        cryptoExempt: !cryptoExceedsThreshold,
    });
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
            withholdingTaxPaid: incomeEvents.reduce((s, e) => s + Math.abs(e.withholdingTax ?? 0), 0),
            events: incomeEvents,
        },
        crypto: {
            totalCessions: cryptoTotalCessions,
            totalGains: cryptoGains,
            totalLosses: cryptoLosses,
            netResult: cryptoNet,
            exceedsThreshold: cryptoExceedsThreshold,
            thresholdAmount: rules.crypto.exemptionThreshold,
            events: cryptoEvents,
        },
        pea: {
            withdrawals: peaEvents,
            taxableGain: peaEvents.reduce((s, e) => s + Math.max(0, e.taxableAmount), 0),
            incomeTax: peaEvents.reduce((s, e) => s + (e.incomeTax ?? 0), 0),
            socialContributions: peaEvents.reduce((s, e) => s + (e.socialContributions ?? 0), 0),
        },
        foreignAccounts,
        formMappings,
        dataQuality,
    };
}
