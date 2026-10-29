\set ON_ERROR_STOP 0
\set C 'cccccccc-0000-4000-8000-000000000003'
\set D 'dddddddd-0000-4000-8000-000000000004'
\set E 'eeeeeeee-0000-4000-8000-000000000005'
\set H1 '{"version":1,"kdf":{"iterations":600000},"wrappedKeys":{},"marker":"H1"}'
\set H2 '{"version":1,"kdf":{"iterations":600000},"wrappedKeys":{},"marker":"H2","totpEnabled":true}'

-- R1: happy path as user C (user_id never sent)
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',:'C',false), set_config('request.jwt.claims','{"sub":"'||:'C'||'","aal":"aal1"}',false) \gset
SELECT public.commit_vault_migration(:'H1'::jsonb, '[{"record_key":"glassfolio_a","ciphertext":"cipher-A-0001"},{"record_key":"glassfolio_b","ciphertext":"cipher-B-0001"}]'::jsonb);
SELECT 'R1 happy path: ' || (SELECT count(*) FROM public.vault_records) || ' records, header marker=' || (SELECT header_json->>'marker' FROM public.vault_headers) || ', owner is caller=' || (SELECT bool_and(user_id = :'C'::uuid) FROM public.vault_records);

-- R2: second migration overwrites header and an existing record, adds one
SELECT public.commit_vault_migration(:'H2'::jsonb, '[{"record_key":"glassfolio_a","ciphertext":"cipher-A-0002"},{"record_key":"glassfolio_c","ciphertext":"cipher-C-0002"}]'::jsonb);
SELECT 'R2 overwrite: header marker=' || (SELECT header_json->>'marker' FROM public.vault_headers) || ', totp_enabled=' || (SELECT totp_enabled FROM public.vault_headers) || ', A=' || (SELECT ciphertext FROM public.vault_records WHERE record_key='glassfolio_a') || ', total=' || (SELECT count(*) FROM public.vault_records);

-- R3: ATOMICITY: one invalid record key in the batch must roll back the header AND the valid record
SELECT public.commit_vault_migration('{"version":1,"kdf":{},"wrappedKeys":{},"marker":"SHOULD-NOT-LAND"}'::jsonb, '[{"record_key":"glassfolio_a","ciphertext":"cipher-A-SHOULD-NOT-LAND"},{"record_key":"not_allowed_key","ciphertext":"cipher-bad-0003"}]'::jsonb);
SELECT 'R3 after failed batch: header marker=' || (SELECT header_json->>'marker' FROM public.vault_headers) || ', A=' || (SELECT ciphertext FROM public.vault_records WHERE record_key='glassfolio_a') || ', total=' || (SELECT count(*) FROM public.vault_records);

-- R4: payload validation
SELECT public.commit_vault_migration('[]'::jsonb, '[]'::jsonb);
SELECT public.commit_vault_migration('{"version":1,"kdf":{},"wrappedKeys":{}}'::jsonb, '{}'::jsonb);
SELECT public.commit_vault_migration('{"version":1,"kdf":{},"wrappedKeys":{}}'::jsonb, '[{"record_key":5,"ciphertext":"x"}]'::jsonb);
RESET ROLE;

-- R5: isolation: user D sees nothing of C and writes only its own rows
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',:'D',false), set_config('request.jwt.claims','{"sub":"'||:'D'||'","aal":"aal1"}',false) \gset
SELECT 'R5 D sees C rows: ' || (SELECT count(*) FROM public.vault_records) || ' / headers ' || (SELECT count(*) FROM public.vault_headers);
SELECT public.commit_vault_migration(:'H1'::jsonb, '[{"record_key":"glassfolio_a","ciphertext":"cipher-D-own-01"}]'::jsonb);
SELECT 'R5 D after own commit: ' || (SELECT count(*) FROM public.vault_records) || ' own record(s)';
RESET ROLE;
SELECT 'R5 C untouched: A=' || (SELECT ciphertext FROM public.vault_records WHERE record_key='glassfolio_a' AND user_id=:'C'::uuid);

-- R6: anonymous callers
SET ROLE anon;
SELECT public.commit_vault_migration(:'H1'::jsonb, '[]'::jsonb);
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claims','{}',false) \gset
SELECT public.commit_vault_migration(:'H1'::jsonb, '[]'::jsonb);
RESET ROLE;

-- R7: MFA restrictive policy still applies (user E has a verified TOTP factor)
INSERT INTO auth.mfa_factors(user_id, status, factor_type) VALUES (:'E'::uuid, 'verified', 'totp');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',:'E',false), set_config('request.jwt.claims','{"sub":"'||:'E'||'","aal":"aal1"}',false) \gset
SELECT public.commit_vault_migration(:'H1'::jsonb, '[{"record_key":"glassfolio_a","ciphertext":"cipher-E-aal1-1"}]'::jsonb);
SELECT set_config('request.jwt.claims','{"sub":"'||:'E'||'","aal":"aal2"}',false) \gset
SELECT public.commit_vault_migration(:'H1'::jsonb, '[{"record_key":"glassfolio_a","ciphertext":"cipher-E-aal2-1"}]'::jsonb);
SELECT 'R7 E rows after aal2 commit: ' || (SELECT count(*) FROM public.vault_records);
RESET ROLE;

-- R8: quota still enforced inside the RPC (65 records in one call)
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000001',false), set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-4000-8000-000000000001","aal":"aal1"}',false) \gset
SELECT public.commit_vault_migration(:'H1'::jsonb, (SELECT jsonb_agg(jsonb_build_object('record_key','glassfolio_q'||g,'ciphertext','cipher-quota-'||g)) FROM generate_series(1,65) g));
SELECT 'R8 user A rows after 65-record call: ' || (SELECT count(*) FROM public.vault_records) || ', header rows: ' || (SELECT count(*) FROM public.vault_headers);
