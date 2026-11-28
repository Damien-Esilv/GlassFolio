/**
 * Sections of the cash flow page (Epic E52), in tab order: one page, one sidebar entry, a tab per section.
 * Titles live under `cashflow:pages.<key>`.
 */
import { ChartNoAxesColumn, ChartPie, LayoutDashboard, ListOrdered, Repeat, Target, Waypoints, type LucideIcon } from 'lucide-react';

export type CashflowPageKey = 'overview' | 'flows' | 'categories' | 'distribution' | 'recurring' | 'budgets' | 'operations';

export interface CashflowPage {
    key: CashflowPageKey;
    path: string;
    icon: LucideIcon;
    /** The period carousel of the page: any period, or months only (the recurring calendar). */
    periods: 'any' | 'month';
}

export const CASHFLOW_PAGES: readonly CashflowPage[] = [
    { key: 'overview', path: '/cashflow', icon: LayoutDashboard, periods: 'any' },
    { key: 'flows', path: '/cashflow/flows', icon: Waypoints, periods: 'any' },
    { key: 'categories', path: '/cashflow/categories', icon: ChartPie, periods: 'any' },
    { key: 'distribution', path: '/cashflow/distribution', icon: ChartNoAxesColumn, periods: 'any' },
    { key: 'recurring', path: '/cashflow/recurring', icon: Repeat, periods: 'month' },
    { key: 'budgets', path: '/cashflow/budgets', icon: Target, periods: 'month' },
    { key: 'operations', path: '/cashflow/operations', icon: ListOrdered, periods: 'any' },
];

/** The section of a path (the overview for /cashflow itself). */
export const cashflowPageOf = (pathname: string): CashflowPage =>
    CASHFLOW_PAGES.find(page => page.key !== 'overview' && (pathname === page.path || pathname.startsWith(`${page.path}/`))) ?? CASHFLOW_PAGES[0];
