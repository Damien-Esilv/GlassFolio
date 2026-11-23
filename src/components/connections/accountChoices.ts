import type { Account, Institute } from '../../types';

/** A GlassFolio account as the connection forms offer it: "Bitget · Crypto", so two "Crypto" accounts stay apart. */
export interface AccountChoice {
    id: string;
    label: string;
}

export const accountLabel = (account: Account, institutes: Map<string, Institute>): string => {
    const institute = institutes.get(account.instituteId)?.name;
    return institute && institute !== account.name ? `${institute} · ${account.name}` : account.name;
};

export const toAccountChoices = (accounts: Account[], institutes: Map<string, Institute>): AccountChoice[] =>
    accounts
        .map(account => ({ id: account.id, label: accountLabel(account, institutes) }))
        .sort((a, b) => a.label.localeCompare(b.label));
