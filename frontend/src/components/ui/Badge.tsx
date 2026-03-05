export type Tone = "default" | "critical" | "high" | "medium" | "low" | "info" | "accent";

interface BadgeProps {
  tone?: Tone;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ tone = "default", dot = false, children, className = "" }: BadgeProps) {
  const toneCls = tone !== "default" ? `badge-${tone}` : "";
  const dotCls  = dot ? "badge-dot" : "";
  return (
    <span className={`badge ${toneCls} ${dotCls} ${className}`.trim()}>
      {children}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  const tone = (["critical","high","medium","low","info"].includes(severity.toLowerCase())
    ? severity.toLowerCase()
    : "info") as Tone;
  return <Badge tone={tone}>{severity}</Badge>;
}
