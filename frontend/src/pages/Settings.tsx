import { useEffect, useState } from 'react';
import { getSettings, updateSettings } from '../api/client';
import type { Settings as SettingsType } from '../types';

export default function Settings() {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSettings().then(setSettings).catch(() => {});
  }, []);

  const update = async (patch: Partial<SettingsType>) => {
    const updated = await updateSettings(patch);
    setSettings(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!settings) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">System Settings</h1>
        {saved && <span className="text-green-600 text-sm">Saved!</span>}
      </div>

      <div className="max-w-2xl space-y-6">
        {/* Connection Status */}
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="font-semibold mb-3">Instagram Connection</h2>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${settings.ig_connection_status === 'connected' ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm capitalize">{settings.ig_connection_status}</span>
          </div>
        </div>

        {/* AI Model */}
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="font-semibold mb-3">AI Model</h2>
          <select
            className="w-full border rounded-lg px-3 py-2"
            value={settings.ai_model}
            onChange={(e) => update({ ai_model: e.target.value })}
          >
            <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
            <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
            <option value="claude-opus-4-6">Claude Opus 4.6</option>
          </select>
        </div>

        {/* Reply Delay */}
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="font-semibold mb-3">Reply Delay (seconds)</h2>
          <p className="text-sm text-gray-500 mb-2">Simulate human typing delay before sending AI replies</p>
          <input
            type="number"
            min="0"
            max="30"
            className="w-full border rounded-lg px-3 py-2"
            value={settings.reply_delay_seconds}
            onChange={(e) => update({ reply_delay_seconds: parseInt(e.target.value) || 0 })}
          />
        </div>

        {/* Translation Strategy */}
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="font-semibold mb-3">Translation Strategy</h2>
          <select
            className="w-full border rounded-lg px-3 py-2"
            value={settings.translation_strategy}
            onChange={(e) => update({ translation_strategy: e.target.value })}
          >
            <option value="auto">Auto-detect language</option>
            <option value="always">Always translate to English</option>
            <option value="never">No translation</option>
          </select>
        </div>

        {/* Notifications */}
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="font-semibold mb-3">Notifications</h2>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.notification_enabled}
              onChange={(e) => update({ notification_enabled: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm">Enable notifications for new messages</span>
          </label>
        </div>

        {/* API Code Snippet */}
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="font-semibold mb-3">API Integration</h2>
          <p className="text-sm text-gray-500 mb-3">Use these endpoints to integrate with external systems</p>
          <pre className="bg-gray-900 text-green-400 rounded-lg p-4 text-xs overflow-x-auto">
{`# Health check
GET /api/health

# Dashboard stats
GET /api/dashboard/stats

# Rules CRUD
GET/POST   /api/rules
GET/PATCH/DELETE /api/rules/{id}

# Knowledge CRUD
GET/POST   /api/knowledge
GET/PATCH/DELETE /api/knowledge/{id}

# Conversations
GET  /api/conversations
GET  /api/conversations/{id}
POST /api/conversations/{id}/send
POST /api/conversations/{id}/assist

# Simulate
POST /api/simulate

# Settings
GET/PATCH /api/settings`}
          </pre>
        </div>
      </div>
    </div>
  );
}
