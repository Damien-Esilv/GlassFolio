import type { AccountType } from '../../types';
import { db } from '../db';

/** What an import knows about where its assets are held: it steers their classification. */
export interface AccountContext {
    accountType?: AccountType;
    instituteType?: string;
    instituteName?: string;
    /** Exchange to record for assets held at a crypto institution (the institution itself). */
    exchange?: string;
}

export function getAccountContext(accountId: string): AccountContext {
    const account = db.getAccountById(accountId);
    const institute = account ? db.getInstitutes().find(i => i.id === account.instituteId) : undefined;
    const cryptoHeld = account?.type?.startsWith('crypto') || institute?.type === 'exchange' || institute?.type === 'wallet';
    return {
        accountType: account?.type,
        instituteType: institute?.type,
        instituteName: institute?.name,
        exchange: cryptoHeld ? institute?.name : undefined,
    };
}
