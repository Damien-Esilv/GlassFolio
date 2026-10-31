import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Landing from '../src/pages/Landing';
import Login from '../src/pages/Login';
import Signup from '../src/pages/Signup';
import * as deploymentModule from '../src/config/deployment';
import { demoAvailability } from '../src/services/demoAvailability';
import { LANDING_SECTION_ANCHORS } from '../src/components/landing/LandingHeader';
import '../src/i18n';

// Mock contexts
const mockLogin = vi.fn().mockResolvedValue(undefined);
const mockLogout = vi.fn();
const mockLockVault = vi.fn();
const mockUpdateProfile = vi.fn().mockResolvedValue(undefined);
let mockUser: unknown = null;
let mockIsLoading = false;

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    isLoading: mockIsLoading,
    login: mockLogin,
    logout: mockLogout,
    lockVault: mockLockVault,
    updateProfile: mockUpdateProfile,
    isAuthenticated: !!mockUser,
    isVaultLocked: false,
  }),
}));

vi.mock('../src/context/DataContext', () => ({
  useData: () => ({
    lastPriceRefresh: null,
    forceRefreshPrices: vi.fn(),
  }),
}));

describe('<Landing /> & Dual-Mode Access Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
    mockIsLoading = false;
    vi.spyOn(deploymentModule, 'getDeploymentMode').mockReturnValue('cloud');
  });

  it('renders the sections in the same order as the header anchors', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/welcome']}>
        <Landing />
      </MemoryRouter>
    );

    expect(screen.getByRole('banner')).toBeTruthy();
    const sectionIds = Array.from(container.querySelectorAll('main section[id]')).map((node) => node.id);
    expect(sectionIds).toEqual([...LANDING_SECTION_ANCHORS]);
    expect(screen.getByRole('heading', { name: 'The app, screen by screen' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Security and privacy by design' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Choose where your AI runs' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Two ways to use GlassFolio' })).toBeTruthy();
  });

  it('offers the self-hosted and cloud versions side by side in the hero', () => {
    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <Landing />
      </MemoryRouter>
    );
    const modes = screen.getByRole('list', { name: 'Two ways to use GlassFolio' });
    expect(within(modes).getAllByRole('listitem').filter((item) => item.parentElement === modes)).toHaveLength(2);
    expect(within(modes).getByRole('link', { name: /Install it locally/i })).toBeTruthy();
    expect(within(modes).getByRole('link', { name: /Create a free account/i })).toBeTruthy();
  });

  it('never advertises unsupported real estate or uses "zero-knowledge" wording', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/welcome']}>
        <Landing />
      </MemoryRouter>
    );
    expect(container.textContent).not.toMatch(/real estate|immobilier|zero[- ]knowledge/i);
  });

  it('keeps "Log in" and "Create account" in the header while a demo session is active', () => {
    mockUser = { id: 'demo-123', email: 'demo@glassfolio.com', name: 'Demo', xp: 0, level: 1 };
    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <Landing />
      </MemoryRouter>
    );
    const header = screen.getByRole('banner');
    expect(within(header).getAllByRole('link', { name: 'Log in' }).length).toBeGreaterThan(0);
    expect(within(header).getAllByRole('link', { name: 'Create account' }).length).toBeGreaterThan(0);
    expect(within(header).queryByRole('link', { name: /Go to Dashboard/i })).toBeNull();
  });

  it('adds a dashboard link next to "Log in" for a real account', () => {
    mockUser = { id: 'u-42', email: 'investor@example.com', name: 'Investor', xp: 0, level: 1 };
    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <Landing />
      </MemoryRouter>
    );
    const header = screen.getByRole('banner');
    expect(within(header).getAllByRole('link', { name: /Go to Dashboard/i }).length).toBeGreaterThan(0);
    expect(within(header).getAllByRole('link', { name: 'Log in' }).length).toBeGreaterThan(0);
  });

  it('signs a leftover demo session out on /login instead of redirecting to the demo dashboard', () => {
    mockUser = { id: 'demo-123', email: 'demo@glassfolio.com', name: 'Demo', xp: 0, level: 1 };
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<p>Dashboard page</p>} />
        </Routes>
      </MemoryRouter>
    );
    expect(mockLogout).toHaveBeenCalled();
    expect(screen.queryByText('Dashboard page')).toBeNull();
  });

  it('still redirects a real account away from /login', () => {
    mockUser = { id: 'u-42', email: 'investor@example.com', name: 'Investor', xp: 0, level: 1 };
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<p>Dashboard page</p>} />
        </Routes>
      </MemoryRouter>
    );
    expect(mockLogout).not.toHaveBeenCalled();
    expect(screen.getByText('Dashboard page')).toBeTruthy();
  });

  it('signs a leftover demo session out on /signup', () => {
    mockUser = { id: 'demo-123', email: 'demo@glassfolio.com', name: 'Demo', xp: 0, level: 1 };
    render(
      <MemoryRouter initialEntries={['/signup']}>
        <Routes>
          <Route path="/signup" element={<Signup />} />
        </Routes>
      </MemoryRouter>
    );
    expect(mockLogout).toHaveBeenCalled();
  });

  it('triggers 1-click demo login and navigates to / when Try Live Demo is clicked', async () => {
    vi.spyOn(deploymentModule, 'getDeploymentMode').mockReturnValue('cloud');
    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <Landing />
      </MemoryRouter>
    );

    const demoButtons = await screen.findAllByRole('button', { name: /Try Live Demo|Launch Interactive Demo/i });
    expect(demoButtons.length).toBeGreaterThan(0);

    fireEvent.click(demoButtons[0]);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('demo@glassfolio.com', 'password');
    });
  });

  it('renders the prominent demo showcase card with feature highlights and centered CTA button', async () => {
    // The online showcase always offers the demo
    vi.spyOn(deploymentModule, 'getDeploymentMode').mockReturnValue('cloud');
    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <Landing />
      </MemoryRouter>
    );

    // Headline is displayed
    expect(await screen.findByRole('heading', { level: 3, name: /Explore the full GlassFolio experience live/i })).toBeTruthy();

    // Feature highlights are rendered
    expect(screen.getByText(/anonymous/i)).toBeTruthy();

    // Centered demo CTA button is rendered
    expect(screen.getByRole('button', { name: /Try the 1-Click Interactive Demo/i })).toBeTruthy();
  });

  it('toggles FAQ accordion questions and answers', () => {
    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <Landing />
      </MemoryRouter>
    );

    const firstQuestion = screen.getByText(/Where is my financial data stored/i);
    expect(firstQuestion).toBeTruthy();

    // Click question 2
    const secondQuestion = screen.getByText(/Does the tax engine replace an official tax return/i);
    fireEvent.click(secondQuestion);

    expect(screen.getByText(/the engine is modular so other jurisdictions can be added/i)).toBeTruthy();
  });

  it('hides the demo button on /login in cloud mode and on a normal local launch, shows it on a local demo launch', async () => {
    // 1. Cloud mode: Demo button is hidden on /login, Google button is visible
    vi.spyOn(deploymentModule, 'getDeploymentMode').mockReturnValue('cloud');
    const { unmount: unmountCloud } = render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByRole('button', { name: /Explore Demo Account/i })).toBeNull();
    expect(screen.getByRole('button', { name: /Google/i })).toBeTruthy();

    // 2. Local mode, normal launch: no demo button, no Google button
    unmountCloud();
    vi.spyOn(deploymentModule, 'getDeploymentMode').mockReturnValue('local');
    demoAvailability.reset();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({ demo: false }) }));
    const { unmount: unmountLocal } = render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Explore Demo Account/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Google/i })).toBeNull();

    // 3. Local mode started with --demo: the demo button is there
    unmountLocal();
    demoAvailability.reset();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({ demo: true }) }));
    const { unmount } = render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login />} />
        </Routes>
      </MemoryRouter>
    );
    expect((await screen.findAllByRole('button', { name: /Explore Demo Account/i })).length).toBeGreaterThan(0);
    unmount();
    vi.unstubAllGlobals();
    demoAvailability.reset();
  });

  it('shows Google signup button in cloud mode and hides it in local mode', () => {
    vi.spyOn(deploymentModule, 'getDeploymentMode').mockReturnValue('cloud');
    const { unmount } = render(
      <MemoryRouter initialEntries={['/signup']}>
        <Routes>
          <Route path="/signup" element={<Signup />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /Google/i })).toBeTruthy();
    unmount();

    vi.spyOn(deploymentModule, 'getDeploymentMode').mockReturnValue('local');
    render(
      <MemoryRouter initialEntries={['/signup']}>
        <Routes>
          <Route path="/signup" element={<Signup />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.queryByRole('button', { name: /Google/i })).toBeNull();
  });

  it('opens extensible language and theme dropdowns and allows selecting preferences', () => {
    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <Landing />
      </MemoryRouter>
    );

    // 1. Language Dropdown
    const langTrigger = screen.getAllByRole('button', { name: /Language|Langue/i })[0];
    expect(langTrigger).toBeTruthy();
    fireEvent.click(langTrigger);

    const langListbox = screen.getByRole('listbox', { name: /Language|Langue/i });
    expect(langListbox).toBeTruthy();

    const frOption = screen.getByRole('option', { name: /Français|FR/i });
    expect(frOption).toBeTruthy();
    fireEvent.click(frOption);

    // 2. Theme Dropdown
    const themeTrigger = screen.getAllByRole('button', { name: /Appearance|Apparence/i })[0];
    expect(themeTrigger).toBeTruthy();
    fireEvent.click(themeTrigger);

    const themeListbox = screen.getByRole('listbox', { name: /Appearance|Apparence/i });
    expect(themeListbox).toBeTruthy();

    const lightOption = screen.getByRole('option', { name: /Light|Clair/i });
    expect(lightOption).toBeTruthy();
    fireEvent.click(lightOption);
  });

  it('displays nominative trademark disclaimers next to the broker list and in the footer', () => {
    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <Landing />
      </MemoryRouter>
    );

    // The import step of the product story and the footer both name the brokers
    const disclaimers = screen.getAllByText(/BoursoBank, Trade Republic, Binance, Kraken/i);
    expect(disclaimers.length).toBeGreaterThanOrEqual(2);

    // Footer trademark and regulatory notices
    expect(
      screen.getAllByText(/Nominative Trademark Use|Usage Nominatif des Marques/i).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/AMF \/ DGFiP Notice|Avertissement AMF \/ DGFiP/i).length
    ).toBeGreaterThan(0);
  });

  it('renders theme and language switcher on /login and /signup', () => {
    const loginRender = render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login />} />
        </Routes>
      </MemoryRouter>
    );

    expect(loginRender.getAllByRole('button', { name: /Language|Langue/i }).length).toBeGreaterThan(0);
    expect(loginRender.getAllByRole('button', { name: /Appearance|Apparence/i }).length).toBeGreaterThan(0);
    loginRender.unmount();

    const signupRender = render(
      <MemoryRouter initialEntries={['/signup']}>
        <Routes>
          <Route path="/signup" element={<Signup />} />
        </Routes>
      </MemoryRouter>
    );

    expect(signupRender.getAllByRole('button', { name: /Language|Langue/i }).length).toBeGreaterThan(0);
    expect(signupRender.getAllByRole('button', { name: /Appearance|Apparence/i }).length).toBeGreaterThan(0);
    signupRender.unmount();
  });
});
