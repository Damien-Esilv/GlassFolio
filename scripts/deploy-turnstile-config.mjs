#!/usr/bin/env node
/**
 * scripts/deploy-turnstile-config.mjs (Epic E22 — TGLA-169)
 *
 * Configures Cloudflare Turnstile anti-bot protection on Supabase Auth via the Management API.
 *
 *   node scripts/deploy-turnstile-config.mjs          # dry-run (default): checks current status & shows diff
 *   node scripts/deploy-turnstile-config.mjs --apply  # PATCHes the live project auth config
 *
 * Requires:
 *   - SUPABASE_ACCESS_TOKEN (Supabase Management API personal access token)
 *   - VITE_SUPABASE_URL (Project URL to extract project reference)
 *   - TURNSTILE_SECRET_KEY (Cloudflare Turnstile secret key)
 *
 * Idempotent: if Turnstile is already enabled with matching provider and secret, no change is made.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const getRoot = () => {
    try {
        if (typeof import.meta.url === 'string' && import.meta.url.startsWith('file:')) {
            return join(fileURLToPath(new URL('.', import.meta.url)), '..');
        }
    } catch {
        // fallback
    }
    return process.cwd();
};

const ROOT = getRoot();

export function readDotEnv() {
    const envPath = join(ROOT, '.env');
    const values = {};
    if (!existsSync(envPath)) return values;
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (match) values[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
    return values;
}

export function extractProjectRef(projectUrl) {
    if (!projectUrl) return null;
    const match = projectUrl.match(/^https:\/\/([^.]+)\./);
    return match ? match[1] : null;
}

export function buildTurnstileConfigPayload(secretKey) {
    return {
        security_captcha_enabled: true,
        security_captcha_provider: 'turnstile',
        security_captcha_secret: secretKey,
    };
}

export async function runDeployTurnstile(options = {}) {
    const env = { ...readDotEnv(), ...process.env, ...options.env };
    const apply = options.apply ?? process.argv.includes('--apply');

    const token = env.SUPABASE_ACCESS_TOKEN;
    const projectUrl = env.VITE_SUPABASE_URL;
    const secretKey = env.TURNSTILE_SECRET_KEY;
    const ref = extractProjectRef(projectUrl);

    if (!token || !ref) {
        console.error('❌ SUPABASE_ACCESS_TOKEN and VITE_SUPABASE_URL are required.');
        return { success: false, reason: 'missing_supabase_credentials' };
    }

    if (!secretKey) {
        if (!apply) {
            console.log('ℹ️  TURNSTILE_SECRET_KEY is not defined in environment. Checking live Supabase Auth status only...');
        } else {
            console.error('❌ TURNSTILE_SECRET_KEY is required to apply Turnstile anti-bot configuration.');
            return { success: false, reason: 'missing_turnstile_secret' };
        }
    }

    const endpoint = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    console.log(`🔍 Inspecting Supabase Auth config for project [${ref}]...`);
    const currentRes = await fetch(endpoint, { headers });
    if (!currentRes.ok) {
        const errDetails = await currentRes.text().catch(() => '');
        console.error(`❌ Could not read current auth config (HTTP ${currentRes.status}): ${errDetails}`);
        return { success: false, reason: 'fetch_failed', status: currentRes.status };
    }
    const current = await currentRes.json();

    const currentCaptchaEnabled = Boolean(current.security_captcha_enabled);
    const currentProvider = current.security_captcha_provider;
    console.log(`📊 Live Auth Captcha Status: enabled=${currentCaptchaEnabled}, provider=${currentProvider || 'none'}`);

    if (!secretKey) {
        return { success: true, liveStatus: { enabled: currentCaptchaEnabled, provider: currentProvider } };
    }

    const payload = buildTurnstileConfigPayload(secretKey);
    const changed = {};

    if (current.security_captcha_enabled !== payload.security_captcha_enabled) {
        changed.security_captcha_enabled = payload.security_captcha_enabled;
    }
    if (current.security_captcha_provider !== payload.security_captcha_provider) {
        changed.security_captcha_provider = payload.security_captcha_provider;
    }
    if (current.security_captcha_secret !== payload.security_captcha_secret) {
        changed.security_captcha_secret = payload.security_captcha_secret;
    }

    const diffKeys = Object.keys(changed);
    if (diffKeys.length === 0) {
        console.log('✅ Supabase Auth Turnstile configuration is already up to date.');
        return { success: true, changed: false };
    }

    console.log(`🔄 ${diffKeys.length} field(s) differ or will be updated:`);
    diffKeys.forEach((key) => console.log(`   - ${key}: ${key === 'security_captcha_secret' ? '********' : changed[key]}`));

    if (!apply) {
        console.log('\nℹ️  Dry-run only. Re-run with --apply (npm run deploy:turnstile:apply) to update the live project.');
        return { success: true, changed: true, applied: false };
    }

    console.log('🚀 Applying Turnstile anti-bot configuration to Supabase Auth...');
    const patchRes = await fetch(endpoint, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload),
    });

    if (!patchRes.ok) {
        const errDetails = await patchRes.text().catch(() => '');
        console.error(`❌ Failed to update Supabase Auth config (HTTP ${patchRes.status}): ${errDetails}`);
        return { success: false, reason: 'patch_failed', status: patchRes.status };
    }

    console.log('🎉 Successfully enabled Cloudflare Turnstile anti-bot on Supabase Auth!');
    return { success: true, changed: true, applied: true };
}

const isDirectCall = () => {
    try {
        return Boolean(
            process.argv[1] &&
            typeof import.meta.url === 'string' &&
            import.meta.url.startsWith('file:') &&
            fileURLToPath(import.meta.url) === process.argv[1]
        );
    } catch {
        return false;
    }
};

// Direct invocation check
if (isDirectCall()) {
    runDeployTurnstile()
        .then((res) => {
            if (!res.success && res.reason !== 'missing_supabase_credentials') {
                process.exit(1);
            }
        })
        .catch((err) => {
            console.error('Unexpected error:', err);
            process.exit(1);
        });
}
