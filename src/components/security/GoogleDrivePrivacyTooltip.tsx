import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Info, ShieldCheck, FolderLock, Sparkles, X } from 'lucide-react';

export const GoogleDrivePrivacyTooltip: React.FC = () => {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on outside click or Escape
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    return (
        <div ref={containerRef} className="relative inline-block text-center w-full mt-2">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                onMouseEnter={() => setIsOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs text-secondary hover:text-primary transition-colors focus:outline-none focus:ring-1 focus:ring-primary rounded px-1.5 py-0.5"
                aria-expanded={isOpen}
                aria-label={t('auth:googleDrivePrivacy.buttonLabel', "Pourquoi l'accès au Drive ?")}
            >
                <Info size={13} className="text-brand shrink-0" />
                <span>{t('auth:googleDrivePrivacy.buttonLabel', "Pourquoi l'accès au Drive ?")}</span>
            </button>

            {isOpen && (
                <div
                    role="tooltip"
                    className="absolute left-1/2 transform -translate-x-1/2 bottom-full mb-2 z-50 w-80 sm:w-96 p-4 bg-card border border-subtle rounded-xl shadow-2xl text-left text-xs animate-in fade-in zoom-in-95 duration-150"
                    onMouseLeave={() => setIsOpen(false)}
                >
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-subtle">
                        <div className="flex items-center gap-2 text-primary font-semibold">
                            <ShieldCheck size={16} className="text-brand" />
                            <span>{t('auth:googleDrivePrivacy.title', 'Chiffrement E2EE sans mot de passe')}</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsOpen(false)}
                            className="text-secondary hover:text-primary transition-colors p-0.5 rounded"
                            aria-label={t('common:close', 'Fermer')}
                        >
                            <X size={14} />
                        </button>
                    </div>

                    <p className="text-secondary leading-relaxed mb-3">
                        {t(
                            'auth:googleDrivePrivacy.description',
                            'Pour garantir un chiffrement de bout en bout strict sans mot de passe : votre clé secrète de déchiffrement est stockée dans un dossier privé et invisible de votre Google Drive (appDataFolder). GlassFolio ne peut accéder à aucun de vos fichiers personnels, et nos serveurs ne peuvent jamais lire vos données financières.'
                        )}
                    </p>

                    <div className="space-y-2 bg-subtle p-2.5 rounded-lg border border-subtle">
                        <div className="flex items-start gap-2">
                            <FolderLock size={14} className="text-brand shrink-0 mt-0.5" />
                            <span className="text-secondary">
                                <strong className="text-primary font-medium">{t('auth:googleDrivePrivacy.item1Title', 'Dossier d’application isolé')}</strong> :{' '}
                                {t('auth:googleDrivePrivacy.item1Text', 'Strictement aucun accès à vos documents, photos ou fichiers Drive.')}
                            </span>
                        </div>
                        <div className="flex items-start gap-2">
                            <Sparkles size={14} className="text-brand shrink-0 mt-0.5" />
                            <span className="text-secondary">
                                <strong className="text-primary font-medium">{t('auth:googleDrivePrivacy.item2Title', 'Zéro mot de passe')}</strong> :{' '}
                                {t('auth:googleDrivePrivacy.item2Text', 'Vos appareils se synchronisent automatiquement grâce à votre session Google.')}
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
