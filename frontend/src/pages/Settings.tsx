import { useEffect, useState } from 'react';
import {
  getSettings,
  updateSettings,
  getPreferences,
  createPreference,
  updatePreference,
  deletePreference,
  getKnowledgeSection,
  updateKnowledgeSection,
} from '../api/client';
import type { Settings as SettingsType, Preference } from '../types';

const PRESET_MODELS = [
  'claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001', 'claude-opus-4-6',
  'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano',
  'gpt-4o', 'gpt-4o-mini', 'o3', 'o3-mini', 'o4-mini',
  'gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite',
];

const KB_SECTIONS = [
  { key: 'system_prompt', label: 'AI 人设与对话规则' },
  { key: 'pricing',       label: '价格信息' },
  { key: 'coverage',      label: '配送覆盖区域' },
  { key: 'sizes',         label: '包裹尺寸限制' },
  { key: 'schedule',      label: '取件时间表' },
];

export default function Settings() {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [saved, setSaved] = useState(false);
  const [customModel, setCustomModel] = useState('');
  const [customProvider, setCustomProvider] = useState('openai');
  const [welcomeText, setWelcomeText] = useState('');
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [newPref, setNewPref] = useState('');
  const [kbSection, setKbSection] = useState('system_prompt');
  const [kbContent, setKbContent] = useState('');
  const [kbLoading, setKbLoading] = useState(false);
  const [kbSaved, setKbSaved] = useState(false);

  const reloadPreferences = () => {
    getPreferences().then(setPreferences).catch(() => {});
  };

  const loadKbSection = (section: string) => {
    setKbLoading(true);
    getKnowledgeSection(section).then((r) => {
      setKbContent(r.content);
      setKbLoading(false);
    }).catch(() => setKbLoading(false));
  };

  const saveKbSection = async () => {
    await updateKnowledgeSection(kbSection, kbContent);
    setKbSaved(true);
    setTimeout(() => setKbSaved(false), 2000);
  };

  useEffect(() => {
    loadKbSection('system_prompt');
    getSettings().then((s) => {
      setSettings(s);
      setWelcomeText(s.welcome_message_text || '');
    }).catch(() => {});
    reloadPreferences();
    // Re-poll every 15s so prefs auto-learnt from generate-reply show up
    const t = setInterval(reloadPreferences, 15000);
    return () => clearInterval(t);
  }, []);

  const addPreference = async () => {
    const v = newPref.trim();
    if (!v) return;
    await createPreference(v);
    setNewPref('');
    reloadPreferences();
  };
  const togglePreference = async (p: Preference) => {
    await updatePreference(p.id, { is_active: !p.is_active });
    reloadPreferences();
  };
  const removePreference = async (id: number) => {
    await deletePreference(id);
    reloadPreferences();
  };

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
              value={PRESET_MODELS.includes(settings.ai_model) ? settings.ai_model : '__custom__'}
              onChange={(e) => {
                if (e.target.value !== '__custom__') {
                  update({ ai_model: e.target.value });
                  setCustomModel('');
                }
              }}
            >
              <optgroup label="Anthropic">
                <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
                <option value="claude-opus-4-6">Claude Opus 4.6</option>
              </optgroup>
              <optgroup label="OpenAI">
                <option value="gpt-5.4">GPT-5.4</option>
                <option value="gpt-5.4-mini">GPT-5.4 Mini</option>
                <option value="gpt-5.4-nano">GPT-5.4 Nano</option>
                <option value="gpt-4.1">GPT-4.1</option>
                <option value="gpt-4.1-mini">GPT-4.1 Mini</option>
                <option value="gpt-4.1-nano">GPT-4.1 Nano</option>
                <option value="gpt-4o">GPT-4o</option>
                <option value="gpt-4o-mini">GPT-4o Mini</option>
                <option value="o3">o3</option>
                <option value="o3-mini">o3-mini</option>
                <option value="o4-mini">o4-mini</option>
              </optgroup>
              <optgroup label="Google">
                <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro</option>
                <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
                <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</option>
              </optgroup>
              {!PRESET_MODELS.includes(settings.ai_model) && (
                <optgroup label="自定义">
                  <option value="__custom__">{settings.ai_model} ({settings.ai_model_provider})</option>
                </optgroup>
              )}
            </select>
          </div>
          {/* API Key input — shown based on current model provider */}
          {(() => {
            const provider = PRESET_MODELS.includes(settings.ai_model)
              ? (settings.ai_model.startsWith('claude') ? 'anthropic' : settings.ai_model.startsWith('gemini') ? 'google' : 'openai')
              : settings.ai_model_provider;
            const keyStyle = { flex: 1, maxWidth: 260, fontSize: 12, background: 'var(--bg-primary)', border: '0.5px solid var(--border-soft)', borderRadius: 8, padding: '4px 8px' };
            if (provider === 'anthropic') return (
              <div className="card-row">
                <span className="card-key">Anthropic API Key</span>
                <input
                  type="text"
                  autoComplete="off"
                  placeholder="sk-ant-..."
                  style={keyStyle}
                  defaultValue={settings.anthropic_api_key}
                  onBlur={(e) => { if (e.target.value !== settings.anthropic_api_key) update({ anthropic_api_key: e.target.value }); }}
                />
              </div>
            );
            if (provider === 'openai') return (
              <div className="card-row">
                <span className="card-key">OpenAI API Key</span>
                <input
                  type="text"
                  autoComplete="off"
                  placeholder="sk-..."
                  style={keyStyle}
                  defaultValue={settings.openai_api_key}
                  onBlur={(e) => { if (e.target.value !== settings.openai_api_key) update({ openai_api_key: e.target.value }); }}
                />
              </div>
            );
            if (provider === 'google') return (
              <div className="card-row">
                <span className="card-key">Google API Key</span>
                <input
                  type="text"
                  autoComplete="off"
                  placeholder="AIza..."
                  style={keyStyle}
                  defaultValue={settings.google_api_key}
                  onBlur={(e) => { if (e.target.value !== settings.google_api_key) update({ google_api_key: e.target.value }); }}
                />
              </div>
            );
            return null;
          })()}
          <div className="card-row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <span className="card-key">自定义模型</span>
            <div className="flex items-center gap-8" style={{ flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="模型 ID，如 gpt-6"
                style={{ width: 140, fontSize: 12, background: 'var(--bg-primary)', border: '0.5px solid var(--border-soft)', borderRadius: 8, padding: '4px 8px' }}
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
              />
              <select
                style={{ fontSize: 12, background: 'transparent', border: '0.5px solid var(--border-soft)', borderRadius: 8, padding: '4px 8px', cursor: 'pointer' }}
                value={customProvider}
                onChange={(e) => setCustomProvider(e.target.value)}
              >
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="google">Google</option>
                <option value="openai_compatible">OpenAI 兼容（DeepSeek、Mistral 等）</option>
              </select>
              <button
                className="btn-primary"
                style={{ fontSize: 11, padding: '4px 10px' }}
                disabled={!customModel.trim()}
                onClick={() => {
                  update({ ai_model: customModel.trim(), ai_model_provider: customProvider });
                  setCustomModel('');
                }}
              >
                使用
              </button>
            </div>
            {(customProvider === 'openai_compatible' || settings.ai_model_provider === 'openai_compatible') && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  适用于 DeepSeek、Mistral、xAI、Groq 等兼容 OpenAI API 的服务
                </div>
                <div className="flex items-center gap-8">
                  <span style={{ fontSize: 12, minWidth: 60 }}>API Key</span>
                  <input
                    type="text"
                    autoComplete="off"
                    placeholder="填入第三方平台的 API Key"
                    style={{ flex: 1, fontSize: 12, background: 'var(--bg-primary)', border: '0.5px solid var(--border-soft)', borderRadius: 8, padding: '4px 8px' }}
                    defaultValue={settings.custom_api_key}
                    onBlur={(e) => { if (e.target.value !== settings.custom_api_key) update({ custom_api_key: e.target.value }); }}
                  />
                </div>
                <div className="flex items-center gap-8">
                  <span style={{ fontSize: 12, minWidth: 60 }}>API 地址</span>
                  <input
                    type="text"
                    autoComplete="off"
                    placeholder="如 https://api.deepseek.com"
                    style={{ flex: 1, fontSize: 12, background: 'var(--bg-primary)', border: '0.5px solid var(--border-soft)', borderRadius: 8, padding: '4px 8px' }}
                    defaultValue={settings.custom_base_url}
                    onBlur={(e) => { if (e.target.value !== settings.custom_base_url) update({ custom_base_url: e.target.value }); }}
                  />
                </div>
              </div>
            )}
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

        {/* New conversation default mode */}
        <div className="uppercase-label mb-8">新对话默认模式</div>
        <div className="card-surface mb-16">
          <div className="card-row">
            <span className="card-key">新用户首次来消息时</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className={`btn${settings.default_conversation_mode === 'ai' ? '-primary' : ''}`}
                style={{ fontSize: 11, padding: '4px 10px' }}
                onClick={() => update({ default_conversation_mode: 'ai' })}
              >
                AI 自动
              </button>
              <button
                className={`btn${settings.default_conversation_mode === 'human' ? '-primary' : ''}`}
                style={{ fontSize: 11, padding: '4px 10px' }}
                onClick={() => update({ default_conversation_mode: 'human' })}
              >
                我亲自接
              </button>
            </div>
          </div>
        </div>

        <hr className="divider" />

        {/* Manager Preferences */}
        <div className="uppercase-label mb-8">管理者偏好（AI 长期遵循）</div>
        <div className="card-surface mb-16">
          <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
            生成回复时输入的提示词会被 AI 自动学习成长期偏好。这里可以查看、停用、删除或手动添加。
          </div>
          <div style={{ padding: '0 12px 8px', display: 'flex', gap: 6 }}>
            <input
              className="flex-1"
              value={newPref}
              onChange={(e) => setNewPref(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addPreference()}
              placeholder="手动添加一条偏好，如：少用感叹号"
              style={{ fontSize: 12, padding: '5px 8px' }}
            />
            <button className="btn" onClick={addPreference} disabled={!newPref.trim()} style={{ fontSize: 11, padding: '5px 10px' }}>
              添加
            </button>
          </div>
          {preferences.length === 0 ? (
            <div style={{ padding: '8px 12px 12px', fontSize: 11, color: 'var(--text-tertiary)' }}>
              暂无偏好。试着在对话页生成回复时写一句风格提示。
            </div>
          ) : (
            <div>
              {preferences.map((p) => (
                <div key={p.id} className="card-row" style={{ alignItems: 'center', gap: 8 }}>
                  <span
                    className="flex-1"
                    style={{
                      fontSize: 12,
                      color: p.is_active ? 'var(--text-primary)' : 'var(--text-tertiary)',
                      textDecoration: p.is_active ? 'none' : 'line-through',
                    }}
                  >
                    {p.content}
                  </span>
                  <button
                    className="btn"
                    onClick={() => togglePreference(p)}
                    style={{ fontSize: 11, padding: '3px 8px' }}
                    title={p.is_active ? '停用' : '启用'}
                  >
                    {p.is_active ? '停用' : '启用'}
                  </button>
                  <button
                    className="btn"
                    onClick={() => removePreference(p.id)}
                    style={{ fontSize: 11, padding: '3px 8px', color: 'var(--red-500, #d33)' }}
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <hr className="divider" />

        {/* Welcome Message */}
        <div className="uppercase-label mb-8">欢迎语</div>
        <div className="card-surface mb-16">
          <div className="card-row">
            <span className="card-key">新用户自动欢迎</span>
            <button
              className={`toggle${settings.welcome_message_enabled ? '' : ' off'}`}
              onClick={() => update({ welcome_message_enabled: !settings.welcome_message_enabled })}
            />
          </div>
          {settings.welcome_message_enabled && (
            <div className="card-row" style={{ alignItems: 'flex-start', paddingTop: 8 }}>
              <span className="card-key" style={{ paddingTop: 4 }}>欢迎语内容</span>
              <textarea
                style={{
                  flex: 1,
                  fontSize: 12,
                  background: 'var(--bg-primary)',
                  border: '0.5px solid var(--border-soft)',
                  borderRadius: 8,
                  padding: '6px 8px',
                  resize: 'vertical',
                  minHeight: 80,
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font)',
                  lineHeight: 1.5,
                  outline: 'none',
                }}
                placeholder="如：您好！感谢您联系 Fleet Now Delivery，请问有什么可以帮到您？"
                value={welcomeText}
                onChange={(e) => setWelcomeText(e.target.value)}
                onBlur={() => {
                  if (welcomeText !== settings.welcome_message_text) {
                    update({ welcome_message_text: welcomeText });
                  }
                }}
              />
            </div>
          )}
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

        <hr className="divider" />

        {/* Knowledge Base Editor */}
        <div className="uppercase-label mb-8">知识库编辑</div>
        <div className="card-surface mb-16">
          <div className="card-row" style={{ flexWrap: 'wrap', gap: 6 }}>
            <span className="card-key">章节</span>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {KB_SECTIONS.map((s) => (
                <button
                  key={s.key}
                  className={kbSection === s.key ? 'btn-primary' : 'btn'}
                  style={{ fontSize: 11, padding: '3px 10px' }}
                  onClick={() => {
                    setKbSection(s.key);
                    loadKbSection(s.key);
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ padding: '8px 12px' }}>
            {kbLoading ? (
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>加载中...</div>
            ) : (
              <textarea
                style={{
                  width: '100%',
                  minHeight: 280,
                  fontSize: 12,
                  fontFamily: 'monospace',
                  background: 'var(--bg-primary)',
                  border: '0.5px solid var(--border-soft)',
                  borderRadius: 8,
                  padding: '8px 10px',
                  resize: 'vertical',
                  color: 'var(--text-primary)',
                  lineHeight: 1.6,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                value={kbContent}
                onChange={(e) => setKbContent(e.target.value)}
              />
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8, gap: 8, alignItems: 'center' }}>
              {kbSaved && <span style={{ fontSize: 11, color: 'var(--green-600, #16a34a)' }}>已保存，立即生效</span>}
              <button
                className="btn-primary"
                style={{ fontSize: 12, padding: '5px 14px' }}
                onClick={saveKbSection}
                disabled={kbLoading}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
