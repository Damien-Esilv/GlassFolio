import { SERVER_HOST } from './constants.mjs';

/** Variables of the parent process the server may need (locating binaries, temp files, locale). Nothing else leaks in. */
const INHERITED = ['PATH', 'HOME', 'USERPROFILE', 'TMPDIR', 'TEMP', 'TMP', 'SYSTEMROOT', 'LANG', 'LC_ALL', 'TZ'];

/**
 * Environment of the local server child process (server/docker-server.mjs).
 * Always loopback only, no access token, no demo mode: the desktop window is the only client.
 */
export function buildServerEnv({ port, dataDir, staticDir, baseEnv = process.env }) {
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
  };
}
