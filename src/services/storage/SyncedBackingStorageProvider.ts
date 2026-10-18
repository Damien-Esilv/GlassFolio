/**
 * SyncedBackingStorageProvider (TGLA-060 & TGLA-061).
 *
 * Implements IStorageProvider by wrapping a local synchronous backing store (LocalStorageProvider)
 * and automatically synchronizing ciphertext records:
 *  - In Cloud mode: with Supabase PostgreSQL (E2EE Encrypted Storage).
 *  - In Local Docker mode: with the Docker Host Volume via `/api/local-vault` (survives browser wipe/switch).
 */

import { DeploymentMode } from '../../config/deployment';
import { IStorageProvider } from '../../types/storage';
import { SupabaseAuthSession, supabaseClient, isSupabaseConfigured } from '../supabase/supabaseClient';
import { isSensitiveKey, VAULT_HEADER_KEY } from './storageKeys';

export class SyncedBackingStorageProvider implements IStorageProvider {
    private session: SupabaseAuthSession | null = null;
    private isPulling = false;
    private lastSyncError: unknown = null;

    constructor(
        private readonly local: IStorageProvider,
        private readonly mode: DeploymentMode
    ) {}

    public setSupabaseSession(session: SupabaseAuthSession | null): void {
        this.session = session;
    }

    public getSupabaseSession(): SupabaseAuthSession | null {
        return this.session;
    }

    public getLastSyncError(): unknown {
        return this.lastSyncError;
    }

    /**
     * Pulls latest ciphertext records from remote (Supabase or Docker local-vault) into local store.
     */
    public async pullFromRemote(): Promise<void> {
        if (this.isPulling) return;
        this.isPulling = true;
        this.lastSyncError = null;

        try {
            if (this.mode === 'cloud' && this.session && isSupabaseConfigured()) {
                const [headerRow, records] = await Promise.all([
                    supabaseClient.getVaultHeader(this.session.accessToken),
                    supabaseClient.getVaultRecords(this.session.accessToken),
                ]);

                if (headerRow) {
                    this.local.setItem(VAULT_HEADER_KEY, JSON.stringify(headerRow.header_json));
                }

                for (const row of records) {
                    this.local.setItem(row.record_key, row.ciphertext);
                }
            } else if (this.mode === 'local') {
                // Attempt to hydrate from local Docker server volume
                if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
                    try {
                        const res = await fetch('/api/local-vault', {
                            method: 'GET',
                            headers: { 'Accept': 'application/json' },
                        });
                        if (res.ok) {
                            const data = (await res.json()) as { records?: Record<string, string> };
                            if (data && data.records) {
                                for (const [k, v] of Object.entries(data.records)) {
                                    this.local.setItem(k, v);
                                }
                            }
                        }
                    } catch {
                        // Silent fallback when running purely in vite dev without docker-server
                    }
                }
            }
        } catch (err) {
            this.lastSyncError = err;
            console.warn('[storage] pullFromRemote encountered error, operating on local cache', err);
        } finally {
            this.isPulling = false;
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
        this.local.clear();
        this.replicateClear();
    }

    public keys(): string[] {
        return this.local.keys();
    }

    // ── Asynchronous Remote Replications ──────────────────────────────────────

    private replicateSet(key: string, value: string): void {
        // Only replicate vault header or encrypted financial keys
        if (!isSensitiveKey(key) && key !== VAULT_HEADER_KEY) return;

        if (this.mode === 'cloud' && this.session && isSupabaseConfigured()) {
            if (key === VAULT_HEADER_KEY) {
                try {
                    const parsed = JSON.parse(value) as Record<string, unknown>;
                    supabaseClient.upsertVaultHeader(this.session.accessToken, parsed).catch((err) => {
                        this.lastSyncError = err;
                    });
                } catch {
                    // Ignored if non-json
                }
            } else {
                supabaseClient.upsertVaultRecord(this.session.accessToken, key, value).catch((err) => {
                    this.lastSyncError = err;
                });
            }
        } else if (this.mode === 'local' && typeof window !== 'undefined' && typeof fetch !== 'undefined') {
            fetch('/api/local-vault', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, value }),
            }).catch(() => {
                // Ignore dev network errors
            });
        }
    }

    private replicateRemove(key: string): void {
        if (!isSensitiveKey(key) && key !== VAULT_HEADER_KEY) return;

        if (this.mode === 'cloud' && this.session && isSupabaseConfigured()) {
            supabaseClient.deleteVaultRecord(this.session.accessToken, key).catch((err) => {
                this.lastSyncError = err;
            });
        } else if (this.mode === 'local' && typeof window !== 'undefined' && typeof fetch !== 'undefined') {
            fetch('/api/local-vault', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key }),
            }).catch(() => {
                // Ignore dev network errors
            });
        }
    }

    private replicateClear(): void {
        if (this.mode === 'cloud' && this.session && isSupabaseConfigured()) {
            supabaseClient.clearAllVaultRecords(this.session.accessToken).catch((err) => {
                this.lastSyncError = err;
            });
        } else if (this.mode === 'local' && typeof window !== 'undefined' && typeof fetch !== 'undefined') {
            fetch('/api/local-vault', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ all: true }),
            }).catch(() => {
                // Ignore dev network errors
            });
        }
    }
}
