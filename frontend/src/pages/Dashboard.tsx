import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboardStats } from '../api/client';
import type { DashboardStats } from '../types';

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    getDashboardStats().then(setStats).catch(() => {});
  }, []);

  const cards = [
    { label: 'Weekly Conversations', value: stats?.weekly_conversations ?? '-', link: '/conversations', color: 'bg-blue-500' },
    { label: 'AI Resolution Rate', value: stats ? `${stats.ai_resolution_rate}%` : '-', link: '/conversations', color: 'bg-green-500' },
    { label: 'Comment Triggers', value: stats?.comment_triggers ?? '-', link: '/rules', color: 'bg-purple-500' },
    { label: 'Avg Response Time', value: stats ? `${stats.avg_response_time_seconds.toFixed(1)}s` : '-', link: '/settings', color: 'bg-orange-500' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <button
            key={card.label}
            onClick={() => navigate(card.link)}
            className="bg-white rounded-xl shadow p-6 text-left hover:shadow-lg transition-shadow"
          >
            <div className={`w-10 h-10 ${card.color} rounded-lg mb-3`} />
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className="text-3xl font-bold mt-1">{card.value}</p>
          </button>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Manage Rules', desc: 'Create and edit comment trigger rules', link: '/rules' },
          { label: 'Test Rules', desc: 'Simulate comments to test triggers', link: '/simulate' },
          { label: 'Knowledge Base', desc: 'Manage Q&A for AI replies', link: '/knowledge' },
        ].map((item) => (
          <button
            key={item.label}
            onClick={() => navigate(item.link)}
            className="bg-white rounded-xl shadow p-5 text-left hover:shadow-lg transition-shadow"
          >
            <h3 className="font-semibold">{item.label}</h3>
            <p className="text-sm text-gray-500 mt-1">{item.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
