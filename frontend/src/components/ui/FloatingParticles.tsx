/**
 * FloatingParticles — subtle animated particle field for dark backgrounds.
 * GPU-friendly: uses only CSS animation with transform/opacity.
 * Memoized to prevent regeneration on parent re-renders.
 */
import { useMemo } from "react";

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
}

interface FloatingParticlesProps {
  count?: number;
  color?: string;
  className?: string;
}

export function FloatingParticles({
  count = 18,
  color = "rgba(59,130,246,0.35)",
  className,
}: FloatingParticlesProps) {
  const particles: Particle[] = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: 20 + Math.random() * 80, // start in lower 80% of viewport
        size: Math.random() * 2 + 1,
        duration: Math.random() * 10 + 8,
        delay: -(Math.random() * 10),
      })),
    [count],
  );

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className ?? ""}`}>
      <style>{`
        @keyframes cs-float {
          0%   { transform: translateY(0)      translateX(0);    opacity: 0; }
          8%   { opacity: 1; }
          92%  { opacity: 0.6; }
          100% { transform: translateY(-110vh) translateX(15px); opacity: 0; }
        }
      `}</style>
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            backgroundColor: color,
            animation: `cs-float ${p.duration}s ${p.delay}s linear infinite`,
          }}
        />
      ))}
    </div>
  );
}
