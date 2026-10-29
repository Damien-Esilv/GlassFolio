import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseAuthProvider } from '../../../../src/services/security/authService';
import { vaultService } from '../../../../src/services/security/vaultService';
import { supabaseClient } from '../../../../src/services/supabase/supabaseClient';
import { deviceVaultKeyStore } from '../../../../src/services/security/deviceVaultKeyStore';
import { userRepository } from '../../../../src/services/repositories';

const PASSWORD = 'Str0ng!Passphrase#2026';
const SESSION = {
    accessToken: 'sb-at',
    refreshToken: 'sb-rt',
    expiresAt: Date.now() + 3_600_000,
    user: { id: 'cloud-u1', email: 'cloud@example.test' },
};
const profile = {
    id: 'cloud-u1',
    email: 'cloud@example.test',
    name: 'Cloud User',
    authProvider: 'email' as const,
    preferences: { theme: 'night' as const, currency: 'EUR', notifications: true, language: 'en' as const, dateFormat: 'DD/MM/YYYY' as const },
    xp: 0,
    level: 1,
};

type Internals = { persistSession(s: unknown): void };

describe('cloud sign-out and account deletion (password account)', () => {
    let auth: SupabaseAuthProvider;

    beforeEach(async () => {
        vi.restoreAllMocks();
        auth = new SupabaseAuthProvider();
        await vaultService.resetVault();
        await deviceVaultKeyStore.clearAll();
        localStorage.clear();
        await vaultService.setup(PASSWORD, { authProvider: 'email' });
        await userRepository.saveUser(profile);
        (auth as unknown as Internals).persistSession(SESSION);
        vi.spyOn(supabaseClient, 'signOut').mockResolvedValue(undefined);
    });

    it('signs out: the server session is closed, the stored session is dropped and the vault locks', async () => {
        await auth.signOut();

        expect(supabaseClient.signOut).toHaveBeenCalledWith('sb-at');
        expect(localStorage.getItem('gf_sb_session')).toBeNull();
        expect(vaultService.isUnlocked()).toBe(false);
        // the encrypted data stays on the device: signing out is not deleting
        expect(vaultService.isInitialized()).toBe(true);
    });

    it('deletes nothing with a wrong password', async () => {
        const del = vi.spyOn(supabaseClient, 'deleteOwnAccount').mockResolvedValue(undefined);

        await expect(auth.deleteAccountPermanently({ password: 'wrong-password' })).rejects.toThrow(/master password/i);

        expect(del).not.toHaveBeenCalled();
        expect(vaultService.isInitialized()).toBe(true);
        expect(localStorage.getItem('gf_sb_session')).not.toBeNull();
    });

    it('deletes the account on the server, then wipes the vault, the profile and the session', async () => {
        const order: string[] = [];
        vi.spyOn(supabaseClient, 'deleteOwnAccount').mockImplementation(async (token) => { order.push(`server:${token}`); });
        vi.spyOn(vaultService, 'resetVault').mockImplementation(async () => { order.push('vault'); });

        await auth.deleteAccountPermanently({ password: PASSWORD });

        expect(order).toEqual(['server:sb-at', 'vault']);
        expect(await userRepository.getUser()).toBeNull();
        expect(localStorage.getItem('gf_sb_session')).toBeNull();
        expect(supabaseClient.signOut).toHaveBeenCalled();
    });

    it('keeps the local data when the server refuses the deletion', async () => {
        vi.spyOn(supabaseClient, 'deleteOwnAccount').mockRejectedValue(new Error('reauthentication_required'));

        await expect(auth.deleteAccountPermanently({ password: PASSWORD })).rejects.toThrow('reauthentication_required');

        expect(vaultService.isInitialized()).toBe(true);
        expect(await userRepository.getUser()).not.toBeNull();
        expect(localStorage.getItem('gf_sb_session')).not.toBeNull();
    });
});
