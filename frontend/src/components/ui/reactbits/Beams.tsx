/**
 * Beams — animated diagonal light beams for auth page backgrounds.
 * Inspired by React Bits / reactbits.dev/backgrounds/beams
 * Built from scratch using framer-motion v12.
 * Pointer-events: none — never blocks interaction.
 */
import { useEffect } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

interface BeamDef {
  left: string;
  top: string;
  rotate: number;
  width: number;
  height: number;
  opacity: number;
  animationDelay: string;
  animationDuration: string;
}

interface BeamsProps {
  /** Number of beams (default 5) */
  count?: number;
  /** Override beam color; defaults to var(--beam-color) */
  color?: string;
  /** Overall opacity multiplier 0–1 (default 1) */
  opacity?: number;
  className?: string;
}

const DEFAULT_BEAMS: BeamDef[] = [
  { left: "15%",  top: "0",   rotate: 35,  width: 2,  height: 60, opacity: 0.55, animationDelay: "0s",    animationDuration: "6s"  },
  { left: "30%",  top: "0",   rotate: 28,  width: 80, height: 50, opacity: 0.12, animationDelay: "1.2s",  animationDuration: "8s"  },
  { left: "50%",  top: "0",   rotate: 20,  width: 1,  height: 70, opacity: 0.40, animationDelay: "0.5s",  animationDuration: "7s"  },
  { left: "65%",  top: "0",   rotate: -25, width: 60, height: 45, opacity: 0.10, animationDelay: "2s",    animationDuration: "9s"  },
  { left: "80%",  top: "0",   rotate: -32, width: 1,  height: 65, opacity: 0.35, animationDelay: "0.8s",  animationDuration: "7.5s"},
];

const BEAM_KEYFRAME_ID = "cs-beam-pulse-keyframes";

export function Beams({ count = 5, color, opacity = 1, className }: BeamsProps) {
  const reduced = useReducedMotion();
  const beams = DEFAULT_BEAMS.slice(0, Math.max(1, Math.min(count, DEFAULT_BEAMS.length)));

  // Inject keyframes once into <head> — singleton guard prevents duplicates
  useEffect(() => {
    if (document.getElementById(BEAM_KEYFRAME_ID)) return;
    const style = document.createElement("style");
    style.id = BEAM_KEYFRAME_ID;
    style.textContent = `
      @keyframes beam-pulse {
        0%, 100% { opacity: 0; transform: translateY(-10%) scaleY(0.9); }
        50%       { opacity: 1; transform: translateY(0%)   scaleY(1);   }
      }
    `;
    document.head.appendChild(style);
  }, []);

  return (
    <div
      aria-hidden="true"
      className={cn("absolute inset-0 overflow-hidden pointer-events-none", className)}
      style={{ opacity }}
    >

      {beams.map((beam, i) => (
        <div
          key={i}
          style={{
            position:        "absolute",
            left:            beam.left,
            top:             beam.top,
            width:           beam.width,
            height:          `${beam.height}vh`,
            background:      color
              ? `linear-gradient(to bottom, transparent 0%, ${color} 40%, ${color} 60%, transparent 100%)`
              : `linear-gradient(to bottom, transparent 0%, var(--beam-color) 40%, var(--beam-color) 60%, transparent 100%)`,
            transform:       `rotate(${beam.rotate}deg)`,
            transformOrigin: "top center",
            opacity:         reduced ? 0 : beam.opacity,
            animation:       reduced ? "none" : `beam-pulse ${beam.animationDuration} ease-in-out ${beam.animationDelay} infinite`,
            filter:          beam.width > 10 ? "blur(18px)" : "blur(2px)",
            willChange:      "opacity, transform",
          }}
        />
      ))}

      {/* Soft radial overlay to blend beams with bg */}
      <div
        style={{
          position:   "absolute",
          inset:      0,
          background: "radial-gradient(ellipse 60% 60% at 50% 20%, transparent 30%, rgba(2,8,23,0.6) 100%)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
