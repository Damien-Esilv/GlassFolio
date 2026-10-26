import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Scale, CheckCircle2, AlertTriangle, FileText, Globe2 } from 'lucide-react';
import { TrendValue } from '../ui/TrendValue';

type TmiBracket = 0 | 0.11 | 0.30 | 0.41;
type GainScenario = 'dividends' | 'ctoGains' | 'crypto';

interface ScenarioDef {
  key: GainScenario;
  amount: number;
  cerfaBoxes: string[];
}

const SCENARIOS: ScenarioDef[] = [
  { key: 'dividends', amount: 3500, cerfaBoxes: ['2DC', '2OP'] },
  { key: 'ctoGains', amount: 8000, cerfaBoxes: ['3VG', '3AN', '2OP'] },
  { key: 'crypto', amount: 5000, cerfaBoxes: ['3AN_crypto'] },
];

export const InteractiveTaxPreview: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [selectedTmi, setSelectedTmi] = useState<TmiBracket>(0.11);
  const [selectedScenarioKey, setSelectedScenarioKey] = useState<GainScenario>('dividends');

  const scenario = useMemo(
    () => SCENARIOS.find((s) => s.key === selectedScenarioKey) || SCENARIOS[0],
    [selectedScenarioKey]
  );

  const activeLocale = i18n.language && i18n.language.startsWith('fr') ? 'fr-FR' : 'en-US';

  // Calculations
  const { pfuTax, pfuNet, baremeTax, baremeNet, optimalRegime, savings } = useMemo(() => {
    const gross = scenario.amount;
    // 1. PFU: strictly 30% (12.8% IR + 17.2% PS)
    const pfu = Math.round(gross * 0.30);
    const pfuN = gross - pfu;

    // 2. Barème Progressif (Case 2OP)
    let bTax = 0;
    if (scenario.key === 'dividends') {
      // 40% abattement + 6.8% CSG déductible
      const taxableBase = gross * 0.60;
      const csgDeductible = gross * 0.068;
      const irBase = Math.max(0, taxableBase - csgDeductible);
      const ir = irBase * selectedTmi;
      const ps = gross * 0.172;
      bTax = Math.round(ir + ps);
    } else if (scenario.key === 'ctoGains') {
      const csgDeductible = gross * 0.068;
      const irBase = Math.max(0, gross - csgDeductible);
      const ir = irBase * selectedTmi;
      const ps = gross * 0.172;
      bTax = Math.round(ir + ps);
    } else {
      // Crypto: PFU 30% standard
      bTax = Math.round(gross * 0.30);
    }

    const baremeN = gross - bTax;
    const isBaremeOptimal = bTax < pfu;
    const isPfuOptimal = pfu < bTax;

    let opt: 'PFU' | 'Barème' | 'Equal' = 'Equal';
    if (isBaremeOptimal) opt = 'Barème';
    if (isPfuOptimal) opt = 'PFU';

    const diff = Math.abs(pfu - bTax);

    return {
      pfuTax: pfu,
      pfuNet: pfuN,
      baremeTax: bTax,
      baremeNet: baremeN,
      optimalRegime: opt,
      savings: diff,
    };
  }, [scenario, selectedTmi]);

  return (
    <section id="tax-simulator" className="py-16 lg:py-24 border-t border-subtle bg-canvas">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl mx-auto text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand/10 border border-brand/20 text-brand text-xs font-semibold mb-4">
            <Scale size={14} />
            <span>{t('landing:tax.sectionBadge')}</span>
          </div>

          <h2 className="text-2xl sm:text-4xl font-extrabold text-primary tracking-tight mb-4">
            {t('landing:tax.title')}
          </h2>

          <p className="text-sm sm:text-base text-secondary leading-relaxed">
            {t('landing:tax.subtitle')}
          </p>
        </div>

        {/* Interactive Simulator Shell */}
        <div className="max-w-5xl mx-auto bg-card border border-subtle rounded-2xl p-6 sm:p-8 shadow-xl">
          {/* Top Controls: TMI & Scenarios */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-subtle">
            {/* TMI Selector */}
            <div>
              <label className="block text-xs font-bold text-secondary mb-2.5">
                {t('landing:tax.tmiLabel')}
              </label>
              <div className="grid grid-cols-4 gap-2" role="group">
                {([0, 0.11, 0.30, 0.41] as const).map((rate) => {
                  const isSelected = selectedTmi === rate;
                  const label = `${Math.round(rate * 100)}%`;
                  return (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => setSelectedTmi(rate)}
                      className={`py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                        isSelected
                          ? 'bg-primary text-white shadow-sm'
                          : 'bg-subtle hover:bg-card-hover text-secondary hover:text-primary border border-subtle'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Scenario Selector */}
            <div>
              <label className="block text-xs font-bold text-secondary mb-2.5">
                {t('landing:tax.scenarioLabel')}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="group">
                {(['dividends', 'ctoGains', 'crypto'] as const).map((key) => {
                  const isSelected = selectedScenarioKey === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedScenarioKey(key)}
                      className={`p-2 rounded-lg text-xs font-semibold text-center truncate transition-all ${
                        isSelected
                          ? 'bg-brand/10 border-2 border-brand text-brand'
                          : 'bg-subtle hover:bg-card-hover text-secondary hover:text-primary border border-subtle'
                      }`}
                    >
                      {t(`landing:tax.scenarios.${key}`)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Comparison Cards: PFU vs Barème */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-6">
            {/* PFU Card */}
            <div
              className={`p-5 rounded-xl border transition-all ${
                optimalRegime === 'PFU'
                  ? 'border-positive bg-positive-subtle/50 shadow-md ring-1 ring-positive/30'
                  : 'border-subtle bg-subtle/50'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-primary">{t('landing:tax.pfuCardTitle')}</h4>
                {optimalRegime === 'PFU' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-positive bg-card px-2 py-0.5 rounded-full border border-positive/30">
                    <CheckCircle2 size={12} />
                    {t('landing:tax.optimalBadge')}
                  </span>
                )}
              </div>
              <p className="text-xs text-secondary mb-4">{t('landing:tax.pfuBreakdown')}</p>

              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-secondary">{t('landing:tax.estimatedTax')}:</span>
                  <span className="font-bold text-negative">
                    <TrendValue value={pfuTax} format="currency" currency="EUR" locale={activeLocale} decimals={0} showPlusSign={false} />
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-secondary">{t('landing:tax.netAfterTax')}:</span>
                  <span className="font-extrabold text-primary">
                    <TrendValue value={pfuNet} format="currency" currency="EUR" locale={activeLocale} decimals={0} showPlusSign={false} />
                  </span>
                </div>
              </div>
            </div>

            {/* Barème Progressif Card */}
            <div
              className={`p-5 rounded-xl border transition-all ${
                optimalRegime === 'Barème'
                  ? 'border-positive bg-positive-subtle/50 shadow-md ring-1 ring-positive/30'
                  : 'border-subtle bg-subtle/50'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-primary">{t('landing:tax.baremeCardTitle')}</h4>
                {optimalRegime === 'Barème' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-positive bg-card px-2 py-0.5 rounded-full border border-positive/30">
                    <CheckCircle2 size={12} />
                    {t('landing:tax.optimalBadge')}
                  </span>
                )}
              </div>
              <p className="text-xs text-secondary mb-4">
                {scenario.key === 'dividends'
                  ? t('landing:tax.baremeBreakdownDividends')
                  : scenario.key === 'ctoGains'
                  ? t('landing:tax.baremeBreakdownGains')
                  : t('landing:tax.baremeBreakdownCrypto')}
              </p>

              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-secondary">{t('landing:tax.estimatedTax')}:</span>
                  <span className="font-bold text-negative">
                    <TrendValue value={baremeTax} format="currency" currency="EUR" locale={activeLocale} decimals={0} showPlusSign={false} />
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-secondary">{t('landing:tax.netAfterTax')}:</span>
                  <span className="font-extrabold text-primary">
                    <TrendValue value={baremeNet} format="currency" currency="EUR" locale={activeLocale} decimals={0} showPlusSign={false} />
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Optimal Recommendation Callout */}
          <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 text-xs font-semibold text-primary flex items-center gap-2.5 mb-6">
            <CheckCircle2 size={16} className="text-brand shrink-0" />
            <span>
              {optimalRegime === 'Equal'
                ? t('landing:tax.optimalSummaryEqual', { amount: pfuTax })
                : t('landing:tax.optimalSummarySave', {
                    regime: optimalRegime === 'PFU' ? 'PFU (30%)' : 'Barème Progressif (Case 2OP)',
                    savings: savings.toLocaleString(activeLocale),
                  })}
            </span>
          </div>

          {/* Active Cerfa Boxes & Foreign Accounts */}
          <div className="pt-5 border-t border-subtle">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-brand" />
                <h4 className="text-xs font-bold text-primary tracking-wide uppercase">
                  {t('landing:tax.cerfaTitle')} ({t('landing:tax.cerfaForms')})
                </h4>
              </div>

              {/* Cerfa 3916 Badge */}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-subtle text-secondary border border-subtle text-[11px] font-medium">
                <Globe2 size={12} className="text-brand" />
                <span>{t('landing:tax.cerfa3916Badge')}</span>
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {scenario.cerfaBoxes.map((boxKey) => (
                <span
                  key={boxKey}
                  className="px-3 py-1.5 rounded-lg bg-subtle border border-subtle text-xs font-mono font-bold text-primary flex items-center gap-1.5"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-brand" />
                  <span>{t(`landing:tax.boxes.${boxKey}`)}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Disclaimer Badge */}
          <div className="mt-6 pt-4 border-t border-subtle flex items-center gap-2 text-[11px] text-tertiary">
            <AlertTriangle size={13} className="shrink-0 text-warning" />
            <span>{t('landing:tax.disclaimer')}</span>
          </div>
        </div>
      </div>
    </section>
  );
};
