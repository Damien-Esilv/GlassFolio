import { useEffect, useState } from 'react';
import type { DesktopArch, DesktopOs } from '../config/downloads';

/** The desktop system a visitor is on, from the user agent. Phones and tablets are not desktop systems (null). */
export function detectDesktopOs(userAgent: string, platform = ''): DesktopOs | null {
  const ua = userAgent.toLowerCase();
  const hint = platform.toLowerCase();
  if (/android|iphone|ipad|ipod|cros/.test(ua)) return null;
  if (hint.includes('win') || ua.includes('windows')) return 'win';
  if (hint.includes('mac') || ua.includes('macintosh') || ua.includes('mac os x')) return 'mac';
  if (hint.includes('linux') || ua.includes('linux') || ua.includes('x11')) return 'linux';
  return null;
}

/**
 * The Mac chip from the `architecture` client hint of Chromium browsers ("arm" on Apple Silicon, "x86" on Intel).
 * Safari and Firefox do not expose it: null means "unknown", and the page then proposes Apple Silicon first.
 */
export function macArchFromHint(architecture: string | undefined): DesktopArch | null {
  if (architecture === 'arm') return 'arm64';
  if (architecture === 'x86') return 'x64';
  return null;
}

export interface DetectedPlatform {
  os: DesktopOs | null;
  /** Only known on a Mac, and only with a Chromium browser. */
  macArch: DesktopArch | null;
  /** False until the browser has been asked: the prerendered page, and the first render, stay neutral. */
  resolved: boolean;
}

interface UserAgentData {
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }>;
}

/**
 * The visitor's system, known only after the first render: the page is prerendered without any
 * `navigator`, so the first (and server) render stays neutral and the match is shown once mounted.
 */
export function useDetectedPlatform(): DetectedPlatform {
  const [detected, setDetected] = useState<DetectedPlatform>({ os: null, macArch: null, resolved: false });

  useEffect(() => {
    let active = true;
    const nav = navigator as Navigator & { userAgentData?: UserAgentData };
    const os = detectDesktopOs(nav.userAgent, nav.userAgentData?.platform ?? nav.platform);
    setDetected({ os, macArch: null, resolved: true });
    if (os === 'mac' && nav.userAgentData?.getHighEntropyValues) {
      nav.userAgentData
        .getHighEntropyValues(['architecture'])
        .then((values) => {
          if (active) setDetected((current) => ({ ...current, macArch: macArchFromHint(values.architecture) }));
        })
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, []);

  return detected;
}
