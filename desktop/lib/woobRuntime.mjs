import fs from 'node:fs';
import path from 'node:path';

/** Folder of the Woob runtime inside the app resources (desktop/scripts/prepare-woob-runtime.mjs builds it). */
export const WOOB_RUNTIME_DIR = 'woob-runtime';

/** Name of a prepared runtime, as in desktop/woob-runtime.json (mac-arm64, win-x64…). */
const targetName = (platform, arch) => `${platform === 'darwin' ? 'mac' : platform === 'win32' ? 'win' : 'linux'}-${arch}`;

/**
 * Interpreter and bank modules of the Woob worker shipped with the app (TGLA-238), or of the development
 * runtime (`npm run woob:setup`) when the app runs from the repository. Null when there is none: the
 * settings then say bank sync is unavailable, everything else works.
 * @param {{ resourcesRoot: string, packaged: boolean, platform?: NodeJS.Platform, arch?: string }} options
 * @returns {{ python: string, modules: string } | null}
 */
export function findWoobRuntime({ resourcesRoot, packaged, platform = process.platform, arch = process.arch }) {
  const shipped = path.join(resourcesRoot, WOOB_RUNTIME_DIR);
  const candidates = packaged
    ? [{ python: path.join(shipped, 'python', platform === 'win32' ? 'python.exe' : 'bin/python3'), modules: path.join(shipped, 'woob-modules') }]
    : [
        // From the repository: a runtime prepared for the installers (CI smoke test), then the development one
        {
          python: path.join(resourcesRoot, 'desktop', '.woob-runtime', targetName(platform, arch), 'python', platform === 'win32' ? 'python.exe' : 'bin/python3'),
          modules: path.join(resourcesRoot, 'desktop', '.woob-runtime', targetName(platform, arch), 'woob-modules'),
        },
        {
          python: path.join(resourcesRoot, '.woob-runtime', 'venv', platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'),
          modules: path.join(resourcesRoot, '.woob-runtime', 'woob-modules'),
        },
      ];
  return candidates.find((candidate) => fs.existsSync(candidate.python) && fs.existsSync(candidate.modules)) ?? null;
}
