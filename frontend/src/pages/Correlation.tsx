/**
 * Correlation — view and run correlation analysis linking pentest findings to SOC alerts.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getCorrelations, runCorrelation } from "@/services/correlationService";
import { getScans } from "@/services/scanService";
import { formatDate, cn } from "@/lib/utils";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import StatusBadge from "@/components/common/StatusBadge";
import { Link2, Sparkles, Play } from "lucide-react";
import type { Correlation, ScanSummary } from "@/types";

const CORRELATION_TYPE_LABELS: Record<string, string> = {
  ip_match: "IP Match",
  attack_pattern: "Attack Pattern",
  cve_match: "CVE Match",
  port_match: "Port Match",
  keyword: "Keyword",
};

function confidenceColor(c: number): string {
  if (c >= 0.8) return "text-green-400";
  if (c >= 0.5) return "text-yellow-400";
  return "text-gray-400";
}

export default function CorrelationPage() {
  const [correlations, setCorrelations] = useState<Correlation[]>([]);
  const [scans, setScans] = useState<ScanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [selectedScan, setSelectedScan] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [corrData, scanData] = await Promise.all([
          getCorrelations(),
          getScans(1, 50),
        ]);
        setCorrelations(corrData);
        setScans(scanData.filter((s) => s.status === "completed"));
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleRun = async () => {
    if (!selectedScan) return;
    setRunning(true);
    try {
      const result = await runCorrelation(selectedScan);
      setCorrelations((prev) => [result, ...prev]);
    } catch {
      // ignore
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Correlation Engine</h1>
        <p className="text-sm text-gray-500">
          Link pentesting findings to Wazuh SOC alerts
        </p>
      </div>

      {/* Run correlation */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-400 uppercase mb-3">
          Run New Correlation
        </h2>
        <div className="flex items-end gap-3">
          <div className="flex-1 max-w-sm">
            <label className="text-xs text-gray-500 mb-1 block">Select a completed scan</label>
            <select
              className="input"
              value={selectedScan}
              onChange={(e) => setSelectedScan(e.target.value)}
            >
              <option value="">Choose scan...</option>
              {scans.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.target} — {s.finding_count} findings
                </option>
              ))}
            </select>
          </div>
          <button
            className="btn-primary text-sm flex items-center gap-1.5"
            disabled={!selectedScan || running}
            onClick={handleRun}
          >
            {running ? <LoadingSpinner size="sm" /> : <Play size={14} />}
            {running ? "Running..." : "Run Correlation"}
          </button>
        </div>
      </div>

      {/* Correlation results */}
      {correlations.length === 0 ? (
        <div className="card py-12 text-center">
          <Link2 size={32} className="mx-auto text-gray-600 mb-3" />
          <p className="text-gray-500">
            No correlations yet. Select a completed scan and run the engine.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {correlations.map((corr) => (
            <div key={corr.id} className="card">
              {/* Header */}
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setExpanded(expanded === corr.id ? null : corr.id)}
              >
                <div className="flex items-center gap-3">
                  <Link2 size={18} className="text-sentinel-400" />
                  <div>
                    <span className="text-sm font-medium text-white">
                      {corr.scan_target}
                    </span>
                    <span className="ml-3 text-xs text-gray-500">
                      {corr.links.length} correlation{corr.links.length !== 1 ? "s" : ""} found
                    </span>
                  </div>
                </div>
                <span className="text-xs text-gray-500">
                  {formatDate(corr.created_at)}
                </span>
              </div>

              {/* Expanded details */}
              {expanded === corr.id && (
                <div className="mt-4 pt-4 border-t border-gray-700/50 space-y-4">
                  {/* AI summary */}
                  {corr.ai_summary && (
                    <div className="bg-sentinel-500/5 border border-sentinel-500/20 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles size={14} className="text-sentinel-400" />
                        <span className="text-xs font-semibold text-sentinel-400 uppercase">
                          AI Summary
                        </span>
                      </div>
                      <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                        {corr.ai_summary}
                      </p>
                    </div>
                  )}

                  {/* Links table */}
                  {corr.links.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-800">
                            <th className="px-3 py-2 text-left text-xs text-gray-500 uppercase">
                              Finding
                            </th>
                            <th className="px-3 py-2 text-left text-xs text-gray-500 uppercase">
                              Alert
                            </th>
                            <th className="px-3 py-2 text-left text-xs text-gray-500 uppercase">
                              Type
                            </th>
                            <th className="px-3 py-2 text-right text-xs text-gray-500 uppercase">
                              Confidence
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {corr.links.map((link, i) => (
                            <tr
                              key={i}
                              className="border-b border-gray-800/50"
                            >
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <StatusBadge
                                    value={link.finding_severity}
                                    variant="severity"
                                  />
                                  <span className="text-gray-300 truncate max-w-[200px]">
                                    {link.finding_name}
                                  </span>
                                  <span className="text-[10px] text-gray-600">
                                    ({link.finding_tool})
                                  </span>
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <div>
                                  <span className="text-gray-300 truncate max-w-[200px] block">
                                    {link.alert_rule_desc}
                                  </span>
                                  <span className="text-[10px] text-gray-600">
                                    Level {link.alert_level}
                                  </span>
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <span className="text-xs bg-gray-800 text-gray-400 border border-gray-700 px-2 py-0.5 rounded">
                                  {CORRELATION_TYPE_LABELS[link.correlation_type] ??
                                    link.correlation_type}
                                </span>
                              </td>
                              <td className={cn("px-3 py-2 text-right font-medium", confidenceColor(link.confidence))}>
                                {Math.round(link.confidence * 100)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="text-right">
                    <Link
                      to={`/scans/${corr.scan_id}`}
                      className="text-xs text-sentinel-400 hover:underline"
                    >
                      View Scan Details →
                    </Link>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
