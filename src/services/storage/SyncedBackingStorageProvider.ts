/**
 * SyncedBackingStorageProvider (TGLA-060 & TGLA-061).
 *
 * Implements IStorageProvider by wrapping a local synchronous backing store (LocalStorageProvider)
 * and automatically synchronizing ciphertext records:
 *  - In Cloud mode: with Supabase PostgreSQL (E2EE Encrypted Storage).
 *  - In Local mode: nothing to replicate here — the wrapped LocalVaultStorageProvider already
 *    persists to the server volume (Epic E33).
 */

import { DeploymentMode } from '../../config/deployment';
import { ExternalChangeListener, IStorageProvider } from '../../types/storage';
import { SupabaseAuthSession, supabaseClient, isSupabaseConfigured } from '../supabase/supabaseClient';
import { parseEnvelope, PBKDF2_ITERATIONS } from '../security/crypto';
import { isSensitiveKey, VAULT_HEADER_KEY } from './storageKeys';

const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 60_000;

export interface PullResult {
    /** False when the remote could not be reached; local state must then be treated as unknown. */
    ok: boolean;
    hasRemoteHeader: boolean;
}

export class SyncedBackingStorageProvider implements IStorageProvider {
    private session: SupabaseAuthSession | null = null;
    /** Cloud writes are replicated only for this user, once their vault is unlocked in the UI. */
    private replicationUserId: string | null = null;
    private isPulling = false;
    private lastSyncError: unknown = null;
    /** Keys whose latest local change the server has not confirmed yet: retried, and kept by a pull. */
    private readonly unsynced = new Set<string>();
    private retryTimer: ReturnType<typeof setTimeout> | null = null;
    private retryDelayMs = RETRY_BASE_MS;

    constructor(
        private readonly local: IStorageProvider,
        private readonly mode: DeploymentMode
    ) {
        if (mode === 'cloud' && typeof window !== 'undefined') {
            window.addEventListener('online', () => this.retryNow());
        }
    }

    public setSupabaseSession(session: SupabaseAuthSession | null): void {
        // Changes queued for one account never go out under another one's session
        if (session?.user.id !== this.session?.user.id) this.forgetUnsynced();
        this.session = session;
        if (!session) this.replicationUserId = null;
    }

    /** Allows cloud replication for `userId`; ignored unless it matches the attached session. */
    public enableReplication(userId: string): void {
        this.replicationUserId = userId;
        this.retryNow();
    }

    /** Number of local changes not confirmed by the server yet (cloud mode). */
    public getUnsyncedCount(): number {
        return this.unsynced.size;
    }

    public disableReplication(): void {
        this.replicationUserId = null;
    }

    public isReplicationEnabled(): boolean {
        return this.canReplicateToCloud();
    }

    private canReplicateToCloud(): boolean {
        return this.mode === 'cloud'
            && this.session !== null
            && isSupabaseConfigured()
            && this.replicationUserId !== null
            && this.replicationUserId === this.session.user.id;
    }

    public getSupabaseSession(): SupabaseAuthSession | null {
        return this.session;
    }

    public getLastSyncError(): unknown {
        return this.lastSyncError;
    }

    /**
     * Pulls latest ciphertext records from Supabase into the local store (cloud mode).
     */
    public async pullFromRemote(): Promise<PullResult> {
        if (this.isPulling) return { ok: false, hasRemoteHeader: false };
        this.isPulling = true;
        this.lastSyncError = null;
        let result: PullResult = { ok: true, hasRemoteHeader: false };

        try {
            if (this.mode === 'cloud' && this.session && isSupabaseConfigured()) {
                const [headerRow, records] = await Promise.all([
                    supabaseClient.getVaultHeader(this.session.accessToken),
                    supabaseClient.getVaultRecords(this.session.accessToken),
                ]);

                if (headerRow && !this.unsynced.has(VAULT_HEADER_KEY)) {
                    const parsed = headerRow.header_json as { kdf?: { iterations?: number } } | null;
                    if (parsed && typeof parsed === 'object' && typeof parsed.kdf?.iterations === 'number' && parsed.kdf.iterations < PBKDF2_ITERATIONS) {
                        // A downgraded header is a tamper signal, never "this account has no vault":
                        // callers would otherwise offer to create a new vault over the real one.
                        console.error('[storage] Rejected remote vault header: iteration count below floor', parsed.kdf.iterations);
                        this.lastSyncError = new Error('VAULT_HEADER_REJECTED');
                        return { ok: false, hasRemoteHeader: false };
                    } else {
                        this.local.setItem(VAULT_HEADER_KEY, JSON.stringify(headerRow.header_json));
                        result = { ok: true, hasRemoteHeader: true };
                    }
                }

                for (const row of records) {
                    // A local change the server has not received yet is newer than its copy
                    if (this.unsynced.has(row.record_key)) continue;
                    // Only adopt records that are valid sensitive keys and carry valid ciphertext envelopes
                    if (isSensitiveKey(row.record_key) && parseEnvelope(row.ciphertext) !== null) {
                        this.local.setItem(row.record_key, row.ciphertext);
                    }
                }
                if (headerRow && this.unsynced.has(VAULT_HEADER_KEY)) result = { ok: true, hasRemoteHeader: true };
                this.retryNow();
            } else if (this.mode === 'local') {
                // Local mode: the server snapshot was loaded into memory at startup (LocalVaultStorageProvider).
                result = { ok: true, hasRemoteHeader: this.local.getItem(VAULT_HEADER_KEY) !== null };
            }
        } catch (err) {
            this.lastSyncError = err;
            result = { ok: false, hasRemoteHeader: false };
            console.warn('[storage] pullFromRemote encountered error, operating on local cache', err);
        } finally {
            this.isPulling = false;
        }
        return result;
    }

    /**
     * Every local ciphertext record, ready to be sent in one atomic server transaction
     * (supabaseClient.commitVaultMigration). Needed after a DEK rotation: normal replication only
     * sends records written later, so the server would keep old-DEK records next to the new header.
     */
    public collectSensitiveEnvelopes(): Array<{ record_key: string; ciphertext: string }> {
        const out: Array<{ record_key: string; ciphertext: string }> = [];
        for (const key of this.local.keys()) {
            if (!isSensitiveKey(key)) continue;
            const value = this.local.getItem(key);
            if (value === null || parseEnvelope(value) === null) continue;
            out.push({ record_key: key, ciphertext: value });
        }
        return out;
    }

    /**
     * Removes this device's vault keys. In cloud mode nothing is replicated: resetting a device must
     * never delete the user's server-side vault, which only the account deletion RPC removes (TGLA-101).
     */
    public removeVaultKeys(shouldRemove: (key: string) => boolean): void {
        if (this.mode === 'cloud') {
            this.replicationUserId = null;
            this.forgetUnsynced();
        }
        for (const key of this.local.keys()) {
            if (!shouldRemove(key)) continue;
            this.local.removeItem(key);
        }
    }

    // ── IStorageProvider Synchronous Contract ─────────────────────────────────

    public getItem(key: string): string | null {
        return this.local.getItem(key);
    }

    public setItem(key: string, value: string): void {
        this.local.setItem(key, value);
        this.replicateSet(key, value);
    }

    public removeItem(key: string): void {
        this.local.removeItem(key);
        this.replicateRemove(key);
    }

    public clear(): void {
        // Cloud: a local clear never wipes the remote vault (see replicateRemove).
        this.local.clear();
    }

    public keys(): string[] {
        return this.local.keys();
    }

    public onExternalChange(listener: ExternalChangeListener): () => void {
        return this.local.onExternalChange?.(listener) ?? (() => undefined);
    }

    // ── Asynchronous Remote Replications ──────────────────────────────────────

    private replicateSet(key: string, _value: string): void {
        // Only replicate vault header or encrypted financial keys
        if (!isSensitiveKey(key) && key !== VAULT_HEADER_KEY) return;
        if (this.mode === 'cloud') this.push(key);
    }

    private replicateRemove(key: string): void {
        if (!isSensitiveKey(key) && key !== VAULT_HEADER_KEY) return;
        // Removing the local header only resets this device; the remote vault is deleted
        // exclusively through the account deletion RPC.
        if (this.mode === 'cloud' && key !== VAULT_HEADER_KEY) this.push(key);
    }

    /** Sends the current local state of `key`; a failure keeps it queued and retried with backoff. */
    private push(key: string): void {
        if (!this.canReplicateToCloud() || !this.session) return;
        const token = this.session.accessToken;
        const value = this.local.getItem(key);
        let request: Promise<void>;
        if (key === VAULT_HEADER_KEY) {
            if (value === null) return;
            let parsed: Record<string, unknown>;
            try {
                parsed = JSON.parse(value) as Record<string, unknown>;
            } catch {
                return; // Ignored if non-json
            }
            request = supabaseClient.upsertVaultHeader(token, parsed, Boolean(parsed.totpEnabled));
        } else if (value === null) {
            request = supabaseClient.deleteVaultRecord(token, key);
        } else {
            // Only ciphertext ever leaves the device.
            if (parseEnvelope(value) === null) return;
            request = supabaseClient.upsertVaultRecord(token, key, value);
        }
        this.unsynced.add(key);
        request.then(() => {
            // A newer change sent its own request
            if (this.local.getItem(key) === value) this.unsynced.delete(key);
            this.retryDelayMs = RETRY_BASE_MS;
            if (this.unsynced.size === 0) this.lastSyncError = null;
        }).catch((err) => {
            this.lastSyncError = err;
            this.scheduleRetry();
        });
    }

    private scheduleRetry(): void {
        if (this.retryTimer !== null) return;
        const delay = this.retryDelayMs;
        this.retryDelayMs = Math.min(RETRY_MAX_MS, this.retryDelayMs * 2);
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            Array.from(this.unsynced).forEach(key => this.push(key));
        }, delay);
    }

    private retryNow(): void {
        if (this.unsynced.size === 0 || !this.canReplicateToCloud()) return;
        if (this.retryTimer !== null) clearTimeout(this.retryTimer);
        this.retryTimer = null;
        Array.from(this.unsynced).forEach(key => this.push(key));
    }

    private forgetUnsynced(): void {
        this.unsynced.clear();
        if (this.retryTimer !== null) clearTimeout(this.retryTimer);
        this.retryTimer = null;
        this.retryDelayMs = RETRY_BASE_MS;
    }
}
