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
    ai_provider: str = "claude"
    ai_model: str = "claude-sonnet-4-20250514"

    # App
    reply_delay_seconds: int = 3
    log_level: str = "INFO"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
