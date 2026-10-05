import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      // Thresholds on P1/P2 modules (critical financial & import logic)
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
      include: [
        'src/services/core/validationService.ts',
        'src/services/currencyService.ts',
        'src/services/goalService.ts',
        'src/services/import/csvParser.ts',
        'utils/**/*.ts',
      ],
      exclude: [
        'src/services/mockData.backend.ts',
        'src/services/importService.ts',   // barrel re-export
        'src/services/import/index.ts',
        'src/services/core/index.ts',
        'src/services/fiscal/index.ts',
        'node_modules/**',
        'dist/**',
        'tests/**',
        '**/*.d.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
