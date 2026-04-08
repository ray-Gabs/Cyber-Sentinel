/**
 * RotatingText — cycles through text items with a fade+slide animation.
 * Inspired by React Bits / reactbits.dev/text-animations/rotating-text
 * Uses framer-motion AnimatePresence mode="wait".
 * Respects prefers-reduced-motion — shows first item statically.
 */
import { useState, useEffect, type CSSProperties } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

interface RotatingTextProps {
  /** Array of strings to rotate through */
  texts: string[];
  /** Milliseconds between rotations (default 3000) */
  interval?: number;
  /** Animation duration in seconds (default 0.4) */
  transitionDuration?: number;
  /** Exit direction — "up" means old text exits upward (default "up") */
  direction?: "up" | "down";
  className?: string;
  style?: CSSProperties;
}

export function RotatingText({
  texts,
  interval = 3000,
  transitionDuration = 0.4,
  direction = "up",
  className,
  style,
}: RotatingTextProps) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reduced || texts.length <= 1) return;
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % texts.length);
    }, interval);
    return () => clearInterval(id);
  }, [texts.length, interval, reduced]);

  if (reduced) {
    return (
      <span className={cn("inline-block", className)} style={style}>
        {texts[0]}
      </span>
    );
  }

  const exitY   = direction === "up" ? "-100%" : "100%";
  const enterY  = direction === "up" ? "100%"  : "-100%";

  return (
    <span
      className={cn("inline-flex overflow-hidden align-bottom", className)}
      style={style}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={index}
          initial={{ opacity: 0, y: enterY }}
          animate={{ opacity: 1, y: "0%" }}
          exit={{ opacity: 0, y: exitY }}
          transition={{ duration: transitionDuration, ease: [0.16, 1, 0.3, 1] }}
          style={{ display: "inline-block" }}
        >
          {texts[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
