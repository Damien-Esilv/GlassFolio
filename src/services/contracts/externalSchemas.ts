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
