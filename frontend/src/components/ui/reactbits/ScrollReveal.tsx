/**
 * ScrollReveal — directional scroll-triggered reveal animation.
 * Inspired by React Bits / reactbits.dev/text-animations/scroll-reveal
 * Uses framer-motion v12 whileInView with optional blur transition.
 */
import { type ReactNode, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Direction = "up" | "down" | "left" | "right";

interface ScrollRevealProps {
  children: ReactNode;
  /** Direction the element slides in from (default "up") */
  direction?: Direction;
  /** Translation distance in px (default 30) */
  distance?: number;
  /** Animation duration in seconds (default 0.5) */
  duration?: number;
  /** Delay in seconds (default 0) */
  delay?: number;
  /** Add blur(8px) → blur(0) transition (default false) */
  blur?: boolean;
  /** Fraction of element visible before triggering (default 0.15) */
  threshold?: number;
  className?: string;
  style?: CSSProperties;
}

function getInitialTransform(direction: Direction, distance: number) {
  switch (direction) {
    case "up":    return { y: distance,  x: 0 };
    case "down":  return { y: -distance, x: 0 };
    case "left":  return { y: 0, x: distance  };
    case "right": return { y: 0, x: -distance };
  }
}

export function ScrollReveal({
  children,
  direction = "up",
  distance = 30,
  duration = 0.5,
  delay = 0,
  blur = false,
  threshold = 0.15,
  className,
  style,
}: ScrollRevealProps) {
  const { x, y } = getInitialTransform(direction, distance);

  return (
    <motion.div
      initial={{ opacity: 0, x, y, filter: blur ? "blur(8px)" : undefined }}
      whileInView={{ opacity: 1, x: 0, y: 0, filter: blur ? "blur(0px)" : undefined }}
      viewport={{ once: true, amount: threshold }}
      transition={{ duration, delay, ease: [0.16, 1, 0.3, 1] }}
      className={cn(className)}
      style={style}
    >
      {children}
    </motion.div>
  );
}
