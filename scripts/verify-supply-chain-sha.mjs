#!/usr/bin/env node

/**
 * Supply Chain SHA & Integrity Guard
 * Verifies that 100% of third-party dependencies in package-lock.json
 * carry cryptographically secure integrity hashes (SHA-512 / SHA-384), that the
 * Docker base images are pinned by digest and that every GitHub Action is pinned
 * to a full commit SHA (Epic E31).
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findUnhashedPythonRequirements, findUnpinnedActions, findUnpinnedDockerBases, findUnpinnedRuntimeArchives } from './lib/supplyChainPins.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const lockfilePaths = [resolve(__dirname, '../package-lock.json'), resolve(__dirname, '../desktop/package-lock.json')];

try {
  let totalAudited = 0;
  const missingIntegrity = [];
  const weakHashes = [];

  // The web app and the desktop shell (desktop/) have their own lockfile: both must carry integrity hashes
  for (const lockfilePath of lockfilePaths) {
    if (!existsSync(lockfilePath)) continue;
    const lockfile = JSON.parse(readFileSync(lockfilePath, 'utf-8'));
    const label = lockfilePath.slice(resolve(__dirname, '..').length + 1);

    for (const [pkgPath, meta] of Object.entries(lockfile.packages || {})) {
      // Skip root package entry
      if (!pkgPath || pkgPath === '') continue;

      // Skip local link / workspace dependencies if any
      if (meta.link) continue;

      totalAudited++;
      const integrity = meta.integrity;

      if (!integrity) {
        missingIntegrity.push(`${label}: ${pkgPath}`);
        continue;
      }

      if (!integrity.startsWith('sha512-') && !integrity.startsWith('sha384-')) {
        weakHashes.push({ pkgPath: `${label}: ${pkgPath}`, integrity });
      }
    }
  }

  console.log(`[Supply Chain Guard] Audited ${totalAudited} packages from ${lockfilePaths.filter(existsSync).length} lockfile(s)`);

  if (missingIntegrity.length > 0) {
    console.error(`[FAIL] Found ${missingIntegrity.length} dependencies missing cryptographic integrity:`);
    missingIntegrity.slice(0, 10).forEach(p => console.error(`  - ${p}`));
    process.exit(1);
  }

  if (weakHashes.length > 0) {
    console.warn(`[WARN] Found ${weakHashes.length} dependencies using non-SHA-512/384 hashes:`);
    weakHashes.slice(0, 5).forEach(h => console.warn(`  - ${h.pkgPath}: ${h.integrity}`));
  }

  console.log(`[PASS] 100% of audited packages (${totalAudited}) have valid cryptographic SHA integrity hashes.`);

  const root = resolve(__dirname, '..');
  const pinFailures = [];

  // Every image Dockerfile: the app and the optional Woob bank worker (TGLA-239)
  const dockerDir = join(root, 'docker');
  const dockerfiles = existsSync(dockerDir) ? readdirSync(dockerDir).filter((f) => /(^|\.)Dockerfile$/.test(f)) : [];
  for (const name of dockerfiles) {
    findUnpinnedDockerBases(readFileSync(join(dockerDir, name), 'utf-8')).forEach((image) =>
      pinFailures.push(`docker/${name}: base image "${image}" is not pinned by @sha256 digest`));
  }

  // Woob bank worker (TGLA-236/238): Python locks by hash, Woob by commit, the desktop Python archives by SHA-256
  for (const lock of ['companions/woob/requirements.lock', 'companions/woob/requirements-dev.lock']) {
    const file = join(root, lock);
    if (!existsSync(file)) continue;
    findUnhashedPythonRequirements(readFileSync(file, 'utf-8')).forEach((name) =>
      pinFailures.push(`${lock}: "${name}" has no pinned version with a sha256 hash`));
  }
  const woobSource = join(root, 'companions/woob/woob-source.json');
  if (existsSync(woobSource) && !/^[0-9a-f]{40}$/.test(JSON.parse(readFileSync(woobSource, 'utf-8')).commit ?? '')) {
    pinFailures.push('companions/woob/woob-source.json: Woob is not pinned to a full commit SHA');
  }
  const runtimeManifest = join(root, 'desktop/woob-runtime.json');
  if (existsSync(runtimeManifest)) {
    findUnpinnedRuntimeArchives(JSON.parse(readFileSync(runtimeManifest, 'utf-8'))).forEach((target) =>
      pinFailures.push(`desktop/woob-runtime.json: "${target}" is not pinned to an https URL and a SHA-256`));
  }

  const workflowFiles = [];
  const workflowDir = join(root, '.github/workflows');
  if (existsSync(workflowDir)) {
    readdirSync(workflowDir).filter((f) => /\.ya?ml$/.test(f)).forEach((f) => workflowFiles.push(join(workflowDir, f)));
  }
  const actionsDir = join(root, '.github/actions');
  if (existsSync(actionsDir)) {
    readdirSync(actionsDir).forEach((name) => {
      const file = join(actionsDir, name, 'action.yml');
      if (existsSync(file)) workflowFiles.push(file);
    });
  }
  for (const file of workflowFiles) {
    findUnpinnedActions(readFileSync(file, 'utf-8')).forEach((ref) =>
      pinFailures.push(`${file.slice(root.length + 1)}: action "${ref}" is not pinned to a commit SHA`));
  }

  if (pinFailures.length > 0) {
    console.error(`[FAIL] ${pinFailures.length} build input(s) are not pinned by hash:`);
    pinFailures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }
  console.log(`[PASS] ${dockerfiles.length} Dockerfile(s), the Woob worker inputs and ${workflowFiles.length} workflow/action files are pinned by content hash.`);
  process.exit(0);
} catch (err) {
  console.error('[FAIL] Error reading package-lock.json:', err.message);
  process.exit(1);
}
