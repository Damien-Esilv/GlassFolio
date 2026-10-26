import React from 'react';
import { ShieldCheck, HardHat, Sparkles, ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import { ANIMATION_DURATION_MS, STAGGER_DELAY_MS, ANIMATION_EASING } from '../constants/animations';

const TaxSummary: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    return (
        <div className="space-y-8 animate-slide-in-left" style={{ animationDelay: `${STAGGER_DELAY_MS}ms` }}>
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-subtle">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <button
                            onClick={() => navigate('/analytics')}
                            className="p-1 rounded-lg text-secondary hover:text-primary hover:bg-subtle transition-colors"
                        >
                            <ArrowLeft size={18} />
                        </button>
                        <h1 className="text-3xl font-bold text-primary">{t('reports:tax.title')}</h1>
                    </div>
                    <p className="text-secondary text-sm ml-7">{t('reports:tax.subtitle')}</p>
                </div>
            </div>

            {/* Under Construction Hero Card */}
            <div className="rounded-3xl bg-card border border-subtle p-8 md:p-12 shadow-xl text-center flex flex-col items-center justify-center max-w-3xl mx-auto relative overflow-hidden">
                {/* Background glow */}
                <div className="absolute -top-24 -right-24 w-64 h-64 bg-warning-subtle rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-brand/10 rounded-full blur-3xl pointer-events-none" />

                <div className="p-4 rounded-2xl bg-warning-subtle text-warning mb-6 flex items-center justify-center">
                    <HardHat size={48} className="animate-bounce" />
                </div>

                <span className="text-xs font-extrabold uppercase tracking-widest px-3 py-1 rounded-full bg-warning-subtle text-warning border border-warning/20 mb-4">
                    {t('reports:tax.underConstructionBadge')}
                </span>

                <h2 className="text-2xl md:text-3xl font-bold text-primary mb-4 max-w-xl">
                    {t('reports:tax.underConstructionTitle')}
                </h2>

                <p className="text-secondary text-sm md:text-base leading-relaxed max-w-lg mb-8">
                    {t('reports:tax.underConstructionDesc')}
                </p>

                <div className="flex flex-col sm:flex-row gap-4">
                    <Button
                        onClick={() => navigate('/analytics')}
                        variant="secondary"
                        className="flex items-center justify-center gap-2"
                    >
                        <span>{t('reports:backToReports')}</span>
                    </Button>
                    <Button
                        onClick={() => navigate('/portfolio')}
                        className="flex items-center justify-center gap-2"
                    >
                        <Sparkles size={16} />
                        <span>{t('navigation:menu.portfolio')}</span>
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default TaxSummary;
