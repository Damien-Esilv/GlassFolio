import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getSyncedPublicLanguage } from './services/storage/publicPreferencesSync';

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
import landingEN from '../locales/en/landing.json';
import legalEN from '../locales/en/legal.json';
import selfhostEN from '../locales/en/selfhost.json';
import aboutEN from '../locales/en/about.json';
import roadmapEN from '../locales/en/roadmap.json';
import changelogEN from '../locales/en/changelog.json';
import notificationsEN from '../locales/en/notifications.json';
import seoEN from '../locales/en/seo.json';

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
import landingFR from '../locales/fr/landing.json';
import legalFR from '../locales/fr/legal.json';
import selfhostFR from '../locales/fr/selfhost.json';
import aboutFR from '../locales/fr/about.json';
import roadmapFR from '../locales/fr/roadmap.json';
import changelogFR from '../locales/fr/changelog.json';
import notificationsFR from '../locales/fr/notifications.json';
import seoFR from '../locales/fr/seo.json';

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
        landing: landingEN,
        legal: legalEN,
        selfhost: selfhostEN,
        about: aboutEN,
        roadmap: roadmapEN,
        changelog: changelogEN,
        notifications: notificationsEN,
        seo: seoEN,
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
        landing: landingFR,
        legal: legalFR,
        selfhost: selfhostFR,
        about: aboutFR,
        roadmap: roadmapFR,
        changelog: changelogFR,
        notifications: notificationsFR,
        seo: seoFR,
    },
};

i18n
    .use(initReactI18next)
    .init({
        resources,
        lng: getSyncedPublicLanguage(),
        fallbackLng: 'en',
        defaultNS: 'common',
        interpolation: {
            escapeValue: false, // React already escapes values
        },
        react: {
            useSuspense: false,
        },
    });

// Screen readers and the browser's own translation read <html lang>: keep it on the UI language
const syncDocumentLanguage = (lng: string | undefined): void => {
    if (typeof document === 'undefined' || !lng) return;
    document.documentElement.lang = lng.toLowerCase().startsWith('fr') ? 'fr' : 'en';
};
i18n.on('languageChanged', syncDocumentLanguage);
syncDocumentLanguage(i18n.language);

export default i18n;
