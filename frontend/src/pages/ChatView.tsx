import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getConversation, updateConversationMode, sendMessage, assistInput } from '../api/client';
import type { ConversationDetail, AssistResult } from '../types';

export default function ChatView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [conv, setConv] = useState<ConversationDetail | null>(null);
  const [input, setInput] = useState('');
  const [assist, setAssist] = useState<AssistResult | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = () => {
    if (!id) return;
    getConversation(Number(id)).then(setConv).catch(() => navigate('/conversations'));
  };

  useEffect(() => { load(); }, [id]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [conv?.messages]);

  const toggleMode = async () => {
    if (!conv) return;
    const next = conv.mode === 'ai' ? 'human' : 'ai';
    await updateConversationMode(conv.id, next);
    setConv({ ...conv, mode: next });
  };

  const handleSend = async () => {
    if (!conv || !input.trim()) return;
    setSending(true);
    try {
      await sendMessage(conv.id, input);
      setInput('');
      setAssist(null);
      load();
    } catch {
      alert('Failed to send');
    }
    setSending(false);
  };

  const handleAssist = async () => {
    if (!conv || !input.trim()) return;
    try {
      const result = await assistInput(conv.id, input);
      setAssist(result);
    } catch {
      alert('Assist failed');
    }
  };

  const applyAssist = () => {
    if (assist) {
      setInput(assist.improved);
      setAssist(null);
    }
  };

  if (!conv) return <p className="text-gray-500">Loading...</p>;

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      {/* Header */}
      <div className="bg-white rounded-xl shadow px-4 py-3 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/conversations')} className="text-gray-400 hover:text-gray-600">&larr;</button>
          <div>
            <span className="font-semibold">@{conv.ig_username || conv.ig_user_id}</span>
            {conv.trigger_source === 'comment_rule' && (
              <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                From Comment Rule
              </span>
            )}
          </div>
        </div>
        <button
          onClick={toggleMode}
          className={`text-xs px-3 py-1 rounded-full font-medium ${
            conv.mode === 'ai' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'
          }`}
        >
          {conv.mode === 'ai' ? 'AI Mode' : 'Human Mode'} (click to switch)
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 px-2">
        {conv.messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[70%] px-4 py-2 rounded-2xl text-sm ${
              m.role === 'user'
                ? 'bg-gray-200 text-gray-900 self-start mr-auto'
                : m.role === 'system'
                ? 'bg-gray-100 text-gray-500 text-xs mx-auto text-center rounded-lg'
                : 'bg-blue-500 text-white self-end ml-auto'
            }`}
          >
            {m.content}
            {m.is_ai_generated && <span className="text-xs opacity-60 ml-1">(AI)</span>}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Assist preview */}
      {assist && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mx-2 mt-2">
          <p className="text-xs text-gray-500 mb-1">
            Detected: {assist.language === 'zh' ? 'Chinese -> English' : 'English (polished)'}
          </p>
          <p className="text-sm">{assist.improved}</p>
          <div className="flex gap-2 mt-2">
            <button onClick={applyAssist} className="text-xs bg-blue-600 text-white px-3 py-1 rounded">
              Use This
            </button>
            <button onClick={() => setAssist(null)} className="text-xs text-gray-500 hover:text-gray-700">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2 mt-3 px-2 pb-2">
        <input
          className="flex-1 border rounded-xl px-4 py-2"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
          placeholder={conv.mode === 'ai' ? 'AI is handling this conversation...' : 'Type a message...'}
        />
        <button
          onClick={handleAssist}
          className="bg-yellow-500 text-white px-3 py-2 rounded-xl hover:bg-yellow-600 text-sm"
          title="AI Translate/Polish"
        >
          AI
        </button>
        <button
          onClick={handleSend}
          disabled={sending || !input.trim()}
          className="bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
