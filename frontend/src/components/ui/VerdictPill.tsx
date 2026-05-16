import { Badge } from "./Badge";

interface VerdictPillProps {
  verdict: string;
}

const VERDICT_MAP: Record<string, { tone: "critical" | "high" | "medium" | "info" | "low"; label: string }> = {
  true_positive:  { tone: "critical", label: "TRUE POSITIVE"  },
  false_positive: { tone: "medium",   label: "FALSE POSITIVE" },
  unknown:        { tone: "info",     label: "UNKNOWN"        },
  unanalyzed:     { tone: "low",      label: "UNANALYZED"     },
  triage_failed:  { tone: "high",     label: "TRIAGE FAILED"  },
};

export function VerdictPill({ verdict }: VerdictPillProps) {
  const key = (verdict ?? "").toLowerCase().replace(/-/g, "_");
  const m = VERDICT_MAP[key] ?? VERDICT_MAP.unknown;
  return <Badge tone={m.tone} dot>{m.label}</Badge>;
}
