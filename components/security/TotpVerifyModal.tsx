import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, AlertCircle, X, Check } from 'lucide-react';
import Button from '../Button';
import { totpService } from '../../src/services/security/totpService';

interface TotpVerifyModalProps {
    isOpen: boolean;
    onClose: () => void;
    onVerified: () => void;
}

export const TotpVerifyModal: React.FC<TotpVerifyModalProps> = ({
    isOpen,
    onClose,
    onVerified,
}) => {
    const { t } = useTranslation();
    const [code, setCode] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsVerifying(true);

        try {
            const isValid = await totpService.verify(code);
            if (isValid) {
                setCode('');
                onVerified();
                onClose();
            } else {
                setError(t('security:totpVerifyModal.invalid'));
            }
        } catch {
            setError(t('security:totpVerifyModal.invalid'));
        } finally {
            setIsVerifying(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in">
            <div className="relative w-full max-w-md bg-card border border-subtle rounded-2xl p-6 sm:p-8 shadow-2xl space-y-5">
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 text-tertiary hover:text-primary rounded-lg transition-colors"
                >
                    <X size={18} />
                </button>

                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-brand/15 border border-brand/30 text-brand flex items-center justify-center shrink-0">
                        <ShieldAlert size={24} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-primary">
                            {t('security:totpVerifyModal.title')}
                        </h2>
                        <p className="text-xs text-secondary mt-0.5">
                            {t('security:totpVerifyModal.subtitle')}
                        </p>
                    </div>
                </div>

                {error && (
                    <div className="p-3 bg-error/10 border border-error/20 rounded-xl flex items-center gap-2 text-error text-xs">
                        <AlertCircle size={16} className="shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <input
                            type="text"
                            required
                            autoFocus
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            className="w-full bg-subtle border border-subtle text-primary text-center font-mono text-lg tracking-widest rounded-lg focus:ring-primary focus:border-primary p-2.5 placeholder-tertiary"
                            placeholder={t('security:totpVerifyModal.placeholder')}
                        />
                    </div>

                    <div className="flex gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={onClose}
                            className="flex-1"
                        >
                            {t('security:totpVerifyModal.cancel')}
                        </Button>
                        <Button
                            type="submit"
                            className="flex-1 inline-flex items-center justify-center gap-1.5"
                            isLoading={isVerifying}
                            disabled={!code.trim()}
                        >
                            <Check size={16} />
                            {t('security:totpVerifyModal.verifyButton')}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};
