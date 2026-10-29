/**
 * Auth Error Mapper
 *
 * Translates errors raised by the auth stack (local vault, TOTP / email codes, passkeys,
 * Supabase Auth, anti-bot shield) into localized messages. Resolution order:
 *   1. typed errors (PasskeyError, vault errors, anti-bot ValidationError...)
 *   2. Supabase `error_code` / HTTP status (SupabaseRequestError)
 *   3. known service messages (local mode throws plain Errors)
 *   4. the caller's fallback key — raw (English) server text is never shown to the user.
 */

type Translate = (key: string, options?: Record<string, unknown>) => string;

interface MappedKey {
    key: string;
    params?: Record<string, unknown>;
}

/** Typed errors, matched by class name (avoids importing the whole security stack). */
const ERROR_NAME_KEYS: Record<string, string> = {
    ExistingVaultError: 'auth:signup.existingVaultError',
    InvalidVaultCredentialsError: 'common:errors.auth.invalidMasterPassword',
    VaultNotInitializedError: 'common:errors.auth.noVault',
    VaultLockedError: 'common:errors.auth.vaultLocked',
    VaultHeaderCorruptedError: 'common:errors.auth.vaultCorrupted',
    EmailNotConfirmedError: 'common:errors.auth.emailNotConfirmed',
    RecentSignInRequiredError: 'common:errors.auth.recentSignInRequired',
    CryptoUnavailableError: 'common:errors.auth.cryptoUnavailable',
};

/** Supabase Auth error codes (https://supabase.com/docs/guides/auth/debugging/error-codes). */
const SUPABASE_CODE_KEYS: Record<string, string> = {
    otp_expired: 'auth:verification.invalidOtp',
    otp_disabled: 'common:errors.auth.providerDisabled',
    invalid_credentials: 'common:errors.auth.invalidCredentials',
    email_not_confirmed: 'common:errors.auth.emailNotConfirmed',
    user_already_exists: 'common:errors.auth.emailExists',
    email_exists: 'common:errors.auth.emailExists',
    weak_password: 'auth:signup.passwordWeakError',
    same_password: 'common:errors.auth.samePassword',
    email_address_invalid: 'common:errors.auth.invalidEmail',
    signup_disabled: 'common:errors.auth.signupDisabled',
    email_provider_disabled: 'common:errors.auth.providerDisabled',
    captcha_failed: 'common:errors.auth.antiBot',
    over_email_send_rate_limit: 'common:errors.auth.rateLimited',
    over_request_rate_limit: 'common:errors.auth.rateLimited',
    over_sms_send_rate_limit: 'common:errors.auth.rateLimited',
    mfa_verification_failed: 'common:errors.auth.invalidTotp',
    mfa_verification_rejected: 'common:errors.auth.invalidTotp',
    mfa_challenge_expired: 'common:errors.auth.totpChallengeExpired',
    mfa_factor_not_found: 'common:errors.auth.noTotpFactor',
    mfa_factor_name_conflict: 'common:errors.auth.totpEnrollFailed',
    insufficient_aal: 'common:errors.auth.totpRequired',
    reauthentication_needed: 'common:errors.auth.recentSignInRequired',
    reauthentication_not_valid: 'auth:verification.invalidOtp',
    session_not_found: 'common:errors.auth.sessionExpired',
    session_expired: 'common:errors.auth.sessionExpired',
    refresh_token_not_found: 'common:errors.auth.sessionExpired',
    refresh_token_already_used: 'common:errors.auth.sessionExpired',
    bad_jwt: 'common:errors.auth.sessionExpired',
    flow_state_expired: 'auth:confirm.invalidLink',
    flow_state_not_found: 'auth:confirm.invalidLink',
    bad_code_verifier: 'auth:confirm.invalidLink',
    webauthn_verification_failed: 'common:errors.passkey.FAILED',
    webauthn_credential_not_found: 'common:errors.passkey.NOT_REGISTERED',
};

/** Messages thrown by local services (checked in order, lowercase). */
const MESSAGE_KEYS: Array<[RegExp, string]> = [
    [/verification link|invalid link|token_hash|missing or invalid pkce verifier|code verifier/, 'auth:confirm.invalidLink'],
    [/token has expired|otp_expired|expired or is invalid|invalid or expired/, 'auth:verification.invalidOtp'],
    [/two-factor authentication code or backup code/, 'common:errors.auth.invalidTotpOrBackup'],
    [/invalid two-factor authentication code|mfa verification failed/, 'common:errors.auth.invalidTotp'],
    [/code from your authenticator app is required|two-factor authentication code is required|mfa_step_up_required/, 'common:errors.auth.totpRequired'],
    [/no verified authenticator app/, 'common:errors.auth.noTotpFactor'],
    [/unable to (enroll|challenge) mfa factor|required to enable two-factor/, 'common:errors.auth.totpEnrollFailed'],
    [/unable to remove mfa factor/, 'common:errors.auth.totpRemoveFailed'],
    [/could not be opened with this password/, 'common:errors.auth.vaultPasswordMismatch'],
    [/invalid current password|current password is incorrect/, 'common:errors.auth.invalidCurrentPassword'],
    [/invalid master password/, 'common:errors.auth.invalidMasterPassword'],
    [/nist|weak/, 'auth:signup.passwordWeakError'],
    [/invalid email or password|invalid login credentials|invalid credentials/, 'common:errors.auth.invalidCredentials'],
    [/already exists with this email/, 'common:errors.auth.emailExistsPassword'],
    [/disabled for google oauth/, 'common:errors.auth.googleManaged'],
    [/sign-in is disabled/, 'common:errors.auth.providerDisabled'],
    [/could not be reached/, 'common:errors.auth.vaultUnreachable'],
    [/mfa_step_up_required/, 'common:errors.auth.mfaStepUpRequired'],
    [/google_client_id_not_configured/, 'common:errors.auth.googleNotConfigured'],
    [/google_vault_unlock_failed/, 'common:errors.auth.googleVaultUnlockFailed'],
    [/drive_key_missing/, 'common:errors.auth.driveKeyMissing'],
    [/drive_key_file/, 'common:errors.auth.driveKeyUnreadable'],
    [/not available in local mode/, 'common:errors.auth.localEmailUnavailable'],
    [/supabase is not configured|requires supabase to be configured/, 'common:errors.auth.cloudNotConfigured'],
    [/valid email address|email address required/, 'common:errors.auth.invalidEmail'],
    [/verify your email before/, 'common:errors.auth.emailNotConfirmed'],
    [/no vault exists on this device|vault is not initialized/, 'common:errors.auth.noVault'],
    [/session expired|session is required|session required|no verified signup is waiting|failed to refresh|active session already exists|session principal mismatch|belongs to another user account/, 'common:errors.auth.sessionExpired'],
    [/passkey belongs to another account/, 'common:errors.auth.passkeyOtherAccount'],
    [/confirm (this sign-in )?with one of your passkeys/, 'common:errors.auth.passkeyRequired'],
    [/this passkey could not be verified/, 'common:errors.passkey.FAILED'],
    [/cannot unlock (your|the) vault|prf extension unsupported/, 'common:errors.passkey.NO_PRF'],
    [/no passkey is registered/, 'common:errors.passkey.NOT_REGISTERED'],
    [/webauthn is not supported/, 'common:errors.passkey.UNSUPPORTED'],
    [/passkey registration was cancelled/, 'common:errors.passkey.CANCELLED'],
    [/password is required to delete/, 'common:errors.auth.passwordRequired'],
    [/confirmation text must match/, 'common:errors.auth.deleteConfirmationMismatch'],
    [/too many requests|rate limit|you can only request this after/, 'common:errors.auth.rateLimited'],
    [/failed to fetch|networkerror|load failed|network request failed/, 'common:errors.auth.network'],
];

const ANTI_BOT_FIELDS = new Set(['honeypot', 'timing', 'pow']);

function matchMessage(message: string): MappedKey | null {
    const lower = message.toLowerCase().trim();

    const lockout = lower.match(/account temporarily locked\. please wait (\d+) seconds/);
    if (lockout) return { key: 'common:errors.auth.accountLocked', params: { seconds: Number(lockout[1]) } };

    // Passkey endpoints surface the Supabase code as the message
    if (SUPABASE_CODE_KEYS[lower]) return { key: SUPABASE_CODE_KEYS[lower] };

    for (const [pattern, key] of MESSAGE_KEYS) {
        if (pattern.test(lower)) return { key };
    }
    return null;
}

function resolveKey(rawError: unknown): MappedKey | null {
    if (!rawError) return null;
    if (typeof rawError === 'string') return matchMessage(rawError);
    if (typeof rawError !== 'object') return null;

    const error = rawError as { name?: string; message?: string; code?: string; field?: string; status?: number };

    // 1. Typed errors (Result-style ValidationError is a plain object, not an Error)
    if (error.code === 'VALIDATION_ERROR') {
        if (error.field === 'captcha') return { key: 'common:errors.auth.captchaRequired' };
        if (error.field && ANTI_BOT_FIELDS.has(error.field)) return { key: 'common:errors.auth.antiBot' };
    }
    if (error.name === 'PasskeyError' && error.code) return { key: `common:errors.passkey.${error.code}` };
    if (error.name && ERROR_NAME_KEYS[error.name]) return { key: ERROR_NAME_KEYS[error.name] };

    // 2. Supabase error code / HTTP status
    if (error.name === 'SupabaseRequestError') {
        if (error.code && SUPABASE_CODE_KEYS[error.code]) return { key: SUPABASE_CODE_KEYS[error.code] };
        if (error.status === 429) return { key: 'common:errors.auth.rateLimited' };
        const byMessage = matchMessage(error.message || '');
        if (byMessage) return byMessage;
        if (error.status !== undefined && error.status >= 500) return { key: 'common:errors.auth.serverUnavailable' };
        return null;
    }

    // 3. Known service messages
    return typeof error.message === 'string' ? matchMessage(error.message) : null;
}

/**
 * Localized message for any auth-related error. Unknown errors use `fallbackKey`.
 */
export function mapAuthErrorMessage(
    rawError: unknown,
    t: Translate,
    fallbackKey: string = 'auth:signup.failedToSignup'
): string {
    const mapped = resolveKey(rawError);
    return mapped ? t(mapped.key, mapped.params) : t(fallbackKey);
}
