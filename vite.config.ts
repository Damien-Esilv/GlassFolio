import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { localVaultPlugin } from './server/viteLocalVaultPlugin.mjs';

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
  plugins: [react(), localVaultPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
