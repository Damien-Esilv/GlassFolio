import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ok,
  err,
  isOk,
  isErr,
  unwrap,
  unwrapErr,
  mapOk,
  mapErr,
  flatMap,
  tryCatch,
  ValidationError,
  StorageError,
  ImportParseError,
  NetworkError,
} from '../../../src/types/result';

describe('Result<T, E> Pattern — Pilier 3', () => {
  describe('ok() / err() factories', () => {
    it('creates a successful Ok result', () => {
      const result = ok(42);
      expect(result.success).toBe(true);
      expect(isOk(result)).toBe(true);
      expect(isErr(result)).toBe(false);
    });

    it('creates a failed Err result', () => {
      const result = err(new ValidationError('Amount required', 'amount'));
      expect(result.success).toBe(false);
      expect(isOk(result)).toBe(false);
      expect(isErr(result)).toBe(true);
    });

    it('preserves the wrapped value in Ok', () => {
      const val = { id: 'tx-1', amount: 100 };
      const result = ok(val);
      expect(unwrap(result)).toEqual(val);
    });

    it('preserves the error in Err', () => {
      const error = new StorageError('localStorage quota exceeded');
      const result = err(error);
      const unwrapped = unwrapErr(result);
      expect(unwrapped.code).toBe('STORAGE_ERROR');
      expect(unwrapped.message).toBe('localStorage quota exceeded');
    });
  });

  describe('Error hierarchy', () => {
    it('ValidationError has correct code and optional field', () => {
      const e = new ValidationError('Invalid date', 'date', { raw: 'notadate' });
      expect(e.code).toBe('VALIDATION_ERROR');
      expect(e.field).toBe('date');
      expect((e.details as any).raw).toBe('notadate');
    });

    it('StorageError has correct code', () => {
      const e = new StorageError('Write failed');
      expect(e.code).toBe('STORAGE_ERROR');
    });

    it('ImportParseError has correct code and field', () => {
      const e = new ImportParseError('Missing column', 'Date');
      expect(e.code).toBe('IMPORT_PARSE_ERROR');
      expect(e.field).toBe('Date');
    });

    it('NetworkError has correct code', () => {
      const e = new NetworkError('Request timeout');
      expect(e.code).toBe('NETWORK_ERROR');
    });
  });

  describe('mapOk / mapErr', () => {
    it('mapOk transforms the value of an Ok result', () => {
      const result = mapOk(ok(10), (n) => n * 2);
      expect(unwrap(result)).toBe(20);
    });

    it('mapOk passes through an Err result unchanged', () => {
      const error = new ValidationError('bad input');
      const result = mapOk(err(error), (n: number) => n * 2);
      expect(isErr(result)).toBe(true);
    });

    it('mapErr recovers from an error', () => {
      const errResult = err(new StorageError('quota exceeded'));
      const recovered = mapErr(errResult, (_e) => ok('fallback'));
      expect(isOk(recovered)).toBe(true);
      expect(unwrap(recovered)).toBe('fallback');
    });
  });

  describe('flatMap (chaining)', () => {
    it('chains two successful operations', () => {
      const result = flatMap(ok(5), (n) => ok(n * 3));
      expect(unwrap(result)).toBe(15);
    });

    it('short-circuits on first error', () => {
      const error = new ValidationError('fail early');
      const result = flatMap(err(error), (_n: number) => ok(999));
      expect(isErr(result)).toBe(true);
      expect(unwrapErr(result).message).toBe('fail early');
    });
  });

  describe('unwrap / unwrapErr', () => {
    it('unwrap throws on an Err result', () => {
      const result = err(new StorageError('error'));
      expect(() => unwrap(result)).toThrow('[unwrap]');
    });

    it('unwrapErr throws on an Ok result', () => {
      const result = ok('success');
      expect(() => unwrapErr(result)).toThrow('[unwrapErr]');
    });
  });

  describe('tryCatch', () => {
    it('wraps a successful async operation as Ok', async () => {
      const result = await tryCatch(async () => 42);
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBe(42);
    });

    it('wraps a thrown error as Err with UNKNOWN_ERROR', async () => {
      const result = await tryCatch(async () => {
        throw new Error('network down');
      });
      expect(isErr(result)).toBe(true);
      expect(unwrapErr(result).message).toBe('network down');
      expect(unwrapErr(result).code).toBe('UNKNOWN_ERROR');
    });

    it('uses custom onError to produce typed error', async () => {
      const result = await tryCatch(
        async () => { throw new Error('timeout'); },
        (e) => new NetworkError(e instanceof Error ? e.message : 'unknown')
      );
      expect(isErr(result)).toBe(true);
      const error = unwrapErr(result);
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.message).toBe('timeout');
    });
  });
});
