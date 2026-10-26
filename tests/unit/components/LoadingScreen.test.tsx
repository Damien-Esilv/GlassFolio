import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingScreen } from '../../../src/components/ui/LoadingScreen';
import '../../../src/i18n';

describe('<LoadingScreen />', () => {
  it('renders with role="status" and aria-live="polite" for accessibility', () => {
    render(<LoadingScreen />);

    const container = screen.getByRole('status');
    expect(container).toBeTruthy();
    expect(container.getAttribute('aria-live')).toBe('polite');
  });

  it('renders default translated loading label when no custom label is provided', () => {
    render(<LoadingScreen />);

    // Default label is from common:labels.loading ("Loading..." or "Chargement...")
    expect(screen.getByText(/Loading\.\.\.|Chargement\.\.\./i)).toBeTruthy();
  });

  it('renders custom label when provided as a prop', () => {
    const customMessage = 'Synchronisation du coffre chiffré...';
    render(<LoadingScreen label={customMessage} />);

    expect(screen.getByText(customMessage)).toBeTruthy();
  });

  it('applies semantic theme tokens and brand hexagon styling', () => {
    const { container } = render(<LoadingScreen />);

    const statusElement = container.querySelector('[role="status"]');
    expect(statusElement?.className).toContain('bg-canvas');
    expect(statusElement?.className).toContain('text-primary');

    const brandIcon = container.querySelector('.bg-brand-static');
    expect(brandIcon).toBeTruthy();
  });
});
