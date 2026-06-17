import logging

import openai
from app.ai.base import (
    ASSIST_PROMPT,
    AIProvider,
    _clean_assist_output,
    _clean_translate_output,
    build_translate_prompt,
)
from app.ai.prompt import build_system_prompt


class OpenAIProvider(AIProvider):
    def __init__(self, api_key: str, model: str, base_url: str | None = None):
        kwargs = {"api_key": api_key}
        if base_url:
            kwargs["base_url"] = base_url
        self.client = openai.AsyncOpenAI(**kwargs)
        self.model = model
        self.system_prompt = build_system_prompt()

    async def generate_reply(
        self,
        user_message: str,
        conversation_history: list[dict] | None = None,
        extra_prompt: str | None = None,
        image_urls: list[str] | None = None,
    ) -> str:
        system = self.system_prompt
        if extra_prompt:
            system += f"\n\n# Additional Instructions\n{extra_prompt}"
        messages = [{"role": "system", "content": system}]
        if conversation_history:
            messages.extend(conversation_history)
        if image_urls:
            parts: list[dict] = [{"type": "text", "text": user_message or "(图片消息,无文字)"}]
            for url in image_urls:
                parts.append({"type": "image_url", "image_url": {"url": url}})
            messages.append({"role": "user", "content": parts})
        else:
            messages.append({"role": "user", "content": user_message})

        response = await self.client.chat.completions.create(
            model=self.model,
            max_completion_tokens=1500,
            messages=messages,
        )
        return response.choices[0].message.content or ""

    async def translate_message(self, text: str) -> dict:
        prompt, source_lang = build_translate_prompt(text)
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                max_completion_tokens=2048,
                messages=[{"role": "user", "content": prompt}],
            )
            translated = _clean_translate_output(response.choices[0].message.content or "", text)
            return {"original": text, "translated": translated, "source_lang": source_lang}
        except Exception as e:
            logging.getLogger(__name__).warning(f"translate_message failed: {e}")
            return {"original": text, "translated": text, "source_lang": source_lang}

    async def translate_and_improve(self, text: str) -> dict:
        # Let exceptions propagate to the caller (the /assist endpoint) so a real
        # failure — e.g. a retired model 404 — surfaces to the UI instead of
        # being silently swallowed and echoed back as the unchanged input.
        response = await self.client.chat.completions.create(
            model=self.model,
            max_completion_tokens=2048,
            messages=[{"role": "user", "content": ASSIST_PROMPT + text}],
        )
        return _clean_assist_output(response.choices[0].message.content or "", text)
