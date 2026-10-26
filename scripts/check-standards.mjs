#!/usr/bin/env node
/**
 * scripts/check-standards.mjs
 * 
 * Verifies code quality, theming compliance, and security architectural invariants:
 * 1. Zero hardcoded hex colors in TSX/TS components (AI_CODING_STANDARDS.md Section 1.1)
 * 2. Zero raw Tailwind color palette classes (AI_CODING_STANDARDS.md Section 1.2)
 * 3. Zero hardcoded rgb/rgba function literals (AI_CODING_STANDARDS.md Section 1.1)
 * 4. Zero direct localStorage / sessionStorage bypass outside allowed storage abstractions
 */

import fs from 'fs';
import path from 'path';

let hasError = false;

function getAllFiles(dirPath, arrayOfFiles = []) {
  if (!fs.existsSync(dirPath)) return arrayOfFiles;
  const files = fs.readdirSync(dirPath);

  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== 'node_modules' && file !== 'dist' && file !== 'coverage' && file !== '.git') {
        getAllFiles(fullPath, arrayOfFiles);
      }
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      const rel = path.relative(process.cwd(), fullPath).replace(/\\/g, '/');
      if (
        !rel.startsWith('tests/') &&
        !rel.includes('.test.') &&
        !rel.includes('.spec.') &&
        !rel.includes('vite.config') &&
        !rel.includes('vitest.config')
      ) {
        arrayOfFiles.push(rel);
      }
    }
  }
  return arrayOfFiles;
}

function stripComments(code) {
  let result = code.replace(/\/\*[\s\S]*?\*\//g, (match) => {
    const lineCount = (match.match(/\n/g) || []).length;
    return '\n'.repeat(lineCount);
  });
  return result.replace(/\/\/.*$/gm, '');
}

const sourceFiles = [];
getAllFiles(path.join(process.cwd(), 'src'), sourceFiles);

// ── 1. Check Hex Colors ────────────────────────────────────────────────────────
console.log('🎨 [1/5] Checking Design Standards: Zero hardcoded hex colors...');
const hexRegex = /#[0-9a-fA-F]{3,6}\b/g;
const hexViolations = [];

for (const file of sourceFiles) {
  if (file.includes('mockData') || file.includes('src/constants/')) {
    continue;
  }
  const raw = fs.readFileSync(file, 'utf-8');
  const stripped = stripComments(raw);
  const lines = stripped.split('\n');
  const orig = raw.split('\n');

  lines.forEach((line, idx) => {
    const matches = line.match(hexRegex);
    if (matches) {
      matches.forEach(m => {
        hexViolations.push({ file, line: idx + 1, match: m, content: orig[idx].trim() });
      });
    }
  });
}

if (hexViolations.length > 0) {
  console.error(`❌ Found ${hexViolations.length} hardcoded hex color(s):`);
  hexViolations.forEach(v => console.error(`  - ${v.file}:${v.line} -> "${v.match}" in "${v.content}"`));
  hasError = true;
} else {
  console.log(`✅ Zero hardcoded hex colors across ${sourceFiles.length} files.`);
}

// ── 2. Check Raw Tailwind Color Classes ────────────────────────────────────────
console.log('\n🌈 [2/5] Checking Semantic Tokens: Zero raw Tailwind palette classes...');
const rawTailwindColorRegex = /\b(?:text|bg|border|ring|fill|stroke)-(?:emerald|rose|amber|yellow|lime|green|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|slate|gray|zinc|neutral|stone)-(?:50|100|200|300|400|500|600|700|800|900|950)\b/g;
const rawTailwindViolations = [];

for (const file of sourceFiles) {
  if (file.includes('mockData') || file.includes('src/constants/')) {
    continue;
  }
  const raw = fs.readFileSync(file, 'utf-8');
  const stripped = stripComments(raw);
  const lines = stripped.split('\n');
  const orig = raw.split('\n');

  lines.forEach((line, idx) => {
    const matches = line.match(rawTailwindColorRegex);
    if (matches) {
      matches.forEach(m => {
        rawTailwindViolations.push({ file, line: idx + 1, match: m, content: orig[idx].trim() });
      });
    }
  });
}

if (rawTailwindViolations.length > 0) {
  console.error(`❌ Found ${rawTailwindViolations.length} raw Tailwind palette class(es):`);
  rawTailwindViolations.forEach(v => console.error(`  - ${v.file}:${v.line} -> "${v.match}" in "${v.content}"`));
  hasError = true;
} else {
  console.log(`✅ Zero raw Tailwind palette classes across ${sourceFiles.length} files.`);
}

// ── 3. Check RGB/RGBA Literals ────────────────────────────────────────────────
console.log('\n💡 [3/5] Checking Color Invariants: Zero raw rgb/rgba function calls...');
const rgbRegex = /\brgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+/g;
const rgbViolations = [];

for (const file of sourceFiles) {
  if (file.includes('mockData') || file.includes('src/constants/')) {
    continue;
  }
  const raw = fs.readFileSync(file, 'utf-8');
  const stripped = stripComments(raw);
  const lines = stripped.split('\n');
  const orig = raw.split('\n');

  lines.forEach((line, idx) => {
    const matches = line.match(rgbRegex);
    if (matches) {
      matches.forEach(m => {
        rgbViolations.push({ file, line: idx + 1, match: m, content: orig[idx].trim() });
      });
    }
  });
}

if (rgbViolations.length > 0) {
  console.error(`❌ Found ${rgbViolations.length} raw rgb/rgba literal(s):`);
  rgbViolations.forEach(v => console.error(`  - ${v.file}:${v.line} -> "${v.match}" in "${v.content}"`));
  hasError = true;
} else {
  console.log(`✅ Zero raw rgb/rgba literals across ${sourceFiles.length} files.`);
}

// ── 4. Check Storage Invariants ───────────────────────────────────────────────
console.log('\n🔒 [4/5] Checking Architectural Invariants: Zero direct storage bypass...');
const storageRegex = /\b(?:(?:window|globalThis)\.)?(?:localStorage|sessionStorage)\./g;
const storageViolations = [];

for (const file of sourceFiles) {
  if (
    file.startsWith('src/services/security/') ||
    file.startsWith('src/services/storage/') ||
    file === 'src/types/storage.ts' ||
    file.endsWith('src/types/storage.ts')
  ) {
    continue;
  }
  const raw = fs.readFileSync(file, 'utf-8');
  const stripped = stripComments(raw);
  const lines = stripped.split('\n');
  const orig = raw.split('\n');

  lines.forEach((line, idx) => {
    const matches = line.match(storageRegex);
    if (matches) {
      matches.forEach(m => {
        storageViolations.push({ file, line: idx + 1, match: m, content: orig[idx].trim() });
      });
    }
  });
}

if (storageViolations.length > 0) {
  console.error(`❌ Found ${storageViolations.length} direct localStorage/sessionStorage call(s):`);
  storageViolations.forEach(v => console.error(`  - ${v.file}:${v.line} -> "${v.match}" in "${v.content}"`));
  hasError = true;
} else {
  console.log('✅ Zero direct localStorage/sessionStorage bypasses detected.');
}

// ── 5. Check Personal Machine Paths ──────────────────────────────────────────
console.log('\n🛡️ [5/5] Checking DevSecOps Standards: Zero personal machine paths (/Users/)...');
const personalPathPattern = '/' + 'Users/[a-zA-Z0-9_.-]+';
const personalPathRegex = new RegExp(personalPathPattern, 'g');
const pathViolations = [];

let allTextFiles = [];
try {
  const { execSync } = await import('child_process');
  const tracked = execSync('git ls-files', { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
  allTextFiles = tracked.filter(rel => {
    const ext = path.extname(rel).toLowerCase();
    return (
      ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.yml', '.yaml', '.html'].includes(ext) &&
      rel !== 'scripts/check-standards.mjs' &&
      rel !== 'scripts/pre-commit-check.mjs' &&
      !rel.endsWith('pre-commit.sh')
    );
  });
} catch {
  function getAllTextFiles(dirPath, arrayOfFiles = []) {
    if (!fs.existsSync(dirPath)) return arrayOfFiles;
    const files = fs.readdirSync(dirPath);

    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      if (fs.statSync(fullPath).isDirectory()) {
        if (
          file !== 'node_modules' &&
          file !== 'dist' &&
          file !== 'coverage' &&
          file !== '.git' &&
          file !== '.gemini' &&
          file !== '.vscode' &&
          file !== '.idea' &&
          file !== '.cursor' &&
          file !== '.claude'
        ) {
          getAllTextFiles(fullPath, arrayOfFiles);
        }
      } else {
        const rel = path.relative(process.cwd(), fullPath).replace(/\\/g, '/');
        const ext = path.extname(file).toLowerCase();
        if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.yml', '.yaml', '.html'].includes(ext)) {
          if (
            rel !== 'scripts/check-standards.mjs' &&
            rel !== 'scripts/pre-commit-check.mjs' &&
            !rel.endsWith('pre-commit.sh')
          ) {
            arrayOfFiles.push(rel);
          }
        }
      }
    }
    return arrayOfFiles;
  }
  allTextFiles = getAllTextFiles(process.cwd());
}

for (const file of allTextFiles) {
  if (!fs.existsSync(file)) continue;
  const raw = fs.readFileSync(file, 'utf-8');
  const lines = raw.split('\n');
  lines.forEach((line, idx) => {
    const matches = line.match(personalPathRegex);
    if (matches) {
      matches.forEach(m => {
        pathViolations.push({ file, line: idx + 1, match: m, content: line.trim() });
      });
    }
  });
}

if (pathViolations.length > 0) {
  console.error(`❌ Found ${pathViolations.length} personal machine path(s):`);
  pathViolations.forEach(v => console.error(`  - ${v.file}:${v.line} -> "${v.match}" in "${v.content}"`));
  hasError = true;
} else {
  console.log(`✅ Zero personal machine paths detected across ${allTextFiles.length} tracked text files.`);
}

if (hasError) {
  process.exit(1);
} else {
  console.log('\n🌟 All architectural, theming, design, and DevSecOps standards passed successfully!\n');
  process.exit(0);
}
