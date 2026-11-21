/**
 * Notifications for automatic syncs (TGLA-221): one alert per connection and reason (failure,
 * credentials refused, account to map again, holdings that differ from the journal), replaced on
 * each sync instead of piling up. Texts are i18n keys under `settings:connections.notifications`.
 */
import type { Alert } from '../../types/domain';
import type { SafeConnection, SyncReport } from '../../types/connections';
import { db } from '../db';

type Reason = 'error' | 'auth_failed' | 'needs_mapping' | 'drift';

const reasonOf = (report: SyncReport): Reason | null => {
    if (report.status === 'auth_failed') return 'auth_failed';
    if (report.status === 'needs_mapping') return 'needs_mapping';
    if (report.status === 'error' || report.status === 'rate_limited') return 'error';
    if (report.accounts.some(account => account.drift.length > 0)) return 'drift';
    return null;
};

const dedupPrefix = (connectionId: string): string => `sync:${connectionId}:`;

/** Replaces the connection's sync alert with the one this report calls for (or none when all is well). */
export function notifySyncOutcome(connection: Pick<SafeConnection, 'id' | 'label'>, report: SyncReport): void {
    const reason = reasonOf(report);
    const others = db.getAlerts().filter(alert => alert.archived || !alert.dedupKey?.startsWith(dedupPrefix(connection.id)));
    if (!reason) {
        db.saveAlerts(others);
        return;
    }
    const driftCount = report.accounts.reduce((total, account) => total + account.drift.length, 0);
    const alert: Alert = {
        id: `alert-sync-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        type: reason === 'drift' ? 'info' : 'warning',
        category: 'portfolio',
        title: `Sync: ${connection.label}`,
        message: reason,
        date: report.finishedAt,
        read: false,
        actionUrl: '/settings?tab=connections',
        actionLabelKey: 'settings:connections.notifications.action',
        dedupKey: `${dedupPrefix(connection.id)}${reason}`,
        titleKey: `settings:connections.notifications.${reason}.title`,
        messageKey: `settings:connections.notifications.${reason}.message`,
        params: { label: connection.label, count: driftCount },
    };
    db.saveAlerts([alert, ...others]);
}
