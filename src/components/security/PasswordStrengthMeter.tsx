import React from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';
import { evaluatePassword } from '../../services/security/passwordValidator';

interface PasswordStrengthMeterProps {
    password: string;
}

export const PasswordStrengthMeter: React.FC<PasswordStrengthMeterProps> = ({ password }) => {
    const { t } = useTranslation();
    const evaluation = evaluatePassword(password);

    if (!password) return null;

    const getScoreColor = () => {
        switch (evaluation.score) {
            case 0:
            case 1:
                return 'bg-error';
            case 2:
                return 'bg-warning';
            case 3:
                return 'bg-brand';
            case 4:
                return 'bg-success';
            default:
                return 'bg-subtle';
        }
    };

    const getScoreLabel = () => {
        switch (evaluation.score) {
            case 0:
                return t('auth:passwordMeter.veryWeak');
            case 1:
                return t('auth:passwordMeter.weak');
            case 2:
                return t('auth:passwordMeter.fair');
            case 3:
                return t('auth:passwordMeter.strong');
            case 4:
                return t('auth:passwordMeter.excellent');
            default:
                return '';
        }
    };

    const rules = [
        { id: 'length', label: t('auth:passwordMeter.ruleLength'), passed: password.length >= 12 },
        { id: 'upper', label: t('auth:passwordMeter.ruleUpper'), passed: /[A-Z]/.test(password) },
        { id: 'lower', label: t('auth:passwordMeter.ruleLower'), passed: /[a-z]/.test(password) },
        { id: 'digit', label: t('auth:passwordMeter.ruleDigit'), passed: /[0-9]/.test(password) },
        { id: 'symbol', label: t('auth:passwordMeter.ruleSymbol'), passed: /[^A-Za-z0-9]/.test(password) },
    ];

    return (
        <div className="mt-2.5 space-y-2 text-xs animate-in fade-in">
            {/* Visual Strength Bars */}
            <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-secondary">{t('auth:passwordMeter.label')}</span>
                <span className={`font-semibold ${evaluation.score >= 3 ? 'text-success' : evaluation.score === 2 ? 'text-warning' : 'text-error'}`}>
                    {getScoreLabel()}
                </span>
            </div>

            <div className="grid grid-cols-4 gap-1.5 h-1.5 w-full">
                {[1, 2, 3, 4].map((step) => (
                    <div
                        key={step}
                        className={`h-full rounded-full transition-all duration-300 ${step <= evaluation.score ? getScoreColor() : 'bg-subtle'
                            }`}
                    />
                ))}
            </div>

            {/* Checklist of rules */}
            <div className="grid grid-cols-2 gap-1.5 pt-1.5 text-[11px]">
                {rules.map((rule) => (
                    <div
                        key={rule.id}
                        className={`flex items-center gap-1.5 ${rule.passed ? 'text-success' : 'text-tertiary'
                            }`}
                    >
                        {rule.passed ? (
                            <Check size={12} className="shrink-0 stroke-[3]" />
                        ) : (
                            <X size={12} className="shrink-0 opacity-60" />
                        )}
                        <span className="truncate">{rule.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};
