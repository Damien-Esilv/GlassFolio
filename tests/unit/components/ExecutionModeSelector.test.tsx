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
    // From the safest to the freest
    expect(radios.map((radio) => radio.textContent)).toEqual([
      expect.stringContaining('Strict Read-Only'),
      expect.stringContaining('Supervised'),
      expect.stringContaining('Autonomous'),
    ]);
    expect(screen.getByRole('radio', { name: /Supervised/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: /Strict Read-Only/ }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('radio', { name: /Autonomous \(no confirmation\)/ }).getAttribute('aria-checked')).toBe('false');
  });

  it('shows the "i" only once autonomous mode is on', () => {
    const { rerender } = render(<ExecutionModeSelector mode="supervised" onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'What still asks for confirmation in autonomous mode?' })).toBeNull();
    rerender(<ExecutionModeSelector mode="read_only" onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'What still asks for confirmation in autonomous mode?' })).toBeNull();
    rerender(<ExecutionModeSelector mode="autonomous" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'What still asks for confirmation in autonomous mode?' })).toBeTruthy();
  });

  it('lists, in a small "i", the requests that still ask in autonomous mode, read from the tools of the app', () => {
    render(<ExecutionModeSelector mode="autonomous" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'What still asks for confirmation in autonomous mode?' }));
    const list = screen.getByRole('note');
    ['lock_vault', 'rotate_encryption_key', 'export_gdpr_archive', 'resend_verification_email'].forEach((name) => expect(list.textContent).toContain(name));
    // A tool that runs at once in autonomous mode is not in the list
    expect(list.textContent).not.toContain('create_goal');
    expect(list.textContent).not.toContain('record_transaction');
  });

  it('follows the tools it is given: nothing typed in the interface', () => {
    const tools = [
      { name: 'lock_vault', description: 'Locks the vault', requiresConfirmation: true },
      { name: 'brand_new_tool', description: 'A tool added tomorrow', requiresConfirmation: true },
      { name: 'list_goals', description: 'Reads goals', requiresConfirmation: false },
    ];
    render(<ExecutionModeSelector mode="autonomous" onChange={vi.fn()} tools={tools} />);
    fireEvent.click(screen.getByRole('button', { name: 'What still asks for confirmation in autonomous mode?' }));
    expect(screen.getByRole('note').textContent).toContain('lock_vault');
    expect(screen.getByRole('note').textContent).not.toContain('brand_new_tool');
  });

  it('says so when nothing asks any more', () => {
    render(<ExecutionModeSelector mode="autonomous" onChange={vi.fn()} tools={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'What still asks for confirmation in autonomous mode?' }));
    expect(screen.getByRole('note').textContent).toMatch(/None: every change runs at once/);
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
