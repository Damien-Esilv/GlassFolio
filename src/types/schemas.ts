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
