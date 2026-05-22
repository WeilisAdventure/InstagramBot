import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getConversations,
  getConversation,
  getSettings,
  updateConversationMode,
  sendMessage,
  assistInput,
  translateMessage,
  generateAIReply,
  clearPromptNotes,
} from '../api/client';
import type { ConversationDetail, AssistResult } from '../types';

const SELECTED_CONV_KEY = 'instabot.selectedConv';

// Per-conversation draft state (textarea contents) survives tab switches,
// page reloads, and even mid-generation unmounts — the generateReply
// mutation writes its result straight to the cache + sessionStorage, so
// navigating away mid-stream doesn't drop the reply.
type Draft = { reply: string; translation: string; prompt: string; input: string };
const EMPTY_DRAFT: Draft = { reply: '', translation: '', prompt: '', input: '' };
const draftKey = (id: number) => `instabot.draft.${id}`;
function loadDraft(id: number | null): Draft {
  if (!id) return EMPTY_DRAFT;
  try {
    const raw = sessionStorage.getItem(draftKey(id));
    if (raw) return { ...EMPTY_DRAFT, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return EMPTY_DRAFT;
}
function persistDraft(id: number | null, draft: Draft) {
  if (!id) return;
  try {
    if (!draft.reply && !draft.translation && !draft.prompt && !draft.input) {
      sessionStorage.removeItem(draftKey(id));
    } else {
      sessionStorage.setItem(draftKey(id), JSON.stringify(draft));
    }
  } catch { /* ignore */ }
}

const avatarColors = ['avatar-blue', 'avatar-pink', 'avatar-green', 'avatar-amber'];

// New-message notifications now live in `useNewMessageNotifications`, mounted
// at the Layout level so they fire across all routes (not just while the
// operator is on /conversations). Don't reintroduce dispatch logic here.

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
  invertDrag: boolean = false,
) {
  const targetRef = useRef<HTMLElement | null>(null);

  const [height, setHeight] = useState<number>(() => {
    if (storageKey && typeof window !== 'undefined') {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const n = parseInt(raw, 10);
        if (!isNaN(n) && n >= minPx && n <= maxPx) return n;
      }
    }
    return initial;
  });

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const measured = targetRef.current?.getBoundingClientRect().height;
    const startH = typeof measured === 'number' && measured > 0 ? measured : height;

    const onMove = (m: MouseEvent) => {
      const delta = invertDrag ? (m.clientY - startY) : (startY - m.clientY);
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
  height: 4,
  cursor: 'ns-resize',
  background: 'var(--border-soft)',
  margin: '3px 0',
  borderRadius: 2,
  flexShrink: 0,
  position: 'relative',
};

const innerSplitterStyle: React.CSSProperties = {
  height: 4,
  cursor: 'ns-resize',
  background: 'var(--accent, #185FA5)',
  opacity: 0.35,
  margin: '3px 0',
  borderRadius: 2,
  flexShrink: 0,
  userSelect: 'none',
};

export default function Conversations() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  // Persist selectedId in sessionStorage so switching tabs (which unmounts
  // this component) doesn't lose the user's place. ?conv=ID overrides on mount.
  const [selectedId, setSelectedIdState] = useState<number | null>(() => {
    const saved = sessionStorage.getItem(SELECTED_CONV_KEY);
    const n = saved ? parseInt(saved, 10) : NaN;
    return Number.isFinite(n) ? n : null;
  });
  const setSelectedId = (id: number | null) => {
    setSelectedIdState(id);
    if (id) sessionStorage.setItem(SELECTED_CONV_KEY, String(id));
    else sessionStorage.removeItem(SELECTED_CONV_KEY);
  };

  const aiPanelSize = useResizable(360, 'instabot.height.aiPanel');
  const humanPanelSize = useResizable(260, 'instabot.height.humanPanel');
  const aiPromptSize = useResizable(80, 'instabot.height.aiPrompt', 30, 600, true);
  const humanAssistSize = useResizable(120, 'instabot.height.humanAssist', 40, 600, true);

  // Pick up ?conv=ID (e.g. when navigated from the comments inbox)
  useEffect(() => {
    const convParam = searchParams.get('conv');
    if (convParam) {
      const id = parseInt(convParam, 10);
      if (!isNaN(id)) {
        setSelectedId(id);
        searchParams.delete('conv');
        setSearchParams(searchParams, { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // === Queries ===
  const { data: notifSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
    refetchInterval: 2000,
  });

  // Wrap in an arrow so React Query doesn't pass its QueryFunctionContext
  // object as the `channel` arg of getConversations.
  const { data: convs = [] } = useQuery({
    queryKey: ['conversations', 'instagram'],
    queryFn: () => getConversations('instagram'),
    refetchInterval: 2000,
  });

  const { data: detail = null, error: detailError } = useQuery({
    queryKey: ['conversation', selectedId],
    queryFn: () => getConversation(selectedId as number),
    enabled: !!selectedId,
    // Poll faster in AI mode so generated replies / incoming messages surface
    // quickly; slower in human mode where the operator drives the pace.
    refetchInterval: (query) => {
      const d = query.state.data as ConversationDetail | undefined;
      return d?.mode === 'human' ? 4000 : 1500;
    },
  });

  // Derived state — single source of truth is the detail query. This fixes
  // a pre-existing race where a stale in-flight detail fetch could clobber
  // local mode/promptNotes set by the user a moment earlier.
  const mode: 'ai' | 'human' = (detail?.mode === 'human' ? 'human' : 'ai');
  const promptNotes = detail?.ai_prompt_notes || '';

  // Clear selection if the conversation 404s (e.g. deleted from DB).
  useEffect(() => {
    if (selectedId && detailError) setSelectedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailError, selectedId]);

  // === Per-conversation draft (cache-backed, sessionStorage-persistent) ===
  // Stored in React Query cache so writes from a mutation's onSuccess survive
  // component unmount — i.e. user can fire "generate reply", switch tabs,
  // come back, and find the generated draft waiting.
  const { data: draft = EMPTY_DRAFT } = useQuery<Draft>({
    queryKey: ['draft', selectedId],
    queryFn: () => loadDraft(selectedId),
    enabled: !!selectedId,
    staleTime: Infinity,
  });
  const aiReply = draft.reply;
  const aiPrompt = draft.prompt;
  const aiTranslation = draft.translation;
  const input = draft.input;
  const updateDraft = (patch: Partial<Draft>) => {
    if (!selectedId) return;
    queryClient.setQueryData<Draft>(['draft', selectedId], (old) => {
      const next = { ...(old ?? EMPTY_DRAFT), ...patch };
      persistDraft(selectedId, next);
      return next;
    });
  };
  const setAiReply = (v: string) => updateDraft({ reply: v });
  const setAiPrompt = (v: string) => updateDraft({ prompt: v });
  const setAiTranslation = (v: string) => updateDraft({ translation: v });
  const setInput = (v: string) => updateDraft({ input: v });

  // === Local UI-only state ===
  const [assist, setAssist] = useState<AssistResult | null>(null);
  const [translations, setTranslations] = useState<Map<number, string>>(new Map());
  const [toast, setToast] = useState<{ text: string; type: 'info' | 'warn' | 'error' } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const [brokenImgs, setBrokenImgs] = useState<Set<number>>(new Set());
  const [lightbox, setLightbox] = useState<string | null>(null);
  // Notification dispatch (sound / desktop / title flash) is handled globally
  // by useNewMessageNotifications, mounted at the Layout level.

  useEffect(() => {
    setTimeout(() => {
      const el = messagesRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }, [detail?.messages?.length, selectedId]);

  const showToast = (text: string, type: 'info' | 'warn' | 'error' = 'info') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  // === Mutations ===
  // Every mutation that touches cached data passes the originating convId
  // through its `variables` and reads it from there in callbacks. We do
  // NOT use `selectedId` or `detail` from the outer closure inside
  // onSuccess/onMutate, because by the time the mutation resolves the user
  // may have switched conversations — that would write the result to the
  // wrong conversation's cache.

  const sendMutation = useMutation({
    mutationFn: (vars: { convId: number; text: string; isAi?: boolean; skipTranslation?: boolean }) =>
      sendMessage(vars.convId, vars.text, vars.isAi ?? false, vars.skipTranslation ?? false),
    onSuccess: (res, vars) => {
      if (!res.ig_sent) {
        showToast('消息已保存，但未能发送到 Instagram（可能是测试用户）', 'warn');
      }
      queryClient.invalidateQueries({ queryKey: ['conversation', vars.convId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: () => showToast('发送失败，请重试', 'error'),
  });

  const assistMutation = useMutation({
    mutationFn: (vars: { convId: number; text: string }) => assistInput(vars.convId, vars.text),
    onSuccess: (result, vars) => {
      // Only surface the assist preview if the user is still viewing the
      // conversation we generated it for; otherwise silently discard.
      if (selectedId === vars.convId) setAssist(result);
    },
  });

  const generateReplyMutation = useMutation({
    mutationFn: (vars: { convId: number; prompt: string }) =>
      generateAIReply(vars.convId, vars.prompt || undefined),
    onSuccess: (res, vars) => {
      if (!res.reply) {
        showToast('AI 返回了空回复，请重试', 'warn');
        return;
      }
      // Land the reply in the ORIGINATING conv's draft, not whatever
      // the user happens to be looking at right now.
      queryClient.setQueryData<Draft>(['draft', vars.convId], (old) => {
        const next = { ...(old ?? EMPTY_DRAFT), reply: res.reply, prompt: '' };
        persistDraft(vars.convId, next);
        return next;
      });
      if (res.prompt_notes !== undefined) {
        queryClient.setQueryData<ConversationDetail | null>(
          ['conversation', vars.convId],
          (old) => (old ? { ...old, ai_prompt_notes: res.prompt_notes } : old),
        );
      }
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.detail || e?.message || '生成失败';
      showToast(`生成回复失败：${msg}`, 'error');
    },
  });

  const translateReplyMutation = useMutation({
    mutationFn: (vars: { convId: number; text: string }) => translateMessage(vars.convId, vars.text),
    onSuccess: (res, vars) => {
      queryClient.setQueryData<Draft>(['draft', vars.convId], (old) => {
        const next = { ...(old ?? EMPTY_DRAFT), translation: res.translated };
        persistDraft(vars.convId, next);
        return next;
      });
    },
    onError: () => showToast('翻译失败，请重试', 'error'),
  });

  const modeSwitchMutation = useMutation({
    mutationFn: (vars: { convId: number; next: 'ai' | 'human' }) =>
      updateConversationMode(vars.convId, vars.next),
    onMutate: async (vars) => {
      // Optimistic — flip mode immediately on the originating conv.
      await queryClient.cancelQueries({ queryKey: ['conversation', vars.convId] });
      const previous = queryClient.getQueryData<ConversationDetail>(['conversation', vars.convId]);
      queryClient.setQueryData<ConversationDetail | null>(
        ['conversation', vars.convId],
        (old) => (old ? { ...old, mode: vars.next } : old),
      );
      if (selectedId === vars.convId) setAssist(null);
      return { previous, convId: vars.convId };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(['conversation', ctx.convId], ctx.previous);
      }
      showToast('模式切换失败', 'error');
    },
  });

  const clearNotesMutation = useMutation({
    mutationFn: (convId: number) => clearPromptNotes(convId),
    onSuccess: (_res, convId) => {
      queryClient.setQueryData<ConversationDetail | null>(
        ['conversation', convId],
        (old) => (old ? { ...old, ai_prompt_notes: null } : old),
      );
      if (selectedId === convId) showToast('已清空累积指令', 'info');
    },
  });

  // === Handlers ===
  const handleTranslateMsg = (msgId: number, content: string) => {
    if (translations.has(msgId)) {
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
    // Draft fields (input, aiReply, aiPrompt, aiTranslation) are keyed by
    // conversation id in cache + sessionStorage, so changing selectedId
    // automatically swaps in the new conversation's draft. Don't clear them.
    setSelectedId(id);
    setAssist(null);
    setTranslations(new Map());
    setToast(null);
  };

  const loadAiReply = () => {
    if (!detail) return;
    generateReplyMutation.mutate({ convId: detail.id, prompt: aiPrompt });
  };

  const handleClearPromptNotes = () => {
    if (!detail) return;
    clearNotesMutation.mutate(detail.id);
  };

  const handleModeSwitch = (next: 'ai' | 'human') => {
    if (!detail || next === mode) return;
    modeSwitchMutation.mutate({ convId: detail.id, next });
  };

  const handleSend = () => {
    if (!detail || !input.trim()) return;
    const text = input;
    setInput('');
    setAssist(null);
    sendMutation.mutate({ convId: detail.id, text });
  };

  const handleTranslateAiReply = () => {
    if (!detail || !aiReply.trim()) return;
    translateReplyMutation.mutate({ convId: detail.id, text: aiReply });
  };

  const handleSendAiReply = () => {
    if (!detail || !aiReply.trim()) return;
    const useTranslation = aiTranslation.trim().length > 0;
    const textToSend = useTranslation ? aiTranslation : aiReply;
    setAiReply('');
    setAiTranslation('');
    sendMutation.mutate({ convId: detail.id, text: textToSend, isAi: true, skipTranslation: useTranslation });
  };

  const handleAssist = () => {
    if (!detail || !input.trim() || assistMutation.isPending) return;
    assistMutation.mutate({ convId: detail.id, text: input });
  };

  // Loading flags consumed by JSX
  const sending = sendMutation.isPending;
  const aiReplyLoading = generateReplyMutation.isPending;
  const aiTranslating = translateReplyMutation.isPending;
  const assisting = assistMutation.isPending;

  const hasChinese = (text: string) => /[一-鿿]/.test(text);

  const username = detail ? (detail.external_username || detail.external_user_id) : '';
  const initials = username.slice(0, 2).toUpperCase();

  return (
    <div className="flex" style={{ height: '100%', overflow: 'hidden' }}>
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
            zIndex: 9999, display: 'flex', alignItems: 'center',
            justifyContent: 'center', cursor: 'zoom-out',
          }}
        >
          <img src={lightbox} alt="" style={{ maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain' }} />
        </div>
      )}
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
              {c.external_profile_pic && !brokenImgs.has(c.id) ? (
                <img
                  src={c.external_profile_pic}
                  className="avatar avatar-md"
                  style={{ objectFit: 'cover' }}
                  onError={() => setBrokenImgs(prev => new Set(prev).add(c.id))}
                />
              ) : (
                <div className={`avatar avatar-md ${avatarColors[i % avatarColors.length]}`}>
                  {getInitials(c.external_username || c.external_user_id)}
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
                  {c.external_username || c.external_user_id}
                </div>
                <div className="list-item-last">{c.last_message || '暂无消息'}</div>
              </div>
              <div className="list-item-meta">
                <span className="text-xs">{timeAgo(c.updated_at)}</span>
                <div className="flex items-center gap-6">
                  {c.last_message_role === 'user' && <span className="unread-dot" />}
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
              {detail.external_profile_pic && !brokenImgs.has(detail.id) ? (
                <img
                  src={detail.external_profile_pic}
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
                const imgAtts = (m.attachments || []).filter((a) => a.type === 'image');
                const otherAtts = (m.attachments || []).filter((a) => a.type !== 'image');
                // If the stored content is just the auto-generated [图片] tag,
                // hide it when we already render the image inline.
                const textOnly = m.content
                  .replace(/\[图片(\s*x\d+)?\]/g, '')
                  .replace(/\[(video|audio|file|share|story_mention|ig_reel)\]/g, '')
                  .trim();
                return (
                  <div key={m.id} className={`msg-row ${isUser ? 'from-user' : 'from-me'}`}>
                    {imgAtts.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 260, marginBottom: textOnly ? 4 : 0 }}>
                        {imgAtts.map((a, i) => (
                          <img
                            key={i}
                            src={a.url}
                            alt=""
                            onClick={() => setLightbox(a.url)}
                            style={{
                              maxWidth: 220, maxHeight: 220, borderRadius: 12,
                              cursor: 'zoom-in', objectFit: 'cover', display: 'block',
                            }}
                          />
                        ))}
                      </div>
                    )}
                    {(textOnly || otherAtts.length > 0) && (
                      <div className={`bubble ${isUser ? 'bubble-in' : 'bubble-out'}`}>
                        {textOnly}
                        {otherAtts.map((a, i) => (
                          <span key={i} style={{ opacity: 0.6, marginLeft: textOnly ? 6 : 0 }}>[{a.type}]</span>
                        ))}
                      </div>
                    )}
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

            {/* AI Mode Input */}
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
                <div
                  style={{ ...dragHandleStyle, flexShrink: 0 }}
                  onMouseDown={aiPanelSize.startDrag}
                  title="拖动调整整个面板高度"
                />

                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>

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

                  {promptNotes && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '3px 0', flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flex: 1, lineHeight: 1.5 }}>
                        📌 已累积 {promptNotes.split('\n').filter(Boolean).length} 条指令：{promptNotes.split('\n').filter(Boolean).join(' · ')}
                      </span>
                      <button
                        className="btn"
                        onClick={handleClearPromptNotes}
                        style={{ fontSize: 10, padding: '2px 7px', flexShrink: 0, color: 'var(--text-tertiary)' }}
                      >
                        清空
                      </button>
                    </div>
                  )}

                  <div
                    style={innerSplitterStyle}
                    onMouseDown={aiPromptSize.startDrag}
                    title="上下拖动：调整提示词区与预览区的比例"
                  >
                  </div>

                  <div style={{ display: 'flex', flex: 1, minHeight: 0, gap: 6 }}>
                    <div
                      className="ai-preview"
                      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
                    >
                      <div className="ai-preview-label" style={{ flexShrink: 0 }}>AI 中文草稿</div>
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

                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flexShrink: 0 }}>
                      <button
                        className="btn"
                        onClick={handleTranslateAiReply}
                        disabled={aiTranslating || !aiReply.trim()}
                        style={{ fontSize: 11, padding: '5px 8px', writingMode: 'horizontal-tb' }}
                        title="翻译中文草稿为英文"
                      >
                        {aiTranslating ? '...' : '译 →'}
                      </button>
                    </div>

                    <div
                      className="ai-preview"
                      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
                    >
                      <div className="ai-preview-label" style={{ flexShrink: 0 }}>
                        英文译文
                        {aiTranslation && (
                          <span
                            style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-tertiary)', cursor: 'pointer' }}
                            onClick={() => setAiTranslation('')}
                          >
                            ✕ 清空
                          </span>
                        )}
                      </div>
                      <textarea
                        value={aiTranslation}
                        onChange={(e) => setAiTranslation(e.target.value)}
                        placeholder="点「译 →」生成，或直接输入英文..."
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
                    </div>
                  </div>
                </div>

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

            {/* Human Mode Input */}
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

                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  {assist && (
                    <>
                      <div
                        ref={humanAssistSize.targetRef as React.RefObject<HTMLDivElement>}
                        className="ai-preview"
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          flexBasis: humanAssistSize.height,
                          flexShrink: 1,
                          flexGrow: 0,
                          minHeight: 60,
                          overflow: 'hidden',
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
                      <div
                        style={innerSplitterStyle}
                        onMouseDown={humanAssistSize.startDrag}
                      />
                    </>
                  )}
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="输入消息... — 回车换行，按右侧按钮发送"
                    style={{
                      width: '100%',
                      flex: 1,
                      minHeight: 50,
                      flexShrink: 1,
                      resize: 'none',
                      fontFamily: 'var(--font)',
                      fontSize: 13,
                      lineHeight: 1.5,
                    }}
                  />
                </div>

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
