import crypto from 'node:crypto';
import fs from 'node:fs';
import { MAX_MANIFEST_BYTES, UPDATE_MANIFEST_SCHEMA } from './constants.mjs';
import { parseVersion } from './version.mjs';

/**
 * Signed update manifest.
 *
 * Why our own manifest: without an Apple Developer account the macOS app carries no Apple signature, so
 * the standard updater cannot be trusted nor used. The release workflow signs `update-manifest.json` with
 * an ed25519 key the maintainer owns; the app embeds the public half and refuses anything it does not verify.
 * It lists every installer of the release with its size and SHA-512, and the app only ever downloads the
 * files named in a verified manifest, from this repository's own release URL (never a URL given by the manifest).
 */

const PLATFORMS = new Set(['mac', 'win', 'linux']);
const ARCHS = new Set(['arm64', 'x64']);
const KINDS = new Set(['zip', 'dmg', 'exe', 'appimage', 'deb']);
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SHA512_HEX = /^[0-9a-f]{128}$/;

export class ManifestError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ManifestError';
    this.code = code;
  }
}

export const publicKeyFromBase64 = (base64) =>
  crypto.createPublicKey({ key: Buffer.from(base64, 'base64'), format: 'der', type: 'spki' });

/** True only when `signatureBase64` is a valid ed25519 signature of `bytes` by `publicKey`. */
export function verifyManifestSignature(bytes, signatureBase64, publicKey) {
  try {
    const signature = Buffer.from(String(signatureBase64).trim(), 'base64');
    return signature.length === 64 && crypto.verify(null, bytes, publicKey, signature);
  } catch {
    return false;
  }
}

export function signManifestBytes(bytes, privateKey) {
  return crypto.sign(null, bytes, privateKey).toString('base64');
}

/** Validates the manifest shape. Throws a ManifestError on anything unexpected. */
export function parseManifest(bytes) {
  if (bytes.length > MAX_MANIFEST_BYTES) throw new ManifestError('too_large', 'Manifest is too large');
  let data;
  try {
    data = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new ManifestError('invalid', 'Manifest is not valid JSON');
  }
  if (data === null || typeof data !== 'object' || data.schema !== UPDATE_MANIFEST_SCHEMA) {
    throw new ManifestError('invalid', 'Unsupported manifest schema');
  }
  if (!parseVersion(data.version) || /^v/.test(data.version)) throw new ManifestError('invalid', 'Invalid manifest version');
  if (typeof data.releaseDate !== 'string' || Number.isNaN(Date.parse(data.releaseDate))) {
    throw new ManifestError('invalid', 'Invalid release date');
  }
  if (!Array.isArray(data.files) || data.files.length === 0 || data.files.length > 32) {
    throw new ManifestError('invalid', 'Invalid file list');
  }
  const files = data.files.map((file) => {
    const valid =
      file !== null &&
      typeof file === 'object' &&
      PLATFORMS.has(file.platform) &&
      ARCHS.has(file.arch) &&
      KINDS.has(file.kind) &&
      typeof file.name === 'string' &&
      FILE_NAME.test(file.name) &&
      Number.isInteger(file.size) &&
      file.size > 0 &&
      typeof file.sha512 === 'string' &&
      SHA512_HEX.test(file.sha512);
    if (!valid) throw new ManifestError('invalid', 'Invalid file entry');
    return { platform: file.platform, arch: file.arch, kind: file.kind, name: file.name, size: file.size, sha512: file.sha512 };
  });
  return { schema: data.schema, version: data.version, releaseDate: data.releaseDate, files };
}

export const findManifestFile = (manifest, { platform, arch, kind }) =>
  manifest.files.find((file) => file.platform === platform && file.arch === arch && file.kind === kind) ?? null;

export function sha512OfFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha512');
    fs.createReadStream(filePath)
      .on('error', reject)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')));
  });
}

/** Builds the manifest of a release from the installer files on disk (used by the release workflow). */
export async function buildManifest({ version, releaseDate, entries }) {
  const files = [];
  for (const entry of entries) {
    const stat = fs.statSync(entry.path);
    files.push({
      platform: entry.platform,
      arch: entry.arch,
      kind: entry.kind,
      name: entry.name,
      size: stat.size,
      sha512: await sha512OfFile(entry.path),
    });
  }
  return { schema: UPDATE_MANIFEST_SCHEMA, version, releaseDate, files };
}
