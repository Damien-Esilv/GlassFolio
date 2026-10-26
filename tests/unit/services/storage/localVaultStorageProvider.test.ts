import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InMemoryStorageProvider } from '../../../../src/types/storage';
import {
    CHANNEL_NAME,
    FLUSH_DELAY_MS,
    LocalVaultClient,
    LocalVaultStorageProvider,
    RETRY_BASE_MS,
} from '../../../../src/services/storage/LocalVaultStorageProvider';
import { SnapshotOutcome, VaultBatch } from '../../../../src/services/storage/localVaultClient';

interface FakeClient extends LocalVaultClient {
    commits: Array<{ batch: VaultBatch; keepalive?: boolean }>;
    snapshot: SnapshotOutcome;
    commitResults: boolean[];
}

const makeClient = (records: Record<string, string> | null = {}): FakeClient => {
    const client: FakeClient = {
        commits: [],
        snapshot: records === null ? { status: 'unavailable' } : { status: 'ok', snapshot: { revision: 1, records } },
        commitResults: [],
        fetchSnapshot: async () => client.snapshot,
        commitBatch: async (batch, options) => {
            client.commits.push({ batch, keepalive: options?.keepalive });
            return client.commitResults.length > 0 ? (client.commitResults.shift() as boolean) : true;
        },
    };
    return client;
};

const HEADER = '{"version":1,"salt":"abc"}';
const settle = async (): Promise<void> => {
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS + 5);
};

describe('LocalVaultStorageProvider (E33 — TGLA-139)', () => {
    let browser: InMemoryStorageProvider;
    let providers: LocalVaultStorageProvider[];

    const create = (client: FakeClient): LocalVaultStorageProvider => {
        const provider = new LocalVaultStorageProvider(browser, client);
        providers.push(provider);
        return provider;
    };

    beforeEach(() => {
        vi.useFakeTimers();
        browser = new InMemoryStorageProvider();
        providers = [];
    });

    afterEach(() => {
        providers.forEach((provider) => provider.dispose());
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    describe('before and without a server', () => {
        it('delegates everything to the browser provider until connected', () => {
            const provider = create(makeClient());
            provider.setItem('glassfolio_user', 'a');
            expect(browser.getItem('glassfolio_user')).toBe('a');
            expect(provider.getItem('glassfolio_user')).toBe('a');
            expect(provider.keys()).toEqual(['glassfolio_user']);
            expect(provider.getStatus().mode).toBe('uninitialized');
        });

        it('stays in browser mode when the server has no vault API', async () => {
            const provider = create(makeClient(null));
            await expect(provider.connect()).resolves.toEqual({ mode: 'browser' });
            provider.setItem('glassfolio_user', 'a');
            expect(browser.getItem('glassfolio_user')).toBe('a');
            expect(provider.getStatus()).toMatchObject({ mode: 'browser', lastError: null });
        });

        it('reports a server error without loading anything', async () => {
            const client = makeClient();
            client.snapshot = { status: 'error', message: 'HTTP 500' };
            const provider = create(client);
            await expect(provider.connect()).resolves.toEqual({ mode: 'error', message: 'HTTP 500' });
            expect(provider.getStatus()).toMatchObject({ mode: 'uninitialized', lastError: 'HTTP 500' });
        });
    });

    describe('server mode', () => {
        it('serves server-persisted keys from memory and keeps preferences in the browser', async () => {
            const client = makeClient({ glassfolio_user: 'cipher', gf_vault_header: HEADER, gf_public_theme: 'ignored' });
            const provider = create(client);
            await provider.connect();

            expect(provider.getItem('glassfolio_user')).toBe('cipher');
            expect(provider.getItem('gf_public_theme')).toBeNull(); // not a server-persisted key
            provider.setItem('gf_public_theme', 'night');
            provider.setItem('gf_consent_v1', 'yes');
            expect(browser.getItem('gf_public_theme')).toBe('night');
            expect(browser.getItem('glassfolio_user')).toBeNull();

            await settle();
            expect(client.commits).toHaveLength(0); // preferences never reach the server
        });

        it('lists memory keys plus browser-only keys', async () => {
            const provider = create(makeClient({ glassfolio_user: 'c', gf_vault_header: HEADER }));
            await provider.connect();
            provider.setItem('gf_sidebar_collapsed', '1');
            expect(provider.keys().sort()).toEqual(['gf_sidebar_collapsed', 'gf_vault_header', 'glassfolio_user']);
        });

        it('coalesces writes into a single batch', async () => {
            const client = makeClient();
            const provider = create(client);
            await provider.connect();

            provider.setItem('glassfolio_a', '1');
            provider.setItem('glassfolio_a', '2');
            provider.setItem('glassfolio_b', 'x');
            provider.removeItem('glassfolio_b');
            provider.setItem('glassfolio_c', 'z');
            expect(provider.getStatus().pending).toBe(3);

            await settle();
            expect(client.commits).toHaveLength(1);
            expect(client.commits[0].batch).toEqual({ set: { glassfolio_a: '2', glassfolio_c: 'z' }, remove: ['glassfolio_b'] });
            expect(provider.getStatus()).toMatchObject({ pending: 0, lastError: null });
            expect(provider.getStatus().lastSavedAt).not.toBeNull();
        });

        it('sends clear() as a clear batch and empties memory', async () => {
            const client = makeClient({ glassfolio_a: '1' });
            const provider = create(client);
            await provider.connect();
            provider.clear();
            expect(provider.getItem('glassfolio_a')).toBeNull();
            await settle();
            expect(client.commits[0].batch).toEqual({ clear: true });
        });

        it('retries with backoff after a failed save and keeps the changes', async () => {
            const client = makeClient();
            client.commitResults = [false, false, true];
            const provider = create(client);
            await provider.connect();

            provider.setItem('glassfolio_a', '1');
            await settle();
            expect(provider.getStatus()).toMatchObject({ pending: 1, lastError: expect.any(String) });

            provider.setItem('glassfolio_b', '2'); // newer change while the retry is pending
            await vi.advanceTimersByTimeAsync(RETRY_BASE_MS + 5);
            expect(client.commits).toHaveLength(2);
            expect(provider.getStatus().lastError).not.toBeNull();

            await vi.advanceTimersByTimeAsync(RETRY_BASE_MS * 2 + 5);
            expect(client.commits).toHaveLength(3);
            expect(client.commits[2].batch.set).toEqual({ glassfolio_a: '1', glassfolio_b: '2' });
            expect(provider.getStatus()).toMatchObject({ pending: 0, lastError: null });
        });

        it('does not let a restored (older) value override a newer one', async () => {
            const client = makeClient();
            client.commitResults = [false, true];
            const provider = create(client);
            await provider.connect();

            provider.setItem('glassfolio_a', 'old');
            await settle();
            provider.setItem('glassfolio_a', 'new');
            await vi.advanceTimersByTimeAsync(RETRY_BASE_MS + 5);
            expect(client.commits[1].batch.set).toEqual({ glassfolio_a: 'new' });
        });

        it('flush() resolves true once confirmed and false when the server is unreachable', async () => {
            const client = makeClient();
            const provider = create(client);
            await provider.connect();

            provider.setItem('glassfolio_a', '1');
            await expect(provider.flush()).resolves.toBe(true);
            expect(client.commits).toHaveLength(1);

            client.commitResults = [false];
            provider.setItem('glassfolio_a', '2');
            await expect(provider.flush()).resolves.toBe(false);
            await expect(provider.flush()).resolves.toBe(true); // the retried write goes through
            expect(provider.getStatus().pending).toBe(0);
        });

        it('flushes with keepalive when the page is hidden and restores on failure', async () => {
            const client = makeClient();
            const provider = create(client);
            await provider.connect();

            provider.setItem('glassfolio_a', '1');
            window.dispatchEvent(new Event('pagehide'));
            await vi.advanceTimersByTimeAsync(1);
            expect(client.commits).toEqual([{ batch: { set: { glassfolio_a: '1' } }, keepalive: true }]);

            client.commitResults = [false];
            provider.setItem('glassfolio_b', '2');
            window.dispatchEvent(new Event('pagehide'));
            await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS + 5);
            expect(client.commits[client.commits.length - 1].batch.set).toEqual({ glassfolio_b: '2' }); // sent again, normally
        });

        it('notifies subscribers when the status changes', async () => {
            const provider = create(makeClient());
            const listener = vi.fn();
            const unsubscribe = provider.subscribe(listener);
            await provider.connect();
            expect(listener).toHaveBeenCalled();
            listener.mockClear();
            unsubscribe();
            provider.setItem('glassfolio_a', '1');
            await settle();
            expect(listener).not.toHaveBeenCalled();
        });
    });

    describe('migration of a vault stored in this browser', () => {
        it('uploads the browser vault to an empty server, then removes the browser copy', async () => {
            browser.setItem('gf_vault_header', HEADER);
            browser.setItem('glassfolio_user', 'cipher');
            browser.setItem('gf_public_theme', 'night');
            const client = makeClient({});
            const provider = create(client);

            await provider.connect();
            expect(client.commits[0].batch.set).toEqual({ gf_vault_header: HEADER, glassfolio_user: 'cipher' });
            expect(browser.getItem('glassfolio_user')).toBeNull();
            expect(browser.getItem('gf_vault_header')).toBeNull();
            expect(browser.getItem('gf_public_theme')).toBe('night'); // preferences stay
            expect(provider.getItem('glassfolio_user')).toBe('cipher');
        });

        it('merges when both sides hold the same vault; the server copy wins', async () => {
            browser.setItem('gf_vault_header', HEADER);
            browser.setItem('glassfolio_user', 'browser-version');
            browser.setItem('glassfolio_goals', 'only-in-browser');
            const client = makeClient({ gf_vault_header: HEADER, glassfolio_user: 'server-version' });
            const provider = create(client);

            await provider.connect();
            expect(provider.getItem('glassfolio_user')).toBe('server-version');
            expect(provider.getItem('glassfolio_goals')).toBe('only-in-browser');
            expect(client.commits[0].batch.set).toEqual({ glassfolio_goals: 'only-in-browser' });
            expect(browser.keys().filter((key) => key.startsWith('glassfolio_'))).toEqual([]);
        });

        it('never touches or merges a different vault, and flags it', async () => {
            browser.setItem('gf_vault_header', '{"version":1,"salt":"OTHER"}');
            browser.setItem('glassfolio_user', 'old-browser-user');
            const client = makeClient({ gf_vault_header: HEADER, glassfolio_user: 'server-user' });
            const provider = create(client);
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

            await provider.connect();
            expect(provider.getItem('glassfolio_user')).toBe('server-user');
            expect(browser.getItem('glassfolio_user')).toBe('old-browser-user');
            expect(client.commits).toHaveLength(0);
            expect(provider.getStatus().legacyBrowserVaultIgnored).toBe(true);
            // the stale browser copy is invisible once the server is the source of truth
            expect(provider.keys().filter((key) => key === 'glassfolio_user')).toHaveLength(1);
            warn.mockRestore();
        });

        it('keeps the browser copy when the upload is not confirmed', async () => {
            browser.setItem('gf_vault_header', HEADER);
            browser.setItem('glassfolio_user', 'cipher');
            const client = makeClient({});
            client.commitResults = [false];
            const provider = create(client);

            await provider.connect();
            expect(browser.getItem('glassfolio_user')).toBe('cipher');
            expect(provider.getStatus().lastError).not.toBeNull();
        });
    });

    describe('tabs of the same browser', () => {
        class FakeChannel {
            static bus = new Set<FakeChannel>();
            onmessage: ((event: MessageEvent) => void) | null = null;
            constructor(public name: string) {
                FakeChannel.bus.add(this);
            }
            postMessage(data: unknown): void {
                FakeChannel.bus.forEach((other) => {
                    if (other !== this && other.name === this.name) other.onmessage?.({ data } as MessageEvent);
                });
            }
            close(): void {
                FakeChannel.bus.delete(this);
            }
        }

        it('mirrors writes, removals and clears made in another tab', async () => {
            FakeChannel.bus.clear();
            vi.stubGlobal('BroadcastChannel', FakeChannel);
            const tabA = create(makeClient({ glassfolio_a: '1' }));
            const tabB = create(makeClient({ glassfolio_a: '1' }));
            await tabA.connect();
            await tabB.connect();
            expect([...FakeChannel.bus].every((channel) => channel.name === CHANNEL_NAME)).toBe(true);

            tabA.setItem('glassfolio_b', '2');
            expect(tabB.getItem('glassfolio_b')).toBe('2');
            tabA.removeItem('glassfolio_a');
            expect(tabB.getItem('glassfolio_a')).toBeNull();
            tabA.clear();
            expect(tabB.getItem('glassfolio_b')).toBeNull();
        });
    });
});
