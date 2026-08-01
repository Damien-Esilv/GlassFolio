import { Position, Transaction, Alert, ReportCard, FinancialGoal, Achievement, AssetGroup } from './types';

export const positions: Position[] = [
  {
    id: '1',
    instrument: 'TechCorp',
    symbol: 'AAPL',
    quantity: 100,
    avgCost: 150.00,
    lastPrice: 175.50,
    marketValue: 17550.00,
    unrealizedPL: 2550.00,
    unrealizedPLPercent: 17.00,
    currency: 'USD',
    type: 'Equity',
    source: 'Brokerage A'
  },
  {
    id: '2',
    instrument: 'Vanguard Total World',
    symbol: 'VT',
    quantity: 50,
    avgCost: 90.00,
    lastPrice: 105.20,
    marketValue: 5260.00,
    unrealizedPL: 760.00,
    unrealizedPLPercent: 16.8,
    currency: 'USD',
    type: 'ETF',
    source: 'Brokerage A'
  },
  {
    id: '3',
    instrument: 'Bitcoin',
    symbol: 'BTC',
    quantity: 0.5,
    avgCost: 45000.00,
    lastPrice: 62000.00,
    marketValue: 31000.00,
    unrealizedPL: 8500.00,
    unrealizedPLPercent: 37.7,
    currency: 'USD',
    type: 'Crypto',
    source: 'Binance'
  },
  {
    id: '4',
    instrument: 'Microsoft Corporation',
    symbol: 'MSFT',
    quantity: 20,
    avgCost: 380.00,
    lastPrice: 415.00,
    marketValue: 8300.00,
    unrealizedPL: 700.00,
    unrealizedPLPercent: 9.21,
    currency: 'USD',
    type: 'Equity',
    source: 'Trade Republic'
  },
  {
    id: '5',
    instrument: 'Amundi MSCI World UCITS ETF',
    symbol: 'CW8',
    quantity: 30,
    avgCost: 420.00,
    lastPrice: 460.00,
    marketValue: 13800.00,
    unrealizedPL: 1200.00,
    unrealizedPLPercent: 9.52,
    currency: 'EUR',
    type: 'ETF',
    source: 'Boursobank',
    bankName: 'Boursobank',
    accountName: 'PEA'
  },
  {
    id: '6',
    instrument: 'Ethereum',
    symbol: 'ETH',
    quantity: 3.5,
    avgCost: 2800.00,
    lastPrice: 3400.00,
    marketValue: 11900.00,
    unrealizedPL: 2100.00,
    unrealizedPLPercent: 21.43,
    currency: 'USD',
    type: 'Crypto',
    source: 'Binance'
  },
  {
    id: '7',
    instrument: 'Euro Cash',
    symbol: 'EUR',
    quantity: 15000,
    avgCost: 1.00,
    lastPrice: 1.00,
    marketValue: 16500.00,
    unrealizedPL: 0.00,
    unrealizedPLPercent: 0.00,
    currency: 'EUR',
    type: 'Cash',
    source: 'Boursobank',
    bankName: 'Boursobank',
    accountName: 'PEA'
  },
  {
    id: '5',
    instrument: 'USD Savings',
    symbol: 'USD',
    quantity: 10000,
    avgCost: 1.00,
    lastPrice: 1.00,
    marketValue: 10000.00,
    unrealizedPL: 0.00,
    unrealizedPLPercent: 0.00,
    currency: 'USD',
    type: 'Cash',
    source: 'Chase',
    bankName: 'Chase',
    accountName: 'Savings Account'
  }
];

export const assetGroups: AssetGroup[] = [
  {
    id: 'grp1',
    name: 'Tech Giants',
    symbols: ['AAPL', 'NVDA', 'MSFT', 'GOOGL'],
    color: 'blue'
  },
  {
    id: 'grp2',
    name: 'Safe Haven',
    symbols: ['USD', 'EUR', 'XAU'],
    color: 'emerald'
  }
];

export const transactions: Transaction[] = [
  {
    id: 't1',
    date: '2022-01-15 08:00:00',
    type: 'Deposit',
    instrument: 'Euro Deposit',
    symbol: 'EUR',
    amount: 15000,
    price: 1.00,
    total: 15000.00,
    currency: 'EUR',
    source: 'Boursobank',
    fees: 0.00,
    status: 'Completed',
    assetClass: 'Cash',
    bankName: 'Boursobank',
    accountName: 'PEA'
  },
  {
    id: 't2',
    date: '2022-06-10 14:30:00',
    type: 'Buy',
    instrument: 'Apple Inc.',
    symbol: 'AAPL',
    amount: 100,
    price: 150.00,
    total: 15000.00,
    currency: 'USD',
    source: 'Trade Republic',
    fees: 1.00,
    status: 'Completed',
    assetClass: 'Equity'
  },
  {
    id: 't3',
    date: '2023-01-18 16:00:00',
    type: 'Buy',
    instrument: 'Microsoft Corporation',
    symbol: 'MSFT',
    amount: 20,
    price: 380.00,
    total: 7600.00,
    currency: 'USD',
    source: 'Trade Republic',
    fees: 1.00,
    status: 'Completed',
    assetClass: 'Equity'
  },
  {
    id: 't4',
    date: '2023-08-10 10:00:00',
    type: 'Buy',
    instrument: 'Vanguard Total World ETF',
    symbol: 'VT',
    amount: 50,
    price: 90.00,
    total: 4500.00,
    currency: 'USD',
    source: 'Trade Republic',
    fees: 2.50,
    status: 'Completed',
    assetClass: 'ETF'
  },
  {
    id: 't5',
    date: '2024-02-15 11:30:00',
    type: 'Buy',
    instrument: 'Amundi MSCI World UCITS ETF',
    symbol: 'CW8',
    amount: 30,
    price: 420.00,
    total: 12600.00,
    currency: 'EUR',
    source: 'Boursobank',
    fees: 0.00,
    status: 'Completed',
    assetClass: 'ETF'
  },
  {
    id: 't6',
    date: '2024-11-01 16:00:00',
    type: 'Buy',
    instrument: 'Bitcoin',
    symbol: 'BTC',
    amount: 0.5,
    price: 45000.00,
    total: 22500.00,
    currency: 'USD',
    source: 'Binance',
    fees: 22.50,
    status: 'Completed',
    assetClass: 'Crypto'
  },
  {
    id: 't7',
    date: '2025-05-12 16:30:00',
    type: 'Buy',
    instrument: 'Ethereum',
    symbol: 'ETH',
    amount: 3.5,
    price: 2800.00,
    total: 9800.00,
    currency: 'USD',
    source: 'Binance',
    fees: 9.80,
    status: 'Completed',
    assetClass: 'Crypto'
  }
];

export const alerts: Alert[] = [
  {
    id: 'a1',
    type: 'warning',
    title: 'Mapping Issues',
    message: 'Review and resolve mapping issues for 3 imported transactions.',
    date: 'Today'
  },
  {
    id: 'a2',
    type: 'success',
    title: 'Dividend Received',
    message: 'You received $45.20 in dividends from AAPL.',
    date: 'Yesterday'
  }
];

export const reports: ReportCard[] = [
  {
    id: 'r1',
    title: 'Portfolio Performance',
    description: 'Track your overall portfolio performance over time.',
    color: 'bg-gradient-to-br from-blue-600 to-cyan-500'
  },
  {
    id: 'r2',
    title: 'Realized vs. Unrealized P/L',
    description: 'Compare your realized profits and losses vs holdings.',
    color: 'bg-gradient-to-br from-emerald-600 to-teal-500'
  },
  {
    id: 'r3',
    title: 'Fees Analysis',
    description: "Analyze the fees you've paid for transactions.",
    color: 'bg-gradient-to-br from-amber-500 to-orange-600'
  },
  {
    id: 'r4',
    title: 'Tax Report',
    description: "Estimated capital gains tax for the current fiscal year.",
    color: 'bg-gradient-to-br from-purple-600 to-indigo-500'
  }
];

export const financialGoals: FinancialGoal[] = [
  {
    id: 'g1',
    title: 'Save for Down Payment',
    targetAmount: 100000,
    method: 'dynamic',
    linkedAssets: [
        { type: 'class', id: 'Cash', name: 'All Cash', percentage: 100 },
        { type: 'asset', id: 'AAPL', name: 'TechCorp', percentage: 50 }
    ],
    isPinned: true,
    iconType: 'home',
    color: 'blue'
  },
  {
    id: 'g3',
    title: 'Emergency Fund',
    targetAmount: 20000,
    method: 'dynamic',
    linkedAssets: [
        { type: 'class', id: 'Crypto', name: 'All Crypto', percentage: 20 }
    ],
    isPinned: true,
    iconType: 'emergency',
    color: 'emerald'
  }
];

export const achievements: Achievement[] = [
  {
    id: 'ac1',
    title: 'Executioner',
    iconType: 'rocket',
    color: 'indigo',
    conditionType: 'transaction_count',
    currentLevel: 1,
    unlocked: true,
    levels: [
      { level: 1, targetValue: 1, description: 'Complete your first transaction', xpReward: 100 },
      { level: 2, targetValue: 10, description: 'Complete 10 transactions', xpReward: 500 },
      { level: 3, targetValue: 50, description: 'Complete 50 transactions', xpReward: 1000 },
      { level: 4, targetValue: 100, description: 'Complete 100 transactions', xpReward: 2500 },
      { level: 5, targetValue: 500, description: 'Complete 500 transactions', xpReward: 5000 }
    ]
  },
  {
    id: 'ac2',
    title: 'High Roller',
    iconType: 'diamond',
    color: 'blue',
    conditionType: 'total_value',
    currentLevel: 0,
    unlocked: false,
    levels: [
      { level: 1, targetValue: 10000, description: 'Reach $10k Portfolio Value', xpReward: 200 },
      { level: 2, targetValue: 50000, description: 'Reach $50k Portfolio Value', xpReward: 500 },
      { level: 3, targetValue: 100000, description: 'Reach $100k Portfolio Value', xpReward: 1000 },
      { level: 4, targetValue: 500000, description: 'Reach $500k Portfolio Value', xpReward: 3000 },
      { level: 5, targetValue: 1000000, description: 'Reach $1M Portfolio Value', xpReward: 10000 }
    ]
  },
  {
    id: 'ac3',
    title: 'Diversified',
    iconType: 'chart',
    color: 'emerald',
    conditionType: 'asset_count',
    currentLevel: 1,
    unlocked: true,
    levels: [
      { level: 1, targetValue: 2, description: 'Hold 2 different assets', xpReward: 150 },
      { level: 2, targetValue: 5, description: 'Hold 5 different assets', xpReward: 300 },
      { level: 3, targetValue: 10, description: 'Hold 10 different assets', xpReward: 600 },
      { level: 4, targetValue: 20, description: 'Hold 20 different assets', xpReward: 1200 },
      { level: 5, targetValue: 50, description: 'Hold 50 different assets', xpReward: 3000 }
    ]
  }
];

export const dashboardChartData = [
  { name: 'Jan', value: 80000 },
  { name: 'Feb', value: 82000 },
  { name: 'Mar', value: 79000 },
  { name: 'Apr', value: 85000 },
  { name: 'May', value: 89000 },
  { name: 'Jun', value: 92000 },
  { name: 'Jul', value: 95000 },
  { name: 'Aug', value: 94000 },
  { name: 'Sep', value: 98000 },
  { name: 'Oct', value: 102000 },
  { name: 'Nov', value: 105000 },
  { name: 'Dec', value: 112000 },
];