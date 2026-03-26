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

// Conversations
export const getConversations = () => request<import('../types').Conversation[]>('/conversations');
export const getConversation = (id: number) => request<import('../types').ConversationDetail>(`/conversations/${id}`);
export const updateConversationMode = (id: number, mode: string) =>
  request<{ ok: boolean }>(`/conversations/${id}/mode`, { method: 'PATCH', body: JSON.stringify({ mode }) });
export const sendMessage = (id: number, text: string) =>
  request<import('../types').Message>(`/conversations/${id}/send`, { method: 'POST', body: JSON.stringify({ text }) });
export const assistInput = (id: number, text: string) =>
  request<import('../types').AssistResult>(`/conversations/${id}/assist`, { method: 'POST', body: JSON.stringify({ text }) });

// Simulate
export const simulateComment = (comment_text: string, username?: string) =>
  request<import('../types').SimulateResult>('/simulate', { method: 'POST', body: JSON.stringify({ comment_text, username }) });

// Settings
export const getSettings = () => request<import('../types').Settings>('/settings');
export const updateSettings = (data: Partial<import('../types').Settings>) =>
  request<import('../types').Settings>('/settings', { method: 'PATCH', body: JSON.stringify(data) });
