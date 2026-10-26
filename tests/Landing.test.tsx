import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Landing from '../src/pages/Landing';
import Login from '../src/pages/Login';
import Signup from '../src/pages/Signup';
import * as deploymentModule from '../src/config/deployment';
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
    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <Landing />
      </MemoryRouter>
    );

    const demoButtons = screen.getAllByRole('button', { name: /Try Live Demo|Launch Interactive Demo/i });
    expect(demoButtons.length).toBeGreaterThan(0);

    fireEvent.click(demoButtons[0]);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('demo@glassfolio.com', 'password');
    });
  });

  it('interactively updates hero metrics when envelope filters and currencies are toggled', () => {
    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <Landing />
      </MemoryRouter>
    );

    // Initial total net worth contains 148 450
    expect(screen.getAllByText(/148/).length).toBeGreaterThan(0);

    // Click PEA filter
    const peaBtns = screen.getAllByRole('button', { name: /PEA/i });
    fireEvent.click(peaBtns[0]);

    // PEA net worth is 68 200
    expect(screen.getAllByText(/68/).length).toBeGreaterThan(0);

    // Switch currency to USD
    const usdBtn = screen.getByRole('button', { name: 'USD' });
    fireEvent.click(usdBtn);

    // USD currency symbol or converted value is displayed
    expect(screen.getAllByText(/\$|USD/).length).toBeGreaterThan(0);
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

  it('hides the demo button on /login in cloud mode and shows it in local mode', () => {
    // 1. Cloud mode: Demo button is hidden on /login, Google button is visible
    vi.spyOn(deploymentModule, 'getDeploymentMode').mockReturnValue('cloud');
    const { rerender } = render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByRole('button', { name: /Explore Demo Account/i })).toBeNull();
    expect(screen.getByRole('button', { name: /Google/i })).toBeTruthy();

    // 2. Local mode: Demo button is displayed on /login, Google button is hidden
    vi.spyOn(deploymentModule, 'getDeploymentMode').mockReturnValue('local');
    rerender(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: /Explore Demo Account/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Google/i })).toBeNull();
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
