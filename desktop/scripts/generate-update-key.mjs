#!/usr/bin/env node
/**
 * Generates the ed25519 key pair that signs the update manifest.
 *
 *   npm --prefix desktop run generate-update-key [-- <private-key-file>]
 *
 * The private key is written to a file OUTSIDE the repository (default: ~/.glassfolio-update-signing-key,
 * mode 600) and never printed. The public key is printed: paste it into desktop/update-public-key.mjs.
 * Then store the private key as the GitHub secret UPDATE_SIGNING_KEY:
 *
 *   gh secret set UPDATE_SIGNING_KEY < ~/.glassfolio-update-signing-key
 *
 * Keep a backup of the private key somewhere safe: losing it means shipping a new app version with a new
 * public key by hand, since installed apps only trust the key they were built with.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const target = path.resolve(process.argv[2] ?? path.join(os.homedir(), '.glassfolio-update-signing-key'));
if (fs.existsSync(target)) {
  console.error(`Refusing to overwrite ${target}. Pass another file name, or move the existing key first.`);
  process.exit(1);
}

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
fs.writeFileSync(target, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });

console.log(`Private key written to ${target} (not printed, keep it secret).`);
console.log('\nPublic key, to paste into desktop/update-public-key.mjs:\n');
console.log(publicKey.export({ type: 'spki', format: 'der' }).toString('base64'));
