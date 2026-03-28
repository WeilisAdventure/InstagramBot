const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// Dashboard
export const getDashboardStats = () => request<import('../types').DashboardStats>('/dashboard/stats');

// Rules
export const getRules = () => request<import('../types').Rule[]>('/rules');
export const createRule = (data: import('../types').RuleCreate) =>
  request<import('../types').Rule>('/rules', { method: 'POST', body: JSON.stringify(data) });
export const updateRule = (id: number, data: Partial<import('../types').RuleCreate>) =>
  request<import('../types').Rule>(`/rules/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteRule = (id: number) =>
  request<void>(`/rules/${id}`, { method: 'DELETE' });

// Knowledge
export const getKnowledge = () => request<import('../types').KnowledgeEntry[]>('/knowledge');
export const createKnowledge = (data: { question: string; answer: string; category?: string }) =>
  request<import('../types').KnowledgeEntry>('/knowledge', { method: 'POST', body: JSON.stringify(data) });
export const updateKnowledge = (id: number, data: Partial<{ question: string; answer: string; category: string; is_active: boolean }>) =>
  request<import('../types').KnowledgeEntry>(`/knowledge/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteKnowledge = (id: number) =>
  request<void>(`/knowledge/${id}`, { method: 'DELETE' });
export const deleteAllKnowledge = () =>
  request<void>(`/knowledge`, { method: 'DELETE' });
export const uploadKnowledgeFile = async (file: File): Promise<import('../types').KnowledgeEntry[]> => {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE}/knowledge/upload`, { method: 'POST', body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Upload failed: ${res.status}`);
  }
  return res.json();
};

// Conversations
export const getConversations = () => request<import('../types').Conversation[]>('/conversations');
export const getConversation = (id: number) => request<import('../types').ConversationDetail>(`/conversations/${id}`);
export const updateConversationMode = (id: number, mode: string) =>
  request<{ ok: boolean }>(`/conversations/${id}/mode`, { method: 'PATCH', body: JSON.stringify({ mode }) });
export const sendMessage = (id: number, text: string, is_ai_generated = false) =>
  request<import('../types').Message & { ig_sent: boolean; ig_error: string }>(`/conversations/${id}/send`, { method: 'POST', body: JSON.stringify({ text, is_ai_generated }) });
export const assistInput = (id: number, text: string) =>
  request<import('../types').AssistResult>(`/conversations/${id}/assist`, { method: 'POST', body: JSON.stringify({ text }) });
export const translateMessage = (convId: number, text: string) =>
  request<{ original: string; translated: string; source_lang: string }>(`/conversations/${convId}/translate`, { method: 'POST', body: JSON.stringify({ text }) });
export const generateAIReply = (convId: number) =>
  request<{ reply: string }>(`/conversations/${convId}/generate-reply`, { method: 'POST' });

// Simulate
export const simulateComment = (comment_text: string, username?: string) =>
  request<import('../types').SimulateResult>('/simulate', { method: 'POST', body: JSON.stringify({ comment_text, username }) });

// Settings
export const getSettings = () => request<import('../types').Settings>('/settings');
export const updateSettings = (data: Partial<import('../types').Settings>) =>
  request<import('../types').Settings>('/settings', { method: 'PATCH', body: JSON.stringify(data) });
