/**
 * Utility to format currency values based on currency code and user locale.
 */

// Mapping of common currencies to their symbols for manual formatting fallback
export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CAD: 'C$',
  AUD: 'A$',
  CHF: 'CHF',
  CNY: '¥',
  HKD: 'HK$',
  SGD: 'S$',
};

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
