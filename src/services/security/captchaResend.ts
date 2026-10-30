import { isTurnstileEnabled } from './antiBotService';

/** Raised when the captcha must be completed before an email can be resent */
export class CaptchaRequiredError extends Error {
    constructor() {
        super('captcha_required');
        this.name = 'CaptchaRequiredError';
    }
}

/**
 * Captcha token for a verification email resend. When Turnstile protects the auth API, Supabase
 * refuses a resend without a fresh token (each token is single use).
 */
export function captchaTokenForResend(token: string | undefined): string | undefined {
    if (isTurnstileEnabled() && !token) throw new CaptchaRequiredError();
    return token;
}
