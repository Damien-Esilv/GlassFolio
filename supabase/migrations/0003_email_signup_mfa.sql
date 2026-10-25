-- E26: an email registration stays inert until its E2EE vault header exists; orphans are purged after 24 hours.
-- Completion is server-authoritative: inserting the vault header stamps app_metadata, which users cannot edit
-- (unlike user_metadata, which the client controls).
CREATE OR REPLACE FUNCTION public.mark_glassfolio_signup_complete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, public AS $$
BEGIN
  UPDATE auth.users
     SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('glassfolio_signup_state', 'complete')
   WHERE id = NEW.user_id
     AND coalesce(raw_app_meta_data ->> 'glassfolio_signup_state', '') <> 'complete';
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_glassfolio_signup_complete() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_vault_headers_signup_complete ON public.vault_headers;
CREATE TRIGGER trg_vault_headers_signup_complete
  AFTER INSERT ON public.vault_headers
  FOR EACH ROW EXECUTE FUNCTION public.mark_glassfolio_signup_complete();

CREATE OR REPLACE FUNCTION public.purge_incomplete_glassfolio_signups()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = auth, public AS $$
  DELETE FROM auth.users AS candidate
  WHERE candidate.created_at < now() - interval '24 hours'
    AND coalesce(candidate.raw_app_meta_data ->> 'provider', '') = 'email'
    AND coalesce(candidate.raw_app_meta_data ->> 'glassfolio_signup_state', '') <> 'complete'
    AND NOT EXISTS (SELECT 1 FROM public.vault_headers header WHERE header.user_id = candidate.id);
$$;
REVOKE ALL ON FUNCTION public.purge_incomplete_glassfolio_signups() FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'glassfolio-purge-incomplete-signups';
    PERFORM cron.schedule('glassfolio-purge-incomplete-signups', '17 3 * * *', 'SELECT public.purge_incomplete_glassfolio_signups()');
  END IF;
END $$;

-- MFA is opt-in: an account with a verified factor must use AAL2; all others retain AAL1 access.
CREATE OR REPLACE FUNCTION public.glassfolio_mfa_satisfied()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = auth, public AS $$
  SELECT coalesce((SELECT auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
      OR NOT EXISTS (SELECT 1 FROM auth.mfa_factors WHERE user_id = (SELECT auth.uid()) AND status = 'verified');
$$;
REVOKE ALL ON FUNCTION public.glassfolio_mfa_satisfied() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.glassfolio_mfa_satisfied() TO authenticated;
DROP POLICY IF EXISTS "vault_headers_require_mfa_when_enrolled" ON public.vault_headers;
DROP POLICY IF EXISTS "vault_records_require_mfa_when_enrolled" ON public.vault_records;
CREATE POLICY "vault_headers_require_mfa_when_enrolled" ON public.vault_headers AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.glassfolio_mfa_satisfied())) WITH CHECK ((SELECT public.glassfolio_mfa_satisfied()));
CREATE POLICY "vault_records_require_mfa_when_enrolled" ON public.vault_records AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.glassfolio_mfa_satisfied())) WITH CHECK ((SELECT public.glassfolio_mfa_satisfied()));
