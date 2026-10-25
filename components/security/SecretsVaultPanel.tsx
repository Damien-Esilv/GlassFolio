import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { KeyRound, Plus, Trash2, Eye, EyeOff, AlertCircle, X, Check } from 'lucide-react';
import Button from '../Button';
import { secretsService, SafeSecretItem, SecretItem } from '../../src/services/security/secretsService';
import { mapAuthErrorMessage } from '../../src/services/security/authErrorMapper';

export const SecretsVaultPanel: React.FC = () => {
    const { t } = useTranslation();

    const [secrets, setSecrets] = useState<SafeSecretItem[]>([]);
    const [showAddModal, setShowAddModal] = useState(false);
    const [provider, setProvider] = useState<SecretItem['provider']>('gemini');
    const [label, setLabel] = useState('');
    const [value, setValue] = useState('');
    const [showPlainValue, setShowPlainValue] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const loadSecrets = async () => {
        try {
            const list = await secretsService.listSecrets();
            setSecrets(list);
        } catch (err) {
            console.error('Failed to load secrets', err);
        }
    };

    useEffect(() => {
        loadSecrets();
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsSaving(true);

        try {
            await secretsService.saveSecret(provider, label, value);
            await loadSecrets();
            setShowAddModal(false);
            setLabel('');
            setValue('');
            setShowPlainValue(false);
        } catch (err) {
            setError(mapAuthErrorMessage(err, t, 'common:errors.secrets.saveFailed'));
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (window.confirm(t('security:secrets.deleteConfirm'))) {
            try {
                await secretsService.deleteSecret(id);
                await loadSecrets();
            } catch (err) {
                console.error('Failed to delete secret', err);
            }
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand/15 border border-brand/30 text-brand flex items-center justify-center shrink-0">
                        <KeyRound size={22} />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-primary">
                            {t('security:secrets.title')}
                        </h3>
                        <p className="text-xs text-secondary mt-0.5">
                            {t('security:secrets.subtitle')}
                        </p>
                    </div>
                </div>

                <Button
                    type="button"
                    onClick={() => setShowAddModal(true)}
                    className="text-xs shrink-0 inline-flex items-center gap-1.5"
                >
                    <Plus size={14} />
                    {t('security:secrets.addSecretButton')}
                </Button>
            </div>

            {secrets.length === 0 ? (
                <div className="p-4 bg-subtle border border-subtle rounded-xl text-center text-xs text-secondary">
                    {t('security:secrets.noSecrets')}
                </div>
            ) : (
                <div className="space-y-2">
                    {secrets.map((sec) => (
                        <div
                            key={sec.id}
                            className="flex items-center justify-between p-3 bg-subtle border border-subtle rounded-xl hover:border-border transition-colors"
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-card border border-subtle text-primary">
                                    {sec.provider}
                                </span>
                                <div className="min-w-0">
                                    <div className="text-xs font-semibold text-primary truncate">
                                        {sec.label}
                                    </div>
                                    <div className="font-mono text-[11px] text-tertiary">
                                        {sec.preview}
                                    </div>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => handleDelete(sec.id)}
                                title={t('security:secrets.deleteConfirm')}
                                className="p-2 text-tertiary hover:text-error rounded-lg hover:bg-card transition-colors shrink-0"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Add Secret Modal */}
            {showAddModal && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in">
                    <div className="relative w-full max-w-md bg-card border border-subtle rounded-2xl p-6 shadow-2xl space-y-4">
                        <button
                            type="button"
                            onClick={() => setShowAddModal(false)}
                            className="absolute top-4 right-4 p-2 text-tertiary hover:text-primary rounded-lg transition-colors"
                        >
                            <X size={18} />
                        </button>

                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-brand/15 border border-brand/30 text-brand flex items-center justify-center shrink-0">
                                <KeyRound size={22} />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-primary">
                                    {t('security:secrets.addSecretButton')}
                                </h3>
                                <p className="text-xs text-secondary">
                                    {t('security:secrets.subtitle')}
                                </p>
                            </div>
                        </div>

                        {error && (
                            <div className="p-3 bg-error/10 border border-error/20 rounded-xl flex items-center gap-2 text-error text-xs">
                                <AlertCircle size={16} className="shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        <form onSubmit={handleSave} className="space-y-3 pt-1">
                            <div>
                                <label className="block text-xs font-medium text-secondary mb-1">
                                    {t('security:secrets.providerLabel')}
                                </label>
                                <select
                                    value={provider}
                                    onChange={(e) => setProvider(e.target.value as SecretItem['provider'])}
                                    className="w-full bg-subtle border border-subtle text-primary text-xs rounded-lg focus:ring-primary focus:border-primary p-2.5"
                                >
                                    <option value="gemini">Google Gemini</option>
                                    <option value="openai">OpenAI</option>
                                    <option value="anthropic">Anthropic Claude</option>
                                    <option value="alphavantage">AlphaVantage</option>
                                    <option value="etherscan">Etherscan</option>
                                    <option value="coingecko">CoinGecko Pro</option>
                                    <option value="custom">Custom Provider</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-secondary mb-1">
                                    {t('security:secrets.labelField')}
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={label}
                                    onChange={(e) => setLabel(e.target.value)}
                                    className="w-full bg-subtle border border-subtle text-primary text-xs rounded-lg focus:ring-primary focus:border-primary p-2.5 placeholder-tertiary"
                                    placeholder="Production Gemini API Key"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-secondary mb-1">
                                    {t('security:secrets.valueField')}
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPlainValue ? 'text' : 'password'}
                                        required
                                        value={value}
                                        onChange={(e) => setValue(e.target.value)}
                                        className="w-full bg-subtle border border-subtle text-primary font-mono text-xs rounded-lg focus:ring-primary focus:border-primary p-2.5 pr-10 placeholder-tertiary"
                                        placeholder={t('security:secrets.valuePlaceholder')}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPlainValue(!showPlainValue)}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-tertiary hover:text-primary p-1"
                                    >
                                        {showPlainValue ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </button>
                                </div>
                            </div>

                            <div className="flex gap-2 pt-2">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => setShowAddModal(false)}
                                    className="flex-1"
                                >
                                    {t('security:secrets.cancel')}
                                </Button>
                                <Button
                                    type="submit"
                                    isLoading={isSaving}
                                    className="flex-1 inline-flex items-center justify-center gap-1.5"
                                >
                                    <Check size={14} />
                                    {t('security:secrets.saveSecret')}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
