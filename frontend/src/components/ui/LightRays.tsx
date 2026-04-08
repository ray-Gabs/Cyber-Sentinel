/**
 * LightRays — subtle diagonal light beam effect for light mode backgrounds.
 * CSS-only, GPU-friendly (opacity + transform only).
 */
export function LightRays({ className }: { className?: string }) {
  return (
    <div
      className={`absolute inset-0 overflow-hidden pointer-events-none ${className ?? ""}`}
      aria-hidden
    >
      <style>{`
        @keyframes lr-pulse {
          0%, 100% { opacity: 0.18; }
          50%       { opacity: 0.32; }
        }
      `}</style>

      {/* Primary ray */}
      <div
        style={{
          position: "absolute",
          top: "-20%",
          left: "30%",
          width: "2px",
          height: "160%",
          background: "linear-gradient(180deg, transparent 0%, rgba(59,130,246,0.22) 30%, rgba(59,130,246,0.12) 70%, transparent 100%)",
          transform: "rotate(-25deg)",
          animation: "lr-pulse 6s ease-in-out infinite",
          filter: "blur(6px)",
        }}
      />
      {/* Wide secondary ray */}
      <div
        style={{
          position: "absolute",
          top: "-10%",
          left: "48%",
          width: "80px",
          height: "140%",
          background: "linear-gradient(180deg, transparent 0%, rgba(99,155,255,0.12) 40%, rgba(99,155,255,0.06) 70%, transparent 100%)",
          transform: "rotate(-20deg)",
          animation: "lr-pulse 8s ease-in-out infinite 1.5s",
          filter: "blur(18px)",
        }}
      />
      {/* Tertiary thin ray */}
      <div
        style={{
          position: "absolute",
          top: "-30%",
          left: "65%",
          width: "1px",
          height: "160%",
          background: "linear-gradient(180deg, transparent 0%, rgba(59,130,246,0.18) 35%, transparent 100%)",
          transform: "rotate(-22deg)",
          animation: "lr-pulse 7s ease-in-out infinite 3s",
          filter: "blur(4px)",
        }}
      />
      {/* Soft ambient top glow */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "40%",
          background: "radial-gradient(ellipse 70% 60% at 50% 0%, rgba(59,130,246,0.06) 0%, transparent 80%)",
        }}
      />
    </div>
  );
}
