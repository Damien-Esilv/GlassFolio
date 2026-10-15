#!/usr/bin/env node
/**
 * scripts/check-standards.mjs
 * 
 * Verifies code quality and security architectural invariants:
 * 1. Zero hardcoded hex colors in TSX/TS components (AI_CODING_STANDARDS.md Section 1.1)
 * 2. Zero direct localStorage / sessionStorage bypass outside allowed storage abstractions
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

console.log('🎨 [1/2] Checking Design Standards: Zero hardcoded hex colors...');
const sourceFiles = [];
for (const dir of ['components', 'pages', 'context', 'hooks', 'src']) {
  getAllFiles(path.join(process.cwd(), dir), sourceFiles);
}
if (fs.existsSync(path.join(process.cwd(), 'App.tsx'))) {
  sourceFiles.push('App.tsx');
}

const hexRegex = /#[0-9a-fA-F]{3,6}\b/g;
const hexViolations = [];

for (const file of sourceFiles) {
  if (
    file.includes('mockData') ||
    file.includes('src/constants/')
  ) {
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

console.log('\n🔒 [2/2] Checking Architectural Invariants: Zero direct storage bypass...');

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

if (hasError) {
  process.exit(1);
} else {
  console.log('\n🌟 All architectural and design standards passed successfully!\n');
  process.exit(0);
}
