import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, DatabaseZap } from 'lucide-react';
import { useLocalPersistenceStatus } from '../../hooks/useLocalPersistenceStatus';

type NoticeKind = 'saveError' | 'legacyIgnored' | 'browserOnly';

/**
 * Persistent banner about where local-mode data lives: warns when it is stored in the browser
 * only (no local data server), when changes are not reaching the server, or when an older
 * browser vault could not be merged (Epic E33).
 */
export const LocalPersistenceNotice: React.FC = () => {
    const { t } = useTranslation('security');
    const status = useLocalPersistenceStatus();

    let kind: NoticeKind | null = null;
    if (status.mode === 'server' && status.lastError !== null) kind = 'saveError';
    else if (status.mode === 'server' && status.legacyBrowserVaultIgnored) kind = 'legacyIgnored';
    else if (status.mode === 'browser') kind = 'browserOnly';
    if (kind === null) return null;

    const isError = kind === 'saveError';
    const Icon = isError ? DatabaseZap : AlertTriangle;

    return (
        <div
            role={isError ? 'alert' : 'status'}
            data-testid="local-persistence-notice"
            className={`mb-4 flex items-start gap-3 rounded-xl border p-4 ${isError ? 'bg-negative/10 border-negative/30 text-negative' : 'bg-warning-subtle border-warning/30 text-warning'}`}
        >
            <Icon size={20} className="mt-0.5 shrink-0" />
            <div className="min-w-0">
                <p className="text-sm font-semibold">{t(`localPersistence.notice.${kind}.title`)}</p>
                <p className="text-xs mt-1 text-secondary">{t(`localPersistence.notice.${kind}.description`)}</p>
            </div>
        </div>
    );
};
