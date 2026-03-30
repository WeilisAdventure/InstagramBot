from pydantic import BaseModel


class SettingsResponse(BaseModel):
    ig_connection_status: str
    ig_username: str = ""
    ig_api_version: str = ""
    ai_model: str
    ai_model_provider: str
    custom_api_key: str
    custom_base_url: str
    reply_delay_seconds: int
    translation_strategy: str
    notification_enabled: bool
    notification_sound: bool
    notification_desktop: bool
    notification_title_flash: bool
    auto_reply_enabled: bool
    comment_trigger_enabled: bool


class SettingsUpdate(BaseModel):
    ai_model: str | None = None
    ai_model_provider: str | None = None
    custom_api_key: str | None = None
    custom_base_url: str | None = None
    reply_delay_seconds: int | None = None
    translation_strategy: str | None = None
    notification_enabled: bool | None = None
    notification_sound: bool | None = None
    notification_desktop: bool | None = None
    notification_title_flash: bool | None = None
    auto_reply_enabled: bool | None = None
    comment_trigger_enabled: bool | None = None


class SimulateRequest(BaseModel):
    comment_text: str
    username: str = "test_user"


class SimulateResponse(BaseModel):
    triggered: bool
    matched_rule: str | None = None
    public_reply: str | None = None
    dm_content: str | None = None
    conversation_id: int | None = None
