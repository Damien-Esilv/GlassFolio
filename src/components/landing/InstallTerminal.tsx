import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { animate, m, useInView, useReducedMotion } from 'motion/react';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import { CopyButton } from './CopyButton';
import { DOCKER_QUICKSTART_COMMANDS, SELF_HOST_DEFAULT_URL } from '../../config/project';

const TOTAL_CHARS = DOCKER_QUICKSTART_COMMANDS.reduce((sum, command) => sum + command.length, 0);
const TYPING_DURATION_S = 2.6;

/**
 * Terminal that types the Docker quick start, then prints what the container reports.
 * The full transcript is rendered until the terminal scrolls into view, so it reads
 * correctly without animation (reduced motion, no IntersectionObserver, print).
 */
export const InstallTerminal: React.FC = () => {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.5 });
  const prefersReducedMotion = useReducedMotion();
  const [typedChars, setTypedChars] = useState(TOTAL_CHARS);
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    if (!isInView || prefersReducedMotion) return;
    setTypedChars(0);
    const controls = animate(0, TOTAL_CHARS, {
      duration: TYPING_DURATION_S,
      ease: 'linear',
      onUpdate: (latest) => setTypedChars(Math.floor(latest)),
      onComplete: () => setTypedChars(TOTAL_CHARS),
    });
    return () => controls.stop();
  }, [isInView, prefersReducedMotion, runId]);

  const isDone = typedChars >= TOTAL_CHARS;
  let remaining = typedChars;
  const lines = DOCKER_QUICKSTART_COMMANDS.map((command) => {
    const visible = command.slice(0, Math.max(0, remaining));
    const isTyping = remaining > 0 && remaining < command.length;
    remaining -= command.length;
    return { command, visible, isTyping, started: visible.length > 0 };
  });
  const activeLine = lines.findIndex((line) => line.visible.length < line.command.length);

  const outputs = [
    t('landing:localCloud.terminal.built'),
    t('landing:localCloud.terminal.volume'),
    t('landing:localCloud.terminal.running', { url: SELF_HOST_DEFAULT_URL }),
  ];

  return (
    <div ref={ref} className="landing-terminal rounded-2xl border border-strong shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-subtle bg-card">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="w-2.5 h-2.5 rounded-full bg-negative opacity-70" />
          <span className="w-2.5 h-2.5 rounded-full bg-warning opacity-70" />
          <span className="w-2.5 h-2.5 rounded-full bg-positive opacity-70" />
        </div>
        <span className="text-[11px] font-semibold text-tertiary truncate">
          {t('landing:localCloud.terminal.title')}
        </span>
        <div className="flex items-center gap-1.5">
          {!prefersReducedMotion && (
            <button
              type="button"
              onClick={() => setRunId((id) => id + 1)}
              disabled={!isDone}
              aria-label={t('landing:localCloud.terminal.replay')}
              className="p-1.5 rounded-lg text-tertiary hover:text-primary hover:bg-subtle transition-colors disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <RotateCcw size={14} />
            </button>
          )}
          <CopyButton
            text={DOCKER_QUICKSTART_COMMANDS.join('\n')}
            label={t('landing:localCloud.terminal.copyLabel')}
          />
        </div>
      </div>

      <div className="px-4 sm:px-5 py-5 font-mono text-[13px] leading-7 min-h-[15rem] overflow-x-auto">
        {/* Screen readers get the commands once, as plain text, instead of the typing effect. */}
        <p className="sr-only">{DOCKER_QUICKSTART_COMMANDS.join(' && ')}</p>
        <ol aria-hidden="true">
          {lines.map((line, index) => (
            <li key={line.command} className={`whitespace-pre ${line.started || index === activeLine ? '' : 'invisible'}`}>
              <span className="text-positive select-none">$ </span>
              <span className="text-primary">{line.visible}</span>
              {(line.isTyping || (index === activeLine && !line.started)) && <span className="landing-caret" />}
            </li>
          ))}
        </ol>

        <ul className="mt-3 space-y-0.5" aria-label={t('landing:localCloud.terminal.outputLabel')}>
          {outputs.map((output, index) => (
            <m.li
              key={`${runId}-${output}`}
              initial={false}
              animate={isDone ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
              transition={{ delay: isDone ? index * 0.35 : 0, duration: 0.3 }}
              className={`flex items-center gap-2 whitespace-pre ${index === outputs.length - 1 ? 'text-positive font-semibold' : 'text-secondary'}`}
            >
              <CheckCircle2 size={14} className="shrink-0 text-positive" />
              <span>{output}</span>
            </m.li>
          ))}
        </ul>
      </div>
    </div>
  );
};
