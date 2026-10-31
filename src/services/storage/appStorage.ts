/**
 * appStorage — the single IStorageProvider used by the data layer.
 *
 * Routing for sensitive keys:
 *   - no vault yet          → backing store, plaintext (legacy / first run)
 *   - vault locked          → reads return null, writes throw VaultLockedError
 *   - vault unlocked        → EncryptedStorageProvider
 * Non-sensitive keys always go straight to the backing store.
 */

import { getDeploymentMode } from '../../config/deployment';
import { IStorageProvider } from '../../types/storage';
import { VaultLockedError } from '../security/vaultTypes';
import { EncryptedStorageProvider, VaultIntegrityStatus } from './EncryptedStorageProvider';
import { createBackingStorage } from './storageFactory';
import { isSensitiveKey, VAULT_HEADER_KEY } from './storageKeys';

const INTACT: VaultIntegrityStatus = { corruptedKeys: [], writeFailed: false };

export class AppStorage implements IStorageProvider {
    private encrypted: EncryptedStorageProvider | null = null;
    private readonly integrityListeners = new Set<() => void>();
    private readonly externalDataListeners = new Set<(keys: string[]) => void>();
    private unsubscribeEncrypted: (() => void) | null = null;
    /** Bumped on every change of user data (here or in another tab): a cheap "has anything changed". */
    private dataVersion = 0;

    constructor(private readonly backing: IStorageProvider) { }

    getDataVersion(): number {
        return this.dataVersion;
    }

    /** Unreadable records and failed encrypted writes of the open vault (intact while locked). */
    getIntegrityStatus(): VaultIntegrityStatus {
        return this.encrypted?.getIntegrityStatus() ?? INTACT;
    }

    subscribeIntegrity(listener: () => void): () => void {
        this.integrityListeners.add(listener);
        return () => this.integrityListeners.delete(listener);
    }

    /** Records changed by another tab of this browser; the data layer should reload them. */
    subscribeExternalData(listener: (keys: string[]) => void): () => void {
        this.externalDataListeners.add(listener);
        return () => this.externalDataListeners.delete(listener);
    }

    private emitIntegrity(): void {
        this.integrityListeners.forEach(listener => listener());
    }

    /** Raw backing store (ciphertext for sensitive keys). Reserved for the vault service. */
    getBacking(): IStorageProvider {
        return this.backing;
    }

    attachEncrypted(provider: EncryptedStorageProvider): void {
        this.unsubscribeEncrypted?.();
        this.encrypted = provider;
        const offIntegrity = provider.subscribeIntegrity(() => this.emitIntegrity());
        const offData = provider.subscribeExternalData(keys => {
            this.dataVersion++;
            this.externalDataListeners.forEach(listener => listener(keys));
        });
        this.unsubscribeEncrypted = () => {
            offIntegrity();
            offData();
        };
        this.emitIntegrity();
    }

    detachEncrypted(): EncryptedStorageProvider | null {
        const previous = this.encrypted;
        this.unsubscribeEncrypted?.();
        this.unsubscribeEncrypted = null;
        this.encrypted = null;
        this.emitIntegrity();
        return previous;
    }

    getEncrypted(): EncryptedStorageProvider | null {
        return this.encrypted;
    }

    isVaultInitialized(): boolean {
        return this.backing.getItem(VAULT_HEADER_KEY) !== null;
    }

    getItem(key: string): string | null {
        if (!isSensitiveKey(key)) return this.backing.getItem(key);
        if (this.encrypted) return this.encrypted.getItem(key);
        if (this.isVaultInitialized()) return null;
        return this.backing.getItem(key);
    }

    setItem(key: string, value: string): void {
        if (isSensitiveKey(key)) this.dataVersion++;
        if (!isSensitiveKey(key)) {
            this.backing.setItem(key, value);
        } else if (this.encrypted) {
            this.encrypted.setItem(key, value);
        } else if (this.isVaultInitialized()) {
            throw new VaultLockedError(key);
        } else {
            this.backing.setItem(key, value);
        }
    }

    removeItem(key: string): void {
        if (isSensitiveKey(key)) this.dataVersion++;
        if (!isSensitiveKey(key)) {
            this.backing.removeItem(key);
        } else if (this.encrypted) {
            this.encrypted.removeItem(key);
        } else if (this.isVaultInitialized()) {
            throw new VaultLockedError(key);
        } else {
            this.backing.removeItem(key);
        }
    }

    /** Clears sensitive data only (never wipes other apps sharing the origin). */
    clear(): void {
        this.dataVersion++;
        if (this.encrypted) {
            this.encrypted.clear();
            return;
        }
        if (this.isVaultInitialized()) throw new VaultLockedError();
        this.backing.keys().filter(isSensitiveKey).forEach(key => this.backing.removeItem(key));
    }

    keys(): string[] {
        if (this.encrypted) return this.encrypted.keys();
        if (this.isVaultInitialized()) return this.backing.keys().filter(key => !isSensitiveKey(key));
        return this.backing.keys();
    }
}

export const appStorage = new AppStorage(createBackingStorage(getDeploymentMode()));
