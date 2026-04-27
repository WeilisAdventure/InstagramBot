export interface Rule {
  id: number;
  name: string;
  keywords: string[];
  match_mode: string;
  public_reply_template: string;
  dm_template: string;
  follow_up_mode: string;
  is_active: boolean;
  trigger_count: number;
  created_at: string;
  updated_at: string;
}

export interface RuleCreate {
  name: string;
  keywords: string[];
  match_mode?: string;
  public_reply_template?: string;
  dm_template?: string;
  follow_up_mode?: string;
  is_active?: boolean;
}

export interface KnowledgeEntry {
  id: number;
  question: string;
  answer: string;
  category: string;
  is_active: boolean;
  created_at: string;
}

export interface Message {
  id: number;
  conversation_id: number;
  role: string;
  content: string;
  original_content: string | null;
  is_ai_generated: boolean;
  created_at: string;
}

export interface Conversation {
  id: number;
  ig_user_id: string;
  ig_username: string;
  ig_profile_pic: string | null;
  trigger_source: string;
  trigger_rule_id: number | null;
  mode: string;
  is_resolved: boolean;
  created_at: string;
  updated_at: string;
  last_message: string | null;
  last_message_role: string | null;
  last_message_is_ai: boolean | null;
}

export interface ConversationDetail extends Conversation {
  messages: Message[];
}

export interface DashboardStats {
  weekly_conversations: number;
  ai_resolution_rate: number;
  comment_triggers: number;
}

export interface Settings {
  ig_connection_status: string;
  ig_username: string;
  ig_api_version: string;
  ai_model: string;
  ai_model_provider: string;
  custom_api_key: string;
  custom_base_url: string;
  reply_delay_seconds: number;
  translation_strategy: string;
  notification_enabled: boolean;
  notification_sound: boolean;
  notification_desktop: boolean;
  notification_title_flash: boolean;
  auto_reply_enabled: boolean;
  comment_trigger_enabled: boolean;
  welcome_message_enabled: boolean;
  welcome_message_text: string;
  default_conversation_mode: 'ai' | 'human';
}

export interface Preference {
  id: number;
  content: string;
  source_prompt: string;
  is_active: boolean;
  created_at: string;
}

export interface CommentEvent {
  id: number;
  comment_id: string;
  media_id: string;
  user_id: string;
  username: string;
  text: string;
  matched_rule_id: number | null;
  action_taken: 'auto_replied' | 'skipped_disabled' | 'no_match';
  is_read: boolean;
  created_at: string;
}

export interface CommentEventList {
  items: CommentEvent[];
  unread_count: number;
  total: number;
}

export interface SimulateResult {
  triggered: boolean;
  matched_rule: string | null;
  public_reply: string | null;
  dm_content: string | null;
  conversation_id: number | null;
}

export interface AssistResult {
  original: string;
  improved: string;
  language: string;
}
