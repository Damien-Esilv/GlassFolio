-- ==============================================================================
-- GlassFolio — Migration 0007 : commit atomique d'une migration de coffre
-- ==============================================================================
-- Une rotation de DEK (migration d'un coffre Google hérité) change l'en-tête ET tous les
-- enregistrements. Envoyés par requêtes séparées, une coupure réseau au milieu laisse sur le
-- serveur un en-tête qui ne correspond plus aux enregistrements (données illisibles).
-- Cette fonction applique les deux dans UNE transaction : tout ou rien.
--
-- SECURITY INVOKER : les politiques RLS, la politique MFA restrictive, le trigger d'intégrité
-- (user_id forcé) et le trigger de quota s'appliquent exactement comme pour les requêtes REST.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.commit_vault_migration(p_header jsonb, p_records jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Access denied: anonymous users cannot write to the vault.';
    END IF;
    IF p_header IS NULL OR jsonb_typeof(p_header) <> 'object' THEN
        RAISE EXCEPTION 'Invalid payload: p_header must be a JSON object.';
    END IF;
    IF p_records IS NULL OR jsonb_typeof(p_records) <> 'array' THEN
        RAISE EXCEPTION 'Invalid payload: p_records must be a JSON array.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_records) AS e
        WHERE jsonb_typeof(e) <> 'object'
           OR jsonb_typeof(e -> 'record_key') <> 'string'
           OR jsonb_typeof(e -> 'ciphertext') <> 'string'
    ) THEN
        RAISE EXCEPTION 'Invalid payload: every record needs string record_key and ciphertext.';
    END IF;

    -- Records first, header last: all statements share this transaction, so a failure rolls back both.
    INSERT INTO public.vault_records (user_id, record_key, ciphertext)
    SELECT v_uid, e ->> 'record_key', e ->> 'ciphertext'
    FROM jsonb_array_elements(p_records) AS e
    ON CONFLICT (user_id, record_key) DO UPDATE SET ciphertext = EXCLUDED.ciphertext;

    INSERT INTO public.vault_headers (user_id, header_json, totp_enabled)
    VALUES (v_uid, p_header, coalesce((p_header ->> 'totpEnabled')::boolean, FALSE))
    ON CONFLICT (user_id) DO UPDATE
        SET header_json = EXCLUDED.header_json,
            totp_enabled = EXCLUDED.totp_enabled;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_vault_migration(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_vault_migration(jsonb, jsonb) TO authenticated;
