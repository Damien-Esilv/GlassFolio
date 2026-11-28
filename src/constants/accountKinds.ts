import type { AccountType, WrapperType } from '../types/types.backend';

/**
 * The single choice offered when creating an account. It sets both the account type (what it holds by
 * default) and the tax wrapper (which regime applies), which used to be two overlapping selects.
 * A kind is only a default: any account can still hold cash, and a cash line stays cash everywhere.
 */
export const ACCOUNT_KINDS = ['CTO', 'PEA', 'CRYPTO', 'CASH', 'SAVINGS', 'OTHER'] as const;
export type AccountKind = typeof ACCOUNT_KINDS[number];

const FIELDS: Record<AccountKind, { type: AccountType; wrapperType: WrapperType }> = {
    CTO: { type: 'investment', wrapperType: 'CTO' },
    PEA: { type: 'investment', wrapperType: 'PEA' },
    CRYPTO: { type: 'crypto_spot', wrapperType: 'OTHER' },
    // A checking account takes bank operations; a savings account (Livret…) its operations or its balance (Epic E52)
    CASH: { type: 'checking', wrapperType: 'OTHER' },
    SAVINGS: { type: 'savings', wrapperType: 'LIVRET' },
    OTHER: { type: 'other', wrapperType: 'OTHER' },
};

export function accountKindToFields(kind: AccountKind): { type: AccountType; wrapperType: WrapperType } {
    return { ...FIELDS[kind] };
}

/** The kind an existing account falls under (demo and older accounts carry more types and wrappers). */
export function fieldsToAccountKind(type?: AccountType, wrapperType?: WrapperType): AccountKind {
    if (wrapperType === 'PEA' || wrapperType === 'PEA_PME') return 'PEA';
    if (type === 'crypto_spot' || type === 'crypto_earn' || type === 'crypto_futures') return 'CRYPTO';
    if (type === 'savings' || wrapperType === 'LIVRET') return 'SAVINGS';
    if (type === 'checking') return 'CASH';
    if (wrapperType === 'ASSURANCE_VIE' || wrapperType === 'PER' || type === 'other') return 'OTHER';
    if (type === 'investment' || wrapperType === 'CTO') return 'CTO';
    return 'OTHER';
}
