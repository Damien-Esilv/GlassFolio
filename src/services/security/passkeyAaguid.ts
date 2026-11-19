/**
 * WebAuthn AAGUID extraction and friendly authenticator provider resolution.
 *
 * Reads the 16-byte AAGUID from `AuthenticatorAttestationResponse.getAuthenticatorData()`
 * (WebAuthn Level 2, bytes 37..52 when the AT flag 0x40 is set) without any CBOR parser or
 * external dependency. Falls back gracefully to WebAuthn transports and OS detection when
 * an authenticator zeros its AAGUID (00000000-0000-0000-0000-000000000000) or omits it.
 */

const ZERO_AAGUID = '00000000-0000-0000-0000-000000000000';
const ATTESTED_CREDENTIAL_DATA_FLAG = 0x40;
const MIN_AUTH_DATA_WITH_AAGUID_BYTES = 53; // 32 (rpIdHash) + 1 (flags) + 4 (signCount) + 16 (aaguid)

/**
 * Public AAGUID directory for major passkey providers and security keys
 * (FIDO Alliance MDS / passkeydeveloper/passkey-authenticator-aaguids).
 */
export const KNOWN_PASSKEY_AAGUIDS: Readonly<Record<string, string>> = {
    // Apple
    'fbfc3007-154e-4ecc-8c0b-6e020557d7bd': 'Apple Passwords',
    'dd4ec289-e01d-41c9-bb89-70fa845d4bf2': 'Apple Passwords',
    // Google & Chrome
    'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4': 'Google Password Manager',
    'adce0002-35bc-c60a-648b-0b25f1f05503': 'Chrome (Touch ID)',
    'b5397666-4885-aa6b-cebf-e52262a439a2': 'Chromium',
    // Password managers
    'bada5566-a7aa-401f-bd96-45619a55120d': '1Password',
    'd548826e-79b4-db40-a3d8-11116f7e8349': 'Bitwarden',
    '531126d6-e717-415c-9320-3d9aa6981239': 'Dashlane',
    '0ea242b4-43c4-4a1b-8b17-dd6d0b6baec6': 'Keeper',
    'f3809540-7f14-49c1-a8b3-8f813b225541': 'Enpass',
    '22248c4c-7a12-46e2-9a41-44291b373a4d': 'Proton Pass',
    '50726f74-6f6e-5061-7373-506173736b65': 'Proton Pass',
    'de503f9c-21a4-4f76-b4b7-558eb55c6f89': 'NordPass',
    // Windows Hello
    '08987058-cadc-4b81-b6e1-30de50dcbe96': 'Windows Hello',
    '6028b017-b1d4-4c02-b4b3-afcdafc96bb2': 'Windows Hello',
    '9ddd1817-af5a-4672-a2b9-3e3dd95000a9': 'Windows Hello',
    // Hardware security keys (YubiKey 5 series)
    '2fc0579f-8113-47ea-b116-bb5a8db9202a': 'YubiKey 5',
    'cb69481e-8ff7-4039-93ec-0a2729a154a8': 'YubiKey 5',
    '73bb0cd4-e502-49b8-9c6f-b59445bf720b': 'YubiKey 5',
    'c5ef55ff-ad9a-4b9f-b580-adebafe026d0': 'YubiKey 5',
    'fa2b99dc-9e39-4257-8f92-4a30d23c4118': 'YubiKey 5 FIPS',
    'ee882879-721c-4913-9775-3dfcce97072a': 'YubiKey Bio',
};

const toHexByte = (value: number): string => value.toString(16).padStart(2, '0');

/**
 * Extracts the lowercase canonical UUID AAGUID from WebAuthn authenticatorData.
 * Returns undefined when authenticatorData is absent, truncated, has no AT flag, or is all zeros.
 */
export const extractAaguid = (authenticatorData?: ArrayBuffer | ArrayBufferView | null): string | undefined => {
    if (!authenticatorData) return undefined;
    const bytes = authenticatorData instanceof ArrayBuffer
        ? new Uint8Array(authenticatorData)
        : new Uint8Array(authenticatorData.buffer, authenticatorData.byteOffset, authenticatorData.byteLength);

    if (bytes.byteLength < MIN_AUTH_DATA_WITH_AAGUID_BYTES) return undefined;
    if ((bytes[32] & ATTESTED_CREDENTIAL_DATA_FLAG) === 0) return undefined;

    const hex = Array.from(bytes.slice(37, 53), toHexByte).join('');
    const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
    return uuid === ZERO_AAGUID ? undefined : uuid;
};

/** Maps a known AAGUID to its human-readable provider name. */
export const getPasskeyProviderFromAaguid = (aaguid?: string): string | undefined => {
    if (!aaguid) return undefined;
    return KNOWN_PASSKEY_AAGUIDS[aaguid.toLowerCase()];
};

const detectDeviceLabel = (userAgent?: string): string => {
    const ua = userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
    if (/iPhone/i.test(ua)) return 'iPhone Passkey';
    if (/iPad/i.test(ua)) return 'iPad Passkey';
    if (/Mac|Macintosh/i.test(ua)) return 'Mac Passkey';
    if (/Windows/i.test(ua)) return 'Windows Passkey';
    if (/Android/i.test(ua)) return 'Android Passkey';
    if (/Linux/i.test(ua)) return 'Linux Passkey';
    return 'Device Passkey';
};

/** Appends ` (2)`, ` (3)`, ... if `baseName` collides with an existing label (case-insensitive). */
export const deduplicateLabel = (baseName: string, existingNames: string[] = []): string => {
    const normalized = new Set(existingNames.map(n => n.trim().toLowerCase()).filter(Boolean));
    const trimmed = baseName.trim() || 'Passkey';
    if (!normalized.has(trimmed.toLowerCase())) return trimmed;
    let index = 2;
    while (normalized.has(`${trimmed} (${index})`.toLowerCase())) {
        index += 1;
    }
    return `${trimmed} (${index})`;
};

/**
 * Resolves a human-friendly passkey label from AAGUID, WebAuthn transports, and OS userAgent,
 * deduplicated against already registered passkey names.
 */
export const resolvePasskeyLabel = (params: {
    aaguid?: string;
    transports?: string[];
    userAgent?: string;
    existingNames?: string[];
}): string => {
    const provider = getPasskeyProviderFromAaguid(params.aaguid);
    if (provider) {
        return deduplicateLabel(provider, params.existingNames);
    }

    const transports = params.transports ?? [];
    if (transports.includes('usb') || transports.includes('nfc')) {
        return deduplicateLabel('Security Key', params.existingNames);
    }
    if (transports.includes('hybrid') && !transports.includes('internal')) {
        return deduplicateLabel('Cross-device Passkey', params.existingNames);
    }

    return deduplicateLabel(detectDeviceLabel(params.userAgent), params.existingNames);
};
