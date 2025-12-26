/**
 * Universal Import Wizard
 * 
 * 5-step flow for importing financial data:
 * 1. Context Selection (Institute → Account → Mode)
 * 2. File Upload
 * 3. Column Mapping
 * 4. Staging Area (Validation & Editing)
 * 5. Completion
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/Button';
import {
  Upload,
  FileText,
  AlertCircle,
  CheckCircle,
  X,
  ArrowRight,
  Trash2,
  AlertTriangle,
  Building2,
  Wallet,
  History,
  Camera,
  Plus,
  Download,
  Save,
  ChevronDown,
  Edit3,
  Check
} from 'lucide-react';
import { useImportWizard, MAPPABLE_FIELDS, WizardStep } from '../hooks/importHooks';
import { InstituteType, AccountType } from '../src/types';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const ImportWizard: React.FC = () => {
  const wizard = useImportWizard();

  return (
    <div className="py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Import Transactions</h1>
          <p className="text-slate-400 mt-1">
            {wizard.step === 1 && 'Select where to import your data'}
            {wizard.step === 2 && 'Upload your CSV file'}
            {wizard.step === 3 && 'Map columns to database fields'}
            {wizard.step === 4 && 'Review and validate data'}
            {wizard.step === 5 && 'Import complete!'}
          </p>
        </div>
        <StepIndicator currentStep={wizard.step} />
      </div>

      {/* Error Banner */}
      {wizard.error && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 mb-6 flex items-center gap-3">
          <AlertCircle className="text-rose-500" size={20} />
          <span className="text-rose-400">{wizard.error}</span>
          <button onClick={() => wizard.goToStep(wizard.step)} className="ml-auto text-slate-400 hover:text-white">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Loading Overlay */}
      {wizard.isLoading && (
        <div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white">Processing...</p>
          </div>
        </div>
      )}

      {/* Step Content */}
      <div className="min-h-[450px] animate-fade-in">
        {wizard.step === 1 && <Step1ContextSelection wizard={wizard} />}
        {wizard.step === 2 && <Step2FileUpload wizard={wizard} />}
        {wizard.step === 3 && <Step3Mapping wizard={wizard} />}
        {wizard.step === 4 && <Step4StagingArea wizard={wizard} />}
        {wizard.step === 5 && <Step5Complete wizard={wizard} />}
      </div>

      {/* Navigation Footer */}
      {wizard.step > 1 && wizard.step < 5 && (
        <div className="flex justify-between mt-12 pt-8 border-t border-slate-800">
          <Button variant="secondary" size="lg" onClick={wizard.goBack}>
            Back
          </Button>

          {wizard.step === 3 && (
            <Button
              size="lg"
              onClick={wizard.analyzeData}
              disabled={!wizard.isValidMappingForAnalysis}
            >
              Analyze Data <ArrowRight size={18} className="ml-2" />
            </Button>
          )}

          {wizard.step === 4 && (
            <Button
              size="lg"
              onClick={wizard.finalizeImport}
              disabled={wizard.importableTxCount === 0}
            >
              Import {wizard.importableTxCount} Transactions
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// STEP INDICATOR
// ============================================================================

const StepIndicator: React.FC<{ currentStep: WizardStep }> = ({ currentStep }) => {
  const steps = [
    { num: 1, label: 'Context' },
    { num: 2, label: 'Upload' },
    { num: 3, label: 'Mapping' },
    { num: 4, label: 'Review' },
    { num: 5, label: 'Done' }
  ];

  return (
    <div className="flex items-center gap-2">
      {steps.map((step, idx) => (
        <React.Fragment key={step.num}>
          <div className={`
            w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
            ${currentStep === step.num ? 'bg-blue-600 text-white' :
              currentStep > step.num ? 'bg-emerald-600 text-white' :
                'bg-slate-700 text-slate-400'}
          `}>
            {currentStep > step.num ? <Check size={14} /> : step.num}
          </div>
          {idx < steps.length - 1 && (
            <div className={`w-8 h-0.5 ${currentStep > step.num ? 'bg-emerald-600' : 'bg-slate-700'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

// ============================================================================
// STEP 1: CONTEXT SELECTION
// ============================================================================

const Step1ContextSelection: React.FC<{ wizard: ReturnType<typeof useImportWizard> }> = ({ wizard }) => {
  const [showNewInstitute, setShowNewInstitute] = useState(false);
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [newInstituteName, setNewInstituteName] = useState('');
  const [newInstituteType, setNewInstituteType] = useState<InstituteType>('bank');
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountType, setNewAccountType] = useState<AccountType>('checking');
  const [newAccountCurrency, setNewAccountCurrency] = useState('EUR');

  const handleCreateInstitute = async () => {
    if (!newInstituteName.trim()) return;
    await wizard.createInstitute(newInstituteName.trim(), newInstituteType);
    setShowNewInstitute(false);
    setNewInstituteName('');
  };

  const handleCreateAccount = async () => {
    if (!newAccountName.trim()) return;
    await wizard.createAccount(newAccountName.trim(), newAccountType, newAccountCurrency);
    setShowNewAccount(false);
    setNewAccountName('');
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Institute Selection */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <Building2 className="text-blue-500" size={24} />
          <h2 className="text-lg font-bold text-white">1. Select Institution</h2>
        </div>

        {!showNewInstitute ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {wizard.institutes.map(inst => (
                <button
                  key={inst.id}
                  onClick={() => wizard.selectInstitute(inst.id)}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${wizard.selectedInstituteId === inst.id
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-slate-700 bg-slate-800 hover:border-slate-600'
                    }`}
                >
                  <span className="text-white font-medium">{inst.name}</span>
                  <span className="block text-xs text-slate-500 mt-1 capitalize">{inst.type}</span>
                </button>
              ))}

              <button
                onClick={() => setShowNewInstitute(true)}
                className="p-4 rounded-xl border-2 border-dashed border-slate-600 hover:border-blue-500 transition-all flex flex-col items-center justify-center text-slate-400 hover:text-blue-400"
              >
                <Plus size={24} />
                <span className="text-sm mt-1">New</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <input
              type="text"
              value={newInstituteName}
              onChange={e => setNewInstituteName(e.target.value)}
              placeholder="Institution name..."
              className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg p-3 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
            <select
              value={newInstituteType}
              onChange={e => setNewInstituteType(e.target.value as InstituteType)}
              className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg p-3"
            >
              <option value="bank">Bank</option>
              <option value="broker">Broker</option>
              <option value="exchange">Crypto Exchange</option>
              <option value="wallet">Wallet</option>
              <option value="other">Other</option>
            </select>
            <div className="flex gap-2">
              <Button onClick={handleCreateInstitute} disabled={!newInstituteName.trim()}>
                Create
              </Button>
              <Button variant="secondary" onClick={() => setShowNewInstitute(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Account Selection */}
      {wizard.selectedInstituteId && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 animate-fade-in">
          <div className="flex items-center gap-3 mb-4">
            <Wallet className="text-emerald-500" size={24} />
            <h2 className="text-lg font-bold text-white">2. Select Account</h2>
          </div>

          {!showNewAccount ? (
            <div className="space-y-4">
              {wizard.accounts.length === 0 ? (
                <p className="text-slate-400 text-sm">No accounts found. Create one to continue.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {wizard.accounts.map(acc => (
                    <button
                      key={acc.id}
                      onClick={() => wizard.selectAccount(acc.id)}
                      className={`p-4 rounded-xl border-2 transition-all text-left ${wizard.selectedAccountId === acc.id
                          ? 'border-emerald-500 bg-emerald-500/10'
                          : 'border-slate-700 bg-slate-800 hover:border-slate-600'
                        }`}
                    >
                      <span className="text-white font-medium">{acc.name}</span>
                      <span className="block text-xs text-slate-500 mt-1">{acc.defaultCurrency} · {acc.type}</span>
                    </button>
                  ))}
                </div>
              )}

              <button
                onClick={() => setShowNewAccount(true)}
                className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm"
              >
                <Plus size={16} /> Create new account
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <input
                type="text"
                value={newAccountName}
                onChange={e => setNewAccountName(e.target.value)}
                placeholder="Account name..."
                className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg p-3 focus:border-blue-500"
                autoFocus
              />
              <div className="grid grid-cols-2 gap-4">
                <select
                  value={newAccountType}
                  onChange={e => setNewAccountType(e.target.value as AccountType)}
                  className="bg-slate-800 border border-slate-600 text-white rounded-lg p-3"
                >
                  <option value="checking">Checking</option>
                  <option value="savings">Savings</option>
                  <option value="investment">Investment (PEA, CTO)</option>
                  <option value="crypto_spot">Crypto Spot</option>
                  <option value="crypto_earn">Crypto Earn</option>
                  <option value="other">Other</option>
                </select>
                <select
                  value={newAccountCurrency}
                  onChange={e => setNewAccountCurrency(e.target.value)}
                  className="bg-slate-800 border border-slate-600 text-white rounded-lg p-3"
                >
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                  <option value="USDT">USDT</option>
                  <option value="BTC">BTC</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCreateAccount} disabled={!newAccountName.trim()}>
                  Create
                </Button>
                <Button variant="secondary" onClick={() => setShowNewAccount(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Import Mode */}
      {wizard.selectedAccountId && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 animate-fade-in">
          <div className="flex items-center gap-3 mb-4">
            <FileText className="text-purple-500" size={24} />
            <h2 className="text-lg font-bold text-white">3. Import Mode</h2>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => wizard.setImportMode('history')}
              className={`p-6 rounded-xl border-2 transition-all text-left ${wizard.importMode === 'history'
                  ? 'border-purple-500 bg-purple-500/10'
                  : 'border-slate-700 bg-slate-800 hover:border-slate-600'
                }`}
            >
              <History className={wizard.importMode === 'history' ? 'text-purple-400' : 'text-slate-400'} size={28} />
              <div className="mt-3">
                <span className="text-white font-bold">Transaction History</span>
                <p className="text-slate-400 text-sm mt-1">Import buy/sell transactions with dates and prices</p>
              </div>
            </button>

            <button
              onClick={() => wizard.setImportMode('snapshot')}
              className={`p-6 rounded-xl border-2 transition-all text-left ${wizard.importMode === 'snapshot'
                  ? 'border-purple-500 bg-purple-500/10'
                  : 'border-slate-700 bg-slate-800 hover:border-slate-600'
                }`}
            >
              <Camera className={wizard.importMode === 'snapshot' ? 'text-purple-400' : 'text-slate-400'} size={28} />
              <div className="mt-3">
                <span className="text-white font-bold">Position Snapshot</span>
                <p className="text-slate-400 text-sm mt-1">Import current holdings with average prices</p>
              </div>
            </button>
          </div>

          {wizard.importMode === 'snapshot' && (
            <div className="mt-4 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-amber-400 text-sm">
              <AlertTriangle size={16} className="inline mr-2" />
              Snapshot mode creates synthetic BUY transactions based on Quantity × Average Price
            </div>
          )}

          {/* Continue Button */}
          <div className="mt-6 flex justify-end">
            <Button
              size="lg"
              onClick={() => wizard.goToStep(2)}
              disabled={!wizard.canProceedFromStep1}
            >
              Continue <ArrowRight size={18} className="ml-2" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// STEP 2: FILE UPLOAD
// ============================================================================

const Step2FileUpload: React.FC<{ wizard: ReturnType<typeof useImportWizard> }> = ({ wizard }) => {
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.csv') || file.name.endsWith('.txt'))) {
      wizard.handleFileUpload(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      wizard.handleFileUpload(file);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Context Summary */}
      <div className="bg-slate-800 rounded-xl p-4 flex items-center gap-4">
        <div className="flex-1">
          <span className="text-slate-400 text-sm">Importing to:</span>
          <div className="text-white font-medium">
            {wizard.selectedInstitute?.name} → {wizard.selectedAccount?.name}
          </div>
        </div>
        <div className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-400 text-sm font-medium">
          {wizard.importMode === 'history' ? 'History' : 'Snapshot'}
        </div>
      </div>

      {/* Drop Zone */}
      <label
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        className="border-2 border-dashed border-slate-700 rounded-3xl p-16 flex flex-col items-center justify-center text-center hover:border-blue-500 transition-colors cursor-pointer bg-slate-800/50 group"
      >
        <Upload className="text-slate-400 group-hover:text-blue-500 mb-4" size={48} />
        <h3 className="text-xl font-medium text-white mb-2">Drop your CSV file here</h3>
        <p className="text-slate-400 text-sm">or click to browse</p>
        <input
          type="file"
          accept=".csv,.txt"
          className="hidden"
          onChange={handleFileChange}
        />
      </label>

      {/* Saved Templates */}
      {wizard.mappingTemplates.length > 0 && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
          <h3 className="text-sm font-bold text-slate-400 uppercase mb-3">Saved Mapping Templates</h3>
          <div className="flex flex-wrap gap-2">
            {wizard.mappingTemplates.map(tpl => (
              <button
                key={tpl.id}
                onClick={() => wizard.applyTemplate(tpl.id)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${wizard.selectedTemplateId === tpl.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
              >
                {tpl.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// STEP 3: MAPPING
// ============================================================================

const Step3Mapping: React.FC<{ wizard: ReturnType<typeof useImportWizard> }> = ({ wizard }) => {
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');

  const handleSaveTemplate = async () => {
    if (templateName.trim()) {
      await wizard.saveAsTemplate(templateName.trim());
      setShowSaveTemplate(false);
      setTemplateName('');
    }
  };

  // Get mapped value for preview
  const getMappedValue = (row: string[], field: string): string => {
    const mapping = wizard.mappings[field as keyof typeof wizard.mappings];
    if (mapping === undefined) return '—';
    const idx = typeof mapping === 'number' ? mapping : wizard.headers.indexOf(mapping as string);
    return idx >= 0 && row[idx] ? row[idx] : '—';
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Detected Preset Banner */}
      {wizard.detectedPreset && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle className="text-emerald-500" size={20} />
          <span className="text-emerald-400">
            Detected format: <strong>{wizard.detectedPreset}</strong> — mappings applied automatically
          </span>
        </div>
      )}

      {/* Mapping Grid */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-bold text-white">Column Mapping</h2>

          {!showSaveTemplate ? (
            <button
              onClick={() => setShowSaveTemplate(true)}
              className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm"
            >
              <Save size={16} /> Save as template
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                placeholder="Template name..."
                className="bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-1.5 text-sm"
                autoFocus
              />
              <Button size="sm" onClick={handleSaveTemplate}>Save</Button>
              <button onClick={() => setShowSaveTemplate(false)} className="text-slate-400 hover:text-white">
                <X size={16} />
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {MAPPABLE_FIELDS.map(field => (
            <div key={field.key} className="space-y-1">
              <label className="flex items-center gap-1 text-xs font-bold text-slate-500 uppercase">
                {field.label}
                {field.required && <span className="text-rose-500">*</span>}
              </label>
              <select
                value={wizard.mappings[field.key as keyof typeof wizard.mappings] as string || ''}
                onChange={e => wizard.setMapping(field.key as keyof typeof wizard.mappings, e.target.value || undefined)}
                className={`w-full bg-slate-800 border text-white text-sm rounded-lg p-2.5 ${field.required && !wizard.mappings[field.key as keyof typeof wizard.mappings]
                    ? 'border-rose-500/50'
                    : 'border-slate-600'
                  } focus:ring-blue-500 focus:border-blue-500`}
              >
                <option value="">— Not mapped —</option>
                {wizard.headers.map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Live Preview */}
      {wizard.previewRows.length > 0 && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700 bg-slate-800/50">
            <h3 className="text-sm font-bold text-white">Preview (First 5 Rows)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-800 text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Asset</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2 text-right">Price</th>
                  <th className="px-4 py-2 text-right">Qty</th>
                  <th className="px-4 py-2">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {wizard.previewRows.map((row, idx) => (
                  <tr key={idx} className="text-slate-300">
                    <td className="px-4 py-2 font-mono text-xs">{getMappedValue(row, 'transactionDate')}</td>
                    <td className="px-4 py-2">{getMappedValue(row, 'type')}</td>
                    <td className="px-4 py-2 font-bold text-white">{getMappedValue(row, 'assetSymbol')}</td>
                    <td className="px-4 py-2 text-right font-mono">{getMappedValue(row, 'amountPrimary')}</td>
                    <td className="px-4 py-2 text-right font-mono">{getMappedValue(row, 'priceUnit')}</td>
                    <td className="px-4 py-2 text-right font-mono">{getMappedValue(row, 'quantity')}</td>
                    <td className="px-4 py-2 text-slate-400 truncate max-w-[200px]">{getMappedValue(row, 'rawLabel')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// STEP 4: STAGING AREA
// ============================================================================

const Step4StagingArea: React.FC<{ wizard: ReturnType<typeof useImportWizard> }> = ({ wizard }) => {
  const { stats, stagedTransactions } = wizard;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Total Rows" value={stats.total} color="blue" />
        <StatCard label="Valid" value={stats.valid} color="emerald" />
        <StatCard label="Warnings" value={stats.warnings} color="amber" />
        <StatCard label="Errors" value={stats.errors} color="rose" />
        <StatCard label="Duplicates" value={stats.duplicates} color="purple" />
      </div>

      {/* Action Bar */}
      <div className="flex flex-wrap gap-4 items-center">
        {stats.duplicates > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-sm">Duplicates:</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => wizard.bulkSetResolution('duplicate', 'skip')}
            >
              Skip All
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => wizard.bulkSetResolution('duplicate', 'import')}
            >
              Import All
            </Button>
          </div>
        )}

        {stats.errors > 0 && (
          <button
            onClick={wizard.downloadInvalidRows}
            className="flex items-center gap-2 text-amber-400 hover:text-amber-300 text-sm ml-auto"
          >
            <Download size={16} /> Download Invalid Rows
          </button>
        )}
      </div>

      {/* Staging Table */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
        <div className="max-h-[500px] overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-800 text-xs uppercase text-slate-400 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 w-24">Status</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Asset</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3">Errors</th>
                <th className="px-4 py-3 w-32 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {stagedTransactions.map(tx => (
                <StagingRow key={tx.id} tx={tx} wizard={wizard} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => {
  const colorClasses: Record<string, string> = {
    blue: 'text-blue-500',
    emerald: 'text-emerald-500',
    amber: 'text-amber-500',
    rose: 'text-rose-500',
    purple: 'text-purple-500'
  };

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
      <span className="text-xs font-bold text-slate-500 uppercase">{label}</span>
      <div className={`text-2xl font-bold mt-1 ${colorClasses[color]}`}>{value}</div>
    </div>
  );
};

const StagingRow: React.FC<{
  tx: ReturnType<typeof useImportWizard>['stagedTransactions'][0];
  wizard: ReturnType<typeof useImportWizard>;
}> = ({ tx, wizard }) => {
  const isEditing = wizard.editingRowId === tx.id;

  const statusBadge = {
    valid: { icon: CheckCircle, color: 'text-emerald-500', label: 'Valid' },
    warning: { icon: AlertTriangle, color: 'text-amber-500', label: 'Warning' },
    error: { icon: AlertCircle, color: 'text-rose-500', label: 'Error' },
    duplicate: { icon: AlertTriangle, color: 'text-purple-500', label: 'Duplicate' }
  }[tx.status];

  const StatusIcon = statusBadge.icon;

  return (
    <tr className={`hover:bg-slate-800/50 ${tx.resolution === 'skip' ? 'opacity-50' : ''}`}>
      <td className="px-4 py-3">
        <span className={`flex items-center gap-1.5 ${statusBadge.color}`}>
          <StatusIcon size={14} />
          <span className="text-xs">{statusBadge.label}</span>
        </span>
      </td>
      <td className="px-4 py-3">
        {isEditing ? (
          <input
            type="text"
            value={tx.parsed.transactionDate?.split('T')[0] || ''}
            onChange={e => wizard.updateRowField(tx.id, 'transactionDate', e.target.value)}
            className="bg-slate-800 border border-blue-500 text-white rounded px-2 py-1 text-xs w-28"
          />
        ) : (
          <span className={`font-mono text-xs ${tx.errors.some(e => e.field === 'transactionDate') ? 'text-rose-400' : 'text-white'
            }`}>
            {tx.parsed.transactionDate?.split('T')[0] || '—'}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-slate-300">{tx.parsed.type || '—'}</td>
      <td className="px-4 py-3">
        {isEditing ? (
          <input
            type="text"
            value={tx.parsed.assetSymbol || ''}
            onChange={e => wizard.updateRowField(tx.id, 'assetSymbol', e.target.value)}
            className="bg-slate-800 border border-blue-500 text-white rounded px-2 py-1 text-xs w-20"
          />
        ) : (
          <span className={`font-bold ${tx.errors.some(e => e.field === 'assetSymbol') ? 'text-rose-400' : 'text-white'
            }`}>
            {tx.parsed.assetSymbol || '—'}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        {isEditing ? (
          <input
            type="text"
            value={tx.parsed.amountPrimary || ''}
            onChange={e => wizard.updateRowField(tx.id, 'amountPrimary', e.target.value)}
            className="bg-slate-800 border border-blue-500 text-white rounded px-2 py-1 text-xs w-24 text-right"
          />
        ) : (
          <span className={`font-mono ${tx.errors.some(e => e.field === 'amountPrimary') ? 'text-rose-400' : 'text-white'
            }`}>
            {tx.parsed.amountPrimary || '—'}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right font-mono text-slate-400">
        {tx.parsed.quantity || '—'}
      </td>
      <td className="px-4 py-3">
        {tx.errors.length > 0 && (
          <span className="text-rose-400 text-xs">
            {tx.errors.map(e => e.message).join(', ')}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          {tx.status === 'error' && !isEditing && (
            <button
              onClick={() => wizard.startEditRow(tx.id)}
              className="p-1.5 text-blue-400 hover:text-blue-300"
              title="Edit row"
            >
              <Edit3 size={14} />
            </button>
          )}

          {isEditing && (
            <button
              onClick={() => wizard.cancelEditRow()}
              className="p-1.5 text-emerald-400 hover:text-emerald-300"
              title="Done editing"
            >
              <Check size={14} />
            </button>
          )}

          {tx.status === 'duplicate' && (
            <>
              <button
                onClick={() => wizard.setRowResolution(tx.id, tx.resolution === 'import' ? 'skip' : 'import')}
                className={`px-2 py-1 rounded text-xs ${tx.resolution === 'import'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
              >
                {tx.resolution === 'import' ? 'Importing' : 'Skipping'}
              </button>
            </>
          )}

          <button
            onClick={() => wizard.removeRow(tx.id)}
            className="p-1.5 text-slate-500 hover:text-rose-400"
            title="Remove row"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
};

// ============================================================================
// STEP 5: COMPLETE
// ============================================================================

const Step5Complete: React.FC<{ wizard: ReturnType<typeof useImportWizard> }> = ({ wizard }) => {
  return (
    <div className="max-w-2xl mx-auto text-center space-y-8">
      <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
        <CheckCircle className="text-emerald-500" size={48} />
      </div>

      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Import Complete!</h2>
        <p className="text-slate-400">
          Successfully imported {wizard.completedBatch?.transactionCount || 0} transactions
        </p>
      </div>

      {wizard.completedBatch && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 text-left">
          <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">Import Summary</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-400">Batch ID</dt>
              <dd className="text-white font-mono">{wizard.completedBatch.id}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Transactions</dt>
              <dd className="text-white">{wizard.completedBatch.transactionCount}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Mode</dt>
              <dd className="text-white capitalize">{wizard.completedBatch.importMode}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">File</dt>
              <dd className="text-white">{wizard.completedBatch.fileName}</dd>
            </div>
          </dl>
        </div>
      )}

      <div className="flex justify-center gap-4">
        <Link to="/">
          <Button size="lg">Go to Dashboard</Button>
        </Link>
        <Button variant="secondary" size="lg" onClick={wizard.reset}>
          Import More
        </Button>
      </div>
    </div>
  );
};

export default ImportWizard;