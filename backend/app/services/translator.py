from app.ai.base import AIProvider


class TranslatorService:
    def __init__(self, ai: AIProvider):
        self.ai = ai

    async def assist_input(self, text: str) -> dict:
        """Translate/polish user input for DM reply.
        Returns {"original": str, "improved": str, "language": "zh"|"en"}
        """
        return await self.ai.translate_and_improve(text)
