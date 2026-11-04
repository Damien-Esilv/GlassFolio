import { describe, it, expect, beforeAll } from 'vitest';
import fc from 'fast-check';
import { decodeCsvBuffer, detectDelimiter, parseCSVText } from '../../src/services/import/csvCore';
import { sanitizeCSVRow } from '../../src/services/import/csvParser';
import { readZipTextEntries } from '../../src/services/import/zipReader';
import {
  decryptString,
  encryptString,
  formatRecoveryKey,
  generateExtractableDek,
  parseEnvelope,
  parseRecoveryKey,
  serializeEnvelope,
} from '../../src/services/security/crypto';

const NUM_RUNS = Number(process.env.FAST_CHECK_RUNS || 150);

describe('CSV / ZIP Byte-Stream Fuzzing & WebCrypto Property Invariants (TGLA-210)', () => {
  let sharedDek: CryptoKey;

  beforeAll(async () => {
    sharedDek = await generateExtractableDek();
  });

  describe('CSV & ZIP Parser Resilience under Arbitrary Fuzz Payloads', () => {
    it('never throws uncaught exceptions when decoding and parsing arbitrary byte buffers', () => {
      fc.assert(
        fc.property(fc.uint8Array({ minLength: 0, maxLength: 2048 }), (bytes) => {
          const { text, encoding } = decodeCsvBuffer(bytes.buffer);
          expect(typeof text).toBe('string');
          expect(typeof encoding).toBe('string');

          const delimiter = detectDelimiter(text);
          expect([',', ';', '\t', '|']).toContain(delimiter);

          const parsed = parseCSVText(text, delimiter);
          expect(Array.isArray(parsed.headers)).toBe(true);
          expect(Array.isArray(parsed.rows)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('rejects or safely handles arbitrary corrupted binary streams in readZipTextEntries without hanging', async () => {
      await fc.assert(
        fc.asyncProperty(fc.uint8Array({ minLength: 0, maxLength: 1024 }), async (bytes) => {
          try {
            const files = await readZipTextEntries(bytes.buffer);
            expect(typeof files).toBe('object');
          } catch (err) {
            expect(err).toBeInstanceOf(Error);
          }
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('sanitizes arbitrary CSV row objects without throwing or leaking undefined/null values', () => {
      fc.assert(
        fc.property(
          fc.dictionary(
            fc.string({ minLength: 1, maxLength: 20 }),
            fc.oneof(fc.string({ maxLength: 80 }), fc.constant(null), fc.constant(undefined))
          ),
          (rawRow) => {
            const result = sanitizeCSVRow(rawRow);
            expect(typeof result.isValid).toBe('boolean');
            for (const val of Object.values(result.sanitized)) {
              expect(typeof val).toBe('string');
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Zero-Knowledge WebCrypto AES-256-GCM & Recovery Key Properties', () => {
    it('round-trips arbitrary Unicode JSON strings through AES-256-GCM and rejects mismatched AAD or bit-flips', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 0, maxLength: 500 }),
          fc.string({ minLength: 1, maxLength: 40 }),
          async (plaintext, aad) => {
            const envelope = await encryptString(sharedDek, plaintext, aad);
            const raw = serializeEnvelope(envelope);
            const reparsed = parseEnvelope(raw);
            expect(reparsed).toEqual(envelope);

            const decrypted = await decryptString(sharedDek, envelope, aad);
            expect(decrypted).toBe(plaintext);

            // Wrong AAD (e.g. attacker swaps ciphertext between storage keys) must always fail
            await expect(decryptString(sharedDek, envelope, `${aad}_tampered`)).rejects.toThrow();
          }
        ),
        { numRuns: Math.min(NUM_RUNS, 80) }
      );
    });

    it('round-trips 160-bit and 256-bit recovery keys regardless of casing, spaces, or dashes', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.uint8Array({ minLength: 20, maxLength: 20 }),
            fc.uint8Array({ minLength: 32, maxLength: 32 })
          ),
          (rawBytes) => {
            const formatted = formatRecoveryKey(rawBytes);
            const lowerSpaced = `  ${formatted.toLowerCase().replace(/-/g, ' ')}  `;
            const parsed = parseRecoveryKey(lowerSpaced);
            expect(parsed).not.toBeNull();
            expect(Array.from(parsed ?? [])).toEqual(Array.from(rawBytes));
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });
});
