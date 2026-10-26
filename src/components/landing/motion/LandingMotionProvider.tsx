import React from 'react';
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';

/**
 * Motion runtime for the public pages only: `LazyMotion` + `domAnimation` keeps the feature
 * bundle small, and `reducedMotion="user"` drops transforms when the OS asks for less motion.
 * `strict` forbids the heavy `motion.*` components below this provider (use `m.*`).
 */
export const LandingMotionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <LazyMotion features={domAnimation} strict>
    <MotionConfig reducedMotion="user">{children}</MotionConfig>
  </LazyMotion>
);
