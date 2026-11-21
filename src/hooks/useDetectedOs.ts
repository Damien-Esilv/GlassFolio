import { useEffect, useState } from 'react';
import type { DesktopOs } from '../config/downloads';

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
 * The visitor's desktop system, known only after the first render: the page is prerendered without any
 * `navigator`, so the first (and server) render stays neutral and the match is highlighted once mounted.
 */
export function useDetectedOs(): DesktopOs | null {
  const [os, setOs] = useState<DesktopOs | null>(null);
  useEffect(() => {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    setOs(detectDesktopOs(nav.userAgent, nav.userAgentData?.platform ?? nav.platform));
  }, []);
  return os;
}
