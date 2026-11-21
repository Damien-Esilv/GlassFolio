import {
  FETCH_TIMEOUT_MS,
  GITHUB_REPO_URL,
  LATEST_DOWNLOAD_BASE_URL,
  MAX_MANIFEST_BYTES,
  RELEASES_PAGE_URL,
  UPDATE_MANIFEST_NAME,
  UPDATE_SIGNATURE_NAME,
} from './constants.mjs';
import { applyMacUpdate, canSwapBundle, resolveBundlePath, stageMacUpdate } from './macUpdater.mjs';
import { findManifestFile, ManifestError, parseManifest, verifyManifestSignature } from './updateManifest.mjs';
import { isNewerVersion } from './version.mjs';

/**
 * Update state machine of the desktop app.
 *
 * Detection is the same everywhere: the signed manifest of the latest GitHub release. Installing depends on the platform:
 * - `standard`   Windows and Linux AppImage: electron-updater downloads and installs the new version;
 * - `mac-guided` macOS without Apple signing: our own download, checksum, swap and relaunch (macUpdater.mjs);
 * - `manual`     anything else (deb package, app in a read-only folder): opens the release page;
 * - `disabled`   development runs and builds without an update key.
 *
 * The renderer only ever sees the plain state object below and asks for a check or an install.
 */

export const UPDATE_STATUS = Object.freeze({
  idle: 'idle',
  checking: 'checking',
  upToDate: 'upToDate',
  available: 'available',
  downloading: 'downloading',
  restarting: 'restarting',
  error: 'error',
});

const initialState = (strategy) => ({ status: UPDATE_STATUS.idle, strategy, version: null, progress: null, errorCode: null, checkedAt: null });

export function pickStrategy({ platform, isPackaged, hasPublicKey, execPath, appImage, canSwap = canSwapBundle }) {
  if (!isPackaged || !hasPublicKey) return 'disabled';
  if (platform === 'win32') return 'standard';
  if (platform === 'linux') return appImage ? 'standard' : 'manual';
  if (platform === 'darwin') {
    const bundle = resolveBundlePath(execPath);
    return bundle && canSwap(bundle) ? 'mac-guided' : 'manual';
  }
  return 'disabled';
}

const manifestPlatform = (platform) => ({ darwin: 'mac', win32: 'win', linux: 'linux' })[platform] ?? null;
const manifestKind = (platform) => ({ darwin: 'zip', win32: 'exe', linux: 'appimage' })[platform] ?? null;

async function fetchBytes(fetchImpl, url, maxBytes) {
  const response = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new ManifestError('network', `Request failed (${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maxBytes) throw new ManifestError('too_large', 'Response is too large');
  return bytes;
}

/**
 * @param {{
 *   currentVersion: string, platform: string, arch: string, isPackaged: boolean, publicKey: import('node:crypto').KeyObject | null,
 *   execPath: string, appImage?: string, pid: number, workRoot: string, fetchImpl?: typeof fetch,
 *   standardUpdater?: any, quitApp: () => void, openExternal: (url: string) => void, log?: (...args: unknown[]) => void,
 *   deps?: { stageMacUpdate?: Function, applyMacUpdate?: Function, canSwap?: (bundle: string) => boolean }
 * }} options
 */
export function createUpdateController({
  currentVersion,
  platform,
  arch,
  isPackaged,
  publicKey,
  execPath,
  appImage = '',
  pid,
  workRoot,
  fetchImpl = fetch,
  standardUpdater = null,
  quitApp,
  openExternal,
  log = () => {},
  deps = {},
}) {
  const stage = deps.stageMacUpdate ?? stageMacUpdate;
  const apply = deps.applyMacUpdate ?? applyMacUpdate;
  const strategy = pickStrategy({ platform, isPackaged, hasPublicKey: publicKey !== null, execPath, appImage, canSwap: deps.canSwap });

  let state = initialState(strategy);
  let manifest = null;
  let busy = false;
  const listeners = new Set();

  const setState = (patch) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state);
  };

  async function loadManifest() {
    const [bytes, signature] = await Promise.all([
      fetchBytes(fetchImpl, `${LATEST_DOWNLOAD_BASE_URL}/${UPDATE_MANIFEST_NAME}`, MAX_MANIFEST_BYTES),
      fetchBytes(fetchImpl, `${LATEST_DOWNLOAD_BASE_URL}/${UPDATE_SIGNATURE_NAME}`, 1024),
    ]);
    if (!verifyManifestSignature(bytes, signature.toString('utf8'), publicKey)) {
      throw new ManifestError('signature', 'Manifest signature is not valid');
    }
    return parseManifest(bytes);
  }

  async function check({ manual = false } = {}) {
    if (strategy === 'disabled' || busy) return state;
    if (state.status === UPDATE_STATUS.downloading || state.status === UPDATE_STATUS.restarting) return state;
    busy = true;
    if (manual) setState({ status: UPDATE_STATUS.checking, errorCode: null });
    try {
      const latest = await loadManifest();
      const expectedFile = findManifestFile(latest, { platform: manifestPlatform(platform), arch, kind: manifestKind(platform) });
      const newer = isNewerVersion(latest.version, currentVersion);
      manifest = latest;
      if (newer && (expectedFile || strategy === 'manual')) {
        setState({ status: UPDATE_STATUS.available, version: latest.version, errorCode: null, checkedAt: new Date().toISOString() });
      } else {
        setState({ status: UPDATE_STATUS.upToDate, version: null, errorCode: null, checkedAt: new Date().toISOString() });
      }
    } catch (error) {
      log('update check failed', error?.code ?? error?.name);
      // A background check that fails (offline, rate limit) stays silent; only a manual check reports it
      if (manual) setState({ status: UPDATE_STATUS.error, errorCode: error?.code ?? 'network' });
      else if (state.status === UPDATE_STATUS.checking) setState({ status: UPDATE_STATUS.idle });
    } finally {
      busy = false;
    }
    return state;
  }

  async function installStandard() {
    if (!standardUpdater) throw new ManifestError('unsupported', 'No updater available');
    standardUpdater.on('download-progress', (info) => setState({ progress: Math.min(1, Math.max(0, info.percent / 100)) }));
    await standardUpdater.checkForUpdates();
    await standardUpdater.downloadUpdate();
    setState({ status: UPDATE_STATUS.restarting, progress: 1 });
    standardUpdater.quitAndInstall(true, true);
  }

  async function installMac() {
    const file = findManifestFile(manifest, { platform: 'mac', arch, kind: 'zip' });
    if (!file) throw new ManifestError('invalid', 'No update for this Mac');
    const staged = await stage({
      manifest,
      file,
      workRoot,
      fetchImpl,
      onProgress: (progress) => setState({ progress }),
    });
    setState({ status: UPDATE_STATUS.restarting, progress: 1 });
    apply({ pid, currentBundlePath: resolveBundlePath(execPath), newBundlePath: staged.newBundlePath, workDir: staged.workDir });
    quitApp();
  }

  async function install() {
    if (state.status !== UPDATE_STATUS.available || !manifest) return state;
    if (strategy === 'manual') {
      openExternal(RELEASES_PAGE_URL);
      return state;
    }
    setState({ status: UPDATE_STATUS.downloading, progress: 0, errorCode: null });
    try {
      if (strategy === 'standard') await installStandard();
      else await installMac();
    } catch (error) {
      log('update install failed', error?.code ?? error?.name);
      // Whatever went wrong, the user is never stuck: the release page has the installer
      setState({ status: UPDATE_STATUS.error, errorCode: error?.code ?? 'install', progress: null });
    }
    return state;
  }

  return {
    getState: () => state,
    check,
    install,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    openReleasePage: () => openExternal(RELEASES_PAGE_URL),
    repoUrl: GITHUB_REPO_URL,
  };
}
