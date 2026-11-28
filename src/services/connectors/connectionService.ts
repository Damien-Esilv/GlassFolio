/**
 * Sync connections store (TGLA-221).
 *
 * One record per configured source (a SnapTrade Personal key pair, a set of watch-only wallets…),
 * persisted in the encrypted vault under `glassfolio_connections`. Credentials never leave this
 * service unmasked except through `getCredentials`, which only the sync engine calls. They are kept
 * out of backups and GDPR archives on purpose: a restored backup must never plant credentials.
 */
import type {
    Connection,
    ConnectionCursor,
    ConnectionErrorCode,
    ConnectionStatus,
    NewConnectionInput,
    SafeConnection,
} from '../../types/connections';
import { db, delay, isRealUserVaultActive } from '../db';
import { userRepository } from '../repositories';
import { auditLogService } from '../security/auditLogService';
import { appStorage } from '../storage/appStorage';
import { CONNECTIONS_STORAGE_KEY } from '../storage/storageKeys';
import { woobClient } from './woobClient';

export { CONNECTIONS_STORAGE_KEY };

const DEFAULT_SYNC_INTERVAL_HOURS = 24;
const MIN_SYNC_INTERVAL_HOURS = 1;

const CONNECTION_ID_PATTERN = /^conn-\d{10,16}-[0-9a-f]{8}$/;

/** A new connection id, for a caller that needs it before the connection exists (a bank login). */
export const newConnectionId = (): string => `conn-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

export const maskCredential = (value: string): string => {
    const trimmed = value.trim();
    if (trimmed.length <= 4) return '••••••••';
    return `••••••••${trimmed.slice(-4)}`;
};

const toSafe = ({ credentials, ...rest }: Connection): SafeConnection => ({
    ...rest,
    credentialPreviews: Object.fromEntries(
        Object.entries(credentials).map(([name, value]) => [name, maskCredential(value)])
    ),
});

/**
 * Demo vault: watch-only wallets of well-known public addresses, all recorded in the demo Ledger
 * account. Balances stay modest (≈0.18 BTC, ≈5.8 ETH, ≈0.04 SOL on 2026-11-20) so a "Sync now" in
 * the demo shows real data without dwarfing the rest of the demo portfolio. Never synced on their own.
 */
const DEMO_WALLETS: ReadonlyArray<Pick<Connection, 'id' | 'sourceId' | 'label'> & { addresses: string[] }> = [
    { id: 'conn-demo-btc', sourceId: 'wallet_btc', label: 'Ledger · Bitcoin (Electrum docs address)', addresses: ['bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'] },
    { id: 'conn-demo-evm', sourceId: 'wallet_evm', label: 'vitalik.eth (public wallet)', addresses: ['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'] },
    { id: 'conn-demo-sol', sourceId: 'wallet_sol', label: 'Solana docs example wallet', addresses: ['vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg'] },
];

const buildDemoConnections = (): Connection[] => {
    const at = new Date().toISOString();
    return DEMO_WALLETS.map(({ addresses, ...wallet }) => ({
        ...wallet,
        ownerId: 'default-user',
        accountMap: { wallet: 'acc-ledger-cold' },
        credentials: {},
        publicParams: { addresses },
        mode: 'holdings',
        syncIntervalHours: 24,
        cursor: {},
        lastStatus: 'never_synced',
        createdAt: at,
        updatedAt: at,
    }));
};

const readAll = (): Connection[] => {
    const raw = appStorage.getItem(CONNECTIONS_STORAGE_KEY);
    if (!raw) return isRealUserVaultActive() ? [] : buildDemoConnections();
    try {
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as Connection[]) : [];
    } catch {
        return [];
    }
};

const writeAll = (items: Connection[]): void => {
    appStorage.setItem(CONNECTIONS_STORAGE_KEY, JSON.stringify(items));
};

const cleanCredentials = (input: Record<string, string> | undefined): Record<string, string> =>
    Object.fromEntries(
        Object.entries(input ?? {})
            .map(([name, value]) => [name, value.trim()] as const)
            .filter(([, value]) => value.length > 0)
    );

const clampInterval = (hours: number | undefined): number => {
    if (hours === undefined || !Number.isFinite(hours)) return DEFAULT_SYNC_INTERVAL_HOURS;
    return Math.max(MIN_SYNC_INTERVAL_HOURS, Math.round(hours));
};

export interface ConnectionUpdate {
    label?: string;
    credentials?: Record<string, string>;
    publicParams?: Connection['publicParams'];
    accountMap?: Record<string, string>;
    mode?: Connection['mode'];
    syncIntervalHours?: number;
    historyStartDate?: string;
    /** Bank (Woob): read the operations of the checking and savings accounts (TGLA-254). */
    cashHistory?: boolean;
    /** Merged into the stored cursor (start date of a newly linked account). */
    cursor?: Record<string, ConnectionCursor>;
}

export interface SyncOutcome {
    status: ConnectionStatus;
    errorCode?: ConnectionErrorCode;
    syncedAt: string;
    cursor?: Record<string, ConnectionCursor>;
}

export const connectionService = {
    async listConnections(): Promise<SafeConnection[]> {
        await delay(100);
        return readAll().map(toSafe);
    },

    async getConnection(id: string): Promise<SafeConnection | null> {
        await delay(50);
        const found = readAll().find(item => item.id === id);
        return found ? toSafe(found) : null;
    },

    /** Raw credentials of one connection. For the sync engine only — never pass them to the UI or an AI tool. */
    async getCredentials(id: string): Promise<Record<string, string>> {
        const found = readAll().find(item => item.id === id);
        return found ? { ...found.credentials } : {};
    },

    /** Every credential value stored, so the AI guardrails can redact them from outgoing text. */
    listCredentialValues(): string[] {
        return readAll().flatMap(item => Object.values(item.credentials)).filter(value => value.length >= 8);
    },

    async createConnection(input: NewConnectionInput): Promise<SafeConnection> {
        await delay(150);
        const label = input.label.trim();
        if (!label) throw new Error('Connection label cannot be empty.');

        const now = new Date().toISOString();
        const currentUser = await userRepository.getUser();
        const items = readAll();
        if (input.id !== undefined && (!CONNECTION_ID_PATTERN.test(input.id) || items.some(item => item.id === input.id))) {
            throw new Error('Invalid connection id.');
        }
        const connection: Connection = {
            id: input.id ?? newConnectionId(),
            ownerId: currentUser?.id || 'default-user',
            sourceId: input.sourceId,
            label,
            accountMap: { ...(input.accountMap ?? {}) },
            credentials: cleanCredentials(input.credentials),
            publicParams: { ...(input.publicParams ?? {}) },
            mode: input.mode ?? (input.sourceId === 'snaptrade' ? 'history' : 'holdings'),
            syncIntervalHours: clampInterval(input.syncIntervalHours),
            historyStartDate: input.historyStartDate,
            ...(input.cashHistory !== undefined ? { cashHistory: input.cashHistory } : {}),
            cursor: { ...(input.cursor ?? {}) },
            lastStatus: 'never_synced',
            createdAt: now,
            updatedAt: now,
        };
        writeAll([...items, connection]);
        await auditLogService.record('connection_created', `Sync connection created for ${connection.sourceId} (${label})`);
        return toSafe(connection);
    },

    async updateConnection(id: string, update: ConnectionUpdate): Promise<SafeConnection> {
        await delay(100);
        const items = readAll();
        const index = items.findIndex(item => item.id === id);
        if (index < 0) throw new Error('Connection not found.');
        const current = items[index];
        const next: Connection = {
            ...current,
            label: update.label?.trim() || current.label,
            credentials: update.credentials
                ? { ...current.credentials, ...cleanCredentials(update.credentials) }
                : current.credentials,
            publicParams: update.publicParams ?? current.publicParams,
            accountMap: update.accountMap ?? current.accountMap,
            mode: update.mode ?? current.mode,
            syncIntervalHours: update.syncIntervalHours === undefined
                ? current.syncIntervalHours
                : clampInterval(update.syncIntervalHours),
            historyStartDate: update.historyStartDate ?? current.historyStartDate,
            cashHistory: update.cashHistory ?? current.cashHistory,
            cursor: update.cursor ? { ...current.cursor, ...update.cursor } : current.cursor,
            updatedAt: new Date().toISOString(),
        };
        items[index] = next;
        writeAll(items);
        return toSafe(next);
    },

    /** Records the outcome of a sync run (status, time, incremental cursor). */
    async recordSyncOutcome(id: string, outcome: SyncOutcome): Promise<void> {
        const items = readAll();
        const index = items.findIndex(item => item.id === id);
        if (index < 0) return;
        items[index] = {
            ...items[index],
            lastStatus: outcome.status,
            lastErrorCode: outcome.errorCode,
            lastSyncAt: outcome.syncedAt,
            cursor: outcome.cursor ?? items[index].cursor,
        };
        writeAll(items);
    },

    async deleteConnection(id: string): Promise<void> {
        await delay(100);
        const items = readAll();
        const target = items.find(item => item.id === id);
        if (!target) return;
        writeAll(items.filter(item => item.id !== id));
        // A bank connection also leaves a saved bank session (cookies) with the local worker: delete it too
        if (target.sourceId === 'woob') await woobClient.forget(id);
        await auditLogService.record('connection_deleted', `Sync connection deleted for ${target.sourceId}`);
    },

    /** Connections that point to a deleted GlassFolio account keep working for the other accounts. */
    async detachAccount(accountId: string): Promise<void> {
        const items = readAll();
        let changed = false;
        const next = items.map(item => {
            const entries = Object.entries(item.accountMap).filter(([, mapped]) => mapped !== accountId);
            if (entries.length === Object.keys(item.accountMap).length) return item;
            changed = true;
            return { ...item, accountMap: Object.fromEntries(entries) };
        });
        if (changed) writeAll(next);
    },

    /**
     * Day after the last journal row of an account (YYYY-MM-DD), or '' for an empty account: a broker
     * synced into an account that already holds imported rows starts there, so nothing is imported twice.
     */
    suggestStartDate(accountId: string): string {
        const dates = db.getUnifiedTransactionsByAccount(accountId).map(row => row.transactionDate).sort();
        const last = dates[dates.length - 1];
        if (!last || Number.isNaN(Date.parse(last))) return '';
        const next = new Date(last);
        next.setUTCDate(next.getUTCDate() + 1);
        return next.toISOString().slice(0, 10);
    },

    /** Metadata for the GDPR archive: everything except the credentials. */
    exportMetadata(): SafeConnection[] {
        return readAll().map(toSafe);
    },

    clear(): void {
        appStorage.removeItem(CONNECTIONS_STORAGE_KEY);
    },
};
