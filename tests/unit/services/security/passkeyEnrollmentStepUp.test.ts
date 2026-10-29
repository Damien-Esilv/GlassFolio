import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../src/services/security/authCapabilities', () => ({
    getAuthCapabilities: () => ({ passkeyMode: 'supabase-passkey' }),
}));

import { passkeyAccountService } from '../../../../src/services/security/passkeyAccountService';
import { authService } from '../../../../src/services/security/authService';
import { vaultService } from '../../../../src/services/security/vaultService';
import { passkeyService } from '../../../../src/services/security/passkeyService';
import { supabaseClient } from '../../../../src/services/supabase/supabaseClient';

const jwt = (aal: 'aal1' | 'aal2') => `h.${btoa(JSON.stringify({ aal }))}.s`;
const params = { user: { id: 'u1', email: 'a@b.c', name: 'A' }, label: 'Laptop', masterPassword: 'pw' };

describe('passkey enrollment step-up (the database treats a passkey as MFA-equivalent)', () => {
    let startRegistration: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(vaultService, 'verifyPassword').mockResolvedValue(true);
        vi.spyOn(passkeyService, 'listPasskeys').mockResolvedValue([]);
        startRegistration = vi.spyOn(supabaseClient, 'startPasskeyRegistration').mockRejectedValue(new Error('ceremony-started'));
    });

    const withToken = (aal: 'aal1' | 'aal2') => {
        (authService as unknown as { getActiveAccessToken: () => Promise<string> }).getActiveAccessToken = async () => jwt(aal);
    };

    it('refuses when the two-factor status cannot be read (fails closed)', async () => {
        withToken('aal1');
        vi.spyOn(supabaseClient, 'listMfaFactors').mockRejectedValue(new Error('network'));
        await expect(passkeyAccountService.register(params)).rejects.toThrow(/MFA_STEP_UP_REQUIRED/);
        expect(startRegistration).not.toHaveBeenCalled();
    });

    it('requires aal2 when a verified TOTP factor exists', async () => {
        withToken('aal1');
        vi.spyOn(supabaseClient, 'listMfaFactors').mockResolvedValue([{ id: 'f1', factor_type: 'totp', status: 'verified' }] as never);
        await expect(passkeyAccountService.register(params)).rejects.toThrow(/MFA_STEP_UP_REQUIRED/);
        expect(startRegistration).not.toHaveBeenCalled();
    });

    it('lets an aal2 session with TOTP start the ceremony', async () => {
        withToken('aal2');
        vi.spyOn(supabaseClient, 'listMfaFactors').mockResolvedValue([{ id: 'f1', factor_type: 'totp', status: 'verified' }] as never);
        await expect(passkeyAccountService.register(params)).rejects.toThrow('ceremony-started');
        expect(startRegistration).toHaveBeenCalled();
    });

    it('does not block accounts without TOTP', async () => {
        withToken('aal1');
        vi.spyOn(supabaseClient, 'listMfaFactors').mockResolvedValue([]);
        await expect(passkeyAccountService.register(params)).rejects.toThrow('ceremony-started');
        expect(startRegistration).toHaveBeenCalled();
    });
});
