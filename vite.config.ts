import fs from 'fs';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { localVaultPlugin } from './server/viteLocalVaultPlugin.mjs';

/**
 * The README illustrations live in public/screenshots so they have one home next to the showcase set,
 * but the site never serves them: keep them out of the build to leave the screenshot budget to the pages.
 */
const README_ONLY_ASSETS = ['screenshots/fr', 'screenshots/readme-hero.webp'];
const excludeReadmeAssets = (): Plugin => {
  let outDir = 'dist';
  return {
    name: 'glassfolio-exclude-readme-assets',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      for (const asset of README_ONLY_ASSETS) {
        fs.rmSync(path.join(outDir, asset), { recursive: true, force: true });
      }
    },
  };
};

export default defineConfig({
  server: {
    port: 3000,
    host: process.env.GLASSFOLIO_DEV_HOST || '127.0.0.1',
    proxy: {
      // Proxy Yahoo Finance requests in dev to avoid CORS / 403 issues
      '/yf': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/yf/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://finance.yahoo.com',
        },
      },
    },
  },
  preview: {
    port: 3000,
    host: process.env.GLASSFOLIO_PREVIEW_HOST || '127.0.0.1',
  },
  plugins: [react(), localVaultPlugin(), excludeReadmeAssets()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
