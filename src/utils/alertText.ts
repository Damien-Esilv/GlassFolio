import type { TFunction } from 'i18next';
import type { Alert } from '../types';

/** Title and message of an alert in the user's language (engine alerts carry i18n keys) */
export function alertText(alert: Alert, t: TFunction): { title: string; message: string } {
    return {
        title: alert.titleKey ? t(alert.titleKey, alert.params) : alert.title,
        message: alert.messageKey ? t(alert.messageKey, alert.params) : alert.message,
    };
}
