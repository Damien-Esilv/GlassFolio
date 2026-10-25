/**
 * GDPR / CNIL Consent Manager & Opt-in Public Analytics Service (TGLA-057).
 *
 * Strictly uses `appStorage` with `CONSENT_STORAGE_KEY` ('gf_consent_v1').
 * Enforces Privacy-by-Design:
 *  - Zero analytics tracking before explicit opt-in (`getConsent() === null`)
 *  - Zero analytics tracking if refused (`analytics === false`)
 *  - Zero analytics tracking in `local` self-hosted deployment mode
 *  - A stored choice expires after 13 months and is asked again (`isConsentExpired`)
 */

import { getDeploymentMode } from '../config/deployment';
import { CONSENT_MAX_AGE_MONTHS } from '../config/legal';
import { appStorage } from './storage/appStorage';
import { CONSENT_STORAGE_KEY } from './storage/storageKeys';

export interface ConsentRecord {
  version: 1;
  analytics: boolean;
  updatedAt: string;
}

export interface RecordedPublicEvent {
  eventName: string;
  props?: Record<string, string>;
  timestamp: string;
  analyticsId: string;
}

type ConsentListener = (consent: ConsentRecord | null) => void;
type PreferencesOpenListener = () => void;

const consentListeners = new Set<ConsentListener>();
const preferencesOpenListeners = new Set<PreferencesOpenListener>();
const recordedEvents: RecordedPublicEvent[] = [];

function getAnalyticsId(): string {
  const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as { env?: Record<string, string | undefined> }).env : undefined;
  const procEnv = typeof process !== 'undefined' ? process.env : undefined;
  return metaEnv?.VITE_ANALYTICS_ID?.trim() || procEnv?.VITE_ANALYTICS_ID?.trim() || '';
}

function notifyConsentListeners(record: ConsentRecord | null): void {
  consentListeners.forEach((listener) => {
    try {
      listener(record);
    } catch (err) {
      console.error('[consentService] Listener error', err);
    }
  });
}

/** A consent choice older than 13 months (CNIL guidance) is no longer valid and must be asked again. */
export function isConsentExpired(updatedAt: string, now: number = Date.now()): boolean {
  const recordedAt = Date.parse(updatedAt);
  if (Number.isNaN(recordedAt)) return true;
  const expiry = new Date(recordedAt);
  expiry.setMonth(expiry.getMonth() + CONSENT_MAX_AGE_MONTHS);
  return now >= expiry.getTime();
}

export function getConsent(): ConsentRecord | null {
  try {
    const raw = appStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ConsentRecord>;
    if (
      parsed &&
      parsed.version === 1 &&
      typeof parsed.analytics === 'boolean' &&
      typeof parsed.updatedAt === 'string'
    ) {
      if (isConsentExpired(parsed.updatedAt)) return null;
      return {
        version: 1,
        analytics: parsed.analytics,
        updatedAt: parsed.updatedAt,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function setConsent(analytics: boolean): ConsentRecord {
  const record: ConsentRecord = {
    version: 1,
    analytics: Boolean(analytics),
    updatedAt: new Date().toISOString(),
  };
  appStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record));
  if (!record.analytics) {
    recordedEvents.length = 0;
  }
  notifyConsentListeners(record);
  return record;
}

export function resetConsent(): void {
  appStorage.removeItem(CONSENT_STORAGE_KEY);
  recordedEvents.length = 0;
  notifyConsentListeners(null);
}

export function subscribeConsent(listener: ConsentListener): () => void {
  consentListeners.add(listener);
  return () => {
    consentListeners.delete(listener);
  };
}

export function openConsentPreferences(): void {
  preferencesOpenListeners.forEach((listener) => {
    try {
      listener();
    } catch (err) {
      console.error('[consentService] Open preferences listener error', err);
    }
  });
}

export function subscribeConsentPreferencesOpen(listener: PreferencesOpenListener): () => void {
  preferencesOpenListeners.add(listener);
  return () => {
    preferencesOpenListeners.delete(listener);
  };
}

/**
 * Safely records a public showcase event ONLY when:
 *  1. Deployment mode is 'cloud' (never in 'local' self-hosted mode)
 *  2. User has explicitly opted in (`getConsent()?.analytics === true`)
 *  3. `VITE_ANALYTICS_ID` is configured
 */
export function trackPublicEvent(
  eventName: string,
  props?: Record<string, string>
): boolean {
  if (getDeploymentMode() === 'local') {
    return false;
  }

  const consent = getConsent();
  if (!consent || consent.analytics !== true) {
    return false;
  }

  const analyticsId = getAnalyticsId();
  if (!analyticsId) {
    return false;
  }

  const entry: RecordedPublicEvent = {
    eventName,
    props,
    timestamp: new Date().toISOString(),
    analyticsId,
  };
  recordedEvents.push(entry);
  return true;
}

export function getRecordedPublicEvents(): readonly RecordedPublicEvent[] {
  return recordedEvents;
}

export const consentService = {
  getConsent,
  setConsent,
  resetConsent,
  subscribeConsent,
  openConsentPreferences,
  subscribeConsentPreferencesOpen,
  trackPublicEvent,
  getRecordedPublicEvents,
};
