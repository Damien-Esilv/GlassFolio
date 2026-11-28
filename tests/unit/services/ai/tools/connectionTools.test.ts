/**
 * Unit Tests — connectionTools.ts (TGLA-221, TGLA-236, TGLA-254)
 *
 * The assistant reads the sync sources without ever seeing a credential, syncs one only with the user's
 * confirmation, adds a watch-only wallet from valid public addresses only, and reads the state of the bank sync
 * (online app, missing worker, banks to reconnect, banks reading operations).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    listConnections: vi.fn(),
    getConnection: vi.fn(),
    createConnection: vi.fn(),
    runSync: vi.fn(),
    status: vi.fn(),
    getAccounts: vi.fn(),
    getAccountById: vi.fn(),
    createAccount: vi.fn(),
    createInstitute: vi.fn(),
    notify: vi.fn(),
    mode: vi.fn(),
}));

vi.mock('../../../../../src/services/connectors', async importOriginal => {
    const actual = await importOriginal<typeof import('../../../../../src/services/connectors')>();
    return {
        ...actual,
        connectionService: { listConnections: mocks.listConnections, getConnection: mocks.getConnection, createConnection: mocks.createConnection },
        syncEngine: { runSync: mocks.runSync },
        woobClient: { status: mocks.status },
    };
});
vi.mock('../../../../../src/services/instituteService', () => ({
    accountService: { getAccounts: mocks.getAccounts, getAccountById: mocks.getAccountById, createAccount: mocks.createAccount },
    instituteService: { createInstitute: mocks.createInstitute },
}));
vi.mock('../../../../../src/services/connectors/syncNotifications', () => ({ notifySyncOutcome: mocks.notify }));
vi.mock('../../../../../src/config/deployment', async importOriginal => {
    const actual = await importOriginal<typeof import('../../../../../src/config/deployment')>();
    return { ...actual, getDeploymentMode: mocks.mode };
});

import {
    addWatchOnlyWalletTool,
    getBankSyncStatusTool,
    listConnectionsTool,
    syncConnectionTool,
} from '../../../../../src/services/ai/tools/connectionTools';
import { aiToolRegistry } from '../../../../../src/services/ai/aiToolRegistry';
import '../../../../../src/services/ai/tools';

const BANK = {
    id: 'conn-bank', sourceId: 'woob', label: 'BoursoBank', accountMap: { 'cc-1': 'acc-cc', 'pea-1': 'acc-pea' },
    publicParams: { module: 'boursorama' }, mode: 'holdings', cashHistory: true, lastStatus: 'reauth_required', lastSyncAt: '2026-11-25T08:00:00.000Z',
    lastErrorCode: 'reauth_required', credentialPreviews: { login: '••••5678', password: '••••' }, cursor: {},
};
const WALLET = {
    id: 'conn-btc', sourceId: 'wallet_btc', label: 'Ledger', accountMap: { wallet: 'acc-ledger' },
    publicParams: { addresses: ['bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'] }, mode: 'holdings', lastStatus: 'ok', credentialPreviews: {}, cursor: {},
};
const BTC_ADDRESS = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';

const report = (status: string, accounts: unknown[] = [], errorCode?: string) => ({
    connectionId: 'c', status, errorCode, startedAt: '', finishedAt: '', accounts,
});

beforeEach(() => {
    vi.clearAllMocks();
    mocks.mode.mockReturnValue('local');
    mocks.listConnections.mockResolvedValue([BANK, WALLET]);
    mocks.getAccounts.mockResolvedValue([{ id: 'acc-cc', name: 'Compte courant' }, { id: 'acc-pea', name: 'PEA' }, { id: 'acc-ledger', name: 'Ledger' }]);
});

describe('connectionTools (AI & MCP)', () => {
    it('registers the four tools: reads without confirmation, changes with it', () => {
        for (const tool of [listConnectionsTool, getBankSyncStatusTool]) {
            expect(aiToolRegistry.getTool(tool.name)).toBe(tool);
            expect(tool.requiresConfirmation).toBeFalsy();
        }
        for (const tool of [syncConnectionTool, addWatchOnlyWalletTool]) {
            expect(aiToolRegistry.getTool(tool.name)).toBe(tool);
            expect(tool.requiresConfirmation).toBe(true);
        }
    });

    it('lists the sources with their accounts and state, never a credential', async () => {
        const listed = await listConnectionsTool.execute({});
        expect(listed).toEqual([
            {
                id: 'conn-bank', label: 'BoursoBank', source: 'woob', mode: 'holdings', status: 'reauth_required',
                lastSyncAt: '2026-11-25T08:00:00.000Z', lastError: 'reauth_required', accounts: ['Compte courant', 'PEA'],
                watchedAddresses: 0, readsBankOperations: true,
            },
            {
                id: 'conn-btc', label: 'Ledger', source: 'wallet_btc', mode: 'holdings', status: 'ok', lastSyncAt: null, lastError: null,
                accounts: ['Ledger'], watchedAddresses: 1, readsBankOperations: false,
            },
        ]);
        const text = JSON.stringify(listed);
        expect(text).not.toContain('5678');
        expect(text).not.toContain('credential');
    });

    describe('sync_connection', () => {
        it('syncs and reports what changed, the bank operations included', async () => {
            mocks.getConnection.mockResolvedValue(BANK);
            mocks.runSync.mockResolvedValue(report('ok', [
                { externalAccountId: 'cc-1', accountId: 'acc-cc', imported: 4, skippedDuplicates: 1, drift: [], updated: 2, removed: 1, upcoming: 3, historyWarnings: ['coming_failed'] },
                { externalAccountId: 'pea-1', accountId: 'acc-pea', imported: 1, skippedDuplicates: 0, drift: [{ asset: 'FR0011869353', providerQuantity: '10', journalQuantity: '9' }] },
            ]));
            const result = await syncConnectionTool.execute({ connectionId: 'conn-bank' });
            expect(mocks.runSync).toHaveBeenCalledWith('conn-bank');
            expect(mocks.notify).toHaveBeenCalledOnce();
            expect(result).toMatchObject({
                success: true, status: 'ok', imported: 5, skippedDuplicates: 1, assetsWithDifferences: ['FR0011869353'],
                bankOperations: { updated: 2, cancelled: 1, upcoming: 3, warnings: ['coming_failed'] },
            });
        });

        it('says when a bank wants the user to reconnect, and leaves out bank operations for other sources', async () => {
            mocks.getConnection.mockResolvedValue(WALLET);
            mocks.runSync.mockResolvedValue(report('reauth_required', [], 'reauth_required'));
            const result = await syncConnectionTool.execute({ connectionId: 'conn-btc' });
            expect(result).toMatchObject({ success: false, status: 'reauth_required' });
            expect(result.message).toContain('reauth_required');
            expect(result).not.toHaveProperty('bankOperations');
        });

        it('an unknown connection syncs nothing', async () => {
            mocks.getConnection.mockResolvedValue(null);
            const result = await syncConnectionTool.execute({ connectionId: 'nope' });
            expect(result).toMatchObject({ success: false, message: 'Connection not found.' });
            expect(mocks.runSync).not.toHaveBeenCalled();
        });
    });

    describe('add_watch_only_wallet', () => {
        it('creates a crypto account named after the wallet, records the addresses once, then syncs', async () => {
            mocks.createInstitute.mockResolvedValue({ id: 'inst-new' });
            mocks.createAccount.mockResolvedValue({ id: 'acc-new' });
            mocks.createConnection.mockResolvedValue({ id: 'conn-new', sourceId: 'wallet_btc', label: 'Cold wallet' });
            mocks.runSync.mockResolvedValue(report('ok'));
            const result = await addWatchOnlyWalletTool.execute({ label: ' Cold wallet ', addresses: `${BTC_ADDRESS}, ${BTC_ADDRESS}` }, { currency: 'USD' } as never);
            expect(mocks.createInstitute).toHaveBeenCalledWith({ name: 'Cold wallet', type: 'wallet' });
            expect(mocks.createAccount).toHaveBeenCalledWith(expect.objectContaining({ instituteId: 'inst-new', type: 'crypto_spot', defaultCurrency: 'USD' }));
            expect(mocks.createConnection).toHaveBeenCalledWith(expect.objectContaining({
                sourceId: 'wallet_btc', label: 'Cold wallet', publicParams: { addresses: [BTC_ADDRESS] },
            }));
            expect(mocks.runSync).toHaveBeenCalledWith('conn-new');
            expect(result).toEqual({ success: true, connectionId: 'conn-new', message: 'Wallet "Cold wallet" added and synced.' });
        });

        it('records an EVM wallet in an existing account, and reports a first sync that failed', async () => {
            mocks.getAccountById.mockResolvedValue({ id: 'acc-ledger' });
            mocks.createConnection.mockResolvedValue({ id: 'conn-evm', sourceId: 'wallet_evm', label: 'MetaMask' });
            mocks.runSync.mockResolvedValue(report('error', [], 'network'));
            const result = await addWatchOnlyWalletTool.execute({
                label: 'MetaMask', addresses: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', chain: 'evm', accountId: 'acc-ledger',
            });
            expect(mocks.createAccount).not.toHaveBeenCalled();
            expect(mocks.createConnection).toHaveBeenCalledWith(expect.objectContaining({ sourceId: 'wallet_evm', accountMap: { wallet: 'acc-ledger' } }));
            expect(result).toMatchObject({ success: false, connectionId: 'conn-evm' });
            expect(result.message).toContain('network');
        });

        it('refuses invalid addresses, an address of another network, an empty name or an unknown account, creating nothing', async () => {
            expect((await addWatchOnlyWalletTool.execute({ label: 'W', addresses: 'not-an-address' })).success).toBe(false);
            expect((await addWatchOnlyWalletTool.execute({ label: 'W', addresses: BTC_ADDRESS, chain: 'solana' })).success).toBe(false);
            expect((await addWatchOnlyWalletTool.execute({ label: '  ', addresses: BTC_ADDRESS })).success).toBe(false);
            expect((await addWatchOnlyWalletTool.execute({ label: 'W', addresses: BTC_ADDRESS, chain: 'dogecoin' as never })).message).toBe('Unknown network.');
            mocks.getAccountById.mockResolvedValue(null);
            expect(await addWatchOnlyWalletTool.execute({ label: 'W', addresses: BTC_ADDRESS, accountId: 'missing' }))
                .toEqual({ success: false, connectionId: null, message: 'Account not found.' });
            expect(mocks.createConnection).not.toHaveBeenCalled();
            expect(mocks.runSync).not.toHaveBeenCalled();
        });
    });

    describe('get_bank_sync_status', () => {
        it('lists the banks this computer reads and the linked banks that need the user', async () => {
            mocks.status.mockResolvedValue({
                available: true, commit: 'abc123',
                banks: [
                    { module: 'boursorama', name: 'Boursorama', positions: true, history: true, upcoming: true, fields: [] },
                    { module: 'cragr', name: 'Crédit Agricole', positions: false, history: true, upcoming: false, fields: [] },
                ],
            });
            const status = await getBankSyncStatusTool.execute({});
            expect(status).toMatchObject({ available: true, reason: 'ok', modules: { active: 'verified', commit: 'abc123' } });
            expect(status.supportedBanks).toEqual(expect.arrayContaining([
                expect.objectContaining({ module: 'boursorama', positions: true, operations: true }),
                expect.objectContaining({ module: 'cragr', positions: false, operations: true }),
            ]));
            expect(status.connectedBanks).toEqual([expect.objectContaining({
                connectionId: 'conn-bank', status: 'reauth_required', needsReconnect: true, readsOperations: true,
            })]);
        });

        it('says why banks are out of reach: the online app, or the worker missing here', async () => {
            mocks.status.mockResolvedValue({ available: false });
            mocks.mode.mockReturnValue('cloud');
            expect(await getBankSyncStatusTool.execute({})).toMatchObject({ available: false, reason: 'online_app', supportedBanks: [] });
            mocks.mode.mockReturnValue('local');
            expect(await getBankSyncStatusTool.execute({})).toMatchObject({ available: false, reason: 'module_missing' });
        });

        it('reports the latest Woob modules when the user chose them', async () => {
            mocks.status.mockResolvedValue({ available: true, banks: [], modules: { channel: 'latest', active: 'latest', commit: 'def456' } });
            expect((await getBankSyncStatusTool.execute({})).modules).toEqual({ active: 'latest', commit: 'def456' });
        });
    });
});
