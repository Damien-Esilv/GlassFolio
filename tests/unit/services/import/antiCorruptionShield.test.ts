import { describe, it, expect } from 'vitest';
import {
  validateBackupContent,
  validateBackup,
  sanitizeObject,
} from '../../../../src/services/import/backupRestoreService';
import { computeBackupChecksum } from '../../../../src/services/import/backupIntegrity';

describe('Anti-Corruption & Prototype Pollution Shield', () => {
  it('strips dangerous prototype pollution keys (__proto__, constructor, prototype)', () => {
    const maliciousPayload = {
      transactions: [{ id: 'tx-1', amount: 100 }],
      __proto__: { isAdmin: true },
      constructor: { name: 'exploit' },
      prototype: { polluted: true },
      metadata: {
        __proto__: { injected: true },
        source: 'trusted',
      },
    };

    const sanitized = sanitizeObject(maliciousPayload) as any;

    expect(sanitized.__proto__).not.toHaveProperty('isAdmin');
    expect(sanitized.constructor).not.toHaveProperty('name', 'exploit');
    expect(sanitized.prototype).toBeUndefined();
    expect(sanitized.metadata.source).toBe('trusted');
    expect(sanitized.metadata.__proto__).not.toHaveProperty('injected');
  });

  it('rejects backup with invalid data structure or non-array collections', () => {
    const invalidPayload = JSON.stringify({
      version: '1.0.0',
      data: {
        transactions: 'not-an-array',
      },
    });

    const result = validateBackupContent(invalidPayload);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('invalid_collection');
    expect(result.errorParams?.collection).toBe('transactions');
  });

  it('detects prototype pollution attempt in root data keys', () => {
    const payloadWithProtoKey = '{"version":"1.0.0","data":{"__proto__":[]}}';
    const result = validateBackupContent(payloadWithProtoKey);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('prototype_pollution');
  });

  it('accepts valid backup files without requiring a SHA checksum (non-blocking for personal backups)', () => {
    const personalBackup = JSON.stringify({
      version: '1.0.0',
      exportedAt: '2026-10-19T10:00:00.000Z',
      schema: 'glassfolio-backup',
      data: {
        transactions: [{ id: 'tx-100', symbol: 'CW8.PA', amount: 500 }],
        positions: [{ symbol: 'CW8.PA', shares: 1 }],
      },
    });

    const result = validateBackupContent(personalBackup);
    expect(result.valid).toBe(true);
    expect(result.checksumVerified).toBe(false);
    expect(result.payload?.data.transactions).toHaveLength(1);
    expect(result.payload?.data.positions).toHaveLength(1);
  });

  it('does not claim verification from the mere presence of a checksum', () => {
    const result = validateBackupContent(JSON.stringify({ checksum: 'e3b0c442', data: { transactions: [{ id: 'tx-1' }] } }));
    expect(result.valid).toBe(true);
    expect(result.checksumVerified).toBe(false);
  });

  it('verifies a real SHA-256 checksum and survives re-indentation of the file', async () => {
    const data = { transactions: [{ id: 'tx-1', symbol: 'CW8.PA', amount: 5 }], goals: [] };
    const checksum = await computeBackupChecksum(data);
    const compact = JSON.stringify({ version: '1.0', checksum, data });
    const indented = JSON.stringify({ version: '1.0', checksum, data }, null, 4);

    expect((await validateBackup(compact)).checksumVerified).toBe(true);
    expect((await validateBackup(indented)).checksumVerified).toBe(true);
  });

  it('rejects a backup whose data was altered after export', async () => {
    const data = { transactions: [{ id: 'tx-1', amount: 5 }] };
    const checksum = await computeBackupChecksum(data);
    const tampered = JSON.stringify({ checksum, data: { transactions: [{ id: 'tx-1', amount: 5000 }] } });

    const result = await validateBackup(tampered);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('checksum_mismatch');
  });

  it('accepts older backups without checksum but does not mark them verified', async () => {
    const result = await validateBackup(JSON.stringify({ data: { transactions: [{ id: 'tx-1' }] } }));
    expect(result.valid).toBe(true);
    expect(result.checksumVerified).toBe(false);
  });
});
