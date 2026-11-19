-- ==============================================================================
-- GlassFolio — Migration 0008 : Durcissement des quotas coffre (Epic E38)
-- ==============================================================================
-- Protège le quota base de données (plan gratuit Supabase : 500 Mo) contre les
-- abus de stockage tout en préservant une marge confortable pour un portefeuille
-- réel :
--  1. public.vault_headers : limite de taille sur header_json (64 Ko maximum),
--     fermant le contournement du quota de vault_records.
--  2. public.vault_records : conservation des 64 clés max et 5 Mo max par clé,
--     avec ajustement du plafond cumulé par compte de 25 Mo à 10 Mo (10 485 760 octets).
-- ==============================================================================

-- 1. Limite de taille sur l'en-tête de coffre (un en-tête réel pèse ~1 à 3 Ko)
ALTER TABLE public.vault_headers
    DROP CONSTRAINT IF EXISTS check_vault_header_size_limit;

ALTER TABLE public.vault_headers
    ADD CONSTRAINT check_vault_header_size_limit CHECK (
        octet_length(header_json::text) <= 65536 -- 64 Ko maximum par en-tête de coffre
    );

-- 2. Plafond cumulé par compte abaissé à 10 Mo (64 clés max conservé)
CREATE OR REPLACE FUNCTION public.enforce_vault_record_quotas()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_record_count INT;
    v_total_bytes BIGINT;
BEGIN
    -- NEW.user_id is NOT usable here: this trigger fires before trg_vault_records_integrity (triggers run
    -- in alphabetical order) and PostgREST inserts omit user_id, so it is still NULL. Use the caller.
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Access denied: anonymous users cannot write to the vault.';
    END IF;

    SELECT count(*), coalesce(sum(octet_length(ciphertext)), 0)
    INTO v_record_count, v_total_bytes
    FROM public.vault_records
    WHERE user_id = v_uid AND record_key <> NEW.record_key;

    -- Add the row being inserted or updated
    v_record_count := v_record_count + 1;
    v_total_bytes := v_total_bytes + octet_length(NEW.ciphertext);

    -- Quota: 64 records maximum
    IF v_record_count > 64 THEN
        RAISE EXCEPTION 'Vault record quota exceeded: maximum 64 storage keys per account.';
    END IF;

    -- Quota: 10 MB total maximum (10 * 1024 * 1024 = 10485760 bytes)
    IF v_total_bytes > 10485760 THEN
        RAISE EXCEPTION 'Vault storage quota exceeded: maximum 10 MB total encrypted data per account.';
    END IF;

    RETURN NEW;
END;
$$;

-- Trigger functions only need EXECUTE at CREATE TRIGGER time (same rule as migrations 0004 & 0006).
REVOKE EXECUTE ON FUNCTION public.enforce_vault_record_quotas() FROM PUBLIC, anon, authenticated;
