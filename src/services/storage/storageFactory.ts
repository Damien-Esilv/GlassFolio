/**
 * Backing storage factory keyed on the deployment mode.
 *
 * Both modes currently persist to browser storage; `cloud` will swap to an
 * InstantDB-backed provider. Data is end-to-end encrypted above this layer
 * (EncryptedStorageProvider), so the backing store only ever sees ciphertext
 * for sensitive keys once a vault exists.
 */

import { DeploymentMode } from '../../config/deployment';
import { IStorageProvider, LocalStorageProvider } from '../../types/storage';
import { SyncedBackingStorageProvider } from './SyncedBackingStorageProvider';

let syncedProviderInstance: SyncedBackingStorageProvider | null = null;

export const createBackingStorage = (mode: DeploymentMode): IStorageProvider => {
    if (!syncedProviderInstance) {
        syncedProviderInstance = new SyncedBackingStorageProvider(new LocalStorageProvider(), mode);
    }
    return syncedProviderInstance;
};

export const getSyncedStorageProvider = (): SyncedBackingStorageProvider | null => {
    return syncedProviderInstance;
};
