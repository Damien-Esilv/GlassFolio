/**
 * Sync engine (TGLA-221).
 *
 * Runs in the unlocked tab only: it reads the connection's credentials from the vault, asks the
 * source adapter for normalized activities or holdings, and commits them through the same paths
 * as a file import (dedup, instruments, atomic batch, rollback from the import history).
 *
 * - `history` mode: activities become journal rows (sourceOrigin 'API'). Rows already stored are
 *   skipped by provider id first, then by row hash, so a re-sync never duplicates anything.
 * - `holdings` mode: the provider's holdings are reconciled as a snapshot, and nothing is
 *   committed when they match the journal.
 * - Checking and savings accounts of a bank read with its operations (`cashHistory`, TGLA-254): the operations
 *   become journal rows (kept for good, the last 45 days matched again at every sync), then the balance is
 *   reconciled like a snapshot.
 */
import type { Instrument } from '../../types';
import { ENGINE_VERSION, VALID_FIAT_CURRENCIES } from '../../types/types.backend';
import type { ImportBatch, UnifiedTransaction } from '../../types/types.backend';
import type {
    ConnectionCursor,
    ConnectionErrorCode,
    ConnectionStatus,
    ExternalAccount,
    NormalizedActivity,
    NormalizedHolding,
    SafeConnection,
    SyncAccountReport,
    SyncReport,
} from '../../types/connections';
import {
    computeFileHash,
    computeRowHash,
    getExistingExternalIds,
    getExistingRowHashCounts,
    transactionManager,
} from '../core/transactionManager';
import { db } from '../db';
import { commitBatch, flagDuplicates, rollbackBatches, type StagedTransaction } from '../import/importManager';
import { accountService, instituteService } from '../instituteService';
import { getAccountContext } from '../import/accountContext';
import { removeInstruments } from '../import/instrumentDrafts';
import {
    calculateReconciliation,
    commitSnapshotImport,
    getExistingPositions,
    type SnapshotPosition,
} from '../import/snapshotService';
import { instrumentService, type AssetHint } from '../instrumentService';
import { isinResolver } from '../market/isinResolver';
import { buildLedger, quantityDelta } from '../portfolio/positionLedger';
import { userRepository } from '../repositories';
import { portfolioService } from '../portfolioService';
import { withBankHints } from '../cashflow/bankHints';
import { CASH_ACCOUNT_TYPES } from '../cashflow/operations';
import {
    CASH_BALANCE_TOLERANCE,
    dayOf,
    operationsWindow,
    planCashOperations,
    rawLabelOf,
    shiftDay,
    toUpcoming,
    type OperationsWindow,
} from './cashHistory';
import { connectionService } from './connectionService';
import { sourceRegistry } from './sourceRegistry';
import { ConnectorError, type AdapterContext, type CashOperationsRead, type SourceAdapter } from './types';

const LOCK_WAIT_MS = 30_000;
const LOCK_POLL_MS = 500;
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;
const DRIFT_RELATIVE_TOLERANCE = 1e-6;
const DRIFT_ABSOLUTE_TOLERANCE = 1e-8;
const ADJUSTMENT_TYPES: ReadonlySet<string> = new Set(['BALANCE_ADJUSTMENT', 'SNAPSHOT_ADJUSTMENT']);

/** What a sync run is asked for beyond the usual. */
export interface SyncOptions {
    /**
     * Read the whole history of the checking and savings accounts again (12 months, or from the start date): right
     * after the user connected or reconnected the bank, the one moment its website gives the deep history.
     */
    deepHistory?: boolean;
}

/** Resolves the market symbol of a listing (e.g. ISIN → CW8.PA); set by the ISIN resolver. */
export type ListingResolver = (isin: string, currency: string) => Promise<string | undefined>;
let listingResolver: ListingResolver | null = (isin, currency) => isinResolver.resolve(isin, currency);

export function setListingResolver(resolver: ListingResolver | null): void {
    listingResolver = resolver;
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

async function waitForIdleImport(): Promise<boolean> {
    const deadline = Date.now() + LOCK_WAIT_MS;
    while (transactionManager.isBusy()) {
        if (Date.now() > deadline) return false;
        await sleep(LOCK_POLL_MS);
    }
    return true;
}

const statusForError = (code: ConnectionErrorCode): ConnectionStatus => {
    if (code === 'auth_failed') return 'auth_failed';
    if (code === 'rate_limited') return 'rate_limited';
    if (code === 'account_missing') return 'needs_mapping';
    if (code === 'reauth_required') return 'reauth_required';
    return 'error';
};

const isFiniteDecimal = (value: string | undefined): boolean =>
    value === undefined || value === '' || Number.isFinite(Number(value));

function isValidActivity(activity: NormalizedActivity, now: number): boolean {
    const time = Date.parse(activity.date);
    if (Number.isNaN(time) || time > now + FUTURE_TOLERANCE_MS) return false;
    return isFiniteDecimal(activity.amount) && isFiniteDecimal(activity.quantity)
        && isFiniteDecimal(activity.price) && isFiniteDecimal(activity.fee);
}

/** Key the dedup hash and the drift check use for an asset, like a file import does. */
const assetKeyOf = (item: { isin?: string; symbol?: string; currency: string }): string =>
    (item.isin || item.symbol || item.currency).toUpperCase().trim();

async function resolveInstrument(
    item: Pick<NormalizedActivity, 'isin' | 'symbol' | 'name' | 'instrumentType' | 'network' | 'contractAddress' | 'coingeckoId' | 'currency'>,
    accountId: string,
    created: string[]
): Promise<Instrument> {
    const context = getAccountContext(accountId);
    const isin = item.isin?.toUpperCase().trim();
    const isCash = !isin && !item.symbol;
    let symbol = item.symbol?.toUpperCase().trim();
    if (isin && !db.findInstrumentByMarketId({ isin }) && listingResolver) {
        symbol = (await listingResolver(isin, item.currency).catch(() => undefined)) ?? symbol;
    }
    const hint: AssetHint = isCash
        ? { symbol: item.currency, currencyCode: item.currency, type: 'cash', denominationCurrency: item.currency }
        : {
            symbol: symbol || isin || 'UNKNOWN',
            isin,
            name: item.name,
            type: item.instrumentType,
            network: item.network,
            contractAddress: item.contractAddress,
            coingeckoId: item.coingeckoId,
            exchange: context.exchange,
            denominationCurrency: item.currency,
            accountType: context.accountType,
            instituteType: context.instituteType,
        };
    const before = new Set(db.getInstruments().map(instrument => instrument.id));
    const instrument = await instrumentService.findOrCreateInstrument(hint);
    if (!before.has(instrument.id)) created.push(instrument.id);
    return instrument;
}

/**
 * Activities as staged import rows. Bank operations of a checking or savings account (`cash`) are hashed like the
 * same statement imported from a file (no symbol), stay out of the tax engine and keep the bank's hints.
 */
async function stageActivities(
    activities: NormalizedActivity[],
    accountId: string,
    created: string[],
    cash = false
): Promise<StagedTransaction[]> {
    const now = Date.now();
    const staged: StagedTransaction[] = [];
    for (const [index, activity] of activities.entries()) {
        const valid = isValidActivity(activity, now);
        const instrument = valid ? await resolveInstrument(activity, accountId, created) : undefined;
        const hashSymbol = cash ? '' : activity.symbol || activity.isin || activity.currency;
        staged.push({
            id: `sync-${index}`,
            rowIndex: index,
            originalRow: {},
            originalRowArray: [],
            parsed: {
                transactionDate: activity.date,
                type: activity.type,
                subType: activity.subType,
                rawType: activity.rawType,
                label: activity.label,
                rawLabel: rawLabelOf(activity),
                amountPrimary: activity.amount,
                assetSymbol: instrument?.marketIdentifier.symbol ?? (hashSymbol || activity.currency),
                assetIsin: activity.isin,
                priceUnit: activity.price,
                quantity: activity.quantity,
                feeAmount: activity.fee,
                feeAsset: activity.feeAsset,
                taxAmount: activity.tax,
                originalCurrency: activity.currency,
                fxRate: activity.fxRate,
                externalId: activity.externalId,
                instrumentId: instrument?.id,
                ...(cash ? { isFiscal: false, metadata: withBankHints(undefined, activity.bankHints ?? {}) } : {}),
            },
            rowHash: await computeRowHash(activity.date, activity.amount, hashSymbol, activity.type, activity.fee),
            status: valid ? 'valid' : 'error',
            errors: [],
            resolution: valid ? 'import' : 'skip',
        });
    }
    return staged;
}

/** Marks activities already in the journal: by provider id first, then by row-hash occurrences. */
export function markAlreadyStored(staged: StagedTransaction[], accountId: string): void {
    const knownIds = getExistingExternalIds(accountId);
    const remaining: StagedTransaction[] = [];
    for (const row of staged) {
        if (row.status === 'error') continue;
        if (row.parsed.externalId && knownIds.has(row.parsed.externalId)) {
            row.status = 'duplicate';
            row.resolution = 'skip';
        } else {
            remaining.push(row);
        }
    }
    flagDuplicates(remaining, getExistingRowHashCounts(accountId));
}

/** Journal quantity per asset key (ISIN, else symbol) for one account. */
function journalQuantities(accountId: string): Map<string, number> {
    const instruments = new Map(db.getInstruments().map(instrument => [instrument.id, instrument]));
    const quantities = new Map<string, number>();
    for (const entry of buildLedger(db.getUnifiedTransactionsByAccount(accountId)).values()) {
        const instrument = entry.lastTx.instrumentId ? instruments.get(entry.lastTx.instrumentId) : undefined;
        const key = (instrument?.marketIdentifier.isin || instrument?.marketIdentifier.symbol
            || entry.lastTx.assetIsin || entry.lastTx.assetSymbol || '').toUpperCase();
        if (!key) continue;
        quantities.set(key, (quantities.get(key) ?? 0) + entry.state.quantity);
    }
    return quantities;
}

export function computeDrift(holdings: NormalizedHolding[], accountId: string): SyncAccountReport['drift'] {
    const journal = journalQuantities(accountId);
    const drift: SyncAccountReport['drift'] = [];
    for (const holding of holdings) {
        const key = assetKeyOf(holding);
        const provider = Number(holding.quantity);
        const stored = journal.get(key) ?? 0;
        const tolerance = Math.max(DRIFT_ABSOLUTE_TOLERANCE, Math.abs(provider) * DRIFT_RELATIVE_TOLERANCE);
        if (Number.isFinite(provider) && Math.abs(provider - stored) > tolerance) {
            drift.push({ asset: key, providerQuantity: holding.quantity, journalQuantity: String(stored) });
        }
    }
    return drift;
}

/**
 * Average cost proposed for a holding the provider gives without one (a wallet): the
 * quantity-weighted average cost of the same asset in the other accounts, else 0.
 */
function fallbackAverageCost(holding: NormalizedHolding, accountId: string): string {
    const key = assetKeyOf(holding);
    let quantity = 0;
    let cost = 0;
    for (const position of db.getPositions()) {
        if (position.accountId === accountId) continue;
        const positionKey = (position.isin || position.symbol || '').toUpperCase();
        if (positionKey !== key && position.symbol?.toUpperCase() !== holding.symbol?.toUpperCase()) continue;
        if (position.quantity > 0 && Number.isFinite(position.avgCost)) {
            quantity += position.quantity;
            cost += position.quantity * position.avgCost;
        }
    }
    return quantity > 0 ? String(cost / quantity) : '0';
}

interface AccountRunContext {
    adapter: SourceAdapter;
    ctx: AdapterContext;
    connection: SafeConnection;
    externalAccountId: string;
    accountId: string;
    userId: string;
    fileName: string;
}

async function syncHistory(run: AccountRunContext): Promise<{ report: SyncAccountReport; lastDate?: string }> {
    const { adapter, ctx, connection, externalAccountId, accountId } = run;
    const since = connection.cursor[externalAccountId]?.lastActivityDate ?? connection.historyStartDate;
    const fetched = adapter.fetchActivities ? await adapter.fetchActivities(ctx, externalAccountId, since) : [];
    const start = connection.historyStartDate ? Date.parse(connection.historyStartDate) : Number.NEGATIVE_INFINITY;
    const activities = fetched.filter(activity => Date.parse(activity.date) >= start);
    const lastDate = activities.reduce<string | undefined>(
        (latest, activity) => (!latest || activity.date > latest ? activity.date : latest),
        undefined
    );

    const created: string[] = [];
    const staged = await stageActivities(activities, accountId, created);
    markAlreadyStored(staged, accountId);
    const importable = staged.filter(row => row.status === 'valid');
    const report: SyncAccountReport = {
        externalAccountId,
        accountId,
        imported: 0,
        skippedDuplicates: staged.filter(row => row.status === 'duplicate').length,
        drift: [],
    };

    if (importable.length > 0) {
        const fileHash = await computeFileHash(importable.map(row => row.parsed.externalId).join('|'));
        const result = await commitBatch(
            staged, accountId, 'history', run.fileName, fileHash, run.userId, undefined, ',',
            { sourceOrigin: 'API', batchMetadata: { sourceId: connection.sourceId, connectionId: connection.id } }
        );
        if (!result.success) {
            removeInstruments(created);
            throw new ConnectorError('unknown', result.error);
        }
        report.imported = result.transactionCount;
        report.batchId = result.batchId ?? undefined;
    } else {
        removeInstruments(created);
    }

    if (adapter.capabilities.holdings) {
        try {
            report.drift = computeDrift(await adapter.fetchHoldings(ctx, externalAccountId), accountId);
        } catch {
            // The drift check is advisory: a failure there must not fail a committed sync.
        }
    }
    return { report, lastDate };
}

/**
 * Holdings of several provider accounts mapped to one GlassFolio account, summed by asset: two
 * snapshots of the same account would otherwise overwrite each other.
 */
export function mergeHoldings(holdings: NormalizedHolding[]): NormalizedHolding[] {
    const merged = new Map<string, NormalizedHolding>();
    for (const holding of holdings) {
        const key = assetKeyOf(holding);
        const current = merged.get(key);
        if (!current) {
            merged.set(key, { ...holding });
            continue;
        }
        const quantity = Number(current.quantity) + Number(holding.quantity);
        const bothCosted = current.avgCost !== undefined && holding.avgCost !== undefined && quantity > 0;
        merged.set(key, {
            ...current,
            quantity: String(quantity),
            avgCost: bothCosted
                ? String((Number(current.avgCost) * Number(current.quantity) + Number(holding.avgCost) * Number(holding.quantity)) / quantity)
                : undefined,
        });
    }
    return [...merged.values()];
}

async function syncHoldings(run: AccountRunContext, fetched: NormalizedHolding[]): Promise<SyncAccountReport> {
    const { connection, externalAccountId, accountId } = run;
    const report: SyncAccountReport = { externalAccountId, accountId, imported: 0, skippedDuplicates: 0, drift: [] };
    // An empty answer is never taken as "sell everything": a transient provider glitch must not close positions.
    // A confirmed zero balance closes the position; a zero for an asset never held is ignored.
    const journal = journalQuantities(accountId);
    const holdings = mergeHoldings(fetched).filter(holding => Number(holding.quantity) > 0 || journal.has(assetKeyOf(holding)));
    if (fetched.length === 0 || holdings.length === 0) return report;
    // A balance within half a cent of the bank's is the bank's: sums of many operations drift by a hair
    const sameCash = holdings.every(holding => holding.instrumentType === 'cash'
        && Math.abs(Number(holding.quantity) - (journal.get(assetKeyOf(holding)) ?? 0)) < CASH_BALANCE_TOLERANCE);
    if (sameCash) return report;
    // A cost without a source is proposed in the account currency, when that is a real currency (not "BTC")
    const defaultCurrency = db.getAccountById(accountId)?.defaultCurrency;
    const accountCurrency = defaultCurrency && (VALID_FIAT_CURRENCIES as readonly string[]).includes(defaultCurrency)
        ? defaultCurrency
        : undefined;

    // Instruments first, with what the source knows (network, contract, CoinGecko id): the snapshot then finds them
    const created: string[] = [];
    for (const holding of holdings) {
        await resolveInstrument(holding.avgCost ? holding : { ...holding, currency: accountCurrency ?? holding.currency }, accountId, created);
    }

    const positions: SnapshotPosition[] = holdings.map(holding => ({
        assetSymbol: holding.symbol,
        assetIsin: holding.isin,
        assetName: holding.name,
        quantity: holding.quantity,
        avgPrice: holding.avgCost ?? fallbackAverageCost({ ...holding, currency: accountCurrency ?? holding.currency }, accountId),
        displayName: holding.name || holding.symbol || holding.isin || holding.currency,
        assetKey: holding.isin || holding.symbol || 'UNKNOWN',
    }));
    // Assets of the account that this source does not manage (another wallet, a CSV import) are never closed
    const existing = await getExistingPositions(accountId);
    const keepAssets = run.adapter.ownsAsset
        ? existing.filter(position => !run.adapter.ownsAsset?.(position.assetSymbol, position.assetIsin))
            .map(position => ({ assetSymbol: position.assetSymbol, assetIsin: position.assetIsin }))
        : [];
    const preview = await calculateReconciliation(positions, existing, { closeMissing: true, keepAssets });
    const changed = preview.stats.newAssets > 0 || preview.diffs.some(diff => diff.syntheticType !== 'NONE');
    if (!changed) {
        removeInstruments(created);
        return report;
    }

    const result = await commitSnapshotImport({
        mode: 'replace',
        positions,
        accountId,
        userId: run.userId,
        closeMissing: true,
        keepAssets,
        rawContent: JSON.stringify(holdings),
        fileName: run.fileName,
        totalRows: holdings.length,
        batchMetadata: { sourceId: connection.sourceId, connectionId: connection.id },
    });
    if (!result.success) {
        removeInstruments(created);
        throw new ConnectorError('unknown', result.error);
    }
    report.imported = result.transactionCount;
    report.batchId = result.batchId ?? undefined;
    return report;
}

/** Batches a connection committed (operations, balances, openings): the rows a sync may still change. */
const connectionBatchIds = (connectionId: string): Set<string> =>
    new Set(db.getImportBatches().filter(batch => batch.metadata?.connectionId === connectionId).map(batch => batch.id));

/** A stored bank operation brought up to what the bank says now, keeping its id (its category and note follow). */
async function refreshedRow(row: UnifiedTransaction, activity: NormalizedActivity, now: string): Promise<UnifiedTransaction> {
    return {
        ...row,
        transactionDate: activity.date,
        type: activity.type,
        subType: activity.subType,
        rawType: activity.rawType,
        label: activity.label,
        rawLabel: rawLabelOf(activity),
        amountPrimary: activity.amount,
        quantity: activity.quantity ?? row.quantity,
        externalId: activity.externalId,
        rowHash: await computeRowHash(activity.date, activity.amount, '', activity.type, activity.fee),
        metadata: withBankHints(row.metadata, activity.bankHints ?? {}),
        updatedAt: now,
        version: (row.version ?? 1) + 1,
    };
}

/** Replaces the coming operations of an account with the bank's list. */
function saveUpcoming(run: AccountRunContext, read: CashOperationsRead, readAt: string): void {
    const others = db.getCashflowUpcoming().filter(item => item.accountId !== run.accountId);
    db.saveCashflowUpcoming([...others, ...toUpcoming(read.upcoming, {
        accountId: run.accountId, connectionId: run.connection.id, ownerId: run.userId, readAt,
    })]);
}

/**
 * First full read of an account's operations: its balance until now came from the balance syncs (synthetic
 * adjustments). Those are removed, and an opening balance is written the day before the oldest operation: the bank's
 * balance minus what the operations since add up to, so they lead to it with no jump in the curve. The journal holds
 * no negative cash: an opening below zero is written as zero, and the balance reconciliation that follows settles the
 * rest.
 */
async function settleOpeningBalance(run: AccountRunContext, bankBalance: number, currency: string): Promise<boolean> {
    const { accountId, connection } = run;
    const batchIds = connectionBatchIds(connection.id);
    const rows = db.getUnifiedTransactionsByAccount(accountId);
    const operations = rows.filter(row => !ADJUSTMENT_TYPES.has(row.type) && row.metadata?.openingBalance !== true);
    if (operations.length === 0 || !Number.isFinite(bankBalance)) return false;
    const oldest = operations.reduce((min, row) => (row.transactionDate < min ? row.transactionDate : min), operations[0].transactionDate);
    const openingDay = shiftDay(dayOf(oldest), -1);

    const stale = new Set(rows
        .filter(row => ADJUSTMENT_TYPES.has(row.type) && row.isSynthetic && row.batchId && batchIds.has(row.batchId)
            && dayOf(row.transactionDate) >= openingDay)
        .map(row => row.id));
    if (stale.size > 0) db.saveUnifiedTransactions(db.getUnifiedTransactions().filter(row => !stale.has(row.id)));

    const created: string[] = [];
    const instrument = await resolveInstrument({ currency }, accountId, created);
    const now = new Date().toISOString();
    const batchId = `batch-opening-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const opening = (id: string, date: string, fields: Partial<UnifiedTransaction>): UnifiedTransaction => ({
        id: `utx-opening-${accountId}-${id}`,
        ownerId: run.userId,
        batchId,
        accountId,
        instrumentId: instrument.id,
        rowHash: '',
        sourceOrigin: 'API',
        isSynthetic: true,
        isFiscal: false,
        sourceMode: 'snapshot',
        transactionDate: date,
        type: 'BALANCE_ADJUSTMENT',
        rawType: 'Opening balance',
        label: 'Opening balance',
        rawLabel: 'Opening balance',
        amountPrimary: '0',
        assetSymbol: instrument.marketIdentifier.symbol ?? currency,
        priceUnit: '1',
        quantity: '0',
        createdAt: now,
        updatedAt: now,
        version: 1,
        metadata: { balanceStatement: true, openingBalance: true },
        ...fields,
    });
    const statementDate = `${openingDay}T00:00:00.000Z`;
    const symbol = currency.toUpperCase();
    const moved = db.getUnifiedTransactionsByAccount(accountId)
        .filter(row => row.instrumentId === instrument.id || row.assetSymbol?.toUpperCase() === symbol)
        .reduce((total, row) => total + quantityDelta(row), 0);
    const amount = Math.max(Math.round((bankBalance - moved) * 100) / 100, 0).toFixed(2);
    const statement = opening('statement', statementDate, {
        amountPrimary: amount, quantity: amount, label: `${amount} ${currency}`,
        rowHash: await computeRowHash(statementDate, amount, currency, 'BALANCE_ADJUSTMENT', '0'),
    });
    const rowsToAdd: UnifiedTransaction[] = [statement];
    const batch: ImportBatch = {
        id: batchId,
        ownerId: run.userId,
        accountId,
        importMode: 'snapshot',
        fileName: run.fileName,
        fileHash: await computeFileHash(`opening|${accountId}|${openingDay}|${amount}`),
        transactionCount: rowsToAdd.length,
        skippedCount: 0,
        importedAt: now,
        importedBy: run.userId,
        status: 'completed',
        engineVersion: ENGINE_VERSION,
        metadata: { sourceId: connection.sourceId, connectionId: connection.id },
    };
    try {
        transactionManager.begin();
        transactionManager.addTransactions(rowsToAdd);
        transactionManager.addBatch(batch);
        const result = transactionManager.commit();
        if (!result.success) throw new ConnectorError('unknown', result.error);
    } catch (error) {
        if (transactionManager.isBusy()) transactionManager.rollback();
        removeInstruments(created);
        throw error instanceof ConnectorError ? error : new ConnectorError('unknown', 'Opening balance failed');
    }
    return true;
}

/**
 * One checking or savings account read with its operations (TGLA-254): the bank's operations are matched with the
 * journal (new ones added, the live window updated and cleaned), the coming ones kept apart, then the balance is
 * reconciled. A bank refusing the operations only costs them: the balance still syncs.
 */
async function syncCashAccount(run: AccountRunContext, window: OperationsWindow): Promise<{ report: SyncAccountReport; cursor?: ConnectionCursor }> {
    const { adapter, ctx, connection, externalAccountId, accountId } = run;
    if (!adapter.fetchCashOperations) throw new ConnectorError('unknown', 'No operations reader');
    const read = await adapter.fetchCashOperations(ctx, externalAccountId);
    const holdings = await adapter.fetchHoldings(ctx, externalAccountId);
    const readAt = new Date().toISOString();
    if (!read.warnings.includes('coming_failed')) saveUpcoming(run, read, readAt);
    const warnings = read.warnings.length > 0 ? read.warnings : undefined;

    if (read.operations === null) {
        const report = await syncHoldings(run, holdings);
        return { report: { ...report, upcoming: read.upcoming.length, historyWarnings: warnings } };
    }

    const nowMs = Date.now();
    const operations = read.operations.filter(activity => dayOf(activity.date) >= window.since && isValidActivity(activity, nowMs));
    const batchIds = connectionBatchIds(connection.id);
    const existing = db.getUnifiedTransactionsByAccount(accountId).filter(row => row.externalId && row.batchId
        && batchIds.has(row.batchId) && !ADJUSTMENT_TYPES.has(row.type) && row.metadata?.openingBalance !== true);
    const tombstones = db.getCashflowTombstones().filter(tombstone => tombstone.accountId === accountId);
    const deletedIds = new Set(tombstones.map(tombstone => tombstone.externalId).filter((id): id is string => Boolean(id)));
    const deletedHashes = new Set(tombstones.map(tombstone => tombstone.rowHash).filter((hash): hash is string => Boolean(hash)));
    const plan = planCashOperations({
        read: operations, existing, liveStart: window.liveStart, deletedIds, complete: !read.warnings.includes('history_truncated'),
    });

    let changed = false;
    if (plan.update.length > 0 || plan.remove.length > 0) {
        const updates = new Map<string, UnifiedTransaction>();
        for (const { row, activity } of plan.update) updates.set(row.id, await refreshedRow(row, activity, readAt));
        const removed = new Set(plan.remove.map(row => row.id));
        db.saveUnifiedTransactions(db.getUnifiedTransactions().filter(row => !removed.has(row.id)).map(row => updates.get(row.id) ?? row));
        if (removed.size > 0) db.saveCashflowAnnotations(db.getCashflowAnnotations().filter(annotation => !removed.has(annotation.transactionId)));
        changed = true;
    }

    const created: string[] = [];
    const staged = await stageActivities(plan.add, accountId, created, true);
    for (const row of staged) {
        // Deleted by the user before it had an id of its own (a file import): never back
        if (row.status !== 'error' && deletedHashes.has(row.rowHash)) {
            row.status = 'duplicate';
            row.resolution = 'skip';
        }
    }
    markAlreadyStored(staged, accountId);
    const importable = staged.filter(row => row.status === 'valid');
    const report: SyncAccountReport = {
        externalAccountId,
        accountId,
        imported: 0,
        skippedDuplicates: staged.filter(row => row.status === 'duplicate').length,
        drift: [],
        updated: plan.update.length,
        removed: plan.remove.length,
        upcoming: read.upcoming.length,
        historyWarnings: warnings,
    };
    if (importable.length > 0) {
        const fileHash = await computeFileHash(`${accountId}|${importable.map(row => row.parsed.externalId).join('|')}`);
        const result = await commitBatch(
            staged, accountId, 'history', run.fileName, fileHash, run.userId, undefined, ',',
            { sourceOrigin: 'API', batchMetadata: { sourceId: connection.sourceId, connectionId: connection.id } }
        );
        if (!result.success) {
            removeInstruments(created);
            throw new ConnectorError('unknown', result.error);
        }
        report.imported = result.transactionCount;
        report.batchId = result.batchId ?? undefined;
        changed = false; // the commit recalculated the positions
    } else {
        removeInstruments(created);
    }

    const cashLine = holdings.find(holding => holding.instrumentType === 'cash');
    const firstRead = !connection.cursor[externalAccountId]?.operationsFrom;
    if (firstRead && cashLine && await settleOpeningBalance(run, Number(cashLine.quantity), cashLine.currency)) changed = true;
    const balance = await syncHoldings(run, holdings);
    if (balance.imported > 0) changed = false; // the snapshot recalculated the positions
    if (changed) await portfolioService.recalculatePositions();
    report.imported += balance.imported;
    report.batchId = report.batchId ?? balance.batchId;

    const previous = connection.cursor[externalAccountId];
    const lastDate = operations.reduce<string | undefined>((latest, activity) => (!latest || activity.date > latest ? activity.date : latest), previous?.lastActivityDate);
    const from = previous?.operationsFrom && previous.operationsFrom < window.since ? previous.operationsFrom : window.since;
    return { report, cursor: { ...previous, lastActivityDate: lastDate, operationsFrom: window.deep ? from : previous?.operationsFrom ?? from } };
}

async function runSyncNow(connectionId: string, options: SyncOptions = {}): Promise<SyncReport> {
    const startedAt = new Date().toISOString();
    const connection = await connectionService.getConnection(connectionId);
    const finish = async (status: ConnectionStatus, accounts: SyncAccountReport[], errorCode?: ConnectionErrorCode,
        cursor?: SafeConnection['cursor']): Promise<SyncReport> => {
        const finishedAt = new Date().toISOString();
        await connectionService.recordSyncOutcome(connectionId, { status, errorCode, syncedAt: finishedAt, cursor });
        return { connectionId, status, errorCode, startedAt, finishedAt, accounts };
    };
    if (!connection) {
        return { connectionId, status: 'error', errorCode: 'unknown', startedAt, finishedAt: startedAt, accounts: [] };
    }
    const adapter = sourceRegistry.get(connection.sourceId);
    if (!adapter) return finish('error', [], 'unknown');
    if (!(await waitForIdleImport())) return finish('error', [], 'busy');

    // Checking and savings accounts read with their operations: one window each, one bank read for them all
    const windows = new Map<string, OperationsWindow>();
    if (connection.cashHistory === true && adapter.capabilities.cashHistory === true && adapter.fetchCashOperations) {
        const mappedTimes = new Map<string, number>();
        for (const accountId of Object.values(connection.accountMap)) mappedTimes.set(accountId, (mappedTimes.get(accountId) ?? 0) + 1);
        const now = Date.now();
        for (const [externalAccountId, accountId] of Object.entries(connection.accountMap)) {
            const account = db.getAccountById(accountId);
            // Two bank accounts recorded in one GlassFolio account keep the summed balances (their operations would mix)
            if (!account || !CASH_ACCOUNT_TYPES.has(account.type) || (mappedTimes.get(accountId) ?? 0) > 1) continue;
            windows.set(externalAccountId, operationsWindow({
                now,
                historyStartDate: connection.historyStartDate,
                operationsFrom: connection.cursor[externalAccountId]?.operationsFrom,
                deep: options.deepHistory,
            }));
        }
    }
    const ctx: AdapterContext = {
        connectionId,
        credentials: await connectionService.getCredentials(connectionId),
        publicParams: connection.publicParams,
        operationsSince: [...windows.values()].map(window => window.since).sort()[0],
    };
    const userId = (await userRepository.getUser())?.id || 'default-user';
    const fileName = `sync:${connection.sourceId}:${startedAt.slice(0, 10)}`;
    const cursor = { ...connection.cursor };
    const accounts: SyncAccountReport[] = [];
    let missingAccount = false;

    try {
        const holdingsByAccount = new Map<string, { externalIds: string[]; holdings: NormalizedHolding[] }>();
        for (const [externalAccountId, accountId] of Object.entries(connection.accountMap)) {
            if (!db.getAccountById(accountId)) {
                missingAccount = true;
                continue;
            }
            const window = windows.get(externalAccountId);
            if (window) {
                const run: AccountRunContext = { adapter, ctx, connection, externalAccountId, accountId, userId, fileName };
                const result = await syncCashAccount(run, window);
                accounts.push(result.report);
                if (result.cursor) cursor[externalAccountId] = result.cursor;
            } else if (connection.mode === 'history' && adapter.capabilities.history) {
                const run: AccountRunContext = { adapter, ctx, connection, externalAccountId, accountId, userId, fileName };
                const { report, lastDate } = await syncHistory(run);
                accounts.push(report);
                if (lastDate) cursor[externalAccountId] = { lastActivityDate: lastDate };
            } else {
                const group = holdingsByAccount.get(accountId) ?? { externalIds: [], holdings: [] };
                group.externalIds.push(externalAccountId);
                group.holdings.push(...await adapter.fetchHoldings(ctx, externalAccountId));
                holdingsByAccount.set(accountId, group);
            }
        }
        for (const [accountId, group] of holdingsByAccount) {
            const run: AccountRunContext = {
                adapter, ctx, connection, externalAccountId: group.externalIds.join(','), accountId, userId, fileName,
            };
            accounts.push(await syncHoldings(run, group.holdings));
        }
    } catch (error) {
        const code = error instanceof ConnectorError ? error.code : 'network';
        return finish(statusForError(code), accounts, code, cursor);
    } finally {
        adapter.endRun?.(connectionId);
    }

    if (missingAccount || Object.keys(connection.accountMap).length === 0) {
        return finish('needs_mapping', accounts, 'account_missing', cursor);
    }
    return finish('ok', accounts, undefined, cursor);
}

let queue: Promise<unknown> = Promise.resolve();

export const syncEngine = {
    /** Runs one connection's sync. Calls are serialized: two syncs never commit at the same time. */
    runSync(connectionId: string, options: SyncOptions = {}): Promise<SyncReport> {
        const run = queue.then(() => runSyncNow(connectionId, options));
        queue = run.catch(() => undefined);
        return run;
    },

    /**
     * Removes a connection with what it brought: the journal rows of every sync (rolled back like an import), then
     * the accounts it fed that are left empty and no other connection feeds, and their institute once it has no
     * account left. An account that still holds other rows (a file import, a manual entry) is kept.
     *
     * `keepHistory` (offered for a bank, TGLA-254): only the connection goes; its accounts and everything it recorded
     * stay, as if imported, and stay editable.
     */
    async removeConnection(connectionId: string, options: { keepHistory?: boolean } = {}): Promise<{ transactions: number; accounts: number }> {
        const connection = await connectionService.getConnection(connectionId);
        if (!connection) return { transactions: 0, accounts: 0 };
        // What the bank announced as coming is only true while it is synced
        db.saveCashflowUpcoming(db.getCashflowUpcoming().filter(item => item.connectionId !== connectionId));
        if (options.keepHistory) {
            await connectionService.deleteConnection(connectionId);
            return { transactions: 0, accounts: 0 };
        }
        const batchIds = db.getImportBatches()
            .filter(batch => batch.metadata?.connectionId === connectionId && batch.status !== 'rolled_back')
            .map(batch => batch.id);
        const rolledBack = await rollbackBatches(batchIds);
        if (!rolledBack.success) throw new ConnectorError('unknown', rolledBack.error ?? 'Rollback failed');
        await connectionService.deleteConnection(connectionId);

        const stillUsed = new Set(db.getUnifiedTransactions().map(transaction => transaction.accountId));
        const fedByOthers = new Set((await connectionService.listConnections()).flatMap(other => Object.values(other.accountMap)));
        const institutes = new Set<string>();
        let accounts = 0;
        for (const accountId of new Set(Object.values(connection.accountMap))) {
            if (stillUsed.has(accountId) || fedByOthers.has(accountId)) continue;
            const account = db.getAccounts().find(item => item.id === accountId);
            if (account && await accountService.deleteAccount(accountId)) {
                accounts += 1;
                institutes.add(account.instituteId);
            }
        }
        for (const instituteId of institutes) {
            if (!db.getAccounts().some(account => account.instituteId === instituteId)) await instituteService.deleteInstitute(instituteId);
        }
        return { transactions: rolledBack.deleted, accounts };
    },

    /** Accounts the provider lists with the stored credentials (to change where each one is recorded). */
    async listExternalAccounts(connectionId: string): Promise<ExternalAccount[]> {
        const connection = await connectionService.getConnection(connectionId);
        const adapter = connection ? sourceRegistry.get(connection.sourceId) : undefined;
        if (!connection || !adapter) throw new ConnectorError('unknown', 'Unknown connection');
        return adapter.listExternalAccounts({
            connectionId,
            credentials: await connectionService.getCredentials(connectionId),
            publicParams: connection.publicParams,
        });
    },

    /** Whether a connection is due for an automatic sync. */
    isDue(connection: Pick<SafeConnection, 'lastSyncAt' | 'syncIntervalHours' | 'lastStatus'>, now: number = Date.now()): boolean {
        // Only the user can fix these: retrying on a timer would hammer the provider (or a bank) for nothing
        if (connection.lastStatus === 'auth_failed' || connection.lastStatus === 'needs_mapping' || connection.lastStatus === 'reauth_required') return false;
        if (!connection.lastSyncAt) return true;
        const last = Date.parse(connection.lastSyncAt);
        return Number.isNaN(last) || now - last >= connection.syncIntervalHours * 60 * 60 * 1000;
    },
};
