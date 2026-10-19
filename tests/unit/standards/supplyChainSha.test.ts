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
