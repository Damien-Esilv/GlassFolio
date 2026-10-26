import React from 'react';

interface BrowserFrameProps {
  /** Text shown in the fake address bar (e.g. "localhost:3000"). */
  address: string;
  children: React.ReactNode;
  className?: string;
}

/** Decorative browser chrome around a product screenshot. */
export const BrowserFrame: React.FC<BrowserFrameProps> = ({ address, children, className }) => (
  <div className={`rounded-2xl border border-strong bg-card shadow-2xl overflow-hidden ${className ?? ''}`}>
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-subtle bg-subtle" aria-hidden="true">
      <div className="flex gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full bg-negative opacity-70" />
        <span className="w-2.5 h-2.5 rounded-full bg-warning opacity-70" />
        <span className="w-2.5 h-2.5 rounded-full bg-positive opacity-70" />
      </div>
      <span className="flex-1 max-w-md mx-auto text-center text-[11px] text-tertiary bg-card rounded-md py-1 truncate">
        {address}
      </span>
      <span className="w-10" />
    </div>
    {children}
  </div>
);

/** Intrinsic size of the captures in public/screenshots (scripts/capture-screenshots.mjs). */
export const SCREENSHOT_WIDTH = 2160;
export const SCREENSHOT_HEIGHT = 1350;
