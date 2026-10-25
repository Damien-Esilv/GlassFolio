/**
 * Tests — src/services/exportService.ts
 * Covers: objectsToCSV, CSV Formula Injection mitigation, generateBackupData
 */

import { describe, it, expect, vi } from 'vitest';
import {
  objectsToCSV,
  generateBackupData,
  exportTransactionsCSV,
  exportTransactionsJSON,
  exportBackupJSON,
  exportRGPDZip
} from '../../../src/services/exportService';
import { appStorage } from '../../../src/services/storage/appStorage';

describe('exportService - objectsToCSV', () => {
  it('returns empty string for empty array', () => {
    expect(objectsToCSV([])).toBe('');
  });

  it('converts basic items to CSV string', () => {
    const items = [
      { id: '1', name: 'Account A', balance: 100 },
      { id: '2', name: 'Account B', balance: 250 }
    ];
    const csv = objectsToCSV(items);
    expect(csv).toContain('id,name,balance');
    expect(csv).toContain('1,Account A,100');
    expect(csv).toContain('2,Account B,250');
  });

  it('sanitizes formula injection triggers in string fields', () => {
    const items = [
      { id: '1', label: '=1+1', note: '+SUM(A1:A10)' },
      { id: '2', label: '-100_payload', note: '@EXCEL' },
      { id: '3', label: '\tTAB_INJECT', note: '\rCARRIAGE_RETURN' }
    ];
    const csv = objectsToCSV(items);

    expect(csv).toContain("'=1+1");
    expect(csv).toContain("'+SUM(A1:A10)");
    expect(csv).toContain("'-100_payload");
    expect(csv).toContain("'@EXCEL");
    expect(csv).toContain("'\tTAB_INJECT");
    expect(csv).toContain("'\rCARRIAGE_RETURN");
  });

  it('preserves numeric types without prefixing single quotes', () => {
    const items = [
      { id: 1, amount: -50.25, bonus: 10 }
    ];
    const csv = objectsToCSV(items);
    expect(csv).toContain('1,-50.25,10');
    expect(csv).not.toContain("'-50.25");
  });

  it('handles quotes and special characters in values', () => {
    const items = [
      { id: '1', description: 'Item with "quotes" and, commas' }
    ];
    const csv = objectsToCSV(items);
    expect(csv).toContain('"Item with ""quotes"" and, commas"');
  });

  it('handles null and undefined values in rows', () => {
    const items = [
      { id: '1', name: 'Account A', extra: null, missing: undefined }
    ];
    const csv = objectsToCSV(items);
    expect(csv).toContain('1,Account A,,');
  });

  it('serializes nested objects and arrays cleanly', () => {
    const items = [
      { id: '1', tags: ['crypto', 'staked'], meta: { key: 'value' } }
    ];
    const csv = objectsToCSV(items);
    expect(csv).toContain('"[""crypto"",""staked""]"');
    expect(csv).toContain('"{""key"":""value""}"');
  });
});

describe('exportService - generateBackupData', () => {
  it('generates a structured backup payload with full account data', () => {
    appStorage.setItem('glassfolio_user', JSON.stringify({
      id: 'u-export-1',
      email: 'alex@example.com',
      masterPasswordHash: 'secret-hash',
      authSalt: 'secret-salt',
      preferences: { theme: 'night', currency: 'EUR' }
    }));
    appStorage.setItem('glassfolio_gamification_v1', JSON.stringify({
      xp: 450,
      level: 3,
      streaks: 5
    }));
    appStorage.setItem('glassfolio_ai_settings_v1', JSON.stringify({
      model: 'gpt-4o',
      apiKey: 'sk-secret-key-123',
      language: 'fr'
    }));
    appStorage.setItem('glassfolio_ai_chats_v1', JSON.stringify([
      { id: 'chat-1', title: 'Fiscalité' }
    ]));
    appStorage.setItem('glassfolio_security_audit_log', JSON.stringify([
      { id: 'log-1', action: 'login' }
    ]));

    const payload = generateBackupData();
    expect(payload.version).toBe('1.0');
    expect(payload.schema).toBe('transfer');
    expect(payload.exportedBy).toBe('GlassFolio-v1');
    expect(new Date(payload.exportedAt).valueOf()).not.toBeNaN();
    expect(typeof payload.data).toBe('object');

    // Verify comprehensive non-financial entities are exported and sanitized
    const data = payload.data as Record<string, any[]>;
    expect(Array.isArray(data.userProfile)).toBe(true);
    expect(data.userProfile[0].id).toBe('u-export-1');
    expect(data.userProfile[0].masterPasswordHash).toBeUndefined();
    expect(data.userProfile[0].authSalt).toBeUndefined();

    expect(Array.isArray(data.gamification)).toBe(true);
    expect(data.gamification[0].xp).toBe(450);

    expect(Array.isArray(data.aiSettings)).toBe(true);
    expect(data.aiSettings[0].apiKey).toBeUndefined();

    expect(Array.isArray(data.aiConversations)).toBe(true);
    expect(data.aiConversations[0].id).toBe('chat-1');

    expect(Array.isArray(data.securityAuditLogs)).toBe(true);
    expect(data.securityAuditLogs[0].id).toBe('log-1');
  });

  it('triggers transactions-only exports without errors', async () => {
    // Mock document.createElement & click for downloadFile helper
    const clickMock = vi.fn();
    const linkMock = { href: '', download: '', click: clickMock };
    vi.spyOn(document, 'createElement').mockReturnValue(linkMock as any);
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => linkMock as any);
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => linkMock as any);
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();

    await exportTransactionsCSV();
    expect(clickMock).toHaveBeenCalled();
    expect(linkMock.download).toContain('glassfolio-transactions-');
    expect(linkMock.download).toContain('.csv');

    clickMock.mockClear();
    await exportTransactionsJSON();
    expect(clickMock).toHaveBeenCalled();
    expect(linkMock.download).toContain('glassfolio-transactions-');
    expect(linkMock.download).toContain('.json');

    clickMock.mockClear();
    await exportBackupJSON();
    expect(clickMock).toHaveBeenCalled();
    expect(linkMock.download).toContain('glassfolio-backup-');

    clickMock.mockClear();
    await exportRGPDZip();
    expect(clickMock).toHaveBeenCalled();
    expect(linkMock.download).toContain('glassfolio-data-export-');
  });
});
