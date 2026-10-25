/**
 * Tests — utils/date.ts
 * Covers: formatDate, formatChartDate, getRolling12MonthsLabels
 */

import { describe, it, expect } from 'vitest';
import { formatDate, formatChartDate, getRolling12MonthsLabels, getISOWeekNumber, getStartOfCurrentWeek } from '../../../utils/date';

// ══════════════════════════════════════════════════════════════════════════════
// formatDate
// ══════════════════════════════════════════════════════════════════════════════
describe('formatDate', () => {
  const iso = '2024-06-15T00:00:00Z';

  it('formats in DD/MM/YYYY (default pattern)', () => {
    expect(formatDate(iso, 'DD/MM/YYYY')).toBe('15/06/2024');
  });

  it('formats in MM/DD/YYYY', () => {
    expect(formatDate(iso, 'MM/DD/YYYY')).toBe('06/15/2024');
  });

  it('formats in YYYY-MM-DD', () => {
    expect(formatDate(iso, 'YYYY-MM-DD')).toBe('2024-06-15');
  });

  it('uses DD/MM/YYYY as default when no pattern provided', () => {
    expect(formatDate(iso)).toBe('15/06/2024');
  });

  it('accepts a Date object', () => {
    const d = new Date('2024-06-15T00:00:00Z');
    expect(formatDate(d, 'YYYY-MM-DD')).toBe('2024-06-15');
  });

  it('accepts a numeric timestamp', () => {
    const ts = new Date('2024-06-15T00:00:00Z').getTime();
    const result = formatDate(ts, 'YYYY-MM-DD');
    expect(result).toBe('2024-06-15');
  });

  it('returns empty string for invalid date', () => {
    expect(formatDate('not-a-date', 'DD/MM/YYYY')).toBe('');
  });

  it('pads single-digit day and month with zeros', () => {
    expect(formatDate('2024-01-05T00:00:00Z', 'DD/MM/YYYY')).toBe('05/01/2024');
  });

  it('handles year-boundary dates correctly', () => {
    expect(formatDate('2023-12-31T00:00:00Z', 'YYYY-MM-DD')).toBe('2023-12-31');
    expect(formatDate('2024-01-01T00:00:00Z', 'YYYY-MM-DD')).toBe('2024-01-01');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// formatChartDate
// ══════════════════════════════════════════════════════════════════════════════
describe('formatChartDate', () => {
  const d = new Date('2024-08-23T00:00:00Z');

  it('returns empty string for invalid date', () => {
    expect(formatChartDate(new Date('invalid'), 'day')).toBe('');
  });

  it('formats hour labels', () => {
    const result = formatChartDate(new Date('2024-08-23T14:30:00Z'), 'hour', 'DD/MM/YYYY', 'en-US');
    expect(result).toMatch(/\d{2}:\d{2}/);
  });

  it('formats month labels with 4-digit year', () => {
    const result = formatChartDate(d, 'month', 'DD/MM/YYYY', 'en-US');
    expect(result).toContain('2024');
  });

  it('formats day in European order (DD/MM/YYYY → Day Month)', () => {
    const result = formatChartDate(d, 'day', 'DD/MM/YYYY', 'en-US');
    // Should be "23 Aug" style
    expect(result).toContain('23');
  });

  it('formats day in US order (MM/DD/YYYY → Month Day)', () => {
    const result = formatChartDate(d, 'day', 'MM/DD/YYYY', 'en-US');
    // Should be "Aug 23" style
    expect(result).toContain('23');
  });

  it('formats day in ISO order (YYYY-MM-DD → MM-DD)', () => {
    const result = formatChartDate(d, 'day', 'YYYY-MM-DD', 'en-US');
    expect(result).toMatch(/\d{2}-\d{2}/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// getRolling12MonthsLabels
// ══════════════════════════════════════════════════════════════════════════════
describe('getRolling12MonthsLabels', () => {
  it('returns exactly 12 labels', () => {
    const labels = getRolling12MonthsLabels(new Date('2024-06-01'), 'en-US');
    expect(labels).toHaveLength(12);
  });

  it('last label corresponds to the reference month', () => {
    const now = new Date('2024-06-01');
    const labels = getRolling12MonthsLabels(now, 'en-US');
    // Last label should be June 2024
    expect(labels[11]).toContain('2024');
    expect(labels[11].toLowerCase()).toContain('jun');
  });

  it('first label is 11 months before the reference month', () => {
    const now = new Date('2024-06-01');
    const labels = getRolling12MonthsLabels(now, 'en-US');
    // 11 months before June 2024 = July 2023
    expect(labels[0]).toContain('2023');
  });

  it('labels are unique (no duplicates)', () => {
    const labels = getRolling12MonthsLabels(new Date('2024-06-01'), 'en-US');
    const unique = new Set(labels);
    expect(unique.size).toBe(12);
  });

  it('respects locale (fr-FR returns French month names)', () => {
    const labels = getRolling12MonthsLabels(new Date('2024-06-01'), 'fr-FR');
    // June in French is 'juin'
    expect(labels[11].toLowerCase()).toContain('juin');
  });

  it('uses current date by default without crashing', () => {
    const labels = getRolling12MonthsLabels();
    expect(labels).toHaveLength(12);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// getISOWeekNumber & getStartOfCurrentWeek
// ══════════════════════════════════════════════════════════════════════════════
describe('getISOWeekNumber', () => {
  it('calculates correct ISO week for given dates', () => {
    // 2026-10-25 is a Sunday in week 43
    expect(getISOWeekNumber(new Date(2026, 9, 25))).toBe(43);
    // 2026-01-01 is a Thursday in week 1
    expect(getISOWeekNumber(new Date(2026, 0, 1))).toBe(1);
    // 2024-06-15 is in week 24
    expect(getISOWeekNumber(new Date(2024, 5, 15))).toBe(24);
  });

  it('defaults to current date without error', () => {
    const week = getISOWeekNumber();
    expect(week).toBeGreaterThanOrEqual(1);
    expect(week).toBeLessThanOrEqual(53);
  });
});

describe('getStartOfCurrentWeek', () => {
  it('returns Monday of the given week', () => {
    // Sunday 2026-10-25 -> Monday 2026-10-19
    const monday = getStartOfCurrentWeek(new Date(2026, 9, 25));
    expect(monday.getDay()).toBe(1); // Monday
    expect(monday.getDate()).toBe(19);
    expect(monday.getHours()).toBe(0);
  });
});
