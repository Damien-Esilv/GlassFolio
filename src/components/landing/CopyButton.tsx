import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy } from 'lucide-react';

interface CopyButtonProps {
  text: string;
  /** Accessible name, e.g. "Copy install commands". */
  label: string;
  className?: string;
}

const COPIED_FEEDBACK_MS = 2000;

/** Copies `text` and confirms in place; the confirmation is announced to screen readers. */
export const CopyButton: React.FC<CopyButtonProps> = ({ text, label, className }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={label}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-subtle bg-subtle text-secondary hover:text-primary hover:bg-card-hover transition-colors focus:outline-none focus:ring-2 focus:ring-primary ${className ?? ''}`}
    >
      {copied ? <Check size={14} className="text-positive" /> : <Copy size={14} />}
      <span aria-live="polite">{copied ? t('landing:common.copied') : t('landing:common.copy')}</span>
    </button>
  );
};
