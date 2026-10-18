-- ==============================================================================
-- GlassFolio — Migration 0001 : Schéma Coffre Chiffré E2EE & RLS Strict Supabase
-- ==============================================================================
-- Architecture E2EE : La base de données ne stocke QUE du texte chiffré (AES-256-GCM)
-- Dérivation client-side (PBKDF2 600k + HKDF + Passkey PRF).
--
-- Mesures de Sécurité Appliquées :
--  1. Isolation Horizontale (RLS) : (SELECT auth.uid()) = user_id
--  2. Isolation Verticale & Anti-Falsification : Triggers empêchant l'altération de user_id/created_at
--  3. Principe du Moindre Privilège : Révocation totale du rôle 'anon'
--  4. Contraintes Intégrité CHECK : Validation structurelle des enveloppes chiffrées & limites DoS (5 Mo)
-- ==============================================================================

-- 1. Table des en-têtes de coffre (Sel KDF, itérations, DEK enveloppées par KEK)
CREATE TABLE IF NOT EXISTS public.vault_headers (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    header_json JSONB NOT NULL,
    totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Contrainte d'intégrité minimale sur le JSON de l'en-tête (v1 KDF)
    CONSTRAINT check_vault_header_structure CHECK (
        header_json ? 'version' AND
        header_json ? 'kdf' AND
        header_json ? 'wrappedKeys'
    )
);

-- 2. Table des enregistrements financiers chiffrés (transactions, positions, actifs, etc.)
CREATE TABLE IF NOT EXISTS public.vault_records (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    record_key TEXT NOT NULL,
    ciphertext TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (user_id, record_key),

    -- Contraintes de sécurité et limitation de charge utile (Anti-DoS stockage)
    CONSTRAINT check_record_key_format CHECK (
        char_length(record_key) >= 1 AND
        char_length(record_key) <= 128 AND
        (record_key LIKE 'glassfolio_%' OR record_key = 'gf_vault_header')
    ),
    CONSTRAINT check_ciphertext_size_limit CHECK (
        octet_length(ciphertext) <= 5242880 -- 5 Mo maximum par enregistrement
    ),
    CONSTRAINT check_ciphertext_not_empty CHECK (
        char_length(trim(ciphertext)) > 10
    )
);

-- Index pour accélérer les requêtes de synchronisation par utilisateur
CREATE INDEX IF NOT EXISTS idx_vault_records_user_id ON public.vault_records(user_id);

-- ==============================================================================
-- 3. Sécurité Verticale & Anti-Tampering (Triggers d'immuabilité)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.enforce_vault_row_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- En cas d'INSERT, forcer le user_id à être l'utilisateur connecté auth.uid()
    IF (TG_OP = 'INSERT') THEN
        IF auth.uid() IS NULL THEN
            RAISE EXCEPTION 'Access denied: anonymous users cannot write to the vault.';
        END IF;
        NEW.user_id := auth.uid();
        NEW.created_at := now();
        NEW.updated_at := now();
        RETURN NEW;
    END IF;

    -- En cas d'UPDATE, bloquer formellement toute tentative de changer de propriétaire ou de date de création
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

-- Attacher les triggers
DROP TRIGGER IF EXISTS trg_vault_headers_integrity ON public.vault_headers;
CREATE TRIGGER trg_vault_headers_integrity
    BEFORE INSERT OR UPDATE ON public.vault_headers
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_vault_row_integrity();

DROP TRIGGER IF EXISTS trg_vault_records_integrity ON public.vault_records;
CREATE TRIGGER trg_vault_records_integrity
    BEFORE INSERT OR UPDATE ON public.vault_records
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_vault_row_integrity();

-- ==============================================================================
-- 4. Sécurité Horizontale (Row-Level Security — RLS & Moindre Privilège)
-- ==============================================================================

-- Activation et verrouillage absolu du RLS (même pour les superutilisateurs de table)
ALTER TABLE public.vault_headers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_headers FORCE ROW LEVEL SECURITY;

ALTER TABLE public.vault_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_records FORCE ROW LEVEL SECURITY;

-- Révocation stricte pour les utilisateurs non authentifiés (rôle 'anon') et le public
REVOKE ALL ON TABLE public.vault_headers FROM anon, public;
REVOKE ALL ON TABLE public.vault_records FROM anon, public;

-- Autorisation limitée aux utilisateurs authentifiés munis d'un JWT valide
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vault_headers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vault_records TO authenticated;

-- Policies public.vault_headers
CREATE POLICY "vault_headers_select_own"
    ON public.vault_headers
    FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "vault_headers_insert_own"
    ON public.vault_headers
    FOR INSERT
    TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "vault_headers_update_own"
    ON public.vault_headers
    FOR UPDATE
    TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "vault_headers_delete_own"
    ON public.vault_headers
    FOR DELETE
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

-- Policies public.vault_records
CREATE POLICY "vault_records_select_own"
    ON public.vault_records
    FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "vault_records_insert_own"
    ON public.vault_records
    FOR INSERT
    TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "vault_records_update_own"
    ON public.vault_records
    FOR UPDATE
    TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "vault_records_delete_own"
    ON public.vault_records
    FOR DELETE
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);
