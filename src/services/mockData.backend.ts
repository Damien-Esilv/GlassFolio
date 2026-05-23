/**
 * Mock Backend Data for Development
 * 
 * Provides initial data for institutes, accounts, and other backend entities.
 * This data is used as defaults when localStorage is empty.
 */

import {
    Institute,
    Account,
    ImportBatch,
    UnifiedTransaction,
    MappingTemplate
} from '../types/types.backend';

// ============================================================================
// INSTITUTES (Predefined)
// ============================================================================

export const institutes: Institute[] = [
    {
        id: 'inst-bourso',
        ownerId: 'default-user',
        name: 'BoursoBank',
        type: 'bank',
        isCustom: false,
        logoUrl: '/logos/bourso.png',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
    },
    {
        id: 'inst-binance',
        ownerId: 'default-user',
        name: 'Binance',
        type: 'exchange',
        isCustom: false,
        logoUrl: '/logos/binance.png',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
    },
    {
        id: 'inst-bitget',
        ownerId: 'default-user',
        name: 'Bitget',
        type: 'exchange',
        isCustom: false,
        logoUrl: '/logos/bitget.png',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
    },
    {
        id: 'inst-traderepublic',
        ownerId: 'default-user',
        name: 'Trade Republic',
        type: 'broker',
        isCustom: false,
        logoUrl: '/logos/traderepublic.png',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
    },
    {
        id: 'inst-fortuneo',
        ownerId: 'default-user',
        name: 'Fortuneo',
        type: 'bank',
        isCustom: false,
        logoUrl: '/logos/fortuneo.png',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
    },
    {
        id: 'inst-degiro',
        ownerId: 'default-user',
        name: 'Degiro',
        type: 'broker',
        isCustom: false,
        logoUrl: '/logos/degiro.png',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
    },
    {
        id: 'inst-ledger',
        ownerId: 'default-user',
        name: 'Ledger',
        type: 'wallet',
        isCustom: false,
        logoUrl: '/logos/ledger.png',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
    }
];

// ============================================================================
// ACCOUNTS (Examples)
// ============================================================================

export const accounts: Account[] = [
    {
        id: 'acc-bourso-cto',
        ownerId: 'default-user',
        instituteId: 'inst-bourso',
        name: 'BoursoBank CTO',
        type: 'investment',
        defaultCurrency: 'EUR',
        isActive: true,
        preferredImportMode: 'history',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
    },
    {
        id: 'acc-bourso-pea',
        ownerId: 'default-user',
        instituteId: 'inst-bourso',
        name: 'BoursoBank PEA',
        type: 'investment',
        defaultCurrency: 'EUR',
        isActive: true,
        preferredImportMode: 'history',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
    },
    {
        id: 'acc-binance-spot',
        ownerId: 'default-user',
        instituteId: 'inst-binance',
        name: 'Binance Spot',
        type: 'crypto_spot',
        defaultCurrency: 'EUR',
        isActive: true,
        preferredImportMode: 'history',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
    },
    {
        id: 'acc-binance-earn',
        ownerId: 'default-user',
        instituteId: 'inst-binance',
        name: 'Binance Earn',
        type: 'crypto_earn',
        defaultCurrency: 'EUR',
        isActive: true,
        preferredImportMode: 'snapshot',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
    },
    {
        id: 'acc-traderepublic',
        ownerId: 'default-user',
        instituteId: 'inst-traderepublic',
        name: 'Trade Republic',
        type: 'investment',
        defaultCurrency: 'EUR',
        isActive: true,
        preferredImportMode: 'snapshot',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
    }
];

// ============================================================================
// IMPORT BATCHES (Examples - start empty in prod)
// ============================================================================

export const importBatches: ImportBatch[] = [];

// ============================================================================
// UNIFIED TRANSACTIONS (Start empty)
// ============================================================================

export const unifiedTransactions: UnifiedTransaction[] = [];

// ============================================================================
// MAPPING TEMPLATES (Presets)
// ============================================================================

export const mappingTemplates: MappingTemplate[] = [
    {
        id: 'tpl-binance-history',
        ownerId: 'default-user',
        name: 'Binance Transaction History',
        instituteId: 'inst-binance',
        mappings: {
            transactionDate: 'UTC_Time',
            type: 'Operation',
            rawType: 'Operation',
            assetSymbol: 'Coin',
            amountPrimary: 'Change',
            rawLabel: 'Remark'
        },
        isPreset: true,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
    },
    {
        id: 'tpl-bourso-export',
        ownerId: 'default-user',
        name: 'BoursoBank Export',
        instituteId: 'inst-bourso',
        mappings: {
            transactionDate: 'dateOp',
            valueDate: 'dateVal',
            rawLabel: 'label',
            amountPrimary: 'amount',
            balanceAfter: 'accountBalance',
            assetSymbol: 'EUR'
        },
        dateFormat: 'DD/MM/YYYY',
        delimiter: ';',
        isPreset: true,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
    },
    {
        id: 'tpl-traderepublic',
        ownerId: 'default-user',
        name: 'Trade Republic',
        instituteId: 'inst-traderepublic',
        mappings: {
            transactionDate: 'Date',
            type: 'Type',
            assetIsin: 'ISIN',
            assetSymbol: 'Name',
            quantity: 'Shares',
            priceUnit: 'Price',
            amountPrimary: 'Amount'
        },
        isPreset: true,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
    }
];
