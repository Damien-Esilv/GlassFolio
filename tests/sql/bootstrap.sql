-- Minimal stand-in for the Supabase pieces the migrations rely on (GoTrue tables, JWT helpers, roles).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_app_meta_data jsonb DEFAULT '{}', created_at timestamptz DEFAULT now());
CREATE TABLE auth.mfa_factors (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, status text, factor_type text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $f$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $f$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.jwt() TO anon, authenticated;
INSERT INTO auth.users (id, email) VALUES
 ('aaaaaaaa-0000-4000-8000-000000000001','a@test'),('bbbbbbbb-0000-4000-8000-000000000002','b@test'),
 ('cccccccc-0000-4000-8000-000000000003','c@test'),('dddddddd-0000-4000-8000-000000000004','d@test'),
 ('eeeeeeee-0000-4000-8000-000000000005','e@test');
