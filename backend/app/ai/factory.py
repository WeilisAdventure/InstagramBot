from app.ai.base import AIProvider
from app.config import Settings

# Model ID → (provider, display_name)
MODEL_REGISTRY = {
    # Anthropic
    "claude-sonnet-4-20250514": "anthropic",
    "claude-haiku-4-5-20251001": "anthropic",
    "claude-opus-4-6": "anthropic",
    # OpenAI
    "gpt-4o": "openai",
    "gpt-4o-mini": "openai",
    "gpt-4.1": "openai",
    "gpt-4.1-mini": "openai",
    "gpt-4.1-nano": "openai",
    "gpt-5.4": "openai",
    "gpt-5.4-mini": "openai",
    "gpt-5.4-nano": "openai",
    "o3": "openai",
    "o3-mini": "openai",
    "o4-mini": "openai",
    # Google
    "gemini-2.5-pro": "google",
    "gemini-2.5-flash": "google",
    "gemini-2.5-flash-lite": "google",
    "gemini-3.1-pro-preview": "google",
    "gemini-3-flash-preview": "google",
}


def get_provider_for_model(model_id: str, provider_override: str = "") -> str:
    """Determine which provider a model belongs to."""
    if model_id in MODEL_REGISTRY:
        return MODEL_REGISTRY[model_id]
    if provider_override:
        return provider_override
    return "anthropic"


def create_ai_provider(settings: Settings) -> AIProvider:
    """Create the default AI provider at startup."""
    return create_provider_for_model(
        model_id=settings.ai_model,
        anthropic_key=settings.anthropic_api_key,
        openai_key=getattr(settings, "openai_api_key", ""),
        openai_base_url=getattr(settings, "openai_base_url", ""),
        google_key=getattr(settings, "google_api_key", ""),
    )


def create_provider_for_model(
    model_id: str,
    anthropic_key: str = "",
    openai_key: str = "",
    openai_base_url: str = "",
    google_key: str = "",
    provider_override: str = "",
    custom_api_key: str = "",
    custom_base_url: str = "",
) -> AIProvider:
    """Create a provider instance for the given model ID."""
    provider = get_provider_for_model(model_id, provider_override)

    if provider == "openai_compatible":
        from app.ai.openai_provider import OpenAIProvider
        key = custom_api_key or openai_key
        url = custom_base_url or openai_base_url or None
        return OpenAIProvider(api_key=key, model=model_id, base_url=url)
    elif provider == "openai":
        from app.ai.openai_provider import OpenAIProvider
        key = custom_api_key or openai_key
        return OpenAIProvider(api_key=key, model=model_id, base_url=openai_base_url or None)
    elif provider == "google":
        from app.ai.google_provider import GoogleProvider
        return GoogleProvider(api_key=custom_api_key or google_key, model=model_id)
    else:
        from app.ai.claude_provider import ClaudeProvider
        return ClaudeProvider(api_key=custom_api_key or anthropic_key, model=model_id)
