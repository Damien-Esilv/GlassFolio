import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';

const analytics = vi.hoisted(() => ({ mounts: 0 }));
vi.mock('@vercel/analytics/react', () => ({
  Analytics: () => {
    analytics.mounts += 1;
    return <div data-testid="vercel-analytics" />;
  },
}));

import * as deployment from '../../../src/config/deployment';
import { ConsentGatedAnalytics } from '../../../src/components/ConsentGatedAnalytics';
import { resetConsent, setConsent } from '../../../src/services/consentService';

describe('<ConsentGatedAnalytics />', () => {
  beforeEach(() => {
    analytics.mounts = 0;
    resetConsent();
    vi.restoreAllMocks();
    vi.spyOn(deployment, 'getDeploymentMode').mockReturnValue('cloud');
  });

  it('loads nothing before the visitor opts in', () => {
    const { queryByTestId } = render(<ConsentGatedAnalytics />);
    expect(queryByTestId('vercel-analytics')).toBeNull();
    expect(analytics.mounts).toBe(0);
  });

  it('loads nothing after a refusal', () => {
    setConsent(false);
    const { queryByTestId } = render(<ConsentGatedAnalytics />);
    expect(queryByTestId('vercel-analytics')).toBeNull();
  });

  it('mounts after an opt-in and unmounts when consent is withdrawn', () => {
    const { queryByTestId } = render(<ConsentGatedAnalytics />);
    act(() => { setConsent(true); });
    expect(queryByTestId('vercel-analytics')).not.toBeNull();
    act(() => { setConsent(false); });
    expect(queryByTestId('vercel-analytics')).toBeNull();
  });

  it('never loads in self-hosted local mode, even with consent', () => {
    vi.spyOn(deployment, 'getDeploymentMode').mockReturnValue('local');
    setConsent(true);
    const { queryByTestId } = render(<ConsentGatedAnalytics />);
    expect(queryByTestId('vercel-analytics')).toBeNull();
  });
});
