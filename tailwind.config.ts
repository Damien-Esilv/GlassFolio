import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from 'tailwindcss';
import { buildThemeColors } from './src/config/tailwindTheme.mjs';

/**
 * Tailwind build configuration. Colors are NOT listed here: they are derived from the CSS
 * variables declared in src/index.css (single source of truth for theming), following the naming
 * contract in src/config/tailwindTheme.mjs. To add a color, declare its variable there, once.
 * Replaces the former runtime CDN script (`cdn.tailwindcss.com`) so no third-party code runs in the app.
 */
const themeCss = readFileSync(join(process.cwd(), 'src/index.css'), 'utf-8');
const { colors, textColor, backgroundColor, borderColor } = buildThemeColors(themeCss);

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors,
      textColor,
      backgroundColor,
      borderColor,
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Inter', 'sans-serif'],
        mono: ['Inter', 'sans-serif'],
      },
    },
  },
};

export default config;
