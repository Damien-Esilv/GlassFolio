import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The quota trigger (migration 0006) fires BEFORE trg_vault_records_integrity (triggers run in
 * alphabetical order: "tr_" sorts before "trg"), and PostgREST inserts omit user_id. NEW.user_id is
 * therefore NULL when the quota runs, so counting by NEW.user_id would count zero rows forever.
 * This guard keeps the function on the caller identity. Run the SQL against a local Supabase stack
 * (insert 65 distinct keys as one user) for an end-to-end check.
 */
describe('vault quota migration (0006)', () => {
    const sql = readFileSync(join(__dirname, '../../../supabase/migrations/0006_vault_quotas_and_hardening.sql'), 'utf8');
    const fn = sql.slice(sql.indexOf('FUNCTION public.enforce_vault_record_quotas'), sql.indexOf('DROP TRIGGER IF EXISTS tr_enforce_vault_record_quotas'));

    it('counts rows by the authenticated caller, not by NEW.user_id', () => {
        expect(fn).toContain('auth.uid()');
        expect(fn).not.toMatch(/user_id\s*=\s*NEW\.user_id/);
    });

    it('rejects anonymous callers and keeps the 64 rows / 25 MB limits', () => {
        expect(fn).toMatch(/v_uid IS NULL/);
        expect(fn).toContain('> 64');
        expect(fn).toContain('26214400');
    });

    it('does not leave EXECUTE on the trigger function for API roles', () => {
        expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.enforce_vault_record_quotas\(\) FROM PUBLIC, anon, authenticated/);
    });
});

describe('atomic vault migration RPC (0007)', () => {
    const sql = readFileSync(join(__dirname, '../../../supabase/migrations/0007_atomic_vault_migration.sql'), 'utf8');

    it('runs as the caller so RLS, MFA policy and quota triggers still apply', () => {
        expect(sql).toMatch(/SECURITY INVOKER/);
        expect(sql).not.toMatch(/SECURITY DEFINER/);
        expect(sql).toContain('auth.uid()');
    });

    it('is callable by signed-in users only and writes records and header in one function', () => {
        expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.commit_vault_migration\(jsonb, jsonb\) FROM PUBLIC, anon/);
        expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.commit_vault_migration\(jsonb, jsonb\) TO authenticated/);
        expect(sql.indexOf('INSERT INTO public.vault_records')).toBeGreaterThan(-1);
        expect(sql.indexOf('INSERT INTO public.vault_headers')).toBeGreaterThan(sql.indexOf('INSERT INTO public.vault_records'));
    });
});
