/**
 * LoadingSpinner + Skeleton components.
 */
import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = {
  sm: "h-4 w-4 border-2",
  md: "h-8 w-8 border-2",
  lg: "h-12 w-12 border-3",
};

export default function LoadingSpinner({ size = "md", className }: LoadingSpinnerProps) {
  return (
    <div
      className={cn(
        "animate-spin rounded-full border-t-transparent",
        sizes[size],
        className
      )}
      style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
    />
  );
}

/** Full-page centered spinner */
export function PageLoader() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <LoadingSpinner size="lg" />
    </div>
  );
}

/** Generic shimmer skeleton block */
export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={cn("rounded-lg animate-pulse", className)}
      style={{
        backgroundColor: "var(--bg-muted)",
        ...style,
      }}
    />
  );
}

/** Card-shaped skeleton (title + body lines) */
export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div
      className="rounded-xl p-5 space-y-3"
      style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <Skeleton className="h-4 w-2/5" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-3" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

/** Row skeleton for tables/lists */
export function RowSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-lg"
          style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          <Skeleton className="h-7 w-7 rounded-md shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3" style={{ width: `${50 + (i % 3) * 15}%` }} />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
          <Skeleton className="h-5 w-14 rounded-full shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** Stat card skeleton */
export function StatSkeleton() {
  return (
    <div className="stat-card space-y-2">
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-7 w-2/3" />
      <Skeleton className="h-2.5 w-1/3" />
    </div>
  );
}
