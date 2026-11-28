/**
 * Texts of the cash flow section, registered when the section loads: they stay out of the main
 * bundle and of the public site (Epic E52). Every cash flow component lives under the section.
 */
import i18n from '../../i18n';
import cashflowEN from '../../../locales/en/cashflow.json';
import cashflowFR from '../../../locales/fr/cashflow.json';

export const CASHFLOW_NAMESPACE = 'cashflow';

export function registerCashflowTexts(): void {
    if (!i18n.hasResourceBundle('en', CASHFLOW_NAMESPACE)) i18n.addResourceBundle('en', CASHFLOW_NAMESPACE, cashflowEN, true, true);
    if (!i18n.hasResourceBundle('fr', CASHFLOW_NAMESPACE)) i18n.addResourceBundle('fr', CASHFLOW_NAMESPACE, cashflowFR, true, true);
}

registerCashflowTexts();
