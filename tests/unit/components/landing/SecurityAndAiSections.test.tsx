import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SecuritySection } from '../../../../src/components/landing/SecuritySection';
import { AiChoiceSection } from '../../../../src/components/landing/AiChoiceSection';
import { LandingMotionProvider } from '../../../../src/components/landing/motion/LandingMotionProvider';
import { AI_TOOL_COUNT } from '../../../../src/constants/productFacts';
import i18n from '../../../../src/i18n';

describe('Security and AI sections', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('explains protection on the device, in transit and at rest, and key isolation', () => {
    const { container } = render(
      <LandingMotionProvider>
        <SecuritySection />
      </LandingMotionProvider>
    );
    expect(document.getElementById('security')).not.toBeNull();
    for (const stage of ['On your device', 'In transit', 'At rest']) expect(screen.getByText(stage)).toBeTruthy();
    expect(screen.getByText(/no access to your financial data or to your private keys/)).toBeTruthy();
    expect(container.textContent).not.toMatch(/zero[- ]knowledge/i);
  });

  it('offers three equal places to run the AI and the shared guardrails', () => {
    render(
      <LandingMotionProvider>
        <AiChoiceSection />
      </LandingMotionProvider>
    );
    expect(document.getElementById('ai')).not.toBeNull();
    for (const runtime of ['Local model', 'External API, your key', 'Your AI tools']) expect(screen.getByText(runtime)).toBeTruthy();
    expect(screen.getByText(new RegExp(`${AI_TOOL_COUNT} tools`))).toBeTruthy();
    expect(screen.getByText(/waits for your approval/)).toBeTruthy();
  });
});
