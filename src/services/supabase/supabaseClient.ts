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
            glassfolio_signup_state?: string;
            new_email?: string;
            locale?: string;
        };
        app_metadata?: {
            provider?: string;
            /** Stamped server-side once the vault header exists (migration 0003). */
            glassfolio_signup_state?: string;
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

export type SupabaseMfaFactorType = 'totp' | 'webauthn' | 'phone';
export interface SupabaseMfaFactor {
    id: string;
    factor_type: SupabaseMfaFactorType;
    status: 'verified' | 'unverified';
    friendly_name?: string;
}

export interface SupabaseMfaChallenge { id: string; }

/** WebAuthn options as JSON: binary fields are base64url strings (Supabase passkeys, experimental). */
export interface PasskeyCeremonyOptions {
    challenge_id: string;
    options: Record<string, unknown>;
}

export interface SupabasePasskey {
    id: string;
    friendly_name?: string;
    created_at: string;
    last_used_at?: string;
}

export type AuthenticatorAssuranceLevel = 'aal1' | 'aal2';

export interface SessionAssurance {
    aal: AuthenticatorAssuranceLevel;
    /** Authentication methods of the session, most recent first (JWT `amr` claim). */
    amr: Array<{ method: string; timestamp: number }>;
}

/**
 * Reads the assurance claims of a Supabase access token. The token is not verified here:
 * the server enforces them (RLS), the client only uses them to decide which step to show.
 */
export const getSessionAssurance = (accessToken: string): SessionAssurance => {
    try {
        const payload = accessToken.split('.')[1] ?? '';
        const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '='));
        const claims = JSON.parse(json) as { aal?: string; amr?: Array<{ method: string; timestamp: number }> };
        return {
            aal: claims.aal === 'aal2' ? 'aal2' : 'aal1',
            amr: Array.isArray(claims.amr) ? claims.amr : [],
        };
    } catch {
        return { aal: 'aal1', amr: [] };
    }
};

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
        locale?: string;
        avatar_url?: string;
        picture?: string;
    };
    app_metadata?: {
        provider?: string;
        providers?: string[];
        glassfolio_signup_state?: string;
    };
    factors?: SupabaseMfaFactor[];
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

/**
 * Error raised by a Supabase Auth call. Keeps the stable `error_code` (otp_expired,
 * invalid_credentials, mfa_verification_failed, over_email_send_rate_limit...) and the HTTP
 * status so the UI can translate it; the message is the server text (logs only).
 */
export class SupabaseRequestError extends Error {
    constructor(message: string, public readonly status: number, public readonly code?: string) {
        super(message);
        this.name = 'SupabaseRequestError';
    }
}

type SupabaseErrorBody = { msg?: string; message?: string; error_description?: string; error_code?: string; error?: string };

const toSupabaseError = (data: unknown, status: number, fallback: string): SupabaseRequestError => {
    const body = (data && typeof data === 'object' ? data : {}) as SupabaseErrorBody;
    const code = body.error_code || (typeof body.error === 'string' && /^[a-z_]+$/.test(body.error) ? body.error : undefined);
    return new SupabaseRequestError(body.msg || body.error_description || body.message || fallback, status, code);
};

const passkeyRequest = async <T>(path: string, init: RequestInit, accessToken?: string): Promise<T> => {
    const config = getSupabaseConfig();
    if (!config) throw new Error('Supabase is not configured.');
    const res = await fetch(`${config.url}/auth/v1${path}`, { ...init, headers: createHeaders(config, accessToken) });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) {
        const code = (data as { error_code?: string }).error_code;
        throw new SupabaseRequestError(code || (data as { msg?: string; message?: string }).msg || (data as { message?: string }).message || `Passkey request failed (HTTP ${res.status}).`, res.status, code);
    }
    return data as T;
};

export const supabaseClient = {
    // ── Auth API (GoTrue v1) ──────────────────────────────────────────────────

    async signUp(
        email: string,
        password: string,
        name?: string,
        options?: { captchaToken?: string; locale?: string; legalAcceptance?: { version: string; acceptedAt: string } }
    ): Promise<SupabaseAuthSession> {
        const config = getSupabaseConfig();
        if (!config) throw new Error('Supabase is not configured.');

        const endpoint = `${config.url}/auth/v1/signup`;
        const body: Record<string, unknown> = {
            email,
            password,
            // `locale` selects the language of branded auth emails (supabase/templates).
            data: {
                name,
                locale: options?.locale,
                glassfolio_signup_state: 'pending',
                // Server-side proof of acceptance of the Terms / Privacy Policy version (E15).
                legal_version: options?.legalAcceptance?.version,
                legal_accepted_at: options?.legalAcceptance?.acceptedAt,
            },
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
            throw toSupabaseError(data, res.status, 'Supabase signup failed.');
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
            throw toSupabaseError(data, res.status, 'Invalid email or password.');
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
            prompt: 'select_account',
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

        if (!verifier || !code.trim()) {
            throw new Error('Missing or invalid PKCE verifier.');
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
            throw toSupabaseError(data, res.status, 'Failed to exchange PKCE code.');
        }

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
            user: data.user,
        };
    },

    async signInWithIdToken(params: { provider: 'google'; token: string; nonce: string }): Promise<SupabaseAuthSession> {
        const config = getSupabaseConfig();
        if (!config) throw new Error('Supabase is not configured.');

        const endpoint = `${config.url}/auth/v1/token?grant_type=id_token`;
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: createHeaders(config),
            body: JSON.stringify({
                provider: params.provider,
                id_token: params.token,
                nonce: params.nonce,
            }),
        });

        const data = await res.json();
        if (!res.ok) {
            throw toSupabaseError(data, res.status, 'Failed to authenticate ID token with Supabase.');
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
            throw toSupabaseError(data, res.status, 'Invalid or expired verification code.');
        }

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
            user: data.user,
        };
    },

    /** Verifies an email link (`token_hash` from the branded confirmation email). */
    async verifyTokenHash(
        tokenHash: string,
        type: 'signup' | 'email_change' | 'recovery' | 'magiclink' | 'invite' | 'email' = 'signup'
    ): Promise<SupabaseAuthSession> {
        const config = getSupabaseConfig();
        if (!config) throw new Error('Supabase is not configured.');

        const res = await fetch(`${config.url}/auth/v1/verify`, {
            method: 'POST',
            headers: createHeaders(config),
            body: JSON.stringify({ token_hash: tokenHash, type }),
        });

        const data = await res.json();
        if (!res.ok) {
            throw toSupabaseError(data, res.status, 'Invalid or expired verification link.');
        }

        return {
            accessToken: data.access_token || '',
            refreshToken: data.refresh_token || '',
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
            throw toSupabaseError(data, res.status, 'Failed to resend confirmation email.');
        }
    },

    async updateUser(
        accessToken: string,
        attributes: { email?: string; password?: string; nonce?: string; data?: Record<string, unknown> }
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
            throw toSupabaseError(data, res.status, 'Failed to update user profile.');
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
                throw toSupabaseError(data, res.status, 'Too many requests. Please wait.');
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

        const data = await res.json().catch(() => ({}));
        // Typed, so the caller can tell a refused refresh token (signed out) from a server hiccup
        if (!res.ok) throw toSupabaseError(data, res.status, 'Failed to refresh Supabase session.');

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
            throw toSupabaseError(data, res.status, 'Failed to fetch Supabase user.');
        }

        return data as SupabaseUserData;
    },

    async signOut(accessToken: string, scope: 'local' | 'global' | 'others' = 'local'): Promise<void> {
        const config = getSupabaseConfig();
        if (!config) return;

        const endpoint = `${config.url}/auth/v1/logout?scope=${scope}`;
        try {
            await fetch(endpoint, {
                method: 'POST',
                headers: createHeaders(config, accessToken),
            });
        } catch {
            // Best effort sign out
        }
    },

    /** GoTrue has no factor listing route: factors come with the user object (`GET /user`). */
    async listMfaFactors(accessToken: string, options?: { includeUnverified?: boolean }): Promise<SupabaseMfaFactor[]> {
        const user = await this.getUser(accessToken);
        const factors = user.factors ?? [];
        return options?.includeUnverified ? factors : factors.filter(factor => factor.status === 'verified');
    },

    async enrollMfaFactor(accessToken: string, factorType: SupabaseMfaFactorType, friendlyName?: string): Promise<Record<string, unknown>> {
        const config = getSupabaseConfig();
        if (!config) throw new Error('Supabase is not configured.');
        const res = await fetch(`${config.url}/auth/v1/factors`, { method: 'POST', headers: createHeaders(config, accessToken), body: JSON.stringify({ factor_type: factorType, friendly_name: friendlyName }) });
        const data = await res.json();
        if (!res.ok) throw toSupabaseError(data, res.status, 'Unable to enroll MFA factor.');
        return data as Record<string, unknown>;
    },

    async challengeMfaFactor(accessToken: string, factorId: string): Promise<SupabaseMfaChallenge> {
        const config = getSupabaseConfig();
        if (!config) throw new Error('Supabase is not configured.');
        const res = await fetch(`${config.url}/auth/v1/factors/${encodeURIComponent(factorId)}/challenge`, { method: 'POST', headers: createHeaders(config, accessToken), body: '{}' });
        const data = await res.json();
        if (!res.ok) throw toSupabaseError(data, res.status, 'Unable to challenge MFA factor.');
        return data as SupabaseMfaChallenge;
    },

    async verifyMfaFactor(accessToken: string, factorId: string, challengeId: string, code: string): Promise<SupabaseAuthSession> {
        const config = getSupabaseConfig();
        if (!config) throw new Error('Supabase is not configured.');
        const res = await fetch(`${config.url}/auth/v1/factors/${encodeURIComponent(factorId)}/verify`, { method: 'POST', headers: createHeaders(config, accessToken), body: JSON.stringify({ challenge_id: challengeId, code }) });
        const data = await res.json();
        if (!res.ok) throw toSupabaseError(data, res.status, 'MFA verification failed.');
        return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000, user: data.user };
    },

    async unenrollMfaFactor(accessToken: string, factorId: string): Promise<void> {
        const config = getSupabaseConfig();
        if (!config) throw new Error('Supabase is not configured.');
        const res = await fetch(`${config.url}/auth/v1/factors/${encodeURIComponent(factorId)}`, { method: 'DELETE', headers: createHeaders(config, accessToken) });
        if (!res.ok) throw new Error('Unable to remove MFA factor.');
    },

    // ── Passkeys (GoTrue /passkeys, experimental) ─────────────────────────────

    async startPasskeyRegistration(accessToken: string): Promise<PasskeyCeremonyOptions> {
        return passkeyRequest<PasskeyCeremonyOptions>('/passkeys/registration/options', { method: 'POST', body: '{}' }, accessToken);
    },

    async verifyPasskeyRegistration(accessToken: string, challengeId: string, credential: Record<string, unknown>): Promise<SupabasePasskey> {
        return passkeyRequest<SupabasePasskey>('/passkeys/registration/verify', {
            method: 'POST',
            body: JSON.stringify({ challenge_id: challengeId, credential }),
        }, accessToken);
    },

    async startPasskeyAuthentication(): Promise<PasskeyCeremonyOptions> {
        return passkeyRequest<PasskeyCeremonyOptions>('/passkeys/authentication/options', { method: 'POST', body: '{}' });
    },

    async verifyPasskeyAuthentication(challengeId: string, credential: Record<string, unknown>): Promise<SupabaseAuthSession> {
        const data = await passkeyRequest<{ access_token: string; refresh_token: string; expires_in?: number; user: SupabaseAuthSession['user'] }>(
            '/passkeys/authentication/verify',
            { method: 'POST', body: JSON.stringify({ challenge_id: challengeId, credential }) }
        );
        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
            user: data.user,
        };
    },

    async listPasskeys(accessToken: string): Promise<SupabasePasskey[]> {
        const data = await passkeyRequest<SupabasePasskey[] | { passkeys?: SupabasePasskey[] }>('/passkeys', { method: 'GET' }, accessToken);
        return Array.isArray(data) ? data : data.passkeys ?? [];
    },

    async deletePasskey(accessToken: string, passkeyId: string): Promise<void> {
        await passkeyRequest<unknown>(`/passkeys/${encodeURIComponent(passkeyId)}`, { method: 'DELETE' }, accessToken);
    },

    async notifySecurityEvent(
        accessToken: string,
        action: 'passkey_added' | 'passkey_removed',
        passkeyName: string,
        locale?: string
    ): Promise<void> {
        const config = getSupabaseConfig();
        if (!config) return;
        try {
            await fetch(`${config.url}/functions/v1/security-notify`, {
                method: 'POST',
                headers: createHeaders(config, accessToken),
                body: JSON.stringify({ action, passkeyName, locale }),
            });
        } catch {
            // Best-effort notification, does not block security operations
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

        // Fail loudly: callers must never mistake an unreachable vault for a missing one.
        if (!res.ok) throw new Error(`Unable to read the vault header (HTTP ${res.status}).`);
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

        if (!res.ok) throw new Error(`Unable to read vault records (HTTP ${res.status}).`);
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

    /**
     * Deletes the account server-side. The RPC removes the vault rows itself, after checking the
     * session's assurance level and a recent authentication, so nothing is deleted beforehand.
     */
    /**
     * Replaces the vault header and re-encrypted records in ONE server transaction (migration 0007).
     * Used after a DEK rotation: separate requests could leave a new header over old-DEK records.
     */
    async commitVaultMigration(
        accessToken: string,
        header: Record<string, unknown>,
        records: Array<{ record_key: string; ciphertext: string }>
    ): Promise<void> {
        const config = getSupabaseConfig();
        if (!config) throw new Error('Supabase is not configured.');

        const res = await fetch(`${config.url}/rest/v1/rpc/commit_vault_migration`, {
            method: 'POST',
            headers: createHeaders(config, accessToken),
            body: JSON.stringify({ p_header: header, p_records: records }),
        });
        if (!res.ok) {
            const data = (await res.json().catch(() => ({}))) as { message?: string };
            throw new Error(data.message || `Vault migration commit failed (HTTP ${res.status}).`);
        }
    },

    async deleteOwnAccount(accessToken: string): Promise<void> {
        const config = getSupabaseConfig();
        if (!config) throw new Error('Supabase is not configured.');

        const endpoint = `${config.url}/rest/v1/rpc/delete_own_account`;
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: createHeaders(config, accessToken),
            body: JSON.stringify({}),
        });

        if (!res.ok) {
            const data = (await res.json().catch(() => ({}))) as { message?: string };
            throw new Error(data.message || `Account deletion failed (HTTP ${res.status}).`);
        }
    },
};
