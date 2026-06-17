import { useEffect, useLayoutEffect, useState, useRef } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
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
  markConversationRead,
} from '../api/client';
import type { Conversation, ConversationDetail, AssistResult } from '../types';
import { useUncontrolledText } from '../hooks/useUncontrolledText';

// Per-channel selection key. Without channel-scoping, switching from
// /conversations (IG) to /tidio/conversations (Tidio) would leave the
// right-side detail pane stuck on the previously selected IG conversation
// — the conversation list is channel-filtered but `/api/conversations/{id}`
// looks up by primary key alone, so any id resolves regardless of channel.
const selectedConvKey = (channel: string) => `instabot.selectedConv.${channel}`;

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

// Translate Instagram's send-DM failure reason into something a Chinese-speaking
// operator can act on. The backend forwards Meta's raw error string in
// `ig_error`; we map the common ones and fall back to showing the raw text.
function describeIgSendFailure(igError?: string): string {
  const err = (igError || '').toLowerCase();
  if (!err) return '消息已保存，但未能发送到 Instagram（原因未知，请查看后端日志）';
  // Meta error code 10 / subcode 2018278 — outside 24h customer-initiated window
  if (err.includes('outside') && err.includes('window')) {
    return '消息已保存，但超过 24 小时回复窗口，Instagram 拒绝发送。需要客户先发新消息才能继续回复。';
  }
  if (err.includes('2018278')) {
    return '消息已保存，但超过 24 小时回复窗口，Instagram 拒绝发送。需要客户先发新消息才能继续回复。';
  }
  if (err.includes('access_token') || err.includes('oauth') || err.includes('expired')) {
    return '消息已保存，但 Instagram 访问令牌失效或过期，请在设置中重新授权。';
  }
  if (err.includes('rate') || err.includes('429')) {
    return '消息已保存，但被 Instagram 限流，请稍后重试。';
  }
  if (err.includes('no client registered')) {
    return '消息已保存，但该会话所属渠道未配置客户端，无法发送。';
  }
  return `消息已保存，但未能发送到 Instagram：${igError}`;
}

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
  // Channel from URL: /:channel/conversations sets it; legacy /conversations
  // omits the segment and defaults to 'instagram' so existing bookmarks /
  // links stay valid. Keep the list of supported channels narrow so a
  // typo'd URL like /foo/conversations falls back to IG instead of
  // hitting the backend with channel=foo (which 422s on the API).
  const params = useParams<{ channel?: string }>();
  const channel = params.channel === 'tidio' ? 'tidio' : 'instagram';

  // Per-channel selection. Each channel remembers its own last-selected
  // conversation in sessionStorage; switching channels swaps in that
  // channel's saved selection (or null on first visit). ?conv=ID still
  // overrides on mount regardless of channel.
  const [selectedId, setSelectedIdState] = useState<number | null>(() => {
    const saved = sessionStorage.getItem(selectedConvKey(channel));
    const n = saved ? parseInt(saved, 10) : NaN;
    return Number.isFinite(n) ? n : null;
  });
  const setSelectedId = (id: number | null) => {
    setSelectedIdState(id);
    if (id) sessionStorage.setItem(selectedConvKey(channel), String(id));
    else sessionStorage.removeItem(selectedConvKey(channel));
  };

  // When the channel changes (user navigates between /conversations and
  // /tidio/conversations), re-read this channel's saved selection. Without
  // this, useState's lazy initializer only fires once on mount and the
  // right pane would keep showing the previously-selected conversation
  // from the other channel.
  useEffect(() => {
    const saved = sessionStorage.getItem(selectedConvKey(channel));
    const n = saved ? parseInt(saved, 10) : NaN;
    setSelectedIdState(Number.isFinite(n) ? n : null);
  }, [channel]);

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
    // Only re-render when settings actually change, not on every poll.
    // Re-rendering this page every 2s breaks Chinese IME composition in
    // any focused textarea (the controlled `value` prop gets re-asserted
    // mid-composition and the IME commits raw pinyin instead).
    notifyOnChangeProps: ['data'],
  });

  // Wrap in an arrow so React Query doesn't pass its QueryFunctionContext
  // object as the `channel` arg of getConversations. Cache slot is keyed
  // by channel so switching between /conversations and /tidio/conversations
  // doesn't show stale data from the other side.
  const { data: convs = [] } = useQuery({
    queryKey: ['conversations', channel],
    queryFn: () => getConversations(channel),
    refetchInterval: 2000,
    notifyOnChangeProps: ['data'],
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
    notifyOnChangeProps: ['data', 'error'],
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

  // Uncontrolled textarea bindings — see useUncontrolledText. We need
  // these because React 19's controlled `value` prop fights Chinese IME
  // composition, leaking raw pinyin chars into the committed text.
  const inputBinding = useUncontrolledText<HTMLTextAreaElement>(input, setInput);
  const aiReplyBinding = useUncontrolledText<HTMLTextAreaElement>(aiReply, setAiReply);
  const aiPromptBinding = useUncontrolledText<HTMLTextAreaElement>(aiPrompt, setAiPrompt);
  const aiTranslationBinding = useUncontrolledText<HTMLTextAreaElement>(aiTranslation, setAiTranslation);

  // === Local UI-only state ===
  const [assist, setAssist] = useState<AssistResult | null>(null);
  const [translations, setTranslations] = useState<Map<number, string>>(new Map());
  const [toast, setToast] = useState<{ text: string; type: 'info' | 'warn' | 'error' } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const [brokenImgs, setBrokenImgs] = useState<Set<number>>(new Set());
  const [lightbox, setLightbox] = useState<{ url: string; isVideo: boolean } | null>(null);
  // Notification dispatch (sound / desktop / title flash) is handled globally
  // by useNewMessageNotifications, mounted at the Layout level.

  // === Conv-list scroll pinning ===
  // When we optimistically reorder convs on send, React moves the selected
  // conv's DOM node to the top of the scroll container. In some browsers /
  // CSS layouts that pulls scrollTop back to 0 (or shifts the viewport) even
  // though the DOM node is reused via key={c.id}. We pin scrollTop here:
  // every scroll event records the current position, and every render
  // restores it before paint. This is safe because nothing in this page
  // ever wants to programmatically scroll the conv list — operator scroll
  // is the only intended source of motion.
  const convListRef = useRef<HTMLDivElement | null>(null);
  const convListScrollTopRef = useRef(0);
  const onConvListScroll = () => {
    convListScrollTopRef.current = convListRef.current?.scrollTop ?? 0;
  };
  useLayoutEffect(() => {
    const el = convListRef.current;
    if (!el) return;
    if (el.scrollTop !== convListScrollTopRef.current) {
      el.scrollTop = convListScrollTopRef.current;
    }
  }, [convs]);

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
    onMutate: async (vars) => {
      // Optimistically bump the conversation to the top of the list so the
      // operator doesn't have to wait 1–2s for the API + refetch. We don't
      // touch scrollTop of the list container — React's stable `key={c.id}`
      // keeps DOM nodes in place across reordering, so the scrollbar stays
      // where the operator left it.
      await queryClient.cancelQueries({ queryKey: ['conversations'] });
      const nowIso = new Date().toISOString();
      queryClient.setQueriesData<Conversation[]>({ queryKey: ['conversations'] }, (old) => {
        if (!old) return old;
        const idx = old.findIndex((c) => c.id === vars.convId);
        if (idx < 0) return old;
        const target = old[idx];
        const bumped: Conversation = {
          ...target,
          updated_at: nowIso,
          last_message: vars.text,
          last_message_role: 'assistant',
          last_message_is_ai: !!vars.isAi,
        };
        const next = old.slice();
        next.splice(idx, 1);
        next.unshift(bumped);
        return next;
      });
    },
    onSuccess: (res, vars) => {
      if (!res.ig_sent) {
        showToast(describeIgSendFailure(res.ig_error), 'warn');
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
    onError: (e: any) => {
      const msg = e?.message || 'AI 优化失败';
      showToast(`AI 优化失败：${msg}`, 'error');
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

  const markReadMutation = useMutation({
    mutationFn: (convId: number) => markConversationRead(convId),
    onMutate: async (convId) => {
      await queryClient.cancelQueries({ queryKey: ['conversations'] });
      // Optimistic: bump last_read_message_id to current last_message_id so
      // the dot disappears instantly, without waiting for a refetch.
      queryClient.setQueriesData<Conversation[]>({ queryKey: ['conversations'] }, (old) => {
        if (!old) return old;
        return old.map((c) =>
          c.id === convId && c.last_message_id != null
            ? { ...c, last_read_message_id: c.last_message_id }
            : c,
        );
      });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      showToast('标记已读失败', 'error');
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
          {lightbox.isVideo ? (
            <video
              src={lightbox.url}
              controls
              autoPlay
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: '95vw', maxHeight: '95vh' }}
            />
          ) : (
            <img src={lightbox.url} alt="" style={{ maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain' }} />
          )}
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
        <div ref={convListRef} onScroll={onConvListScroll} style={{ flex: 1, overflowY: 'auto' }}>
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
                  {c.last_message_role === 'user'
                    && c.last_message_id != null
                    && (c.last_read_message_id ?? 0) < c.last_message_id && (
                    <span
                      role="button"
                      title="标记为已读"
                      onClick={(e) => {
                        e.stopPropagation();
                        markReadMutation.mutate(c.id);
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 6,
                        margin: -6,
                        cursor: 'pointer',
                      }}
                    >
                      <span className="unread-dot" />
                    </span>
                  )}
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
                const mediaAtts = (m.attachments || []).filter((a) => a.type === 'image' || a.type === 'video');
                const otherAtts = (m.attachments || []).filter((a) => a.type !== 'image' && a.type !== 'video');
                // If the stored content is just the auto-generated [图片] tag,
                // hide it when we already render the media inline.
                const textOnly = m.content
                  .replace(/\[图片(\s*x\d+)?\]/g, '')
                  .replace(/\[(image|video|audio|file|share|story_mention|ig_reel|ig_post)\]/g, '')
                  .trim();
                return (
                  <div key={m.id} className={`msg-row ${isUser ? 'from-user' : 'from-me'}`}>
                    {mediaAtts.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 260, marginBottom: textOnly ? 4 : 0 }}>
                        {mediaAtts.map((a, i) => a.type === 'video' ? (
                          <video
                            key={i}
                            src={a.url}
                            onClick={() => setLightbox({ url: a.url, isVideo: true })}
                            style={{
                              maxWidth: 220, maxHeight: 220, borderRadius: 12,
                              cursor: 'zoom-in', objectFit: 'cover', display: 'block',
                              background: '#000',
                            }}
                            muted
                            preload="metadata"
                          />
                        ) : (
                          <img
                            key={i}
                            src={a.url}
                            alt=""
                            onClick={() => setLightbox({ url: a.url, isVideo: false })}
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
                      {...aiPromptBinding}
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
                          {...aiReplyBinding}
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
                        {...aiTranslationBinding}
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
                    {...inputBinding}
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
