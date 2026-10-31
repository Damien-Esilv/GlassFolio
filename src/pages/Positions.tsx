import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext';
import Button from '../components/Button';
import { Search, Download, AlertTriangle, Edit2 } from 'lucide-react';
import { portfolioService } from '../services/portfolioService';
import { Position } from '../types';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { formatCurrency } from '../utils/currency';
import { currencyService } from '../services/currencyService';
import { EditAssetModal } from '../components/positions/EditAssetModal';
import { ASSET_CLASSES_CONFIG } from '../constants/assetClasses';
import { STAGGER_DELAY_MS } from '../constants/animations';

const Positions: React.FC = () => {
  const { t } = useTranslation('portfolio');
  const { positions: globalPositions, refreshData } = useData();
  const { user } = useAuth();
  const locale = user?.preferences?.language === 'fr' ? 'fr-FR' : 'en-US';
  const prefCurrency = user?.preferences?.currency || 'EUR';

  const [filterType, setFilterType] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('All');
  const [currencyFilter, setCurrencyFilter] = useState('All');

  const [filteredPositions, setFilteredPositions] = useState<Position[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Manual price update state
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);

  const typeTabs = useMemo(() => ([
    { value: 'All', label: t('positions.filters.all') },
    ...ASSET_CLASSES_CONFIG.map(ac => ({
        value: ac.id,
        label: t(`categories.${ac.i18nKey}`, { defaultValue: ac.id })
    }))
  ]), [t]);

  // Derive unique values from global state (for dropdowns)
  const sources = useMemo(() => ['All', ...Array.from(new Set(globalPositions.map(p => p.source).filter(Boolean) as string[]))], [globalPositions]);
  const currencies = useMemo(() => ['All', ...Array.from(new Set(globalPositions.map(p => p.currency)))], [globalPositions]);

  // Filter Logic via Service
  useEffect(() => {
    const fetchPositions = async () => {
      setIsLoading(true);
      try {
        const result = await portfolioService.getPositions({
          type: filterType,
          searchQuery: searchQuery,
          source: sourceFilter,
          currency: currencyFilter
        });
        setFilteredPositions(result);
      } catch (error) {
        console.error("Failed to fetch positions", error);
      } finally {
        setIsLoading(false);
      }
    };

    const debounce = setTimeout(fetchPositions, 300);
    return () => clearTimeout(debounce);
  }, [filterType, searchQuery, sourceFilter, currencyFilter, globalPositions]);


  const cardStyle = "rounded-xl bg-card shadow-lg border border-subtle";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold text-primary">{t('navigation:menu.positions')}</h1>
        <Link to="/import">
          <Button className="flex items-center gap-2 bg-primary text-white hover:bg-primary/90">
            <Download size={16} />
            {t('common:buttons.import')}
          </Button>
        </Link>
      </div>

      {/* Filters and Search */}
      <div className={`${cardStyle} p-2 flex flex-col lg:flex-row justify-between gap-4`}>

        {/* Left: Type Tabs */}
        <div className="flex p-1 gap-1 bg-subtle rounded-lg overflow-x-auto">
          {typeTabs.map(tab => (
            <button
              key={tab.value}
              onClick={() => setFilterType(tab.value)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${filterType === tab.value ? 'bg-primary text-white shadow-lg' : 'text-secondary hover:text-primary hover:bg-subtle'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right: Dropdowns & Search */}
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="bg-subtle border border-subtle text-primary text-sm rounded-lg focus:ring-primary focus:border-primary p-2.5"
          >
            {sources.map(s => (
              <option key={s} value={s}>
                {s === 'All' ? t('positions.filters.allSources') : s}
              </option>
            ))}
          </select>

          <select
            value={currencyFilter}
            onChange={(e) => setCurrencyFilter(e.target.value)}
            className="bg-subtle border border-subtle text-primary text-sm rounded-lg focus:ring-primary focus:border-primary p-2.5"
          >
            {currencies.map(c => (
              <option key={c} value={c}>
                {c === 'All' ? t('positions.filters.allCurrencies') : c}
              </option>
            ))}
          </select>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-tertiary" size={16} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('common:labels.search')}
              className="bg-subtle border border-subtle text-primary text-sm rounded-lg focus:ring-primary focus:border-primary block w-full pl-10 p-2.5 placeholder-tertiary"
            />
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className={`${cardStyle} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-secondary">
            <thead className="text-xs text-tertiary uppercase bg-subtle border-b border-subtle">
              <tr>
                <th scope="col" className="px-6 py-4 font-medium tracking-wider">{t('positions.table.instrument')}</th>
                <th scope="col" className="px-6 py-4 font-medium tracking-wider">{t('positions.table.sourceBank')}</th>
                <th scope="col" className="px-6 py-4 font-medium tracking-wider text-right">{t('positions.table.quantity')}</th>
                <th scope="col" className="px-6 py-4 font-medium tracking-wider text-right">{t('positions.table.avgCost')}</th>
                <th scope="col" className="px-6 py-4 font-medium tracking-wider text-right">{t('positions.table.price')}</th>
                <th scope="col" className="px-6 py-4 font-medium tracking-wider text-right">{t('positions.table.marketValue')}</th>
                 <th scope="col" className="px-6 py-4 font-medium tracking-wider text-right">{t('positions.table.unrealizedPl')}</th>
                <th scope="col" className="px-6 py-4 font-medium tracking-wider text-center">{t('positions.table.currency')}</th>
                <th scope="col" className="px-6 py-4 font-medium tracking-wider text-right">{t('positions.table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-tertiary">
                    {t('common:labels.loading')}
                  </td>
                </tr>
              ) : filteredPositions.map((pos, idx) => {
                const posCurr = pos.currency || 'EUR';
                const isForeign = posCurr.toUpperCase() !== prefCurrency.toUpperCase();
                const convertedValue = currencyService.convertAmount(pos.marketValue, posCurr, prefCurrency);
                const convertedPL = currencyService.convertAmount(pos.unrealizedPL, posCurr, prefCurrency);

                // Untracked price detection (detect non-standard symbols like emojis, random text, or un-resolvable Yahoo tickers)
                const isStandardTicker = /^[A-Za-z0-9.-]+$/.test(pos.symbol.trim());
                // "Other" assets have no price tracker: the price is entered by hand, so a missing price is what to flag.
                const isManualPriced = pos.type === 'Other';
                const isUntracked = pos.type !== 'Cash' && (isManualPriced
                  ? pos.lastPrice === 0
                  : (!isStandardTicker || pos.symbol.startsWith('UNTRACKED') || pos.lastPrice === 0 || pos.symbol.includes('MANUAL')));

                return (
                  <tr
                    key={pos.id}
                    className="hover:bg-subtle transition-colors animate-row-in"
                    style={{ animationDelay: `${idx * STAGGER_DELAY_MS}ms`, animationFillMode: 'both' }}
                  >
                    <td className="px-6 py-4 font-medium text-primary whitespace-nowrap">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{pos.instrument}</span>
                          {isUntracked && (
                            <div 
                              className="flex items-center gap-1 bg-warning-subtle text-warning text-[10px] font-semibold px-2 py-0.5 rounded-full border border-warning/20"
                              title={t('positions.badges.untrackedTooltip')}
                            >
                              <AlertTriangle size={12} />
                              <span>{t('positions.badges.untracked')}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 text-xs text-secondary items-center mt-0.5">
                          <span>{pos.symbol}</span>
                          {pos.type === 'Cash' && <span className="bg-success/10 text-success px-1 rounded">{t('positions.badges.cash')}</span>}
                          {isManualPriced && !isUntracked && <span className="bg-subtle text-secondary px-1 rounded" title={t('positions.badges.manualPriceTooltip')}>{t('positions.badges.manualPrice')}</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-secondary">
                      {pos.type === 'Cash' ? (
                        <div className="flex flex-col">
                          <span className="font-semibold text-primary">{pos.bankName || pos.source}</span>
                          <span className="text-xs">{pos.accountName || t('positions.fallback.mainAccount')}</span>
                        </div>
                      ) : (
                        pos.source || t('positions.fallback.noSource')
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">{pos.quantity.toLocaleString(locale, { maximumFractionDigits: 8 })}</td>
                    <td className="px-6 py-4 text-right">{formatCurrency(pos.avgCost, posCurr, locale)}</td>
                    <td className="px-6 py-4 text-right text-tertiary">
                      <span>{formatCurrency(pos.lastPrice, posCurr, locale)}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="font-semibold text-primary">{formatCurrency(pos.marketValue, posCurr, locale)}</div>
                      {isForeign && (
                        <div className="text-xs text-tertiary font-normal">
                          ≈ {formatCurrency(convertedValue, prefCurrency, locale)}
                        </div>
                      )}
                    </td>
                    <td className={`px-6 py-4 text-right font-medium ${pos.unrealizedPL >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                      <div>{pos.unrealizedPL >= 0 ? '+' : ''}{formatCurrency(pos.unrealizedPL, posCurr, locale)} <span className="text-xs opacity-70">({pos.unrealizedPLPercent.toFixed(2)}%)</span></div>
                      {isForeign && (
                        <div className="text-xs opacity-80 font-normal">
                          ≈ {convertedPL >= 0 ? '+' : ''}{formatCurrency(convertedPL, prefCurrency, locale)}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs ${isForeign ? 'bg-primary/10 text-primary font-bold' : 'text-secondary'}`}>
                        {posCurr}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => setEditingPosition(pos)}
                        className="p-1.5 rounded-lg text-tertiary hover:text-primary hover:bg-subtle transition-colors"
                        title={t('common:buttons.edit')}
                      >
                        <Edit2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!isLoading && filteredPositions.length === 0 && (
          <div className="p-8 text-center text-tertiary">
            {t('emptyState', { defaultValue: 'Aucune position trouvée.' })}
          </div>
        )}
      </div>

      {editingPosition && (
        <EditAssetModal
          position={editingPosition}
          onClose={() => setEditingPosition(null)}
          onSaved={refreshData}
        />
      )}
    </div>
  );
};

export default Positions;