import { NavLink } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getSettings, updateSettings } from '../api/client';

const navItems = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/rules', label: 'Comment Rules', icon: '⚡' },
  { path: '/simulate', label: 'Simulate', icon: '🧪' },
  { path: '/conversations', label: 'Conversations', icon: '💬' },
  { path: '/knowledge', label: 'Knowledge', icon: '📚' },
  { path: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function Sidebar() {
  const [autoReply, setAutoReply] = useState(true);
  const [commentTrigger, setCommentTrigger] = useState(true);

  useEffect(() => {
    getSettings().then((s) => {
      setAutoReply(s.auto_reply_enabled);
      setCommentTrigger(s.comment_trigger_enabled);
    }).catch(() => {});
  }, []);

  const toggleAutoReply = async () => {
    const next = !autoReply;
    setAutoReply(next);
    await updateSettings({ auto_reply_enabled: next });
  };

  const toggleCommentTrigger = async () => {
    const next = !commentTrigger;
    setCommentTrigger(next);
    await updateSettings({ comment_trigger_enabled: next });
  };

  return (
    <aside className="w-64 bg-gray-900 text-white flex flex-col h-screen sticky top-0">
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-lg font-bold">IG Bot</h1>
        <p className="text-xs text-gray-400">Auto-Reply Manager</p>
      </div>
      <nav className="flex-1 p-2">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg mb-1 text-sm ${
                isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'
              }`
            }
          >
            <span>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-gray-700 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">AI Auto-Reply</span>
          <button
            onClick={toggleAutoReply}
            className={`w-10 h-5 rounded-full transition-colors ${autoReply ? 'bg-green-500' : 'bg-gray-600'}`}
          >
            <div className={`w-4 h-4 bg-white rounded-full transition-transform mx-0.5 ${autoReply ? 'translate-x-5' : ''}`} />
          </button>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">Comment Trigger</span>
          <button
            onClick={toggleCommentTrigger}
            className={`w-10 h-5 rounded-full transition-colors ${commentTrigger ? 'bg-green-500' : 'bg-gray-600'}`}
          >
            <div className={`w-4 h-4 bg-white rounded-full transition-transform mx-0.5 ${commentTrigger ? 'translate-x-5' : ''}`} />
          </button>
        </div>
      </div>
    </aside>
  );
}
