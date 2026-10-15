import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Fingerprint, Plus, Trash2, AlertCircle, ShieldCheck } from 'lucide-react';
import Button from '../Button';
import { passkeyService, PasskeyRecord } from '../../src/services/security/passkeyService';
import { useAuth } from '../../context/AuthContext';

export const PasskeyManager: React.FC = () => {
    const { t } = useTranslation();
    const { user } = useAuth();

    const [isSupported, setIsSupported] = useState<boolean | null>(null);
    const [passkeys, setPasskeys] = useState<PasskeyRecord[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const loadPasskeys = async () => {
        try {
            const list = await passkeyService.listPasskeys();
            setPasskeys(list);
        } catch (err) {
            console.error('Failed to load passkeys', err);
        }
    };

    useEffect(() => {
        const check = async () => {
            const supported = await passkeyService.isSupported();
            setIsSupported(supported);
            if (supported) {
                await loadPasskeys();
            }
        };
        check();
    }, []);

    const handleAddPasskey = async () => {
        if (!user) return;
        setError('');
        setIsLoading(true);

        try {
            const defaultLabel = `${typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac') ? 'Mac' : 'Device'} Passkey`;
            await passkeyService.registerPasskey(
                { id: user.id, email: user.email, name: user.name },
                defaultLabel
            );
            await loadPasskeys();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : t('security:passkeys.registerError');
            setError(msg);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeletePasskey = async (id: string) => {
        if (window.confirm(t('security:passkeys.deleteConfirm'))) {
            try {
                await passkeyService.deletePasskey(id);
                await loadPasskeys();
            } catch (err) {
                console.error('Failed to delete passkey', err);
            }
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand/15 border border-brand/30 text-brand flex items-center justify-center shrink-0">
                        <Fingerprint size={22} />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-primary">
                            {t('security:passkeys.title')}
                        </h3>
                        <p className="text-xs text-secondary mt-0.5">
                            {t('security:passkeys.subtitle')}
                        </p>
                    </div>
                </div>

                {isSupported && (
                    <Button
                        type="button"
                        size="sm"
                        onClick={handleAddPasskey}
                        isLoading={isLoading}
                        className="text-xs shrink-0 inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                        <Plus size={14} />
                        {t('security:passkeys.addPasskeyButton')}
                    </Button>
                )}
            </div>

            {error && (
                <div className="p-3 bg-error/10 border border-error/20 rounded-xl flex items-center gap-2 text-error text-xs">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {isSupported === false && (
                <div className="p-3 bg-subtle border border-subtle rounded-xl text-xs text-tertiary">
                    {t('security:passkeys.notSupported')}
                </div>
            )}

            {isSupported && passkeys.length === 0 && (
                <div className="p-4 bg-subtle border border-subtle rounded-xl text-center text-xs text-secondary">
                    {t('security:passkeys.noPasskeys')}
                </div>
            )}

            {isSupported && passkeys.length > 0 && (
                <div className="space-y-2">
                    {passkeys.map((passkey) => (
                        <div
                            key={passkey.id}
                            className="flex items-center justify-between p-3 bg-subtle border border-subtle rounded-xl hover:border-border transition-colors"
                        >
                            <div className="flex items-center gap-2.5">
                                <ShieldCheck size={18} className="text-success shrink-0" />
                                <div>
                                    <div className="text-xs font-semibold text-primary">
                                        {passkey.name}
                                    </div>
                                    <div className="text-[11px] text-tertiary">
                                        {t('security:passkeys.createdOn', {
                                            date: new Date(passkey.createdAt).toLocaleDateString(),
                                        })}
                                    </div>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => handleDeletePasskey(passkey.id)}
                                title={t('security:passkeys.deleteTooltip')}
                                className="p-2 text-tertiary hover:text-error rounded-lg hover:bg-card transition-colors"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
