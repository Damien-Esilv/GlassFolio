/**
 * A verification email resend carries a fresh captcha token when Turnstile is on (TGLA-188).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => { vi.resetModules(); vi.doUnmock('../../../../src/services/security/antiBotService'); });

const load = async (enabled: boolean) => {
  vi.doMock('../../../../src/services/security/antiBotService', () => ({ isTurnstileEnabled: () => enabled }));
  return import('../../../../src/services/security/captchaResend');
};

describe('captchaTokenForResend', () => {
  it('requires a token when Turnstile protects the auth API', async () => {
    const { captchaTokenForResend, CaptchaRequiredError } = await load(true);
    expect(() => captchaTokenForResend(undefined)).toThrow(CaptchaRequiredError);
    expect(captchaTokenForResend('tok')).toBe('tok');
  });

  it('sends without a token when Turnstile is off', async () => {
    const { captchaTokenForResend } = await load(false);
    expect(captchaTokenForResend(undefined)).toBeUndefined();
  });
});
