/**
 * Backing storage factory keyed on the deployment mode.
 *
 *  - `local`: LocalVaultStorageProvider — the local server volume is the source of truth for the
 *    vault and user data (Epic E33); it falls back to browser storage when no vault API exists.
 *  - `cloud`: browser storage, replicated to Supabase by SyncedBackingStorageProvider.
 *
 * Data is end-to-end encrypted above this layer (EncryptedStorageProvider), so the backing store
 * only ever sees ciphertext for sensitive keys once a vault exists.
 */

import { DeploymentMode } from '../../config/deployment';
import { IStorageProvider, LocalStorageProvider } from '../../types/storage';
import { LocalVaultStorageProvider } from './LocalVaultStorageProvider';
import { SyncedBackingStorageProvider } from './SyncedBackingStorageProvider';

let syncedProviderInstance: SyncedBackingStorageProvider | null = null;
let localVaultInstance: LocalVaultStorageProvider | null = null;

export const createBackingStorage = (mode: DeploymentMode): IStorageProvider => {
    if (!syncedProviderInstance) {
        const browser = new LocalStorageProvider();
        if (mode === 'local') localVaultInstance = new LocalVaultStorageProvider(browser);
        syncedProviderInstance = new SyncedBackingStorageProvider(localVaultInstance ?? browser, mode);
    }
    return syncedProviderInstance;
};

export const getSyncedStorageProvider = (): SyncedBackingStorageProvider | null => {
    return syncedProviderInstance;
};

/** The server-backed provider of local mode, or null in cloud mode. */
export const getLocalVaultProvider = (): LocalVaultStorageProvider | null => {
    return localVaultInstance;
};

/** Waits until every queued local-mode write is confirmed by the server (true in cloud mode). */
export const flushLocalPersistence = async (): Promise<boolean> => {
    return localVaultInstance ? localVaultInstance.flush() : true;
};

/** Like flushLocalPersistence, but throws so destructive flows never report a success the server did not confirm. */
export const requireLocalPersistence = async (): Promise<void> => {
    if (!(await flushLocalPersistence())) {
        throw new Error('The local server did not confirm the change. Check that it is running and try again.');
    }
};
