/**
 * Dashboard — overview page. TODO: Add stats, recent scans, recent alerts.
 */
export default function Dashboard() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Dashboard</h1>
      <p className="text-sm text-gray-500">Overview of your security posture</p>

      {/* TODO: Stat cards (active scans, findings, alerts) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card"><p className="text-gray-500">Active Scans: —</p></div>
        <div className="card"><p className="text-gray-500">Total Findings: —</p></div>
        <div className="card"><p className="text-gray-500">Critical Alerts: —</p></div>
        <div className="card"><p className="text-gray-500">Alerts Today: —</p></div>
      </div>

      {/* TODO: Recent scans list + Recent alerts list */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">Recent Scans</h2>
          <p className="text-gray-500 py-8 text-center">No scans yet.</p>
        </div>
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">Recent Alerts</h2>
          <p className="text-gray-500 py-8 text-center">No alerts yet.</p>
        </div>
      </div>
    </div>
  );
}
