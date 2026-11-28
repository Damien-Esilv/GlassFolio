import React, { useState } from 'react';
import { ShieldCheck, Check, X, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PendingActionProposal } from '../../services/ai/types';

interface AIActionApprovalCardProps {
  proposal: PendingActionProposal;
  onApprove: (actionId: string) => Promise<void>;
  onReject: (actionId: string) => void;
}

interface ImportSampleRowPreview {
  date: string;
  type: string;
  asset: string;
  quantity?: string;
  amount: string;
  currency?: string;
}

export const AIActionApprovalCard: React.FC<AIActionApprovalCardProps> = ({
  proposal,
  onApprove,
  onReject,
}) => {
  const { t } = useTranslation();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleApprove = async () => {
    setIsProcessing(true);
    try {
      await onApprove(proposal.id);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = () => {
    onReject(proposal.id);
  };

  const isPending = proposal.status === 'pending';
  const isExecuted = proposal.status === 'executed';
  const isRejected = proposal.status === 'rejected';

  const typeLabelMap: Record<string, string> = {
    record_transaction: t('ai:actionCard.types.record_transaction'),
    create_goal: t('ai:actionCard.types.create_goal'),
    import_transactions: t('ai:actionCard.types.import_transactions'),
    import_snapshot: t('ai:actionCard.types.import_snapshot'),
    set_transaction_category: t('ai:actionCard.types.set_transaction_category'),
    create_cashflow_category: t('ai:actionCard.types.create_cashflow_category'),
    create_categorization_rule: t('ai:actionCard.types.create_categorization_rule'),
    record_cash_operation: t('ai:actionCard.types.record_cash_operation'),
    set_recurring_status: t('ai:actionCard.types.set_recurring_status'),
    set_cash_account_kind: t('ai:actionCard.types.set_cash_account_kind'),
    set_budget: t('ai:actionCard.types.set_budget'),
    update_cashflow_operation: t('ai:actionCard.types.update_cashflow_operation'),
  };
  const typeLabel = typeLabelMap[proposal.type] ?? proposal.type;

  const isImportTransactions = proposal.toolName === 'import_transactions' || proposal.type === 'import_transactions';
  const preview = proposal.previewData || {};
  const sampleRows = Array.isArray(preview.sampleRows)
    ? (preview.sampleRows as ImportSampleRowPreview[])
    : [];
  const dateRange =
    preview.dateRange && typeof preview.dateRange === 'object'
      ? (preview.dateRange as { start?: string; end?: string })
      : null;

  return (
    <div className="mt-3 p-4 rounded-xl bg-subtle border border-subtle shadow-sm space-y-3 text-sm">
      <div className="flex items-center gap-2 font-semibold text-primary">
        <ShieldCheck size={18} className="text-warning" />
        <span>{t('ai:actionCard.title')}</span>
      </div>

      <p className="text-xs text-secondary">{t('ai:actionCard.subtitle')}</p>

      <div className="p-3 rounded-lg bg-card border border-subtle space-y-1.5 text-xs">
        <div className="flex justify-between py-0.5 border-b border-subtle/50">
          <span className="text-tertiary">{t('ai:actionCard.actionType')} :</span>
          <span className="font-semibold text-primary">{typeLabel}</span>
        </div>

        {isImportTransactions ? (
          <div className="space-y-2 pt-1">
            {Boolean(preview.accountName) && (
              <div className="flex justify-between py-0.5 border-b border-subtle/30">
                <span className="text-tertiary">{t('ai:actionCard.importPreview.account')} :</span>
                <span className="font-medium text-primary">{String(preview.accountName)}</span>
              </div>
            )}
            {Boolean(preview.fileName) && (
              <div className="flex justify-between py-0.5 border-b border-subtle/30">
                <span className="text-tertiary">{t('ai:actionCard.importPreview.file')} :</span>
                <span className="font-medium text-primary truncate max-w-[200px]">{String(preview.fileName)}</span>
              </div>
            )}
            {dateRange?.start && dateRange?.end && (
              <div className="flex justify-between py-0.5 border-b border-subtle/30">
                <span className="text-tertiary">{t('ai:actionCard.importPreview.period')} :</span>
                <span className="font-medium text-primary">{dateRange.start} → {dateRange.end}</span>
              </div>
            )}
            <div className="flex flex-wrap gap-2 py-1">
              <span className="px-2 py-0.5 rounded-md bg-subtle text-positive font-semibold">
                {t('ai:actionCard.importPreview.valid', { count: Number(preview.validCount ?? 0) })}
              </span>
              {Number(preview.duplicateCount ?? 0) > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-subtle text-warning font-medium">
                  {t('ai:actionCard.importPreview.duplicates', { count: Number(preview.duplicateCount ?? 0) })}
                </span>
              )}
              {Number(preview.errorCount ?? 0) > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-subtle text-negative font-medium">
                  {t('ai:actionCard.importPreview.errors', { count: Number(preview.errorCount ?? 0) })}
                </span>
              )}
            </div>

            {sampleRows.length > 0 && (
              <div className="overflow-x-auto border border-subtle rounded-lg">
                <table className="w-full text-[11px] text-left">
                  <thead className="bg-subtle text-tertiary">
                    <tr>
                      <th className="px-2 py-1 font-medium">{t('ai:actionCard.importPreview.date')}</th>
                      <th className="px-2 py-1 font-medium">{t('ai:actionCard.importPreview.type')}</th>
                      <th className="px-2 py-1 font-medium">{t('ai:actionCard.importPreview.asset')}</th>
                      <th className="px-2 py-1 font-medium text-right">{t('ai:actionCard.importPreview.amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sampleRows.slice(0, 5).map((row, idx) => (
                      <tr key={`${row.date}-${row.asset}-${idx}`} className="border-t border-subtle/50">
                        <td className="px-2 py-1 whitespace-nowrap text-secondary">{row.date}</td>
                        <td className="px-2 py-1 font-medium text-primary">{row.type}</td>
                        <td className="px-2 py-1 text-primary">{row.asset}</td>
                        <td className="px-2 py-1 text-right font-medium text-primary whitespace-nowrap">
                          {row.amount}{row.currency ? ` ${row.currency}` : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          Object.entries(proposal.params).map(([key, val]) => {
            if (val === undefined || val === null || val === '') return null;
            const formatted =
              typeof val === 'string' && val.length > 160
                ? `${val.slice(0, 160)}…`
                : Array.isArray(val)
                ? `${val.length} item(s)`
                : typeof val === 'object'
                ? JSON.stringify(val)
                : String(val);
            const displayKey = t(`ai:actionCard.fields.${key}`, { defaultValue: key });
            return (
              <div key={key} className="flex justify-between py-0.5 border-b border-subtle/30 last:border-0 gap-2">
                <span className="text-tertiary shrink-0">{displayKey} :</span>
                <span className="font-medium text-primary text-right break-all">{formatted}</span>
              </div>
            );
          })
        )}
      </div>

      {isPending && (
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={handleApprove}
            disabled={isProcessing}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-success text-white font-medium text-xs hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>{t('ai:actionCard.executing')}</span>
              </>
            ) : (
              <>
                <Check size={14} />
                <span>{t('ai:actionCard.confirm')}</span>
              </>
            )}
          </button>

          <button
            onClick={handleReject}
            disabled={isProcessing}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-subtle text-secondary hover:text-error border border-subtle font-medium text-xs transition-colors disabled:opacity-50"
          >
            <X size={14} />
            <span>{t('ai:actionCard.reject')}</span>
          </button>
        </div>
      )}

      {isExecuted && (
        <div className="flex items-center gap-1.5 text-xs text-success font-medium pt-1">
          <Check size={14} />
          <span>{t('ai:actionCard.confirmed')}</span>
        </div>
      )}

      {isRejected && (
        <div className="flex items-center gap-1.5 text-xs text-tertiary font-medium pt-1">
          <X size={14} />
          <span>{t('ai:actionCard.rejected')}</span>
        </div>
      )}
    </div>
  );
};
