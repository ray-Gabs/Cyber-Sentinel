interface SeverityCounts {
  critical?: number;
  high?: number;
  medium?: number;
  low?: number;
  info?: number;
}

interface SeverityBarProps {
  counts: SeverityCounts;
}

const SEV_ORDER = [
  { key: "critical" as const, color: "var(--sev-critical)" },
  { key: "high" as const, color: "var(--sev-high)" },
  { key: "medium" as const, color: "var(--sev-medium)" },
  { key: "low" as const, color: "var(--sev-low)" },
  { key: "info" as const, color: "var(--sev-info)" },
];

export function SeverityBar({ counts }: SeverityBarProps) {
  const total = Object.values(counts).reduce((s, v) => s + (v ?? 0), 0) || 1;
  return (
    <div>
      <div style={{ display: "flex", height: 10, borderRadius: 3, overflow: "hidden", background: "var(--surface-2)" }}>
        {SEV_ORDER.map(({ key, color }) =>
          counts[key] ? (
            <div
              key={key}
              title={`${key} ${counts[key]}`}
              style={{ width: `${((counts[key] ?? 0) / total) * 100}%`, background: color }}
            />
          ) : null
        )}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
        {SEV_ORDER.map(({ key, color }) => (
          <div key={key} className="row" style={{ gap: 6, fontSize: 11 }}>
            <span style={{ width: 8, height: 8, background: color, borderRadius: 2 }} />
            <span className="muted" style={{ textTransform: "capitalize" }}>{key}</span>
            <span className="num">{counts[key] ?? 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
