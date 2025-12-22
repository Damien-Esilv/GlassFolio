import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext';
import Button from '../components/Button';
import { Download, Search } from 'lucide-react';

const Transactions: React.FC = () => {
  const { transactions } = useData(); 
  
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState('All');
  const [assetClass, setAssetClass] = useState('All');
  const [side, setSide] = useState('All');
  const [source, setSource] = useState('All');
  const [currency, setCurrency] = useState('All');

  // Derive unique values
  const sources = useMemo(() => ['All', ...Array.from(new Set(transactions.map(t => t.source).filter(Boolean)))], [transactions]);
  const currencies = useMemo(() => ['All', ...Array.from(new Set(transactions.map(t => t.currency).filter(Boolean)))], [transactions]);
  
  // Filter Logic
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matches = 
          tx.instrument.toLowerCase().includes(query) || 
          tx.symbol.toLowerCase().includes(query) ||
          tx.id.toLowerCase().includes(query);
        if (!matches) return false;
      }

      if (dateRange !== 'All') {
         const txDate = new Date(tx.date);
         const now = new Date();
         const diffTime = Math.abs(now.getTime() - txDate.getTime());
         const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

         if (dateRange === 'Last 30 Days' && diffDays > 30) return false;
         if (dateRange === 'Last 90 Days' && diffDays > 90) return false;
         if (dateRange === 'YTD' && txDate.getFullYear() !== now.getFullYear()) return false;
      }

      if (assetClass !== 'All') {
         if (assetClass === 'Equities' && tx.assetClass !== 'Equity') return false;
         if (assetClass === 'ETFs' && tx.assetClass !== 'ETF') return false;
         if (assetClass === 'Crypto' && tx.assetClass !== 'Crypto') return false;
      }

      if (side !== 'All' && tx.type !== side) return false;
      if (source !== 'All' && tx.source !== source) return false;
      if (currency !== 'All' && tx.currency !== currency) return false;

      return true;
    });
  }, [transactions, searchQuery, dateRange, assetClass, side, source, currency]);

  const cardStyle = "rounded-xl bg-white/50 dark:bg-black/20 shadow-lg ring-1 ring-black/5 dark:ring-white/10 backdrop-blur-lg";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold text-black dark:text-white">Transactions</h1>
        <Link to="/import">
           <Button className="flex items-center gap-2 bg-primary text-white hover:bg-primary/90">
             <Download size={16} />
             Import
           </Button>
        </Link>
      </div>

      {/* Advanced Filters Bar */}
      <div className={`${cardStyle} p-4 space-y-4`}>
         <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Date Range */}
            <div className="space-y-1">
               <label className="text-xs text-black/50 dark:text-white/50 font-medium ml-1">Date Range</label>
               <select 
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-black dark:text-white text-xs rounded-lg focus:ring-primary focus:border-primary p-2"
               >
                  <option>All</option>
                  <option>Last 30 Days</option>
                  <option>Last 90 Days</option>
                  <option>YTD</option>
               </select>
            </div>

            {/* Asset Class */}
            <div className="space-y-1">
               <label className="text-xs text-black/50 dark:text-white/50 font-medium ml-1">Class</label>
               <select 
                  value={assetClass}
                  onChange={(e) => setAssetClass(e.target.value)}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-black dark:text-white text-xs rounded-lg focus:ring-primary focus:border-primary p-2"
               >
                  <option>All</option>
                  <option value="Equities">Equities</option>
                  <option value="ETFs">ETFs</option>
                  <option value="Crypto">Crypto</option>
               </select>
            </div>

             {/* Side */}
             <div className="space-y-1">
               <label className="text-xs text-black/50 dark:text-white/50 font-medium ml-1">Side</label>
               <select 
                  value={side}
                  onChange={(e) => setSide(e.target.value)}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-black dark:text-white text-xs rounded-lg focus:ring-primary focus:border-primary p-2"
               >
                  <option>All</option>
                  <option value="Buy">Buy</option>
                  <option value="Sell">Sell</option>
                  <option value="Deposit">Deposit</option>
                  <option value="Withdrawal">Withdrawal</option>
               </select>
            </div>

            {/* Source */}
            <div className="space-y-1">
               <label className="text-xs text-black/50 dark:text-white/50 font-medium ml-1">Source</label>
               <select 
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-black dark:text-white text-xs rounded-lg focus:ring-primary focus:border-primary p-2"
               >
                  {sources.map(s => <option key={s} value={s}>{s === 'All' ? 'All Sources' : s}</option>)}
               </select>
            </div>

            {/* Currency */}
            <div className="space-y-1">
               <label className="text-xs text-black/50 dark:text-white/50 font-medium ml-1">Currency</label>
               <select 
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-black dark:text-white text-xs rounded-lg focus:ring-primary focus:border-primary p-2"
               >
                  {currencies.map(c => <option key={c} value={c}>{c === 'All' ? 'All Currencies' : c}</option>)}
               </select>
            </div>

            {/* Reconciliation */}
            <div className="space-y-1">
               <label className="text-xs text-black/50 dark:text-white/50 font-medium ml-1">Status</label>
               <select className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-black/50 dark:text-white/50 text-xs rounded-lg focus:ring-primary focus:border-primary p-2" disabled>
                  <option>All</option>
                  <option>Completed</option>
                  <option>Pending</option>
               </select>
            </div>
         </div>

         {/* Search Bar */}
         <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-black/40 dark:text-white/40" size={16} />
            <input 
               type="text" 
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               placeholder="Search transactions by symbol, instrument or ID..." 
               className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-black dark:text-white text-sm rounded-lg focus:ring-primary focus:border-primary block w-full pl-10 p-2.5 placeholder-black/40 dark:placeholder-white/40" 
            />
         </div>
      </div>

      {/* Data Table */}
      <div className={`${cardStyle} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-black/60 dark:text-white/60">
            <thead className="text-xs text-black/40 dark:text-white/40 uppercase bg-black/5 dark:bg-white/5 border-b border-black/10 dark:border-white/10">
              <tr>
                <th scope="col" className="px-6 py-4 font-medium tracking-wider">Date (UTC)</th>
                <th scope="col" className="px-6 py-4 font-medium tracking-wider">Source</th>
                <th scope="col" className="px-6 py-4 font-medium tracking-wider">Type</th>
                <th scope="col" className="px-6 py-4 font-medium tracking-wider">Instrument</th>
                <th scope="col" className="px-6 py-4 font-medium tracking-wider">Side</th>
                <th scope="col" className="px-6 py-4 font-medium tracking-wider text-right">Qty</th>
                <th scope="col" className="px-6 py-4 font-medium tracking-wider text-right">Price</th>
                <th scope="col" className="px-6 py-4 font-medium tracking-wider text-right">Gross</th>
                <th scope="col" className="px-6 py-4 font-medium tracking-wider text-right">Fee</th>
                <th scope="col" className="px-6 py-4 font-medium tracking-wider">Fee Ccy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-white/5">
              {filteredTransactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">{tx.date}</td>
                  <td className="px-6 py-4">{tx.source}</td>
                  <td className="px-6 py-4">
                     <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        tx.type === 'Buy' ? 'bg-accent-green/10 text-accent-green' :
                        tx.type === 'Sell' ? 'bg-accent-red/10 text-accent-red' :
                        'bg-primary/10 text-primary'
                     }`}>
                        {tx.type}
                     </span>
                  </td>
                  <td className="px-6 py-4 text-black dark:text-white font-medium">{tx.instrument}</td>
                  <td className="px-6 py-4">{tx.type}</td>
                  <td className="px-6 py-4 text-right font-mono">{tx.amount.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right font-mono">${tx.price.toFixed(2)}</td>
                  <td className="px-6 py-4 text-right font-mono text-black dark:text-white">${tx.total.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right font-mono text-black/50 dark:text-white/50">{tx.fees.toFixed(2)}</td>
                  <td className="px-6 py-4 font-mono">{tx.currency}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredTransactions.length === 0 ? (
            <div className="p-8 text-center text-black/40 dark:text-white/40">
               No transactions found matching your filters.
            </div>
        ) : (
           <div className="px-6 py-4 border-t border-black/10 dark:border-white/10 text-xs text-black/40 dark:text-white/40">
              Showing {filteredTransactions.length} of {transactions.length} transactions
           </div>
        )}
      </div>
    </div>
  );
};

export default Transactions;