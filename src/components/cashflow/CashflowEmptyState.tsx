/**
 * First visit of the cash flow: no bank operation yet. Offers the three ways in: a statement file,
 * an operation typed by hand, and the bank sync (Woob) where it exists (desktop app, Docker).
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Landmark, PenLine, Upload, Wallet } from 'lucide-react';

/** `woobAvailable`: this GlassFolio reaches banks (desktop app, Docker), read once by the section. */
export const CashflowEmptyState: React.FC<{ onCreate: () => void; woobAvailable: boolean }> = ({ onCreate, woobAvailable }) => {
    const { t } = useTranslation();

    const action = 'flex items-center gap-3 p-4 rounded-2xl bg-subtle border border-subtle hover:border-primary text-left transition-colors';
    return (
        <section className="rounded-2xl bg-card border border-border shadow-lg p-8 text-center space-y-6 animate-fade-in-up">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <Wallet size={28} aria-hidden="true" />
            </div>
            <div className="space-y-2 max-w-xl mx-auto">
                <h2 className="text-xl font-bold text-primary">{t('cashflow:empty.title')}</h2>
                <p className="text-sm text-secondary">{t('cashflow:empty.body')}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-3xl mx-auto">
                <Link to="/import" className={action}>
                    <Upload size={20} className="text-primary shrink-0" />
                    <span className="text-sm font-semibold text-primary">{t('cashflow:empty.importFile')}</span>
                </Link>
                <button type="button" onClick={onCreate} className={action}>
                    <PenLine size={20} className="text-primary shrink-0" />
                    <span className="text-sm font-semibold text-primary">{t('cashflow:empty.createManual')}</span>
                </button>
                {woobAvailable ? (
                    <Link to="/settings?tab=connections" className={action}>
                        <Landmark size={20} className="text-primary shrink-0" />
                        <span className="text-sm font-semibold text-primary">{t('cashflow:empty.connectWoob')}</span>
                    </Link>
                ) : (
                    <div className="flex items-center gap-3 p-4 rounded-2xl border border-dashed border-subtle text-left">
                        <Landmark size={20} className="text-tertiary shrink-0" />
                        <span className="text-xs text-tertiary">{t('cashflow:empty.woobCloud')}</span>
                    </div>
                )}
            </div>
        </section>
    );
};
