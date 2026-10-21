/**
 * Tests — src/services/exportService.ts
 * Covers: objectsToCSV, CSV Formula Injection mitigation, generateBackupData
 */

import { describe, it, expect } from 'vitest';
import { objectsToCSV, generateBackupData } from '../../../src/services/exportService';

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
      { id: '3', label: '\tTAB_INJECT', note: '\rCARRIAGE_RETURN' },
      { id: '4', label: '|cmd|\' /C calc\'!A1', note: '%SUM(B1:B10)' }
    ];
    const csv = objectsToCSV(items);

    expect(csv).toContain("'=1+1");
    expect(csv).toContain("'+SUM(A1:A10)");
    expect(csv).toContain("'-100_payload");
    expect(csv).toContain("'@EXCEL");
    expect(csv).toContain("'\tTAB_INJECT");
    expect(csv).toContain("'\rCARRIAGE_RETURN");
    expect(csv).toContain("'|cmd|' /C calc'!A1");
    expect(csv).toContain("'%SUM(B1:B10)");
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
  it('generates a structured backup payload', () => {
    const payload = generateBackupData();
    expect(payload.version).toBe('1.0');
    expect(payload.schema).toBe('transfer');
    expect(payload.exportedBy).toBe('GlassFolio-v1');
    expect(new Date(payload.exportedAt).valueOf()).not.toBeNaN();
    expect(typeof payload.data).toBe('object');
  });
});
