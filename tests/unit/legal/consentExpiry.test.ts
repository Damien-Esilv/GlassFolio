import { describe, it, expect, afterEach, vi } from 'vitest';
import { getConsent, isConsentExpired, resetConsent, setConsent } from '../../../src/services/consentService';
import { appStorage } from '../../../src/services/storage/appStorage';
import { CONSENT_STORAGE_KEY } from '../../../src/services/storage/storageKeys';

describe('consent expiry (13 months, E15)', () => {
  afterEach(() => {
    vi.useRealTimers();
    resetConsent();
  });

  it('keeps a recent choice and drops it once 13 months have passed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T10:00:00Z'));
    setConsent(true);

    vi.setSystemTime(new Date('2027-02-14T10:00:00Z'));
    expect(getConsent()?.analytics).toBe(true);

    vi.setSystemTime(new Date('2027-02-15T10:00:01Z'));
    expect(getConsent()).toBeNull();
  });

  it('asks again after expiry and stores the new choice', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T10:00:00Z'));
    setConsent(false);
    vi.setSystemTime(new Date('2028-01-01T00:00:00Z'));
    expect(getConsent()).toBeNull();

    setConsent(true);
    expect(getConsent()?.analytics).toBe(true);
  });

  it('treats an unreadable timestamp as expired', () => {
    expect(isConsentExpired('not-a-date')).toBe(true);
    appStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ version: 1, analytics: true, updatedAt: 'garbage' }));
    expect(getConsent()).toBeNull();
  });
});
