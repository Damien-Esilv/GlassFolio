import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Download from '../../../src/pages/Download';
import * as downloadsModule from '../../../src/config/downloads';
import * as deploymentModule from '../../../src/config/deployment';
import { DESKTOP_DOWNLOADS, DESKTOP_OS_ORDER } from '../../../src/config/downloads';
import i18n from '../../../src/i18n';

vi.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: null, isLoading: false, login: vi.fn(), logout: vi.fn(), isAuthenticated: false }),
}));

const renderPage = (): void => {
  render(
    <MemoryRouter initialEntries={['/download']}>
      <Download />
    </MemoryRouter>,
  );
};

describe('Download page', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.spyOn(deploymentModule, 'getAppTarget').mockReturnValue('showcase');
    await i18n.changeLanguage('en');
  });

  it('has a single h1 and a card for each system', () => {
    renderPage();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Download GlassFolio/);
    ['macOS', 'Windows', 'Linux'].forEach((name) => expect(screen.getAllByRole('heading', { name })[0]).toBeTruthy());
  });

  it('never links to an installer before the first release is published (coming soon, Docker and cloud instead)', () => {
    expect(downloadsModule.DESKTOP_INSTALLERS_PUBLISHED).toBe(false);
    renderPage();
    expect(screen.getByText('First release coming soon')).toBeTruthy();
    const links = screen.getAllByRole('link').map((link) => link.getAttribute('href') ?? '');
    expect(links.some((href) => /releases\/latest\/download/.test(href))).toBe(false);
    expect(screen.getAllByText('Coming soon').length).toBe(downloadsModule.DESKTOP_DOWNLOADS.length);
    expect(screen.getAllByRole('link', { name: /Install with Docker/i })[0].getAttribute('href')).toBe('/self-host');
  });

  it('links each installer of the latest release once they are published', () => {
    vi.spyOn(downloadsModule, 'DESKTOP_INSTALLERS_PUBLISHED', 'get').mockReturnValue(true as never);
    renderPage();
    const systems = screen.getByRole('region', { name: 'Choose your system' });
    const hrefs = within(systems).getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual(downloadsModule.DESKTOP_DOWNLOADS.map((item) => downloadsModule.buildDownloadUrl(item.file)));
    expect(screen.queryByText('First release coming soon')).toBeNull();
  });

  it('explains the first launch on every system and how updates work', () => {
    renderPage();
    expect(screen.getByText(/Open Anyway/)).toBeTruthy();
    expect(screen.getByText(/Run anyway/)).toBeTruthy();
    expect(screen.getByText(/chmod \+x/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'How updates work' })).toBeTruthy();
  });

  it('is available in French', async () => {
    await i18n.changeLanguage('fr');
    renderPage();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Téléchargez GlassFolio/);
    expect(screen.getByText(/Ouvrir quand même/)).toBeTruthy();
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
      ];
      keys.forEach((key) => expect(t(key), `${lang} ${key}`).not.toBe(key));
    }
  });
});
