import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppThinkingOrb } from '../../../../components/ui/AppThinkingOrb';

describe('AppThinkingOrb Component', () => {
  it('renders correctly with default state and size', () => {
    render(<AppThinkingOrb />);
    const container = screen.getByTestId('app-thinking-orb');
    expect(Boolean(container)).toBe(true);
    expect(container.getAttribute('data-state')).toBe('working');
    expect(container.getAttribute('data-size')).toBe('20');
  });

  it('renders with custom state and size 64', () => {
    render(<AppThinkingOrb state="breathing" size={64} label="Thinking agent" />);
    const container = screen.getByTestId('app-thinking-orb');
    expect(Boolean(container)).toBe(true);
    expect(container.getAttribute('data-state')).toBe('breathing');
    expect(container.getAttribute('data-size')).toBe('64');
  });

  it('handles label aria-label fallback', () => {
    render(<AppThinkingOrb label="Agent de calcul" />);
    const orb = screen.getByLabelText('Agent de calcul');
    expect(Boolean(orb)).toBe(true);
  });
});
