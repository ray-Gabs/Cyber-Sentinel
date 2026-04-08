/**
 * ScrollFloat — scroll-triggered float-up entrance animation.
 * Inspired by React Bits / reactbits.dev/animations/scroll-float
 * Uses framer-motion v12 whileInView shorthand.
 */
import { type ElementType, type ReactNode, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ScrollFloatProps {
  children: ReactNode;
  /** Y offset in px to float from (default 24) */
  offset?: number;
  /** Animation duration in seconds (default 0.55) */
  duration?: number;
  /** Delay in seconds (default 0) */
  delay?: number;
  /** Fraction of element visible before triggering (default 0.2) */
  threshold?: number;
  /** Render as this HTML element (default "div") */
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
}

export function ScrollFloat({
  children,
  offset = 24,
  duration = 0.55,
  delay = 0,
  threshold = 0.2,
  as: Tag = "div",
  className,
  style,
}: ScrollFloatProps) {
  const MotionTag = motion(Tag as "div");

  return (
    <MotionTag
      initial={{ opacity: 0, y: offset }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: threshold }}
      transition={{ duration, delay, ease: [0.16, 1, 0.3, 1] }}
      className={cn(className)}
      style={style}
    >
      {children}
    </MotionTag>
  );
}
