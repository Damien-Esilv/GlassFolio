/**
 * Derives Tailwind's semantic color tables from the theme stylesheet (src/index.css), so a color
 * is declared ONCE, as a CSS variable, and never needs to be repeated in tailwind.config.ts.
 *
 * Naming contract (variable -> utility):
 *   --color-<name>   ->  <name>   in `colors`           (text-<name>, bg-<name>, border-<name>, ring-<name>, ...)
 *   --text-<name>    ->  <name>   in `textColor`        (text-<name>)
 *   --bg-<name>      ->  <name>   in `backgroundColor`  (bg-<name>)
 *   --border-<name>  ->  <name>   in `borderColor`      (border-<name>)
 * Each entry resolves to `color-mix(in srgb, var(--...) calc(<alpha-value> * 100%), transparent)`: the single
 * parent variable decides the color (active theme via data-theme) and Tailwind fills `<alpha-value>`, so opacity
 * modifiers (`bg-brand/10`, `border-subtle/60`) work. Without a modifier Tailwind substitutes 1 (100% = the exact variable).
 * Pure functions on a string: no file access here (tailwind.config.ts reads the file).
 */

/** Utility name -> CSS variable, for the few names that do not follow the contract above. */
export const BORDER_COLOR_ALIASES = Object.freeze({
  border: '--border-subtle', // `border-border`
});

/** @param {string} variable e.g. '--color-brand' */
export function colorValue(variable) {
  return `color-mix(in srgb, var(${variable}) calc(<alpha-value> * 100%), transparent)`;
}

const GROUPS = Object.freeze({
  color: 'colors',
  text: 'textColor',
  bg: 'backgroundColor',
  border: 'borderColor',
});

/**
 * Names of every custom property declared in the stylesheet (any theme block), comments ignored.
 * @param {string} css
 * @returns {string[]} sorted, unique, e.g. ['--bg-card', '--color-positive']
 */
export function extractCssVariableNames(css) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const names = new Set();
  for (const match of withoutComments.matchAll(/(--[a-z0-9][a-z0-9-]*)\s*:/gi)) names.add(match[1]);
  return [...names].sort();
}

/**
 * @param {string} css contents of src/index.css
 * @returns {{ colors: Record<string, string>, textColor: Record<string, string>, backgroundColor: Record<string, string>, borderColor: Record<string, string> }}
 */
export function buildThemeColors(css) {
  const tables = { colors: {}, textColor: {}, backgroundColor: {}, borderColor: {} };
  for (const variable of extractCssVariableNames(css)) {
    const match = variable.match(/^--([a-z]+)-(.+)$/);
    const table = match ? GROUPS[match[1]] : undefined;
    if (table) tables[table][match[2]] = colorValue(variable);
  }
  for (const [name, variable] of Object.entries(BORDER_COLOR_ALIASES)) {
    tables.borderColor[name] = colorValue(variable);
  }
  return tables;
}
