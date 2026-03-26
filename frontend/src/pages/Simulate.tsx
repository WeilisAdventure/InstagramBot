import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { simulateComment } from '../api/client';
import type { SimulateResult } from '../types';

export default function Simulate() {
  const [commentText, setCommentText] = useState('');
  const [username, setUsername] = useState('test_user');
  const [results, setResults] = useState<SimulateResult[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const run = async () => {
    if (!commentText.trim()) return;
    setLoading(true);
    try {
      const result = await simulateComment(commentText, username);
      setResults([result, ...results]);
    } catch {
      alert('Simulation failed');
    }
    setLoading(false);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Simulate Comment Trigger</h1>

      <div className="bg-white rounded-xl shadow p-6 max-w-2xl mb-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Comment Text</label>
            <textarea
              className="w-full border rounded-lg px-3 py-2"
              rows={3}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Enter a comment to test against your rules..."
            />
          </div>
          <button
            onClick={run}
            disabled={loading}
            className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50"
          >
            {loading ? 'Testing...' : 'Test Comment'}
          </button>
        </div>
      </div>

      <h2 className="text-lg font-semibold mb-3">Trigger Log</h2>
      <div className="space-y-3">
        {results.length === 0 && <p className="text-gray-500">No tests run yet.</p>}
        {results.map((r, i) => (
          <div key={i} className={`rounded-xl shadow p-4 ${r.triggered ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-sm font-medium ${r.triggered ? 'text-green-700' : 'text-gray-500'}`}>
                {r.triggered ? 'TRIGGERED' : 'NOT TRIGGERED'}
              </span>
              {r.matched_rule && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Rule: {r.matched_rule}</span>}
            </div>
            {r.public_reply && (
              <p className="text-sm"><span className="font-medium">Public Reply:</span> {r.public_reply}</p>
            )}
            {r.dm_content && (
              <p className="text-sm mt-1"><span className="font-medium">DM:</span> {r.dm_content}</p>
            )}
            {r.conversation_id && (
              <button
                onClick={() => navigate(`/conversations/${r.conversation_id}`)}
                className="text-sm text-blue-600 hover:underline mt-2"
              >
                View Conversation &rarr;
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
