import { Badge } from "./Badge";

type Verdict = "true_positive" | "false_positive" | "unknown" | "unanalyzed";

interface VerdictPillProps {
  verdict: Verdict | string;
}

const VERDICT_MAP: Record<string, { tone: "critical" | "medium" | "info" | "low"; label: string }> = {
  true_positive:  { tone: "critical", label: "TRUE POSITIVE" },
  false_positive: { tone: "medium",   label: "FALSE POSITIVE" },
  unknown:        { tone: "info",     label: "UNKNOWN" },
  unanalyzed:     { tone: "low",      label: "UNANALYZED" },
  triage_failed:  { tone: "low",      label: "TRIAGE FAILED" },
  low_priority:   { tone: "low",      label: "LOW PRIORITY" },
};

export function VerdictPill({ verdict }: VerdictPillProps) {
  const m = VERDICT_MAP[verdict?.toLowerCase()] ?? VERDICT_MAP.unanalyzed;
  return <Badge tone={m.tone} dot>{m.label}</Badge>;
}
