import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SelfHostSection } from '../../../../src/components/landing/SelfHostSection';
import { LandingMotionProvider } from '../../../../src/components/landing/motion/LandingMotionProvider';
import * as deploymentModule from '../../../../src/config/deployment';
import { DOCKER_QUICKSTART_COMMANDS, GITHUB_REPO_URL } from '../../../../src/config/project';
import i18n from '../../../../src/i18n';

const renderSection = (): void => {
  render(
    <MemoryRouter>
      <LandingMotionProvider>
        <SelfHostSection />
      </LandingMotionProvider>
    </MemoryRouter>
  );
};

describe('<SelfHostSection />', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await i18n.changeLanguage('en');
  });

  it('is reachable through the #local-cloud anchor', () => {
    renderSection();
    expect(document.getElementById('local-cloud')).not.toBeNull();
  });

  it('links to the GitHub repository in a new tab without leaking the opener', () => {
    renderSection();
    const link = screen.getByRole('link', { name: /View the code on GitHub/i });
    expect(link.getAttribute('href')).toBe(GITHUB_REPO_URL);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('links to the installation guide inside the current build', () => {
    vi.spyOn(deploymentModule, 'getAppTarget').mockReturnValue('showcase');
    renderSection();
    expect(screen.getByRole('link', { name: /installation guide/i }).getAttribute('href')).toBe('/self-host');
  });

  it('prefixes the guide with /welcome in the unified build', () => {
    vi.spyOn(deploymentModule, 'getAppTarget').mockReturnValue('unified');
    renderSection();
    expect(screen.getByRole('link', { name: /installation guide/i }).getAttribute('href')).toBe('/welcome/self-host');
  });

  it('shows the full install transcript before any animation runs', () => {
    renderSection();
    for (const command of DOCKER_QUICKSTART_COMMANDS) {
      expect(screen.getByText(command)).toBeTruthy();
    }
    expect(screen.getByText(/GlassFolio is running on http:\/\/localhost:3000/)).toBeTruthy();
  });

  it('copies the install commands to the clipboard and confirms it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: /Copy the install commands/i }));
    expect(writeText).toHaveBeenCalledWith(DOCKER_QUICKSTART_COMMANDS.join('\n'));
    await waitFor(() => expect(screen.getByText('Copied')).toBeTruthy());
  });

  it('gives the self-hosted and cloud editions the same weight, with their own calls to action', () => {
    renderSection();
    expect(screen.getByRole('heading', { level: 3, name: 'Self-hosted' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Cloud' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Create a free account' })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Log in' }).length).toBeGreaterThan(0);
  });

  it('compares the local and cloud editions row by row', () => {
    renderSection();
    expect(screen.getByRole('columnheader', { name: /Self-hosted \(Docker\)/ })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /Cloud \(app\.glassfolio\.dev\)/ })).toBeTruthy();
    expect(screen.getByRole('rowheader', { name: 'Where your data lives' })).toBeTruthy();
    expect(screen.getByText('Encrypted vault in a volume on your own disk')).toBeTruthy();
  });
});
