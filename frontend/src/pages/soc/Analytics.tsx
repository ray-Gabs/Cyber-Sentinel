/**
 * Analytics — charts and trends for SOC alert data.
 */
import { useEffect, useState } from "react";
import { getAlertStats } from "@/services/alertService";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import type { AlertStats } from "@/types";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";

const VERDICT_COLORS: Record<string, string> = {
  TRUE_POSITIVE: "#ef4444",
  FALSE_POSITIVE: "#22c55e",
  UNKNOWN: "#eab308",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#22c55e",
  info: "#6b7280",
};

const ACTION_COLORS: Record<string, string> = {
  ESCALATE: "#ef4444",
  MONITOR: "#eab308",
  DISMISS: "#6b7280",
};

export default function Analytics() {
  const [stats, setStats] = useState<AlertStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await getAlertStats();
        setStats(data);
      } catch {
        // ignore - endpoint may not have data yet
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!stats || stats.total === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        <p className="text-sm text-gray-500">Security trends and statistics</p>
        <div className="card py-16 text-center">
          <p className="text-gray-500">
            No alert data available yet. Analytics will appear once Wazuh alerts are ingested.
          </p>
        </div>
      </div>
    );
  }

  const verdictData = Object.entries(stats.by_verdict).map(([name, value]) => ({ name: name.replace("_", " "), value }));
  const severityData = Object.entries(stats.by_severity).map(([name, value]) => ({ name, value }));
  const actionData = Object.entries(stats.by_action).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        <p className="text-sm text-gray-500">
          Security trends and statistics — {stats.total.toLocaleString()} total alerts
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card text-center">
          <p className="text-xs text-gray-500 uppercase">Total Alerts</p>
          <p className="text-3xl font-bold text-white mt-1">{stats.total.toLocaleString()}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500 uppercase">True Positives</p>
          <p className="text-3xl font-bold text-red-400 mt-1">
            {stats.by_verdict.TRUE_POSITIVE ?? 0}
          </p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500 uppercase">Escalated</p>
          <p className="text-3xl font-bold text-orange-400 mt-1">
            {stats.by_action.ESCALATE ?? 0}
          </p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500 uppercase">Top Agents</p>
          <p className="text-3xl font-bold text-sentinel-400 mt-1">
            {stats.top_agents?.length ?? 0}
          </p>
        </div>
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Alert Timeline */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-400 uppercase mb-4">
            Alerts Over Time
          </h2>
          <div className="h-64">
            {stats.daily_counts && stats.daily_counts.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.daily_counts}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" stroke="#6b7280" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#6b7280" tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1f2937",
                      border: "1px solid #374151",
                      borderRadius: 8,
                      color: "#f3f4f6",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    dot={{ fill: "#0ea5e9", r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-500 text-center pt-24">No timeline data</p>
            )}
          </div>
        </div>

        {/* Verdict Breakdown */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-400 uppercase mb-4">
            AI Verdict Breakdown
          </h2>
          <div className="h-64">
            {verdictData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={verdictData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {verdictData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={VERDICT_COLORS[entry.name.replace(" ", "_")] ?? "#6b7280"}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1f2937",
                      border: "1px solid #374151",
                      borderRadius: 8,
                      color: "#f3f4f6",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-500 text-center pt-24">No verdict data</p>
            )}
          </div>
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Severity Distribution */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-400 uppercase mb-4">
            Severity Distribution
          </h2>
          <div className="h-64">
            {severityData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={severityData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" stroke="#6b7280" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#6b7280" tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1f2937",
                      border: "1px solid #374151",
                      borderRadius: 8,
                      color: "#f3f4f6",
                    }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {severityData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={SEVERITY_COLORS[entry.name] ?? "#6b7280"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-500 text-center pt-24">No severity data</p>
            )}
          </div>
        </div>

        {/* Action Distribution */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-400 uppercase mb-4">
            Action Distribution
          </h2>
          <div className="h-64">
            {actionData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={actionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {actionData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={ACTION_COLORS[entry.name] ?? "#6b7280"}
                      />
                    ))}
                  </Pie>
                  <Legend />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1f2937",
                      border: "1px solid #374151",
                      borderRadius: 8,
                      color: "#f3f4f6",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-500 text-center pt-24">No action data</p>
            )}
          </div>
        </div>
      </div>

      {/* Top Rules Table */}
      {stats.top_rules && stats.top_rules.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-400 uppercase mb-4">
            Top Triggered Rules
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Rule ID</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Description</th>
                  <th className="px-4 py-2 text-right text-xs text-gray-500 uppercase">Count</th>
                </tr>
              </thead>
              <tbody>
                {stats.top_rules.map((r) => (
                  <tr key={r._id} className="border-b border-gray-800/50">
                    <td className="px-4 py-2 text-gray-400 font-mono">{r._id}</td>
                    <td className="px-4 py-2 text-gray-300">{r.desc}</td>
                    <td className="px-4 py-2 text-right text-white font-medium">{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Agents */}
      {stats.top_agents && stats.top_agents.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-400 uppercase mb-4">
            Top Agents by Alert Volume
          </h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.top_agents} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis type="number" stroke="#6b7280" tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="_id"
                  stroke="#6b7280"
                  tick={{ fontSize: 11 }}
                  width={120}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1f2937",
                    border: "1px solid #374151",
                    borderRadius: 8,
                    color: "#f3f4f6",
                  }}
                />
                <Bar dataKey="count" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
