/**
 * Dashboard — overview page showing active scans, findings, alert stats, and recent activity.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getScans } from "@/services/scanService";
import { getAlertStats } from "@/services/alertService";
import { TOOL_INFO, SCAN_TYPE_LABELS } from "@/lib/constants";
import StatusBadge from "@/components/common/StatusBadge";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import ToolIcon from "@/components/common/ToolIcon";
import type { ScanSummary, AlertStats } from "@/types";

export default function Dashboard() {
  const [scans, setScans] = useState<ScanSummary[]>([]);
  const [alertStats, setAlertStats] = useState<AlertStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [scanData, statsData] = await Promise.allSettled([
        getScans(1, 50),
        getAlertStats(),
      ]);
      if (scanData.status === "fulfilled") setScans(scanData.value);
      if (statsData.status === "fulfilled") setAlertStats(statsData.value);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const activeScans = scans.filter((s) => s.status === "running" || s.status === "pending");
  const completedScans = scans.filter((s) => s.status === "completed");
  const totalFindings = scans.reduce((sum, s) => sum + (s.finding_count || 0), 0);
  const criticalFindings = scans.reduce((sum, s) => {
    // We only have finding_count in summary — use risk_score as proxy
    return sum + (s.risk_score && s.risk_score >= 7 ? 1 : 0);
  }, 0);

  if (loading) {
    return <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Dashboard</h1>
      <p className="text-sm text-gray-500">Overview of your security posture</p>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Active Scans</p>
          <p className={`text-3xl font-bold mt-1 ${activeScans.length > 0 ? "text-sentinel-400" : "text-white"}`}>
            {activeScans.length}
          </p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Completed Scans</p>
          <p className="text-3xl font-bold mt-1 text-white">{completedScans.length}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Findings</p>
          <p className="text-3xl font-bold mt-1 text-white">{totalFindings}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500 uppercase tracking-wide">High-Risk Scans</p>
          <p className={`text-3xl font-bold mt-1 ${criticalFindings > 0 ? "text-severity-critical" : "text-white"}`}>
            {criticalFindings}
          </p>
        </div>
      </div>

      {/* SOC Alert Stats */}
      {alertStats && alertStats.total > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase mb-3">SOC Overview</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="card">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Total Alerts</p>
              <p className="text-3xl font-bold mt-1 text-white">{alertStats.total.toLocaleString()}</p>
            </div>
            <div className="card">
              <p className="text-xs text-gray-500 uppercase tracking-wide">True Positives</p>
              <p className="text-3xl font-bold mt-1 text-red-400">
                {alertStats.by_verdict?.TRUE_POSITIVE ?? 0}
              </p>
            </div>
            <div className="card">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Escalated</p>
              <p className="text-3xl font-bold mt-1 text-orange-400">
                {alertStats.by_action?.ESCALATE ?? 0}
              </p>
            </div>
            <div className="card">
              <p className="text-xs text-gray-500 uppercase tracking-wide">False Positives</p>
              <p className="text-3xl font-bold mt-1 text-green-400">
                {alertStats.by_verdict?.FALSE_POSITIVE ?? 0}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Active scans with live progress */}
      {activeScans.length > 0 && (
        <div className="card border-sentinel-500/20">
          <h2 className="text-lg font-semibold text-white mb-4">Active Scans</h2>
          <div className="space-y-4">
            {activeScans.map((scan) => (
              <Link key={scan.id} to={`/scans/${scan.id}`} className="block">
                <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4 hover:border-sentinel-500/40 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-white">{scan.target}</span>
                      <StatusBadge value={scan.status} variant="status" />
                      <span className="text-xs text-gray-500">{SCAN_TYPE_LABELS[scan.scan_type]}</span>
                    </div>
                    <span className="text-sm text-white font-medium">{scan.progress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-700 rounded-full">
                    <div
                      className="h-1.5 rounded-full bg-sentinel-500 transition-all duration-500"
                      style={{ width: `${scan.progress}%` }}
                    />
                  </div>
                  {scan.current_stage && TOOL_INFO[scan.current_stage] && (
                    <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-1">
                      <ToolIcon name={TOOL_INFO[scan.current_stage].icon} size={12} /> Running: {TOOL_INFO[scan.current_stage].label}
                      <span className="text-gray-600 ml-2">({TOOL_INFO[scan.current_stage].owasp})</span>
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recent scans */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Recent Scans</h2>
            <Link to="/scans" className="text-xs text-sentinel-400 hover:underline">View all</Link>
          </div>
          {scans.length === 0 ? (
            <p className="text-gray-500 py-8 text-center">No scans yet.</p>
          ) : (
            <div className="space-y-2">
              {scans.slice(0, 8).map((scan) => (
                <Link
                  key={scan.id}
                  to={`/scans/${scan.id}`}
                  className="flex items-center justify-between rounded-lg border border-gray-700/50 px-3 py-2 hover:border-gray-600 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <StatusBadge value={scan.status} variant="status" />
                    <span className="text-sm text-white truncate">{scan.target}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 shrink-0">
                    <span>{scan.finding_count} findings</span>
                    {scan.risk_score != null && (
                      <span className={
                        scan.risk_score >= 7 ? "text-severity-critical" :
                        scan.risk_score >= 4 ? "text-severity-medium" :
                        "text-severity-low"
                      }>
                        {scan.risk_score.toFixed(1)}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <Link
              to="/scans/new"
              className="flex items-center gap-3 rounded-lg border border-gray-700/50 px-4 py-3 hover:border-sentinel-500/40 transition-colors"
            >
              <span className="text-xl">🚀</span>
              <div>
                <p className="text-sm font-medium text-white">New Scan</p>
                <p className="text-xs text-gray-500">Launch a penetration test against a target</p>
              </div>
            </Link>
            <Link
              to="/alerts"
              className="flex items-center gap-3 rounded-lg border border-gray-700/50 px-4 py-3 hover:border-sentinel-500/40 transition-colors"
            >
              <span className="text-xl">🛡️</span>
              <div>
                <p className="text-sm font-medium text-white">Alert Feed</p>
                <p className="text-xs text-gray-500">View Wazuh SIEM alerts and AI verdicts</p>
              </div>
            </Link>
            <Link
              to="/analytics"
              className="flex items-center gap-3 rounded-lg border border-gray-700/50 px-4 py-3 hover:border-sentinel-500/40 transition-colors"
            >
              <span className="text-xl">📊</span>
              <div>
                <p className="text-sm font-medium text-white">Analytics</p>
                <p className="text-xs text-gray-500">View trends and statistics</p>
              </div>
            </Link>
            <Link
              to="/correlations"
              className="flex items-center gap-3 rounded-lg border border-gray-700/50 px-4 py-3 hover:border-sentinel-500/40 transition-colors"
            >
              <span className="text-xl">🔗</span>
              <div>
                <p className="text-sm font-medium text-white">Correlation</p>
                <p className="text-xs text-gray-500">Link pentest findings to SOC alerts</p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
