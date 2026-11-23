/**
 * Institutions and accounts management (Settings → Accounts): what each account holds, what feeds it, rename,
 * and delete with everything recorded in it.
 *
 * An account fed by an automatic sync (bank, broker keys, watch-only wallet) is deleted from its connection in
 * Settings → Connections, which removes what the sync imported: deleting it here would leave a connection that
 * recreates it, or a mapping that points nowhere.
 */
import { db, delay } from './db';
import { accountService, instituteService } from './instituteService';
import { connectionService } from './connectors/connectionService';
import { rollbackBatches } from './import/importManager';
import { portfolioService } from './portfolioService';
import type { SourceId } from '../types/connections';

export interface ManagedAccount {
    id: string;
    name: string;
    type: string;
    wrapperType?: string;
    currency: string;
    /** Journal rows recorded in the account (imports, syncs, manual entries). */
    operations: number;
    /** The automatic sync that feeds it, if any. */
    syncedBy: { connectionId: string; label: string; sourceId: SourceId } | null;
}

export interface ManagedInstitution {
    id: string;
    name: string;
    type: string;
    accounts: ManagedAccount[];
}

export type ManagementError = 'not_found' | 'synced' | 'empty_name';

export interface ManagementResult {
    success: boolean;
    error?: ManagementError;
    /** Journal rows deleted with the account(s). */
    operations?: number;
}

const MAX_NAME_LENGTH = 80;

async function syncedAccounts(): Promise<Map<string, ManagedAccount['syncedBy']>> {
    const fed = new Map<string, ManagedAccount['syncedBy']>();
    for (const connection of await connectionService.listConnections()) {
        for (const accountId of Object.values(connection.accountMap)) {
            fed.set(accountId, { connectionId: connection.id, label: connection.label, sourceId: connection.sourceId });
        }
    }
    return fed;
}

/** Deletes an account's rows (rolled back batch by batch, then any row outside a batch) without recalculating. */
async function dropAccountRows(accountId: string): Promise<number> {
    const batches = db.getImportBatchesByAccount(accountId).filter(batch => batch.status !== 'rolled_back').map(batch => batch.id);
    const before = db.getUnifiedTransactions().length;
    const rolledBack = await rollbackBatches(batches);
    if (!rolledBack.success) throw new Error(rolledBack.error ?? 'Rollback failed');
    // Rows recorded by hand or by an older import carry no batch of this account
    const rows = db.getUnifiedTransactions();
    const kept = rows.filter(row => row.accountId !== accountId);
    if (kept.length !== rows.length) db.saveUnifiedTransactions(kept);
    return before - kept.length;
}

export const accountManagementService = {
    /** Every institution with its accounts, the number of operations of each and the sync that feeds it. */
    async listInstitutions(): Promise<ManagedInstitution[]> {
        await delay(100);
        const [institutes, accounts, fed] = await Promise.all([instituteService.getInstitutes(), accountService.getAccounts(), syncedAccounts()]);
        const operations = new Map<string, number>();
        for (const row of db.getUnifiedTransactions()) operations.set(row.accountId, (operations.get(row.accountId) ?? 0) + 1);
        return institutes
            .map(institute => ({
                id: institute.id,
                name: institute.name,
                type: institute.type,
                accounts: accounts
                    .filter(account => account.instituteId === institute.id)
                    .map(account => ({
                        id: account.id,
                        name: account.name,
                        type: account.type,
                        wrapperType: account.wrapperType,
                        currency: account.defaultCurrency,
                        operations: operations.get(account.id) ?? 0,
                        syncedBy: fed.get(account.id) ?? null,
                    }))
                    .sort((a, b) => a.name.localeCompare(b.name)),
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
    },

    async renameInstitution(id: string, name: string): Promise<ManagementResult> {
        const clean = name.trim().slice(0, MAX_NAME_LENGTH);
        if (!clean) return { success: false, error: 'empty_name' };
        if (!(await instituteService.updateInstitute(id, { name: clean }))) return { success: false, error: 'not_found' };
        // Positions keep the bank and account names they were built with: rebuild them so every screen shows the new one
        await portfolioService.recalculatePositions();
        return { success: true };
    },

    async renameAccount(id: string, name: string): Promise<ManagementResult> {
        const clean = name.trim().slice(0, MAX_NAME_LENGTH);
        if (!clean) return { success: false, error: 'empty_name' };
        if (!(await accountService.updateAccount(id, { name: clean }))) return { success: false, error: 'not_found' };
        await portfolioService.recalculatePositions();
        return { success: true };
    },

    /** Deletes an account and every operation recorded in it, then recalculates the positions. */
    async deleteAccount(id: string): Promise<ManagementResult> {
        if (!(await accountService.getAccountById(id))) return { success: false, error: 'not_found' };
        if ((await syncedAccounts()).has(id)) return { success: false, error: 'synced' };
        const operations = await dropAccountRows(id);
        await accountService.deleteAccount(id);
        await portfolioService.recalculatePositions();
        return { success: true, operations };
    },

    /** Deletes an institution with all its accounts and their operations (refused while a sync feeds one of them). */
    async deleteInstitution(id: string): Promise<ManagementResult> {
        if (!(await instituteService.getInstituteById(id))) return { success: false, error: 'not_found' };
        const accounts = await accountService.getAccountsByInstitute(id);
        const fed = await syncedAccounts();
        if (accounts.some(account => fed.has(account.id))) return { success: false, error: 'synced' };
        let operations = 0;
        for (const account of accounts) operations += await dropAccountRows(account.id);
        await instituteService.deleteInstitute(id);
        await portfolioService.recalculatePositions();
        return { success: true, operations };
    },
};
