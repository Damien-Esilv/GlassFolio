import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sparkles, ShieldCheck, ArrowRight, Lock, PieChart } from 'lucide-react';
import { useDemoAccess } from '../../hooks/useDemoAccess';
import { TrendBadge } from '../ui/TrendBadge';
import { TrendValue } from '../ui/TrendValue';
import { CHART_SERIES_PALETTE } from '../../constants/themeTokens';
import { getAppUrl, buildAppDestinationUrl } from '../../config/deployment';

type EnvelopeFilter = 'all' | 'pea' | 'cto' | 'crypto';
type BaseCurrency = 'EUR' | 'USD' | 'CHF';

const FX_RATES: Record<BaseCurrency, number> = {
  EUR: 1,
  USD: 1.09,
  CHF: 0.96,
};

interface EnvelopeStats {
  netWorthEur: number;
  unrealizedPlEur: number;
  plPercent: number;
  pruEur: number;
  segments: {
    labelKey: string;
    percent: number;
    colorToken: typeof CHART_SERIES_PALETTE[number];
  }[];
}

const STATS_MAP: Record<EnvelopeFilter, EnvelopeStats> = {
  all: {
    netWorthEur: 148450,
    unrealizedPlEur: 18420,
    plPercent: 14.17,
    pruEur: 130030,
    segments: [
      { labelKey: 'landing:hero.segments.equitiesEtf', percent: 46, colorToken: CHART_SERIES_PALETTE[0] },
      { labelKey: 'landing:hero.segments.techGrowth', percent: 28, colorToken: CHART_SERIES_PALETTE[1] },
      { labelKey: 'landing:hero.segments.cryptoAssets', percent: 18, colorToken: CHART_SERIES_PALETTE[2] },
      { labelKey: 'landing:hero.segments.cashYield', percent: 8, colorToken: CHART_SERIES_PALETTE[3] },
    ],
  },
  pea: {
    netWorthEur: 68200,
    unrealizedPlEur: 11200,
    plPercent: 19.65,
    pruEur: 57000,
    segments: [
      { labelKey: 'landing:hero.segments.equitiesEtf', percent: 75, colorToken: CHART_SERIES_PALETTE[0] },
      { labelKey: 'landing:hero.segments.cashYield', percent: 25, colorToken: CHART_SERIES_PALETTE[3] },
    ],
  },
  cto: {
    netWorthEur: 54100,
    unrealizedPlEur: 4720,
    plPercent: 9.56,
    pruEur: 49380,
    segments: [
      { labelKey: 'landing:hero.segments.techGrowth', percent: 70, colorToken: CHART_SERIES_PALETTE[1] },
      { labelKey: 'landing:hero.segments.equitiesEtf', percent: 30, colorToken: CHART_SERIES_PALETTE[0] },
    ],
  },
  crypto: {
    netWorthEur: 26150,
    unrealizedPlEur: 2500,
    plPercent: 10.57,
    pruEur: 23650,
    segments: [
      { labelKey: 'landing:hero.segments.cryptoAssets', percent: 85, colorToken: CHART_SERIES_PALETTE[2] },
      { labelKey: 'landing:hero.segments.cashYield', percent: 15, colorToken: CHART_SERIES_PALETTE[3] },
    ],
  },
};

export const LandingHero: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { launchDemo, isLaunchingDemo } = useDemoAccess();
  const [selectedEnvelope, setSelectedEnvelope] = useState<EnvelopeFilter>('all');
  const [selectedCurrency, setSelectedCurrency] = useState<BaseCurrency>('EUR');
  const isExternalApp = Boolean(getAppUrl());

  const stats = STATS_MAP[selectedEnvelope];
  const fx = FX_RATES[selectedCurrency];

  const netWorthConverted = useMemo(() => stats.netWorthEur * fx, [stats.netWorthEur, fx]);
  const unrealizedConverted = useMemo(() => stats.unrealizedPlEur * fx, [stats.unrealizedPlEur, fx]);
  const pruConverted = useMemo(() => stats.pruEur * fx, [stats.pruEur, fx]);

  const activeLocale = i18n.language && i18n.language.startsWith('fr') ? 'fr-FR' : 'en-US';

  return (
    <section className="relative overflow-hidden pt-12 pb-16 lg:pt-20 lg:pb-24">
      {/* Subtle background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-brand/10 blur-[130px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="text-center max-w-3xl mx-auto mb-10 lg:mb-14">
          {/* Trust Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand/10 border border-brand/20 text-brand text-xs font-semibold mb-6 animate-fade-in">
            <ShieldCheck size={14} />
            <span>{t('landing:hero.badge')}</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-primary leading-[1.15] mb-6">
            {t('landing:hero.title')}
          </h1>

          <p className="text-base sm:text-lg text-secondary leading-relaxed mb-8">
            {t('landing:hero.subtitle')}
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mb-4">
            <button
              type="button"
              onClick={() => launchDemo('/')}
              disabled={isLaunchingDemo}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white text-sm font-bold px-6 py-3.5 rounded-xl shadow-lg shadow-brand/25 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60"
            >
              <Sparkles size={17} />
              <span>{t('landing:common.launchInteractiveDemo')}</span>
            </button>

            {isExternalApp ? (
              <a
                href={buildAppDestinationUrl('/signup')}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-subtle hover:bg-card-hover border border-subtle text-primary text-sm font-bold px-6 py-3.5 rounded-xl transition-all"
              >
                <Lock size={16} className="text-secondary" />
                <span>{t('landing:common.createEncryptedVault')}</span>
                <ArrowRight size={15} />
              </a>
            ) : (
              <Link
                to="/signup"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-subtle hover:bg-card-hover border border-subtle text-primary text-sm font-bold px-6 py-3.5 rounded-xl transition-all"
              >
                <Lock size={16} className="text-secondary" />
                <span>{t('landing:common.createEncryptedVault')}</span>
                <ArrowRight size={15} />
              </Link>
            )}
          </div>

          <p className="text-xs text-tertiary">
            {t('landing:hero.envelopesBadge')}
          </p>
        </div>

        {/* Interactive Hero Card */}
        <div className="max-w-4xl mx-auto bg-card border border-subtle rounded-2xl p-5 sm:p-8 shadow-2xl relative transition-all">
          {/* Top Bar: Card Title + Demo Data Badge */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-subtle pb-5 mb-6">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <PieChart size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold text-primary">{t('landing:hero.cardTitle')}</h3>
                <p className="text-xs text-secondary">{t('landing:hero.metrics.otherEnvelopesNote')}</p>
              </div>
            </div>

            <span className="px-2.5 py-1 rounded-full bg-subtle text-secondary border border-subtle text-[11px] font-semibold">
              {t('landing:common.demoDataBadge')}
            </span>
          </div>

          {/* Interactive Controls: Envelope Filters & Base Currency */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            {/* Envelope Pills */}
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('landing:hero.envelopeFilterLabel')}>
              {(['all', 'pea', 'cto', 'crypto'] as const).map((env) => {
                const isActive = selectedEnvelope === env;
                return (
                  <button
                    key={env}
                    type="button"
                    onClick={() => setSelectedEnvelope(env)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-primary text-white shadow-sm'
                        : 'bg-subtle hover:bg-card-hover text-secondary hover:text-primary border border-subtle'
                    }`}
                  >
                    {t(`landing:hero.envelopes.${env}`)}
                  </button>
                );
              })}
            </div>

            {/* Currency Switcher */}
            <div className="inline-flex items-center p-0.5 rounded-lg bg-subtle border border-subtle" role="group" aria-label={t('landing:hero.currencySwitchLabel')}>
              {(['EUR', 'USD', 'CHF'] as const).map((curr) => {
                const isSelected = selectedCurrency === curr;
                return (
                  <button
                    key={curr}
                    type="button"
                    onClick={() => setSelectedCurrency(curr)}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                      isSelected ? 'bg-card text-brand shadow-xs' : 'text-secondary hover:text-primary'
                    }`}
                  >
                    {curr}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dynamic Figures */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-5 rounded-xl bg-subtle/60 border border-subtle mb-6">
            <div>
              <p className="text-xs font-medium text-secondary mb-1">{t('landing:hero.metrics.netWorth')}</p>
              <div className="text-2xl sm:text-3xl font-extrabold text-primary">
                <TrendValue
                  value={netWorthConverted}
                  format="currency"
                  currency={selectedCurrency}
                  locale={activeLocale}
                  decimals={0}
                  showPlusSign={false}
                />
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-secondary mb-1">{t('landing:hero.metrics.unrealizedPl')}</p>
              <div className="flex items-center gap-2">
                <span className="text-xl sm:text-2xl font-bold">
                  <TrendValue
                    value={unrealizedConverted}
                    format="currency"
                    currency={selectedCurrency}
                    locale={activeLocale}
                    decimals={0}
                    showPlusSign={true}
                  />
                </span>
                <TrendBadge value={stats.plPercent} isPercent size="sm" />
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-secondary mb-1">{t('landing:hero.metrics.pruTotal')}</p>
              <div className="text-xl sm:text-2xl font-bold text-secondary">
                <TrendValue
                  value={pruConverted}
                  format="currency"
                  currency={selectedCurrency}
                  locale={activeLocale}
                  decimals={0}
                  showPlusSign={false}
                />
              </div>
            </div>
          </div>

          {/* Allocation Progress Bar & Segments */}
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-secondary mb-2">
              <span>{t('landing:hero.metrics.allocationTitle')}</span>
              <span>100%</span>
            </div>

            {/* Stacked Bar */}
            <div className="h-3 w-full bg-subtle rounded-full overflow-hidden flex gap-0.5">
              {stats.segments.map((seg, idx) => (
                <div
                  key={idx}
                  style={{ width: `${seg.percent}%` }}
                  className={`h-full ${seg.colorToken.bg} transition-all duration-500`}
                  title={`${t(seg.labelKey)}: ${seg.percent}%`}
                />
              ))}
            </div>

            {/* Segment Legend */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-3 pt-2">
              {stats.segments.map((seg, idx) => (
                <div key={idx} className="flex items-center gap-2 text-xs">
                  <span className={`w-2.5 h-2.5 rounded-full ${seg.colorToken.bg} shrink-0`} />
                  <span className="text-secondary truncate">{t(seg.labelKey)}</span>
                  <span className="font-bold text-primary ml-auto">{seg.percent}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
