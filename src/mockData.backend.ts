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
    // --- BATCH 1: Binance History (Crypto) ---
    {
        id: 'utx-binance-1',
        accountId: 'acc-binance-spot',
        batchId: 'batch-binance-1',
        externalId: 'tx-bn-001',
        transactionDate: '2024-01-15T10:30:00Z',
        type: 'BUY',
        rawType: 'Transaction Buy',
        label: 'Buy BTC',
        rawLabel: 'BTC/USDT Buy Limit',
        amountPrimary: '-5000.00',
        assetSymbol: 'USDT',
        assetIsin: undefined,
        priceUnit: '42000.50',
        quantity: '0.119046',
        feeAmount: '5.00',
        feeAsset: 'USDT',
        metadata: {
            orderId: 'ord-001',
            pair: 'BTCUSDT'
        }
    },
    {
        id: 'utx-binance-2',
        accountId: 'acc-binance-spot',
        batchId: 'batch-binance-1',
        externalId: 'tx-bn-002',
        transactionDate: '2024-02-10T14:15:00Z',
        type: 'SWAP', // ETH -> BTC
        rawType: 'Convert',
        label: 'Swap ETH to BTC',
        rawLabel: 'Convert ETH for BTC',
        amountPrimary: '-1.5',
        assetSymbol: 'ETH',
        feeAmount: '0.001',
        feeAsset: 'ETH',
        metadata: {
            toAsset: 'BTC',
            toAmount: '0.085'
        }
    },
    {
        id: 'utx-binance-3',
        accountId: 'acc-binance-spot',
        batchId: 'batch-binance-1', // Binance Earn batch
        transactionDate: '2024-03-01T00:00:00Z',
        type: 'INCOME',
        rawType: 'Simple Earn',
        label: 'Staking Rewards',
        rawLabel: 'Simple Earn Flexible Interest',
        amountPrimary: '0.000055',
        assetSymbol: 'BTC',
        metadata: {
            product: 'Flexible',
            apy: '0.05'
        }
    },

    // --- BATCH 2: BoursoBank (Equities/Cash) ---
    {
        id: 'utx-bourso-1',
        accountId: 'acc-bourso-pea',
        batchId: 'batch-bourso-1',
        transactionDate: '2024-01-20T09:00:00Z',
        valueDate: '2024-01-22T00:00:00Z',
        type: 'BUY',
        rawType: 'Virement émis',
        label: 'Achat LVMH',
        rawLabel: 'ACHAT LVMH MOET HENNESSY',
        amountPrimary: '-1350.00',
        assetSymbol: 'MC',
        assetIsin: 'FR0000121014',
        priceUnit: '675.00',
        quantity: '2',
        feeAmount: '6.50',
        feeAsset: 'EUR',
        balanceAfter: '4500.00',
        metadata: {
            description: 'Exec: 2 @ 675.00'
        }
    },
    {
        id: 'utx-bourso-2',
        accountId: 'acc-bourso-pea',
        batchId: 'batch-bourso-1',
        transactionDate: '2024-04-15T09:00:00Z',
        valueDate: '2024-04-17T00:00:00Z',
        type: 'INCOME',
        rawType: 'Coupons',
        label: 'Dividende LVMH',
        rawLabel: 'DIVIDENDE LVMH',
        amountPrimary: '26.00',
        assetSymbol: 'MC',
        assetIsin: 'FR0000121014',
        taxAmount: '4.50',
        balanceAfter: '4526.00',
        metadata: {
            grossAmount: '30.50'
        }
    },
    {
        id: 'utx-bourso-3',
        accountId: 'acc-bourso-main',
        batchId: 'batch-bourso-1',
        externalId: 'vir-001',
        transactionDate: '2024-05-01T10:00:00Z',
        valueDate: '2024-05-01T00:00:00Z',
        type: 'DEPOSIT',
        rawType: 'Virement reçu',
        label: 'Salaire Mai',
        rawLabel: 'VIR RECU TIERS XYZ',
        amountPrimary: '3500.00',
        assetSymbol: 'EUR',
        balanceAfter: '5200.00',
        metadata: {
            sender: 'Employer SAS'
        }
    },
    {
        id: 'utx-bourso-4',
        accountId: 'acc-bourso-main',
        batchId: 'batch-bourso-1',
        transactionDate: '2024-05-05T14:30:00Z',
        valueDate: '2024-05-05T00:00:00Z',
        type: 'TRANSFER',
        rawType: 'Virement interne',
        label: 'Epargne mensuelle',
        rawLabel: 'VIR VERS CMPT EPARGNE',
        amountPrimary: '-500.00',
        assetSymbol: 'EUR',
        balanceAfter: '4700.00',
        metadata: {
            beneficiary: 'Livret A'
        }
    },

    // --- BATCH 3: Kraken (Crypto) ---
    {
        id: 'utx-kraken-1',
        accountId: 'acc-kraken-spot',
        batchId: 'batch-kraken-1',
        externalId: 'tx-kr-001',
        transactionDate: '2024-06-01T12:00:00Z',
        type: 'BUY',
        rawType: 'buy',
        label: 'Buy SOL',
        rawLabel: 'Buy Solana',
        amountPrimary: '-200.00',
        assetSymbol: 'USD',
        priceUnit: '145.50',
        quantity: '1.3745',
        feeAmount: '0.52',
        feeAsset: 'USD',
        metadata: {
            pair: 'SOLUSD'
        }
    },
    // Stock transactions (Trade Republic / PEA)
    {
        id: 'utx-004',
        accountId: 'acc-006',
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
        accountId: 'acc-006',
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
        accountId: 'acc-bourso-main',
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
        accountId: 'acc-bourso-main',
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
        accountId: 'acc-binance-spot',
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
