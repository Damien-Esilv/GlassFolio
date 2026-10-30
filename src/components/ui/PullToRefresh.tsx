import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AppThinkingOrb } from './AppThinkingOrb';

const PULL_THRESHOLD = 70;
const MAX_PULL = 110;

interface PullToRefreshProps {
  onRefresh?: () => Promise<void> | void;
  children: React.ReactNode;
}

/**
 * True on phones and tablets (primary input is a finger, nothing to hover with). A desktop with a
 * mouse or trackpad, even one with a touchscreen, keeps the browser's own behaviour: a pull-to-refresh
 * gesture there looks like a mobile app inside a desktop window.
 */
const isTouchFirstDevice = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: none) and (pointer: coarse)').matches;

/**
 * Pull-To-Refresh with the GlassFolio Thinking Orb, for touch-first devices only.
 * Intercepts the touch pull at the top of the page and renders the animated orb instead of the
 * browser-native grey spinning wheel.
 */
export const PullToRefresh: React.FC<PullToRefreshProps> = ({ onRefresh, children }) => {
  const { t } = useTranslation();
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const isPullingRef = useRef(false);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      if (onRefresh) {
        await onRefresh();
      } else {
        window.location.reload();
      }
    } finally {
      setIsRefreshing(false);
      setPullDistance(0);
    }
  }, [onRefresh]);

  useEffect(() => {
    if (!isTouchFirstDevice()) return undefined;

    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY <= 0) {
        touchStartY.current = e.touches[0].clientY;
      } else {
        touchStartY.current = null;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (touchStartY.current === null || isRefreshing) return;
      if (window.scrollY > 0) {
        touchStartY.current = null;
        setPullDistance(0);
        return;
      }

      const currentY = e.touches[0].clientY;
      const diff = currentY - touchStartY.current;

      if (diff > 0) {
        // Dampened pull curve
        const distance = Math.min(MAX_PULL, diff * 0.45);
        setPullDistance(distance);
        isPullingRef.current = true;
        if (e.cancelable && distance > 10) {
          e.preventDefault();
        }
      }
    };

    const handleTouchEnd = () => {
      if (!isPullingRef.current || isRefreshing) return;
      isPullingRef.current = false;
      touchStartY.current = null;

      if (pullDistance >= PULL_THRESHOLD) {
        void handleRefresh();
      } else {
        setPullDistance(0);
      }
    };

    // An interrupted gesture (incoming call, system swipe) must not leave the indicator stuck
    const handleTouchCancel = () => {
      isPullingRef.current = false;
      touchStartY.current = null;
      setPullDistance(0);
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchCancel);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [isRefreshing, pullDistance, handleRefresh]);

  const showIndicator = pullDistance > 0 || isRefreshing;
  const progressRatio = Math.min(1, pullDistance / PULL_THRESHOLD);

  return (
    <div className="relative w-full">
      {/* Pull Indicator Area */}
      {showIndicator && (
        <div
          style={{ height: `${isRefreshing ? 60 : pullDistance}px` }}
          className="w-full flex items-center justify-center overflow-hidden transition-all duration-200 ease-out pointer-events-none"
          aria-live="polite"
          role="status"
        >
          <div
            className="flex flex-col items-center justify-center gap-1.5 transition-transform"
            style={{
              transform: `scale(${0.6 + progressRatio * 0.4})`,
              opacity: Math.max(0.2, progressRatio),
            }}
          >
            <AppThinkingOrb
              state={isRefreshing ? 'working' : progressRatio >= 1 ? 'solving' : 'searching'}
              size={32}
              label={isRefreshing ? t('common:labels.loading') : t('common:actions.refresh')}
            />
          </div>
        </div>
      )}
      {children}
    </div>
  );
};
