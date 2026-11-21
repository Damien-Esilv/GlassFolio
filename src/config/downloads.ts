/**
 * downloads.ts
 *
 * The desktop app (Electron shell in `desktop/`): where to download it and what the installers are called.
 * File names are version-less on purpose (see desktop/electron-builder.yml), so
 * `releases/latest/download/<file>` stays a valid link from one release to the next.
 */

import { GITHUB_REPO_URL } from './project';

export type DesktopOs = 'mac' | 'win' | 'linux';
export type DesktopArch = 'arm64' | 'x64';
export type DesktopInstallerFormat = 'dmg' | 'exe' | 'AppImage' | 'deb';

export interface DesktopDownload {
  id: string;
  os: DesktopOs;
  arch: DesktopArch;
  format: DesktopInstallerFormat;
  /** File name of the release asset. */
  file: string;
}

/**
 * Flip to `true` once the first release carries the installers (draft release published on GitHub).
 * While `false`, the website says "coming soon" and sends visitors to Docker or the cloud version,
 * so it never links to a file that does not exist.
 */
export const DESKTOP_INSTALLERS_PUBLISHED = false;

/** Default port of the desktop app's local server (`desktop/lib/constants.mjs`); Docker keeps 3780. */
export const DESKTOP_DEFAULT_PORT = '3790';

export const DESKTOP_RELEASES_URL = `${GITHUB_REPO_URL}/releases/latest`;
export const DESKTOP_DOWNLOAD_BASE_URL = `${DESKTOP_RELEASES_URL}/download`;
export const DESKTOP_CHECKSUMS_FILE = 'SHA256SUMS.txt';

export const DESKTOP_DOWNLOADS: readonly DesktopDownload[] = [
  { id: 'mac-arm64', os: 'mac', arch: 'arm64', format: 'dmg', file: 'GlassFolio-mac-arm64.dmg' },
  { id: 'mac-x64', os: 'mac', arch: 'x64', format: 'dmg', file: 'GlassFolio-mac-x64.dmg' },
  { id: 'win-x64', os: 'win', arch: 'x64', format: 'exe', file: 'GlassFolio-win-x64.exe' },
  { id: 'linux-appimage', os: 'linux', arch: 'x64', format: 'AppImage', file: 'GlassFolio-linux-x64.AppImage' },
  { id: 'linux-deb', os: 'linux', arch: 'x64', format: 'deb', file: 'GlassFolio-linux-x64.deb' },
];

export const DESKTOP_OS_ORDER: readonly DesktopOs[] = ['mac', 'win', 'linux'];

export const downloadsFor = (os: DesktopOs): readonly DesktopDownload[] => DESKTOP_DOWNLOADS.filter((download) => download.os === os);

/** The installer to put first for a system: Apple Silicon Macs, the Windows installer, the AppImage. */
export const primaryDownloadFor = (os: DesktopOs): DesktopDownload => downloadsFor(os)[0];

export const buildDownloadUrl = (file: string): string => `${DESKTOP_DOWNLOAD_BASE_URL}/${file}`;
