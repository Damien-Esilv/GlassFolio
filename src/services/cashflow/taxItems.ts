/**
 * Tax reductions and credits spotted in the cash flow (Epic E52 — TGLA-259): donations, home help, childcare and PER
 * contributions of an income year, with the benefit they would bring under the year's rates and caps. An estimate:
 * the receipts and certificates decide, and the tax engine is never changed by it.
 */
import type { HouseholdCreditRules } from '../fiscal/taxRules';
import { normalizeText } from './text';

export type TaxItemKind = 'donations_aid' | 'donations' | 'home_services' | 'childcare' | 'per';

export interface TaxItem {
    kind: TaxItemKind;
    /** What was paid in the year (base currency, positive) */
    paid: number;
    /** What the rate applies to, after the caps */
    base: number;
    rate: number;
    /** Reduction or credit (or tax saved for the PER), estimated */
    estimate: number;
    cap?: number;
    operationIds: string[];
}

export interface TaxItemOperation {
    id: string;
    date: string;
    /** Signed, base currency */
    amount: number;
    categoryId: string;
    rawLabel: string;
}

/**
 * Organisations helping people in need, whose donations get the higher rate (the "Coluche" scheme). Their usual
 * names on a statement; others go to the general rate.
 */
const AID_ORGANISATIONS = [
    'RESTOS DU COEUR', 'RESTAURANTS DU COEUR', 'SECOURS POPULAIRE', 'SECOURS CATHOLIQUE', 'EMMAUS', 'FONDATION ABBE PIERRE',
    'FONDATION POUR LE LOGEMENT', 'BANQUE ALIMENTAIRE', 'BANQUES ALIMENTAIRES', 'ARMEE DU SALUT', 'CROIX ROUGE',
].map(normalizeText);

export const isAidOrganisation = (label: string): boolean => {
    const text = normalizeText(label);
    return AID_ORGANISATIONS.some(name => text.includes(name));
};

const round = (value: number): number => Math.round(value * 100) / 100;
const spent = (ops: readonly TaxItemOperation[]): number => round(ops.reduce((sum, op) => sum - op.amount, 0));

export interface TaxItemsInput {
    rules: HouseholdCreditRules;
    operations: readonly TaxItemOperation[];
    /** Money paid into PER accounts in the year (positive) */
    perContributions: ReadonlyArray<{ id: string; amount: number }>;
    /** Marginal rate, 0–1 (the PER saving); unknown: no PER estimate */
    marginalRate?: number;
    /** Taxable income of the household, for the 20 % cap of donations; unknown: not applied */
    taxableIncome?: number;
    /** Children under 6 (childcare cap); unknown: one */
    youngChildren?: number;
    /** Dependants (home help cap); unknown: none */
    dependants?: number;
}

export function computeTaxItems(input: TaxItemsInput): TaxItem[] {
    const { rules } = input;
    const outgoing = input.operations.filter(op => op.amount < 0);
    const items: TaxItem[] = [];

    const donations = outgoing.filter(op => op.categoryId === 'donations');
    const aid = donations.filter(op => isAidOrganisation(op.rawLabel));
    const general = donations.filter(op => !isAidOrganisation(op.rawLabel));
    const aidPaid = spent(aid);
    // The higher cap applies to the year's total once a donation is made from the day it was raised
    const aidCap = rules.donations.aidCapFrom && aid.some(op => op.date.slice(0, 10) >= rules.donations.aidCapFrom!.date)
        ? rules.donations.aidCapFrom.cap
        : rules.donations.aidCap;
    const aidBase = Math.min(aidPaid, aidCap);
    if (aid.length > 0) {
        items.push({ kind: 'donations_aid', paid: aidPaid, base: aidBase, rate: rules.donations.aidRate, estimate: round(aidBase * rules.donations.aidRate), cap: aidCap, operationIds: aid.map(op => op.id) });
    }
    // Above its cap, an aid donation joins the general donations
    const generalPaid = round(spent(general) + Math.max(0, aidPaid - aidCap));
    if (general.length > 0 || aidPaid > aidCap) {
        const incomeCap = input.taxableIncome !== undefined ? round(input.taxableIncome * rules.donations.incomeShareCap) : undefined;
        const base = incomeCap !== undefined ? Math.min(generalPaid, incomeCap) : generalPaid;
        items.push({ kind: 'donations', paid: generalPaid, base, rate: rules.donations.rate, estimate: round(base * rules.donations.rate), cap: incomeCap, operationIds: [...general.map(op => op.id), ...(aidPaid > aidCap ? aid.map(op => op.id) : [])] });
    }

    const home = outgoing.filter(op => op.categoryId === 'home_services');
    if (home.length > 0) {
        const cap = Math.min(rules.homeServices.maxCap, rules.homeServices.cap + rules.homeServices.perDependant * (input.dependants ?? 0));
        const paid = spent(home);
        const base = Math.min(paid, cap);
        items.push({ kind: 'home_services', paid, base, rate: rules.homeServices.rate, estimate: round(base * rules.homeServices.rate), cap, operationIds: home.map(op => op.id) });
    }

    const childcare = outgoing.filter(op => op.categoryId === 'childcare');
    if (childcare.length > 0) {
        const cap = rules.childcare.capPerChild * Math.max(1, input.youngChildren ?? 1);
        const paid = spent(childcare);
        const base = Math.min(paid, cap);
        items.push({ kind: 'childcare', paid, base, rate: rules.childcare.rate, estimate: round(base * rules.childcare.rate), cap, operationIds: childcare.map(op => op.id) });
    }

    if (input.perContributions.length > 0) {
        const paid = round(input.perContributions.reduce((sum, item) => sum + item.amount, 0));
        // The exact cap is on the tax notice; the floor applies to everyone, the ceiling to the highest incomes
        const base = Math.min(paid, rules.per.ceiling);
        const rate = input.marginalRate ?? 0;
        items.push({ kind: 'per', paid, base, rate, estimate: round(base * rate), cap: rules.per.floor, operationIds: input.perContributions.map(item => item.id) });
    }
    return items;
}
