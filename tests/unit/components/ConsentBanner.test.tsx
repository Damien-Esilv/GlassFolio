import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConsentBanner } from '../../../src/components/ConsentBanner';
import {
  getConsent,
  resetConsent,
  openConsentPreferences,
} from '../../../src/services/consentService';
import * as deploymentModule from '../../../src/config/deployment';
import '../../../src/i18n';

describe('<ConsentBanner />', () => {
  beforeEach(() => {
    resetConsent();
    vi.restoreAllMocks();
  });

  it('renders consent banner on initial mount when no consent recorded in cloud mode', () => {
    vi.spyOn(deploymentModule, 'getDeploymentMode').mockReturnValue('cloud');
    vi.spyOn(deploymentModule, 'getAppTarget').mockReturnValue('showcase');

    render(
      <MemoryRouter initialEntries={['/']}>
        <ConsentBanner />
      </MemoryRouter>
    );

    expect(screen.getByRole('region')).toBeTruthy();
    expect(screen.getByText(/Privacy & GDPR Cookie Consent/i)).toBeTruthy();
  });

  it('renders consent banner in local unified dev mode when no consent recorded', () => {
    vi.spyOn(deploymentModule, 'getDeploymentMode').mockReturnValue('local');
    vi.spyOn(deploymentModule, 'getAppTarget').mockReturnValue('unified');

    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <ConsentBanner />
      </MemoryRouter>
    );

    expect(screen.getByRole('region')).toBeTruthy();
  });

  it('does NOT auto-display banner in pure local app mode (Docker self-hosted without showcase)', () => {
    vi.spyOn(deploymentModule, 'getDeploymentMode').mockReturnValue('local');
    vi.spyOn(deploymentModule, 'getAppTarget').mockReturnValue('app');

    render(
      <MemoryRouter initialEntries={['/']}>
        <ConsentBanner />
      </MemoryRouter>
    );

    expect(screen.queryByRole('region')).toBeNull();
  });

  it('opens banner on demand when openConsentPreferences() is triggered even if hidden', async () => {
    vi.spyOn(deploymentModule, 'getDeploymentMode').mockReturnValue('local');
    vi.spyOn(deploymentModule, 'getAppTarget').mockReturnValue('app');

    render(
      <MemoryRouter initialEntries={['/']}>
        <ConsentBanner />
      </MemoryRouter>
    );

    expect(screen.queryByRole('region')).toBeNull();

    // Trigger open preferences wrapped in act
    act(() => {
      openConsentPreferences();
    });

    await waitFor(() => {
      expect(screen.getByRole('region')).toBeTruthy();
    });
  });

  it('records refusal when user clicks the Refuse button and hides banner', () => {
    vi.spyOn(deploymentModule, 'getDeploymentMode').mockReturnValue('cloud');

    render(
      <MemoryRouter initialEntries={['/']}>
        <ConsentBanner />
      </MemoryRouter>
    );

    const refuseBtn = screen.getByRole('button', { name: /Refuse optional analytics/i });
    fireEvent.click(refuseBtn);

    expect(getConsent()?.analytics).toBe(false);
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('records opt-in when user clicks the Accept button and hides banner', () => {
    vi.spyOn(deploymentModule, 'getDeploymentMode').mockReturnValue('cloud');

    render(
      <MemoryRouter initialEntries={['/']}>
        <ConsentBanner />
      </MemoryRouter>
    );

    const acceptBtn = screen.getByRole('button', { name: /Accept optional analytics/i });
    fireEvent.click(acceptBtn);

    expect(getConsent()?.analytics).toBe(true);
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('records refusal when user clicks the close (X) button', () => {
    vi.spyOn(deploymentModule, 'getDeploymentMode').mockReturnValue('cloud');

    render(
      <MemoryRouter initialEntries={['/']}>
        <ConsentBanner />
      </MemoryRouter>
    );

    const closeBtn = screen.getByRole('button', { name: /Close/i });
    fireEvent.click(closeBtn);

    expect(getConsent()?.analytics).toBe(false);
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('links to /welcome/cookies when pathname starts with /welcome', () => {
    vi.spyOn(deploymentModule, 'getDeploymentMode').mockReturnValue('local');
    vi.spyOn(deploymentModule, 'getAppTarget').mockReturnValue('unified');

    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <ConsentBanner />
      </MemoryRouter>
    );

    const customizeLink = screen.getByRole('link', { name: /Learn more/i });
    expect(customizeLink.getAttribute('href')).toBe('/welcome/cookies');

    fireEvent.click(customizeLink);
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('links to /cookies when pathname is on root app', () => {
    vi.spyOn(deploymentModule, 'getDeploymentMode').mockReturnValue('cloud');
    vi.spyOn(deploymentModule, 'getAppTarget').mockReturnValue('showcase');

    render(
      <MemoryRouter initialEntries={['/']}>
        <ConsentBanner />
      </MemoryRouter>
    );

    const customizeLink = screen.getByRole('link', { name: /Learn more/i });
    expect(customizeLink.getAttribute('href')).toBe('/cookies');
  });
});
