import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '../../../../src/i18n';
import i18n from '../../../../src/i18n';
import { AIChatPanel } from '../../../../src/components/ai/AIChatPanel';
import { aiService } from '../../../../src/services/ai/aiService';
import { aiSettingsService } from '../../../../src/services/ai/aiSettingsService';
import { clearModelCapabilitiesCache } from '../../../../src/services/ai/modelCapabilities';
import { prepareAttachment } from '../../../../src/services/ai/attachmentService';

vi.mock('../../../../src/services/ai/attachmentService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/services/ai/attachmentService')>();
  return {
    ...actual,
    prepareAttachment: vi.fn(),
  };
});

describe('<AIChatPanel /> (E37 + E50)', () => {
  beforeEach(async () => {
    localStorage.clear();
    clearModelCapabilitiesCache();
    aiService.clearMessages();
    aiSettingsService.saveSettings({ activeProvider: 'mock', executionMode: 'supervised' });
    await i18n.changeLanguage('en');
    vi.clearAllMocks();
  });

  const renderPanel = (onClose = vi.fn()) =>
    render(
      <MemoryRouter>
        <AIChatPanel
          isOpen
          onClose={onClose}
          width={420}
          onToggleWidthPreset={vi.fn()}
          resizeHandleProps={{
            role: 'separator',
            'aria-orientation': 'vertical',
            'aria-valuenow': 420,
            'aria-valuemin': 320,
            'aria-valuemax': 760,
            tabIndex: 0,
            onPointerDown: vi.fn(),
            onDoubleClick: vi.fn(),
            onKeyDown: vi.fn(),
          }}
        />
      </MemoryRouter>
    );

  it('renders as non-modal complementary landmark without backdrop or aria-modal', async () => {
    const { container } = renderPanel();
    await act(async () => {
      await Promise.resolve();
    });
    const panel = screen.getByTestId('ai-chat-panel');
    expect(panel.getAttribute('role')).toBe('complementary');
    expect(panel.getAttribute('aria-modal')).toBeNull();
    expect(container.querySelector('.bg-black\\/40')).toBeNull();
    expect(screen.getByTestId('ai-panel-resize-handle')).toBeTruthy();
  });

  it('closes on Escape only when focus is inside the panel', async () => {
    const onClose = vi.fn();
    renderPanel(onClose);
    await act(async () => {
      await Promise.resolve();
    });

    // Focus outside -> Escape must NOT close
    const outsideButton = document.createElement('button');
    document.body.appendChild(outsideButton);
    outsideButton.focus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    // Focus inside panel -> Escape closes
    const textarea = screen.getByPlaceholderText('Ask a financial question or request an action...');
    textarea.focus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    outsideButton.remove();
  });

  it('shows interactive (i) preprocessing info popover for locally preprocessed XLSX/PDF files', async () => {
    vi.mocked(prepareAttachment).mockResolvedValueOnce({
      id: 'att-xlsx-1',
      kind: 'xlsx',
      name: 'broker.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes: 2048,
      text: 'Date,Amount\n2025-01-01,100',
      preprocessing: {
        method: 'xlsx_to_csv',
        details: { sheet: 'Trades', rows: 12 },
      },
    });

    renderPanel();
    const input = screen.getByTestId('ai-attachment-input');
    const file = new File(['dummy'], 'broker.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText('broker.xlsx')).toBeTruthy());

    const infoBtn = screen.getByTestId('preprocess-info-pending-att-xlsx-1');
    fireEvent.click(infoBtn);
    expect(screen.getByRole('note').textContent).toContain('Trades');
    expect(screen.getByRole('note').textContent).toContain('12 rows');
  });

  it('requires explicit cloud privacy consent before sending an attachment to a cloud provider', async () => {
    aiSettingsService.saveSettings({
      activeProvider: 'openai',
      apiKey: 'sk-test',
      cloudModel: 'gpt-4o',
    });

    vi.mocked(prepareAttachment).mockResolvedValueOnce({
      id: 'att-csv-1',
      kind: 'csv',
      name: 'trades.csv',
      mimeType: 'text/csv',
      sizeBytes: 512,
      text: 'Date,Amount\n2025-01-01,100',
    });

    renderPanel();
    const input = screen.getByTestId('ai-attachment-input');
    fireEvent.change(input, {
      target: { files: [new File(['a'], 'trades.csv', { type: 'text/csv' })] },
    });

    await waitFor(() => expect(screen.getByText('trades.csv')).toBeTruthy());

    const sendButton = screen.getByLabelText('Send') as HTMLButtonElement;
    expect(sendButton.disabled).toBe(true);

    const consentBtn = screen.getByText('I understand, allow upload');
    fireEvent.click(consentBtn);
    expect(sendButton.disabled).toBe(false);
  });
});
