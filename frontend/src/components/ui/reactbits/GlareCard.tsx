/**
 * GlareCard — mouse-tracking glare and tilt effect for premium cards.
 * Inspired by React Bits / reactbits.dev/components/glare-card
 * Uses element-level onMouseMove only (no global listeners).
 * Respects prefers-reduced-motion.
 */
import { useRef, useEffect, type ReactNode, type CSSProperties } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

type Intensity = "low" | "medium" | "high";

interface GlareCardProps {
  children: ReactNode;
  /** Glare overlay color (default "var(--glare-color)") */
  color?: string;
  /** Effect intensity (default "low") */
  intensity?: Intensity;
  className?: string;
  style?: CSSProperties;
}

const INTENSITY_MAP: Record<Intensity, { tilt: number; glare: number }> = {
  low:    { tilt: 4,  glare: 0.10 },
  medium: { tilt: 8,  glare: 0.18 },
  high:   { tilt: 14, glare: 0.28 },
};

export function GlareCard({
  children,
  color = "var(--glare-color)",
  intensity = "low",
  className,
  style,
}: GlareCardProps) {
  const reduced  = useReducedMotion();
  const cardRef  = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);
  const rafRef   = useRef<number | null>(null);
  const { tilt, glare } = INTENSITY_MAP[intensity];

  // Cancel pending RAF on unmount
  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (reduced || !cardRef.current || !glareRef.current) return;
    // Read coordinates before scheduling RAF (synthetic event may be recycled)
    const clientX = e.clientX;
    const clientY = e.clientY;

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    rafRef.current = requestAnimationFrame(() => {
      if (!cardRef.current || !glareRef.current) return;
      const rect = cardRef.current.getBoundingClientRect();
      const cx   = rect.left + rect.width  / 2;
      const cy   = rect.top  + rect.height / 2;
      const dx   = (clientX - cx) / (rect.width  / 2);
      const dy   = (clientY - cy) / (rect.height / 2);

      cardRef.current.style.transform =
        `perspective(800px) rotateX(${-dy * tilt}deg) rotateY(${dx * tilt}deg)`;

      const glareX = ((clientX - rect.left) / rect.width)  * 100;
      const glareY = ((clientY - rect.top)  / rect.height) * 100;
      glareRef.current.style.background =
        `radial-gradient(circle at ${glareX}% ${glareY}%, ${color} 0%, transparent 60%)`;
      glareRef.current.style.opacity = String(glare);
    });
  }

  function handleMouseLeave() {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (!cardRef.current || !glareRef.current) return;
    cardRef.current.style.transform   = "perspective(800px) rotateX(0deg) rotateY(0deg)";
    glareRef.current.style.opacity    = "0";
  }

  return (
    <motion.div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={cn("relative overflow-hidden", className)}
      style={{
        willChange: "transform",
        transition: "transform 0.25s ease",
        ...style,
      }}
    >
      {children}

      {/* Glare overlay — pointer-events-none so clicks pass through */}
      <div
        ref={glareRef}
        aria-hidden="true"
        style={{
          position:      "absolute",
          inset:         0,
          opacity:       0,
          pointerEvents: "none",
          transition:    "opacity 0.2s ease",
          borderRadius:  "inherit",
        }}
      />
    </motion.div>
  );
}
