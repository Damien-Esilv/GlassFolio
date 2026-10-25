/**
 * Auth Error Mapper
 *
 * Translates raw backend / Supabase Auth error strings and codes
 * into localized i18n messages without hardcoding UI texts.
 */

export function mapAuthErrorMessage(
    rawError: unknown,
    t: (key: string, options?: Record<string, unknown>) => string,
    fallbackKey: string = 'auth:signup.failedToSignup'
): string {
    if (!rawError) return t(fallbackKey);

    if (rawError instanceof Error && rawError.name === 'ExistingVaultError') {
        return t('auth:signup.existingVaultError');
    }

    const message = rawError instanceof Error ? rawError.message : String(rawError);
    const lower = message.toLowerCase();

    if (
        lower.includes('token has expired') ||
        lower.includes('otp_expired') ||
        lower.includes('expired or is invalid') ||
        lower.includes('invalid or expired')
    ) {
        return t('auth:verification.invalidOtp');
    }

    if (lower.includes('invalid link') || lower.includes('token_hash')) {
        return t('auth:confirm.invalidLink');
    }

    if (lower.includes('weak') || lower.includes('nist')) {
        return t('auth:signup.passwordWeakError');
    }

    if (lower.includes('invalid login credentials') || lower.includes('invalid credentials')) {
        return t('auth:login.failedToLogin');
    }

    return message;
}
