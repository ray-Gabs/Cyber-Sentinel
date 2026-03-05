/**
 * StatusBadge — shows a colored badge for scan status or severity.
 *
 * TypeScript tip: The `variant` prop uses a union type ("severity" | "status")
 * which means it can ONLY be one of those two strings. Try passing "invalid"
 * and TypeScript will show an error in your editor.
 */
import { cn, severityBadge, statusColor, capitalize } from "@/lib/utils";

interface StatusBadgeProps {
  value: string;               // e.g., "critical", "running", "completed"
  variant?: "severity" | "status"; // controls the color scheme
}

export default function StatusBadge({ value, variant = "severity" }: StatusBadgeProps) {
  if (variant === "severity") {
    return <span className={severityBadge(value)}>{capitalize(value)}</span>;
  }

  // Status variant — simpler styling
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        statusColor(value)
      )}
    >
      {/* Pulsing dot for running status */}
      {value === "running" && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sentinel-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-sentinel-500" />
        </span>
      )}
      {capitalize(value)}
    </span>
  );
}
