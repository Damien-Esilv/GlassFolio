/**
 * Constants of the GlassFolio desktop shell. Pure values, no Electron import, so they can be unit tested.
 */

export const APP_ID = 'dev.glassfolio.desktop';

/** Fixed default port: browser-only prefs, MCP client configs and OLLAMA_ORIGINS depend on a stable origin. */
export const DEFAULT_PORT = 3790;
/** How many consecutive ports are tried when the preferred one is taken. */
export const PORT_SCAN_LIMIT = 10;
export const SERVER_HOST = '127.0.0.1';
/** The window loads `localhost` (not 127.0.0.1): passkey RP IDs and the server's origin guards expect it. */
export const APP_HOSTNAME = 'localhost';
export const HEALTH_TIMEOUT_MS = 20_000;
export const HEALTH_POLL_MS = 150;

export const GITHUB_OWNER = 'Damien-Esilv';
export const GITHUB_REPO = 'GlassFolio';
export const GITHUB_REPO_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;
export const RELEASES_PAGE_URL = `${GITHUB_REPO_URL}/releases/latest`;
export const LATEST_DOWNLOAD_BASE_URL = `${GITHUB_REPO_URL}/releases/latest/download`;

export const UPDATE_MANIFEST_NAME = 'update-manifest.json';
export const UPDATE_SIGNATURE_NAME = 'update-manifest.json.sig';
export const UPDATE_MANIFEST_SCHEMA = 1;
export const MAX_MANIFEST_BYTES = 64 * 1024;
export const MAX_UPDATE_BYTES = 600 * 1024 * 1024;
export const UPDATE_FIRST_CHECK_DELAY_MS = 15_000;
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const FETCH_TIMEOUT_MS = 15_000;

export const SETTINGS_FILE_NAME = 'desktop-settings.json';
export const DATA_DIR_NAME = 'glassfolio-data';

/** Version-less installer names, so `releases/latest/download/<name>` is a stable link for the website. */
export const INSTALLER_FILES = Object.freeze({
  macArm64: 'GlassFolio-mac-arm64.dmg',
  macX64: 'GlassFolio-mac-x64.dmg',
  win: 'GlassFolio-win-x64.exe',
  linuxAppImage: 'GlassFolio-linux-x64.AppImage',
  linuxDeb: 'GlassFolio-linux-x64.deb',
});
