interface DonutSegment {
  value: number;
  color: string;
}

interface DonutProps {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  label?: string | number;
  sub?: string;
}

export function Donut({ segments, size = 140, thickness = 16, label, sub }: DonutProps) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let acc = 0;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={thickness} />
        {segments.map((s, i) => {
          const len = (s.value / total) * c;
          const off = -acc;
          acc += len;
          return (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={off}
              strokeLinecap="butt"
            />
          );
        })}
      </svg>
      {(label !== undefined || sub) && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
          <div>
            {label !== undefined && (
              <div className="num" style={{ fontSize: 22, fontWeight: 600 }}>{label}</div>
            )}
            {sub && <div className="eyebrow" style={{ marginTop: 2 }}>{sub}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
