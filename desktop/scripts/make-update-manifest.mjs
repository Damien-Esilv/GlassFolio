#!/usr/bin/env node
/**
 * Release workflow step: builds and signs the update manifest from the installers of a release.
 *
 *   node desktop/scripts/make-update-manifest.mjs <installers-dir> <version> <output-dir>
 *
 * The private key comes from the UPDATE_SIGNING_KEY environment variable (PEM). It is never logged.
 * Also writes SHA256SUMS.txt so people can check a download by hand.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { UPDATE_MANIFEST_NAME, UPDATE_SIGNATURE_NAME } from '../lib/constants.mjs';
import { buildManifest, signManifestBytes } from '../lib/updateManifest.mjs';

/** Installer name -> manifest entry. Names are fixed in electron-builder.yml. */
const INSTALLERS = [
  { name: 'GlassFolio-mac-arm64.zip', platform: 'mac', arch: 'arm64', kind: 'zip' },
  { name: 'GlassFolio-mac-x64.zip', platform: 'mac', arch: 'x64', kind: 'zip' },
  { name: 'GlassFolio-mac-arm64.dmg', platform: 'mac', arch: 'arm64', kind: 'dmg' },
  { name: 'GlassFolio-mac-x64.dmg', platform: 'mac', arch: 'x64', kind: 'dmg' },
  { name: 'GlassFolio-win-x64.exe', platform: 'win', arch: 'x64', kind: 'exe' },
  { name: 'GlassFolio-linux-x64.AppImage', platform: 'linux', arch: 'x64', kind: 'appimage' },
  { name: 'GlassFolio-linux-x64.deb', platform: 'linux', arch: 'x64', kind: 'deb' },
];

const [installersDir, version, outputDir] = process.argv.slice(2);
if (!installersDir || !version || !outputDir) {
  console.error('Usage: make-update-manifest.mjs <installers-dir> <version> <output-dir>');
  process.exit(1);
}
const keyPem = process.env.UPDATE_SIGNING_KEY;
if (!keyPem) {
  console.error('UPDATE_SIGNING_KEY is not set: refusing to publish an unsigned update manifest.');
  process.exit(1);
}

const entries = INSTALLERS.map((installer) => ({ ...installer, path: path.join(installersDir, installer.name) })).filter((entry) =>
  fs.existsSync(entry.path),
);
if (entries.length === 0) {
  console.error(`No installer found in ${installersDir}`);
  process.exit(1);
}

const manifest = await buildManifest({ version, releaseDate: new Date().toISOString(), entries });
const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
const signature = signManifestBytes(bytes, crypto.createPrivateKey(keyPem));

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, UPDATE_MANIFEST_NAME), bytes);
fs.writeFileSync(path.join(outputDir, UPDATE_SIGNATURE_NAME), `${signature}\n`);

const sums = [];
for (const entry of entries) {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(entry.path)).digest('hex');
  sums.push(`${hash}  ${entry.name}`);
}
fs.writeFileSync(path.join(outputDir, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`);

console.log(`Signed manifest for v${version}: ${entries.map((entry) => entry.name).join(', ')}`);
