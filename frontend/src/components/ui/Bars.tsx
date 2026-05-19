interface BarDatum {
  value: number;
  label: string;
  color?: string;
}

interface BarsProps {
  data: BarDatum[];
  height?: number;
  color?: string;
  showValues?: boolean;
}

function fmtValue(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function Bars({ data, height = 140, color = "var(--accent)", showValues = false }: BarsProps) {
  const max      = Math.max(...data.map((d) => d.value), 1);
  const LABEL_H  = 20;   // px for the x-axis label row
  const VALUE_H  = showValues ? 16 : 0; // px for optional value label row
  const barAreaH = height - LABEL_H - VALUE_H - 8;

  return (
    <div style={{ display: "flex", gap: 4, height, padding: "4px 0" }}>
      {data.map((d, i) => {
        const barH = Math.max(2, Math.round((d.value / max) * barAreaH));
        return (
          <div
            key={i}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "flex-end",
            }}
          >
            {/* optional value label above bar */}
            {showValues && (
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  color: "var(--text-3)",
                  height: VALUE_H,
                  display: "flex",
                  alignItems: "flex-end",
                  paddingBottom: 2,
                  whiteSpace: "nowrap",
                }}
              >
                {d.value > 0 ? fmtValue(d.value) : ""}
              </div>
            )}

            {/* bar */}
            <div
              title={`${d.label}: ${d.value.toLocaleString()}`}
              style={{
                width: "100%",
                height: barH,
                flexShrink: 0,
                background: d.color || color,
                borderRadius: "3px 3px 0 0",
                opacity: 0.88,
                transition: "height 0.35s ease",
              }}
            />

            {/* x-axis label */}
            <div
              style={{
                fontSize: 10,
                color: "var(--text-4)",
                marginTop: 3,
                height: LABEL_H,
                fontFamily: "monospace",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "100%",
                textAlign: "center",
              }}
            >
              {d.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
