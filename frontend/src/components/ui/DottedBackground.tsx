/**
 * DottedBackground — canvas-based animated dot wave.
 * Renders a grid of dots with a slow sine-wave propagating across them.
 * Pure canvas API, no external deps. Adapts to dark/light theme via props.
 */
import { useEffect, useRef } from "react";

interface DottedBackgroundProps {
  isDark?: boolean;
  className?: string;
}

export function DottedBackground({ isDark = true, className }: DottedBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Capture as non-null for use inside closures
    const cvs: HTMLCanvasElement      = canvas;
    const context: CanvasRenderingContext2D = ctx;

    let animId = 0;
    let count  = 0;

    const COLS     = 32;
    const ROWS     = 22;
    const BASE_DOT = 2.0;
    const MAX_DOT  = 4.0;

    function resize() {
      cvs.width  = cvs.offsetWidth;
      cvs.height = cvs.offsetHeight;
    }

    function draw() {
      context.clearRect(0, 0, cvs.width, cvs.height);

      const gapX = cvs.width  / (COLS - 1);
      const gapY = cvs.height / (ROWS - 1);

      for (let ix = 0; ix < COLS; ix++) {
        for (let iy = 0; iy < ROWS; iy++) {
          const phase = (ix * 0.6 + iy * 0.6) - count * 0.012;
          const wave  = Math.sin(phase) * 0.5 + 0.5;

          const opacity = isDark
            ? 0.12 + wave * 0.52   // dark:  0.12 → 0.64
            : 0.06 + wave * 0.30;  // light: 0.06 → 0.36

          const radius = BASE_DOT + wave * (MAX_DOT - BASE_DOT);

          context.beginPath();
          context.arc(ix * gapX, iy * gapY, radius, 0, Math.PI * 2);
          context.fillStyle = isDark
            ? `rgba(59,130,246,${opacity})`
            : `rgba(37,99,235,${opacity})`;
          context.fill();
        }
      }

      count++;
      animId = requestAnimationFrame(draw);
    }

    resize();
    draw();

    const observer = new ResizeObserver(resize);
    observer.observe(cvs);

    return () => {
      cancelAnimationFrame(animId);
      observer.disconnect();
    };
  }, [isDark]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    />
  );
}
