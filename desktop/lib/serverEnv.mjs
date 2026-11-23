import { SERVER_HOST } from './constants.mjs';

/** Variables of the parent process the server may need (locating binaries, temp files, locale). Nothing else leaks in. */
const INHERITED = ['PATH', 'HOME', 'USERPROFILE', 'TMPDIR', 'TEMP', 'TMP', 'SYSTEMROOT', 'LANG', 'LC_ALL', 'TZ'];

/**
 * Environment of the local server child process (server/docker-server.mjs).
 * `woob`: interpreter and bank modules of the Woob worker (lib/woobRuntime.mjs), when the app ships one.
 * Always loopback only, no access token, no demo mode: the desktop window is the only client.
 */
export function buildServerEnv({ port, dataDir, staticDir, woob = null, baseEnv = process.env }) {
  const env = {};
  for (const key of INHERITED) {
    if (typeof baseEnv[key] === 'string') env[key] = baseEnv[key];
  }
  return {
    ...env,
    NODE_ENV: 'production',
    PORT: String(port),
    HOST: SERVER_HOST,
    DATA_DIR: dataDir,
    STATIC_DIR: staticDir,
    // French banks (TGLA-238): the Python worker shipped with the app, started by the server on first use
    ...(woob ? { GLASSFOLIO_WOOB_PYTHON: woob.python, GLASSFOLIO_WOOB_MODULES: woob.modules } : {}),
  };
}
