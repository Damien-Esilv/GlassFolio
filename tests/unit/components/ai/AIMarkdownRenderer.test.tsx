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

  it('extracts <think>...</think> reasoning blocks into an expandable accordion and modal', () => {
    const markdown = `<think>
Calcul des gains latents sur Apple et Bitcoin...
Analyse terminée.
</think>
Voici votre synthèse finale.`;

    render(<AIMarkdownRenderer content={markdown} />);

    // Thought process toggle button should be present
    const thoughtToggle = screen.getByText('Thought Process');
    expect(thoughtToggle).toBeTruthy();

    // Main text should be rendered directly
    expect(screen.getByText('Voici votre synthèse finale.')).toBeTruthy();

    // Click to expand reasoning inline
    fireEvent.click(thoughtToggle);
    expect(screen.getByText(/Calcul des gains latents/)).toBeTruthy();

    // Click enlarge button to open full thought modal dialog
    const enlargeBtn = screen.getByTitle('Expand thought process');
    fireEvent.click(enlargeBtn);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(screen.getByText(/AI Thought Process & Reasoning/i)).toBeTruthy();
  });

  it('renders fenced code blocks with language badge', () => {
    const markdown = '```typescript\nconst a = 42;\n```';
    render(<AIMarkdownRenderer content={markdown} />);

    expect(screen.getByText('typescript')).toBeTruthy();
    expect(screen.getByText('const a = 42;')).toBeTruthy();
  });
});
