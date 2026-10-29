\set ON_ERROR_STOP 0
\set D 'dddddddd-0000-4000-8000-000000000004'
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',:'D',false), set_config('request.jwt.claims','{"sub":"'||:'D'||'","aal":"aal1"}',false) \gset
SELECT 'R8b start: D has ' || count(*) || ' record(s)' FROM public.vault_records;
-- 1 existing + 64 new keys in ONE call = 65 > 64 -> must be rejected as a whole
SELECT public.commit_vault_migration('{"version":1,"kdf":{},"wrappedKeys":{},"marker":"R8b-big"}'::jsonb, (SELECT jsonb_agg(jsonb_build_object('record_key','glassfolio_n'||g,'ciphertext','cipher-quota-'||g)) FROM generate_series(1,64) g));
SELECT 'R8b after 64-new-keys call: D has ' || (SELECT count(*) FROM public.vault_records) || ' record(s), header=' || coalesce((SELECT header_json->>'marker' FROM public.vault_headers),'none');
-- 63 new keys = 64 total -> accepted
SELECT public.commit_vault_migration('{"version":1,"kdf":{},"wrappedKeys":{},"marker":"R8b-ok"}'::jsonb, (SELECT jsonb_agg(jsonb_build_object('record_key','glassfolio_n'||g,'ciphertext','cipher-quota-'||g)) FROM generate_series(1,63) g));
SELECT 'R8b after 63-new-keys call: D has ' || (SELECT count(*) FROM public.vault_records) || ' record(s), header=' || (SELECT header_json->>'marker' FROM public.vault_headers);
