import React from 'react';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import StableNumber from '../../../src/components/ui/StableNumber';
import TrendValue from '../../../src/components/ui/TrendValue';
import TrendBadge from '../../../src/components/ui/TrendBadge';

const SRC = join(__dirname, '..', '..', '..', 'src');

describe('Typography & Tabular Figures (OpenType tnum & cv05)', () => {
  const indexCss = readFileSync(join(SRC, 'index.css'), 'utf-8');

  it('declares font-variant-numeric: tabular-nums on body in index.css', () => {
    expect(indexCss).toMatch(/body\s*\{[^}]*font-variant-numeric:\s*tabular-nums;/);
  });

  it('declares font-feature-settings with tnum and cv05 on body in index.css', () => {
    expect(indexCss).toMatch(/body\s*\{[^}]*font-feature-settings:\s*['"]tnum['"]\s+on,\s*['"]cv05['"]\s+on;/);
  });

  it('enforces tabular-nums and OpenType features inside Tailwind @layer base', () => {
    expect(indexCss).toContain('@layer base {');
    // Body in layer base
    expect(indexCss).toMatch(/@layer base\s*\{[\s\S]*body\s*\{[\s\S]*font-variant-numeric:\s*tabular-nums;/);
    // Form controls in layer base
    expect(indexCss).toMatch(/input,\s*button,\s*select,\s*textarea\s*\{[\s\S]*font-variant-numeric:\s*tabular-nums;/);
    expect(indexCss).toMatch(/input,\s*button,\s*select,\s*textarea\s*\{[\s\S]*font-feature-settings:\s*['"]tnum['"]\s+on,\s*['"]cv05['"]\s+on;/);
  });

  it('preserves .font-mono utility with tabular-nums mapping', () => {
    expect(indexCss).toMatch(/\.font-mono\s*\{[^}]*font-variant-numeric:\s*tabular-nums;/);
  });
});

describe('Financial Tables Numerical Column Alignment', () => {
  it('aligns TER header and values to the right in FeeAnalysis.tsx', () => {
    const feeAnalysisCode = readFileSync(join(SRC, 'pages', 'FeeAnalysis.tsx'), 'utf-8');
    expect(feeAnalysisCode).toContain("text-right\">{t('reports:feeAnalysis.terHeader')}</th>");
    expect(feeAnalysisCode).toContain('font-bold text-right');
  });

  it('aligns numerical columns to the right in Positions.tsx', () => {
    const positionsCode = readFileSync(join(SRC, 'pages', 'Positions.tsx'), 'utf-8');
    expect(positionsCode).toContain("text-right\">{t('positions.table.quantity')}</th>");
    expect(positionsCode).toContain("text-right\">{t('positions.table.avgCost')}</th>");
    expect(positionsCode).toContain("text-right\">{t('positions.table.price')}</th>");
    expect(positionsCode).toContain("text-right\">{t('positions.table.marketValue')}</th>");
    expect(positionsCode).toContain("text-right\">{t('positions.table.unrealizedPl')}</th>");
  });

  it('aligns numerical columns to the right in Transactions.tsx', () => {
    const txCode = readFileSync(join(SRC, 'pages', 'Transactions.tsx'), 'utf-8');
    expect(txCode).toContain("text-right\">{t('transactions:table.qty')}</th>");
    expect(txCode).toContain("text-right\">{t('transactions:table.price')}</th>");
    expect(txCode).toContain("text-right\">{t('transactions:table.gross')}</th>");
    expect(txCode).toContain("text-right\">{t('transactions:table.fee')}</th>");
  });

  it('aligns numerical columns to the right in Portfolio.tsx', () => {
    const portfolioCode = readFileSync(join(SRC, 'pages', 'Portfolio.tsx'), 'utf-8');
    expect(portfolioCode).toContain("text-right\">{t('table.allocation')}</div>");
    expect(portfolioCode).toContain("text-right\">{t('table.value')}</div>");
    expect(portfolioCode).toContain("text-right\">{t('table.pnl')}</div>");
  });
});

describe('Numeric Micro-Primitives Tabular Guarantees', () => {
  it('StableNumber retains tabular-nums and whitespace-nowrap classes', () => {
    const { container } = render(<StableNumber display="111.11" final="888.88" />);
    const root = container.firstElementChild;
    expect(root?.className).toContain('tabular-nums');
    expect(root?.className).toContain('whitespace-nowrap');
  });

  it('TrendValue renders through StableNumber with tabular digits', () => {
    const { container } = render(<TrendValue value={18.5} format="currency" currency="EUR" />);
    const stable = container.querySelector('[data-final]');
    expect(stable).toBeTruthy();
    expect(stable?.className).toContain('tabular-nums');
  });

  it('TrendBadge renders through StableNumber with tabular digits', () => {
    const { container } = render(<TrendBadge value={-3.14} isPercent />);
    const stable = container.querySelector('[data-final]');
    expect(stable).toBeTruthy();
    expect(stable?.className).toContain('tabular-nums');
  });
});
