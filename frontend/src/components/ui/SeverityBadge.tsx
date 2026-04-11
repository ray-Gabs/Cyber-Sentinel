/**
 * SeverityBadge — shared severity indicator used across scans, alerts, and findings.
 * Accepts case-insensitive severity strings.
 * Uses CSS custom properties from design-tokens.css for theme-aware coloring.
 */

interface SeverityBadgeProps {
  severity: string;
  className?: string;
}

const SEV_TOKEN: Record<string, string> = {
  critical: "critical",
  high:     "high",
  medium:   "medium",
  low:      "low",
  info:     "info",
};

export default function SeverityBadge({ severity, className = "" }: SeverityBadgeProps) {
  const key = SEV_TOKEN[severity?.toLowerCase()] ?? "info";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide border ${className}`.trim()}
      style={{
        backgroundColor: `color-mix(in srgb, var(--sev-${key}) 15%, transparent)`,
        color: `var(--sev-${key}-text)`,
        borderColor: `color-mix(in srgb, var(--sev-${key}) 30%, transparent)`,
      }}
    >
      {severity}
    </span>
  );
}
