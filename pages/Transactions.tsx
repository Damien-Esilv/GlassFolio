import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext';
import Button from '../components/Button';
import { Download, Search, Edit2, X, AlertTriangle } from 'lucide-react';
import { transactionService } from '../src/services/transactionService';
import { Transaction } from '../types';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, SUPPORTED_CURRENCIES } from '../utils/currency';
import { db } from '../src/services/db';
import { ASSET_CLASSES_CONFIG } from '../src/constants/assetClasses';
import { STAGGER_DELAY_MS } from '../src/constants/animations';

const Transactions: React.FC = () => {
    const { t } = useTranslation();
    const { transactions: globalTransactions, refreshData } = useData();
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
   // Local trigger to force re-fetch after edits (independent of global state timing)
   const [refetchTrigger, setRefetchTrigger] = useState(0);

   // Transaction editing state
   const [editingTx, setEditingTx] = useState<Transaction | null>(null);
   const [editForm, setEditForm] = useState<Partial<Transaction>>({})
   const [isSaving, setIsSaving] = useState(false);

   // Derive institutes & accounts for dependent dropdowns
   const allInstitutes = useMemo(() => db.getInstitutes(), []);
   const allAccounts = useMemo(() => db.getAccounts(), []);

   const availableAccountsForBroker = useMemo(() => {
      const selectedBroker = editForm.source;
      if (!selectedBroker) return allAccounts.map(a => a.name);

      const matchingInst = allInstitutes.find(i => 
         i.name.toLowerCase() === selectedBroker.toLowerCase() || 
         selectedBroker.toLowerCase().includes(i.name.toLowerCase())
      );

      if (matchingInst) {
         const matched = allAccounts.filter(a => a.instituteId === matchingInst.id);
         if (matched.length > 0) return matched.map(a => a.name);
      }

      // Filter accounts whose name contains the broker name
      const textMatched = allAccounts.filter(a => a.name.toLowerCase().includes(selectedBroker.toLowerCase()));
      if (textMatched.length > 0) return textMatched.map(a => a.name);

      return [`${selectedBroker} Compte Principal`];
   }, [editForm.source, allInstitutes, allAccounts]);

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

   }, [searchQuery, dateRange, assetClass, side, source, currency, globalTransactions, refetchTrigger]); // Re-run if filters, global data, or manual trigger changes

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
                      <option value="All">{t('transactions:filters.all')}</option>
                      {ASSET_CLASSES_CONFIG.map(ac => (
                         <option key={ac.id} value={ac.id}>
                            {t(`portfolio:categories.${ac.i18nKey}`, { defaultValue: ac.id })}
                         </option>
                      ))}
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
                        <th scope="col" className="px-6 py-4 font-medium tracking-wider text-right">{t('transactions:table.actions')}</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-subtle">
                     {isLoading ? (
                        <tr>
                           <td colSpan={11} className="px-6 py-8 text-center text-tertiary">
                              {t('transactions:loading')}
                           </td>
                        </tr>
                     ) : filteredTransactions.map((tx, idx) => {
                         const isStandardTicker = /^[A-Za-z0-9.-]+$/.test(tx.symbol.trim());
                         const isUntracked = tx.assetClass !== 'Cash' && (!isStandardTicker || tx.symbol.startsWith('UNTRACKED') || tx.symbol.includes('MANUAL'));

                         return (
                            <tr
                               key={tx.id}
                               className="hover:bg-subtle transition-colors animate-row-in"
                               style={{ animationDelay: `${idx * STAGGER_DELAY_MS}ms`, animationFillMode: 'both' }}
                            >
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
                               <td className="px-6 py-4 text-primary font-medium">
                                  <div className="flex items-center gap-2">
                                     <span>{tx.instrument}</span>
                                     {isUntracked && (
                                        <div 
                                           className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-500 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-amber-500/20"
                                           title={t('transactions:untrackedTooltip')}
                                        >
                                           <AlertTriangle size={12} />
                                           <span>{t('transactions:untrackedBadge')}</span>
                                        </div>
                                     )}
                                  </div>
                               </td>
                               <td className="px-6 py-4 font-mono text-xs">{tx.symbol}</td>
                               <td className="px-6 py-4 text-right font-mono">{tx.amount.toLocaleString()}</td>
                               <td className="px-6 py-4 text-right font-mono">{formatCurrency(tx.price, tx.currency, locale)}</td>
                               <td className="px-6 py-4 text-right font-mono text-primary">{formatCurrency(tx.total, tx.currency, locale)}</td>
                               <td className="px-6 py-4 text-right font-mono text-tertiary">{formatCurrency(tx.fees, tx.currency, locale)}</td>
                               <td className="px-6 py-4 font-mono">{tx.currency}</td>
                               <td className="px-6 py-4 text-right">
                                  <button 
                                     onClick={() => {
                                        setEditingTx(tx);
                                        setEditForm(tx);
                                     }}
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

         {/* Edit Transaction Modal */}
         {editingTx && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
               <div className="bg-card border border-subtle rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
                  <div className="flex items-center justify-between border-b border-subtle pb-3">
                     <div>
                        <h3 className="text-lg font-bold text-primary">{t('transactions:editModal.title')}</h3>
                        <p className="text-xs text-tertiary">{t('transactions:editModal.id')}: {editingTx.id}</p>
                     </div>
                     <button onClick={() => setEditingTx(null)} className="p-1 rounded-lg hover:bg-subtle text-secondary">
                        <X size={18} />
                     </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                     <div>
                        <label className="block text-secondary font-medium mb-1">{t('transactions:editModal.instrument')}</label>
                        <input 
                           type="text" 
                           value={editForm.instrument || ''} 
                           onChange={(e) => setEditForm(prev => ({ ...prev, instrument: e.target.value }))}
                           className="w-full bg-subtle border border-subtle text-primary rounded-lg p-2.5 focus:ring-primary focus:border-primary"
                        />
                     </div>
                     <div>
                        <label className="block text-secondary font-medium mb-1">{t('transactions:editModal.symbol')}</label>
                        <input 
                           type="text" 
                           value={editForm.symbol || ''} 
                           onChange={(e) => setEditForm(prev => ({ ...prev, symbol: e.target.value }))}
                           className="w-full bg-subtle border border-subtle text-primary rounded-lg p-2.5 focus:ring-primary focus:border-primary font-mono"
                        />
                     </div>
                     <div>
                        <label className="block text-secondary font-medium mb-1">{t('transactions:editModal.type')}</label>
                        <select 
                           value={editForm.type || 'Buy'} 
                           onChange={(e) => setEditForm(prev => ({ ...prev, type: e.target.value as any }))}
                           className="w-full bg-subtle border border-subtle text-primary rounded-lg p-2.5 focus:ring-primary focus:border-primary"
                        >
                           <option value="Buy">{t('transactions:editModal.buy')}</option>
                           <option value="Sell">{t('transactions:editModal.sell')}</option>
                           <option value="Deposit">{t('transactions:editModal.deposit')}</option>
                           <option value="Withdrawal">{t('transactions:editModal.withdrawal')}</option>
                        </select>
                     </div>
                     <div>
                        <label className="block text-secondary font-medium mb-1">{t('transactions:editModal.broker')}</label>
                        <select 
                           value={editForm.source || ''} 
                           onChange={(e) => {
                              const newBroker = e.target.value;
                              const matchingInst = allInstitutes.find(i => i.name.toLowerCase() === newBroker.toLowerCase() || newBroker.toLowerCase().includes(i.name.toLowerCase()));
                              const instAccounts = matchingInst ? allAccounts.filter(a => a.instituteId === matchingInst.id) : [];
                              const defaultAcc = instAccounts[0]?.name || (allAccounts.find(a => a.name.toLowerCase().includes(newBroker.toLowerCase()))?.name) || `${newBroker} Compte Principal`;

                              setEditForm(prev => ({
                                 ...prev,
                                 source: newBroker,
                                 accountName: defaultAcc
                              }));
                           }}
                           className="w-full bg-subtle border border-subtle text-primary rounded-lg p-2.5 focus:ring-primary focus:border-primary"
                        >
                           {allInstitutes.map(i => (
                              <option key={i.id} value={i.name}>{i.name}</option>
                           ))}
                        </select>
                     </div>
                     <div>
                        <label className="block text-secondary font-medium mb-1">{t('transactions:editModal.account')}</label>
                        <select 
                           value={editForm.accountName || availableAccountsForBroker[0] || ''} 
                           onChange={(e) => setEditForm(prev => ({ ...prev, accountName: e.target.value }))}
                           className="w-full bg-subtle border border-subtle text-primary rounded-lg p-2.5 focus:ring-primary focus:border-primary"
                        >
                           {availableAccountsForBroker.map(accName => (
                              <option key={accName} value={accName}>{accName}</option>
                           ))}
                        </select>
                     </div>
                     <div>
                        <label className="block text-secondary font-medium mb-1">{t('transactions:editModal.quantity')}</label>
                        <input 
                           type="number" 
                           step="any"
                           min="0"
                           value={editForm.amount ?? 0} 
                           onChange={(e) => setEditForm(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                           className="w-full bg-subtle border border-subtle text-primary rounded-lg p-2.5 focus:ring-primary focus:border-primary font-mono"
                        />
                     </div>
                     <div>
                        <label className="block text-secondary font-medium mb-1">{t('transactions:editModal.price')}</label>
                        <input 
                           type="number" 
                           step="any"
                           min="0"
                           value={editForm.price ?? 0} 
                           onChange={(e) => setEditForm(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                           className="w-full bg-subtle border border-subtle text-primary rounded-lg p-2.5 focus:ring-primary focus:border-primary font-mono"
                        />
                     </div>
                     <div>
                        <label className="block text-secondary font-medium mb-1">{t('transactions:editModal.fees')}</label>
                        <input 
                           type="number" 
                           step="any"
                           min="0"
                           value={editForm.fees ?? 0} 
                           onChange={(e) => setEditForm(prev => ({ ...prev, fees: parseFloat(e.target.value) || 0 }))}
                           className="w-full bg-subtle border border-subtle text-primary rounded-lg p-2.5 focus:ring-primary focus:border-primary font-mono"
                        />
                     </div>
                     <div>
                        <label className="block text-secondary font-medium mb-1">{t('transactions:editModal.currency')}</label>
                        <select 
                           value={editForm.currency || 'EUR'} 
                           onChange={(e) => setEditForm(prev => ({ ...prev, currency: e.target.value }))}
                           className="w-full bg-subtle border border-subtle text-primary rounded-lg p-2.5 focus:ring-primary focus:border-primary"
                        >
                           {SUPPORTED_CURRENCIES.map(curr => (
                              <option key={curr.code} value={curr.code}>{curr.label}</option>
                           ))}
                        </select>
                     </div>
                     <div className="col-span-2">
                        <label className="block text-secondary font-medium mb-1">{t('transactions:editModal.date')}</label>
                        <input 
                           type="text" 
                           value={editForm.date || ''} 
                           onChange={(e) => setEditForm(prev => ({ ...prev, date: e.target.value }))}
                           className="w-full bg-subtle border border-subtle text-primary rounded-lg p-2.5 focus:ring-primary focus:border-primary font-mono"
                        />
                     </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-subtle">
                     <Button variant="ghost" size="sm" onClick={() => setEditingTx(null)} disabled={isSaving}>{t('transactions:editModal.cancel')}</Button>
                     <Button 
                        size="sm" 
                        className="bg-primary text-white hover:bg-primary/90"
                        disabled={isSaving}
                        onClick={async () => {
                           setIsSaving(true);
                           try {
                              const updatedTx = { ...editingTx, ...editForm, total: (editForm.amount || 0) * (editForm.price || 0) } as Transaction;
                              
                              // Save via service to update unified store & recalculate portfolio
                              await transactionService.updateTransaction(updatedTx);

                              // Close modal first for UX, then trigger double refresh:
                              // 1) local trigger forces immediate re-read from DB
                              // 2) global context refresh propagates to other pages
                              setEditingTx(null);
                              setRefetchTrigger(prev => prev + 1);
                              await refreshData();
                           } finally {
                              setIsSaving(false);
                           }
                        }}
                     >
                        {isSaving ? '...' : t('transactions:editModal.save')}
                     </Button>
                  </div>
               </div>
            </div>
         )}
      </div>
   );
};

export default Transactions;