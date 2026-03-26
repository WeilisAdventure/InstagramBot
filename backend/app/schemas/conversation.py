from pydantic import BaseModel
from datetime import datetime


class MessageResponse(BaseModel):
    id: int
    conversation_id: int
    role: str
    content: str
    original_content: str | None
    is_ai_generated: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationResponse(BaseModel):
    id: int
    ig_user_id: str
    ig_username: str
    trigger_source: str
    trigger_rule_id: int | None
    mode: str
    is_resolved: bool
    created_at: datetime
    updated_at: datetime
    last_message: str | None = None

    model_config = {"from_attributes": True}


class ConversationDetail(ConversationResponse):
    messages: list[MessageResponse] = []


class SendMessageRequest(BaseModel):
    text: str


class AssistRequest(BaseModel):
    text: str


class AssistResponse(BaseModel):
    original: str
    improved: str
    language: str


class UpdateModeRequest(BaseModel):
    mode: str  # "ai" | "human"
