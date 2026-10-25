import { describe, it, expect, vi, beforeEach } from 'vitest';

const exportState = vi.hoisted(() => ({ allowed: false, exported: 0 }));

vi.mock('../../../../../src/services/exportService', () => ({
  canExportAccountData: () => exportState.allowed,
  exportRGPDZip: async () => {
    exportState.exported += 1;
  },
}));

import { aiToolRegistry } from '../../../../../src/services/ai/aiToolRegistry';
import '../../../../../src/services/ai/tools';
import { exportGdprArchiveTool, getPrivacyStatusTool } from '../../../../../src/services/ai/tools/legalTools';
import { resetConsent, setConsent } from '../../../../../src/services/consentService';
import { LEGAL_CONTACT_EMAIL, LEGAL_DOCUMENTS_VERSION } from '../../../../../src/config/legal';

describe('legal AI tools (E15)', () => {
  beforeEach(() => {
    exportState.allowed = false;
    exportState.exported = 0;
    resetConsent();
  });

  it('registers both tools and requires confirmation only for the export', () => {
    expect(aiToolRegistry.getTool('get_privacy_status')).toBeDefined();
    expect(aiToolRegistry.getTool('export_gdpr_archive')).toBeDefined();
    expect(getPrivacyStatusTool.requiresConfirmation).toBe(false);
    expect(exportGdprArchiveTool.requiresConfirmation).toBe(true);
  });

  it('never exposes account deletion to the assistant', () => {
    const names = aiToolRegistry.getAllTools().map(tool => tool.name);
    expect(names.filter(name => /(delete|erase|remove|close).*account|account.*(delete|erase)/.test(name))).toEqual([]);
  });

  it('reports documents, contact, consent and rights locations', async () => {
    setConsent(true);
    const status = await getPrivacyStatusTool.execute({}, {});
    expect(status.documentsVersion).toBe(LEGAL_DOCUMENTS_VERSION);
    expect(status.contactEmail).toBe(LEGAL_CONTACT_EMAIL);
    expect(status.consent.status).toBe('accepted');
    expect(status.documents.privacyPolicy).toBe('/privacy');
    expect(status.dataRights.exportAvailable).toBe(false);
  });

  it('refuses the export for the demo account and runs it for a real one', async () => {
    const refused = await exportGdprArchiveTool.execute({}, {});
    expect(refused.success).toBe(false);
    expect(exportState.exported).toBe(0);

    exportState.allowed = true;
    const done = await exportGdprArchiveTool.execute({}, {});
    expect(done.success).toBe(true);
    expect(exportState.exported).toBe(1);
    expect(JSON.stringify(done)).not.toContain('transactions');
  });
});
