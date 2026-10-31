import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { InfoTip } from '../../../src/components/ui/InfoTip';

describe('<InfoTip />', () => {
  it('shows its explanation only when the "i" is pressed, and hides it again', () => {
    render(<InfoTip label="Why?">Because.</InfoTip>);
    const button = screen.getByRole('button', { name: 'Why?' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('note')).toBeNull();
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('note').textContent).toBe('Because.');
    expect(button.getAttribute('aria-controls')).toBe(screen.getByRole('note').id);
    fireEvent.click(button);
    expect(screen.queryByRole('note')).toBeNull();
  });
});
