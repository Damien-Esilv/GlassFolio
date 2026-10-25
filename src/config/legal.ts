/**
 * Legal documents configuration (E15).
 *
 * Single source for the values interpolated into the legal texts (the `legal` i18n namespace) and for
 * the acceptance proof stored on signup. Bump `LEGAL_DOCUMENTS_VERSION` / `LEGAL_DOCUMENTS_DATE`
 * whenever the Terms or the Privacy Policy change materially.
 */

export const LEGAL_DOCUMENTS_VERSION = '2026-10-25';
export const LEGAL_DOCUMENTS_DATE = '2026-10-25';
export const LEGAL_CONTACT_EMAIL = 'privacy@glassfolio.dev';
export const LEGAL_SOURCE_LICENSE = 'PolyForm-Noncommercial-1.0.0';

/** Consent to optional audience measurement is valid for at most 13 months (CNIL guidance). */
export const CONSENT_MAX_AGE_MONTHS = 13;

/** Processors listed in the Privacy Policy; labels live under `legal:privacy.subprocessors.<id>`. */
export const SUBPROCESSOR_IDS = [
  'supabase',
  'vercel',
  'resend',
  'github',
  'google',
  'marketData',
  'aiProviders',
] as const;

export type SubprocessorId = (typeof SUBPROCESSOR_IDS)[number];

/** Interpolation values shared by every legal text. */
export const LEGAL_TEXT_VARS = {
  email: LEGAL_CONTACT_EMAIL,
  version: LEGAL_DOCUMENTS_VERSION,
  date: LEGAL_DOCUMENTS_DATE,
} as const;

export interface LegalAcceptance {
  version: string;
  acceptedAt: string;
}

export const createLegalAcceptance = (now: Date = new Date()): LegalAcceptance => ({
  version: LEGAL_DOCUMENTS_VERSION,
  acceptedAt: now.toISOString(),
});
