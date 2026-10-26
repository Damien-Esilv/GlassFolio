import { useCallback, useSyncExternalStore } from 'react';
import { getLocalVaultProvider } from '../services/storage/storageFactory';
import { LocalPersistenceStatus } from '../services/storage/LocalVaultStorageProvider';

const NO_PROVIDER: LocalPersistenceStatus = {
    mode: 'uninitialized',
    pending: 0,
    lastSavedAt: null,
    lastError: null,
    legacyBrowserVaultIgnored: false,
};

/** Live persistence status of local mode (server volume vs browser). `uninitialized` in cloud mode. */
export function useLocalPersistenceStatus(): LocalPersistenceStatus {
    const provider = getLocalVaultProvider();
    const subscribe = useCallback(
        (onChange: () => void) => (provider ? provider.subscribe(onChange) : () => undefined),
        [provider],
    );
    return useSyncExternalStore(subscribe, () => (provider ? provider.getStatus() : NO_PROVIDER));
}
