import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext';
import Button from '../components/Button';
import { Search, Download } from 'lucide-react';
import { portfolioService } from '../src/services/portfolioService';
import { Position } from '../types';
import { useTranslation } from 'react-i18next';

const Positions: React.FC = () => {
  const { t } = useTranslation('portfolio');
  const { positions: globalPositions } = useData();

  const [filterType, setFilterType] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('All');
  const [currencyFilter, setCurrencyFilter] = useState('All');

  const [filteredPositions, setFilteredPositions] = useState<Position[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const typeTabs = useMemo(() => ([
    { value: 'All', label: t('positions.filters.all') },
    { value: 'Equities', label: t('positions.filters.equities') },
    { value: 'ETFs', label: t('positions.filters.etfs') },
    { value: 'Crypto', label: t('positions.filters.crypto') },
    { value: 'Cash', label: t('positions.filters.cash') }
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
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-tertiary">
                    {t('common:labels.loading')}
                  </td>
                </tr>
              ) : filteredPositions.map((pos) => (
                <tr key={pos.id} className="hover:bg-subtle transition-colors">
                  <td className="px-6 py-4 font-medium text-primary whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="font-bold">{pos.instrument}</span>
                      <div className="flex gap-2 text-xs text-secondary">
                        <span>{pos.symbol}</span>
                          {pos.type === 'Cash' && <span className="bg-emerald-500/10 text-emerald-500 px-1 rounded">{t('positions.badges.cash')}</span>}
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
                  <td className="px-6 py-4 text-right">{pos.quantity.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right">${pos.avgCost.toFixed(2)}</td>
                  <td className="px-6 py-4 text-right text-tertiary">${pos.lastPrice.toFixed(2)}</td>
                  <td className="px-6 py-4 text-right font-semibold text-primary">${pos.marketValue.toLocaleString()}</td>
                  <td className={`px-6 py-4 text-right font-medium ${pos.unrealizedPL >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                    {pos.unrealizedPL >= 0 ? '+' : ''}{pos.unrealizedPL.toLocaleString()} <span className="text-xs opacity-70">({pos.unrealizedPLPercent.toFixed(2)}%)</span>
                  </td>
                  <td className="px-6 py-4 text-center">{pos.currency}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!isLoading && filteredPositions.length === 0 && (
          <div className="p-8 text-center text-tertiary">
            {t('common:labels.noDataFound')}
          </div>
        )}
      </div>
    </div>
  );
};

export default Positions;