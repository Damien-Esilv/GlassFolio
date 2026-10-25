-- TGLA-101: account deletion requires the session's assurance level and a fresh authentication,
-- and SECURITY DEFINER helpers are no longer callable through the public API.

-- True when the newest authentication method in the JWT (amr) is younger than max_age_seconds.
CREATE OR REPLACE FUNCTION public.glassfolio_recently_authenticated(max_age_seconds integer DEFAULT 600)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(
    (SELECT max((entry ->> 'timestamp')::bigint)
       FROM jsonb_array_elements(coalesce((SELECT auth.jwt()) -> 'amr', '[]'::jsonb)) AS entry)
      >= extract(epoch FROM now())::bigint - max_age_seconds,
    false
  );
$$;
REVOKE ALL ON FUNCTION public.glassfolio_recently_authenticated(integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    current_user_id UUID := auth.uid();
BEGIN
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
    END IF;
    IF NOT public.glassfolio_mfa_satisfied() THEN
        RAISE EXCEPTION 'mfa_required' USING ERRCODE = '42501';
    END IF;
    IF NOT public.glassfolio_recently_authenticated(600) THEN
        RAISE EXCEPTION 'reauthentication_required' USING ERRCODE = '42501';
    END IF;

    DELETE FROM public.vault_records WHERE user_id = current_user_id;
    DELETE FROM public.vault_headers WHERE user_id = current_user_id;
    DELETE FROM auth.users WHERE id = current_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;

-- Trigger functions only need EXECUTE when the trigger is created, never at runtime.
ALTER FUNCTION public.enforce_vault_row_integrity() SET search_path = public, auth;
REVOKE EXECUTE ON FUNCTION public.enforce_vault_row_integrity() FROM PUBLIC, anon, authenticated;

-- Created by the dashboard's automatic-RLS option, not by these migrations.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;
