/**
 * Utility to format currency values based on currency code and user locale.
 */

export interface CurrencyConfig {
  code: string;
  symbol: string;
  label: string;
  defaultUsdRate: number; // Fallback rate relative to 1 USD (e.g. EUR = 0.92 means 1 USD = 0.92 EUR)
}

/**
 * Single source of truth for supported currencies in GlassFolio.
 * To add a new currency, simply add an entry to this array.
 */
export const SUPPORTED_CURRENCIES: CurrencyConfig[] = [
  { code: 'EUR', symbol: '€', label: 'EUR (€)', defaultUsdRate: 0.92 },
  { code: 'USD', symbol: '$', label: 'USD ($)', defaultUsdRate: 1.0 },
  { code: 'GBP', symbol: '£', label: 'GBP (£)', defaultUsdRate: 0.78 },
  { code: 'CHF', symbol: 'CHF', label: 'CHF (CHF)', defaultUsdRate: 0.88 },
  { code: 'CAD', symbol: 'C$', label: 'CAD (C$)', defaultUsdRate: 1.36 },
  { code: 'AUD', symbol: 'A$', label: 'AUD (A$)', defaultUsdRate: 1.52 },
  { code: 'JPY', symbol: '¥', label: 'JPY (¥)', defaultUsdRate: 155.0 },
  { code: 'CNY', symbol: '¥', label: 'CNY (¥)', defaultUsdRate: 7.23 },
  { code: 'HKD', symbol: 'HK$', label: 'HKD (HK$)', defaultUsdRate: 7.81 },
  { code: 'SGD', symbol: 'S$', label: 'SGD (S$)', defaultUsdRate: 1.35 },
];

/** Mapping of currencies to their symbols derived from SUPPORTED_CURRENCIES */
export const CURRENCY_SYMBOLS: Record<string, string> = SUPPORTED_CURRENCIES.reduce(
  (acc, curr) => {
    acc[curr.code] = curr.symbol;
    return acc;
  },
  {} as Record<string, string>
);

/**
 * Format a number as currency
 * @param value The numeric value to format
 * @param currency Code such as USD, EUR, etc.
 * @param locale Locale code such as 'en-US' or 'fr-FR'
 * @param options Intl.NumberFormatOptions override
 */
export function formatCurrency(
  value: number,
  currency: string = 'USD',
  locale: string = 'en-US',
  options: Intl.NumberFormatOptions = {}
): string {
  const upperCurrency = currency.toUpperCase();
  
  // For known ISO currencies, use standard Intl.NumberFormat
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: upperCurrency,
      ...options,
    }).format(value);
  } catch (e) {
    // Fallback if Intl doesn't support the code (e.g. some crypto symbols or custom currencies)
    const symbol = CURRENCY_SYMBOLS[upperCurrency] || upperCurrency;
    const formattedNum = value.toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      ...options,
    });
    return locale === 'fr-FR' 
      ? `${formattedNum} ${symbol}` 
      : `${symbol}${formattedNum}`;
  }
}
