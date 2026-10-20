import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AIMarkdownRenderer } from '../../../../components/ai/AIMarkdownRenderer';
import '../../../../src/i18n';

describe('AIMarkdownRenderer', () => {
  it('renders bold, italic, and inline code properly', () => {
    const markdown = 'Ceci est du **texte en gras**, de *litalique*, et du `code inline`.';
    render(<AIMarkdownRenderer content={markdown} />);

    expect(screen.getByText('texte en gras')).toBeTruthy();
    expect(screen.getByText('litalique')).toBeTruthy();
    expect(screen.getByText('code inline')).toBeTruthy();
  });

  it('renders bullet lists and headers', () => {
    const markdown = `### Titre de section
- Point 1
- Point 2`;
    render(<AIMarkdownRenderer content={markdown} />);

    expect(screen.getByText('Titre de section')).toBeTruthy();
    expect(screen.getByText('Point 1')).toBeTruthy();
    expect(screen.getByText('Point 2')).toBeTruthy();
  });

  it('extracts <think>...</think> reasoning blocks into an inline collapsible accordion with zero popups', () => {
    const markdown = `<think>
Calcul des gains latents sur Apple et Bitcoin...
Analyse terminée.
</think>
Voici votre synthèse finale.`;

    const { rerender } = render(<AIMarkdownRenderer content={markdown} isLiveThinking={true} />);

    // In live mode, thought block should be expanded and show thinking indicator
    expect(screen.getByText('Reasoning in progress...')).toBeTruthy();
    expect(screen.getByText(/Calcul des gains latents/)).toBeTruthy();

    // Rerender as finished (isLiveThinking = false) -> should auto-contract
    rerender(<AIMarkdownRenderer content={markdown} isLiveThinking={false} />);

    const thoughtToggle = screen.getByText('Thought Process');
    expect(thoughtToggle).toBeTruthy();

    // After finish, reasoning should auto-contract (hidden)
    expect(screen.queryByText(/Calcul des gains latents/)).toBeNull();

    // Click to unfold reasoning inline
    fireEvent.click(thoughtToggle);
    expect(screen.getByText(/Calcul des gains latents/)).toBeTruthy();

    // Verify modal popup is completely absent and no enlarge modal button exists
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByTitle(/Expand thought process/i)).toBeNull();

    // Copy button is available inline
    const copyBtn = screen.getByTitle('Copy thought process');
    expect(copyBtn).toBeTruthy();
  });

  it('renders fenced code blocks with language badge', () => {
    const markdown = '```typescript\nconst a = 42;\n```';
    render(<AIMarkdownRenderer content={markdown} />);

    expect(screen.getByText('typescript')).toBeTruthy();
    expect(screen.getByText('const a = 42;')).toBeTruthy();
  });

  it('renders horizontal rules (---) as hr elements instead of literal text', () => {
    const markdown = 'Paragraphe 1\n\n---\n\nParagraphe 2';
    const { container } = render(<AIMarkdownRenderer content={markdown} />);

    expect(container.querySelector('hr')).toBeTruthy();
    expect(screen.queryByText('---')).toBeNull();
  });
});
