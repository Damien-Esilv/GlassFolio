import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Landing from '../src/pages/Landing';
import Login from '../src/pages/Login';
import Signup from '../src/pages/Signup';
import * as deploymentModule from '../src/config/deployment';
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

  it('renders landing page with sticky header, hero, playgrounds, bento, and FAQ', () => {
    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <Landing />
      </MemoryRouter>
    );

    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByText(/E2EE Wealth & French Tax Copilot/i)).toBeTruthy();
    expect(screen.getByText(/French Tax & Official Cerfa Simulator/i)).toBeTruthy();
    expect(screen.getByText(/ETF Fee-Drag/i)).toBeTruthy();
    expect(screen.getByText(/Multi-Broker CSV Inspector/i)).toBeTruthy();
    expect(screen.getByText(/Client-Side AES-256-GCM Vault/i)).toBeTruthy();
    expect(screen.getByText(/Frequently Asked Questions/i)).toBeTruthy();
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

  it('interactively recalculates tax optimization when TMI brackets and scenarios change', () => {
    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <Landing />
      </MemoryRouter>
    );

    // Initial TMI is 11%, dividends scenario (3 500 €)
    expect(screen.getByText(/PFU — Flat Tax/i)).toBeTruthy();
    expect(screen.getByText(/Barème Progressif/i)).toBeTruthy();

    // Toggle TMI to 41%
    const tmi41Btn = screen.getByRole('button', { name: '41%' });
    fireEvent.click(tmi41Btn);

    // At 41% TMI on dividends, PFU is optimal
    expect(screen.getByText(/Optimal: PFU/i)).toBeTruthy();

    // Switch scenario to CTO capital gains
    const ctoBtn = screen.getByRole('button', { name: /CTO Capital Gains/i });
    fireEvent.click(ctoBtn);

    // Check Cerfa boxes for CTO
    expect(screen.getByText(/3VG/i)).toBeTruthy();
  });

  it('interactively updates ETF fee drag projections when horizon or profile is toggled', () => {
    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <Landing />
      </MemoryRouter>
    );

    // Toggle horizon to 30 years
    const y30Btn = screen.getByRole('button', { name: '30 Years' });
    fireEvent.click(y30Btn);

    // Compounded fee drag lost is updated
    expect(screen.getByText(/Total Compounded Fees Lost/i)).toBeTruthy();

    // Toggle fee profile to Traditional Bank Fund
    const bankProfileBtn = screen.getByRole('button', { name: /Traditional Bank Fund/i });
    fireEvent.click(bankProfileBtn);

    expect(screen.getAllByText(/1.85% TER/i).length).toBeGreaterThan(0);
  });

  it('interactively switches CSV broker preset and tests 1-click rollback', () => {
    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <Landing />
      </MemoryRouter>
    );

    // Switch broker preset to Trade Republic
    const trBtn = screen.getByRole('button', { name: 'Trade Republic' });
    fireEvent.click(trBtn);

    expect(screen.getAllByText(/ISIN/i).length).toBeGreaterThan(0);

    // Click 1-Click Rollback test button
    const rollbackBtn = screen.getByRole('button', { name: /Test 1-Click Rollback/i });
    fireEvent.click(rollbackBtn);

    expect(screen.getByText(/Rolled back cleanly/i)).toBeTruthy();
  });

  it('interactively toggles encrypted vault lock state and AI provider preview', () => {
    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <Landing />
      </MemoryRouter>
    );

    // Initially unlocked in RAM
    expect(screen.getAllByText(/UNLOCKED/i).length).toBeGreaterThan(0);

    // Toggle to locked in storage
    const lockBtn = screen.getByRole('button', { name: /Locked in Storage/i });
    fireEvent.click(lockBtn);

    expect(screen.getAllByText(/LOCKED/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/ciphertext/i).length).toBeGreaterThan(0);

    // Switch AI runtime to Claude Desktop
    const claudeBtn = screen.getByRole('button', { name: /Claude Desktop/i });
    fireEvent.click(claudeBtn);

    expect(screen.getAllByText(/record_transaction/i).length).toBeGreaterThan(0);
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
    const secondQuestion = screen.getByText(/Does the French Tax Simulator replace/i);
    fireEvent.click(secondQuestion);

    expect(screen.getByText(/does not constitute certified tax or AMF investment advice/i)).toBeTruthy();
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

  it('displays nominative trademark disclaimers in CSV playground and footer', () => {
    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <Landing />
      </MemoryRouter>
    );

    // Both CSV playground and footer contain nominative trademark mentions
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
