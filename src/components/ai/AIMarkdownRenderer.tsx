import React, { useState, useEffect } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Brain,
  Copy,
  Check,
  Terminal,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface AIMarkdownRendererProps {
  content: string;
  isLiveThinking?: boolean;
}

export const AIMarkdownRenderer: React.FC<AIMarkdownRendererProps> = ({
  content,
  isLiveThinking = false,
}) => {
  const { t } = useTranslation();
  const [isThoughtOpen, setIsThoughtOpen] = useState(isLiveThinking);
  const [copiedThought, setCopiedThought] = useState(false);

  // Auto-expand during live thinking, auto-collapse when generation is complete
  useEffect(() => {
    if (isLiveThinking) {
      setIsThoughtOpen(true);
    } else {
      setIsThoughtOpen(false);
    }
  }, [isLiveThinking]);

  if (!content) return null;

  // 1. Separate thinking block (<think>...</think>) from main content
  let thoughtText: string | null = null;
  let mainContent = content;

  const thinkRegex = /<think>([\s\S]*?)(?:<\/think>|$)/i;
  const match = content.match(thinkRegex);
  if (match) {
    thoughtText = match[1].trim();
    mainContent = content.replace(thinkRegex, '').trim();
  }

  const handleCopyThought = () => {
    if (!thoughtText) return;
    navigator.clipboard.writeText(thoughtText);
    setCopiedThought(true);
    setTimeout(() => setCopiedThought(false), 2000);
  };

  const thoughtWords = thoughtText ? thoughtText.trim().split(/\s+/).length : 0;

  return (
    <div className="space-y-3 font-sans text-xs leading-relaxed text-primary">
      {/* Reasoning / Thought Process Block */}
      {thoughtText && (
        <div
          className={`rounded-xl border transition-all overflow-hidden ${
            isLiveThinking
              ? 'border-brand/40 bg-brand/5 shadow-sm'
              : 'border-subtle bg-subtle/40'
          }`}
        >
          {/* Header Bar */}
          <div className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-medium text-secondary hover:bg-subtle/60 transition-colors">
            <button
              type="button"
              onClick={() => setIsThoughtOpen(!isThoughtOpen)}
              className="flex items-center gap-2 flex-1 text-left min-w-0"
              aria-expanded={isThoughtOpen}
            >
              <Brain
                size={14}
                className={isLiveThinking ? 'text-brand animate-pulse shrink-0' : 'text-brand shrink-0'}
              />
              <span className="text-primary font-semibold truncate">
                {isLiveThinking ? t('ai:markdown.thinkingLive') : t('ai:markdown.thoughtProcess')}
              </span>
              {!isLiveThinking && thoughtWords > 0 && (
                <span className="text-[10px] text-tertiary">
                  ({t('ai:markdown.words', { count: thoughtWords })})
                </span>
              )}
            </button>

            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              {/* Copy thoughts inline button */}
              <button
                type="button"
                onClick={handleCopyThought}
                className="p-1 rounded-md text-tertiary hover:text-primary hover:bg-card transition-colors flex items-center gap-1"
                title={copiedThought ? t('ai:markdown.thoughtCopied') : t('ai:markdown.copyThought')}
                aria-label={copiedThought ? t('ai:markdown.thoughtCopied') : t('ai:markdown.copyThought')}
              >
                {copiedThought ? <Check size={13} className="text-success" /> : <Copy size={13} />}
              </button>

              {/* Inline accordion chevron */}
              <button
                type="button"
                onClick={() => setIsThoughtOpen(!isThoughtOpen)}
                className="p-1 rounded-md text-tertiary hover:text-primary hover:bg-card transition-colors flex items-center gap-1"
                title={isThoughtOpen ? t('ai:markdown.hideThought') : t('ai:markdown.showThought')}
                aria-label={isThoughtOpen ? t('ai:markdown.hideThought') : t('ai:markdown.showThought')}
              >
                {isThoughtOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
            </div>
          </div>

          {/* Inline Expanded Thoughts Body */}
          {isThoughtOpen && (
            <div className="px-3 pb-3 pt-1 border-t border-subtle/50 text-[11px] text-secondary font-mono whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto bg-canvas/40 select-text">
              {thoughtText}
              {isLiveThinking && (
                <span className="inline-block w-1.5 h-3 ml-1 bg-brand animate-pulse align-middle" />
              )}
            </div>
          )}
        </div>
      )}

      {/* Main Markdown Content */}
      {mainContent && <MarkdownBody text={mainContent} />}
    </div>
  );
};

/**
 * Parses and renders Markdown blocks (Code, Headings, Lists, Tables, Blockquotes, Paragraphs)
 */
const MarkdownBody: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Fenced Code Block: ```lang
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <CodeBlock key={`code-${i}`} language={lang} code={codeLines.join('\n')} />
      );
      i++;
      continue;
    }

    // Markdown Table: lines starting and ending with |
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      elements.push(<MarkdownTable key={`table-${i}`} lines={tableLines} />);
      continue;
    }

    // Headings
    if (line.startsWith('### ')) {
      elements.push(
        <h4 key={`h3-${i}`} className="text-xs font-bold text-primary mt-3 mb-1">
          {renderInlineMarkdown(line.slice(4))}
        </h4>
      );
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h3 key={`h2-${i}`} className="text-sm font-bold text-primary mt-3.5 mb-1.5">
          {renderInlineMarkdown(line.slice(3))}
        </h3>
      );
      i++;
      continue;
    }
    if (line.startsWith('# ')) {
      elements.push(
        <h2 key={`h1-${i}`} className="text-base font-bold text-primary mt-4 mb-2">
          {renderInlineMarkdown(line.slice(2))}
        </h2>
      );
      i++;
      continue;
    }

    // Horizontal Rule / Divider: ---, ***, ___ (at least 3 characters)
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(line.trim().replace(/\s+/g, ''))) {
      elements.push(
        <hr key={`hr-${i}`} className="my-3 border-t border-subtle" />
      );
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <blockquote
          key={`quote-${i}`}
          className="border-l-2 border-brand/60 pl-3 py-1 my-2 text-secondary italic bg-subtle/20 rounded-r-lg"
        >
          {quoteLines.map((ql, qIdx) => (
            <p key={qIdx}>{renderInlineMarkdown(ql)}</p>
          ))}
        </blockquote>
      );
      continue;
    }

    // Unordered List Items: - or *
    if (line.trim().match(/^[-*]\s+/)) {
      const listItems: string[] = [];
      while (i < lines.length && lines[i].trim().match(/^[-*]\s+/)) {
        listItems.push(lines[i].trim().replace(/^[-*]\s+/, ''));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="list-disc pl-5 space-y-1 my-1.5 text-primary">
          {listItems.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInlineMarkdown(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered List Items: 1. 2.
    if (line.trim().match(/^\d+\.\s+/)) {
      const listItems: string[] = [];
      while (i < lines.length && lines[i].trim().match(/^\d+\.\s+/)) {
        listItems.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="list-decimal pl-5 space-y-1 my-1.5 text-primary">
          {listItems.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInlineMarkdown(item)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Empty lines (spacing)
    if (!line.trim()) {
      elements.push(<div key={`sp-${i}`} className="h-1" />);
      i++;
      continue;
    }

    // Regular Paragraph
    elements.push(
      <p key={`p-${i}`} className="leading-relaxed mb-1.5 last:mb-0">
        {renderInlineMarkdown(line)}
      </p>
    );
    i++;
  }

  return <>{elements}</>;
};

/**
 * Handles inline styles: **bold**, *italic*, `code`, ~~strike~~
 */
function renderInlineMarkdown(text: string): React.ReactNode {
  // Pattern matching bold (**text**), inline code (`code`), italic (*text*), strikethrough (~~text~~)
  const regex = /(\*\*.*?\*\*|`.*?`|\*.*?\*|~~.*?~~)/g;
  const parts = text.split(regex);

  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={idx} className="font-semibold text-primary">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 rounded text-[11px] font-mono bg-subtle text-brand border border-subtle"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('~~') && part.endsWith('~~') && part.length >= 4) {
      return (
        <del key={idx} className="line-through text-tertiary">
          {part.slice(2, -2)}
        </del>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return (
        <em key={idx} className="italic text-secondary">
          {part.slice(1, -1)}
        </em>
      );
    }
    return part;
  });
}

/**
 * Code Block with syntax header and copy button
 */
const CodeBlock: React.FC<{ language: string; code: string }> = ({ language, code }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-subtle bg-subtle/50 overflow-hidden my-2.5">
      <div className="flex items-center justify-between px-3 py-1.5 bg-subtle/80 border-b border-subtle text-[10px] text-secondary font-mono">
        <div className="flex items-center gap-1.5">
          <Terminal size={12} className="text-tertiary" />
          <span>{language || 'code'}</span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-primary transition-colors py-0.5 px-1.5 rounded hover:bg-card"
        >
          {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
          <span>{copied ? t('ai:markdown.copied') : t('ai:markdown.copyCode')}</span>
        </button>
      </div>
      <pre className="p-3 text-[11px] font-mono text-primary overflow-x-auto whitespace-pre leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
};

/**
 * Markdown Table renderer
 */
const MarkdownTable: React.FC<{ lines: string[] }> = ({ lines }) => {
  if (lines.length === 0) return null;

  // Filter out separator lines like |---|---|
  const isSeparator = (l: string) => /^\|(\s*:?-+:?\s*\|)+$/.test(l.trim());
  const headerLine = lines[0];
  const bodyLines = lines.slice(1).filter((l) => !isSeparator(l));

  const parseCells = (row: string) =>
    row
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());

  const headers = parseCells(headerLine);

  return (
    <div className="my-2.5 overflow-x-auto rounded-xl border border-subtle">
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="bg-subtle/70 border-b border-subtle text-primary font-bold">
            {headers.map((h, i) => (
              <th key={i} className="px-3 py-2 text-[11px]">
                {renderInlineMarkdown(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-subtle/50">
          {bodyLines.map((row, rIdx) => {
            const cells = parseCells(row);
            return (
              <tr key={rIdx} className="hover:bg-subtle/20 transition-colors">
                {cells.map((cell, cIdx) => (
                  <td key={cIdx} className="px-3 py-1.5 text-[11px] text-secondary">
                    {renderInlineMarkdown(cell)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
