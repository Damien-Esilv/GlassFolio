import React from 'react';
import { m } from 'motion/react';

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  /** Seconds to wait once the block is in view, to stagger neighbours. */
  delay?: number;
}

/**
 * Fades a block up as it scrolls into view, once. Used under `LandingMotionProvider`, which already
 * drops the movement when the system asks for reduced motion.
 */
export const Reveal: React.FC<RevealProps> = ({ children, className, delay = 0 }) => (
  <m.div
    className={className}
    initial={{ opacity: 0, y: 18 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, amount: 0.15 }}
    transition={{ duration: 0.55, delay, ease: EASE_OUT }}
  >
    {children}
  </m.div>
);
