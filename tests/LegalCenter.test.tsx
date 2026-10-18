import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import LegalCenter from '../pages/LegalCenter';
import { resetConsent, getConsent } from '../src/services/consentService';
import '../src/i18n';

// Mock contexts
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    lockVault: vi.fn(),
    updateProfile: vi.fn(),
    isAuthenticated: false,
    isVaultLocked: false,
  }),
}));

describe('<LegalCenter /> Suite', () => {
  beforeEach(() => {
    resetConsent();
    vi.clearAllMocks();
  });

  it('renders Mentions Légales on /legal with publisher placeholders and hosting details', () => {
    render(
      <MemoryRouter initialEntries={['/legal']}>
        <Routes>
          <Route path="/legal" element={<LegalCenter />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /Mentions Légales/i })).toBeTruthy();
    expect(screen.getByText(/Damien \[LAST_NAME\]/i)).toBeTruthy();
    expect(screen.getByText(/\[CONTACT_EMAIL\]/i)).toBeTruthy();
    expect(screen.getByText(/\[GITHUB_OR_LINKEDIN_URL\]/i)).toBeTruthy();
    expect(screen.getByText(/Microsoft Azure Static Web Apps/i)).toBeTruthy();
  });

  it('renders Privacy Policy on /privacy detailing E2EE architecture and GDPR rights', () => {
    render(
      <MemoryRouter initialEntries={['/privacy']}>
        <Routes>
          <Route path="/privacy" element={<LegalCenter />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /Privacy Policy \(GDPR\)/i })).toBeTruthy();
    expect(screen.getByText(/Client-Side End-to-End Encrypted \(E2EE\) Architecture/i)).toBeTruthy();
    expect(screen.getByText(/Yahoo Finance & CoinGecko/i)).toBeTruthy();
    expect(screen.getByText(/Commission Nationale de l'Informatique et des Libertés/i)).toBeTruthy();
  });

  it('renders Terms of Use on /terms with AMF / DGFiP regulatory disclaimer', () => {
    render(
      <MemoryRouter initialEntries={['/terms']}>
        <Routes>
          <Route path="/terms" element={<LegalCenter />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /Terms of Use \(CGU\)/i })).toBeTruthy();
    expect(screen.getByText(/Non-Financial & Non-Tax Advice Disclaimer \(AMF \/ DGFiP\)/i)).toBeTruthy();
  });

  it('renders Cookies & Local Storage on /cookies with inventory and interactive consent toggles', () => {
    render(
      <MemoryRouter initialEntries={['/cookies']}>
        <Routes>
          <Route path="/cookies" element={<LegalCenter />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /Cookies & Local Storage Inventory/i })).toBeTruthy();
    expect(screen.getByText('gf_vault_header')).toBeTruthy();
    expect(screen.getByText('glassfolio_*')).toBeTruthy();
    expect(screen.getByText('gf_consent_v1')).toBeTruthy();

    // Check Interactive Consent Manager
    const acceptBtn = screen.getByRole('button', { name: /Accept Optional Analytics/i });
    fireEvent.click(acceptBtn);

    expect(getConsent()?.analytics).toBe(true);
    expect(screen.getByText(/Analytics Opt-in Accepted/i)).toBeTruthy();

    const revokeBtn = screen.getByRole('button', { name: /Revoke \/ Refuse Optional Analytics/i });
    fireEvent.click(revokeBtn);

    expect(getConsent()?.analytics).toBe(false);
    expect(screen.getByText(/Analytics Opt-in Refused/i)).toBeTruthy();
  });

  it('renders Accessibility Declaration on /accessibility with RGAA partial compliance', () => {
    render(
      <MemoryRouter initialEntries={['/accessibility']}>
        <Routes>
          <Route path="/accessibility" element={<LegalCenter />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /Accessibility Declaration \(RGAA 4.1\)/i })).toBeTruthy();
    expect(screen.getByText(/PARTIALLY COMPLIANT/i)).toBeTruthy();
    expect(screen.getByText(/WCAG AA Color Contrast/i)).toBeTruthy();
  });

  it('renders Legal Notice on /welcome/legal and preserves /welcome/ prefix when switching tabs', () => {
    render(
      <MemoryRouter initialEntries={['/welcome/legal']}>
        <Routes>
          <Route path="/welcome/:tab" element={<LegalCenter />} />
          <Route path="/welcome/cookies" element={<LegalCenter />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /Mentions Légales/i })).toBeTruthy();

    // Click on Cookies tab
    const cookiesTabBtn = screen.getByRole('tab', { name: /Cookies & Storage|Cookies & Stockage/i });
    fireEvent.click(cookiesTabBtn);

    expect(screen.getByRole('heading', { name: /Cookies & Local Storage Inventory/i })).toBeTruthy();
  });

  it('renders back link pointing to /welcome when on /welcome base', () => {
    render(
      <MemoryRouter initialEntries={['/welcome/privacy']}>
        <Routes>
          <Route path="/welcome/privacy" element={<LegalCenter />} />
        </Routes>
      </MemoryRouter>
    );

    const backLink = screen.getByRole('link', { name: /Back to Home|Retour à l'accueil/i });
    expect(backLink.getAttribute('href')).toBe('/welcome');
  });
});
