import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Supply Chain SHA Integrity Standards', () => {
  it('verifies package-lock.json exists and has valid packages', () => {
    const lockfilePath = resolve(process.cwd(), 'package-lock.json');
    expect(existsSync(lockfilePath)).toBe(true);

    const lockfile = JSON.parse(readFileSync(lockfilePath, 'utf-8'));
    expect(lockfile.packages).toBeDefined();
    expect(Object.keys(lockfile.packages).length).toBeGreaterThan(50);
  });

  it('runs scripts/verify-supply-chain-sha.mjs with 0 exit code', () => {
    const output = execSync('node scripts/verify-supply-chain-sha.mjs', {
      encoding: 'utf-8',
      cwd: process.cwd(),
    });

    expect(output).toContain('[Supply Chain Guard] Audited');
    expect(output).toContain('[PASS] 100% of audited packages');
  });
});

describe('Build input pinning (Epic E31)', () => {
  const digest = 'sha256:' + 'a'.repeat(64);
  const sha = 'b'.repeat(40);

  it('flags Docker base images without a digest but accepts stage aliases and scratch', async () => {
    const { findUnpinnedDockerBases } = await import('../../../scripts/lib/supplyChainPins.mjs');
    const dockerfile = [
      '# syntax=docker/dockerfile:1',
      `FROM node:22-alpine@${digest} AS builder`,
      'FROM --platform=linux/amd64 node:22-alpine AS runner',
      'FROM builder AS final',
      'FROM scratch',
    ].join('\n');
    expect(findUnpinnedDockerBases(dockerfile)).toEqual(['docker/dockerfile:1', 'node:22-alpine']);
    expect(findUnpinnedDockerBases(`# syntax=docker/dockerfile:1@${digest}\nFROM x@${digest}`)).toEqual([]);
  });

  it('flags GitHub Actions that are not pinned to a commit SHA but accepts local actions', async () => {
    const { findUnpinnedActions } = await import('../../../scripts/lib/supplyChainPins.mjs');
    const workflow = [
      `      - uses: actions/checkout@${sha} # v4`,
      '      - uses: actions/setup-node@v4',
      '        uses: ./.github/actions/setup',
    ].join('\n');
    expect(findUnpinnedActions(workflow)).toEqual(['actions/setup-node@v4']);
  });

  it('keeps the repository Dockerfile and workflows pinned', () => {
    const output = execSync('node scripts/verify-supply-chain-sha.mjs', { encoding: 'utf-8', cwd: process.cwd() });
    expect(output).toContain('pinned by content hash');
  });
});
