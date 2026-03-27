from app.ai.base import AIProvider


class TranslatorService:
    def __init__(self, ai: AIProvider):
        self.ai = ai

    async def assist_input(self, text: str) -> dict:
        """Translate/polish user input for DM reply.
        Returns {"original": str, "improved": str, "language": "zh"|"en"}
        """
        return await self.ai.translate_and_improve(text)

    async def translate_message(self, text: str) -> dict:
        """Translate a message. English->Chinese or Chinese->English.
        Returns {"original": str, "translated": str, "source_lang": "en"|"zh"}
        """
        return await self.ai.translate_message(text)
