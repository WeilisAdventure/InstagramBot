import google.generativeai as genai
from app.ai.base import AIProvider
from app.knowledge.loader import load_knowledge_base


class GoogleProvider(AIProvider):
    def __init__(self, api_key: str, model: str):
        genai.configure(api_key=api_key)
        self.model = model
        self.api_key = api_key
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
        self.system_prompt = self._build_system_prompt()
        if extra_qa:
            qa_text = "\n\n# Additional Q&A\n\n"
            for entry in extra_qa:
                qa_text += f"Q: {entry['question']}\nA: {entry['answer']}\n\n"
            self.system_prompt += qa_text

    def _get_model(self):
        return genai.GenerativeModel(
            model_name=self.model,
            system_instruction=self.system_prompt,
        )

    async def generate_reply(
        self,
        user_message: str,
        conversation_history: list[dict] | None = None,
    ) -> str:
        model = self._get_model()
        # Convert history to Gemini format
        contents = []
        if conversation_history:
            for msg in conversation_history:
                role = "user" if msg["role"] == "user" else "model"
                contents.append({"role": role, "parts": [msg["content"]]})
        contents.append({"role": "user", "parts": [user_message]})

        response = await model.generate_content_async(
            contents,
            generation_config=genai.types.GenerationConfig(max_output_tokens=500),
        )
        return response.text or ""

    async def translate_message(self, text: str) -> dict:
        import re
        has_cjk = bool(re.search(r'[\u4e00-\u9fff\u3400-\u4dbf]', text))
        source_lang = "zh" if has_cjk else "en"
        direction = (
            "Translate the following Chinese text to English."
            if source_lang == "zh"
            else "Translate the following English text to Chinese."
        )
        prompt = f"{direction}\n\nRespond with ONLY the translated text, no explanations.\n\nText: {text}"
        try:
            model = genai.GenerativeModel(model_name=self.model)
            response = await model.generate_content_async(prompt)
            translated = (response.text or "").strip()
            return {"original": text, "translated": translated, "source_lang": source_lang}
        except Exception:
            return {"original": text, "translated": text, "source_lang": source_lang}

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
            model = genai.GenerativeModel(model_name=self.model)
            response = await model.generate_content_async(prompt)
            import json
            return json.loads(response.text or "{}")
        except Exception:
            return {"original": text, "improved": text, "language": "en"}
