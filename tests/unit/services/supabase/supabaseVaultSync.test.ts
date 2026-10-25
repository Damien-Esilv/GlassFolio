import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { supabaseClient } from '../../../../src/services/supabase/supabaseClient';
import { SyncedBackingStorageProvider } from '../../../../src/services/storage/SyncedBackingStorageProvider';
import { LocalStorageProvider } from '../../../../src/types/storage';
import { VAULT_HEADER_KEY } from '../../../../src/services/storage/storageKeys';
import { appStorage } from '../../../../src/services/storage/appStorage';

describe('Supabase Client & Synced Storage Provider (TGLA-060 & TGLA-061)', () => {
    const mockAccessToken = 'mock-sb-access-token-12345';

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.stubEnv('VITE_SUPABASE_URL', 'https://mock-test.supabase.co');
        vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'mock-anon-key-12345');
        process.env.VITE_SUPABASE_URL = 'https://mock-test.supabase.co';
        process.env.VITE_SUPABASE_ANON_KEY = 'mock-anon-key-12345';
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
        delete process.env.VITE_SUPABASE_URL;
        delete process.env.VITE_SUPABASE_ANON_KEY;
    });

    describe('supabaseClient PostgREST Vault API', () => {
        it('fetches vault header for authenticated user', async () => {
            const mockHeaderJson = {
                version: 1,
                kdf: { salt: 'abc', iterations: 600000 },
                wrappedKeys: { password: { alg: 'AES-KW', wrapped: 'ciphertext-header' } },
            };

            const mockFetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => [{ user_id: 'usr-123', header_json: mockHeaderJson, totp_enabled: false }],
            });
            vi.stubGlobal('fetch', mockFetch);

            const result = await supabaseClient.getVaultHeader(mockAccessToken);
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/rest/v1/vault_headers'),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: `Bearer ${mockAccessToken}`,
                    }),
                })
            );
            expect(result).not.toBeNull();
            expect(result?.header_json).toEqual(mockHeaderJson);
        });

        it('upserts vault records with merge-duplicates header', async () => {
            const mockFetch = vi.fn().mockResolvedValue({ ok: true });
            vi.stubGlobal('fetch', mockFetch);

            await supabaseClient.upsertVaultRecord(mockAccessToken, 'glassfolio_transactions', '{"enc":"data"}');
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/rest/v1/vault_records'),
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        Prefer: 'resolution=merge-duplicates',
                        Authorization: `Bearer ${mockAccessToken}`,
                    }),
                    body: JSON.stringify({
                        record_key: 'glassfolio_transactions',
                        ciphertext: '{"enc":"data"}',
                    }),
                })
            );
        });

        it('deletes specific vault record for user', async () => {
            const mockFetch = vi.fn().mockResolvedValue({ ok: true });
            vi.stubGlobal('fetch', mockFetch);

            await supabaseClient.deleteVaultRecord(mockAccessToken, 'glassfolio_transactions');
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/rest/v1/vault_records?record_key=eq.glassfolio_transactions'),
                expect.objectContaining({
                    method: 'DELETE',
                    headers: expect.objectContaining({
                        Authorization: `Bearer ${mockAccessToken}`,
                    }),
                })
            );
        });
    });

    describe('supabaseClient OAuth PKCE', () => {
        it('prepares PKCE URL with code challenge and stores verifier', async () => {
            const url = await supabaseClient.prepareOAuthPkceUrl('google', 'http://localhost:3000');
            expect(url).toContain('/auth/v1/authorize');
            expect(url).toContain('provider=google');
            expect(url).toContain('redirect_to=http%3A%2F%2Flocalhost%3A3000');
            expect(url).toContain('code_challenge=');
            expect(url).toContain('code_challenge_method=S256');

            const verifier = appStorage.getItem('gf_oauth_pkce_verifier');
            expect(verifier).toBeTruthy();
            expect(verifier?.length).toBe(48);
        });

        it('exchanges PKCE code and consumes stored verifier', async () => {
            appStorage.setItem('gf_oauth_pkce_verifier', 'my-test-verifier-123456789012345678901234567890');
            const mockSession = {
                access_token: 'returned-access-tok',
                refresh_token: 'returned-refresh-tok',
                expires_in: 3600,
                user: { id: 'usr-google', email: 'test@gmail.com' },
            };
            const mockFetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => mockSession,
            });
            vi.stubGlobal('fetch', mockFetch);

            const session = await supabaseClient.exchangePkceCode('auth-code-xyz');
            expect(session.accessToken).toBe('returned-access-tok');
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/auth/v1/token?grant_type=pkce'),
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({
                        auth_code: 'auth-code-xyz',
                        code_verifier: 'my-test-verifier-123456789012345678901234567890',
                    }),
                })
            );
            expect(appStorage.getItem('gf_oauth_pkce_verifier')).toBeNull();
        });
    });

    describe('SyncedBackingStorageProvider Dual-Mode Replication', () => {
        it('hydrates local storage from /api/local-vault in local mode (Docker volume)', async () => {
            const mockLocalVaultData = {
                records: {
                    [VAULT_HEADER_KEY]: '{"version":1,"kdf":{"salt":"test"}}',
                    'glassfolio_portfolios': '{"encrypted":"portfolio-data"}',
                },
            };

            const mockFetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => mockLocalVaultData,
            });
            vi.stubGlobal('fetch', mockFetch);

            const localStore = new LocalStorageProvider();
            const syncedProvider = new SyncedBackingStorageProvider(localStore, 'local');

            await syncedProvider.pullFromRemote();

            expect(mockFetch).toHaveBeenCalledWith('/api/local-vault', expect.anything());
            expect(syncedProvider.getItem(VAULT_HEADER_KEY)).toBe('{"version":1,"kdf":{"salt":"test"}}');
            expect(syncedProvider.getItem('glassfolio_portfolios')).toBe('{"encrypted":"portfolio-data"}');
        });

        it('replicates setItem to /api/local-vault in local mode for sensitive keys only', async () => {
            const mockFetch = vi.fn().mockResolvedValue({ ok: true });
            vi.stubGlobal('fetch', mockFetch);

            const localStore = new LocalStorageProvider();
            const syncedProvider = new SyncedBackingStorageProvider(localStore, 'local');

            // 1. Sensitive key triggers replication
            syncedProvider.setItem('glassfolio_transactions', '{"ciphertext":"xyz"}');
            expect(mockFetch).toHaveBeenCalledWith(
                '/api/local-vault',
                expect.objectContaining({
                    method: 'PUT',
                    body: JSON.stringify({ key: 'glassfolio_transactions', value: '{"ciphertext":"xyz"}' }),
                })
            );

            mockFetch.mockClear();

            // 2. Non-sensitive key (e.g. public theme) does NOT trigger /api/local-vault
            syncedProvider.setItem('gf_public_theme', 'night');
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('replicates delete and clear to /api/local-vault in local mode', async () => {
            const mockFetch = vi.fn().mockResolvedValue({ ok: true });
            vi.stubGlobal('fetch', mockFetch);

            const localStore = new LocalStorageProvider();
            const syncedProvider = new SyncedBackingStorageProvider(localStore, 'local');

            syncedProvider.removeItem('glassfolio_transactions');
            expect(mockFetch).toHaveBeenCalledWith(
                '/api/local-vault',
                expect.objectContaining({
                    method: 'DELETE',
                    body: JSON.stringify({ key: 'glassfolio_transactions' }),
                })
            );

            mockFetch.mockClear();

            syncedProvider.clear();
            expect(mockFetch).toHaveBeenCalledWith(
                '/api/local-vault',
                expect.objectContaining({
                    method: 'DELETE',
                    body: JSON.stringify({ all: true }),
                })
            );
        });
    });
});
