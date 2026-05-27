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
    channel: str
    external_user_id: str
    external_username: str
    external_profile_pic: str | None = None
    trigger_source: str
    trigger_rule_id: int | None
    mode: str
    is_resolved: bool
    created_at: datetime
    updated_at: datetime
    last_message: str | None = None
    last_message_role: str | None = None
    last_message_is_ai: bool | None = None
    # Primary key of the most recent Message row. Used by the frontend as a
    # stable "has there been a new message?" signal — unlike `updated_at`,
    # this only advances when a real message is inserted (mode toggles and
    # profile backfills don't bump it), so it can't trigger false notifications.
    last_message_id: int | None = None
    # True when the most recent message carries attachments. Lets the
    # notification UI render "[图片]" for image-only DMs where `last_message`
    # text is empty.
    last_message_has_attachments: bool | None = None
    # Highest Message.id the manager has marked read. Frontend shows the
    # unread dot only while last_message_id > last_read_message_id.
    last_read_message_id: int | None = None

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


class UpdateModeRequest(BaseModel):
    mode: str  # "ai" | "human"
