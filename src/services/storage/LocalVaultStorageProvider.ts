/**
 * LocalVaultStorageProvider — server-backed storage for local mode (Epic E33 — TGLA-139).
 *
 * In local deployment mode the server volume (Docker `/data`, or `./glassfolio-data` in dev) is the
 * single source of truth for the vault and every user-data key, so clearing the browser cache or
 * switching browser never loses data. The synchronous IStorageProvider contract is preserved:
 *
 *   - `connect()` loads the whole server snapshot into memory BEFORE the app renders;
 *   - reads are served from memory, writes update memory and join a coalesced write-behind queue
 *     (one POST per batch, retried with exponential backoff, flushed on page hide);
 *   - per-browser preferences (consent, theme, language, UI state, public caches) stay in the browser.
 *
 * When no vault API exists (static hosting, tests) the provider stays in `browser` mode and simply
 * delegates to the browser provider, i.e. the previous behaviour.
 */

import { ExternalChangeListener, IStorageProvider } from '../../types/storage';
import {
    byteLength,
    commitBatch,
    fetchSnapshot,
    KEEPALIVE_CHUNK_BYTES,
    LocalVaultProfileSummary,
    MAX_REQUEST_BYTES,
    MAX_SERVER_VALUE_BYTES,
    mutateVaultProfile,
    SnapshotOutcome,
    splitBatchForKeepalive,
    VaultBatch,
    VaultProfileAction,
    VaultSnapshot,
} from './localVaultClient';
import { isServerPersistedKey, VAULT_HEADER_KEY } from './storageKeys';

export type LocalPersistenceMode = 'uninitialized' | 'browser' | 'server';

export interface LocalPersistenceStatus {
    mode: LocalPersistenceMode;
    /** Number of queued changes not yet confirmed by the server. */
    pending: number;
    /** ISO 8601 time of the last write confirmed by the server. */
    lastSavedAt: string | null;
    /** Last write/connect failure; cleared by the next successful write. */
    lastError: string | null;
    /** A vault found in this browser could not be merged because it differs from the server's. */
    legacyBrowserVaultIgnored: boolean;
    /** Active vault profile ID on the local server ('default', 'demo', or custom ID). */
    activeVaultId: string;
    /** Personal vault profiles registered on the local server. */
    profiles: LocalVaultProfileSummary[];
}

export type ConnectResult =
    | { mode: 'server' | 'browser' }
    | { mode: 'error'; message: string };

export interface LocalVaultClient {
    fetchSnapshot(): Promise<SnapshotOutcome>;
    commitBatch(batch: VaultBatch, options?: { keepalive?: boolean }): Promise<boolean>;
    mutateProfile?(action: VaultProfileAction): Promise<SnapshotOutcome>;
}

type ChannelMessage =
    | { type: 'update'; set: Record<string, string>; remove: string[] }
    | { type: 'clear' }
    | { type: 'profile_switch'; snapshot: VaultSnapshot };

export const FLUSH_DELAY_MS = 100;
export const RETRY_BASE_MS = 1000;
export const RETRY_MAX_MS = 30_000;
export const CHANNEL_NAME = 'glassfolio_local_vault';

const defaultClient: LocalVaultClient = {
    fetchSnapshot: () => fetchSnapshot(),
    commitBatch: (batch, options) => commitBatch(batch, options),
    mutateProfile: (action) => mutateVaultProfile(action),
};

export class LocalVaultStorageProvider implements IStorageProvider {
    private mode: LocalPersistenceMode = 'uninitialized';
    private readonly memory = new Map<string, string>();
    /** key -> new value, or null for a removal. Applied by the server in order clear, remove, set. */
    private pendingWrites = new Map<string, string | null>();
    private pendingClear = false;
    private flushTimer: ReturnType<typeof setTimeout> | null = null;
    private retryTimer: ReturnType<typeof setTimeout> | null = null;
    private inFlight: Promise<boolean> | null = null;
    private failures = 0;
    private channel: BroadcastChannel | null = null;
    private readonly listeners = new Set<() => void>();
    private readonly externalListeners = new Set<ExternalChangeListener>();
    private status: LocalPersistenceStatus = {
        mode: 'uninitialized',
        pending: 0,
        lastSavedAt: null,
        lastError: null,
        legacyBrowserVaultIgnored: false,
        activeVaultId: 'default',
        profiles: [],
    };

    constructor(
        private readonly browser: IStorageProvider,
        private readonly client: LocalVaultClient = defaultClient,
    ) {}

    // ── Status (for UI and AI tools) ─────────────────────────────────────────────

    getStatus(): LocalPersistenceStatus {
        return this.status;
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private patchStatus(patch: Partial<LocalPersistenceStatus>): void {
        this.status = { ...this.status, ...patch };
        this.listeners.forEach(listener => listener());
    }

    private refreshPending(): void {
        const pending = this.pendingWrites.size + (this.pendingClear ? 1 : 0);
        if (pending !== this.status.pending) this.patchStatus({ pending });
    }

    private syncActiveProfileInitialized(): void {
        const activeId = this.status.activeVaultId;
        if (!activeId || activeId === 'demo' || this.status.profiles.length === 0) return;
        const isInit = this.memory.has(VAULT_HEADER_KEY);
        const current = this.status.profiles.find(p => p.id === activeId);
        if (current && current.initialized !== isInit) {
            this.patchStatus({
                profiles: this.status.profiles.map(p => p.id === activeId ? { ...p, initialized: isInit } : p),
            });
        }
    }

    private applySnapshot(snapshot: VaultSnapshot, notifyExternal = false): void {
        this.memory.clear();
        for (const [key, value] of Object.entries(snapshot.records)) {
            if (isServerPersistedKey(key)) this.memory.set(key, value);
        }
        const activeVaultId = snapshot.activeVaultId ?? this.status.activeVaultId ?? 'default';
        const profiles = snapshot.profiles ?? this.status.profiles;
        this.patchStatus({
            mode: 'server',
            lastError: null,
            activeVaultId,
            profiles,
        });
        this.syncActiveProfileInitialized();
        if (notifyExternal) {
            this.externalListeners.forEach(listener => listener(null));
        }
    }

    // ── Connection & Profile Management ──────────────────────────────────────────

    async connect(): Promise<ConnectResult> {
        const outcome = await this.client.fetchSnapshot();

        if (outcome.status === 'unavailable') {
            this.mode = 'browser';
            this.patchStatus({ mode: 'browser', lastError: null });
            return { mode: 'browser' };
        }
        if (outcome.status === 'error') {
            this.patchStatus({ lastError: outcome.message });
            return { mode: 'error', message: outcome.message };
        }

        this.mode = 'server';
        this.applySnapshot(outcome.snapshot, false);

        this.openChannel();
        this.registerPageLifecycle();
        await this.migrateBrowserCopy();
        this.syncActiveProfileInitialized();
        return { mode: 'server' };
    }

    /** Switches the active vault profile ('demo', 'personal', or a profile ID). */
    async selectProfile(vaultId: string): Promise<boolean> {
        if (this.mode !== 'server' || !this.client.mutateProfile) return false;
        if (vaultId !== 'personal' && this.status.activeVaultId === vaultId) return true;
        await this.flush();
        const outcome = await this.client.mutateProfile({ action: 'select', vaultId });
        if (outcome.status !== 'ok') {
            if (outcome.status === 'error') this.patchStatus({ lastError: outcome.message });
            return false;
        }
        this.applySnapshot(outcome.snapshot, true);
        this.broadcast({ type: 'profile_switch', snapshot: outcome.snapshot });
        return true;
    }

    /** Creates a new personal vault profile (or reuses an uninitialized default profile) and makes it active. */
    async createProfile(name: string): Promise<LocalVaultProfileSummary | null> {
        if (this.mode !== 'server' || !this.client.mutateProfile) return null;
        await this.flush();
        const outcome = await this.client.mutateProfile({ action: 'create', name });
        if (outcome.status !== 'ok') {
            if (outcome.status === 'error') this.patchStatus({ lastError: outcome.message });
            return null;
        }
        this.applySnapshot(outcome.snapshot, true);
        this.broadcast({ type: 'profile_switch', snapshot: outcome.snapshot });
        return this.status.profiles.find(p => p.id === this.status.activeVaultId) ?? null;
    }

    /** Renames the currently active personal vault profile on the local server. */
    async renameActiveProfile(name: string): Promise<boolean> {
        if (this.mode !== 'server' || !this.client.mutateProfile) return false;
        const outcome = await this.client.mutateProfile({ action: 'rename', name });
        if (outcome.status !== 'ok') return false;
        if (outcome.snapshot.profiles) {
            this.patchStatus({
                profiles: outcome.snapshot.profiles,
                ...(outcome.snapshot.activeVaultId ? { activeVaultId: outcome.snapshot.activeVaultId } : {}),
            });
            this.broadcast({ type: 'profile_switch', snapshot: outcome.snapshot });
        }
        return true;
    }

    /** Deletes the active vault profile and its store file on disk, switching to another profile. */
    async deleteActiveProfile(): Promise<boolean> {
        if (this.mode !== 'server' || !this.client.mutateProfile) return false;
        if (this.flushTimer !== null) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
        if (this.retryTimer !== null) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
        this.pendingWrites.clear();
        this.pendingClear = false;
        this.refreshPending();
        const outcome = await this.client.mutateProfile({ action: 'delete' });
        if (outcome.status !== 'ok') {
            if (outcome.status === 'error') this.patchStatus({ lastError: outcome.message });
            return false;
        }
        this.applySnapshot(outcome.snapshot, true);
        this.broadcast({ type: 'profile_switch', snapshot: outcome.snapshot });
        return true;
    }

    /**
     * Moves a vault that used to live in this browser to the server. The browser copy is only
     * deleted once the server confirmed the write; a different vault is never touched or merged.
     */
    private async migrateBrowserCopy(): Promise<void> {
        const browserKeys = this.browser.keys().filter(isServerPersistedKey);
        if (browserKeys.length === 0) return;

        const serverHeader = this.memory.get(VAULT_HEADER_KEY) ?? null;
        const browserHeader = this.browser.getItem(VAULT_HEADER_KEY);
        const mergeable = serverHeader === null || (browserHeader !== null && browserHeader === serverHeader);

        if (!mergeable) {
            console.warn('[storage] A different vault exists in this browser; the server vault is used and the browser copy is left untouched.');
            this.patchStatus({ legacyBrowserVaultIgnored: true });
            return;
        }

        for (const key of browserKeys) {
            if (this.memory.has(key)) continue; // the server copy wins
            const value = this.browser.getItem(key);
            if (value === null) continue;
            this.memory.set(key, value);
            this.pendingWrites.set(key, value);
        }
        this.refreshPending();

        if (await this.flush()) browserKeys.forEach(key => this.browser.removeItem(key));
    }

    // ── IStorageProvider ─────────────────────────────────────────────────────────

    private routesToServer(key: string): boolean {
        return this.mode === 'server' && isServerPersistedKey(key);
    }

    getItem(key: string): string | null {
        if (!this.routesToServer(key)) return this.browser.getItem(key);
        return this.memory.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        if (!this.routesToServer(key)) {
            this.browser.setItem(key, value);
            return;
        }
        // The server would refuse it on every retry and hold back every other change queued with it
        if (byteLength(value) > MAX_SERVER_VALUE_BYTES) {
            throw new Error(`"${key}" is too large for the local data server.`);
        }
        this.memory.set(key, value);
        if (key === VAULT_HEADER_KEY) this.syncActiveProfileInitialized();
        this.enqueue(key, value);
        this.broadcast({ type: 'update', set: { [key]: value }, remove: [] });
    }

    removeItem(key: string): void {
        if (!this.routesToServer(key)) {
            this.browser.removeItem(key);
            return;
        }
        this.memory.delete(key);
        if (key === VAULT_HEADER_KEY) this.syncActiveProfileInitialized();
        this.enqueue(key, null);
        this.broadcast({ type: 'update', set: {}, remove: [key] });
    }

    clear(): void {
        if (this.mode === 'server') {
            this.memory.clear();
            this.syncActiveProfileInitialized();
            this.pendingWrites.clear();
            this.pendingClear = true;
            this.refreshPending();
            this.scheduleFlush();
            this.broadcast({ type: 'clear' });
        }
        this.browser.clear();
    }

    keys(): string[] {
        if (this.mode !== 'server') return this.browser.keys();
        const browserOnly = this.browser.keys().filter(key => !isServerPersistedKey(key));
        return [...this.memory.keys(), ...browserOnly];
    }

    // ── Write-behind queue ───────────────────────────────────────────────────────

    private enqueue(key: string, value: string | null): void {
        this.pendingWrites.set(key, value);
        this.refreshPending();
        this.scheduleFlush();
    }

    private scheduleFlush(): void {
        if (this.flushTimer !== null || this.retryTimer !== null) return;
        this.flushTimer = setTimeout(() => {
            this.flushTimer = null;
            void this.flush();
        }, FLUSH_DELAY_MS);
    }

    private takeBatch(): VaultBatch | null {
        if (this.pendingWrites.size === 0 && !this.pendingClear) return null;
        const batch: VaultBatch = {};
        if (this.pendingClear) batch.clear = true;
        for (const [key, value] of this.pendingWrites) {
            if (value === null) (batch.remove ??= []).push(key);
            else (batch.set ??= {})[key] = value;
        }
        this.pendingWrites = new Map();
        this.pendingClear = false;
        this.refreshPending();
        return batch;
    }

    /** Puts an unsent batch back without overriding changes made since it was taken. */
    private restoreBatch(batch: VaultBatch): void {
        if (batch.clear) this.pendingClear = true;
        for (const key of batch.remove ?? []) {
            if (!this.pendingWrites.has(key)) this.pendingWrites.set(key, null);
        }
        for (const [key, value] of Object.entries(batch.set ?? {})) {
            if (!this.pendingWrites.has(key)) this.pendingWrites.set(key, value);
        }
        this.refreshPending();
    }

    private sendOnce(): Promise<boolean> {
        if (this.inFlight) return this.inFlight;
        const batch = this.takeBatch();
        if (batch === null) return Promise.resolve(true);

        this.inFlight = (async () => {
            // Several requests when large: one oversized body would be refused as a whole
            const parts = splitBatchForKeepalive(batch, MAX_REQUEST_BYTES);
            for (let index = 0; index < parts.length; index++) {
                if (await this.client.commitBatch(parts[index])) continue;
                parts.slice(index).forEach(part => this.restoreBatch(part));
                this.failures += 1;
                this.patchStatus({ lastError: 'Could not save to the local server' });
                this.scheduleRetry();
                return false;
            }
            this.failures = 0;
            this.patchStatus({ lastSavedAt: new Date().toISOString(), lastError: null });
            return true;
        })().finally(() => {
            this.inFlight = null;
        });
        return this.inFlight;
    }

    private scheduleRetry(): void {
        if (this.retryTimer !== null) return;
        const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, this.failures - 1));
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            void this.flush();
        }, delay);
    }

    /**
     * Sends everything queued and resolves true once the server confirmed it (or immediately
     * when there is nothing to send). Resolves false if the server could not be reached.
     */
    async flush(): Promise<boolean> {
        if (this.flushTimer !== null) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
        if (this.retryTimer !== null) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
        for (;;) {
            if (!(await this.sendOnce())) return false;
            if (this.pendingWrites.size === 0 && !this.pendingClear && this.inFlight === null) return true;
        }
    }

    // ── Page lifecycle & tabs ────────────────────────────────────────────────────

    private readonly onPageHide = (): void => {
        this.flushOnHide();
    };

    private readonly onVisibilityChange = (): void => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') this.flushOnHide();
    };

    private registerPageLifecycle(): void {
        if (typeof window === 'undefined') return;
        window.addEventListener('pagehide', this.onPageHide);
        document.addEventListener('visibilitychange', this.onVisibilityChange);
    }

    /** Sends queued changes with `keepalive` so they survive the page going away. */
    private flushOnHide(): void {
        const batch = this.takeBatch();
        if (batch === null) return;
        for (const part of splitBatchForKeepalive(batch)) {
            // A single entry above the keepalive limit can only go as a regular request (best effort)
            const fitsKeepalive = byteLength(JSON.stringify(part)) <= KEEPALIVE_CHUNK_BYTES;
            void this.client.commitBatch(part, { keepalive: fitsKeepalive }).then(ok => {
                if (ok) return;
                this.restoreBatch(part);
                this.scheduleFlush();
            });
        }
    }

    private openChannel(): void {
        if (this.channel !== null || typeof BroadcastChannel === 'undefined') return;
        this.channel = new BroadcastChannel(CHANNEL_NAME);
        this.channel.onmessage = (event: MessageEvent<ChannelMessage>) => this.applyRemoteMessage(event.data);
    }

    private broadcast(message: ChannelMessage): void {
        this.channel?.postMessage(message);
    }

    /** Mirrors a change made in another tab of this browser (already persisted by that tab). */
    private applyRemoteMessage(message: ChannelMessage): void {
        if (message.type === 'profile_switch') {
            this.applySnapshot(message.snapshot, true);
            return;
        }
        if (message.type === 'clear') {
            this.memory.clear();
            this.syncActiveProfileInitialized();
            this.externalListeners.forEach(listener => listener(null));
            return;
        }
        for (const key of message.remove) this.memory.delete(key);
        for (const [key, value] of Object.entries(message.set)) {
            if (isServerPersistedKey(key)) this.memory.set(key, value);
        }
        this.syncActiveProfileInitialized();
        const changed = [...message.remove, ...Object.keys(message.set)];
        // Layers above (the decrypted cache) must re-read, or this tab would write its stale copy back.
        if (changed.length > 0) this.externalListeners.forEach(listener => listener(changed));
    }

    onExternalChange(listener: ExternalChangeListener): () => void {
        this.externalListeners.add(listener);
        // Browser mode (no server) keeps the data in localStorage, shared by the tabs.
        const unsubscribeBrowser = this.browser.onExternalChange?.(listener);
        return () => {
            this.externalListeners.delete(listener);
            unsubscribeBrowser?.();
        };
    }

    /** Stops timers and listeners (tests, hot reload). Does not flush. */
    dispose(): void {
        if (this.flushTimer !== null) clearTimeout(this.flushTimer);
        if (this.retryTimer !== null) clearTimeout(this.retryTimer);
        this.flushTimer = null;
        this.retryTimer = null;
        this.channel?.close();
        this.channel = null;
        if (typeof window !== 'undefined') {
            window.removeEventListener('pagehide', this.onPageHide);
            document.removeEventListener('visibilitychange', this.onVisibilityChange);
        }
    }
}
