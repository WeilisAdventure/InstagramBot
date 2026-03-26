import anthropic
from app.ai.base import AIProvider
from app.knowledge.loader import load_knowledge_base


class ClaudeProvider(AIProvider):
    def __init__(self, api_key: str, model: str):
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        self.model = model
        self.system_prompt = self._build_system_prompt()

    def _build_system_prompt(self) -> str:
        knowledge = load_knowledge_base()
        base = (
            "You are a customer service assistant for a delivery company. "
            "Answer questions based on the knowledge base below. "
            "Be friendly, concise, and professional. Keep replies under 150 words."
        )
        if knowledge:
            return f"{base}\n\n# Knowledge Base\n\n{knowledge}"
        return base

    def reload_knowledge(self, extra_qa: list[dict] | None = None):
        """Reload knowledge base, optionally appending DB-stored Q&A entries."""
        self.system_prompt = self._build_system_prompt()
        if extra_qa:
            qa_text = "\n\n# Additional Q&A\n\n"
            for entry in extra_qa:
                qa_text += f"Q: {entry['question']}\nA: {entry['answer']}\n\n"
            self.system_prompt += qa_text

    async def generate_reply(
        self,
        user_message: str,
        conversation_history: list[dict] | None = None,
    ) -> str:
        messages = []
        if conversation_history:
            messages.extend(conversation_history)
        messages.append({"role": "user", "content": user_message})

        try:
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=500,
                system=self.system_prompt,
                messages=messages,
            )
            return response.content[0].text
        except anthropic.APIError as e:
            return f"Sorry, I'm having trouble right now. Please try again shortly. (Error: {e})"

    async def translate_and_improve(self, text: str) -> dict:
        prompt = (
            "Analyze the following text. If it's in Chinese, translate it to natural English "
            "suitable for an Instagram DM reply from a delivery company. If it's in English, "
            "polish and improve it for clarity and professionalism.\n\n"
            "Respond in this exact JSON format:\n"
            '{"original": "<the input text>", "improved": "<the translated or polished text>", "language": "<zh or en>"}\n\n'
            f"Text: {text}"
        )
        try:
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=300,
                messages=[{"role": "user", "content": prompt}],
            )
            import json
            return json.loads(response.content[0].text)
        except Exception:
            return {"original": text, "improved": text, "language": "en"}
