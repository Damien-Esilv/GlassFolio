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
import { EncryptedStorageProvider } from './EncryptedStorageProvider';
import { createBackingStorage } from './storageFactory';
import { isSensitiveKey, VAULT_HEADER_KEY } from './storageKeys';

export class AppStorage implements IStorageProvider {
    private encrypted: EncryptedStorageProvider | null = null;

    constructor(private readonly backing: IStorageProvider) { }

    /** Raw backing store (ciphertext for sensitive keys). Reserved for the vault service. */
    getBacking(): IStorageProvider {
        return this.backing;
    }

    attachEncrypted(provider: EncryptedStorageProvider): void {
        this.encrypted = provider;
    }

    detachEncrypted(): EncryptedStorageProvider | null {
        const previous = this.encrypted;
        this.encrypted = null;
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
