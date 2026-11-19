import { useCallback, useSyncExternalStore } from 'react';
// Ensure appStorage initializes the backing store before storageFactory is accessed directly.
import '../services/storage/appStorage';
import { getSyncedStorageProvider } from '../services/storage/storageFactory';
import { CloudSyncStatus } from '../services/storage/SyncedBackingStorageProvider';
import { VAULT_MAX_RECORDS, VAULT_MAX_TOTAL_BYTES } from '../services/storage/vaultQuota';

const DEFAULT_STATUS: CloudSyncStatus = {
    mode: 'local',
    pendingCount: 0,
    quotaError: null,
    syncError: false,
    usageBytes: 0,
    recordCount: 0,
    maxBytes: VAULT_MAX_TOTAL_BYTES,
    maxRecords: VAULT_MAX_RECORDS,
};

/** Live cloud synchronization and encrypted vault quota status (no-op in local mode). */
export function useCloudSyncStatus(): CloudSyncStatus {
    const provider = getSyncedStorageProvider();
    const subscribe = useCallback(
        (onChange: () => void) => (provider ? provider.subscribe(onChange) : () => undefined),
        [provider],
    );
    return useSyncExternalStore(subscribe, () => (provider ? provider.getCloudSyncStatus() : DEFAULT_STATUS));
}
