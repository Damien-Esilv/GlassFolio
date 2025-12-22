import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import { Upload, FileText, AlertCircle, CheckCircle, X, ArrowRight, Trash2, AlertTriangle } from 'lucide-react';
import { useData } from '../context/DataContext';
import { Transaction } from '../types';

interface ParsedData {
  headers: string[];
  rows: string[][];
}

interface MappingState {
  date: string;
  type: string;
  symbol: string;
  amount: string;
  price: string;
  bank?: string;
  account?: string;
}

interface ProcessedTransaction {
  id: string; // Temporary ID for the wizard
  originalRow: string[];
  formatted: any;
  status: 'valid' | 'error' | 'duplicate';
  resolution?: 'skip' | 'add'; // Action for duplicates
  message?: string;
}

const ImportWizard: React.FC = () => {
  const navigate = useNavigate();
  const { transactions: existingTransactions, addTransactions } = useData();
  
  const [step, setStep] = useState(1);
  const [source, setSource] = useState('');
  const [file, setFile] = useState<File | null>(null);
  
  // Data State
  const [parsedData, setParsedData] = useState<ParsedData>({ headers: [], rows: [] });
  const [mapping, setMapping] = useState<MappingState>({
    date: '', type: '', symbol: '', amount: '', price: '', bank: '', account: ''
  });
  const [processedData, setProcessedData] = useState<ProcessedTransaction[]>([]);

  const handleBack = () => setStep(prev => Math.max(prev - 1, 1));

  // --- Helpers ---
  
  const parseCSV = (text: string): ParsedData => {
    const lines = text.split(/\r\n|\n/).filter(line => line.trim() !== '');
    if (lines.length < 2) return { headers: [], rows: [] };

    const firstLine = lines[0];
    
    // Detect delimiter
    const delimiters = [',', ';', '\t', '|'];
    let detectedDelimiter = ',';
    let maxCount = 0;

    delimiters.forEach(d => {
       const count = firstLine.split(d).length - 1;
       if (count > maxCount) {
          maxCount = count;
          detectedDelimiter = d;
       }
    });

    const splitLine = (line: string) => {
      const result = [];
      let current = '';
      let inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuote = !inQuote;
        } else if (char === detectedDelimiter && !inQuote) {
          result.push(current.trim().replace(/^"|"$/g, '')); 
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim().replace(/^"|"$/g, ''));
      return result;
    };

    const headers = splitLine(lines[0]);
    const rows = lines.slice(1).map(splitLine);
    
    return { headers, rows };
  };

  // Auto-detect mapping
  useEffect(() => {
    if (parsedData.headers.length > 0) {
      const newMapping = { ...mapping };
      const lowerHeaders = parsedData.headers.map(h => h.toLowerCase());
      
      lowerHeaders.forEach((h, i) => {
        const header = parsedData.headers[i];
        if (h.includes('date') || h.includes('time')) newMapping.date = header;
        else if (h.includes('type') || h.includes('side') || h.includes('action')) newMapping.type = header;
        else if (h.includes('symbol') || h.includes('ticker') || h.includes('asset')) newMapping.symbol = header;
        else if (h.includes('amount') || h.includes('qty') || h.includes('quantité')) newMapping.amount = header;
        else if (h.includes('price') || h.includes('prix') || h.includes('unit')) newMapping.price = header;
        else if (h.includes('bank') || h.includes('banque')) newMapping.bank = header;
        else if (h.includes('account') || h.includes('compte') || h.includes('livret')) newMapping.account = header;
      });
      setMapping(newMapping);
    }
  }, [parsedData]);

  // Normalize Transaction Type
  const normalizeType = (raw: string): 'Buy' | 'Sell' | 'Deposit' | 'Withdrawal' => {
     if (!raw) return 'Buy';
     const lower = raw.toLowerCase();
     if (lower.includes('buy') || lower.includes('achat')) return 'Buy';
     if (lower.includes('sell') || lower.includes('vente')) return 'Sell';
     if (lower.includes('deposit') || lower.includes('dépôt') || lower.includes('virement reçu')) return 'Deposit';
     if (lower.includes('withdrawal') || lower.includes('retrait') || lower.includes('virement émis')) return 'Withdrawal';
     return 'Buy'; 
  };

  // Analyze Data (Step 3 -> 4)
  const analyzeData = () => {
    const dateIdx = parsedData.headers.indexOf(mapping.date);
    const typeIdx = parsedData.headers.indexOf(mapping.type);
    const symbolIdx = parsedData.headers.indexOf(mapping.symbol);
    const amountIdx = parsedData.headers.indexOf(mapping.amount);
    const priceIdx = parsedData.headers.indexOf(mapping.price);
    const bankIdx = mapping.bank ? parsedData.headers.indexOf(mapping.bank) : -1;
    const accountIdx = mapping.account ? parsedData.headers.indexOf(mapping.account) : -1;

    const results: ProcessedTransaction[] = parsedData.rows.map((row, idx) => {
      const rawDate = row[dateIdx];
      const rawType = row[typeIdx];
      const rawSymbol = row[symbolIdx];
      const rawAmount = row[amountIdx];
      const rawPrice = row[priceIdx];
      // Handle potentially undefined mappings or values
      const rawBank = bankIdx >= 0 && bankIdx < row.length ? row[bankIdx] : undefined;
      const rawAccount = accountIdx >= 0 && accountIdx < row.length ? row[accountIdx] : undefined;

      if (!rawDate || !rawType || !rawSymbol) {
        return { 
            id: `row-${idx}`,
            originalRow: row, 
            formatted: {}, 
            status: 'error', 
            message: 'Missing required fields' 
        };
      }

      const formattedDate = rawDate.replace('T', ' ').substring(0, 19);
      const formattedType = normalizeType(rawType);
      const formattedAmount = parseFloat(rawAmount?.replace(',', '.') || '0');
      const formattedPrice = parseFloat(rawPrice?.replace(',', '.') || '0');

      const isDuplicate = existingTransactions.some(t => {
         const dbDate = t.date.substring(0, 10);
         const importDate = formattedDate.substring(0, 10);
         return t.symbol === rawSymbol && 
                t.type === formattedType &&
                (dbDate === importDate && Math.abs(t.amount - formattedAmount) < 0.0001);
      });

      return {
        id: `row-${idx}`,
        originalRow: row,
        formatted: { 
           date: formattedDate, 
           type: formattedType, 
           symbol: rawSymbol, 
           amount: formattedAmount, 
           price: formattedPrice,
           total: formattedAmount * formattedPrice,
           currency: 'USD',
           source: source,
           status: 'Completed',
           bankName: rawBank,
           accountName: rawAccount
        },
        status: isDuplicate ? 'duplicate' : 'valid',
        resolution: isDuplicate ? 'skip' : undefined,
        message: isDuplicate ? 'Potential duplicate detected' : undefined
      };
    });

    setProcessedData(results);
    setStep(4);
  };

  // Live Preview for Step 3
  const LivePreview = () => {
    if (parsedData.rows.length === 0) return null;
    const previewRows = parsedData.rows.slice(0, 3);
    
    // Helper to get mapped value
    const getValue = (row: string[], field: string) => {
        const header = mapping[field as keyof MappingState];
        if (!header) return <span className="text-slate-600 italic">Not Mapped</span>;
        const idx = parsedData.headers.indexOf(header);
        if (idx === -1 || !row[idx]) return <span className="text-slate-600">-</span>;
        return <span className="text-white font-mono text-xs">{row[idx]}</span>;
    };

    return (
        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden mt-8">
            <div className="px-4 py-3 border-b border-slate-700 bg-slate-800/50">
                <h3 className="text-sm font-bold text-white">Live Data Preview</h3>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-slate-800 text-xs uppercase text-slate-400">
                        <tr>
                            <th className="px-4 py-2">Date</th>
                            <th className="px-4 py-2">Type</th>
                            <th className="px-4 py-2">Symbol</th>
                            <th className="px-4 py-2 text-right">Amount</th>
                            <th className="px-4 py-2 text-right">Price</th>
                            <th className="px-4 py-2">Bank</th>
                            <th className="px-4 py-2">Account</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {previewRows.map((row, idx) => (
                            <tr key={idx}>
                                <td className="px-4 py-2">{getValue(row, 'date')}</td>
                                <td className="px-4 py-2">{getValue(row, 'type')}</td>
                                <td className="px-4 py-2">{getValue(row, 'symbol')}</td>
                                <td className="px-4 py-2 text-right">{getValue(row, 'amount')}</td>
                                <td className="px-4 py-2 text-right">{getValue(row, 'price')}</td>
                                <td className="px-4 py-2">{getValue(row, 'bank')}</td>
                                <td className="px-4 py-2">{getValue(row, 'account')}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
  };

  // Step 3: Mapping
  const Step3 = () => (
    <div className="max-w-4xl mx-auto space-y-8">
       <div>
          <h2 className="text-xl font-semibold text-white mb-4">Map Columns</h2>
          <p className="text-slate-400 text-sm mb-6">Select the corresponding columns from your CSV file.</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
             {['Date', 'Type', 'Symbol', 'Amount', 'Price', 'Bank', 'Account'].map((field) => (
                <div key={field} className="space-y-1">
                   <label className="block text-xs font-bold text-slate-500 uppercase">{field}</label>
                   <select 
                     value={mapping[field.toLowerCase() as keyof MappingState]} 
                     onChange={(e) => setMapping({...mapping, [field.toLowerCase()]: e.target.value})}
                     className="w-full bg-slate-800 border border-slate-600 text-white text-sm rounded-lg p-2 focus:ring-blue-500 focus:border-blue-500"
                   >
                      <option value="">{field === 'Bank' || field === 'Account' ? 'Optional' : 'Select...'}</option>
                      {parsedData.headers.map(h => (
                         <option key={h} value={h}>{h}</option>
                      ))}
                   </select>
                </div>
             ))}
          </div>

          <LivePreview />
       </div>
    </div>
  );

  const toggleDuplicateResolution = (id: string, action: 'skip' | 'add') => {
      setProcessedData(prev => prev.map(item => {
          if (item.id === id && item.status === 'duplicate') return { ...item, resolution: action };
          return item;
      }));
  };

  const removeRow = (id: string) => {
      setProcessedData(prev => prev.filter(item => item.id !== id));
  };

  const bulkResolveDuplicates = (action: 'skip' | 'add') => {
      setProcessedData(prev => prev.map(item => {
          if (item.status === 'duplicate') return { ...item, resolution: action };
          return item;
      }));
  };

  const finalizeImport = () => {
     const txsToImport = processedData
        .filter(d => d.status === 'valid' || (d.status === 'duplicate' && d.resolution === 'add'))
        .map(d => ({
           id: Math.random().toString(36).substr(2, 9),
           ...d.formatted,
           fees: 0,
           assetClass: ['BTC', 'ETH', 'SOL', 'USDT'].some(c => d.formatted.symbol?.includes(c)) ? 'Crypto' : d.formatted.type === 'Deposit' ? 'Cash' : 'Equity'
        } as Transaction));
     
     addTransactions(txsToImport);
     setStep(5);
  };

  const Step1 = () => (
    <div className="space-y-8">
       <div className="text-center"><h2 className="text-xl font-semibold text-white mb-6">Select Source</h2></div>
       <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
          {['Boursobank', 'Binance', 'Bitget', 'Custom CSV'].map(s => (
             <button key={s} onClick={() => { setSource(s); setStep(2); }} className={`p-8 rounded-2xl border-2 transition-all text-lg font-medium bg-slate-800 border-slate-700 hover:border-blue-500 hover:bg-slate-750 text-slate-300 hover:text-white`}>{s}</button>
          ))}
       </div>
    </div>
  );

  const Step2 = () => (
    <div className="max-w-2xl mx-auto space-y-6">
       <div className="text-center"><h2 className="text-xl font-semibold text-white mb-2">Upload Files from {source}</h2></div>
       <label className="border-2 border-dashed border-slate-700 rounded-3xl p-12 flex flex-col items-center justify-center text-center hover:border-blue-500 transition-colors cursor-pointer bg-slate-800/50 group">
          <Upload className="text-slate-400 group-hover:text-blue-500 mb-4" size={32} />
          <h3 className="text-lg font-medium text-white mb-2">Drop your CSV file here</h3>
          <input type="file" accept=".csv" className="hidden" onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} onChange={(e) => { 
               if(e.target.files && e.target.files[0]) {
                 setFile(e.target.files[0]);
                 const reader = new FileReader();
                 reader.onload = (evt) => {
                    const text = evt.target?.result as string;
                    setParsedData(parseCSV(text));
                    setTimeout(() => setStep(3), 500);
                 };
                 reader.readAsText(e.target.files[0]);
               } 
            }} 
          />
       </label>
    </div>
  );

  const Step4 = () => {
    const valid = processedData.filter(d => d.status === 'valid');
    const duplicates = processedData.filter(d => d.status === 'duplicate');
    const errors = processedData.filter(d => d.status === 'error');
    
    const toImportCount = valid.length + duplicates.filter(d => d.resolution === 'add').length;

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold text-white">Review & Import</h2>
                <div className="bg-blue-600/20 text-blue-400 px-4 py-2 rounded-lg font-bold">
                    {toImportCount} Ready to Import
                </div>
            </div>

            {/* Detailed Table */}
            <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden max-h-[500px] overflow-y-auto">
                <table className="w-full text-left text-sm text-slate-400">
                    <thead className="bg-slate-800 text-xs uppercase font-bold text-white sticky top-0 z-10">
                        <tr>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Date</th>
                            <th className="px-4 py-3">Type</th>
                            <th className="px-4 py-3">Asset / Bank</th>
                            <th className="px-4 py-3 text-right">Amount</th>
                            <th className="px-4 py-3 text-right">Price</th>
                            <th className="px-4 py-3">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {processedData.map((item) => {
                            const isCash = item.formatted?.type === 'Deposit' || item.formatted?.type === 'Withdrawal';
                            return (
                            <tr key={item.id} className="hover:bg-slate-800/50">
                                <td className="px-4 py-3">
                                    {item.status === 'valid' && <span className="text-emerald-500 flex items-center gap-1"><CheckCircle size={14} /> Valid</span>}
                                    {item.status === 'duplicate' && <span className="text-yellow-500 flex items-center gap-1"><AlertTriangle size={14} /> Duplicate</span>}
                                    {item.status === 'error' && <span className="text-rose-500 flex items-center gap-1"><AlertCircle size={14} /> Error</span>}
                                </td>
                                <td className="px-4 py-3 text-white">{item.formatted?.date}</td>
                                <td className="px-4 py-3">{item.formatted?.type}</td>
                                <td className="px-4 py-3">
                                    <div className="flex flex-col">
                                        <span className="text-white font-bold">{item.formatted?.symbol}</span>
                                        {isCash && item.formatted?.bankName && (
                                            <span className="text-xs text-slate-500">{item.formatted?.bankName} - {item.formatted?.accountName}</span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-right text-white font-mono">{item.formatted?.amount}</td>
                                <td className="px-4 py-3 text-right font-mono">{item.formatted?.price}</td>
                                <td className="px-4 py-3">
                                    {item.status === 'duplicate' && (
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={() => toggleDuplicateResolution(item.id, 'add')}
                                                className={`text-xs px-2 py-1 rounded border ${item.resolution === 'add' ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-600 hover:border-blue-500'}`}
                                            >
                                                Import
                                            </button>
                                            <button 
                                                onClick={() => toggleDuplicateResolution(item.id, 'skip')}
                                                className={`text-xs px-2 py-1 rounded border ${item.resolution === 'skip' ? 'bg-slate-700 border-slate-700 text-white' : 'border-slate-600 hover:border-slate-500'}`}
                                            >
                                                Skip
                                            </button>
                                        </div>
                                    )}
                                    {item.status === 'error' && (
                                        <button onClick={() => removeRow(item.id)} className="text-rose-500 hover:text-rose-400"><Trash2 size={16} /></button>
                                    )}
                                </td>
                            </tr>
                        )})}
                    </tbody>
                </table>
            </div>
            
            {duplicates.length > 0 && (
                <div className="flex gap-4">
                    <button onClick={() => bulkResolveDuplicates('skip')} className="text-xs text-slate-400 hover:text-white underline">Skip all duplicates</button>
                    <button onClick={() => bulkResolveDuplicates('add')} className="text-xs text-slate-400 hover:text-white underline">Import all duplicates</button>
                </div>
            )}
        </div>
    )
  };

  const Step5 = () => (
    <div className="max-w-3xl mx-auto space-y-8 text-center">
       <CheckCircle size={48} className="text-emerald-500 mx-auto" />
       <h2 className="text-2xl font-bold text-white">Import Complete</h2>
       <Link to="/"><Button>Go to Dashboard</Button></Link>
    </div>
  );

  return (
    <div className="py-8">
      <div className="flex justify-between items-center mb-12">
         <h1 className="text-3xl font-bold text-white">Import Transactions</h1>
         <span className="text-slate-400">Step {step} of 5</span>
      </div>
      <div className="min-h-[400px] animate-fade-in">
         {step === 1 && <Step1 />}
         {step === 2 && <Step2 />}
         {step === 3 && <Step3 />}
         {step === 4 && <Step4 />}
         {step === 5 && <Step5 />}
      </div>
      {step > 1 && step < 5 && (
        <div className="flex justify-between mt-12 pt-8 border-t border-slate-800">
           <Button variant="secondary" size="lg" onClick={handleBack}>Back</Button>
           {step === 3 && <Button size="lg" onClick={analyzeData} disabled={!mapping.date || !mapping.symbol}>Analyze Data</Button>}
           {step === 4 && <Button size="lg" onClick={finalizeImport}>Finalize Import</Button>}
        </div>
      )}
    </div>
  );
};

export default ImportWizard;