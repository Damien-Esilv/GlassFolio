import { describe, it, expect } from 'vitest';
import {
    SupabaseUserDataSchema,
    SupabaseAuthSessionSchema,
    KdfParamsSchema,
    WrappedKeyEntrySchema,
    VaultHeaderSchema,
    AntiBotPayloadSchema,
    validateWithSchema,
} from '../../../../src/services/security/authSchemas';
import { isOk } from '../../../../src/types/result';

describe('authSchemas — Zod 4 Runtime Validation Contracts', () => {
    describe('SupabaseUserDataSchema', () => {
        it('validates correct Supabase user data', () => {
            const valid = {
                id: 'usr-123',
                email: 'test@example.com',
                email_confirmed_at: '2026-10-21T08:00:00Z',
                user_metadata: { name: 'Test' },
            };
            const res = validateWithSchema(SupabaseUserDataSchema, valid, 'UserData');
            expect(isOk(res)).toBe(true);
        });

        it('rejects missing or empty id', () => {
            const invalid = { id: '', email: 'test@example.com' };
            const res = validateWithSchema(SupabaseUserDataSchema, invalid, 'UserData');
            expect(isOk(res)).toBe(false);
        });
    });

    describe('SupabaseAuthSessionSchema', () => {
        it('validates correct session shape', () => {
            const valid = {
                accessToken: 'tok-123',
                refreshToken: 'ref-456',
                expiresAt: Date.now() + 3600000,
                user: { id: 'u-1', email: 'test@example.com' },
            };
            const res = validateWithSchema(SupabaseAuthSessionSchema, valid, 'Session');
            expect(isOk(res)).toBe(true);
        });

        it('rejects non-positive expiresAt', () => {
            const invalid = {
                accessToken: 'tok',
                refreshToken: 'ref',
                expiresAt: -1,
                user: { id: 'u-1' },
            };
            const res = validateWithSchema(SupabaseAuthSessionSchema, invalid, 'Session');
            expect(isOk(res)).toBe(false);
        });
    });

    describe('VaultHeaderSchema & KdfParamsSchema', () => {
        it('validates full VaultHeader shape', () => {
            const kdf = {
                algorithm: 'pbkdf2-sha256' as const,
                iterations: 600000,
                salt: 'salt12345678',
            };
            const wrappedKey = {
                alg: 'AES-KW' as const,
                wrapped: 'wrapped-bytes-1234',
                createdAt: new Date().toISOString(),
                salt: 'slot-salt-1234',
            };
            const header = {
                version: 1 as const,
                kdf,
                dekAlgorithm: 'AES-256-GCM' as const,
                wrappedKeys: {
                    password: wrappedKey,
                    recovery: wrappedKey,
                    passkeys: [],
                },
                passwordSlot: wrappedKey,
                recoverySlot: wrappedKey,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                dekCreatedAt: new Date().toISOString(),
                authProvider: 'email' as const,
                totpEnabled: false,
            };
            const res = validateWithSchema(VaultHeaderSchema, header, 'VaultHeader');
            expect(isOk(res)).toBe(true);
        });

        it('rejects KdfParams with too few iterations', () => {
            const invalidKdf = {
                algorithm: 'pbkdf2-sha256',
                iterations: 50,
                salt: 'salt1234',
            };
            const res = validateWithSchema(KdfParamsSchema, invalidKdf, 'KDF');
            expect(isOk(res)).toBe(false);
        });

        it('rejects WrappedKeyEntry without minimum length', () => {
            const invalidKey = {
                alg: 'AES-KW',
                wrapped: 'short',
                createdAt: new Date().toISOString(),
            };
            const res = validateWithSchema(WrappedKeyEntrySchema, invalidKey, 'Key');
            expect(isOk(res)).toBe(false);
        });
    });

    describe('AntiBotPayloadSchema', () => {
        it('validates clean payload', () => {
            const valid = {
                honeypot: '',
                mountedAt: Date.now() - 3000,
                submittedAt: Date.now(),
                powChallenge: 'challenge-12345678',
                powNonce: 42,
                powHash: '000abcdef1234567890',
            };
            const res = validateWithSchema(AntiBotPayloadSchema, valid, 'AntiBot');
            expect(isOk(res)).toBe(true);
        });

        it('rejects filled honeypot', () => {
            const invalid = {
                honeypot: 'bot-injected',
                mountedAt: Date.now() - 3000,
                submittedAt: Date.now(),
                powChallenge: 'challenge-12345678',
                powNonce: 42,
                powHash: '000abcdef1234567890',
            };
            const res = validateWithSchema(AntiBotPayloadSchema, invalid, 'AntiBot');
            expect(isOk(res)).toBe(false);
        });
    });
});
