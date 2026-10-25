/**
 * Auth error translation (login, TOTP 2FA, email codes, passkeys, anti-bot).
 * Guard: every user-facing error thrown by the auth services maps to an i18n key that exists in
 * both locales, so no raw English text reaches the screen.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { mapAuthErrorMessage } from '../../../../src/services/security/authErrorMapper';
import { SupabaseRequestError } from '../../../../src/services/supabase/supabaseClient';
import { PasskeyError } from '../../../../src/services/security/passkeyService';
import { InvalidVaultCredentialsError, ExistingVaultError } from '../../../../src/services/security/vaultTypes';
import { ValidationError } from '../../../../src/types/result';

const ROOT = resolve(__dirname, '../../../..');
const FALLBACK = 'test:fallback';
const keyOf = (error: unknown): string => mapAuthErrorMessage(error, key => key, FALLBACK);

const locale = (lang: string, ns: string): Record<string, unknown> =>
    JSON.parse(readFileSync(resolve(ROOT, `locales/${lang}/${ns}.json`), 'utf-8'));

const hasKey = (lang: string, fullKey: string): boolean => {
    const [ns, path] = fullKey.split(':');
    let node: unknown = locale(lang, ns);
    for (const part of path.split('.')) {
        if (!node || typeof node !== 'object') return false;
        node = (node as Record<string, unknown>)[part];
    }
    return typeof node === 'string' && node.length > 0;
};

/** Internal / developer errors that never reach a sign-in screen. */
const INTERNAL_MESSAGES = [
    /^unsupported kdf/i, /^invalid kdf/i, /^invalid base32/i, /^pow solution/i, /^vault header is missing/i,
    /^vault must be unlocked/i, /^master password is required to enroll/i, /^secret value cannot be empty/i,
    /^re-authentication is unavailable/i, /^vault recovery is not supported/i,
];

const thrownMessages = (file: string): string[] => {
    const source = readFileSync(resolve(ROOT, file), 'utf-8');
    const literals = [...source.matchAll(/throw new Error\('([^']+)'\)/g)].map(m => m[1]);
    const constants = [...source.matchAll(/^const [A-Z_]+ = '([^']+)';/gm)].map(m => m[1]);
    return [...literals, ...constants];
};

describe('mapAuthErrorMessage', () => {
    it.each([
        'src/services/security/authService.ts',
        'src/services/security/totpService.ts',
        'src/services/security/stepUpService.ts',
        'src/services/security/passkeyAccountService.ts',
        'src/services/security/passkeyService.ts',
        'src/services/supabase/supabaseClient.ts',
    ])('translates every user-facing error thrown in %s', file => {
        const untranslated = thrownMessages(file)
            .filter(message => !INTERNAL_MESSAGES.some(pattern => pattern.test(message)))
            .filter(message => /[a-z]/.test(message) && message.includes(' '))
            .filter(message => keyOf(new Error(message)) === FALLBACK);
        expect(untranslated).toEqual([]);
    });

    it('maps Supabase error codes (2FA, email codes, rate limits) before their English text', () => {
        expect(keyOf(new SupabaseRequestError('Token has expired or is invalid', 403, 'otp_expired'))).toBe('auth:verification.invalidOtp');
        expect(keyOf(new SupabaseRequestError('Invalid TOTP code entered', 422, 'mfa_verification_failed'))).toBe('common:errors.auth.invalidTotp');
        expect(keyOf(new SupabaseRequestError('For security purposes, you can only request this after 37 seconds.', 429, 'over_email_send_rate_limit'))).toBe('common:errors.auth.rateLimited');
        expect(keyOf(new SupabaseRequestError('Email not confirmed', 400, 'email_not_confirmed'))).toBe('common:errors.auth.emailNotConfirmed');
        expect(keyOf(new SupabaseRequestError('Invalid login credentials', 400, 'invalid_credentials'))).toBe('common:errors.auth.invalidCredentials');
        expect(keyOf(new SupabaseRequestError('Something new', 429))).toBe('common:errors.auth.rateLimited');
        expect(keyOf(new SupabaseRequestError('Upstream error', 503))).toBe('common:errors.auth.serverUnavailable');
        expect(keyOf(new SupabaseRequestError('Unknown problem', 400))).toBe(FALLBACK);
    });

    it('maps typed errors and anti-bot rejections', () => {
        expect(keyOf(new PasskeyError('CANCELLED', 'x'))).toBe('common:errors.passkey.CANCELLED');
        expect(keyOf(new InvalidVaultCredentialsError())).toBe('common:errors.auth.invalidMasterPassword');
        expect(keyOf(new ExistingVaultError())).toBe('auth:signup.existingVaultError');
        expect(keyOf(new ValidationError('Submission too fast (120ms). Please take your time.', 'timing'))).toBe('common:errors.auth.antiBot');
        expect(keyOf(new TypeError('Load failed'))).toBe('common:errors.auth.network');
    });

    it('interpolates the lockout delay', () => {
        expect(mapAuthErrorMessage(new Error('Account temporarily locked. Please wait 42 seconds.'), (key, params) => `${key}:${params?.seconds}`))
            .toBe('common:errors.auth.accountLocked:42');
    });

    it('never shows raw English for unknown errors', () => {
        expect(keyOf(new Error('Some unexpected internal failure'))).toBe(FALLBACK);
    });

    it('every key the mapper can return exists in English and French', () => {
        const source = readFileSync(resolve(ROOT, 'src/services/security/authErrorMapper.ts'), 'utf-8');
        const keys = new Set([...source.matchAll(/'((?:auth|security|common):[A-Za-z.]+)'/g)].map(m => m[1]));
        ['UNSUPPORTED', 'NO_SLOT', 'NO_PRF', 'NOT_REGISTERED', 'CANCELLED', 'FAILED'].forEach(code => keys.add(`common:errors.passkey.${code}`));
        const missing = [...keys].flatMap(key => ['en', 'fr'].filter(lang => !hasKey(lang, key)).map(lang => `${lang}:${key}`));
        expect(missing).toEqual([]);
    });
});
