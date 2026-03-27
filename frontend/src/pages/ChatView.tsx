import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getConversation,
  updateConversationMode,
  sendMessage,
  assistInput,
  translateMessage,
  generateAIReply,
} from '../api/client';
import type { ConversationDetail, AssistResult } from '../types';

const avatarClasses = ['avatar-blue', 'avatar-pink', 'avatar-green'];

export default function ChatView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [conv, setConv] = useState<ConversationDetail | null>(null);
  const [input, setInput] = useState('');
  const [assist, setAssist] = useState<AssistResult | null>(null);
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<'ai' | 'human'>('ai');
  const [translateOn, setTranslateOn] = useState(false);
  const [translations, setTranslations] = useState<Map<number, string>>(new Map());
  const [aiReply, setAiReply] = useState('');
  const [aiReplyLoading, setAiReplyLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    if (!id) return;
    getConversation(Number(id)).then((data) => {
      setConv(data);
      setMode(data.mode as 'ai' | 'human');
    }).catch(() => navigate('/conversations'));
  }, [id, navigate]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [conv?.messages]);

  // Load AI reply when mode switches to 'ai'
  useEffect(() => {
    if (mode === 'ai' && conv) {
      loadAiReply();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, conv?.id]);

  // Fetch translations lazily when translateOn turns on
  useEffect(() => {
    if (!translateOn || !conv) return;
    const userMessages = conv.messages.filter((m) => m.role === 'user');
    userMessages.forEach((m) => {
      if (!translations.has(m.id)) {
        translateMessage(conv.id, m.content)
          .then((res) => {
            setTranslations((prev) => {
              const next = new Map(prev);
              next.set(m.id, res.translated);
              return next;
            });
          })
          .catch(() => { /* ignore translation errors */ });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translateOn, conv?.messages]);

  const loadAiReply = async () => {
    if (!conv) return;
    setAiReplyLoading(true);
    try {
      const res = await generateAIReply(conv.id);
      setAiReply(res.reply);
    } catch {
      setAiReply('');
    }
    setAiReplyLoading(false);
  };

  const handleModeSwitch = async (next: 'ai' | 'human') => {
    if (!conv || next === mode) return;
    await updateConversationMode(conv.id, next);
    setConv({ ...conv, mode: next });
    setMode(next);
    setAssist(null);
  };

  const handleSend = async () => {
    if (!conv || !input.trim()) return;
    setSending(true);
    try {
      await sendMessage(conv.id, input);
      setInput('');
      setAssist(null);
      load();
    } catch { alert('发送失败'); }
    setSending(false);
  };

  const handleSendAiReply = async () => {
    if (!conv || !aiReply.trim()) return;
    setSending(true);
    try {
      await sendMessage(conv.id, aiReply);
      setAiReply('');
      load();
    } catch { alert('发送失败'); }
    setSending(false);
  };

  const handleAssist = async () => {
    if (!conv || !input.trim()) return;
    try {
      const result = await assistInput(conv.id, input);
      setAssist(result);
    } catch { alert('翻译失败'); }
  };

  const hasChinese = (text: string) => /[\u4e00-\u9fff]/.test(text);

  if (!conv) return (
    <div className="flex-1 flex items-center justify-center text-muted" style={{ background: 'var(--bg-secondary)', fontSize: 12 }}>
      加载中...
    </div>
  );

  const initials = (conv.ig_username || conv.ig_user_id).slice(0, 2).toUpperCase();
  const avatarClass = avatarClasses[(conv.id) % 3];
  const username = conv.ig_username || conv.ig_user_id;

  return (
    <div className="flex-col" style={{ height: '100vh', background: 'var(--bg-secondary)' }}>
      {/* === Header === */}
      <div className="panel-header" style={{ background: 'var(--bg-primary)', gap: 10 }}>
        <button className="icon-btn" onClick={() => navigate('/conversations')} style={{ fontSize: 16 }}>
          &larr;
        </button>
        <div className={`avatar avatar-sm ${avatarClass}`}>
          {initials}
        </div>
        <div className="flex-1">
          <div className="panel-title">{username}</div>
          <div className="panel-sub">Instagram · 正在对话</div>
        </div>
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
          {translateOn ? '英→中 翻译开启' : '翻译关闭'}
        </button>
      </div>

      {/* === Messages Area === */}
      <div className="scroll-y" style={{ gap: 10, display: 'flex', flexDirection: 'column' }}>
        {conv.messages.map((m) => {
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

      {/* === Mode Switch Section === */}
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

      {/* === AI Auto-Reply Mode === */}
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

      {/* === Human Reply Mode === */}
      {mode === 'human' && (
        <div style={{ padding: '8px 16px 12px', background: 'var(--bg-primary)', flexShrink: 0 }}>
          {/* Assist Preview */}
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
    </div>
  );
}
