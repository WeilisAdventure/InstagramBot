import openai
from app.ai.base import AIProvider
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
    ) -> str:
        system = self.system_prompt
        if extra_prompt:
            system += f"\n\n# Additional Instructions\n{extra_prompt}"
        messages = [{"role": "system", "content": system}]
        if conversation_history:
            messages.extend(conversation_history)
        messages.append({"role": "user", "content": user_message})

        response = await self.client.chat.completions.create(
            model=self.model,
            max_tokens=500,
            messages=messages,
        )
        return response.choices[0].message.content or ""

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
            response = await self.client.chat.completions.create(
                model=self.model,
                max_tokens=500,
                messages=[{"role": "user", "content": prompt}],
            )
            translated = (response.choices[0].message.content or "").strip()
            return {"original": text, "translated": translated, "source_lang": source_lang}
        except Exception:
            return {"original": text, "translated": text, "source_lang": source_lang}

    async def translate_and_improve(self, text: str) -> dict:
        prompt = (
            "Analyze the following text. If it's in Chinese, translate it to natural English "
            "suitable for an Instagram DM reply from a delivery company. If it's in English, "
            "polish and improve it for clarity and professionalism.\n\n"
            "Respond with ONE valid JSON object and NOTHING else — no markdown, no code "
            "fences, no commentary before or after.\n\n"
            'Schema: {"original": "<input>", "improved": "<output>", "language": "zh" | "en"}\n\n'
            f"Text: {text}"
        )
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                max_tokens=600,
                messages=[{"role": "user", "content": prompt}],
            )
            from app.ai.base import _parse_assist_json
            return _parse_assist_json(response.choices[0].message.content or "", text)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"translate_and_improve failed: {e}")
            return {"original": text, "improved": text, "language": "en"}
