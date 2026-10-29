-- ==============================================================================
-- GlassFolio — Migration 0006 : Quotas de stockage par utilisateur & durcissement
-- ==============================================================================
-- 1. Durcissement de la fonction d'intégrité (SECURITY INVOKER + search_path public)
-- 2. Quotas stricts par utilisateur sur public.vault_records :
--    - Maximum 64 enregistrements distincts par compte
--    - Maximum 25 Mo de volume chiffré total cumulé par compte
-- ==============================================================================

-- 1. Durcissement d'enforce_vault_row_integrity
CREATE OR REPLACE FUNCTION public.enforce_vault_row_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        IF auth.uid() IS NULL THEN
            RAISE EXCEPTION 'Access denied: anonymous users cannot write to the vault.';
        END IF;
        NEW.user_id := auth.uid();
        NEW.created_at := now();
        NEW.updated_at := now();
        RETURN NEW;
    END IF;

    IF (TG_OP = 'UPDATE') THEN
        IF NEW.user_id <> OLD.user_id THEN
            RAISE EXCEPTION 'Vertical escalation blocked: user_id is immutable.';
        END IF;
        IF NEW.created_at <> OLD.created_at THEN
            RAISE EXCEPTION 'Tampering blocked: created_at timestamp is immutable.';
        END IF;
        NEW.updated_at := now();
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

-- 2. Trigger de limitation de quota (Anti-Déni de Service stockage)
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

    -- Quota: 25 MB total maximum
    IF v_total_bytes > 26214400 THEN
        RAISE EXCEPTION 'Vault storage quota exceeded: maximum 25 MB total encrypted data per account.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_enforce_vault_record_quotas ON public.vault_records;
CREATE TRIGGER tr_enforce_vault_record_quotas
    BEFORE INSERT OR UPDATE ON public.vault_records
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_vault_record_quotas();

-- Trigger functions only need EXECUTE at CREATE TRIGGER time (same rule as migration 0004).
REVOKE EXECUTE ON FUNCTION public.enforce_vault_record_quotas() FROM PUBLIC, anon, authenticated;
