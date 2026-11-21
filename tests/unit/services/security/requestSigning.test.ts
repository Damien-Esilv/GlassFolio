import { describe, it, expect, vi, afterEach } from 'vitest';
import { canonicalJson, hmacSha256, hmacSha256Base64, toHex } from '../../../../src/services/security/requestSigning';

describe('request signing (TGLA-221)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('matches the RFC 4231 HMAC-SHA256 test vector', async () => {
    const digest = await hmacSha256('Jefe', 'what do ya want for nothing?');
    expect(toHex(digest)).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
  });

  it('encodes the signature in base64', async () => {
    expect(await hmacSha256Base64('Jefe', 'what do ya want for nothing?')).toBe('W9zBRr9gdU5qBCQmCJV1x1oAPwidJzmDnexYuWTsOEM=');
  });

  it('sorts keys at every level and drops undefined members', () => {
    const value = { query: 'b=2&a=1', path: '/api/v1/accounts', content: { z: 1, a: [{ y: true, b: null }], skip: undefined } };
    expect(canonicalJson(value)).toBe('{"content":{"a":[{"b":null,"y":true}],"z":1},"path":"/api/v1/accounts","query":"b=2&a=1"}');
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson([undefined, 'x'])).toBe('[null,"x"]');
  });

  it('fails clearly without WebCrypto', async () => {
    vi.stubGlobal('crypto', {});
    await expect(hmacSha256('k', 'm')).rejects.toThrow('WebCrypto');
  });
});
