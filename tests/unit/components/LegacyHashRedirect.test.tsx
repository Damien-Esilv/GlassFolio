import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { LegacyHashRedirect } from '../../../components/ui/LegacyHashRedirect';

const LocationDisplay: React.FC = () => {
  const location = useLocation();
  return <div data-testid="location-path">{location.pathname}{location.search}</div>;
};

describe('LegacyHashRedirect (TGLA-067)', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete (window as any).location;
    (window as any).location = originalLocation;
  });

  it('redirects legacy #/welcome hash to clean path /welcome', () => {
    delete (window as any).location;
    window.location = new URL('https://glassfolio.dev/#/welcome') as any;

    const { getByTestId } = render(
      <MemoryRouter initialEntries={['/']}>
        <LegacyHashRedirect />
        <LocationDisplay />
        <Routes>
          <Route path="/" element={<div>Home</div>} />
          <Route path="/welcome" element={<div>Welcome</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(getByTestId('location-path').textContent).toBe('/welcome');
  });

  it('redirects legacy #/login?demo=1 preserving query parameters', () => {
    delete (window as any).location;
    window.location = new URL('https://app.glassfolio.dev/#/login?demo=1') as any;

    const { getByTestId } = render(
      <MemoryRouter initialEntries={['/']}>
        <LegacyHashRedirect />
        <LocationDisplay />
        <Routes>
          <Route path="/" element={<div>Home</div>} />
          <Route path="/login" element={<div>Login</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(getByTestId('location-path').textContent).toBe('/login?demo=1');
  });

  it('preserves hash and does not redirect when hash contains Supabase OAuth access_token', () => {
    delete (window as any).location;
    window.location = new URL('https://app.glassfolio.dev/#access_token=sb-mock-token-123&expires_in=3600') as any;

    const { getByTestId } = render(
      <MemoryRouter initialEntries={['/']}>
        <LegacyHashRedirect />
        <LocationDisplay />
        <Routes>
          <Route path="/" element={<div>Home</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(getByTestId('location-path').textContent).toBe('/');
  });

  it('does nothing when hash is empty', () => {
    delete (window as any).location;
    window.location = new URL('https://app.glassfolio.dev/portfolio') as any;

    const { getByTestId } = render(
      <MemoryRouter initialEntries={['/portfolio']}>
        <LegacyHashRedirect />
        <LocationDisplay />
        <Routes>
          <Route path="/portfolio" element={<div>Portfolio</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(getByTestId('location-path').textContent).toBe('/portfolio');
  });
});
