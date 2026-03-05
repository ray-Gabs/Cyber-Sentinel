import { Icon } from "./Icon";
import { Sparkline } from "./Sparkline";

interface KPIProps {
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
  accent?: "default" | "critical" | "high" | "medium" | "low" | "info";
  icon?: string;
  trend?: "up" | "down" | "neutral";
}

export function KPI({ label, value, unit, sub, accent = "default", icon, trend }: KPIProps) {
  return (
    <div className="kpi">
      <div className="kpi-label">
        <span>{label}</span>
        {icon && <Icon name={icon} size={12} style={{ color: "var(--text-4)" }} />}
      </div>
      <div
        className="kpi-value"
        style={{ color: accent !== "default" ? `var(--sev-${accent})` : undefined }}
      >
        {value}
        {unit && (
          <span style={{ fontSize: 14, color: "var(--text-3)", marginLeft: 4 }}>{unit}</span>
        )}
      </div>
      {sub && (
        <div className={`kpi-trend${trend ? ` ${trend}` : ""}`}>{sub}</div>
      )}
    </div>
  );
}

interface KPIWithSparkProps extends KPIProps {
  sparkData?: number[];
  sparkColor?: string;
}

export function KPIWithSpark({ sparkData, sparkColor, ...kpiProps }: KPIWithSparkProps) {
  return (
    <div className="kpi" style={{ gap: 0 }}>
      <div className="kpi-label">
        <span>{kpiProps.label}</span>
        {kpiProps.icon && <Icon name={kpiProps.icon} size={12} style={{ color: "var(--text-4)" }} />}
      </div>
      <div
        className="kpi-value"
        style={{
          color: kpiProps.accent !== "default" ? `var(--sev-${kpiProps.accent})` : undefined,
          marginTop: 4,
        }}
      >
        {kpiProps.value}
        {kpiProps.unit && (
          <span style={{ fontSize: 14, color: "var(--text-3)", marginLeft: 4 }}>{kpiProps.unit}</span>
        )}
      </div>
      {kpiProps.sub && (
        <div className={`kpi-trend${kpiProps.trend ? ` ${kpiProps.trend}` : ""}`} style={{ marginTop: 2 }}>
          {kpiProps.sub}
        </div>
      )}
      {sparkData && sparkData.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <Sparkline data={sparkData} color={sparkColor} height={28} />
        </div>
      )}
    </div>
  );
}
