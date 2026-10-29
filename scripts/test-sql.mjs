#!/usr/bin/env node
/**
 * Runs the Supabase migrations against a REAL PostgreSQL and checks the security behaviour that unit
 * tests cannot see: RLS, trigger ordering, the vault quota and the atomic migration RPC (TGLA-170).
 *
 *   npm run test:sql                       # starts a throw-away postgres:16-alpine container
 *   GF_PG_CONTAINER=my-pg npm run test:sql # reuse a running container (user "postgres")
 *
 * Needs Docker. Not part of `npm test`; CI can run it with a Postgres service container.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sqlDir = join(root, 'tests', 'sql');
const migDir = join(root, 'supabase', 'migrations');
const DB = `gf_sql_test_${process.pid}`;
const ownContainer = !process.env.GF_PG_CONTAINER;
const container = process.env.GF_PG_CONTAINER || `gf-sql-test-${process.pid}`;

const run = (args, input) => spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const psql = (db, sql, extra = []) => run(['exec', '-i', container, 'psql', '-U', 'postgres', '-d', db, '-q', '-t', '-A', ...extra], sql);

const fail = (message) => {
  console.error(`\n✗ ${message}`);
  cleanup();
  process.exit(1);
};
function cleanup() {
  if (ownContainer) run(['rm', '-f', container]);
  else psql('postgres', `DROP DATABASE IF EXISTS ${DB};`);
}

if (run(['info']).status !== 0) fail('Docker is not running.');
if (ownContainer) {
  const started = run(['run', '-d', '--name', container, '-e', 'POSTGRES_PASSWORD=test', 'postgres:16-alpine']);
  if (started.status !== 0) fail(`Could not start postgres: ${started.stderr}`);
  for (let i = 0; i < 60; i += 1) {
    if (run(['exec', container, 'pg_isready', '-U', 'postgres']).status === 0) break;
    spawnSync('sleep', ['1']);
  }
  spawnSync('sleep', ['2']);
}

let created = psql('postgres', `CREATE DATABASE ${DB};`);
if (created.status !== 0) fail(`Could not create the test database: ${created.stderr}`);

const apply = (name, sql) => {
  const res = psql(DB, sql, ['-v', 'ON_ERROR_STOP=1']);
  if (res.status !== 0) fail(`${name} failed:\n${res.stderr}`);
};
apply('bootstrap.sql', readFileSync(join(sqlDir, 'bootstrap.sql'), 'utf8'));
for (const file of readdirSync(migDir).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()) {
  // pg_cron is a Supabase-only extension; the migration already guards its use with a DO block.
  apply(file, readFileSync(join(migDir, file), 'utf8').replace(/^CREATE EXTENSION IF NOT EXISTS pg_cron.*$/m, ''));
}

const expectations = {
  'quota.sql': [
    /ROWS: insert #65 rejected -> Vault record quota exceeded/,
    /ROWS: user A stored 64 records/,
    /BYTES: 5 MB insert #6 rejected -> Vault storage quota exceeded/,
    /BYTES: user B stored 5 x 5 MB records \(25 MB\)/,
    /ORDER: tr_enforce_vault_record_quotas -> trg_vault_records_integrity/,
  ],
  'rpc.sql': [
    /R1 happy path: 2 records, header marker=H1, owner is caller=true/,
    /R2 overwrite: header marker=H2, totp_enabled=true, A=cipher-A-0002, total=3/,
    /check_record_key_format/,
    /R3 after failed batch: header marker=H2, A=cipher-A-0002, total=3/,
    /Invalid payload: p_header must be a JSON object/,
    /Invalid payload: p_records must be a JSON array/,
    /Invalid payload: every record needs string record_key and ciphertext/,
    /R5 D sees C rows: 0 \/ headers 0/,
    /R5 D after own commit: 1 own record\(s\)/,
    /R5 C untouched: A=cipher-A-0002/,
    /permission denied for function commit_vault_migration/,
    /Access denied: anonymous users cannot write to the vault/,
    /violates row-level security policy "vault_records_require_mfa_when_enrolled"/,
    /R7 E rows after aal2 commit: 1/,
    /R8 user A rows after 65-record call: 64, header rows: 0/,
  ],
  'rpc2.sql': [
    /R8b start: D has 1 record\(s\)/,
    /R8b after 64-new-keys call: D has 1 record\(s\), header=H1/,
    /R8b after 63-new-keys call: D has 64 record\(s\), header=R8b-ok/,
  ],
};

let failures = 0;
for (const [file, patterns] of Object.entries(expectations)) {
  const res = psql(DB, readFileSync(join(sqlDir, file), 'utf8'));
  const output = `${res.stdout}\n${res.stderr}`;
  for (const pattern of patterns) {
    const ok = pattern.test(output);
    if (!ok) failures += 1;
    console.log(`${ok ? '✓' : '✗'} ${file}: ${pattern.source}`);
  }
}
cleanup();
if (failures > 0) {
  console.error(`\n${failures} SQL expectation(s) failed.`);
  process.exit(1);
}
console.log('\nAll SQL expectations passed.');
