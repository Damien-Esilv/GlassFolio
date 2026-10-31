import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { antiBotService } from '../../../../src/services/security/antiBotService';
import { CryptoUnavailableError, deriveOAuthKek } from '../../../../src/services/security/crypto';
import { googleOidcService } from '../../../../src/services/security/googleOidcService';
import { passkeyService } from '../../../../src/services/security/passkeyService';
import { passkeyAccountService } from '../../../../src/services/security/passkeyAccountService';
import * as authCapabilities from '../../../../src/services/security/authCapabilities';
import { LocalAuthProvider, SupabaseAuthProvider } from '../../../../src/services/security/authService';
import { supabaseClient } from '../../../../src/services/supabase/supabaseClient';
import { userRepository } from '../../../../src/services/repositories';
import { appStorage } from '../../../../src/services/storage/appStorage';
import { isErr, isOk } from '../../../../src/types/result';
import type { User } from '../../../../src/types/domain';

const useServerPasskeys = (): void => {
  vi.spyOn(authCapabilities, 'getAuthCapabilities').mockReturnValue({
    ...authCapabilities.getAuthCapabilities(),
    passkeyMode: 'supabase-passkey',
  } as ReturnType<typeof authCapabilities.getAuthCapabilities>);
};

describe('security edge cases', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    appStorage.removeItem('gf_passkey_rp_id');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('antiBotService', () => {
    it('refuses a replayed challenge until the consumed list is cleared', async () => {
      antiBotService.clearConsumedChallenges();
      const powChallenge = antiBotService.createChallenge();
      const { nonce, hash } = await antiBotService.solveChallenge(powChallenge);
      const params = { honeypot: '', mountedAt: 0, submittedAt: 5000, powChallenge, powNonce: nonce, powHash: hash };
      const options = { skipTurnstile: true };

      expect(isOk(await antiBotService.verify(params, options))).toBe(true);
      expect(isErr(await antiBotService.verify(params, options))).toBe(true);

      antiBotService.clearConsumedChallenges();
      expect(isOk(await antiBotService.verify(params, options))).toBe(true);
    }, 20000);
  });

  describe('crypto', () => {
    it('fails explicitly when Web Crypto is unavailable (plain HTTP)', async () => {
      vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) });
      await expect(deriveOAuthKek('secret', 'AAAA')).rejects.toBeInstanceOf(CryptoUnavailableError);
    });
  });

  describe('googleOidcService', () => {
    it('offers Google sign-in only when a client id is configured', () => {
      const clientId = vi.spyOn(googleOidcService, 'getClientId');
      clientId.mockReturnValue('client-id.apps.example');
      expect(googleOidcService.isConfigured()).toBe(true);
      clientId.mockReturnValue('');
      expect(googleOidcService.isConfigured()).toBe(false);
      clientId.mockRestore();
      expect(typeof googleOidcService.getClientId()).toBe('string');
    });
  });

  describe('passkey relying party', () => {
    it('reports no passkey support without the WebAuthn API', async () => {
      vi.stubGlobal('PublicKeyCredential', undefined);
      expect(await passkeyService.isSupported()).toBe(false);
    });

    it('needs no server lookup in local mode', async () => {
      vi.spyOn(authCapabilities, 'getAuthCapabilities').mockReturnValue({
        ...authCapabilities.getAuthCapabilities(),
        passkeyMode: 'vault-prf',
      } as ReturnType<typeof authCapabilities.getAuthCapabilities>);
      const start = vi.spyOn(supabaseClient, 'startPasskeyAuthentication');
      expect(await passkeyAccountService.resolveServerRpId()).toBeUndefined();
      expect(start).not.toHaveBeenCalled();
    });

    it('reads the server RP ID once, then serves it from the cache', async () => {
      useServerPasskeys();
      passkeyService.rememberServerRpId(undefined);
      vi.spyOn(passkeyService, 'getRememberedServerRpId').mockReturnValueOnce(undefined);
      const start = vi.spyOn(supabaseClient, 'startPasskeyAuthentication').mockResolvedValue({
        options: { rpId: 'glassfolio.dev' },
      } as unknown as Awaited<ReturnType<typeof supabaseClient.startPasskeyAuthentication>>);

      expect(await passkeyAccountService.resolveServerRpId()).toBe('glassfolio.dev');
      expect(start).toHaveBeenCalledTimes(1);

      vi.restoreAllMocks();
      useServerPasskeys();
      expect(passkeyService.getRememberedServerRpId()).toBe('glassfolio.dev');
      const startAgain = vi.spyOn(supabaseClient, 'startPasskeyAuthentication');
      expect(await passkeyAccountService.resolveServerRpId()).toBe('glassfolio.dev');
      expect(startAgain).not.toHaveBeenCalled();
    });

    it('stays silent when the server cannot be reached before an unlock', async () => {
      useServerPasskeys();
      vi.spyOn(passkeyService, 'getRememberedServerRpId').mockReturnValue(undefined);
      vi.spyOn(supabaseClient, 'startPasskeyAuthentication').mockRejectedValue(new Error('offline'));
      expect(await passkeyAccountService.resolveServerRpId()).toBeUndefined();
    });
  });

  describe('auth providers', () => {
    it('has no email locale to sync in local mode', async () => {
      await expect(new LocalAuthProvider().syncEmailLocale('fr')).resolves.toBeUndefined();
    });

    it('starts Google re-authentication with the account email as a hint', async () => {
      vi.spyOn(userRepository, 'getUser').mockResolvedValue({ email: 'owner@example.com' } as User);
      const ceremony = vi.spyOn(googleOidcService, 'startCeremony').mockResolvedValue(undefined as never);
      await new SupabaseAuthProvider().startGoogleReauth('delete-account', { returnTo: '/settings' });
      expect(ceremony).toHaveBeenCalledWith(
        expect.objectContaining({ loginHint: 'owner@example.com', returnTo: '/settings' }),
      );
    });

    it('still starts re-authentication when the profile cannot be read', async () => {
      vi.spyOn(userRepository, 'getUser').mockRejectedValue(new Error('locked'));
      const ceremony = vi.spyOn(googleOidcService, 'startCeremony').mockResolvedValue(undefined as never);
      await new SupabaseAuthProvider().startGoogleReauth('delete-account');
      expect(ceremony).toHaveBeenCalledWith(expect.objectContaining({ loginHint: undefined }));
    });
  });
});
