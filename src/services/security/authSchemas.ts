import { z } from 'zod';
import { Result, ok, err, ValidationError } from '../../types/result';

/**
 * Zod validation schemas for Supabase Auth, Vault Headers and Anti-Bot verification.
 * Enforces runtime contracts with Result<T, ValidationError> monadic returns.
 */

export const SupabaseUserDataSchema = z.object({
  id: z.string().min(1),
  email: z.string().email().optional(),
  email_confirmed_at: z.string().nullable().optional(),
  new_email: z.string().email().nullable().optional(),
  user_metadata: z.record(z.string(), z.unknown()).optional(),
  app_metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ValidatedSupabaseUserData = z.infer<typeof SupabaseUserDataSchema>;

export const SupabaseAuthSessionSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string(),
  expiresAt: z.number().positive(),
  user: z.object({
    id: z.string().min(1),
    email: z.string().email().optional(),
    email_confirmed_at: z.string().nullable().optional(),
    user_metadata: z.record(z.string(), z.unknown()).optional(),
    app_metadata: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type ValidatedSupabaseAuthSession = z.infer<typeof SupabaseAuthSessionSchema>;

export const KdfParamsSchema = z.object({
  algorithm: z.literal('pbkdf2-sha256'),
  iterations: z.number().int().min(1000).max(10000000),
  salt: z.string().min(8),
});

export const WrappedKeyEntrySchema = z.object({
  alg: z.literal('AES-KW'),
  wrapped: z.string().min(8),
  createdAt: z.string(),
  salt: z.string().optional(),
});

export const PasskeyWrappedKeyEntrySchema = WrappedKeyEntrySchema.extend({
  credentialId: z.string().min(1),
  label: z.string(),
});

export const VaultHeaderSchema = z.object({
  version: z.literal(1),
  kdf: KdfParamsSchema,
  dekAlgorithm: z.literal('AES-256-GCM'),
  wrappedKeys: z.object({
    password: WrappedKeyEntrySchema,
    recovery: WrappedKeyEntrySchema.nullable().optional(),
    passkeys: z.array(PasskeyWrappedKeyEntrySchema).default([]),
  }),
  passwordSlot: WrappedKeyEntrySchema.optional(),
  recoverySlot: WrappedKeyEntrySchema.nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  dekCreatedAt: z.string(),
  isDemo: z.boolean().optional(),
  authProvider: z.enum(['local', 'email', 'google', 'demo']).optional(),
  totpEnabled: z.boolean().optional(),
});

export type ValidatedVaultHeader = z.infer<typeof VaultHeaderSchema>;

export const AntiBotPayloadSchema = z.object({
  honeypot: z.string().max(0, 'Honeypot field must be empty'),
  mountedAt: z.number().positive(),
  submittedAt: z.number().positive(),
  powChallenge: z.string().min(8),
  powNonce: z.number().int().nonnegative(),
  powHash: z.string().min(16),
  captchaToken: z.string().optional(),
});

export type ValidatedAntiBotPayload = z.infer<typeof AntiBotPayloadSchema>;

/**
 * Validates untrusted data against a Zod schema, returning Result<T, ValidationError>.
 */
export function validateWithSchema<T>(
  schema: z.ZodType<T>,
  data: unknown,
  contextName = 'Validation'
): Result<T, ValidationError> {
  const parsed = schema.safeParse(data);
  if (parsed.success) {
    return ok(parsed.data);
  }

  const issues = parsed.error.issues;
  const firstMessage = issues[0]?.message || 'Invalid format';
  const firstPath = issues[0]?.path.join('.') || '';

  return err(
    new ValidationError(
      `[${contextName}] ${firstPath ? `${firstPath}: ` : ''}${firstMessage}`,
      firstPath,
      issues
    )
  );
}
