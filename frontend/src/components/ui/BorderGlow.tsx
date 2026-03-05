/**
 * BorderGlow — wraps children with an ambient glowing border effect.
 * GPU-only: uses box-shadow and opacity only. No layout properties animated.
 * Use on cards, panels, and feature highlights to add visual depth.
 */
import { motion } from "framer-motion";

interface BorderGlowProps {
  children: React.ReactNode;
  color?: string;
  intensity?: "low" | "medium" | "high";
  animate?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function BorderGlow({
  children,
  color = "rgba(59,130,246,1)",
  intensity = "low",
  animate = false,
  className,
  style,
}: BorderGlowProps) {
  const alphaMap = { low: 0.18, medium: 0.32, high: 0.50 };
  const alpha = alphaMap[intensity];
  const glow = color.replace(/[\d.]+\)$/, `${alpha})`);
  const glowFaint = color.replace(/[\d.]+\)$/, "0.04)");

  return (
    <div className={`relative ${className ?? ""}`} style={{ borderRadius: "inherit", ...style }}>
      {animate ? (
        <motion.div
          className="absolute inset-0 rounded-[inherit] pointer-events-none"
          style={{ border: `1px solid ${glow}` }}
          animate={{
            boxShadow: [
              `0 0 6px 0px ${glowFaint}`,
              `0 0 18px 3px ${glow}`,
              `0 0 6px 0px ${glowFaint}`,
            ],
          }}
          transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : (
        <div
          className="absolute inset-0 rounded-[inherit] pointer-events-none"
          style={{
            border: `1px solid ${glow}`,
            boxShadow: `0 0 14px 0px ${glow}`,
          }}
        />
      )}
      {children}
    </div>
  );
}
