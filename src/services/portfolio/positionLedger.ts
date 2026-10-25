/**
 * Position Ledger (E28 — TGLA-102)
 *
 * Single, pure source of truth for turning a transaction journal into
 * positions. Used by portfolio recalculation, snapshot reconciliation and the
 * dashboard chart, so every screen agrees on quantities and cost basis.
 *
 * Conventions:
 * - BUY / DEPOSIT add quantity; cost = qty × unit price (or |amount|) + fees.
 * - SELL / WITHDRAW remove quantity; cost removed per method (WAC or FIFO);
 *   realized P&L = proceeds − removed cost − fees (SELL only).
 * - BALANCE_ADJUSTMENT / SNAPSHOT_ADJUSTMENT are non-fiscal reconciliations:
 *   quantity moves by the signed delta and cost basis moves by
 *   metadata.costDelta, so the resulting position matches the snapshot exactly.
 *   Legacy adjustments without metadata are treated as increases at |amount|.
 */

import type { UnifiedTransaction, CostBasisMethod } from '../../types/types.backend';

export type { CostBasisMethod };

export interface Lot {
    quantity: number;
    unitCost: number;
    date: string;
}

export interface LedgerState {
    quantity: number;
    costBasis: number;
    realizedPL: number;
    lots: Lot[];
}

export type AdjustmentDirection = 'increase' | 'decrease' | 'none';

export const QTY_EPSILON = 1e-9;

const INCREASE_TYPES = new Set(['BUY', 'DEPOSIT']);
const DECREASE_TYPES = new Set(['SELL', 'WITHDRAW']);
const ADJUSTMENT_TYPES = new Set(['BALANCE_ADJUSTMENT', 'SNAPSHOT_ADJUSTMENT']);
const REWARD_SUBTYPES = new Set(['STAKING_REWARD', 'AIRDROP', 'MINING_REWARD']);

export const emptyLedgerState = (): LedgerState => ({ quantity: 0, costBasis: 0, realizedPL: 0, lots: [] });

function toNumber(value: string | undefined): number | null {
    if (value === undefined || value === null || value === '') return null;
    const num = parseFloat(value);
    return Number.isFinite(num) ? num : null;
}

/**
 * Quantity carried by a transaction (always positive).
 * Explicit quantity first, then |amount| / unit price, then |amount|
 * (crypto statements where the amount column is the coin quantity).
 */
export function resolveQuantity(tx: Pick<UnifiedTransaction, 'quantity' | 'amountPrimary' | 'priceUnit'>): number {
    const qty = toNumber(tx.quantity);
    if (qty !== null && qty !== 0) return Math.abs(qty);

    const amount = toNumber(tx.amountPrimary);
    const price = toNumber(tx.priceUnit);
    if (amount !== null && price !== null && price > 0) return Math.abs(amount) / price;
    return amount !== null ? Math.abs(amount) : 0;
}

/**
 * Gross cash value of a trade, excluding fees.
 * qty × unit price when both are known (broker "total" columns sometimes
 * include fees), otherwise |amount|.
 */
export function resolveGrossValue(tx: Pick<UnifiedTransaction, 'quantity' | 'amountPrimary' | 'priceUnit'>, quantity: number): number {
    const price = toNumber(tx.priceUnit);
    if (price !== null && price > 0 && quantity > 0 && toNumber(tx.quantity) !== null) return quantity * price;
    const amount = toNumber(tx.amountPrimary);
    return amount !== null ? Math.abs(amount) : 0;
}

/**
 * Fee expressed in the quote currency. A fee paid in the traded asset itself
 * (e.g. Binance BTC fee on a BTC buy) is not a cash cost.
 */
function resolveFee(tx: Pick<UnifiedTransaction, 'feeAmount' | 'feeAsset' | 'assetSymbol'>): number {
    const fee = toNumber(tx.feeAmount);
    if (fee === null) return 0;
    if (tx.feeAsset && tx.assetSymbol && tx.feeAsset.toUpperCase() === tx.assetSymbol.toUpperCase()) return 0;
    return Math.abs(fee);
}

/** Raw types written by the cash statement wizard before E28 (quantity '1' @ balance) */
const LEGACY_BALANCE_STATEMENT_TYPES = new Set(['Manual Cash Statement', 'CSV Cash Statement']);

/**
 * A balance statement declares the absolute balance of a cash line at a date
 * (it replaces the previous balance instead of adding to it).
 */
export function isBalanceStatement(tx: Pick<UnifiedTransaction, 'type' | 'rawType' | 'metadata'>): boolean {
    if (tx.type !== 'BALANCE_ADJUSTMENT') return false;
    return tx.metadata?.balanceStatement === true || LEGACY_BALANCE_STATEMENT_TYPES.has(tx.rawType);
}

export function getAdjustmentDirection(tx: Pick<UnifiedTransaction, 'metadata'>): AdjustmentDirection {
    const raw = tx.metadata?.reconciliationType;
    if (raw === 'decrease' || raw === 'none') return raw;
    return 'increase';
}

function getCostDelta(tx: Pick<UnifiedTransaction, 'metadata'>): number | null {
    const raw = tx.metadata?.costDelta;
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string' && raw !== '' && Number.isFinite(parseFloat(raw))) return parseFloat(raw);
    return null;
}

/**
 * Signed quantity change of a transaction on its position.
 */
export function quantityDelta(tx: UnifiedTransaction): number {
    if (INCREASE_TYPES.has(tx.type)) return resolveQuantity(tx);
    if (DECREASE_TYPES.has(tx.type)) return -resolveQuantity(tx);
    if (ADJUSTMENT_TYPES.has(tx.type)) {
        if (isBalanceStatement(tx)) return 0; // absolute value, not a delta — see applyTransaction
        const direction = getAdjustmentDirection(tx);
        if (direction === 'none') return 0;
        return direction === 'decrease' ? -resolveQuantity(tx) : resolveQuantity(tx);
    }
    if (tx.type === 'INCOME' && tx.subType && REWARD_SUBTYPES.has(tx.subType) && toNumber(tx.quantity) !== null) {
        return resolveQuantity(tx);
    }
    return 0;
}

function lotsCost(lots: Lot[]): number {
    return lots.reduce((sum, lot) => sum + lot.quantity * lot.unitCost, 0);
}

/** Remove quantity from the oldest lots first; returns the cost removed. */
function consumeLots(lots: Lot[], quantity: number): number {
    let remaining = quantity;
    let removed = 0;
    while (remaining > QTY_EPSILON && lots.length > 0) {
        const lot = lots[0];
        const take = Math.min(lot.quantity, remaining);
        removed += take * lot.unitCost;
        lot.quantity -= take;
        remaining -= take;
        if (lot.quantity <= QTY_EPSILON) lots.shift();
    }
    return removed;
}

/** Scale every lot so the total cost equals targetCost (snapshot cost basis). */
function rescaleLots(lots: Lot[], targetCost: number): void {
    const current = lotsCost(lots);
    const totalQty = lots.reduce((sum, lot) => sum + lot.quantity, 0);
    if (totalQty <= QTY_EPSILON) return;
    if (current > 0) {
        const factor = targetCost / current;
        lots.forEach(lot => { lot.unitCost *= factor; });
    } else {
        lots.forEach(lot => { lot.unitCost = targetCost / totalQty; });
    }
}

function removeQuantity(state: LedgerState, quantity: number, method: CostBasisMethod): number {
    const qty = Math.min(quantity, state.quantity);
    if (qty <= 0) return 0;
    let removedCost: number;
    if (method === 'FIFO') {
        removedCost = consumeLots(state.lots, qty);
    } else {
        removedCost = state.quantity > 0 ? (state.costBasis / state.quantity) * qty : 0;
        consumeLots(state.lots, qty);
    }
    state.quantity -= qty;
    state.costBasis -= removedCost;
    return removedCost;
}

function normalize(state: LedgerState): LedgerState {
    if (state.quantity <= QTY_EPSILON) {
        state.quantity = 0;
        state.costBasis = 0;
        state.lots = [];
    }
    if (Math.abs(state.costBasis) < 1e-9) state.costBasis = 0;
    return state;
}

/**
 * Apply one transaction to a position state (returns a new state).
 */
export function applyTransaction(previous: LedgerState, tx: UnifiedTransaction, method: CostBasisMethod = 'WAC'): LedgerState {
    const state: LedgerState = {
        ...previous,
        lots: previous.lots.map(lot => ({ ...lot }))
    };

    if (INCREASE_TYPES.has(tx.type) || (tx.type === 'INCOME' && quantityDelta(tx) > 0)) {
        const qty = resolveQuantity(tx);
        if (qty <= 0) return state;
        const cost = tx.type === 'INCOME' ? 0 : resolveGrossValue(tx, qty) + resolveFee(tx);
        state.quantity += qty;
        state.costBasis += cost;
        state.lots.push({ quantity: qty, unitCost: cost / qty, date: tx.transactionDate });
        return normalize(state);
    }

    if (DECREASE_TYPES.has(tx.type)) {
        const requested = resolveQuantity(tx);
        const qty = Math.min(requested, state.quantity);
        const removedCost = removeQuantity(state, qty, method);
        if (tx.type === 'SELL' && qty > 0) {
            const proceeds = requested > 0 ? resolveGrossValue(tx, requested) * (qty / requested) : 0;
            state.realizedPL += proceeds - removedCost - resolveFee(tx);
        }
        return normalize(state);
    }

    if (isBalanceStatement(tx)) {
        const balance = Math.max(toNumber(tx.amountPrimary) ?? 0, 0);
        return normalize({
            quantity: balance,
            costBasis: balance,
            realizedPL: state.realizedPL,
            lots: balance > 0 ? [{ quantity: balance, unitCost: 1, date: tx.transactionDate }] : []
        });
    }

    if (ADJUSTMENT_TYPES.has(tx.type)) {
        const delta = quantityDelta(tx);
        const explicitCostDelta = getCostDelta(tx);
        const previousCost = state.costBasis;

        if (delta > 0) {
            const costIn = explicitCostDelta ?? Math.abs(toNumber(tx.amountPrimary) ?? 0);
            state.quantity += delta;
            state.lots.push({ quantity: delta, unitCost: Math.max(costIn, 0) / delta, date: tx.transactionDate });
            state.costBasis = previousCost + costIn;
        } else if (delta < 0) {
            const removedCost = removeQuantity(state, -delta, method);
            state.costBasis = explicitCostDelta !== null ? previousCost + explicitCostDelta : previousCost - removedCost;
        } else if (explicitCostDelta !== null) {
            state.costBasis = previousCost + explicitCostDelta;
        }

        normalize(state);
        if (state.quantity > 0 && Math.abs(lotsCost(state.lots) - state.costBasis) > 1e-6) {
            rescaleLots(state.lots, state.costBasis);
        }
        return state;
    }

    return state;
}

/**
 * Chronological order used everywhere (date, then creation time for same-day rows).
 */
export function sortChronologically<T extends Pick<UnifiedTransaction, 'transactionDate' | 'createdAt'>>(txs: T[]): T[] {
    return [...txs].sort((a, b) =>
        new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime()
        || (a.createdAt || '').localeCompare(b.createdAt || '')
    );
}

export interface LedgerEntry {
    key: string;
    state: LedgerState;
    /** Last transaction applied (for display metadata) */
    lastTx: UnifiedTransaction;
    /** First transaction applied */
    firstTx: UnifiedTransaction;
}

export interface BuildLedgerOptions {
    /** Grouping key, default `${accountId}:${instrumentId || assetIsin || assetSymbol}` */
    keyOf?: (tx: UnifiedTransaction) => string | null;
    /** Cost basis method per account (default WAC) */
    methodFor?: (accountId: string) => CostBasisMethod;
}

export const defaultLedgerKey = (tx: UnifiedTransaction): string | null => {
    const asset = tx.instrumentId || tx.assetIsin || tx.assetSymbol;
    return asset ? `${tx.accountId}:${asset}` : null;
};

/**
 * Replay a journal into positions, grouped by key.
 */
export function buildLedger(transactions: UnifiedTransaction[], options: BuildLedgerOptions = {}): Map<string, LedgerEntry> {
    const keyOf = options.keyOf ?? defaultLedgerKey;
    const methodFor = options.methodFor ?? (() => 'WAC' as CostBasisMethod);
    const entries = new Map<string, LedgerEntry>();

    for (const tx of sortChronologically(transactions)) {
        const key = keyOf(tx);
        if (!key) continue;
        const current = entries.get(key);
        const nextState = applyTransaction(current?.state ?? emptyLedgerState(), tx, methodFor(tx.accountId));
        entries.set(key, {
            key,
            state: nextState,
            lastTx: tx,
            firstTx: current?.firstTx ?? tx
        });
    }

    return entries;
}
