import fs from 'node:fs';
import path from 'node:path';

/**
 * Device settings of the desktop shell (auto-update check, remembered port, window bounds), kept in the
 * main process, next to the vault data. They are not user data and never go through the renderer's storage.
 */
export const DEFAULT_SETTINGS = Object.freeze({
  autoUpdateCheck: true,
  port: null,
  window: null,
});

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

function sanitizeWindow(value) {
  if (value === null || typeof value !== 'object') return null;
  const { x, y, width, height, maximized } = value;
  if (![x, y, width, height].every(isFiniteNumber) || width < 200 || height < 200) return null;
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height), maximized: maximized === true };
}

/** Keeps only known keys with the right type, so a hand-edited or corrupt file can never break startup. */
export function sanitizeSettings(raw) {
  const source = raw !== null && typeof raw === 'object' ? raw : {};
  const port = source.port;
  return {
    autoUpdateCheck: typeof source.autoUpdateCheck === 'boolean' ? source.autoUpdateCheck : DEFAULT_SETTINGS.autoUpdateCheck,
    port: Number.isInteger(port) && port >= 1024 && port <= 65_535 ? port : null,
    window: sanitizeWindow(source.window),
  };
}

export function createSettingsStore(filePath) {
  let cache = null;

  const load = () => {
    try {
      cache = sanitizeSettings(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } catch {
      cache = sanitizeSettings(null);
    }
    return cache;
  };

  return {
    get() {
      return cache ?? load();
    },
    update(patch) {
      cache = sanitizeSettings({ ...(cache ?? load()), ...patch });
      try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        const temp = `${filePath}.tmp`;
        fs.writeFileSync(temp, JSON.stringify(cache, null, 2), { mode: 0o600 });
        fs.renameSync(temp, filePath);
      } catch {
        // A read-only profile must not stop the app: the settings simply stay in memory for this session
      }
      return cache;
    },
  };
}
