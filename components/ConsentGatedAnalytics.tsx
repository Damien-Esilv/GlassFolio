import React, { useEffect, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { getDeploymentMode } from '../src/config/deployment';
import { getConsent, subscribeConsent } from '../src/services/consentService';

const isAudienceMeasurementAllowed = (): boolean =>
  getDeploymentMode() !== 'local' && getConsent()?.analytics === true;

/**
 * Vercel Web Analytics, mounted only after an explicit opt-in (E15).
 *
 * Nothing is requested from Vercel before consent, never in self-hosted `local` mode, and events
 * are dropped as soon as the visitor withdraws consent during the session.
 */
export const ConsentGatedAnalytics: React.FC = () => {
  const [allowed, setAllowed] = useState<boolean>(isAudienceMeasurementAllowed);

  useEffect(() => subscribeConsent(() => setAllowed(isAudienceMeasurementAllowed())), []);

  if (!allowed) return null;
  return <Analytics beforeSend={(event) => (isAudienceMeasurementAllowed() ? event : null)} />;
};
