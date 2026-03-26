from app.ai.base import AIProvider
from app.ai.claude_provider import ClaudeProvider
from app.config import Settings


def create_ai_provider(settings: Settings) -> AIProvider:
    if settings.ai_provider == "claude":
        return ClaudeProvider(
            api_key=settings.anthropic_api_key,
            model=settings.ai_model,
        )
    raise ValueError(f"Unknown AI provider: {settings.ai_provider}")
