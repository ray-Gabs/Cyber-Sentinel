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
};

export function VerdictPill({ verdict }: VerdictPillProps) {
  const m = VERDICT_MAP[verdict] ?? VERDICT_MAP.unknown;
  return <Badge tone={m.tone} dot>{m.label}</Badge>;
}
