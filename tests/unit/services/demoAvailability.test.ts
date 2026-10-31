/**
 * A local install offers the demo only when started for it, and then opens it once (TGLA-188).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { demoAvailability } from '../../../src/services/demoAvailability';

const configResponse = (demo: boolean) => ({
  ok: true,
  headers: { get: () => 'application/json' },
  json: async () => ({ demo }),
});

describe('demoAvailability (local mode)', () => {
  beforeEach(() => demoAvailability.reset());
  afterEach(() => vi.unstubAllGlobals());

  it('offers no demo on a normal launch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(configResponse(false)));
    expect(await demoAvailability.isDemoOffered()).toBe(false);
    expect(await demoAvailability.claimAutoStart()).toBe(false);
  });

  it('offers no demo when the local server cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await demoAvailability.isDemoOffered()).toBe(false);
  });

  it('opens the demo by itself once per page load when started with --demo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(configResponse(true)));
    expect(await demoAvailability.isDemoOffered()).toBe(true);
    expect(await demoAvailability.claimAutoStart()).toBe(true);
    expect(await demoAvailability.claimAutoStart()).toBe(false);
  });

  it('leaves the launch to the next caller when the first one went away (StrictMode remount)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(configResponse(true)));
    let firstMounted = true;
    const first = demoAvailability.claimAutoStart(() => firstMounted);
    firstMounted = false;
    expect(await first).toBe(false);
    expect(await demoAvailability.claimAutoStart()).toBe(true);
  });
});
