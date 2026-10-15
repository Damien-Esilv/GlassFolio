/**
 * AI Security Tools for GlassFolio Assistant & MCP (TGLA-043).
 *
 * Implements:
 *   - get_security_status (read-only): inspects vault, 2FA, passkeys, and audit log.
 *   - list_vault_secrets (read-only): lists third-party API providers configured (masked).
 *   - lock_vault (mutation, requiresConfirmation: true): locks vault immediately.
 *   - rotate_encryption_key (mutation, requiresConfirmation: true): rotates DEK and re-encrypts state.
 */

import { AIToolDefinition } from '../types';
import { vaultService } from '../../security/vaultService';
import { totpService } from '../../security/totpService';
import { passkeyService } from '../../security/passkeyService';
import { secretsService, SafeSecretItem } from '../../security/secretsService';
import { auditLogService, AuditLogEntry } from '../../security/auditLogService';

export const getSecurityStatusTool: AIToolDefinition<
  { includeAuditHistory?: boolean },
  {
    isInitialized: boolean;
    vaultStatus: string;
    encryptionAlgorithm: string;
    isTotpEnabled: boolean;
    passkeysCount: number;
    secretsCount: number;
    recentAuditEvents?: AuditLogEntry[];
  }
> = {
  name: 'get_security_status',
  description:
    'Inspect the current zero-knowledge security posture of GlassFolio (vault lock state, encryption algorithm, 2FA/TOTP status, registered passkeys count, and recent security audit events).',
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
    const isTotpEnabled = await totpService.isEnabled();
    const passkeys = await passkeyService.listPasskeys();
    const secrets = await secretsService.listSecrets();

    let recentAuditEvents: AuditLogEntry[] | undefined;
    if (params.includeAuditHistory !== false) {
      recentAuditEvents = await auditLogService.getEntries(5);
    }

    return {
      isInitialized,
      vaultStatus,
      encryptionAlgorithm: 'AES-256-GCM / PBKDF2-SHA256 (600,000 iters)',
      isTotpEnabled,
      passkeysCount: passkeys.length,
      secretsCount: secrets.length,
      recentAuditEvents,
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
    'Immediately lock the zero-knowledge vault, wiping all decrypted keys from memory. Requires explicit user confirmation.',
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
      message: 'Zero-knowledge vault locked successfully. Financial data is now protected.',
    };
  },
};

export const rotateEncryptionKeyTool: AIToolDefinition<
  { masterPassword: string },
  { success: boolean; message: string }
> = {
  name: 'rotate_encryption_key',
  description:
    'Rotate the zero-knowledge Data Encryption Key (DEK) and re-encrypt all stored records with a fresh AES-256-GCM key. Requires master password and human confirmation.',
  requiresConfirmation: true,
  parameters: {
    type: 'object',
    properties: {
      masterPassword: {
        type: 'string',
        description: 'The current master password to authorize re-wrapping of the new key.',
      },
    },
    required: ['masterPassword'],
  },
  execute: async (params) => {
    await vaultService.rotateDek(params.masterPassword);
    await auditLogService.record('dek_rotated', 'DEK rotated via AI Assistant');
    return {
      success: true,
      message: 'Data Encryption Key rotated and all sensitive records re-encrypted successfully.',
    };
  },
};
