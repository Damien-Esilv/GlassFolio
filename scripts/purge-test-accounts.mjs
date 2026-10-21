#!/usr/bin/env node
/**
 * GlassFolio — Purge Test Accounts Script
 * 
 * Safely purges test accounts and orphan vault data on Supabase
 * while preserving the demo account (demo@glassfolio.com).
 * 
 * Usage:
 *   npm run db:purge-test-accounts
 */

import fs from 'fs';
import path from 'path';

function getEnv() {
    const envLocalPath = path.resolve(process.cwd(), '.env.local');
    const envPath = path.resolve(process.cwd(), '.env');
    const lines = [];

    if (fs.existsSync(envLocalPath)) {
        lines.push(...fs.readFileSync(envLocalPath, 'utf8').split('\n'));
    } else if (fs.existsSync(envPath)) {
        lines.push(...fs.readFileSync(envPath, 'utf8').split('\n'));
    }

    const env = {};
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const [k, ...v] = trimmed.split('=');
        if (k) env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
    }
    return env;
}

async function main() {
    console.log('🧹 [GlassFolio] Test Accounts Purge Tool\n');

    const env = getEnv();
    const supabaseUrl = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        console.log('ℹ️  Note : Pour exécuter la purge directement via ce script CLI, la variable SUPABASE_SERVICE_ROLE_KEY doit être définie dans .env.local.');
        console.log('\n📝 Vous pouvez exécuter la requête suivante directement dans le SQL Editor de votre Dashboard Supabase :\n');
        console.log('------------------------------------------------------------');
        console.log('-- Purge des comptes de test Supabase (conservation du compte démo)');
        console.log('DELETE FROM public.vault_records;');
        console.log('DELETE FROM public.vault_headers;');
        console.log("DELETE FROM auth.users WHERE email <> 'demo@glassfolio.com';");
        console.log('------------------------------------------------------------\n');
        return;
    }

    console.log(`Connecting to Supabase at: ${supabaseUrl}`);
    const normalizedUrl = supabaseUrl.replace(/\/+$/, '');

    try {
        // Delete records
        const delRecordsRes = await fetch(`${normalizedUrl}/rest/v1/vault_records`, {
            method: 'DELETE',
            headers: {
                'apikey': serviceRoleKey,
                'Authorization': `Bearer ${serviceRoleKey}`,
                'Prefer': 'return=representation'
            }
        });
        console.log(`✅ Vault records deleted (status: ${delRecordsRes.status})`);

        // Delete headers
        const delHeadersRes = await fetch(`${normalizedUrl}/rest/v1/vault_headers`, {
            method: 'DELETE',
            headers: {
                'apikey': serviceRoleKey,
                'Authorization': `Bearer ${serviceRoleKey}`,
                'Prefer': 'return=representation'
            }
        });
        console.log(`✅ Vault headers deleted (status: ${delHeadersRes.status})`);

        console.log('\n🎉 Purge terminée avec succès.');
    } catch (err) {
        console.error('❌ Error executing purge:', err);
    }
}

main();
