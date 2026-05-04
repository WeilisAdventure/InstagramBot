import google.generativeai as genai
from app.ai.base import AIProvider
from app.ai.prompt import build_system_prompt


class GoogleProvider(AIProvider):
    def __init__(self, api_key: str, model: str):
        genai.configure(api_key=api_key)
        self.model = model
        self.api_key = api_key
        self.system_prompt = build_system_prompt()

    def _get_model(self):
        return genai.GenerativeModel(
            model_name=self.model,
            system_instruction=self.system_prompt,
        )

    async def generate_reply(
        self,
        user_message: str,
        conversation_history: list[dict] | None = None,
        extra_prompt: str | None = None,
    ) -> str:
        if extra_prompt:
            orig = self.system_prompt
            self.system_prompt += f"\n\n# Additional Instructions\n{extra_prompt}"
        model = self._get_model()
        if extra_prompt:
            self.system_prompt = orig
        # Convert history to Gemini format
        contents = []
        if conversation_history:
            for msg in conversation_history:
                role = "user" if msg["role"] == "user" else "model"
                contents.append({"role": role, "parts": [msg["content"]]})
        contents.append({"role": "user", "parts": [user_message]})

        response = await model.generate_content_async(
            contents,
            generation_config=genai.types.GenerationConfig(max_output_tokens=2000),
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
            "PRESERVE THE ORIGINAL STRUCTURE: keep the same paragraph breaks, line breaks, "
            "bullet points, and ordering as the input. Do NOT merge multiple paragraphs into "
            "a single block. Inside the JSON value use \\n for newlines.\n\n"
            "Respond with ONE valid JSON object and NOTHING else — no markdown, no code "
            "fences, no commentary before or after.\n\n"
            'Schema: {"original": "<input>", "improved": "<output>", "language": "zh" | "en"}\n\n'
            f"Text: {text}"
        )
        try:
            model = genai.GenerativeModel(model_name=self.model)
            response = await model.generate_content_async(prompt)
            from app.ai.base import _parse_assist_json
            return _parse_assist_json(response.text or "", text)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"translate_and_improve failed: {e}")
            return {"original": text, "improved": text, "language": "en"}
