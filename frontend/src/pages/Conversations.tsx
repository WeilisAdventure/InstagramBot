import { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getConversations,
  getConversation,
  getSettings,
  updateConversationMode,
  sendMessage,
  assistInput,
  translateMessage,
  generateAIReply,
} from '../api/client';
import type { Conversation, ConversationDetail, AssistResult, Settings } from '../types';

const avatarColors = ['avatar-blue', 'avatar-pink', 'avatar-green', 'avatar-amber'];

// Notification sound using Web Audio API (no file dependency)
function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch { /* ignore audio errors */ }
}

function showDesktopNotification(title: string, body: string) {
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then((p) => {
      if (p === 'granted') new Notification(title, { body, icon: '/favicon.ico' });
    });
  }
}

function getInitials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
  const now = new Date();
  const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', timeZone: 'America/Toronto' };
  const time = d.toLocaleTimeString([], opts);
  const dET = d.toLocaleDateString([], { timeZone: 'America/Toronto' });
  const nowET = now.toLocaleDateString([], { timeZone: 'America/Toronto' });
  if (dET === nowET) return time;
  const md = d.toLocaleDateString([], { month: 'numeric', day: 'numeric', timeZone: 'America/Toronto' });
  return `${md} ${time}`;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z').getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
}

// Drag-to-resize hook for textareas. Drag handle sits ABOVE the textarea;
// pull up to grow, push down to shrink. Native browser resize is disabled
// (resize: 'none') so the corner triangle never disappears under text.
/**
 * Drag-to-resize a panel. The number this returns is the panel's preferred
 * height in px (used as flex-basis); CSS flex-shrink + min-height:0 inside
 * the panel guarantees that the panel never overflows its parent and that
 * the bottom button row always stays inside the viewport.
 */
function useResizable(
  initial: number,
  storageKey?: string,
  minPx: number = 30,
  maxPx: number = 800,
) {
  const targetRef = useRef<HTMLElement | null>(null);

  const [height, setHeight] = useState<number>(() => {
    if (storageKey && typeof window !== 'undefined') {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const n = parseInt(raw, 10);
        // Reject saved values that are out of reasonable bounds — these
        // tend to leak through from earlier broken-resize sessions and
        // make every subsequent drag look frozen because the rendered
        // height is already clamped by the container.
        if (!isNaN(n) && n >= minPx && n <= maxPx) return n;
      }
    }
    return initial;
  });

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    // Use the ACTUAL rendered height as the drag origin, not the
    // possibly-stale state value. Without this, if state says 400 but
    // flex shrunk the element to 250, the first 150px of upward drag
    // visibly does nothing — which is exactly the "can't drag" symptom.
    const measured = targetRef.current?.getBoundingClientRect().height;
    const startH = typeof measured === 'number' && measured > 0 ? measured : height;

    const onMove = (m: MouseEvent) => {
      const delta = startY - m.clientY;
      const next = Math.max(minPx, Math.min(maxPx, startH + delta));
      setHeight(next);
      if (storageKey) {
        try {
          window.localStorage.setItem(storageKey, String(next));
        } catch {
          /* non-fatal */
        }
      }
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
    };
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return { height, startDrag, targetRef };
}

const dragHandleStyle: React.CSSProperties = {
  height: 14,
  cursor: 'ns-resize',
  background: 'var(--border-soft)',
  margin: '4px 0',
  borderRadius: 3,
  flexShrink: 0,
  position: 'relative',
};

// Inner splitter — more prominent so it's obviously different from the
// outer panel-resize handle and easy to grab.
const innerSplitterStyle: React.CSSProperties = {
  height: 16,
  cursor: 'ns-resize',
  background: 'var(--accent, #185FA5)',
  opacity: 0.18,
  margin: '6px 0',
  borderRadius: 4,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 10,
  color: 'var(--accent, #185FA5)',
  fontWeight: 600,
  userSelect: 'none',
};

export default function Conversations() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);

  // Per-textarea resize state, persisted to localStorage so size sticks
  // across page loads.
  // Outer panel heights (drag handle at very top of input panel).
  const aiPanelSize = useResizable(360, 'instabot.height.aiPanel');
  const humanPanelSize = useResizable(220, 'instabot.height.humanPanel');
  // Inner splitter inside the AI panel: how tall the prompt section
  // (prompt textarea + Generate button row) is. Whatever's left goes to
  // the AI reply preview.
  const aiPromptSize = useResizable(80, 'instabot.height.aiPrompt');

  // True while POST /assist is in-flight; lock the assist button to
  // prevent duplicate calls.
  const [assisting, setAssisting] = useState(false);

  // Pick up ?conv=ID (e.g. when navigated from the comments inbox)
  useEffect(() => {
    const convParam = searchParams.get('conv');
    if (convParam) {
      const id = parseInt(convParam, 10);
      if (!isNaN(id)) {
        setSelectedId(id);
        // Strip the param so reload/back doesn't keep re-selecting
        searchParams.delete('conv');
        setSearchParams(searchParams, { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Chat state
  const [input, setInput] = useState('');
  const [assist, setAssist] = useState<AssistResult | null>(null);
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<'ai' | 'human'>('ai');
  const [translations, setTranslations] = useState<Map<number, string>>(new Map());
  const [aiReply, setAiReply] = useState('');
  const [aiReplyLoading, setAiReplyLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [toast, setToast] = useState<{ text: string; type: 'info' | 'warn' | 'error' } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const [notifSettings, setNotifSettings] = useState<Settings | null>(null);
  const prevConvsRef = useRef<Conversation[]>([]);
  const titleFlashRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const originalTitle = useRef(document.title);
  const [unreadCount, setUnreadCount] = useState(0);
  const [brokenImgs, setBrokenImgs] = useState<Set<number>>(new Set());


  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Load settings (frequent poll so global toggle changes reflect quickly)
  useEffect(() => {
    getSettings().then(setNotifSettings).catch(() => {});
    const timer = setInterval(() => {
      getSettings().then(setNotifSettings).catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  // Title flash effect
  useEffect(() => {
    if (unreadCount > 0 && notifSettings?.notification_enabled && notifSettings?.notification_title_flash) {
      let show = true;
      titleFlashRef.current = setInterval(() => {
        document.title = show ? `(${unreadCount}条新消息) InstaBot` : originalTitle.current;
        show = !show;
      }, 1000);
    } else {
      if (titleFlashRef.current) clearInterval(titleFlashRef.current);
      document.title = originalTitle.current;
    }
    return () => {
      if (titleFlashRef.current) clearInterval(titleFlashRef.current);
      document.title = originalTitle.current;
    };
  }, [unreadCount, notifSettings?.notification_enabled, notifSettings?.notification_title_flash]);

  // Clear unread on window focus
  useEffect(() => {
    const onFocus = () => setUnreadCount(0);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // Load conversation list + detect new messages
  useEffect(() => {
    getConversations().then((data) => {
      prevConvsRef.current = data;
      setConvs(data);
    }).catch(() => {});
    const timer = setInterval(() => {
      getConversations().then((data) => {
        if (notifSettings?.notification_enabled && prevConvsRef.current.length > 0) {
          const prevMap = new Map(prevConvsRef.current.map(c => [c.id, c.updated_at]));
          for (const c of data) {
            // Only notify when last message is from the user (not our own replies)
            if (c.last_message_role !== 'user') continue;
            const prevTime = prevMap.get(c.id);
            const isNew = !prevTime && c.last_message;
            const isUpdated = prevTime && c.updated_at !== prevTime && c.last_message;
            if (isNew || isUpdated) {
              if (notifSettings.notification_sound) playNotificationSound();
              if (notifSettings.notification_desktop) {
                showDesktopNotification(
                  `${isNew ? '新对话' : '新消息'} - ${c.ig_username || c.ig_user_id}`,
                  c.last_message || ''
                );
              }
              if (notifSettings.notification_title_flash) {
                setUnreadCount(prev => prev + 1);
              }
              break;
            }
          }
        }
        prevConvsRef.current = data;
        setConvs(data);
      }).catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
  }, [notifSettings]);

  // Load conversation detail
  const loadDetail = useCallback(() => {
    if (!selectedId) return;
    getConversation(selectedId).then((data) => {
      setDetail(data);
      setMode(data.mode as 'ai' | 'human');
    }).catch(() => {
      setSelectedId(null);
      setDetail(null);
    });
  }, [selectedId]);

  useEffect(() => {
    loadDetail();
    const interval = mode === 'ai' ? 1500 : 4000;
    const timer = setInterval(loadDetail, interval);
    return () => clearInterval(timer);
  }, [loadDetail, mode]);

  useEffect(() => {
    setTimeout(() => {
      const el = messagesRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }, [detail?.messages?.length, selectedId]);


  const handleTranslateMsg = (msgId: number, content: string) => {
    if (translations.has(msgId)) {
      // Toggle off
      setTranslations((prev) => { const next = new Map(prev); next.delete(msgId); return next; });
      return;
    }
    if (!detail) return;
    setTranslations((prev) => new Map(prev).set(msgId, '__loading__'));
    translateMessage(detail.id, content)
      .then((res) => {
        setTranslations((prev) => new Map(prev).set(msgId, res.translated));
      })
      .catch(() => {
        setTranslations((prev) => { const next = new Map(prev); next.delete(msgId); return next; });
      });
  };

  const selectConversation = (id: number) => {
    setSelectedId(id);
    setDetail(null);
    setInput('');
    setAssist(null);
    setTranslations(new Map());
    setAiReply('');
    setAiPrompt('');
    setToast(null);
  };

  const loadAiReply = async () => {
    if (!detail) return;
    setAiReplyLoading(true);
    try {
      const res = await generateAIReply(detail.id, aiPrompt || undefined);
      setAiReply(res.reply);
    } catch {
      setAiReply('');
    }
    setAiReplyLoading(false);
  };

  const handleModeSwitch = async (next: 'ai' | 'human') => {
    if (!detail || next === mode) return;
    await updateConversationMode(detail.id, next);
    setDetail({ ...detail, mode: next });
    setMode(next);
    setAssist(null);
  };

  const showToast = (text: string, type: 'info' | 'warn' | 'error' = 'info') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSend = async () => {
    if (!detail || !input.trim()) return;
    setSending(true);
    try {
      const res = await sendMessage(detail.id, input);
      setInput('');
      setAssist(null);
      if (!res.ig_sent) {
        showToast('消息已保存，但未能发送到 Instagram（可能是测试用户）', 'warn');
      }
      loadDetail();
    } catch {
      showToast('发送失败，请重试', 'error');
    }
    setSending(false);
  };

  const handleSendAiReply = async () => {
    if (!detail || !aiReply.trim()) return;
    setSending(true);
    try {
      const res = await sendMessage(detail.id, aiReply, true);
      setAiReply('');
      if (!res.ig_sent) {
        showToast('AI 回复已保存，但未能发送到 Instagram', 'warn');
      }
      loadDetail();
    } catch {
      showToast('发送失败，请重试', 'error');
    }
    setSending(false);
  };

  const handleAssist = async () => {
    if (!detail || !input.trim() || assisting) return;
    setAssisting(true);
    try {
      const result = await assistInput(detail.id, input);
      setAssist(result);
    } catch { /* ignore */ }
    setAssisting(false);
  };

  const hasChinese = (text: string) => /[\u4e00-\u9fff]/.test(text);

  const username = detail ? (detail.ig_username || detail.ig_user_id) : '';
  const initials = username.slice(0, 2).toUpperCase();

  return (
    <div className="flex" style={{ height: '100%', overflow: 'hidden' }}>
      {/* === Left: Conversation List === */}
      <div className="flex-col" style={{ width: 300, minWidth: 300, borderRight: '0.5px solid var(--border-soft)', height: '100%' }}>
        <div className="panel-header">
          <div>
            <div className="panel-title">私信对话</div>
            <div className="panel-sub">来自评论触发与直接私信</div>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {convs.length === 0 && (
            <div className="text-muted" style={{ textAlign: 'center', padding: '48px 0', fontSize: 12 }}>
              暂无对话
            </div>
          )}
          {convs.map((c, i) => (
            <div
              key={c.id}
              className="list-item"
              onClick={() => selectConversation(c.id)}
              style={{
                padding: '10px 16px',
                background: c.id === selectedId ? 'var(--bg-secondary)' : undefined,
              }}
            >
              {c.ig_profile_pic && !brokenImgs.has(c.id) ? (
                <img
                  src={c.ig_profile_pic}
                  className="avatar avatar-md"
                  style={{ objectFit: 'cover' }}
                  onError={() => setBrokenImgs(prev => new Set(prev).add(c.id))}
                />
              ) : (
                <div className={`avatar avatar-md ${avatarColors[i % avatarColors.length]}`}>
                  {getInitials(c.ig_username || c.ig_user_id)}
                </div>
              )}
              <div className="list-item-info">
                <div
                  className="list-item-name"
                  style={c.trigger_source === 'comment_rule' ? { color: '#9333ea' } : undefined}
                  title={c.trigger_source === 'comment_rule' ? '由评论触发的客户' : undefined}
                >
                  {c.trigger_source === 'comment_rule' && (
                    <span style={{ marginRight: 4 }} aria-hidden>💬</span>
                  )}
                  {c.ig_username || c.ig_user_id}
                </div>
                <div className="list-item-last">{c.last_message || '暂无消息'}</div>
              </div>
              <div className="list-item-meta">
                <span className="text-xs">{timeAgo(c.updated_at)}</span>
                <div className="flex items-center gap-6">
                  {!c.is_resolved && <span className="unread-dot" />}
                  {c.last_message_role === 'assistant' && (
                    c.last_message_is_ai ? (
                      <span className="tag-pill tag-ai">AI</span>
                    ) : (
                      <span className="tag-pill tag-human">人工</span>
                    )
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* === Right: Chat Detail === */}
      <div className="flex-col" style={{ flex: 1, height: '100%', background: 'var(--bg-secondary)' }}>
        {!selectedId ? (
          <div className="flex-1 flex items-center justify-center text-muted" style={{ fontSize: 12 }}>
            选择一个对话开始聊天
          </div>
        ) : !detail ? (
          <div className="flex-1 flex items-center justify-center text-muted" style={{ fontSize: 12 }}>
            加载中...
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="panel-header" style={{ background: 'var(--bg-primary)', gap: 10 }}>
              {detail.ig_profile_pic && !brokenImgs.has(detail.id) ? (
                <img
                  src={detail.ig_profile_pic}
                  className="avatar avatar-sm"
                  style={{ objectFit: 'cover' }}
                  onError={() => setBrokenImgs(prev => new Set(prev).add(detail.id))}
                />
              ) : (
                <div className={`avatar avatar-sm ${avatarColors[detail.id % avatarColors.length]}`}>
                  {initials}
                </div>
              )}
              <div className="flex-1">
                <div className="panel-title">{username}</div>
              </div>
              {detail.trigger_source === 'comment_rule' && (
                <span className="tag-pill tag-ai" style={{ fontSize: 10 }}>由评论触发</span>
              )}
            </div>

            {/* Toast */}
            {toast && (
              <div style={{
                padding: '8px 16px',
                fontSize: 12,
                background: toast.type === 'error' ? '#fef2f2' : toast.type === 'warn' ? '#fffbeb' : '#f0f9ff',
                color: toast.type === 'error' ? '#dc2626' : toast.type === 'warn' ? '#d97706' : '#2563eb',
                borderBottom: '0.5px solid var(--border-soft)',
                flexShrink: 0,
              }}>
                {toast.text}
              </div>
            )}

            {/* Messages */}
            <div ref={messagesRef} className="scroll-y" style={{ gap: 10, display: 'flex', flexDirection: 'column' }}>
              {detail.messages.map((m) => {
                if (m.role === 'system') {
                  const isError = m.content.startsWith('[AI_ERROR]');
                  const isCannotAnswer = m.content.startsWith('[CANNOT_ANSWER]');
                  const displayText = isError
                    ? `AI 回复失败：${m.content.replace('[AI_ERROR] ', '')}`
                    : isCannotAnswer
                    ? `AI 无法回答：${m.content.replace('[CANNOT_ANSWER] ', '')}`
                    : m.content;
                  const bgColor = isError ? '#fef2f2' : isCannotAnswer ? '#fffbeb' : undefined;
                  const textColor = isError ? '#dc2626' : isCannotAnswer ? '#d97706' : undefined;
                  return (
                    <div key={m.id} style={{ textAlign: 'center' }}>
                      <span className="badge badge-off" style={bgColor ? { background: bgColor, color: textColor, border: 'none' } : undefined}>{displayText}</span>
                    </div>
                  );
                }
                const isUser = m.role === 'user';
                return (
                  <div key={m.id} className={`msg-row ${isUser ? 'from-user' : 'from-me'}`}>
                    <div className={`bubble ${isUser ? 'bubble-in' : 'bubble-out'}`}>
                      {m.content}
                    </div>
                    <div className={`msg-label${isUser ? '' : ' right'}`}>
                      {isUser
                        ? username
                        : (
                          <>
                            已发送
                            {m.is_ai_generated && (
                              <span className="tag-pill tag-ai" style={{ marginLeft: 4 }}>AI</span>
                            )}
                          </>
                        )
                      }
                      <span style={{ marginLeft: 6 }}>{formatTime(m.created_at)}</span>
                    </div>
                    {isUser && (
                      <>
                        <button
                          onClick={() => handleTranslateMsg(m.id, m.content)}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            fontSize: 11, color: translations.has(m.id) ? 'var(--blue)' : 'var(--text-tertiary)',
                            padding: '2px 0', marginTop: 2,
                          }}
                        >
                          {translations.get(m.id) === '__loading__' ? '翻译中...' : translations.has(m.id) ? '隐藏翻译' : '翻译'}
                        </button>
                        {translations.has(m.id) && translations.get(m.id) !== '__loading__' && (
                          <div className="translate-hint">
                            译文：<em>{translations.get(m.id)}</em>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Mode Switch — always available; per-conv mode overrides global */}
            <div style={{ padding: '8px 16px', borderTop: '0.5px solid var(--border-soft)', background: 'var(--bg-primary)', flexShrink: 0 }}>
              <div className="flex items-center gap-8">
                <div className="radio-group" style={{ margin: 0 }}>
                  <span
                    className={`radio-opt${mode === 'ai' ? ' active' : ''}`}
                    onClick={() => handleModeSwitch('ai')}
                  >
                    AI 回复
                  </span>
                  <span
                    className={`radio-opt${mode === 'human' ? ' active' : ''}`}
                    onClick={() => handleModeSwitch('human')}
                  >
                    人工回复
                  </span>
                </div>
                <span className="text-xs flex-1" style={{ color: 'var(--text-tertiary)' }}>
                  {mode === 'ai'
                    ? (notifSettings?.auto_reply_enabled
                        ? 'AI 自动回复（全局已开启）'
                        : '点"生成回复"手动触发 AI')
                    : '此对话由你亲自接管，bot 不会自动回'}
                </span>
              </div>
            </div>

            {/* AI Mode Input.
                Layout:
                  outer-drag                       (flex-shrink: 0)
                  ┌─ flex middle area ──────────┐  (flex: 1, min-height: 0)
                  │   prompt section            │   ← flex-basis aiPromptSize
                  │   inner drag                │
                  │   preview label             │
                  │   preview textarea (grows)  │
                  └─────────────────────────────┘
                  send button row                  (flex-shrink: 0, ANCHORED)

                The send button row is OUTSIDE the resizable middle area,
                so no amount of inner dragging can ever push it out of
                view. The middle area absorbs all variation. */}
            {mode === 'ai' && (
              <div
                ref={aiPanelSize.targetRef as React.RefObject<HTMLDivElement>}
                style={{
                  padding: '0 16px 12px',
                  background: 'var(--bg-primary)',
                  flexBasis: aiPanelSize.height,
                  flexShrink: 1,
                  flexGrow: 0,
                  minHeight: 200,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                {/* Outer drag — adjust whole panel size */}
                <div
                  style={{ ...dragHandleStyle, flexShrink: 0 }}
                  onMouseDown={aiPanelSize.startDrag}
                  title="拖动调整整个面板高度"
                />

                {/* Middle flex area — contains prompt + preview, takes
                    whatever space is left after the bottom button row. */}
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>

                  {/* Prompt section */}
                  <div
                    ref={aiPromptSize.targetRef as React.RefObject<HTMLDivElement>}
                    style={{
                      flexBasis: aiPromptSize.height,
                      flexShrink: 1,
                      flexGrow: 0,
                      minHeight: 40,
                      display: 'flex',
                      gap: 8,
                      alignItems: 'stretch',
                    }}
                  >
                    <textarea
                      className="flex-1"
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder='提示词（可选）：如「用中文回复」、「语气友善一些」...'
                      style={{
                        fontSize: 12,
                        padding: '5px 8px',
                        resize: 'none',
                        fontFamily: 'var(--font)',
                        lineHeight: 1.5,
                        minHeight: 0,
                      }}
                    />
                    <button
                      className="btn"
                      onClick={loadAiReply}
                      disabled={aiReplyLoading}
                      style={{
                        fontSize: 11,
                        padding: '5px 10px',
                        whiteSpace: 'nowrap',
                        cursor: aiReplyLoading ? 'wait' : 'pointer',
                        opacity: aiReplyLoading ? 0.5 : 1,
                        alignSelf: 'flex-start',
                      }}
                    >
                      {aiReplyLoading ? '生成中...' : aiReply ? '重新生成' : '生成回复'}
                    </button>
                  </div>

                  {/* Inner drag — redistribute between prompt and preview */}
                  <div
                    style={innerSplitterStyle}
                    onMouseDown={aiPromptSize.startDrag}
                    title="上下拖动：调整提示词区与预览区的比例"
                  >
                    ⇅ 拖动调整两窗口比例
                  </div>

                  {/* Preview section — label + scroll/edit area */}
                  <div
                    className="ai-preview"
                    style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
                  >
                    <div className="ai-preview-label" style={{ flexShrink: 0 }}>AI 生成内容（发送前可编辑）</div>
                    {aiReplyLoading ? (
                      <div className="text-xs" style={{ padding: '4px 0' }}>正在生成...</div>
                    ) : (
                      <textarea
                        value={aiReply}
                        onChange={(e) => setAiReply(e.target.value)}
                        style={{
                          width: '100%',
                          flex: 1,
                          minHeight: 0,
                          border: 'none',
                          background: 'transparent',
                          color: 'var(--blue-800)',
                          fontSize: 12,
                          resize: 'none',
                          outline: 'none',
                          fontFamily: 'var(--font)',
                          lineHeight: 1.5,
                        }}
                      />
                    )}
                  </div>
                </div>

                {/* Send button — anchored at bottom of panel, never resizable */}
                <div className="flex gap-8 mt-8" style={{ flexShrink: 0 }}>
                  <button
                    className="btn-primary"
                    onClick={handleSendAiReply}
                    disabled={sending || !aiReply.trim()}
                    style={{ opacity: sending || !aiReply.trim() ? 0.4 : 1 }}
                  >
                    发送 AI 回复
                  </button>
                </div>
              </div>
            )}

            {/* Human Mode Input.
                Layout (mirrors AI mode):
                  outer-drag
                  ┌─ flex middle area ──┐
                  │   (assist preview if any) + input textarea
                  └─────────────────────┘
                  bottom button row (anchored, never resizable)              */}
            {mode === 'human' && (
              <div
                ref={humanPanelSize.targetRef as React.RefObject<HTMLDivElement>}
                style={{
                  padding: '0 16px 12px',
                  background: 'var(--bg-primary)',
                  flexBasis: humanPanelSize.height,
                  flexShrink: 1,
                  flexGrow: 0,
                  minHeight: 160,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{ ...dragHandleStyle, flexShrink: 0 }}
                  onMouseDown={humanPanelSize.startDrag}
                  title="拖动调整面板高度"
                />

                {/* Middle flex area — assist preview + input textarea */}
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  {assist && (
                    <div
                      className="ai-preview"
                      style={{
                        marginBottom: 8,
                        display: 'flex',
                        flexDirection: 'column',
                        flex: 1,
                        minHeight: 0,
                      }}
                    >
                      <div className="ai-preview-label" style={{ flexShrink: 0 }}>AI 生成内容</div>
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--text-primary)',
                          lineHeight: 1.5,
                          whiteSpace: 'pre-wrap',
                          flex: 1,
                          minHeight: 0,
                          overflowY: 'auto',
                          padding: '4px 0',
                        }}
                      >
                        {assist.improved}
                      </div>
                      <div className="flex gap-8 mt-8" style={{ flexShrink: 0 }}>
                        <button className="btn-primary" onClick={() => { setInput(assist.improved); setAssist(null); }} style={{ fontSize: 11, padding: '4px 10px' }}>
                          使用优化版本
                        </button>
                        <button className="btn" onClick={() => setAssist(null)} style={{ fontSize: 11, padding: '4px 10px' }}>
                          取消
                        </button>
                      </div>
                    </div>
                  )}
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="输入消息... — 回车换行，按右侧按钮发送"
                    style={{
                      width: '100%',
                      flex: assist ? 'none' : 1,
                      minHeight: assist ? 60 : 0,
                      flexShrink: assist ? 0 : 1,
                      resize: 'none',
                      fontFamily: 'var(--font)',
                      fontSize: 13,
                      lineHeight: 1.5,
                    }}
                  />
                </div>

                {/* Bottom button row — anchored, never resizable */}
                <div className="flex gap-8 mt-8" style={{ alignItems: 'center', flexShrink: 0 }}>
                  {input.trim() && (
                    <button
                      className="tag-pill tag-ai"
                      onClick={handleAssist}
                      disabled={assisting}
                      style={{
                        cursor: assisting ? 'wait' : 'pointer',
                        padding: '4px 10px',
                        fontSize: 11,
                        opacity: assisting ? 0.5 : 1,
                      }}
                    >
                      {assisting
                        ? '处理中...'
                        : hasChinese(input)
                        ? 'AI 翻译成英文并优化'
                        : 'AI 优化英文表达'}
                    </button>
                  )}
                  <span className="flex-1" />
                  <button
                    className="btn-primary"
                    onClick={handleSend}
                    disabled={sending || !input.trim()}
                    style={{ opacity: sending || !input.trim() ? 0.4 : 1 }}
                  >
                    发送
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
