/**
 * AI Security Tools for GlassFolio Assistant & MCP (TGLA-043, TGLA-101).
 *
 * Implements:
 *   - get_security_status (read-only): inspects vault, 2FA, passkeys, assurance level and audit log.
 *   - list_auth_methods (read-only): lists configured authentication and MFA methods.
 *   - list_vault_secrets (read-only): lists third-party API providers configured (masked).
 *   - lock_vault (mutation, requiresConfirmation: true): locks vault immediately.
 *   - rotate_encryption_key (mutation, requiresConfirmation: true): initiates key rotation prompt.
 *   - get_email_verification_status (read-only): email verification state of the account (Epic E25).
 *   - resend_verification_email (mutation, requiresConfirmation: true): re-sends verification email.
 *   - get_storage_status (read-only): where local-mode data is stored and whether saves are healthy (Epic E33).
 *
 * Design Note: Enrollment or deletion of passkeys and TOTP factors are intentionally NOT
 * exposed as AI tools. In line with the security architecture, factor modification strictly
 * requires interactive biometric/physical user presence and step-up verification.
 */

import { AIToolDefinition } from '../types';
import { vaultService } from '../../security/vaultService';
import { mfaService } from '../../security/mfaService';
import { passkeyService } from '../../security/passkeyService';
import { secretsService, SafeSecretItem } from '../../security/secretsService';
import { auditLogService, AuditLogEntry } from '../../security/auditLogService';
import { userRepository } from '../../repositories';
import { authService } from '../../security/authService';
import { getAuthCapabilities } from '../../security/authCapabilities';
import { getDeploymentMode } from '../../../config/deployment';
import { getSessionAssurance } from '../../supabase/supabaseClient';
import { getLocalVaultProvider } from '../../storage/storageFactory';

/** Masks the local part of an email so the assistant never exposes the full address. */
const maskEmail = (email: string): string => {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
};

/** Sanitizes any email addresses from audit details to prevent leaking personal info to LLMs. */
const sanitizeAuditDetails = (text: string): string =>
  text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, (email) => maskEmail(email));

export const getSecurityStatusTool: AIToolDefinition<
  { includeAuditHistory?: boolean },
  {
    isInitialized: boolean;
    vaultStatus: string;
    encryptionAlgorithm: string;
    deploymentMode: 'local' | 'cloud';
    totpSource: 'supabase_factor' | 'vault_secret' | 'none';
    isTotpEnabled: boolean;
    passkeysCount: number;
    hasPasskeySlot: boolean;
    passkeyPrfSlotsCount: number;
    secretsCount: number;
    authProvider?: string;
    emailVerified?: boolean;
    hasRecoverySlot?: boolean;
    accountSetupComplete: boolean;
    aal: string;
    recentAuditEvents?: AuditLogEntry[];
  }
> = {
  name: 'get_security_status',
  description:
    'Inspect the current E2EE security posture of GlassFolio (vault lock state, encryption algorithm, 2FA/TOTP status, registered passkeys count, and recent security audit events with sanitized details).',
  requiresConfirmation: false,
  parameters: {
    type: 'object',
    properties: {
      includeAuditHistory: {
        type: 'boolean',
        description: 'Whether to include the last 5 security audit events. Defaults to true.',
      },
    },
  },
  execute: async (params) => {
    const isInitialized = vaultService.isInitialized();
    const vaultStatus = vaultService.getStatus();
    const mode = getDeploymentMode();
    const capabilities = getAuthCapabilities(mode);
    const totpStatus = await mfaService.getTotpStatus();
    const passkeys = await passkeyService.listPasskeys();
    const secrets = await secretsService.listSecrets();
    const user = await userRepository.getUser();
    const header = vaultService.getVaultHeader();
    const hasPasskeySlot = vaultService.hasPasskeySlot();

    const passkeyPrfSlotsCount = header?.wrappedKeys?.passkeys?.length ?? 0;
    const isTotpEnabled = totpStatus.enabled;
    const totpSource = !isTotpEnabled ? 'none' : (capabilities.serverMfa ? 'supabase_factor' : 'vault_secret');

    let aal: 'aal1' | 'aal2' | 'none' = 'none';
    if (authService.getActiveAccessToken) {
      const token = await authService.getActiveAccessToken();
      if (token) {
        const assurance = getSessionAssurance(token);
        if (assurance.aal === 'aal1' || assurance.aal === 'aal2') {
          aal = assurance.aal;
        }
      }
    }

    const accountSetupComplete = Boolean(
      isInitialized &&
      user &&
      (user.authProvider !== 'email' || user.emailVerified !== false)
    );

    let recentAuditEvents: AuditLogEntry[] | undefined;
    if (params.includeAuditHistory !== false) {
      const rawEntries = await auditLogService.getEntries(5);
      recentAuditEvents = rawEntries.map((entry) => ({
        ...entry,
        details: sanitizeAuditDetails(entry.details),
      }));
    }

    return {
      isInitialized,
      vaultStatus,
      encryptionAlgorithm: 'AES-256-GCM / PBKDF2-SHA256 (600,000 iters)',
      deploymentMode: mode,
      totpSource,
      isTotpEnabled,
      passkeysCount: passkeys.length,
      hasPasskeySlot,
      passkeyPrfSlotsCount,
      secretsCount: secrets.length,
      authProvider: user?.authProvider,
      emailVerified: user ? user.emailVerified !== false : false,
      hasRecoverySlot: Boolean(header?.wrappedKeys?.recovery || header?.recoverySlot),
      accountSetupComplete,
      aal,
      recentAuditEvents,
    };
  },
};

export const listAuthMethodsTool: AIToolDefinition<
  Record<string, never>,
  {
    deploymentMode: 'local' | 'cloud';
    authProvider: string;
    hasPassword: boolean;
    hasPasskeys: boolean;
    passkeysCount: number;
    hasPasskeyUnlockSlot: boolean;
    hasTotp: boolean;
    totpSource: 'supabase_factor' | 'vault_secret' | 'none';
    hasRecoveryKey: boolean;
    note: string;
  }
> = {
  name: 'list_auth_methods',
  description:
    'List all configured authentication and recovery methods for the current account (password, passkeys, TOTP 2FA, OAuth providers, and recovery key). Enrollment or removal of passkeys/TOTP cannot be performed via AI tools as it strictly requires biometric/physical user presence and interactive step-up validation.',
  requiresConfirmation: false,
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async () => {
    const mode = getDeploymentMode();
    const capabilities = getAuthCapabilities(mode);
    const user = await userRepository.getUser();
    const totpStatus = await mfaService.getTotpStatus();
    const passkeys = await passkeyService.listPasskeys();
    const header = vaultService.getVaultHeader();

    const hasTotp = totpStatus.enabled;
    const totpSource = !hasTotp ? 'none' : (capabilities.serverMfa ? 'supabase_factor' : 'vault_secret');

    return {
      deploymentMode: mode,
      authProvider: user?.authProvider || 'local',
      hasPassword: user?.authProvider !== 'google',
      hasPasskeys: passkeys.length > 0,
      passkeysCount: passkeys.length,
      hasPasskeyUnlockSlot: vaultService.hasPasskeySlot(),
      hasTotp,
      totpSource,
      hasRecoveryKey: Boolean(header?.wrappedKeys?.recovery || header?.recoverySlot),
      note: 'Modification of credentials or MFA factors requires physical user presence and step-up authentication.',
    };
  },
};

export const listVaultSecretsTool: AIToolDefinition<
  Record<string, never>,
  { count: number; secrets: SafeSecretItem[] }
> = {
  name: 'list_vault_secrets',
  description:
    'List all configured external API providers in the encrypted secrets vault (masked values only).',
  requiresConfirmation: false,
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async () => {
    const list = await secretsService.listSecrets();
    return {
      count: list.length,
      secrets: list,
    };
  },
};

export const lockVaultTool: AIToolDefinition<
  Record<string, never>,
  { success: boolean; message: string }
> = {
  name: 'lock_vault',
  description:
    'Immediately lock the encrypted vault, wiping all decrypted keys from memory. Requires explicit user confirmation.',
  requiresConfirmation: true,
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async () => {
    await auditLogService.record('vault_locked', 'Vault locked via AI Assistant');
    await vaultService.lock();
    return {
      success: true,
      message: 'Encrypted vault locked successfully. Financial data is now protected.',
    };
  },
};

export const rotateEncryptionKeyTool: AIToolDefinition<
  Record<string, never>,
  { success: boolean; requiresUserPresence: boolean; message: string }
> = {
  name: 'rotate_encryption_key',
  description:
    'Initiate rotation of the Data Encryption Key (DEK) to re-encrypt all stored records with a fresh AES-256-GCM key. For client-side envelope encryption security, the master password cannot be accepted via AI tool arguments; this action directs the user to the interactive in-app step-up re-wrapping flow.',
  requiresConfirmation: true,
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async () => {
    return {
      success: false,
      requiresUserPresence: true,
      message:
        'Key rotation requires interactive master password verification. Please complete rotation in Settings → Security.',
    };
  },
};

export const getEmailVerificationStatusTool: AIToolDefinition<
  Record<string, never>,
  { authProvider?: string; maskedEmail?: string; emailVerified: boolean; canResend: boolean }
> = {
  name: 'get_email_verification_status',
  description:
    'Check whether the email address of the current GlassFolio account is verified (email/password accounts receive a verification code and link by email).',
  requiresConfirmation: false,
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async () => {
    const user = await userRepository.getUser();
    const emailVerified = user ? user.emailVerified !== false : false;
    const canResend = Boolean(
      user &&
      user.authProvider === 'email' &&
      !emailVerified
    );
    return {
      authProvider: user?.authProvider,
      maskedEmail: user?.email ? maskEmail(user.email) : undefined,
      emailVerified,
      canResend,
    };
  },
};

export const resendVerificationEmailTool: AIToolDefinition<
  Record<string, never>,
  { success: boolean; message: string }
> = {
  name: 'resend_verification_email',
  description:
    'Send a new verification email (security code + confirmation link) to the current account address. Only for unverified email/password accounts. Requires explicit user confirmation.',
  requiresConfirmation: true,
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async () => {
    const user = await userRepository.getUser();
    if (!user || user.authProvider !== 'email' || user.emailVerified !== false) {
      return {
        success: false,
        message: 'No pending email verification for this account.',
      };
    }
    if (!authService.resendEmailVerification) {
      return { success: false, message: 'Email verification is not available in this mode.' };
    }
    try {
      await authService.resendEmailVerification(user.email);
      return {
        success: true,
        message: `Verification email sent to ${maskEmail(user.email)}.`,
      };
    } catch (err) {
      return {
        success: false,
        message: (err as Error).message || 'Failed to resend verification email.',
      };
    }
  },
};

export const getStorageStatusTool: AIToolDefinition<
  Record<string, never>,
  {
    deploymentMode: 'local' | 'cloud';
    storageLocation: 'local_server' | 'browser' | 'cloud';
    pendingChanges: number;
    lastSavedAt: string | null;
    saveError: boolean;
    legacyBrowserVaultIgnored: boolean;
  }
> = {
  name: 'get_storage_status',
  description:
    'Report where GlassFolio keeps the data in local mode (the local server / Docker volume, or only this browser) and whether recent changes were saved. Read-only; never exposes data or error internals.',
  requiresConfirmation: false,
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async () => {
    const deploymentMode = getDeploymentMode();
    const status = getLocalVaultProvider()?.getStatus();
    if (deploymentMode === 'cloud' || !status) {
      return {
        deploymentMode,
        storageLocation: 'cloud',
        pendingChanges: 0,
        lastSavedAt: null,
        saveError: false,
        legacyBrowserVaultIgnored: false,
      };
    }
    return {
      deploymentMode,
      storageLocation: status.mode === 'server' ? 'local_server' : 'browser',
      pendingChanges: status.pending,
      lastSavedAt: status.lastSavedAt,
      saveError: status.lastError !== null,
      legacyBrowserVaultIgnored: status.legacyBrowserVaultIgnored,
    };
  },
};
