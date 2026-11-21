import { APP_HOSTNAME } from './constants.mjs';

/** The only page the window may show: the local server, on `localhost` and the chosen port. */
export function isAppUrl(url, port) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' && parsed.hostname === APP_HOSTNAME && parsed.port === String(port);
  } catch {
    return false;
  }
}

/** Links that may leave the app (opened in the system browser / mail client). Everything else is dropped. */
export function isExternalOpenable(url) {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'mailto:';
  } catch {
    return false;
  }
}

export const appUrl = (port) => `http://${APP_HOSTNAME}:${port}`;
