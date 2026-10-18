#!/usr/bin/env node
/**
 * scripts/pre-commit-check.mjs
 * 
 * GlassFolio Local Pre-Commit Security Shield (< 1 sec execution)
 * Validates all staged files before committing:
 * 1. Blocks staged .env / secret / key files
 * 2. Scans for personal filesystem paths (/Users/...)
 * 3. Scans for real API keys and credentials (excluding test fixtures)
 * 4. Enforces SSOT architecture (zero direct localStorage & zero raw hex colors in TSX)
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const startTime = Date.now();

// 1. Get staged files
let stagedFiles = [];
try {
  const output = execSync('git diff --cached --name-only --diff-filter=ACMR', { encoding: 'utf-8' });
  stagedFiles = output.trim().split('\n').filter(Boolean);
} catch {
  // Not in git or diff failed
  process.exit(0);
}

if (stagedFiles.length === 0) {
  process.exit(0);
}

console.log(`\n🛡️  [Pre-Commit Shield] Scanning ${stagedFiles.length} staged file(s)...`);

let hasError = false;
const violations = [];

// Dynamic pattern to prevent self-triggering
const PERSONAL_PATH_PREFIX = '/' + 'Users/';
const personalPathRegex = new RegExp(PERSONAL_PATH_PREFIX + '[a-zA-Z0-9_.-]+', 'g');

// Forbidden staged filenames
const FORBIDDEN_FILE_PATTERNS = [
  /^\.env(?!\.example$)(?:\..+)?$/,
  /\.(pem|key|cert|crt|pfx|p12|pkcs12)$/i,
];

// High-risk secret patterns on added lines
const SECRET_PATTERNS = [
  { name: 'Google API Key', regex: /\bAIza[0-9A-Za-z\\-_]{35}\b/g },
  { name: 'GitHub Token', regex: /\b(?:ghp_[0-9A-Za-z]{36}|github_pat_[0-9A-Za-z_]{82})\b/g },
  { name: 'Slack Token', regex: /\bxox[baprs]-[0-9A-Za-z]{10,48}\b/g },
  { name: 'Private Key Block', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: 'OpenAI/Anthropic Secret Key', regex: /\b(?:sk|sk-ant|sk-proj)-[a-zA-Z0-9_-]{20,}\b/g },
  { name: 'Supabase Secret Token', regex: /\b(?:sbp_[a-zA-Z0-9]{30,}|sb_secret_[a-zA-Z0-9_-]{20,})\b/g },
];

// Known harmless test canary strings permitted in unit tests
const TEST_CANARY_ALLOWLIST = [
  'sk-1234567890abcdef1234567890',
  'sk-proj-xxxxx',
  'sk-abc123',
  'CANARY_',
];

// Self-excluding script paths
const SELF_EXCLUDED_SCRIPTS = [
  'scripts/check-standards.mjs',
  'scripts/pre-commit-check.mjs',
  'scripts/pre-commit.sh',
];

// Architectural patterns
const storageRegex = /\b(?:(?:window|globalThis)\.)?(?:localStorage|sessionStorage)\./g;
const hexRegex = /#[0-9a-fA-F]{3,6}\b/g;
const rawTailwindColorRegex = /\b(?:text|bg|border|ring|fill|stroke)-(?:emerald|rose|amber|yellow|lime|green|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|slate|gray|zinc|neutral|stone)-(?:50|100|200|300|400|500|600|700|800|900|950)\b/g;

for (const file of stagedFiles) {
  // A. Check forbidden file types
  const basename = path.basename(file);
  for (const forbiddenPat of FORBIDDEN_FILE_PATTERNS) {
    if (forbiddenPat.test(basename)) {
      violations.push({
        file,
        type: 'Forbidden Secret File Staged',
        detail: `Committing "${file}" is strictly prohibited by DevSecOps standards.`
      });
      hasError = true;
    }
  }

  // Skip deep diff inspection for self scripts or deleted/non-existent files
  if (SELF_EXCLUDED_SCRIPTS.includes(file) || !fs.existsSync(file)) {
    continue;
  }

  // Get staged added lines (+...) for this file
  let diffContent = '';
  try {
    diffContent = execSync(`git diff --cached -U0 -- "${file}"`, { encoding: 'utf-8' });
  } catch {
    continue;
  }

  const addedLines = diffContent
    .split('\n')
    .filter(line => line.startsWith('+') && !line.startsWith('+++'))
    .map(line => line.slice(1));

  const isTestFile = file.startsWith('tests/') || file.includes('.test.') || file.includes('.spec.');

  for (let i = 0; i < addedLines.length; i++) {
    const line = addedLines[i];

    // B. Check personal machine paths
    if (line.includes(PERSONAL_PATH_PREFIX)) {
      const matches = line.match(personalPathRegex);
      if (matches) {
        violations.push({
          file,
          type: 'Personal Local Path Leaked',
          detail: `Found personal path "${matches.join(', ')}" in staged diff:\n    > ${line.trim()}`
        });
        hasError = true;
      }
    }

    // C. Check secret patterns
    for (const { name, regex } of SECRET_PATTERNS) {
      const matches = line.match(regex);
      if (matches) {
        // Filter out test canary allowlist matches
        const realMatches = matches.filter(m => !TEST_CANARY_ALLOWLIST.some(canary => m.includes(canary)));
        if (realMatches.length > 0 && !isTestFile) {
          violations.push({
            file,
            type: `Potential Secret / Token (${name})`,
            detail: `Found potential secret matching pattern in staged diff:\n    > ${line.trim()}`
          });
          hasError = true;
        }
      }
    }

    // D. Check Architectural Standards on UI files (TS / TSX)
    if ((file.endsWith('.tsx') || file.endsWith('.ts')) && !isTestFile) {
      // Storage invariant
      if (
        !file.startsWith('src/services/security/') &&
        !file.startsWith('src/services/storage/') &&
        file !== 'src/types/storage.ts'
      ) {
        if (storageRegex.test(line)) {
          violations.push({
            file,
            type: 'Direct Storage Bypass',
            detail: `Direct localStorage/sessionStorage call prohibited in UI code:\n    > ${line.trim()}`
          });
          hasError = true;
        }
      }

      // Hex color invariant
      if (!file.includes('mockData') && !file.includes('src/constants/')) {
        const hexMatches = line.match(hexRegex);
        if (hexMatches) {
          violations.push({
            file,
            type: 'Hardcoded Hex Color',
            detail: `Direct hex color (${hexMatches.join(', ')}) violates THEME_INTENT design tokens:\n    > ${line.trim()}`
          });
          hasError = true;
        }
      }

      // Raw Tailwind palette invariant
      if (!file.includes('mockData') && !file.includes('src/constants/')) {
        const tailwindMatches = line.match(rawTailwindColorRegex);
        if (tailwindMatches) {
          violations.push({
            file,
            type: 'Raw Tailwind Palette Class',
            detail: `Raw Tailwind palette class (${tailwindMatches.join(', ')}) violates THEME_INTENT design tokens. Use semantic tokens instead:\n    > ${line.trim()}`
          });
          hasError = true;
        }
      }
    }
  }
}

const elapsedMs = Date.now() - startTime;

if (hasError) {
  console.error('\n❌  [Pre-Commit Shield] COMMIT ABORTED due to DevSecOps violations:\n');
  violations.forEach((v, idx) => {
    console.error(`  ${idx + 1}. [${v.type}] in ${v.file}`);
    console.error(`     ${v.detail.replace(/\n/g, '\n     ')}\n`);
  });
  console.error('👉 Remediate the above issues before committing.\n');
  process.exit(1);
} else {
  console.log(`✅  [Pre-Commit Shield] Verified clean in ${elapsedMs}ms. Commit allowed.\n`);
  process.exit(0);
}
