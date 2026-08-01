import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext';
import Button from '../components/Button';
import { Download, Search } from 'lucide-react';
import { transactionService } from '../src/services/transactionService';
import { Transaction } from '../types';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { formatCurrency } from '../utils/currency';

const Transactions: React.FC = () => {
    const { t } = useTranslation();
    const { transactions: globalTransactions } = useData();
    const { user } = useAuth();
    const locale = user?.preferences?.language === 'fr' ? 'fr-FR' : 'en-US';

   const [searchQuery, setSearchQuery] = useState('');
   const [dateRange, setDateRange] = useState('All');
   const [assetClass, setAssetClass] = useState('All');
   const [side, setSide] = useState('All');
   const [source, setSource] = useState('All');
   const [currency, setCurrency] = useState('All');

   const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
   const [isLoading, setIsLoading] = useState(true);

   const typeLabels = useMemo(() => ({
      Buy: t('transactions:filters.buy'),
      Sell: t('transactions:filters.sell'),
      Deposit: t('transactions:filters.deposit'),
      Withdrawal: t('transactions:filters.withdrawal')
   }), [t]);

   // Derive unique values for dropdowns (still from global list is fine, or hardcode)
   const sources = useMemo(() => ['All', ...Array.from(new Set(globalTransactions.map(t => t.source).filter(Boolean)))], [globalTransactions]);
   const currencies = useMemo(() => ['All', ...Array.from(new Set(globalTransactions.map(t => t.currency).filter(Boolean)))], [globalTransactions]);

   // Filter Logic via Service
   useEffect(() => {
      const fetchTransactions = async () => {
         setIsLoading(true);
         try {
            const result = await transactionService.getTransactions({
               searchQuery,
               dateRange,
               assetClass,
               side,
               source,
               currency
            });
            setFilteredTransactions(result);
         } catch (error) {
            console.error("Failed to fetch transactions", error);
         } finally {
            setIsLoading(false);
         }
      };

      const debounce = setTimeout(fetchTransactions, 300); // Debounce search
      return () => clearTimeout(debounce);

   }, [searchQuery, dateRange, assetClass, side, source, currency, globalTransactions]); // Re-run if filters or global data changes

   const cardStyle = "rounded-xl bg-card shadow-lg border border-subtle";

   return (
      <div className="space-y-6">
         <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h1 className="text-3xl font-bold text-primary">{t('transactions:title')}</h1>
            <Link to="/import">
               <Button className="flex items-center gap-2 bg-primary text-white hover:bg-primary/90">
                  <Download size={16} />
                  {t('transactions:importButton')}
               </Button>
            </Link>
         </div>

         {/* Advanced Filters Bar */}
         <div className={`${cardStyle} p-4 space-y-4`}>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
               {/* Date Range */}
               <div className="space-y-1">
                  <label className="text-xs text-secondary font-medium ml-1">{t('transactions:filters.dateRange')}</label>
                  <select
                     value={dateRange}
                     onChange={(e) => setDateRange(e.target.value)}
                     className="w-full bg-subtle border border-subtle text-primary text-xs rounded-lg focus:ring-primary focus:border-primary p-2"
                  >
                     <option>{t('transactions:filters.all')}</option>
                     <option>{t('transactions:filters.last30Days')}</option>
                     <option>{t('transactions:filters.last90Days')}</option>
                     <option>{t('transactions:filters.ytd')}</option>
                  </select>
               </div>

               {/* Asset Class */}
               <div className="space-y-1">
                  <label className="text-xs text-secondary font-medium ml-1">{t('transactions:filters.class')}</label>
                  <select
                     value={assetClass}
                     onChange={(e) => setAssetClass(e.target.value)}
                     className="w-full bg-subtle border border-subtle text-primary text-xs rounded-lg focus:ring-primary focus:border-primary p-2"
                  >
                     <option>{t('transactions:filters.all')}</option>
                     <option value="Equities">{t('transactions:filters.equities')}</option>
                     <option value="ETFs">{t('transactions:filters.etfs')}</option>
                     <option value="Crypto">{t('transactions:filters.crypto')}</option>
                     <option value="Cash">{t('transactions:filters.cash')}</option>
                  </select>
               </div>

               {/* Side */}
               <div className="space-y-1">
                  <label className="text-xs text-secondary font-medium ml-1">{t('transactions:filters.side')}</label>
                  <select
                     value={side}
                     onChange={(e) => setSide(e.target.value)}
                     className="w-full bg-subtle border border-subtle text-primary text-xs rounded-lg focus:ring-primary focus:border-primary p-2"
                  >
                     <option>{t('transactions:filters.all')}</option>
                     <option value="Buy">{t('transactions:filters.buy')}</option>
                     <option value="Sell">{t('transactions:filters.sell')}</option>
                     <option value="Deposit">{t('transactions:filters.deposit')}</option>
                     <option value="Withdrawal">{t('transactions:filters.withdrawal')}</option>
                  </select>
               </div>

               {/* Source */}
               <div className="space-y-1">
                  <label className="text-xs text-secondary font-medium ml-1">{t('transactions:filters.source')}</label>
                  <select
                     value={source}
                     onChange={(e) => setSource(e.target.value)}
                     className="w-full bg-subtle border border-subtle text-primary text-xs rounded-lg focus:ring-primary focus:border-primary p-2"
                  >
                     {sources.map(s => (
                        <option key={s} value={s}>
                           {s === 'All' ? t('transactions:filters.allSources') : s}
                        </option>
                     ))}
                  </select>
               </div>

               {/* Currency */}
               <div className="space-y-1">
                  <label className="text-xs text-secondary font-medium ml-1">{t('transactions:filters.currency')}</label>
                  <select
                     value={currency}
                     onChange={(e) => setCurrency(e.target.value)}
                     className="w-full bg-subtle border border-subtle text-primary text-xs rounded-lg focus:ring-primary focus:border-primary p-2"
                  >
                     {currencies.map(c => (
                        <option key={c} value={c}>
                           {c === 'All' ? t('transactions:filters.allCurrencies') : c}
                        </option>
                     ))}
                  </select>
               </div>

               {/* Reconciliation */}
               <div className="space-y-1">
                  <label className="text-xs text-secondary font-medium ml-1">{t('transactions:filters.status')}</label>
                  <select className="w-full bg-subtle border border-subtle text-tertiary text-xs rounded-lg focus:ring-primary focus:border-primary p-2" disabled>
                     <option>{t('transactions:filters.statusAll')}</option>
                     <option>{t('transactions:filters.statusCompleted')}</option>
                     <option>{t('transactions:filters.statusPending')}</option>
                  </select>
               </div>
            </div>

            {/* Search Bar */}
            <div className="relative mt-3">
               <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-tertiary" size={16} />
               <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('transactions:filters.search')}
                  className="bg-subtle border border-subtle text-primary text-sm rounded-lg focus:ring-primary focus:border-primary block w-full pl-10 p-2.5 placeholder-tertiary"
               />
            </div>
         </div>

         {/* Data Table */}
         <div className={`${cardStyle} overflow-hidden`}>
            <div className="overflow-x-auto">
               <table className="w-full text-sm text-left text-secondary">
                  <thead className="text-xs text-tertiary uppercase bg-subtle border-b border-subtle">
                     <tr>
                        <th scope="col" className="px-6 py-4 font-medium tracking-wider">{t('transactions:table.dateUtc')}</th>
                        <th scope="col" className="px-6 py-4 font-medium tracking-wider">{t('transactions:table.source')}</th>
                        <th scope="col" className="px-6 py-4 font-medium tracking-wider">{t('transactions:table.action')}</th>
                        <th scope="col" className="px-6 py-4 font-medium tracking-wider">{t('transactions:table.instrument')}</th>
                        <th scope="col" className="px-6 py-4 font-medium tracking-wider">{t('transactions:table.symbol')}</th>
                        <th scope="col" className="px-6 py-4 font-medium tracking-wider text-right">{t('transactions:table.qty')}</th>
                        <th scope="col" className="px-6 py-4 font-medium tracking-wider text-right">{t('transactions:table.price')}</th>
                        <th scope="col" className="px-6 py-4 font-medium tracking-wider text-right">{t('transactions:table.gross')}</th>
                        <th scope="col" className="px-6 py-4 font-medium tracking-wider text-right">{t('transactions:table.fee')}</th>
                        <th scope="col" className="px-6 py-4 font-medium tracking-wider">{t('transactions:table.feeCurrency')}</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-subtle">
                     {isLoading ? (
                        <tr>
                           <td colSpan={10} className="px-6 py-8 text-center text-tertiary">
                              {t('transactions:loading')}
                           </td>
                        </tr>
                     ) : filteredTransactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-subtle transition-colors">
                           <td className="px-6 py-4 whitespace-nowrap">{tx.date}</td>
                           <td className="px-6 py-4">{tx.source}</td>
                           <td className="px-6 py-4">
                              <span className={`px-2 py-1 rounded text-xs font-semibold ${tx.type === 'Buy' ? 'bg-accent-green/10 text-accent-green' :
                                 tx.type === 'Sell' ? 'bg-accent-red/10 text-accent-red' :
                                    'bg-primary/10 text-primary'
                                 }`}>
                                 {typeLabels[tx.type] ?? tx.type}
                              </span>
                           </td>
                           <td className="px-6 py-4 text-primary font-medium">{tx.instrument}</td>
                           <td className="px-6 py-4 font-mono text-xs">{tx.symbol}</td>
                           <td className="px-6 py-4 text-right font-mono">{tx.amount.toLocaleString()}</td>
                           <td className="px-6 py-4 text-right font-mono">{formatCurrency(tx.price, tx.currency, locale)}</td>
                           <td className="px-6 py-4 text-right font-mono text-primary">{formatCurrency(tx.total, tx.currency, locale)}</td>
                           <td className="px-6 py-4 text-right font-mono text-tertiary">{formatCurrency(tx.fees, tx.currency, locale)}</td>
                           <td className="px-6 py-4 font-mono">{tx.currency}</td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>
            {!isLoading && filteredTransactions.length === 0 && (
               <div className="p-8 text-center text-tertiary">
                  {t('transactions:noResults')}
               </div>
            )}
            {!isLoading && filteredTransactions.length > 0 && (
               <div className="px-6 py-4 border-t border-subtle text-xs text-tertiary">
                  {t('transactions:summary.showing')} {filteredTransactions.length} {t('transactions:summary.transactions')}
               </div>
            )}
         </div>
      </div>
   );
};

export default Transactions;