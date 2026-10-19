import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LandingHeader } from '../../../components/landing/LandingHeader';
import * as deploymentModule from '../../../src/config/deployment';
import '../../../src/i18n';

// Mock contexts
const mockLogin = vi.fn().mockResolvedValue(undefined);
const mockLogout = vi.fn();
let mockUser: unknown = null;

vi.mock('../../../context/AuthContext', () => ({
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
    targetElement.id = 'tax-simulator';
    targetElement.scrollIntoView = vi.fn();
    document.body.appendChild(targetElement);

    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <LandingHeader />
      </MemoryRouter>
    );

    const taxLink = screen.getByText(/Tax Simulator|Simulateur Fiscal/i);
    fireEvent.click(taxLink);

    expect(targetElement.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });

    // Cleanup
    document.body.removeChild(targetElement);
  });

  it('displays "Go to Dashboard" linking to / when user is authenticated in same-app mode', () => {
    vi.spyOn(deploymentModule, 'getAppTarget').mockReturnValue('unified');
    vi.spyOn(deploymentModule, 'getAppUrl').mockReturnValue('');
    mockUser = { id: 'demo-user', email: 'demo@glassfolio.com' };

    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <LandingHeader />
      </MemoryRouter>
    );

    const dashboardLink = screen.getByText(/Dashboard|Tableau de bord/i);
    expect(dashboardLink).toBeTruthy();
    expect(dashboardLink.closest('a')?.getAttribute('href')).toBe('/');
  });

  it('displays "Go to Dashboard" with external URL when app is hosted on subdomain', () => {
    vi.spyOn(deploymentModule, 'getAppTarget').mockReturnValue('showcase');
    vi.stubEnv('VITE_APP_URL', 'https://app.glassfolio.dev');
    mockUser = { id: 'demo-user', email: 'demo@glassfolio.com' };

    render(
      <MemoryRouter initialEntries={['/']}>
        <LandingHeader />
      </MemoryRouter>
    );

    const dashboardLink = screen.getByText(/Dashboard|Tableau de bord/i);
    expect(dashboardLink).toBeTruthy();
    expect(dashboardLink.closest('a')?.getAttribute('href')).toBe('https://app.glassfolio.dev/');
  });
});
