import React from 'react';
import { m } from 'motion/react';
import { Terminal } from 'lucide-react';
import type { DesktopOs } from '../../config/downloads';

/** The four panes of the Windows logo (the icon set has no brand logos). */
const WindowsLogo: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M3 5.6 10.8 4.5v7H3zM12 4.3 21 3v8.5h-9zM3 12.5h7.8v7L3 18.4zM12 12.5h9V21l-9-1.3z" />
  </svg>
);

/** The solid Apple logo (the icon set only has an outlined fruit). */
const AppleLogo: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
  </svg>
);

/** Logo of a system, drawn in the current text color. */
export const OsLogo: React.FC<{ os: DesktopOs; size?: number }> = ({ os, size = 22 }) => {
  if (os === 'win') return <WindowsLogo size={size} />;
  if (os === 'mac') return <AppleLogo size={size} />;
  return <Terminal size={size} aria-hidden="true" />;
};

interface DownloadButtonProps {
  os: DesktopOs;
  /** "Download for Windows", "Download"… */
  label: string;
  /** File type shown in a chip on the right: "exe", "dmg", "AppImage", "deb". */
  format: string;
  /** Link of the installer. Without it the button is a muted, non-clickable one ("coming soon"). */
  href?: string;
  size?: 'lg' | 'md';
  className?: string;
}

const base =
  'group relative overflow-hidden inline-flex items-center justify-between gap-4 whitespace-nowrap font-bold rounded-2xl transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-canvas';
const sizes = { lg: 'text-base pl-6 pr-4 py-3.5', md: 'text-sm pl-5 pr-3 py-2.5' } as const;

/**
 * Download button: the logo of the system, what it does, and the file type in a small chip,
 * so people see at a glance that Windows gets an .exe and a Mac a .dmg.
 */
export const DownloadButton: React.FC<DownloadButtonProps> = ({ os, label, format, href, size = 'lg', className = '' }) => {
  const content = (
    <>
      {/* A soft light sweeps across the button on hover (not for reduced motion) */}
      {href && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/25 to-transparent -translate-x-full transition-transform duration-700 ease-out group-hover:translate-x-[300%] motion-reduce:hidden"
        />
      )}
      <span className="relative inline-flex items-center gap-3">
        <span className="inline-flex transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6 motion-reduce:transition-none">
          <OsLogo os={os} size={size === 'lg' ? 24 : 20} />
        </span>
        <span>{label}</span>
      </span>
      <span
        className={`relative rounded-lg px-2.5 py-1 font-mono text-xs sm:text-sm font-semibold transition-colors ${
          href ? 'bg-white/20 text-white group-hover:bg-white/30' : 'bg-card text-tertiary'
        }`}
      >
        .{format}
      </span>
    </>
  );

  if (!href) {
    return (
      <span aria-disabled="true" className={`${base} ${sizes[size]} bg-subtle border border-subtle text-tertiary cursor-not-allowed ${className}`}>
        {content}
      </span>
    );
  }
  return (
    <m.a
      href={href}
      rel="noopener noreferrer"
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      className={`${base} ${sizes[size]} bg-primary hover:bg-primary-hover text-white shadow-lg ${className}`}
    >
      {content}
    </m.a>
  );
};
