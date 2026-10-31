import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ExecutionModeSelector } from '../../../src/components/ai/ExecutionModeSelector';
import '../../../src/i18n';

describe('<ExecutionModeSelector />', () => {
  it('offers three separate modes, and supervised stays the one that is chosen', () => {
    render(<ExecutionModeSelector mode="supervised" onChange={vi.fn()} />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(screen.getByRole('radio', { name: /Supervised/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: /Strict Read-Only/ }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('radio', { name: /Autonomous \(no confirmation\)/ }).getAttribute('aria-checked')).toBe('false');
  });

  it('changes between supervised and read-only at once, without any warning', () => {
    const onChange = vi.fn();
    render(<ExecutionModeSelector mode="supervised" onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: /Strict Read-Only/ }));
    expect(onChange).toHaveBeenCalledWith('read_only');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('warns before turning autonomous mode on, and changes nothing until the user confirms', () => {
    const onChange = vi.fn();
    render(<ExecutionModeSelector mode="supervised" onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: /Autonomous/ }));
    const warning = screen.getByRole('alertdialog');
    expect(warning.textContent).toMatch(/Ollama/);
    expect(warning.textContent).toMatch(/MCP/);
    expect(warning.textContent).toMatch(/hidden in a document/);
    expect(warning.textContent).toMatch(/still ask for your approval/);
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'I understand, turn it on' }));
    expect(onChange).toHaveBeenCalledWith('autonomous');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('keeps the current mode when the user cancels the warning', () => {
    const onChange = vi.fn();
    render(<ExecutionModeSelector mode="read_only" onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: /Autonomous/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('shows that autonomous mode is on, and leaves it without a warning', () => {
    const onChange = vi.fn();
    render(<ExecutionModeSelector mode="autonomous" onChange={onChange} />);
    expect(screen.getByRole('status').textContent).toMatch(/change your data without asking you/);
    fireEvent.click(screen.getByRole('radio', { name: /Autonomous/ }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /Supervised/ }));
    expect(onChange).toHaveBeenCalledWith('supervised');
  });
});
