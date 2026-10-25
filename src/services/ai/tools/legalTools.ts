/**
 * AI Legal & Privacy Tools for GlassFolio Assistant & MCP (Epic E15).
 *
 * Implements:
 *   - get_privacy_status (read-only): legal documents in force, contact, cookie consent state and
 *     where the user can exercise GDPR rights.
 *   - export_gdpr_archive (requiresConfirmation: true): downloads the GDPR access / portability
 *     archive in the user's browser. The archive is never returned to the model.
 *
 * Design Note: account deletion is intentionally NOT exposed as an AI tool. It is irreversible and
 * requires a fresh interactive step-up (password, MFA / passkey) in Settings > Data & Backups, so
 * an assistant must only point the user to that screen.
 */

import { AIToolDefinition } from '../types';
import { getDeploymentMode } from '../../../config/deployment';
import { LEGAL_CONTACT_EMAIL, LEGAL_DOCUMENTS_VERSION } from '../../../config/legal';
import { getConsent } from '../../consentService';
import { canExportAccountData, exportRGPDZip } from '../../exportService';

const LEGAL_DOCUMENT_PATHS = {
  legalNotice: '/legal',
  privacyPolicy: '/privacy',
  termsOfUse: '/terms',
  cookies: '/cookies',
  accessibility: '/accessibility',
} as const;

export interface PrivacyStatus {
  deploymentMode: 'local' | 'cloud';
  documentsVersion: string;
  documents: typeof LEGAL_DOCUMENT_PATHS;
  contactEmail: string;
  consent: { status: 'unset' | 'accepted' | 'refused'; updatedAt?: string };
  dataRights: {
    exportAvailable: boolean;
    exportLocation: string;
    deletionLocation: string;
  };
}

export const getPrivacyStatusTool: AIToolDefinition<Record<string, never>, PrivacyStatus> = {
  name: 'get_privacy_status',
  description:
    'Get the legal and privacy status of GlassFolio: version and paths of the legal documents, the privacy contact, the current cookie / audience-measurement consent, and where to exercise GDPR rights (export and account deletion).',
  requiresConfirmation: false,
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async () => {
    const consent = getConsent();
    return {
      deploymentMode: getDeploymentMode(),
      documentsVersion: LEGAL_DOCUMENTS_VERSION,
      documents: LEGAL_DOCUMENT_PATHS,
      contactEmail: LEGAL_CONTACT_EMAIL,
      consent: consent
        ? { status: consent.analytics ? 'accepted' : 'refused', updatedAt: consent.updatedAt }
        : { status: 'unset' },
      dataRights: {
        exportAvailable: canExportAccountData(),
        exportLocation: 'Settings > Data & Backups > GDPR export',
        deletionLocation: 'Settings > Data & Backups > Delete my account',
      },
    };
  },
};

export const exportGdprArchiveTool: AIToolDefinition<
  Record<string, never>,
  { success: boolean; message: string }
> = {
  name: 'export_gdpr_archive',
  description:
    'Download the GDPR access / portability archive (profile, consent, JSON backup and CSV files) of the current real account in the browser. Not available for the demo account. Requires explicit user confirmation. The archive content is never returned to the assistant.',
  requiresConfirmation: true,
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async () => {
    if (!canExportAccountData()) {
      return {
        success: false,
        message: 'Export unavailable: the demo account holds no personal data.',
      };
    }
    await exportRGPDZip();
    return {
      success: true,
      message: 'The GDPR archive was downloaded in the browser.',
    };
  },
};
