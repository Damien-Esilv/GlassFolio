import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Copy, Check, Download, AlertCircle, X, KeyRound } from 'lucide-react';
import Button from '../Button';
import { totpService, TotpEnrollment } from '../../src/services/security/totpService';
import { generateQrSvg } from '../../src/services/security/qrCode';

interface TotpEnrollDialogProps {
    isOpen: boolean;
    onClose: () => void;
    userEmail: string;
    onEnrolled: () => void;
}

export const TotpEnrollDialog: React.FC<TotpEnrollDialogProps> = ({
    isOpen,
    onClose,
    userEmail,
    onEnrolled,
}) => {
    const { t } = useTranslation();

    const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
    const [qrSvg, setQrSvg] = useState<string>('');
    const [verificationCode, setVerificationCode] = useState('');
    const [step, setStep] = useState<'scan' | 'backup'>('scan');
    const [isVerifying, setIsVerifying] = useState(false);
    const [error, setError] = useState('');
    const [copiedSecret, setCopiedSecret] = useState(false);
    const [copiedBackup, setCopiedBackup] = useState(false);
    const [hasConfirmedBackup, setHasConfirmedBackup] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setEnrollment(null);
            setVerificationCode('');
            setStep('scan');
            setError('');
            return;
        }

        const init = async () => {
            const data = await totpService.initEnrollment(userEmail || 'user@glassfolio.com');
            setEnrollment(data);
            const svg = generateQrSvg(data.uri, { margin: 2, bg: 'white', color: 'black' });
            setQrSvg(svg);
        };
        init();
    }, [isOpen, userEmail]);

    if (!isOpen || !enrollment) return null;

    const handleCopySecret = async () => {
        try {
            await navigator.clipboard.writeText(enrollment.secret);
            setCopiedSecret(true);
            setTimeout(() => setCopiedSecret(false), 2000);
        } catch (err) {
            console.error('Failed to copy secret', err);
        }
    };

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsVerifying(true);

        try {
            const success = await totpService.confirmEnrollment(
                enrollment.secret,
                verificationCode,
                enrollment.hashedBackupCodes
            );

            if (success) {
                setStep('backup');
            } else {
                setError(t('security:totp.invalidCode'));
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : t('security:totp.invalidCode'));
        } finally {
            setIsVerifying(false);
        }
    };

    const handleCopyBackupCodes = async () => {
        try {
            const text = enrollment.plainBackupCodes.join('\n');
            await navigator.clipboard.writeText(text);
            setCopiedBackup(true);
            setTimeout(() => setCopiedBackup(false), 2000);
        } catch (err) {
            console.error('Failed to copy backup codes', err);
        }
    };

    const handleDownloadBackupCodes = () => {
        const content = [
            '================================================================',
            'GlassFolio — Emergency 2FA Backup Codes',
            '================================================================',
            '',
            `Account : ${userEmail}`,
            `Date    : ${new Date().toISOString()}`,
            '',
            'BACKUP CODES (each code can only be used once):',
            ...enrollment.plainBackupCodes.map((code, idx) => `  ${idx + 1}. ${code}`),
            '',
            'Keep these codes safe in your password manager or physical safe.',
            '================================================================',
        ].join('\n');

        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `glassfolio-backup-codes-${Date.now()}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleFinish = () => {
        onEnrolled();
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in">
            <div className="relative w-full max-w-lg bg-card border border-subtle rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
                {/* Close Button */}
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 text-tertiary hover:text-primary rounded-lg transition-colors"
                >
                    <X size={18} />
                </button>

                {/* Header */}
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-brand/15 border border-brand/30 text-brand flex items-center justify-center shrink-0">
                        <ShieldCheck size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-primary">
                            {t('security:totp.title')}
                        </h2>
                        <p className="text-xs text-secondary mt-0.5">
                            {t('security:totp.subtitle')}
                        </p>
                    </div>
                </div>

                {error && (
                    <div className="p-3 bg-error/10 border border-error/20 rounded-xl flex items-center gap-2 text-error text-xs">
                        <AlertCircle size={16} className="shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {step === 'scan' ? (
                    <div className="space-y-5">
                        {/* 1. QR Code */}
                        <div className="space-y-2">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">
                                {t('security:totp.scanQrTitle')}
                            </h3>
                            <p className="text-xs text-secondary">
                                {t('security:totp.scanQrSubtitle')}
                            </p>
                            <div className="flex justify-center p-4 bg-white rounded-xl max-w-[200px] mx-auto shadow-inner">
                                <div
                                    className="w-full h-auto aspect-square flex items-center justify-center"
                                    dangerouslySetInnerHTML={{ __html: qrSvg }}
                                />
                            </div>
                        </div>

                        {/* Secret Key manual */}
                        <div className="p-3 bg-subtle border border-subtle rounded-xl space-y-1.5">
                            <span className="text-[11px] text-tertiary font-medium">
                                {t('security:totp.manualSecretTitle')}
                            </span>
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-xs font-bold text-primary tracking-wider break-all select-all">
                                    {enrollment.secret}
                                </span>
                                <button
                                    type="button"
                                    onClick={handleCopySecret}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-card border border-subtle text-primary hover:bg-card-hover text-xs font-medium shrink-0 transition-colors"
                                >
                                    {copiedSecret ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                                    {copiedSecret ? t('security:totp.secretCopied') : t('security:totp.copySecret')}
                                </button>
                            </div>
                        </div>

                        {/* 2. Verification Form */}
                        <form onSubmit={handleVerify} className="space-y-3 pt-2">
                            <div>
                                <label className="block text-xs font-medium text-secondary mb-1">
                                    {t('security:totp.verifyTitle')}
                                </label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    maxLength={6}
                                    required
                                    value={verificationCode}
                                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                                    className="w-full bg-subtle border border-subtle text-primary text-center font-mono text-lg tracking-widest rounded-lg focus:ring-primary focus:border-primary p-2.5 placeholder-tertiary"
                                    placeholder={t('security:totp.codePlaceholder')}
                                    autoFocus
                                />
                            </div>

                            <Button
                                type="submit"
                                className="w-full"
                                isLoading={isVerifying}
                                disabled={verificationCode.length !== 6}
                            >
                                {t('security:totp.verifyButton')}
                            </Button>
                        </form>
                    </div>
                ) : (
                    /* Step 3: Backup Codes */
                    <div className="space-y-5 animate-in fade-in">
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-2 text-success font-semibold text-sm">
                                <Check size={16} />
                                <span>{t('security:totp.statusEnabled')}</span>
                            </div>
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-primary pt-2">
                                {t('security:totp.backupTitle')}
                            </h3>
                            <p className="text-xs text-secondary">
                                {t('security:totp.backupSubtitle')}
                            </p>
                        </div>

                        {/* Codes Grid */}
                        <div className="p-4 bg-subtle border border-subtle rounded-xl space-y-3">
                            <div className="grid grid-cols-2 gap-2 font-mono text-xs font-semibold text-primary">
                                {enrollment.plainBackupCodes.map((code, idx) => (
                                    <div key={idx} className="p-1.5 bg-card border border-subtle rounded text-center">
                                        {code}
                                    </div>
                                ))}
                            </div>

                            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={handleCopyBackupCodes}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-subtle text-primary hover:bg-card-hover text-xs font-medium transition-colors"
                                >
                                    {copiedBackup ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                                    {copiedBackup ? t('security:totp.codesCopied') : t('security:totp.copyBackupCodes')}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDownloadBackupCodes}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-subtle text-primary hover:bg-card-hover text-xs font-medium transition-colors"
                                >
                                    <Download size={14} />
                                    {t('security:totp.downloadBackupCodes')}
                                </button>
                            </div>
                        </div>

                        {/* Checkbox */}
                        <label className="flex items-start gap-3 cursor-pointer text-xs text-secondary select-none">
                            <input
                                type="checkbox"
                                checked={hasConfirmedBackup}
                                onChange={(e) => setHasConfirmedBackup(e.target.checked)}
                                className="mt-0.5 rounded border-subtle text-brand focus:ring-brand/30 w-4 h-4"
                            />
                            <span>{t('security:totp.confirmBackupCheckbox')}</span>
                        </label>

                        <Button
                            type="button"
                            onClick={handleFinish}
                            disabled={!hasConfirmedBackup}
                            className="w-full"
                        >
                            <KeyRound size={16} />
                            {t('security:totp.finishEnrollment')}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
};
