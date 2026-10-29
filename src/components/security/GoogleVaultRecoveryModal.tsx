import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Download, Copy, Check, AlertTriangle } from 'lucide-react';
import Button from '../Button';

interface GoogleVaultRecoveryModalProps {
    isOpen: boolean;
    recoveryKey: string;
    onConfirmed: () => void;
}

export const GoogleVaultRecoveryModal: React.FC<GoogleVaultRecoveryModalProps> = ({
    isOpen,
    recoveryKey,
    onConfirmed,
}) => {
    const { t } = useTranslation();
    const [copied, setCopied] = useState(false);
    const [downloaded, setDownloaded] = useState(false);

    if (!isOpen) return null;

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(recoveryKey);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        } catch {
            // Clipboard API not available
        }
    };

    const handleDownload = () => {
        const text =
            `============================================================\n` +
            `GlassFolio — Emergency Recovery Kit\n` +
            `============================================================\n\n` +
            `Account Type: Google OAuth (E2EE Split-Trust)\n` +
            `Generated: ${new Date().toISOString()}\n\n` +
            `EMERGENCY RECOVERY KEY:\n` +
            `${recoveryKey}\n\n` +
            `IMPORTANT:\n` +
            `- Store this key in a secure place (password manager, safe, physical printout).\n` +
            `- This key allows you to recover and decrypt your financial vault if you lose\n` +
            `  access to your Google account or if your Google Drive appDataFolder is deleted.\n` +
            `- GlassFolio does not store this key and cannot recover your data for you.\n` +
            `============================================================\n`;

        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `glassfolio-recovery-kit-${new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setDownloaded(true);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-canvas/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-lg bg-card border border-subtle rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-brand/15 border border-brand/30 text-brand flex items-center justify-center shrink-0">
                        <ShieldCheck size={24} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-primary">
                            {t('auth:recoveryModal.googleTitle', 'Votre clé de secours 256-bit')}
                        </h2>
                        <p className="text-xs text-secondary mt-0.5">
                            {t('auth:recoveryModal.googleSubtitle', 'Votre coffre est chiffré de bout en bout avec votre compte Google.')}
                        </p>
                    </div>
                </div>

                <div className="p-3 bg-warning/10 border border-warning/20 rounded-xl flex items-start gap-2.5 text-xs text-warning">
                    <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                    <span>
                        {t(
                            'auth:recoveryModal.warningText',
                            'Conservez cette clé en lieu sûr. Elle constitue votre parachute de secours ultime si vous perdez l’accès à votre compte Google.'
                        )}
                    </span>
                </div>

                <div className="space-y-2">
                    <label className="block text-xs font-medium text-secondary">
                        {t('auth:recoveryModal.keyLabel', 'Clé de récupération de secours')}
                    </label>
                    <div className="p-3 bg-subtle border border-subtle rounded-xl font-mono text-sm text-primary break-all select-all text-center tracking-wider">
                        {recoveryKey}
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                        type="button"
                        onClick={handleCopy}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-subtle hover:bg-card-hover border border-subtle rounded-xl text-xs font-medium text-primary transition-colors"
                    >
                        {copied ? <Check size={14} className="text-positive" /> : <Copy size={14} />}
                        <span>{copied ? t('auth:recoveryModal.copied', 'Copié !') : t('auth:recoveryModal.copyButton', 'Copier la clé')}</span>
                    </button>
                    <button
                        type="button"
                        onClick={handleDownload}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-subtle hover:bg-card-hover border border-subtle rounded-xl text-xs font-medium text-primary transition-colors"
                    >
                        {downloaded ? <Check size={14} className="text-positive" /> : <Download size={14} />}
                        <span>{t('auth:recoveryModal.downloadKitButton', 'Télécharger le kit (.txt)')}</span>
                    </button>
                </div>

                <div className="pt-2">
                    <Button type="button" onClick={onConfirmed} className="w-full">
                        {t('auth:recoveryModal.proceedButton', 'J’ai sauvegardé ma clé — Accéder au tableau de bord')}
                    </Button>
                </div>
            </div>
        </div>
    );
};
