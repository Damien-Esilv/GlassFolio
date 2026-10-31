import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy } from 'lucide-react';

interface CopyBlockProps {
  title: string;
  /** What is copied. */
  text: string;
  /** What is shown, when it differs (a token hidden on screen). */
  display?: string;
  /** Limits the height of a long text, which then scrolls. */
  scrollable?: boolean;
}

/** A piece of text to copy: a snippet, a command, a prompt. */
export const CopyBlock: React.FC<CopyBlockProps> = ({ title, text, display, scrollable = false }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = (): void => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-secondary">{title}</span>
        <button type="button" onClick={copy} aria-label={`${t('ai:mcpBridge.copy')}: ${title}`} className="flex items-center gap-1.5 text-xs text-secondary hover:text-primary transition-colors">
          {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
          <span>{copied ? t('ai:mcpBridge.copied') : t('ai:mcpBridge.copy')}</span>
        </button>
      </div>
      <pre className={`p-3 rounded-xl bg-subtle border border-subtle text-[11px] font-mono text-primary overflow-x-auto whitespace-pre-wrap break-all ${scrollable ? 'max-h-40 overflow-y-auto' : ''}`}>{display ?? text}</pre>
    </div>
  );
};
