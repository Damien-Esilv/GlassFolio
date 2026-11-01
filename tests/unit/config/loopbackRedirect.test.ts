import { describe, it, expect } from 'vitest';
import { getLocalhostRedirect, type LocationLike } from '../../../src/config/loopbackRedirect';

const at = (overrides: Partial<LocationLike>): LocationLike => ({
  protocol: 'http:', hostname: '127.0.0.1', port: '3000', pathname: '/', search: '', hash: '', ...overrides,
});

describe('getLocalhostRedirect', () => {
  it('sends 127.0.0.1 to localhost and keeps port, path, query and hash', () => {
    expect(getLocalhostRedirect(at({ pathname: '/settings', search: '?tab=security', hash: '#passkeys' })))
      .toBe('http://localhost:3000/settings?tab=security#passkeys');
  });

  it('handles the IPv6 loopback and a missing port', () => {
    expect(getLocalhostRedirect(at({ hostname: '[::1]', port: '' }))).toBe('http://localhost/');
  });

  it('leaves localhost, a LAN address and a real domain alone', () => {
    expect(getLocalhostRedirect(at({ hostname: 'localhost' }))).toBeNull();
    expect(getLocalhostRedirect(at({ hostname: '192.168.1.20' }))).toBeNull();
    expect(getLocalhostRedirect(at({ hostname: 'app.glassfolio.dev', protocol: 'https:', port: '' }))).toBeNull();
  });
});
