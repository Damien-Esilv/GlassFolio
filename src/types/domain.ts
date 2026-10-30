import { AssetClass } from '../constants/assetClasses';
import { FiscalProfile } from './types.backend';

export type NotificationCategory = 'portfolio' | 'fiscal' | 'goals' | 'security' | 'system';

export interface NotificationCategoryPreferences {
  masterEnabled: boolean;
  inAppToasts: boolean;
  categories: {
    portfolio: boolean;
    fiscal: boolean;
    goals: boolean;
    security: boolean;
    system: boolean;
  };
  dormantCashThresholdPercent: number;
  volatilityThresholdPercent: number;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'night' | 'emerald' | 'cyber' | 'system';
  currency: string;
  notifications: boolean;
  notificationPreferences?: NotificationCategoryPreferences;
  language?: 'en' | 'fr';
  dateFormat?: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
  fiscalProfile?: FiscalProfile;
  pinnedBadgeIds?: string[];
  /** Portfolio curve source: real historical closes, or the interpolated estimate */
  chartPriceMode?: ChartPriceMode;
}

export type ChartPriceMode = 'historical' | 'simulated';

export type AuthProviderType = 'local' | 'email' | 'google' | 'demo';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  authProvider?: AuthProviderType;
  emailVerified?: boolean;
  pendingEmail?: string;
  preferences?: UserPreferences;
  xp: number;
  level: number;
}

export interface Position {
  id: string;
  ownerId?: string;
  /** Id of the Instrument this position was built from (absent on positions cached before it existed). */
  instrumentId?: string;
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
  category?: NotificationCategory;
  title: string;
  message: string;
  date: string;
  read?: boolean;
  archived?: boolean;
  actionUrl?: string;
  actionLabelKey?: string;
  dedupKey?: string;
}

export type AlertRuleMetric =
  | 'price_above'
  | 'price_below'
  | 'pl_percent_above'
  | 'pl_percent_below'
  | 'cash_ratio_above';

export interface AlertRule {
  id: string;
  ownerId?: string;
  name: string;
  metric: AlertRuleMetric;
  symbol?: string;
  threshold: number;
  enabled: boolean;
  createdAt: string;
  lastTriggeredAt?: string;
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
  claimed?: boolean;
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
  chartData: { name: string; value: number; invested?: number }[];
}

/** Gain or loss of one sale, in the base currency */
export interface RealizedPLEntry {
  date: string;
  symbol: string;
  assetType: Position['type'];
  value: number;
}

export interface RealizedPLSummary {
  total: number;
  byMonth: { month: string; value: number }[];
  entries: RealizedPLEntry[];
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
