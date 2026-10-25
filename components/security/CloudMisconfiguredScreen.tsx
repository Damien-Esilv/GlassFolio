import React from 'react';
import { useTranslation } from 'react-i18next';
import { ServerCrash } from 'lucide-react';

/**
 * Shown by cloud builds that lack the Supabase credentials: signing in cannot work, and falling
 * back to local-only accounts would silently keep data off the server (TGLA-101).
 */
export const CloudMisconfiguredScreen: React.FC = () => {
    const { t } = useTranslation('auth');
    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-canvas">
            <div className="w-full max-w-md p-6 sm:p-8 rounded-2xl bg-card border border-subtle shadow-2xl space-y-4 text-center">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-negative/10 border border-negative/20 flex items-center justify-center text-negative">
                    <ServerCrash size={32} />
                </div>
                <h1 className="text-xl font-bold text-primary">{t('misconfigured.title')}</h1>
                <p className="text-sm text-secondary">{t('misconfigured.description')}</p>
            </div>
        </div>
    );
};
