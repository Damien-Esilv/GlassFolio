import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDownToLine, RotateCcw, ShieldCheck, CheckCircle2, History, Camera } from 'lucide-react';
import { PRESET_PATTERNS } from '../../src/services/import/presetDetector';

type BrokerPresetKey = 'BoursoBank' | 'Trade Republic' | 'Binance' | 'Kraken' | 'Bitget' | 'Coinbase';

interface BrokerMeta {
  key: BrokerPresetKey;
  patternKey: string;
  defaultMode: 'history' | 'snapshot';
  sampleRows: { isin: string; qty: string; pru: string; fee: string; curr: string }[];
}

const BROKERS: BrokerMeta[] = [
  {
    key: 'BoursoBank',
    patternKey: 'Bourso',
    defaultMode: 'history',
    sampleRows: [
      { isin: 'FR0011869353', qty: '12', pru: '495.20 €', fee: '1.99 €', curr: 'EUR' },
      { isin: 'FR0013412283', qty: '45', pru: '24.10 €', fee: '0.99 €', curr: 'EUR' },
    ],
  },
  {
    key: 'Trade Republic',
    patternKey: 'TradeRepublic',
    defaultMode: 'history',
    sampleRows: [
      { isin: 'IE00BK5BQT80', qty: '20', pru: '112.50 €', fee: '1.00 €', curr: 'EUR' },
      { isin: 'US0378331005', qty: '5', pru: '185.30 €', fee: '1.00 €', curr: 'USD' },
    ],
  },
  {
    key: 'Binance',
    patternKey: 'Binance-Spot',
    defaultMode: 'history',
    sampleRows: [
      { isin: 'BTC / EUR', qty: '0.045', pru: '61 200 €', fee: '0.000045 BTC', curr: 'EUR' },
      { isin: 'ETH / EUR', qty: '1.250', pru: '2 850 €', fee: '0.00125 ETH', curr: 'EUR' },
    ],
  },
  {
    key: 'Kraken',
    patternKey: 'Kraken',
    defaultMode: 'history',
    sampleRows: [
      { isin: 'SOL / EUR', qty: '15.0', pru: '142.80 €', fee: '0.35 €', curr: 'EUR' },
      { isin: 'BTC / EUR', qty: '0.020', pru: '62 400 €', fee: '1.20 €', curr: 'EUR' },
    ],
  },
  {
    key: 'Bitget',
    patternKey: 'Bitget',
    defaultMode: 'history',
    sampleRows: [
      { isin: 'USDT / EUR', qty: '1500', pru: '0.92 €', fee: '0.15 €', curr: 'EUR' },
    ],
  },
  {
    key: 'Coinbase',
    patternKey: 'Coinbase',
    defaultMode: 'snapshot',
    sampleRows: [
      { isin: 'BTC', qty: '0.082', pru: '58 900 €', fee: '0.00 €', curr: 'EUR' },
      { isin: 'ETH', qty: '2.100', pru: '2 750 €', fee: '0.00 €', curr: 'EUR' },
    ],
  },
];

export const InteractiveCsvPreview: React.FC = () => {
  const { t } = useTranslation();
  const [selectedBrokerKey, setSelectedBrokerKey] = useState<BrokerPresetKey>('BoursoBank');
  const [isRolledBack, setIsRolledBack] = useState(false);

  const broker = BROKERS.find((b) => b.key === selectedBrokerKey) || BROKERS[0];
  const detectedHeaders = PRESET_PATTERNS[broker.patternKey] || PRESET_PATTERNS['Bourso'];

  return (
    <section id="csv-import" className="py-16 lg:py-24 border-t border-subtle bg-canvas">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl mx-auto text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand/10 border border-brand/20 text-brand text-xs font-semibold mb-4">
            <ArrowDownToLine size={14} />
            <span>{t('landing:csv.sectionBadge')}</span>
          </div>

          <h2 className="text-2xl sm:text-4xl font-extrabold text-primary tracking-tight mb-4">
            {t('landing:csv.title')}
          </h2>

          <p className="text-sm sm:text-base text-secondary leading-relaxed">
            {t('landing:csv.subtitle')}
          </p>
        </div>

        {/* Interactive Shell */}
        <div className="max-w-5xl mx-auto bg-card border border-subtle rounded-2xl p-6 sm:p-8 shadow-xl">
          {/* Broker Selector Pills */}
          <div className="mb-6">
            <label className="block text-xs font-bold text-secondary mb-2.5">
              {t('landing:csv.selectBroker')}
            </label>
            <div className="flex flex-wrap gap-2">
              {BROKERS.map((b) => {
                const isSelected = selectedBrokerKey === b.key;
                return (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => {
                      setSelectedBrokerKey(b.key);
                      setIsRolledBack(false);
                    }}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                      isSelected
                        ? 'bg-primary text-white shadow-md'
                        : 'bg-subtle hover:bg-card-hover text-secondary hover:text-primary border border-subtle'
                    }`}
                  >
                    {b.key}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-tertiary italic leading-relaxed">
              {t('landing:csv.trademarkDisclaimer')}
            </p>
          </div>

          {/* Mode & Shield Badges */}
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand/10 text-brand border border-brand/20 text-xs font-bold">
              {broker.defaultMode === 'history' ? <History size={13} /> : <Camera size={13} />}
              <span>{t(broker.defaultMode === 'history' ? 'landing:csv.modeHistory' : 'landing:csv.modeSnapshot')}</span>
            </span>

            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-subtle text-secondary border border-subtle text-xs font-medium">
              <ShieldCheck size={13} className="text-positive" />
              <span>{t('landing:csv.duplicateGuardBadge')}</span>
            </span>

            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-subtle text-secondary border border-subtle text-xs font-medium">
              <CheckCircle2 size={13} className="text-brand" />
              <span>{t('landing:csv.formulaSanitizedBadge')}</span>
            </span>
          </div>

          {/* Detected CSV Headers vs Normalized Mapping */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="p-4 rounded-xl bg-subtle/50 border border-subtle">
              <h4 className="text-xs font-bold text-secondary uppercase tracking-wider mb-2">
                {t('landing:csv.detectedHeaders')} ({broker.key})
              </h4>
              <div className="flex flex-wrap gap-1.5 font-mono text-xs">
                {detectedHeaders.map((hdr, i) => (
                  <span key={i} className="px-2 py-0.5 rounded bg-card text-primary border border-subtle">
                    {hdr}
                  </span>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-subtle/50 border border-subtle">
              <h4 className="text-xs font-bold text-secondary uppercase tracking-wider mb-2">
                {t('landing:csv.normalizedSchema')}
              </h4>
              <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
                {(['isinTicker', 'quantity', 'pru', 'fee', 'currency'] as const).map((f) => (
                  <span key={f} className="px-2 py-0.5 rounded bg-card text-brand border border-brand/20">
                    {t(`landing:csv.fields.${f}`)}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Sample Ingestion Table Preview */}
          <div className="overflow-x-auto rounded-xl border border-subtle mb-6">
            <table className="w-full text-xs text-left">
              <thead className="bg-subtle text-secondary font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">{t('landing:csv.fields.isinTicker')}</th>
                  <th className="py-2.5 px-3">{t('landing:csv.fields.quantity')}</th>
                  <th className="py-2.5 px-3">{t('landing:csv.fields.pru')}</th>
                  <th className="py-2.5 px-3">{t('landing:csv.fields.fee')}</th>
                  <th className="py-2.5 px-3">{t('landing:csv.fields.currency')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle font-mono">
                {broker.sampleRows.map((row, i) => (
                  <tr key={i} className="hover:bg-subtle/40 transition-colors">
                    <td className="py-2.5 px-3 font-bold text-primary">{row.isin}</td>
                    <td className="py-2.5 px-3 text-secondary">{row.qty}</td>
                    <td className="py-2.5 px-3 text-primary">{row.pru}</td>
                    <td className="py-2.5 px-3 text-secondary">{row.fee}</td>
                    <td className="py-2.5 px-3 text-brand font-bold">{row.curr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Interactive 1-Click Rollback Test Button & Status */}
          <div className="pt-4 border-t border-subtle flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  isRolledBack ? 'bg-warning animate-pulse' : 'bg-positive'
                }`}
              />
              <span className="text-xs font-semibold text-primary">
                {t(isRolledBack ? 'landing:csv.statusRolledBack' : 'landing:csv.statusImported')}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsRolledBack((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                isRolledBack
                  ? 'bg-primary hover:bg-primary-hover text-white shadow-sm'
                  : 'bg-subtle hover:bg-card-hover text-secondary hover:text-primary border border-subtle'
              }`}
            >
              <RotateCcw size={14} />
              <span>{t(isRolledBack ? 'landing:csv.restoreImportBtn' : 'landing:csv.testRollbackBtn')}</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
