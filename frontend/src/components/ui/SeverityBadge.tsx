/**
 * SeverityBadge — shared severity + status indicator.
 * Pill shape, IBM Plex Mono font, case-insensitive severity strings.
 * Also handles user status variants: active | pending | disabled.
 */

interface SeverityBadgeProps {
  severity: string;
  className?: string;
}

type SevConfig = { bg: string; color: string; border: string };

const SEV_STYLE: Record<string, SevConfig> = {
  critical: {
    bg:     "rgba(239,68,68,0.15)",
    color:  "var(--sev-critical-text)",
    border: "rgba(239,68,68,0.4)",
  },
  high: {
    bg:     "rgba(249,115,22,0.15)",
    color:  "var(--sev-high-text)",
    border: "rgba(249,115,22,0.4)",
  },
  medium: {
    bg:     "rgba(234,179,8,0.15)",
    color:  "var(--sev-medium-text)",
    border: "rgba(234,179,8,0.4)",
  },
  low: {
    bg:     "rgba(34,197,94,0.15)",
    color:  "var(--sev-low-text)",
    border: "rgba(34,197,94,0.4)",
  },
  info: {
    bg:     "rgba(71,85,105,0.25)",
    color:  "var(--text-muted)",
    border: "var(--border)",
  },
  informational: {
    bg:     "rgba(71,85,105,0.25)",
    color:  "var(--text-muted)",
    border: "var(--border)",
  },
  // User status variants
  active: {
    bg:     "rgba(34,197,94,0.15)",
    color:  "var(--sev-low-text)",
    border: "rgba(34,197,94,0.4)",
  },
  pending: {
    bg:     "rgba(234,179,8,0.15)",
    color:  "var(--sev-medium-text)",
    border: "rgba(234,179,8,0.4)",
  },
  disabled: {
    bg:     "var(--bg-muted)",
    color:  "var(--text-muted)",
    border: "var(--border)",
  },
  suspended: {
    bg:     "rgba(239,68,68,0.08)",
    color:  "var(--sev-critical-text)",
    border: "rgba(239,68,68,0.3)",
  },
};

export default function SeverityBadge({ severity, className = "" }: SeverityBadgeProps) {
  const key = severity?.toLowerCase() ?? "info";
  const style = SEV_STYLE[key] ?? SEV_STYLE.info;

  return (
    <span
      className={className}
      style={{
        display:        "inline-flex",
        alignItems:     "center",
        borderRadius:   "9999px",
        padding:        "2px 8px",
        fontFamily:     "'IBM Plex Mono', 'JetBrains Mono', monospace",
        fontSize:       "11px",
        fontWeight:     500,
        textTransform:  "uppercase",
        letterSpacing:  "0.04em",
        lineHeight:     1.5,
        whiteSpace:     "nowrap",
        backgroundColor: style.bg,
        color:           style.color,
        border:          `1px solid ${style.border}`,
      }}
    >
      {severity}
    </span>
  );
}
