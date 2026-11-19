\set ON_ERROR_STOP 0
SET ROLE authenticated;
-- User A: PostgREST-style inserts (user_id omitted), up to 70 distinct keys
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000001',false), set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-4000-8000-000000000001","aal":"aal1"}',false) \gset
DO $$ DECLARE i int; BEGIN
  FOR i IN 1..70 LOOP
    BEGIN INSERT INTO public.vault_records(record_key, ciphertext) VALUES ('glassfolio_k'||i, repeat('x',100));
    EXCEPTION WHEN others THEN RAISE NOTICE 'ROWS: insert #% rejected -> %', i, SQLERRM; EXIT; END;
  END LOOP; END $$;
SELECT 'ROWS: user A stored ' || count(*) || ' records' AS result FROM public.vault_records;
RESET ROLE;
SET ROLE authenticated;
-- User B: 5 MB rows, the 3rd crosses the 10 MB limit (migration 0008)
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-0000-4000-8000-000000000002',false), set_config('request.jwt.claims','{"sub":"bbbbbbbb-0000-4000-8000-000000000002","aal":"aal1"}',false) \gset
DO $$ DECLARE i int; BEGIN
  FOR i IN 1..5 LOOP
    BEGIN INSERT INTO public.vault_records(record_key, ciphertext) VALUES ('glassfolio_big'||i, repeat('x',5242880));
    EXCEPTION WHEN others THEN RAISE NOTICE 'BYTES: 5 MB insert #% rejected -> %', i, SQLERRM; EXIT; END;
  END LOOP; END $$;
SELECT 'BYTES: user B stored ' || count(*) || ' x 5 MB records (' || pg_size_pretty(sum(octet_length(ciphertext))) || ')' AS result FROM public.vault_records;
RESET ROLE;
SET ROLE authenticated;
-- User C: oversized vault_headers.header_json (> 64 KB) rejected directly and via commit_vault_migration (migration 0008)
SELECT set_config('request.jwt.claim.sub','cccccccc-0000-4000-8000-000000000003',false), set_config('request.jwt.claims','{"sub":"cccccccc-0000-4000-8000-000000000003","aal":"aal1"}',false) \gset
DO $$ DECLARE oversized jsonb; BEGIN
  oversized := jsonb_build_object('version', 1, 'kdf', jsonb_build_object('iterations', 600000), 'wrappedKeys', jsonb_build_object('pad', repeat('z', 70000)));
  BEGIN
    INSERT INTO public.vault_headers(header_json, totp_enabled) VALUES (oversized, false);
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'HEADER: direct oversized insert rejected -> %', SQLERRM;
  END;
  BEGIN
    PERFORM public.commit_vault_migration(oversized, jsonb_build_array(jsonb_build_object('record_key', 'glassfolio_hdr_test', 'ciphertext', repeat('y', 100))));
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'HEADER: rpc oversized insert rejected -> %', SQLERRM;
  END;
END $$;
SELECT 'HEADER: user C headers=' || (SELECT count(*) FROM public.vault_headers) || ', records=' || (SELECT count(*) FROM public.vault_records) AS result;
RESET ROLE;
-- Trigger order on the table (alphabetical = firing order)
SELECT 'ORDER: ' || string_agg(tgname, ' -> ' ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.vault_records'::regclass AND NOT tgisinternal;
