/**
 * Analytics — charts and trends. TODO: Add recharts visualizations.
 */
export default function Analytics() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Analytics</h1>
      <p className="text-sm text-gray-500">Security trends and statistics</p>

      {/* TODO: Add charts using recharts (alerts over time, severity breakdown, etc.) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card h-64 flex items-center justify-center">
          <p className="text-gray-500">Alert timeline chart — coming soon</p>
        </div>
        <div className="card h-64 flex items-center justify-center">
          <p className="text-gray-500">Severity breakdown chart — coming soon</p>
        </div>
      </div>
    </div>
  );
}
