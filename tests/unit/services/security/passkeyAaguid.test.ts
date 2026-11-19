import { describe, it, expect } from 'vitest';
import {
    deduplicateLabel,
    extractAaguid,
    getPasskeyProviderFromAaguid,
    resolvePasskeyLabel,
} from '../../../../src/services/security/passkeyAaguid';

/** Builds a minimal WebAuthn authenticatorData buffer containing the given UUID AAGUID. */
const buildAuthenticatorData = (uuid: string, flags = 0x45): ArrayBuffer => {
    const buffer = new ArrayBuffer(64);
    const bytes = new Uint8Array(buffer);
    bytes[32] = flags;
    const hex = uuid.replace(/-/g, '');
    for (let i = 0; i < 16; i += 1) {
        bytes[37 + i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return buffer;
};

describe('passkeyAaguid', () => {
    it('extracts canonical lowercase UUID from WebAuthn authenticatorData', () => {
        const appleAuthData = buildAuthenticatorData('fbfc3007-154e-4ecc-8c0b-6e020557d7bd');
        const extracted = extractAaguid(appleAuthData);
        expect(extracted).toBe('fbfc3007-154e-4ecc-8c0b-6e020557d7bd');
        expect(getPasskeyProviderFromAaguid(extracted)).toBe('Apple Passwords');
    });

    it('returns undefined when authenticatorData is missing, truncated, lacks AT flag, or is all zeros', () => {
        expect(extractAaguid(undefined)).toBeUndefined();
        expect(extractAaguid(new ArrayBuffer(37))).toBeUndefined();
        expect(extractAaguid(buildAuthenticatorData('fbfc3007-154e-4ecc-8c0b-6e020557d7bd', 0x05))).toBeUndefined();
        expect(extractAaguid(buildAuthenticatorData('00000000-0000-0000-0000-000000000000'))).toBeUndefined();
    });

    it('resolves major passkey providers and deduplicates collisions', () => {
        expect(resolvePasskeyLabel({ aaguid: 'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4' })).toBe('Google Password Manager');
        expect(resolvePasskeyLabel({ aaguid: 'bada5566-a7aa-401f-bd96-45619a55120d' })).toBe('1Password');
        expect(resolvePasskeyLabel({ aaguid: 'd548826e-79b4-db40-a3d8-11116f7e8349' })).toBe('Bitwarden');
        expect(resolvePasskeyLabel({ aaguid: '2fc0579f-8113-47ea-b116-bb5a8db9202a' })).toBe('YubiKey 5');
        expect(resolvePasskeyLabel({
            aaguid: 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd',
            existingNames: ['Apple Passwords', 'Apple Passwords (2)'],
        })).toBe('Apple Passwords (3)');
    });

    it('falls back to WebAuthn transports and OS userAgent when AAGUID is unknown', () => {
        expect(resolvePasskeyLabel({ transports: ['usb'] })).toBe('Security Key');
        expect(resolvePasskeyLabel({ transports: ['hybrid'] })).toBe('Cross-device Passkey');
        expect(resolvePasskeyLabel({
            transports: ['internal'],
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)',
        })).toBe('Mac Passkey');
        expect(resolvePasskeyLabel({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        })).toBe('Windows Passkey');
        expect(resolvePasskeyLabel({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' })).toBe('iPhone Passkey');
        expect(resolvePasskeyLabel({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0)' })).toBe('iPad Passkey');
        expect(resolvePasskeyLabel({ userAgent: 'Mozilla/5.0 (Linux; Android 14)' })).toBe('Android Passkey');
        expect(resolvePasskeyLabel({ userAgent: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64)' })).toBe('Linux Passkey');
        expect(resolvePasskeyLabel({ userAgent: '' })).toBe('Device Passkey');
        expect(extractAaguid(new Uint8Array(buildAuthenticatorData('fbfc3007-154e-4ecc-8c0b-6e020557d7bd')))).toBe('fbfc3007-154e-4ecc-8c0b-6e020557d7bd');
    });

    it('deduplicates case-insensitively', () => {
        expect(deduplicateLabel('YubiKey', ['yubikey'])).toBe('YubiKey (2)');
    });
});
