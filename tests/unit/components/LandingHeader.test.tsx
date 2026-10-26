import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LandingHeader, LANDING_SECTION_ANCHORS } from '../../../src/components/landing/LandingHeader';
import * as deploymentModule from '../../../src/config/deployment';
import '../../../src/i18n';
import { GITHUB_REPO_URL } from '../../../src/config/project';

// Mock contexts
const mockLogin = vi.fn().mockResolvedValue(undefined);
const mockLogout = vi.fn();
let mockUser: unknown = null;

vi.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    isLoading: false,
    login: mockLogin,
    logout: mockLogout,
    isAuthenticated: !!mockUser,
  }),
}));

describe('<LandingHeader />', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    mockUser = null;
  });

  it('renders brand logo pointing to /welcome in local unified dev mode', () => {
    vi.spyOn(deploymentModule, 'getAppTarget').mockReturnValue('unified');
    vi.spyOn(deploymentModule, 'getAppUrl').mockReturnValue('');

    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <LandingHeader />
      </MemoryRouter>
    );

    const brandLink = screen.getByRole('link', { name: /GlassFolio/i });
    expect(brandLink.getAttribute('href')).toBe('/welcome');
  });

  it('renders brand logo pointing to / in cloud showcase mode', () => {
    vi.spyOn(deploymentModule, 'getAppTarget').mockReturnValue('showcase');
    vi.stubEnv('VITE_APP_URL', 'https://app.glassfolio.dev');

    render(
      <MemoryRouter initialEntries={['/']}>
        <LandingHeader />
      </MemoryRouter>
    );

    const brandLink = screen.getByRole('link', { name: /GlassFolio/i });
    expect(brandLink.getAttribute('href')).toBe('/');
  });

  it('scrolls into view smoothly when an anchor link is clicked and element exists', () => {
    vi.spyOn(deploymentModule, 'getAppTarget').mockReturnValue('unified');

    // Create target section element in DOM
    const targetElement = document.createElement('div');
    targetElement.id = 'security';
    targetElement.scrollIntoView = vi.fn();
    document.body.appendChild(targetElement);

    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <LandingHeader />
      </MemoryRouter>
    );

    const securityLink = screen.getAllByRole('link', { name: 'Security' })[0];
    fireEvent.click(securityLink);

    expect(targetElement.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });

    // Cleanup
    document.body.removeChild(targetElement);
  });

  it('displays "Go to Dashboard" linking to / when user is authenticated in same-app mode', () => {
    vi.spyOn(deploymentModule, 'getAppTarget').mockReturnValue('unified');
    vi.spyOn(deploymentModule, 'getAppUrl').mockReturnValue('');
    mockUser = { id: 'u-42', email: 'investor@example.com' };

    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <LandingHeader />
      </MemoryRouter>
    );

    const dashboardLink = screen.getByText(/Go to Dashboard|Tableau de bord/i);
    expect(dashboardLink).toBeTruthy();
    expect(dashboardLink.closest('a')?.getAttribute('href')).toBe('/');
  });

  it('displays "Go to Dashboard" with external URL when app is hosted on subdomain', () => {
    vi.spyOn(deploymentModule, 'getAppTarget').mockReturnValue('showcase');
    vi.stubEnv('VITE_APP_URL', 'https://app.glassfolio.dev');
    mockUser = { id: 'u-42', email: 'investor@example.com' };

    render(
      <MemoryRouter initialEntries={['/']}>
        <LandingHeader />
      </MemoryRouter>
    );

    const dashboardLink = screen.getByText(/Go to Dashboard|Tableau de bord/i);
    expect(dashboardLink).toBeTruthy();
    const href = dashboardLink.closest('a')?.getAttribute('href');
    expect(href).toContain('https://app.glassfolio.dev/');
    expect(href).toMatch(/\?theme=(night|dark|light)&lang=(en|fr)/);
  });
});

describe('<LandingHeader /> self-hosting entry points', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockUser = null;
  });

  it('links to the GitHub repository in a new tab', () => {
    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <LandingHeader />
      </MemoryRouter>
    );
    const githubLink = screen.getByRole('link', { name: /View the source code on GitHub/i });
    expect(githubLink.getAttribute('href')).toBe(GITHUB_REPO_URL);
    expect(githubLink.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('scrolls to the #local-cloud section from the nav', () => {
    const section = document.createElement('section');
    section.id = 'local-cloud';
    section.scrollIntoView = vi.fn();
    document.body.appendChild(section);
    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <LandingHeader />
      </MemoryRouter>
    );
    fireEvent.click(screen.getAllByRole('link', { name: 'Local or cloud' })[0]);
    expect(section.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
    section.remove();
  });

  it('lists the scroll anchors in page order', () => {
    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <LandingHeader />
      </MemoryRouter>
    );
    const nav = screen.getAllByRole('navigation', { name: 'Page sections' })[0];
    const hrefs = Array.from(nav.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(LANDING_SECTION_ANCHORS.map((id) => `#${id}`));
  });

  it('links the Install button to the guide page, not to an anchor', () => {
    vi.spyOn(deploymentModule, 'getAppTarget').mockReturnValue('showcase');
    render(
      <MemoryRouter initialEntries={['/']}>
        <LandingHeader />
      </MemoryRouter>
    );
    expect(screen.getAllByRole('link', { name: 'Install' })[0].getAttribute('href')).toBe('/self-host');
  });
});
