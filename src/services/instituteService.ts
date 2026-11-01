/**
 * Institute Service
 * 
 * CRUD operations for Institutes and Accounts in the multi-asset architecture.
 */

import { db, delay } from './db';
import { Institute, Account, InstituteType, AccountType } from '../types';
import { WrapperType, CostBasisMethod } from '../types/types.backend';
import { portfolioService } from './portfolioService';
import { userRepository } from './repositories';

// ============================================================================
// INSTITUTE OPERATIONS
// ============================================================================

export const instituteService = {
    /**
     * Get all institutes
     */
    getInstitutes: async (): Promise<Institute[]> => {
        await delay(100);
        return db.getInstitutes();
    },

    /**
     * Get a single institute by ID
     */
    getInstituteById: async (id: string): Promise<Institute | undefined> => {
        await delay(50);
        return db.getInstitutes().find(inst => inst.id === id);
    },

    /**
     * Create a new institute
     */
    createInstitute: async (data: {
        name: string;
        type: InstituteType;
        country?: string;
        isCustom?: boolean;
        logoUrl?: string;
    }): Promise<Institute> => {
        await delay(200);

        const now = new Date().toISOString();
        const currentUser = await userRepository.getUser();
        const newInstitute: Institute = {
            id: `inst-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
            ownerId: currentUser?.id || 'default-user',
            name: data.name,
            type: data.type,
            country: data.country || 'FR',
            isCustom: data.isCustom ?? true, // User-created by default
            logoUrl: data.logoUrl,
            createdAt: now,
            updatedAt: now
        };

        const institutes = db.getInstitutes();
        db.saveInstitutes([...institutes, newInstitute]);

        return newInstitute;
    },

    /**
     * Update an existing institute
     */
    updateInstitute: async (id: string, updates: Partial<Omit<Institute, 'id' | 'createdAt'>>): Promise<Institute | null> => {
        await delay(150);

        const institutes = db.getInstitutes();
        const index = institutes.findIndex(inst => inst.id === id);

        if (index === -1) return null;

        const updated: Institute = {
            ...institutes[index],
            ...updates,
            updatedAt: new Date().toISOString()
        };

        institutes[index] = updated;
        db.saveInstitutes(institutes);

        return updated;
    },

    /**
     * Delete an institute (and all its accounts)
     */
    deleteInstitute: async (id: string): Promise<boolean> => {
        await delay(200);

        const institutes = db.getInstitutes();
        const filtered = institutes.filter(inst => inst.id !== id);

        if (filtered.length === institutes.length) return false;

        // Also delete all accounts belonging to this institute
        const accounts = db.getAccounts();
        const filteredAccounts = accounts.filter(acc => acc.instituteId !== id);

        db.saveInstitutes(filtered);
        db.saveAccounts(filteredAccounts);

        return true;
    }
};

// ============================================================================
// ACCOUNT OPERATIONS
// ============================================================================

export const accountService = {
    /**
     * Get all accounts
     */
    getAccounts: async (): Promise<Account[]> => {
        await delay(100);
        return db.getAccounts();
    },

    /**
     * Get accounts filtered by institute
     */
    getAccountsByInstitute: async (instituteId: string): Promise<Account[]> => {
        await delay(100);
        return db.getAccountsByInstitute(instituteId);
    },

    /**
     * Get a single account by ID
     */
    getAccountById: async (id: string): Promise<Account | undefined> => {
        await delay(50);
        return db.getAccounts().find(acc => acc.id === id);
    },

    /**
     * Create a new account
     */
    createAccount: async (data: {
        instituteId: string;
        name: string;
        type: AccountType;
        defaultCurrency: string;
        isActive?: boolean;
        wrapperType?: WrapperType;
    }): Promise<Account> => {
        await delay(200);

        const now = new Date().toISOString();
        const currentUser = await userRepository.getUser();
        const newAccount: Account = {
            id: `acc-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
            ownerId: currentUser?.id || 'default-user',
            instituteId: data.instituteId,
            name: data.name,
            type: data.type,
            defaultCurrency: data.defaultCurrency,
            isActive: data.isActive ?? true,
            wrapperType: data.wrapperType,
            createdAt: now,
            updatedAt: now
        };

        const accounts = db.getAccounts();
        db.saveAccounts([...accounts, newAccount]);

        return newAccount;
    },

    /**
     * Update an existing account
     */
    updateAccount: async (id: string, updates: Partial<Omit<Account, 'id' | 'createdAt'>>): Promise<Account | null> => {
        await delay(150);

        const accounts = db.getAccounts();
        const index = accounts.findIndex(acc => acc.id === id);

        if (index === -1) return null;

        const updated: Account = {
            ...accounts[index],
            ...updates,
            updatedAt: new Date().toISOString()
        };

        accounts[index] = updated;
        db.saveAccounts(accounts);

        return updated;
    },

    /**
     * Change how an account values positions (WAC = PRU, FIFO = oldest lots
     * first) and recompute every derived position.
     */
    setCostBasisMethod: async (id: string, method: CostBasisMethod): Promise<Account | null> => {
        const updated = await accountService.updateAccount(id, { costBasisMethod: method });
        if (updated) await portfolioService.recalculatePositions();
        return updated;
    },

    /**
     * Delete an account
     */
    deleteAccount: async (id: string): Promise<boolean> => {
        await delay(150);

        const accounts = db.getAccounts();
        const filtered = accounts.filter(acc => acc.id !== id);

        if (filtered.length === accounts.length) return false;

        db.saveAccounts(filtered);
        return true;
    }
};
