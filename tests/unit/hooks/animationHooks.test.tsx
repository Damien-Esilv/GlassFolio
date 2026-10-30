import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import { useCountUp } from '../../../src/hooks/useCountUp';
import { useEntranceAnimation } from '../../../src/hooks/useEntranceAnimation';
import { AnimatedNumber } from '../../../src/components/ui/AnimatedNumber';
import { Reveal } from '../../../src/components/ui/Reveal';
import {
  ANIMATION_DURATION_MS,
  ANIMATION_EASING,
  ENTRANCE_DELAY_MS,
  ENTRANCE_START_SCALE,
  MAX_STAGGER_STEPS,
  STAGGER_DELAY_MS,
} from '../../../src/constants/animations';

const advance = async (ms: number): Promise<void> => {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
};

describe('animations share one clock', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('useCountUp', () => {
    it('starts at 0, passes through intermediate values, and ends exactly on the target after the common duration', async () => {
      const { result } = renderHook(() => useCountUp(100));
      expect(result.current).toBe(0);

      await advance(ANIMATION_DURATION_MS / 2);
      expect(result.current).toBeGreaterThan(0);
      expect(result.current).toBeLessThan(100);

      await advance(ANIMATION_DURATION_MS);
      expect(result.current).toBe(100);
    });

    it('counts from what is shown to a new target, down as well as up', async () => {
      const { result, rerender } = renderHook(({ target }) => useCountUp(target), { initialProps: { target: 100 } });
      await advance(ANIMATION_DURATION_MS + 50);
      expect(result.current).toBe(100);

      rerender({ target: 40 });
      await advance(ANIMATION_DURATION_MS / 2);
      expect(result.current).toBeLessThan(100);
      expect(result.current).toBeGreaterThan(40);
      await advance(ANIMATION_DURATION_MS);
      expect(result.current).toBe(40);
    });

    it('takes a duration, and a zero one is instant', async () => {
      const { result } = renderHook(() => useCountUp(7, 0));
      await advance(1);
      expect(result.current).toBe(7);
    });

    it('is simply the target for a user who prefers reduced motion', () => {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query }));
      const { result } = renderHook(() => useCountUp(250));
      expect(result.current).toBe(250);
    });
  });

  describe('AnimatedNumber', () => {
    it('counts up visibly, but tells assistive technology the final value at once', async () => {
      const { container } = render(<AnimatedNumber value={2150} locale="en-US" />);
      const label = container.querySelector('[aria-label]') as HTMLElement;
      expect(label.getAttribute('aria-label')).toBe('2,150');
      expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe('0');

      await advance(ANIMATION_DURATION_MS + 50);
      expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe('2,150');
    });

    it('formats with the locale given', async () => {
      const { container } = render(<AnimatedNumber value={1234567} locale="fr-FR" />);
      await advance(ANIMATION_DURATION_MS + 50);
      expect(container.querySelector('[aria-hidden="true"]')?.textContent?.replace(/\s/g, ' ')).toMatch(/^1 234 567$/);
    });
  });

  describe('useEntranceAnimation', () => {
    it('is false at first, true after the common entrance delay', async () => {
      const { result } = renderHook(() => useEntranceAnimation());
      expect(result.current).toBe(false);
      await advance(ENTRANCE_DELAY_MS - 1);
      expect(result.current).toBe(false);
      await advance(2);
      expect(result.current).toBe(true);
    });

    it('starts over on a new key with no frame in between where new content is already shown', async () => {
      const seen: boolean[] = [];
      const { rerender } = renderHook(({ tab }) => {
        const entered = useEntranceAnimation(tab);
        seen.push(entered);
        return entered;
      }, { initialProps: { tab: 'goals' } });
      await advance(ENTRANCE_DELAY_MS + 1);
      expect(seen[seen.length - 1]).toBe(true);

      seen.length = 0;
      rerender({ tab: 'quests' });
      expect(seen[0]).toBe(false); // the very first render of the new tab is not "entered"
      await advance(ENTRANCE_DELAY_MS + 1);
      expect(seen[seen.length - 1]).toBe(true);
    });
  });

  describe('Reveal', () => {
    it('is hidden and slightly small until active, then fully shown, with the common duration and easing', () => {
      const { rerender } = render(<Reveal active={false}><span>card</span></Reveal>);
      const box = () => screen.getByText('card').parentElement as HTMLElement;
      expect(box().style.opacity).toBe('0');
      expect(box().style.transform).toBe(`scale(${ENTRANCE_START_SCALE})`);
      expect(box().style.transitionDuration).toBe(`${ANIMATION_DURATION_MS}ms`);
      expect(box().style.transitionTimingFunction).toBe(ANIMATION_EASING);

      rerender(<Reveal active><span>card</span></Reveal>);
      expect(box().style.opacity).toBe('1');
      expect(box().style.transform).toBe('scale(1)');
    });

    it('staggers its cards, and stops delaying after a dozen so a long grid still shows quickly', () => {
      render(<><Reveal active index={0}><i>a</i></Reveal><Reveal active index={3}><i>b</i></Reveal><Reveal active index={40}><i>c</i></Reveal></>);
      const delay = (text: string) => (screen.getByText(text).parentElement as HTMLElement).style.transitionDelay;
      expect(delay('a')).toBe('0ms');
      expect(delay('b')).toBe(`${3 * STAGGER_DELAY_MS}ms`);
      expect(delay('c')).toBe(`${MAX_STAGGER_STEPS * STAGGER_DELAY_MS}ms`);
    });
  });
});
