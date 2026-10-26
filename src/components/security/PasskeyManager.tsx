import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Fingerprint, Plus, Trash2, AlertCircle, ShieldCheck, Info, Unlock } from 'lucide-react';
import Button from '../Button';
import { passkeyService } from '../../services/security/passkeyService';
import { passkeyAccountService, AccountPasskey } from '../../services/security/passkeyAccountService';
import { StepUpAuthModal } from './StepUpAuthModal';
import { useAuth } from '../../context/AuthContext';
import { mapAuthErrorMessage } from '../../services/security/authErrorMapper';

export const PasskeyManager: React.FC = () => {
    const { t } = useTranslation();
    const { user } = useAuth();
    const isGoogleAccount = user?.authProvider === 'google';

    const [isSupported, setIsSupported] = useState<boolean | null>(null);
    const [passkeys, setPasskeys] = useState<AccountPasskey[]>([]);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [passkeyToDelete, setPasskeyToDelete] = useState<AccountPasskey | null>(null);
    // Safari refuses a second WebAuthn prompt in the same click: the vault slot is then added by a
    // follow-up click. The master password stays in memory only until that click or a reload.
    const [pendingUnlock, setPendingUnlock] = useState<{ credentialId: string; label: string; rpId: string; transports?: string[] } | null>(null);
    const pendingPasswordRef = useRef<string>('');

    const loadPasskeys = async () => {
        try {
            setPasskeys(await passkeyAccountService.list());
        } catch (err) {
            setError(mapAuthErrorMessage(err, t, 'security:passkeys.registerError'));
        }
    };

    useEffect(() => {
        const check = async () => {
            if (isGoogleAccount) return;
            const supported = await passkeyService.isSupported();
            setIsSupported(supported);
            if (supported) {
                await loadPasskeys();
            }
        };
        check();
    }, [isGoogleAccount]);

    const handleAddVerified = async ({ password }: { password: string }) => {
        if (!user) return;
        setError('');
        setNotice('');
        const label = `${typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac') ? 'Mac' : 'Device'} Passkey`;
        try {
            const { unlocksVault, pendingVaultUnlock } = await passkeyAccountService.register({
                user: { id: user.id, email: user.email, name: user.name },
                label,
                masterPassword: password,
            });
            if (pendingVaultUnlock) {
                pendingPasswordRef.current = password;
                setPendingUnlock(pendingVaultUnlock);
            } else if (!unlocksVault) {
                setNotice(t('security:passkeys.registeredWithoutPrf'));
            }
        } catch (err: unknown) {
            setError(mapAuthErrorMessage(err, t, 'security:passkeys.registerError'));
        }
        await loadPasskeys();
    };

    const handleEnableVaultUnlock = async () => {
        if (!pendingUnlock) return;
        setError('');
        try {
            const enabled = await passkeyAccountService.enableVaultUnlock({ ...pendingUnlock, masterPassword: pendingPasswordRef.current });
            if (!enabled) setNotice(t('security:passkeys.registeredWithoutPrf'));
        } catch (err: unknown) {
            setError(mapAuthErrorMessage(err, t, 'security:passkeys.registerError'));
        } finally {
            pendingPasswordRef.current = '';
            setPendingUnlock(null);
            await loadPasskeys();
        }
    };

    const handleDeleteVerified = async () => {
        if (!passkeyToDelete) return;
        await passkeyAccountService.remove(passkeyToDelete);
        await loadPasskeys();
        setPasskeyToDelete(null);
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

                {isGoogleAccount ? (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-subtle border border-subtle text-xs text-subtle shrink-0">
                        <Info size={14} className="text-brand shrink-0" />
                        <span>{t('security:passkeys.managedByGoogleBadge')}</span>
                    </div>
                ) : isSupported && (
                    <Button
                        type="button"
                        size="sm"
                        onClick={() => setIsAdding(true)}
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

            {pendingUnlock && (
                <div className="p-3 bg-brand/10 border border-brand/20 rounded-xl flex flex-col sm:flex-row sm:items-center gap-3 text-xs text-primary">
                    <span className="flex items-center gap-2 flex-1">
                        <Unlock size={16} className="shrink-0 text-brand" />
                        {t('security:passkeys.enableVaultUnlockPrompt')}
                    </span>
                    <Button size="sm" onClick={handleEnableVaultUnlock}>
                        {t('security:passkeys.enableVaultUnlockButton')}
                    </Button>
                </div>
            )}

            {notice && (
                <div className="p-3 bg-subtle border border-subtle rounded-xl flex items-center gap-2 text-secondary text-xs">
                    <Info size={16} className="shrink-0 text-brand" />
                    <span>{notice}</span>
                </div>
            )}

            {isGoogleAccount ? (
                <div className="p-4 bg-subtle border border-subtle rounded-xl flex items-start gap-3 text-xs text-secondary leading-relaxed">
                    <ShieldCheck size={20} className="text-positive shrink-0 mt-0.5" />
                    <div>
                        <p className="font-semibold text-primary">
                            {t('security:passkeys.managedByGoogleTitle')}
                        </p>
                        <p className="mt-1 text-tertiary">
                            {t('security:passkeys.managedByGoogleDesc')}
                        </p>
                    </div>
                </div>
            ) : (
                <>
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
                                    key={passkey.key}
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
                                            <div className="text-[11px] text-tertiary inline-flex items-center gap-1">
                                                {passkey.unlocksVault && <Unlock size={11} className="text-positive" />}
                                                {passkey.unlocksVault
                                                    ? t('security:passkeys.unlocksVaultBadge')
                                                    : t('security:passkeys.signInOnlyBadge')}
                                            </div>
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => setPasskeyToDelete(passkey)}
                                        title={t('security:passkeys.deleteTooltip')}
                                        className="p-2 text-tertiary hover:text-error rounded-lg hover:bg-card transition-colors"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            <StepUpAuthModal
                isOpen={isAdding}
                title={t('security:passkeys.addConfirmTitle')}
                description={t('security:passkeys.addConfirmDescription')}
                actionLabel={t('security:passkeys.addPasskeyButton')}
                onVerified={handleAddVerified}
                onClose={() => setIsAdding(false)}
            />

            <StepUpAuthModal
                isOpen={Boolean(passkeyToDelete)}
                title={t('security:passkeys.deleteConfirm')}
                description={t('security:stepUp.description')}
                actionLabel={t('common:buttons.delete')}
                actionVariant="danger"
                onVerified={handleDeleteVerified}
                onClose={() => setPasskeyToDelete(null)}
            />
        </div>
    );
};
