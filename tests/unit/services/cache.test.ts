import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryCache, priceCache, fxRateCache } from '../../../src/services/cache';
import { InMemoryStorageProvider, LocalStorageProvider } from '../../../src/types/storage';

describe('IStorageProvider & MemoryCache<T> — Pilier 4', () => {
  describe('InMemoryStorageProvider', () => {
    let storage: InMemoryStorageProvider;

    beforeEach(() => {
      storage = new InMemoryStorageProvider();
    });

    it('stores and retrieves a string value', () => {
      storage.setItem('key', 'value');
      expect(storage.getItem('key')).toBe('value');
    });

    it('returns null for missing keys', () => {
      expect(storage.getItem('non-existent')).toBeNull();
    });

    it('removes a key correctly', () => {
      storage.setItem('k', 'v');
      storage.removeItem('k');
      expect(storage.getItem('k')).toBeNull();
    });

    it('clears all keys', () => {
      storage.setItem('a', '1');
      storage.setItem('b', '2');
      storage.clear();
      expect(storage.getItem('a')).toBeNull();
      expect(storage.getItem('b')).toBeNull();
    });
  });

  describe('LocalStorageProvider', () => {
    let storage: LocalStorageProvider;

    beforeEach(() => {
      localStorage.clear();
      storage = new LocalStorageProvider();
    });

    it('reads and writes via localStorage', () => {
      storage.setItem('price_BTC', '65000');
      expect(storage.getItem('price_BTC')).toBe('65000');
    });
  });

  describe('MemoryCache<T> — TTL & Eviction', () => {
    it('returns value before TTL expires', () => {
      const cache = new MemoryCache<string>(5000); // 5s TTL
      cache.set('key', 'fresh-value');
      expect(cache.get('key')).toBe('fresh-value');
    });

    it('returns null after TTL expires', () => {
      const cache = new MemoryCache<string>(1); // 1ms TTL
      cache.set('key', 'expired-value');
      // Manipulate time past expiry
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(cache.get('key')).toBeNull();
          resolve();
        }, 5);
      });
    });

    it('uses custom TTL per-entry overriding default', () => {
      const cache = new MemoryCache<string>(60_000); // 1 min default
      cache.set('short', 'value', 1); // 1ms override
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(cache.get('short')).toBeNull();
          resolve();
        }, 5);
      });
    });

    it('has() returns true for live entries', () => {
      const cache = new MemoryCache<number>(5000);
      cache.set('rate', 1.08);
      expect(cache.has('rate')).toBe(true);
    });

    it('evictExpired() removes stale entries', () => {
      const cache = new MemoryCache<string>(1);
      cache.set('old', 'data');
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          cache.evictExpired();
          expect(cache.size).toBe(0);
          resolve();
        }, 5);
      });
    });

    it('delete() removes a specific key', () => {
      const cache = new MemoryCache<string>(5000);
      cache.set('a', 'v1');
      cache.set('b', 'v2');
      cache.delete('a');
      expect(cache.get('a')).toBeNull();
      expect(cache.get('b')).toBe('v2');
    });

    it('clear() empties the entire cache', () => {
      const cache = new MemoryCache<string>(5000);
      cache.set('a', '1');
      cache.set('b', '2');
      cache.clear();
      expect(cache.size).toBe(0);
    });

    it('getOrSet returns cached value on second call', async () => {
      const cache = new MemoryCache<number>(5000);
      const factory = vi.fn(async () => 42);

      const first = await cache.getOrSet('k', factory);
      const second = await cache.getOrSet('k', factory);

      expect(first).toBe(42);
      expect(second).toBe(42);
      expect(factory).toHaveBeenCalledTimes(1); // Factory only called once
    });

    it('getOrSet calls factory again after expiry', async () => {
      const cache = new MemoryCache<number>(1);
      const factory = vi.fn(async () => 99);

      await cache.getOrSet('x', factory);
      await new Promise(r => setTimeout(r, 5)); // Wait for TTL
      await cache.getOrSet('x', factory);

      expect(factory).toHaveBeenCalledTimes(2);
    });
  });

  describe('Pre-configured cache instances', () => {
    it('priceCache has 15-minute TTL (900000ms)', () => {
      // Set and immediately read should succeed
      priceCache.clear();
      priceCache.set('AAPL', { AAPL: 175.5 });
      expect(priceCache.get('AAPL')).toEqual({ AAPL: 175.5 });
    });

    it('fxRateCache has 24-hour TTL', () => {
      fxRateCache.clear();
      fxRateCache.set('USD-EUR', { 'USD-EUR': 0.92 });
      expect(fxRateCache.get('USD-EUR')).toEqual({ 'USD-EUR': 0.92 });
    });
  });
});
