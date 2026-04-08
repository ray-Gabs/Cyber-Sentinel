/**
 * ScrollVelocity — scroll-speed-driven marquee strip.
 * Inspired by React Bits / reactbits.dev/animations/scroll-velocity
 * Uses framer-motion useScroll + useVelocity + useAnimationFrame.
 * Pauses when out of viewport. Disabled when prefers-reduced-motion.
 */
import { useRef, useEffect, useState, type CSSProperties } from "react";
import {
  useScroll, useVelocity, useReducedMotion,
  useAnimationFrame, useMotionValue,
  motion,
} from "framer-motion";
import { cn } from "@/lib/utils";

interface ScrollVelocityProps {
  /** Items to display in the marquee */
  items: string[];
  /** Base scroll speed px/frame (default 1.2) */
  baseSpeed?: number;
  /** Additional speed multiplier while scrolling (default 4) */
  speedOnScroll?: number;
  /** "left" = normal direction, "right" = reverse (default "left") */
  direction?: "left" | "right";
  className?: string;
  textClassName?: string;
  style?: CSSProperties;
}

export function ScrollVelocity({
  items,
  baseSpeed = 1.2,
  speedOnScroll = 4,
  direction = "left",
  className,
  textClassName,
  style,
}: ScrollVelocityProps) {
  const reduced   = useReducedMotion();
  const wrapRef   = useRef<HTMLDivElement>(null);
  const x         = useMotionValue(0);
  const [visible, setVisible] = useState(true);

  const { scrollY } = useScroll();
  const scrollVelocity = useVelocity(scrollY);

  // IntersectionObserver — pause animation when scrolled out of view
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.01 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useAnimationFrame(() => {
    if (reduced || !visible) return;
    const vel   = scrollVelocity.get();
    const speed = baseSpeed + Math.min(Math.abs(vel) * 0.001, speedOnScroll);
    const delta = direction === "left" ? -speed : speed;
    x.set(x.get() + delta);
  });

  if (reduced) return null;

  // Duplicate items for seamless loop (itemStr unused — kept for reference)

  return (
    <div
      ref={wrapRef}
      className={cn("overflow-hidden pointer-events-none select-none", className)}
      style={style}
    >
      <motion.div
        className="flex whitespace-nowrap"
        style={{ x }}
      >
        {/* Three copies to fill any viewport width */}
        {[0, 1, 2].map((copy) => (
          <span
            key={copy}
            className={cn("inline-flex items-center text-[10px] uppercase tracking-[0.18em] font-semibold mr-0", textClassName)}
            style={{ color: "var(--marquee-text)" }}
          >
            {items.map((item, i) => (
              <span key={i} className="inline-flex items-center">
                {item}
                <span style={{ color: "var(--text-subtle)", margin: "0 0.5em" }}>·</span>
              </span>
            ))}
          </span>
        ))}
      </motion.div>
    </div>
  );
}
