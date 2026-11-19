import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  LocalVaultStorageProvider,
  LocalVaultClient,
} from '../../../src/services/storage/LocalVaultStorageProvider';
import { MAX_REQUEST_BYTES, VaultBatch } from '../../../src/services/storage/localVaultClient';
import { LocalStorageProvider } from '../../../src/types/storage';
import { installChunkReloadHandler } from '../../../src/services/storage/chunkReload';

describe('Offline / Partial-Batch Storage Resilience & Stale-Chunk Reload Guard (TGLA-212)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('LocalVaultStorageProvider Partial Multi-Chunk Batch Failure Recovery', () => {
    it('retains only uncommitted chunks when a large batch fails mid-flight and drains them on retry', async () => {
      const committedOnServer: Record<string, string> = {};
      let callCount = 0;

      const mockClient: LocalVaultClient = {
        fetchSnapshot: async () => ({
          status: 'ok',
          snapshot: { version: 1, revision: 0, updatedAt: null, records: {} },
        }),
        commitBatch: vi.fn(async (batch: VaultBatch) => {
          callCount += 1;
          // Chunk 1 succeeds, Chunk 2 fails on first flush attempt, then succeeds on retry!
          if (callCount === 2) {
            return false;
          }
          if (batch.set) {
            Object.assign(committedOnServer, batch.set);
          }
          return true;
        }),
      };

      const provider = new LocalVaultStorageProvider(new LocalStorageProvider(), mockClient);
      const connectRes = await provider.connect();
      expect(connectRes.mode).toBe('server');

      // Write two server-persisted keys whose combined payload exceeds MAX_REQUEST_BYTES
      // so sendOnce() splits them into 2 separate HTTP batch requests.
      const largeValueA = 'A'.repeat(Math.floor(MAX_REQUEST_BYTES * 0.6));
      const largeValueB = 'B'.repeat(Math.floor(MAX_REQUEST_BYTES * 0.6));

      provider.setItem('glassfolio_transactions', largeValueA);
      provider.setItem('glassfolio_positions', largeValueB);

      // First flush: chunk 1 commits, chunk 2 fails -> flush() returns false and keeps chunk 2 pending
      const firstFlushOk = await provider.flush();
      expect(firstFlushOk).toBe(false);
      expect(provider.getStatus().pending).toBe(1);
      expect(provider.getStatus().lastError).toBeTruthy();

      // In-memory reads remain 100% intact during offline/partial failure
      expect(provider.getItem('glassfolio_transactions')).toBe(largeValueA);
      expect(provider.getItem('glassfolio_positions')).toBe(largeValueB);

      // Second flush (reconnect): only the remaining uncommitted chunk is re-sent and succeeds
      const secondFlushOk = await provider.flush();
      expect(secondFlushOk).toBe(true);
      expect(provider.getStatus().pending).toBe(0);
      expect(provider.getStatus().lastError).toBeNull();
      expect(committedOnServer.glassfolio_transactions).toBe(largeValueA);
      expect(committedOnServer.glassfolio_positions).toBe(largeValueB);
    });
  });

  describe('installChunkReloadHandler Stale-Deployment Loop Prevention', () => {
    it('reloads once on vite:preloadError and suppresses repeat reloads within the 60s window', () => {
      const reloadSpy = vi.fn();
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: { ...window.location, reload: reloadSpy },
      });

      installChunkReloadHandler();

      const firstEvent = new Event('vite:preloadError', { cancelable: true });
      window.dispatchEvent(firstEvent);

      expect(firstEvent.defaultPrevented).toBe(true);
      expect(reloadSpy).toHaveBeenCalledTimes(1);

      // Immediate second preloadError within 60s must NOT reload again (prevents infinite reload loop)
      const secondEvent = new Event('vite:preloadError', { cancelable: true });
      window.dispatchEvent(secondEvent);

      expect(secondEvent.defaultPrevented).toBe(false);
      expect(reloadSpy).toHaveBeenCalledTimes(1);
    });
  });
});
