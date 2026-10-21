-- ==============================================================================
-- GlassFolio — Migration 0002 : Suppression de Compte RGPD & Purge Test
-- ==============================================================================
-- Conformité RGPD Art. 17 (Droit à l'effacement / Right to Erasure) :
-- Permet à tout utilisateur authentifié de supprimer définitivement et irréversiblement
-- son propre compte de la base Supabase (auth.users + CASCADE sur vault_records et vault_headers).
-- ==============================================================================

-- 1. Fonction RPC sécurisée permettant à l'utilisateur authentifié de supprimer son propre compte
CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    current_user_id UUID;
BEGIN
    current_user_id := auth.uid();
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Accès refusé : utilisateur non authentifié.';
    END IF;

    -- Suppression explicite préalable des enveloppes chiffrées
    DELETE FROM public.vault_records WHERE user_id = current_user_id;
    DELETE FROM public.vault_headers WHERE user_id = current_user_id;

    -- Suppression du compte dans auth.users (le CASCADE finalise tout nettoyage)
    DELETE FROM auth.users WHERE id = current_user_id;
END;
$$;

-- Révocation du rôle public / anon et attribution stricte au rôle 'authenticated'
REVOKE ALL ON FUNCTION public.delete_own_account() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;

-- ==============================================================================
-- 2. UTILITAIRE DE PURGE DES COMPTES DE TEST (À exécuter dans le SQL Editor Supabase)
-- ==============================================================================
-- Commande SQL pour nettoyer l'ensemble des comptes de test et des coffres chiffrés
-- associés tout en conservant le compte démo intact (si présent) :
--
-- DELETE FROM public.vault_records;
-- DELETE FROM public.vault_headers;
-- DELETE FROM auth.users WHERE email <> 'demo@glassfolio.com';
-- ==============================================================================
