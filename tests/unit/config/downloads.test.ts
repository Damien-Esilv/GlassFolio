import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildDownloadUrl,
  DESKTOP_DEFAULT_PORT,
  DESKTOP_DOWNLOADS,
  DESKTOP_OS_ORDER,
  DESKTOP_RELEASES_URL,
  downloadsFor,
  otherMacDownload,
  primaryDownloadFor,
} from '../../../src/config/downloads';
import { GITHUB_REPO_URL, SELF_HOST_DEFAULT_PORT } from '../../../src/config/project';
import { detectDesktopOs, macArchFromHint } from '../../../src/hooks/useDetectedOs';
import { DEFAULT_PORT, GITHUB_REPO_URL as SHELL_REPO_URL, INSTALLER_FILES, RELEASES_PAGE_URL } from '../../../desktop/lib/constants.mjs';

const read = (file: string): string => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('desktop download catalog', () => {
  it('links to the latest release of the project repository', () => {
    expect(DESKTOP_RELEASES_URL).toBe(`${GITHUB_REPO_URL}/releases/latest`);
    expect(buildDownloadUrl('GlassFolio-win-x64.exe')).toBe(`${GITHUB_REPO_URL}/releases/latest/download/GlassFolio-win-x64.exe`);
  });

  it('lists every system with a primary installer, and unique ids and files', () => {
    expect(new Set(DESKTOP_DOWNLOADS.map((item) => item.id)).size).toBe(DESKTOP_DOWNLOADS.length);
    expect(new Set(DESKTOP_DOWNLOADS.map((item) => item.file)).size).toBe(DESKTOP_DOWNLOADS.length);
    DESKTOP_OS_ORDER.forEach((os) => {
      expect(downloadsFor(os).length).toBeGreaterThan(0);
      expect(primaryDownloadFor(os).os).toBe(os);
    });
    expect(primaryDownloadFor('mac').arch).toBe('arm64');
  });

  it('proposes Apple Silicon first on a Mac unless the chip is known to be Intel, and offers the other chip', () => {
    expect(primaryDownloadFor('mac', null).id).toBe('mac-arm64');
    expect(primaryDownloadFor('mac', 'arm64').id).toBe('mac-arm64');
    expect(primaryDownloadFor('mac', 'x64').id).toBe('mac-x64');
    expect(primaryDownloadFor('win', 'x64').id).toBe('win-x64');
    expect(primaryDownloadFor('linux', 'x64').id).toBe('linux-appimage');
    expect(otherMacDownload(primaryDownloadFor('mac', 'arm64'))?.id).toBe('mac-x64');
    expect(otherMacDownload(primaryDownloadFor('mac', 'x64'))?.id).toBe('mac-arm64');
  });

  it('only ever points to installers the release workflow builds (names shared with desktop/)', () => {
    const shell = Object.values(INSTALLER_FILES);
    expect(DESKTOP_DOWNLOADS.map((item) => item.file).sort()).toEqual([...shell].sort());
    const builder = read('desktop/electron-builder.yml');
    const manifestScript = read('desktop/scripts/make-update-manifest.mjs');
    DESKTOP_DOWNLOADS.forEach((item) => {
      expect(manifestScript, item.file).toContain(item.file);
      // builder names are patterns: GlassFolio-mac-${arch}.${ext}, GlassFolio-win-${arch}.${ext}, GlassFolio-linux-x64.${ext}
      expect(builder, item.file).toContain(`GlassFolio-${item.os}-`);
    });
  });

  it('stays in step with the desktop shell (repository, port, version)', () => {
    expect(SHELL_REPO_URL).toBe(GITHUB_REPO_URL);
    expect(RELEASES_PAGE_URL).toBe(DESKTOP_RELEASES_URL);
    expect(String(DEFAULT_PORT)).toBe(DESKTOP_DEFAULT_PORT);
    expect(DESKTOP_DEFAULT_PORT).not.toBe(SELF_HOST_DEFAULT_PORT); // desktop and Docker can run side by side
    const root = JSON.parse(read('package.json')) as { version: string };
    const shellPackage = JSON.parse(read('desktop/package.json')) as { version: string; license: string };
    expect(shellPackage.version).toBe(root.version);
    expect(shellPackage.license).toBe((JSON.parse(read('package.json')) as { license: string }).license);
  });
});

describe('desktop system detection', () => {
  it.each([
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 'MacIntel', 'mac'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120', 'Win32', 'win'],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0', 'Linux x86_64', 'linux'],
    ['Mozilla/5.0 (X11; Ubuntu; Linux x86_64) Chrome/120', '', 'linux'],
  ])('recognises %s', (userAgent, platform, expected) => {
    expect(detectDesktopOs(userAgent, platform)).toBe(expected);
  });

  it('does not treat phones, tablets or Chromebooks as desktop systems', () => {
    expect(detectDesktopOs('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'iPhone')).toBeNull();
    expect(detectDesktopOs('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', 'MacIntel')).toBeNull();
    expect(detectDesktopOs('Mozilla/5.0 (Linux; Android 14; Pixel 8)', 'Linux armv8l')).toBeNull();
    expect(detectDesktopOs('Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)', '')).toBeNull();
    expect(detectDesktopOs('', '')).toBeNull();
  });
});

describe('Mac chip from the browser hint', () => {
  it('reads the architecture hint of Chromium browsers and stays unknown otherwise', () => {
    expect(macArchFromHint('arm')).toBe('arm64');
    expect(macArchFromHint('x86')).toBe('x64');
    expect(macArchFromHint('')).toBeNull();
    expect(macArchFromHint(undefined)).toBeNull();
  });
});
