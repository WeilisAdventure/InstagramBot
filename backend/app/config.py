from pydantic_settings import BaseSettings
from typing import Literal


class Settings(BaseSettings):
    # Instagram mode
    ig_mode: Literal["instagrapi", "graph_api"] = "instagrapi"

    # Instagrapi mode
    ig_username: str = ""
    ig_password: str = ""
    ig_session_file: str = "session.json"
    poll_interval: int = 20

    # Graph API mode
    instagram_page_access_token: str = ""
    instagram_app_secret: str = ""
    instagram_verify_token: str = ""
    instagram_account_id: str = ""

    # AI
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    openai_base_url: str = ""
    google_api_key: str = ""
    ai_provider: str = "claude"
    ai_model: str = "claude-sonnet-4-20250514"

    # Auth
    admin_password: str = "admin123"
    auth_secret_key: str = "change-me-to-a-random-string"

    # Tidio (multi-channel, PR 4+)
    # Default off so a fresh deploy doesn't try to talk to Tidio. Flip to
    # `true` in .env once the OpenAPI client + webhook are configured.
    tidio_enabled: bool = False
    tidio_client_id: str = ""
    tidio_client_secret: str = ""
    # Per-webhook signing secret from the Tidio dashboard. When empty we
    # log a warning and accept payloads anyway (dev convenience), mirroring
    # the existing Instagram webhook behavior. Set this before going live.
    tidio_webhook_secret: str = ""
    # The operator account whose name shows up on the reply. Optional in
    # the Tidio API; if empty, Tidio picks a default. Configure a dedicated
    # "AI Bot" operator before production use.
    tidio_operator_id: str = ""
    tidio_api_base: str = "https://api.tidio.com"

    # App
    reply_delay_seconds: int = 3
    log_level: str = "INFO"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
