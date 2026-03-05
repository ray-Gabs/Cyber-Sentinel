interface BarDatum {
  value: number;
  label: string;
  color?: string;
}

interface BarsProps {
  data: BarDatum[];
  height?: number;
  color?: string;
}

export function Bars({ data, height = 140, color = "var(--accent)" }: BarsProps) {
  const max = Math.max(...data.map(d => d.value));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height, padding: "8px 0" }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <div
            style={{
              width: "100%",
              height: `${(d.value / max) * 100}%`,
              background: d.color || color,
              borderRadius: "3px 3px 0 0",
              minHeight: 2,
              opacity: 0.9,
            }}
          />
          <div className="mono" style={{ fontSize: 10, color: "var(--text-4)" }}>{d.label}</div>
        </div>
      ))}
    </div>
  );
}
