/**
 * EncryptedStorageProvider — transparent E2EE over any IStorageProvider (TGLA-041).
 *
 * Keeps the synchronous IStorageProvider contract that `db.ts` relies on:
 *   1. `open()` (async) decrypts every sensitive record into an in-memory cache.
 *   2. `getItem()` serves sensitive keys synchronously from that cache.
 *   3. `setItem()/removeItem()` update the cache immediately, then a coalescing
 *      write-behind queue encrypts (AES-256-GCM, AAD = key) and persists.
 *   4. `flush()` awaits the queue (called before lock).
 *
 * Non-sensitive keys (market caches, vault header) pass straight through.
 * Legacy plaintext found during `open()` is adopted and re-written encrypted
 * (self-healing migration).
 */

import { IStorageProvider } from '../../types/storage';
import { decryptString, encryptString, parseEnvelope, serializeEnvelope } from '../security/crypto';
import { isSensitiveKey } from './storageKeys';

export interface EncryptedStorageOptions {
    /** Only true during first-time local setup to migrate pre-vault local storage. */
    adoptLegacyPlaintext?: boolean;
}

export class EncryptedStorageProvider implements IStorageProvider {
    private readonly cache = new Map<string, string>();
    /** Pending writes: value to encrypt, or `null` for a deletion. */
    private readonly dirty = new Map<string, string | null>();
    private drainPromise: Promise<void> = Promise.resolve();
    private draining = false;
    private dek: CryptoKey | null;
    private readonly corruptedKeys: string[] = [];
    private lastWriteError: unknown = null;
    private readonly options: EncryptedStorageOptions;

    private constructor(
        private readonly backing: IStorageProvider,
        dek: CryptoKey,
        options: EncryptedStorageOptions = {}
    ) {
        this.dek = dek;
        this.options = options;
    }

    /** Decrypts all sensitive records from `backing` and returns a ready provider. */
    static async open(
        backing: IStorageProvider,
        dek: CryptoKey,
        options: EncryptedStorageOptions = {}
    ): Promise<EncryptedStorageProvider> {
        const provider = new EncryptedStorageProvider(backing, dek, options);
        await provider.hydrate();
        return provider;
    }

    private async hydrate(): Promise<void> {
        const dek = this.requireDek();
        for (const key of this.backing.keys()) {
            if (!isSensitiveKey(key)) continue;
            const raw = this.backing.getItem(key);
            if (raw === null) continue;
            const envelope = parseEnvelope(raw);
            if (!envelope) {
                if (this.options.adoptLegacyPlaintext) {
                    // Legacy plaintext during initial local setup only → adopt and schedule encryption.
                    this.cache.set(key, raw);
                    this.dirty.set(key, raw);
                } else {
                    // Untrusted plaintext injected into storage → reject as corrupted, do not adopt or re-encrypt.
                    this.corruptedKeys.push(key);
                    console.error(`[vault] Non-envelope plaintext found for sensitive key "${key}" — record ignored.`);
                }
                continue;
            }
            try {
                this.cache.set(key, await decryptString(dek, envelope, key));
            } catch {
                // Tampered / foreign ciphertext: never overwrite silently at open time.
                this.corruptedKeys.push(key);
                console.error(`[vault] Failed to decrypt "${key}" — record ignored.`);
            }
        }
        if (this.dirty.size > 0) this.scheduleDrain();
    }

    // ── IStorageProvider ──────────────────────────────────────────────────────

    getItem(key: string): string | null {
        if (!isSensitiveKey(key)) return this.backing.getItem(key);
        this.requireDek();
        return this.cache.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        if (!isSensitiveKey(key)) {
            this.backing.setItem(key, value);
            return;
        }
        this.requireDek();
        this.cache.set(key, value);
        this.dirty.set(key, value);
        this.scheduleDrain();
    }

    removeItem(key: string): void {
        if (!isSensitiveKey(key)) {
            this.backing.removeItem(key);
            return;
        }
        this.requireDek();
        this.cache.delete(key);
        this.dirty.set(key, null);
        this.scheduleDrain();
    }

    /** Removes every sensitive record (non-sensitive keys are left untouched). */
    clear(): void {
        this.requireDek();
        const sensitive = new Set<string>([
            ...this.cache.keys(),
            ...this.backing.keys().filter(isSensitiveKey),
        ]);
        this.cache.clear();
        sensitive.forEach(key => this.dirty.set(key, null));
        this.scheduleDrain();
    }

    keys(): string[] {
        return [
            ...this.backing.keys().filter(key => !isSensitiveKey(key)),
            ...this.cache.keys(),
        ];
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /** Resolves once every pending write has been encrypted and persisted. */
    async flush(): Promise<void> {
        while (this.draining) {
            await this.drainPromise;
        }
    }

    /** Drops decrypted data and the DEK reference. Call `flush()` first. */
    dispose(): void {
        this.cache.clear();
        this.dirty.clear();
        this.dek = null;
    }

    isOpen(): boolean {
        return this.dek !== null;
    }

    getCorruptedKeys(): readonly string[] {
        return this.corruptedKeys;
    }

    getLastWriteError(): unknown {
        return this.lastWriteError;
    }

    // ── Internals ─────────────────────────────────────────────────────────────

    private requireDek(): CryptoKey {
        if (!this.dek) throw new Error('EncryptedStorageProvider has been disposed.');
        return this.dek;
    }

    private scheduleDrain(): void {
        if (this.draining) return;
        this.draining = true;
        this.drainPromise = this.drain();
    }

    private async drain(): Promise<void> {
        try {
            // Let synchronous bursts of writes coalesce.
            await Promise.resolve();
            while (this.dirty.size > 0 && this.dek) {
                const batch = Array.from(this.dirty.entries());
                this.dirty.clear();
                for (const [key, value] of batch) {
                    if (value === null) {
                        this.backing.removeItem(key);
                    } else {
                        const envelope = await encryptString(this.dek, value, key);
                        this.backing.setItem(key, serializeEnvelope(envelope));
                    }
                }
            }
        } catch (err) {
            this.lastWriteError = err;
            console.error('[vault] Encrypted write failed', err);
        } finally {
            this.draining = false;
            if (this.dirty.size > 0 && this.dek && this.lastWriteError === null) {
                this.scheduleDrain();
            }
        }
    }
}
