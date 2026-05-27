import logging
import re
from abc import ABC, abstractmethod

_log = logging.getLogger(__name__)


ASSIST_PROMPT = (
    "You will receive a message that a delivery-company operator wants to "
    "send as an Instagram DM. If it is Chinese, translate it into natural, "
    "professional English. If it is already English, polish it for clarity "
    "and professionalism.\n\n"
    "PRESERVE THE ORIGINAL STRUCTURE: keep the same paragraph breaks, line "
    "breaks, bullet points, and ordering as the input. Do NOT merge multiple "
    "paragraphs into a single block.\n\n"
    "Respond with ONLY the rewritten message text — no quotes around it, no "
    "JSON, no markdown code fences, no commentary, no labels like "
    "'Translation:' or 'Here is...'.\n\n"
    "Message:\n"
)


def _clean_assist_output(raw: str, original_text: str) -> dict:
    """Normalize the model's plain-text rewrite into the API response shape.
    Strips accidental code fences and a single layer of wrapping quotes; on
    empty output falls back to the original so the caller always gets a
    usable string."""
    text = (raw or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```\s*$", "", text).strip()
    if len(text) >= 2 and text[0] in '"“' and text[-1] in '"”':
        text = text[1:-1].strip()
    if not text:
        _log.warning("assist returned empty output; raw[:400]=%r", (raw or "")[:400])
        text = original_text
    elif text.strip() == (original_text or "").strip():
        _log.warning(
            "assist output equals original input; raw[:400]=%r", (raw or "")[:400]
        )
    return {"original": original_text, "improved": text}


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
        """Translate Chinese -> English, or polish English in place.
        Returns {"original": str, "improved": str}.
        """
        ...

    @abstractmethod
    async def translate_message(self, text: str) -> dict:
        """Translate a message between English and Chinese."""
        ...
