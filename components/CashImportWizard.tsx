/**
 * Cash Import Wizard Component
 * 
 * Specialized modular flow for updating Cash/Savings account balances.
 * Supports frictionless direct manual input and simplified CSV upload.
 */

import React, { useState } from 'react';
import Button from './Button';
import {
  Camera,
  ArrowRight,
  Plus,
  AlertTriangle,
  Upload,
  CheckCircle,
  FileText,
  Clock
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { db } from '../src/services/db';
import { computeRowHash } from '../src/services/core/transactionManager';
import { instrumentService } from '../src/services/instrumentService';
import { portfolioService } from '../src/services/portfolioService';
import { parseCSVText, parseDate, parseDecimal } from '../src/services/import/importManager';
import { UnifiedTransaction, SourceOrigin, TransactionType } from '../src/types';

interface CashImportWizardProps {
  accountId: string;
  accountName: string;
  defaultCurrency: string;
  onBack: () => void;
  onComplete: () => void;
}

const CashImportWizard: React.FC<CashImportWizardProps> = ({
  accountId,
  accountName,
  defaultCurrency,
  onBack,
  onComplete
}) => {
  const { t } = useTranslation('transactions');
  const { user } = useAuth();
  
  // Internal navigation state: 'options' | 'manual' | 'csv_upload' | 'csv_mapping' | 'success'
  const [step, setStep] = useState<'options' | 'manual' | 'csv_upload' | 'csv_mapping' | 'success'>('options');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manual input state
  const [manualDate, setManualDate] = useState(new Date().toISOString().substring(0, 10));
  const [manualAmount, setManualAmount] = useState('');

  // CSV State
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [rawCSVText, setRawCSVText] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [dateMapping, setDateMapping] = useState('');
  const [amountMapping, setAmountMapping] = useState('');
  const [completedTxCount, setCompletedTxCount] = useState(0);

  // 1. Direct manual save
  const handleSaveManual = async () => {
    if (!manualAmount || isNaN(parseFloat(manualAmount))) {
      setError(t('importWizard.errors.amountRequired'));
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const amountVal = parseDecimal(manualAmount) || '0';

      // Find or create instrument for this currency
      const instrument = await instrumentService.findOrCreateInstrument({
        symbol: defaultCurrency,
        name: defaultCurrency === 'EUR' ? 'Euro' : defaultCurrency === 'USD' ? 'US Dollar' : defaultCurrency,
      });

      const batchId = `batch-cash-${Date.now()}`;
      const rowHash = await computeRowHash(
        manualDate + 'T12:00:00Z',
        amountVal,
        defaultCurrency,
        'BALANCE_ADJUSTMENT',
        '0'
      );

      const tx: UnifiedTransaction = {
        id: `utx-cash-${Date.now()}`,
        ownerId: user?.id || 'default-user',
        batchId,
        accountId,
        instrumentId: instrument.id,
        rowHash,
        sourceOrigin: 'MANUAL' as SourceOrigin,
        isSynthetic: true,
        isFiscal: false,
        sourceMode: 'snapshot',
        transactionDate: manualDate + 'T12:00:00Z',
        type: 'BALANCE_ADJUSTMENT' as TransactionType,
        rawType: 'Manual Cash Statement',
        label: `Balance Update: ${amountVal} ${defaultCurrency}`,
        rawLabel: 'Manual Balance Saisie',
        amountPrimary: amountVal,
        assetSymbol: defaultCurrency,
        priceUnit: amountVal,
        quantity: '1',
        createdAt: now,
        updatedAt: now,
        version: 1
      };

      // Atomic save
      const allTxs = db.getUnifiedTransactions();
      const allBatches = db.getImportBatches();
      
      const newBatch = {
        id: batchId,
        ownerId: user?.id || 'default-user',
        accountId,
        importMode: 'snapshot' as const,
        fileName: 'manual_entry',
        fileHash: `hash-${Date.now()}`,
        transactionCount: 1,
        skippedCount: 0,
        importedAt: now,
        importedBy: user?.id || 'default-user',
        status: 'completed' as const,
        engineVersion: '3.0.0'
      };

      db.saveUnifiedTransactions([...allTxs, tx]);
      db.saveImportBatches([...allBatches, newBatch]);
      
      // Recalculate cache
      await portfolioService.recalculatePositions();
      setCompletedTxCount(1);
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsLoading(false);
    }
  };

  // 2. CSV parsing and preview loading
  const handleCSVUpload = (file: File) => {
    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setRawCSVText(text);
      try {
        const parsed = parseCSVText(text);
        setHeaders(parsed.headers);
        setPreviewRows(parsed.rows.slice(0, 5));
        setStep('csv_mapping');
      } catch (err) {
        setError(t('importWizard.errors.failedToParseFile'));
      }
    };
    reader.readAsText(file);
  };

  const handleSaveCSV = async () => {
    if (!dateMapping || !amountMapping) {
      setError(t('importWizard.mapping.identifierRequiredWarning'));
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const parsed = parseCSVText(rawCSVText);
      const instrument = await instrumentService.findOrCreateInstrument({
        symbol: defaultCurrency,
        name: defaultCurrency,
      });

      const batchId = `batch-cash-${Date.now()}`;
      const now = new Date().toISOString();
      const unifiedTxs: UnifiedTransaction[] = [];

      for (let i = 0; i < parsed.rows.length; i++) {
        const row = parsed.rows[i];
        const dateIdx = headers.indexOf(dateMapping);
        const amountIdx = headers.indexOf(amountMapping);

        const rawDate = row[dateIdx] || '';
        const rawAmount = row[amountIdx] || '';

        const transactionDate = parseDate(rawDate) || now;
        const amountVal = parseDecimal(rawAmount) || '0';

        const rowHash = await computeRowHash(
          transactionDate,
          amountVal,
          defaultCurrency,
          'BALANCE_ADJUSTMENT',
          '0'
        );

        unifiedTxs.push({
          id: `utx-cash-${Date.now()}-${i}`,
          ownerId: user?.id || 'default-user',
          batchId,
          accountId,
          instrumentId: instrument.id,
          rowHash,
          sourceOrigin: 'FILE' as SourceOrigin,
          isSynthetic: true,
          isFiscal: false,
          sourceMode: 'snapshot',
          transactionDate,
          type: 'BALANCE_ADJUSTMENT' as TransactionType,
          rawType: 'CSV Cash Statement',
          label: `Balance Update: ${amountVal} ${defaultCurrency}`,
          rawLabel: 'CSV Balance Saisie',
          amountPrimary: amountVal,
          assetSymbol: defaultCurrency,
          priceUnit: amountVal,
          quantity: '1',
          createdAt: now,
          updatedAt: now,
          version: 1
        });
      }

      // Save
      const allTxs = db.getUnifiedTransactions();
      const allBatches = db.getImportBatches();

      const newBatch = {
        id: batchId,
        ownerId: user?.id || 'default-user',
        accountId,
        importMode: 'snapshot' as const,
        fileName: csvFile?.name || 'cash_import.csv',
        fileHash: `hash-${Date.now()}`,
        transactionCount: unifiedTxs.length,
        skippedCount: 0,
        importedAt: now,
        importedBy: user?.id || 'default-user',
        status: 'completed' as const,
        engineVersion: '3.0.0'
      };

      db.saveUnifiedTransactions([...allTxs, ...unifiedTxs]);
      db.saveImportBatches([...allBatches, newBatch]);

      await portfolioService.recalculatePositions();
      setCompletedTxCount(unifiedTxs.length);
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CSV save failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* Loading overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-canvas/80 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-success border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-primary">{t('common:labels.processing')}</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3">
        <Camera className="text-success" size={28} />
        <div>
          <h2 className="text-xl font-bold text-primary">{t('cashWizard.title')}</h2>
          <p className="text-secondary text-sm">{t('cashWizard.subtitle', { accountName })}</p>
        </div>
      </div>

      {error && (
        <div className="bg-negative-subtle border border-negative/20 rounded-xl p-4 text-negative text-sm flex gap-2">
          <AlertTriangle size={18} /> {error}
        </div>
      )}

      {/* Steps switcher */}
      {step === 'options' && (
        <div className="space-y-6">
          <h3 className="text-lg font-bold text-primary">{t('cashWizard.options.title')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => setStep('manual')}
              className="p-6 rounded-xl border-2 border-subtle bg-subtle hover:bg-card-hover transition-all text-left flex flex-col justify-between"
            >
              <div>
                <Plus className="text-success" size={32} />
                <h4 className="text-primary font-bold mt-4">{t('cashWizard.options.manualTitle')}</h4>
                <p className="text-secondary text-sm mt-2">{t('cashWizard.options.manualDescription')}</p>
              </div>
              <ArrowRight className="text-success mt-4 self-end" size={20} />
            </button>

            <button
              onClick={() => setStep('csv_upload')}
              className="p-6 rounded-xl border-2 border-subtle bg-subtle hover:bg-card-hover transition-all text-left flex flex-col justify-between"
            >
              <div>
                <Upload className="text-success" size={32} />
                <h4 className="text-primary font-bold mt-4">{t('cashWizard.options.csvTitle')}</h4>
                <p className="text-secondary text-sm mt-2">{t('cashWizard.options.csvDescription')}</p>
              </div>
              <ArrowRight className="text-success mt-4 self-end" size={20} />
            </button>
          </div>

          <div className="flex justify-start">
            <Button variant="secondary" onClick={onBack}>
              {t('common:buttons.back')}
            </Button>
          </div>
        </div>
      )}

      {step === 'manual' && (
        <div className="space-y-6 bg-card border border-subtle rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-bold text-primary">{t('cashWizard.manualForm.title')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-secondary uppercase">{t('cashWizard.manualForm.dateLabel')}</label>
              <input
                type="date"
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
                className="w-full bg-subtle border border-subtle text-primary rounded-lg p-3 focus:ring-primary focus:border-primary"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-secondary uppercase">{t('cashWizard.manualForm.amountLabel')}</label>
              <div className="relative">
                <input
                  type="number"
                  placeholder="0.00"
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                  className="w-full bg-subtle border border-subtle text-primary rounded-lg p-3 pr-16 focus:ring-primary focus:border-primary font-mono"
                />
                <span className="absolute right-3 top-3 text-secondary font-bold">{defaultCurrency}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t border-subtle">
            <Button variant="secondary" onClick={() => setStep('options')}>
              {t('common:buttons.back')}
            </Button>
            <Button onClick={handleSaveManual} disabled={!manualAmount}>
              {t('cashWizard.manualForm.saveButton')}
            </Button>
          </div>
        </div>
      )}

      {step === 'csv_upload' && (
        <div className="space-y-6">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files[0]) handleCSVUpload(e.dataTransfer.files[0]);
            }}
            className="border-2 border-dashed border-subtle rounded-2xl p-12 text-center hover:border-success transition-all bg-card/50"
          >
            <Upload className="text-secondary mx-auto mb-4 animate-pulse" size={48} />
            <h3 className="text-lg font-bold text-primary">{t('importWizard.upload.dropTitle')}</h3>
            <p className="text-secondary text-sm mt-1">{t('importWizard.upload.dropSubtitle')}</p>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => e.target.files?.[0] && handleCSVUpload(e.target.files[0])}
              className="hidden"
              id="cash-csv-file"
            />
            <label htmlFor="cash-csv-file" className="inline-block mt-6">
              <Button as="span">{t('common:buttons.browse')}</Button>
            </label>
          </div>

          <div className="flex justify-start">
            <Button variant="secondary" onClick={() => setStep('options')}>
              {t('common:buttons.back')}
            </Button>
          </div>
        </div>
      )}

      {step === 'csv_mapping' && (
        <div className="space-y-6">
          <div className="bg-card border border-subtle rounded-xl p-6 shadow-sm space-y-4">
            <h3 className="text-lg font-bold text-primary">{t('cashWizard.csvMapping.title')}</h3>
            <p className="text-secondary text-sm">{t('cashWizard.csvMapping.description')}</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-secondary uppercase flex items-center gap-1">
                  {t('importWizard.fields.transactionDate')} <span className="text-negative">*</span>
                </label>
                <select
                  value={dateMapping}
                  onChange={(e) => setDateMapping(e.target.value)}
                  className="w-full bg-subtle border border-subtle text-primary rounded-lg p-3 focus:ring-primary focus:border-primary"
                >
                  <option value="">{t('importWizard.mapping.notMappedOption')}</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-secondary uppercase flex items-center gap-1">
                  {t('importWizard.fields.amountPrimary')} <span className="text-negative">*</span>
                </label>
                <select
                  value={amountMapping}
                  onChange={(e) => setAmountMapping(e.target.value)}
                  className="w-full bg-subtle border border-subtle text-primary rounded-lg p-3 focus:ring-primary focus:border-primary"
                >
                  <option value="">{t('importWizard.mapping.notMappedOption')}</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Preview rows */}
          <div className="bg-card border border-subtle rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-subtle bg-subtle/50">
              <h3 className="text-sm font-bold text-primary">{t('snapshotWizard.preview.title')}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-subtle text-xs uppercase text-secondary">
                  <tr>
                    <th className="px-4 py-2">{t('importWizard.fields.transactionDate')}</th>
                    <th className="px-4 py-2 text-right">{t('importWizard.fields.amountPrimary')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle">
                  {previewRows.map((row, idx) => {
                    const dateIdx = headers.indexOf(dateMapping);
                    const amountIdx = headers.indexOf(amountMapping);
                    return (
                      <tr key={idx} className="text-secondary">
                        <td className="px-4 py-2">{dateIdx >= 0 ? row[dateIdx] : '—'}</td>
                        <td className="px-4 py-2 text-right font-mono">{amountIdx >= 0 ? row[amountIdx] : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => setStep('csv_upload')}>
              {t('common:buttons.back')}
            </Button>
            <Button onClick={handleSaveCSV} disabled={!dateMapping || !amountMapping}>
              {t('snapshotWizard.buttons.importPositions')}
            </Button>
          </div>
        </div>
      )}

      {step === 'success' && (
        <div className="max-w-md mx-auto text-center space-y-6 bg-card border border-subtle rounded-xl p-8 shadow-sm">
          <div className="w-20 h-20 bg-success/20 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="text-success" size={48} />
          </div>

          <div>
            <h2 className="text-2xl font-bold text-primary">{t('cashWizard.manualForm.success')}</h2>
            <p className="text-secondary mt-2">
              {t('snapshotWizard.complete.success', { count: completedTxCount })}
            </p>
          </div>

          <div className="flex justify-center gap-3 pt-4">
            <Button onClick={onComplete}>{t('snapshotWizard.complete.goToDashboard')}</Button>
            <Button variant="secondary" onClick={() => {
              setManualAmount('');
              setDateMapping('');
              setAmountMapping('');
              setStep('options');
            }}>
              {t('snapshotWizard.complete.importMore')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashImportWizard;
