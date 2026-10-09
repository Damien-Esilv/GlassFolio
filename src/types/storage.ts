/* eslint-disable no-restricted-globals */
/**
 * IStorageProvider — Abstract Storage Interface
 *
 * Decouples data layer from concrete localStorage implementation.
 * Enables injection of:
 *   - LocalStorageProvider  (offline-first, current default)
 *   - InMemoryStorageProvider (tests — zero I/O, ultra-fast)
 *   - EncryptedStorageProvider (future E2EE feature)
 */

// ============================================================================
// CONTRACT
// ============================================================================

export interface IStorageProvider {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
    clear(): void;
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
}
