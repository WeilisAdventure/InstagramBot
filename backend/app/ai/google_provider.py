import logging

import google.generativeai as genai
from app.ai.base import (
    ASSIST_PROMPT,
    AIProvider,
    _clean_assist_output,
    _clean_translate_output,
    build_translate_prompt,
)
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
        image_urls: list[str] | None = None,
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
        parts: list = [user_message or "(图片消息,无文字)"]
        if image_urls:
            try:
                import httpx
                async with httpx.AsyncClient(timeout=15) as client:
                    for url in image_urls:
                        r = await client.get(url)
                        if r.status_code == 200:
                            mime = r.headers.get("content-type", "image/jpeg").split(";")[0]
                            parts.append({"mime_type": mime, "data": r.content})
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"Gemini image fetch failed: {e}")
        contents.append({"role": "user", "parts": parts})

        response = await model.generate_content_async(
            contents,
            generation_config=genai.types.GenerationConfig(max_output_tokens=8192),
        )
        return response.text or ""

    async def translate_message(self, text: str) -> dict:
        prompt, source_lang = build_translate_prompt(text)
        try:
            model = genai.GenerativeModel(model_name=self.model)
            response = await model.generate_content_async(prompt)
            translated = _clean_translate_output(response.text or "", text)
            return {"original": text, "translated": translated, "source_lang": source_lang}
        except Exception as e:
            logging.getLogger(__name__).warning(f"translate_message failed: {e}")
            return {"original": text, "translated": text, "source_lang": source_lang}

    async def translate_and_improve(self, text: str) -> dict:
        try:
            model = genai.GenerativeModel(model_name=self.model)
            response = await model.generate_content_async(ASSIST_PROMPT + text)
            return _clean_assist_output(response.text or "", text)
        except Exception as e:
            logging.getLogger(__name__).warning(f"translate_and_improve failed: {e}")
            return {"original": text, "improved": text}
