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
import SnapshotWizard from '../components/SnapshotWizard';
import CashImportWizard from '../components/CashImportWizard';
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
import { useTranslation } from 'react-i18next';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const ImportWizard: React.FC = () => {
  const wizard = useImportWizard();
  const { t } = useTranslation('transactions');

  // For snapshot mode, show dedicated SnapshotWizard from step 3 onwards
  const showSnapshotWizard = wizard.importMode === 'snapshot' &&
    wizard.step >= 3 &&
    wizard.rawCSVText &&
    wizard.selectedAccountId;

  return (
    <div className="py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-primary">{t('importWizard.title')}</h1>
          <p className="text-secondary mt-1">
            {wizard.step === 1 && t('importWizard.stepDescription.context')}
            {wizard.step === 2 && t('importWizard.stepDescription.upload')}
            {wizard.step === 3 && (wizard.importMode === 'snapshot'
              ? t('importWizard.stepDescription.mappingSnapshot')
              : t('importWizard.stepDescription.mappingHistory'))}
            {wizard.step === 4 && t('importWizard.stepDescription.review')}
            {wizard.step === 5 && t('importWizard.stepDescription.complete')}
          </p>
        </div>
        {!showSnapshotWizard && <StepIndicator currentStep={wizard.step} />}
      </div>

      {/* Error Banner */}
      {wizard.error && !showSnapshotWizard && (
        <div className="bg-error/10 border border-error/20 rounded-xl p-4 mb-6 flex items-center gap-3">
          <AlertCircle className="text-error" size={20} />
          <span className="text-error">{wizard.error}</span>
          <button onClick={() => wizard.goToStep(wizard.step)} className="ml-auto text-tertiary hover:text-primary">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Loading Overlay */}
      {wizard.isLoading && !showSnapshotWizard && (
        <div className="fixed inset-0 bg-canvas/80 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-primary">{t('common:labels.processing')}</p>
          </div>
        </div>
      )}

      {/* Step Content */}
      <div className="min-h-[450px] animate-fade-in">
        {/* Route to Cash Import Wizard if Cash Account is selected */}
        {wizard.selectedAccount?.type === 'checking' && wizard.step >= 2 ? (
          <CashImportWizard
            accountId={wizard.selectedAccountId!}
            accountName={wizard.selectedAccount.name}
            defaultCurrency={wizard.selectedAccount.defaultCurrency}
            onBack={wizard.goBack}
            onComplete={wizard.reset}
          />
        ) : showSnapshotWizard ? (
          <SnapshotWizard
            accountId={wizard.selectedAccountId!}
            accountName={wizard.selectedAccount?.name || t('importWizard.fallbackAccount')}
            rawCSVText={wizard.rawCSVText}
            headers={wizard.headers}
            previewRows={wizard.previewRows}
            onBack={() => wizard.goToStep(2)}
            onComplete={wizard.reset}
          />
        ) : (
          <>
            {wizard.step === 1 && <Step1ContextSelection wizard={wizard} />}
            {wizard.step === 2 && <Step2FileUpload wizard={wizard} />}
            {wizard.step === 3 && wizard.importMode === 'history' && <Step3Mapping wizard={wizard} />}
            {wizard.step === 4 && <Step4StagingArea wizard={wizard} />}
            {wizard.step === 5 && <Step5Complete wizard={wizard} />}
          </>
        )}
      </div>

      {/* Navigation Footer - only for history mode after step 2 */}
      {!showSnapshotWizard && wizard.step > 1 && wizard.step < 5 && (
        <div className="flex justify-between mt-12 pt-8 border-t border-subtle">
          <Button variant="secondary" size="lg" onClick={wizard.goBack}>
            {t('common:buttons.back')}
          </Button>

          {wizard.step === 3 && wizard.importMode === 'history' && (
            <Button
              size="lg"
              onClick={wizard.analyzeData}
              disabled={!wizard.isValidMappingForAnalysis}
            >
              {t('importWizard.buttons.analyzeData')} <ArrowRight size={18} className="ml-2" />
            </Button>
          )}

          {wizard.step === 4 && (
            <Button
              size="lg"
              onClick={wizard.finalizeImport}
              disabled={wizard.importableTxCount === 0}
            >
              {t('importWizard.buttons.importTransactions', { count: wizard.importableTxCount })}
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
  const { t } = useTranslation('transactions');
  const steps = [
    { num: 1, label: t('importWizard.steps.context') },
    { num: 2, label: t('importWizard.steps.upload') },
    { num: 3, label: t('importWizard.steps.mapping') },
    { num: 4, label: t('importWizard.steps.review') },
    { num: 5, label: t('importWizard.steps.done') }
  ];

  return (
    <div className="flex items-center gap-2">
      {steps.map((step, idx) => (
        <React.Fragment key={step.num}>
          <div className={`
            w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
            ${currentStep === step.num ? 'bg-brand text-white' :
              currentStep > step.num ? 'bg-success text-white' :
                'bg-subtle text-secondary'}
          `}>
            {currentStep > step.num ? <Check size={14} /> : step.num}
          </div>
          {idx < steps.length - 1 && (
            <div className={`w-8 h-0.5 ${currentStep > step.num ? 'bg-success' : 'bg-subtle'}`} />
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
  const { t } = useTranslation('transactions');
  const [showNewInstitute, setShowNewInstitute] = useState(false);
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [newInstituteName, setNewInstituteName] = useState('');
  const [newInstituteType, setNewInstituteType] = useState<InstituteType>('bank');
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountType, setNewAccountType] = useState<AccountType>('investment');
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
      <div className="bg-card border border-subtle rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <Building2 className="text-brand" size={24} />
          <h2 className="text-lg font-bold text-primary">{t('importWizard.context.selectInstitution')}</h2>
        </div>

        {!showNewInstitute ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {wizard.institutes.map(inst => (
                <button
                  key={inst.id}
                  onClick={() => wizard.selectInstitute(inst.id)}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${wizard.selectedInstituteId === inst.id
                    ? 'border-brand bg-brand/10'
                    : 'border-subtle bg-subtle hover:bg-card-hover'
                    }`}
                >
                  <span className="text-primary font-medium">{inst.name}</span>
                  <span className="block text-xs text-secondary mt-1 capitalize">{inst.type}</span>
                </button>
              ))}

              <button
                onClick={() => setShowNewInstitute(true)}
                className="p-4 rounded-xl border-2 border-dashed border-subtle hover:border-brand transition-all flex flex-col items-center justify-center text-secondary hover:text-brand"
              >
                <Plus size={24} />
                <span className="text-sm mt-1">{t('importWizard.context.new')}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <input
              type="text"
              value={newInstituteName}
              onChange={e => setNewInstituteName(e.target.value)}
              placeholder={t('importWizard.context.institutionNamePlaceholder')}
              className="w-full bg-subtle border border-subtle text-primary rounded-lg p-3 focus:border-primary focus:ring-1 focus:ring-primary"
              autoFocus
            />
            <select
              value={newInstituteType}
              onChange={e => setNewInstituteType(e.target.value as InstituteType)}
              className="w-full bg-subtle border border-subtle text-primary rounded-lg p-3 focus:ring-primary focus:border-primary"
            >
              <option value="bank">{t('importWizard.context.instituteTypes.bank')}</option>
              <option value="broker">{t('importWizard.context.instituteTypes.broker')}</option>
              <option value="exchange">{t('importWizard.context.instituteTypes.exchange')}</option>
              <option value="wallet">{t('importWizard.context.instituteTypes.wallet')}</option>
              <option value="other">{t('importWizard.context.instituteTypes.other')}</option>
            </select>
            <div className="flex gap-2">
              <Button onClick={handleCreateInstitute} disabled={!newInstituteName.trim()}>
                {t('common:buttons.create')}
              </Button>
              <Button variant="secondary" onClick={() => setShowNewInstitute(false)}>
                {t('common:buttons.cancel')}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Account Selection */}
      {wizard.selectedInstituteId && (
        <div className="bg-card border border-subtle rounded-xl p-6 animate-fade-in shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <Wallet className="text-success" size={24} />
            <h2 className="text-lg font-bold text-primary">{t('importWizard.context.selectAccount')}</h2>
          </div>

          {!showNewAccount ? (
            <div className="space-y-4">
              {wizard.accounts.length === 0 ? (
                <p className="text-secondary text-sm">{t('importWizard.context.noAccounts')}</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {wizard.accounts.map(acc => (
                    <button
                      key={acc.id}
                      onClick={() => wizard.selectAccount(acc.id)}
                      className={`p-4 rounded-xl border-2 transition-all text-left ${wizard.selectedAccountId === acc.id
                        ? 'border-success bg-success/10'
                        : 'border-subtle bg-subtle hover:bg-card-hover'
                        }`}
                    >
                      <span className="text-primary font-medium">{acc.name}</span>
                      <span className="block text-xs text-secondary mt-1">{acc.defaultCurrency} · {acc.type}</span>
                    </button>
                  ))}
                </div>
              )}

              <button
                onClick={() => setShowNewAccount(true)}
                className="flex items-center gap-2 text-brand hover:text-brand/80 text-sm"
              >
                <Plus size={16} /> {t('importWizard.context.createNewAccount')}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <input
                type="text"
                value={newAccountName}
                onChange={e => setNewAccountName(e.target.value)}
                placeholder={t('importWizard.context.accountNamePlaceholder')}
                className="w-full bg-subtle border border-subtle text-primary rounded-lg p-3 focus:border-primary focus:ring-primary"
                autoFocus
              />
              <div className="grid grid-cols-2 gap-4">
                <select
                  value={newAccountType}
                  onChange={e => setNewAccountType(e.target.value as AccountType)}
                  className="bg-subtle border border-subtle text-primary rounded-lg p-3 focus:ring-primary focus:border-primary"
                >
                  <option value="investment">{t('importWizard.context.accountTypes.investment')}</option>
                  <option value="crypto_spot">{t('importWizard.context.accountTypes.cryptoSpot')}</option>
                  <option value="checking">{t('importWizard.context.accountTypes.checking')}</option>
                </select>
                <select
                  value={newAccountCurrency}
                  onChange={e => setNewAccountCurrency(e.target.value)}
                  className="bg-subtle border border-subtle text-primary rounded-lg p-3 focus:ring-primary focus:border-primary"
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
                  {t('common:buttons.create')}
                </Button>
                <Button variant="secondary" onClick={() => setShowNewAccount(false)}>
                  {t('common:buttons.cancel')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Import Mode - Only for non-cash accounts (checking type skips this) */}
      {wizard.selectedAccountId && wizard.selectedAccount?.type !== 'checking' && (
        <div className="bg-card border border-subtle rounded-xl p-6 animate-fade-in shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <FileText className="text-brand" size={24} />
            <h2 className="text-lg font-bold text-primary">{t('importWizard.mode.title')}</h2>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => wizard.setImportMode('history')}
              className={`p-6 rounded-xl border-2 transition-all text-left ${wizard.importMode === 'history'
                ? 'border-brand bg-brand/10'
                : 'border-subtle bg-subtle hover:bg-card-hover'
                }`}
            >
              <History className={wizard.importMode === 'history' ? 'text-brand' : 'text-secondary'} size={28} />
              <div className="mt-3">
                <span className="text-primary font-bold">{t('importWizard.mode.historyTitle')}</span>
                <p className="text-secondary text-sm mt-1">{t('importWizard.mode.historyDescription')}</p>
              </div>
            </button>

            <button
              onClick={() => wizard.setImportMode('snapshot')}
              className={`p-6 rounded-xl border-2 transition-all text-left ${wizard.importMode === 'snapshot'
                ? 'border-brand bg-brand/10'
                : 'border-subtle bg-subtle hover:bg-card-hover'
                }`}
            >
              <Camera className={wizard.importMode === 'snapshot' ? 'text-brand' : 'text-secondary'} size={28} />
              <div className="mt-3">
                <span className="text-primary font-bold">{t('importWizard.mode.snapshotTitle')}</span>
                <p className="text-secondary text-sm mt-1">{t('importWizard.mode.snapshotDescription')}</p>
              </div>
            </button>
          </div>

          {wizard.importMode === 'snapshot' && (
            <div className="mt-4 bg-warning/10 border border-warning/20 rounded-lg p-3 text-warning text-sm">
              <AlertTriangle size={16} className="inline mr-2" />
              {t('importWizard.mode.snapshotWarning')}
            </div>
          )}

          {/* Continue Button */}
          <div className="mt-6 flex justify-end">
            <Button
              size="lg"
              onClick={() => wizard.goToStep(2)}
              disabled={!wizard.canProceedFromStep1}
            >
              {t('common:buttons.continue')} <ArrowRight size={18} className="ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* Cash Accounts - Continue button directly under selection */}
      {wizard.selectedAccountId && wizard.selectedAccount?.type === 'checking' && (
        <div className="mt-6 flex justify-end">
          <Button
            size="lg"
            onClick={() => {
              wizard.setImportMode('snapshot'); // default internally to snapshot
              wizard.goToStep(2);
            }}
          >
            {t('common:buttons.continue')} <ArrowRight size={18} className="ml-2" />
          </Button>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// STEP 2: FILE UPLOAD
// ============================================================================

const Step2FileUpload: React.FC<{ wizard: ReturnType<typeof useImportWizard> }> = ({ wizard }) => {
  const { t } = useTranslation('transactions');
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
      <div className="bg-subtle border border-subtle rounded-xl p-4 flex items-center gap-4">
        <div className="flex-1">
          <span className="text-secondary text-sm">{t('importWizard.upload.importingTo')}</span>
          <div className="text-primary font-medium">
            {wizard.selectedInstitute?.name} → {wizard.selectedAccount?.name}
          </div>
        </div>
        <div className="px-3 py-1 rounded-full bg-brand/20 text-brand text-sm font-medium">
          {wizard.importMode === 'history'
            ? t('importWizard.mode.history')
            : t('importWizard.mode.snapshot')}
        </div>
      </div>

      {/* Drop Zone */}
      <label
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        className="border-2 border-dashed border-subtle rounded-3xl p-16 flex flex-col items-center justify-center text-center hover:border-brand transition-colors cursor-pointer bg-card/50 group"
      >
        <Upload className="text-secondary group-hover:text-brand mb-4" size={48} />
        <h3 className="text-xl font-medium text-primary mb-2">{t('importWizard.upload.dropTitle')}</h3>
        <p className="text-secondary text-sm">{t('importWizard.upload.dropSubtitle')}</p>
        <input
          type="file"
          accept=".csv,.txt"
          className="hidden"
          onChange={handleFileChange}
        />
      </label>

      {/* Saved Templates */}
      {wizard.mappingTemplates.length > 0 && (
        <div className="bg-card border border-subtle rounded-xl p-4 shadow-sm">
          <h3 className="text-sm font-bold text-secondary uppercase mb-3">{t('importWizard.upload.savedTemplates')}</h3>
          <div className="flex flex-wrap gap-2">
            {wizard.mappingTemplates.map(tpl => (
              <button
                key={tpl.id}
                onClick={() => wizard.applyTemplate(tpl.id)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${wizard.selectedTemplateId === tpl.id
                  ? 'bg-brand text-white'
                  : 'bg-subtle text-secondary hover:bg-card-hover'
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
  const { t } = useTranslation('transactions');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');

  const handleSaveTemplate = async () => {
    if (templateName.trim()) {
      await wizard.saveAsTemplate(templateName.trim());
      setShowSaveTemplate(false);
      setTemplateName('');
    }
  };

  // Check if a header is mapped to any field
  const isHeaderMapped = (header: string): boolean => {
    return Object.values(wizard.mappings).some(mapping => mapping === header);
  };

  const isIdentifierMapped = !!(wizard.mappings.assetSymbol || wizard.mappings.assetIsin);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Detected Preset Banner */}
      {wizard.detectedPreset && (
        <div className="bg-success/10 border border-success/20 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle className="text-success" size={20} />
          <span className="text-success">
            {t('importWizard.mapping.detectedFormat', { preset: wizard.detectedPreset })}
          </span>
        </div>
      )}

      {/* Header Tokens - Visual Mapping Status */}
      {wizard.headers.length > 0 && (
        <div className="bg-card border border-subtle rounded-xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-primary mb-3">{t('importWizard.mapping.csvHeaders')}</h3>
          <div className="flex flex-wrap gap-2">
            {wizard.headers.map((header, idx) => {
              const isMapped = isHeaderMapped(header);
              return (
                <span
                  key={idx}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isMapped
                    ? 'bg-success/20 text-success border border-success/30'
                    : 'bg-error/20 text-error border border-error/30'
                    }`}
                >
                  {header}
                </span>
              );
            })}
          </div>
          <p className="text-xs text-secondary mt-3">
            <span className="inline-block w-3 h-3 rounded bg-success/20 border border-success/30 mr-1"></span>
            {t('importWizard.mapping.mapped')}
            <span className="inline-block w-3 h-3 rounded bg-error/20 border border-error/30 ml-4 mr-1"></span>
            {t('importWizard.mapping.notMapped')}
          </p>
        </div>
      )}

      {/* Mapping Grid */}
      <div className="bg-card border border-subtle rounded-xl p-6 shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-bold text-primary">{t('importWizard.mapping.columnMapping')}</h2>

          {!showSaveTemplate ? (
            <button
              onClick={() => setShowSaveTemplate(true)}
              className="flex items-center gap-2 text-brand hover:text-brand/80 text-sm"
            >
              <Save size={16} /> {t('importWizard.mapping.saveTemplate')}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                placeholder={t('importWizard.mapping.templateNamePlaceholder')}
                className="bg-subtle border border-subtle text-primary rounded-lg px-3 py-1.5 text-sm focus:ring-primary focus:border-primary"
                autoFocus
              />
              <Button size="sm" onClick={handleSaveTemplate}>{t('common:buttons.save')}</Button>
              <button onClick={() => setShowSaveTemplate(false)} className="text-secondary hover:text-primary">
                <X size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Missing Identifier Warning */}
        {wizard.selectedAccount?.type === 'investment' && !isIdentifierMapped && (
          <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 mb-6 flex items-center gap-3 animate-pulse">
            <AlertTriangle className="text-warning" size={20} />
            <span className="text-warning text-sm font-medium">
              {t('importWizard.mapping.identifierRequiredWarning')}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {MAPPABLE_FIELDS.map(field => {
            const isIdentifierField = field.key === 'assetSymbol' || field.key === 'assetIsin';
            const isInvestment = wizard.selectedAccount?.type === 'investment';

            return (
              <div key={field.key} className="space-y-1">
                <label className="flex items-center gap-1 text-xs font-bold text-secondary uppercase">
                  {t(field.labelKey)}
                  {field.required && <span className="text-error">*</span>}
                  {isInvestment && isIdentifierField && !isIdentifierMapped && (
                    <span className="text-error" title="One of Symbol or ISIN is required">*</span>
                  )}
                </label>
                <select
                  value={wizard.mappings[field.key as keyof typeof wizard.mappings] as string || ''}
                  onChange={e => wizard.setMapping(field.key as keyof typeof wizard.mappings, e.target.value || undefined)}
                  className={`w-full bg-subtle border text-primary text-sm rounded-lg p-2.5 ${(field.required && !wizard.mappings[field.key as keyof typeof wizard.mappings]) || (isInvestment && isIdentifierField && !isIdentifierMapped)
                    ? 'border-error/50'
                    : 'border-subtle'
                    } focus:ring-primary focus:border-primary`}
                >
                  <option value="">{t('importWizard.mapping.notMappedOption')}</option>
                  {wizard.headers.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </div>

      {/* Live Preview - Dynamic Columns */}
      {wizard.previewRows.length > 0 && wizard.headers.length > 0 && (
        <div className="bg-card border border-subtle rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-subtle bg-subtle/50">
            <h3 className="text-sm font-bold text-primary">
              {t('importWizard.mapping.preview', { rows: wizard.previewRows.length, columns: wizard.headers.length })}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-subtle text-xs uppercase text-secondary">
                <tr>
                  {wizard.headers.map((header, idx) => (
                    <th key={idx} className="px-4 py-2 whitespace-nowrap">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {wizard.previewRows.map((row, rowIdx) => (
                  <tr key={rowIdx} className="text-secondary">
                    {row.map((cell, cellIdx) => (
                      <td key={cellIdx} className="px-4 py-2 font-mono text-xs whitespace-nowrap">
                        {cell || t('importWizard.common.emptyValue')}
                      </td>
                    ))}
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
  const { t } = useTranslation('transactions');
  const { stats, stagedTransactions } = wizard;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label={t('importWizard.staging.stats.totalRows')} value={stats.total} color="blue" />
        <StatCard label={t('importWizard.staging.stats.valid')} value={stats.valid} color="emerald" />
        <StatCard label={t('importWizard.staging.stats.warnings')} value={stats.warnings} color="amber" />
        <StatCard label={t('importWizard.staging.stats.errors')} value={stats.errors} color="rose" />
        <StatCard label={t('importWizard.staging.stats.duplicates')} value={stats.duplicates} color="purple" />
      </div>

      {/* Action Bar */}
      <div className="flex flex-wrap gap-4 items-center">
        {stats.duplicates > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-tertiary text-sm">{t('importWizard.staging.duplicatesLabel')}</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => wizard.bulkSetResolution('duplicate', 'skip')}
            >
              {t('importWizard.staging.skipAll')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => wizard.bulkSetResolution('duplicate', 'import')}
            >
              {t('importWizard.staging.importAll')}
            </Button>
          </div>
        )}

        {stats.errors > 0 && (
          <button
            onClick={wizard.downloadInvalidRows}
            className="flex items-center gap-2 text-warning hover:text-warning/80 text-sm ml-auto"
          >
            <Download size={16} /> {t('importWizard.staging.downloadInvalid')}
          </button>
        )}
      </div>

      {/* Staging Table */}
      <div className="bg-card border border-subtle rounded-xl overflow-hidden shadow-sm">
        <div className="max-h-[500px] overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-subtle text-xs uppercase text-secondary sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 w-24">{t('importWizard.staging.table.status')}</th>
                <th className="px-4 py-3">{t('importWizard.staging.table.date')}</th>
                <th className="px-4 py-3">{t('importWizard.staging.table.type')}</th>
                <th className="px-4 py-3">{t('importWizard.staging.table.asset')}</th>
                <th className="px-4 py-3 text-right">{t('importWizard.staging.table.amount')}</th>
                <th className="px-4 py-3 text-right">{t('importWizard.staging.table.quantity')}</th>
                <th className="px-4 py-3">{t('importWizard.staging.table.errors')}</th>
                <th className="px-4 py-3 w-32 text-right">{t('importWizard.staging.table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
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
    blue: 'text-brand',
    emerald: 'text-success',
    amber: 'text-warning',
    rose: 'text-error',
    purple: 'text-purple-500'
  };

  return (
    <div className="bg-card border border-subtle rounded-xl p-4 shadow-sm">
      <span className="text-xs font-bold text-secondary uppercase">{label}</span>
      <div className={`text-2xl font-bold mt-1 ${colorClasses[color]}`}>{value}</div>
    </div>
  );
};

const StagingRow: React.FC<{
  tx: ReturnType<typeof useImportWizard>['stagedTransactions'][0];
  wizard: ReturnType<typeof useImportWizard>;
}> = ({ tx, wizard }) => {
  const { t } = useTranslation('transactions');
  const isEditing = wizard.editingRowId === tx.id;

  const statusBadge = {
    valid: { icon: CheckCircle, color: 'text-emerald-500', label: t('importWizard.staging.status.valid') },
    warning: { icon: AlertTriangle, color: 'text-amber-500', label: t('importWizard.staging.status.warning') },
    error: { icon: AlertCircle, color: 'text-rose-500', label: t('importWizard.staging.status.error') },
    duplicate: { icon: AlertTriangle, color: 'text-purple-500', label: t('importWizard.staging.status.duplicate') }
  }[tx.status];

  const StatusIcon = statusBadge.icon;

  return (
    <tr className={`hover:bg-card-hover ${tx.resolution === 'skip' ? 'opacity-50' : ''}`}>
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
            className="bg-subtle border border-primary text-primary rounded px-2 py-1 text-xs w-28 focus:ring-primary"
          />
        ) : (
          <span className={`font-mono text-xs ${tx.errors.some(e => e.field === 'transactionDate') ? 'text-error' : 'text-primary'
            }`}>
            {tx.parsed.transactionDate?.split('T')[0] || t('importWizard.common.emptyValue')}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-secondary">{tx.parsed.type || t('importWizard.common.emptyValue')}</td>
      <td className="px-4 py-3">
        {isEditing ? (
          <input
            type="text"
            value={tx.parsed.assetSymbol || ''}
            onChange={e => wizard.updateRowField(tx.id, 'assetSymbol', e.target.value)}
            className="bg-subtle border border-primary text-primary rounded px-2 py-1 text-xs w-20 focus:ring-primary"
          />
        ) : (
          <span className={`font-bold ${tx.errors.some(e => e.field === 'assetSymbol') ? 'text-error' : 'text-primary'
            }`}>
            {tx.parsed.assetSymbol || t('importWizard.common.emptyValue')}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        {isEditing ? (
          <input
            type="text"
            value={tx.parsed.amountPrimary || ''}
            onChange={e => wizard.updateRowField(tx.id, 'amountPrimary', e.target.value)}
            className="bg-subtle border border-primary text-primary rounded px-2 py-1 text-xs w-24 text-right focus:ring-primary"
          />
        ) : (
          <span className={`font-mono ${tx.errors.some(e => e.field === 'amountPrimary') ? 'text-error' : 'text-primary'
            }`}>
            {tx.parsed.amountPrimary || t('importWizard.common.emptyValue')}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right font-mono text-secondary">
        {tx.parsed.quantity || t('importWizard.common.emptyValue')}
      </td>
      <td className="px-4 py-3">
        {tx.errors.length > 0 && (
          <span className="text-error text-xs">
            {tx.errors.map(e => e.message).join(', ')}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          {tx.status === 'error' && !isEditing && (
            <button
              onClick={() => wizard.startEditRow(tx.id)}
              className="p-1.5 text-brand hover:text-brand/80"
              title={t('importWizard.staging.editRow')}
            >
              <Edit3 size={14} />
            </button>
          )}

          {isEditing && (
            <button
              onClick={() => wizard.cancelEditRow()}
              className="p-1.5 text-success hover:text-success/80"
              title={t('importWizard.staging.doneEditing')}
            >
              <Check size={14} />
            </button>
          )}

          {tx.status === 'duplicate' && (
            <>
              <button
                onClick={() => wizard.setRowResolution(tx.id, tx.resolution === 'import' ? 'skip' : 'import')}
                className={`px-2 py-1 rounded text-xs ${tx.resolution === 'import'
                  ? 'bg-brand text-white'
                  : 'bg-subtle text-secondary hover:bg-card-hover'
                  }`}
              >
                {tx.resolution === 'import'
                  ? t('importWizard.staging.importing')
                  : t('importWizard.staging.skipping')}
              </button>
            </>
          )}

          <button
            onClick={() => wizard.removeRow(tx.id)}
            className="p-1.5 text-secondary hover:text-error"
            title={t('importWizard.staging.removeRow')}
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
  const { t } = useTranslation('transactions');
  return (
    <div className="max-w-2xl mx-auto text-center space-y-8">
      <div className="w-20 h-20 bg-success/20 rounded-full flex items-center justify-center mx-auto">
        <CheckCircle className="text-success" size={48} />
      </div>

      <div>
        <h2 className="text-3xl font-bold text-primary mb-2">{t('importWizard.complete.title')}</h2>
        <p className="text-secondary">
          {t('importWizard.complete.success', { count: wizard.completedBatch?.transactionCount || 0 })}
        </p>
      </div>

      {wizard.completedBatch && (
        <div className="bg-card border border-subtle rounded-xl p-6 text-left">
          <h3 className="text-sm font-bold text-secondary uppercase mb-4">{t('importWizard.complete.summaryTitle')}</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-secondary">{t('importWizard.complete.batchId')}</dt>
              <dd className="text-primary font-mono">{wizard.completedBatch.id}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-secondary">{t('importWizard.complete.transactions')}</dt>
              <dd className="text-primary">{wizard.completedBatch.transactionCount}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-secondary">{t('importWizard.complete.mode')}</dt>
              <dd className="text-primary capitalize">
                {wizard.completedBatch.importMode === 'history'
                  ? t('importWizard.mode.history')
                  : t('importWizard.mode.snapshot')}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-secondary">{t('importWizard.complete.file')}</dt>
              <dd className="text-primary">{wizard.completedBatch.fileName}</dd>
            </div>
          </dl>
        </div>
      )}

      <div className="flex justify-center gap-4">
        <Link to="/">
          <Button size="lg">{t('importWizard.complete.goToDashboard')}</Button>
        </Link>
        <Button variant="secondary" size="lg" onClick={wizard.reset}>
          {t('importWizard.complete.importMore')}
        </Button>
      </div>
    </div>
  );
};

export default ImportWizard;