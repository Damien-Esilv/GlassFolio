import React from 'react';
import { m, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';

interface TiltCardProps {
  children: React.ReactNode;
  className?: string;
  /** Maximum rotation in degrees on each axis. */
  maxTilt?: number;
}

/**
 * Card that leans toward a fine pointer (mouse / trackpad). Touch and reduced-motion users get
 * a static card: the handlers are not attached at all.
 */
export const TiltCard: React.FC<TiltCardProps> = ({ children, className, maxTilt = 5 }) => {
  const prefersReducedMotion = useReducedMotion();
  const pointerX = useMotionValue(0.5);
  const pointerY = useMotionValue(0.5);
  const spring = { stiffness: 140, damping: 18, mass: 0.6 };
  const rotateX = useSpring(useTransform(pointerY, [0, 1], [maxTilt, -maxTilt]), spring);
  const rotateY = useSpring(useTransform(pointerX, [0, 1], [-maxTilt, maxTilt]), spring);

  const handleMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.pointerType !== 'mouse') return;
    const rect = event.currentTarget.getBoundingClientRect();
    pointerX.set((event.clientX - rect.left) / rect.width);
    pointerY.set((event.clientY - rect.top) / rect.height);
  };

  const handleLeave = (): void => {
    pointerX.set(0.5);
    pointerY.set(0.5);
  };

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div className="[perspective:1400px]">
      <m.div
        className={className}
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
      >
        {children}
      </m.div>
    </div>
  );
};
