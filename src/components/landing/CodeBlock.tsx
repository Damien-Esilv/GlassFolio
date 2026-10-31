import React from 'react';
import { useTranslation } from 'react-i18next';
import { CopyButton } from './CopyButton';

interface CodeBlockProps {
  /** One shell command per entry; they are copied joined by new lines. */
  lines: readonly string[];
  /** What the commands do, used for the copy button's accessible name. */
  label: string;
  /** Show the shell prompt before each line; off for file content such as a JSON configuration. */
  prompt?: boolean;
  /** Wraps long lines instead of scrolling sideways, for prose such as a prompt. */
  wrap?: boolean;
}

/** Shell snippet with a copy button, styled like the landing install terminal. */
export const CodeBlock: React.FC<CodeBlockProps> = ({ lines, label, prompt = true, wrap = false }) => {
  const { t } = useTranslation();

  return (
    <div className="landing-terminal relative rounded-xl border border-subtle my-4 group">
      <pre className="px-4 py-3.5 pr-24 overflow-x-auto font-mono text-[13px] leading-6 text-primary">
        {lines.map((line, index) => (
          <code key={`${index}-${line}`} className={`block ${wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'}`}>
            {prompt && <span className="text-positive select-none">$ </span>}
            {line}
          </code>
        ))}
      </pre>
      <CopyButton
        text={lines.join('\n')}
        label={t('selfhost:copyLabel', { what: label })}
        className="absolute top-2.5 right-2.5 bg-card"
      />
    </div>
  );
};
