import { AssetClass } from '../constants/assetClasses';
import { FiscalProfile } from './types.backend';

export interface UserPreferences {
  theme: 'light' | 'dark' | 'night' | 'system';
  currency: string;
  notifications: boolean;
  language?: 'en' | 'fr';
  dateFormat?: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
  fiscalProfile?: FiscalProfile;
  pinnedBadgeIds?: string[];
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
  ownerId?: string;
  instrument: string;
  symbol: string;
  isin?: string;
  exchange?: string;
  quantity: number;
  avgCost: number;
  lastPrice: number;
  marketValue: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  currency: string;
  type: AssetClass | 'Cash' | string;
  source?: string;
  bankName?: string;
  accountName?: string;
}

export interface Transaction {
  id: string;
  ownerId?: string;
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
  assetClass?: AssetClass | string;
  bankName?: string;
  accountName?: string;
}

export interface Alert {
  id: string;
  ownerId?: string;
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

export interface LinkedAsset {
  type: 'asset' | 'class' | 'group';
  id: string;
  name: string;
  percentage: number;
}

export interface AssetGroup {
  id: string;
  ownerId?: string;
  name: string;
  symbols: string[];
  color: string;
}

export interface FinancialGoal {
  id: string;
  ownerId?: string;
  title: string;
  targetAmount: number;
  isPinned: boolean;
  iconType: 'home' | 'plane' | 'car' | 'emergency' | 'other';
  color: string;
  method: 'manual' | 'dynamic';
  manualAmount?: number;
  linkedAssets?: LinkedAsset[];
  currentAmount?: number;
}

export interface AchievementLevel {
  level: number;
  targetValue: number;
  description: string;
  xpReward: number;
}

export interface Achievement {
  id: string;
  ownerId?: string;
  title: string;
  iconType: 'trophy' | 'wallet' | 'chart' | 'star' | 'rocket' | 'diamond' | 'shield' | 'flame' | 'calendar' | 'zap';
  color: string;
  conditionType: 'total_value' | 'transaction_count' | 'asset_count' | 'streak' | 'dca_streak' | 'emergency_fund' | 'goal_completed' | 'hodl_duration';
  levels: AchievementLevel[];
  currentLevel: number;
  currentValue?: number;
  unlocked: boolean;
  category?: 'discipline' | 'wealth' | 'explorer' | 'mastery';
  badgeKey?: string;
}

export interface InvestorRank {
  rankId: string;
  levelMin: number;
  levelMax: number;
  titleKey: string;
  descriptionKey: string;
  color: string;
}

export interface GamificationQuest {
  id: string;
  titleKey: string;
  descriptionKey: string;
  rewardXp: number;
  frequency: 'monthly' | 'quarterly' | 'onboarding';
  completed: boolean;
  progress: number;
  target: number;
  expiryDate?: string;
}

export interface ThemeReward {
  id: string;
  themeKey: string;
  nameKey: string;
  requiredLevel: number;
  unlocked: boolean;
  previewColors: string[];
}

export interface DashboardSummary {
  totalValue: number;
  totalCost: number;
  totalPL: number;
  plPercent: number;
  chartData: { name: string; value: number }[];
}

export interface TransactionFilter {
  searchQuery?: string;
  dateRange?: string;
  assetClass?: string;
  side?: string;
  source?: string;
  currency?: string;
  status?: string;
}

export interface PositionFilter {
  type?: string; 
  searchQuery?: string;
  source?: string;
  currency?: string;
}
