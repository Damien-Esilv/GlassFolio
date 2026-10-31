import { describe, it, expect, beforeEach } from 'vitest';
import {
    generateTotpCode,
    verifyTotpCode,
    generateTotpSecret,
    generateTotpUri,
    generateBackupCodes,
    verifyBackupCode,
    totpService,
} from '../../../../src/services/security/totpService';
import { constantTimeCompare, toBase32, utf8Encode } from '../../../../src/services/security/encoding';
import { appStorage } from '../../../../src/services/storage/appStorage';

describe('totpService (RFC 6238 & Anti-Replay)', () => {
    beforeEach(() => {
        appStorage.clear();
    });

    // RFC 6238 official HMAC-SHA1 test vector secret: ASCII "12345678901234567890" (20 bytes)
    const rfcSecret = toBase32(utf8Encode('12345678901234567890'));

    it('matches official RFC 6238 test vectors for HMAC-SHA1', async () => {
        // T = 59s -> 287082
        const code59 = await generateTotpCode(rfcSecret, 59 * 1000);
        expect(code59).toBe('287082');

        // T = 1111111109s -> 081804
        const code1111111109 = await generateTotpCode(rfcSecret, 1111111109 * 1000);
        expect(code1111111109).toBe('081804');

        // T = 1111111111s -> 050471
        const code1111111111 = await generateTotpCode(rfcSecret, 1111111111 * 1000);
        expect(code1111111111).toBe('050471');

        // T = 1234567890s -> 005924
        const code1234567890 = await generateTotpCode(rfcSecret, 1234567890 * 1000);
        expect(code1234567890).toBe('005924');

        // T = 2000000000s -> 279037
        const code2000000000 = await generateTotpCode(rfcSecret, 2000000000 * 1000);
        expect(code2000000000).toBe('279037');
    });

    it('generates random Base32 secrets and standard otpauth URIs', () => {
        const secret = generateTotpSecret(20);
        expect(secret).toMatch(/^[A-Z2-7]{32}$/);

        const uri = generateTotpUri('alex@glassfolio.com', secret, 'GlassFolio');
        expect(uri).toContain('otpauth://totp/GlassFolio:alex%40glassfolio.com');
        expect(uri).toContain(`secret=${secret}`);
        expect(uri).toContain('issuer=GlassFolio');
        expect(uri).toContain('period=30');
    });

    it('verifies TOTP token within tolerance window (±30s)', async () => {
        const now = 1700000000 * 1000;
        const currentCode = await generateTotpCode(rfcSecret, now);
        const pastCode = await generateTotpCode(rfcSecret, now - 30 * 1000);
        const futureCode = await generateTotpCode(rfcSecret, now + 30 * 1000);
        const tooOldCode = await generateTotpCode(rfcSecret, now - 90 * 1000);

        // Current code passes
        const resCurrent = await verifyTotpCode(rfcSecret, currentCode, { timestampMs: now });
        expect(resCurrent.valid).toBe(true);

        // Past code (-30s) passes with tolerance 1
        const resPast = await verifyTotpCode(rfcSecret, pastCode, { timestampMs: now, toleranceSteps: 1 });
        expect(resPast.valid).toBe(true);

        // Future code (+30s) passes with tolerance 1
        const resFuture = await verifyTotpCode(rfcSecret, futureCode, { timestampMs: now, toleranceSteps: 1 });
        expect(resFuture.valid).toBe(true);

        // Too old code fails
        const resTooOld = await verifyTotpCode(rfcSecret, tooOldCode, { timestampMs: now, toleranceSteps: 1 });
        expect(resTooOld.valid).toBe(false);
    });

    it('rejects submitting the exact same valid 6-digit TOTP code twice in the same 30s window (Anti-Replay)', async () => {
        // Enroll TOTP
        const enrollment = await totpService.initEnrollment('alex@glassfolio.com');
        const now = Date.now();
        // Confirm enrollment using code at previous drift step (-30s)
        const enrollCode = await generateTotpCode(enrollment.secret, now - 30 * 1000);

        const confirmed = await totpService.confirmEnrollment(
            enrollment.secret,
            enrollCode,
            enrollment.hashedBackupCodes
        );
        expect(confirmed).toBe(true);

        // Generate current step code
        const currentCode = await generateTotpCode(enrollment.secret, now);

        // Attempt 1: Submitting valid code within window succeeds
        const firstAttempt = await totpService.verify(currentCode);
        expect(firstAttempt).toBe(true);

        // Attempt 2: Replaying the EXACT same valid code within the same 30-second window MUST be rejected
        const replayAttempt = await totpService.verify(currentCode);
        expect(replayAttempt).toBe(false);
    });

    it('stores backup codes hashed (SHA-256), accepts them once, and permanently consumes them', async () => {
        const { plainCodes, hashedCodes } = await generateBackupCodes(10);
        expect(plainCodes).toHaveLength(10);
        expect(hashedCodes).toHaveLength(10);
        expect(plainCodes[0]).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

        // Hashed codes are Base64 SHA-256 (32 bytes -> 44 chars)
        expect(hashedCodes[0].length).toBe(44);

        // First use succeeds
        const firstCode = plainCodes[0];
        const res1 = await verifyBackupCode(firstCode, hashedCodes);
        expect(res1.valid).toBe(true);
        expect(res1.remainingHashes).toHaveLength(9);

        // Second use of same backup code fails
        const resReplay = await verifyBackupCode(firstCode, res1.remainingHashes);
        expect(resReplay.valid).toBe(false);
        expect(resReplay.remainingHashes).toHaveLength(9);

        // Bogus code fails
        const resInvalid = await verifyBackupCode('INVALID-CODE', hashedCodes);
        expect(resInvalid.valid).toBe(false);
    });

    it('compares strings in constant time via constantTimeCompare', () => {
        expect(constantTimeCompare('287082', '287082')).toBe(true);
        expect(constantTimeCompare('287082', '287083')).toBe(false);
        expect(constantTimeCompare('short', 'longer-string')).toBe(false);
        expect(constantTimeCompare('', '')).toBe(true);
    });
});
