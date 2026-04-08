/**
 * Threads — subtle flowing SVG thread texture for dashboard backgrounds.
 * Inspired by React Bits / reactbits.dev/backgrounds/threads
 * CSS-only animation (no framer-motion) — opacity is too low to justify JS animation.
 * Pointer-events: none — never blocks interaction.
 */
import { cn } from "@/lib/utils";

interface ThreadsProps {
  /** Number of thread lines (default 10) */
  count?: number;
  /** Thread stroke color; defaults to var(--accent) */
  color?: string;
  /** Overall opacity (default 0.06) */
  opacity?: number;
  className?: string;
}

export function Threads({ count = 10, color, opacity = 0.06, className }: ThreadsProps) {
  // Generate deterministic thread paths so SSR/CSR are consistent
  const threads = Array.from({ length: count }, (_, i) => {
    const yStart    = (i / count) * 100;
    const yMid      = yStart + 8 + (i % 3) * 4;
    const yEnd      = yStart + 2 - (i % 2) * 3;
    const xControl  = 30 + (i % 4) * 15;
    const delay     = `${(i * 0.8).toFixed(1)}s`;
    const duration  = `${14 + (i % 5) * 3}s`;

    return {
      d: `M0 ${yStart} Q${xControl} ${yMid} 100 ${yEnd}`,
      strokeWidth: i % 3 === 0 ? 0.4 : 0.2,
      delay,
      duration,
    };
  });

  const strokeColor = color ?? "var(--accent)";

  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none", className)}
      style={{ opacity }}
    >
      <style>{`
        @keyframes thread-flow {
          0%   { stroke-dashoffset: 200; opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { stroke-dashoffset: 0;   opacity: 0; }
        }
      `}</style>

      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ width: "100%", height: "100%" }}
        xmlns="http://www.w3.org/2000/svg"
      >
        {threads.map((thread, i) => (
          <path
            key={i}
            d={thread.d}
            fill="none"
            stroke={strokeColor}
            strokeWidth={thread.strokeWidth}
            strokeDasharray="200"
            strokeDashoffset="200"
            style={{
              animation: `thread-flow ${thread.duration} linear ${thread.delay} infinite`,
              willChange: "stroke-dashoffset, opacity",
            }}
          />
        ))}
      </svg>
    </div>
  );
}
