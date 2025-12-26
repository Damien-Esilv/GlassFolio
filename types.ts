import React from 'react';

export interface UserPreferences {
  theme: 'light' | 'dark' | 'night' | 'system';
  currency: string;
  notifications: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  preferences?: UserPreferences;
  xp: number;
  level: number;
}

export interface Position {
  id: string;
  instrument: string;
  symbol: string;
  quantity: number;
  avgCost: number;
  lastPrice: number;
  marketValue: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  currency: string;
  type: 'Equity' | 'ETF' | 'Crypto' | 'Cash';
  source?: string;
  // New Cash Fields
  bankName?: string;
  accountName?: string; // e.g. "Livret A", "Compte Courant"
}

export interface Transaction {
  id: string;
  date: string;
  type: 'Buy' | 'Sell' | 'Deposit' | 'Withdrawal';
  instrument: string;
  symbol: string;
  amount: number;
  price: number;
  total: number;
  currency: string;
  source: string;
  fees: number;
  status: 'Completed' | 'Pending';
  assetClass?: 'Equity' | 'ETF' | 'Crypto' | 'Cash';
  bankName?: string;
  accountName?: string;
}

export interface Alert {
  id: string;
  type: 'warning' | 'error' | 'success' | 'info';
  title: string;
  message: string;
  date: string;
}

export interface ReportCard {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  color: string;
}

// --- GOAL TYPES ---

export interface LinkedAsset {
  type: 'asset' | 'class' | 'group';
  id: string; // Symbol for asset, Class name for class, Group ID for group
  name: string; // Display name
  percentage: number; // 0 to 100
}

export interface AssetGroup {
  id: string;
  name: string;
  symbols: string[];
  color: string;
}

export interface FinancialGoal {
  id: string;
  title: string;
  targetAmount: number;
  isPinned: boolean;
  iconType: 'home' | 'plane' | 'car' | 'emergency' | 'other';
  color: string;

  method: 'manual' | 'dynamic';
  manualAmount?: number;
  linkedAssets?: LinkedAsset[]; // Now supports specific assets, classes, or groups

  currentAmount?: number;
}

// --- ACHIEVEMENT TYPES ---

export interface AchievementLevel {
  level: number;
  targetValue: number;
  description: string; // e.g. "Complete 10 transactions"
  xpReward: number;
}

export interface Achievement {
  id: string;
  title: string;
  iconType: 'trophy' | 'wallet' | 'chart' | 'star' | 'rocket' | 'diamond';
  color: string; // tailwind color name like 'blue', 'emerald'

  conditionType: 'total_value' | 'transaction_count' | 'asset_count' | 'streak';
  levels: AchievementLevel[];

  // State
  currentLevel: number; // 0 if not started
  currentValue?: number;
  unlocked: boolean; // True if level > 0
}

// --- SERVICE TYPES ---

export interface DashboardSummary {
  totalValue: number;
  totalCost: number;
  totalPL: number;
  plPercent: number;
  chartData: { name: string; value: number }[];
}

export interface TransactionFilter {
  searchQuery?: string;
  dateRange?: string; // 'All', 'Last 30 Days', 'Last 90 Days', 'YTD'
  assetClass?: string; // 'All', 'Equities', 'ETFs', 'Crypto'
  side?: string; // 'All', 'Buy', 'Sell', 'Deposit', 'Withdrawal'
  source?: string;
  currency?: string;
  status?: string;
}

export interface PositionFilter {
  type?: string; // 'All', 'Equities', 'ETFs', 'Crypto', 'Cash'
  searchQuery?: string;
  source?: string;
  currency?: string;
}