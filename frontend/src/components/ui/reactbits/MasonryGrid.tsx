/**
 * MasonryGrid — CSS column-count masonry layout for variable-height cards.
 * Inspired by React Bits / reactbits.dev/components/masonry
 * Uses CSS column-count with breakInside: avoid — no JS layout engine.
 * Responsive columns via CSS media queries in inline style injection.
 */
import { type ReactNode, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface ResponsiveColumns {
  sm?: number;  // ≥ 640px
  md?: number;  // ≥ 768px
  lg?: number;  // ≥ 1024px
}

interface MasonryGridProps {
  children: ReactNode;
  /**
   * Column count — either a fixed number or responsive object.
   * Default: { sm: 1, md: 2, lg: 3 }
   */
  columns?: number | ResponsiveColumns;
  /** Gap between items (default "0.75rem") */
  gap?: string;
  className?: string;
  style?: CSSProperties;
}

export function MasonryGrid({
  children,
  columns = { sm: 1, md: 2, lg: 3 },
  gap = "0.75rem",
  className,
  style,
}: MasonryGridProps) {
  const uid = "masonry-grid";

  // Build column-count CSS per breakpoint
  let responsiveStyles = "";
  if (typeof columns === "number") {
    responsiveStyles = `.${uid} { column-count: ${columns}; }`;
  } else {
    const sm = columns.sm ?? 1;
    const md = columns.md ?? 2;
    const lg = columns.lg ?? 3;
    responsiveStyles = `
      .${uid} { column-count: ${sm}; }
      @media (min-width: 768px)  { .${uid} { column-count: ${md}; } }
      @media (min-width: 1024px) { .${uid} { column-count: ${lg}; } }
    `;
  }

  return (
    <>
      <style>{responsiveStyles}</style>
      <div
        className={cn(uid, className)}
        style={{ columnGap: gap, ...style }}
      >
        {/* Each direct child needs break-inside: avoid */}
        {Array.isArray(children)
          ? children.map((child, i) => (
              <div key={i} style={{ breakInside: "avoid", marginBottom: gap }}>
                {child}
              </div>
            ))
          : (
            <div style={{ breakInside: "avoid", marginBottom: gap }}>
              {children}
            </div>
          )
        }
      </div>
    </>
  );
}
