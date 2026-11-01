/**
 * Loopback address handling for the self-hosted app.
 *
 * Browsers only give a few features (passkeys, for instance) to a domain name, never to an IP
 * address, so the app opened on `127.0.0.1` is sent to `localhost` (same port, path, query and hash).
 * Only the loopback IP literals are redirected: a LAN address or a real domain is left alone.
 */

const LOOPBACK_IP_HOSTS: ReadonlySet<string> = new Set(['127.0.0.1', '[::1]']);

export interface LocationLike {
  protocol: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  hash: string;
}

/** The `localhost` URL to go to, or null when the page is already on a suitable address. */
export const getLocalhostRedirect = (location: LocationLike): string | null => {
  if (!LOOPBACK_IP_HOSTS.has(location.hostname)) return null;
  const port = location.port ? `:${location.port}` : '';
  return `${location.protocol}//localhost${port}${location.pathname}${location.search}${location.hash}`;
};
