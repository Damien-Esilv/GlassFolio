import React from 'react';
import { useTranslation } from 'react-i18next';
import { HardDrive } from 'lucide-react';
import { useLocalPersistenceStatus } from '../../hooks/useLocalPersistenceStatus';

/** Settings card showing where data is stored in local mode. Renders nothing in cloud mode. */
export const LocalStorageStatusCard: React.FC = () => {
    const { t, i18n } = useTranslation('security');
    const status = useLocalPersistenceStatus();
    if (status.mode === 'uninitialized') return null;

    const isServer = status.mode === 'server';
    const lastSaved = status.lastSavedAt
        ? new Date(status.lastSavedAt).toLocaleString(i18n.language)
        : t('localPersistence.settings.neverSaved');

    return (
        <div className="bg-card rounded-xl p-6 shadow-lg border border-border" data-testid="local-storage-status">
            <h2 className="text-xl font-semibold text-primary mb-2 flex items-center gap-2">
                <HardDrive size={20} className="text-primary" />
                {t('localPersistence.settings.title')}
            </h2>
            <p className="text-xs text-tertiary mb-4">
                {t(isServer ? 'localPersistence.settings.serverHelp' : 'localPersistence.settings.browserHelp')}
            </p>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                    <dt className="text-xs text-tertiary">{t('localPersistence.settings.mode')}</dt>
                    <dd className="font-medium text-primary">
                        {t(isServer ? 'localPersistence.settings.serverMode' : 'localPersistence.settings.browserMode')}
                    </dd>
                </div>
                {isServer && (
                    <>
                        <div>
                            <dt className="text-xs text-tertiary">{t('localPersistence.settings.lastSaved')}</dt>
                            <dd className="font-medium text-primary">{lastSaved}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-tertiary">{t('localPersistence.settings.pending')}</dt>
                            <dd className="font-medium text-primary">{status.pending}</dd>
                        </div>
                    </>
                )}
            </dl>
        </div>
    );
};
