/* eslint-disable no-restricted-globals */
/**
 * IStorageProvider — Abstract Storage Interface
 *
 * Decouples data layer from concrete localStorage implementation.
 * Enables injection of:
 *   - LocalStorageProvider  (offline-first, current default)
 *   - InMemoryStorageProvider (tests — zero I/O, ultra-fast)
 *   - EncryptedStorageProvider (E2EE — src/services/storage/EncryptedStorageProvider.ts)
 */

// ============================================================================
// CONTRACT
// ============================================================================

/** Keys changed by another tab of this browser; `null` when everything may have changed (clear). */
export type ExternalChangeListener = (keys: string[] | null) => void;

export interface IStorageProvider {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
    clear(): void;
    /** Lists every key currently held by the provider. */
    keys(): string[];
    /** Notifies changes made outside this provider (another tab); returns the unsubscribe function. */
    onExternalChange?(listener: ExternalChangeListener): () => void;
}

// ============================================================================
// LOCAL STORAGE PROVIDER (default — browser)
// ============================================================================

export class LocalStorageProvider implements IStorageProvider {
    getItem(key: string): string | null {
        return localStorage.getItem(key);
    }
    setItem(key: string, value: string): void {
        localStorage.setItem(key, value);
    }
    removeItem(key: string): void {
        localStorage.removeItem(key);
    }
    clear(): void {
        localStorage.clear();
    }
    keys(): string[] {
        const result: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key !== null) result.push(key);
        }
        return result;
    }
    onExternalChange(listener: ExternalChangeListener): () => void {
        if (typeof window === 'undefined') return () => undefined;
        // The `storage` event only fires in the other tabs of this origin.
        const onStorage = (event: StorageEvent): void => {
            if (event.storageArea !== localStorage) return;
            listener(event.key === null ? null : [event.key]);
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }
}

// ============================================================================
// IN-MEMORY PROVIDER (testing / offline fallback)
// ============================================================================

export class InMemoryStorageProvider implements IStorageProvider {
    private store: Map<string, string> = new Map();

    getItem(key: string): string | null {
        return this.store.get(key) ?? null;
    }
    setItem(key: string, value: string): void {
        this.store.set(key, value);
    }
    removeItem(key: string): void {
        this.store.delete(key);
    }
    clear(): void {
        this.store.clear();
    }
    keys(): string[] {
        return Array.from(this.store.keys());
    }
}
