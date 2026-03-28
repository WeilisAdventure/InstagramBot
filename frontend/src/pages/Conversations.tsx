import { useEffect, useState, useRef, useCallback } from 'react';
import {
  getConversations,
  getConversation,
  updateConversationMode,
  sendMessage,
  assistInput,
  translateMessage,
  generateAIReply,
} from '../api/client';
import type { Conversation, ConversationDetail, AssistResult } from '../types';

const avatarColors = ['avatar-blue', 'avatar-pink', 'avatar-green', 'avatar-amber'];

function getInitials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
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
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
}

export default function Conversations() {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);

  // Chat state
  const [input, setInput] = useState('');
  const [assist, setAssist] = useState<AssistResult | null>(null);
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<'ai' | 'human'>('ai');
  const [translateOn, setTranslateOn] = useState(false);
  const [translations, setTranslations] = useState<Map<number, string>>(new Map());
  const [aiReply, setAiReply] = useState('');
  const [aiReplyLoading, setAiReplyLoading] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: 'info' | 'warn' | 'error' } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  // Load conversation list
  useEffect(() => {
    getConversations().then(setConvs).catch(() => {});
    const timer = setInterval(() => {
      getConversations().then(setConvs).catch(() => {});
    }, 4000);
    return () => clearInterval(timer);
  }, []);

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
    const timer = setInterval(loadDetail, 4000);
    return () => clearInterval(timer);
  }, [loadDetail]);

  useEffect(() => {
    setTimeout(() => {
      const el = messagesRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }, [detail?.messages?.length, selectedId]);


  // Fetch translations
  useEffect(() => {
    if (!translateOn || !detail) return;
    const userMessages = detail.messages.filter((m) => m.role === 'user');
    userMessages.forEach((m) => {
      if (!translations.has(m.id)) {
        translateMessage(detail.id, m.content)
          .then((res) => {
            setTranslations((prev) => {
              const next = new Map(prev);
              next.set(m.id, res.translated);
              return next;
            });
          })
          .catch(() => {});
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translateOn, detail?.messages]);

  const selectConversation = (id: number) => {
    setSelectedId(id);
    setDetail(null);
    setInput('');
    setAssist(null);
    setTranslateOn(false);
    setTranslations(new Map());
    setAiReply('');
    setToast(null);
  };

  const loadAiReply = async () => {
    if (!detail) return;
    setAiReplyLoading(true);
    try {
      const res = await generateAIReply(detail.id);
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
    if (!detail || !input.trim()) return;
    try {
      const result = await assistInput(detail.id, input);
      setAssist(result);
    } catch { /* ignore */ }
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
              <div className={`avatar avatar-md ${avatarColors[i % avatarColors.length]}`}>
                {getInitials(c.ig_username || c.ig_user_id)}
              </div>
              <div className="list-item-info">
                <div className="list-item-name">{c.ig_username || c.ig_user_id}</div>
                <div className="list-item-last">{c.last_message || '暂无消息'}</div>
              </div>
              <div className="list-item-meta">
                <span className="text-xs">{timeAgo(c.updated_at)}</span>
                <div className="flex items-center gap-6">
                  {!c.is_resolved && <span className="unread-dot" />}
                  {c.mode === 'ai' ? (
                    <span className="tag-pill tag-ai">AI</span>
                  ) : (
                    <span className="tag-pill tag-human">人工</span>
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
              <div className={`avatar avatar-sm ${avatarColors[detail.id % avatarColors.length]}`}>
                {initials}
              </div>
              <div className="flex-1">
                <div className="panel-title">{username}</div>
                <div className="panel-sub">Instagram DM</div>
              </div>
              {detail.trigger_source === 'comment_rule' && (
                <span className="tag-pill tag-ai" style={{ fontSize: 10 }}>由评论触发</span>
              )}
              <button
                className="btn"
                onClick={() => setTranslateOn(!translateOn)}
                style={{
                  fontSize: 11,
                  padding: '4px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  borderColor: translateOn ? 'var(--green)' : 'var(--border-mid)',
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: translateOn ? 'var(--green)' : 'var(--text-tertiary)',
                    flexShrink: 0,
                  }}
                />
                {translateOn ? '翻译开' : '翻译关'}
              </button>
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
                  return (
                    <div key={m.id} style={{ textAlign: 'center' }}>
                      <span className="badge badge-off">{m.content}</span>
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
                    {isUser && translateOn && (
                      <div className="translate-hint">
                        译文：<em>{translations.get(m.id) || '翻译中...'}</em>
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Mode Switch */}
            <div style={{ padding: '8px 16px', borderTop: '0.5px solid var(--border-soft)', background: 'var(--bg-primary)', flexShrink: 0 }}>
              <div className="flex items-center gap-8">
                <div className="radio-group" style={{ margin: 0 }}>
                  <span
                    className={`radio-opt${mode === 'ai' ? ' active' : ''}`}
                    onClick={() => handleModeSwitch('ai')}
                  >
                    AI 自动回复
                  </span>
                  <span
                    className={`radio-opt${mode === 'human' ? ' active' : ''}`}
                    onClick={() => handleModeSwitch('human')}
                  >
                    人工回复
                  </span>
                </div>
                <span className="text-xs flex-1">
                  {mode === 'ai' ? 'AI 将根据知识库自动生成回复' : '手动输入消息并发送'}
                </span>
              </div>
            </div>

            {/* AI Mode Input */}
            {mode === 'ai' && (
              <div style={{ padding: '8px 16px 12px', background: 'var(--bg-primary)', flexShrink: 0 }}>
                <div className="field-label" style={{ marginBottom: 6 }}>AI 回复预览（发送前可编辑）：</div>
                <div className="ai-preview">
                  <div className="ai-preview-label">AI 生成内容</div>
                  {aiReplyLoading ? (
                    <div className="text-xs" style={{ padding: '4px 0' }}>正在生成...</div>
                  ) : (
                    <textarea
                      value={aiReply}
                      onChange={(e) => setAiReply(e.target.value)}
                      style={{ width: '100%', border: 'none', background: 'transparent', color: 'var(--blue-800)', fontSize: 12, resize: 'vertical', minHeight: 40, outline: 'none', fontFamily: 'var(--font)', lineHeight: 1.5 }}
                    />
                  )}
                </div>
                <div className="flex gap-8 mt-8">
                  <button className="btn" onClick={loadAiReply} disabled={aiReplyLoading}>
                    重新生成
                  </button>
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

            {/* Human Mode Input */}
            {mode === 'human' && (
              <div style={{ padding: '8px 16px 12px', background: 'var(--bg-primary)', flexShrink: 0 }}>
                {assist && (
                  <div className="ai-preview" style={{ marginBottom: 8 }}>
                    <div className="ai-preview-label">AI 生成内容</div>
                    <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5 }}>{assist.improved}</div>
                    <div className="flex gap-8 mt-8">
                      <button className="btn-primary" onClick={() => { setInput(assist.improved); setAssist(null); }} style={{ fontSize: 11, padding: '4px 10px' }}>
                        使用优化版本
                      </button>
                      <button className="btn" onClick={() => setAssist(null)} style={{ fontSize: 11, padding: '4px 10px' }}>
                        取消
                      </button>
                    </div>
                  </div>
                )}
                <div className="flex gap-8 items-center">
                  <input
                    type="text"
                    className="flex-1"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
                    placeholder="输入消息..."
                  />
                  <button
                    className="btn-primary"
                    onClick={handleSend}
                    disabled={sending || !input.trim()}
                    style={{ opacity: sending || !input.trim() ? 0.4 : 1 }}
                  >
                    发送
                  </button>
                </div>
                {input.trim() && (
                  <div className="mt-8">
                    <button
                      className="tag-pill tag-ai"
                      onClick={handleAssist}
                      style={{ cursor: 'pointer', padding: '4px 10px', fontSize: 11 }}
                    >
                      {hasChinese(input) ? 'AI 翻译成英文并优化' : 'AI 优化英文表达'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
