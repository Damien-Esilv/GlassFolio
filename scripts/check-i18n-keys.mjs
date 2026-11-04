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
const SRC_DIRS = [join(ROOT, 'src')];

const SUPPORTED_LOCALES = ['en', 'fr'];
const REPORT_MODE = process.argv.includes('--report');
const PLURAL_SUFFIX_RE = /_(zero|one|two|few|many|other)$/;

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
 * Flatten a nested i18n JSON object into [dot-notation key, value] pairs.
 */
function flattenKeyEntries(obj, prefix = '') {
  const entries = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      entries.push(...flattenKeyEntries(v, fullKey));
    } else {
      entries.push([fullKey, v]);
    }
  }
  return entries;
}

function extractPlaceholders(value) {
  if (typeof value !== 'string') return [];
  const matches = value.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g);
  return Array.from(new Set(Array.from(matches, (m) => m[1]))).sort();
}

/**
 * Load all keys and raw string values for a given locale across all namespace files.
 * Namespace files are named like 'common.json', 'portfolio.json', etc.
 * Keys are stored as 'namespace:dotted.key'.
 */
function loadLocaleKeys(locale) {
  const localeDir = join(LOCALES_DIR, locale);
  const allKeys = new Set();
  const valuesMap = new Map();
  try {
    const files = readdirSync(localeDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const namespace = file.replace('.json', '');
      const raw = JSON.parse(readFileSync(join(localeDir, file), 'utf8'));
      const entries = flattenKeyEntries(raw);
      for (const [key, val] of entries) {
        const nsKey = `${namespace}:${key}`;
        allKeys.add(nsKey);
        if (typeof val === 'string') {
          valuesMap.set(nsKey, val);
        }
        // Also add without namespace prefix for backward compat
        allKeys.add(key);
        // i18next plural variants (key_one, key_other...) satisfy the base key used with { count }
        const base = key.replace(PLURAL_SUFFIX_RE, '');
        if (base !== key) {
          allKeys.add(`${namespace}:${base}`);
          allKeys.add(base);
        }
      }
    }
  } catch (e) {
    console.warn(`[i18n-check] Could not load locale '${locale}': ${e.message}`);
  }
  return { allKeys, valuesMap };
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log('🔍 GlassFolio i18n key audit\n');

// 1. Load locale keys
const localeKeys = {};
const localeValues = {};
for (const locale of SUPPORTED_LOCALES) {
  const { allKeys, valuesMap } = loadLocaleKeys(locale);
  localeKeys[locale] = allKeys;
  localeValues[locale] = valuesMap;
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

// 5. Check EN <-> FR {{placeholder}} interpolation parity & empty translation strings
const enValues = localeValues.en ?? new Map();
const frValues = localeValues.fr ?? new Map();
const placeholderMismatches = [];

for (const [nsKey, enVal] of enValues.entries()) {
  if (!frValues.has(nsKey)) continue;
  const frVal = frValues.get(nsKey);
  const enPlaceholders = extractPlaceholders(enVal);
  const frPlaceholders = extractPlaceholders(frVal);

  if (enPlaceholders.join(',') !== frPlaceholders.join(',')) {
    placeholderMismatches.push(
      `${nsKey}: en={{${enPlaceholders.join(', ')}}} vs fr={{${frPlaceholders.join(', ')}}}`
    );
  } else if ((enVal.trim().length > 0) !== (frVal.trim().length > 0)) {
    placeholderMismatches.push(`${nsKey}: empty string mismatch between en and fr`);
  }
}

if (placeholderMismatches.length === 0) {
  console.log('  ✅  en <-> fr: interpolation {{placeholder}} parity verified');
} else {
  console.log(`  ❌  en <-> fr: ${placeholderMismatches.length} interpolation/empty mismatch(es)`);
  for (const mismatch of placeholderMismatches) {
    console.log(`       - ${mismatch}`);
  }
  totalIssues += placeholderMismatches.length;
}

// 6. Exit code
if (totalIssues > 0) {
  console.log(`\n⚠️  ${totalIssues} i18n issue(s) detected.`);
  console.log('   Run with --report for details.');
  process.exit(1);
} else {
  console.log('\n✅  i18n audit passed — all locales are complete.');
  process.exit(0);
}
