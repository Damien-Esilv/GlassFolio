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

let cloudFallbackNotified = false;

export const createBackingStorage = (mode: DeploymentMode): IStorageProvider => {
    switch (mode) {
        case 'cloud':
            if (!cloudFallbackNotified) {
                cloudFallbackNotified = true;
                console.warn('[storage] Cloud storage provider not available yet — using browser storage (E2EE still applies).');
            }
            return new LocalStorageProvider();
        case 'local':
        default:
            return new LocalStorageProvider();
    }
};
