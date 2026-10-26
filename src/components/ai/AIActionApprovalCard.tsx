import React, { useState } from 'react';
import { ShieldCheck, Check, X, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PendingActionProposal } from '../../services/ai/types';

interface AIActionApprovalCardProps {
  proposal: PendingActionProposal;
  onApprove: (actionId: string) => Promise<void>;
  onReject: (actionId: string) => void;
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

  const typeLabel =
    proposal.type === 'record_transaction'
      ? t('ai:actionCard.types.record_transaction')
      : proposal.type === 'create_goal'
      ? t('ai:actionCard.types.create_goal')
      : proposal.type;

  return (
    <div className="mt-3 p-4 rounded-xl bg-subtle border border-subtle shadow-sm space-y-3 text-sm">
      <div className="flex items-center gap-2 font-semibold text-primary">
        <ShieldCheck size={18} className="text-warning" />
        <span>{t('ai:actionCard.title')}</span>
      </div>

      <p className="text-xs text-secondary">{t('ai:actionCard.subtitle')}</p>

      <div className="p-3 rounded-lg bg-card border border-subtle space-y-1.5 text-xs">
        <div className="flex justify-between py-0.5 border-b border-subtle/50">
          <span className="text-tertiary">Type d'action :</span>
          <span className="font-semibold text-primary">{typeLabel}</span>
        </div>

        {Object.entries(proposal.params).map(([key, val]) => {
          if (val === undefined || val === null || val === '') return null;
          const displayKey = t(`ai:actionCard.fields.${key}`, { defaultValue: key });
          return (
            <div key={key} className="flex justify-between py-0.5 border-b border-subtle/30 last:border-0">
              <span className="text-tertiary">{displayKey} :</span>
              <span className="font-medium text-primary text-right">{String(val)}</span>
            </div>
          );
        })}
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
