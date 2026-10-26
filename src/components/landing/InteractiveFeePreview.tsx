import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Coins, TrendingDown, ArrowUpRight } from 'lucide-react';
import { TrendValue } from '../ui/TrendValue';
import { TrendBadge } from '../ui/TrendBadge';

type FeeProfileKey = 'bank' | 'thematic' | 'index';
type HorizonKey = 'y10' | 'y20' | 'y30';

interface FeeProfile {
  key: FeeProfileKey;
  ter: number;
}

const PROFILES: Record<FeeProfileKey, FeeProfile> = {
  bank: { key: 'bank', ter: 0.0185 },
  thematic: { key: 'thematic', ter: 0.0050 },
  index: { key: 'index', ter: 0.0015 },
};

const HORIZONS: Record<HorizonKey, number> = {
  y10: 10,
  y20: 20,
  y30: 30,
};

const INITIAL_CAPITAL = 50000;
const GROSS_RETURN_RATE = 0.07; // 7% annualized

export const InteractiveFeePreview: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [selectedProfileKey, setSelectedProfileKey] = useState<FeeProfileKey>('index');
  const [selectedHorizonKey, setSelectedHorizonKey] = useState<HorizonKey>('y20');

  const years = HORIZONS[selectedHorizonKey];
  const profile = PROFILES[selectedProfileKey];

  const activeLocale = i18n.language && i18n.language.startsWith('fr') ? 'fr-FR' : 'en-US';

  const {
    netProjectedValue,
    feeDragLost,
    netSavingsVsBank,
    retentionRate,
    alphaVsLivretA,
    allProfileValues,
  } = useMemo(() => {
    // Gross theoretical capital without fees
    const grossFinal = INITIAL_CAPITAL * Math.pow(1 + GROSS_RETURN_RATE, years);

    // Chosen profile net capital
    const netRate = GROSS_RETURN_RATE - profile.ter;
    const netFinal = INITIAL_CAPITAL * Math.pow(1 + netRate, years);
    const drag = grossFinal - netFinal;
    const retention = Math.round((netFinal / grossFinal) * 100);

    // Bank profile net capital for comparison
    const bankNetRate = GROSS_RETURN_RATE - PROFILES.bank.ter;
    const bankFinal = INITIAL_CAPITAL * Math.pow(1 + bankNetRate, years);
    const savingsVsBank = Math.max(0, netFinal - bankFinal);

    // Alpha vs Livret A (3%)
    const alpha = (netRate - 0.03) * 100;

    // Compute values for all 3 for the comparison bar
    const allValues = (['bank', 'thematic', 'index'] as const).map((key) => {
      const p = PROFILES[key];
      const r = GROSS_RETURN_RATE - p.ter;
      const finalVal = INITIAL_CAPITAL * Math.pow(1 + r, years);
      return {
        key,
        terPercent: (p.ter * 100).toFixed(2),
        value: Math.round(finalVal),
        relativePercent: Math.round((finalVal / grossFinal) * 100),
      };
    });

    return {
      netProjectedValue: Math.round(netFinal),
      feeDragLost: Math.round(drag),
      netSavingsVsBank: Math.round(savingsVsBank),
      retentionRate: retention,
      alphaVsLivretA: Number(alpha.toFixed(2)),
      allProfileValues: allValues,
    };
  }, [profile, years]);

  return (
    <section id="etf-fees" className="py-16 lg:py-24 border-t border-subtle bg-canvas">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl mx-auto text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand/10 border border-brand/20 text-brand text-xs font-semibold mb-4">
            <Coins size={14} />
            <span>{t('landing:fees.sectionBadge')}</span>
          </div>

          <h2 className="text-2xl sm:text-4xl font-extrabold text-primary tracking-tight mb-4">
            {t('landing:fees.title')}
          </h2>

          <p className="text-sm sm:text-base text-secondary leading-relaxed">
            {t('landing:fees.subtitle')}
          </p>
        </div>

        {/* Interactive Comparator Shell */}
        <div className="max-w-5xl mx-auto bg-card border border-subtle rounded-2xl p-6 sm:p-8 shadow-xl">
          {/* Top Controls: Fee Profile & Time Horizon */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-subtle">
            {/* Profile Selector */}
            <div>
              <label className="block text-xs font-bold text-secondary mb-2.5">
                {t('landing:fees.profileLabel')}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="group">
                {(['bank', 'thematic', 'index'] as const).map((key) => {
                  const isSelected = selectedProfileKey === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedProfileKey(key)}
                      className={`p-2.5 rounded-lg text-xs font-semibold text-center transition-all ${
                        isSelected
                          ? 'bg-primary text-white shadow-sm'
                          : 'bg-subtle hover:bg-card-hover text-secondary hover:text-primary border border-subtle'
                      }`}
                    >
                      {t(`landing:fees.profiles.${key}`)}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time Horizon Selector */}
            <div>
              <label className="block text-xs font-bold text-secondary mb-2.5">
                {t('landing:fees.horizonLabel')}
              </label>
              <div className="grid grid-cols-3 gap-2" role="group">
                {(['y10', 'y20', 'y30'] as const).map((key) => {
                  const isSelected = selectedHorizonKey === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedHorizonKey(key)}
                      className={`py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                        isSelected
                          ? 'bg-primary text-white shadow-sm'
                          : 'bg-subtle hover:bg-card-hover text-secondary hover:text-primary border border-subtle'
                      }`}
                    >
                      {t(`landing:fees.horizons.${key}`)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Dynamic Value Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-6">
            <div className="p-4 rounded-xl bg-subtle/50 border border-subtle">
              <p className="text-xs font-medium text-secondary mb-1">{t('landing:fees.projectedValue')}</p>
              <div className="text-2xl font-extrabold text-primary">
                <TrendValue value={netProjectedValue} format="currency" currency="EUR" locale={activeLocale} decimals={0} showPlusSign={false} />
              </div>
              <span className="text-[11px] text-tertiary">
                {t('landing:fees.retentionRate')}: <span className="font-bold text-primary">{retentionRate}%</span>
              </span>
            </div>

            <div className="p-4 rounded-xl bg-subtle/50 border border-subtle">
              <p className="text-xs font-medium text-secondary mb-1">{t('landing:fees.feeDragLost')}</p>
              <div className="text-2xl font-extrabold text-negative flex items-center gap-1.5">
                <TrendingDown size={20} className="shrink-0" />
                <TrendValue value={-feeDragLost} format="currency" currency="EUR" locale={activeLocale} decimals={0} showPlusSign={false} />
              </div>
              <span className="text-[11px] text-tertiary">
                {t('landing:fees.benchmarkAlpha')}: <TrendBadge value={alphaVsLivretA} isPercent size="sm" />
              </span>
            </div>

            <div className="p-4 rounded-xl bg-positive-subtle/40 border border-positive/30">
              <p className="text-xs font-medium text-secondary mb-1">{t('landing:fees.netSavingsVsBank')}</p>
              <div className="text-2xl font-extrabold text-positive flex items-center gap-1">
                <ArrowUpRight size={20} className="shrink-0" />
                <TrendValue value={netSavingsVsBank} format="currency" currency="EUR" locale={activeLocale} decimals={0} showPlusSign={false} />
              </div>
              <span className="text-[11px] text-positive font-semibold">
                +{(PROFILES.bank.ter * 100 - profile.ter * 100).toFixed(2)}% net / year
              </span>
            </div>
          </div>

          {/* Comparison Progress Bars */}
          <div className="pt-4 border-t border-subtle">
            <h4 className="text-xs font-bold text-primary mb-4 uppercase tracking-wide">
              {t('landing:fees.comparisonBarTitle')} ({years} {t('landing:fees.horizons.y10').split(' ')[1] || 'years'})
            </h4>

            <div className="space-y-3.5">
              {allProfileValues.map((item) => {
                const isSelected = item.key === selectedProfileKey;
                return (
                  <div key={item.key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className={`font-semibold ${isSelected ? 'text-brand' : 'text-secondary'}`}>
                        {t(`landing:fees.profiles.${item.key}`)}
                      </span>
                      <span className="font-bold text-primary">
                        {item.value.toLocaleString(activeLocale)} € ({item.relativePercent}%)
                      </span>
                    </div>
                    <div className="h-2.5 w-full bg-subtle rounded-full overflow-hidden">
                      <div
                        style={{ width: `${item.relativePercent}%` }}
                        className={`h-full rounded-full transition-all duration-500 ${
                          isSelected ? 'bg-primary' : 'bg-primary/30'
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
