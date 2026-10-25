/**
 * Date Formatting Utility for GlassFolio
 * 
 * Provides consistent date formatting based on user preferences (DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD)
 * and unambiguous formatting for chart axis labels in the active i18n locale.
 */

export type DateFormatPattern = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';

/**
 * Format a Date object or ISO string according to user preference pattern.
 */
export const formatDate = (
    dateInput: Date | string | number,
    pattern: DateFormatPattern = 'DD/MM/YYYY'
): string => {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';

    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();

    switch (pattern) {
        case 'MM/DD/YYYY':
            return `${month}/${day}/${year}`;
        case 'YYYY-MM-DD':
            return `${year}-${month}-${day}`;
        case 'DD/MM/YYYY':
        default:
            return `${day}/${month}/${year}`;
    }
};

/**
 * Format chart axis labels cleanly and unambiguously, respecting active locale AND user's dateFormat pattern order.
 */
export const formatChartDate = (
    date: Date,
    labelFormat: 'hour' | 'day' | 'month',
    pattern: DateFormatPattern = 'DD/MM/YYYY',
    locale: string = 'fr-FR'
): string => {
    if (isNaN(date.getTime())) return '';

    if (labelFormat === 'hour') {
        return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    }

    if (labelFormat === 'month') {
        // ALWAYS use 4-digit numeric year (e.g., "août 2026" / "Aug 2026")
        return date.toLocaleDateString(locale, { month: 'short', year: 'numeric' });
    }

    // For daily labels (e.g. 1W, 1M views)
    const day = date.getDate();
    const monthShort = date.toLocaleDateString(locale, { month: 'short' });

    if (pattern === 'MM/DD/YYYY') {
        // American order: Month Day (e.g., "Jul 23" / "juil. 23")
        return `${monthShort} ${day}`;
    } else if (pattern === 'YYYY-MM-DD') {
        const monthNum = String(date.getMonth() + 1).padStart(2, '0');
        const dayNum = String(date.getDate()).padStart(2, '0');
        return `${monthNum}-${dayNum}`;
    } else {
        // European order: Day Month (e.g., "23 Jul" / "23 juil.")
        return `${day} ${monthShort}`;
    }
};

/**
 * Generate rolling 12-month short labels ending at current date.
 */
export const getRolling12MonthsLabels = (
    now: Date = new Date(),
    locale: string = 'fr-FR'
): string[] => {
    const result: string[] = [];
    for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        result.push(d.toLocaleDateString(locale, { month: 'short', year: 'numeric' }));
    }
    return result;
};

/**
 * Calculate the ISO 8601 week number for a given date.
 */
export const getISOWeekNumber = (dateInput: Date = new Date()): number => {
    const d = new Date(Date.UTC(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

/**
 * Returns Monday 00:00:00 of the current week in local time.
 */
export const getStartOfCurrentWeek = (now: Date = new Date()): Date => {
    const d = new Date(now);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
};
