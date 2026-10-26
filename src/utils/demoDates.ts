/**
 * Demo Dates Generator Utility
 * 
 * Generates realistic relative dates for Demo Mode based on the current execution timestamp (Date.now()).
 * Ensures that Demo portfolio data always appears fresh, active, and chronologically consistent,
 * eliminating the "abandoned portfolio for 3 years" effect.
 */

/**
 * Returns a guaranteed valid ISO 8601 UTC string located `days` days in the past from `baseDate`.
 * If hours / minutes are specified, they are applied in UTC.
 */
export function daysAgoISO(
    days: number,
    hours: number = 10,
    minutes: number = 0,
    baseDate: Date = new Date()
): string {
    const d = new Date(baseDate.getTime());
    d.setUTCDate(d.getUTCDate() - Math.max(0, days));
    d.setUTCHours(hours, minutes, 0, 0);
    // Guarantee that if days === 0 or calculation lands in future, clamp to 1 minute before baseDate
    if (d.getTime() >= baseDate.getTime()) {
        return new Date(baseDate.getTime() - 60_000).toISOString();
    }
    return d.toISOString();
}

/**
 * Returns a guaranteed valid ISO 8601 UTC string located `months` months in the past from `baseDate`.
 * Supports an optional `dayOffset` (day of month, or negative offset from target month's end).
 */
export function monthsAgoISO(
    months: number,
    dayOfMonth: number = 15,
    hours: number = 10,
    minutes: number = 0,
    baseDate: Date = new Date()
): string {
    const year = baseDate.getUTCFullYear();
    const month = baseDate.getUTCMonth(); // 0-indexed
    
    // Compute target year and month
    const targetTotalMonths = year * 12 + month - Math.max(0, months);
    const targetYear = Math.floor(targetTotalMonths / 12);
    const targetMonth = ((targetTotalMonths % 12) + 12) % 12;

    // Get max days in target month
    const maxDays = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
    const clampedDay = Math.min(Math.max(1, dayOfMonth), maxDays);

    const d = new Date(Date.UTC(targetYear, targetMonth, clampedDay, hours, minutes, 0, 0));
    if (d.getTime() >= baseDate.getTime()) {
        return new Date(baseDate.getTime() - 60_000).toISOString();
    }
    return d.toISOString();
}

/**
 * Returns a guaranteed valid ISO 8601 UTC string located `years` years in the past from `baseDate`.
 */
export function yearsAgoISO(
    years: number,
    monthOffset: number = 0,
    dayOfMonth: number = 15,
    hours: number = 10,
    minutes: number = 0,
    baseDate: Date = new Date()
): string {
    return monthsAgoISO(years * 12 + monthOffset, dayOfMonth, hours, minutes, baseDate);
}

/**
 * Converts an ISO 8601 timestamp (e.g. "2026-10-20T10:00:00.000Z") to legacy date string "YYYY-MM-DD HH:mm:ss".
 */
export function toLegacyDateTime(isoString: string): string {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const min = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

/**
 * Returns the current year as a 4-digit string.
 */
export function currentYearString(baseDate: Date = new Date()): string {
    return String(baseDate.getUTCFullYear());
}
