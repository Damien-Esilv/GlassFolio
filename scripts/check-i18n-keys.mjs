#!/usr/bin/env node
/**
 * scripts/check-i18n-keys.mjs
 * 
 * Audit script: detects i18n keys used in source code but missing from
 * one or more locale files.
 *
 * Usage:
 *   node scripts/check-i18n-keys.mjs          # exits 0 if clean, 1 if issues
 *   node scripts/check-i18n-keys.mjs --report # prints full report
 *
 * AI_CODING_STANDARDS.md Rule R01: all text must exist in both en/ and fr/.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const LOCALES_DIR = join(ROOT, 'locales');
const SRC_DIRS = [
  join(ROOT, 'pages'),
  join(ROOT, 'components'),
  join(ROOT, 'context'),
  join(ROOT, 'hooks'),
  join(ROOT, 'App.tsx'),
];

const SUPPORTED_LOCALES = ['en', 'fr'];
const REPORT_MODE = process.argv.includes('--report');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Walk a directory tree and return all .ts / .tsx files.
 */
function walkDir(dir) {
  const entries = [];
  try {
    const items = readdirSync(dir);
    for (const item of items) {
      const fullPath = join(dir, item);
      const stat = statSync(fullPath);
      if (stat.isDirectory() && item !== 'node_modules') {
        entries.push(...walkDir(fullPath));
      } else if (['.ts', '.tsx'].includes(extname(item))) {
        entries.push(fullPath);
      }
    }
  } catch {
    // Entry may be a file, not dir
    if (['.ts', '.tsx'].includes(extname(dir))) entries.push(dir);
  }
  return entries;
}

/**
 * Extract all t('key') and t("key") usages from source code.
 * Also handles t('namespace:key') format.
 */
function extractI18nKeys(fileContent) {
  const keys = new Set();
  // Matches: t('key'), t("key"), t(`key`), useTranslation('ns') calls included
  const regex = /\bt\(\s*['"`]([^'"`\s,)]+)['"`]/g;
  let match;
  while ((match = regex.exec(fileContent)) !== null) {
    keys.add(match[1]);
  }
  return keys;
}

/**
 * Flatten a nested i18n JSON object into dot-notation keys.
 * e.g. { nav: { dashboard: 'Dashboard' } } → ['nav.dashboard']
 */
function flattenKeys(obj, prefix = '') {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      keys.push(...flattenKeys(v, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

/**
 * Load all keys for a given locale across all namespace files.
 * Namespace files are named like 'common.json', 'portfolio.json', etc.
 * Keys are stored as 'namespace:dotted.key'.
 */
function loadLocaleKeys(locale) {
  const localeDir = join(LOCALES_DIR, locale);
  const allKeys = new Set();
  try {
    const files = readdirSync(localeDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const namespace = file.replace('.json', '');
      const raw = JSON.parse(readFileSync(join(localeDir, file), 'utf8'));
      const flat = flattenKeys(raw);
      for (const key of flat) {
        allKeys.add(`${namespace}:${key}`);
        // Also add without namespace prefix for backward compat
        allKeys.add(key);
      }
    }
  } catch (e) {
    console.warn(`[i18n-check] Could not load locale '${locale}': ${e.message}`);
  }
  return allKeys;
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log('🔍 GlassFolio i18n key audit\n');

// 1. Load locale keys
const localeKeys = {};
for (const locale of SUPPORTED_LOCALES) {
  localeKeys[locale] = loadLocaleKeys(locale);
  console.log(`  ${locale}: ${localeKeys[locale].size} keys loaded`);
}

// 2. Collect all source files
const sourceFiles = SRC_DIRS.flatMap(d => walkDir(d));
console.log(`\n  Source files scanned: ${sourceFiles.length}`);

// 3. Extract used keys
const usedKeys = new Set();
const keyOrigins = new Map(); // key → [files...]
for (const file of sourceFiles) {
  try {
    const content = readFileSync(file, 'utf8');
    const keys = extractI18nKeys(content);
    for (const key of keys) {
      usedKeys.add(key);
      const prev = keyOrigins.get(key) ?? [];
      keyOrigins.set(key, [...prev, relative(ROOT, file)]);
    }
  } catch {
    // skip unreadable files
  }
}

console.log(`  Unique i18n keys in use: ${usedKeys.size}\n`);

// 4. Check missing keys per locale
let totalIssues = 0;

for (const locale of SUPPORTED_LOCALES) {
  const missing = [];
  const keysArray = Array.from(localeKeys[locale]);
  for (const key of usedKeys) {
    if (key.includes('${')) {
      const prefix = key.split('${')[0];
      const hasMatchingPrefix = keysArray.some(k => k.startsWith(prefix));
      if (!hasMatchingPrefix) {
        missing.push(key);
      }
    } else if (!localeKeys[locale].has(key)) {
      missing.push(key);
    }
  }

  if (missing.length === 0) {
    console.log(`  ✅  ${locale}: all keys present`);
  } else {
    console.log(`  ❌  ${locale}: ${missing.length} key(s) missing`);
    totalIssues += missing.length;

    if (REPORT_MODE) {
      for (const key of missing) {
        const origins = keyOrigins.get(key)?.slice(0, 3).join(', ') ?? 'unknown';
        console.log(`       - ${key}  (used in: ${origins})`);
      }
    }
  }
}

// 5. Exit code
if (totalIssues > 0) {
  console.log(`\n⚠️  ${totalIssues} missing i18n key(s) detected.`);
  console.log('   Run with --report for details.');
  process.exit(1);
} else {
  console.log('\n✅  i18n audit passed — all locales are complete.');
  process.exit(0);
}
