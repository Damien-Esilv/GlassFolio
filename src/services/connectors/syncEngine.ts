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
 */
import type { Instrument } from '../../types';
import { VALID_FIAT_CURRENCIES } from '../../types/types.backend';
import type {
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
import { commitBatch, flagDuplicates, type StagedTransaction } from '../import/importManager';
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
import { buildLedger } from '../portfolio/positionLedger';
import { userRepository } from '../repositories';
import { connectionService } from './connectionService';
import { sourceRegistry } from './sourceRegistry';
import { ConnectorError, type AdapterContext, type SourceAdapter } from './types';

const LOCK_WAIT_MS = 30_000;
const LOCK_POLL_MS = 500;
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;
const DRIFT_RELATIVE_TOLERANCE = 1e-6;
const DRIFT_ABSOLUTE_TOLERANCE = 1e-8;

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

async function stageActivities(
    activities: NormalizedActivity[],
    accountId: string,
    created: string[]
): Promise<StagedTransaction[]> {
    const now = Date.now();
    const staged: StagedTransaction[] = [];
    for (const [index, activity] of activities.entries()) {
        const valid = isValidActivity(activity, now);
        const instrument = valid ? await resolveInstrument(activity, accountId, created) : undefined;
        const hashSymbol = activity.symbol || activity.isin || activity.currency;
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
                rawLabel: activity.label ?? activity.rawType,
                amountPrimary: activity.amount,
                assetSymbol: instrument?.marketIdentifier.symbol ?? hashSymbol,
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

async function runSyncNow(connectionId: string): Promise<SyncReport> {
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

    const ctx: AdapterContext = {
        connectionId,
        credentials: await connectionService.getCredentials(connectionId),
        publicParams: connection.publicParams,
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
            if (connection.mode === 'history' && adapter.capabilities.history) {
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
    }

    if (missingAccount || Object.keys(connection.accountMap).length === 0) {
        return finish('needs_mapping', accounts, 'account_missing', cursor);
    }
    return finish('ok', accounts, undefined, cursor);
}

let queue: Promise<unknown> = Promise.resolve();

export const syncEngine = {
    /** Runs one connection's sync. Calls are serialized: two syncs never commit at the same time. */
    runSync(connectionId: string): Promise<SyncReport> {
        const run = queue.then(() => runSyncNow(connectionId));
        queue = run.catch(() => undefined);
        return run;
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
        if (connection.lastStatus === 'auth_failed' || connection.lastStatus === 'needs_mapping') return false;
        if (!connection.lastSyncAt) return true;
        const last = Date.parse(connection.lastSyncAt);
        return Number.isNaN(last) || now - last >= connection.syncIntervalHours * 60 * 60 * 1000;
    },
};
