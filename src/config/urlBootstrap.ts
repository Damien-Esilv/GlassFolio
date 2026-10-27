/**
 * URL Bootstrap & Cross-Subdomain Handoff Consumer (TGLA-058).
 *
 * Reads `?demo=1`, `?theme=...`, and `?lang=...` from the URL parameters
 * (supporting standard query string and hash-attached query string),
 * applies preferences to storage and DOM synchronously,
 * and strips query parameters in-place via `history.replaceState`
 * so the browser's Back button points directly to the referring Showcase.
 */

import {
  setSyncedPublicTheme,
  setSyncedPublicLanguage,
  isPublicBaseTheme,
  isSupportedLanguage,
  type PublicBaseTheme,
  type SupportedLanguage,
} from '../services/storage/publicPreferencesSync';

export type HandoffTheme = PublicBaseTheme;
export type HandoffLanguage = SupportedLanguage;

export interface BootstrapHandoffResult {
  demoRequested: boolean;
  theme?: HandoffTheme;
  lang?: HandoffLanguage;
}

let cachedBootstrapResult: BootstrapHandoffResult | null = null;

export function _resetUrlBootstrapCache(): void {
  cachedBootstrapResult = null;
}

export function consumeUrlBootstrapParams(): BootstrapHandoffResult {
  if (cachedBootstrapResult) {
    return cachedBootstrapResult;
  }

  if (typeof window === 'undefined') {
    return { demoRequested: false };
  }

  let demoRequested = false;
  let handoffTheme: HandoffTheme | undefined;
  let handoffLang: HandoffLanguage | undefined;

  // 1. Search in window.location.search
  const searchParams = new URLSearchParams(window.location.search);

  // 2. Search in hash query string (e.g., #/?demo=1 or #/login?theme=dark)
  const hash = window.location.hash;
  const hashQuestionIndex = hash.indexOf('?');
  let hashSearchParams: URLSearchParams | null = null;
  if (hashQuestionIndex !== -1) {
    hashSearchParams = new URLSearchParams(hash.slice(hashQuestionIndex));
  }

  const rawDemo = searchParams.get('demo') || hashSearchParams?.get('demo');
  if (rawDemo === '1' || rawDemo === 'true') {
    demoRequested = true;
  }

  const rawTheme = (searchParams.get('theme') || hashSearchParams?.get('theme'))?.toLowerCase();
  if (isPublicBaseTheme(rawTheme)) {
    handoffTheme = rawTheme;
    setSyncedPublicTheme(rawTheme);
    const root = document.documentElement;
    root.setAttribute('data-theme', rawTheme);
    if (rawTheme === 'light') {
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
    }
  }

  const rawLang = (searchParams.get('lang') || hashSearchParams?.get('lang'))?.toLowerCase();
  if (isSupportedLanguage(rawLang)) {
    handoffLang = rawLang;
    setSyncedPublicLanguage(rawLang);
  }

  // 3. Clean the URL in-place without adding an extra history entry
  const shouldCleanSearch =
    searchParams.has('demo') || searchParams.has('theme') || searchParams.has('lang');
  const shouldCleanHash =
    hashSearchParams &&
    (hashSearchParams.has('demo') || hashSearchParams.has('theme') || hashSearchParams.has('lang'));

  if (shouldCleanSearch || shouldCleanHash) {
    searchParams.delete('demo');
    searchParams.delete('theme');
    searchParams.delete('lang');

    const cleanSearch = searchParams.toString() ? `?${searchParams.toString()}` : '';
    let cleanHash = hash;
    if (hashQuestionIndex !== -1 && hashSearchParams) {
      hashSearchParams.delete('demo');
      hashSearchParams.delete('theme');
      hashSearchParams.delete('lang');
      const remainingHashQuery = hashSearchParams.toString()
        ? `?${hashSearchParams.toString()}`
        : '';
      cleanHash = hash.slice(0, hashQuestionIndex) + remainingHashQuery;
    }

    const cleanUrl = `${window.location.pathname}${cleanSearch}${cleanHash}`;
    window.history.replaceState(window.history.state, '', cleanUrl);
  }

  cachedBootstrapResult = {
    demoRequested,
    theme: handoffTheme,
    lang: handoffLang,
  };

  return cachedBootstrapResult;
}
