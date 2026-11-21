import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { downloadVerified } from '../../../desktop/lib/download.mjs';
import {
  buildManifest,
  findManifestFile,
  ManifestError,
  parseManifest,
  publicKeyFromBase64,
  signManifestBytes,
  verifyManifestSignature,
} from '../../../desktop/lib/updateManifest.mjs';

const keys = () => crypto.generateKeyPairSync('ed25519');
const sha = (bytes: Buffer): string => crypto.createHash('sha512').update(bytes).digest('hex');

const validManifest = (overrides: Record<string, unknown> = {}) => ({
  schema: 1,
  version: '1.1.0',
  releaseDate: '2026-12-01T10:00:00.000Z',
  files: [{ platform: 'mac', arch: 'arm64', kind: 'zip', name: 'GlassFolio-mac-arm64.zip', size: 10, sha512: 'a'.repeat(128) }],
  ...overrides,
});
const asBytes = (value: unknown): Buffer => Buffer.from(JSON.stringify(value));

describe('update manifest signature', () => {
  it('accepts what the maintainer key signed and nothing else', () => {
    const { publicKey, privateKey } = keys();
    const bytes = asBytes(validManifest());
    const signature = signManifestBytes(bytes, privateKey);
    expect(verifyManifestSignature(bytes, signature, publicKey)).toBe(true);
    expect(verifyManifestSignature(asBytes(validManifest({ version: '9.9.9' })), signature, publicKey)).toBe(false);
    expect(verifyManifestSignature(bytes, signature, keys().publicKey)).toBe(false);
    expect(verifyManifestSignature(bytes, 'not-base64!!', publicKey)).toBe(false);
    expect(verifyManifestSignature(bytes, '', publicKey)).toBe(false);
  });

  it('loads the embedded public key from base64 SPKI', () => {
    const { publicKey, privateKey } = keys();
    const embedded = publicKeyFromBase64(publicKey.export({ type: 'spki', format: 'der' }).toString('base64'));
    const bytes = asBytes(validManifest());
    expect(verifyManifestSignature(bytes, signManifestBytes(bytes, privateKey), embedded)).toBe(true);
  });
});

describe('update manifest parsing', () => {
  it('parses a valid manifest and finds the installer of a platform', () => {
    const manifest = parseManifest(asBytes(validManifest()));
    expect(manifest.version).toBe('1.1.0');
    expect(findManifestFile(manifest, { platform: 'mac', arch: 'arm64', kind: 'zip' })?.name).toBe('GlassFolio-mac-arm64.zip');
    expect(findManifestFile(manifest, { platform: 'win', arch: 'x64', kind: 'exe' })).toBeNull();
  });

  it.each([
    ['another schema', validManifest({ schema: 2 })],
    ['a "v" version', validManifest({ version: 'v1.1.0' })],
    ['no files', validManifest({ files: [] })],
    ['a path in a file name', validManifest({ files: [{ platform: 'mac', arch: 'arm64', kind: 'zip', name: '../evil.zip', size: 10, sha512: 'a'.repeat(128) }] })],
    ['an unknown platform', validManifest({ files: [{ platform: 'beos', arch: 'x64', kind: 'zip', name: 'a.zip', size: 10, sha512: 'a'.repeat(128) }] })],
    ['a short checksum', validManifest({ files: [{ platform: 'mac', arch: 'arm64', kind: 'zip', name: 'a.zip', size: 10, sha512: 'abc' }] })],
    ['a zero size', validManifest({ files: [{ platform: 'mac', arch: 'arm64', kind: 'zip', name: 'a.zip', size: 0, sha512: 'a'.repeat(128) }] })],
  ])('rejects %s', (_label, value) => {
    expect(() => parseManifest(asBytes(value))).toThrow(ManifestError);
  });

  it('rejects invalid JSON and oversized manifests', () => {
    expect(() => parseManifest(Buffer.from('{oops'))).toThrow(ManifestError);
    expect(() => parseManifest(Buffer.alloc(70 * 1024, 1))).toThrow(ManifestError);
  });
});

describe('manifest building and verified downloads', () => {
  let dir = '';
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-manifest-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('builds a manifest with the real size and SHA-512 of each installer', async () => {
    const file = path.join(dir, 'GlassFolio-mac-arm64.zip');
    const content = Buffer.from('installer bytes');
    fs.writeFileSync(file, content);
    const manifest = await buildManifest({
      version: '1.1.0',
      releaseDate: '2026-12-01T10:00:00.000Z',
      entries: [{ platform: 'mac', arch: 'arm64', kind: 'zip', name: 'GlassFolio-mac-arm64.zip', path: file }],
    });
    expect(manifest.files[0]).toMatchObject({ size: content.length, sha512: sha(content) });
    expect(() => parseManifest(asBytes(manifest))).not.toThrow();
  });

  const serve = (content: Buffer, init: ResponseInit = { status: 200 }) => async () => new Response(content, init);

  it('writes the file when size and checksum match, reporting progress', async () => {
    const content = Buffer.from('x'.repeat(1000));
    const destination = path.join(dir, 'a.zip');
    const progress: number[] = [];
    await downloadVerified({ url: 'https://example.test/a.zip', destination, expectedSize: 1000, expectedSha512: sha(content), fetchImpl: serve(content), onProgress: (p: number) => progress.push(p) });
    expect(fs.readFileSync(destination)).toEqual(content);
    expect(progress.at(-1)).toBe(1);
  });

  it('deletes the file and fails on a wrong checksum, a different size or an HTTP error', async () => {
    const content = Buffer.from('x'.repeat(1000));
    const destination = path.join(dir, 'a.zip');
    const run = (expectedSize: number, expectedSha512: string, fetchImpl = serve(content)) =>
      downloadVerified({ url: 'https://example.test/a.zip', destination, expectedSize, expectedSha512, fetchImpl });

    await expect(run(1000, sha(Buffer.from('other')))).rejects.toMatchObject({ code: 'checksum' });
    await expect(run(999, sha(content))).rejects.toMatchObject({ code: 'size' });
    await expect(run(1001, sha(content))).rejects.toMatchObject({ code: 'size' });
    await expect(run(1000, sha(content), serve(Buffer.from('no'), { status: 404 }))).rejects.toMatchObject({ code: 'network' });
    await expect(run(0, sha(content))).rejects.toMatchObject({ code: 'size' });
    expect(fs.existsSync(destination)).toBe(false);
  });
});
