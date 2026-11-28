/**
 * Budgets and end-of-month forecast of the cash flow (Epic E52 — TGLA-256, TGLA-257).
 */
import { db, delay } from '../db';
import { currencyService } from '../currencyService';
import type { BudgetStatus, CashflowBudget, CashflowForecast } from '../../types/cashflow';
import { getBuiltinCashflowCategory } from '../../constants/cashflowCategories';
import { cashflowService, type CashflowResult } from './cashflowService';
import { budgetMonthBounds, currentBudgetMonth, shiftBudgetMonth } from './period';
import { budgetStatuses, forecastPoints, shiftIsoDay } from './planning';
import { includedAccountIds } from './operations';
import { buildLedger, overdraftRule } from '../portfolio/positionLedger';
import { computeTaxItems, type TaxItem } from './taxItems';
import { calculateTMI, getHouseholdCreditRules } from '../fiscal/taxRules';
import type { FiscalProfile } from '../../types/types.backend';
import { VALID_FIAT_CURRENCIES } from '../../types/types.backend';

/** Months whose day-to-day spending sets the daily average of the forecast. */
const VARIABLE_MONTHS = 3;
/** A recurring payment the bank already announces within this many days is not counted twice. */
const SAME_PAYMENT_DAYS = 3;

const ownerId = (): string => db.getAccounts()[0]?.ownerId ?? 'default-user';
const daysBetween = (start: string, end: string): number => Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000);

export const cashflowPlanningService = {
    /** Monthly caps, by category. */
    listBudgets: async (): Promise<CashflowBudget[]> => {
        await delay(60);
        return db.getCashflowBudgets();
    },

    /** Sets the monthly cap of a top-level expense category, or removes it (null or 0). */
    setBudget: async (categoryId: string, monthlyLimit: number | null): Promise<CashflowResult> => {
        await delay(80);
        const category = getBuiltinCashflowCategory(categoryId);
        if (!category || category.kind !== 'expense' || category.parentId) return { success: false, error: 'not_expense_category' };
        const others = db.getCashflowBudgets().filter(budget => budget.categoryId !== categoryId);
        if (monthlyLimit === null || monthlyLimit === 0) {
            db.saveCashflowBudgets(others);
            return { success: true, value: undefined };
        }
        if (!Number.isFinite(monthlyLimit) || monthlyLimit < 0 || monthlyLimit > 1_000_000) return { success: false, error: 'invalid_amount' };
        const now = new Date().toISOString();
        const existing = db.getCashflowBudgets().find(budget => budget.categoryId === categoryId);
        db.saveCashflowBudgets([...others, {
            id: existing?.id ?? `cfb-${categoryId}`,
            ownerId: ownerId(),
            categoryId,
            monthlyLimit: Math.round(monthlyLimit * 100) / 100,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        }]);
        return { success: true, value: undefined };
    },

    /** Each budget against the spending of a budget month (the current one by default). */
    getBudgetStatus: async (query: { month?: string; currency?: string; accountIds?: string[] } = {}): Promise<{ month: string; statuses: BudgetStatus[] }> => {
        const settings = db.getCashflowSettings();
        const month = query.month ?? currentBudgetMonth(new Date(), settings.monthStartDay);
        const summary = await cashflowService.getSummary({ preset: 'month', month, currency: query.currency ?? 'EUR', accountIds: query.accountIds });
        return { month, statuses: budgetStatuses(db.getCashflowBudgets(), summary.categories) };
    },

    /**
     * The balance of the counted accounts at the end of the budget month: today's balance, plus what the banks
     * announce as coming, plus the recurring payments and income expected (not announced yet), minus the daily
     * average of day-to-day spending over the last 3 months for each day left.
     */
    getForecast: async (query: { currency?: string; accountIds?: string[] } = {}): Promise<CashflowForecast> => {
        const currency = (query.currency ?? 'EUR').toUpperCase();
        const settings = db.getCashflowSettings();
        const month = currentBudgetMonth(new Date(), settings.monthStartDay);
        const { start, end } = budgetMonthBounds(month, settings.monthStartDay);
        const today = new Date().toISOString().slice(0, 10);
        const counted = includedAccountIds(db.getAccounts(), settings);
        const accounts = new Set((query.accountIds?.length ? query.accountIds : [...counted]).filter(id => counted.has(id)));

        // Today's balance: the currency lines of the counted accounts replayed from the journal (overdraft included),
        // in the base currency. The journal, not the positions cache, which may lag behind an import.
        const allowsOverdraft = overdraftRule(db.getAccounts());
        const rows = db.getUnifiedTransactions().filter(tx => accounts.has(tx.accountId) && allowsOverdraft(tx));
        const cash = [...buildLedger(rows, { allowsOverdraft }).values()]
            .map(entry => ({ quantity: entry.state.quantity, currency: (entry.lastTx.assetSymbol ?? currency).toUpperCase() }));
        const currencies = [...new Set([currency, ...cash.map(line => line.currency)])];
        let rates: Record<string, number> = {};
        try {
            rates = await currencyService.getExchangeRates(currencies, currency);
        } catch {
            rates = {};
        }
        const toBase = (amount: number, from: string): number => amount * (from.toUpperCase() === currency ? 1 : rates[from.toUpperCase()] ?? 1);
        const balanceToday = Math.round(cash.reduce((sum, line) => sum + toBase(line.quantity, line.currency), 0) * 100) / 100;

        const [operations, summary, recurring] = await Promise.all([
            cashflowService.listOperations({ start, end: shiftIsoDay(today, 1), currency, accountIds: [...accounts] }),
            cashflowService.getSummary({ preset: 'month', month, currency, accountIds: [...accounts] }),
            cashflowService.listRecurring({ currency, month, accountIds: [...accounts] }),
        ]);

        const upcoming = db.getCashflowUpcoming()
            .filter(item => accounts.has(item.accountId) && item.date.slice(0, 10) > today && item.date.slice(0, 10) < end)
            .map(item => ({ date: item.date.slice(0, 10), amount: toBase(Number(item.amount), item.currency), label: item.label }));
        const expectedRecurring = recurring.items
            .filter(item => item.status !== 'ignored')
            .flatMap(item => item.payments.filter(payment => payment.expected && payment.date > today))
            .filter(payment => !upcoming.some(item => Math.abs(item.amount - payment.amount) <= Math.max(1, Math.abs(payment.amount) * 0.05)
                && Math.abs(daysBetween(item.date, payment.date)) <= SAME_PAYMENT_DAYS));

        const previous = summary.months.filter(m => m.month < month).slice(-VARIABLE_MONTHS);
        const variableDays = previous.reduce((sum, m) => {
            const bounds = budgetMonthBounds(m.month, settings.monthStartDay);
            return sum + daysBetween(bounds.start, bounds.end);
        }, 0);
        const variablePerDay = variableDays > 0 ? previous.reduce((sum, m) => sum + m.variableExpenses, 0) / variableDays : 0;
        const daysLeft = Math.max(0, daysBetween(today, shiftIsoDay(end, -1)));

        const points = forecastPoints({
            start,
            today,
            end,
            balanceToday,
            pastOperations: operations.map(op => ({ date: op.date, amount: op.amount })),
            expected: [...upcoming, ...expectedRecurring],
            variablePerDay,
        });
        const projected = points.filter(point => point.projected);
        const upcomingTotal = upcoming.reduce((sum, item) => sum + item.amount, 0);
        const recurringTotal = expectedRecurring.reduce((sum, payment) => sum + payment.amount, 0);
        const round = (value: number): number => Math.round(value * 100) / 100;
        return {
            month,
            today,
            monthEnd: shiftIsoDay(end, -1),
            balanceToday,
            projectedEnd: projected.length > 0 ? projected[projected.length - 1].balance : balanceToday,
            lowestProjected: projected.reduce((low, point) => Math.min(low, point.balance), balanceToday),
            upcomingTotal: round(upcomingTotal),
            recurringTotal: round(recurringTotal),
            variableTotal: round(-variablePerDay * daysLeft),
            variablePerDay: round(variablePerDay),
            points,
        };
    },

    /**
     * Reductions and credits spotted in the cash flow of an income year (TGLA-259): donations, home help, childcare,
     * PER contributions, with the estimated benefit under that year's rates and caps. Null for a year without rules.
     */
    getTaxItems: async (year: string, profile: FiscalProfile = {}, currency: string = 'EUR'): Promise<{ year: string; items: TaxItem[]; marginalRate?: number } | null> => {
        const rules = getHouseholdCreditRules(year);
        if (!rules) return null;
        const next = String(Number(year) + 1);
        const operations = await cashflowService.listOperations({ start: `${year}-01-01`, end: `${next}-01-01`, currency });
        const perAccounts = new Set(db.getAccounts().filter(account => account.wrapperType === 'PER').map(account => account.id));
        const fiat = new Set<string>(VALID_FIAT_CURRENCIES as readonly string[]);
        const perContributions = db.getUnifiedTransactions()
            .filter(tx => perAccounts.has(tx.accountId) && tx.type === 'DEPOSIT' && !tx.isSynthetic
                && tx.transactionDate.slice(0, 4) === year && fiat.has((tx.assetSymbol ?? '').toUpperCase()))
            .map(tx => ({ id: tx.id, amount: Math.abs(Number(tx.amountPrimary) || 0) }))
            .filter(item => item.amount > 0);
        const income = profile.otherTaxableIncome;
        let marginalRate: number | undefined;
        if (typeof profile.estimatedTMI === 'number' && profile.estimatedTMI > 0) {
            marginalRate = profile.estimatedTMI > 1 ? profile.estimatedTMI / 100 : profile.estimatedTMI;
        } else if (typeof income === 'number' && income > 0) {
            try {
                marginalRate = calculateTMI(income / Math.max(1, profile.fiscalShares ?? 1), year);
            } catch {
                marginalRate = undefined;
            }
        }
        const items = computeTaxItems({
            rules,
            operations: operations.filter(op => !op.excluded).map(op => ({ id: op.id, date: op.date, amount: op.amount, categoryId: op.categoryId, rawLabel: op.rawLabel })),
            perContributions,
            marginalRate,
            taxableIncome: typeof income === 'number' && income > 0 ? income : undefined,
        });
        return { year, items, marginalRate };
    },

    /** The budget month after or before (for the budgets history). */
    shiftMonth: shiftBudgetMonth,
};
