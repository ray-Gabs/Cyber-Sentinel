/**
 * SpotlightCard — cursor-following spotlight on card border/background.
 * Inspired by React Bits / reactbits.dev/components/spotlight-card
 * Uses CSS custom properties so the spotlight tracks without JS re-renders.
 * Respects prefers-reduced-motion.
 */
import { useRef, useCallback, type ReactNode, type CSSProperties } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

interface SpotlightCardProps {
  children: ReactNode;
  /** Spotlight radius in px (default 220) */
  size?: number;
  /** Spotlight color (default "var(--spotlight-color)") */
  color?: string;
  /** Border color variant on hover (default "var(--border-focus)") */
  borderColor?: string;
  className?: string;
  style?: CSSProperties;
}

export function SpotlightCard({
  children,
  size = 220,
  color = "var(--spotlight-color)",
  borderColor = "var(--border-focus)",
  className,
  style,
}: SpotlightCardProps) {
  const reduced  = useReducedMotion();
  const wrapRef  = useRef<HTMLDivElement>(null);
  const rafRef   = useRef<number | null>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (reduced || !wrapRef.current) return;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    rafRef.current = requestAnimationFrame(() => {
      if (!wrapRef.current) return;
      const rect = wrapRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      wrapRef.current.style.setProperty("--spot-x", `${x}px`);
      wrapRef.current.style.setProperty("--spot-y", `${y}px`);
      wrapRef.current.style.setProperty("--spot-opacity", "1");
    });
  }, [reduced]);

  const handleMouseLeave = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (!wrapRef.current) return;
    wrapRef.current.style.setProperty("--spot-opacity", "0");
  }, []);

  return (
    <div
      ref={wrapRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={cn("relative", className)}
      style={
        {
          "--spot-x":       "50%",
          "--spot-y":       "50%",
          "--spot-opacity": "0",
          "--spot-size":    `${size}px`,
          "--spot-color":   color,
          "--spot-border":  borderColor,
          ...style,
        } as CSSProperties
      }
    >
      {/* Spotlight border layer */}
      <div
        aria-hidden="true"
        style={{
          position:      "absolute",
          inset:         0,
          borderRadius:  "inherit",
          background:    `radial-gradient(var(--spot-size) circle at var(--spot-x) var(--spot-y), var(--spot-color), transparent 70%)`,
          opacity:       "var(--spot-opacity)" as unknown as number,
          transition:    "opacity 0.3s ease",
          pointerEvents: "none",
          zIndex:        1,
        }}
      />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 2 }}>
        {children}
      </div>
    </div>
  );
}
