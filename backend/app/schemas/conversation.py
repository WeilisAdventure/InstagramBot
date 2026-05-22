from pydantic import BaseModel
from datetime import datetime


class MessageAttachment(BaseModel):
    type: str
    url: str


class MessageResponse(BaseModel):
    id: int
    conversation_id: int
    role: str
    content: str
    original_content: str | None
    is_ai_generated: bool
    attachments: list[MessageAttachment] | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationResponse(BaseModel):
    id: int
    ig_user_id: str
    ig_username: str
    ig_profile_pic: str | None = None
    trigger_source: str
    trigger_rule_id: int | None
    mode: str
    is_resolved: bool
    created_at: datetime
    updated_at: datetime
    last_message: str | None = None
    last_message_role: str | None = None
    last_message_is_ai: bool | None = None

    model_config = {"from_attributes": True}


class ConversationDetail(ConversationResponse):
    messages: list[MessageResponse] = []
    ai_prompt_notes: str | None = None


class SendMessageRequest(BaseModel):
    text: str
    is_ai_generated: bool = False
    skip_translation: bool = False  # True when text is already translated


class AssistRequest(BaseModel):
    text: str


class AssistResponse(BaseModel):
    original: str
    improved: str
    language: str


class UpdateModeRequest(BaseModel):
    mode: str  # "ai" | "human"
