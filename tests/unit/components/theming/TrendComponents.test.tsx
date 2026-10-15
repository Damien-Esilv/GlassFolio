import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrendValue } from '../../../../components/ui/TrendValue';
import { TrendBadge } from '../../../../components/ui/TrendBadge';

describe('UI Theming Micro-primitives', () => {
  describe('<TrendValue />', () => {
    it('renders positive currency values with text-positive class and leading plus sign', () => {
      const { container } = render(
        <TrendValue value={1250.5} format="currency" currency="EUR" locale="fr-FR" showIcon />
      );

      const span = container.querySelector('span');
      expect(span).toBeTruthy();
      expect(span?.className).toContain('text-positive');
      // Regex matching for cross-platform ICU whitespace/separator variations
      expect(span?.textContent).toMatch(/\+1[\s\S]*250[,.]50[\s\S]*€/);
      // SVG icon should be rendered
      expect(container.querySelector('svg')).toBeTruthy();
    });

    it('renders negative percentage values with text-negative class and minus sign', () => {
      const { container } = render(
        <TrendValue value={-3.45} format="percent" decimals={2} showIcon />
      );

      const span = container.querySelector('span');
      expect(span).toBeTruthy();
      expect(span?.className).toContain('text-negative');
      expect(span?.textContent).toContain('-3.45%');
      expect(container.querySelector('svg')).toBeTruthy();
    });

    it('renders neutral (zero) values with text-secondary class and no plus sign', () => {
      const { container } = render(
        <TrendValue value={0} format="percent" />
      );

      const span = container.querySelector('span');
      expect(span).toBeTruthy();
      expect(span?.className).toContain('text-secondary');
      expect(span?.textContent).toBe('0.00%');
    });
  });

  describe('<TrendBadge />', () => {
    it('renders a positive variation pill with bg-positive-subtle and text-positive', () => {
      const { container } = render(
        <TrendBadge value={8.12} isPercent showIcon />
      );

      const badge = container.querySelector('span');
      expect(badge).toBeTruthy();
      expect(badge?.className).toContain('bg-positive-subtle');
      expect(badge?.className).toContain('text-positive');
      expect(badge?.textContent).toContain('+8.12%');
      expect(container.querySelector('svg')).toBeTruthy();
    });

    it('renders a negative variation pill with bg-negative-subtle and text-negative', () => {
      const { container } = render(
        <TrendBadge value={-12.0} isPercent decimals={1} />
      );

      const badge = container.querySelector('span');
      expect(badge).toBeTruthy();
      expect(badge?.className).toContain('bg-negative-subtle');
      expect(badge?.className).toContain('text-negative');
      expect(badge?.textContent).toBe('-12.0%');
    });

    it('renders neutral badge with bg-subtle and text-secondary', () => {
      const { container } = render(
        <TrendBadge value={0} isPercent decimals={2} />
      );

      const badge = container.querySelector('span');
      expect(badge).toBeTruthy();
      expect(badge?.className).toContain('bg-subtle');
      expect(badge?.className).toContain('text-secondary');
      expect(badge?.textContent).toBe('0.00%');
    });
  });
});
