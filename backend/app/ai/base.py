import json
import logging
import re
from abc import ABC, abstractmethod

_log = logging.getLogger(__name__)


def _parse_assist_json(raw: str, original_text: str) -> dict:
    """Parse the JSON the LLM returns for translate_and_improve.

    Models routinely wrap JSON in ```json fences``` or add explanatory
    prose before/after. We strip both and salvage the first {...} block.
    Falls back to the original text + heuristic language detection so
    the caller always gets a usable dict.
    """
    text = (raw or "").strip()
    if text.startswith("```"):
        # ```json\n{...}\n```  or  ```\n{...}\n```
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```\s*$", "", text).strip()
    # Some models prepend "Here is the JSON: { ... }". Grab the first
    # balanced object.
    if not text.startswith("{"):
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            text = m.group(0)
    try:
        data = json.loads(text)
    except Exception as e:
        _log.warning(
            "assist JSON parse failed (%s); raw[:800]=%r", e, (raw or "")[:800]
        )
        return _fallback_assist(original_text)
    if not isinstance(data, dict):
        _log.warning("assist JSON not an object; raw[:800]=%r", (raw or "")[:800])
        return _fallback_assist(original_text)
    improved = data.get("improved")
    if not improved:
        _log.warning(
            "assist JSON missing 'improved'; keys=%s raw[:800]=%r",
            list(data.keys()),
            (raw or "")[:800],
        )
        improved = original_text
    elif improved.strip() == (original_text or "").strip():
        _log.warning(
            "assist 'improved' equals original; language=%s raw[:800]=%r",
            data.get("language"),
            (raw or "")[:800],
        )
    language = data.get("language") or _guess_lang(original_text)
    return {
        "original": data.get("original") or original_text,
        "improved": improved,
        "language": language,
    }


def _fallback_assist(text: str) -> dict:
    return {"original": text, "improved": text, "language": _guess_lang(text)}


_CJK_RE = re.compile(r"[一-鿿㐀-䶿]")


def _guess_lang(text: str) -> str:
    return "zh" if _CJK_RE.search(text or "") else "en"


class AIProvider(ABC):
    system_prompt: str = ""

    def reload_knowledge(
        self,
        preferences: list[str] | None = None,
        user_message: str = "",
        history: list[dict] | None = None,
    ):
        """Rebuild system prompt with manager preferences and only the
        knowledge-base sections relevant to *user_message* (plus the last
        couple of *history* turns, so short follow-ups inherit topic)."""
        from app.ai.prompt import build_system_prompt
        self.system_prompt = build_system_prompt(preferences, user_message, history)

    @abstractmethod
    async def generate_reply(
        self,
        user_message: str,
        conversation_history: list[dict] | None = None,
        extra_prompt: str | None = None,
        image_urls: list[str] | None = None,
    ) -> str:
        """Generate a reply given the user's message, optional history, and optional image URLs (multimodal)."""
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
