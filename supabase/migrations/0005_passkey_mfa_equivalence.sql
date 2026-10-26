-- Migration 0005: Passkey Multi-Factor Equivalence for RLS
-- Allows authenticated sessions using Passkeys (FIDO2 / WebAuthn) to satisfy MFA requirements
-- without forcing an additional TOTP second factor, as Passkey already guarantees
-- multi-factor assurance (hardware token possession + biometrics / device PIN).

CREATE OR REPLACE FUNCTION public.glassfolio_mfa_satisfied()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = auth, public AS $$
  SELECT coalesce((SELECT auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
      OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(coalesce((SELECT auth.jwt()) -> 'amr', '[]'::jsonb)) AS m
          WHERE m ->> 'method' IN ('passkey', 'webauthn')
      )
      OR NOT EXISTS (
          SELECT 1
          FROM auth.mfa_factors
          WHERE user_id = (SELECT auth.uid()) AND status = 'verified'
      );
$$;

REVOKE ALL ON FUNCTION public.glassfolio_mfa_satisfied() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.glassfolio_mfa_satisfied() TO authenticated;
