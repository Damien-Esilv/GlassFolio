import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import translation files
import commonEN from '../locales/en/common.json';
import navigationEN from '../locales/en/navigation.json';
import authEN from '../locales/en/auth.json';
import dashboardEN from '../locales/en/dashboard.json';
import portfolioEN from '../locales/en/portfolio.json';
import transactionsEN from '../locales/en/transactions.json';
import progressEN from '../locales/en/progress.json';
import gamificationEN from '../locales/en/gamification.json';
import settingsEN from '../locales/en/settings.json';
import reportsEN from '../locales/en/reports.json';
import taxEN from '../locales/en/tax.json';
import aiEN from '../locales/en/ai.json';
import securityEN from '../locales/en/security.json';

import commonFR from '../locales/fr/common.json';
import navigationFR from '../locales/fr/navigation.json';
import authFR from '../locales/fr/auth.json';
import dashboardFR from '../locales/fr/dashboard.json';
import portfolioFR from '../locales/fr/portfolio.json';
import transactionsFR from '../locales/fr/transactions.json';
import progressFR from '../locales/fr/progress.json';
import gamificationFR from '../locales/fr/gamification.json';
import settingsFR from '../locales/fr/settings.json';
import reportsFR from '../locales/fr/reports.json';
import taxFR from '../locales/fr/tax.json';
import aiFR from '../locales/fr/ai.json';
import securityFR from '../locales/fr/security.json';

const resources = {
    en: {
        common: commonEN,
        navigation: navigationEN,
        auth: authEN,
        dashboard: dashboardEN,
        portfolio: portfolioEN,
        transactions: transactionsEN,
        progress: progressEN,
        gamification: gamificationEN,
        settings: settingsEN,
        reports: reportsEN,
        tax: taxEN,
        ai: aiEN,
        security: securityEN,
    },
    fr: {
        common: commonFR,
        navigation: navigationFR,
        auth: authFR,
        dashboard: dashboardFR,
        portfolio: portfolioFR,
        transactions: transactionsFR,
        progress: progressFR,
        gamification: gamificationFR,
        settings: settingsFR,
        reports: reportsFR,
        tax: taxFR,
        ai: aiFR,
        security: securityFR,
    },
};

i18n
    .use(initReactI18next)
    .init({
        resources,
        lng: 'en', // Default language
        fallbackLng: 'en',
        defaultNS: 'common',
        interpolation: {
            escapeValue: false, // React already escapes values
        },
        react: {
            useSuspense: false,
        },
    });

export default i18n;
