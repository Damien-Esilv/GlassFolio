/**
 * Landing — the three automatic sync modes (TGLA-246): brokers through SnapTrade (not affiliated), read-only
 * crypto wallets, and French banks through Woob, local only, with a way to the download page.
 */
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SyncSection } from '../../../../src/components/landing/SyncSection';
import { LandingMotionProvider } from '../../../../src/components/landing/motion/LandingMotionProvider';
import { SNAPTRADE_SITE_URL, WOOB_SITE_URL } from '../../../../src/config/project';
import i18n from '../../../../src/i18n';

const renderSection = (): void => {
  render(
    <MemoryRouter>
      <LandingMotionProvider>
        <SyncSection />
      </LandingMotionProvider>
    </MemoryRouter>
  );
};

describe('<SyncSection />', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('shows the three modes under the #sync anchor', () => {
    renderSection();
    expect(document.getElementById('sync')).not.toBeNull();
    expect(screen.getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)).toEqual([
      'Brokers, with your API keys',
      'Crypto wallets, read-only',
      'French banks, on your computer',
    ]);
  });

  it('says French banks are local only and leads to the download page', () => {
    renderSection();
    expect(screen.getByText('Local only')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Get the desktop app/ }).getAttribute('href')).toMatch(/\/download$/);
  });

  it('links the official sites in a new tab and states GlassFolio is not affiliated with SnapTrade', () => {
    renderSection();
    const snaptrade = screen.getByRole('link', { name: /SnapTrade official site/ });
    expect(snaptrade.getAttribute('href')).toBe(SNAPTRADE_SITE_URL);
    expect(snaptrade.getAttribute('target')).toBe('_blank');
    expect(snaptrade.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.getByRole('link', { name: /Woob official site/ }).getAttribute('href')).toBe(WOOB_SITE_URL);
    expect(screen.getByText('GlassFolio is not affiliated with SnapTrade.')).toBeTruthy();
  });
});
