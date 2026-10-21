/**
 * Supabase E2EE Client (TGLA-060).
 *
 * Lightweight, zero-dependency client engineered with native `fetch` to keep
 * bundle size strictly below the 2 MB budget while communicating with
 * Supabase GoTrue Auth and PostgREST.
 */

import { appStorage } from '../storage/appStorage';

export interface SupabaseConfig {
    url: string;
    anonKey: string;
}

export interface SupabaseAuthSession {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    user: {
        id: string;
        email?: string;
        email_confirmed_at?: string;
        user_metadata?: {
            name?: string;
            avatar_url?: string;
        };
    };
}

export interface SupabaseVaultHeaderRow {
    user_id: string;
    header_json: Record<string, unknown>;
    totp_enabled: boolean;
    created_at: string;
    updated_at: string;
}

export interface SupabaseVaultRecordRow {
    user_id: string;
    record_key: string;
    ciphertext: string;
    created_at: string;
    updated_at: string;
}

const getEnvVar = (key: string): string | undefined => {
    const metaEnv = typeof import.meta !== 'undefined'
        ? (import.meta as { env?: Record<string, string | undefined> }).env
        : undefined;
    const procEnv = typeof process !== 'undefined' ? process.env : undefined;
    return metaEnv?.[key] ?? procEnv?.[key];
};

export const getSupabaseConfig = (): SupabaseConfig | null => {
    const rawUrl = getEnvVar('VITE_SUPABASE_URL')?.trim() ?? '';
    const rawKey = getEnvVar('VITE_SUPABASE_ANON_KEY')?.trim() ?? '';

    if (!rawUrl || !rawKey) return null;
    return {
        url: rawUrl.replace(/\/+$/, '').replace(/\/rest\/v1\/?$/, '').replace(/\/auth\/v1\/?$/, ''),
        anonKey: rawKey,
    };
};

export const isSupabaseConfigured = (): boolean => getSupabaseConfig() !== null;

let capturedOAuthHash: string | null = null;
if (typeof window !== 'undefined' && window.location.hash.includes('access_token=')) {
    capturedOAuthHash = window.location.hash;
}

export const consumeInitialOAuthHash = (): string | null => {
    if (capturedOAuthHash) {
        const hash = capturedOAuthHash;
        capturedOAuthHash = null;
        return hash;
    }
    if (typeof window !== 'undefined' && window.location.hash.includes('access_token=')) {
        return window.location.hash;
    }
    return null;
};

export interface SupabaseUserData {
    id: string;
    email?: string;
    email_confirmed_at?: string | null;
    new_email?: string | null;
    user_metadata?: {
        name?: string;
        full_name?: string;
        avatar_url?: string;
        picture?: string;
    };
    app_metadata?: {
        provider?: string;
        providers?: string[];
    };
}

const createHeaders = (config: SupabaseConfig, accessToken?: string): Record<string, string> => {
    const headers: Record<string, string> = {
        'apikey': config.anonKey,
        'Content-Type': 'application/json',
    };
    if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
    }
    return headers;
};

export const supabaseClient = {
    // ── Auth API (GoTrue v1) ──────────────────────────────────────────────────

    async signUp(
        email: string,
        password: string,
        name?: string,
        options?: { captchaToken?: string }
    ): Promise<SupabaseAuthSession> {
        const config = getSupabaseConfig();
        if (!config) throw new Error('Supabase is not configured.');

        const endpoint = `${config.url}/auth/v1/signup`;
        const body: Record<string, unknown> = {
            email,
            password,
            data: { name },
        };
        if (options?.captchaToken) {
            body.gotrue_meta_security = { captcha_token: options.captchaToken };
        }

        const res = await fetch(endpoint, {
            method: 'POST',
            headers: createHeaders(config),
            body: JSON.stringify(body),
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.msg || data.error_description || data.message || 'Supabase signup failed.');
        }

        // If email confirmation is enabled, access_token might be null
        const accessToken = data.access_token || '';
        const refreshToken = data.refresh_token || '';
        const user = data.user || data;

        return {
            accessToken,
            refreshToken,
            expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
            user,
        };
    },

    async signInWithPassword(
        email: string,
        password: string,
        options?: { captchaToken?: string }
    ): Promise<SupabaseAuthSession> {
        const config = getSupabaseConfig();
        if (!config) throw new Error('Supabase is not configured.');

        const endpoint = `${config.url}/auth/v1/token?grant_type=password`;
        const body: Record<string, unknown> = { email, password };
        if (options?.captchaToken) {
            body.gotrue_meta_security = { captcha_token: options.captchaToken };
        }

        const res = await fetch(endpoint, {
            method: 'POST',
            headers: createHeaders(config),
            body: JSON.stringify(body),
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.msg || data.error_description || data.message || 'Invalid email or password.');
        }

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
            user: data.user,
        };
    },

    getOAuthUrl(provider: 'google' | 'apple', redirectTo?: string, codeChallenge?: string): string {
        const config = getSupabaseConfig();
        if (!config) throw new Error('Supabase is not configured.');

        const redirect = redirectTo || (typeof window !== 'undefined' ? window.location.origin : '');
        const params = new URLSearchParams({
            provider,
            redirect_to: redirect,
        });

        if (codeChallenge) {
            params.set('code_challenge', codeChallenge);
            params.set('code_challenge_method', 'S256');
        }

        return `${config.url}/auth/v1/authorize?${params.toString()}`;
    },

    async prepareOAuthPkceUrl(provider: 'google', redirectTo?: string): Promise<string> {
        const randomBytes = new Uint8Array(32);
        if (typeof window !== 'undefined' && window.crypto) {
            window.crypto.getRandomValues(randomBytes);
        } else if (typeof globalThis !== 'undefined' && globalThis.crypto) {
            globalThis.crypto.getRandomValues(randomBytes);
        }

        // Base64URL encode verifier
        const verifier = Array.from(randomBytes)
            .map(b => b.toString(36))
            .join('')
            .slice(0, 48);

        try {
            appStorage.setItem('gf_oauth_pkce_verifier', verifier);
        } catch {
            // fallback
        }

        // Compute SHA-256 challenge
        const subtleCrypto = (typeof window !== 'undefined' ? window.crypto?.subtle : undefined)
            || (typeof globalThis !== 'undefined' ? globalThis.crypto?.subtle : undefined);

        let challenge = verifier;
        if (subtleCrypto) {
            const encoder = new TextEncoder();
            const digest = await subtleCrypto.digest('SHA-256', encoder.encode(verifier));
            challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');
        }

        return this.getOAuthUrl(provider, redirectTo, challenge);
    },

    async exchangePkceCode(code: string): Promise<SupabaseAuthSession> {
        const config = getSupabaseConfig();
        if (!config) throw new Error('Supabase is not configured.');

        let verifier = '';
        try {
            verifier = appStorage.getItem('gf_oauth_pkce_verifier') || '';
            appStorage.removeItem('gf_oauth_pkce_verifier');
        } catch {
            // fallback
        }

        const endpoint = `${config.url}/auth/v1/token?grant_type=pkce`;
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: createHeaders(config),
            body: JSON.stringify({
                auth_code: code,
                code_verifier: verifier,
            }),
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.msg || data.error_description || data.message || 'Failed to exchange PKCE code.');
        }

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
            user: data.user,
        };
    },

    async verifyEmailOtp(
        email: string,
        token: string,
        type: 'signup' | 'recovery' | 'email_change' = 'signup'
    ): Promise<SupabaseAuthSession> {
        const config = getSupabaseConfig();
        if (!config) throw new Error('Supabase is not configured.');

        const endpoint = `${config.url}/auth/v1/verify`;
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: createHeaders(config),
            body: JSON.stringify({ email, token, type }),
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.msg || data.error_description || data.message || 'Invalid or expired verification code.');
        }

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
            user: data.user,
        };
    },

    async resendVerificationEmail(email: string, captchaToken?: string): Promise<void> {
        const config = getSupabaseConfig();
        if (!config) throw new Error('Supabase is not configured.');

        const endpoint = `${config.url}/auth/v1/resend`;
        const body: Record<string, unknown> = {
            type: 'signup',
            email,
        };
        if (captchaToken) {
            body.gotrue_meta_security = { captcha_token: captchaToken };
        }

        const res = await fetch(endpoint, {
            method: 'POST',
            headers: createHeaders(config),
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.msg || data.error_description || data.message || 'Failed to resend confirmation email.');
        }
    },

    async updateUser(
        accessToken: string,
        attributes: { email?: string; password?: string; data?: Record<string, unknown> }
    ): Promise<SupabaseUserData> {
        const config = getSupabaseConfig();
        if (!config) throw new Error('Supabase is not configured.');

        const endpoint = `${config.url}/auth/v1/user`;
        const res = await fetch(endpoint, {
            method: 'PUT',
            headers: createHeaders(config, accessToken),
            body: JSON.stringify(attributes),
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.msg || data.error_description || data.message || 'Failed to update user profile.');
        }

        return data as SupabaseUserData;
    },

    async resetPasswordForEmail(email: string, redirectTo?: string, captchaToken?: string): Promise<void> {
        const config = getSupabaseConfig();
        if (!config) throw new Error('Supabase is not configured.');

        const endpoint = `${config.url}/auth/v1/recover`;
        const body: Record<string, unknown> = {
            email,
        };
        if (redirectTo) {
            body.redirect_to = redirectTo;
        }
        if (captchaToken) {
            body.gotrue_meta_security = { captcha_token: captchaToken };
        }

        const res = await fetch(endpoint, {
            method: 'POST',
            headers: createHeaders(config),
            body: JSON.stringify(body),
        });

        // Anti-enumeration: treat status ok or error uniformly if needed, but report network failure
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            // Only throw if rate-limited or fatal
            if (res.status === 429) {
                throw new Error(data.msg || 'Too many requests. Please wait.');
            }
        }
    },

    async refreshSession(refreshToken: string): Promise<SupabaseAuthSession> {
        const config = getSupabaseConfig();
        if (!config) throw new Error('Supabase is not configured.');

        const endpoint = `${config.url}/auth/v1/token?grant_type=refresh_token`;
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: createHeaders(config),
            body: JSON.stringify({ refresh_token: refreshToken }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error('Failed to refresh Supabase session.');

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
            user: data.user,
        };
    },

    async getUser(accessToken: string): Promise<SupabaseUserData> {
        const config = getSupabaseConfig();
        if (!config) throw new Error('Supabase is not configured.');

        const endpoint = `${config.url}/auth/v1/user`;
        const res = await fetch(endpoint, {
            method: 'GET',
            headers: createHeaders(config, accessToken),
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.msg || data.error_description || data.message || 'Failed to fetch Supabase user.');
        }

        return data as SupabaseUserData;
    },

    async signOut(accessToken: string): Promise<void> {
        const config = getSupabaseConfig();
        if (!config) return;

        const endpoint = `${config.url}/auth/v1/logout`;
        try {
            await fetch(endpoint, {
                method: 'POST',
                headers: createHeaders(config, accessToken),
            });
        } catch {
            // Best effort sign out
        }
    },

    // ── E2EE Storage API (PostgREST v1) ───────────────────────────────────────

    async getVaultHeader(accessToken: string): Promise<SupabaseVaultHeaderRow | null> {
        const config = getSupabaseConfig();
        if (!config) return null;

        const endpoint = `${config.url}/rest/v1/vault_headers?select=*&limit=1`;
        const res = await fetch(endpoint, {
            method: 'GET',
            headers: createHeaders(config, accessToken),
        });

        if (!res.ok) return null;
        const rows = (await res.json()) as SupabaseVaultHeaderRow[];
        return rows[0] || null;
    },

    async upsertVaultHeader(
        accessToken: string,
        headerJson: Record<string, unknown>,
        totpEnabled = false
    ): Promise<void> {
        const config = getSupabaseConfig();
        if (!config) throw new Error('Supabase is not configured.');

        const endpoint = `${config.url}/rest/v1/vault_headers`;
        const headers = createHeaders(config, accessToken);
        headers['Prefer'] = 'resolution=merge-duplicates';

        const res = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                header_json: headerJson,
                totp_enabled: totpEnabled,
            }),
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Failed to save vault header to Supabase: ${err}`);
        }
    },

    async getVaultRecords(accessToken: string): Promise<SupabaseVaultRecordRow[]> {
        const config = getSupabaseConfig();
        if (!config) return [];

        const endpoint = `${config.url}/rest/v1/vault_records?select=record_key,ciphertext`;
        const res = await fetch(endpoint, {
            method: 'GET',
            headers: createHeaders(config, accessToken),
        });

        if (!res.ok) return [];
        return (await res.json()) as SupabaseVaultRecordRow[];
    },

    async upsertVaultRecord(
        accessToken: string,
        recordKey: string,
        ciphertext: string
    ): Promise<void> {
        const config = getSupabaseConfig();
        if (!config) throw new Error('Supabase is not configured.');

        const endpoint = `${config.url}/rest/v1/vault_records`;
        const headers = createHeaders(config, accessToken);
        headers['Prefer'] = 'resolution=merge-duplicates';

        const res = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                record_key: recordKey,
                ciphertext,
            }),
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Failed to save encrypted record "${recordKey}" to Supabase: ${err}`);
        }
    },

    async deleteVaultRecord(accessToken: string, recordKey: string): Promise<void> {
        const config = getSupabaseConfig();
        if (!config) return;

        const endpoint = `${config.url}/rest/v1/vault_records?record_key=eq.${encodeURIComponent(recordKey)}`;
        await fetch(endpoint, {
            method: 'DELETE',
            headers: createHeaders(config, accessToken),
        });
    },

    async clearAllVaultRecords(accessToken: string): Promise<void> {
        const config = getSupabaseConfig();
        if (!config) return;

        const headers = createHeaders(config, accessToken);
        await Promise.all([
            fetch(`${config.url}/rest/v1/vault_headers`, { method: 'DELETE', headers }),
            fetch(`${config.url}/rest/v1/vault_records`, { method: 'DELETE', headers }),
        ]);
    },

    async deleteOwnAccount(accessToken: string): Promise<void> {
        const config = getSupabaseConfig();
        if (!config) return;

        // 1. Delete vault records & headers
        await this.clearAllVaultRecords(accessToken).catch(() => {});

        // 2. Call Postgres RPC delete_own_account
        const endpoint = `${config.url}/rest/v1/rpc/delete_own_account`;
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: createHeaders(config, accessToken),
            body: JSON.stringify({}),
        });

        if (!res.ok && res.status !== 404) {
            const err = await res.text().catch(() => '');
            console.warn('[Supabase] delete_own_account RPC response:', res.status, err);
        }
    },
};
