import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ServerCrash } from 'lucide-react';
import Button from '../Button';

interface LocalVaultUnavailableScreenProps {
    /** Technical reason reported by the server call (shown as a small detail line). */
    detail?: string;
    /** Retries the connection; may reject-free resolve when the connection is still down. */
    onRetry: () => Promise<void>;
}

/**
 * Shown in local mode when the local data server answered with an error at startup. The app does
 * not start from a guess: it would otherwise create an empty vault next to the user's real one.
 */
export const LocalVaultUnavailableScreen: React.FC<LocalVaultUnavailableScreenProps> = ({ detail, onRetry }) => {
    const { t } = useTranslation('security');
    const [retrying, setRetrying] = useState(false);

    const handleRetry = async (): Promise<void> => {
        setRetrying(true);
        try {
            await onRetry();
        } finally {
            setRetrying(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-canvas">
            <div role="alert" className="w-full max-w-md p-6 sm:p-8 rounded-2xl bg-card border border-subtle shadow-2xl space-y-4 text-center">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-negative/10 border border-negative/20 flex items-center justify-center text-negative">
                    <ServerCrash size={32} />
                </div>
                <h1 className="text-xl font-bold text-primary">{t('localPersistence.unavailable.title')}</h1>
                <p className="text-sm text-secondary">{t('localPersistence.unavailable.description')}</p>
                <p className="text-xs text-tertiary">{t('localPersistence.unavailable.hint')}</p>
                {detail && <p className="text-xs text-tertiary font-mono">{detail}</p>}
                <Button onClick={handleRetry} isLoading={retrying} disabled={retrying}>
                    {retrying ? t('localPersistence.unavailable.retrying') : t('localPersistence.unavailable.retry')}
                </Button>
            </div>
        </div>
    );
};
