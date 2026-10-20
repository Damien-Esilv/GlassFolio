import { describe, it, expect } from 'vitest';
import {
  validateBackupContent,
  sanitizeObject,
} from '../../../../src/services/import/backupRestoreService';

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
    expect(result.error).toContain("Format de collection invalide pour 'transactions'");
  });

  it('detects prototype pollution attempt in root data keys', () => {
    const payloadWithProtoKey = '{"version":"1.0.0","data":{"__proto__":[]}}';
    const result = validateBackupContent(payloadWithProtoKey);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Tentative de pollution de prototype détectée');
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

  it('marks checksumVerified true when a checksum is supplied', () => {
    const signedBackup = JSON.stringify({
      version: '1.0.0',
      checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      data: {
        transactions: [],
      },
    });

    const result = validateBackupContent(signedBackup);
    expect(result.valid).toBe(true);
    expect(result.checksumVerified).toBe(true);
  });
});
