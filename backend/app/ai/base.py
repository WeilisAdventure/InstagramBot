from abc import ABC, abstractmethod


class AIProvider(ABC):
    system_prompt: str = ""

    def reload_knowledge(
        self,
        preferences: list[str] | None = None,
        user_message: str = "",
        history: list[dict] | None = None,
    ):
        """Rebuild system prompt with manager preferences and only the
        knowledge-base sections relevant to *user_message* (plus the last
        couple of *history* turns, so short follow-ups inherit topic)."""
        from app.ai.prompt import build_system_prompt
        self.system_prompt = build_system_prompt(preferences, user_message, history)

    @abstractmethod
    async def generate_reply(
        self,
        user_message: str,
        conversation_history: list[dict] | None = None,
        extra_prompt: str | None = None,
    ) -> str:
        """Generate a reply given the user's message and optional conversation history."""
        ...

    @abstractmethod
    async def translate_and_improve(self, text: str) -> dict:
        """Detect language, translate if Chinese, or polish if English.
        Returns {"original": str, "improved": str, "language": "zh"|"en"}
        """
        ...

    @abstractmethod
    async def translate_message(self, text: str) -> dict:
        """Translate a message between English and Chinese."""
        ...
