/**
 * Supabase E2EE Client (TGLA-060).
 *
 * Lightweight, zero-dependency client engineered with native `fetch` to keep
 * bundle size strictly below the 2 MB budget while communicating with
 * Supabase GoTrue Auth and PostgREST.
 */

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
        name?: string
    ): Promise<SupabaseAuthSession> {
        const config = getSupabaseConfig();
        if (!config) throw new Error('Supabase is not configured.');

        const endpoint = `${config.url}/auth/v1/signup`;
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: createHeaders(config),
            body: JSON.stringify({
                email,
                password,
                data: { name },
            }),
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.msg || data.error_description || data.message || 'Supabase signup failed.');
        }

        if (!data.access_token) {
            throw new Error('Supabase registration requires email confirmation or did not return an access token.');
        }

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
            user: data.user,
        };
    },

    async signInWithPassword(email: string, password: string): Promise<SupabaseAuthSession> {
        const config = getSupabaseConfig();
        if (!config) throw new Error('Supabase is not configured.');

        const endpoint = `${config.url}/auth/v1/token?grant_type=password`;
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: createHeaders(config),
            body: JSON.stringify({ email, password }),
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

    getOAuthUrl(provider: 'google' | 'apple', redirectTo?: string): string {
        const config = getSupabaseConfig();
        if (!config) throw new Error('Supabase is not configured.');

        const redirect = redirectTo || (typeof window !== 'undefined' ? window.location.origin : '');
        const params = new URLSearchParams({
            provider,
            redirect_to: redirect,
        });

        return `${config.url}/auth/v1/authorize?${params.toString()}`;
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
};
