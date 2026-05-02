from pydantic import BaseModel


class SettingsResponse(BaseModel):
    ig_connection_status: str
    ig_username: str = ""
    ig_api_version: str = ""
    ai_model: str
    ai_model_provider: str
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    google_api_key: str = ""
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
    welcome_message_enabled: bool
    welcome_message_text: str
    default_conversation_mode: str = "ai"


class SettingsUpdate(BaseModel):
    ai_model: str | None = None
    ai_model_provider: str | None = None
    anthropic_api_key: str | None = None
    openai_api_key: str | None = None
    google_api_key: str | None = None
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
    welcome_message_enabled: bool | None = None
    welcome_message_text: str | None = None
    default_conversation_mode: str | None = None
