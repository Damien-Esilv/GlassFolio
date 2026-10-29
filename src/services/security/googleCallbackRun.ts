import type { GoogleCeremonyIntent } from './googleOidcService';

/**
 * The Google redirect delivers its tokens in a URL fragment that is scrubbed as soon as it is parsed,
 * so the callback may only ever run once per page load. The page that triggers it can be unmounted and
 * mounted again mid-flight (the app shell swaps layout as soon as the user is signed in), so the run
 * lives here, outside React, and every mount of the page attaches to the same promise.
 */
let currentRun: Promise<unknown> | null = null;
let currentIntent: GoogleCeremonyIntent | null = null;

/** The intent of this page load, read once: parsing the callback consumes the stored ceremony. */
export const getGoogleCallbackIntent = (peek: () => GoogleCeremonyIntent): GoogleCeremonyIntent => {
    currentIntent ??= peek();
    return currentIntent;
};

export const runGoogleCallbackOnce = <T>(start: () => Promise<T>): Promise<T> => {
    currentRun ??= start();
    return currentRun as Promise<T>;
};

/** Test helper: forget the run of the previous page load. */
export const resetGoogleCallbackRun = (): void => {
    currentRun = null;
    currentIntent = null;
};
