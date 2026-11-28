import { z } from 'zod';

/**
 * Runtime Zod Contracts for External APIs, Local Caches & AI Tool Boundaries.
 *
 * Ensures untrusted JSON from Yahoo Finance (`/yf/*`), CoinGecko, Supabase PostgREST,
 * browser price caches, and LLM/MCP tool parameters fail closed instead of polluting
 * portfolio state with `NaN`, `Infinity`, stringified numbers, or malformed rows.
 */

export const ValidIsoTimestampSchema = z
  .string()
  .min(4)
  .refine((val) => !Number.isNaN(Date.parse(val)), {
    message: 'Invalid ISO timestamp',
  });

export const PriceCacheSchema = z.object({
  data: z.record(z.string(), z.number().finite().positive()),
  currencies: z.record(z.string(), z.string().min(1)).optional(),
  /** Last price ever fetched per ticker, kept past expiry for when a source fails (TGLA-235). */
  lastKnown: z.record(z.string(), z.number().finite().positive()).optional(),
  /** Price a provider gave with a holding (a bank's last quote, TGLA-242), by ISIN or symbol: used when the market source fails. */
  providerQuotes: z.record(z.string(), z.object({
    price: z.number().finite().positive(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    at: ValidIsoTimestampSchema,
  })).optional(),
  fetchedAt: ValidIsoTimestampSchema,
});

export const YahooChartMetaSchema = z.object({
  symbol: z.string().optional(),
  regularMarketPrice: z.number().finite().positive().optional().nullable(),
  chartPreviousClose: z.number().finite().positive().optional().nullable(),
  currency: z.string().min(1).optional().nullable(),
});

export const YahooChartResponseSchema = z.object({
  chart: z
    .object({
      result: z
        .array(
          z.object({
            meta: YahooChartMetaSchema.optional().nullable(),
            timestamp: z.array(z.number().finite()).optional().nullable(),
            indicators: z
              .object({
                quote: z
                  .array(
                    z.object({
                      close: z.array(z.number().finite().nullable()).optional().nullable(),
                    })
                  )
                  .optional()
                  .nullable(),
              })
              .optional()
              .nullable(),
          })
        )
        .optional()
        .nullable(),
      error: z
        .object({
          code: z.string().optional(),
          description: z.string().optional(),
        })
        .optional()
        .nullable(),
    })
    .optional()
    .nullable(),
});

export const YahooSearchQuoteSchema = z.object({
  symbol: z.string().min(1).optional(),
  shortname: z.string().optional(),
  longname: z.string().optional(),
  exchDisp: z.string().optional(),
  exchange: z.string().optional(),
  quoteType: z.string().optional(),
  typeDisp: z.string().optional(),
});

export const YahooSearchResponseSchema = z.object({
  quotes: z.array(YahooSearchQuoteSchema).optional().nullable(),
});

export const CoinGeckoSimplePriceSchema = z.record(
  z.string(),
  z.object({
    usd: z.number().finite().positive().optional(),
    eur: z.number().finite().positive().optional(),
  })
);

export const CoinGeckoSearchItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  symbol: z.string().min(1),
  market_cap_rank: z.number().finite().nullable().optional(),
});

export const CoinGeckoSearchResponseSchema = z.object({
  coins: z.array(CoinGeckoSearchItemSchema).optional().nullable(),
});

export const SupabaseVaultHeaderRowSchema = z.object({
  user_id: z.string().min(1).optional().default(''),
  header_json: z.record(z.string(), z.unknown()).refine(
    (obj) => typeof obj === 'object' && obj !== null && !Array.isArray(obj),
    { message: 'header_json must be a non-null object' }
  ),
  totp_enabled: z.boolean().optional().default(false),
  created_at: z.string().optional().default(''),
  updated_at: z.string().optional().default(''),
});

export const SupabaseVaultHeaderRowsSchema = z.array(SupabaseVaultHeaderRowSchema);

export const SupabaseVaultRecordRowSchema = z.object({
  user_id: z.string().optional().default(''),
  record_key: z.string().min(1),
  ciphertext: z.string().min(1),
  created_at: z.string().optional().default(''),
  updated_at: z.string().optional().default(''),
});

export const SupabaseVaultRecordRowsSchema = z.array(SupabaseVaultRecordRowSchema);

export const CreateGoalArgsSchema = z.object({
  title: z.string().trim().min(1, 'Goal title is required'),
  targetAmount: z.number().finite().positive('Target amount must be a finite positive number'),
  deadline: z
    .string()
    .refine((val) => !val || !Number.isNaN(Date.parse(val)), {
      message: 'Deadline must be a valid date string',
    })
    .optional(),
});

/** OpenFIGI `/v3/mapping` answer: one entry per job, with listings or a warning (TGLA-221). */
export const OpenFigiListingSchema = z.object({
  ticker: z.string().min(1).optional().nullable(),
  exchCode: z.string().optional().nullable(),
  securityType: z.string().optional().nullable(),
  marketSector: z.string().optional().nullable(),
});

export const OpenFigiMappingResponseSchema = z.array(
  z.object({
    data: z.array(OpenFigiListingSchema).optional(),
    warning: z.string().optional(),
    error: z.string().optional(),
  })
);

/** Blockstream Esplora `/api/address/:address` (TGLA-221): confirmed totals in satoshis. */
export const EsploraAddressSchema = z.object({
  chain_stats: z.object({
    funded_txo_sum: z.number().int().nonnegative(),
    spent_txo_sum: z.number().int().nonnegative(),
    tx_count: z.number().int().nonnegative().optional().default(0),
  }),
});

// ---------------------------------------------------------------------------
// Cash flow tools (Epic E52 — TGLA-252)
// ---------------------------------------------------------------------------

const isoDate = z.string().refine(val => !Number.isNaN(Date.parse(val)), { message: 'Must be a valid date (YYYY-MM-DD)' });

export const SetTransactionCategoryArgsSchema = z.object({
  transactionIds: z.array(z.string().trim().min(1)).min(1, 'At least one operation id is required').max(500),
  categoryId: z.string().trim().min(1, 'Category id is required'),
  createRule: z.boolean().optional(),
});

export const CreateCashflowCategoryArgsSchema = z.object({
  parentId: z.string().trim().min(1, 'Parent category is required'),
  name: z.string().trim().min(1, 'Name is required').max(40),
});

export const CreateCategorizationRuleArgsSchema = z.object({
  labelContains: z.string().trim().min(2, 'The text to match needs at least 2 characters').max(60),
  categoryId: z.string().trim().min(1, 'Category id is required'),
  direction: z.enum(['in', 'out', 'any']).optional(),
  accountId: z.string().trim().min(1).optional(),
  minAmount: z.number().finite().nonnegative().optional(),
  maxAmount: z.number().finite().nonnegative().optional(),
});

export const RecordCashOperationArgsSchema = z.object({
  accountId: z.string().trim().min(1, 'Account id is required'),
  date: isoDate,
  amount: z.number().finite().refine(val => val !== 0, { message: 'Amount must not be zero' }),
  label: z.string().trim().min(1, 'Label is required').max(140),
  categoryId: z.string().trim().min(1).optional(),
  note: z.string().trim().max(500).optional(),
});
