import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Download from '../../../src/pages/Download';
import * as downloadsModule from '../../../src/config/downloads';
import * as deploymentModule from '../../../src/config/deployment';
import { buildDownloadUrl, DESKTOP_DOWNLOADS, DESKTOP_OS_ORDER } from '../../../src/config/downloads';
import i18n from '../../../src/i18n';

vi.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: null, isLoading: false, login: vi.fn(), logout: vi.fn(), isAuthenticated: false }),
}));

const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const mockUserAgent = (userAgent: string): void => {
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(userAgent);
};
const mockPublished = (published: boolean): void => {
  vi.spyOn(downloadsModule, 'DESKTOP_INSTALLERS_PUBLISHED', 'get').mockReturnValue(published as never);
};

const renderPage = (): ReturnType<typeof render> =>
  render(
    <MemoryRouter initialEntries={['/download']}>
      <Download />
    </MemoryRouter>,
  );

const releaseLinks = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll('a[href*="releases/latest/download"]')).map((link) => link.getAttribute('href') ?? '');

describe('Download page', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.spyOn(deploymentModule, 'getAppTarget').mockReturnValue('showcase');
    mockUserAgent(MAC);
    mockPublished(true);
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    Reflect.deleteProperty(window.navigator, 'userAgentData');
  });

  it('has a single h1 and puts the visitor’s system first', async () => {
    renderPage();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Download GlassFolio/);
    expect(await screen.findByRole('heading', { level: 3, name: 'GlassFolio for macOS' })).toBeTruthy();
    expect(screen.getByText('Recommended for your computer')).toBeTruthy();
    expect(screen.getByText(/Apple Silicon \(M1 and later\) · \.dmg/)).toBeTruthy();
  });

  it('links the big button to the installer of the latest release, and every installer in the panel', async () => {
    const { container } = renderPage();
    const button = await screen.findByRole('link', { name: /Download for macOS/ });
    expect(button.getAttribute('href')).toBe(buildDownloadUrl('GlassFolio-mac-arm64.dmg'));
    expect(screen.getByRole('link', { name: /Download the Intel version/ }).getAttribute('href')).toBe(buildDownloadUrl('GlassFolio-mac-x64.dmg'));

    const hrefs = releaseLinks(container);
    DESKTOP_DOWNLOADS.forEach((item) => expect(hrefs, item.file).toContain(buildDownloadUrl(item.file)));
    expect(hrefs).toContain(buildDownloadUrl(downloadsModule.DESKTOP_CHECKSUMS_FILE));
    expect(screen.queryByText(/installers are about to be published/)).toBeNull();
  });

  it('proposes Intel first when a Chromium browser says the Mac has an Intel chip', async () => {
    Object.defineProperty(window.navigator, 'userAgentData', {
      configurable: true,
      value: { platform: 'macOS', getHighEntropyValues: vi.fn().mockResolvedValue({ architecture: 'x86' }) },
    });
    renderPage();
    await waitFor(() => expect(screen.getByRole('link', { name: /Download for macOS/ }).getAttribute('href')).toBe(buildDownloadUrl('GlassFolio-mac-x64.dmg')));
    expect(screen.getByRole('link', { name: /Download that version/ }).getAttribute('href')).toBe(buildDownloadUrl('GlassFolio-mac-arm64.dmg'));
    expect(screen.getByText(/Intel · \.dmg/)).toBeTruthy();
  });

  it('proposes the Windows installer to a Windows visitor, without the Mac chip question', async () => {
    mockUserAgent(WINDOWS);
    renderPage();
    const button = await screen.findByRole('link', { name: /Download for Windows/ });
    expect(button.getAttribute('href')).toBe(buildDownloadUrl('GlassFolio-win-x64.exe'));
    expect(screen.queryByRole('link', { name: /Intel version/ })).toBeNull();
  });

  it('asks a phone visitor to choose a system, with the panel open', async () => {
    mockUserAgent(IPHONE);
    renderPage();
    expect(await screen.findByRole('heading', { level: 3, name: 'GlassFolio for Mac, Windows and Linux' })).toBeTruthy();
    expect(screen.getByText(/installs on a computer/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /All systems and versions/ }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Choose your system' })).toBeTruthy();
  });

  it('never links to an installer before the first release is published (coming soon, Docker and cloud instead)', async () => {
    mockPublished(false);
    const { container } = renderPage();
    expect(await screen.findByRole('heading', { level: 3, name: 'GlassFolio for macOS' })).toBeTruthy();
    expect(releaseLinks(container)).toHaveLength(0);
    // the big button and one line per installer
    expect(screen.getAllByText('Coming soon')).toHaveLength(DESKTOP_DOWNLOADS.length + 1);
    expect(screen.getByText(/installers are about to be published/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Install with Docker/ }).getAttribute('href')).toBe('/self-host');
    expect(screen.getByRole('link', { name: /Try the cloud version/ })).toBeTruthy();
    expect(screen.queryByText('SHA-256 fingerprints')).toBeNull();
  });

  it('folds the panel of all the versions when the system is known, and opens it on request', async () => {
    renderPage();
    const toggle = await screen.findByRole('button', { name: /All systems and versions/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'Other systems and versions' }));
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('shows one system per tab with its installers and its first-launch steps, with keyboard navigation', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Other systems and versions' }));

    const mac = screen.getByRole('tab', { name: /macOS/ });
    const windows = screen.getByRole('tab', { name: /Windows/ });
    const linux = screen.getByRole('tab', { name: /Linux/ });
    expect(mac.getAttribute('aria-selected')).toBe('true');
    expect(within(mac).getByText('Your system')).toBeTruthy();
    const macPanel = screen.getByRole('tabpanel', { name: /macOS/ });
    expect(within(macPanel).getAllByRole('link')).toHaveLength(2);
    expect(within(macPanel).getByText(/Open Anyway/)).toBeTruthy();

    fireEvent.click(windows);
    expect(windows.getAttribute('aria-selected')).toBe('true');
    expect(within(screen.getByRole('tabpanel', { name: /Windows/ })).getByText(/Run anyway/)).toBeTruthy();

    fireEvent.keyDown(windows, { key: 'ArrowRight' });
    expect(linux.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(linux);
    expect(within(screen.getByRole('tabpanel', { name: /Linux/ })).getByText(/chmod \+x/)).toBeTruthy();
    expect(within(screen.getByRole('tabpanel', { name: /Linux/ })).getAllByRole('link')).toHaveLength(2);

    fireEvent.keyDown(linux, { key: 'Home' });
    expect(mac.getAttribute('aria-selected')).toBe('true');
  });

  it('opens on the three ways to use GlassFolio, the desktop app first with its download button, then Docker and the cloud', async () => {
    renderPage();
    const ways = await screen.findByRole('heading', { level: 2, name: 'Three ways to use GlassFolio' });
    const titles = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);
    const order = ['GlassFolio for macOS', 'Docker', 'Cloud version'].map((title) => titles.indexOf(title));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // the first block of the page, before the benefits
    const benefits = screen.getByRole('heading', { name: 'Why the desktop app' });
    expect(ways.compareDocumentPosition(benefits) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(/On a Mac, the app unlocks with your master password/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Read the Docker guide/ }).getAttribute('href')).toBe('/self-host');
    expect(screen.getByRole('link', { name: /Create a free account/ })).toBeTruthy();
  });

  it('offers the one-click demo in the cloud card', async () => {
    vi.spyOn(deploymentModule, 'getDeploymentMode').mockReturnValue('cloud');
    renderPage();
    expect(await screen.findByRole('button', { name: /Try the 1-Click Interactive Demo/i })).toBeTruthy();
    expect(screen.getByText(/No sign-up, with a sample portfolio/)).toBeTruthy();
  });

  it('explains how updates work and how to verify a download', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'How updates work' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Check what you download' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'SHA-256 fingerprints' })).toBeTruthy();
  });

  it('is available in French', async () => {
    await i18n.changeLanguage('fr');
    renderPage();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Téléchargez GlassFolio/);
    expect(await screen.findByRole('heading', { level: 3, name: 'GlassFolio pour macOS' })).toBeTruthy();
    expect(screen.getByText(/Ouvrir quand même/)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Trois façons d’utiliser GlassFolio' })).toBeTruthy();
    await i18n.changeLanguage('en');
  });

  it('has a French and an English text for every key the page builds dynamically', async () => {
    for (const lang of ['en', 'fr']) {
      const t = i18n.getFixedT(lang);
      const keys = [
        ...DESKTOP_OS_ORDER.flatMap((os) => [`download:platforms.${os}.name`, `download:platforms.${os}.requirements`, `download:platforms.${os}.hint`, `download:firstLaunch.${os}.title`]),
        ...DESKTOP_DOWNLOADS.map((item) => `download:platforms.${item.os}.variants.${item.id}`),
        ...['s1', 's2'].flatMap((step) => [`download:firstLaunch.win.steps.${step}`, `download:firstLaunch.linux.steps.${step}`]),
        'download:firstLaunch.mac.steps.s3',
        ...['window', 'local', 'updates', 'ai'].flatMap((key) => [`download:benefits.${key}.title`, `download:benefits.${key}.body`]),
        ...['p1', 'p2', 'p3'].map((point) => `download:ways.desktop.points.${point}`),
        ...['desktop', 'docker', 'cloud'].flatMap((way) => [`download:ways.${way}.title`, `download:ways.${way}.body`, `download:ways.${way}.note`, `download:ways.${way}.cta`]),
        ...['eyebrow', 'recommended', 'heading', 'headingAny', 'anySpec', 'mobileNote', 'download', 'choose', 'showAll', 'switchToIntel', 'switchToSilicon', 'windowTitle'].map((key) => `download:hero.${key}`),
        ...['title', 'subtitle', 'tabsLabel', 'yours'].map((key) => `download:all.${key}`),
      ];
      keys.forEach((key) => expect(t(key), `${lang} ${key}`).not.toBe(key));
    }
  });
});
