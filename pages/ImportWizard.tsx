import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import { Upload, FileText, AlertCircle, CheckCircle, X, ArrowRight, Trash2, AlertTriangle, Wallet, TrendingUp } from 'lucide-react';
import { useData } from '../context/DataContext';
import { Transaction } from '../types';
import { useImportLogic, ImportType, MappingState } from '../hooks/importHooks';
import { parseCSV } from '../utils/csvUtils';

const ImportWizard: React.FC = () => {
  const navigate = useNavigate();
  const { addTransactions, isLoading: isContextLoading } = useData();
  const [isSaving, setIsSaving] = useState(false);

  const {
    step, setStep,
    source, setSource,
    file, setFile,
    importType, setImportType,
    parsedData, setParsedData,
    mapping, setMapping,
    processedData, setProcessedData,
    analyzeData,
    isAnalyzing
  } = useImportLogic();

  const handleBack = () => setStep(prev => Math.max(prev - 1, 1));

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
                {importType === 'Investment' && <th className="px-4 py-2">Symbol</th>}
                <th className="px-4 py-2 text-right">Amount</th>
                {importType === 'Investment' && <th className="px-4 py-2 text-right">Price</th>}
                {importType === 'Cash' && <th className="px-4 py-2">Bank</th>}
                {importType === 'Cash' && <th className="px-4 py-2">Account</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {previewRows.map((row, idx) => (
                <tr key={idx}>
                  <td className="px-4 py-2">{getValue(row, 'date')}</td>
                  <td className="px-4 py-2">{getValue(row, 'type')}</td>
                  {importType === 'Investment' && <td className="px-4 py-2">{getValue(row, 'symbol')}</td>}
                  <td className="px-4 py-2 text-right">{getValue(row, 'amount')}</td>
                  {importType === 'Investment' && <td className="px-4 py-2 text-right">{getValue(row, 'price')}</td>}
                  {importType === 'Cash' && <td className="px-4 py-2">{getValue(row, 'bank')}</td>}
                  {importType === 'Cash' && <td className="px-4 py-2">{getValue(row, 'account')}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Step 3: Mapping
  const Step3 = () => {
    const fields = importType === 'Investment'
      ? ['Date', 'Type', 'Symbol', 'Amount', 'Price']
      : ['Date', 'Type', 'Amount', 'Bank', 'Account'];

    return (
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-xl font-semibold text-white mb-1">Map Columns & Settings</h2>
              <p className="text-slate-400 text-sm">Select import type and map columns.</p>
            </div>

            {/* Import Type Toggle */}
            <div className="bg-slate-800 p-1 rounded-lg flex">
              <button
                onClick={() => setImportType('Investment')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${importType === 'Investment' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                <TrendingUp size={16} className="inline mr-2" />
                Investment
              </button>
              <button
                onClick={() => setImportType('Cash')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${importType === 'Cash' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                <Wallet size={16} className="inline mr-2" />
                Cash
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {fields.map((field) => (
              <div key={field} className="space-y-1">
                <label className="block text-xs font-bold text-slate-500 uppercase">{field}</label>
                <select
                  value={mapping[field.toLowerCase() as keyof MappingState]}
                  onChange={(e) => setMapping({ ...mapping, [field.toLowerCase()]: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-600 text-white text-sm rounded-lg p-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">{field === 'Bank' || field === 'Account' ? 'Optional (Not Mapped)' : 'Select Column...'}</option>
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
  };

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

  const finalizeImport = async () => {
    setIsSaving(true);
    try {
      const txsToImport = processedData
        .filter(d => d.status === 'valid' || (d.status === 'duplicate' && d.resolution === 'add'))
        .map(d => ({
          id: Math.random().toString(36).substr(2, 9),
          ...d.formatted,
          fees: 0,
          assetClass: importType === 'Cash' ? 'Cash' : (['BTC', 'ETH', 'SOL', 'USDT'].some(c => d.formatted.symbol?.includes(c)) ? 'Crypto' : 'Equity')
        } as Transaction));

      await addTransactions(txsToImport);
      setStep(5);
    } catch (e) {
      console.error("Failed to save", e);
    } finally {
      setIsSaving(false);
    }
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
          if (e.target.files && e.target.files[0]) {
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
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h2 className="text-xl font-bold text-white mb-4">Validation & Analysis</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-6">
              <span className="text-xs font-bold text-slate-500 uppercase">Total Valid</span>
              <div className="text-3xl font-bold text-emerald-500 mt-2">{valid.length}</div>
            </div>
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-6">
              <span className="text-xs font-bold text-slate-500 uppercase">Duplicates</span>
              <div className="text-3xl font-bold text-yellow-500 mt-2">{duplicates.length}</div>
            </div>
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-6">
              <span className="text-xs font-bold text-slate-500 uppercase">Ready to Import</span>
              <div className="text-3xl font-bold text-blue-500 mt-2">{toImportCount}</div>
            </div>
          </div>

          {duplicates.length > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 mb-6 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <AlertTriangle className="text-yellow-500" size={20} />
                <span className="text-yellow-500 font-medium">{duplicates.length} Duplicate(s) Detected</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => bulkResolveDuplicates('skip')}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg transition-colors"
                >
                  Ignore All
                </button>
                <button
                  onClick={() => bulkResolveDuplicates('add')}
                  className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Force Add All
                </button>
              </div>
            </div>
          )}
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
                {importType === 'Investment' && <th className="px-4 py-3 text-right">Price</th>}
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {processedData.map((item) => {
                const isCash = item.formatted?.assetClass === 'Cash';
                return (
                  <tr key={item.id} className="hover:bg-slate-800/50">
                    <td className="px-4 py-3">
                      {item.status === 'valid' && <span className="text-emerald-500 flex items-center gap-1"><CheckCircle size={14} /> Valid</span>}
                      {item.status === 'duplicate' && (
                        item.resolution === 'skip' ?
                          <span className="text-slate-500 flex items-center gap-1"><span className="bg-slate-700 text-xs px-1 rounded">IGNORED</span> Duplicate</span> :
                          <span className="text-yellow-500 flex items-center gap-1"><AlertTriangle size={14} /> Duplicate</span>
                      )}
                      {item.status === 'error' && <span className="text-rose-500 flex items-center gap-1"><AlertCircle size={14} /> Error</span>}
                    </td>
                    <td className="px-4 py-3 text-white">{item.formatted?.date}</td>
                    <td className="px-4 py-3">{item.formatted?.type}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-white font-bold">{item.formatted?.symbol}</span>
                        {isCash && (item.formatted?.bankName || item.formatted?.accountName) && (
                          <span className="text-xs text-slate-500">{item.formatted?.bankName} {item.formatted?.accountName ? `- ${item.formatted.accountName}` : ''}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-white font-mono">{item.formatted?.amount}</td>
                    {importType === 'Investment' && <td className="px-4 py-3 text-right font-mono">{item.formatted?.price}</td>}
                    <td className="px-4 py-3 text-right">
                      {item.status === 'duplicate' && (
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => toggleDuplicateResolution(item.id, 'add')}
                            className={`text-xs px-2 py-1 rounded border ${item.resolution === 'add' ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-600 hover:border-blue-500'}`}
                          >
                            Force Add
                          </button>
                          <button
                            onClick={() => toggleDuplicateResolution(item.id, 'skip')}
                            className={`text-xs px-2 py-1 rounded border ${item.resolution === 'skip' ? 'bg-slate-700 border-slate-700 text-white' : 'border-slate-600 hover:border-slate-500'}`}
                          >
                            Ignore
                          </button>
                          <button onClick={() => removeRow(item.id)} className="text-slate-500 hover:text-rose-500"><Trash2 size={16} /></button>
                        </div>
                      )}
                      {item.status === 'error' && (
                        <button onClick={() => removeRow(item.id)} className="text-rose-500 hover:text-rose-400"><Trash2 size={16} /></button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  };

  const Step5 = () => (
    <div className="max-w-3xl mx-auto space-y-8 text-center">
      <CheckCircle size={48} className="text-emerald-500 mx-auto" />
      <h2 className="text-2xl font-bold text-white">Import Complete</h2>
      <p className="text-slate-400">Your transactions have been successfully added to your portfolio.</p>
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
          {step === 3 && (
            <Button size="lg" onClick={analyzeData} disabled={!mapping.date || (importType === 'Investment' && !mapping.symbol) || isAnalyzing}>
              {isAnalyzing ? 'Analyzing...' : 'Analyze Data'}
            </Button>
          )}
          {step === 4 && (
            <Button size="lg" onClick={finalizeImport} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Finalize Import'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default ImportWizard;