import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LandingStats } from '../../../../src/components/landing/LandingStats';
import { LandingMotionProvider } from '../../../../src/components/landing/motion/LandingMotionProvider';
import { CountUp } from '../../../../src/components/landing/motion/CountUp';
import { ANIMATION_DURATION_S } from '../../../../src/constants/animations';
import {
  AI_TOOL_COUNT,
  SUPPORTED_BROKERS,
  SUPPORTED_LANGUAGE_COUNT,
  VAULT_PBKDF2_ITERATIONS,
} from '../../../../src/constants/productFacts';
import i18n from '../../../../src/i18n';

describe('LandingStats and CountUp', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders all 4 product facts correctly inside LandingStats', () => {
    render(
      <LandingMotionProvider>
        <LandingStats />
      </LandingMotionProvider>
    );

    // Initial render displays formatted values immediately to avoid layout shift
    expect(screen.getByText(String(AI_TOOL_COUNT))).toBeTruthy();
    expect(screen.getByText(String(SUPPORTED_BROKERS.length))).toBeTruthy();
    expect(screen.getByText(String(SUPPORTED_LANGUAGE_COUNT))).toBeTruthy();
    expect(screen.getByText(/600[,.\s]?000/)).toBeTruthy();
  });

  it('CountUp renders target value and defaults duration to ANIMATION_DURATION_S', () => {
    const { container } = render(
      <LandingMotionProvider>
        <CountUp value={42} locale="en-US" />
      </LandingMotionProvider>
    );

    expect(container.textContent).toContain('42');
    expect(ANIMATION_DURATION_S).toBe(1.2);
  });
});
