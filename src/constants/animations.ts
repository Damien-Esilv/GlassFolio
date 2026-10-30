/**
 * animations.ts
 * 
 * Central single source of truth for animation durations and timings across GlassFolio.
 * Change `ANIMATION_DURATION_MS` here to update all chart and UI animations app-wide
 * (cards appearing, bars growing, numbers counting up).
 */

export const ANIMATION_DURATION_MS = 1200;
export const ANIMATION_EASING = 'ease-in-out';
export const STAGGER_DELAY_MS = 100;

/** Pause after a screen (or tab) shows before its entrance animation starts. */
export const ENTRANCE_DELAY_MS = 80;
/** Scale cards start from when they appear (they grow to 1). */
export const ENTRANCE_START_SCALE = 0.92;
/** Cards beyond this rank appear together with it, so a long grid does not take seconds to show. */
export const MAX_STAGGER_STEPS = 12;
