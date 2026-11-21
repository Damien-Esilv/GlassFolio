import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { APP_ID, GITHUB_REPO_URL } from './constants.mjs';
import { downloadVerified } from './download.mjs';

const execFileAsync = promisify(execFile);

/**
 * Guided update for macOS without an Apple Developer ID (see updateManifest.mjs).
 *
 * The app downloads the .zip of the new version itself, so the file carries no quarantine flag and
 * Gatekeeper does not prompt again, checks it against the signed manifest, then swaps the .app and relaunches.
 */

const BUNDLE_PATH = /^(.*\.app)\/Contents\/MacOS\/[^/]+$/;

/** `/Applications/GlassFolio.app/Contents/MacOS/GlassFolio` -> `/Applications/GlassFolio.app` (null when not a bundle). */
export function resolveBundlePath(execPath) {
  const match = BUNDLE_PATH.exec(execPath);
  return match ? match[1] : null;
}

/**
 * The bundle can be swapped when it sits in a writable folder and is not a translocated copy
 * (macOS runs quarantined apps from a random read-only path until the user moves them).
 */
export function canSwapBundle(bundlePath, accessImpl = fs.accessSync) {
  if (!bundlePath || bundlePath.includes('/AppTranslocation/') || bundlePath.startsWith('/Volumes/')) return false;
  try {
    accessImpl(path.dirname(bundlePath), fs.constants.W_OK);
    accessImpl(bundlePath, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

const plistValue = async (bundlePath, key, run) => {
  const { stdout } = await run('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', path.join(bundlePath, 'Contents', 'Info.plist')]);
  return stdout.trim();
};

/**
 * Downloads, verifies and unpacks the new version. Returns the path of the new .app, ready to swap in.
 * @param {{ manifest: { version: string }, file: { name: string, size: number, sha512: string }, workRoot: string, fetchImpl?: typeof fetch, onProgress?: (ratio: number) => void, run?: Function, signal?: AbortSignal }} options
 * @returns {Promise<{ newBundlePath: string, workDir: string }>}
 */
export async function stageMacUpdate({ manifest, file, workRoot, fetchImpl = fetch, onProgress, run = execFileAsync, signal }) {
  const workDir = path.join(workRoot, `glassfolio-update-${manifest.version}`);
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true, mode: 0o700 });

  const zipPath = path.join(workDir, file.name);
  await downloadVerified({
    url: `${GITHUB_REPO_URL}/releases/download/v${manifest.version}/${file.name}`,
    destination: zipPath,
    expectedSize: file.size,
    expectedSha512: file.sha512,
    fetchImpl,
    onProgress,
    signal,
  });

  const extractDir = path.join(workDir, 'app');
  fs.mkdirSync(extractDir, { mode: 0o700 });
  await run('/usr/bin/ditto', ['-x', '-k', zipPath, extractDir]);

  const bundleName = fs.readdirSync(extractDir).find((name) => name.endsWith('.app'));
  if (!bundleName) throw new Error('The update does not contain an app');
  const newBundlePath = path.join(extractDir, bundleName);

  // The checksum already proves the file is the one the maintainer published; this guards against a mix-up of apps or versions
  const [bundleId, version] = await Promise.all([
    plistValue(newBundlePath, 'CFBundleIdentifier', run),
    plistValue(newBundlePath, 'CFBundleShortVersionString', run),
  ]);
  if (bundleId !== APP_ID || version !== manifest.version) throw new Error('The update does not match the announced version');

  fs.rmSync(zipPath, { force: true });
  return { newBundlePath, workDir };
}

/**
 * Runs once the app has quit: waits for the process to exit, swaps the bundle (restoring the old one on failure)
 * and relaunches. Arguments are positional, never interpolated into the script.
 */
export const SWAP_SCRIPT = `
i=0
while kill -0 "$1" 2>/dev/null; do
  i=$((i+1))
  if [ "$i" -gt 100 ]; then exit 1; fi
  sleep 0.3
done
backup="$2.previous"
rm -rf "$backup"
mv "$2" "$backup" || exit 1
if ditto "$3" "$2"; then
  xattr -dr com.apple.quarantine "$2" 2>/dev/null
  rm -rf "$backup"
else
  rm -rf "$2"
  mv "$backup" "$2"
fi
rm -rf "$5"
"$4" "$2"
`;

/** @param {{ pid: number, currentBundlePath: string, newBundlePath: string, workDir: string, launcher?: string, spawnImpl?: Function }} options */
export function applyMacUpdate({ pid, currentBundlePath, newBundlePath, workDir, launcher = '/usr/bin/open', spawnImpl = spawn }) {
  const child = spawnImpl('/bin/sh', ['-c', SWAP_SCRIPT, 'glassfolio-update', String(pid), currentBundlePath, newBundlePath, launcher, workDir], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}
