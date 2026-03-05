/**
 * AlertDetail — single alert with AI verdict. TODO: Fetch by ID.
 */
import { useParams } from "react-router-dom";

export default function AlertDetail() {
  const { id } = useParams();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Alert Detail</h1>
      <p className="text-gray-500">Alert ID: {id}</p>

      {/* TODO: Fetch from GET /api/alerts/{id}, show AI verdict + override buttons */}
      <div className="card">
        <p className="text-gray-500 py-8 text-center">Loading alert details...</p>
      </div>
    </div>
  );
}
