import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
    antiBotService,
    getTurnstileSiteKey,
    isTurnstileEnabled,
} from '../../../../src/services/security/antiBotService';
import { isOk, isErr } from '../../../../src/types/result';
import * as deploymentModule from '../../../../src/config/deployment';

describe('antiBotService & WebCrypto Proof-of-Work (Epic E22)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('creates a well-formed Proof-of-Work challenge with valid timestamp', () => {
        const challenge = antiBotService.createChallenge();
        expect(challenge).toBeDefined();
        const parts = challenge.split(':');
        expect(parts).toHaveLength(3);
        expect(parts[0]).toBe('gf-pow');

        const timestamp = parseInt(parts[1], 36);
        expect(Number.isFinite(timestamp)).toBe(true);
        expect(Math.abs(Date.now() - timestamp)).toBeLessThan(5000);
    });

    it('solves challenge with WebCrypto and verifies successfully', async () => {
        const challenge = antiBotService.createChallenge();
        const solution = await antiBotService.solveChallenge(challenge);

        expect(solution.hash.startsWith('000')).toBe(true);
        expect(typeof solution.nonce).toBe('number');

        const res = await antiBotService.verify({
            honeypot: '',
            mountedAt: Date.now() - 2000,
            submittedAt: Date.now(),
            powChallenge: challenge,
            powNonce: solution.nonce,
            powHash: solution.hash,
        }, { skipTurnstile: true });

        expect(res.success).toBe(true);
    });

    it('rejects honeypot filled by automated bots', async () => {
        const res = await antiBotService.verify({
            honeypot: 'spam-bot-input',
            mountedAt: Date.now() - 2000,
            submittedAt: Date.now(),
            powChallenge: 'c',
            powNonce: 0,
            powHash: '000abc',
        }, { skipPow: true, skipTurnstile: true });

        expect(res.success).toBe(false);
        if (isErr(res)) {
            expect(res.error.field).toBe('honeypot');
        }
    });

    it('rejects instant submissions faster than minDurationMs (default 1500ms)', async () => {
        const now = Date.now();
        const res = await antiBotService.verify({
            honeypot: '',
            mountedAt: now - 500, // 500ms elapsed
            submittedAt: now,
            powChallenge: 'c',
            powNonce: 0,
            powHash: '000abc',
        }, { skipPow: true, skipTurnstile: true });

        expect(res.success).toBe(false);
        if (isErr(res)) {
            expect(res.error.field).toBe('timing');
        }
    });

    it('rejects expired Proof-of-Work challenge older than 10 minutes', async () => {
        // Create an old challenge timestamped 15 minutes ago
        const oldTimestamp = Date.now() - 15 * 60 * 1000;
        const oldChallenge = `gf-pow:${oldTimestamp.toString(36)}:dGVzdHJhbmRvbQ==`;

        const solution = await antiBotService.solveChallenge(oldChallenge);

        const res = await antiBotService.verify({
            honeypot: '',
            mountedAt: Date.now() - 2000,
            submittedAt: Date.now(),
            powChallenge: oldChallenge,
            powNonce: solution.nonce,
            powHash: solution.hash,
        }, { skipTurnstile: true });

        expect(res.success).toBe(false);
        if (isErr(res)) {
            expect(res.error.field).toBe('pow');
            expect(res.error.message).toContain('Invalid Proof-of-Work');
        }
    });

    it('prevents replay attack: consuming the same challenge twice is rejected', async () => {
        const challenge = antiBotService.createChallenge();
        const solution = await antiBotService.solveChallenge(challenge);

        const params = {
            honeypot: '',
            mountedAt: Date.now() - 2000,
            submittedAt: Date.now(),
            powChallenge: challenge,
            powNonce: solution.nonce,
            powHash: solution.hash,
        };

        // First verification succeeds
        const first = await antiBotService.verify(params, { skipTurnstile: true });
        expect(first.success).toBe(true);

        // Second verification with the exact same challenge fails (replay prevention)
        const second = await antiBotService.verify(params, { skipTurnstile: true });
        expect(second.success).toBe(false);
        if (isErr(second)) {
            expect(second.error.field).toBe('pow');
            expect(second.error.message).toContain('already used');
        }
    });

    it('disables Turnstile in local mode or showcase app target', () => {
        vi.spyOn(deploymentModule, 'getDeploymentMode').mockReturnValue('local');
        expect(isTurnstileEnabled()).toBe(false);

        vi.spyOn(deploymentModule, 'getDeploymentMode').mockReturnValue('cloud');
        vi.spyOn(deploymentModule, 'getAppTarget').mockReturnValue('showcase');
        expect(isTurnstileEnabled()).toBe(false);
    });

    it('enforces captcha token when Turnstile is enabled in cloud app mode', async () => {
        vi.spyOn(deploymentModule, 'getDeploymentMode').mockReturnValue('cloud');
        vi.spyOn(deploymentModule, 'getAppTarget').mockReturnValue('app');

        // Mock site key present
        const originalEnv = process.env.VITE_TURNSTILE_SITE_KEY;
        process.env.VITE_TURNSTILE_SITE_KEY = '0x4AAAAAAFnXmKVTMTdpJDW5';

        try {
            expect(isTurnstileEnabled()).toBe(true);
            expect(getTurnstileSiteKey()).toBe('0x4AAAAAAFnXmKVTMTdpJDW5');

            const challenge = antiBotService.createChallenge();
            const solution = await antiBotService.solveChallenge(challenge);

            // Missing captchaToken fails
            const withoutCaptcha = await antiBotService.verify({
                honeypot: '',
                mountedAt: Date.now() - 2000,
                submittedAt: Date.now(),
                powChallenge: challenge,
                powNonce: solution.nonce,
                powHash: solution.hash,
            });
            expect(withoutCaptcha.success).toBe(false);
            if (isErr(withoutCaptcha)) {
                expect(withoutCaptcha.error.field).toBe('captcha');
            }

            // Providing captchaToken with fresh challenge succeeds
            const challenge2 = antiBotService.createChallenge();
            const solution2 = await antiBotService.solveChallenge(challenge2);

            const withCaptcha = await antiBotService.verify({
                honeypot: '',
                mountedAt: Date.now() - 2000,
                submittedAt: Date.now(),
                powChallenge: challenge2,
                powNonce: solution2.nonce,
                powHash: solution2.hash,
                captchaToken: 'mock-valid-turnstile-token',
            });
            expect(withCaptcha.success).toBe(true);
        } finally {
            process.env.VITE_TURNSTILE_SITE_KEY = originalEnv;
        }
    });
});
