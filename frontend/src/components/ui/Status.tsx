type StatusTone = "critical" | "high" | "medium" | "low" | "info";

interface StatusProps {
  tone?: StatusTone;
  children: React.ReactNode;
}

export function Status({ tone = "low", children }: StatusProps) {
  return (
    <span className="row" style={{ gap: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: `var(--sev-${tone})` }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: `var(--sev-${tone})`,
        boxShadow: `0 0 8px var(--sev-${tone})`,
        flexShrink: 0,
      }} />
      {children}
    </span>
  );
}
