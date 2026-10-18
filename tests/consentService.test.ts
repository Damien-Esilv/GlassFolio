import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  consentService,
  getConsent,
  setConsent,
  resetConsent,
  subscribeConsent,
  trackPublicEvent,
  openConsentPreferences,
  subscribeConsentPreferencesOpen,
} from '../src/services/consentService';
import { appStorage } from '../src/services/storage/appStorage';
import { CONSENT_STORAGE_KEY } from '../src/services/storage/storageKeys';
import * as deploymentModule from '../src/config/deployment';

describe('GDPR consentService', () => {
  beforeEach(() => {
    resetConsent();
    vi.restoreAllMocks();
  });

  it('returns null when no consent has been recorded', () => {
    expect(getConsent()).toBeNull();
    expect(appStorage.getItem(CONSENT_STORAGE_KEY)).toBeNull();
  });

  it('records opt-in consent with version 1 and ISO timestamp', () => {
    const record = setConsent(true);
    expect(record.version).toBe(1);
    expect(record.analytics).toBe(true);
    expect(typeof record.updatedAt).toBe('string');
    expect(new Date(record.updatedAt).getTime()).not.toBeNaN();

    const stored = getConsent();
    expect(stored).toEqual(record);
  });

  it('records refusal consent', () => {
    const record = setConsent(false);
    expect(record.version).toBe(1);
    expect(record.analytics).toBe(false);

    const stored = getConsent();
    expect(stored?.analytics).toBe(false);
  });

  it('notifies subscribers upon consent update and reset', () => {
    const listener = vi.fn();
    const unsub = subscribeConsent(listener);

    setConsent(true);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ version: 1, analytics: true })
    );

    resetConsent();
    expect(listener).toHaveBeenCalledWith(null);

    unsub();
  });

  it('notifies open preferences subscribers when openConsentPreferences is called', () => {
    const openListener = vi.fn();
    const unsub = subscribeConsentPreferencesOpen(openListener);

    openConsentPreferences();
    expect(openListener).toHaveBeenCalledTimes(1);

    unsub();
  });

  it('strictly blocks event tracking in local deployment mode', () => {
    vi.spyOn(deploymentModule, 'getDeploymentMode').mockReturnValue('local');
    setConsent(true);

    const tracked = trackPublicEvent('test_event');
    expect(tracked).toBe(false);
  });

  it('strictly blocks event tracking when user has not opted in or has refused', () => {
    vi.spyOn(deploymentModule, 'getDeploymentMode').mockReturnValue('cloud');

    // Case A: Unset
    expect(trackPublicEvent('test_event')).toBe(false);

    // Case B: Explicit refusal
    setConsent(false);
    expect(trackPublicEvent('test_event')).toBe(false);
  });

  it('tracks public event when opted in on cloud mode with analytics ID', () => {
    vi.spyOn(deploymentModule, 'getDeploymentMode').mockReturnValue('cloud');
    setConsent(true);
    vi.stubEnv('VITE_ANALYTICS_ID', 'GF-TEST-ID');

    const tracked = trackPublicEvent('showcase_view', { page: 'landing' });
    expect(tracked).toBe(true);

    const events = consentService.getRecordedPublicEvents();
    expect(events.length).toBeGreaterThan(0);
    expect(events[events.length - 1].eventName).toBe('showcase_view');
    expect(events[events.length - 1].props).toEqual({ page: 'landing' });
    expect(events[events.length - 1].analyticsId).toBe('GF-TEST-ID');

    vi.unstubAllEnvs();
  });
});

