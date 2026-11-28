/**
 * Label keywords of the French market and bank category names, used to categorise bank operations
 * when neither the user (correction, rule) nor the journal type decides (Epic E52 — TGLA-249).
 *
 * Patterns are matched on whole words of the normalised label (upper case, no accents, punctuation
 * turned into spaces): "PEA" matches "VIR VERS PEA" but not "PEAGE". The first matching entry wins,
 * so specific entries come before generic ones (UBER EATS before UBER, ASSURANCE VIE before ASSURANCE).
 */
import type { BuiltinCashflowCategoryId, CashflowDirection } from '../types/cashflow';

export interface CashflowKeywordEntry {
    categoryId: BuiltinCashflowCategoryId;
    /** Only for money in or money out; both when omitted */
    direction?: CashflowDirection;
    patterns: readonly string[];
}

export const CASHFLOW_KEYWORDS: readonly CashflowKeywordEntry[] = [
    // Money moved to the user's own investments (savings, not spending)
    {
        categoryId: 'savings_invested',
        direction: 'out',
        patterns: [
            'PEA', 'PEA PME', 'ASSURANCE VIE', 'PLAN EPARGNE RETRAITE', 'PER INDIVIDUEL', 'TRADE REPUBLIC', 'DEGIRO',
            'BOURSE DIRECT', 'FORTUNEO BOURSE', 'INTERACTIVE BROKERS', 'IBKR', 'SAXO', 'BINANCE', 'COINBASE', 'KRAKEN',
            'BITPANDA', 'BITSTACK', 'YOMONI', 'NALO', 'LINXEA', 'RAMIFY', 'GOODVEST', 'SCPI', 'LIVRET A', 'LDDS', 'LEP',
        ],
    },
    // Money in
    {
        categoryId: 'salary',
        direction: 'in',
        patterns: ['SALAIRE', 'SALAIRES', 'PAIE', 'PAYE', 'REMUNERATION', 'TRAITEMENT', 'PAYROLL', 'SALARY', 'EMPLOYEUR'],
    },
    {
        categoryId: 'investment_income',
        direction: 'in',
        patterns: ['DIVIDENDE', 'DIVIDENDES', 'DIVIDEND', 'COUPON', 'INTERETS', 'INTERETS CREDITEURS', 'INTEREST'],
    },
    {
        categoryId: 'benefits_refunds',
        direction: 'in',
        patterns: [
            'CAF', 'CPAM', 'AMELI', 'CAISSE PRIMAIRE', 'POLE EMPLOI', 'FRANCE TRAVAIL', 'ALLOCATION', 'ALLOCATIONS',
            'PRIME D ACTIVITE', 'RSA', 'APL', 'REMBOURSEMENT', 'REMB', 'MUTUELLE', 'DGFIP', 'IMPOT', 'TRESOR PUBLIC',
        ],
    },
    // Built-in sub-categories the tax card reads (before their parent's keywords)
    {
        categoryId: 'home_services',
        direction: 'out',
        patterns: [
            'CESU', 'URSSAF CESU', 'EMPLOI A DOMICILE', 'SERVICES A LA PERSONNE', 'O2', 'SHIVA', 'AXEO', 'ACADOMIA',
            'COMPLETUDE', 'MENAGE', 'JARDINAGE', 'SOUTIEN SCOLAIRE',
        ],
    },
    {
        categoryId: 'childcare',
        direction: 'out',
        patterns: ['CRECHE', 'MICRO CRECHE', 'HALTE GARDERIE', 'GARDERIE', 'NOUNOU', 'ASSISTANTE MATERNELLE', 'PAJEMPLOI', 'GARDE D ENFANT'],
    },
    {
        categoryId: 'donations',
        direction: 'out',
        patterns: [
            'DON', 'DONS', 'CROIX ROUGE', 'RESTOS DU COEUR', 'SECOURS POPULAIRE', 'SECOURS CATHOLIQUE', 'UNICEF',
            'MEDECINS SANS FRONTIERES', 'MSF', 'WWF', 'FONDATION', 'EMMAUS', 'HELLOASSO', 'APPRENTIS D AUTEUIL',
            'LIGUE CONTRE LE CANCER', 'AMNESTY',
        ],
    },
    // Money out
    {
        categoryId: 'cash_withdrawal',
        direction: 'out',
        patterns: ['RETRAIT', 'RETRAIT DAB', 'RETRAIT GAB', 'DAB', 'ATM', 'WITHDRAWAL'],
    },
    {
        categoryId: 'dining',
        direction: 'out',
        patterns: [
            'UBER EATS', 'DELIVEROO', 'JUST EAT', 'RESTAURANT', 'RESTO', 'BRASSERIE', 'BISTROT', 'PIZZERIA', 'SUSHI',
            'MCDONALDS', 'MC DONALDS', 'MCDO', 'BURGER KING', 'KFC', 'STARBUCKS', 'CAFE', 'BAR', 'TRAITEUR',
        ],
    },
    {
        categoryId: 'groceries',
        direction: 'out',
        patterns: [
            'CARREFOUR', 'CARREFOUR CITY', 'CARREFOUR MARKET', 'LECLERC', 'E LECLERC', 'AUCHAN', 'INTERMARCHE', 'LIDL',
            'ALDI', 'MONOPRIX', 'FRANPRIX', 'CASINO', 'SUPER U', 'HYPER U', 'U EXPRESS', 'PICARD', 'GRAND FRAIS',
            'BIOCOOP', 'NATURALIA', 'NETTO', 'CORA', 'MATCH', 'SPAR', 'G20', 'PRIMEUR', 'BOULANGERIE', 'BOUCHERIE',
            'LA VIE CLAIRE', 'MONOP',
        ],
    },
    {
        categoryId: 'subscriptions',
        direction: 'out',
        patterns: [
            'NETFLIX', 'SPOTIFY', 'DEEZER', 'DISNEY PLUS', 'DISNEY', 'CANAL', 'AMAZON PRIME', 'PRIME VIDEO', 'APPLE COM BILL',
            'ICLOUD', 'YOUTUBE', 'GOOGLE STORAGE', 'ORANGE', 'SOSH', 'SFR', 'RED BY SFR', 'BOUYGUES', 'B YOU', 'FREE MOBILE',
            'FREE TELECOM', 'FREE', 'OVH', 'OPENAI', 'CHATGPT', 'ANTHROPIC', 'DROPBOX', 'ADOBE', 'MICROSOFT', 'AUDIBLE',
        ],
    },
    {
        categoryId: 'insurance',
        direction: 'out',
        patterns: [
            'MACIF', 'MAIF', 'MAAF', 'MATMUT', 'AXA', 'ALLIANZ', 'GROUPAMA', 'GENERALI', 'ABEILLE', 'MMA', 'HISCOX', 'LUKO',
            'ALAN', 'HARMONIE MUTUELLE', 'MUTUELLE', 'ASSURANCE', 'ASSURANCES', 'PACIFICA', 'SWISSLIFE',
        ],
    },
    {
        categoryId: 'housing',
        direction: 'out',
        patterns: [
            'LOYER', 'FONCIA', 'NEXITY', 'CITYA', 'ORPI', 'SYNDIC', 'CHARGES COPRO', 'CHARGES LOCATIVES', 'EDF', 'ENGIE', 'ENI', 'EKWATEUR',
            'VEOLIA', 'SUEZ', 'EAU DE PARIS', 'CREDIT IMMOBILIER', 'PRET IMMO', 'ECHEANCE PRET', 'LEROY MERLIN',
            'CASTORAMA', 'BRICOMAN', 'BRICO DEPOT', 'MR BRICOLAGE',
        ],
    },
    {
        categoryId: 'taxes',
        direction: 'out',
        patterns: [
            'DGFIP', 'IMPOT', 'IMPOTS', 'TRESOR PUBLIC', 'FINANCES PUBLIQUES', 'TAXE FONCIERE', 'TAXE HABITATION',
            'PRELEVEMENT A LA SOURCE', 'ANTAI', 'AMENDE', 'URSSAF',
        ],
    },
    {
        categoryId: 'travel',
        direction: 'out',
        patterns: [
            'AIRBNB', 'BOOKING', 'HOTEL', 'HOTELS', 'AIR FRANCE', 'EASYJET', 'RYANAIR', 'TRANSAVIA', 'VUELING', 'LUFTHANSA',
            'EXPEDIA', 'TRAINLINE', 'OUIGO', 'CLUB MED', 'ACCOR',
        ],
    },
    {
        categoryId: 'transport',
        direction: 'out',
        patterns: [
            'SNCF', 'SNCF CONNECT', 'RATP', 'NAVIGO', 'COMUTITRES', 'TRANSILIEN', 'UBER', 'BOLT', 'HEETCH', 'BLABLACAR',
            'LIME', 'TOTALENERGIES', 'TOTAL', 'ESSO', 'SHELL', 'BP', 'AVIA', 'AUTOROUTE', 'AUTOROUTES', 'VINCI', 'SANEF',
            'APRR', 'PEAGE', 'PARKING', 'INDIGO', 'NORAUTO', 'MIDAS', 'SPEEDY',
        ],
    },
    {
        categoryId: 'health',
        direction: 'out',
        patterns: [
            'PHARMACIE', 'PHARMA', 'DOCTOLIB', 'MEDECIN', 'DOCTEUR', 'DR', 'DENTISTE', 'DENTAIRE', 'OPTIC', 'OPTICIEN',
            'OPTIQUE', 'KINE', 'KINESITHERAPEUTE', 'LABORATOIRE', 'LABO', 'HOPITAL', 'CLINIQUE', 'OSTEOPATHE', 'RADIOLOGIE',
        ],
    },
    {
        categoryId: 'leisure',
        direction: 'out',
        patterns: [
            'CINEMA', 'UGC', 'PATHE', 'GAUMONT', 'MK2', 'FNAC SPECTACLES', 'TICKETMASTER', 'STEAM', 'PLAYSTATION',
            'NINTENDO', 'XBOX', 'BASIC FIT', 'FITNESS PARK', 'NEONESS', 'ON AIR', 'MUSEE', 'CONCERT', 'THEATRE', 'BOWLING',
        ],
    },
    {
        categoryId: 'family_education',
        direction: 'out',
        patterns: ['ECOLE', 'CANTINE', 'UNIVERSITE', 'SCOLARITE', 'FOURNITURES SCOLAIRES', 'COLLEGE', 'LYCEE', 'ETUDES'],
    },
    {
        categoryId: 'gifts_donations',
        direction: 'out',
        patterns: ['CADEAU', 'SMARTBOX', 'WONDERBOX', 'INTERFLORA', 'AQUARELLE'],
    },
    {
        categoryId: 'shopping',
        direction: 'out',
        patterns: [
            'AMAZON', 'AMZN', 'FNAC', 'DARTY', 'BOULANGER', 'CDISCOUNT', 'ZARA', 'H M', 'UNIQLO', 'DECATHLON', 'IKEA',
            'SEPHORA', 'ZALANDO', 'SHEIN', 'VINTED', 'LEBONCOIN', 'ALIEXPRESS', 'APPLE STORE', 'ACTION', 'KIABI', 'PRIMARK',
            'GALERIES LAFAYETTE', 'PRINTEMPS', 'NOCIBE',
        ],
    },
    {
        categoryId: 'bank_fees',
        direction: 'out',
        patterns: [
            'FRAIS', 'FRAIS BANCAIRES', 'COMMISSION', 'COMMISSIONS', 'COTISATION CARTE', 'COTIS CARTE', 'AGIOS',
            'INTERETS DEBITEURS', 'FRAIS TENUE', 'TENUE DE COMPTE', 'ABONNEMENT BANCAIRE', 'COMMISSION INTERVENTION',
        ],
    },
];

/**
 * Bank category names (Woob, BoursoBank CSV, other exports) to built-in categories. Matched on whole
 * words of the normalised category, then of its parent. Income entries only apply to money in,
 * spending entries only to money out.
 */
export const BANK_CATEGORY_MAP: readonly CashflowKeywordEntry[] = [
    { categoryId: 'savings_invested', direction: 'out', patterns: ['EPARGNE', 'PLACEMENT', 'PLACEMENTS', 'INVESTISSEMENT', 'INVESTISSEMENTS', 'SAVINGS', 'INVESTMENTS', 'BOURSE'] },
    { categoryId: 'salary', direction: 'in', patterns: ['SALAIRE', 'SALAIRES', 'SALARY', 'PAYROLL'] },
    { categoryId: 'investment_income', direction: 'in', patterns: ['DIVIDENDES', 'INTERETS', 'REVENUS FINANCIERS', 'REVENUS DU PATRIMOINE', 'INVESTMENT INCOME'] },
    { categoryId: 'benefits_refunds', direction: 'in', patterns: ['REMBOURSEMENT', 'REMBOURSEMENTS', 'ALLOCATIONS', 'AIDES', 'PRESTATIONS SOCIALES', 'REFUND', 'REFUNDS'] },
    { categoryId: 'other_income', direction: 'in', patterns: ['REVENUS', 'AUTRES REVENUS', 'VIREMENTS RECUS', 'INCOME'] },
    { categoryId: 'home_services', direction: 'out', patterns: ['SERVICES A LA PERSONNE', 'EMPLOI A DOMICILE'] },
    { categoryId: 'childcare', direction: 'out', patterns: ['GARDE D ENFANTS', 'CRECHE', 'CHILDCARE'] },
    { categoryId: 'donations', direction: 'out', patterns: ['DONS', 'DON', 'ASSOCIATIONS', 'CHARITY', 'DONATIONS'] },
    { categoryId: 'groceries', direction: 'out', patterns: ['ALIMENTATION', 'COURSES', 'SUPERMARCHE', 'SUPERMARCHES', 'GROCERIES'] },
    { categoryId: 'dining', direction: 'out', patterns: ['RESTAURANTS', 'RESTAURANT', 'BARS', 'SORTIES', 'RESTAURATION', 'DINING'] },
    { categoryId: 'housing', direction: 'out', patterns: ['LOGEMENT', 'LOYER', 'ENERGIE', 'EAU', 'MAISON', 'HABITATION', 'HOUSING', 'RENT', 'UTILITIES'] },
    { categoryId: 'transport', direction: 'out', patterns: ['TRANSPORTS', 'TRANSPORT', 'CARBURANT', 'VEHICULE', 'AUTO', 'AUTO MOTO', 'TRANSPORTATION'] },
    { categoryId: 'subscriptions', direction: 'out', patterns: ['ABONNEMENTS', 'ABONNEMENT', 'TELEPHONIE', 'TELEPHONE', 'INTERNET', 'MULTIMEDIA', 'SUBSCRIPTIONS'] },
    { categoryId: 'health', direction: 'out', patterns: ['SANTE', 'MEDICAL', 'PHARMACIE', 'HEALTH'] },
    { categoryId: 'insurance', direction: 'out', patterns: ['ASSURANCES', 'ASSURANCE', 'MUTUELLE', 'INSURANCE'] },
    { categoryId: 'taxes', direction: 'out', patterns: ['IMPOTS', 'IMPOT', 'TAXES', 'IMPOTS ET TAXES', 'TAX'] },
    { categoryId: 'bank_fees', direction: 'out', patterns: ['FRAIS BANCAIRES', 'BANQUE', 'FRAIS', 'BANK FEES', 'FEES'] },
    { categoryId: 'travel', direction: 'out', patterns: ['VOYAGES', 'VOYAGE', 'VACANCES', 'HOTEL', 'TRAVEL'] },
    { categoryId: 'leisure', direction: 'out', patterns: ['LOISIRS', 'SPORT', 'CULTURE', 'SPECTACLES', 'LEISURE', 'ENTERTAINMENT'] },
    { categoryId: 'shopping', direction: 'out', patterns: ['SHOPPING', 'ACHATS', 'HABILLEMENT', 'VETEMENTS', 'HIGH TECH', 'EQUIPEMENT'] },
    { categoryId: 'family_education', direction: 'out', patterns: ['ENFANTS', 'EDUCATION', 'SCOLARITE', 'FAMILLE', 'FAMILY'] },
    { categoryId: 'gifts_donations', direction: 'out', patterns: ['CADEAUX', 'CADEAU', 'GIFTS'] },
    { categoryId: 'cash_withdrawal', direction: 'out', patterns: ['RETRAITS', 'RETRAIT', 'ESPECES', 'CASH'] },
];

/**
 * Bank operation types (Woob `Transaction.type`, OFX `TRNTYPE`) that alone tell the category.
 * Card payments, transfers and checks say nothing about what was bought, so they are absent.
 */
export const BANK_TX_TYPE_MAP: Readonly<Record<string, { categoryId: BuiltinCashflowCategoryId; direction: CashflowDirection }>> = {
    withdrawal: { categoryId: 'cash_withdrawal', direction: 'out' },
    atm: { categoryId: 'cash_withdrawal', direction: 'out' },
    bank: { categoryId: 'bank_fees', direction: 'out' },
    fee: { categoryId: 'bank_fees', direction: 'out' },
    srvchg: { categoryId: 'bank_fees', direction: 'out' },
    loan_payment: { categoryId: 'housing', direction: 'out' },
    int: { categoryId: 'investment_income', direction: 'in' },
    div: { categoryId: 'investment_income', direction: 'in' },
};
