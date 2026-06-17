import logging

import anthropic
from app.ai.base import (
    ASSIST_PROMPT,
    AIProvider,
    _clean_assist_output,
    _clean_translate_output,
    build_translate_prompt,
)
from app.ai.prompt import build_system_prompt


class ClaudeProvider(AIProvider):
    def __init__(self, api_key: str, model: str):
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        self.model = model
        self.system_prompt = build_system_prompt()

    async def generate_reply(
        self,
        user_message: str,
        conversation_history: list[dict] | None = None,
        extra_prompt: str | None = None,
        image_urls: list[str] | None = None,
    ) -> str:
        messages = []
        if conversation_history:
            messages.extend(conversation_history)
        if image_urls:
            content_blocks: list[dict] = []
            for url in image_urls:
                content_blocks.append({
                    "type": "image",
                    "source": {"type": "url", "url": url},
                })
            content_blocks.append({"type": "text", "text": user_message or "(图片消息,无文字)"})
            messages.append({"role": "user", "content": content_blocks})
        else:
            messages.append({"role": "user", "content": user_message})

        system = self.system_prompt
        if extra_prompt:
            system += f"\n\n# Additional Instructions\n{extra_prompt}"

        response = await self.client.messages.create(
            model=self.model,
            max_tokens=1500,
            system=system,
            messages=messages,
        )
        return response.content[0].text

    async def translate_message(self, text: str) -> dict:
        prompt, source_lang = build_translate_prompt(text)
        try:
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=2048,
                messages=[{"role": "user", "content": prompt}],
            )
            translated = _clean_translate_output(response.content[0].text, text)
            return {"original": text, "translated": translated, "source_lang": source_lang}
        except Exception as e:
            logging.getLogger(__name__).warning(f"translate_message failed: {e}")
            return {"original": text, "translated": text, "source_lang": source_lang}

    async def translate_and_improve(self, text: str) -> dict:
        # Let exceptions propagate to the caller (the /assist endpoint) so a real
        # failure — e.g. a retired model 404 — surfaces to the UI instead of
        # being silently swallowed and echoed back as the unchanged input.
        response = await self.client.messages.create(
            model=self.model,
            max_tokens=2048,
            messages=[{"role": "user", "content": ASSIST_PROMPT + text}],
        )
        _l = logging.getLogger(__name__)
        _l.info(
            "translate_and_improve stop_reason=%s usage=%s",
            getattr(response, "stop_reason", None),
            getattr(response, "usage", None),
        )
        if getattr(response, "stop_reason", None) == "max_tokens":
            _l.warning("translate_and_improve hit max_tokens — output truncated")
        return _clean_assist_output(response.content[0].text, text)
