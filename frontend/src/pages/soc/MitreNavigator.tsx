import { useState, useEffect } from "react";
import { Target, RefreshCw, AlertTriangle } from "lucide-react";
import { getMitreSummary, type MitreSummary } from "@/services/alertService";

const TACTIC_COLORS: Record<string, string> = {
  "Initial Access":       "#ef4444",
  "Execution":            "#f97316",
  "Persistence":          "#eab308",
  "Privilege Escalation": "#a855f7",
  "Defense Evasion":      "#6366f1",
  "Credential Access":    "#ec4899",
  "Discovery":            "#14b8a6",
  "Lateral Movement":     "#3b82f6",
  "Collection":           "#22c55e",
  "Command and Control":  "#f43f5e",
  "Exfiltration":         "#f59e0b",
  "Impact":               "#dc2626",
  "Unknown":              "#475569",
};

function heatBg(count: number, max: number): string {
  if (max === 0) return "rgba(255,255,255,0.03)";
  const r = count / max;
  if (r >= 0.8) return "rgba(239,68,68,0.75)";
  if (r >= 0.6) return "rgba(239,68,68,0.50)";
  if (r >= 0.4) return "rgba(245,158,11,0.45)";
  if (r >= 0.2) return "rgba(245,158,11,0.25)";
  return "rgba(255,255,255,0.06)";
}

function heatText(count: number, max: number): string {
  return count / max >= 0.4 ? "#fff" : "var(--text-muted)";
}

export default function MitreNavigator() {
  const [data, setData] = useState<MitreSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<{ tactic: string; technique: string } | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setData(await getMitreSummary());
    } catch {
      setError("Failed to load MITRE data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const tactics = data ? Object.entries(data.by_tactic) : [];
  const globalMax = tactics.reduce((m, [, t]) => Math.max(m, ...Object.values(t)), 0);

  return (
    <div className="flex flex-col gap-6 p-6 min-h-screen" style={{ backgroundColor: "var(--bg-base)" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center w-10 h-10 rounded-xl"
            style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.25)" }}
          >
            <Target size={18} style={{ color: "#ef4444" }} />
          </div>
          <div>
            <h1
              className="text-xl font-bold"
              style={{ fontFamily: "Space Grotesk, sans-serif", color: "var(--text-base)" }}
            >
              MITRE ATT&CK Navigator
            </h1>
            <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
              Technique frequency from recent alerts
            </p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ backgroundColor: "var(--bg-muted)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      {data && (
        <div className="grid grid-cols-3 gap-3">
          {([
            ["Tactics Detected",  tactics.length],
            ["Technique Hits",    data.total_technique_hits.toLocaleString()],
            ["Alerts Analyzed",   data.alerts_analyzed.toLocaleString()],
          ] as [string, string | number][]).map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl px-4 py-3"
              style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}
            >
              <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{label}</p>
              <p
                className="text-2xl font-bold mt-0.5"
                style={{ color: "var(--text-base)", fontFamily: "Space Grotesk, sans-serif" }}
              >
                {value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          className="flex items-center gap-3 p-4 rounded-xl"
          style={{ backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
        >
          <AlertTriangle size={16} style={{ color: "#ef4444" }} />
          <p className="text-sm" style={{ color: "#ef4444" }}>{error}</p>
          <button onClick={load} className="ml-auto text-xs underline" style={{ color: "#ef4444" }}>
            Retry
          </button>
        </div>
      )}

      {/* Skeleton */}
      {loading && (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl animate-pulse"
              style={{ height: 200, backgroundColor: "var(--bg-surface)" }}
            />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && data && tactics.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Target size={40} style={{ color: "var(--text-subtle)" }} />
          <p className="text-sm" style={{ color: "var(--text-subtle)" }}>
            No MITRE techniques detected yet
          </p>
        </div>
      )}

      {/* Heatmap */}
      {!loading && data && tactics.length > 0 && (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
          {tactics
            .sort(
              ([, a], [, b]) =>
                Object.values(b).reduce((s, n) => s + n, 0) -
                Object.values(a).reduce((s, n) => s + n, 0)
            )
            .map(([tactic, techniques]) => {
              const tacticColor = TACTIC_COLORS[tactic] ?? TACTIC_COLORS["Unknown"];
              const tacticTotal = Object.values(techniques).reduce((s, n) => s + n, 0);
              const sortedTechs = Object.entries(techniques).sort(([, a], [, b]) => b - a);

              return (
                <div
                  key={tactic}
                  className="rounded-xl overflow-hidden flex flex-col"
                  style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}
                >
                  <div
                    className="px-3 py-2 flex items-center justify-between gap-1"
                    style={{
                      backgroundColor: `${tacticColor}18`,
                      borderBottom: `1px solid ${tacticColor}30`,
                    }}
                  >
                    <p className="text-[11px] font-semibold leading-tight truncate" style={{ color: tacticColor }}>
                      {tactic}
                    </p>
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                      style={{ backgroundColor: `${tacticColor}25`, color: tacticColor }}
                    >
                      {tacticTotal}
                    </span>
                  </div>

                  <div className="p-2 flex flex-col gap-1">
                    {sortedTechs.map(([technique, count]) => {
                      const isHovered = hovered?.tactic === tactic && hovered?.technique === technique;
                      return (
                        <div
                          key={technique}
                          className="px-2 py-1.5 rounded-lg transition-all duration-150"
                          style={{
                            backgroundColor: heatBg(count, globalMax),
                            border: isHovered ? `1px solid ${tacticColor}60` : "1px solid transparent",
                          }}
                          onMouseEnter={() => setHovered({ tactic, technique })}
                          onMouseLeave={() => setHovered(null)}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span
                              className="text-[11px] font-mono font-medium truncate"
                              style={{ color: heatText(count, globalMax) }}
                            >
                              {technique}
                            </span>
                            <span
                              className="text-[10px] font-bold shrink-0"
                              style={{ color: heatText(count, globalMax) }}
                            >
                              {count}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* Legend */}
      {!loading && data && tactics.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Frequency:</p>
          {([
            ["Low",       "rgba(255,255,255,0.06)"],
            ["Medium",    "rgba(245,158,11,0.25)"],
            ["High",      "rgba(245,158,11,0.45)"],
            ["Very High", "rgba(239,68,68,0.50)"],
            ["Critical",  "rgba(239,68,68,0.75)"],
          ] as [string, string][]).map(([label, bg]) => (
            <div key={label} className="flex items-center gap-1.5">
              <div
                className="w-4 h-4 rounded"
                style={{ backgroundColor: bg, border: "1px solid var(--border)" }}
              />
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
