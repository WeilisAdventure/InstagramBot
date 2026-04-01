from abc import ABC, abstractmethod


class AIProvider(ABC):
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
