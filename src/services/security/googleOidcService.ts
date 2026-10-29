/**
 * Direct Google OIDC & Drive OAuth 2.0 ceremony (E2EE Split-Trust).
 *
 * Implements client-side OIDC Implicit Grant (id_token token) without third-party scripts.
 * The access_token (Google Drive appDataFolder) is kept strictly in-browser and NEVER sent to Supabase.
 * The id_token + rawNonce is exchanged directly with Supabase via grant_type=id_token.
 */

import { randomBytes, toBase64 } from './crypto';
import { utf8Encode } from './encoding';

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const CEREMONY_STORAGE_KEY = 'gf_google_oidc_ceremony';
const CEREMONY_TTL_MS = 10 * 60 * 1000; // 10 minutes

export const GOOGLE_DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const GOOGLE_OIDC_SCOPES = `openid email profile ${GOOGLE_DRIVE_APPDATA_SCOPE}`;

export interface GoogleOidcCeremonyState {
    state: string;
    rawNonce: string;
    createdAt: number;
}

export interface GoogleCallbackResult {
    idToken: string;
    accessToken: string;
    rawNonce: string;
    state: string;
}

/** Computes SHA-256 in hexadecimal string format for OpenID Connect nonces. */
export async function sha256Hex(value: string): Promise<string> {
    const data = utf8Encode(value);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function base64Url(bytes: Uint8Array): string {
    return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const googleOidcService = {
    /** Returns the configured Google OAuth 2.0 Web Client ID. */
    getClientId(): string {
        const env = (import.meta as unknown as { env?: Record<string, string> }).env;
        return env?.VITE_GOOGLE_CLIENT_ID?.trim() || '';
    },

    isConfigured(): boolean {
        return Boolean(this.getClientId());
    },

    getRedirectUri(): string {
        return `${window.location.origin}/auth/google-callback`;
    },

    /**
     * Prepares and starts the Google OIDC + Drive OAuth flow.
     * Redirects the browser directly to accounts.google.com.
     */
    async startCeremony(): Promise<void> {
        const clientId = this.getClientId();
        if (!clientId) {
            throw new Error('GOOGLE_CLIENT_ID_NOT_CONFIGURED');
        }

        const stateBytes = randomBytes(32);
        const nonceBytes = randomBytes(32);
        const state = base64Url(stateBytes);
        const rawNonce = base64Url(nonceBytes);
        const hashedNonce = await sha256Hex(rawNonce);

        const ceremony: GoogleOidcCeremonyState = {
            state,
            rawNonce,
            createdAt: Date.now(),
        };

        try {
            sessionStorage.setItem(CEREMONY_STORAGE_KEY, JSON.stringify(ceremony));
        } catch {
            // Storage quota or disabled
        }

        const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: this.getRedirectUri(),
            response_type: 'id_token token',
            scope: GOOGLE_OIDC_SCOPES,
            state,
            nonce: hashedNonce,
            include_granted_scopes: 'true',
            prompt: 'select_account',
        });

        window.location.assign(`${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`);
    },

    /**
     * Parses and validates the callback URL hash fragment on /auth/google-callback.
     * Scrubs the URL fragment immediately to prevent leakage.
     */
    parseCallbackHash(hashString: string = window.location.hash): GoogleCallbackResult {
        // Synchronously clean the address bar fragment immediately
        if (typeof window !== 'undefined' && window.location.hash) {
            window.history.replaceState(null, '', window.location.pathname);
        }

        const cleanHash = hashString.startsWith('#') ? hashString.slice(1) : hashString;
        const params = new URLSearchParams(cleanHash);

        const error = params.get('error');
        if (error) {
            const desc = params.get('error_description') || error;
            throw new Error(`GOOGLE_OAUTH_ERROR: ${desc}`);
        }

        const idToken = params.get('id_token');
        const accessToken = params.get('access_token');
        const state = params.get('state');
        const scope = params.get('scope') || '';

        if (!idToken || !accessToken || !state) {
            throw new Error('MISSING_OAUTH_TOKENS');
        }

        // Verify state against sessionStorage ceremony
        let storedCeremony: GoogleOidcCeremonyState | null = null;
        try {
            const raw = sessionStorage.getItem(CEREMONY_STORAGE_KEY);
            if (raw) {
                storedCeremony = JSON.parse(raw) as GoogleOidcCeremonyState;
            }
            sessionStorage.removeItem(CEREMONY_STORAGE_KEY);
        } catch {
            storedCeremony = null;
        }

        if (!storedCeremony) {
            throw new Error('MISSING_CEREMONY_STATE');
        }

        if (Date.now() - storedCeremony.createdAt > CEREMONY_TTL_MS) {
            throw new Error('EXPIRED_CEREMONY_STATE');
        }

        if (storedCeremony.state !== state) {
            throw new Error('INVALID_CEREMONY_STATE');
        }

        // Verify that drive.appdata scope was granted
        if (!scope.includes('drive.appdata')) {
            throw new Error('MISSING_DRIVE_APPDATA_SCOPE');
        }

        return {
            idToken,
            accessToken,
            rawNonce: storedCeremony.rawNonce,
            state,
        };
    },
};
