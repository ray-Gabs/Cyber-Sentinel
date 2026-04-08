/**
 * BentoGrid + BentoGridItem — CSS Grid bento layout container.
 * Inspired by React Bits / reactbits.dev/components/bento-grid
 * Drop-in replacement for grid className wrappers.
 * Handles responsive column collapse automatically.
 */
import { type ReactNode, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface BentoGridProps {
  children: ReactNode;
  /** Number of columns at desktop (default 4) */
  columns?: 2 | 3 | 4;
  /** Gap between cells (default "0.75rem") */
  gap?: string;
  className?: string;
  style?: CSSProperties;
  /** Animate children in with stagger (default true) */
  animate?: boolean;
}

const COL_CLASSES: Record<number, string> = {
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
};

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

export function BentoGrid({
  children,
  columns = 4,
  gap = "0.75rem",
  className,
  style,
  animate = true,
}: BentoGridProps) {
  const colClass = COL_CLASSES[columns] ?? COL_CLASSES[4];

  if (animate) {
    return (
      <motion.div
        className={cn("grid", colClass, className)}
        style={{ gap, ...style }}
        initial="hidden"
        animate="show"
        variants={containerVariants}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <div
      className={cn("grid", colClass, className)}
      style={{ gap, ...style }}
    >
      {children}
    </div>
  );
}

/* ── BentoGridItem ──────────────────────────────────────────────────────── */

interface BentoGridItemProps {
  children: ReactNode;
  /** Columns this cell spans (default 1) */
  colSpan?: 1 | 2 | 3 | 4;
  /** Rows this cell spans (default 1) */
  rowSpan?: 1 | 2;
  className?: string;
  style?: CSSProperties;
}

const COL_SPAN_CLASSES: Record<number, string> = {
  1: "col-span-1",
  2: "col-span-2",
  3: "col-span-3",
  4: "col-span-4",
};

const ROW_SPAN_CLASSES: Record<number, string> = {
  1: "row-span-1",
  2: "row-span-2",
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
};

export function BentoGridItem({
  children,
  colSpan = 1,
  rowSpan = 1,
  className,
  style,
}: BentoGridItemProps) {
  const colClass = COL_SPAN_CLASSES[colSpan] ?? "col-span-1";
  const rowClass = ROW_SPAN_CLASSES[rowSpan] ?? "row-span-1";

  return (
    <motion.div
      variants={itemVariants}
      className={cn(colClass, rowClass, className)}
      style={style}
    >
      {children}
    </motion.div>
  );
}
