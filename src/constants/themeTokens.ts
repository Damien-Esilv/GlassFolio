/**
 * Design Tokens & Semantic Theming Architecture — GlassFolio
 * 
 * Source of Truth for Intent-based colors, Status, and Multi-series Charting.
 * Strictly adheres to AI_CODING_STANDARDS.md Section 1.1:
 * Zero hardcoded visual values (Hex/RGB/HSL or raw Tailwind palette classes).
 */

export interface TrendTokenSet {
  text: string;
  bg: string;
  bgSubtle: string;
  border: string;
  cssVar: string;
}

export interface ChartSeriesTokenSet {
  id: string;
  cssVar: string;
  text: string;
  bg: string;
  bgSubtle: string;
  border: string;
}

export interface ThemeColorPalette {
  readonly primary: string;
  readonly primaryHover: string;
  readonly brand: string;
  readonly brandStatic: string;
  readonly positive: string;
  readonly positiveSubtle: string;
  readonly negative: string;
  readonly negativeSubtle: string;
  readonly warning: string;
  readonly warningSubtle: string;
  readonly info: string;
  readonly accentGreen: string;
  readonly accentRed: string;
  readonly accentAmber: string;
  readonly accentBlue: string;
  readonly accentIndigo: string;
  readonly accentPurple: string;
  readonly accentRose: string;
  readonly accentCyan: string;
  readonly accentOrange: string;
}

/**
 * Single Source of Truth (SSOT) for GlassFolio Theme Palettes.
 * Typed strictly with `as const` to guarantee contract enforcement across React, Recharts and index.html CSS.
 * GlassFolio authentic brand logo blue is #137fec (hover #0f6fd1).
 */
export const THEME_PALETTES = {
  light: {
    primary: '#137fec',
    primaryHover: '#0f6fd1',
    brand: '#137fec',
    brandStatic: '#137fec',
    positive: '#10b981',
    positiveSubtle: 'rgba(16, 185, 129, 0.1)',
    negative: '#ef4444',
    negativeSubtle: 'rgba(239, 68, 68, 0.1)',
    warning: '#f59e0b',
    warningSubtle: 'rgba(245, 158, 11, 0.1)',
    info: '#137fec',
    accentGreen: '#10b981',
    accentRed: '#ef4444',
    accentAmber: '#f59e0b',
    accentBlue: '#137fec',
    accentIndigo: '#6366f1',
    accentPurple: '#8b5cf6',
    accentRose: '#f43f5e',
    accentCyan: '#06b6d4',
    accentOrange: '#f97316',
  },
  dark: {
    primary: '#137fec',
    primaryHover: '#0f6fd1',
    brand: '#137fec',
    brandStatic: '#137fec',
    positive: '#10b981',
    positiveSubtle: 'rgba(16, 185, 129, 0.15)',
    negative: '#ef4444',
    negativeSubtle: 'rgba(239, 68, 68, 0.15)',
    warning: '#f59e0b',
    warningSubtle: 'rgba(245, 158, 11, 0.15)',
    info: '#137fec',
    accentGreen: '#10b981',
    accentRed: '#ef4444',
    accentAmber: '#f59e0b',
    accentBlue: '#137fec',
    accentIndigo: '#6366f1',
    accentPurple: '#8b5cf6',
    accentRose: '#f43f5e',
    accentCyan: '#06b6d4',
    accentOrange: '#f97316',
  },
  night: {
    primary: '#137fec',
    primaryHover: '#0f6fd1',
    brand: '#137fec',
    brandStatic: '#137fec',
    positive: '#10b981',
    positiveSubtle: 'rgba(16, 185, 129, 0.15)',
    negative: '#f43f5e',
    negativeSubtle: 'rgba(244, 63, 94, 0.15)',
    warning: '#fbbf24',
    warningSubtle: 'rgba(251, 191, 36, 0.15)',
    info: '#137fec',
    accentGreen: '#10b981',
    accentRed: '#f43f5e',
    accentAmber: '#fbbf24',
    accentBlue: '#137fec',
    accentIndigo: '#818cf8',
    accentPurple: '#a78bfa',
    accentRose: '#fb7185',
    accentCyan: '#22d3ee',
    accentOrange: '#fb923c',
  },
} as const;

/**
 * 1. Business Intent Tokens
 * Represents financial meaning (gains vs losses, warnings, neutral).
 * Modify --color-positive in index.html to cascade a new trend color across all screens.
 */
export const THEME_INTENT = {
  positive: {
    text: 'text-positive',
    bg: 'bg-positive',
    bgSubtle: 'bg-positive-subtle',
    border: 'border-positive',
    cssVar: 'var(--color-positive)',
  },
  negative: {
    text: 'text-negative',
    bg: 'bg-negative',
    bgSubtle: 'bg-negative-subtle',
    border: 'border-negative',
    cssVar: 'var(--color-negative)',
  },
  warning: {
    text: 'text-warning',
    bg: 'bg-warning',
    bgSubtle: 'bg-warning-subtle',
    border: 'border-warning',
    cssVar: 'var(--color-warning)',
  },
  neutral: {
    text: 'text-secondary',
    bg: 'bg-subtle',
    bgSubtle: 'bg-subtle',
    border: 'border-subtle',
    cssVar: 'var(--text-secondary)',
  },
  brand: {
    text: 'text-brand',
    bg: 'bg-primary',
    bgSubtle: 'bg-primary/10',
    border: 'border-brand',
    cssVar: 'var(--color-primary)',
  },
} as const;

/**
 * Helper returning the appropriate TrendTokenSet based on numeric financial value.
 * @param value P&L amount, return percentage, delta
 */
export function getTrendTokens(value: number): TrendTokenSet {
  if (value > 0) return THEME_INTENT.positive;
  if (value < 0) return THEME_INTENT.negative;
  return THEME_INTENT.neutral;
}

/**
 * 2. Categorical & Multi-Series Chart Palette (8 slots)
 * Used for Side-by-Side Asset/ETF comparisons (e.g. CW8 vs WPEA vs SWDA vs VWCE).
 * Order is specifically tuned to maximize visual contrast between adjacent series.
 */
export const CHART_SERIES_PALETTE: readonly ChartSeriesTokenSet[] = [
  {
    id: 'series-1',
    cssVar: 'var(--color-accent-blue)',
    text: 'text-accent-blue',
    bg: 'bg-accent-blue',
    bgSubtle: 'bg-accent-blue/10',
    border: 'border-accent-blue',
  },
  {
    id: 'series-2',
    cssVar: 'var(--color-accent-amber)',
    text: 'text-accent-amber',
    bg: 'bg-accent-amber',
    bgSubtle: 'bg-accent-amber/10',
    border: 'border-accent-amber',
  },
  {
    id: 'series-3',
    cssVar: 'var(--color-accent-indigo)',
    text: 'text-accent-indigo',
    bg: 'bg-accent-indigo',
    bgSubtle: 'bg-accent-indigo/10',
    border: 'border-accent-indigo',
  },
  {
    id: 'series-4',
    cssVar: 'var(--color-accent-rose)',
    text: 'text-accent-rose',
    bg: 'bg-accent-rose',
    bgSubtle: 'bg-accent-rose/10',
    border: 'border-accent-rose',
  },
  {
    id: 'series-5',
    cssVar: 'var(--color-accent-cyan)',
    text: 'text-accent-cyan',
    bg: 'bg-accent-cyan',
    bgSubtle: 'bg-accent-cyan/10',
    border: 'border-accent-cyan',
  },
  {
    id: 'series-6',
    cssVar: 'var(--color-accent-purple)',
    text: 'text-accent-purple',
    bg: 'bg-accent-purple',
    bgSubtle: 'bg-accent-purple/10',
    border: 'border-accent-purple',
  },
  {
    id: 'series-7',
    cssVar: 'var(--color-accent-orange)',
    text: 'text-accent-orange',
    bg: 'bg-accent-orange',
    bgSubtle: 'bg-accent-orange/10',
    border: 'border-accent-orange',
  },
  {
    id: 'series-8',
    cssVar: 'var(--color-accent-green)',
    text: 'text-accent-green',
    bg: 'bg-accent-green',
    bgSubtle: 'bg-accent-green/10',
    border: 'border-accent-green',
  },
] as const;

/**
 * Returns a stable series token set by index (0 to N with modulo wrap).
 */
export function getComparisonSeriesTokens(index: number): ChartSeriesTokenSet {
  const safeIndex = Math.abs(index) % CHART_SERIES_PALETTE.length;
  return CHART_SERIES_PALETTE[safeIndex];
}

/**
 * Returns a deterministic, consistent color token set for an asset ticker symbol.
 * Example: CW8 will always receive the exact same color slot across all charts & tables.
 */
export function getAssetStableColor(symbol: string): ChartSeriesTokenSet {
  if (!symbol) return CHART_SERIES_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = (hash << 5) - hash + symbol.charCodeAt(i);
  }
  const index = Math.abs(hash) % CHART_SERIES_PALETTE.length;
  return CHART_SERIES_PALETTE[index];
}
