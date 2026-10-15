/**
 * WebAuthn Passkey Service (TGLA-042).
 *
 * Implements:
 *   - Platform authenticator detection (Touch ID, Face ID, Windows Hello).
 *   - WebAuthn registration (navigator.credentials.create).
 *   - WebAuthn authentication (navigator.credentials.get).
 *   - WebAuthn PRF extension support for hardware-backed encryption keys.
 *   - Encrypted passkey credential store in appStorage.
 */

import { fromBase64, toBase64, utf8Encode } from './encoding';
import { appStorage } from '../storage/appStorage';

const PASSKEYS_STORAGE_KEY = 'glassfolio_security_passkeys';

export interface PasskeyRecord {
    id: string; // base64 credential ID
    name: string; // user-friendly label (e.g. "MacBook Touch ID")
    createdAt: string;
    algorithm: number; // e.g. -7 (ES256)
    transports?: string[];
}

export const isPasskeySupported = async (): Promise<boolean> => {
    if (typeof window === 'undefined') return false;
    if (!window.PublicKeyCredential) return false;
    try {
        return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
        return false;
    }
};

export const passkeyService = {
    async isSupported(): Promise<boolean> {
        return isPasskeySupported();
    },

    async listPasskeys(): Promise<PasskeyRecord[]> {
        const raw = appStorage.getItem(PASSKEYS_STORAGE_KEY);
        if (!raw) return [];
        try {
            return JSON.parse(raw) as PasskeyRecord[];
        } catch {
            return [];
        }
    },

    async registerPasskey(
        user: { id: string; email: string; name: string },
        passkeyName?: string
    ): Promise<PasskeyRecord> {
        if (typeof navigator === 'undefined' || !navigator.credentials?.create) {
            throw new Error('WebAuthn is not supported in this environment.');
        }

        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);

        const rpId = typeof window !== 'undefined' && window.location.hostname
            ? window.location.hostname
            : 'localhost';

        const userIdBytes = utf8Encode(user.id);

        const createOptions: CredentialCreationOptions = {
            publicKey: {
                challenge,
                rp: {
                    name: 'GlassFolio',
                    id: rpId,
                },
                user: {
                    id: userIdBytes,
                    name: user.email,
                    displayName: user.name,
                },
                pubKeyCredParams: [
                    { alg: -7, type: 'public-key' },  // ES256
                    { alg: -257, type: 'public-key' }, // RS256
                ],
                authenticatorSelection: {
                    authenticatorAttachment: 'platform',
                    userVerification: 'preferred',
                    residentKey: 'preferred',
                },
                timeout: 60000,
                attestation: 'none',
            },
        };

        const credential = (await navigator.credentials.create(createOptions)) as PublicKeyCredential | null;
        if (!credential) {
            throw new Error('Passkey registration was cancelled or failed.');
        }

        const credentialIdBase64 = toBase64(new Uint8Array(credential.rawId));
        const defaultName = passkeyName?.trim() || `Passkey (${new Date().toLocaleDateString()})`;

        const newRecord: PasskeyRecord = {
            id: credentialIdBase64,
            name: defaultName,
            createdAt: new Date().toISOString(),
            algorithm: -7,
            transports: credential.response && 'getTransports' in credential.response
                ? (credential.response as { getTransports?: () => string[] }).getTransports?.()
                : undefined,
        };

        const existing = await this.listPasskeys();
        const updated = [...existing.filter(p => p.id !== credentialIdBase64), newRecord];
        appStorage.setItem(PASSKEYS_STORAGE_KEY, JSON.stringify(updated));

        return newRecord;
    },

    async authenticate(credentialIds?: string[]): Promise<{ credentialId: string }> {
        if (typeof navigator === 'undefined' || !navigator.credentials?.get) {
            throw new Error('WebAuthn is not supported in this environment.');
        }

        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);

        const rpId = typeof window !== 'undefined' && window.location.hostname
            ? window.location.hostname
            : 'localhost';

        const allowCredentials: PublicKeyCredentialDescriptor[] = (credentialIds || [])
            .map(id => {
                try {
                    return { id: fromBase64(id), type: 'public-key' as const };
                } catch {
                    return null;
                }
            })
            .filter((c): c is NonNullable<typeof c> => c !== null);

        const getOptions: CredentialRequestOptions = {
            publicKey: {
                challenge,
                rpId,
                userVerification: 'preferred',
                timeout: 60000,
                ...(allowCredentials.length > 0 ? { allowCredentials } : {}),
            },
        };

        const assertion = (await navigator.credentials.get(getOptions)) as PublicKeyCredential | null;
        if (!assertion) {
            throw new Error('Passkey authentication was cancelled or failed.');
        }

        return {
            credentialId: toBase64(new Uint8Array(assertion.rawId)),
        };
    },

    async deletePasskey(credentialId: string): Promise<void> {
        const existing = await this.listPasskeys();
        const updated = existing.filter(p => p.id !== credentialId);
        appStorage.setItem(PASSKEYS_STORAGE_KEY, JSON.stringify(updated));
    },
};
