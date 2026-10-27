import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ProductStory, STORY_STEPS } from '../../../../src/components/landing/ProductStory';
import { LandingMotionProvider } from '../../../../src/components/landing/motion/LandingMotionProvider';
import i18n from '../../../../src/i18n';

/** Captures the observer callback so a test can "scroll" a step into the middle band. */
let observerCallback: IntersectionObserverCallback | null = null;
const OriginalObserver = globalThis.IntersectionObserver;

const renderStory = (): void => {
  render(
    <LandingMotionProvider>
      <ProductStory />
    </LandingMotionProvider>
  );
};

const pinnedScreenshot = (): HTMLImageElement | null =>
  document.querySelector('.sticky img');

describe('<ProductStory />', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    observerCallback = null;
    globalThis.IntersectionObserver = class {
      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback;
      }
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      takeRecords = vi.fn(() => []);
      root = null;
      rootMargin = '';
      thresholds = [];
    } as unknown as typeof IntersectionObserver;
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    globalThis.IntersectionObserver = OriginalObserver;
  });

  it('renders one step per screen, each with its own screenshot for small screens', () => {
    renderStory();
    expect(document.getElementById('features')).not.toBeNull();
    const steps = document.querySelectorAll('[data-step]');
    expect(steps).toHaveLength(STORY_STEPS.length);
    for (const step of STORY_STEPS) {
      expect(document.querySelector(`[data-step="${step.key}"] img`)?.getAttribute('src')).toBe(`/screenshots/${step.shot}.webp`);
    }
  });

  it('starts on the dashboard in the pinned frame', () => {
    renderStory();
    expect(pinnedScreenshot()?.getAttribute('src')).toBe('/screenshots/dashboard.webp');
    expect(document.querySelector('[data-step="dashboard"]')?.getAttribute('aria-current')).toBe('step');
  });

  it('switches the pinned screenshot when a step crosses the middle of the viewport', () => {
    renderStory();
    const taxStep = document.querySelector('[data-step="tax"]') as Element;
    act(() => {
      observerCallback?.([{ isIntersecting: true, target: taxStep } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    expect(taxStep.getAttribute('aria-current')).toBe('step');
    expect(screen.getAllByRole('img', { name: /Tax assistant/ }).some((img) => img.getAttribute('src') === '/screenshots/tax.webp')).toBe(true);
  });

  it('jumps to a step from the dot navigation', () => {
    renderStory();
    const nav = screen.getByRole('navigation', { name: 'Feature tour steps' });
    const importDot = nav.querySelector('button[aria-label="Import from your broker in a few clicks"]') as HTMLButtonElement;
    fireEvent.click(importDot);
    expect(importDot.getAttribute('aria-current')).toBe('step');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('presents the tax engine as modular', () => {
    renderStory();
    expect(screen.getByRole('heading', { name: 'A modular tax engine' })).toBeTruthy();
    expect(screen.getByText(/designed to welcome new jurisdictions/)).toBeTruthy();
  });
});
