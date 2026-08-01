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
    MappingTemplate,
    Instrument
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
    },
    {
        id: 'inst-chase',
        ownerId: 'default-user',
        name: 'Chase',
        type: 'bank',
        isCustom: false,
        logoUrl: '/logos/chase.png',
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
    },
    {
        id: 'acc-chase-savings',
        ownerId: 'default-user',
        instituteId: 'inst-chase',
        name: 'Chase Savings',
        type: 'savings',
        defaultCurrency: 'USD',
        isActive: true,
        preferredImportMode: 'history',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
    }
];

// ============================================================================
// INSTRUMENTS (Preseeded)
// ============================================================================

export const instruments: Instrument[] = [
    {
        id: 'instr-aapl',
        ownerId: 'default-user',
        name: 'Apple Inc.',
        type: 'stock',
        marketIdentifier: {
            symbol: 'AAPL',
            isin: 'US0378331005',
            exchange: 'XNAS'
        },
        isMarketReady: true,
        denominationCurrency: 'USD',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
    },
    {
        id: 'instr-vt',
        ownerId: 'default-user',
        name: 'Vanguard Total World Stock ETF',
        type: 'etf',
        marketIdentifier: {
            symbol: 'VT',
            isin: 'US9229087690',
            exchange: 'XARC'
        },
        isMarketReady: true,
        denominationCurrency: 'USD',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
    },
    {
        id: 'instr-btc',
        ownerId: 'default-user',
        name: 'Bitcoin',
        type: 'crypto',
        marketIdentifier: {
            symbol: 'BTC',
            exchange: 'Binance'
        },
        isMarketReady: true,
        denominationCurrency: 'USD',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
    },
    {
        id: 'instr-eur',
        ownerId: 'default-user',
        name: 'Euro',
        type: 'cash',
        marketIdentifier: {
            symbol: 'EUR',
            currencyCode: 'EUR'
        },
        isMarketReady: true,
        denominationCurrency: 'EUR',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
    },
    {
        id: 'instr-usd',
        ownerId: 'default-user',
        name: 'US Dollar',
        type: 'cash',
        marketIdentifier: {
            symbol: 'USD',
            currencyCode: 'USD'
        },
        isMarketReady: true,
        denominationCurrency: 'USD',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
    },
    {
        id: 'instr-msft',
        ownerId: 'default-user',
        name: 'Microsoft Corporation',
        type: 'stock',
        marketIdentifier: {
            symbol: 'MSFT',
            isin: 'US5949181045',
            exchange: 'XNAS'
        },
        isMarketReady: true,
        denominationCurrency: 'USD',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
    },
    {
        id: 'instr-eth',
        ownerId: 'default-user',
        name: 'Ethereum',
        type: 'crypto',
        marketIdentifier: {
            symbol: 'ETH',
            exchange: 'Binance'
        },
        isMarketReady: true,
        denominationCurrency: 'USD',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
    },
    {
        id: 'instr-cw8',
        ownerId: 'default-user',
        name: 'Amundi MSCI World UCITS ETF',
        type: 'etf',
        marketIdentifier: {
            symbol: 'CW8',
            isin: 'LU1681043599',
            exchange: 'XPAR'
        },
        isMarketReady: true,
        denominationCurrency: 'EUR',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
    }
];

// ============================================================================
// IMPORT BATCHES (5 distinct demo batches with varied transaction counts)
// ============================================================================

export const importBatches: ImportBatch[] = [
    {
        id: 'batch-initial',
        ownerId: 'default-user',
        accountId: 'acc-bourso-pea',
        importMode: 'history',
        fileName: 'bourso_depot_initial.csv',
        fileHash: 'hash-initial-cash-2024',
        transactionCount: 2,
        skippedCount: 0,
        importedAt: '2024-01-05T10:00:00Z',
        importedBy: 'default-user',
        status: 'completed',
        engineVersion: '3.0.0'
    },
    {
        id: 'batch-actions',
        ownerId: 'default-user',
        accountId: 'acc-traderepublic',
        importMode: 'history',
        fileName: 'traderepublic_actions_2024.csv',
        fileHash: 'hash-actions-stocks-2024',
        transactionCount: 5,
        skippedCount: 0,
        importedAt: '2024-01-15T14:30:00Z',
        importedBy: 'default-user',
        status: 'completed',
        engineVersion: '3.0.0'
    },
    {
        id: 'batch-etfs',
        ownerId: 'default-user',
        accountId: 'acc-traderepublic',
        importMode: 'history',
        fileName: 'degiro_etf_selection.csv',
        fileHash: 'hash-etf-selection-2024',
        transactionCount: 3,
        skippedCount: 0,
        importedAt: '2024-02-10T09:15:00Z',
        importedBy: 'default-user',
        status: 'completed',
        engineVersion: '3.0.0'
    },
    {
        id: 'batch-crypto',
        ownerId: 'default-user',
        accountId: 'acc-binance-spot',
        importMode: 'history',
        fileName: 'binance_crypto_trades.csv',
        fileHash: 'hash-crypto-trades-2024',
        transactionCount: 3,
        skippedCount: 0,
        importedAt: '2024-03-01T16:00:00Z',
        importedBy: 'default-user',
        status: 'completed',
        engineVersion: '3.0.0'
    },
    {
        id: 'batch-crypto-dca',
        ownerId: 'default-user',
        accountId: 'acc-binance-earn',
        importMode: 'history',
        fileName: 'bitget_crypto_dca_2024.csv',
        fileHash: 'hash-crypto-dca-2024',
        transactionCount: 3,
        skippedCount: 0,
        importedAt: '2024-03-15T18:20:00Z',
        importedBy: 'default-user',
        status: 'completed',
        engineVersion: '3.0.0'
    }
];

// ============================================================================
// UNIFIED TRANSACTIONS (Linked to the 5 batches)
// ============================================================================

export const unifiedTransactions: UnifiedTransaction[] = [
    // --- Batch 1: Initial Cash Deposits (2 txs) ---
    {
        id: 'utx-seed-1',
        ownerId: 'default-user',
        accountId: 'acc-bourso-pea',
        instrumentId: 'instr-eur',
        batchId: 'batch-initial',
        rowHash: 'hash-seed-1',
        sourceOrigin: 'FILE',
        isSynthetic: false,
        isFiscal: true,
        sourceMode: 'history',
        transactionDate: '2024-01-05T08:00:00Z',
        type: 'DEPOSIT',
        rawType: 'Deposit',
        label: 'Euro PEA Deposit',
        rawLabel: 'Dépôt Euro PEA BoursoBank',
        amountPrimary: '15000.00',
        assetSymbol: 'EUR',
        priceUnit: '1.00',
        quantity: '15000.00',
        feeAmount: '0.00',
        createdAt: '2024-01-05T08:00:00Z',
        updatedAt: '2024-01-05T08:00:00Z',
        version: 1
    },
    {
        id: 'utx-seed-2',
        ownerId: 'default-user',
        accountId: 'acc-chase-savings',
        instrumentId: 'instr-usd',
        batchId: 'batch-initial',
        rowHash: 'hash-seed-2',
        sourceOrigin: 'FILE',
        isSynthetic: false,
        isFiscal: true,
        sourceMode: 'history',
        transactionDate: '2024-01-05T09:00:00Z',
        type: 'DEPOSIT',
        rawType: 'Deposit',
        label: 'USD Savings Deposit',
        rawLabel: 'Chase Savings Deposit',
        amountPrimary: '10000.00',
        assetSymbol: 'USD',
        priceUnit: '1.00',
        quantity: '10000.00',
        feeAmount: '0.00',
        createdAt: '2024-01-05T09:00:00Z',
        updatedAt: '2024-01-05T09:00:00Z',
        version: 1
    },

    // --- Batch 2: Actions / Stocks Import (5 txs) ---
    {
        id: 'utx-action-1',
        ownerId: 'default-user',
        accountId: 'acc-traderepublic',
        instrumentId: 'instr-aapl',
        batchId: 'batch-actions',
        rowHash: 'hash-action-1',
        sourceOrigin: 'FILE',
        isSynthetic: false,
        isFiscal: true,
        sourceMode: 'history',
        transactionDate: '2024-01-15T14:30:00Z',
        type: 'BUY',
        rawType: 'Buy',
        label: 'Buy 100 AAPL @ 150.00',
        rawLabel: 'Achat 100 AAPL Trade Republic',
        amountPrimary: '-15000.00',
        assetSymbol: 'AAPL',
        assetIsin: 'US0378331005',
        priceUnit: '150.00',
        quantity: '100.00',
        feeAmount: '1.00',
        createdAt: '2024-01-15T14:30:00Z',
        updatedAt: '2024-01-15T14:30:00Z',
        version: 1
    },
    {
        id: 'utx-action-2',
        ownerId: 'default-user',
        accountId: 'acc-traderepublic',
        instrumentId: 'instr-msft',
        batchId: 'batch-actions',
        rowHash: 'hash-action-2',
        sourceOrigin: 'FILE',
        isSynthetic: false,
        isFiscal: true,
        sourceMode: 'history',
        transactionDate: '2024-01-18T16:00:00Z',
        type: 'BUY',
        rawType: 'Buy',
        label: 'Buy 20 MSFT @ 380.00',
        rawLabel: 'Achat 20 MSFT Trade Republic',
        amountPrimary: '-7600.00',
        assetSymbol: 'MSFT',
        assetIsin: 'US5949181045',
        priceUnit: '380.00',
        quantity: '20.00',
        feeAmount: '1.00',
        createdAt: '2024-01-18T16:00:00Z',
        updatedAt: '2024-01-18T16:00:00Z',
        version: 1
    },
    {
        id: 'utx-action-3',
        ownerId: 'default-user',
        accountId: 'acc-traderepublic',
        instrumentId: 'instr-aapl',
        batchId: 'batch-actions',
        rowHash: 'hash-action-3',
        sourceOrigin: 'FILE',
        isSynthetic: false,
        isFiscal: true,
        sourceMode: 'history',
        transactionDate: '2024-01-22T11:15:00Z',
        type: 'BUY',
        rawType: 'Buy',
        label: 'Buy 15 AAPL @ 160.00',
        rawLabel: 'Achat 15 AAPL Trade Republic',
        amountPrimary: '-2400.00',
        assetSymbol: 'AAPL',
        assetIsin: 'US0378331005',
        priceUnit: '160.00',
        quantity: '15.00',
        feeAmount: '1.00',
        createdAt: '2024-01-22T11:15:00Z',
        updatedAt: '2024-01-22T11:15:00Z',
        version: 1
    },
    {
        id: 'utx-action-4',
        ownerId: 'default-user',
        accountId: 'acc-traderepublic',
        instrumentId: 'instr-msft',
        batchId: 'batch-actions',
        rowHash: 'hash-action-4',
        sourceOrigin: 'FILE',
        isSynthetic: false,
        isFiscal: true,
        sourceMode: 'history',
        transactionDate: '2024-01-25T15:00:00Z',
        type: 'BUY',
        rawType: 'Buy',
        label: 'Buy 10 MSFT @ 395.00',
        rawLabel: 'Achat 10 MSFT Trade Republic',
        amountPrimary: '-3950.00',
        assetSymbol: 'MSFT',
        assetIsin: 'US5949181045',
        priceUnit: '395.00',
        quantity: '10.00',
        feeAmount: '1.00',
        createdAt: '2024-01-25T15:00:00Z',
        updatedAt: '2024-01-25T15:00:00Z',
        version: 1
    },
    {
        id: 'utx-action-5',
        ownerId: 'default-user',
        accountId: 'acc-traderepublic',
        instrumentId: 'instr-aapl',
        batchId: 'batch-actions',
        rowHash: 'hash-action-5',
        sourceOrigin: 'FILE',
        isSynthetic: false,
        isFiscal: true,
        sourceMode: 'history',
        transactionDate: '2024-01-28T17:30:00Z',
        type: 'SELL',
        rawType: 'Sell',
        label: 'Sell 10 AAPL @ 175.00',
        rawLabel: 'Vente 10 AAPL Trade Republic',
        amountPrimary: '1750.00',
        assetSymbol: 'AAPL',
        assetIsin: 'US0378331005',
        priceUnit: '175.00',
        quantity: '10.00',
        feeAmount: '1.00',
        createdAt: '2024-01-28T17:30:00Z',
        updatedAt: '2024-01-28T17:30:00Z',
        version: 1
    },

    // --- Batch 3: ETFs Import (3 txs) ---
    {
        id: 'utx-etf-1',
        ownerId: 'default-user',
        accountId: 'acc-traderepublic',
        instrumentId: 'instr-vt',
        batchId: 'batch-etfs',
        rowHash: 'hash-etf-1',
        sourceOrigin: 'FILE',
        isSynthetic: false,
        isFiscal: true,
        sourceMode: 'history',
        transactionDate: '2024-02-10T10:00:00Z',
        type: 'BUY',
        rawType: 'Buy',
        label: 'Buy 50 VT @ 90.00',
        rawLabel: 'Vanguard Total World Stock ETF Buy',
        amountPrimary: '-4500.00',
        assetSymbol: 'VT',
        assetIsin: 'US9229087690',
        priceUnit: '90.00',
        quantity: '50.00',
        feeAmount: '2.50',
        createdAt: '2024-02-10T10:00:00Z',
        updatedAt: '2024-02-10T10:00:00Z',
        version: 1
    },
    {
        id: 'utx-etf-2',
        ownerId: 'default-user',
        accountId: 'acc-bourso-pea',
        instrumentId: 'instr-cw8',
        batchId: 'batch-etfs',
        rowHash: 'hash-etf-2',
        sourceOrigin: 'FILE',
        isSynthetic: false,
        isFiscal: true,
        sourceMode: 'history',
        transactionDate: '2024-02-15T11:30:00Z',
        type: 'BUY',
        rawType: 'Buy',
        label: 'Buy 30 CW8 @ 420.00',
        rawLabel: 'Achat Amundi MSCI World CW8 PEA',
        amountPrimary: '-12600.00',
        assetSymbol: 'CW8',
        assetIsin: 'LU1681043599',
        priceUnit: '420.00',
        quantity: '30.00',
        feeAmount: '0.00',
        createdAt: '2024-02-15T11:30:00Z',
        updatedAt: '2024-02-15T11:30:00Z',
        version: 1
    },
    {
        id: 'utx-etf-3',
        ownerId: 'default-user',
        accountId: 'acc-traderepublic',
        instrumentId: 'instr-vt',
        batchId: 'batch-etfs',
        rowHash: 'hash-etf-3',
        sourceOrigin: 'FILE',
        isSynthetic: false,
        isFiscal: true,
        sourceMode: 'history',
        transactionDate: '2024-02-20T14:00:00Z',
        type: 'BUY',
        rawType: 'Buy',
        label: 'Buy 20 VT @ 95.00',
        rawLabel: 'Vanguard Total World Stock ETF DCA',
        amountPrimary: '-1900.00',
        assetSymbol: 'VT',
        assetIsin: 'US9229087690',
        priceUnit: '95.00',
        quantity: '20.00',
        feeAmount: '1.00',
        createdAt: '2024-02-20T14:00:00Z',
        updatedAt: '2024-02-20T14:00:00Z',
        version: 1
    },

    // --- Batch 4: Crypto Spot Import (3 txs) ---
    {
        id: 'utx-crypto-1',
        ownerId: 'default-user',
        accountId: 'acc-binance-spot',
        instrumentId: 'instr-btc',
        batchId: 'batch-crypto',
        rowHash: 'hash-crypto-1',
        sourceOrigin: 'FILE',
        isSynthetic: false,
        isFiscal: true,
        sourceMode: 'history',
        transactionDate: '2024-03-01T16:00:00Z',
        type: 'BUY',
        rawType: 'Buy',
        label: 'Buy 0.5 BTC @ 45000.00',
        rawLabel: 'BTC/USDT Spot Purchase',
        amountPrimary: '-22500.00',
        assetSymbol: 'BTC',
        priceUnit: '45000.00',
        quantity: '0.50',
        feeAmount: '22.50',
        createdAt: '2024-03-01T16:00:00Z',
        updatedAt: '2024-03-01T16:00:00Z',
        version: 1
    },
    {
        id: 'utx-crypto-2',
        ownerId: 'default-user',
        accountId: 'acc-binance-spot',
        instrumentId: 'instr-eth',
        batchId: 'batch-crypto',
        rowHash: 'hash-crypto-2',
        sourceOrigin: 'FILE',
        isSynthetic: false,
        isFiscal: true,
        sourceMode: 'history',
        transactionDate: '2024-03-01T16:30:00Z',
        type: 'BUY',
        rawType: 'Buy',
        label: 'Buy 3.5 ETH @ 2800.00',
        rawLabel: 'ETH/USDT Spot Purchase',
        amountPrimary: '-9800.00',
        assetSymbol: 'ETH',
        priceUnit: '2800.00',
        quantity: '3.50',
        feeAmount: '9.80',
        createdAt: '2024-03-01T16:30:00Z',
        updatedAt: '2024-03-01T16:30:00Z',
        version: 1
    },
    {
        id: 'utx-crypto-3',
        ownerId: 'default-user',
        accountId: 'acc-binance-spot',
        instrumentId: 'instr-btc',
        batchId: 'batch-crypto',
        rowHash: 'hash-crypto-3',
        sourceOrigin: 'FILE',
        isSynthetic: false,
        isFiscal: true,
        sourceMode: 'history',
        transactionDate: '2024-03-05T12:00:00Z',
        type: 'BUY',
        rawType: 'Buy',
        label: 'Buy 0.1 BTC @ 48000.00',
        rawLabel: 'BTC/USDT Spot Purchase 2',
        amountPrimary: '-4800.00',
        assetSymbol: 'BTC',
        priceUnit: '48000.00',
        quantity: '0.10',
        feeAmount: '4.80',
        createdAt: '2024-03-05T12:00:00Z',
        updatedAt: '2024-03-05T12:00:00Z',
        version: 1
    },

    // --- Batch 5: Crypto DCA & Staking Import (3 txs) ---
    {
        id: 'utx-crypto-4',
        ownerId: 'default-user',
        accountId: 'acc-binance-earn',
        instrumentId: 'instr-btc',
        batchId: 'batch-crypto-dca',
        rowHash: 'hash-crypto-4',
        sourceOrigin: 'FILE',
        isSynthetic: false,
        isFiscal: true,
        sourceMode: 'history',
        transactionDate: '2024-03-15T18:20:00Z',
        type: 'BUY',
        rawType: 'Buy',
        label: 'Buy 0.25 BTC @ 58000.00',
        rawLabel: 'Bitget DCA BTC Order',
        amountPrimary: '-14500.00',
        assetSymbol: 'BTC',
        priceUnit: '58000.00',
        quantity: '0.25',
        feeAmount: '14.50',
        createdAt: '2024-03-15T18:20:00Z',
        updatedAt: '2024-03-15T18:20:00Z',
        version: 1
    },
    {
        id: 'utx-crypto-5',
        ownerId: 'default-user',
        accountId: 'acc-binance-earn',
        instrumentId: 'instr-eth',
        batchId: 'batch-crypto-dca',
        rowHash: 'hash-crypto-5',
        sourceOrigin: 'FILE',
        isSynthetic: false,
        isFiscal: true,
        sourceMode: 'history',
        transactionDate: '2024-03-15T18:45:00Z',
        type: 'BUY',
        rawType: 'Buy',
        label: 'Buy 2.0 ETH @ 3200.00',
        rawLabel: 'Bitget DCA ETH Order',
        amountPrimary: '-6400.00',
        assetSymbol: 'ETH',
        priceUnit: '3200.00',
        quantity: '2.00',
        feeAmount: '6.40',
        createdAt: '2024-03-15T18:45:00Z',
        updatedAt: '2024-03-15T18:45:00Z',
        version: 1
    },
    {
        id: 'utx-crypto-6',
        ownerId: 'default-user',
        accountId: 'acc-binance-earn',
        instrumentId: 'instr-eth',
        batchId: 'batch-crypto-dca',
        rowHash: 'hash-crypto-6',
        sourceOrigin: 'FILE',
        isSynthetic: false,
        isFiscal: true,
        sourceMode: 'history',
        transactionDate: '2024-03-20T08:00:00Z',
        type: 'DEPOSIT',
        rawType: 'Staking',
        label: 'Staking Reward 0.05 ETH',
        rawLabel: 'Bitget ETH Staking Reward',
        amountPrimary: '160.00',
        assetSymbol: 'ETH',
        priceUnit: '3200.00',
        quantity: '0.05',
        feeAmount: '0.00',
        createdAt: '2024-03-20T08:00:00Z',
        updatedAt: '2024-03-20T08:00:00Z',
        version: 1
    }
];

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
