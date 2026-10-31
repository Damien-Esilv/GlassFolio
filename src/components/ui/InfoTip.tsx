import React, { useId, useState } from 'react';
import { Info } from 'lucide-react';

interface InfoTipProps {
  /** Accessible name of the "i" button, for example "Why is the token needed?" */
  label: string;
  children: React.ReactNode;
}

/**
 * A small "i" that opens an explanation below it, on the full width of its line, readable on a phone and with a
 * keyboard. Put it in a `flex flex-wrap` row: the explanation takes a line of its own under the label and the "i",
 * instead of squeezing the label next to it.
 */
export const InfoTip: React.FC<InfoTipProps> = ({ label, children }) => {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center justify-center w-5 h-5 shrink-0 rounded-full text-tertiary hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary transition-colors"
      >
        <Info size={14} aria-hidden="true" />
      </button>
      {open && (
        <span id={panelId} role="note" className="block basis-full w-full p-3 rounded-xl bg-subtle border border-subtle text-[11px] text-secondary leading-relaxed font-normal">
          {children}
        </span>
      )}
    </>
  );
};
