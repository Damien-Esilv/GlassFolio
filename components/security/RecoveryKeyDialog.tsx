import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, Copy, Check, Download, ShieldAlert } from 'lucide-react';
import Button from '../Button';

interface RecoveryKeyDialogProps {
    recoveryKey: string;
    onConfirmed: () => void;
}

export const RecoveryKeyDialog: React.FC<RecoveryKeyDialogProps> = ({ recoveryKey, onConfirmed }) => {
    const { t } = useTranslation();
    const [copied, setCopied] = useState(false);
    const [hasConfirmed, setHasConfirmed] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(recoveryKey);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        } catch (err) {
            console.error('Failed to copy recovery key', err);
        }
    };

    const handleDownload = () => {
        const content = [
            '================================================================',
            'GlassFolio — Emergency Recovery Key (End-to-End Encrypted Vault)',
            '================================================================',
            '',
            `Date Created : ${new Date().toISOString()}`,
            '',
            `RECOVERY KEY : ${recoveryKey}`,
            '',
            'IMPORTANT SECURITY NOTICE:',
            'This 256-bit emergency recovery key is your ONLY safeguard if you ever forget',
            'your master password. GlassFolio servers and developers cannot recover',
            'your encrypted financial data without this key.',
            'Keep this file in a secure password manager or offline safe.',
            '================================================================',
        ].join('\n');

        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `glassfolio-recovery-key-${Date.now()}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in">
            <div className="relative w-full max-w-lg bg-card border border-subtle rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
                {/* Header Icon */}
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-brand/15 border border-brand/30 text-brand flex items-center justify-center shrink-0">
                        <KeyRound size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-primary">
                            {t('auth:recoveryDialog.title')}
                        </h2>
                        <p className="text-xs text-secondary mt-0.5">
                            {t('auth:recoveryDialog.subtitle')}
                        </p>
                    </div>
                </div>

                {/* Key Box */}
                <div className="p-4 bg-subtle border border-subtle rounded-xl text-center space-y-3">
                    <span className="text-[11px] font-semibold tracking-wider text-tertiary uppercase">
                        {t('auth:recoveryDialog.badge')}
                    </span>
                    <div className="font-mono text-sm sm:text-base font-bold text-primary tracking-widest break-all select-all">
                        {recoveryKey}
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                        <button
                            type="button"
                            onClick={handleCopy}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-subtle text-primary hover:bg-card-hover text-xs font-medium transition-colors"
                        >
                            {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                            {copied ? t('auth:recoveryDialog.copied') : t('auth:recoveryDialog.copy')}
                        </button>
                        <button
                            type="button"
                            onClick={handleDownload}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-subtle text-primary hover:bg-card-hover text-xs font-medium transition-colors"
                        >
                            <Download size={14} />
                            {t('auth:recoveryDialog.download')}
                        </button>
                    </div>
                </div>

                {/* Warning note */}
                <div className="p-3 bg-warning/10 border border-warning/20 rounded-xl flex items-start gap-2.5 text-xs text-warning">
                    <ShieldAlert size={16} className="shrink-0 mt-0.5" />
                    <span>
                        {t('auth:recoveryDialog.warning')}
                    </span>
                </div>

                {/* Confirmation Checkbox */}
                <label className="flex items-start gap-3 cursor-pointer text-xs text-secondary select-none">
                    <input
                        type="checkbox"
                        checked={hasConfirmed}
                        onChange={(e) => setHasConfirmed(e.target.checked)}
                        className="mt-0.5 rounded border-subtle text-brand focus:ring-brand/30 w-4 h-4"
                    />
                    <span>{t('auth:recoveryDialog.confirmCheckbox')}</span>
                </label>

                {/* Submit button */}
                <Button
                    type="button"
                    onClick={onConfirmed}
                    disabled={!hasConfirmed}
                    className="w-full"
                >
                    {t('auth:recoveryDialog.continueButton')}
                </Button>
            </div>
        </div>
    );
};
