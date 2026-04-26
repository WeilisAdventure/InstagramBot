"""Shared system prompt for all AI providers."""

from pathlib import Path
from app.knowledge.loader import load_knowledge_base, KNOWLEDGE_DIR

SYSTEM_PROMPT_FILE = KNOWLEDGE_DIR / "system_prompt.md"

_FALLBACK_BASE = (
    "You are a friendly and professional customer service assistant. "
    "Reply concisely and match the language the customer uses."
)


def _load_base_prompt() -> str:
    try:
        if SYSTEM_PROMPT_FILE.exists():
            content = SYSTEM_PROMPT_FILE.read_text(encoding="utf-8").strip()
            if content:
                return content
    except Exception:
        pass
    return _FALLBACK_BASE


def build_system_prompt(extra_qa: list[dict] | None = None) -> str:
    """Build the full system prompt, optionally appending filtered Q&A entries."""
    prompt = _load_base_prompt()
    knowledge = load_knowledge_base()
    if knowledge:
        prompt += f"\n\n## Knowledge Base\n\n{knowledge}"
    if extra_qa:
        qa_text = "\n\n## Additional Q&A\n\n"
        for entry in extra_qa:
            qa_text += f"Q: {entry['question']}\nA: {entry['answer']}\n\n"
        prompt += qa_text
    return prompt
