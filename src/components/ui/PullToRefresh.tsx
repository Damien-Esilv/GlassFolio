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
 * Universal Pull-To-Refresh with GlassFolio 3D Thinking Orb.
 * Intercepts touch and trackpad overscroll at window top, rendering the animated
 * ThinkingOrb instead of browser-native grey spinning wheels.
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

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
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
              state={isRefreshing ? 'working' : progressRatio >= 1 ? 'solving' : 'breathing'}
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
