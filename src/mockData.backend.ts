/**
 * Mock Data for Backend Entities
 * 
 * Sample data for Institute, Account, ImportBatch, and UnifiedTransaction
 * to enable development and testing of the multi-asset architecture.
 */

import {
    Institute,
    Account,
    ImportBatch,
    UnifiedTransaction,
    MappingTemplate
} from './types';

// ============================================================================
// INSTITUTES
// ============================================================================

export const institutes: Institute[] = [
    {
        id: 'inst-001',
        name: 'BoursoBank',
        type: 'bank',
        isCustom: false,
        logoUrl: undefined,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
    },
    {
        id: 'inst-002',
        name: 'Binance',
        type: 'exchange',
        isCustom: false,
        logoUrl: undefined,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
    },
    {
        id: 'inst-003',
        name: 'Trade Republic',
        type: 'broker',
        isCustom: false,
        logoUrl: undefined,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
    },
    {
        id: 'inst-004',
        name: 'Ledger Nano X',
        type: 'wallet',
        isCustom: true,
        logoUrl: undefined,
        createdAt: '2024-06-15T10:30:00Z',
        updatedAt: '2024-06-15T10:30:00Z'
    }
];

// ============================================================================
// ACCOUNTS
// ============================================================================

export const accounts: Account[] = [
    // BoursoBank accounts
    {
        id: 'acc-001',
        instituteId: 'inst-001',
        name: 'Compte Courant',
        type: 'checking',
        defaultCurrency: 'EUR',
        isActive: true,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
    },
    {
        id: 'acc-002',
        instituteId: 'inst-001',
        name: 'Livret A',
        type: 'savings',
        defaultCurrency: 'EUR',
        isActive: true,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
    },
    {
        id: 'acc-003',
        instituteId: 'inst-001',
        name: 'PEA',
        type: 'investment',
        defaultCurrency: 'EUR',
        isActive: true,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
    },
    // Binance accounts
    {
        id: 'acc-004',
        instituteId: 'inst-002',
        name: 'Spot Wallet',
        type: 'crypto_spot',
        defaultCurrency: 'USDT',
        isActive: true,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
    },
    {
        id: 'acc-005',
        instituteId: 'inst-002',
        name: 'Earn Wallet',
        type: 'crypto_earn',
        defaultCurrency: 'USDT',
        isActive: true,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
    },
    // Trade Republic
    {
        id: 'acc-006',
        instituteId: 'inst-003',
        name: 'Investment Account',
        type: 'investment',
        defaultCurrency: 'EUR',
        isActive: true,
        createdAt: '2024-03-15T00:00:00Z',
        updatedAt: '2024-03-15T00:00:00Z'
    },
    // Ledger
    {
        id: 'acc-007',
        instituteId: 'inst-004',
        name: 'Cold Storage',
        type: 'crypto_spot',
        defaultCurrency: 'BTC',
        isActive: true,
        createdAt: '2024-06-15T10:30:00Z',
        updatedAt: '2024-06-15T10:30:00Z'
    }
];

// ============================================================================
// IMPORT BATCHES
// ============================================================================

export const importBatches: ImportBatch[] = [
    {
        id: 'batch-001',
        accountId: 'acc-004',
        importMode: 'history',
        mappingTemplateId: 'tpl-binance',
        fileName: 'binance_export_2024.csv',
        transactionCount: 5,
        importedAt: '2024-12-01T14:30:00Z',
        status: 'completed',
        metadata: {
            originalRows: 5,
            skippedDuplicates: 0
        }
    },
    {
        id: 'batch-002',
        accountId: 'acc-003',
        importMode: 'snapshot',
        fileName: 'pea_positions_dec2024.csv',
        transactionCount: 3,
        importedAt: '2024-12-15T09:00:00Z',
        status: 'completed',
        metadata: {
            snapshotDate: '2024-12-15'
        }
    }
];

// ============================================================================
// UNIFIED TRANSACTIONS
// ============================================================================

export const unifiedTransactions: UnifiedTransaction[] = [
    // Crypto transactions (Binance)
    {
        id: 'utx-001',
        batchId: 'batch-001',
        externalId: 'BINANCE-TX-123456',
        transactionDate: '2024-11-15T14:32:00Z',
        type: 'BUY',
        rawType: 'Buy',
        label: 'Buy BTC with USDT',
        rawLabel: 'Buy BTC',
        amountPrimary: '-1500.00',
        assetSymbol: 'USDT',
        priceUnit: '62500.00',
        quantity: '0.024',
        feeAmount: '1.50',
        feeAsset: 'USDT',
        metadata: {
            pair: 'BTC/USDT',
            orderType: 'Market'
        }
    },
    {
        id: 'utx-002',
        batchId: 'batch-001',
        externalId: 'BINANCE-TX-123457',
        transactionDate: '2024-11-20T09:15:00Z',
        type: 'SWAP',
        rawType: 'Small Assets Exchange',
        label: 'Swap dust to BNB',
        rawLabel: 'Small Assets Exchange BNB',
        amountPrimary: '0.05',
        assetSymbol: 'BNB',
        feeAmount: '0',
        feeAsset: 'BNB',
        metadata: {
            originalAssets: ['SHIB', 'DOGE'],
            isConversion: true
        }
    },
    {
        id: 'utx-003',
        batchId: 'batch-001',
        transactionDate: '2024-11-25T00:00:00Z',
        type: 'INCOME',
        rawType: 'Savings Interest',
        label: 'Flexible Savings Interest',
        rawLabel: 'Simple Earn Flexible Interest',
        amountPrimary: '0.00012345',
        assetSymbol: 'BTC',
        metadata: {
            product: 'Flexible Savings',
            apy: '1.2%'
        }
    },
    // Stock transactions (Trade Republic / PEA)
    {
        id: 'utx-004',
        batchId: 'batch-002',
        transactionDate: '2024-06-10T10:00:00Z',
        valueDate: '2024-06-12T00:00:00Z',
        type: 'BUY',
        rawType: 'Achat',
        label: 'Buy Apple Inc.',
        rawLabel: 'APPLE INC - ACHAT 10 ACTIONS',
        amountPrimary: '-1505.00',
        assetSymbol: 'AAPL',
        assetIsin: 'US0378331005',
        priceUnit: '150.00',
        quantity: '10',
        feeAmount: '5.00',
        feeAsset: 'EUR',
        taxAmount: '0',
        metadata: {
            market: 'NASDAQ',
            orderRef: 'ORD-2024-001'
        }
    },
    {
        id: 'utx-005',
        batchId: 'batch-002',
        transactionDate: '2024-09-15T16:00:00Z',
        valueDate: '2024-09-17T00:00:00Z',
        type: 'INCOME',
        rawType: 'Dividende',
        label: 'Apple Dividend Q3 2024',
        rawLabel: 'APPLE INC - DIVIDENDE',
        amountPrimary: '2.40',
        assetSymbol: 'USD',
        taxAmount: '0.72',
        balanceAfter: '502.40',
        metadata: {
            dividendPerShare: '0.24',
            sharesHeld: 10,
            grossAmount: '2.40',
            withholdingRate: '30%'
        }
    },
    // Bank transactions (BoursoBank)
    {
        id: 'utx-006',
        batchId: 'batch-001',
        externalId: 'BOURSO-REF-789',
        transactionDate: '2024-12-01T00:00:00Z',
        valueDate: '2024-12-01T00:00:00Z',
        type: 'DEPOSIT',
        rawType: 'Virement reçu',
        label: 'Salary December 2024',
        rawLabel: 'VIR SEPA EMPLOYEUR SA SALAIRE DEC',
        amountPrimary: '3500.00',
        assetSymbol: 'EUR',
        balanceAfter: '5230.50',
        metadata: {
            senderName: 'EMPLOYEUR SA',
            reference: 'SALAIRE DEC 2024'
        }
    },
    {
        id: 'utx-007',
        batchId: 'batch-001',
        transactionDate: '2024-12-05T00:00:00Z',
        valueDate: '2024-12-05T00:00:00Z',
        type: 'TRANSFER',
        rawType: 'Virement émis',
        label: 'Transfer to Livret A',
        rawLabel: 'VIR INTERNE LIVRET A EPARGNE',
        amountPrimary: '-500.00',
        assetSymbol: 'EUR',
        balanceAfter: '4730.50',
        metadata: {
            destinationAccount: 'Livret A'
        }
    },
    // Complex crypto example: Fee in different asset
    {
        id: 'utx-008',
        batchId: 'batch-001',
        externalId: 'BINANCE-TX-999999',
        transactionDate: '2024-12-10T18:45:00Z',
        type: 'BUY',
        rawType: 'Buy',
        label: 'Buy ETH with BNB fee discount',
        rawLabel: 'Spot Buy ETH',
        amountPrimary: '-2000.00',
        assetSymbol: 'USDT',
        priceUnit: '2500.00',
        quantity: '0.8',
        feeAmount: '0.002',
        feeAsset: 'BNB', // Fee paid in BNB, not USDT!
        metadata: {
            pair: 'ETH/USDT',
            bnbBurnEnabled: true,
            feeDiscount: '25%'
        }
    }
];

// ============================================================================
// MAPPING TEMPLATES
// ============================================================================

export const mappingTemplates: MappingTemplate[] = [
    {
        id: 'tpl-binance',
        name: 'Binance Export',
        instituteId: 'inst-002',
        mappings: {
            transactionDate: 'UTC_Time',
            type: 'Operation',
            amountPrimary: 'Change',
            assetSymbol: 'Coin',
            rawLabel: 'Remark'
        },
        dateFormat: 'YYYY-MM-DD HH:mm:ss',
        delimiter: ',',
        createdAt: '2024-01-15T00:00:00Z',
        updatedAt: '2024-01-15T00:00:00Z'
    },
    {
        id: 'tpl-bourso',
        name: 'BoursoBank CSV',
        instituteId: 'inst-001',
        mappings: {
            transactionDate: 'dateOp',
            valueDate: 'dateVal',
            rawLabel: 'label',
            amountPrimary: 'amount',
            balanceAfter: 'accountBalance'
        },
        dateFormat: 'DD/MM/YYYY',
        delimiter: ';',
        createdAt: '2024-02-01T00:00:00Z',
        updatedAt: '2024-02-01T00:00:00Z'
    }
];
