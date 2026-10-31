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
import { VaultRecordUnreadableError } from '../security/vaultTypes';
import { isSensitiveKey } from './storageKeys';

export interface EncryptedStorageOptions {
    /** Only true during first-time local setup to migrate pre-vault local storage. */
    adoptLegacyPlaintext?: boolean;
}

export interface VaultIntegrityStatus {
    /** Records that could not be decrypted: kept unchanged, and every write to them is refused. */
    corruptedKeys: readonly string[];
    /** The last encrypted write failed (e.g. storage full): the changes are still queued. */
    writeFailed: boolean;
}

export class EncryptedStorageProvider implements IStorageProvider {
    private readonly cache = new Map<string, string>();
    /** Pending writes: value to encrypt, or `null` for a deletion. */
    private readonly dirty = new Map<string, string | null>();
    private drainPromise: Promise<void> = Promise.resolve();
    private draining = false;
    private dek: CryptoKey | null;
    private readonly corruptedKeys = new Set<string>();
    private lastWriteError: unknown = null;
    private readonly options: EncryptedStorageOptions;
    private integrity: VaultIntegrityStatus = { corruptedKeys: [], writeFailed: false };
    private readonly integrityListeners = new Set<() => void>();
    private readonly dataListeners = new Set<(keys: string[]) => void>();
    private unsubscribeBacking: (() => void) | null = null;

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
        provider.listenToBacking();
        return provider;
    }

    /**
     * Re-encrypts `records` under a new DEK (DEK rotation, vault migration): they replace the
     * previous ciphertext. A sensitive record of `backing` left out stays unreadable (and protected).
     */
    static rekey(backing: IStorageProvider, dek: CryptoKey, records: Map<string, string>): EncryptedStorageProvider {
        const provider = new EncryptedStorageProvider(backing, dek);
        for (const [key, value] of records) {
            if (!isSensitiveKey(key)) continue;
            provider.cache.set(key, value);
            provider.dirty.set(key, value);
        }
        for (const key of backing.keys()) {
            if (isSensitiveKey(key) && !records.has(key)) provider.corruptedKeys.add(key);
        }
        provider.publishIntegrity();
        provider.listenToBacking();
        if (provider.dirty.size > 0) provider.scheduleDrain();
        return provider;
    }

    private listenToBacking(): void {
        this.unsubscribeBacking = this.backing.onExternalChange?.((keys) => {
            void this.applyExternalChange(keys);
        }) ?? null;
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
                    this.corruptedKeys.add(key);
                    console.error(`[vault] Non-envelope plaintext found for sensitive key "${key}" — record ignored.`);
                }
                continue;
            }
            try {
                this.cache.set(key, await decryptString(dek, envelope, key));
            } catch {
                // Tampered / foreign ciphertext: kept as is, and protected from writes (see assertWritable).
                this.corruptedKeys.add(key);
                console.error(`[vault] Failed to decrypt "${key}" — record ignored.`);
            }
        }
        this.publishIntegrity();
        if (this.dirty.size > 0) this.scheduleDrain();
    }

    /** Re-reads records another tab wrote, so this tab never writes its stale copy back over them. */
    private async applyExternalChange(keys: string[] | null): Promise<void> {
        const dek = this.dek;
        if (!dek) return;
        const candidates = keys ?? Array.from(new Set([...this.cache.keys(), ...this.backing.keys()]));
        const changed: string[] = [];
        for (const key of candidates) {
            // A pending local write is newer than what the other tab saved
            if (!isSensitiveKey(key) || this.dirty.has(key)) continue;
            const raw = this.backing.getItem(key);
            if (raw === null) {
                if (this.cache.delete(key)) changed.push(key);
                this.corruptedKeys.delete(key);
                continue;
            }
            const envelope = parseEnvelope(raw);
            if (!envelope) continue;
            try {
                const plain = await decryptString(dek, envelope, key);
                if (this.dek !== dek || this.dirty.has(key)) return;
                if (this.cache.get(key) !== plain) {
                    this.cache.set(key, plain);
                    changed.push(key);
                }
                this.corruptedKeys.delete(key);
            } catch {
                // Keep the copy this tab could read
            }
        }
        this.publishIntegrity();
        if (changed.length > 0) this.dataListeners.forEach(listener => listener(changed));
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
        this.assertWritable(key);
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
        this.assertWritable(key);
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
        // An explicit wipe is the user's decision: unreadable records go too
        this.corruptedKeys.clear();
        this.publishIntegrity();
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

    /** Resolves once every pending write has been encrypted and persisted (one retry after a failure). */
    async flush(): Promise<void> {
        if (!this.draining && this.dirty.size > 0) this.scheduleDrain();
        while (this.draining) {
            await this.drainPromise;
        }
    }

    /** Drops decrypted data and the DEK reference. Call `flush()` first. */
    dispose(): void {
        this.unsubscribeBacking?.();
        this.unsubscribeBacking = null;
        this.cache.clear();
        this.dirty.clear();
        this.dek = null;
        this.dataListeners.clear();
        this.integrityListeners.clear();
    }

    isOpen(): boolean {
        return this.dek !== null;
    }

    getCorruptedKeys(): readonly string[] {
        return this.integrity.corruptedKeys;
    }

    getLastWriteError(): unknown {
        return this.lastWriteError;
    }

    getIntegrityStatus(): VaultIntegrityStatus {
        return this.integrity;
    }

    /** Listens to integrity changes (unreadable records, failed writes). */
    subscribeIntegrity(listener: () => void): () => void {
        this.integrityListeners.add(listener);
        return () => this.integrityListeners.delete(listener);
    }

    /** Listens to records changed by another tab, once they are decrypted into this tab's cache. */
    subscribeExternalData(listener: (keys: string[]) => void): () => void {
        this.dataListeners.add(listener);
        return () => this.dataListeners.delete(listener);
    }

    // ── Internals ─────────────────────────────────────────────────────────────

    private requireDek(): CryptoKey {
        if (!this.dek) throw new Error('EncryptedStorageProvider has been disposed.');
        return this.dek;
    }

    private assertWritable(key: string): void {
        if (this.corruptedKeys.has(key)) throw new VaultRecordUnreadableError(key);
    }

    private publishIntegrity(): void {
        const corruptedKeys = Array.from(this.corruptedKeys);
        const writeFailed = this.lastWriteError !== null;
        if (writeFailed === this.integrity.writeFailed
            && corruptedKeys.length === this.integrity.corruptedKeys.length
            && corruptedKeys.every(key => this.integrity.corruptedKeys.includes(key))) return;
        this.integrity = { corruptedKeys, writeFailed };
        this.integrityListeners.forEach(listener => listener());
    }

    private scheduleDrain(): void {
        if (this.draining) return;
        this.draining = true;
        this.drainPromise = this.drain();
    }

    private async drain(): Promise<void> {
        // A record that cannot be written (storage full, too large) is skipped for this pass: it must
        // not hold back the others queued behind it.
        const failedKeys = new Set<string>();
        let lastError: unknown = null;
        try {
            // Let synchronous bursts of writes coalesce.
            await Promise.resolve();
            while (this.dek) {
                const next = Array.from(this.dirty.entries()).find(([key]) => !failedKeys.has(key));
                if (!next) break;
                const [key, value] = next;
                const dek = this.dek;
                try {
                    if (value === null) {
                        this.backing.removeItem(key);
                    } else {
                        const envelope = await encryptString(dek, value, key);
                        // Closed (reset, lock) while encrypting: a record of that vault must not land in storage
                        if (this.dek !== dek) break;
                        this.backing.setItem(key, serializeEnvelope(envelope));
                    }
                    // Dequeue only once persisted (a failure keeps it queued); a newer write stays pending.
                    if (this.dirty.get(key) === value) this.dirty.delete(key);
                } catch (err) {
                    failedKeys.add(key);
                    lastError = err;
                    console.error(`[vault] Encrypted write of "${key}" failed`, err);
                }
            }
        } finally {
            this.lastWriteError = failedKeys.size > 0 ? lastError : null;
            this.draining = false;
            this.publishIntegrity();
            // After a failure, the next write (or flush) retries the whole queue.
            if (failedKeys.size === 0 && this.dirty.size > 0 && this.dek) {
                this.scheduleDrain();
            }
        }
    }
}
