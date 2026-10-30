import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import SelfHost from '../../../src/pages/SelfHost';
import * as deploymentModule from '../../../src/config/deployment';
import { GITHUB_REPO_URL } from '../../../src/config/project';
import i18n from '../../../src/i18n';

const mockLogin = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: null, isLoading: false, login: mockLogin, logout: vi.fn(), isAuthenticated: false }),
}));

const renderPage = (path = '/self-host'): void => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/self-host" element={<SelfHost />} />
        <Route path="/welcome/self-host" element={<SelfHost />} />
      </Routes>
    </MemoryRouter>
  );
};

describe('<SelfHost /> guide', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await i18n.changeLanguage('en');
  });

  it('renders every section with a matching table of contents entry', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Self-hosting guide' })).toBeTruthy();
    const toc = screen.getByRole('navigation', { name: 'On this page' });
    for (const id of ['quickstart', 'requirements', 'configuration', 'network', 'backup', 'update', 'ai']) {
      expect(document.getElementById(id)).not.toBeNull();
      expect(within(toc).getByRole('link', { name: i18n.t(`selfhost:sections.${id}.title`) }).getAttribute('href')).toBe(`#${id}`);
    }
  });

  it('documents every docker-compose variable with its default', () => {
    renderPage();
    const table = screen.getByRole('table');
    for (const name of ['GLASSFOLIO_PORT', 'GLASSFOLIO_BIND', 'GLASSFOLIO_DATA', 'GLASSFOLIO_ACCESS_TOKEN', 'GLASSFOLIO_ALLOWED_HOSTS', 'GLASSFOLIO_CSP_CONNECT_SRC']) {
      expect(within(table).getByRole('rowheader', { name })).toBeTruthy();
    }
    expect(within(table).getByText('127.0.0.1')).toBeTruthy();
  });

  it('never suggests exposing the app without an access token', () => {
    renderPage();
    const network = document.getElementById('network') as HTMLElement;
    // The token is set first, printed so it can be kept (it is the password), then the app is exposed
    expect(within(network).getByText(/export GLASSFOLIO_ACCESS_TOKEN=/)).toBeTruthy();
    expect(within(network).getByText(/echo "\$GLASSFOLIO_ACCESS_TOKEN"/)).toBeTruthy();
    expect(within(network).getByText(/GLASSFOLIO_BIND=0\.0\.0\.0 npm run docker:up/)).toBeTruthy();
  });

  it('copies a code block to the clipboard', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Copy: Update' }));
    expect(writeText).toHaveBeenCalledWith('git pull\nnpm run docker:up');
  });

  it('links to GitHub and back to the home page of the current build', () => {
    vi.spyOn(deploymentModule, 'getAppTarget').mockReturnValue('showcase');
    renderPage();
    const github = screen.getAllByRole('link', { name: /View the code on GitHub/i })[0];
    expect(github.getAttribute('href')).toBe(GITHUB_REPO_URL);
    expect(screen.getByRole('link', { name: 'Back to the home page' }).getAttribute('href')).toBe('/');
  });

  it('is served under /welcome in the unified build', () => {
    vi.spyOn(deploymentModule, 'getAppTarget').mockReturnValue('unified');
    renderPage('/welcome/self-host');
    expect(screen.getByRole('link', { name: 'Back to the home page' }).getAttribute('href')).toBe('/welcome');
  });

  it('launches the demo account from the guide (online showcase)', async () => {
    vi.spyOn(deploymentModule, 'getDeploymentMode').mockReturnValue('cloud');
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Try the demo first' }));
    expect(mockLogin).toHaveBeenCalledWith('demo@glassfolio.com', 'password');
  });
});
