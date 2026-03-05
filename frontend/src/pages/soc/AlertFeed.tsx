/**
 * AlertFeed — live alert list from Wazuh. TODO: Fetch from API + WebSocket.
 */
export default function AlertFeed() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">SOC Alerts</h1>
      <p className="text-sm text-gray-500">Wazuh alerts with AI triage</p>

      {/* TODO: Fetch from GET /api/alerts/ and display, add WebSocket for real-time */}
      <div className="card">
        <p className="text-gray-500 py-8 text-center">No alerts yet. Connect Wazuh to start monitoring.</p>
      </div>
    </div>
  );
}
