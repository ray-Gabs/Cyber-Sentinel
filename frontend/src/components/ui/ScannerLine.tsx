/**
 * ScannerLine — animated horizontal radar sweep line.
 * GPU-only: translates on Y axis only.
 * Use inside a `relative overflow-hidden` container.
 */
import { motion } from "framer-motion";

interface ScannerLineProps {
  color?: string;
  duration?: number;
  className?: string;
}

export function ScannerLine({
  color = "rgba(59,130,246,0.55)",
  duration = 3.5,
  className,
}: ScannerLineProps) {
  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className ?? ""}`}>
      <motion.div
        className="absolute left-0 right-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${color} 35%, rgba(255,255,255,0.6) 50%, ${color} 65%, transparent 100%)`,
          boxShadow: `0 0 10px 2px ${color}`,
        }}
        animate={{ top: ["-2%", "102%"] }}
        transition={{
          duration,
          repeat: Infinity,
          ease: "linear",
          repeatDelay: 1.2,
        }}
      />
    </div>
  );
}
