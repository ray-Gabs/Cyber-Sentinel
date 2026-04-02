/**
 * SeverityBadge — shared severity indicator used across scans, alerts, and findings.
 * Accepts case-insensitive severity strings.
 */

interface SeverityBadgeProps {
  severity: string;
  className?: string;
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400 border border-red-500/30",
  high:     "bg-orange-500/20 text-orange-400 border border-orange-500/30",
  medium:   "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
  low:      "bg-blue-500/20 text-blue-400 border border-blue-500/30",
  info:     "bg-slate-500/20 text-slate-400 border border-slate-500/30",
};

export default function SeverityBadge({ severity, className = "" }: SeverityBadgeProps) {
  const key = severity?.toLowerCase() ?? "info";
  const styles = SEVERITY_STYLES[key] ?? SEVERITY_STYLES.info;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${styles} ${className}`.trim()}
    >
      {severity}
    </span>
  );
}
