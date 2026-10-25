/**
 * WebAuthn Passkey Service (TGLA-042, TGLA-101).
 *
 * Implements:
 *   - Platform authenticator detection (Touch ID, Face ID, Windows Hello).
 *   - WebAuthn ceremonies with locally built options (local mode) or Supabase options (cloud mode).
 *   - WebAuthn PRF extension: a fixed input evaluated by the authenticator yields the secret that
 *     wraps the vault key. That secret never leaves the device: it is stripped from anything sent
 *     to a server.
 *   - Encrypted passkey credential store in appStorage.
 */

import { fromBase64, toBase64, utf8Encode } from './encoding';
import { appStorage } from '../storage/appStorage';
import { vaultService } from './vaultService';
import type { PasskeySlotInfo } from './vaultTypes';
import { PASSKEY_RP_ID_STORAGE_KEY } from '../storage/storageKeys';

const PASSKEYS_STORAGE_KEY = 'glassfolio_security_passkeys';
const PRF_INPUT_LABEL = 'glassfolio:vault-prf:v1';

/** Machine-readable passkey failures, translated by the UI (`common:errors.passkey.<code>`). */
export type PasskeyErrorCode = 'UNSUPPORTED' | 'NO_SLOT' | 'NO_PRF' | 'NOT_REGISTERED' | 'CANCELLED' | 'FAILED';

export class PasskeyError extends Error {
    constructor(public readonly code: PasskeyErrorCode, message: string) {
        super(message);
        this.name = 'PasskeyError';
    }
}

/** A dismissed or timed-out browser prompt surfaces as NotAllowedError / AbortError. */
const toPasskeyError = (error: unknown): PasskeyError => {
    if (error instanceof PasskeyError) return error;
    const name = error instanceof Error ? error.name : '';
    if (name === 'NotAllowedError' || name === 'AbortError') {
        return new PasskeyError('CANCELLED', 'Passkey prompt was cancelled or timed out.');
    }
    return new PasskeyError('FAILED', error instanceof Error ? error.message : 'Passkey authentication failed.');
};

export interface PasskeyRecord {
    id: string; // base64 credential ID
    name: string; // user-friendly label (e.g. "MacBook Touch ID")
    createdAt: string;
    algorithm: number; // COSE algorithm, e.g. -7 (ES256)
    transports?: string[];
    prfEnabled?: boolean;
    /** Supabase passkey id (cloud mode). */
    serverId?: string;
}

export interface PasskeyAttestation {
    credentialId: string;
    /** Relying party the credential is scoped to (server RP ID in cloud mode, page host locally). */
    rpId: string;
    algorithm: number;
    transports?: string[];
    prfEnabled: boolean;
    prfSecret?: Uint8Array;
    /** Serialized credential for server verification (no extension results). */
    credentialJson: Record<string, unknown>;
}

export interface PasskeyAssertion {
    credentialId: string;
    prfSecret?: Uint8Array;
    /** Serialized assertion for server verification (no extension results). */
    credentialJson: Record<string, unknown>;
}

type PrfClientResults = { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer | ArrayBufferView } } };

/**
 * Fixed PRF input. The output is still unique and secret per credential because the authenticator
 * mixes in a key only it holds, so the same passkey yields the same secret on every device it syncs to.
 */
export const getPrfEvalInput = async (): Promise<Uint8Array> =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', utf8Encode(PRF_INPUT_LABEL)));

const toBytes = (data: ArrayBuffer | ArrayBufferView): Uint8Array =>
    data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

const toBase64Url = (data: ArrayBuffer | ArrayBufferView): string =>
    toBase64(toBytes(data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const getRpId = (): string =>
    typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';

/** WebAuthn only accepts an RP ID equal to the page host or one of its registrable parents. */
export const isRpIdUsableHere = (rpId: string, host: string = getRpId()): boolean =>
    host === rpId || host.endsWith(`.${rpId}`);

/** Allow-list entry with optional transport hints (internal, hybrid...). */
export interface CredentialHint {
    id: string;
    transports?: string[];
}

const toHintedDescriptors = (hints: CredentialHint[]): PublicKeyCredentialDescriptor[] =>
    hints.flatMap(hint => toDescriptors([hint.id]).map(descriptor => ({
        ...descriptor,
        ...(hint.transports?.length ? { transports: hint.transports as AuthenticatorTransport[] } : {}),
    })));

const randomChallenge = (): Uint8Array => {
    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);
    return challenge;
};

const toDescriptors = (ids: string[]): PublicKeyCredentialDescriptor[] =>
    ids.flatMap(id => {
        try {
            return [{ id: fromBase64(id), type: 'public-key' as const }];
        } catch {
            return [];
        }
    });

type JsonDescriptor = { id: string; type?: string; transports?: string[] };

const decodeDescriptors = (list: unknown): PublicKeyCredentialDescriptor[] | undefined =>
    Array.isArray(list)
        ? (list as JsonDescriptor[]).map(item => ({
            id: fromBase64(item.id),
            type: 'public-key' as const,
            ...(item.transports ? { transports: item.transports as AuthenticatorTransport[] } : {}),
        }))
        : undefined;

/** Decodes the base64url members of server-provided creation options. */
const decodeCreationOptions = (json: Record<string, unknown>): PublicKeyCredentialCreationOptions => {
    const user = json.user as { id: string; name: string; displayName: string };
    return {
        ...(json as unknown as PublicKeyCredentialCreationOptions),
        challenge: fromBase64(json.challenge as string),
        user: { ...user, id: fromBase64(user.id) },
        excludeCredentials: decodeDescriptors(json.excludeCredentials),
    };
};

/** Decodes the base64url members of server-provided request options. */
const decodeRequestOptions = (json: Record<string, unknown>): PublicKeyCredentialRequestOptions => ({
    ...(json as unknown as PublicKeyCredentialRequestOptions),
    challenge: fromBase64(json.challenge as string),
    allowCredentials: decodeDescriptors(json.allowCredentials),
});

/** Credential JSON for the server. Extension results are omitted on purpose: they carry the PRF secret. */
const serializeCredential = (credential: PublicKeyCredential): Record<string, unknown> => {
    const base = {
        id: credential.id,
        rawId: toBase64Url(credential.rawId),
        type: credential.type,
        authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
        clientExtensionResults: {},
    };
    if ('attestationObject' in credential.response) {
        const attestation = credential.response as AuthenticatorAttestationResponse;
        return {
            ...base,
            response: {
                clientDataJSON: toBase64Url(attestation.clientDataJSON),
                attestationObject: toBase64Url(attestation.attestationObject),
                transports: attestation.getTransports?.() ?? [],
            },
        };
    }
    const assertion = credential.response as AuthenticatorAssertionResponse;
    return {
        ...base,
        response: {
            clientDataJSON: toBase64Url(assertion.clientDataJSON),
            authenticatorData: toBase64Url(assertion.authenticatorData),
            signature: toBase64Url(assertion.signature),
            userHandle: assertion.userHandle ? toBase64Url(assertion.userHandle) : null,
        },
    };
};

const readPrf = (credential: PublicKeyCredential): { enabled: boolean; secret?: Uint8Array } => {
    const results = credential.getClientExtensionResults
        ? (credential.getClientExtensionResults() as unknown as PrfClientResults)
        : undefined;
    const first = results?.prf?.results?.first;
    const secret = first ? toBytes(first).slice() : undefined;
    return { enabled: Boolean(results?.prf?.enabled || secret), secret };
};

const withPrfExtension = async (extensions: AuthenticationExtensionsClientInputs | undefined): Promise<AuthenticationExtensionsClientInputs> =>
    ({ ...(extensions || {}), prf: { eval: { first: await getPrfEvalInput() } } }) as unknown as AuthenticationExtensionsClientInputs;

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

    async isPrfSupported(): Promise<boolean> {
        if (typeof window === 'undefined' || !window.PublicKeyCredential) return false;
        try {
            const pk = window.PublicKeyCredential as unknown as { getClientCapabilities?: () => Promise<Record<string, boolean>> };
            if (typeof pk.getClientCapabilities === 'function') {
                const caps = await pk.getClientCapabilities();
                return Boolean(caps?.prf || caps?.['extension:prf']);
            }
            return await isPasskeySupported();
        } catch {
            return false;
        }
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

    async saveRecord(record: PasskeyRecord): Promise<void> {
        const existing = await this.listPasskeys();
        appStorage.setItem(PASSKEYS_STORAGE_KEY, JSON.stringify([...existing.filter(p => p.id !== record.id), record]));
    },

    /**
     * Creates a credential with user verification and the PRF extension. Cloud mode passes the
     * Supabase options; local mode builds them (excluding already registered credentials).
     */
    async create(params: {
        user: { id: string; email: string; name: string };
        serverOptions?: Record<string, unknown>;
        excludeCredentialIds?: string[];
    }): Promise<PasskeyAttestation> {
        if (typeof navigator === 'undefined' || !navigator.credentials?.create) {
            throw new Error('WebAuthn is not supported in this environment.');
        }

        const publicKey: PublicKeyCredentialCreationOptions = params.serverOptions
            ? decodeCreationOptions(params.serverOptions)
            : {
                challenge: randomChallenge(),
                rp: { name: 'GlassFolio', id: getRpId() },
                user: { id: utf8Encode(params.user.id), name: params.user.email, displayName: params.user.name },
                pubKeyCredParams: [
                    { alg: -7, type: 'public-key' },  // ES256
                    { alg: -257, type: 'public-key' }, // RS256
                ],
                authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'preferred' },
                excludeCredentials: toDescriptors(params.excludeCredentialIds || []),
                timeout: 60000,
                attestation: 'none',
            };
        publicKey.authenticatorSelection = { ...publicKey.authenticatorSelection, userVerification: 'required' };
        publicKey.extensions = await withPrfExtension(publicKey.extensions);

        const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
        if (!credential) {
            throw new Error('Passkey registration was cancelled or failed.');
        }

        const attestation = credential.response as AuthenticatorAttestationResponse;
        const prf = readPrf(credential);
        return {
            credentialId: toBase64(new Uint8Array(credential.rawId)),
            rpId: publicKey.rp?.id || getRpId(),
            algorithm: attestation.getPublicKeyAlgorithm?.() ?? -7,
            transports: attestation.getTransports?.(),
            prfEnabled: prf.enabled,
            prfSecret: prf.secret,
            credentialJson: serializeCredential(credential),
        };
    },

    /**
     * Runs an assertion with user verification. Local mode restricts it to `allowCredentialIds` and
     * rejects any other credential; cloud mode passes the Supabase options (verified server-side).
     */
    async authenticate(params: {
        allowCredentialIds?: string[];
        /** Allow-list with transport hints; takes precedence over allowCredentialIds. */
        allowCredentials?: CredentialHint[];
        /** Relying party of the credentials (defaults to the page host). */
        rpId?: string;
        serverOptions?: Record<string, unknown>;
        withPrf?: boolean;
    } = {}): Promise<PasskeyAssertion> {
        if (typeof navigator === 'undefined' || !navigator.credentials?.get) {
            throw new PasskeyError('UNSUPPORTED', 'WebAuthn is not supported in this environment.');
        }

        const hints: CredentialHint[] = params.allowCredentials
            ?? (params.allowCredentialIds || []).map(id => ({ id }));
        const allowIds = hints.map(hint => hint.id);
        const publicKey: PublicKeyCredentialRequestOptions = params.serverOptions
            ? decodeRequestOptions(params.serverOptions)
            : {
                challenge: randomChallenge(),
                rpId: params.rpId || getRpId(),
                timeout: 60000,
                ...(hints.length > 0 ? { allowCredentials: toHintedDescriptors(hints) } : {}),
            };
        publicKey.userVerification = 'required';
        if (params.withPrf) {
            publicKey.extensions = await withPrfExtension(publicKey.extensions);
        }

        let assertion: PublicKeyCredential | null;
        try {
            assertion = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
        } catch (error) {
            throw toPasskeyError(error);
        }
        if (!assertion) {
            throw new PasskeyError('CANCELLED', 'Passkey authentication was cancelled or failed.');
        }

        const credentialId = toBase64(new Uint8Array(assertion.rawId));
        if (!params.serverOptions && allowIds.length > 0 && !allowIds.includes(credentialId)) {
            throw new PasskeyError('NOT_REGISTERED', 'This passkey is not registered for this account.');
        }

        return {
            credentialId,
            prfSecret: params.withPrf ? readPrf(assertion).secret : undefined,
            credentialJson: serializeCredential(assertion),
        };
    },

    /** Remembers the RP ID used by the server passkeys so a locked vault can use it offline. */
    rememberServerRpId(rpId: string | undefined): void {
        if (!rpId) return;
        try {
            appStorage.setItem(PASSKEY_RP_ID_STORAGE_KEY, rpId);
        } catch {
            // Non-critical cache
        }
    },

    getRememberedServerRpId(): string | undefined {
        try {
            return appStorage.getItem(PASSKEY_RP_ID_STORAGE_KEY) || undefined;
        } catch {
            return undefined;
        }
    },

    /** True when at least one passkey slot of the vault can be used from this page's host. */
    canUnlockVaultHere(): boolean {
        return this.usableVaultSlots().length > 0;
    },

    /**
     * Passkey slots this page can use. A credential is bound to its RP ID: a passkey created on
     * app.example.com (or example.com) cannot be used from localhost, e.g. a Docker local build.
     * Slots created before the RP ID was stored are kept (resolved at unlock time).
     */
    usableVaultSlots(): PasskeySlotInfo[] {
        return vaultService.listPasskeySlots().filter(slot => !slot.rpId || isRpIdUsableHere(slot.rpId));
    },

    /**
     * Unlocks the vault with a passkey enrolled in it. Works offline: the header lists the slots
     * with their RP ID. A single WebAuthn ceremony is run (Safari requires a user gesture per
     * ceremony), scoped to the RP ID the credentials were created for.
     *
     * @param options.legacyRpId RP ID for slots enrolled before it was stored (cloud mode: the
     *   Supabase RP ID, fetched before the click); defaults to the page host. It is a plain value
     *   on purpose: any network call between the click and the ceremony makes Safari drop the
     *   user gesture.
     */
    async unlockVault(options: { legacyRpId?: string } = {}): Promise<string> {
        const slots = this.usableVaultSlots();
        if (slots.length === 0) {
            throw new PasskeyError('NO_SLOT', 'No passkey can unlock this vault on this site.');
        }

        const known = slots.filter(slot => slot.rpId);
        const legacy = slots.filter(slot => !slot.rpId);
        // Prefer the RP ID shared by most slots; legacy slots are resolved once.
        const counts = new Map<string, number>();
        known.forEach(slot => counts.set(slot.rpId as string, (counts.get(slot.rpId as string) || 0) + 1));
        let rpId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        if (!rpId) {
            rpId = options.legacyRpId && isRpIdUsableHere(options.legacyRpId) ? options.legacyRpId : getRpId();
        }

        const candidates = slots.filter(slot => !slot.rpId || slot.rpId === rpId);
        const { credentialId, prfSecret } = await this.authenticate({
            rpId,
            allowCredentials: candidates.map(slot => ({ id: slot.credentialId, transports: slot.transports })),
            withPrf: true,
        });
        if (!prfSecret) {
            throw new PasskeyError('NO_PRF', 'This passkey cannot unlock the vault on this device.');
        }
        await vaultService.unlockWithPasskeyPrf(credentialId, prfSecret);
        if (legacy.some(slot => slot.credentialId === credentialId)) {
            vaultService.updatePasskeySlotMeta(credentialId, { rpId });
        }
        return credentialId;
    },

    async deletePasskey(credentialId: string): Promise<void> {
        const existing = await this.listPasskeys();
        const updated = existing.filter(p => p.id !== credentialId);
        appStorage.setItem(PASSKEYS_STORAGE_KEY, JSON.stringify(updated));
        // Lets the platform hide the credential from future prompts (WebAuthn Signal API).
        const signal = (window.PublicKeyCredential as unknown as {
            signalUnknownCredential?: (options: { rpId: string; credentialId: string }) => Promise<void>;
        } | undefined)?.signalUnknownCredential;
        if (typeof signal === 'function') {
            await signal({ rpId: getRpId(), credentialId: toBase64Url(fromBase64(credentialId)) }).catch(() => undefined);
        }
    },
};
