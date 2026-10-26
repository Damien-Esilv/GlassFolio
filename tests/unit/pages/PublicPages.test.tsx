import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import About from '../../../src/pages/About';
import Roadmap from '../../../src/pages/Roadmap';
import Changelog from '../../../src/pages/Changelog';
import * as deploymentModule from '../../../src/config/deployment';
import { GITHUB_PROFILE_URL, GITHUB_REPO_URL } from '../../../src/config/project';
import { ROADMAP_ITEMS } from '../../../src/constants/roadmap';
import { CHANGELOG } from '../../../src/constants/changelog';
import i18n from '../../../src/i18n';

vi.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: null, isLoading: false, login: vi.fn(), logout: vi.fn(), isAuthenticated: false }),
}));

const renderAt = (path: string): void => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/about" element={<About />} />
        <Route path="/welcome/about" element={<About />} />
        <Route path="/roadmap" element={<Roadmap />} />
        <Route path="/welcome/roadmap" element={<Roadmap />} />
        <Route path="/changelog" element={<Changelog />} />
        <Route path="/welcome/changelog" element={<Changelog />} />
      </Routes>
    </MemoryRouter>
  );
};

describe('Public pages', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await i18n.changeLanguage('en');
  });

  it('About explains the name, the story and how the project is built', () => {
    renderAt('/about');
    expect(screen.getByRole('heading', { level: 1, name: 'The project' })).toBeTruthy();
    expect(screen.getByText('Glass')).toBeTruthy();
    expect(screen.getByText('Folio')).toBeTruthy();
    expect(screen.getByText(/engineering student at ESILV/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Damien on GitHub/ }).getAttribute('href')).toBe(GITHUB_PROFILE_URL);
    expect(screen.getByRole('link', { name: /View the repository/ }).getAttribute('href')).toBe(GITHUB_REPO_URL);
  });

  it('About is also served under /welcome in the unified build', () => {
    vi.spyOn(deploymentModule, 'getAppTarget').mockReturnValue('unified');
    renderAt('/welcome/about');
    expect(screen.getByRole('link', { name: 'Back to the home page' }).getAttribute('href')).toBe('/welcome');
  });

  it('Roadmap lists every item with its status and horizon', () => {
    renderAt('/roadmap');
    expect(screen.getByRole('heading', { level: 1, name: 'Roadmap' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(ROADMAP_ITEMS.length);
    expect(screen.getByText('New tax jurisdictions')).toBeTruthy();
    expect(screen.getAllByText('In progress').length).toBeGreaterThan(0);
  });

  it('Changelog shows every version, newest first, with an anchor per version', () => {
    renderAt('/changelog');
    const articles = document.querySelectorAll('article');
    expect(Array.from(articles).map((a) => a.id)).toEqual(CHANGELOG.map((entry) => entry.id));
    expect(screen.getByRole('link', { name: `Version ${CHANGELOG[0].version}` }).getAttribute('href')).toBe(`#${CHANGELOG[0].id}`);
  });
});
