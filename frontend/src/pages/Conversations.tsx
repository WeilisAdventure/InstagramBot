import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getConversations } from '../api/client';
import type { Conversation } from '../types';

export default function Conversations() {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    getConversations().then(setConvs).catch(() => {});
  }, []);

  const triggerLabel = (c: Conversation) => {
    if (c.trigger_source === 'comment_rule') return 'Comment Rule';
    if (c.trigger_source === 'simulation') return 'Simulation';
    return 'Direct DM';
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Conversations</h1>
      <div className="space-y-2">
        {convs.length === 0 && <p className="text-gray-500">No conversations yet.</p>}
        {convs.map((c) => (
          <button
            key={c.id}
            onClick={() => navigate(`/conversations/${c.id}`)}
            className="w-full bg-white rounded-xl shadow p-4 text-left hover:shadow-lg transition-shadow flex items-center justify-between"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold">@{c.ig_username || c.ig_user_id}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  c.mode === 'ai' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {c.mode === 'ai' ? 'AI' : 'Human'}
                </span>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {triggerLabel(c)}
                </span>
              </div>
              <p className="text-sm text-gray-500 truncate">{c.last_message || 'No messages'}</p>
            </div>
            <span className="text-xs text-gray-400 ml-4 whitespace-nowrap">
              {new Date(c.updated_at).toLocaleDateString()}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
