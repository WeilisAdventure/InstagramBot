import { useEffect, useState } from 'react';
import { getSettings, updateSettings } from '../api/client';
import type { Settings as SettingsType } from '../types';

export default function Settings() {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { getSettings().then(setSettings).catch(() => {}); }, []);

  const update = async (patch: Partial<SettingsType>) => {
    const updated = await updateSettings(patch);
    setSettings(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!settings) return (
    <div className="flex-1 flex items-center justify-center text-muted" style={{ background: 'var(--bg-secondary)', fontSize: 12 }}>
      加载中...
    </div>
  );

  return (
    <div className="flex-col" style={{ height: '100%' }}>
      {/* Page Header */}
      <div className="panel-header">
        <div>
          <div className="panel-title">系统设置</div>
          <div className="panel-sub">配置账号与 AI 参数</div>
        </div>
        {saved && <span className="badge badge-on">已保存</span>}
      </div>

      {/* Scrollable Content */}
      <div className="scroll-y">
        {/* Connection */}
        <div className="uppercase-label mb-8">账号连接</div>
        <div className="card-surface mb-16">
          <div className="card-row">
            <span className="card-key">Instagram 账号</span>
            <span className="card-value">{settings.ig_username ? `@${settings.ig_username}` : '未连接'}</span>
          </div>
          <div className="card-row">
            <span className="card-key">连接状态</span>
            <span className={`card-value ${settings.ig_connection_status === 'connected' ? 'success' : ''}`} style={settings.ig_connection_status !== 'connected' ? { color: '#dc2626' } : undefined}>
              {settings.ig_connection_status === 'connected' ? '已连接' : '未连接'}
            </span>
          </div>
          <div className="card-row">
            <span className="card-key">API 模式</span>
            <span className="card-value">{settings.ig_api_version ? `Graph API ${settings.ig_api_version}` : '-'}</span>
          </div>
        </div>

        <hr className="divider" />

        {/* AI Settings */}
        <div className="uppercase-label mb-8">AI 回复设置</div>
        <div className="card-surface mb-16">
          <div className="card-row">
            <span className="card-key">AI 模型</span>
            <select
              className="card-value"
              style={{ background: 'transparent', border: '0.5px solid var(--border-soft)', borderRadius: 8, padding: '4px 8px', textAlign: 'right', cursor: 'pointer', width: 'auto' }}
              value={settings.ai_model}
              onChange={(e) => update({ ai_model: e.target.value })}
            >
              <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
              <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
              <option value="claude-opus-4-6">Claude Opus 4.6</option>
            </select>
          </div>
          <div className="card-row">
            <span className="card-key">回复语言</span>
            <select
              className="card-value"
              style={{ background: 'transparent', border: '0.5px solid var(--border-soft)', borderRadius: 8, padding: '4px 8px', textAlign: 'right', cursor: 'pointer', width: 'auto' }}
              value={settings.translation_strategy}
              onChange={(e) => update({ translation_strategy: e.target.value })}
            >
              <option value="auto">自动检测</option>
              <option value="always">始终翻译为英文</option>
              <option value="never">不翻译</option>
            </select>
          </div>
          <div className="card-row">
            <span className="card-key">无法解答时</span>
            <span className="card-value">转接人工客服</span>
          </div>
          <div className="card-row">
            <span className="card-key">回复延迟</span>
            <div className="flex items-center gap-8">
              <input
                type="number" min="0" max="30"
                style={{ width: 48, fontSize: 13, textAlign: 'right', background: 'var(--bg-primary)', border: '0.5px solid var(--border-soft)', borderRadius: 8, padding: '4px 6px' }}
                value={settings.reply_delay_seconds}
                onChange={(e) => update({ reply_delay_seconds: parseInt(e.target.value) || 0 })}
              />
              <span className="card-value">秒（拟人化）</span>
            </div>
          </div>
        </div>

        <hr className="divider" />

        {/* Notifications */}
        <div className="uppercase-label mb-8">通知</div>
        <div className="card-surface mb-16">
          <div className="card-row">
            <span className="card-key">新消息通知</span>
            <button
              className={`toggle${settings.notification_enabled ? '' : ' off'}`}
              onClick={() => update({ notification_enabled: !settings.notification_enabled })}
            />
          </div>
          {settings.notification_enabled && (
            <>
              <div className="card-row" style={{ paddingLeft: 28 }}>
                <span className="card-key">🔔 桌面通知</span>
                <button
                  className={`toggle${settings.notification_desktop ? '' : ' off'}`}
                  onClick={() => {
                    if (!settings.notification_desktop && Notification.permission === 'default') {
                      Notification.requestPermission().then((p) => {
                        if (p === 'granted') update({ notification_desktop: true });
                      });
                    } else {
                      update({ notification_desktop: !settings.notification_desktop });
                    }
                  }}
                />
              </div>
              <div className="card-row" style={{ paddingLeft: 28 }}>
                <span className="card-key">🔊 提示音</span>
                <button
                  className={`toggle${settings.notification_sound ? '' : ' off'}`}
                  onClick={() => update({ notification_sound: !settings.notification_sound })}
                />
              </div>
              <div className="card-row" style={{ paddingLeft: 28 }}>
                <span className="card-key">💬 标签页标题闪烁</span>
                <button
                  className={`toggle${settings.notification_title_flash ? '' : ' off'}`}
                  onClick={() => update({ notification_title_flash: !settings.notification_title_flash })}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
