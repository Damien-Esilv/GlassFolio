import type { AuthResult } from './authTypes';

/**
 * The Google redirect delivers its tokens in a URL fragment that is scrubbed as soon as it is parsed,
 * so the callback may only ever run once per page load. The page that triggers it can be unmounted and
 * mounted again mid-flight (the app shell swaps layout as soon as the user is signed in), so the run
 * lives here, outside React, and every mount of the page attaches to the same promise.
 */
let currentRun: Promise<AuthResult> | null = null;

export const runGoogleCallbackOnce = (start: () => Promise<AuthResult>): Promise<AuthResult> => {
    currentRun ??= start();
    return currentRun;
};

/** Test helper: forget the run of the previous page load. */
export const resetGoogleCallbackRun = (): void => {
    currentRun = null;
};
