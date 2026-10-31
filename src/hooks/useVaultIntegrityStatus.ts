import { useSyncExternalStore } from 'react';
import { appStorage } from '../services/storage/appStorage';
import { VaultIntegrityStatus } from '../services/storage/EncryptedStorageProvider';

const subscribe = (onChange: () => void): (() => void) => appStorage.subscribeIntegrity(onChange);
const getSnapshot = (): VaultIntegrityStatus => appStorage.getIntegrityStatus();

/** Live integrity of the open vault: unreadable records and failed encrypted writes. */
export function useVaultIntegrityStatus(): VaultIntegrityStatus {
    return useSyncExternalStore(subscribe, getSnapshot);
}
