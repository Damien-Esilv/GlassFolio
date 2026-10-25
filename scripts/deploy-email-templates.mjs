#!/usr/bin/env node
/**
 * scripts/deploy-email-templates.mjs (Epic E25 — TGLA-084)
 *
 * Deploys the branded Supabase Auth email templates via the Management API.
 *
 *   node scripts/deploy-email-templates.mjs              # dry-run (default): shows what would change
 *   node scripts/deploy-email-templates.mjs --preview d  # also writes rendered HTML per language into dir d
 *   node scripts/deploy-email-templates.mjs --apply      # PATCHes the live project auth config
 *
 * Requires SUPABASE_ACCESS_TOKEN and VITE_SUPABASE_URL (read from the environment or .env).
 * The script is idempotent: unchanged fields are skipped.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    buildAuthConfigPayload,
    loadLocales,
    renderHtml,
    EMAIL_EVENTS,
} from './lib/emailTemplates.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const TEMPLATES_DIR = join(ROOT, 'supabase', 'templates');

function readDotEnv() {
    const envPath = join(ROOT, '.env');
    const values = {};
    if (!existsSync(envPath)) return values;
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (match) values[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
    return values;
}

function getArg(name) {
    const index = process.argv.indexOf(name);
    return index === -1 ? null : (process.argv[index + 1] ?? true);
}

function writePreviews(dir) {
    const locales = loadLocales(TEMPLATES_DIR);
    const layout = readFileSync(join(TEMPLATES_DIR, 'layout.html'), 'utf8');
    mkdirSync(dir, { recursive: true });
    for (const lang of Object.keys(locales)) {
        for (const event of Object.keys(EMAIL_EVENTS)) {
            writeFileSync(join(dir, `${event}.${lang}.html`), renderHtml(layout, locales, lang, event));
        }
    }
    console.log(`🖼  Previews written to ${dir}`);
}

async function main() {
    const env = { ...readDotEnv(), ...process.env };
    const apply = process.argv.includes('--apply');
    const previewDir = getArg('--preview');

    const payload = buildAuthConfigPayload(TEMPLATES_DIR);
    console.log(`📦 Built ${Object.keys(payload).length} auth config fields from ${Object.keys(loadLocales(TEMPLATES_DIR)).join(', ')}`);
    if (typeof previewDir === 'string') writePreviews(previewDir);

    const token = env.SUPABASE_ACCESS_TOKEN;
    const projectUrl = env.VITE_SUPABASE_URL;
    const ref = projectUrl?.match(/^https:\/\/([^.]+)\./)?.[1];
    if (!token || !ref) {
        console.error('❌ SUPABASE_ACCESS_TOKEN and VITE_SUPABASE_URL are required.');
        process.exit(1);
    }

    const endpoint = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    const currentRes = await fetch(endpoint, { headers });
    if (!currentRes.ok) {
        const errDetails = await currentRes.text().catch(() => '');
        console.error(`❌ Could not read current auth config (HTTP ${currentRes.status}): ${errDetails}`);
        process.exit(1);
    }
    const current = await currentRes.json();

    const changed = Object.fromEntries(
        Object.entries(payload).filter(([key, value]) => current[key] !== value)
    );
    const keys = Object.keys(changed);
    if (keys.length === 0) {
        console.log('✅ Live configuration already up to date. Nothing to do.');
        return;
    }
    console.log(`🔄 ${keys.length} field(s) differ from the live configuration:`);
    keys.forEach((key) => console.log(`   - ${key}`));

    if (!apply) {
        console.log('\nℹ️  Dry-run only. Re-run with --apply to update the live project.');
        return;
    }

    const res = await fetch(endpoint, { method: 'PATCH', headers, body: JSON.stringify(changed) });
    if (!res.ok) {
        console.error(`❌ PATCH failed (HTTP ${res.status}): ${await res.text()}`);
        process.exit(1);
    }
    console.log('✅ Email templates deployed.');
}

main().catch((err) => {
    console.error('❌', err instanceof Error ? err.message : err);
    process.exit(1);
});
