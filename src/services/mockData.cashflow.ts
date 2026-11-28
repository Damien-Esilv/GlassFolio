/**
 * Demo data of the cash flow (Epic E52 — TGLA-249): a BoursoBank checking account and a Livret A
 * with 12 months of realistic operations (salary, rent, groceries, subscriptions with one price
 * rise, transfers to the PEA and to the Livret A, donations, home help), dated relative to now.
 * Amounts come from a seeded generator, so the demo looks the same on every load.
 */
import type { Account, ImportBatch, UnifiedTransaction } from '../types/types.backend';
import type { BankHints, CategorizationRule } from '../types/cashflow';
import { hoursAgoISO, monthsAgoISO } from '../utils/demoDates';

export const DEMO_CHECKING_ACCOUNT_ID = 'acc-bourso-checking';
export const DEMO_LIVRET_ACCOUNT_ID = 'acc-bourso-livret';
const DEMO_BANK_BATCH_ID = 'batch-demo-bank';
const MONTHS = 12;

export function buildDemoCashflowAccounts(now: Date = new Date()): Account[] {
    const openedAt = monthsAgoISO(MONTHS + 2, 1, 9, 0, now);
    return [
        {
            id: DEMO_CHECKING_ACCOUNT_ID,
            ownerId: 'default-user',
            instituteId: 'inst-bourso',
            name: 'BoursoBank Compte courant',
            type: 'checking',
            defaultCurrency: 'EUR',
            isActive: true,
            preferredImportMode: 'history',
            wrapperType: 'OTHER',
            openedAt,
            createdAt: openedAt,
            updatedAt: openedAt,
        },
        {
            id: DEMO_LIVRET_ACCOUNT_ID,
            ownerId: 'default-user',
            instituteId: 'inst-bourso',
            name: 'BoursoBank Livret A',
            type: 'savings',
            defaultCurrency: 'EUR',
            isActive: true,
            preferredImportMode: 'history',
            wrapperType: 'LIVRET',
            openedAt,
            createdAt: openedAt,
            updatedAt: openedAt,
        },
    ];
}

export function buildDemoCashflowBatch(now: Date = new Date()): ImportBatch {
    return {
        id: DEMO_BANK_BATCH_ID,
        ownerId: 'default-user',
        accountId: DEMO_CHECKING_ACCOUNT_ID,
        importMode: 'history',
        fileName: 'boursobank_releve_12_mois.csv',
        fileHash: 'hash-demo-bank-statement',
        transactionCount: buildDemoCashflowOperations(now).length,
        skippedCount: 0,
        importedAt: hoursAgoISO(1, now),
        importedBy: 'default-user',
        status: 'completed',
        engineVersion: '3.0.0',
    };
}

/** Example rule: the cleaner paid by transfer counts as home help (it feeds the tax card). */
export function buildDemoCashflowRules(now: Date = new Date()): CategorizationRule[] {
    const at = monthsAgoISO(6, 3, 18, 0, now);
    return [
        {
            id: 'rule-demo-home-help',
            ownerId: 'default-user',
            categoryId: 'home_services',
            labelContains: 'MARIE DUPONT',
            direction: 'out',
            source: 'user',
            createdAt: at,
            updatedAt: at,
        },
    ];
}

/** Small deterministic generator (mulberry32). */
function seeded(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

interface DemoOperation {
    accountId: string;
    day: number;
    amount: number;
    label: string;
    hints?: BankHints;
    type?: UnifiedTransaction['type'];
    subType?: UnifiedTransaction['subType'];
}

const MONTH_LABELS = ['JANVIER', 'FEVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET', 'AOUT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DECEMBRE'];

function monthOperations(monthIndex: number, monthsAgo: number, rand: () => number): DemoOperation[] {
    const pick = <T,>(list: readonly T[]): T => list[Math.floor(rand() * list.length)];
    const between = (min: number, max: number): number => Math.round((min + rand() * (max - min)) * 100) / 100;
    const dd = (day: number) => `${String(day).padStart(2, '0')}/${String(monthIndex + 1).padStart(2, '0')}`;
    const checking = DEMO_CHECKING_ACCOUNT_ID;
    const ops: DemoOperation[] = [
        { accountId: checking, day: 27, amount: 3250, label: `VIR SEPA RECU /DE ACME SAS /MOTIF SALAIRE ${MONTH_LABELS[monthIndex]}`, hints: { category: 'Salaires et revenus d\'activité', categoryParent: 'Revenus' } },
        { accountId: checking, day: 5, amount: -950, label: 'PRLV SEPA FONCIA PARIS LOYER', hints: { category: 'Loyer', categoryParent: 'Logement' } },
        { accountId: checking, day: 10, amount: monthsAgo <= 4 ? -79 : -72, label: 'PRLV SEPA EDF CLIENTS PARTICULIERS' },
        { accountId: checking, day: 3, amount: -39.99, label: 'PRLV SEPA ORANGE SA' },
        { accountId: checking, day: 12, amount: -19.99, label: 'PRLV SEPA FREE MOBILE' },
        { accountId: checking, day: 15, amount: monthsAgo <= 2 ? -15.99 : -13.49, label: `CARTE ${dd(15)} NETFLIX.COM AMSTERDAM` },
        { accountId: checking, day: 20, amount: -11.12, label: `CARTE ${dd(20)} SPOTIFY P2D4F` },
        { accountId: checking, day: 6, amount: -64.5, label: 'PRLV SEPA MACIF ASSURANCE AUTO HABITATION' },
        { accountId: checking, day: 2, amount: -86.4, label: 'PRLV SEPA COMUTITRES NAVIGO' },
        { accountId: checking, day: 4, amount: -29.99, label: 'PRLV SEPA BASIC FIT' },
        { accountId: checking, day: 15, amount: -180, label: 'PRLV SEPA DGFIP IMPOT PRELEVEMENT A LA SOURCE' },
        { accountId: checking, day: 8, amount: -160, label: 'VIR SEPA EMIS MARIE DUPONT MENAGE' },
        { accountId: checking, day: 28, amount: -600, label: 'VIR PERMANENT VERS PEA BOURSOBANK' },
        { accountId: checking, day: 28, amount: -150, label: 'VIR VERS LIVRET A' },
        { accountId: DEMO_LIVRET_ACCOUNT_ID, day: 28, amount: 150, label: 'VIR DE COMPTE COURANT' },
    ];
    const groceries = ['CARREFOUR CITY', 'MONOPRIX', 'LIDL', 'PICARD', 'BIOCOOP', 'FRANPRIX'];
    for (let i = 0, n = 5 + Math.floor(rand() * 3); i < n; i++) {
        const day = 1 + Math.floor(rand() * 28);
        ops.push({ accountId: checking, day, amount: -between(14, 112), label: `CARTE ${dd(day)} ${pick(groceries)} PARIS`, hints: rand() > 0.5 ? { category: 'Alimentation', categoryParent: 'Vie quotidienne' } : undefined });
    }
    const dining = ['UBER EATS', 'RESTAURANT LE PETIT ZINC', 'DELIVEROO', 'STARBUCKS COFFEE'];
    for (let i = 0, n = 2 + Math.floor(rand() * 3); i < n; i++) {
        const day = 1 + Math.floor(rand() * 28);
        ops.push({ accountId: checking, day, amount: -between(8, 48), label: `CARTE ${dd(day)} ${pick(dining)}` });
    }
    for (let i = 0, n = 1 + Math.floor(rand() * 2); i < n; i++) {
        const day = 1 + Math.floor(rand() * 28);
        ops.push({ accountId: checking, day, amount: -between(42, 71), label: `CARTE ${dd(day)} ${pick(['TOTALENERGIES', 'ESSO'])} STATION` });
    }
    const shopping = ['AMAZON EU SARL', 'FNAC', 'DECATHLON', 'ZARA'];
    for (let i = 0, n = 1 + Math.floor(rand() * 3); i < n; i++) {
        const day = 1 + Math.floor(rand() * 28);
        ops.push({ accountId: checking, day, amount: -between(12, 140), label: `CARTE ${dd(day)} ${pick(shopping)}` });
    }
    if (rand() > 0.35) {
        const day = 1 + Math.floor(rand() * 24);
        ops.push({ accountId: checking, day, amount: -between(12, 42), label: `CARTE ${dd(day)} PHARMACIE DU MARCHE` });
        ops.push({ accountId: checking, day: day + 3, amount: 17.5, label: 'VIR SEPA RECU CPAM PARIS REMBOURSEMENT SOINS' });
    }
    if (rand() > 0.4) {
        const day = 1 + Math.floor(rand() * 28);
        ops.push({ accountId: checking, day, amount: -between(9, 24), label: `CARTE ${dd(day)} UGC CINE CITE` });
    }
    if (rand() > 0.6) {
        const day = 1 + Math.floor(rand() * 28);
        ops.push({ accountId: checking, day, amount: -pick([40, 60]), label: `RETRAIT DAB ${dd(day)} PARIS 11` });
    }
    if (rand() > 0.7) {
        const day = 1 + Math.floor(rand() * 28);
        ops.push({ accountId: checking, day, amount: between(20, 90), label: 'VIR SEPA RECU LEBONCOIN VENTE' });
    }
    if (monthIndex % 3 === 0) ops.push({ accountId: checking, day: 11, amount: -30, label: 'PRLV SEPA DON CROIX ROUGE FRANCAISE' });
    if (monthIndex === 11) {
        ops.push({ accountId: checking, day: 18, amount: -100, label: 'CARTE DON RESTOS DU COEUR' });
        ops.push({ accountId: checking, day: 20, amount: 1500, label: 'VIR SEPA RECU /DE ACME SAS /MOTIF PRIME ANNUELLE SALAIRE' });
    }
    if (monthIndex === 9) ops.push({ accountId: checking, day: 16, amount: -890, label: 'PRLV SEPA DGFIP TAXE FONCIERE' });
    if (monthIndex === 6) {
        ops.push({ accountId: checking, day: 9, amount: -620, label: `CARTE ${dd(9)} AIRBNB LISBOA` });
        ops.push({ accountId: checking, day: 9, amount: -312.4, label: `CARTE ${dd(9)} AIR FRANCE` });
        ops.push({ accountId: checking, day: 14, amount: -1.9, label: 'FRAIS PAIEMENT HORS ZONE EURO' });
    }
    if (monthIndex === 0) {
        ops.push({ accountId: DEMO_LIVRET_ACCOUNT_ID, day: 2, amount: 68.4, label: 'INTERETS CREDITEURS LIVRET A', type: 'INCOME', subType: 'INTEREST' });
    }
    return ops;
}

/** Opening balances (left out of the cash flow) and 12 months of operations. */
export function buildDemoCashflowOperations(now: Date = new Date()): UnifiedTransaction[] {
    const rand = seeded(52);
    const rows: UnifiedTransaction[] = [];
    const openedAt = monthsAgoISO(MONTHS + 1, 2, 9, 0, now);
    const base = (id: string, accountId: string, date: string): Omit<UnifiedTransaction, 'type' | 'rawType' | 'rawLabel' | 'amountPrimary'> => ({
        id,
        ownerId: 'default-user',
        accountId,
        instrumentId: 'instr-eur',
        batchId: DEMO_BANK_BATCH_ID,
        rowHash: `hash-${id}`,
        sourceOrigin: 'FILE',
        isSynthetic: false,
        isFiscal: false,
        sourceMode: 'history',
        transactionDate: date,
        assetSymbol: 'EUR',
        priceUnit: '1.00',
        createdAt: date,
        updatedAt: date,
        version: 1,
    });
    for (const [accountId, amount] of [[DEMO_CHECKING_ACCOUNT_ID, 2400], [DEMO_LIVRET_ACCOUNT_ID, 5000]] as const) {
        rows.push({
            ...base(`utx-cf-opening-${accountId}`, accountId, openedAt),
            type: 'DEPOSIT',
            rawType: 'Opening balance',
            label: 'Opening balance',
            rawLabel: 'SOLDE D OUVERTURE',
            amountPrimary: amount.toFixed(2),
            quantity: amount.toFixed(2),
            metadata: { openingBalance: true },
        });
    }

    for (let monthsAgo = MONTHS; monthsAgo >= 0; monthsAgo--) {
        const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
        const monthIndex = target.getUTCMonth();
        const maxDay = new Date(Date.UTC(target.getUTCFullYear(), monthIndex + 1, 0)).getUTCDate();
        const ops = monthOperations(monthIndex, monthsAgo, rand);
        ops.forEach((op, index) => {
            const day = Math.min(op.day, maxDay);
            const date = new Date(Date.UTC(target.getUTCFullYear(), monthIndex, day, 9 + (index % 9), (index * 7) % 60));
            // Before the import of the demo statement (an hour ago), never in the future
            if (date.getTime() >= now.getTime() - 2 * 3_600_000) return;
            const iso = date.toISOString();
            const type = op.type ?? (op.amount > 0 ? 'DEPOSIT' : 'WITHDRAW');
            rows.push({
                ...base(`utx-cf-${monthsAgo}-${index}`, op.accountId, iso),
                type,
                subType: op.subType,
                rawType: op.amount > 0 ? 'Credit' : 'Debit',
                label: op.label,
                rawLabel: op.label,
                amountPrimary: op.amount.toFixed(2),
                quantity: Math.abs(op.amount).toFixed(2),
                metadata: op.hints ? { bankHints: op.hints } : undefined,
            });
        });
    }
    return rows;
}
