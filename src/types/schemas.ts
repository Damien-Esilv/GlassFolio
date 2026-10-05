import { z } from 'zod';

/**
 * GlassFolio Runtime Validation Schemas (Zod)
 * Validates untrusted data from LocalStorage, CSV imports, or network payloads.
 */

export const TransactionSchema = z.object({
  id: z.string().min(1),
  date: z.string().min(4),
  type: z.enum(['Buy', 'Sell', 'Deposit', 'Withdrawal']),
  instrument: z.string().default(''),
  symbol: z.string().default(''),
  amount: z.number().finite(),
  price: z.number().finite(),
  total: z.number().finite(),
  currency: z.string().default('EUR'),
  source: z.string().default('Manual'),
  fees: z.number().finite().default(0),
  status: z.enum(['Completed', 'Pending']).default('Completed'),
  assetClass: z.string().optional(),
  bankName: z.string().optional(),
  accountName: z.string().optional(),
});

export type ValidatedTransaction = z.infer<typeof TransactionSchema>;

export const FinancialGoalSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  targetAmount: z.number().positive(),
  isPinned: z.boolean().default(false),
  iconType: z.enum(['home', 'plane', 'car', 'emergency', 'other']).default('other'),
  color: z.string().default('blue'),
  method: z.enum(['manual', 'dynamic']).default('manual'),
  manualAmount: z.number().finite().optional(),
  linkedAssets: z.array(z.object({
    type: z.enum(['asset', 'class', 'group']),
    id: z.string(),
    name: z.string(),
    percentage: z.number().min(0).max(100),
  })).optional(),
  currentAmount: z.number().finite().optional(),
});

export type ValidatedFinancialGoal = z.infer<typeof FinancialGoalSchema>;

export const PositionSchema = z.object({
  id: z.string().min(1),
  instrument: z.string(),
  symbol: z.string(),
  isin: z.string().optional(),
  exchange: z.string().optional(),
  quantity: z.number().finite(),
  avgCost: z.number().finite(),
  lastPrice: z.number().finite(),
  marketValue: z.number().finite(),
  unrealizedPL: z.number().finite(),
  unrealizedPLPercent: z.number().finite(),
  currency: z.string().default('EUR'),
  type: z.string(),
  source: z.string().optional(),
  bankName: z.string().optional(),
  accountName: z.string().optional(),
});

export type ValidatedPosition = z.infer<typeof PositionSchema>;

export const AssetGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  symbols: z.array(z.string()).default([]),
  color: z.string().default('blue'),
});

export type ValidatedAssetGroup = z.infer<typeof AssetGroupSchema>;

export const CSVRowSchema = z.record(z.string(), z.string().nullable().optional());

/**
 * Safe parsing helpers with graceful fallback
 */
export function safeParseTransaction(data: unknown) {
  return TransactionSchema.safeParse(data);
}

export function safeParseGoal(data: unknown) {
  return FinancialGoalSchema.safeParse(data);
}

export function safeParsePosition(data: unknown) {
  return PositionSchema.safeParse(data);
}

export function safeParseAssetGroup(data: unknown) {
  return AssetGroupSchema.safeParse(data);
}

/**
 * Data Sanitizers / Self-Healing Helpers
 */
export function repairTransaction(raw: unknown): ValidatedTransaction | null {
  const parsed = safeParseTransaction(raw);
  if (parsed.success) return parsed.data;

  if (typeof raw !== 'object' || raw === null) return null;
  const item = raw as Record<string, unknown>;

  const id = typeof item.id === 'string' && item.id.length > 0 ? item.id : `tx-repaired-${Date.now()}`;
  const date = typeof item.date === 'string' && item.date.length > 0 ? item.date : new Date().toISOString();
  
  let type: 'Buy' | 'Sell' | 'Deposit' | 'Withdrawal' = 'Buy';
  if (item.type === 'Sell' || item.type === 'Deposit' || item.type === 'Withdrawal') {
    type = item.type;
  }

  const amount = typeof item.amount === 'number' && Number.isFinite(item.amount) ? item.amount : 0;
  const price = typeof item.price === 'number' && Number.isFinite(item.price) ? item.price : 0;
  const total = typeof item.total === 'number' && Number.isFinite(item.total) ? item.total : amount * price;

  const repaired = {
    id,
    date,
    type,
    instrument: typeof item.instrument === 'string' ? item.instrument : '',
    symbol: typeof item.symbol === 'string' ? item.symbol : '',
    amount,
    price,
    total,
    currency: typeof item.currency === 'string' && item.currency ? item.currency : 'EUR',
    source: typeof item.source === 'string' && item.source ? item.source : 'Manual',
    fees: typeof item.fees === 'number' && Number.isFinite(item.fees) ? item.fees : 0,
    status: item.status === 'Pending' ? ('Pending' as const) : ('Completed' as const),
    assetClass: typeof item.assetClass === 'string' ? item.assetClass : undefined,
    bankName: typeof item.bankName === 'string' ? item.bankName : undefined,
    accountName: typeof item.accountName === 'string' ? item.accountName : undefined,
  };

  const finalCheck = safeParseTransaction(repaired);
  return finalCheck.success ? finalCheck.data : null;
}

export function repairPosition(raw: unknown): ValidatedPosition | null {
  const parsed = safeParsePosition(raw);
  if (parsed.success) return parsed.data;

  if (typeof raw !== 'object' || raw === null) return null;
  const item = raw as Record<string, unknown>;

  const id = typeof item.id === 'string' && item.id.length > 0 ? item.id : `pos-repaired-${Date.now()}`;
  const quantity = typeof item.quantity === 'number' && Number.isFinite(item.quantity) ? item.quantity : 0;
  const avgCost = typeof item.avgCost === 'number' && Number.isFinite(item.avgCost) ? item.avgCost : 0;
  const lastPrice = typeof item.lastPrice === 'number' && Number.isFinite(item.lastPrice) ? item.lastPrice : avgCost;
  const marketValue = typeof item.marketValue === 'number' && Number.isFinite(item.marketValue) ? item.marketValue : quantity * lastPrice;
  const unrealizedPL = typeof item.unrealizedPL === 'number' && Number.isFinite(item.unrealizedPL) ? item.unrealizedPL : marketValue - (quantity * avgCost);
  const costBasis = quantity * avgCost;
  const unrealizedPLPercent = typeof item.unrealizedPLPercent === 'number' && Number.isFinite(item.unrealizedPLPercent) 
    ? item.unrealizedPLPercent 
    : (costBasis > 0 ? (unrealizedPL / costBasis) * 100 : 0);

  const repaired = {
    id,
    instrument: typeof item.instrument === 'string' ? item.instrument : 'Unknown Asset',
    symbol: typeof item.symbol === 'string' ? item.symbol : 'UNKNOWN',
    isin: typeof item.isin === 'string' ? item.isin : undefined,
    exchange: typeof item.exchange === 'string' ? item.exchange : undefined,
    quantity,
    avgCost,
    lastPrice,
    marketValue,
    unrealizedPL,
    unrealizedPLPercent,
    currency: typeof item.currency === 'string' && item.currency ? item.currency : 'EUR',
    type: typeof item.type === 'string' && item.type ? item.type : 'Equity',
    source: typeof item.source === 'string' ? item.source : undefined,
    bankName: typeof item.bankName === 'string' ? item.bankName : undefined,
    accountName: typeof item.accountName === 'string' ? item.accountName : undefined,
  };

  const finalCheck = safeParsePosition(repaired);
  return finalCheck.success ? finalCheck.data : null;
}

export function repairGoal(raw: unknown): ValidatedFinancialGoal | null {
  const parsed = safeParseGoal(raw);
  if (parsed.success) return parsed.data;

  if (typeof raw !== 'object' || raw === null) return null;
  const item = raw as Record<string, unknown>;

  const id = typeof item.id === 'string' && item.id.length > 0 ? item.id : `goal-repaired-${Date.now()}`;
  const title = typeof item.title === 'string' && item.title.trim().length > 0 ? item.title.trim() : 'Unnamed Goal';
  const targetAmount = typeof item.targetAmount === 'number' && Number.isFinite(item.targetAmount) && item.targetAmount > 0 ? item.targetAmount : 1000;

  const validIconTypes = ['home', 'plane', 'car', 'emergency', 'other'];
  const iconType = typeof item.iconType === 'string' && validIconTypes.includes(item.iconType) 
    ? (item.iconType as 'home' | 'plane' | 'car' | 'emergency' | 'other') 
    : 'other';

  const method = item.method === 'dynamic' ? ('dynamic' as const) : ('manual' as const);

  const repaired = {
    id,
    title,
    targetAmount,
    isPinned: Boolean(item.isPinned),
    iconType,
    color: typeof item.color === 'string' ? item.color : 'blue',
    method,
    manualAmount: typeof item.manualAmount === 'number' && Number.isFinite(item.manualAmount) ? item.manualAmount : undefined,
    linkedAssets: Array.isArray(item.linkedAssets) ? item.linkedAssets.filter((a: any) => a && typeof a.id === 'string') : undefined,
    currentAmount: typeof item.currentAmount === 'number' && Number.isFinite(item.currentAmount) ? item.currentAmount : undefined,
  };

  const finalCheck = safeParseGoal(repaired);
  return finalCheck.success ? finalCheck.data : null;
}

export function validateCSVRow(rowObj: Record<string, unknown>): { isValid: boolean; sanitized: Record<string, string>; errors?: string[] } {
  const parsed = CSVRowSchema.safeParse(rowObj);
  if (!parsed.success) {
    return {
      isValid: false,
      sanitized: {},
      errors: parsed.error.issues.map(i => i.message),
    };
  }

  const sanitized: Record<string, string> = {};
  for (const [key, val] of Object.entries(parsed.data)) {
    sanitized[key] = val === null || val === undefined ? '' : String(val).trim();
  }

  return {
    isValid: true,
    sanitized,
  };
}
