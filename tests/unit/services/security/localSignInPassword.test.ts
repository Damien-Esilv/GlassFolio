import { describe, it, expect, beforeEach } from 'vitest';
import { LocalAuthProvider } from '../../../../src/services/security/authService';
import { vaultService } from '../../../../src/services/security/vaultService';
import { userRepository } from '../../../../src/services/repositories';

const PASSWORD = 'Local-Sign-In-Key-2026!#xx';

describe('local sign-in always checks the password (TGLA-188)', () => {
    beforeEach(async () => {
        localStorage.clear();
        await vaultService.resetVault();
        await userRepository.clearUser();
    });

    it('refuses a wrong password even while the vault is already open', async () => {
        const provider = new LocalAuthProvider();
        await provider.signUp('owner@example.test', PASSWORD, 'Owner');
        expect(vaultService.isUnlocked()).toBe(true);

        await expect(provider.signIn('owner@example.test', 'not-the-password')).rejects.toThrow(/invalid email or password/i);
        await expect(provider.signIn('owner@example.test', PASSWORD)).resolves.toMatchObject({ user: { email: 'owner@example.test' } });
    });
});
